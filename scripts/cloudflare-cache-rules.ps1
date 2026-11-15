#requires -Version 5.1
<#
.SYNOPSIS
  The one Cloudflare Cache Rule for app.aware-wave.com's embedded editors: "do what the origin says".

.DESCRIPTION
  Invariant: WHICH files are cacheable and for HOW LONG is decided in one place, nginx
  (lobster-factory/infra/hetzner-phase1-core/nginx/default.conf: map $photo_pro_cache, /vector-pro/ expires).
  Cloudflare only caches by file extension unless a Cache Rule makes a path eligible, so the 14 MB wasm
  parts and 32 MB wasm were DYNAMIC (every load fetched from the origin, 60-110 s from Taiwan, 2026-11-15).
  This rule makes /photo-pro/ and /vector-pro/ eligible and sets edge + browser TTL to respect_origin:
  it carries no TTL of its own, so changing a Cache-Control in nginx is the whole change.

  Hosts: every server block in that nginx file which has `location ^~ /photo-pro/` or `/vector-pro/`
  (app.aware-wave.com and the product doors -- the editor frame loads /photo-pro/ relative to its own
  host). Read from the repo copy each run, so a door added in nginx shows up as a check mismatch.
  Only those hosts: elsewhere (aware-wave.com = WordPress) the path is not this static build, and
  respect_origin with no Cache-Control falls back to Cloudflare's default 2 h edge TTL.

  One rule, identified by its description ($RuleDescription), in the zone's
  http_request_cache_settings entrypoint ruleset. Other rules in that ruleset are never touched:
  the entrypoint is only PUT when it does not exist yet (404); otherwise the rule is added/updated/
  removed through the per-rule endpoints (POST/PATCH/DELETE .../rulesets/{id}/rules[/{rule_id}]).
  API shape checked against the Cloudflare OpenAPI spec and
  https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/ (2026-11-15).

  Actions
    check   rule exists and matches the desired content  -> exit 0, else 1
    apply   idempotent: create / update only when different / leave alone
    remove  delete the rule (rollback); absent = exit 0

  Exit codes (system-health-check.ps1 reads them):
    0 ok   1 check: rule missing or different   2 no CLOUDFLARE_API_TOKEN
    3 token rejected: 401 = invalid/expired (rotate), 403 = lacks Zone > Cache Rules > Edit (add it in the dashboard)
    4 any other API / network failure, or the ruleset holds more than one rule with this description

  Token: same lookup as check-cloudflare-security.ps1 (User/Machine/process env, then the DPAPI vault
  via scripts/_vault-helpers.ps1). The value is never printed.

