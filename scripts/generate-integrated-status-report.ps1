# Assembles one markdown report from TASKS, Lobster checklist, memory, daily, status, WORKLOG tail.
# ASCII-only literals; Windows PowerShell 5.1 friendly. Uses -Tail for WORKLOG to avoid loading huge files.

param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

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
    # 2026-08-26 FIX: this was `-eq $StartHeader` (exact equality). The real headings are
    # "## Next - <chinese>" / "## Backlog - <chinese>", so equality NEVER matched: the search
    # loop ran to EOF and the collector below returned empty. Result: sections 1) and 2) of
    # every integrated-status report had been silently blank. Prefix match is the contract.
    $i = 0
    $found = $false
    while ($i -lt $Lines.Count) {
        if ($Lines[$i].Trim().StartsWith($StartHeader)) {
            $i++
            $found = $true
            break
        }
        $i++
    }
    if (-not $found) { return ,@() }
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
$lobsterPath = Join-Path $root "..\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md"
if (-not (Test-Path $lobsterPath)) {
    $lobsterPath = Join-Path $root "lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md"
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
[void]$sb.AppendLine("- ``../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md``")
[void]$sb.AppendLine("- ``memory/CONVERSATION_MEMORY.md``")
[void]$sb.AppendLine("- ``memory/daily/YYYY-MM-DD.md``")
[void]$sb.AppendLine("- ``LAST_SYSTEM_STATUS.md``, ``WORKLOG.md``")
[void]$sb.AppendLine("")

if (Test-Path $tasksPath) {
    $tl = Get-Content -LiteralPath $tasksPath -Encoding UTF8
    # NOTE 2026-08-26: no @( ) around the call. The function already returns `,@($items)`;
    # wrapping it again produces an array-of-one-array, so Count is always 1 and the whole
    # list gets stringified onto a single line. This bug was invisible while the function
    # returned empty (see the exact-equality bug fixed above) -- one bug hid the other.
    $nextOpen = Get-UncheckedInSection -Lines $tl -StartHeader "## Next" -StopHeaderRegex '^##\s+Backlog'
    $backlogOpen = Get-UncheckedInSection -Lines $tl -StartHeader "## Backlog" -StopHeaderRegex '^##\s+(Related|歷史封存)'

    # Blind-detector guard (2026-08-26): closing the CLASS, not just the instance above.
    # If TASKS.md plainly contains open checkboxes but our parse produced none, the parser
    # and the file have drifted apart again -- say so loudly in the report instead of
    # rendering an empty section that reads as "nothing is open".
    $rawOpenCount = @($tl | Where-Object { $_ -match '^\s*-\s+\[\s\]' }).Count
    if ($rawOpenCount -gt 0 -and ($nextOpen.Count + $backlogOpen.Count) -lt $rawOpenCount) {
        [void]$sb.AppendLine("> **PARSER MISMATCH** - TASKS.md has $rawOpenCount open ``- [ ]`` line(s) but this report parsed $($nextOpen.Count + $backlogOpen.Count).")
        [void]$sb.AppendLine("> The section headings in TASKS.md no longer match what ``generate-integrated-status-report.ps1`` looks for.")
        [void]$sb.AppendLine("> Treat sections 1) and 2) below as UNVERIFIED, not as empty. Fix the parser before trusting this report.")
        [void]$sb.AppendLine("")
        Write-Warning "generate-integrated-status-report: PARSER MISMATCH - $rawOpenCount open tasks in TASKS.md, $($nextOpen.Count + $backlogOpen.Count) parsed."
    }

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
    # Same double-wrap class as the two calls above (`,@()` in the function + @( ) here).
    $open = Get-LobsterOpenBeforeSectionD -Lines $ll
    [void]$sb.AppendLine("## 3) Lobster Factory Master Checklist - open items (sections A-C, before section D)")
    if ($open.Count -eq 0) {
        [void]$sb.AppendLine("_none_")
    } else {
        foreach ($x in $open) { [void]$sb.AppendLine($x) }
    }
    [void]$sb.AppendLine("")
    $rel = $lobsterPath
    try { $rel = (Resolve-Path -LiteralPath $lobsterPath).Path } catch { }
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
# [System.IO.File]::WriteAllText with explicit UTF-8-NoBOM encoder is PS5/PS7 consistent.
# Set-Content -Encoding UTF8 writes WITH BOM on PS5 but WITHOUT BOM on PS7.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($outFile,    $text, $utf8NoBom)
[System.IO.File]::WriteAllText($latestFile, $text, $utf8NoBom)

Write-Output ("Integrated status report: reports/status/" + [System.IO.Path]::GetFileName($outFile))
Write-Output ("Also written to: reports/status/integrated-status-LATEST.md")

$renderTimeline = Join-Path $PSScriptRoot "render-program-timeline-from-schedule.ps1"
if (Test-Path -LiteralPath $renderTimeline) {
    Write-Host "== generate-integrated-status-report: render PROGRAM_TIMELINE from PROGRAM_SCHEDULE.json ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $renderTimeline -WorkspaceRoot $root
    if ($LASTEXITCODE -ne 0) {
        Write-Error "generate-integrated-status-report: render-program-timeline-from-schedule failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# REMOVED 2026-10-14: the M3 customer-delivery step looked for its script under agency-os\scripts,
# where it never existed, so it was a silent no-op from 2026-05-13 on. Pointing it at scripts\ would
# switch on a report nobody has seen (empty without Supabase keys, a new untracked file every
# close-out); whether to revive it is an open TASKS.md item. Run scripts\generate-customer-delivery-status.ps1 by hand.
