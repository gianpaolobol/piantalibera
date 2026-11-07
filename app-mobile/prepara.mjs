// Crea il progetto nativo (Android o iOS) con Capacitor e vi copia le icone di Pianta Libera.
// Uso: npm ci && node prepara.mjs android|ios   (in CI: .github/workflows/app-mobile.yml)
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const os = process.argv[2];
if (!["android", "ios"].includes(os)) { console.error("uso: node prepara.mjs android|ios"); process.exit(1); }
if (!existsSync(os)) execSync(`npx cap add ${os}`, { stdio: "inherit" });
execSync(`npx cap sync ${os}`, { stdio: "inherit" });
if (os === "android") {
  const res = "android/app/src/main/res";
  for (const d of readdirSync("risorse/android")) cpSync(join("risorse/android", d), join(res, d), { recursive: true });
  writeFileSync(join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F6F62</color>\n</resources>\n`);
} else {
  cpSync("risorse/ios/AppIcon-512@2x.png", "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
}
console.log(`progetto ${os} pronto`);
