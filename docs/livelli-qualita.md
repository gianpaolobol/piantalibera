# Livelli di qualità di Pianta Libera

Fase 2 della revisione (`docs/handoff-revisione.md` §8, report `docs/revisione-2026-11.md`). Fissati da Claude il
12 novembre 2026; il titolare può commentarli nella issue #1. Un livello non si abbassa per raggiungerlo: se si
rivela irraggiungibile se ne propone la modifica nella issue #1, con il motivo.

## Come si misura

| Sigla | Comando | Cosa produce |
|---|---|---|
| **B** | `npm run banco:cad` | `test-results/banco-cad.json`: riconoscimento CAD → BIM sul banco sintetico |
| **L** | `npm i --no-save axe-core@4 && npx playwright test -c playwright.livelli.config.mjs` | `test-results/livelli.json`: computo, coperture, IFC, DXF, persistenza, import, prestazioni, axe, UI |
| **V** | workflow «Varianti» (`.github/workflows/varianti.yml`) | tabella funzione × variante nel riepilogo dell'esecuzione |
| **E** | `npm run test:unit`, `npm run test:e2e` (CI «Build e test») | prove verdi / totali |
| **I** | `python3 -I scripts/valida-ifc-dxf.py` (IfcOpenShell, ezdxf) sui file prodotti da **L** | errori di schema IFC, errori di audit DXF |
| **G** | issue aperte con `[bug]`, `[prestazioni]`, `[accessibilità]` per gravità nel titolo | conteggio |
| **R** | percorso a mano descritto nella riga | valore annotato nel registro |

Tutte le misure di **L** girano su Chromium senza GPU (come in CI): i tempi sono relativi, servono a confrontare
un'iterazione con la precedente sulla stessa macchina.

## Livelli

### Affidabilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Issue aperte bloccanti | G | 0 (prima 2: #51, #69) | **0** | perdita di dati: nessuna tollerata |
| Issue aperte alte | G | 0 (prima 4: #52, #53, #55, #67) | **0** | misure sbagliate e funzioni principali bloccate non sono accettabili per un architetto |
| Riapertura dopo un salvataggio fallito nel browser | L `persistenza_dopo_quota` | ok (prima: persa) | **ok** | #51 |
| Valori fuori campo accettati all'apertura di un progetto | L `import_valori_fuori_campo` | 0 (prima 5) | **0** | #56 |
| Errori nella pagina nel percorso delle varianti | V «nessun errore» | ok su tutte le 15 varianti provate in CI | **ok su tutte** | |
| Avvio senza WebGL | R e prova `senza-webgl.spec.mjs` | messaggio chiaro + pianta 2D (prima: pagina vuota) | **messaggio chiaro + pianta 2D** | #67 |

### Funzionalità e correttezza

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Errore massimo del computo sulla stanza di riferimento (murature, finiture per lato, pavimento, battiscopa) | L `computo_errore_max_pct` | 0 % (prima 7,75 %) | **≤ 0,5 %** | un computo serve solo se i numeri coincidono con il calcolo a mano |
| Errore della copertura su pianta a L | L `copertura_L_errore_pct` | 0 % (prima 42,7 % sul valore esatto 70,09 m²) | **≤ 2 %** | #52; il 2 % lascia spazio allo sporto e alle approssimazioni |
| Errore del volume dei muri nell'IFC rispetto al netto atteso | L `ifc_volume_muri_errore_pct` | 0 % (prima 17,9 %) | **≤ 2 %** | #57: chi estrae quantità dall'IFC deve trovare gli stessi numeri del computo |
| Copertura delle funzioni MVP del confronto (report §4, righe «sì») | R | 10 su 15 (+ tetto su sagoma, giunzioni e Pset/materiali nell'IFC, cartiglio con dati, rapporto aeroilluminante) | **10 su 15** | priorità alle righe che bloccano il lavoro: tetto su sagoma, testi e quote associative, cartiglio con dati, rapporto aeroilluminante, sopraluce |

### Prestazioni

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Modifica di un muro nell'edificio di prova (4 piani, 400 locali, 1.200 arredi) | L `modifica_edificio_grande_ms` | 68 ms in locale, mediana di 9 modifiche (#91; ricostruzione per piano #77; prima 266–381 ms). Sulla CI condivisa un singolo campione andava da 58 a 200 ms: per questo la misura è ora la mediana di 9 | **≤ 100 ms** | oltre 100 ms la modifica non sembra più immediata |
| Mesh dell'edificio di prova | L `mesh_edificio_grande` | 2.425 (prima 9.625; #88, pezzi degli arredi uniti per materiale) | **≤ 2.500** | meno chiamate di disegno: vista 3D fluida anche su computer modesti |
| Storia di annulla dopo 20 modifiche con una texture da 3 MB | L `storia_annulla_MB` | 2,9 MB (prima 54,4 MB) | **≤ 5 MB** | #55; i telefoni hanno poca memoria per pagina |
| Primo disegno | Lighthouse o L (FCP) | 0,3–0,4 s | **≤ 1,0 s** (mantenere) | |

### Accessibilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Violazioni axe critiche e serie (WCAG 2.2 AA) sulle 5 schede | L `axe_critiche_serie` | 0 (prima 24) | **0** | #62 |
| Messaggi annunciati ai lettori di schermo (`aria-live`) | R | sì (prima no) | **sì** | |
| Focus visibile su tutti gli elementi raggiunti con Tab | R (report §3) | 40 su 40 | **tutti** (mantenere) | |

### UI/UX e usabilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Altezza occupata sopra le viste a 1440×900 | L `altezza_sopra_le_viste_px` | 48 px (prima 84) | **≤ 52 px** | #59: una sola riga d'intestazione |
| Testi troncati visibili a 1440×900 | L `testi_troncati` | 0 (prima 2) | **0** | #59 |
| Critiche U1–U12 del report risolte | R | 12 su 12 (U8 con #89) | **≥ 8 su 12, tutte le «media»** | |
| Punti di blocco nei 5 scenari | R (report §3) | 0 non già noti (tetto a L risolto; il DWG sul web richiede la rete per scelta, il pacchetto locale lo include) | **0** non già noti | |
| Euristiche di Nielsen, punteggio medio (0–4, tabella sotto) | R | 3,4 (prima 2,5) | **≥ 3,2** | nessuna euristica sotto 3 |

### Codice

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Prove unitarie e nel browser verdi | E | 69/69 unitarie (+10), 53/53 nel browser (+13: una o più per ogni bug chiuso) | **tutte verdi** + una prova per ogni bug chiuso | |
| Funzioni di calcolo provate con `node --test` (computo, aree, coperture, IFC) | R: moduli in `shared/` con test | 4 su 4 (IFC con #90: `tests/ifc.test.mjs`, riletto con web-ifc) | **4 su 4** | #64 |
| Vulnerabilità `npm audit` | `npm audit` | 0 | **0** | |
| `'unsafe-eval'` nella CSP della pagina | `public/index.html` | sì | **no** (solo nel worker del lettore DWG) — proposta di modifica, vedi sotto | report §5 |

### Interoperabilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Errori di schema IFC4 (IfcOpenShell) | I | 0 | **0** (mantenere) | |
| Pset e materiali nell'IFC | L `ifc_pset_e_materiali` | 6 / 4 sulla stanza di riferimento (prima 0 / 0) | **Pset_WallCommon, Pset_DoorCommon, Pset_WindowCommon e materiali su ogni elemento** | apribile con senso in Archicad, Revit, Bonsai |
| Layer DXF usati ma non dichiarati | L `dxf_layer_non_dichiarati` | 0 (prima 4) | **0** | alcuni CAD non creano i layer mancanti con colori e tipi di linea |
| Errori di audit DXF (ezdxf) | I | 0 | **0** (mantenere) | |

### Riconoscimento CAD → BIM (banco sintetico, `docs/banco-cad.md`)

Obiettivi del progetto (`docs/progetto-cad-bim.md` §9) misurati sul banco sintetico di 200 piante; i livelli definitivi valgono sul banco reale, quando il titolare fornisce le piante dello studio.

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Muri trovati (lunghezza) | B `muri_richiamo` | 99,7 % (prima 97,1 %) | **≥ 97 %** | ArchLine.XP dichiara 90–95 % |
| Muri giusti (precisione) | B `muri_precisione` | 99,4 % (prima 93,3 %) | **≥ 97 %** | |
| Porte e finestre trovate con il tipo giusto | B `aperture_richiamo` × `aperture_tipo` | 98,3 % × 99,6 % (prima 92,3 % × 89,7 %) | **≥ 95 %** | |
| Locali con superficie entro l'1 % | B `locali_area_1pct` | 95,2 % (prima 49,5 %) | **≥ 95 %** | |
| Errori segnalati tra i dubbi | B `errori_segnalati` | 82,4 % (nuovo) | **≥ 80 %** | chi rivede deve trovare gli errori tra i dubbi, non cercarli |
| Dubbi per pianta | B `dubbi_per_pianta` | 1 | **≤ 5** | |
| Tempo per pianta | B `ms` | ~4 ms | **≤ 3 s** | |

### Piattaforme

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Varianti con tutte le funzioni «ok» o «non applicabile» motivato | V | 15 su 15 (Firefox con finestra su schermo virtuale; Android e iOS aprono il sito pubblicato e girano su main) | **15 su 15** | |
| Prove su dispositivi reali (lista del report §8) | R: risposte del titolare | 0 su 16 | **16 su 16** | dipende dal titolare |

### Euristiche di Nielsen

Punteggio 0–4 sull'editor completo; tra parentesi il valore del 12/11 prima delle iterazioni.

| # | Euristica | Punti | Motivo |
|---|---|---|---|
| 1 | Visibilità dello stato | 4 (3) | «salvato hh:mm», suggerimento dello strumento intero, lunghezze dei muri visibili, messaggi annunciati |
| 2 | Linguaggio del mondo reale | 3 (3) | slogan tecnico tolto; resta «pacchetto AI» nella scheda Esporta |
| 3 | Controllo e libertà | 4 (2) | annulla/ripristina leggero, riapertura sempre all'ultima versione, conferme sulle eliminazioni |
| 4 | Coerenza | 4 (2) | azioni frequenti in cima a Esporta; un solo selettore del piano (U8) |
| 5 | Prevenzione degli errori | 3 (2) | tetti sulla sagoma, valori fuori campo corretti all'apertura, R.A.I. segnalato |
| 6 | Riconoscere invece di ricordare | 4 (3) | parola e scorciatoia sotto ogni icona, quote visibili, strumenti di ricalco solo quando servono |
| 7 | Flessibilità ed efficienza | 3 (3) | scorciatoie, misure digitate, menu contestuale |
| 8 | Estetica e minimalismo | 3 (2) | una riga d'intestazione, strumenti contestuali; il pannello del piano resta denso |
| 9 | Riconoscere e correggere gli errori | 3 (2) | messaggio chiaro senza WebGL, messaggi annunciati; i messaggi temporanei restano brevi |
| 10 | Aiuto e documentazione | 3 (3) | primi passi nel pannello, `?` con le scorciatoie, Info |
| | **Media** | **3,4** (2,5) | |

## Proposte di modifica dei livelli (da approvare nella issue #1)

- ~~**Mesh dell'edificio di prova ≤ 2.500**~~: ritirata, livello raggiunto con #88 (2.425 mesh) unendo per materiale i pezzi di ogni modello pronto; selezione, trascinamento, luci e porte nel 3D restano come prima.
- **`'unsafe-eval'` fuori dalla CSP**: lo chiede solo il lettore DWG (libredwg in WebAssembly con embind). Toglierlo vuol dire caricare il lettore in un worker con una CSP propria, che su GitHub Pages e nel pacchetto locale non si può impostare per un singolo file. Proposta: livello «`'unsafe-eval'` solo finché il lettore DWG non ha una build senza `new Function`», con la verifica che nessun altro modulo ne abbia bisogno (oggi è così).
- ~~**IFC con `node --test` (4 su 4)**~~: ritirata, livello raggiunto con #90: il calcolo dell'IFC è in `shared/ifc.js` e coperture e arredi arrivano già triangolati dal 3D, senza riscrivere la triangolazione.

### Euristiche di Nielsen (12/11/2026)

Punteggio 0–4 sull'editor completo (pianta, 3D, pannello, telefono); motivo in breve.

| # | Euristica | Punti | Motivo |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | «salvato hh:mm», suggerimenti per strumento; ma il suggerimento si tronca (U2) |
| 2 | Linguaggio del mondo reale | 3 | termini da architetto in italiano; slogan tecnico e «pacchetto AI» per il cliente (U9) |
| 3 | Controllo e libertà | 2 | annulla/ripristina e conferme ci sono; la riapertura può perdere lavoro (#51) |
| 4 | Coerenza | 2 | due selettori del piano (U8), azioni frequenti in posti diversi (U5) |
| 5 | Prevenzione degli errori | 2 | tetto su pianta a L e valori negativi accettati senza avviso (#52, #56) |
| 6 | Riconoscere invece di ricordare | 3 | parola sotto ogni icona con la scorciatoia; quote nascoste (U6) |
| 7 | Flessibilità ed efficienza | 3 | scorciatoie, misure digitate, menu contestuale |
| 8 | Estetica e minimalismo | 2 | pannello del piano con 25 controlli senza selezione, strumenti di ricalco sempre visibili (U3, U12) |
| 9 | Riconoscere e correggere gli errori | 2 | senza WebGL pagina vuota (#67); i messaggi in `#toast` spariscono e non sono annunciati |
| 10 | Aiuto e documentazione | 3 | `?` con tutte le scorciatoie, pagina Info; manca un percorso al primo avvio |
| | **Media** | **2,5** | |

## Registro delle iterazioni

| Data | PR | Indicatori cambiati |
|---|---|---|
| 12/11/2026 | #50, #66, #68 | misura iniziale |
| 12/11/2026 | #70 | computo: errore massimo 7,75 % → 0 % |
| 12/11/2026 | #72 | copertura su pianta a L: 42,7 % → 0 %; funzioni MVP +1 |
| 12/11/2026 | #71 | bloccanti 2 → 0; riapertura dopo quota: persa → ok |
| 12/11/2026 | #73 | avvio senza WebGL: pagina vuota → messaggio + pianta 2D; alte 4 → 2 |
| 12/11/2026 | #74 | storia di annulla: 54,4 → 2,9 MB; alte → 0 |
| 12/11/2026 | #75 | axe critiche e serie: 24 → 0; aria-live sì |
| 12/11/2026 | #76 | valori fuori campo: 5 → 0 |
| 12/11/2026 | #78 | volume muri IFC: 17,9 % → 0 %; Pset/materiali 0/0 → 6/4; layer DXF non dichiarati 4 → 0; funzioni MVP +2 |
| 12/11/2026 | #81 | funzioni MVP +2 (R.A.I., cartiglio) → 10 su 15 |
| 12/11/2026 | #79, #82, #83 | altezza sopra le viste 84 → 48 px; testi troncati 2 → 0; U1–U12 11 su 12; Nielsen 2,5 → 3,3 |
| 12/11/2026 | #84, #85 | funzioni di calcolo con node --test 0 → 3 su 4 |
| 12/11/2026 | #77 | modifica sull'edificio grande ≤ 100 ms (99 ms) |
| 12/11/2026 | #80 | varianti 12 → 15 su 15 |
| 12/11/2026 | #88 | mesh dell'edificio di prova 9.625 → 2.425 (livello ≤ 2.500) |
| 12/11/2026 | #89 | U1–U12 11 → 12 su 12; Nielsen 3,3 → 3,4 |
| 12/11/2026 | #90 | funzioni di calcolo con node --test 3 → 4 su 4 |
| 12/11/2026 | #91 | misura della modifica sull'edificio grande: mediana di 9 campioni invece di 3 (68 ms in locale) |
| 13/11/2026 | #94, #96 | banco CAD → BIM; muri 97,1 → 99,7 %, precisione 93,3 → 99,4 %, aperture 92,3 → 98,3 %, tipo 89,7 → 99,6 %, locali ±1 % 49,5 → 95,2 % |
| 13/11/2026 | fase C | revisione guidata: errori segnalati 82,4 %, 1 dubbi per pianta |
