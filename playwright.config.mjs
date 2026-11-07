// Test di prova nel browser (Chromium headless con WebGL software).
// npm run test:e2e  — avvia da sé il servizio locale (editor + /api/render di prova).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  // ogni prova ha il suo contesto del browser: si possono eseguire in parallelo (CI: 4 processori)
  fullyParallel: true,
  workers: process.env.CI ? 3 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8787",
    viewport: { width: 1440, height: 860 },
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    screenshot: "only-on-failure",
  },
  webServer: { command: "node server/mock-render-server.mjs", url: "http://127.0.0.1:8787/", reuseExistingServer: !process.env.CI, timeout: 20_000, env: { PER_HOUR: "1000" } },
});
