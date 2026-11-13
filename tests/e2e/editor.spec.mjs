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
  await page.click("#a3Go");                                   // riconosci → revisione → crea (fase C)
  await expect(page.locator(".a3rev")).toContainText("5 muri, 2 porte, 3 finestre, 2 locali");
  await page.click("#a3Make");
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
  test.setTimeout(150_000);   // molte interazioni nel 3D: con le prove in parallelo può superare il minuto e mezzo
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
  await expect(page.locator("#levelSel")).toBeHidden();               // U8: con la pianta visibile si usano le schede
  await page.click('#tag2d [data-lvl="+"]');
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

test("modalità proprietario: accesso nascosto, niente Turnstile e quota del proprietario nel pannello", async ({ page }) => {
  await page.route("**/api/config", async r => { const res = await r.fetch(); const d = await res.json(); const own = r.request().headers()["x-owner-token"] === "codice-proprietario-di-prova";
    await r.fulfill({ json: { ...d, mock: false, provider: "Cloudflare Workers AI", turnstile_site_key: "0x4AAA", quota: own ? { owner: true, renders_left_estimate: 42 } : { per_ip_daily: 2, used_today: 0 } } }); });
  const errors = await open(page);
  await page.click('[data-tab="ai"]');
  await expect(page.locator("#panel-ai")).toContainText("su 2");
  await expect(page.locator("#panel-ai")).not.toContainText("proprietario");                 // nessuna traccia visibile per i visitatori
  for (let i = 0; i < 5; i++) await page.click(".brand b");                                  // accesso nascosto: 5 tocchi sul nome
  await page.fill("#ownCode", "codice-sbagliato-ma-lungo"); await page.click('#ownForm button[type="submit"]');
  await expect(page.locator("#ownMsg")).toContainText("non riconosciuto");
  await page.fill("#ownCode", "codice-proprietario-di-prova"); await page.click('#ownForm button[type="submit"]');
  await expect(page.locator("#helpBox")).toHaveCount(0);
  await expect(page.locator("#panel-ai")).toContainText("42"); await expect(page.locator("#panel-ai .owner-line")).toContainText("Proprietario");
  await expect(page.locator("#aiTurnstile")).toHaveCount(0);
  await page.click("#ownOff"); await expect(page.locator("#panel-ai")).toContainText("su 2");
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
  expect(links).toEqual(["privacy.html", "termini.html", "https://github.com/gianpaolobol/piantalibera", "scarica.html"]);
  await expect(page.locator("#installBox")).toContainText("app");
  for (const [f, h] of [["privacy.html", "Informativa sul trattamento dei dati"], ["termini.html", "Termini d'uso"], ["scarica.html", "Scarica Pianta Libera"]]){
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

test("tipi di muro: pulsanti, faccia interna ferma, angoli raccordati, predefinito; porta specchiata", async ({ page }) => {
  const errors = await open(page);
  // muro sud (0,0)-(11,0) da 30 cm, locali a nord: diventa esterno 40+15 e cresce verso l'esterno
  const id = await page.evaluate(() => { const w = P.walls.find(w => w.a[1] === 0 && w.b[1] === 0); setSel([{type:"wall", id:w.id}]); S.tab = "props"; renderTabs(); renderInspector(); return w.id; });
  await page.click('.wtypes[data-scope="sel"] [data-wt="e55"]');
  const r = await page.evaluate(id => { const w = P.walls.find(w => w.id === id), o = P.walls.find(x => x !== w && x.level === w.level && Math.hypot(x.b[0] - w.a[0], x.b[1] - w.a[1]) < 1e-4);
    return {thick:w.thick, wtype:w.wtype, layers:w.layers, inner:+(w.a[1] + w.thick / 2).toFixed(4), corner:!!o, def:[S.defaults.wallThick, S.defaults.wallType]}; }, id);
  expect(r.thick).toBe(.55); expect(r.wtype).toBe("e55"); expect(r.layers).toEqual({core:.4, insul:.15});
  expect(r.inner).toBe(.15);                          // la faccia interna resta a 15 cm (filo del locale)
  expect(r.corner).toBe(true);                        // il muro ovest è ancora raccordato all'angolo
  expect(r.def).toEqual([.55, "e55"]);                // diventa il predefinito dei nuovi muri
  await expect(page.locator('.wtypes[data-scope="sel"] [data-wt="e55"]')).toHaveAttribute("aria-pressed", "true");
  // tramezzo: cambia dall'asse; «Altro» in centimetri
  const tid = await page.evaluate(() => { const w = P.walls.find(w => w.thick < .2); setSel([{type:"wall", id:w.id}]); renderInspector(); return w.id; });
  const ax0 = await page.evaluate(id => P.walls.find(w => w.id === id).a[0], tid);
  await page.click('.wtypes[data-scope="sel"] [data-wt="t8"]'); expect(await page.evaluate(id => [P.walls.find(w => w.id === id).thick, P.walls.find(w => w.id === id).a[0]], tid)).toEqual([.08, ax0]);
  await page.fill("#wtCm-sel", "15"); await page.locator("#wtCm-sel").dispatchEvent("change");
  expect(await page.evaluate(id => P.walls.find(w => w.id === id).thick, tid)).toBe(.15);
  // porta: Specchia porta la cerniera dall'altro lato
  const f0 = await page.evaluate(() => { const o = P.openings.find(o => o.type === "door"); setSel([{type:"opening", id:o.id}]); const f = o.flip || 0; transformSel("mirror"); return [f, P.openings.find(x => x.id === o.id).flip]; });
  expect(f0[1]).toBe(f0[0] ^ 1);
  expect(errors).toEqual([]);
});

test("telefono: nessuno scorrimento orizzontale", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
});

test("porta in 3D: Specchia sposta la maniglia, «Apre dall'altro lato» sposta l'anta; pulsanti nel pannello", async ({ page }) => {
  await open(page);
  // centro della maniglia (metallo) e dell'anta (legno) del modello, per la sola porta scelta
  const probe = () => page.evaluate(() => {
    const o = P.openings.find(o => o.type === "door" && (!o.style || o.style === "battente"));
    const w = P.walls.find(w => w.id === o.wall), c = {s0:o.t - o.w/2, s1:o.t + o.w/2, o}, pcs = [];
    const piece = (s0, s1, y0, y1, d, mat, cat, off = 0) => pcs.push({mat, cat, s:(s0 + s1)/2, off});
    buildOpeningFill(w, c, piece, 0, 0, o.h, w.thick);
    const handle = pcs.filter(p => p.mat === "metallo"), leaf = pcs.find(p => p.cat === "door");
    return {id:o.id, flip:o.flip || 0, hs:+(handle.reduce((a, p) => a + p.s, 0) / handle.length).toFixed(3), leafOff:+leaf.off.toFixed(3), mid:+o.t.toFixed(3)};
  });
  const a = await probe();
  await page.evaluate(id => { setSel([{type:"opening", id}]); renderInspector(); }, a.id);
  await page.click("#oHinge");
  const b = await probe();
  expect(b.flip).toBe(a.flip ^ 1);
  expect(Math.sign(b.hs - b.mid)).toBe(-Math.sign(a.hs - a.mid));          // maniglia dall'altra parte
  await page.click("#oSide");
  const c = await probe();
  expect(c.flip).toBe(b.flip ^ 2); expect(c.leafOff).toBe(-b.leafOff); expect(c.leafOff).not.toBe(0);
});

test("nuova versione pubblicata: avviso con Aggiorna", async ({ page }) => {
  await open(page);
  await page.route(/\/(\?.*)?$/, async r => {
    if (!r.request().headers()["x-pl-version-check"]) return r.continue();
    const res = await r.fetch(); const body = (await res.text()).replace(/'sha256-[^']+'/, "'sha256-NUOVA'");
    return r.fulfill({ response: res, body });
  });
  await page.evaluate(() => checkNewVersion(true));
  await expect(page.locator("#newVersion")).toBeVisible();
  await page.click("#nvNo"); await expect(page.locator("#newVersion")).toHaveCount(0);
  // stessa versione: nessun avviso
  await page.unroute(/\/(\?.*)?$/);
  await page.evaluate(() => checkNewVersion(true)); await page.waitForTimeout(500);
  await expect(page.locator("#newVersion")).toHaveCount(0);
});

// Revisione 11/2026, #53 #54 #65: computo confrontato con il calcolo a mano
test("computo: finiture per lato, battiscopa e aperture coincidono con il calcolo a mano", async ({ page }) => {
  const errors = await open(page);
  const q = await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; P.dims = [];
    const L = P.levels[0]; L.height = 2.7; L.roof = {type:"none", pitch:30, overhang:.5, mat:"tegole"};
    const C = [[0, 0], [5, 0], [5, 4], [0, 4]];
    // percorso con il locale a sinistra: lato A interno (intonaco sabbia), lato B esterno (intonaco grigio)
    for (let i = 0; i < 4; i++) P.walls.push({id:"w" + i, level:L.id, a:C[i].slice(), b:C[(i + 1) % 4].slice(), thick:.3, height:null, mat:"intonaco", matA:"intonaco_sab", matB:"intonaco_gr"});
    P.rooms.push({id:"r1", level:L.id, name:"Soggiorno", mat:"parquet", pts:[[.15, .15], [4.85, .15], [4.85, 3.85], [.15, 3.85]], skirt:{h:.08, mat:"bianco"}});
    P.openings.push({id:"d1", wall:"w0", type:"door", t:2.5, w:.9, h:2.1, sill:0}, {id:"f1", wall:"w2", type:"window", t:2.5, w:1.2, h:1.4, sill:.9});
    commit();
    const rows = computo(), sum = re => +rows.filter(x => re.test(x.voce)).reduce((s, x) => s + x.q, 0).toFixed(2);
    const a = {muro:sum(/^Muro sp/), interno:sum(/sabbia/), esterno:sum(/grigio/), pavimento:sum(/^Pavimento/), battiscopa:sum(/^Battiscopa/)};
    // apertura più larga del muro: non si sottrae più del muro
    P.walls = [{id:"x", level:L.id, a:[0, 0], b:[2, 0], thick:.3, height:null, mat:"intonaco"}]; P.rooms = []; P.openings = [{id:"o", wall:"x", type:"window", t:1, w:3, h:1.4, sill:.9}]; commit();
    a.muroConAperturaLarga = +computo().filter(x => /^Muro sp/.test(x.voce)).reduce((s, x) => s + x.q, 0).toFixed(2);
    return a;
  });
  // asse 18 × 2,70 − 1,89 − 1,68 = 45,03; filo interno 16,8 × 2,70 − 3,57 = 41,79; filo esterno 19,2 × 2,70 − 3,57 = 48,27
  expect(q).toEqual({muro:45.03, interno:41.79, esterno:48.27, pavimento:17.39, battiscopa:15.9, muroConAperturaLarga:2.6});   // 2 × 2,70 − 2 × 1,40
  expect(errors).toEqual([]);
});

