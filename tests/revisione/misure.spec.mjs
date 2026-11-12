// Schermate, accessibilità (axe), prestazioni, persistenza: prove esplorative della revisione.
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const OUT = "test-results/revisione"; mkdirSync(OUT, { recursive: true });
const ready = page => page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
const VPS = { desktop: [1440, 900], tablet: [1024, 768], telefono: [390, 844] };

for (const [nome, [w, h]] of Object.entries(VPS)) for (const scheme of ["light", "dark"]) test(`schermate ${nome} ${scheme}`, async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, hasTouch: nome !== "desktop", isMobile: nome === "telefono", ignoreHTTPSErrors: true });
  const page = await ctx.newPage(); await page.goto("/"); await ready(page); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/ui-${nome}-${scheme}.png` });
  if (scheme === "light") for (const tab of ["list", "import", "export", "ai"]){
    const t = page.locator(`[data-tab="${tab}"]`).first(); if (await t.count() && await t.isVisible()){ await t.click(); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/ui-${nome}-tab-${tab}.png` }); }
  }
  await ctx.close();
});

test("accessibilità: axe sulla pagina principale e sulle schede", async ({ page }) => {
  await page.goto("/"); await ready(page); await page.waitForTimeout(1500);
  await page.evaluate(src => (0, eval)(src), readFileSync("node_modules/axe-core/axe.min.js", "utf8"));
  const all = {};
  for (const tab of ["props", "list", "import", "export", "ai"]){
    await page.click(`[data-tab="${tab}"]`).catch(() => {}); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(n => n.target.join(" ")) })));
    all[tab] = r;
  }
  writeFileSync(`${OUT}/axe.json`, JSON.stringify(all, null, 1));
  console.log("AXE", JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.map(x => `${x.id}:${x.impact}:${x.n}`)]))));
});

test("tastiera: si raggiungono gli strumenti e il focus è visibile", async ({ page }) => {
  await page.goto("/"); await ready(page); await page.waitForTimeout(1000);
  const seq = [];
  for (let i = 0; i < 40; i++){ await page.keyboard.press("Tab"); seq.push(await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return `${e.tagName}#${e.id}.${(e.className||"").toString().slice(0,20)}[${e.getAttribute("aria-label")||e.textContent.trim().slice(0,18)}] outline=${cs.outlineStyle}/${cs.outlineWidth} shadow=${cs.boxShadow !== "none"}`; })); }
  console.log("TAB\n" + seq.join("\n"));
});

test("prestazioni: caricamento, memoria, ricostruzione del modello grande", async ({ page }) => {
  const t0 = Date.now(); await page.goto("/"); await ready(page); const tReady = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp?.startTime || 0), html: n.transferSize || n.encodedBodySize, res: performance.getEntriesByType("resource").reduce((s, r) => s + (r.encodedBodySize || 0), 0) }; });
  const big = await page.evaluate(() => {
    // 10 piani × 40 locali 4×4 con porte e 3 arredi ciascuno
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; P.levels = [];
    for (let l = 0; l < 4; l++){ const L = {id:"L"+l, name:"Piano "+l, elev:l*3.2, height:2.9, slab:.25, roof:{type:"none"}, underlay:null}; P.levels.push(L);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++){ const x = i*4, y = j*4; const C = [[x,y],[x+4,y],[x+4,y+4],[x,y+4]];
        for (let k = 0; k < 4; k++){ const id = `w${l}_${i}_${j}_${k}`; P.walls.push({id, level:L.id, a:C[k], b:C[(k+1)%4], thick:.15, height:null, mat:"intonaco"}); if (k === 0) P.openings.push({id:"o"+id, wall:id, type:"door", t:.5, w:.8, h:2.1, sill:0}); }
        P.rooms.push({id:`r${l}_${i}_${j}`, level:L.id, name:"L", mat:"parquet", pts:[[x+.075,y+.075],[x+3.925,y+.075],[x+3.925,y+3.925],[x+.075,y+3.925]]});
        for (const ref of ["divano", "tavolo", "letto"]) P.objects.push({id:`o${l}_${i}_${j}_${ref}`, level:L.id, kind:"lib", ref, x:x+2, y:y+2, z:0, rot:0, scale:1}); } }
    S.level = "L0";
    commit(); const t = performance.now(); const built = buildModel({ground:S.ground}).root; const tb = performance.now() - t; scene.remove(modelGroup); modelGroup = built; scene.add(modelGroup); const tr0 = performance.now(); render3D(); renderer.render(scene, camera); const tRender = performance.now() - tr0;
    let meshes = 0, tris = 0; modelGroup.traverse(o => { if (o.isMesh){ meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    const t2 = performance.now(); P.walls[0].thick = .2; commit(); buildModel({ground:S.ground}); const tEdit = performance.now() - t2; const tc = performance.now(); for (let i = 0; i < 5; i++) JSON.stringify(P); const tStr = (performance.now() - tc) / 5;
    const t3 = performance.now(); for (let i = 0; i < 10; i++) draw2D(); const t2d = (performance.now() - t3) / 10;
    return { walls: P.walls.length, objects: P.objects.length, rebuild_ms: Math.round(tb), render_ms: Math.round(tRender), stringify_ms: Math.round(tStr), edit_ms: Math.round(tEdit), draw2d_ms: Math.round(t2d), meshes, tris: Math.round(tris), json_kb: Math.round(JSON.stringify(P).length / 1024), calls: renderer.info.render.calls, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures };
  });
  // perdita di memoria: 10 ricostruzioni dello stesso modello
  const leak = await page.evaluate(() => { const g0 = renderer.info.memory.geometries; for (let i = 0; i < 10; i++){ P.walls[0].thick = .15 + i*.001; commit(); rebuild3D(); render3D(); } return { prima: g0, dopo: renderer.info.memory.geometries, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
  const r = { tReady, ...nav, big, leak };
  writeFileSync(`${OUT}/perf.json`, JSON.stringify(r, null, 1)); console.log("PERF", JSON.stringify(r));
});

