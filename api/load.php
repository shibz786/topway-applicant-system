<?php
require_once __DIR__ . '/_lib.php';
require_admin();
try {
  $id = isset($_GET['id']) ? (string)$_GET['id'] : '';
  if (!$id) json_out(400, ['ok' => false, 'error' => 'Missing id']);

  $db = read_db();
  $found = null;
  foreach ($db['profiles'] as $rec) {
    if (isset($rec['id']) && $rec['id'] === $id) { $found = $rec; break; }
  }
  json_out(200, ['ok' => true, 'data' => $found]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Failed to load record']);
}
