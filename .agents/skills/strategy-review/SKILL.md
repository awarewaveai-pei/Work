---
name: strategy-review
description: |
  Multi-angle strategic decision review for non-engineering choices (tool selection,
  client engagement, business strategy, vendor selection, integration decisions).
  Spawns parallel subagents to deliver four-role collaboration, red-blue debate,
  or pre-mortem analysis. Outputs a tracked decision record with promotion path
  to ADR. Trigger on "策略審查", "決策審查", "幫我從多角度想", "紅藍隊", "壓力測試",
  "pre-mortem", "事前驗屍", "should I", "要不要", "值不值得", "strategy review".
schema_version: 1
status: active
owner: agency-os
last_reviewed: 2026-05-07
deprecated: null
replaces: null
replaced_by: null
---

# Strategy Review

Turn an ambiguous strategic question into a structured decision record produced by **independent parallel subagents** representing different thinking modes.

**Scope** (what this skill *is* for):
- Should I adopt tool X / integrate framework Y?
- Should I take this client / launch this product line?
- Should I migrate from A to B / build vs. buy?
- Should I commit to this engagement / partnership?

**Out of scope** (use other skills):
- Engineering feature design → use [feature-plan](../feature-plan/SKILL.md)
- Code review / security audit → use `critic` / `vuln-verifier` subagents
- Bug investigation → use `debugger` subagent
- Architectural ADR drafting (when decision is *already made*) → write ADR directly per [ADR_INDEX](../../../agency-os/docs/architecture/decisions/ADR_INDEX.md)

---

## Pre-flight

Before invoking, confirm:

1. **The question is strategic, not tactical.** "Should I refactor this function?" → no. "Should I rewrite the entire ops console in Next.js 15?" → yes.
2. **The user has stated stakes.** If not, ask one question: "What's the cost of being wrong?"
3. **Existing context is loaded.** Read these if relevant:
   - `agency-os/AGENTS.md` (operating rules)
   - `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` (long-term constraints)
   - `agency-os/docs/architecture/decisions/ADR_INDEX.md` (prior decisions to respect)
   - `agency-os/memory/CONVERSATION_MEMORY.md` (project-level context)
   - `agency-os/reports/strategy-review/INDEX.md` (prior strategy reviews; never repeat without acknowledging)

---

## Mode selection

Ask the user (or infer from phrasing):

| Mode | When to pick | File |
|------|-------------|------|
| **1. Four-Role Collaboration** | Exploratory, want to surface unknowns, decision still fluid | [modes/01-four-role-collaboration.md](modes/01-four-role-collaboration.md) |
| **2. Red-Blue Debate** | Decision tentatively made, want pressure-test before commit | [modes/02-red-blue-debate.md](modes/02-red-blue-debate.md) |
| **3. Pre-Mortem** | Decision likely irreversible, must imagine failure modes from future | [modes/03-pre-mortem.md](modes/03-pre-mortem.md) |

**Default**: if user is unsure, run **Mode 1** first (lowest commitment, broadest surface).

You may run modes **sequentially** for high-stakes decisions: Mode 1 → Mode 2 → Mode 3 (full battery).

---

## Execution contract

Every mode must follow this contract:

### 1. Frame the decision

