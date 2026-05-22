# AgencyOS-RepairCenterPhase4Weekly

## Metadata

| Field | Value |
|---|---|
| **Name** | `AgencyOS-RepairCenterPhase4Weekly` |
| **Routine ID** | _(populate after web-UI creation; format: `trig_01...`)_ |
| **Cron** | `0 14 * * 5` (Friday 14:00 TPE) |
| **Model** | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| **Repo** | `awarewaveai-pei/Work` |
| **Branch pushes** | Unrestricted (must enable in web UI — routine writes to `main`) |
| **Owner** | AwareWave Ops |
| **Created** | _(populate after web-UI creation; 2026-05-22 if same-day)_ |
| **Supersedes** | `scripts/phase4-weekly-check.ps1` (kept as manual fallback only) |

## Purpose

Replaces the broken `/phase4-check` slash-command + Windows-Task-Scheduler hybrid that never worked on this developer machine. Runs the same 3 health checks (duplicate auto-repair PRs / needs-human-review backlog / BACKUP_RESTORE_PROOF freshness), writes a report to repo, and notifies via Telegram.

Why replace, not patch: the old design had 3 unreliable triggers (CronCreate 7-day expiry, ghost Windows Task Scheduler entry, broken script). Forensic on 2026-05-22 found **zero reports ever written** despite TASKS.md claiming "Phase 4 已啟動 2026-05-19".

## Environment variables (web UI → routine → Environment)

| Variable | Source | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Vault: `scripts\secrets-vault.ps1 -Action get -Name TELEGRAM_BOT_TOKEN` | 46 chars; format `<bot_id>:<secret>` |
| `TELEGRAM_CHAT_ID` | Vault: `TELEGRAM_ALLOWED_CHAT_IDS` (take the **first** comma-separated value) | 10-digit chat id |

**Security:** never commit values to this file. The values live only in the Anthropic web UI's encrypted environment store + the local vault.

## Web UI setup checklist

Time: ~10 minutes. Do once.

1. Open <https://claude.ai/code/routines>
2. Click **New routine**
3. Fill the form:
   - **Name**: `AgencyOS-RepairCenterPhase4Weekly`
   - **Repository**: `awarewaveai-pei/Work`
   - **Branch policy**: ☑ **Allow unrestricted branch pushes** (required to write `main`)
   - **Model**: Claude Sonnet 4.6
   - **Schedule (cron)**: `0 14 * * 5`
   - **Timezone**: Asia/Taipei (TPE)
4. **Instructions** field: paste the entire **Prompt body** section below (verbatim, including the fenced code block markers if your UI strips them — adjust as needed; the content between the fences is the literal instruction text).
5. **Environment variables** tab: add both vars from the table above. Pull values from vault using the commands listed.
6. **Save**
7. Click **Run now** to dry-run once.
8. Verify:
   - Telegram channel receives a message starting `✅` or `⚠️ Repair Center Phase 4`.
   - `git pull` on your workstation shows a new commit by the routine adding `agency-os/reports/repair-center/phase4-LATEST.md`.
9. **Populate this file's Metadata section** with the routine ID + creation date that the web UI shows, then commit.

## Prompt body

Paste everything between the markers (not including the markers themselves) into the routine's `Instructions` field.

