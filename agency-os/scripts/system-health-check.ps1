param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }

    # Monorepo guardrail: if invoked from D:\Work, force canonical agency root.
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\system-health-check.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }

    return $resolved
}

function Read-Json {
    param([string]$Path)
    return (Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json)
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$checks = @()
$criticalFailures = @()

function Add-Check {
    param([string]$Name, [bool]$Pass, [string]$Detail)
    $script:checks += [ordered]@{
        name = $Name
        pass = $Pass
        detail = $Detail
    }
}

function Add-CriticalFailure {
    param([string]$Reason)
    $script:criticalFailures += $Reason
}

function Contains-Mojibake {
    param([string]$Text)
    if (-not $Text) { return $false }
    if ($Text.Contains([string][char]0xFFFD)) { return $true }
    return $false
}

function Parse-TaskArgPath {
    param(
        [string]$Arguments,
        [string]$SwitchName
    )
    if (-not $Arguments) { return $null }
    $pattern = [regex]::Escape($SwitchName) + '\s+("(?<q>[^"]+)"|(?<u>\S+))'
    $m = [regex]::Match($Arguments, $pattern)
    if (-not $m.Success) { return $null }
    if ($m.Groups["q"].Success) { return $m.Groups["q"].Value }
    if ($m.Groups["u"].Success) { return $m.Groups["u"].Value }
    return $null
}

# 1) Core files
$coreFiles = @(
    "README.md",
    "AGENTS.md",
    "TASKS.md",
    "WORKLOG.md",
    "scripts/doc-sync-automation.ps1",
    "scripts/system-health-check.ps1",
    "scripts/system-guard.ps1",
    "scripts/build-product-bundle.ps1",
    "docs/CHANGE_IMPACT_MATRIX.md",
    "docs/change-impact-map.json",
    "automation/TENANT_AUTOMATION_RUNNER.ps1",
    "automation/REGISTER_TENANT_TASKS.ps1",
    "automation/ENQUEUE_TENANT_TASK.ps1",
    "automation/REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1"
)

foreach ($f in $coreFiles) {
    $ok = Test-Path (Join-Path $root $f)
    Add-Check -Name ("Core file exists: " + $f) -Pass $ok -Detail ($(if ($ok) { "OK" } else { "Missing" }))
}

# 1b) Critical script bodies (detect accidental wrapper-only overwrite)
$genPath = Join-Path $root "scripts\generate-integrated-status-report.ps1"
if (Test-Path $genPath) {
    $genRaw = Get-Content -LiteralPath $genPath -Raw -Encoding UTF8
    $isFullGenerator = ($genRaw.Length -ge 2500) -and ($genRaw -match "Get-UncheckedInSection")
    $isIntentionalWrapper = ($genRaw -match "Single-owner design") -and ($genRaw -match "owner script")
    $genOk = $isFullGenerator -or $isIntentionalWrapper
    $genDetail = if ($isFullGenerator) { "OK (full generator)" } elseif ($isIntentionalWrapper) { "OK (intentional wrapper)" } else { "Too small or missing expected symbols (wrapper overwrite?)" }
    Add-Check -Name "Script sanity: generate-integrated-status-report.ps1 (full/wrapper)" -Pass $genOk -Detail $genDetail
    if (-not $genOk) { Add-CriticalFailure -Reason "generate-integrated-status-report.ps1 failed sanity check" }
}
$wkPath = Join-Path $root "scripts\weekly-system-review.ps1"
if (Test-Path $wkPath) {
    $wkRaw = Get-Content -LiteralPath $wkPath -Raw -Encoding UTF8
    $wkOk = ($wkRaw.Length -ge 800) -and ($wkRaw -match "verify-build-gates")
    Add-Check -Name "Script sanity: weekly-system-review.ps1" -Pass $wkOk -Detail ($(if ($wkOk) { "OK" } else { "Unexpected content" }))
    if (-not $wkOk) { Add-CriticalFailure -Reason "weekly-system-review.ps1 failed sanity check" }
}

# 1c) Monorepo root `.cursor/rules` must mirror agency-os `00` + `30` + `40` (path-transformed) + `50-operator` + enterprise 63-66 (SHA256)
$monoRoot = Split-Path -Path $root -Parent
$syncVerifyScript = Join-Path $monoRoot "scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1"
if (Test-Path -LiteralPath $syncVerifyScript) {
    $prevOk = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncVerifyScript -MonorepoRoot $monoRoot -VerifyOnly 2>&1 | Out-Null
    $verExit = $LASTEXITCODE
    $ErrorActionPreference = $prevOk
    $verPass = ($verExit -eq 0)
    Add-Check -Name "Monorepo root mirrors agency-os rules 00 + 30 + 40 + 50 + 63-66 (SHA256 / transform)" -Pass $verPass -Detail $(if ($verPass) { "OK" } else { "Mismatch or missing - run scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1 or verify-build-gates" })
    if (-not $verPass) { Add-CriticalFailure -Reason "Cursor rules (00 / 30 / 40 / 50 / 63-66) differ between agency-os and monorepo root .cursor/rules" }
} else {
    Add-Check -Name "Monorepo root mirrors agency-os rules 00 + 30 + 40 + 50 + 63-66 (SHA256 / transform)" -Pass $true -Detail "Skipped: no sync script at monorepo scripts/"
}

# 2) Map consistency
$mapPath = Join-Path $root "docs/change-impact-map.json"
if (Test-Path $mapPath) {
    $map = Read-Json -Path $mapPath
    foreach ($r in $map.rules) {
        $sourcePath = Join-Path $root $r.source
        $sourceOk = Test-Path $sourcePath
        $sourceDetail = ($(if ($sourceOk) { "OK" } else { "Missing source" }))

        # Cross-machine compatibility: some systems keep Cursor rules at repo root (.cursor)
        # while this repo's scripts run with root=agency-os. If agency-os/.cursor is missing
        # (e.g. junction not recreated on a new computer), fallback to ../.cursor.
        if (-not $sourceOk -and $r.source -like ".cursor/*") {
            $fallbackRoot = Join-Path $root ".."
            $fallbackPath = Join-Path $fallbackRoot $r.source
            $sourceOk = Test-Path $fallbackPath
            if ($sourceOk) {
                $sourceDetail = "OK (fallback ../)"
            } else {
                $sourceDetail = "Missing source (no agency-os/.cursor or ../.cursor)"
            }
        }

        Add-Check -Name ("Map source exists: " + $r.source) -Pass $sourceOk -Detail $sourceDetail
        if (-not $sourceOk) { Add-CriticalFailure -Reason ("Missing map source: " + $r.source) }
        foreach ($t in $r.targets) {
            $targetOk = Test-Path (Join-Path $root $t)
            Add-Check -Name ("Map target exists: " + $r.source + " -> " + $t) -Pass $targetOk -Detail ($(if ($targetOk) { "OK" } else { "Missing target" }))
            if (-not $targetOk) { Add-CriticalFailure -Reason ("Missing map target: " + $r.source + " -> " + $t) }
        }
    }
} else {
    Add-Check -Name "Map consistency" -Pass $false -Detail "docs/change-impact-map.json missing"
    Add-CriticalFailure -Reason "Missing docs/change-impact-map.json"
}

# 2b) Markdown link + canonical doc integrity (lobster-factory script; Work layout)
# Resolve monorepo root: either $root is Work (contains lobster-factory/) or $root is agency-os (sibling ../lobster-factory).
$docRel = "lobster-factory\scripts\validate-doc-integrity.mjs"
$docIntegrityScriptA = Join-Path $root $docRel
$docIntegrityScriptB = Join-Path (Join-Path $root "..") $docRel
$workParent = $null
$docIntegrityScript = $null
if (Test-Path $docIntegrityScriptA) {
    $workParent = (Resolve-Path $root).Path
    $docIntegrityScript = (Resolve-Path $docIntegrityScriptA).Path
} elseif (Test-Path $docIntegrityScriptB) {
    $workParent = (Resolve-Path (Join-Path $root "..")).Path
    $docIntegrityScript = (Resolve-Path $docIntegrityScriptB).Path
}
if ($docIntegrityScript -and (Test-Path $docIntegrityScript)) {
    $hadWorkRoot = Test-Path env:LOBSTER_WORK_ROOT
    $prevWorkRoot = $env:LOBSTER_WORK_ROOT
    $env:LOBSTER_WORK_ROOT = $workParent
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & node $docIntegrityScript 2>&1
        $docExit = $LASTEXITCODE
        $detail = if ($out -is [System.Array]) { ($out | Out-String).Trim() } else { [string]$out }
        if ($docExit -eq 0) {
            Add-Check -Name "Doc integrity: validate-doc-integrity.mjs" -Pass $true -Detail $detail
        } else {
            Add-Check -Name "Doc integrity: validate-doc-integrity.mjs" -Pass $false -Detail $detail
            Add-CriticalFailure -Reason "Doc integrity failed (exit $docExit): lobster-factory/scripts/validate-doc-integrity.mjs"
        }
    } catch {
        Add-Check -Name "Doc integrity: validate-doc-integrity.mjs" -Pass $false -Detail $_.Exception.Message
        Add-CriticalFailure -Reason "Doc integrity threw: $($_.Exception.Message)"
    } finally {
        $ErrorActionPreference = $prevEap
        if ($hadWorkRoot) {
            $env:LOBSTER_WORK_ROOT = $prevWorkRoot
        } else {
            Remove-Item Env:\LOBSTER_WORK_ROOT -ErrorAction SilentlyContinue
        }
    }
} else {
    Add-Check -Name "Doc integrity: validate-doc-integrity.mjs" -Pass $true -Detail "Skipped (no lobster-factory at $docIntegrityScriptA or $docIntegrityScriptB)"
}

