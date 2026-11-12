/* ============================================================
   Fase 3 — Architettura: pennello dei materiali e lati dei muri,
   posa dei pavimenti, battiscopa, controsoffitti, luci artificiali,
   sole da luogo/data/ora, modelli di porte e finestre, oscuranti,
   scale e ringhiere parametriche, tetti a padiglione e a una falda
   ============================================================ */

/* ---------- materiali in più ---------- */
Object.assign(MATS, {
  piastrella_bianca:{nome:"Piastrella bianca 20×20", color:"#eeece6", rough:.3,  tex:"tiles",  size:.4},
  cotto:            {nome:"Cotto 30×30",             color:"#b0623f", rough:.8,  tex:"tiles",  size:.6},
  resina:           {nome:"Resina grigia",           color:"#9c9b97", rough:.35},
  cartongesso:      {nome:"Cartongesso",             color:"#f2f0ea", rough:.95, emissive:"#56534c"},
  persiana:         {nome:"Persiane verdi",          color:"#3f5a43", rough:.6,  tex:"planks", size:.4},
  lampadina:        {nome:"Lampadina accesa",        color:"#fff4dc", rough:.5,  emissive:"#ffe7b0", glow:2.5},
  ottone:           {nome:"Ottone",                  color:"#b8934a", rough:.3,  metal:1},
});
WALL_MATS.push("piastrella_bianca", "legno_chiaro");
FLOOR_MATS.push("cotto", "resina", "piastrella_bianca");
const BRUSH_MATS = [...new Set([...WALL_MATS, ...FLOOR_MATS, ...ROOF_MATS, "cartongesso", "bianco", "legno_scuro", "metallo_nero"])];
const SKIRT_MATS = ["bianco", "legno_chiaro", "legno_scuro", "marmo", "metallo_nero"];

/* ---------- lati dei muri ----------
   Il lato A è a sinistra percorrendo il muro dall'inizio alla fine (normale +n), il lato B a destra. */
function wallSkins(w){
  const out = [];
  for (const [k, side] of [["matA", 1], ["matB", -1]]) if (w[k] && w[k] !== w.mat) out.push({side, mat:w[k]});
  return out;
}
function wallSidesHTML(w){
  const one = (k, lbl) => `<div class="f"><span class="lbl">${lbl}</span><select class="inp" data-wside="${k}"><option value="">Come il muro</option>${BRUSH_MATS.map(m => `<option value="${m}" ${w[k] === m ? "selected" : ""}>${esc(matName(m))}</option>`).join("")}${projMatKeys().map(m => `<option value="${esc(m)}" ${w[k] === m ? "selected" : ""}>${esc(matName(m))}</option>`).join("")}</select></div>`;
  return `<div class="row">${one("matA", "Lato A (sinistra)")}${one("matB", "Lato B (destra)")}</div><p class="note">Una finitura diversa per lato: intonaco dentro e mattone fuori, piastrelle in bagno. Col pennello si dipinge un lato alla volta nel 3D.</p>`;
}

/* ---------- pennello e contagocce ---------- */
S.brush = S.brush || "intonaco";
function paintPanelHTML(){
  return `<div class="sec"><h3>Pennello dei materiali</h3>
    <p class="note">Scegli un materiale, poi clic su un muro, un pavimento, un soffitto, un battiscopa o una copertura. Nel 3D si dipinge <b>un lato del muro</b> alla volta, in pianta tutti e due. <b>Alt+clic</b> preleva il materiale.</p>
    <label class="chk"><input type="checkbox" id="paintPick" ${S.paintPick ? "checked" : ""}> Contagocce (preleva invece di dipingere)</label>
    <div class="f"><span class="lbl">Materiale attivo · ${esc(matName(S.brush))}</span></div>
    ${swatches(BRUSH_MATS, S.brush, "brush")}</div>`;
}
/* t = {kind:"wall", w, side(1|-1|0)} | {kind:"floor"|"ceiling"|"skirt", r} | {kind:"roof", L} */
function paintTarget(t, pick){
  const key = t.kind === "wall" ? (t.side > 0 ? "matA" : t.side < 0 ? "matB" : "mat") : null;
  if (pick){
    const m = t.kind === "wall" ? (t.w[key] || t.w.mat) : t.kind === "floor" ? t.r.mat : t.kind === "ceiling" ? (t.r.ceilMat || "soffitto") : t.kind === "skirt" ? (t.r.skirt?.mat || "bianco") : t.L.roof.mat;
    S.brush = m; S.paintPick = false; toast(`Preso: ${matName(m)}`); renderInspector(); return;
  }
  const m = S.brush;
  if (t.kind === "wall"){ if (key === "mat"){ t.w.mat = m; delete t.w.matA; delete t.w.matB; } else t.w[key] = m; }
  else if (t.kind === "floor") t.r.mat = m;
  else if (t.kind === "ceiling") t.r.ceilMat = m;
  else if (t.kind === "skirt") t.r.skirt = {...(t.r.skirt || {h:.08}), mat:m};
  else if (t.kind === "roof") t.L.roof.mat = m;
  commit();
}
function paint2D(raw, pick){
  const h = hitTest(raw); if (!h){ return; }
  if (h.type === "wall") paintTarget({kind:"wall", w:wallById(h.id), side:0}, pick);
  else if (h.type === "room") paintTarget({kind:"floor", r:P.rooms.find(r => r.id === h.id)}, pick);
  else toast("Il pennello dipinge muri, pavimenti, soffitti e coperture", true);
}
function paint3D(e){
  const hit = pick3D(e, true); if (!hit) return;
  const cat = hit.object.userData.cat, lid = hit.object.userData.level, p = [hit.point.x, hit.point.z];
  const pick = e.altKey || S.paintPick;
  if (cat === "wall"){
    const prev = S.level; S.level = lid; const h = hitTest(p); S.level = prev;
    const w = h?.type === "wall" ? wallById(h.id) : null; if (!w) return;
    const f = wallFrame(w), n = hit.face ? hit.face.normal : null, d = n ? n.x*f.nx + n.z*f.ny : 0;
    paintTarget({kind:"wall", w, side: d > .5 ? 1 : d < -.5 ? -1 : 0}, pick); return;
  }
  if (cat === "roof"){ const L = level(lid); if (L) paintTarget({kind:"roof", L}, pick); return; }
  if (cat === "floor" || cat === "ceiling" || cat === "skirt"){
    const r = P.rooms.find(r => r.level === lid && inPoly(p, r.pts)) || (cat === "skirt" ? nearestRoom(p, lid) : null); if (!r) return;
    paintTarget({kind:cat, r}, pick); return;
  }
  if (objOf3D(hit.object)) toast("Gli arredi hanno materiali propri: il pennello dipinge muri, pavimenti, soffitti e coperture", true);
}
function nearestRoom(p, lid){ let best = null, bd = .1; for (const r of P.rooms) if (r.level === lid) for (let i = 0; i < r.pts.length; i++){ const d = projOnSeg(p, r.pts[i], r.pts[(i+1) % r.pts.length]).d; if (d < bd){ bd = d; best = r; } } return best; }
(() => { let down = null;
  $("#pane3d").addEventListener("pointerdown", e => { if (S.tool === "paint" && e.target === c3d && e.button === 0) down = [e.clientX, e.clientY]; }, true);
  $("#pane3d").addEventListener("pointerup", e => { const d = down; down = null; if (!d || S.tool !== "paint") return; if (Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return; paint3D(e); }, true);
})();

/* ---------- posa del pavimento, battiscopa, controsoffitto ---------- */
/* coordinate UV dei piani orizzontali ruotate e traslate (posa diagonale, sfalsata) */
function floorUV(geo, size, tile){
  worldUV(geo, size);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, a = (tile.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), ox = tile.ox || 0, oy = tile.oy || 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(n.getY(i)) > .7){ const x = p.getX(i) - ox, z = p.getZ(i) - oy; uv.setXY(i, (x*c + z*s) / size, (-x*s + z*c) / size); }
  uv.needsUpdate = true; return geo;
}
function skirtGeos(r, L){
  const out = [], h = r.skirt.h || .08, e0 = L.elev, doors = P.openings.filter(o => o.type === "door" && wallById(o.wall)?.level === L.id);
  for (let i = 0; i < r.pts.length; i++){
    const p = r.pts[i], q = r.pts[(i+1) % r.pts.length], dx = q[0]-p[0], dy = q[1]-p[1], len = Math.hypot(dx, dy); if (len < .05) continue;
    const ux = dx/len, uy = dy/len; let nx = -uy, ny = ux; const mid = [(p[0]+q[0])/2, (p[1]+q[1])/2];
    if (!inPoly([mid[0] + nx*.05, mid[1] + ny*.05], r.pts)){ nx = -nx; ny = -ny; }
    const cuts = [];
    for (const o of doors){ const w = wallById(o.wall), A = ptOnWall(w, o.t - o.w/2), B = ptOnWall(w, o.t + o.w/2);
      const dist = P2 => Math.abs((P2[0]-p[0])*(-uy) + (P2[1]-p[1])*ux);
      if (dist(A) < w.thick/2 + .1 && dist(B) < w.thick/2 + .1){ const ta = (A[0]-p[0])*ux + (A[1]-p[1])*uy, tb = (B[0]-p[0])*ux + (B[1]-p[1])*uy; cuts.push([Math.min(ta, tb), Math.max(ta, tb)]); } }
    cuts.sort((a, b) => a[0] - b[0]); let cur = 0; const segs = [];
    for (const [a, b] of cuts){ if (b < 0 || a > len) continue; if (a > cur) segs.push([cur, a]); cur = Math.max(cur, b); } if (cur < len) segs.push([cur, len]);
    const rot = -Math.atan2(dy, dx);
    for (const [a, b] of segs){ if (b - a < .02) continue; const m = (a + b) / 2; out.push(boxGeo(p[0] + ux*m + nx*.006, e0 + h/2, p[1] + uy*m + ny*.006, b - a, h, .012, 0, rot, 0)); }
  }
  return out;
}
function roomExtraHTML(r){
  const L = level(r.level), t = r.tile || {}, sk = r.skirt;
  return `<details class="exp" ${r.tile || r.skirt || r.ceilH ? "open" : ""}><summary>Posa, battiscopa e soffitto</summary>
    <div class="row3">${F("rTileS", "Modulo ×", fmt(t.scale ?? 1, 2), 'inputmode="decimal" title="Scala del disegno del pavimento: 2 = piastrelle grandi il doppio"')}${F("rTileR", "Rotazione °", t.rot ?? 0, 'inputmode="decimal" title="45 = posa diagonale"')}${F("rTileO", "Sfalsa (m)", fmt(t.ox ?? 0, 2), 'inputmode="decimal" title="Sposta l\'origine della posa"')}</div>
    <label class="chk"><input type="checkbox" id="rSkirt" ${sk ? "checked" : ""}> Battiscopa</label>
    ${sk ? `<div class="row">${F("rSkirtH", "Altezza (m)", fmt(sk.h || .08, 2), 'inputmode="decimal"')}<div class="f"><span class="lbl">Materiale</span><select class="inp" id="rSkirtM">${SKIRT_MATS.map(m => `<option value="${m}" ${sk.mat === m ? "selected" : ""}>${esc(matName(m))}</option>`).join("")}</select></div></div>` : ""}
    <div class="row">${F("rCeilH", "Controsoffitto a (m)", r.ceilH ? fmt(r.ceilH) : "", `inputmode="decimal" placeholder="${fmt(L.height)} (nessuno)"`)}<div class="f"><span class="lbl">Soffitto</span><select class="inp" id="rCeilM">${["soffitto", "cartongesso", "legno_dogato", "legno_chiaro", "cemento"].map(m => `<option value="${m}" ${(r.ceilMat || "soffitto") === m ? "selected" : ""}>${esc(matName(m))}</option>`).join("")}</select></div></div>
    <div class="btns"><button class="btn" id="rApplyAll">Applica pavimento e battiscopa a tutto il piano</button></div></details>`;
}

