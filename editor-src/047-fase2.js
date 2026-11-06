/* ============================================================
   Fine della fase 1 (archi, livelli, locali, unità) e fase 2
   (3D interattivo, visita a piedi, camere, metro e taglio,
   elenco oggetti, trascina dal catalogo, preferiti)
   ============================================================ */
PREFS.units = PREFS.units || "m"; PREFS.wallShape = PREFS.wallShape || "dritto"; PREFS.favs = PREFS.favs || []; PREFS.recent = PREFS.recent || [];

/* ---------- unità di misura delle etichette ---------- */
function fmtL(v){ const u = PREFS.units; return u === "cm" ? `${fmt(v*100, 1).replace(/,0$/, "")} cm` : u === "mm" ? `${Math.round(v*1000)} mm` : `${fmt(v)} m`; }

/* ---------- muri ad arco: una catena di segmenti che si seleziona e si modifica insieme ---------- */
function arcPoints(a, b, h){
  const dx = b[0]-a[0], dy = b[1]-a[1], c = Math.hypot(dx, dy); if (Math.abs(h) < .005 || c < .01) return [a, b];
  const R = (h*h + c*c/4) / (2*Math.abs(h)), sg = Math.sign(h), nx = dy/c, ny = -dx/c, mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
  const ap = [mx + nx*sg*Math.abs(h), my + ny*sg*Math.abs(h)], cx = ap[0] - nx*sg*R, cy = ap[1] - ny*sg*R;
  const a0 = Math.atan2(a[1]-cy, a[0]-cx), a1 = Math.atan2(b[1]-cy, b[0]-cx), am = Math.atan2(ap[1]-cy, ap[0]-cx);
  const norm = x => { while (x > Math.PI) x -= 2*Math.PI; while (x <= -Math.PI) x += 2*Math.PI; return x; };
  const s1 = norm(a1 - a0), s2 = s1 - 2*Math.PI*Math.sign(s1 || 1);
  const sweep = Math.abs(norm(a0 + s1/2 - am)) < Math.abs(norm(a0 + s2/2 - am)) ? s1 : s2;
  const n = clamp(Math.ceil(Math.abs(sweep)*R / .35), 6, 48), pts = [];
  for (let i = 0; i <= n; i++){ const t = a0 + sweep*i/n; pts.push(i === 0 ? a.slice() : i === n ? b.slice() : [+(cx + R*Math.cos(t)).toFixed(4), +(cy + R*Math.sin(t)).toFixed(4)]); }
  return pts;
}
function arcInfo(a, b, h){ const c = Math.hypot(b[0]-a[0], b[1]-a[1]); if (Math.abs(h) < .005) return {c, R:Infinity, len:c}; const R = (h*h + c*c/4) / (2*Math.abs(h)), th = 2*Math.asin(clamp(c/(2*R), -1, 1)), big = Math.abs(h) > R; return {c, R, len:R*(big ? 2*Math.PI - th : th)}; }
function createArcWall(a, b, h, props = {}){
  const g = uid(), pts = arcPoints(a, b, h), d = S.defaults, ids = [];
  for (let i = 0; i < pts.length - 1; i++){ const w = {id:uid(), level:props.level || S.level, a:pts[i], b:pts[i+1], thick:props.thick ?? d.wallThick, height:props.height ?? null, mat:props.mat || d.wallMat, arc:{g, i, h:+h.toFixed(3), A:a.slice(), B:b.slice()}}; P.walls.push(w); ids.push({type:"wall", id:w.id}); }
  return ids;
}
const arcWalls = g => P.walls.filter(w => w.arc?.g === g).sort((x, y) => x.arc.i - y.arc.i);
function arcGroupOf(list){ const ws = list.map(s => s.type === "wall" && wallById(s.id)); if (!ws.length || !ws.every(w => w?.arc)) return null; const g = ws[0].arc.g; return ws.every(w => w.arc.g === g) && ws.length === arcWalls(g).length ? g : null; }
function expandGroup(h){ if (h?.type !== "wall") return [h]; const w = wallById(h.id); return w?.arc ? arcWalls(w.arc.g).map(x => ({type:"wall", id:x.id})) : [h]; }
function regenArc(g, patch){
  const ws = arcWalls(g); if (!ws.length) return; const f = ws[0], A = f.arc.A, B = f.arc.B, h = patch.h ?? f.arc.h;
  const lost = P.openings.filter(o => ws.some(w => w.id === o.wall)).length;
  P.openings = P.openings.filter(o => !ws.some(w => w.id === o.wall)); P.walls = P.walls.filter(w => w.arc?.g !== g);
  setSel(createArcWall(A, B, h, {level:f.level, thick:patch.thick ?? f.thick, height:f.height, mat:f.mat})); commit();
  if (lost) toast(`${lost} apertur${lost > 1 ? "e rimosse" : "a rimossa"}: rimettile sul nuovo arco`, true);
}
function arcPanelHTML(g){
  const ws = arcWalls(g), f = ws[0], i = arcInfo(f.arc.A, f.arc.B, f.arc.h);
  return `<div class="sec"><h3>Muro ad arco</h3><div class="row">${F("arcH","Freccia (m)",fmt(f.arc.h),'inputmode="decimal"')}${F("arcT","Spessore (m)",fmt(f.thick),'inputmode="decimal"')}</div>
    <dl class="kv"><dt>Corda</dt><dd>${fmtL(i.c)}</dd><dt>Raggio</dt><dd>${isFinite(i.R) ? fmtL(i.R) : "—"}</dd><dt>Sviluppo</dt><dd>${fmtL(i.len)}</dd><dt>Segmenti</dt><dd>${ws.length}</dd></dl>
    <p class="note">Freccia positiva = curva verso sinistra andando dal primo all'ultimo punto; 0 = muro dritto. Porte e finestre si mettono sui singoli segmenti.</p>
    <div class="btns"><button class="btn" id="grDup">Duplica</button><button class="btn danger" id="delSel">Elimina</button></div></div>`;
}
function arcToolClick(p, raw){
  const d = S.draw || (S.draw = {});
  if (!d.arcA){ d.arcA = p; } else if (!d.arcB){ if (Math.hypot(p[0]-d.arcA[0], p[1]-d.arcA[1]) > .1) d.arcB = p; }
  else { const h = -dimOffsetFrom(d.arcA, d.arcB, raw); setSel(createArcWall(d.arcA, d.arcB, Math.abs(h) < .02 ? 0 : h)); S.draw = null; commit(); }
  draw2D();
}
function drawArcPreview(g){
  const d = S.draw, hp = S.hover; if (S.tool !== "wall" || PREFS.wallShape !== "arco" || !d?.arcA || !hp) return;
  const b = d.arcB || hp.p, pts = d.arcB ? arcPoints(d.arcA, d.arcB, -dimOffsetFrom(d.arcA, d.arcB, hp.p)) : [d.arcA, b];
  g.save(); g.strokeStyle = C.sel; g.lineWidth = Math.max(2, S.defaults.wallThick*V.s); g.globalAlpha = .4; g.beginPath(); pts.forEach((q, i) => { const s = toS(q); i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }); g.stroke(); g.restore();
  if (d.arcB){ const inf = arcInfo(d.arcA, d.arcB, -dimOffsetFrom(d.arcA, d.arcB, hp.p)); dimLine(g, d.arcA, d.arcB, 0, `corda ${fmtL(inf.c)} · R ${isFinite(inf.R) ? fmtL(inf.R) : "∞"}`); }
}

