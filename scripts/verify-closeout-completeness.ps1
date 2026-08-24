<#
.SYNOPSIS
  Blocks AO-CLOSE push when staged "significant" changes lack WORKLOG evidence for today.

.DESCRIPTION
  ASCII-only for Windows PowerShell 5.1.
  Evidence = WORKLOG today section contains `- AUTO_TASK_DONE:`, `- AUTO_TASK_DONE_APPLIED`, or merged inbox verbatim block.
  Excludes generated-only paths (reports, integrated-status snapshot, etc.).
#>
param(
    [string]$WorkRoot = "",
    [ValidateSet("off", "warn", "strict")]
    [string]$Gate = "strict"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Gate -eq "off") {
    exit 0
}

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

# Dot-source UTF-8 console helper (safe capture of external-command stdout on CP950 Windows).
# Required so git diff/rev-parse stdout is decoded as UTF-8, not CP950, on zh-TW hosts.
$_helperPath = Join-Path $PSScriptRoot '_console-encoding-helpers.ps1'
if (Test-Path -LiteralPath $_helperPath) {
    . $_helperPath
} else {
    Write-Warning "verify-closeout-completeness: _console-encoding-helpers.ps1 missing — git output may decode incorrectly on CP950 hosts."
}

# Dot-source oracle function (defines Invoke-BughuntOracle for use inside the try block below).
# $Bh* params in oracle's param() block prevent clobbering caller's $WorkRoot/$Gate on dot-source.
$_oraclePath = Join-Path $PSScriptRoot 'bughunt-oracle.ps1'
if (Test-Path -LiteralPath $_oraclePath) {
    . $_oraclePath
} elseif ($Gate -eq "strict") {
    Write-Warning "bughunt-oracle: oracle script missing at $_oraclePath — content verification SKIPPED (gate degraded)."
}

