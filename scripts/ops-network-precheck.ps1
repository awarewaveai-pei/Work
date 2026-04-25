param(
    [string]$AppBaseUrl = "https://app.aware-wave.com",
    [string]$SupabaseUrl = "https://supabase.aware-wave.com",
    [string]$ApiHealthUrl = "https://api.aware-wave.com/health",
    [int]$TimeoutSec = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-HostFromUrl {
    param([string]$Url)
    try {
        return ([System.Uri]$Url).Host
    } catch {
        return ""
    }
}

function Test-Http {
    param(
        [string]$Name,
        [string]$Url,
        [int[]]$AcceptCodes
    )
    $statusText = ""
    $stderrText = ""
    try {
        $statusText = (& curl.exe -L -sS -o NUL -w "%{http_code}" --connect-timeout $TimeoutSec --max-time $TimeoutSec $Url 2>"$env:TEMP\ops-network-precheck-curl.err")
        if (Test-Path "$env:TEMP\ops-network-precheck-curl.err") {
            $stderrText = (Get-Content "$env:TEMP\ops-network-precheck-curl.err" -Raw).Trim()
            Remove-Item "$env:TEMP\ops-network-precheck-curl.err" -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $stderrText = $_.Exception.Message
    }

    $statusCode = 0
    if ($statusText -match "^\d{3}$") {
        $statusCode = [int]$statusText
    }
    $ok = $AcceptCodes -contains $statusCode
    if ($statusCode -gt 0) {
        Write-Host ("[{0}] {1} -> HTTP {2} ({3})" -f ($(if ($ok) { "OK" } else { "FAIL" }), $Name, $statusCode, $Url))
    } else {
        Write-Host ("[FAIL] {0} -> {1} ({2})" -f $Name, $(if ($stderrText) { $stderrText } else { "no_http_status" }), $Url)
    }
    return $ok
}

function Test-Tcp {
    param(
        [string]$Name,
        [string]$HostName,
        [int]$Port
    )
    if ([string]::IsNullOrWhiteSpace($HostName)) {
        Write-Host ("[FAIL] {0} -> invalid host" -f $Name)
        return $false
    }
    $res = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
    $ok = [bool]$res.TcpTestSucceeded
    Write-Host ("[{0}] {1} -> {2}:{3}" -f ($(if ($ok) { "OK" } else { "FAIL" }), $Name, $HostName, $Port))
    return $ok
}

Write-Host "== Ops Network Precheck ==" -ForegroundColor Cyan
Write-Host ("AppBaseUrl   : {0}" -f $AppBaseUrl)
Write-Host ("SupabaseUrl  : {0}" -f $SupabaseUrl)
Write-Host ("ApiHealthUrl : {0}" -f $ApiHealthUrl)

$failed = New-Object System.Collections.Generic.List[string]

$appHost = Get-HostFromUrl -Url $AppBaseUrl
$supabaseHost = Get-HostFromUrl -Url $SupabaseUrl
$apiHost = Get-HostFromUrl -Url $ApiHealthUrl

if (-not (Test-Tcp -Name "tcp-app-443" -HostName $appHost -Port 443)) { $failed.Add("tcp-app-443") | Out-Null }
if (-not (Test-Tcp -Name "tcp-supabase-443" -HostName $supabaseHost -Port 443)) { $failed.Add("tcp-supabase-443") | Out-Null }
if (-not (Test-Tcp -Name "tcp-api-443" -HostName $apiHost -Port 443)) { $failed.Add("tcp-api-443") | Out-Null }

if (-not (Test-Http -Name "http-app-root" -Url "$($AppBaseUrl.TrimEnd('/'))/" -AcceptCodes @(200, 301, 302))) {
    $failed.Add("http-app-root") | Out-Null
}
if (-not (Test-Http -Name "http-ops-summary" -Url "$($AppBaseUrl.TrimEnd('/'))/api/ops/summary" -AcceptCodes @(200, 401, 403, 503))) {
    $failed.Add("http-ops-summary") | Out-Null
}
if (-not (Test-Http -Name "http-supabase-rest" -Url "$($SupabaseUrl.TrimEnd('/'))/rest/v1/" -AcceptCodes @(200, 401, 403, 404))) {
    $failed.Add("http-supabase-rest") | Out-Null
}
if (-not (Test-Http -Name "http-api-health" -Url $ApiHealthUrl -AcceptCodes @(200))) {
    $failed.Add("http-api-health") | Out-Null
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Error ("ops-network-precheck failed: {0}" -f ($failed -join ","))
    exit 1
}

Write-Host "ops-network-precheck: ALL PASSED" -ForegroundColor Green
exit 0
