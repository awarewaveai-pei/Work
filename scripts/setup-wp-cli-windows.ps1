<#
.SYNOPSIS
  在本機使用者目錄安裝 WP-CLI（wp.phar + wp.cmd），需已安裝 PHP 且在 PATH 內。

.DESCRIPTION
  - 下載官方 wp-cli.phar 到 %LOCALAPPDATA%\Programs\wp-cli\
  - 產生 wp.cmd，方便在 PowerShell / cmd 執行 `wp`
  - 若未偵測到 php.exe，結束並提示 winget 安裝指令

.PARAMETER SkipDownload
  若 wp.phar 已存在，只重建 wp.cmd。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1

.NOTES
  搭配 WordPress 網站根目錄與 MySQL 的步驟見 lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md
#>
param([switch]$SkipDownload)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$php = Get-Command php -ErrorAction SilentlyContinue
if (-not $php) {
    Write-Host "PHP not found on PATH." -ForegroundColor Yellow
    Write-Host "Install (example): winget install --id PHP.PHP.NTS.8.4 -e --accept-package-agreements" -ForegroundColor Cyan
    Write-Host "Then reopen PowerShell and re-run this script." -ForegroundColor Cyan
    exit 1
}

$dir = Join-Path $env:LOCALAPPDATA "Programs\wp-cli"
$phar = Join-Path $dir "wp.phar"
$cmd  = Join-Path $dir "wp.cmd"

if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

if (-not $SkipDownload -or -not (Test-Path -LiteralPath $phar)) {
    $url = "https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar"
    Write-Host "Downloading wp-cli.phar ..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $phar -UseBasicParsing
}

$cmdContent = @"
@echo off
setlocal
php "%~dp0wp.phar" %*
exit /b %ERRORLEVEL%
"@
Set-Content -LiteralPath $cmd -Value $cmdContent -Encoding ASCII

Write-Host "WP-CLI installed:" -ForegroundColor Green
Write-Host "  $phar"
Write-Host "  $cmd"
Write-Host ""
Write-Host "Add to PATH (current user), then reopen terminal:" -ForegroundColor Cyan
Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$dir', 'User')"
Write-Host ""
Write-Host "Verify: wp --info" -ForegroundColor Cyan
