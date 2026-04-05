#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure every ADR markdown file under docs/architecture/decisions/ is mentioned in README.md (index table).
.NOTES
  Run from agency-os root: powershell -ExecutionPolicy Bypass -File .\scripts\verify-adr-index.ps1
#>
$ErrorActionPreference = "Stop"
$agencyRoot = Split-Path -Parent $PSScriptRoot
$decisionsDir = Join-Path $agencyRoot "docs\architecture\decisions"
$readmePath = Join-Path $decisionsDir "README.md"
if (-not (Test-Path -LiteralPath $readmePath)) {
  throw "verify-adr-index: missing $readmePath"
}
$readme = Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8
$adrFiles = Get-ChildItem -LiteralPath $decisionsDir -Filter "*.md" -File | Where-Object { $_.Name -ne "README.md" }
$missing = @()
foreach ($f in $adrFiles) {
  if ($readme -notmatch [regex]::Escape($f.Name)) {
    $missing += $f.Name
  }
}
if ($missing.Count -gt 0) {
  throw "verify-adr-index: ADR files not indexed in decisions/README.md: $($missing -join ', ')"
}
Write-Host "verify-adr-index: OK ($($adrFiles.Count) ADR file(s))" -ForegroundColor Green
exit 0
