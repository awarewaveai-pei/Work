#requires -Version 5.1
<#
.SYNOPSIS
    Monthly drift check across 4 long-term governance documents.

.DESCRIPTION
    Reads the four canonical governance documents and produces a monthly drift report:
      1. agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md  (Inventory)
      2. lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md                (Routing Spec)
      3. lobster-factory/docs/ROUTING_MATRIX.md                       (Routing Matrix)
      4. agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md     (Traceability)

    Checks (all informational; output is a snapshot, not a gate):
      - Existence of all 4 files
      - Cross-reference: each doc mentions the other 3 by filename
      - MCP server name set consistency (extracted from inventory + spec; symmetric difference)
      - File mtime drift: youngest vs oldest (flag if span > 90 days)
      - Last-synced footer presence (text marker `_Last synced` or `_最後更新` or similar)

    Output:
      reports/governance/drift-{YYYY-MM}.md          (committed; one per month)

    Designed for monthly invocation by AgencyOS-MonthlyReview routine, but also
    runnable manually anytime.

.PARAMETER WorkRoot
    Repo root. Default: parent of script directory.

.PARAMETER ReportMonth
    Override report month as YYYY-MM (default: current).

.PARAMETER Force
    Overwrite existing report for this month (default: skip if exists).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\check-governance-docs-drift.ps1
    # Generates reports/governance/drift-2026-05.md

.EXAMPLE
    .\scripts\check-governance-docs-drift.ps1 -ReportMonth 2026-04 -Force
    # Regenerate April report
#>
[CmdletBinding()]
param(
    [string]$WorkRoot = "",
    [string]$ReportMonth = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    if ($PSScriptRoot) {
        $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    } else {
        $WorkRoot = (Get-Location).Path
    }
}

if (-not $ReportMonth) { $ReportMonth = (Get-Date).ToString("yyyy-MM") }

$reportDir = Join-Path $WorkRoot "agency-os/reports/governance"
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
$reportPath = Join-Path $reportDir ("drift-" + $ReportMonth + ".md")

if ((Test-Path $reportPath) -and -not $Force) {
    Write-Host "Report for $ReportMonth already exists at $reportPath. Use -Force to overwrite." -ForegroundColor Yellow
    exit 0
}

$docs = [ordered]@{
    "Inventory"      = "agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md"
    "RoutingSpec"    = "lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md"
    "RoutingMatrix"  = "lobster-factory/docs/ROUTING_MATRIX.md"
    "Traceability"   = "agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md"
}

$findings = New-Object System.Collections.Generic.List[string]
$status = @{}

# ---------- Check 1: existence ----------
$missing = @()
foreach ($k in $docs.Keys) {
    $full = Join-Path $WorkRoot $docs[$k]
    if (-not (Test-Path $full)) { $missing += $docs[$k] }
}
$status["existence"] = if ($missing.Count -eq 0) { "PASS" } else { "FAIL" }
if ($missing.Count -gt 0) {
    $findings.Add("- existence FAIL: missing: " + ($missing -join "; ")) | Out-Null
}

# Bail if any missing — other checks need all 4.
if ($missing.Count -gt 0) {
    $lines = @(
        "# Governance Docs Drift — $ReportMonth"
        ""
        "- Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
        "- Status: **FAIL** (missing files; cannot continue)"
        ""
        "## Findings"
    ) + $findings
    Set-Content -LiteralPath $reportPath -Value ($lines -join "`n") -Encoding UTF8
    Write-Host "Drift report written: $reportPath" -ForegroundColor Red
    exit 1
}

# ---------- Check 2: cross-reference ----------
# Each doc should mention the other 3 by FILENAME (basename, e.g. "MCP_TOOL_ROUTING_SPEC.md").
$basenames = @{}
foreach ($k in $docs.Keys) {
    $basenames[$k] = [System.IO.Path]::GetFileName($docs[$k])
}

$crossRefMatrix = @{}
foreach ($k in $docs.Keys) {
    $full = Join-Path $WorkRoot $docs[$k]
    $content = Get-Content -LiteralPath $full -Raw -Encoding UTF8
    $crossRefMatrix[$k] = @{}
    foreach ($other in $docs.Keys) {
        if ($other -eq $k) { continue }
        $needle = $basenames[$other]
        $crossRefMatrix[$k][$other] = $content -match [regex]::Escape($needle)
    }
}

