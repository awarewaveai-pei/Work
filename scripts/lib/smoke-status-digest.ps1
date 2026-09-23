# Shared reader for agency-os/reports/status/*-LATEST.{json,md}.
# Dot-source from check-smoke-tests.ps1: . (Join-Path $PSScriptRoot "lib\smoke-status-digest.ps1")
#
# WHY THIS EXISTS (WORKLOG 2026-09-23): ten warn-only "sibling" detectors
# (check-ci-health.ps1, the nightly system-guard health gate, check-backup-health.ps1,
# check-vps-auto-reboot-health.ps1, check-clickhouse-health.ps1, check-capacity-health.ps1,
# check-site-watch-health.ps1, check-staging-orphans.ps1, check-routine-freshness.ps1,
# check-cloudflare-security.ps1) each write their own report every AO-RESUME (or, for the
# nightly gate, once a day on its own scheduled task) -- but AO-RESUME's SSOT
# (.claude/commands/ao-resume.md) never reads most of them. A red workflow or a failed
# nightly doc-integrity gate can sit there for weeks with no mechanism putting it in front
# of the agent; the only two that DID get read (smoke, monthly) worked because they already
# had a machine field (overall / blind_spots) an agent could read verbatim. This module
# gives every sibling detector the same machine field, funnelled into ONE array
# (smoke-LATEST.json "blockers") that ao-resume.md reads once instead of remembering ten
# separate prose rules.
#
# Contract: Get-StatusDigest returns an ordered hashtable with two NEW smoke check verdicts
# (ci_health, nightly_health -- these had ZERO prior AO-RESUME wiring) plus a flat
# "blockers" array of human-readable lines pulled from ALL TEN sources. Three invariants,
# each closing a critic finding from the first version of this file (2026-09-23 round 1,
# 0 Critical / 4 Major -- M1-M4 below):
#   1. A report missing, unreadable, OR STALE (older than its own source's MaxAgeHours) is
#      BLIND, never a silently-reused old PASS (M1). Every source's own timestamp field is
#      read and checked -- a producer that crashed before writing leaves yesterday's PASS on
#      disk, and disk age (mtime) is untrustworthy on a git-tracked file (see the
#      staging-orphans mtime bug this same WORKLOG entry fixes in ao-resume.ps1).
#   2. Every non-PASS/non-SKIP verdict is GUARANTEED at least one blocker line (M2) --
#      New-DigestEntry synthesizes a "(producer gave no detail)" fallback rather than
#      letting an empty blockers array silently drop the source from smoke's overall
#      computation (which only reacts to blockers.Count, not to individual verdicts).
#   3. One source's parser throwing (missing field, bad JSON, unexpected type under
#      Set-StrictMode) can NEVER take down the other nine (M3) -- each Get-*Entry call is
#      wrapped in its own try/catch in Get-StatusDigest.
# A 4th invariant (M4): a parser that cannot make sense of its input must return BLIND, not
# default to PASS. The first version's routine-freshness parser read "PASS" from the ABSENCE
# of a WARN line, which means garbage input (a truncated file, a schema change) also read
# PASS -- exactly the failure mode this whole file exists to close.
#
# INVARIANT (codex round 2, 2026-09-23): PASS / WARN / FAIL are emitted ONLY for a producer value
# this file explicitly maps (Get-VerdictOrBlind); any unmapped value, missing producer key, stale
# or unparsable timestamp, or parser exception is BLIND. No switch falls back to WARN anywhere.
#
# SKIP (a documented quiet state, e.g. Cloudflare token not configured, site-watch
# NOT_DEPLOYED) does not add a blocker line and is excluded from "non-PASS/non-SKIP" above.
# Each blocker line is prefixed "[VERDICT] Label: detail" so severity survives being read
# out of context (critic m2) -- FAIL/BLIND next to a long-lived WARN must not look the same.

Set-StrictMode -Version Latest

function Get-JsonReportSafe {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        if (-not $raw -or -not $raw.Trim()) { return $null }
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        return $null
    }
}

function Get-TextReportSafe {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        if (-not $raw) { return $null }
        return $raw
    } catch {
        return $null
    }
}

