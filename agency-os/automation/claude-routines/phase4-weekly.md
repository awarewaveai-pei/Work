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
| **Prompt 內含邏輯** | **無**（2026-08-26 起）。所有檢查在 `scripts/phase4-checks.py`；prompt 只負責 pull → 跑 → commit |

## Design decisions

Followed the **existing 3-routine pattern** (DailyBriefing / WeeklyReview / MonthlyReview) discovered via `RemoteTrigger list`:

- **No env vars** — git auth inherited from claude.ai account; nothing else needed
- **No Telegram notification** — existing routines just `commit + push`; the watchdog (mtime check in `system-health-check.ps1` §11) + the visible `[claude] auto: Phase 4 週巡檢ㄚ ...` commit message are the observability signal
- **No web UI step required** — full CLI creation via `RemoteTrigger create`

Earlier draft of this file included an elaborate Telegram + env var + web UI checklist — that was based on abstract `/schedule` docs research before inspecting existing routines. Lesson saved at `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`.

## Purpose

Replaces the broken `/phase4-check` triple-trigger design (CronCreate 7-day expiry / non-existent Windows Task Scheduler / Big5-broken script) discovered to have never run on 2026-05-22. Runs the same 3 health checks (duplicate auto-repair PRs / needs-human-review backlog / BACKUP_RESTORE_PROOF freshness).

## 已退役的 routine prompt（2026-05-22 部署 → 2026-08-26 退役）

> **保留原因＝rollback 正本。** 不要刪、不要「順手更新」它。
> 實際部署過的版本 ＝ **下面這個區塊** ＋ **本檔 §CHECK 4 的 `5b.` 區塊插在 STEP 5 與 STEP 6 之間**
> （另外 STEP 6/7 與 RULES 各有一處把 `CHECK1/2/3` 讀成 `CHECK1/2/3/4`、多一行 Check 4 報告列、
> `STEP 3/4/5` 讀成 `STEP 3/4/5/5b`）。要回滾就照這個組法貼回 `RemoteTrigger update`。
>
> **為何退役**：這段散文規格是「同一份規格寫兩次」的其中一份，另一份是 `phase4-weekly-check.ps1`。
> 兩份已經分叉過一次 —— CHECK 4 於 2026-05-23 只加進這裡，`.ps1` 三個月不知道它存在。
> 而且散文規格**無法在本機驗證**，只能等每週五開火才知道對不對。


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

            Sub-checks 3B-3D (automated backup freshness / last outcome / truth source moving):
              NOT run here since 2026-10-25. The live status stays on the host (ks-aw-01 /var/lib/awarewave/backup-status/<slug>.json) and the
              host judges it daily (scripts/sync-backup-status-from-mainwp.sh -> phase4-checks.py --judge-backup-json);
              a warning turns /ops/schedules row backup_status_sync red and pushes. The repo BACKUP_AUTO_STATUS.json is
              static config (mainwp_site_id), not status. Report the line "3B-3D: judged on the host".

            tenant verdict = WARN if 3A WARN, else PASS

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

## Routine prompt（**現行**，2026-08-26 部署）

> **這段刻意不含任何檢查邏輯。** 檢查全部在 `scripts/phase4-checks.py`，本機 fallback
> `scripts/phase4-weekly-check.ps1` 呼叫同一支。**以後要新增／調整檢查，改那個 `.py` 就好，
> 不需要再動 `RemoteTrigger update`** —— 那一步是整條流程最容易失敗的環節（2026-05-22 認證事故）。
>
> 這樣改的直接理由：`CHECK 4` 曾經只加進 prompt、沒加進 `.ps1`，兩顆偵測器分叉了三個月沒人發現。
> 規格寫兩份就一定會分叉；散文規格還有第二個毛病 —— **只能等每週五開火才知道對不對**。
> 現在 `python3 scripts/phase4-checks.py --selftest` 隨時可跑（15 個真實檔案 fixture / 19 條斷言），含「真逾期仍要 WARN」。

