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
