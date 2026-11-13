// Banco di prova del riconoscimento CAD → BIM (fase A di docs/progetto-cad-bim.md).
// Genera piante residenziali casuali ma realistiche e le «disegna» come farebbe un CAD:
// facce dei muri, spalle delle aperture, simboli di porte e finestre, arredi, quote, retini, testi, cornice e cartiglio,
// con stili di layer diversi ed errori voluti (linee staccate, spezzate, doppie, che sbordano).
// Ogni linea porta il suo ruolo vero: la verità serve a misurare il riconoscimento e, più avanti, ad addestrare il modello.
// Unità: metri; coordinate dell'editor (x a destra, y verso sud). Nessuna dipendenza.

export function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = v => Math.round(v * 100) / 100;   // centimetro

export const STILI = {
  ordinato:   { layer: "it",  errori: 0,   retino: false, quote: true,  arredi: true,  cornice: false, ruota: false },
  inglese:    { layer: "en",  errori: 0,   retino: false, quote: true,  arredi: true,  cornice: false, ruota: false },
  layer0:     { layer: "0",   errori: 0,   retino: false, quote: true,  arredi: true,  cornice: false, ruota: false },
  retinato:   { layer: "it",  errori: 0,   retino: true,  quote: true,  arredi: true,  cornice: false, ruota: false },
  tavola:     { layer: "it",  errori: 0,   retino: false, quote: true,  arredi: true,  cornice: true,  ruota: false },
  sporco:     { layer: "it",  errori: .35, retino: false, quote: true,  arredi: true,  cornice: false, ruota: false },
  ruotato:    { layer: "it",  errori: 0,   retino: false, quote: true,  arredi: true,  cornice: false, ruota: true  },
  difficile:  { layer: "0",   errori: .35, retino: true,  quote: true,  arredi: true,  cornice: true,  ruota: true  },
};
const LAYER = {
  it: { muro: "MURI", porta: "PORTE", finestra: "FINESTRE", arredo: "ARREDI", quota: "QUOTE", testo: "TESTI", retino: "RETINI", cornice: "CARTIGLIO" },
  en: { muro: "A-WALL", porta: "A-DOOR", finestra: "A-GLAZ", arredo: "A-FURN", quota: "A-ANNO-DIMS", testo: "A-ANNO-TEXT", retino: "A-WALL-PATT", cornice: "A-ANNO-TTLB" },
  "0": { muro: "0", porta: "0", finestra: "0", arredo: "0", quota: "0", testo: "0", retino: "0", cornice: "0" },
};
const NOMI = ["Soggiorno", "Cucina", "Camera", "Camera", "Bagno", "Studio", "Disimpegno", "Ripostiglio", "Lavanderia", "Pranzo"];