// Revisione 11/2026, #52: coperture sulla sagoma della pianta, non sul rettangolo d'ingombro
test("coperture su pianta a L: il tetto segue la sagoma, computo esatto", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const out = {};
    for (const type of ["flat", "gable", "hip", "shed"]){
      P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
      const L = P.levels[0]; L.roof = {type, pitch:30, overhang:type === "flat" ? 0 : .5, mat:"tegole"};
      const C = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
      for (let i = 0; i < C.length; i++) P.walls.push({id:"w" + i, level:L.id, a:C[i], b:C[(i + 1) % C.length], thick:.3, height:null, mat:"intonaco"});
      commit();
      const root = buildModel({ground:false}).root; root.updateMatrixWorld(true);
      const roofs = []; root.traverse(o => { if (o.isMesh && o.userData.cat === "roof") roofs.push(o); });
      const hit = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)).intersectObjects(roofs, false).length > 0;
      out[type] = {area:+(computo().find(x => x.cat === "Copertura")?.q || 0).toFixed(2), sopraIlCortile:hit(7, 7), sopraLaCasa:[hit(2, 2), hit(8, 2), hit(2, 8)].every(Boolean)};
    }
    return out;
  });
  // piano senza sporto: 10,3 × 4,3 + 4,3 × 6,0 = 70,09 m²; con sporto 0,50 la sagoma dilatata è 11,3 × 5,3 + 5,3 × 6,0 = 91,69 m², a 30° ÷ cos 30°
  const falda = +(91.69 / Math.cos(Math.PI / 6)).toFixed(2);
  expect(r).toEqual({ flat:{area:70.09, sopraIlCortile:false, sopraLaCasa:true}, gable:{area:falda, sopraIlCortile:false, sopraLaCasa:true},
    hip:{area:falda, sopraIlCortile:false, sopraLaCasa:true}, shed:{area:falda, sopraIlCortile:false, sopraLaCasa:true} });
  expect(errors).toEqual([]);
});

