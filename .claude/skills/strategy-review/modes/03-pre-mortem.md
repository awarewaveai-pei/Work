---
mode: pre-mortem
schema_version: 1
status: active
purpose: Future-time failure mode — imagine the decision has already failed, work backwards from the failure.
when_to_use: Decision is irreversible or high-cost-of-being-wrong; about to commit; need final check.
deprecated: null
based_on: Klein, G. (2007). "Performing a Project Premortem." Harvard Business Review.
---

# Mode 3: Pre-Mortem

Imagine the decision has been made, executed, and **has visibly failed 12 months later**. Work backwards from failure to identify what we should have known *now*.

This mode complements Mode 2 (Red-Blue Debate) by adding a **time dimension**. Red-blue debate finds *contemporaneous* objections; pre-mortem finds *temporal* failure modes — slow drift, accumulated debt, incentive erosion, second-order consequences that take months to materialize.

## When to use this mode

Pick this mode when:
- The decision is **irreversible** or **high-cost-of-being-wrong**
- The user is about to **commit** (signing, deploying, hiring, integrating)
- Mode 1 + Mode 2 have already been run — pre-mortem is the **final gate**
- You suspect the failure mode is **temporal** (drift, debt, lock-in) rather than immediate

Do NOT use when:
- The decision is reversible and low-stakes (overkill)
- The decision has not yet been concretely scoped (use Mode 1 first)

## Required input from main agent

- Framed decision (from SKILL.md §Problem-framing)
- The proposed implementation plan (concrete enough to imagine executing it)
- Outputs from Mode 1 and Mode 2 if available
- The four role files

## Execution

**Phase 1: Failure declaration.** Main agent (no subagent) writes a single paragraph:

> "It is {today + 12 months}. We {executed the decision} {N months ago}. The result is a visible, painful failure. The specific shape of the failure is: ___. The cost we are now paying is: ___."

This is **mandatory framing** — every subagent in subsequent phases works from this declared failure, not from neutral hypotheticals.

**Phase 2: Cause excavation.** Spawn FOUR parallel subagents, one per role. Each receives:
- Their role file (`roles/{role}-thinker.md`)
- The Phase 1 failure declaration
- This directive:

```
The failure has happened. From your role's perspective, what are the 3 most plausible
causes that led here? For each cause:

1. State the cause as a past-tense fact (e.g., "We underestimated X" not "We might underestimate X")
2. Identify the earliest moment we could have seen this coming
3. Identify what evidence we should have collected NOW to detect this risk
4. Rate your confidence this cause was the dominant driver (1-5)

Hard limit: 350 words. Begin directly with cause #1.
```

The framing is critical: **assume failure happened**. This breaks the "but maybe it'll work" instinct that contaminates forward-looking analysis.

**Phase 3: Detection design.** Main agent synthesizes:

1. **Cause ranking**: dedupe causes across roles; rank by union of confidence scores
2. **Top 3 causes**: the failure modes most worth pre-empting
3. **Detection plan**: for each top cause, what **leading indicator** should we monitor that would warn us *before* the failure becomes irreversible?
4. **Kill criteria**: for each top cause, what observable signal would mean "abort the decision"?
5. **Pre-commit checklist**: things to do *now* (before commitment) that would have prevented or detected the failure earlier

**Phase 4: Verdict.** Issue one of:
- `proceed-with-monitoring`: identified failure modes, established leading indicators, kill criteria written
- `proceed-with-modifications`: pre-mortem surfaced changes that must be made to the plan before commitment
- `defer-pending-investigation`: the investigation queue from Phase 3 is too large to commit safely
- `reject`: at least one cause was rated 5/5 confidence by ≥3 roles AND has no plausible detection plan

## Quality bars

The output is **not acceptable** if:
- Subagents wrote in future tense ("we might fail because...") — they violated the framing; re-spawn
- All four roles cite the same dominant cause — suspect framing leakage; re-spawn with sharper role separation
- No leading indicators are identified — failure mode is invisible until catastrophic; this should escalate verdict to `defer-pending-investigation` or `reject`
- Kill criteria are vague ("if it goes badly") — re-spawn detection design with concrete metric requirements

## Run-time budget

- Wall clock: 3-5 minutes
- Total subagents spawned: 4
- This mode is the most expensive cognitively; do not run on low-stakes decisions

## Special: 30-year stability check

If the decision touches anything in `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` §11 (Scalability and 30-Year Stability Rules), the synthesis MUST also include:

- Which of the 6 stability rules does this decision affect? (deterministic entry points / mechanized checks / narrow interfaces / observability / extensibility / deprecation discipline)
- Does the proposed implementation respect each affected rule, or does it carve out an exception? Exceptions must be justified explicitly.

## Exit conditions

After producing the decision record:
- Recommend the user re-read the **kill criteria** before final commitment
- Suggest scheduling a **review checkpoint** at the earliest leading indicator's detection horizon
- For `proceed-with-monitoring`, suggest creating a TASKS.md entry to install the monitoring before execution
- For `reject` after pre-mortem, this is a strong signal — the decision has been pressure-tested through three modes
