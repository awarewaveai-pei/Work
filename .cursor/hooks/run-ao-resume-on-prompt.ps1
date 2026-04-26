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

try {
    $raw = [Console]::In.ReadToEnd()
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

    Push-Location -LiteralPath $root
    try {
        # PS 5.1: redirect all streams to log (avoid Tee-Object -Encoding which needs PS 6+).
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $resumeScript -FullMainlineParity *>&1 |
            Set-Content -LiteralPath $logFile -Encoding UTF8
        $exit = $LASTEXITCODE
    }
    finally {
        Pop-Location | Out-Null
    }

    $meta = [ordered]@{
        hook_event        = "beforeSubmitPrompt"
        generation_id     = $genId
        conversation_id   = $convId
        work_root         = $root
        exit_code         = $exit
        finished_utc      = (Get-Date).ToUniversalTime().ToString("o")
        log_relative      = "agency-os/.agency-state/ao-resume-hook-last.log"
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
    try {
        Write-HookResponse '{"continue":true}'
    }
    catch { }
    exit 0
}
