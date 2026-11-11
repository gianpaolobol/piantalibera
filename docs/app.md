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

- **Scansione AR (prova, solo iOS)**: modulo nativo `modules/pianta-ar/` (ARKit); la pagina riceve `window.PL_NATIVE.ar` e mostra il pulsante in «Da foto al 3D»; la scansione si condivide come zip. Dettagli in `docs/scansione-ar.md`.
- ID: `it.piantalibera.app` (iOS e Android). Account Expo `gianpaolobol`, team Apple `BX9MDXAHKG`.
- `eas.json`: profili `preview` (APK, simulatore) e `production` (store, numero di build automatico); invio iOS a TestFlight, Android al canale **internal** in bozza — come Fungo Italia.
- Workflow **Store (TestFlight e Google Play)** (`.github/workflows/store.yml`, avvio manuale): `app-mobile/scripts/store-prep.mjs` legge da Expo la chiave App Store Connect del team (con `EXPO_TOKEN`, solo nella cartella temporanea, mascherata nei log), registra il bundle ID, cerca o prova a creare l'app su App Store Connect e il progetto Expo; poi build firmata su Expo e, se richiesto, invio a TestFlight.

### Stato (7/11/2026)

- `EXPO_TOKEN` aggiunto dal titolare. Progetto Expo **@gianpaolobol/pianta-libera** (`ad42c901-150d-43ad-8506-270cbc620418`) creato dal workflow.
- Bundle ID `it.piantalibera.app` registrato su Apple Developer (team `BX9MDXAHKG`) e profilo «Pianta Libera App Store» creato con la chiave App Store Connect già in Expo.
- Prime build production 1.0.0 (2) avviate su Expo: iOS e Android (AAB). Keystore Android generato e custodito da Expo.
- **App Store Connect**: l'API di Apple non permette di creare l'app (`apps` non consente CREATE): va creata dal sito, poi «Store → invia» la manda su TestFlight.
- **Google Play**: creare l'app in Play Console e caricare a mano il primo AAB (Google lo richiede); dalle build successive l'invio può essere automatico con un account di servizio collegato in Expo.

### Workflow «Store» (Actions → Store (TestFlight e Google Play) → Run workflow)

| Azione | Cosa fa |
|---|---|
| `build` | build firmate (iOS e/o Android) su Expo; con l'app su App Store Connect, invio automatico a TestFlight |
| `invia` | manda a TestFlight l'ultima build iOS pronta |
| `stato` | elenca le build con stato, versione e (Android) link all'AAB |

Firma iOS senza passaggi interattivi: `scripts/store-prep.mjs` prende da Expo il certificato di distribuzione del team (lo stesso di Fungo Italia) e crea con l'API Apple il profilo App Store del nuovo bundle; i file stanno solo nella cartella temporanea del runner (`credentialsSource: local`, profilo EAS `production-ios-local`).

### Creare l'app su App Store Connect (una volta, dal sito)

https://appstoreconnect.apple.com/apps → **+** → Nuova app: piattaforma iOS, nome «Pianta Libera», lingua principale Italiano, bundle ID `it.piantalibera.app` (già nell'elenco), SKU `pianta-libera-ios`, accesso completo. Poi: Actions → Store → azione `invia`.

### AAB per Play Console da GitHub

Actions → **Store (TestFlight e Google Play)** → Run workflow con piattaforma `android` e azione **`aab`**: l'ultimo AAB firmato (stessa chiave di caricamento registrata in Play Console) viene pubblicato nella release GitHub **`play-latest`**, da cui si scarica per «Test interni → Crea nuova release». L'APK di `app-latest` invece ha la firma di prova e Google non lo accetta come aggiornamento.

### Google Play (una volta, dal sito)

https://play.google.com/console → Crea app: «Pianta Libera», italiano, app, gratuita → Test → Test interno → Crea release → carica l'AAB (link dall'azione `stato`).

Note: Apple può rifiutare app che sono «solo un sito» (linea guida 4.2); a favore: editor 3D completo, uso senza rete, salvataggio e condivisione nativi dei file. Se servisse, l'editor si può includere nell'app invece di aprire il sito.
