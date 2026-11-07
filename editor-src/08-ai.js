/* ============================================================
   Render tramite API AI esterne — modalità Base e Avanzata
   Adattatore configurabile: modello di richiesta con segnaposto,
   lettura del risultato per percorso, lavori asincroni con polling.
   In produzione si passa dal backend del progetto (/api/render), che tiene le chiavi e applica le quote.
   ============================================================ */
const AI_KEY = "pianta-libera-ai-v1";
const CONTRACT_TEMPLATE = `{
  "mode": "{{render_mode}}",
  "scene": "{{scene}}",
  "prompt": "{{prompt}}",
  "negative_prompt": "{{negative}}",
  "image": "{{image_dataurl}}",
  "depth": "{{depth_dataurl}}",
  "lines": "{{lines_dataurl}}",
  "camera": {{camera}},
  "params": {"strength": {{strength}}, "seed": {{seed}}, "variants": {{variants}}, "width": {{width}}, "height": {{height}}, "use_guides": {{use_guides}}},
  "project": {"name": "{{project}}"},
  "consent": {{consent}},
  "turnstile": "{{turnstile}}"
}`;
const AI_PRESETS = {
  pianta: {nome:"Backend Pianta Libera (/api/render)", contentType:"json", url:"/api/render", backend:true, resultPath:"images", jobIdPath:"id", pollTemplate:"/api/render/{{job}}", statusPath:"status", doneValues:"succeeded", failValues:"failed,canceled,error",
    template:CONTRACT_TEMPLATE},
  json: {nome:"Servizio esterno · JSON generico (solo test)", contentType:"json", resultPath:"",
    template:`{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}",\n  "image": "{{image_dataurl}}",\n  "strength": {{strength}}\n}`},
  openai: {nome:"Servizio esterno · stile OpenAI (solo test)", contentType:"multipart", resultPath:"data.0.b64_json", url:"https://api.openai.com/v1/images/edits",
    template:`{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}",\n  "image": "@image",\n  "n": {{variants}},\n  "size": "auto"\n}`},
  replicate: {nome:"Servizio esterno · stile Replicate (solo test)", contentType:"json", resultPath:"output", pollUrlPath:"urls.get", statusPath:"status", doneValues:"succeeded", failValues:"failed,canceled",
    template:`{\n  "version": "{{model}}",\n  "input": {\n    "prompt": "{{prompt}}",\n    "image": "{{image_dataurl}}",\n    "prompt_strength": {{strength}}\n  }\n}`},
};
const ADV_TEMPLATE = `{
  "model": "{{model}}",
  "prompt": "{{prompt}}",
  "negative_prompt": "{{negative}}",
  "image": "{{image}}",
  "controls": [
    {"type": "depth", "image": "{{depth}}", "weight": {{w_depth}}},
    {"type": "lineart", "image": "{{lines}}", "weight": {{w_lines}}},
    {"type": "segmentation", "image": "{{materials}}", "weight": {{w_seg}}}
  ],
  "strength": {{strength}},
  "steps": {{steps}},
  "guidance": {{guidance}},
  "seed": {{seed}},
  "num_outputs": {{variants}},
  "width": {{width}},
  "height": {{height}}
}`;
const AI_VARS = [
  ["image","vista PNG in base64"],["image_dataurl","vista come data URL"],["depth","profondità base64"],["depth_dataurl",""],["lines","contorni base64"],["lines_dataurl",""],
  ["materials","mappa materiali base64"],["materials_dataurl",""],["materials_legend","legenda colori → materiali (JSON)"],["prompt",""],["negative",""],["model",""],
  ["strength","0–1"],["steps",""],["guidance",""],["seed",""],["variants",""],["width",""],["height",""],["w_depth",""],["w_lines",""],["w_seg",""],["project","nome progetto"],["camera","posizione, target, fov e proporzioni (oggetto JSON)"],["render_mode","fedele o creativo"],["scene","interni o esterni"],["use_guides","true/false: usa profondità e contorni"]];