# ISO-8601 with an explicit offset/Z (the "o" shape every JSON producer here uses for
# generatedAtUtc/generatedAt). Returns $null (never throws) on anything unparsable -- a
# malformed timestamp must read as "no evidence of freshness", not crash the caller.
function ConvertFrom-IsoUtcSafe {
    param([string]$Text)
    if (-not $Text) { return $null }
    try {
        $dt = [DateTime]::Parse([string]$Text, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
        return $dt.ToUniversalTime()
    } catch { return $null }
}

# check-vps-auto-reboot-health.ps1 writes generated_utc as "yyyy-MM-dd HH:mm:ss" with NO
# zone suffix (it is already UTC by construction -- see that script's own $genUtc). Parsing
# it with the generic ISO parser above would apply LOCAL-zone assumptions and silently shift
# the timestamp by the machine's UTC offset.
function ConvertFrom-UnzonedUtcSafe {
    param([string]$Text)
    if (-not $Text) { return $null }
    try {
        # AssumeUniversal alone hands back a LOCAL-kind DateTime (converted to local time); the age
        # maths then went negative by the machine offset and auto-reboot read BLIND on every real run
        # (2026-09-23). AdjustToUniversal keeps the result in UTC, like the other two parsers.
        $styles = [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal
        return [DateTime]::ParseExact([string]$Text, "yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture, $styles)
    } catch { return $null }
}

# The two MD-only reports (routine-freshness, cf-security) stamp local wall-clock time with
# no zone info at all ("- generated: yyyy-MM-dd HH:mm (local)"). AssumeLocal + ToUniversalTime
# converts using THIS machine's current offset, which is correct for same-machine freshness
# checks (the only use here) even though it would be wrong across machines/DST boundaries.
function ConvertFrom-LocalNoZoneSafe {
    param([string]$Text, [string]$Format)
    if (-not $Text) { return $null }
    try {
        $dt = [DateTime]::ParseExact([string]$Text, $Format, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal)
        return $dt.ToUniversalTime()
    } catch { return $null }
}

# Fail-closed freshness test (critic M1). A future-dated timestamp (clock skew, or a
# mis-parsed zone) is exactly as untrustworthy as a stale one -- both read "not fresh"
# rather than the age going negative and silently passing an upper-bound-only check.
function Test-TimestampFresh {
    param([Nullable[DateTime]]$UtcTimestamp, [double]$MaxAgeHours)
    if ($null -eq $UtcTimestamp) { return $false }
    # PS 5.1 unwraps a [Nullable[DateTime]] parameter to a plain [DateTime], so .Value does not exist
    # under Set-StrictMode (every parser threw here on the first real run, 2026-09-23).
    $ageHours = ([DateTime]::UtcNow - [DateTime]$UtcTimestamp).TotalHours
    if ($ageHours -lt 0) { return $false }
    return ($ageHours -le $MaxAgeHours)
}

# Structural sanity (codex 2026-09-23 F3): every producer always writes certain keys; a JSON that
# parses but lacks one (truncated write, schema change, a hand-made stub) proves nothing and must
# read BLIND rather than letting `overall: PASS` alone pass. Returns $null when the shape is fine.
function Test-ReportShape {
    param([Parameter(Mandatory = $true)]$Json, [Parameter(Mandatory = $true)][string[]]$RequiredKeys, [Parameter(Mandatory = $true)][string]$Label, [string]$FileName)
    $missing = @($RequiredKeys | Where-Object { -not $Json.PSObject.Properties[$_] })
    if ($missing.Count -eq 0) { return $null }
    return New-DigestEntry -Verdict "BLIND" -Label $Label -RawLines @(("{0} lacks producer key(s) {1} -- not a complete report (schema change or truncated write)" -f $FileName, ($missing -join ', ')))
}

# Map a producer's own label to a digest verdict; anything unmapped is BLIND with a line naming the
# value (a renamed state after a producer schema change must not read as a plain WARN, let alone PASS).
function Get-VerdictOrBlind {
    param([string]$Value, [Parameter(Mandatory = $true)][hashtable]$Map, [Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][string]$Field, [string]$FileName)
    if ($Map.ContainsKey($Value)) { return [ordered]@{ verdict = $Map[$Value]; blind = $null } }
    $entry = New-DigestEntry -Verdict "BLIND" -Label $Label -RawLines @(("{0} has {1}='{2}' which this parser does not recognise (expects {3})" -f $FileName, $Field, $Value, (($Map.Keys | Sort-Object) -join '|')))
    return [ordered]@{ verdict = "BLIND"; blind = $entry }
}

# Single choke point for every entry this module returns (critic M2). Guarantees:
#   - verdict is always one of PASS/WARN/FAIL/BLIND/SKIP (caller's responsibility to pass a
#     valid one; this function does not itself validate the set, callers use the fixed
#     literals below)
#   - every line is prefixed "[VERDICT] Label: detail" (critic m2 -- severity must survive
#     being read out of context)
#   - a non-PASS/non-SKIP verdict with zero real detail lines gets a synthesized fallback
#     line instead of silently vanishing from blockers[] (this was the actual M2 bug: an
#     empty array bound to [string[]] becomes $null, and $null.Count under StrictMode can
#     throw or, worse, silently read as 0 depending on call site -- capping/filtering here
#     means every downstream consumer sees a real string array, never $null)
function New-DigestEntry {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'WARN', 'FAIL', 'BLIND', 'SKIP')][string]$Verdict,
        [Parameter(Mandatory = $true)][string]$Label,
        [string[]]$RawLines = @(),
        [int]$Cap = 5
    )
    $clean = @($RawLines | Where-Object { $_ -and "$_".Trim() })
    if ($Verdict -ne 'PASS' -and $Verdict -ne 'SKIP' -and $clean.Count -eq 0) {
        $clean = @("$Verdict (producer gave no detail)")
    }
    $capped = @($clean | Select-Object -First $Cap)
    $more = $clean.Count - $capped.Count
    $prefixed = New-Object System.Collections.Generic.List[string]
    foreach ($line in $capped) { $prefixed.Add(("[{0}] {1}: {2}" -f $Verdict, $Label, $line)) }
    if ($more -gt 0) { $prefixed.Add(("[{0}] {1}: (+{2} more, see the full report)" -f $Verdict, $Label, $more)) }
    $blockersOut = if ($Verdict -eq 'PASS' -or $Verdict -eq 'SKIP') { @() } else { @($prefixed) }
    return [ordered]@{ verdict = $Verdict; blockers = [string[]]$blockersOut }
}

