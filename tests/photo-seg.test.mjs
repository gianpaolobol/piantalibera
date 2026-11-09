// Segmentazione di «Da foto al 3D» (shared/photo-seg.js) su maschere sintetiche di una stanza nota.
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelMap, wallCorners, segComponents, mergeSegmentation, fitPolyline, fitRoomBox } from "../shared/photo-seg.js";

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

/* stanza «fotografata» con una fotocamera nota: la mappa delle etichette si costruisce col raggio di ogni pixel */
function boxMap({ hfov = 65, p = -5, yaw = 10, hc = .55, dl = 1.2, dr = .8, db = 1.6, W = 320, H = 240, occl = false }) {
  const f = .5 / Math.tan(hfov * Math.PI / 360), r = H / W, rad = Math.PI / 180, lab = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = (i + .5) / W - .5, y = -((j + .5) / H - .5) * r, cp = Math.cos(p * rad), sp = Math.sin(p * rad);
    const d0 = [x, y * cp + f * sp, y * sp - f * cp], cy = Math.cos(yaw * rad), sy = Math.sin(yaw * rad), d = [d0[0] * cy + d0[2] * sy, d0[1], -d0[0] * sy + d0[2] * cy];
    let t = Infinity, k = 0;
    if (d[1] < 0 && -hc / d[1] < t) { t = -hc / d[1]; k = 1; } if (d[1] > 0 && (1 - hc) / d[1] < t) { t = (1 - hc) / d[1]; k = 2; }
    const tw = Math.min(d[2] < 0 ? -db / d[2] : 1e9, d[0] < 0 ? -dl / d[0] : 1e9, d[0] > 0 ? dr / d[0] : 1e9); if (tw < t) k = 0;
    if (occl && j > H * .55 && i > W * .2 && i < W * .8) k = 3;          // grande mobile davanti: copre pavimento e base della parete
    lab[j * W + i] = k;
  }
  const names = ["wall", "floor", "ceiling", "table"];
  return { m: labelMap(names.map((label, k) => ({ label, mask: { width: W, height: H, data: Uint8Array.from(lab, v => v === k ? 255 : 0) } })), W), f, r };
}
test("modello di stanza: ritrova inclinazione, rotazione, altezza della fotocamera e spigoli, anche con un mobile che copre il pavimento", () => {
  for (const occl of [false, true]) {
    const g = { hfov: 65, p: -5, yaw: 10, hc: .55, dl: 1.2, dr: .8, db: 1.6 }, { m } = boxMap({ ...g, occl }), fit = fitRoomBox(m, { hfov: 65 });
    assert.ok(fit && fit.conf > .9, JSON.stringify(fit));
    const tol = occl ? 2.5 : 1;   // con metà pavimento coperto la giunzione si vede solo ai lati
    assert.ok(Math.abs(fit.pitch - g.p) < .6 * tol && Math.abs(fit.yaw - g.yaw) < .6 * tol && Math.abs(fit.hc - g.hc) < .02 * tol, JSON.stringify(fit));
    assert.ok(Math.abs(fit.db / fit.dl - g.db / g.dl) < .05, JSON.stringify(fit));        // lo spigolo destro è fuori dalla foto: dr non si misura
    assert.ok(fit.fr[0] > .97, JSON.stringify(fit));
  }
});
test("modello di stanza: senza EXIF stima anche il campo visivo", () => {
  const { m } = boxMap({ hfov: 72, p: 3, yaw: -8, hc: .5, dl: .9, dr: 1.1, db: 2 }), fit = fitRoomBox(m, {});
  assert.ok(fit && Math.abs(fit.hfov - 72) < 5 && Math.abs(fit.pitch - 3) < 1.5, JSON.stringify(fit));
});
