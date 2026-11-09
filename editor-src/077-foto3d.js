/* ============================================================
   Da foto al 3D — scheda Importa
   Una foto di un interno → bozza 3D modificabile: muri, porte, finestre, arredi, luci, persone, materiali.
   1. la foto (ridotta a 1280 px) va a /api/foto: il modello con visione elenca ambienti e oggetti, il
      rilevatore precisa i riquadri (shared/photo.js, worker/src/index.js);
   2. l'utente porta i quattro punti sugli spigoli della parete di fondo e indica una misura nota;
   3. la geometria si ricava dalla prospettiva (fotocamera a obiettivo diritto, stanza a scatola):
      campo visivo dall'EXIF della foto o stimato, inclinazione dalle verticali della parete,
      scala dalla misura nota; ogni oggetto si proietta sul pavimento, sul soffitto o sul muro;
   4. revisione (categorie, inclusione, riquadri spostabili) e creazione nel piano corrente, con la
      camera «Vista della foto» per confrontare e fare i render dallo stesso punto di vista.
   Non è un rilievo: le misure vanno verificate.
   ============================================================ */
const F3_CATS = {
  porta:{n:"Porta", kind:"door"}, portafinestra:{n:"Portafinestra", kind:"door", style:"portafinestra"}, porta_scorrevole:{n:"Porta scorrevole", kind:"door", style:"scorrevole"}, finestra:{n:"Finestra", kind:"window"},
  divano:{n:"Divano", ref:"divano3", w:2.2, d:.92}, divano_angolare:{n:"Divano angolare", ref:"divano_ang", w:2.8, d:1.9}, poltrona:{n:"Poltrona", ref:"poltrona", w:.86, d:.84}, pouf:{n:"Pouf", ref:"pouf", w:.54, d:.54},
  tavolino:{n:"Tavolino", ref:"tavolino", w:1.1, d:.6}, tavolino_tondo:{n:"Tavolino tondo", ref:"tavolino_t", w:.8, d:.8}, mobile_tv:{n:"Mobile TV", ref:"mobile_tv", w:1.9, d:.42}, libreria:{n:"Libreria", ref:"libreria", w:1.2, d:.35},
  tappeto:{n:"Tappeto", ref:"tappeto", w:2.4, d:1.7, flat:true}, lampada_terra:{n:"Lampada da terra", ref:"lampada", w:.4, d:.4, light:true}, tavolo:{n:"Tavolo", ref:"tavolo6", w:2, d:.95}, tavolo_tondo:{n:"Tavolo tondo", ref:"tavolo_tondo", w:1.2, d:1.2},
  sedia:{n:"Sedia", ref:"sedia", w:.45, d:.45}, madia:{n:"Madia", ref:"madia", w:1.8, d:.45}, cucina:{n:"Cucina", ref:"cucina", w:3, d:.6}, isola:{n:"Isola", ref:"isola", w:2.1, d:1}, frigorifero:{n:"Frigorifero", ref:"frigo", w:.7, d:.68},
  sgabello:{n:"Sgabello", ref:"sgabello", w:.38, d:.38}, letto_matrimoniale:{n:"Letto matrimoniale", ref:"letto2", w:1.74, d:2.12}, letto_singolo:{n:"Letto singolo", ref:"letto1", w:.98, d:2.08}, comodino:{n:"Comodino", ref:"comodino", w:.5, d:.4},
  armadio:{n:"Armadio", ref:"armadio2", w:1.2, d:.62}, cassettiera:{n:"Cassettiera", ref:"cassettiera", w:1, d:.5}, scrivania:{n:"Scrivania", ref:"scrivania", w:1.4, d:.7}, sedia_ufficio:{n:"Sedia da ufficio", ref:"sedia_uff", w:.68, d:.68},
  wc:{n:"WC", ref:"wc", w:.38, d:.54}, bidet:{n:"Bidet", ref:"bidet", w:.38, d:.54}, lavabo:{n:"Lavabo", ref:"lavabo", w:.82, d:.5}, doccia:{n:"Doccia", ref:"doccia", w:.9, d:.9}, vasca:{n:"Vasca", ref:"vasca", w:1.7, d:.76},
  pianta:{n:"Pianta", ref:"vaso_verde", w:.6, d:.6, keep:true}, persona:{n:"Persona", ref:"sagoma_uomo", w:.5, d:.35, keep:true},
  lampadario:{n:"Lampadario", ref:"sospensione", w:.44, d:.44, mount:"ceiling", light:true}, plafoniera:{n:"Plafoniera", ref:"plafoniera", w:.4, d:.4, mount:"ceiling", light:true}, faretto:{n:"Faretto", ref:"faretto", w:.1, d:.1, mount:"ceiling", light:true},
  applique:{n:"Applique", ref:"applique", w:.2, d:.15, mount:"wall", light:true}, scala:{n:"Scala", ref:"scala_dritta", w:1, d:3}, altro:{n:"Altro (non creato)", skip:true},
};
/* quota del bordo superiore visibile (piano del tavolo, testiera del letto, schienale): serve quando la base non si vede */
const F3_TOP = {tavolo:.75, tavolo_tondo:.75, tavolino:.4, tavolino_tondo:.4, scrivania:.75, isola:.9, madia:.8, cassettiera:.85, comodino:.55, letto_matrimoniale:1, letto_singolo:1, divano:.85, poltrona:.8};
const F3_WALLISH = new Set(["divano", "divano_angolare", "letto_matrimoniale", "letto_singolo", "armadio", "libreria", "madia", "cassettiera", "mobile_tv", "cucina", "comodino", "scrivania", "frigorifero", "lavabo", "wc", "bidet", "vasca"]);
const F3_FLOOR = {parquet:"parquet", laminato:"parquet", piastrelle:"gres", resina:"cemento", cemento:"cemento", marmo:"marmo", pietra:"pietra", cotto:"gres", moquette:"tappeto", altro:"parquet"};
const F3_REF = [["ceil", "Altezza del soffitto"], ["width", "Larghezza della parete di fondo"], ["cam", "Altezza della fotocamera da terra"]];
const F3 = {img:null, thumb:null, w:0, h:0, name:"", exifFov:null, a:null, quad:null, items:[], sel:-1, busy:false, err:"", cfg:null, cfgErr:"", ts:{widget:null, token:""},
  opts:{refKind:"ceil", refVal:2.7, fov:null, depth:null, ceil:true}, report:null, meta:null};
const F3_CONSENT_KEY = "pianta-libera-foto-consenso";
let f3Consent = (() => { try { return localStorage.getItem(F3_CONSENT_KEY) === "1"; } catch(e){ return false; } })();
const f3Url = () => { const u = AI.base?.url || "/api/render"; return /\/render\/?$/.test(u) && sameOrigin(u) ? u.replace(/\/render\/?$/, "/foto") : "/api/foto"; };

/* ---------- EXIF: focale equivalente 35 mm → campo visivo orizzontale ---------- */
function exifFocal35(buf){
  try {
    const v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null;
    for (let i = 2; i < v.byteLength - 10;){
      const m = v.getUint16(i); if ((m & 0xFF00) !== 0xFF00) return null; const len = v.getUint16(i + 2);
      if (m === 0xFFE1 && v.getUint32(i + 4) === 0x45786966){
        const t = i + 10, le = v.getUint16(t) === 0x4949, u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
        const ifd = (o, want) => { const n = u16(o); for (let k = 0; k < n; k++){ const e = o + 2 + k * 12; if (u16(e) === want) return e; } return null; };
        const ex = ifd(u32(4), 0x8769); if (ex == null) return null;
        const f = ifd(u32(ex + 8), 0xA405); return f == null ? null : u16(f + 8) || null;
      }
      i += 2 + len;
    }
  } catch(e){}
  return null;
}
async function f3LoadFile(file){
  if (file.type && !/^image\//.test(file.type)) throw new Error("serve una foto (JPEG, PNG, WebP o HEIC)");
  if (file.size > 40e6) throw new Error("foto troppo grande (massimo 40 MB)");
  const f35 = exifFocal35(await file.slice(0, 256 * 1024).arrayBuffer());
  // createImageBitmap con l'orientamento EXIF; se il browser non lo regge (WebView, Safari datati) si passa da <img>
  const bmp = await createImageBitmap(file, {imageOrientation:"from-image"}).catch(() => createImageBitmap(file)).catch(() => new Promise((ok, ko) => {
    const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); ko(new Error("formato della foto non leggibile da questo browser")); }; im.src = u; }));
  if (!bmp.width && bmp.naturalWidth){ bmp.width = bmp.naturalWidth; bmp.height = bmp.naturalHeight; }
  const scale = (max) => Math.min(1, max / Math.max(bmp.width, bmp.height));
  const draw = (max, q) => { const k = scale(max), c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return {url:c.toDataURL("image/jpeg", q), w:c.width, h:c.height}; };
  const big = draw(1280, .86), small = draw(640, .8);
  if (Math.min(big.w, big.h) < 256) throw new Error("foto troppo piccola: serve almeno 256 px sul lato corto");
  const landscape = big.w >= big.h;
  Object.assign(F3, {img:big.url, thumb:small.url, w:big.w, h:big.h, name:file.name, a:null, quad:null, items:[], sel:-1, err:"", report:null, meta:null, seg:null, fitFov:null,
    exifFov: f35 ? +(2 * Math.atan((landscape ? 18 : 12) / f35) * 180 / Math.PI).toFixed(1) : null});
  F3.opts = {refKind:"ceil", refVal:2.7, fov:null, depth:null, ceil:true};
}

