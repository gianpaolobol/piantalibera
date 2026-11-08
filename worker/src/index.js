// Pianta Libera — Worker Cloudflare: serve l'editor (asset statici di public/) e
// implementa il contratto /api/render con Workers AI (FLUX.2 klein 4B per i test).
//
// Binding: AI (Workers AI), RENDER_KV (lavori e immagini con TTL), QUOTA (Durable Object
// per quote atomiche), ASSETS (asset statici).
// Variabili: vedi wrangler.toml. Segreti: IP_SALT, TURNSTILE_SECRET.
// Nessuna chiave API: Workers AI si usa tramite il binding del Worker.
//
// Fail-closed: senza IP_SALT valido o senza Turnstile (salvo ALLOW_NO_TURNSTILE=1, solo
// sviluppo) il render è disattivato e /api/config lo dichiara.
import { LIMITS, validateRenderRequest, decodeDataUrl, buildModelPrompt, jsonError } from "../../shared/contract.js";
import { QuotaGate, estimateNeurons, dayKey } from "./quota.js";
import { handleShare, SHARE } from "../../shared/share.js";
import { PHOTO, photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, parseDetections, neuronsFromUsage } from "../../shared/photo.js";
export { QuotaGate };

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
const secondsToMidnightUTC = () => { const n = new Date(); return Math.ceil((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n) / 1000); };
const ID_RE = /^[a-f0-9]{32}$/;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function newId() { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Tipo e dimensioni di un'immagine dai primi byte; null se non è PNG, JPEG o WebP. */
export function inspectImage(bytes) {
  if (bytes.length < 24) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", w: dv.getUint32(16), h: dv.getUint32(20) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    for (let i = 2; i < bytes.length - 9;) {               // cerca il marcatore SOF per le dimensioni
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: "image/jpeg", h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
    return { type: "image/jpeg", w: null, h: null };
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { type: "image/webp", w: null, h: null };
  return null;
}
export const pngSize = bytes => { const i = inspectImage(bytes); return i?.type === "image/png" ? { w: i.w, h: i.h } : null; };

function config(env) {
  const saltOk = typeof env.IP_SALT === "string" && env.IP_SALT.length >= 16 && !/cambia|example|changeme/i.test(env.IP_SALT);
  const turnstileOn = !!(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY);
  const missing = [];
  if (!saltOk) missing.push("IP_SALT");
  if (!turnstileOn && env.ALLOW_NO_TURNSTILE !== "1") missing.push("TURNSTILE_SECRET/TURNSTILE_SITE_KEY");
  if (!env.QUOTA) missing.push("QUOTA (Durable Object)");
  if (!env.RENDER_KV) missing.push("RENDER_KV");
  if (!env.AI) missing.push("AI");
  return {
    model: env.MODEL || "@cf/black-forest-labs/flux-2-klein-4b",
    perIpDaily: num(env.PER_IP_DAILY, 2),
    globalDaily: num(env.GLOBAL_DAILY, 50),
    neuronBudget: num(env.NEURON_DAILY_BUDGET, 9000),        // tetto totale, sotto i 10.000 gratuiti
    visitorBudget: num(env.VISITOR_NEURON_BUDGET, 6100),     // parte dei visitatori: il resto resta al proprietario
    ownerConcurrent: num(env.OWNER_MAX_CONCURRENT, 2),
    rates: { outTile: num(env.NEURONS_PER_OUTPUT_TILE, 26.05), inTile: num(env.NEURONS_PER_INPUT_TILE, 5.37) },
    maxConcurrent: num(env.MAX_CONCURRENT_PER_IP, 1),
    retention: Math.max(60, num(env.RETENTION_SECONDS, 3600)),
    maxVariants: Math.min(LIMITS.maxVariants, num(env.MAX_VARIANTS, 1)),
    maxInputSide: num(env.MAX_INPUT_SIDE, 512),
    timeoutMs: num(env.PROVIDER_TIMEOUT_MS, 60000),
    allowedOrigins: (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean),
    turnstileOn, turnstileSiteKey: turnstileOn ? env.TURNSTILE_SITE_KEY : null,
    shareReady: env.SHARE_ENABLED !== "0" && saltOk && !!env.RENDER_KV && !!env.QUOTA && (turnstileOn || env.ALLOW_NO_TURNSTILE === "1"),
    shareDaily: num(env.SHARE_DAILY_WRITES, SHARE.globalDaily),
    testDaily: num(env.TEST_DAILY, 20),
    // «Da foto al 3D»: modello con visione + rilevatore; quote proprie, Neurons dallo stesso budget giornaliero
    photo: {
      enabled: env.PHOTO_ENABLED !== "0",
      model: env.PHOTO_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct",
      detectModel: env.DETECT_MODEL || "@cf/facebook/detr-resnet-50",
      detect: env.PHOTO_DETECT !== "0",
      perIpDaily: num(env.PHOTO_PER_IP_DAILY, 1),
      globalDaily: num(env.PHOTO_GLOBAL_DAILY, 10),
      neurons: num(env.PHOTO_NEURONS_ESTIMATE, 400),
      rate: { in: num(env.PHOTO_NEURONS_PER_M_IN, 24545), out: num(env.PHOTO_NEURONS_PER_M_OUT, 77273) },
      timeoutMs: num(env.PHOTO_TIMEOUT_MS, 90000),
    },
    missing, ready: missing.length === 0,
  };
}
const killed = async env => env.KILL_SWITCH === "1" || (await env.RENDER_KV?.get("config:kill")) === "1";
const quotaStub = env => env.QUOTA.get(env.QUOTA.idFromName("global"));
async function quotaCall(env, path, body) {
  const r = await quotaStub(env).fetch(`https://quota${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

function secretEq(want, got, min) {
  if (typeof want !== "string" || want.length < min || typeof got !== "string" || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
/* Token delle prove automatiche (workflow «Prove dal vivo»): creato come segreto all'inizio della prova e
   cancellato alla fine. Sostituisce solo Turnstile; quote, tetto globale e budget restano in vigore. */
const testTokenOk = (env, request) => secretEq(env.TEST_TOKEN, request.headers.get("x-test-token") || "", 32);
/* Codice del proprietario del sito (segreto OWNER_TOKEN): niente limite per IP né tetto dei visitatori,
   niente Turnstile; resta il tetto totale di Neurons, così tutto rimane nella quota gratuita. */
export const ownerOk = (env, request) => secretEq(env.OWNER_TOKEN, request.headers.get("x-owner-token") || "", 16);
async function turnstileOk(env, token, ip) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) });
  return r.ok && (await r.json()).success === true;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`il modello non ha risposto entro ${Math.round(ms / 1000)} s`)), ms))]);

/** Adattatore Workers AI per FLUX.2 klein: multipart con prompt, dimensioni, seed e immagini di riferimento.
 *  Output atteso (schema del modello): {image: <base64>}. Tutto il resto è rifiutato. */
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
  const out = await withTimeout(env.AI.run(cfg.model, { multipart: { body: body.body, contentType: body.headers.get("content-type") } }), cfg.timeoutMs);
  return parseModelOutput(out, v.params);
}
export function parseModelOutput(out, params) {
  if (!out || typeof out !== "object" || typeof out.image !== "string") throw Object.assign(new Error("risposta del modello senza campo image"), { code: "invalid_provider_output" });
  const b64 = out.image;
  if (b64.length > MAX_OUTPUT_BYTES * 1.37 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw Object.assign(new Error("immagine del modello non in base64 valido o troppo grande"), { code: "invalid_provider_output" });
  let bin; try { bin = atob(b64); } catch { throw Object.assign(new Error("base64 non decodificabile"), { code: "invalid_provider_output" }); }
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const info = inspectImage(bytes);
  if (!info) throw Object.assign(new Error("il modello non ha restituito PNG, JPEG o WebP"), { code: "invalid_provider_output" });
  if (info.w && info.h && (info.w > Math.max(2048, params.width * 1.1) || info.h > Math.max(2048, params.height * 1.1))) throw Object.assign(new Error("dimensioni dell'immagine inattese"), { code: "invalid_provider_output" });
  return { bytes, type: info.type };
}

async function createJob(request, env, cfg) {
  if (!cfg.ready) return jsonError(503, "config_incomplete", "il render non è configurato su questo server");
  if (await killed(env)) return jsonError(503, "disabled", "il render AI è momentaneamente sospeso");
  if (!(request.headers.get("content-type") || "").includes("application/json")) return jsonError(415, "unsupported_media_type", "serve application/json");
  if (num(request.headers.get("content-length"), 0) > LIMITS.maxBodyBytes) return jsonError(413, "too_large", "richiesta troppo grande");
  let body;
  try { const text = await request.text(); if (text.length > LIMITS.maxBodyBytes) return jsonError(413, "too_large", "richiesta troppo grande"); body = JSON.parse(text); }
  catch { return jsonError(400, "invalid_json", "JSON non valido"); }
  const checked = validateRenderRequest(body, { ...LIMITS, maxVariants: cfg.maxVariants });
  if (checked.error) return jsonError(checked.error.status, checked.error.code, checked.error.message);
  const v = checked.value;
  if (body.consent !== true) return jsonError(400, "consent_required", "serve il consenso all'invio delle immagini al fornitore AI");
  for (const k of ["image", "depth", "lines"]) {
    if (!v[k]) continue;
    const info = inspectImage(decodeDataUrl(v[k]).bytes);
    if (!info) return jsonError(400, "invalid_input", `${k}: il contenuto non è un'immagine PNG, JPEG o WebP`);
    if (info.w && (info.w > cfg.maxInputSide || info.h > cfg.maxInputSide)) return jsonError(400, "invalid_input", `${k}: il modello accetta immagini di riferimento fino a ${cfg.maxInputSide} px per lato`);
  }
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const isOwner = ownerOk(env, request), isTest = !isOwner && testTokenOk(env, request);
  if (cfg.turnstileOn && !isTest && !isOwner && !(await turnstileOk(env, v.turnstile, ip))) return jsonError(403, "bot_check_failed", "verifica anti-bot non superata");

  const ipHash = isOwner ? "proprietario" : isTest ? "prove-automatiche" : await sha256(ip + env.IP_SALT);
  const inputs = 1 + (v.params.use_guides ? (v.depth ? 1 : 0) + (v.lines ? 1 : 0) : 0);
  const neurons = estimateNeurons({ width: v.params.width, height: v.params.height, variants: v.params.variants, inputs }, cfg.rates);
  const day = dayKey();
  const q = await quotaCall(env, "/reserve", { ipHash, neurons, visitor: !isOwner, perIpDaily: isTest ? cfg.testDaily : cfg.perIpDaily, maxConcurrent: isOwner ? cfg.ownerConcurrent : cfg.maxConcurrent, neuronBudget: cfg.neuronBudget, globalDaily: cfg.globalDaily, visitorBudget: cfg.visitorBudget });
  if (!q.ok) {
    const msg = { quota_exceeded: `hai usato i ${cfg.perIpDaily} render disponibili oggi`, too_many_concurrent: "c'è già un render in corso: attendi che finisca", global_quota_exceeded: "limite giornaliero del servizio raggiunto", budget_exceeded: isOwner ? "quota gratuita di oggi esaurita (si rinnova all'1:00 ora italiana)" : "budget giornaliero del servizio esaurito" }[q.reason] || "quota non disponibile";
    return jsonError(429, q.reason, msg, q.reason === "too_many_concurrent" ? { "Retry-After": "30" } : { "Retry-After": String(secondsToMidnightUTC()) });
  }

  const id = newId(), now = Date.now(), ttl = { expirationTtl: cfg.retention };
  const job = { id, status: "running", mode: v.mode, created_at: new Date(now).toISOString(), expires_at: new Date(now + cfg.retention * 1000).toISOString(), provider: "Cloudflare Workers AI", model: cfg.model, generated: true, images: [], neurons_estimated: neurons };
  let failed = false;
  try {
    await env.RENDER_KV.put(`job:${id}`, JSON.stringify(job), ttl);
    for (let i = 0; i < v.params.variants; i++) {
      const { bytes, type } = await runKlein(env, cfg, v, v.params.seed + i);
      await env.RENDER_KV.put(`img:${id}:${i}`, bytes, { ...ttl, metadata: { type } });
      job.images.push(`/api/render/${id}/image/${i}`);
    }
    job.status = "succeeded";
  } catch (e) {
    failed = true; job.status = "failed"; job.error = { code: e?.code || "provider_error", message: String(e?.message || e).slice(0, 300) };
  } finally {
    await quotaCall(env, "/release", { ipHash, neurons, failed, reservedDay: day, visitor: !isOwner }).catch(() => {});
  }
  job.duration_ms = Date.now() - now;
  await env.RENDER_KV.put(`job:${id}`, JSON.stringify(job), ttl);
  console.log(JSON.stringify({ evt: "render", test: isTest || undefined, owner: isOwner || undefined, id, status: job.status, ms: job.duration_ms, neurons, day_neurons: q.neurons, day_renders: q.renders, mode: v.mode }));
  const remaining = isOwner ? Math.max(0, Math.floor((cfg.neuronBudget - q.neurons) / Math.max(1, neurons))) : Math.max(0, cfg.perIpDaily - (failed ? q.ip - 1 : q.ip));
  return json(job.status === "succeeded" ? 200 : 502, job, { Location: `/api/render/${id}`, "X-Quota-Remaining": String(remaining) });
}

async function getConfig(request, env, cfg) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0", isOwner = ownerOk(env, request);
  let usedToday = null, st = null;
  if (cfg.ready) { try { const h = isOwner ? "proprietario" : await sha256(ip + env.IP_SALT); st = await quotaCall(env, "/status", { ipHash: h, photoHash: "foto:" + h }); usedToday = st.ip; } catch {} }
  const enabled = cfg.ready && !(await killed(env));
  return json(200, {
    enabled, reason: !cfg.ready ? "config_incomplete" : enabled ? null : "disabled",
    provider: "Cloudflare Workers AI", model: cfg.model, generated: true,
    turnstile_site_key: cfg.turnstileSiteKey,
    quota: isOwner
      ? { owner: true, per_ip_daily: null, used_today: usedToday, neurons_left: st ? Math.max(0, cfg.neuronBudget - st.neurons) : null, renders_left_estimate: st ? Math.max(0, Math.floor((cfg.neuronBudget - st.neurons) / estimateNeurons({ width: 1024, height: 768, variants: 1, inputs: 3 }, cfg.rates))) : null }
      : { per_ip_daily: cfg.perIpDaily, used_today: usedToday },
    limits: { max_input_side: cfg.maxInputSide, max_side: LIMITS.maxSide, max_variants: cfg.maxVariants },
    retention_seconds: cfg.retention,
    share: { enabled: cfg.shareReady, ttl_days: SHARE.ttlDays, max_bytes: SHARE.maxBytes, turnstile: cfg.turnstileOn },
    photo: { enabled: enabled && cfg.photo.enabled, model: cfg.photo.model, detect_model: cfg.photo.detect ? cfg.photo.detectModel : null, per_ip_daily: isOwner ? null : cfg.photo.perIpDaily, used_today: st ? st.photo : null, max_side: PHOTO.maxSide,
      privacy: "La foto viene inviata a Cloudflare Workers AI solo per l'analisi e non viene conservata dal server; resta nel tuo progetto, sul tuo dispositivo." },
    privacy: "Vista, profondità, contorni, prompt e camera vengono inviati a Cloudflare Workers AI per generare l'immagine. Lavori e immagini sono cancellati dopo il periodo indicato; l'IP è conservato solo come hash per le quote giornaliere.",
  });
}

