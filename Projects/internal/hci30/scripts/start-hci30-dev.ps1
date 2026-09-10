[CmdletBinding()]
param()

# Desktop-shortcut launcher (operator-requested 2026-09-10, "桌面做一個啟動
# 捷徑"). Ensures the dev DB is up, starts the app server in its own visible
# window (so this script itself can finish and close, leaving only the
# server's window open), waits for it to actually answer before opening the
# browser -- avoids the "blank page, refresh, oh it just wasn't ready yet"
# race a plain `npm start &` + immediate browser-open would hit.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'dev-db-init.ps1')
if ($LASTEXITCODE -ne 0) { throw 'dev-db-init.ps1 failed -- dev DB is not ready, not starting the app server.' }

$appDir = Join-Path $root 'app'
if (-not (Test-Path (Join-Path $appDir 'node_modules'))) {
  Write-Host 'First run: installing app dependencies...'
  Push-Location $appDir
  try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  } finally { Pop-Location }
}

Write-Host 'Starting HCI-30 app server in its own window...'
Start-Process powershell.exe -ArgumentList '-NoExit', '-NoProfile', '-Command', "cd '$appDir'; npm start"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -Uri 'http://localhost:4030' -UseBasicParsing -TimeoutSec 1 | Out-Null
    $ready = $true
    break
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { Write-Warning 'Server did not answer within 15s -- opening the browser anyway; check the server window for errors.' }

Start-Process 'http://localhost:4030'
Write-Host 'Done -- close the server window when you are finished.'
Start-Sleep -Seconds 2
