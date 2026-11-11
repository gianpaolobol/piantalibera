// Scansione AR di una stanza con ARKit, per Pianta Libera.
// Funziona su ogni iPhone/iPad con ARKit (anche senza LiDAR): posizione della fotocamera in metri per ogni
// fotogramma chiave, intrinseci, punti 3D sparsi e piani classificati (pavimento, parete, soffitto, porta,
// finestra, tavolo, sedile). Con il LiDAR aggiunge la profondità di ogni fotogramma e la superficie 3D
// classificata della stanza. Tutto finisce in un file zip (formato in docs/scansione-ar.md).
import ExpoModulesCore
import ARKit
import SceneKit
import CoreImage
import ImageIO
import UIKit

public final class PiantaArModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PiantaAr")

    Function("isSupported") { () -> Bool in
      ARWorldTrackingConfiguration.isSupported
    }

    AsyncFunction("scan") { (promise: Promise) in
      guard ARWorldTrackingConfiguration.isSupported else {
        promise.reject("E_AR_UNSUPPORTED", "ARKit non è disponibile su questo dispositivo.")
        return
      }
      guard let top = PiantaArModule.topViewController() else {
        promise.reject("E_AR_NO_VIEW", "Impossibile aprire la scansione.")
        return
      }
      let vc = ArScanViewController { result in
        switch result {
        case .success(let value): promise.resolve(value)
        case .failure(let error): promise.reject("E_AR_SCAN", error.localizedDescription)
        }
      }
      vc.modalPresentationStyle = .fullScreen
      top.present(vc, animated: true)
    }.runOnQueue(.main)
  }

  static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    var vc = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
    while let presented = vc?.presentedViewController { vc = presented }
    return vc
  }
}

struct ArScanError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

final class ArScanViewController: UIViewController, ARSessionDelegate, ARSCNViewDelegate {
  private let completion: (Result<[String: Any], Error>) -> Void
  private var called = false
  private var finished = false

  private let sceneView = ARSCNView(frame: .zero)
  private let statusLabel = UILabel()
  private let countLabel = UILabel()
  private let cancelButton = UIButton(type: .system)
  private let shotButton = UIButton(type: .system)
  private let doneButton = UIButton(type: .system)

  private let ciContext = CIContext()
  private let io = DispatchQueue(label: "it.piantalibera.ar.io")
  private var dir: URL!
  private var stamp = ""

  private var frames: [[String: Any]] = []
  private var points: [[Float]] = []
  private var lastPose: simd_float4x4?
  private var lastTime: TimeInterval = 0
  private var lastLabel: TimeInterval = 0
  private var pending = 0
  private var forceNext = false
  private var lidar = false
  private var meshOn = false
  private let maxFrames = 90
  private let maxSide: CGFloat = 1920

  init(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) non usato") }

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
  override var prefersStatusBarHidden: Bool { true }

  // MARK: interfaccia

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.dateFormat = "yyyyMMdd-HHmmss"
    stamp = fmt.string(from: Date())
    do {
      let docs = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      dir = docs.appendingPathComponent("scansioni-ar/\(stamp)", isDirectory: true)
      try FileManager.default.createDirectory(at: dir.appendingPathComponent("frames"), withIntermediateDirectories: true)
      try FileManager.default.createDirectory(at: dir.appendingPathComponent("depth"), withIntermediateDirectories: true)
    } catch {
      finish(.failure(ArScanError(message: "Impossibile creare la cartella della scansione: \(error.localizedDescription)")))
      return
    }

    sceneView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(sceneView)

    for label in [statusLabel, countLabel] {
      label.translatesAutoresizingMaskIntoConstraints = false
      label.numberOfLines = 0
      label.textAlignment = .center
      label.textColor = .white
      label.backgroundColor = UIColor.black.withAlphaComponent(0.55)
      label.layer.cornerRadius = 8
      label.layer.masksToBounds = true
      view.addSubview(label)
    }
    statusLabel.font = .systemFont(ofSize: 16, weight: .semibold)
    countLabel.font = .systemFont(ofSize: 14, weight: .regular)
    statusLabel.text = "Avvio della fotocamera…"
    countLabel.text = " "