.EXAMPLE
  powershell -NoProfile -File scripts/cloudflare-cache-rules.ps1 -Action check
  powershell -NoProfile -File scripts/cloudflare-cache-rules.ps1 -Action apply
  powershell -NoProfile -File scripts/cloudflare-cache-rules.ps1 -Action remove   # rollback
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('check', 'apply', 'remove')][string]$Action,
    [string]$WorkRoot = "",
    [string]$ZoneId = "f21b1919632fee2221647908a94fdcac",
    [string]$RuleDescription = "editor-static-respect-origin"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) { return (Resolve-Path -LiteralPath $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}
$root = Resolve-Root -InputRoot $WorkRoot

# --- token: User registry wins over stale process env; vault last (same order as check-cloudflare-security.ps1) ---
$vaultStore = $null
try {
    . (Join-Path $root "scripts\_vault-helpers.ps1")
    $vaultStore = Read-VaultStore (Resolve-VaultPath)
} catch { $vaultStore = $null }

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
if (-not $token) {
    Write-Output "RESULT: action=$Action status=skip reason=CLOUDFLARE_API_TOKEN not found in env/vault"
    exit 2
}
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$base = "https://api.cloudflare.com/client/v4/zones/$ZoneId/rulesets"
$phase = "http_request_cache_settings"

# --- hosts that serve the editors' static builds, read from nginx (the cache SSOT) ---
function Get-EditorHosts {
    param([string]$ConfPath)
    if (-not (Test-Path -LiteralPath $ConfPath)) { throw "nginx config not found: $ConfPath" }
    $found = New-Object System.Collections.Generic.List[string]
    $depth = 0; $names = @(); $serves = $false
    foreach ($raw in [System.IO.File]::ReadAllLines($ConfPath)) {
        $line = ($raw -replace '#.*$', '')
        if ($depth -eq 0 -and $line -match '^\s*server\s*\{') { $names = @(); $serves = $false }
        if ($depth -eq 1 -and $line -match '^\s*server_name\s+([^;]+);') { $names = @($Matches[1].Trim() -split '\s+') }
        if ($depth -ge 1 -and $line -match 'location\s+\^~\s+/(photo-pro|vector-pro)/') { $serves = $true }
        $depth += ([regex]::Matches($line, '\{')).Count - ([regex]::Matches($line, '\}')).Count
        if ($depth -eq 0 -and $serves) { foreach ($n in $names) { if ($n -and -not $found.Contains($n)) { $found.Add($n) } }; $serves = $false }
    }
    if ($found.Count -eq 0) { throw "no server block in $ConfPath serves /photo-pro/ or /vector-pro/" }
    return , @($found | Sort-Object)
}
$nginxConf = Join-Path $root "lobster-factory/infra/hetzner-phase1-core/nginx/default.conf"
try { $editorHosts = Get-EditorHosts $nginxConf } catch {
    Write-Output "RESULT: action=$Action status=error step=hosts detail=$($_.Exception.Message)"
    exit 4
}
$hostSet = ($editorHosts | ForEach-Object { '"' + $_ + '"' }) -join ' '

# --- the rule. Only eligibility + respect_origin: no TTL lives here (see .DESCRIPTION). ---
$desired = [ordered]@{
    description       = $RuleDescription
    expression        = '(http.host in {' + $hostSet + '} and (starts_with(http.request.uri.path, "/photo-pro/") or starts_with(http.request.uri.path, "/vector-pro/")))'
    action            = "set_cache_settings"
    action_parameters = [ordered]@{
        cache       = $true
        edge_ttl    = [ordered]@{ mode = "respect_origin" }
        browser_ttl = [ordered]@{ mode = "respect_origin" }
    }
    enabled           = $true
}

# Canonical form for comparison: keys sorted at every level, compact JSON. Cloudflare echoes rules back as
# PSCustomObjects in its own property order; an unsorted string compare would always differ.
function ConvertTo-Canonical {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [System.Collections.IDictionary]) {
        $o = [ordered]@{}
        foreach ($k in ($Value.Keys | Sort-Object)) { $o[[string]$k] = ConvertTo-Canonical $Value[$k] }
        return $o
    }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $o = [ordered]@{}
        foreach ($p in ($Value.PSObject.Properties | Sort-Object Name)) { $o[$p.Name] = ConvertTo-Canonical $p.Value }
        return $o
    }
    if ($Value -is [System.Array]) { return , @($Value | ForEach-Object { ConvertTo-Canonical $_ }) }
    return $Value
}
function Get-RuleFingerprint {
    # Only the fields this script owns. id / ref / version / last_updated are Cloudflare's, not content.
    param($Rule)
    $pick = [ordered]@{}
    foreach ($k in @('action', 'action_parameters', 'description', 'enabled', 'expression')) {
        $v = $null
        if ($Rule -is [System.Collections.IDictionary]) { if ($Rule.Contains($k)) { $v = $Rule[$k] } }
        elseif ($Rule.PSObject.Properties[$k]) { $v = $Rule.$k }
        $pick[$k] = ConvertTo-Canonical $v
    }
    return ($pick | ConvertTo-Json -Compress -Depth 10)
}
function Get-Rules {
    param($Ruleset)
    if ($Ruleset -and $Ruleset.PSObject.Properties['rules'] -and $Ruleset.rules) { return , @($Ruleset.rules) }
    return , @()
}
function Select-Mine {
    param($Rules)
    return , @($Rules | Where-Object { $_.PSObject.Properties['description'] -and $_.description -eq $RuleDescription })
}

