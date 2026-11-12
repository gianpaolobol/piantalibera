/* ============================================================
   Scena 3D, cielo HDRI, qualità alta (occlusione ambientale)
   ============================================================ */
const importStore = {}; // id -> {obj, file:{name, ext, b64} | null, source, opts}
const S = {
  tool:"select", level:null, sel:null, view:"both", tab:"props", furn:"divano3", furnCat:"Soggiorno", furnSrc:"lib",
  defaults:{ wallThick:.30, wallMat:"intonaco", door:{w:.9,h:2.1}, win:{w:1.2,h:1.4,sill:.9}, roomMat:"parquet" },
  draw:null, typed:"", calib:null, hover:null, show3d:"all", ground:true, hq:false, exposure:1,
};
const level = id => P.levels.find(l => l.id === (id || S.level));
const wallsOf = lid => P.walls.filter(w => w.level === lid);
const wallById = id => P.walls.find(w => w.id === id);

const c3d = $("#c3d");
/* Senza WebGL (PC senza accelerazione grafica, macchine virtuali, desktop remoto) l'editor resta usabile in pianta:
   il renderer diventa un oggetto inerte che accetta ogni chiamata, e la vista 3D mostra un messaggio (#67). */
function inertObject(){ const h = { get:(t, k) => k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : k in t ? t[k] : (t[k] = new Proxy(function(){}, h)),
  apply:() => new Proxy(function(){}, h), construct:() => new Proxy(function(){}, h), set:(t, k, v) => { t[k] = v; return true; } }; return new Proxy(function(){}, h); }
let NO_WEBGL = false;
const renderer = (() => { try { const r = new THREE.WebGLRenderer({canvas:c3d, antialias:true, preserveDrawingBuffer:true}); if (!r.getContext()) throw new Error("WebGL"); return r; }
  catch(e){ NO_WEBGL = true; console.warn("WebGL non disponibile: vista 3D disattivata", e?.message || e); return inertObject(); } })();
if (NO_WEBGL) queueMicrotask(() => {
  const box = document.createElement("div"); box.className = "no3d"; box.setAttribute("role", "status");
  box.innerHTML = "<b>La vista 3D non è disponibile su questo dispositivo.</b><span>Il browser non può usare la grafica 3D (WebGL): capita su computer senza accelerazione grafica, in macchine virtuali o in desktop remoto. La pianta, le tavole, il computo e le esportazioni funzionano. Per il 3D: attiva l'accelerazione hardware nelle impostazioni del browser o aggiorna i driver della scheda video.</span>";
  c3d.parentElement.appendChild(box); });
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, .1, 3000);
camera.position.set(24, 14, 26);
const controls = new THREE.OrbitControls(camera, c3d); controls.target.set(5.5, 1.2, 4); controls.screenSpacePanning = true;
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new THREE.RoomEnvironment(), .04).texture;
scene.environment = roomEnv;
const hemi = new THREE.HemisphereLight("#dfe9f2", "#6d6a5e", .3); scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff3e2", 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 3; scene.add(sun, sun.target);
let modelGroup = new THREE.Group(); scene.add(modelGroup);
const SKY_COL = {light:"#dbe4ea", dark:"#1d2428"};

