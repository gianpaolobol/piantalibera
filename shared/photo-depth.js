/* Geometria metrica da una sola foto (MoGe-2, Microsoft, MIT): dalla mappa dei punti 3D stimata per ogni pixel
   (metri, coordinate della fotocamera: x a destra, y in basso, z in avanti) e dalle etichette della segmentazione
   si ricavano il pavimento (verso l'alto e altezza della fotocamera), le pareti (orientamento e distanze), il
   soffitto e la posizione in pianta di ogni arredo. Nessuna misura dell'utente: la scala viene dal modello.
   Funzioni pure, usate dall'editor (077-foto3d.js) e dai test. Nomi con prefisso «dp» (diventano globali nell'editor). */

const dpDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dpCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dpNorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dpPct = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
function dpRand(seed) { let s = seed >>> 0 || 1; return () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296; }

/** Come MoGe infer(): la mappa affine si porta nello spazio della fotocamera trovando lo spostamento in z e la focale
 *  (minimi quadrati sulla proiezione), poi si applica la scala metrica. P: Float32Array w*h*3 (modificato), M: maschera
 *  0..1. Restituisce {focal (rispetto a mezza diagonale), fx, fy (rispetto a larghezza/altezza), hfov}. */
export function dpRecover(P, M, w, h, scale) {
  const a = w / h, sx = a / Math.sqrt(1 + a * a), sy = 1 / Math.sqrt(1 + a * a), xy = [], z = [], uv = [];
  const st = Math.max(1, Math.round(Math.min(w, h) / 64));
  for (let j = 0; j < h; j += st) for (let i = 0; i < w; i += st) { const k = j * w + i; if (M[k] <= .5) continue;
    xy.push(P[k * 3], P[k * 3 + 1]); z.push(P[k * 3 + 2]); uv.push(-sx * (w - 1) / w + 2 * sx * (w - 1) / w * i / (w - 1), -sy * (h - 1) / h + 2 * sy * (h - 1) / h * j / (h - 1)); }
  const n = z.length; if (n < 20) return null;
  const err = s => { let qq = 0, qt = 0; for (let i = 0; i < n; i++) { const d = z[i] + s; if (d <= 1e-6) return [Infinity, 1]; const qx = xy[2 * i] / d, qy = xy[2 * i + 1] / d; qq += qx * qx + qy * qy; qt += qx * uv[2 * i] + qy * uv[2 * i + 1]; }
    const f = qt / qq; let e = 0; for (let i = 0; i < n; i++) { const d = z[i] + s, ex = f * xy[2 * i] / d - uv[2 * i], ey = f * xy[2 * i + 1] / d - uv[2 * i + 1]; e += ex * ex + ey * ey; } return [e, f]; };
  let zmin = Infinity, zmax = -Infinity; for (const v of z) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }
  let lo = -zmin + 1e-4, hi = Math.max(zmax, 1) * 6 + 5;
  for (let it = 0; it < 80; it++) { const x1 = lo + (hi - lo) * .382, x2 = lo + (hi - lo) * .618; if (err(x1)[0] < err(x2)[0]) hi = x2; else lo = x1; }
  const shift = (lo + hi) / 2, focal = err(shift)[1];
  for (let k = 0; k < w * h; k++) { P[k * 3 + 2] += shift; for (let c = 0; c < 3; c++) P[k * 3 + c] *= scale; }
  const fx = focal / 2 * Math.sqrt(1 + a * a) / a, fy = focal / 2 * Math.sqrt(1 + a * a);
  return { focal, fx, fy, hfov: 2 * Math.atan(.5 / fx) * 180 / Math.PI, shift };
}

/* piano robusto (RANSAC + rifinitura sui punti buoni) */
function dpPlane(Q, tol, rnd) {
  const n0 = Q.length / 3; if (n0 < 30) return null;
  const p = i => [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]];
  let best = null;
  for (let it = 0; it < 120; it++) {
    const a = p(Math.floor(rnd() * n0)), b = p(Math.floor(rnd() * n0)), c = p(Math.floor(rnd() * n0));
    const nn = dpCross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]), l = Math.hypot(...nn); if (l < 1e-9) continue;
    const n = nn.map(v => v / l), d = -dpDot(n, a); let cnt = 0;
    for (let i = 0; i < n0; i += 2) if (Math.abs(Q[3 * i] * n[0] + Q[3 * i + 1] * n[1] + Q[3 * i + 2] * n[2] + d) < tol) cnt++;
    if (!best || cnt > best.cnt) best = { n, d, cnt };
  }
  if (!best) return null;
  // rifinitura: minimi quadrati sugli inlier (autovettore minore della covarianza, per iterazione di potenza inversa semplice)
  let c = [0, 0, 0], k = 0; const inl = [];
  for (let i = 0; i < n0; i++) if (Math.abs(dpDot(best.n, p(i)) + best.d) < tol) { inl.push(i); c[0] += Q[3 * i]; c[1] += Q[3 * i + 1]; c[2] += Q[3 * i + 2]; k++; }
  c = c.map(v => v / k); const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of inl) { const q = p(i).map((v, j) => v - c[j]); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[r][s] += q[r] * q[s]; }
  let n = best.n;   // iterazione inversa: risolve C x = n ripetutamente
  const solve = (A, b) => { const m = A.map((r, i) => [...r, b[i]]); for (let i = 0; i < 3; i++) { let piv = i; for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r; [m[i], m[piv]] = [m[piv], m[i]]; if (Math.abs(m[i][i]) < 1e-12) return null; for (let r = 0; r < 3; r++) if (r !== i) { const f = m[r][i] / m[i][i]; for (let s = i; s < 4; s++) m[r][s] -= f * m[i][s]; } } return m.map((r, i) => r[3] / r[i]); };
  for (let it = 0; it < 6; it++) { const x = solve(C.map((r, i) => r.map((v, j) => v + (i === j ? 1e-9 : 0))), n); if (!x) break; n = dpNorm(x); }
  return { n, d: -dpDot(n, c), frac: k / n0 };
}

