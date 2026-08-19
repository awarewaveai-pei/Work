---
mode: red-blue-debate
schema_version: 1
status: active
purpose: Pressure-test mode — adversarial debate to find fatal flaws in a tentative decision.
when_to_use: Decision tentatively made; user is leaning toward proceeding; want to break it before committing.
deprecated: null
---

# Mode 2: Red-Blue Debate

Adversarial pressure-test. Red team attacks; Blue team defends; Judge integrates. Each side runs in **its own subagent context** to prevent self-rebuttal.

## When to use this mode

Pick this mode when:
- The user has a **tentative position** and wants to stress-test it
- The decision has **meaningful stakes** but is reversible enough that exploration (Mode 1) was already done
- You suspect the user is **already convinced** and want to surface what they're not seeing

Do NOT use when:
- The user hasn't decided yet → use Mode 1 (broader exploration first)
- The decision is irreversible → escalate to Mode 3 (Pre-Mortem) after this

## Required input from main agent

- Framed decision (from SKILL.md §Problem-framing)
- The user's tentative position (`leaning toward proceed` / `leaning toward reject`)
- Outputs from Mode 1 if it was run earlier (so debate is informed, not duplicate)
- The four role files

## Execution

**Phase 1: Red team attacks.** Spawn TWO parallel subagents:

- **Red-1 (Critical-led attack)**:
  - `subagent_type: "general-purpose"`
  - Pass `roles/critical-thinker.md` + `roles/systems-thinker.md` content as combined context
  - Directive: *Find 3-5 reasons this decision is wrong, dangerous, or premature. Use #biasidentification to identify what cognitive biases the user is likely operating under. Use #complexcausality to trace second-order effects. Use #fallacies to expose logical errors. Be uncompromising. Output as numbered list, each with a one-sentence "if this is true, the decision fails because..." clause.*
  - Hard limit: 350 words

- **Red-2 (Systems-led attack)**:
  - Same `general-purpose` subagent
  - Pass `roles/systems-thinker.md` content
  - Directive: *Independently from any other red-teamer, find 3-5 systemic / structural reasons this decision will fail at scale or over time. Focus on second-order effects, incentive misalignment, technical debt accumulation, governance drift. Numbered list with same "if this is true..." clause.*
  - Hard limit: 350 words

These run in **parallel** — they must not see each other's output. This is what produces non-overlapping attacks.

**Phase 2: Blue team defends.** After both red reports return, spawn TWO parallel subagents:

- **Blue-1 (Creative-led defense)**:
  - Pass `roles/creative-thinker.md` content + BOTH red team reports
  - Directive: *For each red team criticism, either: (a) propose a concrete mitigation that reduces the criticism's severity to acceptable, or (b) acknowledge it as a blocker. Do not dismiss. Do not handwave. Use #analogies to find precedent for similar mitigations working. Match the structure: address each numbered criticism in order. End with: "After mitigation, residual risk is: HIGH / MEDIUM / LOW".*
  - Hard limit: 400 words

- **Blue-2 (Communication-led defense)**:
  - Pass `roles/communication-thinker.md` content + BOTH red team reports
  - Directive: *Translate the decision into stakeholder framings. For each red team criticism, ask: "Is this a real risk or a presentation problem?" Some risks vanish under correct framing; others don't. Be honest about which is which. Output: per-criticism categorization (REAL / FRAMING / MIXED) with brief justification. End with: "If we proceed, the narrative we must own is: ..."*
  - Hard limit: 400 words

**Phase 3: Red team rebuttal.** Spawn ONE subagent with all four prior reports:
- Directive: *You are the original red team, now reviewing the blue team's mitigations. Identify which blue mitigations are weak, hand-wavy, or rely on optimistic assumptions. Pick the 1-2 mitigations most likely to fail in practice. For each, state: "This mitigation fails when ___, and at that point the original criticism re-emerges as ___."*
- Hard limit: 250 words

**Phase 4: Judge integrates.** This is the main agent's synthesis (no subagent), producing the decision record. The judge must:

1. List each red criticism + status (`fatal` / `mitigable` / `framing-only` / `dismissed`)
2. Cite the blue mitigation accepted or the reason for rejection
3. Note red rebuttal warnings — these become risks tracked in the decision record
4. Issue the verdict: `proceed` / `proceed-with-modifications` / `defer-pending-investigation` / `reject`
5. If `proceed-with-modifications`, list the modifications as required preconditions (not nice-to-haves)

## Quality bars

The output is **not acceptable** if:
- Blue team accepts every red criticism (suggests blue gave up — re-spawn with stronger directive)
- Red team accepts every blue mitigation (suggests red was too soft — re-spawn red-2 with explicit "be the harshest critic this decision will ever face")
- No `fatal` criticisms surface despite high stakes (suspicious — push harder)
- Judge issues `proceed` with `residual_risk: HIGH` (incoherent — must be `proceed-with-modifications` at minimum)

## Run-time budget

- Wall clock: 4-7 minutes (3 phases of subagents)
- Total subagents spawned: 5
- If a phase fails, retry only that phase

## Exit conditions

After producing the decision record:
- For `proceed` / `proceed-with-modifications` decisions touching irreversible territory, recommend escalating to **Mode 3 (Pre-Mortem)** before commitment
- For `defer-pending-investigation`, list the investigation queue and stop
- For `reject`, summarize the dominant fatal criticism in one sentence
