// Pacchetto per l'uso in locale: editor + librerie (funziona senza internet) + server + avvio.
// Uso: npm run build:pacchetto  →  dist/pianta-libera-locale.zip
// Le librerie si prendono dal registro npm (stessi file di jsDelivr/cdnjs, stesse versioni).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "pianta-libera-locale", dist = join(root, "dist"), out = join(dist, NAME), app = join(out, "app");
const GUIDE = "https://github.com/gianpaolobol/piantalibera/blob/main/docs/installazione-locale.md";
rmSync(out, { recursive: true, force: true }); mkdirSync(app, { recursive: true });

// 1. editor (senza le copie .b64.txt, che servono solo all'anteprima dentro Claude)
cpSync(join(root, "public"), app, { recursive: true, filter: src => !src.endsWith(".b64.txt") });

// 2. librerie: pacchetti npm → app/vendor/jsdelivr/npm/<pacchetto>@<versione>/…
const tmp = join(tmpdir(), "pl-pack-" + process.pid); mkdirSync(tmp, { recursive: true });
function npmFiles(spec, files, dest){
  const tgz = execFileSync("npm", ["pack", spec, "--silent", "--pack-destination", tmp], { encoding: "utf8" }).trim().split("\n").pop();
  const ex = join(tmp, spec.replace(/[^\w.-]/g, "_")); mkdirSync(ex, { recursive: true });
  execFileSync("tar", ["xzf", join(tmp, tgz), "-C", ex]);
  for (const [from, to] of files){ const s = join(ex, "package", from), d = join(dest, to ?? from); if (!existsSync(s)) throw new Error(`${spec}: manca ${from}`); mkdirSync(dirname(d), { recursive: true }); cpSync(s, d); }
}
const J = join(app, "vendor/jsdelivr/npm");
const html0 = readFileSync(join(app, "index.html"), "utf8");
const threeFiles = [...new Set([...html0.matchAll(/three@0\.147\.0\/([\w/.-]+\.js)/g)].map(m => m[1]))];
const lazy = readdirSync(join(root, "editor-src")).flatMap(f => [...readFileSync(join(root, "editor-src", f), "utf8").matchAll(/CDN3 \+ "([^"]+)"/g)].map(m => "examples/js/" + m[1]));
npmFiles("three@0.147.0", [...new Set([...threeFiles, ...lazy])].map(f => [f]), join(J, "three@0.147.0"));
npmFiles("dxf-parser@1.1.2", [["dist/dxf-parser.js"]], join(J, "dxf-parser@1.1.2"));
npmFiles("@mlightcad/libredwg-web@0.8.2", [["dist/libredwg-web.js"], ["wasm/libredwg-web.js"], ["wasm/libredwg-web.wasm"]], join(J, "@mlightcad/libredwg-web@0.8.2"));
npmFiles("pdfjs-dist@2.16.105", [["build/pdf.min.js"], ["build/pdf.worker.min.js"]], join(J, "pdfjs-dist@2.16.105"));

// 3. caratteri (se Google Fonts è raggiungibile; altrimenti quelli di sistema)
// nella CSP del pacchetto i CDN non servono più: tutto arriva da 'self'
let html = html0.replace(/ https:\/\/cdn\.jsdelivr\.net(?=[ ;"])/g, "").replaceAll("https://cdn.jsdelivr.net/", "./vendor/jsdelivr/").replaceAll("https://cdnjs.cloudflare.com/", "./vendor/cdnjs/");
const fontLink = html.match(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"[^>]*>/);
html = html.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com"[^>]*>\s*/g, "");
if (fontLink){
  try {
    const css = await (await fetch(fontLink[1].replaceAll("&amp;", "&"), { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" } })).text();
    let i = 0, local = css; mkdirSync(join(app, "vendor/fonts"), { recursive: true });
    for (const m of css.matchAll(/url\((https:[^)]+\.woff2)\)/g)){ const f = `f${i++}.woff2`; writeFileSync(join(app, "vendor/fonts", f), Buffer.from(await (await fetch(m[1])).arrayBuffer())); local = local.replace(m[1], f); }
    writeFileSync(join(app, "vendor/fonts/fonts.css"), local); html = html.replace(fontLink[0], '<link rel="stylesheet" href="./vendor/fonts/fonts.css">');
  } catch(e){ console.warn("caratteri non scaricati (si useranno quelli di sistema):", e.message); html = html.replace(fontLink[0], ""); }
}
const left = html.match(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)[^"'`\s]*/g);
if (left) throw new Error("indirizzi esterni rimasti: " + left.join(", "));
// la CSP della pagina autorizza lo script incorporato con la sua impronta: gli indirizzi sono cambiati, la si ricalcola
html = html.replace(/'sha256-[A-Za-z0-9+/=]+'/, () => `'sha256-${createHash("sha256").update(html.match(/<script>([\s\S]*?)<\/script>/)[1]).digest("base64")}'`);
writeFileSync(join(app, "index.html"), html);

// 4. server locale
for (const f of ["server/local-server.mjs", "server/comfy-workflow.mjs", "shared/contract.js", "shared/share.js", "shared/photo.js"]){ mkdirSync(dirname(join(out, f)), { recursive: true }); cpSync(join(root, f), join(out, f)); }
writeFileSync(join(out, "package.json"), JSON.stringify({ name: NAME, private: true, type: "module", engines: { node: ">=20" } }, null, 2) + "\n");
mkdirSync(join(out, "comfyui"), { recursive: true });
writeFileSync(join(out, "comfyui", "METTI-QUI-IL-WORKFLOW.txt"), `Per i render AI con la GPU di questo computer:\nesporta da ComfyUI il workflow in formato API e salvalo qui con il nome workflow-api.json.\nIstruzioni: ${GUIDE}\n`);

// 5. avvio con doppio clic
const bat = `@echo off\r\ntitle Pianta Libera\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul || (echo Serve Node.js 20 o successivo: https://nodejs.org  oppure  winget install OpenJS.NodeJS.LTS & pause & exit /b 1)\r\nif exist "comfyui\\workflow-api.json" set COMFYUI_WORKFLOW=%~dp0comfyui\\workflow-api.json\r\nif not defined PORT set PORT=8787\r\nset STATIC_DIR=%~dp0app\r\nstart "" "http://127.0.0.1:%PORT%/"\r\nnode server\\local-server.mjs\r\npause\r\n`;
const sh = `#!/usr/bin/env bash\n# Pianta Libera in locale (macOS e Linux)\ncd "$(dirname "$0")"\ncommand -v node >/dev/null || { echo "Serve Node.js 20 o successivo: https://nodejs.org  (macOS: brew install node · Linux: vedi la guida)"; read -r -p "Invio per chiudere"; exit 1; }\nif [ -f comfyui/workflow-api.json ]; then export COMFYUI_WORKFLOW="$PWD/comfyui/workflow-api.json"; fi\nexport PORT="\${PORT:-8787}" STATIC_DIR="$PWD/app"\n( sleep 1; (command -v open >/dev/null && open "http://127.0.0.1:$PORT/") || (command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT/") ) >/dev/null 2>&1 &\nexec node server/local-server.mjs\n`;
writeFileSync(join(out, "avvia-windows.bat"), bat);
for (const f of ["avvia-mac.command", "avvia-linux.sh"]){ writeFileSync(join(out, f), sh); chmodSync(join(out, f), 0o755); }

// 6. versione e note
let commit = process.env.GITHUB_SHA || ""; try { commit ||= execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
const ver = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
writeFileSync(join(out, "VERSIONE.txt"), `Pianta Libera ${ver}\ncommit ${commit.slice(0, 12)}\ncreato ${new Date().toISOString()}\n`);
writeFileSync(join(out, "LEGGIMI.txt"), `PIANTA LIBERA — versione locale ${ver}\n\nAvvio: doppio clic su avvia-windows.bat (Windows), avvia-mac.command (macOS) o avvia-linux.sh (Linux).\nSi apre il browser su http://127.0.0.1:8787/ . Serve Node.js 20 o successivo.\n\nGuida completa (installazione, GPU, render AI in locale con ComfyUI):\n${GUIDE}\n\nLicenze delle librerie incluse: app/vendor (three.js MIT, dxf-parser MIT, pdf.js Apache-2.0,\nlibredwg-web GPL-3.0) e assets: vedi la guida.\n`);

// 7. zip
rmSync(join(dist, NAME + ".zip"), { force: true });
execFileSync("zip", ["-qr9", NAME + ".zip", NAME], { cwd: dist });
rmSync(tmp, { recursive: true, force: true });
const size = statSync(join(dist, NAME + ".zip")).size;
console.log(`dist/${NAME}.zip · ${(size / 1048576).toFixed(1)} MB`);
