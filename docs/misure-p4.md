# Misure P4 — fedeltà geometrica e consumi reali (7/11/2026)

Workflow «Prove dal vivo» sul sito pubblicato (run 42380920221), modello `@cf/black-forest-labs/flux-2-klein-4b`, modalità fedele, uscita 1024×768, 5 scene × 3 seed.

## Metodo

Per ogni scena si confrontano i contorni (Sobel) del render con le linee del modello (spigoli dei muri, aperture, coperture, arredi) disegnate dalla stessa camera, a 512 px con tolleranza di 3 px:

- **recall**: quota delle linee del modello ritrovate nel render (quanto la geometria è conservata);
- **precisione**: quota dei contorni del render che corrispondono al modello (si abbassa con texture, vegetazione, ombre: non è un difetto in sé);
- **F1**: media armonica dei due.

Riferimenti: «vista 3D» = la vista dell'editor confrontata con le linee (massimo raggiungibile con texture); «altra scena» = il render di un'altra scena (livello del caso).

## Risultati

| Scena | F1 (3 seed) | Recall | Precisione | Vista 3D | Altra scena | Tempo |
|---|---|---|---|---|---|---|
| Esterno ad altezza d'uomo | 0,50 · 0,45 · 0,43 | 0,81 | 0,33 | 0,74 | — | 6,7 s |
| Volo d'uccello | 0,39 · 0,45 · 0,34 | 0,64 | 0,28 | 0,75 | 0,27 | 7,4 s |
| Interno arredato | 0,29 · 0,27 · 0,35 | 0,56 | 0,21 | 0,57 | 0,13 | 7,8 s |
| Due piani, tetto a padiglione | 0,55 · 0,54 · 0,53 | 0,80 | 0,40 | 0,73 | 0,30 | 7,5 s |
| Esterno al tramonto | 0,34 · 0,42 · 0,48 | 0,75 | 0,28 | 0,64 | 0,48* | 7,3 s |

Media su 15 render: **F1 0,42, recall 0,71, precisione 0,30**. *Per il tramonto l'«altra scena» è l'esterno diurno con la stessa camera, quindi non è un livello del caso.

Lettura: negli esterni il modello conserva circa l'80% delle linee del progetto; negli interni arredati poco più della metà (gli arredi vengono reinterpretati). Il render «fedele» è utile come immagine di atmosfera, non come vista di controllo: la dicitura nell'editor e nei termini resta corretta.

## Consumi reali (Analytics di Cloudflare)

| Giorno | Richieste | Neurons | Per render |
|---|---|---|---|
| 6/11 | 4 | 452 | 113 |
| 7/11 | 16 | 1.813 | 113 |

La stima del Worker (121 Neurons) è più alta del reale del 7%: il tetto `NEURON_DAILY_BUDGET = 9000` è prudente. Con i 10.000 Neurons gratuiti al giorno si stanno ~88 render a 1024×768.

## Quote decise il 7/11/2026

Tutto resta nella quota gratuita: visitatori 2 render al giorno ciascuno e 50 in totale (`VISITOR_NEURON_BUDGET = 6100`), proprietario senza limite per visitatore entro il tetto totale `NEURON_DAILY_BUDGET = 9500` (almeno ~28 render al giorno, fino a ~78). Le prove dal vivo contano come visitatori.

## Indicazioni di partenza

- `GLOBAL_DAILY = 50` resta sotto la soglia gratuita anche alla risoluzione massima (~30 render/giorno a 1920×1440 sono già fermati dal budget di Neurons).
- Per l'apertura al pubblico: `PER_IP_DAILY` da 10 a 2–3, così 50 render coprono 15–25 visitatori al giorno; `GLOBAL_DAILY` fino a 70 se si vuole restare nel gratuito a 1024×768.
- Ripetere la misura dopo ogni cambio di modello o di prompt: «Actions → Prove dal vivo → Run workflow».
