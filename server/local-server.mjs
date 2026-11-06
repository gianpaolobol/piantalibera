// Pianta Libera in locale: serve l'editor e implementa il contratto /api/render
// (docs/api-render-contract.md) con due possibili motori:
//   - «prova» (predefinito): nessun modello AI, restituisce la vista inviata (mock: true);
//   - «comfyui»: usa ComfyUI avviato su questo computer, quindi la GPU locale.
//
// Variabili d'ambiente (tutte facoltative):
//   PORT=8787            porta (anche MOCK_PORT, per compatibilità)
//   HOST=127.0.0.1       0.0.0.0 per usarlo da altri dispositivi della rete locale
//   STATIC_DIR=…         cartella dell'editor (predefinita: ../public, nel pacchetto ../app)
//   COMFYUI_WORKFLOW=…/workflow-api.json  workflow esportato da ComfyUI in formato API (attiva il motore ComfyUI)
//   COMFYUI_URL=http://127.0.0.1:8188   indirizzo di ComfyUI; se manca si prova 8188 (portable) e 8000 (Desktop)
//   PER_HOUR=30          richieste l'ora per indirizzo (solo motore di prova)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, normalize, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { LIMITS as CONTRACT, validateRenderRequest, buildModelPrompt, decodeDataUrl } from "../shared/contract.js";
import { fillWorkflow, isApiWorkflow } from "./comfy-workflow.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.env.MOCK_PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const STATIC = resolve(process.env.STATIC_DIR || join(here, "..", "public"));
const WF_PATH = process.env.COMFYUI_WORKFLOW || "";
const COMFY_CANDIDATES = process.env.COMFYUI_URL ? [process.env.COMFYUI_URL.replace(/\/+$/, "")] : ["http://127.0.0.1:8188", "http://127.0.0.1:8000"];
let COMFY = WF_PATH || process.env.COMFYUI_URL ? COMFY_CANDIDATES[0] : "";
/** Trova ComfyUI tra gli indirizzi possibili (una volta, poi ricorda quello giusto). */
let comfyFound = false;
async function locateComfy(){
  if (comfyFound) return COMFY;
  for (const base of COMFY_CANDIDATES){
    try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1500); const r = await fetch(base + "/system_stats", {signal: ctl.signal}); clearTimeout(t); if (r.ok){ COMFY = base; comfyFound = true; return COMFY; } } catch {}
  }
  return COMFY;
}
const LIMITS = {...CONTRACT, perHour: Number(process.env.PER_HOUR || process.env.MOCK_PER_IP_PER_HOUR || 30), retentionMs: 60 * 60 * 1000, comfyTimeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS || 300000)};

let workflow = null, engine = "prova", engineNote = "";
if (COMFY){
  if (!WF_PATH || !existsSync(WF_PATH)) engineNote = `ComfyUI configurato ma manca il workflow (COMFYUI_WORKFLOW=${WF_PATH || "—"}): uso il motore di prova.`;
  else {
    try { workflow = JSON.parse(readFileSync(WF_PATH, "utf8")); if (!isApiWorkflow(workflow)) throw new Error("non è in formato API (in ComfyUI: Workflow → Export (API))"); engine = "comfyui"; }
    catch(e){ workflow = null; engineNote = `Workflow ComfyUI non valido: ${e.message}. Uso il motore di prova.`; }
  }
}

const jobs = new Map(), hits = new Map();
const send = (res, status, body, headers = {}) => { res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store", ...headers}); res.end(JSON.stringify(body)); };
const fail = (res, status, code, message, headers) => send(res, status, {error: {code, message}}, headers);
const view = j => ({id: j.id, status: j.status, mode: j.mode, created_at: j.created_at, expires_at: j.expires_at, provider: j.provider, model: j.model, generated: engine === "comfyui", mock: engine !== "comfyui",
  ...(j.status === "succeeded" ? {images: j.images} : {}), ...(j.error ? {error: j.error} : {}), ...(j.duration_ms ? {duration_ms: j.duration_ms} : {})});
function rateLimited(ip){ if (engine === "comfyui") return 0; const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 3600e3); if (list.length >= LIMITS.perHour){ hits.set(ip, list); return Math.ceil((3600e3 - (now - list[0])) / 1000); } list.push(now); hits.set(ip, list); return 0; }
async function readBody(req){ let size = 0; const chunks = []; for await (const c of req){ size += c.length; if (size > LIMITS.maxBodyBytes) throw Object.assign(new Error("too_large"), {code: 413}); chunks.push(c); } return Buffer.concat(chunks).toString("utf8"); }
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".mjs":"text/javascript", ".json":"application/json", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".svg":"image/svg+xml", ".wasm":"application/wasm", ".glb":"model/gltf-binary", ".hdr":"application/octet-stream", ".txt":"text/plain; charset=utf-8", ".woff2":"font/woff2"};
const sniff = b => b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" ? "image/webp" : null;
setInterval(() => { const now = Date.now(); for (const [id, j] of jobs) if (now > Date.parse(j.expires_at)) jobs.delete(id); }, 60e3).unref();

