"""Test di pianta3d (senza Blender né FreeCAD installati): python -m pytest strumenti/pianta3d -q"""
import argparse
import ast
import json
import math
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import pianta3d as p3  # noqa: E402

QUI = os.path.dirname(__file__)
UFFICIALE = os.path.join(QUI, "esempio-ufficiale.json")
APPARTAMENTO = os.path.join(QUI, "appartamento-esempio.json")
DUE_PIANI = os.path.join(QUI, "casa-due-piani.json")
blender = pytest.importorskip("cli_anything.blender.core.render")
freecad = pytest.importorskip("cli_anything.freecad.utils.freecad_macro_gen")


def _a(**kw):
    base = dict(livello=None, spaccato=None, risoluzione=(640, 400), motore="CYCLES", campioni=16, gpu=True, soffitti=False,
                sfondo=False, camera=None, colori_vani=False, senza_tetto=False, senza_arredi=False, scala=100.0,
                spessore_minimo=1.0, arredi=False, unisci=True)
    base.update(kw)
    return argparse.Namespace(**base)


def _p(f=UFFICIALE):
    return json.load(open(f, encoding="utf-8"))


def _blender(p, **kw):
    a = _a(**kw)
    g = p3.geometria(p, a.livello, a.spaccato)
    scena = p3.scena_blender(p, g, a)
    return g, scena, blender.generate_bpy_script(scena, "/tmp/out.png")


def _freecad(p, **kw):
    a = _a(**kw)
    g = p3.geometria(p, a.livello, a.spaccato)
    m = p3.modello_freecad(p, g, a)
    return g, m, freecad.generate_macro(m, "/tmp/out.stl", export_format="stl")


def test_libreria_arredi_estratta_dall_editor():
    lib = p3.libreria()
    assert len(lib["arredi"]) >= 30 and "divano3" in lib["arredi"] and "tegole" in lib["materiali"]


def test_esempio_ufficiale_tetto_a_falde_e_arredi():
    g, scena, script = _blender(_p(), camera="iso-se")
    ast.parse(script)
    nomi = [o["name"] for o in scena["objects"]]
    assert sum(n.startswith("Falda_") and not n.startswith("Falda_int") for n in nomi) == 2   # capanna: due falde
    assert any(n.startswith("Tetto_") for n in nomi) and any(n.startswith("Sottotetto_") for n in nomi)
    assert sum(n.startswith("A_divano3") for n in nomi) > 5       # divano fatto dei pezzi dell'editor
    assert any(n.startswith("Vetro_") for n in nomi)


def test_timpani_muri_salgono_al_colmo_e_vengono_tagliati():
    g, scena, _ = _blender(_p(), camera="iso-se")
    muro = next(o for o in scena["objects"] if o["name"].startswith("Muro_"))
    fa = p3.falde(g, "L0")
    assert muro["scale"][2] > g["livelli"]["L0"]["height"]      # alzato fino al colmo
    assert any(m.get("params", {}).get("operand_object", "").startswith("Falda_int") for m in muro["modifiers"])
    assert fa["ridge"] == pytest.approx(2.9 + (8 + .3 + 1.0) / 2 * math.tan(math.radians(26)), rel=1e-6)


def test_padiglione_quattro_falde_e_piani_sovrapposti():
    g, scena, _ = _blender(_p(DUE_PIANI), camera="iso-se")
    assert sum(o["name"].startswith("Falda_") and not o["name"].startswith("Falda_int") for o in scena["objects"]) == 4
    sopra = [m for m in g["muri"] if m["level"] == "L1"]
    assert all(m["sotto"] == pytest.approx(0.25) for m in sopra)   # coprono lo spessore del solaio


def test_spaccato_senza_tetto_trasparente_e_tagliato():
    g, scena, script = _blender(_p(APPARTAMENTO), spaccato=1.2, colori_vani=True)
    assert not any(o["name"].startswith("Tetto_") for o in scena["objects"])
    assert all(m["h"] <= 1.2 for m in g["muri"])
    assert "scene.render.film_transparent = True" in script
    assert scena["cameras"][0]["type"] == "ORTHO"


