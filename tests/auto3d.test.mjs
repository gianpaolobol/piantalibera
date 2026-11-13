// Prove del motore «pianta + prospetti → 3D» (editor-src/075-auto3d.js) su disegni sintetici.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A3 = new Function(readFileSync(new URL("../editor-src/075-auto3d.js", import.meta.url), "utf8") + "; return A3;")();
import { L, rect, planDrawing, elevSud, elevEst } from "./fixtures/casa.mjs";

test("pianta: muri dalle coppie di linee, spessori, giunzioni", () => {
  const d = planDrawing(), r = A3.analyzePlan(d.segs, d.arcs, d.texts);
  assert.deepEqual(r.thicknesses, [.12, .3], "l'armadio non diventa un muro");
  assert.equal(r.walls.length, 5, JSON.stringify(r.walls));
  const south = r.walls.find(w => Math.abs(w.a[1] - 7.85) < .01 && Math.abs(w.b[1] - 7.85) < .01);
  assert.ok(south, "muro sud sull'asse");
  assert.deepEqual([Math.min(south.a[0], south.b[0]), Math.max(south.a[0], south.b[0])].map(v => +v.toFixed(2)), [.15, 9.85]);
  const part = r.walls.find(w => w.thick === .12);
  assert.deepEqual([part.a[1], part.b[1]].map(v => +v.toFixed(2)).sort((a,b)=>a-b), [.15, 7.85], "il tramezzo arriva all'asse dei muri esterni");
});

test("pianta: porte dagli archi, finestre dai vetri", () => {
  const d = planDrawing(), r = A3.analyzePlan(d.segs, d.arcs, d.texts);
  assert.equal(r.openings.length, 4, JSON.stringify(r.openings));
  const byType = t => r.openings.filter(o => o.type === t);
  assert.equal(byType("door").length, 2); assert.equal(byType("window").length, 2);
  const sDoor = r.openings.find(o => o.type === "door" && Math.abs(o.w - 1) < .01);
  const wall = r.walls.find(w => w.id === sDoor.wall), x0 = Math.min(wall.a[0], wall.b[0]);
  assert.ok(Math.abs(x0 + sDoor.t - 2.5) < .02, "porta sud centrata a x=2,5");
});

test("pianta: locali chiusi con nome e pavimento", () => {
  const d = planDrawing(), r = A3.analyzePlan(d.segs, d.arcs, d.texts);
  assert.equal(r.rooms.length, 2, JSON.stringify(r.rooms.map(x => x.area)));
  const names = r.rooms.map(x => x.name).sort(); assert.deepEqual(names, ["Camera", "Soggiorno"]);
  const sog = r.rooms.find(x => x.name === "Soggiorno");
  assert.ok(sog.area > 40 && sog.area < 44, String(sog.area));
  const xs = sog.pts.map(p => p[0]), ys = sog.pts.map(p => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - .3) < .06 && Math.abs(Math.max(...ys) - 7.7) < .06, JSON.stringify(sog.pts));
});

test("prospetto: gronda, falda, aperture senza persiane né telai interni", () => {
  const e = A3.analyzeElevation(elevSud());
  assert.equal(e.width, 10); assert.equal(e.eave, 3);
  assert.equal(e.roof.kind, "gable-side"); assert.ok(Math.abs(e.roof.ridge - 4.9) < .01);
  assert.equal(e.openings.length, 2, JSON.stringify(e.openings));
  assert.deepEqual(e.openings[0], { u0: 2, u1: 3, sill: 0, h: 2.2 });
  assert.deepEqual(e.openings[1], { u0: 6.5, u1: 8, sill: .9, h: 1.4 });
  const est = A3.analyzeElevation(elevEst());
  assert.equal(est.roof.kind, "gable-end"); assert.ok(Math.abs(est.roof.pitch - 25.5) < 1, String(est.roof.pitch));
});

test("unione: altezze e davanzali dai prospetti, copertura a due falde", () => {
  const d = planDrawing(), plan = A3.analyzePlan(d.segs, d.arcs, d.texts);
  const m = A3.combine(plan, [{ side: "sud", data: A3.analyzeElevation(elevSud()) }, { side: "est", data: A3.analyzeElevation(elevEst()) }]);
  assert.equal(m.height, 3);
  assert.equal(m.roof.type, "gable"); assert.equal(m.roof.ridge, "x"); assert.ok(m.roof.pitch > 20 && m.roof.pitch < 30, String(m.roof.pitch));
  const win = m.openings.find(o => o.type === "window" && Math.abs(o.w - 1.5) < .01 && plan.walls.find(w => w.id === o.wall).a[1] > 7);
  assert.equal(win.sill, .9); assert.equal(win.h, 1.4);
  assert.equal(m.openings.length, 5, "la finestra del prospetto est è aggiunta");
  const east = m.openings.at(-1), ew = plan.walls.find(w => w.id === east.wall);
  assert.ok(Math.abs(ew.a[0] - 9.85) < .01);
  const yC = Math.min(ew.a[1], ew.b[1]) + east.t; assert.ok(Math.abs(yC - (8 - 3.6)) < .05, String(yC));
  const north = m.openings.find(o => plan.walls.find(w => w.id === o.wall).a[1] < .2 && o.type === "window");
  assert.equal(north.sill, .9, "le aperture senza prospetto prendono i valori tipici");
});