/* ---------- locali: etichetta spostabile, superficie netta e lorda ---------- */
const roomLabelPos = r => { const c = polyCentroid(r.pts), o = r.lab || [0, 0]; return [c[0]+o[0], c[1]+o[1]]; };
function roomLabelHit(sp){ if (V.s <= 14) return null; for (const r of P.rooms) if (r.level === S.level && r.pts.length > 2){ const s = toS(roomLabelPos(r)); if (Math.abs(sp[0]-s[0]) < 42 && Math.abs(sp[1]-s[1]) < 14) return r; } return null; }
function offsetPoly(pts, d){
  const n = pts.length, run = sg => pts.map((p, i) => { const p0 = pts[(i-1+n)%n], p1 = pts[(i+1)%n];
    const e1 = [p[0]-p0[0], p[1]-p0[1]], e2 = [p1[0]-p[0], p1[1]-p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [sg*e1[1]/l1, -sg*e1[0]/l1], n2 = [sg*e2[1]/l2, -sg*e2[0]/l2], m = [n1[0]+n2[0], n1[1]+n2[1]], ml = Math.hypot(...m) || 1, k = d / Math.max(.2, (m[0]*n1[0] + m[1]*n1[1]) / ml);
    return [p[0] + m[0]/ml*k, p[1] + m[1]/ml*k]; });
  const a = run(1); return Math.abs(polyArea(a)) > Math.abs(polyArea(pts)) ? a : run(-1);
}
function roomAreas(r){
  const net = Math.abs(polyArea(r.pts)); let per = 0, tsum = 0, lsum = 0;
  for (let i = 0; i < r.pts.length; i++){ const a = r.pts[i], b = r.pts[(i+1) % r.pts.length], L = Math.hypot(b[0]-a[0], b[1]-a[1]); per += L;
    const m = [(a[0]+b[0])/2, (a[1]+b[1])/2]; let best = null, bd = .6; for (const w of wallsOf(r.level)){ const q = projOnSeg(m, w.a, w.b); if (q.d < w.thick/2 + .1 && q.d < bd){ bd = q.d; best = w; } }
    if (best){ tsum += best.thick/2 * L; lsum += L; } }
  const half = lsum ? tsum / lsum : 0, gross = half ? Math.abs(polyArea(offsetPoly(r.pts, half))) : net;
  return {net, gross, per, half};
}

/* ---------- tabella dei livelli ---------- */
function levelsTableHTML(){
  return `<details class="lvtab"><summary class="lbl">Tutti i piani (${P.levels.length})</summary><table><thead><tr><th>Nome</th><th>Quota</th><th>Altezza</th><th>Solaio</th></tr></thead><tbody>${[...P.levels].sort((a, b) => b.elev - a.elev).map(l => `<tr${l.id === S.level ? ' class="cur"' : ""}><td><input class="inp" data-lvf="${l.id}:name" value="${esc(l.name)}" aria-label="Nome del piano"></td><td><input class="inp" data-lvf="${l.id}:elev" value="${fmt(l.elev)}" inputmode="decimal" aria-label="Quota"></td><td><input class="inp" data-lvf="${l.id}:height" value="${fmt(l.height)}" inputmode="decimal" aria-label="Altezza"></td><td><input class="inp" data-lvf="${l.id}:slab" value="${fmt(l.slab)}" inputmode="decimal" aria-label="Solaio"></td></tr>`).join("")}</tbody></table><p class="note">Metri. Quote negative per i piani interrati.</p></details>`;
}
$("#panel-props").addEventListener("change", e => { const t = e.target;
  if (t.dataset.lvf){ const [id, k] = t.dataset.lvf.split(":"), L = level(id); if (!L) return; if (k === "name") L.name = t.value; else { const v = num(t.value); if (v === null || (k !== "elev" && v <= 0)) return; L[k] = v; } commit(); }
  if (t.id === "arcH" || t.id === "arcT"){ const g = arcGroupOf(selList()), v = num(t.value); if (g && v !== null && (t.id === "arcH" || v > 0)) regenArc(g, t.id === "arcH" ? {h:v} : {thick:v}); }
  if (t.id === "wallShape"){ PREFS.wallShape = t.value; savePrefs(); S.draw = null; renderInspector(); draw2D(); }
  if (t.id === "rNoCeil"){ const r = findSel(); if (r){ r.noCeiling = t.checked; commit(); } }
  if (t.id === "ceilChk"){ S.ceilings = t.checked; applyVisibility(); render3D(); }
  if (t.id === "vcutAxis"){ S.vcut = {axis:t.value || null, pos:S.vcut?.pos ?? 50}; applyVisibility(); render3D(); renderInspector(); }
});
$("#panel-props").addEventListener("input", e => { if (e.target.id === "vcutPos"){ S.vcut.pos = +e.target.value; applyVisibility(); render3D(); } });

/* ---------- 3D: selezione, spostamento, evidenziazione ---------- */
const ray3 = new THREE.Raycaster(), ndc3 = new THREE.Vector2();
const visibleChain = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
function pick3D(e, ground){
  const r = c3d.getBoundingClientRect(); ndc3.set(((e.clientX - r.left) / r.width)*2 - 1, -((e.clientY - r.top) / r.height)*2 + 1); ray3.setFromCamera(ndc3, camera);
  const planes = renderer.clippingPlanes || [];
  const skip = ground ? ["glass"] : ["glass", "ground", "roof", "gable", "ceiling"];
  return ray3.intersectObject(modelGroup, true).find(h => visibleChain(h.object) && !skip.includes(h.object.userData.cat) && planes.every(p => p.distanceToPoint(h.point) >= -1e-3)) || null;
}
function objOf3D(o){ for (let x = o; x; x = x.parent) if (x.userData?.objId) return x; return null; }
function selectionFrom3D(hit){
  const ob = objOf3D(hit.object); if (ob) return {type:"object", id:ob.userData.objId, lid:ob.userData.level};
  const lid = hit.object.userData.level; if (!lid) return null;
  const prev = S.level; S.level = lid; const h = hitTest([hit.point.x, hit.point.z]); if (!h) S.level = prev; return h ? {...h, lid} : null;
}
const raySel = new THREE.Group(); raySel.name = "selezione"; scene.add(raySel);
let selKey = "";
function updateSel3D(force){
  const ids = selList().filter(s => s.type === "object").map(s => s.id), key = ids.join(",");
  if (!force && key === selKey) return; selKey = key;
  for (const c of [...raySel.children]){ raySel.remove(c); c.geometry?.dispose?.(); }
  if (ids.length) modelGroup.traverse(o => { if (o.userData?.objId && ids.includes(o.userData.objId)){ const b = new THREE.BoxHelper(o, new THREE.Color(css("--accent") || "#1f6f62")); b.material.depthTest = false; b.renderOrder = 10; raySel.add(b); } });
  render3D();
}
function afterRebuild3D(){ updateSel3D(true); }
let d3 = null;
$("#pane3d").addEventListener("pointerdown", e => {
  if (e.target !== c3d || e.button !== 0) return;
  if (WALK.on){ d3 = {type:"look", x:e.clientX, y:e.clientY, yaw:WALK.yaw, pitch:WALK.pitch}; c3d.setPointerCapture(e.pointerId); return; }
  d3 = {type:"click", x:e.clientX, y:e.clientY, t:performance.now()};
  if (M3.on || S.tool !== "select" || e.shiftKey) return;
  const hit = pick3D(e), ob = hit && objOf3D(hit.object); if (!ob) return;
  const o = P.objects.find(x => x.id === ob.userData.objId); if (!o || o.locked) return;
  const L = level(o.level); controls.enabled = false; c3d.setPointerCapture(e.pointerId);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(L.elev + (o.z || 0))), p0 = new THREE.Vector3(); ray3.ray.intersectPlane(plane, p0);
  d3 = {type:"move", o, ob, plane, start:[p0.x, p0.z], orig:[o.x, o.y], x:e.clientX, y:e.clientY, moved:false};
  if (!isSelected(o.id)){ setSel([{type:"object", id:o.id}]); renderInspector(); draw2D(); }
}, true);
$("#pane3d").addEventListener("pointermove", e => {
  if (!d3) return;
  if (d3.type === "look"){ WALK.yaw = d3.yaw - (e.clientX - d3.x)*.004; WALK.pitch = clamp(d3.pitch - (e.clientY - d3.y)*.004, -1.3, 1.3); applyWalkCam(); return; }
  if (d3.type !== "move") return;
  const r = c3d.getBoundingClientRect(); ndc3.set(((e.clientX - r.left) / r.width)*2 - 1, -((e.clientY - r.top) / r.height)*2 + 1); ray3.setFromCamera(ndc3, camera);
  const p = new THREE.Vector3(); if (!ray3.ray.intersectPlane(d3.plane, p)) return;
  const gx = v => +(Math.round(v / GRID) * GRID).toFixed(3); d3.o.x = gx(d3.orig[0] + p.x - d3.start[0]); d3.o.y = gx(d3.orig[1] + p.z - d3.start[1]);
  d3.ob.position.x = d3.o.x; d3.ob.position.z = d3.o.y; d3.moved = true; updateSel3D(true); draw2D(); render3D();
}, true);
$("#pane3d").addEventListener("pointerup", e => {
  const d = d3; d3 = null; if (!d) return; controls.enabled = !WALK.on;
  if (d.type === "move" && d.moved){ commit(); return; }
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || d.type === "look") return;
  if (M3.on){ measureClick(e); return; }
  if (S.tool !== "select") return;
  const hit = pick3D(e), h = hit && selectionFrom3D(hit);
  if (h?.lid && h.lid !== S.level){ S.level = h.lid; applyVisibility(); renderLevels(); }
  if (!h){ if (!e.shiftKey) setSel([]); } else if (e.shiftKey) toggleSel({type:h.type, id:h.id}); else setSel(expandGroup({type:h.type, id:h.id}));
  renderInspector(); draw2D();
}, true);