# --- 1. CI health (GitHub Actions) ---
function Get-CiHealthEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $path = Join-Path $StatusDir "ci-LATEST.json"
    $j = Get-JsonReportSafe -Path $path
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "CI" -RawLines @("ci-LATEST.json missing or unreadable -- CI state unknown") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generatedAtUtc', 'verdictLabel', 'probeOk', 'findings', 'workflows') -Label "CI" -FileName "ci-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAtUtc)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        $ageNote = if ($ts) { ("{0:N1}h old" -f ([DateTime]::UtcNow - $ts).TotalHours) } else { "no valid generatedAtUtc" }
        return New-DigestEntry -Verdict "BLIND" -Label "CI" -RawLines @(("ci-LATEST.json is stale ({0}, max {1}h) -- check-ci-health.ps1 may not be running" -f $ageNote, $MaxAgeHours))
    }

    # Top-level probe failure (gh workflow list itself failed / truncated). probeOk is read by
    # VALUE, not truthiness: the string "false" is truthy in PowerShell (codex r3 F2), so anything
    # that is not literally boolean/string true reads as a failed probe.
    $probeRaw = $j.probeOk
    $probeOk = ($probeRaw -is [bool] -and $probeRaw) -or ([string]$probeRaw -eq 'True')
    if (-not $probeOk) {
        return New-DigestEntry -Verdict "BLIND" -Label "CI" -RawLines @($j.findings)
    }

    $findings = @($j.findings)
    # Per-workflow blindness (critic m6): check-ci-health.ps1 can fail to read ONE
    # workflow's runs (gh run list error) while leaving probeOk=true and verdictLabel=FAIL
    # for other, genuinely-red workflows in the same report. Any "BLIND SPOT:" finding
    # means at least part of this report has no evidence, which outranks a plain FAIL --
    # the reader must not mistake "some of this is unmeasured" for "all of this is measured
    # and red".
    $hasBlindFinding = @($findings | Where-Object { "$_" -match '^BLIND SPOT' }).Count -gt 0
    if ($hasBlindFinding) {
        return New-DigestEntry -Verdict "BLIND" -Label "CI" -RawLines $findings
    }

    $vr = Get-VerdictOrBlind -Value ([string]$j.verdictLabel) -Map @{ PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL" } -Label "CI" -Field "verdictLabel" -FileName "ci-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    $lines = if ($verdict -eq "PASS") { @() } else { $findings }
    return New-DigestEntry -Verdict $verdict -Label "CI" -RawLines $lines
}

