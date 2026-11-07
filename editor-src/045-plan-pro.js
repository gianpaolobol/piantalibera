/* ============================================================
   Pianta di precisione: selezione multipla, appunti, trasformazioni,
   quote, snap configurabili, menu contestuale, barra di stato, aiuto
   ============================================================ */
const PREFS_KEY = "pianta-libera-prefs-v1";
const PREFS = Object.assign({grid:.05, snapGrid:true, snapEnds:true, snapMid:true, snapWall:true, guides:true, ortho:false, autoDims:false, wallRef:"asse", rectRef:"asse"},
  (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch(e){ return {}; } })());
function savePrefs(){ try { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); } catch(e){} }

/* ---------- selezione ---------- */
const COLL = {wall:"walls", opening:"openings", room:"rooms", object:"objects", dim:"dims"};
function selList(){ return S.multi?.length ? S.multi : S.sel ? [S.sel] : []; }
function isSelected(id){ return selList().some(s => s.id === id); }
function setSel(list){ const u = []; for (const s of list) if (s && !u.some(x => x.id === s.id)) u.push(s); S.multi = u.length > 1 ? u : []; S.sel = u[0] || null; }
function toggleSel(h){ const l = selList(); setSel(l.some(s => s.id === h.id) ? l.filter(s => s.id !== h.id) : [...l, h]); }
const itemOf = s => P[COLL[s.type]]?.find(x => x.id === s.id) || null;
function selItems(){ return selList().map(s => ({s, it:itemOf(s)})).filter(x => x.it); }
function selectAll(){ const lid = S.level; setSel([...P.walls.filter(w => w.level === lid).map(w => ({type:"wall", id:w.id})), ...P.rooms.filter(r => r.level === lid).map(r => ({type:"room", id:r.id})), ...P.objects.filter(o => o.level === lid).map(o => ({type:"object", id:o.id})), ...(P.dims || []).filter(d => d.level === lid).map(d => ({type:"dim", id:d.id}))]); renderInspector(); draw2D(); }

/* punti di riferimento di un elemento (per riquadro, centro, trasformazioni) */
function itemPoints(s, it){
  if (s.type === "wall") return [it.a, it.b];
  if (s.type === "room") return it.pts;
  if (s.type === "object") return [[it.x, it.y]];
  if (s.type === "dim") return [it.a, it.b];
  if (s.type === "opening"){ const w = wallById(it.wall); return w ? [ptOnWall(w, it.t)] : []; }
  return [];
}
function selCenter(){ let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const {s, it} of selItems()) for (const p of itemPoints(s, it)){ x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return isFinite(x0) ? [(x0+x1)/2, (y0+y1)/2] : null; }

/* sposta un gruppo: le estremità dei muri non selezionati collegate seguono */
function groupSnapshot(){
  const items = selItems(), wallIds = new Set(items.filter(x => x.s.type === "wall").map(x => x.it.id));
  const ends = [];
  for (const {s, it} of items) if (s.type === "wall") for (const k of ["a", "b"]) for (const [w, kk] of linkedEnds(it[k], it)) if (!wallIds.has(w.id)) ends.push({w, k:kk, o:w[kk].slice()});
  return {items:items.map(({s, it}) => ({s, it, a:it.a?.slice(), b:it.b?.slice(), pts:it.pts?.map(p => p.slice()), x:it.x, y:it.y})), ends};
}
function applyGroupMove(snap, dx, dy){
  for (const g of snap.items){ const it = g.it;
    if (g.s.type === "wall" || g.s.type === "dim"){ it.a = [g.a[0]+dx, g.a[1]+dy]; it.b = [g.b[0]+dx, g.b[1]+dy]; }
    else if (g.s.type === "room") it.pts = g.pts.map(p => [p[0]+dx, p[1]+dy]);
    else if (g.s.type === "object"){ it.x = g.x + dx; it.y = g.y + dy; }
  }
  for (const e of snap.ends) e.w[e.k] = [e.o[0]+dx, e.o[1]+dy];
}
/* ruota (gradi, senso orario a schermo) o specchia (asse verticale) la selezione attorno al suo centro */
function transformSel(kind, deg = 90){
  const c = selCenter(); if (!c) return;
  const rad = deg * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  const T = p => kind === "mirror" ? [2*c[0] - p[0], p[1]] : [c[0] + (p[0]-c[0])*cs - (p[1]-c[1])*sn, c[1] + (p[0]-c[0])*sn + (p[1]-c[1])*cs];
  const snap = groupSnapshot();
  for (const {s, it} of selItems()){
    if (s.type === "wall" || s.type === "dim"){ it.a = T(it.a); it.b = T(it.b); }
    else if (s.type === "room") it.pts = it.pts.map(T);
    else if (s.type === "object"){ [it.x, it.y] = T([it.x, it.y]); it.rot = kind === "mirror" ? ((360 - (it.rot || 0)) % 360) : (((it.rot || 0) + deg) % 360 + 360) % 360; }
  }
  for (const e of snap.ends) e.w[e.k] = T(e.o);
  if (kind === "mirror") for (const o of P.openings) if (isSelected(o.wall)) o.flip = (o.flip || 0) ^ 2;
  commit();
}

