# AgencyOS-RepairCenterPhase4Weekly

## Metadata

| Field | Value |
|---|---|
| **Name** | `AgencyOS-RepairCenterPhase4Weekly` |
| **Routine ID** | `trig_01JyFw78ZkgwQzpyXXaX1F2K` |
| **Cron (UTC)** | `0 6 * * 5` |
| **Cron (TPE)** | Friday 14:00 (TPE = UTC+8, no DST) |
| **Next run** | `2026-05-29T06:01:03Z` (= 2026-05-29 14:01 TPE) |
| **Model** | `claude-sonnet-4-6` |
| **Environment** | `env_01WybafvBbrm4WQXjntcvynp` (PEI) |
| **Repo** | `https://github.com/awarewaveai-pei/Work` |
| **Allowed tools** | Bash, Read, Write, Edit, Glob, Grep |
| **Env vars** | None — matches existing 3 routines' pattern |
| **MCP connections** | Notion / Google_Calendar / Gmail (auto-attached from account; unused by Phase 4) |
| **Created** | 2026-05-22T08:47:42Z |
| **Created via** | `RemoteTrigger` API (in-CLI, no web UI) |
| **Supersedes** | `scripts/phase4-weekly-check.ps1` (kept as manual fallback only) |

## Design decisions

Followed the **existing 3-routine pattern** (DailyBriefing / WeeklyReview / MonthlyReview) discovered via `RemoteTrigger list`:

- **No env vars** — git auth inherited from claude.ai account; nothing else needed
- **No Telegram notification** — existing routines just `commit + push`; the watchdog (mtime check in `system-health-check.ps1` §11) + the visible `[claude] auto: Phase 4 週巡檢ㄚ ...` commit message are the observability signal
- **No web UI step required** — full CLI creation via `RemoteTrigger create`

Earlier draft of this file included an elaborate Telegram + env var + web UI checklist — that was based on abstract `/schedule` docs research before inspecting existing routines. Lesson saved at `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`.

## Purpose

Replaces the broken `/phase4-check` triple-trigger design (CronCreate 7-day expiry / non-existent Windows Task Scheduler / Big5-broken script) discovered to have never run on 2026-05-22. Runs the same 3 health checks (duplicate auto-repair PRs / needs-human-review backlog / BACKUP_RESTORE_PROOF freshness).

## Routine prompt (verbatim, as sent to RemoteTrigger create)

