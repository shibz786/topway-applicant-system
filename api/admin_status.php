<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  $body = json_decode(file_get_contents('php://input') ?: '', true);
  if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);
  require_admin($body);

  $id = $body['id'] ?? '';
  if ($id === '') json_out(400, ['ok' => false, 'error' => 'Missing profile id']);

  $tracking = $body['tracking'] ?? [];
  if (!is_array($tracking)) json_out(400, ['ok' => false, 'error' => 'Invalid tracking data']);

  // Sanitise boolean step fields
  foreach (['medical','enjaz','bureau','wakalah','embassy','payment'] as $f) {
    if (isset($tracking[$f])) $tracking[$f] = (bool)$tracking[$f];
  }
  // Sanitise step date fields (YYYY-MM-DD or null)
  foreach (['medical_date','enjaz_date','bureau_date','wakalah_date','embassy_date','payment_date'] as $f) {
    if (array_key_exists($f, $tracking)) {
      $d = $tracking[$f];
      if ($d === null || $d === '') { $tracking[$f] = null; }
      elseif (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) { $tracking[$f] = $d; }
      else { $tracking[$f] = null; }
    }
  }
  // Sanitise confirmed boolean
  if (isset($tracking['confirmed'])) $tracking['confirmed'] = (bool)$tracking['confirmed'];
  if (array_key_exists('pipelineStatus', $tracking)) {
    $tracking['pipelineStatus'] = $tracking['pipelineStatus'] === 'sent' ? 'sent' : '';
  }

  $db = read_db();
  $found = false;
  foreach ($db['profiles'] as $i => $rec) {
    if (($rec['id'] ?? '') === $id) {
      $db['profiles'][$i]['tracking'] = array_merge(
        $db['profiles'][$i]['tracking'] ?? [],
        $tracking
      );
      $found = true;
      $updated = $db['profiles'][$i];
      break;
    }
  }

  if (!$found) json_out(404, ['ok' => false, 'error' => 'Profile not found']);

  write_db($db);
  json_out(200, ['ok' => true, 'profile' => $updated]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
