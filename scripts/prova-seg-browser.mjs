// Prova nel browser vero (GitHub Actions): l'editor carica transformers.js dal CDN con la sua CSP, scarica
// SegFormer e segmenta una foto reale; stampa stato, tempi, spigoli ed eventuali violazioni della CSP.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const srv = spawn(process.execPath, ["server/local-server.mjs"], { env: { ...process.env, PORT: "8799" }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 1500));
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };
const j = await (await fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=Category:Living_rooms_in_the_United_States&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024", { headers: UA })).json();
const f = Object.values(j.query.pages).filter(p => p.imageinfo?.[0]?.mime === "image/jpeg" && p.imageinfo[0].width > p.imageinfo[0].height)[3];
const img = "data:image/jpeg;base64," + Buffer.from(await (await fetch(f.imageinfo[0].thumburl, { headers: UA })).arrayBuffer()).toString("base64");
const b = await chromium.launch(), p = await b.newPage(), csp = [];
p.on("console", m => { if (/Content Security Policy|Refused/i.test(m.text())) csp.push(m.text().slice(0, 300)); });
p.on("pageerror", e => csp.push("errore: " + e.message));
await p.goto("http://127.0.0.1:8799/?nosw"); await p.waitForFunction(() => typeof f3Segment === "function");
const t0 = Date.now();
const r = await p.evaluate(async src => { Object.assign(F3, { img: src, thumb: src, w: 1024, h: 768, seg: null }); await f3Segment(); const s = F3.seg; return { state: s.state, err: s.err, quad: s.quad, labels: s.labels }; }, img);
console.log(`segmentazione nel browser: ${r.state} in ${((Date.now() - t0) / 1000).toFixed(1)} s (primo caricamento, modello compreso)`, r.err || "");
console.log("spigoli:", JSON.stringify(r.quad)); console.log("classi:", (r.labels || []).join(", "));
const t1 = Date.now(); await p.evaluate(async () => { F3.seg = null; await f3Segment(); }); console.log(`seconda foto (modello in cache): ${((Date.now() - t1) / 1000).toFixed(1)} s`);
console.log("CSP/errori:", csp.length ? csp.join(" | ") : "nessuno");
await b.close(); srv.kill();
process.exit(r.state === "ok" && !csp.length ? 0 : 1);