/* ---------- trascina dal catalogo in pianta o nel 3D ---------- */
$("#panel-props").addEventListener("dragstart", e => { const b = e.target.closest("[data-furn]"); if (!b) return; e.dataTransfer.setData("text/pianta-ref", b.dataset.furn); e.dataTransfer.effectAllowed = "copy"; });
for (const el of [c2d, c3d]) el.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("text/pianta-ref")){ e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
function dropRef(ref, p){ if (!LIBMAP[ref]) return; S.furnSrc = "lib"; S.furn = ref; if (LIBMAP[ref].load && !TPL[ref]) loadTpl(ref); placeFurniture(p); }
c2d.addEventListener("drop", e => { const ref = e.dataTransfer.getData("text/pianta-ref"); if (!ref) return; e.preventDefault(); const sp = evP(e); dropRef(ref, snapPoint(toW(...sp), {onWall:false}).p); });
c3d.addEventListener("drop", e => { const ref = e.dataTransfer.getData("text/pianta-ref"); if (!ref) return; e.preventDefault();
  const r = c3d.getBoundingClientRect(); ndc3.set(((e.clientX - r.left) / r.width)*2 - 1, -((e.clientY - r.top) / r.height)*2 + 1); ray3.setFromCamera(ndc3, camera);
  const L = level(), p = new THREE.Vector3(); if (!ray3.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -L.elev), p)) return;
  dropRef(ref, [Math.round(p.x / GRID) * GRID, Math.round(p.z / GRID) * GRID]); });

