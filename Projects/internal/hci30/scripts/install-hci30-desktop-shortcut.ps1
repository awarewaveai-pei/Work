[CmdletBinding()]
param()

# Creates (or re-creates) the Desktop shortcut for start-hci30-dev.ps1
# (operator-requested 2026-09-10, "桌面做一個啟動捷徑"). The .lnk itself is
# machine-local state, not something git can track -- this script is the
# SSOT so the shortcut can be rebuilt on any machine or after a reinstall,
# same "script defines the local machine state" pattern already used for
# the Docker Desktop runtime task registration
# (scripts/register-docker-desktop-runtime-tasks.ps1). Idempotent: re-running
# overwrites the same .lnk rather than creating a duplicate.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $PSScriptRoot 'start-hci30-dev.ps1'
if (-not (Test-Path -LiteralPath $target)) { throw "start-hci30-dev.ps1 not found at $target" }

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'HCI-30.lnk'

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$target`""
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Launch HCI-30 dev DB + app server, then open the browser'
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
Write-Host "  -> $target"
