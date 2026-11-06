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

- Pianta 2D con muri a spessore, porte e finestre parametriche, più piani, coperture, quote, aggancio, undo/redo.
- 3D in tempo reale con cielo HDRI, ombre, occlusione ambientale, texture in scala reale.
- Librerie: ~55 arredi e verde (alberi per specie), sagome di persone, Poly Haven (CC0), libreria personale.
- Import: DXF, PDF, immagini, modelli DAE (SketchUp) / OBJ / glTF / FBX / 3DS / STL con materiali.
- Export: GLB e OBJ per D5 Render, 3MF/STL per stampa 3D in scala, DXF, PNG, pacchetto per l'AI, progetto JSON.
- Render AI tramite `/api/render`: vista + profondità + contorni + camera, modalità fedele o creativa, confronto prima/dopo.

## Struttura

| Percorso | |
|---|---|
| `editor-src/` | sorgenti dell'editor (moduli JS) |
| `public/` | sito pronto: `index.html` generato + `assets/` |
| `shared/contract.js` | validazione del contratto `/api/render` |
| `worker/` | Worker Cloudflare: asset statici + API con Workers AI (FLUX.2 klein 4B) |
| `server/mock-render-server.mjs` | servizio locale di prova |
| `server/php/api/` | backend alternativo per hosting PHP condiviso |
| `tests/` | test del Worker (node:test) e dell'editor (Playwright) |

Documenti: [editor](docs/editor.md) · [contratto API](docs/api-render-contract.md) · [deploy Cloudflare](docs/deploy-cloudflare.md) · [crediti asset](docs/editor-crediti-asset.md).

## Comandi

| | |
|---|---|
| `npm run dev` | editor + API di prova su http://localhost:8787/ |
| `npm run build:editor` | rigenera `public/index.html` da `editor-src/` |
| `npm run build` | controlla che `public/index.html` sia aggiornato |
| `npm test` | test del Worker e test nel browser |
| `npm run deploy:cloudflare` | pubblica su Cloudflare (vedi docs) |

## Sicurezza

Nessuna chiave nel client o nel repository. Il render passa solo dal backend, con quote per IP, tetto giornaliero, kill switch, limiti di formato e dimensione e cancellazione dei file. I render generativi possono alterare dettagli: non sono elaborati tecnici.

Il prototipo React iniziale è archiviato nel branch `archivio/prototipo-react`.

## Uso in locale

Pacchetto sempre aggiornato (funziona senza internet; usa la GPU del computer tramite il browser e, per il render AI, ComfyUI in locale):
https://github.com/gianpaolobol/piantalibera/releases/download/locale-latest/pianta-libera-locale.zip — guida: [docs/installazione-locale.md](docs/installazione-locale.md).
