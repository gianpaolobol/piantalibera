<?php
// Copia questo file in config.php (escluso da git) e modifica i valori.
// In alternativa imposta le variabili d'ambiente PL_* indicate. Mai chiavi nel client o in git.
$env = fn(string $k, $d = '') => (getenv($k) !== false ? getenv($k) : $d);
return [
  // 'mock' = restituisce la vista inviata (nessun costo) · 'forward' = chiama il fornitore configurato
  'provider_mode'    => $env('PL_PROVIDER_MODE', 'mock'),
  'provider_url'     => $env('PL_PROVIDER_URL', ''),                 // solo https
  'provider_headers' => array_filter([$env('PL_PROVIDER_AUTH') ? 'Authorization: ' . $env('PL_PROVIDER_AUTH') : null]),
  'provider_timeout' => (int)$env('PL_PROVIDER_TIMEOUT', '90'),
  'kill_switch'      => $env('PL_KILL_SWITCH', '0') === '1',         // sospende ogni nuovo render
  'per_ip_daily'     => (int)$env('PL_PER_IP_DAILY', '2'),            // da tarare sui consumi reali
  'global_daily'     => (int)$env('PL_GLOBAL_DAILY', '50'),           // tetto di spesa giornaliero in numero di render
  'max_body_bytes'   => 20 * 1024 * 1024,
  'max_image_bytes'  => 8 * 1024 * 1024,
  'max_side'         => 2048,
  'max_variants'     => 2,
  'retention_seconds'=> 3600,                                         // input e risultati cancellati dopo 1 ora
  'turnstile_secret' => $env('PL_TURNSTILE_SECRET', ''),              // vuoto = disattivato
  'allowed_origins'  => array_filter(explode(',', $env('PL_ALLOWED_ORIGINS', ''))), // vuoto = stesso host
  'ip_salt'          => $env('PL_IP_SALT', 'cambia-questo-valore'),   // gli IP sono salvati solo come hash
  'data_dir'         => $env('PL_DATA_DIR', __DIR__ . '/../data'),    // meglio fuori dalla cartella pubblica
];
