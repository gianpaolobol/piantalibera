#!/usr/bin/env python3
"""pianta3d — dal progetto di Pianta Libera (schema v3) a Blender e FreeCAD.

Strumento DIMOSTRATIVO e separato dall'app: usa le CLI CLI-Anything verificate e
corrette (cli-anything-blender, cli-anything-freecad, pacchetto «cli-anything-lab»).

    # render dalla prima camera salvata (o vista d'insieme)
    python pianta3d.py blender progetto.json --render vista.png

    # spaccato assonometrico: muri tagliati a 1,20 m, camera ortografica, PNG trasparente
    python pianta3d.py blender progetto.json --spaccato 1.2 --render spaccato.png

    # pacchetto per agenzie: 4 spaccati, planimetria a colori con nomi e m², superfici, video a giro
    python pianta3d.py agenzia progetto.json --cartella annuncio/

    # plastico per la stampa 3D in scala 1:100, smontabile piano per piano (+ tetto)
    python pianta3d.py freecad progetto.json --scala 100 --esporta plastico.stl --per-piano

Il file di progetto è trattato come NON fidato: ogni valore è controllato (tipo,
numero finito, intervallo) prima di entrare nelle scene; i testi diventano solo
nomi di oggetti (stringhe), mai codice.
Coordinate di Pianta Libera: metri, pianta [x, y] con y verso il basso, 3D Three.js
(x, quota, y). Blender e FreeCAD: X = x, Y = -y, Z = quota.
"""
from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

VERSIONE = "2.0.0"
SPESSORE_TETTO = 0.22
MAX_ELEMENTI = 20000
QUI = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Lettura e controllo del progetto (input non fidato)
# ---------------------------------------------------------------------------


class ErroreProgetto(ValueError):
    pass


def _f(v: Any, cosa: str, lo: float = -1e5, hi: float = 1e5, default: Optional[float] = None) -> float:
    if v is None and default is not None:
        return default
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        if default is not None:
            return default
        raise ErroreProgetto(f"{cosa}: numero non valido ({v!r})")
    x = float(v)
    if not math.isfinite(x) or x < lo or x > hi:
        raise ErroreProgetto(f"{cosa}: valore fuori intervallo ({v!r})")
    return x


def _pt(v: Any, cosa: str) -> Tuple[float, float]:
    if not isinstance(v, (list, tuple)) or len(v) < 2:
        raise ErroreProgetto(f"{cosa}: punto non valido")
    return _f(v[0], cosa), _f(v[1], cosa)


def _id(v: Any) -> str:
    return str(v)[:64] if isinstance(v, (str, int)) else ""


def _testo(v: Any, n: int = 60) -> str:
    return "".join(c for c in str(v if v is not None else "")[:n] if c.isprintable())


def _lin(hexstr: Any, default: Tuple[float, float, float]) -> List[float]:
    """#rgb/#rrggbb (sRGB) -> RGBA lineare per Blender."""
    if isinstance(hexstr, str) and hexstr.startswith("#"):
        h = hexstr[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        if len(h) in (6, 8) and all(c in "0123456789abcdefABCDEF" for c in h):
            rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb] + [1.0]
    return list(default) + [1.0]


def carica_progetto(percorso: str) -> Dict[str, Any]:
    if os.path.getsize(percorso) > 200 * 1024 * 1024:
        raise ErroreProgetto("file troppo grande")

    def no_const(c):
        raise ErroreProgetto(f"costante non ammessa nel JSON: {c}")

    with open(percorso, "r", encoding="utf-8") as fh:
        p = json.load(fh, parse_constant=no_const)
    if not isinstance(p, dict):
        raise ErroreProgetto("il progetto deve essere un oggetto JSON")
    if not isinstance(p.get("levels"), list) or not p["levels"]:
        raise ErroreProgetto("il progetto non ha piani (levels)")
    for chiave in ("walls", "rooms", "openings", "cameras", "objects"):
        v = p.get(chiave, [])
        if not isinstance(v, list) or len(v) > MAX_ELEMENTI:
            raise ErroreProgetto(f"{chiave}: elenco non valido")
    return p


_LIB: Optional[Dict[str, Any]] = None


def libreria() -> Dict[str, Any]:
    """Arredi e materiali estratti dal codice dell'editor (estrai-arredi.mjs)."""
    global _LIB
    if _LIB is None:
        try:
            with open(os.path.join(QUI, "arredi.json"), encoding="utf-8") as fh:
                _LIB = json.load(fh)
        except OSError:
            _LIB = {"materiali": {}, "arredi": {}}
    return _LIB


def _rettangoli(pts: List[Tuple[float, float]]) -> Tuple[List[Tuple[float, float, float, float]], bool]:
    """Scompone un poligono in rettangoli allineati agli assi.
    Esatto per i locali ortogonali; approssimato (a celle) per gli altri."""
    def dentro(x: float, y: float) -> bool:
        c = False
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        return c

    n = len(pts)
    ortogonale = all(abs(pts[i][0] - pts[(i + 1) % n][0]) < 1e-6 or abs(pts[i][1] - pts[(i + 1) % n][1]) < 1e-6 for i in range(n))
    if ortogonale:
        xs = sorted({round(x, 6) for x, _ in pts})
        ys = sorted({round(y, 6) for _, y in pts})
    else:
        x0, x1 = min(x for x, _ in pts), max(x for x, _ in pts)
        y0, y1 = min(y for _, y in pts), max(y for _, y in pts)
        k = 40
        xs = [x0 + (x1 - x0) * i / k for i in range(k + 1)]
        ys = [y0 + (y1 - y0) * i / k for i in range(k + 1)]
    rects = []
    for j in range(len(ys) - 1):
        run = None
        for i in range(len(xs) - 1):
            if dentro((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2):
                run = (run[0], xs[i + 1]) if run else (xs[i], xs[i + 1])
            elif run:
                rects.append((run[0], ys[j], run[1], ys[j + 1])); run = None
        if run:
            rects.append((run[0], ys[j], run[1], ys[j + 1]))
    merged: List[List[float]] = []
    for r in sorted(rects, key=lambda r: (r[0], r[2], r[1])):
        if merged and abs(merged[-1][0] - r[0]) < 1e-9 and abs(merged[-1][2] - r[2]) < 1e-9 and abs(merged[-1][3] - r[1]) < 1e-9:
            merged[-1][3] = r[3]
        else:
            merged.append(list(r))
    return [tuple(m) for m in merged], ortogonale


def _area_centro(pts: List[Tuple[float, float]]) -> Tuple[float, Tuple[float, float]]:
    a = cx = cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        k = x1 * y2 - x2 * y1
        a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    a /= 2
    if abs(a) < 1e-9:
        return 0.0, (sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts))
    return abs(a), (cx / (6 * a), cy / (6 * a))