Use the [problem-framing](#problem-framing-template) template below. Required fields: `goal`, `constraints`, `obstacles`, `reversibility`, `cost_of_being_wrong`. If any field is missing, ask the user one focused question.

### 2. Spawn independent subagents

Use the **Agent tool** with `subagent_type: "general-purpose"`. Each role runs in **its own context** — this is the architectural reason this skill is more reliable than single-prompt role-play.

**Contract for each spawned subagent**:
- Pass the role file (`roles/{role}.md`) content as the system context for that subagent
- Pass the framed decision as the input
- Require structured output: `findings[]`, `bias_check`, `confidence (1-5)`, `must_investigate[]`
- Hard limit: 400 words per subagent response
- All role subagents must be spawned **in parallel** (single message, multiple Agent calls)

### 3. Synthesize

Aggregate subagent outputs into a **Decision Record** using [templates/decision-record.md](templates/decision-record.md). The synthesis must include:
- **Convergence**: where do roles agree? (high-confidence findings)
- **Divergence**: where do they conflict? (must be reconciled, not averaged)
- **Bias audit**: union of all `bias_check` outputs
- **Recommendation tier**: `proceed` / `proceed-with-modifications` / `defer-pending-investigation` / `reject`
- **Action triage**: 立即執行 / 待決定 / 觀望

### 4. Output

Write the decision record to:
```
agency-os/reports/strategy-review/YYYY-MM-DD-{slug}.md
```

Where `{slug}` is a kebab-case 3-5 word summary (e.g., `adopt-hermes-agent`, `selfhost-trigger-dev`).

Then append one line to `agency-os/reports/strategy-review/INDEX.md`:
```
| YYYY-MM-DD | {slug} | {mode} | {recommendation_tier} | [link](YYYY-MM-DD-{slug}.md) |
```

### 5. Hand off

End the conversation turn with:
1. **Path to the decision record**
2. **WORKLOG snippet** (one line, ready for AO-CLOSE to copy into `WORKLOG.md`)
3. **Promotion check**: if recommendation is `proceed` AND change is in CHANGE_IMPACT_MATRIX scope (manifest, identity, data SoR, MCP routing, tenant model), suggest promoting to a numbered ADR via existing flow

---

## Problem-framing template

Before spawning subagents, fill in:

```yaml
question: "<one sentence — what is the user actually deciding?>"
goal: "<concrete, measurable, time-bound>"
constraints:
  - "<immutable boundary>"
  - "<resource limit>"
obstacles:
  - "<what blocks the goal>"
reversibility: low | medium | high
cost_of_being_wrong: "<what does failure look like in $ / time / opportunity?>"
prior_attempts: "<what has been tried; ignore if none>"
relevant_adrs: "<links if existing ADRs constrain this>"
stakeholders: "<who is affected; default: just the user>"
```

If `reversibility: low` AND `cost_of_being_wrong: low` → recommend skipping this skill entirely. Just decide.

---

## Demo / training / non-decisive runs

If the user's intent is to **test the skill** (skill demo, dry-run, training), or to **explore a hypothetical** without committing, you may proceed with assumed values for missing framing fields, BUT must:

1. **Mark each assumed field** with `(assumed; demo run)` or `(assumed; not operator-stated)` in §2 Framing of the decision record
2. **Prepend §8 Verdict** with: "This was a non-decisive run. Final adoption requires the operator to confirm: <list of assumed fields>"
3. **Recommendation tier ceiling**: `proceed-with-modifications` or `defer-pending-investigation`. Never `proceed` outright when key framing fields are assumed
4. **List assumptions as preconditions**: any assumed field becomes a `Required precondition` in §8

Triggers for "demo / training" mode:
- `TASKS.md` item explicitly references skill demo / 試跑 / dry-run
- User says "test the skill", "dry run", "練習", "demo", "驗證 skill 機制"
- Decision is hypothetical (about a tool/option not yet under operator commitment)

Outside these triggers, `cost_of_being_wrong` unstated still requires **stop and ask**.

When the run *is* a demo, also write a §13 "DoD verification" section in the decision record listing which DoD criteria the demo was meant to verify and whether each PASSED — this is the operator's audit trail that the skill mechanism (not the recommendation) was the actual subject of evaluation.

---

## Adding / removing modes (extension protocol)

To add a new mode (e.g., `04-bayesian-update.md`):
1. Create `modes/04-bayesian-update.md` following the structure of existing modes
2. Add a row to the **Mode selection** table above
3. Set `schema_version: 1` in the frontmatter
4. Run `/verify` to confirm no conflicts

To deprecate a mode:
1. Set `status: deprecated` and `replaced_by:` in the mode file's frontmatter
2. Keep the file (don't delete) for 1 year after deprecation, for audit trail
3. Remove the row from the **Mode selection** table
4. Note in INDEX.md why deprecated

Same protocol for `roles/`.

---

## Constraints (do NOT break)

- **Never edit production code** as part of a strategy review. This skill produces decisions, not implementations.
- **Never write to `agency-os/WORKLOG.md` or `agency-os/TASKS.md` directly.** Hand off snippets to the AO-CLOSE flow.
- **Never write to `agency-os/docs/architecture/decisions/`.** Strategy reviews live in `reports/strategy-review/`. ADRs are promoted manually with a separate decision.
- **Never run `git commit` or `git push`.** User commits at AO-CLOSE.
- **Never include secrets, tokens, or PII** in decision records. Redact if sources contain them.
- **Never bypass the parallel subagent contract.** If single-prompt feels easier, that's the failure mode this skill prevents.

---

## Gotchas

- If the user's question is actually engineering (e.g., "should I use Zustand or Redux?"), redirect to `feature-plan` — strategy-review is heavyweight overkill for code-internal choices.
- If subagent outputs all converge with identical framing, suspect role contamination — check that each role file was passed independently.
- If `cost_of_being_wrong` is unstated, **stop and ask**. The whole skill is calibrated by stakes.
- For decisions that touch CHANGE_IMPACT_MATRIX-listed files, the synthesis MUST cite which docs would need to update if `proceed` is chosen.
- For decisions involving Lobster Factory routing, the synthesis MUST cross-check `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` (normative).
- For decisions involving 30-year stability, the synthesis MUST cite `docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` non-negotiable principles.

---

## Related

- [README.md](README.md) — architecture + extension/deprecation guide
- [modes/](modes/) — three review modes
- [roles/](roles/) — four thinking roles
- [templates/decision-record.md](templates/decision-record.md) — output format
- [/strategy-review](../../commands/strategy-review.md) — slash command wrapper
