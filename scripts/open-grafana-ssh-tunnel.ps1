<#
.SYNOPSIS
  Open a local TCP port that forwards to Grafana on the VPS (observability stack).

.DESCRIPTION
  Grafana listens on the server at 127.0.0.1:3009. This script runs SSH local port forward
  so you can open http://127.0.0.1:<LocalPort>/ in a browser on this machine.

  Default matches lobster-factory observability compose: remote 127.0.0.1:3009.

.EXAMPLE
  # Foreground (terminal stays open; Ctrl+C closes tunnel)
  .\scripts\open-grafana-ssh-tunnel.ps1

.EXAMPLE
  # Different SSH host alias from ~/.ssh/config
  .\scripts\open-grafana-ssh-tunnel.ps1 -SshHost my-vps

.EXAMPLE
  # Background (new window); stop later with Task Manager or: Get-Process ssh | Stop-Process
  .\scripts\open-grafana-ssh-tunnel.ps1 -Background
#>
param(
    [string]$SshHost = "hetzner",
    [int]$LocalPort = 3009,
    [string]$RemoteHost = "127.0.0.1",
    [int]$RemotePort = 3009,
    [switch]$Background
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$remote = "${RemoteHost}:${RemotePort}"
$bind = "127.0.0.1:${LocalPort}:${remote}"

Write-Host "Grafana SSH tunnel: localhost:${LocalPort} -> ${SshHost}:${remote}" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Do not open the browser until this tunnel is running." -ForegroundColor Yellow
Write-Host "  If you see ERR_CONNECTION_REFUSED, the tunnel is not active (wrong window closed, or never started)." -ForegroundColor Yellow
Write-Host ""
Write-Host "After tunnel is up, open: http://127.0.0.1:${LocalPort}/" -ForegroundColor Green
Write-Host "  Login: admin | Grafana password on VPS: observability/.env.observability (Grafana admin password line)" -ForegroundColor DarkGray
Write-Host "  Home should show 'AwareWave 觀測首頁' after sync; more: Dashboards -> Browse -> AwareWave" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Foreground mode: this window must stay open. Press Ctrl+C to stop the tunnel." -ForegroundColor DarkGray
Write-Host ""

try {
    $sshExe = (Get-Command ssh -ErrorAction Stop).Source
} catch {
    throw "ssh not found in PATH. Install OpenSSH Client (Windows Optional Feature) or add Git usr/bin to PATH."
}

if ($Background) {
    Start-Process -FilePath $sshExe -ArgumentList @("-N", "-L", $bind, $SshHost) -WindowStyle Minimized
    Write-Host "Started: $sshExe -N -L $bind $SshHost" -ForegroundColor Cyan
    Start-Sleep -Seconds 3
    $probe = Test-NetConnection -ComputerName 127.0.0.1 -Port $LocalPort -WarningAction SilentlyContinue
    if ($probe.TcpTestSucceeded) {
        Write-Host "Local port $LocalPort is accepting connections — open http://127.0.0.1:${LocalPort}/ now." -ForegroundColor Green
    } else {
        Write-Host "Local port $LocalPort not open yet. Wait a few seconds or check SSH (firewall, Host $SshHost, key)." -ForegroundColor Yellow
    }
    Write-Host "To stop: Task Manager end 'ssh' for this forward, or: Get-Process ssh | Stop-Process" -ForegroundColor DarkGray
    exit 0
}

& $sshExe -N -L $bind $SshHost
