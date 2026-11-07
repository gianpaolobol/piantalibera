/* ============================================================
   Fase 3 — Immagini e progetti: panorama 360° con visore, serie di
   immagini 4K dalle camere salvate, coda di render AI, raccolta dei
   progetti nel browser (IndexedDB) con anteprime
   ============================================================ */

/* ---------- panorama 360° equirettangolare ---------- */
/* Sei viste a 90° dal punto della camera, poi proiezione equirettangolare (centro = direzione della camera) */
async function renderPanorama(W = 4096){
  const face = Math.min(W / 4, renderer.capabilities.maxTextureSize || 2048, 2048), Hh = W / 2;
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(), st = {fov:camera.fov, aspect:camera.aspect, q:camera.quaternion.clone(), up:camera.up.clone()};
  const pos = camera.position.clone(), fwd = camera.getWorldDirection(new THREE.Vector3()); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x), UP = new THREE.Vector3(0, 1, 0);
  const DIRS = [[1,0,0,0,1,0], [-1,0,0,0,1,0], [0,1,0,0,0,1], [0,-1,0,0,0,-1], [0,0,1,0,1,0], [0,0,-1,0,1,0]], faces = [];
  renderer.setPixelRatio(1); renderer.setSize(face, face, false); camera.fov = 90; camera.aspect = 1; camera.updateProjectionMatrix();
  const cv = document.createElement("canvas"); cv.width = cv.height = face; const g2 = cv.getContext("2d", {willReadFrequently:true});
  try {
    for (const [fx, fy, fz, ux, uy, uz] of DIRS){
      const f = new THREE.Vector3(fx, fy, fz); camera.up.set(ux, uy, uz); camera.position.copy(pos); camera.lookAt(pos.clone().add(f)); camera.updateMatrixWorld();
      drawFrame(); g2.clearRect(0, 0, face, face); g2.drawImage(c3d, 0, 0, face, face);
      const r = new THREE.Vector3().crossVectors(f, camera.up).normalize(), u = new THREE.Vector3().crossVectors(r, f);
      faces.push({f, r, u, px:g2.getImageData(0, 0, face, face).data});
    }
  } finally {
    camera.up.copy(st.up); camera.fov = st.fov; camera.aspect = st.aspect; camera.quaternion.copy(st.q); camera.position.copy(pos); camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false); controls.update(); drawFrame();
  }
  await new Promise(r => requestAnimationFrame(r));
  const out = document.createElement("canvas"); out.width = W; out.height = Hh; const og = out.getContext("2d"), img = og.createImageData(W, Hh), D = img.data;
  const pick = (dx, dy, dz) => { const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz); return ax >= ay && ax >= az ? (dx > 0 ? 0 : 1) : ay >= az ? (dy > 0 ? 2 : 3) : (dz > 0 ? 4 : 5); };
  for (let y = 0; y < Hh; y++){
    const lat = Math.PI/2 - (y + .5) / Hh * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++){
      const lon = (x + .5) / W * 2*Math.PI - Math.PI, a = Math.sin(lon) * cl, c = Math.cos(lon) * cl;
      const dx = right.x*a + UP.x*sl + fwd.x*c, dy = sl, dz = right.z*a + fwd.z*c;
      const F = faces[pick(dx, dy, dz)], df = dx*F.f.x + dy*F.f.y + dz*F.f.z;
      const sx = (dx*F.r.x + dy*F.r.y + dz*F.r.z) / df, sy = (dx*F.u.x + dy*F.u.y + dz*F.u.z) / df;
      const px = Math.min(face - 1, Math.max(0, ((sx + 1) / 2 * face) | 0)), py = Math.min(face - 1, Math.max(0, ((1 - sy) / 2 * face) | 0));
      const si = (py * face + px) * 4, di = (y * W + x) * 4; D[di] = F.px[si]; D[di+1] = F.px[si+1]; D[di+2] = F.px[si+2]; D[di+3] = 255;
    }
  }
  og.putImageData(img, 0, 0); return out;
}
/* JPEG con metadati GPano: i visori 360° (Google Foto, Facebook, Kuula…) lo riconoscono come panorama */
async function panoJPEG(cv){
  const buf = new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/jpeg", .9))).arrayBuffer());
  const W = cv.width, H = cv.height, xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True" GPano:FullPanoWidthPixels="${W}" GPano:FullPanoHeightPixels="${H}" GPano:CroppedAreaImageWidthPixels="${W}" GPano:CroppedAreaImageHeightPixels="${H}" GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const head = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0"), body = new TextEncoder().encode(xmp), len = 2 + head.length + body.length;
  let at = 2; if (buf[2] === 0xFF && buf[3] === 0xE0) at = 4 + ((buf[4] << 8) | buf[5]);
  const seg = new Uint8Array(4 + head.length + body.length); seg.set([0xFF, 0xE1, len >> 8, len & 255]); seg.set(head, 4); seg.set(body, 4 + head.length);
  const out = new Uint8Array(buf.length + seg.length); out.set(buf.subarray(0, at)); out.set(seg, at); out.set(buf.subarray(at), at + seg.length);
  return out;
}
/* visore 360° nella pagina */
function openPanoViewer(cv){
  closePanoViewer();
  const d = document.createElement("div"); d.id = "panoBox"; d.className = "help pano"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Panorama 360°");
  d.innerHTML = `<div class="pano-in"><header><h3>Panorama 360°</h3><span class="note">Trascina per guardarti intorno · rotella per lo zoom</span><button class="btn" id="panoSave">Scarica JPG</button><button class="btn" id="panoClose" aria-label="Chiudi">✕</button></header><canvas id="panoCv"></canvas></div>`;
  document.body.appendChild(d);
  const pc = $("#panoCv"), r = new THREE.WebGLRenderer({canvas:pc, antialias:true}); r.outputEncoding = THREE.sRGBEncoding;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(75, 1, .1, 10), tex = new THREE.CanvasTexture(cv); tex.mapping = THREE.EquirectangularReflectionMapping; tex.encoding = THREE.sRGBEncoding; sc.background = tex;
  const V2 = {lon:0, lat:0, drag:null};
  const draw = () => { const w = pc.clientWidth, h = pc.clientHeight; if (!w) return; r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const cl = Math.cos(V2.lat); cam.lookAt(Math.cos(V2.lon) * cl, Math.sin(V2.lat), Math.sin(V2.lon) * cl); r.render(sc, cam); };
  pc.addEventListener("pointerdown", e => { V2.drag = [e.clientX, e.clientY, V2.lon, V2.lat]; pc.setPointerCapture(e.pointerId); });
  pc.addEventListener("pointermove", e => { if (!V2.drag) return; const k = cam.fov / pc.clientHeight * Math.PI / 180; V2.lon = V2.drag[2] - (e.clientX - V2.drag[0]) * k; V2.lat = clamp(V2.drag[3] + (e.clientY - V2.drag[1]) * k, -1.5, 1.5); draw(); });
  pc.addEventListener("pointerup", () => { V2.drag = null; });
  pc.addEventListener("wheel", e => { e.preventDefault(); cam.fov = clamp(cam.fov * Math.exp(e.deltaY * .001), 30, 100); draw(); }, {passive:false});
  d._ro = new ResizeObserver(draw); d._ro.observe(pc); d._r = r; d._tex = tex; draw();
  d.addEventListener("click", async e => { if (e.target === d || e.target.closest("#panoClose")) closePanoViewer(); if (e.target.closest("#panoSave")) await saveFile(`${slug()}-360.jpg`, new Blob([await panoJPEG(cv)], {type:"image/jpeg"})); });
  $("#panoClose").focus();
}
function closePanoViewer(){ const d = document.getElementById("panoBox"); if (!d) return; d._ro?.disconnect(); d._tex?.dispose(); d._r?.dispose(); d.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("panoBox")) closePanoViewer(); });

