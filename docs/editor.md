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
| `047-fase2.js` | muri ad arco, etichette e superfici dei locali, unità, tabella dei livelli; nel 3D selezione/trascinamento, visita a piedi, camere salvate, metro, taglio verticale; elenco oggetti; trascina dal catalogo |
| `048-fase3.js` | pennello e lati dei muri, posa dei pavimenti, battiscopa, controsoffitti, luci artificiali, sole da luogo/data/ora, modelli di porte e finestre con oscuranti, scale e ringhiere parametriche, tetti a padiglione e a una falda |
| `05-ui.js` | ispettore, piani, schede |
| `06-online.js` | Poly Haven (modelli, HDRI, texture CC0) e libreria personale |
| `07-io.js` | esportazioni (GLB, OBJ+MTL, 3MF/STL, DXF, PNG, pacchetto AI, JSON) e importazioni (DWG, DXF, PDF, immagini, DAE/OBJ/glTF/FBX/3DS/STL anche in .zip con texture) |
| `075-auto3d.js` | motore «pianta + prospetti → 3D», funzioni pure testate in `tests/auto3d.test.mjs` |
| `076-auto3d-ui.js` | pannello «Da pianta e prospetti al 3D» nella scheda Importa |
| `08-ai.js` | client render: modalità base e avanzata, adattatore configurabile, polling, confronto prima/dopo |
| `049-progetti.js` | panorama 360° con visore, immagini 4K e serie dalle camere, coda di render AI, raccolta dei progetti nel browser (IndexedDB) |
| `050-tavole.js` | tavole tecniche (registratore vettoriale, piante con quote, prospetti, sezione, cartiglio; PDF, SVG, DXF) e computo delle quantità |
| `051-condivisione.js` | link per il cliente, modalità di sola lettura, commenti in pianta |
| `052-avanguardia.js` | ritocco AI con maschera e galleria nel progetto, video, IFC4, anteprima di stampa 3D, pannello staccabile, tablet |
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

- **Quote dei muri visibili dall'inizio** (revisione 11/2026, #61): la lunghezza di tutti i muri («Quote» nella barra di stato) è accesa per impostazione; chi l'ha spenta la ritrova spenta.

