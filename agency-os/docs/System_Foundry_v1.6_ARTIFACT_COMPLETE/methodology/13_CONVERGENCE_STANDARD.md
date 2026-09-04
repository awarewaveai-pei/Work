# Convergence Standard

## Purpose
為每個待決議題標註收斂程度，決定它可以直接送 `14_HUMAN_APPROVAL_GATE.md`，還是必須退回補強。

## Sequencing
Step 13. Consumes the assurance outcome from `12_ARCHITECTURE_ASSURANCE.md` (`G8_ASSURANCE_READY`) and any still-open items from `09_FALSIFICATION_STANDARD.md` / `10_RED_TEAM_STANDARD.md` / `11_COMPLEXITY_AUDIT.md` (jointly `G7_FALSIFICATION_COMPLETE`). Feeds `14_HUMAN_APPROVAL_GATE.md` (`G9_HUMAN_APPROVED`).

## Required Scope
- CONSENSUS
- MAJORITY
- DISAGREEMENT
- UNRESOLVED
- NEEDS_EVIDENCE
- NEEDS_PROTOTYPE
- NEEDS_BENCHMARK

## Convergence States
- `CONSENSUS` — no material disagreement remains; proceed to 14.
- `MAJORITY` — a documented minority view exists; proceed to 14 with the dissent explicitly recorded, not suppressed.
- `DISAGREEMENT` — unresolved, substantive disagreement between experts (`06_EXPERT_COUNCIL_STANDARD.md`); MUST NOT proceed to 14 until escalated and resolved or explicitly deferred by a human with authority.
- `UNRESOLVED` — no clear position has formed; route back to the owning step for more analysis.
- `NEEDS_EVIDENCE` — route back to `01_CURRENT_STATE_AUDIT.md` or `02_REQUIREMENT_DISCOVERY.md` for the specific missing evidence.
- `NEEDS_PROTOTYPE` — route to `assurance/PROTOTYPE_GATE.md` to resolve the specific uncertainty before a decision is finalized.
- `NEEDS_BENCHMARK` — route to `assurance/BENCHMARK_STANDARD.md` for a specific performance/scale question.

These seven states are a documentation vocabulary for this step, distinct from the registered runtime status codes in `registries/status-codes.yaml`. `NEEDS_PROTOTYPE` and `NEEDS_BENCHMARK` also happen to be registered there; `NEEDS_EVIDENCE` is deliberately NOT a rename of the registered `INSUFFICIENT_EVIDENCE` — it means "evidence exists but hasn't converged," a narrower, step-13-local condition, not the `01_CURRENT_STATE_AUDIT.md` G1 stop condition.

## Required Fields
1. Every open decision accumulated so far MUST be tagged with exactly one convergence state — untagged decisions cannot proceed.
2. Any state other than CONSENSUS/MAJORITY MUST specify which step it routes back to and what specifically must change to re-attempt convergence.

## Gate
This step has no dedicated entry in `runtime/stage-gates.yaml` of its own — the canonical `G13_RELEASE_CLOSED_LOOP` is a much later, post-release concept and does not apply here. This step's own local check (a precondition for `14_HUMAN_APPROVAL_GATE.md`'s `G9_HUMAN_APPROVED`): reject a decision proceeding to step 14 while tagged DISAGREEMENT, UNRESOLVED, NEEDS_EVIDENCE, NEEDS_PROTOTYPE, or NEEDS_BENCHMARK.
