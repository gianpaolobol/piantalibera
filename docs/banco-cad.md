# Banco di prova del riconoscimento CAD → BIM

Fase A del progetto `docs/progetto-cad-bim.md`: misurare il riconoscimento con numeri ripetibili, prima di cambiarlo.

## Come funziona

- **Generatore** (`tests/banco-cad/genera.mjs`): piante residenziali casuali ma realistiche (rettangolo o L, 4–10 locali per divisione ricorsiva, muri esterni 30–45 cm, tramezzi 8–15 cm, portanti interni 20–30 cm, porte a battente, doppie e scorrevoli, finestre a una, due o tre linee). Il disegno è fatto come in un CAD: facce dei muri con le spalle delle aperture (unione dei rettangoli dei muri meno i vani, calcolata esattamente), simboli di porte e finestre, arredi, quote esterne, nomi e superfici dei locali.
- **Ogni linea conosce il suo ruolo** (muro, porta, finestra, arredo, quota, retino, cornice): la verità serve a misurare e, nella fase D, ad addestrare il modello del riconoscimento con piante nostre (FloorPlanCAD non si può usare a fini commerciali).
- **Otto stili**, 25 piante ciascuno (semi fissi, stesso banco a ogni esecuzione):

| Stile | Che cosa mette alla prova |
|---|---|
| ordinato | layer italiani (MURI, PORTE, FINESTRE, ARREDI, QUOTE, TESTI) |
| inglese | layer AIA (A-WALL, A-DOOR, A-GLAZ, A-ANNO-DIMS…) |
| layer0 | tutto sul layer 0: quote e arredi non si possono escludere per nome |
| retinato | retino a 45° dentro i muri |
| tavola | cornice e cartiglio attorno alla pianta |
| sporco | errori del disegnatore sul 35 % delle linee dei muri: staccate di 0,5–3 cm, spezzate, doppie, che sbordano |
| ruotato | pianta ruotata fino a ±45° |
| difficile | tutto insieme: layer 0, errori, retino, cartiglio, rotazione |

