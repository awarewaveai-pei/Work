# Runbook: Add a Periodic Health Check to AO-RESUME

> **Established**: 2026-05-23 (after B-Minimal auto-reboot session formalised the pattern)
> **Owner principle**: [`~/.claude/projects/d--Work/memory/feedback_operator_zero_memory_automation.md`](../.claude/projects/d--Work/memory/feedback_operator_zero_memory_automation.md)
> **Applies to**: Any "I want to monitor X health" need — VPS state, certificate expiry, DNS, RLS policies, backup integrity, deploy drift, third-party API quotas, etc.

---

## 1. When to use this runbook

When you (or future Claude) want to add a new periodic health check and have it surface in front of the operator **without requiring them to remember any command**.

If the new check meets ALL of these, this runbook applies:
- Read-only or near-read-only (no production writes)
- Outcome is a verdict: PASS / WARN / FAIL (or 🟢 / 🟡 / 🔴)
- Operator should be informed automatically, not on-demand
- Runs daily-ish frequency (every AO-RESUME) is sufficient

If the check needs to run continuously / on alerts → use Sentry/netdata/uptime-kuma instead (this runbook is for "check X every time you start work").

---

## 2. The 3-step pattern (codified from 3 existing instances)

### Instances proving this is a pattern

| Check | Script | LATEST report |
|-------|--------|---------------|
| Backup health (SG + EU cron + dirs) | [`scripts/check-backup-health.ps1`](../scripts/check-backup-health.ps1) | `agency-os/reports/status/backup-health-LATEST.md` |
| Cloudflare security (bot fight + WAF) | [`scripts/check-cloudflare-security.ps1`](../scripts/check-cloudflare-security.ps1) | `agency-os/reports/status/cf-security-LATEST.md` |
| VPS auto-reboot config | [`scripts/check-vps-auto-reboot-health.ps1`](../scripts/check-vps-auto-reboot-health.ps1) | `agency-os/reports/status/auto-reboot-LATEST.md` |
| ClickHouse self-telemetry + merge health | [`scripts/check-clickhouse-health.ps1`](../scripts/check-clickhouse-health.ps1) | `agency-os/reports/status/clickhouse-LATEST.md` |
| CI health (GitHub Actions on main) | [`scripts/check-ci-health.ps1`](../scripts/check-ci-health.ps1) | `agency-os/reports/status/ci-LATEST.md` |
| site-watch watchdog (monitor of the client-site monitor; prod DB via SSH) | [`scripts/check-site-watch-health.ps1`](../scripts/check-site-watch-health.ps1) | `agency-os/reports/status/site-watch-LATEST.md` |

All of them follow the same shape. New checks must follow it too.

### 2026-08-25 addendum — measure the MECHANISM, not the last incident's signature

Added after the fifth ClickHouse incident, where an existing check built from this runbook
reported only YELLOW throughout a three-day outage and was *mathematically incapable* of
reporting worse. Every threshold in it had been calibrated against how the PREVIOUS incident
looked — accumulated data volume — and the new one had a different signature: merges that
could not complete, which pins volume LOW while the box burns.

So when you write the verdict logic, ask two questions, not one:

1. **What does the failure look like?** (the outcome — size, ratio, count)
2. **What is the failure DOING?** (the mechanism — operations failing, retrying, stalling,
   a queue that never drains, a limit that is not in force)

A check with only (1) catches a rerun of the last incident and nothing else. Add at least one
probe for (2), and prefer probes that read the *operation* rather than its aftermath — e.g.
"how many merge tasks failed in the last hour" beats "how big did the table get".

Two related traps found the same day, both worth copying into a new check:

- **Two independent sources beat one.** The merge-failure probe reads both `text_log` and
  `part_log` and takes the max, so one going blind cannot read as healthy. During that
  incident `part_log` alone would have reported 0, because the table had itself been
  recreated and lost its history.
- **Name what you actually measured.** The first version of that probe counted a
  server-wide error code and reported it as "merges are failing" — true during the incident,
  false in general, and it would have sent the next reader down the wrong path.

### 2026-09-23 addendum — three traps from the site-watch watchdog (each would have shipped green)

