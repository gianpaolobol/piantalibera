// Prova comune a tutte le varianti (browser e profili di dispositivo): stesso percorso, stesse verifiche.
// Gira con playwright.varianti.config.mjs: Chromium, Firefox e WebKit; profili computer, iPhone, iPad, Android.
// Ogni progetto salva una schermata in test-results/varianti/<progetto>.png e una riga in varianti.jsonl:
// la tabella funzione × variante del report si ricava da quel file (scripts/tabella-varianti.mjs).
import { test, expect } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";

const OUT = "test-results/varianti"; mkdirSync(OUT, { recursive: true });
const esiti = {};
async function prova(nome, fn){ try { await fn(); esiti[nome] = "ok"; } catch(e){ esiti[nome] = "difetto: " + String(e.message || e).split("\n")[0].slice(0, 160); } }

test("percorso base della variante", async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const log = [];
  page.on("console", m => { log.push(`${m.type()}: ${m.text()}`.slice(0, 300)); if (/Content Security Policy|integrity/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", r => log.push(`richiesta fallita: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await page.goto("/");
  try { await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 120_000 }); }
  catch(e){ await page.screenshot({ path: `${OUT}/${info.project.name}-bloccata.png` }).catch(() => {});
    appendFileSync(`${OUT}/varianti.jsonl`, JSON.stringify({ variante: info.project.name, pronto_ms: null, esiti: { apertura: "difetto: editor non pronto in 120 s — " + (errors[0] || log.filter(l => /error|fallita/i.test(l))[0] || "") } }) + "\n");
    console.log("ERRORI:\n" + errors.join("\n") + "\nCONSOLE:\n" + log.slice(-40).join("\n")); throw e; }
  const tPronto = Date.now() - t0;
  await page.waitForTimeout(1500);

  await prova("apertura", async () => { expect(await page.evaluate(() => P.walls.length)).toBeGreaterThan(3); });
  await prova("vista 3D (WebGL)", async () => {
    expect(await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.isMesh) n++; }); return n; })).toBeGreaterThan(10);
    expect(await page.evaluate(() => !!renderer.getContext())).toBe(true);
  });
  await prova("stanza, annulla, ripristina", async () => {
    const n = await page.evaluate(() => { const r0 = P.rooms.length; addRectRoom([20, 20], [24, 23]); const r1 = P.rooms.length; undo(); const r2 = P.rooms.length; redo(); return [r1 - r0, r2 - r0, P.rooms.length - r0]; });
    expect(n).toEqual([1, 0, 1]);
  });
  await prova("salvataggio e riapertura", async () => {
    await page.evaluate(() => { P.name = "Prova varianti"; commit(); });
    await page.waitForTimeout(2500);
    await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 120_000 });
    expect(await page.evaluate(() => P.name)).toBe("Prova varianti");
  });
  await prova("export DXF, IFC, GLB", async () => {
    const r = await page.evaluate(async () => ({ dxf: exportDXF().endsWith("EOF"), ifc: /^ISO-10303-21;/.test(exportIFC().text),
      glb: (await new Promise((res, rej) => new THREE.GLTFExporter().parse(exportRoot(), res, rej, { binary: true }))).byteLength }));
    expect(r.dxf).toBe(true); expect(r.ifc).toBe(true); expect(r.glb).toBeGreaterThan(10_000);
  });
  await prova("tavole PDF", async () => { expect(await page.evaluate(() => buildSheets().pages.length)).toBeGreaterThanOrEqual(3); });
  await prova("raccolta progetti (IndexedDB)", async () => { expect(await page.evaluate(async () => { await saveToIdb(); return (await projList()).length; })).toBeGreaterThan(0); });
  await prova("nessuno scorrimento orizzontale", async () => { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); });
  await prova("nessun errore nella pagina", async () => { expect(errors).toEqual([]); });

  await page.screenshot({ path: `${OUT}/${info.project.name}.png` });
  appendFileSync(`${OUT}/varianti.jsonl`, JSON.stringify({ variante: info.project.name, pronto_ms: tPronto, esiti }) + "\n");
  const difetti = Object.entries(esiti).filter(([, v]) => v !== "ok");
  expect(difetti, JSON.stringify(difetti)).toEqual([]);
});