/* Cieli: HDRI CC0 di Poly Haven inclusi in assets/hdri */
const SKIES = [
  {id:"giorno", nome:"Giorno nuvoloso", file:"hdri/giorno.hdr", sun:{el:42}},
  {id:"tramonto", nome:"Tramonto", file:"hdri/tramonto.hdr", sun:{el:7}},
  {id:"citta", nome:"Città", file:"hdri/citta.hdr", sun:{el:34}},
  {id:"colore", nome:"Colore neutro"},
];
const skyCache = {};
async function applySky(){
  const sk = P.sky || {kind:"asset", id:"giorno"};
  if (sk.id === "colore" || !sk.id){ scene.environment = roomEnv; scene.background = new THREE.Color(isDark() ? SKY_COL.dark : SKY_COL.light); hemi.intensity = .3; nightCheck(); render3D(); return; }
  const key = sk.kind + ":" + sk.id;
  try {
    if (!skyCache[key]){
      await loadScript(CDN3 + "loaders/RGBELoader.js");
      const url = sk.kind === "asset" ? await assetURL(SKIES.find(s => s.id === sk.id).file) : sk.url;
      busy("Carico il cielo…");
      skyCache[key] = await new Promise((res, rej) => new THREE.RGBELoader().load(url, t => { t.mapping = THREE.EquirectangularReflectionMapping; res({bg:t, env:pmrem.fromEquirectangular(t).texture}); }, undefined, rej));
      busy("");
    }
    scene.background = skyCache[key].bg; scene.environment = skyCache[key].env; scene.backgroundBlurriness = 0; hemi.intensity = .12;
  } catch(e){ busy(""); console.warn(e); scene.environment = roomEnv; scene.background = new THREE.Color(isDark() ? SKY_COL.dark : SKY_COL.light); toast("Cielo HDRI non disponibile: uso un colore neutro", true); }
  nightCheck(); render3D();
}
const isDark = () => (matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light") || document.documentElement.dataset.theme === "dark";

/* Qualità alta: SSAO + correzione gamma */
let composer = null, ssao = null;
function ensureComposer(){
  if (composer) return composer;
  const size = renderer.getSize(new THREE.Vector2());
  composer = new THREE.EffectComposer(renderer);
  ssao = new THREE.SSAOPass(scene, camera, size.x, size.y);
  ssao.kernelRadius = .6; ssao.minDistance = .0008; ssao.maxDistance = .03;
  const ov = ssao.overrideVisibility.bind(ssao);
  ssao.overrideVisibility = function(){ ov(); this.scene.traverse(o => { if (o.userData?.leaves || o.material?.transparent) o.visible = false; }); };
  composer.addPass(ssao);
  composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  return composer;
}
function drawFrame(useHQ = S.hq){
  if (useHQ){ ensureComposer(); const s = renderer.getSize(new THREE.Vector2()); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(s.x, s.y); composer.render(); }
  else renderer.render(scene, camera);
}

function boxGeo(cx,cy,cz, lx,ly,lz, rx=0, ry=0, rz=0){
  const g = new THREE.BoxGeometry(lx,ly,lz).toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx,cy,cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)), new THREE.Vector3(1,1,1)));
  return g;
}
function worldUV(geo, size=1){
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count*2);
  for (let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i), nx=n.getX(i), ny=n.getY(i), nz=n.getZ(i);
    let u, v;
    if (Math.abs(ny) > .7){ u = x; v = z; }
    else { const h = Math.hypot(nx,nz)||1, hx=nx/h, hz=nz/h; u = -x*hz + z*hx; v = y; }
    uv[i*2] = u/size; uv[i*2+1] = v/size;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
function clean(g){ g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k); return g; }

/* ---------- Geometria di pianta ---------- */
function wallSolidRanges(w){
  const f = wallFrame(w), ext = w.thick/2;
  const cuts = P.openings.filter(o=>o.wall===w.id).map(o=>({s0:Math.max(.02,o.t-o.w/2), s1:Math.min(f.len-.02,o.t+o.w/2), o})).filter(c=>c.s1>c.s0).sort((a,b)=>a.s0-b.s0);
  const solids = []; let cur = -ext;
  for (const c of cuts){ if (c.s0 > cur) solids.push([cur, c.s0]); cur = Math.max(cur, c.s1); }
  if (f.len + ext > cur) solids.push([cur, f.len + ext]);
  return {f, cuts, solids};
}

/* ---------- Costruzione del modello ----------
   opts: {print, minThick(m), noFill, objects(bool), roof(bool), ground(bool)} */
/* Sagoma della copertura di un piano: rettangoli massimi (anche sovrapposti) che coprono l'ingombro dei muri,
   compresi i loro spessori e le aree chiuse. Piante a L, T, U → più rettangoli; muri obliqui → un rettangolo
   d'ingombro (ortho:false). area(o) = superficie in pianta con lo sporto o (unione esatta per le piante ortogonali). */