function aiDefaults(){ return {
  mode:"base",
  base:{preset:"pianta", conn:"direct", url:"/api/render", authHeader:"Authorization", authValue:"", model:"", strength:.45, longSide:512, outLongSide:1024, guides:true, prompt:"", renderMode:"fedele", ...pick(AI_PRESETS.pianta)},
  adv:{conn:"direct", url:"/api/render", authHeader:"Authorization", authValue:"", model:"", contentType:"json", template:ADV_TEMPLATE, extraHeaders:"", renderMode:"fedele",
    resultPath:"", pollUrlPath:"", jobIdPath:"", pollTemplate:"", statusPath:"", doneValues:"succeeded,completed,done", failValues:"failed,error,canceled", interval:2, timeout:300,
    prompt:"", negative:"cartoon, disegno, distorsione, persone deformi, testo, filigrana, geometria alterata", strength:.4, steps:30, guidance:6, seed:-1, variants:2, longSide:1536, outLongSide:1536, guides:true, w_depth:.8, w_lines:.6, w_seg:.3},
}; function pick(p){ const {nome, ...r} = p; return r; } }
let AI = (() => { try { const s = JSON.parse(localStorage.getItem(AI_KEY)); if (s?.base && s?.adv) return {...aiDefaults(), ...s, base:{...aiDefaults().base, ...s.base}, adv:{...aiDefaults().adv, ...s.adv}}; } catch(e){} return aiDefaults(); })();
const aiResults = []; let aiLastRaw = "", aiBusy = false;
/* --- Backend del progetto: configurazione pubblica, consenso, Turnstile --- */
const CONSENT_KEY = "pianta-libera-ai-consenso-v1";
let aiConsent = (() => { try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch(e){ return false; } })();
const backendCfg = {url:"", data:null, error:"", loading:false};
let tsToken = "", tsWidget = null, tsLoading = null, aiQuotaLeft = null;
function isBackendCfg(c){ return AI.mode === "base" && !!AI_PRESETS[c.preset]?.backend; }
// /api/render → /api/config · …/render.php → …/render.php?config=1
function configUrlFor(u){ if (!u) return ""; if (/render\.php$/.test(u)) return u + "?config=1"; if (/\/render\/?$/.test(u)) return u.replace(/\/render\/?$/, "/config"); return ""; }
async function loadBackendConfig(force){
  const u = configUrlFor(AI.base.url);
  if (!u || (!force && backendCfg.url === u && (backendCfg.data || backendCfg.loading || backendCfg.error))) return;
  Object.assign(backendCfg, {url:u, data:null, error:"", loading:true});
  try { const r = await fetch(u, {headers:{Accept:"application/json"}}); const d = await r.json(); if (!r.ok || typeof d !== "object") throw new Error("HTTP " + r.status); backendCfg.data = d; }
  catch(e){ backendCfg.error = "Configurazione del servizio non disponibile (" + (e.message || e) + ")."; }
  backendCfg.loading = false; if (S.tab === "ai" && !aiBusy) renderAI();
}
function loadTurnstile(){
  if (window.turnstile) return Promise.resolve();
  return tsLoading ||= new Promise((ok, ko) => { const sc = document.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.onload = ok; sc.onerror = () => { tsLoading = null; ko(new Error("verifica anti-bot non caricata")); }; document.head.appendChild(sc); });
}
async function mountTurnstile(){
  const key = backendCfg.data?.turnstile_site_key, box = $("#aiTurnstile"); if (!key || !box) return;
  try { await loadTurnstile(); if (!document.body.contains(box) || box.childElementCount) return; try { if (tsWidget != null) window.turnstile.remove(tsWidget); } catch(_){} tsToken = ""; tsWidget = window.turnstile.render(box, {sitekey:key, size: box.clientWidth >= 300 ? "flexible" : "compact", language:"it", callback:t => { tsToken = t; }, "expired-callback":() => { tsToken = ""; }, "error-callback":() => { tsToken = ""; }}); }
  catch(e){ box.textContent = "Verifica anti-bot non disponibile: " + e.message; }
}
function resetTurnstile(){ tsToken = ""; try { if (tsWidget != null && window.turnstile) window.turnstile.reset(tsWidget); } catch(e){} }
function backendBlock(){
  const d = backendCfg.data;
  const info = backendCfg.loading ? `<p class="note">Leggo la configurazione del servizio…</p>`
    : backendCfg.error ? `<p class="note warn">${esc(backendCfg.error)}</p>`
    : d ? `<p class="note">${d.mock ? "<b>Servizio di prova</b>: restituisce la vista inviata, non genera immagini." : `Fornitore: <b>${esc(d.provider || "?")}</b>${d.model ? ` · modello <code>${esc(d.model)}</code>` : ""}.`}
        ${d.quota ? ` Render disponibili oggi: <b>${Math.max(0, (aiQuotaLeft ?? (d.quota.per_ip_daily - (d.quota.used_today || 0))))}</b> su ${d.quota.per_ip_daily}.` : ""}
        ${d.retention_seconds ? ` Immagini cancellate dal server dopo ${Math.round(d.retention_seconds/60)} minuti.` : ""}</p>
        ${d.enabled === false ? `<p class="note warn">Render AI non attivo su questo sito${d.reason ? ` (${esc(d.reason)})` : ""}.</p>` : ""}` : "";
  return `${info}
    <label class="chk"><input type="checkbox" id="aiConsent" ${aiConsent?"checked":""}><span>Acconsento all'invio della vista, delle mappe di profondità e contorni e del prompt ${d?.provider && !d.mock ? `a <b>${esc(d.provider)}</b>` : "al servizio di render"} per generare l'immagine (<a href="privacy.html" target="_blank" rel="noopener">informativa</a>).</span></label>
    ${d?.privacy ? `<details><summary class="lbl">Informativa</summary><p class="note">${esc(d.privacy)}</p><p class="note"><a href="https://github.com/gianpaolobol/piantalibera/blob/main/docs/privacy.md" target="_blank" rel="noopener">Testo completo</a></p></details>` : ""}
    ${d?.turnstile_site_key ? `<div id="aiTurnstile" class="ts"></div>` : ""}`;
}
function aiSave(){ try { localStorage.setItem(AI_KEY, JSON.stringify(AI)); } catch(e){} }
const AF = (id, label, val, extra="") => `<div class="f"><label class="lbl" for="${id}">${label}</label><input id="${id}" class="inp" value="${esc(val)}" ${extra}></div>`;
function connBlock(pf, c){
  const isBackend = pf === "b" ? AI_PRESETS[c.preset]?.backend : !c.authValue && /^\/|^\.\.?\//.test(c.url || "");
  return `${AF(pf+"_url","Endpoint",c.url,'placeholder="/api/render"')}
    ${pf === "b" && isBackend ? `${AF(pf+"_pollTemplate","Stato del lavoro",c.pollTemplate,'placeholder="/api/render/{{job}}"')}
      <p class="note">Il backend del progetto tiene la chiave del servizio AI, applica le quote e restituisce il lavoro. In locale <b>npm run dev</b> risponde con un servizio di prova; su Cloudflare risponde il Worker con FLUX.2 klein; sul sito PHP usa <b>../api/render.php</b> e <b>../api/render.php?id={{job}}</b>.</p>`
    : `<div class="row">${AF(pf+"_authHeader","Intestazione chiave",c.authHeader)}${AF(pf+"_authValue","Valore",c.authValue,'type="password" autocomplete="off" placeholder="Bearer …"')}</div>
      <p class="note warn">Chiamata diretta al servizio: la chiave resta solo in questo browser. Va bene per prove in locale, non per il sito pubblico, dove serve il backend con le quote.</p>`}`;
}
function renderAI(){
  const el = $("#panel-ai"), b = AI.base, a = AI.adv, m = AI.mode;
  el.innerHTML = `
  <div class="sec"><h3>Render con un servizio AI esterno</h3><p class="note">Mandi la vista 3D corrente a un servizio di generazione immagini e ricevi il render fotorealistico. Il collegamento ai servizi si configura qui, quando avrai le API.</p>
    <div class="seg" id="aiMode"><button data-aim="base" aria-pressed="${m==="base"}">Base</button><button data-aim="adv" aria-pressed="${m==="adv"}">Avanzata</button></div></div>
  ${m === "base" ? `
  <div class="exp"><header><h4>Modalità base</h4><span class="tag">vista + prompt → immagine</span></header>
    <div class="f"><span class="lbl">Formato del servizio</span><select id="b_preset" class="inp">${Object.entries(AI_PRESETS).map(([k,p])=>`<option value="${k}" ${b.preset===k?"selected":""}>${p.nome}</option>`).join("")}</select></div>
    ${connBlock("b", b)}
    <div class="row"><div class="f"><span class="lbl">Tipo di render</span><select id="b_renderMode" class="inp"><option value="fedele" ${b.renderMode!=="creativo"?"selected":""}>Fedele alla geometria</option><option value="creativo" ${b.renderMode==="creativo"?"selected":""}>Creativo</option></select></div>${AF("b_model","Modello",b.model,'placeholder="facoltativo"')}</div>
    <p class="note">Anche in modalità fedele un modello generativo può cambiare dettagli: controlla aperture, muri e coperture prima di usare l'immagine.</p>
    <div class="row">${AF("b_longSide","Lato vista inviata (px)",b.longSide,'inputmode="numeric"')}${AF("b_outLongSide","Lato render (px)",b.outLongSide,'inputmode="numeric"')}</div>
    <label class="chk"><input type="checkbox" id="b_guides" ${b.guides?"checked":""}> Invia anche profondità e contorni come guida</label>
    <p class="note">FLUX.2 klein su Cloudflare accetta immagini di riferimento fino a 512 px; il render può uscire fino a 1920 px.</p>
    <div class="f"><label class="lbl" for="b_strength">Libertà creativa · ${fmt(b.strength,2)}</label><input type="range" id="b_strength" min="0.1" max="0.9" step="0.05" value="${b.strength}"></div>
    <p class="note">Valori bassi rispettano di più la geometria della vista.</p>
    <div class="f"><label class="lbl" for="b_prompt">Prompt</label><textarea id="b_prompt" class="inp">${esc(b.prompt || aiPrompt())}</textarea></div>
    <div class="btns"><button class="btn" id="b_resetPrompt">Prompt dal progetto</button></div>
    ${isBackendCfg(b) ? backendBlock() : ""}
  </div>` : `
  <div class="exp"><header><h4>Modalità avanzata</h4><span class="tag">ControlNet · varianti · lavori asincroni</span></header>
    ${connBlock("a", a)}
    <div class="row">${AF("a_model","Modello",a.model)}<div class="f"><span class="lbl">Corpo richiesta</span><select id="a_contentType" class="inp"><option value="json" ${a.contentType==="json"?"selected":""}>JSON</option><option value="multipart" ${a.contentType==="multipart"?"selected":""}>multipart/form-data</option></select></div></div>
    <div class="f"><label class="lbl" for="a_prompt">Prompt</label><textarea id="a_prompt" class="inp">${esc(a.prompt || aiPrompt())}</textarea></div>
    <div class="f"><label class="lbl" for="a_negative">Prompt negativo</label><input id="a_negative" class="inp" value="${esc(a.negative)}"></div>
    <div class="row3">${AF("a_strength","Libertà 0–1",fmt(a.strength,2),'inputmode="decimal"')}${AF("a_steps","Passi",a.steps,'inputmode="numeric"')}${AF("a_guidance","Guida",fmt(a.guidance,1),'inputmode="decimal"')}</div>
    <div class="row3">${AF("a_seed","Seed (-1 casuale)",a.seed,'inputmode="numeric"')}${AF("a_variants","Varianti",a.variants,'inputmode="numeric"')}${AF("a_longSide","Lato lungo px",a.longSide,'inputmode="numeric"')}</div>
    <div class="row3">${AF("a_w_depth","Peso profondità",fmt(a.w_depth,2),'inputmode="decimal"')}${AF("a_w_lines","Peso contorni",fmt(a.w_lines,2),'inputmode="decimal"')}${AF("a_w_seg","Peso materiali",fmt(a.w_seg,2),'inputmode="decimal"')}</div>
    <details><summary class="lbl">Modello della richiesta</summary>
      <p class="note">Scrivi il corpo come lo vuole il servizio; i segnaposto vengono sostituiti all'invio. In multipart, un valore <b>"@image"</b> (o @depth, @lines, @materials) diventa un file PNG.</p>
      <div class="chips">${AI_VARS.map(([k,d])=>`<code data-ins="{{${k}}}" title="${esc(d)}">{{${k}}}</code>`).join("")}</div>
      <textarea id="a_template" class="inp code" spellcheck="false">${esc(a.template)}</textarea>
      ${AF("a_extraHeaders","Altre intestazioni (una per riga, Nome: valore)",a.extraHeaders)}
    </details>
    <details><summary class="lbl">Lettura della risposta e lavori asincroni</summary>
      ${AF("a_resultPath","Percorso del risultato",a.resultPath,'placeholder="vuoto = cerco io le immagini nella risposta · es. output.0"')}
      <div class="row">${AF("a_pollUrlPath","Percorso URL di stato",a.pollUrlPath,'placeholder="es. urls.get"')}${AF("a_jobIdPath","oppure percorso ID lavoro",a.jobIdPath,'placeholder="es. id"')}</div>
      ${AF("a_pollTemplate","URL di stato con {{job}}",a.pollTemplate,'placeholder="https://api…/jobs/{{job}}"')}
      <div class="row">${AF("a_statusPath","Percorso dello stato",a.statusPath,'placeholder="es. status"')}${AF("a_interval","Intervallo (s)",a.interval,'inputmode="decimal"')}</div>
      <div class="row">${AF("a_doneValues","Valori di completato",a.doneValues)}${AF("a_failValues","Valori di errore",a.failValues)}</div>
    </details>
  </div>`}
  <div class="btns"><button class="btn primary" id="aiGo" ${aiBusy?"disabled":""}>${aiBusy ? "Render in corso…" : "Genera render dalla vista"}</button><button class="btn" id="aiTest">Prova la connessione</button><button class="btn" id="aiPreview">Anteprima di cosa invio</button></div>
  <p class="status" id="aiStatus"></p>
  <p class="note">Le immagini della vista vengono inviate al servizio configurato. Nessuna chiave viene salvata nel progetto.</p>
  ${aiQueueHTML()}
  ${aiResults.length ? `<div class="sec"><h3>Render ottenuti</h3><div class="gallery">${aiResults.map((r,i)=>`<figure><img src="${esc(r.src)}" data-cmp="${i}" alt="Render ${i+1}"><figcaption><span>${r.time} · ${r.mode}</span><span><button data-cmp="${i}">Confronta</button> · <button data-aisave="${i}">Salva</button> · <button data-aimask="${i}">Ritocca</button> · <button data-aidel="${i}">Elimina</button></span></figcaption></figure>`).join("")}</div></div>` : ""}
  ${aiLastRaw ? `<details class="exp"><summary>Ultima risposta del servizio</summary><pre class="raw">${esc(aiLastRaw)}</pre></details>` : ""}
  <details class="exp"><summary>Configurazioni</summary><div class="btns"><button class="btn" id="aiExport">Esporta configurazione</button><button class="btn" id="aiReset">Ripristina predefiniti</button></div><p class="note">L'esportazione non include le chiavi.</p></details>`;
  if (isBackendCfg(b)){ loadBackendConfig(); if (backendCfg.data?.turnstile_site_key) mountTurnstile(); }
}
const PA = $("#panel-ai");
function aiField(id, val){ const [pf, ...rest] = id.split("_"); const key = rest.join("_"); const tgt = pf === "b" ? AI.base : pf === "a" ? AI.adv : null; if (!tgt || !(key in tgt)) return false; const numeric = typeof aiDefaults()[pf === "b" ? "base" : "adv"][key] === "number"; tgt[key] = numeric ? (num(val) ?? tgt[key]) : val; aiSave(); return true; }
PA.addEventListener("input", e => { const t = e.target; if (t.id === "b_strength"){ AI.base.strength = +t.value; t.previousElementSibling.textContent = "Libertà creativa · " + fmt(AI.base.strength,2); aiSave(); return; } if (t.tagName === "TEXTAREA") aiField(t.id, t.value); });
PA.addEventListener("change", e => { const t = e.target;
  if (t.id === "b_guides"){ AI.base.guides = t.checked; aiSave(); return; }
  if (t.id === "aiConsent"){ aiConsent = t.checked; try { localStorage.setItem(CONSENT_KEY, aiConsent ? "1" : "0"); } catch(e){} return; }
  if (t.id === "b_url"){ aiField(t.id, t.value); loadBackendConfig(true); return; }
  if (t.id === "b_preset"){ const p = AI_PRESETS[t.value]; const {nome, backend, ...rest} = p; AI.base = {...AI.base, preset:t.value, resultPath:"", pollUrlPath:"", jobIdPath:"", pollTemplate:"", statusPath:"", doneValues:"", failValues:"", url:"", ...rest}; aiSave(); renderAI(); return; }
  aiField(t.id, t.value);
});
PA.addEventListener("click", async e => {
  const b = e.target.closest("button, code[data-ins], img[data-cmp]"); if (!b) return;
  if (b.dataset.aim){ AI.mode = b.dataset.aim; aiSave(); renderAI(); return; }
  if (b.dataset.ins){ const ta = $("#a_template"); const s = ta.selectionStart; ta.setRangeText(b.dataset.ins, s, ta.selectionEnd, "end"); ta.focus(); AI.adv.template = ta.value; aiSave(); return; }
  if (b.dataset.cmp !== undefined){ openCompare(aiResults[+b.dataset.cmp]); return; }
  if (b.dataset.aisave !== undefined){ await saveResult(aiResults[+b.dataset.aisave]); return; }
  if (b.dataset.aimask !== undefined){ openMaskEditor(aiResults[+b.dataset.aimask]); return; }
  if (b.dataset.aidel !== undefined){ await deleteGalleryItem(+b.dataset.aidel); return; }
  if (b.id === "b_resetPrompt"){ AI.base.prompt = aiPrompt(); aiSave(); renderAI(); return; }
  if (b.id === "aiGo" && !AIQ.running) runAI(false);
  if (b.id === "aiTest") runAI(true);
  if (b.id === "aiPreview") previewAI();
  if (b.id === "aiExport"){ const c = JSON.parse(JSON.stringify(AI)); c.base.authValue = ""; c.adv.authValue = ""; await saveFile("pianta-libera-ai.json", JSON.stringify(c, null, 2)); }
  if (b.id === "aiReset"){ AI = aiDefaults(); aiSave(); renderAI(); }
});
function aiStatus(msg, cls=""){ const s = $("#aiStatus"); if (s){ s.textContent = msg; s.className = "status " + cls; } }
const getPath = (obj, path) => !path ? obj : path.split(".").reduce((o, k) => o == null ? undefined : o[/^\d+$/.test(k) ? +k : k], obj);
function fillTemplate(tpl, vars){
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => { const v = vars[k]; if (v === undefined) return ""; if (typeof v === "number") return String(v); if (typeof v === "object") return JSON.stringify(v); return JSON.stringify(String(v)).slice(1, -1); });
}
function aiBaseUrl(){ try { return new URL(aiConfig().url || "/", location.href).href; } catch(e){ return location.href; } }
function findImages(x, out=[]){
  if (out.length > 8 || x == null) return out;
  if (typeof x === "string"){ if (/^data:image\//.test(x)) out.push(x); else if (/^https?:\/\/\S+/.test(x) && /(\.png|\.jpe?g|\.webp)(\?|$)|\/(output|image|result|file|download)/i.test(x)) out.push(x); else if (x.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(x.slice(0, 200))) out.push("data:image/png;base64," + x.replace(/\s/g,"")); return out; }
  if (Array.isArray(x)){ x.forEach(v => findImages(v, out)); return out; }
  if (typeof x === "object") for (const v of Object.values(x)) findImages(v, out);
  return out;
}
function toImageList(v){ if (v == null) return []; if (Array.isArray(v)) return v.flatMap(toImageList); if (typeof v === "object") return findImages(v); const s = String(v); if (/^(data:|https?:|blob:)/.test(s)) return [s]; if (/^(\/|\.\.?\/)[^\s]*$/.test(s) || /^[\w.-]+\.php\?/.test(s)) return [new URL(s, aiBaseUrl()).href]; return ["data:image/png;base64," + s]; }
async function buildVars(cfg, test, ov){
  const size = renderer.getSize(new THREE.Vector2()), long = test ? 256 : (cfg.longSide || 1536);
  const opts = {longSide: long};
  let beauty;
  if (ov?.image){ const k = Math.min(1, long / Math.max(ov.image.width, ov.image.height)); beauty = document.createElement("canvas"); beauty.width = Math.round(ov.image.width * k); beauty.height = Math.round(ov.image.height * k); beauty.getContext("2d").drawImage(ov.image, 0, 0, beauty.width, beauty.height); }
  else beauty = renderAt(1, null, {...opts, hq:true});
  const guides = cfg.guides !== false && !ov;
  const need = k => guides && (cfg.template || "").includes(k);
  const outL = clamp(+cfg.outLongSide || long, 256, 1920), ar = ov?.image ? ov.image.width / ov.image.height : size.x / size.y;
  const ow = Math.round((ar >= 1 ? outL : outL*ar)/16)*16, oh = Math.round((ar >= 1 ? outL/ar : outL)/16)*16;
  const depth = need("depth") ? depthCanvas(1, opts) : null, lines = need("lines") ? linesCanvas(1, opts) : null, mats = need("materials") ? materialsCanvas(1, opts) : null;
  const d64 = c => c ? c.toDataURL("image/png") : "";
  const vars = {image_dataurl:d64(beauty), depth_dataurl:d64(depth), lines_dataurl:d64(lines), materials_dataurl:d64(mats?.canvas), materials_legend:JSON.stringify(mats?.legend || {}),
    prompt: ov?.prompt || cfg.prompt || aiPrompt(), negative: cfg.negative || "", model: cfg.model || "", strength: +cfg.strength || .4, steps: +cfg.steps || 30, guidance: +cfg.guidance || 6,
    seed: (+cfg.seed >= 0 ? +cfg.seed : Math.floor(Math.random()*2**31)), variants: clamp(+cfg.variants || 1, 1, 8), width: clamp(ow, 256, 1920), height: clamp(oh, 256, 1920), use_guides: guides,
    w_depth: +cfg.w_depth || 0, w_lines: +cfg.w_lines || 0, w_seg: +cfg.w_seg || 0, project: P.name,
    render_mode: ov || cfg.renderMode === "creativo" ? "creativo" : "fedele", scene: S.show3d === "all" && camera.position.y > level().elev + 2.2 ? "esterni" : (camera.fov > 55 ? "interni" : "esterni"),
    camera: {position:camera.position.toArray().map(v=>+v.toFixed(3)), target:controls.target.toArray().map(v=>+v.toFixed(3)), fov:camera.fov, aspect:+camera.aspect.toFixed(4), units:"m", up:"y"}};
  for (const k of ["image","depth","lines","materials"]) vars[k] = (vars[k + "_dataurl"] || "").replace(/^data:image\/png;base64,/, "");
  vars._canvases = {image:beauty, depth, lines, materials:mats?.canvas};
  return vars;
}
function aiConfig(){ return AI.mode === "base" ? {...AI.base, negative:"", variants:1, steps:30, guidance:6, seed:-1} : AI.adv; }
async function previewAI(){
  const cfg = aiConfig(); const vars = await buildVars(cfg, true); const short = {...vars}; for (const k of Object.keys(short)) if (typeof short[k] === "string" && short[k].length > 80) short[k] = short[k].slice(0, 40) + `…(${short[k].length} caratteri)`;
  delete short._canvases; aiLastRaw = "Corpo inviato (immagini abbreviate):\n" + fillTemplate(cfg.template, short); renderAI();
}
async function aiFetch(cfg, url, init){
  try { return await fetch(url, init); }
  catch(e){ throw new Error(inArtifact() ? "la connessione è bloccata: l'anteprima dentro Claude non permette chiamate a servizi esterni. Usa la versione caricata sul tuo sito." : "il servizio non risponde o non accetta richieste da questa pagina (CORS). Con la connessione «Tramite il mio sito» il problema non si pone."); }
}
async function readBody(r){ const ct = r.headers.get("content-type") || ""; if (ct.startsWith("image/")){ const b = await r.blob(); return {image:URL.createObjectURL(b)}; } const t = await r.text(); try { return JSON.parse(t); } catch(_){ return {text:t}; } }
async function runAI(test, opts = {}){
  if (aiBusy) return false; const cfg = aiConfig();
  const endpoint = cfg.url;
  if (!endpoint){ aiStatus("Inserisci l'endpoint: /api/render per il backend del progetto, oppure l'indirizzo di un servizio per una prova locale.", "err"); return; }
  const viaBackend = isBackendCfg(cfg);
  if (viaBackend){
    if (!aiConsent){ aiStatus("Per generare il render serve il consenso all'invio delle immagini al servizio (casella sopra).", "err"); return; }
    if (backendCfg.data?.enabled === false){ aiStatus("Render AI non attivo su questo sito" + (backendCfg.data.reason ? ` (${backendCfg.data.reason})` : "") + ".", "err"); return; }
    if (backendCfg.data?.turnstile_site_key && !tsToken){ aiStatus("Completa la verifica anti-bot sopra, poi riprova.", "err"); return; }
  }
  const token = tsToken;
  aiBusy = true; renderAI(); aiStatus(test ? "Provo la connessione con un'immagine piccola…" : "Preparo vista, profondità e contorni…");
  try {
    const vars = await buildVars(cfg, test, opts.override);
    vars.consent = viaBackend ? aiConsent : false; vars.turnstile = viaBackend ? token : "";
    const headers = {};
    if (cfg.authValue) headers[cfg.authHeader || "Authorization"] = cfg.authValue;
    for (const line of (cfg.extraHeaders || "").split(/\n|;/)){ const m = line.match(/^\s*([^:]+):\s*(.+)$/); if (m) headers[m[1].trim()] = m[2].trim(); }
    let body;
    if (cfg.contentType === "multipart"){
      const spec = JSON.parse(fillTemplate(cfg.template, vars)); const fd = new FormData();
      for (const [k, v] of Object.entries(spec)){
        if (typeof v === "string" && v.startsWith("@") && vars._canvases[v.slice(1)]){ const c = vars._canvases[v.slice(1)]; fd.append(k, await new Promise(r => c.toBlob(r, "image/png")), v.slice(1) + ".png"); }
        else fd.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
      body = fd;
    } else { body = fillTemplate(cfg.template, vars); try { JSON.parse(body); } catch(err){ throw new Error("il modello della richiesta non è un JSON valido: " + err.message); } headers["Content-Type"] = "application/json"; }
    aiStatus("Invio al servizio…");
    const t0 = Date.now(); let r = await aiFetch(cfg, endpoint, {method:"POST", headers, body}); let data = await readBody(r);
    if (viaBackend){ tsToken = ""; const q = r.headers.get("x-quota-remaining"); if (q !== null && q !== "") aiQuotaLeft = +q; }
    aiLastRaw = `HTTP ${r.status}\n` + JSON.stringify(data, (k,v) => typeof v === "string" && v.length > 300 ? v.slice(0,120) + `…(${v.length})` : v, 2).slice(0, 6000);
    if (!r.ok){ const code = data?.error?.code, msg = data?.error?.message; throw new Error(code === "consent_required" ? "serve il consenso all'invio delle immagini" : code === "bot_check_failed" ? "verifica anti-bot non superata: ripetila e riprova" : code === "config_incomplete" ? "il servizio di render non è ancora configurato su questo sito" : r.status === 429 ? `quota esaurita${msg ? ": " + msg : ""}` : r.status === 503 ? `servizio di render sospeso${msg ? ": " + msg : ""}` : `il servizio ha risposto ${r.status}${code ? " (" + code + ")" : ""}${msg ? ": " + msg : ""}. Dettagli sotto.`); }
    // lavoro asincrono
    let pollUrl = cfg.pollUrlPath ? getPath(data, cfg.pollUrlPath) : (cfg.jobIdPath && cfg.pollTemplate ? fillTemplate(cfg.pollTemplate, {job:getPath(data, cfg.jobIdPath)}) : null);
    if (pollUrl){
      const done = (cfg.doneValues||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean), fail = (cfg.failValues||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
      const getH = {...headers}; delete getH["Content-Type"];
      while (true){
        const st = String(getPath(data, cfg.statusPath) ?? "").toLowerCase();
        if (done.includes(st)) break; if (fail.includes(st)) throw new Error("il servizio segnala un errore: " + st);
        if ((Date.now() - t0)/1000 > (cfg.timeout || 300)) throw new Error("tempo scaduto in attesa del risultato");
        aiStatus(`In elaborazione${st ? ` (${st})` : ""} · ${Math.round((Date.now()-t0)/1000)} s`);
        await sleep((cfg.interval || 2) * 1000);
        const u = pollUrl;
        r = await aiFetch(cfg, u, {headers:getH}); data = await readBody(r);
        aiLastRaw = `HTTP ${r.status} (stato)\n` + JSON.stringify(data, (k,v) => typeof v === "string" && v.length > 300 ? v.slice(0,120) + `…(${v.length})` : v, 2).slice(0, 6000);
        if (!r.ok) throw new Error(`lo stato del lavoro ha risposto ${r.status}`);
      }
    }
    let imgs = data.image ? [data.image] : (cfg.resultPath ? toImageList(getPath(data, cfg.resultPath)) : findImages(data));
    if (!imgs.length) throw new Error("nella risposta non trovo immagini. Indica il «Percorso del risultato» (dettagli sotto).");
    if (imgs.length && opts.override?.composite){ aiStatus("Applico il ritocco solo nella zona dipinta…"); imgs = await Promise.all(imgs.map(opts.override.composite)); }
    const before = opts.override?.before || vars.image_dataurl;
    const now = new Date().toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit"});
    imgs.forEach(src => aiResults.unshift({src, before, time:now, mode: (data.mock ? "prova · " : "") + (opts.override ? "ritocco" : vars.render_mode === "creativo" ? "creativo" : "fedele"), prompt:vars.prompt}));
    if (!test) aiResults.slice(0, imgs.length).forEach(saveGalleryItem);
    if (data.mock) toast("Risposta del servizio di prova: l'immagine è la vista inviata, non un render AI");
    aiBusy = false; renderAI(); aiStatus(test ? `Connessione riuscita: ${imgs.length} immagine ricevuta in ${Math.round((Date.now()-t0)/1000)} s.` : `${imgs.length} render ricevuti in ${Math.round((Date.now()-t0)/1000)} s.${data.mock ? " Servizio di prova: l'immagine è la vista inviata, non un render AI." : ""}`, "ok");
    if (!test && !opts.queued) openCompare(aiResults[0]);
    return true;
  } catch(err){ console.warn(err); aiBusy = false; renderAI(); aiStatus("Non riuscito: " + (err.message || err), "err"); return false; }
  finally { if (isBackendCfg(cfg)) resetTurnstile(); }
}
function openCompare(r){ if (!r) return; $("#cmpBefore").src = r.before; $("#cmpAfter").src = r.src; $("#compare").hidden = false; $("#compare")._r = r; setCut(50); $("#cmpCut").value = 50; }
function setCut(v){ $("#cmpStage").style.setProperty("--cut", v + "%"); $("#cmpStage").querySelector(".after").style.clipPath = `inset(0 0 0 ${v}%)`; $("#cmpStage").querySelector(".divider").style.left = v + "%"; }
$("#cmpCut").addEventListener("input", e => setCut(+e.target.value));
$("#cmpClose").addEventListener("click", () => { $("#compare").hidden = true; });
$("#cmpSave").addEventListener("click", () => saveResult($("#compare")._r));
$("#cmpMask").addEventListener("click", () => { const r = $("#compare")._r; $("#compare").hidden = true; openMaskEditor(r); });
async function saveResult(r){
  if (!r) return;
  try { const blob = await (await fetch(r.src)).blob(); await saveFile(`${slug()}-render-ai-${Date.now().toString(36)}.png`, blob); }
  catch(e){ toast("Non riesco a scaricare l'immagine dal servizio: aprila con il tasto destro → Salva immagine", true); }
}
