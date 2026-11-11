# Scansione AR (ARKit) — prova

Dall'11/11/2026, nell'app per iPhone e iPad (`app-mobile/`): **Importa → Da foto al 3D → Scansione AR (prova)**.
Il pulsante compare solo nell'app iOS (la pagina riceve `window.PL_NATIVE.ar`). Modulo nativo:
`app-mobile/modules/pianta-ar/` (Swift, ARKit, nessuna libreria esterna).

## Cosa registra

Funziona su ogni iPhone/iPad con ARKit, anche **senza LiDAR** (per esempio iPhone 13 mini):

- **fotogrammi chiave** in JPEG (lato lungo 1920 px, orientamento del sensore, orizzontale), uno ogni 25 cm di
  spostamento o 17° di rotazione, più quelli scattati con «Scatta»; al massimo 90;
- per ogni fotogramma la **posizione e l'orientamento della fotocamera in metri** (mondo ARKit allineato alla gravità,
  y in alto) e gli **intrinseci** (fx, fy, cx, cy) riferiti all'immagine salvata;
- **punti 3D sparsi** visti dal tracciamento (fino a 300 per fotogramma);
- **piani** trovati da ARKit con la classe: pavimento, parete, soffitto, porta, finestra, tavolo, sedile; per ciascuno
  matrice, estensione e contorno;
- solo con **LiDAR**: profondità di ogni fotogramma (`depth/NNN.f32`, Float32, 256×192) e confidenza
  (`depth/NNN.conf`), superficie 3D classificata della stanza (`mesh.ply`).

Il file `scansione-AAAAMMGG-hhmmss.zip` contiene `capture.json` e le cartelle `frames/` e `depth/`. Alla fine l'app
apre la condivisione (Salva in File, AirDrop, Mail). La scansione non viene inviata a nessun server.

## Come si fa una scansione per il confronto

1. Luce accesa, porte aperte come si vogliono nel rilievo.
2. Dal centro della stanza, telefono verticale all'altezza degli occhi: gira lentamente su te stesso, poi lungo le
   pareti, inquadrando anche pavimento e soffitto. Le superfici riconosciute si colorano: pareti blu, pavimento
   verde, porte arancio, finestre azzurre.
3. Davanti a ogni porta e finestra fermati un attimo e premi **Scatta**.
4. **Fine** quando le pareti sono tutte colorate (1–2 minuti).
5. Misura a mano: lunghezza e larghezza della stanza, altezza, larghezza e altezza di ogni porta e finestra,
   altezza del davanzale. Sono il riferimento del confronto.

## Confronto con il motore da foto

`scripts/confronto-ar.mjs` legge lo zip e confronta, sugli **stessi fotogrammi**:

- **ARKit**: stanza dai piani (pareti, pavimento, soffitto), porte e finestre dai piani classificati, altezza della
  fotocamera dal pavimento;
- **motore locale** (quello di «Analizza nel dispositivo»): ogni fotogramma analizzato da solo, come una foto
  qualsiasi;

con le misure vere scritte in un file `misure.json` accanto allo zip (formato nello script). Risultati in
`docs/banco-foto.md`.