/* ---------- servizio ---------- */
async function f3LoadConfig(){
  if (F3.cfg || F3.cfgLoading) return; F3.cfgLoading = true;
  try { const r = await fetch(f3Url().replace(/\/foto$/, "/config"), {headers:{Accept:"application/json", ...ownerHeaders()}}); const d = await r.json(); if (!r.ok) throw new Error("HTTP " + r.status); F3.cfg = d; }
  catch(e){ F3.cfgErr = "servizio non raggiungibile"; }
  F3.cfgLoading = false; if (S.tab === "import") renderImport();
}
async function f3MountTurnstile(){
  const key = F3.cfg?.turnstile_site_key, box = $("#f3Turnstile"); if (!key || !box || F3.cfg?.quota?.owner || box.childElementCount) return;
  try { await loadTurnstile(); if (!document.body.contains(box) || box.childElementCount) return; try { if (F3.ts.widget != null) window.turnstile.remove(F3.ts.widget); } catch(_){}
    F3.ts.token = ""; F3.ts.widget = window.turnstile.render(box, {sitekey:key, size: box.clientWidth >= 300 ? "flexible" : "compact", language:"it", callback:t => { F3.ts.token = t; }, "expired-callback":() => { F3.ts.token = ""; }, "error-callback":() => { F3.ts.token = ""; }}); }
  catch(e){ box.textContent = "Verifica anti-bot non disponibile: " + e.message; }
}
async function f3Analyze(){
  if (!F3.img || F3.busy) return;
  if (!f3Consent){ F3.err = "Per analizzare la foto serve il consenso all'invio (casella sopra)."; return renderImport(); }
  const owner = !!F3.cfg?.quota?.owner;
  if (F3.cfg?.turnstile_site_key && !owner && !F3.ts.token){ F3.err = "Completa la verifica anti-bot, poi riprova."; return renderImport(); }
  F3.busy = true; F3.err = ""; renderImport(); busy("Analizzo la foto… (20–40 secondi)");
  if (!F3.seg || F3.seg.img !== F3.img) f3Segment();           // in parallelo, nel dispositivo
  try {
    const r = await fetch(f3Url(), {method:"POST", headers:{"Content-Type":"application/json", ...ownerHeaders()}, body:JSON.stringify({image:F3.img, consent:true, turnstile:F3.ts.token})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || "errore " + r.status);
    if (!j.analysis) throw new Error("risposta del servizio senza analisi");
    f3Accept(j); F3.openAfter = true;
  } catch(e){ F3.err = "Analisi non riuscita: " + (e.message || e); }
  finally { F3.busy = false; busy(""); F3.ts.token = ""; try { if (F3.ts.widget != null) window.turnstile?.reset(F3.ts.widget); } catch(e){} renderImport(); if (F3.openAfter){ F3.openAfter = false; f3OpenModal(); } }
}
/* accoglie l'analisi del servizio: spigoli proposti, misure, elementi da rivedere */
/* ---------- segmentazione nel dispositivo (shared/photo-seg.js) ----------
   SegFormer-b2 ADE20K con transformers.js: modello di ~28 MB scaricato una volta e poi in cache. Parte insieme
   all'analisi del server; se il browser non ce la fa (rete, memoria) si va avanti senza. */
const F3_TJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
let f3SegPipe = null, f3DetPipe = null;
/* rilevatore di oggetti nel dispositivo: D-FINE S addestrato su Objects365 (365 classi, molti arredi; Apache 2.0).
   Separa gli oggetti uno per uno (sedie, mobili), dove la segmentazione unisce; banco NYU: sedie 47/66, mobili 39/101 */
const F3_DET = {model:"onnx-community/dfine_s_obj365-ONNX", dtype:"fp32", min:.45};
const F3_O365 = {"Chair":"sedia", "Stool":"sgabello", "Couch":"divano", "Bed":"letto_matrimoniale", "Desk":"scrivania", "Dining Table":"tavolo", "Coffee Table":"tavolino",
  "Nightstand":"comodino", "Cabinet/shelf":"madia", "Monitor/TV":"mobile_tv", "Toilet":"wc", "Sink":"lavabo", "Bathtub":"vasca", "Refrigerator":"frigorifero", "Oven":"cucina",
  "Gas stove":"cucina", "Lamp":"lampada_terra", "Potted Plant":"pianta", "Carpet":"tappeto", "Person":"persona"};
async function f3Segment(){
  if (F3.seg?.state === "run") return F3.seg.promise;
  const job = F3.seg = {state:"run", img:F3.img};
  job.promise = (async () => {
    try {
      if (!f3SegPipe){ const T = await import(F3_TJS); T.env.allowLocalModels = false; f3SegPipe = await T.pipeline("image-segmentation", SEG_MODEL, {dtype:"q8"}); f3SegPipe.RawImage = T.RawImage; }
      const raw = await f3SegPipe.RawImage.fromURL(F3.thumb || F3.img), segs = await f3SegPipe(raw);
      let dets = [];
      if (F3_DET.on !== false) try {
        if (!f3DetPipe){ const T = await import(F3_TJS); f3DetPipe = await T.pipeline("object-detection", F3_DET.model, {dtype:F3_DET.dtype}); }
        dets = (await f3DetPipe(raw, {threshold:F3_DET.min, percentage:true})).filter(d => F3_O365[d.label]).map(d => ({category:F3_O365[d.label], score:d.score, box:[d.box.xmin, d.box.ymin, d.box.xmax, d.box.ymax].map(v => +Math.min(1, Math.max(0, v)).toFixed(4))}));
      } catch(e){ console.warn("rilevatore:", e); }
      if (F3.seg !== job) return;
      const m = labelMap(segs, 320);
      // spigoli: modello di stanza adattato alle giunzioni (robusto agli arredi); in subordine la spezzata
      const box = fitRoomBox(m, {hfov:F3.opts.fov || F3.exifFov || null, aspect:F3.h / F3.w}), poly = wallCorners(m);
      let depth = null;
      if (F3_DEPTH.on !== false) try { job.phase = "profondita"; if (F3.open) f3RenderModal(); const D = await f3DepthRun(F3.thumb || F3.img); if (F3.seg !== job) return; depth = {...D, ...f3DepthGeometry(D, m)}; } catch(e){ console.warn("profondità:", e); depth = {err:String(e?.message || e)}; }
      const alts = [depth?.quad || null, box && box.conf >= .35 ? box : null, poly && poly.conf >= .6 ? poly : null].filter(Boolean);
      Object.assign(job, {state:"ok", m, quad:alts[0] || null, alts, box, depth, dets, labels:segs.map(x => x.label)});
    } catch(e){ console.warn("segmentazione:", e); if (F3.seg === job) Object.assign(job, {state:"err", err:String(e?.message || e)}); }
    if (F3.seg === job && F3.a) { f3ApplySeg(); if (F3.open) f3RenderModal(); }
  })();
  return job.promise;
}
/* ---------- geometria metrica nel dispositivo (MoGe-2 ViT-S, Microsoft, MIT; shared/photo-depth.js) ----------
   Una rete stima per ogni pixel il punto 3D in metri: pavimento, pareti, soffitto, altezza della fotocamera e
   posizione degli arredi senza misure dell'utente. Modello ONNX (~70 MB in fp16) servito dal sito in parti da 20 MB,
   eseguito con onnxruntime-web (WebGPU se c'è, altrimenti WebAssembly); scaricato una volta e conservato in cache. */
const F3_ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const F3_DEPTH = {base:"modelli/moge2-vits-560x420-fp16.onnx", parts:4, w:560, h:420};
let f3DepthSes = null;
async function f3DepthModel(){
  const urls = Array.from({length:F3_DEPTH.parts}, (_, i) => `${F3_DEPTH.base}.part${i}`), bufs = [];
  let cache = null; try { cache = await caches.open("pl-modelli-v1"); } catch(e){}
  for (const u of urls){ let r = cache && await cache.match(u).catch(() => null);
    if (!r){ r = await fetch(u); if (!r.ok) throw new Error("modello di profondità non disponibile (" + r.status + ")"); try { await cache?.put(u, r.clone()); } catch(e){} }
    bufs.push(new Uint8Array(await r.arrayBuffer())); }
  const all = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0)); let o = 0; for (const b of bufs){ all.set(b, o); o += b.length; } return all;
}
async function f3DepthRun(url){
  if (!f3DepthSes){ const ort = await import(F3_ORT + "ort.webgpu.min.mjs"); ort.env.wasm.wasmPaths = F3_ORT;
    const model = await f3DepthModel(), eps = navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
    try { f3DepthSes = await ort.InferenceSession.create(model, {executionProviders:eps}); } catch(e){ f3DepthSes = await ort.InferenceSession.create(model, {executionProviders:["wasm"]}); }
    f3DepthSes.ort = ort; }
  const img = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error("foto non leggibile")); im.src = url; });
  const iw = img.naturalWidth, ih = img.naturalHeight, rot = ih > iw, MW = F3_DEPTH.w, MH = F3_DEPTH.h;
  // le foto verticali si ruotano di 90° (il modello è a 4:3 orizzontale); bande grigie per mantenere le proporzioni
  const sw = rot ? ih : iw, sh = rot ? iw : ih, k = Math.min(MW / sw, MH / sh), cw = sw * k, ch = sh * k, ox = (MW - cw) / 2, oy = (MH - ch) / 2;
  const cv = document.createElement("canvas"); cv.width = MW; cv.height = MH; const g = cv.getContext("2d", {willReadFrequently:true}); g.fillStyle = "#808080"; g.fillRect(0, 0, MW, MH);
  g.save(); g.translate(ox, oy); if (rot){ g.translate(0, ch); g.rotate(-Math.PI / 2); g.drawImage(img, 0, 0, ch, cw); } else g.drawImage(img, 0, 0, cw, ch); g.restore();
  const px = g.getImageData(0, 0, MW, MH).data, x = new Float32Array(3 * MW * MH);
  for (let i = 0; i < MW * MH; i++) for (let c = 0; c < 3; c++) x[c * MW * MH + i] = px[i * 4 + c] / 255;
  const ort = f3DepthSes.ort, out = await f3DepthSes.run({image:new ort.Tensor("float32", x, [1, 3, MH, MW])});
  const Pm = Float32Array.from(out.points.data), Nm = out.normal.data, Mm = Float32Array.from(out.mask.data);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) if (i < ox || i >= ox + cw || j < oy || j >= oy + ch) Mm[j * MW + i] = 0;    // bande
  const cam = dpRecover(Pm, Mm, MW, MH, out.metric_scale.data[0]); if (!cam) throw new Error("profondità non ricostruita");
  // griglia della foto originale (lato lungo 192 punti): punti e normali riportati nel riferimento della foto
  const w2 = iw >= ih ? 192 : Math.round(192 * iw / ih), h2 = iw >= ih ? Math.round(192 * ih / iw) : 192, P = new Float32Array(w2 * h2 * 3), N = new Float32Array(w2 * h2 * 3), M = new Float32Array(w2 * h2);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++){
    const u = (i + .5) / w2, v = (j + .5) / h2, su = rot ? v : u, sv = rot ? 1 - u : v;      // nella foto ruotata
    const mi = Math.min(MW - 1, Math.floor(ox + su * cw)), mj = Math.min(MH - 1, Math.floor(oy + sv * ch)), q = mj * MW + mi, k2 = j * w2 + i;
    const a = [Pm[3 * q], Pm[3 * q + 1], Pm[3 * q + 2]], b = [Nm[3 * q], Nm[3 * q + 1], Nm[3 * q + 2]];
    // ruotata di 90° in senso antiorario: x = −y', y = x'
    P.set(rot ? [-a[1], a[0], a[2]] : a, 3 * k2); N.set(rot ? [-b[1], b[0], b[2]] : b, 3 * k2); M[k2] = Mm[q];
  }
  const fxS = cam.fx * MW / cw, fyS = cam.fy * MH / ch, fx = rot ? fyS : fxS, fy = rot ? fxS : fyS;
  return {P, N, M, w:w2, h:h2, fx, fy, hfov:2 * Math.atan(.5 / fx) * 180 / Math.PI};
}
/* dalla profondità: verso l'alto, altezza della fotocamera, stanza a scatola e spigoli della parete di fondo */
function f3DepthGeometry(D, m){
  const ids = {floor:idsOf(m, "@floor"), ceiling:idsOf(m, "@ceiling"), wall:idsOf(m, "@wall")};
  const G = dpGravity(D.P, D.M, D.w, D.h, m, ids); if (!G || !G.h) return {G};
  const R = dpRoom(D.P, D.N, D.M, D.w, D.h, m, ids, G); if (!R) return {G};
  const q = dpQuad(G, R, {fx:D.fx, fy:D.fy}, D.w / D.h); if (!q) return {G, R};
  return {G, R, quad:{...q, source:"profondità", conf:1}};
}
/* applica la segmentazione all'analisi: spigoli (se l'utente non li ha già spostati) e riquadri */
function f3ApplySeg(){
  const sg = F3.seg; if (!sg || sg.state !== "ok" || !F3.a || sg.applied) return; sg.applied = true;
  // prima proposta che dà una geometria possibile (spigoli alti sopra l'orizzonte, fotocamera davanti alla parete)
  if (sg.alts?.length && F3.quadSource !== "posizionati da te"){
    const keep = F3.quad, keepO = {...F3.opts}, dq = sg.depth?.quad;
    sg.quad = sg.alts.find(q => { F3.quad = {fl:q.fl, fr:q.fr, cl:q.cl, cr:q.cr}; F3.quadOpen = q === sg.box || q === dq ? {l:q.openL, r:q.openR} : null;
      if (q === dq){ F3.opts.pitch = sg.depth.G.pitch; F3.opts.ceil = q.ceiling; if (!F3.opts.userRef){ F3.opts.refKind = "cam"; F3.opts.refVal = +sg.depth.G.h.toFixed(2); } }
      const ok = f3Solve().ok; if (!ok){ Object.assign(F3.opts, keepO); F3.opts.pitch = keepO.pitch ?? null; } return ok; }) || null; F3.quad = keep;
  }
  if (sg.quad && F3.quadSource !== "posizionati da te"){
    const dq = sg.depth?.quad;
    F3.quad = {fl:sg.quad.fl, fr:sg.quad.fr, cl:sg.quad.cl, cr:sg.quad.cr}; F3.quadOpen = sg.quad === sg.box || sg.quad === dq ? {l:sg.quad.openL, r:sg.quad.openR} : null;
    F3.quadSource = sg.quad === dq ? "misurati dalla profondità: controllali" : sg.quad === sg.box ? "trovati dal modello di stanza: controllali" : "trovati dalla segmentazione: controllali"; F3.opts.ceil = sg.quad.ceiling;
    if (sg.quad === dq){ F3.opts.pitch = sg.depth.G.pitch; if (!F3.exifFov && !F3.opts.fov) F3.fitFov = +sg.depth.hfov.toFixed(1); if (!F3.opts.userRef){ F3.opts.refKind = "cam"; F3.opts.refVal = +sg.depth.G.h.toFixed(2); } }
    if (sg.box && sg.quad === sg.box && !F3.exifFov && !F3.opts.fov) F3.fitFov = sg.box.hfov;       // campo visivo stimato dalla prospettiva
  }
  // rilevamenti nel dispositivo: un oggetto per riquadro; precisano o aggiungono quelli del modello linguistico
  const iouB = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
  for (const d of (sg.dets || []).sort((a, b) => b.score - a.score)){
    const same = F3.items.find(it => FAMILY(it.category) === FAMILY(d.category) && iouB(it.box, d.box) > .5);
    if (same){ if (!String(same.source).includes("rilevatore")){ same.box = d.box; same.source = "rilevatore"; } continue; }
    F3.items.push({category:d.category, label:"", box:d.box, facing:"camera", against:"none", source:"rilevatore", score:d.score});
  }
  const comps = segComponents(sg.m, F3.a.room_type || "");
  F3.items = mergeSegmentation(F3.items, comps, F3.quad).map((it, i) => ({...it, id:i, on: it.on !== false && !it.doubt && !F3_CATS[it.category]?.skip && it.category !== "persona" /* le persone non fanno parte della stanza: in elenco, spente */, label: it.label || F3_CATS[it.category]?.n || ""}));
  const dg = sg.depth?.G;
  F3.segNote = (sg.quad && sg.quad === sg.depth?.quad ? `Profondità: fotocamera a ${fmt(dg.h, 2)} m, inclinazione ${fmt(dg.pitch, 1)}°, misure dalla foto senza riferimenti. ` : "") + `Segmentazione: ${comps.filter(c => /porta|finestra/.test(c.category)).length} aperture e ${comps.filter(c => !/porta|finestra/.test(c.category)).length} arredi trovati nella foto${sg.quad ? "; spigoli proposti" : ""}.`;
}
function f3Accept(j){
  const a = j.analysis; F3.a = a; F3.meta = {model:j.model, detect:j.detect_model, mock:!!j.mock, ms:j.duration_ms, neurons:j.neurons_measured ?? j.neurons_estimated, remaining:j.remaining_today};
  const bw = a.back_wall;
  F3.quad = bw ? {fl:bw.fl.slice(), fr:bw.fr.slice(), cl:bw.cl.slice(), cr:bw.cr.slice()} : {fl:[.2, .78], fr:[.8, .78], cl:[.2, .16], cr:[.8, .16]};
  F3.quadSource = bw ? "proposti dall'AI" : "da posizionare";
  F3.opts.ceil = bw ? bw.ceiling_visible !== false : true;
  F3.opts.refVal = a.room?.height_m && a.room.height_m > 2.2 && a.room.height_m < 4.5 ? +a.room.height_m.toFixed(2) : 2.7;
  F3.items = (a.items || []).map((it, i) => ({...it, id:i, on:!F3_CATS[it.category]?.skip}));
  F3.sel = -1; F3.report = null; F3.segNote = ""; F3.quadOpen = null;
  if (F3.seg?.state === "ok"){ F3.seg.applied = false; f3ApplySeg(); }
}

