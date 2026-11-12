// Misura degli indicatori di docs/livelli-qualita.md: npx playwright test -c playwright.livelli.config.mjs
// Scrive test-results/livelli.json. Le prove non falliscono per un valore sotto il livello: misurano.
import base from "./playwright.config.mjs";
export default { ...base, testDir: "tests/livelli", workers: 1, retries: 0, reporter: "list" };