// Revisione 11/2026, #51 #58 #69: la riapertura non perde mai la versione più recente né i modelli importati
const OBJ_CUBO = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf 1 2 3 4\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n";
const ready = page => page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function" && idbReady);
// attende che la raccolta Progetti (IndexedDB) contenga il progetto corrente con la condizione data
async function inRaccolta(page, cond){
  for (let i = 0; i < 60; i++){ if (await page.evaluate(async c => { const r = await projGet(P.pid); return !!r && new Function("d", "return " + c)(JSON.parse(r.data)); }, cond)) return; await page.waitForTimeout(300); }
  throw new Error("la raccolta non contiene: " + cond);
}
test("riapertura: salvataggio rapido pieno, si riapre la versione più recente dalla raccolta (#51)", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page); await ready(page);
  await page.evaluate(() => { P.name = "Versione A"; commit(); }); await page.waitForTimeout(2200);
  await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === "pianta-libera-v2") throw new DOMException("pieno", "QuotaExceededError"); return o.call(this, k, v); };
    P.name = "Versione B"; P.walls.push({id:"nuovo", level:P.levels[0].id, a:[20, 20], b:[25, 20], thick:.3, height:null, mat:"intonaco"}); commit(); });
  await inRaccolta(page, 'd.name === "Versione B"');
  await page.reload(); await ready(page); await page.waitForTimeout(3500);
  expect(await page.evaluate(async () => [P.name, P.walls.some(w => w.id === "nuovo"), JSON.parse((await projGet(P.pid)).data).name])).toEqual(["Versione B", true, "Versione B"]);
  expect(errors).toEqual([]);
});
test("riapertura: il modello importato resta, nel 3D e nella raccolta (#69)", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page); await ready(page);
  await page.click('[data-tab="import"]');
  await page.setInputFiles("#fModel", { name: "cubo.obj", mimeType: "text/plain", buffer: Buffer.from(OBJ_CUBO) });
  await page.waitForFunction(() => P.objects.some(o => o.kind === "import"), null, { timeout: 30_000 });
  await inRaccolta(page, "Object.keys(d.imports).length === 1");
  await page.reload(); await ready(page);
  await page.waitForFunction(() => { const o = P.objects.find(o => o.kind === "import"); return o && importStore[o.ref]; }, null, { timeout: 20_000 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(async () => Object.keys(JSON.parse((await projGet(P.pid)).data).imports).length)).toBe(1);
  expect(errors).toEqual([]);
});
test("riapertura: ogni scheda ritrova il suo progetto (#58)", async ({ page, context }) => {
  test.setTimeout(180_000);
  await open(page); await ready(page);
  await page.evaluate(() => { P.name = "Progetto A"; commit(); }); await inRaccolta(page, 'd.name === "Progetto A"');
  const b = await context.newPage(); await routeLocal(b); await b.goto("/"); await ready(b);
  await b.evaluate(async () => { const p = sampleProject(); p.name = "Progetto B"; await openProjectData(p); }); await inRaccolta(b, 'd.name === "Progetto B"');
  await page.evaluate(() => { P.walls.pop(); commit(); }); await page.waitForTimeout(2000);   // la scheda A scrive per ultima
  await b.reload(); await ready(b); await b.waitForTimeout(2500);
  expect(await b.evaluate(() => P.name)).toBe("Progetto B");
  await page.reload(); await ready(page); await page.waitForTimeout(2500);
  expect(await page.evaluate(() => P.name)).toBe("Progetto A");
});