/* ---------- geometria ---------- */
const f3Rad = d => d * Math.PI / 180;
/* campo visivo orizzontale: scelto dall'utente, dall'EXIF, stimato dalla prospettiva, dal modello; altrimenti quello
   tipico della fotocamera principale di un telefono (26 mm equivalenti: ~69° in orizzontale, ~50° in verticale) */
function f3Fov(){ return F3.opts.fov || F3.exifFov || F3.fitFov || (F3.w && F3.h > F3.w ? 50 : F3.a?.camera?.hfov_deg || 69); }
/* raggio della fotocamera per un punto della foto (u,v ∈ 0..1): X destra, Y su, la fotocamera guarda verso −Z */
function f3Dir(u, v, cam){
  const x = u - .5, y = -(v - .5) * cam.r, cp = Math.cos(cam.p), sp = Math.sin(cam.p);
  return [x, y * cp + cam.f * sp, y * sp - cam.f * cp];
}
/* calibrazione dagli spigoli della parete di fondo: inclinazione, altezza della fotocamera, scala, sistema della pianta */
function f3Solve(quad = F3.quad, opts = F3.opts, w = F3.w, h = F3.h, a = F3.a){
  if (!quad || !w) return {ok:false, err:"manca la foto"};
  const cam0 = {f:.5 / Math.tan(f3Rad(f3Fov()) / 2), r:h / w, p:0};
  const floorAt = (pt, cam) => { const d = f3Dir(pt[0], pt[1], cam); if (d[1] >= -1e-6) return null; const t = -1 / d[1]; return [t * d[0], t * d[2]]; };
  const ceilErr = (cpt, A, cam) => { const d = f3Dir(cpt[0], cpt[1], cam); let e = Math.atan2(d[0], -d[2]) - Math.atan2(A[0], -A[1]); while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return e * e; };
  const ceilH = (cpt, A, cam) => { const d = f3Dir(cpt[0], cpt[1], cam), hd = Math.hypot(d[0], d[2]); return 1 + Math.hypot(A[0], A[1]) / hd * d[1]; };
  let p = f3Rad(clamp(a?.camera?.pitch_deg || 0, -30, 30));
  const useCeil = opts.ceil && quad.cl && quad.cr;
  if (opts.pitch != null) p = f3Rad(opts.pitch);         // inclinazione misurata dalla profondità (piano del pavimento)
  else if (useCeil){   // inclinazione: le verticali della parete devono risultare verticali
    const cost = pp => { const cam = {...cam0, p:pp}, A = floorAt(quad.fl, cam), B = floorAt(quad.fr, cam); return A && B ? ceilErr(quad.cl, A, cam) + ceilErr(quad.cr, B, cam) : Infinity; };
    let best = Infinity; for (let d = -35; d <= 35; d += .5){ const c = cost(f3Rad(d)); if (c < best){ best = c; p = f3Rad(d); } }
    for (let step = f3Rad(.25); step > 1e-4; step /= 2) for (const s of [-1, 1]){ const c = cost(p + s * step); if (c < best){ best = c; p += s * step; } }
  }
  const cam = {...cam0, p}, A1 = floorAt(quad.fl, cam), B1 = floorAt(quad.fr, cam);
  if (!A1 || !B1) return {ok:false, err:"gli spigoli in basso devono stare sotto l'orizzonte: abbassali sul pavimento"};
  const W1 = Math.hypot(B1[0] - A1[0], B1[1] - A1[1]); if (W1 < 1e-3) return {ok:false, err:"spigoli troppo vicini"};
  const H1 = useCeil ? (ceilH(quad.cl, A1, cam) + ceilH(quad.cr, B1, cam)) / 2 : null;
  if (useCeil && !(H1 > 1.05)) return {ok:false, err:"gli spigoli in alto devono stare sopra la fotocamera: alzali sul soffitto"};
  let hc, H; const ref = Math.max(.1, +opts.refVal || 0);
  if (opts.refKind === "width"){ hc = ref / W1; H = useCeil ? H1 * hc : (a?.room?.height_m || 2.7); }
  else if (opts.refKind === "cam"){ hc = ref; H = useCeil ? H1 * hc : (a?.room?.height_m || 2.7); }
  else if (useCeil){ hc = ref / H1; H = ref; }
  else { hc = clamp(a?.camera?.height_m || 1.5, .5, 2.5); H = ref; }
  const A = [A1[0] * hc, A1[1] * hc], B = [B1[0] * hc, B1[1] * hc], W = W1 * hc;
  const e = [(B[0] - A[0]) / W, (B[1] - A[1]) / W]; let n = [-e[1], e[0]];
  if ((-A[0]) * n[0] + (-A[1]) * n[1] < 0) n = [-n[0], -n[1]];          // la normale guarda verso la fotocamera
  const toPlanV = v => [v[0] * e[0] + v[1] * e[1], v[0] * n[0] + v[1] * n[1]];
  const c = toPlanV([-A[0], -A[1]]);
  if (c[1] < .3) return {ok:false, err:"la fotocamera risulta dietro la parete di fondo: controlla gli spigoli"};
  const D = Math.max(+(opts.depth || 0), c[1] + .4, 1.5);
  // spigolo della parete di fondo fuori dalla foto: la larghezza vista è un minimo; si completa con la stima del
  // modello (o 0,6 m) mantenendo fermo lo spigolo visibile, così aperture e arredi restano alla distanza giusta
  const outL = !!F3.quadOpen?.l, outR = !!F3.quadOpen?.r;
  let shift = 0, Wv = W;
  if ((outL || outR) && !opts.widthFixed){ const est = Math.max(W + .6, +(a?.room?.width_m || 0)); const extra = Math.min(est - W, 1.2);
    if (outL && !outR){ shift = extra; Wv = W + extra; } else if (outR && !outL) Wv = W + extra; else { shift = extra / 2; Wv = W + extra; } }
  const ray = (u, v) => { const d = f3Dir(u, v, cam), hp = toPlanV([d[0], d[2]]); return [hp[0], hp[1], d[1]]; };
  return {ok:true, cam, p, hc, H, W:Wv, Wseen:W, D, depthAuto:+(c[1] + .4).toFixed(2), c:[c[0] + shift, c[1]], ray, right:toPlanV([1, 0]), useCeil, partial:outL || outR};
}
/* intersezioni in pianta: x lungo la parete di fondo, y verso la fotocamera, quota da terra */
const f3Floor = (s, u, v) => { const d = s.ray(u, v); if (d[2] >= -1e-6) return null; const t = -s.hc / d[2]; return [s.c[0] + t * d[0], s.c[1] + t * d[1]]; };
const f3Ceil = (s, u, v) => { const d = s.ray(u, v); if (d[2] <= 1e-6) return null; const t = (s.H - s.hc) / d[2]; return [s.c[0] + t * d[0], s.c[1] + t * d[1]]; };
function f3OnWall(s, wall, u, v){
  const d = s.ray(u, v), k = wall === "back" ? 0 : wall === "left" ? 0 : s.W;
  const t = wall === "back" ? (0 - s.c[1]) / d[1] : (k - s.c[0]) / d[0];
  if (!(t > 0) || !isFinite(t)) return null;
  const x = s.c[0] + t * d[0], y = s.c[1] + t * d[1], z = s.hc + t * d[2];
  return {x, y, z, s: wall === "back" ? x : wall === "right" ? y : s.D - y};
}
function f3WallAt(s, u, v){
  const tol = .35; let best = null;
  for (const wall of ["back", "left", "right"]){
    const p = f3OnWall(s, wall, u, v); if (!p) continue;
    const inside = wall === "back" ? p.x > -tol && p.x < s.W + tol : p.y > -tol && p.y < s.D + tol;
    if (!inside || p.z < -.3 || p.z > s.H + .3) continue;
    const dist = Math.hypot(p.x - s.c[0], p.y - s.c[1]); if (!best || dist < best.dist) best = {wall, dist, ...p};
  }
  return best || {wall:"back", ...f3OnWall(s, "back", u, v)};
}
const f3Ang = f => { let t = Math.atan2(-f[0], f[1]) * 180 / Math.PI; return ((t % 360) + 360) % 360; };
/* posizione di un arredo dai punti 3D della profondità (pixel del riquadro con le etichette della sua famiglia);
   riportata nella pianta dell'editor con la sua scala (altezza della fotocamera) */
