# The one place health-check scripts run ssh. Dot-source, then call Invoke-SshWithDeadline.
# Why: ConnectTimeout bounds only the TCP/auth handshake. A host that accepts the connection and then
# stalls blocked check-deploy-drift.ps1 for 16 min (2026-10-14), and the IgnoreNew scheduled task then
# skipped every later run. Two bounds here: ServerAlive* drops a dead link, the hard total deadline kills
# a live-but-stuck session. A timed-out call is ExitCode -1 + TimedOut -- never a partial answer.
# PS 5.1 compatible. Stdout/stderr are decoded as UTF-8 here, so no console-encoding wrapper is needed.
# Callers pass only the ssh target/key/port/command; do NOT pass their own ConnectTimeout/BatchMode
# (ssh keeps the first -o value, so a duplicate would silently lose to this helper's).

function ConvertTo-WinCmdArg {
    param([string]$Arg)
    if ($Arg.Length -gt 0 -and $Arg -notmatch '[\s"]') { return $Arg }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $bs = 0
    foreach ($c in $Arg.ToCharArray()) {
        if ($c -eq '\') { $bs++; continue }
        if ($c -eq '"') { [void]$sb.Append([char]92, 2 * $bs + 1); [void]$sb.Append('"') }
        else { if ($bs -gt 0) { [void]$sb.Append([char]92, $bs) }; [void]$sb.Append($c) }
        $bs = 0
    }
    if ($bs -gt 0) { [void]$sb.Append([char]92, 2 * $bs) }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function Invoke-SshWithDeadline {
    param(
        [Parameter(Mandatory = $true)][string[]]$SshArgs,
        [int]$DeadlineSec = 90,
        [int]$ConnectTimeoutSec = 10
    )
    $argv = @('-o', 'BatchMode=yes', '-o', "ConnectTimeout=$ConnectTimeoutSec",
              '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3') + $SshArgs
    $result = { param($code, $out, $err, $timedOut, $ms)
        $parts = @($out, $err) | Where-Object { $_ }
        [pscustomobject]@{
            ExitCode   = $code
            Stdout     = $out
            Stderr     = $err
            Output     = (($parts -join "`n")).Trim()
            TimedOut   = $timedOut
            DurationMs = $ms
        }
    }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $sshCmd = Get-Command ssh.exe -ErrorAction SilentlyContinue
    if (-not $sshCmd) { return (& $result -1 '' 'ssh.exe not found on PATH' $false 0) }
    $psi.FileName = $sshCmd.Source
    $psi.Arguments = (($argv | ForEach-Object { ConvertTo-WinCmdArg ([string]$_) }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $psi.StandardOutputEncoding = $utf8
    $psi.StandardErrorEncoding = $utf8
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    try {
        try { [void]$p.Start() }
        catch { return (& $result -1 '' ('ssh failed to start: ' + $_.Exception.Message) $false $sw.ElapsedMilliseconds) }
        $p.StandardInput.Close()
        # Async reads: a synchronous ReadToEnd on one pipe deadlocks when the other fills its buffer.
        $outTask = $p.StandardOutput.ReadToEndAsync()
        $errTask = $p.StandardError.ReadToEndAsync()
        $timedOut = -not $p.WaitForExit($DeadlineSec * 1000)
        if ($timedOut) {
            try { $p.Kill() } catch { }
            [void]$p.WaitForExit(2000)
        }
        # Bounded drain: after a kill the whole call overruns the deadline by at most ~3s.
        $drainMs = if ($timedOut) { 500 } else { 5000 }
        $out = if ($outTask.Wait($drainMs)) { $outTask.Result } else { '' }
        $err = if ($errTask.Wait($drainMs)) { $errTask.Result } else { '' }
        if ($timedOut) {
            $err = (($err, "ssh killed: total deadline of ${DeadlineSec}s exceeded (not measured)") | Where-Object { $_ }) -join "`n"
            return (& $result -1 $out $err $true $sw.ElapsedMilliseconds)
        }
        return (& $result $p.ExitCode $out $err $false $sw.ElapsedMilliseconds)
    } finally {
        $p.Dispose()
    }
}
