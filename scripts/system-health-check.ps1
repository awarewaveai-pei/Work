param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

function Read-Json {
    param([string]$Path)
    return (Get-Content -Raw -Path $Path -Encoding UTF8 | ConvertFrom-Json)
}

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
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
    "../scripts/doc-sync-automation.ps1",
    "../scripts/system-health-check.ps1",
    "../scripts/system-guard.ps1",
    "../scripts/build-product-bundle.ps1",
    "docs/CHANGE_IMPACT_MATRIX.md",
    "docs/change-impact-map.json"
)

foreach ($f in $coreFiles) {
    $ok = Test-Path (Join-Path $root $f)
    Add-Check -Name ("Core file exists: " + $f) -Pass $ok -Detail ($(if ($ok) { "OK" } else { "Missing" }))
}

# 1a) Long-term governance anchor (human charter + gate alignment; must not shrink to a stub)
$ltPath = Join-Path $root "docs\overview\LONG_TERM_OPERATING_DISCIPLINE.md"
if (Test-Path -LiteralPath $ltPath) {
    $ltRaw = Get-Content -LiteralPath $ltPath -Raw -Encoding UTF8
    # ASCII-only pattern: title uses CJK "30 + year-tier" (avoid non-UTF8-with-BOM script encoding issues on Windows PS 5.1)
    $ltOk = ($ltRaw.Length -ge 1800) -and ($ltRaw -match 'verify-build-gates') -and ($ltRaw -match '30\s*\u5E74\u7D1A')
    $ltDetail = if ($ltOk) { "OK (charter present)" } else { "Too small or missing expected anchors (gates / 30-year intent)" }
    Add-Check -Name "Governance anchor: docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md" -Pass $ltOk -Detail $ltDetail
    if (-not $ltOk) { Add-CriticalFailure -Reason "LONG_TERM_OPERATING_DISCIPLINE.md failed integrity anchor check" }
} else {
    Add-Check -Name "Governance anchor: docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md" -Pass $false -Detail "Missing"
    Add-CriticalFailure -Reason "Missing docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md"
}

# 1a2) One scripts tree. Every script lives in monorepo scripts\ (this file's folder). A parallel
# agency-os\scripts copy ran on schedule for months, rewrote AO files with CRLF+BOM and dropped
# content (WORKLOG 2026-10-14). Fail if the folder comes back, or if any script again reaches
# code through it -- that path is how callers ended up on the copy.
$parallelTree = Join-Path $root "scripts"
$parallelFiles = @(if (Test-Path -LiteralPath $parallelTree) { Get-ChildItem -LiteralPath $parallelTree -Recurse -File })
$parallelNeedle = 'agency-os' + '[\\/]+scripts\b'
$parallelRefs = @(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File -Include *.ps1, *.mjs, *.js, *.py, *.sh |
    Select-String -Pattern $parallelNeedle |
    Where-Object { $_.Line -notmatch '^\s*(#|//)' } |
    ForEach-Object { "{0}:{1}" -f $_.Path.Substring($PSScriptRoot.Length + 1), $_.LineNumber })
$singleTreeOk = ($parallelFiles.Count -eq 0) -and ($parallelRefs.Count -eq 0)
$singleTreeDetail = if ($singleTreeOk) { "OK (no scripts folder under agency-os; no script reaches code through one)" } else {
    "files in the agency-os scripts folder=$($parallelFiles.Count); code refs=$($parallelRefs.Count) $(($parallelRefs | Select-Object -First 5) -join ', ') -- move code to scripts/ and locate it from `$PSScriptRoot"
}
Add-Check -Name "Single scripts tree: no scripts folder under agency-os, no code path into one" -Pass $singleTreeOk -Detail $singleTreeDetail
if (-not $singleTreeOk) { Add-CriticalFailure -Reason "A parallel scripts tree under agency-os (or a code path into it) exists" }
# Same class for the automation tree: it lives in agency-os\automation (tenant data is under
# agency-os). A monorepo-root copy computed its root one level too high and half its scripts
# resolved to D:\ or D:\Work\tenants (removed 2026-10-14).
$rootAutomation = Join-Path (Split-Path -Path $root -Parent) "automation"   # follows -WorkspaceRoot
$rootAutomationFiles = @(if (Test-Path -LiteralPath $rootAutomation) { Get-ChildItem -LiteralPath $rootAutomation -Recurse -File })
$singleAutomationOk = ($rootAutomationFiles.Count -eq 0)
Add-Check -Name "Single automation tree: no automation folder at the monorepo root" -Pass $singleAutomationOk -Detail $(if ($singleAutomationOk) { "OK (agency-os/automation only)" } else { "monorepo-root automation files=$($rootAutomationFiles.Count) -- keep agency-os/automation only" })
if (-not $singleAutomationOk) { Add-CriticalFailure -Reason "A parallel automation tree exists at the monorepo root" }

