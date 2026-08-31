#requires -Version 5.1
<#
.SYNOPSIS
  Verifies Cloudflare security posture for aware-wave.com via API.
  Called by ao-resume.ps1 and system-health-check.ps1 — warn-only (always exits 0).

.OUTPUTS
  agency-os/reports/status/cf-security-LATEST.md

.NOTES
  Checks:
    1. Bot Fight Mode (bot_management.fight_mode = true)
    2. WAF firewall rules count + xmlrpc.php block rule (informational under server-side mode)
  Requires: CLOUDFLARE_API_TOKEN (vault or User registry)
            CLOUDFLARE_ZONE_ID (vault/env, default: f21b1919632fee2221647908a94fdcac)

  PASS criteria depend on -WpLoginProtectedByServerSide:
    $true  (default, current architecture since 2026-06-04): wp-login/xmlrpc are defended
           server-side (LLAR + nginx rate-limit + fail2ban). CF WAF rules are intentionally
           empty — operator travels globally and CF geo rules would self-lock her out.
           PASS requires only Bot Fight Mode = ON. WAF rule count is informational, NOT a
           health signal. (See WORKLOG 2026-06-04 + memory feedback_global_traveler.)
    $false (legacy): CF WAF is the wp-login/xmlrpc defense — PASS requires bot=ON AND
           rules>=3 AND xmlrpc block present. Set this only if reverting to CF-WAF defense.
#>
param(
    [string]$WorkRoot = "",
    [string]$ZoneId   = "f21b1919632fee2221647908a94fdcac",
    [string]$RateLimitRulesetId = "e29e21021ab641b38a4067735a027907",
    [string]$ScannerFloodRateLimitRuleId = "b8ffa72df8d44ea78a09bd0ababf8abb",
    [bool]$WpLoginProtectedByServerSide = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

$root      = Resolve-Root -InputRoot $WorkRoot
$reportDir = Join-Path $root "agency-os\reports\status"
$null      = New-Item -ItemType Directory -Force -Path $reportDir

# --- Get-Secret: User registry wins over stale process env ---
$vaultStore = $null
try {
    . (Join-Path $root "scripts\_vault-helpers.ps1") -ErrorAction Stop
    $vaultStore = Read-VaultStore (Resolve-VaultPath)
} catch {}

function Get-Secret {
    param([string]$Name)
    $v = [System.Environment]::GetEnvironmentVariable($Name, 'User')
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name, 'Machine') }
    if (-not $v) { $v = [System.Environment]::GetEnvironmentVariable($Name) }
    if ($v) { return $v }
    if ($vaultStore) { try { return Get-VaultSecret -Store $vaultStore -Name $Name } catch {} }
    return $null
}

$token = Get-Secret "CLOUDFLARE_API_TOKEN"
if (-not $token) { $token = Get-Secret "CLOUDFLARE_AUTH_BEARER_TOKEN" }

$overall    = "WARN"
$botMode    = "unknown"
$ruleCount  = 0
$xmlrpcOk   = $false
$rateLimitRuleStatus = "unknown"
$rateLimitAdminCarveout = "unknown"
$errorMsg   = ""

