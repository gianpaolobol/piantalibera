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