# 1b) Critical script bodies (detect accidental wrapper-only overwrite)
$genPath = Join-Path $PSScriptRoot "generate-integrated-status-report.ps1"
if (Test-Path $genPath) {
    $genRaw = Get-Content -LiteralPath $genPath -Raw -Encoding UTF8
    $genOk = ($genRaw.Length -ge 2500) -and ($genRaw -match "Get-UncheckedInSection")
    $genDetail = if ($genOk) { "OK (full generator)" } else { "Too small or missing expected symbols (wrapper overwrite?)" }
    Add-Check -Name "Script sanity: generate-integrated-status-report.ps1 (full generator)" -Pass $genOk -Detail $genDetail
    if (-not $genOk) { Add-CriticalFailure -Reason "generate-integrated-status-report.ps1 failed sanity check" }
}
# weekly-system-review.ps1 retired 2026-05-30 (machine-local scheduled task → GitHub Actions
# weekly-workflows-security-audit.yml). build gates remain covered by verify-build-gates.ps1
# (run by ao-close / CI). See agency-os/reports/weekly/README.md.

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
    $workParent = (Resolve-Path -LiteralPath $root).Path
    $docIntegrityScript = (Resolve-Path -LiteralPath $docIntegrityScriptA).Path
} elseif (Test-Path $docIntegrityScriptB) {
    $workParent = (Resolve-Path -LiteralPath (Join-Path $root "..")).Path
    $docIntegrityScript = (Resolve-Path -LiteralPath $docIntegrityScriptB).Path
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
            "04_OPERATIONS_AUTOMATION_GUIDE.md"
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

# 3b) Tenant staging URL SSOT (SITES_INDEX vs ENVIRONMENT_REGISTRY)
$ssotGate = Join-Path $PSScriptRoot "verify-tenant-staging-sites-index-ssot.ps1"
if (Test-Path -LiteralPath $ssotGate) {
    $prevEapSsot = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $ssotOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $ssotGate -WorkspaceRoot $root *>&1 | Out-String
        $ssotExit = $LASTEXITCODE
        $ssotTrim = $ssotOutput.Trim()
        $ssotPass = ($ssotExit -eq 0)
        $ssotDetail = if ($ssotPass) {
            if ($ssotTrim.Length -gt 0) { $ssotTrim } else { "OK" }
        } else {
            $(if ($ssotTrim.Length -gt 0) { $ssotTrim } else { "FAIL (exit $ssotExit)" })
        }
        Add-Check -Name "Tenant SSOT: staging URLs (SITES_INDEX + SITE_PROFILE) vs ENVIRONMENT_REGISTRY" -Pass $ssotPass -Detail $ssotDetail
        if (-not $ssotPass) {
            Add-CriticalFailure -Reason "Tenant staging URL drift vs core/ENVIRONMENT_REGISTRY (run scripts/verify-tenant-staging-sites-index-ssot.ps1)"
        }
    } catch {
        Add-Check -Name "Tenant SSOT: SITES_INDEX staging URL vs ENVIRONMENT_REGISTRY" -Pass $false -Detail $_.Exception.Message
        Add-CriticalFailure -Reason "Tenant staging SSOT gate threw: $($_.Exception.Message)"
    } finally {
        $ErrorActionPreference = $prevEapSsot
    }
} else {
    Add-Check -Name "Tenant SSOT: staging URLs (SITES_INDEX + SITE_PROFILE) vs ENVIRONMENT_REGISTRY" -Pass $false -Detail "Missing script at scripts/verify-tenant-staging-sites-index-ssot.ps1"
    Add-CriticalFailure -Reason "Missing scripts/verify-tenant-staging-sites-index-ssot.ps1"
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
            $null = Get-Content -Raw -LiteralPath $full -Encoding UTF8
            Add-Check -Name ("UTF8 readable: " + $uf) -Pass $true -Detail "OK"
        } catch {
            Add-Check -Name ("UTF8 readable: " + $uf) -Pass $false -Detail $_.Exception.Message
        }
    }
}

# 5) Mojibake scan (single aggregated check — avoids hundreds of per-file rows and unstable score math)
$mojibakeFailures = New-Object "System.Collections.Generic.List[string]"
$mojibakeScanned = 0
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
            $mojibakeScanned++
            # -LiteralPath (not -Path): filenames with glob metachars like "[year]"
            # (RankMath KB import) make -Path resolve as a wildcard → the FileSystem-only
            # dynamic -Raw param won't bind → spurious NamedParameterNotFound (2026-06-14).
            $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName
            if (Contains-Mojibake -Text $text) {
                $rel = $f.FullName
                $rootNorm = [System.IO.Path]::GetFullPath($root)
                $fullNorm = [System.IO.Path]::GetFullPath($rel)
                if ($fullNorm.StartsWith($rootNorm, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $rel = $fullNorm.Substring($rootNorm.Length).TrimStart([char]'\', [char]'/')
                }
                $mojibakeFailures.Add($rel) | Out-Null
            }
        }
    } else {
        $mojibakeScanned++
        $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $sp
        if (Contains-Mojibake -Text $text) {
            $rel = [System.IO.Path]::GetFullPath($sp)
            $rootNorm = [System.IO.Path]::GetFullPath($root)
            if ($rel.StartsWith($rootNorm, [System.StringComparison]::OrdinalIgnoreCase)) {
                $rel = $rel.Substring($rootNorm.Length).TrimStart([char]'\', [char]'/')
            }
            $mojibakeFailures.Add($rel) | Out-Null
        }
    }
}
$mojPass = ($mojibakeFailures.Count -eq 0)
$mojDetail = if ($mojPass) {
    ("OK (" + $mojibakeScanned + " markdown file(s) scanned)")
} else {
    $show = @($mojibakeFailures | Select-Object -First 25)
    ("FAIL: " + $mojibakeFailures.Count + " file(s) — " + ($show -join "; "))
}
Add-Check -Name "Mojibake scan (docs + README + AGENTS)" -Pass $mojPass -Detail $mojDetail

