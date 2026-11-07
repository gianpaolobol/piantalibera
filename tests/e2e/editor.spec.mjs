// Prove di base dell'editor: caricamento, disegno, persistenza, esportazioni, render di prova, telefono.
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tavolaDXF } from "../fixtures/casa.mjs";

// Senza rete (sandbox) le librerie three.js possono arrivare da una copia locale: PL_LOCAL_THREE=<cartella del pacchetto three@0.147.0>
const LOCAL = process.env.PL_LOCAL_THREE;
test.beforeEach(async ({ page }) => routeLocal(page));
async function routeLocal(page){
  if (LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => {
    const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]);
    return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort();
  });
  // anche il lettore DXF, in sandbox: PL_LOCAL_DXF=<file dxf-parser.js>
  if (process.env.PL_LOCAL_DXF) await page.route(/dxf-parser@1\.1\.2\/dist\/dxf-parser\.js/, r => r.fulfill({ body: readFileSync(process.env.PL_LOCAL_DXF), contentType: "application/javascript" }));
  if (LOCAL) await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
}
async function open(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  // violazioni della Content Security Policy o impronte SRI non corrispondenti: vanno trattate come errori
  page.on("console", m => { const t = m.text(); if (/Content Security Policy|integrity/i.test(t)) errors.push(t); });
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
  let posted = 0; await page.route("**/api/render", r => { posted++; r.fulfill({ status: 200, contentType: "application/json", headers: { "X-Quota-Remaining": "0" }, body: JSON.stringify({ id: "a".repeat(32), status: "succeeded", generated: true, images: ["/api/render/" + "a".repeat(32) + "/image/0"] }) }); });
  await page.route("**/api/render/*/image/0", r => r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
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
  // il risultato è un URL relativo del backend, non base64
  expect(await page.locator("#cmpAfter").getAttribute("src")).toMatch(/^https?:\/\/[^/]+\/api\/render\/a{32}\/image\/0$/);
  expect(await page.locator("#cmpAfter").evaluate(img => img.complete && img.naturalWidth)).toBe(1);
});

test("libreria: ogni oggetto ha un'anteprima e la ricerca filtra", async ({ page }) => {
  await open(page);
  await page.evaluate(() => setTool("furn"));
  const cards = page.locator("#libGrid button");
  await expect(cards.first().locator("img")).toHaveJSProperty("complete", true);
  expect(await cards.count()).toBeGreaterThan(5);
  const broken = await page.evaluate(async () => { const imgs = [...document.querySelectorAll("#libGrid img")]; await Promise.all(imgs.map(i => i.decode().catch(() => {}))); return imgs.filter(i => !i.naturalWidth).length; });
  expect(broken).toBe(0);
  await page.fill("#libQ", "olivo");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Olivo");
  await cards.first().click();
  await expect(page.locator(".libsel b")).toHaveText("Olivo");
});

test("da tavola DXF (pianta + prospetti) al modello 3D", async ({ page }) => {
  await open(page);
  await page.click('[data-tab="import"]');
  await page.setInputFiles("#fA3", { name: "tavola-casa.dxf", mimeType: "application/dxf", buffer: Buffer.from(tavolaDXF()) });
  await expect(page.locator(".a3grid figure")).toHaveCount(3, { timeout: 15_000 });
  const roles = await page.locator(".a3grid select").evaluateAll(s => s.map(x => x.value).sort());
  expect(roles).toEqual(["est", "pianta", "sud"]);
  await page.click("#a3Go");
  await expect(page.locator(".a3rep")).toContainText("Creati 5 muri, 2 porte, 3 finestre e 2 locali");
  const r = await page.evaluate(() => ({ walls: P.walls.filter(w => w.level === S.level).length, rooms: P.rooms.filter(x => x.level === S.level).map(x => x.name).sort(), h: level().height, roof: level().roof }));
  expect(r.walls).toBe(5); expect(r.rooms).toEqual(["Camera", "Soggiorno"]); expect(r.h).toBe(3);
  expect(r.roof.type).toBe("gable"); expect(r.roof.ridge).toBe("x");
});