def geometria(p: Dict[str, Any], livello: Optional[str], spaccato: Optional[float]) -> Dict[str, Any]:
    """Estrae piani, muri, aperture, locali, arredi e coperture in metri, già controllati."""
    L: Dict[str, Dict[str, Any]] = {}
    for Lv in p["levels"]:
        if not isinstance(Lv, dict):
            continue
        roof = Lv.get("roof") if isinstance(Lv.get("roof"), dict) else None
        L[_id(Lv.get("id"))] = {
            "elev": _f(Lv.get("elev", 0), "quota del piano", -1000, 1000, 0.0),
            "height": _f(Lv.get("height", 2.7), "interpiano", 0.5, 50, 2.7),
            "slab": _f(Lv.get("slab", 0.25), "solaio", 0, 3, 0.25),
            "name": _testo(Lv.get("name", "Piano")),
            "roof": None if not roof or roof.get("type") in (None, "none") else {
                "type": roof.get("type") if roof.get("type") in ("flat", "gable", "hip", "shed", "custom") else "gable",
                "prev": roof.get("prev") if roof.get("prev") in ("flat", "gable", "hip", "shed") else None,
                "pitch": _f(roof.get("pitch"), "pendenza", 0, 75, 30.0),
                "overhang": _f(roof.get("overhang"), "sporto", 0, 5, 0.5),
                "ridge": roof.get("ridge") if roof.get("ridge") in ("x", "y") else None,
                "dir": roof.get("dir") if roof.get("dir") in ("s", "n", "e", "o") else "s",
                "mat": roof.get("mat") if isinstance(roof.get("mat"), str) else "tegole",
            },
        }
    if not L:
        raise ErroreProgetto("nessun piano valido")
    scelti = [livello] if livello else list(L)
    for s in scelti:
        if s not in L:
            raise ErroreProgetto(f"piano {s!r} inesistente; disponibili: {', '.join(L)}")
    ultimo = max(scelti, key=lambda k: L[k]["elev"])
    avvisi: List[str] = []
    muri, wall_by_id = [], {}
    for w in p.get("walls", []):
        if not isinstance(w, dict) or _id(w.get("level")) not in scelti:
            continue
        lv_id = _id(w.get("level")); lv = L[lv_id]
        ax, ay = _pt(w.get("a"), "muro.a"); bx, by = _pt(w.get("b"), "muro.b")
        lung = math.hypot(bx - ax, by - ay)
        if lung < 1e-3:
            continue
        h = _f(w.get("height"), "altezza muro", 0.05, 100, lv["height"])
        if spaccato is not None and lv_id == ultimo:
            h = min(h, spaccato)
        piu_basso = min(v["elev"] for v in L.values())
        m = {"id": _id(w.get("id")), "level": lv_id, "a": (ax, ay), "b": (bx, by), "len": lung,
             "sotto": lv["slab"] if lv["elev"] > piu_basso + 1e-6 else 0.0,  # i muri dei piani alti coprono il solaio
             "thick": _f(w.get("thick"), "spessore muro", 0.01, 3, 0.3), "z0": lv["elev"], "h": h,
             "mat": w.get("matA") or w.get("mat"), "fori": []}
        muri.append(m); wall_by_id[m["id"]] = m
    for o in p.get("openings", []):
        if not isinstance(o, dict):
            continue
        m = wall_by_id.get(_id(o.get("wall")))
        if not m:
            continue
        tipo = "door" if o.get("type") == "door" else "window"
        sill = _f(o.get("alz"), "alzatina", 0, 0.3, 0.0) if tipo == "door" else _f(o.get("sill"), "davanzale", 0, 20, 0.9)
        w_ = _f(o.get("w"), "larghezza apertura", 0.05, 30, 0.9)
        h_ = _f(o.get("h"), "altezza apertura", 0.05, 30, 2.1)
        t_ = _f(o.get("t"), "posizione apertura", -100, 100, 0.0)
        if sill >= m["h"]:
            continue
        m["fori"].append({"t": t_, "w": w_, "h": min(h_, m["h"] - sill + 0.05), "sill": sill, "tipo": tipo,
                          "porta_finestra": o.get("style") == "portafinestra"})
    locali = []
    for r in p.get("rooms", []):
        if not isinstance(r, dict) or _id(r.get("level")) not in scelti:
            continue
        pts = r.get("pts")
        if not isinstance(pts, list) or len(pts) < 3 or len(pts) > 2000:
            continue
        pp = [_pt(q, "vertice locale") for q in pts]
        rects, orto = _rettangoli(pp)
        nome = _testo(r.get("name", "Locale"))
        if not orto:
            avvisi.append(f"locale «{nome}» non ortogonale: pavimento approssimato")
        lv = L[_id(r.get("level"))]
        area, centro = _area_centro(pp)
        locali.append({"name": nome, "level": _id(r.get("level")), "rects": rects, "pts": pp, "area": area, "centro": centro,
                       "z0": lv["elev"], "slab": lv["slab"], "ceil": lv["elev"] + lv["height"], "mat": r.get("mat"),
                       "balcone": isinstance(r.get("balcone"), dict)})
    oggetti = []
    for ob in p.get("objects", []):
        if not isinstance(ob, dict) or _id(ob.get("level")) not in scelti or not isinstance(ob.get("ref"), str):
            continue
        lv = L[_id(ob.get("level"))]
        oggetti.append({"ref": ob["ref"][:40], "name": _testo(ob.get("name") or ob["ref"]),
                        "x": _f(ob.get("x"), "oggetto.x", default=0.0), "y": _f(ob.get("y"), "oggetto.y", default=0.0),
                        "z": lv["elev"] + _f(ob.get("z"), "oggetto.z", -100, 100, 0.0),
                        "rot": _f(ob.get("rot"), "oggetto.rot", -3600, 3600, 0.0),
                        "scale": _f(ob.get("scale"), "oggetto.scale", 0.01, 100, 1.0), "level": _id(ob.get("level"))})
    if not muri:
        raise ErroreProgetto("nessun muro nel piano scelto")
    xs = [c for m in muri for c in (m["a"][0], m["b"][0])] + [q[0] for r in locali for q in r["pts"]]
    ys = [c for m in muri for c in (m["a"][1], m["b"][1])] + [q[1] for r in locali for q in r["pts"]]
    zt = max(m["z0"] + m["h"] for m in muri)
    zb = min(m["z0"] for m in muri)
    return {"muri": muri, "locali": locali, "oggetti": oggetti, "avvisi": avvisi, "livelli": L, "scelti": scelti,
            "ultimo": ultimo, "bbox": (min(xs), min(ys), max(xs), max(ys), zb, zt)}


# ---------------------------------------------------------------------------
# Coperture: piani di falda come «tagli» di un solido
# ---------------------------------------------------------------------------


def falde(g: Dict[str, Any], lv_id: str) -> Optional[Dict[str, Any]]:
    """Restituisce il volume della copertura del piano e i piani di falda (in coordinate Blender/FreeCAD).
    Ogni falda è un semispazio: sopra il piano inclinato che parte dalla gronda."""
    lv = g["livelli"][lv_id]; R = lv["roof"]
    if not R:
        return None
    mw = [m for m in g["muri"] if m["level"] == lv_id]
    if not mw:
        return None
    xs = [c for m in mw for c in (m["a"][0], m["b"][0])]; ys = [c for m in mw for c in (m["a"][1], m["b"][1])]
    t = max(m["thick"] for m in mw) / 2
    ov = R["overhang"]
    # rettangolo di gronda in coordinate Blender (Y = -y)
    X0, X1 = min(xs) - t - ov, max(xs) + t + ov
    Y0, Y1 = -max(ys) - t - ov, -min(ys) + t + ov
    ze = lv["elev"] + lv["height"]
    tipo = R["type"] if R["type"] != "custom" else (R["prev"] or "gable")
    a = math.radians(R["pitch"])
    lati = []  # (lato, angolo)
    if tipo == "flat":
        return {"box": (X0, Y0, ze, X1, Y1, ze + 0.25), "lati": [], "tipo": tipo, "ze": ze, "ridge": ze + 0.25, "mat": R["mat"]}
    lungo_x = (X1 - X0) >= (Y1 - Y0)
    ridge_x = R["ridge"] == "x" if R["ridge"] else lungo_x
    if tipo == "gable":
        lati = [("s", a), ("n", a)] if ridge_x else [("o", a), ("e", a)]
    elif tipo == "hip":
        lati = [("s", a), ("n", a), ("o", a), ("e", a)]
    elif tipo == "shed":
        lati = [(R["dir"], a)]
    span = (Y1 - Y0) if any(l in ("s", "n") for l, _ in lati) and (tipo != "hip" or ridge_x) else (X1 - X0)
    if tipo == "shed":
        span = (Y1 - Y0) * 2 if R["dir"] in ("s", "n") else (X1 - X0) * 2
    if tipo == "hip":
        span = min(X1 - X0, Y1 - Y0)
    ridge = ze + span / 2 * math.tan(a)
    if tipo != "custom" and R["type"] == "custom":
        g["avvisi"].append("copertura personalizzata a falde libere: resa come tetto standard")
    return {"box": (X0, Y0, ze, X1, Y1, ridge + 0.05), "lati": lati, "tipo": tipo, "ze": ze, "ridge": ridge, "mat": R["mat"],
            "gronda": (X0, Y0, X1, Y1)}


