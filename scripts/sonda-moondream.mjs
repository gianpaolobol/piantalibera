// Sonda temporanea: prova formati di ingresso per Moondream su Workers AI e stampa le risposte.
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN, M = "@cf/moondream/moondream3.1-9B-A2B";
const UA = { "User-Agent": "PiantaLiberaDiagnosi/1.0 (https://github.com/gianpaolobol/piantalibera)" };
const j = await (await fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=Category:Living_rooms_in_the_United_States&gcmtype=file&gcmlimit=30&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1024", { headers: UA })).json();
const f = Object.values(j.query.pages).find(p => p.imageinfo?.[0]?.mime === "image/jpeg");
const url = f.imageinfo[0].thumburl, buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer()), data = "data:image/jpeg;base64," + buf.toString("base64");
console.log("foto", f.title, url);
async function run(input, label, raw = false) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/run/${M}`, { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const t = await r.text(); console.log(`\n## ${label}: HTTP ${r.status}\n${t.slice(0, 1200)}`);
}
await run({ task: "query", image: data, question: "List the furniture in this room." }, "query dataURL");
await run({ task: "caption", image: data, caption_length: "short" }, "caption dataURL");
await run({ task: "detect", image: data, target: "chair" }, "detect target dataURL");
await run({ task: "detect", image: url, target: "chair" }, "detect target URL");
await run({ task: "detect", image: data, object: "chair" }, "detect object");
await run({ task: "detect", image: data, prompt: "chair" }, "detect prompt");
await run({ task: "detect", image: buf.toString("base64"), target: "chair" }, "detect base64 nudo");
await run({ task: "point", image: data, target: "chair" }, "point target");
await run({ task: "detect", image: data, target: "window" }, "detect window");
