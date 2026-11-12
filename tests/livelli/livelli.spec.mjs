// Misura ripetibile degli indicatori di docs/livelli-qualita.md. Non giudica: scrive i valori in
// test-results/livelli.json e li stampa; il confronto con i livelli si fa nel documento.
// Uso: npx playwright test -c playwright.livelli.config.mjs   (axe: npm i --no-save axe-core@4)
import { test } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const M = {}; mkdirSync("test-results/livelli", { recursive: true });
const ready = page => page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
async function open(page){ const errors = []; page.on("pageerror", e => errors.push(e.message)); await page.goto("/"); await ready(page); await page.waitForTimeout(1200); return errors; }
test.afterAll(() => { writeFileSync("test-results/livelli.json", JSON.stringify(M, null, 1)); console.log("LIVELLI " + JSON.stringify(M)); });

// stanza di riferimento: 5×4 m in asse, muri 30 cm, h 2,70, porta 90×210, finestra 120×140 (davanzale 90),
// interno intonaco sabbia, esterno intonaco grigio, pavimento con battiscopa 8 cm
const stanza = () => {
  P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; P.dims = [];
  const L = P.levels[0]; L.height = 2.7; L.roof = {type:"none", pitch:30, overhang:.5, mat:"tegole"};
  const C = [[0,0],[5,0],[5,4],[0,4]];
  // percorso antiorario in pianta (y in basso sullo schermo): il lato interno è quello a destra (B)
  for (let i = 0; i < 4; i++) P.walls.push({id:"w"+i, level:L.id, a:C[i].slice(), b:C[(i+1)%4].slice(), thick:.3, height:null, mat:"intonaco"});
  P.rooms.push({id:"r1", level:L.id, name:"Soggiorno", mat:"parquet", pts:[[.15,.15],[4.85,.15],[4.85,3.85],[.15,3.85]], skirt:{h:.08, mat:"bianco"}});
  P.openings.push({id:"d1", wall:"w0", type:"door", t:2.5, w:.9, h:2.1, sill:0});
  P.openings.push({id:"f1", wall:"w2", type:"window", t:2.5, w:1.2, h:1.4, sill:.9});
  commit();
};

