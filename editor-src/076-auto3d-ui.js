/* ============================================================
   Da pianta e prospetti al 3D — pannello nella scheda Importa
   ============================================================ */
const A3S = {files:[], clusters:[], layersOff:null, report:null};
const A3_SKIP_LAYERS = /quot|dim|cot[ae]|text|testo|scritt|hatch|tratt|camp|retin|arred|mobil|furn|sanit|asse|axis|grid|grigl|cartig|squadr|defpoints|viewport|^vp/i;
const A3_ROLES = [["pianta","Pianta"],["sud","Prospetto sud"],["nord","Prospetto nord"],["est","Prospetto est"],["ovest","Prospetto ovest"],["ignora","Ignora"]];

function autoPanelHTML(){
  const R = A3S.report;
  return `<div class="exp" id="a3Box"><header><h4>Da pianta e prospetti al 3D</h4><span class="tag">DWG · DXF</span></header>
    <p class="note">Carica la pianta e i prospetti, anche tutti nella stessa tavola. Dalla pianta riconosco muri (le due linee di ogni muro), porte (gli archi), finestre (i vetri) e locali (i nomi scritti dentro); dai prospetti altezze, davanzali, aperture mancanti e copertura.</p>
    <div class="btns"><button class="btn primary" id="a3Files">Scegli i file DWG/DXF</button>${A3S.files.length ? `<button class="btn" id="a3Clear">Ricomincia</button>` : ""}</div>
    ${A3S.files.length ? a3ListHTML() : ""}
    ${R ? `<div class="a3rep"><b>${esc(R.title)}</b><ul>${R.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}
function a3ListHTML(){
  const layers = {}; for (const f of A3S.files) for (const s of f.flat.segs) layers[s[4]] = (layers[s[4]] || 0) + 1;
  const units = [[1,"Metri"],[.01,"Centimetri"],[.001,"Millimetri"]];
  return `${A3S.files.map((f, i) => `<div class="row"><div class="f"><span class="lbl">${esc(f.name)}</span><select class="inp" data-a3unit="${i}">${units.map(([u, n]) => `<option value="${u}" ${f.unit === u ? "selected" : ""}>${n}</option>`).join("")}</select></div><div class="f" style="justify-content:flex-end"><span class="tag">${f.flat.segs.length} linee · ${f.flat.arcs.length} archi · ${f.flat.texts.length} testi</span></div></div>`).join("")}
    <details><summary class="lbl">Layer usati (${Object.keys(layers).length - A3S.layersOff.size} di ${Object.keys(layers).length})</summary><div class="layers">${Object.entries(layers).sort((a,b) => b[1]-a[1]).map(([n, c]) => `<label class="chk"><input type="checkbox" data-a3layer="${esc(n)}" ${A3S.layersOff.has(n) ? "" : "checked"}> ${esc(n)} <span class="tag">${c}</span></label>`).join("")}</div><p class="note">Quote, testi, campiture e arredi sono esclusi in automatico: non sono muri.</p></details>
    <span class="lbl">Disegni trovati</span>
    <div class="a3grid">${A3S.clusters.map((c, i) => `<figure class="${c.role === "ignora" ? "off" : ""}">${a3SVG(c)}<figcaption><select class="inp" data-a3role="${i}" ${c.role === "prospetto" ? 'aria-invalid="true"' : ""}>${c.role === "prospetto" ? `<option value="prospetto" selected>Prospetto: quale lato?</option>` : ""}${A3_ROLES.map(([k, n]) => `<option value="${k}" ${c.role === k ? "selected" : ""}>${n}</option>`).join("")}</select><small>${esc(c.file)} · ${fmt(c.w,1)}×${fmt(c.h,1)} m${c.reason ? " · " + esc(c.reason) : ""}</small></figcaption></figure>`).join("")}</div>
    ${F("a3H", "Altezza muri se mancano i prospetti (m)", fmt(A3S.height ?? 2.7), 'inputmode="decimal"')}
    <div class="btns"><button class="btn primary" id="a3Go">Genera il modello 3D</button></div>
    <p class="note">Il piano corrente («${esc(level().name)}») viene sostituito: muri, aperture e locali. Con Annulla torni indietro.</p>`;
}
function a3SVG(c){
  const [x0, y0, x1, y1] = c.bbox, w = x1 - x0 || 1, h = y1 - y0 || 1, step = Math.max(1, Math.ceil(c.segs.length / 3000));
  let d = ""; for (let i = 0; i < c.segs.length; i += step){ const s = c.segs[i]; d += `M${(s[0]-x0).toFixed(2)} ${(y1-s[1]).toFixed(2)}L${(s[2]-x0).toFixed(2)} ${(y1-s[3]).toFixed(2)}`; }
  const pad = Math.max(w, h) * .04;
  return `<svg viewBox="${-pad} ${-pad} ${w + 2*pad} ${h + 2*pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${(Math.max(w, h) / 260).toFixed(3)}"/></svg>`;
}
/** Dai file caricati ai disegni (in metri), con i layer attivi. */
function a3Cluster(){
  const all = [];
  for (const f of A3S.files){
    const u = f.unit, keep = s => !A3S.layersOff.has(s[4]);
    const dr = {segs:f.flat.segs.filter(keep).map(s => [s[0]*u, s[1]*u, s[2]*u, s[3]*u, s[4]]), arcs:f.flat.arcs.filter(a => !A3S.layersOff.has(a.layer)).map(a => ({...a, cx:a.cx*u, cy:a.cy*u, r:a.r*u})), texts:f.flat.texts.map(t => ({...t, x:t.x*u, y:t.y*u}))};
    const cl = A3.clusterDrawings(dr);
    const fileSide = A3.sideFromText("prospetto " + f.name.replace(/[_\-.]+/g, " ")), filePlan = /pianta|plan/i.test(f.name);
    for (const c of cl){
      c.file = f.name; c.segs = c.idx.map(i => dr.segs[i]);
      c.role = cl.length === 1 && fileSide ? fileSide : cl.length === 1 && filePlan ? "pianta" : c.guess;
      if (cl.length === 1 && (fileSide || filePlan)) c.reason = "nome del file";
      all.push(c);
    }
  }
  // una sola pianta in tutto
  const plans = all.filter(c => c.role === "pianta"); plans.slice(1).forEach(c => { if (c.reason !== "nome del file" && !c.reason.startsWith("etichetta")) c.role = "ignora"; });
  A3S.clusters = all;
}
async function a3AddFiles(files){
  for (const f of files){
    try { busy(`Leggo ${f.name}…`); const flat = flattenCAD(await readCAD(f)); if (!flat.segs.length) throw new Error("nessuna linea"); A3S.files.push({name:f.name, flat, unit:flat.unit}); }
    catch(e){ console.warn(e); toast(`${f.name}: ${e.message || e}`, true); }
    finally { busy(""); }
  }
  if (!A3S.layersOff){ A3S.layersOff = new Set(); }
  for (const f of A3S.files) for (const s of f.flat.segs) if (A3_SKIP_LAYERS.test(s[4])) A3S.layersOff.add(s[4]);
  a3Cluster(); A3S.report = null; S.tab = "import"; renderTabs();
}
function a3Generate(){
  const plan = A3S.clusters.filter(c => c.role === "pianta");
  if (plan.length !== 1){ toast(plan.length ? "Scegli una sola pianta" : "Indica quale disegno è la pianta", true); return; }
  const pending = A3S.clusters.filter(c => c.role === "prospetto"); if (pending.length) toast(`${pending.length} prospett${pending.length > 1 ? "i" : "o"} senza lato: ${pending.length > 1 ? "vengono ignorati" : "viene ignorato"}`);
  const pc = plan[0], [bx0, , , by1] = pc.bbox;
  const toApp = (x, y) => [+(x - bx0).toFixed(4), +(by1 - y).toFixed(4)];
  const segs = pc.segs.map(s => [...toApp(s[0], s[1]), ...toApp(s[2], s[3]), s[4]]);
  const arcs = pc.arcs.map(a => { const [cx, cy] = toApp(a.cx, a.cy); return {...a, cx, cy}; });
  const texts = pc.texts.map(t => { const [x, y] = toApp(t.x, t.y); return {...t, x, y}; });
  busy("Riconosco muri, aperture e locali…");
  try {
    const pr = A3.analyzePlan(segs, arcs, texts);
    if (!pr.walls.length){ toast("Non trovo muri: controlla i layer e l'unità del disegno", true); return; }
    const elevs = A3S.clusters.filter(c => ["sud","nord","est","ovest"].includes(c.role)).map(c => { const [ex0, ey0] = c.bbox; return {side:c.role, data:A3.prepareElevation(c.segs.map(s => [s[0]-ex0, s[1]-ey0, s[2]-ex0, s[3]-ey0, s[4]]), pr, c.role)}; }).filter(e => e.data);
    const m = A3.combine(pr, elevs, {height:A3S.height ?? 2.7});
    const L = level(), lid = L.id, oldW = new Set(P.walls.filter(w => w.level === lid).map(w => w.id));
    P.walls = P.walls.filter(w => w.level !== lid); P.openings = P.openings.filter(o => !oldW.has(o.wall)); P.rooms = P.rooms.filter(r => r.level !== lid);
    const ids = {};
    for (const w of m.walls){ const id = uid(); ids[w.id] = id; P.walls.push({id, level:lid, a:w.a, b:w.b, thick:w.thick, height:null, mat:S.defaults.wallMat}); }
    for (const o of m.openings) if (ids[o.wall]) P.openings.push({id:uid(), wall:ids[o.wall], t:o.t, w:o.w, h:o.h, sill:o.sill, type:o.type, flip:0});
    m.rooms.forEach((r, i) => P.rooms.push({id:uid(), level:lid, name:r.name || `Locale ${i+1}`, mat:FLOOR_MATS.includes(r.mat) ? r.mat : S.defaults.roomMat, pts:r.pts}));
    L.height = m.height; L.roof = {...L.roof, ...m.roof}; if (!m.roof.ridge) delete L.roof.ridge;
    L.underlay = {kind:"vec", lines:segs.map(s => s.slice(0, 4)), ox:0, oy:0, k:1, opacity:.3, name:pc.file};
    const nD = m.openings.filter(o => o.type === "door").length, nF = m.openings.length - nD;
    A3S.report = {title:`Creati ${m.walls.length} muri, ${nD} porte, ${nF} finestre e ${m.rooms.length} locali`, lines:[
      `Spessori riconosciuti: ${pr.thicknesses.map(t => fmt(t*100, 0) + " cm").join(", ") || "—"}.`,
      elevs.length ? `Altezza di gronda ${fmt(m.height, 2)} m da ${elevs.length} prospett${elevs.length > 1 ? "i" : "o"}.` : `Nessun prospetto: altezza ${fmt(m.height, 2)} m e aperture con misure tipiche.`,
      m.roof.type === "gable" ? `Copertura a due falde, pendenza ${fmt(m.roof.pitch, 1)}°, colmo ${m.roof.ridge === "x" ? "est–ovest" : "nord–sud"}.` : "Copertura piana.",
      ...m.notes, "Controlla il risultato: la pianta originale resta sotto come base di ricalco."]};
    commit(); fitPlan(); renderImport(); toast(A3S.report.title);
  } catch(e){ console.error(e); toast("Generazione non riuscita: " + (e.message || e), true); }
  finally { busy(""); }
}
PI.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "a3Files") $("#fA3").click();
  if (b.id === "a3Clear"){ Object.assign(A3S, {files:[], clusters:[], layersOff:null, report:null}); renderImport(); }
  if (b.id === "a3Go") a3Generate();
});
PI.addEventListener("change", e => { const t = e.target;
  if (t.dataset.a3role !== undefined){ A3S.clusters[+t.dataset.a3role].role = t.value; renderImport(); }
  if (t.dataset.a3unit !== undefined){ A3S.files[+t.dataset.a3unit].unit = +t.value; a3Cluster(); renderImport(); }
  if (t.dataset.a3layer !== undefined){ t.checked ? A3S.layersOff.delete(t.dataset.a3layer) : A3S.layersOff.add(t.dataset.a3layer); a3Cluster(); renderImport(); }
  if (t.id === "a3H"){ const v = num(t.value); if (v > 1.5) A3S.height = v; }
});
$("#fA3").addEventListener("change", async e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) await a3AddFiles(fs); });