/** Una pianta: verità (muri, aperture, locali) e disegno (segmenti, archi, testi) con il ruolo di ogni elemento. */
export function generaPianta(seed, stile = "ordinato"){
  const R = rng(seed), S = STILI[stile], LY = LAYER[S.layer];
  const rr = (a, b) => a + (b - a) * R(), ri = (a, b) => Math.floor(rr(a, b + 1)), pick = a => a[Math.floor(R() * a.length)];
  const To = pick([.3, .3, .35, .4, .45]), Ti = pick([.08, .1, .1, .12, .12, .15]), Tp = pick([.2, .25, .3]);
  // sagoma: rettangolo o L (in asse dei muri esterni)
  const W = r2(rr(7.5, 15)), D = r2(rr(6, 11.5));
  let poly = [[0, 0], [W, 0], [W, D], [0, D]], rects = [[0, 0, W, D]], cut = null;
  if (R() < .4){
    const cw = r2(rr(.3, .45) * W), cd = r2(rr(.3, .5) * D), corner = ri(0, 3);
    const [x0, y0] = [[0, 0], [W - cw, 0], [W - cw, D - cd], [0, D - cd]][corner];
    cut = [x0, y0, x0 + cw, y0 + cd];
    if (corner === 0){ poly = [[cw, 0], [W, 0], [W, D], [0, D], [0, cd], [cw, cd]]; rects = [[cw, 0, W, cd], [0, cd, W, D]]; }
    if (corner === 1){ poly = [[0, 0], [W - cw, 0], [W - cw, cd], [W, cd], [W, D], [0, D]]; rects = [[0, 0, W - cw, cd], [0, cd, W, D]]; }
    if (corner === 2){ poly = [[0, 0], [W, 0], [W, D - cd], [W - cw, D - cd], [W - cw, D], [0, D]]; rects = [[0, 0, W, D - cd], [0, D - cd, W - cw, D]]; }
    if (corner === 3){ poly = [[0, 0], [W, 0], [W, D], [cw, D], [cw, D - cd], [0, D - cd]]; rects = [[0, 0, W, D - cd], [cw, D - cd, W, D]]; }
  }
  const walls = [];
  const addWall = (a, b, t, ext) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) > .05) walls.push({ a, b, thick: t, ext }); };
  poly.forEach((p, i) => addWall(p, poly[(i + 1) % poly.length], To, true));
  if (rects.length === 2){ const [A, B] = rects; addWall([Math.max(A[0], B[0]), A[3]], [Math.min(A[2], B[2]), A[3]], R() < .5 ? Tp : Ti, false); }
  // locali: divisione ricorsiva (BSP) fino a 9–24 m²
  const leaves = [];
  const split = (r, depth) => {
    const [x0, y0, x1, y1] = r, w = x1 - x0, h = y1 - y0, area = w * h;
    if (depth > 4 || area < rr(9, 24) || (w < 3.2 && h < 3.2)){ leaves.push(r); return; }
    const vert = w > h ? R() < .8 : R() < .2;
    const span = vert ? w : h; if (span < 3.2){ leaves.push(r); return; }
    const c = r2((vert ? x0 : y0) + span * rr(.35, .65));
    const t = R() < .2 ? Tp : Ti;
    if (vert){ addWall([c, y0], [c, y1], t, false); split([x0, y0, c, y1], depth + 1); split([c, y0, x1, y1], depth + 1); }
    else { addWall([x0, c], [x1, c], t, false); split([x0, y0, x1, c], depth + 1); split([x0, c, x1, y1], depth + 1); }
  };
  rects.forEach(r => split(r, 0));
  walls.forEach((w, i) => w.id = "w" + i);
  // giunzioni: lungo ogni muro, i punti dove arrivano gli altri (le aperture stanno lontane)
  const onAxis = (p, w) => { const [a, b] = [w.a, w.b], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const s = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], d = Math.abs((p[0] - a[0]) * u[1] - (p[1] - a[1]) * u[0]); return d < 1e-6 && s > -1e-6 && s < L + 1e-6 ? s : null; };
  for (const w of walls){ w.len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); w.u = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len]; w.n = [-w.u[1], w.u[0]]; w.junct = [];
    for (const v of walls) if (v !== w) for (const p of [v.a, v.b]){ const s = onAxis(p, w); if (s !== null) w.junct.push([s, v.thick]); } }
  // prolungamento delle estremità fino alla faccia del muro incontrato (unione pulita degli spigoli)
  const extAt = (w, p) => { let e = 0; for (const v of walls) if (v !== w && onAxis(p, v) !== null) e = Math.max(e, v.thick / 2); return e; };
  for (const w of walls){ w.e0 = extAt(w, w.a); w.e1 = extAt(w, w.b); }
  // aperture negli intervalli liberi
  const openings = [];
  const freeIntervals = w => { const cuts = [[-1, 0], ...w.junct.map(([s, t]) => [s - t / 2, s + t / 2]), [w.len, w.len + 1]].sort((a, b) => a[0] - b[0]); const out = [];
    for (let i = 0; i + 1 < cuts.length; i++){ const a = cuts[i][1] + .15, b = cuts[i + 1][0] - .15; if (b - a > .7) out.push([a, b]); } return out; };
  let entrance = false;
  for (const w of [...walls].sort(() => R() - .5)){
    for (const [a, b] of freeIntervals(w)){
      const room = b - a;
      if (!w.ext){ if (room >= .9 && R() < .85){ const dw = pick([.7, .8, .8, .9, 1.2]); if (dw <= room){ const t = r2(a + dw / 2 + R() * (room - dw)); openings.push({ wall: w.id, t, w: dw, type: "door", style: pick(["battente", "battente", "battente", "scorrevole", dw >= 1.2 ? "doppia" : "battente"]) }); } } continue; }
      if (!entrance && room >= 1.1){ const t = r2(a + .45 + R() * (room - .9)); openings.push({ wall: w.id, t, w: .9 + (R() < .3 ? .1 : 0), type: "door", style: "battente" }); entrance = true; continue; }
      let s = a, nw = 0; while (b - s > .8 && nw < (room > 5 ? 2 : 1) && R() < (nw ? .45 : .8)){ nw++; const ww = r2(Math.min(b - s - .2, pick([.6, .8, 1, 1.2, 1.4, 1.6, 1.8]))); if (ww < .5) break; const st = s + R() * Math.min(1.5, b - s - ww);
        openings.push({ wall: w.id, t: r2(st + ww / 2), w: ww, type: "window", style: pick(["semplice", "doppia", "telaio"]), sill: ww >= 1.6 && R() < .5 ? 0 : .9 }); s = st + ww + rr(1, 2.5); }
    }
  }
  // ---------- disegno ----------
  const segs = [], arcs = [], texts = [];
  const seg = (x0, y0, x1, y1, ruolo, layer) => segs.push([x0, y0, x1, y1, layer ?? LY[ruolo], ruolo]);
  // sagoma dei muri: unione dei rettangoli meno i vani, su griglia di coordinate
  const solid = walls.map(w => ({ w, s0: -w.e0, s1: w.len + w.e1, h: w.thick / 2 }));
  const voids = openings.map(o => { const w = walls.find(x => x.id === o.wall); return { w, s0: o.t - o.w / 2, s1: o.t + o.w / 2, h: w.thick / 2 + 1e-4 }; });
  const box = r => { const A = [r.w.a[0] + r.w.u[0] * r.s0, r.w.a[1] + r.w.u[1] * r.s0], B = [r.w.a[0] + r.w.u[0] * r.s1, r.w.a[1] + r.w.u[1] * r.s1];
    const hx = Math.abs(r.w.n[0]) * r.h, hy = Math.abs(r.w.n[1]) * r.h; return [Math.min(A[0], B[0]) - hx, Math.min(A[1], B[1]) - hy, Math.max(A[0], B[0]) + hx, Math.max(A[1], B[1]) + hy]; };
  const SB = solid.map(box), VB = voids.map(box);
  const inB = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
  // locali veri: dentro il riquadro della divisione, tutto ciò che non è muro (esatto anche con lati su muri di spessore diverso)
  const names = [...NOMI].sort(() => R() - .5);
  const rooms = leaves.map(([x0, y0, x1, y1], i) => {
    const cut = (a, b, k) => [...new Set([a, b, ...SB.flatMap(q => [q[k], q[k + 2]]).filter(v => v > a && v < b)].map(v => +v.toFixed(6)))].sort((p, q) => p - q);
    const X = cut(x0, x1, 0), Y = cut(y0, y1, 1), free = (ii, jj) => ii >= 0 && jj >= 0 && ii < X.length - 1 && jj < Y.length - 1 && !SB.some(q => inB((X[ii] + X[ii + 1]) / 2, (Y[jj] + Y[jj + 1]) / 2, q));
    let area = 0; for (let ii = 0; ii < X.length - 1; ii++) for (let jj = 0; jj < Y.length - 1; jj++) if (free(ii, jj)) area += (X[ii + 1] - X[ii]) * (Y[jj + 1] - Y[jj]);
    return { name: names[i % names.length], pts: contorno(X, Y, free), area: +area.toFixed(4) };
  });
  const xs = [...new Set([...SB, ...VB].flatMap(b => [b[0], b[2]]).map(v => +v.toFixed(5)))].sort((a, b) => a - b);
  const ys = [...new Set([...SB, ...VB].flatMap(b => [b[1], b[3]]).map(v => +v.toFixed(5)))].sort((a, b) => a - b);
  const full = (i, j) => { if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false; const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2; return SB.some(b => inB(x, y, b)) && !VB.some(b => inB(x, y, b)); };
  const F = xs.map((_, i) => ys.map((_, j) => full(i, j)));
  const isF = (i, j) => i >= 0 && j >= 0 && i < xs.length - 1 && j < ys.length - 1 && F[i][j];
  const edges = [];
  for (let j = 0; j < ys.length; j++){ let st = null;   // orizzontali
    for (let i = 0; i <= xs.length - 1; i++){ const on = i < xs.length - 1 && isF(i, j - 1) !== isF(i, j); if (on && st === null) st = i; if (!on && st !== null){ edges.push([xs[st], ys[j], xs[i], ys[j]]); st = null; } } }
  for (let i = 0; i < xs.length; i++){ let st = null;   // verticali
    for (let j = 0; j <= ys.length - 1; j++){ const on = j < ys.length - 1 && isF(i - 1, j) !== isF(i, j); if (on && st === null) st = j; if (!on && st !== null){ edges.push([xs[i], ys[st], xs[i], ys[j]]); st = null; } } }
  for (const e of edges) seg(...e, "muro");
  // retino dei muri (45°, passo 10 cm) nelle parti piene
  if (S.retino) for (const b of SB) for (let k = b[0] - (b[3] - b[1]); k < b[2]; k += .1){
    const pts = []; const y0 = b[1], y1 = b[3];
    let xa = k, ya = y1, xb = k + (y1 - y0), yb = y0;   // da basso-sinistra a alto-destra in coordinate pianta
    if (xa < b[0]){ ya -= b[0] - xa; xa = b[0]; } if (xb > b[2]){ yb += xb - b[2]; xb = b[2]; }
    if (xb - xa < .02) continue; const mx = (xa + xb) / 2, my = (ya + yb) / 2;
    if (VB.some(v => inB(mx, my, v))) continue; pts.push(xa, ya, xb, yb); seg(...pts, "retino");
  }
  // simboli delle aperture
  for (const o of openings){
    const w = walls.find(x => x.id === o.wall), P = (s, off) => [w.a[0] + w.u[0] * s + w.n[0] * off, w.a[1] + w.u[1] * s + w.n[1] * off];
    const s0 = o.t - o.w / 2, s1 = o.t + o.w / 2, h = w.thick / 2;
    if (o.type === "window"){
      const offs = o.style === "semplice" ? [0] : o.style === "doppia" ? [-.02, .02] : [-h / 2, 0, h / 2];
      for (const f of offs){ const A = P(s0, f), B = P(s1, f); seg(A[0], A[1], B[0], B[1], "finestra"); }
      continue;
    }
    const side = R() < .5 ? 1 : -1;
    if (o.style === "scorrevole"){ for (const [f, a, b] of [[-.02, s0, s0 + o.w * .6], [.02, s1 - o.w * .6, s1]]){ const A = P(a, f), B = P(b, f); seg(A[0], A[1], B[0], B[1], "porta"); } continue; }
    const hinges = o.style === "doppia" ? [[s0, 1, o.w / 2], [s1, -1, o.w / 2]] : [[R() < .5 ? s0 : s1, 0, o.w]];
    for (let [hs, dir, rad] of hinges){
      if (!dir) dir = hs === s0 ? 1 : -1;
      const H = P(hs, side * h), E = [H[0] + w.n[0] * side * rad, H[1] + w.n[1] * side * rad];
      seg(H[0], H[1], E[0], E[1], "porta");
      const C = P(hs + dir * rad, side * h), a0 = Math.atan2(E[1] - H[1], E[0] - H[0]), a1 = Math.atan2(C[1] - H[1], C[0] - H[0]);
      let lo = Math.min(a0, a1), hi = Math.max(a0, a1); if (hi - lo > Math.PI){ [lo, hi] = [hi, lo + 2 * Math.PI]; }
      arcs.push({ cx: H[0], cy: H[1], r: rad, a0: lo, a1: hi, layer: LY.porta, ruolo: "porta" });
    }
  }
  // arredi, testi dei locali
  for (const r of rooms){
    const l = Math.min(...r.pts.map(p => p[0])), rt = Math.max(...r.pts.map(p => p[0])), t = Math.min(...r.pts.map(p => p[1])), b = Math.max(...r.pts.map(p => p[1])), cx = (l + rt) / 2, cy = (t + b) / 2;
    texts.push({ x: cx, y: cy, text: r.name.toUpperCase(), layer: LY.testo });
    texts.push({ x: cx, y: cy + .4, text: `${r.area.toFixed(2).replace(".", ",")} m²`, layer: LY.testo });
    if (S.arredi && rt - l > 2.2 && b - t > 2.2 && R() < .7){
      const fw = r2(rr(.8, Math.min(2, rt - l - 1))), fd = r2(rr(.5, Math.min(2, b - t - 1))), fx = l + .3 + R() * (rt - l - fw - .6), fy = t + .3 + R() * (b - t - fd - .6);
      for (const [a, c] of [[[fx, fy], [fx + fw, fy]], [[fx + fw, fy], [fx + fw, fy + fd]], [[fx + fw, fy + fd], [fx, fy + fd]], [[fx, fy + fd], [fx, fy]]]) seg(a[0], a[1], c[0], c[1], "arredo");
      if (R() < .5) seg(fx + .05, fy + .05, fx + fw - .05, fy + .05, "arredo");   // bordo interno (cuscino, piano)
    }
  }
  // quote esterne: linea di quota, linee di richiamo, tacche, testo
  if (S.quote) for (const w of walls.filter(w => w.ext)){
    const out = (() => { const m = [(w.a[0] + w.b[0]) / 2 + w.n[0] * .5, (w.a[1] + w.b[1]) / 2 + w.n[1] * .5]; return inside(poly, m) ? -1 : 1; })();
    const off = out * (w.thick / 2 + 1), P = (s, f) => [w.a[0] + w.u[0] * s + w.n[0] * f, w.a[1] + w.u[1] * s + w.n[1] * f];
    const A = P(-w.e0, off), B = P(w.len + w.e1, off); seg(A[0], A[1], B[0], B[1], "quota");
    for (const s of [-w.e0, w.len + w.e1]){ const p = P(s, out * (w.thick / 2 + .2)), q = P(s, off + out * .1); seg(p[0], p[1], q[0], q[1], "quota");
      const m = P(s, off), k = .08; seg(m[0] - k, m[1] - k, m[0] + k, m[1] + k, "quota"); }
    const M = P(w.len / 2, off + out * .15); texts.push({ x: M[0], y: M[1], text: (w.len + w.e0 + w.e1).toFixed(2).replace(".", ","), layer: LY.quota });
  }
  // cornice e cartiglio
  if (S.cornice){
    const xsA = segs.flatMap(s => [s[0], s[2]]), ysA = segs.flatMap(s => [s[1], s[3]]);
    const X0 = Math.min(...xsA) - 2, Y0 = Math.min(...ysA) - 2, X1 = Math.max(...xsA) + 2, Y1 = Math.max(...ysA) + 4;
    for (const [a, b, c, d] of [[X0, Y0, X1, Y0], [X1, Y0, X1, Y1], [X1, Y1, X0, Y1], [X0, Y1, X0, Y0]]) seg(a, b, c, d, "cornice");
    const cx0 = X1 - 6, cy0 = Y1 - 2.2;
    for (const [a, b, c, d] of [[cx0, cy0, X1, cy0], [cx0, cy0, cx0, Y1], [cx0, cy0 + .7, X1, cy0 + .7], [cx0, cy0 + 1.4, X1, cy0 + 1.4], [cx0 + 3, cy0 + .7, cx0 + 3, Y1]]) seg(a, b, c, d, "cornice");
    texts.push({ x: cx0 + .2, y: cy0 + .4, text: "PIANTA PIANO TERRA", layer: LY.cornice }, { x: cx0 + .2, y: cy0 + 1.1, text: "SCALA 1:100", layer: LY.cornice });
  }
  // errori del disegnatore sulle linee dei muri
  if (S.errori){
    const out = [];
    for (const s of segs){
      if (s[5] !== "muro" || R() > S.errori){ out.push(s); continue; }
      const L = Math.hypot(s[2] - s[0], s[3] - s[1]), u = [(s[2] - s[0]) / L, (s[3] - s[1]) / L], k = R();
      if (k < .3){ const g = rr(.005, .03), e = R() < .5; out.push(e ? [s[0], s[1], s[2] - u[0] * g, s[3] - u[1] * g, s[4], s[5]] : [s[0] + u[0] * g, s[1] + u[1] * g, s[2], s[3], s[4], s[5]]); }   // staccata
      else if (k < .55 && L > .4){ const m = rr(.2, .8) * L, g = rr(0, .01); out.push([s[0], s[1], s[0] + u[0] * m, s[1] + u[1] * m, s[4], s[5]], [s[0] + u[0] * (m + g), s[1] + u[1] * (m + g), s[2], s[3], s[4], s[5]]); }   // spezzata
      else if (k < .75){ out.push(s, [...s]); }   // doppia
      else { const g = rr(.01, .04); out.push([s[0] - u[0] * g, s[1] - u[1] * g, s[2] + u[0] * g * R(), s[3] + u[1] * g * R(), s[4], s[5]]); }   // sborda
    }
    segs.splice(0, segs.length, ...out);
  }
  const verita = { walls: walls.map(({ id, a, b, thick, ext }) => ({ id, a, b, thick, ext })), openings, rooms };
  const disegno = { segs, arcs, texts };
  if (S.ruota){ const th = rr(-Math.PI / 4, Math.PI / 4); ruota(verita, disegno, th); verita.angolo = th; }
  return { seed, stile, verita, disegno };
}

