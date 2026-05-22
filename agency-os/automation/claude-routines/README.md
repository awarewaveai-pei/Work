# Claude Routines (Anthropic Cloud)

## Purpose

This directory is the **SSOT (Single Source of Truth)** for all Anthropic-hosted Claude routines (scheduled remote agents) owned by AwareWave. Each routine has a source file here that documents its prompt, cron, env vars, repo bindings, web-UI setup, verification, and rollback.

**Why an in-repo SSOT?** Routines themselves live in Anthropic cloud state (per-account, viewable only at <https://claude.ai/code/routines>). Without this directory, every routine is hidden state — un-auditable, un-recoverable on account loss, un-reviewable in PRs. The 2026-05-22 Phase 4 forensic investigation found 3 in-flight routines (`AgencyOS-DailyBriefing`, `AgencyOS-WeeklyBriefing`, `AgencyOS-MonthlyBriefing`) with **zero source in repo**; this directory closes that gap.

## Scope vs sibling directories

| Directory | Scheduling mechanism | Owner |
|---|---|---|
| `agency-os/automation/` (existing) | Windows Task Scheduler (local machine) | Per tenant / per machine |
| `agency-os/automation/claude-routines/` (this dir) | Anthropic cloud cron (always-on) | Whole agency |
| `lobster-factory/packages/workflows/` | Trigger.dev (EU VPS) | Lobster Factory |
| `/root/lobster-phase1/scripts/*.sh` cron | SG VPS local cron (needs SSH) | SG infra |

**Decision rubric** (when adding a new scheduled task):
- Needs SSH or VPS-local file access → SG VPS local cron (DeployDriftCheck pattern)
- Pure GitHub API + HTTP API + filesystem in cloud sandbox → **Claude routine (this dir)**
- Needs TypeScript / Trigger.dev SDK → Trigger.dev
- Needs to run only on a specific user's workstation → Windows Task Scheduler

## File convention

One file per routine: `<routine-name>.md`. Filename mirrors routine `name` field (kebab-case OK; underscore not preferred).

Each file MUST contain (in this order):

1. **Metadata header** — name, ID (after creation), cron expression, model, owner, created date
2. **Web UI setup checklist** — exact steps to reproduce the routine at <https://claude.ai/code/routines>
3. **Prompt body** — verbatim text pasted into the routine's `Instructions` field, in a fenced code block
4. **Environment variables** — list of required env vars + which vault key they come from
5. **Verification** — how to confirm the routine works after creation
6. **Watchdog** — how the system detects this routine has stopped firing (e.g., output mtime check)
7. **Rollback** — exact steps to disable / delete

## Index of routines

| File | Cron (TPE) | Purpose | Status |
|---|---|---|---|
| [`phase4-weekly.md`](phase4-weekly.md) | `0 14 * * 5` (Fri 14:00) | Repair Center Phase 4 weekly check | Pending creation in web UI (2026-05-22) |
| _(backfill)_ `daily-briefing.md` | (TBD) | AgencyOS-DailyBriefing — daily scaffold + open tasks | Backlog: prompt source not yet in repo |
| _(backfill)_ `weekly-briefing.md` | (TBD) | AgencyOS-WeeklyBriefing | Backlog: prompt source not yet in repo |
| _(backfill)_ `monthly-briefing.md` | (TBD) | AgencyOS-MonthlyBriefing | Backlog: prompt source not yet in repo |

## Governance rules

1. **BEFORE designing a new routine, run `RemoteTrigger list` (via `/schedule list`) and inspect 2-3 existing routines' full configs**. Existing instances reveal what auth actually works, what's hardcoded, what env vars are or aren't used. Designing from abstract `/schedule` docs first wastes effort planning around non-existent constraints. Triggered by 2026-05-22 incident where 40 min was wasted designing a Telegram/env-var/web-UI scheme that wasn't needed (existing 3 routines use none). See `~/.claude/projects/d--Work/memory/feedback_inspect_before_design.md`.
2. **Every routine here MUST have a watchdog**. A routine without a way to detect "it stopped firing" violates the 30-year operating discipline. The watchdog is typically a mtime check on a known output file, surfaced via `scripts/system-health-check.ps1` (so AO-RESUME catches it).
3. **Never bake secrets into the prompt body**. If a routine needs secrets, use env vars (set via claude.ai routines web UI). But default to no secrets — git auth is inherited from the claude.ai account; pure git-based routines need nothing else.
4. **Cron minimum interval is 1 hour** (Anthropic platform limit). Sub-hourly tasks must use a different mechanism.
5. **Routines push to `main` by default** (existing 3 routines all do). Per Anthropic docs the default is `claude/*` branches, but our observed behavior on this account is unrestricted main push works. If a routine starts being rejected on main push, document in this README so the next routine author knows.
6. **`RemoteTrigger run` may fail with `github_repo_access_denied` even though `create` succeeded**. Resolution: operator re-authorizes GitHub at <https://claude.ai/code/routines>. This is a per-account state that affects all routines. After re-auth, verify all routines fire correctly.
7. **On routine deletion, leave the source file with a tombstone header** (`Status: Retired YYYY-MM-DD — reason`) for at least 6 months before removing the file. Keeps historical context auditable.

## Related Documents (Auto-Synced)
- `agency-os/automation/README.md` (parent — Windows Task Scheduler automation)
- `agency-os/docs/operations/LONG_TERM_OPERATING_DISCIPLINE.md`
- `agency-os/WORKLOG.md` (2026-05-22 — Phase 4 routine creation + this directory establishment)