/* ---------- luci artificiali ---------- */
function kelvinColor(k){ // approssimazione di Tanner Helland
  const t = clamp(k, 1500, 12000) / 100; let r, g, b;
  if (t <= 66){ r = 255; g = 99.47*Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52*Math.log(t - 10) - 305.04; }
  else { r = 329.7*Math.pow(t - 60, -.1332); g = 288.12*Math.pow(t - 60, -.0755); b = 255; }
  return new THREE.Color(clamp(r, 0, 255)/255, clamp(g, 0, 255)/255, clamp(b, 0, 255)/255);
}
function lightsOn(){ const m = P.lightsMode || "auto"; return m === "on" || (m === "auto" && P.sun.el < 14); }
function makeLamp(kind){
  const G = new THREE.Group(), M = getMat;
  const cyl = (x, y, z, rt, rb, h, mat, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(mat)); m.position.set(x, y, z); m.userData.wuv = true; G.add(m); return m; };
  const bulb = (x, y, z, r, lm) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), M("lampadina")); b.position.set(x, y, z); b.userData.bulb = true; b.castShadow = false; G.add(b);
    const l = new THREE.PointLight("#ffd9a8", 1, 7, 2); l.position.set(x, y - r*1.2, z); l.userData.lm = lm; G.add(l); return l; };
  if (kind === "faretto"){ cyl(0, -.006, 0, .05, .05, .012, "bianco", 28); cyl(0, -.012, 0, .035, .035, .004, "lampadina", 24).userData.bulb = true; const l = new THREE.PointLight("#ffd9a8", 1, 6, 2); l.position.set(0, -.08, 0); l.userData.lm = 500; G.add(l); }
  if (kind === "sospensione"){ cyl(0, -.04, 0, .05, .05, .02, "metallo_nero", 20); cyl(0, -.5, 0, .004, .004, .9, "metallo_nero", 6); const sh = new THREE.Mesh(new THREE.ConeGeometry(.22, .24, 36, 1, true), M("metallo_nero")); sh.position.y = -1.04; sh.material = M("metallo_nero"); G.add(sh); bulb(0, -1.1, 0, .045, 1200); }
  if (kind === "plafoniera"){ cyl(0, -.04, 0, .2, .22, .07, "bianco", 40); cyl(0, -.078, 0, .18, .18, .006, "lampadina", 40).userData.bulb = true; const l = new THREE.PointLight("#ffd9a8", 1, 8, 2); l.position.set(0, -.2, 0); l.userData.lm = 1600; G.add(l); }
  if (kind === "applique"){ const b = new THREE.Mesh(new THREE.BoxGeometry(.12, .2, .03), M("ottone")); b.position.set(0, 0, -.015 + .015); G.add(b); cyl(0, 0, .08, .07, .09, .14, "paralume", 28); bulb(0, 0, .08, .03, 400); }
  return G;
}
/* luci nei modelli: lampada da terra e comodino della libreria */
function lampFor(ref){ return {lampada:{y:1.5, lm:1000}, comodino:{y:.86, lm:300}}[ref] || null; }
function addLibLights(G, ref){ const f = lampFor(ref); if (!f) return G; const l = new THREE.PointLight("#ffd9a8", 1, 7, 2); l.position.set(0, f.y, 0); l.userData.lm = f.lm; G.add(l); return G; }
function objLights(o){ const t = objTemplate(o); let n = 0; t?.traverse(x => { if (x.isPointLight) n++; }); return n; }
/* applicato a ogni oggetto del modello 3D dopo la copia del modello di libreria */
function decorateObject3D(c, o){
  const on = lightsOn() && o.light?.on !== false, k = o.light?.k || 3000, col = kelvinColor(k);
  c.traverse(x => {
    if (x.isPointLight){ const lm = o.light?.lm ?? x.userData.lm ?? 800; x.visible = on; x.intensity = lm / 1000 * 2; x.distance = 4 + Math.sqrt(lm) / 7; x.color.copy(col); x.castShadow = false; }
    if (x.isMesh && x.userData.bulb) x.material = getMat(on ? "lampadina" : "ceramica");
  });
}
function lightHTML(o){
  if (!objLights(o)) return "";
  const L = o.light || {};
  return `<div class="sec"><h3>Luce</h3><label class="chk"><input type="checkbox" id="lgOn" ${L.on !== false ? "checked" : ""}> Accesa ${lightsOn() ? "" : "<small>(le luci sono spente: vedi «Luci artificiali» nella Vista 3D)</small>"}</label>
    <div class="row">${F("lgLm", "Flusso (lumen)", L.lm ?? (objTemplate(o)?.children.find(x => x.isPointLight)?.userData.lm || 800), 'inputmode="numeric"')}<div class="f"><span class="lbl">Colore</span><select id="lgK" class="inp">${[[2700, "Calda 2700 K"], [3000, "Calda 3000 K"], [4000, "Neutra 4000 K"], [5000, "Fredda 5000 K"]].map(([k, n]) => `<option value="${k}" ${(L.k || 3000) === k ? "selected" : ""}>${n}</option>`).join("")}</select></div></div></div>`;
}