```text
You are AwareWave's Repair Center Phase 4 weekly monitor. Execute the 3 checks below mechanically — no interpretation, no creativity. The repo `awarewaveai-pei/Work` is cloned at your working directory.

REQUIRED ENVIRONMENT VARIABLES:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

If either is unset, continue but skip the Telegram step and note "SKIP_TELEGRAM=missing_env" in the report.

============================================
STEP 1 — Check 1: Auto-repair PR duplicate detection
============================================
Run:
  gh pr list --repo awarewaveai-pei/Work --label auto-repair --state all --limit 30 --json number,title,createdAt > /tmp/check1.json

Parse JSON. For each PR, compute a normalized key:
  - Take title
  - Remove "#NNN" references
  - Collapse whitespace to single spaces
  - Lowercase
  - Truncate to first 40 chars

Group PRs by normalized key. Any group with 2 or more PRs is a duplicate cluster.

Set CHECK1_STATUS:
  - "PASS" if no duplicate clusters
  - "WARNING" if any duplicate clusters
Set CHECK1_DETAIL:
  - "" if PASS
  - "[#X, #Y]: key...; [#Z, #W]: key..." if WARNING (semicolon-separated)

If gh fails (exit != 0 or empty output): CHECK1_STATUS = "SKIP", CHECK1_DETAIL = "gh exit=<code>"

============================================
STEP 2 — Check 2: needs-human-review backlog
============================================
Run:
  gh pr list --repo awarewaveai-pei/Work --label needs-human-review --state open --limit 10 --json number,title,url > /tmp/check2.json

Set CHECK2_STATUS:
  - "PASS" if list is empty
  - "WARNING" if list has any items
Set CHECK2_DETAIL:
  - "" if PASS
  - "#X: title | #Y: title | ..." if WARNING (pipe-separated)

If gh fails: CHECK2_STATUS = "SKIP", CHECK2_DETAIL = "gh exit=<code>"

============================================
STEP 3 — Check 3: BACKUP_RESTORE_PROOF freshness
============================================
Find all files matching pattern: agency-os/tenants/*/BACKUP_RESTORE_PROOF.md
EXCLUDE any path containing the substring "templates" or "template".

For each found file:
  - Read content as UTF-8
  - Find all date matches with regex: \b(20\d\d-\d{2}-\d{2})\b
  - If zero matches: this tenant is stale-with-reason "no parseable date"
  - Else: latest_date = max of matches; age_days = (today UTC - latest_date) in whole days
    - If age_days > 7: tenant is stale-with-reason "${age_days}d (${latest_date})"
    - Else: tenant is fresh

Set CHECK3_STATUS:
  - "PASS" if all tenants fresh
  - "WARNING" if any stale
  - "SKIP" if no files found (suspicious — log "no BACKUP_RESTORE_PROOF.md files matched")
Set CHECK3_DETAIL:
  - "" if PASS
  - "<tenant_slug>: <reason>; ..." for each stale tenant (semicolon-separated)
  - tenant_slug = the parent directory name (e.g., `company-soulful`)

============================================
STEP 4 — Compose overall verdict
============================================
Count statuses among CHECK1, CHECK2, CHECK3:
  - warning_count = number of "WARNING" statuses
  - skip_count = number of "SKIP" statuses

OVERALL:
  - "✅ 全PASS" if warning_count == 0 and skip_count == 0
  - "⚠️ ${warning_count} 項需注意" if warning_count > 0 and skip_count == 0
  - "⚠️ ${warning_count} 項需注意, ${skip_count} 項 SKIP" if both

============================================
STEP 5 — Write report files
============================================
Create directory: agency-os/reports/repair-center (mkdir -p)

Compute timestamp in TPE: e.g., "2026-05-22 14:00"
Compute date string in TPE: e.g., "2026-05-22"

Write the following content to BOTH files:
  - agency-os/reports/repair-center/phase4-LATEST.md
  - agency-os/reports/repair-center/phase4-${date_string}.md

File content (UTF-8 without BOM, LF line endings):
---
# Repair Center Phase 4 週巡檢
- 日期: ${timestamp} TPE
- 觸發: Claude routine AgencyOS-RepairCenterPhase4Weekly
- Check 1 重複修復: ${CHECK1_STATUS}${CHECK1_DETAIL ? " — " + CHECK1_DETAIL : ""}
- Check 2 needs-human-review PR: ${CHECK2_STATUS}${CHECK2_DETAIL ? " — " + CHECK2_DETAIL : ""}
- Check 3 BACKUP_RESTORE_PROOF: ${CHECK3_STATUS}${CHECK3_DETAIL ? " — " + CHECK3_DETAIL : ""}
- 整體: ${OVERALL}
---

============================================
STEP 6 — Send Telegram
============================================
If TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set:

emoji = "✅" if OVERALL starts with "✅" else "⚠️"
short_ts = timestamp in MM/DD HH:MM format

Compose text:
${emoji} Repair Center Phase 4 週巡檢 ${short_ts}
1 重複修復: ${CHECK1_STATUS}
2 needs-human-review: ${CHECK2_STATUS}
3 備份新鮮度: ${CHECK3_STATUS}

詳細: agency-os/reports/repair-center/phase4-LATEST.md

POST to https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage with JSON body:
  {"chat_id": "${TELEGRAM_CHAT_ID}", "text": "<composed text>"}

If POST fails: log error in transcript, continue (do not fail the routine).

============================================
STEP 7 — Commit and push
============================================
Run:
  git add agency-os/reports/repair-center/
  git commit -m "chore(repair-center): Phase 4 週巡檢 ${date_string} — ${OVERALL}"
  git push origin main

If git push fails (e.g., conflict): pull --rebase, retry once, then fail loudly.

============================================
CONSTRAINTS (DO NOT VIOLATE)
============================================
- Only write files inside agency-os/reports/repair-center/
- Never delete any file
- Never amend prior commits
- Never call external services other than:
  - github.com (via gh CLI)
  - api.telegram.org (via curl or equivalent)
- If any STEP errors, capture the error message, still attempt STEPS 5–7 with partial data, and prefix the Telegram text with "❌ Phase 4 部分失敗: <step that errored>"
- Total runtime budget: 5 minutes. If exceeded, abort STEP 7 (commit) and post Telegram with current state + "TIMEOUT" suffix.
```