function roofRects(lid){
  const ws = wallsOf(lid); if (!ws.length) return null;
  let tMax = 0, ortho = true; const xs = new Set(), zs = new Set();
  for (const w of ws){ tMax = Math.max(tMax, w.thick); const dx = w.b[0]-w.a[0], dz = w.b[1]-w.a[1]; if (Math.abs(dx) > 1e-3 && Math.abs(dz) > 1e-3) ortho = false;
    for (const q of [w.a, w.b]){ xs.add(+(q[0]-w.thick/2).toFixed(3)); xs.add(+(q[0]+w.thick/2).toFixed(3)); zs.add(+(q[1]-w.thick/2).toFixed(3)); zs.add(+(q[1]+w.thick/2).toFixed(3)); } }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const bbox = {x0:X[0], x1:X[X.length-1], z0:Z[0], z1:Z[Z.length-1]};
  const rectArea = (rs, o) => { const ex = [...new Set(rs.flatMap(r => [r.x0-o, r.x1+o]))].sort((a, b) => a - b), ez = [...new Set(rs.flatMap(r => [r.z0-o, r.z1+o]))].sort((a, b) => a - b); let A = 0;
    for (let i = 0; i < ex.length-1; i++) for (let j = 0; j < ez.length-1; j++){ const cx = (ex[i]+ex[i+1])/2, cz = (ez[j]+ez[j+1])/2; if (rs.some(r => cx > r.x0-o && cx < r.x1+o && cz > r.z0-o && cz < r.z1+o)) A += (ex[i+1]-ex[i])*(ez[j+1]-ez[j]); } return A; };
  if (!ortho || X.length > 80 || Z.length > 80) return {rects:[bbox], bbox, tMax, ortho:false, area:o => rectArea([bbox], o)};
  // celle della griglia: piene se dentro un muro o in un'area chiusa dai muri (riempimento dall'esterno)
  const nx = X.length-1, nz = Z.length-1, inWall = (x, z) => ws.some(w => { const q = projOnSeg([x, z], w.a, w.b); return q.d <= w.thick/2 + 1e-4; });
  const full = Array.from({length:nx}, (_, i) => Array.from({length:nz}, (_, j) => inWall((X[i]+X[i+1])/2, (Z[j]+Z[j+1])/2)));
  const out = Array.from({length:nx}, () => Array(nz).fill(false)), st = [];
  for (let i = 0; i < nx; i++) for (const j of [0, nz-1]) if (!full[i][j]) st.push([i, j]);
  for (let j = 0; j < nz; j++) for (const i of [0, nx-1]) if (!full[i][j]) st.push([i, j]);
  while (st.length){ const [i, j] = st.pop(); if (i < 0 || j < 0 || i >= nx || j >= nz || out[i][j] || full[i][j]) continue; out[i][j] = true; st.push([i+1, j], [i-1, j], [i, j+1], [i, j-1]); }
  const cov = (i0, i1, j0, j1) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (out[i][j]) return false; return true; };
  // rettangoli massimi: per ogni coppia di colonne, le strisce di righe coperte; si tengono quelli non contenuti in altri
  const cand = [];
  for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0; i1 < nx; i1++){ let j0 = null;
    for (let j = 0; j <= nz; j++){ const ok = j < nz && cov(i0, i1, j, j); if (ok && j0 === null) j0 = j; if (!ok && j0 !== null){ cand.push({i0, i1, j0, j1:j-1}); j0 = null; } } }
  const maxi = cand.filter(r => !cand.some(q => q !== r && q.i0 <= r.i0 && q.i1 >= r.i1 && q.j0 <= r.j0 && q.j1 >= r.j1));
  const area = r => (X[r.i1+1]-X[r.i0])*(Z[r.j1+1]-Z[r.j0]);
  // copertura avida: il rettangolo che copre più celle ancora scoperte (in superficie), finché tutto è coperto; strisce sotto 1 m scartate se già coperte
  const left = new Set(); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (!out[i][j]) left.add(i*nz + j);
  const pick = [];
  while (left.size){ let best = null, bv = 0;
    for (const r of maxi){ let v = 0; for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) if (left.has(i*nz + j)) v += (X[i+1]-X[i])*(Z[j+1]-Z[j]); const sc = v + area(r)*1e-3; if (v > 0 && sc > bv){ bv = sc; best = r; } }
    if (!best) break; pick.push(best); for (let i = best.i0; i <= best.i1; i++) for (let j = best.j0; j <= best.j1; j++) left.delete(i*nz + j); }
  const rects = pick.map(r => ({x0:X[r.i0], x1:X[r.i1+1], z0:Z[r.j0], z1:Z[r.j1+1]}));
  return {rects:rects.length ? rects : [bbox], bbox, tMax, ortho:true, area:o => rectArea(rects.length ? rects : [bbox], o)};
}
function buildModel(opts={}){
  const root = new THREE.Group(); root.name = P.name || "Progetto";
  const buckets = new Map();
  const add = (lid, mat, cat, geo, room) => { const k = lid+"|"+mat+"|"+cat+(room ? "|"+room.id : ""); if (!buckets.has(k)) buckets.set(k, {lid, mat, cat, geos:[], tile:room?.tile}); buckets.get(k).geos.push(clean(geo)); };
  const parts = {};
  const levelGroup = lid => parts[lid] || (parts[lid] = Object.assign(new THREE.Group(), {name: level(lid)?.name || lid, userData:{lid}}));
  for (const L of P.levels){
    if (opts.levels && !opts.levels.has(L.id)) continue;   // solo i piani richiesti (ricostruzione per piano, #63)
    const e0 = L.elev, base = e0 - L.slab;
    for (const w of wallsOf(L.id)){
      const {f, cuts, solids} = wallSolidRanges(w); if (f.len < .01) continue;
      const t = opts.print ? Math.max(w.thick, opts.minThick||0) : w.thick;
      const h = (w.height || L.height), rot = -Math.atan2(w.b[1]-w.a[1], w.b[0]-w.a[0]);
      const piece = (s0,s1,y0,y1,depth,mat,cat,off=0) => { if (s1-s0 < .001 || y1-y0 < .001) return; const m=(s0+s1)/2, p=ptOnWall(w,m,off); add(L.id, mat, cat, boxGeo(p[0], (y0+y1)/2, p[1], s1-s0, y1-y0, depth, 0, rot, 0)); };
      const skins = opts.print ? [] : wallSkins(w);
      const solid = (s0,s1,y0,y1) => { piece(s0,s1,y0,y1, t, w.mat, "wall"); for (const k of skins) piece(s0,s1,Math.max(y0,e0),y1, .004, k.mat, "wall", k.side*(t/2+.002)); };
      for (const [s0,s1] of solids) solid(s0,s1, base, e0+h);
      for (const c of cuts){
        const o = c.o, bot = o.type === "door" ? 0 : o.sill, topO = Math.min(h, bot + o.h);
        solid(c.s0,c.s1, base, e0+bot);
        if (topO < h) solid(c.s0,c.s1, e0+topO, e0+h);
        if (opts.noFill) continue;
        if (typeof buildOpeningFill === "function"){ buildOpeningFill(w, c, piece, e0, bot, topO, t); continue; }
        const fw = .06, fd = Math.min(.09, t*.8);
        if (o.type === "window"){
          piece(c.s0, c.s0+fw, e0+bot, e0+topO, fd, "serramento", "frame"); piece(c.s1-fw, c.s1, e0+bot, e0+topO, fd, "serramento", "frame");
          piece(c.s0+fw, c.s1-fw, e0+bot, e0+bot+fw, fd, "serramento", "frame"); piece(c.s0+fw, c.s1-fw, e0+topO-fw, e0+topO, fd, "serramento", "frame");
          if (c.s1-c.s0 > 1.3) piece((c.s0+c.s1)/2-.03, (c.s0+c.s1)/2+.03, e0+bot+fw, e0+topO-fw, fd, "serramento", "frame");
          piece(c.s0+fw, c.s1-fw, e0+bot+fw, e0+topO-fw, .02, "vetro", "glass");
          if (bot > .05) piece(c.s0-.03, c.s1+.03, e0+bot-.04, e0+bot, t+.06, "marmo", "sill");
        } else {
          piece(c.s0, c.s0+.05, e0, e0+topO, fd, "serramento", "frame"); piece(c.s1-.05, c.s1, e0, e0+topO, fd, "serramento", "frame"); piece(c.s0+.05, c.s1-.05, e0+topO-.05, e0+topO, fd, "serramento", "frame");
          piece(c.s0+.05, c.s1-.05, e0+.01, e0+topO-.05, .045, "legno", "door");
        }
      }
    }
    const below = P.levels.filter(l => l.elev < L.elev - .01).sort((a,b) => b.elev - a.elev)[0], holesUp = below ? stairHoles(below.id) : [], holesHere = stairHoles(L.id);
    for (const r of P.rooms.filter(r=>r.level===L.id)){
      if (r.pts.length < 3) continue;
      const sh = roomShape(r, holesUp);
      const g = new THREE.ExtrudeGeometry(sh, {depth:L.slab, bevelEnabled:false}); g.rotateX(Math.PI/2); g.translate(0, e0, 0);
      add(L.id, r.mat, "floor", g, r.tile ? r : null);
      if (!opts.print && !r.noCeiling){ const csh = roomShape(r, holesHere), cm = r.ceilMat || (r.ceilH ? "cartongesso" : "soffitto");
        if (r.ceilH){ const cg = new THREE.ExtrudeGeometry(csh, {depth:.06, bevelEnabled:false}); cg.rotateX(Math.PI/2); cg.translate(0, e0 + r.ceilH + .06, 0); add(L.id, cm, "ceiling", cg); }
        else { const cg = new THREE.ShapeGeometry(csh); cg.rotateX(Math.PI/2); cg.translate(0, e0 + L.height - .005, 0); add(L.id, cm, "ceiling", cg); } }
      if (!opts.print && r.skirt) for (const sg of skirtGeos(r, L)) add(L.id, r.skirt.mat || "bianco", "skirt", sg);
    }
    if (L.roof && L.roof.type !== "none" && opts.roof !== false){
      const ws = wallsOf(L.id), RR = roofRects(L.id); if (ws.length && RR) for (const rr of RR.rects){
        // una copertura per ogni rettangolo massimo della sagoma: sulle piante a L, T, U i tetti si incontrano nei compluvi
        const {x0, x1, z0, z1} = rr, tMax = RR.tMax, single = RR.rects.length === 1;
        const topY = e0 + L.height, o = L.roof.overhang, th = .22, rm = L.roof.mat, lid = "roof:"+L.id;
        if (L.roof.type === "hip" || L.roof.type === "shed") buildRoofX(L, {x0, x1, z0, z1, tMax, topY, o, lid, rm, all:RR.bbox, others:RR.rects.filter(q => q !== rr)}, add, opts);
        else if (L.roof.type === "flat"){
          add(lid, rm, "roof", boxGeo((x0+x1)/2, topY+th/2, (z0+z1)/2, x1-x0+2*o, th, z1-z0+2*o));
        } else {
          const p = THREE.MathUtils.degToRad(clamp(L.roof.pitch, 5, 60)), along = single && L.roof.ridge === "x" ? true : single && L.roof.ridge === "y" ? false : (x1-x0) >= (z1-z0);
          const W0 = along ? z1-z0 : x1-x0, Lr = (along ? x1-x0 : z1-z0) + 2*o, cx=(x0+x1)/2, cz=(z0+z1)/2;
          const rise0 = W0/2*Math.tan(p), half = W0/2 + o, sl = half/Math.cos(p), eave = topY - o*Math.tan(p), midY = eave + half*Math.tan(p)/2;
          if (along){
            add(lid, rm, "roof", boxGeo(cx, midY + Math.cos(p)*th/2, cz + half/2 + Math.sin(p)*th/2, Lr, th, sl, p, 0, 0));
            add(lid, rm, "roof", boxGeo(cx, midY + Math.cos(p)*th/2, cz - half/2 - Math.sin(p)*th/2, Lr, th, sl, -p, 0, 0));
          } else {
            add(lid, rm, "roof", boxGeo(cx + half/2 + Math.sin(p)*th/2, midY + Math.cos(p)*th/2, cz, sl, th, Lr, 0, 0, -p));
            add(lid, rm, "roof", boxGeo(cx - half/2 - Math.sin(p)*th/2, midY + Math.cos(p)*th/2, cz, sl, th, Lr, 0, 0, p));
          }
          const wm = ws[0].mat, gt = Math.max(tMax, opts.print ? opts.minThick||0 : 0);
          const tri = new THREE.Shape([new THREE.Vector2(-W0/2,0), new THREE.Vector2(W0/2,0), new THREE.Vector2(0,rise0)]);
          for (const sgn of [-1, 1]){
            const g = new THREE.ExtrudeGeometry(tri, {depth:gt, bevelEnabled:false}); g.translate(0,0,-gt/2);
            if (along){ g.rotateY(Math.PI/2); g.translate(sgn>0 ? x1-gt/2 : x0+gt/2, topY, cz); }
            else { g.translate(cx, topY, sgn>0 ? z1-gt/2 : z0+gt/2); }
            add(lid, wm, "gable", g);
          }
        }
      }
    }
  }
  for (const b of buckets.values()){
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(b.geos, false); if (!merged) continue;
    if (b.tile) floorUV(merged, (matDef(b.mat).size || 1) * (b.tile.scale || 1), b.tile); else worldUV(merged, matDef(b.mat).size || 1);
    const mesh = new THREE.Mesh(merged, getMat(b.mat));
    const isRoof = b.lid.startsWith("roof:"), lv = level(isRoof ? b.lid.slice(5) : b.lid);
    const catName = {ceiling:"Soffitti", wall:"Muri", frame:"Telai", glass:"Vetri", door:"Porte", floor:"Solai", roof:"Copertura", gable:"Timpani", sill:"Davanzali", skirt:"Battiscopa"}[b.cat];
    mesh.name = `${catName} · ${matName(b.mat)} · ${lv?.name || ""}`;
    mesh.castShadow = b.cat !== "glass"; mesh.receiveShadow = true;
    mesh.userData = {cat:b.cat, level: lv?.id, mat:b.mat};
    (isRoof ? (parts.roof || (parts.roof = Object.assign(new THREE.Group(), {name:"Copertura"}))) : levelGroup(b.lid)).add(mesh);
  }
  if (opts.objects !== false){
    for (const o of P.objects){
      if (o.hidden || (opts.levels && !opts.levels.has(o.level))) continue; const t = objTemplate(o), L = level(o.level); if (!t || !L) continue;
      const c = t.clone(true); c.name = o.name || "Oggetto"; c.position.set(o.x, L.elev + (o.z||0), o.y); c.rotation.y = -THREE.MathUtils.degToRad(o.rot||0); c.scale.setScalar(o.scale||1);
      c.userData = {cat:"object", level:L.id, objId:o.id};
      c.traverse(m => { if (m.isMesh && m !== c) m.userData = {...m.userData, level:L.id, inObject:true}; });
      decorateObject3D(c, o);
      levelGroup(L.id).add(c);
    }
  }
  for (const L of P.levels){ if (parts[L.id]) root.add(parts[L.id]); }
  if (parts.roof) root.add(parts.roof);
  if (opts.ground){
    const g = new THREE.PlaneGeometry(400, 400).toNonIndexed(); g.rotateX(-Math.PI/2); g.translate(0, -.02, 0);
    const gm = new THREE.Mesh(worldUV(g, matDef("erba").size), getMat("erba")); gm.name = "Terreno · Prato"; gm.receiveShadow = true; gm.userData = {cat:"ground"}; root.add(gm);
  }
  return {root, parts};
}
function modelBox(){ const b = new THREE.Box3(); modelGroup.traverse(o => { if (o.isMesh && o.userData.cat !== "ground" && o.visible) b.expandByObject(o); }); if (b.isEmpty()) b.set(new THREE.Vector3(-5,0,-5), new THREE.Vector3(5,3,5)); return b; }
function archBox(){ const b = new THREE.Box3(); modelGroup.traverse(o => { if (o.isMesh && ["wall","roof","floor","gable"].includes(o.userData.cat)) b.expandByObject(o); }); if (b.isEmpty()) return modelBox(); return b; }

