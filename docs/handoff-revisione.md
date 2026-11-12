# Handoff — revisione completa di Pianta Libera (UI/UX, funzioni, codice)

> Per un agente Claude esperto di UI/UX e di software di modellazione per architettura e interior design.
> Scritto il 12 novembre 2026 su richiesta del titolare (Gian Paolo Franceschini, architetto). Lavora in **italiano**.
> Prima di tutto leggi `CLAUDE.md` (regole del progetto). Questo documento ti assegna l'incarico; `CLAUDE.md` prevale
> in caso di conflitto.

## 1. Incarico

Prova Pianta Libera **da utente esigente e da revisore tecnico**, e consegna una recensione critica completa:

1. **Bug ed errori** nell'interfaccia, nell'uso e nel codice: tutto ciò che si rompe, dà un risultato sbagliato, si
   comporta in modo incoerente o lento.
2. **Mancanze** rispetto ai software comparabili, sia BIM sia non BIM (sezione 5).
3. **Critiche** di UI/UX: chiarezza, flussi, coerenza, densità, scorciatoie, apprendibilità, telefono e tablet,
   accessibilità.
4. **Ottimizzazione del codice**: prestazioni, memoria, dimensioni, architettura, sicurezza, manutenibilità.
5. **Suggerimenti** concreti e ordinati per valore e sforzo.

Prova **tutte** le funzioni e opzioni elencate nella sezione 4: ogni pulsante, scheda, menu, scorciatoia, formato di
importazione ed esportazione.

Sii severo e specifico: il titolare vuole tutte le critiche possibili, non rassicurazioni. Ogni affermazione deve
essere verificabile: passi per riprodurre, file e riga, misura, schermata.

## 2. Il prodotto in breve

**Pianta Libera** è una web app gratuita (licenza AGPL-3.0) di modellazione architettonica per interni ed esterni.
Si disegna la pianta 2D con muri a spessore, aperture parametriche, più piani e coperture, e si vede subito il 3D.
Da lì si arreda, si producono tavole quotate, render realtime e render AI fotorealistici a partire dalla scena
modellata, e si condivide il progetto con il cliente.

Utenti previsti, in ordine:
- architetti e interior designer;
- i loro clienti, in sola lettura o con commenti;
- visitatori che non pagano.

| Dove | Indirizzo |
|---|---|
| Sito pubblicato (con render AI e condivisione) | https://pianta-libera.gianpaolo-franceschini.workers.dev/ |
| Demo statica (senza servizi AI) | https://gianpaolobol.github.io/piantalibera/ |
| Repository (pubblico) | https://github.com/gianpaolobol/piantalibera |
| Coordinamento | issue #1 del repository |
| App | Windows/Mac (Electron, `app-desktop/`), iPhone/iPad/Android (Expo, `app-mobile/`); pagina `scarica.html` |

Architettura in breve:
- **Editor**: JavaScript senza framework con Three.js r147. I sorgenti stanno in `editor-src/` (21 moduli, circa
  6.000 righe); `scripts/build-editor.mjs` li unisce in `public/index.html` con CSP e SRI.
- **Server**:
  - Worker Cloudflare in `worker/`: asset, `/api/render`, `/api/foto`, `/api/share`, quote su KV;
  - servizio di prova in `server/mock-render-server.mjs`;
  - pacchetto locale in `server/local-server.mjs`;
  - backend PHP alternativo in `server/php/`.
- **Documentazione**:
  - `docs/editor.md`: tutte le funzioni, modulo per modulo; leggilo per intero;
  - `docs/interfaccia-confronto.md`: roadmap d'interfaccia e confronto già fatto;
  - `docs/schema-progetto.md`: schema JSON v3;
  - `docs/api-render-contract.md`, `docs/banco-foto.md`, `docs/scansione-ar.md`, `docs/app.md`, `docs/privacy.md`.

## 3. Come lavorare

