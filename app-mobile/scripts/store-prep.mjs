// Prepara la pubblicazione di Pianta Libera con l'account Expo e il team Apple già usati per Fungo Italia
// (autorizzazione del titolare, 7/11/2026). Nessun segreto nel repository: la chiave App Store Connect è letta
// da Expo con EXPO_TOKEN, scritta solo nella cartella temporanea del runner e mascherata nei log (repo pubblico).
// Uso (in app-mobile/, dal workflow store.yml): node scripts/store-prep.mjs
// Fasi: credenziale App Store Connect da Expo → bundle ID e app su App Store Connect → progetto Expo → build/invio.
import { createPrivateKey, sign } from "node:crypto";
import { writeFile, readFile, rename, appendFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const ACCOUNT = "gianpaolobol", TEAM = "BX9MDXAHKG", BUNDLE = "it.piantalibera.app", NAME = "Pianta Libera", SKU = "pianta-libera-ios";
const OUT = process.env.GITHUB_OUTPUT, SUM = process.env.GITHUB_STEP_SUMMARY;
const mask = v => { if (v) for (const l of String(v).split(/\r?\n/)) if (l.trim()) console.log("::add-mask::" + l); };
const summary = t => appendFile(SUM, t + "\n").catch(() => {});
async function graph(query, variables = {}) {
  const r = await fetch("https://api.expo.dev/graphql", { method: "POST", headers: { Authorization: "Bearer " + process.env.EXPO_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (!r.ok || j.errors?.length) throw Error("Expo: " + JSON.stringify(j.errors || r.status).slice(0, 400)); return j.data;
}
mask(process.env.EXPO_TOKEN);
// 1. chiave App Store Connect salvata in Expo per il team (la stessa usata da Fungo Italia)
// la chiave può stare nell'account personale o nel team Expo: si cercano tutti gli account del token
const me = await graph("query{meActor{accounts{name}}}");
const accounts = me.meActor.accounts.map(a => a.name);
let keys = [], keyAccount = "";
for (const n of accounts){
  const d = await graph("query($n:String!){account{byName(accountName:$n){appStoreConnectApiKeysPaginated(first:50){edges{node{id keyIdentifier appleTeam{appleTeamIdentifier appleTeamType}}}}}}}", { n });
  const all = d.account.byName.appStoreConnectApiKeysPaginated.edges.map(e => e.node);
  console.log(`account Expo ${n}: ${all.length} chiavi App Store Connect, team ${[...new Set(all.map(k => k.appleTeam?.appleTeamIdentifier || "?"))].join(", ") || "—"}`);
  const mine = all.filter(k => k.appleTeam?.appleTeamIdentifier === TEAM); if (mine.length && !keys.length){ keys = mine; keyAccount = n; }
}
const sel = keys.find(k => k.keyIdentifier === "35MS8YN74G") || keys[0]; mask(sel?.keyIdentifier); if (!sel) throw Error("Nessuna chiave App Store Connect per il team " + TEAM + " negli account " + accounts.join(", "));
console.log("chiave App Store Connect trovata nell'account Expo " + keyAccount);
const key = (await graph("query($id:ID!){appStoreConnectApiKey{byId(id:$id){keyIdentifier issuerIdentifier keyP8}}}", { id: sel.id })).appStoreConnectApiKey.byId;
mask(key.keyP8); mask(key.issuerIdentifier); mask(key.keyIdentifier);
const p8 = process.env.RUNNER_TEMP + "/asc.p8"; await writeFile(p8, key.keyP8, { mode: 0o600 });
const teamType = sel.appleTeam?.appleTeamType || "";
// 2. App Store Connect: bundle ID e app
const b64 = x => Buffer.from(JSON.stringify(x)).toString("base64url"), now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "ES256", kid: key.keyIdentifier, typ: "JWT" }) + "." + b64({ iss: key.issuerIdentifier, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" });
const jwt = head + "." + sign("sha256", Buffer.from(head), { key: createPrivateKey(key.keyP8), dsaEncoding: "ieee-p1363" }).toString("base64url"); mask(jwt);
const asc = async (path, method = "GET", body) => { const r = await fetch("https://api.appstoreconnect.apple.com" + path, { method, headers: { Authorization: "Bearer " + jwt, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = r.status === 204 ? {} : await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; };
let bid = (await asc(`/v1/bundleIds?filter[identifier]=${BUNDLE}`)).j.data?.find(b => b.attributes.identifier === BUNDLE);
if (!bid) { const r = await asc("/v1/bundleIds", "POST", { data: { type: "bundleIds", attributes: { identifier: BUNDLE, name: NAME, platform: "IOS" } } }); console.log("bundle ID:", r.status, JSON.stringify(r.j.errors || "creato").slice(0, 300)); bid = r.j.data; }
let app = (await asc(`/v1/apps?filter[bundleId]=${BUNDLE}`)).j.data?.[0];
if (!app) { const r = await asc("/v1/apps", "POST", { data: { type: "apps", attributes: { name: NAME, primaryLocale: "it", sku: SKU, bundleId: BUNDLE } } }); console.log("creazione app App Store Connect:", r.status, JSON.stringify(r.j.errors?.map(e => e.detail) || "creata").slice(0, 400)); app = r.ok ? r.j.data : null; }
const ascAppId = app?.id || "";
console.log("App Store Connect:", ascAppId ? `app ${ascAppId}` : "app non presente (va creata dal sito App Store Connect)");
// 3. progetto Expo
let projectId = "";
try { const p = await graph("query($n:String!){app{byFullName(fullName:$n){id}}}", { n: `@${ACCOUNT}/pianta-libera` }); projectId = p.app.byFullName.id; } catch {}
if (!projectId) {
  await rename("app.config.js", process.env.RUNNER_TEMP + "/app.config.js");
  execSync("npx -y eas-cli@24.8.0 init --non-interactive --force", { stdio: "inherit" });
  projectId = JSON.parse(await readFile("app.json", "utf8")).expo.extra?.eas?.projectId || "";
  await rename(process.env.RUNNER_TEMP + "/app.config.js", "app.config.js");
}
console.log("Progetto Expo:", projectId);
// 4. credenziali per l'invio nel solo checkout temporaneo
const eas = JSON.parse(await readFile("eas.json", "utf8"));
Object.assign(eas.submit.production.ios, { ascApiKeyPath: p8, ascApiKeyId: key.keyIdentifier, ascApiKeyIssuerId: key.issuerIdentifier, ...(ascAppId ? { ascAppId } : {}) });
await writeFile("eas.json", JSON.stringify(eas, null, 2) + "\n");
key.keyP8 = "";
await appendFile(OUT, `project_id=${projectId}\nasc_app_id=${ascAppId}\nteam_type=${teamType}\nkey_id=${key.keyIdentifier}\nissuer=${key.issuerIdentifier}\np8=${p8}\n`);
await summary(`### Pianta Libera — store\n\n- Progetto Expo: \`${projectId}\`\n- App Store Connect: ${ascAppId ? "app `" + ascAppId + "`" : "**app da creare** (bundle `" + BUNDLE + "`)"}\n- Bundle ID: ${bid ? "presente" : "non creato"}\n`);
