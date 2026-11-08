// «Da foto al 3D»: contratto condiviso (shared/photo.js) ed endpoint /api/foto del Worker, con AI finta.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { QuotaGate } from "../worker/src/index.js";
import { normalizeAnalysis, extractJson, parseDetections, neuronsFromUsage, CATEGORIES, COCO, PHOTO_SCHEMA } from "../shared/photo.js";

// JPEG minimo valido nell'intestazione: SOI + SOF0 con dimensioni 1024×768
function jpeg(w = 1024, h = 768) {
  const b = Buffer.alloc(40); b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]);
  return "data:image/jpeg;base64," + b.toString("base64");
}
const RAW = {
  scene: "interior", room_type: "soggiorno",
  camera: { hfov_deg: 70, pitch_deg: -3 },
  back_wall: { floor_left: [180, 720], floor_right: [820, 715], ceiling_left: [190, 120], ceiling_right: [810, 125], ceiling_visible: true },
  room: { width_m: 5, depth_m: 6, height_m: 2.8 },
  materials: { floor: "parquet", floor_color: "#a07850", wall_color: "eee", ceiling_color: "#ffffff" },
  lighting: { time: "day", lamps_on: false, color_temperature_k: 3000 },
  items: [
    { category: "divano", label: "Divano grigio", box: [300, 520, 700, 760], width_m: 2.3, depth_m: .95, height_m: .85, facing: "camera", against_wall: "back" },
    { category: "finestra", box: [600, 200, 760, 520] },
    { category: "lampadario", box: [470, 20, 530, 200] },
    { category: "fantasia<script>", label: "<b>x</b>", box: [10, 10, 50, 50] },
    { category: "sedia", box: "rotto" },
  ],
};

test("analisi: numeri limitati, categorie note, colori normalizzati, spigoli della parete di fondo", () => {
  const a = normalizeAnalysis(RAW, {}, 1024, 768);
  assert.equal(a.scene, "interior"); assert.equal(a.materials.wall_color, "#eeeeee"); assert.equal(a.lighting.kelvin, 3000);
  assert.deepEqual(a.back_wall.fl, [.18, .72]);
  assert.equal(a.items.length, 4);                                  // la sedia senza riquadro valido è scartata
  const other = a.items.find(i => i.category === "altro"); assert.ok(other); assert.doesNotMatch(other.label, /[<>]/);
  const sofa = a.items.find(i => i.category === "divano"); assert.equal(sofa.w, 2.3); assert.equal(sofa.against, "back");
  assert.deepEqual(sofa.box, [.3, .52, .7, .76]);
});
test("analisi: i riquadri del rilevatore sostituiscono quelli del modello e aggiungono quelli mancanti se molto sicuri", () => {
  const dets = [{ label: "couch", score: .99, box: [.29, .53, .71, .77] }, { label: "chair", score: .95, box: [.05, .6, .15, .9] }, { label: "chair", score: .65, box: [.8, .6, .9, .9] }];
  const a = normalizeAnalysis(RAW, dets, 1024, 768);
  const sofa = a.items.find(i => i.category === "divano"); assert.equal(sofa.source, "rilevatore"); assert.equal(sofa.w, 2.3); assert.deepEqual(sofa.box, [.29, .53, .71, .77]);
  assert.equal(a.items.filter(i => i.category === "sedia").length, 1);          // la sedia poco sicura e senza corrispondenza non entra
  assert.equal(a.items.find(i => i.category === "finestra").source, "modello");
});
test("analisi: gli angoli della foto non sono spigoli della parete", () => {
  assert.equal(normalizeAnalysis({ ...RAW, back_wall: { floor_left: [0, 1000], floor_right: [1000, 1000], ceiling_left: [0, 0], ceiling_right: [1000, 0] } }).back_wall, null);
});
test("analisi: senza spigoli plausibili la parete di fondo resta da indicare a mano", () => {
  assert.equal(normalizeAnalysis({ ...RAW, back_wall: { floor_left: [800, 700], floor_right: [200, 700] } }).back_wall, null);
  assert.throws(() => normalizeAnalysis(null), /non ha descritto/);
});
test("lettura delle risposte: JSON in testo, in blocchi ``` e già oggetto; riquadri in più formati", () => {
  assert.deepEqual(extractJson({ response: "Ecco:\n```json\n{\"a\":1}\n```" }), { a: 1 });
  assert.deepEqual(extractJson({ response: { a: 2 } }), { a: 2 });
  assert.equal(extractJson({ response: "niente" }), null);
  const d = parseDetections([{ score: .99, label: "couch", box: { xmin: 512, ymin: 384, xmax: 1024, ymax: 768 } }, { score: .99, label: "clock", box: { xmin: 1, ymin: 1, xmax: 9, ymax: 9 } }, { score: .3, label: "chair", box: { xmin: 1, ymin: 1, xmax: 90, ymax: 90 } }], 1024, 768);
  assert.deepEqual(d, [{ label: "couch", score: .99, box: [.5, .5, 1, 1] }]);
});
test("classi COCO: solo categorie esistenti; Neurons dichiarati o calcolati dai token", () => {
  assert.ok(Object.values(COCO).flat().every(c => CATEGORIES[c]));
  assert.equal(neuronsFromUsage({ prompt_tokens: 1, neurons: 115.3 }, { in: 0, out: 0 }), 116);
  assert.equal(neuronsFromUsage({ prompt_tokens: 3000, completion_tokens: 1000 }, { in: 24545, out: 77273 }), 151);
  assert.ok(PHOTO_SCHEMA.properties.items.items.properties.category.enum.includes("lampadario"));
});

