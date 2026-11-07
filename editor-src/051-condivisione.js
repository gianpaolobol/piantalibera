/* ============================================================
   Fase 4 — Condivisione con il cliente e commenti
   Il progettista crea un link (progetto salvato sul server per 30 giorni,
   senza prezzi né modelli importati); il cliente lo apre in sola lettura,
   naviga pianta e 3D e lascia commenti puntati in pianta con la vista 3D.
   ============================================================ */
const SHARE_TOK_KEY = "pianta-libera-share-tokens";
const shareTokens = () => { try { return JSON.parse(localStorage.getItem(SHARE_TOK_KEY)) || {}; } catch(e){ return {}; } };
function setShareToken(id, tok){ const t = shareTokens(); if (tok) t[id] = tok; else delete t[id]; try { localStorage.setItem(SHARE_TOK_KEY, JSON.stringify(t)); } catch(e){} }
const apiUrl = p => new URL("api/" + p, new URL(".", location.href)).href;
const SH = {cfg:null, loading:false, ts:"", tsId:null, busy:false};
S.comments = S.comments || [];
async function shareConfig(force){
  if (SH.cfg && !force) return SH.cfg;
  try { const r = await fetch(apiUrl("config"), {cache:"no-store"}); const d = r.ok ? await r.json() : null; SH.cfg = d?.share ? {...d.share, site_key:d.turnstile_site_key || null} : {enabled:false, reason:"Su questo sito non c'è il servizio di condivisione (serve il Worker o il server locale)."}; }
  catch(e){ SH.cfg = {enabled:false, reason:"Servizio di condivisione non raggiungibile."}; }
  return SH.cfg;
}
async function shareFetch(path, init = {}){
  const r = await fetch(apiUrl("share" + path), {...init, headers:{...(init.body ? {"Content-Type":"application/json"} : {}), ...(init.headers || {})}});
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.message || `il server ha risposto ${r.status}`); return d;
}
/* progetto da condividere: senza prezzi, senza file dei modelli importati, senza dati di condivisione */
function sharePayload(){ const d = projectData(); delete d.prices; delete d.share; delete d.imports; delete d.pid; d.objects = d.objects.filter(o => o.kind !== "import"); return d; }
async function mountShareTs(box){
  const key = SH.cfg?.site_key || backendCfg.data?.turnstile_site_key; if (!box) return;
  if (!key){ box.textContent = "Verifica anti-bot richiesta ma chiave non disponibile: apri la scheda Render AI e riprova."; return; }
  try { await loadTurnstile(); if (box.childElementCount) return; SH.ts = ""; SH.tsId = window.turnstile.render(box, {sitekey:key, size:"flexible", language:"it", callback:t => { SH.ts = t; }, "expired-callback":() => { SH.ts = ""; }}); } catch(e){ box.textContent = "Verifica anti-bot non disponibile: " + e.message; }
}
function resetShareTs(){ SH.ts = ""; try { if (SH.tsId != null) window.turnstile.reset(SH.tsId); } catch(e){} }
const shareLink = id => { const u = new URL(location.href); u.search = ""; u.hash = ""; u.searchParams.set("condividi", id); return u.href; };

