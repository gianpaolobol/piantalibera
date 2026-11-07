# Pubblicazione su Cloudflare (editor + /api/render)

Un solo Worker serve l'editor (`public/`, come asset statici) e l'API `/api/render`, che usa **Workers AI** con il modello `@cf/black-forest-labs/flux-2-klein-4b`. Nessuna chiave API: il modello si chiama tramite il binding `AI` del Worker.

## Deploy automatico da GitHub (consigliato)

Il workflow `.github/workflows/deploy-cloudflare.yml` fa tutto da solo: crea il namespace KV, crea il widget Turnstile per `pianta-libera.<sottodominio>.workers.dev`, pubblica il Worker, imposta `TURNSTILE_SECRET` e genera `IP_SALT` (una volta sola), poi controlla `/api/config`.

Una tantum:

1. Cloudflare → *My Profile → API Tokens → Create Token → Create Custom Token*, con questi permessi (Account Resources: il tuo account):
   - Account · **Workers Scripts** · Edit
   - Account · **Workers KV Storage** · Edit
   - Account · **Turnstile** · Edit
   - Account · **Workers AI** · Read
   - Account · **Account Settings** · Read
   - User · **User Details** · Read · User · **Memberships** · Read
2. GitHub → *Settings → Secrets and variables → Actions → New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = il token appena creato
   - `CLOUDFLARE_ACCOUNT_ID` = l'ID dell'account (pannello Cloudflare, *Workers & Pages*, colonna destra)
3. GitHub → *Actions → Deploy su Cloudflare → Run workflow*. Il riepilogo del run riporta l'indirizzo.

Se l'account non ha mai usato Workers, apri una volta *Workers & Pages* nel pannello per creare il sottodominio `workers.dev`. Senza i due secrets il workflow si salta da solo. Dopo il primo deploy, ogni push su `main` che tocca `worker/`, `shared/` o `public/` ripubblica.

Sul piano gratuito di Workers, oltre i 10.000 Neurons al giorno le chiamate falliscono invece di essere addebitate; il tetto `NEURON_DAILY_BUDGET` (9000) le ferma prima.

## Deploy manuale (in alternativa)

```bash
npm install
npx wrangler login
npx wrangler kv namespace create RENDER_KV          # copia l'id in worker/wrangler.toml
npx wrangler secret put IP_SALT --config worker/wrangler.toml          # stringa casuale ≥ 16 caratteri (es. openssl rand -hex 24)
npx wrangler secret put TURNSTILE_SECRET --config worker/wrangler.toml # dal pannello Turnstile; la chiave pubblica va in TURNSTILE_SITE_KEY
```

Il Durable Object `QuotaGate` (quote atomiche) si crea al primo deploy con la migrazione `v1` già presente in `wrangler.toml`.