# 3) Tenant completeness
$tenantsRoot = Join-Path $root "tenants"
if (Test-Path $tenantsRoot) {
    $tenantDirs = Get-ChildItem -Path $tenantsRoot -Directory | Where-Object { $_.Name -like "company-*" }
    foreach ($tenant in $tenantDirs) {
        $required = @(
            "PROFILE.md",
            "SERVICE_CATALOG.md",
            "SITES_INDEX.md",
            "FINANCIAL_LEDGER.md",
            "ACCESS_REGISTER.md",
            "01_COMMANDER_SYSTEM_GUIDE.md",
            "02_CLIENT_WORKSPACE_GUIDE.md",
            "03_TOOLS_CONFIGURATION_GUIDE.md",
            "04_OPERATIONS_AUTOMATION_GUIDE.md",
            "OPERATIONS_SCHEDULE.json",
            "OPS_QUEUE.json"
        )
        foreach ($rf in $required) {
            $full = Join-Path $tenant.FullName $rf
            $ok = Test-Path $full
            Add-Check -Name ("Tenant file exists: " + $tenant.Name + "/" + $rf) -Pass $ok -Detail ($(if ($ok) { "OK" } else { "Missing" }))
            if (-not $ok) { Add-CriticalFailure -Reason ("Missing tenant required file: " + $tenant.Name + "/" + $rf) }
        }
    }
} else {
    Add-Check -Name "Tenants root exists" -Pass $false -Detail "tenants/ missing"
    Add-CriticalFailure -Reason "Missing tenants/ root"
}

