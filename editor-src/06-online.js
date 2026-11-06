/* ============================================================
   Librerie online (Poly Haven, CC0) e libreria personale
   ============================================================ */
const PH = "https://api.polyhaven.com";
const phCache = {};
async function fetchJSON(url, ms=12000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, {signal:ctl.signal}); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const blockedMsg = `<p class="note warn">Non riesco a raggiungere la libreria online. Se stai usando l'anteprima dentro Claude è normale: questa vista blocca le connessioni esterne. Dalla versione caricata sul tuo sito funziona. In alternativa scarica il file dal sito della libreria e usalo con <b>Importa → Modello 3D</b>.</p>`;
const PH_MODEL_CATS = [["","Tutti"],["furniture","Arredi"],["seating","Sedute"],["table","Tavoli"],["lighting","Luci"],["decorative","Decorazioni"],["plants","Piante"],["nature","Natura"],["appliances","Elettrodomestici"],["props","Oggetti"]];
function onlinePanelHTML(){
  if (S.furnSrc === "personal") return `<div id="olBox"><p class="note">Metti i tuoi modelli (per esempio persone RenderPeople, arredi dei produttori) in <b>assets/personale/</b> sul tuo sito, con un file <b>indice.json</b>. Il formato è descritto nel file LEGGIMI.</p><div class="grid-online" id="olGrid"></div><p class="status" id="olStatus">Carico…</p></div>`;
  return `<div id="olBox"><div class="row"><div class="f"><label class="lbl" for="phSearch">Cerca</label><input id="phSearch" class="inp" placeholder="es. chair, lamp, plant" value="${esc(S.phQuery||"")}"></div><div class="f" style="justify-content:flex-end"><span class="tag">CC0 · gratuiti</span></div></div>
    <div class="cats">${PH_MODEL_CATS.map(([k,n])=>`<button data-phcat="${k}" aria-pressed="${(S.phCat||"")===k}">${n}</button>`).join("")}</div>
    <div class="grid-online" id="olGrid"></div><p class="status" id="olStatus">Carico il catalogo…</p>
    <p class="note">Modelli fotogrammetrici e PBR con i loro materiali, da <b>polyhaven.com</b>. Scegli un modello, poi clicca in pianta.</p></div>`;
}
async function hydrateOnline(){
  const grid = $("#olGrid"), st = $("#olStatus"); if (!grid) return;
  S.phQuery = $("#phSearch")?.value || S.phQuery || "";
  try {
    if (S.furnSrc === "personal"){
      const idx = phCache.personal || (phCache.personal = await fetchJSON(ASSET + "personale/indice.json"));
      grid.innerHTML = idx.map(it => `<button data-pick='${esc(JSON.stringify({src:"personal", id:"pers_" + slugify(it.file), file:it.file, nome:it.nome, h:it.altezza || null, credit:it.crediti || "Libreria personale"}))}'>${it.anteprima ? `<img src="${ASSET}personale/${esc(it.anteprima)}" alt="" loading="lazy">` : ""}<span>${esc(it.nome)}</span></button>`).join("");
      st.textContent = idx.length ? `${idx.length} modelli nella libreria personale` : "La libreria personale è vuota"; st.className = "status ok"; return;
    }
    const cat = S.phCat || "";
    const key = "m:" + cat; const list = phCache[key] || (phCache[key] = await fetchJSON(`${PH}/assets?type=models${cat ? "&categories=" + cat : ""}`));
    const q = S.phQuery.toLowerCase().trim();
    let items = Object.entries(list).filter(([id, a]) => !q || id.includes(q) || (a.name||"").toLowerCase().includes(q) || (a.tags||[]).some(t => t.includes(q)));
    items.sort((a,b) => (b[1].download_count||0) - (a[1].download_count||0));
    const lim = S.phLimit || 40;
    grid.innerHTML = items.slice(0, lim).map(([id, a]) => `<button data-pick='${esc(JSON.stringify({src:"ph", id, nome:a.name}))}' aria-pressed="${S.onlinePick?.id===id}"><img src="https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=200&height=200" alt="" loading="lazy"><span>${esc(a.name)}</span></button>`).join("");
    st.innerHTML = `${items.length} modelli${items.length > lim ? ` · <button class="btn" id="phMore">Mostra altri</button>` : ""}`; st.className = "status ok";
  } catch(e){
    console.warn(e); $("#olBox").innerHTML = S.furnSrc === "personal" ? `<p class="note warn">Nessuna libreria personale trovata in assets/personale/indice.json.</p>` : blockedMsg;
  }
}
function normalizeObject(raw, k=1, up="y"){
  const holder = new THREE.Group(); holder.add(raw); stripLights(raw);
  if (up === "z") raw.rotation.x -= Math.PI/2;
  raw.scale.multiplyScalar(k); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3());
  raw.position.x -= c.x; raw.position.z -= c.z; raw.position.y -= box.min.y;
  holder.traverse(o => { if (o.isMesh){ o.castShadow = o.receiveShadow = true; } });
  holder.userData.box = null; return holder;
}
async function loadPolyHavenModel(id){
  const f = await fetchJSON(`${PH}/files/${id}`);
  const g = f.gltf?.["1k"]?.gltf || f.gltf?.["2k"]?.gltf; if (!g) throw new Error("modello senza glTF");
  const inc = g.include || {};
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => { for (const [rel, v] of Object.entries(inc)) if (u.endsWith(rel) || u.endsWith(rel.split("/").pop())) return v.url; return u; });
  const gl = await loadGLTF(g.url, manager);
  gl.scene.traverse(o => { if (o.isMesh){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.envMapIntensity = .7); } });
  return normalizeObject(gl.scene);
}
async function loadPersonalModel(pick){
  const url = ASSET + "personale/" + pick.file, ext = pick.file.split(".").pop().toLowerCase(); let raw;
  if (ext === "glb" || ext === "gltf") raw = (await loadGLTF(url)).scene;
  else if (ext === "fbx"){ await loadFBXLibs(); raw = await new Promise((res, rej) => new THREE.FBXLoader().load(url, res, undefined, rej)); }
  else throw new Error("formato non supportato nella libreria personale: ." + ext);
  let k = 1; if (pick.h){ const b = new THREE.Box3().setFromObject(raw); k = pick.h / Math.max(.01, b.max.y - b.min.y); }
  else if (ext === "fbx"){ const b = new THREE.Box3().setFromObject(raw); if (b.max.y - b.min.y > 30) k = .01; }
  return normalizeObject(raw, k);
}
async function placeRemoteModel(pick, p){
  const id = pick.id;
  try {
    if (!importStore[id]){
      busy(`Scarico ${pick.nome}…`);
      const obj = pick.src === "ph" ? await loadPolyHavenModel(id) : await loadPersonalModel(pick);
      importStore[id] = {obj, file:null, source:{type: pick.src === "ph" ? "polyhaven" : "personal", id, file:pick.file, h:pick.h, nome:pick.nome, credit: pick.src === "ph" ? "Poly Haven · CC0" : pick.credit}};
      busy("");
    }
    const o = {id:uid(), level:S.level, kind:"import", ref:id, name:pick.nome, x:p[0], y:p[1], rot:0, scale:1, z:0};
    P.objects.push(o); S.sel = {type:"object", id:o.id}; commit();
  } catch(e){ busy(""); console.warn(e); toast("Download non riuscito: " + (e.message || e) + ". Nell'anteprima di Claude le librerie online sono bloccate.", true); }
}
async function restoreRemote(id, src){
  if (importStore[id]) return;
  const obj = src.type === "polyhaven" ? await loadPolyHavenModel(src.id) : await loadPersonalModel({file:src.file, h:src.h});
  importStore[id] = {obj, file:null, source:src};
}
/* HDRI e texture da Poly Haven (scheda Importa) */
async function hydratePHList(kind){
  const box = $(kind === "hdris" ? "#phHdri" : "#phTex"); if (!box) return;
  try {
    const list = phCache[kind] || (phCache[kind] = await fetchJSON(`${PH}/assets?type=${kind}${kind === "hdris" ? "&categories=outdoor" : ""}`));
    const q = ($(kind === "hdris" ? "#phHq" : "#phTq")?.value || "").toLowerCase().trim();
    const items = Object.entries(list).filter(([id,a]) => !q || id.includes(q) || (a.name||"").toLowerCase().includes(q) || (a.tags||[]).some(t=>t.includes(q))).sort((a,b) => (b[1].download_count||0)-(a[1].download_count||0)).slice(0, 30);
    box.innerHTML = items.map(([id,a]) => `<button data-ph${kind === "hdris" ? "h" : "t"}="${id}" data-nome="${esc(a.name)}"><img src="https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=200&height=${kind==="hdris"?100:200}" alt="" loading="lazy" style="${kind==="hdris"?"aspect-ratio:2":""}"><span>${esc(a.name)}</span></button>`).join("") || `<p class="note">Nessun risultato.</p>`;
  } catch(e){ box.outerHTML = blockedMsg; }
}
async function pickPHHdri(id, nome){
  try { busy("Scarico il cielo…"); const f = await fetchJSON(`${PH}/files/${id}`); const url = f.hdri?.["1k"]?.hdr?.url; if (!url) throw new Error("HDRI non disponibile");
    P.sky = {kind:"ph", id, url, nome}; busy(""); await applySky(); commit(); toast(`Cielo: ${nome}`);
  } catch(e){ busy(""); toast("Cielo non scaricato: " + (e.message||e), true); }
}
async function pickPHTexture(id, nome){
  try { busy("Scarico la texture…"); const [f, info] = await Promise.all([fetchJSON(`${PH}/files/${id}`), fetchJSON(`${PH}/info/${id}`)]);
    const pick = k => f[k]?.["1k"]?.jpg?.url || f[k]?.["1k"]?.png?.url;
    const map = pick("Diffuse") || pick("diff"), nor = pick("nor_gl"), rough = pick("Rough") || pick("rough");
    if (!map) throw new Error("mappa colore assente");
    const size = info?.dimensions ? Math.max(.2, info.dimensions[0]/1000) : 2;
    const key = "ph_" + id; P.materials[key] = {nome, color:"#ffffff", map, normalMap:nor, roughMap:rough, size, rough:1, source:"Poly Haven · CC0"};
    invalidateMat(key); delete swCache[key]; busy(""); commit(); renderImport(); toast(`«${nome}» aggiunto ai materiali del progetto (${fmt(size,2)} m per ripetizione)`);
  } catch(e){ busy(""); toast("Texture non scaricata: " + (e.message||e), true); }
}
