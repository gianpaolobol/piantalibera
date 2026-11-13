// Pianta del banco in SVG, colorata per ruolo (per guardarla e per i documenti).
const COL = { muro: "#111", porta: "#c0392b", finestra: "#2471a3", arredo: "#9a7d0a", quota: "#7d3c98", retino: "#bbb", cornice: "#555" };
export function inSVG(p, { verita = null, risultato = null, px = 40 } = {}){
  const S = p.disegno.segs, xs = S.flatMap(s => [s[0], s[2]]), ys = S.flatMap(s => [s[1], s[3]]);
  const x0 = Math.min(...xs) - .5, y0 = Math.min(...ys) - .5, w = Math.max(...xs) - x0 + .5, h = Math.max(...ys) - y0 + .5;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.round(w * px)}" height="${Math.round(h * px)}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>`];
  for (const s of S) o.push(`<line x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}" stroke="${COL[s[5]] || "#000"}" stroke-width="${s[5] === "retino" ? .01 : .025}"/>`);
  for (const a of p.disegno.arcs){ const A = [a.cx + a.r * Math.cos(a.a0), a.cy + a.r * Math.sin(a.a0)], B = [a.cx + a.r * Math.cos(a.a1), a.cy + a.r * Math.sin(a.a1)];
    o.push(`<path d="M${A[0]} ${A[1]} A${a.r} ${a.r} 0 0 1 ${B[0]} ${B[1]}" fill="none" stroke="${COL.porta}" stroke-width=".02"/>`); }
  for (const t of p.disegno.texts) o.push(`<text x="${t.x}" y="${t.y}" font-size=".25" text-anchor="middle" fill="#444">${t.text}</text>`);
  const asse = (ws, col, dash) => { for (const w of ws) o.push(`<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${col}" stroke-width="${w.thick}" stroke-opacity=".35" ${dash ? 'stroke-dasharray=".1 .05"' : ""}/>`); };
  if (verita) asse(verita.walls, "#27ae60");
  if (risultato) asse(risultato.walls, "#e67e22", true);
  o.push("</svg>"); return o.join("");
}