/* ---------- sole da luogo, data e ora ---------- */
const CITTA = [["Bologna", 44.494, 11.343, 1], ["Milano", 45.464, 9.19, 1], ["Torino", 45.07, 7.686, 1], ["Venezia", 45.44, 12.316, 1], ["Firenze", 43.77, 11.255, 1], ["Roma", 41.9, 12.496, 1],
  ["Napoli", 40.852, 14.268, 1], ["Bari", 41.117, 16.871, 1], ["Palermo", 38.116, 13.361, 1], ["Cagliari", 39.223, 9.122, 1], ["Tenerife", 28.291, -16.629, 0], ["Madrid", 40.417, -3.704, 1], ["Parigi", 48.857, 2.352, 1], ["Londra", 51.507, -.128, 0], ["Berlino", 52.52, 13.405, 1]];
function siteDefaults(){ return {auto:false, city:"Bologna", lat:44.494, lon:11.343, tz:1, dst:true, north:0, date:"2026-06-21", hour:16}; }
/* posizione del sole (algoritmo NOAA semplificato, errore ~0,5°): az da nord in senso orario, el sull'orizzonte */
function solarPos(lat, lon, ms){
  const rad = Math.PI / 180, n = ms / 86400000 + 2440587.5 - 2451545.0;
  const Lm = (280.46 + .9856474*n) % 360, g = ((357.528 + .9856003*n) % 360) * rad;
  const lam = (Lm + 1.915*Math.sin(g) + .02*Math.sin(2*g)) * rad, eps = (23.439 - .0000004*n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = ((18.697374558 + 24.06570982441908*n) % 24 + 24) % 24, H = (gmst*15 + lon) * rad - ra, la = lat * rad;
  const el = Math.asin(Math.sin(la)*Math.sin(dec) + Math.cos(la)*Math.cos(dec)*Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec)*Math.cos(la) - Math.sin(la)*Math.cos(H));
  return {az:(az / rad + 360) % 360, el:el / rad};
}
/* ora legale europea: dall'ultima domenica di marzo all'ultima di ottobre, alle 01:00 UTC */
function euDST(y, ms){ const last = m => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1); }; return ms >= last(2) && ms < last(9); }
function siteSun(s){
  const [y, m, d] = (s.date || "2026-06-21").split("-").map(Number), hh = Math.floor(s.hour), mm = Math.round((s.hour - hh) * 60);
  let ms = Date.UTC(y, m - 1, d, hh, mm) - s.tz * 3600e3; if (s.dst && euDST(y, ms)) ms -= 3600e3;
  const sp = solarPos(s.lat, s.lon, ms); return {az:((sp.az + (s.north || 0)) % 360 + 360) % 360, el:sp.el, trueAz:sp.az};
}
function applySite(){ const s = P.site; if (!s?.auto) return; const r = siteSun(s); P.sun.az = +r.az.toFixed(1); P.sun.el = +r.el.toFixed(1); }
const hhmm = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
function sunHTML(){
  const s = P.site || siteDefaults(), auto = !!s.auto, lm = P.lightsMode || "auto";
  const common = `<div class="row"><div class="f"><span class="lbl">Luci artificiali</span><select id="lightsMode" class="inp"><option value="auto" ${lm === "auto" ? "selected" : ""}>Accese al tramonto e di notte</option><option value="on" ${lm === "on" ? "selected" : ""}>Sempre accese</option><option value="off" ${lm === "off" ? "selected" : ""}>Spente</option></select></div>${F("northDeg", "Nord (° dall'alto della pianta)", s.north || 0, 'inputmode="decimal"')}</div>`;
  if (!auto) return `<div class="f"><span class="lbl">Sole</span><div class="seg"><button data-sunmode="0" aria-pressed="true">Manuale</button><button data-sunmode="1" aria-pressed="false">Da luogo, data e ora</button></div></div>
      <div class="f"><label class="lbl" for="sAz">Orientamento sole · ${Math.round(P.sun.az)}°</label><input type="range" id="sAz" min="0" max="360" value="${P.sun.az}"></div>
      <div class="f"><label class="lbl" for="sEl">Altezza sole · ${Math.round(P.sun.el)}°</label><input type="range" id="sEl" min="3" max="80" value="${P.sun.el}"></div>${common}`;
  const r = siteSun(s);
  return `<div class="f"><span class="lbl">Sole</span><div class="seg"><button data-sunmode="0" aria-pressed="false">Manuale</button><button data-sunmode="1" aria-pressed="true">Da luogo, data e ora</button></div></div>
    <div class="row"><div class="f"><span class="lbl">Luogo</span><select id="siteCity" class="inp"><option value="">Coordinate…</option>${CITTA.map(c => `<option ${s.city === c[0] ? "selected" : ""}>${c[0]}</option>`).join("")}</select></div><div class="f"><label class="lbl" for="siteDate">Data</label><input type="date" id="siteDate" class="inp" value="${esc(s.date)}"></div></div>
    <div class="row3">${F("siteLat", "Latitudine", s.lat, 'inputmode="decimal"')}${F("siteLon", "Longitudine", s.lon, 'inputmode="decimal"')}${F("siteTz", "Fuso (UTC+)", s.tz, 'inputmode="decimal"')}</div>
    <label class="chk"><input type="checkbox" id="siteDst" ${s.dst ? "checked" : ""}> Ora legale europea automatica</label>
    <div class="f"><label class="lbl" for="siteHour" id="siteHourLbl">Ora · ${hhmm(s.hour)} — sole a ${Math.round(r.trueAz)}° da nord, alto ${Math.round(r.el)}°${r.el < 0 ? " (notte)" : ""}</label><input type="range" id="siteHour" min="0" max="23.75" step="0.25" value="${s.hour}"></div>${common}`;
}
/* notte: niente sole né riflessi del cielo, solo luci artificiali */
function nightCheck(){
  const night = P.sun.el < 0; sun.visible = !night;
  const lo = lightsOn(); if (S.lightsWereOn !== undefined && lo !== S.lightsWereOn) rebuild3D(); S.lightsWereOn = lo;
  if (night){ scene.environment = null; scene.background = new THREE.Color("#0b1320"); hemi.intensity = .05; S.night = true; }
  else if (S.night){ S.night = false; applySky(); }
}

/* ---------- porte e finestre: modelli e oscuranti ---------- */
const DOOR_STYLES = [["battente", "A battente"], ["doppia", "A due ante"], ["vetrata", "A vetro"], ["portafinestra", "Portafinestra a due ante"], ["scorrevole", "Scorrevole esterna al muro"], ["scomparsa", "A scomparsa nel muro"], ["basculante", "Basculante (garage)"]];
const WIN_STYLES = [["battente", "A battente"], ["vasistas", "Vasistas"], ["scorrevole", "Scorrevole"], ["fissa", "Fissa"]];
const SHUTTERS = [["", "Nessuno"], ["persiane", "Persiane"], ["tapparella", "Tapparella"]];
/* da che parte del muro sta l'esterno: il lato dove non c'è un locale */
function extSide(w, o){
  const t = o ? o.t : wallFrame(w).len / 2, rs = P.rooms.filter(r => r.level === w.level);
  const inside = sg => { const q = ptOnWall(w, t, sg * (w.thick/2 + .25)); return rs.some(r => inPoly(q, r.pts)); };
  const a = inside(1), b = inside(-1); let s = a && !b ? -1 : 1;
  if (o && (o.flip & 4)) s = -s; return s;
}
function styleOptions(list, cur){ return list.map(([k, n]) => `<option value="${k}" ${(cur || list[0][0]) === k ? "selected" : ""}>${n}</option>`).join(""); }
function openingExtraHTML(o){
  if (o.type === "door") return `<div class="row"><div class="f"><span class="lbl">Modello</span><select id="oStyle" class="inp">${styleOptions(DOOR_STYLES, o.style)}</select></div><div></div></div>`;
  return `<div class="row"><div class="f"><span class="lbl">Modello</span><select id="oStyle" class="inp">${styleOptions(WIN_STYLES, o.style)}</select></div><div class="f"><span class="lbl">Oscurante</span><select id="oShut" class="inp">${styleOptions(SHUTTERS, o.shut || "")}</select></div></div>
    ${o.shut ? `<div class="btns"><button class="btn" id="oExt">Oscurante sull'altro lato</button></div>` : ""}`;
}
function openingDefaultsHTML(){
  const d = S.tool === "door" ? S.defaults.door : S.defaults.win;
  return `<div class="row"><div class="f"><span class="lbl">Modello</span><select id="dOstyle" class="inp">${styleOptions(S.tool === "door" ? DOOR_STYLES : WIN_STYLES, d.style)}</select></div>${S.tool === "window" ? `<div class="f"><span class="lbl">Oscurante</span><select id="dOshut" class="inp">${styleOptions(SHUTTERS, d.shut || "")}</select></div>` : "<div></div>"}</div>`;
}
/* porta a battente in 3D: l'anta sta a filo del lato verso cui apre (flip & 2) e la maniglia
   sta dal lato opposto alla cerniera (flip & 1), come l'arco in pianta: «Specchia» si vede anche qui */