function f3Obj3d(s, it, cat){
  const sg = F3.seg, D = sg?.depth, G = D?.G; if (!G?.h || !sg.m || !D.P) return null;
  const m = sg.m, fam = FAMILY(cat), struct = c => c && c[0] === "@";
  let ids = new Set(m.names.map((n, i) => { const c = SEG_CAT[n]; return c && !struct(c) && FAMILY(c) === fam ? i : -1; }).filter(i => i >= 0));
  if (!ids.size) ids = new Set(m.names.map((n, i) => { const c = SEG_CAT[n]; return !struct(c) && !OPEN.includes(c) && !OUTSIDE.has(n) ? i : -1; }).filter(i => i >= 0));
  const o = dpObject(D.P, D.M, D.w, D.h, m, ids, it.box, G); if (!o || o.n < 15) return null;
  const k = s.hc / G.h, f0 = s.ray(.5, .5), fl = Math.hypot(f0[0], f0[1]) || 1, fw = [f0[0] / fl, f0[1] / fl], rl = Math.hypot(s.right[0], s.right[1]) || 1, rt = [s.right[0] / rl, s.right[1] / rl];
  const at = (r, f) => [s.c[0] + k * (r * rt[0] + f * fw[0]), s.c[1] + k * (r * rt[1] + f * fw[1])];
  return {front:at((o.rmin + o.rmax) / 2, o.fmin), center:at(o.r, o.f), wid:(o.rmax - o.rmin) * k, hTop:o.zmax * k, zmin:o.zmin * k};
}
/* posizioni in pianta di aperture e oggetti (dati puri: servono all'anteprima e alla creazione) */
function f3Layout(s, items = F3.items){
  const out = {openings:[], objects:[], skipped:[]}, hasBed = items.some(i => i.on && /^letto/.test(i.category));
  for (const it of items){
    if (!it.on) continue; let C = F3_CATS[it.category] || F3_CATS.altro, cat = it.category; if (C.skip){ out.skipped.push(it); continue; }
    const [x0, y0, x1, y1] = it.box, uc = (x0 + x1) / 2, vc = (y0 + y1) / 2;
    if (C.kind === "door" || C.kind === "window"){
      const hit = f3WallAt(s, uc, vc), L = f3OnWall(s, hit.wall, x0, vc), R = f3OnWall(s, hit.wall, x1, vc), T = f3OnWall(s, hit.wall, uc, y0), Bt = f3OnWall(s, hit.wall, uc, y1);
      if (!L || !R || !T) { out.skipped.push(it); continue; }
      const len = hit.wall === "back" ? s.W : s.D, w = clamp(Math.abs(R.s - L.s), C.kind === "door" ? .6 : .4, Math.min(len - .1, 4)), t = clamp((L.s + R.s) / 2, w / 2 + .05, len - w / 2 - .05);
      let sill = C.kind === "door" ? 0 : clamp(Bt ? Bt.z : .9, 0, 1.6), top = clamp(T.z, sill + .4, s.H - .05);
      if (C.kind === "door") top = clamp(top, 1.9, Math.min(s.H - .05, 2.8));
      // davanzale coperto da un arredo (testiera, divano): quota consueta di 90 cm se la parte vista finisce più in alto
      else if (it.occBelow && sill > 1 && top - .9 >= .6) sill = .9;
      out.openings.push({it, wall:hit.wall, t, w, h:+(top - sill).toFixed(2), sill:+sill.toFixed(2), type:C.kind, style:C.style});
      continue;
    }
    let p, rot = 0, scale = 1, z = null, o3v = null;
    const hv = (() => { const d = s.ray(uc, vc), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; })(), rl = Math.hypot(s.right[0], s.right[1]) || 1, cr = [s.right[0] / rl, s.right[1] / rl];
    if (C.mount === "ceiling"){
      // il bordo alto della lampada spesso è il paralume, non il soffitto: si usa il fondo, appeso circa 75 cm sotto il soffitto
      // attacco al soffitto se il riquadro lo comprende; altrimenti distanza dalla larghezza apparente del paralume
      // (misura tipica) o, in mancanza, il fondo appeso 75 cm sotto il soffitto
      const da = s.ray(x0, y1), db = s.ray(x1, y1), na = Math.hypot(...da), nb = Math.hypot(...db), cosA = (da[0] * db[0] + da[1] * db[1] + da[2] * db[2]) / (na * nb), ang = Math.acos(clamp(cosA, -1, 1));
      const zB = clamp(s.H - .75, 1.8, s.H - .3), d = s.ray(uc, y1), hl = Math.hypot(d[0], d[1]) || 1;
      const pc = f3Ceil(s, uc, y0), inRoom = pc && pc[0] > 0 && pc[0] < s.W && pc[1] > .05 && pc[1] < s.D;
      const o3 = f3Obj3d(s, it, cat);
      if (o3) p = o3.center;                // punti 3D della lampada
      else if (inRoom) p = pc;              // il riquadro arriva al punto di attacco: vale quello
      else if (ang > .01 && cat === "lampadario"){ const dist = clamp((C.w || .44) / (2 * Math.tan(ang / 2)), .5, 15); p = [s.c[0] + d[0] / hl * dist, s.c[1] + d[1] / hl * dist]; }
      else { const t = Math.abs(d[2]) > 1e-4 ? (zB - s.hc) / d[2] : -1; p = t > 0 ? [s.c[0] + t * d[0], s.c[1] + t * d[1]] : (f3Ceil(s, uc, y0) || f3Floor(s, uc, y1)); } }
    else if (C.mount === "wall"){ const hit = f3WallAt(s, uc, vc); const inN = {back:[0, 1], left:[1, 0], right:[-1, 0]}[hit.wall]; p = [hit.x + inN[0] * .08, hit.y + inN[1] * .08]; rot = f3Ang(inN); z = clamp(hit.z - .1, .5, s.H - .2); }
    else {
      // con la profondità: fronte dell'oggetto dai suoi punti 3D; altrimenti appoggio della base sul pavimento
      const o3 = f3Obj3d(s, it, cat); o3v = o3?.center;
      // piani orizzontali visti dall'alto (letti, tavoli): la mediana dei punti visti è già il centro
      const topSeen = o3 && /^(letto|tavol|scrivania|isola)/.test(cat);
      p = o3 ? (topSeen ? o3.center : o3.front) : f3Floor(s, uc, y1);
      // base tagliata dal bordo della foto (oggetto vicino alla fotocamera): si usa il bordo alto del piano, a quota nota
      const topH = F3_TOP[cat]; let cut = false;
      if (topH && y1 > .97 && !o3){ cut = true; const d = s.ray(uc, y0); if (d[2] < -1e-4 && s.hc > topH){ const t = (topH - s.hc) / d[2], far = [s.c[0] + t * d[0], s.c[1] + t * d[1]], hl = Math.hypot(d[0], d[1]) || 1; const dep = (C.d || .6);
        p = [far[0] - d[0] / hl * dep, far[1] - d[1] / hl * dep]; } }
      if (!p){ out.skipped.push(it); continue; }
      // misure reali dalla foto: larghezza alla base e altezza della sommità alla distanza dell'oggetto
      const dist = Math.hypot(p[0] - s.c[0], p[1] - s.c[1]), rt = s.ray(uc, y0), hTop = o3 ? o3.hTop : s.hc + dist / (Math.hypot(rt[0], rt[1]) || 1) * rt[2];
      // larghezza alla base o, se la base è fuori dalla foto, al bordo alto (quota tipica dello schienale o del piano)
      const atZ = (u, v, zz) => { const d = s.ray(u, v); if (Math.abs(d[2]) < 1e-4) return null; const t = (zz - s.hc) / d[2]; return t > 0 ? [s.c[0] + t * d[0], s.c[1] + t * d[1]] : null; };
      const pa0 = cut ? atZ(x0, y0, topH) : f3Floor(s, x0, y1), pb0 = cut ? atZ(x1, y0, topH) : f3Floor(s, x1, y1), wid = o3 ? o3.wid : pa0 && pb0 ? Math.hypot(pb0[0] - pa0[0], pb0[1] - pa0[1]) : null;
      // categoria corretta dalle misure (se l'utente non l'ha scelta): divano/poltrona, tavolo/tavolino, letto
      if (!it.userCat && wid){
        const sw = {divano:wid < 1.2 ? "poltrona" : null, poltrona:wid > 1.45 ? "divano" : null, tavolo:hTop < .56 ? "tavolino" : null, tavolino:hTop > .66 ? "tavolo" : null, tavolo_tondo:hTop < .56 ? "tavolino_tondo" : null,
          letto_matrimoniale:wid < 1.25 ? "letto_singolo" : null, letto_singolo:wid > 1.45 ? "letto_matrimoniale" : null}[cat]
          // piccolo piano basso in una camera: comodino
          || (hasBed && /^(tavol|madia|cassettiera)/.test(cat) && wid < .7 && hTop < .75 ? "comodino" : null);
        if (sw && F3_CATS[sw]){ cat = sw; C = F3_CATS[sw]; }
      }
      const face = {camera:[-hv[0], -hv[1]], away:hv, left:[-cr[0], -cr[1]], right:cr}[it.facing] || [-hv[0], -hv[1]];
      const pa = f3Floor(s, x0, y1), pb = f3Floor(s, x1, y1), span = o3 ? o3.wid : pa && pb ? Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) : null;
      const along = Math.abs(face[0] * hv[0] + face[1] * hv[1]) > .7, vis = along ? C.w : C.d, deep = along ? C.d : C.w;
      if (span && !C.keep && !cut) scale = clamp(span / vis, C.flat ? .6 : .75, C.flat ? 1.6 : 1.35);
      if (!topSeen) p = [p[0] + hv[0] * deep * scale / 2, p[1] + hv[1] * deep * scale / 2];
      rot = Math.round(f3Ang(face) / 15) * 15 % 360;
      const dd = C.d * scale / 2 + .02;
      let ag = it.against;
      // arredi da parete vicini a un muro (schienale entro 40 cm): appoggiati e rivolti verso la stanza
      if ((!ag || ag === "none") && F3_WALLISH.has(cat)){ const gap = {back:p[1] - dd, left:p[0] - dd, right:s.W - p[0] - dd}, k = Object.entries(gap).sort((a, b) => a[1] - b[1])[0];
        // il letto visto dai piedi ha la testiera contro la parete di fondo anche se la base è coperta o fuori dalla foto
        if (/^letto/.test(cat) && (it.facing || "camera") === "camera" && gap.back < 1.5) ag = "back"; else if (k[1] < .4) ag = k[0]; }
      if (ag === "back"){ p[1] = dd; rot = 0; } else if (ag === "left"){ p[0] = dd; rot = 270; } else if (ag === "right"){ p[0] = s.W - dd; rot = 90; }
    }
    if (!p) { out.skipped.push(it); continue; }
    p = [clamp(p[0], .1, s.W - .1), clamp(p[1], .1, s.D - .1)];
    const ref = C.ref === "sagoma_uomo" && /donna|ragazza|bambina|signora|woman|girl/i.test(it.label || "") ? "sagoma_donna" : C.ref;
    out.objects.push({it, cat, ref, x:p[0], y:p[1], rot, scale:+scale.toFixed(2), z, light:C.light, vis:o3v || null});
  }
  // stesso arredo grande riconosciuto due volte (letto spezzato in due riquadri): in pianta i centri quasi coincidono
  const famOf = c => c.replace(/_.*/, ""), BIG3 = /^(letto|divano|tavolo|armadio|madia|libreria|cucina)/;
  for (let i = 0; i < out.objects.length; i++) for (let j = i + 1; j < out.objects.length; j++){
    const A = out.objects[i], B = out.objects[j]; if (A.dup || B.dup || !BIG3.test(A.cat) || famOf(A.cat) !== famOf(B.cat)) continue;
    const CA = F3_CATS[A.cat] || {}, lim = Math.max(CA.w || 1, CA.d || 1) * .5;
    if (Math.hypot(A.x - B.x, A.y - B.y) < lim){ const ar = o => (o.it.box[2] - o.it.box[0]) * (o.it.box[3] - o.it.box[1]) + (o.it.seg ? 1 : 0); (ar(A) >= ar(B) ? B : A).dup = true; } }
  out.objects = out.objects.filter(o => !o.dup);
  // aperture sovrapposte sullo stesso muro: la più affidabile resta, l'altra si sposta nello spazio libero
  // più vicino o, se non c'è posto, non viene creata (accade con due riconoscimenti dello stesso vano)
  const rank = o => (o.it.seg ? 2 : 0) + (o.it.source === "rilevatore" ? 1 : 0) + (o.it.added ? 0 : .5);
  for (const wall of ["back", "left", "right"]){
    const len = wall === "back" ? s.W : s.D, kept = [];
    for (const o of out.openings.filter(o => o.wall === wall).sort((a, b) => rank(b) - rank(a))){
      const hits = k => kept.some(q => Math.abs(q.t - k) < (q.w + o.w) / 2 + .1);
      if (hits(o.t)){
        let t2 = null; for (let d = .05; d < len; d += .05) for (const k of [o.t - d, o.t + d]) if (t2 == null && k > o.w / 2 + .05 && k < len - o.w / 2 - .05 && !hits(k)) t2 = k;
        if (t2 == null || Math.abs(t2 - o.t) > o.w * .75){ out.openings.splice(out.openings.indexOf(o), 1); out.skipped.push(o.it); continue; }
        o.t = t2; o.moved = true;
      }
      kept.push(o);
    }
  }
  return out;
}