def taglio_falda(fa: Dict[str, Any], lato: str, a: float, S: float = 200.0, giu: float = 0.0) -> Tuple[List[float], List[float], float]:
    """Cubo di lato S che occupa il semispazio sopra la falda (abbassata di «giu» m): (centro, rotazione gradi XYZ, S)."""
    X0, Y0, X1, Y1 = fa["gronda"]; ze = fa["ze"]
    cx, cy = (X0 + X1) / 2, (Y0 + Y1) / 2
    s, c = math.sin(a), math.cos(a)
    if lato == "s":      # gronda a Y0, sale verso +Y: normale (0, -sin, cos) -> Rx(+a)
        P, n, rot = (cx, Y0, ze), (0, -s, c), [math.degrees(a), 0, 0]
    elif lato == "n":    # gronda a Y1, sale verso -Y
        P, n, rot = (cx, Y1, ze), (0, s, c), [-math.degrees(a), 0, 0]
    elif lato == "o":    # gronda a X0, sale verso +X: normale (-sin, 0, cos) -> Ry(-a)
        P, n, rot = (X0, cy, ze), (-s, 0, c), [0, -math.degrees(a), 0]
    else:                # "e": gronda a X1
        P, n, rot = (X1, cy, ze), (s, 0, c), [0, math.degrees(a), 0]
    return [P[i] + n[i] * (S / 2 - giu) for i in range(3)], rot, S


# ---------------------------------------------------------------------------
# Blender
# ---------------------------------------------------------------------------

COLORI_VANI = [  # planimetria per agenzie: colori pastello per funzione
    (("soggiorn", "living", "salott", "pranzo"), "#f3d9a4"), (("cucin", "angolo cottura", "kitchen"), "#f5b79e"),
    (("camer", "letto", "bedroom"), "#b9d3ee"), (("bagn", "wc", "servizi"), "#a8dcd1"),
    (("disimp", "corrid", "ingress", "hall"), "#e3e1dc"), (("balcon", "terrazz", "loggia"), "#cfe3b2"),
    (("studio", "ufficio"), "#d8c7ea"), (("ripost", "lavander", "cantin", "garage"), "#d9d4c7"),
]


def colore_vano(nome: str) -> str:
    n = nome.lower()
    for chiavi, col in COLORI_VANI:
        if any(k in n for k in chiavi):
            return col
    return "#ece6da"


class Scena:
    """Costruisce la scena con le API della CLI Blender (solo valori controllati)."""

    def __init__(self, p: Dict[str, Any], a: argparse.Namespace):
        from cli_anything.blender.core import scene as sc, render as rd
        rx, ry = a.risoluzione
        self.a = a; self.p = p
        self.proj = sc.create_scene(name=_testo(p.get("name", "Pianta Libera")), resolution_x=rx, resolution_y=ry,
                                    engine=a.motore, samples=a.campioni)
        rd.set_render_settings(self.proj, use_denoising=True)
        if a.gpu:
            self.proj["render"]["device"] = "GPU"
        self.mat_idx: Dict[str, int] = {}
        self.n = 0

    # materiali --------------------------------------------------------
    def materiale(self, chiave: str, colore: Optional[List[float]] = None, rough: float = 0.6, metal: float = 0.0, alpha: float = 1.0) -> int:
        from cli_anything.blender.core import materials as mt
        k = f"{chiave}"
        if k in self.mat_idx:
            return self.mat_idx[k]
        lib = libreria()["materiali"]
        custom = self.p.get("materials") if isinstance(self.p.get("materials"), dict) else {}
        if colore is None:
            src = custom.get(chiave) if isinstance(custom.get(chiave), dict) else lib.get(chiave, {})
            colore = _lin(src.get("color"), (0.8, 0.8, 0.8))
            rough = _f(src.get("rough"), "rough", 0, 1, rough)
            metal = _f(src.get("metal"), "metal", 0, 1, metal)
            alpha = _f(src.get("opacity"), "opacity", 0, 1, alpha)
        idx = len(self.proj["materials"])
        mt.create_material(self.proj, name=f"M_{chiave}"[:60], color=colore, metallic=metal, roughness=rough)
        self.proj["materials"][-1]["alpha"] = alpha
        self.mat_idx[k] = idx
        return idx

    # primitive ----------------------------------------------------------
    def _add(self, tipo: str, nome: str, loc, rot, scale, params, mat: Optional[int], visibile: bool = True) -> int:
        from cli_anything.blender.core import objects as ob, materials as mt
        idx = len(self.proj["objects"])
        self.n += 1
        ob.add_object(self.proj, tipo, name=f"{nome}_{self.n}"[:60], location=list(loc), rotation=list(rot),
                      scale=list(scale), mesh_params=params)
        if mat is not None:
            mt.assign_material(self.proj, mat, idx)
        if not visibile:
            from cli_anything.blender.core import objects as ob2
            ob2.set_object_property(self.proj, idx, "visible", False)
        return idx

    def box(self, nome, centro, dim, rot=(0, 0, 0), mat=None, visibile=True) -> int:
        return self._add("cube", nome, centro, rot, [max(d, 1e-4) for d in dim], {"size": 1.0}, mat, visibile)

    def cil(self, nome, centro, r, h, rot=(0, 0, 0), mat=None, vertici=24) -> int:
        return self._add("cylinder", nome, centro, rot, [1, 1, 1], {"radius": max(r, 1e-4), "depth": max(h, 1e-4), "vertices": vertici}, mat)

    def sfera(self, nome, centro, r, scala=(1, 1, 1), mat=None) -> int:
        return self._add("sphere", nome, centro, (0, 0, 0), scala, {"radius": max(r, 1e-4), "segments": 24, "rings": 12}, mat)

    def cono(self, nome, centro, r1, r2, h, mat=None) -> int:
        return self._add("cone", nome, centro, (0, 0, 0), [1, 1, 1], {"radius1": r1, "radius2": r2, "depth": h, "vertices": 20}, mat)

    def taglia(self, idx: int, operando: int) -> None:
        from cli_anything.blender.core import modifiers as md
        nome = self.proj["objects"][operando]["name"]
        md.add_modifier(self.proj, "boolean", idx, params={"operation": "DIFFERENCE", "operand_object": nome, "solver": "EXACT"})


