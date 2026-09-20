---
name: strategy-review
description: Multi-angle strategic review for a NON-engineering decision (tool selection, client engagement, vendor choice) via four-role collaboration, red-blue debate, or pre-mortem. Outputs a tracked decision record. Trigger on 策略審查, 紅藍隊, pre-mortem, 值不值得.
argument-hint: <the decision to review>
---

Trigger the **strategy-review** skill for a multi-angle strategic decision review.

This is the slash-command entry point for `.claude/skills/strategy-review/SKILL.md`. The skill itself contains all execution logic; this file just documents how operators invoke it.

## Usage

Type `/strategy-review` followed by the decision question, or trigger via natural language:

- "幫我策略審查 should I adopt Hermes Agent"
- "/strategy-review 要不要 self-host Trigger.dev"
- "/strategy-review run pre-mortem on the planned 30Y stability hardening rollout"

## What happens

1. Skill loads `.claude/skills/strategy-review/SKILL.md`
2. Skill confirms scope (strategic, not tactical engineering)
3. Skill frames the decision (goal / constraints / obstacles / reversibility / cost-of-being-wrong)
4. User picks mode (or skill recommends): **four-role-collaboration** / **red-blue-debate** / **pre-mortem**
5. Skill spawns parallel `general-purpose` subagents — each gets ONE role file as context (architectural independence)
6. Skill synthesizes outputs into a decision record at `agency-os/reports/strategy-review/YYYY-MM-DD-{slug}.md`
7. Skill appends one line to `agency-os/reports/strategy-review/INDEX.md`
8. Skill provides a WORKLOG snippet for AO-CLOSE

## When to use

| Use it for | Don't use it for |
|------------|------------------|
| Tool / framework adoption ("should I integrate X?") | Code-internal choices ("should I use useState or Zustand?") → use `feature-plan` |
| Vendor / service selection | Bug investigation → use `debugger` subagent |
| Build vs. buy / migrate vs. stay | Code review → use `critic` subagent |
| Client engagement decisions | Already-decided ADR drafting → write ADR directly |
| Significant operational changes | Trivial reversible decisions (just decide) |

## Modes at a glance

- **Four-Role Collaboration**: 4 parallel subagents, exploratory, broadest surface (~3 min)
- **Red-Blue Debate**: adversarial pressure-test of a tentative decision (~5 min, 5 subagents in 3 phases)
- **Pre-Mortem**: future-time failure analysis for irreversible / high-stakes decisions (~4 min, 4 subagents)

For high-stakes irreversible decisions, run all three sequentially.

## Constraints (built into the skill)

- Never edits production code
- Never writes to WORKLOG.md / TASKS.md directly (AO-CLOSE handles)
- Never writes to `agency-os/docs/architecture/decisions/` (ADR promotion is manual)
- Never runs git commit / push
- Never includes secrets / tokens / PII in decision records

## See also

- `.claude/skills/strategy-review/SKILL.md` — full skill definition
- `.claude/skills/strategy-review/README.md` — architecture + extension protocol
- `agency-os/reports/strategy-review/INDEX.md` — historical decisions
- `agency-os/docs/architecture/decisions/ADR_INDEX.md` — promotion target for binding decisions
