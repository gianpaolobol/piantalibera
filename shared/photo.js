// «Da foto al 3D» — contratto condiviso tra Worker Cloudflare, server locale ed editor.
// Una foto di un interno viene analizzata da due modelli di Workers AI:
//   1. un modello linguistico con visione (Llama 4 Scout) descrive la scena in JSON: tipo di ambiente,
//      spigoli della parete di fondo, misure stimate, materiali, luce e l'elenco di aperture e arredi;
//   2. un rilevatore (Moondream) ritrova con precisione i riquadri degli oggetti di quelle categorie.
// Qui: limiti, prompt, schema JSON richiesto al modello, lettura tollerante delle risposte e unione
// dei risultati in un'«analisi» normalizzata e sicura (numeri limitati, testi corti, categorie note).
// La geometria 3D si ricostruisce poi nell'editor (editor-src/077-foto3d.js), dove l'utente corregge.
// Nessuna dipendenza: gira in Workers e in Node.

export const PHOTO = {
  maxBodyBytes: 3 * 1024 * 1024,
  maxImageBytes: 2 * 1024 * 1024,
  maxSide: 1600,          // il client riduce a 1280 px sul lato lungo
  minSide: 256,
  maxItems: 60,
  maxDetectTargets: 9,
};

/* categorie riconosciute → oggetto della libreria dell'editor, nome inglese per il rilevatore e misure tipiche (m) */
export const CATEGORIES = {
  porta:             { kind: "door",   en: "door", w: .9, h: 2.1 },
  portafinestra:     { kind: "door",   en: "glass door", w: 1.4, h: 2.3 },
  porta_scorrevole:  { kind: "door",   en: "sliding door", w: 1.2, h: 2.1 },
  finestra:          { kind: "window", en: "window", w: 1.2, h: 1.4 },
  divano:            { kind: "furn", ref: "divano3", en: "sofa", w: 2.2, d: .92, h: .85 },
  divano_angolare:   { kind: "furn", ref: "divano_ang", en: "sofa", w: 2.8, d: 1.9, h: .85 },
  poltrona:          { kind: "furn", ref: "poltrona", en: "armchair", w: .86, d: .84, h: .8 },
  pouf:              { kind: "furn", ref: "pouf", en: "pouf", w: .54, d: .54, h: .42 },
  tavolino:          { kind: "furn", ref: "tavolino", en: "coffee table", w: 1.1, d: .6, h: .4 },
  tavolino_tondo:    { kind: "furn", ref: "tavolino_t", en: "coffee table", w: .8, d: .8, h: .4 },
  mobile_tv:         { kind: "furn", ref: "mobile_tv", en: "tv", w: 1.9, d: .42, h: 1.3 },
  libreria:          { kind: "furn", ref: "libreria", en: "bookshelf", w: 1.2, d: .35, h: 2 },
  tappeto:           { kind: "furn", ref: "tappeto", en: "rug", w: 2.4, d: 1.7, h: .02 },
  lampada_terra:     { kind: "light", ref: "lampada", en: "floor lamp", w: .4, d: .4, h: 1.75, mount: "floor" },
  tavolo:            { kind: "furn", ref: "tavolo6", en: "dining table", w: 2, d: .95, h: .75 },
  tavolo_tondo:      { kind: "furn", ref: "tavolo_tondo", en: "dining table", w: 1.2, d: 1.2, h: .75 },
  sedia:             { kind: "furn", ref: "sedia", en: "chair", w: .45, d: .45, h: .85 },
  madia:             { kind: "furn", ref: "madia", en: "sideboard", w: 1.8, d: .45, h: .8 },
  cucina:            { kind: "furn", ref: "cucina", en: "kitchen cabinets", w: 3, d: .6, h: 2.2 },
  isola:             { kind: "furn", ref: "isola", en: "kitchen island", w: 2.1, d: 1, h: .9 },
  frigorifero:       { kind: "furn", ref: "frigo", en: "refrigerator", w: .7, d: .68, h: 1.9 },
  sgabello:          { kind: "furn", ref: "sgabello", en: "bar stool", w: .38, d: .38, h: .75 },
  letto_matrimoniale:{ kind: "furn", ref: "letto2", en: "bed", w: 1.74, d: 2.12, h: 1 },
  letto_singolo:     { kind: "furn", ref: "letto1", en: "bed", w: .98, d: 2.08, h: .9 },
  comodino:          { kind: "furn", ref: "comodino", en: "nightstand", w: .5, d: .4, h: .5 },
  armadio:           { kind: "furn", ref: "armadio2", en: "wardrobe", w: 1.2, d: .62, h: 2.4 },
  cassettiera:       { kind: "furn", ref: "cassettiera", en: "dresser", w: 1, d: .5, h: .85 },
  scrivania:         { kind: "furn", ref: "scrivania", en: "desk", w: 1.4, d: .7, h: .75 },
  sedia_ufficio:     { kind: "furn", ref: "sedia_uff", en: "office chair", w: .68, d: .68, h: 1.1 },
  wc:                { kind: "furn", ref: "wc", en: "toilet", w: .38, d: .54, h: .4 },
  bidet:             { kind: "furn", ref: "bidet", en: "bidet", w: .38, d: .54, h: .4 },
  lavabo:            { kind: "furn", ref: "lavabo", en: "sink", w: .82, d: .5, h: .85 },
  doccia:            { kind: "furn", ref: "doccia", en: "shower", w: .9, d: .9, h: 2 },
  vasca:             { kind: "furn", ref: "vasca", en: "bathtub", w: 1.7, d: .76, h: .55 },
  pianta:            { kind: "furn", ref: "vaso_verde", en: "potted plant", w: .6, d: .6, h: 1.2 },
  persona:           { kind: "person", ref: "sagoma_uomo", en: "person", w: .5, d: .35, h: 1.75 },
  lampadario:        { kind: "light", ref: "sospensione", en: "pendant lamp", w: .44, d: .44, h: .9, mount: "ceiling" },
  plafoniera:        { kind: "light", ref: "plafoniera", en: "ceiling light", w: .4, d: .4, h: .1, mount: "ceiling" },
  faretto:           { kind: "light", ref: "faretto", en: "spotlight", w: .1, d: .1, h: .05, mount: "ceiling" },
  applique:          { kind: "light", ref: "applique", en: "wall lamp", w: .2, d: .15, h: .2, mount: "wall" },
  scala:             { kind: "furn", ref: "scala_dritta", en: "staircase", w: 1, d: 3, h: 2.8 },
  altro:             { kind: "other", en: "", w: .6, d: .6, h: .8 },
};
export const CATEGORY_KEYS = Object.keys(CATEGORIES);
export const FLOORS = ["parquet", "piastrelle", "marmo", "cemento", "moquette", "laminato", "cotto", "pietra", "resina", "altro"];

