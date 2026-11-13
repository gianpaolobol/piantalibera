/* ============================================================
   Cornici di porte e finestre, cornici del soffitto, balconi con parapetto
   o.cornice = {ext, int}  (larghezze in m; esterna in pietra, interna/mostrina chiara)
   r.cornice = {h}          (cornice a gola sotto il soffitto)
   r.balcone = {tipo:"ringhiera"·"muratura"·"vetro", h}  (niente soffitto, parapetto sui lati liberi)
   ============================================================ */
const CORN_D = .03;   // sporgenza delle cornici dal muro

/** Fasce della cornice attorno al vano: stipiti, architrave e, senza davanzale, la fascia bassa. side = +1 esterno, −1 interno. */
function openingCornice(w, c, piece, e0, bot, topO, t){
  const o = c.o, cr = o.cornice; if (!cr) return;
  const ext = extSide(w, o), y0 = e0 + bot, y1 = e0 + topO;
  for (const [side, cw, mat] of [[ext, cr.ext, cr.extMat || "pietra"], [-ext, cr.int, cr.intMat || (o.type === "door" ? "bianco" : "bianco")]]){
    if (!(cw > 0)) continue; const off = side * (t / 2 + CORN_D / 2);
    piece(c.s0 - cw, c.s0, y0 - (bot > .05 ? 0 : 0), y1 + cw, CORN_D, mat, "frame", off);
    piece(c.s1, c.s1 + cw, y0, y1 + cw, CORN_D, mat, "frame", off);
    piece(c.s0, c.s1, y1, y1 + cw, CORN_D, mat, "frame", off);
    if (o.type === "window" && side === ext && bot <= .05) piece(c.s0 - cw, c.s1 + cw, y0 - cw, y0, CORN_D, mat, "frame", off);
    if (o.type === "window" && side !== ext) piece(c.s0 - cw, c.s1 + cw, y0 - cw, y0, CORN_D, mat, "frame", off);
  }
}
/** Lati di un locale con il verso interno; «free» = lato che non poggia su un muro (per il parapetto dei balconi). */
function roomEdges(r){
  const out = [], ws = wallsOf(r.level);
  for (let i = 0; i < r.pts.length; i++){
    const p = r.pts[i], q = r.pts[(i + 1) % r.pts.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); if (len < .05) continue;
    const ux = dx / len, uy = dy / len; let nx = -uy, ny = ux; const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (!inPoly([mid[0] + nx * .05, mid[1] + ny * .05], r.pts)){ nx = -nx; ny = -ny; }
    const onWall = k => { const x = [p[0] + dx * k, p[1] + dy * k]; return ws.some(w => projOnSeg([x[0] - nx * (w.thick / 2 + .01), x[1] - ny * (w.thick / 2 + .01)], w.a, w.b).d < w.thick / 2 + .06); };
    out.push({p, q, len, ux, uy, nx, ny, free:![.1, .5, .9].some(onWall)});
  }
  return out;
}
/** Profilo estruso lungo un lato: punti (n verso l'interno, y) a partire dal filo del lato. */
function profileAlong(e, y0, prof, ext0 = 0, ext1 = 0){
  const pos = [], P = (s, n, y) => [e.p[0] + e.ux * s + e.nx * n, y, e.p[1] + e.uy * s + e.ny * n];
  const a = -ext0, b = e.len + ext1;
  for (let i = 0; i < prof.length - 1; i++){ const [n0, h0] = prof[i], [n1, h1] = prof[i + 1];
    const A = P(a, n0, y0 + h0), B = P(b, n0, y0 + h0), C = P(b, n1, y0 + h1), D = P(a, n1, y0 + h1); pos.push(...A, ...B, ...C, ...A, ...C, ...D, ...A, ...C, ...B, ...A, ...D, ...C); }   // due versi: visibile da ogni lato
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
/** Cornice a gola sotto il soffitto, sui lati del locale che poggiano sui muri. */
function ceilingCorniceGeos(r, L){
  const h = r.cornice?.h || .08, top = L.elev + (r.ceilH || L.height) - .006;
  const prof = [[0, 0], [h * .15, 0], [h * .35, -h * .1], [h * .6, -h * .35], [h * .85, -h * .7], [h, -h * .9], [h, -h], [0, -h]];
  return roomEdges(r).filter(e => !e.free || !r.balcone).map(e => profileAlong(e, top, prof, -0, 0));
}
/** Parapetto del balcone sui lati liberi: ringhiera (corrimano, montanti, bacchette), muratura con copertina, vetro con corrimano. */
function balconyGeos(r, L, add){
  const B = r.balcone, h = B.h || 1, e0 = L.elev, lid = L.id;
  for (const e of roomEdges(r)){ if (!e.free) continue;
    const at = (s, n) => [e.p[0] + e.ux * s + e.nx * n, e.p[1] + e.uy * s + e.ny * n], rot = -Math.atan2(e.uy, e.ux), m = at(e.len / 2, .06);
    if (B.tipo === "muratura"){ add(lid, B.mat || "intonaco", "wall", boxGeo(m[0], e0 + h / 2, m[1], e.len, h, .12, 0, rot, 0)); add(lid, "marmo", "sill", boxGeo(m[0], e0 + h + .02, m[1], e.len + .04, .04, .18, 0, rot, 0)); continue; }
    add(lid, "metallo_nero", "frame", boxGeo(m[0], e0 + h - .025, m[1], e.len, .05, .05, 0, rot, 0));
    const nP = Math.max(2, Math.ceil(e.len / 1.2) + 1);
    for (let i = 0; i < nP; i++){ const q = at(.03 + (e.len - .06) * i / (nP - 1), .06); add(lid, "metallo_nero", "frame", boxGeo(q[0], e0 + (h - .05) / 2, q[1], .04, h - .05, .04, 0, rot, 0)); }
    if (B.tipo === "vetro"){ add(lid, "vetro", "glass", boxGeo(m[0], e0 + (h - .05) / 2 + .02, m[1], e.len - .06, h - .12, .012, 0, rot, 0)); continue; }
    add(lid, "metallo_nero", "frame", boxGeo(m[0], e0 + .1, m[1], e.len, .03, .03, 0, rot, 0));
    const nb = Math.floor(e.len / .11); for (let i = 1; i < nb; i++){ const q = at(i * e.len / nb, .06); add(lid, "metallo_nero", "frame", boxGeo(q[0], e0 + (h - .05 + .1) / 2, q[1], .015, h - .15, .015, 0, rot, 0)); }
  }
}
function buildRoomExtras(r, L, add, opts){
  if (opts.print) return;
  if (r.cornice && !r.noCeiling && !r.balcone) for (const g of ceilingCorniceGeos(r, L)) add(L.id, r.cornice.mat || "bianco", "skirt", g);
  if (r.balcone) balconyGeos(r, L, add);
}
/** Metri di cornici e parapetti per il computo. */
function corniciComputo(add){
  let fe = 0, fi = 0; for (const o of P.openings){ const c = o.cornice; if (!c) continue; const per = o.w + 2 * o.h + (o.type === "window" ? o.w : 0); if (c.ext > 0) fe += per; if (c.int > 0) fi += per; }
  if (fe) add("cornice_est", "Cornici", "Cornici esterne di porte e finestre", "m", fe);
  if (fi) add("cornice_int", "Cornici", "Cornici interne e mostrine", "m", fi);
  let cs = 0, pr = {}; for (const r of P.rooms){ const E = roomEdges(r); if (r.cornice && !r.balcone) cs += E.reduce((s, e) => s + e.len, 0); if (r.balcone){ const k = r.balcone.tipo || "ringhiera"; pr[k] = (pr[k] || 0) + E.filter(e => e.free).reduce((s, e) => s + e.len, 0); } }
  if (cs) add("cornice_soff", "Cornici", "Cornici del soffitto", "m", cs);
  for (const [k, v] of Object.entries(pr)) if (v) add("parapetto_" + k, "Scale e parapetti", `Parapetto del balcone (${({ringhiera:"ringhiera", muratura:"muratura", vetro:"vetro"})[k] || k})`, "m", v);
}

/* ---------- pannello ---------- */
function corniceOpHTML(o){ const c = o.cornice || {};
  return `<div class="row">${F("oCe", "Cornice esterna (cm)", c.ext ? fmt(c.ext * 100, 0) : "", 'inputmode="decimal" placeholder="nessuna"')}${F("oCi", o.type === "door" ? "Mostrina interna (cm)" : "Cornice interna (cm)", c.int ? fmt(c.int * 100, 0) : "", 'inputmode="decimal" placeholder="nessuna"')}</div>
    <div class="btns"><button class="btn" id="oCeAll" title="Stesse cornici su tutte le ${o.type === "door" ? "porte" : "finestre"} del piano">Applica a tutte le ${o.type === "door" ? "porte" : "finestre"} del piano</button></div>`; }
function roomCorniceHTML(r){ const B = r.balcone;
  return `<div class="sec" id="rCornSec"><h3>Cornice e balcone</h3>
    <label class="chk"><input type="checkbox" id="rCorn" ${r.cornice ? "checked" : ""} ${B ? "disabled" : ""}> Cornice del soffitto</label>
    ${r.cornice && !B ? `<div class="row">${F("rCornH", "Altezza cornice (cm)", fmt((r.cornice.h || .08) * 100, 0), 'inputmode="decimal"')}<div></div></div>` : ""}
    <label class="chk"><input type="checkbox" id="rBalc" ${B ? "checked" : ""}> Balcone o terrazzo (senza soffitto, parapetto sui lati liberi)</label>
    ${B ? `<div class="row"><div class="f"><label class="lbl" for="rBalcT">Parapetto</label><select id="rBalcT" class="inp">${[["ringhiera", "Ringhiera a bacchette"], ["vetro", "Vetro con corrimano"], ["muratura", "Muratura con copertina"]].map(([k, n]) => `<option value="${k}" ${B.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>${F("rBalcH", "Altezza (m)", fmt(B.h || 1, 2), 'inputmode="decimal"')}</div>` : ""}</div>`; }
P_.addEventListener("change", e => { const t = e.target, v = num(t.value), sel = findSel(); if (!sel) return;
  if ((t.id === "oCe" || t.id === "oCi") && S.sel?.type === "opening"){ if (t.value.trim() !== "" && (v === null || v < 0 || v > 60)){ toast("Cornice tra 0 e 60 cm", true); renderInspector(); return; }
    const c = {...(sel.cornice || {})}, k = t.id === "oCe" ? "ext" : "int"; if (v > 0) c[k] = v / 100; else delete c[k]; if (Object.keys(c).length) sel.cornice = c; else delete sel.cornice; commit(); renderInspector(); }
  if (S.sel?.type !== "room") return;
  if (t.id === "rCorn"){ if (t.checked) sel.cornice = {h:.08}; else delete sel.cornice; commit(); renderInspector(); }
  if (t.id === "rCornH" && sel.cornice){ if (v >= 2 && v <= 40){ sel.cornice.h = v / 100; commit(); } else { toast("Cornice tra 2 e 40 cm", true); renderInspector(); } }
  if (t.id === "rBalc"){ if (t.checked){ sel.balcone = {tipo:"ringhiera", h:1}; sel.noCeiling = true; } else { delete sel.balcone; delete sel.noCeiling; } commit(); renderInspector(); }
  if (t.id === "rBalcT" && sel.balcone){ sel.balcone.tipo = t.value; commit(); }
  if (t.id === "rBalcH" && sel.balcone){ if (v >= .8 && v <= 1.5){ sel.balcone.h = v; commit(); } else { toast("Parapetto tra 0,80 e 1,50 m (di norma almeno 1,00 m)", true); renderInspector(); } }
});
P_.addEventListener("click", e => { const b = e.target.closest("button"); if (b?.id !== "oCeAll") return; const o = findSel(); if (!o || S.sel?.type !== "opening") return;
  let n = 0; for (const x of P.openings) if (x !== o && x.type === o.type && wallById(x.wall)?.level === wallById(o.wall)?.level){ if (o.cornice) x.cornice = {...o.cornice}; else delete x.cornice; n++; }
  commit(); toast(`Cornici applicate a ${n} ${o.type === "door" ? "porte" : "finestre"}`); });
