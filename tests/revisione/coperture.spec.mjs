import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const OUT = "test-results/revisione"; mkdirSync(OUT, { recursive: true });
for (const type of ["flat", "gable", "hip", "shed"]) test("tetto L " + type, async ({ page }) => {
  await page.goto("/"); await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await page.evaluate(type => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    const L = P.levels[0]; L.roof = {type, pitch:30, overhang:.5, mat:"tegole"};
    const C = [[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]];
    for (let i = 0; i < C.length; i++) P.walls.push({id:"w"+i, level:L.id, a:C[i], b:C[(i+1)%C.length], thick:.3, height:null, mat:"intonaco"});
    commit(); rebuild3D(); camPreset("top");
  }, type);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/tetto-L-${type}.png` });
});
