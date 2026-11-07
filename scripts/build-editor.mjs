// Assembla public/index.html dai sorgenti in editor-src/.
// L'editor è una pagina statica: le librerie arrivano da CDN in versione fissata,
// gli asset da public/assets/. Uso: npm run build:editor  (oppure  --check  in CI)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "editor-src");
const out = join(root, "public", "index.html");

const THREE = "https://cdn.jsdelivr.net/npm/three@0.147.0";
const scripts = [
  "build/three.min.js", "examples/js/libs/fflate.min.js", "examples/js/controls/OrbitControls.js",
  "examples/js/utils/BufferGeometryUtils.js", "examples/js/environments/RoomEnvironment.js",
  "examples/js/exporters/GLTFExporter.js", "examples/js/loaders/GLTFLoader.js", "examples/js/geometries/RoundedBoxGeometry.js",
  "examples/js/math/SimplexNoise.js", "examples/js/shaders/CopyShader.js", "examples/js/shaders/SSAOShader.js",
  "examples/js/shaders/GammaCorrectionShader.js", "examples/js/postprocessing/EffectComposer.js",
  "examples/js/postprocessing/RenderPass.js", "examples/js/postprocessing/ShaderPass.js", "examples/js/postprocessing/SSAOPass.js",
];
const parts = ["01-base.js", "02-lib.js", "03-model.js", "04-plan.js", "045-plan-pro.js", "047-fase2.js", "048-fase3.js", "05-ui.js", "06-online.js", "07-io.js", "075-auto3d.js", "076-auto3d-ui.js", "08-ai.js", "049-progetti.js", "09-init.js"];

const js = parts.map(f => `/* ---- ${f} ---- */\n` + readFileSync(join(src, f), "utf8")).join("\n");
// controllo sintattico prima di scrivere
new Function(js);

const html = [
  "<!doctype html>",
  '<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  "</head><body>",
  readFileSync(join(src, "head.html"), "utf8").trimEnd(),
  ...scripts.map(s => `<script src="${THREE}/${s}"></script>`),
  "<script>", js, "</script>",
  "</body></html>", "",
].join("\n");

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== html) { console.error("public/index.html non è aggiornato: esegui npm run build:editor"); process.exit(1); }
  console.log("public/index.html è aggiornato");
} else {
  writeFileSync(out, html);
  console.log(`scritto ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}