# --- API: every failure maps to an exit code; 401/403 is a permission report, not a crash ---
function Invoke-Cf {
    param([string]$Method, [string]$Uri, $Body = $null)
    $req = @{ Method = $Method; Uri = $Uri; Headers = $headers; TimeoutSec = 20; ErrorAction = 'Stop' }
    if ($null -ne $Body) { $req.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)) }
    try {
        return @{ ok = $true; code = 200; data = (Invoke-RestMethod @req) }
    } catch {
        $code = $null
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        $detail = $_.Exception.Message
        try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message } } catch {}
        return @{ ok = $false; code = $code; detail = $detail }
    }
}
function Stop-Api {
    param($Resp, [string]$What)
    if ($Resp.code -eq 401) {
        Write-Output "RESULT: action=$Action status=unauthorized http=401 step=$What"
        Write-Output "  CLOUDFLARE_API_TOKEN is invalid or expired (401). Rotate it (scripts/secrets-vault.ps1) -- this is not a missing-scope problem."
        exit 3
    }
    if ($Resp.code -eq 403) {
        Write-Output "RESULT: action=$Action status=forbidden http=403 step=$What"
        Write-Output "  CLOUDFLARE_API_TOKEN lacks the Cache Rules scope. Cloudflare dashboard -> My Profile -> API Tokens -> this token -> Edit -> add permission: Zone > Cache Rules > Edit (zone aware-wave.com). Do not substitute another credential."
        exit 3
    }
    Write-Output "RESULT: action=$Action status=error http=$($Resp.code) step=$What detail=$($Resp.detail -replace '\s+', ' ')"
    exit 4
}

# 1. Read the entrypoint ruleset. 404 = the zone has never had a rule in this phase (documented behaviour).
$get = Invoke-Cf -Method GET -Uri "$base/phases/$phase/entrypoint"
$rulesetId = $null
$rules = @()
if ($get.ok) {
    $rulesetId = $get.data.result.id
    $rules = Get-Rules $get.data.result
} elseif ($get.code -ne 404) {
    Stop-Api -Resp $get -What "GET entrypoint"
}
$mine = Select-Mine $rules
if ($mine.Count -gt 1) {
    Write-Output "RESULT: action=$Action status=error step=match detail=$($mine.Count) rules share description '$RuleDescription' in ruleset $rulesetId; resolve by hand, nothing touched"
    exit 4
}
$current = if ($mine.Count -eq 1) { $mine[0] } else { $null }
$wantFp = Get-RuleFingerprint $desired
$haveFp = if ($current) { Get-RuleFingerprint $current } else { $null }
# Cache Rules stack and the last matching rule wins (developers.cloudflare.com/cache/how-to/cache-rules/order/):
# a later rule could re-set TTL or bypass for these paths, so "ours is stored" is only true in effect when it is last.
$isLast = ($null -ne $current) -and ($rules[$rules.Count - 1].id -eq $current.id)
$isMatch = ($null -ne $haveFp) -and ($haveFp -eq $wantFp) -and $isLast
$otherCount = $rules.Count - $mine.Count
$rsLabel = if ($rulesetId) { $rulesetId } else { 'none' }

