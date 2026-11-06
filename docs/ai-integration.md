# Integrazione AI — contratto e sicurezza

## Stato

Il pulsante AI nella UI è volutamente non operativo: **nessuna chiamata ai modelli AI viene ancora eseguita**.

## Flusso previsto

1. Acquisire dal Canvas l'immagine RGB con camera e modalità (interni/esterni).
2. In futuro acquisire depth + normal pass per il controllo della geometria.
3. Inviare al backend `POST /api/render` con un job ID e asset temporanei.
4. Verificare account, quota per utente, CAPTCHA/Turnstile, dimensione file e budget globale.
5. Chiamare il provider cloud dal backend (mai inviare token al frontend).
6. Conservare temporaneamente il risultato e restituire un URL a scadenza.
7. Cancellare file di input/output secondo la retention dichiarata.

## Provider

Cloudflare Workers AI è il candidato iniziale. La disponibilità e l'interfaccia precisa di un modello image-to-image, le condizioni commerciali, i costi Neurons e i vincoli delle dimensioni vanno confermati sul modello effettivamente scelto **prima** di implementare il client API.

Alternativa di qualità: ComfyUI self-hosted con workflow depth/ControlNet, a costo di GPU.

## Accettazione

- Il render non deve essere dichiarato geometricamente fedele senza benchmark.
- Zero segreti in GitHub / browser.
- Quota server-side e kill switch contro costi imprevisti.
- Consenso esplicito per invio di file o progetti a terzi.
- Test interni ed esterni con materiali, aperture e geometrie di riferimento.
