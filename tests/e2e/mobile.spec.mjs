// Prove su telefono e tablet: disposizione compatta, scheda del pannello, gesti a tocco, app installabile.
import { test, expect, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOCAL = process.env.PL_LOCAL_THREE;
async function routeLocal(page){
  if (LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => {
    const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]);
    return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort();
  });
  if (LOCAL) await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
}
async function open(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (/Content Security Policy|integrity/i.test(m.text())) errors.push(m.text()); });
  await routeLocal(page);
  await page.goto("/");
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await page.waitForTimeout(1200);
  return errors;
}
// gesti a tocco veri (eventi touch → pointer con pointerType "touch") tramite il protocollo di Chromium
async function touch(page){
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  return {
    async drag(from, to, steps = 8){ await send("touchStart", [from]); for (let i = 1; i <= steps; i++) await send("touchMove", [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]); await send("touchEnd", []); await page.waitForTimeout(80); },
    async tap(p){ await send("touchStart", [p]); await send("touchEnd", []); await page.waitForTimeout(120); },
  };
}
const { defaultBrowserType, ...iphone } = devices["iPhone 13"];

test.describe("telefono", () => {
  test.use({ ...iphone });

  test("una vista per volta, la pagina non scorre, il pannello sale dal basso e scorre da solo", async ({ page }) => {
    const errors = await open(page);
    expect(await page.evaluate(() => document.body.classList.contains("compact"))).toBe(true);
    expect(await page.locator("#views").getAttribute("data-mode")).toBe("2d");
    const dims = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]);
    expect(dims[0]).toBeLessThanOrEqual(dims[2]); expect(dims[1]).toBeLessThanOrEqual(dims[3] + 1);
    expect(await page.evaluate(() => document.body.dataset.sheet)).toBe("peek");
    await page.tap('[data-tab="props"]');
    expect(await page.evaluate(() => document.body.dataset.sheet)).toBe("half");
    const sc = await page.evaluate(() => { const p = $("#panel-props"); p.scrollTop = 300; return [p.scrollHeight > p.clientHeight, p.scrollTop > 0, scrollY]; });
    expect(sc).toEqual([true, true, 0]);
    await page.tap(".sheet-grip"); expect(await page.evaluate(() => document.body.dataset.sheet)).toBe("full");
    await page.tap(".sheet-grip"); expect(await page.evaluate(() => document.body.dataset.sheet)).toBe("peek");
    await page.tap('#viewSeg [data-v="3d"]'); expect(await page.locator("#views").getAttribute("data-mode")).toBe("3d");
    expect(await page.locator('#viewSeg [data-v="both"]').isVisible()).toBe(false);
    expect(errors).toEqual([]);
  });

  test("pianta a tocco: il dito sposta la vista, un tocco seleziona, si trascina solo ciò che è selezionato", async ({ page }) => {
    const errors = await open(page), t = await touch(page);
    const box = await page.locator("#c2d").boundingBox(), scr = q => page.evaluate(q => toS(q), q);
    const bed = await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); return [o.x, o.y]; });
    // trascinare sopra il letto (non selezionato) sposta la vista, non il letto
    let s = await scr(bed); const v0 = await page.evaluate(() => [V.cx, V.cy]);
    await t.drag([box.x + s[0], box.y + s[1]], [box.x + s[0] - 60, box.y + s[1] + 40]);
    expect(await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); return [o.x, o.y]; })).toEqual(bed);
    expect(await page.evaluate(() => [V.cx, V.cy])).not.toEqual(v0);
    expect(await page.evaluate(() => selList().length)).toBe(0);
    // un tocco lo seleziona, poi il trascinamento lo sposta
    s = await scr(bed); await t.tap([box.x + s[0], box.y + s[1]]);
    expect(await page.evaluate(() => selList().map(x => itemOf(x)?.ref))).toEqual(["letto2"]);
    await t.drag([box.x + s[0], box.y + s[1]], [box.x + s[0] + 40, box.y + s[1]]);
    expect(await page.evaluate(() => P.objects.find(o => o.ref === "letto2").x)).toBeGreaterThan(bed[0] + .3);
    // un tocco sul vuoto deseleziona; i locali non si trascinano col dito
    const room = await page.evaluate(() => { const r = P.rooms.find(r => r.name === "Soggiorno"); return [r.pts[0].slice(), [ (r.pts[0][0] + r.pts[2][0]) / 2 + 1.5, r.pts[0][1] + .6 ]]; });
    s = await page.evaluate(() => { const r = c2d.getBoundingClientRect(); for (let y = 60; y < r.height - 60; y += 20) for (let x = 20; x < r.width - 20; x += 20) if (!hitTest(toW(x, y))) return [x, y]; });
    await t.tap([box.x + s[0], box.y + s[1]]); expect(await page.evaluate(() => selList().length)).toBe(0);
    s = await scr(room[1]); await t.tap([box.x + s[0], box.y + s[1]]); await t.drag([box.x + s[0], box.y + s[1]], [box.x + s[0] + 50, box.y + s[1]]);
    expect(await page.evaluate(() => P.rooms.find(r => r.name === "Soggiorno").pts[0])).toEqual(room[0]);
    expect(errors).toEqual([]);
  });

  test("3D a tocco: un dito gira la vista anche sopra un oggetto non selezionato", async ({ page }) => {
    const errors = await open(page), t = await touch(page);
    await page.tap('#viewSeg [data-v="3d"]'); await page.evaluate(() => camPreset("bird")); await page.waitForTimeout(800);
    const b3 = await page.locator("#c3d").boundingBox();
    const at = await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); const v = new THREE.Vector3(o.x, level(o.level).elev + .5, o.y).project(camera); const r = c3d.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; });
    const before = await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); return [o.x, o.y, camera.position.toArray().map(v => +v.toFixed(3))]; });
    await t.drag([b3.x + at[0], b3.y + at[1]], [b3.x + at[0] + 80, b3.y + at[1]]);
    const after = await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); return [o.x, o.y, camera.position.toArray().map(v => +v.toFixed(3))]; });
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2)); expect(after[2]).not.toEqual(before[2]);
    expect(errors).toEqual([]);
  });

  test("app installabile: manifest, icone e service worker", async ({ page, request }) => {
    await open(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute("href"); expect(href).toBe("manifest.webmanifest");
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.display).toBe("standalone"); expect(m.icons.map(i => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    for (const i of m.icons) expect((await request.get("/" + i.src)).status()).toBe(200);
    expect((await request.get("/assets/app/icon-180.png")).status()).toBe(200);
    const sw = await request.get("/sw.js"); expect(sw.status()).toBe(200); expect(await sw.text()).toContain("/api/");
    expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content")).toBe("yes");
  });
});

test.describe("tablet", () => {
  const { defaultBrowserType: _, ...ipad } = devices["iPad (gen 7) landscape"];
  test.use({ ...ipad });
  test("in orizzontale resta la disposizione completa, senza scorrimento della pagina", async ({ page }) => {
    const errors = await open(page);
    expect(await page.evaluate(() => document.body.classList.contains("compact"))).toBe(false);
    const d = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight, $(".side").getBoundingClientRect().width]);
    expect(d[0]).toBeLessThanOrEqual(d[1] + 1); expect(d[2]).toBeGreaterThan(250);
    expect(errors).toEqual([]);
  });
});