def test_superfici_e_centri_dei_vani():
    g = p3.geometria(_p(APPARTAMENTO), None, None)
    aree = {r["name"]: r["area"] for r in g["locali"]}
    assert aree["Soggiorno"] == pytest.approx(6.79 * 4.91 + 3.38 * 2.79, rel=1e-3)  # soggiorno a L
    assert sum(aree.values()) == pytest.approx(91.9, abs=0.1)


def test_proiezione_etichette_in_pianta():
    a = _a(camera="pianta", spaccato=1.2, colori_vani=True, risoluzione=(1000, 800))
    p = _p(APPARTAMENTO); g = p3.geometria(p, None, 1.2)
    cam = p3.scena_blender(p, g, a)["cameras"][0]
    x0, y0, x1, y1 = g["bbox"][:4]
    u, v = p3.proietta(cam, ((x0 + x1) / 2, -(y0 + y1) / 2, 0), 1000, 800)
    assert u == pytest.approx(500, abs=1) and v == pytest.approx(400, abs=1)
    u, _ = p3.proietta(cam, (x0, -(y0 + y1) / 2, 0), 1000, 800)
    assert 0 < u < 500


def test_freecad_plastico_fuso_e_in_scala():
    g, m, macro = _freecad(_p(), arredi=True)
    ast.parse(macro)
    assert "Part::Fuse" in macro and macro.count("Part::Cut") >= 8 + 2   # aperture + falde
    tramezzo = next(pp for pp in m["parts"] if pp["type"] == "box" and pp["name"].startswith("Muro_") and pp["params"]["width"] < 2)
    assert tramezzo["params"]["width"] == pytest.approx(1.2)          # 12 cm a 1:100


OSTILE = "x'); __import__('os').system('PWNED') #\n__import__('os')"


@pytest.mark.parametrize("campo", ["name", "rooms.0.name", "cameras.0.name", "walls.0.mat", "rooms.0.mat",
                                   "objects.0.ref", "objects.0.name", "levels.0.name", "levels.0.roof.mat", "openings.0.type"])
def test_testi_ostili_non_diventano_codice(campo):
    p = _p()
    o = p
    *strada, ultimo = campo.split(".")
    for k in strada:
        o = o[int(k)] if k.isdigit() else o[k]
    o[int(ultimo) if ultimo.isdigit() else ultimo] = OSTILE
    for script in (_blender(p, camera="iso-se")[2], _freecad(p)[2]):
        for c in ast.walk(ast.parse(script)):
            if isinstance(c, ast.Call):
                f = c.func
                assert not (isinstance(f, ast.Name) and f.id in ("__import__", "eval", "exec"))
                assert not (isinstance(f, ast.Attribute) and f.attr in ("system", "popen", "remove", "rmtree"))


@pytest.mark.parametrize("valore", ["1); x(", float("nan"), float("inf"), 1e9])
def test_numeri_ostili_rifiutati(valore):
    p = _p()
    p["walls"][0]["thick"] = valore
    if isinstance(valore, str):
        assert p3.geometria(p, None, None)["muri"][0]["thick"] == 0.3   # tipo errato -> valore predefinito
    else:
        with pytest.raises(p3.ErroreProgetto):
            p3.geometria(p, None, None)


def test_json_con_nan_rifiutato():
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        fh.write('{"levels":[{"id":"L0"}],"walls":[{"a":[NaN,0],"b":[1,1],"level":"L0"}]}')
    try:
        with pytest.raises(p3.ErroreProgetto):
            p3.carica_progetto(fh.name)
    finally:
        os.unlink(fh.name)


def test_cli(tmp_path):
    assert p3.main(["blender", UFFICIALE, "-o", str(tmp_path / "s.json"), "--camera", "iso-no"]) == 0
    assert p3.main(["freecad", UFFICIALE, "-o", str(tmp_path / "m.json"), "--scala", "50"]) == 0
    assert p3.main(["blender", UFFICIALE, "--livello", "XX", "-o", str(tmp_path / "x.json")]) == 2
