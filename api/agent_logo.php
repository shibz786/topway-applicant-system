<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

function read_agents(): array { return read_agents_raw(); }
function write_agents(array $data): void { write_agents_raw($data); }

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  if (($_FILES['logo']['size'] ?? 0) > MAX_UPLOAD_BYTES) {
    json_out(400, ['ok' => false, 'error' => 'File too large (max 10MB)']);
  }

  $auth = require_admin_or_agent();
  $agentId = (string)($_POST['agent_id'] ?? '');
  if ($auth['role'] === 'admin') {
    if ($agentId === '') json_out(400, ['ok' => false, 'error' => 'agent_id required']);
  } else {
    $agentId = $auth['agent']['id'];
  }

  if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    json_out(400, ['ok' => false, 'error' => 'No file uploaded']);
  }

  $file = $_FILES['logo'];
  if (!is_uploaded_file($file['tmp_name'])) json_out(400, ['ok' => false, 'error' => 'Invalid upload']);

  // SVG can't be verified by magic bytes against XSS payloads reliably —
  // drop it from the accepted set; raster formats only.
  $mime = detect_mime_from_bytes($file['tmp_name']);
  $extForMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
  if ($mime === null || !isset($extForMime[$mime])) {
    json_out(400, ['ok' => false, 'error' => 'Invalid file type']);
  }
  $ext = $extForMime[$mime];

  $filename = 'agentlogo_' . $agentId . '_' . time() . '.' . $ext;
  $dest = uploads_dir() . '/' . $filename;

  if (!move_uploaded_file($file['tmp_name'], $dest)) json_out(500, ['ok' => false, 'error' => 'Upload failed']);

  $db = read_agents();
  foreach ($db['agents'] as $i => $ag) {
    if ($ag['id'] === $agentId) {
      // Delete old logo
      $old = $ag['logo'] ?? '';
      if ($old !== '' && file_exists(uploads_dir() . '/' . basename($old))) {
        @unlink(uploads_dir() . '/' . basename($old));
      }
      $db['agents'][$i]['logo'] = $filename;
      write_agents($db);
      json_out(200, ['ok' => true, 'filename' => $filename]);
    }
  }
  json_out(404, ['ok' => false, 'error' => 'Agent not found']);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
