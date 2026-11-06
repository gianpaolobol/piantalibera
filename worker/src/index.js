// Pianta Libera — Worker Cloudflare: serve l'editor (asset statici di public/) e
// implementa il contratto /api/render con Workers AI (FLUX.2 klein 4B per i test).
//
// Binding (wrangler.toml): AI (Workers AI), RENDER_KV (KV), ASSETS (asset statici).
// Variabili: MODEL, PER_IP_DAILY, GLOBAL_DAILY, KILL_SWITCH, RETENTION_SECONDS, MAX_VARIANTS,
//            ALLOWED_ORIGINS, MAX_INPUT_SIDE. Segreti: TURNSTILE_SECRET, IP_SALT.
// Nessuna chiave API: Workers AI si usa tramite il binding del Worker.
import { LIMITS, validateRenderRequest, decodeDataUrl, buildModelPrompt, jsonError } from "../../shared/contract.js";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
const day = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
const secondsToMidnightUTC = () => { const n = new Date(); return Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n) / 1000); };
const ID_RE = /^[a-f0-9]{32}$/;

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function newId() { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); }
function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "application/octet-stream";
}
/** Larghezza e altezza di un PNG (dall'intestazione IHDR), null per altri formati. */
export function pngSize(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
function b64ToBytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

function config(env) {
  return {
    model: env.MODEL || "@cf/black-forest-labs/flux-2-klein-4b",
    perIpDaily: num(env.PER_IP_DAILY, 2),
    globalDaily: num(env.GLOBAL_DAILY, 50),
    retention: Math.max(60, num(env.RETENTION_SECONDS, 3600)),     // KV accetta TTL ≥ 60 s
    maxVariants: Math.min(LIMITS.maxVariants, num(env.MAX_VARIANTS, 2)),
    maxInputSide: num(env.MAX_INPUT_SIDE, 512),
    allowedOrigins: (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean),
  };
}

/** Quote su KV. KV non è transazionale: in caso di richieste simultanee il conteggio può sforare di poco.
 *  Per quote rigorose in produzione passare a un Durable Object o a D1 (vedi docs). */
async function takeQuota(env, cfg, ipHash) {
  const d = day(), kIp = `q:${d}:ip:${ipHash}`, kAll = `q:${d}:total`;
  const [ip, all] = await Promise.all([env.RENDER_KV.get(kIp), env.RENDER_KV.get(kAll)]);
  const usedIp = num(ip, 0), usedAll = num(all, 0);
  if (usedIp >= cfg.perIpDaily) return { error: jsonError(429, "quota_exceeded", `hai usato i ${cfg.perIpDaily} render disponibili oggi`, { "Retry-After": String(secondsToMidnightUTC()) }) };
  if (usedAll >= cfg.globalDaily) return { error: jsonError(429, "global_quota_exceeded", "limite giornaliero del servizio raggiunto", { "Retry-After": String(secondsToMidnightUTC()) }) };
  const ttl = { expirationTtl: 2 * 86400 };
  await Promise.all([env.RENDER_KV.put(kIp, String(usedIp + 1), ttl), env.RENDER_KV.put(kAll, String(usedAll + 1), ttl)]);
  return { usedIp: usedIp + 1, usedAll: usedAll + 1 };
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) });
  return r.ok && (await r.json()).success === true;
}

/** Adattatore Workers AI per FLUX.2 klein: multipart con prompt, dimensioni, seed e immagini di riferimento. */
export async function runKlein(env, cfg, v, seed) {
  const form = new FormData();
  const refs = [["image", v.image]];
  if (v.params.use_guides && v.depth) refs.push(["depth", v.depth]);
  if (v.params.use_guides && v.lines) refs.push(["lines", v.lines]);
  const idx = {}; refs.forEach(([k], i) => { if (k !== "image") idx[k] = i; });
  form.append("prompt", buildModelPrompt(v, idx));
  form.append("width", String(v.params.width));
  form.append("height", String(v.params.height));
  form.append("seed", String(seed));
  refs.forEach(([k, d], i) => { const { bytes, type } = decodeDataUrl(d); form.append(`input_image_${i}`, new Blob([bytes], { type }), `${k}.${type.split("/")[1]}`); });
  const body = new Response(form);
  const out = await env.AI.run(cfg.model, { multipart: { body: body.body, contentType: body.headers.get("content-type") } });
  if (!out || typeof out.image !== "string") throw new Error("risposta del modello senza immagine");
  return b64ToBytes(out.image);
}

