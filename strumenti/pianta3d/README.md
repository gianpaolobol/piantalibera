# pianta3d — Pianta Libera → Blender e FreeCAD (dimostrativo)

> **Strumento sperimentale e separato dall'app.** Non è collegato all'editor: legge il progetto esportato
> (**Esporta → Progetto .json**, schema v3) e lo porta in Blender e FreeCAD con le CLI di
> [CLI-Anything](https://github.com/HKUDS/CLI-Anything) nella versione verificata e corretta del pacchetto
> `cli-anything-lab` (le originali, commit 34f5195, permettevano l'esecuzione di codice). Serve a valutare
> le possibilità; l'integrazione nell'app segue la valutazione del 26/11/2026 (render «fedele» con Blender dal GLB).

## Cosa produce

| Comando | Risultato |
|---|---|
| `blender progetto.json --render vista.png` | render Cycles (GPU NVIDIA se presente) dalla prima camera salvata nell'editor |
| `blender … --camera iso-se --render casa.png` | vista d'insieme isometrica dai 4 angoli (`iso-se`, `iso-so`, `iso-ne`, `iso-no`) con tetto, alberi, persone |
| `blender … --soffitti --camera "Soggiorno"` | interno con soffitti e luci a pannello per locale |
| `blender … --spaccato 1.2 --render s.png` | spaccato assonometrico: muri tagliati a 1,20 m, PNG trasparente |
| `agenzia progetto.json --cartella annuncio/ --giro 24` | **pacchetto per annunci**: planimetria a colori con nomi e m², 4 spaccati isometrici colorati con etichette, spaccato realistico, versioni trasparenti, `superfici.csv`, video a giro (GIF + MP4) |
| `freecad progetto.json --scala 100 --esporta plastico.stl` | plastico in scala, fuso in un solido, spessore minimo stampabile |
| `freecad … --per-piano --arredi` | **plastico smontabile**: un file per piano + il tetto, con gli arredi |
| `freecad … --scala 1 --esporta casa.step` | modello STEP per il CAD |

## Cosa viene convertito

| Pianta Libera | Blender / FreeCAD |
|---|---|
| piani (quota, interpiano, solaio) | piani sovrapposti; i muri dei piani alti coprono lo spessore del solaio |
| muri, porte, portefinestre, finestre | parallelepipedi con fori booleani; vetri e davanzali nelle finestre |
| coperture a capanna, a padiglione, a falda unica, piane | tetto a guscio tagliato dai piani di falda; i muri salgono e formano i timpani |
| locali | pavimenti con i materiali dell'editor (o colorati per funzione nella versione per agenzie), superfici calcolate |
| arredi della libreria (35) e materiali (43) | **estratti dal codice dell'editor** (`estrai-arredi.mjs` esegue `furn()` e legge `MATS`): stessi pezzi e colori |
| alberi, siepi, persone | versioni semplificate |
| camere salvate, sole | camere Blender equivalenti, luce solare |

Limiti: falde libere della copertura personalizzata (rese come tetto standard), muri ad arco (segmenti),
scale e ringhiere parametriche, modelli importati, texture. Locali non ortogonali: pavimento approssimato a celle (con avviso).

## Requisiti

Python 3.10+ con `cli-anything-lab` (`installa.ps1`), `pillow` per le etichette e la GIF; Blender 4.x/5.x;
FreeCAD 1.x per STL/STEP; `ffmpeg` facoltativo per l'MP4. Per aggiornare gli arredi: `node strumenti/pianta3d/estrai-arredi.mjs`.

Esempi pronti: `esempio-ufficiale.json` (il progetto d'esempio dell'editor), `casa-due-piani.json`, `appartamento-esempio.json`.

## Sicurezza

Il progetto è trattato come non fidato (può arrivare da un cliente): numeri controllati (finiti e in intervallo),
testi solo come nomi, `NaN`/`Infinity` nel JSON rifiutati, nessun percorso o comando preso dal progetto.
Test: `python -m pytest strumenti/pianta3d -q` (24 prove, anche con progetti ostili).
