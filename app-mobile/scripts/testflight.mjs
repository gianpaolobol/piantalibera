// Dopo l'invio: attende che Apple elabori la build e la rende installabile dal titolare su TestFlight.
// Gruppo interno «Proprietario» (accesso a tutte le build) con gli utenti App Store Connect con ruolo
// Account Holder o Admin. Gli indirizzi e-mail sono mascherati nei log (repository pubblico).
import { createPrivateKey, sign } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";
const { ASC_APP_ID: APP, ASC_KEY_ID: KID, ASC_ISSUER: ISS, RUNNER_TEMP, GITHUB_STEP_SUMMARY } = process.env;
const p8 = await readFile(RUNNER_TEMP + "/asc.p8", "utf8");
const b64 = x => Buffer.from(JSON.stringify(x)).toString("base64url");
function jwt(){ const now = Math.floor(Date.now() / 1000), h = b64({ alg: "ES256", kid: KID, typ: "JWT" }) + "." + b64({ iss: ISS, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" });
  const t = h + "." + sign("sha256", Buffer.from(h), { key: createPrivateKey(p8), dsaEncoding: "ieee-p1363" }).toString("base64url"); console.log("::add-mask::" + t); return t; }
const asc = async (path, method = "GET", body) => { const r = await fetch("https://api.appstoreconnect.apple.com" + path, { method, headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = r.status === 204 ? {} : await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; };
// 1. attesa dell'elaborazione (fino a 30 minuti)
let build = null;
for (let i = 0; i < 60; i++){
  build = (await asc(`/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=1`)).j.data?.[0];
  const st = build?.attributes?.processingState; console.log("build", build?.attributes?.version || "—", st || "non ancora visibile");
  if (st === "VALID" || st === "FAILED" || st === "INVALID") break;
  await new Promise(r => setTimeout(r, 30000));
}
if (build?.attributes?.processingState !== "VALID") { console.log("::warning::Apple non ha ancora finito di elaborare la build: rilanciare «invia» più tardi per il gruppo di test"); process.exit(0); }
// 2. gruppo interno del titolare
let group = ((await asc(`/v1/apps/${APP}/betaGroups?limit=50`)).j.data || []).find(g => g.attributes.name === "Proprietario");
if (!group) { const r = await asc("/v1/betaGroups", "POST", { data: { type: "betaGroups", attributes: { name: "Proprietario", isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: "apps", id: APP } } } } }); console.log("gruppo interno:", r.status, JSON.stringify(r.j.errors?.map(e => e.detail) || "creato").slice(0, 300)); group = r.j.data; }
// 3. titolare e amministratori come tester interni
const users = ((await asc("/v1/users?limit=50")).j.data || []).filter(u => (u.attributes.roles || []).some(r => r === "ACCOUNT_HOLDER" || r === "ADMIN"));
for (const u of users){
  const email = u.attributes.username || u.attributes.email; if (!email) continue; console.log("::add-mask::" + email);
  const r = await asc("/v1/betaTesters", "POST", { data: { type: "betaTesters", attributes: { email, firstName: u.attributes.firstName || "", lastName: u.attributes.lastName || "" }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } } } });
  console.log("tester interno (" + (u.attributes.roles || []).join("/") + "):", r.ok ? "aggiunto" : r.status + " " + JSON.stringify(r.j.errors?.map(e => e.code)).slice(0, 200));
}
await appendFile(GITHUB_STEP_SUMMARY, `\nBuild ${build.attributes.version} pronta su TestFlight, gruppo interno «Proprietario» (${users.length} tester). Installa con l'app TestFlight sull'iPhone.\n`).catch(() => {});
