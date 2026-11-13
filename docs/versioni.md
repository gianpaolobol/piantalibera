# Versioni di Pianta Libera

Ogni versione importante viene **congelata** prima di un cambiamento grande, così si può sempre tornare indietro.
Una versione congelata è fatta di tre cose:

1. **un'etichetta nel codice** (`v0.5.0`): il codice esatto di quel momento;
2. **una release** su GitHub con il **pacchetto locale** di quella versione (`pianta-libera-X.Y.Z-locale.zip`), che funziona sul computer anche senza internet e non si aggiorna da solo;
3. le **istruzioni per ripubblicare** il sito e la demo da quella versione.

## Elenco

| Versione | Data | Contenuto | Release |
|---|---|---|---|
| **0.5.0** | 13/11/2026 | Versione prima del CAD 2D → BIM: editor completo, revisione 11/2026 con tutti i livelli di qualità (PR #50–#91) | https://github.com/gianpaolobol/piantalibera/releases/tag/v0.5.0 |
| 0.6.0 | in sviluppo | CAD 2D e riconoscimento CAD → BIM (`docs/progetto-cad-bim.md`) | — |

## Congelare una versione

GitHub → Actions → **«Versione»** → *Run workflow*: numero di versione (es. `0.6.0`), commit (vuoto = `main`), una riga di descrizione.
Il workflow ricostruisce il pacchetto locale da quel codice, lo prova senza internet, crea l'etichetta e la release.
Un'etichetta già esistente non viene mai spostata su un altro commit.

## Tornare a una versione

- **Solo per te, sul computer**: scarica il pacchetto della versione dalla sua release, estrai e avvia (guida: `docs/installazione-locale.md`). Puoi tenere più versioni in cartelle diverse.
- **Per tutti (sito e app)**: Actions → «Deploy su Cloudflare (editor + /api/render)» → *Run workflow* → in «Use workflow from» scegli l'etichetta (es. `v0.5.0`). Le app per Windows, Mac, Android e iOS aprono il sito, quindi seguono. Per la demo su GitHub Pages: lo stesso con «Demo su GitHub Pages». Per tornare all'ultima versione si rilancia da `main`.
- **Il codice**: `git checkout v0.5.0` (o «Browse files» dall'etichetta su GitHub).

## Progetti salvati

I file di progetto restano compatibili in avanti: un progetto della 0.5.0 si apre nelle versioni successive.
All'indietro si perde solo ciò che la versione vecchia non conosce, con un avviso (es. il disegno CAD della 0.6.0 aperto nella 0.5.0).
I progetti nel browser (raccolta progetti) sono comuni a tutte le versioni dello stesso sito: prima di tornare a una versione vecchia sul sito pubblicato conviene salvare i progetti importanti come file.
