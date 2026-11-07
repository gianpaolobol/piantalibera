# Pianta Libera in locale — guida all'installazione

Aggiornata al 6 novembre 2026 · pacchetto 0.4.0. Il pacchetto si ricostruisce da solo a ogni modifica dell'app; questa guida viene aggiornata insieme.

**Scarica sempre l'ultima versione:**
https://github.com/gianpaolobol/piantalibera/releases/download/locale-latest/pianta-libera-locale.zip
(circa 25 MB; contiene editor, librerie, lettore DWG, server e file di avvio. Funziona senza internet.)

---

## 1. Cosa usa la CPU e cosa la GPU

| Parte | Dove lavora | Note |
|---|---|---|
| Vista 3D, ombre, occlusione ambientale, «Render alta qualità» PNG, anteprime della libreria personale | **GPU**, tramite WebGL 2 del browser | Qualsiasi scheda degli ultimi anni va bene, anche integrata. La GPU dedicata rende più fluide scene grandi e il render ad alta risoluzione. |
| Pianta 2D, modifica, salvataggio, esportazioni (GLB, OBJ, 3MF/STL, DXF) | **CPU** (un core) | Leggera. |
| Lettura DWG/DXF e «Da pianta e prospetti al 3D» | **CPU** (WebAssembly, un core) | Tavole grandi: qualche secondo. |
| Render AI fotorealistico | **Cloudflare** (sito online) oppure **GPU locale** con ComfyUI (punto 5) | Con il pacchetto, senza ComfyUI, il render AI usa un servizio di prova che restituisce la vista: non genera immagini. |

In breve: l'editor usa già la GPU del computer attraverso il browser; il render AI in locale richiede ComfyUI e una scheda video adatta.

## 2. Requisiti

- Windows 10/11, macOS 12+ o Linux.
- **Node.js 20 o successivo** (serve solo per il piccolo server locale).
- Browser aggiornato: Chrome, Edge, Firefox o Safari.
- Per il render AI in locale: vedi il punto 5.

### Installare Node.js

- **Windows** (PowerShell o Prompt dei comandi):
  ```
  winget install OpenJS.NodeJS.LTS
  ```
  oppure il programma di installazione «LTS» da https://nodejs.org
- **macOS** (con Homebrew): `brew install node` — oppure il pacchetto da https://nodejs.org
- **Linux** (Debian/Ubuntu):
  ```
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

Controllo: `node --version` deve rispondere v20 o superiore.

## 3. Avvio

1. Scarica lo zip dal link sopra ed estrailo (ad esempio in `Documenti\pianta-libera-locale`).
2. Avvia con doppio clic:
   - **Windows:** `avvia-windows.bat` (al primo avvio SmartScreen può chiedere conferma: «Ulteriori informazioni» → «Esegui comunque»).
   - **macOS:** `avvia-mac.command` (la prima volta: clic destro → «Apri» → «Apri»).
   - **Linux:** `avvia-linux.sh`.
3. Si apre il browser su **http://127.0.0.1:8787/**. Per chiudere, chiudi la finestra nera del server (o Ctrl+C).

Da terminale, nella cartella del pacchetto:
```
# Windows (Prompt dei comandi)
set STATIC_DIR=%CD%\app
node server\local-server.mjs

