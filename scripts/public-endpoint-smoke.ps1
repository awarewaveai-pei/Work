param(
    [int]$TimeoutSec = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checks = @(
    @{ Name = "uptime-dashboard"; Url = "https://uptime.aware-wave.com/dashboard"; Accept = @(200, 301, 302) },
    @{ Name = "app-root"; Url = "https://app.aware-wave.com/"; Accept = @(200, 301, 302) },
    @{ Name = "api-health"; Url = "https://api.aware-wave.com/health"; Accept = @(200) },
    @{ Name = "n8n-healthz"; Url = "https://n8n.aware-wave.com/healthz"; Accept = @(200) }
)

$failed = @()
foreach ($c in $checks) {
    $code = -1
    $err = ""
    try {
        $headers = & curl.exe -I --max-time $TimeoutSec --silent --show-error $c.Url
        if ($LASTEXITCODE -eq 0 -and $headers) {
            $statusLine = @($headers -split "`n" | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)
            if ($statusLine.Count -gt 0 -and $statusLine[0] -match 'HTTP/\S+\s+(\d{3})') {
                $code = [int]$matches[1]
            } else {
                $err = "Unable to parse HTTP status from response headers."
            }
        } else {
            $err = "curl exited with code $LASTEXITCODE"
        }
    } catch {
        $err = $_.Exception.Message
    }

    $ok = $c.Accept -contains $code
    $status = if ($ok) { "OK" } else { "FAIL" }
    Write-Host ("[{0}] {1} -> {2}" -f $status, $c.Name, $code)
    if (-not $ok) {
        $failed += @{
            name = $c.Name
            url = $c.Url
            status = $code
            error = $err
            accepted = ($c.Accept -join ",")
        }
    }
}

if ($failed.Count -gt 0) {
    Write-Error ("public-endpoint-smoke failed: {0}" -f (($failed | ForEach-Object { "{0}={1}" -f $_.name, $_.status }) -join "; "))
    exit 1
}

Write-Host "public-endpoint-smoke: ALL PASSED" -ForegroundColor Green
exit 0
