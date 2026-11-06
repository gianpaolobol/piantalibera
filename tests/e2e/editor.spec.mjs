// Prove di base dell'editor: caricamento, disegno, persistenza, esportazioni, render di prova, telefono.
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Senza rete (sandbox) le librerie three.js possono arrivare da una copia locale: PL_LOCAL_THREE=<cartella del pacchetto three@0.147.0>
const LOCAL = process.env.PL_LOCAL_THREE;
test.beforeEach(async ({ page }) => {
  if (LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => {
    const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]);
    return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort();
  });
  if (LOCAL) await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
});
async function open(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await page.waitForTimeout(1500);
  return errors;
}

test("si apre con il progetto di esempio e senza errori", async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle("Pianta Libera");
  expect(await page.evaluate(() => P.walls.length)).toBeGreaterThan(3);
  expect(await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.isMesh) n++; }); return n; })).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test("disegna una stanza rettangolare, annulla e ripristina", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; commit(); fitPlan(); });
  await page.keyboard.press("r");
  const box = await page.locator("#c2d").boundingBox();
  await page.mouse.move(box.x + 120, box.y + 160); await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 330, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => [P.walls.length, P.rooms.length])).toEqual([4, 1]);
  await page.click("#undoBtn");
  expect(await page.evaluate(() => P.rooms.length)).toBe(0);
  await page.click("#redoBtn");
  expect(await page.evaluate(() => P.rooms.length)).toBe(1);
});

test("il progetto resta dopo il ricaricamento", async ({ page }) => {
  await open(page);
  await page.fill("#projName", "Prova persistenza"); await page.press("#projName", "Enter"); await page.locator("#projName").blur();
  await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P);
  expect(await page.evaluate(() => P.name)).toBe("Prova persistenza");
});

test("esportazioni: DXF, 3MF, OBJ e GLB producono dati validi", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const dxf = exportDXF();
    const pieces = printGroups(); const mf = model3mf(pieces);
    const glb = await new Promise((res, rej) => new THREE.GLTFExporter().parse(exportRoot(), res, rej, { binary: true }));
    return { dxf: dxf.startsWith("0\nSECTION") && dxf.endsWith("EOF"), pieces: pieces.length, mf: mf.length, glb: glb.byteLength };
  });
  expect(r.dxf).toBe(true); expect(r.pieces).toBeGreaterThanOrEqual(2); expect(r.mf).toBeGreaterThan(1000); expect(r.glb).toBeGreaterThan(10000);
});

test("render AI contro il servizio di prova: lavoro, polling, galleria e avviso di prova", async ({ page }) => {
  await open(page);
  await page.click('[data-tab="ai"]');
  await expect(page.locator("#b_preset")).toHaveValue("pianta");
  await expect(page.locator("#panel-ai")).toContainText("Servizio di prova");          // da /api/config
  await page.click("#aiGo");                                                           // senza consenso: nessun invio
  await expect(page.locator("#aiStatus")).toContainText("consenso");
  await page.check("#aiConsent");
  const sent = page.waitForRequest(r => r.url().endsWith("/api/render") && r.method() === "POST");
  await page.click("#aiGo");
  const body = JSON.parse((await sent).postData());
  expect(body.mode).toBe("fedele");
  expect(body.image.startsWith("data:image/png;base64,")).toBe(true);
  expect(body.depth.startsWith("data:image/png;base64,")).toBe(true);
  expect(body.camera.position).toHaveLength(3);
  expect(body.params.width % 16).toBe(0);
  expect(body.consent).toBe(true);
  await expect(page.locator("#aiStatus")).toContainText("render ricevuti", { timeout: 20_000 });
  await expect(page.locator("#compare")).toBeVisible();
  await expect(page.locator("#aiStatus")).toContainText("Servizio di prova");
});

test("render AI: errore chiaro se il backend non risponde", async ({ page }) => {
  await open(page);
  await page.route("**/api/render", r => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "disabled", message: "sospeso" } }) }));
  await page.click('[data-tab="ai"]'); await page.check("#aiConsent"); await page.click("#aiGo");
  await expect(page.locator("#aiStatus")).toContainText("sospeso", { timeout: 15_000 });
  await expect(page.locator("#compare")).toBeHidden();
});

test("render AI: con Turnstile richiesto non invia finché la verifica non è completata", async ({ page }) => {
  await page.route("**/api/config", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, provider: "Cloudflare Workers AI", model: "@cf/black-forest-labs/flux-2-klein-4b", generated: true, turnstile_site_key: "1x00000000000000000000AA", quota: { per_ip_daily: 2, used_today: 1 }, retention_seconds: 3600, privacy: "Le immagini sono inviate a Cloudflare." }) }));
  await page.route("https://challenges.cloudflare.com/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "window.turnstile={render:(el,o)=>{window.__ts=o;return 1},reset(){},remove(){}};" }));
  let posted = 0; await page.route("**/api/render", r => { posted++; r.fulfill({ status: 200, contentType: "application/json", headers: { "X-Quota-Remaining": "0" }, body: JSON.stringify({ id: "a".repeat(32), status: "succeeded", images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="] }) }); });
  await open(page);
  await page.click('[data-tab="ai"]');
  await expect(page.locator("#panel-ai")).toContainText("Cloudflare Workers AI");
  await expect(page.locator("#panel-ai")).toContainText("disponibili oggi: 1 su 2");
  await page.check("#aiConsent"); await page.click("#aiGo");
  await expect(page.locator("#aiStatus")).toContainText("anti-bot");
  expect(posted).toBe(0);
  await page.waitForFunction(() => window.__ts); await page.evaluate(() => window.__ts.callback("token-di-prova"));
  const sent = page.waitForRequest(r => r.url().endsWith("/api/render") && r.method() === "POST");
  await page.click("#aiGo");
  expect(JSON.parse((await sent).postData()).turnstile).toBe("token-di-prova");
  await expect(page.locator("#aiStatus")).toContainText("render ricevuti", { timeout: 20_000 });
  await expect(page.locator("#panel-ai")).toContainText("disponibili oggi: 0 su 2");
});

test("telefono: nessuno scorrimento orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});
