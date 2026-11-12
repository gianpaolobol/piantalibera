/* ============================================================
   Fase 4 — Ritocco AI con maschera e galleria nel progetto, video,
   esportazione IFC, anteprima di stampa 3D, pannello staccabile e
   ridimensionabile, uso con tablet (tocco prolungato, tasti di cammino)
   ============================================================ */

/* ---------- galleria dei render salvata con il progetto (IndexedDB) ---------- */
async function blobToDataURL(b){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
async function toDataURL(src){ if (/^data:/.test(src)) return src; const r = await fetch(src); if (!r.ok) throw new Error("immagine non raggiungibile"); return blobToDataURL(await r.blob()); }
async function saveGalleryItem(r){
  if (!P?.pid || S.viewer || !window.indexedDB) return;
  try { const src = await toDataURL(r.src); r.src = src; r.gid = r.gid || uid();
    await idbStore("immagini", "readwrite", s => s.put({id:r.gid, pid:P.pid, src, before:r.before, time:r.time, mode:r.mode, prompt:r.prompt || "", created:Date.now()}));
    const all = (await idbStore("immagini", "readonly", s => s.index("pid").getAll(P.pid))).sort((a, b) => b.created - a.created);
    for (const x of all.slice(40)) await idbStore("immagini", "readwrite", s => s.delete(x.id));
  } catch(e){ console.warn("galleria", e); }
}
async function loadGallery(){
  if (!P?.pid || !window.indexedDB) return;
  try { const all = (await idbStore("immagini", "readonly", s => s.index("pid").getAll(P.pid))).sort((a, b) => b.created - a.created);
    aiResults.length = 0; for (const x of all) aiResults.push({src:x.src, before:x.before, time:x.time, mode:x.mode, prompt:x.prompt, gid:x.id}); if (S.tab === "ai") renderAI(); }
  catch(e){ console.warn("galleria", e); }
}
async function deleteGalleryItem(i){ const r = aiResults[i]; if (!r) return; aiResults.splice(i, 1); if (r.gid) try { await idbStore("immagini", "readwrite", s => s.delete(r.gid)); } catch(e){} renderAI(); }

/* ---------- ritocco con maschera ----------
   Si dipinge la zona da cambiare sul render; il servizio rigenera l'immagine con la richiesta,
   poi qui si incolla solo la zona dipinta (bordi sfumati): il resto resta identico all'originale. */
const loadImg = src => new Promise((res, rej) => { const im = new Image(); if (!/^data:|^blob:/.test(src)) im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("immagine non caricabile")); im.src = src; });
async function compositeMask(orig, mask, genSrc){
  const W = orig.naturalWidth, H = orig.naturalHeight, gen = await loadImg(genSrc), mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const out = mk(W, H), og = out.getContext("2d"); og.drawImage(orig, 0, 0);
  const m = mk(W, H), mg = m.getContext("2d"); mg.filter = `blur(${Math.max(2, Math.round(W / 160))}px)`; mg.drawImage(mask, 0, 0, W, H);
  const t = mk(W, H), tg = t.getContext("2d"); tg.drawImage(gen, 0, 0, W, H); tg.globalCompositeOperation = "destination-in"; tg.drawImage(m, 0, 0);
  og.drawImage(t, 0, 0); return out.toDataURL("image/png");
}
async function openMaskEditor(r){
  closeMaskEditor(); let orig;
  try { orig = await loadImg(r.src); } catch(e){ toast("Non riesco a leggere questo render: " + e.message, true); return; }
  const d = document.createElement("div"); d.id = "maskBox"; d.className = "help pano"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Ritocco con maschera");
  d.innerHTML = `<div class="pano-in mask-in"><header><h3>Ritocca una zona</h3><span class="note">Dipingi la zona da cambiare, scrivi cosa vuoi: il resto dell'immagine resta identico.</span><button class="btn" id="mkClose" aria-label="Chiudi">✕</button></header>
    <div class="mask-stage"><canvas id="mkImg"></canvas><canvas id="mkMask"></canvas></div>
    <div class="mask-ctl"><label class="lbl" for="mkSize">Pennello</label><input type="range" id="mkSize" min="8" max="160" value="48"><button class="btn" id="mkErase" aria-pressed="false">Gomma</button><button class="btn" id="mkClear">Cancella</button>
      <input id="mkPrompt" class="inp" placeholder="Es. divano in velluto verde, parquet a spina di pesce, pianta in vaso nell'angolo" maxlength="400"><button class="btn primary" id="mkGo">Genera il ritocco</button></div><p class="status" id="mkStatus"></p></div>`;
  document.body.appendChild(d);
  const ci = $("#mkImg"), cm = $("#mkMask"); for (const c of [ci, cm]){ c.width = orig.naturalWidth; c.height = orig.naturalHeight; } ci.getContext("2d").drawImage(orig, 0, 0);
  const mg = cm.getContext("2d"); let down = false, erase = false;
  const paint = e => { const rc = cm.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * cm.width, y = (e.clientY - rc.top) / rc.height * cm.height, rad = +$("#mkSize").value / rc.width * cm.width / 2;
    mg.globalCompositeOperation = erase ? "destination-out" : "source-over"; mg.fillStyle = "#e0482c"; mg.beginPath(); mg.arc(x, y, rad, 0, Math.PI*2); mg.fill(); };
  cm.addEventListener("pointerdown", e => { down = true; cm.setPointerCapture(e.pointerId); paint(e); });
  cm.addEventListener("pointermove", e => { if (down) paint(e); });
  cm.addEventListener("pointerup", () => { down = false; });
  d.addEventListener("click", async e => {
    if (e.target === d || e.target.closest("#mkClose")){ closeMaskEditor(); return; }
    if (e.target.closest("#mkErase")){ erase = !erase; e.target.closest("#mkErase").setAttribute("aria-pressed", erase); }
    if (e.target.closest("#mkClear")) mg.clearRect(0, 0, cm.width, cm.height);
    if (e.target.closest("#mkGo")){
      const txt = $("#mkPrompt").value.trim(), st = $("#mkStatus"), px = mg.getImageData(0, 0, cm.width, cm.height).data; let any = false; for (let i = 3; i < px.length; i += 64) if (px[i]){ any = true; break; }
      if (!any){ st.textContent = "Dipingi prima la zona da cambiare."; st.className = "status err"; return; }
      if (!txt){ st.textContent = "Scrivi cosa vuoi nella zona dipinta."; st.className = "status err"; return; }
      st.textContent = "Invio al servizio di render…"; st.className = "status"; e.target.disabled = true;
      const base = document.createElement("canvas"); base.width = orig.naturalWidth; base.height = orig.naturalHeight; base.getContext("2d").drawImage(orig, 0, 0);
      const ok = await runAI(false, {override:{image:base, prompt:`${txt}. Cambia solo questo; mantieni identici inquadratura, prospettiva, architettura, luce e tutto il resto dell'immagine.`, composite:src => compositeMask(orig, cm, src), before:r.src}});
      if (ok) closeMaskEditor(); else { st.textContent = $("#aiStatus")?.textContent || "Non riuscito"; st.className = "status err"; e.target.disabled = false; }
    }
  });
}
function closeMaskEditor(){ document.getElementById("maskBox")?.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("maskBox")) closeMaskEditor(); });

