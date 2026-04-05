<#
.SYNOPSIS
  啟動本機 MariaDB（無 Windows 服務時以背景 mysqld）、建庫、並在 repo 外 .scratch 目錄安裝 WordPress。

.DESCRIPTION
  - 預設 MariaDB：`C:\Program Files\MariaDB 12.2`（winget MariaDB.Server）
  - 若 `mysql -u root` 無法連線，會以 `Start-Process` 啟動 `mysqld`（需正確帶入含空白路徑的 `--defaults-file`）
  - WordPress 根目錄預設：`<repo>\.scratch\wordpress-pilot`（應已列於 .gitignore）
  - `-EnsurePhpIni`：在 `php.exe` 同目錄建立/調整 `php.ini`（extension_dir、openssl、curl、mysqli、memory_limit），供 WP-CLI 與 WordPress 使用

.PARAMETER WpRoot
  WordPress 安裝目錄。

.PARAMETER DbName
  要建立的資料庫名稱（預設 wordpress_dev）。

.PARAMETER MariaDbRoot
  MariaDB 安裝根目錄（其下需有 `bin\mysqld.exe` 與 `data\my.ini`）。

.PARAMETER SkipWordPress
  僅確保資料庫運行並建庫，不下載/安裝 WordPress。

.PARAMETER EnsurePhpIni
  自動調整 PHP `php.ini`（本機開發用）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni

.NOTES
  詳見 lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md
#>
param(
    [string]$WpRoot = "",
    [string]$DbName = "wordpress_dev",
    [string]$MariaDbRoot = "C:\Program Files\MariaDB 12.2",
    [switch]$SkipWordPress,
    [switch]$EnsurePhpIni
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    $here = $PSScriptRoot
    if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
    return (Resolve-Path (Join-Path $here "..")).Path
}

