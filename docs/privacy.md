# Privacy e termini — note tecniche

I testi per il pubblico sono in [`public/privacy.html`](../public/privacy.html) e [`public/termini.html`](../public/termini.html), pubblicati con l'editor e collegati da: pulsante «Info» nella barra in alto, finestra delle scorciatoie, casella di consenso del Render AI, casella di consenso del link per il cliente.

**Da completare dal proprietario prima dell'apertura al pubblico:** partita IVA ed e-mail del titolare (segnaposto «[da completare]» nelle due pagine). I testi sono stati preparati con il codice e conviene farli rileggere da un consulente privacy.

## Corrispondenza tra testo e codice

Quando cambia uno di questi comportamenti, va aggiornata l'informativa nello stesso PR.

| Nel testo | Nel codice |
|---|---|
| Render: immagine fino a 512 px, profondità, contorni, prompt, camera, nome del progetto | `editor-src/08-ai.js` (`vars`), contratto `shared/contract.js` |
| Consenso obbligatorio | `consent_required` in `worker/src/index.js`, casella `#aiConsent` |
| Immagini cancellate dopo 1 ora | `RETENTION_SECONDS` (`worker/wrangler.toml`), TTL di KV |
| IP solo come hash con sale | `IP_SALT` (segreto), `ipHash()` nel Worker; contatori nel Durable Object `QuotaGate` |
| Link per il cliente: 30 giorni, senza prezzi né modelli importati | `SHARE.ttlDays` in `shared/share.js`, `sharePayload()` in `editor-src/051-condivisione.js` |
| Nessun dato personale nei log | `console.log` del Worker: solo id, stato, durata, consumi |
| Fornitori terzi | Cloudflare (Workers, KV, Durable Objects, Workers AI, Turnstile), jsDelivr, Google Fonts, Poly Haven, GitHub Pages |

## Fornitore AI

Cloudflare dichiara che i contenuti elaborati da Workers AI non sono usati per addestrare modelli e non sono conservati oltre la richiesta, salvo la memorizzazione decisa dal cliente (per noi: le immagini in KV per 1 ora). Fonte: <https://developers.cloudflare.com/workers-ai/platform/privacy/>.

## Miglioramenti possibili

- Caratteri tipografici serviti dal sito invece che da Google Fonts (l'IP del visitatore non arriverebbe a Google).
- Librerie servite dal sito invece che da jsDelivr (come già fa il pacchetto locale).
