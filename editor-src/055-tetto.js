/* ============================================================
   Copertura personalizzata: falde modificabili in pianta
   L.roof = {type:"custom", mat, th, falde:[{pts:[[x, y, h], …]}], noGable}
   x, y in pianta; h = quota dell'estradosso sopra il pavimento del piano (m).
   ============================================================ */
const RF = {sel:null, drawing:null, drag:null};   // sel: {f, k} (punto) o {f} (falda); drawing: punti della falda nuova
const roofTh = L => L.roof.th || .22;
const RF_N = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Falde equivalenti alla copertura automatica del tipo dato (piana, due falde, padiglione, una falda), sporto compreso. */
function faldeAuto(L, type = L.roof.type){
  const RR = roofRects(L.id); if (!RR) return [];
  const o = L.roof.overhang ?? .4, H = L.height, p = THREE.MathUtils.degToRad(clamp(L.roof.pitch || 30, 5, 60)), tn = Math.tan(p), th = roofTh(L), out = [];
  const single = RR.rects.length === 1;
  for (const r of RR.rects){
    const X0 = r.x0 - o, X1 = r.x1 + o, Z0 = r.z0 - o, Z1 = r.z1 + o, Ye = H - o * tn;
    const F = pts => out.push({pts:pts.map(q => q.map(v => +v.toFixed(3)))});
    if (type === "flat" || type === "none"){ F([[X0, Z0, H + th], [X1, Z0, H + th], [X1, Z1, H + th], [X0, Z1, H + th]]); continue; }
    if (type === "shed"){ const G = RR.bbox, dir = L.roof.dir || "s", t = (x, z) => dir === "s" ? G.z1 - z : dir === "n" ? z - G.z0 : dir === "e" ? G.x1 - x : x - G.x0;
      F([[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]].map(([x, z]) => [x, z, H + t(x, z) * tn])); continue; }
    const alongX = type === "gable" && single && L.roof.ridge ? L.roof.ridge === "x" : (r.x1 - r.x0) >= (r.z1 - r.z0);
    if (type === "gable"){
      if (alongX){ const cz = (r.z0 + r.z1) / 2, Yr = Ye + ((r.z1 - r.z0) / 2 + o) * tn; F([[X0, Z0, Ye], [X1, Z0, Ye], [X1, cz, Yr], [X0, cz, Yr]]); F([[X0, cz, Yr], [X1, cz, Yr], [X1, Z1, Ye], [X0, Z1, Ye]]); }
      else { const cx = (r.x0 + r.x1) / 2, Yr = Ye + ((r.x1 - r.x0) / 2 + o) * tn; F([[X0, Z0, Ye], [cx, Z0, Yr], [cx, Z1, Yr], [X0, Z1, Ye]]); F([[cx, Z0, Yr], [X1, Z0, Ye], [X1, Z1, Ye], [cx, Z1, Yr]]); }
      continue; }
    // padiglione
    if (alongX){ const half = (r.z1 - r.z0) / 2 + o, Yr = Ye + half * tn, cz = (r.z0 + r.z1) / 2, xa = Math.min(X0 + half, (r.x0 + r.x1) / 2), xb = Math.max(X1 - half, (r.x0 + r.x1) / 2);
      F([[X0, Z0, Ye], [X1, Z0, Ye], [xb, cz, Yr], [xa, cz, Yr]]); F([[xa, cz, Yr], [xb, cz, Yr], [X1, Z1, Ye], [X0, Z1, Ye]]); F([[X0, Z0, Ye], [xa, cz, Yr], [X0, Z1, Ye]]); F([[X1, Z0, Ye], [X1, Z1, Ye], [xb, cz, Yr]]); }
    else { const half = (r.x1 - r.x0) / 2 + o, Yr = Ye + half * tn, cx = (r.x0 + r.x1) / 2, za = Math.min(Z0 + half, (r.z0 + r.z1) / 2), zb = Math.max(Z1 - half, (r.z0 + r.z1) / 2);
      F([[X0, Z0, Ye], [cx, za, Yr], [cx, zb, Yr], [X0, Z1, Ye]]); F([[X1, Z0, Ye], [X1, Z1, Ye], [cx, zb, Yr], [cx, za, Yr]]); F([[X0, Z0, Ye], [X1, Z0, Ye], [cx, za, Yr]]); F([[X0, Z1, Ye], [cx, zb, Yr], [X1, Z1, Ye]]); }
  }
  for (const f of out) f.pts = f.pts.filter((q, i, a) => Math.hypot(q[0] - a[(i + a.length - 1) % a.length][0], q[1] - a[(i + a.length - 1) % a.length][1]) > 1e-3);
  return out.filter(f => f.pts.length >= 3);
}
/** Cambio del tipo di copertura: passando a «personalizzata» le falde nascono da quella automatica di prima. */
function setRoofType(L, t){
  if (t === "custom" && L.roof.type !== "custom"){ if (!L.roof.falde?.length) L.roof.falde = faldeAuto(L, L.roof.type === "none" ? "gable" : L.roof.type); L.roof.prev = L.roof.type === "none" ? "gable" : L.roof.type; }
  L.roof.type = t;
}
/** Piano di una falda (minimi quadrati): h(x, y). */
function faldaPlane(pts){
  let n = pts.length, sx = 0, sy = 0, sh = 0; for (const p of pts){ sx += p[0]; sy += p[1]; sh += p[2]; } const mx = sx / n, my = sy / n, mh = sh / n;
  let xx = 0, xy = 0, yy = 0, xh = 0, yh = 0; for (const p of pts){ const dx = p[0] - mx, dy = p[1] - my, dh = p[2] - mh; xx += dx*dx; xy += dx*dy; yy += dy*dy; xh += dx*dh; yh += dy*dh; }
  const det = xx*yy - xy*xy; if (Math.abs(det) < 1e-9) return () => mh;
  const a = (xh*yy - yh*xy) / det, b = (yh*xx - xh*xy) / det; return (x, y) => mh + a*(x - mx) + b*(y - my);
}
function faldaPitch(f){ const pl = faldaPlane(f.pts), g = Math.hypot(pl(1, 0) - pl(0, 0), pl(0, 1) - pl(0, 0)); return Math.atan(g) * 180 / Math.PI; }
function faldaArea(f){ const A = Math.abs(polyArea(f.pts.map(p => [p[0], p[1]]))); return A / Math.cos(faldaPitch(f) * Math.PI / 180); }
/** Quota dell'estradosso sopra il punto (la falda più alta che lo copre), o null. */
function roofHeightAt(L, x, y){ let h = null; for (const f of L.roof.falde || []) if (f.pts.length >= 3 && inPoly([x, y], f.pts)){ const v = faldaPlane(f.pts)(x, y); if (h === null || v > h) h = v; } return h; }
/** Solido di una falda: faccia superiore alle quote dei vertici, inferiore più bassa dello spessore, bordi verticali. */
function faldaGeo(f, e0, th){
  const P2 = f.pts.map(p => new THREE.Vector2(p[0], p[1])), cw = THREE.ShapeUtils.isClockWise(P2), tris = THREE.ShapeUtils.triangulateShape(P2, []);
  const pos = [], T = f.pts.map(p => new THREE.Vector3(p[0], e0 + p[2], p[1])), B = T.map(v => v.clone().setY(v.y - th));
  const push = (a, b, c, up) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)); if ((n.y > 0) !== up) [b, c] = [c, b]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
  for (const [i, j, k] of tris){ push(T[i], T[j], T[k], true); push(B[i], B[j], B[k], false); }
  for (let i = 0; i < T.length; i++){ const j = (i + 1) % T.length;
    // lato verso l'esterno del poligono: in pianta (x, z) la normale dipende dal verso del contorno
    const quad = cw ? [T[i], B[i], B[j], T[j]] : [T[i], T[j], B[j], B[i]];
    pos.push(...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(), ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray()); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
/** Copertura personalizzata nel modello: falde e, sui muri esterni, timpani fino all'intradosso delle falde. */
function buildCustomRoof(L, e0, add, opts){
  const falde = (L.roof.falde || []).filter(f => f.pts.length >= 3), th = roofTh(L), lid = "roof:" + L.id; if (!falde.length) return;
  for (const f of falde) add(lid, L.roof.mat, "roof", faldaGeo(f, e0, th));
  if (L.roof.noGable) return;
  const ws = wallsOf(L.id), RR = roofRects(L.id), H = L.height; if (!RR) return;
  const inside = (x, y) => RR.rects.some(r => x > r.x0 && x < r.x1 && y > r.z0 && y < r.z1);
  for (const w of ws){
    const f = wallFrame(w), t = Math.max(w.thick, opts.print ? opts.minThick || 0 : 0), m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], off = w.thick / 2 + .05;
    if (inside(m[0] + f.nx*off, m[1] + f.ny*off) && inside(m[0] - f.nx*off, m[1] - f.ny*off)) continue;   // muro interno
    const top = w.height || H, n = Math.max(2, Math.ceil(f.len / .1)), prof = [];
    for (let i = 0; i <= n; i++){ const s = f.len * i / n, x = w.a[0] + f.ux*s, y = w.a[1] + f.uy*s, h = roofUndersideAt(L, x, y, th); prof.push([s, h === null ? top : Math.max(top, h - .005)]); }
    if (prof.every(p => p[1] <= top + .01)) continue;
    const sh = new THREE.Shape([new THREE.Vector2(0, top), ...prof.map(p => new THREE.Vector2(p[0], p[1])), new THREE.Vector2(f.len, top)].filter((v, i, a) => i === 0 || v.distanceTo(a[i - 1]) > 1e-4));
    const g = new THREE.ExtrudeGeometry(sh, {depth:t, bevelEnabled:false}); g.translate(0, 0, -t / 2);
    g.rotateY(-Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0])); g.translate(w.a[0], e0, w.a[1]);
    add(lid, w.mat, "gable", g);
  }
}
/** Intradosso sopra il punto: per ogni falda che lo copre, la sua quota meno lo spessore misurato in verticale. */
function roofUndersideAt(L, x, y, th){ let h = null; for (const f of L.roof.falde || []) if (f.pts.length >= 3 && inPoly([x, y], f.pts)){ const v = faldaPlane(f.pts)(x, y) - th / Math.cos(Math.min(1.3, faldaPitch(f) * Math.PI / 180)); if (h === null || v > h) h = v; } return h; }
/** Superficie reale (inclinata) della copertura personalizzata, per il computo. */
function customRoofArea(L){ return (L.roof.falde || []).filter(f => f.pts.length >= 3).reduce((s, f) => s + faldaArea(f), 0); }