// Revisione 11/2026, #55: le immagini incorporate non si copiano a ogni passo della storia di annulla
test("storia di annulla: una texture importata si tiene una volta sola, annulla e ripristina la conservano", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const img = "data:image/jpeg;base64," + "A".repeat(3_000_000);
    P.materials = {imp:{nome:"foto", color:"#cccccc", mapData:img}}; commit(); past.length = 0;
    for (let i = 0; i < 20; i++){ P.walls[0].thick = .3 + i / 1000; commit(); }
    const mb = historyBytes() / 1048576;
    for (let i = 0; i < 20; i++) undo();
    const dopoUndo = [P.walls[0].thick, P.materials.imp.mapData === img];
    for (let i = 0; i < 20; i++) redo();
    return {mb:+mb.toFixed(1), dopoUndo, dopoRedo:[+P.walls[0].thick.toFixed(3), P.materials.imp.mapData === img]};
  });
  expect(r.mb).toBeLessThan(5);
  expect(r.dopoUndo).toEqual([.3, true]); expect(r.dopoRedo).toEqual([.319, true]);
  expect(errors).toEqual([]);
});

// Revisione 11/2026, #62: nessuna violazione axe critica o seria (WCAG 2.2 AA) nelle cinque schede
test("accessibilità: nessuna violazione axe critica o seria nelle schede del pannello", async ({ page }) => {
  await open(page);
  await page.evaluate(src => (0, eval)(src), readFileSync("node_modules/axe-core/axe.min.js", "utf8"));
  const found = [];
  for (const tab of ["props", "list", "import", "export", "ai"]){
    await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(300);
    found.push(...await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations
      .filter(v => ["critical", "serious"].includes(v.impact)).flatMap(v => v.nodes.map(n => `${v.id} ${n.target.join(" ")}`))));
  }
  expect([...new Set(found)]).toEqual([]);
});

// Revisione 11/2026, #56: un progetto con valori fuori campo si apre corretto
test("apertura di un progetto: muri nulli, spessori, altezze e aperture fuori campo vengono corretti", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(async () => {
    const p = sampleProject(); const n0 = p.walls.length;
    p.walls[0].b = p.walls[0].a.slice(); p.walls[1].thick = -.3; p.walls[2].height = -1; p.levels[0].height = -3;
    const w1 = p.walls[1].id; p.openings.push({id:"o1", wall:w1, type:"window", t:0, w:-1, h:0, sill:-2}, {id:"o2", wall:"inesistente", type:"door", t:1, w:.9, h:2.1, sill:0});
    await openProjectData(p);
    const o1 = P.openings.find(o => o.id === "o1"), L = (w => Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]))(P.walls.find(w => w.id === w1));
    return { muri:P.walls.length === n0 - 1, spessori:P.walls.every(w => w.thick > 0), altezze:P.walls.every(w => w.height == null || w.height > 0), piano:P.levels[0].height > 0,
      apertura:o1.w > 0 && o1.h > 0 && o1.sill >= 0 && o1.t - o1.w / 2 >= -1e-9 && o1.t + o1.w / 2 <= L + 1e-9, orfana:!P.openings.some(o => o.id === "o2") };
  });
  expect(r).toEqual({ muri:true, spessori:true, altezze:true, piano:true, apertura:true, orfana:true });
  expect(errors).toEqual([]);
});