/* ---------- visita a piedi ---------- */
const WALK = {on:false, yaw:0, pitch:0, keys:new Set(), raf:0, last:0, saved:null};
function applyWalkCam(){ camera.rotation.set(WALK.pitch, WALK.yaw, 0, "YXZ"); camera.updateMatrixWorld(); render3D(); draw2D(); }
function enterWalk(){
  if (WALK.on) return exitWalk();
  const L = level(), room = (S.sel?.type === "room" && findSel()) || P.rooms.find(r => r.level === L.id);
  WALK.saved = {pos:camera.position.clone(), target:controls.target.clone(), fov:camera.fov};
  const c = room ? polyCentroid(room.pts) : [controls.target.x, controls.target.z];
  camera.position.set(c[0], L.elev + 1.6, c[1]); camera.fov = 70; camera.updateProjectionMatrix();
  const dir = new THREE.Vector3().subVectors(WALK.saved.target, WALK.saved.pos); WALK.yaw = Math.atan2(-dir.x, -dir.z); WALK.pitch = 0;
  WALK.on = true; controls.enabled = false; if (S.show3d === "all"){ S.show3d = "below"; applyVisibility(); }
  $("#walkBtn")?.setAttribute("aria-pressed", "true"); toast("Visita a piedi: W A S D o frecce per muoverti, trascina per guardarti intorno, Esc per uscire");
  applyWalkCam(); WALK.last = performance.now(); WALK.raf = requestAnimationFrame(walkLoop);
}
function exitWalk(){
  WALK.on = false; WALK.keys.clear(); cancelAnimationFrame(WALK.raf); controls.enabled = true; $("#walkBtn")?.setAttribute("aria-pressed", "false");
  const f = new THREE.Vector3(); camera.getWorldDirection(f); controls.target.copy(camera.position).addScaledVector(f, 3); controls.update(); render3D(); draw2D();
}
function walkLoop(t){
  if (!WALK.on) return; const dt = Math.min(.25, (t - WALK.last) / 1000); WALK.last = t;
  const k = WALK.keys, sp = (k.has("Shift") ? 3 : 1.4) * dt, f = [-Math.sin(WALK.yaw), -Math.cos(WALK.yaw)], r = [Math.cos(WALK.yaw), -Math.sin(WALK.yaw)];
  let mx = 0, mz = 0; if (k.has("w") || k.has("ArrowUp")){ mx += f[0]; mz += f[1]; } if (k.has("s") || k.has("ArrowDown")){ mx -= f[0]; mz -= f[1]; }
  if (k.has("d")){ mx += r[0]; mz += r[1]; } if (k.has("a")){ mx -= r[0]; mz -= r[1]; }
  if (k.has("ArrowLeft")) WALK.yaw += 1.6*dt; if (k.has("ArrowRight")) WALK.yaw -= 1.6*dt;
  if (mx || mz || k.has("ArrowLeft") || k.has("ArrowRight")){ camera.position.x += mx*sp; camera.position.z += mz*sp; applyWalkCam(); }
  WALK.raf = requestAnimationFrame(walkLoop);
}
window.addEventListener("keydown", e => {
  if (!WALK.on || e.target.closest?.("input,textarea,select")) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "Escape"){ exitWalk(); e.stopImmediatePropagation(); return; }
  if (["w","a","s","d","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Shift"].includes(k)){ WALK.keys.add(k); e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
window.addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; WALK.keys.delete(k); }, true);
/* osservatore in pianta: posizione degli occhi e campo visivo */
function drawObserver(g){
  if (!WALK.on) return; const p = toS([camera.position.x, camera.position.z]), half = THREE.MathUtils.degToRad(camera.fov * camera.aspect / 2), r = 46, dirA = Math.atan2(-Math.cos(WALK.yaw), -Math.sin(WALK.yaw));
  g.save(); g.fillStyle = C.sel; g.globalAlpha = .14; g.beginPath(); g.moveTo(p[0], p[1]); g.arc(p[0], p[1], r, dirA - Math.min(half, 1.3), dirA + Math.min(half, 1.3)); g.closePath(); g.fill();
  g.globalAlpha = 1; g.strokeStyle = C.sel; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(p[0], p[1], 6, 0, 7); g.fillStyle = C.sel; g.fill(); g.restore();
}

