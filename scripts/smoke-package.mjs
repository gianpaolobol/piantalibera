// Prova del pacchetto locale senza internet: estrae lo zip, avvia il server del pacchetto,
// apre l'editor bloccando ogni richiesta esterna e prova le funzioni principali.
// Uso: npm run build:pacchetto && node scripts/smoke-package.mjs
import { chromium } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tavolaDXF } from "../tests/fixtures/casa.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "pl-smoke-"));
execFileSync("unzip", ["-q", join(root, "dist/pianta-libera-locale.zip"), "-d", dir]);
const pkg = join(dir, "pianta-libera-locale"), PORT = 8796;
const srv = spawn(process.execPath, ["server/local-server.mjs"], { cwd: pkg, env: { ...process.env, PORT: String(PORT), STATIC_DIR: join(pkg, "app") }, stdio: "inherit" });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const external = [], errors = [];
try {
  const page = await browser.newPage();
  await page.route("**/*", r => { const u = new URL(r.request().url()); if (u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:") return r.continue(); external.push(u.href); return r.abort(); });
  page.on("pageerror", e => errors.push(e.message));
  for (let i = 0; i < 40; i++){ try { await page.goto(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 30000 });
  // tavola DXF → 3D (dxf-parser dal pacchetto)
  await page.click('[data-tab="import"]');
  await page.setInputFiles("#fA3", { name: "tavola.dxf", mimeType: "application/dxf", buffer: Buffer.from(tavolaDXF()) });
  await page.waitForSelector(".a3grid figure", { timeout: 20000 });
  await page.click("#a3Go"); await page.waitForSelector(".a3rep", { timeout: 20000 });
  // lettore DWG e importatori caricati dal pacchetto
  const libs = await page.evaluate(async () => {
    const m = await import(DWG_LIB + "/dist/libredwg-web.js"); const lib = await m.LibreDwg.create(DWG_LIB + "/wasm");
    await loadScript(CDN3 + "loaders/ColladaLoader.js"); await loadScript(CDN3 + "loaders/RGBELoader.js");
    return { dwg: typeof lib.dwg_read_data === "function", collada: !!THREE.ColladaLoader, walls: P.walls.length };
  });
  if (!libs.dwg || !libs.collada || libs.walls < 5) throw new Error("funzioni mancanti: " + JSON.stringify(libs));
  const ext = external.filter(u => !/polyhaven|fonts\.g/.test(u));
  if (ext.length) throw new Error("richieste esterne: " + ext.join(", "));
  if (errors.length) throw new Error("errori nella pagina: " + errors.join(" | "));
  console.log("pacchetto ok: editor, DXF→3D, DWG, importatori, nessuna richiesta esterna", JSON.stringify(libs));
} finally { await browser.close(); srv.kill(); rmSync(dir, { recursive: true, force: true }); }
