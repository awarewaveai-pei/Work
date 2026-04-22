param(
    [string]$SshTarget = "hetzner",
    [string]$RemoteDir = "/root/lobster-phase1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$coreDir = Join-Path $repoRoot "lobster-factory\infra\hetzner-phase1-core"
$compose = Join-Path $coreDir "docker-compose.observability.yml"
$dashProv = Join-Path $coreDir "observability\grafana\provisioning\dashboards\default.yaml"
$dashDir = Join-Path $coreDir "observability\grafana\dashboards"
$homeDash = Join-Path $coreDir "observability\grafana\dashboards-home\aw-obs-home.json"

if (-not (Test-Path -LiteralPath $compose)) { throw "Missing: $compose" }
if (-not (Test-Path -LiteralPath $dashProv)) { throw "Missing: $dashProv" }
if (-not (Test-Path -LiteralPath $dashDir)) { throw "Missing: $dashDir" }
if (-not (Test-Path -LiteralPath $homeDash)) { throw "Missing: $homeDash" }

$dashFiles = @(Get-ChildItem -LiteralPath $dashDir -Filter "*.json" -File | Sort-Object Name)
if ($dashFiles.Count -eq 0) {
    throw "No dashboard JSON in: $dashDir (file-provisioned folder must not be empty)"
}

$rid = [Guid]::NewGuid().ToString("n")
$remoteStage = "/tmp/aw-grafana-sync-$rid"

Write-Host "== sync: observability compose + Grafana home + $($dashFiles.Count) provisioned dashboard(s) -> ${SshTarget}:$RemoteDir ==" -ForegroundColor Cyan

ssh $SshTarget "mkdir -p '$remoteStage' && chmod 0755 '$remoteStage'"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed (exit $LASTEXITCODE)" }

$scpArgs = @($compose, $dashProv, $homeDash) + ($dashFiles | ForEach-Object { $_.FullName })
scp @scpArgs "${SshTarget}:${remoteStage}/"
if ($LASTEXITCODE -ne 0) { throw "scp failed (exit $LASTEXITCODE)" }

$remote = @'
set -euo pipefail
ROOT="__REMOTE_DIR__"
STAGE="__STAGE__"
DASH_PROV="${ROOT}/observability/grafana/provisioning/dashboards"
DASH="${ROOT}/observability/grafana/dashboards"
HOME_D="${ROOT}/observability/grafana/dashboards-home"

sudo install -m 0644 -D "${STAGE}/docker-compose.observability.yml" "${ROOT}/docker-compose.observability.yml"
sudo install -m 0644 -D "${STAGE}/default.yaml" "${DASH_PROV}/default.yaml"
sudo install -m 0644 -D "${STAGE}/aw-obs-home.json" "${HOME_D}/aw-obs-home.json"

shopt -s nullglob
for f in "${STAGE}"/*.json; do
  base="$(basename "$f")"
  if [[ "$base" == "aw-obs-home.json" ]]; then
    continue
  fi
  sudo install -m 0644 -D "$f" "${DASH}/${base}"
done
shopt -u nullglob

chmod 755 "${ROOT}/observability" "${ROOT}/observability/grafana" "${ROOT}/observability/grafana/provisioning" 2>/dev/null || true
chmod 755 "${DASH_PROV}" "${DASH}" "${HOME_D}" 2>/dev/null || true
rm -rf "${STAGE}"

sudo docker compose --env-file "${ROOT}/observability/.env.observability" -f "${ROOT}/docker-compose.observability.yml" up -d grafana
'@

$remote = $remote.Replace("__REMOTE_DIR__", $RemoteDir).Replace("__STAGE__", $remoteStage).Replace([string][char]13, "")

$tmpSh = Join-Path $env:TEMP ("obs-grafana-content-" + $rid + ".sh")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tmpSh, $remote.Replace("`r`n", "`n"), $utf8NoBom)

try {
    scp $tmpSh "${SshTarget}:/tmp/obs-grafana-content.sh"
    if ($LASTEXITCODE -ne 0) { throw "scp script failed (exit $LASTEXITCODE)" }
    ssh $SshTarget "chmod 0755 /tmp/obs-grafana-content.sh && sudo bash /tmp/obs-grafana-content.sh && rm -f /tmp/obs-grafana-content.sh"
    if ($LASTEXITCODE -ne 0) { throw "Remote bash failed (exit $LASTEXITCODE)" }
} finally {
    Remove-Item -LiteralPath $tmpSh -Force -ErrorAction SilentlyContinue
}

Write-Host "sync-hetzner-observability-grafana-content: OK" -ForegroundColor Green
Write-Host "After reload: Grafana Home = AwareWave landing (Loki). More dashboards: Dashboards -> Browse -> AwareWave." -ForegroundColor DarkGray
exit 0