/* condivisione con il cliente: dati in KV con scadenza, limiti nel Durable Object */
async function shareApi(request, env, cfg, url) {
  const parts = url.pathname.replace(/^\/api\/share\/?/, "").split("/").filter(Boolean);
  if (parts.length > 3) return jsonError(404, "not_found", "endpoint inesistente");
  const write = request.method !== "GET";
  if (!env.RENDER_KV) return jsonError(503, "share_disabled", "la condivisione non è attiva su questo server");
  if (write && request.method !== "DELETE" && !(request.headers.get("content-type") || "").includes("application/json")) return jsonError(415, "unsupported_media_type", "serve application/json");
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const r = await handleShare({ method: request.method, parts, token: request.headers.get("x-share-token") || "", editKey: request.headers.get("x-edit-key") || "", length: num(request.headers.get("content-length"), 0), text: () => request.text() }, {
    enabled: !write || cfg.shareReady, botRequired: cfg.turnstileOn && !testTokenOk(env, request) && !ownerOk(env, request), bot: t => turnstileOk(env, t, ip),
    hit: async kind => quotaCall(env, "/hit", { key: `${kind}:${await sha256(ip + env.IP_SALT)}`, limit: ownerOk(env, request) ? null : (SHARE.limits[kind] ?? SHARE.perIpDaily), globalKey: "share-writes", globalLimit: cfg.shareDaily }),
    store: { get: k => env.RENDER_KV.get(k), put: (k, v, ttl) => env.RENDER_KV.put(k, v, { expirationTtl: Math.max(60, ttl) }), del: k => env.RENDER_KV.delete(k) },
  });
  return r.status === 204 ? new Response(null, { status: 204 }) : json(r.status, r.body);
}