- **Per iniziare** (revisione 11/2026, U12): finché non si chiude, il pannello senza selezione mostra tre punti di partenza (disegna una stanza, importa una pianta, progetto vuoto); la scelta resta nelle preferenze del browser (`PREFS.introDone`).
- **Scheda Esporta riordinata** (revisione 11/2026, #60): in cima Salva progetto, Tavole tecniche e Condividi con il cliente; sotto «Per altri programmi» D5/Blender, pacchetto AI, stampa 3D, DXF, immagini e IFC.
- **Intestazione compatta** (revisione 11/2026, #59): sul computer una sola riga (annulla e ripristina come icone, senza slogan); il suggerimento dello strumento sta sopra la barra di stato e va a capo invece di troncarsi; «Scala rif.» e «Sposta rif.» compaiono solo se il piano ha una base di ricalco; il menu «Camere…» ha sempre la sua etichetta.
- **Rapporto aeroilluminante** (revisione 11/2026): nella tabella dei locali (scheda Elenco) superficie delle finestre e delle porte vetrate sul perimetro e R.A.I. (finestre / superficie netta), con ⚠ sotto 1/8 (D.M. 5/7/1975, verifica indicativa).
- **Cartiglio con i dati dello studio** (revisione 11/2026): Esporta → Tavole tecniche, campi «Studio / progettista», «Committente» e «Luogo» (`P.tav.info`), scritti nel cartiglio di ogni foglio.
- **Progetti aperti da file** (revisione 11/2026, #56): oltre alla sanificazione dei testi e degli identificativi si correggono i valori fisici: muri più corti di 1 cm tolti, spessori e altezze non positivi riportati ai valori predefiniti, aperture con misure positive e dentro il loro muro, aperture senza muro tolte.
- **Accessibilità** (revisione 11/2026, #62): ogni campo dei pannelli prende il nome dall'etichetta visibile (`autoLabel`, anche nei pannelli ridisegnati); lista delle schede con soli figli `tab` (il pulsante «Stacca» è accanto); ordinamento annunciato sulle intestazioni di colonna; tabelle scorrevoli raggiungibili da tastiera; messaggi annunciati (`aria-live`). Prova axe (WCAG 2.2 AA) nelle prove nel browser.
- **Storia di annulla leggera** (revisione 11/2026, #55): le immagini incorporate nel progetto (texture importate, foto, basi di ricalco oltre 8 KB) si tengono una volta sola; la storia conserva solo riferimenti (`snapOf`, `fromSnap`, `historyBytes` in `04-plan.js`).
- **Senza WebGL** (revisione 11/2026, #67): se il browser non può usare la grafica 3D (PC senza accelerazione, macchine virtuali, desktop remoto) l'editor si apre lo stesso; la vista 3D mostra un messaggio con le possibili soluzioni e funzionano pianta, tavole, computo ed esportazioni. Il renderer diventa un oggetto inerte (`inertObject`, `03-model.js`); visore 360° e anteprima di stampa avvisano.

## Pianta di precisione (fase 1 della roadmap d'interfaccia)

- **Selezione**: clic, Maiusc+clic per aggiungere/togliere, trascinamento nel vuoto = selezione a riquadro (su touch sposta la vista), Ctrl+A. Più elementi si spostano insieme trascinandone uno o con le frecce (Maiusc ×10); i muri non selezionati collegati seguono.
- **Modifica**: Ctrl+C / Ctrl+V (incolla al cursore) / Ctrl+D, `[` e `]` ruotano di ∓90°, Specchia, Canc. Maniglie sull'oggetto selezionato: cerchio = rotazione a passi di 15° (Alt libera), quadrato = scala. Mentre si trascina un oggetto compaiono le distanze libere dai muri nelle quattro direzioni.
- **Menu col tasto destro** (il trascinamento col destro sposta ancora la vista): proprietà, copia, duplica, incolla qui, ruota, specchia, dividi il muro, inverti apertura, elimina; nel vuoto: crea il locale, seleziona tutto, inquadra.
- **Quote** (strumento Q): due punti e la distanza; selezionabili, modificabili (lunghezza, distanza), salvate nel progetto (`P.dims`). «Quote» nella barra di stato mostra la lunghezza di tutti i muri.
- **Disegno muri**: lunghezza digitata, Tab per l'angolo (gradi, antiorario da est), Invio; la linea può essere l'asse o uno dei due fili (gli spigoli si ricalcolano); stanza rettangolare con misure interne, in asse o esterne; «Orto» blocca i muri a 90°; dividere un muro dal menu.
- **Aggancio** (barra di stato): griglia (1–25 cm), estremi di muri e locali, punti medi, lungo i muri, linee guida di allineamento; preferenze salvate nel browser.
- **Locale automatico**: doppio clic nel vuoto dentro muri chiusi (bordo agganciato alle facce dei muri).
- **Piani a schede** sopra la pianta, piano inferiore in trasparenza; doppio clic su un elemento apre le proprietà; `?` mostra tutte le scorciatoie.

- **Da foto al 3D** (scheda Importa, `editor-src/077-foto3d.js`, `shared/photo-seg.js`): dalla foto di un interno a una bozza 3D. **Dal 10/11 misura nel dispositivo con la profondità** (`shared/photo-depth.js`): MoGe-2 ViT-S (Microsoft, MIT) in ONNX int8 (42 MB, release `modelli-v1`, servito da `public/modelli/` in due parti) con onnxruntime-web 1.22 (WebGPU o WebAssembly) stima per ogni pixel il punto 3D in metri; dal piano del pavimento si ricavano altezza e inclinazione della fotocamera, dalle normali delle pareti l'orientamento e le distanze della scatola (fondo, sinistra, destra), dal soffitto l'altezza: spigoli, scala e inclinazione senza misure dell'utente (restano modificabili). Gli arredi si collocano dai loro punti 3D (letti e tavoli al centro dei punti visti, mobili dal fronte più metà profondità). Il rilevatore D-FINE S Objects365 (transformers.js) separa gli oggetti uno per uno (sedie, mobili, comodini). Se il modello non è disponibile si torna al modello di stanza dalla segmentazione. Sui computer (puntatore fine, memoria ≥ 8 GB) segmentazione SegFormer-b5 e rilevatore a soglia .3, su telefoni e tablet SegFormer-b2 e soglia .45 (`F3_FORTE`); la cucina si riconosce anche da piano, lavello e mobili. Banco su foto vere NYU in `docs/banco-foto.md`. Pulsanti «Scatta una foto» (fotocamera) e «Scegli una foto». Insieme all'analisi del server, nel dispositivo gira la segmentazione SegFormer-b2 ADE20K (transformers.js 3.8.1, modello ~28 MB scaricato una volta): adatta alle giunzioni soffitto-parete e parete-pavimento un modello di stanza a scatola (inclinazione, rotazione, altezza della fotocamera, distanze dalle pareti e, senza EXIF, campo visivo; Nelder-Mead da 24 partenze) e propone gli spigoli della parete di fondo, anche fuori dalla foto, quando almeno il 57 % circa dei punti cade sugli spigoli del modello (riserva: spezzata a tre tratti con affidabilità ≥ 0,6); le finestre comprendono quello che si vede fuori (cielo, verde, edifici); un davanzale coperto da un arredo va a 90 cm; arredi tagliati dal bordo della foto si collocano dal bordo superiore a quota nota; tipo di arredo corretto dalle misure (divano/poltrona, tavolo/tavolino, letto singolo/matrimoniale); lampade con la base sopra l'orizzonte diventano lampadari; doppioni tra arredi grandi eliminati; le persone restano in elenco spente; le maschere danno i riquadri esatti di porte, finestre e arredi, ricompongono le aperture tagliate da un mobile, distinguono finestra e portafinestra dal pavimento sotto il davanzale; gli elementi visti solo dal modello linguistico restano in elenco ma esclusi; aperture sovrapposte sullo stesso muro vengono separate o scartate. L'AI (`/api/foto`) riconosce porte, finestre, arredi, luci, persone, materiali e luce; nella finestra di revisione si portano i quattro punti sugli spigoli della parete di fondo (con lente d'ingrandimento), si indica una misura nota (altezza del soffitto, larghezza della parete o altezza della fotocamera) e si correggono categorie e riquadri. La geometria viene dalla prospettiva: campo visivo dall'EXIF o stimato, inclinazione dalle verticali della parete, scala dalla misura; aperture proiettate sui muri, arredi sul pavimento (allineati alla parete se la toccano), lampadari sul soffitto. Crea stanza, muri, aperture, oggetti, colore delle pareti, pavimento, luci e la camera «Vista della foto», con il pulsante «Foto» per sovrapporre l'originale alla vista 3D. Non è un rilievo.
- **Etichette degli strumenti**: una parola sotto ogni icona (Seleziona, Muro, Stanza, Pavimento, Porta, Finestra, Materiali, Arredi, Quota, Scala rif., Sposta rif.); «Scala rif.» e «Sposta rif.» lavorano sulla base di ricalco importata.
- **Tipi di muro** (pannello Muro, Nuovi muri e selezione multipla): Tramezzo 8/10/12, Portante interno 30, Esterno 40+15 (cappotto) e «Altro (cm)». Ingrossando un muro esterno la faccia interna resta ferma (lato verso i locali) e gli angoli si raccordano; i tramezzi crescono sull'asse. L'ultimo tipo scelto diventa il predefinito dei muri nuovi (`editor-src/054-muri.js`).
- **Porte specchiate**: «Specchia» (pannello: «Specchia (cerniera)») inverte il lato della cerniera, «Apre dall'altro lato» il verso; in 3D l'anta sta a filo del lato verso cui apre e la maniglia è dal lato opposto alla cerniera.
- **Nuova versione**: tornando in primo piano (app per telefono, scheda aperta) l'editor confronta l'impronta dello script con quella pubblicata e propone «Aggiorna».
- **Muri ad arco**: strumento Muro, forma «Arco»: due clic per gli estremi, il terzo fissa la freccia. L'arco resta un gruppo (freccia e spessore modificabili, si seleziona intero).
- **Locali**: l'etichetta si trascina; superficie netta, lorda (fino alla mezzeria dei muri), perimetro e volume nell'ispettore; locale senza soffitto.
- **Unità** m / cm / mm nella barra di stato (quote, etichette, misure).
- **Tabella dei livelli** nella sezione Piano: nome, quota, altezza, spessore solaio modificabili in un colpo.

Fase 1 completata.

## 3D e pannelli (fase 2)

- **Nel 3D**: clic su un oggetto o muro = selezione condivisa con la pianta (Maiusc aggiunge); trascinamento di un oggetto sul suo piano con aggancio alla griglia.
- **A piedi**: W A S D o frecce (Maiusc corre), trascinare per guardarsi intorno, Esc per uscire; l'osservatore compare in pianta.
- **Camere salvate**: menu «Camere…» nella barra 3D (salva, richiama, rinomina ed elimina anche nella sezione Piano); salvate nel progetto (`P.cameras`).
- **Metro 3D**: due clic sulle superfici, distanza a schermo; «Metro» di nuovo per chiudere.
- **Vista 3D**: soffitti visibili o no, taglio verticale lungo X o Z con posizione in %.
- **Scheda Elenco**: oggetti ordinabili per colonna, nascondi/blocca, clic per selezionare; tabella dei locali con netta/lorda/perimetro e totali; esportazione CSV.
- **Catalogo**: le schede si trascinano nella pianta o nel 3D; ★ per i preferiti, «Recenti» per gli ultimi inseriti.

## Architettura (fase 3)

- **Pennello dei materiali** (B): clic su muro, pavimento, soffitto, battiscopa o copertura. Nel 3D si dipinge un lato del muro (lato A = sinistra percorrendo il muro, lato B = destra; `w.matA`, `w.matB`), in pianta il muro intero. Alt+clic o «Contagocce» preleva.
- **Locali**: posa del pavimento (modulo, rotazione 45° per la diagonale, origine; `r.tile`), battiscopa con altezza e materiale (`r.skirt`, interrotto dalle porte), controsoffitto a quota scelta e materiale del soffitto (`r.ceilH`, `r.ceilMat`), «applica a tutto il piano».
- **Luci**: categoria Luci del catalogo (faretto a incasso, sospensione, plafoniera, applique; si agganciano al soffitto o alla parete) più lampada da terra e comodino; flusso in lumen e temperatura di colore per oggetto (`o.light`); luci accese al tramonto e di notte, sempre o mai (`P.lightsMode`).
- **Sole da luogo, data e ora** (`P.site`): città o coordinate, fuso, ora legale europea, nord della pianta (ruota anche la bussola); di notte niente sole né riflessi del cielo.
- **Porte**: a battente, a due ante, a vetro, portafinestra, scorrevole esterna, a scomparsa, basculante. **Finestre**: a battente, vasistas, scorrevole, fissa; oscuranti: persiane o tapparella sul lato esterno (riconosciuto dai locali, invertibile). Simboli di pianta per ogni modello (`o.style`, `o.shut`).
- **Scale** parametriche (una rampa, a L, a U, a chiocciola): dislivello dal piano sopra, alzate, pedata, larghezza, svolta, corrimano e ringhiera a montanti o vetro, verifica 2a + p; il solaio del piano sopra e il soffitto vengono forati sull'ingombro. **Ringhiere/parapetti** a montanti, vetro o muratura (`o.p`).
- **Tetti** a padiglione e a una falda (con la direzione della falda e i tamponamenti dei muri), oltre a piano e a due falde. Dalla revisione 11/2026 (#52) le coperture seguono la sagoma della pianta: su piante a L, T, U si costruisce un tetto per ogni rettangolo massimo della sagoma e i tetti si incontrano nei compluvi (la falda unica resta un solo piano su tutta la sagoma); il computo misura la sagoma con lo sporto. Con muri obliqui resta il rettangolo d'ingombro (`roofRects`, `03-model.js`).
- **Immagini**: vista in 4K, panorama 360° equirettangolare con visore e JPG con metadati GPano, tutte le camere salvate in 4K in uno zip.
- **Coda di render AI**: vista corrente e camere salvate in coda, elaborate una alla volta; si ferma a errore o quota esaurita.
- **Progetti**: pulsante in alto con tutti i progetti di questo browser (IndexedDB, salvataggio automatico con anteprima): nuovo, apri, duplica, rinomina, scarica .json, elimina con conferma.
- **Riapertura sicura** (revisione 11/2026, #51 #58 #69): il salvataggio rapido (`localStorage`) tiene l'ora dell'ultima scrittura; alla riapertura si confronta con la raccolta Progetti e si apre la versione più recente. Se il progetto è troppo grande per il salvataggio rapido, la copia vecchia si toglie e alla riapertura si legge la raccolta. Ogni scheda del browser ricorda il suo progetto (`sessionStorage`). I modelli importati (DAE, OBJ, FBX…) si ricaricano dalla raccolta e non si perdono più. Uscendo dalla pagina la raccolta si scrive subito.
- Anteprime del catalogo: `npm run build:anteprime -- --mancanti` genera solo quelle nuove.

## Avanguardia (fase 4)

- **Tavole tecniche** (Esporta → Tavole tecniche): una pianta per piano con catene di quote esterne automatiche, linea di sezione e nord; i quattro prospetti nominati con il nord vero; la sezione A-A (verticale o orizzontale, posizione e verso) con le parti tagliate campite; il computo. Fogli A4–A1 con cartiglio, scala 1:50/1:100/1:200 (ridotta da sola se il disegno non entra). PDF unico, SVG e DXF per foglio. La pianta è lo stesso disegno dell'editor scritto su un registratore vettoriale; prospetti e sezioni sono proiezioni ortogonali dei triangoli del modello con rimozione delle parti nascoste per profondità. Il DWG è un formato chiuso: si apre il DXF in AutoCAD e si salva in DWG.
- **Computo** (scheda Elenco; dalla revisione 11/2026 le finiture si misurano sul filo di ciascun lato con gli angoli raccordati, le aperture non superano il muro; prova a mano nei test, #53 #65): murature per spessore (m² netti di aperture, m³), finiture per lato, pavimenti, battiscopa, controsoffitti e tinteggiature, porte e finestre per modello e misura, oscuranti, copertura in falda, scale, ringhiere, luci, arredi. Prezzi unitari scritti dall'utente (`P.prices`, mai condivisi), importi, totale, CSV, pagina nel PDF.
- **Link per il cliente** (Esporta → Condividi con il cliente): link di 30 giorni, sola lettura (`?condividi=<id>`), commenti puntati in pianta con la vista 3D allegata, lettura e «risolto» lato progettista, aggiornamento del link con le modifiche. API in `shared/share.js`, privacy in `docs/privacy.md`.
- **AI nel progetto**: i render restano nella galleria del progetto (IndexedDB); **Ritocca una zona**: si dipinge una maschera sul render e si scrive la modifica; il risultato del servizio si incolla solo nella zona dipinta, con bordi sfumati, così il resto resta identico.
- **Video**: giro attorno all'edificio o volo tra le camere salvate (curva morbida), 360p/720p/1080p, MP4 o WebM secondo il browser; registra in tempo reale.
- **IFC4**: muri con vani, porte e finestre, solai, locali con superficie netta, piani, copertura, scale, ringhiere, luci e arredi (superfici triangolate). Verificato con web-ifc nelle prove. Dalla revisione 11/2026 (#57): muri con gli angoli raccordati (nessuna sovrapposizione, volume uguale al computo) e altezza del piano; materiali (`IfcMaterial`) su muri, solai, porte e finestre; `Pset_WallCommon` (IsExternal, LoadBearing, Reference), `Pset_DoorCommon`, `Pset_WindowCommon`, `Qto_WallBaseQuantities`. Il DXF della pianta e delle tavole dichiara la tabella dei layer.
- **Anteprima di stampa 3D**: piatto della stampante scelta a grandezza reale, pezzi disposti, misure, volume, PLA stimato, pezzi troppo grandi in rosso.
- **Pannello laterale**: si allarga trascinando il bordo, si stacca e si sposta (ridimensionabile), si nasconde dal pulsante «Pannello»; preferenze salvate nel browser.
- **Tablet**: tocco prolungato in pianta = menu contestuale, prese più larghe per maniglie e muri, tasti a schermo per camminare nella visita a piedi, controlli più grandi con il dito.

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
- `npm run test:unit`: 36 test (Worker e contratto con AI, KV e asset finti: multipart verso klein, guide facoltative, quote per IP e globali, kill switch, origini, lato massimo 512 px, errore del modello, Turnstile, cancellazione; condivisione: token, scadenza, commenti, limiti per IP, progetti non validi; server locale; motore pianta + prospetti).
- `npm run test:e2e`: 21 test Playwright (sicurezza dei progetti aperti; apertura senza errori, stanza + undo/redo, persistenza, esportazioni, render di prova ed errori, Turnstile, libreria, DXF → 3D, pianta di precisione, fase 1 completa, fase 2 nel 3D, fase 3 in tre prove: pennello e finiture; aperture, scale, tetti, luci e sole; 4K, 360°, coda di render e progetti; fase 4 in quattro prove: tavole, computo e IFC letto da web-ifc; link per il cliente con commenti; ritocco con maschera e galleria; video, anteprima di stampa e pannello; telefono 400 px). Gli stessi test girano in CI. La visita a piedi è provata solo come entrata/uscita (il browser senza GPU di CI va a pochi fotogrammi al secondo).
- **Non provati**: Workers AI reale (serve l'account Cloudflare), Poly Haven dal vivo, file SketchUp reale, D5 Render e slicer.