# 6) Scheduled tasks (optional): laptops / CI without AgencyOS-* tasks must not fail health.
try {
    $tasks = Get-ScheduledTask -TaskName "AgencyOS-*" -ErrorAction Stop
    if ($null -eq $tasks -or @($tasks).Count -eq 0) {
        Add-Check -Name "AgencyOS scheduled tasks (optional)" -Pass $true -Detail "No AgencyOS-* tasks (skipped; not required for repo health)"
    } else {
        Add-Check -Name "AgencyOS scheduled tasks present" -Pass $true -Detail ("Found " + @($tasks).Count + " task(s); validating paths")
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
                # Launcher-wrapped tasks: -File is scheduled-task-launcher.ps1, the real script is -TargetScript.
                $targetPath = Parse-TaskArgPath -Arguments $args -SwitchName "-TargetScript"
                if ($targetPath) {
                    $targetOk = Test-Path -LiteralPath $targetPath
                    Add-Check -Name ("Task target script exists: " + $task.TaskName) -Pass $targetOk -Detail ($(if ($targetOk) { $targetPath } else { "Missing target script: " + $targetPath }))
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
    Add-Check -Name "AgencyOS scheduled tasks (optional)" -Pass $true -Detail ("Skipped (not available or not configured): " + $_.Exception.Message)
}

# 8) Critical vault keys + remote-API health (Kuma push monitor + PostgREST schema cache).
#    Runs LAST so a transient external-API hiccup at the very end does not block earlier
#    informational checks. All external-API failures are non-fatal (Pass=$true with
#    "Skipped: <reason>") to avoid breaking AO-CLOSE on transient network issues.
#    Only an *unambiguous* error (200 OK with monitor_status != 1, or 404 PGRST205)
#    fails the check.
$vaultHelper = Join-Path $PSScriptRoot "_vault-helpers.ps1"
if (Test-Path $vaultHelper) {
    try {
        . $vaultHelper
        $store = Read-VaultStore (Resolve-VaultPath)

        # --- 8a) Critical vault keys present ---
        # Closes the "vault wipe / new-machine bootstrap forgets to import" failure mode.
        $criticalKeys = @(
            'KUMA_HEARTBEAT_SG_ENDPOINT_ALERT',
            'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET',
            'TELEGRAM_ALLOWED_USER_IDS', 'TELEGRAM_ALLOWED_CHAT_IDS',
            'COMMAND_PLANE_DEFAULT_ORG_ID', 'ANTHROPIC_API_KEY',
            'SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY', 'SUPABASE_AWAREWAVE_URL',
            'AGENCY_OS_SLACK_WEBHOOK_URL', 'UPTIME_KUMA_BASE_URL', 'UPTIME_KUMA_API_KEY',
            'SENTRY_AUTH_TOKEN'
        )
        $missing = @()
        foreach ($k in $criticalKeys) {
            if (-not (Test-VaultSecret -Store $store -Name $k)) { $missing += $k }
        }
        if ($missing.Count -eq 0) {
            Add-Check -Name "Vault: critical keys present" -Pass $true -Detail ("OK (" + $criticalKeys.Count + " keys verified)")
        } else {
            Add-Check -Name "Vault: critical keys present" -Pass $false -Detail ("Missing " + $missing.Count + ": " + ($missing -join ', '))
        }

        # --- 8b) Uptime Kuma push monitor for endpoint-alert healthy ---
        # Detects "alerter timer stopped" before Slack/Sentry can.
        try {
            $kumaBase = Get-VaultSecret -Store $store -Name 'UPTIME_KUMA_BASE_URL' -AllowMissing
            $kumaKey  = Get-VaultSecret -Store $store -Name 'UPTIME_KUMA_API_KEY'  -AllowMissing
            if ($kumaBase -and $kumaKey) {
                $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(':' + $kumaKey))
                $resp = Invoke-WebRequest -Uri ($kumaBase.TrimEnd('/') + '/metrics') -Headers @{ Authorization = $auth } -UseBasicParsing -TimeoutSec 10
                $line = ($resp.Content -split "`n") | Where-Object { $_ -match 'monitor_status\{[^\}]*monitor_name="AwareWave endpoint-alert \(KS-6\)"' } | Select-Object -First 1
                if (-not $line) {
                    Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor present" -Pass $false -Detail "Monitor not found in Kuma /metrics — was it deleted?"
                } elseif ($line -match '\}\s+(\d+)\s*$') {
                    $val = [int]$matches[1]
                    $statusName = switch ($val) { 0 {'DOWN'} 1 {'UP'} 2 {'PENDING'} 3 {'MAINTENANCE'} default {"UNKNOWN($val)"} }
                    if ($val -eq 1) {
                        Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor healthy" -Pass $true -Detail "UP"
                    } else {
                        Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor healthy" -Pass $false -Detail ("Status=" + $statusName + " — ks-aw-01 endpoint-alert.timer may have stopped")
                    }
                } else {
                    Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor healthy" -Pass $true -Detail "Skipped: could not parse monitor_status value"
                }
            } else {
                Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor healthy" -Pass $true -Detail "Skipped: UPTIME_KUMA_BASE_URL or UPTIME_KUMA_API_KEY missing"
            }
        } catch {
            Add-Check -Name "Kuma: AwareWave endpoint-alert (KS-6) push monitor healthy" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(100, $_.Exception.Message.Length)))
        }

        # --- 8c) PostgREST schema cache freshness for Phase 2 tables ---
        # Detects the "migration applied but PostgREST never NOTIFY'd" trap.
        try {
            $supaUrl = Get-VaultSecret -Store $store -Name 'SUPABASE_AWAREWAVE_URL'                 -AllowMissing
            $supaKey = Get-VaultSecret -Store $store -Name 'SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY' -AllowMissing
            if ($supaUrl -and $supaKey) {
                $endpoint = $supaUrl.TrimEnd('/') + '/rest/v1/command_requests?select=id&limit=1'
                try {
                    $r = Invoke-WebRequest -Uri $endpoint -Headers @{ apikey = $supaKey; Authorization = "Bearer $supaKey" } -UseBasicParsing -TimeoutSec 10
                    if ($r.StatusCode -eq 200) {
                        Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $true -Detail "200 OK"
                    } else {
                        Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $false -Detail ("HTTP " + $r.StatusCode)
                    }
                } catch [System.Net.WebException] {
                    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
                    if ($code -eq 404) {
                        Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $false -Detail "HTTP 404 PGRST205 — schema cache stale; run: docker exec supabase-db psql -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema';\" on EU"
                    } else {
                        Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $true -Detail ("Skipped: HTTP " + $code + " (transient or auth)")
                    }
                }
            } else {
                Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $true -Detail "Skipped: SUPABASE_AWAREWAVE_URL or service role key missing"
            }
        } catch {
            Add-Check -Name "PostgREST: public.command_requests reachable" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(100, $_.Exception.Message.Length)))
        }
    } catch {
        Add-Check -Name "Section 8 runtime checks" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(100, $_.Exception.Message.Length)))
    }
} else {
    Add-Check -Name "Section 8 runtime checks" -Pass $true -Detail "Skipped: scripts/_vault-helpers.ps1 not present"
}

# 7) Deploy drift (informational): SG production vs origin/main.
# The health script canonicalizes $root to agency-os, while these probes live under the
# monorepo-level scripts directory. Resolve them from $monoRoot so they cannot silently
# degrade into the "not present" skip branch.
$driftScript = Join-Path $monoRoot "scripts/check-deploy-drift.ps1"
if (Test-Path $driftScript) {
    try {
        $driftJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $driftScript -AppCodeOnly -SkipFetch -Json 2>&1 | Out-String
        $driftExit = $LASTEXITCODE
        $driftObj = $null
        try { $driftObj = $driftJson | ConvertFrom-Json -ErrorAction Stop } catch { $driftObj = $null }
        if ($driftObj -and $driftObj.status -eq "PASS") {
            Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail ("PASS at " + $driftObj.deployedCommit.Substring(0, [Math]::Min(7, $driftObj.deployedCommit.Length)))
        } elseif ($driftObj -and $driftObj.status -eq "WARN") {
            # composeVarDrift (2026-09-20) can be the ONLY reason for WARN (behind=0, commit fully
            # deployed, but docker-compose.yml itself was never applied -- sg-deploy.sh does not sync
            # that file). Branching so this check never tells an operator to run the one command that
            # cannot fix a compose-only drift.
            if ($driftObj.composeVarDrift -and $driftObj.behind -eq 0) {
                Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail ("WARN: docker-compose.yml differs from production (server-only: " + @($driftObj.composeVarDrift.onlyOnServer).Count + "; repo-only: " + @($driftObj.composeVarDrift.onlyInRepo).Count + "); fix via safe-infra-patch.sh compose, NOT sg-deploy.sh")
            } else {
                Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail ("WARN: " + $driftObj.behind + " app-code commit(s) behind origin/main; run /root/lobster-phase1/scripts/sg-deploy.sh on SG when ready")
            }
        } elseif ($driftObj -and $driftObj.status -eq "FAIL") {
            Add-Check -Name "Deploy drift (SG next-admin)" -Pass $false -Detail ("FAIL: " + $driftObj.behind + " app-code commit(s) behind origin/main (>= " + $driftObj.failAt + "); run sg-deploy.sh now")
        } else {
            Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail ("Skipped (probe error, exit " + $driftExit + ")")
        }
    } catch {
        Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail ("Skipped: " + $_.Exception.Message)
    }
} else {
    Add-Check -Name "Deploy drift (SG next-admin)" -Pass $true -Detail "Skipped: scripts/check-deploy-drift.ps1 not present"
}

