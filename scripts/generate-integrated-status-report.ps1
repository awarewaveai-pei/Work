# Assembles one markdown report from TASKS, Lobster checklist, memory, daily, status, WORKLOG tail.
# ASCII-only literals; Windows PowerShell 5.1 friendly. Uses -Tail for WORKLOG to avoid loading huge files.

param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }

    # Monorepo guardrail: if invoked from D:\Work, force canonical agency root.
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\generate-integrated-status-report.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }

    return $resolved
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Invoke-OptionalScriptWithTimeout {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments,
        [int]$TimeoutSeconds = 20,
        [string]$Label = "optional script"
    )
    $argLine = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$ScriptPath`"")
    if ($Arguments) { $argLine += $Arguments }
    $argText = ($argLine -join " ")

    $p = Start-Process -FilePath "powershell.exe" -ArgumentList $argText -PassThru -WindowStyle Hidden
    $ok = $p.WaitForExit($TimeoutSeconds * 1000)
    if (-not $ok) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {}
        Write-Warning ("generate-integrated-status-report: " + $Label + " timeout after " + $TimeoutSeconds + "s; skipped.")
        return 124
    }
    return $p.ExitCode
}

function Get-UncheckedInSection {
    param(
        [string[]]$Lines,
        [string]$StartHeader,
        [string]$StopHeaderRegex
    )
    $i = 0
    while ($i -lt $Lines.Count) {
        if ($Lines[$i].Trim() -eq $StartHeader) {
            $i++
            break
        }
        $i++
    }
    $items = [System.Collections.Generic.List[string]]::new()
    while ($i -lt $Lines.Count) {
        $line = $Lines[$i]
        if ($line -match $StopHeaderRegex) { break }
        if ($line -match '^\s*-\s+\[\s\]\s') {
            $items.Add($line.TrimEnd())
        }
        $i++
    }
    return ,@($items)
}

function Get-LobsterOpenBeforeSectionD {
    param([string[]]$Lines)
    $items = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $Lines) {
        if ($line -match '^## D\)') { break }
        if ($line -match '^\s*-\s+\[\s\]\s') {
            $items.Add($line.TrimEnd())
        }
    }
    return ,@($items)
}

function Get-MemorySubsections {
    param(
        [string]$Path,
        [string[]]$HeaderPrefixes
    )
    $lines = Get-Content -LiteralPath $Path -Encoding UTF8
    $map = [ordered]@{}
    $currentKey = $null
    $buf = [System.Collections.Generic.List[string]]::new()

    function Flush-Buffer {
        if ($currentKey) {
            $map[$currentKey] = ($buf -join "`n").TrimEnd("`r", "`n")
            $buf.Clear()
        }
    }

    foreach ($line in $lines) {
        if ($line -match '^##\s+(.+)$') {
            Flush-Buffer
            $title = $Matches[1].Trim()
            $currentKey = $null
            foreach ($prefix in $HeaderPrefixes) {
                if ($title.StartsWith($prefix)) {
                    $currentKey = $title
                    break
                }
            }
            continue
        }
        if ($null -ne $currentKey) {
            $buf.Add($line)
        }
    }
    Flush-Buffer
    return $map
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$tasksPath = Join-Path $root "TASKS.md"
$memPath = Join-Path $root "memory\CONVERSATION_MEMORY.md"
$dailyName = (Get-Date).ToString("yyyy-MM-dd")
$dailyPath = Join-Path $root "memory\daily\$dailyName.md"
$statusPath = Join-Path $root "LAST_SYSTEM_STATUS.md"
$worklogPath = Join-Path $root "WORKLOG.md"
$lobsterPath = Join-Path $root "..\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST.md"
if (-not (Test-Path $lobsterPath)) {
    $lobsterPath = Join-Path $root "lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST.md"
}

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$outDir = Join-Path $root "reports\status"
Ensure-Dir -Path $outDir
$outFile = Join-Path $outDir ("integrated-status-" + $stamp + ".md")
$latestFile = Join-Path $outDir "integrated-status-LATEST.md"

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("# Integrated status report (assembled)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$sb.AppendLine("- agency-os root: ``$root``")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> Assembled from canonical sources only; edit those files to change truth. Chinese legend: ``docs/overview/INTEGRATED_STATUS_REPORT.md``")
[void]$sb.AppendLine(">")
[void]$sb.AppendLine("> Regenerate: ``powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1``")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## Source index")
[void]$sb.AppendLine("- ``TASKS.md``")
[void]$sb.AppendLine("- ``../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md``")
[void]$sb.AppendLine("- ``memory/CONVERSATION_MEMORY.md``")
[void]$sb.AppendLine("- ``memory/daily/YYYY-MM-DD.md``")
[void]$sb.AppendLine("- ``LAST_SYSTEM_STATUS.md``, ``WORKLOG.md``")
[void]$sb.AppendLine("")

