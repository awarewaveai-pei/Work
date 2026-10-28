<#
.SYNOPSIS
  Open SSH tunnels to self-hosted Supabase on the EU VPS (postgres + studio).

.DESCRIPTION
  Target host defaults to the EU Supabase VPS unless overridden (see `-SshHost` or env `SUPABASE_EU_SSH_HOST`).
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
    [string]$SshHost = "",
    [string]$SshUser = "",
    [string]$PrivateKeyPath = "",
    # Same port on both ends. ExitOnForwardFailure drops the whole tunnel if any local port is taken (a dev server on 3000),
    # so callers that need only Postgres pass -Ports 5432 (mcp-local-wrappers/postgres-full-access-mcp.mjs does).
    [int[]]$Ports = @(5432, 3000, 8000),
    [switch]$Background
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SshHost)) {
    $SshHost = if ($env:SUPABASE_EU_SSH_HOST) { $env:SUPABASE_EU_SSH_HOST } else { "145.239.195.47" }  # 2026-08-31: supabase moved with ks-aw-01 to KS-6
}
if ([string]::IsNullOrWhiteSpace($SshUser)) {
    $SshUser = if ($env:SUPABASE_EU_SSH_USER) { $env:SUPABASE_EU_SSH_USER } else { "ubuntu" }
}
if ([string]::IsNullOrWhiteSpace($PrivateKeyPath)) {
    $PrivateKeyPath = if ($env:SUPABASE_EU_SSH_KEY) { $env:SUPABASE_EU_SSH_KEY } else { "$env:USERPROFILE\.ssh\id_ed25519" }
}

# A port this same tunnel already forwards (an ssh to $SshHost with this -L, e.g. the MCP wrapper's 5432) is reused:
# re-binding it would trip ExitOnForwardFailure and drop the new tunnel. Any other holder still fails loudly below.
$Ports = @($Ports | Where-Object {
    $spec = "127.0.0.1:${_}:127.0.0.1:${_}"
    $owners = @(Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | ForEach-Object OwningProcess)
    -not ($owners | Where-Object {
        $cmd = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue).CommandLine
        $cmd.Contains($spec) -and $cmd.Contains("@$SshHost")
    })
})
if ($Ports.Count -eq 0) {
    Write-Host "Every requested port is already forwarded by ssh; nothing to open." -ForegroundColor Green
    exit 0
}
$tunnels = @($Ports | ForEach-Object { "127.0.0.1:${_}:127.0.0.1:${_}" })

$sshTarget = "$SshUser@$SshHost"
Write-Host "Supabase SSH tunnels via $sshTarget (5432 PostgreSQL, 3000 Studio, 8000 Kong)" -ForegroundColor Cyan
foreach ($p in $Ports) { Write-Host "  localhost:$p" -ForegroundColor DarkGray }
Write-Host ""
Write-Host "Postgres (local end of tunnel):" -ForegroundColor Yellow
Write-Host "  postgresql://postgres:<password>@localhost:5432/postgres  (password from vault / Supabase host only)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Env overrides: SUPABASE_EU_SSH_HOST, SUPABASE_EU_SSH_USER, SUPABASE_EU_SSH_KEY" -ForegroundColor DarkGray
Write-Host ""

try {
    $sshExe = (Get-Command ssh -ErrorAction Stop).Source
} catch {
    throw "ssh not found in PATH."
}

# ExitOnForwardFailure: fail fast when sshd rejects -L (e.g. administratively prohibited).
# ServerAlive*: reduce silent drops on long IDE sessions.
$args = @(
    "-N",
    "-p", "58122",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=6"
)
if (Test-Path -LiteralPath $PrivateKeyPath) {
    $args += @("-i", $PrivateKeyPath)
} else {
    Write-Host "Private key not found at $PrivateKeyPath - fallback to ssh default key lookup." -ForegroundColor Yellow
}
foreach ($t in $tunnels) { $args += @("-L", $t) }
$args += $sshTarget

function Test-SupabaseTunnelPorts {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $Ports[0] -WarningAction SilentlyContinue).TcpTestSucceeded
}

if ($Background) {
    $stderrFile = Join-Path $env:TEMP ("supabase-ssh-tunnel-{0}.stderr.log" -f [Guid]::NewGuid().ToString("N").Substring(0, 12))
    $stdoutFile = Join-Path $env:TEMP ("supabase-ssh-tunnel-{0}.stdout.log" -f [Guid]::NewGuid().ToString("N").Substring(0, 12))

    $p = Start-Process -FilePath $sshExe -ArgumentList $args -PassThru -WindowStyle Minimized `
        -RedirectStandardError $stderrFile -RedirectStandardOutput $stdoutFile
    Write-Host "Started SSH (PID $($p.Id)). Stderr log: $stderrFile" -ForegroundColor DarkGray
    Write-Host "To stop tunnels: Stop-Process -Id $($p.Id)  (or: Get-Process ssh | Stop-Process)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 6

    if ($p.HasExited) {
        $errTail = ""
        if (Test-Path -LiteralPath $stderrFile) {
            $errTail = (Get-Content -LiteralPath $stderrFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)
        }
        Write-Host "SSH exited early (exit $($p.ExitCode))." -ForegroundColor Red
        if ($errTail -match "administratively prohibited") {
            Write-Host ""
            Write-Host "sshd refused TCP forwarding (-L). On the EU VPS fix AllowTcpForwarding / PermitOpen, then reload sshd." -ForegroundColor Yellow
            Write-Host "Runbook: agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md  (section: administratively prohibited)" -ForegroundColor Yellow
        } elseif ($errTail) {
            Write-Host "--- ssh stderr (tail) ---" -ForegroundColor DarkGray
            Write-Host $errTail.Substring([Math]::Max(0, $errTail.Length - 2000))
        }
        exit 1
    }

    if (Test-SupabaseTunnelPorts) {
        Write-Host "Tunnel up - localhost:$($Ports[0]) reachable" -ForegroundColor Green
        Write-Host "Smoke: npm run smoke:supabase-tunnel   (add -- --sql if DSN env is set)" -ForegroundColor DarkGray
        exit 0
    }

    Write-Host "Tunnel probe failed - port $($Ports[0]) not accepting. Check key, firewall, or whether another process holds the local port." -ForegroundColor Red
    if (Test-Path -LiteralPath $stderrFile) {
        $errTail = Get-Content -LiteralPath $stderrFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($errTail) {
            Write-Host "--- ssh stderr (tail) ---" -ForegroundColor DarkGray
            Write-Host $errTail.Substring([Math]::Max(0, $errTail.Length - 2000))
        }
    }
    exit 1
}

& $sshExe @args
