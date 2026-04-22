param(
    [string]$VaultSecretName = "AGENCY_OS_SLACK_WEBHOOK_URL",
    [string]$SshTarget = "hetzner",
    [string]$StorePath = ""
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
    throw "Vault missing secret: $VaultSecretName (run secrets-vault.ps1 -Action set-prompt -Name $VaultSecretName)"
}

$hook = Unprotect-Secret -CipherText $store.secrets[$VaultSecretName].cipher
if ([string]::IsNullOrWhiteSpace($hook)) {
    throw "Vault secret is empty: $VaultSecretName"
}
if ($hook -notmatch '^https://hooks\.slack\.com/services/') {
    throw "Unexpected Slack webhook URL format for $VaultSecretName"
}

$hookB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($hook))

$remote = @'
set -euo pipefail
HOOK="$(printf '%s' "__HOOK_B64__" | base64 -d)"

umask 077
{
  printf '%s\n' "WEBHOOK_URL=\"${HOOK}\""
  printf '%s\n' 'CHECK_URLS="https://uptime.aware-wave.com/dashboard https://app.aware-wave.com/ https://api.aware-wave.com/health https://n8n.aware-wave.com/healthz"'
  printf '%s\n' 'TIMEOUT_SEC=12'
} > /etc/default/awarewave-endpoint-alert
chmod 600 /etc/default/awarewave-endpoint-alert

umask 077
{
  printf '%s\n' 'SEND_SLACK="YES"'
  printf '%s\n' "SLACK_WEBHOOK_URL=\"${HOOK}\""
  printf '%s\n' 'DEFAULT_RECIPIENT_SLACK="#"'
} > /etc/netdata/health_alarm_notify.conf
chown root:netdata /etc/netdata/health_alarm_notify.conf
chmod 640 /etc/netdata/health_alarm_notify.conf

systemctl restart netdata

if command -v /usr/local/bin/slack-webhook-selftest.sh >/dev/null 2>&1; then
  /usr/local/bin/slack-webhook-selftest.sh
else
  echo "note: /usr/local/bin/slack-webhook-selftest.sh missing; skipping self-test" >&2
fi

systemctl restart awarewave-endpoint-alert.service || true
'@

$remote = $remote.Replace("__HOOK_B64__", $hookB64).Replace([string][char]13, "")

Write-Host "== sync: writing VPS env + netdata slack config + restart ==" -ForegroundColor Cyan
$remote | ssh $SshTarget "sudo bash -s"
if ($LASTEXITCODE -ne 0) {
    throw "Remote sync failed (ssh exit $LASTEXITCODE)"
}

Write-Host "sync-hetzner-slack-alert-webhooks: OK" -ForegroundColor Green
exit 0