/* ---------- appunti ---------- */
let CLIP = null;
function copySel(){
  const items = selItems(); if (!items.length) return false;
  const wallIds = new Set(items.filter(x => x.s.type === "wall").map(x => x.it.id));
  CLIP = {items:items.filter(x => x.s.type !== "opening").map(x => ({type:x.s.type, data:JSON.parse(JSON.stringify(x.it))})), openings:P.openings.filter(o => wallIds.has(o.wall)).map(o => ({...o})), center:selCenter()};
  toast(`${CLIP.items.length} element${CLIP.items.length > 1 ? "i copiati" : "o copiato"}`); return true;
}
function pasteClip(at){
  if (!CLIP?.items.length) return;
  const c = CLIP.center, dx = at ? at[0] - c[0] : .5, dy = at ? at[1] - c[1] : .5, ids = {}, out = [];
  for (const {type, data} of CLIP.items){
    const it = JSON.parse(JSON.stringify(data)), id = uid(); ids[it.id] = id; it.id = id; it.level = S.level;
    if (type === "wall" || type === "dim"){ it.a = [it.a[0]+dx, it.a[1]+dy]; it.b = [it.b[0]+dx, it.b[1]+dy]; }
    else if (type === "room") it.pts = it.pts.map(p => [p[0]+dx, p[1]+dy]);
    else if (type === "object"){ it.x += dx; it.y += dy; }
    (P[COLL[type]] = P[COLL[type]] || []).push(it); out.push({type, id});
  }
  for (const o of CLIP.openings) if (ids[o.wall]) P.openings.push({...o, id:uid(), wall:ids[o.wall]});
  CLIP.center = [c[0] + dx, c[1] + dy]; // incolla di nuovo = un'altra copia spostata
  setSel(out); commit();
}
function duplicateSel(){ if (copySel()) pasteClip(null); }

