#requires -Version 5.1
<#
.SYNOPSIS
  Monthly CF IP refresh -- runs /root/scripts/refresh-cf-edge-geo.sh on ks-aw-01 (nginx cf-edge-geo map).
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
        $outPath = [System.IO.Path]::GetTempFileName()
        $errPath = [System.IO.Path]::GetTempFileName()
        try {
            $refreshArgs = @("-i", $sshKey, "-p", "58122", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=30", "ubuntu@145.239.195.47", "sudo bash /root/scripts/refresh-cf-edge-geo.sh 2>&1")
            $proc = Start-Process -FilePath "ssh" -ArgumentList $refreshArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
            $out  = (Get-Content -LiteralPath $outPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
            $m = [regex]::Match([string]$out, "cf-edge-geo refreshed: v4=(\d+) v6=(\d+)")
            if ($proc.ExitCode -eq 0 -and $m.Success) {
                $v4Ranges = [int]$m.Groups[1].Value
                $v6Ranges = [int]$m.Groups[2].Value
                $status  = "ok"
                $message = "Refresh completed: v4=$v4Ranges v6=$v6Ranges (nginx geo map on ks-aw-01)"
            } else {
                $status  = "error"
                $message = "refresh exited $($proc.ExitCode): $out"
            }
        } finally {
            Remove-Item -LiteralPath $outPath, $errPath -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    $status  = "error"
    $message = "Exception: $($_.Exception.Message)"
}

$payload = @{
    generated = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    status    = $status
    v4_ranges = $v4Ranges
    v6_ranges = $v6Ranges
    message   = $message
} | ConvertTo-Json -Compress

Set-Content -Path (Join-Path $reportDir "cf-iprefresh-LATEST.json") -Value $payload -Encoding UTF8

$colour = switch ($status) { "ok" { "Green" }; "skip" { "DarkGray" }; default { "Yellow" } }
Write-Host "== CF origin IP refresh: $status (v4=$v4Ranges, v6=$v6Ranges) ==" -ForegroundColor $colour
exit 0