if (-not $token) {
    $errorMsg = "CLOUDFLARE_API_TOKEN not found in vault/env — skipped"
    $overall  = "SKIP"
} else {
    $cfH = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    try {
        # 1. Bot Fight Mode
        $bm = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/bot_management" `
                -Headers $cfH -TimeoutSec 10 -ErrorAction Stop
        $botMode = if ($bm.result.fight_mode) { "ON" } else { "OFF" }
    } catch {
        $botMode  = "error"
        $errorMsg = "bot_management API: $($_.Exception.Message)"
    }

    try {
        # 2. WAF firewall rules
        $wr = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/firewall/rules?per_page=100" `
                -Headers $cfH -TimeoutSec 10 -ErrorAction Stop
        $ruleCount = @($wr.result).Count
        $xmlrpcOk  = [bool](@($wr.result) | Where-Object { $_.filter.expression -match "xmlrpc" -or $_.description -match "xmlrpc" })
    } catch {
        if (-not $errorMsg) { $errorMsg = "firewall/rules API: $($_.Exception.Message)" }
    }

    try {
        # 3. WAF rate-limit rule: global scanner flood defense must not catch normal WP admin bursts.
        $rl = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/rulesets/$RateLimitRulesetId" `
                -Headers $cfH -TimeoutSec 10 -ErrorAction Stop
        $rateRule = @($rl.result.rules) | Where-Object { $_.id -eq $ScannerFloodRateLimitRuleId } | Select-Object -First 1
        if ($rateRule) {
            $rateLimitRuleStatus = if ($rateRule.enabled -and $rateRule.action -eq "block") { "enabled/block" } else { "not-blocking" }
            $expr = [string]$rateRule.expression
            $hasAdminCarveout =
                $expr -match '/wp-admin/' -and
                $expr -match '/wp-json/' -and
                $expr -match '/wp-content/' -and
                $expr -match '/wp-includes/'
            $rateLimitAdminCarveout = if ($hasAdminCarveout) { "present" } else { "missing" }
        } else {
            $rateLimitRuleStatus = "missing"
            $rateLimitAdminCarveout = "missing"
        }
    } catch {
        if (-not $errorMsg) { $errorMsg = "rate-limit ruleset API: $($_.Exception.Message)" }
        $rateLimitRuleStatus = "error"
        $rateLimitAdminCarveout = "unknown"
    }

    if ($WpLoginProtectedByServerSide) {
        # wp-login/xmlrpc defended server-side (LLAR + nginx + fail2ban) since 2026-06-04.
        # CF wp-login geo rules are intentionally absent; scanner/path rules may exist.
        if ($botMode -eq "ON" -and $rateLimitAdminCarveout -ne "missing") {
            $overall = "PASS"
        } else {
            # bot=OFF or error → genuine CF posture issue, still WARN.
            $overall = "WARN"
        }
    } else {
        # Legacy CF-WAF defense mode: WAF rules ARE the wp-login/xmlrpc layer.
        if ($botMode -eq "ON" -and $ruleCount -ge 3 -and $xmlrpcOk) {
            $overall = "PASS"
        } elseif ($errorMsg) {
            $overall = "WARN"
        } else {
            $overall = "WARN"
        }
    }
}

# 3. Origin lockdown (ks-aw-01, warn-only, never affects $overall PASS/FAIL)
# 2026-08-28 consolidation retarget (round-2 review F5): SG's ipset/iptables lockdown
# died with the SG machine. On ks-aw-01 the mechanism is an nginx geo guard
# (cf-edge-geo.conf + snippets/cf-only.conf). Instead of inspecting config, this
# probes the INVARIANT end-to-end from the box itself: a direct-to-origin request
# carrying a proxied Host/SNI must get 403 for BOTH production zones. A probe
# cannot rot the way a config-inspection can.
$lockdownStatus = 'unknown'
$lockdownAw = ''
$lockdownSf = ''
try {
    $ksKey = "$env:USERPROFILE\.ssh\id_ed25519"
    $probeCmd = "curl -sk -o /dev/null -m 10 -w 'AW=%{http_code};' --resolve trigger.aware-wave.com:443:145.239.195.47 https://trigger.aware-wave.com/login; curl -sk -o /dev/null -m 10 -w 'SF=%{http_code}' --resolve soulfulexpression.org:443:145.239.195.47 https://soulfulexpression.org/"
    $lockdownOut = & ssh -i $ksKey -p 58122 -o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes ubuntu@145.239.195.47 $probeCmd 2>$null
    if ($lockdownOut -match 'AW=(\d+);SF=(\d+)') {
        $lockdownAw = $Matches[1]
        $lockdownSf = $Matches[2]
        $lockdownStatus = if ($lockdownAw -eq '403' -and $lockdownSf -eq '403') { 'active' } else { 'inactive' }
    }
} catch {
    $lockdownStatus = 'unreachable'
}

