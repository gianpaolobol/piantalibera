// Elenca i modelli di Workers AI dell'account per attività (diagnosi, nessun costo).
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/models/search?per_page=500`, { headers: { Authorization: `Bearer ${TOK}` } });
const j = await r.json(); const by = {};
for (const m of j.result || []) (by[m.task?.name || "?"] ||= []).push(m.name);
for (const [t, ms] of Object.entries(by)) if (!/Text Generation|Embeddings|Translation|Speech|Summar|Classification$/.test(t) || /Image/.test(t)) console.log(`${t}: ${ms.join(", ")}`);
console.log("attività:", Object.keys(by).join(" | "));