$crossRefMissing = @()
foreach ($from in $crossRefMatrix.Keys) {
    foreach ($to in $crossRefMatrix[$from].Keys) {
        if (-not $crossRefMatrix[$from][$to]) {
            $crossRefMissing += ("$from -> $to (no mention of `"" + $basenames[$to] + "`")")
        }
    }
}
$status["cross_reference"] = if ($crossRefMissing.Count -eq 0) { "PASS" } else { "WARN" }
if ($crossRefMissing.Count -gt 0) {
    $findings.Add("- cross_reference WARN: missing mentions:") | Out-Null
    foreach ($m in $crossRefMissing) { $findings.Add("  - $m") | Out-Null }
}

# ---------- Check 3: MCP server name set consistency ----------
# Extract MCP server names from Inventory and RoutingSpec (these two carry MCP rosters).
# Names appear in markdown table rows or backticked tokens. Use a permissive extraction:
# pattern = backticked single-word tokens that look like MCP names from registry.
function Extract-McpNames {
    param([string]$Path)
    $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    # Known canonical server names (kept narrow to avoid false positives from random backticks).
    $known = @(
        "n8n", "awarewave-ops", "supabase-awarewave-postgres", "cloudflare", "posthog",
        "github", "resend", "trigger", "wordpress", "airtable", "replicate",
        "server-ssh", "canva", "claude-fast", "claude-latest", "chatgpt-fast",
        "chatgpt-latest", "gemini-fast", "gemini-latest", "grok-fast", "grok-latest",
        "work-global"
    )
    $found = New-Object System.Collections.Generic.HashSet[string]
    foreach ($name in $known) {
        # Match `name`, "name" (with backtick or double-quote boundary). Boundary chars vary in zh-TW docs.
        if ($text -match ("``" + [regex]::Escape($name) + "``")) { [void]$found.Add($name) }
        elseif ($text -match ('\b' + [regex]::Escape($name) + '\b')) { [void]$found.Add($name) }
    }
    return $found
}

$inventoryMcps = Extract-McpNames -Path (Join-Path $WorkRoot $docs["Inventory"])
$specMcps = Extract-McpNames -Path (Join-Path $WorkRoot $docs["RoutingSpec"])

$onlyInInventory = @($inventoryMcps | Where-Object { -not $specMcps.Contains($_) })
$onlyInSpec = @($specMcps | Where-Object { -not $inventoryMcps.Contains($_) })
$intersection = @($inventoryMcps | Where-Object { $specMcps.Contains($_) })

$status["mcp_set_consistency"] = if ($onlyInInventory.Count -eq 0 -and $onlyInSpec.Count -eq 0) { "PASS" } else { "WARN" }
$findings.Add(("- mcp_set_consistency: shared=" + $intersection.Count + " ; only_in_inventory=" + $onlyInInventory.Count + " ; only_in_spec=" + $onlyInSpec.Count)) | Out-Null
if ($onlyInInventory.Count -gt 0) {
    $findings.Add("  - only in inventory: " + (($onlyInInventory | Sort-Object) -join ", ")) | Out-Null
}
if ($onlyInSpec.Count -gt 0) {
    $findings.Add("  - only in spec: " + (($onlyInSpec | Sort-Object) -join ", ")) | Out-Null
}

# ---------- Check 4: mtime drift ----------
$mtimes = @{}
foreach ($k in $docs.Keys) {
    $full = Join-Path $WorkRoot $docs[$k]
    $mtimes[$k] = (Get-Item -LiteralPath $full).LastWriteTimeUtc
}
$youngest = ($mtimes.Values | Measure-Object -Maximum).Maximum
$oldest = ($mtimes.Values | Measure-Object -Minimum).Minimum
$spanDays = [int]([TimeSpan]($youngest - $oldest)).TotalDays

$status["mtime_drift"] = if ($spanDays -le 90) { "PASS" } elseif ($spanDays -le 180) { "WARN" } else { "FAIL" }
$findings.Add("- mtime_drift: span=$spanDays days (youngest=$($youngest.ToString('yyyy-MM-dd')); oldest=$($oldest.ToString('yyyy-MM-dd')))") | Out-Null
foreach ($k in $docs.Keys) {
    $age = [int]([TimeSpan]([DateTime]::UtcNow - $mtimes[$k])).TotalDays
    $findings.Add(("  - " + $k + ": " + $mtimes[$k].ToString("yyyy-MM-dd") + " (age $age days)")) | Out-Null
}

# ---------- Check 5: last-synced footer presence ----------
$footerMissing = @()
foreach ($k in $docs.Keys) {
    $full = Join-Path $WorkRoot $docs[$k]
    $content = Get-Content -LiteralPath $full -Raw -Encoding UTF8
    # Use multiple narrow checks to avoid regex parsing issues with mixed-encoding markers.
    $hasFooter = $false
    $markers = @("_Last synced", "_Last updated", "_建立", "Last synced:")
    foreach ($m in $markers) {
        if ($content.IndexOf($m, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $hasFooter = $true
            break
        }
    }
    # Also check for zh-TW marker via byte sequence (not regex).
    if (-not $hasFooter) {
        # "最後更新" and "最近更新" — search as literal substrings
        $zhMarkers = @([char]0x6700 + [char]0x5f8c + [char]0x66f4 + [char]0x65b0,
                       [char]0x6700 + [char]0x8fd1 + [char]0x66f4 + [char]0x65b0)
        foreach ($zm in $zhMarkers) {
            if ($content.IndexOf($zm, [System.StringComparison]::Ordinal) -ge 0) {
                $hasFooter = $true
                break
            }
        }
    }
    if (-not $hasFooter) { $footerMissing += $k }
}
$status["footer_present"] = if ($footerMissing.Count -eq 0) { "PASS" } else { "WARN" }
if ($footerMissing.Count -gt 0) {
    $findings.Add("- footer_present WARN: docs without _Last synced / 最後更新 marker: " + ($footerMissing -join ", ")) | Out-Null
}

# ---------- Synthesis ----------
$worst = "PASS"
foreach ($v in $status.Values) {
    if ($v -eq "FAIL") { $worst = "FAIL"; break }
    if ($v -eq "WARN" -and $worst -ne "FAIL") { $worst = "WARN" }
}

$summary = @(
    "# Governance Docs Drift - $ReportMonth"
    ""
    "- Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    "- Overall: **$worst**"
    "- Scope: 4 long-term governance documents"
    ""
    "## Status by check"
    ""
    "| Check | Status |"
    "|-------|--------|"
)
foreach ($k in $status.Keys) {
    $summary += ("| " + $k + " | " + $status[$k] + " |")
}
$summary += ""
$summary += "## Documents"
$summary += ""
$summary += "| Doc | Path | Last modified (UTC) |"
$summary += "|-----|------|----------------------|"
foreach ($k in $docs.Keys) {
    $summary += ("| " + $k + " | " + $docs[$k] + " | " + $mtimes[$k].ToString("yyyy-MM-dd HH:mm") + " |")
}
$summary += ""
$summary += "## Findings"
$summary += ""
$summary += $findings
$summary += ""
$summary += "## Notes"
$summary += ""
$summary += "- This is an **informational snapshot**, not a build gate. WARN means the docs are out of lockstep but not necessarily broken; FAIL means a structural problem (missing file, span > 180 days)."
$summary += "- mcp_set_consistency uses a known-name allowlist; if a new MCP is added to registry, update the script."
$summary += "- Designed for monthly invocation by ``AgencyOS-MonthlyReview`` routine; also runnable manually."
$summary += "- Owner doc: this script. Trigger: ``scripts\check-governance-docs-drift.ps1``."

Set-Content -LiteralPath $reportPath -Value ($summary -join "`n") -Encoding UTF8

# Also write LATEST to reports/governance/ for archive access.
$latestPath = Join-Path $reportDir "drift-LATEST.md"
Set-Content -LiteralPath $latestPath -Value ($summary -join "`n") -Encoding UTF8

# Write LATEST to reports/status/ — canonical location for all LATEST files (same pattern as smoke/backup/auto-reboot).
$statusDir = Join-Path $WorkRoot "agency-os\reports\status"
$null = New-Item -ItemType Directory -Force -Path $statusDir
Set-Content -LiteralPath (Join-Path $statusDir "governance-drift-LATEST.md") -Value ($summary -join "`n") -Encoding UTF8

Write-Host "Drift report written: $reportPath" -ForegroundColor $(if ($worst -eq "PASS") { "Green" } elseif ($worst -eq "WARN") { "Yellow" } else { "Red" })
Write-Host "Overall: $worst"
foreach ($k in $status.Keys) {
    $color = if ($status[$k] -eq "PASS") { "Green" } elseif ($status[$k] -eq "WARN") { "Yellow" } else { "Red" }
    Write-Host ("  - " + $k + ": " + $status[$k]) -ForegroundColor $color
}

exit $(if ($worst -eq "FAIL") { 2 } elseif ($worst -eq "WARN") { 1 } else { 0 })