# --- 2. Nightly system-guard health gate (reports/health/health-*.json, dated, gitignored) ---
function Get-NightlyHealthEntry {
    param([string]$WorkRoot, [double]$MaxAgeHours = 30)
    # system-health-check.ps1's own Resolve-WorkspaceRoot canonicalizes D:\Work to
    # D:\Work\agency-os (the monorepo guardrail: it re-roots to agency-os whenever
    # agency-os\scripts\system-health-check.ps1 exists there), so the nightly gate's
    # reports land at agency-os\reports\health, not <WorkRoot>\reports\health. $WorkRoot
    # here is D:\Work (matching every other Get-*Entry in this file), so the agency-os
    # segment must be added explicitly -- verified against a real run 2026-09-23.
    $healthDir = Join-Path $WorkRoot "agency-os\reports\health"
    if (-not (Test-Path -LiteralPath $healthDir)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @("no agency-os/reports/health/ directory -- nightly health gate has never run on this machine")
    }
    $latest = Get-ChildItem -LiteralPath $healthDir -Filter "health-*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -eq $latest) {
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @("no health-*.json found under agency-os/reports/health/ -- nightly gate has never run")
    }
    $j = Get-JsonReportSafe -Path $latest.FullName
    if ($null -eq $j) {
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @(("{0} exists but is unreadable/malformed" -f $latest.Name))
    }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAtUtc)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        $ageNote = if ($ts) { ("{0:N1}h old" -f ([DateTime]::UtcNow - $ts).TotalHours) } else { "no valid generatedAtUtc" }
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @(("{0} is stale ({1}, max {2}h) -- AgencyOS-SystemGuard-Daily may not be running" -f $latest.Name, $ageNote, $MaxAgeHours))
    }

    # critic M4: a schema this parser cannot recognise (schemaVersion missing/unexpected,
    # or either field absent) must read BLIND, not fall through to "score=-1 < 100 = WARN"
    # or, worse, an unset $criticalGate comparing false to "FAIL" and reading PASS.
    $schemaOk = $j.PSObject.Properties["schemaVersion"] -and ([double]$j.schemaVersion -ge 1)
    $hasGate  = [bool]$j.PSObject.Properties["critical_gate"]
    $hasScore = [bool]$j.PSObject.Properties["score"]
    if (-not ($schemaOk -and $hasGate -and $hasScore)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @(("{0} does not match the expected schema (schemaVersion/critical_gate/score) -- update this parser alongside any schema change in system-health-check.ps1" -f $latest.Name))
    }

    $criticalGate = [string]$j.critical_gate
    $score = [double]$j.score
    if ($criticalGate -ne "PASS" -and $criticalGate -ne "FAIL") {
        # codex F2: an unrecognised gate value (a renamed state, a stub) must not fall through to PASS
        return New-DigestEntry -Verdict "BLIND" -Label "Nightly health" -RawLines @(("{0} has critical_gate='{1}' which this parser does not recognise (expects PASS|FAIL)" -f $latest.Name, $criticalGate))
    }
    if ($criticalGate -eq "FAIL") {
        $lines = @($j.critical_failures)
        if ($lines.Count -eq 0) { $lines = @("critical_gate=FAIL (no critical_failures listed)") }
        return New-DigestEntry -Verdict "FAIL" -Label "Nightly health" -RawLines $lines
    }
    if ($score -lt 100) {
        $failed = if ($j.PSObject.Properties["failed"]) { [int]$j.failed } else { 0 }
        $total  = if ($j.PSObject.Properties["total"])  { [int]$j.total }  else { 0 }
        return New-DigestEntry -Verdict "WARN" -Label "Nightly health" -RawLines @(("score {0}% ({1}/{2} checks failed)" -f $score, $failed, $total))
    }
    return New-DigestEntry -Verdict "PASS" -Label "Nightly health" -RawLines @()
}