/** Riferimento allineato alla gravità. m: mappa delle etichette (labelMap) con w×h proprie; P: punti w2×h2.
 *  Restituisce {up, fw, rt, h (altezza della fotocamera), pitch, roll} o null. */
export function dpGravity(P, M, w2, h2, m, ids) {
  const rnd = dpRand(7), take = set => { const Q = []; for (let j = 0; j < h2; j += 2) for (let i = 0; i < w2; i += 2) { const k = j * w2 + i; if (M[k] <= .5) continue;
    const l = m.lab[Math.min(m.h - 1, Math.floor((j + .5) * m.h / h2)) * m.w + Math.min(m.w - 1, Math.floor((i + .5) * m.w / w2))]; if (set.has(l)) Q.push(P[3 * k], P[3 * k + 1], P[3 * k + 2]); } return Q; };
  let up = null, h = null, src = "";
  const F = take(ids.floor);
  if (F.length / 3 > 150) { const dist = dpPct(F.filter((_, i) => i % 3 === 2), .5), pl = dpPlane(F, Math.max(.02, .012 * dist), rnd);
    if (pl && pl.frac > .5) { let { n, d } = pl; if (d < 0) { n = n.map(v => -v); d = -d; } up = n; h = d; src = "pavimento"; } }
  if (!up) { const Cq = take(ids.ceiling);
    if (Cq.length / 3 > 150) { const pl = dpPlane(Cq, .04, rnd); if (pl && pl.frac > .5) { let { n, d } = pl; if (d < 0) { n = n.map(v => -v); d = -d; } up = n.map(v => -v); src = "soffitto"; } } }
  if (!up) return null;
  if (up[1] > 0) up = up.map(v => -v);                           // in su = y negativa (OpenCV)
  const z = [0, 0, 1], fw = dpNorm(z.map((v, i) => v - up[2] * up[i])); let rt = dpCross(fw, up); if (rt[0] < 0) rt = rt.map(v => -v);
  const pitch = Math.asin(Math.max(-1, Math.min(1, up[2]))) * 180 / Math.PI, roll = Math.atan2(up[0], -up[1]) * 180 / Math.PI;
  return { up, fw, rt, h, pitch, roll, src };
}

/** Stanza a scatola dalle pareti: orientamento dominante dalle normali (modulo 90°), distanze delle pareti di fondo,
 *  sinistra e destra dai punti, altezza dal soffitto. Coordinate in pianta: r a destra, f in avanti (fotocamera in 0). */
