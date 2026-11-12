/* ============================================================
   Progetto di esempio, migrazione, avvio
   ============================================================ */
function sampleProject(){
  const L0 = {id:"L0", name:"Piano terra", elev:0, height:2.9, slab:.25, roof:{type:"gable", pitch:26, overhang:.5, mat:"tegole"}, underlay:null};
  const w = (a,b,t=.3,mat="intonaco") => ({id:uid(), level:"L0", a, b, thick:t, height:null, mat});
  const W1=w([0,0],[11,0]), W2=w([11,0],[11,8]), W3=w([11,8],[0,8]), W4=w([0,8],[0,0]), W5=w([6.5,0],[6.5,8],.12);
  const ob = (ref, x, y, rot=0, scale=1) => ({id:uid(), level:"L0", kind:"lib", ref, name:LIBMAP[ref].nome, x, y, rot, scale, z:0});
  return {
    name:"Casa unifamiliare (esempio)", version:SCHEMA_VERSION, materials:{}, sky:{kind:"asset", id:"giorno"},
    sun:{az:245, el:36}, levels:[L0],
    walls:[W1,W2,W3,W4,W5],
    openings:[
      {id:uid(), wall:W3.id, t:7.2, w:1.0, h:2.2, sill:0, type:"door", flip:0},
      {id:uid(), wall:W3.id, t:3.2, w:2.4, h:2.2, sill:0, type:"window", flip:0},
      {id:uid(), wall:W3.id, t:9.4, w:1.2, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W1.id, t:2.0, w:1.4, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W1.id, t:8.8, w:1.4, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W2.id, t:4.0, w:1.2, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W4.id, t:4.0, w:1.6, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W5.id, t:5.6, w:.8, h:2.1, sill:0, type:"door", flip:1},
    ],
    rooms:[
      {id:uid(), level:"L0", name:"Soggiorno", mat:"parquet", pts:[[.15,.15],[6.44,.15],[6.44,7.85],[.15,7.85]]},
      {id:uid(), level:"L0", name:"Camera", mat:"parquet", pts:[[6.56,.15],[10.85,.15],[10.85,7.85],[6.56,7.85]]},
    ],
    objects:[
      ob("divano3", 3.0, 2.0), ob("tappeto", 3.0, 3.2), ob("tavolino", 3.0, 3.3), ob("mobile_tv", 3.0, 4.9, 180), ob("tavolo6", 3.4, 6.5), ob("sedia", 2.6, 5.9, 180), ob("sedia", 4.2, 5.9, 180),
      ob("letto2", 8.7, 1.4), ob("comodino", 7.6, .5), ob("comodino", 9.8, .5), ob("armadio2", 9.9, 7.4, 180),
      ob("olivo", -3.6, 10.2), ob("cipresso", -2.2, 1.0), ob("cipresso", -2.2, 4.0), ob("palma", 14.2, -2.0), ob("arbusto", 1.2, 9.4), ob("arbusto", 9.6, 9.3), ob("siepe", 4.0, 13.8),
      ob("sagoma_uomo", 6.9, 9.8, -20), ob("sagoma_donna_c", 4.4, 10.6, 30),
    ],
  };
}
/* Ogni progetto che entra (file, raccolta, link condiviso, salvataggio del browser) viene ripulito:
   identificativi solo alfanumerici (finiscono in attributi HTML), numeri finiti, testi limitati,
   colori validi, immagini esterne solo da data: o da Poly Haven. Un progetto preparato ad arte
   non può così inserire codice nella pagina. */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
