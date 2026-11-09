// Geometria metrica da una mappa di punti (shared/photo-depth.js): stanza a scatola nota «vista» da una fotocamera nota.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dpRecover, dpGravity, dpRoom, dpQuad, dpObject } from "../shared/photo-depth.js";

/* stanza: pavimento z=0, soffitto H; pareti a r=-dl, r=dr, f=db (riferimento della stanza); fotocamera in (0,0,h),
   ruotata di yaw (gradi, verso destra) e inclinata di pitch; uscita in coordinate OpenCV (x destra, y giù, z avanti) */
function scene({ w = 160, h: hh = 120, hfov = 60, pitch = -8, yaw = 12, camH = 1.4, H = 2.7, dl = 1.5, dr = 2.2, db = 4, table = null }) {
  const fx = .5 / Math.tan(hfov * Math.PI / 360), fy = fx * w / hh, rad = Math.PI / 180, P = new Float32Array(w * hh * 3), N = new Float32Array(w * hh * 3), M = new Float32Array(w * hh).fill(1), lab = new Uint8Array(w * hh);
  const cp = Math.cos(pitch * rad), sp = Math.sin(pitch * rad), cy = Math.cos(yaw * rad), sy = Math.sin(yaw * rad);
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const x = ((i + .5) / w - .5) / fx, y = ((j + .5) / hh - .5) / fy;               // raggio nella fotocamera (OpenCV)
    // fotocamera → stanza: avanti = (sin yaw·cos p, cos yaw·cos p, sin p), su della fotocamera…
    const fwd = [sy * cp, cy * cp, sp], right = [cy, -sy, 0], upc = [-sy * sp, -cy * sp, cp];
    const d = [0, 1, 2].map(k => x * right[k] - y * upc[k] + fwd[k]);
    let t = Infinity, kind = 0, nrm = null;
    const hit = (tt, kk, nn) => { if (tt > 1e-6 && tt < t) { t = tt; kind = kk; nrm = nn; } };
    if (d[2] < 0) hit(-camH / d[2], 1, [0, 0, 1]); if (d[2] > 0) hit((H - camH) / d[2], 2, [0, 0, -1]);
    if (d[0] < 0) hit(-dl / d[0], 0, [1, 0, 0]); if (d[0] > 0) hit(dr / d[0], 0, [-1, 0, 0]); if (d[1] > 0) hit(db / d[1], 0, [0, -1, 0]);
    if (table) { const tt = (table.z - camH) / d[2]; if (tt > 0) { const px = tt * d[0], py = tt * d[1]; if (px > table.x0 && px < table.x1 && py > table.y0 && py < table.y1) hit(tt, 3, [0, 0, 1]); } }
    const toCam = v => [dpd(v, right), -dpd(v, upc), dpd(v, fwd)];
    const pc = toCam(d.map(v => v * t)), nc = toCam(nrm), k = j * w + i;
    P.set(pc, 3 * k); N.set(nc, 3 * k); lab[k] = kind;
  }
  return { P, N, M, w, h: hh, fx, fy, m: { w, h: hh, lab, names: ["wall", "floor", "ceiling", "table"] } };
}
const dpd = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const IDS = { floor: new Set([1]), ceiling: new Set([2]), wall: new Set([0]) };

test("pavimento: verso l'alto, altezza e inclinazione della fotocamera", () => {
  const S = scene({}), G = dpGravity(S.P, S.M, S.w, S.h, S.m, IDS);
  assert.ok(G && Math.abs(G.h - 1.4) < .02 && Math.abs(G.pitch + 8) < .5, JSON.stringify(G));
});
test("pareti: rotazione e distanze della scatola, soffitto; spigoli proiettati", () => {
  const S = scene({ hfov: 80, pitch: 3 }), G = dpGravity(S.P, S.M, S.w, S.h, S.m, IDS), R = dpRoom(S.P, S.N, S.M, S.w, S.h, S.m, IDS, G);
  // nella vista la stanza è ruotata di −yaw: la parete di fondo dista db·cos + …; si confronta in pianta ruotata
  assert.ok(R && Math.abs(Math.abs(R.th) - 12) < 1.5, JSON.stringify(R));
  assert.ok(Math.abs(R.db - 4) < .1 && Math.abs(R.dl - 1.5) < .1 && Math.abs(R.dr - 2.2) < .1 && Math.abs(R.H - 2.7) < .05, JSON.stringify(R));
  const q = dpQuad(G, R, { fx: S.fx, fy: S.fy }, S.w / S.h, {});
  assert.ok(q && q.fl[1] > q.cl[1] && q.fr[0] > q.fl[0], JSON.stringify(q));
});
test("ricostruzione affine → metrica: focale e spostamento in z", () => {
  const S = scene({ hfov: 70 }), P = Float32Array.from(S.P); for (let k = 0; k < S.w * S.h; k++) P[3 * k + 2] -= 2;   // spostamento ignoto
  for (let k = 0; k < P.length; k++) P[k] /= 3;                                                                         // e scala
  const c = dpRecover(P, S.M, S.w, S.h, 3);
  assert.ok(c && Math.abs(c.hfov - 70) < 1.5, JSON.stringify(c));
  assert.ok(Math.abs(P[3 * 6000 + 2] - S.P[3 * 6000 + 2]) < .05);
});
test("oggetto: posizione in pianta e quota del piano", () => {
  const S = scene({ yaw: 0, pitch: -15, table: { x0: -.4, x1: .6, y0: 2, y1: 2.8, z: .75 } }), G = dpGravity(S.P, S.M, S.w, S.h, S.m, IDS);
  const o = dpObject(S.P, S.M, S.w, S.h, S.m, new Set([3]), [0, 0, 1, 1], G);
  assert.ok(o && Math.abs(o.r - .1) < .1 && Math.abs(o.f - 2.4) < .15 && Math.abs(o.zmax - .75) < .03, JSON.stringify(o));
});
