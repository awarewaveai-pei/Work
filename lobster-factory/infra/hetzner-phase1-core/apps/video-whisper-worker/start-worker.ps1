param(
  [string]$SecretsFile = "C:\Users\user1115\staging API.txt"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runtime = Join-Path $Root "runtime"
$WorkerLog = Join-Path $Runtime "worker.out.log"
$WorkerError = Join-Path $Runtime "worker.err.log"
$TunnelLog = Join-Path $Runtime "tunnel.out.log"
$TunnelError = Join-Path $Runtime "tunnel.err.log"
function Secret([string]$Name) {
  $line = Get-Content -LiteralPath $SecretsFile | Where-Object { $_ -like "$Name=*" } | Select-Object -Last 1
  if (-not $line) { throw "Missing $Name" }
  $line.Substring($Name.Length + 1)
}
if (-not (Test-Path -LiteralPath $SecretsFile)) { throw "Secrets file missing" }
if (-not (Test-Path -LiteralPath (Join-Path $Runtime "cloudflared.exe"))) { throw "cloudflared missing" }
$workerToken = Secret "VIDEO_WHISPER_WORKER_TOKEN"
$tunnelToken = Secret "VIDEO_WHISPER_TUNNEL_TOKEN"
if (-not (Get-NetTCPConnection -LocalPort 8421 -State Listen -ErrorAction SilentlyContinue)) {
  $env:VIDEO_WHISPER_WORKER_TOKEN = $workerToken
  Start-Process -FilePath python -ArgumentList "-m","uvicorn","app:app","--host","127.0.0.1","--port","8421" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $WorkerLog -RedirectStandardError $WorkerError
  Remove-Item Env:VIDEO_WHISPER_WORKER_TOKEN -ErrorAction SilentlyContinue
}
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  $env:TUNNEL_TOKEN = $tunnelToken
  Start-Process -FilePath (Join-Path $Runtime "cloudflared.exe") -ArgumentList "tunnel","run","--token",$env:TUNNEL_TOKEN -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelError
  Remove-Item Env:TUNNEL_TOKEN -ErrorAction SilentlyContinue
}
