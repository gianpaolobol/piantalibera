/* ============================================================
   Libreria: alberi procedurali per specie, persone, arredi
   ============================================================ */
let P = null;               // progetto corrente (definito qui perché i materiali lo leggono)

/* ---------- Texture di foglie (carte con trasparenza) ---------- */
const leafTexCache = {};
function leafTexture(kind){
  if (leafTexCache[kind]) return leafTexCache[kind];
  const palm = kind === "palma";
  const W = palm ? 512 : 256, H = palm ? 128 : 256;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); const R = rng(kind.length*131 + 7);
  const greens = {
    latifoglia:["#3f5f2a","#4f7333","#5d823b","#6b8f45","#36532a"],
    betulla:   ["#6c8c3c","#7f9e46","#8fae52","#5b7a33"],
    olivo:     ["#6f7d5a","#87937a","#9aa58c","#5c6a49","#b0b8a0"],
    aghi:      ["#2f4a2a","#3b5a32","#2a3f26","#46663a"],
    cipresso:  ["#26391f","#2f4627","#34502b","#1f301b"],
    arbusto:   ["#3e5e2c","#4c6f34","#5a7f3c","#2f4a24"],
    vaso:      ["#3e6a2e","#4f7e38","#5f9142"],
  }[kind] || ["#4c6c36"];
  if (palm){
    // fronda: rachide centrale e foglioline diagonali
    g.strokeStyle = "#6b6a3a"; g.lineWidth = 4; g.beginPath(); g.moveTo(0,H/2); g.lineTo(W,H/2); g.stroke();
    for (let x=6; x<W-4; x+=5){ const t = x/W, len = (H/2-4)*(0.35 + 0.65*Math.sin(Math.PI*Math.min(1,t*1.15))); for (const s of [-1,1]){ g.strokeStyle = greens.latifoglia ? ["#4d6b2b","#5a7a32","#3f5a24","#6b8a3a"][Math.floor(R()*4)] : "#4c6c36"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, H/2); g.quadraticCurveTo(x+len*.35, H/2 + s*len*.6, x+len*.75, H/2 + s*len); g.stroke(); } }
  } else if (kind === "aghi" || kind === "cipresso"){
    for (let k=0;k<(kind==="cipresso"?55:26);k++){ const cx = 30+R()*(W-60), cy = 30+R()*(H-60); const n = kind==="cipresso"?14:22;
      for (let i=0;i<n;i++){ const a = R()*Math.PI*2, L = (kind==="cipresso"? 10:26)+R()*14; g.strokeStyle = greens[Math.floor(R()*greens.length)]; g.lineWidth = kind==="cipresso"?3.2:1.6; g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx+Math.cos(a)*L, cy+Math.sin(a)*L); g.stroke(); } }
  } else {
    const n = {latifoglia:70, betulla:60, olivo:110, arbusto:90, vaso:26}[kind] || 60;
    const [lw, lh] = {latifoglia:[13,7], betulla:[9,6], olivo:[12,2.6], arbusto:[9,5], vaso:[26,10]}[kind] || [12,6];
    // rametti
    g.strokeStyle = "#5a4634"; g.lineWidth = 1.3; for (let i=0;i<8;i++){ g.beginPath(); g.moveTo(W/2,H/2); g.lineTo(R()*W, R()*H); g.stroke(); }
    for (let i=0;i<n;i++){ const r = Math.sqrt(R())*(W/2-14), a = R()*Math.PI*2, x = W/2 + Math.cos(a)*r, y = H/2 + Math.sin(a)*r;
      g.save(); g.translate(x,y); g.rotate(R()*Math.PI*2); const s = .7 + R()*.6; g.fillStyle = greens[Math.floor(R()*greens.length)];
      g.beginPath(); g.ellipse(0,0,lw*s,lh*s,0,0,Math.PI*2); g.fill(); g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth=.8; g.beginPath(); g.moveTo(-lw*s,0); g.lineTo(lw*s,0); g.stroke(); g.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return leafTexCache[kind] = {tex:t, canvas:c};
}
function leafMaterial(kind, name){
  const {tex} = leafTexture(kind);
  const m = new THREE.MeshStandardMaterial({map:tex, alphaTest:.42, side:THREE.DoubleSide, vertexColors:true, roughness:.85, metalness:0});
  m.name = name; m.userData.key = "fogliame_" + kind; m.envMapIntensity = .5; return m;
}
function barkMaterial(key, color, name){
  if (!MATS[key]) MATS[key] = {nome:name, color, rough:1, tex:"bark", size:.6};
  return getMat(key);
}
MATS.corteccia_betulla = {nome:"Corteccia betulla", color:"#ddd8cc", rough:1, tex:"bark", size:.6};
MATS.corteccia_olivo = {nome:"Corteccia olivo", color:"#7d776b", rough:1, tex:"bark", size:.6};
MATS.tronco_palma = {nome:"Tronco palma", color:"#7a6347", rough:1, tex:"bark", size:.5};

/* ---------- Generatore di alberi ---------- */
const UP = new THREE.Vector3(0,1,0);
function cylBetween(a, b, ra, rb, seg){
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, L, seg, 1, true);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1,1,1)));
  return g;
}
function anyPerp(v){ const p = Math.abs(v.y) < .9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0); return p.cross(v).normalize(); }
function leafCard(center, size, R, tint, flat=0){
  const g = new THREE.PlaneGeometry(size, size);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R()*Math.PI*2*(1-flat) - (flat ? Math.PI/2 : 0), R()*Math.PI*2, R()*Math.PI*2*(1-flat)));
  g.applyMatrix4(new THREE.Matrix4().compose(center, q, new THREE.Vector3(1,1,1)));
  const col = new Float32Array(g.attributes.position.count*3); const k = .78 + R()*.4;
  for (let i=0;i<col.length;i+=3){ col[i]=tint[0]*k; col[i+1]=tint[1]*k; col[i+2]=tint[2]*k; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
}
const SPECIES = {
  quercia:  {nome:"Quercia",  leaf:"latifoglia", bark:"corteccia", trunkH:2.4, trunkR:.26, depth:3, segs:5, clear:2, perSeg:2, child:2, spread:.85, lenRatio:.62, radRatio:.55, bend:.35, gravity:.02, branchLen:3.2, leafDepth:2, cluster:16, clusterR:1.0, card:1.15, tint:[1,1,1]},
  tiglio:   {nome:"Tiglio",   leaf:"latifoglia", bark:"corteccia", trunkH:3.2, trunkR:.22, depth:3, segs:6, clear:2, perSeg:2, child:2, spread:.65, lenRatio:.55, radRatio:.5, bend:.25, gravity:.06, branchLen:2.6, leafDepth:2, cluster:14, clusterR:.9, card:1.05, tint:[.95,1.02,.9]},
  betulla:  {nome:"Betulla",  leaf:"betulla", bark:"corteccia_betulla", trunkH:4.5, trunkR:.13, depth:3, segs:6, clear:3, perSeg:2, child:2, spread:.7, lenRatio:.5, radRatio:.45, bend:.3, gravity:-.08, branchLen:1.9, leafDepth:2, cluster:10, clusterR:.65, card:.85, tint:[1,1,.95]},
  olivo:    {nome:"Olivo",    leaf:"olivo", bark:"corteccia_olivo", trunkH:1.3, trunkR:.24, depth:3, segs:3, clear:1, perSeg:3, child:2, spread:.95, lenRatio:.6, radRatio:.55, bend:.7, gravity:.0, branchLen:2.0, leafDepth:2, cluster:14, clusterR:.75, card:.9, tint:[1,1,1]},
  pino:     {nome:"Pino domestico", leaf:"aghi", bark:"corteccia", trunkH:7.5, trunkR:.28, depth:3, segs:5, clear:4, perSeg:2, child:2, spread:1.15, lenRatio:.55, radRatio:.5, bend:.3, gravity:-.02, branchLen:3.4, leafDepth:2, cluster:14, clusterR:1.0, card:1.2, tint:[1,1,1], lean:.12, flat:.55},
};
function makeTree(spKey, seed=1){
  const G = new THREE.Group();
  const R = rng(seed*7919 + spKey.length*31);
  const wood = [], leaves = [];
  if (spKey === "cipresso") return makeCypress(R);
  if (spKey === "palma") return makePalm(R);
  if (spKey === "arbusto" || spKey === "siepe" || spKey === "vaso_verde") return makeShrub(spKey, R);
  const sp = SPECIES[spKey];
  function limb(p0, dir, len, r0, r1, depth){
    let p = p0.clone(); const d = dir.clone().normalize(); const n = depth === 0 ? sp.segs : 3; const segL = len/n;
    for (let i=0;i<n;i++){
      const ra = r0 + (r1-r0)*i/n, rb = r0 + (r1-r0)*(i+1)/n;
      d.add(new THREE.Vector3((R()-.5)*sp.bend, (R()-.5)*sp.bend*.4 + (depth ? sp.gravity : 0), (R()-.5)*sp.bend)).normalize();
      if (depth === 0 && sp.lean) d.x += sp.lean*.2;
      const q = p.clone().addScaledVector(d, segL);
      wood.push(cylBetween(p, q, ra, rb, depth === 0 ? 10 : depth === 1 ? 7 : 5));
      p = q;
      if (depth < sp.depth && (depth > 0 || i >= sp.clear)){
        const nb = depth === 0 ? sp.perSeg : (R() < .75 ? sp.child : 1);
        for (let k=0;k<nb;k++){
          const nd = d.clone().applyAxisAngle(anyPerp(d), sp.spread*(.6+R()*.6)).applyAxisAngle(d, R()*Math.PI*2);
          if (depth === 0 && sp.flat) nd.y *= (1 - sp.flat);
          const L = (depth === 0 ? sp.branchLen : len*sp.lenRatio) * (.7 + R()*.55) * (depth === 0 ? (1 - i/(n*1.6)) : 1);
          limb(p.clone(), nd, L, rb*sp.radRatio, Math.max(.012, rb*sp.radRatio*.3), depth+1);
        }
      }
    }
    if (depth >= sp.leafDepth){
      const nC = Math.round(sp.cluster * (depth === sp.depth ? 1 : .55));
      for (let k=0;k<nC;k++){ const off = new THREE.Vector3((R()-.5)*2, (R()-.35)*1.6, (R()-.5)*2).multiplyScalar(sp.clusterR); if (sp.flat) off.y *= .45; leaves.push(leafCard(p.clone().add(off), sp.card*(.75+R()*.5), R, sp.tint, sp.flat ? .6 : 0)); }
    }
  }
  limb(new THREE.Vector3(0,-.1,0), new THREE.Vector3((R()-.5)*.1, 1, (R()-.5)*.1), sp.trunkH + (sp.segs-sp.clear)*.35, sp.trunkR, sp.trunkR*.45, 0);
  // radici svasate
  wood.push(cylBetween(new THREE.Vector3(0,-.05,0), new THREE.Vector3(0,.45,0), sp.trunkR*1.7, sp.trunkR*1.02, 12));
  const wg = THREE.BufferGeometryUtils.mergeBufferGeometries(wood.map(clean2), false);
  const wm = new THREE.Mesh(wg, getMat(sp.bark)); wm.name = `Tronco · ${sp.nome}`; G.add(wm);
  const lg = THREE.BufferGeometryUtils.mergeBufferGeometries(leaves, false);
  const lm = new THREE.Mesh(lg, leafMaterial(sp.leaf, `Fogliame · ${sp.nome}`)); lm.name = `Chioma · ${sp.nome}`; lm.userData.leaves = true; G.add(lm);
  return G;
}
function clean2(g){ g = g.index ? g.toNonIndexed() : g; return g; }
function makeCypress(R){
  const G = new THREE.Group(), H = 9 + R()*2, leaves = [], wood = [];
  wood.push(cylBetween(new THREE.Vector3(0,-.05,0), new THREE.Vector3(0,H*.92,0), .2, .04, 9));
  for (let i=0;i<900;i++){ const h = .06 + .94*Math.pow(R(), .9), r = (.85 + .25*R()) * 1.0 * Math.pow(Math.sin(Math.PI*Math.min(1,h*1.05)), .75) * (1 - h*.45) + .05; const a = R()*Math.PI*2, rr = r*Math.sqrt(R()*.6+.4);
    leaves.push(leafCard(new THREE.Vector3(Math.cos(a)*rr, h*H, Math.sin(a)*rr), .7 + R()*.35, R, [1,1,1])); }
  const wm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(wood.map(clean2), false), getMat("corteccia")); wm.name = "Tronco · Cipresso"; G.add(wm);
  const lm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(leaves, false), leafMaterial("cipresso", "Fogliame · Cipresso")); lm.name = "Chioma · Cipresso"; lm.userData.leaves = true; G.add(lm);
  return G;
}
function makePalm(R){
  const G = new THREE.Group(), H = 5.5 + R()*1.5, wood = [], fronds = [];
  // tronco leggermente curvo con anelli
  let p = new THREE.Vector3(0,-.05,0); const d = new THREE.Vector3(.05,1,0).normalize(); const n = 14;
  for (let i=0;i<n;i++){ const q = p.clone().addScaledVector(d, H/n); const r = .42 - .1*i/n + (i%2 ? .015 : 0); wood.push(cylBetween(p, q, r+.01, r, 12)); p = q; d.x += .006; d.normalize(); }
  // base delle foglie (ananas)
  wood.push(cylBetween(p.clone().add(new THREE.Vector3(0,-.4,0)), p.clone().add(new THREE.Vector3(0,.35,0)), .42, .28, 12));
  const top = p.clone().add(new THREE.Vector3(0,.25,0));
  const NF = 34;
  for (let i=0;i<NF;i++){
    const az = i * 2.39996 + R()*.2, tier = i/NF; const elev = .9 - tier*1.4 + (R()-.5)*.25; const L = 3.4 + R()*1.0;
    // nastro curvo: 18 segmenti, larghezza rastremata
    const segs = 18, pos = [], uv = [], idx = [];
    const dirH = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    for (let s=0;s<=segs;s++){
      const t = s/segs, ang = elev - t*t*1.4; const x = Math.cos(ang)*L*t, y = Math.sin(ang)*L*t*.9 + (t*t*-.6);
      const c = top.clone().addScaledVector(dirH, x + .1).add(new THREE.Vector3(0, y, 0));
      const w = (.15 + .55*Math.sin(Math.PI*Math.min(1, t*1.1))) * (1 - t*.25);
      // due falde inclinate a V
      const up = new THREE.Vector3(0, w*.35, 0);
      const a = c.clone().addScaledVector(side, -w).add(up), b = c.clone().addScaledVector(side, w).add(up);
      pos.push(a.x,a.y,a.z, c.x,c.y,c.z, b.x,b.y,b.z); uv.push(t,0, t,.5, t,1);
      if (s){ const o = (s-1)*3; idx.push(o,o+3,o+1, o+1,o+3,o+4, o+1,o+4,o+2, o+2,o+4,o+5); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx);
    const ng = g.toNonIndexed(); const k = .8 + R()*.35; const col = new Float32Array(ng.attributes.position.count*3).fill(k); ng.setAttribute("color", new THREE.BufferAttribute(col,3)); ng.computeVertexNormals();
    fronds.push(ng);
  }
  const wm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(wood.map(clean2), false), getMat("tronco_palma")); wm.name = "Tronco · Palma delle Canarie"; G.add(wm);
  const fm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(fronds, false), leafMaterial("palma", "Fronde · Palma")); fm.name = "Fronde · Palma delle Canarie"; fm.userData.leaves = true; G.add(fm);
  return G;
}
function makeShrub(kind, R){
  const G = new THREE.Group(), leaves = [];
  if (kind === "siepe"){ for (let i=0;i<520;i++){ const x = (R()-.5)*3, y = R()*1.25, z = (R()-.5)*.75; leaves.push(leafCard(new THREE.Vector3(x, y+.05, z), .45+R()*.25, R, [.92,1,.92])); } }
  else if (kind === "arbusto"){ for (let i=0;i<170;i++){ const v = new THREE.Vector3(R()-.5, R()-.5, R()-.5).normalize().multiplyScalar(.35 + .4*Math.cbrt(R())); v.y = v.y*.8 + .6; leaves.push(leafCard(v, .45+R()*.25, R, [1,1,1])); } }
  else { // pianta in vaso
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.22,.17,.45,24), getMat("cemento")); pot.position.y = .225; pot.name = "Vaso"; pot.userData.wuv = true; G.add(pot);
    for (let i=0;i<60;i++){ const a = R()*Math.PI*2, r = R()*.35, h = .5 + R()*.9; leaves.push(leafCard(new THREE.Vector3(Math.cos(a)*r, h, Math.sin(a)*r), .38+R()*.2, R, [1,1,1])); }
  }
  const lm = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(leaves, false), leafMaterial(kind === "vaso_verde" ? "vaso" : "arbusto", kind === "siepe" ? "Fogliame · Siepe" : "Fogliame · Arbusto"));
  lm.name = kind === "siepe" ? "Siepe di alloro" : kind === "arbusto" ? "Arbusto" : "Pianta in vaso"; lm.userData.leaves = true; G.add(lm);
  return G;
}

