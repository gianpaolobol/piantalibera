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
| `MODEL` | `@cf/black-forest-labs/flux-2-klein-4b` | per confronti: `@cf/black-forest-labs/flux-2-klein-9b` (molto più costoso) |
| `PER_IP_DAILY` | 10 (test) | render al giorno per IP (IP salvati come hash con sale) |
| `MAX_CONCURRENT_PER_IP` | 1 | lavori contemporanei per IP |
| `GLOBAL_DAILY` | 50 | richieste accettate al giorno in totale |
| `NEURON_DAILY_BUDGET` | 9000 | **tetto di spesa**: Neurons stimati impegnati al giorno; oltre → `429 budget_exceeded` prima di chiamare il modello |
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

Segreti: `IP_SALT`, `TURNSTILE_SECRET`. Ogni POST deve includere `consent: true` e il token Turnstile nel campo `turnstile`; l'editor mostra la casella di consenso e il widget quando legge `/api/config`.

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

Logica in `shared/share.js`, comune al Worker e al server locale. Progetti fino a 1,5 MB in KV con scadenza di 30 giorni (`share:<id>`, commenti in `sc:<id>`), token di modifica conservato solo come hash, 10 link e 40 commenti al giorno per IP (contatori nel Durable Object), Turnstile obbligatorio quando è configurato, scrivere richiede `IP_SALT`. Endpoint e formati sono descritti in testa a `shared/share.js`.

## Limiti noti

- La stima dei Neurons usa le tariffe pubblicate; se Cloudflare conteggia diversamente, il tetto reale va tarato sui dati del pannello.
- L'hash dell'IP limita gli abusi semplici, non chi cambia IP: Turnstile e il tetto globale restano la difesa principale.
- Il Worker attende il modello nella stessa richiesta (klein a 4 passi è rapido). Per modelli lenti usare una coda (Queues) e lasciare `status: running`.
- La licenza d'uso commerciale di FLUX.2 klein 4B va confermata sui termini di Black Forest Labs prima dell'apertura al pubblico.
- La fedeltà geometrica non è garantita: le immagini di riferimento sono a 512 px e il modello non è un ControlNet. Va misurata sulle scene di prova (docs/editor.md).
