# The one place scripts run a native program under a hard total deadline. Dot-source, then call
# Invoke-ProcessWithDeadline. A timed-out call kills the whole process tree (taskkill /T: `claude mcp list`
# and npx spawn children that Process.Kill() would orphan) and returns ExitCode -1 + TimedOut -- never a
# partial answer. PS 5.1 compatible. Stdout/stderr are decoded as UTF-8, so no console-encoding wrapper.

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

function Invoke-ProcessWithDeadline {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [int]$DeadlineSec = 90,
        [string]$WorkingDirectory = ''
    )
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
    $name = Split-Path -Leaf $FilePath
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = (($ArgumentList | ForEach-Object { ConvertTo-WinCmdArg ([string]$_) }) -join ' ')
    if ($WorkingDirectory) { $psi.WorkingDirectory = $WorkingDirectory }
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
        catch { return (& $result -1 '' ("$name failed to start: " + $_.Exception.Message) $false $sw.ElapsedMilliseconds) }
        $p.StandardInput.Close()
        # Async reads: a synchronous ReadToEnd on one pipe deadlocks when the other fills its buffer.
        $outTask = $p.StandardOutput.ReadToEndAsync()
        $errTask = $p.StandardError.ReadToEndAsync()
        $timedOut = -not $p.WaitForExit($DeadlineSec * 1000)
        if ($timedOut) {
            & taskkill.exe /T /F /PID $p.Id 2>&1 | Out-Null
            [void]$p.WaitForExit(2000)
        }
        # Bounded drain: after a kill the whole call overruns the deadline by at most ~3s.
        $drainMs = if ($timedOut) { 500 } else { 5000 }
        $out = if ($outTask.Wait($drainMs)) { $outTask.Result } else { '' }
        $err = if ($errTask.Wait($drainMs)) { $errTask.Result } else { '' }
        if ($timedOut) {
            $err = (($err, "$name killed: total deadline of ${DeadlineSec}s exceeded (not measured)") | Where-Object { $_ }) -join "`n"
            return (& $result -1 $out $err $true $sw.ElapsedMilliseconds)
        }
        return (& $result $p.ExitCode $out $err $false $sw.ElapsedMilliseconds)
    } finally {
        $p.Dispose()
    }
}