switch ($Action) {
    'check' {
        if ($isMatch) {
            Write-Output "RESULT: action=check status=ok ruleset=$rulesetId rule=$($current.id) other_rules=$otherCount"
            exit 0
        }
        if ($current -and $haveFp -eq $wantFp) {
            Write-Output "RESULT: action=check status=not-last ruleset=$rulesetId rule=$($current.id) other_rules=$otherCount detail=a later rule can override it (last match wins); run -Action apply to move it last"
        } elseif ($current) {
            Write-Output "RESULT: action=check status=mismatch ruleset=$rulesetId rule=$($current.id) other_rules=$otherCount"
            Write-Output "  have: $haveFp"
            Write-Output "  want: $wantFp"
        } else {
            Write-Output "RESULT: action=check status=missing ruleset=$rsLabel other_rules=$otherCount"
        }
        exit 1
    }
    'apply' {
        if ($isMatch) {
            Write-Output "RESULT: action=apply status=unchanged ruleset=$rulesetId rule=$($current.id) other_rules=$otherCount"
            exit 0
        }
        if (-not $rulesetId) {
            # No ruleset in this phase yet: PUT creates it with exactly our rule (nothing else exists to preserve).
            $resp = Invoke-Cf -Method PUT -Uri "$base/phases/$phase/entrypoint" -Body @{ rules = @($desired) }
            if (-not $resp.ok) { Stop-Api -Resp $resp -What "PUT entrypoint (create)" }
            $step = "created-ruleset"
        } elseif ($current) {
            $body = [ordered]@{}
            foreach ($k in $desired.Keys) { $body[$k] = $desired[$k] }
            if (-not $isLast) { $body['position'] = @{ after = $rules[$rules.Count - 1].id } }
            $resp = Invoke-Cf -Method PATCH -Uri "$base/$rulesetId/rules/$($current.id)" -Body $body
            if (-not $resp.ok) { Stop-Api -Resp $resp -What "PATCH rule" }
            $step = "updated-rule"
        } else {
            $resp = Invoke-Cf -Method POST -Uri "$base/$rulesetId/rules" -Body $desired
            if (-not $resp.ok) { Stop-Api -Resp $resp -What "POST rule" }
            $step = "added-rule"
        }
        # Read back: proof is the stored rule matching, not the API's success flag.
        $after = Invoke-Cf -Method GET -Uri "$base/phases/$phase/entrypoint"
        if (-not $after.ok) { Stop-Api -Resp $after -What "GET entrypoint (verify)" }
        $afterRules = Get-Rules $after.data.result
        $stored = Select-Mine $afterRules
        $storedLast = ($stored.Count -eq 1) -and ($afterRules[$afterRules.Count - 1].id -eq $stored[0].id)
        if ($storedLast -and (Get-RuleFingerprint $stored[0]) -eq $wantFp) {
            Write-Output "RESULT: action=apply status=$step ruleset=$($after.data.result.id) rule=$($stored[0].id) other_rules=$($afterRules.Count - 1)"
            exit 0
        }
        Write-Output "RESULT: action=apply status=error step=verify detail=rule not stored as desired or not last after $step (found $($stored.Count))"
        exit 4
    }
    'remove' {
        if (-not $current) {
            Write-Output "RESULT: action=remove status=absent ruleset=$rsLabel other_rules=$otherCount"
            exit 0
        }
        $resp = Invoke-Cf -Method DELETE -Uri "$base/$rulesetId/rules/$($current.id)"
        if (-not $resp.ok) { Stop-Api -Resp $resp -What "DELETE rule" }
        $after = Invoke-Cf -Method GET -Uri "$base/phases/$phase/entrypoint"
        $left = 0
        if ($after.ok) { $left = (Select-Mine (Get-Rules $after.data.result)).Count }
        elseif ($after.code -ne 404) { Stop-Api -Resp $after -What "GET entrypoint (verify)" }
        if ($left -eq 0) {
            Write-Output "RESULT: action=remove status=removed ruleset=$rulesetId rule=$($current.id) other_rules=$otherCount"
            exit 0
        }
        Write-Output "RESULT: action=remove status=error step=verify detail=rule still present after DELETE"
        exit 4
    }
}