/* ---------- richiesta al modello con visione ---------- */
export const PHOTO_SYSTEM = `You are an architectural surveyor. You look at ONE photo and describe the space so that a 3D model can be rebuilt from it.
Coordinates: integers 0-1000, x from the left edge, y from the top edge of the photo.
Rules:
- scene: "interior" or "exterior".
- back_wall: the wall the camera faces. Give its four corners as seen in the photo: where it meets the floor (left, right) and the ceiling (left, right). If a corner is outside the photo, extrapolate along the edge (values may go below 0 or above 1000).
- room: realistic size in metres of the whole room (width along the back wall, depth towards the camera, height).
- items: EVERY visible door, window, piece of furniture, lamp (pendant, ceiling, wall, floor lamp), plant and person. One entry per object, tight box around it. Use only the given categories; use "altro" if none fits.
- width_m/depth_m/height_m: realistic object size in metres.
- facing: where the front of the object points: "camera", "away", "left", "right".
- against_wall: which wall the object touches ("back", "left", "right") or "none".
- label: short Italian name (max 4 words).
Answer with JSON only.`;

const num = { type: "number" }, pt = { type: "array", items: num, minItems: 2, maxItems: 2 };
export const PHOTO_SCHEMA = {
  type: "object",
  properties: {
    scene: { type: "string", enum: ["interior", "exterior"] },
    room_type: { type: "string" },
    camera: { type: "object", properties: { hfov_deg: num, pitch_deg: num, height_m: num } },
    back_wall: { type: "object", properties: { floor_left: pt, floor_right: pt, ceiling_left: pt, ceiling_right: pt, ceiling_visible: { type: "boolean" }, left_wall_visible: { type: "boolean" }, right_wall_visible: { type: "boolean" } } },
    room: { type: "object", properties: { width_m: num, depth_m: num, height_m: num } },
    materials: { type: "object", properties: { floor: { type: "string", enum: FLOORS }, floor_color: { type: "string" }, wall_color: { type: "string" }, ceiling_color: { type: "string" } } },
    lighting: { type: "object", properties: { time: { type: "string", enum: ["day", "evening", "night"] }, lamps_on: { type: "boolean" }, color_temperature_k: num } },
    items: { type: "array", items: { type: "object", properties: {
      category: { type: "string", enum: CATEGORY_KEYS }, label: { type: "string" },
      box: { type: "array", items: num, minItems: 4, maxItems: 4 },
      width_m: num, depth_m: num, height_m: num,
      facing: { type: "string", enum: ["camera", "away", "left", "right"] },
      against_wall: { type: "string", enum: ["none", "back", "left", "right"] },
    }, required: ["category", "box"] } },
  },
  required: ["scene", "back_wall", "room", "items"],
};
export function photoMessages(imageDataUrl) {
  return [
    { role: "system", content: PHOTO_SYSTEM },
    { role: "user", content: [
      { type: "text", text: `Categories: ${CATEGORY_KEYS.join(", ")}. Floor materials: ${FLOORS.join(", ")}. Describe this photo.` },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ] },
  ];
}