test("pianta di precisione: riquadro, duplica, quote, menu, locale automatico, lunghezza e angolo", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { PREFS.ortho = false; PREFS.autoDims = false; });
  const box = await page.locator("#c2d").boundingBox();
  const at = async p => { const s = await page.evaluate(q => toS(q), p); return [box.x + s[0], box.y + s[1]]; };
  // selezione a riquadro di tutta la casa e duplicazione
  const [ax, ay] = await at([-0.5, -0.5]), [bx, by] = await at([11.5, 8.5]);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => selList().filter(s => s.type === "wall").length)).toBe(5);
  await expect(page.locator("#panel-props")).toContainText("elementi selezionati");
  await page.keyboard.press("Control+d");
  expect(await page.evaluate(() => P.walls.length)).toBe(10);
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => P.walls.length)).toBe(5);
  // quota su tre clic
  await page.keyboard.press("q");
  for (const p of [[0, 0], [11, 0], [5, -1.2]]){ const [x, y] = await at(p); await page.mouse.click(x, y); }
  expect(await page.evaluate(() => P.dims.length)).toBe(1);
  expect(await page.evaluate(() => Math.hypot(P.dims[0].b[0] - P.dims[0].a[0], P.dims[0].b[1] - P.dims[0].a[1]))).toBeCloseTo(11, 2);
  // menu col tasto destro su un muro: dividere
  await page.keyboard.press("v");
  const [mx, my] = await at([3, 8]); await page.mouse.click(mx, my, { button: "right" });
  await expect(page.locator("#ctxMenu")).toContainText("Dividi il muro qui");
  await page.locator("#ctxMenu button", { hasText: "Dividi il muro qui" }).click();
  expect(await page.evaluate(() => P.walls.length)).toBe(6);
  // locale automatico con doppio clic dentro i muri
  await page.evaluate(() => { P.rooms = []; commit(); });
  const [rx, ry] = await at([8.3, 5]); await page.mouse.dblclick(rx, ry);
  expect(await page.evaluate(() => P.rooms.length)).toBe(1);
  expect(await page.evaluate(() => Math.abs(polyArea(P.rooms[0].pts)))).toBeCloseTo(33.03, 1);
  // muro con lunghezza e angolo digitati
  await page.locator("#c2d").click({ position: { x: 5, y: 200 } }); await page.keyboard.press("Escape");
  await page.keyboard.press("w"); const [sx, sy] = await at([0, 12]); await page.mouse.click(sx, sy); await page.mouse.move(sx + 60, sy - 10);
  await page.keyboard.type("3"); await page.keyboard.press("Tab"); await page.keyboard.type("90"); await page.keyboard.press("Enter");
  expect(await page.evaluate(() => P.walls.at(-1).b.map(v => +v.toFixed(2)))).toEqual([0, 9]);
  // aiuto
  await page.keyboard.press("Escape"); await page.keyboard.press("v"); await page.keyboard.press("?");
  await expect(page.locator("#helpBox")).toContainText("Scorciatoie");
});

test("fase 1 completata: muro ad arco, etichette locali, superfici e unità", async ({ page }) => {
  const errors = await open(page);
  const box = await page.locator("#c2d").boundingBox();
  const at = async p => { const s = await page.evaluate(q => toS(q), p); return [box.x + s[0], box.y + s[1]]; };
  await page.keyboard.press("w"); await page.selectOption("#wallShape", "arco");
  for (const p of [[0, 11], [6, 11], [3, 9.5]]){ const [x, y] = await at(p); await page.mouse.move(x, y); await page.mouse.click(x, y); }
  expect(await page.evaluate(() => P.walls.filter(w => w.arc).length)).toBeGreaterThan(8);
  await page.fill("#arcH", "2"); await page.press("#arcH", "Enter");
  expect(await page.evaluate(() => P.walls.find(w => w.arc).arc.h)).toBeCloseTo(2, 2);
  await page.selectOption("#wallShape", "dritto").catch(() => {});
  await page.keyboard.press("Escape"); await page.keyboard.press("v");
  const pos = await page.evaluate(() => roomLabelPos(P.rooms[0])); const [lx, ly] = await at(pos);
  await page.mouse.move(lx, ly); await page.mouse.down(); await page.mouse.move(lx + 40, ly + 30, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => !!P.rooms[0].lab)).toBe(true);
  const a = await page.evaluate(() => roomAreas(P.rooms[0]));
  expect(a.gross).toBeGreaterThan(a.net);
  await page.selectOption("#unitSel", "cm");
  expect(await page.evaluate(() => fmtL(3.25))).toBe("325 cm");
  expect(errors).toEqual([]);
});

