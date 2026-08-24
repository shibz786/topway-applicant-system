<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function read_agents(): array { return read_agents_raw(); }
function write_agents(array $data): void { write_agents_raw($data); }

function generate_token(): string {
  return bin2hex(random_bytes(32));
}

function normalized_username(string $username): string {
  return strtolower(trim($username));
}

function safe_agent_payload(array $agent, array $settings, string $token): array {
  $safe = [
    'id' => $agent['id'] ?? '',
    'name' => $agent['name'] ?? '',
    'company' => $agent['company'] ?? '',
    'country' => $agent['country'] ?? '',
    'username' => $agent['username'] ?? '',
    'logo' => $agent['logo'] ?? '',
    'active' => $agent['active'] ?? true,
    'settings' => [
      'allowAgentBrowse' => !empty($settings['allowAgentBrowse']),
    ],
    'token' => $token,
  ];
  return $safe;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  $body = json_decode(file_get_contents('php://input') ?: '', true);
  if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);

  $action = $body['action'] ?? 'login';

  if ($action === 'login') {
    $username = normalized_username((string)($body['username'] ?? ''));
    $password = $body['password'] ?? '';
    if ($username === '' || $password === '') json_out(400, ['ok' => false, 'error' => 'Missing credentials']);

    enforce_login_rate_limit('agent', $username);

    $db = read_agents();
    $found = null;
    $idx = -1;
    foreach ($db['agents'] as $i => $ag) {
      if (normalized_username((string)($ag['username'] ?? '')) === $username) { $found = $ag; $idx = $i; break; }
    }

    // Always run password_verify (even against a dummy hash) so a
    // nonexistent username doesn't respond measurably faster — timing
    // shouldn't reveal whether the account exists any more than the
    // generic error message does.
    $hashToCheck = $found['passwordHash'] ?? '$2y$10$invalidinvalidinvaliduinvalidinvalidinvalidinvalidinva';
    $passOk = password_verify($password, $hashToCheck);
    $activeOk = $found ? ($found['active'] ?? true) : false;
    $success = $found !== null && $activeOk && $passOk;

    record_login_result('agent', $username, $success);

    if (!$found || !$passOk) json_out(401, ['ok' => false, 'error' => 'Invalid username or password']);
    if (!$activeOk) json_out(403, ['ok' => false, 'error' => 'This agent account is inactive. Contact the administrator.']);

    $token = generate_token();
    $db['agents'][$idx]['username'] = $username;
    $db['agents'][$idx]['token'] = $token;
    write_agents($db);

    $safe = safe_agent_payload($db['agents'][$idx], $db['settings'] ?? [], $token);
    json_out(200, ['ok' => true, 'agent' => $safe]);

  } elseif ($action === 'logout') {
    $token = $body['token'] ?? '';
    if ($token !== '') {
      $db = read_agents();
      foreach ($db['agents'] as $i => $ag) {
        if (($ag['token'] ?? '') === $token) { $db['agents'][$i]['token'] = ''; break; }
      }
      write_agents($db);
    }
    json_out(200, ['ok' => true]);

  } elseif ($action === 'verify') {
    $token = $body['token'] ?? '';
    if ($token === '') json_out(401, ['ok' => false, 'error' => 'No token']);
    $db = read_agents();
    foreach ($db['agents'] as $ag) {
      if (($ag['token'] ?? '') === $token && $token !== '') {
        if (!($ag['active'] ?? true)) json_out(403, ['ok' => false, 'error' => 'This agent account is inactive.']);
        $safe = safe_agent_payload($ag, $db['settings'] ?? [], $token);
        json_out(200, ['ok' => true, 'agent' => $safe]);
      }
    }
    json_out(401, ['ok' => false, 'error' => 'Invalid token']);

  } else {
    json_out(400, ['ok' => false, 'error' => 'Unknown action']);
  }
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
