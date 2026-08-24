<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function agents_path(): string { return data_dir() . '/agents.json'; }

function read_agents(): array { return read_agents_raw(); }
function write_agents(array $data): void { write_agents_raw($data); }

function normalized_username(string $username): string {
  return strtolower(trim($username));
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];

try {
  if ($method === 'GET') {
    // GET: list agents (requires admin token)
    require_admin();

    $db = read_agents();
    $safe = array_map(function($ag) {
      $a = $ag; unset($a['passwordHash'], $a['token']); return $a;
    }, $db['agents']);
    json_out(200, ['ok' => true, 'agents' => $safe, 'settings' => $db['settings'] ?? ['allowAgentBrowse' => false]]);

  } elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);

    $action = $body['action'] ?? '';

    if ($action === 'admin_login') {
      enforce_login_rate_limit('admin', 'admin');
      $password = (string)($body['password'] ?? '');
      $tok = admin_token_from_password($password);
      record_login_result('admin', 'admin', $tok !== null);
      if (!$tok) json_out(401, ['ok' => false, 'error' => 'Invalid admin password']);
      json_out(200, ['ok' => true, 'adminToken' => $tok]);

    } else {
      // All other actions require admin token
      require_admin($body);

      $db = read_agents();

      if ($action === 'save_agent') {
        $ag = $body['agent'] ?? [];
        if (empty($ag['username'])) json_out(400, ['ok' => false, 'error' => 'Missing username']);
        $ag['username'] = normalized_username((string)$ag['username']);
        if ($ag['username'] === '') json_out(400, ['ok' => false, 'error' => 'Missing username']);

        $id = $ag['id'] ?? ('agent_' . strtolower(preg_replace('/[^a-z0-9]/i', '', $ag['username'])) . '_' . substr(uniqid(), -6));
        $ag['id'] = $id;

        if (!empty($ag['password'])) {
          $ag['passwordHash'] = password_hash($ag['password'], PASSWORD_DEFAULT);
        }
        unset($ag['password']);
        if (!isset($ag['token'])) $ag['token'] = '';
        if (!isset($ag['active'])) $ag['active'] = true;
        if (!isset($ag['createdAt'])) $ag['createdAt'] = date('Y-m-d');
        if (!isset($ag['applicantIds'])) $ag['applicantIds'] = [];
        if (!isset($ag['pendingIds']))   $ag['pendingIds']   = [];

        $updated = false;
        foreach ($db['agents'] as $i => $existing) {
          if ($existing['id'] === $id) {
            // Preserve passwordHash and token if not changing
            if (!isset($ag['passwordHash'])) $ag['passwordHash'] = $existing['passwordHash'] ?? '';
            $ag['token'] = $existing['token'] ?? '';
            $db['agents'][$i] = $ag;
            $updated = true; break;
          }
        }
        if (!$updated) {
          if (!isset($ag['passwordHash'])) json_out(400, ['ok' => false, 'error' => 'Password required for new agent']);
          $db['agents'][] = $ag;
        }
        write_agents($db);
        $safe = $ag; unset($safe['passwordHash'], $safe['token']);
        json_out(200, ['ok' => true, 'agent' => $safe]);

      } elseif ($action === 'delete_agent') {
        $id = $body['id'] ?? '';
        $db['agents'] = array_values(array_filter($db['agents'], fn($a) => $a['id'] !== $id));
        write_agents($db);
        json_out(200, ['ok' => true]);

      } elseif ($action === 'assign_applicants') {
        $id  = $body['id'] ?? '';
        $ids = $body['applicantIds'] ?? [];
        foreach ($db['agents'] as $i => $ag) {
          if ($ag['id'] === $id) {
            $db['agents'][$i]['applicantIds'] = $ids;
            // Remove newly-assigned IDs from pending
            $pending = $ag['pendingIds'] ?? [];
            $db['agents'][$i]['pendingIds'] = array_values(array_filter($pending, fn($p) => !in_array($p, $ids)));
            write_agents($db);
            json_out(200, ['ok' => true]);
          }
        }
        json_out(404, ['ok' => false, 'error' => 'Agent not found']);

      } elseif ($action === 'approve_request') {
        $agentId   = $body['agentId']   ?? '';
        $profileId = $body['profileId'] ?? '';
        foreach ($db['agents'] as $i => $ag) {
          if ($ag['id'] === $agentId) {
            $pending  = array_values(array_filter($ag['pendingIds']   ?? [], fn($p) => $p !== $profileId));
            $assigned = $ag['applicantIds'] ?? [];
            if (!in_array($profileId, $assigned)) $assigned[] = $profileId;
            $db['agents'][$i]['pendingIds']   = $pending;
            $db['agents'][$i]['applicantIds'] = $assigned;
            write_agents($db);
            json_out(200, ['ok' => true]);
          }
        }
        json_out(404, ['ok' => false, 'error' => 'Agent not found']);

      } elseif ($action === 'save_settings') {
        $settings = $body['settings'] ?? [];
        if (!is_array($settings)) json_out(400, ['ok' => false, 'error' => 'Invalid settings']);
        if (!isset($db['settings']) || !is_array($db['settings'])) $db['settings'] = [];
        $db['settings']['allowAgentBrowse'] = !empty($settings['allowAgentBrowse']);
        write_agents($db);
        json_out(200, ['ok' => true, 'settings' => $db['settings']]);

      } else {
        json_out(400, ['ok' => false, 'error' => 'Unknown action']);
      }
    }
  }
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error: ' . $e->getMessage()]);
}