/* ---------- Persone: sagome di scala (le persone realistiche arrivano dalla libreria personale) ---------- */
function loadGLTF(url, manager){ return new Promise((res, rej) => new THREE.GLTFLoader(manager).load(url, res, undefined, rej)); }
function stripLights(obj){ const rm = []; obj.traverse(o => { if (o.isLight || o.isCamera) rm.push(o); }); rm.forEach(l => l.parent && l.parent.remove(l)); }
function makeFigure(sex="m", walk=false){
  const G = new THREE.Group(), m = getMat("sagoma"), H = sex === "m" ? 1.78 : 1.65, k = H/1.78;
  const limb = (a, b, r0, r1) => { const g = cylBetween(new THREE.Vector3(...a).multiplyScalar(k), new THREE.Vector3(...b).multiplyScalar(k), r0*k, r1*k, 14); const me = new THREE.Mesh(g, m); G.add(me);
    for (const [p, r] of [[a, r0], [b, r1]]){ const s = new THREE.Mesh(new THREE.SphereGeometry(r*k, 14, 10), m); s.position.copy(new THREE.Vector3(...p).multiplyScalar(k)); G.add(s); } };
  const sw = walk ? .22 : 0, hip = sex === "m" ? .1 : .115, sh = sex === "m" ? .2 : .175;
  // gambe
  limb([-hip, .92, 0], [-hip*.95, .5, sw*.9], .085, .06); limb([-hip*.95, .5, sw*.9], [-hip*.9, .08, sw*1.5], .055, .04);
  limb([hip, .92, 0], [hip*.95, .5, -sw*.6], .085, .06); limb([hip*.95, .5, -sw*.6], [hip*.9, .08, -sw*1.2 - (walk?.06:0)], .055, .04);
  for (const [x, z] of [[-hip*.9, sw*1.5], [hip*.9, -sw*1.2 - (walk?.06:0)]]){ const f = new THREE.Mesh(new THREE.BoxGeometry(.09*k, .06*k, .24*k), m); f.position.set(x*k, .03*k, (z+.06)*k); G.add(f); }
  // bacino e busto (profilo tornito)
  const prof = (sex === "m" ? [[0,.86],[.15,.88],[.17,.98],[.15,1.1],[.16,1.22],[.2,1.36],[.21,1.42],[.12,1.47],[.06,1.5],[0,1.5]] : [[0,.84],[.17,.86],[.185,.96],[.13,1.08],[.13,1.16],[.16,1.28],[.17,1.36],[.11,1.41],[.05,1.44],[0,1.44]]).map(([x,y]) => new THREE.Vector2(x*k, y*k));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), m); torso.scale.z = .62; G.add(torso);
  // collo e testa
  limb([0, sex === "m" ? 1.48 : 1.42, 0], [0, sex === "m" ? 1.56 : 1.5, .01], .05, .045);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.105*k, 24, 18), m); head.scale.set(.86, 1.12, 1); head.position.set(0, (sex === "m" ? 1.66 : 1.6)*k, .015*k); G.add(head);
  // braccia
  const shY = sex === "m" ? 1.4 : 1.35;
  limb([-sh, shY, 0], [-sh-.04, 1.1, -sw*.7], .05, .04); limb([-sh-.04, 1.1, -sw*.7], [-sh-.03, .84, -sw*.9 + .05], .04, .032);
  limb([sh, shY, 0], [sh+.04, 1.1, sw*.7], .05, .04); limb([sh+.04, 1.1, sw*.7], [sh+.03, .84, sw*.9 + .05], .04, .032);
  G.children.forEach(c => c.name = "Sagoma");
  return G;
}
async function loadKhronos(file){ const g = await loadGLTF(await assetURL("arredi/" + file)); const s = g.scene; stripLights(s); s.traverse(o => { if (o.isMesh){ const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.envMapIntensity = .7); } }); return s; }