# --- 3. Backup health ---
function Get-BackupHealthEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "backup-health-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "Backup" -RawLines @("backup-health-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generatedAt', 'overall', 'ks_aw_01') -Label "Backup" -FileName "backup-health-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAt)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Backup" -RawLines @(("backup-health-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $overall = [string]$j.overall
    $vr = Get-VerdictOrBlind -Value $overall -Map @{ PASS = "PASS"; WARN = "WARN"; ERROR = "FAIL" } -Label "Backup" -Field "overall" -FileName "backup-health-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    if ($verdict -eq "PASS") { return New-DigestEntry -Verdict "PASS" -Label "Backup" -RawLines @() }
    # Per-host detail lives only in the per-host $sg/$eu/$ks objects, not a flat reasons
    # array -- recomputing the stale/verify-fail/cron-gone logic here would drift from the
    # producer's own thresholds (see check-backup-health.ps1:251-277), so this points at
    # the full report rather than re-deriving its verdict logic a second time.
    $line = if ($j.PSObject.Properties["fatal"] -and $j.fatal) { [string]$j.fatalReason } else { "{0} -- see reports/status/backup-health-LATEST.md for per-host detail" -f $overall }
    return New-DigestEntry -Verdict $verdict -Label "Backup" -RawLines @($line)
}

# --- 4. VPS auto-reboot health ---
function Get-AutoRebootEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "auto-reboot-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "Auto-reboot" -RawLines @("auto-reboot-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generated_utc', 'overall_user', 'ks_aw_01') -Label "Auto-reboot" -FileName "auto-reboot-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-UnzonedUtcSafe -Text ([string]$j.generated_utc)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Auto-reboot" -RawLines @(("auto-reboot-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $vr = Get-VerdictOrBlind -Value ([string]$j.overall_user) -Map @{ PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL" } -Label "Auto-reboot" -Field "overall_user" -FileName "auto-reboot-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    if ($verdict -eq "PASS") { return New-DigestEntry -Verdict "PASS" -Label "Auto-reboot" -RawLines @() }
    $reasons = @()
    if ($j.ks_aw_01 -and $j.ks_aw_01.verdict -and $j.ks_aw_01.verdict.reasons) { $reasons = @($j.ks_aw_01.verdict.reasons) }
    return New-DigestEntry -Verdict $verdict -Label "Auto-reboot" -RawLines $reasons
}

# --- 5. ClickHouse self-telemetry ---
function Get-ClickhouseEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "clickhouse-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "ClickHouse" -RawLines @("clickhouse-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generatedAtUtc', 'verdictLabel', 'findings') -Label "ClickHouse" -FileName "clickhouse-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAtUtc)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "ClickHouse" -RawLines @(("clickhouse-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $vr = Get-VerdictOrBlind -Value ([string]$j.verdictLabel) -Map @{ PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL" } -Label "ClickHouse" -Field "verdictLabel" -FileName "clickhouse-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    $lines = if ($verdict -eq "PASS") { @() } else { @($j.findings) }
    return New-DigestEntry -Verdict $verdict -Label "ClickHouse" -RawLines $lines
}

# --- 6. Capacity (ks-aw-01) ---
function Get-CapacityEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "capacity-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "Capacity" -RawLines @("capacity-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generatedAt', 'overall', 'verdicts', 'blind_spots') -Label "Capacity" -FileName "capacity-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAt)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Capacity" -RawLines @(("capacity-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $vr = Get-VerdictOrBlind -Value ([string]$j.overall) -Map @{ PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL" } -Label "Capacity" -Field "overall" -FileName "capacity-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    $hasBlind = $j.blind_spots -and @($j.blind_spots).Count -gt 0
    if ($verdict -eq "PASS" -and -not $hasBlind) { return New-DigestEntry -Verdict "PASS" -Label "Capacity" -RawLines @() }

    $lines = New-Object System.Collections.Generic.List[string]
    # critic M2 concrete repro: check-capacity-health.ps1 sets overall=FAIL on "ssh.exe not
    # found" or a render exception (:486,:508,:638-640) WITHOUT populating verdicts/
    # blind_spots -- fatalReason is the only detail that exists in that path.
    if ($j.PSObject.Properties["fatal"] -and $j.fatal -and $j.PSObject.Properties["fatalReason"] -and $j.fatalReason) {
        $lines.Add([string]$j.fatalReason)
    }
    if ($j.verdicts) {
        foreach ($hostProp in $j.verdicts.PSObject.Properties) {
            $v = $hostProp.Value
            foreach ($r in @($v.reasons)) { $lines.Add(("{0}: {1}" -f $hostProp.Name, $r)) }
            foreach ($b in @($v.blind))   { $lines.Add(("{0}: BLIND {1}" -f $hostProp.Name, $b)) }
        }
    }
    if ($j.blind_spots) {
        foreach ($b in @($j.blind_spots)) { $lines.Add(("{0}: {1}" -f $b.host, $b.reason)) }
    }
    if ($verdict -eq "PASS" -and $hasBlind) { $verdict = "WARN" }
    return New-DigestEntry -Verdict $verdict -Label "Capacity" -RawLines @($lines)
}

