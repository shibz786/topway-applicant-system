<?php
require_once __DIR__ . '/_lib.php';
require_admin();
try {
  $db = read_db();
  json_out(200, ['ok' => true, 'records' => $db['profiles']]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Failed to list records']);
}
