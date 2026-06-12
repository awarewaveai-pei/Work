#requires -Version 5.1
<#
.SYNOPSIS
  Monthly CF IP refresh -- updates the ipset on SG with latest CF IP ranges.
  Called by ao-resume.ps1 monthly block. Warn-only, always exits 0.
  Requires: cf-origin-lockdown.sh --apply already run on SG (ipsets must exist).
#>
param([string]$WorkRoot = "")

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot ".."  )).Path }
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
    $sshKey = "$env:USERPROFILE\.ssh\hetzner_trigger"
    if (-not (Test-Path $sshKey)) { $sshKey = "~/.ssh/hetzner_trigger" }
    if (-not (Test-Path $sshKey)) {
        $status = "skip"
        $message = "SSH key not found -- skipped"
    } else {
        $outPath = [System.IO.Path]::GetTempFileName()
        $errPath = [System.IO.Path]::GetTempFileName()
        try {
            # Check if lockdown script exists on SG before running refresh
            $checkCmd = "test -f /root/cf-origin-lockdown.sh && echo EXISTS || echo MISSING"
            $checkArgs = @("-i", $sshKey, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", "root@5.223.93.113", $checkCmd)
            $checkProc = Start-Process -FilePath "ssh" -ArgumentList $checkArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
            $checkOut  = (Get-Content -LiteralPath $outPath -Raw -ErrorAction SilentlyContinue).Trim()
            if ($checkOut -notmatch "EXISTS") {
                $status  = "skip"
                $message = "cf-origin-lockdown.sh not found on SG -- run /origin-lockdown apply first"
            } else {
                # Run --refresh
                $refreshCmd = "bash /root/cf-origin-lockdown.sh --refresh 2>&1"
                $refreshArgs = @("-i", $sshKey, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=30", "root@5.223.93.113", $refreshCmd)
                $proc = Start-Process -FilePath "ssh" -ArgumentList $refreshArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
                $out  = (Get-Content -LiteralPath $outPath -Raw -ErrorAction SilentlyContinue)
                if ($proc.ExitCode -eq 0 -and $out) {
                    # Parse: "ipset cf-ipv4 populated with N ranges"
                    $m4 = [regex]::Match($out, "cf-ipv4 populated with (\d+)")
                    $m6 = [regex]::Match($out, "cf-ipv6 populated with (\d+)")
                    if ($m4.Success) { $v4Ranges = [int]$m4.Groups[1].Value }
                    if ($m6.Success) { $v6Ranges = [int]$m6.Groups[1].Value }
                    $status  = "ok"
                    $message = "Refresh completed: v4=$v4Ranges v6=$v6Ranges"
                } elseif ($proc.ExitCode -ne 0) {
                    $status  = "error"
                    $message = "refresh exited $($proc.ExitCode): $out"
                } else {
                    $status  = "skip"
                    $message = "No output from refresh script"
                }
            }
        } finally {
            Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
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