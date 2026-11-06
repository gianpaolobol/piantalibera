/* ============================================================
   Ispettore, piani, schede
   ============================================================ */
function swatches(keys, cur, attr){
  const proj = projMatKeys().filter(k => !keys.includes(k));
  const one = k => `<button class="sw" data-${attr}="${esc(k)}" aria-pressed="${k===cur}" title="${esc(matName(k))}"><i style="${swatchStyle(k)}"></i><span>${esc(matName(k))}</span></button>`;
  return `<div class="swatches">${keys.map(one).join("")}</div>${proj.length ? `<span class="lbl">Materiali del progetto</span><div class="swatches">${proj.map(one).join("")}</div>` : ""}`;
}
const F = (id, label, val, extra="") => `<div class="f"><label class="lbl" for="${id}">${label}</label><input id="${id}" class="inp" value="${esc(val)}" ${extra}></div>`;
function furnPanel(){
  const src = S.furnSrc;
  let h = `<div class="sec"><h3>Arredi, verde e persone</h3><div class="seg" id="furnSrc"><button data-fs="lib" aria-pressed="${src==="lib"}">Libreria interna</button><button data-fs="online" aria-pressed="${src==="online"}">Poly Haven</button><button data-fs="personal" aria-pressed="${src==="personal"}">Personale</button></div>`;
  if (src === "lib"){
    const it = LIBMAP[S.furn], st = TPL[S.furn]?.status;
    h += `${it ? `<div class="libsel">${thumbImg(it.ref)}<div><b>${esc(it.nome)}</b><small>${esc(it.cat)} · ${esc(it.dim)}${it.credit ? ` · ${esc(it.credit)}` : ""}</small><p class="note">${st === "loading" ? "Carico il modello…" : st === "err" ? "Modello non disponibile: manca la cartella assets?" : "Clicca in pianta per posizionarlo · poi ruotalo e scalalo qui."}</p></div></div>` : ""}
      <div class="f"><input id="libQ" class="inp" type="search" placeholder="Cerca nella libreria (es. sedia, olivo, doccia)" value="${esc(S.libQ || "")}" aria-label="Cerca nella libreria"></div>
      <div class="cats">${LIB_CATS.map(c=>`<button data-fcat="${esc(c)}" aria-pressed="${!S.libQ && S.furnCat===c}">${esc(c)} <span>${LIB.filter(x=>x.cat===c).length}</span></button>`).join("")}</div>
      <div class="grid-lib" id="libGrid">${libGridHTML()}</div>
      <p class="note">I modelli <b>reali</b> si caricano dalla cartella <b>assets</b> al primo uso.</p>`;
  } else h += onlinePanelHTML();
  return h + `</div>`;
}
function libItems(){ const q = (S.libQ || "").trim().toLowerCase(); return q ? LIB.filter(x => (x.nome + " " + x.cat + " " + x.ref).toLowerCase().includes(q)) : LIB.filter(x => x.cat === S.furnCat); }
function libGridHTML(){
  const items = libItems(); if (!items.length) return `<p class="note">Nessun oggetto trovato.</p>`;
  return items.map(it => `<button data-furn="${esc(it.ref)}" aria-pressed="${S.furn===it.ref}" title="${esc(it.nome)}"><span class="th">${thumbImg(it.ref)}${it.real ? '<span class="badge">reale</span>' : ""}</span><span class="nm">${esc(it.nome)}</span><small>${esc(it.dim)}</small></button>`).join("");
}
function renderInspector(){
  const el = $("#panel-props"); if (!P) return; const sel = findSel(), L = level(); let h = "";
  if (S.tool === "calib"){
    const c = S.calib, d = c?.p2 ? Math.hypot(c.p2[0]-c.p1[0], c.p2[1]-c.p1[1]) : null;
    h += `<div class="sec"><h3>Calibra la base</h3><p class="note">Clicca due punti sulla pianta importata di cui conosci la distanza reale, ad esempio una quota o la lunghezza di un muro. Poi scrivi qui la misura.</p>
      ${d ? `<dl class="kv"><dt>Distanza misurata</dt><dd>${fmt(d,3)} m</dd></dl><div class="row">${F("calReal","Misura reale (m)","", 'inputmode="decimal" placeholder="es. 10,40"')}<div class="f" style="justify-content:flex-end"><button class="btn primary" id="calApply">Applica scala</button></div></div>` : `<p class="note"><b>${c?.p1 ? "Ora il secondo punto." : "Clicca il primo punto."}</b></p>`}</div>`;
  }
  else if (S.tool === "furn") h += furnPanel();
  else if (["wall","rect"].includes(S.tool)){
    const d = S.defaults;
    h += `<div class="sec"><h3>Nuovi muri</h3><div class="row">${F("dThick","Spessore (m)",fmt(d.wallThick),'inputmode="decimal"')}<div class="f"><span class="lbl">Tipologia</span><select id="dPreset" class="inp"><option value="">—</option><option value=".30">Esterno 30</option><option value=".40">Esterno 40</option><option value=".12">Tramezzo 12</option><option value=".08">Tramezzo 8</option></select></div></div>
      <span class="lbl">Finitura</span>${swatches(WALL_MATS, d.wallMat, "dwm")}
      ${S.tool==="rect" ? `<div class="f"><span class="lbl">Le misure che disegni sono</span><select id="rectRef" class="inp"><option value="interno" ${PREFS.rectRef==="interno"?"selected":""}>Interne (filo interno dei muri)</option><option value="asse" ${PREFS.rectRef==="asse"?"selected":""}>In asse ai muri</option><option value="esterno" ${PREFS.rectRef==="esterno"?"selected":""}>Esterne (filo esterno)</option></select></div><span class="lbl">Pavimento</span>${swatches(FLOOR_MATS, d.roomMat, "drm")}`
        : `<div class="f"><span class="lbl">La linea che disegni è</span><select id="wallRef" class="inp"><option value="asse" ${PREFS.wallRef==="asse"?"selected":""}>L'asse del muro</option><option value="sinistra" ${PREFS.wallRef==="sinistra"?"selected":""}>Il filo sinistro (muro a destra)</option><option value="destra" ${PREFS.wallRef==="destra"?"selected":""}>Il filo destro (muro a sinistra)</option></select></div>
          <p class="note">Digita la lunghezza (es. <b>4,25</b>), <b>Tab</b> per l'angolo, poi <b>Invio</b>. <b>Maiusc</b>: angoli a 15°${PREFS.ortho ? " (con Ortogonale attivo: liberi)" : ""}. Doppio clic o Esc per finire.</p>`}</div>`;
  }
  else if (S.tool === "dim"){
    h += `<div class="sec"><h3>Quote</h3><p class="note">Clic sul primo e sul secondo punto (agganciano estremi e punti medi dei muri), poi sposta il mouse per la distanza della quota e clic. La quota si seleziona, si sposta e si elimina come gli altri elementi.</p>
      <label class="chk"><input type="checkbox" id="autoDimsChk" ${PREFS.autoDims?"checked":""}> Mostra la lunghezza di tutti i muri</label></div>`;
  }
  else if (["door","window"].includes(S.tool)){
    const d = S.tool === "door" ? S.defaults.door : S.defaults.win;
    h += `<div class="sec"><h3>${S.tool==="door"?"Nuove porte":"Nuove finestre"}</h3><div class="row3">${F("dOw","Larghezza",fmt(d.w),'inputmode="decimal"')}${F("dOh","Altezza",fmt(d.h),'inputmode="decimal"')}${S.tool==="window"?F("dOs","Davanzale",fmt(d.sill),'inputmode="decimal"'):""}</div><p class="note">Misure in metri. Clicca su un muro per inserire.</p></div>`;
  }
  if (S.multi?.length > 1){
    const cnt = {}; for (const x of S.multi) cnt[x.type] = (cnt[x.type] || 0) + 1;
    const names = {wall:["muro","muri"], room:["locale","locali"], object:["oggetto","oggetti"], opening:["apertura","aperture"], dim:["quota","quote"]};
    h += `<div class="sec"><h3>${S.multi.length} elementi selezionati</h3><p class="note">${Object.entries(cnt).map(([k, n]) => `${n} ${names[k][n > 1 ? 1 : 0]}`).join(" · ")}</p>
      <div class="btns"><button class="btn" id="grRotL">Ruota −90°</button><button class="btn" id="grRot">Ruota 90°</button><button class="btn" id="grMir">Specchia</button><button class="btn" id="grDup">Duplica</button><button class="btn danger" id="delSel">Elimina</button></div>
      <p class="note">Trascina un elemento selezionato per spostarli tutti; frecce per spostamenti precisi (Maiusc ×10).</p></div>`;
  } else if (sel && S.sel){
    if (S.sel.type === "dim"){ const L0 = Math.hypot(sel.b[0]-sel.a[0], sel.b[1]-sel.a[1]);
      h += `<div class="sec"><h3>Quota</h3><div class="row">${F("dimLen","Lunghezza (m)",fmt(L0,3),'inputmode="decimal"')}${F("dimOff","Distanza dalla linea (m)",fmt(sel.off),'inputmode="decimal"')}</div><p class="note">Cambiando la lunghezza si sposta il secondo punto.</p><div class="btns"><button class="btn danger" id="delSel">Elimina</button></div></div>`; }
    if (S.sel.type === "wall"){ const f = wallFrame(sel);
      h += `<div class="sec"><h3>Muro</h3><div class="row">${F("wLen","Lunghezza (m)",fmt(f.len),'inputmode="decimal"')}${F("wThick","Spessore (m)",fmt(sel.thick),'inputmode="decimal"')}</div>
        <div class="row">${F("wH","Altezza (m)",sel.height?fmt(sel.height):"",`inputmode="decimal" placeholder="${fmt(L.height)} (piano)"`)}<div class="f"><span class="lbl">Aperture</span><div class="inp" style="font-family:var(--f-data)">${P.openings.filter(o=>o.wall===sel.id).length}</div></div></div>
        <span class="lbl">Finitura</span>${swatches(WALL_MATS, sel.mat, "wm")}
        <div class="btns"><button class="btn" id="wFlip">Inverti verso</button><button class="btn" id="wAll">Applica finitura a tutto il piano</button><button class="btn danger" id="delSel">Elimina</button></div></div>`; }
    if (S.sel.type === "opening"){ const w = wallById(sel.wall);
      h += `<div class="sec"><h3>${sel.type==="door"?"Porta":"Finestra"}</h3><div class="row3">${F("oW","Larghezza",fmt(sel.w),'inputmode="decimal"')}${F("oH","Altezza",fmt(sel.h),'inputmode="decimal"')}${sel.type==="window"?F("oS","Davanzale",fmt(sel.sill),'inputmode="decimal"'):""}</div>
        <div class="row">${F("oT","Distanza asse (m)",fmt(sel.t),'inputmode="decimal"')}<div class="f"><span class="lbl">Tipo</span><select id="oType" class="inp"><option value="door" ${sel.type==="door"?"selected":""}>Porta</option><option value="window" ${sel.type==="window"?"selected":""}>Finestra</option></select></div></div>
        <p class="note">Distanza misurata dall'inizio del muro (${fmt(wallFrame(w).len)} m).</p>
        <div class="btns">${sel.type==="door"?`<button class="btn" id="oFlip">Ribalta apertura</button>`:""}<button class="btn danger" id="delSel">Elimina</button></div></div>`; }
    if (S.sel.type === "room"){ const A = Math.abs(polyArea(sel.pts));
      h += `<div class="sec"><h3>Locale</h3>${F("rName","Nome",sel.name)}<dl class="kv"><dt>Superficie</dt><dd>${fmt(A)} m²</dd><dt>Volume netto</dt><dd>${fmt(A*L.height,1)} m³</dd><dt>Vertici</dt><dd>${sel.pts.length}</dd></dl>
        <span class="lbl">Pavimento</span>${swatches(FLOOR_MATS, sel.mat, "rm")}<div class="btns"><button class="btn" id="camRoom">Vista interna</button><button class="btn danger" id="delSel">Elimina</button></div></div>`; }
    if (S.sel.type === "object"){
      const it = sel.kind === "lib" ? LIBMAP[libRef(sel.ref)] : null, imp = sel.kind === "import" ? importStore[sel.ref] : null, fp = objFootprint(sel);
      h += `<div class="sec"><h3>${it ? esc(it.cat) : imp?.source?.type === "polyhaven" ? "Poly Haven" : "Modello importato"}</h3>${it ? `<div class="libsel">${thumbImg(it.ref)}<div><b>${esc(it.nome)}</b><small>${esc(it.dim)}${it.credit ? ` · ${esc(it.credit)}` : ""}</small></div></div>` : ""}${F("obName","Nome",sel.name)}<div class="row">${F("obX","X (m)",fmt(sel.x),'inputmode="decimal"')}${F("obY","Y (m)",fmt(sel.y),'inputmode="decimal"')}</div>
        <div class="row3">${F("obR","Rotazione °",Math.round(sel.rot||0),'inputmode="decimal"')}${F("obS","Scala",fmt(sel.scale,2),'inputmode="decimal"')}${F("obZ","Quota (m)",fmt(sel.z||0),'inputmode="decimal"')}</div>
        <dl class="kv"><dt>Ingombro</dt><dd>${fmt(fp.w)} × ${fmt(fp.d)} × ${fmt(fp.h||0)} m</dd>${it?.credit?`<dt>Fonte</dt><dd>${esc(it.credit)}</dd>`:""}${imp?.source?.credit?`<dt>Fonte</dt><dd>${esc(imp.source.credit)}</dd>`:""}</dl>
        ${!objTemplate(sel) ? `<p class="note warn">${sel.kind === "import" ? "Il file di questo modello non è in memoria. Riapri il progetto salvato in JSON per ricaricarlo." : "Caricamento in corso…"}</p>` : ""}
        ${imp?.materials?.length ? `<p class="note">${imp.materials.length} materiali di questo modello sono nella libreria del progetto e si possono usare su muri, pavimenti e coperture.</p>` : ""}
        <div class="btns"><button class="btn" id="obRot">Ruota 90°</button><button class="btn" id="obDup">Duplica</button><button class="btn danger" id="delSel">Elimina</button></div></div>`; }
  }
  if (!sel && S.tool !== "furn" && S.tool !== "calib"){
    const U = L.underlay;
    h += `<div class="sec"><h3>Piano</h3>${F("lName","Nome",L.name)}<div class="row3">${F("lElev","Quota (m)",fmt(L.elev),'inputmode="decimal"')}${F("lH","Altezza muri",fmt(L.height),'inputmode="decimal"')}${F("lSlab","Solaio",fmt(L.slab),'inputmode="decimal"')}</div>
      <div class="row"><div class="f"><span class="lbl">Copertura</span><select id="lRoof" class="inp"><option value="none">Nessuna</option><option value="flat">Piana</option><option value="gable">A due falde</option></select></div>
      ${L.roof.type==="gable"?F("lPitch","Pendenza °",L.roof.pitch,'inputmode="decimal"'):"<div></div>"}</div>
      ${L.roof.type!=="none"?`<div class="row">${F("lOv","Sporto (m)",fmt(L.roof.overhang),'inputmode="decimal"')}${L.roof.type==="gable"?`<div class="f"><span class="lbl">Colmo</span><select id="lRidge" class="inp"><option value="">Lato lungo</option><option value="x" ${L.roof.ridge==="x"?"selected":""}>Est–ovest</option><option value="y" ${L.roof.ridge==="y"?"selected":""}>Nord–sud</option></select></div>`:"<div></div>"}</div><span class="lbl">Manto</span>${swatches(ROOF_MATS, L.roof.mat, "roofm")}`:""}
      ${P.levels.length>1?`<div class="btns"><button class="btn danger" id="lDel">Elimina piano</button></div>`:""}</div>
      ${U?`<div class="sec"><h3>Base di ricalco</h3><div class="f"><label class="lbl" for="uOp">Opacità</label><input type="range" id="uOp" min="0.05" max="1" step="0.05" value="${U.opacity}"></div><div class="btns"><button class="btn" data-tool-go="calib">Calibra scala</button><button class="btn" data-tool-go="moveunder">Sposta</button><button class="btn danger" id="uDel">Rimuovi</button></div></div>`:""}
      <div class="sec"><h3>Vista 3D</h3><div class="seg" id="show3d"><button data-s="all">Tutto</button><button data-s="below">Fino a questo piano</button><button data-s="section">Sezione</button></div>
      <div class="row"><div class="f"><span class="lbl">Cielo e luce</span><select id="skySel" class="inp">${SKIES.map(s=>`<option value="${s.id}">${s.nome}</option>`).join("")}${P.sky?.kind==="ph"?`<option value="ph">${esc(P.sky.nome||"Poly Haven")}</option>`:""}</select></div>
      <div class="f"><span class="lbl">Qualità</span><div class="seg"><button data-q="0" aria-pressed="${!S.hq}">Rapida</button><button data-q="1" aria-pressed="${S.hq}">Alta</button></div></div></div>
      <label class="chk"><input type="checkbox" id="gChk" ${S.ground?"checked":""}> Terreno a prato</label>
      <div class="f"><label class="lbl" for="sAz">Orientamento sole · ${Math.round(P.sun.az)}°</label><input type="range" id="sAz" min="0" max="360" value="${P.sun.az}"></div>
      <div class="f"><label class="lbl" for="sEl">Altezza sole · ${Math.round(P.sun.el)}°</label><input type="range" id="sEl" min="3" max="80" value="${P.sun.el}"></div>
      <div class="f"><label class="lbl" for="sEx">Esposizione · ${fmt(S.exposure,2)}</label><input type="range" id="sEx" min="0.4" max="1.8" step="0.05" value="${S.exposure}"></div>
      <p class="note">«Alta» aggiunge l'occlusione ambientale negli spigoli e viene usata anche per le immagini esportate.</p></div>
      <div class="sec"><h3>Riepilogo</h3><dl class="kv"><dt>Muri</dt><dd>${wallsOf(L.id).length}</dd><dt>Aperture</dt><dd>${P.openings.filter(o=>wallById(o.wall)?.level===L.id).length}</dd><dt>Oggetti</dt><dd>${P.objects.filter(o=>o.level===L.id).length}</dd><dt>Superficie netta</dt><dd>${fmt(P.rooms.filter(r=>r.level===L.id).reduce((a,r)=>a+Math.abs(polyArea(r.pts)),0))} m²</dd></dl>
      <div class="btns"><button class="btn" id="fit">Inquadra pianta</button><button class="btn" id="newProj">Nuovo progetto vuoto</button><button class="btn" id="sampleProj">Ricarica esempio</button></div></div>`;
  }
  el.innerHTML = h;
  const sr = $("#lRoof", el); if (sr) sr.value = L.roof.type;
  const sk = $("#skySel", el); if (sk) sk.value = P.sky?.kind === "ph" ? "ph" : (P.sky?.id || "giorno");
  $$("#show3d button", el).forEach(b => b.setAttribute("aria-pressed", b.dataset.s === S.show3d));
  if (S.tool === "furn" && S.furnSrc !== "lib") hydrateOnline();
  hydrateThumbs(el);
}
const P_ = $("#panel-props");
P_.addEventListener("change", e => {
  const id = e.target.id, v = num(e.target.value), sel = findSel(), L = level(), D = S.defaults;
  if (/^(ob|w[A-Z]|o[A-Z]|r[A-Z]|dim[A-Z])/.test(id) && !sel) return; // campo di un elemento non più selezionato
  switch (id){
    case "dThick": if (v>0) D.wallThick = v; break;
    case "dPreset": if (e.target.value){ D.wallThick = +e.target.value; renderInspector(); } break;
    case "dOw": if (v>0) (S.tool==="door"?D.door:D.win).w = v; break;
    case "dOh": if (v>0) (S.tool==="door"?D.door:D.win).h = v; break;
    case "dOs": if (v>=0) D.win.sill = v; break;
    case "wLen": if (v>0){ const f = wallFrame(sel), links = linkedEnds(sel.b, sel); sel.b = [sel.a[0]+f.ux*v, sel.a[1]+f.uy*v]; for (const [w,k] of links) w[k] = sel.b.slice(); commit(); } break;
    case "wThick": if (v>0){ sel.thick = v; commit(); } break;
    case "wH": sel.height = v>0 ? v : null; commit(); break;
    case "oW": if (v>0){ sel.w = v; commit(); } break;
    case "oH": if (v>0){ sel.h = v; commit(); } break;
    case "oS": if (v>=0){ sel.sill = v; commit(); } break;
    case "oT": if (v!==null){ const w = wallById(sel.wall); sel.t = clamp(v, sel.w/2, wallFrame(w).len - sel.w/2); commit(); } break;
    case "oType": sel.type = e.target.value; if (sel.type==="door") sel.sill = 0; else if (!sel.sill) sel.sill = .9; commit(); break;
    case "rName": sel.name = e.target.value; commit(); break;
    case "obName": sel.name = e.target.value; commit(); break;
    case "obX": if (v!==null){ sel.x = v; commit(); } break;
    case "obY": if (v!==null){ sel.y = v; commit(); } break;
    case "obR": if (v!==null){ sel.rot = v; commit(); } break;
    case "obS": if (v>0){ sel.scale = v; commit(); } break;
    case "obZ": if (v!==null){ sel.z = v; commit(); } break;
    case "lName": L.name = e.target.value; commit(); break;
    case "lElev": if (v!==null){ L.elev = v; commit(); } break;
    case "lH": if (v>0){ L.height = v; commit(); } break;
    case "lSlab": if (v>0){ L.slab = v; commit(); } break;
    case "lRoof": L.roof.type = e.target.value; commit(); break;
    case "wallRef": PREFS.wallRef = e.target.value; savePrefs(); draw2D(); break;
    case "rectRef": PREFS.rectRef = e.target.value; savePrefs(); draw2D(); break;
    case "autoDimsChk": PREFS.autoDims = e.target.checked; savePrefs(); renderStatus(); draw2D(); break;
    case "dimLen": if (v > 0 && sel){ const dx = sel.b[0]-sel.a[0], dy = sel.b[1]-sel.a[1], l = Math.hypot(dx, dy) || 1; sel.b = [sel.a[0]+dx/l*v, sel.a[1]+dy/l*v]; commit(); } break;
    case "dimOff": if (v !== null && sel){ sel.off = v; commit(); } break;
    case "lPitch": if (v>0){ L.roof.pitch = clamp(v,5,60); commit(); } break;
    case "lOv": if (v>=0){ L.roof.overhang = v; commit(); } break;
    case "lRidge": if (e.target.value) L.roof.ridge = e.target.value; else delete L.roof.ridge; commit(); break;
    case "gChk": S.ground = e.target.checked; rebuild3D(); break;
    case "skySel": { const s = SKIES.find(x => x.id === e.target.value); if (s){ P.sky = {kind:"asset", id:s.id}; if (s.sun) P.sun.el = s.sun.el; save(); applySky(); placeSun(); renderInspector(); } break; }
    case "phSearch": hydrateOnline(); break;
  }
});
P_.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "sAz" || t.id === "sEl"){ P.sun[t.id === "sAz" ? "az" : "el"] = +t.value; t.previousElementSibling.textContent = (t.id==="sAz"?"Orientamento sole · ":"Altezza sole · ") + t.value + "°"; placeSun(); render3D(); save(); }
  if (t.id === "sEx"){ S.exposure = +t.value; t.previousElementSibling.textContent = "Esposizione · " + fmt(S.exposure,2); placeSun(); render3D(); }
  if (t.id === "uOp"){ level().underlay.opacity = +t.value; draw2D(); save(); }
  if (t.id === "libQ"){ S.libQ = t.value; const g = $("#libGrid"); if (g){ g.innerHTML = libGridHTML(); hydrateThumbs(g); } $$("[data-fcat]", P_).forEach(b => b.setAttribute("aria-pressed", !S.libQ && b.dataset.fcat === S.furnCat)); }
});
P_.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const sel = findSel(), L = level();
  if (b.dataset.fs){ S.furnSrc = b.dataset.fs; S.onlinePick = null; renderInspector(); return; }
  if (b.dataset.fcat){ S.furnCat = b.dataset.fcat; S.libQ = ""; renderInspector(); return; }
  if (b.dataset.furn){ S.furn = b.dataset.furn; const it = LIBMAP[S.furn]; if (it.load && !TPL[S.furn]) loadTpl(S.furn); renderInspector(); return; }
  if (b.dataset.phcat !== undefined){ S.phCat = b.dataset.phcat; hydrateOnline(); return; }
  if (b.dataset.pick){ S.onlinePick = JSON.parse(b.dataset.pick); $$("[data-pick]", P_).forEach(x => x.setAttribute("aria-pressed", x === b)); toast(`«${S.onlinePick.nome}»: clicca in pianta per posizionarlo`); return; }
  if (b.dataset.dwm){ S.defaults.wallMat = b.dataset.dwm; renderInspector(); return; }
  if (b.dataset.drm){ S.defaults.roomMat = b.dataset.drm; renderInspector(); return; }
  if (b.dataset.wm){ sel.mat = b.dataset.wm; commit(); return; }
  if (b.dataset.rm){ sel.mat = b.dataset.rm; commit(); return; }
  if (b.dataset.roofm){ L.roof.mat = b.dataset.roofm; commit(); return; }
  if (b.dataset.toolGo){ setTool(b.dataset.toolGo); return; }
  if (b.dataset.s){ S.show3d = b.dataset.s; applyVisibility(); render3D(); renderInspector(); return; }
  if (b.dataset.q !== undefined){ S.hq = b.dataset.q === "1"; render3D(); renderInspector(); return; }
  switch (b.id){
    case "delSel": deleteSel(); break;
    case "grRot": transformSel("rot", 90); break;
    case "grRotL": transformSel("rot", -90); break;
    case "grMir": transformSel("mirror"); break;
    case "grDup": duplicateSel(); break;
    case "wFlip": { [sel.a, sel.b] = [sel.b, sel.a]; const len = wallFrame(sel).len; P.openings.filter(o=>o.wall===sel.id).forEach(o=>o.t = len - o.t); commit(); break; }
    case "wAll": wallsOf(L.id).forEach(w => w.mat = sel.mat); commit(); break;
    case "oFlip": sel.flip = ((sel.flip||0)+1) % 4; commit(); break;
    case "obRot": sel.rot = ((sel.rot||0) + 90) % 360; commit(); break;
    case "obDup": { const c = {...sel, id:uid(), x:sel.x+.6, y:sel.y+.6}; P.objects.push(c); S.sel = {type:"object", id:c.id}; commit(); break; }
    case "camRoom": camPreset("int"); break;
    case "lDel": P.walls = P.walls.filter(w=>w.level!==L.id); P.rooms = P.rooms.filter(r=>r.level!==L.id); P.objects = P.objects.filter(o=>o.level!==L.id); P.openings = P.openings.filter(o=>wallById(o.wall)); P.levels = P.levels.filter(l=>l.id!==L.id); S.level = P.levels[0].id; S.sel = null; commit(); break;
    case "uDel": L.underlay = null; commit(); break;
    case "fit": fitPlan(); break;
    case "newProj": { const p = sampleProject(); p.name = "Nuovo progetto"; p.walls = []; p.openings = []; p.rooms = []; p.objects = []; p.levels[0].roof.type = "none"; P = p; S.level = "L0"; S.sel = null; commit(); $("#projName").value = P.name; fitPlan(); setTool("rect"); break; }
    case "sampleProj": P = sampleProject(); S.level = "L0"; S.sel = null; commit(); $("#projName").value = P.name; fitPlan(); applySky(); camPreset("ext"); break;
    case "phMore": S.phLimit = (S.phLimit || 40) + 40; hydrateOnline(); break;
    case "calApply": { const real = num($("#calReal").value), c = S.calib, U = L.underlay; if (!real || !c?.p2){ toast("Scrivi la misura reale in metri", true); break; }
      const d = Math.hypot(c.p2[0]-c.p1[0], c.p2[1]-c.p1[1]), k = real/d; const ax = c.p1[0], ay = c.p1[1];
      U.ox = ax + (U.ox - ax)*k; U.oy = ay + (U.oy - ay)*k; if (U.kind === "img") U.mpp *= k; else U.k *= k;
      S.calib = null; commit(); toast(`Scala applicata: ×${fmt(k,3)}`); setTool("wall"); break; }
  }
});
function renderLevels(){ renderLevelTabs(); const s = $("#levelSel"); s.innerHTML = [...P.levels].sort((a,b)=>b.elev-a.elev).map(l=>`<option value="${l.id}">${esc(l.name)} (${fmt(l.elev)} m)</option>`).join(""); s.value = S.level; }
$("#levelSel").addEventListener("change", e => { S.level = e.target.value; S.sel = null; S.draw = null; applyVisibility(); render3D(); refresh(); });
$("#addLevel").addEventListener("click", () => {
  const top = P.levels.reduce((a,l)=> l.elev > a.elev ? l : a, P.levels[0]);
  const id = "L" + uid(); const L = {id, name:`Piano ${P.levels.length}`, elev: top.elev + top.height + .25, height:top.height, slab:.25, roof:{...top.roof}, underlay:null};
  top.roof = {...top.roof, type:"none"};
  for (const w of wallsOf(top.id).filter(w=>w.thick >= .25)) P.walls.push({...w, id:uid(), level:id, a:w.a.slice(), b:w.b.slice()});
  P.levels.push(L); S.level = id; S.sel = null; commit(); toast("Piano aggiunto: ho copiato i muri perimetrali del piano sotto");
});
$("#projName").addEventListener("change", e => { P.name = e.target.value; commit(); });
$("#viewSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; S.view = b.dataset.v; $("#views").dataset.mode = S.view; $$("#viewSeg button").forEach(x=>x.setAttribute("aria-pressed", x===b)); requestAnimationFrame(()=>{ resize2D(); resize3D(); }); });
$$("[data-cam]").forEach(b => b.addEventListener("click", () => camPreset(b.dataset.cam)));
$(".tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (!b) return; S.tab = b.dataset.tab; renderTabs(); });
function renderTabs(){ $$(".tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === S.tab)); for (const t of ["props","import","export","ai"]) $("#panel-"+t).hidden = S.tab !== t; if (S.tab === "export") renderExport(); if (S.tab === "import") renderImport(); if (S.tab === "ai") renderAI(); }
$("#undoBtn").addEventListener("click", undo); $("#redoBtn").addEventListener("click", redo);
function refresh(){ renderLevels(); renderInspector(); draw2D(); rebuild3D(); $("#undoBtn").disabled = !past.length; $("#redoBtn").disabled = !future.length; if (S.tab === "export") renderExport(); }