# 7b) CP950 parse-break gate (HARD). A BOM-less non-ASCII .ps1 that fails to parse under code
# page 950 cannot run at all on a zh-TW PowerShell 5.1 host (root cause: playwright-runner.ps1 +
# generate-customer-delivery-status.ps1, both 2026-05-30). The broader capture-trap audit stays
# informational/on-demand (large accepted backlog); only this catastrophic class blocks AO-CLOSE.
# SSOT: scripts/audit-cp950-traps.ps1 -ParseBreakOnly.
$cp950Gate = Join-Path $monoRoot "scripts/audit-cp950-traps.ps1"
if (Test-Path $cp950Gate) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $cp950Gate -ParseBreakOnly -Quiet 2>&1 | Out-Null
        $cp950Exit = $LASTEXITCODE
        $cp950Pass = ($cp950Exit -eq 0)
        Add-Check -Name "PowerShell scripts parse under CP950 (no BOM-less non-ASCII parse-breaks)" -Pass $cp950Pass -Detail $(if ($cp950Pass) { "OK (all .ps1 parse on Big5 PS 5.1)" } else { "FAIL: >=1 .ps1 cannot parse under CP950 - run scripts/audit-cp950-traps.ps1 -ParseBreakOnly; fix = ASCII-ify or add UTF-8 BOM" })
        if (-not $cp950Pass) { Add-CriticalFailure -Reason "A repo .ps1 fails to parse under CP950 (cannot run on zh-TW PS 5.1) - see audit-cp950-traps.ps1 -ParseBreakOnly" }
    } catch {
        # Hard gate must fail CLOSED when its own tool crashes -- a silent skip here would give
        # false confidence that CP950 parse-breaks were checked when they weren't (codex-oracle
        # review 2026-08-29 FINDING 2).
        Add-Check -Name "PowerShell scripts parse under CP950 (no BOM-less non-ASCII parse-breaks)" -Pass $false -Detail ("CRASHED (treated as FAIL for a hard gate): " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
        Add-CriticalFailure -Reason "audit-cp950-traps.ps1 -ParseBreakOnly crashed instead of returning a verdict - a hard gate cannot silently pass when its own tool is broken"
    }
} else {
    Add-Check -Name "PowerShell scripts parse under CP950 (no BOM-less non-ASCII parse-breaks)" -Pass $false -Detail "MISSING: scripts/audit-cp950-traps.ps1 not found - hard gate cannot verify without its tool"
    Add-CriticalFailure -Reason "audit-cp950-traps.ps1 not found - the CP950 parse-break hard gate cannot run"
}

# 7c) CP950 unencoded-raw-read gate (HARD). `Get-Content -Raw` without `-Encoding` silently
# mis-decodes CJK data files under CP950, and for unmappable byte sequences the loss is
# IRREVERSIBLE (root cause: codex-oracle.ps1, 2026-08-29, 29 corrupted artifacts, commit
# fe87cf05). Distinct class from 7b: this is a data-file read, not a script self-parse — the
# script still runs, it just corrupts what it reads, silently. Sibling gate, same severity
# tier: both classes started this check at 0 backlog, so both can be hard from day one.
# SSOT: scripts/audit-cp950-traps.ps1 -RawReadOnly.
$rawReadGate = Join-Path $monoRoot "scripts/audit-cp950-traps.ps1"
if (Test-Path $rawReadGate) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $rawReadGate -RawReadOnly -Quiet 2>&1 | Out-Null
        $rawReadExit = $LASTEXITCODE
        $rawReadPass = ($rawReadExit -eq 0)
        Add-Check -Name "PowerShell Get-Content -Raw reads specify -Encoding (no CP950 data corruption)" -Pass $rawReadPass -Detail $(if ($rawReadPass) { "OK (all -Raw reads specify -Encoding)" } else { "FAIL: >=1 Get-Content -Raw without -Encoding - run scripts/audit-cp950-traps.ps1 -RawReadOnly; fix = add -Encoding UTF8" })
        if (-not $rawReadPass) { Add-CriticalFailure -Reason "A repo .ps1 has Get-Content -Raw without -Encoding (CP950 data corruption risk) - see audit-cp950-traps.ps1 -RawReadOnly" }
    } catch {
        # Hard gate must fail CLOSED when its own tool crashes -- see 7b's identical fix
        # (codex-oracle review 2026-08-29 FINDING 2, which flagged both siblings).
        Add-Check -Name "PowerShell Get-Content -Raw reads specify -Encoding (no CP950 data corruption)" -Pass $false -Detail ("CRASHED (treated as FAIL for a hard gate): " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
        Add-CriticalFailure -Reason "audit-cp950-traps.ps1 -RawReadOnly crashed instead of returning a verdict - a hard gate cannot silently pass when its own tool is broken"
    }
} else {
    Add-Check -Name "PowerShell Get-Content -Raw reads specify -Encoding (no CP950 data corruption)" -Pass $false -Detail "MISSING: scripts/audit-cp950-traps.ps1 not found - hard gate cannot verify without its tool"
    Add-CriticalFailure -Reason "audit-cp950-traps.ps1 not found - the CP950 unencoded-raw-read hard gate cannot run"
}

