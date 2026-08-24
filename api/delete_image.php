<?php
require_once __DIR__ . '/_lib.php';
require_admin();
try {
  $fn = isset($_GET['filename']) ? basename((string)$_GET['filename']) : '';
  if (!$fn) json_out(400, ['ok' => false, 'error' => 'Missing filename']);
  $p = uploads_dir() . '/' . $fn;
  if (is_file($p)) @unlink($p);
  json_out(200, ['ok' => true]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Delete failed']);
}
