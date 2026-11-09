# Esporta MoGe-2 (ViT-S, normali) in ONNX per il browser, a ingresso fisso, e ne verifica la fedeltà al modello
# PyTorch su alcune foto NYU; produce anche le versioni fp16 e int8 e confronta la precisione (profondità e
# altezza della fotocamera). Uso (CI): python3 esporta-moge.py cartella-nyu uscita
import sys, os, json, glob, time
import numpy as np, torch
from PIL import Image
from moge.model.v2 import MoGeModel

DIR, OUT = sys.argv[1], sys.argv[2]
H, W, TOK = int(os.environ.get("MOGE_H", 384)), int(os.environ.get("MOGE_W", 512)), int(os.environ.get("MOGE_TOK", 1800))
os.makedirs(OUT, exist_ok=True)
m = MoGeModel.from_pretrained("Ruicheng/moge-2-vits-normal").eval()

class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, image):                       # image: (1,3,H,W) in [0,1]
        o = s.m.forward(image, num_tokens=TOK)
        return o["points"], o["normal"], o["mask"], o["metric_scale"]

w = Wrap(m).eval(); x = torch.rand(1, 3, H, W)
f32 = f"{OUT}/moge2-vits-{W}x{H}.onnx"
with torch.no_grad():
    torch.onnx.export(w, (x,), f32, input_names=["image"], output_names=["points", "normal", "mask", "metric_scale"], opset_version=17, do_constant_folding=True, dynamo=False)
print("fp32", os.path.getsize(f32) // 2**20, "MB")
import onnx
from onnxconverter_common import float16
f16 = f32.replace(".onnx", "-fp16.onnx")
onnx.save(float16.convert_float_to_float16(onnx.load(f32), keep_io_types=True), f16); print("fp16", os.path.getsize(f16) // 2**20, "MB")
from onnxruntime.quantization import quantize_dynamic, QuantType
q8 = f32.replace(".onnx", "-q8.onnx")
quantize_dynamic(f32, q8, weight_type=QuantType.QUInt8); print("q8", os.path.getsize(q8) // 2**20, "MB")

import onnxruntime as ort
names = json.load(open(f"{DIR}/_nomi.txt")); FLOOR = names.index("floor") + 1
keys = sorted(os.path.basename(p)[:-5] for p in glob.glob(f"{DIR}/nyu_*.json"))[:12]
def uv_grid(w, h):
    a = w / h; sx, sy = a / (1 + a * a) ** .5, 1 / (1 + a * a) ** .5
    u = np.linspace(-sx * (w - 1) / w, sx * (w - 1) / w, w); v = np.linspace(-sy * (h - 1) / h, sy * (h - 1) / h, h)
    return np.stack(np.meshgrid(u, v), -1)
def post(P, M, S):                               # come MoGe infer(): focale e spostamento in z, poi scala metrica
    P = P[0]; M = M[0] > .5; uv = uv_grid(P.shape[1], P.shape[0])
    sel = M[::6, ::6]; xy = P[::6, ::6][sel][:, :2]; z = P[::6, ::6][sel][:, 2]; t = uv[::6, ::6][sel]
    def err(s): q = xy / (z + s)[:, None]; f = (q * t).sum() / (q * q).sum(); return ((f * q - t) ** 2).sum(), f
    lo, hi = -z.min() + 1e-3, z.max() * 4 + 5
    for _ in range(60):                            # sezione aurea
        a, b = lo + (hi - lo) * .382, lo + (hi - lo) * .618
        if err(a)[0] < err(b)[0]: hi = b
        else: lo = a
    s = (lo + hi) / 2; f = err(s)[1]
    P = P.copy(); P[..., 2] += s; return P * S[0], M & (P[..., 2] > 0), f
for path in [f32, f16, q8]:
    ses = ort.InferenceSession(path, providers=["CPUExecutionProvider"]); rel, dh, ms = [], [], []
    for key in keys:
        img = Image.open(f"{DIR}/{key}.jpg").convert("RGB").resize((W, H), Image.BILINEAR)
        x = np.asarray(img, dtype=np.float32).transpose(2, 0, 1)[None] / 255
        t0 = time.time(); P, N, M, S = ses.run(None, {"image": x}); ms.append((time.time() - t0) * 1000)
        P, M, f = post(P, M, S)
        dgt = np.asarray(Image.open(f"{DIR}/{key}_d.png").resize((W, H), Image.NEAREST), dtype=np.float32) / 1000
        v = (dgt > .3) & M; rel.append(np.median(np.abs(P[..., 2][v] - dgt[v]) / dgt[v]))
        lab = np.asarray(Image.open(f"{DIR}/{key}_l.png").resize((W, H), Image.NEAREST)).astype(int); fl = (lab == FLOOR) & M
        if fl.sum() > 500:
            Q = P[fl]; c = Q.mean(0); n = np.linalg.eigh((Q - c).T @ (Q - c))[1][:, 0]; dh.append(abs(abs(n @ c) - json.load(open(f"{DIR}/{key}.json"))["cam_h"]))
    print(f"{os.path.basename(path)}: profondità absrel {np.median(rel):.3f} · altezza fotocamera err {np.median(dh):.3f} m · {np.median(ms):.0f} ms su CPU")
