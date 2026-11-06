// Server locale: motore di prova e motore ComfyUI (con un ComfyUI finto che risponde come quello vero).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillWorkflow, isApiWorkflow } from "../server/comfy-workflow.mjs";

const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG1.split(",")[1], "base64");
// estratto del workflow «Flux.2 Klein 4B image edit» in formato API (nodi principali)
const WF = {
  "6": { class_type: "CLIPTextEncode", inputs: { text: "testo di esempio", clip: ["38", 0] } },
  "7": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["6", 0] } },
  "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "flux2" } },
  "25": { class_type: "RandomNoise", inputs: { noise_seed: 42 } },
  "47": { class_type: "EmptyFlux2LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
  "76": { class_type: "LoadImage", inputs: { image: "a.png" } },
  "81": { class_type: "LoadImage", inputs: { image: "b.png" } },
  "99": { class_type: "CFGGuider", inputs: { positive: ["6", 0], negative: ["7", 0], cfg: 1 } },
};
const servers = [];
after(() => servers.forEach(s => s.kill ? s.kill() : s.close()));
const startLocal = async (port, env) => {
  const p = spawn(process.execPath, ["server/local-server.mjs"], { env: { ...process.env, PORT: String(port), ...env }, stdio: "ignore" }); servers.push(p);
  for (let i = 0; i < 50; i++){ try { await fetch(`http://127.0.0.1:${port}/api/config`); return `http://127.0.0.1:${port}`; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error("il server locale non parte");
};
const body = (over = {}) => JSON.stringify({ mode: "fedele", prompt: "casa", image: PNG1, depth: PNG1, lines: PNG1, consent: true, params: { width: 768, height: 512, seed: 7, use_guides: true }, ...over });

test("workflow: immagini nei LoadImage, prompt nel positivo, seed e dimensioni", () => {
  assert.equal(isApiWorkflow(WF), true); assert.equal(isApiWorkflow({ nodes: [], links: [] }), false);
  const { wf, loads } = fillWorkflow(WF, { images: ["v.png", "p.png", "c.png"], prompt: "PROMPT", seed: 5, width: 768, height: 512 });
  assert.equal(loads, 2); assert.equal(wf["76"].inputs.image, "v.png"); assert.equal(wf["81"].inputs.image, "p.png");
  assert.equal(wf["6"].inputs.text, "PROMPT"); assert.equal(wf["25"].inputs.noise_seed, 5);
  assert.deepEqual([wf["47"].inputs.width, wf["47"].inputs.height], [768, 512]);
  assert.equal(WF["6"].inputs.text, "testo di esempio", "l'originale non cambia");
  const one = fillWorkflow(WF, { images: ["v.png"], prompt: "x", seed: 1, width: 512, height: 512 }).wf;
  assert.equal(one["81"].inputs.image, "v.png", "con una sola immagine si ripete la vista");
});

test("motore di prova: config, consenso, lavoro con la vista restituita", async () => {
  const u = await startLocal(8781, {});
  const c = await (await fetch(u + "/api/config")).json(); assert.equal(c.mock, true); assert.equal(c.generated, false);
  assert.equal((await fetch(u + "/")).headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal((await (await fetch(u + "/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ consent: false }) })).json()).error.code, "consent_required");
  const j = await (await fetch(u + "/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() })).json();
  await new Promise(r => setTimeout(r, 1700));
  const s = await (await fetch(`${u}/api/render/${j.id}`)).json(); assert.equal(s.status, "succeeded"); assert.equal(s.images[0], PNG1);
});

test("motore ComfyUI: carica le immagini, accoda il workflow, restituisce il risultato", async () => {
  const seen = { uploads: [], prompt: null };
  const fake = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks);
    if (req.url === "/upload/image"){ const name = /filename="([^"]+)"/.exec(raw.toString("latin1"))[1]; seen.uploads.push(name); res.end(JSON.stringify({ name, subfolder: "", type: "input" })); return; }
    if (req.url === "/prompt"){ seen.prompt = JSON.parse(raw).prompt; res.end(JSON.stringify({ prompt_id: "p1", number: 1 })); return; }
    if (req.url === "/history/p1"){ res.end(JSON.stringify({ p1: { status: { status_str: "success", completed: true }, outputs: { "9": { images: [{ filename: "flux2_00001_.png", subfolder: "", type: "output" }] } } } })); return; }
    if (req.url.startsWith("/view?filename=flux2_00001_.png")){ res.writeHead(200, { "Content-Type": "image/png" }); res.end(PNG_BYTES); return; }
    res.writeHead(404); res.end();
  }).listen(8189); servers.push(fake);
  const dir = mkdtempSync(join(tmpdir(), "pl-wf-")), wfPath = join(dir, "workflow-api.json"); writeFileSync(wfPath, JSON.stringify(WF));
  try {
    const u = await startLocal(8782, { COMFYUI_URL: "http://127.0.0.1:8189", COMFYUI_WORKFLOW: wfPath });
    const c = await (await fetch(u + "/api/config")).json(); assert.equal(c.generated, true); assert.match(c.provider, /GPU locale/);
    const j = await (await fetch(u + "/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() })).json();
    let s; for (let i = 0; i < 30; i++){ await new Promise(r => setTimeout(r, 300)); s = await (await fetch(`${u}/api/render/${j.id}`)).json(); if (s.status !== "queued" && s.status !== "running") break; }
    assert.equal(s.status, "succeeded", JSON.stringify(s));
    assert.equal(seen.uploads.length, 3); assert.match(seen.uploads[0], /_vista\.png$/);
    assert.equal(seen.prompt["76"].inputs.image, seen.uploads[0]); assert.match(seen.prompt["6"].inputs.text, /Keep exactly the same camera/);
    assert.equal(seen.prompt["25"].inputs.noise_seed, 7);
    const img = await fetch(u + s.images[0]); assert.equal(img.headers.get("content-type"), "image/png"); assert.equal(Buffer.from(await img.arrayBuffer()).length, PNG_BYTES.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("motore ComfyUI spento: errore chiaro", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pl-wf-")), wfPath = join(dir, "w.json"); writeFileSync(wfPath, JSON.stringify(WF));
  try {
    const u = await startLocal(8783, { COMFYUI_URL: "http://127.0.0.1:8199", COMFYUI_WORKFLOW: wfPath });
    const j = await (await fetch(u + "/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() })).json();
    let s; for (let i = 0; i < 30; i++){ await new Promise(r => setTimeout(r, 200)); s = await (await fetch(`${u}/api/render/${j.id}`)).json(); if (s.status === "failed") break; }
    assert.equal(s.status, "failed"); assert.match(s.error.message, /ComfyUI non risponde/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
