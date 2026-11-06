// Test del Worker e del contratto, senza Cloudflare: AI, KV, Durable Object, ASSETS e Turnstile sono finti.
// Esegui con: npm run test:unit
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { pngSize, inspectImage, parseModelOutput, QuotaGate } from "../worker/src/index.js";
import { estimateNeurons } from "../worker/src/quota.js";
import { validateRenderRequest, buildModelPrompt } from "../shared/contract.js";

const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG1_B64 = PNG1.split(",")[1];
function pngHeader(w, h) {
  const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); b[24] = 8; b[25] = 6;
  return Buffer.from(b).toString("base64");
}
function fakeKV() {
  const m = new Map();
  return { m,
    async get(k) { return m.get(k)?.v ?? null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: e.v, metadata: e.meta } : { value: null, metadata: null }; },
    async put(k, v, opts = {}) { m.set(k, { v, meta: opts.metadata, ttl: opts.expirationTtl }); },
    async delete(k) { m.delete(k); } };
}
function fakeDO(env) {
  const storage = new Map();
  const state = { storage: {
    async get(k) { return storage.get(k); },
    async put(o) { for (const [k, v] of Object.entries(o)) storage.set(k, v); },
    async list() { return new Map(storage); },
    async delete(ks) { for (const k of ks) storage.delete(k); },
    async getAlarm() { return 1; }, async setAlarm() {} } };
  const inst = new QuotaGate(state, env);
  return { storage, idFromName: n => n, get: () => ({ fetch: (u, init) => inst.fetch(new Request(u, init)) }) };
}
function env(over = {}) {
  const calls = [];
  const e = {
    calls,
    AI: { async run(model, input) { calls.push({ model, input }); return { image: PNG1_B64 }; } },
    RENDER_KV: fakeKV(),
    ASSETS: { fetch: async () => new Response("<!doctype html>editor", { headers: { "Content-Type": "text/html" } }) },
    PER_IP_DAILY: "2", GLOBAL_DAILY: "50", MAX_VARIANTS: "2", IP_SALT: "sale-di-prova-lungo-abbastanza",
    TURNSTILE_SECRET: "segreto", TURNSTILE_SITE_KEY: "0x4AAA-pubblica",
    ...over,
  };
  e.QUOTA = over.QUOTA === undefined ? fakeDO(e) : over.QUOTA;
  return e;
}
// Turnstile finto: token "ok" valido, il resto no
const realFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = async (u, init) => {
  if (String(u).includes("turnstile")) return new Response(JSON.stringify({ success: new URLSearchParams(init.body).get("response") === "ok" }));
  return realFetch(u, init); }; });
afterEach(() => { globalThis.fetch = realFetch; });

const body = (over = {}) => ({ mode: "fedele", scene: "esterni", prompt: "casa con intonaco bianco", image: PNG1, depth: PNG1, lines: PNG1, consent: true, turnstile: "ok",
  camera: { position: [20, 4, 22], target: [5, 1, 4], fov: 45 }, params: { width: 1024, height: 768, variants: 1, seed: 7, use_guides: true }, ...over });
