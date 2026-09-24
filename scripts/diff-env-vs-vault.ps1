#requires -Version 5.1
<#
.SYNOPSIS
  Compare deployed env vars on a remote host against the local DPAPI vault.

.DESCRIPTION
  Computes a stable SHA-256 prefix (12 chars) for each named secret from BOTH
  sides without exposing the value, then prints a side-by-side diff.

  Three states per row:
    [MATCH]   container fingerprint == vault fingerprint
    [DIFF]    both present but different (deployment drift — fix needed)
    [-VAULT]  present in container, missing from vault (vault gap)
    [-DEPLOY] present in vault, missing on container (deployment gap)

  Use cases:
    - Investigating "Sentry says 401 from API key — is the deployed key the same as vault?"
    - Verifying a sync-* script actually pushed the latest secret to prod
    - Auditing a new machine after bootstrap

.PARAMETER Target
  How to reach the remote host. Currently supports two patterns:
    -Target docker:<container-name>  -> docker exec on local box (used inside SSH session)
    -Target ssh:<host-alias>:<container-name>  -> SSH to host, then docker exec
  Default: ssh:prod:lobster-next-admin ("prod" = the production host from scripts/lib/prod-host.ps1;
  any other alias / user@host is passed to ssh as-is)

.PARAMETER Mapping
  Hashtable of "vault-key" -> "container-env-var" pairs. Use this when the names
  differ (e.g. vault SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY vs container
  SUPABASE_SERVICE_ROLE_KEY). When the names are identical, list each name once.

.PARAMETER PresetSGNextAdmin
  Convenience: pre-fills the standard SG next-admin Phase 2 mapping.

.EXAMPLE
  # Full SG next-admin Phase 2 audit
  .\scripts\diff-env-vs-vault.ps1 -PresetSGNextAdmin

.EXAMPLE
  # Custom audit
  .\scripts\diff-env-vs-vault.ps1 -Target ssh:prod:trigger-webapp `
    -Mapping @{ TRIGGER_ACCESS_TOKEN='TRIGGER_ACCESS_TOKEN' }
#>

[CmdletBinding()]
param(
    [string] $Target = 'ssh:prod:lobster-next-admin',
    [hashtable] $Mapping = @{},
    [switch] $PresetSGNextAdmin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot "_vault-helpers.ps1")
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
. (Join-Path $PSScriptRoot "lib\prod-host.ps1")  # CP950 protection for ssh/docker stdout capture

if ($PresetSGNextAdmin) {
    $Mapping = @{
        'TELEGRAM_BOT_TOKEN'                  = 'TELEGRAM_BOT_TOKEN'
        'TELEGRAM_WEBHOOK_SECRET'             = 'TELEGRAM_WEBHOOK_SECRET'
        'TELEGRAM_ALLOWED_USER_IDS'           = 'TELEGRAM_ALLOWED_USER_IDS'
        'TELEGRAM_ALLOWED_CHAT_IDS'           = 'TELEGRAM_ALLOWED_CHAT_IDS'
        'COMMAND_PLANE_DEFAULT_ORG_ID'        = 'COMMAND_PLANE_DEFAULT_ORG_ID'
        'ANTHROPIC_API_KEY'                   = 'ANTHROPIC_API_KEY'
        'SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY' = 'SUPABASE_SERVICE_ROLE_KEY'
    }
}

if ($Mapping.Count -eq 0) {
    throw "Empty -Mapping. Use -PresetSGNextAdmin or pass -Mapping @{ vault-key = container-env-var }."
}

# Parse Target.
if ($Target -match '^ssh:([^:]+):(.+)$') {
    $sshAlias = $matches[1]
    $container = $matches[2]
    $useSsh = $true
} elseif ($Target -match '^docker:(.+)$') {
    $sshAlias = $null
    $container = $matches[1]
    $useSsh = $false
} else {
    throw "Unrecognised -Target format: $Target. Use 'ssh:<host-alias>:<container>' or 'docker:<container>'."
}

Write-Host ("Target: {0}" -f $Target) -ForegroundColor Cyan
Write-Host ""

# Build the inner shell script (will be base64-encoded to avoid quoting headaches
# when passed across Windows -> ssh -> bash -> docker exec sh layers).
$envVars = ($Mapping.Values | Sort-Object -Unique) -join ' '
$shellScript = @"
for var in $envVars; do
  val=`$(printenv "`$var" || true)
  if [ -z "`$val" ]; then
    printf '%s|MISSING|MISSING\n' "`$var"
  else
    sha=`$(printf '%s' "`$val" | sha256sum | cut -c1-12)
    len=`${#val}
    printf '%s|%s|%s\n' "`$var" "`$sha" "`$len"
  fi