// Revisione 11/2026, #57: IFC con muri raccordati (volume = computo), materiali e Pset; DXF con la tabella dei layer
test("IFC e DXF: volumi dei muri come il computo, materiali, Pset e layer dichiarati", async ({ page }) => {
  const errors = await open(page);
  const out = await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    const L = P.levels[0]; L.height = 2.7; L.roof = {type:"none", pitch:30, overhang:.5, mat:"tegole"};
    const C = [[0, 0], [5, 0], [5, 4], [0, 4]];
    for (let i = 0; i < 4; i++) P.walls.push({id:"w" + i, level:L.id, a:C[i], b:C[(i + 1) % 4], thick:.3, height:null, mat:"intonaco"});
    P.rooms.push({id:"r", level:L.id, name:"Soggiorno", mat:"parquet", pts:[[.15, .15], [4.85, .15], [4.85, 3.85], [.15, 3.85]]});
    P.openings.push({id:"d", wall:"w0", type:"door", t:2.5, w:.9, h:2.1, sill:0}, {id:"f", wall:"w2", type:"window", t:2.5, w:1.2, h:1.4, sill:.9}); commit();
    return {ifc:exportIFC().text, dxf:exportDXF(), vol:computo().filter(x => /^Volume muri/.test(x.voce)).reduce((s, x) => s + x.q, 0)};
  });
  const W = await import("web-ifc"); const api = new W.IfcAPI(); await api.Init();
  const id = api.OpenModel(new TextEncoder().encode(out.ifc)), ids = t => { const v = api.GetLineIDsWithType(id, t); return Array.from({length:v.size()}, (_, i) => v.get(i)); };
  let vol = 0;
  api.StreamMeshes(id, ids(W.IFCWALL), m => { for (let g = 0; g < m.geometries.size(); g++){ const pg = m.geometries.get(g), geo = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()), ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()), T = pg.flatTransformation;
    const p = k => { const x = v[k*6], y = v[k*6+1], z = v[k*6+2]; return [T[0]*x + T[4]*y + T[8]*z + T[12], T[1]*x + T[5]*y + T[9]*z + T[13], T[2]*x + T[6]*y + T[10]*z + T[14]]; };
    for (let t = 0; t < ix.length; t += 3){ const a = p(ix[t]), b = p(ix[t+1]), c = p(ix[t+2]); vol += (a[0]*(b[1]*c[2] - b[2]*c[1]) - a[1]*(b[0]*c[2] - b[2]*c[0]) + a[2]*(b[0]*c[1] - b[1]*c[0])) / 6; } } });
  const psets = ids(W.IFCPROPERTYSET).map(i => api.GetLine(id, i).Name.value).sort();
  expect(Math.abs(Math.abs(vol) - out.vol)).toBeLessThan(.01);
  expect(psets.filter(n => n === "Pset_WallCommon").length).toBe(4);
  expect(psets).toContain("Pset_DoorCommon"); expect(psets).toContain("Pset_WindowCommon");
  expect(ids(W.IFCMATERIAL).length).toBeGreaterThan(1); expect(ids(W.IFCRELASSOCIATESMATERIAL).length).toBeGreaterThan(1);
  api.CloseModel(id);
  const used = new Set([...out.dxf.matchAll(/\n8\n([^\n]+)/g)].map(m => m[1])), declared = new Set([...out.dxf.matchAll(/\n0\nLAYER\n2\n([^\n]+)/g)].map(m => m[1]));
  expect([...used].filter(l => !declared.has(l))).toEqual([]);
  expect(errors).toEqual([]);
});

// Revisione 11/2026: rapporto aeroilluminante per locale e cartiglio con studio, committente e luogo
test("elenco: rapporto aeroilluminante per locale; tavole: cartiglio con i dati dello studio", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    const L = P.levels[0], C = [[0, 0], [5, 0], [5, 4], [0, 4]];
    for (let i = 0; i < 4; i++) P.walls.push({id:"w" + i, level:L.id, a:C[i], b:C[(i + 1) % 4], thick:.3, height:null, mat:"intonaco"});
    P.rooms.push({id:"r", level:L.id, name:"Soggiorno", mat:"parquet", pts:[[.15, .15], [4.85, .15], [4.85, 3.85], [.15, 3.85]]});
    // 17,39 m² netti: una finestra 120×140 (1,68 m²) → 1/10,4 (insufficiente); con una portafinestra 140×240 (3,36 m²) → 1/3,5
    P.openings.push({id:"f", wall:"w2", type:"window", t:2.5, w:1.2, h:1.4, sill:.9}); commit();
  });
  await page.click('[data-tab="list"]');
  const row = page.locator('#panel-list tr[data-rid="r"]');
  await expect(row).toContainText("1,68"); await expect(row).toContainText("1/10,4"); await expect(row).toContainText("⚠");
  await page.evaluate(() => { P.openings.push({id:"p", wall:"w0", type:"door", style:"portafinestra", t:2.5, w:1.4, h:2.4, sill:0}); commit(); });
  await expect(row).toContainText("5,04"); await expect(row).not.toContainText("⚠");
  await page.click('[data-tab="export"]');
  for (const [id, v] of [["#tvStudio", "Studio Prova Architettura"], ["#tvClient", "Famiglia Rossi"], ["#tvPlace", "Bologna, via Esempio 1"]]){ await page.fill(id, v); await page.locator(id).blur(); }
  const svg = await page.evaluate(() => pageSVG(buildSheets().pages[0]));
  expect(svg).toContain("Studio Prova Architettura"); expect(svg).toContain("Committente: Famiglia Rossi · Bologna, via Esempio 1");
  expect(await page.evaluate(() => migrate(JSON.parse(JSON.stringify(P))).tav.info.committente)).toBe("Famiglia Rossi");
  expect(errors).toEqual([]);
});

