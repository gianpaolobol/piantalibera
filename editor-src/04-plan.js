/* ============================================================
   Vista in pianta e interazione
   ============================================================ */
let snap = null; const past = [], future = [];
/* Storia di annulla: copie JSON del progetto in cui le immagini incorporate (data URL oltre 8 KB: texture importate,
   foto, base di ricalco) sono sostituite da un riferimento; ogni immagine si tiene una volta sola (#55). */
const BLOBS = new Map(), BLOB_OF = new Map();
const blobRef = v => { let id = BLOBS.get(v); if (!id){ id = "\u0001blob:" + BLOBS.size; BLOBS.set(v, id); BLOB_OF.set(id, v); } return id; };
const snapOf = p => JSON.stringify(p, (k, v) => typeof v === "string" && v.length > 8192 && v.startsWith("data:") ? blobRef(v) : v);
const fromSnap = s => JSON.parse(s, (k, v) => typeof v === "string" && v.charCodeAt(0) === 1 && BLOB_OF.has(v) ? BLOB_OF.get(v) : v);
function historyBytes(){ let n = (snap || "").length; for (const x of past) n += x.length; for (const x of future) n += x.length; for (const v of BLOBS.keys()) n += v.length; return n; }
function commit(){ if (S.viewer){ if (snap) P = fromSnap(snap); refresh(); return; } const s = snapOf(P); if (s === snap) return; if (snap) past.push(snap); if (past.length > 80) past.shift(); future.length = 0; snap = s; save(); refresh(); }
function undo(){ if (!past.length) return; future.push(snap); snap = past.pop(); P = fromSnap(snap); afterLoad(); }
function redo(){ if (!future.length) return; past.push(snap); snap = future.pop(); P = fromSnap(snap); afterLoad(); }
function afterLoad(){ for (const k of Object.keys(matCache)) if (!MATS[k]) invalidateMat(k); fixSel(); save(); refresh(); }
function fixSel(){ if (!level(S.level)) S.level = P.levels[0].id; P.dims = P.dims || []; setSel(selList().filter(x => itemOf(x))); }
let saveWarned = false;
/* Salvataggio nel browser. localStorage tiene l'ultima versione con l'ora (LS_T); sessionStorage ricorda il progetto
   di questa scheda. Se localStorage è pieno, la copia vecchia si toglie e resta solo il riferimento al progetto:
   alla riapertura si legge la raccolta Progetti (IndexedDB), che è più recente (09-init.js, restoreFromIdb). */
const LS_P = "pianta-libera-v2", LS_T = "pianta-libera-t", LS_LAST = "pianta-libera-ultimo", SS_PID = "pianta-libera-pid";
function save(){ if (S.viewer) return; if (S.guest) return guestSave();
  try { sessionStorage.setItem(SS_PID, P.pid); } catch(e){}
  try { localStorage.setItem(LS_P, JSON.stringify(P)); localStorage.setItem(LS_T, String(Date.now())); localStorage.removeItem(LS_LAST); savedAt = new Date(); updateStatusInfo(); }
  catch(e){ try { localStorage.removeItem(LS_P); localStorage.removeItem(LS_T); localStorage.setItem(LS_LAST, P.pid); } catch(_){}
    if (!saveWarned){ saveWarned = true; toast("Il progetto è troppo grande per il salvataggio rapido del browser: resta nella raccolta Progetti. Per sicurezza usa anche Esporta → Salva progetto", true); }
    if (idbReady){ saveToIdb(); return; } }   // senza copia rapida la raccolta si scrive subito
  queueIdbSave(); }
function findSel(){ if (!S.sel) return null; const k = {wall:"walls", opening:"openings", room:"rooms", object:"objects", dim:"dims"}[S.sel.type]; return P[k]?.find(x => x.id === S.sel.id) || null; }

const c2d = $("#c2d"), ctx = c2d.getContext("2d");
const V = {cx:5.5, cy:4, s:40};
let W2 = 0, H2 = 0, DPR = 1;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let C = {};
function readColors(){ C = {bg:css("--plan-bg"), grid:css("--plan-grid"), gridM:css("--plan-grid-major"), poche:css("--plan-poche"), room:css("--plan-room"), text:css("--plan-text"), ghost:css("--plan-ghost"), sel:css("--plan-sel"), under:css("--plan-under"), muted:css("--muted"), green:css("--plan-green")};
  if (!P?.sky?.id || P.sky.id === "colore") scene.background = new THREE.Color(isDark() ? SKY_COL.dark : SKY_COL.light); }
const toS = p => [(p[0]-V.cx)*V.s + W2/2, (p[1]-V.cy)*V.s + H2/2];
const toW = (x,y) => [(x - W2/2)/V.s + V.cx, (y - H2/2)/V.s + V.cy];
function resize2D(){ const r = c2d.parentElement.getBoundingClientRect(); if (r.width < 2) return; DPR = Math.min(2, devicePixelRatio); W2 = r.width; H2 = r.height; c2d.width = W2*DPR; c2d.height = H2*DPR; draw2D(); }
const underImgs = {};
function underImg(src){ if (!underImgs[src]){ const im = new Image(); im.onload = draw2D; im.src = src; underImgs[src] = im; } return underImgs[src]; }