function sanitizeProject(p){
  if (!p || typeof p !== "object") throw new Error("progetto non valido");
  const ids = new Map(), fix = v => { const k = String(v ?? ""); if (ID_OK.test(k)) return k; if (!ids.has(k)) ids.set(k, uid()); return ids.get(k); };
  const N = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; }, Nn = v => v == null || v === "" ? null : N(v, null);
  const T = (v, max = 200) => v == null ? "" : String(v).slice(0, max), K = v => v == null ? v : T(v, 80).replace(/[^\w\-.:]/g, "_");
  const pt = q => Array.isArray(q) ? [N(q[0]), N(q[1])] : [0, 0], v3 = q => Array.isArray(q) ? [N(q[0]), N(q[1]), N(q[2])] : [0, 0, 0];
  const arr = k => { if (!Array.isArray(p[k])) p[k] = []; p[k] = p[k].filter(x => x && typeof x === "object" && !Array.isArray(x)); return p[k]; };
  const okUrl = u => typeof u === "string" && (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || /^https:\/\/(dl|cdn)\.polyhaven\.(org|com)\/[\w\-./%]+$/.test(u));
  p.name = T(p.name, 120) || "Progetto"; if (p.pid != null) p.pid = fix(p.pid);
  for (const L of arr("levels")){ L.id = fix(L.id); L.name = T(L.name, 80) || "Piano"; L.elev = N(L.elev); L.height = N(L.height, 2.7) || 2.7; L.slab = N(L.slab, .25);
    if (L.roof && typeof L.roof === "object"){ L.roof = {type:["none", "flat", "gable", "hip", "shed"].includes(L.roof.type) ? L.roof.type : "none", pitch:N(L.roof.pitch, 30), overhang:N(L.roof.overhang, .5), mat:K(L.roof.mat) || "tegole", ...(L.roof.ridge === "x" || L.roof.ridge === "y" ? {ridge:L.roof.ridge} : {}), ...(["s", "n", "e", "o"].includes(L.roof.dir) ? {dir:L.roof.dir} : {})}; } else L.roof = null;
    if (L.underlay && typeof L.underlay === "object"){ const U = L.underlay; if (U.kind === "img" && !okUrl(U.src)) L.underlay = null; else for (const k of ["ox", "oy", "mpp", "k", "opacity"]) if (k in U) U[k] = N(U[k]); } }
  // valori fisici (#56): altezze e spessori positivi, muri non nulli, aperture con misure positive dentro il muro
  for (const L of p.levels){ if (!(L.height > 0)) L.height = 2.7; if (!(L.slab >= 0)) L.slab = .25; }
  if (!p.levels.length) p.levels.push({id:"L0", name:"Piano terra", elev:0, height:2.9, slab:.25, roof:null, underlay:null});
  for (const w of arr("walls")){ w.id = fix(w.id); w.level = fix(w.level); w.a = pt(w.a); w.b = pt(w.b); w.thick = N(w.thick, .3) || .3; w.height = Nn(w.height); for (const k of ["mat", "matA", "matB"]) if (w[k] != null) w[k] = K(w[k]); if (w.wtype != null) w.wtype = K(w.wtype); if (w.layers) w.layers = {core:N(w.layers.core), insul:N(w.layers.insul)};
    if (w.arc){ w.arc = {g:fix(w.arc.g), i:N(w.arc.i), h:N(w.arc.h), A:pt(w.arc.A), B:pt(w.arc.B)}; } }
  p.walls = p.walls.filter(w => Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]) >= .01);
  for (const w of p.walls){ if (!(w.thick > 0)) w.thick = .3; w.thick = Math.min(w.thick, 3); if (w.height != null && !(w.height > 0)) w.height = null; }
  for (const r of arr("rooms")){ r.id = fix(r.id); r.level = fix(r.level); r.pts = Array.isArray(r.pts) ? r.pts.map(pt) : []; r.name = T(r.name, 80); r.mat = K(r.mat); if (r.lab) r.lab = pt(r.lab);
    if (r.ceilH != null) r.ceilH = Nn(r.ceilH); if (r.ceilMat != null) r.ceilMat = K(r.ceilMat); if (r.tile) r.tile = {scale:N(r.tile.scale, 1), rot:N(r.tile.rot), ox:N(r.tile.ox), oy:N(r.tile.oy)}; if (r.skirt) r.skirt = {h:N(r.skirt.h, .08), mat:K(r.skirt.mat) || "bianco"}; }
  for (const o of arr("openings")){ o.id = fix(o.id); o.wall = fix(o.wall); for (const k of ["t", "w", "h", "sill"]) o[k] = N(o[k]); o.type = o.type === "door" ? "door" : "window"; o.flip = N(o.flip) | 0; if (o.style != null) o.style = K(o.style); if (o.shut != null) o.shut = K(o.shut); }
  { const len = new Map(p.walls.map(w => [w.id, Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1])]));
    p.openings = p.openings.filter(o => len.has(o.wall));
    for (const o of p.openings){ const L = len.get(o.wall); if (!(o.w > 0)) o.w = Math.min(.9, L); o.w = Math.min(o.w, L); if (!(o.h > 0)) o.h = o.type === "door" ? 2.1 : 1.2; if (!(o.sill >= 0)) o.sill = o.type === "door" ? 0 : .9; o.t = clamp(o.t, o.w / 2, Math.max(o.w / 2, L - o.w / 2)); } }
  for (const o of arr("objects")){ o.id = fix(o.id); o.level = fix(o.level); o.kind = K(o.kind) || "lib"; o.ref = K(o.ref); o.name = T(o.name, 120); for (const k of ["x", "y", "z", "rot"]) o[k] = N(o[k]); o.scale = N(o.scale, 1) || 1;
    if (o.p && typeof o.p === "object") for (const [k, v] of Object.entries(o.p)) o.p[k] = typeof v === "number" ? N(v) : typeof v === "boolean" ? v : K(v);
    if (o.light && typeof o.light === "object") o.light = {on:o.light.on !== false, ...(o.light.lm != null ? {lm:N(o.light.lm, 800)} : {}), ...(o.light.k != null ? {k:N(o.light.k, 3000)} : {})}; }
  for (const d of arr("dims")){ d.id = fix(d.id); d.level = fix(d.level); d.a = pt(d.a); d.b = pt(d.b); d.off = N(d.off); }
  for (const c of arr("cameras")){ c.id = fix(c.id); c.name = T(c.name, 80) || "Vista"; c.pos = v3(c.pos); c.target = v3(c.target); c.fov = N(c.fov, 45);
    if (typeof c.photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.photo) || c.photo.length > 600000) delete c.photo; }
  if (p.materials && typeof p.materials === "object"){ const m2 = {};
    for (const [k, m] of Object.entries(p.materials)){ if (!m || typeof m !== "object") continue; const key = K(k), c = {...m};
      c.nome = T(m.nome, 80); c.color = /^#[0-9a-f]{3,8}$/i.test(m.color || "") ? m.color : "#cccccc"; for (const u of ["map", "mapData", "normalMap", "roughMap"]) if (c[u] != null && !okUrl(c[u])) delete c[u];
      for (const n of ["rough", "metal", "size", "opacity"]) if (c[n] != null) c[n] = N(c[n]); for (const n of ["tex", "img", "rimg", "bimg"]) delete c[n]; m2[key] = c; }
    p.materials = m2; } else p.materials = {};
  if (p.sky && typeof p.sky === "object"){ if (p.sky.kind === "ph" ? !okUrl(p.sky.url) : !/^[a-z]+$/.test(p.sky.id || "")) p.sky = {kind:"asset", id:"giorno"}; else p.sky = {kind:p.sky.kind === "ph" ? "ph" : "asset", id:K(p.sky.id), ...(p.sky.url ? {url:p.sky.url} : {}), nome:T(p.sky.nome, 80)}; }
  if (p.sun) p.sun = {az:N(p.sun.az, 245), el:N(p.sun.el, 36)};
  if (p.site && typeof p.site === "object"){ const s = p.site; p.site = {auto:!!s.auto, city:T(s.city, 40), lat:N(s.lat, 44.494), lon:N(s.lon, 11.343), tz:N(s.tz, 1), dst:s.dst !== false, north:N(s.north), date:/^\d{4}-\d{2}-\d{2}$/.test(s.date || "") ? s.date : "2026-06-21", hour:N(s.hour, 16)}; }
  if (p.prices && typeof p.prices === "object"){ const q = {}; for (const [k, v] of Object.entries(p.prices)) if (Number.isFinite(Number(v))) q[T(k, 160)] = Number(v); p.prices = q; }
  if (p.share && typeof p.share === "object") p.share = ID_OK.test(p.share.id || "") ? {id:p.share.id, expires_at:T(p.share.expires_at, 40), mode:p.share.mode === "edit" ? "edit" : "view"} : undefined;
  if (p.tav && typeof p.tav === "object"){ const t = p.tav; p.tav = {paper:["A4", "A3", "A2", "A1"].includes(t.paper) ? t.paper : "A3", scale:[50, 100, 200].includes(+t.scale) ? +t.scale : 100, color:!!t.color, chains:t.chains !== false, furniture:t.furniture !== false, comp:t.comp !== false, sec:{axis:t.sec?.axis === "z" ? "z" : "x", pos:N(t.sec?.pos, 5), dir:N(t.sec?.dir, 1) < 0 ? -1 : 1}, ...(t.info && typeof t.info === "object" ? {info:{studio:T(t.info.studio, 80), committente:T(t.info.committente, 80), luogo:T(t.info.luogo, 80)}} : {})}; }
  if (p.lightsMode != null && !["auto", "on", "off"].includes(p.lightsMode)) p.lightsMode = "auto";
  return p;
}
/* Versioni dello schema (docs/schema-progetto.md):
   1 — prima versione (nomi di libreria brevi, senza piani multipli completi)
   2 — piani, quote, camere, cielo e sole
   3 — lati dei muri, posa e battiscopa, luci, oggetti parametrici, sito, tavole, prezzi, link per il cliente
   Le versioni 2 e 3 hanno la stessa struttura di base: i campi della 3 sono facoltativi. */
