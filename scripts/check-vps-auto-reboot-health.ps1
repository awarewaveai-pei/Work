#requires -Version 5.1
<#
.SYNOPSIS
SSH SG + EU; verify B-Minimal auto-reboot config integrity; write LATEST report.

.DESCRIPTION
Auto-called by ao-resume.ps1 alongside check-backup-health.ps1 + check-cloudflare-security.ps1.
Writes agency-os/reports/status/auto-reboot-LATEST.md (+ .json).
The operator never needs to remember a slash command - every AO-RESUME surfaces auto-reboot drift here.

Checks per VPS:
  - apt-config Automatic-Reboot 3-tuple
  - 52 + 53 conf SHA256 vs repo SSOT
  - unattended-upgrades daemon active/enabled
  - /var/run/reboot-required marker presence
  - kernel + last reboot time

Verdict per host (worst-of):
  GREEN healthy - all expected, no drift, no pending reboot
  YELLOW drift  - SSOT SHA256 mismatch OR unexpected apt-config value
  RED broken    - daemon stopped OR 52 conf missing
  pending       - reboot-required marker exists (informational; not a failure)

Exit code: always 0 (warn-only, same convention as backup-health + cf-security).

.NOTES
SSOT: lobster-factory/infra/hetzner-phase1-core/auto-reboot/
Runbook: runbooks/VPS-AUTO-REBOOT-RUNBOOK.md
Slash command (manual ad-hoc): /auto-reboot-status

PS5.1 source-encoding rule: do NOT use unicode emoji in source code. Big5 console
parser will crash on multi-byte chars without BOM. Use ASCII labels internally;
map to emoji only at MD-output time via WriteAllText UTF8.
#>
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

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

# Verdict-to-emoji map (kept here so we never write emoji literals in source).
$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle
$ICON_WARN    = [char]0x26A0                       # warning sign
$ICON_CHECK   = [char]0x2713                       # check mark

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
    param([string]$ServerHost, [string]$Command)
    $sshArgs = @(
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        "-i", $PrivateKey,
        ("{0}@{1}" -f $SshUser, $ServerHost),
        $Command
    )
    $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
    return @{
        ExitCode = $LASTEXITCODE
        Output   = (($out | ForEach-Object { [string]$_ }) -join "`n").Trim()
    }
}

function Parse-Kv {
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

function Get-RepoSsotSha {
    param([string]$Root, [string]$RelPath)
    $full = Join-Path $Root $RelPath
    if (-not (Test-Path -LiteralPath $full)) { return "" }
    try {
        return (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLower()
    } catch {
        return ""
    }
}

function Get-AutoRebootHealth {
    param([string]$ServerHost, [bool]$Is53Expected)

    $parts = @(
        'set -eu',
        'AR=$(apt-config dump 2>/dev/null | grep -E ''^Unattended-Upgrade::Automatic-Reboot'' || true)',
        'AR_ON=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot "'' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        'AR_TIME=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot-Time '' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        'AR_USERS=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot-WithUsers '' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        'SHA52=$(sha256sum /etc/apt/apt.conf.d/52awarewave-auto-reboot 2>/dev/null | awk ''{print $1}'')',
        'SHA53=$(sha256sum /etc/apt/apt.conf.d/53awarewave-stagger-eu.conf 2>/dev/null | awk ''{print $1}'')',
        'DAEMON_ACTIVE=$(systemctl is-active unattended-upgrades 2>/dev/null || echo "unknown")',
        'DAEMON_ENABLED=$(systemctl is-enabled unattended-upgrades 2>/dev/null || echo "unknown")',
        'if [ -f /var/run/reboot-required ]; then REBOOT_PENDING=1; REBOOT_PKGS=$(tr ''\n'' '','' < /var/run/reboot-required.pkgs 2>/dev/null | sed ''s/,$//'' || echo ""); else REBOOT_PENDING=0; REBOOT_PKGS=""; fi',
        'KERNEL=$(uname -r)',
        'LAST_REBOOT=$(last reboot 2>/dev/null | head -n1 | tr -s '' '' | cut -d'' '' -f5-9 || echo "unknown")',
        'echo "AR_ON=$AR_ON"',
        'echo "AR_TIME=$AR_TIME"',
        'echo "AR_USERS=$AR_USERS"',
        'echo "SHA52=$SHA52"',
        'echo "SHA53=$SHA53"',
        'echo "DAEMON_ACTIVE=$DAEMON_ACTIVE"',
        'echo "DAEMON_ENABLED=$DAEMON_ENABLED"',
        'echo "REBOOT_PENDING=$REBOOT_PENDING"',
        'echo "REBOOT_PKGS=$REBOOT_PKGS"',
        'echo "KERNEL=$KERNEL"',
        'echo "LAST_REBOOT=$LAST_REBOOT"'
    )
    $raw = ($parts -join "; ")
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))
    $cmd = "echo $b64 | base64 -d | bash -l"
    $res = Invoke-Ssh -ServerHost $ServerHost -Command $cmd

    if ($res.ExitCode -ne 0) {
        return [ordered]@{
            host = $ServerHost
            ok = $false
            error = $res.Output
        }
    }

    $out = $res.Output
    return [ordered]@{
        host           = $ServerHost
        ok             = $true
        ar_on          = (Parse-Kv $out "AR_ON")
        ar_time        = (Parse-Kv $out "AR_TIME")
        ar_users       = (Parse-Kv $out "AR_USERS")
        sha52          = (Parse-Kv $out "SHA52")
        sha53          = (Parse-Kv $out "SHA53")
        daemon_active  = (Parse-Kv $out "DAEMON_ACTIVE")
        daemon_enabled = (Parse-Kv $out "DAEMON_ENABLED")
        reboot_pending = (Parse-Kv $out "REBOOT_PENDING")
        reboot_pkgs    = (Parse-Kv $out "REBOOT_PKGS")
        kernel         = (Parse-Kv $out "KERNEL")
        last_reboot    = (Parse-Kv $out "LAST_REBOOT")
        expect_53      = $Is53Expected
    }
}

