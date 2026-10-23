# The one place health-check scripts run ssh. Dot-source, then call Invoke-SshWithDeadline.
# Why: ConnectTimeout bounds only the TCP/auth handshake. A host that accepts the connection and then
# stalls blocked check-deploy-drift.ps1 for 16 min (2026-10-14), and the IgnoreNew scheduled task then
# skipped every later run. Two bounds here: ServerAlive* drops a dead link, the hard total deadline
# (process-deadline.ps1) kills a live-but-stuck session.
# Callers pass only the ssh target/key/port/command; do NOT pass their own ConnectTimeout/BatchMode
# (ssh keeps the first -o value, so a duplicate would silently lose to this helper's).

. (Join-Path $PSScriptRoot 'process-deadline.ps1')

function Invoke-SshWithDeadline {
    param(
        [Parameter(Mandatory = $true)][string[]]$SshArgs,
        [int]$DeadlineSec = 90,
        [int]$ConnectTimeoutSec = 10
    )
    $sshCmd = Get-Command ssh.exe -ErrorAction SilentlyContinue
    if (-not $sshCmd) {
        return [pscustomobject]@{ ExitCode = -1; Stdout = ''; Stderr = 'ssh.exe not found on PATH'; Output = 'ssh.exe not found on PATH'; TimedOut = $false; DurationMs = 0 }
    }
    $argv = @('-o', 'BatchMode=yes', '-o', "ConnectTimeout=$ConnectTimeoutSec",
              '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3') + $SshArgs
    return (Invoke-ProcessWithDeadline -FilePath $sshCmd.Source -ArgumentList $argv -DeadlineSec $DeadlineSec)
}
