# Cursor beforeSubmitPrompt: when the user message is AO-RESUME, run the real
# ao-resume.ps1 on disk (not "rules only"). Writes agency-os/.agency-state
# artifacts for the agent to read; always returns continue=true so chat proceeds.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-HookResponse {
    param([string]$Json)
    [Console]::Out.WriteLine($Json)
}

function Resolve-MonorepoRootWithAoResume {
    param([string[]]$WorkspaceRoots)

    $candidates = New-Object System.Collections.Generic.List[string]
    if ($WorkspaceRoots) {
        foreach ($w in $WorkspaceRoots) {
            if ($w) { $candidates.Add($w) | Out-Null }
        }
    }
    $candidates.Add((Get-Location).Path) | Out-Null

    foreach ($start in $candidates) {
        if (-not $start) { continue }
        if (-not [System.IO.Path]::IsPathRooted($start)) { continue }
        $cur = $start
        for ($i = 0; $i -lt 16; $i++) {
            $scriptPath = Join-Path $cur "scripts\ao-resume.ps1"
            if (Test-Path -LiteralPath $scriptPath) {
                return (Resolve-Path -LiteralPath $cur).Path
            }
            $parent = Split-Path -LiteralPath $cur -Parent
            if (-not $parent -or ($parent -eq $cur)) { break }
            $cur = $parent
        }
    }
    return $null
}

function Test-IsAoResumePrompt {
    param([string]$Prompt)
    if ([string]::IsNullOrWhiteSpace($Prompt)) { return $false }
    return ($Prompt.Trim() -match '(?i)^AO-RESUME\b')
}

