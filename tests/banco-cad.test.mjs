// Prove del banco CAD → BIM (tests/banco-cad/): il generatore è ripetibile e la sua verità è coerente con il disegno.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generaPianta, banco, inDXF, STILI } from "./banco-cad/genera.mjs";
import { valuta, motoreAttuale, misuraBanco } from "./banco-cad/misura.mjs";

test("stesso seme → stessa pianta; semi diversi → piante diverse", () => {
  assert.deepEqual(generaPianta(42, "difficile"), generaPianta(42, "difficile"));
  assert.notDeepEqual(generaPianta(42).verita.walls, generaPianta(43).verita.walls);
});

test("ogni linea ha un ruolo e il layer dello stile; muri, aperture e locali coerenti", () => {
  for (const st of Object.keys(STILI)){
    const p = generaPianta(5, st), ruoli = new Set(p.disegno.segs.map(s => s[5]));
    assert.ok(ruoli.has("muro") && ruoli.has("quota"), st);
    if (STILI[st].layer === "0") assert.ok(p.disegno.segs.every(s => s[4] === "0"), st);
    assert.ok(p.verita.walls.length >= 4 && p.verita.rooms.length >= 2, st);
    for (const o of p.verita.openings){ const w = p.verita.walls.find(x => x.id === o.wall), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      assert.ok(o.t - o.w / 2 > 0 && o.t + o.w / 2 < L, `${st}: apertura dentro il muro`); }
    for (const r of p.verita.rooms) assert.ok(r.area > 1, `${st}: locale ${r.name}`);
  }
});

test("la verità confrontata con sé stessa dà il 100 %", () => {
  const p = generaPianta(9, "ruotato"), v = p.verita, m = valuta(v, { walls: v.walls, openings: v.openings, rooms: v.rooms });
  for (const k of ["muri_richiamo", "muri_precisione", "spessore_esatto", "aperture_richiamo", "aperture_precisione", "aperture_tipo", "locali_trovati", "locali_area_1pct"]) assert.equal(m[k], 1, k);
});

test("DXF della pianta: tutte le linee, gli archi e i testi", () => {
  const p = generaPianta(3, "tavola"), d = inDXF(p);
  assert.equal(d.match(/\nLINE\n/g).length, p.disegno.segs.length);
  assert.equal((d.match(/\nARC\n/g) || []).length, p.disegno.arcs.length);
  assert.ok(d.endsWith("EOF"));
});

test("il motore attuale gira su tutto il banco senza errori e trova i muri della pianta ordinata", () => {
  const r = misuraBanco(banco(3), motoreAttuale());
  assert.equal(r.piante, 3 * Object.keys(STILI).length);
  assert.ok(r.perStile.ordinato.muri_richiamo > .9, JSON.stringify(r.perStile.ordinato));
});

test("fase B: il motore resta sopra le soglie sul banco (nessun passo indietro)", () => {
  const r = misuraBanco(banco(8), motoreAttuale()).totale;
  const soglie = { muri_richiamo: .99, muri_precisione: .98, aperture_richiamo: .96, aperture_tipo: .97, locali_area_1pct: .9 };
  for (const [k, v] of Object.entries(soglie)) assert.ok(r[k] >= v, `${k}: ${r[k]} < ${v}`);
});
