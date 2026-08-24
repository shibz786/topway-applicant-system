<?php
require_once __DIR__ . '/_lib.php';
require_admin();
try {
  if (!isset($_FILES['file'])) json_out(400, ['ok' => false, 'error' => 'No file']);
  if (($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_out(400, ['ok' => false, 'error' => 'Upload error']);
  }
  if (($_FILES['file']['size'] ?? 0) > MAX_UPLOAD_BYTES) {
    json_out(400, ['ok' => false, 'error' => 'File too large (max 10MB)']);
  }

  $recordId = safe_id((string)($_POST['recordId'] ?? 'record'));
  $type = safe_id((string)($_POST['type'] ?? 'file'));

  $tmp = $_FILES['file']['tmp_name'];
  if (!is_uploaded_file($tmp)) json_out(400, ['ok' => false, 'error' => 'Invalid upload']);

  // Trust magic bytes, not the client-supplied filename/extension.
  $realMime = detect_mime_from_bytes($tmp);
  $extForMime = [
    'image/jpeg' => 'jpg', 'image/png' => 'png',
    'image/webp' => 'webp', 'application/pdf' => 'pdf',
    'image/gif' => 'gif',
  ];
  if ($realMime === null || !isset($extForMime[$realMime])) {
    json_out(400, ['ok' => false, 'error' => 'Unsupported or unrecognized file type']);
  }
  $ext = $extForMime[$realMime];

  $ts = (string)round(microtime(true) * 1000);
  $filename = $recordId . '_' . $type . '_' . $ts . '.' . $ext;

  $ud = uploads_dir();
  $dest = $ud . '/' . $filename;

  if (!move_uploaded_file($tmp, $dest)) json_out(500, ['ok' => false, 'error' => 'Upload failed']);

  json_out(200, ['ok' => true, 'filename' => $filename, 'url' => 'uploads/' . $filename]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Upload failed']);
}