# 4) Encoding spot check
$utf8Files = @(
    "docs/operations/system-operation-sop.md",
    "README.md",
    "AGENTS.md"
)
foreach ($uf in $utf8Files) {
    $full = Join-Path $root $uf
    if (Test-Path $full) {
        try {
            $null = Get-Content -Raw -Path $full -Encoding UTF8
            Add-Check -Name ("UTF8 readable: " + $uf) -Pass $true -Detail "OK"
        } catch {
            Add-Check -Name ("UTF8 readable: " + $uf) -Pass $false -Detail $_.Exception.Message
        }
    }
}

# 5) Mojibake scan in docs and key markdown files
$scanPaths = @(
    (Join-Path $root "docs"),
    (Join-Path $root "README.md"),
    (Join-Path $root "AGENTS.md")
)

foreach ($sp in $scanPaths) {
    if (-not (Test-Path $sp)) { continue }
    if ((Get-Item $sp).PSIsContainer) {
        $files = Get-ChildItem -Path $sp -Recurse -File -Filter "*.md"
        foreach ($f in $files) {
            $text = Get-Content -Raw -Encoding UTF8 -Path $f.FullName
            $bad = Contains-Mojibake -Text $text
            Add-Check -Name ("Mojibake scan: " + $f.FullName.Replace($root + "\", "")) -Pass (-not $bad) -Detail ($(if ($bad) { "Suspicious encoding artifacts found" } else { "OK" }))
        }
    } else {
        $text = Get-Content -Raw -Encoding UTF8 -Path $sp
        $bad = Contains-Mojibake -Text $text
        Add-Check -Name ("Mojibake scan: " + $sp.Replace($root + "\", "")) -Pass (-not $bad) -Detail ($(if ($bad) { "Suspicious encoding artifacts found" } else { "OK" }))
    }
}

# 6) Scheduled task command path checks
try {
    $tasks = Get-ScheduledTask -TaskName "AgencyOS-*" -ErrorAction Stop
    if ($null -eq $tasks -or @($tasks).Count -eq 0) {
        Add-Check -Name "AgencyOS scheduled tasks exist" -Pass $false -Detail "No AgencyOS-* tasks found"
    } else {
        Add-Check -Name "AgencyOS scheduled tasks exist" -Pass $true -Detail ("Found " + @($tasks).Count + " tasks")
        foreach ($task in @($tasks)) {
            foreach ($action in @($task.Actions)) {
                $args = $action.Arguments
                $filePath = Parse-TaskArgPath -Arguments $args -SwitchName "-File"
                if ($filePath) {
                    $fileOk = Test-Path $filePath
                    Add-Check -Name ("Task file path exists: " + $task.TaskName) -Pass $fileOk -Detail ($(if ($fileOk) { $filePath } else { "Missing file: " + $filePath }))
                } else {
                    Add-Check -Name ("Task file path parseable: " + $task.TaskName) -Pass $false -Detail "Could not parse -File argument"
                }

                $workspacePath = Parse-TaskArgPath -Arguments $args -SwitchName "-WorkspaceRoot"
                if ($workspacePath) {
                    $workspaceOk = Test-Path $workspacePath
                    Add-Check -Name ("Task workspace path exists: " + $task.TaskName) -Pass $workspaceOk -Detail ($(if ($workspaceOk) { $workspacePath } else { "Missing workspace: " + $workspacePath }))
                }
            }
        }
    }
} catch {
    Add-Check -Name "AgencyOS scheduled tasks inspectable" -Pass $false -Detail $_.Exception.Message
}

$total = $checks.Count
$passed = @($checks | Where-Object { $_.pass }).Count
$failed = $total - $passed
$score = if ($total -eq 0) { 0 } else { [Math]::Round(($passed * 100.0 / $total), 1) }

$reportDir = Join-Path $root "reports/health"
Ensure-Dir -Path $reportDir
$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$reportPath = Join-Path $reportDir ("health-" + $stamp + ".md")
$jsonPath = Join-Path $reportDir ("health-" + $stamp + ".json")

$lines = @()
$lines += "# System Health Report"
$lines += ""
$lines += "- Score: **" + $score + "%**"
$lines += "- Passed: " + $passed
$lines += "- Failed: " + $failed
$lines += "- Time: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$lines += ""
$lines += "## Critical Gate"
if ($criticalFailures.Count -eq 0) {
    $lines += "- Status: **PASS**"
} else {
    $lines += "- Status: **FAIL**"
    foreach ($item in ($criticalFailures | Sort-Object -Unique)) {
        $lines += "- " + $item
    }
}
$lines += ""
$lines += "## Failed Checks"
$failedItems = @($checks | Where-Object { -not $_.pass })
if ($failedItems.Count -eq 0) {
    $lines += "- None"
} else {
    foreach ($c in $failedItems) {
        $lines += "- " + $c.name + " | " + $c.detail
    }
}
$lines += ""
$lines += "## Summary"
$lines += "- Keep score at 100% for production-grade operations (aligns with AO-CLOSE default gate)."
$lines += "- Resolve failed checks before major delivery milestones."
$lines += "- Critical Gate must be PASS for release readiness."

Set-Content -Path $reportPath -Value ($lines -join "`r`n") -Encoding UTF8
Set-Content -Path $jsonPath -Value ($checks | ConvertTo-Json -Depth 8) -Encoding UTF8

Write-Output ("Health report: reports/health/" + [System.IO.Path]::GetFileName($reportPath))
Write-Output ("Score: " + $score + "% (" + $passed + "/" + $total + ")")

if ($criticalFailures.Count -gt 0) {
    Write-Error ("Critical gate failed: " + (($criticalFailures | Sort-Object -Unique) -join "; "))
    exit 2
}
