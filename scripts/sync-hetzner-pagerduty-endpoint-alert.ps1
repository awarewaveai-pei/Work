param(
    [string]$VaultSecretName = "PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT",
    [string]$SshTarget = "hetzner",
    [string]$StorePath = "",
    [switch]$SkipIfMissing
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-VaultPath([string]$Custom) {
    if ($Custom) { return $Custom }
    return (Join-Path $env:LOCALAPPDATA "AgencyOS\secrets\vault.json")
}

function Read-VaultStore([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Secrets vault not found: $Path"
    }
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if (-not $raw.Trim()) {
        throw "Secrets vault is empty: $Path"
    }
    $obj = $raw | ConvertFrom-Json
    if (-not $obj.PSObject.Properties.Name.Contains("secrets") -or -not $obj.secrets) {
        throw "Secrets vault missing secrets map: $Path"
    }
    if (-not ($obj.secrets -is [System.Collections.IDictionary])) {
        $map = @{}
        foreach ($p in $obj.secrets.PSObject.Properties) {
            $map[$p.Name] = $p.Value
        }
        $obj.secrets = $map
    }
    return $obj
}

function Unprotect-Secret([string]$CipherText) {
    $secure = ConvertTo-SecureString -String $CipherText
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$vaultPath = Resolve-VaultPath -Custom $StorePath
$store = Read-VaultStore -Path $vaultPath
if (-not $store.secrets.ContainsKey($VaultSecretName)) {
    if ($SkipIfMissing) {
        Write-Host "sync-hetzner-pagerduty-endpoint-alert: vault missing $VaultSecretName - skipped (-SkipIfMissing)" -ForegroundColor Yellow
        exit 0
    }
    throw "Vault missing secret: $VaultSecretName (run secrets-vault.ps1 -Action set-prompt -Name $VaultSecretName)"
}

$key = Unprotect-Secret -CipherText $store.secrets[$VaultSecretName].cipher
if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Vault secret is empty: $VaultSecretName"
}
$key = $key.Trim()
if ($key.Length -lt 20) {
    throw "Unexpected PagerDuty routing key length for $VaultSecretName (too short)"
}

$keyB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($key))

$remote = @'
set -euo pipefail
KEY="$(printf '%s' "__KEY_B64__" | base64 -d)"

umask 077
{
  printf '%s\n' "# Managed by sync-hetzner-pagerduty-endpoint-alert.ps1 (do not commit)"
  printf '%s\n' "PAGERDUTY_ROUTING_KEY=\"${KEY}\""
  printf '%s\n' '# Optional override:'
  printf '%s\n' '# PAGERDUTY_DEDUP_KEY="awarewave-endpoint-myhost"'
} > /etc/default/awarewave-endpoint-alert.pagerduty
chmod 600 /etc/default/awarewave-endpoint-alert.pagerduty

systemctl daemon-reload 2>/dev/null || true
systemctl restart awarewave-endpoint-alert.service || true
'@

$remote = $remote.Replace("__KEY_B64__", $keyB64).Replace([string][char]13, "")

Write-Host "== sync: writing /etc/default/awarewave-endpoint-alert.pagerduty + restart timer service ==" -ForegroundColor Cyan
$remote | ssh $SshTarget "sudo bash -s"
if ($LASTEXITCODE -ne 0) {
    throw "Remote sync failed (ssh exit $LASTEXITCODE)"
}

Write-Host "sync-hetzner-pagerduty-endpoint-alert: OK" -ForegroundColor Green
Write-Host "Next: ensure unit loads optional env file (EnvironmentFile=-/etc/default/awarewave-endpoint-alert.pagerduty) then: sudo systemctl daemon-reload && sudo systemctl restart awarewave-endpoint-alert.timer" -ForegroundColor DarkGray
exit 0
