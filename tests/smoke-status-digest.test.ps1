# Regression tests for scripts/lib/smoke-status-digest.ps1.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tests/smoke-status-digest.test.ps1

$ErrorActionPreference = 'Stop'
$libPath = Join-Path $PSScriptRoot '..\scripts\lib\smoke-status-digest.ps1'
. (Resolve-Path -LiteralPath $libPath).Path

$failures = New-Object System.Collections.Generic.List[string]
function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $script:failures.Add($Message) }
}
function Assert-Eq {
    param($Expected, $Actual, [string]$Message)
    if ("$Expected" -ne "$Actual") { $script:failures.Add("$Message (expected=[$Expected] actual=[$Actual])") }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8 { param([string]$Path, [string]$Content) [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom) }

$root = Join-Path ([IO.Path]::GetTempPath()) ("smoke-digest-test-" + [guid]::NewGuid().ToString('N'))
$statusDir = Join-Path $root "agency-os\reports\status"
$healthDir = Join-Path $root "agency-os\reports\health"
New-Item -ItemType Directory -Force -Path $statusDir, $healthDir | Out-Null

try {
    # ---------- Case 1: everything missing -> every source BLIND, blockers non-empty ----------
    $d1 = Get-StatusDigest -WorkRoot $root
    foreach ($k in $d1.entries.Keys) {
        # doc_integrity_commits is event-driven: no file = no script commit yet = PASS
        # (smoke-status-digest.ps1, source 11). Every periodic source must read BLIND.
        if ($k -eq 'doc_integrity_commits') { continue }
        Assert-Eq "BLIND" $d1.entries[$k].verdict "Case1: $k should be BLIND when its report is missing"
    }
    Assert-Eq "PASS" $d1.entries.doc_integrity_commits.verdict "Case1: doc_integrity_commits with no report (no script commit yet) is PASS, not BLIND"
    Assert-True ($d1.blockers.Count -ge 10) "Case1: blockers should have at least one line per missing source"

    # ---------- Case 2: all-healthy fixtures -> PASS, no blockers ----------
    # Every producer's own timestamp shape (the M1 freshness check reads these, never mtime):
    # ISO "o" (generatedAtUtc / generatedAt), unzoned UTC (auto-reboot generated_utc), zoned ISO
    # (staging generated_utc), local wall-clock "- generated:" / "- Generated:" lines in the two MDs.
    $nowIso   = (Get-Date).ToUniversalTime().ToString("o")
    $nowUnzoned = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
    $nowLocalMin = (Get-Date).ToString("yyyy-MM-dd HH:mm")
    $nowLocalSec = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; probeOk = $true; findings = @(); workflows = @() } | ConvertTo-Json)
    Write-Utf8 (Join-Path $healthDir "health-20260101-000000.json") (@{ schemaVersion = 1; generatedAtUtc = $nowIso; score = 100; critical_gate = "PASS"; critical_failures = @(); passed = 10; failed = 0; total = 10 } | ConvertTo-Json)
    Write-Utf8 (Join-Path $statusDir "backup-health-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; fatal = $false; fatalReason = ""; ks_aw_01 = @{ status = "ok" } } | ConvertTo-Json -Depth 5)
    Write-Utf8 (Join-Path $statusDir "auto-reboot-LATEST.json") (@{ generated_utc = $nowUnzoned; overall_user = "PASS"; ks_aw_01 = @{ verdict = @{ reasons = @() } } } | ConvertTo-Json -Depth 5)
    Write-Utf8 (Join-Path $statusDir "clickhouse-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; findings = @() } | ConvertTo-Json)
    Write-Utf8 (Join-Path $statusDir "capacity-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; blind_spots = @(); verdicts = @{ "ks-aw-01" = @{ reasons = @(); blind = @() } } } | ConvertTo-Json -Depth 5)
    Write-Utf8 (Join-Path $statusDir "site-watch-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; blind_spots = @(); probes = @{ a = @{ verdict = "PASS"; detail = "ok" } } } | ConvertTo-Json -Depth 5)
    Write-Utf8 (Join-Path $statusDir "staging-orphans-LATEST.json") (@{ generated_utc = $nowIso; overall = "OK"; blind_spots = @(); orphan_total = 0; counts = @{} } | ConvertTo-Json -Depth 5)
    Write-Utf8 (Join-Path $statusDir "routine-freshness-LATEST.md") "# freshness`n- generated: $nowLocalMin (local)`n- OK    Phase 4 weekly: 1d old (max 8d)`n- overall: all fresh`n"
    Write-Utf8 (Join-Path $statusDir "cf-security-LATEST.md") "# cf`n- Generated: $nowLocalSec`n- **Overall: PASS**`n"

    $d2 = Get-StatusDigest -WorkRoot $root
    foreach ($k in $d2.entries.Keys) {
        Assert-Eq "PASS" $d2.entries[$k].verdict "Case2: $k should be PASS with healthy fixtures"
    }
    Assert-Eq 0 $d2.blockers.Count "Case2: no blockers when everything is healthy"

    # ---------- Case 3: CI red workflow (the actual bug this whole change fixes) ----------
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{
        generatedAtUtc = $nowIso; verdictLabel = "FAIL"; probeOk = $true; workflows = @("HCI-30")
        findings = @("'HCI-30' has been failing for 8 consecutive run(s) over 15 day(s): https://x")
    } | ConvertTo-Json)
    $d3 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "FAIL" $d3.entries.ci_health.verdict "Case3: ci_health should be FAIL"
    Assert-True (($d3.blockers -join "`n") -match "HCI-30") "Case3: blockers should surface the red workflow by name"

    # ---------- Case 4: CI probe blind (gh unreachable) ----------
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "FAIL"; probeOk = $false; findings = @("BLIND SPOT: gh workflow list failed"); workflows = @() } | ConvertTo-Json)
    $d4 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d4.entries.ci_health.verdict "Case4: probeOk=false must be BLIND even if verdictLabel says FAIL"
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; probeOk = $true; findings = @(); workflows = @() } | ConvertTo-Json)  # reset

    # ---------- Case 5: nightly health critical_gate FAIL ----------
    Write-Utf8 (Join-Path $healthDir "health-20260102-000000.json") (@{ schemaVersion = 1; generatedAtUtc = $nowIso; score = 99.7; critical_gate = "FAIL"; critical_failures = @("Doc integrity failed (exit 1): validate-doc-integrity.mjs"); passed = 325; failed = 1; total = 326 } | ConvertTo-Json)
    $d5 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "FAIL" $d5.entries.nightly_health.verdict "Case5: nightly_health should be FAIL on critical_gate=FAIL"
    Assert-True (($d5.blockers -join "`n") -match "Doc integrity") "Case5: blockers should surface the critical_failures text"

    # ---------- Case 6 (mutation proof): staleness threshold actually gates ----------
    # A report from "13 months ago" with the default 30h ceiling must be BLIND...
    $staleIso = (Get-Date).AddDays(-400).ToUniversalTime().ToString("o")
    Write-Utf8 (Join-Path $healthDir "health-20260103-000000.json") (@{ schemaVersion = 1; generatedAtUtc = $staleIso; score = 100; critical_gate = "PASS"; critical_failures = @(); passed = 1; failed = 0; total = 1 } | ConvertTo-Json)
    $d6a = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d6a.entries.nightly_health.verdict "Case6a: a 400-day-old report must be BLIND under the default ceiling"
    # ...and loosening the ceiling on the SAME fixture must flip it back to PASS, proving the
    # staleness check (not some other branch) produced the BLIND verdict above.
    $entryLoose = Get-NightlyHealthEntry -WorkRoot $root -MaxAgeHours 100000
    Assert-Eq "PASS" $entryLoose.verdict "Case6b: loosening MaxAgeHours on the identical fixture must flip BLIND back to PASS"
    Remove-Item -LiteralPath (Join-Path $healthDir "health-20260103-000000.json") -Force

    # ---------- Case 7: site-watch NOT_DEPLOYED is SKIP, not a blocker ----------
    Write-Utf8 (Join-Path $statusDir "site-watch-LATEST.json") (@{ generatedAt = $nowIso; overall = "NOT_DEPLOYED"; blind_spots = @() } | ConvertTo-Json)
    $d7 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "SKIP" $d7.entries.site_watch_health.verdict "Case7: NOT_DEPLOYED must map to SKIP"
    Assert-True (-not (($d7.blockers -join "`n") -match "site-watch")) "Case7: SKIP must not add a site-watch blocker line"
    Write-Utf8 (Join-Path $statusDir "site-watch-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; blind_spots = @(); probes = @{ a = @{ verdict = "PASS"; detail = "ok" } } } | ConvertTo-Json -Depth 5)  # reset

    # ---------- Case 8: cf-security BLIND section parsed from markdown ----------
    Write-Utf8 (Join-Path $statusDir "cf-security-LATEST.md") "# cf`n- Generated: $nowLocalSec`n- **Overall: BLIND**`n`n## BLIND (not the same as WARN)`n- 2 of 3 checks produced ZERO measurement this run: Bot Fight Mode, WAF firewall rules.`n- Cause includes an auth rejection (HTTP 401).`n"
    $d8 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d8.entries.cf_security_health.verdict "Case8: cf-security BLIND overall must map to BLIND"
    Assert-True (($d8.blockers -join "`n") -match "ZERO measurement") "Case8: BLIND-section lines should be captured as blockers"
    Write-Utf8 (Join-Path $statusDir "cf-security-LATEST.md") "# cf`n- Generated: $nowLocalSec`n- **Overall: PASS**`n"  # reset

    # ---------- Case 9: staging orphans CRITICAL with counts ----------
    Write-Utf8 (Join-Path $statusDir "staging-orphans-LATEST.json") (@{ generated_utc = $nowIso; overall = "CRITICAL"; blind_spots = @(); orphan_total = 7; counts = @{ unregistered = 5; dir_only = 2 } } | ConvertTo-Json -Depth 5)
    $d9 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "FAIL" $d9.entries.staging_orphans.verdict "Case9: CRITICAL must map to FAIL"
    Assert-True (($d9.blockers -join "`n") -match "\[FAIL\] Staging orphans: 7 orphan\(s\): .*unregistered=5") "Case9: orphan count summary must appear in blockers, severity-prefixed"

    # ---------- Case 10: a stale sibling report is BLIND, never a reused PASS (M1) ----------
    Write-Utf8 (Join-Path $statusDir "clickhouse-LATEST.json") (@{ generatedAtUtc = (Get-Date).AddHours(-3).ToUniversalTime().ToString("o"); verdictLabel = "PASS"; findings = @() } | ConvertTo-Json)
    # (Case 10 also proves the shape check runs before freshness only when keys are missing: this fixture has them)
    $d10 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d10.entries.clickhouse_health.verdict "Case10: a 3h-old PASS report must be BLIND under the 2h ceiling"
    Assert-True (($d10.blockers -join "`n") -match "\[BLIND\] ClickHouse: .*stale") "Case10: staleness must be a severity-prefixed blocker line"

    # ---------- Case 11: one broken report cannot blind the other nine (M3) ----------
    Write-Utf8 (Join-Path $statusDir "backup-health-LATEST.json") "{ not json"
    $d11 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d11.entries.backup_health.verdict "Case11: unreadable backup report is BLIND"
    Assert-Eq "FAIL"  $d11.entries.staging_orphans.verdict "Case11: the other sources still parse"

    # ---------- Case 12: a non-PASS verdict with no detail still yields a blocker line (M2) ----------
    Write-Utf8 (Join-Path $statusDir "capacity-LATEST.json") (@{ generatedAt = $nowIso; overall = "FAIL"; fatal = $false; blind_spots = @(); verdicts = @{} } | ConvertTo-Json -Depth 5)
    $d12 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "FAIL" $d12.entries.capacity_health.verdict "Case12: capacity FAIL"
    Assert-True (($d12.blockers -join "`n") -match "\[FAIL\] Capacity: FAIL \(producer gave no detail\)") "Case12: empty-detail FAIL must not vanish from blockers"

    # ---------- Case 13: a stale NOT_DEPLOYED site-watch report is BLIND, not a quiet SKIP (codex F1) ----------
    Write-Utf8 (Join-Path $statusDir "site-watch-LATEST.json") (@{ generatedAt = (Get-Date).AddHours(-3).ToUniversalTime().ToString("o"); overall = "NOT_DEPLOYED"; blind_spots = @() } | ConvertTo-Json)
    $d13 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d13.entries.site_watch_health.verdict "Case13: stale NOT_DEPLOYED must be BLIND"
    Write-Utf8 (Join-Path $statusDir "site-watch-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; blind_spots = @(); probes = @{ a = @{ verdict = "PASS"; detail = "ok" } } } | ConvertTo-Json -Depth 5)  # reset

    # ---------- Case 14: an unrecognised nightly critical_gate value is BLIND, never PASS (codex F2) ----------
    Write-Utf8 (Join-Path $healthDir "health-20260104-000000.json") (@{ schemaVersion = 1; generatedAtUtc = $nowIso; score = 100; critical_gate = "BROKEN"; critical_failures = @(); passed = 1; failed = 0; total = 1 } | ConvertTo-Json)
    $d14 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d14.entries.nightly_health.verdict "Case14: critical_gate=BROKEN must be BLIND"
    Remove-Item -LiteralPath (Join-Path $healthDir "health-20260104-000000.json") -Force

    # ---------- Case 15: a structurally incomplete report cannot read PASS (codex F3) ----------
    Write-Utf8 (Join-Path $statusDir "backup-health-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS" } | ConvertTo-Json)
    $d15 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d15.entries.backup_health.verdict "Case15: overall=PASS without the per-host objects is BLIND"
    Assert-True (($d15.blockers -join "`n") -match "\[BLIND\] Backup: .*lacks producer key") "Case15: the missing key is named"
    Write-Utf8 (Join-Path $statusDir "backup-health-LATEST.json") (@{ generatedAt = $nowIso; overall = "PASS"; fatal = $false; fatalReason = ""; ks_aw_01 = @{ status = "ok" } } | ConvertTo-Json -Depth 5)  # reset

    # ---------- Case 16: an unmapped producer label is BLIND in EVERY parser, never WARN (codex r2 F1) ----------
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "DEGRADED"; probeOk = $true; findings = @(); workflows = @() } | ConvertTo-Json)
    Write-Utf8 (Join-Path $statusDir "clickhouse-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "MEH"; findings = @() } | ConvertTo-Json)
    Write-Utf8 (Join-Path $statusDir "staging-orphans-LATEST.json") (@{ generated_utc = $nowIso; overall = "PASS"; blind_spots = @(); orphan_total = 0; counts = @{} } | ConvertTo-Json -Depth 5)  # producer writes OK, not PASS
    $d16 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d16.entries.ci_health.verdict "Case16: CI verdictLabel=DEGRADED is BLIND"
    Assert-Eq "BLIND" $d16.entries.clickhouse_health.verdict "Case16: ClickHouse verdictLabel=MEH is BLIND"
    Assert-Eq "BLIND" $d16.entries.staging_orphans.verdict "Case16: staging overall=PASS (producer says OK) is BLIND"
    Assert-True (($d16.blockers -join "`n") -match "verdictLabel='DEGRADED' which this parser does not recognise") "Case16: the unmapped value is named"

    # ---------- Case 17: CI without probeOk cannot read PASS (codex r2 F2) ----------
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; findings = @(); workflows = @() } | ConvertTo-Json)
    $d17 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d17.entries.ci_health.verdict "Case17: CI report without probeOk is BLIND"

    # ---------- Case 18: cf-security Overall outside PASS|WARN|SKIP|BLIND is BLIND (codex r3 F1) ----------
    Write-Utf8 (Join-Path $statusDir "cf-security-LATEST.md") "# cf`n- Generated: $nowLocalSec`n- **Overall: ERROR**`n"
    $d18 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d18.entries.cf_security_health.verdict "Case18: Overall=ERROR is BLIND, not WARN"
    Write-Utf8 (Join-Path $statusDir "cf-security-LATEST.md") "# cf`n- Generated: $nowLocalSec`n- **Overall: PASS**`n"  # reset

    # ---------- Case 19: probeOk as the STRING "false" is a failed probe (codex r3 F2) ----------
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; probeOk = "false"; findings = @(); workflows = @() } | ConvertTo-Json)
    $d19 = Get-StatusDigest -WorkRoot $root
    Assert-Eq "BLIND" $d19.entries.ci_health.verdict "Case19: probeOk='false' (string) must be BLIND"
    Write-Utf8 (Join-Path $statusDir "ci-LATEST.json") (@{ generatedAtUtc = $nowIso; verdictLabel = "PASS"; probeOk = $true; findings = @(); workflows = @() } | ConvertTo-Json)
    $d19b = Get-StatusDigest -WorkRoot $root
    Assert-Eq "PASS" $d19b.entries.ci_health.verdict "Case19: a real boolean true still passes"

    if ($failures.Count -eq 0) {
        Write-Host "ALL PASS (19 cases, 1 mutation proof)" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ("FAILED: {0} assertion(s)" -f $failures.Count) -ForegroundColor Red
        foreach ($f in $failures) { Write-Host ("  - " + $f) -ForegroundColor Red }
        exit 1
    }
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
