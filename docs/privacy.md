# Informativa sul render AI — bozza

> Bozza tecnica preparata con il codice, **da far verificare** (GDPR) prima dell'apertura al pubblico. Descrive ciò che il software fa oggi; titolare, contatti e base giuridica vanno completati dal proprietario del sito.

## Cosa resta nel tuo browser

Il progetto (pianta, modello 3D, materiali) è salvato solo nel tuo browser (`localStorage` e IndexedDB) e nei file che scarichi. Non viene inviato a nessun server finché non chiedi un render AI o non crei un link per il cliente.

## Cosa viene inviato quando chiedi un render AI

Solo dopo che hai spuntato la casella di consenso nel pannello «Render AI»:

- l'immagine della vista 3D corrente (fino a 512 px di lato) e, se attive, le mappe di profondità e di contorni della stessa vista;
- il prompt testuale e i parametri del render (dimensioni, seed, modalità fedele/creativa);
- la posizione della camera e il nome del progetto;
- un token anti-bot di Cloudflare Turnstile.

Non vengono inviati il file del progetto, le misure o altri dati personali.

## A chi

- **Backend del sito** (Worker Cloudflare, o backend PHP sull'hosting scelto), che applica quote e protezioni.
- **Fornitore del modello**: nella configurazione di test Cloudflare Workers AI, modello `@cf/black-forest-labs/flux-2-klein-4b`. Il fornitore effettivo è indicato nel pannello prima dell'invio (`/api/config`).
- **Cloudflare Turnstile** per la verifica anti-bot.

## Quanto tempo

- Immagini generate e stato del lavoro: cancellati automaticamente dopo **1 ora** (`RETENTION_SECONDS`); puoi cancellarli prima (`DELETE /api/render/:id`).
- Contatori delle quote: l'indirizzo IP **non** è salvato in chiaro, ma come hash con un sale segreto, insieme al numero di render del giorno; i contatori sono cancellati dopo 1–2 giorni.
- Il backend non conserva le immagini inviate oltre il tempo della richiesta (Worker) o oltre la retention (PHP).

## Link per il cliente e commenti

Solo se il progettista crea un link dalla scheda Esporta (con una casella di consenso):

- il progetto (pianta, modello, materiali, camere salvate) viene salvato sul server (KV di Cloudflare nel Worker, memoria nel server locale); **non** vengono inviati i prezzi del computo né i file dei modelli importati;
- chi ha il link vede il progetto in sola lettura e può lasciare commenti: un **nome** scelto da chi scrive, il **testo**, il punto in pianta e, se lo lascia spuntato, la vista 3D;
- link e commenti si cancellano da soli dopo **30 giorni**, o subito con «Elimina il link»; il token per modificare il link resta solo nel browser di chi l'ha creato (sul server c'è solo il suo hash);
- per limitare gli abusi, link e commenti contano in contatori giornalieri per IP salvato come hash, come per i render; creazione e commenti richiedono la verifica Turnstile quando è attiva.

## Galleria dei render e raccolta dei progetti

I render ottenuti e i progetti della raccolta «Progetti» restano nel browser (IndexedDB). Il ritocco con maschera invia al servizio di render l'immagine del render da ritoccare e il testo della richiesta, con le stesse regole del render AI.

## Limiti del risultato

Il render AI è un'immagine generata: anche in modalità «fedele» il modello può alterare dettagli di muri, aperture e coperture. Non è un elaborato tecnico.

## Da completare prima della pubblicazione

- Titolare del trattamento e contatti.
- Base giuridica (consenso esplicito, raccolto dalla casella nel pannello).
- Termini d'uso e trattamento dati del fornitore AI e di Turnstile (trasferimenti extra UE).
- Modello: FLUX.2 klein 4B, licenza Apache 2.0 (uso commerciale consentito); restano da leggere i termini di Cloudflare Workers AI sull'uso dei contenuti inviati.
