// Banco di prova di «Da foto al 3D» (gira in GitHub Actions, browser vero).
//   1. Stanze a geometria nota: dimensioni, porte, finestre e arredi casuali (seme fisso), «fotografate»
//      dall'editor da una fotocamera casuale (altezza, inclinazione, rotazione, campo visivo).
//   2. Analisi del server (Llama 4 Scout + DETR, REST di Workers AI) salvata in tests/fixtures/banco-foto/
//      e riusata: i giri successivi non consumano Neurons finché la foto non cambia.
//   3. Ricostruzione automatica con il codice vero dell'editor (segmentazione nel browser compresa), senza
//      correzioni dell'utente, e misura degli errori rispetto alla geometria vera.
// Uso: node scripts/banco-foto.mjs [N]   (CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID per le analisi nuove)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, parseDetections } from "../shared/photo.js";
import { buildModelPrompt } from "../shared/contract.js";

const N = Number(process.argv[2] || process.env.N || 10), DIR = "tests/fixtures/banco-foto", ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const IMGS = (process.env.IMGS || "0,1,2,3").split(",").map(Number), FOV_NOTO = process.env.FOV_NOTO !== "0", REALE = process.env.REALE === "1";
mkdirSync(DIR, { recursive: true });
const run = async (model, input) => { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }); const j = await r.json(); if (!j.success) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.result; };
/* versione fotorealistica della scena: FLUX.2 klein con vista, profondità e contorni (stessa procedura del render
   «fedele» del sito), salvata nel ramo per non rifarla; la geometria resta quasi uguale alla scena */