```text
You are AwareWave's Repair Center Phase 4 weekly monitor.

You do NOT evaluate anything yourself. scripts/phase4-checks.py in the repo is the single
implementation of every check (it is shared with the manual fallback
scripts/phase4-weekly-check.ps1). Your job is: run it, commit what it wrote, and make any
failure loud. Do not re-interpret, summarise, or "fix up" its verdicts.

The repo awarewaveai-pei/Work is cloned at your working directory.

STEPS:

1. Run: git pull origin main

2. Compute:
   date_string = $(TZ=Asia/Taipei date +%Y-%m-%d)
   timestamp   = $(TZ=Asia/Taipei date '+%Y-%m-%d %H:%M')

3. Run the checker. It writes BOTH report files itself:
     agency-os/reports/repair-center/phase4-LATEST.md
     agency-os/reports/repair-center/phase4-${date_string}.md

   python3 scripts/phase4-checks.py --format report --write \
     --timestamp "${timestamp}" \
     --trigger "Claude routine AgencyOS-RepairCenterPhase4Weekly" \
     > /tmp/phase4.out 2> /tmp/phase4.err
   rc=$?

4. Treat ALL of the following as failure: rc != 0, OR python3 not on PATH, OR
   scripts/phase4-checks.py missing, OR agency-os/reports/repair-center/phase4-LATEST.md
   is empty/absent after step 3.

   On failure: do NOT invent a verdict and do NOT leave the previous report in place --
   a stale report would be read as a fresh healthy run. Set REASON to the first 300
   characters of /tmp/phase4.err (or "python3 not available" / "phase4-checks.py missing"),
   write the following to BOTH report paths (UTF-8 without BOM, LF line endings):

   # Repair Center Phase 4 週巡檢
   - 日期: ${timestamp} TPE
   - 觸發: Claude routine AgencyOS-RepairCenterPhase4Weekly
   - Check 1 重複修復: SKIP — REASON
   - Check 2 needs-human-review PR: SKIP — REASON
   - Check 3 租戶備份健康: SKIP — REASON
   - Check 4 VPS auto-reboot SSOT: SKIP — REASON
   - 整體: ⚠️ 0 項需注意, 4 項 SKIP

   and prefix the STEP 5 commit message with "[claude] PARTIAL: " instead of "[claude] auto: ".

5. Commit and push:
   OVERALL=$(grep '^- 整體: ' agency-os/reports/repair-center/phase4-LATEST.md | sed 's/^- 整體: //')
   git add agency-os/reports/repair-center/
   git commit -m "[claude] auto: Phase 4 週巡檢 ${date_string} — ${OVERALL}"
   git push origin main
   If push fails (conflict): run git pull --rebase origin main, then retry push once.
   If it still fails, exit reporting the error.

RULES:
- Never edit scripts/phase4-checks.py from this routine. If a verdict looks wrong, that is a
  bug to surface in the report, not to correct here.
- Only write inside agency-os/reports/repair-center/
- Never delete files. Never amend prior commits.
- Never modify TASKS.md, WORKLOG.md, memory/, or anything outside the report dir.
- Commit prefix MUST be [claude]
- Total runtime budget: 5 minutes — if exceeded, skip the commit and exit cleanly.
```

### 這段 prompt 唯一的執行期依賴：`python3`

雲端容器有沒有 `python3` 無法離線證實（本機 3.12.10 ✅、EU 已用 python3 ✅、雲端 ❓）。
所以 STEP 4 把「跑不起來」明確定義成四項全 `SKIP` 並寫進報告本體 —— **吵、可見、可回滾**，
不會靜默長得像健康。首次開火（2026-08-28 06:00 UTC）讀 `phase4-LATEST.md` 即可確認。

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
| **回滾 2026-08-26 的 prompt 改版** | `RemoteTrigger update` 貼回 §已退役的 routine prompt 那個區塊 ＋ §CHECK 4 的 `5b.` 區塊（組法見該節說明）。**同時**要把 tenant frontmatter 一起 revert —— 舊 prompt 讀 `restore_drill_due_after`，新 frontmatter 沒有那個鍵，兩者混用時 3A 會靜默消失（2026-08-26 實測） |

## Update flow (if prompt needs change)

1. Edit the prompt body in this file (the fenced code block under "Routine prompt")
2. `RemoteTrigger update trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K body={"job_config": {"ccr": {"events": [{"data": {"uuid": "<new-uuid>", "session_id": "", "type": "user", "parent_tool_use_id": null, "message": {"role": "user", "content": "<new-prompt-text>"}}}], "session_context": {...same as before...}, "environment_id": "env_01WybafvBbrm4WQXjntcvynp"}}}`
3. Verify with `RemoteTrigger get trigger_id=trig_01JyFw78ZkgwQzpyXXaX1F2K`
4. Commit the SSOT update with link to actual API call

## CHECK 4 — VPS auto-reboot SSOT integrity（2026-05-23 部署；2026-08-26 起邏輯已移入 `phase4-checks.py`）

> 本節自 2026-08-26 起為**歷史紀錄 ＋ rollback 素材**：下面那段 `5b.` prompt 文字已不在部署中，
> 檢查本身改由 `scripts/phase4-checks.py` 的 `check_auto_reboot_ssot()` 執行（同一組 3 個路徑）。
> 設計理由（為何簡化成 `test -f`）仍然成立，保留。

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

- **CHECK 3B-3D**: `scripts/sync-backup-status-from-mainwp.sh` (ks-aw-01 host cron `backup_status_sync`, 01:11 UTC) merges the MainWP DB `report_addon` into ks-aw-01 /var/lib/awarewave/backup-status/<slug>.json and judges it there (2026-10-25: the host cannot push, and status belongs where it is produced). Before this existed (pre-2026-06-08) the JSON was hand-synced and lagged, causing false "backup Nd stale" WARNs — always VBC-verify against the DB before treating a 3B WARN as a real backup outage.
- Fallback (manual run): `scripts/phase4-weekly-check.ps1` — kept as belt-and-suspenders backup
- Watchdog: `scripts/system-health-check.ps1` §11
- VPS auto-reboot SSOT: `lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf`
- VPS auto-reboot runbook: `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`
- Forensic + design rationale: `agency-os/WORKLOG.md` 2026-05-22 entry + 2026-05-23 B-Minimal entry
- Pattern doc: `agency-os/automation/claude-routines/README.md`
- Sibling routines (same pattern, different schedule): `AgencyOS-DailyBriefing` (`trig_01XoSCqJQu6DDKVJw6Lvobpd`), `AgencyOS-WeeklyReview` (`trig_01WanBfvAZvx5TR8xAXjxKVp`), `AgencyOS-MonthlyReview` (`trig_01GWG3NQSPm7SbRdJAN25QdM`)
- Lesson saved: `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`