/** Contorno di un insieme di celle (lati di confine concatenati, punti allineati tolti). */
function contorno(X, Y, free){
  const edges = new Map(), k = (i, j) => i + "," + j;
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++){ if (!free(i, j)) continue;
    if (!free(i, j - 1)) edges.set(k(i, j), [i + 1, j]); if (!free(i + 1, j)) edges.set(k(i + 1, j), [i + 1, j + 1]);
    if (!free(i, j + 1)) edges.set(k(i + 1, j + 1), [i, j + 1]); if (!free(i - 1, j)) edges.set(k(i, j + 1), [i, j]); }
  const start = edges.keys().next().value, out = []; let cur = start, g = 0;
  do { const [i, j] = cur.split(",").map(Number); out.push([X[i], Y[j]]); const n = edges.get(cur); cur = k(n[0], n[1]); } while (cur !== start && g++ < 1e5);
  return out.filter((p, m) => { const a = out[(m - 1 + out.length) % out.length], b = out[(m + 1) % out.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-12; });
}
function inside(poly, [x, y]){ let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }

/** Ruota verità e disegno attorno all'origine (tavole con il nord non in alto). */
function ruota(v, d, th){
  const c = Math.cos(th), s = Math.sin(th), P = ([x, y]) => [x * c - y * s, x * s + y * c];
  for (const w of v.walls){ w.a = P(w.a); w.b = P(w.b); }
  for (const r of v.rooms) r.pts = r.pts.map(P);
  for (const g of d.segs){ const [a, b] = [P([g[0], g[1]]), P([g[2], g[3]])]; g[0] = a[0]; g[1] = a[1]; g[2] = b[0]; g[3] = b[1]; }
  for (const a of d.arcs){ [a.cx, a.cy] = P([a.cx, a.cy]); a.a0 += th; a.a1 += th; }
  for (const t of d.texts){ [t.x, t.y] = P([t.x, t.y]); }
}

/** Il banco: n piante per stile, semi fissi (stesso banco a ogni esecuzione). */
export function banco(n = 25, stili = Object.keys(STILI)){ const out = []; stili.forEach((st, k) => { for (let i = 0; i < n; i++) out.push(generaPianta(1000 * (k + 1) + i, st)); }); return out; }

/** DXF R12 (metri) della pianta: per vederla in un CAD e per il caricamento dall'editor. */
export function inDXF(p){
  const o = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"], f = v => String(+v.toFixed(5));
  for (const s of p.disegno.segs) o.push("0", "LINE", "8", s[4], "10", f(s[0]), "20", f(-s[1]), "11", f(s[2]), "21", f(-s[3]));
  for (const a of p.disegno.arcs) o.push("0", "ARC", "8", a.layer, "10", f(a.cx), "20", f(-a.cy), "40", f(a.r), "50", f(-a.a1 * 180 / Math.PI), "51", f(-a.a0 * 180 / Math.PI));
  for (const t of p.disegno.texts) o.push("0", "TEXT", "8", t.layer, "10", f(t.x), "20", f(-t.y), "40", "0.25", "1", t.text);
  o.push("0", "ENDSEC", "0", "EOF"); return o.join("\n");
}
