# Pianta Libera: telefono, tablet, computer e store

## Come si usa

Sotto i 900 px di larghezza (telefono, tablet in verticale) e sui telefoni in orizzontale l'editor passa alla **disposizione compatta**:

- una vista per volta (Pianta o 3D) a tutto schermo; la pagina non scorre mai, così il dito muove solo la vista;
- gli strumenti stanno in una striscia orizzontale sotto la vista (si scorre di lato);
- il pannello (Proprietà, Elenco, Importa, Esporta, Render AI) è una **scheda che sale dal basso**: toccare una scheda la apre a metà, la maniglia la porta a quasi tutto schermo o la richiude; dentro scorre da sola;
- Annulla, Ripristina e «+ Piano» diventano icone; il nome del progetto si cambia da **Progetti**.

Gesti (pianta e 3D):

| Gesto | Effetto |
|---|---|
| un dito | sposta la vista (in 3D la gira) |
| tocco | seleziona; tocco sul vuoto deseleziona |
| trascinare un elemento **già selezionato** | lo sposta (i locali si modificano dai vertici) |
| due dita | zoom e spostamento |
| tocco lungo | menu dell'elemento |

Sui tablet in orizzontale resta la disposizione completa (pannello a destra), senza scorrimento della pagina.

Le esportazioni su telefono e tablet aprono il pannello di condivisione del sistema (Salva su File, Drive, AirDrop…) quando il browser lo consente; altrimenti il file si scarica come al computer.

## Installarla come app (subito, gratis) — computer, telefono e tablet

L'editor è una **PWA**: `public/manifest.webmanifest`, icone in `public/assets/app/`, service worker `public/sw.js` (dopo la prima visita si apre anche senza rete; `/api/*` non passa mai dalla cache).

- **iPhone e iPad** (Safari): Condividi → **Aggiungi alla schermata Home**.
- **Android** (Chrome): menu ⋮ → **Installa app** (o il banner che compare da solo).
- **Windows e Mac** con Chrome o Edge: icona di installazione nella barra degli indirizzi, oppure il pulsante **Installa come app** nel riquadro «Info» dell'editor. Si apre in una finestra sua, con l'icona nel menu Start / nel Launchpad e nel Dock.
- **Mac con Safari** (macOS 14 o successivo): menu File → **Aggiungi al Dock**.

Il riquadro «Info» dell'editor mostra il pulsante o le istruzioni giuste per il dispositivo in uso.

Per l'uso **senza internet** su Windows, Mac e Linux c'è anche il pacchetto locale (`docs/installazione-locale.md`), con avvio a doppio clic.

Più avanti, se servisse la presenza negli store dei computer: Microsoft Store accetta le PWA (pacchetto generabile con PWABuilder); per il Mac App Store la strada è un'app nativa (Capacitor/Tauri) con l'account Apple Developer.

## Dove si scarica

Pagina di download: **`scarica.html`** sul sito (e sulla demo GitHub Pages), collegata dal riquadro «Info» dell'editor. I file stanno nella release GitHub **`app-latest`**, ricostruita a ogni modifica di `app-desktop/` o `app-mobile/` dal workflow **App per Windows, Mac e Android** (`.github/workflows/app.yml`):

| File | Cosa |
|---|---|
| `Pianta-Libera-Windows-x64.exe`, `…-arm64.exe` | installer per Windows 10/11 |
| `Pianta-Libera-Mac.dmg` | Mac universale (Intel e Apple Silicon) |
| `Pianta-Libera-Android.apk` | app Android installabile direttamente (firma di prova, non per il Play Store) |
| `SHA256SUMS.txt` | impronte per verificare i file |

## Programmi per Windows e Mac (`app-desktop/`, Electron)

Finestra propria che apre l'editor pubblicato (aggiornamenti senza reinstallare; senza rete dopo la prima apertura grazie al service worker). Le esportazioni chiedono dove salvare. Sicurezza: nessun accesso di Node alla pagina, navigazione limitata al sito, link esterni nel browser.

In locale: `cd app-desktop && npm ci && npm start` (oppure `npm run dist:win` / `dist:mac`).

**Firma**: gli installer oggi non sono firmati, quindi Windows (SmartScreen) e macOS (Gatekeeper) mostrano un avviso la prima volta; `scarica.html` spiega come procedere. Per toglierlo:
- Mac: certificato **Developer ID Application** del team Apple `BX9MDXAHKG` e notarizzazione (con la chiave App Store Connect già in Expo); segreti previsti, solo nomi: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`.
- Windows: certificato di firma del codice (anche Azure Trusted Signing); segreti `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.

## App per iPhone, iPad e Android (`app-mobile/`, Expo — stessa procedura di Fungo Italia)

Expo SDK 58 (stesse versioni di Fungo Italia) con `react-native-webview` che apre l'editor pubblicato. Aggiunge ciò che una pagina non fa da sola: salvataggio e condivisione dei file esportati (`expo-file-system` + `expo-sharing`, l'editor li passa con `ReactNativeWebView.postMessage`), tasto Indietro di Android, link esterni nel browser, schermata chiara senza rete.

- ID: `it.piantalibera.app` (iOS e Android). Account Expo `gianpaolobol`, team Apple `BX9MDXAHKG`.
- `eas.json`: profili `preview` (APK, simulatore) e `production` (store, numero di build automatico); invio iOS a TestFlight, Android al canale **internal** in bozza — come Fungo Italia.
- Workflow **Store (TestFlight e Google Play)** (`.github/workflows/store.yml`, avvio manuale): `app-mobile/scripts/store-prep.mjs` legge da Expo la chiave App Store Connect del team (con `EXPO_TOKEN`, solo nella cartella temporanea, mascherata nei log), registra il bundle ID, cerca o prova a creare l'app su App Store Connect e il progetto Expo; poi build firmata su Expo e, se richiesto, invio a TestFlight.

### Passi del titolare (una volta sola)

1. **EXPO_TOKEN**: su expo.dev → Account settings → Access tokens → crea un token; poi GitHub → piantalibera → Settings → Secrets and variables → Actions → New repository secret `EXPO_TOKEN`. (È lo stesso tipo di segreto già usato in Fungo Italia; i segreti non si copiano tra repository.)
2. Avviare **Store** con `ios`: la prima volta crea il progetto Expo e indica l'ID da salvare come variabile del repository `EXPO_PROJECT_ID`.
3. **App Store Connect**: creare l'app «Pianta Libera» con bundle `it.piantalibera.app` (Apple non permette di crearla via API) e salvare il suo ID numerico come variabile `ASC_APP_ID`. La chiave App Store Connect e il certificato di distribuzione di Fungo Italia valgono per tutto il team: Expo crea da sé il profilo per la nuova app.
4. **Google Play Console**: creare l'app con pacchetto `it.piantalibera.app`, caricare a mano il primo AAB (Google lo richiede; si scarica da Expo dopo la build `android`), collegare in Expo l'account di servizio per gli invii successivi.
5. Da lì in poi: Actions → Store → piattaforma → Run workflow.

Note: Apple può rifiutare app che sono «solo un sito» (linea guida 4.2); a favore: editor 3D completo, uso senza rete, salvataggio e condivisione nativi dei file. Se servisse, l'editor si può includere nell'app invece di aprire il sito.
