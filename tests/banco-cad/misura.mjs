// Misura del riconoscimento CAD → BIM sul banco (docs/progetto-cad-bim.md §9, docs/banco-cad.md).
// Confronta i muri, le aperture e i locali riconosciuti con la verità della pianta generata.
import { readFileSync } from "node:fs";

// BANCO_MOTORE=cartella: confronta un'altra versione del motore (stessi due file), es. quella di main
const src = f => readFileSync(process.env.BANCO_MOTORE ? process.env.BANCO_MOTORE + "/" + f : new URL("../../editor-src/" + f, import.meta.url), "utf8");
/** Motore attuale dell'editor (editor-src/075-auto3d.js) con lo stesso filtro dei layer dell'interfaccia (076-auto3d-ui.js). */
export function motoreAttuale(){
  const A3 = new Function(src("075-auto3d.js") + "; return A3;")();
  const SKIP = new Function(src("076-auto3d-ui.js").match(/const A3_SKIP_LAYERS = (\/.*\/[a-z]*);/)[1].replace(/^/, "return "))();
  return function riconosci(dis){
    const segs = dis.segs.filter(s => !SKIP.test(s[4])).map(s => s.slice(0, 5)), arcs = dis.arcs.filter(a => !SKIP.test(a.layer)), texts = dis.texts;
    const cl = A3.clusterDrawings({ segs, arcs, texts });
    const c = cl.find(c => c.guess === "pianta") || [...cl].sort((a, b) => b.n - a.n)[0];
    if (!c) return { walls: [], openings: [], rooms: [] };
    return A3.analyzePlan(c.idx.map(i => segs[i]), arcs, texts);
  };
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], len = v => Math.hypot(v[0], v[1]);
const frame = w => { const d = sub(w.b, w.a), L = len(d) || 1e-9; return { L, u: [d[0] / L, d[1] / L] }; };
function polyArea(pts){ let a = 0; for (let i = 0; i < pts.length; i++){ const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
function inPoly([x, y], p){ let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; }

/** Punto p sull'asse del muro w? Restituisce lo scarto laterale (m) o null. */
function suAsse(p, w, f, tol){
  const d = sub(p, w.a), s = d[0] * f.u[0] + d[1] * f.u[1], o = Math.abs(d[0] * f.u[1] - d[1] * f.u[0]);
  return s >= -.05 && s <= f.L + .05 && o <= tol ? o : null;
}
/** Quota di lunghezza dei muri di A coperta dai muri di B (stessa direzione, entro tol lateralmente). */
function copertura(A, B, tol = .04){
  const FB = B.map(frame); let tot = 0, ok = 0; const spess = [], scarti = [];
  for (const w of A){
    const f = frame(w);
    for (let s = .1; s <= f.L - .1; s += .05){
      const p = [w.a[0] + f.u[0] * s, w.a[1] + f.u[1] * s]; tot += .05;
      let best = null;
      B.forEach((v, k) => { if (Math.abs(f.u[0] * FB[k].u[1] - f.u[1] * FB[k].u[0]) > .05) return; const o = suAsse(p, v, FB[k], tol); if (o !== null && (!best || o < best.o)) best = { o, v }; });
      if (best){ ok += .05; spess.push(Math.abs(best.v.thick - w.thick)); scarti.push(best.o); }
    }
  }
  return { quota: tot ? ok / tot : 1, spess, scarti };
}
const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const mediana = a => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };

/** Misure di una pianta: verità contro risultato del riconoscimento. */
export function valuta(verita, ris){
  const rec = copertura(verita.walls, ris.walls), prec = copertura(ris.walls, verita.walls);
  // aperture: centro entro 20 cm e larghezza entro 15 cm
  const centro = (o, walls) => { const w = walls.find(x => x.id === o.wall); if (!w) return null; const f = frame(w); return [w.a[0] + f.u[0] * o.t, w.a[1] + f.u[1] * o.t]; };
  const OD = ris.openings.map(o => ({ o, c: centro(o, ris.walls) })).filter(x => x.c), usati = new Set();
  let trovate = 0, tipoGiusto = 0;
  for (const o of verita.openings){
    const c = centro(o, verita.walls); let best = null;
    OD.forEach((d, k) => { if (usati.has(k)) return; const dd = len(sub(d.c, c)); if (dd <= .2 && Math.abs(d.o.w - o.w) <= .15 && (!best || dd < best.dd)) best = { k, dd, d }; });
    if (best){ usati.add(best.k); trovate++; if (best.d.o.type === o.type) tipoGiusto++; }
  }
  // locali: quello riconosciuto che contiene il baricentro del locale vero; superficie entro l'1 %
  let locTrovati = 0, locEsatti = 0; const errArea = [];
  for (const r of verita.rooms){
    const c = [media(r.pts.map(p => p[0])), media(r.pts.map(p => p[1]))], d = ris.rooms.find(x => x.pts?.length > 2 && inPoly(c, x.pts));
    if (!d) continue; locTrovati++; const e = Math.abs(polyArea(d.pts) - r.area) / r.area; errArea.push(e); if (e <= .01) locEsatti++;
  }
  return {
    muri_richiamo: rec.quota, muri_precisione: prec.quota,
    spessore_esatto: rec.spess.length ? rec.spess.filter(e => e <= .005).length / rec.spess.length : 0,
    scarto_asse_mm: mediana(rec.scarti) * 1000,
    aperture_richiamo: verita.openings.length ? trovate / verita.openings.length : 1,
    aperture_precisione: ris.openings.length ? trovate / ris.openings.length : (verita.openings.length ? 0 : 1),
    aperture_tipo: trovate ? tipoGiusto / trovate : 0,
    locali_trovati: verita.rooms.length ? locTrovati / verita.rooms.length : 1,
    locali_area_1pct: verita.rooms.length ? locEsatti / verita.rooms.length : 1,
    errore_area_mediano_pct: mediana(errArea) * 100,
  };
}

/** Banco intero: media delle misure per stile e in totale, tempo per pianta. */
export function misuraBanco(piante, riconosci){
  const perStile = {}, tutte = [];
  for (const p of piante){
    const t0 = performance.now(); let ris;
    try { ris = riconosci(p.disegno); } catch(e){ ris = { walls: [], openings: [], rooms: [], errore: String(e) }; }
    const m = { ...valuta(p.verita, ris), ms: performance.now() - t0 };
    (perStile[p.stile] ||= []).push(m); tutte.push(m);
  }
  const riassumi = L => Object.fromEntries(Object.keys(L[0]).map(k => [k, +media(L.map(m => m[k])).toFixed(k === "ms" || k.endsWith("_mm") || k.endsWith("_pct") ? 1 : 3)]));
  return { piante: piante.length, totale: riassumi(tutte), perStile: Object.fromEntries(Object.entries(perStile).map(([k, L]) => [k, riassumi(L)])) };
}
