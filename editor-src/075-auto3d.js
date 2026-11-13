/* ============================================================
   Da pianta e prospetti (DXF/DWG) a modello 3D — motore
   Funzioni pure, senza DOM: testate in tests/auto3d.test.mjs.
   Unità: metri. Pianta in coordinate dell'editor (x a destra, y verso sud);
   prospetti con y verso l'alto.
   ============================================================ */
const A3 = (() => {
  const D2R = Math.PI / 180;
  const segLen = s => Math.hypot(s[2]-s[0], s[3]-s[1]);
  const median = a => { if (!a.length) return NaN; const b = [...a].sort((x,y)=>x-y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m-1]+b[m])/2; };
  const cleanText = t => String(t || "").replace(/\\[Pp]/g, " ").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/[{}]/g, "").replace(/\\~/g, " ").replace(/\s+/g, " ").trim();

  /* ---------- raggruppamento dei disegni di una tavola ---------- */
  const SIDES = {sud:"sud", south:"sud", s:"sud", nord:"nord", north:"nord", n:"nord", est:"est", east:"est", e:"est", ovest:"ovest", west:"ovest", o:"ovest", w:"ovest"};
  function sideFromText(t){
    const s = cleanText(t).toLowerCase();
    const m = s.match(/(?:prospett\w*|fronte|facciata|elevation|elev\.?|vista)\s*(?:lato\s*)?(sud|nord|est|ovest|south|north|east|west)\b/) || s.match(/\b(sud|nord|est|ovest|south|north|east|west)\b/);
    if (m && /prosp|front|facc|elev|vista/.test(s)) return SIDES[m[1]];
    if (m && s.length <= 12) return SIDES[m[1]];
    return null;
  }
  const isPlanText = t => /\b(pianta|plan|planimetria|floor|piano\s+(terra|rialzato|primo|secondo|terzo|quarto|quinto|sesto|settimo|interrato|seminterrato|ammezzato|sottotetto|mansarda|tipo|attico|\d+))\b/i.test(cleanText(t));
  /** Raggruppa i segmenti in disegni separati (pianta, prospetti…) per vicinanza. drawing: {segs, arcs, texts} in metri, y verso l'alto. */
  function clusterDrawings(dr, gap = 1.2){
    const n = dr.segs.length, par = Int32Array.from({length:n}, (_, i) => i);
    const find = i => { while (par[i] !== i){ par[i] = par[par[i]]; i = par[i]; } return i; };
    const cells = new Map(), cs = gap;
    dr.segs.forEach((s, i) => {
      const x0 = Math.floor((Math.min(s[0], s[2]) - gap/2) / cs), x1 = Math.floor((Math.max(s[0], s[2]) + gap/2) / cs);
      const y0 = Math.floor((Math.min(s[1], s[3]) - gap/2) / cs), y1 = Math.floor((Math.max(s[1], s[3]) + gap/2) / cs);
      if ((x1-x0+1) * (y1-y0+1) > 4000) return; // linee enormi (cornici, assi): non uniscono i disegni
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++){
        const k = x + "," + y, o = cells.get(k);
        if (o === undefined) cells.set(k, i); else { const a = find(o), b = find(i); if (a !== b) par[a] = b; }
      }
    });
    const groups = new Map();
    for (let i = 0; i < n; i++){ const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    let cl = [...groups.values()].map(idx => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of idx){ const s = dr.segs[i]; x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]); }
      return {idx, bbox:[x0, y0, x1, y1], arcs:[], texts:[]};
    }).filter(c => c.idx.length >= 4 && (c.bbox[2]-c.bbox[0]) > 1 && (c.bbox[3]-c.bbox[1]) > .8);
    const dist = (c, x, y) => Math.hypot(Math.max(c.bbox[0]-x, 0, x-c.bbox[2]), Math.max(c.bbox[1]-y, 0, y-c.bbox[3]));
    for (const a of dr.arcs || []){ const c = cl.find(c => dist(c, a.cx, a.cy) < .01); if (c) c.arcs.push(a); }
    for (const t of dr.texts || []){ let best = null, bd = Infinity; for (const c of cl){ const d = dist(c, t.x, t.y); if (d < bd){ bd = d; best = c; } } if (best && bd < Math.max(4, (best.bbox[3]-best.bbox[1]) * .35)) best.texts.push({...t, inside: bd < .01}); }
    for (const c of cl){
      const segs = c.idx.map(i => dr.segs[i]), w = c.bbox[2]-c.bbox[0], h = c.bbox[3]-c.bbox[1];
      const doorArcs = c.arcs.filter(a => a.r > .5 && a.r < 1.6).length;
      const label = c.texts.find(t => sideFromText(t.text)) || c.texts.find(t => isPlanText(t.text));
      const side = label ? sideFromText(label.text) : null;
      const sloped = segs.filter(s => { const a = Math.abs(Math.atan2(s[3]-s[1], s[2]-s[0])) / D2R, b = Math.min(a, 180 - a); return b > 8 && b < 70 && segLen(s) > .8; }).length;
      const ground = segs.some(s => Math.abs(s[3]-s[1]) < .01 && segLen(s) > .7 * w && Math.min(s[1], s[3]) < c.bbox[1] + .05);
      c.n = segs.length; c.w = w; c.h = h;
      // tipo del disegno: le prove forti di una pianta (ante delle porte, superfici scritte) vincono sull'etichetta di un disegno vicino
      const leaves = c.arcs.filter(a => a.r > .5 && a.r < 1.6 && (a.sweep == null || Math.abs(a.sweep - Math.PI / 2) < .25)).length;
      const areaTxt = c.texts.filter(t => /\d\s*(mq|m2|m²)\b|\b(mq|m2|m²)\s*\d/i.test(cleanText(t.text))).length;
      const strongPlan = leaves >= 3 || areaTxt >= 2 || (leaves >= 1 && sloped <= .15 * segs.length);
      c.kind = strongPlan || (label && isPlanText(label.text) && !side) ? "pianta" : side || (ground && h < 25) ? "prospetto" : "altro";
      c.evidence = {leaves, areaTxt, sloped, label:label ? (side ? "lato" : isPlanText(label.text) ? "pianta" : "") : "", ground:!!(ground && h < 25)};
      c.guess = c.kind === "pianta" ? "pianta" : side ? side : c.kind === "prospetto" ? "prospetto" : "ignora";
      c.reason = strongPlan ? (areaTxt >= 2 ? `${areaTxt} superfici scritte` : `${leaves} porte`) : label ? `etichetta «${cleanText(label.text).slice(0, 40)}»` : ground ? "linea di terra" : "";
    }
    // una sola pianta: quella con più archi di porta / più segmenti
    const plans = cl.filter(c => c.guess === "pianta").sort((a,b) => (/etichetta/.test(b.reason) - /etichetta/.test(a.reason)) || (b.arcs.length - a.arcs.length) || (b.n - a.n));
    plans.slice(1).forEach(c => { c.guess = "ignora"; });   // ne resta proposta una sola; c.kind dice comunque che è una pianta
    if (!plans.length && cl.length){ const big = [...cl].sort((a,b) => b.n - a.n)[0]; if (big.guess !== "prospetto" || cl.length === 1) big.guess = "pianta"; }
    return cl.sort((a,b) => (a.bbox[1] === b.bbox[1] ? a.bbox[0]-b.bbox[0] : b.bbox[3]-a.bbox[3]));
  }

  /* ---------- pianta: muri, aperture, locali ---------- */
  /* ---------- pulizia del disegno (fase B, docs/banco-cad.md) ---------- */
  /** Direzione principale della pianta (radianti, tra −45° e 45°): media delle linee pesata sulla lunghezza, modulo 90°. */
  function dominantAngle(segs){
    const bins = new Float64Array(180); let tot = 0;
    for (const s of segs){ const L = segLen(s); if (L < .3) continue; let a = Math.atan2(s[3]-s[1], s[2]-s[0]) / D2R; a = ((a % 90) + 90) % 90; bins[Math.floor(a * 2) % 180] += L; tot += L; }
    if (!tot) return 0;
    let k = 0; for (let i = 1; i < 180; i++) if (bins[i] > bins[k]) k = i;
    let sx = 0, sy = 0;   // media circolare (4θ) delle linee entro 1° dal picco
    for (const s of segs){ const L = segLen(s); if (L < .3) continue; let a = Math.atan2(s[3]-s[1], s[2]-s[0]) / D2R; a = ((a % 90) + 90) % 90; let d = Math.abs(a - k / 2); d = Math.min(d, 90 - d); if (d > 1) continue; sx += L * Math.cos(4 * a * D2R); sy += L * Math.sin(4 * a * D2R); }
    let th = Math.atan2(sy, sx) / 4; if (th > Math.PI / 4) th -= Math.PI / 2; return th;
  }
  /** Linee collineari spezzate, doppie o staccate di pochi cm unite; retini (famiglie fitte di linee corte e oblique) tolti. */
  function cleanSegs(segsIn, opt = {}){
    const gap = opt.joinGap ?? .03;
    const items = segsIn.filter(s => segLen(s) >= .005).map(s => { let ang = Math.atan2(s[3]-s[1], s[2]-s[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI;
      const u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]]; const p0 = s[0]*u[0] + s[1]*u[1], p1 = s[2]*u[0] + s[3]*u[1];
      return {s, ang, u, n, a:Math.min(p0, p1), b:Math.max(p0, p1), off:(s[0]*n[0] + s[1]*n[1] + s[2]*n[0] + s[3]*n[1]) / 2, L:segLen(s)}; });
    // retini: per direzione obliqua (lontana dagli assi principali), tante linee corte a passo fitto
    const th = dominantAngle(segsIn), dropped = new Set(), byAng = new Map();
    for (const it of items){ let d = ((it.ang - th) / D2R % 90 + 90) % 90; if (d < 5 || d > 85) continue; const k = Math.round(it.ang / D2R * 2); if (!byAng.has(k)) byAng.set(k, []); byAng.get(k).push(it); }
    for (const list of byAng.values()){
      if (list.length < 8) continue; const offs = list.map(x => x.off).sort((a, b) => a - b), steps = offs.slice(1).map((o, i) => o - offs[i]).filter(d => d > 1e-4);
      if (median(list.map(x => x.L)) < 1.2 && median(steps) < .25) for (const x of list) if (x.L < 1.5) dropped.add(x);
    }
    // gradini delle scale: lungo gli assi, almeno 6 linee corte (40–160 cm) parallele, sovrapposte, a passo regolare 22–35 cm
    for (const ax of [th, th + Math.PI / 2]){
      const nrm = ((ax % Math.PI) + Math.PI) % Math.PI, L = items.filter(x => !dropped.has(x) && Math.abs(Math.sin(x.ang - nrm)) < .01 && x.L >= .4 && x.L <= 1.6).sort((x, y) => x.off - y.off);
      for (let i = 0; i < L.length; i++){
        const run = [L[i]];
        for (let j = i + 1; j < L.length; j++){ const p = run[run.length - 1], d = L[j].off - p.off; if (d < .22) continue; if (d > .35) break;
          if (Math.min(p.b, L[j].b) - Math.max(p.a, L[j].a) > .5 * Math.min(p.L, L[j].L) && Math.abs(d - (run.length > 1 ? run[1].off - run[0].off : d)) < .03) run.push(L[j]); }
        if (run.length >= 6) run.forEach(x => dropped.add(x));
      }
    }
    // collineari: stessa direzione (±0,2°) e stessa retta (±5 mm), intervalli uniti se si toccano entro «gap»
    const keep = items.filter(x => !dropped.has(x)).sort((x, y) => x.ang - y.ang || x.off - y.off || x.a - y.a), out = [], used = new Uint8Array(keep.length);
    for (let i = 0; i < keep.length; i++){
      if (used[i]) continue; const A = keep[i], grp = [A]; used[i] = 1;
      for (let j = i + 1; j < keep.length && keep[j].ang - A.ang < .2 * D2R; j++) if (!used[j] && Math.abs(keep[j].off - A.off) < .005 && (keep[j].s[4] ?? "") === (A.s[4] ?? "")){ grp.push(keep[j]); used[j] = 1; }
      grp.sort((x, y) => x.a - y.a); let cur = null;
      const emit = c => { const {u, n, off} = A; out.push([u[0]*c.a + n[0]*off, u[1]*c.a + n[1]*off, u[0]*c.b + n[0]*off, u[1]*c.b + n[1]*off, A.s[4]]); };
      for (const x of grp){ if (cur && x.a <= cur.b + gap) cur.b = Math.max(cur.b, x.b); else { if (cur) emit(cur); cur = {a:x.a, b:x.b}; } }
      if (cur) emit(cur);
    }
    return out;
  }
  const rotPt = ([x, y], c, s) => [x*c - y*s, x*s + y*c];
  /** Scale: serie di almeno 3 linee parallele a passo regolare (20–45 cm). «dritta»: pedate della stessa lunghezza e allineate;
   *  «gradini»: rettangoli concentrici aperti su un lato (gradini esterni su tre lati), ogni linea più lunga della precedente di due passi.
   *  Il verso di salita viene dalla freccia (linea che attraversa le pedate con la punta), altrimenti verso la linea più corta.
   *  Restituisce le rampe e gli indici delle linee usate (che non devono diventare muri). */
  function findStairs(segs, extraFrom = Infinity){
    const it = segs.map((s, i) => { const L = segLen(s); let ang = Math.atan2(s[3]-s[1], s[2]-s[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI;
      const u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]], p0 = s[0]*u[0] + s[1]*u[1], p1 = s[2]*u[0] + s[3]*u[1];
      return {i, s, L, ang, u, n, a:Math.min(p0, p1), b:Math.max(p0, p1), off:(s[0]*n[0] + s[1]*n[1] + s[2]*n[0] + s[3]*n[1]) / 2}; }).filter(x => x.L >= .5 && x.L <= 8);
    const byAng = new Map(); for (const x of it){ const k = Math.round(x.ang / D2R) % 180; for (const kk of [k]) (byAng.get(kk) || byAng.set(kk, []).get(kk)).push(x); }
    const flights = [], used = new Set();
    for (const [k, list0] of byAng){
      const list = [...list0, ...(byAng.get((k + 1) % 180) || []).filter(x => Math.abs(x.ang - list0[0].ang) < 1.2 * D2R)].sort((x, y) => x.off - y.off);
      const taken = new Set();
      for (let i = 0; i < list.length; i++){
        if (taken.has(list[i]) || used.has(list[i].i)) continue;
        for (const kind of ["dritta", "gradini"]){
          const run = [list[i]]; let step = null;
          for (let j = i + 1; j < list.length; j++){ const p = run[run.length - 1], q = list[j], d = q.off - p.off; if (d < .2) continue; if (d > .45) break; if (taken.has(q) || used.has(q.i)) continue;
            if (step !== null && Math.abs(d - step) > .035) continue;
            const ok = kind === "dritta" ? Math.abs(p.a - q.a) < .1 && Math.abs(p.b - q.b) < .1 && q.L <= 2.2 && p.L <= 2.2
              : (Math.abs((p.a - q.a) - d) < .1 && Math.abs((q.b - p.b) - d) < .1) || (Math.abs((q.a - p.a) - d) < .1 && Math.abs((p.b - q.b) - d) < .1);
            if (!ok) continue; if (step === null) step = d; run.push(q); }
          // gradini concentrici: l'ordine delle lunghezze deve essere monotono (tutti crescono o tutti calano)
          if (kind === "gradini" && run.length >= 3){ const inc = run[1].L > run[0].L; if (!run.every((x, t) => !t || (x.L > run[t - 1].L) === inc)) continue; }
          if (run.length < 3) continue;
          run.forEach(x => taken.add(x));
          flights.push({kind, run, step, u:run[0].u, n:run[0].n}); break;
        }
      }
    }
    // frecce: linea perpendicolare alle pedate che ne attraversa almeno due, con la punta (due tratti corti che si incontrano a un estremo)
    const shorts = segs.map((s, i) => ({s, i, L:segLen(s)})).filter(x => x.L > .05 && x.L < .45);
    const tip = (P) => shorts.filter(x => Math.hypot(x.s[0] - P[0], x.s[1] - P[1]) < .03 || Math.hypot(x.s[2] - P[0], x.s[3] - P[1]) < .03).length >= 2;
    const out = [], WALLY = /mur|wall|parete|tamponam|tramezz|costru/i, same = (j, f) => (j >= extraFrom) === (f.run[0].i >= extraFrom) && !WALLY.test(segs[j][4] || "");
    for (const f of flights){
      const offs = f.run.map(x => x.off), o0 = Math.min(...offs), o1 = Math.max(...offs), A = Math.max(...f.run.map(x => x.a)), B = Math.min(...f.run.map(x => x.b));
      const lo = f.kind === "dritta" ? median(f.run.map(x => x.a)) : Math.min(...f.run.map(x => x.a)), hi = f.kind === "dritta" ? median(f.run.map(x => x.b)) : Math.max(...f.run.map(x => x.b));
      const w = f.kind === "dritta" ? median(f.run.map(x => x.L)) : Math.max(...f.run.map(x => x.L));
      // verso: +1 sale verso offset crescente
      let up = 0;
      for (let j = 0; j < segs.length && !up; j++){ const s = segs[j], L = segLen(s); if (L < 2 * f.step || used.has(j) || f.run.some(x => x.i === j) || !same(j, f)) continue;
        const dv = [(s[2]-s[0]) / L, (s[3]-s[1]) / L]; if (Math.abs(dv[0]*f.n[0] + dv[1]*f.n[1]) < .97) continue;
        const along = ((s[0] + s[2]) / 2) * f.u[0] + ((s[1] + s[3]) / 2) * f.u[1]; if (along < A || along > B) continue;
        const e0 = s[0]*f.n[0] + s[1]*f.n[1], e1 = s[2]*f.n[0] + s[3]*f.n[1]; if (Math.min(e0, e1) > o0 + f.step || Math.max(e0, e1) < o1 - f.step) continue;
        const t0 = tip([s[0], s[1]]), t1 = tip([s[2], s[3]]); if (t0 !== t1){ up = (t1 ? e1 - e0 : e0 - e1) > 0 ? 1 : -1; used.add(j); const P = t1 ? [s[2], s[3]] : [s[0], s[1]];
          for (const x of shorts) if (same(x.i, f) && Math.hypot(x.s[0] - P[0], x.s[1] - P[1]) < .03 || Math.hypot(x.s[2] - P[0], x.s[3] - P[1]) < .03) used.add(x.i); } }
      if (!up && f.kind === "gradini"){ const sh = f.run.reduce((m, x) => x.L < m.L ? x : m); up = sh.off > (o0 + o1) / 2 ? 1 : -1; }
      for (const x of f.run) used.add(x.i);
      // fianchi: linee perpendicolari alle pedate che toccano i loro estremi (gradini) o le fiancheggiano per tutta la rampa (cosciali)
      const ends = f.run.flatMap(x => [[x.s[0], x.s[1]], [x.s[2], x.s[3]]]);
      segs.forEach((s, j) => { if (used.has(j) || !same(j, f)) return; const L = segLen(s); if (L < .05) return; const dv = [(s[2]-s[0]) / L, (s[3]-s[1]) / L]; if (Math.abs(dv[0]*f.n[0] + dv[1]*f.n[1]) < .99) return;
        const pa = s[0]*f.u[0] + s[1]*f.u[1], e0 = s[0]*f.n[0] + s[1]*f.n[1], e1 = s[2]*f.n[0] + s[3]*f.n[1];
        if (f.kind === "gradini" ? ends.some(P => Math.hypot(P[0] - s[0], P[1] - s[1]) < .03 || Math.hypot(P[0] - s[2], P[1] - s[3]) < .03) && L <= o1 - o0 + f.step + 3
          : (Math.abs(pa - lo) < .06 || Math.abs(pa - hi) < .06) && Math.min(e0, e1) > o0 - f.step - .05 && Math.max(e0, e1) < o1 + f.step + .05 && L > .5 * (o1 - o0)) used.add(j); });
      const c = (lo + hi) / 2, steps = f.kind === "gradini" ? f.run.length : f.run.length - 1;
      // gradini esterni: il blocco parte dal fronte più esterno e sale verso l'edificio per «steps» pedate
      const co = f.kind === "gradini" && up ? (up > 0 ? o0 : o1) + up * steps * f.step / 2 : (o0 + o1) / 2;
      out.push({kind:f.kind, center:[f.u[0]*c + f.n[0]*co, f.u[1]*c + f.n[1]*co], dir:up ? [f.n[0]*up, f.n[1]*up] : [f.n[0], f.n[1]], known:!!up, w:+w.toFixed(3), tread:+f.step.toFixed(3), steps, run:+(o1 - o0).toFixed(3), along:[lo, hi], offs:[o0, o1], u:f.u, n:f.n});
    }
    // due rampe dritte affiancate, stessa direzione, con le pedate alla stessa altezza di partenza/arrivo: scala a U; perpendicolari e vicine: a L
    const stairs = [], gone = new Set();
    for (const f of out){ if (gone.has(f) || f.kind !== "dritta") continue;
      const g = out.find(h => h !== f && !gone.has(h) && h.kind === "dritta" && Math.abs(h.n[0]*f.n[0] + h.n[1]*f.n[1]) > .99 && Math.abs(h.w - f.w) < .25
        && Math.min(h.offs[1], f.offs[1]) - Math.max(h.offs[0], f.offs[0]) > -.6 && Math.abs((h.along[0] + h.along[1]) / 2 - (f.along[0] + f.along[1]) / 2) < f.w + h.w);
      if (g){ gone.add(f); gone.add(g);
        const x0 = Math.min(f.along[0], g.along[0]), x1 = Math.max(f.along[1], g.along[1]), y0 = Math.min(f.offs[0], g.offs[0]), y1 = Math.max(f.offs[1], g.offs[1]);
        stairs.push({shape:"U", center:[f.u[0]*(x0 + x1)/2 + f.n[0]*(y0 + y1)/2, f.u[1]*(x0 + x1)/2 + f.n[1]*(y0 + y1)/2], dir:f.dir, known:f.known || g.known, w:+((f.w + g.w) / 2).toFixed(3), tread:+((f.tread + g.tread) / 2).toFixed(3), steps:f.steps + g.steps + 2, ext:false,
          conf:f.known || g.known ? {ok:true} : {ok:false, why:"scala a U: verso di salita da controllare"}}); continue; }
      gone.add(f);
      stairs.push({shape:"dritta", center:f.center, dir:f.dir, known:f.known, w:f.w, tread:f.tread, steps:f.steps, ext:false, conf:f.known ? {ok:true} : {ok:false, why:"rampa: verso di salita da controllare"}});
    }
    // linee del layer delle scale che restano inspiegate vicino a una scala: riconosciuta solo in parte → dubbio
    for (const st of stairs){ const R = Math.max(st.w, st.steps * st.tread) / 2 + 1.2;
      const left = segs.filter((s, j) => j >= extraFrom && !used.has(j) && segLen(s) > .3 && Math.hypot((s[0] + s[2]) / 2 - st.center[0], (s[1] + s[3]) / 2 - st.center[1]) < R).length;
      if (left > 2) st.conf = {ok:false, why:`scala riconosciuta in parte (${left} linee della scala non spiegate): controlla rampe e gradini`}; }
    for (const f of out) if (f.kind === "gradini") stairs.push({shape:"gradini", center:f.center, dir:f.dir, known:true, w:f.w, tread:f.tread, steps:f.steps, ext:true, conf:{ok:true}});
    return {stairs, used};
  }
  /** Pianta: pulizia, raddrizzamento sulla direzione principale, riconoscimento, ritorno all'orientamento del disegno. */
  function analyzePlan(segsIn, arcs = [], texts = [], opt = {}){
    // scale prima di tutto: le loro linee (anche quelle sul layer delle scale, passate a parte) non diventano muri
    const extra = opt.stairSegs || [], st = opt.stairs === false ? {stairs:[], used:new Set()} : findStairs([...segsIn, ...extra], segsIn.length);
    if (st.used.size) segsIn = segsIn.filter((_, i) => !st.used.has(i));
    const r = analyzePlanRot(segsIn, arcs, texts, opt); r.stairs = st.stairs; return r;
  }
  function analyzePlanRot(segsIn, arcs = [], texts = [], opt = {}){
    const segs0 = opt.clean === false ? segsIn : cleanSegs(segsIn, opt), th = opt.straighten === false ? 0 : dominantAngle(segs0);
    if (Math.abs(th) < 1e-4) return analyzePlanAxis(segs0, arcs, texts, opt);
    const c = Math.cos(-th), s = Math.sin(-th), R = p => rotPt(p, c, s), B = p => rotPt(p, Math.cos(th), Math.sin(th));
    const r = analyzePlanAxis(segs0.map(g => { const a = R([g[0], g[1]]), b = R([g[2], g[3]]); return [a[0], a[1], b[0], b[1], g[4]]; }),
      arcs.map(a => { const p = R([a.cx, a.cy]); return {...a, cx:p[0], cy:p[1], a0:(a.a0 ?? 0) - th, a1:(a.a1 ?? 0) - th}; }),
      texts.map(t => { const p = R([t.x, t.y]); return {...t, x:p[0], y:p[1]}; }), opt);
    for (const w of r.walls){ w.a = B(w.a).map(v => +v.toFixed(4)); w.b = B(w.b).map(v => +v.toFixed(4)); }
    for (const rm of r.rooms){ rm.pts = rm.pts.map(p => B(p).map(v => +v.toFixed(4))); }
    r.angle = +(th / D2R).toFixed(3); return r;
  }
  function analyzePlanAxis(segsIn, arcs = [], texts = [], opt = {}){
    const minT = opt.minThick ?? .05; let maxT = opt.maxThick ?? .7;
    const segs = segsIn.filter(s => segLen(s) >= .05).map(s => { const L = segLen(s); let ang = Math.atan2(s[3]-s[1], s[2]-s[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI; return {s, L, ang}; });
    // gruppi di direzione (tolleranza 1°), con il caso 0°/180°
    const order = segs.map((_, i) => i).sort((a,b) => segs[a].ang - segs[b].ang);
    const groups = []; let cur = null;
    for (const i of order){ if (!cur || segs[i].ang - cur.last > D2R * .6){ cur = {ids:[], last:segs[i].ang}; groups.push(cur); } cur.ids.push(i); cur.last = segs[i].ang; }
    if (groups.length > 1 && (Math.PI - groups[groups.length-1].last) + segs[groups[0].ids[0]].ang < D2R * .6){ groups[0].ids.push(...groups.pop().ids); }
    // layer dei muri come primo indizio: se c'è (MURI, WALL, A-WALL…) e porta almeno un quarto delle linee, le facce si cercano solo lì
    const WALL_L = /mur|wall|parete|tamponam|tramezz|costru/i, wallLen = segs.reduce((t, x) => t + (WALL_L.test(x.s[4] || "") ? x.L : 0), 0), allLen = segs.reduce((t, x) => t + x.L, 0);
    const wallOnly = opt.wallLayer !== false && wallLen >= .25 * allLen ? i => WALL_L.test(segs[i].s[4] || "") : null;
    // con il layer dei muri si accetta ogni spessore plausibile, anche i muri antichi fino a 80 cm, senza chiedere che si ripeta
    if (wallOnly && opt.maxThick == null) maxT = .8;
    const pairs = [];
    for (const g of groups){
      const a0 = median(g.ids.map(i => segs[i].ang)), u = [Math.cos(a0), Math.sin(a0)], n = [-u[1], u[0]];
      g.u = u; g.n = n;
      const L = g.ids.filter(i => segs[i].L >= .15).map(i => { const s = segs[i].s; const p0 = s[0]*u[0] + s[1]*u[1], p1 = s[2]*u[0] + s[3]*u[1]; const o0 = s[0]*n[0] + s[1]*n[1], o1 = s[2]*n[0] + s[3]*n[1]; return {i, a:Math.min(p0,p1), b:Math.max(p0,p1), off:(o0+o1)/2, skew:Math.abs(o0-o1)}; }).filter(x => x.skew < .03).sort((x,y) => x.off - y.off);
      g.lines = L;
      for (let x = 0; x < L.length; x++) for (let y = x+1; y < L.length && L[y].off - L[x].off <= maxT; y++){
        if (wallOnly && !(wallOnly(L[x].i) && wallOnly(L[y].i))) continue;
        const d = L[y].off - L[x].off; if (d < minT) continue;
        const o0 = Math.max(L[x].a, L[y].a), o1 = Math.min(L[x].b, L[y].b);
        if (o1 - o0 >= .15) pairs.push({g, A:L[x], B:L[y], d, o0, o1});
      }
    }
    // spessori ricorrenti: istogramma pesato sulla lunghezza (scarta vetri, arredi, campiture)
    const hist = new Map(); let tot = 0;
    for (const p of pairs){ const k = Math.round(p.d * 100); const w = p.o1 - p.o0; hist.set(k, (hist.get(k) || 0) + w); tot += w; }
    const peaks = [...hist.entries()].filter(([k, w]) => { const nb = (hist.get(k-1)||0) + w + (hist.get(k+1)||0); return nb >= Math.max(.04 * tot, 1.5) && w >= (hist.get(k-1)||0) && w >= (hist.get(k+1)||0); }).map(([k]) => k / 100);
    const top = Math.max(0, ...peaks.map(t => [-1, 0, 1].reduce((s, q) => s + (hist.get(Math.round(t*100) + q) || 0), 0)));
    peaks.splice(0, peaks.length, ...peaks.filter(t => [-1, 0, 1].reduce((s, q) => s + (hist.get(Math.round(t*100) + q) || 0), 0) >= .06 * top));
    const okT = d => wallOnly ? d >= minT && d <= maxT : peaks.some(t => Math.abs(t - d) <= .015);
    // ogni tratto di linea appartiene a un solo muro: si scelgono prima le coppie più lunghe
    const used = new Map(); // indice linea -> intervalli occupati
    const freeParts = (li, a, b) => { let parts = [[a, b]]; for (const [u0, u1] of used.get(li) || []) parts = parts.flatMap(([p0, p1]) => (u1 <= p0 || u0 >= p1) ? [[p0, p1]] : [[p0, u0], [u1, p1]].filter(([q0, q1]) => q1 - q0 > .02)); return parts; };
    const take = (li, a, b) => { if (!used.has(li)) used.set(li, []); used.get(li).push([a, b]); };
    const pieces = [];
    const full = (L, p) => (p.o1 - p.o0) >= .8 * (L.b - L.a);
    for (const p of pairs.filter(p => okT(p.d) || (p.d >= .06 && p.d <= .35 && full(p.A, p) && full(p.B, p))).sort((a,b) => (okT(b.d) - okT(a.d)) || (b.o1-b.o0) - (a.o1-a.o0) || a.d - b.d)){
      for (const [a, b] of freeParts(p.A.i, p.o0, p.o1)) for (const [c, d] of freeParts(p.B.i, a, b)){
        if (d - c < .1) continue; take(p.A.i, c, d); take(p.B.i, c, d);
        pieces.push({g:p.g, off:(p.A.off + p.B.off)/2, t:p.d, a:c, b:d, peak:okT(p.d)});
      }
    }
    // muri a linea singola (perimetro verso il confinante o la facciata): una linea del layer dei muri senza faccia gemella,
    // con muri perpendicolari che la toccano da un solo lato, diventa un muro di spessore stimato verso il lato libero (dubbio in revisione)
    if (wallOnly && opt.singleLine !== false){
      const Tsl = opt.singleThick ?? .3;
      for (const g of groups) for (const ln of g.lines || []){
        if (!wallOnly(ln.i)) continue;
        for (const [a, b] of freeParts(ln.i, ln.a, ln.b)){
          if (b - a < 1) continue;
          let side = 0; const sides = new Map();   // asse del muro perpendicolare → lati in cui sta (un muro che attraversa la linea non conta)
          for (const pc of pieces){ const cr = g.u[0]*pc.g.u[1] - g.u[1]*pc.g.u[0]; if (Math.abs(cr) < .9) continue;
            const Pp = s0 => [pc.g.u[0]*s0 + pc.g.n[0]*pc.off, pc.g.u[1]*s0 + pc.g.n[1]*pc.off], acr = Q => Q[0]*g.n[0] + Q[1]*g.n[1] - ln.off, M = acr(Pp((pc.a + pc.b) / 2));
            for (const s0 of [pc.a, pc.b]){ const E = Pp(s0), along = E[0]*g.u[0] + E[1]*g.u[1];
              // l'estremo tocca la linea; il lato è quello in cui sta il resto del muro perpendicolare
              if (along < a - pc.t / 2 - .1 || along > b + pc.t / 2 + .1 || Math.abs(acr(E)) > pc.t / 2 + .3 || Math.abs(M) < .2) continue;
              const k = Math.round(along / .05); if (!sides.has(k)) sides.set(k, new Set()); sides.get(k).add(Math.sign(M)); } }
          let nA = 0, nB = 0; for (const set of sides.values()) if (set.size === 1) set.has(1) ? nA++ : nB++;
          if (nA && !nB) side = 1; else if (nB && !nA) side = -1; else continue;
          take(ln.i, a, b); pieces.push({g, off:ln.off - side * Tsl / 2, t:Tsl, a, b, peak:true, single:true});
        }
      }
    }
    // linee di muro: pezzi allineati, uniti; i vuoti tra 0,5 e 3,2 m sono aperture
    const lines = [];
    for (const pc of pieces.sort((x,y) => x.off - y.off)){
      let ln = lines.find(l => l.g === pc.g && l.peak === pc.peak && Math.abs(l.off - pc.off) < .04 && Math.abs(l.t - pc.t) < .035);
      if (!ln){ ln = {g:pc.g, off:pc.off, t:pc.t, peak:pc.peak, pcs:[]}; lines.push(ln); }
      ln.pcs.push(pc);
    }
    const walls = [], openings = [];
    for (const ln of lines){
      const ps = ln.pcs.sort((x,y) => x.a - y.a), runs = [];
      for (const pc of ps){ const r = runs[runs.length-1]; if (r && pc.a - r.b < .45) r.b = Math.max(r.b, pc.b); else runs.push({a:pc.a, b:pc.b}); }
      let wall = null;
      const P = (s) => [ln.g.u[0]*s + ln.g.n[0]*ln.off, ln.g.u[1]*s + ln.g.n[1]*ln.off];
      for (let k = 0; k < runs.length; k++){
        const r = runs[k], prev = runs[k-1], gap = prev ? r.a - prev.b : Infinity;
        if (wall && gap <= 3.2){ wall.ops.push({s0:prev.b, s1:r.a}); wall.b = r.b; }
        else { wall = {g:ln.g, off:ln.off, t:Math.round(ln.t * 100) / 100, a:r.a, b:r.b, ops:[], peak:ln.peak, joined:{}, single:ln.pcs.some(p => p.single)}; walls.push(wall); }
      }
      for (const w of walls.filter(w => w.g === ln.g && w.off === ln.off)) w.P = P;
    }
    // piccoli pezzi isolati (stipiti, pilastrini) sotto i 40 cm: scartati
    let W = walls.filter(w => w.b - w.a >= .4 || w.ops.length);
    // giunzioni: le estremità si allungano fino all'asse del muro che incontrano
    const toXY = w => ({A:w.P(w.a), B:w.P(w.b)});
    for (const w of W){
      for (const end of ["a", "b"]){
        const sgn = end === "a" ? -1 : 1, E = w.P(w[end]); let best = null;
        for (const v of W){
          if (v === w) continue; const cr = w.g.u[0]*v.g.u[1] - w.g.u[1]*v.g.u[0]; if (Math.abs(cr) < .5) continue;
          // intersezione tra la retta di w e l'asse di v
          const V = toXY(v), vd = [V.B[0]-V.A[0], V.B[1]-V.A[1]], vl = Math.hypot(...vd);
          const den = w.g.u[0]*vd[1] - w.g.u[1]*vd[0]; if (Math.abs(den) < 1e-9) continue;
          const lam = ((V.A[0]-E[0])*vd[1] - (V.A[1]-E[1])*vd[0]) / den; // distanza lungo u da E
          const mu = ((V.A[0]-E[0])*w.g.u[1] - (V.A[1]-E[1])*w.g.u[0]) / den; // parametro su v (0..1)
          const reach = sgn * lam, slack = (w.t + v.t) / 2 + .12;
          if (reach < -v.t/2 - .02 || reach > v.t/2 + .2) continue;
          if (mu * vl < -slack || mu * vl > vl + slack) continue;
          if (!best || Math.abs(reach) < Math.abs(best.reach)) best = {reach, lam};
        }
        if (best){ w[end] += best.lam; w.joined[end] = true; }
      }
    }
    W = W.filter(w => w.b - w.a > .1);
    // nicchie e spessore variabile: due tratti allineati che condividono una faccia e si toccano sono lo stesso muro
    for (const w of W) for (const v of W){
      if (v === w || v.g !== w.g || Math.abs(v.off - w.off) > (v.t + w.t) / 2) continue;
      const share = [-1, 1].some(sw => [-1, 1].some(sv => Math.abs((w.off + sw * w.t / 2) - (v.off + sv * v.t / 2)) < .02));
      if (!share) continue;
      if (Math.abs(v.a - w.b) < .06){ w.joined.b = true; v.joined.a = true; w.nicchia = v.nicchia = true; }
      if (Math.abs(v.b - w.a) < .06){ w.joined.a = true; v.joined.b = true; w.nicchia = v.nicchia = true; }
    }
    // muri isolati di spessore secondario (arredi, campiture): scartati
    const mainT = peaks.length ? peaks.reduce((m, t) => ((hist.get(Math.round(t*100)) || 0) > (hist.get(Math.round(m*100)) || 0) ? t : m), peaks[0]) : 0;
    const segDist = (p, A, B) => { const d = [B[0]-A[0], B[1]-A[1]], l2 = d[0]*d[0] + d[1]*d[1] || 1e-12; const t = Math.max(0, Math.min(1, ((p[0]-A[0])*d[0] + (p[1]-A[1])*d[1]) / l2)); return Math.hypot(p[0]-A[0]-t*d[0], p[1]-A[1]-t*d[1]); };
    const linked = w => { const E = [w.P(w.a), w.P(w.b)]; return W.some(v => v !== w && (() => { const A = v.P(v.a), B = v.P(v.b), Ew = [A, B]; return E.some(p => segDist(p, A, B) < (w.t + v.t)/2 + .1) || Ew.some(p => segDist(p, E[0], E[1]) < (w.t + v.t)/2 + .1); })()); };
    W = W.filter(w => w.peak ? (Math.abs(w.t - mainT) <= .015 || linked(w)) : (w.joined.a && w.joined.b && w.b - w.a >= .5));
    // un muro che sta dentro la fascia di un muro più spesso (linee del telaio di una finestra, doppie linee) non esiste
    W = W.filter(w => !W.some(v => v !== w && v.g === w.g && v.t > w.t + .02 && Math.abs(v.off - w.off) < (v.t - w.t) / 2 + .01 && Math.min(v.b, w.b) - Math.max(v.a, w.a) > .8 * (w.b - w.a)));
    // porta o finestra in fondo al muro (vicino all'angolo): il vano arriva fino alla faccia del muro perpendicolare
    const nearArc = (P0, P1, t, width) => arcs.some(a => a.r > .3 && a.r < 1.7 && (Math.hypot(a.cx-P0[0], a.cy-P0[1]) < t/2 + .25 || Math.hypot(a.cx-P1[0], a.cy-P1[1]) < t/2 + .25) && (Math.abs(a.r - width) < .3 || Math.abs(a.r - width/2) < .2));
    for (const w of W){
      for (const end of ["a", "b"]){
        if (w.joined[end]) continue;
        const sgn = end === "a" ? -1 : 1, E = w.P(w[end]); let best = null;
        for (const v of W){
          if (v === w) continue; const cr = w.g.u[0]*v.g.u[1] - w.g.u[1]*v.g.u[0]; if (Math.abs(cr) < .5) continue;
          const V = toXY(v), vd = [V.B[0]-V.A[0], V.B[1]-V.A[1]], vl = Math.hypot(...vd), den = w.g.u[0]*vd[1] - w.g.u[1]*vd[0]; if (Math.abs(den) < 1e-9) continue;
          const lam = ((V.A[0]-E[0])*vd[1] - (V.A[1]-E[1])*vd[0]) / den, mu = ((V.A[0]-E[0])*w.g.u[1] - (V.A[1]-E[1])*w.g.u[0]) / den, reach = sgn * lam;
          if (reach <= v.t/2 + .4 || reach > v.t/2 + 3.2 || mu * vl < -.05 || mu * vl > vl + .05) continue;
          if (!best || reach < best.reach) best = {reach, lam, v};
        }
        if (!best) continue;
        const width = best.reach - best.v.t/2, s0 = end === "b" ? w.b : w.a - width, s1 = s0 + width;
        const glass = (w.g.lines || []).some(l => Math.abs(l.off - w.off) < w.t/2 + .02 && Math.min(l.b, s1) - Math.max(l.a, s0) > .5 * width);
        if (!nearArc(w.P(s0), w.P(s1), w.t, width) && !glass) continue;
        w.ops.push({s0, s1}); w[end] += best.lam; w.joined[end] = true;
      }
    }
    // porte e finestre nei vuoti
    let nid = 0;
    // fiducia per la revisione guidata (fase C): dubbio con il motivo, altrimenti sicuro
    const wallConf = w => w.single ? {ok:false, why:`muro a linea singola: spessore stimato ${Math.round(w.t * 100)} cm`} : !w.peak ? {ok:false, why:`spessore raro (${Math.round(w.t * 100)} cm)`} : !(w.joined.a && w.joined.b) && !linked(w) ? {ok:false, why:"non collegato ad altri muri"} : !(w.joined.a && w.joined.b) ? {ok:false, why:"un capo libero"} : {ok:true};
    const out = W.map(w => ({id:"w" + (nid++), a:w.P(w.a), b:w.P(w.b), thick:w.t, conf:wallConf(w), _w:w}));
    // la cerniera di un arco è lo stipite più vicino al suo centro: l'arco appartiene a quel vano soltanto (non alla finestra accanto, nell'altro muro)
    const jambs = []; for (const ow of out) for (const o of ow._w.ops) if (o.s1 - o.s0 >= .45) for (const s of [o.s0, o.s1]) jambs.push({o, p:ow._w.P(s)});
    const owner = a => { let b = null, bd = Infinity; for (const j of jambs){ const d = Math.hypot(a.cx - j.p[0], a.cy - j.p[1]); if (d < bd){ bd = d; b = j.o; } } return b; };
    const jd = (a, o) => Math.min(...jambs.filter(j => j.o === o).map(j => Math.hypot(a.cx - j.p[0], a.cy - j.p[1])));
    // arco di un altro vano ma con la cerniera quasi alla stessa distanza: attribuzione incerta → dubbio
    const contested = (a, o) => { const w = owner(a); return w !== o && jd(a, o) < jd(a, w) + .15; };
    for (const ow of out){
      const w = ow._w;
      for (const o of w.ops){
        const width = o.s1 - o.s0; if (width < .45) continue;
        const j0 = w.P(o.s0), j1 = w.P(o.s1);
        const arc = arcs.find(a => a.r > .45 && a.r < 1.7 && owner(a) === o && (Math.hypot(a.cx-j0[0], a.cy-j0[1]) < w.t/2 + .25 || Math.hypot(a.cx-j1[0], a.cy-j1[1]) < w.t/2 + .25) && (Math.abs(a.r - width) < .3 || Math.abs(a.r - width/2) < .2));
        const inGap = (w.g.lines || []).filter(l => Math.abs(l.off - w.off) < w.t/2 + .02).map(l => ({l, ov:Math.min(l.b, o.s1) - Math.max(l.a, o.s0)})).filter(x => x.ov > .2 * width);
        const glass = inGap.some(x => x.ov > .5 * width);
        // porta scorrevole: ante su due linee sfalsate, ciascuna più corta del vano, che si sovrappongono al centro
        const part = inGap.filter(x => x.ov < .88 * width), sliding = part.some(x => part.some(y => Math.abs(y.l.off - x.l.off) > .005 && Math.min(x.l.b, y.l.b) - Math.max(x.l.a, y.l.a) > .05 * width)) && !inGap.some(x => x.ov >= .88 * width);
        const foreign = !arc && arcs.find(a => a.r > .45 && a.r < 1.7 && (contested(a, o) || !glass && owner(a) !== o) && (Math.hypot(a.cx-j0[0], a.cy-j0[1]) < w.t/2 + .25 || Math.hypot(a.cx-j1[0], a.cy-j1[1]) < w.t/2 + .25));
        const type = arc || sliding ? "door" : glass ? "window" : width >= 2.6 ? "window" : "door";
        // portafinestra: ante a battente (arco) e vetro per tutta la luce del vano
        const pf = !!arc && inGap.some(x => x.ov > .88 * width) && width >= .6;
        openings.push({wall:ow.id, t:(o.s0 + o.s1)/2 - w.a, w:+width.toFixed(3), type, from:pf ? "portafinestra" : arc ? "arco" : sliding ? "scorrevole" : glass ? "vetro" : "vuoto", ...(pf ? {style:"portafinestra"} : sliding && !arc ? {style:"scorrevole"} : {}),
          conf:foreign ? {ok:false, why:`arco di ${Math.round(foreign.r * 100)} cm conteso con il vano vicino: ${type === "door" ? "porta" : "finestra"}?`} : !(arc || sliding || glass) ? {ok:false, why:`vano di ${Math.round(width * 100)} cm senza simbolo: ${type === "door" ? "porta" : "finestra"}?`}
            : arc && Math.abs(arc.r - width) > .1 && Math.abs(arc.r - width/2) > .1 ? {ok:false, why:`arco di ${Math.round(arc.r * 100)} cm su un vano di ${Math.round(width * 100)} cm`}
            : {ok:true}});
      }
    }
    applyOpeningLabels(out, openings, texts);
    const rooms = findRooms(out, texts);
    return {walls:out.map(({_w, ...r}) => r), openings, rooms, thicknesses:[...new Set(out.map(w => w.thick))].sort((a,b) => a-b)};
  }

  /* locali: aree chiuse dai muri (raster 5 cm) con il nome preso dai testi della pianta */
  /** Etichetta scritta accanto a un'apertura: «80/210», «100x140», «hb 90», «h.d. 1,00»… (misure in cm, o in m se piccole). */
  function parseOpeningLabel(raw){
    const s = cleanText(raw).toLowerCase().replace(/rei\s*\d+/g, "").replace(/\(.*?\)/g, "").trim();
    let m = s.match(/^(?:h\.?\s*b\.?|h\.?\s*d\.?|hdav|dav(?:anzale)?|bancale)\s*[=:.]?\s*(\d+(?:[.,]\d+)?)\s*(cm|m)?$/);
    if (m){ let v = +m[1].replace(",", "."); if (m[2] === "m" || v < 3) v *= 100; return v >= 0 && v <= 250 ? {k:"hb", v:+(v / 100).toFixed(3)} : null; }
    m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|\*|\/|\s)\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?$/);
    if (m){ let w = +m[1].replace(",", "."), h = +m[2].replace(",", "."); if (w < 5 && h < 5){ w *= 100; h *= 100; }
      if (w >= 40 && w <= 400 && h >= 40 && h <= 320) return {k:"wh", w:+(w / 100).toFixed(3), h:+(h / 100).toFixed(3)}; }
    return null;
  }
  /** Misure scritte delle aperture: un'etichetta L/H vale solo se la larghezza del vano la conferma (luce del serramento ≤ vano ≤ luce + 16 cm);
   *  l'altezza scritta decide il tipo quando il simbolo è incerto; «hb» è il davanzale delle finestre o l'alzatina delle porte. */
  function applyOpeningLabels(walls, openings, texts){
    if (!texts?.length || !openings.length) return;
    const W = new Map(walls.map(w => [w.id, w]));
    const C = o => { const w = W.get(o.wall), L = Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]) || 1; return [w.a[0] + (w.b[0]-w.a[0]) / L * o.t, w.a[1] + (w.b[1]-w.a[1]) / L * o.t]; };
    const ops = openings.map(o => ({o, c:C(o)})), labs = texts.map(t => ({t, L:parseOpeningLabel(t.text)})).filter(x => x.L);
    if (!labs.length) return;
    const dist = (q, t) => Math.hypot(q.c[0] - t.x, q.c[1] - t.y);
    const pairs = [];
    for (const l of labs) if (l.L.k === "wh") for (const q of ops){ const d = dist(q, l.t), dw = q.o.w - l.L.w; if (d < 1.6 && dw >= -.05 && dw <= .16) pairs.push({l, q, d}); }
    pairs.sort((a, b) => a.d - b.d); const used = new Set();
    for (const p of pairs){ if (used.has(p.l) || p.q.lab) continue; used.add(p.l); p.q.lab = p.l.L; }
    for (const q of ops){ const o = q.o, L = q.lab; if (!L) continue;
      const glass = o.from === "vetro" || o.from === "portafinestra";
      o.h = L.h; o.label = `${Math.round(L.w * 100)}/${Math.round(L.h * 100)}`;
      if (L.h < 1.6){ if (o.type === "door"){ o.type = "window"; delete o.style; } o.conf = {ok:true}; }
      else if (L.h >= 1.95){ if (glass){ o.type = "door"; o.style = "portafinestra"; o.from = "portafinestra"; } else if (o.type === "window"){ o.type = "door"; } o.conf = {ok:true}; }
      else if (o.conf?.ok === false) o.conf = {ok:false, why:`${o.conf.why} (scritto ${o.label})`};
    }
    // etichetta vicina a un vano di larghezza diversa: dubbio con il motivo, mai una correzione silenziosa
    for (const l of labs) if (l.L.k === "wh" && !used.has(l)){ const n = ops.map(q => ({q, d:dist(q, l.t)})).sort((a, b) => a.d - b.d)[0];
      if (n && n.d < .75 && !n.q.lab && n.q.o.conf?.ok !== false) n.q.o.conf = {ok:false, why:`scritto ${Math.round(l.L.w * 100)}/${Math.round(l.L.h * 100)} ma il vano è largo ${Math.round(n.q.o.w * 100)} cm`}; }
    for (const l of labs) if (l.L.k === "hb"){
      const near = ops.map(q => ({q, d:dist(q, l.t)})).filter(x => x.d < 1.6).sort((a, b) => a.d - b.d);
      if (l.L.v <= .3){ const n = near[0]; if (!n) continue; const o = n.q.o;
        if (o.type === "window" && o.h != null && o.h >= 1.95 || o.type === "door"){ o.type = "door"; if (o.from === "vetro" || o.from === "portafinestra"){ o.style = "portafinestra"; o.from = "portafinestra"; } if (l.L.v > .005) o.alz = l.L.v; o.sill = 0; }
        else if (o.type === "window") o.conf = {ok:false, why:`scritto hb ${Math.round(l.L.v * 100)} su una finestra: portafinestra con alzatina?`};
        continue; }
      const n = near.find(x => x.q.o.type === "window"); if (!n) continue;
      n.q.o.sill = l.L.v; n.q.o.hb = true; }
  }
  function findRooms(walls, texts, cell = .05){
    if (!walls.length) return [];
    const rooms = vectorRooms(walls) || rasterRooms();
    function rasterRooms(){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of walls) for (const p of [w.a, w.b]){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
    const nx = Math.ceil((x1-x0)/cell), ny = Math.ceil((y1-y0)/cell); if (nx * ny > 6e6) return [];
    const G = new Uint8Array(nx * ny); // 0 libero, 1 muro, 2 esterno, 3+ locale
    for (const w of walls){
      const d = [w.b[0]-w.a[0], w.b[1]-w.a[1]], L = Math.hypot(...d), u = [d[0]/L, d[1]/L], h = w.thick/2 + cell*.6;
      const bx0 = Math.max(0, Math.floor((Math.min(w.a[0], w.b[0]) - h - x0)/cell)), bx1 = Math.min(nx-1, Math.ceil((Math.max(w.a[0], w.b[0]) + h - x0)/cell));
      const by0 = Math.max(0, Math.floor((Math.min(w.a[1], w.b[1]) - h - y0)/cell)), by1 = Math.min(ny-1, Math.ceil((Math.max(w.a[1], w.b[1]) + h - y0)/cell));
      for (let j = by0; j <= by1; j++) for (let i = bx0; i <= bx1; i++){
        const px = x0 + (i+.5)*cell - w.a[0], py = y0 + (j+.5)*cell - w.a[1], s = px*u[0] + py*u[1], o = -px*u[1] + py*u[0];
        if (s >= -h && s <= L + h && Math.abs(o) <= h) G[j*nx + i] = 1;
      }
    }
    const flood = (start, val) => { const st = [start]; G[start] = val; let n = 0, sx = 0, sy = 0; while (st.length){ const k = st.pop(); n++; const i = k % nx, j = (k / nx) | 0; sx += i; sy += j; for (const q of [i > 0 ? k-1 : -1, i < nx-1 ? k+1 : -1, j > 0 ? k-nx : -1, j < ny-1 ? k+nx : -1]) if (q >= 0 && G[q] === 0){ G[q] = val; st.push(q); } } return n; };
    flood(0, 2);
    const rooms = []; let lab = 3;
    for (let k = 0; k < G.length && lab < 250; k++){
      if (G[k] !== 0) continue; const n = flood(k, lab);
      if (n * cell * cell >= 1.2){ const pts = traceRoom(G, nx, ny, lab, k, x0, y0, cell); if (pts.length >= 3) rooms.push({pts, area:+(n*cell*cell).toFixed(2)}); }
      lab++;
    }
    // i bordi del raster (5 cm) si agganciano alle facce dei muri vicine
    // facce dei muri orizzontali e verticali, con il tratto che coprono: ogni lato del locale si aggancia solo
    // alle facce dei muri che gli stanno di fronte (muri allineati di spessore diverso non si confondono)
    const fx = [], fy = [];
    for (const w of walls){ const dx = w.b[0]-w.a[0], dy = w.b[1]-w.a[1], L = Math.hypot(dx, dy) || 1, h = w.thick/2;
      if (Math.abs(dy) / L < .01){ const lo = Math.min(w.a[0], w.b[0]) - h, hi = Math.max(w.a[0], w.b[0]) + h; fy.push({v:w.a[1] - h, lo, hi}, {v:w.a[1] + h, lo, hi}); }
      else if (Math.abs(dx) / L < .01){ const lo = Math.min(w.a[1], w.b[1]) - h, hi = Math.max(w.a[1], w.b[1]) + h; fx.push({v:w.a[0] - h, lo, hi}, {v:w.a[0] + h, lo, hi}); } }
    const snapTo = (v, list, at) => { let b = v, bd = .1; for (const f of list){ if (at != null && (at < f.lo - .02 || at > f.hi + .02)) continue; const d = Math.abs(f.v - v); if (d < bd){ bd = d; b = f.v; } } return +b.toFixed(3); };
    for (const r of rooms){
      const P = r.pts, n = P.length, out = P.map(p => [...p]);
      for (let i = 0; i < n; i++){ const a = P[i], b = P[(i+1) % n];
        if (Math.abs(a[1]-b[1]) < 1e-6){ const y = snapTo(a[1], fy, (a[0]+b[0])/2); out[i][1] = y; out[(i+1) % n][1] = y; }
        else if (Math.abs(a[0]-b[0]) < 1e-6){ const x = snapTo(a[0], fx, (a[1]+b[1])/2); out[i][0] = x; out[(i+1) % n][0] = x; } }
      r.pts = snapEdges(out, walls); const A = r.pts.reduce((s, p, i) => { const q = r.pts[(i+1) % r.pts.length]; return s + p[0]*q[1] - q[0]*p[1]; }, 0); r.area = +Math.abs(A/2).toFixed(2); }
    return rooms;
    }
    const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length-1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0]-p[i][0]) * (y-p[i][1]) / (p[j][1]-p[i][1]) + p[i][0]) c = !c; return c; };
    const skip = /^\s*([\d.,]+\s*(m|mq|m2|m²|cm)?|h\s*[=:].*|s\.?\s*=.*|sup.*|superf.*|[\d.,]+\s*[x×]\s*[\d.,]+.*)\s*$/i;
    for (const r of rooms){
      const cand = texts.filter(t => inPoly(t.x, t.y, r.pts)).map(t => cleanText(t.text)).filter(t => t && t.length <= 30 && !skip.test(t) && /[a-zà-ù]{2}/i.test(t));
      // il nome senza la superficie e l'altezza scritte accanto («Soggiorno mq 35,54 h 2,90» → «Soggiorno»)
      const name = (cand[0] || "").replace(/\s*(\b(mq|m2|m²|sup\.?|s\s*=|h\s*[=:]?\s*\d)|\d+[.,]\d+\s*(mq|m2|m²)).*$/i, "").trim(); r.name = name ? name[0].toUpperCase() + name.slice(1).toLowerCase() : "";
      // superficie scritta nel locale («14,50 m²», «mq 14.5») confrontata con quella calcolata
      const written = texts.filter(t => inPoly(t.x, t.y, r.pts)).map(t => cleanText(t.text).match(/(?:^|\s)(?:mq|m2|m²|sup\.?|s\s*=)?\s*(\d+[.,]\d+|\d+)\s*(?:mq|m2|m²)?\s*$/i)).find(m => m && /mq|m2|m²|sup|s\s*=/i.test(m[0]));
      const wa = written ? +written[1].replace(",", ".") : null, A = r.area;
      r.conf = wa && Math.abs(A - wa) / wa > .01 ? {ok:false, why:`superficie scritta ${String(wa).replace(".", ",")} m², calcolata ${A.toFixed(2).replace(".", ",")} m²`} : A < 2 ? {ok:false, why:"locale molto piccolo"} : {ok:true, ...(wa ? {written:wa} : {})};
      r.mat = /bagn|wc|doccia|lavand|cucin|kitchen|bath|lavanderia|centrale|tecnic/i.test(name) ? "gres" : /terraz|balcon|portic|loggi|cortil/i.test(name) ? "pietra" : /garage|box|cantin|riposti/i.test(name) ? "cemento" : "parquet";
    }
    return rooms;
  }
  /** Ogni lato del locale sulla faccia del muro parallelo più vicino (a qualsiasi angolo); vertici = intersezioni dei lati. */
  function snapEdges(P, walls){
    const n = P.length; if (n < 3) return P;
    const faces = []; for (const w of walls){ const d = [w.b[0]-w.a[0], w.b[1]-w.a[1]], L = Math.hypot(d[0], d[1]) || 1, u = [d[0]/L, d[1]/L], nn = [-u[1], u[0]], o = w.a[0]*nn[0] + w.a[1]*nn[1], s0 = w.a[0]*u[0] + w.a[1]*u[1];
      for (const sg of [-1, 1]) faces.push({u, nn, off:o + sg*w.thick/2, lo:s0 - w.thick, hi:s0 + L + w.thick}); }
    const lines = P.map((A, i) => { const B = P[(i+1) % n], d = [B[0]-A[0], B[1]-A[1]], L = Math.hypot(d[0], d[1]) || 1, u = [d[0]/L, d[1]/L], nn = [-u[1], u[0]], m = [(A[0]+B[0])/2, (A[1]+B[1])/2];
      let best = null; for (const f of faces){ if (Math.abs(u[0]*f.u[1] - u[1]*f.u[0]) > .05) continue; const dd = Math.abs(m[0]*f.nn[0] + m[1]*f.nn[1] - f.off), along = m[0]*f.u[0] + m[1]*f.u[1]; if (dd > .12 || along < f.lo || along > f.hi) continue; if (!best || dd < best.dd) best = {dd, f}; }
      return best ? {nn:best.f.nn, off:best.f.off} : {nn, off:A[0]*nn[0] + A[1]*nn[1]}; });
    return P.map((p, i) => { const l1 = lines[(i - 1 + n) % n], l2 = lines[i], det = l1.nn[0]*l2.nn[1] - l1.nn[1]*l2.nn[0]; if (Math.abs(det) < .1) return p;
      const x = (l1.off*l2.nn[1] - l2.off*l1.nn[1]) / det, y = (l1.nn[0]*l2.off - l2.nn[0]*l1.off) / det; return Math.hypot(x - p[0], y - p[1]) < .3 ? [+x.toFixed(4), +y.toFixed(4)] : p; });
  }
  /* locali esatti quando i muri sono ortogonali (sempre, dopo il raddrizzamento): griglia sulle coordinate stesse dei muri,
     superficie netta senza approssimazioni anche dove un lato confina con muri di spessore diverso */
  function vectorRooms(walls){
    const q = v => Math.round(v * 1e4) / 1e4, R = [];
    for (const w of walls){ const dx = w.b[0]-w.a[0], dy = w.b[1]-w.a[1], L = Math.hypot(dx, dy) || 1, h = w.thick/2;
      if (Math.abs(dy) / L < 1e-3) R.push([q(Math.min(w.a[0], w.b[0])), q(w.a[1]-h), q(Math.max(w.a[0], w.b[0])), q(w.a[1]+h)]);
      else if (Math.abs(dx) / L < 1e-3) R.push([q(w.a[0]-h), q(Math.min(w.a[1], w.b[1])), q(w.a[0]+h), q(Math.max(w.a[1], w.b[1]))]);
      else return null; }
    const X = [...new Set(R.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b), Y = [...new Set(R.flatMap(r => [r[1], r[3]]))].sort((a, b) => a - b);
    X.unshift(X[0] - 1); X.push(X[X.length-1] + 1); Y.unshift(Y[0] - 1); Y.push(Y[Y.length-1] + 1);
    const nx = X.length - 1, ny = Y.length - 1; if (nx * ny > 4e6) return null;
    const G = new Int32Array(nx * ny);   // −1 muro, 0 libero, 1 esterno, 2+ locale
    for (let j = 0; j < ny; j++){ const cy = (Y[j] + Y[j+1]) / 2; for (let i = 0; i < nx; i++){ const cx = (X[i] + X[i+1]) / 2; if (R.some(r => cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3])) G[j*nx + i] = -1; } }
    const fill = (k0, lab) => { const st = [k0]; G[k0] = lab; let A = 0; while (st.length){ const k = st.pop(), i = k % nx, j = (k / nx) | 0; A += (X[i+1]-X[i]) * (Y[j+1]-Y[j]);
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const a = i+di, b = j+dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const kk = b*nx + a; if (G[kk] === 0){ G[kk] = lab; st.push(kk); } } } return A; };
    fill(0, 1); const out = []; let lab = 2;
    for (let k = 0; k < G.length && lab < 400; k++){ if (G[k] !== 0) continue; const A = fill(k, lab);
      if (A >= 1.2){ const pts = traceCells(G, nx, ny, X, Y, lab); if (pts.length >= 3) out.push({pts, area:+A.toFixed(4)}); } lab++; }
    return out;
  }
  // contorno esterno di un'area di celle: lati di confine orientati, concatenati, punti allineati tolti
  function traceCells(G, nx, ny, X, Y, lab){
    const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && G[j*nx + i] === lab, next = new Map(), key = (i, j) => i + "," + j;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ if (!at(i, j)) continue;
      if (!at(i, j-1)) next.set(key(i, j), [i+1, j]); if (!at(i+1, j)) next.set(key(i+1, j), [i+1, j+1]);
      if (!at(i, j+1)) next.set(key(i+1, j+1), [i, j+1]); if (!at(i-1, j)) next.set(key(i, j+1), [i, j]); }
    let best = [], bestA = 0; const seen = new Set();
    for (const k0 of next.keys()){ if (seen.has(k0)) continue; const loop = []; let k = k0, g = 0;
      while (!seen.has(k) && g++ < 1e6){ seen.add(k); const [i, j] = k.split(",").map(Number); loop.push([X[i], Y[j]]); const n = next.get(k); if (!n) break; k = key(n[0], n[1]); }
      const A = Math.abs(loop.reduce((s, p, m) => { const r = loop[(m+1) % loop.length]; return s + p[0]*r[1] - r[0]*p[1]; }, 0) / 2); if (A > bestA){ bestA = A; best = loop; } }
    return best.filter((p, m) => { const a = best[(m - 1 + best.length) % best.length], b = best[(m+1) % best.length]; return Math.abs((p[0]-a[0])*(b[1]-p[1]) - (p[1]-a[1])*(b[0]-p[0])) > 1e-9; }).map(p => p.map(v => +v.toFixed(4)));
  }
  // contorno di un'area (Moore) semplificato con Douglas–Peucker e raddrizzato sugli assi
  function traceRoom(G, nx, ny, lab, k0, x0, y0, cell){
    const inside = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && G[j*nx+i] === lab;
    let si = k0 % nx, sj = (k0 / nx) | 0; // primo pixel in ordine di scansione: bordo superiore-sinistro
    const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    const pts = [[si, sj]]; let ci = si, cj = sj, d = 6, guard = 0;
    while (guard++ < 200000){
      let found = false;
      for (let t = 0; t < 8; t++){ const dd = (d + 6 + t) % 8, ni = ci + dirs[dd][0], nj = cj + dirs[dd][1]; if (inside(ni, nj)){ ci = ni; cj = nj; d = dd; found = true; break; } }
      if (!found || (ci === si && cj === sj)) break;
      pts.push([ci, cj]);
    }
    const P = pts.map(([i, j]) => [x0 + (i+.5)*cell, y0 + (j+.5)*cell]);
    const dp = (a, eps) => { if (a.length < 3) return a; let im = 0, dm = 0; const [A, B] = [a[0], a[a.length-1]], L = Math.hypot(B[0]-A[0], B[1]-A[1]) || 1e-9; for (let i = 1; i < a.length-1; i++){ const dd = Math.abs((B[0]-A[0])*(A[1]-a[i][1]) - (A[0]-a[i][0])*(B[1]-A[1])) / L; if (dd > dm){ dm = dd; im = i; } } return dm > eps ? [...dp(a.slice(0, im+1), eps).slice(0, -1), ...dp(a.slice(im), eps)] : [A, B]; };
    // chiusura: si divide l'anello nel punto più lontano dall'inizio
    let far = 0, fd = 0; P.forEach((p, i) => { const dd = Math.hypot(p[0]-P[0][0], p[1]-P[0][1]); if (dd > fd){ fd = dd; far = i; } });
    let poly = [...dp(P.slice(0, far+1), cell*1.6).slice(0, -1), ...dp([...P.slice(far), P[0]], cell*1.6).slice(0, -1)];
    // lati quasi orizzontali/verticali raddrizzati
    for (let it = 0; it < 2; it++) for (let i = 0; i < poly.length; i++){ const a = poly[i], b = poly[(i+1) % poly.length]; if (Math.abs(a[1]-b[1]) < cell*1.5 && Math.abs(a[0]-b[0]) > cell*3){ const y = (a[1]+b[1])/2; a[1] = b[1] = y; } else if (Math.abs(a[0]-b[0]) < cell*1.5 && Math.abs(a[1]-b[1]) > cell*3){ const x = (a[0]+b[0])/2; a[0] = b[0] = x; } }
    poly = poly.filter((p, i) => { const q = poly[(i+1) % poly.length]; return Math.hypot(p[0]-q[0], p[1]-q[1]) > cell * .5; });
    // il raster sta mezzo pixel dentro: si riporta il bordo sulla faccia del muro
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return poly.map(([x, y]) => [+(x + Math.sign(x - cx) * cell/2).toFixed(3), +(y + Math.sign(y - cy) * cell/2).toFixed(3)]);
  }

  /* ---------- prospetto: altezze, aperture, copertura ---------- */
  function analyzeElevation(segsIn){
    const segs = segsIn.filter(s => segLen(s) > .02);
    if (!segs.length) return null;
    const hor = segs.filter(s => Math.abs(s[3]-s[1]) < .01 * Math.max(segLen(s), .1)).map(s => ({y:(s[1]+s[3])/2, x0:Math.min(s[0], s[2]), x1:Math.max(s[0], s[2])}));
    const ver = segs.filter(s => Math.abs(s[2]-s[0]) < .01 * Math.max(segLen(s), .1)).map(s => ({x:(s[0]+s[2])/2, y0:Math.min(s[1], s[3]), y1:Math.max(s[1], s[3])}));
    let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity; for (const s of segs){ X0 = Math.min(X0, s[0], s[2]); X1 = Math.max(X1, s[0], s[2]); Y0 = Math.min(Y0, s[1], s[3]); Y1 = Math.max(Y1, s[1], s[3]); }
    const W = X1 - X0;
    const longH = hor.filter(h => h.x1 - h.x0 >= .4 * W);
    const ground = longH.length ? Math.min(...longH.map(h => h.y)) : Y0;
    const walls = ver.filter(v => v.y0 < ground + .45 && v.y1 - v.y0 >= 1.5);
    const xa = walls.length ? Math.min(...walls.map(v => v.x)) : X0, xb = walls.length ? Math.max(...walls.map(v => v.x)) : X1;
    const edgeTop = walls.filter(v => Math.abs(v.x - xa) < .06 || Math.abs(v.x - xb) < .06).map(v => v.y1);
    let eave = (edgeTop.length ? Math.max(...edgeTop) : Y1) - ground;
    const sloped = segs.map(s => { const a = Math.atan2(s[3]-s[1], s[2]-s[0]) / D2R; const b = ((a % 180) + 180) % 180; return {s, ang:b > 90 ? 180 - b : b, up:(b > 0 && b < 90), y:Math.max(s[1], s[3]) - ground, len:segLen(s)}; }).filter(o => o.ang > 8 && o.ang < 70 && o.len > .6 && o.y > eave - .3);
    let roof = {kind:"flat", ridge:null, pitch:null, overhang:null};
    if (sloped.some(o => o.up) && sloped.some(o => !o.up)){
      const top = Math.max(...sloped.map(o => o.y)), minX = Math.min(...sloped.map(o => Math.min(o.s[0], o.s[2])));
      roof = {kind:"gable-end", ridge:top, pitch:+median(sloped.map(o => o.ang)).toFixed(1), overhang:Math.max(0, Math.min(1.5, xa - minX))};
    } else {
      const band = hor.filter(h => h.y - ground > eave + .4 && h.x1 - h.x0 >= .5 * (xb - xa));
      if (band.length) roof = {kind:"gable-side", ridge:Math.max(...band.map(h => h.y)) - ground, pitch:null, overhang:Math.max(0, Math.min(1.5, xa - Math.min(...band.map(h => h.x0))))};
      else { const top = Math.max(...ver.filter(v => v.x >= xa - .05 && v.x <= xb + .05).map(v => v.y1)) - ground; if (top > eave) eave = top; }
    }
    // aperture: rettangoli chiusi (polilinee o 4 linee) dentro la facciata
    const tol = .03, rects = [];
    const hasH = (y, a, b) => hor.some(h => Math.abs(h.y - y) < tol && h.x0 <= a + tol && h.x1 >= b - tol);
    const vs = ver.filter(v => v.y1 - v.y0 >= .3 && v.y1 - ground <= eave + .1).sort((p, q) => p.x - q.x);
    for (let i = 0; i < vs.length; i++) for (let j = i+1; j < vs.length; j++){
      const A = vs[i], B = vs[j], w = B.x - A.x; if (w < .3) continue; if (w > 4) break;
      if (Math.abs(A.y0 - B.y0) > tol || Math.abs(A.y1 - B.y1) > tol) continue;
      const y0 = (A.y0 + B.y0)/2, y1 = (A.y1 + B.y1)/2;
      if (hasH(y0, A.x, B.x) && hasH(y1, A.x, B.x)) rects.push({x0:A.x, x1:B.x, y0, y1});
    }
    let ops = rects.filter(r => r.x0 >= xa - .05 && r.x1 <= xb + .05 && r.y0 >= ground - .05 && r.x1 - r.x0 < .9 * (xb - xa) && r.y1 - r.y0 < eave);
    ops = ops.filter(r => !ops.some(q => q !== r && q.x0 <= r.x0 + .01 && q.x1 >= r.x1 - .01 && q.y0 <= r.y0 + .01 && q.y1 >= r.y1 - .01 && (q.x1-q.x0)*(q.y1-q.y0) > (r.x1-r.x0)*(r.y1-r.y0) + 1e-6)); // telai interni
    ops = ops.filter((r, i) => !ops.some((q, k) => k < i && Math.abs(q.x0-r.x0) < .01 && Math.abs(q.x1-r.x1) < .01 && Math.abs(q.y0-r.y0) < .01 && Math.abs(q.y1-r.y1) < .01));
    // persiane: rettangoli stretti affiancati a un'apertura della stessa altezza
    ops = ops.filter(r => !ops.some(q => q !== r && Math.abs(q.y0 - r.y0) < .05 && Math.abs(q.y1 - r.y1) < .05 && (Math.abs(q.x0 - r.x1) < .06 || Math.abs(q.x1 - r.x0) < .06) && (r.x1 - r.x0) <= .6 * (q.x1 - q.x0)));
    return {width:+(xb - xa).toFixed(3), eave:+eave.toFixed(3), roof, openings:ops.map(r => ({u0:+(r.x0 - xa).toFixed(3), u1:+(r.x1 - xa).toFixed(3), sill:+Math.max(0, r.y0 - ground).toFixed(3), h:+(r.y1 - r.y0).toFixed(3)})).sort((a,b) => a.u0 - b.u0)};
  }

  /** Prospetto disegnato in un'unità diversa dalla pianta (cm, mm): fattore 10^n che porta la sua larghezza vicina a quella attesa. */
  function unitFactor(segs, expectedWidth){
    let x0 = Infinity, x1 = -Infinity; for (const s of segs){ x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]); }
    const r = expectedWidth / Math.max(x1 - x0, 1e-9), p = Math.pow(10, Math.round(Math.log10(r)));
    return p !== 1 && r / p > .6 && r / p < 1.6 ? p : 1;
  }
  const scaleSegs = (segs, k) => k === 1 ? segs : segs.map(s => [s[0]*k, s[1]*k, s[2]*k, s[3]*k, s[4]]);
  /** Larghezza della pianta vista da un lato (per controllare le unità dei prospetti). */
  function sideWidth(plan, side){ let a = Infinity, b = -Infinity; const ax = VIEW[side].axis; for (const w of plan.walls) for (const p of [w.a, w.b]){ a = Math.min(a, p[ax] - w.thick/2); b = Math.max(b, p[ax] + w.thick/2); } return b - a; }
  function prepareElevation(segs, plan, side){ const k = plan && VIEW[side] ? unitFactor(segs, sideWidth(plan, side)) : 1; const d = analyzeElevation(scaleSegs(segs, k)); if (d) d.unitFactor = k; return d; }

  /* ---------- unione: la pianta riceve altezze e aperture dai prospetti ---------- */
  // per ogni lato: asse del prospetto (da sinistra a destra) e verso dell'esterno
  const VIEW = {sud:{axis:0, rev:false, out:[0, 1]}, nord:{axis:0, rev:true, out:[0, -1]}, est:{axis:1, rev:true, out:[1, 0]}, ovest:{axis:1, rev:false, out:[-1, 0]}};
  function combine(plan, elevs = [], opt = {}){
    const notes = [], walls = plan.walls.map(w => ({...w})), openings = plan.openings.map(o => ({...o}));
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const w of walls) for (const p of [w.a, w.b]){ bx0 = Math.min(bx0, p[0] - w.thick/2); bx1 = Math.max(bx1, p[0] + w.thick/2); by0 = Math.min(by0, p[1] - w.thick/2); by1 = Math.max(by1, p[1] + w.thick/2); }
    const eaves = [], roofs = [];
    for (const e of elevs){
      const V = VIEW[e.side], d = e.data; if (!V || !d) continue;
      const planW = V.axis === 0 ? bx1 - bx0 : by1 - by0;
      // stessa unità: k = 1; unità diverse (cm/mm): potenza di 10; altrimenti si adatta solo la larghezza
      let kx = 1, kz = 1; const ratio = planW / d.width;
      if (ratio < .9 || ratio > 1.1){ const p10 = Math.pow(10, Math.round(Math.log10(ratio))); if (ratio / p10 > .9 && ratio / p10 < 1.1 && p10 !== 1){ kx = kz = p10; } else { kx = ratio; notes.push(`Prospetto ${e.side}: largo ${(d.width).toFixed(2)} m contro ${planW.toFixed(2)} m della pianta; adattato alla pianta.`); } }
      eaves.push(d.eave * kz); roofs.push({side:e.side, ...d.roof, ridge:d.roof.ridge != null ? d.roof.ridge * kz : null, overhang:d.roof.overhang != null ? d.roof.overhang * kx : null});
      let matched = 0, added = 0;
      for (const op of d.openings){
        const u0 = op.u0 * kx, u1 = op.u1 * kx, uc = (u0 + u1)/2, w = u1 - u0;
        const along = V.rev ? (V.axis === 0 ? bx1 - uc : by1 - uc) : (V.axis === 0 ? bx0 + uc : by0 + uc);
        // muro parallelo che copre quel punto, il più esterno nella direzione di vista
        let best = null, bestOut = -Infinity;
        for (const wl of walls){
          const dx = wl.b[0]-wl.a[0], dy = wl.b[1]-wl.a[1], L = Math.hypot(dx, dy); if (L < .3) continue;
          const par = V.axis === 0 ? Math.abs(dx)/L : Math.abs(dy)/L; if (par < .97) continue;
          const lo = V.axis === 0 ? Math.min(wl.a[0], wl.b[0]) : Math.min(wl.a[1], wl.b[1]), hi = V.axis === 0 ? Math.max(wl.a[0], wl.b[0]) : Math.max(wl.a[1], wl.b[1]);
          if (along < lo - .05 || along > hi + .05) continue;
          const outPos = ((wl.a[0]+wl.b[0])/2) * V.out[0] + ((wl.a[1]+wl.b[1])/2) * V.out[1];
          if (outPos > bestOut){ bestOut = outPos; best = wl; }
        }
        if (!best) continue;
        const dx = best.b[0]-best.a[0], dy = best.b[1]-best.a[1], L = Math.hypot(dx, dy);
        const pt = V.axis === 0 ? [along, best.a[1] + (along - best.a[0]) * dy / (dx || 1e-9)] : [best.a[0] + (along - best.a[1]) * dx / (dy || 1e-9), along];
        const t = ((pt[0]-best.a[0])*dx + (pt[1]-best.a[1])*dy) / L;
        const sill = op.sill * kz, h = op.h * kz, type = sill < .15 ? "door" : "window";
        const ex = openings.filter(o => o.wall === best.id && !o.fromElev).sort((a,b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
        const low = type === "door" ? {sill:0, ...(sill > .02 ? {alz:+sill.toFixed(3)} : {}), h:+(h).toFixed(3)} : {sill:+sill.toFixed(3), h:+h.toFixed(3)};
        if (ex && Math.abs(ex.t - t) <= Math.max(ex.w, w)/2 + .2){
          const pf = type === "door" && (ex.style === "portafinestra" || ex.from === "vetro" || ex.from === "portafinestra");
          Object.assign(ex, low, {type, fromElev:true}, pf ? {style:"portafinestra"} : {}); if (type === "window" && ex.style === "portafinestra") delete ex.style;
          if (ex.from === "vuoto") ex.w = +w.toFixed(3); matched++; }
        else if (t - w/2 > .05 && t + w/2 < L - .05){ openings.push({wall:best.id, t:+t.toFixed(3), w:+w.toFixed(3), ...low, type, from:"prospetto", fromElev:true}); added++; }
      }
      notes.push(`Prospetto ${e.side}: ${d.openings.length} aperture lette, ${matched} abbinate alla pianta${added ? `, ${added} aggiunte` : ""}.`);
    }
    const height = eaves.length ? +median(eaves).toFixed(2) : (opt.height || 2.7);
    // copertura
    let roof = {type:"flat", pitch:20, overhang:.3, mat:"tegole"};
    const gEnd = roofs.find(r => r.kind === "gable-end"), gSide = roofs.find(r => r.kind === "gable-side");
    if (gEnd || gSide){
      // timpano visto da sud/nord → colmo lungo y; falda vista da sud/nord → colmo lungo x
      const ridgeAxis = gEnd ? (VIEW[gEnd.side].axis === 0 ? "y" : "x") : (VIEW[gSide.side].axis === 0 ? "x" : "y");
      const depth = ridgeAxis === "x" ? by1 - by0 : bx1 - bx0;
      const ridgeH = (gEnd || gSide).ridge;
      const pitch = gEnd?.pitch || (ridgeH ? Math.atan((ridgeH - height) / (depth/2)) / D2R : 25);
      roof = {type:"gable", pitch:+Math.max(5, Math.min(60, pitch)).toFixed(1), overhang:+((gEnd || gSide).overhang ?? .4).toFixed(2), mat:"tegole", ridge:ridgeAxis};
    } else if (!elevs.length) roof = {type:"flat", pitch:20, overhang:0, mat:"cemento"};
    for (const o of openings){
      if (o.h == null){ if (o.type === "door"){ o.sill = 0; o.h = o.style === "portafinestra" ? Math.min(2.4, height - .3) : Math.min(2.1, height - .2); } else { o.sill = o.sill ?? 1; o.h = Math.min(1.4, height - o.sill - .3); } }
      if (o.sill == null) o.sill = o.type === "door" ? 0 : 1;
      o.h = Math.min(o.h, height - (o.type === "door" ? o.alz || 0 : o.sill) - .05);
      delete o.fromElev; delete o.from;
    }
    if (height > 4.6) notes.push(`Altezza di gronda ${height.toFixed(2)} m: probabilmente più piani. Per ora il volume è unico; i solai intermedi vanno aggiunti a mano.`);
    return {walls, openings, rooms:plan.rooms, stairs:plan.stairs || [], height, roof, notes, bbox:[bx0, by0, bx1, by1]};
  }
  return {findStairs, parseOpeningLabel, clusterDrawings, analyzePlan, analyzePlanAxis, cleanSegs, dominantAngle, analyzeElevation, prepareElevation, unitFactor, combine, sideFromText, cleanText, findRooms};
})();
