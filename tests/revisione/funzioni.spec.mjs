import { test } from "@playwright/test";
const ready = page => page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
test("funzioni varie", async ({ page }) => {
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto("/"); await ready(page); await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const out = {};
    // 1. apertura più larga del muro
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    P.walls.push({id:"w", level:P.levels[0].id, a:[0,0], b:[2,0], thick:.3, height:null, mat:"intonaco"});
    P.openings.push({id:"o", wall:"w", type:"window", t:.5, w:3, h:1.4, sill:.9}); commit();
    out.aperturaLarga = { computoMuro: computo().find(x => x.cat === "Murature")?.q ?? null };
    // 2. davanzale + altezza oltre il muro
    P.openings[0].w = 1; P.openings[0].h = 2.5; P.openings[0].sill = 1; commit();
    out.aperturaAlta = { computoMuro: +(computo().find(x => x.cat === "Murature")?.q ?? 0).toFixed(3) };
    // 3. commit con una texture importata grande nel progetto (data URL da 3 MB)
    P.materials = { imp: { nome: "foto", color: "#cccccc", mapData: "data:image/jpeg;base64," + "A".repeat(3_000_000) } };
    let t = performance.now(); commit(); out.commitTexture_ms = Math.round(performance.now() - t);
    t = performance.now(); P.walls[0].thick = .31; commit(); out.commitDopo_ms = Math.round(performance.now() - t);
    for (let i = 0; i < 20; i++){ P.walls[0].thick = .3 + i/1000; commit(); }
    out.storiaMB = Math.round(past.reduce((s, x) => s + x.length, 0) / 1048576);
    // 4. muro di lunghezza zero e spessore negativo da progetto importato
    const p = sampleProject(); p.walls[0].b = p.walls[0].a.slice(); p.walls[1].thick = -0.3; p.openings.forEach(o => o.w = -1);
    try { await openProjectData(p); out.importStrano = { walls: P.walls.length, thick1: P.walls[1].thick, ow: P.openings.map(o => o.w) }; } catch(e){ out.importStrano = "errore: " + e.message; }
    // 5. quota modificata da tastiera nel pannello: lunghezza muro con virgola
    return out;
  });
  console.log("FUNZ", JSON.stringify(r), "errori:", JSON.stringify(errs));
});