Push-Location $WorkRoot
try {
    $null = Invoke-WithUtf8Console { git rev-parse --git-dir 2>$null }
    if ($LASTEXITCODE -ne 0) {
        exit 0
    }

    $staged = @(Invoke-WithUtf8Console { git diff --cached --name-only } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($staged.Count -eq 0) {
        exit 0
    }

    $excludePattern = '(?i)^(reports/|agency-os/reports/)|integrated-status-LATEST\.md$|LAST_SYSTEM_STATUS\.md$|doc-sync-state\.json$|^agency-os/\.agency-state/closeout-inbox\.md$'

    $significant = @(
        $staged | Where-Object { $_ -notmatch $excludePattern }
    )

    if ($significant.Count -eq 0) {
        exit 0
    }

    $today = (Get-Date).ToString("yyyy-MM-dd")
    $worklogPath = Join-Path $WorkRoot "agency-os\WORKLOG.md"
    if (-not (Test-Path -LiteralPath $worklogPath)) {
        $msg = "verify-closeout-completeness: WORKLOG.md missing but staged changes exist."
        if ($Gate -eq "strict") {
            Write-Host $msg -ForegroundColor Red
            exit 1
        }
        Write-Warning $msg
        exit 0
    }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $lines = [System.IO.File]::ReadAllLines($worklogPath, $utf8)
    $hdr = "## $today"
    $start = -1
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i].Trim() -eq $hdr) {
            $start = $i
            break
        }
    }

    if ($start -lt 0) {
        $msg = "verify-closeout-completeness: no WORKLOG section $hdr but staged edits exist. Run scaffold or add section."
        if ($Gate -eq "strict") {
            Write-Host $msg -ForegroundColor Red
            exit 1
        }
        Write-Warning $msg
        exit 0
    }

    $sb = New-Object System.Text.StringBuilder
    for ($j = $start + 1; $j -lt $lines.Length; $j++) {
        if ($lines[$j] -match '^\s*##\s+\d{4}-\d{2}-\d{2}\s*$') {
            break
        }
        [void]$sb.AppendLine($lines[$j])
    }
    $section = $sb.ToString()

    $hasEvidence = $false
    if ($section -match '(?m)^\s*-\s*AUTO_TASK_DONE:') {
        $hasEvidence = $true
    }
    if ($section -match '(?m)^\s*-\s*AUTO_TASK_DONE_APPLIED') {
        $hasEvidence = $true
    }
    if ($section -match 'Closeout inbox \(AO-CLOSE auto') {
        $hasEvidence = $true
    }

    if (-not $hasEvidence) {
        $list = ($significant -join ", ")
        $msg = "verify-closeout-completeness: staged changes ($list) require today's WORKLOG evidence: add line `- AUTO_TASK_DONE: <substring>` and/or ensure inbox merge appended `Closeout inbox (AO-CLOSE auto`. Gate=$Gate"
        if ($Gate -eq "strict") {
            Write-Host $msg -ForegroundColor Red
            exit 1
        }
        Write-Warning $msg
    }

    # REALTEST gate: if code files are staged, today's WORKLOG must have REALTEST_EVIDENCE: or REALTEST_WAIVED:.
    # Legitimate exceptions -> add REALTEST_WAIVED: <DOC_ONLY|SMOKE_COVERED|QUERY_ONLY|NA> -- <reason>
    # Extend $codeExts when new runtimes are added to the repo (add .psm1/.psd1 if PS modules ship).
    $codeExts = @('.ps1', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.sh', '.py', '.psm1', '.psd1')
    $hasCodeStaged = $false
    foreach ($sf in $significant) {
        # Use regex fallback: [System.IO.Path]::GetExtension throws on git octal-escaped paths (e.g. "\351\203...")
        $ext = try { [System.IO.Path]::GetExtension($sf).ToLowerInvariant() } catch { if ($sf -match '\.(\w+)$') { ".$($Matches[1].ToLowerInvariant())" } else { '' } }
        if ($codeExts -contains $ext) {
            $hasCodeStaged = $true
            break
        }
    }
    if ($hasCodeStaged) {
        $hasRtEvidence = $false
        if ($section -match '(?m)^\s*-\s*REALTEST_EVIDENCE:')                                  { $hasRtEvidence = $true }
        if ($section -match '(?m)^\s*-\s*REALTEST_WAIVED:\s+(DOC_ONLY|SMOKE_COVERED|QUERY_ONLY|NA)\b') { $hasRtEvidence = $true }
        if (-not $hasRtEvidence) {
            $extList = ($codeExts -join '/')
            $rtMsg = ("verify-closeout-completeness: code files staged ({0}) but no REALTEST_EVIDENCE: or REALTEST_WAIVED: in {1}." -f $extList, $hdr) +
                     " Add: - REALTEST_EVIDENCE: tool=<Bash|SSH|curl|WebFetch> | cmd=<command> | exit=<code> | ms=<N>" +
                     " OR: - REALTEST_WAIVED: <DOC_ONLY|SMOKE_COVERED|QUERY_ONLY|NA> -- <one-line reason>. Gate=$Gate"
            if ($Gate -eq "strict") {
                Write-Host $rtMsg -ForegroundColor Red
                exit 1
            }
            Write-Warning $rtMsg
        }
    }
    # Print REALTEST summary for operator spot-check (non-blocking, visual only).
    # Use same dash-anchored regex as the gate so summary and gate can never contradict each other.
    $rtLines = @(($section -split '\r?\n') | Where-Object { $_ -match '^\s*-\s*(REALTEST_EVIDENCE:|REALTEST_WAIVED:)' })
    if ($rtLines.Count -gt 0) {
        Write-Host ("== REALTEST evidence today: {0} line(s) ==" -f $rtLines.Count) -ForegroundColor Cyan
        foreach ($rtl in $rtLines) { Write-Host ("  {0}" -f $rtl.Trim()) -ForegroundColor DarkGray }
    } elseif ($hasCodeStaged) {
        Write-Host "== REALTEST: no evidence in today's WORKLOG (code staged) -- add REALTEST_EVIDENCE: or REALTEST_WAIVED: ==" -ForegroundColor Yellow
    }

    # DEBUG-TAG gate: staged code files must not contain temporary instrumentation tags.
    # Format: [DEBUG-<hex-id>] — added by /diagnose skill Phase 4; must be removed in Phase 6.
    # Waiver: add  - DEBUG_TAG_WAIVED: <reason>  to today's WORKLOG section.
    if ($hasCodeStaged) {
        $hasDebugTagWaived = ($section -match '(?m)^\s*-\s*DEBUG_TAG_WAIVED:')
        if (-not $hasDebugTagWaived) {
            $debugTagFiles = @()
            foreach ($sf in $significant) {
                $ext = try { [System.IO.Path]::GetExtension($sf).ToLowerInvariant() } catch { if ($sf -match '\.(\w+)$') { ".$($Matches[1].ToLowerInvariant())" } else { '' } }
                if ($codeExts -contains $ext) {
                    $absPath = Join-Path $WorkRoot $sf
                    if (Test-Path -LiteralPath $absPath -PathType Leaf) {
                        $content = [System.IO.File]::ReadAllText($absPath, $utf8)
                        if ($content -match '\[DEBUG-[A-Za-z0-9]+\]') {
                            $debugTagFiles += $sf
                        }
                    }
                }
            }
            if ($debugTagFiles.Count -gt 0) {
                $dtMsg = ("verify-closeout-completeness: {0} staged code file(s) contain [DEBUG-] instrumentation tags from /diagnose Phase 4: {1}. Run: grep -r '[DEBUG-' on those files to find and remove all tags. OR add: - DEBUG_TAG_WAIVED: <reason>. Gate={2}" -f $debugTagFiles.Count, ($debugTagFiles -join ', '), $Gate)
                if ($Gate -eq "strict") { Write-Host $dtMsg -ForegroundColor Red; exit 1 }
                Write-Warning $dtMsg
            }
        }
    }

    # REVIEW gate: all significant staged changes require REVIEW_DONE: or REVIEW_WAIVED:.
    # Legitimate exceptions -> REVIEW_WAIVED: <DOC_ONLY|NA> -- <reason>
    $hasReviewEvidence = $false
    if ($section -match '(?m)^\s*-\s*REVIEW_DONE:')                     { $hasReviewEvidence = $true }
    if ($section -match '(?m)^\s*-\s*REVIEW_WAIVED:\s+(DOC_ONLY|NA)\b') { $hasReviewEvidence = $true }
    if (-not $hasReviewEvidence) {
        $rvMsg = ("verify-closeout-completeness: staged changes require REVIEW_DONE: or REVIEW_WAIVED: in {0}." -f $hdr) +
                 " Add: - REVIEW_DONE: critic=<Quick|Standard|Deep> | verdict=<pass/warn/fail> | findings=<Nc/Nm/Nn>" +
                 " OR: - REVIEW_WAIVED: <DOC_ONLY|NA> -- <one-line reason>. Gate=$Gate"
        if ($Gate -eq "strict") { Write-Host $rvMsg -ForegroundColor Red; exit 1 }
        Write-Warning $rvMsg
    }
    $rvLines = @(($section -split '\r?\n') | Where-Object { $_ -match '^\s*-\s*(REVIEW_DONE:|REVIEW_WAIVED:)' })
    if ($rvLines.Count -gt 0) {
        Write-Host ("== REVIEW evidence today: {0} line(s) ==" -f $rvLines.Count) -ForegroundColor Cyan
        foreach ($rvl in $rvLines) { Write-Host ("  {0}" -f $rvl.Trim()) -ForegroundColor DarkGray }
    } else {
        Write-Host "== REVIEW: no evidence in today's WORKLOG -- add REVIEW_DONE: or REVIEW_WAIVED: ==" -ForegroundColor Yellow
    }

    # ORACLE gate: source changes require a cross-model review ARTIFACT, not a claim.
    # Every other gate here validates that an evidence LINE exists -- a line the author
    # types, so "forgot to review" and "remembered to write the line" look identical.
    # This artifact is written by scripts/codex-oracle.ps1 itself when it runs, so a
    # forgotten oracle pass cannot be papered over by remembering the paperwork.
    # It still does not prove the findings were ACTED on -- that stays operator
    # discipline (AGENTS.md §已知信任邊界). It closes the "forgot" hole only.
    # Waiver: - ORACLE_WAIVED: <reason>   (visible in WORKLOG, never silent)
    #
    # Deliberately NOT reusing $codeExts: that list drives REALTEST/DEBUG-TAG and omits
    # .sql/.yml/.php, which in this repo means DB migrations, docker-compose and the
    # wp-bridge plugin would skip cross-model review entirely (codex FINDING 2,
    # 2026-08-20 -- 214 such files tracked). Widening $codeExts instead would silently
    # extend three unrelated gates, so the broader set is scoped to this gate.
    # Round 2 (codex FINDING 2): .json/.toml/.html/.css were still unreviewed while
    # codex-oracle already treats them as source. Lockfiles are excluded by NAME, not
    # by extension: they are generated artifacts, so requiring a cross-model review of
    # a regenerated package-lock.json would train the operator to reach for the waiver.
    $oracleExts = $codeExts + @('.sql', '.yml', '.yaml', '.php', '.tf', '.tfvars',
                                '.json', '.toml', '.html', '.css', '.cjs')
    $oracleExcludeNames = '(?i)(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock|poetry\.lock)$'
    $oracleStaged = @()
    foreach ($sf in $significant) {
        $ext = try { [System.IO.Path]::GetExtension($sf).ToLowerInvariant() } catch { if ($sf -match '\.(\w+)$') { ".$($Matches[1].ToLowerInvariant())" } else { '' } }
        if (($oracleExts -contains $ext) -and ($sf -notmatch $oracleExcludeNames)) { $oracleStaged += $sf }
    }
    if ($oracleStaged.Count -gt 0) {
        $oracleDir   = Join-Path $WorkRoot 'agency-os\reports\oracle'
        $todayOracle = @()
        if (Test-Path -LiteralPath $oracleDir) {
            $todayOracle = @(Get-ChildItem -LiteralPath $oracleDir -Filter ('{0}-review-*.md' -f $today) -File -ErrorAction SilentlyContinue)
        }
        $hasOracleWaiver = ($section -match '(?m)^\s*-\s*ORACLE_WAIVED:\s+\S')
        if ($todayOracle.Count -eq 0 -and -not $hasOracleWaiver) {
            $orMsg = ("verify-closeout-completeness: source files staged ({0}) but no cross-model review artifact dated {1} in agency-os/reports/oracle/." -f ($oracleStaged -join ', '), $today) +
                     " Run: .\scripts\codex-oracle.ps1 -Mode review -Context '<what this change solves>'" +
                     (" OR add: - ORACLE_WAIVED: <one-line reason> to {0}. Gate={1}" -f $hdr, $Gate)
            if ($Gate -eq "strict") { Write-Host $orMsg -ForegroundColor Red; exit 1 }
            Write-Warning $orMsg
        }
        elseif ($todayOracle.Count -gt 0) {
            # Same-day existence alone would pass a morning review against an afternoon
            # rewrite (codex FINDING 1, 2026-08-20). Binding to diff content is not
            # possible -- the oracle reads the working tree BEFORE staging, so no hash
            # of the staged diff can match. Ordering is the available signal: the newest
            # artifact must post-date the newest source file it claims to have reviewed.
            $newestArtifact = ($todayOracle | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
            $staleAgainst = @()
            $unverifiable = @()
            foreach ($sf in $oracleStaged) {
                $full = Join-Path $WorkRoot ($sf.Replace('/', '\'))
                # A staged DELETION has no mtime to compare, so freshness is unprovable
                # here (codex FINDING 3, round 2). Skipping silently would reopen the
                # stale-review hole for deletions, so it is reported instead -- the same
                # 'a blind detector must not look like a pass' rule as check-smoke-tests.
                if (-not (Test-Path -LiteralPath $full)) { $unverifiable += $sf; continue }
                $mt = (Get-Item -LiteralPath $full -ErrorAction SilentlyContinue)
                if ($mt -and $mt.LastWriteTime -gt $newestArtifact.LastWriteTime) { $staleAgainst += $sf }
            }
            if ($staleAgainst.Count -gt 0 -and -not $hasOracleWaiver) {
                $stMsg = ("verify-closeout-completeness: newest oracle artifact ({0}, {1}) predates staged source edited after it: {2}." -f $newestArtifact.Name, $newestArtifact.LastWriteTime.ToString('HH:mm:ss'), ($staleAgainst -join ', ')) +
                         " The review did not see the final code. Re-run: .\scripts\codex-oracle.ps1 -Mode review -Context '<what changed>'" +
                         (" OR add: - ORACLE_WAIVED: <one-line reason> to {0}. Gate={1}" -f $hdr, $Gate)
                if ($Gate -eq "strict") { Write-Host $stMsg -ForegroundColor Red; exit 1 }
                Write-Warning $stMsg
            }
            Write-Host ("== ORACLE artifacts today: {0} (newest {1}) ==" -f $todayOracle.Count, $newestArtifact.LastWriteTime.ToString('HH:mm:ss')) -ForegroundColor Cyan
            foreach ($o in $todayOracle) { Write-Host ("  agency-os/reports/oracle/{0}" -f $o.Name) -ForegroundColor DarkGray }
        }
    }


    # BUGHUNT gate: all significant staged changes require BUGHUNT_DONE: or BUGHUNT_WAIVED:.
    # Legitimate exceptions -> BUGHUNT_WAIVED: <DOC_ONLY|NA> -- <reason>
    $hasBughuntEvidence = $false
    if ($section -match '(?m)^\s*-\s*BUGHUNT_DONE:')                     { $hasBughuntEvidence = $true }
    if ($section -match '(?m)^\s*-\s*BUGHUNT_WAIVED:\s+(DOC_ONLY|NA)\b') { $hasBughuntEvidence = $true }
    if (-not $hasBughuntEvidence) {
        $bhMsg = ("verify-closeout-completeness: staged changes require BUGHUNT_DONE: or BUGHUNT_WAIVED: in {0}." -f $hdr) +
                 " Add: - BUGHUNT_DONE: scope=<paths> | grep=<pattern> | hits=<N>" +
                 " OR: - BUGHUNT_WAIVED: <DOC_ONLY|NA> -- <one-line reason>. Gate=$Gate"
        if ($Gate -eq "strict") { Write-Host $bhMsg -ForegroundColor Red; exit 1 }
        Write-Warning $bhMsg
    }
    $bhLines = @(($section -split '\r?\n') | Where-Object { $_ -match '^\s*-\s*(BUGHUNT_DONE:|BUGHUNT_WAIVED:)' })
    if ($bhLines.Count -gt 0) {
        Write-Host ("== BUGHUNT evidence today: {0} line(s) ==" -f $bhLines.Count) -ForegroundColor Cyan
        foreach ($bhl in $bhLines) { Write-Host ("  {0}" -f $bhl.Trim()) -ForegroundColor DarkGray }
    } else {
        Write-Host "== BUGHUNT: no evidence in today's WORKLOG -- add BUGHUNT_DONE: or BUGHUNT_WAIVED: ==" -ForegroundColor Yellow
    }

    # BUGHUNT scope keyword gate: scope= must mention required root paths.
    # SSOT for required roots lives here; AGENTS.md R0 §抓蟲 references these names.
    # When repo root structure changes, update $bhRequiredRoots AND AGENTS.md §抓蟲 bullet (two files only).
    if ($hasBughuntEvidence) {
        $bhDoneLine = @(($section -split '\r?\n') | Where-Object { $_ -match '^\s*-\s*BUGHUNT_DONE:' }) | Select-Object -First 1
        $hasScopeNarrow = ($section -match '(?m)^\s*-\s*BUGHUNT_SCOPE_NARROW:')
        if ($bhDoneLine -and -not $hasScopeNarrow) {
            # Always-required roots (gate enforced). For .claude/ and lobster-factory/ add when relevant.
            # SSOT: $bhRequiredRoots here; AGENTS.md R0 §抓蟲 references these names.
            $bhRequiredRoots = @('agency-os', 'scripts')
            # Extract only the scope= value (before next | field) to avoid matching grep= or hits= fields.
            $scopeVal = if ($bhDoneLine -match 'scope=([^|]+)') { $Matches[1] } else { '' }
            $missingRoots = @($bhRequiredRoots | Where-Object { $scopeVal -notmatch [regex]::Escape($_) })
            if ($missingRoots.Count -gt 0) {
                $scopeMsg = ("verify-closeout-completeness: BUGHUNT_DONE scope= missing required root(s): {0}. Widen scope= to include them, OR add: - BUGHUNT_SCOPE_NARROW: <reason>. Gate=$Gate" -f ($missingRoots -join ', '))
                if ($Gate -eq "strict") { Write-Host $scopeMsg -ForegroundColor Red; exit 1 }
                Write-Warning $scopeMsg
            }
        }
    }

    # BUGHUNT oracle: verify hits=0 claims by literal-search of identifier-type patterns.
    # Staged files excluded — BUGHUNT checks cross-file impact, not the changed file itself.
    if ($hasBughuntEvidence -and (Get-Command Invoke-BughuntOracle -ErrorAction SilentlyContinue)) {
        $oracleResult = Invoke-BughuntOracle `
            -WorklogSection $section `
            -WorkRoot $WorkRoot `
            -Gate $Gate `
            -StagedFiles $staged
        if ($oracleResult -gt 0 -and $Gate -eq "strict") {
            exit 1
        }
    }

    # Daily note quality gate: block closeout if today's scaffold placeholders remain.
    $dailyPath = Join-Path $WorkRoot ("agency-os\memory\daily\{0}.md" -f $today)
    if (Test-Path -LiteralPath $dailyPath) {
        $dailyText = [System.IO.File]::ReadAllText($dailyPath, $utf8)
        $hasTbd = ($dailyText -match '(?m)^\s*-\s*\(TBD\)\s*$')
        if ($hasTbd) {
            $msg = "verify-closeout-completeness: daily note still contains scaffold placeholders `(TBD)` in $dailyPath. Fill Done today / Current state / Next steps before closeout. Gate=$Gate"
            if ($Gate -eq "strict") {
                Write-Host $msg -ForegroundColor Red
                exit 1
            }
            Write-Warning $msg
        }
    }
} finally {
    Pop-Location
}

exit 0