/* ---------- quote ---------- */
function drawDims(g){
  for (const d of (P.dims || []).filter(d => d.level === S.level)) dimLine(g, d.a, d.b, d.off, fmtL(Math.hypot(d.b[0]-d.a[0], d.b[1]-d.a[1])), isSelected(d.id) ? C.sel : C.text);
  if (PREFS.autoDims) for (const w of wallsOf(S.level)){ const f = wallFrame(w); if (f.len < .3) continue; dimLine(g, w.a, w.b, -(w.thick/2 + .35), fmtL(f.len).replace(/ (m|cm|mm)$/, ""), C.muted, true); }
}
function dimHit(p){ const tol = 6 / V.s; for (const d of (P.dims || []).filter(d => d.level === S.level)){ const dx = d.b[0]-d.a[0], dy = d.b[1]-d.a[1], L = Math.hypot(dx, dy) || 1, nx = -dy/L, ny = dx/L; const r = projOnSeg(p, [d.a[0]+nx*d.off, d.a[1]+ny*d.off], [d.b[0]+nx*d.off, d.b[1]+ny*d.off]); if (r.d < tol) return {type:"dim", id:d.id}; } return null; }
/* distanze libere dall'oggetto ai muri nelle quattro direzioni, mentre lo si trascina */
function wallDistances(o){
  const fp = objFootprint(o), a = THREE.MathUtils.degToRad(o.rot || 0), corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx, sy]) => { const lx = fp.cx + sx*fp.w/2, lz = fp.cz + sy*fp.d/2; return [o.x + lx*Math.cos(a) - lz*Math.sin(a), o.y + lx*Math.sin(a) + lz*Math.cos(a)]; });
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0+x1)/2, cy = (y0+y1)/2;
  const faces = []; for (const w of wallsOf(S.level)){ const f = wallFrame(w); for (const s of [-1, 1]) faces.push([[w.a[0] + f.nx*s*w.thick/2, w.a[1] + f.ny*s*w.thick/2], [w.b[0] + f.nx*s*w.thick/2, w.b[1] + f.ny*s*w.thick/2]]); }
  const cast = (p, d) => { let best = Infinity; for (const [A, B] of faces){ const ex = B[0]-A[0], ey = B[1]-A[1], den = d[0]*ey - d[1]*ex; if (Math.abs(den) < 1e-9) continue; const t = ((A[0]-p[0])*ey - (A[1]-p[1])*ex) / den, u = ((A[0]-p[0])*d[1] - (A[1]-p[1])*d[0]) / den; if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t; } return best < 15 ? best : null; };
  return [[[x1, cy], [1, 0]], [[x0, cy], [-1, 0]], [[cx, y1], [0, 1]], [[cx, y0], [0, -1]]].map(([p, d]) => { const t = cast(p, d); return t == null ? null : {a:p, b:[p[0] + d[0]*t, p[1] + d[1]*t], t}; }).filter(Boolean);
}

/* ---------- stanza automatica: doppio clic dentro muri chiusi ---------- */
function autoRoomAt(p){
  const rooms = A3.findRooms(wallsOf(S.level).map(w => ({a:w.a, b:w.b, thick:w.thick})), []);
  const r = rooms.find(r => inPoly(p, r.pts)); if (!r){ toast("Qui i muri non chiudono un locale", true); return false; }
  if (P.rooms.some(x => x.level === S.level && inPoly(polyCentroid(r.pts), x.pts))){ toast("Questo locale esiste già"); return false; }
  const room = {id:uid(), level:S.level, name:"Locale " + (P.rooms.filter(x => x.level === S.level).length + 1), mat:S.defaults.roomMat, pts:r.pts};
  P.rooms.push(room); setSel([{type:"room", id:room.id}]); commit(); toast(`Locale creato: ${fmt(Math.abs(polyArea(r.pts)), 1)} m²`); return true;
}

