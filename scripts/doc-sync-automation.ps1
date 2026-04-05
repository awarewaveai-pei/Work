param(
    [string]$WorkspaceRoot = "",
    [string[]]$ChangedFiles = @(),
    [switch]$AutoDetect,
    [switch]$Watch,
    [switch]$SkipApply,
    [switch]$SkipReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
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
    if (Test-Path (Join-Path $agencyCandidate "scripts\doc-sync-automation.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }

    return $resolved
}

function To-RelPath {
    param([string]$Root, [string]$PathValue)
    $rootUri = New-Object System.Uri(($Root.TrimEnd('\') + '\'))
    $fullPath = if ([System.IO.Path]::IsPathRooted($PathValue)) { $PathValue } else { Join-Path $Root $PathValue }
    $fileUri = New-Object System.Uri((Resolve-Path $fullPath).Path)
    return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString()).Replace('\', '/')
}

function Load-Json {
    param([string]$Path)
    return (Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json)
}

function Save-Json {
    param([string]$Path, [object]$Object)
    $json = $Object | ConvertTo-Json -Depth 8
    Set-Content -Path $Path -Value $json -Encoding UTF8
}

function Upsert-RelatedBlock {
    param(
        [string]$Root,
        [string]$RelativeFile,
        [string[]]$Related
    )
    $full = Join-Path $Root $RelativeFile
    if (-not (Test-Path $full)) { return $false }
    if (-not $RelativeFile.EndsWith(".md")) { return $false }

    $content = Get-Content -Raw -Path $full -Encoding UTF8
    $suspect = $false
    if ($content.Contains([string][char]0xFFFD)) { $suspect = $true }
    if ($suspect) {
        Write-Output ("Skip auto-sync due to suspected mojibake: " + $RelativeFile)
        return $false
    }
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'")
    $lines = @("## Related Documents (Auto-Synced)")
    foreach ($item in ($Related | Sort-Object -Unique)) {
        $lines += ('- `{0}`' -f $item)
    }
    $lines += ""
    $lines += "_Last synced: ${timestamp}_"
    $block = ($lines -join "`r`n")

    $startMarker = "## Related Documents (Auto-Synced)"
    $startIdx = $content.IndexOf($startMarker)
    if ($startIdx -ge 0) {
        $nextHeadingIdx = $content.IndexOf("`n## ", $startIdx + 1)
        if ($nextHeadingIdx -gt $startIdx) {
            $newContent = $content.Substring(0, $startIdx).TrimEnd("`r", "`n") + "`r`n`r`n" + $block + "`r`n`r`n" + $content.Substring($nextHeadingIdx + 1).TrimStart("`r", "`n")
        } else {
            $newContent = $content.Substring(0, $startIdx).TrimEnd("`r", "`n") + "`r`n`r`n" + $block + "`r`n"
        }
    } else {
        $newContent = $content.TrimEnd("`r", "`n") + "`r`n`r`n" + $block + "`r`n"
    }

    if ($newContent -ne $content) {
        Set-Content -Path $full -Value $newContent -Encoding UTF8
        return $true
    }
    return $false
}

function Expand-Impacted {
    param(
        [string[]]$Changed,
        [object]$Map
    )
    $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $ruleMap = @{}
    foreach ($rule in $Map.rules) {
        $ruleMap[$rule.source] = @($rule.targets)
    }

    foreach ($item in $Changed) {
        [void]$set.Add($item)
        if ($ruleMap.ContainsKey($item)) {
            foreach ($target in $ruleMap[$item]) {
                [void]$set.Add($target)
            }
        }
    }
    return $set
}

function Build-RelatedMap {
    param([object]$Map)
    $dict = @{}
    foreach ($rule in $Map.rules) {
        if (-not $dict.ContainsKey($rule.source)) { $dict[$rule.source] = @() }
        $dict[$rule.source] += @($rule.targets)
        foreach ($target in $rule.targets) {
            if (-not $dict.ContainsKey($target)) { $dict[$target] = @() }
            $dict[$target] += @($rule.source)
        }
    }
    return $dict
}

function Load-SingleOwnerRegistry {
    param([string]$Root)
    $path = Join-Path $Root "docs/operations/single-owner-registry.json"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        return (Load-Json -Path $path)
    } catch {
        throw "Invalid single-owner registry JSON: $path"
    }
}

function Test-SingleOwnerViolations {
    param(
        [string]$Root,
        [object]$Registry
    )
    $violations = @()
    if (-not $Registry -or -not $Registry.rules) { return $violations }

    $allMd = Get-ChildItem -Path $Root -Recurse -File -Filter *.md | ForEach-Object {
        To-RelPath -Root $Root -PathValue $_.FullName
    }

    foreach ($rule in $Registry.rules) {
        if (-not $rule.owner -or -not $rule.marker) { continue }
        $owner = "$($rule.owner)"
        $marker = "$($rule.marker)"
        $scanSet = @()
        if ($rule.scan_files) {
            $scanSet = @($rule.scan_files | ForEach-Object { "$($_)".Replace('\', '/') })
        } else {
            $scanSet = @($allMd)
        }
        foreach ($rel in $scanSet) {
            if ($rel -ieq $owner) { continue }
            $full = Join-Path $Root $rel
            if (-not (Test-Path -LiteralPath $full)) { continue }
            $content = Get-Content -Raw -Path $full -Encoding UTF8
            if ($content -like ("*" + $marker + "*")) {
                $violations += [ordered]@{
                    rule_id = "$($rule.id)"
                    owner = $owner
                    marker = $marker
                    file = $rel
                }
            }
        }
    }
    return $violations
}

function Detect-ChangedFiles {
    param(
        [string]$Root,
        [object]$Map,
        [datetime]$SinceUtc
    )
    $detected = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

    foreach ($relDir in $Map.watch_roots) {
        $dirFull = Join-Path $Root $relDir
        if (-not (Test-Path $dirFull)) { continue }
        Get-ChildItem -Path $dirFull -Recurse -File | ForEach-Object {
            if ($_.LastWriteTimeUtc -gt $SinceUtc) {
                [void]$detected.Add((To-RelPath -Root $Root -PathValue $_.FullName))
            }
        }
    }

    foreach ($relFile in $Map.watch_files) {
        $fileFull = Join-Path $Root $relFile
        if ((Test-Path $fileFull) -and ((Get-Item $fileFull).LastWriteTimeUtc -gt $SinceUtc)) {
            [void]$detected.Add((To-RelPath -Root $Root -PathValue $fileFull))
        }
    }
    return @($detected)
}

function Invoke-Once {
    param(
        [string]$Root,
        [string[]]$InputChanged,
        [switch]$UseAutoDetect,
        [switch]$DoApply,
        [switch]$DoReport
    )
    $mapPath = Join-Path $Root "docs/change-impact-map.json"
    if (-not (Test-Path $mapPath)) {
        throw "Missing mapping file: $mapPath"
    }
    $map = Load-Json -Path $mapPath

    $stateDir = Join-Path $Root ".agency-state"
    $statePath = Join-Path $stateDir "doc-sync-state.json"
    if (-not (Test-Path $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir | Out-Null
    }

    $lastRunUtc = [datetime]"1970-01-01T00:00:00Z"
    $hasState = $false
    if (Test-Path $statePath) {
        $hasState = $true
        try {
            $stateObj = Load-Json -Path $statePath
            if ($stateObj.last_run_utc) {
                $lastRunUtc = [datetime]::Parse($stateObj.last_run_utc).ToUniversalTime()
            }
        } catch {}
    }

    if ((-not $hasState) -and ($UseAutoDetect -or $InputChanged.Count -eq 0)) {
        $bootstrapState = [ordered]@{
            last_run_utc = (Get-Date).ToUniversalTime().ToString("o")
            changed_files = @()
            impacted_files = @()
            auto_updated_files = @()
        }
        Save-Json -Path $statePath -Object $bootstrapState
        Write-Output "Initialized sync baseline state. Re-run with -AutoDetect after edits."
        return
    }

    $changed = @()
    if ($UseAutoDetect -or $InputChanged.Count -eq 0) {
        $changed = Detect-ChangedFiles -Root $Root -Map $map -SinceUtc $lastRunUtc
    } else {
        foreach ($item in $InputChanged) {
            $full = if ([System.IO.Path]::IsPathRooted($item)) { $item } else { Join-Path $Root $item }
            if (Test-Path $full) {
                $changed += (To-RelPath -Root $Root -PathValue $full)
            }
        }
    }
    $changed = @($changed | Sort-Object -Unique)

    if ($changed.Count -eq 0) {
        Write-Output "No changed files detected."
        return
    }

    $impactedSet = Expand-Impacted -Changed $changed -Map $map
    $impacted = @($impactedSet) | Sort-Object
    $relatedMap = Build-RelatedMap -Map $map

    $updated = @()
    if ($DoApply) {
        foreach ($file in $impacted) {
            if ($relatedMap.ContainsKey($file)) {
                $related = $relatedMap[$file] | Where-Object { $_ -ne $file } | Sort-Object -Unique
                if (Upsert-RelatedBlock -Root $Root -RelativeFile $file -Related $related) {
                    $updated += $file
                }
            }
        }

        $monoRoot = Split-Path -Path $Root -Parent
        $syncEnt = Join-Path $monoRoot "scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1"
        if (Test-Path -LiteralPath $syncEnt) {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $syncEnt -MonorepoRoot $monoRoot -Quiet
        }
    }

    $singleOwnerViolations = @()
    $singleOwnerRegistry = Load-SingleOwnerRegistry -Root $Root
    if ($singleOwnerRegistry) {
        $singleOwnerViolations = @(Test-SingleOwnerViolations -Root $Root -Registry $singleOwnerRegistry)
    }

    if ($DoReport) {
        $reportDir = Join-Path $Root "reports/closeout"
        if (-not (Test-Path $reportDir)) {
            New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
        }
        $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        $reportPath = Join-Path $reportDir ("closeout-" + $stamp + ".md")
        $report = @()
        $report += "# Closeout Auto Checklist - $stamp"
        $report += ""
        $report += "## Changed Files"
        foreach ($f in $changed) { $report += ('- [x] `{0}`' -f $f) }
        $report += ""
        $report += "## Impacted Files"
        foreach ($f in $impacted) {
            $ok = (Join-Path $Root $f) | Test-Path
            $status = if ($ok) { "x" } else { " " }
            $report += ('- [{0}] `{1}`' -f $status, $f)
        }
        $report += ""
        $report += "## Auto-Sync Updates"
        if ($updated.Count -eq 0) {
            $report += "- No files required metadata sync updates."
        } else {
            foreach ($f in ($updated | Sort-Object -Unique)) { $report += ('- Updated related block: `{0}`' -f $f) }
        }
        $report += ""
        $report += "## Manual Semantic Review"
        $report += "- [ ] Verify business logic consistency for impacted docs."
        $report += '- [ ] Update `WORKLOG.md` decision entries if policy changed.'
        $report += '- [ ] Update `TASKS.md` status if scope or priority changed.'
        $report += ""
        $report += "## Single Owner Policy Check"
        if ($singleOwnerViolations.Count -eq 0) {
            $report += "- PASS: no duplicated owner-marked content detected."
        } else {
            foreach ($v in $singleOwnerViolations) {
                $report += ('- FAIL: `{0}` duplicates owner marker from `{1}` (rule: `{2}`)' -f $v.file, $v.owner, $v.rule_id)
            }
        }
        Set-Content -Path $reportPath -Value ($report -join "`r`n") -Encoding UTF8
        Write-Output ("Checklist report: " + (To-RelPath -Root $Root -PathValue $reportPath))
    }

    if ($singleOwnerViolations.Count -gt 0) {
        $msg = @("Single Owner policy violation detected:")
        foreach ($v in $singleOwnerViolations) {
            $msg += ("- " + $v.file + " duplicates owner content marker from " + $v.owner + " (" + $v.rule_id + ")")
        }
        throw ($msg -join "`n")
    }

    $newState = [ordered]@{
        last_run_utc = (Get-Date).ToUniversalTime().ToString("o")
        changed_files = $changed
        impacted_files = $impacted
        auto_updated_files = ($updated | Sort-Object -Unique)
    }
    Save-Json -Path $statePath -Object $newState

    Write-Output ("Changed: " + ($changed -join ", "))
    Write-Output ("Impacted: " + ($impacted -join ", "))
    Write-Output ("Auto-updated metadata blocks: " + (($updated | Sort-Object -Unique) -join ", "))
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$apply = -not $SkipApply
$report = -not $SkipReport

if ($Watch) {
    Write-Output "Watch mode started. Press Ctrl+C to stop."
    while ($true) {
        Invoke-Once -Root $root -InputChanged @() -UseAutoDetect -DoApply:$apply -DoReport:$report
        Start-Sleep -Seconds 10
    }
} else {
    Invoke-Once -Root $root -InputChanged $ChangedFiles -UseAutoDetect:$AutoDetect -DoApply:$apply -DoReport:$report
}
