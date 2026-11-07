// Prove sul sito pubblicato e misura della fedeltà geometrica del render AI (requisito P4).
// Gira nel workflow «Prove dal vivo»: BASE = indirizzo del sito, TEST_TOKEN = token temporaneo
// (creato e cancellato dal workflow), FEDELTA = "0" per saltare i render.
//
// Fedeltà: per ogni scena si confrontano i contorni del modello (linee nere del pass «contorni»)
// con i contorni rilevati nell'immagine generata (Sobel). Recall = quota dei contorni del modello
// ritrovati nel render entro 3 px; precisione = quota dei contorni del render che stanno su un
// contorno del modello; F1 = media armonica. Riferimenti: la vista 3D stessa (massimo atteso) e il
// render di un'altra scena (minimo atteso, geometria sbagliata).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE || "https://pianta-libera.gianpaolo-franceschini.workers.dev").replace(/\/+$/, "") + "/";
const TOKEN = process.env.TEST_TOKEN || "", FEDELTA = process.env.FEDELTA !== "0", SEEDS = Number(process.env.SEEDS || 3);
const OUT = process.env.OUT || "prove-dal-vivo"; mkdirSync(OUT, { recursive: true });
const report = { base: BASE, when: new Date().toISOString(), checks: [], scenes: [], errors: [] };
const check = (name, ok, detail = "") => { report.checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log(`${ok ? "ok " : "NO "} ${name}${detail ? " — " + detail : ""}`); };
const dataUrlToFile = (d, f) => writeFileSync(join(OUT, f), Buffer.from(d.split(",")[1], "base64"));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// solo per provare lo script senza rete: PL_LOCAL_THREE=<cartella three@0.147.0>
if (process.env.PL_LOCAL_THREE) { await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => { const p = join(process.env.PL_LOCAL_THREE, r.request().url().split("three@0.147.0/")[1]); return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort(); }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" })); }
const page = await ctx.newPage(), csp = [];
page.on("pageerror", e => report.errors.push("pagina: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) report.errors.push("console: " + m.text().slice(0, 200)); });
await page.addInitScript(() => document.addEventListener("securitypolicyviolation", e => (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI}`)));
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "load" });
await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function", null, { timeout: 60_000 });
check("l'editor si apre", true, `${((Date.now() - t0) / 1000).toFixed(1)} s fino all'editor pronto`);
await page.waitForTimeout(4000);
const cfg = await page.evaluate(async () => (await fetch("api/config", { cache: "no-store" })).json());
check("/api/config: render attivo", cfg.enabled === true, `${cfg.model} · ${cfg.quota?.per_ip_daily} render per IP`);
check("/api/config: condivisione attiva", cfg.share?.enabled === true, JSON.stringify(cfg.share));
check("Turnstile configurato", !!cfg.turnstile_site_key);
const cspNow = await page.evaluate(() => window.__csp || []); check("nessuna violazione della CSP", !cspNow.length, cspNow.join("; "));
const base3d = await page.evaluate(() => { let n = 0; modelGroup.traverse(o => { if (o.isMesh) n++; }); return n; }); check("modello 3D costruito", base3d > 10, `${base3d} mesh`);

// richieste protette dal token delle prove
const api = (path, init = {}) => page.evaluate(async ([path, init, tok]) => { const r = await fetch(path, { ...init, headers: { ...(init.headers || {}), "X-Test-Token": tok } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: j ? "" : t.slice(0, 200) }; }, [path, init, TOKEN]);

// ---- condivisione con il cliente, sul sito vero
if (TOKEN) {
  const proj = await page.evaluate(() => sharePayload());
  const c = await api("api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Prova automatica", project: proj }) });
  check("crea un link per il cliente", c.status === 201, `HTTP ${c.status} ${c.body?.error?.message || ""}`);
  if (c.status === 201) {
    const { id, token } = c.body;
    const v = await ctx.newPage(); v.on("pageerror", e => report.errors.push("cliente: " + e.message));
    await v.goto(BASE + "?condividi=" + id); await v.waitForFunction(() => S.viewer && P?.walls?.length > 0, null, { timeout: 60_000 }).catch(() => {});
    const seen = await v.evaluate(() => ({ viewer: !!S.viewer, walls: P.walls.length, err: S.viewer?.error || null })).catch(e => ({ err: e.message }));
    check("il cliente apre il link in sola lettura", seen.viewer && seen.walls === proj.walls.length && !seen.err, JSON.stringify(seen));
    const cm = await api(`api/share/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ author: "Prova", text: "commento automatico", at: [3, 3], level: proj.levels[0].id }) });
    check("il cliente lascia un commento", cm.status === 201, `HTTP ${cm.status}`);
    const del = await page.evaluate(async ([id, token]) => (await fetch(`api/share/${id}`, { method: "DELETE", headers: { "X-Share-Token": token } })).status, [id, token]);
    check("il progettista elimina il link", del === 204, `HTTP ${del}`);
    const gone = await api(`api/share/${id}`); check("il link eliminato non si apre più", gone.status === 404, `HTTP ${gone.status}`);
    await v.close();
  }
}

// ---- fedeltà geometrica del render AI
const SCENES = [
  { id: "esterno", nome: "Esterno a altezza d'uomo", setup: () => { P = sampleProject(); P.pid = "prova"; S.level = "L0"; refresh(); camPreset("ext"); } },
  { id: "volo", nome: "Volo d'uccello", setup: () => { camPreset("bird"); } },
  { id: "interno", nome: "Interno arredato (soggiorno)", setup: () => { setSel([]); camPreset("int"); } },
  { id: "due-piani", nome: "Due piani, tetto a padiglione", setup: () => { S.show3d = "all"; const L0 = P.levels[0], L1 = { id: "L1", name: "Piano 1", elev: L0.elev + L0.height + .25, height: L0.height, slab: .25, roof: { type: "hip", pitch: 24, overhang: .6, mat: "tegole" }, underlay: null }; L0.roof = { ...L0.roof, type: "none" };
      for (const w of P.walls.filter(w => w.level === "L0" && w.thick >= .25)) P.walls.push({ ...w, id: uid(), level: "L1", a: w.a.slice(), b: w.b.slice() }); P.levels.push(L1); P.rooms.push({ id: uid(), level: "L1", name: "Notte", mat: "parquet", pts: [[.15, .15], [10.85, .15], [10.85, 7.85], [.15, 7.85]] }); refresh(); camPreset("ext"); } },
  { id: "sera", nome: "Esterno al tramonto", setup: () => { P = sampleProject(); P.pid = "prova"; S.level = "L0"; P.sky = { kind: "asset", id: "tramonto" }; P.sun = { az: 260, el: 8 }; refresh(); applySky(); camPreset("ext"); } },
];
async function renderScene(sc, seed) {
  return page.evaluate(async ([tok, seed]) => {
    const cfg = { ...aiConfig(), renderMode: "fedele", guides: true };
    const vars = await buildVars(cfg, false); vars.seed = seed; vars.consent = true; vars.turnstile = "";
    const body = JSON.parse(fillTemplate(cfg.template, vars)); body.consent = true; body.turnstile = ""; if (body.params) body.params.seed = seed;
    const t = performance.now();
    const r = await fetch("api/render", { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Token": tok }, body: JSON.stringify(body) });
    let job = await r.json(); const ms = performance.now() - t;
    if (!r.ok) return { error: `HTTP ${r.status}: ${job?.error?.message || ""}` };
    for (let i = 0; job.status !== "succeeded" && job.status !== "failed" && i < 60; i++){ await new Promise(z => setTimeout(z, 2000)); job = await (await fetch("api/render/" + job.id)).json(); }
    if (job.status !== "succeeded") return { error: "lavoro " + job.status + " " + (job.error?.message || "") };
    const blob = await (await fetch(job.images[0])).blob(), out = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    return { ms: Math.round(ms), neurons: job.neurons_estimated, out, vista: vars.image_dataurl, quota: r.headers.get("x-quota-remaining") };
  }, [TOKEN, seed]);
}
/* misura nel browser: contorni del modello vs contorni dell'immagine */
async function fidelity(imgUrl) {
  return page.evaluate(async src => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const ref = linesCanvas(1, { longSide: 512 }), W = ref.width, H = ref.height;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, gray = new Float32Array(W * H); for (let i = 0; i < W * H; i++) gray[i] = .299 * px[i*4] + .587 * px[i*4+1] + .114 * px[i*4+2];
    const mag = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){ const k = y * W + x, gx = gray[k-W+1] + 2*gray[k+1] + gray[k+W+1] - gray[k-W-1] - 2*gray[k-1] - gray[k+W-1], gy = gray[k+W-1] + 2*gray[k+W] + gray[k+W+1] - gray[k-W-1] - 2*gray[k-W] - gray[k-W+1]; mag[k] = Math.hypot(gx, gy); }
    const rg = ref.getContext("2d").getImageData(0, 0, W, H).data, R = new Uint8Array(W * H); let nr = 0; for (let i = 0; i < W * H; i++) if (rg[i*4] < 128){ R[i] = 1; nr++; }
    const sorted = Array.from(mag).sort((a, b) => b - a), thr = Math.max(40, sorted[Math.floor(sorted.length * Math.min(.25, Math.max(.04, nr / (W * H) * 1.5)))]);
    const E = new Uint8Array(W * H); let ne = 0; for (let i = 0; i < W * H; i++) if (mag[i] >= thr){ E[i] = 1; ne++; }
    const integral = M => { const S = new Uint32Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++){ let row = 0; for (let x = 0; x < W; x++){ row += M[y*W+x]; S[(y+1)*(W+1)+x+1] = S[y*(W+1)+x+1] + row; } } return S; };
    const near = (S, x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1); return S[y1*(W+1)+x1] - S[y0*(W+1)+x1] - S[y1*(W+1)+x0] + S[y0*(W+1)+x0] > 0; };
    const SE = integral(E), SR = integral(R); let hitR = 0, hitE = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){ const k = y*W+x; if (R[k] && near(SE, x, y, 3)) hitR++; if (E[k] && near(SR, x, y, 3)) hitE++; }
    const recall = nr ? hitR / nr : 0, precision = ne ? hitE / ne : 0, f1 = recall + precision ? 2 * recall * precision / (recall + precision) : 0;
    // sovrapposizione: render con i contorni del modello in rosso
    const o = document.createElement("canvas"); o.width = W; o.height = H; const og = o.getContext("2d"); og.drawImage(im, 0, 0, W, H); const od = og.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) if (R[i]){ od.data[i*4] = 230; od.data[i*4+1] = 30; od.data[i*4+2] = 30; } og.putImageData(od, 0, 0);
    return { recall:+recall.toFixed(3), precision:+precision.toFixed(3), f1:+f1.toFixed(3), overlay:o.toDataURL("image/png") };
  }, imgUrl);
}
if (FEDELTA && TOKEN) {
  let prev = null;
  for (const sc of SCENES) {
    await page.evaluate(`(${sc.setup.toString()})()`); await page.waitForTimeout(2500);
    const row = { id: sc.id, nome: sc.nome, renders: [] };
    const vistaUrl = await page.evaluate(() => renderAt(1, null, { longSide: 512, hq: true }).toDataURL("image/png"));
    row.max = (await fidelity(vistaUrl)).f1;                                   // la vista 3D contro i propri contorni
    for (let s = 0; s < SEEDS; s++) {
      const r = await renderScene(sc, 1000 + s * 7919);
      if (r.error) { row.renders.push({ error: r.error }); console.log(`NO ${sc.id} #${s + 1}: ${r.error}`); if (/429/.test(r.error)) break; continue; }
      const f = await fidelity(r.out);
      dataUrlToFile(r.out, `${sc.id}-${s + 1}-render.png`); dataUrlToFile(f.overlay, `${sc.id}-${s + 1}-contorni.png`); if (s === 0) dataUrlToFile(r.vista, `${sc.id}-vista.png`);
      row.renders.push({ seed: 1000 + s * 7919, ms: r.ms, neurons: r.neurons, recall: f.recall, precision: f.precision, f1: f.f1 });
      console.log(`   ${sc.id} #${s + 1}: F1 ${f.f1} (recall ${f.recall}, precisione ${f.precision}) in ${(r.ms / 1000).toFixed(1)} s, ~${r.neurons} Neurons`);
      if (s === 0 && prev) row.min = (await fidelity(prev)).f1;               // render di un'altra scena: geometria sbagliata
      if (s === 0) row._first = r.out;
    }
    prev = row._first || prev; delete row._first; report.scenes.push(row);
  }
}
report.errors = [...new Set(report.errors)];
writeFileSync(join(OUT, "rapporto.json"), JSON.stringify(report, null, 2));
// riepilogo leggibile (anche nella pagina del workflow)
const ok = report.checks.filter(c => c.ok).length;
let md = `## Prove dal vivo · ${report.when.slice(0, 16).replace("T", " ")} UTC\n\n${ok}/${report.checks.length} controlli superati su ${BASE}\n\n| Controllo | Esito | Dettaglio |\n|---|---|---|\n${report.checks.map(c => `| ${c.name} | ${c.ok ? "ok" : "**NO**"} | ${c.detail.replace(/\|/g, "/")} |`).join("\n")}\n`;
if (report.scenes.length) {
  const all = report.scenes.flatMap(s => s.renders.filter(r => !r.error));
  const mean = k => all.length ? (all.reduce((a, r) => a + r[k], 0) / all.length) : 0;
  md += `\n### Fedeltà geometrica (contorni del modello ritrovati nel render, tolleranza 3 px su 512)\n\n| Scena | F1 per seed | Recall medio | Precisione media | Vista 3D (massimo) | Altra scena (minimo) | Tempo medio | Neurons stimati |\n|---|---|---|---|---|---|---|---|\n`;
  for (const s of report.scenes) { const r = s.renders.filter(x => !x.error), m = k => r.length ? (r.reduce((a, x) => a + x[k], 0) / r.length) : NaN;
    md += `| ${s.nome} | ${s.renders.map(x => x.error ? "errore" : x.f1.toFixed(2)).join(" · ")} | ${m("recall").toFixed(2)} | ${m("precision").toFixed(2)} | ${s.max?.toFixed(2) ?? "—"} | ${s.min?.toFixed(2) ?? "—"} | ${(m("ms") / 1000).toFixed(1)} s | ${Math.round(m("neurons"))} |\n`; }
  md += `\nMedia su ${all.length} render: F1 ${mean("f1").toFixed(2)}, recall ${mean("recall").toFixed(2)}, precisione ${mean("precision").toFixed(2)}; ${Math.round(mean("neurons"))} Neurons stimati per render.\n`;
}
if (report.errors.length) md += `\n### Errori nella pagina\n\n${report.errors.slice(0, 15).map(e => "- " + e.replace(/\n/g, " ")).join("\n")}\n`;
writeFileSync(join(OUT, "rapporto.md"), md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log("\n" + md);
await browser.close();
process.exit(report.checks.every(c => c.ok) ? 0 : 1);
