// Diagnosi «Da foto al 3D» sui modelli veri di Workers AI (REST API dell'account, nessun deploy).
// Confronto dei modelli (8/11/2026): Llama 4 Scout + DETR scelti; Moondream 3.1 risponde vuoto via API,
// Qwen 3.8 e Mistral Small 3.1 ragionano o si ripetono fino al limite, Gemma 4 impiega 2 minuti ed è
// instabile, GLM-5.3 Flash non è disponibile nel piano gratuito di Workers.
// Scarica alcune foto di interni da Wikimedia Commons (solo per la prova, non vengono ripubblicate),
// le manda al modello con visione e al rilevatore come fa /api/foto e stampa risposte grezze, tempi,
// token e l'analisi normalizzata. Uso (GitHub Actions): CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
import { photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, parseDetections, neuronsFromUsage } from "../shared/photo.js";
import { writeFileSync, mkdirSync } from "node:fs";

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const VISION = process.env.PHOTO_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct", DETECT = process.env.DETECT_MODEL || "@cf/facebook/detr-resnet-50";
const N = Number(process.env.N || 3), OUT = process.env.OUT || "diagnosi-foto";
mkdirSync(OUT, { recursive: true });
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };

async function photos() {
  const cats = (process.env.CATS || "Category:Living_rooms_in_the_United_States,Category:Kitchens,Category:Bedrooms").split(",");
  const out = [];
  for (const c of cats) {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(c)}&gcmtype=file&gcmlimit=30&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024`;
    const j = await (await fetch(u, { headers: UA })).json();
    const files = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height * 1.2);
    const f = files[Math.min(Number(process.env.IDX || 0), files.length - 1)];
    if (f) out.push({ title: f.title, url: f.imageinfo[0].thumburl, page: f.imageinfo[0].descriptionurl, w: f.imageinfo[0].thumbwidth, h: f.imageinfo[0].thumbheight });
    if (out.length >= N) break;
  }
  return out;
}
async function run(model, input) {
  const t = Date.now();
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const j = await r.json().catch(() => ({}));
  return { ms: Date.now() - t, status: r.status, ok: j.success !== false && r.ok, result: j.result, errors: j.errors };
}
const summary = [];
for (const p of await photos()) {
  const buf = Buffer.from(await (await fetch(p.url, { headers: UA })).arrayBuffer());
  const image = "data:image/jpeg;base64," + buf.toString("base64");
  console.log(`\n=== ${p.title} (${Math.round(buf.length / 1024)} KB) ${p.page}`);
  let vis = await run(VISION, { messages: photoMessages(image), max_tokens: 3000, temperature: 0.15, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA } });
  console.log(`vision+schema: HTTP ${vis.status} ${vis.ms} ms`, vis.ok ? "" : JSON.stringify(vis.errors).slice(0, 400));
  if (!vis.ok) { vis = await run(VISION, { messages: photoMessages(image), max_tokens: 3000, temperature: 0.15 }); console.log(`vision senza schema: HTTP ${vis.status} ${vis.ms} ms`, vis.ok ? "" : JSON.stringify(vis.errors).slice(0, 400)); }
  const raw = extractJson(vis.result);
  console.log("chiavi:", vis.result && Object.keys(vis.result), "usage:", JSON.stringify(vis.result?.usage));
  console.log("risposta:", (typeof vis.result?.response === "string" ? vis.result.response : JSON.stringify(vis.result?.response))?.slice(0, 3500));
  const d = await run(DETECT, { image: [...buf] });
  console.log(`rilevatore: HTTP ${d.status} ${d.ms} ms`, JSON.stringify(d.result ?? d.errors).slice(0, 900));
  const dets = d.ok ? parseDetections(d.result, p.w, p.h) : [], dn = 0;
  let a = null; try { a = normalizeAnalysis(raw, dets, p.w, p.h); } catch (e) { console.log("normalizzazione fallita:", e.message); }
  const vn = neuronsFromUsage(vis.result?.usage, { in: 24545, out: 77273 });
  console.log("analisi:", JSON.stringify(a).slice(0, 2500));
  summary.push({ title: p.title, page: p.page, url: p.url, vision_ms: vis.ms, neurons_vision: vn, neurons_detect: dn, items: a?.items?.length, back_wall: a?.back_wall, analysis: a });
}
writeFileSync(`${OUT}/riepilogo.json`, JSON.stringify(summary, null, 1));
console.log("\n=== RIEPILOGO"); for (const s of summary) console.log(`${s.title}: ${s.items} elementi, ${s.vision_ms} ms, Neurons modello ${s.neurons_vision} + rilevatore ${s.neurons_detect}`);
