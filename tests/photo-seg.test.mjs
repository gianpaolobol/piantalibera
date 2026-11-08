// Segmentazione di «Da foto al 3D» (shared/photo-seg.js) su maschere sintetiche di una stanza nota.
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelMap, wallCorners, segComponents, mergeSegmentation, fitPolyline } from "../shared/photo-seg.js";

/* stanza vista dall'interno, 400×300: parete di fondo tra x=120 e x=300, soffitto a y=60 (sinistra) → 70 (destra),
   pavimento a y=220 → 230; pareti laterali che scendono/salgono verso i bordi; porta sulla parete di fondo
   (tagliata in due da una sedia), finestra a destra */
function room() {
  const W = 400, H = 300, names = ["wall", "floor", "ceiling", "door", "windowpane", "chair", "sofa"], lab = new Uint8Array(W * H);
  const ceilY = x => x < 120 ? 60 - (120 - x) * .35 : x > 300 ? 70 - (x - 300) * .4 : 60 + (x - 120) * 10 / 180;
  const floorY = x => x < 120 ? 220 + (120 - x) * .5 : x > 300 ? 230 + (x - 300) * .55 : 220 + (x - 120) * 10 / 180;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lab[y * W + x] = y < ceilY(x) ? 2 : y >= floorY(x) ? 1 : 0;
  const rect = (x0, y0, x1, y1, k) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) lab[y * W + x] = k; };
  rect(150, 100, 185, 222, 3); rect(140, 160, 195, 175, 5);       // porta interrotta da una sedia
  rect(240, 110, 285, 180, 4);                                       // finestra
  rect(200, 190, 290, 240, 6);                                       // divano davanti alla parete (copre la giunzione)
  const segs = names.map((label, k) => ({ label, mask: { width: W, height: H, data: Uint8Array.from(lab, v => v === k ? 255 : 0) } }));
  return { segs, W, H };
}

test("spigoli della parete di fondo dalle linee soffitto-parete e parete-pavimento, nonostante il divano", () => {
  const { segs, W, H } = room(), m = labelMap(segs, 400), q = wallCorners(m);
  assert.ok(q && q.ceiling && q.conf > .5);
  const px = p => [p[0] * (W - 1), p[1] * (H - 1)];
  const near = (p, e, tol) => assert.ok(Math.hypot(px(p)[0] - e[0], px(p)[1] - e[1]) < tol, `${px(p)} lontano da ${e}`);
  near(q.cl, [120, 60], 6); near(q.cr, [300, 70], 6); near(q.fl, [120, 220], 6); near(q.fr, [300, 230], 6);
});
test("componenti: la porta tagliata dalla sedia torna intera; finestra, sedia e divano separati", () => {   // la sedia è un unico blocco
  const m = labelMap(room().segs, 400), c = segComponents(m);
  const door = c.filter(x => x.category === "porta"); assert.equal(door.length, 1);
  assert.ok(Math.abs(door[0].box[1] - 100 / 300) < .02 && Math.abs(door[0].box[3] - 222 / 300) < .02);
  assert.deepEqual(c.map(x => x.category).sort(), ["divano", "finestra", "porta", "sedia"]);
});
test("unione: porta e portafinestra sullo stesso vano → una sola apertura; gli elementi solo del modello restano esclusi", () => {
  const m = labelMap(room().segs, 400), comps = segComponents(m), q = wallCorners(m);
  const items = [
    { category: "portafinestra", label: "Portafinestra", box: [.36, .3, .5, .75], source: "modello" },
    { category: "porta", label: "Porta", box: [.33, .35, .47, .74], source: "modello" },
    { category: "divano", label: "Divano", box: [.5, .62, .73, .8], source: "rilevatore" },
    { category: "tappeto", label: "Tappeto", box: [.1, .9, .3, 1], source: "modello" },
  ];
  const out = mergeSegmentation(items, comps, q);
  const open = out.filter(o => /porta|finestra/.test(o.category) && !o.doubt);
  assert.equal(open.filter(o => o.category !== "finestra").length, 1, JSON.stringify(open));   // un solo vano porta attivo
  assert.ok(open.some(o => o.category === "finestra" && o.source === "segmentazione"));        // la finestra mancante si aggiunge
  assert.equal(out.find(o => o.category === "tappeto").doubt, true);
  assert.ok(!out.find(o => o.category === "divano").doubt);
});
test("spezzata: tre tratti quando ci sono due spigoli, uno solo se la linea è dritta", () => {
  const P3 = [], P1 = [];
  for (let x = 0; x < 300; x += 2) { P3.push([x, x < 100 ? 50 - (100 - x) * .5 : x > 200 ? 55 - (x - 200) * .5 : 50 + (x - 100) * .05]); P1.push([x, 40 + x * .02]); }
  assert.equal(fitPolyline(P3, 300).segs.length, 3); assert.equal(fitPolyline(P1, 300).segs.length, 1);
});