/* ---------- video: percorso tra le camere salvate o giro attorno ---------- */
const VID = {stop:false, on:false};
function cameraPath(kind){
  if (kind === "camere"){ const cs = (P.cameras || []).filter(c => c.pos && c.target); if (cs.length < 2) throw new Error("servono almeno due camere salvate");
    const pc = new THREE.CatmullRomCurve3(cs.map(c => new THREE.Vector3(...c.pos)), false, "centripetal"), tc = new THREE.CatmullRomCurve3(cs.map(c => new THREE.Vector3(...c.target)), false, "centripetal");
    return t => { const e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2, seg = e * (cs.length - 1), i = Math.min(cs.length - 2, Math.floor(seg)), f = seg - i; return {pos:pc.getPoint(e), target:tc.getPoint(e), fov:(cs[i].fov || 45) * (1 - f) + (cs[i + 1].fov || 45) * f}; }; }
  const b = archBox(), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), R = Math.max(Math.hypot(camera.position.x - c.x, camera.position.z - c.z), Math.max(sz.x, sz.z) * 1.1, 8), y = Math.max(camera.position.y, 2), a0 = Math.atan2(camera.position.z - c.z, camera.position.x - c.x), tgt = new THREE.Vector3(c.x, Math.min(c.y, 2), c.z);
  return t => ({pos:new THREE.Vector3(c.x + Math.cos(a0 + t*Math.PI*2) * R, y, c.z + Math.sin(a0 + t*Math.PI*2) * R), target:tgt, fov:camera.fov});
}
async function recordVideo(kind, secs, hres){
  if (!window.MediaRecorder || !c3d.captureStream) throw new Error("questo browser non sa registrare video dalla vista 3D");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1", "video/mp4"].find(t => MediaRecorder.isTypeSupported(t)); if (!mime) throw new Error("nessun formato video disponibile");
  const path = cameraPath(kind), W = hres >= 1080 ? 1920 : hres >= 720 ? 1280 : 640, H = Math.round(W * 9 / 16);
  if (WALK.on) exitWalk(); const st = camState(), size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), asp = camera.aspect;
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); controls.enabled = false;
  const stream = c3d.captureStream(30), track = stream.getVideoTracks()[0], rec = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:W >= 1920 ? 16e6 : 8e6}), chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; const stopped = new Promise(r => rec.onstop = r);
  VID.on = true; VID.stop = false; rec.start(250); const fps = 30, N = Math.max(2, Math.round(secs * fps)), t0 = performance.now();
  try {
    for (let i = 0; i <= N && !VID.stop; i++){
      const c = path(i / N); camera.position.copy(c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(c.target); camera.updateMatrixWorld(); drawFrame();
      if (i % 10 === 0) busy(`Registro il video… ${Math.round(i / N * 100)}% · Esc per fermare`);
      await sleep(Math.max(0, t0 + (i + 1) * 1000 / fps - performance.now()));
    }
  } finally {
    rec.stop(); await stopped; track.stop(); VID.on = false; busy("");
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false); camera.aspect = asp; camera.updateProjectionMatrix(); controls.enabled = true; applyCamState(st); render3D();
  }
  const blob = new Blob(chunks, {type:mime.split(";")[0]});
  if (!blob.size) throw new Error("il browser non ha registrato fotogrammi: riprova con la scheda in primo piano o con un altro browser");
  return {blob, ext:mime.includes("mp4") ? "mp4" : "webm"};
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && VID.on) VID.stop = true; });

