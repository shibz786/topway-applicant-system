<?php
require_once __DIR__ . '/_lib.php';
require_admin();
try {
  $id = isset($_GET['id']) ? (string)$_GET['id'] : '';
  if (!$id) json_out(400, ['ok' => false, 'error' => 'Missing id']);

  $db = read_db();
  $kept = [];
  $deletedRec = null;
  foreach ($db['profiles'] as $rec) {
    if (isset($rec['id']) && $rec['id'] === $id) $deletedRec = $rec;
    else $kept[] = $rec;
  }
  if (!$deletedRec) json_out(404, ['ok' => false, 'error' => 'Not found']);

  $db['profiles'] = $kept;
  write_db($db);

  $imgs = collect_images_from_record($deletedRec);
  $ud = uploads_dir();
  foreach ($imgs as $fn) {
    $p = $ud . '/' . basename($fn);
    if (is_file($p)) { @unlink($p); }
  }

  json_out(200, ['ok' => true]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Failed to delete record']);
}
