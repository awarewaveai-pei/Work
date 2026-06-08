---
name: feedback_aoresume_execution_discipline
description: "AO-RESUME must run clean — fix root not shortcut, integrate-before-edit, never delete operator signal files, no Windows/PS low-level slips"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 809c8660-2c09-4860-96e4-16ab1de43dcb
---

2026-06-02: An AO-RESUME turned into a multi-hour mess. Operator (justifiably furious) demanded it never run like that again.

**Why it went wrong:** I acted before understanding (R0 skipped), reached for `.gitignore` to silence a symptom instead of fixing the writer, edited the wrong copy of a duplicated script, deleted a real signal file as "test cleanup", and hit avoidable low-level slips. The clunky execution — not the final result — is what burned the operator's time and trust.

**How to apply (next AO-RESUME and any core-script work):**
- **Root cause of the recurring divergence is now fixed** (commit `a205499`): `system-guard.ps1` only rewrites the git-tracked `LAST_SYSTEM_STATUS.md` when meaningful status changes, so the working tree is no longer dirty at every session start. Next AO-RESUME should be a clean fast-forward. If divergence recurs, **integrate first**: `git reset --hard origin/*` is harness-DENIED (settings.json:287) — give the operator the one exact command to paste, don't thrash.
- **Never reach for ignore/workaround to mute a symptom.** Fix the writer / root. `ignore` of a tracked file silently deletes shared state.
- **R0 before touching core scripts.** Verify *which copy actually runs*: `scripts/` (CLAUDE.md canonical) vs `agency-os/scripts/` have ~20 drifted duplicate core scripts; the daily scheduled task runs the `agency-os/` copy. (wrapper-ization tracked in TASKS.) See [[feedback_read_before_recommend]].
- **Never delete operator signal/flag files** (e.g. `agency-os/ALERT_REQUIRED.txt`). They are the operator's signal, not my test artifact. Test scaffolding goes in `d:/tmp` and only THOSE get cleaned up.
- **Windows low-level slips to avoid:** Bash mangles backslash paths (`d:\tmp` → `d:tmp`) — always forward slashes. Never embed a literal BOM byte in a `.ps1` regex — use `.TrimStart([char]0xFEFF)` or `﻿`. Don't name test functions `H`/`h` (collides with `Get-History` alias → false-positive tests).

Related: [[feedback_test_review_default]] [[feedback_git_log_before_edit]] [[feedback_no_constant_allow]]
