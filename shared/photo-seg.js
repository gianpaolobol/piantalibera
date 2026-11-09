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
    names.push(String(s.label).trim()); const d = s.mask.data, ch = d.length / (W0 * H0) | 0 || 1;
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
  // parete di fondo = il tratto davanti alla fotocamera, cioè quello che contiene il centro della foto
  const back = pl => { if (!pl) return null; const s = pl.segs, c = w / 2; let i = s.findIndex(g => g.x0 <= c && g.x1 > c); if (i < 0) i = s.reduce((b, g, k) => (g.x1 - g.x0) > (s[b].x1 - s[b].x0) ? k : b, 0); return i; };
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
  // «fuori»: solo classi di esterni (cielo, verde, edifici…) viste attraverso il vetro. Nelle foto vere la segmentazione
  // include già nel vetro il paesaggio; allargare ad altre classi allungava le finestre sopra letti e mobili (banco 9/11)
  const seen = new Uint8Array(w * h), out = [], minA = w * h * .0025, Q = new Int32Array(w * h), floorIds = idsOf(m, "@floor"), outside = names.map(n => OUTSIDE.has(n));
  for (let i = 0; i < w * h; i++) {
    const c = lab[i] === 255 ? null : catOf[lab[i]]; if (!c || seen[i]) continue;
    let qh = 0, qt = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; Q[qt++] = i; seen[i] = 1;
    const grow = c === "finestra" || c === "portafinestra";      // il vano comprende quello che si vede fuori
    while (qh < qt) { const j = Q[qh++], x = j % w, y = (j / w) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [j - 1, j + 1, j - w, j + w]) { if (k < 0 || k >= w * h || seen[k] || (k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue; const l = lab[k];
        if (l !== 255 && catOf[l] === c) { seen[k] = 1; Q[qt++] = k; } } }
    if (grow) {   // secondo passo: dal vetro verso ciò che si vede fuori, entro un intorno del vetro (non dentro la parete)
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, gx0 = x0 - bw * .25, gx1 = x1 + bw * .25, gy0 = y0 - bh * .6, gy1 = y1 + bh * 1.2;
      for (let q = 0; q < qt; q++) { const j = Q[q], x = j % w, y = (j / w) | 0;
        for (const k of [j - 1, j + 1, j - w, j + w]) { if (k < 0 || k >= w * h || seen[k] || (k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue; const kx = k % w, ky = (k / w) | 0, l = lab[k];
          if (l !== 255 && outside[l] && kx >= gx0 && kx <= gx1 && ky >= gy0 && ky <= gy1) { seen[k] = 1; Q[qt++] = k; n++; if (kx < x0) x0 = kx; if (kx > x1) x1 = kx; if (ky < y0) y0 = ky; if (ky > y1) y1 = ky; } } }
    }
    if (n < minA) continue;
    // pavimento subito sotto il bordo inferiore: per distinguere una finestra da una portafinestra
    let fl = 0, tot = 0, fur = 0; for (let x = x0; x <= x1; x++) for (let y = y1 + 1; y <= Math.min(h - 1, y1 + Math.max(2, h * .03)); y++) { tot++; const l = lab[y * w + x]; if (floorIds.has(l)) fl++; else if (l !== 255 && catOf[l] && !OPEN.includes(catOf[l])) fur++; }
    // arredo subito sotto la finestra (testiera, divano, mobile): il davanzale è nascosto
    const occBelow = grow && tot ? fur / tot > .5 : false;
    out.push({ occBelow, category: c, label: names[lab[i]], box: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h].map(v => +v.toFixed(4)), area: +(n / (w * h)).toFixed(4), fill: +(n / ((x1 - x0 + 1) * (y1 - y0 + 1))).toFixed(2), onFloor: tot ? fl / tot > .3 : false });
  }
  // un'apertura tagliata in due da un arredo davanti (o da una traversa): si ricompone
  const op = c => OPEN.includes(c.category);
  for (let changed = true; changed;) { changed = false;
    for (let i = 0; i < out.length && !changed; i++) for (let j = i + 1; j < out.length && !changed; j++) {
      const a = out[i], b = out[j]; if (!op(a) || a.category !== b.category) continue;
      const ox = Math.min(a.box[2], b.box[2]) - Math.max(a.box[0], b.box[0]), mw = Math.min(a.box[2] - a.box[0], b.box[2] - b.box[0]);
      const gap = Math.max(a.box[1], b.box[1]) - Math.min(a.box[3], b.box[3]);
      if (ox > mw * .6 && gap < .06) { a.box = [Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]), Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3])]; a.area = +(a.area + b.area).toFixed(4); out.splice(j, 1); changed = true; }
    } }
  return out.sort((a, b) => b.area - a.area);
}

