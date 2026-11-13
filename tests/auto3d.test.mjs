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
  assert.equal(north.sill, 1, "le aperture senza prospetto prendono il davanzale tipico di 1,00 m");
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

test("etichette delle aperture: L/H confermata dalla larghezza, hb davanzale e alzatina, portafinestra, dubbio se non torna", () => {
  const d = planDrawing(), r0 = A3.analyzePlan(d.segs, d.arcs, d.texts);
  const ctr = o => { const w = r0.walls.find(x => x.id === o.wall), L = Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]); return [w.a[0] + (w.b[0]-w.a[0]) / L * o.t, w.a[1] + (w.b[1]-w.a[1]) / L * o.t]; };
  const [win1, win2] = r0.openings.filter(o => o.type === "window"), door = r0.openings.find(o => o.type === "door");
  const near = (o, txt, dy = .45) => { const c = ctr(o); return { x: c[0] + .1, y: c[1] + dy, text: txt }; };
  const cm = v => Math.round(v * 100);
  const texts = [...d.texts,
    near(win1, `${cm(win1.w)}/240`, .45), near(win1, "hb 5 cm", -.45),             // vetro alto fino a terra: portafinestra con alzatina
    near(win2, `${cm(win2.w) - 30}x140`, .45),                                      // larghezza che non torna: dubbio
    near(door, `${cm(door.w) - 10}\\P210`, .45)];                                    // luce del serramento 10 cm meno del vano: confermata
  const r = A3.analyzePlan(d.segs, d.arcs, texts), find = o => r.openings.find(x => x.wall === o.wall && Math.abs(x.t - o.t) < .01);
  const pf = find(win1), w2 = find(win2), dr = find(door);
  assert.equal(pf.type, "door"); assert.equal(pf.style, "portafinestra"); assert.equal(pf.h, 2.4); assert.equal(pf.alz, .05); assert.equal(pf.conf.ok, true);
  assert.equal(w2.conf.ok, false); assert.match(w2.conf.why, /scritto .* ma il vano è largo/);
  assert.equal(dr.type, "door"); assert.equal(dr.h, 2.1); assert.equal(dr.conf.ok, true);
  // davanzale scritto su una finestra; senza scritte il davanzale tipico è 1,00 m (combine)
  const r2 = A3.analyzePlan(d.segs, d.arcs, [...d.texts, near(win2, "HB=0,85", .45)]);
  assert.equal(r2.openings.find(x => x.wall === win2.wall && Math.abs(x.t - win2.t) < .01).sill, .85);
  const m = A3.combine(r2, [], { height: 2.7 });
  const sills = m.openings.filter(o => o.type === "window").map(o => o.sill).sort();
  assert.deepEqual(sills, [.85, 1]);
});

test("scale: gradini esterni su tre lati e rampa con freccia diventano scale, non muri", () => {
  const d = planDrawing(), base = A3.analyzePlan(d.segs, d.arcs, d.texts);
  const extra = [];
  // tre gradini davanti al muro sud (faccia esterna a y = 8), passo 30 cm, aperti verso l'edificio
  for (let k = 0; k < 3; k++){ const o = .3 * (k + 1); extra.push([2.5 - .8 - o, 8 + o, 2.5 + .8 + o, 8 + o, "0"], [2.5 - .8 - o, 8, 2.5 - .8 - o, 8 + o, "0"], [2.5 + .8 + o, 8, 2.5 + .8 + o, 8 + o, "0"]); }
  // rampa interna di 8 pedate da 90 cm con la freccia che sale verso y crescenti, sul layer delle scale (passato a parte)
  const stairSegs = []; for (let i = 0; i <= 8; i++) stairSegs.push([6, 2 + i * .28, 6.9, 2 + i * .28, "SCALA"]);
  stairSegs.push([6.45, 2.05, 6.45, 4.2, "SCALA"], [6.45, 4.2, 6.35, 4.0, "SCALA"], [6.45, 4.2, 6.55, 4.0, "SCALA"]);
  const r = A3.analyzePlan([...d.segs, ...extra], d.arcs, d.texts, { stairSegs });
  assert.equal(r.walls.length, base.walls.length, "i gradini non diventano muri");
  const g = r.stairs.find(s => s.shape === "gradini"), f = r.stairs.find(s => s.shape === "dritta");
  assert.ok(g && f, JSON.stringify(r.stairs));
  assert.equal(g.steps, 3); assert.deepEqual(g.dir.map(v => Math.round(v) + 0), [0, -1], "salgono verso l'edificio");
  assert.ok(Math.abs(g.center[1] - 8.45) < .02 && Math.abs(g.center[0] - 2.5) < .02, JSON.stringify(g.center));
  assert.equal(f.steps, 8); assert.equal(f.known, true); assert.deepEqual(f.dir.map(v => Math.round(v) + 0), [0, 1]); assert.equal(f.conf.ok, true);
  assert.ok(Math.abs(f.w - .9) < .01 && Math.abs(f.tread - .28) < .01);
});

test("prospetto: la cornice attorno alla finestra non allarga il vano e diventa cornice esterna", () => {
  const segs = [...elevSud(), ...rect(6.35, .75, 8.15, 2.45)];   // cornice da 15 cm attorno alla finestra 6,5–8 × 0,9–2,3
  const e = A3.analyzeElevation(segs);
  assert.equal(e.openings.length, 2, JSON.stringify(e.openings));
  assert.deepEqual(e.openings[1], { u0: 6.5, u1: 8, sill: .9, h: 1.4, cornice: .15 });
  const d = planDrawing(), plan = A3.analyzePlan(d.segs, d.arcs, d.texts), m = A3.combine(plan, [{ side: "sud", data: A3.prepareElevation(segs, plan, "sud") }], { height: 2.7 });
  const w = m.openings.find(o => o.cornice); assert.ok(w, "la finestra prende la cornice"); assert.equal(w.cornice.ext, .15); assert.equal(w.w, 1.5);
});