    style(cancelButton, title: "Annulla", color: UIColor(white: 0.25, alpha: 0.9))
    style(shotButton, title: "Scatta", color: UIColor(red: 0.16, green: 0.36, blue: 0.62, alpha: 0.95))
    style(doneButton, title: "Fine", color: UIColor(red: 0.12, green: 0.44, blue: 0.38, alpha: 0.95))
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    shotButton.addTarget(self, action: #selector(shotTapped), for: .touchUpInside)
    doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    let row = UIStackView(arrangedSubviews: [cancelButton, shotButton, doneButton])
    row.translatesAutoresizingMaskIntoConstraints = false
    row.axis = .horizontal
    row.spacing = 12
    row.distribution = .fillEqually
    view.addSubview(row)

    let g = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      sceneView.topAnchor.constraint(equalTo: view.topAnchor),
      sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      statusLabel.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
      statusLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
      statusLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
      statusLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      countLabel.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
      countLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
      countLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
      countLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
      row.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
      row.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
      row.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
      row.heightAnchor.constraint(equalToConstant: 52),
    ])

    sceneView.delegate = self
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = true
    sceneView.debugOptions = [ARSCNDebugOptions.showFeaturePoints]
  }

  private func style(_ b: UIButton, title: String, color: UIColor) {
    b.setTitle(title, for: .normal)
    b.setTitleColor(.white, for: .normal)
    b.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    b.backgroundColor = color
    b.layer.cornerRadius = 10
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    guard dir != nil else { return }
    let cfg = ARWorldTrackingConfiguration()
    cfg.planeDetection = [.horizontal, .vertical]
    cfg.worldAlignment = .gravity
    if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
      cfg.frameSemantics.insert(.sceneDepth)
      lidar = true
    }
    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
      cfg.sceneReconstruction = .meshWithClassification
      meshOn = true
    }
    sceneView.session.run(cfg, options: [.resetTracking, .removeExistingAnchors])
    UIApplication.shared.isIdleTimerDisabled = true
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
    UIApplication.shared.isIdleTimerDisabled = false
  }

  @objc private func cancelTapped() {
    guard !finished else { return }
    finished = true
    sceneView.session.pause()
    let d = dir
    io.async { if let d { try? FileManager.default.removeItem(at: d) } }
    finish(.success(["cancelled": true]))
  }

  @objc private func shotTapped() { forceNext = true }

  @objc private func doneTapped() {
    guard !finished else { return }
    guard !frames.isEmpty else {
      statusLabel.text = "Nessun fotogramma ancora: muovi lentamente il telefono per la stanza."
      return
    }
    finished = true
    [cancelButton, shotButton, doneButton].forEach { $0.isEnabled = false }
    statusLabel.text = "Salvataggio della scansione…"
    let frame = sceneView.session.currentFrame
    sceneView.session.pause()
    // la coda io è seriale: questo blocco parte dopo l'ultima immagine in scrittura
    io.async { [weak self] in
      guard let self else { return }
      do {
        let result = try self.writeAll(frame)
        DispatchQueue.main.async { self.finish(.success(result)) }
      } catch {
        DispatchQueue.main.async { self.finish(.failure(error)) }
      }
    }
  }

  private func finish(_ result: Result<[String: Any], Error>) {
    guard !called else { return }
    called = true
    let done = completion
    if presentingViewController != nil {
      dismiss(animated: true) { done(result) }
    } else {
      done(result)
    }
  }

  // MARK: sessione

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    if finished { return }
    if frame.timestamp - lastLabel > 0.3 {
      lastLabel = frame.timestamp
      updateLabels(frame)
    }
    guard case .normal = frame.camera.trackingState, frames.count < maxFrames, pending < 2 else { return }
    let pose = frame.camera.transform
    if !forceNext, let last = lastPose {
      let dt = frame.timestamp - lastTime
      let moved = simd_distance(pose.columns.3, last.columns.3)
      let turned = ArScanViewController.angle(last, pose)
      guard dt > 0.5, moved > 0.25 || turned > 0.30 else { return }
    }
    let manual = forceNext
    forceNext = false
    capture(frame, manual: manual)
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    statusLabel.text = "ARKit: \(error.localizedDescription)"
  }

  private func updateLabels(_ frame: ARFrame) {
    switch frame.camera.trackingState {
    case .notAvailable:
      statusLabel.text = "Tracciamento non disponibile"
    case .limited(let reason):
      switch reason {
      case .initializing: statusLabel.text = "Muovi lentamente il telefono per iniziare"
      case .excessiveMotion: statusLabel.text = "Più piano: movimento troppo veloce"
      case .insufficientFeatures: statusLabel.text = "Poco dettaglio: inquadra bordi, mobili e spigoli"
      case .relocalizing: statusLabel.text = "Riposizionamento…"
      @unknown default: statusLabel.text = "Tracciamento limitato"
      }
    case .normal:
      statusLabel.text = frames.count >= maxFrames
        ? "Fotogrammi al completo: premi Fine"
        : "Gira lentamente per la stanza: pareti, porte, finestre, pavimento e soffitto"
    }
    var c: [String: Int] = [:]
    for a in frame.anchors {
      if let p = a as? ARPlaneAnchor { c[ArScanViewController.kind(p), default: 0] += 1 }
    }
    let lidarText = lidar ? " · LiDAR" : ""
    countLabel.text = "Fotogrammi \(frames.count)/\(maxFrames) · pareti \(c["wall"] ?? 0) · porte \(c["door"] ?? 0) · finestre \(c["window"] ?? 0) · pavimento \(c["floor"] ?? 0)\(lidarText)"
  }

  private func capture(_ frame: ARFrame, manual: Bool) {
    let index = frames.count + 1
    lastPose = frame.camera.transform
    lastTime = frame.timestamp
    let res = frame.camera.imageResolution
    let scale = min(1.0, maxSide / max(res.width, res.height))
    let w = Int((res.width * scale).rounded()), h = Int((res.height * scale).rounded())
    let k = frame.camera.intrinsics
    let s = Float(scale)
    let name = String(format: "frames/%03d.jpg", index)
    var rec: [String: Any] = [
      "file": name,
      "t": frame.timestamp,
      "width": w, "height": h,
      "fx": k[0][0] * s, "fy": k[1][1] * s, "cx": k[2][0] * s, "cy": k[2][1] * s,
      "transform": ArScanViewController.flat(frame.camera.transform),
      "manual": manual,
      "exposure": frame.camera.exposureDuration,
    ]
    if let light = frame.lightEstimate {
      rec["ambientIntensity"] = Double(light.ambientIntensity)
      rec["colorTemperature"] = Double(light.ambientColorTemperature)
    }
    if let pts = frame.rawFeaturePoints?.points, !pts.isEmpty {
      let step = max(1, pts.count / 300)
      var i = 0
      while i < pts.count {
        let p = pts[i]
        points.append([ArScanViewController.mm(p.x), ArScanViewController.mm(p.y), ArScanViewController.mm(p.z), Float(index)])
        i += step
      }
    }
    var depthData: Data?
    var confData: Data?
    if let sd = frame.sceneDepth {
      depthData = ArScanViewController.copy(sd.depthMap)
      if let cm = sd.confidenceMap { confData = ArScanViewController.copy(cm) }
      rec["depth"] = String(format: "depth/%03d.f32", index)
      rec["depthWidth"] = CVPixelBufferGetWidth(sd.depthMap)
      rec["depthHeight"] = CVPixelBufferGetHeight(sd.depthMap)
      if confData != nil { rec["confidence"] = String(format: "depth/%03d.conf", index) }
    }
    frames.append(rec)

    pending += 1
    let image = CIImage(cvPixelBuffer: frame.capturedImage).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let folder = dir!
    let depthOut = depthData, confOut = confData
    io.async { [weak self] in
      guard let self else { return }
      let opts: [CIImageRepresentationOption: Any] = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.85]
      if let cs = CGColorSpace(name: CGColorSpace.sRGB),
         let jpg = self.ciContext.jpegRepresentation(of: image, colorSpace: cs, options: opts) {
        try? jpg.write(to: folder.appendingPathComponent(name))
      }
      if let depthOut { try? depthOut.write(to: folder.appendingPathComponent(String(format: "depth/%03d.f32", index))) }
      if let confOut { try? confOut.write(to: folder.appendingPathComponent(String(format: "depth/%03d.conf", index))) }
      DispatchQueue.main.async { self.pending -= 1 }
    }
  }

  // MARK: piani visibili durante la scansione

  func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
    guard let plane = anchor as? ARPlaneAnchor, let device = sceneView.device,
          let geometry = ARSCNPlaneGeometry(device: device) else { return nil }
    geometry.update(from: plane.geometry)
    geometry.firstMaterial?.diffuse.contents = ArScanViewController.color(plane)
    geometry.firstMaterial?.isDoubleSided = true
    return SCNNode(geometry: geometry)
  }

  func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
    guard let plane = anchor as? ARPlaneAnchor, let geometry = node.geometry as? ARSCNPlaneGeometry else { return }
    geometry.update(from: plane.geometry)
    geometry.firstMaterial?.diffuse.contents = ArScanViewController.color(plane)
  }

  // MARK: salvataggio

  private func writeAll(_ frame: ARFrame?) throws -> [String: Any] {
    var planes: [[String: Any]] = []
    var counts: [String: Int] = [:]
    var meshes: [ARMeshAnchor] = []
    for anchor in frame?.anchors ?? [] {
      if let p = anchor as? ARPlaneAnchor {
        let kind = ArScanViewController.kind(p)
        counts[kind, default: 0] += 1
        var rec: [String: Any] = [
          "id": p.identifier.uuidString,
          "alignment": p.alignment == .vertical ? "vertical" : "horizontal",
          "class": kind,
          "transform": ArScanViewController.flat(p.transform),
          "center": [p.center.x, p.center.y, p.center.z].map(ArScanViewController.mm),
          "boundary": p.geometry.boundaryVertices.map { [ArScanViewController.mm($0.x), ArScanViewController.mm($0.y), ArScanViewController.mm($0.z)] },
        ]
        if #available(iOS 16.0, *) {
          rec["extent"] = [ArScanViewController.mm(p.planeExtent.width), ArScanViewController.mm(p.planeExtent.height)]
          rec["rotationY"] = p.planeExtent.rotationOnYAxis
        } else {
          rec["extent"] = [ArScanViewController.mm(p.extent.x), ArScanViewController.mm(p.extent.z)]
          rec["rotationY"] = 0
        }
        planes.append(rec)
      } else if let m = anchor as? ARMeshAnchor {
        meshes.append(m)
      }
    }
    var meshFile: String?
    var meshFaces = 0
    if !meshes.isEmpty {
      meshFaces = try ArScanViewController.writePLY(meshes, to: dir.appendingPathComponent("mesh.ply"))
      meshFile = "mesh.ply"
    }

    var info = utsname()
    uname(&info)
    let model = withUnsafeBytes(of: &info.machine) { raw in String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self) }
    var capture: [String: Any] = [
      "format": "pianta-libera-scansione-ar",
      "version": 1,
      "createdAt": ISO8601DateFormatter().string(from: Date()),
      "device": model,
      "system": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
      "app": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
      "lidar": lidar,
      "coordinates": "metri; mondo ARKit allineato alla gravità (y in alto); matrici 4x4 per colonne; immagini nell'orientamento del sensore (orizzontale)",
      "planeClassification": ARPlaneAnchor.isClassificationSupported,
      "frames": frames,
      "planes": planes,
      "points": points,
    ]
    if let meshFile {
      capture["mesh"] = meshFile
      capture["meshFaces"] = meshFaces
    }
    let json = try JSONSerialization.data(withJSONObject: capture, options: [])
    try json.write(to: dir.appendingPathComponent("capture.json"))

    var files: [(String, URL)] = [("capture.json", dir.appendingPathComponent("capture.json"))]
    for f in frames {
      if let name = f["file"] as? String { files.append((name, dir.appendingPathComponent(name))) }
      if let name = f["depth"] as? String { files.append((name, dir.appendingPathComponent(name))) }
      if let name = f["confidence"] as? String { files.append((name, dir.appendingPathComponent(name))) }
    }
    if let meshFile { files.append((meshFile, dir.appendingPathComponent(meshFile))) }
    files = files.filter { FileManager.default.fileExists(atPath: $0.1.path) }

    let zip = dir.deletingLastPathComponent().appendingPathComponent("scansione-\(stamp).zip")
    try ZipWriter.write(files: files.map { ("scansione-\(stamp)/\($0.0)", $0.1) }, to: zip)
    try? FileManager.default.removeItem(at: dir)

    return [
      "cancelled": false,
      "zip": zip.absoluteString,
      "frames": frames.count,
      "planes": planes.count,
      "walls": counts["wall"] ?? 0,
      "doors": counts["door"] ?? 0,
      "windows": counts["window"] ?? 0,
      "lidar": lidar,
    ]
  }

  // MARK: utilità

  static func kind(_ p: ARPlaneAnchor) -> String {
    guard ARPlaneAnchor.isClassificationSupported else { return "none" }
    switch p.classification {
    case .wall: return "wall"
    case .floor: return "floor"
    case .ceiling: return "ceiling"
    case .table: return "table"
    case .seat: return "seat"
    case .door: return "door"
    case .window: return "window"
    default: return "none"
    }
  }

  static func color(_ p: ARPlaneAnchor) -> UIColor {
    switch kind(p) {
    case "wall": return UIColor.systemBlue.withAlphaComponent(0.30)
    case "floor": return UIColor.systemGreen.withAlphaComponent(0.30)
    case "ceiling": return UIColor.systemGray.withAlphaComponent(0.30)
    case "door": return UIColor.systemOrange.withAlphaComponent(0.55)
    case "window": return UIColor.systemTeal.withAlphaComponent(0.55)
    case "table", "seat": return UIColor.systemPurple.withAlphaComponent(0.40)
    default: return UIColor.white.withAlphaComponent(0.20)
    }
  }

  static func angle(_ a: simd_float4x4, _ b: simd_float4x4) -> Float {
    let fa = simd_normalize(simd_make_float3(-a.columns.2)), fb = simd_normalize(simd_make_float3(-b.columns.2))
    return acos(max(-1, min(1, simd_dot(fa, fb))))
  }

  static func flat(_ m: simd_float4x4) -> [Float] {
    [m.columns.0, m.columns.1, m.columns.2, m.columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] }.map { ($0 * 1e5).rounded() / 1e5 }
  }

  static func mm(_ v: Float) -> Float { (v * 1000).rounded() / 1000 }

  // copia righe compatte di un CVPixelBuffer (profondità Float32 o confidenza UInt8)
  static func copy(_ buffer: CVPixelBuffer) -> Data? {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer), stride = CVPixelBufferGetBytesPerRow(buffer)
    let bpp: Int
    switch CVPixelBufferGetPixelFormatType(buffer) {
    case kCVPixelFormatType_DepthFloat32: bpp = 4
    case kCVPixelFormatType_OneComponent8: bpp = 1
    default: bpp = stride / max(1, w)
    }
    var out = Data(capacity: w * h * bpp)
    for y in 0..<h { out.append(base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self), count: w * bpp) }
    return out
  }

  // superficie 3D del LiDAR in PLY binario: vertici nel mondo, facce con la classe ARKit (0 nessuna, 1 parete, 2 pavimento, 3 soffitto, 4 tavolo, 5 sedile, 6 finestra, 7 porta)
  static func writePLY(_ meshes: [ARMeshAnchor], to url: URL) throws -> Int {
    var nv = 0, nf = 0
    for m in meshes { nv += m.geometry.vertices.count; nf += m.geometry.faces.count }
    var body = Data(capacity: nv * 12 + nf * 14)
    var base: Int32 = 0
    for m in meshes {
      let g = m.geometry, t = m.transform
      let vs = g.vertices
      let vptr = vs.buffer.contents()
      for i in 0..<vs.count {
        let p = vptr.advanced(by: vs.offset + vs.stride * i).assumingMemoryBound(to: Float.self)
        let w = t * simd_float4(p[0], p[1], p[2], 1)
        var xyz = [w.x, w.y, w.z]
        body.append(Data(bytes: &xyz, count: 12))
      }
      let fs = g.faces
      let fptr = fs.buffer.contents()
      let cls = g.classification
      for f in 0..<fs.count {
        var rec = Data([3])
        for j in 0..<3 {
          let at = fptr.advanced(by: (f * 3 + j) * fs.bytesPerIndex)
          let idx: Int32 = fs.bytesPerIndex == 2 ? Int32(at.assumingMemoryBound(to: UInt16.self).pointee) : Int32(at.assumingMemoryBound(to: UInt32.self).pointee)
          var v = (idx + base).littleEndian
          rec.append(Data(bytes: &v, count: 4))
        }
        var label: UInt8 = 0
        if let cls {
          label = cls.buffer.contents().advanced(by: cls.offset + cls.stride * f).assumingMemoryBound(to: UInt8.self).pointee
        }
        rec.append(label)
        body.append(rec)
      }
      base += Int32(vs.count)
    }
    let header = "ply\nformat binary_little_endian 1.0\ncomment Pianta Libera scansione AR (LiDAR)\nelement vertex \(nv)\nproperty float x\nproperty float y\nproperty float z\nelement face \(nf)\nproperty list uchar int vertex_indices\nproperty uchar label\nend_header\n"
    var out = Data(header.utf8)
    out.append(body)
    try out.write(to: url)
    return nf
  }
}