# --- 7. site-watch watchdog ---
function Get-SiteWatchEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "site-watch-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "site-watch" -RawLines @("site-watch-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generatedAt', 'overall', 'blind_spots') -Label "site-watch" -FileName "site-watch-LATEST.json"
    if ($shape) { return $shape }

    # Freshness first (codex F1): a stale NOT_DEPLOYED report is not evidence that it is still not
    # deployed -- SKIP is only a valid quiet state while the watchdog keeps saying so.
    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generatedAt)
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "site-watch" -RawLines @(("site-watch-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $overall = [string]$j.overall
    if ($overall -eq "NOT_DEPLOYED") { return New-DigestEntry -Verdict "SKIP" -Label "site-watch" -RawLines @() }

    $vr = Get-VerdictOrBlind -Value $overall -Map @{ PASS = "PASS"; WARN = "WARN"; FAIL = "FAIL" } -Label "site-watch" -Field "overall" -FileName "site-watch-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    if ($verdict -eq "PASS") { return New-DigestEntry -Verdict "PASS" -Label "site-watch" -RawLines @() }
    $lines = New-Object System.Collections.Generic.List[string]
    if ($j.probes) {
        foreach ($p in $j.probes.PSObject.Properties) {
            # critic m3: SKIP/UNKNOWN probes are not blockers and previously crowded out the
            # real signal (the blind_spots line) within the 5-line cap.
            $pv = [string]$p.Value.verdict
            if ($pv -ne "PASS" -and $pv -ne "SKIP" -and $pv -ne "UNKNOWN") {
                $lines.Add(("{0}: {1} -- {2}" -f $p.Name, $pv, $p.Value.detail))
            }
        }
    }
    if ($j.blind_spots -and @($j.blind_spots).Count -gt 0) {
        $lines.Add(("blind spots: {0}" -f (($j.blind_spots | ForEach-Object { [string]$_ }) -join ", ")))
    }
    return New-DigestEntry -Verdict $verdict -Label "site-watch" -RawLines @($lines)
}

# --- 8. staging reconciliation (SG filesystem / MariaDB / Supabase wp_sites orphans) ---
function Get-StagingOrphansEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 13)
    $j = Get-JsonReportSafe -Path (Join-Path $StatusDir "staging-orphans-LATEST.json")
    if ($null -eq $j) { return New-DigestEntry -Verdict "BLIND" -Label "Staging orphans" -RawLines @("staging-orphans-LATEST.json missing or unreadable") }
    $shape = Test-ReportShape -Json $j -RequiredKeys @('generated_utc', 'overall', 'blind_spots', 'orphan_total') -Label "Staging orphans" -FileName "staging-orphans-LATEST.json"
    if ($shape) { return $shape }

    $ts = ConvertFrom-IsoUtcSafe -Text ([string]$j.generated_utc)
    # 13h, not 2h: check-staging-orphans.ps1 is itself throttled to run at most every 12h
    # (ao-resume.ps1), so a fresh-by-design 11h-old report must not read BLIND.
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Staging orphans" -RawLines @(("staging-orphans-LATEST.json is stale (max {0}h)" -f $MaxAgeHours))
    }

    $overall = [string]$j.overall
    $vr = Get-VerdictOrBlind -Value $overall -Map @{ OK = "PASS"; WARN = "WARN"; CRITICAL = "FAIL" } -Label "Staging orphans" -Field "overall" -FileName "staging-orphans-LATEST.json"
    if ($vr.blind) { return $vr.blind }
    $verdict = $vr.verdict
    if ($verdict -eq "PASS") { return New-DigestEntry -Verdict "PASS" -Label "Staging orphans" -RawLines @() }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($b in @($j.blind_spots)) { $lines.Add(("blind: {0}" -f $b)) }
    $orphanTotal = if ($j.PSObject.Properties["orphan_total"]) { [int]$j.orphan_total } else { 0 }
    if ($orphanTotal -gt 0) {
        $countParts = @()
        if ($j.counts) {
            foreach ($c in $j.counts.PSObject.Properties) {
                if ([int]$c.Value -gt 0) { $countParts += ("{0}={1}" -f $c.Name, $c.Value) }
            }
        }
        $lines.Add(("{0} orphan(s): {1}" -f $orphanTotal, ($countParts -join ", ")))
    }
    return New-DigestEntry -Verdict $verdict -Label "Staging orphans" -RawLines @($lines)
}

