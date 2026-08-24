<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function invoices_path(): string { return data_dir() . '/invoices.json'; }

function read_invoices(): array {
  $p = invoices_path();
  if (!file_exists($p)) return ['version' => '1.0', 'invoices' => []];
  $data = json_decode(file_get_contents($p) ?: '', true);
  return is_array($data) ? $data : ['version' => '1.0', 'invoices' => []];
}

function write_invoices(array $data): void {
  $fp = fopen(invoices_path(), 'c+');
  if (!$fp) throw new RuntimeException('Cannot open invoices db');
  flock($fp, LOCK_EX);
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
  fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

function next_invoice_number(array $db): string {
  $max = 0;
  foreach ($db['invoices'] as $inv) {
    $n = intval($inv['invoiceNo'] ?? 0);
    if ($n > $max) $max = $n;
  }
  return str_pad((string)($max + 1), 2, '0', STR_PAD_LEFT);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  $method = $_SERVER['REQUEST_METHOD'];

  if ($method === 'GET') {
    require_admin();
    $action = $_GET['action'] ?? 'list';
    $db = read_invoices();
    if ($action === 'list') {
      $invs = $db['invoices'];
      usort($invs, fn($a, $b) => strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? ''));
      json_out(200, ['ok' => true, 'invoices' => $invs]);
    } elseif ($action === 'list_agents') {
      $ap = data_dir() . '/agents.json';
      $agents = [];
      if (file_exists($ap)) {
        $ad = json_decode(file_get_contents($ap) ?: '', true);
        foreach (($ad['agents'] ?? []) as $ag) {
          if ($ag['active'] ?? true) {
            $agents[] = [
              'id'      => $ag['id']      ?? '',
              'name'    => $ag['name']    ?? '',
              'company' => $ag['company'] ?? '',
              'country' => $ag['country'] ?? '',
            ];
          }
        }
      }
      json_out(200, ['ok' => true, 'agents' => $agents]);
    } elseif ($action === 'get') {
      $id = safe_id($_GET['id'] ?? '');
      foreach ($db['invoices'] as $inv) {
        if (($inv['id'] ?? '') === $id) json_out(200, ['ok' => true, 'invoice' => $inv]);
      }
      json_out(404, ['ok' => false, 'error' => 'Not found']);
    } elseif ($action === 'next_number') {
      json_out(200, ['ok' => true, 'invoiceNo' => next_invoice_number($db)]);
    } else {
      json_out(400, ['ok' => false, 'error' => 'Unknown action']);
    }

  } elseif ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);
    require_admin($body);

    $action = $body['action'] ?? 'save';

    if ($action === 'save') {
      unset($body['action']); // don't persist the action key
      if (empty($body['id'])) $body['id'] = 'inv_' . bin2hex(random_bytes(6));
      $body['updatedAt'] = date('c');
      if (empty($body['createdAt'])) $body['createdAt'] = date('c');

      $db = read_invoices();
      $updated = false;
      for ($i = 0; $i < count($db['invoices']); $i++) {
        if (($db['invoices'][$i]['id'] ?? '') === $body['id']) {
          $db['invoices'][$i] = $body;
          $updated = true;
          break;
        }
      }
      if (!$updated) $db['invoices'][] = $body;
      write_invoices($db);
      json_out(200, ['ok' => true, 'invoice' => $body]);

    } elseif ($action === 'delete') {
      $id = safe_id($body['id'] ?? '');
      if ($id === '') json_out(400, ['ok' => false, 'error' => 'Missing id']);
      $db = read_invoices();
      $db['invoices'] = array_values(array_filter($db['invoices'], fn($inv) => ($inv['id'] ?? '') !== $id));
      write_invoices($db);
      json_out(200, ['ok' => true]);

    } else {
      json_out(400, ['ok' => false, 'error' => 'Unknown action']);
    }

  } else {
    json_out(405, ['ok' => false, 'error' => 'Method not allowed']);
  }
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