function Compute-Verdict {
    param($Snapshot, [string]$SsotSha52, [string]$SsotSha53)
    if (-not $Snapshot.ok) {
        return @{ label = "broken"; reasons = @("ssh_error: " + $Snapshot.error); pending = $false }
    }

    $reasons = New-Object System.Collections.Generic.List[string]
    $label = "healthy"

    if ($Snapshot.daemon_active -ne "active") {
        $reasons.Add("daemon not active (=" + $Snapshot.daemon_active + ")")
        $label = "broken"
    }
    if (-not $Snapshot.sha52) {
        $reasons.Add("52awarewave-auto-reboot conf MISSING")
        $label = "broken"
    }

    if ($label -ne "broken") {
        if ($Snapshot.ar_on -ne "true") {
            $reasons.Add("Automatic-Reboot=" + $Snapshot.ar_on + " (expected true)")
            $label = "drift"
        }
        if ($SsotSha52 -and $Snapshot.sha52 -and ($Snapshot.sha52 -ne $SsotSha52)) {
            $reasons.Add("52 SHA256 mismatch (host=" + $Snapshot.sha52.Substring(0,12) + " vs repo=" + $SsotSha52.Substring(0,12) + ")")
            $label = "drift"
        }
        if ($Snapshot.expect_53) {
            if (-not $Snapshot.sha53) {
                $reasons.Add("53 stagger conf MISSING (expected on this host)")
                $label = "drift"
            } elseif ($SsotSha53 -and ($Snapshot.sha53 -ne $SsotSha53)) {
                $reasons.Add("53 SHA256 mismatch")
                $label = "drift"
            }
            if ($Snapshot.ar_time -ne "20:30") {
                $reasons.Add("Automatic-Reboot-Time=" + $Snapshot.ar_time + " (expected 20:30 from 53 override)")
                $label = "drift"
            }
        } else {
            if ($Snapshot.sha53) {
                $reasons.Add("53 stagger conf UNEXPECTED on this host (should be EU only)")
                $label = "drift"
            }
            if ($Snapshot.ar_time -ne "20:00") {
                $reasons.Add("Automatic-Reboot-Time=" + $Snapshot.ar_time + " (expected 20:00)")
                $label = "drift"
            }
        }
    }

    $pending = ($Snapshot.reboot_pending -eq "1")

    return @{
        label   = $label
        reasons = $reasons
        pending = $pending
    }
}

function Icon-For-Label {
    param([string]$Label)
    switch ($Label) {
        "healthy" { return $ICON_HEALTHY }
        "drift"   { return $ICON_DRIFT }
        "broken"  { return $ICON_BROKEN }
        default   { return "?" }
    }
}

