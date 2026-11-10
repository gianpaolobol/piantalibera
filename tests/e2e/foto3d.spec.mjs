// «Da foto al 3D»: geometria da una fotocamera virtuale nota e percorso completo con il server di prova.
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOCAL = process.env.PL_LOCAL_THREE;
async function open(page){
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (/Content Security Policy|integrity/i.test(m.text())) errors.push(m.text()); });
  if (LOCAL){
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.147\.0\/(.*)$/, r => { const p = join(LOCAL, r.request().url().split("three@0.147.0/")[1]); return existsSync(p) ? r.fulfill({ body: readFileSync(p), contentType: "application/javascript" }) : r.abort(); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: "", contentType: "text/css" }));
  }
  await page.goto("/?nosw");
  await page.waitForFunction(() => typeof P !== "undefined" && P && typeof buildModel === "function");
  await page.waitForTimeout(800);
  return errors;
}

/* scena nota: parete di fondo da x=1 a x=5,2 (z=0), soffitto 2,8 m; fotocamera a 1,5 m in (2,6; 4,6),
   inclinata di −6° e ruotata di 8°, campo visivo orizzontale 60°, foto 1200×900 */
const SCENE = () => {
  const W = 1200, H = 900, hfov = 60, cam = new THREE.PerspectiveCamera(2 * Math.atan(Math.tan(hfov * Math.PI / 360) * H / W) * 180 / Math.PI, W / H, .05, 100);
  cam.position.set(2.6, 1.5, 4.6); cam.rotation.order = "YXZ"; cam.rotation.set(-6 * Math.PI / 180, 8 * Math.PI / 180, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const pr = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
  const box = pts => { const q = pts.map(p => pr(...p)); return [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]; };
  const cuboid = (x0, x1, y0, y1, z0, z1) => [x0, x1].flatMap(x => [y0, y1].flatMap(y => [z0, z1].map(z => [x, y, z])));
  const c = document.createElement("canvas"); c.width = 120; c.height = 90; const g = c.getContext("2d"); g.fillStyle = "#ccc"; g.fillRect(0, 0, 120, 90);
  return { W, H, hfov, img: c.toDataURL("image/jpeg"), analysis: { scene: "interior", room_type: "soggiorno", camera: { pitch_deg: 0 }, room: { width_m: 4, depth_m: 5, height_m: 2.8 },
    materials: { floor: "piastrelle", wall_color: "#d8e0e8" }, lighting: { time: "evening", lamps_on: true, kelvin: 2700 },
    back_wall: { fl: pr(1, 0, 0), fr: pr(5.2, 0, 0), cl: pr(1, 2.8, 0), cr: pr(5.2, 2.8, 0), ceiling_visible: true },
    items: [
      { category: "finestra", label: "Finestra", box: box(cuboid(2, 3.2, .9, 2.3, 0, 0)), facing: "camera", against: "none", source: "rilevatore" },
      { category: "porta", label: "Porta", box: box(cuboid(1, 1, 0, 2.1, 1, 1.9)), facing: "camera", against: "none", source: "modello" },
      { category: "divano", label: "Divano", box: box(cuboid(2, 4.2, 0, .85, .3, 1.22)), facing: "camera", against: "back", source: "rilevatore" },
      { category: "lampadario", label: "Sospensione", box: box(cuboid(3.05, 3.15, 1.9, 2.8, 2.45, 2.55)), facing: "camera", against: "none", source: "modello" },
      { category: "persona", label: "Donna in piedi", box: box(cuboid(4, 4.5, 0, 1.65, 3, 3.3)), facing: "camera", against: "none", source: "rilevatore" },
      { category: "altro", label: "Quadro", box: [.4, .2, .5, .3], facing: "camera", against: "none", source: "modello" },
    ] } };
};

test("geometria: dagli spigoli della parete di fondo si ritrovano misure, fotocamera e posizioni", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(`(() => { const sc = (${SCENE})();
    Object.assign(F3, { img: sc.img, thumb: sc.img, w: sc.W, h: sc.H, name: "prova.jpg", exifFov: null });
    f3Accept({ analysis: sc.analysis, model: "@cf/meta/llama-4-scout-17b-16e-instruct" }); F3.opts.fov = sc.hfov;
    const s = f3Solve(), lay = f3Layout(s);
    return { ok: s.ok, W: s.W, H: s.H, hc: s.hc, p: s.p * 180 / Math.PI, dcam: s.c[1], cx: s.c[0], D: s.D,
      win: lay.openings.find(o => o.type === "window"), door: lay.openings.find(o => o.type === "door"),
      objs: lay.objects.map(o => ({ cat: o.it.category, ref: o.ref, x: o.x, y: o.y, rot: o.rot })), skipped: lay.skipped.map(i => i.category) }; })()`);
  expect(r.ok).toBe(true);
  expect(r.W).toBeCloseTo(4.2, 1); expect(r.H).toBeCloseTo(2.8, 2); expect(r.hc).toBeCloseTo(1.5, 1);
  expect(r.p).toBeCloseTo(-6, 0); expect(r.dcam).toBeCloseTo(4.6, 0); expect(r.cx).toBeCloseTo(1.6, 0);
  // finestra sulla parete di fondo: centro a 1,6 m dallo spigolo sinistro, 1,2 × 1,4 m, davanzale 0,9 m
  expect(r.win.wall).toBe("back"); expect(Math.abs(r.win.t - 1.6)).toBeLessThan(.12); expect(Math.abs(r.win.w - 1.2)).toBeLessThan(.12);
  expect(Math.abs(r.win.sill - .9)).toBeLessThan(.12); expect(Math.abs(r.win.h - 1.4)).toBeLessThan(.15);
  // porta sulla parete sinistra, 0,9 m, a 1,45 m dalla parete di fondo
  expect(r.door.wall).toBe("left"); expect(Math.abs(r.door.w - .9)).toBeLessThan(.15); expect(Math.abs(r.D - r.door.t - 1.45)).toBeLessThan(.15);
  const sofa = r.objs.find(o => o.cat === "divano"), lamp = r.objs.find(o => o.cat === "lampadario"), pers = r.objs.find(o => o.cat === "persona");
  expect(Math.abs(sofa.x - 2.1)).toBeLessThan(.3); expect(sofa.y).toBeLessThan(.6); expect(sofa.rot).toBe(0);           // contro la parete di fondo, rivolto verso la stanza
  expect(Math.abs(lamp.x - 2.1)).toBeLessThan(.15); expect(Math.abs(lamp.y - 2.5)).toBeLessThan(.2);                      // sotto il punto di attacco al soffitto
  expect(pers.ref).toBe("sagoma_donna"); expect(Math.abs(pers.x - 3.25)).toBeLessThan(.35); expect(Math.abs(pers.y - 3.15)).toBeLessThan(.45);
  expect(r.skipped).toEqual([]);                                    // «altro» parte già escluso
  expect(errors).toEqual([]);
});