function doorOff(o, fd){ return ((o.flip & 2) ? -1 : 1) * Math.max(0, (fd - .045) / 2); }
function doorHandle(o, piece, s0, s1, e0, fd){
  const lo = doorOff(o, fd), hingeAtS0 = !(o.flip & 1), hs = hingeAtS0 ? s1 - .12 : s0 + .12, lever = hingeAtS0 ? [hs - .13, hs + .015] : [hs - .015, hs + .13];
  for (const sg of [-1, 1]){
    piece(hs - .025, hs + .025, e0 + .95, e0 + 1.1, .012, "metallo", "frame", lo + sg * (.0225 + .006));      // placca
    piece(lever[0], lever[1], e0 + 1.0, e0 + 1.025, .022, "metallo", "frame", lo + sg * (.0225 + .045));     // leva
    piece(hs - .012, hs + .012, e0 + 1.0, e0 + 1.025, .045, "metallo", "frame", lo + sg * (.0225 + .022));    // perno
  }
}
/* riempimento 3D del vano: telai, ante, vetri, oscuranti. piece(s0,s1,y0,y1,spessore,mat,cat,offset) */
function buildOpeningFill(w, c, piece, e0, bot, topO, t){
  const o = c.o, fd = Math.min(.09, t*.8), s0 = c.s0, s1 = c.s1, y0 = e0 + bot, y1 = e0 + topO, W = s1 - s0, mid = (s0 + s1) / 2, ext = extSide(w, o);
  const sash = (a, b, ya, yb, off = 0, d = fd, fw = .06) => { // anta con vetro
    piece(a, a + fw, ya, yb, d, "serramento", "frame", off); piece(b - fw, b, ya, yb, d, "serramento", "frame", off);
    piece(a + fw, b - fw, ya, ya + fw, d, "serramento", "frame", off); piece(a + fw, b - fw, yb - fw, yb, d, "serramento", "frame", off);
    piece(a + fw, b - fw, ya + fw, yb - fw, .02, "vetro", "glass", off);
  };
  if (o.type === "window"){
    const st = o.style || "battente";
    if (st === "scorrevole"){ piece(s0, s0 + .04, y0, y1, fd, "serramento", "frame"); piece(s1 - .04, s1, y0, y1, fd, "serramento", "frame"); sash(s0 + .02, mid + .03, y0, y1, -.022, .035); sash(mid - .03, s1 - .02, y0, y1, .022, .035); }
    else if (st === "fissa"){ sash(s0, s1, y0, y1, 0, fd, .05); }
    else { sash(s0, s1, y0, y1); if (st !== "vasistas" && W > 1.3) piece(mid - .03, mid + .03, y0 + .06, y1 - .06, fd, "serramento", "frame"); if (st === "vasistas") piece(mid - .08, mid + .08, y1 - .1, y1 - .08, .02, "metallo", "frame", fd/2 * -ext); }
    if (bot > .05) piece(s0 - .03, s1 + .03, y0 - .04, y0, t + .06, "marmo", "sill");
    if (o.shut === "persiane"){ const off = ext * (t/2 + .025); piece(s0 - W/2, s0 - .01, y0, y1, .03, "persiana", "frame", off); piece(s1 + .01, s1 + W/2, y0, y1, .03, "persiana", "frame", off); }
    if (o.shut === "tapparella"){ const off = ext * (t/2 - .03); piece(s0, s1, y1 - (y1 - y0) * .3, y1, .02, "laccato_gr", "frame", off); }
    return;
  }
  const st = o.style || "battente";
  const jambs = () => { piece(s0, s0 + .05, e0, y1, fd, "serramento", "frame"); piece(s1 - .05, s1, e0, y1, fd, "serramento", "frame"); piece(s0 + .05, s1 - .05, y1 - .05, y1, fd, "serramento", "frame"); };
  if (st === "doppia"){ jambs(); piece(s0 + .05, mid - .003, e0 + .01, y1 - .05, .045, "legno", "door"); piece(mid + .003, s1 - .05, e0 + .01, y1 - .05, .045, "legno", "door"); }
  else if (st === "vetrata"){ jambs(); sash(s0 + .05, s1 - .05, e0 + .01, y1 - .05, doorOff(o, fd), .045, .08); doorHandle(o, piece, s0, s1, e0, fd); }
  else if (st === "portafinestra"){ jambs(); sash(s0 + .05, mid, e0 + .01, y1 - .05, 0, .05, .07); sash(mid, s1 - .05, e0 + .01, y1 - .05, 0, .05, .07); }
  else if (st === "scorrevole"){ const off = -ext * (t/2 + .03), sh = W * .55; piece(s0 - .02, s1 + W + .05, y1 + .02, y1 + .07, .04, "metallo_nero", "frame", off); piece(s0 - .03 + sh, s1 + .03 + sh, e0 + .01, y1 + .02, .04, "legno", "door", off); piece(s0, s1, y1 - .04, y1, .02, "serramento", "frame"); }
  else if (st === "scomparsa"){ jambs(); piece(s0 + .05, s0 + .05 + W * .2, e0 + .01, y1 - .05, .04, "legno", "door"); }
  else if (st === "basculante"){ piece(s0, s1, e0 + .01, y1, .05, "lamiera", "door", ext * (t/2 - .04)); }
  else { jambs(); piece(s0 + .05, s1 - .05, e0 + .01, y1 - .05, .045, "legno", "door", doorOff(o, fd)); doorHandle(o, piece, s0, s1, e0, fd); }
}
/* simboli di pianta. Restituisce true se ha disegnato */
function drawOpeningStyle(g, w, c){
  const o = c.o, st = o.style, h = w.thick/2, Lp = (s, off) => toS(ptOnWall(w, s, off)), line = (a, b) => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
  if (o.type === "window"){
    if (!st || st === "battente" || st === "vasistas"){ if (!o.shut) return false; }
    g.beginPath();
    if (st === "fissa"){ for (const off of [-h, 0, h]) line(Lp(c.s0, off), Lp(c.s1, off)); }
    else if (st === "scorrevole"){ const m = (c.s0 + c.s1)/2; for (const off of [-h, h]) line(Lp(c.s0, off), Lp(c.s1, off)); line(Lp(c.s0, -h/4), Lp(m + .05, -h/4)); line(Lp(m - .05, h/4), Lp(c.s1, h/4)); }
    else for (const off of [-h, -h/4, h/4, h]) line(Lp(c.s0, off), Lp(c.s1, off));
    g.stroke();
    if (o.shut === "persiane"){ const e = extSide(w, o), W = c.s1 - c.s0; g.beginPath(); line(Lp(c.s0, e*h), Lp(c.s0 - W/2, e*(h + .04))); line(Lp(c.s1, e*h), Lp(c.s1 + W/2, e*(h + .04))); g.stroke(); }
    return true;
  }
  if (!st || st === "battente" || st === "vetrata") return false;
  const ext = extSide(w, o), f = wallFrame(w), W = c.s1 - c.s0, side = (o.flip & 2) ? -1 : 1;
  const arc = (hingeS, toS2, r, sd) => { const H = ptOnWall(w, hingeS, sd*h), O = [H[0] + f.nx*sd*r, H[1] + f.ny*sd*r], Hs = toS(H), Os = toS(O), E = toS(ptOnWall(w, toS2, sd*h));
    g.beginPath(); line(Hs, Os); g.stroke(); const a1 = Math.atan2(Os[1]-Hs[1], Os[0]-Hs[0]), a2 = Math.atan2(E[1]-Hs[1], E[0]-Hs[0]); let d = a2 - a1; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI;
    g.setLineDash([3, 3]); g.beginPath(); g.arc(Hs[0], Hs[1], r*V.s, a1, a2, d < 0); g.stroke(); g.setLineDash([]); };
  const m = (c.s0 + c.s1)/2;
  if (st === "doppia" || st === "portafinestra"){ arc(c.s0, m, W/2, side); arc(c.s1, m, W/2, side); return true; }
  if (st === "scorrevole"){ const off = -ext*(h + .04); g.beginPath(); line(Lp(c.s0 + W*.55, off), Lp(c.s1 + W*.55, off)); line(Lp(c.s0, -ext*(h + .08)), Lp(c.s1 + W, -ext*(h + .08))); g.stroke(); return true; }
  if (st === "scomparsa"){ g.setLineDash([4, 3]); g.beginPath(); line(Lp(c.s0 - W*.8, 0), Lp(c.s0 + W*.2, 0)); g.stroke(); g.setLineDash([]); return true; }
  if (st === "basculante"){ g.setLineDash([5, 4]); g.beginPath(); const d = -ext*(h + Math.min(2.2, o.h*.9)); const q = [Lp(c.s0, -ext*h), Lp(c.s0, d), Lp(c.s1, d), Lp(c.s1, -ext*h)]; g.moveTo(q[0][0], q[0][1]); for (const x of q.slice(1)) g.lineTo(x[0], x[1]); g.stroke(); g.setLineDash([]); return true; }
  return false;
}

