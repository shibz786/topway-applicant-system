<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  $agent = require_agent();

  $profileId = $_GET['id'] ?? '';
  if ($profileId === '') json_out(400, ['ok' => false, 'error' => 'Missing profile id']);

  // Check agent is allowed to access this profile
  $allowed = $agent['applicantIds'] ?? [];
  if (!in_array($profileId, $allowed, true)) {
    json_out(403, ['ok' => false, 'error' => 'Access denied']);
  }

  $db = read_db();
  foreach ($db['profiles'] as $rec) {
    if (($rec['id'] ?? '') === $profileId && ($rec['id'] ?? '') !== '__global__') {
      // Strip internal-only contact fields before sending to agent
      $fields = $rec['fields'] ?? [];
      foreach (['f-phone','f-whatsapp','f-email','f-emergency','f-address'] as $k) {
        unset($fields[$k]);
      }
      // Strip admin-only tracking fields
      $tr = $rec['tracking'] ?? [];
      foreach (['medical_date','enjaz_date','bureau_date','wakalah_date','embassy_date','payment_date','confirmed'] as $k) {
        unset($tr[$k]);
      }
      // Only expose passport docs if candidate is confirmed
      $im = $rec['images'] ?? [];
      $confirmed = ($rec['tracking']['confirmed'] ?? false) === true;
      if (!$confirmed) {
        unset($im['doc-passport']);
        unset($im['doc-alteration']);
      }
      json_out(200, ['ok' => true, 'profile' => [
        'id'       => $rec['id'],
        'fields'   => $fields,
        'images'   => $im,
        'tracking' => $tr,
      ]]);
    }
  }

  json_out(404, ['ok' => false, 'error' => 'Profile not found']);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
