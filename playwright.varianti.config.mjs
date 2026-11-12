// Prova delle varianti: lo stesso percorso (tests/varianti) su Chromium, Firefox e WebKit e sui profili
// di computer, iPhone, iPad e Android. Uso: npx playwright test -c playwright.varianti.config.mjs
// (in CI: workflow «Varianti»). PROGETTI=webkit-iphone,firefox-computer limita i progetti.
import { defineConfig, devices } from "@playwright/test";

const gl = { launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } };
const all = [
  { name: "chromium-computer", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...gl } },
  { name: "chromium-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 }, ...gl } },
  { name: "firefox-computer", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
  { name: "webkit-mac", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  { name: "webkit-iphone", use: { ...devices["iPhone 13 Mini"] } },
  { name: "webkit-ipad-verticale", use: { ...devices["iPad (gen 7)"] } },
  { name: "webkit-ipad-orizzontale", use: { ...devices["iPad (gen 7) landscape"] } },
  { name: "chromium-android", use: { ...devices["Pixel 7"], ...gl } },
  { name: "chromium-android-tablet", use: { ...devices["Galaxy Tab S4"], ...gl } },
];
const only = (process.env.PROGETTI || "").split(",").filter(Boolean);

export default defineConfig({
  testDir: "tests/varianti",
  timeout: 240_000,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8787", serviceWorkers: "block" },
  projects: only.length ? all.filter(p => only.includes(p.name)) : all,
  webServer: { command: "node server/mock-render-server.mjs", url: "http://127.0.0.1:8787/", reuseExistingServer: !process.env.CI, timeout: 20_000, env: { PER_HOUR: "1000" } },
});