- **An age probe must not read a column the failure itself rewrites.** "Stuck for > 3h" measured on
  `updated_at` stays fresh while a send is retried and fails every hour — the probe is green for
  exactly the faults it names. Store *since when* the work has been owed (`owed_since`) and bind it
  with a schema CHECK so every state transition keeps it honest.
- **`greatest(0, x)` in PostgreSQL ignores NULL.** `greatest(0, now() - never)` = 0 = "just now": a
  scheduler that never ran reads healthy. Pass NULL through as `none`; clamp in the script. Prove
  "never" with a test case, not by reasoning.
- **No expected-permanent red.** Wiring a check before its system ships makes it red at every
  AO-RESUME until rollout, which trains the reader to skip it. Detect "not deployed" separately (a
  cheap, read-only deployment signal, e.g. the route answers 401 vs 404) and report it neutral.
- Verify every verdict against a real DB with fake timestamps and **delete the previous report
  before each case** — a run that crashes before writing is otherwise graded on the last one.

### 2026-09-23 addendum — a check already read by AO-RESUME still needs Step 2/3 for the DoD; a check nobody reads can register in the digest instead

Wiring the LATEST report into `ao-resume.ps1` output (Step 2) does not by itself guarantee an
agent acts on it -- CI health and the nightly system-guard health gate both had exactly that
wiring (or, for CI, a `TOOL_TRIGGER_MAP.md` trigger row) and still went unread for weeks,
because a trigger row only fires if the agent happens to match the user's wording, and a
console block only gets summarized if the agent chooses to read past it. Ten sibling checks'
worth of red/blind results now also flow through `scripts/lib/smoke-status-digest.ps1` into
`smoke-LATEST.json`'s `blockers[]` array, which `ao-resume.md` §1/§6 read unconditionally
every run -- see `agency-os/docs/operations/AGENTS_APPENDIX.md` §AO-RESUME 判讀規則
(2026-09-23 addendum) for the full incident and the ten registered sources.

If your new check is warn-only and its verdict should be visible without the operator having
to phrase a question that matches a trigger row, add a `Get-<Thing>Entry` function to
`smoke-status-digest.ps1` and register it in `Get-StatusDigest`'s `$entries` hashtable,
**in addition to** Steps 1-3 below (the LATEST report is still the data source; the digest
is just the guaranteed reader). Steps 1-3 alone are still correct for a check whose audience
is a human skimming the report on demand, not an agent that must act on it every session.

### Step 1 — Write `scripts/check-<thing>.ps1`

Skeleton (copy-paste from an existing check; do NOT design from scratch):

```powershell
#requires -Version 5.1
[CmdletBinding()]
param(
    # Same SSH params if remote, or other inputs
    [string]$WorkRoot = "",
    [switch]$Json
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")  # CP950 protection

# 1. Compute verdict from inputs
$verdict = "healthy"  # internal label only — keep ASCII
$reasons = @()

# 2. Decide overall worstLabel = "healthy" | "drift" | "broken"
$worstLabel = $verdict
$worstUserLabel = switch ($worstLabel) { "healthy" {"PASS"} "drift" {"WARN"} "broken" {"FAIL"} default {"UNKNOWN"} }

# 3. Write JSON + MD using WriteAllText with UTF8Encoding($false) — no BOM
$reportDir = Join-Path $WorkRoot "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }

# Emoji ONLY at output stage — use [char]::ConvertFromUtf32 to avoid PS5.1 CP950 source-parse trap
$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle

# Write to:
#   agency-os/reports/status/<thing>-LATEST.json
#   agency-os/reports/status/<thing>-LATEST.md

exit 0  # Always 0 (warn-only convention; AO-RESUME continues regardless)
```

**Critical conventions**:
- **Exit 0 always** (warn-only). AO-RESUME continues. The LATEST.md content is the signal, not exit code.
- **ASCII-only in source code**. Emojis via `ConvertFromUtf32` because PS5.1 on Big5 console parser crashes on unicode literals without BOM. See `agency-os/docs/operations/AUDIT_REGISTRY.md` §CP950.
- **Writes both `.md` (human) and `.json` (machine)**. AO-RESUME reads MD, future automation reads JSON.
- **No BOM on output** — `WriteAllText` with `[System.Text.UTF8Encoding]::new($false)`.

