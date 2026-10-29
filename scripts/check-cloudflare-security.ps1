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
       + wp-login managed-challenge rule (required: PASS needs it, see below)
  Requires: CLOUDFLARE_API_TOKEN (vault or User registry)
            CLOUDFLARE_ZONE_ID (vault/env, default: f21b1919632fee2221647908a94fdcac)

  PASS criteria depend on -WpLoginProtectedByServerSide:
    $true  (default, current architecture since 2026-06-04): wp-login/xmlrpc are defended
           server-side (LLAR + host nginx wp_login rate limit; fail2ban has only an sshd jail
           and cannot ban CF-proxied clients anyway). No geo rules — operator travels globally.
           Since 2026-10-29 a CF managed-challenge rule on /wp-login.php is REQUIRED: the
           brute force is distributed (900+ IPs, a few tries each), which per-IP limits
           cannot stop. PASS requires Bot Fight Mode = ON AND that rule enabled.
           (WORKLOG 2026-10-29; runbooks/WORDPRESS-LOGIN-SECURITY.md.)
    $false (legacy): CF WAF is the wp-login/xmlrpc defense — PASS requires bot=ON AND
           rules>=3 AND xmlrpc block present. Set this only if reverting to CF-WAF defense.

  Overall can be PASS / WARN / SKIP / BLIND. BLIND (added 2026-09-10, found when
  CLOUDFLARE_API_TOKEN had silently expired for an unknown number of days with this
  script still reporting WARN) means at least one of the 4 CF API checks below produced
  NO measurement this run -- auth rejection (401/403) or a network/connection failure
  (DNS, timeout, refused) -- which is a different and more urgent condition than WARN
  (call succeeded, a real posture value came back and it happens to be suboptimal).
  The report names exactly which check(s) are blind vs which completed with real data;
  it does not claim total blindness when only some of the 4 checks failed.
  SKIP still means "token not configured", a known/expected state on some machines.
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