const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
const inside = (a, b) => { const cx = (a[0] + a[2]) / 2, cy = (a[1] + a[3]) / 2; return cx > b[0] && cx < b[2] && cy > b[1] && cy < b[3]; };
const near = (a, b) => Math.max(iou(a, b), inside(a, b) || inside(b, a) ? .2 : 0);

/** Unisce elementi dell'analisi e componenti della segmentazione. items: quelli di normalizeAnalysis. */
export function mergeSegmentation(items, comps, quad = null) {
  const out = items.map(it => ({ ...it })), used = new Set(), left = [];
  const take = (it, c) => { if (c.occBelow) it.occBelow = true; if (!(String(it.source).startsWith("rilevatore") && iou(it.box, c.box) > .5)) it.box = c.box;   // i riquadri del rilevatore (istanze) restano se coincidono già
    it.source = String(it.source).startsWith("rilevatore") ? "rilevatore+segmentazione" : "segmentazione"; it.seg = true; };
  // 1) stessa famiglia (porta↔porta, sedia↔sedia…)
  for (const c of comps) {
    const fam = FAMILY(c.category); let best = 0, bi = -1;
    out.forEach((it, i) => { if (used.has(i) || FAMILY(it.category) !== fam) return; const v = near(it.box, c.box); if (v > best) { best = v; bi = i; } });
    if (bi >= 0 && best >= .08) { used.add(bi); take(out[bi], c); } else left.push(c);
  }
  // 2) famiglie che la segmentazione confonde (un letto visto come tavolo, un divano come poltrona…): se il riquadro
  //    coincide bene vale la categoria del modello linguistico con il contorno della maschera
  const CONF = [["letto", "tavolo", "sedute", "contenitori"], ["sedute", "sedie"], ["contenitori", "cucina", "tavolo", "tavolino"], ["tavolo", "tavolino"], ["lampada", "pianta"]];
  const confusable = (a, b) => CONF.some(g => g.includes(a) && g.includes(b));
  const rest = [];
  for (const c of left) {
    const fam = FAMILY(c.category); let best = 0, bi = -1;
    out.forEach((it, i) => { if (used.has(i) || FAMILY(it.category) === "apertura" || fam === "apertura" || !confusable(FAMILY(it.category), fam)) return; const v = iou(it.box, c.box); if (v > best) { best = v; bi = i; } });
    if (bi >= 0 && best >= .3) { used.add(bi); take(out[bi], c); } else rest.push(c);
  }
  // 3) non trovati dal modello: si aggiungono se aperture o arredi abbastanza grandi
  for (const c of rest) {
    const fam = FAMILY(c.category);
    if (fam === "apertura" || c.area > .006) {
      let cat = c.category; const C = (out.find(o => o.category === cat) || {});
      if (cat === "finestra" && c.onFloor) cat = "portafinestra";   // vetrata fino a terra (pavimento subito sotto)
      out.push({ category: cat, label: "", box: c.box, occBelow: c.occBelow || undefined, w: C.w, d: C.d, h: C.h, facing: "camera", against: "none", source: "segmentazione", seg: true, added: true });
      used.add(out.length - 1);
    }
  }
  // elementi visti solo dal modello linguistico (riquadri spesso spostati): con la segmentazione disponibile
  // restano in elenco ma esclusi, da riattivare a mano; quelli del rilevatore di oggetti restano attivi
  if (comps.length) out.forEach(it => { if (!it.seg && !String(it.source).includes("rilevatore")) it.doubt = true; });
  // doppioni tra aperture: due elementi sullo stesso riquadro → resta il primo
  const trust = o => (o.seg ? 2 : 0) + (String(o.source).includes("rilevatore") ? 1 : 0) - (o.doubt ? 1 : 0);
  // doppioni tra arredi: stesso tipo con un riquadro quasi tutto dentro l'altro (letto a baldacchino visto intero
  // dalla segmentazione e solo in parte dal rilevatore) → uno solo
  const area = b => (b[2] - b[0]) * (b[3] - b[1]);
  const within = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])); return ix * iy / Math.max(1e-6, Math.min(area(a), area(b))); };
  const BIG = new Set(["letto", "tavolo", "sedute", "contenitori", "cucina"]);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const A = out[i], B = out[j]; if (A.dup || B.dup || FAMILY(A.category) !== FAMILY(B.category)) continue;
    const big = BIG.has(FAMILY(A.category)) && A.category === B.category && within(A.box, B.box) > .8;
    if (iou(A.box, B.box) <= .55 && !big) continue;
    const ta = trust(A), tb = trust(B), keepB = tb > ta || (tb === ta && area(B.box) > area(A.box));
    (keepB ? A : B).dup = true;            // resta il più affidabile (confermato dalla foto), a parità il più grande
  }
  // lenzuola e coperte riconosciute come «tavolo» dentro il letto: fanno parte del letto
  for (const A of out) if (!A.dup && FAMILY(A.category) === "letto" && A.seg)
    for (const B of out) if (B !== A && !B.dup && /^tavol/.test(B.category) && B.seg && !String(B.source).includes("rilevatore") && within(A.box, B.box) > .7 && area(B.box) < area(A.box)) B.dup = true;
  return out.filter(it => !it.dup);
}

