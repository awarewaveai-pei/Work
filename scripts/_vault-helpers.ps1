#requires -Version 5.1
<#
.SYNOPSIS
  Dot-source helper library for DPAPI-backed vault read access.

.DESCRIPTION
  Centralises the vault read pattern that was previously duplicated across
  sync-slack-alert-webhooks.ps1, command-plane-smoke.ps1, and others.
  New scripts SHOULD dot-source this. Older inline copies will be migrated
  on next touch (NOT a forced rewrite — avoids regression risk in working code).

  Usage:
    . (Join-Path $PSScriptRoot "_vault-helpers.ps1")
    $store = Read-VaultStore (Resolve-VaultPath)
    $val = Get-VaultSecret -Store $store -Name "TELEGRAM_BOT_TOKEN"
    if (Test-VaultSecret -Store $store -Name "FOO") { ... }

  Filenames starting with `_` indicate "library, not standalone" and are
  excluded from runners that auto-discover scripts/*.ps1.
#>

Set-StrictMode -Version Latest

function Resolve-VaultPath {
    [CmdletBinding()]
    param([string]$Custom)
    if ($Custom) { return $Custom }
    return (Join-Path $env:LOCALAPPDATA "AgencyOS\secrets\vault.json")
}

function Read-VaultStore {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Secrets vault not found: $Path (run scripts/secrets-vault.ps1 -Action init first)"
    }
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if (-not $raw.Trim()) { throw "Secrets vault is empty: $Path" }
    $obj = $raw | ConvertFrom-Json
    if (-not $obj.PSObject.Properties.Name.Contains("secrets") -or -not $obj.secrets) {
        throw "Secrets vault missing secrets map: $Path"
    }
    return $obj
}

function Unprotect-VaultSecret {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$CipherText)
    $secure = ConvertTo-SecureString -String $CipherText
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Test-VaultSecret {
    # Returns $true only when the entry exists AND has a non-empty value.
    # Use -RequireNonEmpty:$false to revert to existence-only check (rare).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Store,
        [Parameter(Mandatory)][string]$Name,
        [switch]$RequireNonEmpty = $true
    )
    $entry = $Store.secrets.PSObject.Properties[$Name]
    if (-not $entry) { return $false }
    if (-not $RequireNonEmpty) { return $true }
    try {
        $plain = Unprotect-VaultSecret -CipherText $entry.Value.cipher
    } catch {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($plain)) { return $false }
    return $true
}

function Get-VaultSecret {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Store,
        [Parameter(Mandatory)][string]$Name,
        [switch]$AllowMissing
    )
    $entry = $Store.secrets.PSObject.Properties[$Name]
    if (-not $entry) {
        if ($AllowMissing) { return $null }
        throw "Secret not found in vault: $Name"
    }
    return Unprotect-VaultSecret -CipherText $entry.Value.cipher
}

function Test-VaultValueLooksMasked {
    # True when a value looks like the output of `secrets-vault.ps1 -Action get`,
    # which is CONFIRM-ONLY and prints e.g. `8584****pI`. Callers have repeatedly
    # mistaken that masked line for the real secret (2026-08-12: it was POSTed to
    # the Telegram API, and written back into the vault). Any real secret in this
    # system - bot token, chat id, base64url webhook secret, API key - is
    # asterisk-free, so this predicate has no false positives.
    [CmdletBinding()]
    param([string]$Value)
    return ($Value -match '\*')
}

function Get-VaultSecretFingerprint {
    # Returns a stable SHA-256 prefix of the secret value, useful for cross-machine
    # diff comparisons without exposing the value itself.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Store,
        [Parameter(Mandatory)][string]$Name,
        [int]$PrefixChars = 12
    )
    $plain = Get-VaultSecret -Store $Store -Name $Name -AllowMissing
    if ($null -eq $plain) { return $null }
    $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
        return $hash.Substring(0, [Math]::Min($PrefixChars, $hash.Length))
    } finally {
        $sha.Dispose()
    }
}
