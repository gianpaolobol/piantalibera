// Banco di prova del riconoscimento CAD → BIM: genera le piante (semi fissi), le riconosce e misura.
// Uso: node scripts/banco-cad.mjs [--n 25] [--json test-results/banco-cad.json] [--dxf cartella]
// Senza rete e senza costi: tutto in locale. Risultati e lettura in docs/banco-cad.md.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { banco, inDXF } from "../tests/banco-cad/genera.mjs";
import { motoreAttuale, misuraBanco } from "../tests/banco-cad/misura.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const n = +arg("--n", 25), out = arg("--json", "test-results/banco-cad.json"), dxf = arg("--dxf", null);
const piante = banco(n);
if (dxf){ mkdirSync(dxf, { recursive: true }); for (const p of piante.filter((_, i) => i % n < 3)) writeFileSync(join(dxf, `${p.stile}-${p.seed}.dxf`), inDXF(p)); }
const r = misuraBanco(piante, motoreAttuale());
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(r, null, 1));
const pc = v => (v * 100).toFixed(1).replace(".", ",") + " %";
const righe = [["totale", r.totale], ...Object.entries(r.perStile)];
console.log(`Banco CAD → BIM: ${r.piante} piante (${n} per stile)\n`);
console.log("| stile | muri richiamo | muri precisione | spessore esatto | aperture trovate | aperture precisione | tipo giusto | locali trovati | locali ±1 % | errori segnalati | dubbi/pianta | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [k, m] of righe) console.log(`| ${k} | ${pc(m.muri_richiamo)} | ${pc(m.muri_precisione)} | ${pc(m.spessore_esatto)} | ${pc(m.aperture_richiamo)} | ${pc(m.aperture_precisione)} | ${pc(m.aperture_tipo)} | ${pc(m.locali_trovati)} | ${pc(m.locali_area_1pct)} | ${pc(m.errori_segnalati)} | ${m.dubbi_per_pianta} | ${m.ms} |`);
