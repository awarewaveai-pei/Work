# One code tree, one data tree. Every script lives under <monorepo>\scripts and finds other
# scripts from its own $PSScriptRoot; agency-os data is found by its AGENTS.md. Never locate
# either by testing whether a script exists under agency-os\ -- that test kept a stale
# agency-os\scripts copy running on schedule for months (WORKLOG 2026-10-14).

function Get-MonorepoRoot {
    # This file is <monorepo>\scripts\lib\repo-roots.ps1.
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
}

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    $base = if ($InputRoot) { (Resolve-Path -LiteralPath $InputRoot -ErrorAction Stop).Path } else { Get-MonorepoRoot }
    $nested = Join-Path $base 'agency-os'
    if (Test-Path -LiteralPath (Join-Path $nested 'AGENTS.md')) {
        return (Resolve-Path -LiteralPath $nested).Path
    }
    return $base
}