const SCHEMA_VERSION = 3;
function migrate(p){
  const from = Number(p?.version) || 1;
  if (from > SCHEMA_VERSION) setTimeout(() => toast(`Questo progetto è stato salvato con una versione più recente di Pianta Libera (schema ${from}): alcuni dati potrebbero non essere letti.`, true), 300);
  sanitizeProject(p);
  p.materials = p.materials || {}; p.dims = p.dims || []; p.cameras = p.cameras || []; p.sky = p.sky || {kind:"asset", id:"giorno"}; p.sun = p.sun || {az:245, el:36};
  for (const L of p.levels){ L.roof = L.roof || {type:"none", pitch:30, overhang:.5, mat:"tegole"}; L.slab = L.slab ?? .25; }
  for (const o of p.objects || []) if (o.kind === "lib") o.ref = libRef(o.ref);
  if (!p.pid) p.pid = uid();
  p.version = SCHEMA_VERSION; return p;
}
/* Alla riapertura la raccolta Progetti (IndexedDB) può essere più aggiornata di localStorage: salvataggio rapido
   fallito per spazio, altra scheda che ha scritto localStorage, modelli importati (che localStorage non contiene).
   Si apre la versione più recente del progetto di questa scheda e si ricaricano i modelli importati. */
async function restoreFromIdb(wantPid, savedT){
  if (!window.indexedDB) return;
  try {
    const before = snap, pid = wantPid || P.pid, rec = await projGet(pid); if (!rec?.data) return;
    if (snap !== before) return;   // l'utente ha già cominciato a modificare: non si cambia il progetto sotto le mani
    const data = JSON.parse(rec.data);
    if (pid !== P.pid || (rec.updated || 0) > savedT + 1000){
      await openProjectData(data, {keepPid:true});
      if (savedT && pid === P.pid) toast("Riaperta la versione più recente dalla raccolta Progetti");
      return;
    }
    let n = 0;
    for (const [id, it] of Object.entries(data.imports || {})){
      if (importStore[id] || !P.objects.some(o => o.kind === "import" && o.ref === id)) continue;
      pendingImports[id] = it;
      try { if (it.file) await registerImport(id, it.file, it.opts || {unit:"auto", up:"auto"}); else if (it.source) await restoreRemote(id, it.source); delete pendingImports[id]; n++; } catch(err){ console.warn("modello importato", err); }
    }
    if (n){ draw2D(); rebuild3D(); }
  } catch(e){ console.warn("raccolta progetti", e); }
}
function readCanvasColors(){ readColors(); draw2D(); render3D(); }
function init(){
  let saved = null, savedT = 0, tabPid = null, lastPid = null;
  try { saved = JSON.parse(localStorage.getItem(LS_P)) || JSON.parse(localStorage.getItem("pianta-aperta-v2")) || JSON.parse(localStorage.getItem("pianta-aperta-v1")); savedT = +localStorage.getItem(LS_T) || 0; lastPid = localStorage.getItem(LS_LAST); } catch(e){}
  try { tabPid = sessionStorage.getItem(SS_PID); } catch(e){}
  P = migrate(saved?.levels?.length ? saved : sampleProject()); S.level = P.levels[0].id; snap = snapOf(P);
  $("#projName").value = P.name; readColors(); setTool("select"); renderStatus();
  if (!saved?.levels?.length && !new URLSearchParams(location.search).get("condividi")) save();   // l'identità del progetto (pid) resta tra un'apertura e l'altra
  new ResizeObserver(() => { resize2D(); resize3D(); }).observe($("#views"));
  resize2D(); resize3D(); fitPlan(); rebuild3D(); applySky(); setTimeout(() => camPreset("ext"), 80); renderLevels();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readCanvasColors(); applySky(); });
  new MutationObserver(() => { readCanvasColors(); applySky(); }).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
  if (document.fonts?.ready) document.fonts.ready.then(draw2D);
  capReady.then(() => { if (S.tab === "export") renderExport(); });
  loadPersonalIndex();
  const shareId = new URLSearchParams(location.search).get("condividi");
  const editKey = (location.hash.match(/(?:^#|&)modifica=([a-f0-9]{48})/) || [])[1];
  if (shareId && editKey) enterGuest(shareId, editKey); else if (shareId) enterViewer(shareId);
  else { restoreFromIdb(tabPid || lastPid, savedT).finally(() => { idbReady = true; setTimeout(queueIdbSave, 2500); }); loadGallery(); }
}
init();