async function createJob(request, env, ctx) {
  const cfg = config(env);
  if (env.KILL_SWITCH === "1" || (await env.RENDER_KV.get("config:kill")) === "1") return jsonError(503, "disabled", "il render AI è momentaneamente sospeso");
  if (!(request.headers.get("content-type") || "").includes("application/json")) return jsonError(415, "unsupported_media_type", "serve application/json");
  const len = num(request.headers.get("content-length"), 0);
  if (len > LIMITS.maxBodyBytes) return jsonError(413, "too_large", "richiesta troppo grande");
  let body;
  try { const text = await request.text(); if (text.length > LIMITS.maxBodyBytes) return jsonError(413, "too_large", "richiesta troppo grande"); body = JSON.parse(text); }
  catch { return jsonError(400, "invalid_json", "JSON non valido"); }
  const checked = validateRenderRequest(body, { ...LIMITS, maxVariants: cfg.maxVariants });
  if (checked.error) return jsonError(checked.error.status, checked.error.code, checked.error.message);
  const v = checked.value;
  for (const k of ["image", "depth", "lines"]) {
    if (!v[k]) continue;
    const sz = pngSize(decodeDataUrl(v[k]).bytes);
    if (sz && (sz.w > cfg.maxInputSide || sz.h > cfg.maxInputSide)) return jsonError(400, "invalid_input", `${k}: il modello accetta immagini di riferimento fino a ${cfg.maxInputSide} px per lato`);
  }
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  if (!(await turnstileOk(env, v.turnstile, ip))) return jsonError(403, "bot_check_failed", "verifica anti-bot non superata");
  const q = await takeQuota(env, cfg, await sha256(ip + (env.IP_SALT || "")));
  if (q.error) return q.error;

  const id = newId(), now = Date.now(), ttl = { expirationTtl: cfg.retention };
  const job = { id, status: "running", mode: v.mode, created_at: new Date(now).toISOString(), expires_at: new Date(now + cfg.retention * 1000).toISOString(), model: cfg.model, images: [] };
  await env.RENDER_KV.put(`job:${id}`, JSON.stringify(job), ttl);
  const t0 = Date.now();
  try {
    for (let i = 0; i < v.params.variants; i++) {
      const bytes = await runKlein(env, cfg, v, v.params.seed + i);
      await env.RENDER_KV.put(`img:${id}:${i}`, bytes, { ...ttl, metadata: { type: imageType(bytes) } });
      job.images.push(`/api/render/${id}/image/${i}`);
    }
    job.status = "succeeded";
  } catch (e) {
    job.status = "failed"; job.error = { code: "provider_error", message: String(e?.message || e).slice(0, 300) };
  }
  job.duration_ms = Date.now() - t0;
  await env.RENDER_KV.put(`job:${id}`, JSON.stringify(job), ttl);
  console.log(JSON.stringify({ evt: "render", id, status: job.status, ms: job.duration_ms, variants: v.params.variants, mode: v.mode, day_total: q.usedAll }));
  return json(job.status === "succeeded" ? 200 : 502, job, { Location: `/api/render/${id}` });
}

async function handleApi(request, env, ctx, url) {
  const origin = request.headers.get("origin");
  const cfg = config(env);
  if (origin && origin !== url.origin && !cfg.allowedOrigins.includes(origin)) return jsonError(403, "origin_not_allowed", "origine non consentita");
  const m = url.pathname.match(/^\/api\/render(?:\/([^/]+)(?:\/image\/(\d+))?)?\/?$/);
  if (!m) return jsonError(404, "not_found", "endpoint inesistente");
  const [, id, img] = m;
  if (!id){ if (request.method === "POST") return createJob(request, env, ctx); return jsonError(405, "method_not_allowed", "usa POST /api/render"); }
  if (!ID_RE.test(id)) return jsonError(400, "invalid_id", "id non valido");
  if (img != null) {
    if (request.method !== "GET") return jsonError(405, "method_not_allowed", "solo GET");
    const { value, metadata } = await env.RENDER_KV.getWithMetadata(`img:${id}:${img}`, { type: "arrayBuffer" });
    if (!value) return jsonError(404, "not_found", "immagine inesistente o scaduta");
    return new Response(value, { headers: { "Content-Type": metadata?.type || "image/png", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method === "GET") { const j = await env.RENDER_KV.get(`job:${id}`); return j ? json(200, JSON.parse(j)) : jsonError(404, "not_found", "lavoro inesistente o scaduto"); }
  if (request.method === "DELETE") {
    const j = await env.RENDER_KV.get(`job:${id}`);
    if (j) { const n = JSON.parse(j).images?.length || 0; await Promise.all([env.RENDER_KV.delete(`job:${id}`), ...Array.from({ length: n }, (_, i) => env.RENDER_KV.delete(`img:${id}:${i}`))]); }
    return new Response(null, { status: 204 });
  }
  return jsonError(405, "method_not_allowed", "metodo non supportato");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, ctx, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return jsonError(500, "internal", "errore interno");
    }
  },
};
