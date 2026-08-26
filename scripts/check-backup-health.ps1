#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$SgHost = "5.223.93.113",
    [string]$EuHost = "204.168.175.41",
    [string]$SshUser = "root",
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\hetzner_trigger"),
    [string]$WorkRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# CP950 protection for ssh stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

function Invoke-Ssh {
    param(
        [Parameter(Mandatory = $true)][string]$ServerHost,
        [Parameter(Mandatory = $true)][string]$Command
    )
    $sshArgs = @(
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        "-i", $PrivateKey,
        ("{0}@{1}" -f $SshUser, $ServerHost),
        $Command
    )
    # Force UTF-8 console for SSH stdout — Big5 locale would mojibake any CJK output bytes
    # and can eat newline bytes inside multi-byte sequences. $LASTEXITCODE propagates.
    $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
    return @{
        ExitCode = $LASTEXITCODE
        Output   = (($out | ForEach-Object { [string]$_ }) -join "`n").Trim()
    }
}

function Parse-ResultLine {
    param([string]$Output, [string]$Key)
    $prefix = $Key + "="
    foreach ($line in ($Output -split "`n")) {
        $t = $line.Trim()
        if ($t.StartsWith($prefix)) {
            return $t.Substring($prefix.Length)
        }
    }
    return ""
}

