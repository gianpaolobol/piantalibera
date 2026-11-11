// Confronto ARKit ↔ motore da foto sugli stessi fotogrammi di una «Scansione AR» (docs/scansione-ar.md).
//   ARKit: stanza dai piani (pareti, pavimento, soffitto), porte e finestre dai piani classificati, altezza e
//          inclinazione della fotocamera dalla posa; tutto in metri, senza misure dell'utente.
//   Motore locale: ogni fotogramma analizzato da solo come una foto qualsiasi («Analizza nel dispositivo»:
//          segmentazione, rilevatore, profondità MoGe-2), con il campo visivo che avrebbe l'EXIF.
//   Misure vere (facoltative): misure.json accanto alla scansione, per esempio
//     {"stanza":{"lunghezza":4.2,"larghezza":3.1,"altezza":2.7},
//      "aperture":[{"tipo":"porta","larghezza":0.8,"altezza":2.1},{"tipo":"finestra","larghezza":1.2,"altezza":1.4,"davanzale":0.9}]}
// Uso: node scripts/confronto-ar.mjs cartella-o-file.zip [misure.json]   (FOTOGRAMMI=n per limitare quelli analizzati)
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const ARG = process.argv[2], MAX = Number(process.env.FOTOGRAMMI || 30);
if (!ARG) { console.error("Uso: node scripts/confronto-ar.mjs scansione.zip [misure.json]"); process.exit(2); }
let DIR = ARG;
if (ARG.endsWith(".zip")) { DIR = mkdtempSync(join(tmpdir(), "scansione-")); execFileSync("unzip", ["-q", ARG, "-d", DIR]); }
const findCapture = d => { if (existsSync(join(d, "capture.json"))) return d; for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { const r = findCapture(p); if (r) return r; } } return null; };
DIR = findCapture(DIR); if (!DIR) { console.error("capture.json non trovato"); process.exit(2); }
const C = JSON.parse(readFileSync(join(DIR, "capture.json"), "utf8"));
const mPath = process.argv[3] || [join(DIR, "misure.json"), join(dirname(DIR), "misure.json")].find(existsSync);
const TRUE = mPath && existsSync(mPath) ? JSON.parse(readFileSync(mPath, "utf8")) : null;

/* ---------- geometria ARKit ---------- */
const col = (m, i) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
const mul = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = r => r * 180 / Math.PI, med = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const r2 = v => v == null ? null : +v.toFixed(2);

const planes = C.planes.map(p => { const pts = p.boundary.map(b => mul(p.transform, b)); const nrm = col(p.transform, 1); return { ...p, pts, nrm, area: p.extent[0] * p.extent[1] }; });
const horiz = planes.filter(p => p.alignment === "horizontal"), vert = planes.filter(p => p.alignment === "vertical");
const yOf = p => mean(p.pts.map(q => q[1]));
const floorPl = horiz.filter(p => p.class === "floor"), ceilPl = horiz.filter(p => p.class === "ceiling");
const camYs = C.frames.map(f => f.transform[13]);
// pavimento: piano classificato «floor» più esteso; altrimenti il piano orizzontale più basso sotto le fotocamere
const floorY = floorPl.length ? yOf(floorPl.sort((a, b) => b.area - a.area)[0]) : horiz.length ? Math.min(...horiz.filter(p => yOf(p) < Math.min(...camYs) - .5).map(yOf), Infinity) : null;
const ceilY = ceilPl.length ? yOf(ceilPl.sort((a, b) => b.area - a.area)[0]) : null;
const fy = Number.isFinite(floorY) ? floorY : null;

