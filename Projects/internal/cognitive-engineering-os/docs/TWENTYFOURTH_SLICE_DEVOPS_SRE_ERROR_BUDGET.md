# Twenty-fourth Method Atlas slice: `devops_sre.error_budget`

Status: **LANDED (2026-09-05)**. Fifth slice from the `devops_sre` family (F19's own "DevOps／SRE／可靠性套件").

## What was built

Atlas gives this method two independent citations: the F19 tool table row (L851: "1-SLO→budget→burn rate→release policy") and a dedicated §11.40 section (purpose + 3 benefit bullets). The second benefit bullet -- burn too fast automatically lowers release risk -- is a real, enforceable invariant this slice enforces: a record whose computed `burn_rate` has reached or exceeded the budget (`budget_exhausted: true`) cannot claim `release_policy: unrestricted`. The CLI proves this by attempting to claim `unrestricted` with an over-budget failure rate and confirming the guard fires.

Structurally closer to `root_cause.pareto`/`decision.ahp`/`decision.mcda` than to its own `devops_sre` siblings: `error_budget_ratio` and `burn_rate` are real deterministic compute (`ai_lego/compute/error_budget/budget.py`), not narrative or operational-planning claims. `evaluate_genuine_compute_gate` reuses `modules.research.gates.evaluate_statistical_gate` UNCHANGED -- a fourth reuse of that same gate (after pareto/ahp/mcda).

Disclosed compilation choices: (1) `slo_target_ratio` is a fresh explicit numeric field, not parsed from `devops_sre.sli_slo`'s own free-text `slo_target` -- an optional `related_slo_id` preserves traceability without a fragile text-parsing dependency; (2) `release_policy` is a binary enum (`unrestricted`/`frozen`) gated by a single threshold (full exhaustion), not a graduated scale -- Atlas gives no intermediate numeric threshold, and inventing one would fabricate a policy Atlas never states.

* `methods/contracts/devops_sre.error_budget.contract.yaml`, `specs/cognitive/typed-objects/error-budget-record.schema.yaml` + fixtures (spec-root suite 2726 -> 2735).
* `ai_lego/compute/error_budget/budget.py` -- pure arithmetic (`calculate_error_budget_ratio`, `calculate_burn_rate`), hand-verified against known cases before being wired into the method layer.
* `ai_lego/modules/devops_sre/error_budget.py` -- builder enforcing the exhausted-forbids-unrestricted invariant, two gates.
* `ai_lego/apps/cli/run_error_budget_slice.py` -- a real healthy-budget record plus an attack-and-confirm step.
* `tests/unit/test_error_budget.py` -- 29 tests (10 pure-arithmetic + 19 method/gate), first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, `modules.research.gates.evaluate_statistical_gate`, the four other `devops_sre` family modules, and all eight `architecture` family modules.

## Critic round: a real bug on Atlas's own worked example

The first-pass implementation (18 tests, all green) still had a live bug: `burn_rate` was computed unrounded, so Atlas's own worked example (§11.40 L2151, SLO 99.9% -> 0.1% budget) with `observed_failure_rate` exactly at the budget landed at `0.9999999999999991` -- just under the `>= 1.0` exhaustion threshold. `budget_exhausted` came back `False`, `release_policy: unrestricted` was silently accepted, and nothing in the 18-test suite, the schema, or either gate caught it, because the hand-fed compute test used a literal `0.001` divisor the real pipeline never produces. A `critic` subagent review caught this plus three related findings (all fixed in the same commit):

1. **Fixed** -- round `error_budget_ratio` (12 dp) and `burn_rate` (10 dp) in the compute layer, same float-noise discipline `ai_lego/compute/pareto/ranking.py`'s own `round(share, 8)` already established. Added a postcondition guard for SLO targets precise enough (13+ nines) to round the budget to exactly 0.0.
2. **Fixed** -- `evaluate_exhausted_forbids_unrestricted_gate` now RE-DERIVES `budget_exhausted` from the record's own raw `slo_target_ratio`/`observed_failure_rate` via the same compute functions, instead of trusting the stored boolean. The gate as first written only caught a healthy record tampered TO exhausted; it missed the direction that actually matters -- an exhausted record tampered to LOOK healthy (`budget_exhausted:false` + `release_policy:unrestricted` together, raw fields untouched).
3. **Fixed** -- `calculate_burn_rate` now rejects non-finite `observed_failure_rate` (NaN/inf are realistic outputs of a `failures/total` pipeline with a degenerate denominator, not contrived inputs) and guards its own zero/non-finite divisor directly, rather than relying solely on the sibling function's invariant.
4. **Fixed** -- the builder now enforces `observed_failure_rate <= 1` itself (the contract's own stated precondition), not just the schema layer.
5. **Fixed** -- the CLI's attack-and-confirm step now pins the caught exception to the specific `ERRORBUDGET_EXHAUSTED_FORBIDS_UNRESTRICTED` code, not any `InvariantViolation` (a different precondition firing first could otherwise be mistaken for the invariant under proof actually holding).

## Evidence

CLI (post-fix): `PASS devops_sre.error_budget: burn_rate=0.5, budget_exhausted=False, release_policy=unrestricted, gates [genuine_compute=PASS, exhausted_forbids_unrestricted=PASS], exhausted_invariant_verified=True` (first run after fixes). 29 unit tests passed (including the Atlas-worked-example regression and both mutation directions on the invariant gate). Golden suite 2735 (2726 before). Full product-root regression: 548 tests OK (537 before this slice's first pass -> 548 after the critic-fix round, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-ERRORBUDGET-1`). `related_slo_id` is a soft, unenforced text link -- no runtime cross-check that the referenced SliSloSet actually exists (`OQ-ERRORBUDGET-2`). Not fixed (deliberately, disclosed): the non-ASCII `§` character in `ERRORBUDGET_EXHAUSTED_FORBIDS_UNRESTRICTED`'s own raised message is cosmetic-only (mojibake on a CP936 Windows console, no encode exception) and is the SAME inherited convention every sibling `devops_sre` invariant-guard message already uses (`chaos_engineering.py`, `blue_green_deployment.py`) -- fixing only this file's message would be inconsistent styling, not a real fix.