function Sha-Cell {
    param([string]$HostSha, [string]$RepoSha, [string]$NaIfMissing = "missing")
    if (-not $HostSha) { return $NaIfMissing }
    if ($RepoSha -and ($HostSha -eq $RepoSha)) { return $ICON_CHECK }
    return "drift"
}

# Main
$rootPath = Resolve-Root -InputRoot $WorkRoot
$repoSsot52Rel = "lobster-factory\infra\hetzner-phase1-core\auto-reboot\52awarewave-auto-reboot.conf"
$repoSsot53Rel = "lobster-factory\infra\hetzner-phase1-core\auto-reboot\53awarewave-stagger-eu.conf"
$ssotSha52 = Get-RepoSsotSha -Root $rootPath -RelPath $repoSsot52Rel
$ssotSha53 = Get-RepoSsotSha -Root $rootPath -RelPath $repoSsot53Rel

$sg = Get-AutoRebootHealth -ServerHost $SgHost -Is53Expected $false
$eu = Get-AutoRebootHealth -ServerHost $EuHost -Is53Expected $true

$sgVerdict = Compute-Verdict -Snapshot $sg -SsotSha52 $ssotSha52 -SsotSha53 $ssotSha53
$euVerdict = Compute-Verdict -Snapshot $eu -SsotSha52 $ssotSha52 -SsotSha53 $ssotSha53

$worstLabel = "healthy"
foreach ($v in @($sgVerdict, $euVerdict)) {
    if ($v.label -eq "broken") { $worstLabel = "broken" }
    elseif ($v.label -eq "drift" -and $worstLabel -ne "broken") { $worstLabel = "drift" }
}
$worstUserLabel = switch ($worstLabel) {
    "healthy" { "PASS" }
    "drift"   { "WARN" }
    "broken"  { "FAIL" }
    default   { "UNKNOWN" }
}
$worstIcon = Icon-For-Label $worstLabel

$genUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
$reportDir = Join-Path $rootPath "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }

# JSON output
$jsonObj = [ordered]@{
    generated_utc = $genUtc
    overall_label = $worstLabel
    overall_user  = $worstUserLabel
    ssot = [ordered]@{ sha52 = $ssotSha52; sha53 = $ssotSha53 }
    sg = [ordered]@{ snapshot = $sg; verdict = [ordered]@{ label = $sgVerdict.label; reasons = $sgVerdict.reasons; pending = $sgVerdict.pending } }
    eu = [ordered]@{ snapshot = $eu; verdict = [ordered]@{ label = $euVerdict.label; reasons = $euVerdict.reasons; pending = $euVerdict.pending } }
}
$jsonPath = Join-Path $reportDir "auto-reboot-LATEST.json"
$jsonText = ($jsonObj | ConvertTo-Json -Depth 8)
[System.IO.File]::WriteAllText($jsonPath, $jsonText, [System.Text.UTF8Encoding]::new($false))

# Markdown report
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# VPS auto-reboot health")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generated: $genUtc UTC")
[void]$md.AppendLine("- **Overall: $worstIcon $worstUserLabel**")
[void]$md.AppendLine("- SSOT: ``lobster-factory/infra/hetzner-phase1-core/auto-reboot/``")
[void]$md.AppendLine("- Runbook: ``runbooks/VPS-AUTO-REBOOT-RUNBOOK.md``")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Per-host status")
[void]$md.AppendLine("")
[void]$md.AppendLine("| VPS | Verdict | Auto-Reboot | Time | SSOT 52 | SSOT 53 | daemon | pending | kernel |")
[void]$md.AppendLine("|-----|---------|-------------|------|---------|---------|--------|---------|--------|")