// ZIP senza compressione (le immagini sono già JPEG): nessuna libreria esterna.
enum ZipWriter {
  static let table: [UInt32] = (0..<256).map { i -> UInt32 in
    var c = UInt32(i)
    for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
    return c
  }

  static func crc32(_ data: Data) -> UInt32 {
    var c: UInt32 = 0xFFFF_FFFF
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      for b in raw { c = table[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
    }
    return c ^ 0xFFFF_FFFF
  }

  static func write(files: [(String, URL)], to out: URL) throws {
    try? FileManager.default.removeItem(at: out)
    guard FileManager.default.createFile(atPath: out.path, contents: nil) else { throw ArScanError(message: "Impossibile creare il file zip.") }
    let handle = try FileHandle(forWritingTo: out)
    defer { try? handle.close() }
    let comps = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day, .hour, .minute, .second], from: Date())
    let dosTime = UInt16((comps.hour ?? 0) << 11 | (comps.minute ?? 0) << 5 | (comps.second ?? 0) / 2)
    let dosDate = UInt16(max(0, (comps.year ?? 1980) - 1980) << 9 | (comps.month ?? 1) << 5 | (comps.day ?? 1))
    var central = Data()
    var offset: UInt32 = 0
    for (name, url) in files {
      let data = try Data(contentsOf: url)
      let crc = crc32(data), size = UInt32(data.count), n = Data(name.utf8)
      var local = Data()
      local.le32(0x0403_4B50); local.le16(20); local.le16(0x0800); local.le16(0); local.le16(dosTime); local.le16(dosDate)
      local.le32(crc); local.le32(size); local.le32(size); local.le16(UInt16(n.count)); local.le16(0); local.append(n)
      handle.write(local)
      handle.write(data)
      var entry = Data()
      entry.le32(0x0201_4B50); entry.le16(20); entry.le16(20); entry.le16(0x0800); entry.le16(0); entry.le16(dosTime); entry.le16(dosDate)
      entry.le32(crc); entry.le32(size); entry.le32(size); entry.le16(UInt16(n.count)); entry.le16(0); entry.le16(0); entry.le16(0); entry.le16(0)
      entry.le32(0); entry.le32(offset); entry.append(n)
      central.append(entry)
      offset += UInt32(local.count) + size
    }
    var end = Data()
    end.le32(0x0605_4B50); end.le16(0); end.le16(0); end.le16(UInt16(files.count)); end.le16(UInt16(files.count))
    end.le32(UInt32(central.count)); end.le32(offset); end.le16(0)
    handle.write(central)
    handle.write(end)
  }
}

extension Data {
  mutating func le16(_ v: UInt16) { var x = v.littleEndian; Swift.withUnsafeBytes(of: &x) { append(contentsOf: $0) } }
  mutating func le32(_ v: UInt32) { var x = v.littleEndian; Swift.withUnsafeBytes(of: &x) { append(contentsOf: $0) } }
}