def _arredo(sc: Scena, o: Dict[str, Any]) -> None:
    """Arredo della libreria dell'editor (primitive estratte da furn()), alberi e persone."""
    lib = libreria()["arredi"]
    yaw = -math.radians(o["rot"])  # Three: rotation.y = -rot
    s = o["scale"]

    def mondo(lx, ly, lz):
        # Three locale (x, y su, z fronte) -> ruotato attorno a Y -> Blender (x, -z, y)
        X = o["x"] + (lx * math.cos(yaw) + lz * math.sin(yaw)) * s
        Z3 = o["y"] + (-lx * math.sin(yaw) + lz * math.cos(yaw)) * s
        return [X, -Z3, o["z"] + ly * s]

    rz = math.degrees(yaw)
    ref = o["ref"]
    if ref in lib:
        for k, pt in enumerate(lib[ref]["parti"][:200]):
            mat = sc.materiale(pt["m"])
            r = pt.get("r", [0, 0, 0])
            rot = [math.degrees(r[0]), -math.degrees(r[2]), rz + math.degrees(r[1])]
            eps = (k % 5) * 4e-4  # evita facce coincidenti tra pezzi (es. acqua e bordo della vasca)
            if pt["t"] == "box":
                d = pt["d"]
                q = list(pt["p"]); q[1] += eps / 2
                sc.box(f"A_{ref}", mondo(*q), [d[0] * s + eps, d[2] * s + eps, d[1] * s + eps], rot, mat)
            elif pt["t"] == "cyl":
                sc.cil(f"A_{ref}", mondo(*pt["p"]), pt["rad"] * s, pt["h"] * s, rot, mat)
            elif pt["t"] == "sphere":
                sc.sfera(f"A_{ref}", mondo(*pt["p"]), pt["rad"] * s, mat=mat)
        return
    # verde e persone: versioni semplificate dei generatori procedurali dell'editor
    leg = sc.materiale("corteccia", _lin("#6b5640", (0.3, 0.2, 0.1)), rough=1)
    if ref in ("cipresso",):
        sc.cil("Tronco", mondo(0, .5, 0), .12 * s, 1.0 * s, mat=leg)
        sc.cono("Chioma", mondo(0, 4.0, 0), .9 * s, .05 * s, 7.0 * s, mat=sc.materiale("foglie_cip", _lin("#2f4627", (.1, .2, .1)), rough=.9))
    elif ref == "palma":
        sc.cil("Tronco", mondo(0, 3.0, 0), .2 * s, 6.0 * s, mat=leg)
        sc.sfera("Chioma", mondo(0, 6.2, 0), 2.2 * s, (1, 1, .35), mat=sc.materiale("foglie_pal", _lin("#4d7a32", (.2, .4, .1)), rough=.9))
    elif ref in ("arbusto", "vaso_verde", "pianta_vaso"):
        sc.sfera("Arbusto", mondo(0, .6, 0), .7 * s, (1, 1, .85), mat=sc.materiale("foglie_arb", _lin("#4c6f34", (.2, .3, .1)), rough=.9))
    elif ref == "siepe":
        sc.box("Siepe", mondo(0, .8, 0), [3.0 * s, .75 * s, 1.6 * s], (0, 0, rz), sc.materiale("foglie_arb", _lin("#4c6f34", (.2, .3, .1)), rough=.9))
    elif ref.startswith("sagoma"):
        h = 1.65 if "donna" in ref else 1.78
        mat = sc.materiale("sagoma", _lin("#9aa1a6", (.5, .5, .5)), rough=.8)
        sc.cil("Persona", mondo(0, h * .42, 0), .18 * s, h * .84 * s, mat=mat)
        sc.sfera("Testa", mondo(0, h * .93, 0), .11 * s, mat=mat)
    elif ref in ("olivo", "latifoglia", "betulla", "quercia", "acero", "tiglio", "pino", "albero"):
        hh = 3.2 if ref == "olivo" else 5.5
        sc.cil("Tronco", mondo(0, hh * .3, 0), .18 * s, hh * .6 * s, mat=leg)
        col = "#87937a" if ref == "olivo" else "#5c7a3a"
        m = sc.materiale(f"foglie_{ref}", _lin(col, (.2, .3, .1)), rough=.9)
        sc.sfera("Chioma", mondo(0, hh * .75, 0), hh * .38 * s, (1.15, 1.15, .8), mat=m)
        sc.sfera("Chioma", mondo(.6, hh * .62, .4), hh * .26 * s, mat=m)