## Verification

After Web UI Run now completes:

1. **Routine listing**:
   ```bash
   /schedule list
   ```
   Should show `AgencyOS-RepairCenterPhase4Weekly` in the list.

2. **Routine transcript** (web UI):
   - All 7 steps logged
   - No red error indicators
   - Final commit SHA shown

3. **Repo state** (after `git pull origin main`):
   - File exists: `agency-os/reports/repair-center/phase4-LATEST.md`
   - File exists: `agency-os/reports/repair-center/phase4-<YYYY-MM-DD>.md`
   - Latest commit author: your GitHub identity (inherited by routine)
   - Latest commit message: `chore(repair-center): Phase 4 週巡檢 ... — ...`

4. **Telegram channel**: message with ✅ or ⚠️ prefix received within 30 seconds of routine completion.

5. **Local watchdog**:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\system-health-check.ps1
   ```
   Should show new check: `Phase 4 weekly report freshness — PASS — <N>d old`.

## Watchdog (auto)

`scripts/system-health-check.ps1` §11 (added 2026-05-22) checks:

- `agency-os/reports/repair-center/phase4-LATEST.md` mtime
- If `> 8 days` old: WARN (routine likely stopped firing)
- If missing entirely: WARN (routine never ran successfully)
- AO-RESUME / AO-CLOSE surface this WARN automatically

This is the watchdog-of-the-watchdog: if the routine stops, AO-RESUME notices within 8 days.

## Rollback

| Scenario | Action |
|---|---|
| Disable temporarily | Web UI → routine → toggle Active off |
| Delete routine | Web UI → routine → Delete; this file gains `Status: Retired YYYY-MM-DD` header per `claude-routines/README.md` rule |
| Routine misbehaving (writing wrong files / spamming) | Disable in web UI first; investigate via transcript; commit fixes here; re-enable |
| Revert a bad commit by the routine | `git revert <sha>` then disable routine until prompt fixed |

## Related

- Fallback (manual run): `scripts/phase4-weekly-check.ps1` — kept as belt-and-suspenders backup; ran via `/phase4-check` slash command
- Watchdog: `scripts/system-health-check.ps1` §11
- Forensic context: `agency-os/WORKLOG.md` 2026-05-22 entry
- Pattern doc: `agency-os/automation/claude-routines/README.md`