**Fail-closed:** se manca `IP_SALT` (o è un valore d'esempio), se mancano `TURNSTILE_SECRET`/`TURNSTILE_SITE_KEY`, o se mancano i binding `AI`, `RENDER_KV`, `QUOTA`, il Worker risponde `503 config_incomplete` e non chiama il modello. `GET /api/config` dice se il servizio è attivo e perché. Solo in locale (`wrangler dev`) si può saltare Turnstile con `ALLOW_NO_TURNSTILE=1` in `worker/.dev.vars`.

## Pubblicare

```bash
npm run build            # verifica che public/index.html sia aggiornato
npm run deploy:cloudflare
```

L'indirizzo è `https://pianta-libera.<tuo-account>.workers.dev/`; un dominio personalizzato si aggiunge dal pannello Cloudflare.

## Parametri (worker/wrangler.toml → [vars])

| Nome | Predefinito | Note |
|---|---|---|
| `MODEL` | `@cf/black-forest-labs/flux-2-klein-4b` | per confronti: `@cf/black-forest-labs/flux-2-klein-9b` (molto più costoso e solo non commerciale) |
| `PER_IP_DAILY` | 2 | render al giorno per visitatore (IP salvati come hash con sale) |
| `TEST_DAILY` | 20 | render al giorno riservati alle prove automatiche (solo con il segreto `TEST_TOKEN`) |
| `MAX_CONCURRENT_PER_IP` | 1 | lavori contemporanei per IP |
| `GLOBAL_DAILY` | 50 | render al giorno di tutti i visitatori insieme (il proprietario non conta) |
| `NEURON_DAILY_BUDGET` | 9500 | **tetto di spesa totale** (visitatori + proprietario): Neurons stimati al giorno, sotto i 10.000 gratuiti; oltre → `429 budget_exceeded` prima di chiamare il modello |
| `VISITOR_NEURON_BUDGET` | 6100 | parte del tetto usabile dai visitatori (≈50 render a 1024×768): il resto (≈28 render) resta sempre al proprietario |
| `OWNER_MAX_CONCURRENT` | 2 | render contemporanei del proprietario |
| `NEURONS_PER_OUTPUT_TILE` / `NEURONS_PER_INPUT_TILE` | 26.05 / 5.37 | tariffe klein 4B usate per la stima; aggiornarle se cambiano |
| `PROVIDER_TIMEOUT_MS` | 60000 | oltre, il lavoro è `failed` |
| `TURNSTILE_SITE_KEY` | vuoto | chiave pubblica del widget, letta dall'editor via `/api/config` |
| `KILL_SWITCH` | 0 | `1` sospende i render; senza nuovo deploy: `npx wrangler kv key put --binding RENDER_KV config:kill 1` |
| `RETENTION_SECONDS` | 3600 | lavori e immagini cancellati (TTL di KV) |
| `MAX_VARIANTS` | 1 | varianti per richiesta (max 2) |
| `ALLOWED_ORIGINS` | vuoto | origini ammesse oltre allo stesso dominio, separate da virgola |
| `MAX_INPUT_SIDE` | 512 | lato massimo delle immagini di riferimento accettato da klein |
| `SHARE_ENABLED` | 1 | link per il cliente e commenti (`/api/share`); `0` li disattiva (i link esistenti restano leggibili fino alla scadenza) |
| `SHARE_DAILY_WRITES` | 300 | tetto globale di link, aggiornamenti e commenti al giorno: protegge le 1.000 scritture KV gratuite al giorno |

Segreti: `IP_SALT`, `TURNSTILE_SECRET`, facoltativo `OWNER_TOKEN`. Ogni POST deve includere `consent: true` e il token Turnstile nel campo `turnstile`; l'editor mostra la casella di consenso e il widget quando legge `/api/config`.

Contabilità (Durable Object, per giorno UTC): la prenotazione controlla in un'unica operazione quota IP, concorrenza, tetto di richieste e tetto di Neurons. Se il modello fallisce, il render torna all'utente ma i Neurons stimati restano conteggiati (una chiamata fallita può essere fatturata).

## Costi stimati (da verificare con l'uso reale)

Dalla pagina prezzi di Workers AI (novembre 2026): 10.000 Neurons gratuiti al giorno, poi $0,011 ogni 1.000. FLUX.2 klein 4B: 5,37 Neurons per riquadro 512×512 in ingresso e 26,05 per riquadro in uscita.

| Uscita | Riquadri | Neurons per render (con 3 immagini di riferimento) | Render gratuiti al giorno |
|---|---|---|---|
| 1024×768 | 4 | ~120 | ~80 |
| 1536×1152 | 9 | ~250 | ~40 |
| 1920×1440 | 12 | ~330 | ~30 |

Con `NEURON_DAILY_BUDGET = 9000` la spesa stimata resta sotto i 10.000 Neurons gratuiti, qualunque sia la risoluzione richiesta. La stima è nostra: confrontarla con il consumo reale nel pannello Workers AI durante i test.

## Condivisione con il cliente (`/api/share`)

Logica in `shared/share.js`, comune al Worker e al server locale. Progetti fino a 1,5 MB in KV con scadenza di 30 giorni (`share:<id>`, commenti in `sc:<id>`, proposta del cliente in `sp:<id>`), token del progettista conservato solo come hash, 10 link, 40 commenti e 20 invii di modifiche al giorno per IP (contatori nel Durable Object), Turnstile obbligatorio quando è configurato (non per il proprietario), scrivere richiede `IP_SALT`. Endpoint e formati sono descritti in testa a `shared/share.js`.

Due modalità, scelte alla creazione e cambiabili dopo: **sola lettura** (il cliente guarda e commenta) e **con modifica** (il cliente usa l'editor completo e invia le modifiche). La chiave di modifica è nel frammento del link (`#modifica=…`), che il browser non manda al server; le modifiche restano nel browser del cliente finché non le invia e al progettista arrivano come proposta da aprire (con Annulla per tornare indietro) o scartare. Tornando in sola lettura la chiave viene invalidata; riattivando le modifiche se ne crea una nuova.

## Modalità proprietario (`OWNER_TOKEN`)

Il proprietario del sito non ha il limite per visitatore né il tetto dei visitatori e non deve risolvere Turnstile; resta soltanto il tetto totale `NEURON_DAILY_BUDGET`, così tutto rimane nella quota gratuita di Workers AI. Con i valori predefiniti ha sempre almeno ~28 render al giorno a 1024×768 e fino a ~78 nei giorni in cui i visitatori non ne usano.

Attivazione, una volta sola:

1. GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**: nome `OWNER_TOKEN`, valore una frase inventata di almeno 16 caratteri (non usarla altrove).
2. **Actions → Deploy su Cloudflare → Run workflow** (oppure aspetta il prossimo aggiornamento): il workflow copia il segreto nel Worker.
3. Nell'editor: scheda **Render AI → Sei il proprietario del sito?** → incolla la stessa frase → Attiva. Resta solo in quel browser; va ripetuto su ogni dispositivo.

Per cambiarlo basta aggiornare il segreto su GitHub e ripubblicare. Il codice viaggia solo verso lo stesso sito (`X-Owner-Token`).

## Prove sul sito pubblicato (workflow «Prove dal vivo»)

`.github/workflows/prove-dal-vivo.yml`, avviabile da **Actions → Prove dal vivo → Run workflow** (e ogni lunedì, senza render). Apre il sito vero con un browser e controlla: caricamento dell'editor senza errori né violazioni della Content Security Policy, `/api/config`, creazione, lettura, commento e cancellazione di un link per il cliente. Con l'opzione «fedeltà» fa anche **5 scene × 3 render** reali e misura quanto i contorni del render coincidono con quelli del modello (`scripts/prove-dal-vivo.mjs`, risultati nel riepilogo e nell'artefatto `prove-dal-vivo`).

Per non dover risolvere Turnstile, il workflow crea un segreto temporaneo `TEST_TOKEN` (48 caratteri casuali, mascherato nei log), lo passa nell'intestazione `X-Test-Token` e lo cancella alla fine. Il token sostituisce solo la verifica anti-bot: le richieste usano un contatore a parte (`TEST_DAILY`) e restano soggette a tetto globale, budget di Neurons e kill switch. Senza il segreto (cioè sempre, fuori dalle prove) l'intestazione è ignorata.

Il passo «Consumo reale» legge dalle Analytics di Cloudflare i Neurons effettivamente consumati per modello: serve che il token `CLOUDFLARE_API_TOKEN` abbia anche il permesso **Account Analytics: Read**; altrimenti il passo lo segnala e prosegue.

## Limiti noti

- La stima dei Neurons usa le tariffe pubblicate; se Cloudflare conteggia diversamente, il tetto reale va tarato sui dati del pannello.
- L'hash dell'IP limita gli abusi semplici, non chi cambia IP: Turnstile e il tetto globale restano la difesa principale.
- Il Worker attende il modello nella stessa richiesta (klein a 4 passi è rapido). Per modelli lenti usare una coda (Queues) e lasciare `status: running`.
- FLUX.2 klein 4B è sotto licenza Apache 2.0 (uso commerciale consentito, verificato il 7/11/2026); la 9B è sotto FLUX Non-Commercial License e non va usata in produzione senza un accordo con Black Forest Labs.
- La fedeltà geometrica non è garantita: le immagini di riferimento sono a 512 px e il modello non è un ControlNet. Va misurata sulle scene di prova (docs/editor.md).
