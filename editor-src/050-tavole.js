/* ============================================================
   Fase 4 — Tavole tecniche e computo
   Un registratore vettoriale con l'interfaccia di Canvas 2D raccoglie
   pianta (lo stesso disegno dell'editor), prospetti e sezioni (proiezione
   ortogonale con rimozione delle parti nascoste per ordinamento di
   profondità) e li scrive in PDF, SVG e DXF su fogli A4–A1 con cartiglio.
   ============================================================ */

/* ---------- registratore vettoriale (unità: millimetri del foglio) ---------- */
const colorProbe = document.createElement("canvas").getContext("2d");
function rgbOfCss(c, a = 1){
  if (typeof c !== "string") return [128, 128, 128];
  colorProbe.fillStyle = "#000"; colorProbe.fillStyle = c; const s = colorProbe.fillStyle; let r = 0, g = 0, b = 0, al = 1;
  if (s[0] === "#"){ r = parseInt(s.slice(1, 3), 16); g = parseInt(s.slice(3, 5), 16); b = parseInt(s.slice(5, 7), 16); }
  else { const m = s.match(/[\d.]+/g) || []; [r, g, b] = m.slice(0, 3).map(Number); if (m[3] != null) al = +m[3]; }
  const k = clamp(a * al, 0, 1); return [r, g, b].map(v => Math.round(v * k + 255 * (1 - k)));
}
class VRec {
  constructor(){ this.items = []; this.m = [1, 0, 0, 1, 0, 0]; this.stack = []; this.path = []; this.fillStyle = "#000"; this.strokeStyle = "#000"; this.lineWidth = 1; this.font = "10px sans-serif"; this.textAlign = "start"; this.textBaseline = "alphabetic"; this.globalAlpha = 1; this.dash = []; this.lineCap = "butt"; this.lineJoin = "miter"; }
  save(){ this.stack.push({m:this.m.slice(), fillStyle:this.fillStyle, strokeStyle:this.strokeStyle, lineWidth:this.lineWidth, font:this.font, textAlign:this.textAlign, textBaseline:this.textBaseline, globalAlpha:this.globalAlpha, dash:this.dash.slice()}); }
  restore(){ const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setTransform(a, b, c, d, e, f){ this.m = [a, b, c, d, e, f]; }
  transform(a, b, c, d, e, f){ const m = this.m; this.m = [m[0]*a + m[2]*b, m[1]*a + m[3]*b, m[0]*c + m[2]*d, m[1]*c + m[3]*d, m[0]*e + m[2]*f + m[4], m[1]*e + m[3]*f + m[5]]; }
  translate(x, y){ this.transform(1, 0, 0, 1, x, y); } scale(x, y){ this.transform(x, 0, 0, y, 0, 0); } rotate(a){ const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
  get k(){ return Math.sqrt(Math.abs(this.m[0]*this.m[3] - this.m[1]*this.m[2])); }
  P(x, y){ const m = this.m; return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }
  beginPath(){ this.path = []; }
  moveTo(x, y){ this.path.push({pts:[this.P(x, y)], closed:false}); }
  lineTo(x, y){ if (!this.path.length) return this.moveTo(x, y); this.path.at(-1).pts.push(this.P(x, y)); }
  closePath(){ const s = this.path.at(-1); if (s) s.closed = true; }
  bezierCurveTo(a, b, c, d, x, y){ this.lineTo(x, y); } quadraticCurveTo(a, b, x, y){ this.lineTo(x, y); }
  arc(x, y, r, a0, a1, ccw){ this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw){
    let d = a1 - a0; const T = Math.PI*2;
    if (!ccw){ if (d >= T) d = T; else while (d < 0) d += T; } else { if (d <= -T) d = -T; else while (d > 0) d -= T; }
    const n = Math.max(6, Math.ceil(Math.abs(d) / (Math.PI / 24))), cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++){ const t = a0 + d * i / n, lx = Math.cos(t)*rx, ly = Math.sin(t)*ry, px = x + lx*cr - ly*sr, py = y + lx*sr + ly*cr; i === 0 && !this.path.length ? this.moveTo(px, py) : this.lineTo(px, py); }
  }
  rect(x, y, w, h){ this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  copyPath(){ return this.path.map(s => ({pts:s.pts.map(p => p.slice()), closed:s.closed})); }
  fill(){ if (this.path.length) this.items.push({t:"p", sub:this.copyPath(), fill:rgbOfCss(this.fillStyle, this.globalAlpha)}); }
  stroke(){ if (this.path.length) this.items.push({t:"p", sub:this.copyPath(), stroke:rgbOfCss(this.strokeStyle, this.globalAlpha), lw:this.lineWidth * this.k, dash:this.dash.map(v => v * this.k)}); }
  fillRect(x, y, w, h){ const p = this.path; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.path = p; }
  strokeRect(x, y, w, h){ const p = this.path; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.path = p; }
  clearRect(){} drawImage(){} strokeText(){} clip(){}
  createLinearGradient(){ return {addColorStop(){}}; }
  setLineDash(a){ this.dash = (a || []).slice(); } getLineDash(){ return this.dash.slice(); }
  fontSize(){ const m = this.font.match(/([\d.]+)px/); return m ? +m[1] : 10; }
  measureText(t){ return {width:String(t).length * this.fontSize() * .55}; }
  fillText(t, x, y){ const p = this.P(x, y); this.items.push({t:"t", x:p[0], y:p[1], text:String(t), size:this.fontSize() * this.k, bold:/600|700|bold/.test(this.font), align:this.textAlign, base:this.textBaseline, rot:Math.atan2(this.m[1], this.m[0]), color:rgbOfCss(this.fillStyle, this.globalAlpha)}); }
  /* scorciatoie in mm del foglio */
  line(a, b, lw = .25, col = "#111", dash){ this.beginPath(); this.moveTo(a[0], a[1]); this.lineTo(b[0], b[1]); this.lineWidth = lw; this.strokeStyle = col; this.setLineDash(dash || []); this.stroke(); this.setLineDash([]); }
  poly(pts, {fill, stroke, lw = .25, close = true} = {}){ this.beginPath(); pts.forEach((p, i) => i ? this.lineTo(p[0], p[1]) : this.moveTo(p[0], p[1])); if (close) this.closePath(); if (fill){ this.fillStyle = fill; this.fill(); } if (stroke){ this.strokeStyle = stroke; this.lineWidth = lw; this.stroke(); } }
  text(t, x, y, size = 3, {align = "left", base = "alphabetic", bold = false, col = "#111", rot = 0} = {}){ this.save(); this.translate(x, y); if (rot) this.rotate(rot); this.font = `${bold ? "600 " : ""}${size}px Helvetica`; this.textAlign = align; this.textBaseline = base; this.fillStyle = col; this.fillText(t, 0, 0); this.restore(); }
}
/* origine del testo sulla linea di base e larghezza stimata (Helvetica ≈ 0,52 em per carattere) */
function textBox(it){ const w = it.text.length * it.size * .52, dx = it.align === "center" ? -w/2 : (it.align === "right" || it.align === "end") ? -w : 0;
  const dy = it.base === "middle" ? it.size * .35 : it.base === "top" || it.base === "hanging" ? it.size * .78 : it.base === "bottom" ? -it.size * .22 : 0;
  const c = Math.cos(it.rot), s = Math.sin(it.rot); return {x:it.x + dx*c - dy*s, y:it.y + dx*s + dy*c, w}; }

/* ---------- scrittori: SVG, PDF, DXF ---------- */
const hex3 = c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
const f2 = v => (Math.round(v * 100) / 100).toString();
function pageSVG(pg){
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${pg.w}mm" height="${pg.h}mm" viewBox="0 0 ${pg.w} ${pg.h}" font-family="Helvetica, Arial, sans-serif"><rect width="${pg.w}" height="${pg.h}" fill="#fff"/>`];
  for (const it of pg.items){
    if (it.t === "p"){ const d = it.sub.map(s => "M" + s.pts.map(p => f2(p[0]) + " " + f2(p[1])).join("L") + (s.closed ? "Z" : "")).join("");
      out.push(it.fill ? `<path d="${d}" fill="${hex3(it.fill)}" fill-rule="evenodd"/>` : `<path d="${d}" fill="none" stroke="${hex3(it.stroke)}" stroke-width="${f2(Math.max(.05, it.lw))}" stroke-linejoin="round"${it.dash?.length ? ` stroke-dasharray="${it.dash.map(f2).join(" ")}"` : ""}/>`); }
    else { const b = textBox(it); out.push(`<text x="${f2(b.x)}" y="${f2(b.y)}" font-size="${f2(it.size)}"${it.bold ? ' font-weight="600"' : ""} fill="${hex3(it.color)}"${it.rot ? ` transform="rotate(${f2(it.rot * 180 / Math.PI)} ${f2(b.x)} ${f2(b.y)})"` : ""}>${esc(it.text)}</text>`); }
  }
  out.push("</svg>"); return out.join("\n");
}
const WIN = {"€":128, "‚":130, "„":132, "…":133, "–":150, "—":151, "‘":145, "’":146, "“":147, "”":148, "•":149, "™":153, "▲":94, "▼":118, "∠":60, "▏":124};
function winAnsi(s){ let o = ""; for (const ch of s){ let c = ch.codePointAt(0); if (c > 255) c = WIN[ch] ?? 63; else if (c >= 128 && c < 160) c = 63; const x = String.fromCharCode(c); o += x === "(" || x === ")" || x === "\\" ? "\\" + x : c < 32 ? " " : x; } return o; }
const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
function pagesPDF(pages, title){
  const enc = new TextEncoder(), k = 72 / 25.4, objs = [];
  const add = s => { objs.push(s); return objs.length; };
  add(null); add(null); // 1 catalogo, 2 pagine
  const F1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), F2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const pg of pages){
    const H = pg.h, X = x => (x * k).toFixed(2), Y = y => ((H - y) * k).toFixed(2), c = [];
    for (const it of pg.items){
      if (it.t === "p"){ const path = it.sub.map(s => s.pts.map((p, i) => `${X(p[0])} ${Y(p[1])} ${i ? "l" : "m"}`).join(" ") + (s.closed ? " h" : "")).join(" ");
        if (it.fill) c.push(`${it.fill.map(v => (v / 255).toFixed(3)).join(" ")} rg ${path} f*`);
        else c.push(`${it.stroke.map(v => (v / 255).toFixed(3)).join(" ")} RG ${(Math.max(.05, it.lw) * k).toFixed(2)} w [${(it.dash || []).map(v => (v * k).toFixed(2)).join(" ")}] 0 d 1 j ${path} S`); }
      else { const b = textBox(it), cs = Math.cos(-it.rot), sn = Math.sin(-it.rot);
        c.push(`BT /${it.bold ? "F2" : "F1"} ${(it.size * k).toFixed(2)} Tf ${it.color.map(v => (v / 255).toFixed(3)).join(" ")} rg ${cs.toFixed(4)} ${sn.toFixed(4)} ${(-sn).toFixed(4)} ${cs.toFixed(4)} ${X(b.x)} ${Y(b.y)} Tm (${winAnsi(it.text)}) Tj ET`); }
    }
    const data = fflate.zlibSync(latin1(c.join("\n")), {level:6});
    const cid = add({stream:data}), pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(pg.w * k).toFixed(2)} ${(pg.h * k).toFixed(2)}] /Resources << /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >> >> /Contents ${cid} 0 R >>`); kids.push(pid);
  }
  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>"; objs[1] = `<< /Type /Pages /Kids [${kids.map(i => i + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${winAnsi(title)}) /Producer (Pianta Libera) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}) >>`);
  const chunks = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")], offs = []; let pos = chunks[0].length;
  objs.forEach((o, i) => { offs.push(pos); let b;
    if (o && o.stream){ const h = enc.encode(`${i + 1} 0 obj\n<< /Length ${o.stream.length} /Filter /FlateDecode >>\nstream\n`), t = enc.encode("\nendstream\nendobj\n"); b = new Uint8Array(h.length + o.stream.length + t.length); b.set(h); b.set(o.stream, h.length); b.set(t, h.length + o.stream.length); }
    else b = latin1(`${i + 1} 0 obj\n${o}\nendobj\n`);
    chunks.push(b); pos += b.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(enc.encode(xref));
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0)); let o = 0; for (const c of chunks){ out.set(c, o); o += c.length; } return out;
}
function pageDXF(pg){
  const out = ["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","9","$INSUNITS","70","4","0","ENDSEC","0","SECTION","2","ENTITIES"], Y = y => (pg.h - y).toFixed(3);
  for (const it of pg.items){
    if (it.t === "p"){ const lay = it.fill ? "CAMPITURE" : it.lw >= .4 ? "SPESSE" : "LINEE";
      if (it.fill && hex3(it.fill) === "#ffffff") continue;
      for (const s of it.sub){ if (s.pts.length < 2) continue; out.push("0","POLYLINE","8",lay,"66","1","70",s.closed ? "1" : "0"); for (const p of s.pts) out.push("0","VERTEX","8",lay,"10",p[0].toFixed(3),"20",Y(p[1]),"30","0"); out.push("0","SEQEND","8",lay); } }
    else { const b = textBox(it); out.push("0","TEXT","8","TESTI","10",b.x.toFixed(3),"20",Y(b.y),"30","0","40",(it.size * .72).toFixed(3),"1",it.text.replace(/[\r\n]/g, " "),"50",(-it.rot * 180 / Math.PI).toFixed(2)); }
  }
  out.push("0","ENDSEC","0","EOF"); return out.join("\n");
}

/* ---------- impostazioni delle tavole ---------- */
const PAPERS = {A4:[297, 210], A3:[420, 297], A2:[594, 420], A1:[841, 594]};
const PRINT_COLORS = {bg:"#ffffff", grid:"#ffffff", gridM:"#ffffff", poche:"#1c1c1c", room:"#ffffff", text:"#151515", ghost:"#dddddd", sel:"#151515", under:"#999999", muted:"#555555", green:"#557a44"};
function tavDefaults(){ const b = planBounds(); return {paper:"A3", scale:100, color:false, chains:true, furniture:true, comp:true, sec:{axis:"x", pos:+(b ? (b.x0 + b.x1) / 2 : 5).toFixed(2), dir:1}}; }
function tav(){ P.tav = {...tavDefaults(), ...(P.tav || {})}; return P.tav; }
function planBounds(lid){ const pts = []; for (const w of P.walls) if (!lid || w.level === lid) pts.push(w.a, w.b); for (const r of P.rooms) if (!lid || r.level === lid) pts.push(...r.pts); if (!pts.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return {x0:Math.min(...xs), x1:Math.max(...xs), y0:Math.min(...ys), y1:Math.max(...ys)}; }

/* ---------- catene di quote automatiche sui quattro lati ---------- */
function autoChains(g, lid){
  const ws = wallsOf(lid); if (!ws.length) return; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const w of ws) for (const p of [w.a, w.b]){ x0 = Math.min(x0, p[0] - w.thick/2); x1 = Math.max(x1, p[0] + w.thick/2); y0 = Math.min(y0, p[1] - w.thick/2); y1 = Math.max(y1, p[1] + w.thick/2); }
  const sides = [{k:"y", v:y1, a:0, out:1}, {k:"y", v:y0, a:0, out:-1}, {k:"x", v:x1, a:1, out:1}, {k:"x", v:x0, a:1, out:-1}];
  for (const sd of sides){
    const along = sd.a === 0 ? [x0, x1] : [y0, y1], ticks = new Set([along[0], along[1]].map(v => +v.toFixed(3)));
    for (const w of ws){ const onSide = [w.a, w.b].every(p => Math.abs((sd.k === "y" ? p[1] : p[0]) - sd.v) < w.thick/2 + .02); if (!onSide) continue;
      for (const o of P.openings.filter(o => o.wall === w.id)) for (const s of [o.t - o.w/2, o.t + o.w/2]){ const q = ptOnWall(w, s); ticks.add(+(sd.a === 0 ? q[0] : q[1]).toFixed(3)); } }
    for (const w of ws){ const touches = [w.a, w.b].some(p => Math.abs((sd.k === "y" ? p[1] : p[0]) - sd.v) < w.thick/2 + .02), perp = sd.a === 0 ? Math.abs(w.a[0] - w.b[0]) < .01 : Math.abs(w.a[1] - w.b[1]) < .01;
      if (touches && perp){ const c = sd.a === 0 ? w.a[0] : w.a[1]; if (c > along[0] + .05 && c < along[1] - .05){ ticks.add(+(c - w.thick/2).toFixed(3)); ticks.add(+(c + w.thick/2).toFixed(3)); } } }
    const t = [...ticks].sort((a, b) => a - b), P2 = v => sd.a === 0 ? [v, sd.v] : [sd.v, v];
    const off1 = .8 * sd.out, off2 = 1.4 * sd.out, sg = sd.a === 0 ? 1 : -1;   // dimLine: offset lungo la normale sinistra
    for (let i = 0; i < t.length - 1; i++) if (t[i+1] - t[i] > .02) dimLine(g, P2(t[i]), P2(t[i+1]), sg * off1, fmt(t[i+1] - t[i]), C.text);
    if (t.length > 2) dimLine(g, P2(t[0]), P2(t.at(-1)), sg * off2, fmt(t.at(-1) - t[0]), C.text);
  }
}

/* ---------- prospetti e sezioni: triangoli del modello in proiezione ortogonale ---------- */
function gatherTris(){
  const {root} = buildModel({ground:false, objects:true, roof:true}); root.updateMatrixWorld(true);
  const KEEP = ["wall", "frame", "glass", "door", "roof", "gable", "sill", "floor"], out = [], kf = v => Math.round(v * 1000);
  const ekey = (a, b) => { const A = `${kf(a.x)},${kf(a.y)},${kf(a.z)}`, B = `${kf(b.x)},${kf(b.y)},${kf(b.z)}`; return A < B ? A + "|" + B : B + "|" + A; };
  root.traverse(o => {
    if (!o.isMesh || o.userData.leaves || o.material?.alphaTest > 0) return;
    let cat = o.userData.cat;
    if (o.userData.inObject){ let x = o; while (x && !x.userData?.objId) x = x.parent; const ob = x && P.objects.find(q => q.id === x.userData.objId), it = ob?.kind === "lib" ? LIBMAP[libRef(ob.ref)] : null; if (!it?.param) return; cat = "obj"; }
    if (!KEEP.includes(cat) && cat !== "obj") return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, M = o.matrixWorld, V = i => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M);
    const eg = new THREE.EdgesGeometry(g, 20), ep = eg.attributes.position, edges = new Set();
    for (let i = 0; i < ep.count; i += 2) edges.add(ekey(new THREE.Vector3().fromBufferAttribute(ep, i).applyMatrix4(M), new THREE.Vector3().fromBufferAttribute(ep, i + 1).applyMatrix4(M)));
    eg.dispose();
    const mat = o.userData.mat || (Array.isArray(o.material) ? o.material[0] : o.material)?.userData?.key || "bianco";
    for (let i = 0; i + 2 < n; i += 3){ const a = V(i), b = V(i + 1), c = V(i + 2); out.push({v:[a, b, c], e:[edges.has(ekey(a, b)), edges.has(ekey(b, c)), edges.has(ekey(c, a))], cat, mat}); }
  });
  return out;
}
const UPV = new THREE.Vector3(0, 1, 0);
/* view: {d (direzione di vista), cut (offset lungo d del piano di sezione, opzionale)} → poligoni ordinati, tagli */
function projectTris(tris, d, cut){
  const right = new THREE.Vector3().crossVectors(d, UPV).normalize(), polys = [], cutSegs = [];
  for (const t of tris){
    const n = new THREE.Vector3().subVectors(t.v[1], t.v[0]).cross(new THREE.Vector3().subVectors(t.v[2], t.v[0])); if (n.lengthSq() < 1e-12) continue;
    let pts = t.v.map((p, i) => ({p, e:t.e[i]}));
    if (cut != null){
      const s = pts.map(q => q.p.dot(d) - cut);
      if (s.every(v => v < 0)) continue;
      if (s.some(v => v < 0)){ // clip: tiene la parte oltre il piano; registra il segmento di taglio
        const res = [], hits = [];
        for (let i = 0; i < 3; i++){ const A = pts[i], B = pts[(i + 1) % 3], sa = s[i], sb = s[(i + 1) % 3];
          if (sa >= 0) res.push(A);
          if ((sa >= 0) !== (sb >= 0)){ const X = A.p.clone().lerp(B.p, sa / (sa - sb)); hits.push(X); res.push({p:X, e:sa >= 0 ? false : A.e, cutEdge:sa >= 0}); }
        }
        for (let i = 0; i < res.length; i++) if (res[i].cutEdge === undefined && i + 1 < res.length && res[i+1].cutEdge === true) {} // la marcatura è sul punto d'uscita
        pts = res.map((q, i) => ({p:q.p, e:q.cutEdge === true ? false : q.e}));
        // i lati che giacciono sul piano non si disegnano come spigoli
        for (let i = 0; i < pts.length; i++){ const A = pts[i], B = pts[(i + 1) % pts.length]; if (Math.abs(A.p.dot(d) - cut) < 1e-5 && Math.abs(B.p.dot(d) - cut) < 1e-5) A.e = false; }
        if (hits.length === 2 && !["glass"].includes(t.cat)) cutSegs.push({a:hits[0], b:hits[1], cat:t.cat});
      }
    }
    if (n.dot(d) >= 0 && t.cat !== "glass") continue; // facce rivolte dall'altra parte
    const depth = pts.reduce((s, q) => s + q.p.dot(d), 0) / pts.length;
    polys.push({pts:pts.map(q => [q.p.dot(right), q.p.y]), e:pts.map(q => q.e), depth, cat:t.cat, mat:t.mat});
  }
  polys.sort((a, b) => b.depth - a.depth);
  return {polys, cutSegs:cutSegs.map(c => ({a:[c.a.dot(right), c.a.y], b:[c.b.dot(right), c.b.y], cat:c.cat})), right};
}
/* concatena i segmenti di taglio in anelli chiusi da campire */
function chainLoops(segs){
  const kf = p => `${Math.round(p[0] * 2000)},${Math.round(p[1] * 2000)}`, adj = new Map(), used = new Set(), loops = [];
  segs.forEach((s, i) => { for (const [p, q] of [[s.a, s.b], [s.b, s.a]]){ const k = kf(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push({i, q}); } });
  segs.forEach((s, i) => { if (used.has(i)) return; used.add(i); const loop = [s.a, s.b]; let cur = s.b, guard = 0;
    while (guard++ < 5000){ const nx = (adj.get(kf(cur)) || []).find(x => !used.has(x.i)); if (!nx) break; used.add(nx.i); cur = nx.q; if (kf(cur) === kf(loop[0])) { loops.push(loop); return; } loop.push(cur); }
  });
  return loops;
}
const FILL_BW = {wall:"#ffffff", gable:"#ffffff", roof:"#f1ece7", glass:"#e3eef2", frame:"#ffffff", door:"#ffffff", sill:"#ffffff", floor:"#ffffff", obj:"#ffffff"};
function fillOf(p, colored){ if (!colored) return FILL_BW[p.cat] || "#fff"; const c = rgbOfCss(matDef(p.mat).color || "#ddd"); return hex3(c.map(v => Math.round(v * .55 + 255 * .45))); }
/* disegna una vista ortogonale nel riquadro: origine (ox, oy) = angolo in basso a sinistra del disegno, k = mm per metro */
function drawOrtho(g, view, ox, oy, k, colored, extents){
  const X = u => ox + (u - extents.u0) * k, Y = y => oy - (y - extents.y0) * k;
  for (const p of view.polys){ const pts = p.pts.map(q => [X(q[0]), Y(q[1])]); g.poly(pts, {fill:fillOf(p, colored)});
    for (let i = 0; i < pts.length; i++) if (p.e[i]) g.line(pts[i], pts[(i + 1) % pts.length], p.cat === "glass" ? .13 : .25, "#222"); }
  if (view.cutSegs.length){ for (const loop of chainLoops(view.cutSegs)) g.poly(loop.map(q => [X(q[0]), Y(q[1])]), {fill:"#3a3a3a"}); for (const s of view.cutSegs) g.line([X(s.a[0]), Y(s.a[1])], [X(s.b[0]), Y(s.b[1])], .5, "#111"); }
  if (!view.cutSegs.length && extents.y0 < 0) g.poly([[X(extents.u0) - 6, Y(0)], [X(extents.u1) + 6, Y(0)], [X(extents.u1) + 6, Y(extents.y0) + .3], [X(extents.u0) - 6, Y(extents.y0) + .3]], {fill:"#ffffff"});   // niente fondazioni nei prospetti
  g.line([X(extents.u0) - 6, Y(0)], [X(extents.u1) + 6, Y(0)], .6, "#111");
  for (const L of [...P.levels].sort((a, b) => a.elev - b.elev)) for (const yv of [L.elev, L.elev + L.height]){ const y = Y(yv), x = X(extents.u0) - 8; g.line([x, y], [x + 5, y], .18, "#444"); g.poly([[x + 1, y], [x + 2.2, y - 1.6], [x - .2, y - 1.6]], {fill:"#444"}); g.text((yv >= 0 ? "+" : "") + fmt(yv), x - 1, y - .6, 2.2, {align:"right", col:"#333"}); }
}
function orthoExtents(view){ let u0 = Infinity, u1 = -Infinity, y0 = 0, y1 = -Infinity; for (const p of view.polys) for (const q of p.pts){ u0 = Math.min(u0, q[0]); u1 = Math.max(u1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } return isFinite(u0) ? {u0, u1, y0, y1} : null; }
/* nome del prospetto dal punto cardinale vero (tiene conto del nord della pianta) */
function facadeName(d){ const az = (Math.atan2(-d.x, d.z) * 180 / Math.PI - (P.site?.north || 0) + 720) % 360; return ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"][Math.round(az / 45) % 8]; }

/* ---------- composizione dei fogli ---------- */
function titleBlock(g, pg, title, scaleTxt, n, N){
  const [W, H] = [pg.w, pg.h], bw = Math.min(180, W - 20), bx = W - 10 - bw, by = H - 10 - 26;
  g.poly([[10, 10], [W - 10, 10], [W - 10, H - 10], [10, H - 10]], {stroke:"#111", lw:.5});
  g.poly([[bx, by], [bx + bw, by], [bx + bw, H - 10], [bx, H - 10]], {fill:"#fff", stroke:"#111", lw:.35});
  g.line([bx, by + 13], [bx + bw, by + 13], .2); g.line([bx + bw * .62, by], [bx + bw * .62, H - 10], .2); g.line([bx + bw * .62, by + 6.5], [bx + bw, by + 6.5], .15); g.line([bx + bw * .81, by + 13], [bx + bw * .81, H - 10], .15);
  g.text(P.name || "Progetto", bx + 3, by + 6, 4, {bold:true}); g.text(title, bx + 3, by + 11, 3); g.text("Pianta Libera · elaborato generato dal modello: verificare le misure, non è un documento tecnico certificato", bx + 3, by + 19.5, 1.9, {col:"#555"});
  g.text("Scala", bx + bw * .62 + 2, by + 4, 1.8, {col:"#666"}); g.text(scaleTxt, bx + bw * .62 + 2, by + 6.2 + 4.6, 3.2, {bold:true});
  g.text("Data", bx + bw * .62 + 2, by + 17, 1.8, {col:"#666"}); g.text(new Date().toLocaleDateString("it-IT"), bx + bw * .62 + 2, by + 22.5, 2.8);
  g.text("Foglio", bx + bw * .81 + 2, by + 17, 1.8, {col:"#666"}); g.text(`${n}/${N}`, bx + bw * .81 + 2, by + 22.5, 2.8, {bold:true});
  return {x:16, y:16, w:W - 32, h:by - 20};  // area utile per il disegno
}
function scaleBar(g, x, y, k){ const m = k >= 15 ? 5 : 10; for (let i = 0; i < m; i++) g.poly([[x + i*k, y], [x + (i+1)*k, y], [x + (i+1)*k, y + 1.2], [x + i*k, y + 1.2]], {fill:i % 2 ? "#fff" : "#111", stroke:"#111", lw:.15}); g.text("0", x, y - 1, 2, {align:"center"}); g.text(`${m} m`, x + m*k, y - 1, 2, {align:"center"}); }
function northArrow(g, x, y){ g.save(); g.translate(x, y); g.rotate((P.site?.north || 0) * Math.PI / 180); g.beginPath(); g.arc(0, 0, 5, 0, Math.PI*2); g.strokeStyle = "#111"; g.lineWidth = .25; g.stroke(); g.poly([[0, -4.5], [2, 3], [0, 1.5], [-2, 3]], {fill:"#111"}); g.text("N", 0, -6.5, 2.6, {align:"center", bold:true}); g.restore(); }
function fitScale(wm, hm, area, want){ const s = [20, 50, 100, 200, 500, 1000].filter(x => x >= want); for (const sc of s){ const k = 1000 / sc; if (wm * k <= area.w && hm * k <= area.h) return sc; } return s.at(-1) || want; }

function buildSheets(){
  const T = tav(), [W, H] = PAPERS[T.paper] || PAPERS.A3, pages = [], prevLevel = S.level, prevSel = selList(), prevC = C, prevV = {...V}, pW = W2, pH = H2, prevHover = S.hover, prevDraw = S.draw;
  const notes = [];
  const newPage = () => { const g = new VRec(), pg = {w:W, h:H, g}; pages.push(pg); return pg; };
  try {
    setSel([]); S.hover = null; S.draw = null; C = {...PRINT_COLORS};
    const tris = gatherTris(), lvls = [...P.levels].sort((a, b) => a.elev - b.elev);
    // piante
    for (const L of lvls){
      const b = planBounds(L.id); if (!b) continue;
      const pg = newPage(); pg.title = `Pianta ${L.name} (quota ${fmt(L.elev)} m)`; pg.draw = area => {
        const g = pg.g, wm = b.x1 - b.x0 + 4, hm = b.y1 - b.y0 + 4, sc = fitScale(wm, hm, area, T.scale), k = 1000 / sc; if (sc !== T.scale) notes.push(`${pg.title}: scala 1:${sc} per stare nel foglio`); pg.scaleTxt = `1:${sc}`;
        S.level = L.id; V.s = k * 4; V.cx = (b.x0 + b.x1) / 2; V.cy = (b.y0 + b.y1) / 2; W2 = area.w * 4; H2 = area.h * 4;
        const hidden = []; if (!T.furniture) for (const o of P.objects) if (o.level === L.id && !LIBMAP[libRef(o.ref)]?.param && !o.hidden){ o.hidden = true; hidden.push(o); }
        g.save(); g.translate(area.x, area.y); g.scale(.25, .25);
        draw2D({g, after:gg => { if (T.chains) autoChains(gg, L.id); secMark(gg); }});
        g.restore(); hidden.forEach(o => delete o.hidden);
        northArrow(g, area.x + area.w - 8, area.y + 8); scaleBar(g, area.x + 4, area.y + area.h - 4, k);
      };
    }
    // prospetti
    const views = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)].map(d => { const v = projectTris(tris, d); return {d, v, ex:orthoExtents(v), name:"Prospetto " + facadeName(d)}; }).filter(x => x.ex);
    // si tiene la scala scelta: 4, 2 o 1 prospetto per foglio; solo se non entra nemmeno da solo si riduce la scala
    if (views.length){
      const A = titleBlock(new VRec(), {w:W, h:H}, "", "", 1, 1), wm = Math.max(...views.map(x => x.ex.u1 - x.ex.u0)) + 3, hm = Math.max(...views.map(x => x.ex.y1 - x.ex.y0)) + 4.5;
      const fits = ([c, r]) => wm * 1000 / T.scale <= A.w / c - 14 && hm * 1000 / T.scale <= A.h / r - 10;
      const [cols, rows] = [[2, 2], [2, 1], [1, 2], [1, 1]].find(fits) || [2, 2], per = cols * rows;
      for (let p0 = 0; p0 < views.length; p0 += per){ const part = views.slice(p0, p0 + per), pgE = newPage(); pgE.title = views.length > per ? `Prospetti (${p0 / per + 1}/${Math.ceil(views.length / per)})` : "Prospetti"; pgE.draw = area => {
        const cw = area.w / cols, ch = area.h / rows, sc = fitScale(wm, hm, {w:cw - 14, h:ch - 10}, T.scale), k = 1000 / sc; if (sc !== T.scale && p0 === 0) notes.push(`Prospetti: scala 1:${sc} per stare nel foglio`); pgE.scaleTxt = `1:${sc}`;
        part.forEach((x, i) => { const cx = area.x + (i % cols) * cw, cy = area.y + Math.floor(i / cols) * ch, dw = (x.ex.u1 - x.ex.u0) * k, dh = (x.ex.y1 - x.ex.y0) * k;
          const ox = cx + (cw - dw) / 2 + 4, oy = cy + (ch + dh) / 2 - 2; drawOrtho(pgE.g, x.v, ox, oy, k, T.color, x.ex); pgE.g.text(x.name[0].toUpperCase() + x.name.slice(1), cx + cw / 2, oy + 6, 3, {align:"center", bold:true}); });
      }; }
    }
    // sezione A-A
    const s = T.sec, d = s.axis === "x" ? new THREE.Vector3(s.dir, 0, 0) : new THREE.Vector3(0, 0, s.dir), cut = s.pos * s.dir;
    const sv = projectTris(tris, d, cut), sex = orthoExtents(sv);
    if (sex){ const pgS = newPage(); pgS.title = "Sezione A-A"; pgS.draw = area => {
      const wm = sex.u1 - sex.u0 + 4, hm = sex.y1 - sex.y0 + 3, sc = fitScale(wm, hm, area, T.scale), k = 1000 / sc; if (sc !== T.scale) notes.push(`Sezione: scala 1:${sc} per stare nel foglio`); pgS.scaleTxt = `1:${sc}`;
      const ox = area.x + (area.w - (sex.u1 - sex.u0) * k) / 2 + 4, oy = area.y + (area.h + (sex.y1 - sex.y0) * k) / 2; drawOrtho(pgS.g, sv, ox, oy, k, T.color, sex);
      pgS.g.text("Sezione A-A", ox + (sex.u1 - sex.u0) * k / 2, oy + 7, 3.4, {align:"center", bold:true});
    }; }
    // computo
    if (T.comp){ const rows = computo(); if (rows.length){ const per = Math.floor((H - 70) / 5.2);
      for (let i = 0; i < rows.length; i += per){ const pg = newPage(), part = rows.slice(i, i + per), last = i + per >= rows.length; pg.title = "Computo delle quantità"; pg.scaleTxt = "—"; pg.draw = area => drawComputo(pg.g, area, part, last ? rows : null); } } }
    // l'area utile si calcola prima; il cartiglio si scrive dopo il disegno, quando la scala è nota
    pages.forEach((pg, i) => pg.draw(titleBlock(new VRec(), pg, pg.title, "", i + 1, pages.length)));
    pages.forEach((pg, i) => { const g2 = new VRec(); titleBlock(g2, pg, pg.title, pg.scaleTxt || "", i + 1, pages.length); pg.items = [...pg.g.items, ...g2.items]; });
  } finally {
    S.level = prevLevel; setSel(prevSel); C = prevC; Object.assign(V, prevV); W2 = pW; H2 = pH; S.hover = prevHover; S.draw = prevDraw; draw2D();
  }
  return {pages, notes};
}
/* linea di sezione in pianta con le frecce del verso di vista */
function secMark(g){
  const s = tav().sec, b = planBounds(S.level); if (!b) return; const pad = 2.4;
  const a = s.axis === "x" ? [s.pos, b.y0 - pad] : [b.x0 - pad, s.pos], e = s.axis === "x" ? [s.pos, b.y1 + pad] : [b.x1 + pad, s.pos];
  const A = toS(a), E = toS(e); g.save(); g.strokeStyle = "#111"; g.lineWidth = 1.2; g.setLineDash([14, 4, 3, 4]); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(E[0], E[1]); g.stroke(); g.setLineDash([]);
  const dv = s.axis === "x" ? [s.dir, 0] : [0, s.dir];
  for (const P0 of [A, E]){ g.lineWidth = 2; g.beginPath(); g.moveTo(P0[0], P0[1]); g.lineTo(P0[0] + dv[0]*22, P0[1] + dv[1]*22); g.stroke(); g.beginPath(); g.moveTo(P0[0] + dv[0]*28, P0[1] + dv[1]*28); g.lineTo(P0[0] + dv[0]*20 + dv[1]*4, P0[1] + dv[1]*20 + dv[0]*4); g.lineTo(P0[0] + dv[0]*20 - dv[1]*4, P0[1] + dv[1]*20 - dv[0]*4); g.closePath(); g.fillStyle = "#111"; g.fill();
    g.font = "600 13px Helvetica"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("A", P0[0] - dv[1]*0 - (s.axis === "x" ? 0 : 0) + (s.axis === "x" ? -12 : 0), P0[1] + (s.axis === "x" ? 0 : -12)); }
  g.restore();
}

/* ---------- computo delle quantità ---------- */
// superficie delle aperture di un muro, limitata al muro (larghezza fino alla lunghezza, altezza fino al muro)
function openingArea(w){ const len = wallFrame(w).len, H = w.height || level(w.level).height;
  return Math.min(len * H, P.openings.filter(o => o.wall === w.id).reduce((s, o) => s + clamp(o.w, 0, len) * clamp(Math.min(o.h, H - (o.type === "door" ? 0 : o.sill)), 0, H), 0)); }
const STYLE_NAME = Object.fromEntries([...DOOR_STYLES, ...WIN_STYLES.map(([k, n]) => ["w_" + k, n])]);
function computo(){
  const R = new Map(), add = (key, cat, voce, um, q) => { if (!(q > 1e-6)) return; const r = R.get(key) || {key, cat, voce, um, q:0}; r.q += q; R.set(key, r); };
  for (const w of P.walls){ const L = level(w.level); if (!L) continue; const len = wallFrame(w).len, h = w.height || L.height, net = len * h - openingArea(w);
    add(`muro:${w.thick}:${w.mat}`, "Murature", `Muro sp. ${Math.round(w.thick * 100)} cm (${matName(w.mat).toLowerCase()})`, "m²", net);
    add(`muro_v:${w.thick}`, "Murature", `Volume muri sp. ${Math.round(w.thick * 100)} cm`, "m³", net * w.thick);
    const fl = wallFaceLengths(w, P.walls), op = openingArea(w);
    for (const [k, side] of [["matA", "A"], ["matB", "B"]]) add(`fin:${w[k] || w.mat}`, "Finiture pareti", `Finitura ${matName(w[k] || w.mat).toLowerCase()}`, "m²", Math.max(0, fl[side] * h - op)); }
  for (const r of P.rooms){ const L = level(r.level); if (!L) continue; const a = Math.abs(polyArea(r.pts));
    add(`pav:${r.mat}`, "Pavimenti", `Pavimento ${matName(r.mat).toLowerCase()}`, "m²", a);
    if (r.skirt){ let per = 0; for (let i = 0; i < r.pts.length; i++){ const p = r.pts[i], q = r.pts[(i + 1) % r.pts.length]; per += Math.hypot(q[0]-p[0], q[1]-p[1]); }
      const doors = skirtGeos(r, L).reduce((s, g) => { g.computeBoundingBox(); const bb = g.boundingBox; return s + Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z); }, 0);
      add(`bat:${r.skirt.mat || "bianco"}`, "Finiture", `Battiscopa ${matName(r.skirt.mat || "bianco").toLowerCase()} h ${Math.round((r.skirt.h || .08) * 100)} cm`, "m", doors || per); }
    if (r.ceilH) add("controsoffitto", "Finiture", "Controsoffitto in cartongesso", "m²", a); else if (!r.noCeiling) add("soffitto", "Finiture", "Tinteggiatura soffitti", "m²", a); }
  for (const o of P.openings){ const w = wallById(o.wall); if (!w) continue; const st = o.type === "door" ? (STYLE_NAME[o.style || "battente"] || "A battente") : (STYLE_NAME["w_" + (o.style || "battente")] || "A battente");
    add(`ap:${o.type}:${o.style || ""}:${Math.round(o.w * 100)}:${Math.round(o.h * 100)}`, o.type === "door" ? "Porte" : "Finestre", `${o.type === "door" ? "Porta" : "Finestra"} ${st.toLowerCase()} ${Math.round(o.w * 100)}×${Math.round(o.h * 100)}`, "n.", 1);
    if (o.shut) add(`osc:${o.shut}`, "Finestre", o.shut === "persiane" ? "Persiane (coppie)" : "Tapparelle", "n.", 1); }
  for (const L of P.levels){ if (!L.roof || L.roof.type === "none") continue; const b = planBounds(L.id); if (!b) continue; const o = L.roof.overhang || 0, A = (b.x1 - b.x0 + 2*o) * (b.y1 - b.y0 + 2*o), p = THREE.MathUtils.degToRad(clamp(L.roof.pitch || 0, 0, 60));
    add(`tetto:${L.roof.mat}`, "Copertura", `Copertura ${({flat:"piana", gable:"a due falde", hip:"a padiglione", shed:"a una falda"})[L.roof.type]} in ${matName(L.roof.mat).toLowerCase()}`, "m²", L.roof.type === "flat" ? A : A / Math.cos(p)); }
  for (const o of P.objects){ const it = o.kind === "lib" ? LIBMAP[libRef(o.ref)] : null; if (it?.cat === "Persone") continue;
    if (it?.param?.kind === "rail") add("ringhiera", "Scale e parapetti", "Ringhiera / parapetto", "m", paramsOf(o, it).len * (o.scale || 1));
    else if (it?.param) add(`scala:${o.ref}`, "Scale e parapetti", it.nome, "n.", 1);
    else add(`ogg:${o.kind === "lib" ? o.ref : "imp:" + o.name}`, it?.cat === "Luci" ? "Impianto elettrico" : it?.cat === "Verde" ? "Sistemazioni esterne" : "Arredi", it?.nome || o.name || "Oggetto", "n.", 1); }
  const order = ["Murature", "Finiture pareti", "Pavimenti", "Finiture", "Porte", "Finestre", "Copertura", "Scale e parapetti", "Impianto elettrico", "Arredi", "Sistemazioni esterne"];
  return [...R.values()].sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.voce.localeCompare(b.voce, "it"));
}
const prices = () => (P.prices = P.prices || {});
const eur = v => v.toLocaleString("it-IT", {minimumFractionDigits:2, maximumFractionDigits:2});
function computoHTML(){
  const rows = computo(), pr = prices(); let tot = 0, cat = "";
  const body = rows.map(r => { const p = pr[r.key], imp = p != null ? p * r.q : null; if (imp != null) tot += imp; const head = r.cat !== cat ? `<tr class="cat"><td colspan="5">${esc(cat = r.cat)}</td></tr>` : "";
    return head + `<tr><td>${esc(r.voce)}</td><td>${esc(r.um)}</td><td class="num">${fmt(r.q, r.um === "n." ? 0 : 2)}</td><td><input class="inp price" data-price="${esc(r.key)}" value="${p != null ? fmt(p, 2) : ""}" inputmode="decimal" aria-label="Prezzo unitario ${esc(r.voce)}" placeholder="€"></td><td class="num">${imp != null ? eur(imp) : ""}</td></tr>`; }).join("");
  return `<div class="sec"><h3>Computo delle quantità</h3><p class="note">Quantità ricavate dal modello: muri in asse al netto delle aperture, pavimenti netti, coperture in falda. Scrivi i prezzi unitari (€) del tuo listino per avere gli importi: restano nel progetto.</p>
    <div class="tblwrap"><table class="olist comp"><thead><tr><th>Voce</th><th>u.m.</th><th>Quantità</th><th>€/u.m.</th><th>Importo €</th></tr></thead><tbody>${body}
    <tr class="tot"><td>Totale</td><td></td><td></td><td></td><td class="num">${eur(tot)}</td></tr></tbody></table></div>
    <div class="btns"><button class="btn" id="compCsv">Esporta computo in CSV</button></div></div>`;
}
function drawComputo(g, area, rows, all){
  const pr = prices(), cx = [area.x, area.x + area.w * .55, area.x + area.w * .63, area.x + area.w * .76, area.x + area.w * .88], right = area.x + area.w; let y = area.y + 6, cat = "";
  g.text("Computo delle quantità", area.x, y, 4, {bold:true}); y += 8;
  ["Voce", "u.m.", "Quantità", "€/u.m.", "Importo €"].forEach((h, i) => g.text(h, i < 2 ? cx[i] : (i < 4 ? cx[i + 1] - 2 : right), y, 2.4, {bold:true, align:i < 2 ? "left" : "right"})); y += 1.5; g.line([area.x, y], [right, y], .3); y += 4.2;
  for (const r of rows){ if (r.cat !== cat){ cat = r.cat; g.text(cat, area.x, y, 2.5, {bold:true, col:"#333"}); y += 5.2; }
    const p = pr[r.key]; g.text(r.voce, cx[0] + 2, y, 2.4); g.text(r.um, cx[1], y, 2.4); g.text(fmt(r.q, r.um === "n." ? 0 : 2), cx[3] - 2, y, 2.4, {align:"right"}); if (p != null){ g.text(eur(p), cx[4] - 2, y, 2.4, {align:"right"}); g.text(eur(p * r.q), right, y, 2.4, {align:"right"}); } y += 5.2; }
  if (all){ const tot = all.reduce((s, r) => s + (pr[r.key] != null ? pr[r.key] * r.q : 0), 0); g.line([area.x, y - 3.6], [right, y - 3.6], .3); g.text("Totale", area.x, y + 1, 2.8, {bold:true}); g.text("€ " + eur(tot), right, y + 1, 2.8, {bold:true, align:"right"}); }
}

/* ---------- interfaccia (scheda Esporta) ---------- */
function tavoleHTML(){
  const T = tav();
  return `<div class="exp"><header><h4>Tavole tecniche</h4><span class="tag">PDF · SVG · DXF</span></header>
    <p class="note">Piante con catene di quote, prospetti dei quattro lati, sezione A-A e computo, su fogli con cartiglio. Il DXF si apre in AutoCAD, Archicad e Revit (il formato DWG è chiuso: da AutoCAD si salva in DWG).</p>
    <div class="row3"><div class="f"><span class="lbl">Foglio</span><select id="tvPaper" class="inp">${Object.keys(PAPERS).map(p => `<option ${T.paper === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div class="f"><span class="lbl">Scala</span><select id="tvScale" class="inp">${[50, 100, 200].map(s => `<option value="${s}" ${T.scale === s ? "selected" : ""}>1:${s}</option>`).join("")}</select></div>
      <div class="f"><span class="lbl">Sezione A-A</span><select id="tvAxis" class="inp"><option value="x" ${T.sec.axis === "x" ? "selected" : ""}>Verticale in pianta</option><option value="z" ${T.sec.axis === "z" ? "selected" : ""}>Orizzontale in pianta</option></select></div></div>
    <div class="row">${F("tvPos", T.sec.axis === "x" ? "Sezione a x = (m)" : "Sezione a y = (m)", fmt(T.sec.pos), 'inputmode="decimal"')}<div class="f"><span class="lbl">Guarda verso</span><select id="tvDir" class="inp"><option value="1" ${T.sec.dir > 0 ? "selected" : ""}>${T.sec.axis === "x" ? "Est" : "Sud"}</option><option value="-1" ${T.sec.dir < 0 ? "selected" : ""}>${T.sec.axis === "x" ? "Ovest" : "Nord"}</option></select></div></div>
    <label class="chk"><input type="checkbox" id="tvChains" ${T.chains ? "checked" : ""}> Catene di quote esterne automatiche</label>
    <label class="chk"><input type="checkbox" id="tvFurn" ${T.furniture ? "checked" : ""}> Arredi in pianta</label>
    <label class="chk"><input type="checkbox" id="tvColor" ${T.color ? "checked" : ""}> Prospetti e sezioni a colori</label>
    <label class="chk"><input type="checkbox" id="tvComp" ${T.comp ? "checked" : ""}> Aggiungi il computo delle quantità</label>
    <div class="btns"><button class="btn primary" id="tvPdf">Tavole in PDF</button><button class="btn" id="tvSvg">SVG (.zip)</button><button class="btn" id="tvDxf">DXF (.zip)</button></div>
    <p class="status" id="tvStatus"></p></div>`;
}
$("#panel-export").addEventListener("change", e => { const t = e.target, T = tav(), v = num(t.value);
  const set = {tvPaper:() => T.paper = t.value, tvScale:() => T.scale = +t.value, tvAxis:() => { T.sec.axis = t.value; const b = planBounds(); if (b) T.sec.pos = +(t.value === "x" ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2).toFixed(2); renderExport(); }, tvPos:() => { if (v !== null) T.sec.pos = v; }, tvDir:() => T.sec.dir = +t.value,
    tvChains:() => T.chains = t.checked, tvFurn:() => T.furniture = t.checked, tvColor:() => T.color = t.checked, tvComp:() => T.comp = t.checked}[t.id];
  if (set){ set(); save(); draw2D(); }
});
$("#panel-export").addEventListener("click", async e => {
  const b = e.target.closest("#tvPdf, #tvSvg, #tvDxf"); if (!b) return; b.disabled = true; const st = $("#tvStatus");
  try { busy("Preparo le tavole…"); await sleep(30);
    const {pages, notes} = buildSheets(); if (!pages.length) throw new Error("il progetto è vuoto");
    const base = `${slug()}-tavole`;
    if (b.id === "tvPdf") await saveFile(base + ".pdf", new Blob([pagesPDF(pages, P.name || "Tavole")], {type:"application/pdf"}));
    else { const files = {}; pages.forEach((pg, i) => { const nm = `${String(i + 1).padStart(2, "0")}-${slugify(pg.title)}`; files[nm + (b.id === "tvSvg" ? ".svg" : ".dxf")] = fflate.strToU8(b.id === "tvSvg" ? pageSVG(pg) : pageDXF(pg)); });
      await saveFile(base + (b.id === "tvSvg" ? "-svg" : "-dxf") + ".zip", new Blob([fflate.zipSync(files)])); }
    if (st) st.textContent = `${pages.length} fogli ${T_PAPER()}.${notes.length ? " " + notes.join("; ") + "." : ""}`;
  } catch(err){ console.error(err); toast("Tavole non riuscite: " + (err.message || err), true); }
  finally { busy(""); b.disabled = false; }
});
const T_PAPER = () => tav().paper;
$("#panel-list").addEventListener("change", e => { const k = e.target.dataset.price; if (k === undefined) return; const v = num(e.target.value); if (v === null || e.target.value.trim() === "") delete prices()[k]; else prices()[k] = v; commit(); });
$("#panel-list").addEventListener("click", async e => { if (!e.target.closest("#compCsv")) return; const q = v => `"${String(v).replace(/"/g, '""')}"`, pr = prices();
  const lines = [["Categoria", "Voce", "u.m.", "Quantità", "Prezzo €", "Importo €"].map(q).join(";")];
  for (const r of computo()){ const p = pr[r.key]; lines.push([r.cat, r.voce, r.um, fmt(r.q, r.um === "n." ? 0 : 2), p != null ? fmt(p, 2) : "", p != null ? fmt(p * r.q, 2) : ""].map(q).join(";")); }
  await saveFile(slug() + "-computo.csv", "﻿" + lines.join("\r\n")); });
