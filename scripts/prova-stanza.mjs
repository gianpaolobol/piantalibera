// Prova locale del modello di stanza (fitRoomBox) sulle mappe delle etichette salvate dal banco foto.
// Uso: node scripts/prova-stanza.mjs cartella-mappe [scena...]
import { readFileSync, readdirSync } from "node:fs";
import { fitRoomBox } from "../shared/photo-seg.js";
const dir = process.argv[2], only = process.argv.slice(3);
const files = readdirSync(dir).filter(f => f.endsWith(".json") && (!only.length || only.some(o => f.includes(o))));
const errs = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), lab = Uint8Array.from(Buffer.from(j.lab, "base64")), m = { w: j.w, h: j.h, lab, names: j.names };
  const t0 = Date.now(), fit = fitRoomBox(m, { hfov: j.fovKnown ? j.cam.hfov : null, aspect: j.h / j.w }), ms = Date.now() - t0;
  if (!fit) { console.log(f, "nessun modello"); continue; }
  const vis = k => j.gq[k][0] >= 0 && j.gq[k][0] <= 1 && j.gq[k][1] >= 0 && j.gq[k][1] <= 1;
  const e = ["fl", "fr", "cl", "cr"].filter(vis).map(k => Math.hypot(fit[k][0] - j.gq[k][0], (fit[k][1] - j.gq[k][1]) * j.h / j.w));
  const err = +(100 * e.reduce((a, b) => a + b, 0) / Math.max(1, e.length)).toFixed(1); errs.push(err);
  if (process.env.OUT) (await import("node:fs")).writeFileSync(`${process.env.OUT}/${f}`, JSON.stringify({ fit, gq: j.gq }));
  console.log(f.padEnd(24), `err ${String(err).padStart(5)}%  conf ${fit.conf} inl ${fit.inliers}  resid ${fit.resid}  incl ${fit.pitch} (vero ${j.cam.pitch})  rot ${fit.yaw} (vero ${j.cam.yaw})  hc ${fit.hc} dl ${fit.dl} dr ${fit.dr} db ${fit.db} punti ${fit.points}  ${ms} ms`);
}
errs.sort((a, b) => a - b); console.log("media", (errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1), "mediana", errs[errs.length >> 1]);
