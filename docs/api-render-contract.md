# Contratto API di render — `/api/render`

Versione 1.1 · 6 novembre 2026 · validazione condivisa in `shared/contract.js` · implementato da: Worker Cloudflare `worker/src/index.js` (Workers AI, FLUX.2 klein 4B), servizio di prova `server/mock-render-server.mjs`, backend PHP `server/php/api/render.php`, client `editor-src/08-ai.js` (preset «Backend Pianta Libera»).

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
  "turnstile": "token facoltativo"
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
| `params.use_guides` | no | `true` (predefinito): profondità e contorni vengono passati al modello come immagini di riferimento |

Risposta `202` (lavoro accodato) oppure `200` (completato subito, backend sincrono) oppure `502` (fornitore in errore). Intestazione `Location` con l'URL dello stato.

```json
{"id": "…", "status": "queued", "mode": "fedele", "created_at": "…", "expires_at": "…", "mock": true}
```

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
| 403 | `origin_not_allowed`, `bot_check_failed` | origine diversa dal sito, Turnstile fallito |
| 404 | `not_found` | lavoro inesistente o scaduto |
| 413 | `too_large` | corpo o immagine oltre i limiti |
| 415 | `unsupported_media_type` | non JSON |
| 429 | `quota_exceeded`, `global_quota_exceeded` | quota per IP o tetto giornaliero; `Retry-After` in secondi |
| 502 | `provider_error` | fornitore irraggiungibile o risposta senza immagini |
| 503 | `disabled` | kill switch attivo |

## Protezioni nel backend PHP

- Nessun inoltro libero: un solo fornitore configurato lato server, solo HTTPS, nessun redirect seguito (niente SSRF).
- Quote su file con lock: `PL_PER_IP_DAILY` (predefinito 2) e `PL_GLOBAL_DAILY` (predefinito 50). Gli IP sono salvati come hash con sale.
- `PL_KILL_SWITCH=1` sospende i nuovi render. Turnstile facoltativo con `PL_TURNSTILE_SECRET`.
- Stessa origine (o elenco `PL_ALLOWED_ORIGINS`). Limiti di dimensione, formato, lato massimo e varianti.
- Retention: input e risultati cancellati dopo `retention_seconds` (1 ora). Cartella dati protetta da `.htaccess`; meglio fuori dalla web root.

Variabili d'ambiente (solo nomi): `PL_PROVIDER_MODE`, `PL_PROVIDER_URL`, `PL_PROVIDER_AUTH`, `PL_PROVIDER_TIMEOUT`, `PL_KILL_SWITCH`, `PL_PER_IP_DAILY`, `PL_GLOBAL_DAILY`, `PL_TURNSTILE_SECRET`, `PL_ALLOWED_ORIGINS`, `PL_IP_SALT`, `PL_DATA_DIR`.

## Fornitore

Per i test: **Cloudflare Workers AI, `@cf/black-forest-labs/flux-2-klein-4b`** (decisione del proprietario, 6/11/2026). Il Worker manda in multipart `prompt`, `width`, `height`, `seed` e fino a tre `input_image_N` (vista, profondità, contorni), con un prompt che chiede di conservare camera, aperture e volumi. Il modello restituisce `{image: base64}`. Dettagli e costi in [deploy-cloudflare.md](deploy-cloudflare.md).

## Aperto

- Fedeltà geometrica da misurare sulle scene di prova; se insufficiente: klein 9B o ComfyUI con ControlNet depth/lineart.
- Licenza d'uso commerciale di FLUX.2 klein 4B da confermare sui termini di Black Forest Labs.
- Il backend PHP è sincrono (adatto all'hosting condiviso, limite pratico ~90 s). Per elaborazioni lunghe serve una coda vera (Worker + Queue, o servizio dedicato).
- Account utente, metriche di consumo e informativa privacy per l'invio delle immagini a terzi.
