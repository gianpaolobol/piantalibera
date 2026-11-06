<?php
/**
 * Pianta Libera — backend PHP del contratto /api/render (per hosting condivisi, es. InfinityFree)
 *
 *   POST render.php            crea un lavoro      (corpo: vedi docs/api-render-contract.md)
 *   GET  render.php?id=<id>    stato e risultato
 *   GET  render.php?id=<id>&img=<n>  immagine n del risultato
 *   DELETE render.php?id=<id>  cancella il lavoro e i file
 *
 * Non è un proxy aperto: accetta solo il contratto del progetto, chiama UN solo
 * fornitore configurato lato server, applica quote per IP, tetto globale giornaliero,
 * kill switch, limiti di dimensione, Turnstile facoltativo e cancellazione dei file.
 *
 * Configurazione: copia config.example.php in config.php (escluso da git) oppure
 * imposta le variabili d'ambiente indicate lì. Le chiavi non vanno mai nel client.
 *
 * Su hosting senza processi in background la chiamata al fornitore è sincrona:
 * il POST risponde quando il fornitore ha finito (entro PL_PROVIDER_TIMEOUT) con
 * status "succeeded" o "failed". Il client gestisce sia questo caso sia i lavori asincroni.
 */
declare(strict_types=1);

$cfgFile = __DIR__ . '/config.php';
$C = file_exists($cfgFile) ? require $cfgFile : require __DIR__ . '/config.example.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(int $status, array $body, array $headers = []): void { http_response_code($status); foreach ($headers as $k => $v) header("$k: $v"); echo json_encode($body, JSON_UNESCAPED_SLASHES); exit; }
function fail(int $status, string $code, string $msg, array $h = []): void { out($status, ['error' => ['code' => $code, 'message' => $msg]], $h); }

// --- stessa origine: niente chiamate da siti terzi tramite browser
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
  $allowed = $C['allowed_origins'] ?: ['https://' . ($_SERVER['HTTP_HOST'] ?? ''), 'http://' . ($_SERVER['HTTP_HOST'] ?? '')];
  if (!in_array($origin, $allowed, true)) fail(403, 'origin_not_allowed', 'origine non consentita');
}

// --- archivio su file (fuori dalla cartella pubblica se possibile)
$data = rtrim($C['data_dir'], '/');
foreach (["$data", "$data/jobs", "$data/out", "$data/quota"] as $d) if (!is_dir($d) && !mkdir($d, 0700, true)) fail(500, 'storage', 'archivio non scrivibile');
if (!file_exists("$data/.htaccess")) @file_put_contents("$data/.htaccess", "Require all denied\nDeny from all\n");

// pulizia periodica (retention)
if (random_int(1, 20) === 1) { $limit = time() - $C['retention_seconds']; foreach (array_merge(glob("$data/jobs/*.json") ?: [], glob("$data/out/*") ?: []) as $f) if (@filemtime($f) < $limit) @unlink($f); }

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? '';
if ($id !== '' && !preg_match('/^[a-f0-9]{32}$/', $id)) fail(400, 'invalid_id', 'id non valido');
$jobFile = fn(string $id) => "$data/jobs/$id.json";
$view = function (array $j): array { unset($j['ip'], $j['files']); return $j; };

if ($method === 'GET' && $id !== '') {
  if (!file_exists($jobFile($id))) fail(404, 'not_found', 'lavoro inesistente o scaduto');
  $j = json_decode(file_get_contents($jobFile($id)), true);
  if (isset($_GET['img'])) {
    $n = (int)$_GET['img']; $f = $j['files'][$n] ?? null;
    if (!$f || !file_exists("$data/out/$f")) fail(404, 'not_found', 'immagine non trovata');
    header('Content-Type: ' . (str_ends_with($f, '.jpg') ? 'image/jpeg' : (str_ends_with($f, '.webp') ? 'image/webp' : 'image/png')));
    readfile("$data/out/$f"); exit;
  }
  out(200, $view($j));
}
if ($method === 'DELETE' && $id !== '') {
  if (file_exists($jobFile($id))) { $j = json_decode(file_get_contents($jobFile($id)), true); foreach ($j['files'] ?? [] as $f) @unlink("$data/out/$f"); @unlink($jobFile($id)); }
  http_response_code(204); exit;
}
if ($method !== 'POST') fail(405, 'method_not_allowed', 'usa POST per creare un lavoro');

// --- kill switch
if ($C['kill_switch']) fail(503, 'disabled', 'il render AI è momentaneamente sospeso');

// --- dimensione e formato
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) fail(415, 'unsupported_media_type', 'serve application/json');
$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len <= 0 || $len > $C['max_body_bytes']) fail(413, 'too_large', 'richiesta troppo grande');
$b = json_decode(file_get_contents('php://input'), true);
if (!is_array($b)) fail(400, 'invalid_json', 'JSON non valido');

function imgBytes($s, int $max): int { if (!is_string($s) || !preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $s, $m)) return -1; $n = intdiv(strlen($m[2]) * 3, 4); return $n > $max ? -2 : $n; }
if (!in_array($b['mode'] ?? '', ['fedele', 'creativo'], true)) fail(400, 'invalid_input', 'mode deve essere fedele o creativo');
if (!is_string($b['prompt'] ?? null) || mb_strlen($b['prompt']) > 4000) fail(400, 'invalid_input', 'prompt mancante o troppo lungo');
$ib = imgBytes($b['image'] ?? null, $C['max_image_bytes']); if ($ib === -1) fail(400, 'invalid_input', 'image deve essere un data URL PNG/JPEG/WebP'); if ($ib === -2) fail(413, 'too_large', 'image troppo grande');
foreach (['depth', 'lines', 'materials'] as $k) if (!empty($b[$k]) && imgBytes($b[$k], $C['max_image_bytes']) < 0) fail(400, 'invalid_input', "$k non valido");
$p = $b['params'] ?? [];
foreach (['width', 'height'] as $k) if (isset($p[$k]) && ((int)$p[$k] < 64 || (int)$p[$k] > $C['max_side'])) fail(400, 'invalid_input', "$k fuori dai limiti");
$variants = max(1, min((int)($p['variants'] ?? 1), $C['max_variants']));

