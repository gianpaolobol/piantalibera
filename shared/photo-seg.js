// «Da foto al 3D» — segmentazione nel dispositivo (SegFormer-b2 ADE20K con transformers.js, nessun costo
// di server). Dalle maschere per pixel ricaviamo:
//   - gli spigoli della parete di fondo: dove il soffitto e il pavimento incontrano le pareti, le linee
//     di giunzione piegano agli angoli della stanza (adattamento a tre segmenti, robusto agli arredi);
//   - riquadri esatti di porte, finestre e arredi (componenti connesse delle maschere);
//   - l'unione con l'elenco del modello con visione: categoria e misure restano sue, il riquadro diventa
//     quello della maschera; le aperture che la segmentazione non conferma restano escluse.
// Modulo puro: lo usano l'editor (incorporato da scripts/build-editor.mjs, senza «export»), i test e la
// diagnosi su foto vere (scripts/sonda-seg.mjs).

export const SEG_MODEL = "Xenova/segformer-b2-finetuned-ade-512-512";
/* etichette ADE20K → categoria di Pianta Libera (o superficie della stanza) */
export const SEG_CAT = {
  wall: "@wall", floor: "@floor", rug: "@floor", ceiling: "@ceiling",
  door: "porta", "screen door": "portafinestra", windowpane: "finestra",
  sofa: "divano", armchair: "poltrona", chair: "sedia", "swivel chair": "sedia_ufficio", stool: "sgabello", ottoman: "pouf",
  bed: "letto_matrimoniale", table: "tavolo", "coffee table": "tavolino", desk: "scrivania",
  cabinet: "madia", buffet: "madia", "chest of drawers": "cassettiera", wardrobe: "armadio", bookcase: "libreria", shelf: "libreria",
  lamp: "lampada_terra", chandelier: "lampadario", light: "plafoniera", sconce: "applique", "television receiver": "mobile_tv",
  plant: "pianta", flower: "pianta", person: "persona", toilet: "wc", sink: "lavabo", bathtub: "vasca", shower: "doccia",
  refrigerator: "frigorifero", stove: "cucina", oven: "cucina", "kitchen island": "isola", stairs: "scala", stairway: "scala",
};
const OPEN = ["porta", "portafinestra", "porta_scorrevole", "finestra"];
const FAMILY = c => OPEN.includes(c) ? "apertura" : ({ divano: "sedute", divano_angolare: "sedute", poltrona: "sedute", sedia: "sedie", sedia_ufficio: "sedie", sgabello: "sedie", pouf: "sedute",
  letto_matrimoniale: "letto", letto_singolo: "letto", tavolo: "tavolo", tavolo_tondo: "tavolo", tavolino: "tavolino", tavolino_tondo: "tavolino", scrivania: "tavolo", isola: "cucina", cucina: "cucina",
  madia: "contenitori", cassettiera: "contenitori", armadio: "contenitori", libreria: "contenitori", mobile_tv: "contenitori",
  lampada_terra: "lampada", lampadario: "lampada", plafoniera: "lampada", faretto: "lampada", applique: "lampada" }[c] || c);

/** Mappa delle etichette ridotta a `wt` colonne: {w, h, lab: Uint8Array (indice in names, 255 = nessuna), names}. */
export function labelMap(segs, wt = 320) {
  const W0 = segs[0]?.mask?.width, H0 = segs[0]?.mask?.height; if (!W0) return null;
  const w = Math.min(wt, W0), h = Math.max(1, Math.round(H0 * w / W0)), lab = new Uint8Array(w * h).fill(255), score = new Float32Array(w * h), names = [];
  segs.forEach((s, k) => {
    names.push(s.label); const d = s.mask.data, ch = d.length / (W0 * H0) | 0 || 1;
    for (let y = 0; y < h; y++) { const sy = Math.min(H0 - 1, Math.floor((y + .5) * H0 / h)) * W0;
      for (let x = 0; x < w; x++) { const v = d[(sy + Math.min(W0 - 1, Math.floor((x + .5) * W0 / w))) * ch]; const i = y * w + x; if (v > 127 && v >= score[i]) { score[i] = v; lab[i] = k; } } }
  });
  return { w, h, lab, names };
}
const idsOf = (m, cat) => new Set(m.names.map((n, i) => SEG_CAT[n] === cat ? i : -1).filter(i => i >= 0));

