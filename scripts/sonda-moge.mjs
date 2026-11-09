// Sonda: MoGe-2 ViT-S (geometria monoculare metrica + normali, ONNX) sulle foto NYU con profondità vera.
// Stampa ingressi/uscite del modello, tempi su CPU e l'errore della profondità e dell'altezza della fotocamera.
// Uso (CI): npm i --no-save onnxruntime-node sharp && node scripts/sonda-moge.mjs cartella-nyu [n]
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const DIR = process.argv[2], N = Number(process.argv[3] || 6);
const URL = process.env.MOGE_URL || "https://huggingface.co/Heliosoph/moge-2-vits-normal-onnx/resolve/main/model.onnx", FILE = "/tmp/moge.onnx";
if (!existsSync(FILE)) { const r = await fetch(URL); if (!r.ok) throw new Error("download " + r.status); writeFileSync(FILE, Buffer.from(await r.arrayBuffer())); }
const ses = await ort.InferenceSession.create(FILE, { graphOptimizationLevel: "all" });
console.log("ingressi:", ses.inputNames, "uscite:", ses.outputNames);
for (const n of ses.inputNames) console.log(" in", n, JSON.stringify(ses.inputMetadata?.find?.(m => m.name === n) || ""));
const keys = readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort().slice(0, N);
for (const norm of [false, true]) for (const key of keys.slice(0, norm ? 2 : N)) {
  const gt = JSON.parse(readFileSync(join(DIR, key + ".json"), "utf8"));
  const Wm = 518, Hm = Math.round(518 * gt.H / gt.W / 14) * 14;    // multipli di 14 (patch del ViT)
  const { data } = await sharp(join(DIR, key + ".jpg")).resize(Wm, Hm, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = new Float32Array(3 * Wm * Hm), M = [.485, .456, .406], S = [.229, .224, .225];
  for (let i = 0; i < Wm * Hm; i++) for (let c = 0; c < 3; c++) { const v = data[i * 3 + c] / 255; x[c * Wm * Hm + i] = norm ? (v - M[c]) / S[c] : v; }
  const feeds = { [ses.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, Hm, Wm]) };
  for (const n of ses.inputNames.slice(1)) feeds[n] = /token/i.test(n) ? new ort.Tensor("int64", BigInt64Array.from([1800n]), []) : new ort.Tensor("float32", Float32Array.from([1]), [1]);
  const t0 = Date.now(); let out; try { out = await ses.run(feeds); } catch (e) { console.log("errore:", e.message.slice(0, 400)); break; }
  const ms = Date.now() - t0;
  const desc = Object.entries(out).map(([k, t]) => `${k}[${t.dims}] ${Array.from(t.data.slice(0, 4)).map(v => (+v).toFixed(3)).join(",")}`).join(" | ");
  console.log(`\n## ${key} norm=${norm} ${ms} ms — ${desc}`);
  // profondità: z della mappa dei punti al centro e confronto con oggetti noti (distanza mediana degli oggetti)
  const pts = Object.entries(out).find(([k, t]) => t.dims.length === 4 && t.dims[3] === 3 || /point/i.test(k));
  if (!pts) continue; const P = pts[1], [, h, w] = P.dims;
  const at = (u, v) => { const i = (Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))) * 3; return [P.data[i], P.data[i + 1], P.data[i + 2]]; };
  const ratios = [];
  for (const o of gt.objects) { const c = at((o.box[0] + o.box[2]) / 2, (o.box[1] + o.box[3]) / 2), d = Math.hypot(...c), dg = Math.hypot(o.r, o.f); if (dg > .3 && isFinite(d)) ratios.push(d / dg); }
  ratios.sort((a, b) => a - b);
  console.log(`   rapporto distanza stimata/vera (centro oggetti): mediana ${ratios[ratios.length >> 1]?.toFixed(3)} min ${ratios[0]?.toFixed(3)} max ${ratios.at(-1)?.toFixed(3)} (n ${ratios.length})`);
}