/* ---------- creazione nel progetto ---------- */
function f3Build(){
  const s = f3Solve(); if (!s.ok){ toast(s.err, true); return; }
  const lay = f3Layout(s), L = level(), d = S.defaults, t = d.wallThick, a = F3.a || {};
  const others = wallsOf(L.id); const ox = others.length ? Math.max(...others.flatMap(w => [w.a[0], w.b[0]])) + 3 + t : 0, oy = others.length ? Math.min(...others.flatMap(w => [w.a[1], w.b[1]])) : 0;
  const P2 = ([x, y]) => [+(x + ox).toFixed(3), +(y + oy).toFixed(3)], W = s.W, D = s.D, H = +s.H.toFixed(2);
  // materiali: colore delle pareti dalla foto, pavimento dal tipo riconosciuto
  let wallMat = d.wallMat;
  if (a.materials?.wall_color){ const k = "foto_pareti_" + uid(); P.materials[k] = {nome:"Pareti (dalla foto)", color:a.materials.wall_color, rough:.92, size:1}; wallMat = k; }
  const floorMat = F3_FLOOR[a.materials?.floor] || d.roomMat;
  if (!others.length && P.rooms.filter(r => r.level === L.id).length === 0) L.height = H;
  const wh = Math.abs(L.height - H) > .01 ? H : null, ty = wallTypeProps(d);
  const mk = (A, B) => { const w = {id:uid(), level:L.id, a:P2(A), b:P2(B), thick:t, height:wh, mat:wallMat, ...ty}; P.walls.push(w); return w; };
  const h2 = t / 2, walls = {back:mk([-h2, -h2], [W + h2, -h2]), right:mk([W + h2, -h2], [W + h2, D + h2]), front:mk([W + h2, D + h2], [-h2, D + h2]), left:mk([-h2, D + h2], [-h2, -h2])};
  const room = {id:uid(), level:L.id, name:(a.room_type || "Locale").replace(/^./, c => c.toUpperCase()).slice(0, 40), mat:floorMat, pts:[P2([0, 0]), P2([W, 0]), P2([W, D]), P2([0, D])]};
  if (a.materials?.ceiling_color && !/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(a.materials.ceiling_color)){ const k = "foto_soffitto_" + uid(); P.materials[k] = {nome:"Soffitto (dalla foto)", color:a.materials.ceiling_color, rough:.95, size:1}; room.ceilMat = k; }
  P.rooms.push(room);
  for (const o of lay.openings){
    const w = walls[o.wall], sAxis = o.wall === "back" ? o.t + h2 : o.wall === "right" ? o.t + h2 : o.t + h2;
    const op = {id:uid(), wall:w.id, t:+sAxis.toFixed(3), w:+o.w.toFixed(2), h:o.h, sill:o.sill, type:o.type, flip:0};
    if (o.style) op.style = o.style; P.openings.push(op);
  }
  const lampsOn = !!a.lighting?.lamps_on, kelvin = a.lighting?.kelvin;
  for (const o of lay.objects){
    const it = LIBMAP[o.ref]; if (!it) continue;
    const ob = {id:uid(), level:L.id, kind:"lib", ref:o.ref, name:it.nome, x:P2([o.x, o.y])[0], y:P2([o.x, o.y])[1], rot:o.rot, scale:o.scale, z:0};
    initPlacedObject(ob, it); if (o.z != null) ob.z = +o.z.toFixed(2);
    if (o.light && (lampsOn || kelvin)) ob.light = {on:lampsOn || a.lighting?.time !== "day", ...(kelvin ? {k:Math.round(kelvin / 100) * 100} : {})};
    if (it.load && !TPL[o.ref]) loadTpl(o.ref);
    P.objects.push(ob);
  }
  if (lampsOn && a.lighting?.time !== "day") P.lightsMode = "on";
  // camera «Vista della foto»: stessa posizione, direzione e campo visivo (verticale) della fotocamera
  const look = s.ray(.5, .5), lh = Math.hypot(look[0], look[1]) || 1, cp = P2(s.c), vf = 2 * Math.atan(Math.tan(f3Rad(f3Fov()) / 2) * F3.h / F3.w) * 180 / Math.PI;
  const camEntry = {id:uid(), name:"Vista della foto", pos:[cp[0], +(L.elev + s.hc).toFixed(3), cp[1]], target:[+(cp[0] + look[0] / lh * 4).toFixed(3), +(L.elev + s.hc + Math.tan(s.p) * 4).toFixed(3), +(cp[1] + look[1] / lh * 4).toFixed(3)], fov:+vf.toFixed(1), photo:F3.thumb};
  P.cameras = P.cameras || []; P.cameras.push(camEntry);
  setSel([{type:"room", id:room.id}]); commit(); fitPlan(); renderCamSel?.(camEntry.id); goCamera(camEntry.id);
  const nD = lay.openings.filter(o => o.type === "door").length, nF = lay.openings.length - nD;
  F3.report = {title:`Creati la stanza ${fmt(W, 2)} × ${fmt(D, 2)} m (h ${fmt(H, 2)} m), ${nD} port${nD === 1 ? "a" : "e"}, ${nF} finestr${nF === 1 ? "a" : "e"} e ${lay.objects.length} oggett${lay.objects.length === 1 ? "o" : "i"}`,
    lines:[`Fotocamera a ${fmt(s.hc, 2)} m da terra, inclinata di ${fmt(s.p * 180 / Math.PI, 1)}°, campo visivo ${fmt(f3Fov(), 0)}°.`,
      lay.skipped.length ? `Non creati: ${lay.skipped.map(i => i.label || F3_CATS[i.category]?.n).slice(0, 6).join(", ")}${lay.skipped.length > 6 ? "…" : ""}.` : "",
      "Il muro alle spalle della fotocamera non si vede nella foto: la profondità è stimata.",
      "In 3D è attiva la camera «Vista della foto»: confronta con la foto e usala per il render AI."].filter(Boolean)};
  toast(F3.report.title); F3.err = ""; f3CloseModal();
  if ($("#views")?.dataset.mode === "2d") $('#viewSeg [data-v="3d"]')?.click();
}

