# Divide un file in N parti uguali (i file statici del Worker non superano 25 MiB). Uso: dividi-modello.py file N cartella
import sys, os, math
src, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]; os.makedirs(out, exist_ok=True)
data = open(src, "rb").read(); k = math.ceil(len(data) / n)
assert k < 24 * 2**20, f"parte troppo grande: {k / 2**20:.1f} MiB"
for i in range(n): open(f"{out}/{os.path.basename(src)}.part{i}", "wb").write(data[i * k:(i + 1) * k])
print(len(data) // 2**20, "MiB in", n, "parti")
