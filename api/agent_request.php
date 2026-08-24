<?php
declare(strict_types=1);
require_once __DIR__ . '/_lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) json_out(400, ['ok' => false, 'error' => 'Invalid JSON']);

require_agent($body); // just validates the token exists; row-level check happens below with a fresh lock

$token     = $body['token']     ?? '';
$profileId = $body['profileId'] ?? '';
$action    = $body['action']    ?? 'toggle'; // 'request' | 'cancel' | 'toggle'

if (!$token || !$profileId) json_out(400, ['ok' => false, 'error' => 'Missing params']);

$agentsPath = data_dir() . '/agents.json';
$fp = fopen($agentsPath, 'c+');
if (!$fp) json_out(500, ['ok' => false, 'error' => 'Cannot open agents db']);
flock($fp, LOCK_EX);
$raw = '';
rewind($fp);
while (!feof($fp)) $raw .= fread($fp, 8192);
$db = json_decode($raw, true);
if (!is_array($db)) {
  flock($fp, LOCK_UN); fclose($fp);
  json_out(500, ['ok' => false, 'error' => 'Bad agents db']);
}
$agentIdx = null;
foreach ($db['agents'] as $i => $ag) {
  if (!empty($ag['token']) && $ag['token'] === $token && ($ag['active'] ?? true)) { $agentIdx = $i; break; }
}
if ($agentIdx === null) {
  flock($fp, LOCK_UN); fclose($fp);
  json_out(401, ['ok' => false, 'error' => 'Invalid token']);
}
if (empty(($db['settings'] ?? [])['allowAgentBrowse'])) {
  flock($fp, LOCK_UN); fclose($fp);
  json_out(403, ['ok' => false, 'error' => 'Browse requests are disabled']);
}

$ag       = $db['agents'][$agentIdx];
$pending  = $ag['pendingIds']   ?? [];
$assigned = $ag['applicantIds'] ?? [];

if (in_array($profileId, $assigned)) {
  flock($fp, LOCK_UN); fclose($fp);
  json_out(200, ['ok' => true, 'status' => 'assigned']);
}

$isRequested = in_array($profileId, $pending);
if ($action === 'request' || ($action === 'toggle' && !$isRequested)) {
  if (!$isRequested) $pending[] = $profileId;
  $newStatus = 'requested';
} else {
  $pending   = array_values(array_filter($pending, fn($p) => $p !== $profileId));
  $newStatus = 'available';
}

$db['agents'][$agentIdx]['pendingIds'] = $pending;
ftruncate($fp, 0); rewind($fp);
fwrite($fp, json_encode($db, JSON_PRETTY_PRINT));
fflush($fp); flock($fp, LOCK_UN); fclose($fp);

json_out(200, ['ok' => true, 'status' => $newStatus]);