def scena_blender(p: Dict[str, Any], g: Dict[str, Any], a: argparse.Namespace) -> Dict[str, Any]:
    from cli_anything.blender.core import lighting as lt, render as rd

    sc = Scena(p, a)
    proj = sc.proj
    agenzia = getattr(a, "colori_vani", False)
    proj.setdefault("world", {})["background_color"] = [0.82, 0.87, 0.93] if a.spaccato is None else [1, 1, 1]
    if a.spaccato is not None and not a.sfondo:
        rd.set_render_settings(proj, film_transparent=True)

    m_muro = sc.materiale("intonaco")
    m_vetro = sc.materiale("vetro_finestra", [0.75, 0.85, 0.9, 1], rough=0.05, alpha=0.25)
    m_telaio = sc.materiale("telaio", _lin("#e8e6e0", (.8, .8, .8)), rough=.4)
    m_solaio = sc.materiale("solaio", _lin("#bdbab3", (.5, .5, .5)), rough=.9)

    # 1) tagli: aperture e falde (devono esistere prima dei modificatori che li usano)
    tagli_muro: Dict[int, List[int]] = {}
    for i, m in enumerate(g["muri"]):
        (ax, ay), (bx, by) = m["a"], m["b"]
        ux, uy = (bx - ax) / m["len"], (by - ay) / m["len"]
        ang = math.degrees(math.atan2(-(by - ay), bx - ax))
        for f in m["fori"]:
            c = f["t"] + f["w"] / 2
            idx = sc.box("Taglio", [ax + ux * c, -(ay + uy * c), m["z0"] + f["sill"] + f["h"] / 2], [f["w"], m["thick"] + 0.2, f["h"]],
                         (0, 0, ang), visibile=False)
            tagli_muro.setdefault(i, []).append(idx)
    coperture = {}
    if a.spaccato is None and not getattr(a, "senza_tetto", False):
        for lv_id in g["scelti"]:
            fa = falde(g, lv_id)
            if fa:
                fa["tagli"], fa["tagli_int"] = [], []
                for lato, ang in fa["lati"]:
                    centro, rot, S = taglio_falda(fa, lato, ang)
                    fa["tagli"].append(sc.box("Falda", centro, [S, S, S], rot, visibile=False))
                    centro, rot, S = taglio_falda(fa, lato, ang, giu=SPESSORE_TETTO)
                    fa["tagli_int"].append(sc.box("Falda_int", centro, [S, S, S], rot, visibile=False))
                if fa["lati"]:
                    # volume interno del sottotetto (nascosto): svuota il tetto, che resta un guscio
                    X0, Y0, Z0, X1, Y1, Z1 = fa["box"]
                    fa["interno"] = sc.box("Sottotetto", [(X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 - 2 + Z1) / 2], [X1 - X0 + 0.02, Y1 - Y0 + 0.02, Z1 - Z0 + 2],
                                           visibile=False)
                    for t in fa["tagli_int"]:
                        sc.taglia(fa["interno"], t)
                coperture[lv_id] = fa
    # 2) muri (sotto un tetto a falde salgono fino al colmo e vengono tagliati dalle falde: timpani automatici)
    for i, m in enumerate(g["muri"]):
        (ax, ay), (bx, by) = m["a"], m["b"]
        ang = math.degrees(math.atan2(-(by - ay), bx - ax))
        fa = coperture.get(m["level"])
        h = m["h"]
        if fa and fa["lati"] and abs(m["h"] - g["livelli"][m["level"]]["height"]) < 1e-6:
            h = fa["ridge"] - m["z0"]
        dz = (i % 7) * 2e-4  # evita facce coincidenti agli angoli
        mat = m_muro if not agenzia else sc.materiale("muro_agenzia", _lin("#fbfaf7", (.95, .95, .95)), rough=.9)
        so = m["sotto"]
        idx = sc.box("Muro", [(ax + bx) / 2, -(ay + by) / 2, m["z0"] - so + (h + so + dz) / 2],
                     [m["len"] + m["thick"] + dz, m["thick"] + dz, h + so + dz], (0, 0, ang), mat)
        for t in tagli_muro.get(i, []):
            sc.taglia(idx, t)
        if fa and h != m["h"]:
            for t in fa["tagli_int"]:
                sc.taglia(idx, t)
        # vetri e telai delle finestre
        ux, uy = (bx - ax) / m["len"], (by - ay) / m["len"]
        for f in m["fori"]:
            c = f["t"] + f["w"] / 2
            centro = [ax + ux * c, -(ay + uy * c), m["z0"] + f["sill"] + f["h"] / 2]
            if f["tipo"] == "window" or f["porta_finestra"]:
                sc.box("Vetro", centro, [f["w"], 0.02, f["h"]], (0, 0, ang), m_vetro)
                sc.box("Telaio", [centro[0], centro[1], m["z0"] + f["sill"] + 0.03], [f["w"], m["thick"] * 0.6, 0.06], (0, 0, ang), m_telaio)
    # 3) coperture: solido tagliato dalle falde
    for lv_id, fa in coperture.items():
        X0, Y0, Z0, X1, Y1, Z1 = fa["box"]
        idx = sc.box("Tetto", [(X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 + Z1) / 2], [X1 - X0, Y1 - Y0, Z1 - Z0], mat=sc.materiale(fa["mat"]))
        for t in fa.get("tagli", []):
            sc.taglia(idx, t)
        if "interno" in fa:
            sc.taglia(idx, fa["interno"])
    # 4) pavimenti (colori per funzione nella versione per agenzie), soffitti e luci a richiesta
    for r in g["locali"]:
        mat = sc.materiale(f"vano_{colore_vano(r['name'])}", _lin(colore_vano(r["name"]), (.9, .9, .9)), rough=.7) if agenzia \
            else sc.materiale(r["mat"] if isinstance(r["mat"], str) else "parquet")
        for (x0, y0, x1, y1) in r["rects"]:
            spess = max(r["slab"], 0.02)
            sc.box("Pavimento", [(x0 + x1) / 2, -(y0 + y1) / 2, r["z0"] - spess / 2], [x1 - x0, y1 - y0, spess], mat=mat)
            if a.soffitti and a.spaccato is None and not r["balcone"] and r["level"] not in coperture:
                sc.box("Soffitto", [(x0 + x1) / 2, -(y0 + y1) / 2, r["ceil"] + 0.05], [x1 - x0, y1 - y0, 0.1], mat=m_solaio)
                lt.add_light(proj, "AREA", name=f"Luce_{r['name']}"[:60], location=[(x0 + x1) / 2, -(y0 + y1) / 2, r["ceil"] - 0.02],
                             power=max(6.0 * (x1 - x0) * (y1 - y0), 10.0))
                proj["lights"][-1].update({"shape": "RECTANGLE", "size": max(x1 - x0 - 0.4, 0.2), "size_y": max(y1 - y0 - 0.4, 0.2)})
    # 5) arredi, verde, persone
    if not getattr(a, "senza_arredi", False):
        for o in g["oggetti"]:
            if a.spaccato is not None and o["ref"].startswith("sagoma"):
                continue
            _arredo(sc, o)
    # 6) terreno (solo viste esterne)
    x0, y0, x1, y1, zb, zt = g["bbox"]
    if a.spaccato is None and not agenzia:
        sc.box("Terreno", [(x0 + x1) / 2, -(y0 + y1) / 2, zb - 0.32], [x1 - x0 + 60, y1 - y0 + 60, 0.1],
               mat=sc.materiale("prato", _lin("#7d9a5a", (.3, .5, .2)), rough=1))
    # 7) sole
    sun = p.get("sun") if isinstance(p.get("sun"), dict) else {}
    az = _f(sun.get("az"), "sole.az", -720, 720, 210.0)
    el = _f(sun.get("el"), "sole.el", -90, 90, 40.0)
    lt.add_light(proj, "SUN", name="Sole", location=[0, 0, 50], rotation=[90 - el, 0, 180 - az], power=4.0)
    proj["lights"][-1]["angle"] = 0.02
    camera(sc, p, g, a)
    return proj


def _cam_rot(pos, tgt) -> List[float]:
    dx, dy, dz = (tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2])
    return [90.0 + math.degrees(math.atan2(dz, math.hypot(dx, dy))), 0.0, math.degrees(math.atan2(dy, dx)) - 90.0]


def camera(sc: Scena, p: Dict[str, Any], g: Dict[str, Any], a: argparse.Namespace) -> None:
    from cli_anything.blender.core import lighting as lt
    rx, ry = a.risoluzione
    x0, y0, x1, y1, zb, zt = g["bbox"]
    cx, cy, cz = (x0 + x1) / 2, -(y0 + y1) / 2, (zb + zt) / 2
    diag = math.hypot(x1 - x0, y1 - y0)
    cams = [c for c in p.get("cameras", []) if isinstance(c, dict)]
    scelta = None
    vista = a.camera
    if vista not in (None, "assonometria", "prospettiva", "pianta") and not str(vista).startswith("iso-"):
        scelta = next((c for c in cams if str(c.get("name")) == vista or _id(c.get("id")) == vista), None)
        if scelta is None:
            raise ErroreProgetto(f"camera «{vista}» non trovata; disponibili: {', '.join(_testo(c.get('name')) for c in cams) or 'nessuna'}")
    elif vista is None and cams and a.spaccato is None:
        scelta = cams[0]
    if scelta is not None:
        pos, tgt = scelta.get("pos"), scelta.get("target")
        if not (isinstance(pos, list) and isinstance(tgt, list) and len(pos) == 3 and len(tgt) == 3):
            raise ErroreProgetto("camera senza posizione valida")
        P = (_f(pos[0], "cam"), -_f(pos[2], "cam"), _f(pos[1], "cam"))
        T = (_f(tgt[0], "cam"), -_f(tgt[2], "cam"), _f(tgt[1], "cam"))
        vfov = math.radians(_f(scelta.get("fov"), "fov", 5, 170, 45.0))
        hfov = 2 * math.atan(math.tan(vfov / 2) * rx / ry)
        lt.add_camera(sc.proj, name=_testo(scelta.get("name", "Vista")), location=list(P), rotation=_cam_rot(P, T),
                      focal_length=36.0 / 2 / math.tan(hfov / 2), sensor_width=36.0, clip_start=0.05, clip_end=2000, set_active=True)
        return
    if vista == "pianta":
        lt.add_camera(sc.proj, name="Pianta", location=[cx, cy, zt + 50], rotation=[0, 0, 0], camera_type="ORTHO",
                      clip_start=0.1, clip_end=500, set_active=True)
        sc.proj["cameras"][-1]["ortho_scale"] = max(x1 - x0, (y1 - y0) * rx / ry) * 1.18 + 1.0
        return
    # isometria dai quattro angoli: iso-se (predefinita), iso-so, iso-ne, iso-no
    ango = {"iso-se": (1, -1), "iso-so": (-1, -1), "iso-ne": (1, 1), "iso-no": (-1, 1)}.get(vista or "iso-se", (1, -1))
    d = diag * 1.6 + 10
    P = (cx + ango[0] * d * 0.6, cy + ango[1] * d * 0.6, cz + d * 0.7)
    orto = vista in ("assonometria",) or str(vista).startswith("iso-") or (vista is None and a.spaccato is not None)
    lt.add_camera(sc.proj, name="Assonometria" if orto else "Insieme", location=list(P), rotation=_cam_rot(P, (cx, cy, cz)),
                  camera_type="ORTHO" if orto else "PERSP", focal_length=35, clip_start=0.1, clip_end=5000, set_active=True)
    if orto:
        sc.proj["cameras"][-1]["ortho_scale"] = diag * (1.25 if a.spaccato is not None else 1.5) + 1.5


