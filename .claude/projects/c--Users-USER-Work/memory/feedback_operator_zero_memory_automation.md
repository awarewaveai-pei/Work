---
name: operator-zero-memory-automation
description: "Operator-facing features must require ZERO command memorization. Slash commands + trigger rules ≠ automation; they require the operator to start a Claude session and remember the keyword. True automation = system surfaces the result during an already-running flow (AO-RESUME, AO-CLOSE, Telegram). 2026-05-23 lesson from B-Minimal auto-reboot session."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d574b37b-fcdc-468c-accb-147aa2d238b4
---

# Operator zero-memory automation

**Rule**: When building any operator-facing feature, ask: **"Does the operator need to remember anything (command name, trigger keyword, file path) to see the value?"** If yes, it's NOT automation — it's a documented tool. True automation surfaces itself during an already-running flow.

**Why**: 2026-05-23 B-Minimal auto-reboot session — I built `/auto-reboot-status` slash command + AGENTS.md trigger rule for "16h escalation". User pushed back hard:
> 「我不會知道要問這個阿」(I won't know to ask)
> 「收 Telegram reboot 告警 → AGENTS.md trigger rule 自動跑診斷, 這是自動化嗎?」(Is this automation?)
> 「我連 '接手新 VPS' 是什麼都不知道」(I don't even know what 'onboarding new VPS' means)

She was right. Slash commands only help **IF** the operator:
1. Knows the command exists
2. Remembers the name
3. Decides to invoke it at the right moment

For an operator with ADHD / many concurrent contexts / "I just want things to work" expectations, **every requirement to remember = a guaranteed gap**.

**How to apply**:

When designing operator-facing health monitoring / diagnostic / status features:

1. **First check existing forcing functions**:
   - `ao-resume.ps1` runs at every session start; reads `agency-os/reports/status/*-LATEST.md` files
   - `system-health-check.ps1` runs as part of AO-CLOSE gate
   - Telegram bot pushes alerts to phone
   - These already happen WITHOUT operator effort

2. **Wire your new check into one of them**:
   - Pattern (3 instances confirmed 2026-05-23): write `scripts/check-X.ps1` that SSHes/queries and writes `agency-os/reports/status/X-LATEST.md` + `.json`; add auto-call block to `scripts/ao-resume.ps1` next to `check-backup-health.ps1` / `check-cloudflare-security.ps1` / `check-vps-auto-reboot-health.ps1`
   - AGENTS.md trigger rule: AO-RESUME 七段式 must read the LATEST.md and surface non-PASS verdicts
   - See `runbooks/ADD-PERIODIC-HEALTH-CHECK.md` for the full 3-step recipe

3. **Slash command / runbook are SECONDARY** — only for ad-hoc re-runs (operator already in IDE wants to recheck immediately). They are NOT the primary delivery mechanism.

4. **Subagent / Skill / Routine** considerations:
   - Subagent: only if multi-step interactive task; avoid if the work is a single check or single edit
   - Skill (auto-trigger on keywords): only if natural language triggers exist; "check X status" type things rarely have such triggers
   - Routine (cron-scheduled Claude routine): only if the check needs to happen outside a human-driven session; periodic but operator-invisible until something WARN is best done via system-health-check / AO-CLOSE / Telegram alerting

**Anti-pattern (what I did and got called out for)**:

- Built `/auto-reboot-status` + memory entry + AGENTS.md trigger rule
- Claimed "30-year solved"
- Did NOT wire into AO-RESUME → operator never sees it unless they think to ask

**Corrected pattern (post-pushback)**:

- Added `scripts/check-vps-auto-reboot-health.ps1` that writes `auto-reboot-LATEST.md`
- Wired into `ao-resume.ps1` next to existing companions
- AGENTS.md trigger rule: AO-RESUME **must read** LATEST.md
- Slash command remains for ad-hoc re-checks; not the primary surface

**Related memories / docs**:
- [[project-vps-auto-reboot]] — the system this lesson came from
- [[feedback-test-review-default]] — same principle in test territory ("verify it actually fires, not just exists")
- `runbooks/ADD-PERIODIC-HEALTH-CHECK.md` — the codified pattern

**30-year value**: Future Claude sessions designing operator-facing features will read this first. Saves the operator from re-pushing-back the same critique. Compounds over hundreds of monitoring decisions.
