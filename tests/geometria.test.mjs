// Geometria della pianta (shared/geometria.js): misure confrontate con il calcolo a mano (#64).
import { test } from "node:test";
import assert from "node:assert/strict";
import { wallFrame, projOnSeg, polyArea, polyCentroid, inPoly, wallFaceLengths } from "../shared/geometria.js";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const W = (id, a, b, thick = .3) => ({ id, level: "L", a, b, thick });
const rect = (x0, y0, x1, y1, t = .3) => { const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; return C.map((p, i) => W("w" + i, p, C[(i + 1) % 4], t)); };

test("asse del muro, proiezione su un segmento, superfici e baricentro", () => {
  const f = wallFrame(W("a", [0, 0], [3, 4])); near(f.len, 5); near(f.ux, .6); near(f.nx, -.8);
  const q = projOnSeg([2, 5], [0, 0], [4, 0]); near(q.d, 5); near(q.t, .5);
  near(projOnSeg([-3, 0], [0, 0], [4, 0]).t, 0);
  near(Math.abs(polyArea([[0, 0], [5, 0], [5, 4], [0, 4]])), 20);
  near(Math.abs(polyArea([[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]])), 64);
  const c = polyCentroid([[0, 0], [4, 0], [4, 2], [0, 2]]); near(c[0], 2); near(c[1], 1);
  assert.equal(inPoly([2, 1], [[0, 0], [4, 0], [4, 2], [0, 2]]), true); assert.equal(inPoly([5, 1], [[0, 0], [4, 0], [4, 2], [0, 2]]), false);
});

test("facce di una stanza 5×4 con muri da 30 cm: interno 4,70/3,70, esterno 5,30/4,30", () => {
  const ws = rect(0, 0, 5, 4);
  for (const [i, inner, outer] of [[0, 4.7, 5.3], [1, 3.7, 4.3], [2, 4.7, 5.3], [3, 3.7, 4.3]]){ const r = wallFaceLengths(ws[i], ws); near(r.A, inner); near(r.B, outer); }
});

test("angolo a 135°: le facce si accorciano e si allungano di t/2 · tan 22,5°", () => {
  const ws = [W("p", [0, 0], [5, 0]), W("q", [5, 0], [8, 3])], r = wallFaceLengths(ws[0], ws), d = .15 * Math.tan(Math.PI / 8);
  near(r.A, 5 - d); near(r.B, 5 + d);
});

test("innesto a T: il tramezzo si ferma sui fili, il muro passante perde lo spessore del tramezzo da un lato", () => {
  const ws = [...rect(0, 0, 5, 4), W("t", [2.5, 0], [2.5, 4], .1)];
  const stem = wallFaceLengths(ws[4], ws); near(stem.A, 3.7); near(stem.B, 3.7);
  const top = wallFaceLengths(ws[0], ws); near(top.A, 4.6); near(top.B, 5.3);
});

test("muri allineati e muro isolato: nessuna correzione", () => {
  const ws = [W("a", [0, 0], [2, 0]), W("b", [2, 0], [5, 0])], r = wallFaceLengths(ws[0], ws); near(r.A, 2); near(r.B, 2);
  const s = wallFaceLengths(W("x", [0, 0], [3, 0]), []); near(s.A, 3); near(s.B, 3);
});

test("muri di piani diversi non si raccordano", () => {
  const a = W("a", [0, 0], [5, 0]), b = { ...W("b", [5, 0], [5, 4]), level: "L1" }, r = wallFaceLengths(a, [a, b]); near(r.A, 5); near(r.B, 5);
});