// --- Turnstile (facoltativo)
if ($C['turnstile_secret'] !== '') {
  $tok = $_SERVER['HTTP_CF_TURNSTILE_RESPONSE'] ?? ($b['turnstile'] ?? '');
  $ver = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, stream_context_create(['http' => ['method' => 'POST', 'header' => 'Content-Type: application/x-www-form-urlencoded', 'content' => http_build_query(['secret' => $C['turnstile_secret'], 'response' => $tok, 'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '']), 'timeout' => 8]]));
  if (!$ver || !(json_decode($ver, true)['success'] ?? false)) fail(403, 'bot_check_failed', 'verifica anti-bot non superata');
}

// --- quote: per IP al giorno e globale al giorno (contatori su file con lock)
$day = gmdate('Ymd'); $ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '?') . $C['ip_salt']);
$qf = fopen("$data/quota/$day.json", 'c+'); if (!$qf || !flock($qf, LOCK_EX)) fail(500, 'storage', 'quote non disponibili');
$q = json_decode(stream_get_contents($qf) ?: '{}', true) ?: [];
$used = $q['ip'][$ipHash] ?? 0; $total = $q['total'] ?? 0;
$retry = (string)(strtotime('tomorrow UTC') - time());
if ($used >= $C['per_ip_daily']) { flock($qf, LOCK_UN); fclose($qf); fail(429, 'quota_exceeded', "hai usato i {$C['per_ip_daily']} render disponibili oggi", ['Retry-After' => $retry]); }
if ($total >= $C['global_daily']) { flock($qf, LOCK_UN); fclose($qf); fail(429, 'global_quota_exceeded', 'limite giornaliero del servizio raggiunto', ['Retry-After' => $retry]); }
$q['ip'][$ipHash] = $used + 1; $q['total'] = $total + 1;
ftruncate($qf, 0); rewind($qf); fwrite($qf, json_encode($q)); fflush($qf); flock($qf, LOCK_UN); fclose($qf);

$self = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/') . '/' . basename(__FILE__);
$jid = bin2hex(random_bytes(16));
$job = ['id' => $jid, 'status' => 'running', 'mode' => $b['mode'], 'created_at' => gmdate('c'), 'expires_at' => gmdate('c', time() + $C['retention_seconds']), 'provider' => $C['provider_mode'], 'files' => []];
file_put_contents($jobFile($jid), json_encode($job));

// --- chiamata al fornitore
$images = [];
try {
  if ($C['provider_mode'] === 'mock') {
    $images = array_fill(0, $variants, $b['image']); $job['mock'] = true;
  } elseif ($C['provider_mode'] === 'forward') {
    // Adattatore generico: inoltra il contratto al fornitore configurato.
    // Da sostituire con l'adattatore del fornitore scelto (Cloudflare Workers AI, ComfyUI…).
    if ($C['provider_url'] === '') throw new RuntimeException('fornitore non configurato');
    $payload = $b; $payload['params']['variants'] = $variants; unset($payload['turnstile']);
    $ch = curl_init($C['provider_url']);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $C['provider_timeout'],
      CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $C['provider_headers']), CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); curl_close($ch);
    if ($resp === false) throw new RuntimeException('fornitore non raggiungibile: ' . $err);
    if ($code >= 400) throw new RuntimeException("il fornitore ha risposto $code");
    $r = json_decode($resp, true);
    $walk = function ($x) use (&$walk, &$images) { if (count($images) >= 8) return; if (is_string($x)) { if (str_starts_with($x, 'data:image/')) $images[] = $x; elseif (strlen($x) > 2000 && preg_match('#^[A-Za-z0-9+/=\s]+$#', substr($x, 0, 200))) $images[] = 'data:image/png;base64,' . preg_replace('/\s/', '', $x); } elseif (is_array($x)) foreach ($x as $v) $walk($v); };
    $walk($r);
    if (!$images) throw new RuntimeException('nessuna immagine nella risposta del fornitore');
  } else throw new RuntimeException('provider_mode non valido');
  // salva i risultati su file e restituisci URL a scadenza
  $urls = [];
  foreach (array_slice($images, 0, $C['max_variants']) as $n => $img) {
    if (!preg_match('#^data:image/(png|jpeg|webp);base64,(.+)$#', $img, $m)) continue;
    $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1]; $f = "{$jid}_$n.$ext";
    file_put_contents("$data/out/$f", base64_decode($m[2])); $job['files'][] = $f; $urls[] = "$self?id=$jid&img=$n";
  }
  $job['status'] = 'succeeded'; $job['images'] = $urls;
} catch (Throwable $e) {
  $job['status'] = 'failed'; $job['error'] = ['code' => 'provider_error', 'message' => $e->getMessage()];
}
file_put_contents($jobFile($jid), json_encode($job));
out($job['status'] === 'succeeded' ? 200 : 502, $view($job), ['Location' => "$self?id=$jid"]);
