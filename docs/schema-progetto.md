# Schema del progetto (versione 3)

Il progetto è un oggetto JSON: è ciò che l'editor salva nel browser (`localStorage` chiave `pianta-libera-v2`, raccolta in IndexedDB), che esporta con **Esporta → Progetto (.json)** e che invia al server quando crea un link per il cliente.

Ogni progetto che entra nell'editor (file, raccolta, link, salvataggio del browser) passa da `migrate()` → `sanitizeProject()` in `editor-src/09-init.js`: i valori fuori schema vengono corretti o scartati, mai eseguiti. Questa pagina descrive cosa resta dopo quel passaggio. Unità: **metri** e **gradi**; coordinate in pianta `[x, y]` con y verso il basso del disegno.

## Versioni

| Versione | Novità | Migrazione |
|---|---|---|
| 1 | Primo formato (nomi di libreria brevi: `divano`, `letto`…) | i nomi passano per `LIB_ALIASES` |
| 2 | Piani con quota e solaio, quote, camere, cielo, sole | — |
| 3 | Lati dei muri, posa e battiscopa, controsoffitto, luci, oggetti parametrici (scale, ringhiere), sito e sole da data/ora, tavole, prezzi del computo, link per il cliente | nessuna: i campi nuovi sono facoltativi |

Un progetto con versione superiore a quella dell'editor viene aperto comunque, con un avviso: i campi sconosciuti vengono ignorati.

## Radice

| Campo | Tipo | Note |
|---|---|---|
| `version` | numero | `3` |
| `app` | testo | `"Pianta Libera"` (solo nei file esportati) |
| `pid` | id | identità del progetto nella raccolta e nella galleria |
| `name` | testo ≤ 120 | |
| `levels` | `Level[]` | almeno uno |
| `walls`, `rooms`, `openings`, `objects`, `dims`, `cameras` | array | vedi sotto |
| `materials` | `{[chiave]: Materiale}` | materiali personalizzati |
| `sky` | `{kind:"asset", id}` oppure `{kind:"ph", id, url, nome}` | `url` solo Poly Haven |
| `sun` | `{az, el}` | gradi |
| `site` | `{auto, city, lat, lon, tz, dst, north, date:"AAAA-MM-GG", hour}` | sole da luogo, data e ora |
| `lightsMode` | `"auto"` · `"on"` · `"off"` | |
| `tav` | `{paper:"A4"…"A1", scale:50·100·200, color, chains, furniture, comp, sec:{axis:"x"·"z", pos, dir:±1}}` | impostazioni delle tavole |
| `prices` | `{[voce]: numero}` | prezzi unitari del computo (non inviati con il link per il cliente) |
| `share` | `{id, expires_at}` | link per il cliente attivo; il token per modificarlo resta fuori dal progetto |
| `imports` | `{[id]: {file, opts, source}}` | solo nei file esportati: modelli importati |

**id**: testo `[A-Za-z0-9_-]{1,64}`. Gli id non validi vengono sostituiti e i riferimenti aggiornati.

## Elementi

**Level** — `id`, `name`, `elev` (quota del pavimento), `height` (interpiano), `slab` (spessore del solaio), `roof` (`null` o `{type:"none"·"flat"·"gable"·"hip"·"shed", pitch, overhang, mat, ridge?:"x"·"y", dir?:"s"·"n"·"e"·"o"}`), `underlay` (`null` o sfondo: `{kind:"img"·"vec", src, ox, oy, mpp, k, opacity}`; immagini solo `data:`).

**Wall** — `id`, `level`, `a`, `b` (estremi), `thick`, `wtype` (tipo scelto: `t8`·`t10`·`t12` tramezzo, `p30` portante interno, `e55` esterno; assente = spessore libero), `layers` (`{core, insul}` solo per l'esterno con cappotto, metri), `height` (`null` = altezza del piano), `mat`, `matA`/`matB` (finitura dei due lati), `arc` (`{g, i, h, A, B}` per i muri ad arco, spezzati in segmenti dello stesso gruppo `g`).

**Room** — `id`, `level`, `name`, `pts` (poligono), `mat`, `lab` (posizione dell'etichetta), `ceilH`/`ceilMat` (controsoffitto), `tile` (`{scale, rot, ox, oy}` posa del pavimento), `skirt` (`{h, mat}` battiscopa). Facoltativo `slab` (`{t, k}`): solaio sotto il locale, spessore `t` in metri (0,02–1,5; senza = spessore del piano) e struttura `k` (`laterocemento`, `ca`, `predalles`, `legno`, `acciaio`, `vespaio`); usato nel 3D, nell'IFC (`IfcSlab` con `Pset_SlabCommon` e quantità) e nella scheda del locale.

**Opening** — `id`, `wall`, `t` (distanza dall'estremo `a` del muro), `w`, `h`, `sill`, `type:"door"·"window"`, `flip` (0–3), `style`, `shut`, facoltativo `alz` (solo porte: alzatina, soglia rialzata da terra in metri, 0–0,30; il vano e la porta partono da lì). Le portefinestre sono porte con `style:"portafinestra"`.

**Object** — `id`, `level`, `kind` (`"lib"` libreria, `"stair"` e `"rail"` parametrici, `"import"` modello importato, `"ph"` Poly Haven…), `ref`, `name`, `x`, `y`, `z`, `rot`, `scale`, `p` (parametri: numeri, booleani o chiavi), `light` (`{on, lm, k}` lumen e kelvin).

**Dim** — quota: `id`, `level`, `a`, `b`, `off`.

**Camera** — `id`, `name`, `pos`, `target` (`[x, y, z]`), `fov` (verticale), `photo` (facoltativo: foto ridotta di «Da foto al 3D», solo `data:image/…` fino a 600 kB; non va nel link per il cliente).

**Materiale** — `nome`, `color` (`#rgb`…`#rrggbbaa`), `rough`, `metal`, `size`, `opacity`, `map`/`normalMap`/`roughMap` (solo `data:image/…` o Poly Haven).

## Regole per chi modifica lo schema

1. Un campo nuovo e facoltativo non richiede una nuova versione, ma va aggiunto a `sanitizeProject()` (altrimenti viene conservato senza controlli) e a questa pagina.
2. Un cambiamento di struttura (campo rinominato, unità diversa) richiede `SCHEMA_VERSION + 1` e il passaggio di conversione in `migrate()`, con un test che apre un progetto della versione precedente.
3. Se il campo contiene dati personali o va inviato al server, aggiornare anche `public/privacy.html` e `sharePayload()`.
