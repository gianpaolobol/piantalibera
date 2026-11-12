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
