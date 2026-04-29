param(
    [string]$AgencyOsRoot = "",
    [string]$SshHost = "204.168.175.41",
    [string]$SshUser = "root",
    [string]$PrivateKeyPath = "$env:USERPROFILE\.ssh\hetzner_trigger",
    [string]$ContainerName = "supabase-studio",
    [double]$WarnPercent = 85.0,
    [double]$FailPercent = 92.0,
    [switch]$FailOnThreshold,
    [switch]$FailOnError
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) { return (Resolve-Path -LiteralPath $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Convert-SizeToBytes {
    param([string]$Value)
    if (-not $Value) { return 0.0 }
    $v = $Value.Trim()
    if ($v -match '^([0-9]+(?:\.[0-9]+)?)\s*([KMGTP]i?B|B)$') {
        $num = [double]$matches[1]
        $unit = $matches[2].ToUpperInvariant()
        switch ($unit) {
            "B" { return $num }
            "KIB" { return $num * 1024.0 }
            "KB" { return $num * 1000.0 }
            "MIB" { return $num * 1024.0 * 1024.0 }
            "MB" { return $num * 1000.0 * 1000.0 }
            "GIB" { return $num * 1024.0 * 1024.0 * 1024.0 }
            "GB" { return $num * 1000.0 * 1000.0 * 1000.0 }
            "TIB" { return $num * 1024.0 * 1024.0 * 1024.0 * 1024.0 }
            "TB" { return $num * 1000.0 * 1000.0 * 1000.0 * 1000.0 }
            default { return 0.0 }
        }
    }
    return 0.0
}

function Invoke-SshCapture {
    param([string]$SshHostValue, [string]$SshUserValue, [string]$KeyPath, [string]$Command)
    $outPath = [System.IO.Path]::GetTempFileName()
    $errPath = [System.IO.Path]::GetTempFileName()
    try {
        $args = @("-o","BatchMode=yes","-o","ConnectTimeout=12","-i",$KeyPath,"$SshUserValue@$SshHostValue",$Command)
        $proc = Start-Process -FilePath "ssh" -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
        return [pscustomobject]@{
            ExitCode = $proc.ExitCode
            StdOut = (Get-Content -LiteralPath $outPath -Raw -ErrorAction SilentlyContinue)
            StdErr = (Get-Content -LiteralPath $errPath -Raw -ErrorAction SilentlyContinue)
        }
    } finally {
        Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
    }
}

$agencyRoot = Resolve-AgencyRoot -InputRoot $AgencyOsRoot
$reportDir = Join-Path $agencyRoot "reports\monthly"
if (-not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$now = Get-Date
$stamp = $now.ToString("yyyyMMdd-HHmmss")
$latest = Join-Path $reportDir "supabase-memory-check-LATEST.md"
$report = Join-Path $reportDir ("supabase-memory-check-" + $stamp + ".md")

$status = "ERROR"
$summary = ""
$usagePercent = 0.0
$usageText = ""
$limitText = ""
$rawMemUsage = ""
$rawLimitBytes = ""
$remoteErr = ""

try {
    $inspect = Invoke-SshCapture -SshHostValue $SshHost -SshUserValue $SshUser -KeyPath $PrivateKeyPath -Command ("docker inspect --format '{{.HostConfig.Memory}}' " + $ContainerName)
    if ($inspect.ExitCode -ne 0) {
        throw ("docker inspect failed: " + $inspect.StdErr.Trim())
    }
    $stats = Invoke-SshCapture -SshHostValue $SshHost -SshUserValue $SshUser -KeyPath $PrivateKeyPath -Command ("docker stats --no-stream --format '{{.MemUsage}}' " + $ContainerName)
    if ($stats.ExitCode -ne 0) {
        throw ("docker stats failed: " + $stats.StdErr.Trim())
    }

    $rawLimitBytes = $inspect.StdOut.Trim()
    $rawMemUsage = ($stats.StdOut.Trim() -split '\r?\n' | Select-Object -First 1).Trim()
    if (-not $rawMemUsage -or $rawMemUsage -notmatch '/') {
        throw ("unexpected docker stats output: " + $rawMemUsage)
    }

    $parts = $rawMemUsage -split '/'
    $usageText = $parts[0].Trim()
    $limitText = $parts[1].Trim()
    $usageBytes = Convert-SizeToBytes -Value $usageText
    $limitBytes = Convert-SizeToBytes -Value $limitText
    if ($limitBytes -le 0) {
        $fallback = [double]($rawLimitBytes -replace '[^\d]','')
        if ($fallback -gt 0) { $limitBytes = $fallback }
    }
    if ($limitBytes -le 0) {
        throw "cannot parse memory limit from docker output"
    }
    $usagePercent = [Math]::Round(($usageBytes / $limitBytes) * 100.0, 2)

    if ($usagePercent -ge $FailPercent) {
        $status = "FAIL"
        $summary = "supabase-studio memory at $usagePercent% (>= $FailPercent%)"
    } elseif ($usagePercent -ge $WarnPercent) {
        $status = "WARN"
        $summary = "supabase-studio memory at $usagePercent% (>= $WarnPercent%)"
    } else {
        $status = "PASS"
        $summary = "supabase-studio memory at $usagePercent% (< $WarnPercent%)"
    }
} catch {
    $status = "ERROR"
    $remoteErr = $_.Exception.Message
    $summary = "supabase memory check failed: $remoteErr"
}

$lines = @()
$lines += "# Supabase Monthly Memory Check"
$lines += ""
$lines += ("- Time: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
$lines += ("- Host: {0}@{1}" -f $SshUser, $SshHost)
$lines += ("- Container: {0}" -f $ContainerName)
$lines += ("- Status: **{0}**" -f $status)
$lines += ("- Summary: {0}" -f $summary)
$lines += ""
$lines += "## Metrics"
$lines += ("- MemUsage (docker): {0}" -f $(if ($rawMemUsage) { $rawMemUsage } else { "N/A" }))
$lines += ("- Usage parsed: {0}" -f $(if ($usageText) { $usageText } else { "N/A" }))
$lines += ("- Limit parsed: {0}" -f $(if ($limitText) { $limitText } else { "N/A" }))
$lines += ("- Limit bytes (inspect): {0}" -f $(if ($rawLimitBytes) { $rawLimitBytes } else { "N/A" }))
$lines += ("- Usage percent: {0}" -f $(if ($usagePercent -gt 0) { ($usagePercent.ToString() + "%") } else { "N/A" }))
if ($remoteErr) {
    $lines += ""
    $lines += "## Error"
    $lines += ("- {0}" -f $remoteErr)
}

$content = $lines -join "`r`n"
Set-Content -LiteralPath $report -Value $content -Encoding UTF8
Set-Content -LiteralPath $latest -Value $content -Encoding UTF8

Write-Output ("RESULT_STATUS={0}" -f $status)
Write-Output ("RESULT_PERCENT={0}" -f $(if ($usagePercent -gt 0) { $usagePercent } else { "N/A" }))
Write-Output ("RESULT_SUMMARY={0}" -f $summary)
Write-Output ("RESULT_REPORT={0}" -f $report.Replace($agencyRoot + "\", ""))

if ($status -eq "ERROR" -and $FailOnError) { exit 3 }
if (($status -eq "WARN" -or $status -eq "FAIL") -and $FailOnThreshold) { exit 2 }
exit 0
