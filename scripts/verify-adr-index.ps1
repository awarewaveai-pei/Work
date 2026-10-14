#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure every ADR markdown file under docs/architecture/decisions/ is mentioned in ADR_INDEX.md (index table).
.NOTES
  powershell -ExecutionPolicy Bypass -File scripts\verify-adr-index.ps1   (from the monorepo root)
#>
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')
$agencyRoot = Resolve-AgencyRoot
$decisionsDir = Join-Path $agencyRoot "docs\architecture\decisions"
$readmePath = Join-Path $decisionsDir "ADR_INDEX.md"
if (-not (Test-Path -LiteralPath $readmePath)) {
  throw "verify-adr-index: missing $readmePath"
}
$readme = Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8
$adrFiles = Get-ChildItem -LiteralPath $decisionsDir -Filter "*.md" -File | Where-Object { $_.Name -ne "ADR_INDEX.md" }
$missing = @()
foreach ($f in $adrFiles) {
  if ($readme -notmatch [regex]::Escape($f.Name)) {
    $missing += $f.Name
  }
}
if ($missing.Count -gt 0) {
  throw "verify-adr-index: ADR files not indexed in decisions/ADR_INDEX.md: $($missing -join ', ')"
}
Write-Host "verify-adr-index: OK ($($adrFiles.Count) ADR file(s))" -ForegroundColor Green
exit 0