### Step 2 — Wire into `scripts/ao-resume.ps1`

Find the block where `check-backup-health.ps1` is invoked (around line 382-395). Add an identical block after it:

```powershell
# --- <Thing> health snapshot (warn-only; surfaces drift in EVERY AO-RESUME) ---
$thingHealthScript = Join-Path $WorkRoot "scripts\check-<thing>.ps1"
if (Test-Path -LiteralPath $thingHealthScript) {
    Write-Host ""
    Write-Host "== AO-RESUME: <thing> health snapshot (warn-only) ==" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $thingHealthScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARN: <thing> health snapshot returned non-zero (see agency-os/reports/status/<thing>-LATEST.md)." -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
}
```

### Step 3 — Update `agency-os/AGENTS.md` 代理自動工具使用規則 table

Add a trigger row near the existing AO-RESUME row (line ~133):

```
| AO-RESUME / 使用者問「<thing> 還好嗎」 | 讀 `reports/status/<thing>-LATEST.md`，於系統快照段點名 verdict (🟢/🟡/🔴) + 任何 WARN 原因 |
```

This makes AO-RESUME 七段式 automatically include the new check's verdict. Operator sees it without remembering anything.

---

## 3. Cross-machine sync

All 3 elements (script, ao-resume edit, AGENTS.md row) are in repo → `git pull` automatically deploys to all machines. No manual sync.

---

## 4. Verification (R0 4 actions, mandatory before commit)

1. **實測 (end-to-end)**: Run the new script with real inputs (SSH live VPS / curl live endpoint). Verify LATEST.md generated with correct content + JSON parseable.
2. **Review**: Read the LATEST.md output. Confirm verdict logic is correct on real data.
3. **抓蟲 (cross-file bug hunt)**: `grep` for similar checks to ensure no naming collision or stale references. Run `audit-cross-machine-bom` if .md edits crossed memory boundary.
4. **WORKLOG**: Append entry with all 4 action evidence.

---

## 5. Anti-patterns (what NOT to do)

- ❌ **Make a slash command and call it a day**. Operator won't remember to invoke it. See [`feedback_operator_zero_memory_automation.md`](../.claude/projects/d--Work/memory/feedback_operator_zero_memory_automation.md).
- ❌ **Exit non-zero on warnings**. AO-RESUME will stop. Use exit 0 + put severity in LATEST.md.
- ❌ **Unicode emoji literals in source**. Big5 console PS5.1 parser will crash. Use `ConvertFromUtf32`.
- ❌ **Skip the AGENTS.md trigger row**. Without it, Claude doesn't know to surface the new LATEST.md in AO-RESUME 七段式 output.
- ❌ **Write directly to production DB or files from the check**. Health checks are read-only. If you need to fix, build a separate writer that the operator explicitly invokes.

---

## 6. Examples to copy from

When implementing, use the closest existing instance as your template:

| Your need | Closest template | Why |
|-----------|------------------|-----|
| SSH-based remote query | `check-vps-auto-reboot-health.ps1` | Bash-via-SSH, parse KV output, dual-VPS pattern |
| Local DB / backup query | `check-backup-health.ps1` | Cron file parsing + dir listing via SSH |
| HTTP API query | `check-cloudflare-security.ps1` | curl/Invoke-RestMethod + JSON parsing |

---

## 7. Rollback

Each check is independently removable:

```bash
# Remove the check
rm scripts/check-<thing>.ps1

# Remove the AO-RESUME hook block (search for "<thing> health snapshot")
# Edit scripts/ao-resume.ps1 to delete the block

# Remove the AGENTS.md trigger row
# Edit agency-os/AGENTS.md to delete the row

# Optional: keep or delete the LATEST.md / .json artifacts
rm agency-os/reports/status/<thing>-LATEST.*

# git revert <commit>
```

---

## Related

- Memory: `~/.claude/projects/d--Work/memory/feedback_operator_zero_memory_automation.md` — the design principle
- AGENTS.md §代理自動工具使用規則 table — where trigger rows live
- AUDIT_REGISTRY.md §CP950 — why ASCII-only in source
- BUG_HUNT_PROTOCOL.md — bug-class audit framework (different scope, but related discipline)