/* ---------- Arredi parametrici (metri, fronte verso +Z) ---------- */
function furn(ref){
  const G = new THREE.Group(), M = getMat;
  const B = (x,y,z,lx,ly,lz,mat,r=0) => { const g = r > 0 ? new THREE.RoundedBoxGeometry(lx,ly,lz,3,Math.min(r,lx/2-.001,ly/2-.001,lz/2-.001)) : new THREE.BoxGeometry(lx,ly,lz); const me = new THREE.Mesh(g, M(mat)); me.position.set(x,y,z); me.userData.wuv = true; G.add(me); return me; };
  const C = (x,y,z,rt,rb,h,mat,seg=24) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg), M(mat)); me.position.set(x,y,z); me.userData.wuv = true; G.add(me); return me; };
  const legs = (w,d,h,t,mat,ins=.04,round=false) => { for (const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const x = sx*(w/2-ins-t/2), z = sz*(d/2-ins-t/2); round ? C(x,h/2,z,t/2,t/2,h,mat,12) : B(x,h/2,z,t,h,t,mat); } };
  switch (ref){
    /* soggiorno */
    case "divano3": { const f="tessuto"; B(0,.24,0,2.2,.26,.92,f,.05); for (const x of [-.71,0,.71]){ B(x,.44,.07,.7,.15,.72,f,.06); B(x,.66,-.33,.7,.42,.2,f,.08); } for (const s of [-1,1]) B(s*1.02,.43,0,.16,.38,.92,f,.06); for (const [x,z] of [[-1,-.4],[1,-.4],[-1,.4],[1,.4]]) C(x,.05,z,.02,.015,.1,"metallo_nero",10); break; }
    case "divano_ang": { const f="tessuto_beige"; B(0,.22,0,2.8,.24,.95,f,.05); B(1.0,.22,.85,.9,.24,1.0,f,.05); for (const x of [-1.05,-.35,.35]) { B(x,.42,.07,.68,.15,.75,f,.06); B(x,.64,-.33,.68,.4,.2,f,.08); } B(1.0,.42,.55,.85,.15,1.5,f,.06); B(1.0,.64,-.33,.85,.4,.2,f,.08); B(-1.48,.41,0,.16,.36,.95,f,.06); break; }
    case "poltrona": { const f="tessuto_blu"; B(0,.24,0,.86,.26,.84,f,.05); B(0,.44,.06,.58,.14,.66,f,.06); B(0,.66,-.32,.66,.46,.18,f,.08); for (const s of [-1,1]) B(s*.36,.46,0,.14,.32,.84,f,.05); for (const [x,z] of [[-.36,-.34],[.36,-.34],[-.36,.34],[.36,.34]]) C(x,.05,z,.02,.015,.1,"legno_scuro",10); break; }
    case "pouf": C(0,.21,0,.27,.27,.42,"pelle",32); break;
    case "tavolino": B(0,.38,0,1.1,.03,.6,"marmo",.01); legs(1.1,.6,.37,.025,"metallo_nero",.05,true); break;
    case "tavolino_t": C(0,.42,0,.4,.4,.03,"legno_chiaro",40); C(0,.21,0,.035,.035,.4,"metallo_nero",12); C(0,.01,0,.2,.22,.02,"metallo_nero",30); break;
    case "mobile_tv": B(0,.27,0,1.9,.42,.42,"legno_chiaro",.01); B(0,.06,0,1.84,.06,.36,"metallo_nero"); B(0,1.02,-.12,1.45,.84,.035,"schermo",.008); B(0,.53,-.12,.3,.05,.2,"metallo_nero"); C(0,.6,-.12,.02,.02,.12,"metallo_nero",8); break;
    case "libreria": { B(-.59,1,0,.03,2,.35,"bianco"); B(.59,1,0,.03,2,.35,"bianco"); B(0,1,-.16,1.2,2,.02,"bianco"); for (let i=0;i<=5;i++) B(0,.02+i*.39,0,1.18,.03,.35,"bianco"); for (let i=0;i<5;i++) B(-.05+((i%2)*.1),.18+i*.39,.02,.95-((i%3)*.15),.28,.24,"libri"); break; }
    case "tappeto": B(0,.006,0,2.4,.012,1.7,"tappeto"); break;
    case "lampada": C(0,.015,0,.16,.17,.03,"metallo_nero",24); C(0,.8,0,.012,.012,1.55,"metallo_nero",8); C(0,1.6,0,.18,.24,.3,"paralume",32); break;
    case "pianta_vaso": return null; // gestita come verde
    /* pranzo */
    case "tavolo6": B(0,.74,0,2.0,.04,.95,"legno_chiaro",.008); legs(2.0,.95,.72,.07,"legno_chiaro",.06); break;
    case "tavolo_tondo": C(0,.74,0,.6,.6,.035,"legno_chiaro",48); C(0,.37,0,.05,.06,.72,"metallo_nero",16); C(0,.02,0,.32,.34,.03,"metallo_nero",36); break;
    case "sedia": B(0,.46,0,.45,.04,.45,"legno_chiaro",.01); B(0,.5,.02,.42,.04,.4,"tessuto_beige",.015); B(0,.72,-.21,.43,.34,.03,"legno_chiaro",.01); legs(.45,.45,.45,.035,"legno_chiaro",.01); for (const s of [-1,1]) B(s*.2,.62,-.21,.035,.3,.035,"legno_chiaro"); break;
    case "sedia_design": { const sh = new THREE.Mesh(new THREE.SphereGeometry(.3,32,16,0,Math.PI*2,Math.PI*.52,Math.PI*.42), M("plastica")); sh.scale.set(1,.9,1); sh.rotation.x = Math.PI; sh.position.set(0,.74,0); sh.material = M("plastica"); G.add(sh); B(0,.46,.02,.42,.02,.4,"plastica",.01); for (const [x,z] of [[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]]){ const l = C(x*1.15,.22,z*1.15,.012,.012,.47,"legno_chiaro",8); l.rotation.z = -x*.25; l.rotation.x = z*.25; } break; }
    case "madia": B(0,.47,0,1.8,.66,.45,"legno_scuro",.01); for (const x of [-.6,0,.6]) B(x,.47,.226,.58,.62,.005,"legno_scuro"); legs(1.8,.45,.14,.03,"metallo_nero",.08,true); break;
    /* cucina */
    case "cucina": { B(0,.05,0,3,.1,.58,"metallo_nero"); B(0,.47,0,3,.74,.6,"bianco"); for (let i=0;i<5;i++) B(-1.2+i*.6,.47,.302,.59,.72,.004,"bianco"); B(0,.88,.01,3.02,.04,.64,"marmo"); B(-.7,.905,0,.6,.01,.5,"schermo"); B(.55,.89,.02,.7,.02,.42,"metallo"); C(.55,1.02,-.22,.015,.015,.25,"metallo",8); B(0,1.85,-.12,3,.72,.36,"bianco"); for (let i=0;i<5;i++) B(-1.2+i*.6,1.85,.062,.59,.7,.004,"bianco"); B(-.7,1.38,-.05,.7,.12,.5,"metallo"); break; }
    case "isola": B(0,.46,0,2.0,.82,.9,"legno_scuro",.01); B(0,.89,0,2.1,.04,1.0,"marmo",.01); for (const x of [-.6,0,.6]){ C(x,.65,.75,.18,.18,.04,"pelle",24); C(x,.33,.75,.015,.015,.62,"metallo_nero",8); C(x,.01,.75,.16,.16,.02,"metallo_nero",24); } break;
    case "frigo": B(0,.95,0,.7,1.9,.68,"metallo",.02); B(0,.6,.345,.68,1.18,.01,"metallo"); B(.3,1.0,.36,.02,.5,.03,"metallo_nero"); break;
    case "sgabello": C(0,.75,0,.19,.19,.05,"legno_chiaro",28); for (const a of [0,2.094,4.188]){ const l = C(Math.cos(a)*.12,.37,Math.sin(a)*.12,.014,.014,.75,"metallo_nero",8); l.rotation.set(Math.sin(a)*.12,0,-Math.cos(a)*.12); } break;
    /* camera */
    case "letto2": B(0,.17,0,1.74,.3,2.12,"tessuto",.04); B(0,.42,.04,1.6,.22,2.0,"lenzuola",.06); B(0,.56,.3,1.62,.08,1.42,"tessuto_beige",.04); B(0,.62,-1.03,1.8,1.0,.1,"tessuto",.05); for (const x of [-.4,.4]) B(x,.6,-.78,.62,.14,.36,"lenzuola",.06); break;
    case "letto1": B(0,.17,0,.98,.3,2.08,"legno_chiaro",.02); B(0,.42,.03,.9,.2,2.0,"lenzuola",.05); B(0,.55,.35,.92,.07,1.3,"tessuto_blu",.03); B(0,.45,-1.02,.98,.6,.05,"legno_chiaro",.01); B(0,.6,-.78,.62,.13,.34,"lenzuola",.05); break;
    case "comodino": B(0,.28,0,.5,.42,.4,"legno_scuro",.01); B(0,.33,.202,.46,.16,.005,"legno_scuro"); legs(.5,.4,.08,.03,"metallo_nero",.03,true); C(0,.64,0,.08,.09,.02,"metallo_nero",16); C(0,.76,0,.01,.01,.22,"metallo_nero",8); C(0,.9,0,.1,.13,.16,"paralume",24); break;
    case "armadio2": B(0,1.2,0,1.2,2.4,.62,"bianco",.005); B(0,1.2,.312,.004,2.36,.004,"laccato_gr"); for (const s of [-1,1]) B(s*.06,1.1,.33,.015,.4,.02,"metallo"); break;
    case "armadio4": B(0,1.2,0,2.4,2.4,.62,"bianco",.005); for (const x of [-.6,0,.6]) B(x,1.2,.312,.004,2.36,.004,"laccato_gr"); for (const x of [-.66,-.54,.54,.66]) B(x,1.1,.33,.015,.4,.02,"metallo"); break;
    case "cassettiera": B(0,.44,0,1.0,.8,.5,"legno_chiaro",.01); for (let i=0;i<4;i++){ B(0,.14+i*.195,.252,.96,.18,.005,"legno_chiaro"); B(0,.2+i*.195,.262,.25,.015,.015,"metallo_nero"); } legs(1.0,.5,.05,.03,"metallo_nero",.03,true); break;
    /* studio */
    case "scrivania": B(0,.74,0,1.4,.03,.7,"legno_chiaro",.005); for (const s of [-1,1]){ B(s*.66,.36,0,.04,.72,.65,"metallo_nero"); } B(0,.6,-.32,1.3,.24,.02,"metallo_nero"); break;
    case "sedia_uff": { for (let i=0;i<5;i++){ const a = i*Math.PI*2/5; const arm = B(Math.cos(a)*.17,.06,Math.sin(a)*.17,.34,.03,.04,"metallo_nero"); arm.rotation.y = -a; C(Math.cos(a)*.32,.03,Math.sin(a)*.32,.025,.025,.05,"metallo_nero",10); } C(0,.28,0,.025,.03,.42,"metallo",12); B(0,.5,0,.5,.08,.48,"tessuto",.03); B(0,.85,-.24,.46,.55,.06,"tessuto",.03); break; }
    /* bagno */
    case "wc": B(0,.2,0,.36,.4,.36,"ceramica",.08); B(0,.43,.06,.38,.04,.5,"ceramica",.02); B(0,.6,-.2,.36,.4,.14,"ceramica",.04); break;
    case "bidet": B(0,.2,0,.36,.4,.36,"ceramica",.08); B(0,.41,.04,.38,.04,.5,"ceramica",.02); C(0,.47,-.18,.015,.015,.1,"metallo",8); break;
    case "lavabo": B(0,.55,0,.8,.48,.48,"legno_scuro",.01); B(0,.82,0,.82,.06,.5,"ceramica",.02); C(0,.86,-.16,.015,.015,.14,"metallo",8); B(0,1.4,-.235,.8,.8,.01,"specchio"); break;
    case "doccia": B(0,.025,0,.9,.05,.9,"ceramica",.01); B(0,1.0,.45,.9,1.95,.01,"vetro"); B(.45,1.0,0,.01,1.95,.9,"vetro"); C(-.3,2.0,-.3,.12,.12,.01,"metallo",24); C(-.38,1.6,-.43,.012,.012,.8,"metallo",8); break;
    case "vasca": B(0,.28,0,1.7,.56,.76,"ceramica",.08); B(0,.5,0,1.56,.12,.62,"acqua",.06); break;
    /* esterni */
    case "tavolo_giard": B(0,.74,0,1.6,.04,.9,"teak",.008); legs(1.6,.9,.72,.06,"teak",.05); break;
    case "sdraio": { const s = B(0,.32,.25,.7,.06,1.3,"teak",.01); s.rotation.x = 0; const b = B(0,.55,-.55,.7,.06,.65,"teak",.01); b.rotation.x = .8; B(0,.38,.25,.62,.06,1.2,"telo",.03); legs(.7,1.9,.3,.05,"teak",.05); break; }
    case "ombrellone": { C(0,1.25,0,.025,.025,2.5,"teak",10); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5,.55,8,1,true), M("telo")); cone.position.y = 2.45; G.add(cone); C(0,.05,0,.3,.32,.1,"cemento",24); break; }
    case "piscina": B(0,-.02,0,8.6,.06,4.6,"pietra",.0); B(0,.02,0,8,.02,4,"acqua"); break;
    case "auto": { const p = "vernice_auto"; B(0,.55,0,4.4,.62,1.82,p,.18); B(-.25,1.08,0,2.3,.5,1.62,"vetro",.15); B(-.25,1.08,0,2.2,.46,1.64,p,.12).scale.set(1,1,1); for (const [x,z] of [[-1.38,-.86],[1.38,-.86],[-1.38,.86],[1.38,.86]]){ const r = new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.24,24), M("metallo_nero")); r.rotation.x = Math.PI/2; r.position.set(x,.34,z); G.add(r); const h = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.25,20), M("metallo")); h.rotation.x = Math.PI/2; h.position.set(x,.34,z); G.add(h); } for (const s of [-1,1]) B(2.18,.6,s*.62,.04,.1,.3,"bianco"); break; }
    default: B(0,.5,0,1,1,1,"bianco");
  }
  return G;
}
/* Catalogo: build = procedurale sincrono, load = asincrono (file in assets/) */
const LIB = [
  {cat:"Soggiorno", ref:"divano3", nome:"Divano 3 posti", dim:"220×92", build:()=>furn("divano3")},
  {cat:"Soggiorno", ref:"divano_ang", nome:"Divano angolare", dim:"280×190", build:()=>furn("divano_ang")},
  {cat:"Soggiorno", ref:"velluto", nome:"Divano in velluto", dim:"218×100", real:true, credit:"Wayfair · CC-BY 4.0", load:()=>loadKhronos("GlamVelvetSofa.glb")},
  {cat:"Soggiorno", ref:"poltrona", nome:"Poltrona", dim:"86×84", build:()=>furn("poltrona")},
  {cat:"Soggiorno", ref:"poltroncina", nome:"Poltroncina imbottita", dim:"82×57", real:true, credit:"Wayfair · CC0", load:()=>loadKhronos("SheenChair.glb")},
  {cat:"Soggiorno", ref:"pouf", nome:"Pouf in pelle", dim:"Ø 54", build:()=>furn("pouf")},
  {cat:"Soggiorno", ref:"tavolino", nome:"Tavolino in marmo", dim:"110×60", build:()=>furn("tavolino")},
  {cat:"Soggiorno", ref:"tavolino_t", nome:"Tavolino tondo", dim:"Ø 80", build:()=>furn("tavolino_t")},
  {cat:"Soggiorno", ref:"mobile_tv", nome:"Mobile TV con TV 65\"", dim:"190×42", build:()=>furn("mobile_tv")},
  {cat:"Soggiorno", ref:"libreria", nome:"Libreria", dim:"120×35", build:()=>furn("libreria")},
  {cat:"Soggiorno", ref:"tappeto", nome:"Tappeto", dim:"240×170", build:()=>furn("tappeto")},
  {cat:"Soggiorno", ref:"lampada", nome:"Lampada da terra", dim:"h 175", build:()=>furn("lampada")},
  {cat:"Pranzo", ref:"tavolo6", nome:"Tavolo 6 posti", dim:"200×95", build:()=>furn("tavolo6")},
  {cat:"Pranzo", ref:"tavolo_tondo", nome:"Tavolo tondo", dim:"Ø 120", build:()=>furn("tavolo_tondo")},
  {cat:"Pranzo", ref:"sedia", nome:"Sedia in legno", dim:"45×45", build:()=>furn("sedia")},
  {cat:"Pranzo", ref:"sedia_design", nome:"Sedia a scocca", dim:"47×52", build:()=>furn("sedia_design")},
  {cat:"Pranzo", ref:"sedia_capitonne", nome:"Sedia capitonné", dim:"68×52", real:true, credit:"Wayfair · CC-BY 4.0", load:()=>loadKhronos("ChairDamaskPurplegold.glb")},
  {cat:"Pranzo", ref:"madia", nome:"Madia", dim:"180×45", build:()=>furn("madia")},
  {cat:"Cucina", ref:"cucina", nome:"Cucina lineare 3 m", dim:"300×60", build:()=>furn("cucina")},
  {cat:"Cucina", ref:"isola", nome:"Isola con 3 sgabelli", dim:"210×100", build:()=>furn("isola")},
  {cat:"Cucina", ref:"frigo", nome:"Frigorifero", dim:"70×68", build:()=>furn("frigo")},
  {cat:"Cucina", ref:"sgabello", nome:"Sgabello alto", dim:"Ø 38", build:()=>furn("sgabello")},
  {cat:"Camera", ref:"letto2", nome:"Letto matrimoniale", dim:"174×212", build:()=>furn("letto2")},
  {cat:"Camera", ref:"letto1", nome:"Letto singolo", dim:"98×208", build:()=>furn("letto1")},
  {cat:"Camera", ref:"comodino", nome:"Comodino con lampada", dim:"50×40", build:()=>furn("comodino")},
  {cat:"Camera", ref:"armadio2", nome:"Armadio 2 ante", dim:"120×62", build:()=>furn("armadio2")},
  {cat:"Camera", ref:"armadio4", nome:"Armadio 4 ante", dim:"240×62", build:()=>furn("armadio4")},
  {cat:"Camera", ref:"cassettiera", nome:"Cassettiera", dim:"100×50", build:()=>furn("cassettiera")},
  {cat:"Studio", ref:"scrivania", nome:"Scrivania", dim:"140×70", build:()=>furn("scrivania")},
  {cat:"Studio", ref:"sedia_uff", nome:"Sedia da ufficio", dim:"68×68", build:()=>furn("sedia_uff")},
  {cat:"Bagno", ref:"wc", nome:"WC sospeso", dim:"38×54", build:()=>furn("wc")},
  {cat:"Bagno", ref:"bidet", nome:"Bidet sospeso", dim:"38×54", build:()=>furn("bidet")},
  {cat:"Bagno", ref:"lavabo", nome:"Lavabo con specchio", dim:"82×50", build:()=>furn("lavabo")},
  {cat:"Bagno", ref:"doccia", nome:"Doccia 90×90", dim:"90×90", build:()=>furn("doccia")},
  {cat:"Bagno", ref:"vasca", nome:"Vasca", dim:"170×76", build:()=>furn("vasca")},
  {cat:"Esterni", ref:"tavolo_giard", nome:"Tavolo da giardino", dim:"160×90", build:()=>furn("tavolo_giard")},
  {cat:"Esterni", ref:"sdraio", nome:"Lettino prendisole", dim:"70×190", build:()=>furn("sdraio")},
  {cat:"Esterni", ref:"ombrellone", nome:"Ombrellone", dim:"Ø 300", build:()=>furn("ombrellone")},
  {cat:"Esterni", ref:"piscina", nome:"Piscina 8×4", dim:"860×460", build:()=>furn("piscina")},
  {cat:"Esterni", ref:"auto", nome:"Automobile", dim:"440×182", build:()=>furn("auto")},
  {cat:"Verde", ref:"quercia", nome:"Quercia", dim:"h ~9 m", plan:"tree", build:()=>makeTree("quercia", 3)},
  {cat:"Verde", ref:"tiglio", nome:"Tiglio", dim:"h ~9 m", plan:"tree", build:()=>makeTree("tiglio", 5)},
  {cat:"Verde", ref:"betulla", nome:"Betulla", dim:"h ~9 m", plan:"tree", build:()=>makeTree("betulla", 2)},
  {cat:"Verde", ref:"olivo", nome:"Olivo", dim:"h ~4,5 m", plan:"tree", build:()=>makeTree("olivo", 4)},
  {cat:"Verde", ref:"cipresso", nome:"Cipresso", dim:"h ~10 m", plan:"tree", build:()=>makeTree("cipresso", 1)},
  {cat:"Verde", ref:"pino", nome:"Pino domestico", dim:"h ~11 m", plan:"tree", build:()=>makeTree("pino", 6)},
  {cat:"Verde", ref:"palma", nome:"Palma delle Canarie", dim:"h ~8 m", plan:"tree", build:()=>makeTree("palma", 1)},
  {cat:"Verde", ref:"arbusto", nome:"Arbusto", dim:"Ø 150", plan:"tree", build:()=>makeTree("arbusto", 2)},
  {cat:"Verde", ref:"siepe", nome:"Siepe 3 m", dim:"300×75", build:()=>makeTree("siepe", 3)},
  {cat:"Verde", ref:"vaso_verde", nome:"Pianta in vaso", dim:"Ø 70", plan:"tree", build:()=>makeTree("vaso_verde", 1)},
  {cat:"Verde", ref:"pianta_real", nome:"Pianta in vaso (realistica)", dim:"Ø 50", real:true, plan:"tree", credit:"Khronos · CC-BY 4.0", load:()=>loadKhronos("DiffuseTransmissionPlant.glb")},
  {cat:"Persone", ref:"sagoma_uomo", nome:"Sagoma uomo in piedi", dim:"h 178", plan:"person", build:()=>makeFigure("m", false)},
  {cat:"Persone", ref:"sagoma_uomo_c", nome:"Sagoma uomo che cammina", dim:"h 178", plan:"person", build:()=>makeFigure("m", true)},
  {cat:"Persone", ref:"sagoma_donna", nome:"Sagoma donna in piedi", dim:"h 165", plan:"person", build:()=>makeFigure("f", false)},
  {cat:"Persone", ref:"sagoma_donna_c", nome:"Sagoma donna che cammina", dim:"h 165", plan:"person", build:()=>makeFigure("f", true)},
];
const LIBMAP = Object.fromEntries(LIB.map(x => [x.ref, x]));
const LIB_ALIASES = {divano:"divano3", letto:"letto2", tavolo:"tavolo6", albero:"quercia", armadio:"armadio2", persona:"sagoma_uomo"}; // progetti della versione 1
let LIB_CATS = [...new Set(LIB.map(x => x.cat))];

