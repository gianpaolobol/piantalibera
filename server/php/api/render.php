<?php
/**
 * Pianta Libera — backend PHP del contratto /api/render (per hosting condivisi, es. InfinityFree)
 *
 *   POST render.php            crea un lavoro      (corpo: vedi docs/api-render-contract.md)
 *   GET  render.php?id=<id>    stato e risultato
 *   GET  render.php?id=<id>&img=<n>  immagine n del risultato
 *   DELETE render.php?id=<id>  cancella il lavoro e i file
 *
 *   GET  render.php?config=1   configurazione pubblica (fornitore, quota, chiave Turnstile, privacy)
 *
 * Non è un proxy aperto: accetta solo il contratto del progetto, chiama UN solo
 * fornitore configurato lato server, applica quote per IP, concorrenza, tetto globale
 * giornaliero, kill switch, limiti di dimensione, consenso, Turnstile e cancellazione dei file.
 * Fail-closed: con provider_mode 'forward' e configurazione incompleta (sale degli IP,
 * Turnstile, URL https) il servizio resta disattivato.
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

function out(int $status, array $body, array $headers = []): void { foreach ($headers as $k => $v) header("$k: $v"); http_response_code($status); /* dopo Location, altrimenti PHP forza 302 */ echo json_encode($body, JSON_UNESCAPED_SLASHES); exit; }
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

// --- configurazione completa? (fail-closed per il fornitore reale)
$forward = $C['provider_mode'] === 'forward';
$missing = [];
if ($forward) {
  if (strlen($C['ip_salt']) < 16 || preg_match('/cambia|example|changeme/i', $C['ip_salt'])) $missing[] = 'ip_salt';
  if ($C['turnstile_secret'] === '' && !$C['allow_no_turnstile']) $missing[] = 'turnstile_secret';
  if (!str_starts_with($C['provider_url'], 'https://')) $missing[] = 'provider_url';
} elseif ($C['provider_mode'] !== 'mock') $missing[] = 'provider_mode';
$salt = $C['ip_salt'] !== '' ? $C['ip_salt'] : 'mock-locale';
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '?') . $salt);
$day = gmdate('Ymd');
$retry = (string)(strtotime('tomorrow UTC') - time());

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET' && isset($_GET['config'])) {
  $q = json_decode(@file_get_contents("$data/quota/$day.json") ?: '{}', true) ?: [];
  out(200, ['enabled' => !$missing && !$C['kill_switch'], 'reason' => $missing ? 'config_incomplete' : ($C['kill_switch'] ? 'disabled' : null),
    'mock' => !$forward, 'generated' => $forward, 'provider' => $forward ? ($C['provider_name'] ?? 'fornitore configurato sul server') : 'Servizio di prova',
    'model' => $C['provider_model'] ?? null, 'turnstile_site_key' => $C['turnstile_site_key'] ?: null,
    'quota' => ['per_ip_daily' => $C['per_ip_daily'], 'used_today' => $q['ip'][$ipHash] ?? 0],
    'limits' => ['max_side' => $C['max_side'], 'max_variants' => $C['max_variants']], 'retention_seconds' => $C['retention_seconds'],
    'privacy' => $forward ? 'La vista del modello, le mappe di profondità e contorni e il prompt sono inviati al fornitore AI configurato per generare l\'immagine. Gli IP sono conservati solo come hash con sale per le quote giornaliere; immagini e lavori sono cancellati dopo ' . round($C['retention_seconds'] / 60) . ' minuti.'
      : 'Servizio di prova: le immagini non sono inviate a terzi e vengono cancellate dopo ' . round($C['retention_seconds'] / 60) . ' minuti.']);
}
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
if ($missing) fail(503, 'config_incomplete', 'servizio di render non configurato');
if ($C['kill_switch']) fail(503, 'disabled', 'il render AI è momentaneamente sospeso');

// --- dimensione e formato
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) fail(415, 'unsupported_media_type', 'serve application/json');
$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len <= 0 || $len > $C['max_body_bytes']) fail(413, 'too_large', 'richiesta troppo grande');
$b = json_decode(file_get_contents('php://input'), true);
if (!is_array($b)) fail(400, 'invalid_json', 'JSON non valido');

final class ProviderOutput extends RuntimeException {}
function sniffImage(string $b): ?string {
  if (strncmp($b, "\x89PNG\r\n\x1a\n", 8) === 0) return 'png';
  if (strncmp($b, "\xff\xd8\xff", 3) === 0) return 'jpg';
  if (strncmp($b, 'RIFF', 4) === 0 && substr($b, 8, 4) === 'WEBP') return 'webp';
  return null;
}
function imgBytes($s, int $max): int { if (!is_string($s) || !preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $s, $m)) return -1; $n = intdiv(strlen($m[2]) * 3, 4); return $n > $max ? -2 : $n; }
if (!in_array($b['mode'] ?? '', ['fedele', 'creativo'], true)) fail(400, 'invalid_input', 'mode deve essere fedele o creativo');
if (!is_string($b['prompt'] ?? null) || mb_strlen($b['prompt']) > 4000) fail(400, 'invalid_input', 'prompt mancante o troppo lungo');
$ib = imgBytes($b['image'] ?? null, $C['max_image_bytes']); if ($ib === -1) fail(400, 'invalid_input', 'image deve essere un data URL PNG/JPEG/WebP'); if ($ib === -2) fail(413, 'too_large', 'image troppo grande');
foreach (['depth', 'lines', 'materials'] as $k) if (!empty($b[$k]) && imgBytes($b[$k], $C['max_image_bytes']) < 0) fail(400, 'invalid_input', "$k non valido");
$p = $b['params'] ?? [];
foreach (['width', 'height'] as $k) if (isset($p[$k]) && ((int)$p[$k] < 256 || (int)$p[$k] > $C['max_side'])) fail(400, 'invalid_input', "$k fuori dai limiti");
$variants = max(1, min((int)($p['variants'] ?? 1), $C['max_variants']));

