// Banco su foto vere con misure vere (NYU Depth V2, estratto da scripts/nyu-estrai.py): ricostruzione automatica
// con il codice vero dell'editor nel browser, senza analisi del server (niente Neurons: solo modelli nel dispositivo),
// e confronto con le misure del Kinect in un riferimento allineato alla gravità:
//   riconoscimento (riquadri 2D della stessa famiglia, IoU ≥ 0,3) e posizione in pianta rispetto alla fotocamera
//   (destra, avanti), quote e larghezze di porte, finestre e arredi.
// La misura nota data all'editor è l'altezza della fotocamera (come se l'utente la indicasse); il campo visivo è
// quello dell'EXIF. Uso: node scripts/banco-nyu.mjs cartella [n]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2], N = Number(process.argv[3] || 80), IMGS = Number(process.env.IMGS || 6);
const MODE = process.env.MODO || "base";

/* famiglie per il confronto */
const FAM = c => ({ porta: "porta", porta_scorrevole: "porta", finestra: "finestra", portafinestra: "finestra",
  letto: "letto", letto_matrimoniale: "letto", letto_singolo: "letto", divano: "sedute", divano_angolare: "sedute", poltrona: "sedute", pouf: "sedute",
  sedia: "sedie", sedia_ufficio: "sedie", sgabello: "sedie", tavolo: "tavolo", tavolo_tondo: "tavolo", scrivania: "tavolo", tavolino: "tavolino", tavolino_tondo: "tavolino",
  comodino: "comodino", lampada: "lampada", lampada_terra: "lampada", lampadario: "lampada", plafoniera: "lampada", applique: "lampada",
  cassettiera: "contenitori", madia: "contenitori", libreria: "contenitori", armadio: "contenitori", mobile_tv: "tv", tv: "tv",
  wc: "wc", lavabo: "lavabo", frigorifero: "frigorifero", vasca: "vasca", cucina: "cucina", piano: "cucina", isola: "cucina" }[c] || null);
const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };

/* ricostruzione nella pagina: posizioni riportate al riferimento della fotocamera (destra, avanti) */
const RECON = async function ({ photo, W, H, hfov, camH, mode, modello, parts }) {
  const deep = mode === "profondita"; F3_DEPTH.on = deep; if (modello) Object.assign(F3_DEPTH, { base: modello, parts });
  Object.assign(F3, { img: photo, thumb: photo, w: W, h: H, name: "nyu", exifFov: hfov, seg: null, a: null, quadSource: "", fitFov: null });
  // senza profondità l'utente indica l'altezza della fotocamera; con la profondità nessuna misura
  F3.opts = deep ? { refKind: "ceil", refVal: 2.7, fov: null, depth: null, ceil: true } : { refKind: "cam", refVal: camH, fov: null, depth: null, ceil: true };
  const t0 = performance.now(); await f3Segment(); const tSeg = performance.now() - t0;
  f3Accept({ analysis: { items: [], room: {}, back_wall: null } }); if (!deep){ F3.opts.refKind = "cam"; F3.opts.refVal = camH; }
  const dinfo = { tSeg: Math.round(tSeg), depth: F3.seg?.depth ? { err: F3.seg.depth.err, h: F3.seg.depth.G?.h, pitch: F3.seg.depth.G?.pitch, hfov: F3.seg.depth.hfov, room: F3.seg.depth.R ? { db: F3.seg.depth.R.db, dl: F3.seg.depth.R.dl, dr: F3.seg.depth.R.dr, H: F3.seg.depth.R.H } : null } : null, ref: F3.opts.refKind + " " + F3.opts.refVal };
  const items = F3.items.map(i => ({ cat: i.category, on: i.on, src: i.source, box: i.box }));
  const s = f3Solve(); if (!s.ok) return { ok: false, err: s.err, items, segState: F3.seg?.state, quadSource: F3.quadSource, ...dinfo };
  const lay = f3Layout(s), fw0 = s.ray(.5, .5), fl = Math.hypot(fw0[0], fw0[1]) || 1, fw = [fw0[0] / fl, fw0[1] / fl], rl = Math.hypot(s.right[0], s.right[1]) || 1, rt = [s.right[0] / rl, s.right[1] / rl];
  const rel = (x, y) => { const d = [x - s.c[0], y - s.c[1]]; return { r: +(d[0] * rt[0] + d[1] * rt[1]).toFixed(3), f: +(d[0] * fw[0] + d[1] * fw[1]).toFixed(3) }; };
  const opC = o => o.wall === "back" ? [o.t, 0] : o.wall === "left" ? [0, s.D - o.t] : [s.W, o.t];
  return { ok: true, ...dinfo, hc: s.hc, segState: F3.seg?.state, quadSource: F3.quadSource, pitch: +(s.p * 180 / Math.PI).toFixed(2), W: s.W, D: s.D, Hh: s.H, items,
    openings: lay.openings.map(o => ({ cat: o.it.category, ...rel(...opC(o)), w: o.w, zmin: o.sill, zmax: +(o.sill + o.h).toFixed(2), box: o.it.box })),
    objects: lay.objects.map(o => ({ cat: o.cat || o.it.category, ...rel(o.x, o.y), box: o.it.box })) };
};

