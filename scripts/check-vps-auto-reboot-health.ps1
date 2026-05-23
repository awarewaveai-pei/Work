#requires -Version 5.1
<#
.SYNOPSIS
SSH SG + EU; verify B-Minimal auto-reboot config integrity; write LATEST report.

.DESCRIPTION
Auto-called by ao-resume.ps1 (alongside check-backup-health.ps1 + check-cloudflare-security.ps1).
Writes agency-os/reports/status/auto-reboot-LATEST.md (+ .json).
The operator never needs to remember a slash command — every AO-RESUME surfaces auto-reboot drift here.

Checks per VPS:
  - apt-config Automatic-Reboot 3-tuple
  - 52 + 53 conf SHA256 vs repo SSOT
  - unattended-upgrades daemon active/enabled
  - /var/run/reboot-required marker presence
  - kernel + last reboot time

Verdict per host (worst-of):
  🟢 healthy — all expected, no drift, no pending reboot
  🟡 drift   — SSOT SHA256 mismatch OR unexpected apt-config value
  🔴 broken  — daemon stopped OR 52 conf missing
  ⚠ pending — reboot-required marker exists (informational; not a failure)

Exit code: always 0 (warn-only, same convention as backup-health + cf-security).

.NOTES
SSOT: lobster-factory/infra/hetzner-phase1-core/auto-reboot/
Runbook: runbooks/VPS-AUTO-REBOOT-RUNBOOK.md
Slash command (manual ad-hoc): /auto-reboot-status
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

# CP950 protection for ssh stdout capture.
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
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

    # Single base64-encoded bash gathers everything in one round-trip.
    $parts = @(
        'set -eu',
        # 1. apt-config Automatic-Reboot keys (ground truth)
        'AR=$(apt-config dump 2>/dev/null | grep -E ''^Unattended-Upgrade::Automatic-Reboot'' || true)',
        'AR_ON=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot "'' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        'AR_TIME=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot-Time '' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        'AR_USERS=$(echo "$AR" | grep ''^Unattended-Upgrade::Automatic-Reboot-WithUsers '' | head -n1 | sed ''s/.*"\(.*\)";/\1/'')',
        # 2. SHA256 of conf files (empty string if missing)
        'SHA52=$(sha256sum /etc/apt/apt.conf.d/52awarewave-auto-reboot 2>/dev/null | awk ''{print $1}'')',
        'SHA53=$(sha256sum /etc/apt/apt.conf.d/53awarewave-stagger-eu.conf 2>/dev/null | awk ''{print $1}'')',
        # 3. daemon
        'DAEMON_ACTIVE=$(systemctl is-active unattended-upgrades 2>/dev/null || echo "unknown")',
        'DAEMON_ENABLED=$(systemctl is-enabled unattended-upgrades 2>/dev/null || echo "unknown")',
        # 4. pending reboot
        'if [ -f /var/run/reboot-required ]; then REBOOT_PENDING=1; REBOOT_PKGS=$(tr ''\n'' '','' < /var/run/reboot-required.pkgs 2>/dev/null | sed ''s/,$//'' || echo ""); else REBOOT_PENDING=0; REBOOT_PKGS=""; fi',
        # 5. kernel + last reboot
        'KERNEL=$(uname -r)',
        'LAST_REBOOT=$(last reboot 2>/dev/null | head -n1 | tr -s '' '' | cut -d'' '' -f5-9 || echo "unknown")',
        # Emit
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
            verdict = "ssh_error"
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
    param($Host_, [string]$SsotSha52, [string]$SsotSha53)
    if (-not $Host_.ok) { return @{ icon = "🔴"; label = "broken"; reasons = @("ssh_error: " + $Host_.error) } }

    $reasons = New-Object System.Collections.Generic.List[string]
    $icon = "🟢"
    $label = "healthy"

    # 🔴 broken conditions
    if ($Host_.daemon_active -ne "active") {
        $reasons.Add("daemon not active (=" + $Host_.daemon_active + ")")
        $icon = "🔴"; $label = "broken"
    }
    if (-not $Host_.sha52) {
        $reasons.Add("52awarewave-auto-reboot conf MISSING")
        $icon = "🔴"; $label = "broken"
    }

    # 🟡 drift conditions (don't override broken)
    if ($label -ne "broken") {
        if ($Host_.ar_on -ne "true") {
            $reasons.Add("Automatic-Reboot=" + $Host_.ar_on + " (expected true)")
            $icon = "🟡"; $label = "drift"
        }
        if ($SsotSha52 -and $Host_.sha52 -and ($Host_.sha52 -ne $SsotSha52)) {
            $reasons.Add("52 SHA256 mismatch (host=" + $Host_.sha52.Substring(0,12) + " vs repo=" + $SsotSha52.Substring(0,12) + ")")
            $icon = "🟡"; $label = "drift"
        }
        if ($Host_.expect_53) {
            if (-not $Host_.sha53) {
                $reasons.Add("53 stagger conf MISSING (expected on this host)")
                $icon = "🟡"; $label = "drift"
            } elseif ($SsotSha53 -and ($Host_.sha53 -ne $SsotSha53)) {
                $reasons.Add("53 SHA256 mismatch")
                $icon = "🟡"; $label = "drift"
            }
            if ($Host_.ar_time -ne "20:30") {
                $reasons.Add("Automatic-Reboot-Time=" + $Host_.ar_time + " (expected 20:30 from 53 override)")
                $icon = "🟡"; $label = "drift"
            }
        } else {
            if ($Host_.sha53) {
                $reasons.Add("53 stagger conf UNEXPECTED on this host (should be EU only)")
                $icon = "🟡"; $label = "drift"
            }
            if ($Host_.ar_time -ne "20:00") {
                $reasons.Add("Automatic-Reboot-Time=" + $Host_.ar_time + " (expected 20:00)")
                $icon = "🟡"; $label = "drift"
            }
        }
    }

    # ⚠ pending is informational (orthogonal to verdict)
    $pending = ($Host_.reboot_pending -eq "1")

    return @{
        icon    = $icon
        label   = $label
        reasons = $reasons
        pending = $pending
    }
}