/* ---------- «Da foto al 3D» ----------
   POST /api/foto {image: data URL JPEG/PNG/WebP, consent: true, turnstile}. Risposta sincrona con l'analisi
   normalizzata (shared/photo.js); la foto non viene salvata. Quote: PHOTO_PER_IP_DAILY per visitatore e
   PHOTO_GLOBAL_DAILY in totale; i Neurons stimati entrano nello stesso budget giornaliero dei render. */
async function runVision(env, cfg, image) {
  const base = { messages: photoMessages(image), max_tokens: 3000, temperature: 0.15 };
  const tries = [{ ...base, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA } }, base];
  let last;
  for (const input of tries) {
    try { return await withTimeout(env.AI.run(cfg.photo.model, input), cfg.photo.timeoutMs); }
    catch (e) { last = e; if (/timeout|non ha risposto|capacity|rate/i.test(String(e?.message))) break; }
  }
  throw last;
}
async function runDetect(env, cfg, bytes) {
  return withTimeout(env.AI.run(cfg.photo.detectModel, { image: [...bytes] }), 30000);
}
async function photoApi(request, env, cfg) {
  if (!cfg.ready || !cfg.photo.enabled) return jsonError(503, "config_incomplete", "l'analisi delle foto non è attiva su questo server");
  if (await killed(env)) return jsonError(503, "disabled", "i servizi AI sono momentaneamente sospesi");
  if (!(request.headers.get("content-type") || "").includes("application/json")) return jsonError(415, "unsupported_media_type", "serve application/json");
  if (num(request.headers.get("content-length"), 0) > PHOTO.maxBodyBytes) return jsonError(413, "too_large", "foto troppo grande: massimo 2 MB");
  let body;
  try { const text = await request.text(); if (text.length > PHOTO.maxBodyBytes) return jsonError(413, "too_large", "foto troppo grande: massimo 2 MB"); body = JSON.parse(text); }
  catch { return jsonError(400, "invalid_json", "JSON non valido"); }
  if (body?.consent !== true) return jsonError(400, "consent_required", "serve il consenso all'invio della foto al fornitore AI");
  let img;
  try { img = decodeDataUrl(body.image); } catch { return jsonError(400, "invalid_input", "image: serve una foto JPEG, PNG o WebP come data URL"); }
  const info = inspectImage(img.bytes);
  if (!info) return jsonError(400, "invalid_input", "il file non è una foto JPEG, PNG o WebP");
  if (img.bytes.length > PHOTO.maxImageBytes) return jsonError(413, "too_large", "foto troppo grande: massimo 2 MB");
  if (info.w && (Math.max(info.w, info.h) > PHOTO.maxSide || Math.min(info.w, info.h) < PHOTO.minSide)) return jsonError(400, "invalid_input", `la foto deve avere il lato lungo fino a ${PHOTO.maxSide} px e il corto almeno ${PHOTO.minSide} px`);

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const isOwner = ownerOk(env, request), isTest = !isOwner && testTokenOk(env, request);
  if (cfg.turnstileOn && !isTest && !isOwner && !(await turnstileOk(env, body.turnstile, ip))) return jsonError(403, "bot_check_failed", "verifica anti-bot non superata");
  const ipHash = "foto:" + (isOwner ? "proprietario" : isTest ? "prove-automatiche" : await sha256(ip + env.IP_SALT));
  const neurons = cfg.photo.neurons, day = dayKey();
  const q = await quotaCall(env, "/reserve", { ipHash, neurons, visitor: !isOwner, counter: "photos", perIpDaily: isTest ? cfg.testDaily : cfg.photo.perIpDaily, maxConcurrent: isOwner ? cfg.ownerConcurrent : 1, neuronBudget: cfg.neuronBudget, globalDaily: cfg.photo.globalDaily, visitorBudget: cfg.visitorBudget });
  if (!q.ok) {
    const msg = { quota_exceeded: `hai già usato l'analisi da foto disponibile oggi (${cfg.photo.perIpDaily} al giorno)`, too_many_concurrent: "c'è già un'analisi in corso: attendi che finisca", global_quota_exceeded: "limite giornaliero delle analisi da foto raggiunto: riprova domani", budget_exceeded: isOwner ? "quota gratuita di oggi esaurita (si rinnova all'1:00 ora italiana)" : "budget giornaliero del servizio esaurito" }[q.reason] || "quota non disponibile";
    return jsonError(429, q.reason, msg, q.reason === "too_many_concurrent" ? { "Retry-After": "30" } : { "Retry-After": String(secondsToMidnightUTC()) });
  }
  const t0 = Date.now(), debug = isTest && request.headers.get("x-debug") === "1";
  let failed = false, measured = null, out, err, dbg = {};
  try {
    // il rilevatore lavora in parallelo al modello con visione; se non risponde si va avanti senza
    const [vis, det] = await Promise.all([runVision(env, cfg, body.image), cfg.photo.detect ? runDetect(env, cfg, img.bytes).catch(e => ({ error: String(e?.message || e) })) : null]);
    const raw = extractJson(vis);
    if (debug) dbg.vision = { keys: vis && typeof vis === "object" ? Object.keys(vis) : typeof vis, response: typeof vis?.response === "string" ? vis.response.slice(0, 6000) : vis?.response, usage: vis?.usage };
    if (debug) dbg.detect = JSON.stringify(det).slice(0, 3000);
    measured = neuronsFromUsage(vis?.usage, cfg.photo.rate);
    const dets = det && !det.error ? parseDetections(det, info.w, info.h) : [];
    out = normalizeAnalysis(raw, dets, info.w, info.h);
  } catch (e) {
    failed = true; err = { code: e?.code || "provider_error", message: String(e?.message || e).slice(0, 300) };
  } finally {
    await quotaCall(env, "/release", { ipHash, neurons, failed, reservedDay: day, visitor: !isOwner, counter: "photos", actualNeurons: measured }).catch(() => {});
  }
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ evt: "foto", test: isTest || undefined, owner: isOwner || undefined, ok: !failed, ms, neurons, measured, items: out?.items?.length, day_neurons: q.neurons }));
  if (failed) return json(502, { error: err, ...(debug ? { debug: dbg } : {}) });
  const remaining = isOwner ? null : Math.max(0, cfg.photo.perIpDaily - q.ip);
  return json(200, { analysis: out, provider: "Cloudflare Workers AI", model: cfg.photo.model, detect_model: cfg.photo.detect ? cfg.photo.detectModel : null, generated: true, neurons_estimated: neurons, neurons_measured: measured, duration_ms: ms, remaining_today: remaining, ...(debug ? { debug: dbg } : {}) });
}

