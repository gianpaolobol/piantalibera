// Esportazione IFC4 (shared/ifc.js) provata senza browser: il file si rilegge con web-ifc e le quantità
// si confrontano con il calcolo a mano (#64). Stanza di riferimento 5×4 m in asse, muri da 30 cm alti 2,70,
// una porta 90×210 e una finestra 120×140: volume netto dei muri (18 × 2,70 − 1,89 − 1,68) × 0,30 = 13,509 m³.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as WI from "web-ifc";
import { buildIFC, ifcStr, wallOpeningArea, wallIsExternal } from "../shared/ifc.js";

const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b} (±${e})`);
function stanza(){
  const C = [[0, 0], [5, 0], [5, 4], [0, 4]];
  return { name: "Città di prova", levels: [{ id: "L0", name: "Piano terra", elev: 0, height: 2.7, slab: .3, roof: { type: "none" } }],
    walls: C.map((a, i) => ({ id: "w" + i, level: "L0", a, b: C[(i + 1) % 4], thick: .3, height: null, mat: "intonaco" })),
    openings: [{ id: "o1", wall: "w0", type: "door", t: 1.5, w: .9, h: 2.1, sill: 0, style: "battente" },
               { id: "o2", wall: "w2", type: "window", t: 2.5, w: 1.2, h: 1.4, sill: .9, style: "battente" }],
    rooms: [{ id: "r1", level: "L0", name: "Soggiorno", mat: "parquet", pts: [[.15, .15], [4.85, .15], [4.85, 3.85], [.15, 3.85]] }],
    objects: [{ id: "a1", level: "L0", name: "Tavolo", kind: "lib", ref: "tavolo6" }, { id: "a2", level: "L0", name: "Olivo", kind: "lib", ref: "olivo" }] };
}
// un tetraedro al posto della mesh dell'arredo; l'olivo (Verde) non si esporta
const opt = { now: "2026-11-12T00:00:00", fileName: "prova.ifc",
  tess: s => s.obj === "a1" ? { pts: [1, 1, 0, 2, 1, 0, 1, 2, 0, 1, 1, .75], idx: [[1, 3, 2], [1, 2, 4], [2, 3, 4], [3, 1, 4]] } : null,
  objInfo: ob => ob.ref === "olivo" ? null : { kind: "furniture" } };
const seq = () => { let i = 0; return () => "G" + String(i++).padStart(21, "0"); };

let api;
async function apri(text){ if (!api){ api = new WI.IfcAPI(); await api.Init(); } return api.OpenModel(new TextEncoder().encode(text)); }
const ids = (id, t) => { const v = api.GetLineIDsWithType(id, t); return Array.from({ length: v.size() }, (_, i) => v.get(i)); };

test("superficie dei vani e muri esterni", () => {
  const P = stanza();
  near(wallOpeningArea(P.walls[0], P.openings, 2.7), 1.89, 1e-9);
  near(wallOpeningArea(P.walls[0], [{ wall: "w0", type: "door", w: 9, h: 9, sill: 0 }], 2.7), 5 * 2.7, 1e-9);   // limitata al muro
  assert.ok(P.walls.every(w => wallIsExternal(w, P.rooms)));
  const due = [...P.rooms, { id: "r2", level: "L0", pts: [[5.15, .15], [9, .15], [9, 3.85], [5.15, 3.85]] }];
  assert.equal(wallIsExternal(P.walls[1], due), false);   // tramezzo tra due locali
  assert.equal(wallIsExternal(P.walls[1], []), true);      // senza locali: esterno
  assert.equal(ifcStr("l'è più"), "'l''\\X2\\00E8\\X0\\ pi\\X2\\00F9\\X0\\'");
});

test("IFC4 della stanza di riferimento letto con web-ifc: elementi, volume dei muri, Pset, materiali e locali", async () => {
  const { text, counts } = buildIFC(stanza(), opt);
  assert.deepEqual(counts, { walls: 4, doors: 1, windows: 1, spaces: 1, slabs: 1, other: 1 });
  const id = await apri(text), n = t => ids(id, t).length;
  assert.deepEqual([n(WI.IFCWALL), n(WI.IFCDOOR), n(WI.IFCWINDOW), n(WI.IFCSPACE), n(WI.IFCSLAB), n(WI.IFCBUILDINGSTOREY), n(WI.IFCFURNITURE)], [4, 1, 1, 1, 1, 1, 1]);
  // volume dei muri dalla geometria (vani sottratti da web-ifc)
  let vol = 0; api.StreamMeshes(id, ids(id, WI.IFCWALL), m => {
    for (let g = 0; g < m.geometries.size(); g++){ const pg = m.geometries.get(g), geo = api.GetGeometry(id, pg.geometryExpressID), T = pg.flatTransformation;
      const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()), ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      const P3 = k => { const x = v[k*6], y = v[k*6+1], z = v[k*6+2]; return [T[0]*x + T[4]*y + T[8]*z + T[12], T[1]*x + T[5]*y + T[9]*z + T[13], T[2]*x + T[6]*y + T[10]*z + T[14]]; };
      for (let t = 0; t < ix.length; t += 3){ const a = P3(ix[t]), b = P3(ix[t+1]), c = P3(ix[t+2]); vol += (a[0]*(b[1]*c[2] - b[2]*c[1]) - a[1]*(b[0]*c[2] - b[2]*c[0]) + a[2]*(b[0]*c[1] - b[1]*c[0])) / 6; } } });
  near(Math.abs(vol), 45.03 * .3, 45.03 * .3 * .02);   // livello: errore ≤ 2 %
  // insiemi di proprietà, quantità e materiali
  const props = ids(id, WI.IFCPROPERTYSET).map(x => api.GetLine(id, x).Name.value);
  assert.equal(props.filter(x => x === "Pset_WallCommon").length, 4);
  assert.deepEqual([props.includes("Pset_DoorCommon"), props.includes("Pset_WindowCommon")], [true, true]);
  const ext = ids(id, WI.IFCPROPERTYSINGLEVALUE).map(x => api.GetLine(id, x)).filter(p => p.Name.value === "IsExternal");
  const isT = p => p.NominalValue.value === "T" || p.NominalValue.value === true;
  assert.equal(ext.filter(isT).length, 6); assert.equal(ext.filter(p => !isT(p)).length, 1);   // 6 elementi esterni + il solaio (interno)
  const refs = ids(id, WI.IFCPROPERTYSINGLEVALUE).map(x => api.GetLine(id, x)).filter(p => p.Name.value === "Reference").map(p => p.NominalValue.value);
  assert.ok(refs.some(r => /^Solaio (laterocemento|vespaio) \d+ cm$/.test(r)), "riferimento del solaio");
  const q = ids(id, WI.IFCQUANTITYAREA).map(x => api.GetLine(id, x)), nfa = q.find(x => x.Name.value === "NetFloorArea").AreaValue.value;
  near(nfa, 4.7 * 3.7, 1e-6);
  const nsa = q.filter(x => x.Name.value === "NetSideArea").reduce((s, x) => s + x.AreaValue.value, 0); near(nsa, 45.03, 1e-6);
  const mats = ids(id, WI.IFCMATERIAL).map(x => api.GetLine(id, x).Name.value).sort();
  assert.deepEqual(mats, ["intonaco", "legno", "parquet", "serramento"]);
  assert.equal(n(WI.IFCRELASSOCIATESMATERIAL), 4);
  assert.match(text, /IFCPROJECT\('[^']+',\$,'Citt\\X2\\00E0\\X0\\ di prova'/);
  api.CloseModel(id);
});

test("stesso progetto e stessi identificativi → stesso file; più piani in ordine di quota", async () => {
  const a = buildIFC(stanza(), { ...opt, guid: seq() }).text, b = buildIFC(stanza(), { ...opt, guid: seq() }).text;
  assert.equal(a, b);
  const P = stanza(); P.levels.unshift({ id: "L1", name: "Primo", elev: 3, height: 2.7, slab: .3, roof: { type: "gable" } });
  P.walls.push(...P.walls.map(w => ({ ...w, id: w.id + "s", level: "L1" })));
  const roof = { pts: [0, 0, 2.7, 5, 0, 2.7, 2.5, -4, 4], idx: [[1, 2, 3]] };
  const { text, counts } = buildIFC(P, { ...opt, tess: s => s.roof === "L1" ? roof : opt.tess(s) });
  assert.equal(counts.walls, 8); assert.equal(counts.other, 2);   // arredo + copertura
  const id = await apri(text);
  const piani = ids(id, WI.IFCBUILDINGSTOREY).map(x => api.GetLine(id, x)).map(s => [s.Name.value, s.Elevation.value]);
  assert.deepEqual(piani, [["Piano terra", 0], ["Primo", 3]]);
  assert.equal(ids(id, WI.IFCROOF).length, 1);
  api.CloseModel(id);
});