test("creazione: stanza, aperture, oggetti, materiali, luci e camera «Vista della foto» (la foto non va nel link per il cliente)", async ({ page }) => {
  const errors = await open(page);
  const before = await page.evaluate(() => ({ walls: P.walls.length, rooms: P.rooms.length, ops: P.openings.length, objs: P.objects.length, cams: (P.cameras || []).length }));
  const r = await page.evaluate(`(() => { const sc = (${SCENE})();
    Object.assign(F3, { img: sc.img, thumb: sc.img, w: sc.W, h: sc.H, name: "prova.jpg" }); f3Accept({ analysis: sc.analysis }); F3.opts.fov = sc.hfov; F3.opts.depth = 5.2;
    f3Build(); const room = P.rooms[P.rooms.length - 1], cam = P.cameras[P.cameras.length - 1];
    const xs = room.pts.map(p => p[0]), ys = room.pts.map(p => p[1]);
    return { W: Math.max(...xs) - Math.min(...xs), D: Math.max(...ys) - Math.min(...ys), mat: room.mat, name: room.name,
      walls: P.walls.length, ops: P.openings.length, objs: P.objects.length, cams: P.cameras.length, cam: { name: cam.name, fov: cam.fov, photo: !!cam.photo, y: cam.pos[1] },
      wallMat: P.materials[P.walls[P.walls.length - 1].mat]?.color, lights: P.objects.filter(o => o.ref === "sospensione").map(o => o.light), mode: P.lightsMode,
      share: sharePayload().cameras.some(c => c.photo), sel: S.sel?.type }; })()`);
  expect(r.W).toBeCloseTo(4.2, 1); expect(r.D).toBeCloseTo(5.2, 2); expect(r.mat).toBe("gres"); expect(r.name).toBe("Soggiorno");
  expect(r.walls - before.walls).toBe(4); expect(r.ops - before.ops).toBe(2); expect(r.objs - before.objs).toBe(3); expect(r.cams - before.cams).toBe(1);
  expect(r.cam).toMatchObject({ name: "Vista della foto", photo: true }); expect(r.cam.fov).toBeCloseTo(46.8, 0); expect(r.cam.y).toBeCloseTo(1.5, 1);
  expect(r.wallMat).toBe("#d8e0e8"); expect(r.lights[0]).toMatchObject({ on: true, k: 2700 }); expect(r.mode).toBe("on");
  expect(r.share).toBe(false);
  await expect(page.locator(".a3rep")).toContainText("Creati la stanza");
  // la foto si sovrappone alla vista 3D dalla sua camera; annulla rimuove tutto in un passo
  await page.evaluate(() => { S.tab = "props"; renderTabs(); setSel([]); renderInspector(); });
  await page.click('[data-camphoto]'); await expect(page.locator("#photoOv img")).toBeVisible();
  await page.click('[data-camphoto]'); await expect(page.locator("#photoOv")).toHaveCount(0);
  await page.evaluate(() => undo());
  expect(await page.evaluate(() => ({ walls: P.walls.length, objs: P.objects.length, cams: P.cameras.length }))).toEqual({ walls: before.walls, objs: before.objs, cams: before.cams });
  expect(errors).toEqual([]);
});