$pairs = @(
    @{ name = "SG ($SgHost)"; snap = $sg; verdict = $sgVerdict },
    @{ name = "EU ($EuHost)"; snap = $eu; verdict = $euVerdict }
)
foreach ($p in $pairs) {
    $snap = $p.snap
    $v = $p.verdict
    $icon = Icon-For-Label $v.label
    if (-not $snap.ok) {
        [void]$md.AppendLine("| $($p.name) | $icon $($v.label) | - | - | - | - | - | - | - |")
        continue
    }
    $sha52Cell = Sha-Cell -HostSha $snap.sha52 -RepoSha $ssotSha52
    if (-not $snap.expect_53) {
        $sha53Cell = if ($snap.sha53) { "unexpected" } else { "n/a" }
    } else {
        $sha53Cell = Sha-Cell -HostSha $snap.sha53 -RepoSha $ssotSha53
    }
    $pendingCell = if ($v.pending) { "$ICON_WARN yes" } else { "no" }
    $daemonCell = "$($snap.daemon_active)/$($snap.daemon_enabled)"
    [void]$md.AppendLine("| $($p.name) | $icon $($v.label) | $($snap.ar_on) | $($snap.ar_time) | $sha52Cell | $sha53Cell | $daemonCell | $pendingCell | $($snap.kernel) |")
}

[void]$md.AppendLine("")
$anyReasons = ($sgVerdict.reasons.Count -gt 0) -or ($euVerdict.reasons.Count -gt 0)
if ($anyReasons) {
    [void]$md.AppendLine("## Reasons")
    [void]$md.AppendLine("")
    foreach ($p in $pairs) {
        if ($p.verdict.reasons.Count -gt 0) {
            $picon = Icon-For-Label $p.verdict.label
            [void]$md.AppendLine("**$($p.name)** ($picon $($p.verdict.label)):")
            foreach ($r in $p.verdict.reasons) {
                [void]$md.AppendLine("- $r")
            }
            [void]$md.AppendLine("")
        }
    }
}

$anyPending = $sgVerdict.pending -or $euVerdict.pending
if ($anyPending) {
    [void]$md.AppendLine("## Pending reboot (informational)")
    [void]$md.AppendLine("")
    if ($sgVerdict.pending) {
        [void]$md.AppendLine("- SG: ``/var/run/reboot-required`` present. Packages: ``$($sg.reboot_pkgs)``. Auto-reboot window: next **20:00 UTC** (= 04:00 TPE).")
    }
    if ($euVerdict.pending) {
        [void]$md.AppendLine("- EU: ``/var/run/reboot-required`` present. Packages: ``$($eu.reboot_pkgs)``. Auto-reboot window: next **20:30 UTC** (= 04:30 TPE).")
    }
    [void]$md.AppendLine("")
    [void]$md.AppendLine("Action: none - let OS handle. If marker persists > 16h, AGENTS.md trigger rule escalates to manual ``/sg-reboot`` or ``/eu-reboot``.")
    [void]$md.AppendLine("")
}

[void]$md.AppendLine("## Last reboot")
[void]$md.AppendLine("")
[void]$md.AppendLine("- SG: $($sg.last_reboot)")
[void]$md.AppendLine("- EU: $($eu.last_reboot)")
[void]$md.AppendLine("")
[void]$md.AppendLine("---")
[void]$md.AppendLine("")
[void]$md.AppendLine("_Auto-generated by ``scripts/check-vps-auto-reboot-health.ps1`` on every AO-RESUME. Manual ad-hoc: ``/auto-reboot-status``._")

$mdPath = Join-Path $reportDir "auto-reboot-LATEST.md"
[System.IO.File]::WriteAllText($mdPath, $md.ToString(), [System.Text.UTF8Encoding]::new($false))

if ($Json) {
    Write-Output $jsonText
} else {
    Write-Host ""
    $color = switch ($worstLabel) {
        "healthy" { "Green" }
        "drift"   { "Yellow" }
        "broken"  { "Red" }
        default   { "White" }
    }
    Write-Host "== VPS auto-reboot health: $worstIcon $worstUserLabel ==" -ForegroundColor $color
    $sgIcon = Icon-For-Label $sgVerdict.label
    $euIcon = Icon-For-Label $euVerdict.label
    Write-Host "  SG: $sgIcon $($sgVerdict.label)" -NoNewline
    if ($sgVerdict.pending) { Write-Host " (reboot pending, auto-fire @ 20:00 UTC)" -ForegroundColor Yellow } else { Write-Host "" }
    Write-Host "  EU: $euIcon $($euVerdict.label)" -NoNewline
    if ($euVerdict.pending) { Write-Host " (reboot pending, auto-fire @ 20:30 UTC)" -ForegroundColor Yellow } else { Write-Host "" }
    Write-Host "  Report: agency-os/reports/status/auto-reboot-LATEST.md"
}

exit 0
