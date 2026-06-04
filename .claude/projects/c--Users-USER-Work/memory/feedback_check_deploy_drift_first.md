---
name: When user reports "feature missing on prod", check deploy drift before guessing
description: SG production has dual-directory pattern (git SSOT vs deploy staging) — features can sit in git unmerged-to-staging for days
type: feedback
originSessionId: 4845860f-ee69-4e0f-a113-95f6686c9b87
---
When the user reports a deployed feature is missing or "suddenly disappeared" on `app.aware-wave.com` (or any other lobster-phase1 service), **first check deploy drift, not the git source**.

**Why:** SG VPS uses a two-directory pattern that staged source can drift from git for days without anyone noticing:
- `/root/Work/` — git clone (auto-updates with `git pull`, but is *not* the docker build context)
- `/root/lobster-phase1/apps/<app>/` — actual docker build context (only changes when someone manually syncs from `/root/Work`)

In 2026-05-07 incident, staging was frozen at 2026-04-27 source for 10 days — 19 next-admin commits + 9 workflows commits sat in git but were never deployed. User reported "menu missing" — git source had 7 items, deployed container had 5. No commit removed anything; the new commits simply never reached the build context.

**How to apply:**
1. Run `powershell -ExecutionPolicy Bypass -File .\scripts\check-deploy-drift.ps1` from monorepo root. PASS = aligned. WARN/FAIL = drift exists.
2. If drift confirmed, SSH to SG (`5.223.93.113`, key `~/.ssh/hetzner_trigger`) and run `/root/lobster-phase1/scripts/sg-deploy.sh <app>`.
3. Owner doc: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` §2.1 (sg-deploy.sh).
4. Don't waste time grepping git history for "what was removed" — git rarely is the bug; deployment is.
5. The drift checker is also called from `system-health-check.ps1` §7 (warn-only, won't block AO-CLOSE).
