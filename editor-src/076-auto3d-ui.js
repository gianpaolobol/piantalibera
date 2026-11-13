/* ============================================================
   Da pianta e prospetti al 3D — pannello nella scheda Importa
   ============================================================ */
/** Tipo d'apertura nella revisione: porta, portafinestra (porta con lo stile) o finestra. */
const a3KindOf = o => o.type === "door" && o.style === "portafinestra" ? "pf" : o.type;
function a3Kind(o, k){ if (!k || k === a3KindOf(o)) return {...o};
  const r = {...o, type:k === "pf" ? "door" : k}; if (k === "pf") r.style = "portafinestra"; else if (o.style === "portafinestra") delete r.style;
  if (r.type === "window" && !(r.sill > .15)) { r.sill = 1; delete r.alz; } if (r.type === "door") r.sill = 0; return r; }
const A3_STAIR_LAYERS = /scal[ae]\b|stair|gradin/i;
/** Scala riconosciuta → oggetto scala parametrico dell'editor (sale lungo −y locale; rotazione dalla direzione di salita). */
function a3StairObject(st, L){
  const ref = st.shape === "U" ? "scala_u" : "scala_dritta", it = LIBMAP[ref]; if (!it) return null;
  const Hfull = +(nextLevelAbove(L) ? nextLevelAbove(L).elev - L.elev : L.height + L.slab).toFixed(3);
  const H = st.ext ? +(st.steps * .16).toFixed(3) : Hfull, n = st.ext ? st.steps : Math.max(st.steps, Math.round(H / .2));
  const th = Math.atan2(-st.dir[0], -st.dir[1]), rot = +(-th * 180 / Math.PI).toFixed(1);
  const o = {id:uid(), level:L.id, kind:"lib", ref, name:st.ext ? "Gradini esterni" : it.nome, x:+st.center[0].toFixed(3), y:+st.center[1].toFixed(3), rot, scale:1, z:0};
  o.p = {H, n, w:st.w, tread:st.tread, ...(st.ext ? {rail:"nessuno", mat:"pietra"} : {})}; return o;
}
const A3S = {files:[], clusters:[], layersOff:null, report:null, preview:null, dec:new Map()};   // dec: correzioni della revisione, per posizione (restano se si rifà il riconoscimento)
// layer che non sono muri né aperture: quote, testi, retini, arredi, impianti, superfici, scale, demolizioni, strutture, librerie di blocchi
const A3_SKIP_LAYERS = /quot|dim|cot[ae]|text|test[oi]|scritt|hatch|tratt|camp|retin|arred|mobil|furn|sanit|asse|axis|grid|grigl|cartig|squadr|defpoints|viewport|^vp|impiant|elettr|idraul|termic|gas\b|clima|superfic|area|scal[ae]\b|stair|demoli|gronda|gronde|pluvial|trav[ei]|pilastr.*strutt|sezion|section|noplot|no.?plot|cad-block|dwgmodels|verde|alber|veget|planim|catast|perimetr.*lott/i;
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
    <div class="btns"><button class="btn ${A3S.preview ? "" : "primary"}" id="a3Go">${A3S.preview ? "Rifai il riconoscimento" : "Riconosci muri, aperture e locali"}</button></div>
    ${A3S.preview ? a3ReviewHTML() : ""}`;
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
/** Dal pannello «Importa pianta» (DWG/DXF): stesso file al riconoscimento, poi revisione. */
async function a3FromImport(f){ Object.assign(A3S, {files:[], clusters:[], layersOff:null, report:null, preview:null, dec:new Map()});
  await a3AddFiles([f]); if (A3S.files.length && A3S.clusters.some(c => c.role === "pianta")) a3Recognize(); else renderImport();
  $("#a3Box")?.scrollIntoView({block:"start"}); }
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
/* ---------- riconoscimento e revisione guidata (fase C, docs/progetto-cad-bim.md §2.8) ---------- */
const a3r = v => Math.round(v * 20) / 20;   // posizione arrotondata a 5 cm: chiave delle correzioni
function a3WallKey(w){ const p = [w.a, w.b].map(q => q.map(a3r).join(",")).sort(); return "w:" + p.join("|"); }
function a3OpCenter(o, walls){ const w = walls.find(x => x.id === o.wall); if (!w) return null; const L = Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]) || 1; return [w.a[0] + (w.b[0]-w.a[0]) / L * o.t, w.a[1] + (w.b[1]-w.a[1]) / L * o.t]; }
function a3OpKey(o, walls){ const c = a3OpCenter(o, walls); return c ? "o:" + c.map(a3r).join(",") : ""; }
function a3Recognize(){
  const plan = A3S.clusters.filter(c => c.role === "pianta");
  if (plan.length !== 1){ toast(plan.length ? "Scegli una sola pianta" : "Indica quale disegno è la pianta", true); return; }
  const pending = A3S.clusters.filter(c => c.role === "prospetto"); if (pending.length) toast(`${pending.length} prospett${pending.length > 1 ? "i" : "o"} senza lato: ${pending.length > 1 ? "vengono ignorati" : "viene ignorato"}`);
  const pc = plan[0], [bx0, , , by1] = pc.bbox;
  const toApp = (x, y) => [+(x - bx0).toFixed(4), +(by1 - y).toFixed(4)];
  const segs = pc.segs.map(s => [...toApp(s[0], s[1]), ...toApp(s[2], s[3]), s[4]]);
  const arcs = pc.arcs.map(a => { const [cx, cy] = toApp(a.cx, a.cy); return {...a, cx, cy}; });
  const texts = pc.texts.map(t => { const [x, y] = toApp(t.x, t.y); return {...t, x, y}; });
  // linee dei layer delle scale (escluse dai muri): servono a riconoscere rampe e gradini
  const f = A3S.files.find(x => x.name === pc.file), u = f?.unit || 1, [bx0b, by0b, bx1b, by1b] = pc.bbox;
  const stairSegs = f ? f.flat.segs.filter(s => A3S.layersOff.has(s[4]) && A3_STAIR_LAYERS.test(s[4])).map(s => [s[0]*u, s[1]*u, s[2]*u, s[3]*u, s[4]])
    .filter(s => Math.min(s[0], s[2]) >= bx0b - .5 && Math.max(s[0], s[2]) <= bx1b + .5 && Math.min(s[1], s[3]) >= by0b - .5 && Math.max(s[1], s[3]) <= by1b + .5).map(s => [...toApp(s[0], s[1]), ...toApp(s[2], s[3]), s[4]]) : [];
  busy("Riconosco muri, aperture e locali…");
  try {
    const pr = A3.analyzePlan(segs, arcs, texts, {stairSegs});
    if (!pr.walls.length){ toast("Non trovo muri: controlla i layer e l'unità del disegno", true); A3S.preview = null; return; }
    const elevs = A3S.clusters.filter(c => ["sud","nord","est","ovest"].includes(c.role)).map(c => { const [ex0, ey0] = c.bbox; return {side:c.role, data:A3.prepareElevation(c.segs.map(s => [s[0]-ex0, s[1]-ey0, s[2]-ex0, s[3]-ey0, s[4]]), pr, c.role)}; }).filter(e => e.data);
    const m = A3.combine(pr, elevs, {height:A3S.height ?? 2.7});
    for (const w of m.walls) w.key = a3WallKey(w);
    for (const o of m.openings){ o.key = a3OpKey(o, m.walls); o.type0 = o.type; }
    A3S.preview = {pr, m, segs, pc, elevs}; A3S.report = null;
  } catch(e){ console.error(e); toast("Riconoscimento non riuscito: " + (e.message || e), true); }
  finally { busy(""); }
  renderImport();
}
/** Elementi con le correzioni applicate. */
function a3Reviewed(){
  const {m} = A3S.preview, D = A3S.dec;
  const walls = m.walls.filter(w => !D.get(w.key)?.drop);
  const keep = new Set(walls.map(w => w.id));
  const openings = m.openings.filter(o => keep.has(o.wall) && !D.get(o.key)?.drop).map(o => a3Kind(o, D.get(o.key)?.type));
  return {walls, openings};
}
function a3Doubts(){
  const {m} = A3S.preview, D = A3S.dec, out = [];
  const dub = x => x.conf && x.conf.ok === false;
  for (const w of m.walls) if (dub(w) || D.has(w.key)) out.push({k:w.key, kind:"Muro", why:dub(w) ? w.conf.why : "corretto da te", drop:!!D.get(w.key)?.drop});
  for (const o of m.openings) if (dub(o) || D.has(o.key)) out.push({k:o.key, kind:o.style === "portafinestra" ? "Portafinestra" : o.type0 === "door" ? "Porta" : "Finestra", why:dub(o) ? o.conf.why : "corretta da te", drop:!!D.get(o.key)?.drop, type:D.get(o.key)?.type || a3KindOf(o), op:true});
  for (const r of m.rooms) if (r.conf && !r.conf.ok) out.push({k:"r:" + (r.name || ""), kind:r.name || "Locale", why:r.conf.why, info:true});
  for (const st of m.stairs || []) if (st.conf && !st.conf.ok) out.push({k:"s:" + st.center.map(a3r).join(","), kind:"Scala", why:st.conf.why + " (poi la ruoti dalla scheda dell'oggetto)", info:true});
  return out;
}
function a3ReviewSVG(){
  const {m, segs} = A3S.preview, D = A3S.dec;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of m.walls) for (const p of [w.a, w.b]){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = .8, W = x1 - x0 + 2*pad, H = y1 - y0 + 2*pad, sw = Math.max(W, H) / 400;
  const step = Math.max(1, Math.ceil(segs.length / 4000)); let d = ""; for (let i = 0; i < segs.length; i += step){ const s = segs[i]; d += `M${s[0].toFixed(3)} ${s[1].toFixed(3)}L${s[2].toFixed(3)} ${s[3].toFixed(3)}`; }
  const rooms = m.rooms.map(r => `<polygon points="${r.pts.map(p => p.join(",")).join(" ")}" class="${r.conf && !r.conf.ok ? "dub" : ""}"/>`).join("");
  const walls = m.walls.map(w => { const dr = D.get(w.key)?.drop; return `<line data-k="${esc(w.key)}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke-width="${w.thick}" class="w ${dr ? "drop" : w.conf?.ok === false ? "dub" : ""}"/>`; }).join("");
  const ops = m.openings.map(o => { const w = m.walls.find(x => x.id === o.wall); if (!w) return ""; const L = Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]) || 1, u = [(w.b[0]-w.a[0])/L, (w.b[1]-w.a[1])/L], A = [w.a[0]+u[0]*(o.t-o.w/2), w.a[1]+u[1]*(o.t-o.w/2)], B = [w.a[0]+u[0]*(o.t+o.w/2), w.a[1]+u[1]*(o.t+o.w/2)];
    const t = D.get(o.key)?.type || a3KindOf(o), dr = D.get(o.key)?.drop; return `<line data-k="${esc(o.key)}" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke-width="${w.thick + .06}" class="o ${t === "pf" ? "door pf" : t} ${dr ? "drop" : o.conf?.ok === false ? "dub" : ""}"/>`; }).join("");
  const stairs = (m.stairs || []).map(st => { const d = st.dir, q = [-d[1], d[0]], len = st.steps * st.tread, c = st.center, P = (a, b) => [c[0] + q[0]*a + d[0]*b, c[1] + q[1]*a + d[1]*b].join(",");
    return `<polygon class="st" points="${[P(-st.w/2, -len/2), P(st.w/2, -len/2), P(st.w/2, len/2), P(-st.w/2, len/2)].join(" ")}"/><polyline class="st" points="${[P(0, -len/2 + .1), P(0, len/2 - .1), P(-.12, len/2 - .3), P(0, len/2 - .1), P(.12, len/2 - .3)].join(" ")}"/>`; }).join("");
  return `<svg viewBox="${x0 - pad} ${y0 - pad} ${W} ${H}" role="img" aria-label="Anteprima del riconoscimento: muri, porte, finestre, locali e scale"><g class="r">${rooms}</g><path d="${d}" class="cad" stroke-width="${sw}"/>${walls}${ops}<g style="stroke-width:${sw * 2}">${stairs}</g></svg>`;
}
function a3ReviewHTML(){
  const {m} = A3S.preview, rv = a3Reviewed(), dub = a3Doubts(), nD = rv.openings.filter(o => o.type === "door").length;
  return `<div class="a3rev"><span class="lbl">Revisione</span>
    <p class="note">${rv.walls.length} muri, ${nD} porte, ${rv.openings.length - nD} finestre, ${m.rooms.length} locali. In giallo i dubbi: controllali qui sotto, poi crea il modello. Le correzioni restano se cambi layer o unità e rifai il riconoscimento.</p>
    <div class="a3prev">${a3ReviewSVG()}</div>
    <div class="a3leg"><i class="lw"></i>muro <i class="ld"></i>porta <i class="lp"></i>portafinestra <i class="lf"></i>finestra <i class="ls"></i>scala <i class="lq"></i>dubbio</div>
    ${dub.length ? `<ul class="a3dub">${dub.map(x => `<li data-a3k="${esc(x.k)}" class="${x.drop ? "drop" : ""}"><span><b>${esc(x.kind)}</b> · ${esc(x.why)}</span>${x.info ? "" : `<span class="acts">${x.op ? `<select class="inp" data-a3type="${esc(x.k)}" aria-label="Tipo"><option value="door" ${x.type === "door" ? "selected" : ""}>Porta</option><option value="pf" ${x.type === "pf" ? "selected" : ""}>Portafinestra</option><option value="window" ${x.type === "window" ? "selected" : ""}>Finestra</option></select>` : ""}<button class="btn" data-a3drop="${esc(x.k)}">${x.drop ? "Rimetti" : "Togli"}</button></span>`}</li>`).join("")}</ul>` : `<p class="note">Nessun dubbio.</p>`}
    <div class="btns"><button class="btn primary" id="a3Make">Crea il modello BIM</button></div>
    <p class="note">Il piano corrente («${esc(level().name)}») viene sostituito: muri, aperture e locali. Con Annulla torni indietro.</p></div>`;
}
function a3Generate(){
  if (!A3S.preview) return;
  const {pr, m, segs, pc, elevs} = A3S.preview, rv = a3Reviewed();
  try {
    const L = level(), lid = L.id, oldW = new Set(P.walls.filter(w => w.level === lid).map(w => w.id));
    P.walls = P.walls.filter(w => w.level !== lid); P.openings = P.openings.filter(o => !oldW.has(o.wall)); P.rooms = P.rooms.filter(r => r.level !== lid);
    const ids = {};
    for (const w of rv.walls){ const id = uid(); ids[w.id] = id; P.walls.push({id, level:lid, a:w.a, b:w.b, thick:w.thick, height:null, mat:S.defaults.wallMat}); }
    for (const o of rv.openings) if (ids[o.wall]) P.openings.push({id:uid(), wall:ids[o.wall], t:o.t, w:o.w, h:o.h, sill:o.sill, type:o.type, flip:0, ...(o.style ? {style:o.style} : {}), ...(o.alz ? {alz:o.alz} : {})});
    m.rooms.forEach((r, i) => P.rooms.push({id:uid(), level:lid, name:r.name || `Locale ${i+1}`, mat:FLOOR_MATS.includes(r.mat) ? r.mat : S.defaults.roomMat, pts:r.pts}));
    P.objects = P.objects.filter(o => !(o.level === lid && o.fromCAD));
    for (const st of m.stairs || []){ const o = a3StairObject(st, L); if (o){ o.fromCAD = true; P.objects.push(o); } }
    L.height = m.height; L.roof = {...L.roof, ...m.roof}; if (!m.roof.ridge) delete L.roof.ridge;
    L.underlay = {kind:"vec", lines:segs.map(s => s.slice(0, 4)), ox:0, oy:0, k:1, opacity:.3, name:pc.file};
    const nD = rv.openings.filter(o => o.type === "door").length, nF = rv.openings.length - nD, nC = A3S.dec.size;
    const nS = (m.stairs || []).length;
    A3S.report = {title:`Creati ${rv.walls.length} muri, ${nD} porte, ${nF} finestre e ${m.rooms.length} locali${nS ? `, ${nS} scal${nS > 1 ? "e" : "a"}` : ""}`, lines:[
      `Spessori riconosciuti: ${pr.thicknesses.map(t => fmt(t*100, 0) + " cm").join(", ") || "—"}.`,
      elevs.length ? `Altezza di gronda ${fmt(m.height, 2)} m da ${elevs.length} prospett${elevs.length > 1 ? "i" : "o"}.` : `Nessun prospetto: altezza ${fmt(m.height, 2)} m e aperture con misure tipiche.`,
      m.roof.type === "gable" ? `Copertura a due falde, pendenza ${fmt(m.roof.pitch, 1)}°, colmo ${m.roof.ridge === "x" ? "est–ovest" : "nord–sud"}.` : "Copertura piana.",
      ...(nC ? [`${nC} correzion${nC > 1 ? "i" : "e"} della revisione applicat${nC > 1 ? "e" : "a"}.`] : []),
      ...m.notes, "Controlla il risultato: la pianta originale resta sotto come base di ricalco."]};
    A3S.preview = null;
    commit(); fitPlan(); renderImport(); toast(A3S.report.title);
  } catch(e){ console.error(e); toast("Generazione non riuscita: " + (e.message || e), true); }
}
PI.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "a3Files") $("#fA3").click();
  if (b.id === "a3Clear"){ Object.assign(A3S, {files:[], clusters:[], layersOff:null, report:null, preview:null, dec:new Map()}); renderImport(); }
  if (b.id === "a3Go") a3Recognize();
  if (b.id === "a3Make") a3Generate();
  if (b.dataset.a3drop){ const k = b.dataset.a3drop, d = {...(A3S.dec.get(k) || {})}; d.drop = !d.drop; if (!d.drop) delete d.drop; Object.keys(d).length ? A3S.dec.set(k, d) : A3S.dec.delete(k); renderImport(); }
});
PI.addEventListener("change", e => { const t = e.target;
  // cambiando ruoli, unità o layer il riconoscimento si rifà da solo, con le correzioni già fatte
  const again = () => { a3Cluster(); if (A3S.preview) a3Recognize(); else renderImport(); };
  if (t.dataset.a3role !== undefined){ A3S.clusters[+t.dataset.a3role].role = t.value; if (A3S.preview) a3Recognize(); else renderImport(); }
  if (t.dataset.a3unit !== undefined){ A3S.files[+t.dataset.a3unit].unit = +t.value; again(); }
  if (t.dataset.a3layer !== undefined){ t.checked ? A3S.layersOff.delete(t.dataset.a3layer) : A3S.layersOff.add(t.dataset.a3layer); again(); }
  if (t.dataset.a3type !== undefined){ const k = t.dataset.a3type, o = A3S.preview?.m.openings.find(x => x.key === k); if (!o) return;
    const d = {...(A3S.dec.get(k) || {})}; if (t.value === a3KindOf(o)) delete d.type; else d.type = t.value; Object.keys(d).length ? A3S.dec.set(k, d) : A3S.dec.delete(k); renderImport(); }
  if (t.id === "a3H"){ const v = num(t.value); if (v > 1.5) A3S.height = v; }
});
$("#fA3").addEventListener("change", async e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) await a3AddFiles(fs); });
// un clic su un dubbio lo evidenzia nell'anteprima
PI.addEventListener("click", e => { const li = e.target.closest("[data-a3k]"); if (!li || e.target.closest("button, select")) return;
  const svg = PI.querySelector(".a3prev svg"); if (!svg) return; svg.querySelectorAll(".hl").forEach(x => x.classList.remove("hl"));
  svg.querySelectorAll(`[data-k="${CSS.escape(li.dataset.a3k)}"]`).forEach(x => x.classList.add("hl")); });
