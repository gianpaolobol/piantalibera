// Prove esplorative della revisione: misure, computo, tavole, export. Non fanno parte della suite.
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = "test-results/revisione"; mkdirSync(OUT, { recursive: true });
async function open(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await page.waitForTimeout(1200);
  return errors;
}
// stanza 5×4 m in asse, muri 30 cm, h 2,70; porta 90×210, finestra 120×140 davanzale 90
const setup = () => {
  P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; P.dims = [];
  const L = P.levels[0]; L.height = 2.7; L.roof = {type:"none", pitch:30, overhang:.5, mat:"tegole"};
  const C = [[0,0],[5,0],[5,4],[0,4]];
  for (let i = 0; i < 4; i++) P.walls.push({id:"w"+i, level:L.id, a:C[i].slice(), b:C[(i+1)%4].slice(), thick:.3, height:null, mat:"intonaco"});
  P.rooms.push({id:"r1", level:L.id, name:"Soggiorno", mat:"parquet", pts:[[.15,.15],[4.85,.15],[4.85,3.85],[.15,3.85]], skirt:{h:.08, mat:"bianco"}});
  P.openings.push({id:"d1", wall:"w0", type:"door", t:.3, w:.9, h:2.1, sill:0});
  P.openings.push({id:"f1", wall:"w2", type:"window", t:.5, w:1.2, h:1.4, sill:.9});
  commit(); fitPlan(); rebuild3D();
};

test("computo: confronto con il calcolo a mano", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(setup).then(() => page.evaluate(() => ({ rows: computo().map(x => [x.cat, x.voce, x.um, +x.q.toFixed(3)]), areas: roomAreas(P.rooms[0]) })));
  writeFileSync(OUT + "/computo.json", JSON.stringify(r, null, 1));
  // a mano: asse 18 m × 2,70 = 48,60 − 1,89 − 1,68 = 45,03 m²; volume 13,509 m³
  // finitura interna: filo interno 4,70+3,70 → 16,8 × 2,7 = 45,36 − 3,57 = 41,79 m²; esterna 5,3+4,3 → 19,2 × 2,7 = 51,84 − 3,57 = 48,27 m²
  // pavimento 4,70 × 3,70 = 17,39 m²; battiscopa 16,8 − 0,9 = 15,9 m
  console.log(JSON.stringify(r));
  expect(errors).toEqual([]);
});

test("copertura: pianta a L, superficie della falda", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    const L = P.levels[0]; L.roof = {type:"flat", pitch:0, overhang:0, mat:"tegole"};
    const C = [[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]];
    for (let i = 0; i < C.length; i++) P.walls.push({id:"w"+i, level:L.id, a:C[i], b:C[(i+1)%C.length], thick:.3, height:null, mat:"intonaco"});
    commit(); rebuild3D();
    const row = computo().find(x => x.cat === "Copertura");
    // superficie reale in pianta (filo esterno) 10,3×4,3 + 4,3×6 ≈ 70,1 m²; il riquadro ne dà 10,3² ≈ 106
    let roofArea = 0; modelGroup.traverse(o => { if (o.isMesh && /tetto|roof|copert/i.test(o.name + (o.userData?.kind||""))) roofArea++; });
    return { q: row?.q, roofMeshes: roofArea };
  });
  console.log("TETTO_L", JSON.stringify(r));
});

test("IFC e DXF della stanza di prova: misure", async ({ page }) => {
  await open(page); await page.evaluate(setup);
  const r = await page.evaluate(() => ({ ifc: exportIFC().text, dxf: exportDXF(), obj: typeof exportOBJ === "function" }));
  writeFileSync(OUT + "/stanza.ifc", r.ifc); writeFileSync(OUT + "/stanza.dxf", r.dxf);
  const W = await import("web-ifc"); const api = new W.IfcAPI(); await api.Init();
  const id = api.OpenModel(new TextEncoder().encode(r.ifc)), n = t => api.GetLineIDsWithType(id, t).size();
  console.log("IFC", JSON.stringify({ walls:n(W.IFCWALL), wstd: n(W.IFCWALLSTANDARDCASE), doors:n(W.IFCDOOR), win:n(W.IFCWINDOW), open:n(W.IFCOPENINGELEMENT), space:n(W.IFCSPACE), slab:n(W.IFCSLAB), qty:n(W.IFCELEMENTQUANTITY), pset:n(W.IFCPROPERTYSET), mat:n(W.IFCMATERIAL), rel:n(W.IFCRELVOIDSELEMENT), fill:n(W.IFCRELFILLSELEMENT) }));
  api.CloseModel(id);
});

test("tavole: scala e quote della pianta", async ({ page }) => {
  await open(page); await page.evaluate(setup);
  const r = await page.evaluate(() => { const s = buildSheets(); return { pages: s.pages.map(p => p.title), svg: pageSVG(s.pages[0]) }; });
  writeFileSync(OUT + "/pianta.svg", r.svg);
  const testi = [...r.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  console.log("TESTI", JSON.stringify(testi.slice(0, 80)));
});