/* retta ai minimi quadrati con scarto dei peggiori (robusta a piccoli disturbi) */
function fitLine(P) {
  if (P.length < 2) return null;
  const once = Q => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of Q) { sx += x; sy += y; sxx += x * x; sxy += x * y; } const n = Q.length, d = n * sxx - sx * sx; if (Math.abs(d) < 1e-9) return null; const a = (n * sxy - sx * sy) / d; return { a, b: (sy - a * sx) / n }; };
  let L = once(P); if (!L || P.length < 6) return L;
  const r = P.map(([x, y]) => Math.abs(y - (L.a * x + L.b))).sort((u, v) => u - v), lim = r[Math.floor(r.length * .75)] + 1e-6;
  return once(P.filter(([x, y]) => Math.abs(y - (L.a * x + L.b)) <= lim)) || L;
}
const cost = (P, L) => L ? P.reduce((s, [x, y]) => s + Math.min(Math.abs(y - (L.a * x + L.b)), 8), 0) : 1e9;
/** Spezzata a 1–3 segmenti che segue una linea di giunzione: {segs:[{x0,x1,L}], err}. */
export function fitPolyline(P, w) {
  if (P.length < 8) return null;
  P = [...P].sort((p, q) => p[0] - q[0]);
  const xs = P.map(p => p[0]), lo = xs[0], hi = xs[xs.length - 1], grid = [];
  for (let k = 1; k < 24; k++) grid.push(lo + (hi - lo) * k / 24);
  const part = (a, b) => P.filter(p => p[0] >= a && p[0] < b);
  const PEN = P.length * .35;               // un segmento in più deve ridurre l'errore in modo netto
  let best = { segs: [{ x0: lo, x1: hi + 1, L: fitLine(P) }], err: cost(P, fitLine(P)) };
  for (const a of grid) {
    const A = part(lo, a), B = part(a, hi + 1); if (A.length < 4 || B.length < 4) continue;
    const LA = fitLine(A), LB = fitLine(B), e = cost(A, LA) + cost(B, LB) + PEN;
    if (e < best.err) best = { segs: [{ x0: lo, x1: a, L: LA }, { x0: a, x1: hi + 1, L: LB }], err: e };
    for (const b of grid) { if (b <= a + (hi - lo) * .12) continue;
      const A2 = part(lo, a), M = part(a, b), C = part(b, hi + 1); if (A2.length < 4 || M.length < 4 || C.length < 4) continue;
      const L1 = fitLine(A2), L2 = fitLine(M), L3 = fitLine(C), e3 = cost(A2, L1) + cost(M, L2) + cost(C, L3) + 2 * PEN;
      if (e3 < best.err) best = { segs: [{ x0: lo, x1: a, L: L1 }, { x0: a, x1: b, L: L2 }, { x0: b, x1: hi + 1, L: L3 }], err: e3 }; }
  }
  return best;
}
/* spigolo vero tra due segmenti: intersezione delle rette (più precisa del punto di rottura della griglia) */
const meet = (L1, L2, xGuess) => { const d = L1.a - L2.a; if (Math.abs(d) < 1e-6) return xGuess; const x = (L2.b - L1.b) / d; return Math.abs(x - xGuess) < 40 ? x : xGuess; };

