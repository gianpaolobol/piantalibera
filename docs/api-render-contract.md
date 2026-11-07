# Contratto API di render — `/api/render`

Versione 1.2 · 6 novembre 2026 · validazione condivisa in `shared/contract.js` · implementato da: Worker Cloudflare `worker/src/index.js` (Workers AI, FLUX.2 klein 4B), servizio di prova `server/mock-render-server.mjs`, backend PHP `server/php/api/render.php`, client `editor-src/08-ai.js` (preset «Backend Pianta Libera»).

Il client non conosce il fornitore AI. Manda la vista del modello e i metadati di scena; il backend sceglie il fornitore, tiene le chiavi, applica le quote.

## Creazione di un lavoro

`POST /api/render` · `Content-Type: application/json` · corpo massimo 20 MB (PHP) / 25 MB (prova)

```json
{
  "mode": "fedele",
  "scene": "esterni",
  "prompt": "Fotografia architettonica fotorealistica…",
  "negative_prompt": "cartoon, testo, filigrana",
  "image": "data:image/png;base64,…",
  "depth": "data:image/png;base64,…",
  "lines": "data:image/png;base64,…",
  "materials": "data:image/png;base64,…",
  "camera": {"position": [20, 4, 22], "target": [5.5, 1.5, 4], "fov": 45, "aspect": 1.33, "units": "m", "up": "y"},
  "params": {"strength": 0.45, "seed": 123, "variants": 1, "width": 1024, "height": 768, "use_guides": true},
  "project": {"name": "Casa unifamiliare"},
  "consent": true,
  "turnstile": "token Turnstile"
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `mode` | sì | `fedele` (conserva la geometria, uso architettonico) o `creativo` (può reinterpretare; va etichettato) |
| `scene` | no | `interni` / `esterni` |
| `prompt` | sì | max 4000 caratteri |
| `image` | sì | data URL PNG/JPEG/WebP, max 8 MB decodificati; con klein lato massimo 512 px (il client lo rispetta) |
| `depth`, `lines`, `materials` | no | stessi limiti; profondità (vicino = chiaro), contorni, zone dei materiali a colori piatti |
| `camera` | no | `position` e `target` in metri, `fov` verticale in gradi |
| `params.width/height` | no | interi 256–1920 px (dimensione del render in uscita) |
| `params.variants` | no | 1–2 |
| `consent` | sì | deve essere `true`: il visitatore ha accettato l'invio delle immagini al fornitore |
| `turnstile` | sì se il backend usa Turnstile | token del widget; chiave pubblica in `/api/config` |
| `params.use_guides` | no | `true` (predefinito): profondità e contorni vengono passati al modello come immagini di riferimento |

Risposta `202` (lavoro accodato) oppure `200` (completato subito, backend sincrono) oppure `502` (fornitore in errore). Intestazione `Location` con l'URL dello stato.

```json
{"id": "…", "status": "queued", "mode": "fedele", "created_at": "…", "expires_at": "…", "mock": true}
```

Il Worker e il PHP rispondono `200` anche con l'intestazione `X-Quota-Remaining` (render ancora disponibili oggi per quell'IP).

## Configurazione pubblica

`GET /api/config` (Worker, prova) · `GET render.php?config=1` (PHP)

```json
{"enabled": true, "reason": null, "provider": "Cloudflare Workers AI", "model": "@cf/black-forest-labs/flux-2-klein-4b", "generated": true,
 "turnstile_site_key": "0x4AAA…", "quota": {"per_ip_daily": 2, "used_today": 0}, "retention_seconds": 3600, "privacy": "…"}
