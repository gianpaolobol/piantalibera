"""Valida i file prodotti dalla misura dei livelli: IFC con IfcOpenShell, DXF con ezdxf.
Uso: pip install ifcopenshell ezdxf && python3 -I scripts/valida-ifc-dxf.py [cartella]   (predefinita: test-results/livelli)"""
import sys, pathlib, ifcopenshell, ifcopenshell.validate, ezdxf
d = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "test-results/livelli")
ko = 0
for f in sorted(d.glob("*.ifc")):
    log = ifcopenshell.validate.json_logger(); m = ifcopenshell.open(str(f)); ifcopenshell.validate.validate(m, log, express_rules=False)
    print(f"{f.name}: IFC {m.schema}, errori di schema {len(log.statements)}, Pset {len(m.by_type('IfcPropertySet'))}, materiali {len(m.by_type('IfcMaterial'))}")
    ko += len(log.statements)
for f in sorted(d.glob("*.dxf")):
    doc = ezdxf.readfile(str(f)); a = doc.audit(); dich = {l.dxf.name for l in doc.layers}; usati = {e.dxf.layer for e in doc.modelspace()}
    print(f"{f.name}: DXF {doc.dxfversion}, errori di audit {len(a.errors)}, layer non dichiarati {sorted(usati - dich)}")
    ko += len(a.errors)
sys.exit(1 if ko else 0)
