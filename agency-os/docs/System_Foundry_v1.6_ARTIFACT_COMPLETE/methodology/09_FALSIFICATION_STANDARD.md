# Falsification Standard

## Purpose
每個架構/需求決策都必須附上「什麼觀察會證明這個決策是錯的」——用可證偽性當品質門檻，而不是只蒐集支持證據。

## Sequencing
Step 09. Applies to every material decision accumulated so far since `00_IDEA_INTAKE_STANDARD.md`. Feeds `10_RED_TEAM_STANDARD.md` (falsification conditions are prime red-team attack targets) and `13_CONVERGENCE_STANDARD.md`.

## Required Scope
- counter-evidence
- failure conditions
- assumption attack
- decision-flip criteria

## Required Fields
1. **Decision-flip criteria per material decision** — the specific, observable condition that would prove the decision wrong. A decision with no stated falsification condition is rejected and sent back to its owning step (`05_ARCHITECTURE_OPTIONS.md`, `03_BUSINESS_ARCHITECTURE.md`, etc.).
2. **Active counter-evidence search** — an explicit attempt to find evidence against each decision, not only evidence for it; confirmation-only research fails this standard.
3. **Assumption attack** — every item tagged ASSUMED in prior steps is specifically targeted: what would it take to convert it to VERIFIED or DISPUTED?
4. **Failure-condition documentation** — for each decision, what does "we were wrong" look like in production, so it's recognizable if it happens rather than rationalized away.

## Prohibition
It is PROHIBITED to record a decision as final without a falsification condition — "we're confident in this" is not evidence, per the framework's Evidence Law (`01_SYSTEM_FOUNDRY_CONSTITUTION.md`).

## Gate
This step, together with `10_RED_TEAM_STANDARD.md` and `11_COMPLEXITY_AUDIT.md`, jointly satisfies `G7_FALSIFICATION_COMPLETE` (`runtime/stage-gates.yaml`, requires: falsification, red_team, complexity_audit) — none of the three alone completes it. This step's own local check: reject any material decision made so far that lacks a stated falsification/decision-flip condition.