# 7d) Repo-hygiene case-collision gate (HARD). Two git-tracked paths (or a tracked
# file vs. a tracked directory ancestor) whose lowercased form is identical will
# silently merge into one on any case-insensitive filesystem (Windows, default
# macOS) even though git's case-sensitive index sees them as distinct -- root
# cause: `Projects/internal/hci30` (index) vs `Projects/internal/HCI30/` (disk)
# drift, discovered 2026-09-05 while closing out agency-os/TASKS.md:822. Only
# this class is a hard gate; the sibling oversized-file class stays informational
# (legitimate hits are expected, not a defect -- see AUDIT_REGISTRY.md).
# Dogfooded clean (0/4715 tracked paths) AND critic-reviewed against 3 reproduced
# false-positive/false-negative fixtures (CP950 mojibake, unmerged index,
# directory-level collision) before being wired here -- see
# AUDIT_REGISTRY.md "Repo-hygiene audit" section for the full review.
# SSOT: scripts/audit-repo-hygiene.ps1 -CaseCollisionOnly.
# NOTE: always pass -CaseCollisionOnly here -- omitting it would let the
# informational oversized-file class (16 known hits) silently fail this hard
# gate too (critic review 2026-09-05, s3).
$repoHygieneGate = Join-Path $monoRoot "scripts/audit-repo-hygiene.ps1"
if (Test-Path $repoHygieneGate) {
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $repoHygieneGate -CaseCollisionOnly -Quiet -WorkRoot $monoRoot 2>&1 | Out-Null
        $repoHygieneExit = $LASTEXITCODE
        $repoHygienePass = ($repoHygieneExit -eq 0)
        Add-Check -Name "No case-insensitive path collisions (git index vs. case-insensitive filesystem)" -Pass $repoHygienePass -Detail $(if ($repoHygienePass) { "OK (no colliding tracked paths)" } else { "FAIL: exit $repoHygieneExit - run scripts/audit-repo-hygiene.ps1 -CaseCollisionOnly to see the finding(s) or the reason (e.g. unresolved merge); fix = git mv the loser onto the canonical casing" })
        if (-not $repoHygienePass) { Add-CriticalFailure -Reason "audit-repo-hygiene.ps1 -CaseCollisionOnly found a case-collision (or could not determine one, e.g. mid-merge) - see scripts/audit-repo-hygiene.ps1 -CaseCollisionOnly" }
    } catch {
        # Hard gate must fail CLOSED when its own tool crashes -- same principle as
        # the CP950 gates above (codex-oracle review 2026-08-29 FINDING 2).
        Add-Check -Name "No case-insensitive path collisions (git index vs. case-insensitive filesystem)" -Pass $false -Detail ("CRASHED (treated as FAIL for a hard gate): " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
        Add-CriticalFailure -Reason "audit-repo-hygiene.ps1 -CaseCollisionOnly crashed instead of returning a verdict - a hard gate cannot silently pass when its own tool is broken"
    }
} else {
    Add-Check -Name "No case-insensitive path collisions (git index vs. case-insensitive filesystem)" -Pass $false -Detail "MISSING: scripts/audit-repo-hygiene.ps1 not found - hard gate cannot verify without its tool"
    Add-CriticalFailure -Reason "audit-repo-hygiene.ps1 not found - the case-collision hard gate cannot run"
}

# 7e) Released-address repo gate (warn-only for now; not yet a hard gate — see note).
# Invariant: no live config may trust or target an address AwareWave no longer owns.
# Origin: 2026-09-23, found live on ks-aw-01 while investigating an unrelated Auto-Repair SSH
# task — a Cloudflare whitelist rule and fail2ban ignoreip both still trusted a released EU VPS
# IP that had since been reassigned to a third party. Registry SSOT: agency-os/config/released-addresses.json.
# Warn-only deliberately: unlike 7d's case-collision class (dogfooded + critic-reviewed against
# reproduced fixtures before being hardened), this checker is new this session — promote to a
# hard gate only after an oracle/critic review pass, per the 7d precedent.
$releasedAddrScript = Join-Path $monoRoot "scripts\verify-no-released-addresses.mjs"
if (Test-Path -LiteralPath $releasedAddrScript) {
    try {
        # EAP=Continue around the node call (same as check 10 below): under Stop, a line on stderr
        # (exit 2 = broken registry) throws before $LASTEXITCODE is read and reads as "Skipped".
        $prevEapRa = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $raOut = & node $releasedAddrScript 2>&1 | Out-String
        $raExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEapRa
        $raSummary = ($raOut -split "`r?`n" | Where-Object { $_ -match '^RESULT:' } | Select-Object -First 1)
        if (-not $raSummary) { $raSummary = "no RESULT line in output" }
        if ($raExit -eq 0) {
            Add-Check -Name "No live trust/target of released addresses (verify-no-released-addresses.mjs)" -Pass $true -Detail $raSummary.Trim()
        } else {
            Add-Check -Name "No live trust/target of released addresses (verify-no-released-addresses.mjs)" -Pass $true -Detail ("WARN: " + $raSummary.Trim() + ' - run node scripts/verify-no-released-addresses.mjs for file:line detail')
        }
    } catch {
        Add-Check -Name "No live trust/target of released addresses (verify-no-released-addresses.mjs)" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
    }
} else {
    Add-Check -Name "No live trust/target of released addresses (verify-no-released-addresses.mjs)" -Pass $true -Detail "Skipped: scripts/verify-no-released-addresses.mjs not present"
}
# 8b) Same registry, this machine's ssh aliases: an alias hides the address from the repo gate
# (2026-09-24: aliases for the released SG/EU addresses were still the default target of 7 scripts).
# Warn-only, same promotion rule as 8).
if (Test-Path -LiteralPath $releasedAddrScript) {
    try {
        $prevEapSc = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $scOut = & node $releasedAddrScript --ssh-config 2>&1 | Out-String
        $scExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEapSc
        $scSummary = ($scOut -split "`r?`n" | Where-Object { $_ -match '^RESULT:' } | Select-Object -First 1)
        if (-not $scSummary) { $scSummary = "no RESULT line in output" }
        $scDetail = if ($scExit -eq 0) { $scSummary.Trim() } else { "WARN: " + $scSummary.Trim() + ' - run node scripts/verify-no-released-addresses.mjs --ssh-config for the alias list' }
        Add-Check -Name "No ssh alias resolves to a released address (verify-no-released-addresses.mjs --ssh-config)" -Pass $true -Detail $scDetail
    } catch {
        Add-Check -Name "No ssh alias resolves to a released address (verify-no-released-addresses.mjs --ssh-config)" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
    }
}

# 9) Cloudflare security posture (warn-only informational check).
# The probe is also owned by the monorepo-level scripts directory. Pass the monorepo root
# to its -WorkRoot parameter so its report and vault-helper paths resolve consistently.
$cfScript = Join-Path $monoRoot "scripts/check-cloudflare-security.ps1"
if (Test-Path $cfScript) {
    try {
        $cfOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $cfScript -WorkRoot $monoRoot 2>&1 | Out-String
        if ($cfOut -match "PASS") {
            $detail = ($cfOut -split "`n" | Where-Object { $_ -match "bot=" } | Select-Object -First 1).Trim()
            Add-Check -Name "Cloudflare security (bot+WAF)" -Pass $true -Detail $detail
        } elseif ($cfOut -match "SKIP") {
            Add-Check -Name "Cloudflare security (bot+WAF)" -Pass $true -Detail "Skipped: no API token"
        } else {
            $detail = ($cfOut -split "`n" | Where-Object { $_ -match "bot=" } | Select-Object -First 1).Trim()
            Add-Check -Name "Cloudflare security (bot+WAF)" -Pass $true -Detail "WARN: $detail (see reports/status/cf-security-LATEST.md)"
        }
    } catch {
        Add-Check -Name "Cloudflare security (bot+WAF)" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
    }
} else {
    Add-Check -Name "Cloudflare security (bot+WAF)" -Pass $true -Detail "Skipped: check-cloudflare-security.ps1 not present"
}