// pareti: direzione dominante delle normali (modulo 90°), poi una parete per lato col piano più esteso
const walls = vert.filter(p => p.class === "wall" || (p.class === "none" && p.area > 1));
let roomAR = null;
if (walls.length) {
  let best = null;
  for (let a = 0; a < 90; a += .5) { const t = a * Math.PI / 180; let s = 0; for (const w of walls) { const ang = Math.atan2(w.nrm[2], w.nrm[0]); s += w.area * Math.cos(4 * (ang - t)); } if (!best || s > best.s) best = { a: t, s }; }
  const ex = [Math.cos(best.a), 0, Math.sin(best.a)], ez = [-Math.sin(best.a), 0, Math.cos(best.a)];
  const sides = { "+x": [], "-x": [], "+z": [], "-z": [] };
  for (const w of walls) { const c = mul(w.transform, w.center), nx = dot(w.nrm, ex), nz = dot(w.nrm, ez); const k = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? "+x" : "-x") : (nz > 0 ? "+z" : "-z"); sides[k].push({ off: Math.abs(nx) > Math.abs(nz) ? dot(c, ex) : dot(c, ez), area: w.area }); }
  // le normali di ARKit guardano verso la fotocamera: «+x» è la parete con x minore e viceversa
  const pick = a => a.length ? a.sort((p, q) => q.area - p.area)[0].off : null;
  const xa = pick(sides["+x"]), xb = pick(sides["-x"]), za = pick(sides["+z"]), zb = pick(sides["-z"]);
  roomAR = { pareti: walls.length, lati: Object.values(sides).filter(a => a.length).length, A: xa != null && xb != null ? Math.abs(xb - xa) : null, B: za != null && zb != null ? Math.abs(zb - za) : null, H: fy != null && ceilY != null ? ceilY - fy : null };
}
// porte e finestre: piani classificati, misurati dal contorno nel mondo
const openAR = vert.filter(p => p.class === "door" || p.class === "window").map(p => {
  const hn = Math.hypot(p.nrm[0], p.nrm[2]) || 1, u = [p.nrm[2] / hn, 0, -p.nrm[0] / hn];   // orizzontale nel piano della parete
  const along = p.pts.map(q => dot(q, u)), ys = p.pts.map(q => q[1]);
  const w = Math.max(...along) - Math.min(...along), h = Math.max(...ys) - Math.min(...ys), sill = fy != null ? Math.min(...ys) - fy : null;
  return { tipo: p.class === "door" ? "porta" : "finestra", larghezza: w, altezza: h, davanzale: sill };
});
// posa di ogni fotogramma: altezza dal pavimento, inclinazione (negativa verso il basso), rotazione dell'immagine per averla diritta
const poseAR = C.frames.map(f => {
  const m = f.transform, fw = col(m, 2).map(v => -v), up = [col(m, 0)[1], col(m, 1)[1]];   // y del mondo nelle coordinate della fotocamera
  const imgUp = [up[0], -up[1]];   // nell'immagine (x a destra, y in basso)
  const rot = Math.abs(imgUp[0]) > Math.abs(imgUp[1]) ? (imgUp[0] > 0 ? 270 : 90) : (imgUp[1] > 0 ? 180 : 0);   // gradi in senso orario
  return { hc: fy != null ? m[13] - fy : null, pitch: deg(Math.asin(Math.max(-1, Math.min(1, fw[1])))), rot };
});

console.log(`Scansione: ${C.device} · ${C.system} · LiDAR ${C.lidar ? "sì" : "no"} · ${C.frames.length} fotogrammi · ${C.planes.length} piani (${["wall", "floor", "ceiling", "door", "window", "table", "seat", "none"].map(k => `${k} ${C.planes.filter(p => p.class === k).length}`).join(", ")})`);
console.log(`ARKit: pavimento ${fy != null ? "trovato" : "NON trovato"}, soffitto ${ceilY != null ? "trovato" : "non trovato"} · stanza ${roomAR ? `${r2(roomAR.A)} × ${r2(roomAR.B)} m, h ${r2(roomAR.H)} (${roomAR.lati} lati su 4)` : "-"} · aperture ${openAR.map(o => `${o.tipo} ${r2(o.larghezza)}×${r2(o.altezza)}${o.tipo === "finestra" ? ` dav ${r2(o.davanzale)}` : ""}`).join(", ") || "-"}`);

if (process.env.SOLO_ARKIT){ console.log("=== POSE " + JSON.stringify(poseAR.slice(0, 5))); process.exit(0); }

/* ---------- motore locale sugli stessi fotogrammi ---------- */
const RECON = async function ({ photo, rot, hfovSensor, W0, H0 }) {
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = photo; });
  const sw = rot % 180 ? H0 : W0, sh = rot % 180 ? W0 : H0, c = document.createElement("canvas"); c.width = sw; c.height = sh;
  const g = c.getContext("2d"); g.translate(sw / 2, sh / 2); g.rotate(rot * Math.PI / 180); g.drawImage(img, -W0 / 2, -H0 / 2);
  const upright = c.toDataURL("image/jpeg", .92);
  // campo visivo orizzontale dell'immagine diritta (quello che darebbe l'EXIF)
  const f = W0 / 2 / Math.tan(hfovSensor * Math.PI / 360), hfov = 2 * Math.atan(sw / 2 / f) * 180 / Math.PI;
  F3_DEPTH.on = true; F3_DET.on = true;
  Object.assign(F3, { img: upright, thumb: upright, w: sw, h: sh, name: "ar", exifFov: hfov, seg: null, a: null, quadSource: "", fitFov: null });
  F3.opts = { refKind: "ceil", refVal: 2.7, fov: null, depth: null, ceil: true };
  const t0 = performance.now(); await f3Segment();
  f3Accept({ analysis: { items: [], room: {}, back_wall: null } });
  const s = f3Solve(), ms = Math.round(performance.now() - t0);
  if (!s.ok) return { ok: false, err: s.err, ms };
  const lay = f3Layout(s);
  return { ok: true, ms, hc: s.hc, pitch: s.p * 180 / Math.PI, W: s.W, D: s.D, H: s.H, depth: !!F3.seg?.depth?.G,
    openings: lay.openings.map(o => ({ tipo: /finestra/.test(o.it.category) ? "finestra" : "porta", larghezza: o.w, altezza: o.h, davanzale: o.sill })),
    items: F3.items.filter(i => i.on).map(i => i.category) };
};

