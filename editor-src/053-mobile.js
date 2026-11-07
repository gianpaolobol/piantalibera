/* ============================================================
   Telefono e tablet: disposizione compatta, scheda del pannello dal basso, app installabile
   - Sotto i 900 px di larghezza (telefono, tablet in verticale): una vista per volta, strumenti in
     una striscia orizzontale, pannello come scheda con tre altezze (chiusa, metà, quasi intera)
     e scorrimento proprio. La pagina non scorre: un dito sulla pianta o sul 3D muove la vista.
   - Gesti a tocco (04-plan.js, 047-fase2.js): un dito sposta la vista; un tocco seleziona; si
     trascina solo un elemento già selezionato; due dita zoom e spostamento; tocco lungo = menu.
   - App installabile (PWA): manifest e service worker (public/sw.js) per l'uso senza rete.
   ============================================================ */
const COMPACT_MQ = matchMedia("(max-width: 900px), (max-height: 520px) and (pointer: coarse)");
const SHEET_STATES = ["peek", "half", "full"];
function setSheet(state){
  document.body.dataset.sheet = state; $(".sheet-grip")?.setAttribute("aria-expanded", state !== "peek");
  const side = $(".side"); if (side) side.style.removeProperty("--sheet-h");
}
function applyCompact(){
  const on = COMPACT_MQ.matches; document.body.classList.toggle("compact", on);
  if (on){
    if (!SHEET_STATES.includes(document.body.dataset.sheet)) setSheet("peek");
    if (($("#views")?.dataset.mode || "both") === "both") $('#viewSeg [data-v="2d"]')?.click();   // una vista per volta
  }
  requestAnimationFrame(() => { resize2D(); resize3D(); });
}
(() => {
  const side = $(".side"); if (!side) return;
  side.insertAdjacentHTML("afterbegin", `<div class="sheet-grip" role="button" tabindex="0" aria-label="Apri o chiudi il pannello" aria-expanded="false"><span></span></div>`);
  const grip = $(".sheet-grip", side);
  const cycle = () => setSheet(SHEET_STATES[(SHEET_STATES.indexOf(document.body.dataset.sheet) + 1) % SHEET_STATES.length]);
  grip.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); cycle(); } });
  // trascinare la maniglia cambia l'altezza; al rilascio si aggancia allo stato più vicino; un tocco passa al successivo
  let gd = null;
  grip.addEventListener("pointerdown", e => { e.preventDefault(); grip.setPointerCapture(e.pointerId); gd = {y:e.clientY, h:side.getBoundingClientRect().height, moved:false}; document.body.classList.add("sheet-dragging"); });
  grip.addEventListener("pointermove", e => { if (!gd) return; const dy = e.clientY - gd.y; if (Math.abs(dy) > 6) gd.moved = true; if (gd.moved) side.style.setProperty("--sheet-h", clamp(gd.h - dy, 50, innerHeight - 56) + "px"); });
  const end = () => { if (!gd) return; document.body.classList.remove("sheet-dragging");
    if (!gd.moved){ gd = null; cycle(); return; }
    const h = side.getBoundingClientRect().height, H = innerHeight, targets = {peek:50, half:H * .52, full:H - 56};
    gd = null; setSheet(Object.entries(targets).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]); };
  grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
  // scegliere una scheda la apre a metà; ripremere la scheda già aperta con il pannello chiuso fa lo stesso
  $(".tabs", side)?.addEventListener("click", e => { if (!document.body.classList.contains("compact") || !e.target.closest("[data-tab]")) return; if (document.body.dataset.sheet === "peek") setSheet("half"); });
  // il pannello non deve propagare lo scorrimento alla pagina (iOS) né i gesti alle viste
  COMPACT_MQ.addEventListener?.("change", applyCompact);
  applyCompact();
})();
/* su telefono le azioni che chiedono di guardare il pannello lo aprono */
function revealPanel(){ if (document.body.classList.contains("compact") && document.body.dataset.sheet === "peek") setSheet("half"); }

/* ---------- app installabile: Windows, Mac, Linux, Android, iPhone e iPad ---------- */
let installPrompt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; });          // Chrome ed Edge (computer e Android)
addEventListener("appinstalled", () => { installPrompt = null; toast("Pianta Libera è installata come app"); });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function installHTML(){
  if (isStandalone() || window.ReactNativeWebView || /PiantaLiberaApp|PiantaLiberaDesktop/.test(navigator.userAgent)) return `<p class="note">Stai usando Pianta Libera come app installata. Le altre versioni (Windows, Mac, Android, iPhone): <a href="scarica.html" target="_blank" rel="noopener">pagina di download</a>.</p>`;
  if (installPrompt) return `<div class="btns"><button class="btn primary" id="installBtn">Installa come app</button></div><p class="note">Si apre in una finestra sua, con l'icona tra le app, e funziona anche senza rete.</p>`;
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), safariMac = /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Edg|Firefox/.test(ua);
  if (ios) return `<p class="note"><b>Installala come app</b>: tocca Condividi e poi «Aggiungi alla schermata Home».</p>`;
  if (safariMac) return `<p class="note"><b>Installala come app</b>: menu File → «Aggiungi al Dock».</p>`;
  return `<p class="note"><b>Installala come app</b> da Chrome o Edge: icona di installazione nella barra degli indirizzi, oppure menu → «Installa Pianta Libera». Programmi per Windows e Mac e app per telefono: <a href="scarica.html" target="_blank" rel="noopener">pagina di download</a>.</p>`;
}
document.addEventListener("click", async e => { if (!e.target.closest("#installBtn") || !installPrompt) return; installPrompt.prompt(); const r = await installPrompt.userChoice.catch(() => null); installPrompt = null; const box = $("#installBox"); if (box) box.innerHTML = r?.outcome === "accepted" ? `<p class="note">Installazione avviata.</p>` : installHTML(); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname)) && !/[?&]nosw\b/.test(location.search)){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker:", e.message)));
}
/* risposte dell'app nativa (app-mobile/) al salvataggio dei file */
addEventListener("pl-native-error", e => toast("Salvataggio non riuscito: " + e.detail, true));