/* ---------- menu contestuale ---------- */
function openCtxMenu(sp, raw){
  closeCtxMenu();
  const h = hitTest(raw);
  if (h && !isSelected(h.id)){ setSel([h]); renderInspector(); draw2D(); }
  const n = selList().length, s1 = n === 1 ? selList()[0] : null, it = s1 ? itemOf(s1) : null;
  const items = [];
  if (n){
    items.push(["Proprietà", "Doppio clic", () => focusInspector()], null, ["Copia", "Ctrl+C", copySel], ["Duplica", "Ctrl+D", duplicateSel]);
    if (CLIP) items.push(["Incolla qui", "Ctrl+V", () => pasteClip(raw)]);
    items.push(null, ["Ruota di 90°", "]", () => transformSel("rot", 90)], ["Ruota di −90°", "[", () => transformSel("rot", -90)], ["Specchia", "", () => transformSel("mirror")]);
    if (s1?.type === "wall") items.push(null, ["Dividi il muro qui", "", () => splitWallAt(it, raw)]);
    if (s1?.type === "opening") items.push(null, ["Inverti apertura", "", () => { it.flip = ((it.flip || 0) + 1) % 4; commit(); }]);
    items.push(null, ["Elimina", "Canc", deleteSel]);
  } else {
    if (CLIP) items.push(["Incolla qui", "Ctrl+V", () => pasteClip(raw)]);
    items.push(["Crea il locale qui", "doppio clic", () => autoRoomAt(raw)], ["Seleziona tutto", "Ctrl+A", selectAll], ["Inquadra la pianta", "", fitPlan], null, ["Scorciatoie", "?", openHelp]);
  }
  const m = document.createElement("div"); m.id = "ctxMenu"; m.className = "ctx"; m.setAttribute("role", "menu");
  m.innerHTML = items.map((x, i) => x ? `<button role="menuitem" data-i="${i}"><span>${esc(x[0])}</span><kbd>${esc(x[1])}</kbd></button>` : `<hr>`).join("");
  document.body.appendChild(m);
  const r = c2d.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.min(r.left + sp[0], innerWidth - mw - 6) + "px"; m.style.top = Math.min(r.top + sp[1], innerHeight - mh - 6) + "px";
  m.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; closeCtxMenu(); items[+b.dataset.i][2](); });
  m.querySelector("button")?.focus();
}
function closeCtxMenu(){ document.getElementById("ctxMenu")?.remove(); }
document.addEventListener("pointerdown", e => { if (!e.target.closest("#ctxMenu")) closeCtxMenu(); }, true);
function focusInspector(){ if (S.tab !== "props"){ S.tab = "props"; renderTabs(); } renderInspector(); setTimeout(() => $("#panel-props .inp")?.focus(), 30); }
function splitWallAt(w, p){
  const f = wallFrame(w), r = projOnSeg(p, w.a, w.b), s = r.t * f.len; if (s < .1 || s > f.len - .1){ toast("Troppo vicino all'estremità", true); return; }
  const q = r.q, w2 = {...w, id:uid(), a:q.slice(), b:w.b.slice()}; w.b = q.slice(); P.walls.push(w2);
  for (const o of P.openings) if (o.wall === w.id && o.t > s){ o.wall = w2.id; o.t -= s; }
  setSel([{type:"wall", id:w.id}, {type:"wall", id:w2.id}]); commit(); toast("Muro diviso in due");
}

/* ---------- aiuto ---------- */
const SHORTCUTS = [["Strumenti", [["V", "Seleziona"], ["W", "Muro"], ["R", "Stanza rettangolare"], ["P", "Pavimento a poligono"], ["D", "Porta"], ["F", "Finestra"], ["Q", "Quota"], ["A", "Arredi"], ["B", "Pennello dei materiali (Alt+clic preleva)"], ["C / M", "Calibra / sposta la base"]]],
  ["Selezione", [["Clic", "seleziona"], ["Maiusc + clic", "aggiunge o toglie"], ["Trascina nel vuoto", "selezione a riquadro"], ["Ctrl+A", "seleziona tutto"], ["Doppio clic", "proprietà · nel vuoto: crea il locale"], ["Tasto destro", "menu"], ["Esc", "annulla il comando"]]],
  ["Modifica", [["Ctrl+C / V / D", "copia, incolla, duplica"], ["Canc", "elimina"], ["[ e ]", "ruota di −90° / +90°"], ["Frecce", "sposta di 1 passo griglia (Maiusc: ×10)"], ["Ctrl+Z / Ctrl+Y", "annulla / ripristina"]]],
  ["Disegno", [["Cifre + Invio", "lunghezza del muro"], ["Tab", "passa all'angolo"], ["Maiusc", "angoli a 15° (con Ortogonale: liberi)"], ["Alt", "rotazione libera dell'oggetto"], ["Spazio + trascina, tasto centrale", "sposta la vista"], ["Rotella", "zoom"]]],
  ["Vista 3D", [["Clic", "seleziona"], ["Trascina un oggetto", "lo sposta"], ["A piedi: W A S D, frecce", "cammina · Maiusc corre"], ["Trascina", "guarda intorno"], ["Esc", "esce dalla visita o cancella le misure"]]]];
function openHelp(){
  closeHelp();
  const d = document.createElement("div"); d.id = "helpBox"; d.className = "help"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Scorciatoie");
  d.innerHTML = `<div class="help-in"><header><h3>Scorciatoie</h3><button class="btn" id="helpClose" aria-label="Chiudi">✕</button></header><div class="help-grid">${SHORTCUTS.map(([t, l]) => `<section><h4>${esc(t)}</h4><dl>${l.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join("")}</dl></section>`).join("")}</div></div>`;
  document.body.appendChild(d); d.addEventListener("click", e => { if (e.target === d || e.target.closest("#helpClose")) closeHelp(); }); $("#helpClose").focus();
}
function closeHelp(){ document.getElementById("helpBox")?.remove(); }

