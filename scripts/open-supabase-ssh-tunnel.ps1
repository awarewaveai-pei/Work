<#
.SYNOPSIS
  Open SSH tunnels to self-hosted Supabase on the EU VPS (postgres + studio).

.DESCRIPTION
  Supabase runs on the EU server (hetzner-eu, 204.168.175.41).
  Services listen locally on the EU VPS:
    - PostgreSQL: 127.0.0.1:5432
    - Supabase Studio: 127.0.0.1:3000
    - Kong API: 127.0.0.1:8000 (usually accessed via https://supabase.aware-wave.com)

  This script forwards all three so local tools (MCP, psql, browser) can connect.

  After the tunnel is up, build a Postgres DSN from your **vault** or **self-host runbook**
  (never commit passwords). Example shape:
    postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres

  Studio: http://localhost:3000 (or https://studio.aware-wave.com; credentials are **not** documented here).

.EXAMPLE
  # Foreground (keep terminal open; Ctrl+C closes tunnel)
  .\scripts\open-supabase-ssh-tunnel.ps1

.EXAMPLE
  # Background
  .\scripts\open-supabase-ssh-tunnel.ps1 -Background
#>
param(
    [string]$SshHost = "5.223.93.113",
    [string]$SshUser = "root",
    [string]$PrivateKeyPath = "$env:USERPROFILE\.ssh\hetzner_trigger",
    [switch]$Background
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tunnels = @(
    "127.0.0.1:5432:127.0.0.1:5432",   # PostgreSQL
    "127.0.0.1:3000:127.0.0.1:3000",   # Studio
    "127.0.0.1:8000:127.0.0.1:8000"    # Kong API
)

$sshTarget = "$SshUser@$SshHost"
Write-Host "Supabase SSH tunnels via $sshTarget" -ForegroundColor Cyan
Write-Host "  localhost:5432  -> Supabase PostgreSQL" -ForegroundColor DarkGray
Write-Host "  localhost:3000  -> Supabase Studio (http://localhost:3000)" -ForegroundColor DarkGray
Write-Host "  localhost:8000  -> Supabase Kong API" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Postgres (local end of tunnel):" -ForegroundColor Yellow
Write-Host "  postgresql://postgres:<password>@localhost:5432/postgres  (password from vault / Supabase host only)" -ForegroundColor DarkGray
Write-Host ""

try {
    $sshExe = (Get-Command ssh -ErrorAction Stop).Source
} catch {
    throw "ssh not found in PATH."
}

$args = @("-N")
if (Test-Path -LiteralPath $PrivateKeyPath) {
    $args += @("-i", $PrivateKeyPath)
} else {
    Write-Host "Private key not found at $PrivateKeyPath - fallback to ssh default key lookup." -ForegroundColor Yellow
}
foreach ($t in $tunnels) { $args += @("-L", $t) }
$args += $sshTarget

if ($Background) {
    Start-Process -FilePath $sshExe -ArgumentList $args -WindowStyle Minimized
    Write-Host "Started in background. To stop: Get-Process ssh | Stop-Process" -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
    $probe = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
    if ($probe.TcpTestSucceeded) {
        Write-Host "Tunnel up - postgres at localhost:5432 and Kong at localhost:8000" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "Tunnel probe failed - check SSH connectivity/key for $sshTarget." -ForegroundColor Red
        exit 1
    }
}

& $sshExe @args
