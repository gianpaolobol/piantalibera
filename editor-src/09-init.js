/* ============================================================
   Progetto di esempio, migrazione, avvio
   ============================================================ */
function sampleProject(){
  const L0 = {id:"L0", name:"Piano terra", elev:0, height:2.9, slab:.25, roof:{type:"gable", pitch:26, overhang:.5, mat:"tegole"}, underlay:null};
  const w = (a,b,t=.3,mat="intonaco") => ({id:uid(), level:"L0", a, b, thick:t, height:null, mat});
  const W1=w([0,0],[11,0]), W2=w([11,0],[11,8]), W3=w([11,8],[0,8]), W4=w([0,8],[0,0]), W5=w([6.5,0],[6.5,8],.12);
  const ob = (ref, x, y, rot=0, scale=1) => ({id:uid(), level:"L0", kind:"lib", ref, name:LIBMAP[ref].nome, x, y, rot, scale, z:0});
  return {
    name:"Casa unifamiliare (esempio)", version:2, materials:{}, sky:{kind:"asset", id:"giorno"},
    sun:{az:245, el:36}, levels:[L0],
    walls:[W1,W2,W3,W4,W5],
    openings:[
      {id:uid(), wall:W3.id, t:7.2, w:1.0, h:2.2, sill:0, type:"door", flip:0},
      {id:uid(), wall:W3.id, t:3.2, w:2.4, h:2.2, sill:0, type:"window", flip:0},
      {id:uid(), wall:W3.id, t:9.4, w:1.2, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W1.id, t:2.0, w:1.4, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W1.id, t:8.8, w:1.4, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W2.id, t:4.0, w:1.2, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W4.id, t:4.0, w:1.6, h:1.4, sill:.9, type:"window", flip:0},
      {id:uid(), wall:W5.id, t:5.6, w:.8, h:2.1, sill:0, type:"door", flip:1},
    ],
    rooms:[
      {id:uid(), level:"L0", name:"Soggiorno", mat:"parquet", pts:[[.15,.15],[6.44,.15],[6.44,7.85],[.15,7.85]]},
      {id:uid(), level:"L0", name:"Camera", mat:"parquet", pts:[[6.56,.15],[10.85,.15],[10.85,7.85],[6.56,7.85]]},
    ],
    objects:[
      ob("divano3", 3.0, 2.0), ob("tappeto", 3.0, 3.2), ob("tavolino", 3.0, 3.3), ob("mobile_tv", 3.0, 4.9, 180), ob("tavolo6", 3.4, 6.5), ob("sedia", 2.6, 5.9, 180), ob("sedia", 4.2, 5.9, 180),
      ob("letto2", 8.7, 1.4), ob("comodino", 7.6, .5), ob("comodino", 9.8, .5), ob("armadio2", 9.9, 7.4, 180),
      ob("olivo", -3.6, 10.2), ob("cipresso", -2.2, 1.0), ob("cipresso", -2.2, 4.0), ob("palma", 14.2, -2.0), ob("arbusto", 1.2, 9.4), ob("arbusto", 9.6, 9.3), ob("siepe", 4.0, 13.8),
      ob("sagoma_uomo", 6.9, 9.8, -20), ob("sagoma_donna_c", 4.4, 10.6, 30),
    ],
  };
}
function migrate(p){
  p.materials = p.materials || {}; p.sky = p.sky || {kind:"asset", id:"giorno"}; p.sun = p.sun || {az:245, el:36};
  for (const L of p.levels){ L.roof = L.roof || {type:"none", pitch:30, overhang:.5, mat:"tegole"}; L.slab = L.slab ?? .25; }
  for (const o of p.objects || []) if (o.kind === "lib") o.ref = libRef(o.ref);
  p.version = 2; return p;
}
function readCanvasColors(){ readColors(); draw2D(); render3D(); }
function init(){
  let saved = null; try { saved = JSON.parse(localStorage.getItem("pianta-libera-v2")) || JSON.parse(localStorage.getItem("pianta-aperta-v2")) || JSON.parse(localStorage.getItem("pianta-aperta-v1")); } catch(e){}
  P = migrate(saved?.levels?.length ? saved : sampleProject()); S.level = P.levels[0].id; snap = JSON.stringify(P);
  $("#projName").value = P.name; readColors(); setTool("select");
  new ResizeObserver(() => { resize2D(); resize3D(); }).observe($("#views"));
  resize2D(); resize3D(); fitPlan(); rebuild3D(); applySky(); setTimeout(() => camPreset("ext"), 80); renderLevels();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readCanvasColors(); applySky(); });
  new MutationObserver(() => { readCanvasColors(); applySky(); }).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
  if (document.fonts?.ready) document.fonts.ready.then(draw2D);
  capReady.then(() => { if (S.tab === "export") renderExport(); });
  loadPersonalIndex();
}
init();