**Avvio in locale**
```bash
git clone https://github.com/gianpaolobol/piantalibera && cd piantalibera
npm install
npm run dev                 # servizio di prova su http://localhost:8787/ (render AI finto, nessun costo)
npm run build               # nomi globali + public/index.html aggiornato rispetto a editor-src/
npm run test:unit           # test unitari (node --test)
npx playwright install chromium && npm run test:e2e   # 44 prove nel browser, anche telefono e tablet
```
`node server/local-server.mjs` avvia il pacchetto locale: è lo stesso server del download «locale-latest».

**Regole da rispettare** (da `CLAUDE.md`):
- **Non consumare le quote AI del sito pubblicato.**
  - Render AI: 2 al giorno per visitatore, 50 in totale, tetto di spesa 9.500 Neurons al giorno.
  - Analisi da foto: 1 al giorno per visitatore, 10 in totale.
  - Prova render e analisi AI sul servizio locale di prova. Sul sito pubblicato al massimo **1 render** e
    **1 analisi da foto**, solo per verificare il flusso reale.
  - «Analizza nel dispositivo» è gratuita: usala quanto vuoi.
- **Niente segreti** nel codice, nei log, nelle issue o nelle PR. Non tentare di aggirare quote, Turnstile o
  `OWNER_TOKEN`. Se trovi una falla di sicurezza, descrivila in modo riservato al titolare, non in una issue pubblica
  con le istruzioni per sfruttarla.
- **Niente deploy e niente merge su `main`.** Il tuo prodotto è la recensione. Se correggi bug evidenti, fallo su
  branch `fix/*` con una PR ciascuno, test inclusi, e lasciale da unire al titolare. Niente force push.
- Non toccare i dati della condivisione (`/api/share`) di altri: crea link di prova tuoi.
- **Repository pubblico**: niente foto private o dati personali in issue, PR o file.

**Strumenti utili**
- Playwright per prove ripetibili e schermate a 1440×900, 1024×768 (tablet) e 390×844 (telefono), in tema chiaro e
  scuro.
- Chrome DevTools: Performance, Memory e Lighthouse per tempi di caricamento, FPS della vista 3D, memoria dopo 10
  minuti d'uso, perdite di memoria (cambia piano, apri e chiudi pannelli, importa più volte), dimensione dei file.

## 4. Cosa provare (inventario minimo)

Spunta ogni voce. Per ognuna verifica: funziona? Il risultato è giusto (misure, quote, geometria)? È chiaro come si
usa? Undo e redo funzionano? Il progetto salvato e riaperto la conserva? Come si comporta su telefono e tablet?

**Pianta 2D di precisione**
- Muri con spessore, stanze in un gesto, muri ad arco, pavimenti a poligono.
- Porte e finestre parametriche, con modelli e oscuranti.
- Più piani: schede, tabella dei livelli.
- Coperture piane, a due falde, a padiglione, a una falda.
- Scale e ringhiere.
- Quote, aggancio, inserimento di misure da tastiera, unità.
- Selezione multipla e a riquadro; copia, incolla e duplica; rotazione, specchio, maniglie.
- Menu contestuale, barra di stato, aiuto e scorciatoie.
- Etichette e superfici dei locali; pennello e lati dei muri; posa dei pavimenti, battiscopa, controsoffitti.

**3D**
- Viste preimpostate, orbita, zoom, visita a piedi, camere salvate.
- Selezione e trascinamento nel 3D, metro, taglio verticale e orizzontale.
- Qualità alta (SSAO), ombre, cieli HDRI.
- Sole da luogo, data e ora; luci artificiali.
- Trascinamento dal catalogo.

**Libreria e materiali**
- Circa 55 arredi parametrici e realistici, alberi, persone; ricerca.
- Poly Haven: modelli, HDRI, texture.
- Libreria personale; materiali procedurali e fotografici in scala reale.

**Importazioni**
- DWG, DXF, PDF, immagini.
- DAE/OBJ/glTF/FBX/3DS/STL, anche in .zip con texture.
- Progetto JSON con migrazione degli schemi vecchi.
- **Da pianta e prospetti al 3D** (DWG/DXF).
- **Da foto al 3D**: analisi AI e «Analizza nel dispositivo»; revisione degli spigoli con la lente, misura nota,
  camera «Vista della foto».