/* ---------- immagini: 4K, 360°, serie dalle camere ---------- */
const RES_4K = 3840;
function imagesExportHTML(){
  const n = (P.cameras || []).length;
  return `<div class="exp"><header><h4>Immagini e panorami</h4><span class="tag">PNG 4K · JPG 360°</span></header>
    <p class="note">Immagini dalla vista 3D in tempo reale (non AI). Il panorama 360° si prende dal punto in cui si trova la camera: con la visita a piedi o una vista interna viene un giro completo della stanza.</p>
    <div class="btns"><button class="btn primary" id="ex4k">Vista in 4K (3840 px)</button><button class="btn" id="exPano">Panorama 360°</button><button class="btn" id="exCams" ${n ? "" : "disabled"}>Tutte le camere in 4K (${n}) .zip</button></div>
    ${n ? "" : `<p class="note">Salva delle camere dal menu «Camere…» della vista 3D per esportarle tutte insieme.</p>`}</div>`;
}
function applyCamState(c){ if (WALK.on) exitWalk(); camera.position.fromArray(c.pos); controls.target.fromArray(c.target); camera.fov = c.fov || 45; camera.updateProjectionMatrix(); controls.update(); }
$("#panel-export").addEventListener("click", async e => {
  const b = e.target.closest("#ex4k, #exPano, #exCams"); if (!b) return; b.disabled = true;
  try {
    if (b.id === "ex4k"){ busy("Preparo l'immagine 4K…"); await sleep(30); const c = renderAt(1, null, {longSide:RES_4K}); await saveFile(`${slug()}-vista-4k.png`, new Blob([await canvasBytes(c)])); }
    if (b.id === "exPano"){ busy("Calcolo il panorama 360°…"); await sleep(30); const cv = await renderPanorama(4096); busy(""); openPanoViewer(cv); }
    if (b.id === "exCams"){ const st = camState(), files = {}, cams = P.cameras || [];
      for (let i = 0; i < cams.length; i++){ busy(`Camera ${i + 1} di ${cams.length}…`); await sleep(20); applyCamState(cams[i]); files[`${String(i + 1).padStart(2, "0")}-${slugify(cams[i].name || "vista")}.png`] = await canvasBytes(renderAt(1, null, {longSide:RES_4K})); }
      applyCamState(st); render3D(); busy(""); await saveFile(`${slug()}-camere-4k.zip`, new Blob([fflate.zipSync(files, {level:0})])); }
  } catch(err){ console.error(err); toast("Immagine non riuscita: " + (err.message || err), true); }
  finally { busy(""); b.disabled = false; }
});