- **Locali veri** calcolati esattamente dai rettangoli pieni dei muri (anche quando un lato confina con muri di spessore diverso e ha un gradino).
- **Misura** (`tests/banco-cad/misura.mjs`): muri (richiamo e precisione sulla lunghezza degli assi, entro 4 cm; spessore esatto entro 5 mm), aperture (centro entro 20 cm, larghezza entro 15 cm, tipo porta/finestra), locali (trovati e con superficie entro l'1 %), tempo per pianta.
- **Comando**: `npm run banco:cad` (con `BANCO_MOTORE=cartella` si misura un'altra versione del motore, per il prima/dopo) (opzioni `--n 25`, `--json file`, `--dxf cartella` per salvare alcune piante in DXF e aprirle in un CAD). Gira anche nel workflow «Livelli di qualità»: risultato nel riepilogo dell'esecuzione.

| Stile ordinato | Stile difficile |
|---|---|
| ![](banco-cad/ordinato.png) | ![](banco-cad/difficile.png) |

In verde i muri veri (asse e spessore). Nero muri, rosso porte, blu finestre, ocra arredi, viola quote.

## Valori di partenza: motore attuale (13/11/2026)

Motore di «Da pianta e prospetti al 3D» (`editor-src/075-auto3d.js`) con lo stesso filtro dei layer dell'interfaccia. 200 piante, ~6 ms per pianta.

| stile | muri richiamo | muri precisione | spessore esatto | aperture trovate | aperture precisione | tipo giusto | locali trovati | locali ±1 % |
|---|---|---|---|---|---|---|---|---|
| **totale** | 97,1 % | 93,3 % | 99,7 % | 92,3 % | 94,0 % | 89,7 % | 98,6 % | 49,5 % |
| ordinato | 98,3 % | 97,9 % | 99,5 % | 93,6 % | 97,5 % | 88,6 % | 99,0 % | 67,4 % |
| inglese | 97,9 % | 98,3 % | 100,0 % | 92,9 % | 98,0 % | 87,5 % | 99,4 % | 66,9 % |
| layer0 | 98,8 % | 95,6 % | 100,0 % | 95,0 % | 96,1 % | 89,9 % | 99,2 % | 71,4 % |
| retinato | 98,4 % | 97,2 % | 99,9 % | 94,5 % | 97,2 % | 90,2 % | 100,0 % | 66,1 % |
| tavola | 98,0 % | 97,3 % | 100,0 % | 93,5 % | 98,4 % | 90,2 % | 100,0 % | 66,4 % |
| sporco | 97,8 % | 95,3 % | 100,0 % | 92,4 % | 95,8 % | 90,9 % | 99,7 % | 57,4 % |
| ruotato | 97,6 % | 97,4 % | 99,8 % | 92,1 % | 97,4 % | 91,4 % | 98,2 % | 0,0 % |
| difficile | 89,9 % | 67,8 % | 98,7 % | 84,0 % | 71,7 % | 89,0 % | 93,2 % | 0,7 % |

### Che cosa sbaglia, guardando le piante una per una

- **Un tramezzo mancato fonde più locali in uno** (un locale riconosciuto di 38 m² al posto di tre da 13, 9 e 7): un solo errore sui muri rovina la superficie di tutti i locali vicini. Per questo «locali ±1 %» è al 49,5 % anche con il 97 % dei muri trovati.
- **Locali su piante ruotate: mai esatti** (0 %): i locali si cercano su una griglia di 5 cm allineata agli assi e il contorno si raddrizza solo in orizzontale e verticale.
- **Lati dei locali su due muri di spessore diverso**: la griglia di 5 cm raddrizza il gradino e sbaglia la superficie di qualche punto percentuale.
- **Porte scorrevoli prese per finestre**: le due linee dell'anta nel vano sembrano il vetro.
- **Stile difficile**: precisione dei muri al 68 %, perché con tutto sul layer 0 le linee della cornice, del cartiglio e delle quote formano coppie parallele che sembrano muri.

### Attenzione

Sono piante sintetiche: più regolari dei disegni veri (muri solo ortogonali prima della rotazione, simboli standard). I valori sui disegni dello studio saranno più bassi; il **banco reale** si aggiunge quando il titolare fornisce 10–20 piante DWG (tenute fuori dal repository pubblico). Gli obiettivi del §9 di `docs/progetto-cad-bim.md` valgono sul banco reale.

## Fase B: regole migliori (13/11/2026)

Cinque interventi sul motore (`editor-src/075-auto3d.js`), ognuno misurato su questo banco:

1. **Pulizia del disegno** (`cleanSegs`): linee collineari spezzate, doppie o staccate fino a 3 cm unite; retini (famiglie fitte di linee corte oblique) tolti.
2. **Raddrizzamento** (`dominantAngle`): la pianta si ruota sulla sua direzione principale prima dell'analisi e il risultato torna all'orientamento del disegno.
3. **Muri di spessore raro** (un portante da 20 cm tra tramezzi da 10): accettati se le due facce si sovrappongono quasi per intero e il muro arriva ad altri muri ai due capi; scartati i «muri» che stanno dentro la fascia di un muro più spesso (linee del telaio di una finestra).
4. **Porte e finestre in fondo al muro**, vicino all'angolo: il vano arriva fino alla faccia del muro perpendicolare se c'è l'arco della porta o le linee del serramento. Era la causa principale dei locali fusi.
5. **Locali esatti sui vettori** (`vectorRooms`): con muri ortogonali (sempre, dopo il raddrizzamento) i locali si calcolano su una griglia fatta dalle coordinate dei muri, non su una griglia di 5 cm: superficie esatta anche con il gradino tra muri di spessore diverso. **Porte scorrevoli**: due ante sfalsate più corte del vano.

| Indicatore (200 piante) | prima | dopo | stile difficile prima → dopo |
|---|---|---|---|
| Muri trovati | 97,1 % | **99,7 %** | 89,9 % → 99,6 % |
| Muri giusti (precisione) | 93,3 % | **99,4 %** | 67,8 % → 98,4 % |
| Spessore esatto (±5 mm) | 99,7 % | **99,8 %** | 98,7 % → 99,9 % |
| Aperture trovate | 92,3 % | **98,3 %** | 84,0 % → 96,8 % |
| Aperture giuste | 94,0 % | **97,6 %** | 71,7 % → 95,2 % |
| Tipo porta/finestra giusto | 89,7 % | **99,6 %** | 89,0 % → 99,7 % |
| Locali trovati | 98,6 % | **99,6 %** | 93,2 % → 99,3 % |
| Locali con superficie ±1 % | 49,5 % | **95,2 %** | 0,7 % → 93,3 % |
| Tempo per pianta | 7.3 ms | 4.2 ms | |

Le piante sono sintetiche e il generatore lo abbiamo scritto noi, come il motore: c'è il rischio di adattare le regole ai nostri stessi disegni. Le regole sono generali (nessun valore preso dal generatore), ma la prova vera è il **banco reale** con le piante dello studio.

## Fase C: revisione guidata (13/11/2026)

- **Fiducia per ogni elemento** (`conf: {ok, why}` nel risultato di `A3.analyzePlan`): muro di spessore raro, capo libero o non collegato; vano senza simbolo, arco che non corrisponde alla larghezza, arco e vetro nello stesso vano; locale con superficie diversa da quella scritta nel disegno («14,50 m²», «mq 14.5») o molto piccolo.
- **Interfaccia** (scheda Importa → «Da pianta e prospetti al 3D»): «Riconosci» mostra l'anteprima a colori (muri, porte, finestre, locali; dubbi in giallo) e l'elenco dei dubbi; per ogni dubbio «Togli»/«Rimetti» e, per le aperture, Porta/Finestra; un clic evidenzia l'elemento. «Crea il modello BIM» applica le correzioni. Le correzioni sono legate alla posizione (5 cm) e **restano** se si cambiano layer, unità o ruoli dei disegni e il riconoscimento si rifà da solo.
![Revisione nel pannello Importa](banco-cad/revisione.png)

- **Misura**: «errori segnalati» = quota degli elementi sbagliati (muri falsi, aperture false o di tipo sbagliato, locali fuori dall'1 %) che sono tra i dubbi; «dubbi per pianta» = quanti elementi l'utente deve guardare.

| Indicatore (200 piante) | valore |
|---|---|
| Errori segnalati tra i dubbi | **82,4 %** |
| Dubbi per pianta (media) | **1** |

## Banco reale, primo giro (13/11/2026)

Il titolare ha fornito 7 tavole DWG di lavori reali (esecutivi, varianti, CILA). Restano **fuori dal repository pubblico**: qui solo numeri aggregati, senza nomi, indirizzi o immagini.

**Che cosa si è visto**
- 6 tavole su 7 si leggono con il lettore DWG dell'editor (1,5–50 s; da 11 mila a 860 mila linee; da 2 a 25 disegni per tavola). La settima (formato AutoCAD 2000) contiene solo un riferimento esterno o non viene letta da libredwg: va salvata come DXF.
- **Unità sbagliata nel file in 3 tavole su 6**: disegnate in centimetri, dichiarate in millimetri. Le piante risultavano 10 volte più piccole, porte e muri non tornavano e i disegni vicini si fondevano. Ora l'unità si ricava dalle porte (archi di un quarto di giro, 55–130 cm, sui layer di porte e infissi) e comanda anche sull'unità dichiarata.
- **Layer che confondono**: impianti elettrici (oltre 100 mila linee in una tavola), testi, superfici, scale, demolizioni, gronde, travi, librerie di blocchi. Il filtro dei layer ora li esclude.
- **Gradini delle scale** presi per muri: tolti dalla pulizia (almeno 6 linee parallele a passo regolare di 22–35 cm).
- **Layer dei muri come primo indizio** (`docs/progetto-cad-bim.md` §2.2): se la pianta ha un layer dei muri che porta almeno un quarto delle linee, le facce dei muri si cercano solo lì (porte e finestre si leggono da tutti i layer).
- Nomi dei locali puliti dalla superficie scritta accanto («Soggiorno mq 35,54» → «Soggiorno»).

Effetto sul banco sintetico (nessun peggioramento): locali con superficie ±1 % 95,2 → **96,6 %**, errori segnalati 82,4 → **87,1 %**, precisione muri 99,4 → **99,7 %**.

**Che cosa resta, sulle tavole vere**
- Muri del perimetro disegnati con **una sola linea** (verso l'unità confinante o la facciata): non formano una coppia di facce, il locale sul bordo non si chiude.
- Muri antichi con nicchie e spessore variabile spezzati in tratti.
- Riconoscimento del tipo di disegno (pianta, prospetto, sezione) debole: spesso «ignora» su piante vere. Nella revisione si sceglie a mano, ma va migliorato.
- Manca una misura automatica sulle tavole vere: serve annotare a mano almeno alcune piante (muri, aperture e locali giusti) per avere richiamo e precisione come sul banco sintetico.

## Banco reale, secondo giro: misura e punti 1–4 (13/11/2026)

**Misura sulle tavole vere** (`scripts/banco-reale.mjs`, dati privati fuori dal repository). La verità oggettiva sono le **superfici dei locali scritte dal progettista** («mq 14,50»): una superficie è ritrovata se il locale riconosciuto che la contiene ha la stessa area (entro l'1 % o il 3 %). Le piante sono i disegni con almeno 3 superfici scritte: 57 piante, 512 superfici in 6 tavole.

| Indicatore (banco reale) | primo giro | ora |
|---|---|---|
| Unità giusta della tavola | 3 su 6 | **6 su 6** (porte con l'anta: arco di un quarto + segmento lungo quanto il raggio) |
| Superfici scritte con un locale riconosciuto | 36,1 % | **47,9 %** |
| … con superficie esatta (±1 %) | 13,3 % | **17,2 %** |
| … entro il 3 % | 18,8 % | **25,4 %** |
| Piante riconosciute come piante (senza usare le superfici scritte) | 10,5 % | **94,7 %** |
| Prospetti e sezioni scambiati per piante | — | **0 su 22** |

Interventi, tutti misurati su entrambi i banchi (il sintetico non peggiora):
1. **Muri a linea singola**: una linea del layer dei muri senza faccia gemella, con muri perpendicolari che vi terminano da un solo lato (un muro che la attraversa non conta), diventa un muro di 30 cm verso il lato libero, segnato come dubbio «spessore stimato».
2. **Muri antichi e con nicchie**: con il layer dei muri si accetta ogni spessore da 5 a 80 cm senza chiedere che si ripeta; due tratti allineati che condividono una faccia e si toccano sono lo stesso muro. Lati dei locali agganciati alla faccia parallela più vicina a qualsiasi angolo (piante non ortogonali).
3. **Tipo di disegno**: le prove forti di una pianta (almeno 3 ante, superfici scritte) vincono sull'etichetta di un disegno vicino; etichette «piano quarto», «planimetria», «piano interrato»… (non «piano di lavoro»); tutte le piante della tavola restano piante (`kind`), una sola è proposta per il modello.
4. **Misura**: questo banco.

**Che cosa resta** (dalla distribuzione degli scarti): circa un terzo delle superfici ritrovate è esatto; il 30 % è fuori di oltre il 30 % perché **due o più locali si fondono** dove manca un muro (tramezzi su altri layer, muri disegnati come retino pieno, varchi senza spalle); una parte è più piccola dell'1–3 % sulle piante non ortogonali, dove il locale si calcola ancora sulla griglia di 5 cm. Sono i prossimi passi; servono anche tavole di altri studi, perché queste seguono tutte lo stesso standard di layer.

## Prossimo passo

Banco reale appena il titolare fornisce le piante; poi modello addestrato (fase D) per i disegni più disordinati e altezze e più piani (fase E).
