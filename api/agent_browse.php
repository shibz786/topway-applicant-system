<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$agent = require_agent();
$agentsDb = read_agents_raw();
if (empty($agentsDb['settings']['allowAgentBrowse'])) {
  json_out(200, ['ok' => true, 'profiles' => [], 'allowAgentBrowse' => false]);
}

$assignedIds = $agent['applicantIds'] ?? [];
$pendingIds  = $agent['pendingIds']   ?? [];

$db = read_db();
$result = [];
foreach ($db['profiles'] as $rec) {
  $id = $rec['id'] ?? '';
  if ($id === '__global__' || $id === '') continue;
  $f  = $rec['fields']   ?? [];
  $im = $rec['images']   ?? [];
  $tr = $rec['tracking'] ?? [];
  $pipelineStatus = $tr['pipelineStatus'] ?? '';
  $isAssigned = in_array($id, $assignedIds, true);
  if ($pipelineStatus === 'sent' && !$isAssigned) continue;

  $status = 'available';
  if ($isAssigned) $status = 'assigned';
  elseif (in_array($id, $pendingIds, true)) $status = 'requested';

  $result[] = [
    'id'         => $id,
    'name'       => trim($f['f-name'] ?? ''),
    'role'       => $f['f-role']      ?? '',
    'age'        => $f['f-age']       ?? '',
    'headshot'   => $im['headshot']   ?? '',
    'experience' => $tr['experience'] ?? '',
    'pipelineStatus' => $pipelineStatus,
    'status'     => $status,
  ];
}

json_out(200, ['ok' => true, 'profiles' => $result, 'allowAgentBrowse' => true]);
