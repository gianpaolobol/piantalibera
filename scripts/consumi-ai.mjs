// Consumo di Workers AI nelle ultime 48 ore, per ora e per modello (API GraphQL di Cloudflare). Stampa solo
// numeri aggregati: nessun dato dei visitatori. Uso (CI): CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.
const ACC = process.env.CLOUDFLARE_ACCOUNT_ID, TOK = process.env.CLOUDFLARE_API_TOKEN;
const gql = async (query, variables) => (await (await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) })).json());
const since = new Date(Date.now() - 48 * 3600e3).toISOString(), until = new Date().toISOString();
const q = `query($acc: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: { accountTag: $acc }) {
  aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: $since, datetime_leq: $until }, orderBy: [datetimeHour_ASC]) {
    count sum { totalNeurons } dimensions { modelId datetimeHour } } } } }`;
const r = await gql(q, { acc: ACC, since, until });
if (r.errors) {
  console.log("errori:", JSON.stringify(r.errors).slice(0, 600));
  const t = await gql(`{ __type(name: "AccountsViewer") { fields { name } } }`);
  console.log("dataset con ai:", (t.data?.__type?.fields || []).map(f => f.name).filter(n => /ai/i.test(n)).join(", "));
  process.exit(0);
}
const rows = r.data.viewer.accounts[0].aiInferenceAdaptiveGroups, byDay = {};
for (const g of rows) { const d = g.dimensions.datetimeHour.slice(0, 10), k = `${d} ${g.dimensions.modelId}`; byDay[k] ??= { n: 0, neurons: 0 }; byDay[k].n += g.count; byDay[k].neurons += g.sum.totalNeurons; }
console.log("giorno (UTC) · modello · chiamate · Neurons");
for (const [k, v] of Object.entries(byDay)) console.log(`${k} · ${v.n} · ${Math.round(v.neurons)}`);
console.log("\nper ora (ultime 24 h): " + rows.filter(g => g.dimensions.datetimeHour > new Date(Date.now() - 24 * 3600e3).toISOString()).map(g => `${g.dimensions.datetimeHour.slice(11, 13)}h ${g.dimensions.modelId.split("/").pop()} ${g.count}×/${Math.round(g.sum.totalNeurons)}`).join(" | "));
