// Pianta Libera per Windows e Mac (Electron).
// Apre l'editor pubblicato in una finestra sua: gli aggiornamenti arrivano senza reinstallare, e dopo la
// prima apertura funziona anche senza rete (service worker del sito). Sicurezza: nessun accesso di Node
// alla pagina, navigazione limitata al sito, collegamenti esterni nel browser di sistema.
const { app, BrowserWindow, shell, Menu, session } = require("electron");
const path = require("node:path");

const SITE = process.env.PIANTA_LIBERA_URL || "https://pianta-libera.gianpaolo-franceschini.workers.dev/";
const ORIGIN = new URL(SITE).origin;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 720, minHeight: 520,
    title: "Pianta Libera", backgroundColor: "#e9ece8", show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once("ready-to-show", () => win.show());
  const ua = win.webContents.getUserAgent();
  win.webContents.setUserAgent(`${ua} PiantaLiberaDesktop/${app.getVersion()}`);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"), { query: { url: url || SITE } }); });
  win.loadURL(SITE);
  return win;
}

app.whenReady().then(() => {
  // i file esportati (PDF, DXF, GLB…) chiedono dove salvarli, come nei programmi desktop
  session.defaultSession.on("will-download", (_e, item) => { item.setSaveDialogOptions({ title: "Salva", defaultPath: item.getFilename() }); });
  // nessun permesso oltre a quelli che servono all'editor
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(["clipboard-sanitized-write", "fullscreen"].includes(perm)));
  if (process.platform === "darwin") Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]));
  else Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