test("fase 2: selezione e trascinamento in 3D, camere, metro, elenco e trascina dal catalogo", async ({ page }) => {
  const errors = await open(page);
  const box = await page.locator("#c2d").boundingBox(), b3 = await page.locator("#c3d").boundingBox();
  const at = async p => { const s = await page.evaluate(q => toS(q), p); return [box.x + s[0], box.y + s[1]]; };
  const proj = (x, y, z) => page.evaluate(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(camera); const r = c3d.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, [x, y, z]);
  await page.evaluate(() => { camPreset("bird"); setSel([]); }); await page.waitForTimeout(600);
  const o = await page.evaluate(() => { const o = P.objects.find(o => o.ref === "letto2"); return [o.x, level(o.level).elev + .5, o.y]; });
  const [sx, sy] = await proj(o[0], o[1], o[2]);
  await page.mouse.click(sx, sy);
  expect(await page.evaluate(() => selList().map(s => itemOf(s)?.ref))).toEqual(["letto2"]);
  const before = await page.evaluate(() => P.objects.find(o => o.ref === "letto2").x);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 60, sy + 10, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => P.objects.find(o => o.ref === "letto2").x)).not.toBe(before);
  await page.selectOption("#camSel", "__save");
  expect(await page.evaluate(() => P.cameras.length)).toBe(1);
  await page.click("#m3Btn");
  const pA = await proj(0, 1, 0), pB = await proj(4, 1, 0);
  await page.mouse.click(pA[0], pA[1]); await page.mouse.click(pB[0], pB[1]);
  expect(await page.evaluate(() => M3.list.length)).toBe(1);
  await page.click("#m3Btn");
  await page.click('[data-tab="list"]');
  expect(await page.locator("#panel-list tr[data-oid]").count()).toBeGreaterThan(10);
  await page.locator("#panel-list [data-ohide]").first().click();
  expect(await page.evaluate(() => P.objects.filter(o => o.hidden).length)).toBe(1);
  await page.click('[data-tab="props"]'); await page.keyboard.press("a"); await page.waitForTimeout(300);
  const n = await page.evaluate(() => P.objects.length), [tx, ty] = await at([4, 12]);
  await page.locator("#libGrid button").first().dragTo(page.locator("#c2d"), { targetPosition: { x: tx - box.x, y: ty - box.y } });
  expect(await page.evaluate(() => P.objects.length)).toBe(n + 1);
  await page.click("#walkBtn"); expect(await page.evaluate(() => WALK.on)).toBe(true);
  await page.keyboard.press("Escape"); expect(await page.evaluate(() => WALK.on)).toBe(false);
  expect(errors).toEqual([]);
});

const proj3 = (page, x, y, z) => page.evaluate(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(camera); const r = c3d.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, [x, y, z]);

