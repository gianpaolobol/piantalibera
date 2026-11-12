# Livelli di qualità di Pianta Libera

Fase 2 della revisione (`docs/handoff-revisione.md` §8, report `docs/revisione-2026-11.md`). Fissati da Claude il
12 novembre 2026; il titolare può commentarli nella issue #1. Un livello non si abbassa per raggiungerlo: se si
rivela irraggiungibile se ne propone la modifica nella issue #1, con il motivo.

## Come si misura

| Sigla | Comando | Cosa produce |
|---|---|---|
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

| Indicatore | Metodo | Attuale (12/11) | Livello | Motivo |
|---|---|---|---|---|
| Issue aperte bloccanti | G | 1 (#51) | **0** | perdita di dati: nessuna tollerata |
| Issue aperte alte | G | 4 (#52, #53, #55, #67) | **0** | misure sbagliate e funzioni principali bloccate non sono accettabili per un architetto |
| Riapertura dopo un salvataggio fallito nel browser | L `persistenza_dopo_quota` | persa | **ok** | #51 |
| Valori fuori campo accettati all'apertura di un progetto | L `import_valori_fuori_campo` | 5 | **0** | #56 |
| Errori nella pagina nel percorso delle varianti | V «nessun errore» | ok su Chromium e WebKit | **ok su tutte** | |
| Avvio senza WebGL | R: Chrome con `--disable-webgl` | pagina vuota | **messaggio chiaro + pianta 2D** | #67 |

### Funzionalità e correttezza

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Errore massimo del computo sulla stanza di riferimento (murature, finiture per lato, pavimento, battiscopa) | L `computo_errore_max_pct` | 7,75 % (finitura interna) | **≤ 0,5 %** | un computo serve solo se i numeri coincidono con il calcolo a mano |
| Errore della copertura su pianta a L | L `copertura_L_errore_pct` | 45,3 % | **≤ 2 %** | #52; il 2 % lascia spazio allo sporto e alle approssimazioni |
| Errore del volume dei muri nell'IFC rispetto al netto atteso | L `ifc_volume_muri_errore_pct` | 17,9 % | **≤ 2 %** | #57: chi estrae quantità dall'IFC deve trovare gli stessi numeri del computo |
| Copertura delle funzioni MVP del confronto (report §4, righe «sì») | R | 5 su 15 | **10 su 15** | priorità alle righe che bloccano il lavoro: tetto su sagoma, testi e quote associative, cartiglio con dati, rapporto aeroilluminante, sopraluce |

### Prestazioni

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Modifica di un muro nell'edificio di prova (4 piani, 400 locali, 1.200 arredi) | L `modifica_edificio_grande_ms` | 266 ms | **≤ 100 ms** | oltre 100 ms la modifica non sembra più immediata |
| Mesh dell'edificio di prova | L `mesh_edificio_grande` | 9.625 | **≤ 2.500** | istanze e unione per materiale |
| Storia di annulla dopo 20 modifiche con una texture da 3 MB | L `storia_annulla_MB` | 54,4 MB | **≤ 5 MB** | #55; i telefoni hanno poca memoria per pagina |
| Primo disegno | Lighthouse o L (FCP) | 0,3–0,4 s | **≤ 1,0 s** (mantenere) | |

### Accessibilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Violazioni axe critiche e serie (WCAG 2.2 AA) sulle 5 schede | L `axe_critiche_serie` | 24 | **0** | #62 |
| Messaggi annunciati ai lettori di schermo (`aria-live`) | R | no | **sì** | |
| Focus visibile su tutti gli elementi raggiunti con Tab | R (report §3) | 40 su 40 | **tutti** (mantenere) | |

### UI/UX e usabilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Altezza occupata sopra le viste a 1440×900 | L `altezza_sopra_le_viste_px` | 84 px | **≤ 52 px** | #59: una sola riga d'intestazione |
| Testi troncati visibili a 1440×900 | L `testi_troncati` | 2 | **0** | #59 |
| Critiche U1–U12 del report risolte | R | 0 su 12 | **≥ 8 su 12, tutte le «media»** | |
| Punti di blocco nei 5 scenari | R (report §3) | 2 (tetto a L, DWG senza rete) | **0** non già noti | |
| Euristiche di Nielsen, punteggio medio (0–4, tabella sotto) | R | 2,5 | **≥ 3,2** | nessuna euristica sotto 3 |

### Codice

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Prove unitarie e nel browser verdi | E | 59/59, 44/44 | **tutte verdi** + una prova per ogni bug chiuso | |
| Funzioni di calcolo provate con `node --test` (computo, aree, coperture, IFC) | R: moduli in `shared/` con test | 0 su 4 | **4 su 4** | #64 |
| Vulnerabilità `npm audit` | `npm audit` | 0 | **0** | |
| `'unsafe-eval'` nella CSP della pagina | `public/index.html` | sì | **no** (solo nel worker del lettore DWG) | report §5 |

### Interoperabilità

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Errori di schema IFC4 (IfcOpenShell) | I | 0 | **0** (mantenere) | |
| Pset e materiali nell'IFC | L `ifc_pset_e_materiali` | 0 / 0 | **Pset_WallCommon, Pset_DoorCommon, Pset_WindowCommon e materiali su ogni elemento** | apribile con senso in Archicad, Revit, Bonsai |
| Layer DXF usati ma non dichiarati | L `dxf_layer_non_dichiarati` | 4 | **0** | alcuni CAD non creano i layer mancanti con colori e tipi di linea |
| Errori di audit DXF (ezdxf) | I | 0 | **0** (mantenere) | |

### Piattaforme

| Indicatore | Metodo | Attuale | Livello | Motivo |
|---|---|---|---|---|
| Varianti con tutte le funzioni «ok» o «non applicabile» motivato | V | 12 su 15 (Firefox ed Electron Mac senza WebGL nel runner: #67; Android instabile al primo avvio) | **15 su 15** | |
| Prove su dispositivi reali (lista del report §8) | R: risposte del titolare | 0 su 16 | **16 su 16** | dipende dal titolare |

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
| 12/11/2026 | #50, #66 | misura iniziale |
