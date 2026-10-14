# validate-memory-index.ps1
# Verifies that every link in MEMORY.md points to an existing file, and every
# *.md file in the memory directory (except MEMORY.md) has an entry in MEMORY.md.
#
# Exit 0 = clean.  Exit 1 = drift detected (ghost links or unindexed files).
#
# Called by system-health-check.ps1 (warn-only) and usable standalone:
#   powershell -ExecutionPolicy Bypass -File .\scripts\validate-memory-index.ps1

param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

if (-not $WorkRoot) {
    # scripts\ sits directly under the monorepo root (the only scripts tree).
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
if (-not $WorkRoot) {
    Write-Host "validate-memory-index: WorkRoot not resolved — skip." -ForegroundColor Yellow
    exit 0
}

# Derive the Claude Code project key the same way export/import scripts do.
# e.g. C:\Users\USER\Work -> c--Users-USER-Work
$projectKey = $WorkRoot.Substring(0, 1).ToLower() + ($WorkRoot.Substring(1) -replace ':', '-' -replace '[/\\]', '-')
$memDir    = Join-Path $env:USERPROFILE ".claude\projects\$projectKey\memory"
$indexFile = Join-Path $memDir "MEMORY.md"

if (-not (Test-Path -LiteralPath $indexFile)) {
    Write-Host "validate-memory-index: MEMORY.md not found at $indexFile — skip." -ForegroundColor DarkGray
    exit 0
}

$indexContent = Get-Content -LiteralPath $indexFile -Raw -Encoding UTF8

# Extract all (filename.md) hrefs from index lines of the form [text](file.md)
$linkedFiles = [System.Collections.Generic.List[string]]::new()
[regex]::Matches($indexContent, '\(([^)]+\.md)\)') | ForEach-Object {
    $name = $_.Groups[1].Value.Trim()
    if ($name -ne "MEMORY.md") { $linkedFiles.Add($name) | Out-Null }
}

# Scan actual *.md files present (excluding MEMORY.md itself)
$actualFiles = @(
    Get-ChildItem -Path $memDir -Filter "*.md" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne "MEMORY.md" } |
        Select-Object -ExpandProperty Name
)

$ghosts    = @($linkedFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $memDir $_)) })
$unindexed = @($actualFiles | Where-Object { $linkedFiles -notcontains $_ })
$drift     = ($ghosts.Count -gt 0) -or ($unindexed.Count -gt 0)

if (-not $drift) {
    Write-Host "memory-index: OK ($($actualFiles.Count) file(s) present, $($linkedFiles.Count) indexed)" -ForegroundColor Green
    exit 0
}

if ($ghosts.Count -gt 0) {
    Write-Host "memory-index: GHOST LINKS ($($ghosts.Count)) — in MEMORY.md index but file missing:" -ForegroundColor Yellow
    foreach ($g in $ghosts) { Write-Host "  - $g" -ForegroundColor Yellow }
}
if ($unindexed.Count -gt 0) {
    Write-Host "memory-index: UNINDEXED FILES ($($unindexed.Count)) — file exists but not in MEMORY.md:" -ForegroundColor Yellow
    foreach ($u in $unindexed) { Write-Host "  - $u" -ForegroundColor Yellow }
}
Write-Host "memory-index: Fix ghost links and/or add missing entries to: $indexFile" -ForegroundColor Yellow
exit 1
