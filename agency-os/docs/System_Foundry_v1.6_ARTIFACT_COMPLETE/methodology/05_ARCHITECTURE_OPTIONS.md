# Architecture Options Standard

## Purpose
產生至少三個真正不同的架構選項（不是同一個想法的三種變形），並在 5/10/30 年三個時間尺度下評估，避免過早收斂到單一方案。

## Sequencing
Step 05. Consumes the domain model from `04_DOMAIN_DISCOVERY.md` and requirements from `02_REQUIREMENT_DISCOVERY.md`. Its output feeds `06_EXPERT_COUNCIL_STANDARD.md` (multi-domain expert review of the options), `07_INDUSTRY_RESEARCH_STANDARD.md` / `08_CROSS_INDUSTRY_RESEARCH.md` (used to stress-test the options), and ultimately `12_ARCHITECTURE_ASSURANCE.md`.

## Required Scope
- 3+ options
- trade-offs
- failure modes
- 5/10/30-year test
- migration
- rollback
- economics

## Required Fields
1. **At least three genuinely distinct options** — differing in a structural way (e.g. monolith vs. modular-monolith vs. services), not three variations of the same idea with different vendor names swapped in.
2. **5/10/30-year test per option** — for each option, does it still make sense at 5, 10, and 30 years given plausible growth and team-turnover scenarios (`kernel/07_30_YEAR_EVOLUTION_CONTRACT.md`)?
3. **Decision matrix (trade-off table)** — every option gets the same evaluation criteria applied with equal rigor; asymmetric detail (one option analyzed in depth, others dismissed in a sentence) is a rejected pattern.
4. **Failure modes per option** — how each option specifically fails, not only how it succeeds; feeds `10_RED_TEAM_STANDARD.md`.
5. **Migration and rollback implication per option** — what would adopting this option require to change later, and what would reversing the decision cost.
6. **Economics** — both build cost and ongoing operating cost per option, not just initial build cost.

## No Silent Favoritism
The option ultimately recommended MUST NOT receive disproportionately more analysis depth than the options rejected — that asymmetry is itself evidence of a decision made before the analysis, not because of it.

## Gate
`G5_OPTIONS_COMPARED` (`runtime/stage-gates.yaml`) requires: architecture_options, decision_matrix, failure_modes, economics, with a minimum of 3 options. It fails when fewer than three genuinely distinct options are presented, when any option lacks the 5/10/30-year evaluation, or when failure modes are not stated per option.