```text
You are AwareWave's Repair Center Phase 4 weekly monitor. Execute the 3 checks below mechanically — no interpretation. The repo awarewaveai-pei/Work is cloned at your working directory.

STEPS:

1. Run: git pull origin main

2. Compute timestamps:
   date_string = $(TZ=Asia/Taipei date +%Y-%m-%d)
   timestamp   = $(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M')

3. CHECK 1 — Auto-repair PR duplicate detection:
   Run: gh pr list --repo awarewaveai-pei/Work --label auto-repair --state all --limit 30 --json number,title,createdAt > /tmp/check1.json
   Parse JSON. For each PR compute normalized_key = lowercase(remove(title, /#\d+/), then collapse whitespace, truncate to 40 chars). Group by key. Any group with 2+ PRs is a duplicate cluster.
   CHECK1_STATUS = "PASS" if no clusters else "WARNING".
   CHECK1_DETAIL = "" if PASS else "[#X, #Y]: key...; [#Z, #W]: key..." (semicolon-separated).
   If gh exit != 0: CHECK1_STATUS = "SKIP", CHECK1_DETAIL = "gh exit=<code>".

4. CHECK 2 — needs-human-review backlog:
   Run: gh pr list --repo awarewaveai-pei/Work --label needs-human-review --state open --limit 10 --json number,title,url > /tmp/check2.json
   CHECK2_STATUS = "PASS" if empty list else "WARNING".
   CHECK2_DETAIL = "" if PASS else "#X: title | #Y: title" (pipe-separated).
   If gh exit != 0: CHECK2_STATUS = "SKIP", CHECK2_DETAIL = "gh exit=<code>".

5. CHECK 3 — BACKUP_RESTORE_PROOF freshness:
   Find all files matching pattern: agency-os/tenants/*/BACKUP_RESTORE_PROOF.md
   EXCLUDE any path containing substring "templates" or "template".
   For each file:
     - Read content as UTF-8
     - Find all date matches with regex: \b(20\d\d-\d{2}-\d{2})\b
     - If zero matches: tenant is stale-with-reason "no parseable date"
     - Else: latest_date = max date; age_days = (today UTC - latest_date) in whole days
       - If age_days > 7: tenant stale-with-reason "${age_days}d (${latest_date})"
       - Else: tenant fresh
   CHECK3_STATUS = "PASS" if all fresh, "WARNING" if any stale, "SKIP" if zero files matched.
   CHECK3_DETAIL = "" if PASS else "<parent_dir>: <reason>; ..." (semicolon-separated stale tenants).

6. Compose OVERALL:
   warning_count = count of WARNING among CHECK1/2/3 statuses
   skip_count = count of SKIP
   If warning_count == 0 and skip_count == 0: OVERALL = "✅ 全PASS"
   Else if skip_count == 0: OVERALL = "⚠️ ${warning_count} 項需注意"
   Else: OVERALL = "⚠️ ${warning_count} 項需注意, ${skip_count} 項 SKIP"

7. Write report files:
   mkdir -p agency-os/reports/repair-center
   Write the EXACT content below to BOTH files (UTF-8 without BOM, LF line endings):
     - agency-os/reports/repair-center/phase4-LATEST.md
     - agency-os/reports/repair-center/phase4-${date_string}.md

   ----- File content -----
   # Repair Center Phase 4 週巡檢
   - 日期: ${timestamp} TPE
   - 觸發: Claude routine AgencyOS-RepairCenterPhase4Weekly
   - Check 1 重複修復: ${CHECK1_STATUS}${CHECK1_DETAIL_PREFIXED}
   - Check 2 needs-human-review PR: ${CHECK2_STATUS}${CHECK2_DETAIL_PREFIXED}
   - Check 3 BACKUP_RESTORE_PROOF: ${CHECK3_STATUS}${CHECK3_DETAIL_PREFIXED}
   - 整體: ${OVERALL}
   ----- end -----

   Where ${CHECKn_DETAIL_PREFIXED} is empty string if detail is empty, else " — ${detail}" (em dash + detail).

8. Commit + push:
   git add agency-os/reports/repair-center/
   git commit -m "[claude] auto: Phase 4 週巡檢 ${date_string} — ${OVERALL}"
   git push origin main
   If push fails (conflict): run git pull --rebase origin main, then retry push once. If still fails, exit reporting the error.

RULES:
- Only write inside agency-os/reports/repair-center/
- Never delete files
- Never amend prior commits
- Never modify TASKS.md, WORKLOG.md, memory/, or anything outside the report dir
- Commit prefix MUST be [claude]
- If any STEP 3/4/5 errors, capture the error message, still complete STEPS 6-8 with partial data, and prefix the commit message with "[claude] PARTIAL: Phase 4 ..."
- Total runtime budget: 5 minutes — if exceeded, skip step 8 (commit) and exit cleanly
```

## ⚠️ Outstanding manual step (2026-05-22)

`RemoteTrigger run` immediately after `create` returned `HTTP 400 github_repo_access_denied — re-authorize GitHub in settings`. The routine cannot fire until GitHub OAuth is re-authorized at the account level.

**To resolve (one-time, ~30 seconds)**:

1. Open <https://claude.ai/code/routines>
2. Click any routine (or the `AgencyOS-RepairCenterPhase4Weekly` entry)
3. Look for a "re-authorize GitHub" prompt or settings link → click through
4. Confirm GitHub permissions for repo `awarewaveai-pei/Work`
5. Back in CLI: `RemoteTrigger` with `action: "run"` + `trigger_id: trig_01JyFw78ZkgwQzpyXXaX1F2K` to verify

