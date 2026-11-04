param(
    [int]$TimeoutSec = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Header name and value, compared case-insensitively against each response header line.
$frameGuard = @("x-frame-options: SAMEORIGIN", "content-security-policy: frame-ancestors 'self'")

$checks = @(
    @{ Name = "uptime-dashboard"; Url = "https://uptime.aware-wave.com/dashboard"; Accept = @(200, 301, 302) },
    # 307 added 2026-09-11 — observed as app-root's actual current redirect code (found incidentally
    # while verifying the chatwoot check below; unrelated to Chatwoot, this Accept list was just stale).
    @{ Name = "app-root"; Url = "https://app.aware-wave.com/"; Accept = @(200, 301, 302, 307) },
    @{ Name = "api-health"; Url = "https://api.aware-wave.com/health"; Accept = @(200) },
    @{ Name = "n8n-healthz"; Url = "https://n8n.aware-wave.com/healthz"; Accept = @(200) },
    # Chatwoot ships no dedicated /health path; root redirects to /installation/onboarding pre-setup
    # (confirmed live 2026-09-11 — real 302, not a guess).
    @{ Name = "chatwoot-root"; Url = "https://chatwoot.aware-wave.com/"; Accept = @(200, 302) },
    # Clickjacking guard on the PUBLIC pages of each door (WORKLOG 2026-11-04). Soulful's `/` is the only
    # nginx location whose headers come from nginx (wp-login/wp-admin get theirs from WordPress itself),
    # so this one probe covers the nginx drift class; a proxy that strips a header also fails here.
    @{ Name = "soulful-frame-guard"; Url = "https://soulfulexpression.org/"; Accept = @(200); RequireHeaders = $frameGuard },
    @{ Name = "aware-wave-frame-guard"; Url = "https://aware-wave.com/"; Accept = @(200); RequireHeaders = @("x-frame-options: SAMEORIGIN") },
    @{ Name = "app-frame-guard"; Url = "https://app.aware-wave.com/"; Accept = @(200, 307); RequireHeaders = @("x-frame-options: SAMEORIGIN") }
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

    $missing = @()
    if ($c.ContainsKey("RequireHeaders") -and $code -ne -1) {
        $lines = @($headers -split "`n" | ForEach-Object { $_.Trim() })
        $missing = @($c.RequireHeaders | Where-Object { $want = $_; -not ($lines | Where-Object { $_ -ieq $want }) })
        if ($missing.Count -gt 0) { $err = "missing header(s): " + ($missing -join " | ") }
    }
    $ok = ($c.Accept -contains $code) -and ($missing.Count -eq 0)
    $status = if ($ok) { "OK" } else { "FAIL" }
    Write-Host ("[{0}] {1} -> {2}{3}" -f $status, $c.Name, $code, $(if ($err) { " ($err)" } else { "" }))
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