const srv = spawn(process.execPath, ["server/local-server.mjs"], { env: { ...process.env, PORT: "8798" }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", e => console.log("errore pagina:", e.message));
await page.goto("http://127.0.0.1:8798/?nosw"); await page.waitForFunction(() => typeof f3Solve === "function" && typeof P !== "undefined" && P);

// fotogrammi: tutti quelli scattati a mano più altri distribuiti, fino a FOTOGRAMMI
const idx = C.frames.map((f, i) => i), manual = idx.filter(i => C.frames[i].manual), rest = idx.filter(i => !C.frames[i].manual);
const step = Math.max(1, Math.ceil(rest.length / Math.max(1, MAX - manual.length)));
const chosen = [...new Set([...manual, ...rest.filter((_, k) => k % step === 0)])].sort((a, b) => a - b).slice(0, Math.max(MAX, manual.length));
const rows = [];
for (const i of chosen) {
  const f = C.frames[i], ar = poseAR[i], photo = "data:image/jpeg;base64," + readFileSync(join(DIR, f.file)).toString("base64");
  const hfovSensor = 2 * Math.atan(f.width / 2 / f.fx) * 180 / Math.PI;
  const r = await page.evaluate(`(${RECON})(${JSON.stringify({ photo, rot: ar.rot, hfovSensor, W0: f.width, H0: f.height })})`);
  rows.push({ i, f, ar, r });
  console.log(`## ${f.file}${f.manual ? " (Scatta)" : ""} · ARKit h ${r2(ar.hc)} incl ${r2(ar.pitch)} · locale ${r.ok ? `h ${r2(r.hc)} incl ${r2(r.pitch)} stanza ${r2(r.W)}×${r2(r.D)} h ${r2(r.H)} · aperture ${r.openings.map(o => `${o.tipo} ${r2(o.larghezza)}×${r2(o.altezza)}`).join(", ") || "-"}` : "NO " + r.err} · ${r.ms} ms`);
}
await browser.close(); srv.kill();

/* ---------- riepilogo ---------- */
const ok = rows.filter(x => x.r.ok);
const dH = ok.filter(x => x.ar.hc != null).map(x => Math.abs(x.r.hc - x.ar.hc)), dP = ok.map(x => Math.abs(x.r.pitch - x.ar.pitch));
const loc = { W: med(ok.map(x => Math.max(x.r.W, x.r.D))), D: med(ok.map(x => Math.min(x.r.W, x.r.D))), H: med(ok.map(x => x.r.H)) };
const out = {
  fotogrammi_analizzati: rows.length, risolti_dal_motore_locale: ok.length,
  locale_vs_ARKit: { altezza_fotocamera_err_m: r2(mean(dH)), inclinazione_err_gradi: r2(mean(dP)) },
  stanza: { ARKit: roomAR ? [r2(Math.max(roomAR.A ?? 0, roomAR.B ?? 0)) || null, r2(Math.min(roomAR.A ?? Infinity, roomAR.B ?? Infinity)) || null, r2(roomAR.H)] : null, locale_mediana: [r2(loc.W), r2(loc.D), r2(loc.H)] },
  aperture: { ARKit: openAR.length, locale_per_fotogramma: r2(mean(ok.map(x => x.r.openings.length))) },
};
if (TRUE) {
  const t = TRUE.stanza || {}, tv = [Math.max(t.lunghezza || 0, t.larghezza || 0) || null, Math.min(t.lunghezza || Infinity, t.larghezza || Infinity), t.altezza ?? null].map(v => Number.isFinite(v) ? v : null);
  const err = v => v ? v.map((x, k) => x != null && tv[k] != null ? r2(x - tv[k]) : null) : null;
  out.stanza.vere = tv; out.stanza.errore_ARKit = err(out.stanza.ARKit); out.stanza.errore_locale = err(out.stanza.locale_mediana);
  // ogni apertura vera: la più vicina per larghezza dello stesso tipo, da ARKit e dal locale (tutti i fotogrammi)
  const near = (list, a) => list.filter(o => o.tipo === a.tipo).sort((p, q) => Math.abs(p.larghezza - a.larghezza) - Math.abs(q.larghezza - a.larghezza))[0];
  const locAll = ok.flatMap(x => x.r.openings);
  out.aperture.vere = (TRUE.aperture || []).map(a => { const A = near(openAR, a), L = near(locAll, a); return { tipo: a.tipo, vera: [a.larghezza, a.altezza, a.davanzale ?? null],
    ARKit: A ? { trovata: true, err_larghezza: r2(A.larghezza - a.larghezza), err_altezza: r2(A.altezza - a.altezza), err_davanzale: a.davanzale != null && A.davanzale != null ? r2(A.davanzale - a.davanzale) : null } : { trovata: false },
    locale: L ? { trovata: true, err_larghezza: r2(L.larghezza - a.larghezza), err_altezza: r2(L.altezza - a.altezza), err_davanzale: a.davanzale != null && L.davanzale != null ? r2(L.davanzale - a.davanzale) : null } : { trovata: false } }; });
}
console.log("=== CONFRONTO " + JSON.stringify(out, null, 1));
