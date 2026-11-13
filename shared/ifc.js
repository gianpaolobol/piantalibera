// Esportazione IFC4 (BIM): calcolo puro, senza Three.js né stato dell'editor (#64).
// Lo usa l'editor (incorporato senza «export» e senza «import» da scripts/build-editor.mjs) e lo provano
// i test unitari (tests/ifc.test.mjs, letto con web-ifc). Muri, vani, porte, finestre, solai e locali nascono
// dai dati del progetto; coperture, scale, ringhiere, luci e arredi arrivano già triangolati da `opt.tess`
// (nell'editor dal modello 3D), così questo modulo non dipende dalla grafica.
import { wallFrame, polyArea, inPoly, wallFaceLengths } from "./geometria.js";

export const IFC64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
export function ifcGuid(){ const b = crypto.getRandomValues(new Uint8Array(16)); let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x); let s = ""; for (let i = 21; i >= 0; i--) s += IFC64[Number((n >> BigInt(6 * i)) & 63n)]; return s; }
export function ifcStr(s){ let o = ""; for (const ch of String(s ?? "")){ const c = ch.codePointAt(0); if (ch === "'") o += "''"; else if (ch === "\\") o += "\\\\"; else if (c >= 32 && c < 127) o += ch; else o += `\\X2\\${c.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`; } return `'${o}'`; }

/* Superficie dei vani di un muro alto H (m²): ogni apertura limitata alla lunghezza e all'altezza del muro. */
export function wallOpeningArea(w, openings, H){
  const len = wallFrame(w).len, cl = (v, a, b) => Math.min(b, Math.max(a, v));
  return Math.min(len * H, openings.filter(o => o.wall === w.id).reduce((s, o) => s + cl(o.w, 0, len) * cl(Math.min(o.h, H - (o.type === "door" ? 0 : o.sill)), 0, H), 0));
}
/* Muro esterno: da almeno un lato non c'è un locale del suo piano (prova a 20 cm dalla faccia, a metà muro);
   senza locali disegnati si considera esterno. `rooms` = locali dello stesso piano. */
export function wallIsExternal(w, rooms){
  rooms = rooms.filter(r => r.pts.length > 2); if (!rooms.length) return true;
  const f = wallFrame(w), m = [(w.a[0]+w.b[0])/2, (w.a[1]+w.b[1])/2], d = w.thick/2 + .2;
  const side = s => rooms.some(r => inPoly([m[0] + f.nx*d*s, m[1] + f.ny*d*s], r.pts));
  return !(side(1) && side(-1));
}

/* Progetto (schema v3) → testo IFC4 e conteggi.
   opt.matName(key) → nome leggibile del materiale; opt.fileName; opt.now (ISO senza fuso); opt.guid;
   opt.tess({roof:levelId} | {obj:objectId}, elev) → {pts:[x,y,z,…] in coordinate IFC relative al piano, idx:[[i,j,k],…] da 1} o null;
   opt.objInfo(ob) → null (non esportare) | {kind:"stair", shape} | {kind:"rail"} | {kind:"light"} | {kind:"furniture"}. */
