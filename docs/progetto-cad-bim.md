# Progetto: dal CAD 2D al BIM semplificato

> Documento di progetto per la revisione e l'approvazione del titolare (13/11/2026). **Nessuna riga di codice finché non è approvato.**
> Dopo l'approvazione: piccole PR come nella revisione 11/2026, ognuna con prove e misura prima/dopo; stato nella issue #1.

## 1. L'idea

Pianta Libera diventa un unico strumento a **quattro livelli in fila**:

```
 1. CAD 2D            2. Riconoscimento        3. BIM + 3D            4. Render AI
 linee, layer,  ──►   muri, aperture,   ──►    pianta BIM e     ──►   immagine
 quote, blocchi       locali, solai,           vista 3D con           fotorealistica
                      coperture                ombre (SketchUp)
```

Obiettivi indicati dal titolare:
- **CAD semplice ma completo per il lavoro quotidiano**: non tutto AutoCAD, ma tutto quello che un architetto usa ogni giorno per disegnare e correggere una pianta.
- **Riconoscimento CAD → BIM efficace, il migliore sul mercato**: deve funzionare sui disegni veri, con i loro errori, e battere i concorrenti in misure confrontabili.
- **Massima semplicità**: l'interfaccia di oggi resta; si aggiungono l'ambiente CAD e un comando «Riconosci BIM».

Principio guida: **il disegnatore non cambia il suo modo di lavorare.** Il riconoscimento si adatta al disegno, non il contrario.

## 2. Da dove si parte

