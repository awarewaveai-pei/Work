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
. (Join-Path $PSScriptRoot 'lib\repo-text.ps1')

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

function To-RelPath {
    param([string]$Root, [string]$PathValue)
    $rootUri = New-Object System.Uri(($Root.TrimEnd('\') + '\'))
    $fullPath = if ([System.IO.Path]::IsPathRooted($PathValue)) { $PathValue } else { Join-Path $Root $PathValue }
    # -LiteralPath is required: the repo contains Next.js route folders such as
    # app/ops/clients/[slug] and app/(shell), and without it PowerShell treats
    # '[' / ']' as wildcard metacharacters, resolves nothing, and then
    # $null.Path throws under Set-StrictMode -Version Latest. That made
    # doc-sync-automation.ps1 -AutoDetect abort for every caller (2026-08-12).
    $fileUri = New-Object System.Uri((Resolve-Path -LiteralPath $fullPath).Path)
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
    $normRel = $RelativeFile.Replace('\', '/')
    # change-impact-map Related paths are agency-os-root relative; writing them into
    # lobster-factory (or other monorepo siblings) breaks relative links. Skip auto Related there.
    if ($normRel -match '(?i)^\.\./lobster-factory/') {
        return $false
    }
    # agency-os/README.md is the human hub: keep curated categorized links (not a flat auto list).
    if ($normRel -ieq 'README.md') {
        return $false
    }
    # tenants/README.md: curated tenant hub; do not flatten Related.
    if ($normRel -ieq 'tenants/README.md') {
        return $false
    }

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

    # The block is the LAST line that is exactly the marker: prose that mentions the marker inline
    # (WORKLOG.md quotes it) must never be taken as the block start.
    $markers = [regex]::Matches($content, '(?m)^## Related Documents \(Auto-Synced\)[ \t]*\r?$')
    $startIdx = if ($markers.Count -gt 0) { $markers[$markers.Count - 1].Index } else { -1 }
    if ($startIdx -ge 0) {
        # Replace only this block: marker through its own "_Last synced:" line. Ending at the next
        # "## " heading instead deleted any other text below the block -- the H1 maintenance note
        # at the end of CHANGE_IMPACT_MATRIX.md (2026-10-14). Without the stamp line, stop at the
        # next heading of any level.
        $headingIdx = $content.IndexOf("`n#", $startIdx + 1)
        $stamp = [regex]::Match($content.Substring($startIdx), '(?m)^_Last synced:')
        $stampIdx = if ($stamp.Success) { $startIdx + $stamp.Index } else { -1 }
        $tail = ""
        if ($stampIdx -ge 0 -and ($headingIdx -lt 0 -or $stampIdx -lt $headingIdx)) {
            $stampEnd = $content.IndexOf("`n", $stampIdx)
            if ($stampEnd -ge 0) { $tail = $content.Substring($stampEnd + 1) }
        } elseif ($headingIdx -ge 0) {
            $tail = $content.Substring($headingIdx + 1)
        }
        $tail = $tail.TrimStart("`r", "`n")
        $newContent = $content.Substring(0, $startIdx).TrimEnd("`r", "`n") + "`r`n`r`n" + $block + "`r`n"
        if ($tail) { $newContent += "`r`n" + $tail.TrimEnd("`r", "`n") }
    } else {
        $newContent = $content.TrimEnd("`r", "`n") + "`r`n`r`n" + $block + "`r`n"
    }

    # Only the stamp would change = nothing synced: a stamp-only rewrite kept shared files dirty for no content.
    $noStamp = { param($t) ($t -replace '(?m)^_Last synced: [^\r\n]*', '').TrimEnd("`r", "`n") }
    if ((& $noStamp $newContent) -ne (& $noStamp $content)) {
        Write-RepoTextFile -Path $full -Content ($newContent + "`n")   # + the newline Set-Content used to add
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
    # Force array: single-element pipeline output unwraps to scalar and breaks foreach + ConvertTo-Json.
    $impacted = @(@($impactedSet) | Sort-Object)
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

        # REMOVED 2026-08-28: this used to invoke scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1
        # to mirror agency-os/.cursor/rules into the repo root. Cursor was retired 2026-08-26 and
        # that script plus both rules trees were deleted, so the Test-Path guard had turned the call
        # into a permanent silent no-op -- a call site that looks like it still does something.
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
            foreach ($f in @($updated | Sort-Object -Unique)) { $report += ('- Updated related block: `{0}`' -f $f) }
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

    $autoUpdated = @($updated | Sort-Object -Unique)
    $newState = [ordered]@{
        last_run_utc = (Get-Date).ToUniversalTime().ToString("o")
        changed_files = @($changed)
        impacted_files = @($impacted)
        auto_updated_files = $autoUpdated
    }
    Save-Json -Path $statePath -Object $newState

    Write-Output ("Changed: " + ($changed -join ", "))
    Write-Output ("Impacted: " + ($impacted -join ", "))
    Write-Output ("Auto-updated metadata blocks: " + ($autoUpdated -join ", "))
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
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
