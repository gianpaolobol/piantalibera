// Prove esplorative della revisione di novembre 2026 (docs/revisione-2026-11.md): misurano e stampano valori,
// alcune riproducono difetti aperti. Non fanno parte di `npm run test:e2e`.
// Uso: npx playwright test -c playwright.revisione.config.mjs   (serve `npm i --no-save axe-core@4` per l'accessibilità)
import base from "./playwright.config.mjs";
export default { ...base, testDir: "tests/revisione", workers: 2, retries: 0, reporter: "list" };