export function buildIFC(P, opt = {}){
  const matName = opt.matName || (k => k || "materiale"), guid = opt.guid || ifcGuid, tess = opt.tess || (() => null);
  const objInfo = opt.objInfo || (() => ({kind:"furniture"}));
  const L = [], add = s => { L.push(s); return "#" + L.length; }, R = v => { const x = Math.round(v * 1e6) / 1e6; return Number.isInteger(x) ? x + "." : String(x); };
  const pt3 = (x, y, z) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`), pt2 = (x, y) => add(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`), dir = (x, y, z) => add(`IFCDIRECTION((${R(x)},${R(y)},${R(z)}))`);
  const ax3 = (p, zd, xd) => add(`IFCAXIS2PLACEMENT3D(${p},${zd || "$"},${xd || "$"})`), lp = (rel, a) => add(`IFCLOCALPLACEMENT(${rel || "$"},${a})`);
  const Z = dir(0, 0, 1), O = pt3(0, 0, 0), A0 = ax3(O, Z, dir(1, 0, 0));
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${A0},$)`), body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT((${add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")},${add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")},${add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")},${add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")}))`);
  const proj = add(`IFCPROJECT('${guid()}',$,${ifcStr(P.name || "Progetto")},'Pianta Libera',$,$,$,(${ctx}),${units})`);
  const siteLP = lp(null, A0), site = add(`IFCSITE('${guid()}',$,'Sito',$,$,${siteLP},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bLP = lp(siteLP, A0), bld = add(`IFCBUILDING('${guid()}',$,${ifcStr(P.name || "Edificio")},$,$,${bLP},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${proj},(${site}))`); add(`IFCRELAGGREGATES('${guid()}',$,$,$,${site},(${bld}))`);
  const rep = items => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(",")}))`)}))`);
  const repT = items => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${items.join(",")}))`)}))`);
  const box = (cx, cy, xd, yd, z0, h) => add(`IFCEXTRUDEDAREASOLID(${add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`)},${R(xd)},${R(yd)})`)},${ax3(pt3(0, 0, z0))},${Z},${R(h)})`);
  const faceSet = t => { if (!t?.idx?.length) return null; const p = t.pts;
    const list = add(`IFCCARTESIANPOINTLIST3D((${Array.from({length:p.length / 3}, (_, i) => `(${R(p[i*3])},${R(p[i*3+1])},${R(p[i*3+2])})`).join(",")}))`);
    return add(`IFCTRIANGULATEDFACESET(${list},$,$,(${t.idx.map(q => `(${q.join(",")})`).join(",")}),$)`); };
  const W2I = p => [p[0], -p[1]];   // pianta (y verso sud) → IFC (Y verso nord)
  const storeys = [], counts = {walls:0, doors:0, windows:0, spaces:0, slabs:0, other:0};
  const bySt = [...P.levels].sort((a, b) => a.elev - b.elev);
  // materiali (uno per nome, associati agli elementi) e insiemi di proprietà e quantità standard (#57)
  const bim = { mats:new Map(), matRel:new Map(),
    mat(el, key){ const n = matName(key || "intonaco"); let m = this.mats.get(n); if (!m){ m = add(`IFCMATERIAL(${ifcStr(n)},$,$)`); this.mats.set(n, m); } (this.matRel.get(m) || this.matRel.set(m, []).get(m)).push(el); },
    pset(el, name, props){ const ps = props.map(([k, t, v]) => add(`IFCPROPERTYSINGLEVALUE('${k}',$,${t === "bool" ? `IFCBOOLEAN(${v ? ".T." : ".F."})` : `IFCLABEL(${ifcStr(String(v))})`},$)`));
      add(`IFCRELDEFINESBYPROPERTIES('${guid()}',$,$,$,(${el}),${add(`IFCPROPERTYSET('${guid()}',$,'${name}',$,(${ps.join(",")}))`)})`); },
    qto(el, name, qs){ const T = {len:"IFCQUANTITYLENGTH", area:"IFCQUANTITYAREA", vol:"IFCQUANTITYVOLUME"};
      add(`IFCRELDEFINESBYPROPERTIES('${guid()}',$,$,$,(${el}),${add(`IFCELEMENTQUANTITY('${guid()}',$,'${name}',$,$,(${qs.map(([k, t, v]) => add(`${T[t]}('${k}',$,$,${R(v)},$)`)).join(",")}))`)})`); } };
  for (const Lv of bySt){
    const sLP = lp(bLP, ax3(pt3(0, 0, Lv.elev))), st = add(`IFCBUILDINGSTOREY('${guid()}',$,${ifcStr(Lv.name)},$,$,${sLP},$,$,.ELEMENT.,${R(Lv.elev)})`); storeys.push(st);
    const elems = [], spaces = [], rooms = P.rooms.filter(r => r.level === Lv.id && r.pts.length > 2);
    for (const w of P.walls.filter(w => w.level === Lv.id)){
      const f = wallFrame(w); if (f.len < .01) continue; const a = W2I(w.a), h = w.height || Lv.height;
      const wLP = lp(sLP, ax3(pt3(a[0], a[1], 0), Z, dir(f.ux, -f.uy, 0)));
      // sagoma in pianta con gli angoli raccordati (nessuna sovrapposizione tra muri, #57); asse locale y = lato B
      const sh = wallFaceLengths(w, P.walls).shift, t2 = w.thick / 2;
      const quad = [[sh.A[0], -t2], [f.len - sh.A[1], -t2], [f.len - sh.B[1], t2], [sh.B[0], t2]];
      const wprof = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE((${[...quad, quad[0]].map(q => pt2(q[0], q[1])).join(",")}))`)})`);
      const wall = add(`IFCWALL('${guid()}',$,${ifcStr(`Muro ${Math.round(w.thick * 100)} cm`)},${ifcStr(matName(w.mat))},$,${wLP},${rep([add(`IFCEXTRUDEDAREASOLID(${wprof},${ax3(O)},${Z},${R(h)})`)])},$,.STANDARD.)`); elems.push(wall); counts.walls++;
      const ext = wallIsExternal(w, rooms), net = Math.max(0, f.len * h - wallOpeningArea(w, P.openings, h)); bim.mat(wall, w.mat);
      bim.pset(wall, "Pset_WallCommon", [["IsExternal", "bool", ext], ["LoadBearing", "bool", w.thick >= .25 || /portante|esterno/i.test(w.wtype || "")], ["Reference", "label", w.wtype || `Muro ${Math.round(w.thick * 100)} cm`]]);
      bim.qto(wall, "Qto_WallBaseQuantities", [["Length", "len", f.len], ["Width", "len", w.thick], ["Height", "len", h], ["NetSideArea", "area", net], ["NetVolume", "vol", net * w.thick]]);
      for (const o of P.openings.filter(o => o.wall === w.id)){
        const bot = o.type === "door" ? 0 : o.sill, oh = Math.min(o.h, h - bot), oLP = lp(wLP, ax3(pt3(o.t, 0, bot)));
        const op = add(`IFCOPENINGELEMENT('${guid()}',$,'Vano',$,$,${oLP},${rep([box(0, 0, o.w, w.thick + .1, 0, oh)])},$,.OPENING.)`);
        add(`IFCRELVOIDSELEMENT('${guid()}',$,$,$,${wall},${op})`);
        const fLP = lp(oLP, A0), geo = rep([box(0, 0, o.w, .06, 0, oh)]);
        const el = o.type === "door" ? add(`IFCDOOR('${guid()}',$,${ifcStr("Porta " + (o.style || "battente"))},$,$,${fLP},${geo},$,${R(oh)},${R(o.w)},.DOOR.,${o.style === "doppia" || o.style === "portafinestra" ? ".DOUBLE_DOOR_SINGLE_SWING." : o.style === "scorrevole" || o.style === "scomparsa" ? ".SLIDING_TO_LEFT." : ".SINGLE_SWING_LEFT."},$)`)
          : add(`IFCWINDOW('${guid()}',$,${ifcStr("Finestra " + (o.style || "battente"))},$,$,${fLP},${geo},$,${R(oh)},${R(o.w)},.WINDOW.,${o.w > 1.3 && (o.style || "battente") === "battente" ? ".DOUBLE_PANEL_VERTICAL." : ".SINGLE_PANEL."},$)`);
        add(`IFCRELFILLSELEMENT('${guid()}',$,$,$,${op},${el})`); elems.push(el); counts[o.type === "door" ? "doors" : "windows"]++;
        bim.pset(el, o.type === "door" ? "Pset_DoorCommon" : "Pset_WindowCommon", [["IsExternal", "bool", ext], ["Reference", "label", `${o.type === "door" ? "Porta" : "Finestra"} ${o.style || "battente"} ${Math.round(o.w * 100)}×${Math.round(oh * 100)}`]]);
        bim.mat(el, o.type === "door" ? "legno" : "serramento");
      }
    }
    for (const r of rooms){
      const poly = r.pts.map(W2I), prof = () => add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE((${[...poly, poly[0]].map(p => pt2(p[0], p[1])).join(",")}))`)})`);
      const st = r.slab?.t ?? Lv.slab, sk = r.slab?.k || (Lv.elev <= .01 ? "vespaio" : "laterocemento");
      const slab = add(`IFCSLAB('${guid()}',$,${ifcStr("Solaio " + (r.name || ""))},${ifcStr(matName(r.mat))},$,${lp(sLP, A0)},${rep([add(`IFCEXTRUDEDAREASOLID(${prof()},${ax3(pt3(0, 0, -st))},${Z},${R(st)})`)])},$,${sk === "vespaio" ? ".BASESLAB." : ".FLOOR."})`); bim.mat(slab, r.mat); elems.push(slab); counts.slabs++;
      bim.pset(slab, "Pset_SlabCommon", [["IsExternal", "bool", false], ["LoadBearing", "bool", sk !== "vespaio"], ["Reference", "label", `Solaio ${sk} ${Math.round(st * 100)} cm`]]);
      bim.qto(slab, "Qto_SlabBaseQuantities", [["Width", "len", st], ["NetArea", "area", Math.abs(polyArea(r.pts))], ["NetVolume", "vol", Math.abs(polyArea(r.pts)) * st]]);
      const sp = add(`IFCSPACE('${guid()}',$,${ifcStr(r.name || "Locale")},$,$,${lp(sLP, A0)},${rep([add(`IFCEXTRUDEDAREASOLID(${prof()},${ax3(O)},${Z},${R(r.ceilH || Lv.height)})`)])},${ifcStr(r.name || "Locale")},.ELEMENT.,.INTERNAL.,$)`); spaces.push(sp); counts.spaces++;
      const q = add(`IFCELEMENTQUANTITY('${guid()}',$,'Qto_SpaceBaseQuantities',$,$,(${add(`IFCQUANTITYAREA('NetFloorArea',$,$,${R(Math.abs(polyArea(r.pts)))},$)`)},${add(`IFCQUANTITYLENGTH('Height',$,$,${R(r.ceilH || Lv.height)},$)`)}))`);
      add(`IFCRELDEFINESBYPROPERTIES('${guid()}',$,$,$,(${sp}),${q})`);
    }
    // copertura, scale, ringhiere, arredi: superfici triangolate fornite da chi chiama
    if (Lv.roof?.type && Lv.roof.type !== "none"){ const t = faceSet(tess({roof:Lv.id}, Lv.elev));
      if (t){ elems.push(add(`IFCROOF('${guid()}',$,'Copertura',${ifcStr(matName(Lv.roof.mat))},$,${lp(bLP, ax3(pt3(0, 0, Lv.elev)))},${repT([t])},$,${({flat:".FLAT_ROOF.", gable:".GABLE_ROOF.", hip:".HIP_ROOF.", shed:".SHED_ROOF.", custom:".FREEFORM."})[Lv.roof.type] || ".NOTDEFINED."})`)); counts.other++; } }
    for (const ob of (P.objects || []).filter(o => o.level === Lv.id && !o.hidden)){
      const info = objInfo(ob); if (!info) continue;
      const t = faceSet(tess({obj:ob.id}, Lv.elev)); if (!t) continue;
      const head = `'${guid()}',$,${ifcStr(ob.name)},$,$,${lp(sLP, A0)},${repT([t])},$`;
      const kind = info.kind === "stair" ? `IFCSTAIR(${head},${({dritta:".STRAIGHT_RUN_STAIR.", L:".QUARTER_TURN_STAIR.", U:".HALF_TURN_STAIR.", chiocciola:".SPIRAL_STAIR."})[info.shape] || ".NOTDEFINED."})`
        : info.kind === "rail" ? `IFCRAILING(${head},.BALUSTRADE.)`
        : info.kind === "light" ? `IFCLIGHTFIXTURE(${head},.NOTDEFINED.)`
        : `IFCFURNITURE(${head},.NOTDEFINED.)`;
      elems.push(add(kind)); counts.other++; }
    if (elems.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',$,$,$,(${elems.join(",")}),${st})`);
    if (spaces.length) add(`IFCRELAGGREGATES('${guid()}',$,$,$,${st},(${spaces.join(",")}))`);
  }
  if (storeys.length) add(`IFCRELAGGREGATES('${guid()}',$,$,$,${bld},(${storeys.join(",")}))`);
  for (const [m, els] of bim.matRel) add(`IFCRELASSOCIATESMATERIAL('${guid()}',$,$,$,(${els.join(",")}),${m})`);
  const now = opt.now || new Date().toISOString().slice(0, 19), name = opt.fileName || "progetto.ifc";
  const text = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME(${ifcStr(name)},'${now}',('Pianta Libera'),('Pianta Libera'),'Pianta Libera','Pianta Libera','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${L.map((s, i) => `#${i + 1}=${s};`).join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
  return {text, counts};
}
