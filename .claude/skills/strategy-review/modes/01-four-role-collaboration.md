---
mode: four-role-collaboration
schema_version: 1
status: active
purpose: Exploratory mode — surface unknowns, find blind spots, broaden the decision surface.
when_to_use: Decision still fluid; user has not committed; want to discover what they don't know.
deprecated: null
---

# Mode 1: Four-Role Collaboration

Independent thinking from four orthogonal angles. Each role is run in **its own subagent context** so outputs do not contaminate each other.

## When to use this mode

Pick this mode when:
- The user is **exploring**, not committing yet
- The decision space is **wide** (multiple plausible options)
- You want to **find unknowns** rather than validate a known direction
- The cost of asking is low compared to the cost of premature commitment

Do NOT use when:
- The user has already decided and just wants validation → use Mode 2 (Red-Blue Debate)
- The decision is irreversible and high-stakes → use Mode 3 (Pre-Mortem) — or run all three

## Required input from main agent

Pass the framed decision (from SKILL.md §Problem-framing) to each subagent. Plus:
- The four role files at `roles/critical-thinker.md`, `roles/creative-thinker.md`, `roles/communication-thinker.md`, `roles/systems-thinker.md`
- Relevant context: prior ADRs, CHANGE_IMPACT_MATRIX hits, project memory excerpts (no secrets)

## Execution

**Step 1: Spawn four subagents in parallel** (single message, four Agent tool calls):

For each role in `[critical, creative, communication, systems]`:
- `subagent_type: "general-purpose"`
- `description`: `"Strategy review: {role} angle"`
- `prompt`: full content of `roles/{role}-thinker.md` + framed decision + this directive:

```
Produce structured output:

## findings
- finding 1 (max 50 words)
- finding 2 (max 50 words)

## bias_check
Which cognitive biases might be distorting MY OWN analysis above? List 1-3.
(Examples: confirmation bias, anchoring, sunk cost, availability heuristic.)

## confidence
1-5 (1 = pure speculation, 5 = grounded in cited evidence)

## must_investigate
Things I cannot resolve from available context. The main agent should research these
before finalizing. List as actionable questions.

Hard limit: 400 words total. No preamble. Begin with "## findings".
```

**Step 2: Receive all four reports.** Do NOT proceed if any subagent returns malformed output — re-spawn that one role only.

**Step 3: Synthesize.** Produce the decision record at `agency-os/reports/strategy-review/YYYY-MM-DD-{slug}.md` per `templates/decision-record.md`. The synthesis must:

1. **Convergence section**: list findings where ≥3 roles agree. These are high-signal.
2. **Divergence section**: list findings where roles conflict. Reconcile by asking "which role's domain is this *actually* in?" — do not average.
3. **Bias audit**: union of all four `bias_check` outputs, deduplicated, with brief mitigation note.
4. **Investigation queue**: union of all `must_investigate`, prioritized by stakes.
5. **Recommendation tier**: one of `proceed` / `proceed-with-modifications` / `defer-pending-investigation` / `reject`.
6. **Action triage**: split next steps into `立即執行 / 待決定 / 觀望`.

## Quality bars

The output is **not acceptable** if:
- All four subagent reports converge on the same finding with the same framing — suggests context contamination, not independence
- No `must_investigate` items appear — suggests roles are fabricating confidence
- `bias_check` is empty in any role — re-spawn that role
- Recommendation tier is given without naming the dominant uncertainty

## Run-time budget

- Wall clock: 2-4 minutes (4 parallel subagents)
- Token cost: each subagent ≤ 400 words output; main synthesis ≤ 800 words
- If budget overruns, suspect role files are too long or context is bloated — trim before retry

## Exit conditions

After producing the decision record, hand off control to the main agent. The main agent:
- Reports the file path to the user
- Asks if user wants to proceed to **Mode 2 (Red-Blue Debate)** for pressure-test
- Provides the WORKLOG snippet
