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

# 3. Origin lockdown (SSH to SG -- warn-only, never affects $overall PASS/FAIL)
$lockdownStatus = 'unknown'
$lockdownIpCount = 0
$lockdownIpv6Count = 0
try {
    $sshKey = "$env:USERPROFILE\.ssh\hetzner_trigger"
    if (-not (Test-Path $sshKey)) { $sshKey = '~/.ssh/hetzner_trigger' }
    $lockdownOut = & ssh -i $sshKey -o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes `
        root@5.223.93.113 `
        "echo V4=`$(ipset list cf-ipv4 2>/dev/null | awk '/Number of entries/ {print `$NF}'); echo V6=`$(ipset list cf-ipv6 2>/dev/null | awk '/Number of entries/ {print `$NF}'); iptables -C INPUT -p tcp --dport 443 -m set --match-set cf-ipv4 src -j ACCEPT 2>/dev/null && echo V4_RULE=ACTIVE || echo V4_RULE=INACTIVE; ip6tables -C INPUT -p tcp --dport 443 -m set --match-set cf-ipv6 src -j ACCEPT 2>/dev/null && echo V6_RULE=ACTIVE || echo V6_RULE=INACTIVE" `
        2>$null
    if ($lockdownOut) {
        $lockdownLines = @($lockdownOut | Where-Object { $_ -match '\S' })
        $v4Rule = 'INACTIVE'
        $v6Rule = 'INACTIVE'
        foreach ($line in $lockdownLines) {
            if ($line -match '^V4=(\d+)$') { $lockdownIpCount = [int]$Matches[1] }
            elseif ($line -match '^V6=(\d+)$') { $lockdownIpv6Count = [int]$Matches[1] }
            elseif ($line -match '^V4_RULE=(ACTIVE|INACTIVE)$') { $v4Rule = $Matches[1] }
            elseif ($line -match '^V6_RULE=(ACTIVE|INACTIVE)$') { $v6Rule = $Matches[1] }
        }
        $lockdownStatus = if (
            $lockdownIpCount -gt 0 -and
            $lockdownIpv6Count -gt 0 -and
            $v4Rule -eq 'ACTIVE' -and
            $v6Rule -eq 'ACTIVE'
        ) { 'active' } else { 'inactive' }
    }
} catch {
    $lockdownStatus = 'unreachable'
}

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
    "| Origin lockdown (SG) | $lockdownStatus$(if ($lockdownStatus -eq 'inactive') { ' warning: direct-origin attacks possible' }) |",
    "| CF ipset cf-ipv4 entries | $(if ($lockdownIpCount -gt 0) { $lockdownIpCount } else { 'N/A' }) |",
    "| CF ipset cf-ipv6 entries | $(if ($lockdownIpv6Count -gt 0) { $lockdownIpv6Count } else { 'N/A' }) |"
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
$lines += "## Origin Lockdown (SG 5.223.93.113)"
$lines += "- Status: **$lockdownStatus**"
$lines += "- CF IPv4 ranges in ipset: $lockdownIpCount"
$lines += "- CF IPv6 ranges in ipset: $lockdownIpv6Count"
$lines += '- Architecture: iptables allows only CF IPs on 80/443 -- direct-origin scanners DROP before nginx'
if ($lockdownStatus -eq 'active') {
    $lines += '- Maintenance: use /origin-lockdown status or scripts/refresh-cf-origin-ips.ps1; rollback only for emergency recovery.'
} else {
    $lines += '- To apply: /origin-lockdown apply (HIGH RISK, go-ahead required)'
}
$lines += '- Runbook: runbooks/CLOUDFLARE-WAF-SETUP.md #Origin-Lockdown-SOP'
if ($errorMsg) { $lines += ""; $lines += "## Errors"; $lines += "- $errorMsg" }
Set-Content -Path (Join-Path $reportDir "cf-security-LATEST.md") -Value ($lines -join "`r`n") -Encoding UTF8

$colour = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }
Write-Host "== Cloudflare security: $overall (bot=$botMode, rules=$ruleCount, xmlrpc=$xmlrpcOk, lockdown=$lockdownStatus) ==" -ForegroundColor $colour
exit 0
