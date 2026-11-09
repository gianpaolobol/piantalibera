# Banco su foto vere con misure vere: NYU Depth V2 (1449 foto di interni con profondità Kinect, etichette e istanze).
# Estrae un sottoinsieme e calcola le misure vere in un riferimento allineato alla gravità (pavimento come piano):
# altezza e inclinazione della fotocamera, e per ogni porta, finestra e arredo la posizione in pianta rispetto
# alla fotocamera (destra, avanti), le quote (da terra) e la larghezza. Il dataset serve solo alle prove: non si
# pubblica e non entra nel repository (licenza per la ricerca). Uso: python3 nyu-estrai.py file.mat cartella [n]
import sys, json, os
import numpy as np, h5py
from PIL import Image

MAT, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 80
os.makedirs(OUT, exist_ok=True)
FX, FY, CX, CY = 518.8579, 519.4696, 325.5824, 253.7362          # fotocamera RGB del Kinect (640×480)
X0, X1, Y0, Y1 = 50, 602, 45, 463                                    # ritaglio senza bordo, centrato sul punto principale
CLS = {"door": "porta", "window": "finestra", "bed": "letto", "sofa": "divano", "chair": "sedia", "table": "tavolo",
       "night stand": "comodino", "lamp": "lampada", "dresser": "cassettiera", "cabinet": "madia", "bookshelf": "libreria",
       "desk": "scrivania", "television": "tv", "toilet": "wc", "sink": "lavabo", "refrigerator": "frigorifero",
       "bathtub": "vasca", "ottoman": "pouf", "stove": "cucina", "counter": "piano", "shelves": "libreria", "coffee table": "tavolino",
       "end table": "comodino", "side table": "comodino", "armchair": "poltrona", "couch": "divano", "kitchen island": "isola"}

f = h5py.File(MAT, "r")
names = ["".join(chr(c[0]) for c in f[r][()]) for r in f["names"][0]]
scenes = ["".join(chr(c[0]) for c in f[r][()]) for r in f["scenes"][0]]
n_img = f["images"].shape[0]
u, v = np.meshgrid(np.arange(640), np.arange(480))
picked, rng = [], np.random.default_rng(7)
order = rng.permutation(n_img)

def frame(depth, lab):
    Z = depth; X = (u - CX) * Z / FX; Y = -(v - CY) * Z / FY
    P = np.stack([X, Y, Z], -1)
    floor = (lab == names.index("floor") + 1) & (Z > .3)
    if floor.sum() < 4000: return None
    Q = P[floor]
    best = None
    for _ in range(60):                                        # RANSAC del piano del pavimento
        s = Q[rng.choice(len(Q), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0]); ln = np.linalg.norm(n)
        if ln < 1e-6: continue
        n /= ln; d = -n @ s[0]; inl = np.abs(Q @ n + d) < .03
        if best is None or inl.sum() > best[2].sum(): best = (n, d, inl)
    n, d, inl = best
    if inl.mean() < .6: return None
    R = Q[inl]; c = R.mean(0); n = np.linalg.svd(R - c)[2][-1]; d = -n @ c
    if d < 0: n, d = -n, -d                                     # normale verso la fotocamera (in su)
    up = n; fw = np.array([0, 0, 1.]) - up[2] * up; fw /= np.linalg.norm(fw)
    rt = np.cross(up, fw)                                       # destra (X in su, Z avanti: terna sinistrorsa del Kinect)
    if rt[0] < 0: rt = -rt
    pitch = np.degrees(np.arcsin(np.clip(up[2], -1, 1)))       # negativa se la fotocamera guarda in basso
    roll = np.degrees(np.arctan2(up[0], up[1]))
    return P, up, fw, rt, d, pitch, roll

for i in order:
    if len(picked) >= N: break
    lab = f["labels"][i].T; depth = f["depths"][i].T; inst = f["instances"][i].T
    fr = frame(depth, lab)
    if fr is None: continue
    P, up, fw, rt, h, pitch, roll = fr
    if abs(roll) > 6 or not (.6 < h < 2.2): continue
    objs = []
    for k in np.unique(lab):
        if k == 0: continue
        nm = names[k - 1]; cat = CLS.get(nm)
        if not cat: continue
        for j in np.unique(inst[lab == k]):
            m = (lab == k) & (inst == j); m[:Y0] = m[Y1:] = False; m[:, :X0] = m[:, X1:] = False
            if m.sum() < 1200: continue
            ok = m & (depth > .3)
            if ok.sum() < 300: continue
            Q = P[ok]; Rr, Ff, Hh = Q @ rt, Q @ fw, Q @ up + h
            ys, xs = np.nonzero(m)
            ax = np.stack([Rr - Rr.mean(), Ff - Ff.mean()], 1); e = np.linalg.svd(ax, full_matrices=False)[2][0]
            proj = ax @ e
            objs.append({"cat": cat, "name": nm, "px": int(m.sum()),
                         "box": [round((xs.min() - X0) / (X1 - X0), 4), round((ys.min() - Y0) / (Y1 - Y0), 4), round((xs.max() + 1 - X0) / (X1 - X0), 4), round((ys.max() + 1 - Y0) / (Y1 - Y0), 4)],
                         "r": round(float(np.median(Rr)), 3), "f": round(float(np.median(Ff)), 3),
                         "zmin": round(float(np.percentile(Hh, 3)), 3), "zmax": round(float(np.percentile(Hh, 97)), 3),
                         "w": round(float(np.percentile(proj, 97) - np.percentile(proj, 3)), 3),
                         "cut": bool(xs.min() <= X0 + 2 or xs.max() >= X1 - 3 or ys.min() <= Y0 + 2 or ys.max() >= Y1 - 3)})
    if not any(o["cat"] in ("porta", "finestra", "letto", "divano", "tavolo", "sedia", "cassettiera", "madia", "comodino") for o in objs): continue
    img = np.transpose(f["images"][i], (2, 1, 0))[Y0:Y1, X0:X1]
    key = f"nyu_{i:04d}"
    Image.fromarray(img).save(f"{OUT}/{key}.jpg", quality=92)
    gt = {"key": key, "scene": scenes[i], "W": X1 - X0, "H": Y1 - Y0, "hfov": round(float(np.degrees(2 * np.arctan((X1 - X0) / 2 / FX))), 2),
          "cam_h": round(float(h), 3), "pitch": round(float(pitch), 2), "roll": round(float(roll), 2), "objects": objs}
    json.dump(gt, open(f"{OUT}/{key}.json", "w"))
    picked.append(key)
print(f"{len(picked)} foto estratte")
