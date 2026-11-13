// Banco reale del riconoscimento CAD → BIM: misura sulle tavole vere (dati privati, fuori dal repository).
// Uso: node scripts/banco-reale.mjs <cartella>   — la cartella contiene out/*.json prodotti dall'editor
// (disegni della tavola con riconoscimento e testi delle superfici) e, se c'è, verita.json con i conteggi annotati a mano.
// Verità oggettiva: le superfici dei locali scritte dal progettista («mq 14,50»). Una pianta è un disegno con almeno 3 superfici scritte.
import { readFileSync, readdirSync, existsSync } from "node:fs";
const dir = process.argv[2]; if (!dir) { console.error("cartella mancante"); process.exit(1); }
const inPoly = ([x, y], P) => { let k = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) k = !k; return k; };
const area = P => { let a = 0; for (let i = 0; i < P.length; i++){ const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const verita = existsSync(dir + "/verita.json") ? JSON.parse(readFileSync(dir + "/verita.json")) : {};
let tot = 0, esatte = 0, entro3 = 0, trovate = 0, piante = 0, pianteOk = 0, pianteOkNoA = 0, prosp = 0, prospOk = 0; const righe = [], conteggi = [];
for (const f of readdirSync(dir + "/out").filter(x => x.endsWith(".json")).sort()){
  const d = JSON.parse(readFileSync(`${dir}/out/${f}`)); if (!d.clusters) continue;
  for (const c of d.clusters){
    const aree = c.aree || [], r = c.ris;
    // tipo del disegno: con superfici scritte è una pianta; con l'etichetta «prospetto»/«sezione» e senza superfici non lo è
    // «senza superfici»: la stessa regola senza l'indizio delle superfici scritte (che qui definisce le piante: misura non circolare)
    const noA = e => e && (e.leaves >= 3 || (e.leaves >= 1 && e.sloped <= .15 * c.n) || (e.label === "pianta"));
    if (aree.length >= 3 && c.kind){ if (c.kind === "pianta") pianteOk++; if (noA(c.ev)) pianteOkNoA++; }
    else if (!aree.length && c.kind && (c.etichette || []).some(t => /prospett|sezione/i.test(t)) && !(c.etichette || []).some(t => /pianta|piano\s/i.test(t))){ prosp++; if (c.kind !== "pianta") prospOk++; }
    if (aree.length < 3 || !r?.rooms) continue;
    piante++; let e = 0, e3 = 0, t = 0;
    for (const w of aree){ tot++; const rm = r.rooms.find(x => x.pts?.length > 2 && inPoly([w.x, w.y], x.pts)); if (!rm) continue; t++; trovate++;
      const err = Math.abs(area(rm.pts) - w.a) / w.a; if (err <= .01){ e++; esatte++; } if (err <= .03){ e3++; entro3++; } }
    righe.push(`| ${f.replace(".dwg.json", "")}#${c.i} | ${aree.length} | ${t} | ${e} | ${e3} | ${r.walls.length} | ${r.openings.length} |`);
    const v = verita[`${f.replace(".json", "")}#${c.i}`];
    if (v){ const nd = r.openings.filter(o => o.type === "door").length, nf = r.openings.length - nd; conteggi.push({ k: `${f}#${c.i}`, v, ris: { porte: nd, finestre: nf, locali: r.rooms.length } }); }
  }
}
const pc = v => (v * 100).toFixed(1).replace(".", ",") + " %";
const tipo = `| Piante riconosciute come piante | ${piante ? (pianteOk / piante * 100).toFixed(1).replace(".", ",") : "–"} % (senza usare le superfici scritte: ${piante ? (pianteOkNoA / piante * 100).toFixed(1).replace(".", ",") : "–"} %) |\n| Prospetti e sezioni non scambiati per piante | ${prosp ? (prospOk / prosp * 100).toFixed(1).replace(".", ",") + " % (" + prosp + ")" : "–"} |`;
console.log(`Banco reale: ${piante} piante con superfici scritte, ${tot} superfici\n`);
console.log(`| Superfici scritte con un locale riconosciuto | ${pc(tot ? trovate / tot : 0)} |\n| … con superficie esatta (±1 %) | ${pc(tot ? esatte / tot : 0)} |\n| … entro il 3 % | ${pc(tot ? entro3 / tot : 0)} |\n${tipo}\n`);
console.log("| pianta | superfici scritte | con locale | ±1 % | ±3 % | muri | aperture |\n|---|---|---|---|---|---|---|\n" + righe.join("\n"));
if (conteggi.length){
  const err = k => conteggi.reduce((s, c) => s + Math.abs(c.ris[k] - c.v[k]), 0) / conteggi.reduce((s, c) => s + c.v[k], 0);
  console.log(`\nConteggi annotati a mano (${conteggi.length} piante): errore porte ${pc(err("porte"))}, finestre ${pc(err("finestre"))}, locali ${pc(err("locali"))}`);
  for (const c of conteggi) console.log(`  ${c.k}: vero ${JSON.stringify(c.v)} riconosciuto ${JSON.stringify(c.ris)}`);
}