# Main
$rootPath = Resolve-Root -InputRoot $WorkRoot
$repoSsot52 = Join-Path "lobster-factory" "infra\hetzner-phase1-core\auto-reboot\52awarewave-auto-reboot.conf"
$repoSsot53 = Join-Path "lobster-factory" "infra\hetzner-phase1-core\auto-reboot\53awarewave-stagger-eu.conf"
$ssotSha52 = Get-RepoSsotSha -Root $rootPath -RelPath $repoSsot52
$ssotSha53 = Get-RepoSsotSha -Root $rootPath -RelPath $repoSsot53

$sg = Get-AutoRebootHealth -ServerHost $SgHost -Is53Expected $false
$eu = Get-AutoRebootHealth -ServerHost $EuHost -Is53Expected $true

$sgVerdict = Compute-Verdict -Host_ $sg -SsotSha52 $ssotSha52 -SsotSha53 $ssotSha53
$euVerdict = Compute-Verdict -Host_ $eu -SsotSha52 $ssotSha52 -SsotSha53 $ssotSha53

# Worst-of for overall
$worst = "🟢"; $worstLabel = "PASS"
foreach ($v in @($sgVerdict, $euVerdict)) {
    if ($v.icon -eq "🔴") { $worst = "🔴"; $worstLabel = "FAIL" }
    elseif ($v.icon -eq "🟡" -and $worst -ne "🔴") { $worst = "🟡"; $worstLabel = "WARN" }
}

$genUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
$reportDir = Join-Path $rootPath "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }

# JSON output
$jsonObj = [ordered]@{
    generated_utc  = $genUtc
    overall_icon   = $worst
    overall_label  = $worstLabel
    ssot = [ordered]@{
        sha52 = $ssotSha52
        sha53 = $ssotSha53
    }
    sg = [ordered]@{
        host    = $sg
        verdict = $sgVerdict
    }
    eu = [ordered]@{
        host    = $eu
        verdict = $euVerdict
    }
}
$jsonPath = Join-Path $reportDir "auto-reboot-LATEST.json"
$jsonText = ($jsonObj | ConvertTo-Json -Depth 8)
[System.IO.File]::WriteAllText($jsonPath, $jsonText, [System.Text.UTF8Encoding]::new($false))

