"use strict";
/* ============================================================
   Pianta Libera — editor di pianta 2D con modello 3D e
   import/export aperti. Unità interne: metri.
   Pianta: x a destra, y in basso (Nord = alto).
   3D: x = x pianta, z = y pianta, y verso l'alto.
   ============================================================ */
const CDN3 = "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/";
const ASSET = "assets/";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const fmt = (v, d=2) => (Math.round(v*10**d)/10**d).toFixed(d).replace(".", ",");
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const slugify = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "x";
const loaded = {};
function loadScript(url){
  if (loaded[url]) return loaded[url];
  return loaded[url] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = url; if (typeof SRI !== "undefined" && SRI[url]){ s.integrity = SRI[url]; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = () => { delete loaded[url]; rej(new Error("libreria non caricata: " + url.split("/").pop())); }; document.head.appendChild(s); });
}
function toast(msg, err=false){ const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", err); t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("on"), err ? 6000 : 2800); }
function busy(msg){ const el = $("#loading3d"); if (!el) return; el.hidden = !msg; el.textContent = msg || ""; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* File binari della cartella assets: sul tuo sito si leggono così come sono;
   nell'anteprima di Claude (che non serve .glb/.hdr) esiste una copia .b64.txt */
const assetUrlCache = {};
function assetURL(path){
  if (assetUrlCache[path]) return assetUrlCache[path];
  return assetUrlCache[path] = (async () => {
    try { const r = await fetch(ASSET + path); if (r.ok){ const ct = r.headers.get("content-type") || ""; if (!ct.includes("text/html")) return URL.createObjectURL(await r.blob()); } } catch(e){}
    const r2 = await fetch(ASSET + path + ".b64.txt"); if (!r2.ok) throw new Error("file mancante: assets/" + path);
    const bin = atob((await r2.text()).trim()), u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([u]));
  })();
}

/* ---------------- Materiali ----------------
   tex: texture procedurale; img/rimg/bimg: texture fotografiche in assets/ (CC0/MIT)
   size: metri coperti da una ripetizione della texture */
const MATS = {
  intonaco:      {nome:"Intonaco bianco",       color:"#ebe8e1", rough:.95, tex:"plaster",  size:1},
  intonaco_sab:  {nome:"Intonaco sabbia",       color:"#d6c3a2", rough:.95, tex:"plaster",  size:1},
  intonaco_gr:   {nome:"Intonaco grigio",       color:"#a9aaa6", rough:.95, tex:"plaster",  size:1},
  mattone:       {nome:"Mattone a vista",       color:"#a2573a", rough:.9,  tex:"brick",    size:1.6, img:"tex/mattone.jpg", rimg:"tex/mattone_r.jpg", bimg:"tex/mattone_b.jpg"},
  cemento:       {nome:"Cemento",               color:"#a7a7a2", rough:.85, tex:"concrete", size:2},
  pietra:        {nome:"Pietra a spacco",       color:"#b3a68c", rough:.95, tex:"stone",    size:1.5},
  legno_dogato:  {nome:"Doghe di legno",        color:"#946539", rough:.8,  tex:"planks",   size:1},
  parquet:       {nome:"Parquet rovere",        color:"#b98a58", rough:.6,  tex:"parquet",  size:2, img:"tex/parquet.jpg", rimg:"tex/parquet_r.jpg"},
  parquet_scuro: {nome:"Parquet noce",          color:"#6e4a2e", rough:.55, tex:"parquet",  size:1},
  gres:          {nome:"Gres 60×60",            color:"#cdc8bf", rough:.5,  tex:"tiles",    size:1.2},
  marmo:         {nome:"Marmo bianco",          color:"#e8e6e1", rough:.25, tex:"marble",   size:1.5},
  tegole:        {nome:"Coppi in laterizio",    color:"#a1523a", rough:.9,  tex:"roof",     size:1},
  lamiera:       {nome:"Lamiera aggraffata",    color:"#5c6168", rough:.45, tex:"seam",     size:1, metal:.6},
  serramento:    {nome:"Serramento antracite",  color:"#383b3e", rough:.5,  metal:.3},
  legno:         {nome:"Legno porta",           color:"#86562f", rough:.6,  tex:"wood",     size:1},
  vetro:         {nome:"Vetro",                 color:"#9cc0d2", glass:true},
  erba:          {nome:"Prato",                 color:"#5f7d3c", rough:1,   tex:"grass",    size:5, img:"tex/prato.jpg"},
  tessuto:       {nome:"Tessuto grigio",        color:"#8b8882", rough:1,   tex:"fabric",   size:.5},
  tessuto_beige: {nome:"Tessuto beige",         color:"#c9b79c", rough:1,   tex:"fabric",   size:.5},
  tessuto_blu:   {nome:"Tessuto blu",           color:"#3f5a78", rough:1,   tex:"fabric",   size:.5},
  lenzuola:      {nome:"Lino bianco",           color:"#eeece6", rough:1,   tex:"fabric",   size:.5},
  pelle:         {nome:"Pelle cognac",          color:"#8a5232", rough:.55, tex:"leather",  size:.5},
  tappeto:       {nome:"Tappeto",               color:"#b4a58e", rough:1,   tex:"rug",      size:2.4},
  paralume:      {nome:"Paralume lino",         color:"#ece2cf", rough:1,   emissive:"#5a4a30"},
  legno_chiaro:  {nome:"Rovere chiaro",         color:"#c9a77d", rough:.6,  tex:"wood",     size:1},
  legno_scuro:   {nome:"Noce",                  color:"#5e3d26", rough:.55, tex:"wood",     size:1},
  teak:          {nome:"Teak da esterno",       color:"#9a7350", rough:.7,  tex:"wood",     size:1},
  bianco:        {nome:"Laccato bianco",        color:"#f1f1ee", rough:.35},
  laccato_gr:    {nome:"Laccato grigio",        color:"#8f918e", rough:.4},
  ceramica:      {nome:"Ceramica bianca",       color:"#f6f6f3", rough:.12},
  metallo:       {nome:"Acciaio satinato",      color:"#c4c6c8", rough:.3,  metal:1},
  metallo_nero:  {nome:"Metallo nero",          color:"#222324", rough:.45, metal:.8},
  specchio:      {nome:"Specchio",              color:"#e9eef0", rough:.02, metal:1},
  schermo:       {nome:"Schermo TV",            color:"#0b0c0d", rough:.08, metal:.2},
  acqua:         {nome:"Acqua piscina",         color:"#5fb3c9", glass:true, water:true},
  telo:          {nome:"Telo écru",             color:"#e6dcc6", rough:1,   tex:"fabric",   size:.5, side:"double"},
  plastica:      {nome:"Polipropilene bianco",  color:"#eeeeea", rough:.5},
  vernice_auto:  {nome:"Vernice auto grigia",   color:"#7d838a", rough:.25, metal:.6},
  libri:         {nome:"Dorsi libri",           color:"#8a6a4a", rough:.8,  tex:"books",    size:.5},
  foglie:        {nome:"Fogliame",              color:"#4c6c36", rough:1},
  corteccia:     {nome:"Corteccia",             color:"#5a4634", rough:1,   tex:"bark",     size:.6},
  sagoma:        {nome:"Sagoma di scala",       color:"#e9e8e4", rough:.85},
  soffitto:      {nome:"Soffitto bianco",       color:"#f1efe9", rough:.95, emissive:"#56534c"},
};
const WALL_MATS = ["intonaco","intonaco_sab","intonaco_gr","mattone","cemento","pietra","legno_dogato","marmo"];
const FLOOR_MATS = ["parquet","parquet_scuro","gres","marmo","cemento","pietra"];
const ROOF_MATS = ["tegole","lamiera","cemento"];

function rng(seed){ let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function rgbOf(hex){ const n = parseInt(hex.slice(1),16); return [n>>16, (n>>8)&255, n&255]; }
function shade(hex, f){ let [r,g,b] = rgbOf(hex); r=clamp(Math.round(r*f),0,255); g=clamp(Math.round(g*f),0,255); b=clamp(Math.round(b*f),0,255); return `rgb(${r},${g},${b})`; }
const texCanvases = {};
function texCanvas(key){
  if (texCanvases[key]) return texCanvases[key];
  const m = MATS[key], S = 512, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), R = rng(key.length * 9973 + key.charCodeAt(0)), col = m.color;
  g.fillStyle = col; g.fillRect(0,0,S,S);
  const noise = (n, a, sz=2) => { for (let i=0;i<n;i++){ g.fillStyle = shade(col, 1 + (R()-.5)*a); g.fillRect(R()*S, R()*S, sz, sz); } };
  switch (m.tex){
    case "plaster": noise(9000,.12,2); noise(1500,.08,5); break;
    case "concrete": noise(6000,.18,2); for(let i=0;i<40;i++){ g.fillStyle = shade(col, .9+R()*.15); g.globalAlpha=.25; g.beginPath(); g.arc(R()*S,R()*S,10+R()*40,0,7); g.fill(); } g.globalAlpha=1; break;
    case "brick": { g.fillStyle = "#cfc6b8"; g.fillRect(0,0,S,S); const rows=16, bw=S/4, bh=S/rows, mo=4;
      for(let r=0;r<rows;r++){ const off = (r%2)*bw/2; for(let i=-1;i<5;i++){ g.fillStyle = shade(col, .82 + R()*.32); g.fillRect(i*bw+off+mo/2, r*bh+mo/2, bw-mo, bh-mo); } } noise(4000,.15,2); break; }
    case "stone": { g.fillStyle="#8f8676"; g.fillRect(0,0,S,S); let y=0; while(y<S){ const h=30+R()*50; let x=-R()*60; while(x<S){ const w=50+R()*110; g.fillStyle=shade(col,.78+R()*.4); g.fillRect(x+3,y+3,w-6,h-6); x+=w; } y+=h; } noise(5000,.2,2); break; }
    case "planks": { const n=7, h=S/n; for(let i=0;i<n;i++){ g.fillStyle=shade(col,.85+R()*.3); g.fillRect(0,i*h,S,h-3); for(let k=0;k<14;k++){ g.strokeStyle=shade(col,.75); g.globalAlpha=.25; g.beginPath(); const yy=i*h+R()*h; g.moveTo(0,yy); g.bezierCurveTo(S*.3,yy+R()*6-3,S*.6,yy+R()*6-3,S,yy); g.stroke(); } g.globalAlpha=1; } break; }
    case "parquet": { const n=8, w=S/n; for(let i=0;i<n;i++){ let y=-R()*S; while(y<S){ const L=S*(.35+R()*.4); g.fillStyle=shade(col,.82+R()*.3); g.fillRect(i*w+1,y+1,w-2,L-2); y+=L; } } noise(3000,.1,2); break; }
    case "tiles": { g.fillStyle="#b9b3a9"; g.fillRect(0,0,S,S); const n=2, w=S/n; for(let i=0;i<n;i++) for(let j=0;j<n;j++){ g.fillStyle=shade(col,.95+R()*.08); g.fillRect(i*w+2,j*w+2,w-4,w-4); } noise(4000,.06,2); break; }
    case "marble": { noise(4000,.05,3); for (let k=0;k<14;k++){ g.strokeStyle = `rgba(120,118,112,${.12+R()*.25})`; g.lineWidth = .6+R()*1.8; g.beginPath(); let x=R()*S, y=0; g.moveTo(x,y); while(y<S){ x+= (R()-.5)*40; y+= 20+R()*30; g.lineTo(x,y);} g.stroke(); } break; }
    case "roof": { const rows=5, h=S/rows; for(let r=0;r<rows;r++){ for(let i=0;i<8;i++){ const x=i*S/8+(r%2)*S/16; const gr=g.createLinearGradient(x,0,x+S/8,0); gr.addColorStop(0,shade(col,.7)); gr.addColorStop(.5,shade(col,1.12+(R()-.5)*.15)); gr.addColorStop(1,shade(col,.7)); g.fillStyle=gr; g.fillRect(x,r*h,S/8,h-4);} g.fillStyle=shade(col,.55); g.fillRect(0,r*h+h-4,S,4);} break; }
    case "seam": { for(let i=0;i<2;i++){ g.fillStyle=shade(col,1.15); g.fillRect(i*S/2,0,6,S); g.fillStyle=shade(col,.8); g.fillRect(i*S/2+6,0,4,S);} noise(2000,.06,2); break; }
    case "wood": { for(let k=0;k<60;k++){ g.strokeStyle=shade(col,.8+R()*.3); g.globalAlpha=.35; g.beginPath(); const x=R()*S; g.moveTo(x,0); g.bezierCurveTo(x+R()*20-10,S*.3,x+R()*20-10,S*.6,x,S); g.stroke(); } g.globalAlpha=1; break; }
    case "bark": { for(let k=0;k<90;k++){ g.strokeStyle=shade(col,.55+R()*.6); g.lineWidth=2+R()*6; g.beginPath(); let x=R()*S; g.moveTo(x,0); for(let y=0;y<=S;y+=32){ x+=(R()-.5)*10; g.lineTo(x,y);} g.stroke(); } break; }
    case "grass": noise(30000,.35,2); noise(6000,.25,3); break;
    case "fabric": for(let i=0;i<S;i+=4){ g.fillStyle=shade(col,.94); g.fillRect(i,0,2,S); g.fillStyle=shade(col,1.04); g.fillRect(0,i,S,2);} break;
    case "leather": noise(20000,.1,2); noise(800,.15,6); break;
    case "rug": { for(let i=0;i<S;i+=3){ g.fillStyle=shade(col,.92+R()*.12); g.fillRect(0,i,S,2); } g.strokeStyle=shade(col,.6); g.lineWidth=18; g.strokeRect(30,30,S-60,S-60); g.lineWidth=4; g.strokeRect(62,62,S-124,S-124); break; }
    case "books": { let x=0; const cols=["#7b2e2a","#2f4b6e","#d9cfb7","#3d5a3a","#a07a3a","#1f2326","#8a8f94","#b8562e"]; while(x<S){ const w=10+R()*22; g.fillStyle=cols[Math.floor(R()*cols.length)]; g.fillRect(x,0,w-1,S); g.fillStyle="rgba(255,255,255,.18)"; g.fillRect(x+2,S*.15,w-5,3); g.fillRect(x+2,S*.8,w-5,3); x+=w; } break; }
  }
  return texCanvases[key] = c;
}
const texLoader = new THREE.TextureLoader();
function loadTex(url, cb, srgb=true, onErr){ texLoader.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; cb(t); }, undefined, () => onErr && onErr()); }
const matCache = {};
/* materiali del progetto (importati da SketchUp ecc. o da librerie online) */
function matDef(key){ return MATS[key] || (P && P.materials && P.materials[key]) || MATS.intonaco; }
function matName(key){ return matDef(key).nome || key; }
function invalidateMat(key){ if (matCache[key]){ matCache[key].dispose(); delete matCache[key]; } }
function getMat(key){
  if (matCache[key]) return matCache[key];
  const m = matDef(key); let mat;
  if (m.glass){
    mat = new THREE.MeshPhysicalMaterial({color:m.color, roughness:m.water ? .02 : .05, metalness:0, transparent:true, opacity:m.water ? .75 : .28, side:THREE.DoubleSide});
    if (m.water){ mat.clearcoat = 1; mat.ior = 1.33; }
  } else {
    const textured = m.tex || m.img || m.map || m.mapData;
    mat = new THREE.MeshStandardMaterial({color: textured ? (m.tint || "#ffffff") : m.color, roughness:m.rough ?? .8, metalness:m.metal ?? 0});
    if (m.opacity != null && m.opacity < 1){ mat.transparent = true; mat.opacity = m.opacity; }
    if (m.tex && MATS[key]){ const t = new THREE.CanvasTexture(texCanvas(key)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; mat.map = t; }
    const done = () => { mat.needsUpdate = true; render3D(); };
    if (m.img) loadTex(ASSET + m.img, t => { mat.map = t; done(); });
    if (m.rimg) loadTex(ASSET + m.rimg, t => { mat.roughnessMap = t; mat.roughness = 1; done(); }, false);
    if (m.bimg) loadTex(ASSET + m.bimg, t => { mat.bumpMap = t; mat.bumpScale = .9; done(); }, false);
    const src = m.mapData || m.map;
    if (src) loadTex(src, t => { mat.map = t; done(); });
    if (m.normalMap) loadTex(m.normalMap, t => { mat.normalMap = t; done(); }, false);
    if (m.roughMap) loadTex(m.roughMap, t => { mat.roughnessMap = t; mat.roughness = 1; done(); }, false);
    if (m.emissive){ mat.emissive = new THREE.Color(m.emissive); mat.emissiveIntensity = m.glow ?? .6; }
  }
  if (m.side === "double") mat.side = THREE.DoubleSide;
  mat.envMapIntensity = m.glass ? 1.2 : .55;
  mat.name = m.nome; mat.userData.key = key;
  return matCache[key] = mat;
}
const swCache = {};
function swatchUrl(key){
  if (swCache[key]) return swCache[key];
  const m = matDef(key);
  if (m.img) return swCache[key] = ASSET + m.img;
  if (m.mapData || m.map) return swCache[key] = (m.mapData || m.map);
  if (!m.tex || !MATS[key]) return null;
  const c = document.createElement("canvas"); c.width = 96; c.height = 40; c.getContext("2d").drawImage(texCanvas(key), 0, 0, 512, 213, 0, 0, 96, 40);
  return swCache[key] = c.toDataURL("image/png");
}
function swatchStyle(key){ const u = swatchUrl(key), m = matDef(key); return esc(u ? `background-image:url("${String(u).replace(/["\\\n]/g, "")}")` : `background:${/^#[0-9a-f]{3,8}$/i.test(m.color || "") ? m.color : "#ccc"}`); }
function projMatKeys(){ return Object.keys(P.materials || {}); }
