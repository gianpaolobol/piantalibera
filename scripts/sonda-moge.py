# Sonda: quanto è precisa la geometria monoculare metrica di MoGe-2 (Microsoft, MIT) sulle foto NYU con profondità vera?
# Misura: errore relativo della profondità, altezza e inclinazione della fotocamera (piano del pavimento) e posizione in
# pianta degli oggetti (destra, avanti), ricavate SOLO dalla foto. Poi esporta il modello in ONNX per il browser.
# Uso (CI): python3 sonda-moge.py cartella-nyu n variante
import sys, json, os, time, glob
import numpy as np, torch
from PIL import Image
sys.path.insert(0, os.environ.get("MOGE_DIR", "MoGe"))
from moge.model.v2 import MoGeModel

DIR, N, VAR = sys.argv[1], int(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "vits"
names = json.load(open(f"{DIR}/_nomi.txt"))
FLOOR = names.index("floor") + 1
model = MoGeModel.from_pretrained(f"Ruicheng/moge-2-{VAR}-normal").eval()
torch.set_num_threads(os.cpu_count())
keys = sorted(os.path.basename(p)[:-5] for p in glob.glob(f"{DIR}/nyu_*.json"))[:N]
rng = np.random.default_rng(1)

def plane(Q):
    best = None
    for _ in range(80):
        s = Q[rng.choice(len(Q), 3, replace=False)]; n = np.cross(s[1] - s[0], s[2] - s[0]); l = np.linalg.norm(n)
        if l < 1e-9: continue
        n /= l; d = -n @ s[0]; inl = np.abs(Q @ n + d) < .03 * max(1, np.median(np.linalg.norm(Q, axis=1)) / 3)
        if best is None or inl.sum() > best[2].sum(): best = (n, d, inl)
    n, d, inl = best; R = Q[inl]; c = R.mean(0); n = np.linalg.eigh((R - c).T @ (R - c))[1][:, 0]; d = -n @ c
    return (-n, -d) if d < 0 else (n, d)

rows = []
for key in keys:
    gt = json.load(open(f"{DIR}/{key}.json"))
    img = np.asarray(Image.open(f"{DIR}/{key}.jpg").convert("RGB"), dtype=np.float32) / 255
    dgt = np.asarray(Image.open(f"{DIR}/{key}_d.png"), dtype=np.float32) / 1000
    lab = np.asarray(Image.open(f"{DIR}/{key}_l.png")).astype(int); ins = np.asarray(Image.open(f"{DIR}/{key}_i.png")).astype(int)
    x = torch.from_numpy(img).permute(2, 0, 1)
    t0 = time.time()
    with torch.no_grad(): out = model.infer(x, fov_x=None)          # campo visivo stimato dalla foto
    ms = (time.time() - t0) * 1000
    P = out["points"].numpy(); D = out["depth"].numpy(); M = out["mask"].numpy() > .5
    fx = out["intrinsics"].numpy()[0, 0] * img.shape[1]; hfov = float(np.degrees(2 * np.arctan(img.shape[1] / 2 / fx)))
    v = (dgt > .3) & M & np.isfinite(D)
    absrel = float(np.median(np.abs(D[v] - dgt[v]) / dgt[v]))
    # pavimento: punti di MoGe (coordinate OpenCV: x destra, y giù, z avanti) sulle etichette vere del pavimento
    fl = (lab == FLOOR) & M
    if fl.sum() < 2000: continue
    n, h = plane(P[fl]); up = -n if n[1] > 0 else n           # in su = verso y negativo
    if up @ np.array([0, -1, 0]) < 0: up = -up
    h = abs(n @ np.zeros(3) + h)
    pitch = float(np.degrees(np.arcsin(np.clip(up @ np.array([0, 0, 1.]), -1, 1))))
    fw = np.array([0, 0, 1.]) - (up @ np.array([0, 0, 1.])) * up; fw /= np.linalg.norm(fw); rt = np.cross(fw, up)
    if rt[0] < 0: rt = -rt
    errs = []
    for o in gt["objects"]:
        if o["px"] < 2500: continue
        k = names.index(o["name"]) + 1
        # istanza: stessa etichetta, istanza col maggior numero di pixel dentro il riquadro
        bx = [int(o["box"][0] * gt["W"]), int(o["box"][1] * gt["H"]), int(np.ceil(o["box"][2] * gt["W"])), int(np.ceil(o["box"][3] * gt["H"]))]
        sub = (lab == k); win = np.zeros_like(sub); win[bx[1]:bx[3], bx[0]:bx[2]] = True; sub &= win & M
        if sub.sum() < 200: continue
        ids, cnt = np.unique(ins[sub], return_counts=True); sub &= ins == ids[cnt.argmax()]
        Q = P[sub]; r, f = float(np.median(Q @ rt)), float(np.median(Q @ fw))
        errs.append({"cat": o["cat"], "d": round(float(np.hypot(r - o["r"], f - o["f"])), 3), "rel": round(float(np.hypot(r - o["r"], f - o["f"]) / max(.3, np.hypot(o["r"], o["f"]))), 3)})
    rows.append({"key": key, "ms": round(ms), "hfov": round(hfov, 1), "hfov_vero": gt["hfov"], "absrel": round(absrel, 3), "h": round(float(h), 3), "h_vera": gt["cam_h"],
                 "pitch": round(pitch, 1), "pitch_vera": gt["pitch"], "oggetti": errs})
    print(json.dumps(rows[-1]), flush=True)

med = lambda a: float(np.median(a)) if len(a) else None
objs = [e for r in rows for e in r["oggetti"]]
print("=== MOGE " + json.dumps({"variante": VAR, "foto": len(rows), "tempo_ms": med([r["ms"] for r in rows]),
  "profondita_absrel": med([r["absrel"] for r in rows]), "campo_visivo_err": med([abs(r["hfov"] - r["hfov_vero"]) for r in rows]),
  "altezza_fotocamera_err_m": med([abs(r["h"] - r["h_vera"]) for r in rows]), "inclinazione_err": med([abs(r["pitch"] - r["pitch_vera"]) for r in rows]),
  "oggetti_errore_pianta_m": med([e["d"] for e in objs]), "oggetti_errore_relativo": med([e["rel"] for e in objs]), "oggetti": len(objs)}, indent=1))
