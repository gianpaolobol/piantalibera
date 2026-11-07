# CLAUDE.md — Pianta Libera: istruzioni condivise di progetto

> Handoff del 6 novembre 2026. Fonte: mandato del proprietario e pianificazione tecnica concordata con ChatGPT.
> Repository canonico: https://github.com/gianpaolobol/piantalibera
> **ATTENZIONE:** il proprietario dichiara che Claude sta già sviluppando il modellatore 3D e il livello di chiamata delle API di rendering. Non sostituire o sovrascrivere lavoro esistente senza prima ispezionare stato locale, branch e diff.

## Decisioni confermate dal proprietario — 6/11/2026 (annotate da Claude)

- **Codice canonico: l'editor in `editor-src/` → `public/`** (JavaScript + Three.js r147). Il prototipo React è archiviato nel branch `archivio/prototipo-react`.
- **Fornitore per i test: Cloudflare Workers AI, `@cf/black-forest-labs/flux-2-klein-4b`**, tramite il Worker in `worker/` (contratto in `docs/api-render-contract.md`).
- **Produzione su Cloudflare** (asset statici + Worker + KV); backend PHP in `server/php/` solo come alternativa.
- **Repository pubblico.**
- Stato, test e passi successivi: PR e issue di coordinamento #1.
- **Pacchetto locale sempre aggiornato** (richiesta del proprietario, 6/11/2026): il workflow `pacchetto.yml` lo ricostruisce e pubblica a ogni push su `main` (release `locale-latest`). Chi cambia avvio, requisiti, comandi o funzioni locali aggiorna nello stesso PR `docs/installazione-locale.md` (copia esterna: documento «Pianta Libera in locale — guida all'installazione» del proprietario).

## Visione e obiettivo

**Pianta Libera** è una web app di modellazione architettonica e rendering AI per **interni ed esterni**, fruibile via browser e destinata anche a visitatori che non pagano. L'utente modella un ambiente o un edificio, sceglie vista/camera, materiali e illuminazione, quindi produce un'immagine fotorealistica a partire **dalla scena modellata**, non soltanto da un prompt generico.

Obiettivi di progetto:
1. Editor tridimensionale fluido e usabile su desktop e, in forma adattata, su mobile/tablet.
2. Oggetti e geometria modificabili, con misure esplicite e possibilità di salvare/riaprire un progetto.
3. Rendering realtime nel browser come fallback, esportazione PNG e, quando implementato, render AI fotorealistico.
4. Integrità del progetto: **non alterare arbitrariamente** muri, porte, finestre, coperture, dimensioni, quote e prospettiva nei render pubblicizzati come fedeli. I modelli generativi possono comunque alterare dettagli; la fedeltà va testata e il risultato non è un elaborato tecnico certificato.
5. Piano gratuito sostenibile: limiti per utente e globali, protezione abusi e blocco spese impreviste.

## Stato al 7/11/2026 (aggiornato da Claude)

- Editor completo con le quattro fasi della roadmap d'interfaccia (docs/interfaccia-confronto.md, dettagli in docs/editor.md); PR #3–#18 unite su `main`.
- Online: Worker Cloudflare con render AI attivo (FLUX.2 klein 4B, Apache 2.0) e condivisione `/api/share`; demo statica su GitHub Pages; pacchetto locale `locale-latest`.
- Prove: 40 test unitari, 24 nel browser (in parallelo), pacchetto locale senza internet; workflow «Prove dal vivo» sul sito pubblicato (ogni lunedì e su richiesta).
- Licenza **AGPL-3.0**; pagina con CSP e SRI; informativa privacy e termini in `public/` (P.IVA ed e-mail del titolare da completare); schema del progetto v3 (`docs/schema-progetto.md`).
- P4 misurato il 7/11 (`docs/misure-p4.md`): 15 render reali, recall dei contorni 0,71 (F1 0,42), ~113 Neurons reali per render a 1024×768.
- Quote decise dal proprietario (7/11): tutto nella quota gratuita; visitatori 2/giorno e 50 in totale; proprietario senza limiti per visitatore tramite `OWNER_TOKEN` (solo il tetto totale). Link per il cliente in sola lettura o con modifica: area clienti con storico delle versioni, approvazione e «chiedi modifiche» (link con modifica: 90 giorni).
- Decisione del 7/11: per la demo resta tutto gratuito (editor, area clienti aperta a tutti, 2 render al giorno per visitatore, clienti compresi). In futuro i render AI diventeranno a pagamento (ipotesi: pacchetti con Stripe, 2 gratis al giorno), da progettare quando il proprietario lo chiede; servono conto Stripe e P.IVA.
- Aperti: P.IVA/e-mail nelle pagine legali (il proprietario le darà più avanti), fedeltà degli interni, avvisi e-mail tra progettista e cliente, pulsante «Area clienti» sul sito Cargo del proprietario (gianpaolofranceschiniarchitettura.cargo.site, da fare via browser).
- La fotografia del 6/11 (prototipo React) è superata: il prototipo resta nel branch `archivio/prototipo-react`.

## Indicazioni tecniche e architettura raccomandata

- Mantenere la struttura scelta da Claude quando già funzionante; React + Three.js/R3F è un punto di partenza, **non un vincolo per riscrivere codice valido**.
- Architettura modulare: editor/scena, modelli e materiali, persistente/import-export, acquisizione render pass, client render-jobs, backend AI e billing/quotas separati.
- Modellazione architettonica progressiva: muri con spessore, pavimenti, aperture parametriche, porte/finestre, coperture, arredamento, quote metriche, snapping, undo/redo; distinguere MVP da CAD/BIM professionale.
- Supportare export GLB/glTF quando la struttura 3D è sufficientemente stabile; mantenere uno schema progetto JSON versionato e validato per l'editor.
- Il motore di rendering deve ricevere snapshot **RGB + camera/scene metadata**, idealmente depth/normal/edge/mask per aumentare la conservazione geometrica.
- Considerare due modalità: **render fedele alla geometria** (prioritaria per uso architettonico, fallback 3D non generativo) e **render creativo AI** (può reinterpretare dettagli, da etichettare).
- Preset: interni/esterni, materiali, luce naturale/tramonto/notte, stile fotorealistico/contemporaneo/minimalista. Restituire output scaricabile e confronto prima/dopo.
- I provider AI vanno astratti tramite interfaccia (provider/adapter) senza legare l'editor a un modello specifico.

## Provider AI: scelta da validare, non integrazione già confermata

**Candidato iniziale:** Cloudflare Workers AI, con modello image-to-image idoneo (in pianificazione era stato indicato FLUX.2 Klein 4B). **Prima di implementare:** verificare disponibilità reale del modello via API, input supportati, prezzi correnti, quota gratuita, licenza/uso commerciale e compatibilità con image-to-image/depth. Non assumere che l'API garantisca fedeltà geometrica.

**Alternativa avanzata:** ComfyUI self-hosted con workflow depth/ControlNet e GPU disponibile, dietro un servizio/backend dedicato. È software gratuito, **non** calcolo GPU gratuito illimitato.

## Backend/render API: requisiti minimi

- **Mai mettere chiavi AI, segreti o token nel client o in git.** Chiavi soltanto in secret manager/variabili ambiente del backend.
- Separare `POST /api/render` (creazione job), `GET /api/render/:id` (stato e risultato) e opzionale `DELETE /api/render/:id`; schema input validato, limiti upload e formati, errori coerenti.
- Autenticazione o identità limitata, quote **server-side** per utente e IP, limitazione concorrenza, anti-bot (es. Turnstile), timeout, retry limitati, rate limit, kill switch / tetto budget giornaliero e metriche consumo.
- Non esporre un proxy AI aperto alla rete. Evitare abuso, SSRF, file malformati, injection lato prompt e uso indiscriminato di storage.
- Elaborazioni lunghe tramite job asincroni/queue quando supportate (non mantenere HTTP infinito); cleanup periodico degli input e output e policy di retention.
- Indicare al visitatore se dati, immagini o progetti sono trasmessi a fornitori terzi; valutare privacy/GDPR.
- Obiettivo commerciale iniziale: **servizio gratuito con quote limitate**; nessuna promessa di render illimitati o costo sempre zero. Le quantità per visitatore (es. 1–2/giorno) sono parametri **da testare** contro consumi reali.

## Qualità, collaudo e rilascio

- Prima di unire modifiche, verificare `npm install`, `npm run build`, eventuale lint/test e avvio Vite; introdurre test stabili.
- Suite di esempi: esterno residenziale con facciata/aperture/copertura, interno arredato con porte/finestre e materiali; fotografare prima/dopo e annotare differenze geometriche.
- Smoke test desktop e mobile: orbit, zoom, selezione, modifica, persistenza, export, gestione errori API.
- Se API non configurata, UI deve mostrare stato chiaro e non fingere generazione completata.
- Nessun deploy pubblico AI senza test spese/quote e protezioni.

## Coordinamento Claude ↔ ChatGPT

1. **Claude è il referente per lo sviluppo attivo del modellatore e della base delle chiamate API** secondo quanto comunicato dal proprietario.
2. Prima di modificare: `git status`, branch, ultime commit, file cambiati. Preservare i lavori non pubblicati; evitare force push e riscritture del branch principale.
3. Pubblicare modifiche incrementali su branch `feature/*` e aprire PR con screenshot, test eseguiti e note sui contratti API; non fare merge di codice non verificato.
4. Annotare nella PR o nella issue di coordinamento: funzionalità completate, provider usato e modello esatto, endpoint, variabili ambiente richieste (solo nomi, mai valori), limiti, CI, problemi aperti.
5. Le indicazioni qui sono **requisiti di allineamento, non ordine di sostituire il lavoro in corso**. In caso di conflitto tra questa bozza e implementazione recente di Claude, documentare le differenze e concordare una soluzione.
6. Una issue GitHub dedicata raccoglie decisioni, dubbi, stato e prossimi step. ChatGPT non può inviare direttamente messaggi a una sessione Claude privata: il collegamento operativo avviene tramite questo repository e le issue/PR.

## Priorità operative proposte

P0. Claude pubblica o segnala stato reale del proprio ramo, evitando conflitti con il prototipo.
P1. Build e collaudo minimo dell'editor 3D, salvataggio e caricamento.
P2. Documentazione del contratto backend AI, provider selezionato e mock funzionante.
P3. Prima generazione image-to-image reale, protetta e limitata a uso di test.
P4. Test fedeltà geometrica e costi per render, poi accesso gratuito ai visitatori.
P5. Evoluzione verso modellazione architettonica parametrica, import/export e UX rifinita.