test("fase 3: pennello sul lato del muro, posa, battiscopa e controsoffitto", async ({ page }) => {
  const errors = await open(page);
  const box = await page.locator("#c2d").boundingBox();
  await page.keyboard.press("b");
  await expect(page.locator("#panel-props")).toContainText("Pennello dei materiali");
  await page.locator('[data-brush="mattone"]').click();
  await page.evaluate(() => camPreset("ext")); await page.waitForTimeout(500);
  const [x, y] = await proj3(page, 10, 1.2, 8.16); await page.mouse.click(x, y);   // facciata sud, lato esterno
  const w = await page.evaluate(() => P.walls.find(w => w.a[1] === 8 && w.b[1] === 8));
  expect(w.mat).toBe("intonaco"); expect(w.matA || w.matB).toBe("mattone");
  await page.locator('[data-brush="cotto"]').click();
  const s = await page.evaluate(() => toS([3, 1])); await page.mouse.click(box.x + s[0], box.y + s[1]);
  expect(await page.evaluate(() => P.rooms[0].mat)).toBe("cotto");
  // posa diagonale, battiscopa, controsoffitto dall'ispettore
  await page.keyboard.press("v"); await page.mouse.click(box.x + s[0], box.y + s[1]);
  await page.locator("#panel-props details.exp summary", { hasText: "Posa" }).click();
  await page.fill("#rTileR", "45"); await page.press("#rTileR", "Enter");
  await page.check("#rSkirt"); await page.fill("#rCeilH", "2,6"); await page.press("#rCeilH", "Enter");
  const r = await page.evaluate(() => P.rooms[0]);
  expect(r.tile.rot).toBe(45); expect(r.skirt.h).toBeCloseTo(.08); expect(r.ceilH).toBeCloseTo(2.6);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.userData?.cat === "skirt") n++; }); return n; })).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("fase 3: porte e finestre, scala con foro nel solaio, tetti, luci e sole da data e ora", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { const d = P.openings.find(o => o.type === "door"), w = P.openings.find(o => o.type === "window"); setSel([{type:"opening", id:d.id}]); renderInspector(); });
  await page.selectOption("#oStyle", "portafinestra");
  await page.evaluate(() => { setSel([{type:"opening", id:P.openings.find(o => o.type === "window").id}]); renderInspector(); });
  await page.selectOption("#oShut", "persiane");
  expect(await page.evaluate(() => [P.openings.find(o => o.type === "door").style, P.openings.find(o => o.type === "window").shut])).toEqual(["portafinestra", "persiane"]);
  // tetti
  for (const t of ["hip", "shed"]){ await page.evaluate(t => { setSel([]); P.levels[0].roof.type = t; commit(); }, t); await page.waitForTimeout(300);
    expect(await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.userData?.cat === "roof") n += o.geometry.attributes.position.count; }); return n; })).toBeGreaterThan(20); }
  // scala dal catalogo con un piano sopra
  await page.click("#addLevel");
  await page.evaluate(() => { P.rooms.push({id:"rs", level:P.levels[1].id, name:"Sopra", mat:"parquet", pts:[[.15,.15],[10.85,.15],[10.85,7.85],[.15,7.85]]}); S.level = P.levels[0].id; commit(); renderLevels(); S.furnSrc = "lib"; S.furn = "scala_dritta"; placeFurniture([4, 4]); });
  const st = await page.evaluate(() => { const o = P.objects.at(-1); return {H:o.p.H, n:o.p.n, holes:stairHoles(o.level).length}; });
  expect(st.H).toBeCloseTo(3.15, 2); expect(st.n).toBe(18); expect(st.holes).toBe(1);
  await expect(page.locator("#panel-props")).toContainText("2a + p");
  await page.locator('[data-pp="n"]').fill("17"); await page.locator('[data-pp="n"]').press("Enter");
  expect(await page.evaluate(() => P.objects.at(-1).p.n)).toBe(17);
  // luci e sole: Bologna, 21 giugno, 13:15 → sole a sud alto ~69°; alle 21:30 è notte e le luci si accendono
  await page.evaluate(() => { S.furn = "sospensione"; placeFurniture([3, 3]); setSel([]); renderInspector(); });
  expect(await page.evaluate(() => P.objects.at(-1).z)).toBeCloseTo(2.9);
  await page.locator('[data-sunmode="1"]').click();
  await page.selectOption("#siteCity", "Bologna"); await page.fill("#siteDate", "2026-06-21");
  await page.evaluate(() => { P.site.hour = 13.25; applySite(); commit(); });
  const noon = await page.evaluate(() => P.sun); expect(noon.el).toBeGreaterThan(67); expect(Math.abs(noon.az - 180)).toBeLessThan(5);
  await page.evaluate(() => { P.site.hour = 21.75; applySite(); commit(); placeSun(); }); await page.waitForTimeout(400);
  expect(await page.evaluate(() => [P.sun.el < 0, lightsOn(), S.night])).toEqual([true, true, true]);
  expect(await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.isPointLight && o.visible) n++; }); return n; })).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("fase 3: immagine 4K, panorama 360°, coda di render e raccolta progetti", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.click('[data-tab="export"]');
  const dl = page.waitForEvent("download"); await page.click("#ex4k");
  expect((await dl).suggestedFilename()).toMatch(/vista-4k\.png$/);
  await page.evaluate(async () => { window.__pano = await renderPanorama(1024); });
  expect(await page.evaluate(() => [__pano.width, __pano.height])).toEqual([1024, 512]);
  expect(await page.evaluate(async () => new TextDecoder().decode((await panoJPEG(__pano)).slice(0, 600)).includes("equirectangular"))).toBe(true);
  // coda: due viste contro il servizio di prova
  await page.click('[data-tab="ai"]'); await page.check("#aiConsent");
  await page.click("#aiqAdd"); await page.evaluate(() => camPreset("bird")); await page.click("#aiqAdd");
  await page.click("#aiqRun");
  await expect(page.locator("#aiStatus")).toContainText("2 di 2 render completati", { timeout: 60_000 });
  // raccolta progetti
  await page.evaluate(() => saveToIdb()); await page.click("#projBtn");
  await expect(page.locator(".proj")).toHaveCount(1);
  await page.click("#projNew");
  await expect.poll(() => page.evaluate(() => P.walls.length)).toBe(0);
  await page.evaluate(() => saveToIdb()); await page.click("#projBtn");
  await expect(page.locator(".proj")).toHaveCount(2);
  await page.locator("[data-popen]").first().click();
  await expect.poll(() => page.evaluate(() => P.walls.length)).toBe(5);
  expect(errors).toEqual([]);
});

