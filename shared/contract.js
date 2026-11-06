// Contratto /api/render — validazione condivisa (Worker Cloudflare e servizio di prova Node).
// Vedi docs/api-render-contract.md. Nessuna dipendenza: gira in Workers e in Node.

export const LIMITS = {
  maxBodyBytes: 20 * 1024 * 1024,
  maxImageBytes: 8 * 1024 * 1024,
  maxPrompt: 4000,
  minSide: 256,
  maxSide: 1920,
  maxVariants: 2,
};

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Byte decodificati di un data URL immagine, -1 se non valido. */
export function dataUrlBytes(s) {
  const m = typeof s === "string" ? DATA_URL.exec(s) : null;
  return m ? Math.floor((m[2].length * 3) / 4) - (m[2].endsWith("==") ? 2 : m[2].endsWith("=") ? 1 : 0) : -1;
}

/** Decodifica un data URL in {bytes: Uint8Array, type}. */
export function decodeDataUrl(s) {
  const m = DATA_URL.exec(s);
  if (!m) throw new Error("data URL non valido");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: "image/" + m[1] };
}

/**
 * Valida e normalizza il corpo di POST /api/render.
 * @returns {{error: {status:number, code:string, message:string}} | {value: object}}
 */
export function validateRenderRequest(b, limits = LIMITS) {
  const bad = (message, status = 400, code = "invalid_input") => ({ error: { status, code, message } });
  if (!b || typeof b !== "object" || Array.isArray(b)) return bad("corpo JSON mancante", 400, "invalid_json");
  if (!["fedele", "creativo"].includes(b.mode)) return bad("mode deve essere fedele o creativo");
  if (b.scene != null && !["interni", "esterni"].includes(b.scene)) return bad("scene deve essere interni o esterni");
  if (typeof b.prompt !== "string" || !b.prompt.trim() || b.prompt.length > limits.maxPrompt) return bad(`prompt mancante o oltre ${limits.maxPrompt} caratteri`);
  if (b.negative_prompt != null && (typeof b.negative_prompt !== "string" || b.negative_prompt.length > limits.maxPrompt)) return bad("negative_prompt non valido");
  const img = dataUrlBytes(b.image);
  if (img < 0) return bad("image deve essere un data URL PNG, JPEG o WebP");
  if (img > limits.maxImageBytes) return bad("image troppo grande", 413, "too_large");
  for (const k of ["depth", "lines", "materials"]) {
    if (b[k] == null || b[k] === "") continue;
    const n = dataUrlBytes(b[k]);
    if (n < 0) return bad(`${k} deve essere un data URL immagine`);
    if (n > limits.maxImageBytes) return bad(`${k} troppo grande`, 413, "too_large");
  }
  if (b.camera != null) {
    const c = b.camera, vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    if (typeof c !== "object" || !vec(c.position) || !vec(c.target)) return bad("camera deve avere position e target [x,y,z]");
    if (c.fov != null && !(Number.isFinite(c.fov) && c.fov > 5 && c.fov < 150)) return bad("camera.fov fuori dai limiti");
  }
  const p = b.params && typeof b.params === "object" ? b.params : {};
  const side = (v, d) => v == null ? d : Number.isInteger(v) && v >= limits.minSide && v <= limits.maxSide ? v : NaN;
  const width = side(p.width, 1024), height = side(p.height, 768);
  if (Number.isNaN(width) || Number.isNaN(height)) return bad(`width e height interi tra ${limits.minSide} e ${limits.maxSide}`);
  const variants = p.variants == null ? 1 : p.variants;
  if (!Number.isInteger(variants) || variants < 1 || variants > limits.maxVariants) return bad(`variants tra 1 e ${limits.maxVariants}`);
  const seed = Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : Math.floor(Math.random() * 2 ** 31);
  const strength = Number.isFinite(p.strength) ? Math.min(1, Math.max(0, p.strength)) : 0.45;
  return {
    value: {
      mode: b.mode, scene: b.scene || null, prompt: b.prompt.trim(), negative_prompt: (b.negative_prompt || "").trim(),
      image: b.image, depth: b.depth || null, lines: b.lines || null, materials: b.materials || null,
      camera: b.camera || null, params: { width, height, variants, seed, strength, use_guides: p.use_guides !== false },
      project: typeof b.project?.name === "string" ? { name: b.project.name.slice(0, 120) } : null,
      turnstile: typeof b.turnstile === "string" ? b.turnstile : null,
    },
  };
}

/** Prompt inviato al modello: istruzioni di conservazione + descrizione dell'utente. */
export function buildModelPrompt(v, guideIndexes = {}) {
  const keep = "Keep exactly the same camera, perspective, walls, windows, doors, roof, floor levels and proportions. Do not add or remove volumes or openings.";
  const guides = [
    guideIndexes.depth != null ? `Image ${guideIndexes.depth} is a depth map of the same view (near = bright): follow it strictly.` : "",
    guideIndexes.lines != null ? `Image ${guideIndexes.lines} is an edge map of the same view: keep every edge where it is.` : "",
  ].filter(Boolean).join(" ");
  const head = v.mode === "fedele"
    ? `Turn image 0, a 3D model view, into a photorealistic architectural photograph. ${keep} Only make materials, lighting, sky, vegetation and people realistic. ${guides}`
    : `Use image 0, a 3D model view, as the starting point for a photorealistic architectural image. Stay close to its composition and main volumes. ${guides}`;
  const neg = v.negative_prompt ? ` Avoid: ${v.negative_prompt}.` : "";
  return `${head} ${v.prompt}${neg}`.replace(/\s+/g, " ").trim().slice(0, 4000);
}

export const jsonError = (status, code, message, headers = {}) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
