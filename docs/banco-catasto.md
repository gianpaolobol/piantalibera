# Banco di prova — planimetrie catastali (ramo `feature/catasto`)

Decisione del titolare del 26/11/2026: si apre il ramo per il prodotto «Catasto» (spaccato assonometrico per agenzie)
**sullo stesso codice di Pianta Libera**, non come copia separata. Si unisce a `main` solo se il lettore delle
planimetrie supera le soglie qui sotto su planimetrie vere.

## Perché un banco a parte

Le planimetrie catastali arrivano come **PDF raster** (scansioni in bianco e nero, scala 1:200, spesso 1:100 per i
vani piccoli), non come DWG: il riconoscimento attuale lavora sui vettori (`docs/progetto-cad-bim.md`) e sul raster
è dichiarato indietro. Il banco misura il nuovo lettore prima di qualunque scelta di prodotto.

Caratteristiche che aiutano: muri pieni neri, convenzioni grafiche fisse, scala scritta, altezza «h = 2,70» e nomi
dei vani in testo, poche varianti. Che cosa complica: scansioni storte o sbiadite, più unità o piani nello stesso
foglio, timbri e riquadri, legenda, annotazioni a mano, planimetrie molto vecchie disegnate a mano.

## Materiale

- **Planimetrie vere**: 30–50 fornite dal titolare, anonimizzate (senza intestatari, indirizzi, dati catastali),
  in una cartella **fuori dal repository** (es. `../banco-catasto-privato/`), come le tavole del banco reale CAD.
  Le planimetrie si ottengono solo come intestatari o delegati: non si caricano mai online né nel repository.
- **Verità**: per ognuna, un file JSON nello schema del progetto (muri, aperture, vani con nome e superficie), disegnato
  a mano una volta nell'editor sopra la planimetria come sfondo (`underlay`).
- **Banco sintetico** (prima delle vere): piante del generatore di `tests/banco-cad` stampate «alla catastale»
  (muri pieni neri a 1:200, testi dei vani, cartiglio, rumore di scansione, rotazione ±2°), per sviluppare senza dati privati.

## Misure e soglie per proseguire

| Misura | Come | Soglia per unire a `main` |
|---|---|---|
| Muri | richiamo e precisione sugli assi, entro 10 cm a scala reale | ≥ 90 % dopo la revisione guidata, ≥ 80 % in automatico |
| Aperture | centro entro 20 cm, larghezza entro 15 cm, porta/finestra | ≥ 80 % |
| Vani | nome letto e superficie entro 3 % | ≥ 85 % |
| Scala | da testo «1:200» o dalla misura nota | 100 % (o richiesta all'utente) |
| Tempo | nel browser, telefono di fascia media | < 10 s per planimetria |

Regola invariata: nel dubbio segnalare, mai correggere in silenzio.

## Passi

1. Banco sintetico «catastale» e comando `npm run banco:catasto` (stesso formato di `banco:cad`).
2. Lettore: PDF → immagine (pdf.js, già incluso) → vettorializzazione dei muri pieni → grafo dei muri → aperture e vani
   con i testi; poi revisione guidata già esistente.
3. Prove sulle planimetrie vere (cartella privata), tabella dei risultati in questo documento.
4. Solo se le soglie sono raggiunte: modalità «Catasto» (carica → verifica → scarica) con lo spaccato assonometrico nel
   browser (Three.js) e, come extra, lo spaccato Blender «alta qualità».
