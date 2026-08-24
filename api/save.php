<?php
require_once __DIR__ . '/_lib.php';
try {
  $incoming = json_decode(file_get_contents('php://input') ?: '', true);
  if (!is_array($incoming)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);
  require_admin($incoming);
  if (!isset($incoming['id']) || !is_string($incoming['id']) || trim($incoming['id']) === '') {
    json_out(400, ['ok' => false, 'error' => 'Missing id']);
  }
  unset($incoming['admin_token']); // never persist the credential into the profile record

  $db = read_db();
  $id = $incoming['id'];
  $updated = false;
  for ($i = 0; $i < count($db['profiles']); $i++) {
    if (isset($db['profiles'][$i]['id']) && $db['profiles'][$i]['id'] === $id) {
      $db['profiles'][$i] = $incoming;
      $updated = true;
      break;
    }
  }
  if (!$updated) $db['profiles'][] = $incoming;
  write_db($db);
  json_out(200, ['ok' => true, 'data' => $incoming]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Failed to save record']);
}