/* ---------- ComfyUI ---------- */
let comfyChain = Promise.resolve(); // un lavoro alla volta: la GPU è una sola
async function comfyFetch(path, init = {}, ms = 30000){
  await locateComfy();
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(COMFY + path, {...init, signal: ctl.signal}); }
  catch(e){ throw new Error(`ComfyUI non risponde (${COMFY_CANDIDATES.join(" o ")}): è avviato?`); }
  finally { clearTimeout(t); }
}
async function comfyUpload(name, bytes){
  const fd = new FormData(); fd.append("image", new Blob([bytes], {type: "image/png"}), name); fd.append("overwrite", "true"); fd.append("type", "input");
  const r = await comfyFetch("/upload/image", {method: "POST", body: fd}); if (!r.ok) throw new Error(`ComfyUI: caricamento immagine non riuscito (HTTP ${r.status})`);
  const j = await r.json(); return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}
async function runComfy(job, v){
  const t0 = Date.now(), tag = "pianta_" + job.id.slice(0, 8);
  const imgs = [await comfyUpload(`${tag}_vista.png`, decodeDataUrl(v.image).bytes)];
  if (v.params.use_guides !== false){
    if (v.depth) imgs.push(await comfyUpload(`${tag}_profondita.png`, decodeDataUrl(v.depth).bytes));
    if (v.lines) imgs.push(await comfyUpload(`${tag}_contorni.png`, decodeDataUrl(v.lines).bytes));
  }
  const guides = {}; if (imgs.length > 1) guides.depth = 1; if (imgs.length > 2) guides.lines = 2;
  const seed = Number.isInteger(v.params.seed) && v.params.seed >= 0 ? v.params.seed : Math.floor(Math.random() * 2 ** 31);
  const {wf} = fillWorkflow(workflow, {images: imgs, prompt: buildModelPrompt(v, guides), seed, width: v.params.width, height: v.params.height});
  const r = await comfyFetch("/prompt", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({prompt: wf, client_id: "pianta-libera"})});
  const q = await r.json().catch(() => ({}));
  if (!r.ok || !q.prompt_id) throw new Error("ComfyUI ha rifiutato il workflow: " + (q.error?.message || q.node_errors && JSON.stringify(q.node_errors).slice(0, 300) || `HTTP ${r.status}`));
  job.status = "running";
  while (Date.now() - t0 < LIMITS.comfyTimeoutMs){
    await new Promise(r => setTimeout(r, 1000));
    const h = await (await comfyFetch(`/history/${q.prompt_id}`)).json().catch(() => ({}));
    const rec = h[q.prompt_id]; if (!rec) continue;
    if (rec.status?.status_str === "error") throw new Error("ComfyUI ha segnalato un errore durante la generazione (vedi la sua finestra)");
    const outs = Object.values(rec.outputs || {}).flatMap(o => o.images || []).filter(i => i.type === "output");
    if (!outs.length){ if (rec.status?.completed) throw new Error("il workflow non ha prodotto immagini: serve un nodo «Save Image»"); continue; }
    for (const im of outs.slice(0, v.params.variants || 1)){
      const res = await comfyFetch(`/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || "")}&type=output`);
      const b = Buffer.from(await res.arrayBuffer()), type = sniff(b); if (!type) throw new Error("ComfyUI ha restituito un file che non è un'immagine");
      job.files.push({b, type}); job.images.push(`/api/render/${job.id}/image/${job.files.length - 1}`);
    }
    job.duration_ms = Date.now() - t0; return;
  }
  throw new Error("tempo scaduto in attesa di ComfyUI");
}