/* ---------- coda di render AI ---------- */
const AIQ = {items:[], running:false, stop:false};
function aiQueueHTML(){
  const it = AIQ.items, lab = {wait:"in attesa", run:"in corso…", ok:"fatto", err:"non riuscito"};
  return `<div class="sec"><h3>Coda di render</h3><p class="note">Metti in coda più viste e lasciale elaborare una dopo l'altra. Ogni vista conta come un render nella quota giornaliera${aiQuotaLeft != null ? ` (oggi ne restano ${aiQuotaLeft})` : ""}.</p>
    ${it.length ? `<ol class="aiq">${it.map((x, i) => `<li><span>${esc(x.name)}</span><small class="q-${x.st}">${lab[x.st]}</small>${AIQ.running ? "" : `<button class="btn" data-aiqdel="${i}" aria-label="Togli ${esc(x.name)} dalla coda">✕</button>`}</li>`).join("")}</ol>` : ""}
    <div class="btns">${AIQ.running ? `<button class="btn" id="aiqStop">Ferma dopo questo render</button>` : `<button class="btn" id="aiqAdd">Aggiungi la vista corrente</button><button class="btn" id="aiqCams" ${(P.cameras || []).length ? "" : "disabled"}>Aggiungi le camere salvate</button>${it.some(x => x.st !== "ok") ? `<button class="btn primary" id="aiqRun">Avvia la coda</button>` : ""}${it.length ? `<button class="btn" id="aiqClear">Svuota</button>` : ""}`}</div></div>`;
}
async function runQueue(){
  if (AIQ.running) return; AIQ.running = true; AIQ.stop = false; const st = camState(); renderAI();
  try {
    for (const x of AIQ.items){
      if (AIQ.stop) break; if (x.st === "ok") continue;
      x.st = "run"; applyCamState(x.cam); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); renderAI();
      const cfg = aiConfig();
      if (isBackendCfg(cfg) && backendCfg.data?.turnstile_site_key && !tsToken){ aiStatus("Completa la verifica anti-bot per il prossimo render…"); const t0 = Date.now(); while (!tsToken && !AIQ.stop && Date.now() - t0 < 120000) await sleep(400); if (!tsToken){ x.st = "err"; break; } }
      const ok = await runAI(false, {queued:true}); x.st = ok ? "ok" : "err";
      if (!ok || aiQuotaLeft === 0) break;
    }
  } finally { AIQ.running = false; applyCamState(st); render3D(); renderAI(); const done = AIQ.items.filter(x => x.st === "ok").length; aiStatus(`Coda: ${done} di ${AIQ.items.length} render completati.${AIQ.items.some(x => x.st === "err") ? " Uno non è riuscito: vedi il messaggio sopra." : ""}`); }
}
$("#panel-ai").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.aiqdel !== undefined){ AIQ.items.splice(+b.dataset.aiqdel, 1); renderAI(); return; }
  if (b.id === "aiqAdd"){ AIQ.items.push({name:`Vista ${AIQ.items.length + 1}`, cam:camState(), st:"wait"}); renderAI(); }
  if (b.id === "aiqCams"){ for (const c of P.cameras || []) AIQ.items.push({name:c.name, cam:{pos:c.pos, target:c.target, fov:c.fov}, st:"wait"}); renderAI(); }
  if (b.id === "aiqRun") runQueue();
  if (b.id === "aiqStop"){ AIQ.stop = true; b.disabled = true; b.textContent = "Mi fermo dopo questo render…"; }
  if (b.id === "aiqClear"){ AIQ.items = []; renderAI(); }
});