let rebuildQueued = false;
/* Ricostruzione per piano (#63): ogni piano ha un'impronta dei dati che lo determinano (il piano, i suoi muri, locali,
   aperture e oggetti, le scale di tutti i piani per i fori nei solai, quote e altezze dei piani, materiali, terreno);
   si ricostruiscono solo i piani la cui impronta è cambiata e si riusano gli altri gruppi così come sono. */
const LV3D = new Map();   // id del piano → {key, group, roofs:[mesh]}
let ground3D = null;
const longOut = (k, v) => typeof v === "string" && v.length > 256 ? v.length + ":" + v.slice(0, 64) + v.slice(-64) : v;
function levelKeys(){
  const stairs = P.objects.filter(o => o.kind === "lib" && LIBMAP[libRef(o.ref)]?.param?.kind === "stair");
  const common = JSON.stringify([P.levels.map(l => [l.id, l.elev, l.height, l.slab]), stairs, P.materials], longOut);
  const out = new Map();
  for (const L of P.levels){ const ws = wallsOf(L.id), ids = new Set(ws.map(w => w.id));
    out.set(L.id, common + JSON.stringify([L, ws, P.rooms.filter(r => r.level === L.id), P.openings.filter(o => ids.has(o.wall)), P.objects.filter(o => o.level === L.id).map(o => [o, objTemplate(o)?.uuid || null])], longOut)); }   // il modello può arrivare dopo (import, modelli realistici)
  return out;
}
function disposeMeshes(g){ g.traverse(o => { if (o.isMesh && !o.userData.inObject && o.userData.cat && o.userData.cat !== "object") o.geometry?.dispose?.(); }); }
function rebuild3D(){
  if (rebuildQueued) return; rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; rebuildNow(); });
}
function rebuildNow(){
  {
    scene.remove(modelGroup);
    const keys = levelKeys(), changed = new Set([...keys].filter(([id, k]) => LV3D.get(id)?.key !== k).map(([id]) => id));
    for (const [id, c] of LV3D) if (!keys.has(id) || changed.has(id)){ disposeMeshes(c.group); for (const m of c.roofs) disposeMeshes(m); LV3D.delete(id); }
    const fresh = changed.size || !ground3D !== !S.ground ? buildModel({ground:S.ground && !ground3D, levels:changed}).root : null;
    if (fresh){ const roofG = fresh.children.find(c => c.name === "Copertura");
      for (const id of changed){ const g = fresh.children.find(c => c !== roofG && c.userData.lid === id) || Object.assign(new THREE.Group(), {name:level(id)?.name || id});
        g.userData.lid = id; LV3D.set(id, {key:keys.get(id), group:g, roofs:roofG ? roofG.children.filter(m => m.userData.level === id) : []}); }
      const gr = fresh.children.find(c => c.userData.cat === "ground"); if (gr) ground3D = gr; }
    if (!S.ground && ground3D){ ground3D.geometry.dispose(); ground3D = null; }
    const root = new THREE.Group(); root.name = P.name || "Progetto"; const roof = new THREE.Group(); roof.name = "Copertura";
    for (const L of P.levels){ const c = LV3D.get(L.id); if (!c) continue; root.add(c.group); for (const m of c.roofs) roof.add(m); }
    if (roof.children.length) root.add(roof); if (ground3D) root.add(ground3D);
    modelGroup = root; scene.add(modelGroup);
    applyVisibility(); placeSun(); render3D(); if (typeof afterRebuild3D === "function") afterRebuild3D();
  }
}
function applyVisibility(){
  const cur = level(); const cut = S.show3d === "section";
  modelGroup.traverse(o => {
    if (!o.userData || o === modelGroup) return;
    const lv = level(o.userData.level);
    if (o.userData.cat && lv && cur && S.show3d !== "all" && !o.userData.inObject) o.visible = lv.elev <= cur.elev + 1e-6;
    if (o.userData.cat === "ceiling") o.visible = S.show3d !== "section" && S.ceilings !== false;
    if (o.userData.cat === "roof" || o.userData.cat === "gable") o.visible = S.show3d === "all" || (lv && cur && lv.elev < cur.elev);
  });
  const planes = cut && cur ? [new THREE.Plane(new THREE.Vector3(0,-1,0), cur.elev + 1.2)] : [];
  if (S.vcut?.axis){ const b = archBox(), x = S.vcut.axis === "x", lo = x ? b.min.x : b.min.z, hi = x ? b.max.x : b.max.z, at = lo + (hi - lo) * S.vcut.pos / 100; planes.push(new THREE.Plane(x ? new THREE.Vector3(-1,0,0) : new THREE.Vector3(0,0,-1), at)); }
  renderer.clippingPlanes = planes;
}
function placeSun(){
  const b = archBox(), c = b.getCenter(new THREE.Vector3()), r = Math.max(10, b.getSize(new THREE.Vector3()).length()*.9);
  const az = THREE.MathUtils.degToRad(P.sun.az), el = THREE.MathUtils.degToRad(P.sun.el);
  const d = new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), -Math.cos(az)*Math.cos(el));
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(d, r*2);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.near = .5; sc.far = r*4.5; sc.updateProjectionMatrix();
  sun.intensity = (.8 + 2.6*Math.sin(clamp(el, 0, Math.PI/2))) * (P.sky?.id && P.sky.id !== "colore" ? .85 : 1);
  sun.color.set(P.sun.el < 12 ? "#ffc58a" : P.sun.el < 25 ? "#ffe0b8" : "#fff3e2");
  renderer.toneMappingExposure = S.exposure;
  nightCheck();
}
let rq = false;
function render3D(){ if (rq) return; rq = true; requestAnimationFrame(()=>{ rq=false; drawFrame(); hud3d(); if (typeof afterFrame3D === "function") afterFrame3D(); }); }
controls.addEventListener("change", render3D);
function hud3d(){ const L = level(); if (!L) return; $("#hud3d").innerHTML = `<span>Sole az ${Math.round(P.sun.az)}° · alt ${Math.round(P.sun.el)}°</span><span>${S.show3d==="all"?"Tutti i piani":S.show3d==="below"?"Fino a: "+esc(L.name):"Sezione a +1,20 m"}</span>${S.hq?"<span>Qualità alta</span>":""}`; }
function resize3D(){ const r = c3d.parentElement.getBoundingClientRect(); if (r.width < 2) return; renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(r.width, r.height, false); camera.aspect = r.width/r.height; camera.updateProjectionMatrix(); if (ssao) ssao.setSize(r.width, r.height); render3D(); }
function camPreset(k){
  const b = archBox(), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), R = Math.max(sz.x, sz.z, 6);
  camera.fov = 45;
  if (k === "ext"){ camera.position.set(c.x + R*.75, 1.7 + R*.1, c.z + R*1.3); controls.target.set(c.x, Math.min(c.y, 2.2), c.z); }
  else if (k === "bird"){ camera.position.set(c.x + R*1.0, R*1.05, c.z + R*1.1); controls.target.copy(c); }
  else if (k === "top"){ camera.position.set(c.x, R*1.9, c.z + .01); controls.target.set(c.x, 0, c.z); }
  else if (k === "int"){
    const L = level(), sel = findSel(); const room = S.sel?.type === "room" ? sel : P.rooms.find(r=>r.level===L.id);
    if (!room){ toast("Disegna prima un pavimento su questo piano", true); return; }
    const xs = room.pts.map(p=>p[0]), ys = room.pts.map(p=>p[1]);
    const xa=Math.min(...xs)+.4, xb=Math.max(...xs)-.4, ya=Math.min(...ys)+.4, yb=Math.max(...ys)-.4;
    camera.fov = 68; camera.position.set(xa, L.elev + 1.55, yb); controls.target.set(xb, L.elev + 1.25, ya);
    if (S.show3d === "all"){ S.show3d = "below"; applyVisibility(); renderInspector(); }
  }
  camera.updateProjectionMatrix(); controls.update(); render3D();
}
/* Rendering a risoluzione maggiore (per esportazioni e render AI) */
function renderAt(factor, setup, opts={}){
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  let f = factor; if (opts.longSide) f = opts.longSide / Math.max(size.x, size.y);
  f = Math.min(f, 4096 / Math.max(size.x, size.y));
  renderer.setPixelRatio(f); renderer.setSize(size.x, size.y, false);
  const restore = setup ? setup() : null;
  drawFrame(opts.plain ? false : (opts.hq ?? S.hq));
  const out = document.createElement("canvas"); out.width = c3d.width; out.height = c3d.height; out.getContext("2d").drawImage(c3d, 0, 0);
  if (restore) restore(); renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false); drawFrame();
  return out;
}
function groundVis(v){ let prev = true; modelGroup.traverse(o => { if (o.userData?.cat === "ground"){ prev = o.visible; o.visible = v; } }); return prev; }
function depthCanvas(scale, opts={}){
  const b = modelBox(); const corners = []; for (const x of [b.min.x,b.max.x]) for (const y of [b.min.y,b.max.y]) for (const z of [b.min.z,b.max.z]) corners.push(new THREE.Vector3(x,y,z).distanceTo(camera.position));
  return renderAt(scale, () => { const bg = scene.background, n = camera.near, fa = camera.far, gv = groundVis(false);
    camera.near = Math.max(.1, Math.min(...corners)*.8); camera.far = Math.max(...corners)*1.1; camera.updateProjectionMatrix();
    scene.background = new THREE.Color("#000"); const dm = new THREE.MeshDepthMaterial(), rm = [], tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    modelGroup.traverse(o => { if (!o.isMesh) return; const m0 = Array.isArray(o.material) ? o.material[0] : o.material; rm.push([o, o.material]); o.material = m0.alphaTest > 0 ? new THREE.MeshDepthMaterial({map:m0.map, alphaTest:m0.alphaTest, side:THREE.DoubleSide}) : dm; });
    return () => { rm.forEach(([o,m]) => o.material = m); renderer.toneMapping = tm; scene.background = bg; camera.near = n; camera.far = fa; camera.updateProjectionMatrix(); groundVis(gv); }; }, {...opts, plain:true});
}
function linesCanvas(scale, opts={}){
  return renderAt(scale, () => { const bg = scene.background, added = [], gv = groundVis(false); scene.background = new THREE.Color("#fff");
    const white = new THREE.MeshBasicMaterial({color:"#ffffff", polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1});
    const lm = new THREE.LineBasicMaterial({color:"#111111"}); const restoreMats = [];
    modelGroup.updateMatrixWorld(true);
    modelGroup.traverse(o => { if (o.isMesh && o.visible && o.userData.cat !== "ground"){ if (!o.userData.leaves){ const l = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lm); l.matrixAutoUpdate = false; l.matrix.copy(o.matrixWorld); scene.add(l); added.push(l); } restoreMats.push([o, o.material]); const m0 = Array.isArray(o.material) ? o.material[0] : o.material; o.material = m0.alphaTest > 0 ? new THREE.MeshBasicMaterial({color:"#ffffff", map:m0.map, alphaTest:m0.alphaTest, side:THREE.DoubleSide}) : white; } });
    return () => { added.forEach(l => { scene.remove(l); l.geometry.dispose(); }); restoreMats.forEach(([o,m]) => o.material = m); scene.background = bg; groundVis(gv); }; }, {...opts, plain:true});
}
/* mappa materiali a colori piatti (per segmentazione / ControlNet) */
function matColor(key){ let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const hue = ((h >>> 0) % 360); return new THREE.Color().setHSL(hue/360, .65, .5); }
function materialsCanvas(scale, opts={}){
  const legend = {};
  const c = renderAt(scale, () => { const bg = scene.background, restoreMats = []; scene.background = new THREE.Color("#000"); const cache = {};
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    modelGroup.traverse(o => { if (!o.isMesh || !o.visible) return; const mm = Array.isArray(o.material) ? o.material[0] : o.material; const key = o.userData.mat || mm.userData?.key || (o.userData.leaves ? "verde" : (o.userData.inObject ? "arredi" : "altro")); const col = matColor(key);
      legend["#" + col.getHexString()] = key === "verde" ? "Vegetazione" : key === "arredi" ? "Arredi e oggetti" : matName(key);
      cache[key] = cache[key] || new THREE.MeshBasicMaterial({color:col, alphaTest:mm.alphaTest || 0, map: mm.alphaTest ? mm.map : null}); restoreMats.push([o, o.material]); o.material = cache[key]; });
    return () => { restoreMats.forEach(([o,m]) => o.material = m); scene.background = bg; renderer.toneMapping = tm; }; }, {...opts, plain:true});
  return {canvas:c, legend};
}
