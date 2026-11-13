// Assembla public/index.html dai sorgenti in editor-src/.
// L'editor è una pagina statica: le librerie arrivano da CDN in versione fissata,
// gli asset da public/assets/. Uso: npm run build:editor  (oppure  --check  in CI)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
const parts = ["01-base.js", "../shared/geometria.js", "../shared/ifc.js", "02-lib.js", "03-model.js", "04-plan.js", "045-plan-pro.js", "047-fase2.js", "048-fase3.js", "05-ui.js", "06-online.js", "07-io.js", "075-auto3d.js", "076-auto3d-ui.js", "../shared/photo-seg.js", "../shared/photo-depth.js", "077-foto3d.js", "08-ai.js", "049-progetti.js", "050-tavole.js", "051-condivisione.js", "052-avanguardia.js", "053-mobile.js", "054-muri.js", "055-tetto.js", "056-cornici.js", "09-init.js"];

// i moduli in shared/ sono ES module (li usano anche Worker e test): nell'editor si incorporano senza «export»
function readPart(f){ const t = readFileSync(join(src, f), "utf8"); return f.startsWith("../shared/") ? t.replace(/^import\s.*from\s+"\.\/[\w-]+\.js";\s*$/gm, "").replace(/^export\s+/gm, "") : t; }
// impronte di integrità delle librerie (scripts/sri.mjs): usate dai tag statici e da loadScript()
const SRI = existsSync(join(root, "scripts/sri.json")) ? JSON.parse(readFileSync(join(root, "scripts/sri.json"), "utf8")) : {};
const js = `const SRI = ${JSON.stringify(SRI)};\n` + parts.map(f => `/* ---- ${f} ---- */\n` + readPart(f)).join("\n");
// controllo sintattico prima di scrivere
new Function(js);

// Content Security Policy: solo questo script incorporato (per impronta) e le librerie dai CDN previsti.
// Una seconda barriera: anche se un dato non filtrato finisse nella pagina, non potrebbe eseguire codice.
const inline = "\n" + js + "\n", hash = createHash("sha256").update(inline).digest("base64");
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}' https://cdn.jsdelivr.net https://challenges.cloudflare.com 'wasm-unsafe-eval' 'unsafe-eval'`,
  // 'unsafe-eval': il lettore DWG (libredwg-web, Emscripten/embind) genera funzioni con new Function.
  // Resta escluso ciò che conta contro l'iniezione: script incorporati non autorizzati e gestori on*= nel markup.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' data: blob: https:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "frame-src https://challenges.cloudflare.com",
  "media-src 'self' data: blob:",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join("; ");
const tag = s => { const u = `${THREE}/${s}`; return SRI[u] ? `<script src="${u}" integrity="${SRI[u]}" crossorigin="anonymous"></script>` : `<script src="${u}"></script>`; };
const html = [
  "<!doctype html>",
  `<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    // app installabile su telefono e tablet (manifest e icone in public/)
    `<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#1f6f62"><meta name="mobile-web-app-capable" content="yes">` +
    `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Pianta Libera">` +
    `<link rel="apple-touch-icon" href="assets/app/icon-180.png"><link rel="icon" type="image/png" sizes="192x192" href="assets/app/icon-192.png">`,
  "</head><body>",
  readFileSync(join(src, "head.html"), "utf8").trimEnd(),
  ...scripts.map(tag),
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
