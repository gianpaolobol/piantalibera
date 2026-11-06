// Prove del backend PHP (server/php/api/render.php) con il server integrato di PHP.
// Si saltano da sole se php non è installato. Esegui con: npm run test:php
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hasPhp = spawnSync("php", ["-v"]).status === 0;
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const servers = [];
async function start(port, env){
  const data = mkdtempSync(join(tmpdir(), "pl-php-"));
  const p = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", "server/php"], { env: { ...process.env, PL_DATA_DIR: data, ...env }, stdio: "ignore" });
  servers.push({ p, data });
  for (let i = 0; i < 50; i++){ try { await fetch(`http://127.0.0.1:${port}/api/render.php?config=1`); return `http://127.0.0.1:${port}/api/render.php`; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error("php -S non parte");
}
after(() => { for (const s of servers){ s.p.kill(); rmSync(s.data, { recursive: true, force: true }); } });
const body = (over = {}) => JSON.stringify({ mode: "fedele", prompt: "casa", image: PNG1, consent: true, params: { width: 512, height: 512 }, ...over });
const post = (u, b, h = {}) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: b });

test("PHP in modalità prova: consenso, quote, immagini e cancellazione", { skip: !hasPhp }, async () => {
  const u = await start(8791, { PL_PROVIDER_MODE: "mock", PL_PER_IP_DAILY: "2" });
  const cfg = await (await fetch(u + "?config=1")).json();
  assert.equal(cfg.enabled, true); assert.equal(cfg.mock, true); assert.equal(cfg.quota.per_ip_daily, 2);
  assert.equal((await (await post(u, body({ consent: false }))).json()).error.code, "consent_required");
  const r = await post(u, body()); assert.equal(r.status, 200); assert.equal(r.headers.get("x-quota-remaining"), "1");
  const j = await r.json(); assert.equal(j.status, "succeeded"); assert.equal(j.generated, false);
  const img = await fetch(`http://127.0.0.1:8791${j.images[0]}`); assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal((await post(u, body())).status, 200);
  const third = await post(u, body()); assert.equal(third.status, 429); assert.equal((await third.json()).error.code, "quota_exceeded");
  assert.equal((await post(u, body(), { Origin: "https://altro.example" })).status, 403);
  assert.equal((await fetch(`${u}?id=${j.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${u}?id=${j.id}`)).status, 404);
});

test("PHP con fornitore reale: fail-closed senza sale, Turnstile o URL https", { skip: !hasPhp }, async () => {
  const u = await start(8792, { PL_PROVIDER_MODE: "forward", PL_PROVIDER_URL: "http://insicuro.example", PL_IP_SALT: "cambia-questo-valore" });
  const cfg = await (await fetch(u + "?config=1")).json();
  assert.equal(cfg.enabled, false); assert.equal(cfg.reason, "config_incomplete");
  const r = await post(u, body()); assert.equal(r.status, 503); assert.equal((await r.json()).error.code, "config_incomplete");
});