/* ---------- modello di stanza adattato alle maschere ----------
   Stanza a scatola vista dall'interno: fotocamera nell'origine (y in su, guarda verso −z, inclinazione p,
   rotazione ψ, nessun rollio), soffitto a y = 1 − hc e pavimento a y = −hc (unità: altezza della stanza),
   pareti a x = −dl, x = +dr, z = −db. Per ogni pixel campione si traccia il raggio e si vede che cosa colpisce
   per primo (soffitto, parete o pavimento); il punteggio è la concordanza con la segmentazione sui pixel
   etichettati come soffitto, pareti o pavimento (arredi, persone, porte e finestre sono ignorati). Si cerca
   il massimo con Nelder-Mead da più partenze. Restituisce spigoli della parete di fondo (anche fuori dalla
   foto), inclinazione, rotazione, altezza relativa della fotocamera, distanze dalle pareti e punteggio. */
function rayDir(u, v, f, r, p, yaw) {
  const x = u - .5, y = -(v - .5) * r, cp = Math.cos(p), sp = Math.sin(p);
  const d = [x, y * cp + f * sp, y * sp - f * cp], cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [d[0] * cy + d[2] * sy, d[1], -d[0] * sy + d[2] * cy];
}
function projectPt(P, f, r, p, yaw) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), x = P[0] * cy - P[2] * sy, z = P[0] * sy + P[2] * cy, y = P[1];
  const cp = Math.cos(p), sp = Math.sin(p), a = x, b = y * cp + z * sp, g = y * sp - z * cp;
  if (g <= 1e-6) return null;
  return [.5 + a * f / g, .5 - (b * f / g) / r];
}
export function fitRoomBox(m, { hfov = null, aspect = null, evalAt = null } = {}) {
  if (!m) return null;
  const { w, h, lab } = m, W = idsOf(m, "@wall"), F = idsOf(m, "@floor"), C = idsOf(m, "@ceiling"), r = aspect || h / w, at = (x, y) => lab[y * w + x];
  // punti di giunzione visibili (come in wallCorners): soffitto↔parete e parete↔pavimento, coordinate 0..1
  const top = [], bot = [];
  for (let x = 0; x < w; x += 2) {
    for (let y = h - 3; y >= 1; y--) if (C.has(at(x, y)) && W.has(at(x, y + 1)) && W.has(at(x, y + 2))) { top.push([(x + .5) / w, (y + 1) / h]); break; }
    for (let y = 2; y < h - 1; y++) if (F.has(at(x, y)) && W.has(at(x, y - 1)) && W.has(at(x, y - 2))) { bot.push([(x + .5) / w, y / h]); break; }
  }
  if (top.length + bot.length < 24 || (bot.length < 4 && top.length < 30)) return null;
  const fewFloor = bot.length < 12;   // pavimento coperto (letto, mobili): l'altezza della fotocamera si appoggia a un valore tipico
  const fitFov = !hfov, toF = deg => .5 / Math.tan(deg * Math.PI / 360), rad = Math.PI / 180;
  const geo = q => { const [p, yaw, af, ac, bl, br, fov] = q, ta = Math.tan(af), tc = Math.tan(ac), db = 1 / (ta + tc); return { p, yaw, hc: ta * db, db, dl: db * Math.tan(bl), dr: db * Math.tan(br), fov: fitFov ? fov : hfov }; };
  /* spigoli proiettati della scatola: per soffitto e pavimento, polilinea parete sinistra → fondo → parete destra */
  const edges = G => {
    const f = toF(G.fov), out = [];
    for (const y of [1 - G.hc, -G.hc]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) pts.push([-G.dl, y, 3 - (3 + G.db) * k / 12]);      // parete sinistra, dalla fotocamera verso il fondo
      for (let k = 1; k <= 12; k++) pts.push([-G.dl + (G.dl + G.dr) * k / 12, y, -G.db]);
      for (let k = 1; k <= 12; k++) pts.push([G.dr, y, -G.db + (3 + G.db) * k / 12]);
      out.push(pts.map(P => projectPt(P, f, r, G.p, G.yaw)));
    }
    return out;     // [soffitto, pavimento]
  };
  const dseg = (P, A, B) => { const vx = B[0] - A[0], vy = (B[1] - A[1]) * r, wx = P[0] - A[0], wy = (P[1] - A[1]) * r, L = vx * vx + vy * vy, t = L > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L)) : 0; return Math.hypot(wx - t * vx, wy - t * vy); };
  const dist = (P, poly) => { let best = .04; for (let i = 0; i < poly.length - 1; i++) { const A = poly[i], B = poly[i + 1]; if (!A || !B) continue; const d = dseg(P, A, B); if (d < best) best = d; } return best; };
  const cost = (pts, poly) => { let s = 0; for (const P of pts) s += dist(P, poly); return s / Math.max(1, pts.length); };
  const valid = q => { const [p, yaw, af, ac, bl, br, fov] = q; return !(Math.abs(p) > .7 || Math.abs(yaw) > .9 || af < .03 || ac < .03 || af > 1.45 || ac > 1.45 || bl < .02 || br < .02 || bl > 1.52 || br > 1.52 || (fitFov && (fov < 40 || fov > 95))); };
  // stanza fisicamente plausibile: fotocamera tra il 20 e l'85 % dell'altezza, parete di fondo ad almeno mezza altezza
  const score = q => { if (!valid(q)) return -1; const G = geo(q); if (G.hc < .2 || G.hc > .85 || G.db < .5) return -1; const [ce, fe] = edges(G);
    return -(cost(top, ce) * top.length + cost(bot, fe) * bot.length) / (top.length + bot.length) - .0002 * (Math.log(G.dl) + Math.log(G.dr)) - (fewFloor ? .05 : .002) * (G.hc - .54) ** 2; };
  if (evalAt) return score(evalAt);
  const nm = (x0, steps, iters = 260) => {
    const n = x0.length; let simp = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simp.push(x); }
    let val = simp.map(score);
    for (let it = 0; it < iters; it++) {
      const ord = val.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); simp = ord.map(o => simp[o[1]]); val = ord.map(o => o[0]);
      const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simp[i][k] / n;
      const wst = simp[n], refl = c.map((v, k) => v + (v - wst[k])), fr = score(refl);
      if (fr > val[0]) { const exp = c.map((v, k) => v + 2 * (v - wst[k])), fe = score(exp); if (fe > fr) { simp[n] = exp; val[n] = fe; } else { simp[n] = refl; val[n] = fr; } }
      else if (fr > val[n - 1]) { simp[n] = refl; val[n] = fr; }
      else { const con = c.map((v, k) => v + .5 * (wst[k] - v)), fc = score(con); if (fc > val[n]) { simp[n] = con; val[n] = fc; } else for (let i = 1; i <= n; i++) { simp[i] = simp[i].map((v, k) => simp[0][k] + .5 * (v - simp[0][k])); val[i] = score(simp[i]); } }
      if (Math.abs(val[0] - val[n]) < 1e-7 && it > 40) break;
    }
    return { x: simp[0], s: val[0] };
  };
  // più partenze (inclinazione, rotazione, distanza); si tengono le migliori e si rifiniscono
  const cands = [];
  for (const p0 of [-12, -5, 2, 8]) for (const y0 of [-14, 0, 14]) for (const db0 of [1.2, 2.4]) {
    const x0 = [p0 * rad, y0 * rad, Math.atan(.52 / db0), Math.atan(.48 / db0), Math.atan(.9 / db0), Math.atan(.9 / db0)], st = [4 * rad, 6 * rad, 5 * rad, 5 * rad, 10 * rad, 10 * rad];
    if (fitFov) { x0.push(65); st.push(8); }
    cands.push(nm(x0, st, 140));
  }
  cands.sort((a, b) => b.s - a.s);
  let best = null;
  for (const c of cands.slice(0, 3)) { let r1 = c; for (let k = 0; k < 2; k++) r1 = nm(r1.x, r1.x.map((v, i) => [1 * rad, 1.5 * rad, 1 * rad, 1 * rad, 2 * rad, 2 * rad, 2][i])); if (!best || r1.s > best.s) best = r1; }
  const G = geo(best.x), f = toF(G.fov), Hc = 1 - G.hc;
  const pj = P => { const q = projectPt(P, f, r, G.p, G.yaw); return q ? q.map(v => +v.toFixed(4)) : null; };
  const quad = { fl: pj([-G.dl, -G.hc, -G.db]), fr: pj([G.dr, -G.hc, -G.db]), cl: pj([-G.dl, Hc, -G.db]), cr: pj([G.dr, Hc, -G.db]) };
  if (Object.values(quad).some(q => !q)) return null;
  // affidabilità: quota di punti di giunzione che cadono sugli spigoli della scatola (entro l'1 % della larghezza).
  // Robusta agli sbagli della segmentazione (un pavimento chiaro preso per soffitto, un mobile scambiato per parete)
  const [ceB, feB] = edges(G), inl = (top.filter(P => dist(P, ceB) < .01).length + bot.filter(P => dist(P, feB) < .01).length) / (top.length + bot.length);
  const resid = -best.s, conf = Math.max(0, Math.min(1, (inl - .45) / .35));
  // pareti laterali viste? (punti di giunzione oltre lo spigolo): se no, la larghezza della parete di fondo è solo un minimo
  const pts = top.concat(bot), openL = !pts.some(p => p[0] < Math.min(quad.fl[0], quad.cl[0]) - .02), openR = !pts.some(p => p[0] > Math.max(quad.fr[0], quad.cr[0]) + .02);
  return { ...quad, openL, openR, ceiling: top.length > 15, conf: +conf.toFixed(3), resid: +resid.toFixed(4), inliers: +inl.toFixed(3), pitch: +(G.p / rad).toFixed(2), yaw: +(G.yaw / rad).toFixed(2), hc: +G.hc.toFixed(3), dl: +G.dl.toFixed(3), dr: +G.dr.toFixed(3), db: +G.db.toFixed(3), hfov: +G.fov.toFixed(1), points: top.length + bot.length, source: "modello di stanza" };
}

/* le finestre si vedono «attraverso»: il vetro (windowpane) più quello che sta fuori (cielo, alberi, prato,
   edifici…) racchiuso dalla parete forma il vano; senza questo il vano risulta basso e corto */
export const NOT_OPENING = new Set(["curtain", "blind", "cushion", "pillow", "blanket", "cradle", "counter", "countertop", "stairs", "step", "ottoman", "desk", "seat", "bench", "kitchen island", "television receiver", "computer", "monitor", "screen", "crt screen", "plaything", "animal", "person", "box", "base", "column", "mirror", "fireplace", "radiator", "railing", "bannister", "towel", "apparel", "bag", "basket", "book", "bottle", "vase", "clock", "plate", "glass", "tray", "pot", "food"]);
export const OUTSIDE = new Set(["sky", "tree", "grass", "building", "house", "mountain", "field", "road", "sidewalk", "earth", "water", "sea", "palm", "fence", "car", "skyscraper", "hill", "land", "path", "awning", "streetlight", "pole"]);