/* ---------- endpoint del Worker ---------- */
function fakeDO(env) {
  const storage = new Map();
  const state = { storage: { async get(k) { return storage.get(k); }, async put(o) { for (const [k, v] of Object.entries(o)) storage.set(k, v); }, async list() { return new Map(storage); }, async delete(ks) { for (const k of ks) storage.delete(k); }, async getAlarm() { return 1; }, async setAlarm() {} } };
  const inst = new QuotaGate(state, env);
  return { storage, idFromName: n => n, get: () => ({ fetch: (u, init) => inst.fetch(new Request(u, init)) }) };
}
function env(over = {}) {
  const calls = [];
  const e = { calls,
    AI: { async run(model, input) { calls.push({ model, input });
      if (model.includes("detr")) return [{ score: .99, label: "couch", box: { xmin: 297, ymin: 407, xmax: 727, ymax: 591 } }];
      return { response: JSON.stringify(RAW), usage: { prompt_tokens: 3000, completion_tokens: 1200 } }; } },
    RENDER_KV: { async get() { return null; }, async put() {} },
    IP_SALT: "sale-di-prova-lungo-abbastanza", TURNSTILE_SECRET: "segreto", TURNSTILE_SITE_KEY: "0x4AAA-pubblica", OWNER_TOKEN: "proprietario-1234567890", ...over };
  e.QUOTA = fakeDO(e); return e;
}
const realFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = async (u, init) => String(u).includes("turnstile") ? new Response(JSON.stringify({ success: new URLSearchParams(init.body).get("response") === "ok" })) : realFetch(u, init); });
afterEach(() => { globalThis.fetch = realFetch; });
const post = (b, headers = {}, ip = "1.2.3.4") => new Request("https://pianta.test/api/foto", { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": ip, ...headers }, body: JSON.stringify(b) });
const ok = { image: jpeg(), consent: true, turnstile: "ok" };

test("/api/foto: analisi completa, rilevatore chiamato per le categorie trovate, foto non salvata", async () => {
  const e = env(); const r = await worker.fetch(post(ok), e); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.analysis.scene, "interior");
  assert.equal(j.analysis.items.find(i => i.category === "divano").source, "rilevatore");
  const det = e.calls.filter(c => c.model.includes("detr"));
  assert.equal(det.length, 1); assert.ok(Array.isArray(det[0].input.image) && det[0].input.image[0] === 0xff);
  assert.ok(e.calls[0].input.messages[1].content.some(p => p.type === "image_url"));
  assert.equal(j.neurons_measured, Math.ceil((3000 * 24545 + 1200 * 77273) / 1e6));
  assert.equal(j.remaining_today, 0);
});
test("/api/foto: consenso, formato e Turnstile obbligatori", async () => {
  const e = env();
  assert.equal((await worker.fetch(post({ ...ok, consent: false }), e)).status, 400);
  assert.equal((await worker.fetch(post({ ...ok, image: "data:image/png;base64,AAAA" }), e)).status, 400);
  assert.equal((await worker.fetch(post({ ...ok, image: jpeg(4000, 3000) }), e)).status, 400);
  assert.equal((await worker.fetch(post({ ...ok, turnstile: "no" }), e)).status, 403);
  assert.equal(e.calls.length, 0);
});
test("/api/foto: una analisi al giorno per visitatore e 10 in totale; il proprietario senza limite per visitatore", async () => {
  const e = env();
  assert.equal((await worker.fetch(post(ok), e)).status, 200);
  const r2 = await worker.fetch(post(ok), e); assert.equal(r2.status, 429); assert.equal((await r2.json()).error.code, "quota_exceeded");
  for (let i = 0; i < 9; i++) assert.equal((await worker.fetch(post(ok, {}, "9.9.9." + i), e)).status, 200);
  assert.equal((await worker.fetch(post(ok, {}, "8.8.8.8"), e)).status, 429);
  for (let i = 0; i < 3; i++) assert.equal((await worker.fetch(post({ image: ok.image, consent: true }, { "x-owner-token": "proprietario-1234567890" }), e)).status, 200);
});
test("/api/foto: se il modello fallisce la quota del visitatore viene restituita", async () => {
  const e = env({ AI: { async run() { throw new Error("guasto"); } } });
  const r = await worker.fetch(post(ok), e); assert.equal(r.status, 502);
  const e2 = env(); e2.QUOTA = e.QUOTA;
  assert.equal((await worker.fetch(post(ok), e2)).status, 200);
});
test("/api/foto: se lo schema JSON non è accettato riprova senza, e i rilevamenti falliti non bloccano", async () => {
  let n = 0;
  const e = env({ AI: { async run(model, input) { if (model.includes("detr")) throw new Error("rilevatore giù"); n++; if (input.response_format) throw new Error("response_format non supportato"); return { response: "```json\n" + JSON.stringify(RAW) + "\n```" }; } } });
  const r = await worker.fetch(post(ok), e); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(n, 2); assert.equal(j.analysis.items.find(i => i.category === "divano").source, "modello");
});
test("/api/config: dichiara l'analisi da foto e le quote", async () => {
  const j = await (await worker.fetch(new Request("https://pianta.test/api/config", { headers: { "cf-connecting-ip": "1.2.3.4" } }), env())).json();
  assert.equal(j.photo.enabled, true); assert.equal(j.photo.per_ip_daily, 1); assert.equal(j.photo.used_today, 0);
});