/* ---------- esportazione IFC4 (BIM): il calcolo è in shared/ifc.js (buildIFC), qui solo le superfici dal 3D ---------- */
function exportIFC(){
  const {root} = buildModel({ground:false, objects:true, roof:true}); root.updateMatrixWorld(true);
  const meshTess = (filter, elev) => { const pts = [], idx = []; root.traverse(o => { if (!o.isMesh || !filter(o)) return; const g = o.geometry, p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count, v = new THREE.Vector3();
      if (pts.length / 3 + n > 60000) return; const base = pts.length / 3;
      for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pts.push(v.x, -v.z, v.y - elev); }
      for (let i = 0; i + 2 < n; i += 3) idx.push([0, 1, 2].map(k => base + 1 + (ix ? ix.getX(i + k) : i + k))); });
    return idx.length ? {pts, idx} : null; };
  const objOf = m => { let x = m; while (x && !x.userData?.objId) x = x.parent; return x?.userData.objId; };
  return buildIFC(P, { matName, guid:ifcGuid, fileName:slug() + ".ifc",
    tess: (s, elev) => s.roof ? meshTess(o => (o.userData.cat === "roof" || o.userData.cat === "gable") && o.userData.level === s.roof, elev)
      : meshTess(m => objOf(m) === s.obj && !m.userData.leaves, elev),
    objInfo: ob => { const it = ob.kind === "lib" ? LIBMAP[libRef(ob.ref)] : null; if (it?.cat === "Verde" || it?.cat === "Persone") return null;
      return it?.param?.kind === "stair" ? {kind:"stair", shape:paramsOf(ob, it).shape} : it?.param?.kind === "rail" ? {kind:"rail"} : it?.cat === "Luci" ? {kind:"light"} : {kind:"furniture"}; } });
}