/* ---------- misura ---------- */
function score(gt, r) {
  const out = { key: gt.key, ok: r.ok, dPitch: r.ok ? +(r.pitch - gt.pitch).toFixed(1) : null, rec: [], pos: [], ops: [] };
  const gts = gt.objects.filter(o => FAM(o.cat) && o.px >= 2500);
  // riconoscimento: riquadro 2D della stessa famiglia
  const used = new Set();
  for (const g of gts) {
    let best = 0, bi = -1; r.items.forEach((it, i) => { if (used.has(i) || !it.on || FAM(it.cat) !== FAM(g.cat)) return; const v = iou(it.box, g.box); if (v > best) { best = v; bi = i; } });
    const hit = best >= .3; if (hit) used.add(bi); out.rec.push({ fam: FAM(g.cat), hit });
  }
  out.falsi = r.items.filter((it, i) => it.on && FAM(it.cat) && !used.has(i)).length;
  if (!r.ok) return out;
  // posizione in pianta e misure
  const all = [...r.openings, ...r.objects], usedP = new Set();
  for (const g of gts) {
    let best = null; all.forEach((o, i) => { if (usedP.has(i) || FAM(o.cat) !== FAM(g.cat)) return; const d = Math.hypot(o.r - g.r, o.f - g.f); if (!best || d < best.d) best = { d, i, o }; });
    if (!best || best.d > 1.5) { out.pos.push({ fam: FAM(g.cat), found: false }); continue; }
    usedP.add(best.i); const o = best.o, dist = Math.hypot(g.r, g.f);
    out.pos.push({ fam: FAM(g.cat), found: true, d: +best.d.toFixed(2), rel: +(best.d / dist).toFixed(3), dr: +(o.r - g.r).toFixed(2), df: +(o.f - g.f).toFixed(2) });
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
  const t0 = Date.now(), r = await page.evaluate(`(${RECON})(${JSON.stringify({ photo, W: gt.W, H: gt.H, hfov: gt.hfov, camH: gt.cam_h, mode: MODE, modello: process.env.MODELLO, parts: Number(process.env.PARTI || 0) || undefined })})`);
  const sc = score(gt, r); sc.ms = Date.now() - t0; sc.dHc = r.ok ? +(r.hc - gt.cam_h).toFixed(3) : null; rows.push(sc);
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
/* riepilogo */
const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null, med = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null, abs = a => a.map(Math.abs);
const rec = rows.flatMap(r => r.rec), pos = rows.flatMap(r => r.pos), ops = rows.flatMap(r => r.ops), fams = [...new Set(rec.map(x => x.fam))].sort();
const perFam = Object.fromEntries(fams.map(f => { const a = rec.filter(x => x.fam === f), p = pos.filter(x => x.fam === f && x.found); return [f, `${a.filter(x => x.hit).length}/${a.length} riconosciuti, ${p.length} collocati, errore ${med(p.map(x => x.d)) ?? "-"} m`]; }));
const found = pos.filter(x => x.found);
const sum = { modo: MODE, foto: rows.length, risolte: rows.filter(r => r.ok).length, inclinazione_err: mean(abs(rows.filter(r => r.ok).map(r => r.dPitch))), altezza_fotocamera_err_m: mean(abs(rows.filter(r => r.ok).map(r => r.dHc))),
  riconoscimento: `${rec.filter(x => x.hit).length}/${rec.length}`, falsi_positivi: rows.reduce((s, r) => s + r.falsi, 0),
  collocati: `${found.length}/${pos.length}`, errore_pianta_mediana_m: med(found.map(x => x.d)), errore_pianta_relativo_mediana: med(found.map(x => x.rel)),
  errore_laterale_m: mean(abs(found.map(x => x.dr))), errore_profondita_m: mean(abs(found.map(x => x.df))),
  aperture_larghezza_m: mean(abs(ops.map(x => x.dw))), finestre_davanzale_m: mean(abs(ops.filter(x => x.dzmin != null).map(x => x.dzmin))), aperture_sommita_m: mean(abs(ops.map(x => x.dzmax))),
  tempo_medio_s: mean(rows.map(r => r.ms / 1000)), famiglie: perFam };
console.log("=== RIEPILOGO " + JSON.stringify(sum, null, 1));
await browser.close(); srv.kill();
