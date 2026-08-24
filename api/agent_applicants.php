<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  $agent = require_agent();

  $allowed = $agent['applicantIds'] ?? [];

  // Read profiles from profiles.json (single source of truth)
  $db = read_db();
  $result = [];
  foreach ($db['profiles'] as $rec) {
    $id = $rec['id'] ?? '';
    if ($id === '__global__' || !in_array($id, $allowed, true)) continue;

    $f  = $rec['fields']   ?? [];
    $im = $rec['images']   ?? [];
    $tr = $rec['tracking'] ?? [];
    // Strip admin-only fields before sending to agent
    foreach (['medical_date','enjaz_date','bureau_date','wakalah_date','embassy_date','payment_date','confirmed'] as $k) {
      unset($tr[$k]);
    }

    $result[] = [
      'id'       => $id,
      'name'     => trim($f['f-name'] ?? ''),
      'role'     => $f['f-role']     ?? '',
      'age'      => $f['f-age']      ?? '',
      'headshot' => $im['headshot']  ?? '',
      'tracking' => $tr,
    ];
  }

  json_out(200, [
    'ok'         => true,
    'applicants' => $result,
    'agent'      => [
      'id'      => $agent['id'],
      'name'    => $agent['name'] ?? '',
      'company' => $agent['company'] ?? '',
      'country' => $agent['country'] ?? '',
      'logo'    => $agent['logo']    ?? '',
      'settings' => [
        'allowAgentBrowse' => !empty((read_agents_raw()['settings'] ?? [])['allowAgentBrowse']),
      ],
    ],
  ]);
} catch (Throwable $e) {
  json_out(500, ['ok' => false, 'error' => 'Server error']);
}