function Get-HostBackupHealth {
    param(
        [Parameter(Mandatory = $true)][string]$ServerHost,
        [Parameter(Mandatory = $true)][string]$CronPath,
        [Parameter(Mandatory = $true)][string]$BackupScriptPath,
        [Parameter(Mandatory = $true)][string]$BackupDir,
        [Parameter(Mandatory = $true)][string]$VerifyLog
    )

    $parts = @(
        'set -eu',
        ("CRON_PATH='" + $CronPath + "'"),
        ("BACKUP_SCRIPT='" + $BackupScriptPath + "'"),
        ("BACKUP_DIR='" + $BackupDir + "'"),
        ("VERIFY_LOG='" + $VerifyLog + "'"),
        'if [ -f "$CRON_PATH" ]; then cron_status="present"; cron_lines=$(grep -v ''^[[:space:]]*#'' "$CRON_PATH" | grep -v ''^[[:space:]]*$'' || true); if [ -z "$cron_lines" ]; then cron_lines="(empty)"; fi; else cron_status="missing"; cron_lines="(missing)"; fi',
        'retention_days="(unknown)"',
        'retention_source="unknown"',
        'if [ -f "$BACKUP_SCRIPT" ]; then retention_line=$(grep -v ''^[[:space:]]*#'' "$BACKUP_SCRIPT" | grep -E ''[A-Z_]*(RETENTION|RETAIN)[A-Z_]*DAYS[[:space:]]*=|(RETENTION|RETAIN)[A-Z_]*DAYS[^[:alnum:]_]*(:-|:=)'' | head -n 1 || true); if [ -n "$retention_line" ]; then retention_days=$(printf ''%s'' "$retention_line" | grep -Eo ''[0-9]+'' | head -n 1 || true); if [ -z "$retention_days" ]; then ref_var=$(printf ''%s'' "$retention_line" | sed -nE ''s/.*(RETENTION|RETAIN)[A-Z_]*DAYS[[:space:]]*=[[:space:]]*"?\$([A-Za-z_][A-Za-z0-9_]*).*/\2/p''); if [ -n "$ref_var" ]; then ref_line=$(grep -v ''^[[:space:]]*#'' "$BACKUP_SCRIPT" | grep -E "^$ref_var[[:space:]]*=" | head -n 1 || true); retention_days=$(printf ''%s'' "$ref_line" | grep -Eo ''[0-9]+'' | head -n 1 || true); fi; fi; if [ -n "$retention_days" ]; then retention_source="static"; fi; fi; fi',
        'if [ -z "$retention_days" ] || [ "$retention_days" = "(unknown)" ]; then runtime_retention=$(bash -c ''set +e; set +u; source "$1" >/dev/null 2>&1; for k in RETENTION_DAYS LOCAL_RETENTION_DAYS BACKUP_RETENTION_DAYS BACKUP_RETAIN_DAYS KEEP_DAYS; do eval "v=\${$k:-}"; if [ -n "$v" ]; then printf "%s\n" "$v"; exit 0; fi; done; exit 0'' _ "$BACKUP_SCRIPT" 2>/dev/null | grep -Eo ''[0-9]+'' | head -n 1 || true); if [ -n "$runtime_retention" ]; then retention_days="$runtime_retention"; retention_source="runtime"; fi; fi',
        'if [ -z "$retention_days" ] || [ "$retention_days" = "(unknown)" ]; then delete_rule_days=$(grep -v ''^[[:space:]]*#'' "$BACKUP_SCRIPT" | grep -Eo -- ''-mtime[[:space:]]*\+[0-9]+'' | head -n 1 | grep -Eo ''[0-9]+'' || true); if [ -n "$delete_rule_days" ]; then retention_days="$delete_rule_days"; retention_source="delete-rule"; fi; fi',
        'if [ -z "$retention_days" ]; then retention_days="(unknown)"; fi',
        'if [ -d "$BACKUP_DIR" ]; then backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | awk ''{print $1}''); latest_file=$(ls -1t "$BACKUP_DIR" 2>/dev/null | head -n 1 || true); oldest_file=$(ls -1tr "$BACKUP_DIR" 2>/dev/null | head -n 1 || true); if [ -n "$latest_file" ]; then latest_time=$(stat -c ''%y'' "$BACKUP_DIR/$latest_file" | cut -d''.'' -f1); else latest_time="(none)"; fi; if [ -n "$oldest_file" ]; then oldest_time=$(stat -c ''%y'' "$BACKUP_DIR/$oldest_file" | cut -d''.'' -f1); else oldest_time="(none)"; fi; else backup_size="(missing)"; latest_time="(missing)"; oldest_time="(missing)"; fi',
        'backup_age_days="999"; if [ -d "$BACKUP_DIR" ]; then _latest=$(ls -1t "$BACKUP_DIR" 2>/dev/null | head -n 1 || true); if [ -n "$_latest" ]; then _mtime=$(stat -c ''%Y'' "$BACKUP_DIR/$_latest" 2>/dev/null || echo "0"); _now=$(date +%s); backup_age_days=$(( (_now - _mtime) / 86400 )); fi; fi',
        'verify_result="UNKNOWN"; verify_time="(none)"; if [ -f "$VERIFY_LOG" ]; then vline=$(grep -E ''=== verify-backup[a-zA-Z0-9_-]* (PASSED|FAILED)'' "$VERIFY_LOG" 2>/dev/null | tail -n 1 || true); if [ -n "$vline" ]; then if printf ''%s'' "$vline" | grep -q PASSED; then verify_result="PASSED"; else verify_result="FAILED"; fi; verify_time=$(printf ''%s'' "$vline" | grep -oE ''^\[[^]]+\]'' | tr -d ''[]'' || true); if [ -z "$verify_time" ]; then verify_time="(?)"; fi; fi; fi',
        'echo CRON_STATUS=$cron_status',
        'echo "CRON_LINES=$(printf ''%s'' "$cron_lines" | tr ''\n'' ''|'')"',
        'echo RETENTION_DAYS=$retention_days',
        'echo RETENTION_SOURCE=$retention_source',
        'echo BACKUP_SIZE=$backup_size',
        'echo LATEST_TIME=$latest_time',
        'echo OLDEST_TIME=$oldest_time',
        'echo BACKUP_AGE_DAYS=$backup_age_days',
        'echo VERIFY_RESULT=$verify_result',
        'echo VERIFY_TIME=$verify_time'
    )
    $raw = ($parts -join "; ")
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))
    $cmd = "echo $b64 | base64 -d | bash -l"
    $res = Invoke-Ssh -ServerHost $ServerHost -Command $cmd
    if ($res.ExitCode -ne 0) {
        return [ordered]@{
            host             = $ServerHost
            ok               = $false
            error            = $res.Output
            cron_status      = "(error)"
            cron_lines       = "(error)"
            retention_days   = "(error)"
            retention_source = "(error)"
            backup_size      = "(error)"
            latest_time      = "(error)"
            oldest_time      = "(error)"
            backup_age_days  = "999"
            verify_result    = "(error)"
            verify_time      = "(error)"
        }
    }

    return [ordered]@{
        host             = $ServerHost
        ok               = $true
        error            = ""
        cron_status      = Parse-ResultLine -Output $res.Output -Key "CRON_STATUS"
        cron_lines       = Parse-ResultLine -Output $res.Output -Key "CRON_LINES"
        retention_days   = Parse-ResultLine -Output $res.Output -Key "RETENTION_DAYS"
        retention_source = Parse-ResultLine -Output $res.Output -Key "RETENTION_SOURCE"
        backup_size      = Parse-ResultLine -Output $res.Output -Key "BACKUP_SIZE"
        latest_time      = Parse-ResultLine -Output $res.Output -Key "LATEST_TIME"
        oldest_time      = Parse-ResultLine -Output $res.Output -Key "OLDEST_TIME"
        backup_age_days  = Parse-ResultLine -Output $res.Output -Key "BACKUP_AGE_DAYS"
        verify_result    = Parse-ResultLine -Output $res.Output -Key "VERIFY_RESULT"
        verify_time      = Parse-ResultLine -Output $res.Output -Key "VERIFY_TIME"
    }
}