// Revisione 11/2026 (U12): primi passi nel pannello, finché non si chiudono
test("primi passi: disegna una stanza, importa, progetto vuoto; chiusi restano chiusi", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("#panel-props .intro")).toContainText("Per iniziare");
  await page.click("#inRoom"); expect(await page.evaluate(() => S.tool)).toBe("rect");
  await expect(page.locator("#panel-props .intro")).toHaveCount(0);
  await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P);
  await expect(page.locator("#panel-props .intro")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("arredi più leggeri nel 3D: stessa sagoma, meno mesh, selezione dal 3D (#63)", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    let prima = 0, dopo = 0, peggiori = [];
    const conta = G => { let n = 0; G.traverse(o => { if (o.isMesh) n++; }); return n; };
    for (const it of LIB.filter(x => x.build)){
      let A; try { A = it.build(); } catch { continue; } // alcuni modelli (scale) vogliono parametri
      A.updateMatrixWorld(true); const bA = new THREE.Box3().setFromObject(A, true), nA = conta(A);
      const B = finishTpl(it.build()); B.updateMatrixWorld(true); const bB = new THREE.Box3().setFromObject(B, true), nB = conta(B);
      prima += nA; dopo += nB;
      const d = Math.max(bA.min.distanceTo(bB.min), bA.max.distanceTo(bB.max));
      if (d > 1e-3 || nB > nA) peggiori.push(`${it.ref}: ${d.toFixed(4)} m, ${nA}→${nB}`);
    }
    return { prima, dopo, peggiori };
  });
  expect(r.peggiori).toEqual([]);
  expect(r.dopo).toBeLessThan(r.prima * 0.6);
  // un arredo nel 3D si seleziona ancora con un clic sul suo corpo
  const sel = await page.evaluate(async () => {
    const o = P.objects.find(x => LIBMAP[x.ref]?.build && !/sagoma|quercia|tiglio|betulla|olivo|cipresso|pino|palma|arbusto|siepe|vaso/.test(x.ref));
    rebuildNow?.(); let g = null; modelGroup.traverse(x => { if (x.userData?.objId === o.id) g = x; });
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    camera.position.set(c.x, c.y + 1.6, c.z + .01); camera.lookAt(c); camera.updateMatrixWorld(); // dall'alto, sotto il soffitto
    const p = c.clone().project(camera), rc = c3d.getBoundingClientRect();
    const hit = pick3D({ clientX: rc.left + (p.x + 1) / 2 * rc.width, clientY: rc.top + (1 - p.y) / 2 * rc.height });
    return { atteso: o.id, ref: o.ref, cat: hit?.object.userData.cat, nome: hit?.object.name, trovato: hit && objOf3D(hit.object)?.userData.objId, dentro: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  });
  expect(sel.dentro).toBe(true); expect(sel.trovato, JSON.stringify(sel)).toBe(sel.atteso);
});

test("un solo selettore del piano: schede sulla pianta, select in alto solo in vista 3D (U8)", async ({ page }) => {
  await open(page);
  await expect(page.locator("#tag2d .lvl").first()).toBeVisible();
  await expect(page.locator("#levelSel")).toBeHidden();
  await page.click('#viewSeg [data-v="3d"]');
  await expect(page.locator("#levelSel")).toBeVisible();
  await page.click('#viewSeg [data-v="2d"]');
  await expect(page.locator("#levelSel")).toBeHidden();
  await page.click('#tag2d [data-lvl="+"]');
  expect(await page.evaluate(() => P.levels.length)).toBe(2);
  await expect(page.locator("#tag2d .lvl:not([data-lvl='+'])")).toHaveCount(2);
});

test("revisione del riconoscimento: dubbi in giallo, togli e cambia tipo, le correzioni restano (fase C)", async ({ page }) => {
  await open(page);
  await page.click('[data-tab="import"]');
  // pianta della casa di prova con un vano senza simbolo (dubbio) nel muro nord
  const dxf = tavolaDXF();
  await page.setInputFiles("#fA3", { name: "tavola-casa.dxf", mimeType: "application/dxf", buffer: Buffer.from(dxf) });
  await expect(page.locator(".a3grid figure")).toHaveCount(3, { timeout: 15_000 });
  await page.click("#a3Go");
  await expect(page.locator(".a3prev svg line.w")).toHaveCount(5);
  // correzioni: una finestra diventa porta, un muro viene tolto
  const k = await page.evaluate(() => { const m = A3S.preview.m; const o = m.openings.find(x => x.type === "window"); A3S.dec.set(o.key, {type:"door"}); A3S.dec.set(m.walls.find(w => w.thick < .2).key, {drop:true}); renderImport(); return o.key; });
  await expect(page.locator(".a3rev")).toContainText("4 muri, 2 porte, 2 finestre");   // la porta del tramezzo tolto sparisce con lui
  // dubbi: le due correzioni e la superficie scritta nel disegno («24,5 mq») diversa da quella calcolata
  await expect(page.locator(".a3dub li")).toHaveCount(3);
  await expect(page.locator(".a3dub")).toContainText("superficie scritta 24,5 m²");
  await expect(page.locator(`.a3dub select[data-a3type="${k}"]`)).toHaveValue("door");
  // cambiare un layer rifà il riconoscimento: le correzioni restano
  await page.evaluate(() => { const L = [...document.querySelectorAll("[data-a3layer]")].find(x => x.checked); L.click(); L.click(); });
  await expect(page.locator(".a3rev")).toContainText("4 muri, 2 porte, 2 finestre");
  // «Rimetti» annulla la correzione del muro
  await page.locator(".a3dub li", { hasText: "Muro" }).locator("button").click();
  await expect(page.locator(".a3rev")).toContainText("5 muri, 3 porte, 2 finestre");
  await page.click("#a3Make");
  await expect(page.locator(".a3rep")).toContainText("Creati 5 muri, 3 porte, 2 finestre e 2 locali");
  await expect(page.locator(".a3rep")).toContainText("1 correzione della revisione applicata");
});