test("pannello: foto, consenso, analisi con il server di prova, spigoli trascinabili, categoria corretta, creazione", async ({ page }) => {
  const errors = await open(page);
  await page.click('[data-tab="import"]');
  await expect(page.locator("#f3Box")).toContainText("Da foto al 3D");
  const jpg = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 1024; c.height = 768; const g = c.getContext("2d"); g.fillStyle = "#e9e4da"; g.fillRect(0, 0, 1024, 768); g.fillStyle = "#8a6a4a"; g.fillRect(0, 600, 1024, 168); return c.toDataURL("image/jpeg", .8).split(",")[1]; });
  await page.setInputFiles("#fF3", { name: "soggiorno.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") });
  await expect(page.locator(".f3thumb")).toContainText("soggiorno.jpg");
  await page.evaluate(() => { try { localStorage.removeItem("pianta-libera-foto-consenso"); } catch(e){} f3Consent = false; });
  await page.click("#f3Go"); await expect(page.locator("#f3Box [role=alert]")).toContainText("consenso");
  await page.check("#f3Consent"); await page.click("#f3Go");
  await expect(page.locator("#f3Svg")).toBeVisible();
  await expect(page.locator(".f3sum")).toContainText("Stanza");
  expect(await page.locator(".f3row").count()).toBe(4);
  // trascinare lo spigolo in basso a sinistra cambia le misure
  const s0 = await page.locator(".f3sum").textContent();
  const h = page.locator('[data-f3h="fl"] circle.hit'); const bb = await h.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 - 12, bb.y + bb.height / 2 + 5, { steps: 6 }); await page.mouse.up();
  await expect(page.locator(".f3sum")).not.toHaveText(s0);
  // il divano diventa una poltrona; la lampada non va creata
  await page.selectOption('[data-f3cat="2"]', "poltrona"); await page.uncheck('[data-f3on="3"]');
  await page.fill("#f3RefVal", "3"); await page.locator("#f3RefVal").dispatchEvent("change");
  await expect(page.locator(".f3sum")).toContainText("altezza 3,00 m");
  const n0 = await page.evaluate(() => P.objects.length);
  await page.click("#f3Build");
  await expect(page.locator(".a3rep")).toContainText("1 oggetto");
  expect(await page.evaluate(() => P.objects.slice(-1)[0].ref)).toBe("poltrona");
  expect(await page.evaluate(() => P.objects.length)).toBe(n0 + 1);
  await expect(page.locator("#camSel")).toContainText("Vista della foto");
  expect(errors).toEqual([]);
});

