# Banco di prova di «Da foto al 3D»

Misura quanto la bozza 3D ricostruita da una foto corrisponde alla stanza vera. Workflow `.github/workflows/banco-foto.yml`
(parte sui rami `feature/foto-*` quando cambia il codice della ricostruzione, o a mano), script `scripts/banco-foto.mjs`.

- **Stanze sintetiche** (12, semi 100–111): l'editor genera stanze a geometria nota (soggiorno, pranzo, camera) con porte,
  finestre e arredi, le fotografa da una camera casuale e ricostruisce con la stessa catena del sito: segmentazione nel
  dispositivo (SegFormer), modello di stanza, analisi AI (Llama 4 Scout + DETR, salvata in `tests/fixtures/banco-foto/`
  per non spendere Neurons a ogni giro), unione, geometria. Gli errori contano solo gli elementi visibili nella foto.
- **Versioni fotorealistiche** (`REALE=1`): la stessa foto rifatta da FLUX.2 klein. Sembrano foto vere ma FLUX sposta un
  po' la geometria e aggiunge piante e persone: i loro errori di posizione sono un limite superiore.
- **Foto vere** (`FOTOVERE=1`, 8 foto Wikimedia Commons): senza misure vere; si guarda il modello 3D sovrapposto alla foto.
- Nel registro: `===IMG===` (foto annotate) e `===MAP===` (mappe delle etichette). `scripts/prova-stanza.mjs cartella`
  prova in locale il modello di stanza su quelle mappe, in un secondo per scena.

## Risultati (9/11/2026, stanze sintetiche)

| Misura | Prima (8/11) | Ora |
|---|---|---|
| Errore sugli spigoli della parete di fondo (media / mediana) | 10,9 % | 2,0 % / 0,5 % |
| Larghezza della stanza | 1,02 m | 0,11–0,15 m |
| Altezza della fotocamera | 0,16 m | 0,05 m |
| Aperture trovate (visibili) | 13 su 26 | 16 su 17, tutte sul muro giusto |
| Posizione lungo il muro | 0,65 m | 0,15–0,19 m |
| Davanzale / altezza dell'apertura | 0,26 / 0,38 m | 0,15–0,25 / 0,13–0,25 m |
| Arredi trovati (sintetiche / fotorealistiche) | 5 su 34 | 10 su 31 / 20 su 31 |

Le stanze sintetiche sono rese con materiali piatti, più difficili da riconoscere delle foto vere; la segmentazione su
CPU varia un poco da un giro all'altro (±0,1 m sulle aperture). Restano limiti: davanzale nascosto da un letto o da un
mobile (stimato a 90 cm), spigolo fuori dalla foto senza pareti laterali (la larghezza è un minimo), foto frontali senza
soffitto né pareti laterali (spigoli da posizionare a mano), arredi coperti da altri.

## Foto vere con misure vere (NYU Depth V2) — dal 10/11/2026

Workflow `.github/workflows/banco-nyu.yml`: 80 foto di interni veri (case, uffici, cucine, camere, aule) del dataset
NYU Depth V2, con la profondità misurata da un Kinect e le etichette di ogni oggetto (`scripts/nyu-estrai.py`: piano
del pavimento, altezza e inclinazione della fotocamera, posizione in pianta, quote e larghezza di porte, finestre e
arredi). Gratuito e senza limiti: usa solo i modelli nel dispositivo, nessuna chiamata a Workers AI. Il dataset resta
nella cache di GitHub Actions (licenza per la ricerca), non nel repository. `scripts/banco-nyu.mjs` ricostruisce con il
codice vero dell'editor e misura; sonde: `scripts/sonda-moge.py` (MoGe-2 in PyTorch), `scripts/sonda-rilevatore.mjs`.

