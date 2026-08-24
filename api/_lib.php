<?php
declare(strict_types=1);

function safe_id(string $s): string {
  $s = preg_replace('/[^A-Za-z0-9_-]/', '', $s);
  return substr($s, 0, 64);
}

function base_dir(): string {
  return realpath(__DIR__ . '/..');
}

function data_dir(): string {
  $d = base_dir() . '/data';
  if (!is_dir($d)) mkdir($d, 0775, true);
  return $d;
}

function uploads_dir(): string {
  $d = base_dir() . '/uploads';
  if (!is_dir($d)) mkdir($d, 0775, true);
  return $d;
}

function db_path(): string {
  return data_dir() . '/profiles.json';
}

function ensure_db(): void {
  $p = db_path();
  if (!file_exists($p)) {
    file_put_contents($p, json_encode(["version" => "2.1", "profiles" => []], JSON_PRETTY_PRINT));
  }
}

function read_db(): array {
  ensure_db();
  $raw = file_get_contents(db_path());
  $data = json_decode($raw ?: '', true);
  if (!is_array($data)) $data = ["version" => "2.1", "profiles" => []];
  if (!isset($data['profiles']) || !is_array($data['profiles'])) $data['profiles'] = [];
  return $data;
}

function write_db(array $data): void {
  if (!isset($data['profiles']) || !is_array($data['profiles'])) $data['profiles'] = [];
  $fp = fopen(db_path(), 'c+');
  if (!$fp) throw new RuntimeException('Could not open db');
  if (!flock($fp, LOCK_EX)) { fclose($fp); throw new RuntimeException('Could not lock db'); }
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
}

function json_out(int $code, array $payload): void {
  http_response_code($code);
  header('Content-Type: application/json');
  echo json_encode($payload);
  exit;
}

function collect_images_from_record(array $rec): array {
  $out = [];
  $im = $rec['images'] ?? [];
  foreach (['foreignLogo', 'headshot', 'fullphoto'] as $k) {
    if (isset($im[$k]) && is_string($im[$k]) && trim($im[$k]) !== '') {
      $out[] = basename($im[$k]);
    }
  }
  return $out;
}

// ═══════════════════════════════════════════════════════════════
// AUTH — centralized. Every endpoint below must call require_admin()
// and/or require_agent() before touching data. Do not re-implement
// token checks inline in individual endpoint files.
// ═══════════════════════════════════════════════════════════════

function agents_db_path(): string { return data_dir() . '/agents.json'; }

function read_agents_raw(): array {
  $p = agents_db_path();
  if (!file_exists($p)) return ['version' => '1.0', 'adminPasswordHash' => '', 'agents' => [], 'settings' => ['allowAgentBrowse' => false]];
  $d = json_decode(file_get_contents($p) ?: '', true);
  if (!is_array($d)) $d = ['version' => '1.0', 'adminPasswordHash' => '', 'agents' => []];
  if (!isset($d['settings']) || !is_array($d['settings'])) $d['settings'] = [];
  if (!array_key_exists('allowAgentBrowse', $d['settings'])) $d['settings']['allowAgentBrowse'] = false;
  if (!isset($d['agents']) || !is_array($d['agents'])) $d['agents'] = [];
  return $d;
}

