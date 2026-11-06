# Editor 3D di Pianta Libera — stato e architettura

Branch `feature/editor-3d-render-api` · aggiornato il 6 novembre 2026 da Claude.

## Dove si trova

| Percorso | Contenuto |
|---|---|
| `editor-src/` | sorgenti dell'editor divisi per modulo (vedi sotto) |
| `scripts/build-editor.mjs` | assembla `public/index.html` (con `--check` verifica che sia aggiornato) |
| `public/` | sito pronto: `index.html` + `assets/`; si carica così com'è su qualsiasi hosting statico |
| `shared/contract.js` | validazione del contratto, usata dal Worker e dal servizio di prova |
| `worker/` | Worker Cloudflare (asset + `/api/render` con Workers AI) |
| `server/mock-render-server.mjs` | servizio di prova del contratto `/api/render` (+ file statici di `public/`) |
| `server/php/api/` | backend PHP alternativo per hosting condiviso |
| `docs/api-render-contract.md` | contratto API |

Avvio: `npm install` → `npm run dev` → apri `http://localhost:8787/`.

## Moduli (`editor-src/`)

| File | Ruolo |
|---|---|
| `head.html` | struttura della pagina e stile (temi chiaro/scuro) |
| `01-base.js` | utilità, catalogo materiali (procedurali + texture fotografiche), cache materiali, asset |
| `02-lib.js` | libreria: alberi procedurali per specie, sagome di persone, ~55 arredi parametrici e realistici, libreria personale |
| `03-model.js` | scena Three.js, cieli HDRI, occlusione ambientale, costruzione del modello dai dati di pianta, pass per l'AI (vista, profondità, contorni, materiali) |
| `04-plan.js` | pianta 2D: disegno, aggancio, selezione, trascinamento, undo/redo |
| `05-ui.js` | ispettore, piani, schede |
| `06-online.js` | Poly Haven (modelli, HDRI, texture CC0) e libreria personale |
| `07-io.js` | esportazioni (GLB, OBJ+MTL, 3MF/STL, DXF, PNG, pacchetto AI, JSON) e importazioni (DXF, PDF, immagini, DAE/OBJ/glTF/FBX/3DS/STL anche in .zip con texture) |
| `08-ai.js` | client render: modalità base e avanzata, adattatore configurabile, polling, confronto prima/dopo |
| `09-init.js` | progetto di esempio, migrazione dello schema, avvio |

Tecnologie: JavaScript senza framework, Three.js r147 (build UMD da jsDelivr, versioni fissate), fflate, dxf-parser e pdf.js caricati su richiesta.

## Funzioni

- Pianta 2D con muri a spessore, stanze rettangolari con muri in un gesto, pavimenti a poligono, porte e finestre parametriche, più piani, coperture piane e a due falde, quote, aggancio, inserimento di misure da tastiera, undo/redo.
- 3D in tempo reale: cielo HDRI, ombre morbide, texture in scala reale, soffitti, viste preimpostate (esterno, volo d'uccello, interno, dall'alto), sezione orizzontale, qualità alta con SSAO.
- Libreria: soggiorno, pranzo, cucina, camera, studio, bagno, esterni, verde (quercia, tiglio, betulla, olivo, cipresso, pino, palma, arbusti, siepe) e sagome di persone; 4 modelli realistici CC0/CC-BY; Poly Haven; libreria personale (`assets/personale/indice.json`).
- Import da SketchUp tramite COLLADA con texture: i materiali entrano nella libreria del progetto e si applicano a muri, pavimenti e coperture.
- Export: GLB e OBJ per D5 Render (un oggetto per materiale, nomi leggibili), 3MF/STL per la stampa 3D in scala con parete minima, basamento e piani separati, DXF della pianta, PNG, pacchetto AI, progetto JSON (schema versione 2 con migrazione dalla 1).
- Render AI: preset «Backend Pianta Libera» sul contratto `/api/render` (vista + profondità + contorni + camera), modalità fedele/creativo, polling dei lavori, galleria con confronto. Preset diretti verso servizi esterni solo per prove locali.

## Decisioni del proprietario (6/11/2026)

1. **L'editor è la pagina principale.** Il prototipo React/R3F è archiviato nel branch `archivio/prototipo-react` (i tag non sono pubblicabili da questa sessione).
2. **Fornitore per i test: Cloudflare Workers AI, FLUX.2 klein 4B**, tramite il Worker in `worker/`. Le immagini di riferimento (vista, profondità, contorni) vanno a 512 px; l'uscita è configurabile fino a 1920 px.
3. **Produzione su Cloudflare** (asset statici + Worker + KV). Il backend PHP resta come alternativa per stampa3dbologna.com.
4. **Repository pubblico.**

Scelte tecniche che restano diverse dalla bozza iniziale: editor in JavaScript senza framework con Three.js r147 UMD da CDN (r148+ ha tolto `examples/js`; il passaggio a moduli ES è possibile più avanti). Nessuna persona realistica inclusa: le scansioni gratuite non sono ridistribuibili, si aggiungono dalla libreria personale.

## Collaudo eseguito

- `npm run build` (controllo che `public/index.html` corrisponda ai sorgenti).
- `npm run test:unit`: 13 test del Worker e del contratto con AI, KV e asset finti (multipart verso klein, guide facoltative, quote per IP e globali, kill switch, origini, lato massimo 512 px senza consumo di quota, errore del modello, Turnstile, cancellazione).
- `npm run test:e2e`: 7 test Playwright (apertura senza errori, stanza + undo/redo, persistenza, esportazioni DXF/3MF/GLB, render contro il servizio di prova con controllo del corpo inviato, errore 503 mostrato, telefono 400 px). Gli stessi test girano in CI.
- **Non provati**: Workers AI reale (serve l'account Cloudflare), Poly Haven dal vivo, file SketchUp reale, D5 Render e slicer.