$root = Resolve-Root -InputRoot $WorkRoot
$statusDir = Join-Path $root "agency-os\reports\status"
$null = New-Item -ItemType Directory -Force -Path $statusDir
$stamp = Get-Date

$sshOk = [bool](Get-Command ssh.exe -ErrorAction SilentlyContinue)
$keyOk = Test-Path -LiteralPath $PrivateKey

$sg = $null
$eu = $null
$fatal = $false
$fatalReason = ""

if (-not $sshOk) {
    $fatal = $true
    $fatalReason = "ssh.exe not found on PATH"
} elseif (-not $keyOk) {
    $fatal = $true
    $fatalReason = "SSH private key not found: $PrivateKey"
} else {
    $sg = Get-HostBackupHealth -ServerHost $SgHost -CronPath "/etc/cron.d/lobster-backup" -BackupScriptPath "/root/lobster-phase1/scripts/backup-phase1.sh" -BackupDir "/root/lobster-phase1/backups" -VerifyLog "/var/log/lobster-backup.log"
    $eu = Get-HostBackupHealth -ServerHost $EuHost -CronPath "/etc/cron.d/eu-backup" -BackupScriptPath "/root/scripts/backup-eu-stack.sh" -BackupDir "/root/backups" -VerifyLog "/var/log/eu-backup.log"
}

$sgStale = ($sg -ne $null) -and $sg.ok -and ($sg.backup_age_days -match '^\d+$') -and ([int]$sg.backup_age_days -gt 3)
$euStale = ($eu -ne $null) -and $eu.ok -and ($eu.backup_age_days -match '^\d+$') -and ([int]$eu.backup_age_days -gt 3)
# Verify RESULT (integrity), not just freshness: a backup can be fresh-but-broken.
# Only FAILED escalates to WARN; UNKNOWN (e.g. log rotated / marker not yet present) does NOT false-alarm.
$sgVerifyFail = ($sg -ne $null) -and $sg.ok -and ($sg.verify_result -eq "FAILED")
$euVerifyFail = ($eu -ne $null) -and $eu.ok -and ($eu.verify_result -eq "FAILED")
$overall = if ($fatal) { "ERROR" } elseif (((($sg -ne $null) -and (-not $sg.ok))) -or ((($eu -ne $null) -and (-not $eu.ok)))) { "WARN" } elseif ($sgStale -or $euStale -or $sgVerifyFail -or $euVerifyFail) { "WARN" } else { "PASS" }

$markdown = New-Object System.Text.StringBuilder
[void]$markdown.AppendLine("# Backup health report")
[void]$markdown.AppendLine("")
[void]$markdown.AppendLine("- Generated: " + $stamp.ToString("yyyy-MM-dd HH:mm:ss"))
[void]$markdown.AppendLine("- Overall: **" + $overall + "**")
[void]$markdown.AppendLine("")

