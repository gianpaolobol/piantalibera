// Workflow di ComfyUI (formato API): riconoscimento e compilazione con i dati del render.
export function isApiWorkflow(w){ return !!w && typeof w === "object" && !Array.isArray(w) && !w.nodes && Object.values(w).some(n => n && n.class_type && n.inputs); }
/** Inserisce immagini, prompt, seed e dimensioni nel workflow esportato da ComfyUI (formato API). */
export function fillWorkflow(wf, {images, prompt, seed, width, height}){
  const w = JSON.parse(JSON.stringify(wf)), ids = Object.keys(w).sort((a, b) => (+a || 0) - (+b || 0) || a.localeCompare(b));
  const loads = ids.filter(id => w[id].class_type === "LoadImage");
  loads.forEach((id, i) => { w[id].inputs.image = images[Math.min(i, images.length - 1)]; });
  const texts = ids.filter(id => /TextEncode/i.test(w[id].class_type) && typeof w[id].inputs.text === "string");
  const neg = new Set(); for (const id of ids) for (const [k, v] of Object.entries(w[id].inputs)) if (/negative/i.test(k) && Array.isArray(v)) neg.add(String(v[0]));
  const pos = texts.filter(id => !neg.has(id));
  (pos.length ? pos : texts.slice(0, 1)).forEach(id => { w[id].inputs.text = prompt; });
  for (const id of ids){ const inp = w[id].inputs;
    for (const k of ["seed", "noise_seed"]) if (k in inp && typeof inp[k] === "number") inp[k] = seed;
    if (typeof inp.width === "number" && typeof inp.height === "number" && /Latent|Empty/i.test(w[id].class_type)){ inp.width = width; inp.height = height; }
  }
  return {wf: w, loads: loads.length, prompts: pos.length || Math.min(1, texts.length)};
}