# macOS / Linux
STATIC_DIR="$PWD/app" node server/local-server.mjs
```

Impostazioni facoltative (variabili d'ambiente prima dell'avvio):

| Variabile | Predefinito | Uso |
|---|---|---|
| `PORT` | 8787 | porta diversa se 8787 è occupata (es. `set PORT=8790`) |
| `HOST` | 127.0.0.1 | `0.0.0.0` per aprire l'editor da tablet o altri PC della stessa rete (http://IP-del-PC:8787/). Solo su reti fidate. |
| `COMFYUI_URL` | prova 8188 e 8000 | indirizzo di ComfyUI se diverso |
| `COMFYUI_WORKFLOW` | `comfyui/workflow-api.json` | workflow di ComfyUI da usare |

## 4. Verificare che il browser usi la GPU

- **Chrome:** apri `chrome://gpu` → «WebGL2: Hardware accelerated». **Edge:** `edge://gpu`. **Firefox:** `about:support` → «WebGL 2 Driver Renderer» deve indicare la scheda video, non «llvmpipe» o «SwiftShader».
- Se risulta «Software only»: Impostazioni del browser → Sistema → attiva **«Usa l'accelerazione grafica, se disponibile»**, riavvia il browser, aggiorna i driver della scheda video.
- **Portatili Windows con due schede video:** Impostazioni → Sistema → Schermo → Grafica → aggiungi Chrome/Edge → Opzioni → **«Prestazioni elevate»**. Con NVIDIA puoi farlo anche dal Pannello di controllo NVIDIA → Gestisci impostazioni 3D → Impostazioni programma.
- macOS: la scelta della GPU è automatica.

## 5. Render AI con la GPU del computer (ComfyUI)

Il pacchetto parla con **ComfyUI** installato sullo stesso computer e usa il modello **FLUX.2 [klein] 4B** (licenza Apache 2.0, uso commerciale consentito), lo stesso del sito online.

### Hardware consigliato

| Hardware | Esito |
|---|---|
| NVIDIA con **8 GB di VRAM o più** (RTX 3060 12 GB, 4060 Ti 16 GB, 3090, 4070…) | Consigliato. Versione FP8 distillata: circa 8,4 GB, pochi secondi per immagine. |
| NVIDIA con 6 GB | Possibile con versioni quantizzate (NVFP4/GGUF), più lento. |
| Mac Apple Silicon (M1–M4) con 16 GB o più | Funziona, più lento di una NVIDIA. |
| AMD su Linux (ROCm) | Possibile, configurazione più delicata. |
| Solo CPU | Sconsigliato: minuti per immagine. |

### Installare ComfyUI