function write_agents_raw(array $data): void {
  $fp = fopen(agents_db_path(), 'c+');
  if (!$fp) throw new RuntimeException('Cannot open agents db');
  flock($fp, LOCK_EX);
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
  fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

function verify_admin_token(string $token): bool {
  if ($token === '') return false;
  $db = read_agents_raw();
  $hash = $db['adminPasswordHash'] ?? '';
  if ($hash === '') return false;
  return hash_equals('admin_' . hash('sha256', $hash), $token);
}

function admin_token_from_password(string $password): ?string {
  $db = read_agents_raw();
  $hash = $db['adminPasswordHash'] ?? '';
  if ($hash === '' || !password_verify($password, $hash)) return null;
  return 'admin_' . hash('sha256', $hash);
}

// Resolve an admin token from header, query string, form field, or a
// pre-decoded JSON body (pass it in when the endpoint already consumed
// php://input so we don't try to read the stream twice).
function resolve_admin_token(?array $jsonBody = null): string {
  $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (is_string($auth) && str_starts_with($auth, 'Bearer ')) {
    $t = substr($auth, 7);
    if ($t !== '') return $t;
  }
  if (!empty($_SERVER['HTTP_X_ADMIN_TOKEN'])) return (string)$_SERVER['HTTP_X_ADMIN_TOKEN'];
  if (!empty($_GET['admin_token'])) return (string)$_GET['admin_token'];
  if (!empty($_POST['admin_token'])) return (string)$_POST['admin_token'];
  if ($jsonBody !== null && !empty($jsonBody['admin_token'])) return (string)$jsonBody['admin_token'];
  return '';
}

// Call at the top of every admin-only endpoint. Exits with 401 (never
// reveals *why*) if the token is missing or invalid.
function require_admin(?array $jsonBody = null): void {
  $token = resolve_admin_token($jsonBody);
  if (!verify_admin_token($token)) {
    json_out(401, ['ok' => false, 'error' => 'Unauthorized']);
  }
}

function validate_agent_token(string $token): ?array {
  if ($token === '') return null;
  $db = read_agents_raw();
  foreach ($db['agents'] as $ag) {
    if (($ag['token'] ?? '') === $token && $token !== '' && ($ag['active'] ?? true)) return $ag;
  }
  return null;
}

function resolve_agent_token(?array $jsonBody = null): string {
  $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (is_string($auth) && str_starts_with($auth, 'Bearer ')) {
    $t = substr($auth, 7);
    if ($t !== '') return $t;
  }
  if (!empty($_GET['token'])) return (string)$_GET['token'];
  if (!empty($_POST['token'])) return (string)$_POST['token'];
  if ($jsonBody !== null && !empty($jsonBody['token'])) return (string)$jsonBody['token'];
  return '';
}

// Call at the top of every agent-only endpoint. Returns the agent record
// (so callers can scope data to it) or exits with 401.
function require_agent(?array $jsonBody = null): array {
  $token = resolve_agent_token($jsonBody);
  $agent = validate_agent_token($token);
  if (!$agent) json_out(401, ['ok' => false, 'error' => 'Unauthorized']);
  return $agent;
}

// Admin OR agent (used by endpoints like agent_logo.php that both roles hit).
function require_admin_or_agent(?array $jsonBody = null): array {
  $adminToken = resolve_admin_token($jsonBody);
  if (verify_admin_token($adminToken)) return ['role' => 'admin', 'agent' => null];
  $agentToken = resolve_agent_token($jsonBody);
  $agent = validate_agent_token($agentToken);
  if ($agent) return ['role' => 'agent', 'agent' => $agent];
  json_out(401, ['ok' => false, 'error' => 'Unauthorized']);
}

// ═══════════════════════════════════════════════════════════════
// LOGIN RATE LIMITING — file-based stopgap until Upstash lands in
// the Phase 1 rebuild. 10 attempts/IP/15min, 5 consecutive fails on
// one username locks that username for 15min. Never reveals whether
// a username exists — callers must return a generic error either way.
// ═══════════════════════════════════════════════════════════════

function login_attempts_path(): string { return data_dir() . '/login_attempts.json'; }

function read_login_attempts(): array {
  $p = login_attempts_path();
  if (!file_exists($p)) return [];
  $d = json_decode(file_get_contents($p) ?: '', true);
  return is_array($d) ? $d : [];
}

function write_login_attempts(array $data): void {
  $fp = fopen(login_attempts_path(), 'c+');
  if (!$fp) return;
  flock($fp, LOCK_EX);
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($data));
  fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

function client_ip(): string {
  return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

// Call before verifying credentials. Exits with 429 if this IP or this
// username is currently rate-limited / locked out.
function enforce_login_rate_limit(string $scope, string $usernameKey): void {
  $now = time();
  $attempts = read_login_attempts();
  foreach ($attempts as $k => $rec) {
    if (array_key_exists('count', $rec)) {
      // IP window record — drop once its 15min window has elapsed.
      if (($rec['windowStart'] ?? 0) < $now - 900) unset($attempts[$k]);
    } elseif (array_key_exists('fails', $rec)) {
      // Per-username fail counter — only drop once an active lock has
      // expired (it has no window of its own; it must survive requests
      // or the 5-consecutive-fails count could never accumulate).
      if (($rec['lockedUntil'] ?? 0) > 0 && ($rec['lockedUntil'] ?? 0) < $now) unset($attempts[$k]);
    }
  }

  $ipKey = $scope . ':ip:' . client_ip();
  $ipRec = $attempts[$ipKey] ?? ['count' => 0, 'windowStart' => $now];
  if ($now - ($ipRec['windowStart'] ?? 0) > 900) $ipRec = ['count' => 0, 'windowStart' => $now];
  if (($ipRec['count'] ?? 0) >= 10) {
    write_login_attempts($attempts);
    json_out(429, ['ok' => false, 'error' => 'Too many attempts from this network. Try again later.']);
  }

  $userKey = $scope . ':user:' . strtolower($usernameKey);
  $userRec = $attempts[$userKey] ?? ['fails' => 0, 'lockedUntil' => 0];
  if (($userRec['lockedUntil'] ?? 0) > $now) {
    write_login_attempts($attempts);
    json_out(429, ['ok' => false, 'error' => 'Invalid username or password.']);
  }

  write_login_attempts($attempts);
}

// Call after a login attempt to record success/failure and update lockouts.
function record_login_result(string $scope, string $usernameKey, bool $success): void {
  $now = time();
  $attempts = read_login_attempts();

  $ipKey = $scope . ':ip:' . client_ip();
  $ipRec = $attempts[$ipKey] ?? ['count' => 0, 'windowStart' => $now];
  if ($now - ($ipRec['windowStart'] ?? 0) > 900) $ipRec = ['count' => 0, 'windowStart' => $now];
  $ipRec['count'] = ($ipRec['count'] ?? 0) + 1;
  $attempts[$ipKey] = $ipRec;

  $userKey = $scope . ':user:' . strtolower($usernameKey);
  $userRec = $attempts[$userKey] ?? ['fails' => 0, 'lockedUntil' => 0];
  if ($success) {
    $userRec = ['fails' => 0, 'lockedUntil' => 0];
  } else {
    $userRec['fails'] = ($userRec['fails'] ?? 0) + 1;
    if ($userRec['fails'] >= 5) {
      $userRec['lockedUntil'] = $now + 900;
      $userRec['fails'] = 0;
    }
  }
  $attempts[$userKey] = $userRec;

  write_login_attempts($attempts);
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD SAFETY — magic-byte sniffing. Extension/declared MIME is
// never trusted alone.
// ═══════════════════════════════════════════════════════════════

function detect_mime_from_bytes(string $path): ?string {
  $fh = @fopen($path, 'rb');
  if (!$fh) return null;
  $bytes = fread($fh, 12);
  fclose($fh);
  if ($bytes === false || strlen($bytes) < 4) return null;

  if (substr($bytes, 0, 3) === "\xFF\xD8\xFF") return 'image/jpeg';
  if (substr($bytes, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A") return 'image/png';
  if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (substr($bytes, 0, 4) === '%PDF') return 'application/pdf';
  if (substr($bytes, 0, 6) === 'GIF87a' || substr($bytes, 0, 6) === 'GIF89a') return 'image/gif';
  return null;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