/* ---------- lato progettista (scheda Esporta) ---------- */
function shareHTML(){
  const c = SH.cfg, sh = P.share, tok = sh && shareTokens()[sh.id], open = S.comments.filter(x => !x.resolved).length;
  if (!c){ shareConfig().then(() => { if (S.tab === "export") renderExport(); }); return `<div class="exp"><header><h4>Condividi con il cliente</h4></header><p class="note">Controllo il servizio…</p></div>`; }
  if (!sh) return `<div class="exp"><header><h4>Condividi con il cliente</h4><span class="tag">link · commenti</span></header>
    ${c.enabled ? `<p class="note">Crea un link da mandare al cliente: vede pianta e 3D in sola lettura, gira il modello, cammina negli interni e lascia commenti puntati sulla pianta. ${c.local ? "Il server locale tiene i link finché resta acceso (rete locale)." : `Il progetto viene salvato su Cloudflare per ${c.ttl_days} giorni, poi si cancella; i prezzi del computo e i modelli importati non vengono inviati.`}</p>
      <label class="chk"><input type="checkbox" id="shConsent"> Acconsento a salvare il progetto sul server per la condivisione (30 giorni · <a href="privacy.html" target="_blank" rel="noopener">informativa</a>)</label>${c.turnstile ? `<div id="shTs" class="ts"></div>` : ""}
      <div class="btns"><button class="btn primary" id="shCreate">Crea il link per il cliente</button></div>` : `<p class="note">${esc(c.reason || "Condivisione non disponibile su questo server.")}</p>`}<p class="status" id="shStatus"></p></div>`;
  const link = shareLink(sh.id), exp = sh.expires_at ? new Date(sh.expires_at).toLocaleDateString("it-IT") : "";
  return `<div class="exp"><header><h4>Condividi con il cliente</h4><span class="tag">${open ? `${open} commenti da leggere` : "link attivo"}</span></header>
    <div class="f"><label class="lbl" for="shLink">Link (scade il ${esc(exp)})</label><input id="shLink" class="inp" readonly value="${esc(link)}"></div>
    <div class="btns"><button class="btn" id="shCopy">Copia il link</button>${tok ? `<button class="btn" id="shUpdate">Aggiorna con le modifiche</button>` : ""}<button class="btn" id="shLoad">Leggi i commenti</button>${tok ? `<button class="btn danger" id="shDelete">Elimina il link</button>` : ""}</div>
    ${tok ? "" : `<p class="note warn">Questo browser non ha il token del link: puoi leggere i commenti ma non aggiornare né eliminare.</p>`}
    ${c.turnstile && tok ? `<div id="shTs" class="ts"></div>` : ""}
    ${commentsListHTML(true)}<p class="status" id="shStatus"></p></div>`;
}
function commentsListHTML(owner){
  if (!S.comments.length) return `<p class="note">${owner ? "Nessun commento per ora." : "Ancora nessun commento: aggiungi il primo."}</p>`;
  return `<ol class="cmts">${S.comments.map((c, i) => `<li class="${c.resolved ? "done" : ""}"><b>${i + 1}. ${esc(c.author)}</b> <small>${new Date(c.created_at).toLocaleString("it-IT", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"})}${c.resolved ? " · risolto" : ""}</small><p>${esc(c.text)}</p>
    <span class="btns"><button class="btn" data-cgo="${esc(c.id)}">Mostra</button>${owner && shareTokens()[P.share?.id] ? `<button class="btn" data-cres="${esc(c.id)}">${c.resolved ? "Riapri" : "Risolto"}</button><button class="btn danger" data-cdel="${esc(c.id)}">Elimina</button>` : ""}</span></li>`).join("")}</ol>`;
}
async function loadComments(){ if (!P.share) return; try { const d = await shareFetch("/" + P.share.id + "/comments"); S.comments = d.comments || []; } catch(e){ if (/inesistente|scaduto/.test(e.message)){ S.comments = []; } throw e; } draw2D(); if (S.tab === "export") renderExport(); }
function shareStatus(m, err){ const s = $("#shStatus"); if (s){ s.textContent = m; s.className = "status" + (err ? " err" : ""); } }
$("#panel-export").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cgo){ focusComment(b.dataset.cgo); return; }
  if (!["shCreate", "shCopy", "shUpdate", "shLoad", "shDelete"].includes(b.id) && !b.dataset.cres && !b.dataset.cdel) return;
  const tok = P.share && shareTokens()[P.share.id];
  try {
    if (b.id === "shCreate"){
      if (!$("#shConsent")?.checked){ shareStatus("Serve il consenso a salvare il progetto sul server.", true); return; }
      if (SH.cfg.turnstile && !SH.ts){ shareStatus("Completa la verifica anti-bot qui sopra.", true); return; }
      b.disabled = true; shareStatus("Creo il link…");
      const d = await shareFetch("", {method:"POST", body:JSON.stringify({name:P.name, project:sharePayload(), turnstile:SH.ts})}); resetShareTs();
      setShareToken(d.id, d.token); P.share = {id:d.id, expires_at:d.expires_at}; S.comments = []; commit(); renderExport(); shareStatus("Link creato: copialo e mandalo al cliente.");
      try { await navigator.clipboard.writeText(shareLink(d.id)); toast("Link copiato negli appunti"); } catch(_){}
    }
    if (b.id === "shCopy"){ const inp = $("#shLink"); try { await navigator.clipboard.writeText(inp.value); toast("Link copiato"); } catch(_){ inp.select(); toast("Seleziona e copia il link"); } }
    if (b.id === "shUpdate"){ b.disabled = true; await shareFetch("/" + P.share.id, {method:"PUT", headers:{"X-Share-Token":tok}, body:JSON.stringify({name:P.name, project:sharePayload()})}); shareStatus("Il cliente vede ora l'ultima versione."); b.disabled = false; }
    if (b.id === "shLoad"){ await loadComments(); shareStatus(`${S.comments.length} commenti.`); }
    if (b.id === "shDelete"){ if (b.dataset.sure !== "1"){ b.dataset.sure = "1"; b.textContent = "Conferma: elimina"; return; } await shareFetch("/" + P.share.id, {method:"DELETE", headers:{"X-Share-Token":tok}}); setShareToken(P.share.id, null); delete P.share; S.comments = []; commit(); renderExport(); toast("Link eliminato: il cliente non lo può più aprire"); }
    if (b.dataset.cres){ const c = S.comments.find(x => x.id === b.dataset.cres); await shareFetch(`/${P.share.id}/comments/${c.id}`, {method:"PATCH", headers:{"X-Share-Token":tok}, body:JSON.stringify({resolved:!c.resolved})}); c.resolved = !c.resolved; draw2D(); renderExport(); }
    if (b.dataset.cdel){ await shareFetch(`/${P.share.id}/comments/${b.dataset.cdel}`, {method:"DELETE", headers:{"X-Share-Token":tok}}); S.comments = S.comments.filter(x => x.id !== b.dataset.cdel); draw2D(); renderExport(); }
  } catch(err){ shareStatus("Non riuscito: " + err.message, true); b.disabled = false; resetShareTs(); }
});
function afterRenderExportShare(){ if (SH.cfg?.turnstile) mountShareTs($("#shTs")); if (P.share && SH.loadedFor !== P.share.id){ SH.loadedFor = P.share.id; loadComments().catch(() => {}); } }