test("correttezza: computo, copertura, IFC", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(stanza).then(() => page.evaluate(() => {
    // lato interno: quello verso il locale; si ricava dal centro del locale
    const inner = w => { const c = [2.5, 2], d = [w.b[0]-w.a[0], w.b[1]-w.a[1]], cr = d[0]*(c[1]-w.a[1]) - d[1]*(c[0]-w.a[0]); return cr > 0 ? "matB" : "matA"; };
    for (const w of P.walls){ w[inner(w)] = "intonaco_sab"; w[inner(w) === "matA" ? "matB" : "matA"] = "intonaco_gr"; }
    commit();
    const rows = computo(), q = re => rows.filter(x => re.test(x.voce) || re.test(x.cat)).reduce((s, x) => s + x.q, 0);
    return { muro: q(/^Muro sp/), finInt: rows.filter(x => x.cat === "Finiture pareti" && /sabbia/i.test(x.voce)).reduce((s, x) => s + x.q, 0),
      finEst: rows.filter(x => x.cat === "Finiture pareti" && /grigio/i.test(x.voce)).reduce((s, x) => s + x.q, 0), pav: q(/^Pavimento/), bat: q(/^Battiscopa/), voci: rows.map(x => x.voce) };
  }));
  const atteso = { muro: 45.03, finInt: 41.79, finEst: 48.27, pav: 17.39, bat: 15.9 };
  const err = Object.fromEntries(Object.keys(atteso).map(k => [k, +(Math.abs(r[k] - atteso[k]) / atteso[k] * 100).toFixed(2)]));
  M.computo_errore_max_pct = Math.max(...Object.values(err)); M.computo_errori_pct = err; M.computo_valori = r;

  M.copertura_L_errore_pct = await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = [];
    const L = P.levels[0]; L.roof = {type:"flat", pitch:0, overhang:0, mat:"tegole"};
    const C = [[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]];
    for (let i = 0; i < C.length; i++) P.walls.push({id:"w"+i, level:L.id, a:C[i], b:C[(i+1)%C.length], thick:.3, height:null, mat:"intonaco"});
    commit(); const q = computo().find(x => x.cat === "Copertura")?.q || 0;
    const atteso = 10.3 * 4.3 + 4.3 * 5.7;   // sagoma al filo esterno (bracci da 4 m in asse)
    return +(Math.abs(q - atteso) / atteso * 100).toFixed(1);
  });

  await page.evaluate(stanza);
  const ifc = await page.evaluate(() => exportIFC().text); writeFileSync("test-results/livelli/stanza.ifc", ifc);
  const W = await import("web-ifc"); const api = new W.IfcAPI(); await api.Init();
  const id = api.OpenModel(new TextEncoder().encode(ifc)), n = t => api.GetLineIDsWithType(id, t).size();
  const wv = api.GetLineIDsWithType(id, W.IFCWALL), wallIds = Array.from({ length: wv.size() }, (_, i) => wv.get(i));
  let vol = 0; api.StreamMeshes(id, wallIds, m => {
    for (let g = 0; g < m.geometries.size(); g++){ const pg = m.geometries.get(g), geo = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()), ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()), T = pg.flatTransformation;
      const P3 = k => { const x = v[k*6], y = v[k*6+1], z = v[k*6+2]; return [T[0]*x + T[4]*y + T[8]*z + T[12], T[1]*x + T[5]*y + T[9]*z + T[13], T[2]*x + T[6]*y + T[10]*z + T[14]]; };
      for (let t = 0; t < ix.length; t += 3){ const a = P3(ix[t]), b = P3(ix[t+1]), c = P3(ix[t+2]); vol += (a[0]*(b[1]*c[2] - b[2]*c[1]) - a[1]*(b[0]*c[2] - b[2]*c[0]) + a[2]*(b[0]*c[1] - b[1]*c[0])) / 6; } } });
  const voluMuri = 45.03 * .3;   // volume netto atteso (asse × spessore × altezza − aperture)
  M.ifc_volume_muri_errore_pct = +(Math.abs(Math.abs(vol) - voluMuri) / voluMuri * 100).toFixed(1);
  M.ifc_pset_e_materiali = { pset: n(W.IFCPROPERTYSET), materiali: n(W.IFCMATERIAL), associazioni: n(W.IFCRELASSOCIATESMATERIAL) };
  api.CloseModel(id);
  const dxf = await page.evaluate(() => exportDXF()); writeFileSync("test-results/livelli/stanza.dxf", dxf);
  const usati = new Set([...dxf.matchAll(/\n\s*8\n([^\n]+)\n/g)].map(m => m[1].trim())), tabella = new Set([...dxf.matchAll(/\n\s*0\nLAYER\n\s*2\n([^\n]+)\n/g)].map(m => m[1].trim()));
  M.dxf_layer_non_dichiarati = [...usati].filter(l => !tabella.has(l)).length;
});

test("affidabilità: persistenza dopo errore di quota e import fuori campo", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { P.name = "Versione A"; commit(); }); await page.waitForTimeout(2500);
  await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === "pianta-libera-v2") throw new DOMException("pieno", "QuotaExceededError"); return o.call(this, k, v); }; P.name = "Versione B"; commit(); });
  await page.waitForTimeout(3000); await page.reload(); await ready(page); await page.waitForTimeout(4000);
  M.persistenza_dopo_quota = (await page.evaluate(() => P.name)) === "Versione B" ? "ok" : "persa";
  M.import_valori_fuori_campo = await page.evaluate(async () => {
    const p = sampleProject(); p.walls[0].b = p.walls[0].a.slice(); p.walls[1].thick = -0.3; p.openings[0].w = -1; p.openings[1].h = 0; p.levels[0].height = -3;
    await openProjectData(p); return P.walls.filter(w => w.thick <= 0 || Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]) < .01).length + P.openings.filter(o => !(o.w > 0) || !(o.h > 0)).length + P.levels.filter(l => !(l.height > 0)).length;
  });
});

