# Claude Code UserPromptSubmit: when the user message is AO-RESUME, run the real
# ao-resume.ps1 on disk (not "rules only"). Writes agency-os/.agency-state
# artifacts for the agent to read; always returns continue=true so chat proceeds.
#
# Ported from .cursor/hooks/run-ao-resume-on-prompt.ps1 (Cursor beforeSubmitPrompt).
# Both hooks call the same scripts/ao-resume.ps1 and write to the same state dir,
# so the 120-second de-dup guard in ao-resume-hook-last.json works across both IDEs.
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
        $out = @(git status --porcelain 2>$null)
        if ($LASTEXITCODE -ne 0) { return @() }
        return @($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    catch { return @() }
    finally {
        Pop-Location | Out-Null
    }
}

try {
    $stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $raw = $stdin.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    $obj = $raw | ConvertFrom-Json
    $prompt = [string]$obj.prompt
    $isAoResume = Test-IsAoResumePrompt -Prompt $prompt

    $roots = @()
    if ($obj.PSObject.Properties.Name -contains "workspace_roots" -and $obj.workspace_roots) {
        $roots = @($obj.workspace_roots)
    }

    $root = Resolve-MonorepoRootWithAoResume -WorkspaceRoots $roots
    if (-not $root) {
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    # Always auto-checkpoint on every prompt if working tree is dirty.
    # This ensures untracked/modified files are never left behind even when
    # the user doesn't type AO-RESUME or AO-CLOSE.
    $dirtyCheck = Get-GitDirtyEntries -RepoRoot $root
    if (@($dirtyCheck).Count -gt 0 -and -not $isAoResume) {
        $checkpointScript = Join-Path $root "scripts\commit-checkpoint.ps1"
        if (Test-Path -LiteralPath $checkpointScript) {
            Push-Location -LiteralPath $root
            try {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkpointScript -Message "[claude] checkpoint: auto-save on session start" 2>&1 | Out-Null
            } finally {
                Pop-Location | Out-Null
            }
        }
        Write-HookResponse '{"continue":true}'
        exit 0
    }

    if (-not $isAoResume) {
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
    if (@($dirtyBefore).Count -gt 0) {
        $autoCheckpointAttempted = $true
        $checkpointScript = Join-Path $root "scripts\commit-checkpoint.ps1"
        if (Test-Path -LiteralPath $checkpointScript) {
            Push-Location -LiteralPath $root
            try {
                $allLogLines.Add("== AO-RESUME hook: dirty tree detected; auto-checkpoint before FullMainlineParity ==") | Out-Null
                $cpOut = @(
                    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkpointScript -Message "[claude] checkpoint: auto-save dirty tree before AO-RESUME hook" 2>&1
                )
                $autoCheckpointExit = $LASTEXITCODE
                foreach ($line in $cpOut) { $allLogLines.Add([string]$line) | Out-Null }
            }
            finally {
                Pop-Location | Out-Null
            }

            $dirtyAfterCp = Get-GitDirtyEntries -RepoRoot $root
            $autoCheckpointCommitted = (@($dirtyAfterCp).Count -lt @($dirtyBefore).Count)
            $autoCheckpointSummary = "dirty_before=$(@($dirtyBefore).Count); dirty_after=$(@($dirtyAfterCp).Count)"
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
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resumeScript -FullMainlineParity 2>&1
        )
        $exit = $LASTEXITCODE
        foreach ($line in $resumeOut) { $allLogLines.Add([string]$line) | Out-Null }
    }
    finally {
        Pop-Location | Out-Null
    }

    ($allLogLines -join "`r`n") | Set-Content -LiteralPath $logFile -Encoding UTF8

    $meta = [ordered]@{
        hook_event        = "UserPromptSubmit"
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
        agent_skip_rerun_seconds = 120
        note              = "If this file mtime is within agent_skip_rerun_seconds of agent handling AO-RESUME, do not re-run ao-resume.ps1; read log_tail in this JSON and TASKS/snapshot."
    }

    $tailLines = 48
    $tailText = ""
    if (Test-Path -LiteralPath $logFile) {
        $tailText = (Get-Content -LiteralPath $logFile -Tail $tailLines -ErrorAction SilentlyContinue) -join "`n"
        if ($tailText.Length -gt 120000) {
            $tailText = $tailText.Substring($tailText.Length - 120000)
        }
    }
    $meta["log_tail"] = $tailText

    ($meta | ConvertTo-Json -Depth 4 -Compress) | Set-Content -LiteralPath $jsonFile -Encoding UTF8

    Write-HookResponse '{"continue":true}'
    exit 0
}
catch {
    # Observability: write the exception to a fail log so silent failures are diagnosable.
    # Best-effort — we still always return continue=true so chat is never blocked by the hook.
    try {
        $failRoot = $null
        try {
            if ($obj -and $obj.PSObject.Properties.Name -contains "workspace_roots" -and $obj.workspace_roots) {
                foreach ($w in @($obj.workspace_roots)) {
                    if ($w -and (Test-Path -LiteralPath (Join-Path $w "agency-os"))) { $failRoot = $w; break }
                }
            }
        } catch { }
        if (-not $failRoot) { try { $failRoot = (Get-Location).Path } catch { } }
        if ($failRoot) {
            $failDir = Join-Path $failRoot "agency-os\.agency-state"
            if (-not (Test-Path -LiteralPath $failDir)) {
                try { New-Item -ItemType Directory -Path $failDir -Force | Out-Null } catch { }
            }
            $failLog = Join-Path $failDir "ao-resume-hook-fail.log"
            $now = (Get-Date).ToUniversalTime().ToString("o")
            $msg = if ($_ -and $_.Exception) { $_.Exception.Message } else { "<no exception object>" }
            $stack = if ($_ -and $_.ScriptStackTrace) { $_.ScriptStackTrace } else { "" }
            $payload = "[$now] HOOK EXCEPTION`r`nMessage: $msg`r`nStack:`r`n$stack`r`n---`r`n"
            try { Add-Content -LiteralPath $failLog -Value $payload -Encoding UTF8 } catch { }
        }
    } catch { }
    try {
        Write-HookResponse '{"continue":true}'
    }
    catch { }
    exit 0
}