/* ---------- anteprima di stampa 3D ---------- */
const PRINTERS = [["Bambu Lab A1 / P1 / X1", 256, 256, 256], ["Prusa MK4", 250, 210, 220], ["Prusa Core One", 250, 220, 270], ["Creality K1", 220, 220, 250], ["Creality Ender 3", 220, 220, 250], ["Elegoo Saturn 4 (resina)", 218, 123, 220], ["Personalizzata 300×300", 300, 300, 300]];
function meshVolume(g){ const p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let v = 0; for (let i = 0; i + 2 < p.count; i += 3){ a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); v += a.dot(b.clone().cross(c)) / 6; } return Math.abs(v); }
function openPrintPreview(){
  closePrintPreview();
  const pieces = printGroups(); if (!pieces.length){ toast("Niente da stampare: il modello è vuoto", true); return; }
  const pi = PREFS.printer ?? 0, [pname, bx, by, bz] = PRINTERS[pi] || PRINTERS[0];
  const thin = P.walls.filter(w => w.thick * 1000 / EX.scale < EX.minMm).length;
  const rows = pieces.map(pc => { const vol = meshVolume(pc.geo) / 1000, fits = pc.size.x <= bx && pc.size.y <= by && pc.size.z <= bz, fitsR = pc.size.y <= bx && pc.size.x <= by && pc.size.z <= bz; return {pc, vol, fits:fits || fitsR, rot:!fits && fitsR}; });
  const d = document.createElement("div"); d.id = "printBox"; d.className = "help pano"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Anteprima di stampa 3D");
  const totV = rows.reduce((s, r) => s + r.vol, 0);
  d.innerHTML = `<div class="pano-in"><header><h3>Anteprima di stampa 3D · 1:${EX.scale}</h3><select id="prPrinter" class="inp" aria-label="Stampante">${PRINTERS.map((p, i) => `<option value="${i}" ${i === pi ? "selected" : ""}>${p[0]} · ${p[1]}×${p[2]}×${p[3]} mm</option>`).join("")}</select><button class="btn" id="prClose" aria-label="Chiudi">✕</button></header>
    <div class="print-body"><canvas id="prCv"></canvas><div class="print-info">
      <table class="olist"><thead><tr><th>Pezzo</th><th>mm</th><th>cm³</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.pc.name)}</td><td class="num">${Math.round(r.pc.size.x)}×${Math.round(r.pc.size.y)}×${Math.round(r.pc.size.z)}</td><td class="num">${fmt(r.vol, 1)}</td><td>${r.fits ? (r.rot ? "ruota 90°" : "entra") : `<b class="warn">troppo grande</b>`}</td></tr>`).join("")}</tbody></table>
      <dl class="kv"><dt>Volume</dt><dd>${fmt(totV, 1)} cm³ (pezzi pieni)</dd><dt>PLA pieno</dt><dd>≈ ${fmt(totV * 1.24, 0)} g · con riempimento 15% e 3 perimetri di solito 40–60%</dd><dt>Parete minima</dt><dd>${fmt(EX.minMm, 1)} mm${thin ? ` · ${thin} muri ispessiti per stamparli` : ""}</dd></dl>
      ${rows.some(r => !r.fits) ? `<p class="note warn">Alcuni pezzi superano il piatto: scegli una scala più piccola o separa i piani (scheda Esporta).</p>` : `<p class="note">Tutti i pezzi entrano nel piatto.</p>`}
      <p class="note">Il piatto in figura è a grandezza reale; i pezzi sono già appoggiati e distanziati come nel file 3MF.</p></div></div></div>`;
  document.body.appendChild(d);
  if (NO_WEBGL){ $("#prCv").replaceWith(Object.assign(document.createElement("p"), {className:"note", textContent:"Anteprima 3D non disponibile senza WebGL: le misure e il file 3MF restano validi."}));
    d.addEventListener("click", e => { if (e.target === d || e.target.closest("#prClose")) closePrintPreview(); });
    $("#prPrinter").addEventListener("change", e => { PREFS.printer = +e.target.value; savePrefs(); openPrintPreview(); }); return; }
  const cv = $("#prCv"), r = new THREE.WebGLRenderer({canvas:cv, antialias:true}); r.outputEncoding = THREE.sRGBEncoding; r.setClearColor(isDark() ? "#1b2124" : "#eef0ee");
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, 1, 5000); sc.add(new THREE.HemisphereLight("#ffffff", "#8a8f8a", .9)); const dl = new THREE.DirectionalLight("#ffffff", .9); dl.position.set(200, 400, 300); sc.add(dl);
  const grp = new THREE.Group(); sc.add(grp); let ox = 5, oz = 5, rowD = 0;   // pezzi disposti a file sul piatto
  for (const row of rows){ const g = row.pc.geo.clone(); g.rotateX(-Math.PI / 2); if (row.rot) g.rotateY(Math.PI / 2); g.computeBoundingBox(); let bb = g.boundingBox; const w = bb.max.x - bb.min.x, dd = bb.max.z - bb.min.z;
    if (ox > 5 && ox + w > bx - 5){ ox = 5; oz += rowD + 10; rowD = 0; } g.translate(-bb.min.x + ox, -bb.min.y, -bb.min.z + oz); rowD = Math.max(rowD, dd); g.computeVertexNormals(); bb = {max:{x:ox + w}, min:{x:ox}};
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:row.fits ? "#d9d6cf" : "#d0462c", roughness:.7, flatShading:true})); grp.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({color:"#555"})); grp.add(e); ox += (bb.max.x - bb.min.x) + 10; }
  const bed = new THREE.Group(); const plate = new THREE.Mesh(new THREE.BoxGeometry(bx, 2, by), new THREE.MeshStandardMaterial({color:"#3b4045", roughness:.9})); plate.position.set(bx / 2, -1, by / 2); bed.add(plate);
  const grid = new THREE.GridHelper(Math.max(bx, by), Math.round(Math.max(bx, by) / 10), "#6b7177", "#555b60"); grid.position.set(Math.max(bx, by) / 2, .05, Math.max(bx, by) / 2); grid.scale.set(bx / Math.max(bx, by), 1, by / Math.max(bx, by)); bed.add(grid);
  const vol = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bx, bz, by)), new THREE.LineBasicMaterial({color:"#8aa", transparent:true, opacity:.5})); vol.position.set(bx / 2, bz / 2, by / 2); bed.add(vol); sc.add(bed);
  const box = new THREE.Box3().setFromObject(grp).union(new THREE.Box3().setFromObject(bed)), c = box.getCenter(new THREE.Vector3()), R0 = box.getSize(new THREE.Vector3()).length();
  cam.position.set(c.x + R0 * .55, c.y + R0 * .6, c.z + R0 * .9); const oc = new THREE.OrbitControls(cam, cv); oc.target.copy(c); oc.update();
  const draw = () => { const w = cv.clientWidth, h = cv.clientHeight; if (!w) return; r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); r.render(sc, cam); };
  oc.addEventListener("change", draw); d._ro = new ResizeObserver(draw); d._ro.observe(cv); d._r = r; d._oc = oc; draw();
  d.addEventListener("click", e => { if (e.target === d || e.target.closest("#prClose")) closePrintPreview(); });
  $("#prPrinter").addEventListener("change", e => { PREFS.printer = +e.target.value; savePrefs(); openPrintPreview(); });
}
function closePrintPreview(){ const d = document.getElementById("printBox"); if (!d) return; d._ro?.disconnect(); d._oc?.dispose(); d._r?.dispose(); d.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("printBox")) closePrintPreview(); });

/* ---------- scheda Esporta: video, IFC, anteprima di stampa ---------- */
function moreExportHTML(){
  const n = (P.cameras || []).length;
  return `<div class="exp"><header><h4>Video</h4><span class="tag">MP4 · WebM</span></header>
    <p class="note">Un volo tra le camere salvate (nell'ordine in cui le hai salvate) oppure un giro completo attorno all'edificio. Registra la vista in tempo reale: tieni la scheda in primo piano.</p>
    <div class="row3"><div class="f"><span class="lbl">Percorso</span><select id="vdKind" class="inp"><option value="giro">Giro attorno</option><option value="camere" ${n >= 2 ? "" : "disabled"}>Tra le camere (${n})</option></select></div>${F("vdSecs", "Durata (s)", PREFS.vdSecs || 12, 'inputmode="numeric"')}<div class="f"><span class="lbl">Risoluzione</span><select id="vdRes" class="inp"><option value="720">720p</option><option value="1080">1080p</option><option value="360">360p (prova)</option></select></div></div>
    <div class="btns"><button class="btn primary" id="vdGo">Registra il video</button></div></div>
  <div class="exp"><header><h4>BIM</h4><span class="tag">IFC4</span></header>
    <p class="note">Muri con vani, porte e finestre, solai, locali con superficie, piani, copertura, scale, ringhiere e arredi: si apre in Archicad, Revit, BlenderBIM, Edificius e nei visualizzatori IFC.</p>
    <div class="btns"><button class="btn" id="exIfc">Esporta IFC</button></div><p class="status" id="ifcStatus"></p></div>
  <div class="exp"><header><h4>Anteprima di stampa 3D</h4><span class="tag">1:${EX.scale}</span></header>
    <p class="note">I pezzi sul piatto della tua stampante, con misure, volume e peso stimato: controlla prima di esportare il 3MF.</p>
    <div class="btns"><button class="btn" id="exPrev">Apri l'anteprima</button></div></div>`;
}
$("#panel-export").addEventListener("click", async e => {
  const b = e.target.closest("#vdGo, #exIfc, #exPrev"); if (!b) return;
  if (b.id === "exPrev"){ openPrintPreview(); return; }
  b.disabled = true;
  try {
    if (b.id === "vdGo"){ const secs = clamp(num($("#vdSecs").value) || 12, 2, 120); PREFS.vdSecs = secs; savePrefs();
      const {blob, ext} = await recordVideo($("#vdKind").value, secs, +$("#vdRes").value); await saveFile(`${slug()}-video.${ext}`, blob); }
    if (b.id === "exIfc"){ busy("Preparo il file IFC…"); await sleep(20); const {text, counts} = exportIFC(); await saveFile(slug() + ".ifc", new Blob([text], {type:"application/x-step"}));
      const st = $("#ifcStatus"); if (st) st.textContent = `${counts.walls} muri, ${counts.doors} porte, ${counts.windows} finestre, ${counts.spaces} locali, ${counts.other} altri elementi.`; }
  } catch(err){ console.error(err); toast("Non riuscito: " + (err.message || err), true); }
  finally { busy(""); b.disabled = false; }
});

