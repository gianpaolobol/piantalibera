// Test del Worker e del contratto, senza Cloudflare: AI, KV e ASSETS sono finti.
// Esegui con: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { pngSize } from "../worker/src/index.js";
import { validateRenderRequest, buildModelPrompt } from "../shared/contract.js";

// PNG 1x1 valido
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// intestazione PNG che dichiara 1024x1024 (per il controllo del lato massimo)
function pngHeader(w, h) {
  const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); b[24] = 8; b[25] = 6;
  return "data:image/png;base64," + Buffer.from(b).toString("base64");
}

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, opts) { const e = m.get(k); if (!e) return null; return opts?.type === "arrayBuffer" ? e.v : e.v; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: e.v, metadata: e.meta } : { value: null, metadata: null }; },
    async put(k, v, opts = {}) { m.set(k, { v, meta: opts.metadata }); },
    async delete(k) { m.delete(k); },
  };
}
function env(over = {}) {
  const calls = [];
  return {
    calls,
    AI: { async run(model, input) { calls.push({ model, input }); return { image: PNG1.split(",")[1] }; } },
    RENDER_KV: fakeKV(),
    ASSETS: { fetch: async () => new Response("<!doctype html>editor", { headers: { "Content-Type": "text/html" } }) },
    PER_IP_DAILY: "2", GLOBAL_DAILY: "50", MAX_VARIANTS: "2", IP_SALT: "test",
    ...over,
  };
}
const body = (over = {}) => ({ mode: "fedele", scene: "esterni", prompt: "casa con intonaco bianco", image: PNG1, depth: PNG1, lines: PNG1,
  camera: { position: [20, 4, 22], target: [5, 1, 4], fov: 45 }, params: { width: 1024, height: 768, variants: 1, seed: 7, use_guides: true }, ...over });
const post = (b, headers = {}) => new Request("https://pianta.test/api/render", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(b) });

test("contratto: accetta una richiesta valida e normalizza i parametri", () => {
  const r = validateRenderRequest(body());
  assert.ok(r.value); assert.equal(r.value.params.width, 1024); assert.equal(r.value.params.use_guides, true);
});
test("contratto: rifiuta mode, immagine e dimensioni non valide", () => {
  assert.equal(validateRenderRequest(body({ mode: "x" })).error.code, "invalid_input");
  assert.equal(validateRenderRequest(body({ image: "http://esempio/a.png" })).error.code, "invalid_input");
  assert.equal(validateRenderRequest(body({ params: { width: 4000, height: 768 } })).error.code, "invalid_input");
  assert.equal(validateRenderRequest(body({ params: { variants: 5 } })).error.code, "invalid_input");
});
test("prompt: la modalità fedele chiede di conservare la geometria e cita le guide", () => {
  const p = buildModelPrompt(validateRenderRequest(body()).value, { depth: 1, lines: 2 });
  assert.match(p, /Keep exactly the same camera/); assert.match(p, /Image 1 is a depth map/); assert.match(p, /Image 2 is an edge map/);
});
test("worker: le pagine non /api vanno agli asset statici", async () => {
  const r = await worker.fetch(new Request("https://pianta.test/"), env());
  assert.equal(r.status, 200); assert.match(await r.text(), /editor/);
});
test("worker: POST crea il lavoro, chiama klein in multipart e salva l'immagine", async () => {
  const e = env();
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.status, "succeeded"); assert.equal(j.images.length, 1); assert.match(j.images[0], /^\/api\/render\/[a-f0-9]{32}\/image\/0$/);
  assert.equal(e.calls[0].model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.ok(e.calls[0].input.multipart.contentType.startsWith("multipart/form-data"));
  const form = await new Response(e.calls[0].input.multipart.body, { headers: { "Content-Type": e.calls[0].input.multipart.contentType } }).formData();
  assert.equal(form.get("width"), "1024"); assert.equal(form.get("seed"), "7");
  assert.ok(form.get("input_image_0")); assert.ok(form.get("input_image_1")); assert.ok(form.get("input_image_2"));
  const st = await worker.fetch(new Request(`https://pianta.test/api/render/${j.id}`), e);
  assert.equal((await st.json()).status, "succeeded");
  const img = await worker.fetch(new Request(`https://pianta.test${j.images[0]}`), e);
  assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/png");
  const del = await worker.fetch(new Request(`https://pianta.test/api/render/${j.id}`, { method: "DELETE" }), e);
  assert.equal(del.status, 204);
  assert.equal((await worker.fetch(new Request(`https://pianta.test/api/render/${j.id}`), e)).status, 404);
});
test("worker: senza guide invia solo la vista", async () => {
  const e = env();
  await worker.fetch(post(body({ params: { width: 512, height: 512, use_guides: false } })), e);
  const form = await new Response(e.calls[0].input.multipart.body, { headers: { "Content-Type": e.calls[0].input.multipart.contentType } }).formData();
  assert.ok(form.get("input_image_0")); assert.equal(form.get("input_image_1"), null);
});
test("worker: quota per IP al giorno", async () => {
  const e = env();
  assert.equal((await worker.fetch(post(body()), e)).status, 200);
  assert.equal((await worker.fetch(post(body()), e)).status, 200);
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 429); assert.equal((await r.json()).error.code, "quota_exceeded"); assert.ok(Number(r.headers.get("retry-after")) > 0);
});
test("worker: tetto globale giornaliero", async () => {
  const e = env({ GLOBAL_DAILY: "1", PER_IP_DAILY: "10" });
  await worker.fetch(post(body()), e);
  const r = await worker.fetch(post(body(), { "cf-connecting-ip": "5.6.7.8" }), e);
  assert.equal((await r.json()).error.code, "global_quota_exceeded");
});
test("worker: kill switch da variabile e da KV", async () => {
  assert.equal((await worker.fetch(post(body()), env({ KILL_SWITCH: "1" }))).status, 503);
  const e = env(); await e.RENDER_KV.put("config:kill", "1");
  assert.equal((await worker.fetch(post(body()), e)).status, 503);
  assert.equal(e.calls.length, 0);
});
test("worker: blocca origini estranee e immagini oltre 512 px senza consumare quota", async () => {
  const e = env();
  assert.equal((await worker.fetch(post(body(), { Origin: "https://altro.example" }), e)).status, 403);
  const big = await worker.fetch(post(body({ image: pngHeader(1024, 1024) })), e);
  assert.equal(big.status, 400); assert.match((await big.json()).error.message, /512 px/);
  assert.equal([...e.RENDER_KV.m.keys()].filter(k => k.startsWith("q:")).length, 0);
});
test("worker: errore del modello → lavoro failed e 502", async () => {
  const e = env({ AI: { async run() { throw new Error("capacità esaurita"); } } });
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 502); const j = await r.json(); assert.equal(j.status, "failed"); assert.equal(j.error.code, "provider_error");
});
test("worker: Turnstile obbligatorio se configurato", async () => {
  const e = env({ TURNSTILE_SECRET: "x" });
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 403); assert.equal((await r.json()).error.code, "bot_check_failed");
});
test("pngSize legge l'intestazione", () => {
  const d = pngHeader(640, 480).split(",")[1];
  assert.deepEqual(pngSize(new Uint8Array(Buffer.from(d, "base64"))), { w: 640, h: 480 });
});