def proietta(cam: Dict[str, Any], punto, rx: int, ry: int) -> Tuple[float, float]:
    """Punto 3D -> pixel per una camera ortografica (per le etichette dei vani)."""
    ax, ay, az = (math.radians(v) for v in cam["rotation"])
    def rotz(v, t): return (v[0] * math.cos(t) - v[1] * math.sin(t), v[0] * math.sin(t) + v[1] * math.cos(t), v[2])
    def roty(v, t): return (v[0] * math.cos(t) + v[2] * math.sin(t), v[1], -v[0] * math.sin(t) + v[2] * math.cos(t))
    def rotx(v, t): return (v[0], v[1] * math.cos(t) - v[2] * math.sin(t), v[1] * math.sin(t) + v[2] * math.cos(t))
    def R(v): return rotz(roty(rotx(v, ax), ay), az)
    right, up = R((1, 0, 0)), R((0, 1, 0))
    d = [punto[i] - cam["location"][i] for i in range(3)]
    s = cam["ortho_scale"]
    w, h = (s, s * ry / rx) if rx >= ry else (s * rx / ry, s)
    u = sum(d[i] * right[i] for i in range(3)) / w + 0.5
    v = 0.5 - sum(d[i] * up[i] for i in range(3)) / h
    return u * rx, v * ry


def esegui_render(proj: Dict[str, Any], out: str, timeout: int) -> Dict[str, Any]:
    from cli_anything.blender.core import render as rd
    from cli_anything.blender.utils import blender_backend as bb
    script = rd.generate_bpy_script(proj, os.path.abspath(out))
    return bb.render_scene_headless(script, os.path.abspath(out), timeout=timeout)


def comando_blender(a: argparse.Namespace) -> int:
    p = carica_progetto(a.progetto)
    g = geometria(p, a.livello, a.spaccato)
    proj = scena_blender(p, g, a)
    out = a.output or os.path.splitext(a.progetto)[0] + ".blend-cli.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(proj, fh, indent=1)
    for av in g["avvisi"]:
        print("Avviso:", av)
    print(f"Scena Blender: {out}  ({len(g['muri'])} muri, {sum(len(m['fori']) for m in g['muri'])} aperture, "
          f"{len(g['locali'])} locali, {len(g['oggetti'])} arredi/verde, {len(proj['objects'])} oggetti Blender)")
    if a.render:
        res = esegui_render(proj, a.render, a.timeout)
        print(f"Render: {res['output']}  ({res['file_size']} byte, {res.get('blender_version', '')})")
    return 0


# ---------------------------------------------------------------------------
# Pacchetto per agenzie immobiliari
# ---------------------------------------------------------------------------


