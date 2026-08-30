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
    # ks-aw-01 (2026-08-28 consolidation target; only production host since 2026-08-30
    # deletion of the SG/EU boxes above). $SgHost/$EuHost/$SshUser/$PrivateKey kept for
    # call-site signature compatibility -- never actually probed any more.
    [string]$KsAw01Host = "149.202.64.114",
    [string]$KsAw01SshUser = "ubuntu",
    [int]$KsAw01SshPort = 58122,
    [string]$KsAw01PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
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
    param(
        [string]$ServerHost,
        [string]$Command,
        [string]$User = $SshUser,
        [string]$Key = $PrivateKey,
        [int]$Port = 22
    )
    $sshArgs = @(
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        "-p", $Port,
        "-i", $Key,
        ("{0}@{1}" -f $User, $ServerHost),
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
    param(
        [string]$ServerHost,
        [bool]$Is53Expected,
        [string]$User = $SshUser,
        [string]$Key = $PrivateKey,
        [int]$Port = 22
    )

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
    $res = Invoke-Ssh -ServerHost $ServerHost -Command $cmd -User $User -Key $Key -Port $Port

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
# 2026-08-30: re-pointed at the single consolidated host ks-aw-01. SG/EU (5.223.93.113 /
# 204.168.175.41) were merged into it 2026-08-28 and deleted at Hetzner console
# 2026-08-30; there is no second host and no 53-stagger conf any more -- one host,
# one Automatic-Reboot-Time. Reuses Get-AutoRebootHealth/Compute-Verdict verbatim
# (previously dead code behind a hard exit 0) with Is53Expected always $false.
$rootPath = Resolve-Root -InputRoot $WorkRoot
$repoSsot52Rel = "lobster-factory\infra\hetzner-phase1-core\auto-reboot\ks-aw-01-auto-reboot.conf"
$ssotSha52 = Get-RepoSsotSha -Root $rootPath -RelPath $repoSsot52Rel

$ks = Get-AutoRebootHealth -ServerHost $KsAw01Host -Is53Expected $false -User $KsAw01SshUser -Key $KsAw01PrivateKey -Port $KsAw01SshPort
$ksVerdict = Compute-Verdict -Snapshot $ks -SsotSha52 $ssotSha52 -SsotSha53 ""

$worstLabel = $ksVerdict.label
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
    ssot = [ordered]@{ sha52 = $ssotSha52 }
    ks_aw_01 = [ordered]@{ snapshot = $ks; verdict = [ordered]@{ label = $ksVerdict.label; reasons = $ksVerdict.reasons; pending = $ksVerdict.pending } }
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
[void]$md.AppendLine("- Boot-outcome notification (separate from this drift check): `` ks-aw-01-boot-health-notify.sh`` fires via Telegram on every boot, automatic or manual.")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Host status")
[void]$md.AppendLine("")
[void]$md.AppendLine("| VPS | Verdict | Auto-Reboot | Time | SSOT 52 | daemon | pending | kernel |")
[void]$md.AppendLine("|-----|---------|-------------|------|---------|--------|---------|--------|")
if (-not $ks.ok) {
    [void]$md.AppendLine("| ks-aw-01 ($KsAw01Host) | $worstIcon $($ksVerdict.label) | - | - | - | - | - | - |")
} else {
    $sha52Cell = Sha-Cell -HostSha $ks.sha52 -RepoSha $ssotSha52
    $pendingCell = if ($ksVerdict.pending) { "$ICON_WARN yes" } else { "no" }
    $daemonCell = "$($ks.daemon_active)/$($ks.daemon_enabled)"
    [void]$md.AppendLine("| ks-aw-01 ($KsAw01Host) | $worstIcon $($ksVerdict.label) | $($ks.ar_on) | $($ks.ar_time) | $sha52Cell | $daemonCell | $pendingCell | $($ks.kernel) |")
}

[void]$md.AppendLine("")
if ($ksVerdict.reasons.Count -gt 0) {
    [void]$md.AppendLine("## Reasons")
    [void]$md.AppendLine("")
    foreach ($r in $ksVerdict.reasons) { [void]$md.AppendLine("- $r") }
    [void]$md.AppendLine("")
}

if ($ksVerdict.pending) {
    [void]$md.AppendLine("## Pending reboot (informational)")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("- ks-aw-01: ``/var/run/reboot-required`` present. Packages: ``$($ks.reboot_pkgs)``. Auto-reboot window: next **20:00 UTC** (= 04:00 TPE).")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("Action: none - let OS handle; ``ks-aw-01-boot-health-notify.sh`` will report the outcome via Telegram once it fires. If marker persists > 16h, AGENTS.md trigger rule escalates to manual ``/ks-aw-01-reboot``.")
    [void]$md.AppendLine("")
}

[void]$md.AppendLine("## Last reboot")
[void]$md.AppendLine("")
[void]$md.AppendLine("- ks-aw-01: $($ks.last_reboot)")
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
    $ksIcon = Icon-For-Label $ksVerdict.label
    Write-Host "  ks-aw-01: $ksIcon $($ksVerdict.label)" -NoNewline
    if ($ksVerdict.pending) { Write-Host " (reboot pending, auto-fire @ 20:00 UTC)" -ForegroundColor Yellow } else { Write-Host "" }
    Write-Host "  Report: agency-os/reports/status/auto-reboot-LATEST.md"
}

exit 0
