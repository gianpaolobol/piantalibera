// Condivisione dei progetti con il cliente e commenti: logica comune al Worker
// Cloudflare (KV + Durable Object per i limiti) e al server locale (memoria).
//
//   POST   /api/share                     crea un link (corpo: {name, project, edit?, turnstile})  → {id, token, expires_at, mode, edit_key?}
//   GET    /api/share/:id                 progetto, nome, scadenza, modalità, commenti e avviso di proposta
//   PUT    /api/share/:id                 aggiorna il progetto (intestazione X-Share-Token)
//   POST   /api/share/:id/accesso         {edit:true|false} cambia la modalità (X-Share-Token) → {mode, edit_key?}
//   POST   /api/share/:id/proposta        il cliente invia le sue modifiche {author, note, project, turnstile} (X-Edit-Key)
//   GET    /api/share/:id/proposta        la proposta completa (X-Share-Token)
//   DELETE /api/share/:id/proposta        scarta la proposta (X-Share-Token)
//   DELETE /api/share/:id                 elimina link e commenti (X-Share-Token)
//   POST   /api/share/:id/comments        nuovo commento {author, text, level, at:[x,y], cam?, turnstile}
//   PATCH  /api/share/:id/comments/:cid   {resolved:true|false} (X-Share-Token)
//   DELETE /api/share/:id/comments/:cid   elimina un commento (X-Share-Token)
//
// Il token del progettista e la chiave di modifica del cliente sono restituiti una sola volta e conservati
// solo come hash. La chiave del cliente viaggia nel frammento del link (#modifica=…), che il browser non
// invia al server. Le modifiche del cliente non toccano il progetto condiviso: restano una proposta che il
// progettista apre o scarta (una sola proposta per link, l'ultima sostituisce la precedente).
// Nessun dato personale oltre al nome che il cliente sceglie di scrivere; IP solo come hash nei contatori.