| Su 80 foto vere | Prima (segmentazione + modello di stanza, **con** l'altezza della fotocamera data) | Ora (profondità + rilevatore, **nessuna misura**) |
|---|---|---|
| Inclinazione della fotocamera | 13,2° | 2,2° |
| Altezza della fotocamera | (data) | ±0,12 m |
| Oggetti riconosciuti (riquadro, famiglia giusta) | 234 / 401 | 253 / 401 |
| Oggetti collocati entro 1,5 m | 76 / 386 | 253 / 401 |
| Errore in pianta (mediana) | 0,96 m (27 %) | 0,41 m (17 %) |
| Larghezza delle aperture | 1,56 m | 0,26 m |
| Davanzale delle finestre | 0,73 m | 0,11 m |
| Sommità delle aperture | 1,02 m | 0,10 m |

Per famiglia (ora): sedie 52/69 riconosciute, errore 0,35 m; letti 18/21, 0,41 m; mobili 72/120, 0,47 m; finestre
27/34, 0,49 m; comodini 6/6; porte 9/27 (le porte aperte restano il punto debole). MoGe-2 da solo, con i contorni veri
degli oggetti, colloca a 0,22 m: il margine che resta è soprattutto nel riconoscimento e nei contorni.

## Iterazioni dell'11/11/2026 — 120 foto, gruppo di verifica separato

Il banco passa a 120 foto NYU: 80 per sviluppare (`svil`) e 40 tenute da parte per la **verifica** (181 oggetti, 51
ben visibili), mai usate per tarare le regole. Workflow `banco-varianti.yml`: confronta configurazioni dei modelli con
le variabili `SEG`, `DET`, `DETMIN`, `SAM`, `FLIP`, `DET2`, `DET2MIN`, `DET2LAB`.

Due misure, entrambe riportate:
- **riconosciuto** (rigida): un nostro elemento della famiglia giusta con IoU ≥ 0,3 sul singolo oggetto etichettato;
- **coperto**: un nostro elemento della famiglia giusta copre almeno il 60 % del riquadro. Serve perché NYU etichetta
  ogni anta di una fila di mobili, mentre l'editor crea un blocco unico (cucina, armadio): è corretto per il modello
  3D ma la misura rigida lo conta come mancato.

| Verifica, 40 foto | Prima (b2, soglia .45) | Computer (b5, soglia .3) | b5 + Grounding DINO porte .4 |
|---|---|---|---|
| Riconosciuti (rigida) | 126 / 181 (70 %) | 135 / 181 (75 %) | 136 / 181 |
| Coperti | 147 / 181 (81 %) | 150 / 181 (83 %) | 151 / 181 |
| Ben visibili coperti | 39 / 51 | 42 / 51 (82 %) | 42 / 51 |
| Falsi positivi | 120 | 134 | 143 |
| Errore in pianta (mediana) | 0,43 m | 0,38 m | 0,39 m |
| Tempo per foto (CPU di GitHub) | 12 s | 24 s | 44 s |

Altre prove:
- **Cucina**: riconosciuta anche da piano + lavello + mobili; le basi della cucina contano come un unico blocco. In
  verifica le cucine passano da 1/8 a 6/8.
- **SAM** (`slimsam-77`, contorni precisi): errore dei ben visibili da 0,40 a 0,33 m, ma il tempo sale a ~36 s.
  Resta disattivato (`F3_SAM.on`).
- **Rilevatori a vocabolario aperto**: OWLv2 su tutte le etichette porta molti falsi positivi in 35–49 s. Limitati
  alle sole porte, OWLv2 non finisce nel tempo e Grounding DINO guadagna 1 porta su 11 a costo di 9 falsi positivi in
  più, finestre peggiori e tempo doppio. Restano disattivati (`F3_DET2.on`).

Per famiglia (computer, verifica): sedie 33/43, contenitori 28/35, tavoli 16/22, finestre 11/15, letti 10/11,
cucina 4–6/8, **porte 4/11**. Le porte restano il punto debole. Il segmentatore le vede come parete (90–99 %), le porte
vetrate diventano finestre e i box doccia diventano portefinestre. Servono altri indizi: telai, salti di profondità,
contatto col pavimento.

Configurazione adottata: computer (puntatore fine, memoria ≥ 8 GB) SegFormer-b5 + D-FINE soglia .3; telefoni e tablet
SegFormer-b2 + soglia .45.

Il 100 % da una sola foto non è raggiungibile: oggetti coperti, fuori campo o ambigui non si vedono in un'immagine. La
strada per avvicinarsi passa da più foto della stessa stanza.