test("selezione nel 3D: muro, apertura e locale con il suo solaio sono evidenziati e hanno le proprietà", async ({ page }) => {
  const errors = await open(page);
  // punto dello schermo di un punto del modello (x, y quota, z = y di pianta)
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(camera), r = c3d.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, [x, y, z]);
  const clic = async p => { await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); };
  await page.click('#viewSeg button[data-v="3d"]');
  await page.waitForTimeout(400);
  // un muro che la camera vede di faccia: il primo colpito dal raggio verso il centro del suo lato senza aperture
  const tgt = await page.evaluate(() => {
    for (const w of P.walls.filter(w => w.level === S.level)){ const f = wallFrame(w), L = level(w.level);
      for (const k of [.15, .5, .85]){ const s = k * f.len; if (P.openings.some(o => o.wall === w.id && Math.abs(s - o.t) < o.w / 2 + .1)) continue;
        for (const sd of [1, -1]){ const x = w.a[0] + f.ux*s + f.nx*w.thick/2*sd, z = w.a[1] + f.uy*s + f.ny*w.thick/2*sd, y = L.elev + 1.2;
          const v = new THREE.Vector3(x, y, z), dir = v.clone().sub(camera.position).normalize(), rc = new THREE.Raycaster(camera.position, dir);
          const h = rc.intersectObject(modelGroup, true).find(h => h.object.visible && !["glass", "ground", "roof", "gable", "ceiling"].includes(h.object.userData.cat));
          const p = v.clone().project(camera);
          if (h && h.object.userData.cat === "wall" && h.point.distanceTo(v) < .05 && Math.abs(p.x) < .9 && Math.abs(p.y) < .9) return {id:w.id, x, y, z}; } } }
    return null; });
  expect(tgt, "un muro visibile nel 3D").not.toBeNull();
  await clic(await scr(tgt.x, tgt.y, tgt.z));
  expect(await page.evaluate(() => S.sel)).toMatchObject({type:"wall", id:tgt.id});
  expect(await page.evaluate(() => raySel.children.filter(c => c.isMesh).length), "sagoma del muro nel 3D").toBe(1);
  await expect(page.locator("#panel-props")).toContainText(/Muro/i);
  // pavimento: locale e solaio
  await page.evaluate(() => { S.ceilings = false; applyVisibility(); render3D(); });
  const fl = await page.evaluate(() => {   // un punto di pavimento visibile dalla camera, in un locale del piano
    const skip = ["glass", "ground", "roof", "gable", "ceiling"];
    for (const r of P.rooms.filter(r => r.level === S.level)){ const xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]), y = level(r.level).elev;
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++){ const x = Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 10, z = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * j / 10;
        if (!inPoly([x, z], r.pts)) continue; const v = new THREE.Vector3(x, y, z), p = v.clone().project(camera); if (Math.abs(p.x) > .85 || Math.abs(p.y) > .85) continue;
        const h = new THREE.Raycaster(camera.position, v.clone().sub(camera.position).normalize()).intersectObject(modelGroup, true).find(h => h.object.visible && !skip.includes(h.object.userData.cat));
        if (h && h.object.userData.cat === "floor" && h.point.distanceTo(v) < .05) return {id:r.id, x, y, z}; } }
    return null; });
  expect(fl, "un pavimento visibile nel 3D").not.toBeNull();
  await clic(await scr(fl.x, fl.y, fl.z));
  expect(await page.evaluate(() => S.sel)).toMatchObject({type:"room", id:fl.id});
  await expect(page.locator("#slabSec")).toBeVisible();
  const vol0 = await page.evaluate(() => { const g = raySel.children.find(c => c.isMesh).geometry; g.computeBoundingBox(); return g.boundingBox.max.y - g.boundingBox.min.y; });
  await page.fill("#rSlabT", "40"); await page.locator("#rSlabT").press("Enter"); await page.locator("#rSlabT").blur?.();
  await page.waitForTimeout(300);
  expect(await page.evaluate(id => P.rooms.find(r => r.id === id).slab.t, fl.id)).toBeCloseTo(.4, 5);
  const vol1 = await page.evaluate(() => { const g = raySel.children.find(c => c.isMesh).geometry; g.computeBoundingBox(); return g.boundingBox.max.y - g.boundingBox.min.y; });
  expect(vol1).toBeGreaterThan(vol0 + .1);
  await page.selectOption("#rSlabK", "legno"); await page.waitForTimeout(200);
  expect(await page.evaluate(id => P.rooms.find(r => r.id === id).slab, fl.id)).toEqual({t:.4, k:"legno"});
  // spessore fuori misura: rifiutato
  await page.fill("#rSlabT", "900"); await page.locator("#rSlabT").press("Enter"); await page.waitForTimeout(200);
  expect(await page.evaluate(id => P.rooms.find(r => r.id === id).slab.t, fl.id)).toBeCloseTo(.4, 5);
  expect(errors).toEqual([]);
});

test("Importa pianta DWG/DXF: il riconoscimento è la scelta predefinita e porta alla revisione", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; commit(); });
  await page.click('[data-tab="import"]');
  await page.setInputFiles("#fPlan", { name: "tavola-casa.dxf", mimeType: "application/dxf", buffer: Buffer.from(tavolaDXF()) });
  await expect(page.locator("#dxM")).toHaveValue("auto", { timeout: 15_000 });
  await expect(page.locator("#dxNote")).toContainText("spessore dalle due linee");
  await page.click("#dxGo");
  await expect(page.locator(".a3rev")).toContainText("5 muri, 2 porte, 3 finestre, 2 locali", { timeout: 15_000 });
  await page.click("#a3Make");
  expect(await page.evaluate(() => P.walls.filter(w => w.level === S.level).length)).toBe(5);
  expect(errors).toEqual([]);
});

