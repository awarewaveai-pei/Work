<?php
/**
 * mainwp-report-parse.php
 *
 * Companion to scripts/sync-backup-status-from-mainwp.sh (EU-side Phase 4 backup sync).
 * Runs INSIDE the mainwp-web container (php 8.2) — the EU host has no php.
 * Invoked via stdin so no script path needs to be mounted into the container:
 *
 *   docker exec -i -e SER="$serialized" mainwp-web php < scripts/lib/mainwp-report-parse.php
 *
 * Input  (env SER): the raw PHP-serialized `report_addon` option_value from
 *                   mwp_mainwp_wpvividmeta (keyed by task_id → {task_id,backup_time,status}).
 * Output (stdout) : compact JSON with the latest Succeeded / latest Failed task plus a
 *                   time-desc history. iso_utc/iso_tpe are computed here (UTC + UTC+8 wall).
 * Exit codes      : 0 ok · 2 unserialize failure · 3 empty/no usable rows.
 *
 * Pure ASCII source — no CJK — so it is locale-safe through the cron→docker pipe.
 */

$ser = getenv('SER');
if ($ser === false || $ser === '') {
    fwrite(STDERR, "parse: empty SER env\n");
    exit(3);
}

$arr = @unserialize($ser);
if ($arr === false || !is_array($arr)) {
    fwrite(STDERR, "parse: unserialize failed\n");
    exit(2);
}

// Collapse a verbose WPvivid status string into a short single-line reason.
// Failed entries embed a full API error JSON blob; keep only the human prefix
// (everything before the first "{"), html-decode, and clamp to 200 chars.
function short_status(string $s): string {
    $brace = strpos($s, '{');
    if ($brace !== false) {
        $s = substr($s, 0, $brace);
    }
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = preg_replace('/\s+/', ' ', $s);
    $s = trim($s);
    if (strlen($s) > 200) {
        $s = substr($s, 0, 197) . '...';
    }
    return $s;
}

function iso_utc(int $t): string { return gmdate('Y-m-d\TH:i:s\Z', $t); }
function iso_tpe(int $t): string { return gmdate('Y-m-d\TH:i:s', $t + 28800) . '+08:00'; }

$succ = null;
$fail = null;
$history = array();

foreach ($arr as $row) {
    if (!is_array($row) || !isset($row['backup_time'], $row['status'])) {
        continue;
    }
    $t      = (int) $row['backup_time'];
    $status = (string) $row['status'];
    $taskId = isset($row['task_id']) ? (string) $row['task_id'] : '';
    $isSucc = stripos($status, 'Succeeded') === 0;
    $isFail = stripos($status, 'Failed') === 0;

    $history[] = array(
        'unix_utc' => $t,
        'iso_utc'  => iso_utc($t),
        'status'   => $isSucc ? 'Succeeded' : ($isFail ? 'Failed' : short_status($status)),
        'reason'   => $isFail ? short_status($status) : null,
    );

    if ($isSucc && ($succ === null || $t > $succ['unix_utc'])) {
        $succ = array(
            'task_id'  => $taskId,
            'unix_utc' => $t,
            'iso_utc'  => iso_utc($t),
            'iso_tpe'  => iso_tpe($t),
            'status'   => 'Succeeded',
        );
    }
    if ($isFail && ($fail === null || $t > $fail['unix_utc'])) {
        $fail = array(
            'task_id'  => $taskId,
            'unix_utc' => $t,
            'iso_utc'  => iso_utc($t),
            'status'   => 'Failed',
            'reason'   => short_status($status),
        );
    }
}

if ($succ === null && $fail === null) {
    fwrite(STDERR, "parse: no Succeeded/Failed rows found\n");
    exit(3);
}

// History: newest first, bounded to 12 entries.
usort($history, function ($a, $b) { return $b['unix_utc'] - $a['unix_utc']; });
$history = array_slice($history, 0, 12);

echo json_encode(array(
    'count'        => count($arr),
    'last_success' => $succ,
    'last_failure' => $fail,
    'history'      => $history,
), JSON_UNESCAPED_SLASHES);
echo "\n";
exit(0);