/* ---------- Modelli pronti (template) ---------- */
const TPL = {};
function finishTpl(G){
  G.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = !o.userData.leaves;
    if (o.userData.wuv){ const k = (Array.isArray(o.material) ? o.material[0] : o.material).userData.key; o.geometry = worldUV(o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, matDef(k).size || .5); }
    if (o.material?.alphaTest > 0) o.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map:o.material.map, alphaTest:o.material.alphaTest});
  });
  G.userData.box = null; return G;
}
function libRef(ref){ return LIBMAP[ref] ? ref : (LIB_ALIASES[ref] || ref); }
function objTemplate(o){
  if (o.kind === "lib"){
    const ref = libRef(o.ref), it = LIBMAP[ref]; if (!it) return null;
    const t = TPL[ref];
    if (t?.status === "ok") return t.obj;
    if (it.build && !t){ TPL[ref] = {status:"ok", obj:finishTpl(it.build())}; return TPL[ref].obj; }
    if (it.load && !t) loadTpl(ref);
    return null;
  }
  return importStore[o.ref]?.obj || null;
}
let tplPending = 0;
async function loadTpl(ref, quiet){
  TPL[ref] = {status:"loading"}; tplPending++; busy(`Carico ${LIBMAP[ref].nome}…`);
  try { TPL[ref] = {status:"ok", obj:finishTpl(await LIBMAP[ref].load())}; }
  catch(e){ TPL[ref] = {status:"err"}; console.warn(e); if (!quiet) toast(`Non riesco a caricare «${LIBMAP[ref].nome}»: manca la cartella assets accanto alla pagina?`, true); }
  tplPending--; if (!tplPending) busy(""); rebuild3D(); draw2D(); if (S.tab === "props") renderInspector();
}
function objFootprint(o){
  const t = objTemplate(o); if (!t) return {w:.8, d:.8, cx:0, cz:0};
  if (!t.userData.box) t.userData.box = new THREE.Box3().setFromObject(t);
  const b = t.userData.box, s = o.scale || 1; return {w:(b.max.x-b.min.x)*s, d:(b.max.z-b.min.z)*s, cx:(b.max.x+b.min.x)/2*s, cz:(b.max.z+b.min.z)/2*s, h:(b.max.y-b.min.y)*s};
}