function Get-GitDirtyEntries {
    param([string]$RepoRoot)
    Push-Location -LiteralPath $RepoRoot
    try {
        $out = @(git status --porcelain)
        if ($LASTEXITCODE -ne 0) { return @() }
        return @($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    finally {
        Pop-Location | Out-Null
    }
}

try {
    # Read stdin as UTF-8 (was [Console]::In.ReadToEnd() which uses the console's
    # default code page — CP950 on Big5 Windows — mangling CJK in the JSON prompt
    # field). Kept identical to Claude Code hook for cross-IDE consistency.
    $stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $raw = $stdin.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $obj = $raw | ConvertFrom-Json
    $prompt = [string]$obj.prompt

    if (-not (Test-IsAoResumePrompt -Prompt $prompt)) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $roots = @()
    if ($obj.PSObject.Properties.Name -contains "workspace_roots" -and $obj.workspace_roots) {
        $roots = @($obj.workspace_roots)
    }

    $root = Resolve-MonorepoRootWithAoResume -WorkspaceRoots $roots
    if (-not $root) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $stateDir = Join-Path $root "agency-os\.agency-state"
    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }

    $logFile = Join-Path $stateDir "ao-resume-hook-last.log"
    $jsonFile = Join-Path $stateDir "ao-resume-hook-last.json"
    $resumeScript = Join-Path $root "scripts\ao-resume.ps1"

    $genId = $null
    if ($obj.PSObject.Properties.Name -contains "generation_id") { $genId = [string]$obj.generation_id }
    $convId = $null
    if ($obj.PSObject.Properties.Name -contains "conversation_id") { $convId = [string]$obj.conversation_id }

    $autoCheckpointAttempted = $false
    $autoCheckpointCommitted = $false
    $autoCheckpointExit = 0
    $autoCheckpointSummary = ""
    $allLogLines = New-Object System.Collections.Generic.List[string]

    $dirtyBefore = Get-GitDirtyEntries -RepoRoot $root
    if ($dirtyBefore.Count -gt 0) {
        $autoCheckpointAttempted = $true
        $checkpointScript = Join-Path $root "scripts\commit-checkpoint.ps1"
        if (Test-Path -LiteralPath $checkpointScript) {
            Push-Location -LiteralPath $root
            try {
                $allLogLines.Add("== AO-RESUME hook: dirty tree detected; auto-checkpoint before FullMainlineParity ==") | Out-Null
                $cpOut = @(
                    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkpointScript -Message "[cursor] checkpoint: auto-save dirty tree before AO-RESUME hook" *>&1
                )
                $autoCheckpointExit = $LASTEXITCODE
                foreach ($line in $cpOut) { $allLogLines.Add([string]$line) | Out-Null }
            }
            finally {
                Pop-Location | Out-Null
            }

            $dirtyAfterCp = Get-GitDirtyEntries -RepoRoot $root
            $autoCheckpointCommitted = ($dirtyAfterCp.Count -lt $dirtyBefore.Count)
            $autoCheckpointSummary = "dirty_before=$($dirtyBefore.Count); dirty_after=$($dirtyAfterCp.Count)"
        }
        else {
            $autoCheckpointExit = 1
            $autoCheckpointSummary = "commit-checkpoint script missing"
            $allLogLines.Add("AO-RESUME hook warning: scripts/commit-checkpoint.ps1 not found; continue without checkpoint.") | Out-Null
        }
    }

    Push-Location -LiteralPath $root
    try {
        $resumeOut = @(
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resumeScript -FullMainlineParity *>&1
        )
        $exit = $LASTEXITCODE
        foreach ($line in $resumeOut) { $allLogLines.Add([string]$line) | Out-Null }
    }
    finally {
        Pop-Location | Out-Null
    }

    ($allLogLines -join "`r`n") | Set-Content -LiteralPath $logFile -Encoding UTF8

    $meta = [ordered]@{
        hook_event        = "beforeSubmitPrompt"
        generation_id     = $genId
        conversation_id   = $convId
        work_root         = $root
        exit_code         = $exit
        finished_utc      = (Get-Date).ToUniversalTime().ToString("o")
        log_relative      = "agency-os/.agency-state/ao-resume-hook-last.log"
        auto_checkpoint_attempted = $autoCheckpointAttempted
        auto_checkpoint_committed = $autoCheckpointCommitted
        auto_checkpoint_exit_code = $autoCheckpointExit
        auto_checkpoint_summary   = $autoCheckpointSummary
        agent_skip_rerun_seconds = 300
        note              = "If this file mtime is within agent_skip_rerun_seconds of agent handling AO-RESUME, do not re-run ao-resume.ps1; read steps_summary (preferred) or log_tail in this JSON and TASKS/snapshot."
    }

    # Structured step summary: parse '== ... ==' headers from ao-resume.ps1 output.
    # Agent reads steps_summary directly instead of grep-ing log_tail (which can be
    # truncated when ao-resume grows new sub-steps). Each entry captures the step
    # header + next 3 non-blank lines as a short status snapshot.
    # Root cause this prevents: 2026-05-23 hallucination where Claude saw no
    # "cross-machine import" in last-48-line log_tail and incorrectly reported
    # import as skipped (import had actually succeeded — log front-half was truncated).
    # Kept identical to Claude Code hook (mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1)
    # so dual-IDE state files have the same shape for cross-IDE de-dup.
    $stepsSummary = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $allLogLines.Count; $i++) {
        $line = [string]$allLogLines[$i]
        if ($line -match '^\s*==\s+(.+?)\s+==\s*$') {
            $stepName = $matches[1].Trim()
            $detailLines = @()
            # Lookahead window = 10 lines (was 6). See Claude hook for rationale.
            for ($j = $i + 1; $j -lt [Math]::Min($i + 10, $allLogLines.Count); $j++) {
                $d = [string]$allLogLines[$j]
                if ($d -match '^\s*==\s+(.+?)\s+==\s*$') { break }
                if (-not [string]::IsNullOrWhiteSpace($d)) { $detailLines += $d.Trim() }
                if ($detailLines.Count -ge 3) { break }
            }
            $stepsSummary.Add([ordered]@{
                name   = $stepName
                detail = ($detailLines -join ' | ')
            }) | Out-Null
        }
    }
    $meta["steps_summary"] = $stepsSummary

    # log_tail: was 48 lines (too short — front-half steps truncated). 200 gives
    # ~3x headroom. Defense-in-depth alongside steps_summary above.
    # Source = in-memory $allLogLines (not Get-Content re-read) to avoid race
    # with concurrent hook sessions. See Claude hook for full rationale.
    $tailLines = 200
    $tailText = ""
    if ($allLogLines.Count -gt 0) {
        $tailSlice = if ($allLogLines.Count -le $tailLines) {
            $allLogLines
        } else {
            $allLogLines[($allLogLines.Count - $tailLines)..($allLogLines.Count - 1)]
        }
        $tailText = ($tailSlice -join "`n")
        if ($tailText.Length -gt 120000) {
            $tailText = $tailText.Substring($tailText.Length - 120000)
        }
    }
    $meta["log_tail"] = $tailText

    # -Depth 6 (was 4): zero headroom at 4. See Claude hook for rationale.
    ($meta | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $jsonFile -Encoding UTF8

    Write-HookResponse '{"continue":true}'
    exit 0
}
catch {
    try {
        Write-HookResponse '{"continue":true}'
    }
    catch { }
    exit 0
}