# 10) Memory index integrity (warn-only).
# Checks that every MEMORY.md link resolves to a real file, and no file is unindexed.
# Pass=$true even on drift so this never blocks AO-CLOSE — agent fixes at session start.
$memValidateScript = Join-Path $monoRoot "scripts\validate-memory-index.ps1"
if (Test-Path -LiteralPath $memValidateScript) {
    try {
        $prevEapMem = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $memOut  = & powershell -NoProfile -ExecutionPolicy Bypass -File $memValidateScript -WorkRoot $monoRoot *>&1 | Out-String
        $memExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEapMem
        $memTrim = $memOut.Trim() -replace "`r?`n", "; "
        if ($memExit -eq 0) {
            Add-Check -Name "Memory index integrity (MEMORY.md vs actual files)" -Pass $true -Detail $memTrim
        } else {
            Add-Check -Name "Memory index integrity (MEMORY.md vs actual files)" -Pass $true -Detail ("WARN: " + $memTrim)
        }
    } catch {
        Add-Check -Name "Memory index integrity (MEMORY.md vs actual files)" -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
    }
} else {
    Add-Check -Name "Memory index integrity (MEMORY.md vs actual files)" -Pass $true -Detail "Skipped: scripts/validate-memory-index.ps1 not present"
}

# 11) Claude routine output freshness watchdog (warn-only).
# Catches the "monitoring system stopped monitoring itself" failure mode.
# Pass=$true even on stale so AO-CLOSE doesn't block — surfaces as visible WARN in report.
# Source-of-truth for what each routine writes: agency-os/automation/claude-routines/*.md
$routineOutputs = @(
    @{
        Name        = "Phase 4 weekly report freshness"
        Path        = (Join-Path $monoRoot "agency-os\reports\repair-center\phase4-LATEST.md")
        MaxAgeDays  = 8
        Routine     = "AgencyOS-RepairCenterPhase4Weekly"
        Hint        = "https://claude.ai/code/routines"
    },
    # 2026-06-06: extended to Weekly + Monthly outputs. Root cause that motivated this:
    # all 3 routines' cloud `sources` had drifted to a now-deleted public repo, so their
    # reports silently stopped landing in awarewaveai-pei/Work — yet only Phase 4 was
    # watched here. A stale weekly/monthly LATEST now surfaces the same class of failure
    # (routine disabled / wrong source / GitHub auth lapsed / crashed) at the next health gate.
    @{
        Name        = "Weekly review report freshness"
        Path        = (Join-Path $monoRoot "agency-os\reports\weekly\weekly-automation-LATEST.md")
        MaxAgeDays  = 9   # cron: Monday (every 7d) + 2d grace
        Routine     = "AgencyOS-WeeklyReview"
        Hint        = "https://claude.ai/code/routines"
    },
    @{
        Name        = "Monthly review report freshness"
        Path        = (Join-Path $monoRoot "agency-os\reports\monthly\monthly-review-LATEST.md")
        MaxAgeDays  = 35  # cron: 1st of month (~28-31d) + grace
        Routine     = "AgencyOS-MonthlyReview"
        Hint        = "https://claude.ai/code/routines"
    }
)
# Layout guard: skip §11 entirely if $monoRoot doesn't actually contain agency-os/.
# Prevents misleading "routine missing" WARN when the real fault is path drift.
$agencyDir = Join-Path $monoRoot "agency-os"
if (-not (Test-Path -LiteralPath $agencyDir)) {
    foreach ($r in $routineOutputs) {
        Add-Check -Name $r.Name -Pass $true -Detail ("Skipped: monoRoot layout drift — '" + $agencyDir + "' missing; cannot resolve routine output paths")
    }
} else {
    foreach ($r in $routineOutputs) {
        if (Test-Path -LiteralPath $r.Path) {
            try {
                $mtime = (Get-Item -LiteralPath $r.Path).LastWriteTime
                # [Math]::Floor (not [int]) — [int] uses banker's rounding which fires alerts
                # ~12h late. Clamp to 0 to avoid nonsense "-1d old" on future-dated mtime
                # (git checkout / clock skew).
                $ageDaysRaw = [Math]::Floor(((Get-Date) - $mtime).TotalDays)
                $ageDays = [Math]::Max(0, $ageDaysRaw)
                if ($ageDays -gt $r.MaxAgeDays) {
                    Add-Check -Name $r.Name -Pass $true -Detail ("WARN: " + $ageDays + "d old (max " + $r.MaxAgeDays + "d) — routine " + $r.Routine + " may have stopped firing; check " + $r.Hint)
                } else {
                    Add-Check -Name $r.Name -Pass $true -Detail ($ageDays.ToString() + "d old (routine " + $r.Routine + ")")
                }
            } catch {
                Add-Check -Name $r.Name -Pass $true -Detail ("Skipped: " + $_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))
            }
        } else {
            Add-Check -Name $r.Name -Pass $true -Detail ("WARN: report file missing — routine " + $r.Routine + " never ran or path wrong; check " + $r.Hint)
        }
    }
}