# --- 9. Claude routine output freshness (MD-only; no JSON writer) ---
function Get-RoutineFreshnessEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $text = Get-TextReportSafe -Path (Join-Path $StatusDir "routine-freshness-LATEST.md")
    if ($null -eq $text) { return New-DigestEntry -Verdict "BLIND" -Label "Routine freshness" -RawLines @("routine-freshness-LATEST.md missing or unreadable") }

    $genMatch = [regex]::Match($text, '(?m)^-\s+generated:\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})')
    $ts = if ($genMatch.Success) { ConvertFrom-LocalNoZoneSafe -Text $genMatch.Groups[1].Value -Format "yyyy-MM-dd HH:mm" } else { $null }
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Routine freshness" -RawLines @(("routine-freshness-LATEST.md is stale or has no parseable generated line (max {0}h)" -f $MaxAgeHours))
    }

    # critic M4: require the producer's OWN exact overall line for PASS -- "no WARN line
    # found" previously also matched garbage/unrecognised content, which is not the same
    # fact as "every routine is fresh".
    if ($text -match '(?m)^-\s+overall:\s+all fresh\s*$') {
        return New-DigestEntry -Verdict "PASS" -Label "Routine freshness" -RawLines @()
    }
    $warnLines = @([regex]::Matches($text, '(?m)^-\s+WARN\s+(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() })
    if ($warnLines.Count -gt 0) {
        return New-DigestEntry -Verdict "WARN" -Label "Routine freshness" -RawLines $warnLines
    }
    return New-DigestEntry -Verdict "BLIND" -Label "Routine freshness" -RawLines @("routine-freshness-LATEST.md has neither an 'all fresh' nor a WARN line -- unrecognised report shape")
}

# --- 10. Cloudflare security posture (MD-only; no JSON writer) ---
function Get-CfSecurityEntry {
    param([string]$StatusDir, [double]$MaxAgeHours = 2)
    $text = Get-TextReportSafe -Path (Join-Path $StatusDir "cf-security-LATEST.md")
    if ($null -eq $text) { return New-DigestEntry -Verdict "BLIND" -Label "Cloudflare" -RawLines @("cf-security-LATEST.md missing or unreadable") }

    $genMatch = [regex]::Match($text, '(?m)^-\s+Generated:\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})')
    $ts = if ($genMatch.Success) { ConvertFrom-LocalNoZoneSafe -Text $genMatch.Groups[1].Value -Format "yyyy-MM-dd HH:mm:ss" } else { $null }
    if (-not (Test-TimestampFresh -UtcTimestamp $ts -MaxAgeHours $MaxAgeHours)) {
        return New-DigestEntry -Verdict "BLIND" -Label "Cloudflare" -RawLines @(("cf-security-LATEST.md is stale or has no parseable Generated line (max {0}h)" -f $MaxAgeHours))
    }

    $m = [regex]::Match($text, '\*\*Overall:\s*([A-Z]+)\*\*')
    if (-not $m.Success) { return New-DigestEntry -Verdict "BLIND" -Label "Cloudflare" -RawLines @("cf-security-LATEST.md has no parseable Overall line") }
    $overall = $m.Groups[1].Value
    $vr = Get-VerdictOrBlind -Value $overall -Map @{ PASS = "PASS"; WARN = "WARN"; SKIP = "SKIP"; BLIND = "BLIND" } -Label "Cloudflare" -Field "Overall" -FileName "cf-security-LATEST.md"
    if ($vr.blind) { return $vr.blind }
    if ($overall -eq "PASS") { return New-DigestEntry -Verdict "PASS" -Label "Cloudflare" -RawLines @() }
    if ($overall -eq "SKIP") { return New-DigestEntry -Verdict "SKIP" -Label "Cloudflare" -RawLines @() }
    if ($overall -eq "BLIND") {
        $section = [regex]::Match($text, '(?s)## BLIND.*?\n(.*?)(\n##|\z)')
        $lines = if ($section.Success) { @([regex]::Matches($section.Groups[1].Value, '(?m)^-\s+(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() }) } else { @() }
        return New-DigestEntry -Verdict "BLIND" -Label "Cloudflare" -RawLines $lines
    }
    return New-DigestEntry -Verdict "WARN" -Label "Cloudflare" -RawLines @(("Overall: {0} -- see cf-security-LATEST.md" -f $overall))
}

# critic M3: isolate each source so one parser's exception cannot blind the other nine.
# Set-StrictMode makes an absent property or a bad [double]/[DateTime] cast throw, and
# every Get-*Entry above touches producer-controlled JSON/MD it does not own the shape of.
function Invoke-EntrySafe {
    param([Parameter(Mandatory = $true)][string]$SourceLabel, [Parameter(Mandatory = $true)][scriptblock]$Block)
    try {
        return (& $Block)
    } catch {
        return New-DigestEntry -Verdict "BLIND" -Label $SourceLabel -RawLines @(("parser threw: {0}" -f $_.Exception.Message))
    }
}

function Get-StatusDigest {
    param([Parameter(Mandatory = $true)][string]$WorkRoot)
    $statusDir = Join-Path $WorkRoot "agency-os\reports\status"

    $entries = [ordered]@{
        ci_health          = Invoke-EntrySafe -SourceLabel "CI"                { Get-CiHealthEntry -StatusDir $statusDir }
        nightly_health     = Invoke-EntrySafe -SourceLabel "Nightly health"    { Get-NightlyHealthEntry -WorkRoot $WorkRoot }
        backup_health      = Invoke-EntrySafe -SourceLabel "Backup"            { Get-BackupHealthEntry -StatusDir $statusDir }
        auto_reboot_health = Invoke-EntrySafe -SourceLabel "Auto-reboot"       { Get-AutoRebootEntry -StatusDir $statusDir }
        clickhouse_health  = Invoke-EntrySafe -SourceLabel "ClickHouse"        { Get-ClickhouseEntry -StatusDir $statusDir }
        capacity_health    = Invoke-EntrySafe -SourceLabel "Capacity"          { Get-CapacityEntry -StatusDir $statusDir }
        site_watch_health  = Invoke-EntrySafe -SourceLabel "site-watch"        { Get-SiteWatchEntry -StatusDir $statusDir }
        staging_orphans    = Invoke-EntrySafe -SourceLabel "Staging orphans"   { Get-StagingOrphansEntry -StatusDir $statusDir }
        routine_freshness  = Invoke-EntrySafe -SourceLabel "Routine freshness" { Get-RoutineFreshnessEntry -StatusDir $statusDir }
        cf_security_health = Invoke-EntrySafe -SourceLabel "Cloudflare"        { Get-CfSecurityEntry -StatusDir $statusDir }
    }

    $blockers = New-Object System.Collections.Generic.List[string]
    # An empty [string[]] stored in a hashtable comes back as $null, and @($null) is ONE element:
    # every PASS source used to contribute a blank blocker line, so blockers.Count was never 0
    # and smoke could never report PASS (2026-09-23). Keep only real lines.
    foreach ($k in $entries.Keys) { foreach ($line in @($entries[$k].blockers)) { if ($line -and "$line".Trim()) { $blockers.Add([string]$line) } } }

    return [ordered]@{ entries = $entries; blockers = @($blockers) }
}
