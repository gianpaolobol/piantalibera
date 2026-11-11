// Sonda: rilevatori di oggetti nel dispositivo (transformers.js) sulle foto NYU con etichette vere.
// Per ogni modello: richiamo e precisione per famiglia (riquadro della stessa famiglia con IoU ≥ 0,3), tempo.
// Uso (CI): npm i --no-save @huggingface/transformers && node scripts/sonda-rilevatore.mjs cartella-nyu [n]
import { pipeline, RawImage, env } from "@huggingface/transformers";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
env.allowLocalModels = false;
const DIR = process.argv[2], N = Number(process.argv[3] || 40);
const MODELS = (process.env.MODELLI || "onnx-community/dfine_s_obj365-ONNX,onnx-community/dfine_n_coco-ONNX,onnx-community/dfine_s_coco-ONNX").split(",");
const FAMG = c => ({ porta: "porta", finestra: "finestra", letto: "letto", divano: "sedute", poltrona: "sedute", pouf: "sedute", sedia: "sedie", tavolo: "tavolo", scrivania: "tavolo", tavolino: "tavolino",
  comodino: "comodino", lampada: "lampada", cassettiera: "contenitori", madia: "contenitori", libreria: "contenitori", tv: "tv", wc: "wc", lavabo: "lavabo", frigorifero: "frigorifero", vasca: "vasca", cucina: "cucina", piano: "cucina", isola: "cucina" }[c]);
// etichette dei rilevatori → famiglia (COCO e Objects365, minuscole)
const ZS = (process.env.ETICHETTE || "door,window,kitchen counter,cabinet,bed,sofa,chair,table,desk,nightstand,lamp,toilet,sink,bathtub,refrigerator,stove,television,bookshelf,dresser").split(",");
const LAB = { door: "porta", window: "finestra", "kitchen counter": "cucina", cabinet: "contenitori", sofa: "sedute", table: "tavolo", television: "tv", stove: "cucina", bookshelf: "contenitori", dresser: "contenitori", couch: "sedute", sofa: "sedute", chair: "sedie", stool: "sedie", bench: "sedute", bed: "letto", "dining table": "tavolo", desk: "tavolo", "coffee table": "tavolino", "side table": "comodino", nightstand: "comodino",
  tv: "tv", "monitor/tv": "tv", toilet: "wc", sink: "lavabo", refrigerator: "frigorifero", oven: "cucina", "gas stove": "cucina", microwave: "cucina", bathtub: "vasca", lamp: "lampada", "cabinet/shelf": "contenitori", "potted plant": "pianta" };
const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
const keys = readdirSync(DIR).filter(f => /^nyu_.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort().slice(0, N);
for (const id of MODELS) {
  const zs = /grounding|owl/i.test(id);
  let det; try { det = await pipeline(zs ? "zero-shot-object-detection" : "object-detection", id, { dtype: process.env.DTYPE || "fp32" }); } catch (e) { console.log(`${id}: non caricabile (${e.message.slice(0, 120)})`); continue; }
  const seen = new Map(); let tp = 0, fp = 0, ms = 0; const per = {};
  for (const key of keys) {
    const gt = JSON.parse(readFileSync(join(DIR, key + ".json"), "utf8")), img = await RawImage.read(join(DIR, key + ".jpg"));
    const t0 = Date.now(); let out;
    try { out = zs ? (await det(img, /grounding/i.test(id) ? ZS.map(l => l + ".").join(" ") : ZS, { threshold: Number(process.env.SOGLIA || .3), percentage: true })).map(o => ({ ...o, label: String(o.label).replace(/\.$/, "").trim() })) : await det(img, { threshold: .4, percentage: true }); }
    catch (e) { console.log(`${id}: errore (${String(e.message || e).slice(0, 200)})`); break; } ms += Date.now() - t0;
    for (const o of out) seen.set(o.label, (seen.get(o.label) || 0) + 1);
    const pred = out.map(o => ({ fam: LAB[o.label.toLowerCase()], box: [o.box.xmin, o.box.ymin, o.box.xmax, o.box.ymax] })).filter(o => o.fam), used = new Set();
    for (const g of gt.objects.filter(o => FAMG(o.cat) && o.px >= 2500)) {
      const f = FAMG(g.cat); per[f] ??= [0, 0];
      let b = 0, bi = -1; pred.forEach((p, i) => { if (!used.has(i) && p.fam === f) { const v = iou(p.box, g.box); if (v > b) { b = v; bi = i; } } });
      per[f][1]++; if (b >= .3) { used.add(bi); per[f][0]++; tp++; }
    }
    fp += pred.length - used.size;
  }
  const tot = Object.values(per).reduce((s, v) => s + v[1], 0);
  console.log(`\n### ${id}: ${(ms / keys.length).toFixed(0)} ms/foto · trovati ${tp}/${tot} · falsi ${fp}`);
  console.log("   " + Object.entries(per).map(([f, v]) => `${f} ${v[0]}/${v[1]}`).join(" · "));
  console.log("   etichette viste: " + [...seen].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([l, n]) => `${l}(${n})`).join(", "));
}
