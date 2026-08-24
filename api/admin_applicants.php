<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function applicants_path(): string { return data_dir() . '/applicants.json'; }

function read_applicants(): array {
  $p = applicants_path();
  if (!file_exists($p)) return ['version' => '1.0', 'applicants' => []];
  $d = json_decode(file_get_contents($p) ?: '', true);
  return is_array($d) ? $d : ['version' => '1.0', 'applicants' => []];
}

function write_applicants(array $data): void {
  $fp = fopen(applicants_path(), 'c+');
  if (!$fp) throw new RuntimeException('Cannot open applicants db');
  flock($fp, LOCK_EX);
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
  fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];

try {
  if ($method === 'GET') {
    require_admin();
    $db = read_applicants();
    json_out(200, ['ok' => true, 'applicants' => $db['applicants']]);

  } elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);
    require_admin($body);

    $action = $body['action'] ?? '';
    $db = read_applicants();

    if ($action === 'save_applicant') {
      $ap = $body['applicant'] ?? [];
      if (empty($ap['name'])) json_out(400, ['ok' => false, 'error' => 'Missing name']);

      if (empty($ap['id'])) $ap['id'] = 'app_' . substr(uniqid(), -8);
      if (!isset($ap['createdAt'])) $ap['createdAt'] = date('Y-m-d');

      // Ensure boolean fields
      foreach (['medical','enjaz','bureau','wakalah','embassy','payment'] as $f) {
        $ap[$f] = !empty($ap[$f]);
      }

      $updated = false;
      foreach ($db['applicants'] as $i => $existing) {
        if ($existing['id'] === $ap['id']) { $db['applicants'][$i] = $ap; $updated = true; break; }
      }
      if (!$updated) $db['applicants'][] = $ap;
      write_applicants($db);
      json_out(200, ['ok' => true, 'applicant' => $ap]);

    } elseif ($action === 'delete_applicant') {
      $id = $body['id'] ?? '';
      $db['applicants'] = array_values(array_filter($db['applicants'], fn($a) => $a['id'] !== $id));
      write_applicants($db);
      json_out(200, ['ok' => true]);

    } else {
      json_out(400, ['ok' => false, 'error' => 'Unknown action']);
    }
  }
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