/* ---------- interfaccia ---------- */
function f3PanelHTML(){
  const c = F3.cfg, ph = c?.photo, owner = !!c?.quota?.owner;
  const avail = c ? (ph?.enabled ? "" : c.photo ? "L'analisi da foto è sospesa su questo server." : "Questo server non offre l'analisi da foto (serve il backend Cloudflare del progetto).") : F3.cfgErr ? "Servizio non raggiungibile: l'analisi da foto non è disponibile ora." : "";
  const quota = ph?.enabled ? owner ? "Proprietario: analisi senza limite per visitatore." : `${ph.per_ip_daily} analisi al giorno${ph.used_today != null ? ` (usate oggi: ${ph.used_today})` : ""}.` : "";
  let h = `<div class="exp f3" id="f3Box"><header><h4>Da foto al 3D</h4><span class="tag">Interni · AI</span></header>
    <p class="note">Carica o scatta la foto di una stanza: l'AI riconosce porte, finestre, arredi, luci e persone e Pianta Libera ricostruisce una <b>bozza 3D modificabile</b>, pronta per il render. Non è un rilievo: le misure vanno verificate.</p>`;
  if (!F3.img){
    h += `<div class="btns"><button class="btn primary" id="f3Shoot">Scatta una foto</button><button class="btn" id="f3Pick">Scegli una foto</button></div>
      <p class="note">Consigli: foto orizzontale, fotocamera diritta all'altezza degli occhi, verso una parete, con il pavimento e il soffitto visibili. Un solo locale per foto.</p>`;
  } else if (!F3.a){
    h += `<div class="f3thumb"><img src="${F3.thumb}" alt="Foto da analizzare"><div><b>${esc(F3.name)}</b><br><span class="note">${F3.w}×${F3.h} px${F3.exifFov ? ` · campo visivo ${fmt(F3.exifFov, 0)}° dalla foto` : ""}</span></div></div>
      ${avail ? `<p class="note warn">${esc(avail)}</p>` : `
      <label class="chk"><input type="checkbox" id="f3Consent" ${f3Consent ? "checked" : ""}><span>Acconsento all'invio della foto a ${esc(c?.provider || "Cloudflare Workers AI")} per l'analisi. ${esc(ph?.privacy || "")}</span></label>
      ${c?.turnstile_site_key && !owner ? `<div id="f3Turnstile" class="ts"></div>` : ""}
      <p class="note">${esc(quota)}</p>`}
      <div class="btns">${avail ? "" : `<button class="btn primary" id="f3Go" ${F3.busy ? "disabled" : ""}>${F3.busy ? "Analisi in corso…" : "Analizza la foto"}</button>`}<button class="btn" id="f3Reset">Cambia foto</button></div>`;
  } else {
    const st = f3Solve(), n = F3.items.filter(i => i.on).length;
    h += `<div class="f3thumb"><img src="${F3.thumb}" alt="Foto analizzata"><div><b>${esc(F3.name)}</b><br><span class="note">${F3.items.length} elementi riconosciuti, ${n} da creare${st.ok ? ` · stanza ${fmt(st.W, 2)} × ${fmt(st.D, 2)} m` : ""}</span></div></div>
      ${F3.report ? `<div class="a3rep"><b>${esc(F3.report.title)}</b><ul>${F3.report.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
      <div class="btns"><button class="btn primary" id="f3Open">${F3.report ? "Riapri la revisione" : "Rivedi e crea il 3D"}</button><button class="btn" id="f3Reset">Nuova foto</button></div>`;
  }
  if (F3.err && !F3.open) h += `<p class="note warn" role="alert">${esc(F3.err)}</p>`;
  return h + `</div>`;
}
/* finestra di revisione: foto grande per posizionare gli spigoli con precisione */
function f3OpenModal(){
  F3.open = true; let m = $("#f3Modal");
  if (!m){ m = document.createElement("div"); m.id = "f3Modal"; m.className = "f3modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Da foto al 3D: revisione");
    document.body.appendChild(m); m.addEventListener("click", f3Click); m.addEventListener("change", f3Change);
    m.addEventListener("pointerdown", e => { if (e.target.closest("#f3Svg")) f3PointerDown(e); }); m.addEventListener("pointermove", e => { if (f3Drag) f3PointerMove(e); });
    m.addEventListener("pointerup", f3PointerUp); m.addEventListener("pointercancel", f3PointerUp); }
  f3RenderModal(); m.querySelector("#f3Close")?.focus();
}
function f3CloseModal(){ F3.open = false; $("#f3Modal")?.remove(); renderImport(); }
function f3RenderModal(){
  const m = $("#f3Modal"); if (!m) return; const sc = m.querySelector(".f3m-side")?.scrollTop || 0;
  m.innerHTML = `<div class="f3m-in"><header><h3>Da foto al 3D</h3><span class="note">${esc(F3.name)}</span><button class="btn" id="f3Close" aria-label="Chiudi la revisione">✕</button></header>${f3ReviewHTML()}</div>`;
  const side = m.querySelector(".f3m-side"); if (side) side.scrollTop = sc;
  requestAnimationFrame(f3DrawPlan);
}
function f3ReviewHTML(){
  const s = f3Solve(), o = F3.opts, q = F3.quad, VW = 1000, VH = Math.round(1000 * F3.h / F3.w), m = 90;
  const P_ = p => `${(p[0] * VW).toFixed(1)},${(p[1] * VH).toFixed(1)}`;
  const boxes = F3.items.map((it, i) => { const [x0, y0, x1, y1] = it.box, C = F3_CATS[it.category] || F3_CATS.altro, cls = `f3b${it.on ? "" : " off"}${i === F3.sel ? " sel" : ""}${C.kind === "door" || C.kind === "window" ? " op" : ""}`;
    return `<g class="${cls}" data-f3box="${i}"><rect x="${x0 * VW}" y="${y0 * VH}" width="${(x1 - x0) * VW}" height="${(y1 - y0) * VH}"/><text x="${x0 * VW + 6}" y="${y0 * VH + 22}">${i + 1}</text>${i === F3.sel ? `<circle class="f3rh" data-f3rs="${i}" data-c="tl" cx="${x0 * VW}" cy="${y0 * VH}" r="16"/><circle class="f3rh" data-f3rs="${i}" data-c="br" cx="${x1 * VW}" cy="${y1 * VH}" r="16"/>` : ""}</g>`; }).join("");
  const handles = ["fl", "fr", "cr", "cl"].filter(k => o.ceil || k[0] === "f").map(k => `<g class="f3h" data-f3h="${k}"><circle cx="${q[k][0] * VW}" cy="${q[k][1] * VH}" r="34" class="hit"/><circle cx="${q[k][0] * VW}" cy="${q[k][1] * VH}" r="13"/></g>`).join("");
  const quadPts = o.ceil ? [q.fl, q.fr, q.cr, q.cl] : [q.fl, q.fr];
  // lente d'ingrandimento (3×) mentre si trascina uno spigolo: il dito non copre il punto
  let loupe = "";
  if (f3Drag?.kind === "h"){ const [px, py] = [q[f3Drag.k][0] * VW, q[f3Drag.k][1] * VH], R = 95, Z = 3, cy = py > R * 2.2 ? py - R * 1.9 : py + R * 1.9;
    loupe = `<defs><clipPath id="f3lc"><circle cx="${px}" cy="${cy}" r="${R}"/></clipPath></defs><g clip-path="url(#f3lc)"><rect x="${px - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" class="f3pad"/>
      <g transform="translate(${px} ${cy}) scale(${Z}) translate(${-px} ${-py})"><image href="${F3.img}" x="0" y="0" width="${VW}" height="${VH}"/><polygon class="f3q thin" points="${quadPts.map(P_).join(" ")}"/></g></g>
      <circle cx="${px}" cy="${cy}" r="${R}" class="f3lr"/><path d="M${px - 14} ${cy}h28M${px} ${cy - 14}v28" class="f3lx"/>`; }
  const stage = `<div class="f3stage"><svg id="f3Svg" viewBox="${-m} ${-m} ${VW + 2 * m} ${VH + 2 * m}" role="img" aria-label="Foto con la parete di fondo e gli elementi riconosciuti">
      <rect x="${-m}" y="${-m}" width="${VW + 2 * m}" height="${VH + 2 * m}" class="f3pad"/><image href="${F3.img}" x="0" y="0" width="${VW}" height="${VH}"/>
      <g class="f3boxes">${boxes}</g>${o.ceil ? `<polygon class="f3q" points="${quadPts.map(P_).join(" ")}"/>` : `<polyline class="f3q" points="${quadPts.map(P_).join(" ")}"/>`}${handles}${loupe}</svg></div>`;
  const sum = s.ok ? `Stanza <b>${fmt(s.W, 2)} × ${fmt(s.D, 2)} m</b>, altezza <b>${fmt(s.H, 2)} m</b> · fotocamera a ${fmt(s.hc, 2)} m, inclinata di ${fmt(s.p * 180 / Math.PI, 1)}°` : `<span class="warn">${esc(s.err)}</span>`;
  const list = F3.items.map((it, i) => `<div class="f3row${i === F3.sel ? " sel" : ""}"><label class="chk"><input type="checkbox" data-f3on="${i}" ${it.on ? "checked" : ""}><b>${i + 1}</b></label>
      <select class="inp" data-f3cat="${i}" aria-label="Categoria dell'elemento ${i + 1}">${Object.entries(F3_CATS).map(([k, v]) => `<option value="${k}" ${k === it.category ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select>
      <span class="note">${it.doubt ? "non confermata dalla foto · " : ""}${esc(it.label && it.label.toLowerCase() !== (F3_CATS[it.category]?.n || "").toLowerCase() ? it.label : "")}${/rilevatore|segmentazione/.test(it.source || "") ? `${it.label && it.label.toLowerCase() !== (F3_CATS[it.category]?.n || "").toLowerCase() ? " · " : ""}riquadro preciso` : ""}</span><button class="btn mini" data-f3pick="${i}" aria-label="Seleziona l'elemento ${i + 1} sulla foto">⌖</button></div>`).join("");
  const meta = F3.meta || {};
  return `<div class="f3m-body"><div class="f3m-photo"><p class="note"><b>1.</b> Trascina i ${o.ceil ? "quattro" : "due"} punti sugli <b>spigoli della parete di fondo</b> (${esc(F3.quadSource)}): in basso dove incontra il pavimento${o.ceil ? ", in alto dove incontra il soffitto" : ""}. Se lo spigolo è fuori dalla foto, mettilo nel bordo grigio.</p>
    ${stage}
    <div class="row f3opts"><label class="chk"><input type="checkbox" id="f3Ceil" ${o.ceil ? "checked" : ""}> Il soffitto si vede</label></div></div>
    <div class="f3m-side"><p class="note"><b>2.</b> Una misura che conosci, per la scala:</p>
    <div class="row"><div class="f"><span class="lbl">Misura nota</span><select id="f3RefKind" class="inp">${F3_REF.filter(([k]) => o.ceil || k !== "ceil").map(([k, n]) => `<option value="${k}" ${k === o.refKind ? "selected" : ""}>${n}</option>`).join("")}${!o.ceil ? `<option value="ceil" ${o.refKind === "ceil" ? "selected" : ""}>Altezza del soffitto (con fotocamera a 1,5 m)</option>` : ""}</select></div>
      <div class="f"><span class="lbl">Valore (m)</span><input id="f3RefVal" class="inp" inputmode="decimal" value="${fmt(o.refVal, 2)}"></div></div>
    <div class="row"><div class="f"><span class="lbl">Campo visivo (°)</span><input id="f3Fov" class="inp" inputmode="decimal" value="${fmt(f3Fov(), 0)}"><span class="note">${o.fov ? "impostato da te" : F3.exifFov ? "dalla foto (EXIF)" : "stimato: telefono ~65°, grandangolo ~75°"}</span></div>
      <div class="f"><span class="lbl">Profondità della stanza (m)</span><input id="f3Depth" class="inp" inputmode="decimal" value="${o.depth ? fmt(o.depth, 2) : ""}" placeholder="${s.ok ? fmt(s.depthAuto, 2) : ""}"><span class="note">il muro dietro la fotocamera non si vede</span></div></div>
    <p class="note f3sum" aria-live="polite">${sum}</p>
    <canvas id="f3Plan" class="f3plan" width="640" height="300" aria-label="Anteprima in pianta"></canvas>
    <p class="note"><b>3.</b> Controlla gli elementi: togli la spunta a quelli da non creare, correggi la categoria; tocca un riquadro per spostarlo o ridimensionarlo.</p>
    <div class="f3list">${list || `<p class="note">Nessun elemento riconosciuto.</p>`}</div>
    <div class="btns"><select id="f3AddCat" class="inp" aria-label="Categoria da aggiungere"><option value="">＋ Aggiungi un elemento…</option>${Object.entries(F3_CATS).filter(([, v]) => !v.skip).map(([k, v]) => `<option value="${k}">${esc(v.n)}</option>`).join("")}</select></div>
    <div class="btns f3m-go"><button class="btn primary" id="f3Build" ${s.ok ? "" : "disabled"}>${F3.report ? "Crea un'altra copia" : "Crea il modello 3D"}</button><button class="btn" id="f3Cancel">Chiudi</button></div>
    <p class="note">${F3.seg?.state === "run" ? (F3.seg.phase === "profondita" ? "Misuro la stanza nel dispositivo (la prima volta si scarica il modello di profondità, ~42 MB)…" : "Segmentazione nel dispositivo in corso: spigoli e riquadri si aggiorneranno da soli…") : F3.seg?.state === "ok" ? esc(F3.segNote || "") : F3.seg?.state === "err" ? "Segmentazione nel dispositivo non disponibile: spigoli e riquadri vengono solo dall'analisi AI." : ""}</p>
    ${F3.err ? `<p class="note warn" role="alert">${esc(F3.err)}</p>` : ""}
    <p class="note">${meta.mock ? "Risposta di prova del server locale. " : ""}${meta.model ? `Analisi: ${esc(meta.model.replace(/^@cf\//, ""))}${meta.detect ? " + " + esc(meta.detect.replace(/^@cf\//, "")) : ""}` : ""}${meta.ms ? ` in ${fmt(meta.ms / 1000, 0)} s` : ""}${meta.remaining != null ? ` · analisi rimaste oggi: ${meta.remaining}` : ""}.</p></div></div>`;
}
/* anteprima in pianta: stanza, fotocamera con il suo campo visivo, aperture e oggetti */
function f3DrawPlan(){
  const cv = $("#f3Plan"); if (!cv || !F3.a) return; const s = f3Solve(), g = cv.getContext("2d"), dpr = devicePixelRatio || 1;
  const cw = cv.clientWidth || 320, ch = Math.round(cw * .55); cv.width = cw * dpr; cv.height = ch * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.body), ink = css.getPropertyValue("--ink") || "#222", acc = css.getPropertyValue("--accent") || "#1f6f62", mut = css.getPropertyValue("--muted") || "#888";
  g.clearRect(0, 0, cw, ch); if (!s.ok) return;
  const lay = f3Layout(s), minX = Math.min(0, s.c[0]) - .5, maxX = Math.max(s.W, s.c[0]) + .5, maxY = Math.max(s.D, s.c[1]) + .5, minY = -.5;
  const k = Math.min(cw / (maxX - minX), ch / (maxY - minY)), T = p => [(p[0] - minX) * k + (cw - (maxX - minX) * k) / 2, (p[1] - minY) * k];
  g.lineWidth = 3; g.strokeStyle = ink; g.beginPath(); [[0, 0], [s.W, 0], [s.W, s.D], [0, s.D], [0, 0]].forEach((p, i) => { const q = T(p); i ? g.lineTo(...q) : g.moveTo(...q); }); g.stroke();
  g.lineWidth = 4; g.strokeStyle = acc;
  for (const o of lay.openings){ const a = o.wall === "back" ? [o.t - o.w / 2, 0] : o.wall === "left" ? [0, s.D - o.t + o.w / 2] : [s.W, o.t - o.w / 2], b = o.wall === "back" ? [o.t + o.w / 2, 0] : o.wall === "left" ? [0, s.D - o.t - o.w / 2] : [s.W, o.t + o.w / 2]; g.beginPath(); g.moveTo(...T(a)); g.lineTo(...T(b)); g.stroke(); }
  g.fillStyle = acc; g.font = "11px sans-serif";
  for (const o of lay.objects){ const C = F3_CATS[o.cat] || F3_CATS[o.it.category], r = (o.rot) * Math.PI / 180, w = (C.w || .5) * o.scale, d = (C.d || .5) * o.scale, q = T([o.x, o.y]);
    g.save(); g.translate(...q); g.rotate(r); g.globalAlpha = .25; g.fillRect(-w * k / 2, -d * k / 2, w * k, d * k); g.globalAlpha = 1; g.strokeStyle = acc; g.lineWidth = 1.5; g.strokeRect(-w * k / 2, -d * k / 2, w * k, d * k); g.restore();
    g.fillStyle = ink; g.fillText(String(o.it.id + 1), q[0] - 3, q[1] + 4); g.fillStyle = acc; }
  const cq = T(s.c), fv = f3Rad(f3Fov()) / 2, look = s.ray(.5, .5), ang = Math.atan2(look[1], look[0]);
  g.fillStyle = mut; g.globalAlpha = .18; g.beginPath(); g.moveTo(...cq); g.arc(cq[0], cq[1], Math.min(cw, ch) * .45, ang - fv, ang + fv); g.closePath(); g.fill(); g.globalAlpha = 1;
  g.fillStyle = ink; g.beginPath(); g.arc(cq[0], cq[1], 5, 0, 7); g.fill();
}
function f3Refresh(){ // aggiorna foto, riassunto e anteprima senza rifare tutta la finestra (trascinamento fluido)
  const box = $("#f3Modal"); if (!box) return;
  const tmp = document.createElement("div"); tmp.innerHTML = f3ReviewHTML(); const nb = tmp;
  for (const sel of [".f3stage", ".f3sum"]){ const a = $(sel, box), b = $(sel, nb); if (a && b) a.replaceWith(b); }
  const st = f3Solve(), btn = $("#f3Build"); if (btn) btn.disabled = !st.ok;
  const dp = $("#f3Depth"); if (dp && st.ok) dp.placeholder = fmt(st.depthAuto, 2);
  f3DrawPlan();
}
const f3Pt = e => { const svg = $("#f3Svg"); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [p.x / 1000, p.y / (1000 * F3.h / F3.w)]; };
let f3Drag = null;
function f3PointerDown(e){
  const h = e.target.closest("[data-f3h]"), rs = e.target.closest("[data-f3rs]"), b = e.target.closest("[data-f3box]");
  if (!h && !rs && !b) return;
  e.preventDefault(); const p = f3Pt(e);
  if (h) f3Drag = {kind:"h", k:h.dataset.f3h};
  else if (rs) f3Drag = {kind:"rs", i:+rs.dataset.f3rs, c:rs.dataset.c};
  else { const i = +b.dataset.f3box; if (F3.sel !== i){ F3.sel = i; f3Refresh(); f3SyncList(); } f3Drag = {kind:"mv", i, p0:p, b0:F3.items[i].box.slice()}; }
  $("#f3Svg")?.setPointerCapture?.(e.pointerId);
}
function f3PointerMove(e){
  if (!f3Drag) return; e.preventDefault(); const p = f3Pt(e), lim = v => clamp(v, -.11, 1.11);
  if (f3Drag.kind === "h"){ F3.quad[f3Drag.k] = [lim(p[0]), lim(p[1])]; F3.quadSource = "posizionati da te"; F3.quadOpen = null; F3.opts.pitch = null; }
  else if (f3Drag.kind === "rs"){ const b = F3.items[f3Drag.i].box;
    if (f3Drag.c === "tl"){ b[0] = clamp(p[0], 0, b[2] - .01); b[1] = clamp(p[1], 0, b[3] - .01); } else { b[2] = clamp(p[0], b[0] + .01, 1); b[3] = clamp(p[1], b[1] + .01, 1); } }
  else { const b0 = f3Drag.b0, dx = clamp(p[0] - f3Drag.p0[0], -b0[0], 1 - b0[2]), dy = clamp(p[1] - f3Drag.p0[1], -b0[1], 1 - b0[3]); F3.items[f3Drag.i].box = [b0[0] + dx, b0[1] + dy, b0[2] + dx, b0[3] + dy]; }
  cancelAnimationFrame(f3PointerMove.raf); f3PointerMove.raf = requestAnimationFrame(f3Refresh);
}
function f3PointerUp(){ if (f3Drag){ f3Drag = null; f3Refresh(); } }
function f3SyncList(){ document.querySelectorAll("#f3Modal .f3row").forEach((r, i) => r.classList.toggle("sel", i === F3.sel)); }

function f3Click(e){ const b = e.target.closest("button"); if (!b) return;
  if (b.id === "f3Pick") $("#fF3").click();
  else if (b.id === "f3Shoot") $("#fF3c").click();
  else if (b.id === "f3Reset"){ Object.assign(F3, {img:null, thumb:null, a:null, quad:null, items:[], sel:-1, err:"", report:null, seg:null}); renderImport(); }
  else if (b.id === "f3Go") f3Analyze();
  else if (b.id === "f3Open") f3OpenModal();
  else if (b.id === "f3Close" || b.id === "f3Cancel") f3CloseModal();
  else if (b.id === "f3Build") f3Build();
  else if (b.dataset.f3pick != null){ F3.sel = +b.dataset.f3pick; f3Refresh(); f3SyncList(); $("#f3Svg")?.scrollIntoView({block:"nearest", behavior:"smooth"}); }
}
function f3Change(e){ const t = e.target, rr = () => F3.open ? f3RenderModal() : renderImport();
  if (t.id === "f3Consent"){ f3Consent = t.checked; try { localStorage.setItem(F3_CONSENT_KEY, f3Consent ? "1" : "0"); } catch(_){} if (f3Consent) F3.err = ""; return; }
  if (t.id === "f3Ceil"){ F3.opts.ceil = t.checked; if (!t.checked && F3.opts.refKind === "ceil") F3.opts.refVal = F3.opts.refVal || 2.7; rr(); return; }
  if (t.id === "f3RefKind"){ F3.opts.userRef = true; F3.opts.refKind = t.value; F3.opts.refVal = {ceil:F3.a?.room?.height_m || 2.7, width:F3.a?.room?.width_m || 4, cam:1.5}[t.value]; rr(); return; }
  // campi numerici: si aggiornano foto, riassunto e anteprima, non i campi (rifarli mentre perdono il fuoco è vietato)
  if (t.id === "f3RefVal"){ const v = num(t.value); if (v > .2 && v < 50){ F3.opts.refVal = v; F3.opts.userRef = true; } f3Refresh(); return; }
  if (t.id === "f3Fov"){ const v = num(t.value); F3.opts.fov = v >= 20 && v <= 130 ? v : null; f3Refresh(); return; }
  if (t.id === "f3Depth"){ const v = num(t.value); F3.opts.depth = v > 0 ? clamp(v, 1, 40) : null; f3Refresh(); return; }
  if (t.dataset.f3on != null){ F3.items[+t.dataset.f3on].on = t.checked; f3Refresh(); return; }
  if (t.dataset.f3cat != null){ const it = F3.items[+t.dataset.f3cat]; it.category = t.value; it.userCat = true; it.on = !F3_CATS[t.value]?.skip; rr(); return; }
  if (t.id === "f3AddCat" && t.value){ const id = F3.items.length; F3.items.push({id, category:t.value, label:F3_CATS[t.value].n, box:[.42, .45, .58, .7], w:F3_CATS[t.value].w, d:F3_CATS[t.value].d, facing:"camera", against:"none", source:"aggiunto", on:true}); F3.sel = id; rr(); return; }
}
PI.addEventListener("click", f3Click); PI.addEventListener("change", f3Change);
addEventListener("keydown", e => { if (e.key === "Escape" && F3.open && !f3Drag) f3CloseModal(); });
for (const id of ["#fF3", "#fF3c"]) $(id).addEventListener("change", async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try { busy("Preparo la foto…"); await f3LoadFile(f); } catch(err){ F3.err = err.message || String(err); } finally { busy(""); }
  renderImport(); });
/* chiamato da renderImport (07-io.js) dopo aver scritto il pannello */
function f3AfterRender(){ if (!F3.cfg && !F3.cfgLoading) f3LoadConfig(); if (F3.img && !F3.a) f3MountTurnstile(); }
