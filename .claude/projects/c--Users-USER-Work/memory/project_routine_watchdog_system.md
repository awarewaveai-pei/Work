---
name: project-routine-watchdog-system
description: "3-layer alert system (2026-06-06) watching the 4 Claude cloud routines; don't rebuild it; routine sources MUST be awarewaveai-pei/Work"
metadata: 
  node_type: memory
  type: project
  originSessionId: 67b8f6a1-fe4a-4954-97e7-d8f65319ee72
---

Built 2026-06-06 after the Phase4/Weekly/Monthly cloud routines' `sources` silently drifted to a now-deleted **public** repo `peijingartstudio-pei/Work` (should be private `awarewaveai-pei/Work`) — reports stopped landing for weeks with no detection. **Fixed all 3 routine sources via `RemoteTrigger update`** (full job_config resend — partial patch 400s; the prompt is preserved).

**3 independent alert legs (any one failing / user not booting still notifies):**
1. **AO-RESUME (boot)** — `scripts/check-routine-freshness.ps1` → `reports/status/routine-freshness-LATEST.md`, wired into `ao-resume.ps1`.
2. **AO-CLOSE (health gate)** — `scripts/system-health-check.ps1` §11 `$routineOutputs` (now 3 routines, not just Phase4).
3. **Always-on Telegram** — `scripts/routine-output-watchdog.sh` on SG cron `17 7 * * * LC_ALL=C.UTF-8 ...`; reads report freshness via `git log`, state-file dedup, bilingual (see [[reference-cjk-bash-cron-encoding]]).

**Don't rebuild this.** To add/remove a watched routine, sync the routine list in all 3 scripts (the runbook §6 lists them). Maintenance manual: `runbooks/自動排程監控與手機Telegram警報-維護手冊.md`. Plain-language summary for the owner: `agency-os/reports/2026-06-06-做了三件事-警報安全強化-修好自動報告-加裝手機通知.md`.

**Gotchas:** manual `RemoteTrigger run` fails `github_repo_access_denied` (platform limit on the manual path; scheduled runs are unaffected — DailyBriefing proves it). No mechanical check that live routine `sources` == doc SSOT (symptom layer covers it; root-cause check needs `RemoteTrigger list`, session-only). Related: [[feedback-operator-zero-memory-automation]].