test("copertura personalizzata: falde dalla copertura automatica, colmo alzato, vertice trascinato, nuova falda, pendenza, salvataggio", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { PREFS.introDone = true; setSel([]); renderInspector(); });
  await page.selectOption("#lRoof", "custom");
  const R = () => page.evaluate(() => JSON.parse(JSON.stringify(level().roof)));
  let r = await R(); expect(r.type).toBe("custom"); expect(r.falde.length).toBe(2);
  const roofMeshes = () => page.evaluate(() => { let n = 0, g = 0; modelGroup.traverse(o => { if (o.isMesh && o.userData.cat === "roof") n++; if (o.isMesh && o.userData.cat === "gable") g++; }); return [n, g]; });
  expect((await roofMeshes())[0]).toBeGreaterThan(0); expect((await roofMeshes())[1]).toBeGreaterThan(0);   // falde e timpani
  await page.click("#rfEdit");
  await expect(page.locator("#rfSec")).toBeVisible();
  // clic su un punto del colmo (quota più alta): la quota cambia anche nell'altra falda
  const scr = p => page.evaluate(p => { const s = toS(p), r = c2d.getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; }, p);
  const ridge = r.falde[0].pts.reduce((a, p) => p[2] > a[2] ? p : a);
  let s = await scr(ridge); await page.mouse.click(s[0], s[1]);
  await expect(page.locator("#rfH")).toBeVisible();
  await page.fill("#rfH", "5,50"); await page.locator("#rfH").press("Enter"); await page.waitForTimeout(250);
  r = await R(); const hits = r.falde.flatMap(f => f.pts).filter(p => Math.hypot(p[0] - ridge[0], p[1] - ridge[1]) < 1e-3);
  expect(hits.length).toBe(2); expect(hits.every(p => Math.abs(p[2] - 5.5) < 1e-6)).toBe(true);
  // trascinamento del vertice: si muovono insieme i punti condivisi
  s = await scr(ridge); const s2 = await scr([ridge[0] - 1, ridge[1]]);
  await page.mouse.move(s[0], s[1]); await page.mouse.down(); await page.mouse.move(s2[0], s2[1], { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(250);
  r = await R(); expect(r.falde.flatMap(f => f.pts).filter(p => Math.abs(p[0] - (ridge[0] - 1)) < .06 && Math.abs(p[1] - ridge[1]) < .06).length).toBe(2);
  // nuova falda disegnata: tre clic e Invio
  await page.click("#rfNew");
  for (const p of [[2, 10], [5, 10], [3.5, 12]]){ const q = await scr(p); await page.mouse.click(q[0], q[1]); }
  await page.keyboard.press("Enter"); await page.waitForTimeout(250);
  r = await R(); expect(r.falde.length).toBe(3);
  await expect(page.locator("#rfPitch")).toBeVisible();
  await page.fill("#rfPitch", "30"); await page.locator("#rfPitch").press("Enter"); await page.waitForTimeout(250);
  expect(await page.evaluate(() => faldaPitch(level().roof.falde[2]))).toBeCloseTo(30, 0);
  await page.keyboard.press("Delete"); await page.waitForTimeout(200);
  expect((await R()).falde.length).toBe(2);
  await page.keyboard.press("Escape"); expect(await page.evaluate(() => S.tool)).toBe("select");
  // salvataggio e riapertura: le falde restano
  await page.reload(); await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function"); await page.waitForTimeout(1200);
  r = await R(); expect(r.type).toBe("custom"); expect(r.falde.length).toBe(2);
  expect(await page.evaluate(() => customRoofArea(level()))).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test("porta con alzatina: campo nella scheda, soglia nel 3D, valori fuori misura rifiutati", async ({ page }) => {
  const errors = await open(page);
  const id = await page.evaluate(() => { const o = P.openings.find(o => o.type === "door"); setSel([{type:"opening", id:o.id}]); renderInspector(); draw2D(); return o.id; });
  await expect(page.locator("#oA")).toBeVisible();
  const sill3D = () => page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.isMesh && o.userData.cat === "sill") n++; }); return n; });
  const n0 = await sill3D();
  await page.fill("#oA", "12"); await page.locator("#oA").press("Enter"); await page.waitForTimeout(300);
  expect(await page.evaluate(id => P.openings.find(o => o.id === id).alz, id)).toBeCloseTo(.12, 5);
  expect(await sill3D()).toBeGreaterThan(n0 - 1);
  const bot = await page.evaluate(() => { const g = raySel.children.find(c => c.isMesh).geometry; g.computeBoundingBox(); return g.boundingBox.min.y - level().elev; });
  expect(bot).toBeCloseTo(.12, 2);
  await page.fill("#oA", "80"); await page.locator("#oA").press("Enter"); await page.waitForTimeout(200);
  expect(await page.evaluate(id => P.openings.find(o => o.id === id).alz, id)).toBeCloseTo(.12, 5);
  await page.fill("#oA", "0"); await page.locator("#oA").press("Enter"); await page.waitForTimeout(200);
  expect(await page.evaluate(id => "alz" in P.openings.find(o => o.id === id), id)).toBe(false);
  expect(errors).toEqual([]);
});