/* ---------- server ---------- */
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"), ip = req.socket.remoteAddress || "?";
  const m = url.pathname.match(/^\/api\/render(?:\/([a-f0-9]{32})(?:\/image\/(\d+))?)?\/?$/);
  try {
    if (url.pathname === "/api/config" && req.method === "GET"){
      const used = (hits.get(ip) || []).filter(t => Date.now() - t < 3600e3).length, local = engine === "comfyui";
      return send(res, 200, {enabled: true, reason: null, mock: !local, generated: local,
        provider: local ? "ComfyUI su questo computer (GPU locale)" : "Servizio di prova locale", model: local ? `workflow ${basename(WF_PATH)}` : null, turnstile_site_key: null,
        quota: {per_ip_daily: local ? 9999 : LIMITS.perHour, used_today: local ? 0 : used, window: local ? "nessun limite" : "1h"}, limits: {max_side: CONTRACT.maxSide, max_variants: CONTRACT.maxVariants},
        retention_seconds: Math.round(LIMITS.retentionMs / 1000), note: engineNote || undefined,
        privacy: local ? "Le immagini restano su questo computer: le elabora ComfyUI in locale." : "Servizio di prova in locale: le immagini restano su questo computer e non vengono inviate a terzi."});
    }
    if (m){
      const id = m[1];
      if (req.method === "POST" && !id){
        if (!(req.headers["content-type"] || "").includes("application/json")) return fail(res, 415, "unsupported_media_type", "serve application/json");
        let body; try { body = JSON.parse(await readBody(req)); } catch(e){ return e.code === 413 ? fail(res, 413, "too_large", "richiesta troppo grande") : fail(res, 400, "invalid_json", "JSON non valido"); }
        const checked = validateRenderRequest(body); if (checked.error) return fail(res, checked.error.status, checked.error.code, checked.error.message);
        if (body.consent !== true) return fail(res, 400, "consent_required", "serve il consenso all'invio delle immagini (consent: true)");
        const wait = rateLimited(ip); if (wait) return fail(res, 429, "quota_exceeded", `limite di ${LIMITS.perHour} richieste l'ora`, {"Retry-After": String(wait)});
        const v = checked.value, now = Date.now();
        const job = {id: randomUUID().replace(/-/g, ""), status: "queued", mode: v.mode, created_at: new Date(now).toISOString(), expires_at: new Date(now + LIMITS.retentionMs).toISOString(), images: [], files: [],
          provider: engine === "comfyui" ? "ComfyUI locale" : "prova", model: engine === "comfyui" ? basename(WF_PATH) : null};
        jobs.set(job.id, job);
        if (engine === "comfyui"){
          comfyChain = comfyChain.then(() => runComfy(job, v).then(() => { job.status = "succeeded"; }).catch(e => { job.status = "failed"; job.error = {code: "provider_error", message: e.message}; }));
        } else {
          setTimeout(() => { if (jobs.has(job.id)) job.status = "running"; }, 600);
          setTimeout(() => { if (!jobs.has(job.id)) return; job.status = "succeeded"; job.images = Array.from({length: v.params.variants}, () => v.image); }, 1500);
        }
        return send(res, 202, view(job), {Location: `/api/render/${job.id}`});
      }
      if (!id) return fail(res, 405, "method_not_allowed", "usa POST /api/render");
      const job = jobs.get(id); if (!job) return fail(res, 404, "not_found", "lavoro inesistente o scaduto");
      if (m[2] !== undefined){ const f = job.files[+m[2]]; if (!f) return fail(res, 404, "not_found", "immagine non trovata"); res.writeHead(200, {"Content-Type": f.type, "Cache-Control": "private, max-age=3600"}); return res.end(f.b); }
      if (req.method === "GET") return send(res, 200, view(job));
      if (req.method === "DELETE"){ jobs.delete(id); res.writeHead(204); return res.end(); }
      return fail(res, 405, "method_not_allowed", "metodo non supportato");
    }
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method_not_allowed", "solo GET");
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""); if (p.endsWith("/") || p.endsWith("\\")) p += "index.html";
    const file = join(STATIC, p); if (!file.startsWith(STATIC)) return fail(res, 403, "forbidden", "percorso non consentito");
    const st = await stat(file).catch(() => null); if (!st?.isFile()) return fail(res, 404, "not_found", "file non trovato");
    res.writeHead(200, {"Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream"}); res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch(e){ console.error(e); fail(res, 500, "internal", "errore interno"); }
}).listen(PORT, HOST, () => {
  console.log(`\n  Pianta Libera è pronta: http://127.0.0.1:${PORT}/\n`);
  if (engine === "comfyui") locateComfy().then(u => console.log(comfyFound ? `  ComfyUI trovato su ${u}` : `  ComfyUI non risponde ora (${COMFY_CANDIDATES.join(", ")}): avvialo prima di chiedere un render`));
  console.log(engine === "comfyui" ? `  Render AI: ComfyUI con ${basename(WF_PATH)} (GPU di questo computer)` : `  Render AI: servizio di prova (nessun modello AI)${engineNote ? "\n  " + engineNote : ""}`);
  console.log(`  Per chiudere: Ctrl+C\n`);
});