# Markdown report (for AO-RESUME human-reading + Phase 4 + visual scan)
$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# VPS auto-reboot health")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generated: $genUtc UTC")
[void]$md.AppendLine("- **Overall: $worst $worstLabel**")
[void]$md.AppendLine("- SSOT: ``lobster-factory/infra/hetzner-phase1-core/auto-reboot/``")
[void]$md.AppendLine("- Runbook: ``runbooks/VPS-AUTO-REBOOT-RUNBOOK.md``")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Per-host status")
[void]$md.AppendLine("")
[void]$md.AppendLine("| VPS | Verdict | Auto-Reboot | Time | SSOT 52 | SSOT 53 | daemon | pending | kernel |")
[void]$md.AppendLine("|-----|---------|-------------|------|---------|---------|--------|---------|--------|")

foreach ($pair in @(@{ name="SG ($SgHost)"; h=$sg; v=$sgVerdict }, @{ name="EU ($EuHost)"; h=$eu; v=$euVerdict })) {
    $h = $pair.h
    $v = $pair.v
    if (-not $h.ok) {
        [void]$md.AppendLine("| $($pair.name) | $($v.icon) $($v.label) | - | - | - | - | - | - | - |")
        continue
    }
    $sha52Status = if ($h.sha52 -and $ssotSha52 -and ($h.sha52 -eq $ssotSha52)) { "✓" } elseif (-not $h.sha52) { "missing" } else { "drift" }
    $sha53Status = if (-not $h.expect_53) {
        if ($h.sha53) { "unexpected" } else { "n/a" }
    } else {
        if ($h.sha53 -and $ssotSha53 -and ($h.sha53 -eq $ssotSha53)) { "✓" } elseif (-not $h.sha53) { "missing" } else { "drift" }
    }
    $pendingDisp = if ($v.pending) { "⚠ yes" } else { "no" }
    [void]$md.AppendLine("| $($pair.name) | $($v.icon) $($v.label) | $($h.ar_on) | $($h.ar_time) | $sha52Status | $sha53Status | $($h.daemon_active)/$($h.daemon_enabled) | $pendingDisp | $($h.kernel) |")
}

[void]$md.AppendLine("")
[void]$md.AppendLine("## Reasons (if not 🟢)")
[void]$md.AppendLine("")
foreach ($pair in @(@{ name="SG"; v=$sgVerdict }, @{ name="EU"; v=$euVerdict })) {
    if ($pair.v.reasons.Count -gt 0) {
        [void]$md.AppendLine("**$($pair.name)** ($($pair.v.icon) $($pair.v.label)):")
        foreach ($r in $pair.v.reasons) {
            [void]$md.AppendLine("- $r")
        }
        [void]$md.AppendLine("")
    }
}
# Pending block (informational; not a failure)
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
    [void]$md.AppendLine("Action: none — let OS handle. If marker persists > 16h, AGENTS.md trigger rule escalates to manual ``/sg-reboot`` or ``/eu-reboot``.")
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
    Write-Host "== VPS auto-reboot health: $worst $worstLabel ==" -ForegroundColor $(if ($worst -eq "🟢") { "Green" } elseif ($worst -eq "🟡") { "Yellow" } else { "Red" })
    Write-Host "  SG: $($sgVerdict.icon) $($sgVerdict.label)" -NoNewline
    if ($sgVerdict.pending) { Write-Host " (reboot pending, auto-fire @ 20:00 UTC)" -ForegroundColor Yellow } else { Write-Host "" }
    Write-Host "  EU: $($euVerdict.icon) $($euVerdict.label)" -NoNewline
    if ($euVerdict.pending) { Write-Host " (reboot pending, auto-fire @ 20:30 UTC)" -ForegroundColor Yellow } else { Write-Host "" }
    Write-Host "  Report: agency-os/reports/status/auto-reboot-LATEST.md"
}

exit 0