test("segmentazione nel dispositivo: spigoli proposti, porta e portafinestra sullo stesso vano diventano una sola apertura", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    // maschere sintetiche 400×300: parete di fondo 120–300, una porta (150–185), una finestra (240–285)
    const W = 400, H = 300, names = ["wall", "floor", "ceiling", "door", "windowpane"], lab = new Uint8Array(W * H);
    const cY = x => x < 120 ? 60 - (120 - x) * .35 : x > 300 ? 70 - (x - 300) * .4 : 60 + (x - 120) * 10 / 180, fY = x => x < 120 ? 220 + (120 - x) * .5 : x > 300 ? 230 + (x - 300) * .55 : 220 + (x - 120) * 10 / 180;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lab[y * W + x] = y < cY(x) ? 2 : y >= fY(x) ? 1 : (x >= 150 && x < 185 && y >= 100) ? 3 : (x >= 240 && x < 285 && y >= 110 && y < 180) ? 4 : 0;
    const segs = names.map((label, k) => ({ label, mask: { width: W, height: H, data: Uint8Array.from(lab, v => v === k ? 255 : 0) } }));
    const m = labelMap(segs, 320), c = document.createElement("canvas"); c.width = 40; c.height = 30;
    Object.assign(F3, { img: c.toDataURL("image/jpeg"), thumb: null, w: 1200, h: 900, name: "prova.jpg", exifFov: null });
    F3.seg = { state: "ok", img: F3.img, m, quad: wallCorners(m) };
    f3Accept({ analysis: { scene: "interior", room_type: "soggiorno", camera: {}, room: { height_m: 2.7 }, materials: {}, lighting: {}, back_wall: null, items: [
      { category: "portafinestra", label: "Portafinestra", box: [.36, .3, .5, .75], source: "modello", facing: "camera", against: "none" },
      { category: "porta", label: "Porta", box: [.34, .35, .47, .74], source: "modello", facing: "camera", against: "none" },
      { category: "tappeto", label: "Tappeto", box: [.1, .85, .3, 1], source: "modello", facing: "camera", against: "none" } ] } });
    F3.opts.fov = 60;
    const s = f3Solve(), lay = f3Layout(s);
    return { src: F3.quadSource, fl: F3.quad.fl, cr: F3.quad.cr, on: F3.items.filter(i => i.on).map(i => i.category).sort(), off: F3.items.filter(i => !i.on).map(i => i.category).sort(),
      ops: lay.openings.map(o => o.type + ":" + o.wall).sort(), note: F3.segNote };
  });
  expect(r.src).toContain("segmentazione");
  expect(r.fl[0]).toBeCloseTo(.3, 1); expect(r.cr[0]).toBeCloseTo(.75, 1);
  expect(r.on).toEqual(["finestra", "porta"].concat(r.on.includes("portafinestra") ? ["portafinestra"] : []).sort());
  expect(r.ops).toEqual(["door:back", "window:back"]);
  expect(r.off).toContain("tappeto");
  expect(r.note).toContain("aperture");
  expect(errors).toEqual([]);
});

test("aperture sovrapposte sullo stesso muro: la seconda si sposta o non viene creata", async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 40; c.height = 30;
    Object.assign(F3, { img: c.toDataURL("image/jpeg"), w: 1200, h: 900, seg: null });
    f3Accept({ analysis: { scene: "interior", camera: {}, room: { height_m: 2.7 }, materials: {}, lighting: {}, back_wall: { fl: [.2, .78], fr: [.8, .78], cl: [.2, .16], cr: [.8, .16], ceiling_visible: true }, items: [
      { category: "porta", box: [.4, .3, .5, .78], source: "modello" }, { category: "portafinestra", box: [.41, .28, .52, .78], source: "modello" }, { category: "finestra", box: [.62, .3, .72, .55], source: "modello" } ] } });
    F3.items.forEach(i => i.on = true); F3.opts.fov = 60;
    const lay = f3Layout(f3Solve()), back = lay.openings.filter(o => o.wall === "back").sort((a, b) => a.t - b.t);
    const overlap = back.some((o, i) => i && back[i - 1].t + back[i - 1].w / 2 > o.t - o.w / 2);
    return { n: back.length, overlap, skipped: lay.skipped.map(i => i.category) };
  });
  expect(r.overlap).toBe(false); expect(r.n).toBe(2); expect(r.skipped.length).toBe(1);
});

test("analisi solo nel dispositivo: senza invio né consenso, colori dalla foto e bozza pronta da rivedere", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(async () => {
    // foto sintetica: soffitto bianco, pareti verde salvia, pavimento in legno; segmentazione già pronta
    const W = 400, H = 300, names = ["wall", "floor", "ceiling", "windowpane"], lab = new Uint8Array(W * H);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y < 60 ? 2 : y >= 225 ? 1 : (x >= 240 && x < 285 && y >= 110 && y < 180) ? 3 : 0; lab[y * W + x] = k; }
    g.fillStyle = "#f2f2ee"; g.fillRect(0, 0, W, 60); g.fillStyle = "#9cae8f"; g.fillRect(0, 60, W, 165); g.fillStyle = "#8a5a33"; g.fillRect(0, 225, W, 75); g.fillStyle = "#cfe6f5"; g.fillRect(240, 110, 45, 70);
    const segs = names.map((label, k) => ({ label, mask: { width: W, height: H, data: Uint8Array.from(lab, v => v === k ? 255 : 0) } })), m = labelMap(segs, 320);
    Object.assign(F3, { img: c.toDataURL("image/png"), thumb: null, w: 1200, h: 900, name: "locale.png", exifFov: 65, a: null });
    F3.seg = { state: "ok", img: F3.img, m, quad: wallCorners(m), alts: [] };
    await f3AnalyzeLocal();
    return { model: F3.meta?.model, mat: F3.a?.materials, items: F3.items.map(i => i.category), open: !!document.querySelector("#f3Modal") };
  });
  expect(r.model).toBe("nel dispositivo");
  expect(r.mat.floor).toBe("parquet");
  expect(r.mat.wall_color.toLowerCase()).toBe("#9cae8f");
  expect(r.items).toContain("finestra");
  expect(errors).toEqual([]);
});
