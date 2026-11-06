# Editor 3D di Pianta Libera — stato e architettura

Branch `feature/editor-3d-render-api` · aggiornato il 6 novembre 2026 da Claude.

## Dove si trova

| Percorso | Contenuto |
|---|---|
| `editor-src/` | sorgenti dell'editor divisi per modulo (vedi sotto) |
| `scripts/build-editor.mjs` | assembla `public/editor/index.html` (con `--check` verifica che sia aggiornato) |
| `public/editor/` | editor pronto: pagina unica + `assets/`. Vite la copia in `dist/editor/`; si può anche caricare così com'è su un hosting statico |
| `server/mock-render-server.mjs` | servizio di prova del contratto `/api/render` (+ file statici di `public/`) |
| `server/php/api/` | backend PHP con quote per hosting condiviso |
| `docs/api-render-contract.md` | contratto API |

Avvio: `npm install` → `npm run mock` → apri `http://localhost:8787/editor/`. Con `npm run dev` Vite serve sia il prototipo React (`/`) sia l'editor (`/editor/`) e inoltra `/api` al servizio di prova.

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

## Differenze rispetto a CLAUDE.md e al prototipo React

1. **Due editor nel repository.** Il prototipo React (`src/`, `/`) resta intatto. L'editor completo è in `/editor/`. Proposta: dopo la revisione, rendere `/editor/` la pagina principale e archiviare il prototipo. Decisione del proprietario.
2. **Niente React/R3F nell'editor.** È nato come pagina statica per funzionare su hosting condiviso senza build. Funziona già con muri, aperture, piani e coperture; riscriverlo in R3F non porterebbe funzioni nuove. Se serve integrarlo in React si può montare la pagina o estrarre i moduli in ES module.
3. **Three.js r147 in UMD da CDN** contro `three@0.170` del prototipo. Le due versioni convivono perché sono pagine separate. Allinearle richiede il passaggio a moduli ES (r148+ ha rimosso `examples/js`).
4. **Backend**: fornito in PHP (sincrono, con quote) per l'hosting del proprietario, oltre al servizio di prova Node. Per Cloudflare Workers AI andrà scritto un Worker che implementi lo stesso contratto.
5. **Persone realistiche**: nessuna è inclusa perché le scansioni gratuite (RenderPeople ecc.) non sono ridistribuibili. Si aggiungono dalla libreria personale. I personaggi Mixamo provati non erano adatti.

## Collaudo eseguito

- `npm run build` (Vite) e `npm run build:editor -- --check`.
- Browser headless (Chromium, WebGL software): caricamento senza errori, disegno muri e stanze, tutte le esportazioni producono file validi, import OBJ+MTL con texture e DAE (pollici, asse Z) con materiali raccolti, tutti i 55 elementi di libreria caricabili, vista a 400 px senza scorrimento orizzontale, tema scuro.
- Render AI end-to-end contro il servizio di prova (vista + profondità + contorni + camera → lavoro → polling → galleria) e contro il backend PHP (quota per IP, rifiuto di origini estranee e input non validi, cancellazione).
- **Non provati**: un fornitore AI reale, Poly Haven dal vivo (la sandbox non lo raggiunge), un file SketchUp reale, D5 Render e uno slicer reale.
