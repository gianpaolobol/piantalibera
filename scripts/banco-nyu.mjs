// Banco su foto vere con misure vere (NYU Depth V2, estratto da scripts/nyu-estrai.py): ricostruzione automatica
// con il codice vero dell'editor nel browser, senza analisi del server (niente Neurons: solo modelli nel dispositivo),
// e confronto con le misure del Kinect in un riferimento allineato alla gravità:
//   riconoscimento (riquadri 2D della stessa famiglia, IoU ≥ 0,3) e posizione in pianta rispetto alla fotocamera
//   (destra, avanti), quote e larghezze di porte, finestre e arredi.
// La misura nota data all'editor è l'altezza della fotocamera (come se l'utente la indicasse); il campo visivo è
// quello dell'EXIF. Uso: node scripts/banco-nyu.mjs cartella [n]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, parseDetections } from "../shared/photo.js";
import { join } from "node:path";

const DIR = process.argv[2], N = Number(process.argv[3] || 120), IMGS = Number(process.env.IMGS || 6);
const MODE = process.env.MODO || "base";
const VAR = { seg: process.env.SEG || null, det: process.env.DET || null, detMin: Number(process.env.DETMIN || 0) || null, detDtype: process.env.DETDTYPE || null, sam: process.env.SAM === "1", flip: process.env.FLIP === "1" };   // base · profondita (solo dispositivo) · cloudflare (solo server) · combinato
/* analisi di Cloudflare (Llama 4 Scout + DETR, la stessa chiamata di /api/foto), salvata per non rifarla */
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN, AN_DIR = process.env.ANALISI || join(process.env.HOME || ".", "nyu-analisi");
const cfRun = async (model, input) => { const t0 = Date.now(), r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }); const j = await r.json(); if (!j.success) throw new Error(JSON.stringify(j.errors).slice(0, 200)); return { ...j.result, _ms: Date.now() - t0 }; };
let neuronsSpent = 0;
async function cfAnalysis(key, photo, W, H) {
  mkdirSync(AN_DIR, { recursive: true }); const f = join(AN_DIR, key + ".json");
  if (!existsSync(f)) {
    if (!TOK) return null;
    const buf = Buffer.from(photo.split(",")[1], "base64");
    const [vis, det] = await Promise.all([cfRun("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: photoMessages(photo), max_tokens: 3000, temperature: .15, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA } }), cfRun("@cf/facebook/detr-resnet-50", { image: [...buf] })]);
    neuronsSpent += vis?.usage?.neurons || 0;
    writeFileSync(f, JSON.stringify({ raw: extractJson(vis), det, neurons: vis?.usage?.neurons, ms: Math.max(vis._ms, det._ms) }));
  }
  const fx = JSON.parse(readFileSync(f, "utf8"));
  try { return { a: normalizeAnalysis(fx.raw, parseDetections(fx.det, W, H), W, H), neurons: fx.neurons, ms: fx.ms }; } catch { return null; }
}

/* famiglie per il confronto */
const FAM = c => ({ porta: "porta", porta_scorrevole: "porta", finestra: "finestra", portafinestra: "finestra",
  letto: "letto", letto_matrimoniale: "letto", letto_singolo: "letto", divano: "sedute", divano_angolare: "sedute", poltrona: "sedute", pouf: "sedute",
  sedia: "sedie", sedia_ufficio: "sedie", sgabello: "sedie", tavolo: "tavolo", tavolo_tondo: "tavolo", scrivania: "tavolo", tavolino: "tavolino", tavolino_tondo: "tavolino",
  comodino: "comodino", lampada: "lampada", lampada_terra: "lampada", lampadario: "lampada", plafoniera: "lampada", applique: "lampada",
  cassettiera: "contenitori", madia: "contenitori", libreria: "contenitori", armadio: "contenitori", mobile_tv: "tv", tv: "tv",
  wc: "wc", lavabo: "lavabo", frigorifero: "frigorifero", vasca: "vasca", cucina: "cucina", piano: "cucina", isola: "cucina" }[c] || null);
const famOk = (pred, gtCat) => FAM(pred) === FAM(gtCat) || (pred === "portafinestra" && FAM(gtCat) === "porta") || (FAM(pred) === "cucina" && FAM(gtCat) === "contenitori");   // portafinestra = anche porta; i mobili della cucina componibile = mobili (NYU li chiama cabinet)
const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };

/* ricostruzione nella pagina: posizioni riportate al riferimento della fotocamera (destra, avanti) */
const RECON = async function ({ photo, W, H, hfov, camH, mode, modello, parts, analysis, diagBoxes, variants }) {
  if (variants?.seg) F3_SEGCFG.model = variants.seg; if (variants?.det) F3_DET.model = variants.det; if (variants?.detMin) F3_DET.min = variants.detMin; if (variants?.detDtype) F3_DET.dtype = variants.detDtype; F3_SAM.on = !!variants?.sam; F3_DET.flip = !!variants?.flip;
  const deep = mode === "profondita" || mode === "combinato", cloud = mode === "cloudflare" || mode === "combinato"; F3_DEPTH.on = deep; F3_DET.on = deep; if (modello) Object.assign(F3_DEPTH, { base: modello, parts });
  Object.assign(F3, { img: photo, thumb: photo, w: W, h: H, name: "nyu", exifFov: hfov, seg: null, a: null, quadSource: "", fitFov: null });
  // senza profondità l'utente indica l'altezza della fotocamera; con la profondità nessuna misura
  // con Cloudflare la misura viene dall'altezza della stanza stimata dal modello (nessuna misura dell'utente)
  F3.opts = deep || cloud ? { refKind: "ceil", refVal: 2.7, fov: null, depth: null, ceil: true } : { refKind: "cam", refVal: camH, fov: null, depth: null, ceil: true };
  const t0 = performance.now(); if (mode !== "cloudflare") await f3Segment(); const tSeg = performance.now() - t0;
  f3Accept({ analysis: cloud ? analysis : { items: [], room: {}, back_wall: null } }); if (!deep && !cloud){ F3.opts.refKind = "cam"; F3.opts.refVal = camH; }
  const dinfo = { tSeg: Math.round(tSeg), depth: F3.seg?.depth ? { err: F3.seg.depth.err, h: F3.seg.depth.G?.h, pitch: F3.seg.depth.G?.pitch, hfov: F3.seg.depth.hfov, room: F3.seg.depth.R ? { db: F3.seg.depth.R.db, dl: F3.seg.depth.R.dl, dr: F3.seg.depth.R.dr, H: F3.seg.depth.R.H } : null } : null, ref: F3.opts.refKind + " " + F3.opts.refVal };
  const items = F3.items.map(i => ({ cat: i.category, on: i.on, src: i.source, box: i.box }));
  // diagnosi: etichette della segmentazione dentro un riquadro (per capire porte e cucine mancate)
  const mp = F3.seg?.m; const labelsIn = b => { if (!mp) return null; const cnt = {}; let n = 0; for (let y = Math.floor(b[1] * mp.h); y < Math.ceil(b[3] * mp.h); y++) for (let x = Math.floor(b[0] * mp.w); x < Math.ceil(b[2] * mp.w); x++) { const l = mp.lab[y * mp.w + x]; const nm = l === 255 ? "-" : mp.names[l]; cnt[nm] = (cnt[nm] || 0) + 1; n++; } return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(", "); };
  const diag = (diagBoxes || []).map(d => ({ ...d, labels: labelsIn(d.box), dets: (F3.seg?.dets || []).filter(x => Math.max(0, Math.min(x.box[2], d.box[2]) - Math.max(x.box[0], d.box[0])) * Math.max(0, Math.min(x.box[3], d.box[3]) - Math.max(x.box[1], d.box[1])) > 0).map(x => `${x.category} ${x.score.toFixed(2)}`).join(", ") }));
  const s = f3Solve(); if (!s.ok) return { ok: false, err: s.err, items, diag, segState: F3.seg?.state, quadSource: F3.quadSource, ...dinfo };
  const lay = f3Layout(s), fw0 = s.ray(.5, .5), fl = Math.hypot(fw0[0], fw0[1]) || 1, fw = [fw0[0] / fl, fw0[1] / fl], rl = Math.hypot(s.right[0], s.right[1]) || 1, rt = [s.right[0] / rl, s.right[1] / rl];
  const rel = (x, y) => { const d = [x - s.c[0], y - s.c[1]]; return { r: +(d[0] * rt[0] + d[1] * rt[1]).toFixed(3), f: +(d[0] * fw[0] + d[1] * fw[1]).toFixed(3) }; };
  const opC = o => o.wall === "back" ? [o.t, 0] : o.wall === "left" ? [0, s.D - o.t] : [s.W, o.t];
  return { ok: true, diag, ...dinfo, hc: s.hc, segState: F3.seg?.state, quadSource: F3.quadSource, pitch: +(s.p * 180 / Math.PI).toFixed(2), W: s.W, D: s.D, Hh: s.H, items,
    openings: lay.openings.map(o => ({ cat: o.it.category, ...rel(...opC(o)), w: o.w, zmin: o.sill, zmax: +(o.sill + o.h).toFixed(2), box: o.it.box })),
    objects: lay.objects.map(o => ({ cat: o.cat || o.it.category, ...rel(o.x, o.y), vis: o.vis ? rel(...o.vis) : null, box: o.it.box })) };
};

/* ---------- misura ---------- */
function score(gt, r) {
  const out = { key: gt.key, ok: r.ok, dPitch: r.ok ? +(r.pitch - gt.pitch).toFixed(1) : null, rec: [], pos: [], ops: [] };
  const gts = gt.objects.filter(o => FAM(o.cat) && o.px >= 2500);
  // riconoscimento: riquadro 2D della stessa famiglia
  const used = new Set();
  for (const g of gts) {
    let best = 0, bi = -1; r.items.forEach((it, i) => { if (used.has(i) || !it.on || !famOk(it.cat, g.cat)) return; const v = iou(it.box, g.box); if (v > best) { best = v; bi = i; } });
    const hit = best >= .3; if (hit) used.add(bi); out.rec.push({ fam: FAM(g.cat), hit, vis: !g.cut && g.px >= 4000 });
  }
  out.falsi = r.items.filter((it, i) => it.on && FAM(it.cat) && !used.has(i)).length;
  if (!r.ok) return out;
  // posizione in pianta e misure
  const all = [...r.openings, ...r.objects], usedP = new Set();
  for (const g of gts) {
    let best = null; all.forEach((o, i) => { if (usedP.has(i) || !famOk(o.cat, g.cat)) return; const d = Math.hypot(o.r - g.r, o.f - g.f); if (!best || d < best.d) best = { d, i, o }; });
    if (!best || best.d > 1.5) { out.pos.push({ fam: FAM(g.cat), found: false }); continue; }
    usedP.add(best.i); const o = best.o, dist = Math.hypot(g.r, g.f);
    const dv = o.vis ? Math.hypot(o.vis.r - g.r, o.vis.f - g.f) : best.d;
    out.pos.push({ vis: !g.cut && g.px >= 4000, fam: FAM(g.cat), found: true, dv: +dv.toFixed(2), d: +best.d.toFixed(2), rel: +(best.d / dist).toFixed(3), dr: +(o.r - g.r).toFixed(2), df: +(o.f - g.f).toFixed(2) });
    if (/porta|finestra/.test(FAM(g.cat)) && !g.cut) out.ops.push({ fam: FAM(g.cat), dw: +(o.w - g.w).toFixed(2), dzmin: FAM(g.cat) === "finestra" ? +(o.zmin - g.zmin).toFixed(2) : null, dzmax: +(o.zmax - g.zmax).toFixed(2) });
  }
  return out;
}

/* ---------- giro ---------- */
const srv = spawn(process.execPath, ["server/local-server.mjs"], { env: { ...process.env, PORT: "8799" }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", e => console.log("errore pagina:", e.message));
if (process.env.PL_LOCAL_THREE) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => { const f = join(process.env.PL_LOCAL_THREE, r.request().url().split("three@0.147.0/")[1]); return existsSync(f) ? r.fulfill({ body: readFileSync(f), contentType: "application/javascript" }) : r.abort(); });
await page.goto("http://127.0.0.1:8799/?nosw"); await page.waitForFunction(() => typeof f3Solve === "function" && typeof P !== "undefined" && P);
const keys = readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort().slice(0, N), rows = [];
for (const [k, key] of keys.entries()) {
  const gt = JSON.parse(readFileSync(join(DIR, key + ".json"), "utf8")), photo = "data:image/jpeg;base64," + readFileSync(join(DIR, key + ".jpg")).toString("base64");
  let analysis = null, cfMs = 0;
  if (MODE === "cloudflare" || MODE === "combinato") { const c = await cfAnalysis(key, photo, gt.W, gt.H); if (!c) { console.log(`## ${key}: analisi Cloudflare non disponibile`); continue; } analysis = c.a; cfMs = c.ms || 0; }
  const t0 = Date.now(), r = await page.evaluate(`(${RECON})(${JSON.stringify({ photo, W: gt.W, H: gt.H, hfov: gt.hfov, camH: gt.cam_h, mode: MODE, variants: VAR, analysis, diagBoxes: gt.objects.filter(o => /porta|cucina|piano|madia|finestra/.test(o.cat) && o.px >= 2500).map(o => ({ cat: o.cat, name: o.name, box: o.box })), modello: process.env.MODELLO, parts: Number(process.env.PARTI || 0) || undefined })})`);
  const sc = score(gt, r); sc.ms = Date.now() - t0 + cfMs; sc.dHc = r.ok ? +(r.hc - gt.cam_h).toFixed(3) : null; rows.push(sc);
  for (const d of r.diag || []) { const hit = (r.items || []).some(it => it.on && FAM(it.cat) === FAM(d.cat) && iou(it.box, d.box) >= .3); console.log(`   diag ${hit ? "OK" : "MANCA"} ${d.name}: ${d.labels} · rilevatore: ${d.dets || "-"}`); }
  console.log(`## ${key} ${gt.scene} · h ${gt.cam_h} incl ${gt.pitch} roll ${gt.roll} · ${r.ok ? "ok" : "NO " + r.err} · spigoli ${r.quadSource} · incl ${r.pitch} · h ${r.hc?.toFixed?.(2)} · ${r.tSeg} ms${r.depth ? " · profondità " + JSON.stringify(r.depth) : ""}`);
  console.log(`   veri: ${gt.objects.filter(o => FAM(o.cat) && o.px >= 2500).map(o => `${o.cat}@${o.r.toFixed(1)},${o.f.toFixed(1)}`).join(" ")}`);
  if (r.ok) console.log(`   trovati: ${[...r.openings, ...r.objects].map(o => `${o.cat}@${o.r.toFixed(1)},${o.f.toFixed(1)}`).join(" ")}`);
  if (k < IMGS) {
    const img = await page.evaluate(({ photo, gt, items, FAMS }) => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = 640; c.height = Math.round(640 * gt.H / gt.W); const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height);
      const box = (b, col, t, dash) => { g.setLineDash(dash ? [6, 4] : []); g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(b[0] * c.width, b[1] * c.height, (b[2] - b[0]) * c.width, (b[3] - b[1]) * c.height); g.fillStyle = col; g.font = "12px sans-serif"; g.fillText(t, b[0] * c.width + 2, b[1] * c.height + 12); };
      for (const o of gt.objects) if (FAMS.includes(o.cat)) box(o.box, "#0c0", o.cat, true);
      for (const it of items) if (it.on) box(it.box, /porta|finestra/.test(it.cat) ? "#e23" : "#fb3", it.cat, false);
      ok(c.toDataURL("image/jpeg", .75)); }; im.src = photo; }), { photo, gt, items: r.items || [], FAMS: gt.objects.filter(o => FAM(o.cat) && o.px >= 2500).map(o => o.cat) });
    console.log(`===IMG=== ${key}\n${img.split(",")[1]}\n===FINE===`);
  }
}
/* riepilogo: gruppo di sviluppo (si migliora guardando questo) e gruppo di verifica (mai usato per scegliere), più il totale */
const isTest = k => [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 3 === 0;
const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null, med = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null, abs = a => a.map(Math.abs);
function summary(rows, gruppo) {
const rec = rows.flatMap(r => r.rec), pos = rows.flatMap(r => r.pos), ops = rows.flatMap(r => r.ops), fams = [...new Set(rec.map(x => x.fam))].sort();
const perFam = Object.fromEntries(fams.map(f => { const a = rec.filter(x => x.fam === f), p = pos.filter(x => x.fam === f && x.found); return [f, `${a.filter(x => x.hit).length}/${a.length} riconosciuti, ${p.length} collocati, errore ${med(p.map(x => x.d)) ?? "-"} m`]; }));
const found = pos.filter(x => x.found);
const sum = { modo: MODE, gruppo, varianti: VAR, foto: rows.length, risolte: rows.filter(r => r.ok).length, inclinazione_err: mean(abs(rows.filter(r => r.ok).map(r => r.dPitch))), altezza_fotocamera_err_m: mean(abs(rows.filter(r => r.ok).map(r => r.dHc))),
  riconoscimento: `${rec.filter(x => x.hit).length}/${rec.length}`, falsi_positivi: rows.reduce((s, r) => s + r.falsi, 0),
  collocati: `${found.length}/${pos.length}`, errore_pianta_mediana_m: med(found.map(x => x.d)), errore_pianta_relativo_mediana: med(found.map(x => x.rel)), errore_parte_visibile_mediana_m: med(found.map(x => x.dv)),
  errore_laterale_m: mean(abs(found.map(x => x.dr))), errore_profondita_m: mean(abs(found.map(x => x.df))),
  aperture_larghezza_m: mean(abs(ops.map(x => x.dw))), finestre_davanzale_m: mean(abs(ops.filter(x => x.dzmin != null).map(x => x.dzmin))), aperture_sommita_m: mean(abs(ops.map(x => x.dzmax))),
  tempo_medio_s: mean(rows.map(r => r.ms / 1000)), neurons_spesi: Math.round(neuronsSpent), famiglie: perFam };
  sum.ben_visibili = `${rec.filter(x => x.vis && x.hit).length}/${rec.filter(x => x.vis).length}`; sum.ben_visibili_errore_m = med(found.filter(x => x.vis).map(x => x.d));
  return sum;
}
for (const [g, rs] of [["sviluppo", rows.filter(r => !isTest(r.key))], ["verifica", rows.filter(r => isTest(r.key))], ["tutte", rows]]) console.log("=== RIEPILOGO " + JSON.stringify(summary(rs, g), null, 1));
await browser.close(); srv.kill();
