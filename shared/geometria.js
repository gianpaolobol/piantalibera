// Geometria della pianta: funzioni pure, senza Three.js né stato dell'editor (#64).
// Le usa l'editor (incorporate senza «export» da scripts/build-editor.mjs) e le provano i test unitari
// (tests/geometria.test.mjs). Coordinate in metri, pianta con y verso il basso; muro = {a:[x,y], b:[x,y], thick, level}.
export function wallFrame(w){ const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], len=Math.hypot(dx,dy)||1e-9; const ux=dx/len, uy=dy/len; return {len, ux, uy, nx:-uy, ny:ux}; }
export const ptOnWall = (w, s, off=0) => { const f = wallFrame(w); return [w.a[0]+f.ux*s+f.nx*off, w.a[1]+f.uy*s+f.ny*off]; };
export function projOnSeg(p, a, b){ const dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1e-9; const t=Math.min(1, Math.max(0, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2)); const q=[a[0]+dx*t, a[1]+dy*t]; return {t, q, d:Math.hypot(p[0]-q[0], p[1]-q[1])}; }
export function polyArea(pts){ let a=0; for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length]; a += p[0]*q[1]-q[0]*p[1]; } return a/2; }
export function polyCentroid(pts){ let x=0,y=0,a=0; for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length], c=p[0]*q[1]-q[0]*p[1]; a+=c; x+=(p[0]+q[0])*c; y+=(p[1]+q[1])*c; } if (Math.abs(a)<1e-9) return pts[0]; return [x/(3*a), y/(3*a)]; }
export function inPoly(p, pts){ let ins=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const a=pts[i], b=pts[j]; if(((a[1]>p[1])!==(b[1]>p[1])) && (p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])) ins=!ins; } return ins; }

/* Lunghezza delle due facce di un muro (A = lato +n, B = lato −n), raccordate con i muri collegati:
   all'angolo la faccia interna si accorcia e quella esterna si allunga fino all'incontro con le facce dell'altro muro;
   all'innesto a T la faccia si ferma sul filo del muro passante. Senza collegamenti vale la lunghezza in asse. */
export function wallFaceLengths(w, walls){
  const f = wallFrame(w), len = f.len, u = [f.ux, f.uy], n = [f.nx, f.ny], EPS = 1e-3;
  const shift = {A:[0, 0], B:[0, 0]};   // di quanto la faccia rientra (positivo) o sporge (negativo) a ciascun estremo
  for (const [ei, E, dir] of [[0, w.a, u], [1, w.b, [-u[0], -u[1]]]]){
    const conns = [];   // direzioni dei muri collegati, uscenti dal punto di giunzione
    for (const v of walls){ if (v === w || v.level !== w.level) continue;
      const g = wallFrame(v), ev = [g.ux, g.uy];
      if (Math.hypot(v.a[0]-E[0], v.a[1]-E[1]) < EPS) conns.push({e:ev, t:v.thick});
      else if (Math.hypot(v.b[0]-E[0], v.b[1]-E[1]) < EPS) conns.push({e:[-ev[0], -ev[1]], t:v.thick});
      else { const q = projOnSeg(E, v.a, v.b); if (q.d < EPS && q.t > 1e-4 && q.t < 1 - 1e-4){ conns.push({e:ev, t:v.thick}); conns.push({e:[-ev[0], -ev[1]], t:v.thick}); } } }
    for (const [side, sg] of [["A", 1], ["B", -1]]){
      let best = null; const nn = [n[0]*sg, n[1]*sg];   // normale verso la faccia
      for (const c of conns){
        const m = [-c.e[1], c.e[0]], cr = dir[0]*c.e[1] - dir[1]*c.e[0]; if (Math.abs(cr) < 1e-6) continue;   // muri allineati: la faccia prosegue
        const toward = nn[0]*c.e[0] + nn[1]*c.e[1] > 0;   // la faccia guarda verso il muro collegato?
        const sm = (m[0]*dir[0] + m[1]*dir[1] > 0 ? 1 : -1) * (toward ? 1 : -1);   // faccia dell'altro muro: verso questo muro se «toward»
        // retta della faccia: E + nn·t/2 + dir·λ ; faccia dell'altro muro: E + m·sm·tv/2 + e·μ
        const p0 = [nn[0]*w.thick/2 - m[0]*sm*c.t/2, nn[1]*w.thick/2 - m[1]*sm*c.t/2];
        const lam = (c.e[0]*p0[1] - c.e[1]*p0[0]) / (dir[0]*c.e[1] - dir[1]*c.e[0]);
        if (best === null || lam > best) best = lam;
      }
      shift[side][ei] = best ?? 0;
    }
  }
  // muri che s'innestano a metà di questo (T): la faccia da quel lato è interrotta dallo spessore del muro innestato
  const cut = {A:0, B:0};
  for (const v of walls){ if (v === w || v.level !== w.level) continue;
    for (const [P0, P1] of [[v.a, v.b], [v.b, v.a]]){ const q = projOnSeg(P0, w.a, w.b); if (q.d > EPS || q.t < 1e-4 || q.t > 1 - 1e-4) continue;
      const g = Math.hypot(P1[0]-P0[0], P1[1]-P0[1]) || 1, e = [(P1[0]-P0[0])/g, (P1[1]-P0[1])/g], sn = Math.abs(u[0]*e[1] - u[1]*e[0]); if (sn < 1e-6) continue;
      cut[n[0]*e[0] + n[1]*e[1] > 0 ? "A" : "B"] += v.thick / sn; } }
  return {A:Math.max(0, len - shift.A[0] - shift.A[1] - cut.A), B:Math.max(0, len - shift.B[0] - shift.B[1] - cut.B), shift};
}

/* Sagoma della copertura di un piano: rettangoli massimi (anche sovrapposti) che coprono l'ingombro dei muri,
   compresi i loro spessori e le aree chiuse. Piante a L, T, U → più rettangoli; muri obliqui → un rettangolo
   d'ingombro (ortho:false). area(o) = superficie in pianta con lo sporto o (unione esatta per le piante ortogonali). */
export function roofRectsOf(ws){
  if (!ws.length) return null;
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
