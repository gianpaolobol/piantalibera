// Persistenza: errore di quota in localStorage (B1) e due schede (B9).
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "test-results/revisione";
const ready = page => page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
test("persistenza: progetto oltre la quota di localStorage, poi ricarica", async ({ page }) => {
  await page.goto("/"); await ready(page); await page.waitForTimeout(1000);
  // stato di partenza salvato; poi una modifica che non entra più in localStorage (si simula la quota piena)
  await page.evaluate(() => { P.name = "Versione A"; commit(); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === "pianta-libera-v2"){ const e = new DOMException("pieno", "QuotaExceededError"); throw e; } return orig.call(this, k, v); };
    P.name = "Versione B"; P.walls.push({id:"nuovo", level:P.levels[0].id, a:[20,20], b:[25,20], thick:.3, height:null, mat:"intonaco"}); commit(); });
  await page.waitForTimeout(3000);
  const idbPrima = await page.evaluate(async () => JSON.parse((await projGet(P.pid)).data).name);
  await page.reload(); await ready(page); await page.waitForTimeout(5000);
  const dopo = await page.evaluate(async () => ({ name: P.name, walls: P.walls.length, idb: JSON.parse((await projGet(P.pid)).data).name }));
  console.log("PERSIST", JSON.stringify({ idbPrima, ...dopo }));
});

test("due schede con progetti diversi", async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const a = await ctx.newPage(); await a.goto("/"); await ready(a); await a.waitForTimeout(1500);
  await a.evaluate(() => { P.name = "Progetto A"; commit(); });
  const b = await ctx.newPage(); await b.goto("/"); await ready(b); await b.waitForTimeout(1500);
  await b.evaluate(async () => { const p = sampleProject(); p.name = "Progetto B"; p.pid = null; await openProjectData(p); });
  await b.waitForTimeout(2500);
  await a.evaluate(() => { P.walls.pop(); commit(); });   // modifica nella scheda A
  await a.waitForTimeout(2500);
  await b.reload(); await ready(b); await b.waitForTimeout(3000);
  const res = await b.evaluate(async () => ({ nomeB: P.name, progetti: (await projList()).map(r => r.name) }));
  console.log("DUESCHEDE", JSON.stringify(res));
  await ctx.close();
});