- **Windows / macOS:** ComfyUI Desktop da https://www.comfy.org/download (porta predefinita 8000). Su Windows con NVIDIA va bene anche la versione «portable» (porta 8188).
- **Linux (NVIDIA):**
  ```
  git clone https://github.com/comfyanonymous/ComfyUI
  cd ComfyUI
  python3 -m venv venv && source venv/bin/activate
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
  pip install -r requirements.txt
  python main.py --listen 127.0.0.1 --port 8188
  ```
  (Il comando di `torch` adatto alla tua scheda è su https://pytorch.org.)
- Aggiorna ComfyUI all'ultima versione: i nodi di FLUX.2 klein sono recenti.

### Preparare il workflow (una volta sola)

1. In ComfyUI apri **Templates** → **Flux.2 Klein 4B — Image Edit (distilled)**. Se mancano i modelli, ComfyUI propone di scaricarli; i file sono:
   - `models/diffusion_models/flux-2-klein-4b-fp8.safetensors`
   - `models/text_encoders/qwen_3_4b.safetensors`
   - `models/vae/flux2-vae.safetensors`
2. Prova una generazione dentro ComfyUI per essere sicuro che funzioni.
3. Menu **Workflow → Export (API)** e salva il file come **`workflow-api.json`** nella cartella **`comfyui`** del pacchetto.
4. Riavvia Pianta Libera. La finestra del server scrive «Render AI: ComfyUI…» e, se ComfyUI è acceso, «ComfyUI trovato su …».

### Come lo usa Pianta Libera

- La **vista** del modello va nel primo nodo «Load Image», la **profondità** nel secondo (e i **contorni** nel terzo, se c'è); il **prompt** nel nodo di testo positivo; **seed** e **dimensioni** dove presenti. Il resto del workflow (passi, modello, scheduler) resta come l'hai salvato: puoi cambiarlo in ComfyUI e riesportarlo.
- Nel pannello **Render AI** dell'editor compare «ComfyUI su questo computer (GPU locale)». Le immagini non lasciano il computer; non ci sono quote.
- Un render alla volta (la GPU è una sola); tempo massimo 5 minuti (`COMFYUI_TIMEOUT_MS`).

### Link per il cliente in rete locale

Dalla scheda **Esporta → Condividi con il cliente** il server locale crea link che valgono finché resta acceso (i progetti condivisi stanno in memoria, non su disco). Per farli aprire da un altro dispositivo della stessa rete avvia il server con `HOST=0.0.0.0` e manda il link con l'indirizzo del computer (es. `http://192.168.1.20:8787/?condividi=…`). Puoi scegliere se il cliente può solo guardare e commentare o anche modificare il progetto: in quel caso il link contiene `#modifica=…` e le sue modifiche ti arrivano come proposta da aprire o scartare.

### Su telefono e tablet

L'editor si adatta da solo a telefono e tablet (una vista per volta, pannello che sale dal basso, gesti a tocco: vedi `docs/app-mobile.md`). Con il server avviato con `HOST=0.0.0.0` lo apri dal telefono all'indirizzo del computer (es. `http://192.168.1.20:8787/`).

## 6. Aggiornare

Scarica di nuovo lo zip dal link in cima ed estrailo in una cartella nuova. Copia nella nuova cartella il tuo `comfyui/workflow-api.json`. I progetti salvati nel browser restano (sono legati all'indirizzo http://127.0.0.1:8787, quindi usa la stessa porta); per sicurezza esporta i progetti importanti come `.json` dal menu Esporta.

## 7. Per sviluppatori: dal codice sorgente

```
git clone https://github.com/gianpaolobol/piantalibera
cd piantalibera
npm ci
npm run dev                  # editor + server di prova su http://127.0.0.1:8787/
npm run build:editor         # ricostruisce public/index.html da editor-src/ (con CSP e impronte SRI)
npm run build                # controllo: nomi globali ripetuti tra i moduli e public/index.html aggiornato
npm run sri                  # ricalcola scripts/sri.json quando cambia la versione di una libreria
npm test                     # test (serve: npx playwright install chromium)
npm run build:pacchetto      # crea dist/pianta-libera-locale.zip
node scripts/smoke-package.mjs   # prova il pacchetto senza internet
```

## 8. Problemi comuni

| Problema | Soluzione |
|---|---|
| «Serve Node.js» | installa Node.js (punto 2) e riapri il file di avvio |
| La pagina non si apre / porta occupata | avvia con un'altra porta: `set PORT=8790` (Windows) o `PORT=8790 ./avvia-linux.sh` |
| macOS blocca il file di avvio | clic destro → Apri; oppure in Terminale: `xattr -dr com.apple.quarantine ~/Downloads/pianta-libera-locale` |
| 3D lento o a scatti | punto 4 (accelerazione hardware, GPU ad alte prestazioni) |
| Un DWG non si apre | salvalo come DXF dal CAD (alcune versioni non sono lette dal lettore libero) |
| «ComfyUI non risponde» | avvia ComfyUI prima del render; se usa un'altra porta, imposta `COMFYUI_URL` |
| ComfyUI rifiuta il workflow | riesportalo con **Export (API)** (non il normale «Save») dopo averlo provato in ComfyUI |
| Poly Haven non carica | serve internet: è l'unica libreria online |
| Pagina bianca dopo aver modificato a mano `app/index.html` | la pagina accetta solo lo script originale (Content Security Policy): ricostruiscila con `npm run build:editor` e `npm run build:pacchetto` |

## 9. Licenze dei componenti inclusi

Pianta Libera è distribuito con licenza **GNU AGPL-3.0** (file `LICENSE` nel codice sorgente; pulsante «Info» nell'editor). Componenti: three.js r147 (MIT), dxf-parser (MIT), pdf.js (Apache-2.0), libredwg-web 0.8.2 (GPL-3.0, solo per aprire i DWG), caratteri Archivo e IBM Plex Mono (SIL OFL, se inclusi), HDRI e texture CC0, modelli Khronos/Wayfair CC0/CC-BY 4.0 (dettagli in `docs/editor-crediti-asset.md`). FLUX.2 [klein] 4B: Apache 2.0 (non incluso: lo scarica ComfyUI).