/* ---------- barra di stato ---------- */
const SNAP_BTNS = [["snapGrid","Griglia"],["snapEnds","Estremi di muri e locali"],["snapMid","Punti medi"],["snapWall","Lungo i muri"],["guides","Linee guida di allineamento"]];
let savedAt = null, snapOpen = false;
function renderStatus(){
  const el = $("#sbRight"); if (!el) return;
  el.innerHTML = `${snapOpen ? `<div class="snapmenu" role="menu">${SNAP_BTNS.map(([k, n]) => `<button class="sb" data-pref="${k}" aria-pressed="${!!PREFS[k]}">${n}</button>`).join("")}</div>` : ""}
    <button class="sb" id="snapBtn" aria-expanded="${snapOpen}" title="Cosa aggancia il cursore">Aggancio ▾</button>
    <select class="sb" id="gridSel" aria-label="Passo della griglia" title="Passo della griglia">${[[.01,"1 cm"],[.05,"5 cm"],[.1,"10 cm"],[.25,"25 cm"]].map(([v, n]) => `<option value="${v}" ${PREFS.grid === v ? "selected" : ""}>${n}</option>`).join("")}</select>
    <button class="sb" data-pref="ortho" aria-pressed="${!!PREFS.ortho}" title="Muri solo a 90° (Maiusc per liberarli)">Orto</button>
    <select class="sb" id="unitSel" aria-label="Unità delle quote" title="Unità delle quote">${["m","cm","mm"].map(u => `<option ${PREFS.units === u ? "selected" : ""}>${u}</option>`).join("")}</select>
    <button class="sb" data-pref="autoDims" aria-pressed="${!!PREFS.autoDims}" title="Lunghezza di tutti i muri">Quote</button>
    <span class="sb-info" id="zoomInfo"></span><span class="sb-info" id="saveInfo"></span><button class="sb" id="helpBtn" aria-label="Scorciatoie" title="Scorciatoie (?)">?</button>`;
  updateStatusInfo();
}
function updateStatusInfo(){ const z = $("#zoomInfo"), s = $("#saveInfo"); if (z) z.textContent = `${Math.round(V.s)} px/m`; if (s) s.textContent = savedAt ? `salvato ${savedAt.toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"})}` : ""; }
$("#sbRight")?.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.pref){ PREFS[b.dataset.pref] = !PREFS[b.dataset.pref]; savePrefs(); renderStatus(); draw2D(); if (["wall","dim"].includes(S.tool)) renderInspector(); }
  if (b.id === "snapBtn"){ snapOpen = !snapOpen; renderStatus(); }
  if (b.id === "helpBtn") openHelp(); });
$("#sbRight")?.addEventListener("change", e => { if (e.target.id === "gridSel"){ PREFS.grid = +e.target.value; savePrefs(); } if (e.target.id === "unitSel"){ PREFS.units = e.target.value; savePrefs(); draw2D(); renderInspector(); } });
document.addEventListener("pointerdown", e => { if (snapOpen && !e.target.closest("#sbRight")){ snapOpen = false; renderStatus(); } }, true);

/* ---------- piani a schede sopra la pianta ---------- */
function renderLevelTabs(){
  const el = $("#tag2d"); if (!el || !P) return;
  el.innerHTML = [...P.levels].sort((a, b) => a.elev - b.elev).map(l => `<button class="lvl" data-lvl="${l.id}" aria-pressed="${l.id === S.level}" title="Quota ${fmt(l.elev)} m · altezza ${fmt(l.height)} m">${esc(l.name)}</button>`).join("") + `<button class="lvl" data-lvl="+" title="Aggiungi un piano sopra">+</button>`;
}
$("#tag2d")?.addEventListener("click", e => { const b = e.target.closest("[data-lvl]"); if (!b) return;
  if (b.dataset.lvl === "+"){ $("#addLevel").click(); return; }
  S.level = b.dataset.lvl; setSel([]); S.draw = null; applyVisibility(); render3D(); refresh(); });
