#requires -Version 5.1
<#
.SYNOPSIS
  Monthly CF IP refresh -- runs /root/scripts/refresh-cf-edge-geo.sh on ks-aw-01 (nginx cf-edge-geo map + cf-realip trust list, one fetch).
  Called by ao-resume.ps1 monthly block. Warn-only, always exits 0.
  (The SG-era iptables/ipset lockdown is history; see runbooks/CLOUDFLARE-WAF-SETUP.md banner.)
#>
param([string]$WorkRoot = "")

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot ".."  )).Path }
    return (Get-Location).Path
}

$root      = Resolve-Root -InputRoot $WorkRoot
$reportDir = Join-Path $root "agency-os\reports\status"
$null      = New-Item -ItemType Directory -Force -Path $reportDir

$status   = "ok"
$v4Ranges = 0
$v6Ranges = 0
$message  = ""

try {
    # 2026-08-28 consolidation: the lockdown moved from SG's ipset (iptables) to an
    # nginx geo map on ks-aw-01. This wrapper now triggers the on-box regenerator
    # (repo SSOT: lobster-factory/infra/ks-aw-01/refresh-cf-edge-geo.sh), which
    # refuses implausibly small lists and rolls back on nginx -t failure.
    $sshKey = "$env:USERPROFILE\.ssh\id_ed25519"
    if (-not (Test-Path $sshKey)) {
        $status = "skip"
        $message = "SSH key not found -- skipped"
    } else {
        # Hard total deadline: a session that connects and then hangs must not block AO-RESUME's monthly run.
        . (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")
        $res = Invoke-SshWithDeadline -SshArgs @("-i", $sshKey, "-p", "58122", "-o", "StrictHostKeyChecking=accept-new", "ubuntu@145.239.195.47", "sudo bash /root/scripts/refresh-cf-edge-geo.sh 2>&1") -DeadlineSec 180 -ConnectTimeoutSec 30
        $out = $res.Stdout
        $m = [regex]::Match([string]$out, "cf-edge-geo refreshed: v4=(\d+) v6=(\d+)")
        if ($res.ExitCode -eq 0 -and $m.Success) {
            $v4Ranges = [int]$m.Groups[1].Value
            $v6Ranges = [int]$m.Groups[2].Value
            $status  = "ok"
            $message = "Refresh completed: v4=$v4Ranges v6=$v6Ranges (nginx geo map on ks-aw-01)"
        } else {
            $status  = "error"
            $message = "refresh exited $($res.ExitCode): $($res.Output)"
        }
    }
} catch {
    $status  = "error"
    $message = "Exception: $($_.Exception.Message)"
}

# measured = 1 only when the on-box refresh ran and its result line parsed; skip/error measured nothing.
. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")
$cfOverall = switch ($status) { "ok" { "PASS" }; "error" { "FAIL" }; default { "UNKNOWN" } }
Write-DetectorArtifact -Path (Join-Path $reportDir "cf-iprefresh-LATEST.json") -Overall $cfOverall -Measured ([int]($status -eq "ok")) -Fields @{
    generated = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    status    = $status
    v4_ranges = $v4Ranges
    v6_ranges = $v6Ranges
    message   = $message
} | Out-Null

$colour = switch ($status) { "ok" { "Green" }; "skip" { "DarkGray" }; default { "Yellow" } }
Write-Host "== CF origin IP refresh: $status (v4=$v4Ranges, v6=$v6Ranges) ==" -ForegroundColor $colour
exit 0
