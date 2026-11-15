# One-time laptop setup for Codex 免費生圖: registers the awarewave-codex:// link so the app's 「啟動筆電」 button
# starts scripts/codex-image-worker.mjs in a small minimized window. Nothing runs in the background; the worker stops
# itself after 30 idle minutes. Current user only (HKCU), no admin rights.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-image-worker-install.ps1            # install
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-image-worker-install.ps1 -Uninstall
#
# The link takes no arguments: whatever follows awarewave-codex:// is ignored, so a web page can at most start this
# same worker (which only talks to app.aware-wave.com with the secret it already has).
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"
$key = "HKCU:\Software\Classes\awarewave-codex"

if ($Uninstall) {
  Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue
  Write-Output "已移除 awarewave-codex:// 連結。"
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$worker = Join-Path $PSScriptRoot "codex-image-worker.mjs"
if (-not (Test-Path $worker)) { throw "找不到 $worker" }
$workDir = Split-Path $PSScriptRoot -Parent

# cmd /c start /min: a minimized window titled 「Codex 生圖」 the operator can see and close; %1 (the URL) is not passed on.
$command = "`"$env:ComSpec`" /c start `"Codex 生圖`" /min /d `"$workDir`" `"$node`" `"$worker`""

New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name "(default)" -Value "URL:AwareWave Codex 生圖"
Set-ItemProperty -Path $key -Name "URL Protocol" -Value ""
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$key\shell\open\command" -Name "(default)" -Value $command

Write-Output "完成：app 的「啟動筆電」按鈕現在會開啟 Codex 生圖工人。"
if (-not (Get-ItemProperty -Path "HKCU:\Environment" -Name CODEX_WORKER_SECRET -ErrorAction SilentlyContinue)) {
  Write-Output "注意：Windows 使用者環境沒有 CODEX_WORKER_SECRET，按鈕開的工人會連不上；先跑一次 . .\mcp\user-env.ps1。"
}
Write-Output "指令：$command"
