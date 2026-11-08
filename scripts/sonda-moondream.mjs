// Sonda temporanea: confronta modello con visione (Llama 4 Scout, Qwen) e rilevatore DETR sulle stesse foto.
// Stampa le risposte e un'immagine annotata (JPEG in base64 tra i marcatori ===IMG===) da controllare a occhio.
import sharp from "sharp";
import { photoMessages, PHOTO_SCHEMA, extractJson, normalizeAnalysis, neuronsFromUsage } from "../shared/photo.js";
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };
async function run(model, input) {
  const t = Date.now(), r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${model}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const j = await r.json().catch(() => ({})); return { ms: Date.now() - t, status: r.status, result: j.result, errors: j.errors };
}
const cats = ["Category:Living_rooms_in_the_United_States", "Category:Kitchens_in_the_United_States", "Category:Bedrooms_in_the_United_States"];
for (const c of cats) {
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(c)}&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024`, { headers: UA })).json();
  const files = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height * 1.2);
  const f = files[Math.min(2, files.length - 1)]; if (!f) continue;
  const buf = Buffer.from(await (await fetch(f.imageinfo[0].thumburl, { headers: UA })).arrayBuffer());
  const meta = await sharp(buf).metadata(), W = meta.width, H = meta.height, data = "data:image/jpeg;base64," + buf.toString("base64");
  console.log(`\n\n######## ${f.title} ${W}x${H} ${f.imageinfo[0].descriptionurl}`);
  const res = {};
  for (const [name, model, extra] of [["llama", "@cf/meta/llama-4-scout-17b-16e-instruct", {}], ["qwen", "@cf/qwen/qwen3.8-27b", {}]]) {
    const r = await run(model, { messages: photoMessages(data), max_tokens: 3500, temperature: 0.1, response_format: { type: "json_schema", json_schema: PHOTO_SCHEMA }, ...extra });
    const raw = extractJson(r.result); let a = null; try { a = normalizeAnalysis(raw, {}, W, H); } catch (e) {}
    console.log(`\n## ${name}: HTTP ${r.status} ${r.ms} ms neurons=${neuronsFromUsage(r.result?.usage, { in: 0, out: 0 })} usage=${JSON.stringify(r.result?.usage)}`, r.errors?.length ? JSON.stringify(r.errors).slice(0, 300) : "");
    console.log((typeof r.result?.response === "string" ? r.result.response : JSON.stringify(r.result?.response ?? r.result))?.slice(0, 2500));
    res[name] = a;
  }
  const d = await run("@cf/facebook/detr-resnet-50", { image: [...buf] });
  console.log(`\n## detr: HTTP ${d.status} ${d.ms} ms`, JSON.stringify(d.result ?? d.errors).slice(0, 1500));
  // immagine annotata: llama rosso, qwen blu, detr verde
  const col = { llama: "#e3342f", qwen: "#2f6fe3" }; let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="14">`;
  for (const [name, a] of Object.entries(res)) { if (!a) continue;
    for (const it of a.items) { const [x0, y0, x1, y1] = it.box; svg += `<rect x="${x0 * W}" y="${y0 * H}" width="${(x1 - x0) * W}" height="${(y1 - y0) * H}" fill="none" stroke="${col[name]}" stroke-width="3"/><text x="${x0 * W + 3}" y="${y0 * H + 15}" fill="${col[name]}" stroke="white" stroke-width="3" paint-order="stroke">${it.category}</text>`; }
    if (a.back_wall) { const b = a.back_wall; svg += `<polygon points="${[b.fl, b.fr, b.cr, b.cl].map(p => `${p[0] * W},${p[1] * H}`).join(" ")}" fill="none" stroke="${col[name]}" stroke-width="4" stroke-dasharray="10 6"/>`; } }
  for (const o of Array.isArray(d.result) ? d.result : []) if (o.score > .5) { const b = o.box; svg += `<rect x="${b.xmin}" y="${b.ymin}" width="${b.xmax - b.xmin}" height="${b.ymax - b.ymin}" fill="none" stroke="#18a058" stroke-width="3"/><text x="${b.xmin + 3}" y="${b.ymax - 4}" fill="#18a058" stroke="white" stroke-width="3" paint-order="stroke">${o.label} ${o.score.toFixed(2)}</text>`; }
  svg += "</svg>";
  const out = await sharp(buf).composite([{ input: Buffer.from(svg) }]).resize(900).jpeg({ quality: 70 }).toBuffer();
  console.log(`===IMG=== ${f.title.replace(/\W+/g, "_").slice(0, 40)}\n${out.toString("base64")}\n===FINE===`);
}