test("fase 4: tavole in PDF, SVG e DXF, computo con prezzi, IFC leggibile", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.click('[data-tab="export"]');
  const sheets = await page.evaluate(() => buildSheets().pages.map(p => p.title));
  expect(sheets).toEqual(["Pianta Piano terra (quota 0,00 m)", "Prospetti", "Sezione A-A", "Computo delle quantità"]);
  let dl = page.waitForEvent("download"); await page.click("#tvPdf"); const pdf = await (await dl).path();
  const bytes = readFileSync(pdf); expect(bytes.subarray(0, 5).toString()).toBe("%PDF-"); expect(bytes.toString("latin1")).toMatch(/\/Count 4/);
  dl = page.waitForEvent("download"); await page.click("#tvSvg"); expect((await dl).suggestedFilename()).toMatch(/tavole-svg\.zip$/);
  const svg = await page.evaluate(() => pageSVG(buildSheets().pages[1])); expect(svg).toContain("Prospetto sud"); expect(svg.startsWith("<svg")).toBe(true);
  // computo: quantità e importo con un prezzo
  await page.click('[data-tab="list"]');
  const muro = page.locator("tr", { hasText: "Muro sp. 30 cm" }).locator("[data-price]");
  await muro.fill("85"); await muro.press("Enter");
  await expect(page.locator("tr", { hasText: "Muro sp. 30 cm" })).toContainText(/7\.?922,00/);
  // IFC letto da web-ifc
  const ifc = await page.evaluate(() => exportIFC().text);
  const W = await import("web-ifc"); const api = new W.IfcAPI(); await api.Init();
  const id = api.OpenModel(new TextEncoder().encode(ifc)), n = t => api.GetLineIDsWithType(id, t).size();
  expect([n(W.IFCWALL), n(W.IFCDOOR), n(W.IFCWINDOW), n(W.IFCSPACE), n(W.IFCBUILDINGSTOREY)]).toEqual([5, 2, 6, 2, 1]);
  let meshes = 0; api.StreamAllMeshes(id, () => { meshes++; }); expect(meshes).toBeGreaterThan(10); api.CloseModel(id);
  expect(errors).toEqual([]);
});

