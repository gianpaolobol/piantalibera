// Estrae la libreria degli arredi parametrici di Pianta Libera (furn() in editor-src/02-lib.js)
// e la tabella dei materiali (MATS in editor-src/01-base.js) in un file JSON di primitive,
// eseguendo il codice VERO dell'editor con un finto Three.js che registra ogni pezzo.
// Uso: node strumenti/pianta3d/estrai-arredi.mjs  → strumenti/pianta3d/arredi.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", "..");
const lib = readFileSync(join(root, "editor-src/02-lib.js"), "utf8").split("\n");
const base = readFileSync(join(root, "editor-src/01-base.js"), "utf8").split("\n");
const take = (lines, start, endRe) => { const i = lines.findIndex(l => l.startsWith(start)); let j = i + 1; while (j < lines.length && !endRe.test(lines[j])) j++; return lines.slice(i, j + 1).join("\n"); };
const furnSrc = take(lib, "function furn(", /^}/);
const matsSrc = take(base, "const MATS = {", /^};/);
const libSrc = take(lib, "const LIB = [", /^\];/);

class V3 { constructor(){ this.x = 0; this.y = 0; this.z = 0; } set(x, y, z){ this.x = x; this.y = y; this.z = z; return this; } setScalar(s){ return this.set(s, s, s); } copy(v){ return this.set(v.x, v.y, v.z); } }
class Obj { constructor(){ this.position = new V3(); this.rotation = new V3(); this.scale = new V3().set(1, 1, 1); this.children = []; this.userData = {}; }
  add(...c){ this.children.push(...c); return this; } traverse(f){ f(this); this.children.forEach(c => c.traverse(f)); } }
const geo = kind => class { constructor(...a){ this.kind = kind; this.args = a; } rotateX(){ this.rx = true; return this; } rotateZ(){ this.rz = true; return this; } translate(){ return this; } };
const THREE = {
  Group: Obj, Object3D: Obj, Mesh: class extends Obj { constructor(g, m){ super(); this.geometry = g; this.material = m; this.isMesh = true; } },
  BoxGeometry: geo("box"), RoundedBoxGeometry: geo("box"), CylinderGeometry: geo("cyl"), SphereGeometry: geo("sphere"),
  TorusGeometry: geo("other"), PlaneGeometry: geo("other"), ShapeGeometry: geo("other"), ExtrudeGeometry: geo("other"), LatheGeometry: geo("other"), CapsuleGeometry: geo("other"), ConeGeometry: geo("cyl"), TubeGeometry: geo("other"),
  Shape: class { moveTo(){ return this; } lineTo(){ return this; } quadraticCurveTo(){ return this; } bezierCurveTo(){ return this; } absarc(){ return this; } }, Vector3: V3, Vector2: class {}, CatmullRomCurve3: class {},
  MathUtils: { degToRad: d => d * Math.PI / 180 }, DoubleSide: 2,
};
const ctx = { THREE, Math, getMat: m => ({ __mat: m, clone(){ return this; } }), console };
vm.createContext(ctx);
vm.runInContext(`${matsSrc}\n${furnSrc}\nthis.MATS = MATS; this.furn = furn;`, ctx);
const refs = [...libSrc.matchAll(/ref:"([\w]+)"[^}]*?build:\(\)=>furn\("([\w]+)"\)/g)].map(m => [m[1], m[2]]);
const meta = Object.fromEntries([...libSrc.matchAll(/ref:"([\w]+)", nome:"([^"]+)"/g)].map(m => [m[1], m[2]]));

const out = { origine: "Pianta Libera editor-src/02-lib.js furn() + 01-base.js MATS", materiali: {}, arredi: {} };
for (const [k, v] of Object.entries(ctx.MATS)) out.materiali[k] = { color: v.color, rough: v.rough ?? .6, metal: v.metal ?? 0, opacity: v.opacity ?? 1 };
let saltati = 0;
for (const [ref, fref] of refs){
  let G; try { G = ctx.furn(fref); } catch (e) { saltati++; continue; }
  if (!G) continue;
  const parts = [];
  G.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, mat = o.material?.__mat ?? "bianco", p = o.position, r = o.rotation, s = o.scale;
    if (g.kind === "box") parts.push({ t: "box", p: [p.x, p.y, p.z], r: [r.x, r.y, r.z], d: [g.args[0] * s.x, g.args[1] * s.y, g.args[2] * s.z], m: mat });
    else if (g.kind === "cyl") parts.push({ t: "cyl", p: [p.x, p.y, p.z], r: [r.x, r.y, r.z], rad: Math.max(g.args[0], g.args[1]) * s.x, h: g.args[2] * s.y, m: mat });
    else if (g.kind === "sphere") parts.push({ t: "sphere", p: [p.x, p.y, p.z], rad: g.args[0] * s.x, m: mat });
  });
  if (parts.length) out.arredi[ref] = { nome: meta[ref] || ref, parti: parts };
}
writeFileSync(join(here, "arredi.json"), JSON.stringify(out));
console.log(`arredi: ${Object.keys(out.arredi).length}, materiali: ${Object.keys(out.materiali).length}, non eseguibili: ${saltati}`);