/* Libreria personale: assets/personale/indice.json entra nel catalogo interno */
async function loadPersonalIndex(){
  let idx; try { idx = await fetchJSON(ASSET + "personale/indice.json", 6000); } catch(e){ return; }
  if (!Array.isArray(idx) || !idx.length) return;
  for (const it of idx){
    if (!it.file) continue; const cat = it.categoria || "Personale", ref = "pers_" + slugify(it.file);
    if (LIBMAP[ref]) continue;
    const entry = {cat, ref, nome:it.nome || it.file, dim: it.altezza ? `h ${Math.round(it.altezza*100)}` : "", real:true, credit:it.crediti || "Libreria personale", plan: cat === "Persone" ? "person" : cat === "Verde" ? "tree" : undefined, load:() => loadPersonalModel({file:it.file, h:it.altezza})};
    LIB.push(entry); LIBMAP[ref] = entry;
  }
  LIB_CATS = [...new Set(LIB.map(x => x.cat))];
  if (S.tool === "furn") renderInspector(); draw2D(); rebuild3D();
}

/* ---------- Anteprime della libreria ----------
   Ogni oggetto ha un'immagine: prima si cerca assets/anteprime/<ref>.webp (generate con
   npm run build:anteprime), altrimenti la si disegna qui con un renderer dedicato. */
