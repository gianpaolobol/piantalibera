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

- **Misura** (`tests/banco-cad/misura.mjs`): muri (richiamo e precisione sulla lunghezza degli assi, entro 4 cm; spessore esatto entro 5 mm), aperture (centro entro 20 cm, larghezza entro 15 cm, tipo porta/finestra), locali (trovati e con superficie entro l'1 %), tempo per pianta.
- **Comando**: `npm run banco:cad` (opzioni `--n 25`, `--json file`, `--dxf cartella` per salvare alcune piante in DXF e aprirle in un CAD). Gira anche nel workflow «Livelli di qualità»: risultato nel riepilogo dell'esecuzione.

| Stile ordinato | Stile difficile |
|---|---|
| ![](banco-cad/ordinato.png) | ![](banco-cad/difficile.png) |

In verde i muri veri (asse e spessore). Nero muri, rosso porte, blu finestre, ocra arredi, viola quote.

## Valori di partenza: motore attuale (13/11/2026)

Motore di «Da pianta e prospetti al 3D» (`editor-src/075-auto3d.js`) con lo stesso filtro dei layer dell'interfaccia. 200 piante, ~6 ms per pianta.

| stile | muri richiamo | muri precisione | spessore esatto | aperture trovate | aperture precisione | tipo giusto | locali trovati | locali ±1 % |
|---|---|---|---|---|---|---|---|---|
| **totale** | **97,1 %** | **93,3 %** | 99,7 % | **92,2 %** | 94,0 % | **89,7 %** | 98,5 % | **47,5 %** |
| ordinato | 98,3 % | 97,9 % | 99,5 % | 93,6 % | 97,5 % | 88,6 % | 99,0 % | 66,0 % |
| inglese | 97,9 % | 98,3 % | 100,0 % | 92,9 % | 98,0 % | 87,5 % | 99,4 % | 65,7 % |
| layer0 | 98,7 % | 95,5 % | 100,0 % | 94,8 % | 96,1 % | 89,9 % | 98,6 % | 69,2 % |
| retinato | 98,4 % | 97,2 % | 99,9 % | 94,5 % | 97,2 % | 90,2 % | 100,0 % | 62,1 % |
| tavola | 98,0 % | 97,3 % | 100,0 % | 93,5 % | 98,4 % | 90,2 % | 100,0 % | 63,6 % |
| sporco | 97,8 % | 95,3 % | 100,0 % | 92,4 % | 95,8 % | 90,9 % | 99,7 % | 53,6 % |
| ruotato | 97,6 % | 97,4 % | 99,8 % | 92,1 % | 97,4 % | 91,4 % | 98,2 % | 0,0 % |
| difficile | 89,9 % | 67,8 % | 98,7 % | 84,0 % | 71,6 % | 89,0 % | 93,2 % | 0,0 % |

### Che cosa sbaglia, guardando le piante una per una

- **Un tramezzo mancato fonde più locali in uno** (un locale riconosciuto di 38 m² al posto di tre da 13, 9 e 7): un solo errore sui muri rovina la superficie di tutti i locali vicini. Per questo «locali ±1 %» è al 47,5 % anche con il 97 % dei muri trovati.
- **Locali su piante ruotate: mai esatti** (0 %): i locali si cercano su una griglia di 5 cm allineata agli assi e il contorno si raddrizza solo in orizzontale e verticale.
- **Porte scorrevoli prese per finestre**: le due linee dell'anta nel vano sembrano il vetro.
- **Stile difficile**: precisione dei muri al 68 %, perché con tutto sul layer 0 le linee della cornice, del cartiglio e delle quote formano coppie parallele che sembrano muri.

### Attenzione

Sono piante sintetiche: più regolari dei disegni veri (muri solo ortogonali prima della rotazione, simboli standard). I valori sui disegni dello studio saranno più bassi; il **banco reale** si aggiunge quando il titolare fornisce 10–20 piante DWG (tenute fuori dal repository pubblico). Gli obiettivi del §9 di `docs/progetto-cad-bim.md` valgono sul banco reale.

## Prossimo passo (fase B)

Regole migliori, misurate su questo banco: tavola e cartiglio esclusi prima di cercare i muri, pulizia topologica, grafo dei muri con giunzioni, locali calcolati sui vettori (non sulla griglia) e a qualsiasi angolo, porte scorrevoli riconosciute.