/* ---------- lettura tollerante ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const n = (v, d = null) => { const x = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v; return Number.isFinite(x) ? x : d; };
const txt = (v, max = 60) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const hex = v => { const m = typeof v === "string" && v.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return null; let h = m[1].toLowerCase(); if (h.length === 3) h = h.replace(/./g, c => c + c); return "#" + h; };
const pick = (v, list, d) => list.includes(v) ? v : d;

/** Estrae l'oggetto JSON dalla risposta del modello (oggetto già pronto, stringa con o senza ``` o testo intorno). */
export function extractJson(out) {
  const r = out && typeof out === "object" && "response" in out ? out.response : out;
  if (r && typeof r === "object") return r;
  if (typeof r !== "string") return null;
  const s = r.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

/* coordinate del modello: 0-1000 (o 0-1, o pixel) → frazioni 0..1 dell'immagine */
function normPt(p, W, H) {
  if (!Array.isArray(p) || p.length < 2) return null;
  let [x, y] = p.map(v => n(v)); if (x == null || y == null) return null;
  const s = Math.max(Math.abs(x), Math.abs(y));
  if (s > 1000 * 1.6 && W && H) { x /= W; y /= H; } else if (s > 1.6) { x /= 1000; y /= 1000; }
  return [clamp(x, -1, 2), clamp(y, -1, 2)];
}
function normBox(b, W, H) {
  let arr = Array.isArray(b) ? b : b && typeof b === "object" ? [b.x_min ?? b.xmin ?? b.x0 ?? b.left, b.y_min ?? b.ymin ?? b.y0 ?? b.top, b.x_max ?? b.xmax ?? b.x1 ?? b.right, b.y_max ?? b.ymax ?? b.y1 ?? b.bottom] : null;
  if (!arr || arr.length < 4) return null;
  arr = arr.slice(0, 4).map(v => n(v)); if (arr.some(v => v == null)) return null;
  const s = Math.max(...arr.map(Math.abs));
  const sx = s > 1000 * 1.6 && W ? W : s > 1.6 ? 1000 : 1, sy = s > 1000 * 1.6 && H ? H : sx;
  let [x0, y0, x1, y1] = [arr[0] / sx, arr[1] / sy, arr[2] / sx, arr[3] / sy];
  if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0];
  x0 = clamp(x0, 0, 1); x1 = clamp(x1, 0, 1); y0 = clamp(y0, 0, 1); y1 = clamp(y1, 0, 1);
  return x1 - x0 > .004 && y1 - y0 > .004 ? [x0, y0, x1, y1].map(v => +v.toFixed(4)) : null;
}
const iou = (a, b) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = ix * iy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return u > 0 ? i / u : 0; };
const size = (v, d, max) => { const x = n(v); return x != null && x > 0 ? +clamp(x, .02, max).toFixed(2) : d; };

/** Riquadri del rilevatore: accetta {objects:[…]}, un array o varianti di nome dei campi. */
export function parseDetections(out, W, H) {
  const list = Array.isArray(out) ? out : out?.objects || out?.result?.objects || out?.detections || [];
  return (Array.isArray(list) ? list : []).map(o => normBox(o?.bbox || o?.box || o, W, H)).filter(Boolean).slice(0, 40);
}

/** Categorie da passare al rilevatore: porte e finestre sempre, poi quelle trovate dal modello. */
export function detectTargets(raw) {
  const cats = new Set(["porta", "finestra"]);
  for (const it of Array.isArray(raw?.items) ? raw.items : []) if (CATEGORIES[it?.category]?.en) cats.add(it.category);
  const byEn = new Map();
  for (const c of cats) { const en = CATEGORIES[c].en; if (!byEn.has(en)) byEn.set(en, []); byEn.get(en).push(c); }
  return [...byEn.entries()].slice(0, PHOTO.maxDetectTargets).map(([en, cats]) => ({ en, cats }));
}