async function photoreal(shot, seed) {
  const form = new FormData(), dec = d => new Blob([Buffer.from(d.split(",")[1], "base64")], { type: d.slice(5, d.indexOf(";")) });
  form.append("prompt", buildModelPrompt({ mode: "fedele", prompt: "Furnished home interior photographed with a phone camera, natural daylight from the windows, realistic furniture, fabrics, wood and painted plaster walls." }, { depth: 1, lines: 2 }));
  form.append("width", "1024"); form.append("height", "768"); form.append("seed", String(seed));
  form.append("input_image_0", dec(shot.small), "image.jpg"); form.append("input_image_1", dec(shot.depth), "depth.png"); form.append("input_image_2", dec(shot.lines), "lines.png");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`, { method: "POST", headers: { Authorization: `Bearer ${TOK}` }, body: form });
  const j = await r.json(); if (!j.success || !j.result?.image) throw new Error("klein: " + JSON.stringify(j.errors || j).slice(0, 300));
  return "data:image/jpeg;base64," + j.result.image;
}
async function analyze(photo, W, H) {
  const [vis, det] = await Promise.all([run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: photoMessages(photo), max_tokens: 3000, temperature: .15, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA } }), run("@cf/facebook/detr-resnet-50", { image: [...Buffer.from(photo.split(",")[1], "base64")] })]);
  return { raw: extractJson(vis), det: parseDetections(det, W, H), neurons: vis?.usage?.neurons };
}

/* ---------- generatore di stanze (nella pagina) ---------- */
const GEN = function (seed) {
  let a = seed * 9301 + 49297; const R = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const U = (lo, hi) => lo + (hi - lo) * R(), pick = l => l[Math.floor(R() * l.length)];
  const W = +U(3.4, 6).toFixed(2), D = +U(4, 6.5).toFixed(2), H = +U(2.6, 3.1).toFixed(2), t = .2, h2 = t / 2;
  const L0 = { id: "L0", name: "Piano terra", elev: 0, height: H, slab: .25, roof: { type: "none", pitch: 0, overhang: 0, mat: "tegole" }, underlay: null };
  const mats = ["intonaco", "intonaco_sab", "intonaco_gr"], wm = pick(mats);
  const wl = (A, B) => ({ id: uid(), level: "L0", a: A, b: B, thick: t, height: null, mat: wm });
  const walls = { back: wl([-h2, -h2], [W + h2, -h2]), right: wl([W + h2, -h2], [W + h2, D + h2]), front: wl([W + h2, D + h2], [-h2, D + h2]), left: wl([-h2, D + h2], [-h2, -h2]) };
  const len = { back: W, left: D, right: D }, gt = { W, D, H, openings: [], objects: [] }, ops = [], used = { back: [], left: [], right: [] };
  const place = (wall, w) => { for (let k = 0; k < 40; k++) { const s = U(w / 2 + .25, len[wall] - w / 2 - .25); if (wall !== "back" && s < 1.4) continue; if (!used[wall].some(([a, b]) => s + w / 2 > a - .3 && s - w / 2 < b + .3)) { used[wall].push([s - w / 2, s + w / 2]); return s; } } return null; };
  const addOp = (type, wall, w, h, sill) => { const s = place(wall, w); if (s == null) return; ops.push({ id: uid(), wall: walls[wall].id, t: +(s + h2).toFixed(3), w, h, sill, type, flip: 0 }); gt.openings.push({ type, wall, t: +s.toFixed(3), w, h, sill }); };
  addOp("door", pick(["left", "right", "back", "left", "right"]), +U(.8, .95).toFixed(2), +U(2.05, 2.25).toFixed(2), 0);
  const nWin = 1 + (R() < .5 ? 1 : 0);
  for (let i = 0; i < nWin; i++) addOp("window", pick(["back", "back", "left", "right"]), +U(.9, 1.6).toFixed(2), +U(1.2, 1.5).toFixed(2), +U(.8, 1.05).toFixed(2));
  const objs = [], ob = (ref, x, y, rot = 0, cat) => { objs.push({ id: uid(), level: "L0", kind: "lib", ref, name: LIBMAP[ref].nome, x, y, rot, scale: 1, z: 0 }); gt.objects.push({ ref, cat, x, y }); };
  const kind = pick(["soggiorno", "camera", "pranzo"]);
  if (kind === "soggiorno") { ob("divano3", W / 2 + U(-.6, .6), .52, 0, "divano"); ob("tavolino", W / 2 + U(-.4, .4), 1.6, 0, "tavolino"); if (R() < .7) ob("poltrona", U(.6, 1), U(1.8, 2.6), 270, "poltrona"); if (R() < .5) ob("vaso_verde", W - .45, .45, 0, "pianta"); }
  if (kind === "camera") { ob("letto2", W / 2 + U(-.5, .5), 1.1, 0, "letto_matrimoniale"); ob("comodino", W / 2 - 1.2, .25, 0, "comodino"); if (R() < .7) ob("armadio2", W - .36, U(2.2, D - 1.6), 90, "armadio"); }
  if (kind === "pranzo") { const cx = W / 2 + U(-.4, .4), cy = U(1.6, Math.max(1.7, D - 2.4)); ob("tavolo6", cx, cy, 0, "tavolo"); ob("sedia", cx - .5, cy - .65, 0, "sedia"); ob("sedia", cx + .5, cy + .65, 180, "sedia"); if (R() < .6) ob("madia", W / 2 + U(-.5, .5), .25, 0, "madia"); }
  if (R() < .6) { ob("sospensione", W / 2 + U(-.3, .3), U(1.4, D / 2), 0, "lampadario"); objs[objs.length - 1].z = H; }
  P = { name: "Banco " + seed, version: SCHEMA_VERSION, materials: {}, sky: { kind: "asset", id: "giorno" }, sun: { az: U(120, 260), el: U(25, 50) }, levels: [L0], walls: Object.values(walls), openings: ops,
    rooms: [{ id: uid(), level: "L0", name: kind, mat: pick(["parquet", "gres", "marmo", "parquet_scuro"]), pts: [[0, 0], [W, 0], [W, D], [0, D]] }], objects: objs, dims: [], cameras: [] };
  for (const o of P.objects) initPlacedObject(o, LIBMAP[o.ref]);
  S.level = "L0"; setSel([]); S.show3d = "below"; refresh();
  // fotocamera: vicino alla parete di fronte, guarda la parete di fondo
  const hfov = pick([60, 65, 69, 74]), Wpx = 1024, Hpx = 768, vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) * Hpx / Wpx) * 180 / Math.PI;
  const cam = { x: W * U(.38, .62), y: D - U(.3, .55), h: +U(1.35, 1.7).toFixed(2), pitch: +U(-9, 3).toFixed(1), yaw: +U(-16, 16).toFixed(1), hfov };
  gt.camera = cam; gt.kind = kind;
  return { W: Wpx, H: Hpx, vfov, gt };
};
/* foto dalla fotocamera della scena (nella pagina) */
const SHOT = async function (cfg) {
  const { camera: cam } = cfg.gt; await new Promise(r => setTimeout(r, 600));
  for (const o of P.objects) if (LIBMAP[o.ref]?.load && !TPL[o.ref]) await loadTpl(o.ref);
  rebuild3D(); await new Promise(r => setTimeout(r, 800));
  const old = { pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), fov: camera.fov, aspect: camera.aspect };
  renderer.setPixelRatio(1); renderer.setSize(cfg.W, cfg.H, false); camera.aspect = cfg.W / cfg.H; camera.fov = cfg.vfov;
  camera.position.set(cam.x, cam.h, cam.y); camera.rotation.order = "YXZ"; camera.rotation.set(cam.pitch * Math.PI / 180, cam.yaw * Math.PI / 180, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  drawFrame(true); const url = c3d.toDataURL("image/jpeg", .9);
  let small = null, depth = null, lines = null;
  if (cfg.reale) { small = renderAt(1, null, { longSide: 512, hq: true }).toDataURL("image/jpeg", .9); depth = depthCanvas(1, { longSide: 512 }).toDataURL("image/png"); lines = linesCanvas(1, { longSide: 512 }).toDataURL("image/png"); }
  // verità a terra proiettata: spigoli della parete di fondo e riquadri delle aperture
  const pr = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4)]; };
  const g = cfg.gt, quad = { fl: pr(0, 0, 0), fr: pr(g.W, 0, 0), cl: pr(0, g.H, 0), cr: pr(g.W, g.H, 0) };
  // visibilità: centro dell'elemento davanti alla fotocamera e dentro la foto
  const inView = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse); if (v.z > -.2) return false; const q = pr(x, y, z); return q[0] > .02 && q[0] < .98 && q[1] > .02 && q[1] < .98; };
  const wp = (o, s) => o.wall === "back" ? [s, 0] : o.wall === "left" ? [0, g.D - s] : [g.W, s];
  for (const o of g.openings) { const [x, z] = wp(o, o.t); o.visible = inView(x, o.sill + o.h / 2, z); }
  for (const o of g.objects) o.visible = inView(o.x, o.cat === "lampadario" ? g.H - .4 : .4, o.y);
  renderer.setPixelRatio(old.pr); renderer.setSize(old.size.x, old.size.y, false); camera.aspect = old.aspect; camera.fov = old.fov; camera.updateProjectionMatrix();
  return { url, quad, gt: g, small, depth, lines };
};
/* ricostruzione automatica (nella pagina) */
const RECON = async function ({ photo, W, H, analysis, gt, fovKnown }) {
  Object.assign(F3, { img: photo, thumb: photo, w: W, h: H, name: "banco", exifFov: fovKnown ? gt.camera.hfov : null, seg: null, a: null, quadSource: "", fitFov: null });
  F3.opts = { refKind: "ceil", refVal: gt.H, fov: null, depth: null, ceil: true };
  const t0 = performance.now(); await f3Segment(); const tSeg = performance.now() - t0;
  f3Accept({ analysis: JSON.parse(JSON.stringify(analysis)) }); F3.opts.refVal = gt.H; F3.opts.refKind = "ceil";
  const mp = F3.seg?.m; let map = null;
  if (mp) { let b = ""; for (let i = 0; i < mp.lab.length; i += 8192) b += String.fromCharCode.apply(null, mp.lab.subarray(i, i + 8192)); map = { w: mp.w, h: mp.h, names: mp.names, lab: btoa(b) }; }
  const s = f3Solve(); if (!s.ok) return { map, ok: false, err: s.err, quad: F3.quad, segState: F3.seg?.state, quadSource: F3.quadSource, box: F3.seg?.box ? { conf: F3.seg.box.conf, pitch: F3.seg.box.pitch, quad: [F3.seg.box.fl, F3.seg.box.fr, F3.seg.box.cl, F3.seg.box.cr] } : null, tSeg };
  const lay = f3Layout(s);
  return { ok: true, map, tSeg, box: F3.seg?.box ? { conf: F3.seg.box.conf, resid: F3.seg.box.resid, pitch: F3.seg.box.pitch, hfov: F3.seg.box.hfov } : null, quad: F3.quad, quadSource: F3.quadSource, segState: F3.seg?.state, W: s.W, D: s.D, Hh: s.H, hc: s.hc, pitch: s.p * 180 / Math.PI, cam: s.c, fov: f3Fov(),
    openings: lay.openings.map(o => ({ type: o.type, wall: o.wall, t: o.t, w: o.w, h: o.h, sill: o.sill })),
    objects: lay.objects.map(o => ({ cat: o.cat || o.it.category, x: o.x, y: o.y })), items: F3.items.map(i => ({ cat: i.category, on: i.on, src: i.source, box: i.box })) };
};

/* ---------- foto vere: ricostruzione completa e sovrapposizione del modello 3D alla foto (nella pagina) ---------- */
const BUILD = async function ({ photo, W, H, analysis }) {
  P = { name: "Foto", version: SCHEMA_VERSION, materials: {}, sky: { kind: "asset", id: "giorno" }, sun: { az: 200, el: 35 }, levels: [{ id: "L0", name: "Piano terra", elev: 0, height: 2.7, slab: .25, roof: { type: "none", pitch: 0, overhang: 0, mat: "tegole" }, underlay: null }], walls: [], openings: [], rooms: [], objects: [], dims: [], cameras: [] };
  S.level = "L0"; setSel([]); S.show3d = "below"; refresh();
  Object.assign(F3, { img: photo, thumb: photo, w: W, h: H, name: "foto", exifFov: null, seg: null, a: null, quadSource: "", fitFov: null, open: false });
  F3.opts = { refKind: "ceil", refVal: 2.7, fov: null, depth: null, ceil: true };
  await f3Segment(); f3Accept({ analysis: JSON.parse(JSON.stringify(analysis)) });
  const mp = F3.seg?.m; let map = null;
  if (mp) { let b = ""; for (let i = 0; i < mp.lab.length; i += 8192) b += String.fromCharCode.apply(null, mp.lab.subarray(i, i + 8192)); map = { w: mp.w, h: mp.h, names: mp.names, lab: btoa(b) }; }
  const s = f3Solve(); if (!s.ok) return { map, ok: false, err: s.err, quad: F3.quad };
  f3Build(); for (const o of P.objects) if (LIBMAP[o.ref]?.load && !TPL[o.ref]) await loadTpl(o.ref);
  rebuild3D(); await new Promise(r => setTimeout(r, 900));
  const cam = P.cameras[P.cameras.length - 1], cw = 640, ch = Math.round(640 * H / W);
  const old = { pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), fov: camera.fov, aspect: camera.aspect };
  renderer.setPixelRatio(1); renderer.setSize(cw, ch, false); camera.aspect = cw / ch; camera.fov = cam.fov; camera.position.fromArray(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(new THREE.Vector3().fromArray(cam.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  drawFrame(false); const model = c3d.toDataURL("image/png");
  renderer.setPixelRatio(old.pr); renderer.setSize(old.size.x, old.size.y, false); camera.aspect = old.aspect; camera.fov = old.fov; camera.updateProjectionMatrix();
  const img = await new Promise(ok => { const a = new Image(), b = new Image(); let n = 0; const done = () => { if (++n < 2) return; const c = document.createElement("canvas"); c.width = cw * 2 + 8; c.height = ch; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, ch);
      g.drawImage(a, 0, 0, cw, ch); g.globalAlpha = .45; g.drawImage(b, 0, 0, cw, ch); g.globalAlpha = 1; g.drawImage(b, cw + 8, 0, cw, ch);
      g.strokeStyle = "#18f"; g.lineWidth = 2; g.beginPath(); ["fl", "fr", "cr", "cl"].forEach((k, i) => { const x = F3.quad[k][0] * cw, y = F3.quad[k][1] * ch; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
      ok(c.toDataURL("image/jpeg", .72)); }; a.onload = b.onload = done; a.src = photo; b.src = model; });
  return { ok: true, img, quadSource: F3.quadSource, fov: f3Fov(), W: s.W, D: s.D, hc: s.hc, pitch: s.p * 180 / Math.PI, report: F3.report?.title, items: F3.items.map(i => i.category + (i.on ? "" : "?") + "/" + i.source) };
};

/* ---------- misura ---------- */
const FAM = c => ({ divano: "sedute", divano_angolare: "sedute", poltrona: "sedute", pouf: "sedute", sedia: "sedie", sedia_ufficio: "sedie", sgabello: "sedie", letto_matrimoniale: "letto", letto_singolo: "letto", tavolo: "tavolo", tavolo_tondo: "tavolo", scrivania: "tavolo", tavolino: "tavolino", tavolino_tondo: "tavolino", madia: "contenitori", cassettiera: "contenitori", armadio: "contenitori", libreria: "contenitori", comodino: "comodino", lampadario: "lampada", plafoniera: "lampada", pianta: "pianta" }[c] || c);
function score(gt, r, quadGt) {
  const out = { ok: r.ok };
  if (!r.ok) return { ...out, err: r.err };
  // spigoli: solo quelli che nella foto si vedono (gli altri non sono misurabili); larghezza solo se si vedono entrambi
  const vis = k => quadGt[k][0] >= 0 && quadGt[k][0] <= 1 && quadGt[k][1] >= 0 && quadGt[k][1] <= 1, ks = ["fl", "fr", "cl", "cr"].filter(vis);
  const qd = ks.map(k => Math.hypot(r.quad[k][0] - quadGt[k][0], (r.quad[k][1] - quadGt[k][1]) * .75)); out.corner = qd.length ? +(qd.reduce((a, b) => a + b) / qd.length * 100).toFixed(1) : null;
  out.bothVisible = vis("fl") && vis("fr"); out.dW = out.bothVisible ? +(r.W - gt.W).toFixed(2) : null; out.dH = +(r.Hh - gt.H).toFixed(2); out.dHc = +(r.hc - gt.camera.h).toFixed(2); out.dPitch = +(r.pitch - gt.camera.pitch).toFixed(1); out.dFov = +(r.fov - gt.camera.hfov).toFixed(0);
  // aperture: stessa tipologia (porta/finestra) e stesso muro; errori di posizione lungo il muro, davanzale, altezza, larghezza
  const used = new Set(); out.ops = [];
  for (const g of gt.openings.filter(o => o.visible)) {
    let best = null; r.openings.forEach((o, i) => { if (used.has(i) || o.type !== g.type) return; const d = (o.wall === g.wall ? 0 : 5) + Math.abs(o.t - g.t); if (!best || d < best.d) best = { d, i, o }; });
    if (!best) { out.ops.push({ type: g.type, found: false }); continue; }
    used.add(best.i); const o = best.o;
    out.ops.push({ type: g.type, found: true, wallOk: o.wall === g.wall, dT: +(o.t - g.t).toFixed(2), dSill: +(o.sill - g.sill).toFixed(2), dH: +(o.h - g.h).toFixed(2), dW: +(o.w - g.w).toFixed(2) });
  }
  out.extraOps = r.openings.length - used.size;
  // arredi: stessa famiglia, il più vicino entro 1,2 m
  const usedO = new Set(); out.objs = [];
  for (const g of gt.objects.filter(o => o.visible)) {
    let best = null; r.objects.forEach((o, i) => { if (usedO.has(i) || FAM(o.cat) !== FAM(g.cat)) return; const d = Math.hypot(o.x - g.x, o.y - g.y); if (!best || d < best.d) best = { d, i }; });
    if (best && best.d < 1.2) { usedO.add(best.i); out.objs.push({ cat: g.cat, found: true, d: +best.d.toFixed(2) }); } else out.objs.push({ cat: g.cat, found: false });
  }
  out.extraObjs = r.objects.length - usedO.size;
  return out;
}

/* ---------- giro ---------- */
const srv = spawn(process.execPath, ["server/local-server.mjs"], { env: { ...process.env, PORT: "8798" }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", e => console.log("errore pagina:", e.message));
if (process.env.PL_LOCAL_THREE) { const { join } = await import("node:path"); await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => { const f = join(process.env.PL_LOCAL_THREE, r.request().url().split("three@0.147.0/")[1]); return existsSync(f) ? r.fulfill({ body: readFileSync(f), contentType: "application/javascript" }) : r.abort(); }); await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" })); }
if (process.env.SALVA_FOTO) await page.exposeFunction("__salva", (n, d) => writeFileSync(`${process.env.SALVA_FOTO}/${n}.jpg`, Buffer.from(d.split(",")[1], "base64")));
await page.goto("http://127.0.0.1:8798/?nosw"); await page.waitForFunction(() => typeof f3Solve === "function" && typeof P !== "undefined" && P);
await page.evaluate(() => { $('#viewSeg [data-v="3d"]')?.click(); });
const rows = [];
let neurons = 0;
if (process.env.FOTOVERE === "1") {
  const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" }, list = [];
  for (const c of ["Category:Living_rooms_in_the_United_States", "Category:Bedrooms_in_the_United_States", "Category:Kitchens_in_the_United_States", "Category:Dining_rooms_in_the_United_States"]) {
    const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(c)}&gcmtype=file&gcmlimit=60&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024`, { headers: UA })).json();
    const fs = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height * 1.2).sort((a, b) => a.title.localeCompare(b.title));
    for (const k of [2, 7]) if (fs[k]) list.push(fs[k]);
  }
  mkdirSync(`${DIR}/vere`, { recursive: true });
  for (const f of list.slice(0, N)) {
    const buf = Buffer.from(await (await fetch(f.imageinfo[0].thumburl, { headers: UA })).arrayBuffer()), photo = "data:image/jpeg;base64," + buf.toString("base64");
    const W = f.imageinfo[0].thumbwidth, H = f.imageinfo[0].thumbheight, key = createHash("sha256").update(f.title).digest("hex").slice(0, 12), file = `${DIR}/vere/${key}.json`;
    let fx = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (!fx) { if (!TOK) continue; const an = await analyze(photo, W, H); neurons += an.neurons || 0; fx = { title: f.title, page: f.imageinfo[0].descriptionurl, raw: an.raw, det: an.det }; writeFileSync(file, JSON.stringify(fx)); }
    let analysis; try { analysis = normalizeAnalysis(fx.raw, fx.det, W, H); } catch { continue; }
    const r = await page.evaluate(`(${BUILD})(${JSON.stringify({ photo, W, H, analysis })})`);
    console.log(`\n## ${f.title} ${f.imageinfo[0].descriptionurl}\n${JSON.stringify({ ...r, img: undefined })}`);
    if (r.img) console.log(`===IMG=== vera_${key}\n${r.img.split(",")[1]}\n===FINE===`);
  }
  console.log(`\nNeurons spesi: ${Math.round(neurons)}`);
  await browser.close(); srv.kill(); process.exit(0);
}
for (let i = 0; i < N; i++) {
  const seed = 100 + i, file = `${DIR}/scena-${seed}${REALE ? "-reale" : ""}.json`;
  const cfg = await page.evaluate(`(() => { try { return (${GEN})(${seed}); } catch (e) { return { err: e.stack }; } })()`); if (cfg.err) { console.log("generatore:", cfg.err); break; }
  cfg.reale = REALE;
  const shot = await page.evaluate(`(${SHOT})(${JSON.stringify(cfg)})`); cfg.gt = shot.gt;
  const realFile = `${DIR}/scena-${seed}-reale.jpg`;
  if (REALE) {
    if (!existsSync(realFile)) { if (!TOK) { console.log(`scena ${seed}: manca la versione fotorealistica e il token`); continue; }
      try { const d = await photoreal(shot, seed); writeFileSync(realFile, Buffer.from(d.split(",")[1], "base64")); neurons += 113; } catch (e) { console.log(`scena ${seed}:`, e.message); continue; } }
    shot.url = "data:image/jpeg;base64," + readFileSync(realFile).toString("base64");
  }
  if (process.env.SALVA_FOTO) await page.evaluate(([n, d]) => window.__salva(n, d), [`scena-${seed}`, shot.url]);
  const hash = createHash("sha256").update(shot.url).digest("hex").slice(0, 16);
  let fx = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (!fx || (fx.hash !== hash && process.env.RIANALIZZA === "1")) {
    if (!TOK) { console.log(`scena ${seed}: manca l'analisi e il token`); continue; }
    const an = await analyze(shot.url, cfg.W, cfg.H); neurons += an.neurons || 0;
    fx = { seed, hash, raw: an.raw, det: an.det, when: new Date().toISOString() }; writeFileSync(file, JSON.stringify(fx));
  }
  let analysis; try { analysis = normalizeAnalysis(fx.raw, fx.det, cfg.W, cfg.H); } catch (e) { console.log(`scena ${seed}: analisi non valida`); continue; }
  const r = await page.evaluate(`(${RECON})(${JSON.stringify({ photo: shot.url, W: cfg.W, H: cfg.H, analysis, gt: cfg.gt, fovKnown: FOV_NOTO })})`);
  const sc = score(cfg.gt, r, shot.quad); rows.push({ seed, gt: cfg.gt, sc, r: { segState: r.segState, quadSource: r.quadSource, tSeg: Math.round(r.tSeg || 0) }, stale: fx.hash !== hash });
  console.log(`\n## scena ${seed} (${cfg.gt.kind}, ${cfg.gt.W}×${cfg.gt.D}×${cfg.gt.H} m, fotocamera h ${cfg.gt.camera.h} incl ${cfg.gt.camera.pitch}° rot ${cfg.gt.camera.yaw}° fov ${cfg.gt.camera.hfov}°)${fx.hash !== hash ? " [analisi di una foto precedente]" : ""}`);
  console.log(JSON.stringify(sc)); console.log(`seg ${r.segState} ${Math.round(r.tSeg || 0)} ms · modello stanza ${JSON.stringify(r.box)} · spigoli: ${r.quadSource} · elementi: ${(r.items || []).map(x => x.cat + (x.on ? "" : "?") + "/" + x.src).join(", ")}`);
  if (r.objects) console.log(`arredi: ${r.objects.map(o => `${o.cat}@${o.x.toFixed(1)},${o.y.toFixed(1)}`).join(" ")} | veri: ${cfg.gt.objects.filter(o => o.visible).map(o => `${o.cat}@${o.x.toFixed(1)},${o.y.toFixed(1)}`).join(" ")}`);
  // mappa delle etichette e spigoli veri: per provare il modello di stanza in locale (scripts/prova-stanza.mjs)
  if (r.map) console.log(`===MAP=== scena_${seed}${REALE ? "_reale" : ""}\n${JSON.stringify({ ...r.map, gq: shot.quad, cam: cfg.gt.camera, fovKnown: FOV_NOTO })}\n===FINE===`);
  if (IMGS.includes(i)) {
    const img = await page.evaluate(({ url, q, gq, items }) => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 640, 480);
      const poly = (Q, col) => { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); ["fl", "fr", "cr", "cl"].forEach((k, i) => { const x = Q[k][0] * 640, y = Q[k][1] * 480; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); };
      poly(gq, "#0c0"); if (q) poly(q, "#18f");
      for (const it of items || []) { g.strokeStyle = it.on ? (/porta|finestra/.test(it.cat) ? "#e23" : "#fb3") : "#999"; g.lineWidth = 2; g.strokeRect(it.box[0] * 640, it.box[1] * 480, (it.box[2] - it.box[0]) * 640, (it.box[3] - it.box[1]) * 480); g.fillStyle = g.strokeStyle; g.font = "12px sans-serif"; g.fillText(it.cat, it.box[0] * 640 + 2, it.box[1] * 480 + 12); }
      ok(c.toDataURL("image/jpeg", .7)); }; im.src = url; }), { url: shot.url, q: r.quad, gq: shot.quad, items: r.items });
    console.log(`===IMG=== scena_${seed}${REALE ? "_reale" : ""}\n${img.split(",")[1]}\n===FINE===`);
  }
}
/* riepilogo */
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN, abs = a => a.map(Math.abs), ok = rows.filter(r => r.sc.ok);
const ops = ok.flatMap(r => r.sc.ops), found = ops.filter(o => o.found), objs = ok.flatMap(r => r.sc.objs), fo = objs.filter(o => o.found);
const sum = { scene: rows.length, risolte: ok.length, spigoli_err_pct: +mean(ok.filter(r => r.sc.corner != null).map(r => r.sc.corner)).toFixed(1), spigoli_mediana_pct: (a => a.sort((x, y) => x - y)[a.length >> 1])(ok.filter(r => r.sc.corner != null).map(r => r.sc.corner)), larghezza_err_m: +mean(abs(ok.filter(r => r.sc.dW != null).map(r => r.sc.dW))).toFixed(2), spigoli_misurati: ok.filter(r => r.sc.corner != null).length, altezza_foto_err_m: +mean(abs(ok.map(r => r.sc.dHc))).toFixed(2), inclinazione_err: +mean(abs(ok.map(r => r.sc.dPitch))).toFixed(1),
  aperture_trovate: `${found.length}/${ops.length}`, muro_giusto: `${found.filter(o => o.wallOk).length}/${found.length}`, pos_lungo_muro_err_m: +mean(abs(found.filter(o => o.wallOk).map(o => o.dT))).toFixed(2), davanzale_err_m: +mean(abs(found.filter(o => o.type === "window").map(o => o.dSill))).toFixed(2),
  altezza_ap_err_m: +mean(abs(found.map(o => o.dH))).toFixed(2), larghezza_ap_err_m: +mean(abs(found.map(o => o.dW))).toFixed(2), aperture_in_piu: ok.reduce((s, r) => s + r.sc.extraOps, 0),
  arredi_trovati: `${fo.length}/${objs.length}`, arredi_pos_err_m: +mean(fo.map(o => o.d)).toFixed(2), arredi_in_piu: ok.reduce((s, r) => s + r.sc.extraObjs, 0), neurons_spesi: Math.round(neurons) };
console.log("\n=== RIEPILOGO", JSON.stringify(sum, null, 1));
writeFileSync(`${DIR}/ultimo-giro${REALE ? "-reale" : ""}.json`, JSON.stringify({ when: new Date().toISOString(), fovNoto: FOV_NOTO, sum, rows }, null, 1));
await browser.close(); srv.kill();