const post = (b, headers = {}) => new Request("https://pianta.test/api/render", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(b) });
const formOf = call => new Response(call.input.multipart.body, { headers: { "Content-Type": call.input.multipart.contentType } }).formData();

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
test("stima dei Neurons per klein 4B", () => {
  const r = { outTile: 26.05, inTile: 5.37 };
  assert.equal(estimateNeurons({ width: 1024, height: 768, variants: 1, inputs: 3 }, r), 121);
  assert.equal(estimateNeurons({ width: 1920, height: 1440, variants: 2, inputs: 1 }, r), 636);
});
test("asset statici per le pagine non /api", async () => {
  const r = await worker.fetch(new Request("https://pianta.test/"), env());
  assert.equal(r.status, 200); assert.match(await r.text(), /editor/);
});
test("fail-closed: senza IP_SALT valido o senza Turnstile il render è disattivato", async () => {
  for (const over of [{ IP_SALT: undefined }, { IP_SALT: "cambia-questo-valore" }, { TURNSTILE_SECRET: undefined }, { QUOTA: null }]) {
    const e = env(over);
    const r = await worker.fetch(post(body()), e);
    assert.equal(r.status, 503, JSON.stringify(Object.keys(over))); assert.equal((await r.json()).error.code, "config_incomplete");
    assert.equal(e.calls.length, 0);
  }
  const c = await (await worker.fetch(new Request("https://pianta.test/api/config"), env({ IP_SALT: "" }))).json();
  assert.equal(c.enabled, false); assert.equal(c.reason, "config_incomplete");
});
test("ALLOW_NO_TURNSTILE vale solo se esplicito", async () => {
  const r = await worker.fetch(post(body({ turnstile: undefined })), env({ TURNSTILE_SECRET: undefined, TURNSTILE_SITE_KEY: undefined, ALLOW_NO_TURNSTILE: "1" }));
  assert.equal(r.status, 200);
});
test("/api/config dichiara fornitore, modello, quota e chiave pubblica Turnstile", async () => {
  const c = await (await worker.fetch(new Request("https://pianta.test/api/config", { headers: { "cf-connecting-ip": "1.2.3.4" } }), env())).json();
  assert.equal(c.enabled, true); assert.equal(c.model, "@cf/black-forest-labs/flux-2-klein-4b"); assert.equal(c.turnstile_site_key, "0x4AAA-pubblica");
  assert.equal(c.quota.per_ip_daily, 2); assert.equal(c.quota.used_today, 0); assert.equal(c.generated, true); assert.match(c.privacy, /Cloudflare/);
});
test("serve il consenso e un token Turnstile valido", async () => {
  const e = env();
  const a = await worker.fetch(post(body({ consent: false })), e); assert.equal((await a.json()).error.code, "consent_required");
  const b = await worker.fetch(post(body({ turnstile: "falso" })), e); assert.equal((await b.json()).error.code, "bot_check_failed");
  assert.equal(e.calls.length, 0);
});
test("POST crea il lavoro, chiama klein in multipart e salva l'immagine con TTL", async () => {
  const e = env();
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 200); assert.equal(r.headers.get("x-quota-remaining"), "1");
  const j = await r.json();
  assert.equal(j.status, "succeeded"); assert.equal(j.generated, true); assert.equal(j.images.length, 1); assert.equal(j.neurons_estimated, 121);
  assert.equal(e.calls[0].model, "@cf/black-forest-labs/flux-2-klein-4b");
  const form = await formOf(e.calls[0]);
  assert.equal(form.get("width"), "1024"); assert.equal(form.get("seed"), "7");
  assert.ok(form.get("input_image_0")); assert.ok(form.get("input_image_1")); assert.ok(form.get("input_image_2"));
  for (const [k, v] of e.RENDER_KV.m) if (k.startsWith("job:") || k.startsWith("img:")) assert.equal(v.ttl, 3600, k);
  const img = await worker.fetch(new Request(`https://pianta.test${j.images[0]}`), e);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal((await worker.fetch(new Request(`https://pianta.test/api/render/${j.id}`, { method: "DELETE" }), e)).status, 204);
  assert.equal((await worker.fetch(new Request(`https://pianta.test/api/render/${j.id}`), e)).status, 404);
});
test("senza guide invia solo la vista", async () => {
  const e = env();
  await worker.fetch(post(body({ params: { width: 512, height: 512, use_guides: false } })), e);
  const form = await formOf(e.calls[0]);
  assert.ok(form.get("input_image_0")); assert.equal(form.get("input_image_1"), null);
});
test("quota per IP al giorno e Retry-After", async () => {
  const e = env();
  assert.equal((await worker.fetch(post(body()), e)).status, 200);
  assert.equal((await worker.fetch(post(body()), e)).status, 200);
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 429); assert.equal((await r.json()).error.code, "quota_exceeded"); assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal(e.calls.length, 2);
});
test("tetto di spesa in Neurons: rifiuta prima di chiamare il modello", async () => {
  const e = env({ NEURON_DAILY_BUDGET: "200", PER_IP_DAILY: "10" });
  assert.equal((await worker.fetch(post(body()), e)).status, 200);                                  // 121
  const r = await worker.fetch(post(body(), { "cf-connecting-ip": "9.9.9.9" }), e);                  // 242 > 200
  assert.equal((await r.json()).error.code, "budget_exceeded"); assert.equal(e.calls.length, 1);
});
test("tetto globale di richieste", async () => {
  const e = env({ GLOBAL_DAILY: "1", PER_IP_DAILY: "10" });
  await worker.fetch(post(body()), e);
  const r = await worker.fetch(post(body(), { "cf-connecting-ip": "5.6.7.8" }), e);
  assert.equal((await r.json()).error.code, "global_quota_exceeded");
});
test("un solo lavoro alla volta per IP", async () => {
  let release; const slow = new Promise(r => release = r);
  const e = env({ PER_IP_DAILY: "5", AI: { async run() { await slow; return { image: PNG1_B64 }; } } });
  const first = worker.fetch(post(body()), e);
  await new Promise(r => setTimeout(r, 20));
  const second = await worker.fetch(post(body()), e);
  assert.equal(second.status, 429); assert.equal((await second.json()).error.code, "too_many_concurrent");
  release(); assert.equal((await first).status, 200);
  assert.equal((await worker.fetch(post(body()), e)).status, 200);
});
test("kill switch da variabile e da KV", async () => {
  assert.equal((await worker.fetch(post(body()), env({ KILL_SWITCH: "1" }))).status, 503);
  const e = env(); await e.RENDER_KV.put("config:kill", "1");
  assert.equal((await worker.fetch(post(body()), e)).status, 503);
  assert.equal((await (await worker.fetch(new Request("https://pianta.test/api/config"), e)).json()).enabled, false);
  assert.equal(e.calls.length, 0);
});
test("rifiuta origini estranee, contenuti non immagine e riferimenti oltre 512 px senza consumare quota", async () => {
  const e = env();
  assert.equal((await worker.fetch(post(body(), { Origin: "https://altro.example" }), e)).status, 403);
  const big = await worker.fetch(post(body({ image: "data:image/png;base64," + pngHeader(1024, 1024) })), e);
  assert.equal(big.status, 400); assert.match((await big.json()).error.message, /512 px/);
  const fake = await worker.fetch(post(body({ image: "data:image/png;base64," + Buffer.from("non sono un png, solo testo lungo abbastanza").toString("base64") })), e);
  assert.equal(fake.status, 400); assert.match((await fake.json()).error.message, /non è un'immagine/);
  assert.equal([...e.QUOTA.storage.keys()].length, 0);
});
test("output del modello: accetta solo base64 di PNG/JPEG/WebP", () => {
  assert.equal(parseModelOutput({ image: PNG1_B64 }, { width: 512, height: 512 }).type, "image/png");
  for (const bad of [null, {}, { image: 42 }, { images: [PNG1_B64] }, { image: "!!!" }, { image: Buffer.from("<html>errore</html> e altro testo").toString("base64") }, { image: pngHeader(9000, 9000) }])
    assert.throws(() => parseModelOutput(bad, { width: 512, height: 512 }), e => e.code === "invalid_provider_output");
});
test("errore del modello → failed, 502, quota restituita ma Neurons trattenuti", async () => {
  const e = env({ PER_IP_DAILY: "1", AI: { async run() { throw new Error("capacità esaurita"); } } });
  const r = await worker.fetch(post(body()), e);
  assert.equal(r.status, 502); const j = await r.json(); assert.equal(j.status, "failed"); assert.equal(j.error.code, "provider_error");
  const day = [...e.QUOTA.storage.keys()].find(k => k.endsWith(":neurons"));
  assert.equal(e.QUOTA.storage.get(day), 121);
  e.AI = { async run() { return { image: PNG1_B64 }; } };
  assert.equal((await worker.fetch(post(body()), e)).status, 200);   // la quota dell'utente era stata restituita
});
test("risposta del modello non valida → failed con codice dedicato", async () => {
  const e = env({ AI: { async run() { return { image: "QUJDRA==" } } } });
  const j = await (await worker.fetch(post(body()), e)).json();
  assert.equal(j.status, "failed"); assert.equal(j.error.code, "invalid_provider_output");
});
test("timeout del modello", async () => {
  const e = env({ PROVIDER_TIMEOUT_MS: "30", AI: { run: () => new Promise(() => {}) } });
  const j = await (await worker.fetch(post(body()), e)).json();
  assert.equal(j.status, "failed"); assert.match(j.error.message, /non ha risposto/);
});
test("inspectImage riconosce PNG e JPEG con dimensioni", () => {
  assert.deepEqual(pngSize(new Uint8Array(Buffer.from(pngHeader(640, 480), "base64"))), { w: 640, h: 480 });
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(inspectImage(jpg), { type: "image/jpeg", w: 640, h: 480 });
});
