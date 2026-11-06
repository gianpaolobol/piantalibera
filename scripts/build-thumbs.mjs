// Genera le anteprime della libreria interna in public/assets/anteprime/<ref>.webp
// usando lo stesso motore dell'editor (renderThumb) in Chromium headless.
// Uso: npm run build:anteprime   (in locale senza rete: PL_LOCAL_THREE=<cartella three@0.147.0>)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/assets/anteprime");
const PORT = 8799, LOCAL = process.env.PL_LOCAL_THREE;
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [join(root, "server/mock-render-server.mjs")], { env: { ...process.env, MOCK_PORT: String(PORT) }, stdio: "ignore" });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  if (LOCAL) await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => {
    const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]);
    return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort();
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
  for (let i = 0; i < 40; i++){ try { await page.goto(`http://localhost:${PORT}/`); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  await page.waitForFunction(() => typeof renderThumb === "function" && typeof P !== "undefined" && P);
  const refs = await page.evaluate(() => LIB.filter(x => !x.ref.startsWith("pers_")).map(x => x.ref));
  let n = 0;
  for (const ref of refs){
    const url = await page.evaluate(async ref => {
      const it = LIBMAP[ref];
      if (it.load && TPL[ref]?.status !== "ok"){ await loadTpl(ref, true); if (TPL[ref]?.status !== "ok") return null; }
      const o = objTemplate({ kind: "lib", ref }); return o ? renderThumb(o) : null;
    }, ref);
    if (!url || !url.startsWith("data:image/webp")){ console.warn("saltato:", ref); continue; }
    writeFileSync(join(out, ref + ".webp"), Buffer.from(url.split(",")[1], "base64")); n++;
  }
  console.log(`${n}/${refs.length} anteprime in public/assets/anteprime/`);
} finally { await browser.close(); server.kill(); }
