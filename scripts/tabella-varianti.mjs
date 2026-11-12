// Tabella funzione × variante in Markdown dai file varianti.jsonl (uno per job). Uso: node scripts/tabella-varianti.mjs <cartella>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const rows = [];
const walk = d => { for (const f of readdirSync(d)){ const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "varianti.jsonl") for (const l of readFileSync(p, "utf8").split("\n")) if (l.trim()) try { rows.push(JSON.parse(l)); } catch {} } };
walk(process.argv[2] || "test-results/varianti");
const funz = [...new Set(rows.flatMap(r => Object.keys(r.esiti)))];
const cell = v => v == null ? "—" : v === "ok" ? "ok" : "**" + v.replace(/\|/g, "/") + "**";
console.log(`## Funzione × variante\n\n| Funzione | ${rows.map(r => r.variante).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`);
for (const f of funz) console.log(`| ${f} | ${rows.map(r => cell(r.esiti[f])).join(" | ")} |`);
console.log(`| pronto (s) | ${rows.map(r => r.pronto_ms == null ? "—" : (r.pronto_ms / 1000).toFixed(1)).join(" | ")} |`);
