param(
    [string]$WorkRoot = "",
    [string]$ConfigPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkRoot {
    param([string]$InputRoot)
    if (-not [string]::IsNullOrWhiteSpace($InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

function Resolve-ConfigPath {
    param(
        [string]$InputPath,
        [string]$Root
    )
    if (-not [string]::IsNullOrWhiteSpace($InputPath)) {
        return (Resolve-Path -LiteralPath $InputPath).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path $Root "scripts\weekly-automation-config.json")).Path
}

function To-AbsolutePath {
    param(
        [string]$Root,
        [string]$PathValue
    )
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $Root
    }
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }
    return (Join-Path $Root $PathValue)
}

function Join-Quoted {
    param([object[]]$Args)
    if (-not $Args) { return "" }
    return (($Args | ForEach-Object {
                $s = [string]$_
                if ($s -match '\s') { '"' + $s + '"' } else { $s }
            }) -join " ")
}

$root = Resolve-WorkRoot -InputRoot $WorkRoot
$cfgPath = Resolve-ConfigPath -InputPath $ConfigPath -Root $root
$cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

$reportDir = To-AbsolutePath -Root $root -PathValue $cfg.reportDirectory
$null = New-Item -ItemType Directory -Force -Path $reportDir

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir ("weekly-automation-{0}.md" -f $stamp)
$latestPath = Join-Path $reportDir "weekly-automation-LATEST.md"

$results = New-Object System.Collections.Generic.List[object]
$hasFailure = $false

foreach ($job in $cfg.jobs) {
    if (-not $job.enabled) { continue }

    $jobId = [string]$job.id
    $jobType = [string]$job.type
    $started = Get-Date
    $stdout = ""
    $stderr = ""
    $exitCode = 0
    $invocation = ""

    try {
        if ($jobType -eq "powershellFile") {
            $scriptPath = To-AbsolutePath -Root $root -PathValue ([string]$job.path)
            $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath)
            if ($job.arguments) { $argList += @($job.arguments) }
            $invocation = "powershell.exe " + (Join-Quoted -Args @($argList))

            $p = Start-Process -FilePath "powershell.exe" -ArgumentList @($argList) -Wait -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\weekly-$jobId-out.txt" -RedirectStandardError "$env:TEMP\weekly-$jobId-err.txt"
            $exitCode = $p.ExitCode
            $stdout = (Get-Content -LiteralPath "$env:TEMP\weekly-$jobId-out.txt" -Raw -ErrorAction SilentlyContinue)
            $stderr = (Get-Content -LiteralPath "$env:TEMP\weekly-$jobId-err.txt" -Raw -ErrorAction SilentlyContinue)
            Remove-Item -LiteralPath "$env:TEMP\weekly-$jobId-out.txt","$env:TEMP\weekly-$jobId-err.txt" -Force -ErrorAction SilentlyContinue
        }
        elseif ($jobType -eq "process") {
            $wd = To-AbsolutePath -Root $root -PathValue ([string]$job.workingDirectory)
            $filePath = [string]$job.filePath
            $args = @()
            if ($job.arguments) { $args = @($job.arguments) }
            $invocation = "$filePath " + (Join-Quoted -Args @($args))

            $resolvedFile = $filePath
            if ($filePath -eq "npm") { $resolvedFile = "npm.cmd" }

            $p = Start-Process -FilePath $resolvedFile -WorkingDirectory $wd -ArgumentList @($args) -Wait -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\weekly-$jobId-out.txt" -RedirectStandardError "$env:TEMP\weekly-$jobId-err.txt"
            $exitCode = $p.ExitCode
            $stdout = (Get-Content -LiteralPath "$env:TEMP\weekly-$jobId-out.txt" -Raw -ErrorAction SilentlyContinue)
            $stderr = (Get-Content -LiteralPath "$env:TEMP\weekly-$jobId-err.txt" -Raw -ErrorAction SilentlyContinue)
            Remove-Item -LiteralPath "$env:TEMP\weekly-$jobId-out.txt","$env:TEMP\weekly-$jobId-err.txt" -Force -ErrorAction SilentlyContinue
        }
        else {
            throw "Unsupported job type: $jobType"
        }
    }
    catch {
        $exitCode = 1
        $stderr = $_.Exception.Message
    }

    $ended = Get-Date
    if ($exitCode -ne 0) { $hasFailure = $true }

    $results.Add([pscustomobject]@{
            id          = $jobId
            description = [string]$job.description
            type        = $jobType
            invocation  = $invocation
            startedAt   = $started.ToString("s")
            endedAt     = $ended.ToString("s")
            exitCode    = $exitCode
            stdout      = $stdout
            stderr      = $stderr
        }) | Out-Null
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# Weekly automation report")
$lines.Add("")
$lines.Add("- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("- Work root: $root")
$lines.Add("- Config: $cfgPath")
$lines.Add("- Result: $(if ($hasFailure) { 'FAIL' } else { 'PASS' })")
$lines.Add("")
$lines.Add("## Job results")
$lines.Add("")

foreach ($r in $results) {
    $status = if ($r.exitCode -eq 0) { "PASS" } else { "FAIL" }
    $lines.Add("### $($r.id) - $status")
    $lines.Add("- Description: $($r.description)")
    $lines.Add("- Type: $($r.type)")
    $lines.Add("- Started: $($r.startedAt)")
    $lines.Add("- Ended: $($r.endedAt)")
    $lines.Add("- Exit code: $($r.exitCode)")
    $lines.Add("- Command: $($r.invocation)")

    if (-not [string]::IsNullOrWhiteSpace($r.stdout)) {
        $lines.Add("")
        $lines.Add("#### stdout")
        $lines.Add('```text')
        $lines.Add(($r.stdout.TrimEnd()))
        $lines.Add('```')
    }
    if (-not [string]::IsNullOrWhiteSpace($r.stderr)) {
        $lines.Add("")
        $lines.Add("#### stderr")
        $lines.Add('```text')
        $lines.Add(($r.stderr.TrimEnd()))
        $lines.Add('```')
    }
    $lines.Add("")
}

$nl = [Environment]::NewLine
$reportContent = ($lines -join $nl) + $nl
Set-Content -LiteralPath $summaryPath -Value $reportContent -Encoding UTF8
Set-Content -LiteralPath $latestPath -Value $reportContent -Encoding UTF8

Write-Output ("Weekly automation report: " + $summaryPath)
Write-Output ("Latest report: " + $latestPath)

if ($hasFailure) { exit 1 }
exit 0
