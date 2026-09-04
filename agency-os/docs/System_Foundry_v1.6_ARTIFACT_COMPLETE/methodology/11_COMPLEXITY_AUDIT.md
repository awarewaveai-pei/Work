# Complexity Audit Standard

## Purpose
確認提出的設計是滿足（已通過證偽與紅隊考驗的）需求下最簡單的解法——複雜度是要花預算買的，不是預設值。

## Sequencing
Step 11. Consumes findings from `10_RED_TEAM_STANDARD.md` (closure of Critical/High findings is `10`'s own gate condition before proceeding to `12_ARCHITECTURE_ASSURANCE.md`, not a precondition for this step to start). Feeds `12_ARCHITECTURE_ASSURANCE.md`.

## Required Scope
- necessity
- operational burden
- later-add feasibility
- risk reduction
- rejection

## Required Fields
1. **Necessity per component/abstraction** — for every non-trivial abstraction layer, an explicit statement of what requirement it satisfies; an abstraction with no traceable requirement is a candidate for removal.
2. **Operational burden** — what does this component cost to run/monitor/upgrade over time, not just what it costs to build once.
3. **Later-add feasibility** — for any capability deferred rather than built now, confirmation it can genuinely be added later without a rewrite (ties to `assurance/30_YEAR_REPLACEMENT_TEST.md` thinking) — if it can't, that's a reason to build it now, not defer it.
4. **Risk reduction per unit of complexity** — does this specific complexity measurably reduce a real risk from `10_RED_TEAM_STANDARD.md`, or is it speculative generality with no concrete beneficiary?
5. **Rejection log** — complexity considered and explicitly rejected, with the reason, so it isn't silently re-proposed later without acknowledging it was already declined.

## Complexity Budget Trigger
An unexplained abstraction layer, a duplicate mechanism solving the same concern two different ways, or speculative generality with no near-term consumer MUST trigger simplification before proceeding.

## Gate
This step, together with `09_FALSIFICATION_STANDARD.md` and `10_RED_TEAM_STANDARD.md`, jointly satisfies `G7_FALSIFICATION_COMPLETE` (`runtime/stage-gates.yaml`) — the canonical `G11_VERIFIED` is a later, post-implementation concept and does not apply here. This step's own local check: reject when a component/abstraction cannot be traced to a specific requirement, or when duplicate mechanisms for the same concern exist with no stated reason for both.
