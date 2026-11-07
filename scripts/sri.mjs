// Impronte di integrità (SRI) delle librerie caricate da jsDelivr.
// I file di jsDelivr sono quelli dei pacchetti npm: li scarichiamo dal registro npm e calcoliamo
// sha384. Risultato in scripts/sri.json, letto da scripts/build-editor.mjs.
// Uso: node scripts/sri.mjs   (da rifare solo quando cambia una versione o un file usato)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readdirSync(join(root, "editor-src")).filter(f => f.endsWith(".js")).map(f => readFileSync(join(root, "editor-src", f), "utf8")).join("\n") + readFileSync(join(root, "scripts/build-editor.mjs"), "utf8");
const JS = "https://cdn.jsdelivr.net/npm/";
// file usati: tag statici della pagina, CDN3 + "…" nei moduli, URL completi nei moduli
const three = new Set([...src.matchAll(/"((?:build|examples\/js)\/[\w/.-]+\.js)"/g)].map(m => m[1]));
for (const m of src.matchAll(/CDN3 \+ "([^"]+)"/g)) three.add("examples/js/" + m[1]);
const wanted = { "three@0.147.0": [...three] };
for (const m of src.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[\w.-]+\/)?[\w.-]+@[\d.]+)\/([\w/.-]+\.js)/g)) (wanted[m[1]] ||= []).includes(m[2]) || wanted[m[1]].push(m[2]);

const tmp = join(tmpdir(), "pl-sri-" + process.pid); mkdirSync(tmp, { recursive: true });
const out = {};
for (const [spec, files] of Object.entries(wanted)) {
  const tgz = execFileSync("npm", ["pack", spec, "--silent", "--pack-destination", tmp], { encoding: "utf8" }).trim().split("\n").pop();
  const ex = join(tmp, spec.replace(/[^\w.-]/g, "_")); mkdirSync(ex, { recursive: true });
  execFileSync("tar", ["xzf", join(tmp, tgz), "-C", ex]);
  for (const f of files) {
    let buf; try { buf = readFileSync(join(ex, "package", f)); } catch { console.warn(`saltato ${spec}/${f}: non è nel pacchetto`); continue; }
    out[`${JS}${spec}/${f}`] = "sha384-" + createHash("sha384").update(buf).digest("base64");
  }
}
rmSync(tmp, { recursive: true, force: true });
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(root, "scripts/sri.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(`${Object.keys(sorted).length} impronte in scripts/sri.json`);