test("unità diverse tra pianta e prospetto (cm, mm) si riconoscono", () => {
  const d = planDrawing(), plan = A3.analyzePlan(d.segs, d.arcs, d.texts);
  for (const k of [.01, .001, 100]){
    const e = A3.prepareElevation(elevSud().map(s => [s[0]*k, s[1]*k, s[2]*k, s[3]*k, s[4]]), plan, "sud");
    assert.equal(e.unitFactor, 1/k); assert.equal(e.eave, 3);
    assert.equal(A3.combine(plan, [{ side: "sud", data: e }]).height, 3);
  }
  assert.equal(A3.prepareElevation(elevSud(), plan, "sud").unitFactor, 1);
});

test("tavola unica: pianta e prospetti separati ed etichettati", () => {
  const d = planDrawing();
  const flip = d.segs.map(s => [s[0], -s[1], s[2], -s[3], s[4]]); // DXF: y verso l'alto
  const sud = elevSud().map(s => [s[0] + 20, s[1] - 12, s[2] + 20, s[3] - 12, s[4]]);
  const est = elevEst().map(s => [s[0] + 40, s[1] - 12, s[2] + 40, s[3] - 12, s[4]]);
  const cl = A3.clusterDrawings({ segs: [...flip, ...sud, ...est], arcs: d.arcs.map(a => ({ ...a, cy: -a.cy })), texts: [{ x: 25, y: -13.5, text: "PROSPETTO SUD" }, { x: 44, y: -13.5, text: "Prospetto Est" }, { x: 5, y: -9.5, text: "PIANTA PIANO TERRA" }] });
  assert.equal(cl.length, 3);
  assert.deepEqual(cl.map(c => c.guess).sort(), ["est", "pianta", "sud"]);
  assert.equal(A3.sideFromText("PROSPETTO OVEST"), "ovest"); assert.equal(A3.sideFromText("Fronte nord"), "nord"); assert.equal(A3.sideFromText("Estate"), null);
});

test("fiducia per la revisione: superficie scritta diversa, vano senza simbolo, muri sicuri", () => {
  const d = planDrawing(), r = A3.analyzePlan(d.segs, d.arcs, d.texts);
  assert.ok(r.walls.every(w => w.conf && w.conf.ok), JSON.stringify(r.walls.map(w => w.conf)));
  const sog = r.rooms.find(x => x.name === "Soggiorno");
  assert.equal(sog.conf.ok, false); assert.match(sog.conf.why, /superficie scritta 24,5 m²/);
  // senza archi né vetri le aperture restano, ma sono dubbi
  const nudo = A3.analyzePlan(d.segs.filter(s => s[4] !== "FINESTRE"), [], d.texts);
  assert.ok(nudo.openings.length >= 3 && nudo.openings.every(o => o.conf.ok === false && /senza simbolo/.test(o.conf.why)));
});

test("muro a linea singola sul perimetro: diventa un muro stimato (dubbio) e il locale si chiude", () => {
  const d = planDrawing();
  // la faccia esterna del muro nord manca (disegnata con una sola linea verso il confinante)
  const segs = d.segs.filter(s => !(s[1] === 0 && s[3] === 0 && s[4] === "MURI"));
  const r = A3.analyzePlan(segs, d.arcs, d.texts);
  const nord = r.walls.filter(w => /linea singola/.test(w.conf.why || ""));
  assert.ok(nord.length >= 1, JSON.stringify(r.walls.map(w => w.conf)));
  assert.ok(nord.every(w => Math.abs(w.a[1] - .15) < .02 && Math.abs(w.b[1] - .15) < .02), "verso il lato libero, sulla faccia interna");
  assert.equal(r.rooms.length, 2);
});

test("tipo di disegno: la pianta con le porte è una pianta anche con l'etichetta di un prospetto vicino", () => {
  const d = planDrawing(), up = d.segs.map(s => [s[0], -s[1], s[2], -s[3], s[4]]);
  const arcs = d.arcs.map(a => ({ ...a, cy: -a.cy, sweep: Math.PI / 2 })), texts = [{ x: 3, y: -9, text: "PROSPETTO NORD" }, { x: 3, y: -4, text: "SOGGIORNO mq 41,74" }, { x: 8, y: -4, text: "CAMERA mq 25,9" }];
  const cl = A3.clusterDrawings({ segs: up, arcs, texts });
  assert.equal(cl.length, 1); assert.equal(cl[0].kind, "pianta"); assert.equal(cl[0].guess, "pianta");
});
