// Casa di prova: pianta a doppia linea e due prospetti (metri)
export const L = (x1, y1, x2, y2, layer = "MURI") => [x1, y1, x2, y2, layer];
export const rect = (x0, y0, x1, y1) => [L(x0, y0, x1, y0), L(x1, y0, x1, y1), L(x1, y1, x0, y1), L(x0, y1, x0, y0)];

// casa 10×8 m, muri esterni 30 cm, tramezzo 12 cm a x=6 (coordinate dell'editor: y verso sud)
export function planDrawing(){
  const s = [
    // nord: finestra 4–5,5
    L(0, 0, 4, 0), L(5.5, 0, 10, 0), L(.3, .3, 4, .3), L(5.5, .3, 5.94, .3), L(6.06, .3, 9.7, .3), L(4, 0, 4, .3), L(5.5, 0, 5.5, .3), L(4, .15, 5.5, .15, "FINESTRE"), L(4, .12, 5.5, .12, "FINESTRE"),
    // sud: porta 2–3, finestra 6,5–8
    L(0, 8, 2, 8), L(3, 8, 6.5, 8), L(8, 8, 10, 8), L(.3, 7.7, 2, 7.7), L(3, 7.7, 5.94, 7.7), L(6.06, 7.7, 6.5, 7.7), L(8, 7.7, 9.7, 7.7),
    L(2, 7.7, 2, 8), L(3, 7.7, 3, 8), L(6.5, 7.7, 6.5, 8), L(8, 7.7, 8, 8), L(6.5, 7.85, 8, 7.85, "FINESTRE"), L(6.5, 7.82, 8, 7.82, "FINESTRE"), L(2, 7.7, 2, 6.7, "PORTE"),
    // ovest, est
    L(0, 0, 0, 8), L(.3, .3, .3, 7.7), L(10, 0, 10, 8), L(9.7, .3, 9.7, 7.7),
    // tramezzo con porta 3–3,8
    L(5.94, .3, 5.94, 3), L(5.94, 3.8, 5.94, 7.7), L(6.06, .3, 6.06, 3), L(6.06, 3.8, 6.06, 7.7), L(5.94, 3, 6.06, 3), L(5.94, 3.8, 6.06, 3.8),
    // un mobile (non è un muro)
    ...rect(7, 1, 9, 1.6).map(x => (x[4] = "ARREDI", x)),
  ];
  const arcs = [{cx:2, cy:7.7, r:1, a0:Math.PI, a1:1.5 * Math.PI}, {cx:6.06, cy:3, r:.8, a0:0, a1:Math.PI/2}];
  const texts = [{x:3, y:4, text:"SOGGIORNO"}, {x:3, y:4.6, text:"24,5 mq"}, {x:8, y:4, text:"{\\fArial|b1;CAMERA}"}];
  return { segs: s, arcs, texts };
}
// prospetto sud (y verso l'alto): gronda a 3 m, falda vista di lato con colmo a 4,9 m
export function elevSud(){
  return [L(-1, 0, 11, 0), L(0, 0, 0, 3), L(10, 0, 10, 3), L(-.4, 3, 10.4, 3), L(-.4, 4.9, 10.4, 4.9), L(-.4, 3, -.4, 4.9), L(10.4, 3, 10.4, 4.9),
    ...rect(2, 0, 3, 2.2), ...rect(6.5, .9, 8, 2.3), ...rect(6.6, 1, 7.9, 2.2), ...rect(6, .9, 6.5, 2.3), ...rect(8, .9, 8.5, 2.3)];
}
// prospetto est: timpano, una finestra in più che in pianta non c'è
export function elevEst(){
  return [L(-1, 0, 9, 0), L(0, 0, 0, 3), L(8, 0, 8, 3), L(0, 3, 8, 3), L(-.4, 2.8, 4, 4.9), L(4, 4.9, 8.4, 2.8), ...rect(3, .9, 4.2, 2.1)];
}


/** Tavola unica in DXF (R12, centimetri): pianta in alto, prospetti sud ed est sotto, con le etichette. */
export function tavolaDXF(opt = {}){
  const k = 100, out = ["0","SECTION","2","HEADER","9","$INSUNITS","70","5","0","ENDSEC","0","SECTION","2","ENTITIES"];
  const line = (s, dx, dy, flip) => out.push("0","LINE","8",s[4] || "0","10",String((s[0]+dx)*k),"20",String((flip ? -s[1] : s[1])*k + dy*k),"11",String((s[2]+dx)*k),"21",String((flip ? -s[3] : s[3])*k + dy*k));
  const text = (x, y, t, layer = "TESTI") => out.push("0","TEXT","8",layer,"10",String(x*k),"20",String(y*k),"40","30","1",t);
  const d = planDrawing();
  d.segs.forEach(s => line(s, 0, 0, true));
  for (const a of d.arcs) out.push("0","ARC","8","PORTE","10",String(a.cx*k),"20",String(-a.cy*k),"40",String(a.r*k),"50",String(-a.a1*180/Math.PI),"51",String(-a.a0*180/Math.PI));
  d.texts.forEach(t => text(t.x, -t.y, t.text.replace(/[{}]|\\f[^;]*;/g, "")));
  if (opt.scale){   // gradini esterni davanti all'ingresso sud e una rampa interna, sul layer delle scale (con la freccia di salita)
    for (let k2 = 0; k2 < 3; k2++){ const o = .3 * (k2 + 1); for (const s of [[2.5 - .8 - o, 8 + o, 2.5 + .8 + o, 8 + o], [2.5 - .8 - o, 8, 2.5 - .8 - o, 8 + o], [2.5 + .8 + o, 8, 2.5 + .8 + o, 8 + o]]) line([...s, "1-SCALA"], 0, 0, true); }
    for (let i = 0; i <= 8; i++) line([6, 2 + i * .28, 6.9, 2 + i * .28, "1-SCALA"], 0, 0, true);
    for (const s of [[6.45, 2.05, 6.45, 4.2], [6.45, 4.2, 6.35, 4.0], [6.45, 4.2, 6.55, 4.0]]) line([...s, "1-SCALA"], 0, 0, true);
  }
  text(3, -9.5, "PIANTA PIANO TERRA");
  elevSud().forEach(s => line(s, 20, -14));
  text(24, -15.5, "PROSPETTO SUD");
  elevEst().forEach(s => line(s, 40, -14));
  text(43, -15.5, "PROSPETTO EST");
  out.push("0","ENDSEC","0","EOF");
  return out.join("\n");
}