| Livello | Esiste già in Pianta Libera | Manca |
|---|---|---|
| 1. CAD 2D | Import DXF/DWG come base di ricalco (layer selezionabili), «linee → muri» per disegni a linea singola, quote, aggancio a estremi/punti medi/griglia, misure digitate, Orto | Disegnare e modificare **entità CAD** con layer, comandi da tastiera, salvataggio DXF |
| 2. Riconoscimento | «Da pianta e prospetti al 3D» (`editor-src/075-auto3d.js`, prove in `tests/auto3d.test.mjs`): muri da coppie di linee parallele (5–70 cm, spessori ricorrenti), aperture da vuoti di 45 cm–3,2 m (porta con l'arco, finestra con le linee del vetro), locali chiusi con il nome, **altezze, aperture e copertura dai prospetti**, esclusione di quote, testi e campiture per layer, unità corrette da sole | Disegni «sporchi», muri curvi, pilastri, simboli di porte e finestre dei vari studi, più piani, riconversione dopo una modifica, revisione elemento per elemento, apprendimento automatico |
| 3. BIM + 3D | Muri, aperture parametriche, piani, locali, solai, coperture automatiche, scale, computo, IFC4 con Pset e materiali, vista 3D con sole da data e ora | Stile «schizzo» con bordi e ombre nette, sezioni più leggibili |
| 4. Render AI | Render AI fedele alla geometria, confronto prima/dopo | Niente di necessario |

## 3. Analisi dei concorrenti

Ricerca del 13/11/2026 su documentazione ufficiale, manuali e stampa di settore (fonti in fondo). Ogni voce: come funziona, cosa fa bene, dove è debole.

### 3.1 Programmi BIM con conversione dai file CAD (desktop)

| Programma | Come trasforma il CAD in BIM | Punti forti | Punti deboli |
|---|---|---|---|
| **ArchLine.XP** (CadLine) | «Generative floor plan, lines to walls»: si importa il DWG, si raggruppa, si danno i limiti di muri e aperture; tiene solo ciò che riconosce «con alta certezza» come muri, porte, finestre | Automatico, dentro un CAD/BIM ibrido; dichiara **90–95 %** di riconoscimento sui file CAD | Falsi muri su motivi ripetuti (pergolati); misura non pubblicata in dettaglio; desktop, a pagamento |
| **Chief Architect** | «CAD to Walls»: l'utente sceglie il **layer** dei muri, delle porte, delle finestre; coppie di linee parallele entro ±25 mm dello spessore di un tipo di muro diventano muri | Semplice e prevedibile; anche muri curvi e ringhiere | Richiede layer ordinati; linee tra le facce del muro vanno cancellate prima; porte e finestre non riconosciute dalla forma ma dal layer; blocchi da esplodere |
| **BricsCAD BIM** (Bricsys/Hexagon) | Formato DWG nativo; **BIMIFY classifica solidi 3D** già modellati (muri, solai, locali, interno/esterno); QUICKDRAW per disegnare stanze rapidamente | Un solo programma per CAD e BIM, DWG nativo | BIMIFY **non** trasforma linee 2D in muri e aperture: serve prima modellare in 3D |
| **Archicad** (Graphisoft) | La documentazione ufficiale descrive il muro creato da una linea scelta e il ricalco del DWG («bacchetta magica»); non abbiamo trovato una conversione automatica dell'intera pianta | Strumenti di ricalco precisi | In pratica a mano, elemento per elemento |
| **Allplan**, **Vectorworks** | Muri da linee o da poligoni selezionati | Utile per piante semplici | Semi-manuale: l'utente sceglie le linee; aperture a mano |
| **Edificius / TerMus** (ACCA) | Strumenti di «riconoscimento e disegno automatico» sul DWG: si selezionano muri, pilastri, scale, solai | In italiano, collegato al computo | Semi-automatico, desktop Windows, a pagamento |
| **Revit + componenti aggiuntivi** (IMAGINiT «Rooms from CAD», SH_Tools, Manicotti open source) | Locali o muri da linee del DWG collegato, a regole | Restano in Revit | Ognuno fa un pezzo; Manicotti è dichiarato «progetto giocattolo»; Revit costoso e solo Windows |

### 3.2 Servizi con l'intelligenza artificiale

| Servizio | Ingresso → uscita | Metodo | Punti deboli |
|---|---|---|---|
| **WiseBIM AI / Plans2BIM** (Francia, dal 2024 nel gruppo ACCA) | PDF, immagini, DWG, DXF → Revit (componente aggiuntivo) o IFC (web) | **Rete neurale sui pixel**: anche il DWG diventa immagine; scala con due punti, rilevazione per fasi (muri, poi aperture, poi solai e locali), revisione e correzione | Precisione legata alla risoluzione (≥ 100 px/m; a 50 px/m non meglio di ~2 cm); cartigli scambiati per muri; altezze e davanzali a mano; €49/mese web, $29/mese Revit |
| **usBIM.planAI** (ACCA, su tecnologia WiseBIM) | PDF, PNG, JPEG → IFC 2x3, DWG, tabelle quantità | Nel browser, calcolo sul server; limiti di spessore 2–65 cm e aperture 0,3–5 m; muri → aperture → solai e locali; revisione in 2D e 3D | **Cambiare i parametri riavvia il riconoscimento e cancella le correzioni**; 3D solo da guardare; solo raster |
| **BIMify** (Svezia) | DWG, DXF, PDF, immagini, nuvole di punti → Revit o IFC | Servizio a lotti con AI e «regole da ingegnere» (spessori standard), controllo qualità del loro personale | Scale, ringhiere, coperture e dettagli fatti a mano dal loro team; prezzo a preventivo; «100 % di precisione» dichiarato, non verificato |
| **bimy.ai** (Svezia) | Immagini e PDF (anche vettoriali), foto → IFC4 georeferenziato | Classifica le pagine, legge la scala da più fonti, misura i muri, punteggio di controllo 0–100 | **DWG non ancora letto** (annunciato per fine 2026); precisione non pubblicata |
| **Planner 5D** (riconoscimento piante) | JPG, PNG, PDF (DWG solo via API) → progetto 2D/3D Planner 5D | AI in 1–3 minuti, poi **un progettista corregge a mano** ogni risultato | Non è uno strumento per l'architetto ma un servizio; non BIM tecnico |
| **Snaptrude** | Bozza di spazi e volumi disegnata in Snaptrude → Revit | Nel cloud, AI che genera muri, solai e coperture dagli spazi | **Non legge piante 2D esistenti**: trasforma il suo schema di spazi, non un DWG |

### 3.3 CAD 2D nel browser

- **Rayon** (Francia): CAD 2D collaborativo nel browser per architetti, import/export DWG/DXF, 4.500 blocchi, 1.000 retini, layout, modelli di tavola. **Nessun BIM** e nessun riconoscimento. È il riferimento per «CAD semplice nel browser».

### 3.4 Ricerca scientifica (stato dell'arte)

Il problema si chiama **«panoptic symbol spotting»**: dare un ruolo (muro, porta, finestra, ringhiera…) a ogni linea di un disegno vettoriale.
- Banco di riferimento: **FloorPlanCAD** (15.663 disegni, 30 classi di oggetti + 5 di «materia» come muri e ringhiere). **Licenza non commerciale** (CC BY-NC 4.0, disegni di cui gli autori non hanno i diritti).
- Risultati (PQ, qualità panottica, più alto è meglio): CADTransformer 68,9 → GAT-CADNet 73,7 → **SymPoint** (ICLR 2024, ogni primitiva come un punto) 83,3 → SymPoint-V2 90,1 (con informazioni di layer) → **VecFormer** (2025, primitive come insiemi di segmenti) 88,4 senza / **91,1** con informazioni aggiuntive, F1 sulle primitive **93,8**. SymPoint ha ~35 milioni di parametri e impiega ~66 ms per disegno.
- **Disegni grandi** restano difficili: su edifici oltre 1.000 m² (LS-CAD) il migliore arriva a PQ 54,3 (CADSpotting).
- Dalle immagini raster (CubiCasa5K) i risultati sono più bassi; il lavoro più recente (SALI-FP, Tsinghua, settembre 2026) introduce un'idea utile: **il modello propone, regole deterministiche verificano** contro le linee del disegno prima di accettare.

### 3.5 Cosa ne ricaviamo

Debolezze comuni dei concorrenti, cioè le occasioni per fare meglio:
1. **Si passa dall'immagine** (WiseBIM, usBIM.planAI, bimy, Planner 5D): il DWG viene rasterizzato e si perde la precisione delle coordinate. *Noi lavoriamo sui vettori: precisione al decimo di millimetro, nessun passaggio di scala.*
2. **Layer ordinati obbligatori** (Chief Architect) o **selezione a mano** (Archicad, Allplan, Vectorworks, Edificius). *Noi usiamo i layer quando aiutano, ma riconosciamo anche dalla forma.*
3. **Correzioni perse** quando si rilancia (usBIM.planAI) e **sola andata** ovunque. *Noi aggiorniamo solo ciò che è cambiato e conserviamo le correzioni.*
4. **Altezze e davanzali a mano** (WiseBIM, usBIM.planAI). *Noi li leggiamo da testi, sezioni e prospetti: il motore dei prospetti c'è già.*
5. **Cartigli, cornici e motivi ripetuti scambiati per muri** (WiseBIM, ArchLine.XP). *Noi riconosciamo tavola, cartiglio e finestre di vista prima di cercare i muri.*
6. **Programmi separati**: il CAD in un programma, il riconoscimento in un altro, il render in un terzo. *Noi abbiamo tutto in uno, nel browser e nelle app, con foto → 3D e render AI.*
7. **Precisione dichiarata ma non verificabile** (ArchLine.XP 90–95 %, BIMify 100 %). *Noi pubblichiamo un banco di prova e le misure.*

Onestà: il riconoscimento perfetto non esiste. ArchLine.XP dichiara 90–95 % e i migliori modelli di ricerca sono intorno a 91 di PQ sui disegni piccoli. Puntiamo a **superare questi valori sulle piante residenziali e da ristrutturazione** (il lavoro tipico dello studio), con una revisione che renda veloce correggere il resto.

## 4. I quattro livelli in dettaglio

### Livello 1 — CAD 2D per il lavoro quotidiano

Riferimento di semplicità: Rayon nel browser; riferimento di comandi: AutoCAD (alias da tastiera accettati). Si entra con un selettore **CAD | BIM** nella barra in alto; la vista 3D resta affiancata.

**Rilascio 1 — quotidiano** (quello che serve ogni giorno a chi disegna piante, rilievi e varianti):

*Entità*
- Linea, polilinea (aperta/chiusa, con tratti ad arco), arco, cerchio, rettangolo.
- Testo su una riga e multiriga.
- Quote lineari, allineate, continue, angolari, di raggio; **associative** (seguono le linee quotate).
- Retino pieno e a motivo (laterizio, calcestruzzo, isolante, terreno, legno) con contorno associato.
- Blocchi: crea, inserisci, esplodi; libreria di porte, finestre, sanitari e arredi in pianta (quelli di Pianta Libera).

*Layer*
- Gestore: nome, colore, tipo di linea (continua, tratteggiata, asse, nascosta), spessore, acceso/spento, bloccato, stampabile; layer corrente; isola; «DaLayer».
- Layer suggeriti per architettura (MURI, TRAMEZZI, PORTE, FINESTRE, ARREDI, QUOTE, TESTI, RETINI): facoltativi.

*Comandi* (parola italiana + alias AutoCAD)
- Disegno: LINEA (L), PLINEA (PL), ARCO (A), CERCHIO (C), RETTANGOLO (REC), TESTO (T/MT), QUOTA (DLI/DAL/DCO), RETINO (H), BLOCCO (B), INSERISCI (I).
- Modifica: SPOSTA (M), COPIA (CO), RUOTA (RO), SCALA (SC), SPECCHIO (MI), OFFSET (O), TAGLIA (TR), ESTENDI (EX), RACCORDO (F, anche raggio 0 per chiudere gli angoli), STIRA (S), SERIE rettangolare (AR), ESPLODI (X), UNISCI (J), SPEZZA (BR), CANCELLA (E), CORRISPONDENZA PROPRIETÀ (MA).
- Selezione come AutoCAD: finestra da sinistra, interseca da destra, Maiusc per togliere, selezione simile, per layer; maniglie per stirare e spostare.
- **Riga di comando** sotto la pianta: comando o alias, Invio/spazio ripete l'ultimo, opzioni suggerite; coordinate assolute, relative (`@3,0`) e polari (`@4<90`).
- Interroga: distanza, area e perimetro.
- Annulla/ripristina comune a CAD e BIM.

*Precisione*
- Snap all'oggetto: estremo, punto medio, centro, intersezione, perpendicolare, più vicino, estensione; tracciamento polare; Orto; griglia.
- Lunghezza digitata + Tab per l'angolo (come oggi per i muri); unità m/cm/mm.

*File e tavole*
- Apertura **DWG** e **DXF**; salvataggio **DXF** (AutoCAD lo apre senza perdite). DWG in scrittura: decisione 3 (§7).
- Il disegno CAD va nelle **tavole PDF** esistenti con il cartiglio; spessori di stampa per layer.

*Prestazioni*
- Fino a 100.000 entità per piano con spostamento e zoom fluidi.

**Rilascio 2 — dopo**, se servono: ellisse e spline, serie polare, cima, linee di costruzione, nuvola di revisione, testo con stili avanzati, spazio carta con più finestre, riferimenti esterni, vincoli parametrici, collaborazione in tempo reale.

### Livello 2 — Riconoscimento: dal CAD al BIM

Comando **«Riconosci BIM»** (barra e riga di comando `RICONOSCI`) sul piano corrente, su una selezione o su tutti i piani. Funziona sia sul disegno fatto in Pianta Libera sia sui DWG/DXF importati.

**2.1 Pipeline in sette passi**

1. **Lettura vettoriale**: tutto in metri, blocchi espansi ma ricordati (il nome del blocco è un indizio: «PORTA_90», «WIN»…), testi letti.
2. **Tavola e cartiglio**: si riconoscono cornice, cartiglio, legende e finestre di vista, e si escludono prima di cercare i muri (difetto di WiseBIM e ArchLine.XP).
3. **Pulizia topologica**: unione di linee sovrapposte e collineari, doppioni tolti, estremi vicini uniti (tolleranza automatica dalla scala del disegno, di solito 1–3 cm), linee che sbordano tagliate all'incrocio. Il CAD originale non cambia.
4. **Ruolo di ogni linea** (il cuore, §2.2): muro, porta, finestra, pilastro, scala, ringhiera, arredo, quota, testo, retino, altro.
5. **Ricostruzione del grafo dei muri** (§2.3): assi, spessori, giunzioni, muri curvi, pilastri.
6. **Aperture e locali** (§2.4–2.5), poi **altezze** da testi, sezioni e prospetti (§2.6).
7. **Verifica e revisione** (§2.7–2.8): controlli di coerenza, punteggio di fiducia per elemento, revisione guidata.

**2.2 Ruolo delle linee: regole + modello addestrato, con verifica**

- **Regole** (veloci, spiegabili): layer con nomi noti in italiano e inglese (MURI, MUR, WALL, A-WALL, TRAMEZZI, PORTE, A-DOOR, FINESTRE, A-GLAZ…), nomi dei blocchi, coppie di linee parallele con spessore ricorrente, archi di apertura, retini dei muri.
- **Modello addestrato sui vettori** (non sulle immagini), della famiglia dello stato dell'arte (§3.4: ogni linea come insieme di segmenti con posizione, direzione, lunghezza, tipo, layer e colore; Transformer per nuvole di punti). Versione **piccola, esportata in ONNX**, che gira **nel dispositivo** come già fanno i modelli di «Da foto al 3D» (nessun invio del disegno, nessun costo per riconoscimento).
- **Il modello propone, le regole verificano** (idea SALI-FP): una linea diventa muro solo se c'è la faccia parallela compatibile, una porta solo se il vuoto nel muro c'è davvero, e così via. Ciò che non passa la verifica resta «dubbio» in revisione.
- **Addestramento con dati nostri** (decisione 5): FloorPlanCAD è non commerciale, quindi non lo usiamo per il modello distribuito. Pianta Libera ha un vantaggio che nessun concorrente ha: **genera da sola le piante DXF dai propri modelli BIM**, con l'etichetta giusta su ogni linea. Si producono migliaia di piante sintetiche variando stili di disegno (spessori, simboli di porte e finestre, retini, layer caotici o tutto sul layer 0, blocchi esplosi, quote, testi, arredi, errori voluti: linee staccate, sovrapposte, perimetri aperti). A queste si aggiungono, se il titolare le fornisce, piante reali dello studio etichettate (tenute fuori dal repository pubblico).
- Per misurare il confronto con la ricerca si può usare FloorPlanCAD **solo come banco di prova interno**, mai per addestrare il modello distribuito (da confermare: decisione 5).

**2.3 Muri**
- Assi e spessori da coppie di facce; spessori raggruppati per tipo (tramezzo 8–12, portante 25–30, esterno 40+…) e arrotondati al centimetro.
- Muri **curvi** (archi concentrici), muri **a spessore variabile** spezzati in tratti, muri con **cappotto** o più strati (linee interne parallele = strati).
- Giunzioni a L, T e croce ricostruite sul grafo; buchi chiusi per **coerenza globale** (allineamenti, prolungamenti, spessore uguale dall'altra parte) invece che punto per punto.
- Muri a linea singola su un layer muri: spessore dal layer o chiesto una volta.
- **Pilastri**: rettangoli e cerchi campiti, dentro i muri o isolati.

**2.4 Aperture**
- **Porte**: vuoto nel muro + arco (lato cerniera e verso dall'arco), doppie, scorrevoli (linee parallele nel vuoto), a scomparsa, basculanti; da blocchi riconosciuti per forma anche se esplosi.
- **Finestre**: vuoto con telaio e vetro (1–3 linee), portafinestre, sopraluce; davanzale dai prospetti o dai testi («h davanzale 90»).
- Misure dal vuoto; altezze da testi vicini («80×210», «h 220»), dai prospetti, altrimenti dai valori del progetto.

**2.5 Locali**
- Aree chiuse dal grafo dei muri (non da un raster: precisione vettoriale); nome dal testo dentro; superficie confrontata con quella scritta («14,50 m²»): una differenza oltre l'1 % viene segnalata.
- Pavimento proposto dal nome, come oggi.

**2.6 Più piani e altezze**
- Piante, sezioni e prospetti nella stessa tavola separati automaticamente (motore esistente).
- Quote di piano e altezze da sezioni, prospetti e testi («+3,15»); allineamento tra piani dai muri esterni comuni.
- Solai e coperture **su richiesta** (§2.9).

**2.7 Controlli di coerenza** (prima della revisione)
- Muri sovrapposti, aperture più larghe del muro, porte che aprono contro un muro, locali senza accesso, superfici diverse da quelle scritte, spessori fuori dai tipi ricorrenti: ognuno diventa una segnalazione.

**2.8 Revisione guidata** (come in «Da foto al 3D», ma più veloce)
- Colori sopra il CAD: verde sicuro, giallo dubbio, rosso non riconosciuto; percentuale di fiducia per elemento.
- Elenco dei dubbi ordinato per importanza; Tab passa al successivo, un tasto conferma, un tasto cambia ruolo (muro / porta / finestra / arredo / ignora).
- Correggere un caso propone di correggere **tutti i casi simili** (stesso blocco, stesso layer, stesso spessore).
- Le correzioni **non si perdono** se si cambiano i parametri e si rilancia (difetto di usBIM.planAI).
- «Crea BIM» alla fine; un solo «Annulla» torna indietro.
- Le correzioni dell'utente possono (con il suo consenso, decisione 5) migliorare il modello successivo.

**2.9 Dopo una modifica del CAD: riconversione a richiesta**
- Ogni elemento BIM ricorda le linee CAD da cui è nato.
- Si modifica il CAD, si preme di nuovo «Riconosci»: si aggiorna **solo ciò che è cambiato**, conservando materiali, tipi, stili, arredi, camere e correzioni.
- Elementi aggiunti o cambiati nel BIM restano (segnati); in conflitto si chiede quale tenere.
- Solai (per locale o sull'impronta) e copertura sulla sagoma (piana, a falde, a padiglione: motore esistente) proposti alla fine, con conferma.

### Livello 3 — BIM semplificato e vista 3D tipo SketchUp

- BIM di oggi invariato.
- **Stile «schizzo»**: superfici chiare a colori piatti, bordi neri, ombre nette dal sole del luogo e della data; interruttore realistico/schizzo.
- **Sezioni** orizzontali e verticali con taglio campito.
- **CAD in trasparenza** sopra il BIM in pianta, per controllare il riconoscimento a colpo d'occhio.
- Esportazioni invariate (IFC4 con Pset, DXF, GLB, tavole PDF) più il DXF del piano «come CAD originale» o «come BIM».

### Livello 4 — Render con l'AI

Invariato; in più la possibilità di partire dalla vista in stile schizzo, che dà ai modelli contorni più netti.

## 5. Interfaccia

- **Disposizione invariata**; nuovo selettore **CAD | BIM** nella barra in alto.
- In **CAD**: strumenti di disegno e modifica nella colonna a sinistra, **riga di comando** sotto la pianta, layer e proprietà nel pannello, pulsante **«Riconosci BIM»** sempre in vista.
- In **BIM**: tutto come oggi.
- Telefono e tablet: CAD per correzioni e misure, non per tavole intere.
- Tutto in italiano; alias AutoCAD in inglese accettati.

## 6. Dati del progetto

- Schema **v4**: per ogni piano un insieme `cad` (entità, layer, stili, blocchi); per ogni elemento BIM il campo `src` con le linee di origine e lo stato (riconosciuto, confermato, modificato nel BIM).
- Un progetto v3 si apre identico; uno v4 in una versione vecchia perde solo il CAD, con avviso.
- Storia di annulla con il meccanismo leggero di oggi; condivisione con il cliente: CAD visibile solo se il progettista lo sceglie.

## 7. Decisioni del titolare

| # | Decisione | Proposta | Alternative |
|---|---|---|---|
| 1 | Dopo la conversione, chi comanda? | **Riconversione a richiesta** (§2.9) | Sola andata; sincronia continua (sconsigliata) |
| 2 | Dove gira il riconoscimento | **Nel dispositivo** (modello ONNX piccolo + regole): gratuito, nessun dato inviato | Worker con modello di visione: costa Neurons, quota da decidere |
| 3 | Salvataggio DWG | **DXF subito**; DWG se libredwg lo scrive bene (prova con AutoCAD e BricsCAD) | Libreria commerciale ODA (a pagamento) |
| 4 | Ampiezza del CAD | **Rilascio 1 quotidiano** (§4 livello 1) | Ancora più ridotto per arrivare prima al riconoscimento |
| 5 | Dati per addestrare il modello | **Piante sintetiche generate da Pianta Libera** + piante reali dello studio etichettate, fuori dal repository; FloorPlanCAD solo come banco interno di confronto | Solo sintetiche; correzioni degli utenti usate per migliorare il modello solo con consenso esplicito |
| 6 | Ordine di sviluppo | **Riconoscimento sui DWG importati prima** (valore subito per chi usa AutoCAD), poi il CAD interno | CAD prima, riconoscimento dopo |

La proposta 6 è cambiata rispetto alla bozza: l'analisi mostra che il valore maggiore, e il confronto con i concorrenti, sta nel riconoscimento; il CAD interno viene subito dopo e usa lo stesso motore.

## 8. Fasi e PR

| Fase | Contenuto | Risultato visibile |
|---|---|---|
| **A. Banco di prova** | generatore di piante DXF sintetiche etichettate da modelli BIM (stili ed errori variabili); misura automatica (muri, aperture, locali, spessori) in CI; misura sull'attuale motore | numeri di partenza veri, confrontabili con i concorrenti |
| **B. Regole migliori** | passi 1–3 e 5–7 di §2.1: tavola e cartiglio, pulizia, grafo dei muri, muri curvi, pilastri, aperture, locali vettoriali, controlli | «Riconosci BIM» sui DWG importati, molto più robusto di oggi |
| **C. Revisione guidata** | §2.8: colori, dubbi in ordine, correzioni in un tasto e «tutti i simili», nessuna perdita di correzioni | correggere una pianta in pochi minuti |
| **D. Modello addestrato** | dataset sintetico (+ reale se fornito), addestramento, ONNX nel dispositivo, «il modello propone, le regole verificano» | simboli e disegni disordinati riconosciuti |
| **E. Altezze e più piani** | §2.6 da testi, sezioni e prospetti; solai e coperture su richiesta | edificio intero da una tavola |
| **F. CAD: fondamenta e disegno** | schema v4, `shared/cad.js` con prove `node --test`, indice spaziale, canvas a strati, selettore CAD/BIM, entità, layer, snap, riga di comando | si disegna come in AutoCAD |
| **G. CAD: modifica, file, tavole** | comandi di modifica, DXF in andata e ritorno, tavole con il CAD, prestazioni | si apre il DWG dello studio, si lavora, si salva |
| **H. Riconversione** | §2.9: collegamento CAD↔BIM, aggiornamento solo del cambiato | si modifica il CAD e il BIM si aggiorna senza perdere nulla |
| **I. Vista 3D** | stile schizzo, sezioni, CAD in trasparenza, render dallo schizzo | 3D tipo SketchUp |

Ogni fase si chiude con un riepilogo nella issue #1 e l'aggiornamento di `docs/editor.md`.

## 9. Livelli di qualità (misurabili)

Si aggiungono a `docs/livelli-qualita.md`; misure automatiche in CI sul banco sintetico, e sul banco reale quando disponibile.

| Area | Indicatore | Livello proposto | Riferimento concorrenti |
|---|---|---|---|
| Riconoscimento | Muri trovati (richiamo, lunghezza) sul banco reale | **≥ 97 %** | ArchLine.XP dichiara 90–95 % |
| Riconoscimento | Muri falsi (precisione) | **≥ 97 %** | — |
| Riconoscimento | Errore di spessore / posizione dei muri | **≤ 5 mm** | raster a 100 px/m: ±1 cm; a 50 px/m: ±2 cm |
| Riconoscimento | Porte e finestre trovate con il tipo giusto | **≥ 95 %** | — |
| Riconoscimento | Locali chiusi con superficie entro l'1 % | **≥ 95 %** | — |
| Riconoscimento | Ruolo delle linee (F1 sulle primitive) sul banco sintetico di verifica | **≥ 95** | VecFormer 93,8 su FloorPlanCAD |
| Riconoscimento | Altezze e davanzali presi dal disegno quando presenti | **≥ 90 %** | WiseBIM e usBIM.planAI: a mano |
| Riconoscimento | Correzioni conservate dopo un nuovo riconoscimento | **100 %** | usBIM.planAI: 0 % |
| Riconoscimento | Tempo su una pianta di 150 m² nel dispositivo | **≤ 3 s** | servizi a lotti: minuti od ore |
| Revisione | Tempo per correggere una pianta tipo del banco reale | **≤ 3 min** | — |
| CAD | Comandi del rilascio 1 funzionanti, ciascuno con prova automatica | **100 %** | — |
| CAD | DXF aperto e salvato senza modifiche: entità, layer, blocchi conservati | **100 %** (≥ 20 file) | — |
| CAD | Errore di posizione in andata e ritorno DXF | **≤ 0,1 mm** | — |
| CAD | Spostamento e zoom con 100.000 entità | **≥ 30 fps** su computer medio | — |
| CAD | Tempo per disegnare la pianta di prova rispetto ad AutoCAD (prova del titolare) | **≤ 1,2 ×** | — |
| Generale | Livelli attuali (computo, IFC, prestazioni, accessibilità) | **invariati** | — |

## 10. Rischi

- **Disegni reali molto vari**: mitigazione con il banco reale, il modello addestrato e la revisione con «correggi tutti i simili».
- **Dati sintetici troppo puliti**: mitigazione con errori e stili variati di proposito, e misura separata sul banco reale.
- **Peso del modello nel dispositivo** (telefoni): versione piccola per il telefono, completa per il computer, come in «Da foto al 3D».
- **Ampiezza del CAD**: elenco chiuso al rilascio 1.
- **DWG in scrittura**: possibile solo DXF.
- **Interfaccia**: un solo selettore CAD/BIM e la stessa disposizione di oggi.

## 11. Cosa serve dal titolare

1. Approvazione del documento o correzioni (anche voce per voce).
2. Le sei decisioni del §7.
3. Per il banco reale: **10–20 piante DWG dello studio** (anche vecchie, rilievi compresi), con i nomi dei clienti tolti, consegnate fuori dal repository pubblico.
4. Una pianta di riferimento disegnata in AutoCAD, con il tempo impiegato.
5. Facoltativo: una licenza di prova di ArchLine.XP o un account usBIM.planAI per confrontare i risultati sulle stesse piante.

## Fonti (consultate il 13/11/2026)

Concorrenti
- ArchLine.XP, «Generating Walls on CAD Files»: https://help.archlinexp.com/hc/en-us/articles/21074468259089-Generating-Walls-on-CAD-Files
- Chief Architect, «Using CAD to Walls from an Imported DWG/DXF»: https://www.chiefarchitect.com/support/article/KB-00170/using-cad-to-walls-from-an-imported-dwg-dxf.html
- Bricsys, «Using Bimify»: https://help.bricsys.com/en-us/document/bricscad-bim/design-assistance/using-bimify
- Graphisoft, «How to model wall from a 2D line»: https://support.graphisoft.com/hc/en-us/articles/23126601413649-How-to-model-wall-from-a-2D-line
- Allplan, «Creating walls from lines»: https://help.allplan.com/Allplan/2015-0/1033/Allplan/6596.htm
- Vectorworks, «Creating Walls from a Polygon»: https://app-help.vectorworks.net/2016/eng/VW2016_Guide/Walls/Creating_Walls_from_a_Polygon.htm
- ACCA, Edificius 2D → 3D: https://www.accasoftware.com/en/usbim-planai ; manuale usBIM.planAI: https://cdn-resources.accasoftware.com/accasoftware/pdf/usBIM_planAI_user_manual_ED1_R1_EN.pdf
- AEC Magazine, «From 2D to 3D and back» (WiseBIM, BIMify, Qonic, 2025): https://aecmag.com/bim/from-2d-to-3d-and-back/
- Architosh, «WiseBIM AI»: https://architosh.com/2024/05/wisebim-ai-from-2d-plans-to-revit-bim-models/
- bimy.ai: https://bimy.ai/
- Planner 5D, riconoscimento piante: https://tool.planner5d.com/b2b-floor-plan-recognition
- Snaptrude, «Sketch to BIM»: https://snaptrude.com/blog/sketch-to-bim-space-layout-parametric-walls
- IMAGINiT, «Rooms from CAD»: https://resources.imaginit.com/how-tos/imaginit-utilities-for-revit-cad-tools-part-2-rooms-from-cad
- Manicotti (open source): https://github.com/ian-quinn/manicotti
- AEC Magazine, «Rayon V2»: https://aecmag.com/news/rayon-v2-launches-for-collaborative-cad/

Ricerca
- FloorPlanCAD (dataset e licenza): https://floorplancad.github.io
- SymPoint (ICLR 2024): https://arxiv.org/abs/2401.10556
- VecFormer, «Point or Line?» (2025): https://arxiv.org/abs/2505.23395
- CADSpotting (disegni grandi): https://arxiv.org/abs/2412.07377
- PolarSym (2026): https://arxiv.org/abs/2608.11793
- SALI-FP (Tsinghua, 2026): https://arxiv.org/abs/2609.25615