# ssh with keepalive + hard total deadline (scripts/lib/ssh-deadline.ps1).
. (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")

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

$overall    = "WARN"
$botMode    = "unknown"
$ruleCount  = 0
$xmlrpcOk   = $false
$wpLoginChallengeOk = $false
$rateLimitRuleStatus = "unknown"
$rateLimitAdminCarveout = "unknown"
$errorMsg   = ""
# Any exception from the 3 API calls below means that specific check learned NOTHING this
# run -- not just a 401. A connection failure (DNS/timeout/refused, $code stays $null) or a
# 403 (token valid but missing that endpoint's scope) is exactly as blind as a 401; gating
# on "-eq 401" alone would silently re-swallow every one of those into plain WARN, i.e. the
# same "detector goes quiet" bug this feature exists to catch, just for a different trigger.
# $code is still recorded per entry so the report can give cause-specific remediation text.
# Tracked per-check (not one shared bool): a token missing ONE scope must not make the
# report claim "every check learned nothing" when 2 of 3 genuinely returned fresh data
# (same class as check-smoke-tests.ps1's $noEvidence/blind_spots: a detector that goes
# quiet must be louder than one that reports nothing wrong, not folded into "WARN" --
# but "louder" must still describe reality, not round every partial failure up to total).
$blindChecks = @()
# Initialised here, not inside the token branch: with no token the report block below still
# reads them, and under StrictMode an unset variable threw and no cf-security-LATEST.md was
# written at all (critic 2026-09-23) -- a SKIP run must still leave a fresh report.
$releasedAddrStatus = "skipped (no token)"
$releasedAddrHits   = @()

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
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        $blindChecks += @{ name = "Bot Fight Mode"; code = $code }
        $botMode  = "error"
        $errorMsg = "bot_management API: $($_.Exception.Message)"
    }

    try {
        # 2. WAF firewall rules -- migrated 2026-09-10 off the legacy /firewall/rules endpoint,
        # which now permanently 400s for this zone (CF error 10021 "rulesets_only_rule": "This
        # ruleset contains rules created directly with the Rulesets API. Please use the Rulesets
        # API..."), found live while re-verifying after a token rotation -- this zone's custom
        # ruleset picked up a Rulesets-API rule sometime after the 2026-09-04 PASS (which used
        # the legacy endpoint successfully), and every run from then on would have permanently
        # reported BLIND for this one check, exactly the "detector nobody reads because it always
        # fires" failure check-smoke-tests.ps1's own comments warn against. Modern equivalent:
        # the http_request_firewall_custom phase entrypoint (same data Cloudflare's own dashboard
        # reads). Empirically confirmed working against this zone: rule_count=1, matching 9/4's PASS.
        $wr = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/rulesets/phases/http_request_firewall_custom/entrypoint" `
                -Headers $cfH -TimeoutSec 10 -ErrorAction Stop
        # Null-guard before drilling into .result.rules: a 200 response with result:null (not
        # observed on this zone, but not ruled out by Cloudflare's docs either) would otherwise
        # throw under Set-StrictMode -Version Latest -- $ErrorActionPreference does not govern
        # that class of error, so without this guard it would rely on the outer catch as its
        # only safety net (still fails closed into BLIND, just for the wrong stated reason).
        # @() must wrap the WHOLE if/else expression, not just each branch: PowerShell unwraps
        # a single-element array returned through an if-expression assignment back to a bare
        # scalar (verified live: a 1-rule zone produced $rules as a PSCustomObject, not an
        # array, so $rules.Count threw "property 'Count' not found" under StrictMode -- an
        # array-unrolling gotcha, not a Cloudflare shape issue).
        $rules = @(if ($wr -and $wr.result -and $wr.result.rules) { $wr.result.rules } else { @() })
        $ruleCount = $rules.Count
        $xmlrpcOk  = [bool]($rules | Where-Object { $_.expression -match "xmlrpc" -or $_.description -match "xmlrpc" })
        # Enabled challenge rule whose expression names wp-login.php (any challenge flavour).
        $wpLoginChallengeOk = [bool]($rules | Where-Object { $_.enabled -and $_.action -in @('managed_challenge','challenge','js_challenge') -and $_.expression -match 'wp-login\.php' })
    } catch {
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        if ($code -eq 404) {
            # Documented Cloudflare behavior: this endpoint 404s when the zone has never created
            # a custom ruleset for the http_request_firewall_custom phase at all -- NOT the same
            # as "the check failed to measure anything." The legacy /firewall/rules list endpoint
            # this replaced never had this failure mode (a list endpoint returns 200+[] for zero
            # items), so without this branch every zone with zero custom WAF rules -- exactly the
            # architecture this script's own $WpLoginProtectedByServerSide=$true mode describes as
            # intentional -- would report BLIND forever, the same "nobody reads a detector that
            # always fires" anti-pattern this whole migration exists to eliminate, just relocated.
            $ruleCount = 0
            $xmlrpcOk  = $false
            $wpLoginChallengeOk = $false
        } else {
            $blindChecks += @{ name = "WAF firewall rules"; code = $code }
            if (-not $errorMsg) { $errorMsg = "firewall ruleset API: $($_.Exception.Message)" }
        }
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
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        $blindChecks += @{ name = "Rate-limit ruleset"; code = $code }
        if (-not $errorMsg) { $errorMsg = "rate-limit ruleset API: $($_.Exception.Message)" }
        $rateLimitRuleStatus = "error"
        $rateLimitAdminCarveout = "unknown"
    }

    # 4. Released-address whitelist check (added 2026-09-23). Registry SSOT:
    # agency-os/config/released-addresses.json (same file scripts/verify-no-released-addresses.mjs
    # reads for the repo gate). Found live 2026-09-23: 204.168.175.41 (released EU VPS, since
    # reassigned to a third party) was still whitelisted in this zone's access rules -- a CF
    # whitelist rule bypasses Bot Fight Mode/WAF/rate-limiting entirely for that source.
    #
    # Uses [System.Net.IPAddress] byte-array prefix comparison, not string equality: Cloudflare
    # stores IPv6 rule values fully expanded (2001:41d0:000d:2572:0000:0000:0000:0000/64) while
    # the registry uses compressed form (2001:41d0:d:2572::/64) -- a first string-equality version
    # of this check silently missed that exact live rule (verified 2026-09-23: only the 2 IPv4
    # hits surfaced, the IPv6 one did not, until this was rewritten as byte comparison).
    function Test-CidrOverlap {
        param([string]$A, [string]$B)
        try {
            $aParts = $A -split '/', 2; $bParts = $B -split '/', 2
            $aIp = [System.Net.IPAddress]::Parse($aParts[0]); $bIp = [System.Net.IPAddress]::Parse($bParts[0])
            if ($aIp.AddressFamily -ne $bIp.AddressFamily) { return $false }
            $bits = if ($aIp.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) { 32 } else { 128 }
            $aLen = if ($aParts.Count -eq 2) { [int]$aParts[1] } else { $bits }
            $bLen = if ($bParts.Count -eq 2) { [int]$bParts[1] } else { $bits }
            $prefixLen = [Math]::Min($aLen, $bLen)
            $aBytes = $aIp.GetAddressBytes(); $bBytes = $bIp.GetAddressBytes()
            $fullBytes = [Math]::Floor($prefixLen / 8); $remBits = $prefixLen % 8
            for ($i = 0; $i -lt $fullBytes; $i++) { if ($aBytes[$i] -ne $bBytes[$i]) { return $false } }
            if ($remBits -gt 0) {
                $mask = [byte]((0xFF -shl (8 - $remBits)) -band 0xFF)
                if (($aBytes[$fullBytes] -band $mask) -ne ($bBytes[$fullBytes] -band $mask)) { return $false }
            }
            return $true
        } catch { return $false }
    }
    $releasedAddrStatus = "unknown"
    # Every page, not only the first 1000 (codex 2026-09-23 F1): a rule on page 2 must not read clean.
    function Get-CfAllPages {
        param([string]$BaseUri, [hashtable]$Headers)
        $all = @(); $page = 1
        do {
            $sep = if ($BaseUri.Contains('?')) { '&' } else { '?' }
            $resp = Invoke-RestMethod -Uri ("{0}{1}per_page=1000&page={2}" -f $BaseUri, $sep, $page) -Headers $Headers -TimeoutSec 10 -ErrorAction Stop
            $all += @($resp.result)
            $totalPages = 1
            if ($resp.PSObject.Properties['result_info'] -and $resp.result_info -and $resp.result_info.PSObject.Properties['total_pages']) { $totalPages = [int]$resp.result_info.total_pages }
            $page++
        } while ($page -le $totalPages -and $page -le 50)
        # More pages than the cap = this check did NOT see everything: throw so the caller's catch
        # records it as BLIND instead of reporting clean on a partial list (codex r2 F2).
        if ($totalPages -gt 50) { throw ("{0}: {1} pages exceed the 50-page cap -- result incomplete" -f $BaseUri, $totalPages) }
        return $all
    }
    try {
        $registryPath = Join-Path $root "agency-os\config\released-addresses.json"
        $registry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $released = @($registry.released | ForEach-Object { $_.cidr })
        $rules = @(Get-CfAllPages -BaseUri "https://api.cloudflare.com/client/v4/zones/$ZoneId/firewall/access_rules/rules" -Headers $cfH)
        foreach ($rule in $rules) {
            # ip6 is a distinct CF target (single IPv6 address); a block/challenge rule on a released
            # address is the RIGHT posture, only a whitelist is a trust grant.
            if (@('ip', 'ip_range', 'ip6') -notcontains [string]$rule.configuration.target) { continue }
            if ([string]$rule.mode -ne 'whitelist') { continue }
            $val = [string]$rule.configuration.value
            foreach ($cidr in $released) {
                if (Test-CidrOverlap -A $val -B $cidr) { $releasedAddrHits += "$($rule.mode):$val (id=$($rule.id))"; break }
            }
        }
        # DNS: a proxied or plain A/AAAA record still pointing at a released address serves a third
        # party's box under our name (registry description already claimed this check existed).
        $dnsRecs = @(Get-CfAllPages -BaseUri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records?type=A" -Headers $cfH) +
                   @(Get-CfAllPages -BaseUri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records?type=AAAA" -Headers $cfH)
        foreach ($rec in $dnsRecs) {
            $content = [string]$rec.content
            foreach ($cidr in $released) {
                if (Test-CidrOverlap -A $content -B $cidr) { $releasedAddrHits += "dns:$($rec.type) $($rec.name) -> $content (id=$($rec.id))"; break }
            }
        }
        $releasedAddrStatus = if ($releasedAddrHits.Count -gt 0) { "FOUND" } else { "clean" }
    } catch {
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        $blindChecks += @{ name = "Released-address access rules"; code = $code }
        $releasedAddrStatus = "error"
        if (-not $errorMsg) { $errorMsg = "access_rules API: $($_.Exception.Message)" }
    }

    if ($WpLoginProtectedByServerSide) {
        # wp-login: LLAR + nginx per-IP limits server-side, plus the CF challenge rule that stops
        # the distributed brute force at the edge (2026-10-29). No geo rules.
        if ($botMode -eq "ON" -and $rateLimitAdminCarveout -ne "missing" -and $wpLoginChallengeOk) {
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
    # A released-address whitelist rule is a real posture defect (bypasses CF entirely for
    # that source) -- downgrade PASS, same treatment as $lockdownStatus -eq 'inactive' below.
    if ($releasedAddrStatus -eq "FOUND" -and $overall -eq "PASS") { $overall = "WARN" }
}

# Any blind check overrides PASS/WARN (never SKIP -- missing-token is a known, expected
# state on machines without the secret, not an incident): the token WAS present and at
# least one call failed, so at least part of the posture picture below is not a fresh
# reading. The report text (below) says exactly which check(s), not "everything."
if ($blindChecks.Count -gt 0 -and $overall -ne "SKIP") { $overall = "BLIND" }

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
    # Two curl -m 10 run remotely, so the deadline must exceed 20s. A timeout is 'unreachable', never a verdict.
    $lockdownRes = Invoke-SshWithDeadline -SshArgs @('-i', $ksKey, '-p', '58122', '-o', 'StrictHostKeyChecking=no', 'ubuntu@145.239.195.47', $probeCmd) -DeadlineSec 40 -ConnectTimeoutSec 8
    $lockdownOut = $lockdownRes.Stdout
    if ($lockdownRes.TimedOut -or $lockdownRes.ExitCode -ne 0) {
        $lockdownStatus = 'unreachable'
    } elseif ($lockdownOut -match 'AW=(\d+);SF=(\d+)') {
        $lockdownAw = $Matches[1]
        $lockdownSf = $Matches[2]
        # A verdict needs a real response from BOTH probes; 000 = curl got none = not measured.
        $lockdownStatus = if ($lockdownAw -eq '000' -or $lockdownSf -eq '000') { 'unreachable' }
                          elseif ($lockdownAw -eq '403' -and $lockdownSf -eq '403') { 'active' } else { 'inactive' }
    }
} catch {
    $lockdownStatus = 'unreachable'
}

# R3-F3 (round-3 review): the lockdown check used to be config-inspection and was
# deliberately warn-only (it could rot). It is now a live end-to-end probe with no
# false-positive mode: 'inactive' means a direct-origin request REALLY got through.
# That must degrade the overall verdict. Any other non-verdict ('unreachable', ssh exit != 0) was not
# measured, and an unmeasured check is never a PASS (2026-10-23).
if ($lockdownStatus -ne 'active' -and $overall -eq 'PASS') { $overall = 'WARN' }

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
    "| wp-login managed-challenge rule | $(if ($wpLoginChallengeOk) { 'present' } else { 'MISSING' }) |",
    "| xmlrpc.php block rule | $(if ($xmlrpcOk) { 'present' } elseif ($WpLoginProtectedByServerSide) { 'server-side (nginx/LLAR)' } else { 'MISSING' }) |",
    "| Scanner flood rate-limit rule | $rateLimitRuleStatus |",
    "| WP admin rate-limit carve-outs | $rateLimitAdminCarveout |",
    "| Released-address access rules | $releasedAddrStatus$(if ($releasedAddrHits.Count -gt 0) { ': ' + ($releasedAddrHits -join '; ') }) |",
    "| Origin lockdown (ks-aw-01 nginx guard) | $lockdownStatus$(if ($lockdownStatus -eq 'inactive') { ' warning: direct-origin attacks possible' }) |",
    "| Direct-origin probe aware-wave (expect 403) | $(if ($lockdownAw) { $lockdownAw } else { 'N/A' }) |",
    "| Direct-origin probe soulful (expect 403) | $(if ($lockdownSf) { $lockdownSf } else { 'N/A' }) |"
)
if ($WpLoginProtectedByServerSide) {
    $lines += ""
    $lines += "## wp-login / xmlrpc protection"
    $lines += "- Edge: CF managed-challenge rule on /wp-login.php (required since 2026-10-29; distributed brute force from 900+ IPs defeats per-IP limits)."
    $lines += "- Server-side: LLAR lockouts + host nginx wp_login rate limit. fail2ban has only an sshd jail."
    $lines += "- CF WAF wp-login geo rules are intentionally absent: operator travels globally; CF geo rules would self-lock."
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
if ($blindChecks.Count -gt 0) {
    $allCheckNames  = @('Bot Fight Mode', 'WAF firewall rules', 'Rate-limit ruleset', 'Released-address access rules')
    $blindNames     = @($blindChecks | ForEach-Object { $_.name })
    $healthyNames   = @($allCheckNames | Where-Object { $blindNames -notcontains $_ })
    $authCodes      = @($blindChecks | Where-Object { $_.code -eq 401 -or $_.code -eq 403 } | ForEach-Object { $_.code } | Select-Object -Unique)
    $hasNetworkBlind = [bool]($blindChecks | Where-Object { -not $_.code })

    $lines += ""
    $lines += "## BLIND (not the same as WARN)"
    $lines += ('- {0} of {1} checks produced ZERO measurement this run: {2}. Their values in the table above are stale/error, not a fresh reading.' -f $blindChecks.Count, $allCheckNames.Count, ($blindNames -join ', '))
    if ($healthyNames.Count -gt 0) {
        $lines += ('- The other {0} check(s) DID complete with real data this run: {1}.' -f $healthyNames.Count, ($healthyNames -join ', '))
    }
    if ($authCodes.Count -gt 0) {
        $lines += ('- Cause includes an auth/permission rejection (HTTP {0}). If 401: token invalid/expired -- Cloudflare dashboard -> My Profile -> API Tokens -> regenerate (scope: Zone:DNS Edit + Zone:Firewall Services Edit, zone=aware-wave.com) -> update mcp/user-env.ps1 CLOUDFLARE_API_TOKEN. If 403: token valid but missing the scope for that specific endpoint -- check the token''s permissions in the dashboard.' -f (($authCodes | ForEach-Object { "$_" }) -join '/'))
    }
    if ($hasNetworkBlind) {
        $lines += '- At least one failure had no HTTP status code (connection refused / timeout / DNS) -- check network connectivity to api.cloudflare.com and https://www.cloudflarestatus.com/ before assuming the token is the cause.'
    }
    $lines += '- Re-run this script after fixing and confirm Overall != BLIND.'
}
if ($errorMsg) { $lines += ""; $lines += "## Errors"; $lines += "- $errorMsg" }
Set-Content -Path (Join-Path $reportDir "cf-security-LATEST.md") -Value ($lines -join "`r`n") -Encoding UTF8

$colour = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } elseif ($overall -eq "BLIND") { "Red" } else { "Yellow" }
Write-Host "== Cloudflare security: $overall (bot=$botMode, rules=$ruleCount, xmlrpc=$xmlrpcOk, wplogin_challenge=$wpLoginChallengeOk, lockdown=$lockdownStatus) ==" -ForegroundColor $colour
exit 0
