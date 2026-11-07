# Pianta Libera

Web app per modellare architettura in pianta e in 3D (interni ed esterni) e ottenere render fotorealistici **a partire dalla scena modellata**.

## Prova

- Demo statica (dopo il primo deploy su `main`): https://gianpaolobol.github.io/piantalibera/ — la scheda Render AI qui non ha backend e lo dice.
- In locale con il servizio di render di prova:

```bash
npm install
npm run dev        # http://localhost:8787/
```

## Cosa fa

- **Pianta di precisione**: muri a spessore (anche ad arco), stanze in un gesto, porte e finestre di vari modelli con persiane e tapparelle, più piani, quote, aggancio configurabile, selezione multipla, copia/incolla, menu contestuale, misure digitate, locale automatico, scorciatoie.
- **3D in tempo reale**: cielo HDRI, ombre, occlusione ambientale, selezione e trascinamento nel 3D, visita a piedi, camere salvate, metro, tagli, luci artificiali, sole da luogo, data e ora.
- **Architettura**: pennello dei materiali per lato del muro, posa dei pavimenti, battiscopa, controsoffitti, scale parametriche con foro nel solaio, ringhiere, tetti piani, a due falde, a padiglione e a una falda.
- **Librerie**: ~65 arredi, luci, scale, verde e persone con anteprima, Poly Haven (CC0), libreria personale.
- **Import**: DWG, DXF, PDF, immagini (con pianta + prospetti → 3D automatico), modelli DAE (SketchUp) / OBJ / glTF / FBX / 3DS / STL.
- **Export**: tavole tecniche PDF/SVG/DXF con computo, IFC4, GLB e OBJ per D5 Render, 3MF/STL con anteprima di stampa, PNG 4K, panorama 360°, video, progetto JSON.
- **Render AI** tramite `/api/render`: vista + profondità + contorni + camera, modalità fedele o creativa, ritocco con maschera, coda di render, galleria nel progetto.
- **Cliente**: link in sola lettura con commenti puntati in pianta (`/api/share`).
- **Progetti**: raccolta nel browser con salvataggio automatico.

## Struttura

| Percorso | |
|---|---|
| `editor-src/` | sorgenti dell'editor (moduli JS concatenati da `scripts/build-editor.mjs`) |
| `public/` | sito pronto: `index.html` generato + `assets/` |
| `shared/contract.js`, `shared/share.js` | contratto `/api/render` e logica di `/api/share`, comuni a Worker e server locale |
| `worker/` | Worker Cloudflare: asset statici + API con Workers AI (FLUX.2 klein 4B), KV, Durable Object per le quote |
| `server/local-server.mjs` | server locale (motore di prova o ComfyUI sulla GPU) |
| `server/php/api/` | backend alternativo per hosting PHP condiviso (solo render) |
| `tests/` | test del Worker, del server locale e del motore pianta → 3D (node:test) e dell'editor (Playwright) |

Documenti: [editor](docs/editor.md) · [confronto interfaccia e roadmap](docs/interfaccia-confronto.md) · [contratto API](docs/api-render-contract.md) · [deploy Cloudflare](docs/deploy-cloudflare.md) · [uso in locale](docs/installazione-locale.md) · [privacy (bozza)](docs/privacy.md) · [crediti asset](docs/editor-crediti-asset.md).

## Comandi

| | |
|---|---|
| `npm run dev` | editor + API di prova su http://localhost:8787/ |
| `npm run build:editor` | rigenera `public/index.html` da `editor-src/` |
| `npm run build` | controlla che `public/index.html` sia aggiornato |
| `npm test` | test del Worker, del server locale e test nel browser |
| `npm run deploy:cloudflare` | pubblica su Cloudflare (vedi docs) |
| `npm run sri` | ricalcola le impronte SRI delle librerie (quando cambia una versione) |
| `npm run lint:globali` | controlla che i moduli dell'editor non ridefiniscano gli stessi nomi globali |

## Sicurezza

Nessuna chiave nel client o nel repository. La pagina ha una Content Security Policy (solo lo script dell'editor, riconosciuto per impronta, e le librerie dai CDN previsti, ciascuna con impronta SRI). Il render passa solo dal backend, con quote per IP, tetto giornaliero, kill switch, limiti di formato e dimensione e cancellazione dei file. I progetti aperti da file, link o browser vengono ripuliti prima dell'uso (identificativi, numeri, indirizzi esterni). I render generativi possono alterare dettagli: non sono elaborati tecnici.

Il prototipo React iniziale è archiviato nel branch `archivio/prototipo-react`.

## Telefono, tablet e app

Disposizione compatta per telefono e tablet, gesti a tocco, installabile come app (PWA) e progetto Capacitor per Android e iOS: [docs/app-mobile.md](docs/app-mobile.md).

## Uso in locale

Pacchetto sempre aggiornato (funziona senza internet; usa la GPU del computer tramite il browser e, per il render AI, ComfyUI in locale):
https://github.com/gianpaolobol/piantalibera/releases/download/locale-latest/pianta-libera-locale.zip — guida: [docs/installazione-locale.md](docs/installazione-locale.md).

## Privacy e termini

[Informativa privacy](public/privacy.html) e [termini d'uso](public/termini.html), raggiungibili dall'editor (pulsante «Info», pannelli Render AI e Condividi). Note tecniche in [docs/privacy.md](docs/privacy.md).

## Licenza

Pianta Libera è software libero: [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). Puoi usarlo, studiarlo, modificarlo e ridistribuirlo; chi lo offre in rete in versione modificata deve mettere a disposizione degli utenti il proprio codice sorgente (l'editor lo indica nel pulsante «Info»). Le librerie incluse mantengono le proprie licenze (three.js MIT, dxf-parser MIT, pdf.js Apache-2.0, web-ifc MPL-2.0, libredwg-web GPL-3.0); il modello di render FLUX.2 klein 4B è Apache-2.0.