/* ---------- camere salvate ---------- */
function camState(){ return {pos:camera.position.toArray().map(v => +v.toFixed(3)), target:(WALK.on ? new THREE.Vector3().copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3)) : controls.target).toArray().map(v => +v.toFixed(3)), fov:camera.fov}; }
function saveCamera(){ P.cameras = P.cameras || []; const c = {id:uid(), name:`Vista ${P.cameras.length + 1}`, ...camState()}; P.cameras.push(c); commit(); renderCamSel(c.id); toast(`Camera «${c.name}» salvata: rinominala nel pannello Proprietà`); }
function goCamera(id){ const c = (P.cameras || []).find(x => x.id === id); if (!c) return; if (WALK.on) exitWalk(); camera.position.fromArray(c.pos); controls.target.fromArray(c.target); camera.fov = c.fov || 45; camera.updateProjectionMatrix(); controls.update(); render3D(); }
function renderCamSel(selId){ const s = $("#camSel"); if (!s) return; s.innerHTML = `<option value="">Camere…</option>${(P.cameras || []).map(c => `<option value="${c.id}" ${c.id === selId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="__save">＋ Salva questa vista</option>`; }
function camerasHTML(){ const cs = P.cameras || []; if (!cs.length) return ""; return `<div class="sec"><h3>Camere salvate</h3>${cs.map(c => `<div class="row camrow"><input class="inp" data-camname="${c.id}" value="${esc(c.name)}" aria-label="Nome della camera"><div class="btns"><button class="btn" data-camgo="${c.id}">Vai</button><button class="btn danger" data-camdel="${c.id}" aria-label="Elimina ${esc(c.name)}">✕</button></div></div>`).join("")}<p class="note">Le camere restano nel progetto: scegline una prima di un render o di un render AI.</p></div>`; }
$("#panel-props").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.camgo) goCamera(b.dataset.camgo);
  if (b.dataset.camdel){ P.cameras = P.cameras.filter(c => c.id !== b.dataset.camdel); commit(); renderCamSel(); }
  if (b.id === "favBtn"){ const r = S.furn, i = PREFS.favs.indexOf(r); if (i >= 0) PREFS.favs.splice(i, 1); else PREFS.favs.unshift(r); savePrefs(); renderInspector(); } });
$("#panel-props").addEventListener("change", e => { if (e.target.dataset.camname){ const c = P.cameras.find(x => x.id === e.target.dataset.camname); if (c){ c.name = e.target.value || c.name; commit(); renderCamSel(); } } });

/* ---------- metro nel 3D ---------- */
const M3 = {on:false, a:null, list:[], group:new THREE.Group()}; scene.add(M3.group);
function toggleMeasure(){ M3.on = !M3.on; M3.a = null; $("#m3Btn")?.setAttribute("aria-pressed", M3.on); if (!M3.on) clearMeasures(); else toast("Metro: clic su due punti del modello · Esc per cancellare le misure"); render3D(); }
function clearMeasures(){ for (const c of [...M3.group.children]){ M3.group.remove(c); c.geometry?.dispose?.(); } M3.list = []; M3.a = null; $("#m3labels").innerHTML = ""; render3D(); }
function measureClick(e){
  const hit = pick3D(e, true); if (!hit) return; const p = hit.point.clone();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshBasicMaterial({color:"#e0552b", depthTest:false})); dot.position.copy(p); dot.renderOrder = 11; M3.group.add(dot);
  if (!M3.a){ M3.a = p; render3D(); return; }
  const g = new THREE.BufferGeometry().setFromPoints([M3.a, p]), l = new THREE.Line(g, new THREE.LineBasicMaterial({color:"#e0552b", depthTest:false})); l.renderOrder = 11; M3.group.add(l);
  M3.list.push({a:M3.a, b:p, d:M3.a.distanceTo(p), dh:Math.hypot(p.x - M3.a.x, p.z - M3.a.z), dv:Math.abs(p.y - M3.a.y)}); M3.a = null; render3D();
}
function afterFrame3D(){
  const box = $("#m3labels"); if (!box) return; if (!M3.list.length){ if (box.innerHTML) box.innerHTML = ""; return; }
  const r = c3d.getBoundingClientRect();
  box.innerHTML = M3.list.map(m => { const v = m.a.clone().add(m.b).multiplyScalar(.5).project(camera); if (v.z > 1) return ""; return `<span style="left:${((v.x + 1)/2*r.width).toFixed(0)}px;top:${((1 - v.y)/2*r.height).toFixed(0)}px">${fmtL(m.d)}${m.dv > .05 && m.dh > .05 ? ` <small>↔ ${fmtL(m.dh)} ↕ ${fmtL(m.dv)}</small>` : ""}</span>`; }).join("");
}
document.addEventListener("keydown", e => { if (M3.on && e.key === "Escape" && !e.target.closest("input,textarea,select")) clearMeasures(); });

/* ---------- barra della vista 3D ---------- */
(() => {
  const bar = $("#pane3d .cam"); if (!bar) return;
  bar.insertAdjacentHTML("beforeend", `<button class="btn" id="walkBtn" aria-pressed="false" title="Visita a piedi (W A S D)">A piedi</button><button class="btn" id="m3Btn" aria-pressed="false" title="Misura tra due punti del modello">Metro</button><select class="inp camsel" id="camSel" aria-label="Camere salvate"></select>`);
  $("#pane3d").insertAdjacentHTML("beforeend", `<div class="m3labels" id="m3labels" aria-live="polite"></div>`);
  $("#walkBtn").addEventListener("click", enterWalk); $("#m3Btn").addEventListener("click", toggleMeasure);
  $("#camSel").addEventListener("change", e => { const v = e.target.value; if (v === "__save") saveCamera(); else if (v) goCamera(v); e.target.value = ""; });
})();

/* ---------- elenco oggetti e locali ---------- */
S.listSort = {k:"name", dir:1};
function objRows(){
  return P.objects.map(o => { const it = o.kind === "lib" ? LIBMAP[libRef(o.ref)] : null, fp = objFootprint(o); return {o, name:o.name || it?.nome || "Oggetto", cat:it?.cat || (o.kind === "import" ? "Importato" : "Online"), w:fp.w, d:fp.d, h:fp.h || 0, lv:level(o.level)?.name || "", elev:level(o.level)?.elev || 0}; });
}
function renderList(){
  const el = $("#panel-list"); if (!el) return; const {k, dir} = S.listSort;
  const rows = objRows().sort((a, b) => { const x = a[k], y = b[k]; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "it")) * dir; });
  const th = (key, n) => `<th><button data-sort="${key}" aria-sort="${k === key ? (dir > 0 ? "ascending" : "descending") : "none"}">${n}${k === key ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
  const rooms = P.rooms.map(r => ({r, ...roomAreas(r), lv:level(r.level)?.name || ""}));
  el.innerHTML = `<div class="sec"><h3>Oggetti (${rows.length})</h3><div class="tblwrap"><table class="olist"><thead><tr>${th("name","Nome")}${th("cat","Categoria")}${th("w","L×P×H cm")}${th("lv","Piano")}<th><span class="sr">Visibile</span>👁</th><th><span class="sr">Bloccato</span>🔒</th></tr></thead><tbody>
    ${rows.map(x => `<tr data-oid="${x.o.id}" class="${isSelected(x.o.id) ? "on" : ""}${x.o.hidden ? " off" : ""}"><td>${esc(x.name)}</td><td>${esc(x.cat)}</td><td class="num">${Math.round(x.w*100)}×${Math.round(x.d*100)}×${Math.round(x.h*100)}</td><td>${esc(x.lv)}</td><td><button class="ic" data-ohide="${x.o.id}" aria-pressed="${!x.o.hidden}" aria-label="${x.o.hidden ? "Mostra" : "Nascondi"} ${esc(x.name)}">${x.o.hidden ? "◌" : "●"}</button></td><td><button class="ic" data-olock="${x.o.id}" aria-pressed="${!!x.o.locked}" aria-label="${x.o.locked ? "Sblocca" : "Blocca"} ${esc(x.name)}">${x.o.locked ? "■" : "□"}</button></td></tr>`).join("")}</tbody></table></div>
    <p class="note">Clic su una riga per selezionare (Maiusc per aggiungere), doppio clic per le proprietà. Gli oggetti bloccati non si spostano col mouse.</p></div>
    <div class="sec"><h3>Locali (${rooms.length})</h3><div class="tblwrap"><table class="olist"><thead><tr><th>Nome</th><th>Piano</th><th>Netta m²</th><th>Lorda m²</th><th>Perimetro m</th></tr></thead><tbody>
    ${rooms.map(x => `<tr data-rid="${x.r.id}" class="${isSelected(x.r.id) ? "on" : ""}"><td>${esc(x.r.name || "Locale")}</td><td>${esc(x.lv)}</td><td class="num">${fmt(x.net)}</td><td class="num">${fmt(x.gross)}</td><td class="num">${fmt(x.per)}</td></tr>`).join("")}
    ${rooms.length ? `<tr class="tot"><td>Totale</td><td></td><td class="num">${fmt(rooms.reduce((s, x) => s + x.net, 0))}</td><td class="num">${fmt(rooms.reduce((s, x) => s + x.gross, 0))}</td><td></td></tr>` : ""}</tbody></table></div>
    <div class="btns"><button class="btn" id="listCsv">Esporta elenco in CSV</button></div></div>`;
}
$("#panel-list")?.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (b?.dataset.sort){ S.listSort = {k:b.dataset.sort, dir:S.listSort.k === b.dataset.sort ? -S.listSort.dir : 1}; renderList(); return; }
  if (b?.dataset.ohide){ const o = P.objects.find(x => x.id === b.dataset.ohide); o.hidden = !o.hidden; commit(); return; }
  if (b?.dataset.olock){ const o = P.objects.find(x => x.id === b.dataset.olock); o.locked = !o.locked; commit(); return; }
  if (b?.id === "listCsv"){ const q = v => `"${String(v).replace(/"/g, '""')}"`; const lines = [["Tipo","Nome","Categoria","Piano","L cm","P cm","H cm","Netta m²","Lorda m²","Perimetro m"].map(q).join(";")];
    for (const x of objRows()) lines.push(["Oggetto", x.name, x.cat, x.lv, Math.round(x.w*100), Math.round(x.d*100), Math.round(x.h*100), "", "", ""].map(q).join(";"));
    for (const r of P.rooms){ const a = roomAreas(r); lines.push(["Locale", r.name || "Locale", "", level(r.level)?.name || "", "", "", "", fmt(a.net), fmt(a.gross), fmt(a.per)].map(q).join(";")); }
    await saveFile(slug() + "-elenco.csv", "﻿" + lines.join("\r\n")); return; }
  const tr = e.target.closest("tr[data-oid], tr[data-rid]"); if (!tr) return;
  const s = tr.dataset.oid ? {type:"object", id:tr.dataset.oid} : {type:"room", id:tr.dataset.rid}, it = itemOf(s);
  if (it && it.level !== S.level){ S.level = it.level; applyVisibility(); renderLevels(); }
  if (e.shiftKey) toggleSel(s); else setSel([s]); draw2D(); renderList(); updateSel3D();
});
$("#panel-list")?.addEventListener("dblclick", e => { if (e.target.closest("tr[data-oid], tr[data-rid]")) focusInspector(); });
