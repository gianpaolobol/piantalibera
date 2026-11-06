# Pianta Libera

Web app per modellazione architettonica 3D e rendering di interni ed esterni.

## Stato

Prima versione (MVP) con editor 3D nel browser, viste esterno/interno, elementi parametrici di base, materiali, esportazione PNG e progetto JSON. L'integrazione con un servizio AI è predisposta a livello di interfaccia e API, **non è ancora attiva**.

## Avvio

```bash
npm install
npm run dev
```

Apri l'indirizzo locale stampato da Vite.

## Funzioni

- Modello iniziale di edificio con pareti, copertura e aperture schematiche.
- Vista esterna e vista interna navigabili con mouse o touch.
- Inserimento di volumi e arredi schematici.
- Modifica delle dimensioni e dei materiali dell'elemento selezionato.
- Esportazione di uno screenshot PNG.
- Salvataggio/apertura del progetto in JSON.
- Punto di integrazione separato per il rendering AI (nessuna API key nel frontend).

## Architettura

- React + Vite + Three.js tramite React Three Fiber e Drei.
- Rendering realtime WebGL locale al browser.
- Render AI in futuro: backend autenticato con rate limit, limiti di budget e provider configurabile.
- Mai chiamare direttamente API AI con credenziali dal browser.

## Limiti della prima versione

Questo è un prototipo di modellazione 3D, non un CAD/BIM. Aperture e coperture sono schematiche; il rendering fotorealistico AI e l'editing geometrico avanzato richiedono fasi successive. I render AI generativi possono modificare la geometria e devono essere verificati.

## Sicurezza

Non committare segreti, token o file .env. Prima di abilitare l'AI pubblicamente servono quota per utente, anti-abuso e controllo dei costi.

## Roadmap

1. Modellazione precisa: pareti, spessori, porte, finestre e quote metriche.
2. Import/export GLB/glTF e libreria materiali.
3. Backend di rendering AI: vista RGB + depth/normal + policy geometria.
4. Account, progetti salvati su server, limiti gratuiti e job asincroni.
5. Test di fedeltà geometrica e rilascio pubblico.
