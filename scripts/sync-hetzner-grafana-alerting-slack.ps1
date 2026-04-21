param(
    [string]$VaultSecretName = "AGENCY_OS_SLACK_WEBHOOK_URL",
    [string]$SshTarget = "hetzner",
    [string]$StorePath = "",
    [string]$RemoteDir = "/root/lobster-phase1",
    [string]$ContactPointName = "infra-alerts-slack"
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

# YAML: Slack URL must be quoted; escape backslashes and quotes for YAML double-quoted string
$yUrl = $hook.Replace('\', '\\').Replace('"', '\"')
$cpName = $ContactPointName
$rcvUid = "infra_slack_rcv"

$yaml = @"
# Managed by sync-hetzner-grafana-alerting-slack.ps1 — do not commit webhook to git.
apiVersion: 1

contactPoints:
  - orgId: 1
    name: $cpName
    receivers:
      - uid: $rcvUid
        type: slack
        settings:
          url: "$yUrl"
          username: grafana-obs

resetPolicies:
  - 1

policies:
  - orgId: 1
    receiver: $cpName
    group_by:
      - alertname
      - grafana_folder
    routes: []
"@

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($yaml))

$remote = @'
set -euo pipefail
ROOT="__REMOTE_DIR__"
OBS_DIR="${ROOT}/observability/grafana/provisioning/alerting"
DS_DIR="${ROOT}/observability/grafana/provisioning/datasources"
mkdir -p "${OBS_DIR}"
printf '%s' "__B64__" | base64 -d > "${OBS_DIR}/awarewave-slack-contact-and-policy.yaml"
# Grafana runs as non-root in-container; host dirs must be traversable (avoid umask 077 on dirs -> 700).
chmod 755 "${ROOT}/observability" "${ROOT}/observability/grafana" "${ROOT}/observability/grafana/provisioning" "${OBS_DIR}" 2>/dev/null || true
if [[ -d "${DS_DIR}" ]]; then chmod 755 "${DS_DIR}"; fi
chmod 644 "${OBS_DIR}/awarewave-slack-contact-and-policy.yaml"

# Use absolute paths: sudo bash -s may not preserve cwd the same as interactive ssh
sudo docker compose --env-file "${ROOT}/observability/.env.observability" -f "${ROOT}/docker-compose.observability.yml" restart grafana
'@

$remote = $remote.Replace("__REMOTE_DIR__", $RemoteDir).Replace("__B64__", $b64).Replace([string][char]13, "")

# Write LF-only script and scp it: piping large base64 into "sudo bash -s" can mis-parse on some Windows/OpenSSH combos.
$tmpSh = Join-Path $env:TEMP ("grafana-alert-sync-" + [Guid]::NewGuid().ToString("n") + ".sh")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tmpSh, $remote.Replace("`r`n", "`n"), $utf8NoBom)

Write-Host "== sync: Grafana unified alerting (Slack contact + root policy) + restart grafana ==" -ForegroundColor Cyan
try {
    scp $tmpSh "${SshTarget}:/tmp/grafana-alert-sync.sh"
    if ($LASTEXITCODE -ne 0) { throw "scp failed (exit $LASTEXITCODE)" }
    ssh $SshTarget "chmod 0755 /tmp/grafana-alert-sync.sh && sudo bash /tmp/grafana-alert-sync.sh && rm -f /tmp/grafana-alert-sync.sh"
    if ($LASTEXITCODE -ne 0) { throw "Remote bash failed (exit $LASTEXITCODE)" }
} finally {
    Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue
}

Write-Host "sync-hetzner-grafana-alerting-slack: OK" -ForegroundColor Green
Write-Host "In Grafana: Alerting -> Contact points -> confirm '$cpName'. Create alert rules under Alerting -> Alert rules (Loki queries)." -ForegroundColor DarkGray
exit 0