# R3-F3 (round-3 review): the lockdown check used to be config-inspection and was
# deliberately warn-only (it could rot). It is now a live end-to-end probe with no
# false-positive mode: 'inactive' means a direct-origin request REALLY got through.
# That must degrade the overall verdict. 'unreachable' (ssh hiccup) stays warn-only.
if ($lockdownStatus -eq 'inactive' -and $overall -eq 'PASS') { $overall = 'WARN' }

$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$lines = @(
    "# Cloudflare security check",
    "",
    "- Generated: $stamp",
    "- Zone: $ZoneId (aware-wave.com)",
    "- **Overall: $overall**",
    "",
    "## Checks",
    "| Check | Result |",
    "|-------|--------|",
    "| Bot Fight Mode | $botMode |",
    "| WAF firewall rules count | $ruleCount$(if ($WpLoginProtectedByServerSide) { ' (informational; wp-login is server-side)' }) |",
    "| xmlrpc.php block rule | $(if ($xmlrpcOk) { 'present' } elseif ($WpLoginProtectedByServerSide) { 'server-side (nginx/LLAR)' } else { 'MISSING' }) |",
    "| Scanner flood rate-limit rule | $rateLimitRuleStatus |",
    "| WP admin rate-limit carve-outs | $rateLimitAdminCarveout |",
    "| Origin lockdown (ks-aw-01 nginx guard) | $lockdownStatus$(if ($lockdownStatus -eq 'inactive') { ' warning: direct-origin attacks possible' }) |",
    "| Direct-origin probe aware-wave (expect 403) | $(if ($lockdownAw) { $lockdownAw } else { 'N/A' }) |",
    "| Direct-origin probe soulful (expect 403) | $(if ($lockdownSf) { $lockdownSf } else { 'N/A' }) |"
)
if ($WpLoginProtectedByServerSide) {
    $lines += ""
    $lines += "## wp-login / xmlrpc protection"
    $lines += "- Mode: **server-side** (LLAR + nginx rate-limit + fail2ban) -- architecture decision 2026-06-04."
    $lines += "- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock."
    $lines += "- CF WAF scanner/path rules may exist, but wp-login health is judged by the server-side layer."
    $lines += "- This check verifies CF posture plus Origin Lockdown; WordPress plugin protection is verified separately (client-status / WP plugin checks)."
}
$lines += ""
$lines += "## Origin Lockdown (ks-aw-01 145.239.195.47, since 2026-08-31 KS-6 host switch)"
$lines += "- Status: **$lockdownStatus**"
$lines += "- Probe aware-wave direct-origin: $(if ($lockdownAw) { $lockdownAw } else { 'N/A' }) / soulful: $(if ($lockdownSf) { $lockdownSf } else { 'N/A' }) (403 = guarded)"
$lines += '- Architecture: nginx geo guard (conf.d/cf-edge-geo.conf + snippets/cf-only.conf) returns 403 unless the raw TCP peer is a CF edge or localhost; DNS-only vhosts (remotion-svc/video-svc) deliberately unguarded.'
if ($lockdownStatus -ne 'active') {
    $lines += '- INACTIVE/UNKNOWN: re-check /etc/nginx/snippets/cf-only.conf includes per 443 server block; CF CIDR source is soulful-security.conf (refresh-cf-origin-ips.ps1).'
}
$lines += '- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP'
if ($errorMsg) { $lines += ""; $lines += "## Errors"; $lines += "- $errorMsg" }
Set-Content -Path (Join-Path $reportDir "cf-security-LATEST.md") -Value ($lines -join "`r`n") -Encoding UTF8

$colour = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }
Write-Host "== Cloudflare security: $overall (bot=$botMode, rules=$ruleCount, xmlrpc=$xmlrpcOk, lockdown=$lockdownStatus) ==" -ForegroundColor $colour
exit 0