/* ---------- segnaposto dei commenti in pianta ---------- */
function drawCommentPins(g){
  if (!S.comments?.length) return;
  S.comments.forEach((c, i) => { if (!c.at || (c.level && c.level !== S.level && level(c.level))) return; const s = toS(c.at), on = S.viewer?.open === c.id;
    g.save(); g.fillStyle = c.resolved ? C.muted : "#d0462c"; g.strokeStyle = C.bg; g.lineWidth = 2; g.beginPath(); g.arc(s[0], s[1] - 14, on ? 11 : 9, 0, Math.PI*2); g.moveTo(s[0] - 5, s[1] - 9); g.lineTo(s[0], s[1]); g.lineTo(s[0] + 5, s[1] - 9); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "600 10px Archivo, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), s[0], s[1] - 14); g.restore(); });
  const d = S.viewer?.draft; if (d?.at){ const s = toS(d.at); g.save(); g.strokeStyle = "#d0462c"; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(s[0], s[1] - 14, 10, 0, Math.PI*2); g.stroke(); g.restore(); }
}
function pinAt(sp){ for (let i = S.comments.length - 1; i >= 0; i--){ const c = S.comments[i]; if (!c.at || (c.level && c.level !== S.level)) continue; const s = toS(c.at); if (Math.hypot(s[0] - sp[0], s[1] - 14 - sp[1]) < 11) return c; } return null; }
function focusComment(id){
  const c = S.comments.find(x => x.id === id); if (!c) return;
  if (c.level && level(c.level) && c.level !== S.level){ S.level = c.level; applyVisibility(); renderLevels(); }
  if (c.at){ V.cx = c.at[0]; V.cy = c.at[1]; }
  if (c.cam) applyCamState(c.cam);
  if (S.viewer){ S.viewer.open = c.id; renderInspector(); }
  draw2D(); render3D();
}

/* ---------- lato cliente: sola lettura ---------- */
async function enterViewer(id){
  S.viewer = {id, open:null, draft:null, adding:false}; document.body.classList.add("viewer");
  busy("Apro il progetto condiviso…");
  try {
    const d = await shareFetch("/" + encodeURIComponent(id)); await shareConfig();
    P = migrate(d.project); P.pid = "condiviso-" + id; S.viewer.name = d.name; S.viewer.expires = d.expires_at; S.viewer.updated = d.updated_at; S.comments = d.comments || [];
    S.level = P.levels[0].id; setSel([]); snap = JSON.stringify(P); past.length = 0; future.length = 0;
    $("#projName").value = d.name; $("#projName").readOnly = true; S.tab = "props"; renderTabs(); setTool("select");
    refresh(); fitPlan(); applySky(); camPreset("ext"); $("#tag2d")?.insertAdjacentHTML("beforeend", `<span class="viewtag">sola lettura</span>`);
  } catch(e){ S.viewer.error = e.message; renderInspector(); }
  finally { busy(""); }
}
function viewerPanelHTML(){
  const v = S.viewer;
  if (v.error) return `<div class="sec"><h3>Progetto condiviso</h3><p class="note warn">Non riesco ad aprirlo: ${esc(v.error)}</p><p class="note">Il link potrebbe essere scaduto o eliminato: chiedi un link nuovo a chi te l'ha mandato.</p></div>`;
  const d = v.draft, open = v.open && S.comments.find(c => c.id === v.open);
  return `<div class="sec"><h3>Progetto condiviso</h3><p class="note"><b>${esc(v.name || "Progetto")}</b> · aggiornato il ${v.updated ? new Date(v.updated).toLocaleDateString("it-IT") : "—"} · il link scade il ${v.expires ? new Date(v.expires).toLocaleDateString("it-IT") : "—"}.</p>
    <p class="note">Gira il modello nel 3D, prova «A piedi» per camminare dentro, cambia piano dalle schede sopra la pianta. Per lasciare un commento premi il pulsante qui sotto e poi clicca il punto della pianta.</p></div>
    ${open ? `<div class="sec"><h3>Commento ${S.comments.indexOf(open) + 1}</h3><p><b>${esc(open.author)}</b>: ${esc(open.text)}</p>${open.cam ? `<button class="btn" data-cgo="${esc(open.id)}">Vista 3D del commento</button>` : ""}</div>` : ""}
    <div class="sec"><h3>Nuovo commento</h3>
      ${d?.at ? `${F("cmAuthor", "Il tuo nome", PREFS.cmAuthor || "", 'maxlength="60" autocomplete="name"')}<div class="f"><label class="lbl" for="cmText">Commento</label><textarea id="cmText" class="inp" maxlength="1000" placeholder="Es. qui vorremmo una finestra più grande"></textarea></div>
        <label class="chk"><input type="checkbox" id="cmCam" checked> Allega la vista 3D che vedo ora</label>${SH.cfg?.turnstile ? `<div id="cmTs" class="ts"></div>` : ""}
        <div class="btns"><button class="btn primary" id="cmSend">Invia il commento</button><button class="btn" id="cmCancel">Annulla</button></div>`
        : `<div class="btns"><button class="btn primary" id="cmAdd" aria-pressed="${v.adding}">${v.adding ? "Clicca il punto in pianta…" : "Aggiungi un commento"}</button></div>`}
      <p class="status" id="cmStatus"></p></div>
    <div class="sec"><h3>Commenti (${S.comments.length})</h3>${commentsListHTML(false)}</div>
    <p class="note">Il nome e il testo che scrivi sono visibili a chi ha il link. Niente altro viene raccolto.</p>`;
}
$("#panel-props").addEventListener("click", async e => {
  if (!S.viewer) return; const b = e.target.closest("button"); if (!b) return; const v = S.viewer;
  if (b.dataset.cgo){ focusComment(b.dataset.cgo); return; }
  if (b.id === "cmAdd"){ v.adding = !v.adding; renderInspector(); return; }
  if (b.id === "cmCancel"){ v.draft = null; v.adding = false; renderInspector(); draw2D(); return; }
  if (b.id === "cmSend"){
    const text = $("#cmText").value.trim(), author = $("#cmAuthor").value.trim(), st = $("#cmStatus");
    if (!text){ st.textContent = "Scrivi il commento."; st.className = "status err"; return; }
    if (SH.cfg?.turnstile && !SH.ts){ st.textContent = "Completa la verifica anti-bot."; st.className = "status err"; return; }
    PREFS.cmAuthor = author; savePrefs(); b.disabled = true;
    try { const c = await shareFetch(`/${v.id}/comments`, {method:"POST", body:JSON.stringify({author, text, level:v.draft.level, at:v.draft.at, cam:$("#cmCam").checked ? camState() : null, turnstile:SH.ts})});
      S.comments.push(c); v.draft = null; v.adding = false; v.open = c.id; resetShareTs(); renderInspector(); draw2D(); toast("Commento inviato"); }
    catch(err){ st.textContent = "Non inviato: " + err.message; st.className = "status err"; b.disabled = false; resetShareTs(); }
  }
});
/* in sola lettura la pianta si sposta trascinando, i clic aprono i commenti o ne posano uno nuovo */
c2d.addEventListener("pointerdown", e => {
  if (!S.viewer || e.button !== 0) return; e.stopImmediatePropagation(); e.preventDefault();
  const sp = evP(e), pin = pinAt(sp); c2d.setPointerCapture(e.pointerId); pointers.set(e.pointerId, sp);
  if (S.viewer.adding){ S.viewer.draft = {at:toW(...sp).map(v => +v.toFixed(3)), level:S.level}; S.viewer.adding = false; renderInspector(); draw2D(); setTimeout(() => $("#cmText")?.focus(), 30); if (SH.cfg?.turnstile) mountShareTs($("#cmTs")); return; }
  if (pin){ S.viewer.open = pin.id; renderInspector(); draw2D(); return; }
  drag = {type:"pan", sp, c:[V.cx, V.cy]};
}, {capture:true});
c2d.addEventListener("dblclick", e => { if (S.viewer) e.stopImmediatePropagation(); }, {capture:true});
document.addEventListener("keydown", e => { if (!S.viewer || e.target.closest("input,textarea,select")) return; if (!["Escape", "?", "Tab"].includes(e.key) && !WALK.on) e.stopImmediatePropagation(); }, {capture:true});