/* ---------- pannello ---------- */
function roofCustomHTML(L){
  const n = L.roof.falde?.length || 0;
  return `<div class="row">${F("lRoofTh", "Spessore falde (cm)", fmt(roofTh(L) * 100, 0), 'inputmode="decimal"')}<div class="f"><span class="lbl">Falde</span><div class="inp" style="font-family:var(--f-data)">${n} · ${fmt(customRoofArea(L))} m²</div></div></div>
    <label class="chk"><input type="checkbox" id="lRoofGable" ${L.roof.noGable ? "" : "checked"}> Muri esterni fino alle falde (timpani)</label>
    <div class="btns"><button class="btn primary" id="rfEdit">Modifica le falde in pianta</button><select id="rfFrom" class="inp" style="width:auto" aria-label="Ricrea le falde"><option value="">Ricrea da…</option><option value="gable">due falde</option><option value="hip">padiglione</option><option value="shed">una falda</option><option value="flat">piana</option></select></div>`;
}
function roofToolHTML(){
  const L = level();
  if (L.roof.type !== "custom") return `<div class="sec"><h3>Copertura</h3><p class="note">Scegli «Personalizzata» nel tipo di copertura del piano per modificarne le falde.</p></div>`;
  const s = RF.sel, f = s && L.roof.falde[s.f];
  let h = `<div class="sec" id="rfSec"><h3>Modifica copertura</h3>`;
  if (RF.drawing) h += `<p class="note">Clic sui vertici della nuova falda (agganciano muri e falde vicine). Clic sul primo punto o Invio per chiudere, Esc per annullare. Quota dei punti: ${fmt(L.height, 2)} m, poi la cambi.</p>`;
  else if (f && s.k != null){ const p = f.pts[s.k];
    h += `<p class="note">Falda ${s.f + 1}, punto ${s.k + 1}. I punti in comune con le altre falde si spostano insieme.</p>
      <div class="row3">${F("rfX", "x (m)", fmt(p[0], 2), 'inputmode="decimal"')}${F("rfY", "y (m)", fmt(p[1], 2), 'inputmode="decimal"')}${F("rfH", "Quota (m)", fmt(p[2], 2), 'inputmode="decimal" title="Estradosso sopra il pavimento del piano"')}</div>
      <div class="btns"><button class="btn" id="rfDelPt">Togli il punto</button><button class="btn danger" id="rfDelF">Elimina la falda</button></div>`; }
  else if (f){ h += `<p class="note">Falda ${s.f + 1}: ${f.pts.length} punti, ${fmt(faldaArea(f))} m², pendenza ${fmt(faldaPitch(f), 1)}°.</p>
      <div class="row">${F("rfPitch", "Pendenza °", fmt(faldaPitch(f), 1), 'inputmode="decimal" title="Ricalcola le quote: resta ferma la linea di gronda (il lato più basso)"')}${F("rfShift", "Alza/abbassa (m)", "0", 'inputmode="decimal"')}</div>
      <div class="btns"><button class="btn danger" id="rfDelF">Elimina la falda</button></div>`; }
  else h += `<p class="note">Clic su una falda per la pendenza, su un vertice per spostarlo o cambiarne la quota; doppio clic su un lato aggiunge un punto. ${L.roof.falde.length} falde.</p>`;
  h += `<div class="btns">${RF.drawing ? "" : `<button class="btn" id="rfNew">Nuova falda</button>`}<button class="btn primary" id="rfDone">Fine</button></div></div>`;
  return h;
}
P_.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const L = level();
  if (b.id === "rfEdit"){ RF.sel = null; RF.drawing = null; setTool("roof"); }
  if (b.id === "rfDone"){ RF.sel = null; RF.drawing = null; setTool("select"); }
  if (b.id === "rfNew"){ RF.sel = null; RF.drawing = []; renderInspector(); draw2D(); }
  if (b.id === "rfDelF" && RF.sel){ L.roof.falde.splice(RF.sel.f, 1); RF.sel = null; commit(); renderInspector(); }
  if (b.id === "rfDelPt" && RF.sel?.k != null){ const f = L.roof.falde[RF.sel.f]; if (f.pts.length <= 3){ toast("Una falda ha almeno tre punti: elimina la falda", true); return; } f.pts.splice(RF.sel.k, 1); RF.sel = {f:RF.sel.f}; commit(); renderInspector(); }
});
P_.addEventListener("change", e => { const t = e.target, L = level(), v = num(t.value); if (!L) return;
  if (t.id === "lRoofTh"){ if (v >= 5 && v <= 80){ L.roof.th = v / 100; commit(); } else { toast("Spessore delle falde tra 5 e 80 cm", true); renderInspector(); } }
  if (t.id === "lRoofGable"){ if (t.checked) delete L.roof.noGable; else L.roof.noGable = true; commit(); }
  if (t.id === "rfFrom" && t.value){ L.roof.falde = faldeAuto(L, t.value); RF.sel = null; commit(); renderInspector(); toast("Falde ricreate"); }
  const s = RF.sel, f = s && L.roof.falde?.[s.f]; if (!f) return;
  if (["rfX", "rfY", "rfH"].includes(t.id) && s.k != null){ if (v === null || (t.id === "rfH" && (v < -5 || v > 60))){ renderInspector(); return; }
    const p = f.pts[s.k], k = {rfX:0, rfY:1, rfH:2}[t.id]; for (const q of rfShared(L, p)) q[k] = v; commit(); renderInspector(); }
  if (t.id === "rfPitch"){ if (v === null || v < 0 || v > 75){ toast("Pendenza tra 0 e 75°", true); renderInspector(); return; } rfSetPitch(f, v); commit(); renderInspector(); }
  if (t.id === "rfShift" && v){ for (const p of f.pts) p[2] = +(p[2] + v).toFixed(3); commit(); renderInspector(); }
});
/** Punti di tutte le falde del piano che coincidono con p (si muovono insieme). */
function rfShared(L, p){ const out = []; for (const f of L.roof.falde) for (const q of f.pts) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3 && Math.abs(q[2] - p[2]) < 1e-3) out.push(q); return out.length ? out : [p]; }
/** Pendenza di una falda: ferma la gronda (il lato con la quota media più bassa), le quote crescono con la distanza da quella linea. */
function rfSetPitch(f, deg){
  const P2 = f.pts, n = P2.length; let best = 0, bh = Infinity; for (let i = 0; i < n; i++){ const j = (i + 1) % n, len = Math.hypot(P2[j][0] - P2[i][0], P2[j][1] - P2[i][1]), hh = (P2[i][2] + P2[j][2]) / 2; if (len > .05 && hh < bh - 1e-6){ bh = hh; best = i; } }
  const A = P2[best], Bp = P2[(best + 1) % n], dx = Bp[0] - A[0], dy = Bp[1] - A[1], L = Math.hypot(dx, dy), tn = Math.tan(deg * Math.PI / 180);
  const side = P2.reduce((s, p) => s + ((p[0] - A[0]) * dy - (p[1] - A[1]) * dx), 0) >= 0 ? 1 : -1;
  for (const p of P2){ const d = side * ((p[0] - A[0]) * dy - (p[1] - A[1]) * dx) / L; p[2] = +(bh + Math.max(0, d) * tn).toFixed(3); }
}