export const SHARE = { maxBytes: 1_500_000, ttlDays: 30, maxComments: 200, textMax: 1000, authorMax: 60, perIpDaily: 10, commentsPerIpDaily: 40, globalDaily: 300, noteMax: 2000 };
SHARE.limits = { share: SHARE.perIpDaily, comment: SHARE.commentsPerIpDaily, proposal: 20 };
const ID_RE = /^[a-z0-9]{12}$/, CID_RE = /^[a-z0-9]{10}$/, TOKEN_RE = /^[a-f0-9]{48}$/;
const ALPH = "abcdefghijkmnpqrstuvwxyz23456789";
function rnd(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
export const newShareId = (n = 12) => [...rnd(n)].map(x => ALPH[x % ALPH.length]).join("");
export const newToken = () => [...rnd(24)].map(x => x.toString(16).padStart(2, "0")).join("");
export async function sha256hex(s) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
const err = (status, code, message) => ({ status, body: { error: { code, message } } });
const ok = (status, body) => ({ status, body });
const str = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const finite = v => typeof v === "number" && Number.isFinite(v);

/** Il progetto deve avere la forma di un progetto Pianta Libera; i file dei modelli importati non si condividono. */
export function validateProject(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "progetto mancante";
  for (const k of ["levels", "walls", "rooms", "openings", "objects"]) if (!Array.isArray(p[k])) return `progetto senza ${k}`;
  if (!p.levels.length || p.levels.length > 50) return "numero di piani non valido";
  if (p.walls.length > 5000 || p.objects.length > 5000) return "progetto troppo grande";
  return null;
}
export function validateComment(b) {
  if (!b || typeof b !== "object") return { error: "commento mancante" };
  const text = str(b.text, SHARE.textMax), author = str(b.author, SHARE.authorMax) || "Cliente";
  if (!text) return { error: "il commento è vuoto" };
  const at = Array.isArray(b.at) && b.at.length === 2 && b.at.every(finite) && b.at.every(v => Math.abs(v) < 1e5) ? b.at.map(v => Math.round(v * 1000) / 1000) : null;
  const vec = v => Array.isArray(v) && v.length === 3 && v.every(finite) && v.every(x => Math.abs(x) < 1e5) ? v.map(x => Math.round(x * 1000) / 1000) : null;
  const cam = b.cam && vec(b.cam.pos) && vec(b.cam.target) ? { pos: vec(b.cam.pos), target: vec(b.cam.target), fov: finite(b.cam.fov) ? Math.min(120, Math.max(10, b.cam.fov)) : 45 } : null;
  return { value: { author, text, level: str(b.level, 40) || null, at, cam } };
}

/**
 * req  = {method, parts: [] (segmenti dopo /api/share), token, editKey, text: async () => string, length}
 * deps = {store: {get(k), put(k, v, ttlSeconds), del(k)}, now, hit(kind) → {ok, reason}, bot(token) → bool, enabled, botRequired}
 */
export async function handleShare(req, deps) {
  const { store } = deps, now = deps.now || Date.now(), [id, sub, cid] = req.parts;
  if (deps.enabled === false) return err(503, "share_disabled", "la condivisione non è attiva su questo server");
  const readJSON = async () => { if (req.length > SHARE.maxBytes + 4096) throw err(413, "too_large", "progetto troppo grande per la condivisione (massimo 1,5 MB)"); const t = await req.text(); if (t.length > SHARE.maxBytes + 4096) throw err(413, "too_large", "progetto troppo grande per la condivisione (massimo 1,5 MB)"); try { return JSON.parse(t); } catch { throw err(400, "invalid_json", "JSON non valido"); } };
  const load = async () => { if (!ID_RE.test(id || "")) return null; const r = await store.get(`share:${id}`); return r ? JSON.parse(r) : null; };
  const comments = async () => { const c = await store.get(`sc:${id}`); return c ? JSON.parse(c) : []; };
  const ttlOf = rec => Math.max(60, Math.floor((Date.parse(rec.expires_at) - now) / 1000));
  const owner = async rec => TOKEN_RE.test(req.token || "") && (await sha256hex(req.token)) === rec.tokenHash;
  const editor = async rec => rec.mode === "edit" && !!rec.editHash && TOKEN_RE.test(req.editKey || "") && (await sha256hex(req.editKey)) === rec.editHash;
  const proposalMeta = async () => { const r = await store.get(`sp:${id}`); if (!r) return null; const { project, ...m } = JSON.parse(r); return m; };
  try {
    if (!id) {
      if (req.method !== "POST") return err(405, "method_not_allowed", "usa POST /api/share");
      const b = await readJSON(), bad = validateProject(b.project); if (bad) return err(400, "invalid_project", bad);
      const json = JSON.stringify(b.project); if (json.length > SHARE.maxBytes) return err(413, "too_large", "progetto troppo grande per la condivisione (massimo 1,5 MB): togli i modelli importati pesanti");
      if (deps.botRequired && !(await deps.bot(b.turnstile))) return err(403, "bot_check_failed", "verifica anti-bot non superata");
      const h = await deps.hit("share"); if (!h.ok) return err(429, h.reason || "quota_exceeded", h.reason === "global_quota_exceeded" ? "limite giornaliero del servizio raggiunto, riprova domani" : `puoi creare ${SHARE.perIpDaily} link al giorno`);
      const sid = newShareId(), token = newToken(), edit = b.edit === true, editKey = edit ? newToken() : null;
      const rec = { id: sid, name: str(b.name, 120) || "Progetto", project: b.project, mode: edit ? "edit" : "view", created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), expires_at: new Date(now + SHARE.ttlDays * 86400e3).toISOString(), tokenHash: await sha256hex(token), ...(edit ? { editHash: await sha256hex(editKey) } : {}) };
      await store.put(`share:${sid}`, JSON.stringify(rec), SHARE.ttlDays * 86400);
      return ok(201, { id: sid, token, expires_at: rec.expires_at, mode: rec.mode, ...(edit ? { edit_key: editKey } : {}) });
    }
    const rec = await load(); if (!rec) return err(404, "not_found", "link inesistente o scaduto");
    if (!sub) {
      if (req.method === "GET") { const { tokenHash, editHash, ...pub } = rec; return ok(200, { ...pub, mode: rec.mode || "view", comments: await comments(), proposal: await proposalMeta() }); }
      if (!(await owner(rec))) return err(403, "forbidden", "serve il token di chi ha creato il link");
      if (req.method === "PUT") { const b = await readJSON(), bad = validateProject(b.project); if (bad) return err(400, "invalid_project", bad); if (JSON.stringify(b.project).length > SHARE.maxBytes) return err(413, "too_large", "progetto troppo grande per la condivisione");
        const h = await deps.hit("share"); if (!h.ok) return err(429, h.reason || "quota_exceeded", "limite giornaliero di aggiornamenti raggiunto");
        rec.project = b.project; if (b.name) rec.name = str(b.name, 120); rec.updated_at = new Date(now).toISOString(); await store.put(`share:${id}`, JSON.stringify(rec), ttlOf(rec)); return ok(200, { id, updated_at: rec.updated_at, expires_at: rec.expires_at }); }
      if (req.method === "DELETE") { await store.del(`share:${id}`); await store.del(`sc:${id}`); await store.del(`sp:${id}`); return ok(204, null); }
      return err(405, "method_not_allowed", "metodo non supportato");
    }
    if (sub === "accesso") {
      if (req.method !== "POST") return err(405, "method_not_allowed", "usa POST");
      if (!(await owner(rec))) return err(403, "forbidden", "serve il token di chi ha creato il link");
      const b = await readJSON(), edit = b.edit === true, editKey = edit ? newToken() : null;
      rec.mode = edit ? "edit" : "view"; if (edit) rec.editHash = await sha256hex(editKey); else delete rec.editHash;
      await store.put(`share:${id}`, JSON.stringify(rec), ttlOf(rec));
      return ok(200, { mode: rec.mode, ...(edit ? { edit_key: editKey } : {}) });
    }
    if (sub === "proposta") {
      if (cid) return err(404, "not_found", "endpoint inesistente");
      if (req.method === "POST") {
        if (!(await editor(rec))) return err(403, "forbidden", rec.mode === "edit" ? "chiave di modifica non valida: chiedi un link nuovo al progettista" : "questo link è in sola lettura");
        const b = await readJSON(), bad = validateProject(b.project); if (bad) return err(400, "invalid_project", bad);
        const json = JSON.stringify(b.project); if (json.length > SHARE.maxBytes) return err(413, "too_large", "progetto troppo grande per la condivisione (massimo 1,5 MB)");
        if (deps.botRequired && !(await deps.bot(b.turnstile))) return err(403, "bot_check_failed", "verifica anti-bot non superata");
        const h = await deps.hit("proposal"); if (!h.ok) return err(429, h.reason || "quota_exceeded", "troppi invii oggi: riprova domani");
        const p = { author: str(b.author, SHARE.authorMax) || "Cliente", note: str(b.note, SHARE.noteMax), created_at: new Date(now).toISOString(), base_updated_at: rec.updated_at, project: b.project };
        await store.put(`sp:${id}`, JSON.stringify(p), ttlOf(rec));
        const { project, ...meta } = p; return ok(201, meta);
      }
      if (!(await owner(rec))) return err(403, "forbidden", "serve il token di chi ha creato il link");
      if (req.method === "GET") { const r = await store.get(`sp:${id}`); return r ? ok(200, JSON.parse(r)) : err(404, "not_found", "nessuna proposta"); }
      if (req.method === "DELETE") { await store.del(`sp:${id}`); return ok(204, null); }
      return err(405, "method_not_allowed", "metodo non supportato");
    }
    if (sub !== "comments") return err(404, "not_found", "endpoint inesistente");
    if (!cid) {
      if (req.method === "GET") return ok(200, { comments: await comments() });
      if (req.method !== "POST") return err(405, "method_not_allowed", "usa POST");
      const b = await readJSON(), c = validateComment(b); if (c.error) return err(400, "invalid_comment", c.error);
      if (deps.botRequired && !(await deps.bot(b.turnstile))) return err(403, "bot_check_failed", "verifica anti-bot non superata");
      const list = await comments(); if (list.length >= SHARE.maxComments) return err(409, "too_many_comments", "troppi commenti su questo progetto");
      const h = await deps.hit("comment"); if (!h.ok) return err(429, h.reason || "quota_exceeded", "troppi commenti oggi da questo indirizzo");
      const item = { id: newShareId(10), ...c.value, resolved: false, created_at: new Date(now).toISOString() }; list.push(item);
      await store.put(`sc:${id}`, JSON.stringify(list), ttlOf(rec)); return ok(201, item);
    }
    if (!CID_RE.test(cid)) return err(400, "invalid_id", "id del commento non valido");
    if (!(await owner(rec))) return err(403, "forbidden", "serve il token di chi ha creato il link");
    const list = await comments(), i = list.findIndex(c => c.id === cid); if (i < 0) return err(404, "not_found", "commento inesistente");
    if (req.method === "PATCH") { const b = await readJSON(); list[i].resolved = b.resolved === true; await store.put(`sc:${id}`, JSON.stringify(list), ttlOf(rec)); return ok(200, list[i]); }
    if (req.method === "DELETE") { list.splice(i, 1); await store.put(`sc:${id}`, JSON.stringify(list), ttlOf(rec)); return ok(204, null); }
    return err(405, "method_not_allowed", "metodo non supportato");
  } catch (e) { if (e && e.status) return e; throw e; }
}
