/* ============================================================
   Salvataggio file, esportazioni, importazioni
   ============================================================ */
let downloadsCap = null; const ALLOWED = ["png","json","txt","zip","html","svg","md","csv","pdf","jpg"];
const capReady = (async () => { try { downloadsCap = window.claude?.use ? await window.claude.use("downloads") : null; } catch(e){ downloadsCap = null; } })();
const inArtifact = () => !!downloadsCap;
async function saveFile(name, data){
  const ext = name.split(".").pop().toLowerCase();
  let blob = data instanceof Blob ? data : new Blob([data]);
  if (inArtifact()){
    if (!ALLOWED.includes(ext)){ const buf = new Uint8Array(await blob.arrayBuffer()); blob = new Blob([fflate.zipSync({[name]: buf})]); name = name + ".zip"; }
    try { await downloadsCap.save({filename:name, data:blob}); toast("Salvato: " + name); }
    catch(e){ if (e?.code !== "declined") toast("Salvataggio non riuscito: " + (e?.message || e?.code), true); }
    return;
  }
  // app per iPhone, iPad e Android (app-mobile/, Expo): il file passa all'app, che apre «Condividi/Salva»
  if (window.ReactNativeWebView?.postMessage){
    if (blob.size > 80 * 1024 * 1024){ toast("File troppo grande per l'app (oltre 80 MB): esportalo dal computer", true); return; }
    const b64 = (await blobToDataURL(blob)).split(",")[1];
    window.ReactNativeWebView.postMessage(JSON.stringify({type:"save", name, mime:blob.type || "application/octet-stream", b64})); return;
  }
  // app per Windows e Mac (app-desktop/, Electron): il download apre la finestra «Salva con nome» (gestita dall'app)
  // telefono e tablet nel browser: dove si può, il pannello di condivisione del sistema (Salva su File, AirDrop, Drive…)
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare){
    try { const f = new File([blob], name, {type:blob.type || "application/octet-stream"}); if (navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:name}); return; } }
    catch(e){ if (e?.name === "AbortError") return; }   // altrimenti (gesto scaduto, tipo non ammesso) si scarica come al solito
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000); toast("Scaricato: " + name);
}
const slug = () => slugify(P.name || "progetto");
const zipNeeded = ext => inArtifact() && !ALLOWED.includes(ext);
const b64 = buf => { let s = "", u = new Uint8Array(buf); for (let i=0;i<u.length;i+=0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i+0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const canvasBytes = (c, type="image/png") => new Promise(r => c.toBlob(b => b.arrayBuffer().then(x => r(new Uint8Array(x))), type, .92));
function imgToCanvas(img, max=2048){ const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight; const k = Math.min(1, max/Math.max(w,h)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w*k)); c.height = Math.max(1, Math.round(h*k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c; }

/* ---------------- Esportazioni ---------------- */
const EX = {ground:false, objects:true, scale:100, minMm:1.2, baseMm:2, split:true, roof:true, pobj:false, fmt3:"3mf", res:2};
function renderExport(){
  const pb = printBox();
  $("#panel-export").innerHTML = `
  <div class="exp"><header><h4>Per D5 Render e altri motori</h4><span class="tag">metri · Y in alto</span></header>
    <p class="note">Ogni materiale è un oggetto separato con un nome leggibile (es. <b>Muri · Intonaco bianco · Piano terra</b>), così in D5 lo sostituisci con un clic.</p>
    <label class="chk"><input type="checkbox" id="exObj" ${EX.objects?"checked":""}> Includi arredi, verde, persone e modelli importati</label>
    <label class="chk"><input type="checkbox" id="exGround" ${EX.ground?"checked":""}> Includi il terreno</label>
    <div class="btns"><button class="btn primary" id="exGlb">GLB${zipNeeded("glb")?" (.zip)":""}</button><button class="btn" id="exObjF">OBJ + MTL + texture (.zip)</button></div></div>
  <div class="exp"><header><h4>Immagini per il render AI</h4><span class="tag">vista 3D corrente</span></header>
    <p class="note">Il pacchetto contiene vista, profondità, contorni e mappa dei materiali, con il prompt. Per inviarli direttamente a un servizio usa la scheda <b>Render AI</b>.</p>
    <div class="row"><div class="f"><span class="lbl">Risoluzione</span><select id="exRes" class="inp"><option value="1">1× schermo</option><option value="2">2× schermo</option><option value="3">3× schermo</option></select></div><div class="f" style="justify-content:flex-end"><button class="btn" id="exPng">Solo immagine PNG</button></div></div>
    <button class="btn primary" id="exAi">Pacchetto AI (.zip)</button></div>
  <div class="exp"><header><h4>Per la stampa 3D</h4><span class="tag">millimetri · Z in alto</span></header>
    <div class="row"><div class="f"><span class="lbl">Scala</span><select id="exScale" class="inp">${[50,100,200,500].map(s=>`<option value="${s}" ${EX.scale===s?"selected":""}>1:${s}</option>`).join("")}</select></div>
      <div class="f"><span class="lbl">Formato</span><select id="exFmt3" class="inp"><option value="3mf" ${EX.fmt3==="3mf"?"selected":""}>3MF (consigliato)</option><option value="stl" ${EX.fmt3==="stl"?"selected":""}>STL</option></select></div></div>
    <div class="row">${F("exMin","Parete minima (mm)",fmt(EX.minMm,1),'inputmode="decimal"')}${F("exBase","Basamento (mm)",fmt(EX.baseMm,1),'inputmode="decimal" placeholder="0 = nessuno"')}</div>
    <label class="chk"><input type="checkbox" id="exSplit" ${EX.split?"checked":""}> Piani e copertura come pezzi separati, impilabili</label>
    <label class="chk"><input type="checkbox" id="exRoof" ${EX.roof?"checked":""}> Includi la copertura</label>
    <label class="chk"><input type="checkbox" id="exPObj" ${EX.pobj?"checked":""}> Includi arredi e alberi (spesso troppo sottili in scala)</label>
    <dl class="kv"><dt>Ingombro modello</dt><dd>${pb}</dd></dl>
    <p class="note">Le aperture diventano fori, vetri e telai vengono esclusi, i muri più sottili della parete minima vengono ispessiti.</p>
    <button class="btn primary" id="exPrint">Esporta per la stampa${(EX.fmt3==="3mf"?zipNeeded("3mf"):zipNeeded("stl"))?" (.zip)":""}</button></div>
  <div class="exp"><header><h4>Pianta in DXF</h4><span class="tag">AutoCAD · Archicad · Revit</span></header>
    <p class="note">Piano corrente, in metri: layer MURI, APERTURE, LOCALI, ARREDI e TESTI.</p><button class="btn" id="exDxf">DXF del piano${zipNeeded("dxf")?" (.zip)":""}</button></div>
  <div class="exp"><header><h4>Progetto</h4><span class="tag">.json</span></header>
    <p class="note">Contiene tutto, compresi modelli e materiali importati. I modelli delle librerie online vengono riscaricati all'apertura. Tutti i progetti di questo browser sono nel pulsante <b>Progetti</b> in alto.</p><button class="btn" id="exJson">Salva progetto</button></div>
  ${shareHTML()}${tavoleHTML()}${imagesExportHTML()}${moreExportHTML()}`;
  $("#exRes").value = EX.res; afterRenderExportShare();
}
const PE = $("#panel-export");
PE.addEventListener("change", e => { const t = e.target, v = num(t.value);
  ({exObj:()=>EX.objects=t.checked, exGround:()=>EX.ground=t.checked, exRes:()=>EX.res=+t.value, exScale:()=>{EX.scale=+t.value; renderExport();}, exFmt3:()=>{EX.fmt3=t.value; renderExport();},
    exMin:()=>{ if(v>0) EX.minMm=v; renderExport(); }, exBase:()=>{ if(v>=0) EX.baseMm=v; renderExport(); }, exSplit:()=>EX.split=t.checked, exRoof:()=>{EX.roof=t.checked; renderExport();}, exPObj:()=>{EX.pobj=t.checked; renderExport();}}[t.id]||(()=>{}))();
});
PE.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return; b.disabled = true;
  try {
    if (b.id === "exGlb") await exportGLB();
    if (b.id === "exObjF") await exportOBJ();
    if (b.id === "exPng") await saveFile(`${slug()}-vista.png`, new Blob([await canvasBytes(renderAt(EX.res))]));
    if (b.id === "exAi") await exportAI();
    if (b.id === "exPrint") await exportPrint();
    if (b.id === "exDxf") await saveFile(slug() + "-" + slugify(level().name) + ".dxf", exportDXF());
    if (b.id === "exJson") await exportProject();
  } catch(err){ console.error(err); toast("Esportazione non riuscita: " + (err.message || err), true); }
  b.disabled = false;
});
function exportRoot(){ return buildModel({ground:EX.ground, objects:EX.objects}).root; }
function exportGLB(){ return new Promise((res, rej) => { new THREE.GLTFExporter().parse(exportRoot(), async buf => { await saveFile(slug() + ".glb", new Blob([buf])); res(); }, rej, {binary:true, onlyVisible:true, maxTextureSize:2048}); }); }
async function exportOBJ(){
  const root = exportRoot(); root.updateMatrixWorld(true);
  let obj = `# Pianta Libera — ${P.name}\n# unità: metri, Y in alto\nmtllib modello.mtl\n`; let vo = 1; const mats = new Map(); let gi = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  const keyOf = m => { if (!m.userData.objKey) m.userData.objKey = slugify(m.userData.key || m.name || ("materiale-" + (gi++))) + "_" + (mats.size); return m.userData.objKey; };
  root.traverse(o => {
    if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    const ml = Array.isArray(o.material) ? o.material : [o.material]; const groups = (Array.isArray(o.material) && g.groups.length) ? g.groups : [{start:0, count:p.count, materialIndex:0}];
    nm.getNormalMatrix(o.matrixWorld);
    obj += `o ${(o.name||"oggetto").replace(/\s+/g,"_")}\n`;
    for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld); obj += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`; }
    for (let i=0;i<p.count;i++){ if (nn) n.fromBufferAttribute(nn,i).applyMatrix3(nm).normalize(); else n.set(0,1,0); obj += `vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}\n`; }
    for (let i=0;i<p.count;i++){ obj += uv ? `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}\n` : `vt 0 0\n`; }
    for (const gr of groups){ const m = ml[gr.materialIndex] || ml[0]; const k = keyOf(m); mats.set(k, m); obj += `usemtl ${k}\n`;
      for (let i=gr.start;i<gr.start+gr.count;i+=3){ const a = vo+i, b = vo+i+1, c = vo+i+2; obj += `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`; } }
    vo += p.count;
  });
  const files = {}; let mtl = "# Materiali Pianta Libera\n";
  for (const [k, m] of mats){ const c = m.color || new THREE.Color("#cccccc");
    mtl += `\nnewmtl ${k}\n# ${m.name || k}\nKd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\nKa 0 0 0\nKs 0.05 0.05 0.05\nNs 20\nd ${m.transparent ? (m.opacity ?? 1).toFixed(2) : "1"}\n`;
    const img = m.map?.image; if (img){ try { const cv = imgToCanvas(img, 2048); files[`texture/${k}.png`] = await canvasBytes(cv); mtl += `map_Kd texture/${k}.png\n`; if (m.alphaTest > 0) mtl += `map_d texture/${k}.png\n`; } catch(_){} }
  }
  files["modello.obj"] = fflate.strToU8(obj); files["modello.mtl"] = fflate.strToU8(mtl);
  files["LEGGIMI.txt"] = fflate.strToU8(`Modello esportato da Pianta Libera\nProgetto: ${P.name}\nUnità: metri. Asse verticale: Y.\nIn D5 Render: importa modello.obj; i materiali hanno nomi leggibili (vedi modello.mtl) e si sostituiscono con la libreria D5.\nFogliame: le texture delle foglie hanno trasparenza (map_d).\n`);
  await saveFile(slug() + "-obj.zip", new Blob([fflate.zipSync(files)]));
}
async function aiImages(opts){
  const beauty = renderAt(1, null, opts), depth = depthCanvas(1, opts), lines = linesCanvas(1, opts), mats = materialsCanvas(1, opts);
  return {beauty, depth, lines, mats};
}
async function exportAI(){
  const size = renderer.getSize(new THREE.Vector2()); const im = await aiImages({longSide: Math.max(size.x, size.y) * EX.res});
  const files = {"vista.png": await canvasBytes(im.beauty), "profondita.png": await canvasBytes(im.depth), "linee.png": await canvasBytes(im.lines), "materiali.png": await canvasBytes(im.mats.canvas),
    "materiali.json": fflate.strToU8(JSON.stringify(im.mats.legend, null, 2)), "prompt.txt": fflate.strToU8(aiPrompt()),
    "LEGGIMI.txt": fflate.strToU8(`Pacchetto per render AI — ${P.name}\n\nvista.png       immagine di partenza (image-to-image)\nprofondita.png  mappa di profondità (vicino = chiaro) per ControlNet Depth\nlinee.png       contorni per ControlNet Lineart/Canny\nmateriali.png   zone dei materiali a colori piatti (legenda in materiali.json)\nprompt.txt      descrizione del progetto\n\nConsiglio: chiedi sempre di mantenere invariate geometria, aperture e proporzioni.\n`)};
  await saveFile(`${slug()}-pacchetto-ai.zip`, new Blob([fflate.zipSync(files)]));
}
function aiPrompt(){
  const ws = P.walls, mats = [...new Set(ws.map(w=>matName(w.mat).toLowerCase()))], floors = [...new Set(P.rooms.map(r=>matName(r.mat).toLowerCase()))];
  const roofL = P.levels.find(l=>l.roof?.type !== "none"), roof = roofL ? ({gable:`tetto a due falde in ${matName(roofL.roof.mat).toLowerCase()}`, hip:`tetto a padiglione in ${matName(roofL.roof.mat).toLowerCase()}`, shed:`tetto a una falda in ${matName(roofL.roof.mat).toLowerCase()}`}[roofL.roof.type] || `copertura piana`) : "";
  const el = P.sun.el, luce = el < 0 ? "scena notturna, cielo scuro, luci artificiali accese all'interno e calde riflessioni" : el < 12 ? "luce radente del tramonto, toni caldi" : el < 30 ? "luce del pomeriggio, ombre lunghe e morbide" : "luce piena del giorno, cielo con nuvole leggere";
  const trees = [...new Set(P.objects.filter(o => LIBMAP[libRef(o.ref)]?.cat === "Verde").map(o => LIBMAP[libRef(o.ref)].nome.toLowerCase()))];
  const people = P.objects.some(o => LIBMAP[libRef(o.ref)]?.cat === "Persone");
  const n = P.levels.length;
  // punto di vista reale della camera: il prompt non deve contraddire l'immagine di riferimento
  let pitch = 10, interno = false;
  try { const d = controls.target.clone().sub(camera.position); pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI; interno = camera.fov > 55; } catch(e){}
  const vista = pitch > 40 ? ["vista aerea dall'alto: si vedono solo il terreno e la copertura, niente cielo né orizzonte", "high aerial view looking down, no sky, no horizon"]
    : pitch > 15 ? ["vista a volo d'uccello dall'alto, inclinata", "elevated bird's-eye view"]
    : ["inquadratura a altezza d'uomo", "eye-level"];
  return `Fotografia architettonica fotorealistica di un edificio ${n>1?`a ${n} piani`:"a un piano"}${roof?`, ${roof}`:""}, facciate in ${mats.join(" e ")}, serramenti in alluminio antracite con grandi vetrate${interno ? `, pavimenti interni in ${floors.join(" e ") || "legno"}` : ""}. ${luce[0].toUpperCase()+luce.slice(1)}. ${trees.length ? `Vegetazione: ${trees.join(", ")}, prato curato.` : "Giardino curato con prato."}${interno ? "" : " Intorno all'edificio il terreno resta a prato come nel modello, senza pavimentazioni, muri o recinzioni aggiunti."}${people ? " Alcune persone a misura d'uomo danno la scala." : ""} Obiettivo 24 mm, ${vista[0]}, colori naturali, alta definizione.
Mantieni esattamente geometria, aperture, proporzioni e punto di vista dell'immagine di riferimento; non aggiungere piani, volumi, muri o recinzioni.

EN: Photorealistic architectural photograph, ${n>1?n+"-storey":"single-storey"} building, ${roofL?.roof.type==="gable"?"pitched gable roof":roofL?.roof.type==="hip"?"hipped roof":roofL?.roof.type==="shed"?"single-pitch shed roof":"flat roof"}, ${ws.some(w=>w.mat==="mattone")?"exposed brick and ":""}rendered facades, anthracite aluminium window frames, ${el<0?"night scene, warm interior lights glowing":el<12?"warm golden-hour light":el<30?"soft afternoon light":"bright daylight, light clouds"}, ${trees.length ? trees.length + " kinds of mature trees, " : ""}landscaped garden${interno ? "" : ", lawn all around exactly as in the model, no added paving, walls or fences"}${people ? ", a few people for scale" : ""}, 24mm lens, ${vista[1]}, natural colours. Keep the exact geometry, openings, proportions and camera angle of the reference image.`;
}
/* stampa 3D */
function printGroups(){
  const k = 1000/EX.scale, minT = EX.minMm/k;
  const {parts} = buildModel({print:true, minThick:minT, noFill:true, objects:EX.pobj, roof:EX.roof, ground:false});
  const pieces = [];
  const toPrint = grp => { const geos = []; grp.updateMatrixWorld(true); grp.traverse(o => { if (o.isMesh && !(o.material?.alphaTest > 0) && !o.material?.transparent){ const g = clean(o.geometry.clone()); g.applyMatrix4(o.matrixWorld); geos.push(g); } }); if (!geos.length) return null; const m = THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false); m.scale(k,k,k); m.rotateX(Math.PI/2); return m; };
  const order = [...P.levels].sort((a,b)=>a.elev-b.elev).map(l=>l.id).filter(id=>parts[id]); if (parts.roof) order.push("roof");
  if (EX.baseMm > 0 && order.length){
    const L0 = level(order[0]), ws = wallsOf(L0.id); if (ws.length){ const xs = ws.flatMap(w=>[w.a[0],w.b[0]]), ys = ws.flatMap(w=>[w.a[1],w.b[1]]); const pad = 1.0, bt = EX.baseMm/k, top = L0.elev - L0.slab;
      parts[order[0]].add(new THREE.Mesh(boxGeo((Math.min(...xs)+Math.max(...xs))/2, top - bt/2 + 1e-4, (Math.min(...ys)+Math.max(...ys))/2, Math.max(...xs)-Math.min(...xs)+2*pad, bt, Math.max(...ys)-Math.min(...ys)+2*pad))); } }
  if (EX.split){ for (const id of order){ const g = toPrint(parts[id]); if (g) pieces.push({name: id === "roof" ? "Copertura" : level(id).name, geo:g}); } }
  else { const all = new THREE.Group(); for (const id of order) all.add(parts[id]); const g = toPrint(all); if (g) pieces.push({name:P.name, geo:g}); }
  let x = 0;
  for (const pc of pieces){ pc.geo.computeBoundingBox(); const bb = pc.geo.boundingBox; pc.geo.translate(x - bb.min.x, -(bb.min.y+bb.max.y)/2, -bb.min.z); pc.geo.computeBoundingBox(); pc.size = pc.geo.boundingBox.getSize(new THREE.Vector3()); x += pc.size.x + 10; }
  return pieces;
}
function printBox(){ try { const k = 1000/EX.scale; const {root} = buildModel({print:true, noFill:true, objects:EX.pobj, roof:EX.roof}); const b = new THREE.Box3().setFromObject(root); if (b.isEmpty()) return "—"; const s = b.getSize(new THREE.Vector3()).multiplyScalar(k); return `${Math.round(s.x)} × ${Math.round(s.z)} × ${Math.round(s.y)} mm`; } catch(e){ return "—"; } }
function stlBinary(geo){ const p = geo.attributes.position, tri = p.count/3, buf = new ArrayBuffer(84 + tri*50), dv = new DataView(buf); dv.setUint32(80, tri, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(); let o = 84;
  for (let i=0;i<tri;i++){ a.fromBufferAttribute(p,i*3); b.fromBufferAttribute(p,i*3+1); c.fromBufferAttribute(p,i*3+2); n.subVectors(c,b).cross(t.subVectors(a,b)).normalize();
    for (const vv of [n,a,b,c]){ dv.setFloat32(o,vv.x,true); dv.setFloat32(o+4,vv.y,true); dv.setFloat32(o+8,vv.z,true); o+=12; } o+=2; }
  return new Uint8Array(buf); }
function model3mf(pieces){
  let res = "", build = "";
  pieces.forEach((pc, i) => { const id = i+1, p = pc.geo.attributes.position; const vs = [], ts = []; const map = new Map(); let nv = 0; const idx = [];
    for (let j=0;j<p.count;j++){ const x=p.getX(j), y=p.getY(j), z=p.getZ(j), key = `${Math.round(x*1e4)},${Math.round(y*1e4)},${Math.round(z*1e4)}`; let k = map.get(key); if (k === undefined){ k = nv++; map.set(key, k); vs.push(`<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`); } idx.push(k); }
    for (let j=0;j<idx.length;j+=3){ if (idx[j]===idx[j+1]||idx[j+1]===idx[j+2]||idx[j]===idx[j+2]) continue; ts.push(`<triangle v1="${idx[j]}" v2="${idx[j+1]}" v3="${idx[j+2]}"/>`); }
    res += `<object id="${id}" name="${esc(pc.name)}" type="model"><mesh><vertices>${vs.join("")}</vertices><triangles>${ts.join("")}</triangles></mesh></object>`; build += `<item objectid="${id}"/>`; });
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="it-IT" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${esc(P.name)}</metadata><metadata name="Application">Pianta Libera</metadata><resources>${res}</resources><build>${build}</build></model>`;
  return fflate.zipSync({"[Content_Types].xml": fflate.strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`),
    "_rels/.rels": fflate.strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`),
    "3D/3dmodel.model": fflate.strToU8(model)});
}
async function exportPrint(){
  const pieces = printGroups(); if (!pieces.length){ toast("Non c'è niente da stampare", true); return; }
  const base = `${slug()}-1-${EX.scale}`;
  if (EX.fmt3 === "3mf") await saveFile(base + ".3mf", new Blob([model3mf(pieces)]));
  else if (pieces.length === 1) await saveFile(base + ".stl", new Blob([stlBinary(pieces[0].geo)]));
  else { const files = {}; pieces.forEach((pc,i) => files[`${String(i+1).padStart(2,"0")}-${slugify(pc.name)}.stl`] = stlBinary(pc.geo)); await saveFile(base + "-stl.zip", new Blob([fflate.zipSync(files)])); }
}
/* Tabella dei layer (DXF R12): ogni layer usato dalle entità viene dichiarato con colore e linea continua, così
   anche i CAD che non creano i layer mancanti li mostrano (#57). Si inserisce dopo l'intestazione. */
const DXF_COLORS = {MURI:7, APERTURE:4, LOCALI:3, TESTI:2, ARREDI:8, QUOTE:1, SEZIONE:6, CARTIGLIO:7};
function dxfWithLayers(out){
  const used = new Set(); for (let i = 0; i + 1 < out.length; i += 2) if (out[i] === "8") used.add(out[i + 1]);   // coppie codice/valore
  used.add("0"); let at = -1; for (let i = 0; i + 1 < out.length; i += 2) if (out[i] === "0" && out[i + 1] === "ENDSEC"){ at = i + 2; break; } if (at < 0) return out;
  const t = ["0","SECTION","2","TABLES","0","TABLE","2","LTYPE","70","1","0","LTYPE","2","CONTINUOUS","70","0","3","Continua","72","65","73","0","40","0.0","0","ENDTAB","0","TABLE","2","LAYER","70",String(used.size)];
  let c = 1; for (const n of used) t.push("0","LAYER","2",n,"70","0","62",String(DXF_COLORS[n] || (c++ % 6) + 1),"6","CONTINUOUS");
  t.push("0","ENDTAB","0","ENDSEC");
  return [...out.slice(0, at), ...t, ...out.slice(at)];
}
function exportDXF(){
  const L = level(), out = ["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","9","$INSUNITS","70","6","0","ENDSEC","0","SECTION","2","ENTITIES"];
  const line = (lay, a, b) => out.push("0","LINE","8",lay,"10",a[0].toFixed(4),"20",(-a[1]).toFixed(4),"30","0","11",b[0].toFixed(4),"21",(-b[1]).toFixed(4),"31","0");
  const text = (lay, p, h, s) => out.push("0","TEXT","8",lay,"10",p[0].toFixed(4),"20",(-p[1]).toFixed(4),"30","0","40",h.toFixed(3),"1",s,"72","1","11",p[0].toFixed(4),"21",(-p[1]).toFixed(4),"31","0");
  for (const w of wallsOf(L.id)){ const {cuts, solids} = wallSolidRanges(w), h = w.thick/2;
    for (const [s0,s1] of solids){ const q = [ptOnWall(w,s0,-h), ptOnWall(w,s1,-h), ptOnWall(w,s1,h), ptOnWall(w,s0,h)]; for (let i=0;i<4;i++) line("MURI", q[i], q[(i+1)%4]); }
    for (const c of cuts){ const o = c.o; if (o.type === "window"){ for (const off of [-h/4, h/4]) line("APERTURE", ptOnWall(w,c.s0,off), ptOnWall(w,c.s1,off)); }
      else { const flip = o.flip||0, hs = (flip&1)?c.s1:c.s0, side=(flip&2)?-1:1, f = wallFrame(w), H = ptOnWall(w,hs,side*h), O = [H[0]+f.nx*side*o.w, H[1]+f.ny*side*o.w]; line("APERTURE", H, O);
        const E = ptOnWall(w,(flip&1)?c.s0:c.s1, side*h); let a1 = Math.atan2(-(O[1]-H[1]), O[0]-H[0])*180/Math.PI, a2 = Math.atan2(-(E[1]-H[1]), E[0]-H[0])*180/Math.PI; let d = a2-a1; while(d>180) d-=360; while(d<-180) d+=360; const [sa,ea] = d>0 ? [a1,a2] : [a2,a1];
        out.push("0","ARC","8","APERTURE","10",H[0].toFixed(4),"20",(-H[1]).toFixed(4),"30","0","40",o.w.toFixed(4),"50",((sa+360)%360).toFixed(3),"51",((ea+360)%360).toFixed(3)); } } }
  for (const r of P.rooms.filter(r=>r.level===L.id)){ r.pts.forEach((p,i)=>line("LOCALI", p, r.pts[(i+1)%r.pts.length])); const c = polyCentroid(r.pts); text("TESTI", c, .25, r.name || "Locale"); text("TESTI", [c[0], c[1]+.4], .18, fmt(Math.abs(polyArea(r.pts))) + " mq"); }
  for (const o of P.objects.filter(o=>o.level===L.id)){ const fp = objFootprint(o), a = THREE.MathUtils.degToRad(o.rot||0); const pts = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz]) => { const lx = fp.cx + sx*fp.w/2, lz = fp.cz + sz*fp.d/2; return [o.x + lx*Math.cos(a) + lz*Math.sin(a), o.y - lx*Math.sin(a) + lz*Math.cos(a)]; }); for (let i=0;i<4;i++) line("ARREDI", pts[i], pts[(i+1)%4]); }
  out.push("0","ENDSEC","0","EOF"); return dxfWithLayers(out).join("\n");
}
function projectData(){
  const data = JSON.parse(JSON.stringify(P)); data.imports = {};
  for (const [id, it] of Object.entries(importStore)) if (P.objects.some(o => o.kind === "import" && o.ref === id)) data.imports[id] = {file:it.file, opts:it.opts, source:it.source};
  // modelli non ancora ricaricati (o non leggibili) dopo la riapertura: si conservano così come erano nella raccolta
  for (const o of P.objects) if (o.kind === "import" && !data.imports[o.ref] && pendingImports[o.ref]) data.imports[o.ref] = pendingImports[o.ref];
  data.app = "Pianta Libera"; data.version = SCHEMA_VERSION; return data;
}
async function exportProject(){ await saveFile(slug() + ".json", JSON.stringify(projectData())); }
/* apre un progetto (file .json o raccolta): keepPid tiene l'identità del progetto nella raccolta */
const pendingImports = {};   // file dei modelli importati letti dalla raccolta e non ancora in importStore
async function openProjectData(data, opts = {}){
  if (!data?.levels || !data.walls) throw new Error("non è un progetto di Pianta Libera");
  const imports = data.imports || {}; delete data.imports; delete data.app; if (!opts.keepPid || !data.pid) data.pid = uid();
  P = migrate(data); S.level = P.levels[0].id; setSel([]); $("#projName").value = P.name; S.comments = []; SH.loadedFor = null; loadGallery();
  for (const [id, it] of Object.entries(imports)){ try { if (it.file) await registerImport(id, it.file, it.opts || {unit:"auto", up:"auto"}); else if (it.source) await restoreRemote(id, it.source); } catch(err){ console.warn(err); } }
  past.length = 0; future.length = 0; snap = null; commit(); fitPlan(); applySky(); camPreset("ext");
}

/* ---------------- Importazioni ---------------- */
let dxfPending = null;
function renderImport(){
  const el = $("#panel-import"); const pm = projMatKeys();
  el.innerHTML = `
  ${f3PanelHTML()}
  ${autoPanelHTML()}
  <div class="exp"><header><h4>Pianta da ricalcare</h4><span class="tag">DWG · DXF · PDF · PNG · JPG</span></header>
    <p class="note">La pianta diventa la base del piano corrente. Poi la calibri con una misura nota e ci disegni sopra muri e aperture.</p>
    <button class="btn primary" id="imPlan">Scegli file della pianta</button>
    <p class="note">Anche DWG: il lettore (libredwg) si scarica alla prima apertura.</p></div>
  ${dxfPending ? dxfPanel() : ""}
  <div class="exp"><header><h4>Modello 3D con materiali</h4><span class="tag">SketchUp · DAE · OBJ · glTF · FBX · 3DS · STL</span></header>
    <p class="note"><b>Da SketchUp:</b> File → Esporta → Modello 3D → <b>COLLADA (.dae)</b> con «Esporta mappe di texture». Seleziona insieme il file .dae e la cartella delle texture (o comprimi tutto in un .zip). Vanno bene anche OBJ+MTL+texture e glTF.</p>
    <div class="row"><div class="f"><span class="lbl">Unità del file</span><select id="imUnit" class="inp"><option value="auto">Automatica</option><option value="1">Metri</option><option value="0.01">Centimetri</option><option value="0.001">Millimetri</option><option value="0.0254">Pollici</option></select></div>
      <div class="f"><span class="lbl">Asse verticale</span><select id="imUp" class="inp"><option value="auto">Automatico</option><option value="y">Y</option><option value="z">Z</option></select></div></div>
    <label class="chk"><input type="checkbox" id="imMats" checked> Aggiungi i materiali alla libreria del progetto</label>
    <button class="btn primary" id="imModel">Scegli i file del modello</button>
    <p class="note">Il file .skp non si apre direttamente: è un formato chiuso che solo SketchUp sa leggere.</p></div>
  <div class="exp"><header><h4>Materiali del progetto</h4><span class="tag">${pm.length}</span></header>
    ${pm.length ? `<div class="mlist">${pm.map(k => { const m = P.materials[k]; return `<div class="mi"><i style="${swatchStyle(k)}"></i><div class="f"><input class="inp" data-mname="${esc(k)}" value="${esc(m.nome)}" aria-label="Nome materiale"><label class="tag">ripetizione <input class="inp" data-msize="${esc(k)}" value="${fmt(m.size||1)}" style="width:58px" inputmode="decimal"> m${m.source?` · ${esc(m.source)}`:""}</label></div><button class="btn danger" data-mdel="${esc(k)}" title="Rimuovi">✕</button></div>`; }).join("")}</div>` : `<p class="note">Qui compaiono i materiali dei modelli importati e le texture scaricate. Poi li trovi tra le finiture di muri, pavimenti e coperture.</p>`}
    <div class="btns"><button class="btn" id="imTex">Crea materiale da una foto</button></div></div>
  <details class="exp" id="phHdriBox"><summary>Cieli HDRI da Poly Haven</summary><div class="f"><input id="phHq" class="inp" placeholder="Cerca: sunny, sunset, field…"></div><div class="grid-online" id="phHdri"><p class="note">Carico…</p></div></details>
  <details class="exp" id="phTexBox"><summary>Texture PBR da Poly Haven</summary><div class="f"><input id="phTq" class="inp" placeholder="Cerca: brick, plaster, wood, tiles…"></div><div class="grid-online" id="phTex"><p class="note">Carico…</p></div></details>
  <div class="exp"><header><h4>Progetto</h4><span class="tag">.json</span></header><button class="btn" id="imProj">Apri progetto salvato</button></div>`;
  $("#phHdriBox").addEventListener("toggle", e => { if (e.target.open) hydratePHList("hdris"); }, {once:true});
  $("#phTexBox").addEventListener("toggle", e => { if (e.target.open) hydratePHList("textures"); }, {once:true});
  if (dxfPending) $("#dxU").value = String(dxfPending.unit);
  f3AfterRender();
}
function dxfPanel(){ const d = dxfPending;
  return `<div class="exp" id="dxfBox"><header><h4>${esc(d.name)}</h4><span class="tag">${d.count} entità</span></header>
    <div class="row"><div class="f"><span class="lbl">Unità del disegno</span><select id="dxU" class="inp"><option value="1">Metri</option><option value="0.01">Centimetri</option><option value="0.001">Millimetri</option></select></div>
    <div class="f"><span class="lbl">Come usarlo</span><select id="dxM" class="inp"><option value="vec">Base di ricalco</option><option value="walls">Linee → muri (asse)</option></select></div></div>
    <span class="lbl">Layer da usare</span><div class="layers">${Object.entries(d.layers).map(([n,c])=>`<label class="chk"><input type="checkbox" data-layer="${esc(n)}" ${d.sel.has(n)?"checked":""}> ${esc(n)} <span class="tag">${c}</span></label>`).join("")}</div>
    <div id="dxThickRow" ${d.mode==="walls"?"":"hidden"}>${F("dxT","Spessore muri (m)","0,30",'inputmode="decimal"')}</div>
    <p class="note">«Linee → muri» va bene per disegni a linea singola sull'asse del muro. Per piante con le due facce del muro usa la base di ricalco.</p>
    <div class="btns"><button class="btn primary" id="dxGo">Importa</button><button class="btn" id="dxNo">Annulla</button></div></div>`; }
const PI = $("#panel-import");
PI.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "imPlan") $("#fPlan").click(); if (b.id === "imModel") $("#fModel").click(); if (b.id === "imProj") $("#fProj").click(); if (b.id === "imTex") $("#fTex").click();
  if (b.id === "dxNo"){ dxfPending = null; renderImport(); }
  if (b.id === "dxGo") applyDXF();
  if (b.dataset.mdel){ const k = b.dataset.mdel; const used = P.walls.some(w=>w.mat===k) || P.rooms.some(r=>r.mat===k) || P.levels.some(l=>l.roof?.mat===k); if (used){ toast("Il materiale è in uso: cambialo prima su muri, pavimenti o coperture", true); return; } delete P.materials[k]; invalidateMat(k); commit(); renderImport(); }
  if (b.dataset.phh) pickPHHdri(b.dataset.phh, b.dataset.nome);
  if (b.dataset.pht) pickPHTexture(b.dataset.pht, b.dataset.nome);
});
PI.addEventListener("change", e => { const t = e.target;
  if (t.dataset.mname){ P.materials[t.dataset.mname].nome = t.value; invalidateMat(t.dataset.mname); commit(); return; }
  if (t.dataset.msize){ const v = num(t.value); if (v > 0){ P.materials[t.dataset.msize].size = v; commit(); } return; }
  if (t.id === "phHq") hydratePHList("hdris"); if (t.id === "phTq") hydratePHList("textures");
  if (!dxfPending) return;
  if (t.dataset.layer){ t.checked ? dxfPending.sel.add(t.dataset.layer) : dxfPending.sel.delete(t.dataset.layer); }
  if (t.id === "dxM"){ dxfPending.mode = t.value; $("#dxThickRow").hidden = t.value !== "walls"; }
  if (t.id === "dxU") dxfPending.unit = +t.value;
});
const readAs = (f, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r[how](f); });
$("#fPlan").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const ext = f.name.split(".").pop().toLowerCase();
  try { if (ext === "dxf" || ext === "dwg") await loadDXF(f); else if (ext === "pdf") await loadPDF(f); else setUnderlayImage(await readAs(f, "readAsDataURL"), f.name); }
  catch(err){ console.error(err); toast("Non riesco a leggere il file: " + (err.message||err), true); }
});
$("#fTex").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const im = new Image(); im.onload = () => { const c = imgToCanvas(im, 1024); const key = "foto_" + uid(); P.materials[key] = {nome:f.name.replace(/\.[^.]+$/,""), color:"#ffffff", mapData:c.toDataURL("image/jpeg", .88), size:1, rough:.8, source:"foto"}; commit(); renderImport(); toast("Materiale creato: imposta la misura di ripetizione"); }; im.src = await readAs(f, "readAsDataURL"); });
function setUnderlayImage(src, name, mppGuess){
  const im = new Image(); im.onload = () => {
    const mpp = mppGuess || 20 / Math.max(im.naturalWidth, im.naturalHeight);
    level().underlay = {kind:"img", src, ox: V.cx - im.naturalWidth*mpp/2, oy: V.cy - im.naturalHeight*mpp/2, mpp, opacity:.5, name};
    commit(); setTool("calib"); toast("Pianta caricata: ora calibra la scala con una misura nota");
  }; im.src = src;
}
async function loadPDF(f){
  toast("Apro il PDF…");
  await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js");
  const lib = window.pdfjsLib, WS = new URL("https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js", location.href).href; // assoluto anche nel pacchetto locale
  lib.GlobalWorkerOptions.workerSrc = WS;
  try { if (!lib.GlobalWorkerOptions.workerPort) lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([`importScripts("${WS}");`], {type:"text/javascript"}))); } catch(_){}
  const doc = await lib.getDocument({data: new Uint8Array(await readAs(f, "readAsArrayBuffer"))}).promise;
  const page = await doc.getPage(1); const vp1 = page.getViewport({scale:1}); const scale = Math.min(4, 4000 / Math.max(vp1.width, vp1.height)); const vp = page.getViewport({scale});
  const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0,0,cv.width,cv.height);
  await page.render({canvasContext:g, viewport:vp}).promise;
  setUnderlayImage(cv.toDataURL("image/jpeg", .85), f.name, (0.0254/72) * 100 / scale);
  toast("PDF caricato con ipotesi 1:100: verifica con Calibra");
}
/* ---------- Lettura CAD: DXF (dxf-parser) e DWG (libredwg in WebAssembly) ---------- */
const DWG_LIB = "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.8.2";
let dwgLib = null;
async function readCAD(f){
  const ext = f.name.split(".").pop().toLowerCase();
  if (ext === "dwg"){
    if (!dwgLib){
      busy("Carico il lettore DWG (circa 11 MB, solo la prima volta)…");
      try { const m = await import(DWG_LIB + "/dist/libredwg-web.js"); dwgLib = await m.LibreDwg.create(DWG_LIB + "/wasm"); }
      catch(e){ console.warn(e); throw new Error("lettore DWG non disponibile (serve la connessione). In alternativa salva il disegno come DXF"); }
      finally { busy(""); }
    }
    let db;
    try { const ptr = dwgLib.dwg_read_data(await readAs(f, "readAsArrayBuffer"), 0); if (!ptr) throw new Error("file non riconosciuto"); db = dwgLib.convert(ptr); dwgLib.dwg_free(ptr); }
    catch(e){ console.warn(e); throw new Error("questo DWG non si legge (versione o contenuto non supportati): salvalo come DXF dal tuo CAD e riprova"); }
    return dwgToDxf(db);
  }
  await loadScript("https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.js");
  const Parser = window.DxfParser?.default || window.DxfParser; return new Parser().parseSync(await readAs(f, "readAsText"));
}
/** Database di libredwg → stessa forma di dxf-parser, così il resto del codice è uno solo. */
function dwgToDxf(db){
  const P2 = p => p ? {x:p.x || 0, y:p.y || 0} : {x:0, y:0};
  const conv = e => { const layer = e.layer || "0";
    switch (e.type){
      case "LINE": return {type:"LINE", layer, vertices:[P2(e.startPoint), P2(e.endPoint)]};
      case "LWPOLYLINE": case "POLYLINE2D": case "POLYLINE3D": return {type:"LWPOLYLINE", layer, vertices:(e.vertices || []).map(P2), shape:!!((e.flag || 0) & 513)};
      case "ARC": return {type:"ARC", layer, center:P2(e.center), radius:e.radius, startAngle:e.startAngle, endAngle:e.endAngle};
      case "CIRCLE": return {type:"CIRCLE", layer, center:P2(e.center), radius:e.radius};
      case "TEXT": return {type:"TEXT", layer, text:e.text, startPoint:P2(e.startPoint || e.insertionPoint), textHeight:e.textHeight};
      case "MTEXT": return {type:"MTEXT", layer, text:e.text, position:P2(e.insertionPoint), height:e.textHeight};
      case "INSERT": return {type:"INSERT", layer, name:e.name, position:P2(e.insertionPoint), xScale:e.xScale || 1, yScale:e.yScale || 1, rotation:(e.rotation || 0) * 180 / Math.PI,
        attribs:(e.attribs || []).map(a => ({type:"TEXT", layer:a.layer || layer, text:a.text?.text ?? a.text, startPoint:P2(a.text?.startPoint || a.startPoint)}))};
      default: return null;
    } };
  const blocks = {};
  for (const b of db.tables?.BLOCK_RECORD?.entries || []) if (b.name && !/^\*(model|paper)_space/i.test(b.name)) blocks[b.name] = {position:P2(b.basePoint), entities:(b.entities || []).map(conv).filter(Boolean)};
  return {entities:(db.entities || []).map(conv).filter(Boolean), blocks, header:{$INSUNITS:db.header?.INSUNITS}};
}
/** Esplode blocchi e polilinee: segmenti, archi (centro e raggio) e testi, nelle unità del disegno, y verso l'alto. */
function flattenCAD(dxf){
  const segs = [], arcs = [], texts = [];
  const T = (p, tr) => { const x = (p?.x||0)*tr.sx, y = (p?.y||0)*tr.sy; const c = Math.cos(tr.r), s = Math.sin(tr.r); return [x*c - y*s + tr.x, x*s + y*c + tr.y]; };
  const walk = (ents, tr, depth, layerOverride) => { for (const en of ents || []){ const lay = (en.layer === "0" && layerOverride) ? layerOverride : (en.layer || "0");
    if (en.type === "LINE" && en.vertices?.length >= 2){ const a = T(en.vertices[0], tr), b = T(en.vertices[1], tr); segs.push([a[0],a[1],b[0],b[1],lay]); }
    else if ((en.type === "LWPOLYLINE" || en.type === "POLYLINE") && en.vertices?.length){ const v = en.vertices.map(p=>T(p,tr)); for (let i=0;i<v.length-1;i++) segs.push([v[i][0],v[i][1],v[i+1][0],v[i+1][1],lay]); if (en.shape || en.closed) segs.push([v[v.length-1][0],v[v.length-1][1],v[0][0],v[0][1],lay]); }
    else if (en.type === "ARC" || en.type === "CIRCLE"){ let a0 = en.startAngle ?? 0, a1 = en.endAngle ?? Math.PI*2; if (a1 < a0) a1 += Math.PI*2; const sc = Math.abs(tr.sx); const cc = T(en.center, tr); arcs.push({cx:cc[0], cy:cc[1], r:en.radius*sc, layer:lay, full:en.type === "CIRCLE"});
      const n = Math.max(6, Math.ceil((a1-a0)/(Math.PI/16))); let prev = null; for (let i=0;i<=n;i++){ const a = a0 + (a1-a0)*i/n, p = T({x:en.center.x + Math.cos(a)*en.radius, y:en.center.y + Math.sin(a)*en.radius}, tr); if (prev) segs.push([prev[0],prev[1],p[0],p[1],lay]); prev = p; } }
    else if ((en.type === "TEXT" || en.type === "MTEXT") && en.text){ const p = T(en.startPoint || en.position || en.insertionPoint, tr); texts.push({x:p[0], y:p[1], text:en.text, layer:lay}); }
    else if (en.type === "INSERT" && depth < 4){
      for (const a of en.attribs || []) if (a.text){ const p = T(a.startPoint, {sx:1, sy:1, r:0, x:0, y:0}); texts.push({x:p[0], y:p[1], text:a.text, layer:a.layer || lay}); }
      const bl = dxf.blocks?.[en.name]; if (bl){ const r = (en.rotation||0)*Math.PI/180, sx = en.xScale||1, sy = en.yScale||1; const bx = bl.position?.x||0, by = bl.position?.y||0;
      const sub = {sx: tr.sx*sx, sy: tr.sy*sy, r: tr.r + r, x: 0, y: 0}; const ip = T(en.position, tr); const c = Math.cos(sub.r), s = Math.sin(sub.r); sub.x = ip[0] - (bx*sub.sx*c - by*sub.sy*s); sub.y = ip[1] - (bx*sub.sx*s + by*sub.sy*c); walk(bl.entities, sub, depth+1, lay); } } } };
  walk(dxf.entities, {sx:1, sy:1, r:0, x:0, y:0}, 0);
  const ins = dxf.header?.$INSUNITS; const unit = ins === 4 ? .001 : ins === 5 ? .01 : ins === 6 ? 1 : segs.length ? guessUnit(segs, arcs) : 1;
  return {segs, arcs, texts, unit};
}
async function loadDXF(f){
  const {segs, unit} = flattenCAD(await readCAD(f));
  if (!segs.length) throw new Error("nessuna linea trovata nel disegno");
  const layers = {}; segs.forEach(s => layers[s[4]] = (layers[s[4]]||0) + 1);
  dxfPending = {name:f.name, segs, layers, sel:new Set(Object.keys(layers)), mode:"vec", unit, count:segs.length};
  S.tab = "import"; renderTabs();
}
/** Unità del disegno quando l'intestazione non la dice: prima dai raggi delle porte (~0,8–1 m), poi dalla larghezza. */
function guessUnit(segs, arcs = []){
  const rs = arcs.filter(a => !a.full).map(a => a.r).sort((a,b) => a-b);
  if (rs.length >= 2){ const r = rs[rs.length >> 1]; for (const u of [1, .01, .001]) if (r * u > .5 && r * u < 1.4) return u; }
  let x0 = Infinity, x1 = -Infinity; for (const s of segs){ if (s[0] < x0) x0 = s[0]; if (s[2] < x0) x0 = s[2]; if (s[0] > x1) x1 = s[0]; if (s[2] > x1) x1 = s[2]; }
  const w = x1 - x0; return w > 30000 ? .001 : w > 300 ? .01 : 1;
}
function applyDXF(){
  const d = dxfPending, u = d.unit, segs = d.segs.filter(s => d.sel.has(s[4])); if (!segs.length){ toast("Seleziona almeno un layer", true); return; }
  const xs = segs.flatMap(s=>[s[0],s[2]]), ys = segs.flatMap(s=>[s[1],s[3]]); const minX = Math.min(...xs), maxY = Math.max(...ys);
  const lines = segs.map(s => [(s[0]-minX)*u, (maxY-s[1])*u, (s[2]-minX)*u, (maxY-s[3])*u]);
  if (d.mode === "vec"){ level().underlay = {kind:"vec", lines, ox:0, oy:0, k:1, opacity:.7, name:d.name}; }
  else { const t = num($("#dxT")?.value) || .3; for (const l of lines){ if (Math.hypot(l[2]-l[0], l[3]-l[1]) < .05) continue; P.walls.push({id:uid(), level:S.level, a:[l[0],l[1]], b:[l[2],l[3]], thick:t, height:null, mat:S.defaults.wallMat}); } }
  dxfPending = null; commit(); renderImport(); fitLines(lines); toast(d.mode === "vec" ? "DXF caricato come base di ricalco" : `Creati ${lines.length} muri dal DXF`);
}
function fitLines(lines){ const xs = lines.flatMap(l=>[l[0],l[2]]), ys = lines.flatMap(l=>[l[1],l[3]]); const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys); V.cx=(x0+x1)/2; V.cy=(y0+y1)/2; V.s = clamp(Math.min(W2/((x1-x0)+4), H2/((y1-y0)+4)), 3, 200); draw2D(); }

/* Modelli 3D: più file insieme o .zip (SketchUp → DAE con texture) */
async function loadFBXLibs(){ await loadScript(CDN3 + "curves/NURBSUtils.js"); await loadScript(CDN3 + "curves/NURBSCurve.js"); await loadScript(CDN3 + "loaders/FBXLoader.js"); }
const MAIN_ORDER = ["dae","gltf","glb","fbx","obj","3ds","stl"];
function buildFileMap(entries){ // entries: [{name, data:Uint8Array}]
  const map = {}; for (const e of entries){ const base = e.name.split(/[\\/]/).pop().toLowerCase(); map[base] = URL.createObjectURL(new Blob([e.data])); map[e.name.toLowerCase()] = map[base]; }
  return map;
}
async function parseModelBundle(entries){
  const main = MAIN_ORDER.map(x => entries.find(e => e.name.toLowerCase().endsWith("." + x))).find(Boolean);
  if (!main) throw new Error("nessun modello 3D tra i file (servono .dae, .gltf, .glb, .obj, .fbx, .3ds o .stl)");
  const ext = main.name.split(".").pop().toLowerCase(), fmap = buildFileMap(entries);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => { if (u.startsWith("blob:") || u.startsWith("data:")) return u; const d = decodeURIComponent(u).replace(/\\/g, "/"); const base = d.split("/").pop().split("?")[0].toLowerCase(); return fmap[d.toLowerCase()] || fmap[base] || u; });
  let pending = 0; const allLoaded = new Promise(res => { manager.onLoad = res; setTimeout(res, 15000); });
  manager.onStart = () => { pending++; };
  const text = () => new TextDecoder().decode(main.data), buf = () => main.data.buffer.slice(main.data.byteOffset, main.data.byteOffset + main.data.byteLength);
  let raw, autoUp = "y";
  if (ext === "dae"){ await loadScript(CDN3 + "loaders/ColladaLoader.js"); raw = new THREE.ColladaLoader(manager).parse(text(), "").scene; }
  else if (ext === "glb" || ext === "gltf"){ raw = (await new Promise((res, rej) => new THREE.GLTFLoader(manager).parse(ext === "gltf" ? text() : buf(), "", res, rej))).scene; }
  else if (ext === "obj"){ await loadScript(CDN3 + "loaders/OBJLoader.js"); const ol = new THREE.OBJLoader(manager); const objText = text();
    const mtlName = (objText.match(/^mtllib\s+(.+)$/m) || [])[1]?.trim(); const mtlEntry = entries.find(e => e.name.toLowerCase().endsWith(".mtl") && (!mtlName || e.name.toLowerCase().endsWith(mtlName.toLowerCase().split(/[\\/]/).pop())) ) || entries.find(e => e.name.toLowerCase().endsWith(".mtl"));
    if (mtlEntry){ await loadScript(CDN3 + "loaders/MTLLoader.js"); const mc = new THREE.MTLLoader(manager).parse(new TextDecoder().decode(mtlEntry.data), ""); mc.preload(); ol.setMaterials(mc); }
    raw = ol.parse(objText); }
  else if (ext === "fbx"){ await loadFBXLibs(); raw = new THREE.FBXLoader(manager).parse(buf(), ""); }
  else if (ext === "3ds"){ await loadScript(CDN3 + "loaders/TDSLoader.js"); raw = new THREE.TDSLoader(manager).parse(buf(), ""); autoUp = "z"; }
  else if (ext === "stl"){ await loadScript(CDN3 + "loaders/STLLoader.js"); const g = new THREE.STLLoader().parse(buf()); g.computeVertexNormals(); raw = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:"#c9c9c4", roughness:.7, name:"Neutro"})); autoUp = "z"; }
  if (pending) await allLoaded;
  return {raw, ext, autoUp, mainName:main.name};
}
async function registerImport(id, file, opts){
  // file: {name, ext, b64}; ext "zip" = pacchetto di più file
  const bytes = new Uint8Array(unb64(file.b64));
  const entries = file.ext === "zip" ? Object.entries(fflate.unzipSync(bytes)).filter(([n]) => !n.endsWith("/") && !n.startsWith("__MACOSX")).map(([name, data]) => ({name, data})) : [{name:file.name, data:bytes}];
  const {raw, ext, autoUp} = await parseModelBundle(entries);
  const up = opts.up === "auto" || !opts.up ? autoUp : opts.up;
  const r0 = raw.rotation.x, holder = new THREE.Group(); holder.add(raw); if (up === "z") raw.rotation.x = r0 - Math.PI/2;
  holder.updateMatrixWorld(true); const size = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3()); const big = Math.max(size.x, size.y, size.z);
  let k = opts.unit === "auto" || !opts.unit ? (ext === "dae" ? (big > 300 ? .01 : 1) : big > 300 ? .001 : big > 30 ? .01 : 1) : +opts.unit;
  holder.remove(raw); raw.rotation.x = r0;
  const obj = normalizeObject(raw, k, up);
  obj.traverse(o => { if (o.isMesh){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; if (!m.name) m.name = file.name.replace(/\.[^.]+$/,""); if (m.isMeshPhongMaterial || m.isMeshLambertMaterial) m.side = THREE.DoubleSide; }); } });
  importStore[id] = {obj, file, opts, materials: importStore[id]?.materials || []};
  return importStore[id];
}
function harvestMaterials(id, label){
  const st = importStore[id]; const seen = new Set(), added = [];
  st.obj.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
    if (!m || seen.has(m.uuid)) return; seen.add(m.uuid);
    const base = (m.name || "Materiale").replace(/^material[_\s-]*/i, "") || "Materiale";
    if (added.some(k => P.materials[k].nome.startsWith(base + " ·"))) return;
    let mapData = null; const img = m.map?.image; if (img) { try { const c = imgToCanvas(img, 1024); mapData = c.toDataURL(m.transparent ? "image/png" : "image/jpeg", .88); } catch(_){} }
    const key = "imp_" + slugify(base).slice(0, 24) + "_" + uid().slice(0, 4);
    P.materials[key] = {nome:`${base} · ${label}`, color:"#" + (m.color ? m.color.getHexString() : "cccccc"), tint: mapData && m.color ? "#" + m.color.getHexString() : undefined, mapData, size:1, rough: m.roughness ?? (m.shininess ? clamp(1 - m.shininess/120, .1, 1) : .8), metal:m.metalness ?? 0, opacity: m.opacity ?? 1, glass: m.transparent && (m.opacity ?? 1) < .6, source:label};
    added.push(key);
  }); });
  st.materials = added; return added;
}
$("#fModel").addEventListener("change", async e => { const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  try {
    busy("Leggo il modello…");
    let entries = [];
    for (const f of files){ const data = new Uint8Array(await readAs(f, "readAsArrayBuffer")); if (f.name.toLowerCase().endsWith(".zip")) for (const [name, d] of Object.entries(fflate.unzipSync(data))) { if (!name.endsWith("/") && !name.startsWith("__MACOSX")) entries.push({name, data:d}); } else entries.push({name:f.webkitRelativePath || f.name, data}); }
    const main = MAIN_ORDER.map(x => entries.find(en => en.name.toLowerCase().endsWith("." + x))).find(Boolean);
    const label = (main?.name || files[0].name).split(/[\\/]/).pop().replace(/\.[^.]+$/,"");
    const single = entries.length === 1;
    const file = single ? {name:entries[0].name, ext:entries[0].name.split(".").pop().toLowerCase(), b64:b64(entries[0].data)} : {name:label + ".zip", ext:"zip", b64:b64(fflate.zipSync(Object.fromEntries(entries.map(en => [en.name, en.data]))))};
    const id = "m" + uid(); await registerImport(id, file, {unit:$("#imUnit")?.value || "auto", up:$("#imUp")?.value || "auto"});
    let nm = 0; if ($("#imMats")?.checked) nm = harvestMaterials(id, label).length;
    const o = {id:uid(), level:S.level, kind:"import", ref:id, name:label, x:Math.round(V.cx*20)/20, y:Math.round(V.cy*20)/20, rot:0, scale:1, z:0};
    P.objects.push(o); S.sel = {type:"object", id:o.id}; busy(""); commit(); S.tab = "props"; renderTabs();
    const fp = objFootprint(o); toast(`Importato: ${fmt(fp.w)} × ${fmt(fp.d)} × ${fmt(fp.h)} m${nm ? ` · ${nm} materiali aggiunti alla libreria` : ""}`);
  } catch(err){ busy(""); console.error(err); toast("Import non riuscito: " + (err.message||err), true); }
});
$("#fProj").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { await saveToIdb(); await openProjectData(JSON.parse(await readAs(f, "readAsText"))); toast("Progetto aperto");
  } catch(err){ toast("Non riesco ad aprire il progetto: " + (err.message||err), true); }
});