**Esportazioni**
- GLB, OBJ+MTL, 3MF/STL per la stampa 3D, DXF, IFC4, PNG, pacchetto AI, JSON.
- Apri ogni file in un programma vero e annota cosa si perde o si rompe:
  - IFC4: almeno un visualizzatore IFC, se puoi BlenderBIM/Bonsai o un viewer web;
  - GLB/OBJ: Blender;
  - DXF: un CAD.

**Tavole e computo**
- Piante quotate, prospetti, sezione, cartiglio; PDF, SVG, DXF.
- Computo delle quantità: confronta i numeri con un calcolo a mano.

**Render**
- Realtime: PNG, immagini 4K, serie dalle camere, panorama 360° con visore, video.
- Render AI, fedele e creativo: invio, attesa, errori, confronto prima/dopo, coda, galleria.
- Ritocco AI con maschera.
- Comportamento senza servizio AI o con servizio non raggiungibile: deve dirlo chiaramente, mai fingere un risultato.

**Progetti e condivisione**
- Raccolta dei progetti nel browser (IndexedDB).
- Area clienti: link in sola lettura o con modifica (90 giorni), storico delle versioni, approvazione, «chiedi
  modifiche», commenti in pianta.

**Piattaforme**
- Disposizione compatta sotto 900 px, gesti a tocco.
- PWA installabile e funzionamento senza rete.
- Pannello staccabile.
- App desktop.
- App mobile: la Scansione AR (prova) richiede un iPhone vero; valuta il codice in
  `app-mobile/modules/pianta-ar/` e il flusso descritto in `docs/scansione-ar.md`.

**Pagine legali e informative**: privacy, termini, crediti, `scarica.html`. P.IVA ed e-mail del titolare mancano di
proposito: non segnalarlo come bug.

**Scenari completi da cronometrare** (tempo, clic, errori, punti in cui ti blocchi):
1. Bilocale di 60 m² arredato, con quote, tavola PDF e render.
2. Villetta su due piani con tetto a falde, scala e facciate; esportazione IFC e DXF.
3. Ristrutturazione da una pianta DWG esistente.
4. Bozza di una stanza da una foto, poi corretta e arredata.
5. Il cliente apre il link, commenta, chiede modifiche; il progettista risponde con una nuova versione.

## 5. Confronto con i software comparabili

Per ogni ambito, indica cosa fa la concorrenza, cosa manca a Pianta Libera e quanto conta per l'utente previsto.

| Categoria | Riferimenti |
|---|---|
| BIM | Revit, Archicad, Vectorworks Architect, Allplan, BricsCAD BIM, Bonsai (BlenderBIM) |
| Modellazione generale | SketchUp, Rhino, Blender |
| Web e planner per interni | Homestyler, Planner 5D, Floorplanner, RoomSketcher, Coohom, Sweet Home 3D |
| Web di nuova generazione | Snaptrude, Arcol, Autodesk Forma |
| Rilievo da telefono | magicplan, Polycam, Canvas (RoomPlan) |
| Render | D5 Render, Enscape, Twinmotion, Lumion; render AI (es. Veras, LookX) |

Ambiti minimi:
- modellazione dei muri: giunzioni, stratigrafie, muri inclinati;
- aperture e famiglie parametriche;
- solai, coperture, scale;
- quote e annotazioni;
- livelli, sezioni e prospetti generati;
- tavole e impaginazione;
- abachi e computo;
- interoperabilità (IFC, DWG, SKP, glTF);
- materiali e librerie;
- luce e render;
- collaborazione e cliente;
- rilievo;
- telefono e tablet;
- prestazioni su modelli grandi;
- prezzo e modello gratuito;
- curva di apprendimento.

Distingui ciò che serve a un **MVP per architetti e interior designer** da ciò che è da **BIM professionale**. Il
progetto non vuole diventare Revit: segnala le mancanze BIM, ma valuta con realismo cosa vale la pena fare.