/** Analisi normalizzata. raw: JSON del modello; dets: {en: [box…]} del rilevatore; W,H: pixel della foto. */
export function normalizeAnalysis(raw, dets = {}, W = null, H = null) {
  if (!raw || typeof raw !== "object") throw Object.assign(new Error("il modello non ha descritto la foto"), { code: "invalid_provider_output" });
  const room = raw.room || {}, cam = raw.camera || {}, bw = raw.back_wall || {}, mat = raw.materials || {}, li = raw.lighting || {};
  const a = {
    scene: pick(raw.scene, ["interior", "exterior"], "interior"),
    room_type: txt(raw.room_type, 40),
    camera: { hfov_deg: n(cam.hfov_deg) != null ? +clamp(n(cam.hfov_deg), 30, 120).toFixed(1) : null, pitch_deg: n(cam.pitch_deg) != null ? +clamp(n(cam.pitch_deg), -40, 40).toFixed(1) : 0, height_m: size(cam.height_m, 1.5, 3) },
    room: { width_m: size(room.width_m, 4.5, 30), depth_m: size(room.depth_m, 5, 30), height_m: size(room.height_m, 2.7, 8) },
    materials: { floor: pick(mat.floor, FLOORS, "parquet"), floor_color: hex(mat.floor_color), wall_color: hex(mat.wall_color), ceiling_color: hex(mat.ceiling_color) },
    lighting: { time: pick(li.time, ["day", "evening", "night"], "day"), lamps_on: li.lamps_on === true, kelvin: n(li.color_temperature_k) != null ? Math.round(clamp(n(li.color_temperature_k), 1800, 7500)) : null },
    back_wall: null, items: [],
  };
  const corners = { fl: normPt(bw.floor_left, W, H), fr: normPt(bw.floor_right, W, H), cl: normPt(bw.ceiling_left, W, H), cr: normPt(bw.ceiling_right, W, H) };
  if (corners.fl && corners.fr && corners.fr[0] > corners.fl[0] + .05) {
    if (!corners.cl || corners.cl[1] >= corners.fl[1] - .05) corners.cl = [corners.fl[0], Math.max(-.5, corners.fl[1] - .45)];
    if (!corners.cr || corners.cr[1] >= corners.fr[1] - .05) corners.cr = [corners.fr[0], Math.max(-.5, corners.fr[1] - .45)];
    a.back_wall = { ...Object.fromEntries(Object.entries(corners).map(([k, v]) => [k, v.map(x => +x.toFixed(4))])), ceiling_visible: bw.ceiling_visible !== false, left_wall_visible: bw.left_wall_visible !== false, right_wall_visible: bw.right_wall_visible !== false, source: "modello" };
  }
  // elementi del modello
  const llm = [];
  for (const it of (Array.isArray(raw.items) ? raw.items : []).slice(0, PHOTO.maxItems)) {
    const cat = CATEGORIES[it?.category] ? it.category : "altro", c = CATEGORIES[cat], box = normBox(it?.box, W, H);
    if (!box) continue;
    llm.push({ category: cat, label: txt(it.label, 40) || cat.replace(/_/g, " "), box,
      w: size(it.width_m, c.w, 12), d: size(it.depth_m, c.d ?? .1, 12), h: size(it.height_m, c.h, 6),
      facing: pick(it.facing, ["camera", "away", "left", "right"], "camera"), against: pick(it.against_wall, ["none", "back", "left", "right"], "none"), source: "modello" });
  }
  // unione con il rilevatore: i suoi riquadri sono più precisi; le misure e l'orientamento restano del modello
  const used = new Set();
  for (const [en, boxes] of Object.entries(dets || {})) {
    const cats = CATEGORY_KEYS.filter(k => CATEGORIES[k].en === en);
    for (const box of boxes) {
      let best = -1, bi = -1;
      llm.forEach((it, i) => { if (used.has(i) || !cats.includes(it.category)) return; const v = iou(it.box, box); if (v > best) { best = v; bi = i; } });
      if (bi >= 0 && best > .05) { used.add(bi); a.items.push({ ...llm[bi], box, source: "rilevatore" }); }
      else { const cat = cats[0], c = CATEGORIES[cat]; a.items.push({ category: cat, label: cat.replace(/_/g, " "), box, w: c.w, d: c.d ?? .1, h: c.h, facing: "camera", against: "none", source: "rilevatore" }); }
    }
  }
  llm.forEach((it, i) => { if (!used.has(i)) a.items.push(it); });
  // doppioni (stesso oggetto due volte): tieni il primo
  a.items = a.items.filter((it, i) => !a.items.slice(0, i).some(o => o.category === it.category && iou(o.box, it.box) > .6)).slice(0, PHOTO.maxItems);
  return a;
}

/** Neurons dalle statistiche d'uso (token) con le tariffe pubblicate; null se il modello non le restituisce. */
export function neuronsFromUsage(usage, rate) {
  const p = n(usage?.prompt_tokens ?? usage?.input_tokens), c = n(usage?.completion_tokens ?? usage?.output_tokens);
  return p == null && c == null ? null : Math.ceil(((p || 0) * rate.in + (c || 0) * rate.out) / 1e6);
}