done
"@

# Avoid Windows->ssh->bash->docker quoting layers + PowerShell's CRLF
# pipe-encoding by base64-encoding the script and decoding inside the
# container. The whole transport is one line of base64 -> no newline issues.
$shellScriptLf = $shellScript -replace "`r`n", "`n"
$shellScriptB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($shellScriptLf))
$wrapper = "echo $shellScriptB64 | base64 -d | sh"

if ($useSsh) {
    # Single-string outer + single-quoted inner is the only form that ssh +
    # OpenSSH on Windows reliably forwards intact. Base64 contains no single
    # quotes so this is safe.
    # Force UTF-8 console — remote `printf` emits UTF-8; CP950 default would mojibake.
    $sshArgs = Get-ProdSshArgs $(if ($sshAlias -eq 'prod') { '' } else { $sshAlias })
    $rawOutput = Invoke-WithUtf8Console { & ssh @sshArgs "docker exec $container sh -c '$wrapper'" 2>&1 }
} else {
    $rawOutput = Invoke-WithUtf8Console { & docker exec $container sh -c $wrapper 2>&1 }
}
if ($LASTEXITCODE -ne 0) {
    throw "Remote fetch failed (exit $LASTEXITCODE):`n$rawOutput"
}

$containerFp = @{}
foreach ($line in ($rawOutput -split "`n")) {
    $trim = $line.Trim()
    if (-not $trim) { continue }
    $parts = $trim -split '\|', 3
    if ($parts.Count -ge 2) {
        $containerFp[$parts[0]] = @{ Sha = $parts[1]; Len = if ($parts.Count -ge 3) { $parts[2] } else { '?' } }
    }
}

# Read vault.
$store = Read-VaultStore (Resolve-VaultPath)

# Compare row by row.
$rows = @()
foreach ($key in ($Mapping.Keys | Sort-Object)) {
    $vaultName = $key
    $envName = $Mapping[$key]
    $vaultSha = Get-VaultSecretFingerprint -Store $store -Name $vaultName
    $contInfo = $containerFp[$envName]
    $contSha = if ($contInfo) { $contInfo.Sha } else { $null }

    $status = '?'
    if ($null -eq $vaultSha -and ($null -eq $contSha -or $contSha -eq 'MISSING')) {
        $status = '[BOTH-MISS]'
    } elseif ($null -eq $vaultSha) {
        $status = '[-VAULT]'
    } elseif ($null -eq $contSha -or $contSha -eq 'MISSING') {
        $status = '[-DEPLOY]'
    } elseif ($vaultSha -eq $contSha) {
        $status = '[MATCH]'
    } else {
        $status = '[DIFF]'
    }

    $rows += [PSCustomObject]@{
        Status     = $status
        VaultKey   = $vaultName
        EnvVar     = $envName
        VaultSha12 = $(if ($vaultSha) { $vaultSha } else { '------------' })
        ContSha12  = $(if ($contSha)  { $contSha  } else { '------------' })
    }
}

$rows | Format-Table -AutoSize Status, VaultKey, EnvVar, VaultSha12, ContSha12

$diffCount = @($rows | Where-Object { $_.Status -ne '[MATCH]' }).Count
if ($diffCount -eq 0) {
    Write-Host "All $($rows.Count) entries match." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$diffCount mismatch(es) — review above." -ForegroundColor Yellow
    exit 1
}
