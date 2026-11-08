// Sonda: segmentazione ADE20K (SegFormer, transformers.js) su foto vere di interni. Stampa classi trovate,
// tempi e un'immagine con le maschere colorate (base64 tra ===IMG=== e ===FINE===).
import { pipeline, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";
env.allowLocalModels = false;
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };
const MODELS = (process.env.SEG_MODELS || "Xenova/segformer-b0-finetuned-ade-512-512,Xenova/segformer-b2-finetuned-ade-512-512").split(",");
const COL = { wall: [230, 200, 60], floor: [60, 160, 230], ceiling: [230, 90, 200], door: [230, 50, 50], "double door": [230, 50, 50], windowpane: [50, 230, 90], window: [50, 230, 90], sofa: [150, 80, 230], bed: [150, 80, 230], chair: [250, 140, 30], table: [30, 220, 220], lamp: [255, 255, 255], chandelier: [255, 255, 255], cabinet: [120, 120, 30], curtain: [90, 200, 160] };
const photos = [];
for (const c of ["Category:Living_rooms_in_the_United_States", "Category:Bedrooms_in_the_United_States", "Category:Kitchens_in_the_United_States"]) {
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(c)}&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024`, { headers: UA })).json();
  const fs = Object.values(j.query?.pages || {}).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height * 1.2);
  const f = fs[Math.min(Number(process.env.IDX || 1), fs.length - 1)]; if (f) photos.push({ title: f.title, buf: Buffer.from(await (await fetch(f.imageinfo[0].thumburl, { headers: UA })).arrayBuffer()) });
}
for (const id of MODELS) {
  let seg; const t0 = Date.now();
  try { seg = await pipeline("image-segmentation", id, { dtype: process.env.DTYPE || "q8" }); } catch (e) { console.log(`## ${id}: non disponibile — ${e.message.slice(0, 200)}`); continue; }
  console.log(`## ${id}: caricato in ${Date.now() - t0} ms`);
  for (const p of photos) {
    const { data, info } = await sharp(p.buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
    const t1 = Date.now(); const out = await seg(img); const ms = Date.now() - t1;
    const W = out[0]?.mask.width, H = out[0]?.mask.height, ov = Buffer.alloc(W * H * 4);
    const stats = out.map(o => { let n = 0; const c = COL[o.label]; for (let i = 0; i < W * H; i++) if (o.mask.data[i] > 127) { n++; if (c) { ov[i * 4] = c[0]; ov[i * 4 + 1] = c[1]; ov[i * 4 + 2] = c[2]; ov[i * 4 + 3] = 120; } } return `${o.label} ${(100 * n / (W * H)).toFixed(1)}%`; });
    console.log(`  ${p.title}: ${ms} ms, maschere ${W}x${H}: ${stats.join(", ")}`);
    const base = await sharp(p.buf).resize(W, H, { fit: "fill" }).png().toBuffer();
    const ovp = await sharp(ov, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const comp = await sharp(base).composite([{ input: ovp }]).png().toBuffer();
    const jpg = await sharp(comp).resize(700).jpeg({ quality: 68 }).toBuffer();
    console.log(`===IMG=== ${id.split("/")[1].slice(10, 12)}_${p.title.replace(/\W+/g, "_").slice(5, 30)}\n${jpg.toString("base64")}\n===FINE===`);
  }
}