After re-auth: scheduled fires on every subsequent Friday will work automatically; manual `run` for ad-hoc testing also works.

**This re-auth likely affects all 4 routines** (DailyBriefing / WeeklyReview / MonthlyReview / new Phase 4). If any of the 3 existing routines have stale `last_fired_at`, they may also have stopped firing — worth checking after re-auth.

## Verification (after GitHub re-auth)

```bash
# 1. Routine listing shows it
/schedule list                  # should include AgencyOS-RepairCenterPhase4Weekly

# 2. Manual trigger (use RemoteTrigger run action)
#    Wait ~2 minutes for completion

# 3. Verify commit landed
git pull origin main
git log --oneline -5            # should show [claude] auto: Phase 4 週巡檢 YYYY-MM-DD — ...

# 4. Verify report file
ls agency-os/reports/repair-center/    # should contain phase4-LATEST.md + phase4-YYYY-MM-DD.md

# 5. Verify watchdog clear
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\system-health-check.ps1
# Should now show: "Phase 4 weekly report freshness — Pass: True — 0d old (routine AgencyOS-RepairCenterPhase4Weekly)"
```

## Watchdog (auto)

`scripts/system-health-check.ps1` §11 (added 2026-05-22) checks `phase4-LATEST.md` mtime:

| State | Watchdog message |
|---|---|
| File missing | WARN: report file missing — routine never ran or path wrong |
| Age ≤ 8 days | `${N}d old (routine AgencyOS-RepairCenterPhase4Weekly)` (PASS) |
| Age > 8 days | WARN: ${N}d old (max 8d) — routine may have stopped firing |
| Layout drift (no agency-os/) | Skipped: monoRoot layout drift |

AO-RESUME / AO-CLOSE surface this WARN automatically. Watchdog uses `[Math]::Floor` (not `[int]`) to avoid banker's-rounding off-by-12h on the staleness boundary.

## Rollback

| Scenario | Action |
|---|---|
| Disable temporarily | `RemoteTrigger update trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K body={"enabled":false}` |
| Re-enable | same but `"enabled":true` |
| Delete routine | <https://claude.ai/code/routines> → routine → Delete (no CLI delete supported) |
| Routine misbehaving (writing wrong files / spamming) | Disable via RemoteTrigger update first; investigate via web UI transcript; commit fixes here; update via RemoteTrigger; re-enable |
| Revert a bad commit by the routine | `git revert <sha>` then disable routine until prompt fixed |

## Update flow (if prompt needs change)

1. Edit the prompt body in this file (the fenced code block under "Routine prompt")
2. `RemoteTrigger update trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K body={"job_config": {"ccr": {"events": [{"data": {"uuid": "<new-uuid>", "session_id": "", "type": "user", "parent_tool_use_id": null, "message": {"role": "user", "content": "<new-prompt-text>"}}}], "session_context": {...same as before...}, "environment_id": "env_01WybafvBbrm4WQXjntcvynp"}}}`
3. Verify with `RemoteTrigger get trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K`
4. Commit the SSOT update with link to actual API call

## Related

- Fallback (manual run): `scripts/phase4-weekly-check.ps1` — kept as belt-and-suspenders backup
- Watchdog: `scripts/system-health-check.ps1` §11
- Forensic + design rationale: `agency-os/WORKLOG.md` 2026-05-22 entry
- Pattern doc: `agency-os/automation/claude-routines/README.md`
- Sibling routines (same pattern, different schedule): `AgencyOS-DailyBriefing` (`trig_01XoSCqJQu6DDKVJw6Lvobpd`), `AgencyOS-WeeklyReview` (`trig_01WanBfvAZvx5TR8xAXjxKVp`), `AgencyOS-MonthlyReview` (`trig_01GWG3NQSPm7SbRdJAN25QdM`)
- Lesson saved: `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`
