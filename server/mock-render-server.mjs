// Servizio di prova che implementa il contratto POST/GET/DELETE /api/render
// (vedi docs/api-render-contract.md). Non chiama nessun modello AI: restituisce
// la vista ricevuta, marcata con "mock": true, così l'interfaccia mostra
// chiaramente che non è un render vero.
//
// Uso:  npm run dev   → http://localhost:8787/  (editor da public/ + /api/render di prova)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { LIMITS as CONTRACT, validateRenderRequest } from "../shared/contract.js";

const PORT = Number(process.env.MOCK_PORT || 8787);
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const LIMITS = {
  ...CONTRACT,
  perIpPerHour: Number(process.env.MOCK_PER_IP_PER_HOUR || 30),
  retentionMs: 30 * 60 * 1000,
};
const jobs = new Map();          // id -> job
const hits = new Map();          // ip -> [timestamp]

const send = (res, status, body, headers = {}) => { res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store", ...headers}); res.end(JSON.stringify(body)); };
const fail = (res, status, code, message, headers) => send(res, status, {error: {code, message}}, headers);
const view = j => ({id: j.id, status: j.status, mode: j.mode, created_at: j.created_at, expires_at: j.expires_at, mock: true, ...(j.status === "succeeded" ? {images: j.images} : {}), ...(j.error ? {error: j.error} : {})});

function rateLimited(ip){ const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 3600e3); if (list.length >= LIMITS.perIpPerHour) { hits.set(ip, list); return Math.ceil((3600e3 - (now - list[0])) / 1000); } list.push(now); hits.set(ip, list); return 0; }
async function readBody(req){ let size = 0; const chunks = []; for await (const c of req){ size += c.length; if (size > LIMITS.maxBodyBytes) throw Object.assign(new Error("too_large"), {code: 413}); chunks.push(c); } return Buffer.concat(chunks).toString("utf8"); }
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".json":"application/json", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".glb":"model/gltf-binary", ".hdr":"application/octet-stream", ".txt":"text/plain"};

setInterval(() => { const now = Date.now(); for (const [id, j] of jobs) if (now > Date.parse(j.expires_at)) jobs.delete(id); }, 60e3).unref();

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"), ip = req.socket.remoteAddress || "?";
  const m = url.pathname.match(/^\/api\/render(?:\/([a-f0-9]{32}))?\/?$/);
  try {
    if (m){
      const id = m[1];
      if (req.method === "POST" && !id){
        if (!(req.headers["content-type"] || "").includes("application/json")) return fail(res, 415, "unsupported_media_type", "serve application/json");
        const wait = rateLimited(ip); if (wait) return fail(res, 429, "quota_exceeded", `limite di ${LIMITS.perIpPerHour} richieste l'ora`, {"Retry-After": String(wait)});
        let body; try { body = JSON.parse(await readBody(req)); } catch(e){ return e.code === 413 ? fail(res, 413, "too_large", "richiesta troppo grande") : fail(res, 400, "invalid_json", "JSON non valido"); }
        const checked = validateRenderRequest(body); if (checked.error) return fail(res, checked.error.status, checked.error.code, checked.error.message);
        const v = checked.value;
        const now = Date.now(), job = {id: randomUUID().replace(/-/g, ""), status: "queued", mode: v.mode, created_at: new Date(now).toISOString(), expires_at: new Date(now + LIMITS.retentionMs).toISOString(), images: []};
        jobs.set(job.id, job);
        setTimeout(() => { if (jobs.has(job.id)) job.status = "running"; }, 600);
        setTimeout(() => { if (!jobs.has(job.id)) return; job.status = "succeeded"; job.images = Array.from({length: v.params.variants}, () => v.image); }, 1500);
        return send(res, 202, view(job), {Location: `/api/render/${job.id}`});
      }
      if (!id) return fail(res, 405, "method_not_allowed", "usa POST /api/render");
      const job = jobs.get(id); if (!job) return fail(res, 404, "not_found", "lavoro inesistente o scaduto");
      if (req.method === "GET") return send(res, 200, view(job));
      if (req.method === "DELETE"){ jobs.delete(id); res.writeHead(204); return res.end(); }
      return fail(res, 405, "method_not_allowed", "metodo non supportato");
    }
    // file statici di public/ (comodo per provare l'editor senza Vite)
    if (req.method !== "GET") return fail(res, 405, "method_not_allowed", "solo GET");
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""); if (p.endsWith("/")) p += "index.html";
    const file = join(PUBLIC, p); if (!file.startsWith(PUBLIC)) return fail(res, 403, "forbidden", "percorso non consentito");
    const st = await stat(file).catch(() => null); if (!st?.isFile()) return fail(res, 404, "not_found", "file non trovato");
    res.writeHead(200, {"Content-Type": TYPES[extname(file)] || "application/octet-stream"}); res.end(await readFile(file));
  } catch(e){ console.error(e); fail(res, 500, "internal", "errore interno del servizio di prova"); }
}).listen(PORT, () => console.log(`Pianta Libera in locale: http://localhost:${PORT}/  ·  /api/render di prova (nessun modello AI)`));