/** Spigoli della parete di fondo dalle maschere. Coordinate 0..1; null se la foto non basta. */
export function wallCorners(m) {
  if (!m) return null;
  const W = idsOf(m, "@wall"), F = idsOf(m, "@floor"), C = idsOf(m, "@ceiling"), { w, h, lab } = m, at = (x, y) => lab[y * w + x];
  const top = [], bot = [];
  for (let x = 0; x < w; x++) {
    for (let y = h - 3; y >= 1; y--) if (C.has(at(x, y)) && W.has(at(x, y + 1)) && W.has(at(x, y + 2))) { top.push([x, y + .5]); break; }      // soffitto ↔ parete
    for (let y = 2; y < h - 1; y++) if (F.has(at(x, y)) && W.has(at(x, y - 1)) && W.has(at(x, y - 2))) { bot.push([x, y - .5]); break; }    // parete ↔ pavimento
  }
  const pc = top.length >= w * .25 ? fitPolyline(top, w) : null, pf = bot.length >= w * .15 ? fitPolyline(bot, w) : null;
  const back = pl => { if (!pl) return null; const s = pl.segs; if (s.length === 3) return 1; if (s.length === 1) return 0; return Math.abs(s[0].L.a) <= Math.abs(s[1].L.a) ? 0 : 1; };
  const ends = (pl, i) => { const s = pl.segs, x0 = i > 0 ? meet(s[i - 1].L, s[i].L, s[i].x0) : 0, x1 = i < s.length - 1 ? meet(s[i].L, s[i + 1].L, s[i].x1) : w - 1; return [x0, x1]; };
  const N = ([x, y]) => [+(x / (w - 1)).toFixed(4), +(y / (h - 1)).toFixed(4)];
  let cl, cr, fl, fr, xL, xR;
  if (pc) { const i = back(pc), L = pc.segs[i].L; [xL, xR] = ends(pc, i); cl = [xL, L.a * xL + L.b]; cr = [xR, L.a * xR + L.b]; }
  if (pf) {
    const i = back(pf), L = pf.segs[i].L; let [a, b] = ends(pf, i);
    if (pc) { // gli spigoli in basso stanno sotto quelli in alto (a meno della prospettiva): si prendono i più vicini
      const near = (x, cands) => cands.reduce((p, q) => Math.abs(q - x) < Math.abs(p - x) ? q : p);
      const kinks = [0, w - 1, ...pf.segs.slice(1).map((s, k) => meet(pf.segs[k].L, s.L, s.x0))];
      a = Math.abs(near(xL, kinks) - xL) < w * .08 ? near(xL, kinks) : xL; b = Math.abs(near(xR, kinks) - xR) < w * .08 ? near(xR, kinks) : xR;
      const LB = fitLine(bot.filter(p => p[0] > a + 2 && p[0] < b - 2)) || L; fl = [a, LB.a * a + LB.b]; fr = [b, LB.a * b + LB.b];
    } else { fl = [a, L.a * a + L.b]; fr = [b, L.a * b + L.b]; }
  }
  if (!fl && cl) {   // pavimento coperto dagli arredi: giù fino all'ultimo pixel di parete sotto gli spigoli alti
    const lowWall = x => { const xi = Math.round(Math.min(w - 1, Math.max(0, x))); for (let y = h - 1; y > 0; y--) if (W.has(at(xi, y))) return y; return h * .8; };
    fl = [cl[0], lowWall(cl[0] + 2)]; fr = [cr[0], lowWall(cr[0] - 2)];
  }
  if (!fl || fr[0] - fl[0] < w * .1) return null;
  const conf = (pc ? .5 : 0) + (pf ? .4 : .1) * Math.min(1, bot.length / (w * .4));
  return { fl: N(fl), fr: N(fr), cl: cl ? N(cl) : N([fl[0], fl[1] - h * .55]), cr: cr ? N(cr) : N([fr[0], fr[1] - h * .55]), ceiling: !!pc, conf: +conf.toFixed(2), source: "segmentazione" };
}