async function handleApi(request, env, url) {
  const cfg = config(env);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin && !cfg.allowedOrigins.includes(origin)) return jsonError(403, "origin_not_allowed", "origine non consentita");
  if (url.pathname === "/api/config" && request.method === "GET") return getConfig(request, env, cfg);
  if (url.pathname === "/api/share" || url.pathname.startsWith("/api/share/")) return shareApi(request, env, cfg, url);
  if (url.pathname === "/api/foto") return request.method === "POST" ? photoApi(request, env, cfg) : jsonError(405, "method_not_allowed", "usa POST /api/foto");
  const m = url.pathname.match(/^\/api\/render(?:\/([^/]+)(?:\/image\/(\d+))?)?\/?$/);
  if (!m) return jsonError(404, "not_found", "endpoint inesistente");
  const [, id, img] = m;
  if (!id) { if (request.method === "POST") return createJob(request, env, cfg); return jsonError(405, "method_not_allowed", "usa POST /api/render"); }
  if (!ID_RE.test(id)) return jsonError(400, "invalid_id", "id non valido");
  if (img != null) {
    if (request.method !== "GET") return jsonError(405, "method_not_allowed", "solo GET");
    const { value, metadata } = await env.RENDER_KV.getWithMetadata(`img:${id}:${img}`, { type: "arrayBuffer" });
    if (!value) return jsonError(404, "not_found", "immagine inesistente o scaduta");
    return new Response(value, { headers: { "Content-Type": metadata?.type || "application/octet-stream", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
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
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return jsonError(500, "internal", "errore interno");
    }
  },
};