# 12) Claude Code cross-machine sync drift (HARD failures block AO-CLOSE; SOFT surfaces as WARN).
# Single source of truth: scripts/check-claude-sync.ps1 — see that script's header for severity model.
# Why HARD blocks: a broken junction or missing tracked file means commands/agents/skills
# silently diverge between machines; better to catch at gate than discover mid-session.
$syncCheckScript = Join-Path $monoRoot "scripts\check-claude-sync.ps1"
if (Test-Path -LiteralPath $syncCheckScript) {
    try {
        # CP950 trap: nested powershell.exe inherits parent console OutputEncoding.
        # Force UTF-8 inside child so JSON paths / Chinese filenames aren't mangled.
        $syncCmd = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); & '$syncCheckScript' -Quiet"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $syncCmd 2>&1 | Out-Null
        $syncExit = $LASTEXITCODE
        $syncJsonPath = Join-Path $monoRoot "agency-os\.agency-state\sync-check-last.json"
        $syncDetail = "exit=$syncExit"
        if (Test-Path -LiteralPath $syncJsonPath) {
            # Retry-on-IOException: writer uses atomic rename so this should be one-shot,
            # but if another process holds the file briefly, retry 3x with 100ms backoff.
            $syncJson = $null
            for ($i = 0; $i -lt 3; $i++) {
                try {
                    $syncJson = Get-Content -LiteralPath $syncJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
                    break
                } catch {
                    if ($i -lt 2) { Start-Sleep -Milliseconds 100 } else { throw }
                }
            }
            if ($syncJson) {
                $worst = $syncJson.worstSeverity
                $hardFails = @($syncJson.findings | Where-Object { $_.severity -eq 'hard' })
                $softFails = @($syncJson.findings | Where-Object { $_.severity -eq 'soft' })
                $syncDetail = "worst=$worst, hard=$($hardFails.Count), soft=$($softFails.Count)"
            }
        }
        switch ($syncExit) {
            0 { Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $true -Detail ("PASS: " + $syncDetail) }
            1 { Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $false -Detail ("HARD FAIL: " + $syncDetail + " - run /sync-check for fix commands"); Add-CriticalFailure -Reason "Claude Code sync infrastructure broken (see /sync-check)" }
            2 { Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $true -Detail ("WARN (soft): " + $syncDetail + " - uncommitted local files under .claude/{commands,agents,skills}") }
            3 { Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $true -Detail "Skipped: Claude Code not installed" }
            default { Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $false -Detail "Unexpected exit code $syncExit"; Add-CriticalFailure -Reason "check-claude-sync.ps1 returned unexpected exit $syncExit" }
        }
    } catch {
        # Crash != graceful skip. A HARD gate component that crashes silently masks
        # real drift; flip to Pass=false + Add-CriticalFailure so AO-CLOSE catches it.
        $msg = $_.Exception.Message
        $excerpt = $msg.Substring(0, [Math]::Min(120, $msg.Length))
        Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $false -Detail ("Invocation crashed: " + $excerpt)
        Add-CriticalFailure -Reason ("check-claude-sync.ps1 invocation failed: " + $excerpt)
    }
} else {
    Add-Check -Name "Claude Code cross-machine sync (check-claude-sync.ps1)" -Pass $true -Detail "Skipped: scripts/check-claude-sync.ps1 not present"
}

# 12b) .claude junction integrity (self-heal candidate).
# Rationale: existing check-claude-sync H1 has historically returned PASS even when
# d:\Work\.claude was a real folder instead of a junction (observed 2026-05-28). This
# stronger gate uses fsutil reparsepoint to verify the junction's reparse data and
# resolves the target path, catching silent drift the legacy H1 misses.
# Self-heal is intentionally NOT performed here — health checks must be read-only.
# Repair runs in the AO-RESUME UserPromptSubmit hook (mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1).
$ensureJunctionScript = Join-Path $monoRoot "scripts\ensure-claude-junction.ps1"
if (Test-Path -LiteralPath $ensureJunctionScript) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureJunctionScript -DryRun -EmitState 2>&1 | Out-Null
        $junctionExit = $LASTEXITCODE
        $junctionJsonPath = Join-Path $monoRoot "agency-os\.agency-state\junction-last.json"
        $junctionDetail = "exit=$junctionExit"
        if (Test-Path -LiteralPath $junctionJsonPath) {
            try {
                $junctionJson = Get-Content -LiteralPath $junctionJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $junctionDetail = "verdict=$($junctionJson.verdict), target=$($junctionJson.targetPath)"
            } catch {
                # state file unreadable — fall back to exit code only
            }
        }
        switch ($junctionExit) {
            0 { Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $true -Detail ("PASS: " + $junctionDetail) }
            1 { Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $false -Detail ("FAIL: " + $junctionDetail + " - target ~/.claude missing or junction unrepairable; run scripts/ensure-claude-junction.ps1 manually"); Add-CriticalFailure -Reason "Claude junction broken: $junctionDetail" }
            2 { Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $false -Detail ("FAIL: " + $junctionDetail + " - junction drift detected; will be repaired on next AO-RESUME hook fire, but content backup needs review"); Add-CriticalFailure -Reason "Claude junction drift requires content review: $junctionDetail" }
            default { Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $false -Detail "Unexpected exit code $junctionExit"; Add-CriticalFailure -Reason "ensure-claude-junction.ps1 returned unexpected exit $junctionExit" }
        }
    } catch {
        $msg = $_.Exception.Message
        $excerpt = $msg.Substring(0, [Math]::Min(120, $msg.Length))
        Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $false -Detail ("Invocation crashed: " + $excerpt)
        Add-CriticalFailure -Reason ("ensure-claude-junction.ps1 invocation failed: " + $excerpt)
    }
} else {
    Add-Check -Name ".claude junction (ensure-claude-junction.ps1 dry-run)" -Pass $true -Detail "Skipped: scripts/ensure-claude-junction.ps1 not present"
}

# 12c) AO-CLOSE archive 未完成/明日優先 items lifted to TASKS.md.
# Phase Z6 (2026-05-28) — prevents the silent-drop class observed when the
# 5/28 18:46 AO-CLOSE archive's "SG deploy 落後 3 commits" item lived only in
# the archive and was invisible to the next AO-RESUME. SSOT: every pending
# item must be in TASKS.md OR explicitly annotated `<!-- archive-only: ... -->`.
$archiveLiftScript = Join-Path $monoRoot "scripts\verify-archive-tasks-lift.ps1"
if (Test-Path -LiteralPath $archiveLiftScript) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $archiveLiftScript -EmitState 2>&1 | Out-Null
        $liftExit = $LASTEXITCODE
        $liftJsonPath = Join-Path $monoRoot "agency-os\.agency-state\archive-lift-last.json"
        $liftDetail = "exit=$liftExit"
        if (Test-Path -LiteralPath $liftJsonPath) {
            try {
                $liftJson = Get-Content -LiteralPath $liftJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $liftDetail = "verdict=$($liftJson.verdict), bullets=$($liftJson.bullets), lifted=$($liftJson.lifted), missing=$($liftJson.missing), archive-only=$($liftJson.archiveOnly)"
            } catch {
                # state file unreadable — fall back to exit code only
            }
        }
        switch ($liftExit) {
            0 { Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $true -Detail ("PASS: " + $liftDetail) }
            1 { Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $false -Detail ("FAIL: " + $liftDetail + " - archive has 未完成/明日優先 items missing from TASKS.md `- [ ]`; add them OR mark each archive-only bullet with HTML comment '<!-- archive-only: <reason> -->'"); Add-CriticalFailure -Reason "AO-CLOSE archive items not lifted to TASKS.md (see archive-lift-last.json)" }
            2 { Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $true -Detail ("Skipped: " + $liftDetail + " - no archive yet (fresh repo)") }
            default { Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $false -Detail "Unexpected exit code $liftExit"; Add-CriticalFailure -Reason "verify-archive-tasks-lift.ps1 returned unexpected exit $liftExit" }
        }
    } catch {
        $msg = $_.Exception.Message
        $excerpt = $msg.Substring(0, [Math]::Min(120, $msg.Length))
        Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $false -Detail ("Invocation crashed: " + $excerpt)
        Add-CriticalFailure -Reason ("verify-archive-tasks-lift.ps1 invocation failed: " + $excerpt)
    }
} else {
    Add-Check -Name "AO-CLOSE archive items lifted to TASKS.md (verify-archive-tasks-lift.ps1)" -Pass $true -Detail "Skipped: scripts/verify-archive-tasks-lift.ps1 not present"
}