/* ---------- scale e ringhiere parametriche ---------- */
function slopePanel(G, a, b, h, th, mat){ // pannello verticale da a a b (punti in basso), alto h, spessore th
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1e-6, dy = b.y - a.y;
  const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, dy), new THREE.Vector2(L, dy + h), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(sh, {depth:th, bevelEnabled:false}); geo.translate(0, 0, -th/2); geo.rotateY(Math.atan2(-dz, dx)); geo.translate(a.x, a.y, a.z);
  const m = new THREE.Mesh(geo, getMat(mat)); m.userData.wuv = true; G.add(m); return m;
}
function sbox(G, x, y, z, lx, ly, lz, mat, ry = 0){ const m = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, lz), getMat(mat)); m.position.set(x, y, z); m.rotation.y = ry; m.userData.wuv = true; G.add(m); return m; }
/* rampa: parte da (x0,z0) a quota y0 verso (dx,dz), k gradini di alzata r e pedata d, larghezza w */
function flight(G, plan, P0, k, r, d, w, p, rails){
  const {x, z, y, dx, dz} = P0, sx = -dz, sz = dx, V3 = (u, v, yy) => new THREE.Vector3(x + dx*u + sx*v, yy, z + dz*u + sz*v);
  for (let i = 0; i < k; i++){ const u = (i + .5) * d, top = y + (i + 1) * r;
    sbox(G, x + dx*u, top - .025, z + dz*u, Math.abs(dx) ? d + .02 : w, .05, Math.abs(dx) ? w : d + .02, p.mat);
    const c = [V3(i*d, -w/2), V3((i+1)*d, -w/2), V3((i+1)*d, w/2), V3(i*d, w/2)]; plan.polys.push(c.map(q => [q.x, q.z])); }
  if (!k) return;
  const run = k * d, rise = k * r;
  for (const sg of [-1, 1]) slopePanel(G, V3(-.02, sg*(w/2 - .025), y - .22), V3(run, sg*(w/2 - .025), y + rise - .22 + r*0), .27, .04, p.struct || "metallo_nero");
  for (const sg of rails){ const v = sg*(w/2 - .02);
    slopePanel(G, V3(0, v, y + r + .86), V3(run, v, y + rise + .86), .045, .05, p.struct || "metallo_nero");
    if (p.railType === "vetro") slopePanel(G, V3(.05, v, y + r + .08), V3(run - .05, v, y + rise + .08), .76, .012, "vetro");
    const nP = Math.max(2, Math.ceil(run / 1.1) + 1);
    for (let j = 0; j < nP; j++){ const u = .1 + (run - .2) * j / (nP - 1), i = Math.min(k - 1, Math.floor(u / d)), top = y + (i + 1) * r, q = V3(u, v, 0);
      sbox(G, q.x, top + .45, q.z, .03, .9, .03, p.struct || "metallo_nero");
      if (p.railType !== "vetro") for (let b2 = 1; b2 < 6 && j < nP - 1; b2++){ const u2 = u + (run - .2) / (nP - 1) * b2 / 6, i2 = Math.min(k - 1, Math.floor(u2 / d)), t2 = y + (i2 + 1) * r, q2 = V3(u2, v, 0); sbox(G, q2.x, t2 + .44, q2.z, .015, .84, .015, p.struct || "metallo_nero"); } }
  }
}
function railSides(p, turnSign){ const r = p.rail || "entrambi"; return r === "nessuno" ? [] : r === "entrambi" ? [-1, 1] : r === "sinistra" ? [-turnSign || -1] : [turnSign || 1]; }
function makeStair(p){
  const G = new THREE.Group(), plan = {polys:[], arrow:[]}, H = p.H || 3, n = Math.max(3, Math.round(p.n || H / .18)), r = H / n, d = p.tread || .28, w = p.w || 1, turn = p.turn === "sinistra" ? -1 : 1;
  if (p.shape === "chiocciola"){
    const R = (p.d || 1.6) / 2, a = Math.PI * 2 / 13, sgn = turn;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, H + .9, 16), getMat(p.struct || "metallo_nero")); col.position.y = (H + .9) / 2; G.add(col);
    const pts = [];
    for (let i = 0; i < n; i++){ const a0 = sgn * i * a, a1 = sgn * (i + 1.08) * a, sh = new THREE.Shape(); const segs = 8;
      sh.moveTo(Math.cos(a0)*.05, Math.sin(a0)*.05); for (let j = 0; j <= segs; j++){ const t = a0 + (a1 - a0) * j / segs; sh.lineTo(Math.cos(t)*R, Math.sin(t)*R); } sh.lineTo(Math.cos(a1)*.05, Math.sin(a1)*.05);
      const g = new THREE.ExtrudeGeometry(sh, {depth:.05, bevelEnabled:false}); g.rotateX(Math.PI/2); g.translate(0, (i + 1) * r, 0); const m = new THREE.Mesh(g, getMat(p.mat)); m.userData.wuv = true; G.add(m);
      const poly = []; for (let j = 0; j <= segs; j++){ const t = a0 + (a1 - a0) * j / segs; poly.push([Math.cos(t)*R, Math.sin(t)*R]); } poly.push([Math.cos(a1)*.06, Math.sin(a1)*.06], [Math.cos(a0)*.06, Math.sin(a0)*.06]); plan.polys.push(poly);
      const am = (a0 + a1) / 2; if (p.rail !== "nessuno"){ const px = Math.cos(am)*(R - .04), pz = Math.sin(am)*(R - .04); sbox(G, px, (i + 1) * r + .45, pz, .02, .9, .02, p.struct || "metallo_nero"); pts.push(new THREE.Vector3(px, (i + 1) * r + .92, pz)); }
      plan.arrow.push([Math.cos(am)*R*.6, Math.sin(am)*R*.6]); }
    if (pts.length > 2){ const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 6, .022, 8, false), getMat(p.struct || "metallo_nero")); G.add(tube); }
  } else {
    if (p.shape === "L" || p.shape === "U"){
      const n1 = Math.ceil(n / 2), k1 = n1 - 1, k2 = n - n1, gap = .08, run1 = k1 * d;
      flight(G, plan, {x:0, z:0, y:0, dx:0, dz:-1}, k1, r, d, w, p, railSides(p, turn));
      const yl = n1 * r;
      if (p.shape === "L"){
        sbox(G, 0, yl - .025, -run1 - w/2, w, .05, w, p.mat); plan.polys.push([[-w/2, -run1], [w/2, -run1], [w/2, -run1 - w], [-w/2, -run1 - w]]);
        flight(G, plan, {x:turn*w/2, z:-run1 - w/2, y:yl, dx:turn, dz:0}, k2, r, d, w, p, railSides(p, -turn).map(s => s));
        plan.arrow.push([0, -.1], [0, -run1 - w/2], [turn*(w/2 + k2*d - .1), -run1 - w/2]);
      } else {
        const LW = 2*w + gap, cx = turn*(w + gap)/2; sbox(G, cx, yl - .025, -run1 - w/2, LW, .05, w, p.mat);
        plan.polys.push([[cx - LW/2, -run1], [cx + LW/2, -run1], [cx + LW/2, -run1 - w], [cx - LW/2, -run1 - w]]);
        flight(G, plan, {x:turn*(w + gap), z:-run1, y:yl, dx:0, dz:1}, k2, r, d, w, p, railSides(p, turn));
        plan.arrow.push([0, -.1], [0, -run1 - w/2], [turn*(w + gap), -run1 - w/2], [turn*(w + gap), -run1 + k2*d - .1]);
      }
    } else {
      flight(G, plan, {x:0, z:0, y:0, dx:0, dz:-1}, n, r, d, w, p, railSides(p, 1));
      plan.arrow.push([0, -.1], [0, -n*d + .1]);
    }
  }
  // centra la pianta del modello sull'origine
  const b = new THREE.Box3().setFromObject(G), cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  G.children.forEach(c => { c.position.x -= cx; c.position.z -= cz; });
  plan.polys = plan.polys.map(pl => pl.map(q => [q[0] - cx, q[1] - cz])); plan.arrow = plan.arrow.map(q => [q[0] - cx, q[1] - cz]);
  G.userData.plan = plan; G.userData.stair = true; return G;
}
function makeRail(p){
  const G = new THREE.Group(), L = p.len || 2, h = p.h || 1, m = p.struct || "metallo_nero", t = p.railType || "montanti";
  if (t === "piena"){ sbox(G, 0, h/2, 0, L, h, .15, p.mat || "intonaco"); sbox(G, 0, h + .02, 0, L + .02, .04, .2, "marmo"); }
  else {
    sbox(G, 0, h - .025, 0, L, .05, .05, m);
    const nP = Math.max(2, Math.ceil(L / 1.2) + 1); for (let i = 0; i < nP; i++) sbox(G, -L/2 + .02 + (L - .04) * i / (nP - 1), (h - .05) / 2, 0, .04, h - .05, .04, m);
    if (t === "vetro") sbox(G, 0, (h - .05) / 2 + .02, 0, L - .06, h - .12, .012, "vetro");
    else { sbox(G, 0, .1, 0, L, .03, .03, m); const nb = Math.floor(L / .11); for (let i = 1; i < nb; i++) sbox(G, -L/2 + i * L / nb, (h - .05 + .1) / 2, 0, .015, h - .15, .015, m); }
  }
  G.userData.plan = {polys:[[[-L/2, -.04], [L/2, -.04], [L/2, .04], [-L/2, .04]]], arrow:[]}; return G;
}
const PARAM_LIB = [
  {cat:"Scale", ref:"scala_dritta", nome:"Scala a una rampa", dim:"parametrica", param:{kind:"stair", defaults:{shape:"dritta", w:1, tread:.28, rail:"entrambi", railType:"montanti", mat:"legno_chiaro", struct:"metallo_nero"}}},
  {cat:"Scale", ref:"scala_l", nome:"Scala a L con pianerottolo", dim:"parametrica", param:{kind:"stair", defaults:{shape:"L", w:1, tread:.28, rail:"entrambi", railType:"vetro", mat:"legno_chiaro", struct:"metallo_nero", turn:"destra"}}},
  {cat:"Scale", ref:"scala_u", nome:"Scala a U con pianerottolo", dim:"parametrica", param:{kind:"stair", defaults:{shape:"U", w:1, tread:.28, rail:"entrambi", railType:"montanti", mat:"cemento", struct:"metallo_nero", turn:"destra"}}},
  {cat:"Scale", ref:"scala_chiocciola", nome:"Scala a chiocciola", dim:"Ø 160", param:{kind:"stair", defaults:{shape:"chiocciola", d:1.6, rail:"esterno", mat:"metallo", struct:"metallo_nero", turn:"destra"}}},
  {cat:"Scale", ref:"ringhiera", nome:"Ringhiera / parapetto", dim:"parametrica", param:{kind:"rail", defaults:{len:2, h:1, railType:"montanti", struct:"metallo_nero"}}},
  {cat:"Luci", ref:"faretto", nome:"Faretto a incasso", dim:"Ø 10", mount:"ceiling", build:()=>makeLamp("faretto")},
  {cat:"Luci", ref:"sospensione", nome:"Lampada a sospensione", dim:"Ø 44", mount:"ceiling", build:()=>makeLamp("sospensione")},
  {cat:"Luci", ref:"plafoniera", nome:"Plafoniera", dim:"Ø 44", mount:"ceiling", build:()=>makeLamp("plafoniera")},
  {cat:"Luci", ref:"applique", nome:"Applique da parete", dim:"h 180", mount:"wall", build:()=>makeLamp("applique")},
];
for (const it of PARAM_LIB){ if (it.param) it.build = p => it.param.kind === "rail" ? makeRail(p) : makeStair(p); LIB.push(it); LIBMAP[it.ref] = it; }
LIB_CATS = [...new Set(LIB.map(x => x.cat))];
function paramsOf(o, it){ return {...it.param.defaults, ...(it.param.kind === "stair" ? {H:3} : {}), ...(o.p || {})}; }
/* quota del soffitto (o del controsoffitto) nel punto p */
function ceilingAt(p, lid){ const L = level(lid), r = P.rooms.find(r => r.level === lid && inPoly(p, r.pts)); return r?.ceilH || L.height; }
function nextLevelAbove(L){ return P.levels.filter(l => l.elev > L.elev + .01).sort((a, b) => a.elev - b.elev)[0] || null; }
function initPlacedObject(o, it){
  if (!it) return; const L = level(o.level);
  if (it.mount === "ceiling") o.z = +ceilingAt([o.x, o.y], o.level).toFixed(3);
  if (it.mount === "wall") o.z = 1.8;
  if (it.param?.kind === "stair"){ const U = nextLevelAbove(L), H = +(U ? U.elev - L.elev : L.height + L.slab).toFixed(3); o.p = {H, n:Math.round(H / .18)}; if (it.param.defaults.shape === "chiocciola") o.p.n = Math.round(H / .2); }
  if (it.param?.kind === "rail") o.p = {len:2};
}
function paramHTML(o, it){
  const p = paramsOf(o, it), F2 = (k, lbl, v, extra = 'inputmode="decimal"') => `<div class="f"><label class="lbl">${lbl}</label><input class="inp" data-pp="${k}" value="${esc(v)}" ${extra}></div>`;
  const sel = (k, lbl, opts) => `<div class="f"><span class="lbl">${lbl}</span><select class="inp" data-pp="${k}">${opts.map(([v, n]) => `<option value="${v}" ${String(p[k]) === String(v) ? "selected" : ""}>${n}</option>`).join("")}</select></div>`;
  const rails = [["montanti", "Montanti"], ["vetro", "Vetro"]];
  if (it.param.kind === "rail") return `<div class="sec"><h3>Ringhiera</h3><div class="row3">${F2("len", "Lunghezza (m)", fmt(p.len))}${F2("h", "Altezza (m)", fmt(p.h))}${sel("railType", "Tipo", [...rails, ["piena", "Parapetto in muratura"]])}</div></div>`;
  const H = p.H, n = Math.max(3, Math.round(p.n || H / .18)), r = H / n, d = p.tread || .28, blondel = 2*r + d;
  return `<div class="sec"><h3>Scala</h3><div class="row3">${F2("H", "Dislivello (m)", fmt(H))}${F2("n", "Alzate", n, 'inputmode="numeric"')}${p.shape === "chiocciola" ? F2("d", "Diametro (m)", fmt(p.d)) : F2("w", "Larghezza (m)", fmt(p.w))}</div>
    <div class="row3">${p.shape === "chiocciola" ? "" : F2("tread", "Pedata (m)", fmt(d))}${p.shape === "dritta" || p.shape === "chiocciola" ? "" : sel("turn", "Svolta", [["destra", "A destra"], ["sinistra", "A sinistra"]])}${p.shape === "chiocciola" ? sel("turn", "Verso", [["destra", "Antiorario"], ["sinistra", "Orario"]]) : sel("rail", "Corrimano", [["entrambi", "Entrambi i lati"], ["sinistra", "Sinistra"], ["destra", "Destra"], ["nessuno", "Nessuno"]])}</div>
    <div class="row">${p.shape === "chiocciola" ? "" : sel("railType", "Ringhiera", rails)}${sel("mat", "Gradini", [["legno_chiaro", "Rovere"], ["legno_scuro", "Noce"], ["cemento", "Cemento"], ["marmo", "Marmo"], ["metallo", "Acciaio"]])}</div>
    <dl class="kv"><dt>Alzata</dt><dd>${fmt(r * 100, 1)} cm</dd>${p.shape === "chiocciola" ? "" : `<dt>2a + p</dt><dd>${fmt(blondel * 100, 1)} cm ${blondel >= .62 && blondel <= .64 ? "· comoda" : blondel < .6 || blondel > .66 ? "· fuori dalla regola 62–64" : ""}</dd>`}</dl>
    <p class="note">Il solaio del piano sopra viene forato sull'ingombro della scala.</p></div>`;
}
/* pianta delle scale e ringhiere: gradini, linea di salita con freccia */
function drawParam2D(g, o, it, isSel){
  const t = objTemplate(o), plan = t?.userData.plan; if (!plan) return false;
  const s = toS([o.x, o.y]), sc = (o.scale || 1) * V.s; g.save(); g.translate(s[0], s[1]); g.rotate(THREE.MathUtils.degToRad(o.rot || 0)); if (o.hidden) g.globalAlpha = .25;
  g.strokeStyle = isSel ? C.sel : C.text; g.lineWidth = isSel ? 1.6 : 1; g.fillStyle = C.bg;
  for (const pl of plan.polys){ g.beginPath(); pl.forEach((q, i) => i ? g.lineTo(q[0]*sc, q[1]*sc) : g.moveTo(q[0]*sc, q[1]*sc)); g.closePath(); if (it.param?.kind === "rail"){ g.fillStyle = isSel ? C.sel : C.text; g.fill(); } else { g.fill(); g.stroke(); } }
  if (plan.arrow.length > 1){ g.beginPath(); plan.arrow.forEach((q, i) => i ? g.lineTo(q[0]*sc, q[1]*sc) : g.moveTo(q[0]*sc, q[1]*sc)); g.stroke();
    const a = plan.arrow.at(-2), b = plan.arrow.at(-1), an = Math.atan2(b[1]-a[1], b[0]-a[0]); g.beginPath(); g.moveTo(b[0]*sc, b[1]*sc); g.lineTo(b[0]*sc - Math.cos(an - .45)*9, b[1]*sc - Math.sin(an - .45)*9); g.lineTo(b[0]*sc - Math.cos(an + .45)*9, b[1]*sc - Math.sin(an + .45)*9); g.closePath(); g.fillStyle = isSel ? C.sel : C.text; g.fill();
    const a0 = plan.arrow[0]; g.beginPath(); g.arc(a0[0]*sc, a0[1]*sc, 3, 0, 7); g.fill(); }
  g.restore(); return true;
}
/* fori nel solaio sopra le scale: poligoni in pianta degli oggetti scala del piano lid */
function stairHoles(lid){
  const out = [];
  for (const o of P.objects){ if (o.level !== lid || o.kind !== "lib" || o.hidden) continue; const it = LIBMAP[libRef(o.ref)]; if (it?.param?.kind !== "stair") continue;
    const t = objTemplate(o); if (!t) continue; if (!t.userData.box) t.userData.box = new THREE.Box3().setFromObject(t);
    const b = t.userData.box, s = o.scale || 1, a = THREE.MathUtils.degToRad(o.rot || 0), cs = Math.cos(a), sn = Math.sin(a);
    out.push([[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]].map(([lx, lz]) => [o.x + (lx*cs - lz*sn)*s, o.y + (lx*sn + lz*cs)*s])); }
  return out;
}
function roomShape(r, holes){
  const sh = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) if (h.some(q => inPoly(q, r.pts)) || inPoly(polyCentroid(h), r.pts)) sh.holes.push(new THREE.Path(h.map(q => new THREE.Vector2(q[0], q[1]))));
  return sh;
}

