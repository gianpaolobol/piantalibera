// I moduli di editor-src/ sono concatenati in un unico script: i nomi dichiarati al primo livello
// sono globali e condivisi. Una funzione ridefinita in un modulo successivo sostituisce in silenzio
// la precedente (le dichiarazioni di funzione sono «sollevate»), un const/let ripetuto blocca tutto.
// Questo controllo elenca i nomi dichiarati più di una volta. Uso: npm run lint:globali
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = readFileSync(join(root, "scripts/build-editor.mjs"), "utf8");
const parts = JSON.parse(build.match(/const parts = (\[[^\]]+\])/)[1]);
// nomi ridefiniti di proposito (da elencare qui con il motivo)
const ALLOWED = new Set([]);

const seen = new Map(), dup = [];
const add = (name, where) => { if (!name) return; if (seen.has(name)) dup.push(`${name}: ${seen.get(name)} e ${where}`); else seen.set(name, where); };
for (const f of parts){
  const lines = readFileSync(join(root, "editor-src", f), "utf8").replace(/^export\s+/gm, "").split("\n");
  let depth = 0, inStr = null;
  lines.forEach((line, i) => {
    const where = `${f}:${i + 1}`;
    if (depth === 0 && !inStr){
      let m;
      if ((m = line.match(/^(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/))) add(m[1], where);
      else if ((m = line.match(/^class\s+([A-Za-z_$][\w$]*)/))) add(m[1], where);
      else if ((m = line.match(/^(?:const|let|var)\s+(.*)$/))){
        const decl = m[1];
        if (/^[{[]/.test(decl)) for (const n of decl.slice(1, decl.search(/[}\]]/)).split(",")) add(n.split(":").pop().split("=")[0].trim(), where);
        else {
          // a = 1, b = 2 ...: nomi seguiti da = al livello zero di parentesi della riga
          let d = 0, start = 0; const names = [];
          for (let k = 0; k < decl.length; k++){ const c = decl[k]; if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--; else if (c === "," && d === 0){ names.push(decl.slice(start, k)); start = k + 1; } else if (c === ";" && d === 0) break; }
          names.push(decl.slice(start));
          for (const n of names){ const id = n.trim().match(/^([A-Za-z_$][\w$]*)\s*(=|;|$)/); if (id) add(id[1], where); }
        }
      }
    }
    // profondità delle graffe (ignora stringhe e commenti su una riga in modo approssimato)
    for (let k = 0; k < line.length; k++){
      const c = line[k];
      if (inStr){ if (c === "\\") k++; else if (c === inStr) inStr = null; continue; }
      if (c === "/" && line[k + 1] === "/") break;
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === "`") { inStr = "`"; continue; }
      if (c === "{") depth++; else if (c === "}") depth--;
    }
    if (inStr && inStr !== "`") inStr = null;
  });
}
const bad = dup.filter(d => !ALLOWED.has(d.split(":")[0]));
if (bad.length){ console.error("Nomi globali dichiarati più volte:\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`nomi globali: ${seen.size}, nessuna ripetizione`);