/* ---------- pannello laterale: larghezza, staccato, nascosto ---------- */
(() => {
  const side = $(".side"), root = document.documentElement; if (!side) return;
  side.insertAdjacentHTML("afterbegin", `<div class="side-grip" title="Trascina per allargare o stringere il pannello" aria-hidden="true"></div><div class="side-head"><span>Pannello</span><button class="btn" id="sideDock" title="Riaggancia il pannello a destra">Riaggancia</button></div>`);
  $(".tabs", side)?.insertAdjacentHTML("beforeend", `<button class="tab-ic" id="sideFloat" title="Stacca il pannello e spostalo dove vuoi" aria-label="Stacca il pannello">⧉</button>`);
  $(".bar .seg:last-child")?.insertAdjacentHTML("beforebegin", `<button class="btn" id="sideToggle" title="Mostra o nascondi il pannello laterale" aria-pressed="true">Pannello</button>`);
  const apply = () => { const p = PREFS.side || {}; root.style.setProperty("--side-w", (p.w || 320) + "px"); document.body.classList.toggle("side-float", !!p.float); document.body.classList.toggle("side-hidden", !!p.hidden);
    $("#sideToggle")?.setAttribute("aria-pressed", !p.hidden);
    if (p.float){ Object.assign(side.style, {left:(p.x ?? innerWidth - (p.fw || 360) - 24) + "px", top:(p.y ?? 80) + "px", width:(p.fw || 360) + "px", height:(p.fh || Math.min(640, innerHeight - 120)) + "px"}); } else side.removeAttribute("style");
    requestAnimationFrame(() => { resize2D(); resize3D(); }); };
  const setP = patch => { PREFS.side = {...(PREFS.side || {}), ...patch}; savePrefs(); apply(); };
  let drag = null;
  side.addEventListener("pointerdown", e => {
    const grip = e.target.closest(".side-grip"), head = e.target.closest(".side-head") && !e.target.closest("button"); if (!grip && !head) return;
    e.preventDefault(); side.setPointerCapture(e.pointerId); const r = side.getBoundingClientRect(); drag = {grip:!!grip && !PREFS.side?.float, x:e.clientX, y:e.clientY, w:r.width, l:r.left, t:r.top};
  });
  side.addEventListener("pointermove", e => { if (!drag) return;
    if (drag.grip){ root.style.setProperty("--side-w", clamp(drag.w - (e.clientX - drag.x), 260, Math.min(760, innerWidth * .6)) + "px"); requestAnimationFrame(() => { resize2D(); resize3D(); }); }
    else { side.style.left = clamp(drag.l + e.clientX - drag.x, 0, innerWidth - 120) + "px"; side.style.top = clamp(drag.t + e.clientY - drag.y, 0, innerHeight - 60) + "px"; } });
  side.addEventListener("pointerup", () => { if (!drag) return; const r = side.getBoundingClientRect(); if (drag.grip) setP({w:Math.round(r.width)}); else setP({x:Math.round(r.left), y:Math.round(r.top)}); drag = null; });
  new ResizeObserver(() => { if (PREFS.side?.float && !drag){ const r = side.getBoundingClientRect(); if (Math.abs(r.width - (PREFS.side.fw || 0)) > 2 || Math.abs(r.height - (PREFS.side.fh || 0)) > 2){ PREFS.side.fw = Math.round(r.width); PREFS.side.fh = Math.round(r.height); savePrefs(); } } }).observe(side);
  $("#sideFloat")?.addEventListener("click", () => setP({float:true, hidden:false}));
  $("#sideDock")?.addEventListener("click", () => setP({float:false}));
  $("#sideToggle")?.addEventListener("click", () => setP({hidden:!PREFS.side?.hidden}));
  apply();
})();