def _etichette(png: str, cam: Dict[str, Any], g: Dict[str, Any], rx: int, ry: int, titolo: str) -> None:
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(png).convert("RGBA")
    dr = ImageDraw.Draw(img)

    def font(sz):
        for nome in ("DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf", "LiberationSans-Bold.ttf"):
            try:
                return ImageFont.truetype(nome, sz)
            except OSError:
                continue
        return ImageFont.load_default()

    f1, f2 = font(max(12, rx // 70)), font(max(10, rx // 90))
    for r in g["locali"]:
        if r["level"] != g["ultimo"]:
            continue
        x, y = proietta(cam, (r["centro"][0], -r["centro"][1], r["z0"] + 0.02), rx, ry)
        for testo, ft, dy in ((r["name"], f1, -0.6), (f"{r['area']:.1f} m²".replace(".", ","), f2, 0.7)):
            bb = dr.textbbox((0, 0), testo, font=ft)
            w, h = bb[2] - bb[0], bb[3] - bb[1]
            X, Y = x - w / 2, y + dy * h * 1.3 - h / 2
            dr.rounded_rectangle([X - 6, Y - 4, X + w + 6, Y + h + 6], radius=6, fill=(255, 255, 255, 215))
            dr.text((X, Y), testo, fill=(40, 40, 40, 255), font=ft)
    if titolo:
        ft = font(max(14, rx // 55))
        hb = dr.textbbox((0, 0), titolo, font=ft)
        dr.text((rx * 0.02, ry - (hb[3] - hb[1]) - ry * 0.025), titolo, fill=(40, 40, 40, 255), font=ft)
    img.save(png)


def su_bianco(png: str) -> str:
    """Salva una copia trasparente e porta l'originale su fondo bianco (annunci)."""
    from PIL import Image
    img = Image.open(png).convert("RGBA")
    trasp = png[:-4] + "-trasparente.png"
    img.save(trasp)
    fondo = Image.new("RGBA", img.size, (255, 255, 255, 255))
    fondo.alpha_composite(img)
    fondo.convert("RGB").save(png)
    return os.path.basename(trasp)


def comando_agenzia(a: argparse.Namespace) -> int:
    p = carica_progetto(a.progetto)
    os.makedirs(a.cartella, exist_ok=True)
    rx, ry = a.risoluzione
    fatti = []
    tot = 0.0
    # superfici
    g0 = geometria(p, a.livello, None)
    with open(os.path.join(a.cartella, "superfici.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Piano", "Vano", "Superficie (m²)"])
        for r in g0["locali"]:
            w.writerow([g0["livelli"][r["level"]]["name"], r["name"], f"{r['area']:.2f}".replace(".", ",")])
            tot += r["area"]
        w.writerow(["", "Totale calpestabile", f"{tot:.2f}".replace(".", ",")])
    fatti.append("superfici.csv")
    titolo = _testo(p.get("name", ""))
    viste = [("planimetria-colori", "pianta", True), ("spaccato-se", "iso-se", True), ("spaccato-so", "iso-so", True),
             ("spaccato-ne", "iso-ne", True), ("spaccato-no", "iso-no", True), ("spaccato-realistico", "iso-se", False)]
    for nome, vista, colori in viste:
        b = copy.copy(a); b.camera = vista; b.spaccato = a.spaccato; b.colori_vani = colori; b.sfondo = False; b.soffitti = False
        g = geometria(p, a.livello, a.spaccato)
        proj = scena_blender(p, g, b)
        out = os.path.join(a.cartella, f"{nome}.png")
        esegui_render(proj, out, a.timeout)
        if colori:
            _etichette(out, proj["cameras"][-1], g, rx, ry, titolo if vista == "pianta" else "")
        fatti.append(os.path.basename(out))
        if vista != "pianta":
            fatti.append(su_bianco(out))
        else:
            su_bianco(out); os.remove(out[:-4] + "-trasparente.png")
        print("  ✓", nome)
    if a.giro:
        fatti.append(giro(p, a))
    print(f"Pacchetto agenzia in {a.cartella}: {', '.join(fatti)}  (totale {tot:.1f} m²)")
    return 0


def giro(p: Dict[str, Any], a: argparse.Namespace) -> str:
    """Video a giro dello spaccato (GIF; MP4 se c'è ffmpeg)."""
    from PIL import Image
    import shutil
    import subprocess
    n = a.giro
    cart = os.path.join(a.cartella, "_giro"); os.makedirs(cart, exist_ok=True)
    g = geometria(p, a.livello, a.spaccato)
    x0, y0, x1, y1, zb, zt = g["bbox"]
    cx, cy, cz = (x0 + x1) / 2, -(y0 + y1) / 2, (zb + zt) / 2
    diag = math.hypot(x1 - x0, y1 - y0); d = diag * 1.6 + 10
    b = copy.copy(a); b.colori_vani = True; b.sfondo = True; b.soffitti = False
    b.risoluzione = (min(a.risoluzione[0], 960), min(a.risoluzione[1], 600)); b.campioni = min(a.campioni, 24)
    frames = []
    for i in range(n):
        t = 2 * math.pi * i / n - math.pi / 4
        b.camera = "iso-se"
        proj = scena_blender(p, g, b)
        P = (cx + math.cos(t) * d * 0.85, cy + math.sin(t) * d * 0.85, cz + d * 0.7)
        cam = proj["cameras"][-1]; cam["location"] = list(P); cam["rotation"] = _cam_rot(P, (cx, cy, cz))
        f = os.path.join(cart, f"f{i:03d}.png")
        esegui_render(proj, f, a.timeout)
        frames.append(f)
        print(f"  giro {i + 1}/{n}")
    imgs = []
    for f in frames:
        im = Image.open(f).convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
        imgs.append(bg.convert("RGB")); imgs[-1].save(f)
    gif = os.path.join(a.cartella, "giro.gif")
    imgs[0].save(gif, save_all=True, append_images=imgs[1:], duration=120, loop=0)
    ff = shutil.which("ffmpeg")
    if ff:
        subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "8", "-i", os.path.join(cart, "f%03d.png"),
                        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        os.path.join(os.path.abspath(a.cartella), "giro.mp4")], check=False)
    return "giro.gif" + (" + giro.mp4" if ff else "")


# ---------------------------------------------------------------------------
# FreeCAD: plastico per la stampa 3D
# ---------------------------------------------------------------------------


class Modello:
    def __init__(self, nome: str, k: float, minimo: float):
        from cli_anything.freecad.core import document as dc
        self.proj = dc.create_document(name=nome, units="mm")
        self.k = k; self.min = minimo; self.n = 0

    def box(self, nome, angolo, rot_z, L, W, H, rot=None) -> int:
        from cli_anything.freecad.core import parts as pt
        self.n += 1
        pt.add_part(self.proj, "box", name=f"{nome}_{self.n}", position=list(angolo), rotation=rot or [0, 0, rot_z],
                    params={"length": max(L, 1e-3), "width": max(W, 1e-3), "height": max(H, 1e-3)})
        return len(self.proj["parts"]) - 1

    def cil(self, nome, base, r, h) -> int:
        from cli_anything.freecad.core import parts as pt
        self.n += 1
        pt.add_part(self.proj, "cylinder", name=f"{nome}_{self.n}", position=list(base), rotation=[0, 0, 0],
                    params={"radius": max(r, self.min / 2), "height": max(h, 1e-3)})
        return len(self.proj["parts"]) - 1

    def taglia(self, base: int, tool: int, nome: str) -> int:
        from cli_anything.freecad.core import parts as pt
        self.n += 1
        pt.boolean_op(self.proj, "cut", base, tool, name=f"{nome}_{self.n}")
        return len(self.proj["parts"]) - 1


def _ruota(lx, ly, c, s):
    return lx * c - ly * s, lx * s + ly * c


def modello_freecad(p: Dict[str, Any], g: Dict[str, Any], a: argparse.Namespace, livelli: Optional[List[str]] = None,
                    tetto: bool = True) -> Dict[str, Any]:
    k = 1000.0 / a.scala
    M = Modello(_testo(p.get("name", "Pianta Libera")), k, a.spessore_minimo)
    livelli = livelli or g["scelti"]
    for i, m in enumerate(g["muri"]):
        if m["level"] not in livelli:
            continue
        (ax, ay), (bx, by) = m["a"], m["b"]
        ang = math.atan2(-(by - ay), bx - ax); c, s = math.cos(ang), math.sin(ang)
        t = max(m["thick"] * k, M.min); ext = t / 2
        dx, dy = _ruota(-ext, -t / 2, c, s)
        cur = M.box("Muro", [ax * k + dx, -ay * k + dy, (m["z0"] - m["sotto"]) * k], math.degrees(ang), m["len"] * k + 2 * ext, t,
                    (m["h"] + m["sotto"]) * k)
        for f in m["fori"]:
            dx, dy = _ruota(f["t"] * k, -t / 2 - 1.0, c, s)
            tool = M.box("Foro", [ax * k + dx, -ay * k + dy, (m["z0"] + f["sill"]) * k], math.degrees(ang), f["w"] * k, t + 2.0, f["h"] * k)
            cur = M.taglia(cur, tool, "Muro_forato")
    for r in g["locali"]:
        if r["level"] not in livelli:
            continue
        for (x0, y0, x1, y1) in r["rects"]:
            sp = max(r["slab"] * k, M.min)
            M.box("Pavimento", [x0 * k, -y1 * k, r["z0"] * k - sp], 0.0, (x1 - x0) * k, (y1 - y0) * k, sp)
    if getattr(a, "arredi", False):
        lib = libreria()["arredi"]
        for o in g["oggetti"]:
            if o["level"] not in livelli or o["ref"] not in lib:
                continue
            yaw = -math.radians(o["rot"])
            for pt in lib[o["ref"]]["parti"][:200]:
                lx, ly, lz = pt["p"]
                X = o["x"] + (lx * math.cos(yaw) + lz * math.sin(yaw)) * o["scale"]
                Z3 = o["y"] + (-lx * math.sin(yaw) + lz * math.cos(yaw)) * o["scale"]
                if pt["t"] == "box":
                    d = [max(v * o["scale"] * k, M.min) for v in pt["d"]]
                    cx, cy, cz = X * k, -Z3 * k, (o["z"] + ly * o["scale"]) * k
                    rz = math.degrees(yaw) + math.degrees(pt.get("r", [0, 0, 0])[1])
                    cc, ss = math.cos(math.radians(rz)), math.sin(math.radians(rz))
                    ox, oy = _ruota(-d[0] / 2, -d[2] / 2, cc, ss)
                    M.box("Arredo", [cx + ox, cy + oy, cz - d[1] / 2], rz, d[0], d[2], d[1])
                elif pt["t"] == "cyl":
                    h = max(pt["h"] * o["scale"] * k, M.min)
                    M.cil("Arredo", [X * k, -Z3 * k, (o["z"] + ly * o["scale"]) * k - h / 2], pt["rad"] * o["scale"] * k, h)
    if tetto:
        for lv_id in livelli:
            fa = falde(g, lv_id)
            if not fa:
                continue
            X0, Y0, Z0, X1, Y1, Z1 = fa["box"]
            cur = M.box("Tetto", [X0 * k, Y0 * k, Z0 * k], 0.0, (X1 - X0) * k, (Y1 - Y0) * k, (Z1 - Z0) * k)
            for lato, ang in fa["lati"]:
                centro, rot, S = taglio_falda(fa, lato, ang)
                # FreeCAD: il box parte dall'angolo; ruoto l'angolo (-S/2,-S/2,-S/2) attorno al centro
                Sk = S * k
                v = (-Sk / 2, -Sk / 2, -Sk / 2)
                rxr, ryr = math.radians(rot[0]), math.radians(rot[1])
                v = (v[0], v[1] * math.cos(rxr) - v[2] * math.sin(rxr), v[1] * math.sin(rxr) + v[2] * math.cos(rxr))
                v = (v[0] * math.cos(ryr) + v[2] * math.sin(ryr), v[1], -v[0] * math.sin(ryr) + v[2] * math.cos(ryr))
                tool = M.box("Falda", [centro[0] * k + v[0], centro[1] * k + v[1], centro[2] * k + v[2]], 0, Sk, Sk, Sk,
                             rot=[rot[0], rot[1], 0])
                cur = M.taglia(cur, tool, "Tetto")
    if getattr(a, "unisci", True):
        # un solo solido per pezzo stampabile: fonde (Part::Fuse) tutti i risultati finali
        usati = {pp["params"].get(k) for pp in M.proj["parts"] if pp.get("type") in ("cut", "fuse", "common") for k in ("base_id", "tool_id")}
        finali = [i for i, pp in enumerate(M.proj["parts"]) if pp["id"] not in usati]
        from cli_anything.freecad.core import parts as pt
        cur = finali[0] if finali else None
        for i in finali[1:]:
            M.n += 1
            pt.boolean_op(M.proj, "fuse", cur, i, name=f"Plastico_{M.n}")
            cur = len(M.proj["parts"]) - 1
    return M.proj


def comando_freecad(a: argparse.Namespace) -> int:
    from cli_anything.freecad.core import export as ex
    p = carica_progetto(a.progetto)
    g = geometria(p, a.livello, a.spaccato)
    for av in g["avvisi"]:
        print("Avviso:", av)
    lavori = []
    if a.per_piano:
        ordine = sorted(g["scelti"], key=lambda l: g["livelli"][l]["elev"])
        for i, lv in enumerate(ordine):
            lavori.append((f"piano{i}-{_testo(g['livelli'][lv]['name'], 20).replace(' ', '_') or lv}", [lv], False))
        if any(falde(g, lv) for lv in ordine) and a.spaccato is None:
            lavori.append(("tetto", ordine, "solo"))
    else:
        lavori.append(("", None, a.spaccato is None))
    for suff, livs, tetto in lavori:
        if tetto == "solo":
            b = copy.copy(a); b.arredi = False
            proj = modello_freecad(p, g, b, livs, True)
            proj["parts"] = [x for x in proj["parts"] if str(x.get("name", "")).startswith(("Tetto", "Falda"))]
        else:
            proj = modello_freecad(p, g, a, livs, bool(tetto))
        base, est = os.path.splitext(a.esporta or a.output or os.path.splitext(a.progetto)[0] + ".stl")
        nome_json = (a.output or base + ".freecad-cli.json") if not suff else f"{base}-{suff}.freecad-cli.json"
        with open(nome_json, "w", encoding="utf-8") as fh:
            json.dump(proj, fh, indent=1)
        print(f"Modello FreeCAD: {nome_json}  (scala 1:{a.scala:g}, {len(proj['parts'])} parti)")
        if a.esporta:
            dest = f"{base}-{suff}{est}" if suff else a.esporta
            res = ex.export_project(proj, os.path.abspath(dest), preset=est.lstrip(".").lower(), overwrite=True)
            print(f"Esportato: {res.get('output')}  ({res.get('file_size')} byte)")
    return 0


# ---------------------------------------------------------------------------


def _risoluzione(s: str) -> Tuple[int, int]:
    try:
        w, h = (int(x) for x in s.lower().split("x"))
    except ValueError:
        raise argparse.ArgumentTypeError("formato: 1920x1080")
    if not (16 <= w <= 16384 and 16 <= h <= 16384):
        raise argparse.ArgumentTypeError("risoluzione fuori intervallo")
    return w, h


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="pianta3d", description="Pianta Libera → Blender / FreeCAD (CLI-Anything) — dimostrativo")
    ap.add_argument("--version", action="version", version=VERSIONE)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome in ("blender", "freecad", "agenzia"):
        s = sub.add_parser(nome)
        s.add_argument("progetto", help="progetto .json esportato da Pianta Libera")
        s.add_argument("--livello", help="id del piano (predefinito: tutti)")
        s.add_argument("--spaccato", type=float, help="taglia i muri del piano più alto a questa quota (m), senza tetto")
    for nome in ("blender", "agenzia"):
        b = sub.choices[nome]
        b.add_argument("--risoluzione", type=_risoluzione, default=(1920, 1080))
        b.add_argument("--motore", choices=["CYCLES", "EEVEE", "WORKBENCH"], default="CYCLES")
        b.add_argument("--campioni", type=int, default=128)
        b.add_argument("--cpu", dest="gpu", action="store_false", help="non usare la GPU per Cycles")
        b.add_argument("--senza-arredi", action="store_true")
        b.add_argument("--timeout", type=int, default=1800)
    b = sub.choices["blender"]
    b.add_argument("-o", "--output", help="file della scena JSON per cli-anything-blender")
    b.add_argument("--render", help="immagine da produrre (PNG/JPG); richiede Blender")
    b.add_argument("--camera", help="camera salvata, «assonometria», «prospettiva», «pianta», «iso-se|so|ne|no»")
    b.add_argument("--soffitti", action="store_true", help="soffitti e luci (viste d'interno)")
    b.add_argument("--sfondo", action="store_true", help="nello spaccato tiene lo sfondo invece della trasparenza")
    b.add_argument("--colori-vani", action="store_true", help="pavimenti colorati per funzione (stile agenzia)")
    b.add_argument("--senza-tetto", action="store_true")
    ag = sub.choices["agenzia"]
    ag.add_argument("--cartella", required=True, help="cartella del pacchetto per l'annuncio")
    ag.add_argument("--giro", type=int, default=0, help="fotogrammi del video a giro (es. 24); 0 = niente video")
    ag.set_defaults(spaccato=None)
    f = sub.choices["freecad"]
    f.add_argument("-o", "--output", help="file del modello JSON per cli-anything-freecad")
    f.add_argument("--scala", type=float, default=100.0, help="denominatore di scala (100 = 1:100)")
    f.add_argument("--spessore-minimo", type=float, default=1.0, help="spessore minimo stampabile in mm (default 1.0)")
    f.add_argument("--esporta", help="file .stl, .step, .obj, .iges, .brep o .fcstd; richiede FreeCAD")
    f.add_argument("--per-piano", action="store_true", help="un file per piano + il tetto: plastico smontabile")
    f.add_argument("--arredi", action="store_true", help="include gli arredi nel plastico")
    f.add_argument("--pezzi-separati", dest="unisci", action="store_false", help="non fondere i solidi in un unico pezzo")
    a = ap.parse_args(argv)
    if a.cmd == "agenzia" and a.spaccato is None:
        a.spaccato = 1.2
    if a.spaccato is not None and not (0.1 <= a.spaccato <= 100):
        ap.error("--spaccato fuori intervallo (0,1–100 m)")
    if a.cmd == "freecad" and not (1 <= a.scala <= 10000):
        ap.error("--scala fuori intervallo")
    if a.cmd == "agenzia" and not (0 <= a.giro <= 360):
        ap.error("--giro fuori intervallo")
    try:
        return {"blender": comando_blender, "freecad": comando_freecad, "agenzia": comando_agenzia}[a.cmd](a)
    except (ErroreProgetto, json.JSONDecodeError) as e:
        print(f"Errore nel progetto: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