test("fase 4: link per il cliente in sola lettura con commenti in pianta", async ({ page, context }) => {
  const errors = await open(page);
  await page.click('[data-tab="export"]');
  await page.click("#shCreate"); await expect(page.locator("#shStatus")).toContainText("consenso");
  await page.check("#shConsent"); await page.click("#shCreate");
  await expect(page.locator("#shLink")).toHaveValue(/condividi=[a-z0-9]{12}/);
  const link = await page.locator("#shLink").inputValue();
  expect(await page.evaluate(() => JSON.stringify(sharePayload()).includes("prices"))).toBe(false);
  const v = await context.newPage(); await routeLocal(v); const verr = []; v.on("pageerror", e => verr.push(e.message));
  await v.goto(link); await v.waitForFunction(() => S.viewer && P?.walls.length === 5, null, { timeout: 20_000 });
  await expect(v.locator("#tools")).toBeHidden(); await expect(v.locator("#panel-props")).toContainText("Progetto condiviso");
  const vb = await v.locator("#c2d").boundingBox(), wall = await v.evaluate(() => toS([0, 4])), before = await v.evaluate(() => JSON.stringify(P.walls));
  await v.mouse.move(vb.x + wall[0], vb.y + wall[1]); await v.mouse.down(); await v.mouse.move(vb.x + wall[0] + 60, vb.y + wall[1], { steps: 4 }); await v.mouse.up();
  await v.keyboard.press("Delete");
  expect(await v.evaluate(() => JSON.stringify(P.walls))).toBe(before);
  await v.click("#cmAdd"); const sp = await v.evaluate(() => toS([3, 3])); await v.mouse.click(vb.x + sp[0], vb.y + sp[1]);
  await v.fill("#cmAuthor", "Laura"); await v.fill("#cmText", "Finestra più grande qui"); await v.click("#cmSend");
  await expect(v.locator(".cmts")).toContainText("Finestra più grande qui");
  expect(verr).toEqual([]);
  await page.bringToFront(); await page.click("#shLoad");
  await expect(page.locator(".cmts")).toContainText("Laura");
  await page.locator(".cmts [data-cres]").first().click();
  await expect(page.locator(".cmts li.done")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("link con modifica: il cliente invia una proposta, il progettista la apre e può tornare indietro", async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.click('[data-tab="export"]');
  await page.check('input[name="shMode"][value="edit"]'); await page.check("#shConsent"); await page.click("#shCreate");
  await expect(page.locator("#shLink")).toHaveValue(/condividi=[a-z0-9]{12}#modifica=[a-f0-9]{48}$/);
  const link = await page.locator("#shLink").inputValue(), mine = await page.evaluate(() => localStorage.getItem("pianta-libera-v2"));
  const g = await context.newPage(); await routeLocal(g); const gerr = []; g.on("pageerror", e => gerr.push(e.message));
  await g.goto(link); await g.waitForFunction(() => S.guest && P?.walls.length === 5, null, { timeout: 20_000 });
  await expect(g.locator("#tools")).toBeVisible();
  await g.evaluate(() => { P.walls = P.walls.filter(w => w.thick > .2); P.name = "ignorato"; commit(); });          // il cliente toglie il tramezzo
  expect(await g.evaluate(() => P.walls.length)).toBe(4);
  expect(await g.evaluate(() => localStorage.getItem("pianta-libera-v2"))).toBe(mine);                         // il progetto del browser non cambia
  await g.reload(); await g.waitForFunction(() => S.guest && P?.walls.length === 4, null, { timeout: 20_000 }); // il lavoro riprende
  await g.click("#guestTag"); await g.click("#gSend"); await expect(g.locator("#shStatus")).toContainText("consenso");
  await g.fill("#gAuthor", "Marco"); await g.fill("#gNote", "Via il tramezzo, open space"); await g.check("#gConsent"); await g.click("#gSend");
  await expect(g.locator(".exp .ok")).toContainText("Modifiche inviate");
  expect(gerr).toEqual([]);
  await page.bringToFront(); await page.click("#shLoad");
  await expect(page.locator(".proposal")).toContainText("Marco"); await expect(page.locator(".proposal")).toContainText("open space");
  await page.click("#shPropRev"); await expect(page.locator("#shStatus")).toContainText("cosa cambiare");   // serve una risposta
  await page.fill("#shReply", "Va bene, approvato"); await page.click("#shPropOk"); await expect(page.locator(".proposal")).toHaveCount(0);
  expect(await page.evaluate(() => [P.walls.length, !!P.share, P.share.mode, P.name])).toEqual([4, true, "edit", "Casa unifamiliare (esempio)"]);
  await expect(page.locator(".vlist li").first()).toContainText("approvata"); await expect(page.locator(".vlist li")).toHaveCount(2);
  // il cliente rivede lo storico con la risposta; la versione approvata è quella del link
  await g.reload(); await g.waitForFunction(() => S.guest && P?.walls.length === 4, null, { timeout: 20_000 });
  await g.click("#guestTag"); await expect(g.locator(".vlist li").first()).toContainText("Va bene, approvato");
  // il progettista può riaprire una versione dello storico e tornare indietro
  await page.locator("details.vers summary").click(); await page.locator('[data-vopen="1"]').click(); await page.waitForFunction(() => P.walls.length === 5);
  await page.evaluate(() => undo()); expect(await page.evaluate(() => P.walls.length)).toBe(4);
  // torna in sola lettura: il vecchio link non permette più di modificare
  await page.click("#shMode"); await expect(page.locator("#shStatus")).toContainText("sola lettura");
  await g.evaluate(() => localStorage.removeItem("pianta-libera-ospite-" + S.guest.id)); await g.reload();
  await g.waitForFunction(() => S.viewer && P?.walls.length === 4, null, { timeout: 20_000 });   // la versione approvata
  expect(errors).toEqual([]);
});

test("modalità proprietario: niente Turnstile e quota del proprietario nel pannello", async ({ page }) => {
  await page.route("**/api/config", async r => { const res = await r.fetch(); const d = await res.json(); const own = r.request().headers()["x-owner-token"] === "codice-proprietario-di-prova";
    await r.fulfill({ json: { ...d, mock: false, provider: "Cloudflare Workers AI", turnstile_site_key: "0x4AAA", quota: own ? { owner: true, renders_left_estimate: 42 } : { per_ip_daily: 2, used_today: 0 } } }); });
  const errors = await open(page);
  await page.click('[data-tab="ai"]');
  await expect(page.locator("#panel-ai")).toContainText("su 2");
  await page.locator("#panel-ai summary", { hasText: "proprietario" }).click();
  await page.fill("#ownCode", "codice-proprietario-di-prova"); await page.click("#ownSave");
  await expect(page.locator("#panel-ai")).toContainText("Modalità proprietario"); await expect(page.locator("#panel-ai")).toContainText("42");
  await expect(page.locator("#aiTurnstile")).toHaveCount(0);
  await page.locator("#panel-ai summary", { hasText: "proprietario" }).click(); await page.click("#ownOff"); await expect(page.locator("#panel-ai")).toContainText("su 2");
  expect(errors.filter(e => !/turnstile|challenges/i.test(e))).toEqual([]);
});

test("fase 4: ritocco con maschera e galleria salvata nel progetto", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.click('[data-tab="ai"]'); await page.check("#aiConsent"); await page.click("#aiGo");
  await expect(page.locator("#aiStatus")).toContainText("render ricevuti", { timeout: 30_000 }); await page.click("#cmpMask");
  const mb = await page.locator("#mkMask").boundingBox();
  await page.click("#mkGo"); await expect(page.locator("#mkStatus")).toContainText("Dipingi");
  await page.mouse.move(mb.x + mb.width * .3, mb.y + mb.height * .5); await page.mouse.down(); await page.mouse.move(mb.x + mb.width * .5, mb.y + mb.height * .6, { steps: 5 }); await page.mouse.up();
  await page.fill("#mkPrompt", "divano verde"); await page.click("#mkGo");
  await expect.poll(() => page.evaluate(() => aiResults[0]?.mode || ""), { timeout: 30_000 }).toContain("ritocco");
  await page.waitForTimeout(800); await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await expect.poll(() => page.evaluate(() => aiResults.length), { timeout: 10_000 }).toBe(2);
  expect(errors).toEqual([]);
});

test("fase 4: video, anteprima di stampa e pannello staccabile", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  // il Chromium «headless shell» della CI non registra fotogrammi dal canvas: lì si verifica il messaggio d'errore chiaro
  const vid = await page.evaluate(async () => { try { const r = await recordVideo("giro", .5, 360); return [r.ext, r.blob.size]; } catch(e){ return ["errore", e.message]; } });
  if (vid[0] === "errore") expect(vid[1]).toContain("non ha registrato fotogrammi");
  else { expect(["mp4", "webm"]).toContain(vid[0]); expect(vid[1]).toBeGreaterThan(5_000); }
  expect(await page.evaluate(() => [renderer.getPixelRatio() > 0, controls.enabled, VID.on])).toEqual([true, true, false]);
  await page.click('[data-tab="export"]'); await page.click("#exPrev");
  await expect(page.locator("#printBox")).toContainText("Tutti i pezzi entrano nel piatto"); await page.keyboard.press("Escape");
  await page.click("#sideFloat"); expect(await page.evaluate(() => getComputedStyle(document.querySelector(".side")).position)).toBe("fixed");
  await page.click("#sideDock"); expect(await page.evaluate(() => getComputedStyle(document.querySelector(".side")).position)).toBe("relative");
  expect(errors).toEqual([]);
});

test("sicurezza: un progetto preparato ad arte non inserisce codice nella pagina", async ({ page }) => {
  const errors = await open(page);
  const evil = '"><img src=x onerror="window.__xss=1">';
  await page.evaluate(async evil => {
    const p = JSON.parse(JSON.stringify(sampleProject()));
    p.levels[0].id = evil; for (const w of p.walls) w.level = evil; for (const r of p.rooms) r.level = evil; for (const o of p.objects) o.level = evil;
    p.objects[0].id = evil + "2"; p.cameras = [{id:evil + "3", name:"<b>x</b>", pos:[1, 2, 3], target:[0, 0, 0], fov:45}];
    p.materials = {mm:{nome:"<img src=x onerror=window.__xss=2>", color:'red;"><img src=x onerror="window.__xss=3', map:"javascript:alert(1)"}};
    p.sky = {kind:"ph", url:"https://attaccante.example/cielo.hdr", nome:"x"};
    await openProjectData(p);
  }, evil);
  await page.click('[data-tab="list"]'); await page.click('[data-tab="props"]'); await page.evaluate(() => { setTool("wall"); setTool("select"); renderLevelTabs(); renderCamSel(); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  const p = await page.evaluate(() => ({lid:P.levels[0].id, wl:P.walls[0].level, mat:P.materials.mm, sky:P.sky}));
  expect(p.lid).toMatch(/^[A-Za-z0-9_-]+$/); expect(p.wl).toBe(p.lid); expect(p.mat.map).toBeUndefined(); expect(p.mat.color).toBe("#cccccc"); expect(p.sky.kind).toBe("asset");
  expect(await page.evaluate(() => P.walls.length)).toBe(5);
  expect(errors).toEqual([]);
});

test("informazioni, privacy, termini, licenza e versione dello schema", async ({ page, context }) => {
  const errors = await open(page);
  // la CSP blocca davvero uno script incorporato non previsto
  await page.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__inj = 1"; document.body.appendChild(s); });
  expect(await page.evaluate(() => window.__inj)).toBeUndefined();
  await page.waitForTimeout(300); expect(errors.some(e => /Content Security Policy/.test(e))).toBe(true); errors.length = 0;
  await page.click("#infoBtn");
  const links = await page.locator("#helpBox .info-links a").evaluateAll(a => a.map(x => x.getAttribute("href")));
  expect(links).toEqual(["privacy.html", "termini.html", "https://github.com/gianpaolobol/piantalibera"]);
  for (const [f, h] of [["privacy.html", "Informativa sul trattamento dei dati"], ["termini.html", "Termini d'uso"]]){
    const v = await context.newPage(); await v.goto("/" + f); await expect(v.locator("h1")).toHaveText(h); await expect(v.locator("body")).toContainText("GianPaolo Franceschini Architettura"); await v.close();
  }
  await page.click("#helpClose");
  // il consenso del render rimanda all'informativa
  await page.click('[data-tab="ai"]'); await expect(page.locator('label:has(#aiConsent) a[href="privacy.html"]')).toHaveCount(1);
  // schema: i file esportati sono alla versione 3; un progetto più recente si apre con un avviso
  expect(await page.evaluate(() => projectData().version)).toBe(3);
  await page.evaluate(async () => { const p = sampleProject(); p.version = 99; await openProjectData(p); });
  await expect(page.locator("#toast")).toContainText("versione più recente");
  expect(await page.evaluate(() => P.version)).toBe(3);
  expect(errors).toEqual([]);
});

test("telefono: nessuno scorrimento orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});
