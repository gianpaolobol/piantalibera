/* ============================================================
   Tipi di muro e spessori (decisioni del titolare, 8/11/2026)
   - Tramezzi 8, 10, 12 cm; portante interno 30 cm; esterno 40 + cappotto 15 cm (55 cm).
   - Pulsanti rapidi + «Altro» in centimetri; vale per uno o più muri selezionati e diventa
     il predefinito dei muri successivi.
   - Quando un muro cambia spessore la faccia verso i locali resta ferma (le stanze mantengono
     le misure) e il muro cresce verso l'esterno; i muri senza un lato «interno» crescono dall'asse.
   ============================================================ */
const WALL_TYPES = [
  {id:"t8", nome:"Tramezzo 8", t:.08, kind:"tramezzo"},
  {id:"t10", nome:"Tramezzo 10", t:.10, kind:"tramezzo"},
  {id:"t12", nome:"Tramezzo 12", t:.12, kind:"tramezzo"},
  {id:"p30", nome:"Portante interno 30", t:.30, kind:"portante"},
  {id:"e55", nome:"Esterno 40 + cappotto 15", t:.55, kind:"esterno", layers:{core:.40, insul:.15}},
];
const WALL_TYPE = Object.fromEntries(WALL_TYPES.map(w => [w.id, w]));
const cmOf = t => Math.round(t * 1000) / 10;
function wallTypeHTML(cur, curType, scope){
  const label = scope === "new" ? "Spessore dei nuovi muri" : "Spessore";
  const match = curType && WALL_TYPE[curType] && Math.abs(WALL_TYPE[curType].t - cur) < 1e-4 ? curType : (WALL_TYPES.find(w => Math.abs(w.t - cur) < 1e-4)?.id || "");
  return `<div class="f wtypes" data-scope="${scope}"><span class="lbl">${label}</span>
    <div class="wt-chips">${WALL_TYPES.map(w => `<button type="button" class="wt" data-wt="${w.id}" aria-pressed="${w.id === match}" title="${esc(w.nome)}"><b>${w.kind === "esterno" ? "40+15" : cmOf(w.t)}</b><small>${w.kind === "tramezzo" ? "tramezzo" : w.kind === "portante" ? "portante" : "esterno"}</small></button>`).join("")}</div>
    <div class="wt-other"><label class="lbl" for="wtCm-${scope}">Altro (cm)</label><input id="wtCm-${scope}" class="inp" inputmode="decimal" value="${cmOf(cur)}"></div></div>`;
}
/* lato «interno» di un muro: quello rivolto verso un locale. +1 = verso la normale, −1 = opposto, 0 = nessuno/entrambi */
function wallInnerSide(w){
  const f = wallFrame(w), m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], d = (w.thick || .3) / 2 + .06;
  const rooms = P.rooms.filter(r => r.level === w.level && r.pts?.length > 2);
  const pA = [m[0] + f.nx * d, m[1] + f.ny * d], pB = [m[0] - f.nx * d, m[1] - f.ny * d];
  if (rooms.length){ const a = rooms.some(r => inPoly(pA, r.pts)), b = rooms.some(r => inPoly(pB, r.pts)); return a && !b ? 1 : b && !a ? -1 : 0; }
  // senza locali disegnati: per i muri esterni vale il lato verso il centro dell'edificio
  const ws = wallsOf(w.level); if (ws.length < 3) return 0;
  const c = ws.reduce((s, x) => [s[0] + (x.a[0] + x.b[0]) / 2 / ws.length, s[1] + (x.a[1] + x.b[1]) / 2 / ws.length], [0, 0]);
  return Math.hypot(pA[0] - c[0], pA[1] - c[1]) < Math.hypot(pB[0] - c[0], pB[1] - c[1]) ? 1 : -1;
}
function setWallsThickness(walls, t, typeId){
  if (!(t > .01 && t < 2)) return;
  const type = WALL_TYPE[typeId], set = new Set(walls), plan = new Map();
  for (const w of walls){
    const f = wallFrame(w), inner = type?.kind === "esterno" || !type ? wallInnerSide(w) : (type.kind === "portante" ? wallInnerSide(w) : 0);
    const keepFace = inner !== 0 && (type ? type.kind !== "tramezzo" : true);
    const k = keepFace ? -inner * (t - (w.thick || .3)) / 2 : 0;            // spostamento dell'asse verso l'esterno
    plan.set(w, {d:[f.nx * k, f.ny * k], a0:w.a.slice(), b0:w.b.slice(), f});
  }
  const lineOf = w => { const p = plan.get(w); return p ? [[p.a0[0] + p.d[0], p.a0[1] + p.d[1]], [p.b0[0] + p.d[0], p.b0[1] + p.d[1]]] : [w.a.slice(), w.b.slice()]; };
  const meet = (l1, l2) => { const d1 = [l1[1][0] - l1[0][0], l1[1][1] - l1[0][1]], d2 = [l2[1][0] - l2[0][0], l2[1][1] - l2[0][1]], den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return null; const s = ((l2[0][0] - l1[0][0]) * d2[1] - (l2[0][1] - l1[0][1]) * d2[0]) / den; return [+(l1[0][0] + d1[0] * s).toFixed(4), +(l1[0][1] + d1[1] * s).toFixed(4)]; };
  const all = wallsOf(walls[0]?.level ?? S.level), moves = [];
  for (const [w, p] of plan){
    const L = lineOf(w);
    for (const [k, i] of [["a", 0], ["b", 1]]){
      const orig = k === "a" ? p.a0 : p.b0, others = [];
      for (const o of all){ if (o === w) continue; const po = plan.get(o); for (const k2 of ["a", "b"]){ const q = po ? (k2 === "a" ? po.a0 : po.b0) : o[k2]; if (Math.hypot(q[0] - orig[0], q[1] - orig[1]) < 1e-4) others.push([o, k2]); } }
      let X = null; for (const [o] of others){ X = meet(L, lineOf(o)); if (X) break; }
      const target = X || L[i];
      moves.push([w, k, target]); for (const [o, k2] of others) if (X && !set.has(o)) moves.push([o, k2, X]);
    }
  }
  for (const [w, p] of plan){ // le aperture restano allo stesso punto del muro
    const na = moves.find(m => m[0] === w && m[1] === "a")?.[2] || w.a, shift = (na[0] - (p.a0[0] + p.d[0])) * p.f.ux + (na[1] - (p.a0[1] + p.d[1])) * p.f.uy;
    for (const o of P.openings) if (o.wall === w.id) o.t = +(o.t - shift).toFixed(4);
  }
  for (const [w, k, X] of moves) w[k] = X.slice();
  for (const w of walls){ w.thick = t; if (type){ w.wtype = type.id; if (type.layers) w.layers = {...type.layers}; else delete w.layers; } else { delete w.wtype; delete w.layers; } }
  // il valore scelto vale anche per i muri che si disegnano dopo
  S.defaults.wallThick = t; S.defaults.wallType = type?.id || null; PREFS.wallThick = t; PREFS.wallType = S.defaults.wallType; savePrefs();
  commit();
}
/* proprietà di tipo per un muro nuovo (dai predefiniti) */
function wallTypeProps(d){ const ty = d.wallType && WALL_TYPE[d.wallType]; return ty && Math.abs(ty.t - d.wallThick) < 1e-4 ? {wtype:ty.id, ...(ty.layers ? {layers:{...ty.layers}} : {})} : {}; }
function selectedWalls(){ return selList().filter(s => s.type === "wall").map(s => itemOf(s)).filter(Boolean); }
$("#panel-props").addEventListener("click", e => {
  const b = e.target.closest("[data-wt]"); if (!b) return; const scope = b.closest(".wtypes")?.dataset.scope, type = WALL_TYPE[b.dataset.wt];
  if (scope === "new"){ S.defaults.wallThick = type.t; S.defaults.wallType = type.id; PREFS.wallThick = type.t; PREFS.wallType = type.id; savePrefs(); renderInspector(); toast(`Nuovi muri: ${type.nome}`); return; }
  const ws = selectedWalls(); if (!ws.length) return; setWallsThickness(ws, type.t, type.id); renderInspector();
  toast(ws.length > 1 ? `${ws.length} muri: ${type.nome}` : type.nome);
});
$("#panel-props").addEventListener("change", e => {
  const m = e.target.id?.match(/^wtCm-(\w+)$/); if (!m) return; const v = num(e.target.value); if (!(v > 1 && v < 200)){ toast("Spessore in centimetri, tra 1 e 200", true); return; }
  const t = v / 100, type = WALL_TYPES.find(w => Math.abs(w.t - t) < 1e-4);
  // il pannello si ridisegna dopo la perdita del fuoco del campo, non durante
  if (m[1] === "new"){ S.defaults.wallThick = t; S.defaults.wallType = type?.id || null; PREFS.wallThick = t; PREFS.wallType = S.defaults.wallType; savePrefs(); setTimeout(renderInspector, 0); return; }
  const ws = selectedWalls(); if (ws.length){ setWallsThickness(ws, t, type?.id); setTimeout(renderInspector, 0); }
});
// all'avvio: l'ultimo spessore scelto torna il predefinito dei nuovi muri
if (PREFS.wallThick > 0){ S.defaults.wallThick = PREFS.wallThick; S.defaults.wallType = PREFS.wallType || null; }