/* ---------- tetti a padiglione e a una falda ---------- */
/* solido convesso: poligono (Vector3) estruso lungo d */
function slabGeo(poly, d){
  const pos = [], c = poly.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / poly.length), bot = poly.map(p => p.clone().add(d));
  const tri = (a, b, c2, out) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c2, a)); if (n.dot(out) < 0) [b, c2] = [c2, b]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c2.x, c2.y, c2.z); };
  const up = d.clone().negate();
  for (let i = 1; i < poly.length - 1; i++){ tri(poly[0], poly[i], poly[i+1], up); tri(bot[0], bot[i], bot[i+1], d); }
  for (let i = 0; i < poly.length; i++){ const j = (i + 1) % poly.length, m = poly[i].clone().add(poly[j]).multiplyScalar(.5), out = m.sub(c); out.addScaledVector(d.clone().normalize(), -out.dot(d.clone().normalize()));
    tri(poly[i], poly[j], bot[j], out); tri(poly[i], bot[j], bot[i], out); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function buildRoofX(L, R, add, opts){
  const {x0, x1, z0, z1, tMax, topY, o, lid, rm} = R, p = THREE.MathUtils.degToRad(clamp(L.roof.pitch, 5, 60)), tn = Math.tan(p), th = .22, dv = new THREE.Vector3(0, -th / Math.cos(p), 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o, Ye = topY - o*tn;
  if (L.roof.type === "hip"){
    const alongX = (x1 - x0) >= (z1 - z0);
    if (alongX){ const half = (z1 - z0)/2 + o, Yr = Ye + half*tn, cz = (z0 + z1)/2, xa = Math.min(X0 + half, (x0 + x1)/2), xb = Math.max(X1 - half, (x0 + x1)/2);
      for (const f of [[V(X0, Ye, Z1), V(X1, Ye, Z1), V(xb, Yr, cz), V(xa, Yr, cz)], [V(X1, Ye, Z0), V(X0, Ye, Z0), V(xa, Yr, cz), V(xb, Yr, cz)], [V(X0, Ye, Z0), V(X0, Ye, Z1), V(xa, Yr, cz)], [V(X1, Ye, Z1), V(X1, Ye, Z0), V(xb, Yr, cz)]])
        add(lid, rm, "roof", slabGeo(f.filter((q, i, a) => i === 0 || q.distanceTo(a[i-1]) > 1e-4), dv)); }
    else { const half = (x1 - x0)/2 + o, Yr = Ye + half*tn, cx = (x0 + x1)/2, za = Math.min(Z0 + half, (z0 + z1)/2), zb = Math.max(Z1 - half, (z0 + z1)/2);
      for (const f of [[V(X1, Ye, Z0), V(X1, Ye, Z1), V(cx, Yr, zb), V(cx, Yr, za)], [V(X0, Ye, Z1), V(X0, Ye, Z0), V(cx, Yr, za), V(cx, Yr, zb)], [V(X0, Ye, Z0), V(X1, Ye, Z0), V(cx, Yr, za)], [V(X1, Ye, Z1), V(X0, Ye, Z1), V(cx, Yr, zb)]])
        add(lid, rm, "roof", slabGeo(f, dv)); }
    return;
  }
  // una falda: "dir" è il lato verso cui scende l'acqua (s, n, e, o). Un solo piano per tutta la sagoma (R.all = rettangolo
  // d'ingombro, R.others = gli altri rettangoli della sagoma): su una pianta a L le falde dei rettangoli combaciano.
  const thv = th / Math.cos(p), dir = L.roof.dir || "s", gt = Math.max(tMax, opts.print ? opts.minThick || 0 : 0), wm = wallsOf(L.id)[0]?.mat || "intonaco";
  const G = R.all || {x0, x1, z0, z1}, others = R.others || [];
  const t = (x, z) => dir === "s" ? G.z1 - z : dir === "n" ? z - G.z0 : dir === "e" ? G.x1 - x : x - G.x0;   // distanza dal filo basso
  const Y = (x, z) => topY + t(x, z)*tn;
  const face = (dir === "s" || dir === "n" ? [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]] : [[X0, Z0], [X0, Z1], [X1, Z1], [X1, Z0]]).map(([x, z]) => V(x, Y(x, z), z));
  add(lid, rm, "roof", slabGeo(face, dv));
  // tamponamenti sotto la falda lungo i quattro fili del rettangolo, solo dove il filo è sul bordo della sagoma
  const inside = (x, z) => others.some(q => x > q.x0 + 1e-3 && x < q.x1 - 1e-3 && z > q.z0 + 1e-3 && z < q.z1 - 1e-3);
  const edges = [[[x0, z0], [x1, z0], [0, 0, gt], [0, -1]], [[x0, z1], [x1, z1], [0, 0, -gt], [0, 1]], [[x0, z0], [x0, z1], [gt, 0, 0], [-1, 0]], [[x1, z0], [x1, z1], [-gt, 0, 0], [1, 0]]];
  for (const [A, B, d, out] of edges){
    const cuts = [0, 1]; for (const q of others) for (const c of (A[0] === B[0] ? [q.z0, q.z1].map(v => (v - A[1]) / (B[1] - A[1])) : [q.x0, q.x1].map(v => (v - A[0]) / (B[0] - A[0])))) if (c > 1e-4 && c < 1 - 1e-4) cuts.push(c);
    cuts.sort((m, n) => m - n);
    for (let i = 0; i < cuts.length - 1; i++){
      const P0 = [A[0] + (B[0]-A[0])*cuts[i], A[1] + (B[1]-A[1])*cuts[i]], P1 = [A[0] + (B[0]-A[0])*cuts[i+1], A[1] + (B[1]-A[1])*cuts[i+1]], m = [(P0[0]+P1[0])/2 + out[0]*.02, (P0[1]+P1[1])/2 + out[1]*.02];
      if (inside(m[0], m[1])) continue;
      const h0 = Y(P0[0], P0[1]) - thv, h1 = Y(P1[0], P1[1]) - thv; if (Math.max(h0, h1) <= topY + 1e-3) continue;
      const poly = [V(P0[0], topY, P0[1]), V(P1[0], topY, P1[1])]; if (h1 > topY + 1e-3) poly.push(V(P1[0], h1, P1[1])); if (h0 > topY + 1e-3) poly.push(V(P0[0], h0, P0[1]));
      add(lid, wm, "gable", slabGeo(poly, V(...d)));
    }
  }
}

/* ---------- eventi dell'ispettore ---------- */
$("#panel-props").addEventListener("change", e => {
  const t = e.target, id = t.id, v = num(t.value), sel = findSel(), L = level();
  if (t.dataset.wside && sel){ if (t.value) sel[t.dataset.wside] = t.value; else delete sel[t.dataset.wside]; commit(); return; }
  if (t.dataset.pp && sel?.kind === "lib"){ const k = t.dataset.pp, it = LIBMAP[libRef(sel.ref)]; if (!it?.param) return; sel.p = sel.p || {};
    if (["H", "w", "tread", "d", "len", "h"].includes(k)){ if (v > 0) sel.p[k] = v; else return; } else if (k === "n"){ if (v >= 3) sel.p.n = Math.round(v); else return; } else sel.p[k] = t.value;
    if (k === "H" && !sel.p.nUser) sel.p.n = Math.round(sel.p.H / (it.param.defaults.shape === "chiocciola" ? .2 : .18)); if (k === "n") sel.p.nUser = true;
    commit(); return; }
  switch (id){
    case "paintPick": S.paintPick = t.checked; break;
    case "rTileS": if (v > 0 && sel){ sel.tile = {...(sel.tile || {}), scale:v}; commit(); } break;
    case "rTileR": if (v !== null && sel){ sel.tile = {...(sel.tile || {}), rot:v}; commit(); } break;
    case "rTileO": if (v !== null && sel){ sel.tile = {...(sel.tile || {}), ox:v, oy:v}; commit(); } break;
    case "rSkirt": if (sel){ if (t.checked) sel.skirt = {h:.08, mat:"bianco"}; else delete sel.skirt; commit(); } break;
    case "rSkirtH": if (v > 0 && sel?.skirt){ sel.skirt.h = clamp(v, .02, .4); commit(); } break;
    case "rSkirtM": if (sel?.skirt){ sel.skirt.mat = t.value; commit(); } break;
    case "rCeilH": if (sel){ if (v > 1.8 && v < L.height) sel.ceilH = v; else delete sel.ceilH; commit(); } break;
    case "rCeilM": if (sel){ sel.ceilMat = t.value; commit(); } break;
    case "oStyle": if (sel){ sel.style = t.value; commit(); } break;
    case "oShut": if (sel){ if (t.value) sel.shut = t.value; else delete sel.shut; commit(); } break;
    case "dOstyle": (S.tool === "door" ? S.defaults.door : S.defaults.win).style = t.value; break;
    case "dOshut": S.defaults.win.shut = t.value || undefined; break;
    case "lgOn": if (sel){ sel.light = {...(sel.light || {}), on:t.checked}; commit(); } break;
    case "lgLm": if (v > 0 && sel){ sel.light = {...(sel.light || {}), lm:clamp(v, 20, 20000)}; commit(); } break;
    case "lgK": if (sel){ sel.light = {...(sel.light || {}), k:+t.value}; commit(); } break;
    case "lightsMode": P.lightsMode = t.value; commit(); break;
    case "lShedDir": L.roof.dir = t.value; commit(); break;
    case "northDeg": if (v !== null){ P.site = {...(P.site || siteDefaults()), north:((v % 360) + 360) % 360}; applySite(); commit(); placeSun(); } break;
    case "siteCity": { const c = CITTA.find(x => x[0] === t.value); if (c){ P.site = {...P.site, city:c[0], lat:c[1], lon:c[2], tz:c[3]}; applySite(); commit(); placeSun(); } break; }
    case "siteDate": if (t.value){ P.site.date = t.value; applySite(); commit(); placeSun(); } break;
    case "siteLat": if (v !== null){ P.site.lat = clamp(v, -89, 89); P.site.city = ""; applySite(); commit(); placeSun(); } break;
    case "siteLon": if (v !== null){ P.site.lon = clamp(v, -180, 180); P.site.city = ""; applySite(); commit(); placeSun(); } break;
    case "siteTz": if (v !== null){ P.site.tz = clamp(v, -12, 14); applySite(); commit(); placeSun(); } break;
    case "siteDst": P.site.dst = t.checked; applySite(); commit(); placeSun(); break;
    case "siteHour": applySite(); commit(); placeSun(); break;
  }
});
$("#panel-props").addEventListener("input", e => { const t = e.target;
  if (t.id === "siteHour"){ P.site.hour = +t.value; applySite(); const r = siteSun(P.site), lb = $("#siteHourLbl"); if (lb) lb.textContent = `Ora · ${hhmm(P.site.hour)} — sole a ${Math.round(r.trueAz)}° da nord, alto ${Math.round(r.el)}°${r.el < 0 ? " (notte)" : ""}`;
    placeSun(); render3D(); }
});
$("#panel-props").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; const sel = findSel(), L = level();
  if (b.dataset.brush){ S.brush = b.dataset.brush; S.paintPick = false; renderInspector(); return; }
  if (b.dataset.sunmode !== undefined){ const on = b.dataset.sunmode === "1"; P.site = {...(P.site || siteDefaults()), auto:on}; applySite(); commit(); placeSun(); return; }
  if (b.id === "oExt" && sel){ sel.flip = (sel.flip || 0) ^ 4; commit(); return; }
  if (b.id === "rApplyAll" && sel){ for (const r of P.rooms) if (r.level === sel.level && r !== sel){ r.mat = sel.mat; if (sel.tile) r.tile = {...sel.tile}; else delete r.tile; if (sel.skirt) r.skirt = {...sel.skirt}; else delete r.skirt; } commit(); toast("Pavimento e battiscopa applicati a tutti i locali del piano"); return; }
});
