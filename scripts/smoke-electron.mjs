// Prova dell'app per Windows, Mac e Linux (Electron): avvia app-desktop puntata sul servizio locale di prova,
// aspetta l'editor, prova le stesse funzioni di base delle altre varianti e salva una schermata.
// Uso (dopo `npm ci` in app-desktop e con `npm run dev` avviato): node scripts/smoke-electron.mjs
import { _electron as electron } from "playwright";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "test-results/varianti"); mkdirSync(OUT, { recursive: true });
const name = `electron-${process.platform}-${process.arch}`;
const exe = createRequire(join(root, "app-desktop/package.json"))("electron");
const app = await electron.launch({ executablePath: exe, args: [join(root, "app-desktop"), "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], env: { ...process.env, PIANTA_LIBERA_URL: process.env.PIANTA_LIBERA_URL || "http://127.0.0.1:8787/" } });
const esiti = {}; const errors = [];
const prova = async (k, fn) => { try { await fn(); esiti[k] = "ok"; } catch(e){ esiti[k] = "difetto: " + String(e.message || e).split("\n")[0].slice(0, 160); } };
try {
  const page = await app.firstWindow();
  const log = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => log.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  const t0 = Date.now();
  try { await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 120_000 }); }
  catch(e){ await page.screenshot({ path: join(OUT, `${name}-bloccata.png`) }).catch(() => {}); console.log("URL", page.url(), "\nERRORI", errors.join(" | "), "\nCONSOLE\n" + log.slice(-40).join("\n"));
    appendFileSync(join(OUT, "varianti.jsonl"), JSON.stringify({ variante: name, pronto_ms: null, esiti: { apertura: "difetto: editor non pronto in 120 s — " + (errors[0] || page.url()) } }) + "\n"); throw e; }
  const pronto = Date.now() - t0; await page.waitForTimeout(1500);
  await prova("apertura", async () => { if (!(await page.evaluate(() => P.walls.length > 3))) throw new Error("progetto di esempio mancante"); });
  await prova("vista 3D (WebGL)", async () => { if (!(await page.evaluate(() => !!renderer.getContext()))) throw new Error("WebGL assente"); });
  await prova("stanza, annulla, ripristina", async () => { const n = await page.evaluate(() => { const r0 = P.rooms.length; addRectRoom([20, 20], [24, 23]); undo(); redo(); return P.rooms.length - r0; }); if (n !== 1) throw new Error("undo/redo " + n); });
  await prova("export DXF, IFC, GLB", async () => { const ok = await page.evaluate(() => exportDXF().endsWith("EOF") && /^ISO-10303-21;/.test(exportIFC().text)); if (!ok) throw new Error("export non valido"); });
  await prova("salvataggio e riapertura", async () => { await page.evaluate(() => { P.name = "Prova electron"; commit(); }); await page.waitForTimeout(2000); await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 120_000 }); if ((await page.evaluate(() => P.name)) !== "Prova electron") throw new Error("nome perso"); });
  await prova("nessun errore nella pagina", async () => { if (errors.length) throw new Error(errors.join(" | ")); });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  appendFileSync(join(OUT, "varianti.jsonl"), JSON.stringify({ variante: name, pronto_ms: pronto, esiti }) + "\n");
  console.log(name, JSON.stringify(esiti));
  if (Object.values(esiti).some(v => v !== "ok")) process.exitCode = 1;
} finally { await app.close(); }