```

`enabled: false` con `reason` (`config_incomplete`, `disabled`) quando il servizio non è attivo. Nessun segreto in questa risposta.

## Stato e risultato

`GET /api/render/:id` (Worker, prova) · `GET render.php?id=:id` (PHP) · immagini: `GET /api/render/:id/image/:n`

```json
{"id": "…", "status": "succeeded", "images": ["/api/render.php?id=…&img=0"], "expires_at": "…", "mock": false}
```

`status`: `queued` → `running` → `succeeded` | `failed` | `canceled`. Con `failed` c'è `error: {code, message}`.
`images` contiene URL (a scadenza) oppure data URL. `mock: true` indica il servizio di prova: l'immagine è la vista inviata, **non** un render AI, e l'interfaccia lo dichiara.

`DELETE /api/render/:id` → `204`, cancella lavoro e file.

## Errori

Sempre `{"error": {"code": "…", "message": "…"}}`.

| HTTP | code | quando |
|---|---|---|
| 400 | `invalid_json`, `invalid_input`, `invalid_id` | corpo o campi non validi |
| 400 | `consent_required` | manca `consent: true` |
| 403 | `origin_not_allowed`, `bot_check_failed` | origine diversa dal sito, Turnstile fallito |
| 404 | `not_found` | lavoro inesistente o scaduto |
| 413 | `too_large` | corpo o immagine oltre i limiti |
| 415 | `unsupported_media_type` | non JSON |
| 429 | `quota_exceeded`, `too_many_concurrent`, `global_quota_exceeded`, `budget_exceeded` | quota per IP, un lavoro alla volta, tetto di richieste, tetto di spesa in Neurons; `Retry-After` in secondi |
| 502 | `provider_error`, `invalid_provider_output` | fornitore irraggiungibile, in errore o in timeout; risposta che non è un PNG/JPEG/WebP valido |
| 503 | `disabled`, `config_incomplete` | kill switch attivo; configurazione di sicurezza incompleta (fail-closed) |

## Protezioni nel backend PHP

- Nessun inoltro libero: un solo fornitore configurato lato server, solo HTTPS, nessun redirect seguito (niente SSRF).
- Fail-closed con `PL_PROVIDER_MODE=forward`: senza `PL_IP_SALT` (≥ 16 caratteri), senza `PL_TURNSTILE_SECRET` (salvo `PL_ALLOW_NO_TURNSTILE=1` per prove private) o con URL non https il servizio risponde `503 config_incomplete`.
- Quote su file con lock: `PL_PER_IP_DAILY` (predefinito 2), `PL_MAX_CONCURRENT_PER_IP` (1) e `PL_GLOBAL_DAILY` (50). Gli IP sono salvati come hash con sale. Un render fallito torna all'utente, non al tetto globale.
- Risposta del fornitore accettata solo come `{"images": [data URL…]}` o `{"image": "<base64>"}`, con controllo dei byte iniziali (PNG/JPEG/WebP) e limite di 12 MB.
- `PL_KILL_SWITCH=1` sospende i nuovi render.
- Stessa origine (o elenco `PL_ALLOWED_ORIGINS`). Limiti di dimensione, formato, lato massimo e varianti.
- Retention: input e risultati cancellati dopo `retention_seconds` (1 ora). Cartella dati protetta da `.htaccess`; meglio fuori dalla web root.

Variabili d'ambiente (solo nomi): `PL_PROVIDER_MODE`, `PL_PROVIDER_URL`, `PL_PROVIDER_AUTH`, `PL_PROVIDER_TIMEOUT`, `PL_PROVIDER_NAME`, `PL_PROVIDER_MODEL`, `PL_KILL_SWITCH`, `PL_PER_IP_DAILY`, `PL_MAX_CONCURRENT_PER_IP`, `PL_GLOBAL_DAILY`, `PL_TURNSTILE_SECRET`, `PL_TURNSTILE_SITE_KEY`, `PL_ALLOW_NO_TURNSTILE`, `PL_ALLOWED_ORIGINS`, `PL_IP_SALT`, `PL_DATA_DIR`.

## Fornitore

Per i test: **Cloudflare Workers AI, `@cf/black-forest-labs/flux-2-klein-4b`** (decisione del proprietario, 6/11/2026). Il Worker manda in multipart `prompt`, `width`, `height`, `seed` e fino a tre `input_image_N` (vista, profondità, contorni), con un prompt che chiede di conservare camera, aperture e volumi. Il modello restituisce `{image: base64}`. Dettagli e costi in [deploy-cloudflare.md](deploy-cloudflare.md).

## Aperto

- Fedeltà geometrica da misurare sulle scene di prova; se insufficiente: ComfyUI con ControlNet depth/lineart (klein 9B solo per prove: licenza non commerciale).
- FLUX.2 klein 4B è sotto licenza Apache 2.0 (uso commerciale consentito, verificato il 7/11/2026); la 9B è sotto FLUX Non-Commercial License e non va usata in produzione senza un accordo con Black Forest Labs.
- Il backend PHP è sincrono (adatto all'hosting condiviso, limite pratico ~90 s). Per elaborazioni lunghe serve una coda vera (Worker + Queue, o servizio dedicato).
- Account utente e metriche di consumo. Informativa: [privacy.md](privacy.md) (bozza, da far verificare).