export function dpRoom(P, N, M, w2, h2, m, ids, G) {
  const toG = k => { const q = [P[3 * k], P[3 * k + 1], P[3 * k + 2]]; return [dpDot(q, G.rt), dpDot(q, G.fw), dpDot(q, G.up) + (G.h ?? 0)]; };
  const W = [], NW = [], C = [];
  for (let j = 0; j < h2; j += 2) for (let i = 0; i < w2; i += 2) { const k = j * w2 + i; if (M[k] <= .5) continue;
    const l = m.lab[Math.min(m.h - 1, Math.floor((j + .5) * m.h / h2)) * m.w + Math.min(m.w - 1, Math.floor((i + .5) * m.w / w2))];
    if (ids.wall.has(l)) { let nq = [N[3 * k], N[3 * k + 1], N[3 * k + 2]]; if (nq[0] * P[3 * k] + nq[1] * P[3 * k + 1] + nq[2] * P[3 * k + 2] > 0) nq = nq.map(v => -v);   // verso la fotocamera
      const nr = dpDot(nq, G.rt), nf = dpDot(nq, G.fw), nu = dpDot(nq, G.up); if (Math.abs(nu) < .35 && Math.hypot(nr, nf) > .5) { W.push(toG(k)); NW.push([nr, nf]); } }
    else if (ids.ceiling.has(l)) C.push(toG(k)[2]); }
  if (W.length < 60) return null;
  // orientamento dominante (istogramma pesato degli angoli delle normali, modulo 90°)
  const hist = new Float64Array(90);
  for (const [nr, nf] of NW) { let a = Math.atan2(nr, -nf) * 180 / Math.PI; a = ((a % 90) + 135) % 90; hist[Math.floor(a) % 90] += 1; }
  let bi = 0, bv = -1; for (let i = 0; i < 90; i++) { const v = hist[(i + 89) % 90] + 2 * hist[i] + hist[(i + 1) % 90]; if (v > bv) { bv = v; bi = i; } }
  const th = -(bi + .5 - 45) * Math.PI / 180;       // rotazione (−45°..45°) che porta la parete di fondo di fronte
  const rot = ([r, f]) => [r * Math.cos(th) - f * Math.sin(th), r * Math.sin(th) + f * Math.cos(th)];
  const back = [], left = [], right = [];
  W.forEach((p, i) => { const q = rot(p), nn = rot(NW[i]), ln = Math.hypot(...nn); if (nn[1] / ln < -.8) back.push(q[1]); else if (nn[0] / ln > .8) left.push(q[0]); else if (nn[0] / ln < -.8) right.push(q[0]); });
  // piano dominante per famiglia: il picco dell'istogramma a 5 cm (più muri paralleli: il più numeroso)
  const peak = (a, sign) => { if (a.length < 25) return null; const lo = dpPct(a, .02), hi = dpPct(a, .98), nb = Math.max(1, Math.ceil((hi - lo) / .05)), hb = new Float64Array(nb + 1);
    for (const v of a) hb[Math.max(0, Math.min(nb, Math.floor((v - lo) / .05)))]++; let b = 0; for (let i = 0; i <= nb; i++) if (hb[i] > hb[b] || (hb[i] === hb[b] && sign * i > sign * b)) b = i;
    const c = lo + (b + .5) * .05, near = a.filter(v => Math.abs(v - c) < .12); return { v: dpPct(near, .5), n: near.length }; };
  const B = peak(back, 1), L = peak(left, -1), R = peak(right, 1);
  const ceil = C.length > 80 ? dpPct(C, .5) : null;
  return { th: th * 180 / Math.PI, db: B && B.v > .3 ? B.v : null, dl: L && L.v < -.1 ? -L.v : null, dr: R && R.v > .1 ? R.v : null, H: ceil && ceil > 1.8 && ceil < 6 ? ceil : null, nWall: W.length, nBack: back.length };
}

/** Spigoli della parete di fondo (0..1 sulla foto) proiettando la scatola con la fotocamera stimata. Se una parete
 *  laterale non si vede, lo spigolo si mette appena fuori dal bordo visibile della parete di fondo (larghezza minima). */
export function dpQuad(G, R, cam, aspect, seen) {
  const th = R.th * Math.PI / 180, unrot = (r, f) => [r * Math.cos(-th) - f * Math.sin(-th), r * Math.sin(-th) + f * Math.cos(-th)];
  const H = R.H || 2.7, h = G.h;
  const proj = (r, f, z) => { const [rr, ff] = unrot(r, f), X = [0, 1, 2].map(i => rr * G.rt[i] + ff * G.fw[i] + (z - h) * G.up[i]); if (X[2] <= 1e-3) return null; return [.5 + cam.fx * X[0] / X[2], .5 + cam.fy * X[1] / X[2]]; };
  const dl = R.dl ?? seen.dl, dr = R.dr ?? seen.dr, db = R.db;
  const q = { fl: proj(-dl, db, 0), fr: proj(dr, db, 0), cl: proj(-dl, db, H), cr: proj(dr, db, H) };
  if (Object.values(q).some(v => !v)) return null;
  return { ...q, openL: R.dl == null, openR: R.dr == null, ceiling: R.H != null, H, hc: h / H };
}

/** Posizione in pianta (r, f), estensioni e quote di un oggetto: punti dentro il riquadro con le etichette indicate. */
export function dpObject(P, M, w2, h2, m, labelIds, box, G) {
  const r = [], f = [], z = []; const [x0, y0, x1, y1] = box;
  for (let j = Math.floor(y0 * h2); j < Math.ceil(y1 * h2); j++) for (let i = Math.floor(x0 * w2); i < Math.ceil(x1 * w2); i++) { const k = j * w2 + i; if (k < 0 || k >= w2 * h2 || M[k] <= .5) continue;
    const l = m.lab[Math.min(m.h - 1, Math.floor((j + .5) * m.h / h2)) * m.w + Math.min(m.w - 1, Math.floor((i + .5) * m.w / w2))]; if (labelIds && !labelIds.has(l)) continue;
    const q = [P[3 * k], P[3 * k + 1], P[3 * k + 2]]; r.push(dpDot(q, G.rt)); f.push(dpDot(q, G.fw)); z.push(dpDot(q, G.up) + G.h); }
  if (r.length < 12) return null;
  return { r: dpPct(r, .5), f: dpPct(f, .5), rmin: dpPct(r, .05), rmax: dpPct(r, .95), fmin: dpPct(f, .08), fmax: dpPct(f, .92), zmin: dpPct(z, .03), zmax: dpPct(z, .97), n: r.length };
}