/* pr = {g}: disegna su un contesto vettoriale per le tavole (niente griglia, selezioni, strumenti) */
function draw2D(pr){
  if (pr && !pr.g) pr = undefined; // chiamata come gestore di eventi
  if ((!W2 && !pr) || !P) return;
  const g = pr ? pr.g : ctx; if (!pr){ g.setTransform(DPR,0,0,DPR,0,0); g.fillStyle = C.bg; g.fillRect(0,0,W2,H2); }
  if (!pr){ const step = V.s > 60 ? .5 : V.s > 25 ? 1 : V.s > 8 ? 5 : 10; const [x0,y0] = toW(0,0), [x1,y1] = toW(W2,H2);
  g.lineWidth = 1;
  for (let x = Math.floor(x0/step)*step; x <= x1; x += step){ const sx = Math.round(toS([x,0])[0])+.5; g.strokeStyle = Math.abs(x % (step*5)) < 1e-6 ? C.gridM : C.grid; g.beginPath(); g.moveTo(sx,0); g.lineTo(sx,H2); g.stroke(); }
  for (let y = Math.floor(y0/step)*step; y <= y1; y += step){ const sy = Math.round(toS([0,y])[1])+.5; g.strokeStyle = Math.abs(y % (step*5)) < 1e-6 ? C.gridM : C.grid; g.beginPath(); g.moveTo(0,sy); g.lineTo(W2,sy); g.stroke(); } }
  const L = level();
  const U = pr ? null : L?.underlay;
  if (U){
    g.save(); g.globalAlpha = U.opacity ?? .5;
    if (U.kind === "img"){ const im = underImg(U.src); if (im.complete && im.naturalWidth){ const [sx,sy] = toS([U.ox, U.oy]); g.drawImage(im, sx, sy, im.naturalWidth*U.mpp*V.s, im.naturalHeight*U.mpp*V.s); } }
    else if (U.kind === "vec"){ g.strokeStyle = C.under; g.lineWidth = 1; g.beginPath(); for (const l of U.lines){ const a = toS([U.ox + l[0]*U.k, U.oy + l[1]*U.k]), b = toS([U.ox + l[2]*U.k, U.oy + l[3]*U.k]); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); } g.stroke(); }
    g.restore();
  }
  const below = P.levels.filter(l => l.elev < L.elev).sort((a,b)=>b.elev-a.elev)[0];
  if (below && !pr){ g.fillStyle = C.ghost; for (const w of wallsOf(below.id)) fillWall(g, w, [[-w.thick/2, wallFrame(w).len + w.thick/2]]); }
  for (const r of P.rooms.filter(r=>r.level===L.id)){
    if (r.pts.length < 2) continue;
    g.beginPath(); r.pts.forEach((p,i)=>{ const s = toS(p); i ? g.lineTo(s[0],s[1]) : g.moveTo(s[0],s[1]); }); g.closePath();
    g.fillStyle = C.room; g.fill();
    if (isSelected(r.id)){ g.strokeStyle = C.sel; g.lineWidth = 2; g.setLineDash([6,4]); g.stroke(); g.setLineDash([]); }
  }
  const ws = wallsOf(L.id), ranges = ws.map(w => wallSolidRanges(w));
  g.fillStyle = C.poche; g.strokeStyle = C.poche; g.lineWidth = 1.5;
  ws.forEach((w,i) => strokeWall(g, w, ranges[i].solids));
  ws.forEach((w,i) => fillWall(g, w, ranges[i].solids));
  ws.forEach((w,i) => { for (const c of ranges[i].cuts) drawOpening(g, w, c); });
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const r of P.rooms.filter(r=>r.level===L.id)){
    if (r.pts.length < 3) continue; const c = toS(roomLabelPos(r)), A = Math.abs(polyArea(r.pts));
    if (V.s > 14){ g.fillStyle = C.text; g.font = `600 ${clamp(V.s*.32, 10, 15)}px Archivo, system-ui, sans-serif`; g.fillText(r.name || "Locale", c[0], c[1]-8);
      g.fillStyle = C.muted; g.font = `${clamp(V.s*.27, 9, 12)}px "IBM Plex Mono", ui-monospace, monospace`; g.fillText(`${fmt(A,1)} m²`, c[0], c[1]+8); }
  }
  for (const o of P.objects.filter(o=>o.level===L.id)) drawObject2D(g, o);
  drawDims(g);
  if (pr){ pr.after?.(g); return; }
  drawCommentPins(g);
  const sel = findSel(), multi = S.multi?.length > 1;
  if (multi) for (const x of selItems()) if (x.s.type === "wall"){ const a = toS(x.it.a), b = toS(x.it.b); g.strokeStyle = C.sel; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
  if (!multi && S.sel?.type === "object" && sel) drawObjHandles(g, sel);
  if (drag?.type === "object" && drag.moved) for (const d of wallDistances(drag.o)) dimLine(g, d.a, d.b, 0, fmtL(d.t), C.text, true);
  if (S.guides?.length){ g.save(); g.strokeStyle = C.sel; g.globalAlpha = .55; g.setLineDash([3,4]); g.lineWidth = 1; g.beginPath(); for (const [a,b] of S.guides){ const A = toS(a), B = toS(b); g.moveTo(A[0],A[1]); g.lineTo(B[0],B[1]); } g.stroke(); g.restore(); }
  if (drag?.type === "box"){ const a = drag.sp, b = drag.cur || a; g.save(); g.fillStyle = C.sel; g.globalAlpha = .08; g.fillRect(a[0], a[1], b[0]-a[0], b[1]-a[1]); g.globalAlpha = 1; g.strokeStyle = C.sel; g.setLineDash([4,3]); g.strokeRect(a[0]+.5, a[1]+.5, b[0]-a[0], b[1]-a[1]); g.restore(); }
  if (!multi && S.sel?.type === "wall" && sel){ const f = wallFrame(sel), a = toS(sel.a), b = toS(sel.b);
    g.strokeStyle = C.sel; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
    for (const p of [a,b]){ g.fillStyle = C.bg; g.beginPath(); g.arc(p[0],p[1],6,0,7); g.fill(); g.stroke(); }
    dimLine(g, sel.a, sel.b, sel.thick/2 + .6, fmtL(f.len));
  }
  if (S.sel?.type === "room" && sel){ for (const p of sel.pts){ const s = toS(p); g.fillStyle = C.bg; g.strokeStyle = C.sel; g.lineWidth = 2; g.beginPath(); g.rect(s[0]-4,s[1]-4,8,8); g.fill(); g.stroke(); } }
  if (S.sel?.type === "opening" && sel){ const w = wallById(sel.wall); if (w){ const p0 = ptOnWall(w, sel.t - sel.w/2), p1 = ptOnWall(w, sel.t + sel.w/2); dimLine(g, p0, p1, w.thick/2 + .45, fmtL(sel.w)); } }
  drawToolPreview(g); drawArcPreview(g); drawObserver(g);
  g.save(); g.translate(W2 - 34, 40); g.rotate((P.site?.north || 0) * Math.PI / 180); g.strokeStyle = C.text; g.fillStyle = C.text; g.lineWidth = 1.2;
  g.beginPath(); g.arc(0,0,14,0,7); g.stroke(); g.beginPath(); g.moveTo(0,-12); g.lineTo(5,6); g.lineTo(0,2); g.lineTo(-5,6); g.closePath(); g.fill();
  g.font = `600 10px Archivo, system-ui, sans-serif`; g.fillText("N", 0, -22); g.restore();
  const sbm = V.s > 60 ? 1 : V.s > 25 ? 2 : V.s > 10 ? 5 : 10, sbx = W2 - 20 - sbm*V.s, sby = H2 - 44;
  g.fillStyle = C.text; g.fillRect(sbx, sby, sbm*V.s/2, 4); g.strokeStyle = C.text; g.lineWidth=1; g.strokeRect(sbx+.5, sby+.5, sbm*V.s, 4);
  g.font = `10px "IBM Plex Mono", monospace`; g.textAlign = "right"; g.fillText(`${sbm} m`, W2 - 20, sby - 8);
  hud2d(); updateSel3D();
}
function drawObject2D(g, o){
  const fp = objFootprint(o), a = -THREE.MathUtils.degToRad(o.rot||0), it = o.kind === "lib" ? LIBMAP[libRef(o.ref)] : null, isSel = isSelected(o.id);
  if (it?.param && drawParam2D(g, o, it, isSel)) return;
  g.save(); const s = toS([o.x,o.y]); g.translate(s[0],s[1]); g.rotate(-a);
  const loading = !objTemplate(o); if (o.hidden) g.globalAlpha = .25;
  if (it?.plan === "tree" && !loading){
    const r = Math.max(fp.w, fp.d)/2*V.s; g.fillStyle = C.green; g.globalAlpha = .22; g.beginPath();
    for (let i=0;i<=24;i++){ const t = i/24*Math.PI*2, rr = r*(1 + .06*Math.sin(t*7)); g.lineTo(Math.cos(t)*rr + fp.cx*V.s, Math.sin(t)*rr + fp.cz*V.s); } g.fill(); g.globalAlpha = 1;
    g.strokeStyle = isSel ? C.sel : C.green; g.lineWidth = isSel ? 2 : 1; g.stroke();
    g.beginPath(); for (let i=0;i<8;i++){ const t = i/8*Math.PI*2; g.moveTo(fp.cx*V.s, fp.cz*V.s); g.lineTo(Math.cos(t)*r*.55 + fp.cx*V.s, Math.sin(t)*r*.55 + fp.cz*V.s); } g.stroke();
    g.fillStyle = isSel ? C.sel : C.green; g.beginPath(); g.arc(fp.cx*V.s, fp.cz*V.s, Math.max(2, .15*V.s), 0, 7); g.fill();
  } else if (it?.plan === "person"){
    g.strokeStyle = isSel ? C.sel : C.muted; g.fillStyle = C.bg; g.lineWidth = isSel ? 2 : 1.2;
    g.beginPath(); g.ellipse(0, 0, .26*V.s, .14*V.s, 0, 0, Math.PI*2); g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, .1*V.s, 0, 7); g.stroke();
  } else {
    g.strokeStyle = isSel ? C.sel : C.muted; g.lineWidth = isSel ? 2 : 1; g.setLineDash(loading ? [4,3] : []);
    g.strokeRect((fp.cx - fp.w/2)*V.s, (fp.cz - fp.d/2)*V.s, fp.w*V.s, fp.d*V.s); g.setLineDash([]);
    g.beginPath(); g.moveTo((fp.cx - fp.w/2)*V.s + 3, (fp.cz + fp.d/2)*V.s - 3); g.lineTo((fp.cx + fp.w/2)*V.s - 3, (fp.cz + fp.d/2)*V.s - 3); g.globalAlpha = .5; g.stroke(); g.globalAlpha = 1;
  }
  g.restore();
  const showLabel = isSel || loading || (V.s > 55 && fp.w*V.s > 70);
  if (showLabel && it?.plan !== "tree"){ const ra = -a, lx = fp.cx*Math.cos(ra) - fp.cz*Math.sin(ra), lz = fp.cx*Math.sin(ra) + fp.cz*Math.cos(ra); g.fillStyle = isSel ? C.sel : C.muted; g.font = `10px Archivo, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(loading ? "caricamento…" : (o.name||""), s[0] + lx*V.s, s[1] + lz*V.s + (it?.plan === "person" ? .45*V.s : 0)); }
}
/* maniglie dell'oggetto selezionato: rotazione (cerchio) e misura (quadrato) */
function objHandles(o){
  const fp = objFootprint(o), a = THREE.MathUtils.degToRad(o.rot || 0), L = (lx, lz) => [o.x + lx*Math.cos(a) - lz*Math.sin(a), o.y + lx*Math.sin(a) + lz*Math.cos(a)];
  const top = L(fp.cx, fp.cz - fp.d/2), rot = L(fp.cx, fp.cz - fp.d/2 - 18/V.s - .1), size = L(fp.cx + fp.w/2, fp.cz + fp.d/2);
  return {top, rot, size, center:L(fp.cx, fp.cz)};
}
function drawObjHandles(g, o){
  const h = objHandles(o), T = toS(h.top), R = toS(h.rot), Z = toS(h.size);
  g.save(); g.strokeStyle = C.sel; g.fillStyle = C.bg; g.lineWidth = 1.5; g.beginPath(); g.moveTo(T[0],T[1]); g.lineTo(R[0],R[1]); g.stroke();
  g.beginPath(); g.arc(R[0], R[1], 6, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.rect(Z[0]-5, Z[1]-5, 10, 10); g.fill(); g.stroke(); g.restore();
}
function wallQuad(w, s0, s1){ const h = w.thick/2; return [ptOnWall(w,s0,-h), ptOnWall(w,s1,-h), ptOnWall(w,s1,h), ptOnWall(w,s0,h)].map(toS); }
function quadPath(g, q){ g.moveTo(q[0][0],q[0][1]); for (let i=1;i<4;i++) g.lineTo(q[i][0],q[i][1]); g.closePath(); }
function strokeWall(g, w, solids){ g.beginPath(); for (const [a,b] of solids) quadPath(g, wallQuad(w,a,b)); g.stroke(); }
function fillWall(g, w, solids){ g.beginPath(); for (const [a,b] of solids) quadPath(g, wallQuad(w,a,b)); g.fill(); }
function drawOpening(g, w, c){
  const o = c.o, h = w.thick/2, isSel = isSelected(o.id); g.strokeStyle = isSel ? C.sel : C.poche; g.lineWidth = isSel ? 2 : 1;
  const L = (s, off) => toS(ptOnWall(w, s, off));
  g.beginPath(); for (const s of [c.s0, c.s1]){ const a=L(s,-h), b=L(s,h); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); } g.stroke();
  if (drawOpeningStyle(g, w, c)) return;
  if (o.type === "window"){
    g.beginPath(); for (const off of [-h, -h/4, h/4, h]){ const a=L(c.s0,off), b=L(c.s1,off); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); } g.stroke();
  } else {
    const flip = o.flip||0, hingeS = (flip & 1) ? c.s1 : c.s0, side = (flip & 2) ? -1 : 1, f = wallFrame(w);
    const hinge = ptOnWall(w, hingeS, side*h), open = [hinge[0] + f.nx*side*o.w, hinge[1] + f.ny*side*o.w];
    const H = toS(hinge), O = toS(open), E = toS(ptOnWall(w, (flip&1) ? c.s0 : c.s1, side*h));
    g.beginPath(); g.moveTo(H[0],H[1]); g.lineTo(O[0],O[1]); g.stroke();
    const r = o.w*V.s, a1 = Math.atan2(O[1]-H[1], O[0]-H[0]), a2 = Math.atan2(E[1]-H[1], E[0]-H[0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI;
    g.setLineDash([3,3]); g.beginPath(); g.arc(H[0],H[1], r, a1, a2, d < 0); g.stroke(); g.setLineDash([]);
  }
}
function dimLine(g, a, b, off, label, col, quiet){
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
  const A = toS([a[0]+nx*off, a[1]+ny*off]), B = toS([b[0]+nx*off, b[1]+ny*off]);
  col = col || C.sel; if (quiet && Math.hypot(B[0]-A[0], B[1]-A[1]) < 34) return;
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
  if (off && !quiet){ const a0 = toS(a), b0 = toS(b); g.globalAlpha = .6; g.beginPath(); g.moveTo(a0[0],a0[1]); g.lineTo(A[0],A[1]); g.moveTo(b0[0],b0[1]); g.lineTo(B[0],B[1]); g.stroke(); g.globalAlpha = 1; }
  g.beginPath(); g.moveTo(A[0],A[1]); g.lineTo(B[0],B[1]); g.stroke();
  for (const Q of [A,B]){ g.beginPath(); g.moveTo(Q[0]-4,Q[1]+4); g.lineTo(Q[0]+4,Q[1]-4); g.stroke(); }
  const m = [(A[0]+B[0])/2, (A[1]+B[1])/2]; let ang = Math.atan2(B[1]-A[1], B[0]-A[0]); if (ang > Math.PI/2 || ang < -Math.PI/2) ang += Math.PI;
  g.translate(m[0], m[1]); g.rotate(ang); g.font = `500 ${quiet ? 10 : 11}px "IBM Plex Mono", monospace`; g.textAlign = "center"; g.textBaseline = "bottom";
  const tw = g.measureText(label).width + 8; g.fillStyle = C.bg; g.fillRect(-tw/2, -17, tw, 15); g.fillStyle = col; g.fillText(label, 0, -4); g.restore();
}
function drawToolPreview(g){
  const d = S.draw, hp = S.hover;
  g.save(); g.strokeStyle = C.sel; g.fillStyle = C.sel; g.lineWidth = 1.5;
  if (S.tool === "wall" && d?.start && hp){
    const end = wallEndFromTyped(d.start, hp.p); const a = toS(d.start), b = toS(end);
    g.setLineDash([6,4]); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.setLineDash([]);
    const off = wallOffsetVec(d.start, end); if (off[0] || off[1]){ const A2 = toS([d.start[0]+off[0], d.start[1]+off[1]]), B2 = toS([end[0]+off[0], end[1]+off[1]]); g.save(); g.globalAlpha = .35; g.lineWidth = Math.max(2, S.defaults.wallThick*V.s); g.beginPath(); g.moveTo(A2[0],A2[1]); g.lineTo(B2[0],B2[1]); g.stroke(); g.restore(); }
    dimLine(g, d.start, end, S.defaults.wallThick/2 + .5, fmtL(Math.hypot(end[0]-d.start[0], end[1]-d.start[1])));
    const ang = (Math.atan2(-(end[1]-d.start[1]), end[0]-d.start[0]) * 180 / Math.PI + 360) % 360;
    const L1 = S.typedField === "ang" ? (S.typed || "—") : (S.typed ? S.typed + "▏" : fmt(Math.hypot(end[0]-d.start[0], end[1]-d.start[1]))), A1 = S.typedField === "ang" ? (S.typedAng || "") + "▏" : (S.typedAng || Math.round(ang));
    const bx = b[0] + 14, by = b[1] + 14, txt = `L ${L1} m   ∠ ${A1}°`; g.font = `500 11px "IBM Plex Mono", monospace`; const tw = g.measureText(txt).width + 12;
    g.fillStyle = C.bg; g.strokeStyle = C.sel; g.lineWidth = 1; g.fillRect(bx, by, tw, 20); g.strokeRect(bx+.5, by+.5, tw, 20); g.fillStyle = C.sel; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(txt, bx + 6, by + 10);
  }
  if (S.tool === "rect" && d?.start && hp){
    const a = toS(d.start), b = toS(hp.p); g.setLineDash([6,4]); g.strokeRect(a[0], a[1], b[0]-a[0], b[1]-a[1]); g.setLineDash([]);
    const xa = Math.min(d.start[0],hp.p[0]), xb = Math.max(d.start[0],hp.p[0]), ya = Math.min(d.start[1],hp.p[1]), yb = Math.max(d.start[1],hp.p[1]);
    const lab = {asse:"in asse", interno:"interne", esterno:"esterne"}[PREFS.rectRef] || "";
    dimLine(g, [xb, ya], [xa, ya], .6, `${fmtL(xb-xa)} ${lab}`); dimLine(g, [xb, yb], [xb, ya], .6, fmtL(yb-ya));
  }
  if (S.tool === "room" && d?.pts?.length){
    g.setLineDash([6,4]); g.beginPath(); d.pts.forEach((p,i)=>{ const s=toS(p); i?g.lineTo(s[0],s[1]):g.moveTo(s[0],s[1]); }); if (hp){ const s=toS(hp.p); g.lineTo(s[0],s[1]); } g.stroke(); g.setLineDash([]);
    for (const p of d.pts){ const s=toS(p); g.fillRect(s[0]-3,s[1]-3,6,6); }
  }
  if ((S.tool === "door" || S.tool === "window") && hp?.wall){
    const w = hp.wall, wd = S.tool === "door" ? S.defaults.door.w : S.defaults.win.w; const A = toS(ptOnWall(w, hp.s - wd/2)), B = toS(ptOnWall(w, hp.s + wd/2));
    g.lineWidth = Math.max(3, w.thick*V.s); g.globalAlpha = .45; g.beginPath(); g.moveTo(A[0],A[1]); g.lineTo(B[0],B[1]); g.stroke(); g.globalAlpha = 1;
  }
  if (S.tool === "dim" && d?.a && hp){ const b = d.b || hp.p, off = d.b ? dimOffsetFrom(d.a, d.b, hp.p) : 0; dimLine(g, d.a, b, off, fmtL(Math.hypot(b[0]-d.a[0], b[1]-d.a[1]))); }
  if (S.tool === "calib" && S.calib?.p1){ const a = toS(S.calib.p1), b = S.calib.p2 ? toS(S.calib.p2) : hp ? toS(hp.p) : a; g.setLineDash([4,3]); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); g.setLineDash([]); for (const p of [a,b]){ g.beginPath(); g.arc(p[0],p[1],4,0,7); g.fill(); } }
  if (hp?.snapped && ["wall","rect","room","calib","dim"].includes(S.tool)){ const s = toS(hp.p); g.lineWidth = 1.5; g.beginPath(); g.arc(s[0],s[1],7,0,7); g.stroke(); }
  g.restore();
}
function hud2d(){
  const hp = S.hover, L = level();
  const tips = {select:"Clic per selezionare · trascina per spostare · rotella per zoom · trascina il vuoto per spostare la vista",
    wall:PREFS.wallShape === "arco" ? (S.draw?.arcB ? "Sposta per curvare il muro, poi clic" : S.draw?.arcA ? "Clic sull'altra estremità dell'arco" : "Clic sul primo estremo dell'arco") : S.draw?.start ? "Clic per il punto successivo · cifre per la lunghezza, Tab per l'angolo, Invio · Esc per finire" : "Clic per iniziare il muro",
    dim:S.draw?.b ? "Sposta per scegliere la distanza della quota, poi clic" : S.draw?.a ? "Clic sul secondo punto" : "Clic sul primo punto da quotare",
    rect:"Trascina per disegnare una stanza con i suoi muri", room:"Clic sui vertici · Invio o clic sul primo punto per chiudere",
    paint:"Clic su un muro o un pavimento per applicare il materiale · Alt+clic preleva · nel 3D si dipinge un lato del muro",
    door:"Clic su un muro per inserire la porta", window:"Clic su un muro per inserire la finestra", furn:"Scegli a destra, poi clic in pianta per posizionare",
    calib:S.calib?.p2 ? "Inserisci la misura reale a destra" : "Clic su due punti di cui conosci la distanza", moveunder:"Trascina per spostare la base di ricalco"};
  const n = selList().length;
  $("#hud2d").innerHTML = `<span>${esc(n > 1 && S.tool === "select" ? `${n} elementi selezionati · trascina per spostarli · tasto destro per il menu` : tips[S.tool])}</span>${hp ? `<span>x ${fmt(hp.p[0])} · y ${fmt(hp.p[1])}</span>` : ""}`;
  updateStatusInfo();
}

Object.defineProperty(globalThis, "GRID", {get: () => PREFS.grid || .05, configurable:true});
function snapPoint(p, opts={}){
  const tol = 10 / V.s; let best = null, bd = tol; S.guides = [];
  const ws = wallsOf(S.level).filter(w => !(opts.skip instanceof Set ? opts.skip.has(w) : w === opts.skip)), skip = null;
  if (PREFS.snapEnds){ for (const w of ws){ if (w === skip) continue; for (const q of [w.a, w.b]){ const d = Math.hypot(q[0]-p[0], q[1]-p[1]); if (d < bd){ bd = d; best = [q[0], q[1]]; } } }
    for (const r of P.rooms) if (r.level === S.level && r !== opts.skipRoom) for (const q of r.pts){ const d = Math.hypot(q[0]-p[0], q[1]-p[1]); if (d < bd){ bd = d; best = [q[0], q[1]]; } } }
  if (PREFS.snapMid) for (const w of ws){ if (w === skip) continue; const q = [(w.a[0]+w.b[0])/2, (w.a[1]+w.b[1])/2], d = Math.hypot(q[0]-p[0], q[1]-p[1]); if (d < bd){ bd = d; best = q; } }
  if (best) return {p:best, snapped:true};
  if (PREFS.snapWall && opts.onWall !== false){ for (const w of ws){ if (w === skip) continue; const r = projOnSeg(p, w.a, w.b); if (r.d < 6/V.s && r.t > 0 && r.t < 1) return {p:r.q, snapped:true}; } }
  let q = PREFS.snapGrid ? [Math.round(p[0]/GRID)*GRID, Math.round(p[1]/GRID)*GRID] : p.slice();
  if (PREFS.guides && opts.guides !== false){ let gx = null, gy = null, dx = 7/V.s, dy = 7/V.s;
    for (const w of ws){ if (w === skip) continue; for (const e of [w.a, w.b]){ if (Math.abs(e[0]-p[0]) < dx){ dx = Math.abs(e[0]-p[0]); gx = e; } if (Math.abs(e[1]-p[1]) < dy){ dy = Math.abs(e[1]-p[1]); gy = e; } } }
    if (opts.from){ if (Math.abs(opts.from[0]-p[0]) < dx){ gx = opts.from; } if (Math.abs(opts.from[1]-p[1]) < dy){ gy = opts.from; } }
    if (gx){ q[0] = gx[0]; S.guides.push([gx, [gx[0], q[1]]]); } if (gy){ q[1] = gy[1]; S.guides.push([gy, [q[0], gy[1]]]); }
    if (gx || gy) return {p:q, snapped:false, guided:true};
  }
  return {p:q, snapped:false};
}
/* Maiusc: angoli a 15°; con «Ortogonale» attivo i muri vanno a 90° e Maiusc li libera */
function constrainAngle(a, p, shift){ const step = PREFS.ortho ? (shift ? 0 : Math.PI/2) : (shift ? Math.PI/12 : 0); if (!step) return p; const dx=p[0]-a[0], dy=p[1]-a[1], L=Math.hypot(dx,dy), ang=Math.round(Math.atan2(dy,dx)/step)*step; return [a[0]+Math.cos(ang)*L, a[1]+Math.sin(ang)*L]; }
/* lunghezza e angolo digitati (angolo in gradi, antiorario da est come in un CAD) */
function wallEndFromTyped(a, p){
  const v = num(S.typed), ag = num(S.typedAng); let dx=p[0]-a[0], dy=p[1]-a[1], L=Math.hypot(dx,dy)||1;
  if (ag !== null && S.typedAng !== ""){ const r = ag*Math.PI/180; dx = Math.cos(r); dy = -Math.sin(r); L = 1; if (!v){ const pr = (p[0]-a[0])*dx + (p[1]-a[1])*dy; return [a[0]+dx*Math.max(pr, 0), a[1]+dy*Math.max(pr, 0)]; } }
  if (!v) return p; return [a[0]+dx/L*v, a[1]+dy/L*v]; }
/* muro disegnato sul filo: l'asse si sposta di mezzo spessore */
function wallOffsetVec(a, b){ const ref = PREFS.wallRef; if (ref !== "sinistra" && ref !== "destra") return [0, 0]; const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, h = S.defaults.wallThick/2, sg = ref === "sinistra" ? 1 : -1; return [-dy/L*h*sg, dx/L*h*sg]; }
function dimOffsetFrom(a, b, p){ const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1; return ((p[0]-a[0])*(-dy/L) + (p[1]-a[1])*(dx/L)); }
function nearestWall(p, maxD=.6){ let best=null, bd=Infinity; for (const w of wallsOf(S.level)){ const r = projOnSeg(p, w.a, w.b); if (r.d < w.thick/2 + maxD && r.d < bd){ bd = r.d; best = {wall:w, s:r.t*wallFrame(w).len, d:r.d}; } } return best; }
function hitTest(p){
  const tol = (S.lastPtr === "touch" ? 14 : 6)/V.s; const dh = dimHit(p); if (dh) return dh;
  for (const o of P.openings){ const w = wallById(o.wall); if (!w || w.level !== S.level) continue; const r = projOnSeg(p, w.a, w.b), s = r.t*wallFrame(w).len; if (r.d < w.thick/2 + tol && Math.abs(s - o.t) < o.w/2) return {type:"opening", id:o.id}; }
  for (const o of [...P.objects].reverse()){ if (o.level !== S.level || o.locked || o.hidden) continue; const fp = objFootprint(o), a = THREE.MathUtils.degToRad(o.rot||0); const dx=p[0]-o.x, dy=p[1]-o.y; const lx = dx*Math.cos(a) + dy*Math.sin(a), ly = -dx*Math.sin(a) + dy*Math.cos(a);
    const it = o.kind === "lib" ? LIBMAP[libRef(o.ref)] : null; const shrink = it?.plan === "tree" ? .5 : 1;
    if (Math.abs(lx-fp.cx) < fp.w/2*shrink && Math.abs(ly-fp.cz) < fp.d/2*shrink) return {type:"object", id:o.id}; }
  for (const w of wallsOf(S.level)){ const r = projOnSeg(p, w.a, w.b); if (r.d < w.thick/2 + tol) return {type:"wall", id:w.id}; }
  for (const r of P.rooms){ if (r.level === S.level && inPoly(p, r.pts)) return {type:"room", id:r.id}; }
  return null;
}
let drag = null; const pointers = new Map(); let spaceDown = false;
const HR = () => S.lastPtr === "touch" ? 18 : 9; // raggio di presa delle maniglie
function evP(e){ const r = c2d.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
c2d.addEventListener("pointerdown", e => {
  c2d.setPointerCapture(e.pointerId); const sp = evP(e); pointers.set(e.pointerId, sp);
  if (pointers.size === 2){ const [p1,p2] = [...pointers.values()]; drag = {type:"pinch", d0:Math.hypot(p1[0]-p2[0],p1[1]-p2[1]), s0:V.s, c0:toW((p1[0]+p2[0])/2,(p1[1]+p2[1])/2)}; return; }
  const raw = toW(...sp); const sn = snapPoint(raw);
  if (e.button === 2){ drag = {type:"pan", sp, c:[V.cx,V.cy], right:true, raw}; e.preventDefault(); return; }
  if (e.button === 1 || (e.button === 0 && spaceDown)){ drag = {type:"pan", sp, c:[V.cx,V.cy]}; e.preventDefault(); return; }
  closeCtxMenu();
  const t = S.tool;
  if (t === "select"){
    const sel = findSel(), single = selList().length === 1;
    if (single && S.sel?.type === "object" && sel){ const hd = objHandles(sel), R = toS(hd.rot), Z = toS(hd.size);
      if (Math.hypot(R[0]-sp[0], R[1]-sp[1]) < HR()){ drag = {type:"objRot", o:sel, moved:false}; return; }
      if (Math.hypot(Z[0]-sp[0], Z[1]-sp[1]) < HR()){ drag = {type:"objScale", o:sel, c:hd.center, d0:Math.hypot(hd.size[0]-hd.center[0], hd.size[1]-hd.center[1]), s0:sel.scale || 1, moved:false}; return; } }
    if (single && S.sel?.type === "wall" && sel){ for (const k of ["a","b"]){ const s = toS(sel[k]); if (Math.hypot(s[0]-sp[0], s[1]-sp[1]) < HR()){ drag = {type:"wallEnd", w:sel, links: linkedEnds(sel[k]), moved:false}; return; } } }
    if (single && S.sel?.type === "room" && sel){ for (let i=0;i<sel.pts.length;i++){ const s = toS(sel.pts[i]); if (Math.hypot(s[0]-sp[0], s[1]-sp[1]) < 8){ drag = {type:"roomPt", room:sel, i, moved:false}; return; } } }
    const lab = !e.shiftKey && roomLabelHit(sp); if (lab){ setSel([{type:"room", id:lab.id}]); renderInspector(); drag = {type:"roomLabel", r:lab, start:raw, orig:(lab.lab || [0,0]).slice(), moved:false}; draw2D(); return; }
    const h = hitTest(raw);
    if (e.shiftKey && h){ toggleSel(h); renderInspector(); draw2D(); return; }
    // a tocco: un dito sposta la vista; un tocco senza movimento seleziona (o deseleziona sul vuoto);
    // si trascina solo un elemento già selezionato (i locali, grandi, non si spostano col dito: si usano i vertici)
    if (e.pointerType === "touch" && (!h || !isSelected(h.id) || h.type === "room")){ drag = {type:"pan", sp, c:[V.cx,V.cy], tap:h || "none"}; return; }
    if (!h){ drag = {type:"box", sp, cur:sp, add:e.shiftKey}; if (!e.shiftKey){ setSel([]); renderInspector(); } draw2D(); return; }
    if (selList().length > 1 && isSelected(h.id)){ drag = {type:"group", start:raw, snap:groupSnapshot(), moved:false}; return; }
    const grp = expandGroup(h); if (grp.length > 1){ setSel(grp); renderInspector(); drag = {type:"group", start:raw, snap:groupSnapshot(), moved:false}; draw2D(); return; }
    setSel([h]); renderInspector();
    const obj = findSel();
    if (h.type === "opening") drag = {type:"opening", o:obj, moved:false};
    else if (h.type === "object") drag = {type:"object", o:obj, start:raw, orig:[obj.x,obj.y], moved:false};
    else if (h.type === "wall") drag = {type:"wallMove", w:obj, start:raw, a:obj.a.slice(), b:obj.b.slice(), la:linkedEnds(obj.a, obj), lb:linkedEnds(obj.b, obj), moved:false};
    else if (h.type === "room") drag = {type:"roomMove", r:obj, start:raw, orig:obj.pts.map(p=>p.slice()), moved:false};
    else if (h.type === "dim") drag = {type:"group", start:raw, snap:groupSnapshot(), moved:false};
    draw2D(); return;
  }
  if (t === "paint"){ paint2D(raw, e.altKey || S.paintPick); return; }
  if (t === "wall" && PREFS.wallShape === "arco"){ arcToolClick(sn.p, raw); return; }
  if (t === "wall"){
    let p = sn.p; if (S.draw?.start){ p = wallEndFromTyped(S.draw.start, constrainAngle(S.draw.start, p, e.shiftKey)); addWall(S.draw.start, p, true); }
    S.draw = {start:p, chain:S.draw?.chain}; S.typed = ""; S.typedAng = ""; S.typedField = "len"; draw2D(); return;
  }
  if (t === "dim"){
    const d = S.draw || (S.draw = {});
    if (!d.a) d.a = sn.p; else if (!d.b){ if (Math.hypot(sn.p[0]-d.a[0], sn.p[1]-d.a[1]) > .02) d.b = sn.p; }
    else { P.dims = P.dims || []; const dm = {id:uid(), level:S.level, a:d.a, b:d.b, off:+dimOffsetFrom(d.a, d.b, raw).toFixed(3)}; P.dims.push(dm); S.draw = null; setSel([{type:"dim", id:dm.id}]); commit(); }
    draw2D(); return;
  }
  if (t === "rect"){ S.draw = {start:sn.p}; drag = {type:"rect"}; return; }
  if (t === "room"){
    S.draw = S.draw || {pts:[]}; const pts = S.draw.pts;
    if (pts.length >= 3){ const f = toS(pts[0]); if (Math.hypot(f[0]-sp[0], f[1]-sp[1]) < 10){ finishRoom(); return; } }
    pts.push(sn.p); draw2D(); return;
  }
  if (t === "door" || t === "window"){
    const nw = nearestWall(raw); if (!nw){ toast("Clicca vicino a un muro", true); return; }
    const d = t === "door" ? S.defaults.door : S.defaults.win, f = wallFrame(nw.wall), wd = Math.min(d.w, f.len - .1);
    const o = {id:uid(), wall:nw.wall.id, t:clamp(Math.round(nw.s/GRID)*GRID, wd/2+.05, f.len-wd/2-.05), w:wd, h:d.h, sill:t==="door"?0:d.sill, type:t, flip:0};
    if (d.style && d.style !== "battente") o.style = d.style; if (t === "window" && d.shut) o.shut = d.shut;
    P.openings.push(o); S.sel = {type:"opening", id:o.id}; commit(); return;
  }
  if (t === "furn"){ placeFurniture(sn.p); return; }
  if (t === "calib"){ if (!level().underlay){ toast("Importa prima una pianta come base di ricalco", true); return; } if (!S.calib || S.calib.p2) S.calib = {p1:raw}; else { S.calib.p2 = raw; S.tab = "props"; renderTabs(); renderInspector(); } draw2D(); return; }
  if (t === "moveunder"){ const U = level().underlay; if (!U){ toast("Nessuna base di ricalco su questo piano", true); return; } drag = {type:"under", start:raw, o:[U.ox, U.oy], moved:false}; return; }
});
c2d.addEventListener("pointermove", e => {
  const sp = evP(e); if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sp);
  const raw = toW(...sp);
  if (drag?.type === "pinch" && pointers.size === 2){ const [p1,p2] = [...pointers.values()]; const d = Math.hypot(p1[0]-p2[0],p1[1]-p2[1]); V.s = clamp(drag.s0 * d/drag.d0, 3, 400); const c = toW((p1[0]+p2[0])/2,(p1[1]+p2[1])/2); V.cx += drag.c0[0]-c[0]; V.cy += drag.c0[1]-c[1]; draw2D(); return; }
  if (drag?.type === "box"){ drag.cur = sp; draw2D(); return; }
  let sn = snapPoint(raw, {onWall: S.tool !== "select", guides: S.tool !== "select", from: S.draw?.start});
  if (S.tool === "wall" && S.draw?.start) sn = {p:constrainAngle(S.draw.start, sn.p, e.shiftKey), snapped:sn.snapped};
  if (S.tool === "door" || S.tool === "window"){ const nw = nearestWall(raw); S.hover = {p:raw, wall:nw?.wall, s:nw?.s}; }
  else S.hover = {p:sn.p, snapped:sn.snapped};
  if (!drag){ draw2D(); return; }
  const dx = raw[0] - (drag.start?.[0] ?? raw[0]), dy = raw[1] - (drag.start?.[1] ?? raw[1]);
  const g = v => Math.round(v/GRID)*GRID;
  switch (drag.type){
    case "pan": V.cx = drag.c[0] - (sp[0]-drag.sp[0])/V.s; V.cy = drag.c[1] - (sp[1]-drag.sp[1])/V.s; if (Math.hypot(sp[0]-drag.sp[0], sp[1]-drag.sp[1]) > 4) drag.panned = true; break;
    case "group": drag.moved = true; applyGroupMove(drag.snap, g(dx), g(dy)); rebuild3D(); break;
    case "objRot": { const c = [drag.o.x, drag.o.y]; let deg = Math.atan2(raw[0]-c[0], -(raw[1]-c[1])) * 180 / Math.PI; if (!e.altKey) deg = Math.round(deg/15)*15; drag.o.rot = ((deg % 360) + 360) % 360; drag.moved = true; rebuild3D(); renderInspector(); break; }
    case "objScale": { const d = Math.hypot(raw[0]-drag.c[0], raw[1]-drag.c[1]); drag.o.scale = clamp(+(drag.s0 * d / Math.max(drag.d0, .01)).toFixed(2), .1, 10); drag.moved = true; rebuild3D(); renderInspector(); break; }
    case "wallEnd": { const q = snapPoint(raw, {onWall:false, skip:new Set(drag.links.map(l => l[0]))}).p; for (const [w,k] of drag.links) w[k] = q.slice(); drag.moved = true; rebuild3D(); renderInspector(); break; }
    case "wallMove": { const ox = g(dx), oy = g(dy); drag.w.a = [drag.a[0]+ox, drag.a[1]+oy]; drag.w.b = [drag.b[0]+ox, drag.b[1]+oy]; for (const [w,k] of drag.la) w[k] = drag.w.a.slice(); for (const [w,k] of drag.lb) w[k] = drag.w.b.slice(); drag.moved = true; rebuild3D(); break; }
    case "opening": { const w = wallById(drag.o.wall), r = projOnSeg(raw, w.a, w.b), f = wallFrame(w); drag.o.t = clamp(g(r.t*f.len), drag.o.w/2+.05, f.len-drag.o.w/2-.05); drag.moved = true; rebuild3D(); renderInspector(); break; }
    case "object": drag.o.x = g(drag.orig[0]+dx); drag.o.y = g(drag.orig[1]+dy); drag.moved = true; rebuild3D(); renderInspector(); break;
    case "roomPt": drag.room.pts[drag.i] = snapPoint(raw, {skipRoom:drag.room, guides:false}).p; drag.moved = true; rebuild3D(); break;
    case "roomLabel": drag.r.lab = [+(drag.orig[0]+dx).toFixed(2), +(drag.orig[1]+dy).toFixed(2)]; drag.moved = true; break;
    case "roomMove": drag.r.pts = drag.orig.map(p => [p[0]+g(dx), p[1]+g(dy)]); drag.moved = true; rebuild3D(); break;
    case "under": { const U = level().underlay; U.ox = drag.o[0]+dx; U.oy = drag.o[1]+dy; drag.moved = true; break; }
  }
  draw2D();
});
function endDrag(e){
  pointers.delete(e.pointerId);
  if (!drag) return;
  if (drag.type === "pan" && drag.tap && !drag.panned){ const h = drag.tap; drag = null; setSel(h === "none" ? [] : expandGroup(h)); renderInspector(); draw2D(); return; }
  if (drag.type === "pan" && drag.right && !drag.panned){ const sp = drag.sp, raw = drag.raw; drag = null; if (S.tool === "wall" || S.tool === "dim"){ S.draw = null; draw2D(); return; } openCtxMenu(sp, raw); return; }
  if (drag.type === "box"){ const a = toW(...drag.sp), b = toW(...drag.cur), x0 = Math.min(a[0],b[0]), x1 = Math.max(a[0],b[0]), y0 = Math.min(a[1],b[1]), y1 = Math.max(a[1],b[1]);
    if (Math.abs(drag.cur[0]-drag.sp[0]) + Math.abs(drag.cur[1]-drag.sp[1]) > 6){
      const inside = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1, found = [];
      for (const w of wallsOf(S.level)) if (inside(w.a) && inside(w.b)) found.push({type:"wall", id:w.id});
      for (const r of P.rooms) if (r.level === S.level && r.pts.every(inside)) found.push({type:"room", id:r.id});
      for (const o of P.objects) if (o.level === S.level && !o.locked && !o.hidden && inside([o.x, o.y])) found.push({type:"object", id:o.id});
      for (const d of P.dims || []) if (d.level === S.level && inside(d.a) && inside(d.b)) found.push({type:"dim", id:d.id});
      for (const o of P.openings){ const w = wallById(o.wall); if (w && w.level === S.level && !found.some(f => f.id === w.id) && inside(ptOnWall(w, o.t))) found.push({type:"opening", id:o.id}); }
      setSel(drag.add ? [...selList(), ...found] : found); renderInspector(); }
    drag = null; draw2D(); return; }
  if (drag.type === "rect" && S.draw?.start && S.hover){ const a = S.draw.start, b = S.hover.p; if (Math.abs(a[0]-b[0]) > .4 && Math.abs(a[1]-b[1]) > .4) addRectRoom(a, b); S.draw = null; }
  else if (drag.moved) commit();
  if (drag.type !== "pinch" || pointers.size < 2) drag = null; draw2D();
}
c2d.addEventListener("pointerup", endDrag); c2d.addEventListener("pointercancel", endDrag);
c2d.addEventListener("pointerleave", () => { if (!drag){ S.hover = null; draw2D(); } });
c2d.addEventListener("contextmenu", e => e.preventDefault());
c2d.addEventListener("dblclick", e => { if (S.tool === "wall"){ S.draw = null; draw2D(); } if (S.tool === "room") finishRoom();
  if (S.tool === "select"){ const raw = toW(...evP(e)), h = hitTest(raw); if (h){ setSel([h]); focusInspector(); } else autoRoomAt(raw); } });
c2d.addEventListener("wheel", e => { e.preventDefault(); const sp = evP(e), before = toW(...sp); V.s = clamp(V.s * Math.exp(-e.deltaY*.0015), 3, 400); const after = toW(...sp); V.cx += before[0]-after[0]; V.cy += before[1]-after[1]; draw2D(); }, {passive:false});
function linkedEnds(pt, except){ const out = []; for (const w of wallsOf(S.level)){ if (w === except) continue; for (const k of ["a","b"]) if (Math.hypot(w[k][0]-pt[0], w[k][1]-pt[1]) < 1e-4) out.push([w,k]); } return out; }
function addWall(a, b, chained){
  if (Math.hypot(b[0]-a[0], b[1]-a[1]) < .05) return; const d = S.defaults, o = wallOffsetVec(a, b);
  let A = [a[0]+o[0], a[1]+o[1]], B = [b[0]+o[0], b[1]+o[1]];
  const prev = chained && S.draw?.chain && wallById(S.draw.chain.id);
  if (prev && (o[0] || o[1])){ // spigolo: intersezione tra il muro precedente e questo, entrambi spostati
    const p1 = prev.a, d1 = [prev.b[0]-prev.a[0], prev.b[1]-prev.a[1]], d2 = [B[0]-A[0], B[1]-A[1]], den = d1[0]*d2[1] - d1[1]*d2[0];
    if (Math.abs(den) > 1e-9){ const t = ((A[0]-p1[0])*d2[1] - (A[1]-p1[1])*d2[0]) / den, X = [+(p1[0]+d1[0]*t).toFixed(4), +(p1[1]+d1[1]*t).toFixed(4)]; prev.b = X.slice(); A = X.slice(); }
  }
  const w = {id:uid(), level:S.level, a:A, b:B, thick:d.wallThick, height:null, mat:d.wallMat, ...wallTypeProps(d)}; P.walls.push(w); setSel([{type:"wall", id:w.id}]);
  if (S.draw) S.draw.chain = {id:w.id}; commit(); }
function addRectRoom(a, b){
  const d=S.defaults, t=d.wallThick, k = PREFS.rectRef === "interno" ? t/2 : PREFS.rectRef === "esterno" ? -t/2 : 0;
  const x0=Math.min(a[0],b[0])-k, x1=Math.max(a[0],b[0])+k, y0=Math.min(a[1],b[1])-k, y1=Math.max(a[1],b[1])+k;
  const C4 = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  for (let i=0;i<4;i++){ const p=C4[i], q=C4[(i+1)%4]; const same = (u,v) => Math.hypot(u[0]-v[0],u[1]-v[1]) < 1e-4; const exists = wallsOf(S.level).some(w => (same(w.a,p) && same(w.b,q)) || (same(w.a,q) && same(w.b,p))); if (!exists) P.walls.push({id:uid(), level:S.level, a:p.slice(), b:q.slice(), thick:t, height:null, mat:d.wallMat, ...wallTypeProps(d)}); }
  const r = {id:uid(), level:S.level, name:"Locale " + (P.rooms.filter(r=>r.level===S.level).length+1), mat:d.roomMat, pts:[[x0+t/2,y0+t/2],[x1-t/2,y0+t/2],[x1-t/2,y1-t/2],[x0+t/2,y1-t/2]]};
  P.rooms.push(r); S.sel = {type:"room", id:r.id}; commit();
}
function finishRoom(){ const pts = S.draw?.pts; if (pts && pts.length >= 3){ const r = {id:uid(), level:S.level, name:"Locale " + (P.rooms.filter(r=>r.level===S.level).length+1), mat:S.defaults.roomMat, pts:pts.map(p=>p.slice())}; P.rooms.push(r); S.sel = {type:"room", id:r.id}; commit(); } S.draw = null; draw2D(); }
function deleteSel(){
  const l = selList(); if (!l.length) return;
  for (const s of l){
    if (s.type === "wall"){ P.walls = P.walls.filter(w=>w.id!==s.id); P.openings = P.openings.filter(o=>o.wall!==s.id); }
    if (s.type === "opening") P.openings = P.openings.filter(o=>o.id!==s.id);
    if (s.type === "room") P.rooms = P.rooms.filter(r=>r.id!==s.id);
    if (s.type === "object") P.objects = P.objects.filter(o=>o.id!==s.id);
    if (s.type === "dim") P.dims = (P.dims || []).filter(d=>d.id!==s.id);
  }
  setSel([]); commit();
}
document.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea,select")) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (k === "Escape" && (document.getElementById("helpBox") || document.getElementById("ctxMenu"))){ closeHelp(); closeCtxMenu(); return; }
  if (mod && k.toLowerCase() === "z"){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === "y"){ e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === "c"){ if (selList().length){ e.preventDefault(); copySel(); } return; }
  if (mod && k.toLowerCase() === "v"){ if (CLIP){ e.preventDefault(); pasteClip(S.hover?.p || null); } return; }
  if (mod && k.toLowerCase() === "d"){ e.preventDefault(); duplicateSel(); return; }
  if (mod && k.toLowerCase() === "a"){ e.preventDefault(); if (S.tool !== "select") setTool("select"); selectAll(); return; }
  if (k === " "){ spaceDown = true; e.preventDefault(); return; }
  if (k === "?"){ openHelp(); return; }
  if (k === "Escape"){ S.draw = null; S.typed = ""; S.typedAng = ""; S.typedField = "len"; S.calib = null; S.guides = []; $("#compare").hidden = true; if (S.tool === "select"){ setSel([]); renderInspector(); } draw2D(); return; }
  if (S.tool === "wall" && S.draw?.start){
    if (k === "Tab"){ e.preventDefault(); S.typedField = S.typedField === "ang" ? "len" : "ang"; draw2D(); return; }
    if (/^[0-9.,\-]$/.test(k)){ if (S.typedField === "ang") S.typedAng = (S.typedAng || "") + k; else S.typed += k; draw2D(); return; }
    if (k === "Backspace" && (S.typedField === "ang" ? S.typedAng : S.typed)){ if (S.typedField === "ang") S.typedAng = S.typedAng.slice(0,-1); else S.typed = S.typed.slice(0,-1); draw2D(); return; }
  }
  if (k === "Enter"){ if (S.tool === "room") finishRoom(); if (S.tool === "wall" && S.draw?.start && (S.typed || S.typedAng) && S.hover){ const p = wallEndFromTyped(S.draw.start, S.hover.p); addWall(S.draw.start, p, true); S.draw = {start:p, chain:S.draw?.chain}; S.typed = ""; S.typedAng = ""; S.typedField = "len"; draw2D(); } return; }
  if (k === "Delete" || k === "Backspace"){ deleteSel(); return; }
  if (S.tool === "select" && selList().length && (k === "[" || k === "]")){ transformSel("rot", k === "]" ? 90 : -90); return; }
  if (S.tool === "select" && selList().length && k.startsWith("Arrow")){ e.preventDefault(); const st = GRID * (e.shiftKey ? 10 : 1), d = {ArrowLeft:[-st,0], ArrowRight:[st,0], ArrowUp:[0,-st], ArrowDown:[0,st]}[k]; applyGroupMove(groupSnapshot(), d[0], d[1]); commit(); return; }
  const map = {v:"select", w:"wall", r:"rect", p:"room", d:"door", f:"window", a:"furn", c:"calib", m:"moveunder", q:"dim", b:"paint"}; if (map[k.toLowerCase()] && !mod && !e.altKey) setTool(map[k.toLowerCase()]);
});
document.addEventListener("keyup", e => { if (e.key === " ") spaceDown = false; });
function setTool(t){ S.tool = t; S.draw = null; S.typed = ""; S.typedAng = ""; S.typedField = "len"; S.guides = []; if (t !== "calib") S.calib = null; $$(".tool").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === t)); if (S.tab !== "props"){ S.tab = "props"; renderTabs(); } renderInspector(); draw2D(); }
$("#tools").addEventListener("click", e => { const b = e.target.closest(".tool"); if (b) setTool(b.dataset.tool); });
function fitPlan(){ const ws = wallsOf(S.level); let pts = ws.flatMap(w=>[w.a,w.b]); if (!pts.length) pts = P.rooms.filter(r=>r.level===S.level).flatMap(r=>r.pts); if (!pts.length){ V.cx = 5; V.cy = 4; V.s = 40; draw2D(); return; } const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys); V.cx=(x0+x1)/2; V.cy=(y0+y1)/2; V.s = clamp(Math.min(W2/((x1-x0)+4), H2/((y1-y0)+4)), 3, 200); draw2D(); }
function placeFurniture(p){
  if (S.furnSrc === "lib"){
    const it = LIBMAP[S.furn]; const o = {id:uid(), level:S.level, kind:"lib", ref:S.furn, name:it?.nome || "Arredo", x:p[0], y:p[1], rot:0, scale:1, z:0};
    initPlacedObject(o, it);
    P.objects.push(o); setSel([{type:"object", id:o.id}]); PREFS.recent = [S.furn, ...PREFS.recent.filter(r => r !== S.furn)].slice(0, 12); savePrefs(); commit(); return;
  }
  if (S.furnSrc === "online" || S.furnSrc === "personal"){
    const pick = S.onlinePick; if (!pick){ toast("Scegli prima un modello dalla libreria", true); return; }
    placeRemoteModel(pick, p);
  }
}