test("prestazioni: modifica su edificio grande, storia di annulla", async ({ page }) => {
  await open(page);
  Object.assign(M, await page.evaluate(() => {
    P = sampleProject(); P.walls = []; P.rooms = []; P.openings = []; P.objects = []; P.levels = [];
    for (let l = 0; l < 4; l++){ const L = {id:"L"+l, name:"Piano "+l, elev:l*3.2, height:2.9, slab:.25, roof:{type:"none"}, underlay:null}; P.levels.push(L);
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++){ const x = i*4, y = j*4, C = [[x,y],[x+4,y],[x+4,y+4],[x,y+4]];
        for (let k = 0; k < 4; k++){ const id = `w${l}_${i}_${j}_${k}`; P.walls.push({id, level:L.id, a:C[k], b:C[(k+1)%4], thick:.15, height:null, mat:"intonaco"}); if (!k) P.openings.push({id:"o"+id, wall:id, type:"door", t:.5, w:.8, h:2.1, sill:0}); }
        P.rooms.push({id:`r${l}_${i}_${j}`, level:L.id, name:"L", mat:"parquet", pts:[[x+.075,y+.075],[x+3.925,y+.075],[x+3.925,y+3.925],[x+.075,y+3.925]]});
        for (const ref of ["divano", "tavolo", "letto"]) P.objects.push({id:`o${l}_${i}_${j}_${ref}`, level:L.id, kind:"lib", ref, x:x+2, y:y+2, z:0, rot:0, scale:1}); } }
    S.level = "L0"; commit();
    const runs = []; for (let i = 0; i < 3; i++){ const t = performance.now(); P.walls[0].thick = .2 + i/100; commit(); buildModel({ground:S.ground}); runs.push(performance.now() - t); }
    let meshes = 0, calls = 0; const g = buildModel({ground:S.ground}).root; g.traverse(o => { if (o.isMesh) meshes++; });
    // storia di annulla con una texture importata da 3 MB
    P = sampleProject(); P.materials = {imp:{nome:"foto", color:"#cccccc", mapData:"data:image/jpeg;base64," + "A".repeat(3_000_000)}}; commit();
    past.length = 0; for (let i = 0; i < 20; i++){ P.walls[0].thick = .3 + i/1000; commit(); }
    const hist = typeof historyBytes === "function" ? historyBytes() : past.reduce((s, x) => s + (typeof x === "string" ? x.length : JSON.stringify(x).length), 0);
    return { modifica_edificio_grande_ms: Math.round(runs.sort((a, b) => a - b)[1]), mesh_edificio_grande: meshes, storia_annulla_MB: +(hist / 1048576).toFixed(1) };
  }));
});

test("accessibilità: axe (WCAG 2.2 AA), violazioni critiche e serie", async ({ page }) => {
  await open(page);
  const axe = ["node_modules/axe-core/axe.min.js"].find(existsSync); if (!axe){ M.axe_critiche_serie = "axe-core non installato"; return; }
  await page.evaluate(src => (0, eval)(src), readFileSync(axe, "utf8"));
  const tot = {};
  for (const tab of ["props", "list", "import", "export", "ai"]){
    await page.click(`[data-tab="${tab}"]`).catch(() => {}); await page.waitForTimeout(400);
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations.filter(v => ["critical", "serious"].includes(v.impact)).flatMap(v => v.nodes.map(n => v.id + " " + n.target.join(" "))));
    for (const k of v) tot[k] = 1;
  }
  M.axe_critiche_serie = Object.keys(tot).length; M.axe_elenco = Object.keys(tot);
});

test("UI: righe d'intestazione e testi troncati (1440×900)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await open(page);
  Object.assign(M, await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const views = document.getElementById("views").getBoundingClientRect().top;
    const tronc = [...document.querySelectorAll("button, select, input[type=text], #hud2d span, .statusbar *, #status *")].filter(vis).filter(e => {
      if (e.tagName === "SELECT"){ const o = e.options[e.selectedIndex]; if (!o) return false; const c = document.createElement("canvas").getContext("2d"); c.font = getComputedStyle(e).font; return c.measureText(o.text).width > e.clientWidth - 28; }
      if (e.tagName === "INPUT"){ return e.scrollWidth > e.clientWidth + 1; }
      return e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible"; }).map(e => (e.id || e.tagName) + ":" + (e.value || e.textContent).trim().slice(0, 20));
    return { altezza_sopra_le_viste_px: Math.round(views), testi_troncati: tronc.length, testi_troncati_elenco: tronc.slice(0, 20) };
  }));
});