if ($fatal) {
    [void]$markdown.AppendLine("## Runtime check")
    [void]$markdown.AppendLine("- Status: **ERROR**")
    [void]$markdown.AppendLine("- Reason: " + $fatalReason)
    [void]$markdown.AppendLine("")
} else {
    foreach ($node in @(
        [ordered]@{ name = "SG"; data = $sg; cron = "/etc/cron.d/lobster-backup" },
        [ordered]@{ name = "EU"; data = $eu; cron = "/etc/cron.d/eu-backup" }
    )) {
        [void]$markdown.AppendLine("## " + $node.name + " (" + $node.data.host + ")")
        if (-not $node.data.ok) {
            [void]$markdown.AppendLine("- Status: **WARN**")
            [void]$markdown.AppendLine("- Error: " + $node.data.error)
            [void]$markdown.AppendLine("")
            continue
        }
        [void]$markdown.AppendLine("- Cron file: " + $node.cron + " => **" + $node.data.cron_status + "**")
        [void]$markdown.AppendLine("- Cron schedule (non-comment lines): " + $node.data.cron_lines)
        [void]$markdown.AppendLine("- Retention days (RETENTION_DAYS): " + $node.data.retention_days + " (source: " + $node.data.retention_source + ")")
        [void]$markdown.AppendLine("- Backup dir size: " + $node.data.backup_size)
        [void]$markdown.AppendLine("- Latest backup file time: " + $node.data.latest_time)
        [void]$markdown.AppendLine("- Oldest backup file time: " + $node.data.oldest_time)
        $ageTag = if ($node.data.backup_age_days -match '^\d+$' -and [int]$node.data.backup_age_days -gt 3) { " STALE" } else { "" }
        [void]$markdown.AppendLine("- Backup age: " + $node.data.backup_age_days + "d" + $ageTag)
        $verifyTag = if ($node.data.verify_result -eq "FAILED") { " **FAILED**" } elseif ($node.data.verify_result -eq "UNKNOWN") { " (unknown)" } else { "" }
        [void]$markdown.AppendLine("- Verify result: " + $node.data.verify_result + " (" + $node.data.verify_time + ")" + $verifyTag)
        [void]$markdown.AppendLine("")
    }
}

$latestPath = Join-Path $statusDir "backup-health-LATEST.md"
$jsonPath = Join-Path $statusDir "backup-health-LATEST.json"

# Dated per-run copy REMOVED 2026-08-26. It was added alongside this check on 2026-05-08
# (eff28b5a) and had accumulated 1,336 files by 2026-08-26 -- while the four sibling checks
# written to the same directory (clickhouse / ci / auto-reboot / smoke) all write LATEST only.
# This was the outlier, not the pattern. Every one of those copies recorded a PASS; backup
# FAILURES are written to WORKLOG with root cause, which is where anyone actually looks.
# Retention for whatever does accumulate here now lives in agency-os/reports/retention.json,
# enforced by scripts/prune-reports.ps1.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($latestPath, $markdown.ToString(), $utf8NoBom)

$payload = [ordered]@{
    generatedAt = $stamp.ToUniversalTime().ToString("o")
    overall     = $overall
    fatal       = $fatal
    fatalReason = $fatalReason
    sg          = $sg
    eu          = $eu
    reportPath  = "agency-os/reports/status/backup-health-LATEST.md"
}
[System.IO.File]::WriteAllText($jsonPath, ($payload | ConvertTo-Json -Depth 6), $utf8NoBom)

if ($Json) {
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host "== Backup health (AO-RESUME companion, warn-only) ==" -ForegroundColor Cyan
    Write-Host ("Overall: " + $overall)
    Write-Host ("Report: " + $payload.reportPath)
    if ($fatal) {
        Write-Host ("Reason: " + $fatalReason) -ForegroundColor Yellow
    } else {
        foreach ($x in @(
            [ordered]@{ name = "SG"; data = $sg },
            [ordered]@{ name = "EU"; data = $eu }
        )) {
            if ($x.data.ok) {
                $ageD = $x.data.backup_age_days
                $stale = ($ageD -match '^\d+$') -and ([int]$ageD -gt 3)
                $vfail = ($x.data.verify_result -eq "FAILED")
                $line = "- " + $x.name + ": cron=" + $x.data.cron_status + ", retention=" + $x.data.retention_days + "d(" + $x.data.retention_source + "), size=" + $x.data.backup_size + ", latest=" + $x.data.latest_time + ", oldest=" + $x.data.oldest_time + ", age=" + $ageD + "d, verify=" + $x.data.verify_result
                if ($stale -or $vfail) {
                    Write-Host ($line + $(if ($stale) { " STALE" } else { "" }) + $(if ($vfail) { " VERIFY-FAILED" } else { "" })) -ForegroundColor Yellow
                } else {
                    Write-Host $line
                }
            } else {
                Write-Host ("- " + $x.name + ": WARN (" + $x.data.error + ")") -ForegroundColor Yellow
            }
        }
    }
}

if ($overall -eq "PASS") { exit 0 }
if ($overall -eq "WARN") { exit 1 }
exit 2