/* ---------- raccolta dei progetti (IndexedDB del browser) ---------- */
let idbP = null;
function idb(){ return idbP || (idbP = new Promise((res, rej) => { const r = indexedDB.open("pianta-libera", 2);
  r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("progetti")) db.createObjectStore("progetti", {keyPath:"id"}); if (!db.objectStoreNames.contains("immagini")) db.createObjectStore("immagini", {keyPath:"id"}).createIndex("pid", "pid"); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); }
async function idbStore(name, mode, fn){ const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(name, mode), rq = fn(tx.objectStore(name)); tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
const idbDo = (mode, fn) => idbStore("progetti", mode, fn);
const projList = () => idbDo("readonly", s => s.getAll());
const projGet = id => idbDo("readonly", s => s.get(id));
const projPut = rec => idbDo("readwrite", s => s.put(rec));
const projDel = id => idbDo("readwrite", s => s.delete(id));
function projThumb(){ try { const w = 240, h = 150, c = document.createElement("canvas"); c.width = w; c.height = h; const k = Math.max(w / c3d.width, h / c3d.height), sw = w / k, sh = h / k; c.getContext("2d").drawImage(c3d, (c3d.width - sw) / 2, (c3d.height - sh) / 2, sw, sh, 0, 0, w, h); return c.toDataURL("image/jpeg", .7); } catch(e){ return ""; } }
let idbTimer = 0, idbWarned = false;
function queueIdbSave(){ clearTimeout(idbTimer); idbTimer = setTimeout(saveToIdb, 1500); }
async function saveToIdb(){
  clearTimeout(idbTimer); if (!P?.pid || !window.indexedDB) return;
  try { await projPut({id:P.pid, name:P.name || "Progetto", updated:Date.now(), thumb:projThumb(), data:JSON.stringify(projectData())}); if (document.getElementById("projBox")) renderProjects(); }
  catch(e){ if (!idbWarned){ idbWarned = true; console.warn("raccolta progetti", e); } }
}
async function openProjectsDlg(){
  closeProjectsDlg(); await saveToIdb();
  const d = document.createElement("div"); d.id = "projBox"; d.className = "help"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Progetti");
  d.innerHTML = `<div class="help-in proj-in"><header><h3>Progetti in questo browser</h3><button class="btn" id="projClose" aria-label="Chiudi">✕</button></header>
    <p class="note">Ogni progetto si salva da solo mentre lavori. Restano in questo browser: per spostarli su un altro computer usa «Scarica .json».</p>
    <div class="btns"><button class="btn primary" id="projNew">Nuovo progetto vuoto</button><button class="btn" id="projSample">Nuovo dall'esempio</button><button class="btn" id="projFile">Apri un file .json</button></div>
    <div class="proj-grid" id="projGrid"><p class="note">Carico…</p></div></div>`;
  document.body.appendChild(d); renderProjects();
  d.addEventListener("click", onProjClick); d.addEventListener("change", onProjChange); $("#projClose").focus();
}
function closeProjectsDlg(){ document.getElementById("projBox")?.remove(); }
async function renderProjects(){
  const g = $("#projGrid"); if (!g) return; let list = [];
  try { list = (await projList()).sort((a, b) => b.updated - a.updated); } catch(e){ g.innerHTML = `<p class="note warn">La raccolta dei progetti non è disponibile in questo browser (navigazione privata?). Usa Esporta → Salva progetto.</p>`; return; }
  const when = t => new Date(t).toLocaleString("it-IT", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
  g.innerHTML = list.length ? list.map(r => { const cur = r.id === P.pid; return `<figure class="proj ${cur ? "cur" : ""}" data-pid="${esc(r.id)}">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<div class="ph"></div>`}
    <figcaption><input class="inp" data-prename="${esc(r.id)}" value="${esc(r.name)}" aria-label="Nome del progetto"><small>${cur ? "aperto · " : ""}modificato ${when(r.updated)}</small>
    <span class="btns">${cur ? "" : `<button class="btn primary" data-popen="${esc(r.id)}">Apri</button>`}<button class="btn" data-pdup="${esc(r.id)}">Duplica</button><button class="btn" data-pjson="${esc(r.id)}">Scarica .json</button>${cur ? "" : `<button class="btn danger" data-pdel="${esc(r.id)}">Elimina</button>`}</span></figcaption></figure>`; }).join("")
    : `<p class="note">Nessun progetto salvato.</p>`;
}
async function openProjectRecord(id){
  await saveToIdb(); const r = await projGet(id); if (!r) return;
  await openProjectData(JSON.parse(r.data), {keepPid:true}); closeProjectsDlg(); toast(`Aperto «${r.name}»`);
}
async function onProjClick(e){
  const d = e.currentTarget; if (e.target === d || e.target.closest("#projClose")){ closeProjectsDlg(); return; }
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.id === "projNew"){ await saveToIdb(); newBlankProject(); closeProjectsDlg(); }
    if (b.id === "projSample"){ await saveToIdb(); P = sampleProject(); P.pid = uid(); S.level = "L0"; setSel([]); commit(); $("#projName").value = P.name; fitPlan(); applySky(); camPreset("ext"); closeProjectsDlg(); }
    if (b.id === "projFile"){ await saveToIdb(); closeProjectsDlg(); $("#fProj").click(); }
    if (b.dataset.popen) await openProjectRecord(b.dataset.popen);
    if (b.dataset.pdup){ const r = await projGet(b.dataset.pdup), data = JSON.parse(r.data), id = uid(); data.pid = id; data.name = (r.name || "Progetto") + " (copia)"; await projPut({...r, id, name:data.name, updated:Date.now(), data:JSON.stringify(data)}); renderProjects(); }
    if (b.dataset.pjson){ const r = await projGet(b.dataset.pjson); await saveFile(slugify(r.name || "progetto") + ".json", r.data); }
    if (b.dataset.pdel){ if (b.dataset.sure !== "1"){ b.dataset.sure = "1"; b.textContent = "Conferma eliminazione"; setTimeout(() => { if (b.isConnected){ b.dataset.sure = ""; b.textContent = "Elimina"; } }, 4000); return; } await projDel(b.dataset.pdel); renderProjects(); toast("Progetto eliminato dalla raccolta"); }
  } catch(err){ console.error(err); toast("Operazione non riuscita: " + (err.message || err), true); }
}
async function onProjChange(e){ const id = e.target.dataset.prename; if (!id) return; const name = e.target.value.trim() || "Progetto";
  if (id === P.pid){ P.name = name; $("#projName").value = name; commit(); return; }
  const r = await projGet(id); if (!r) return; const data = JSON.parse(r.data); data.name = name; await projPut({...r, name, data:JSON.stringify(data)}); }
function newBlankProject(){ const p = sampleProject(); p.name = "Nuovo progetto"; p.walls = []; p.openings = []; p.rooms = []; p.objects = []; p.levels[0].roof.type = "none"; p.pid = uid(); P = p; S.level = "L0"; setSel([]); commit(); $("#projName").value = P.name; fitPlan(); setTool("rect"); }
(() => { const f = $("#projName")?.closest(".field"); if (!f) return;
  f.insertAdjacentHTML("beforeend", `<button class="btn" id="projBtn" title="Tutti i progetti salvati in questo browser">Progetti</button>`);
  $("#projBtn").addEventListener("click", openProjectsDlg);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("projBox")) closeProjectsDlg(); });
})();