const THUMB = {w:240, h:180};
const thumbCache = {};
let thumbR = null;
function thumbRenderer(){
  if (thumbR) return thumbR;
  const r = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  r.setPixelRatio(1); r.setSize(THUMB.w, THUMB.h); r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new THREE.RoomEnvironment(), .04).texture;
  sc.add(new THREE.HemisphereLight("#eef3f7", "#8a8578", .45));
  const key = new THREE.DirectionalLight("#fff6ea", 2.1); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -.0006; key.shadow.normalBias = .02; sc.add(key, key.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({opacity:.2})); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; sc.add(ground);
  const cam = new THREE.PerspectiveCamera(26, THUMB.w/THUMB.h, .01, 1000);
  return thumbR = {r, sc, key, ground, cam};
}
/** Disegna un oggetto 3D in un'immagine 240×180 vista di tre quarti, con ombra a terra. */
function renderThumb(obj, type = "image/webp"){
  const T = thumbRenderer(), c = obj.clone(true);
  const box = new THREE.Box3().setFromObject(c); if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), rad = Math.max(size.length()/2, .05);
  const tall = size.y > 1.6 * Math.max(size.x, size.z);
  const dir = new THREE.Vector3(.72, tall ? .28 : .62, 1).normalize();
  const fov = THREE.MathUtils.degToRad(T.cam.fov), fit = Math.max(rad / Math.sin(fov/2), rad / Math.sin(Math.atan(Math.tan(fov/2) * T.cam.aspect)));
  T.cam.position.copy(ctr).addScaledVector(dir, fit * .92); T.cam.near = fit / 50; T.cam.far = fit * 10; T.cam.lookAt(ctr); T.cam.updateProjectionMatrix();
  T.ground.position.set(ctr.x, box.min.y + .001, ctr.z); T.ground.scale.setScalar(rad * 8);
  T.key.position.set(ctr.x - rad * 1.6, ctr.y + rad * 4, ctr.z + rad * 2.2); T.key.target.position.copy(ctr);
  const sc = T.key.shadow.camera; sc.left = sc.bottom = -rad * 2; sc.right = sc.top = rad * 2; sc.near = .01; sc.far = rad * 12; sc.updateProjectionMatrix();
  T.sc.add(c); T.r.render(T.sc, T.cam); T.sc.remove(c);
  return T.r.domElement.toDataURL(type, .86);
}
const THUMB_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><g fill="none" stroke="#8f9a96" stroke-width="3" stroke-linejoin="round"><path d="M120 52 172 78v52l-52 26-52-26V78z"/><path d="M68 78l52 26 52-26M120 104v52"/></g></svg>`);
const thumbQueue = []; let thumbBusy = false;
/** Chiamata quando manca l'anteprima statica: la genera (anche per i modelli da caricare) e la mette in cache. */
function queueThumb(img){
  const ref = img.dataset.thumb; if (!ref) return;
  if (thumbCache[ref]){ img.src = thumbCache[ref]; return; }
  img.src = THUMB_PLACEHOLDER; thumbQueue.push(img); if (!thumbBusy) pumpThumbs();
}
function pumpThumbs(){
  const img = thumbQueue.shift(); if (!img){ thumbBusy = false; return; } thumbBusy = true;
  const ref = img.dataset.thumb, it = LIBMAP[ref];
  const next = () => (window.requestIdleCallback || setTimeout)(pumpThumbs, 30);
  if (thumbCache[ref]){ img.src = thumbCache[ref]; return next(); }
  if (!it){ return next(); }
  const t = TPL[ref];
  if (it.load && t?.status !== "ok"){ if (!t) loadTpl(ref, true); return next(); } // al termine il pannello si ridisegna
  try { const o = objTemplate({kind:"lib", ref}); const url = o && renderThumb(o); if (url){ thumbCache[ref] = url; if (img.isConnected) img.src = url; } }
  catch(e){ console.warn("anteprima", ref, e); }
  next();
}
function thumbImg(ref, cls = ""){
  return `<img class="${cls}" src="${thumbCache[ref] || ASSET + "anteprime/" + ref + ".webp"}" data-thumb="${esc(ref)}" alt="" loading="lazy" decoding="async">`;
}
function hydrateThumbs(root){
  root.querySelectorAll("img[data-thumb]").forEach(img => {
    if (thumbCache[img.dataset.thumb]) return;
    if (img.complete && img.naturalWidth === 0 && img.src.indexOf("data:") !== 0) queueThumb(img);
    else img.addEventListener("error", () => queueThumb(img), {once:true});
  });
}