# 12d) AO-RESUME archive written after most recent ao-resume stamp.
# Phase Z8 (2026-06-01) — prevents the "forgot Step 3" class where Claude outputs the
# 7-segment report but never writes agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md.
# Root cause: text-only instructions are insufficient; mechanical gate required.
$aoResumeArchiveScript = Join-Path $monoRoot "scripts\verify-aoresume-archive.ps1"
if (Test-Path -LiteralPath $aoResumeArchiveScript) {
    try {
        $archiveOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $aoResumeArchiveScript -WorkRoot $monoRoot 2>&1
        $archiveExit = $LASTEXITCODE
        $archiveDetail = ($archiveOutput | Out-String).Trim()
        switch ($archiveExit) {
            0 { Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $true -Detail $archiveDetail }
            1 { Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $false -Detail $archiveDetail
                Add-CriticalFailure -Reason "AO-RESUME Step 3 archive missing — write 7-segment report to agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md" }
            2 { Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $true -Detail "Skipped: $archiveDetail" }
            default { Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $false -Detail "Unexpected exit ${archiveExit}: $archiveDetail"
                Add-CriticalFailure -Reason "verify-aoresume-archive.ps1 returned unexpected exit $archiveExit" }
        }
    } catch {
        $msg = $_.Exception.Message
        $excerpt = $msg.Substring(0, [Math]::Min(120, $msg.Length))
        Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $false -Detail ("Invocation crashed: " + $excerpt)
        Add-CriticalFailure -Reason ("verify-aoresume-archive.ps1 invocation failed: " + $excerpt)
    }
} else {
    Add-Check -Name "AO-RESUME archive written (verify-aoresume-archive.ps1)" -Pass $true -Detail "Skipped: scripts/verify-aoresume-archive.ps1 not present"
}

# 12e) Git fetch ledger recency.
# Phase Z5 (2026-06-12) consumes the Phase Z git-fetch-last.json ledger written by
# git-align-main-aoresume-feature.ps1. The health score may be relaxed by
# ao-close.ps1 -AllowNonPerfectHealth, but criticalFailures still block publish,
# so >30d stale or unreadable ledger cannot be bypassed by score relaxation.
$fetchLedgerPath = Join-Path $monoRoot "agency-os\.agency-state\git-fetch-last.json"
$fetchCheckName = "Git fetch ledger recency (git-fetch-last.json)"
$fetchGateLib = Join-Path $monoRoot "scripts\lib\fetch-recency-gate.ps1"
if (Test-Path -LiteralPath $fetchGateLib) {
    . (Resolve-Path -LiteralPath $fetchGateLib).Path
    $fetchGate = Test-GitFetchLedgerRecency -LedgerPath $fetchLedgerPath
    Add-Check -Name $fetchCheckName -Pass ([bool]$fetchGate.pass) -Detail ([string]$fetchGate.detail)
    if ($fetchGate.critical) {
        Add-CriticalFailure -Reason ([string]$fetchGate.reason)
    }
} else {
    Add-Check -Name $fetchCheckName -Pass $false -Detail "FAIL: missing scripts/lib/fetch-recency-gate.ps1"
    Add-CriticalFailure -Reason "Missing fetch-recency gate helper scripts/lib/fetch-recency-gate.ps1"
}

# 12f) AO pipeline files stay LF in the working tree (.gitattributes eol=lf). The AO-CLOSE/scaffold writers
# joined with [Environment]::NewLine (CRLF on Windows) and left WORKLOG/TASKS/memory mixed, which breaks
# byte/regex anchors in tools reading the worktree. Writers now go through scripts/lib/repo-text.ps1;
# this check names any file a writer turns CRLF again (2026-10-03).
$eolCheckName = "AO pipeline files LF in worktree (WORKLOG, TASKS, memory)"
try {
    $eolOut = @(& git -C $monoRoot ls-files --eol -- "agency-os/WORKLOG.md" "agency-os/TASKS.md" "agency-os/memory" 2>$null)
    $eolExit = $LASTEXITCODE
    $eolBad = @($eolOut | Where-Object { $_ -match '\sw/(crlf|mixed)\s' } | ForEach-Object { ($_ -split "`t", 2)[1] })
    if ($eolExit -ne 0 -or $eolOut.Count -eq 0) {
        Add-Check -Name $eolCheckName -Pass $false -Detail ("FAIL: git ls-files --eol exit=" + $eolExit + ", " + $eolOut.Count + " lines -- nothing was checked")
    } elseif ($eolBad.Count -eq 0) {
        Add-Check -Name $eolCheckName -Pass $true -Detail ("PASS: " + @($eolOut).Count + " tracked files, all LF")
    } else {
        $eolShow = ($eolBad | Select-Object -First 5) -join ", "
        Add-Check -Name $eolCheckName -Pass $false -Detail ("FAIL: " + $eolBad.Count + " file(s) CRLF/mixed: " + $eolShow + " - find the writer (use Write-RepoTextFile), then rewrite the file with LF")
    }
} catch {
    Add-Check -Name $eolCheckName -Pass $false -Detail ("FAIL: git ls-files --eol crashed: " + $_.Exception.Message)
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
$summary = [ordered]@{
    schemaVersion     = 1
    generatedAtUtc    = (Get-Date).ToUniversalTime().ToString("o")
    score             = $score
    passed            = $passed
    failed            = $failed
    total             = $total
    critical_gate     = if ($criticalFailures.Count -eq 0) { "PASS" } else { "FAIL" }
    critical_failures = @($criticalFailures | Sort-Object -Unique)
    checks            = $checks
}
Set-Content -Path $jsonPath -Value ($summary | ConvertTo-Json -Depth 12) -Encoding UTF8

Write-Output ("Health report: reports/health/" + [System.IO.Path]::GetFileName($reportPath))
Write-Output ("Score: " + $score + "% (" + $passed + "/" + $total + ")")

if ($criticalFailures.Count -gt 0) {
    Write-Error ("Critical gate failed: " + (($criticalFailures | Sort-Object -Unique) -join "; "))
    exit 2
}
exit 0