if (Test-Path $tasksPath) {
    $tl = Get-Content -LiteralPath $tasksPath -Encoding UTF8
    $nextOpen = @(Get-UncheckedInSection -Lines $tl -StartHeader "## Next" -StopHeaderRegex '^## Backlog\s*$')
    $backlogOpen = @(Get-UncheckedInSection -Lines $tl -StartHeader "## Backlog" -StopHeaderRegex '^## Related')

    [void]$sb.AppendLine("## 1) TASKS.md - Next (unchecked)")
    if ($nextOpen.Count -eq 0) {
        [void]$sb.AppendLine("_none_")
    } else {
        foreach ($x in $nextOpen) { [void]$sb.AppendLine($x) }
    }
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("## 2) TASKS.md - Backlog (unchecked)")
    if ($backlogOpen.Count -eq 0) {
        [void]$sb.AppendLine("_none_")
    } else {
        foreach ($x in $backlogOpen) { [void]$sb.AppendLine($x) }
    }
    [void]$sb.AppendLine("")
} else {
    [void]$sb.AppendLine("## 1)-2) TASKS.md")
    [void]$sb.AppendLine("_missing_")
    [void]$sb.AppendLine("")
}

if (Test-Path $lobsterPath) {
    $ll = Get-Content -LiteralPath $lobsterPath -Encoding UTF8
    $open = @(Get-LobsterOpenBeforeSectionD -Lines $ll)
    [void]$sb.AppendLine("## 3) Lobster Factory Master Checklist - open items (sections A-C, before section D)")
    if ($open.Count -eq 0) {
        [void]$sb.AppendLine("_none_")
    } else {
        foreach ($x in $open) { [void]$sb.AppendLine($x) }
    }
    [void]$sb.AppendLine("")
    $rel = $lobsterPath
    try { $rel = (Resolve-Path $lobsterPath).Path } catch { }
    [void]$sb.AppendLine("*Checklist path:* ``$rel``")
    [void]$sb.AppendLine("")
} else {
    [void]$sb.AppendLine("## 3) Lobster checklist")
    [void]$sb.AppendLine("_missing (expected monorepo sibling lobster-factory/docs/)_")
    [void]$sb.AppendLine("")
}

if (Test-Path $memPath) {
    $subs = Get-MemorySubsections -Path $memPath -HeaderPrefixes @(
        "Next Step",
        "Remaining",
        "Tomorrow",
        "Today"
    )
    [void]$sb.AppendLine("## 4) memory/CONVERSATION_MEMORY.md (excerpts)")
    [void]$sb.AppendLine("")
    foreach ($key in $subs.Keys) {
        [void]$sb.AppendLine("### $key")
        $body = $subs[$key]
        if ([string]::IsNullOrWhiteSpace($body)) {
            [void]$sb.AppendLine("_empty_")
        } else {
            [void]$sb.AppendLine($body)
        }
        [void]$sb.AppendLine("")
    }
    [void]$sb.AppendLine("> Full runbook: see ``## Runbook Commands`` in the source file.")
    [void]$sb.AppendLine("")
} else {
    [void]$sb.AppendLine("## 4) CONVERSATION_MEMORY")
    [void]$sb.AppendLine("_missing_")
    [void]$sb.AppendLine("")
}

[void]$sb.AppendLine("## 5) memory/daily/$dailyName.md")
if (Test-Path $dailyPath) {
    $dailyLines = Get-Content -LiteralPath $dailyPath -Encoding UTF8
    $maxDaily = 160
    if ($dailyLines.Count -le $maxDaily) {
        [void]$sb.AppendLine(($dailyLines -join "`n"))
    } else {
        $head = $dailyLines[0..($maxDaily - 1)] -join "`n"
        [void]$sb.AppendLine($head)
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("_... $($dailyLines.Count - $maxDaily) lines omitted._")
    }
} else {
    [void]$sb.AppendLine("_no file for today yet._")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## 6) LAST_SYSTEM_STATUS.md (appendix)")
if (Test-Path $statusPath) {
    [void]$sb.AppendLine((Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8).TrimEnd())
} else {
    [void]$sb.AppendLine("_none_")
}
[void]$sb.AppendLine("")

[void]$sb.AppendLine("## 7) WORKLOG.md tail (~60 lines)")
if (Test-Path $worklogPath) {
    $tail = Get-Content -LiteralPath $worklogPath -Encoding UTF8 -Tail 60
    [void]$sb.AppendLine(($tail -join "`n"))
} else {
    [void]$sb.AppendLine("_none_")
}

$text = $sb.ToString()
Set-Content -LiteralPath $outFile -Value $text -Encoding UTF8
Set-Content -LiteralPath $latestFile -Value $text -Encoding UTF8

Write-Output ("Integrated status report: reports/status/" + [System.IO.Path]::GetFileName($outFile))
Write-Output ("Also written to: reports/status/integrated-status-LATEST.md")

$renderTimeline = Join-Path $root "scripts\render-program-timeline-from-schedule.ps1"
if (Test-Path -LiteralPath $renderTimeline) {
    Write-Host "== generate-integrated-status-report: render PROGRAM_TIMELINE from PROGRAM_SCHEDULE.json ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $renderTimeline -WorkspaceRoot $root
    if ($LASTEXITCODE -ne 0) {
        Write-Error "generate-integrated-status-report: render-program-timeline-from-schedule failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}