/* ---------- tablet: tocco prolungato = menu, tasti per camminare ---------- */
(() => {
  let lp = null;
  c2d.addEventListener("pointerdown", e => { S.lastPtr = e.pointerType; if (e.pointerType !== "touch" || S.viewer) return; const sp = evP(e), raw = toW(...sp);
    clearTimeout(lp?.t); lp = {sp, t:setTimeout(() => { if (pointers.size > 1) return; drag = null; S.draw = null; openCtxMenu(sp, raw); navigator.vibrate?.(15); }, 550)}; }, {capture:true});
  c2d.addEventListener("pointermove", e => { if (lp && Math.hypot(evP(e)[0] - lp.sp[0], evP(e)[1] - lp.sp[1]) > 8){ clearTimeout(lp.t); lp = null; } });
  for (const ev of ["pointerup", "pointercancel"]) c2d.addEventListener(ev, () => { if (lp){ clearTimeout(lp.t); lp = null; } });
  $("#pane3d").insertAdjacentHTML("beforeend", `<div class="walkpad" aria-label="Comandi per camminare">${[["w", "▲", "Avanti"], ["a", "◀", "Sinistra"], ["s", "▼", "Indietro"], ["d", "▶", "Destra"], ["ArrowLeft", "↺", "Gira a sinistra"], ["ArrowRight", "↻", "Gira a destra"]].map(([k, s, n]) => `<button data-wk="${k}" aria-label="${n}">${s}</button>`).join("")}</div>`);
  const pad = $(".walkpad");
  pad.addEventListener("pointerdown", e => { const b = e.target.closest("[data-wk]"); if (!b) return; e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); WALK.keys.add(b.dataset.wk); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) pad.addEventListener(ev, e => { const b = e.target.closest?.("[data-wk]"); if (b) WALK.keys.delete(b.dataset.wk); });
  setInterval(() => document.body.classList.toggle("walking", WALK.on), 300);
})();