/** Componenti connesse per categoria (porte, finestre, arredi): [{category, label, box 0..1, area}]. */
export function segComponents(m, roomType = "") {
  if (!m) return [];
  const { w, h, lab, names } = m, catOf = names.map(n => { let c = SEG_CAT[n]; if (c === "madia" && n === "cabinet" && /cucin|kitchen/i.test(roomType)) c = "cucina"; return c && c[0] !== "@" ? c : null; });
  const seen = new Uint8Array(w * h), out = [], minA = w * h * .0025, Q = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = lab[i] === 255 ? null : catOf[lab[i]]; if (!c || seen[i]) continue;
    let qh = 0, qt = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; Q[qt++] = i; seen[i] = 1;
    while (qh < qt) { const j = Q[qh++], x = j % w, y = (j / w) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [j - 1, j + 1, j - w, j + w]) { if (k < 0 || k >= w * h || seen[k] || (k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue; const l = lab[k]; if (l !== 255 && catOf[l] === c) { seen[k] = 1; Q[qt++] = k; } } }
    if (n >= minA) out.push({ category: c, label: names[lab[i]], box: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h].map(v => +v.toFixed(4)), area: +(n / (w * h)).toFixed(4), fill: +(n / ((x1 - x0 + 1) * (y1 - y0 + 1))).toFixed(2) });
  }
  return out.sort((a, b) => b.area - a.area);
}

const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
const inside = (a, b) => { const cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2; return cx > b[0] && cx < b[2] && cy > b[1] && cy < b[3]; };
const near = (a, b) => Math.max(iou(a, b), inside(a, b) || inside(b, a) ? .2 : 0);

/** Unisce elementi dell'analisi e componenti della segmentazione. items: quelli di normalizeAnalysis. */
export function mergeSegmentation(items, comps, quad = null) {
  const out = items.map(it => ({ ...it })), used = new Set();
  const floorY = x => quad ? quad.fl[1] + (quad.fr[1] - quad.fl[1]) * (x - quad.fl[0]) / Math.max(1e-6, quad.fr[0] - quad.fl[0]) : .8;
  for (const c of comps) {
    const fam = FAMILY(c.category);
    let best = 0, bi = -1;
    out.forEach((it, i) => { if (used.has(i) || FAMILY(it.category) !== fam) return; const v = near(it.box, c.box); if (v > best) { best = v; bi = i; } });
    if (bi >= 0 && best >= .08) {
      used.add(bi); const it = out[bi];
      // i riquadri del rilevatore (istanze) restano se coincidono già; altrimenti vince la maschera
      if (!(it.source === "rilevatore" && iou(it.box, c.box) > .5)) it.box = c.box;
      it.source = it.source === "rilevatore" ? "rilevatore+segmentazione" : "segmentazione"; it.seg = true;
      continue;
    }
    // non trovato dal modello: si aggiunge se è un'apertura o un arredo abbastanza grande
    if (fam === "apertura" || c.area > .006) {
      let cat = c.category; const C = (out.find(o => o.category === cat) || {});
      if (cat === "finestra" && c.box[3] >= floorY((c.box[0] + c.box[2]) / 2) - .03) cat = "portafinestra";   // vetrata fino a terra
      out.push({ category: cat, label: "", box: c.box, w: C.w, d: C.d, h: C.h, facing: "camera", against: "none", source: "segmentazione", seg: true, added: true });
      used.add(out.length - 1);
    }
  }
  // aperture del modello non confermate dalla segmentazione: probabili doppioni o abbagli, escluse (si possono riattivare)
  out.forEach((it, i) => { if (OPEN.includes(it.category) && !it.seg && comps.some(c => FAMILY(c.category) === "apertura")) it.doubt = true; });
  // doppioni tra aperture: due elementi sullo stesso riquadro → resta il primo
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++)
    if (FAMILY(out[i].category) === FAMILY(out[j].category) && iou(out[i].box, out[j].box) > .55 && !out[j].dup) out[j].dup = true;
  return out.filter(it => !it.dup);
}
