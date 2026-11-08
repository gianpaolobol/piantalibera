// Prova completa di «Da foto al 3D» su foto vere (GitHub Actions): segmentazione nel «dispositivo»
// (SegFormer con transformers.js, come nel browser), spigoli automatici, Llama 4 Scout + DETR su Workers AI,
// unione. Stampa i risultati e un'immagine con spigoli e riquadri finali (base64 tra ===IMG=== e ===FINE===).
import { pipeline, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";
import { photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, parseDetections } from "../shared/photo.js";
import { SEG_MODEL, labelMap, wallCorners, segComponents, mergeSegmentation } from "../shared/photo-seg.js";
env.allowLocalModels = false;
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };
const run = async (model, input) => { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }); return (await r.json()).result; };
const photos = [];
for (const c of (process.env.CATS || "Category:Living_rooms_in_the_United_States,Category:Bedrooms_in_the_United_States,Category:Dining_rooms_in_the_United_States").split(",")) {
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(c)}&gcmtype=file&gcmlimit=60&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024`, { headers: UA })).json();
  const fs = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height * 1.2);
  for (const k of (process.env.IDX || "3").split(",").map(Number)) { const f = fs[Math.min(k, fs.length - 1)]; if (f) photos.push({ title: f.title, buf: Buffer.from(await (await fetch(f.imageinfo[0].thumburl, { headers: UA })).arrayBuffer()) }); }
}
const seg = await pipeline("image-segmentation", SEG_MODEL, { dtype: "q8" });
const COL = { apertura: "#e23", altro: "#fb3" };
for (const p of photos) {
  const { data, info } = await sharp(p.buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, img = new RawImage(new Uint8ClampedArray(data), W, H, 3);
  const t0 = Date.now(), segs = await seg(img), tSeg = Date.now() - t0;
  const m = labelMap(segs, 320), quad = wallCorners(m), comps = segComponents(m, "");
  const dataUrl = "data:image/jpeg;base64," + p.buf.toString("base64");
  const [vis, det] = await Promise.all([run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: photoMessages(dataUrl), max_tokens: 3000, temperature: .15, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA } }), run("@cf/facebook/detr-resnet-50", { image: [...p.buf] })]);
  let a = null; try { a = normalizeAnalysis(extractJson(vis), parseDetections(det, W, H), W, H); } catch (e) { console.log("analisi:", e.message); }
  const items = a ? mergeSegmentation(a.items, segComponents(m, a.room_type), quad) : [];
  console.log(`\n######## ${p.title} ${W}x${H} — segmentazione ${tSeg} ms`);
  console.log("spigoli:", JSON.stringify(quad));
  console.log("componenti:", comps.map(c => `${c.category}(${c.label}) ${(c.area * 100).toFixed(1)}%`).join(", "));
  console.log("elementi finali:", items.map(i => `${i.category}${i.doubt ? "?" : ""}[${i.source}]`).join(", "));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="18">`;
  for (const it of items) { const [x0, y0, x1, y1] = it.box, op = /porta|finestra/.test(it.category), c = it.doubt ? "#999" : op ? "#e23" : it.source.includes("seg") ? "#2a3" : "#fb3";
    svg += `<rect x="${x0 * W}" y="${y0 * H}" width="${(x1 - x0) * W}" height="${(y1 - y0) * H}" fill="none" stroke="${c}" stroke-width="${op ? 5 : 3}" ${it.doubt ? 'stroke-dasharray="8 6"' : ""}/><text x="${x0 * W + 4}" y="${y0 * H + 20}" fill="${c}" stroke="#fff" stroke-width="4" paint-order="stroke">${it.category}</text>`; }
  if (quad) svg += `<polygon points="${[quad.fl, quad.fr, quad.cr, quad.cl].map(q => `${q[0] * W},${q[1] * H}`).join(" ")}" fill="none" stroke="#18f" stroke-width="6"/>` + [quad.fl, quad.fr, quad.cr, quad.cl].map(q => `<circle cx="${q[0] * W}" cy="${q[1] * H}" r="9" fill="#18f"/>`).join("");
  svg += "</svg>";
  const ov = await sharp(Buffer.from(svg)).resize(W, H, { fit: "fill" }).png().toBuffer();
  const comp = await sharp(await sharp(p.buf).resize(W, H, { fit: "fill" }).png().toBuffer()).composite([{ input: ov }]).png().toBuffer();
  console.log(`===IMG=== ${p.title.replace(/\W+/g, "_").slice(5, 32)}\n${(await sharp(comp).resize(760).jpeg({ quality: 70 }).toBuffer()).toString("base64")}\n===FINE===`);
}