## 6. Revisione del codice

- **Struttura**:
  - 21 moduli concatenati in un unico file con 693 nomi globali, controllati da `npm run lint:globali`;
  - valuta rischi, collisioni, accoppiamento, testabilità, e se e come passare a moduli ES senza riscrivere tutto.
- **Prestazioni**:
  - dimensioni di `public/index.html` (circa 700 KB) e delle librerie caricate su richiesta;
  - tempo al primo disegno;
  - ricostruzione del modello 3D a ogni modifica: piena o incrementale?
  - geometrie e materiali liberati quando non servono più;
  - istanze e unione delle geometrie per gli arredi ripetuti;
  - lavoro pesante fuori dal thread principale;
  - modelli di riconoscimento (transformers.js, onnxruntime-web) e loro memoria su telefono.
- **Robustezza**: input non validi, file corrotti o enormi, progetti vecchi, interruzioni di rete, doppio clic su
  pulsanti che inviano richieste.
- **Sicurezza** (`worker/`, `shared/`, `server/`):
  - validazione degli input;
  - XSS nei commenti e nei nomi condivisi;
  - CSP;
  - quote server-side;
  - abuso di `/api/share`;
  - dimensioni degli upload;
  - SSRF;
  - prompt injection verso il modello AI.
- **Test**: cosa manca nella suite unitaria ed e2e; proponi prove nuove per i bug trovati.
- **Accessibilità** (WCAG 2.2 AA): tastiera, focus visibile, etichette, contrasto, lettori di schermo nei pannelli,
  movimento ridotto.

## 7. Già noto: non riscoprirlo, ma puoi criticarlo

- **Da foto al 3D**, sulle foto di verifica NYU:
  - riconosce il 75 % degli oggetti singoli e copre l'83 %, con 0,38 m di errore mediano in pianta;
  - le **porte** sono il punto debole (4 su 11);
  - è una bozza, non un rilievo.
- **Scansione AR**: prototipo, salva solo uno zip per il confronto; non porta ancora la stanza nell'editor.
- Mancano: avvisi e-mail tra progettista e cliente; più foto della stessa stanza; pulsante «Area clienti» sul sito del
  titolare.
- Quote AI basse per scelta: la demo è gratuita.

## 8. Consegna

1. **Report** in `docs/revisione-2026-11.md` su un branch `docs/revisione-2026-11`, con una PR.
2. **Una issue per ogni bug riproducibile** di gravità media o superiore, con passi, risultato atteso e ottenuto,
   ambiente e schermata. Prefisso nel titolo: `[bug]`, `[ux]`, `[prestazioni]`, `[codice]`, `[mancanza]`.
3. **PR di correzione** separate su `fix/*`, solo per bug evidenti e circoscritti, con test.
4. Un commento riassuntivo nella issue #1 con i link.

**Struttura del report**
1. Sintesi in 10 righe: il giudizio complessivo e le 5 cose più urgenti.
2. Tabella dei bug: id, area, gravità (bloccante / alta / media / bassa), passi, attesa, ottenuto, file e riga se noti,
   issue.
3. Critiche UI/UX, per flusso e per schermata, con schermate.
4. Confronto con i comparabili: tabella ambito × Pianta Libera × migliori concorrenti, con cosa manca e priorità.
5. Revisione del codice: problemi e proposte con file e riga.
6. Prestazioni e accessibilità, con misure.
7. Roadmap consigliata: interventi ordinati per valore/sforzo, distinti in subito, prossimo mese e più avanti.

**Gravità**
- **bloccante**: perdita di dati, crash, risultato tecnicamente sbagliato in una tavola o in un export;
- **alta**: funzione principale inutilizzabile o fuorviante;
- **media**: funziona ma con errori o grande fatica;
- **bassa**: cosmetico.

Le misure sbagliate in quote, tavole, computo e IFC sono sempre almeno **alte**: lo usano architetti.