/* ---------- pianta: disegno e gesti dello strumento «roof» ---------- */
function drawRoof2D(g, pr){
  if (pr || S.tool !== "roof") return; const L = level(); if (L?.roof?.type !== "custom") return;
  g.save(); g.font = "11px " + (css("--f-data") || "monospace"); g.textAlign = "center"; g.textBaseline = "bottom";
  L.roof.falde.forEach((f, i) => { const sel = RF.sel?.f === i;
    g.beginPath(); f.pts.forEach((p, k) => { const s = toS(p); k ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }); g.closePath();
    g.fillStyle = sel ? "rgba(192,57,43,.22)" : "rgba(192,57,43,.08)"; g.fill(); g.strokeStyle = "#c0392b"; g.lineWidth = sel ? 2.2 : 1.2; g.stroke();
    const c = toS(polyCentroid(f.pts.map(p => [p[0], p[1]]))); g.fillStyle = "#c0392b"; g.fillText(`${fmt(faldaPitch(f), 0)}°`, c[0], c[1]); });
  const seen = new Set();
  L.roof.falde.forEach((f, i) => f.pts.forEach((p, k) => { const key = p.map(v => v.toFixed(3)).join(","), s = toS(p), on = RF.sel?.f === i && RF.sel.k === k;
    g.fillStyle = on ? "#c0392b" : "#fff"; g.strokeStyle = "#c0392b"; g.lineWidth = 1.5; g.beginPath(); g.arc(s[0], s[1], on ? 5.5 : 4, 0, 7); g.fill(); g.stroke();
    if (!seen.has(key)){ seen.add(key); g.fillStyle = C.ink || "#222"; g.fillText(fmt(p[2], 2), s[0], s[1] - 6); } }));
  if (RF.drawing){ const pts = [...RF.drawing, ...(S.hover ? [S.hover.p] : [])]; g.strokeStyle = "#c0392b"; g.setLineDash([5, 4]); g.beginPath(); pts.forEach((p, k) => { const s = toS(p); k ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); }); g.stroke(); g.setLineDash([]);
    for (const p of RF.drawing){ const s = toS(p); g.fillStyle = "#c0392b"; g.beginPath(); g.arc(s[0], s[1], 3.5, 0, 7); g.fill(); } }
  g.restore();
}
function rfHit(sp){
  const L = level(), r = HR(); let best = null;
  L.roof.falde.forEach((f, i) => f.pts.forEach((p, k) => { const s = toS(p), d = Math.hypot(s[0] - sp[0], s[1] - sp[1]); if (d < r && (!best || d < best.d)) best = {f:i, k, d}; }));
  if (best) return {f:best.f, k:best.k};
  const w = toW(...sp);
  for (let i = L.roof.falde.length - 1; i >= 0; i--){ const f = L.roof.falde[i];
    for (let k = 0; k < f.pts.length; k++){ const a = f.pts[k], b = f.pts[(k + 1) % f.pts.length], q = projOnSeg(w, a, b); if (q.d * V.s < 6) return {f:i, edge:k, t:q.t, p:w}; } }
  for (let i = L.roof.falde.length - 1; i >= 0; i--) if (inPoly(w, L.roof.falde[i].pts)) return {f:i};
  return null;
}
/** Aggancio dei punti della falda: vertici delle altre falde, poi quello della pianta (muri, griglia). */
function rfSnap(raw){ const L = level(), r = HR() / V.s; for (const f of L.roof.falde) for (const q of f.pts) if (Math.hypot(q[0] - raw[0], q[1] - raw[1]) < r) return [q[0], q[1]]; return snapPoint(raw).p; }
c2d.addEventListener("pointerdown", e => {
  if (S.tool !== "roof" || e.button !== 0 || spaceDown || level()?.roof?.type !== "custom") return;
  e.stopImmediatePropagation(); c2d.setPointerCapture(e.pointerId); const sp = evP(e), raw = toW(...sp), L = level();
  if (RF.drawing){ const p = rfSnap(raw), first = RF.drawing[0];
    if (first && RF.drawing.length >= 3 && Math.hypot(...toS(first).map((v, i) => v - toS(p)[i])) < HR()){ rfCloseDrawing(); return; }
    RF.drawing.push(p); draw2D(); renderInspector(); return; }
  const h = rfHit(sp);
  if (h?.edge != null && e.detail >= 2){ const f = L.roof.falde[h.f], a = f.pts[h.edge], b = f.pts[(h.edge + 1) % f.pts.length], p = [+(a[0] + (b[0] - a[0]) * h.t).toFixed(3), +(a[1] + (b[1] - a[1]) * h.t).toFixed(3), +(a[2] + (b[2] - a[2]) * h.t).toFixed(3)];
    f.pts.splice(h.edge + 1, 0, p); RF.sel = {f:h.f, k:h.edge + 1}; commit(); renderInspector(); return; }
  if (h?.k != null){ const p = L.roof.falde[h.f].pts[h.k]; RF.sel = {f:h.f, k:h.k}; RF.drag = {pts:rfShared(L, p), moved:false}; renderInspector(); draw2D(); return; }
  RF.sel = h ? {f:h.f} : null; RF.drag = null; renderInspector(); draw2D();
}, true);
c2d.addEventListener("pointermove", e => {
  if (S.tool !== "roof") return;
  if (RF.drag){ e.stopImmediatePropagation(); const p = rfSnap(toW(...evP(e))); for (const q of RF.drag.pts){ q[0] = +p[0].toFixed(3); q[1] = +p[1].toFixed(3); } RF.drag.moved = true; draw2D(); return; }
  if (RF.drawing){ S.hover = {p:rfSnap(toW(...evP(e)))}; draw2D(); }
}, true);
c2d.addEventListener("pointerup", e => { if (S.tool !== "roof" || !RF.drag) return; e.stopImmediatePropagation(); const moved = RF.drag.moved; RF.drag = null; if (moved){ commit(); renderInspector(); } }, true);
function rfCloseDrawing(){ const L = level(), pts = RF.drawing; RF.drawing = null; if (pts.length < 3){ draw2D(); renderInspector(); return; }
  L.roof.falde.push({pts:pts.map(p => [+p[0].toFixed(3), +p[1].toFixed(3), +L.height.toFixed(3)])}); RF.sel = {f:L.roof.falde.length - 1}; commit(); renderInspector(); draw2D(); }
document.addEventListener("keydown", e => {
  if (S.tool !== "roof" || e.target.closest?.("input,select,textarea")) return;
  if (e.key === "Escape"){ e.stopImmediatePropagation(); if (RF.drawing){ RF.drawing = null; renderInspector(); draw2D(); } else { RF.sel = null; setTool("select"); } }
  else if (e.key === "Enter" && RF.drawing){ e.stopImmediatePropagation(); rfCloseDrawing(); }
  else if ((e.key === "Delete" || e.key === "Backspace") && RF.sel){ e.stopImmediatePropagation(); e.preventDefault(); $("#" + (RF.sel.k != null ? "rfDelPt" : "rfDelF"))?.click(); }
}, true);
