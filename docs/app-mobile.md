# Pianta Libera su telefono e tablet

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

## App negli store (Capacitor, cartella `app-mobile/`)

L'app nativa apre il sito pubblicato in una finestra nativa (`server.url` in `app-mobile/capacitor.config.json`), con i plugin Filesystem e Share per salvare e condividere i file esportati. Gli aggiornamenti dell'editor arrivano senza ripubblicare l'app.

Il workflow **App per telefono e tablet** (`.github/workflows/app-mobile.yml`) a ogni modifica di `app-mobile/`:

- **Android**: costruisce un APK di prova, scaricabile dagli artefatti del workflow e installabile sul telefono (consentire l'installazione da origini sconosciute);
- **iOS**: compila il progetto per il simulatore, per verificare che sia a posto.

In locale: `cd app-mobile && npm ci && node prepara.mjs android` (oppure `ios`, su un Mac con Xcode), poi `npx cap open android|ios`.

### Cosa serve per pubblicare negli store (a cura del proprietario)

- **Google Play**: account Google Play Console (25 $ una tantum), chiave di firma; il workflow andrà esteso per produrre l'AAB firmato (segreti: solo nomi, es. `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`).
- **App Store**: Apple Developer Program (99 $ l'anno), certificato e profilo di distribuzione; la firma si può fare in CI su macOS con i segreti di Apple.
- Apple può rifiutare app che sono «solo un sito» (linea guida 4.2): a favore di Pianta Libera giocano l'uso senza rete, il salvataggio e la condivisione nativi dei file e l'editor 3D completo; se servisse, si può includere l'editor nell'app invece di aprire il sito.

Identificativo dell'app: `it.gianpaolofranceschini.piantalibera`.