if (($b['consent'] ?? null) !== true) fail(400, 'consent_required', "serve il consenso all'invio delle immagini (consent: true)");

// --- Turnstile (obbligatorio con il fornitore reale, salvo allow_no_turnstile)
if ($C['turnstile_secret'] !== '') {
  $tok = $_SERVER['HTTP_CF_TURNSTILE_RESPONSE'] ?? ($b['turnstile'] ?? '');
  $ver = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, stream_context_create(['http' => ['method' => 'POST', 'header' => 'Content-Type: application/x-www-form-urlencoded', 'content' => http_build_query(['secret' => $C['turnstile_secret'], 'response' => $tok, 'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '']), 'timeout' => 8]]));
  if (!$ver || !(json_decode($ver, true)['success'] ?? false)) fail(403, 'bot_check_failed', 'verifica anti-bot non superata');
}

// --- quote: per IP al giorno, concorrenza per IP e tetto globale (contatori su file con lock)
$quota = function (callable $fn) use ($data, $day) {
  $qf = fopen("$data/quota/$day.json", 'c+'); if (!$qf || !flock($qf, LOCK_EX)) fail(500, 'storage', 'quote non disponibili');
  $q = json_decode(stream_get_contents($qf) ?: '{}', true) ?: [];
  $res = $fn($q);
  ftruncate($qf, 0); rewind($qf); fwrite($qf, json_encode($q)); fflush($qf); flock($qf, LOCK_UN); fclose($qf);
  return $res;
};
$deny = $quota(function (array &$q) use ($C, $ipHash) {
  $used = $q['ip'][$ipHash] ?? 0; $run = $q['inflight'][$ipHash] ?? 0; $total = $q['total'] ?? 0;
  if ($used >= $C['per_ip_daily']) return ['quota_exceeded', "hai usato i {$C['per_ip_daily']} render disponibili oggi"];
  if ($run >= $C['max_concurrent']) return ['too_many_concurrent', 'attendi la fine del render in corso'];
  if ($total >= $C['global_daily']) return ['global_quota_exceeded', 'limite giornaliero del servizio raggiunto'];
  $q['ip'][$ipHash] = $used + 1; $q['inflight'][$ipHash] = $run + 1; $q['total'] = $total + 1;
  return null;
});
if ($deny) fail(429, $deny[0], $deny[1], ['Retry-After' => $deny[0] === 'too_many_concurrent' ? '30' : $retry]);

$self = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/') . '/' . basename(__FILE__);
$jid = bin2hex(random_bytes(16));
$job = ['id' => $jid, 'status' => 'running', 'mode' => $b['mode'], 'created_at' => gmdate('c'), 'expires_at' => gmdate('c', time() + $C['retention_seconds']), 'provider' => $C['provider_mode'], 'generated' => $forward, 'files' => []];
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
    // risposta attesa, e solo questa: {"images": ["data:image/png;base64,…", …]} oppure {"image": "<base64>"}
    $r = json_decode($resp, true);
    $list = is_array($r) ? (isset($r['images']) && is_array($r['images']) ? $r['images'] : (isset($r['image']) && is_string($r['image']) ? ['data:image/png;base64,' . $r['image']] : null)) : null;
    if (!$list) throw new ProviderOutput('risposta del fornitore senza immagini nel formato atteso');
    foreach (array_slice($list, 0, $variants) as $x) $images[] = $x;
  } else throw new RuntimeException('provider_mode non valido');
  // salva i risultati su file e restituisci URL a scadenza
  $urls = [];
  foreach (array_slice($images, 0, $C['max_variants']) as $n => $img) {
    if (!is_string($img) || !preg_match('#^data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$#', $img, $m)) throw new ProviderOutput('immagine del fornitore non valida');
    $bin = base64_decode($m[1], true);
    if ($bin === false || strlen($bin) > 12 * 1024 * 1024) throw new ProviderOutput('immagine del fornitore non valida o troppo grande');
    $type = sniffImage($bin); if (!$type) throw new ProviderOutput('il fornitore non ha restituito un PNG, JPEG o WebP');
    $f = "{$jid}_$n.$type";
    file_put_contents("$data/out/$f", $bin); $job['files'][] = $f; $urls[] = "$self?id=$jid&img=$n";
  }
  if (!$urls) throw new ProviderOutput('nessuna immagine nella risposta del fornitore');
  $job['status'] = 'succeeded'; $job['images'] = $urls;
} catch (Throwable $e) {
  foreach ($job['files'] as $f) @unlink("$data/out/$f");
  $job['files'] = [];
  $job['status'] = 'failed'; $job['error'] = ['code' => $e instanceof ProviderOutput ? 'invalid_provider_output' : 'provider_error', 'message' => $e->getMessage()];
} finally {
  // libera la concorrenza; se è fallito restituisce il render all'utente (il tetto globale resta: la chiamata può essere costata)
  $failed = $job['status'] !== 'succeeded';
  $left = $quota(function (array &$q) use ($ipHash, $failed, $C) {
    $q['inflight'][$ipHash] = max(0, ($q['inflight'][$ipHash] ?? 1) - 1);
    if ($failed) $q['ip'][$ipHash] = max(0, ($q['ip'][$ipHash] ?? 1) - 1);
    return max(0, $C['per_ip_daily'] - ($q['ip'][$ipHash] ?? 0));
  });
}
file_put_contents($jobFile($jid), json_encode($job));
out($job['status'] === 'succeeded' ? 200 : 502, $view($job), ['Location' => "$self?id=$jid", 'X-Quota-Remaining' => (string)$left]);
