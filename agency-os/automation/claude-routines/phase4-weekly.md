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

5. CHECK 3 — Tenant backup health (frontmatter + auto-status JSON cross-truth):
   Find all files matching pattern: agency-os/tenants/*/core/BACKUP_RESTORE_PROOF.md
   EXCLUDE any path containing substring "templates" or "template".

   For each file:
     a. Parse YAML frontmatter (between top --- and the next ---).
        Required keys: status (one of: active, not-onboarded).
        Optional keys when status=active: restore_drill_due_after (YYYY-MM-DD), last_known_success_utc, truth_source.

     b. Branch on status:

        - status == "not-onboarded":
            tenant verdict = SKIP_NOT_ONBOARDED
            (do NOT count as WARNING; the tenant has not started backup operations yet)

        - status == "active":
            Run two sub-checks; tenant verdict = worst of the two.

            Sub-check 3A (restore drill due):
              parse restore_drill_due_after (YYYY-MM-DD).
              If today_utc > restore_drill_due_after:
                  3A = WARN "restore drill overdue (due ${restore_drill_due_after})"
              Else: 3A = PASS

            Sub-check 3B (automated backup freshness — TRUTH SOURCE):
              expected_json_path = same directory as the .md, file name BACKUP_AUTO_STATUS.json
              If file missing: 3B = WARN "BACKUP_AUTO_STATUS.json missing — no truth source for last backup"
              Else:
                Parse JSON. Read .last_success.unix_utc.
                age_days = (now_utc - unix_utc) / 86400, FLOORED.
                If age_days > 8: 3B = WARN "last success ${age_days}d ago (${.last_success.iso_utc}); over 8d threshold"
                Else: 3B = PASS

            tenant verdict = WARN if either 3A or 3B WARN, else PASS

        - any other status value: tenant verdict = WARN "unknown status frontmatter value: ${status}"

   Aggregate across all tenants:
     CHECK3_STATUS:
       - "PASS" if every tenant is PASS or SKIP_NOT_ONBOARDED
       - "WARNING" if any tenant is WARN
       - "SKIP" if zero .md files found (suspicious — log it)
     CHECK3_DETAIL:
       - "" if PASS or zero WARNs
       - "<tenant_slug>: <reason>; ..." (semicolon-separated for each WARN tenant)
       - tenant_slug = parent directory of /core/ (e.g. company-soulful-expression)
       - Do NOT include SKIP_NOT_ONBOARDED tenants in the detail string (they are silent by design).

   Rationale (do not include in output; for routine author reference):
     - .md frontmatter holds human-curated milestones (restore drill due, onboarding status)
     - .json holds machine-truth (last successful backup task per MainWP DB)
     - Phase 4 cross-checks both so monitoring no longer lags reality
     - .md latest-date-as-freshness-proxy (the old logic) caused false WARNs and was retired 2026-05-22

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

## CLI `RemoteTrigger run` vs scheduled fire — different auth paths (2026-05-22 lesson)

**Symptom**: Immediately after `create`, `RemoteTrigger run` returned `HTTP 400 github_repo_access_denied — re-authorize GitHub in settings`. Re-trying on the **existing** `AgencyOS-DailyBriefing` from the same CLI session returned the same error.

**Wrong initial conclusion** (initially documented here, since corrected): "account-level GitHub OAuth expired; user must re-authorize at <https://claude.ai/code/routines>".

**Actual root cause** (confirmed by inspecting `RemoteTrigger get` data):
- `AgencyOS-DailyBriefing.last_fired_at` was `2026-05-22T00:05:18Z` — only ~8 hours before the failed `run` call. So the routine's auth was working perfectly for scheduled fires.
- The web UI (<https://claude.ai/code/routines>) showed the new routine as `Active` with `Next run 2026-05-29 14:00 TPE` and the repo connected — no re-authorize prompt visible.
- Conclusion: **CLI `RemoteTrigger run` is a different code path than scheduled fires**. The interactive `run` endpoint enforces a fresh OAuth check against the current CLI session; scheduled fires use the routine's stored auth. Stale CLI session token → only `run` (and other write actions?) fail; `get` / `list` / scheduled fires still work.

**Operational implications**:

1. **`RemoteTrigger run` for ad-hoc testing may fail intermittently** when the CLI session is old. To dry-run a routine, prefer either:
   - Re-run after refreshing the Claude Code session
   - Use the "Run now" button in <https://claude.ai/code/routines> (web UI uses its own auth)
   - For Phase 4 specifically: the fallback `scripts/phase4-weekly-check.ps1` is a fully working alternative
2. **Do NOT mistake this for "the routine is broken"**. Look at `last_fired_at` and `next_run_at` via `RemoteTrigger get` to confirm scheduled fires are healthy.
3. **If scheduled fires also stop** (e.g., `last_fired_at` drifts more than one cron interval behind `next_run_at`), THAT's the real auth-expired case and needs the web-UI re-auth.

**Verification of scheduled-fire health for this routine**:

```bash
# Run any time. Should always show next_run_at advancing on every Friday 14:00 TPE.
RemoteTrigger action=get trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K
# Look for fields: last_fired_at (should appear after first fire), next_run_at, enabled.
```

Watchdog (`system-health-check.ps1` §11) catches the no-fire case independently of CLI auth state — if 8+ days pass with no fresh `phase4-LATEST.md`, it WARNs.

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

## CHECK 4 — VPS auto-reboot SSOT integrity (deployed 2026-05-23 12:04 UTC)

**Status**: 🟢 DEPLOYED — `RemoteTrigger update trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K` completed at 2026-05-23T12:04:44Z. First fire with CHECK 4 will be 2026-05-29 06:00 UTC (= 14:00 TPE Friday).

**Goal**: Catch git-level removal of the auto-reboot policy SSOT (conf or runbook), which would silently break the auto-reboot chain even though VPS deployments remain.

**Design rationale — why simplified from original 2026-05-23 proposal**:

Original proposal called the next-admin health endpoint to probe VPS file existence (`auto_reboot.sg/eu` status). Discarded because:
- Routine has no env vars (matches existing 3-routine "no env" pattern)
- `/api/ops/repairs/health` requires `x-ops-proxy-auth` header (nginx Basic Auth boundary)
- Adding `OPS_PROXY_AUTH_TOKEN` to routine env would diverge from `AgencyOS-DailyBriefing` / `WeeklyReview` / `MonthlyReview` pattern, complicating future routine ops

Simplified CHECK 4: `test -f` on 3 SSOT paths in the cloned repo. Zero auth, zero deps, catches the "someone deleted the conf from git" failure mode.

**What CHECK 4 catches** (genuinely complementary to existing monitoring):
- Accidental `git rm` of any of the 3 SSOT files (conf, stagger-eu conf, runbook)
- Branch checkout drift (wrong branch checked out, missing files)
- Repo corruption

**What CHECK 4 does NOT catch** (already monitored elsewhere):
- VPS-level deletion of `/etc/apt/apt.conf.d/52awarewave-auto-reboot` → netdata `system.post_update_reboot_status` will not clear → AGENTS.md 16h escalation rule fires
- `unattended-upgrades` service stopped → same chain
- `Automatic-Reboot-Time` invalid value → apt parses defensively, treats as disabled → same chain

**Deployed prompt block** (verbatim, between STEP 5 and STEP 6 in routine):

```text
5b. CHECK 4 — VPS auto-reboot policy SSOT integrity (added 2026-05-23):
   Verify the policy SSOT files exist in the cloned repo. This catches accidental git-level removal or branch drift that would break the auto-reboot chain.
   Required files:
     - lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf
     - lobster-factory/infra/hetzner-phase1-core/auto-reboot/53awarewave-stagger-eu.conf
     - runbooks/VPS-AUTO-REBOOT-RUNBOOK.md

   For each path, run: test -f "$path" && echo OK || echo MISSING
   CHECK4_STATUS = "PASS" if all 3 are OK; "WARNING" if any MISSING.
   CHECK4_DETAIL = "" if PASS else "missing: <path1>; <path2>" (semicolon-separated).

   Note: this checks the SSOT layer only. Live deployment status is monitored separately by netdata system.post_update_reboot_status alarm + AGENTS.md 16h escalation rule.
```

STEP 6 OVERALL updated to include CHECK4 in `warning_count` + `skip_count` aggregation.
STEP 7 file template adds: `- Check 4 VPS auto-reboot SSOT: ${CHECK4_STATUS}${CHECK4_DETAIL_PREFIXED}`

**Rollback** (if CHECK 4 breaks the routine):
`RemoteTrigger update` with the original 3-check prompt (preserved in earlier git history of this file before commit on 2026-05-23, or retrieve via `RemoteTrigger get` from the previous successful run).

## Incident: AgencyOS-WeeklyReview auto-disabled (2026-05-25)

**What happened**: On 2026-05-25 01:09 UTC, `AgencyOS-WeeklyReview` attempted its Monday scheduled fire and received `auto_disabled_repo_access`. Platform auto-set `enabled=false`. Undiscovered for 10 days.

**Root cause**: 2026-05-22 05:26 UTC, repo flipped PUBLIC→PRIVATE (commit `3abe5e2`, P0 security incident — n8n password rotation). WeeklyReview was authorized when repo was PUBLIC. DailyBriefing (also pre-private) continued firing successfully — theory: daily fires kept the token active; weekly 7-day silence + repo visibility change caused auth failure.

**Fix applied 2026-05-28**: `RemoteTrigger update enabled=true` → HTTP 200, `ended_reason` cleared, `next_run_at: 2026-06-01T01:05 UTC`.

**Remaining risk**: Underlying OAuth token validity unconfirmed. If 2026-06-01 fire auto-disables again → go to `claude.ai/code/routines`, find AgencyOS-WeeklyReview, re-authorize GitHub connection.

**Lesson**: Repo visibility changes can silently break infrequently-firing routines while daily routines survive. After any repo visibility change, check all routines via `RemoteTrigger list` within 24h.

## Related

- **CHECK 3 truth-source writer**: `scripts/sync-backup-status-from-mainwp.sh` (EU VPS, daily cron 01:11 UTC) keeps each active tenant's `BACKUP_AUTO_STATUS.json` (read by CHECK 3 sub-check 3B) in sync with the MainWP DB `report_addon`. Before this existed (pre-2026-06-08) the JSON was hand-synced and lagged, causing false "backup Nd stale" WARNs — always VBC-verify against the DB before treating a 3B WARN as a real backup outage.
- Fallback (manual run): `scripts/phase4-weekly-check.ps1` — kept as belt-and-suspenders backup
- Watchdog: `scripts/system-health-check.ps1` §11
- VPS auto-reboot SSOT: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf`
- VPS auto-reboot runbook: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`
- Forensic + design rationale: `agency-os/WORKLOG.md` 2026-05-22 entry + 2026-05-23 B-Minimal entry
- Pattern doc: `agency-os/automation/claude-routines/README.md`
- Sibling routines (same pattern, different schedule): `AgencyOS-DailyBriefing` (`trig_01XoSCqJQu6DDKVJw6Lvobpd`), `AgencyOS-WeeklyReview` (`trig_01WanBfvAZvx5TR8xAXjxKVp`), `AgencyOS-MonthlyReview` (`trig_01GWG3NQSPm7SbRdJAN25QdM`)
- Lesson saved: `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`
