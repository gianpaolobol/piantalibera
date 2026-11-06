# Pubblicazione su Cloudflare (editor + /api/render)

Un solo Worker serve l'editor (`public/`, come asset statici) e l'API `/api/render`, che usa **Workers AI** con il modello `@cf/black-forest-labs/flux-2-klein-4b`. Nessuna chiave API: il modello si chiama tramite il binding `AI` del Worker.

## Una tantum

```bash
npm install
npx wrangler login
npx wrangler kv namespace create RENDER_KV          # copia l'id in worker/wrangler.toml
npx wrangler secret put IP_SALT --config worker/wrangler.toml          # stringa casuale lunga
npx wrangler secret put TURNSTILE_SECRET --config worker/wrangler.toml # facoltativo, vedi sotto
```

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
| `PER_IP_DAILY` | 2 | render al giorno per IP (IP salvati come hash) |
| `GLOBAL_DAILY` | 50 | tetto complessivo giornaliero = tetto di spesa |
| `KILL_SWITCH` | 0 | `1` sospende i render; senza nuovo deploy: `npx wrangler kv key put --binding RENDER_KV config:kill 1` |
| `RETENTION_SECONDS` | 3600 | lavori e immagini cancellati (TTL di KV) |
| `MAX_VARIANTS` | 1 | varianti per richiesta (max 2) |
| `ALLOWED_ORIGINS` | vuoto | origini ammesse oltre allo stesso dominio, separate da virgola |
| `MAX_INPUT_SIDE` | 512 | lato massimo delle immagini di riferimento accettato da klein |

Segreti: `IP_SALT`, `TURNSTILE_SECRET` (se impostato, ogni POST deve includere il token Turnstile nel campo `turnstile`; il widget nell'editor è il prossimo passo).

## Costi stimati (da verificare con l'uso reale)

Dalla pagina prezzi di Workers AI (novembre 2026): 10.000 Neurons gratuiti al giorno, poi $0,011 ogni 1.000. FLUX.2 klein 4B: 5,37 Neurons per riquadro 512×512 in ingresso e 26,05 per riquadro in uscita.

| Uscita | Riquadri | Neurons per render (con 3 immagini di riferimento) | Render gratuiti al giorno |
|---|---|---|---|
| 1024×768 | 4 | ~120 | ~80 |
| 1536×1152 | 9 | ~250 | ~40 |
| 1920×1440 | 12 | ~330 | ~30 |

`GLOBAL_DAILY = 50` a 1024×768 resta dentro la quota gratuita.

## Limiti noti

- Quote su KV: KV non è transazionale, con richieste simultanee il conteggio può sforare di poco. Per il pubblico passare a un Durable Object o a D1.
- Il Worker attende il modello nella stessa richiesta (klein a 4 passi è rapido). Per modelli lenti usare una coda (Queues) e lasciare `status: running`.
- La licenza d'uso commerciale di FLUX.2 klein 4B va confermata sui termini di Black Forest Labs prima dell'apertura al pubblico.
- La fedeltà geometrica non è garantita: le immagini di riferimento sono a 512 px e il modello non è un ControlNet. Va misurata sulle scene di prova (docs/editor.md).
