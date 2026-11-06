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
| `045-plan-pro.js` | pianta di precisione: selezione multipla, appunti, rotazione/specchio, quote, snap, menu contestuale, barra di stato, piani a schede, aiuto |
| `05-ui.js` | ispettore, piani, schede |
| `06-online.js` | Poly Haven (modelli, HDRI, texture CC0) e libreria personale |
| `07-io.js` | esportazioni (GLB, OBJ+MTL, 3MF/STL, DXF, PNG, pacchetto AI, JSON) e importazioni (DWG, DXF, PDF, immagini, DAE/OBJ/glTF/FBX/3DS/STL anche in .zip con texture) |
| `075-auto3d.js` | motore «pianta + prospetti → 3D», funzioni pure testate in `tests/auto3d.test.mjs` |
| `076-auto3d-ui.js` | pannello «Da pianta e prospetti al 3D» nella scheda Importa |
| `08-ai.js` | client render: modalità base e avanzata, adattatore configurabile, polling, confronto prima/dopo |
| `09-init.js` | progetto di esempio, migrazione dello schema, avvio |

Tecnologie: JavaScript senza framework, Three.js r147 (build UMD da jsDelivr, versioni fissate), fflate, dxf-parser e pdf.js caricati su richiesta.

## Funzioni

- Pianta 2D con muri a spessore, stanze rettangolari con muri in un gesto, pavimenti a poligono, porte e finestre parametriche, più piani, coperture piane e a due falde, quote, aggancio, inserimento di misure da tastiera, undo/redo.
- 3D in tempo reale: cielo HDRI, ombre morbide, texture in scala reale, soffitti, viste preimpostate (esterno, volo d'uccello, interno, dall'alto), sezione orizzontale, qualità alta con SSAO.
- Libreria con anteprima di ogni oggetto (`public/assets/anteprime/*.webp`, rigenerabili con `npm run build:anteprime`; per la libreria personale l'anteprima si disegna nel browser), ricerca per nome e scheda dell'oggetto selezionato.
- **Da pianta e prospetti al 3D** (DWG o DXF, anche una tavola unica): vedi sotto.
- Libreria: soggiorno, pranzo, cucina, camera, studio, bagno, esterni, verde (quercia, tiglio, betulla, olivo, cipresso, pino, palma, arbusti, siepe) e sagome di persone; 4 modelli realistici CC0/CC-BY; Poly Haven; libreria personale (`assets/personale/indice.json`).
- Import da SketchUp tramite COLLADA con texture: i materiali entrano nella libreria del progetto e si applicano a muri, pavimenti e coperture.
- Export: GLB e OBJ per D5 Render (un oggetto per materiale, nomi leggibili), 3MF/STL per la stampa 3D in scala con parete minima, basamento e piani separati, DXF della pianta, PNG, pacchetto AI, progetto JSON (schema versione 2 con migrazione dalla 1).
- Render AI: preset «Backend Pianta Libera» sul contratto `/api/render` (vista + profondità + contorni + camera), modalità fedele/creativo, polling dei lavori, galleria con confronto. Preset diretti verso servizi esterni solo per prove locali.

## Pianta di precisione (fase 1 della roadmap d'interfaccia)

- **Selezione**: clic, Maiusc+clic per aggiungere/togliere, trascinamento nel vuoto = selezione a riquadro (su touch sposta la vista), Ctrl+A. Più elementi si spostano insieme trascinandone uno o con le frecce (Maiusc ×10); i muri non selezionati collegati seguono.
- **Modifica**: Ctrl+C / Ctrl+V (incolla al cursore) / Ctrl+D, `[` e `]` ruotano di ∓90°, Specchia, Canc. Maniglie sull'oggetto selezionato: cerchio = rotazione a passi di 15° (Alt libera), quadrato = scala. Mentre si trascina un oggetto compaiono le distanze libere dai muri nelle quattro direzioni.
- **Menu col tasto destro** (il trascinamento col destro sposta ancora la vista): proprietà, copia, duplica, incolla qui, ruota, specchia, dividi il muro, inverti apertura, elimina; nel vuoto: crea il locale, seleziona tutto, inquadra.
- **Quote** (strumento Q): due punti e la distanza; selezionabili, modificabili (lunghezza, distanza), salvate nel progetto (`P.dims`). «Quote» nella barra di stato mostra la lunghezza di tutti i muri.
- **Disegno muri**: lunghezza digitata, Tab per l'angolo (gradi, antiorario da est), Invio; la linea può essere l'asse o uno dei due fili (gli spigoli si ricalcolano); stanza rettangolare con misure interne, in asse o esterne; «Orto» blocca i muri a 90°; dividere un muro dal menu.
- **Aggancio** (barra di stato): griglia (1–25 cm), estremi di muri e locali, punti medi, lungo i muri, linee guida di allineamento; preferenze salvate nel browser.
- **Locale automatico**: doppio clic nel vuoto dentro muri chiusi (bordo agganciato alle facce dei muri).
- **Piani a schede** sopra la pianta, piano inferiore in trasparenza; doppio clic su un elemento apre le proprietà; `?` mostra tutte le scorciatoie.

Restano della fase 1: muri ad arco, tabella dei livelli, etichette dei locali spostabili con area lorda/netta, unità di misura a scelta.

## Da pianta e prospetti al 3D

Scheda Importa → «Da pianta e prospetti al 3D». Si caricano uno o più file DWG/DXF; i disegni della tavola vengono separati per vicinanza e riconosciuti dalle etichette («PIANTA…», «PROSPETTO SUD…»), dal nome del file o dal contenuto. Ogni disegno ha un'anteprima e un ruolo modificabile.

- **Muri**: coppie di linee parallele a distanza tra 5 e 70 cm; restano solo gli spessori ricorrenti nel disegno (istogramma pesato sulla lunghezza) e i muri collegati agli altri. Le estremità si allungano fino all'asse del muro che incontrano.
- **Aperture**: vuoti tra 45 cm e 3,2 m lungo un muro; porta se c'è un arco di raggio compatibile, finestra se nel vuoto ci sono linee del vetro.
- **Locali**: aree chiuse dai muri (raster a 5 cm), con il nome scritto dentro; pavimento scelto dal nome (bagno/cucina → gres, terrazzo → pietra, garage → cemento).
- **Prospetti** (sud, nord, est, ovest): altezza di gronda, aperture come rettangoli (telai interni e persiane scartati) con davanzale e altezza, copertura a due falde (timpano o falda vista di lato) o piana, sporto. Le aperture si abbinano a quelle della pianta per posizione lungo la facciata; quelle che mancano in pianta vengono aggiunte. Unità diverse (cm/mm) si correggono da sole.
- Quote, testi, campiture e arredi vengono esclusi per nome del layer; l'elenco dei layer resta modificabile.
- DWG: lettore libredwg compilato in WebAssembly (`@mlightcad/libredwg-web@0.8.2`, GPL-3.0), scaricato da jsDelivr solo quando serve (~11 MB). Alcuni DWG vecchi non si leggono: in quel caso si salva come DXF.

Limiti noti: un solo piano per volta (con gronda oltre 4,6 m l'app avvisa che i solai intermedi vanno aggiunti); coperture a padiglione e muri curvi non riconosciuti; pianta con il nord in alto. Va collaudato su tavole reali.

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