function Test-MysqlReady {
    param([string]$MysqlExe)
    $probe = & $MysqlExe -u root -e "SELECT 1" 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Wait-MysqlReady {
    param(
        [string]$MysqlExe,
        [int]$MaxSeconds = 45
    )
    $deadline = [datetime]::UtcNow.AddSeconds($MaxSeconds)
    while ([datetime]::UtcNow -lt $deadline) {
        if (Test-MysqlReady -MysqlExe $MysqlExe) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-MariaDbBackground {
    param(
        [string]$MysqldExe,
        [string]$DefaultsFile,
        [string]$LogDir
    )
    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    $outLog = Join-Path $LogDir "mysqld-stdout.log"
    $errLog = Join-Path $LogDir "mysqld-stderr.log"
    $arg = "--defaults-file=`"$DefaultsFile`""
    $p = Start-Process -FilePath $MysqldExe -ArgumentList $arg -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
    return $p
}

function Ensure-PhpIniForWp {
    $phpCmd = Get-Command php -ErrorAction SilentlyContinue
    if (-not $phpCmd) {
        Write-Host "PHP not on PATH; install with: winget install --id PHP.PHP.NTS.8.4 -e" -ForegroundColor Yellow
        return
    }
    $phpDir = Split-Path -Parent $phpCmd.Source
    $ini = Join-Path $phpDir "php.ini"
    $iniDev = Join-Path $phpDir "php.ini-development"
    if (-not (Test-Path -LiteralPath $iniDev)) {
        Write-Host "No php.ini-development next to php.exe; skip php.ini tweaks." -ForegroundColor Yellow
        return
    }
    if (-not (Test-Path -LiteralPath $ini)) {
        Copy-Item -LiteralPath $iniDev -Destination $ini -Force
        Write-Host "Created $ini from php.ini-development" -ForegroundColor Green
    }
    $extDir = Join-Path $phpDir "ext"
    $c = Get-Content -LiteralPath $ini -Raw

    if ($c -notmatch '(?m)^extension_dir\s*=') {
        $c = $c -replace '(?m)^;extension_dir = "ext"\s*$', "extension_dir = `"$extDir`""
    }
    foreach ($pair in @(
        @('(?m)^;extension=curl\s*$', 'extension=curl'),
        @('(?m)^;extension=openssl\s*$', 'extension=openssl'),
        @('(?m)^;extension=mysqli\s*$', 'extension=mysqli')
    )) {
        $c = $c -replace $pair[0], $pair[1]
    }
    $c = $c -replace '(?m)^memory_limit\s*=\s*128M\s*$', 'memory_limit = 512M'

    Set-Content -LiteralPath $ini -Value $c -NoNewline
    Write-Host "PHP ini updated for WP-CLI (extension_dir, curl, openssl, mysqli, memory_limit)." -ForegroundColor Green
}

$repo = Get-RepoRoot
if (-not $WpRoot) {
    $WpRoot = Join-Path $repo ".scratch\wordpress-pilot"
}

$mysqld = Join-Path $MariaDbRoot "bin\mysqld.exe"
$mysql = Join-Path $MariaDbRoot "bin\mysql.exe"
$myIni = Join-Path $MariaDbRoot "data\my.ini"

if (-not (Test-Path -LiteralPath $mysqld)) {
    Write-Error "mysqld not found: $mysqld (set -MariaDbRoot or install MariaDB.Server via winget)"
}

if (-not (Test-Path -LiteralPath $myIni)) {
    Write-Error "my.ini not found: $myIni"
}

if ($EnsurePhpIni) {
    Ensure-PhpIniForWp
}

$wpCli = Get-Command wp -ErrorAction SilentlyContinue
if (-not $SkipWordPress -and -not $wpCli) {
    Write-Error "wp not on PATH. Run: powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1"
}

if (-not (Test-MysqlReady -MysqlExe $mysql)) {
    Write-Host "MariaDB not accepting connections; starting mysqld (background)..." -ForegroundColor Cyan
    $logDir = Join-Path $repo ".scratch\mariadb-logs"
    $proc = Start-MariaDbBackground -MysqldExe $mysqld -DefaultsFile $myIni -LogDir $logDir
    if (-not (Wait-MysqlReady -MysqlExe $mysql)) {
        $errLog = Join-Path $logDir "mysqld-stderr.log"
        Write-Error "MariaDB did not become ready. Check logs under $logDir (e.g. $errLog). mysqld PID was $($proc.Id)."
    }
    Write-Host "MariaDB is ready (mysqld PID $($proc.Id))." -ForegroundColor Green
} else {
    Write-Host "MariaDB already accepting connections." -ForegroundColor Green
}

& $mysql -u root -e "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" | Out-Null
Write-Host "Database '$DbName' ensured." -ForegroundColor Green

if ($SkipWordPress) {
    Write-Host "SkipWordPress: done." -ForegroundColor Cyan
    exit 0
}

New-Item -ItemType Directory -Path $WpRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $WpRoot "wp-load.php"))) {
    Write-Host "Downloading WordPress..." -ForegroundColor Cyan
    & wp core download --path="$WpRoot"
}

if (-not (Test-Path -LiteralPath (Join-Path $WpRoot "wp-config.php"))) {
    Write-Host "Creating wp-config.php..." -ForegroundColor Cyan
    & wp config create --path="$WpRoot" --dbname=$DbName --dbuser=root --dbpass= --dbhost=127.0.0.1
}

$installed = & wp core is-installed --path="$WpRoot" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Running wp core install..." -ForegroundColor Cyan
    & wp core install --path="$WpRoot" --url=http://localhost --title=Pilot --admin_user=admin --admin_password=change-me --admin_email=dev@local.test
} else {
    Write-Host "WordPress already installed at $WpRoot" -ForegroundColor Green
}

$siteUrl = & wp option get siteurl --path="$WpRoot"
Write-Host "siteurl: $siteUrl" -ForegroundColor Green
Write-Host "WP_ROOT for lobster: $WpRoot" -ForegroundColor Cyan
