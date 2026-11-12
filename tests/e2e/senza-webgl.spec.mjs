// Revisione 11/2026, #67: senza WebGL (PC senza accelerazione, macchine virtuali, desktop remoto)
// l'editor si apre, lo dice nella vista 3D e lavora in pianta: tavole, computo ed esportazioni funzionano.
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// PL_EXTRA_ARGS: argomenti in più per Chromium, separati da «|» (prove in sandbox)
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-3d-apis", ...(process.env.PL_EXTRA_ARGS || "").split("|").filter(Boolean)] } });
const LOCAL = process.env.PL_LOCAL_THREE;
test.beforeEach(async ({ page }) => {
  if (LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => { const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]); return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort(); });
});

test("messaggio nella vista 3D, pianta, tavole, computo ed export funzionano", async ({ page }) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await expect(page.locator(".no3d")).toContainText("La vista 3D non è disponibile");
  const r = await page.evaluate(() => { const r0 = P.rooms.length; addRectRoom([20, 20], [24, 23]); const n = P.rooms.length - r0; undo(); redo();
    return { nogl:NO_WEBGL, stanza:n, dxf:exportDXF().endsWith("EOF"), ifc:/^ISO-10303-21;/.test(exportIFC().text), tavole:buildSheets().pages.length > 2, computo:computo().length > 5 }; });
  expect(r).toEqual({ nogl:true, stanza:1, dxf:true, ifc:true, tavole:true, computo:true });
  for (const t of ["list", "import", "export", "ai", "props"]) await page.click(`[data-tab="${t}"]`);
  expect(errors).toEqual([]);
});
