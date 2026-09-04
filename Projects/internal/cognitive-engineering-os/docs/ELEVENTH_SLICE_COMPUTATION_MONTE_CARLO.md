# Eleventh Method Atlas slice: `computation.monte_carlo` -- the first family outside Atlas's own F01-F24 numbering, and the first genuinely stochastic method

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema. First slice from the `computation` family -- the first family this session opened that does not correspond to one of Atlas's own numbered F01-F24 categories.

Context: same TASKS.md item as the previous ten slices. Chosen after checking Atlas §11.29's own grounding: a real 5-node pipeline, a concrete 6-step usage protocol, and (on Atlas §22.3's own Method-specific Gate table) a directly-cited forbidden_transition -- the third Tier 1 contract in a row to draw from that same table, after `challenge.red_team` and `decision.mcda`.

## An uncataloged family, disclosed with two independent citations rather than invented

`methods/registry/method-inventory.yaml`'s own catalog row for Monte Carlo Simulation (L1437-1441) labels its category as "computation (uncataloged in F01-F24)" -- Atlas itself never slotted this method into one of its own 24 numbered families. Rather than forcing it into an existing family or inventing an arbitrary new label, `family: computation` transcribes that exact word from the inventory's own text, independently corroborated by Atlas §3's own primitive-category letter table (row F: "Computation | Python / R / SQL / Stats / Simulation"). Two independent citations for the same family name, both disclosed in the contract rather than picking one silently.

## Stochastic subject matter, deterministic computation -- not a contradiction

Every prior genuine-compute slice this session built (Pareto, AHP, MCDA) computed a single deterministic value from deterministic inputs. Monte Carlo's own subject matter is random sampling -- which could look like tension with this codebase's `engine: local_python_deterministic_compute` Trusted Compute guarantee. It is not: a caller-supplied, schema-REQUIRED `random_seed` makes the entire run byte-for-byte reproducible, using the exact same `random.Random(seed)` convention `ai_lego/compute/statistics/reliability.py`'s own bootstrap confidence interval already established (this codebase's first prior use of seeded randomness, now extended from a side calculation to a whole method's own primary output). Hand-verification proved this directly: two runs with the same seed produced bit-identical output dictionaries; a different seed produced a different result.

## An anticipated extension point, found by the same due-diligence habit as the tenth slice

Before writing anything, `specs/` was grepped for "monte carlo"/"probability distribution"/"simulation"/"SIMULATED_RESULT" (the proactive check this session's own corrections established, now applied a third time). This turned up two things, neither a duplicate: `specs/governance/epistemic-label.schema.yaml`'s own `SIMULATED_RESULT` epistemic_type (distinct from `CALCULATED_RESULT`, sitting in the enum unused until this slice), and `specs/decision/decision.schema.yaml`'s own deliberately-unconstrained `simulations` field -- the exact same "anticipated but unfilled extension point" relationship the tenth slice already found between `decision.schema.yaml`'s `analyses` field and `mcda-analysis.schema.yaml`.

## Scope decisions disclosed, not invented past what Atlas supports

* **`combine_mode` supports only `sum`.** Atlas's own pipeline names "Input Distributions" (plural) feeding one "Outcome Distribution" (singular) but gives zero worked example of how they combine. Building a general formula-evaluation engine would require either `eval()` (a real security risk this codebase's safety rules forbid) or a bespoke expression parser -- genuine scope creep. Summing independent uncertain components (total cost = sum of cost components) is itself a complete, common, real Monte Carlo use case, not a strawman, and is the only reading Atlas's own text supports without inventing structure.
* **No correlation/dependency modeling.** Atlas's own usage-protocol step 2 names checking for correlated inputs, but gives no worked formula for how to model it (covariance matrix? rank correlation?). Independent sampling is the conservative default, disclosed rather than silently assumed.
* **Tail risk fixed at the 95th percentile.** Unlike Pareto's own caller-set threshold (Atlas explicitly warns against assuming a fixed ratio there), Atlas's own benefit text for Monte Carlo gives a concrete worked example -- "P95 cost" -- making 95 a directly-cited value, not an invented default.
* **`sensitivity_notes` is disclosure-only**, the same honest pattern AHP's and MCDA's own identically-named, identically-ungrounded Sensitivity stage already established.

## What was built

* `methods/contracts/computation.monte_carlo.contract.yaml` -- new, Atlas §11.29 + §22.3 L4153 + §3's primitive table, three independent citations. Registered as `contract-backlog.yaml`'s ninth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/monte-carlo-simulation.schema.yaml` + golden fixtures (spec-root suite 2602 -> 2615) -- top-level `additionalProperties: false` (third method this session at that enforcement strength), a `distribution_type`-discriminated `oneOf` union (normal/uniform/triangular, each fully closed).
* `ai_lego/compute/montecarlo/simulation.py` -- `run_simulation`, hand-verified against known statistical facts before wiring in: fixed-seed reproducibility, different-seed divergence, large-N normal-distribution convergence to its true mean/std_dev (within 1.0 at N=200,000), uniform/triangular bounds respected, and a success-probability sanity check against a known 50/50 split.
* `ai_lego/modules/computation/monte_carlo.py` -- builder, certainty-claim guard, four gates. `evaluate_genuine_compute_gate` is deliberately NOT a reuse of `evaluate_statistical_gate` -- that function hardcodes `epistemic_type == CALCULATED_RESULT`, which would wrongly FAIL every honest Monte Carlo record; a mutation test proves this directly by mislabeling a valid record with `CALCULATED_RESULT` and confirming the gate catches it.
* `ai_lego/apps/cli/run_monte_carlo_slice.py` -- a real project-cost simulation (material cost, normal; labor cost, triangular; summed; 10000 runs; a $90,000 budget success criterion), plus the same certainty-claim-smuggling attack-and-confirm pattern `run_red_team_slice.py`/`run_mcda_slice.py` established.
* `tests/unit/test_monte_carlo.py` -- 23 tests, all passing on the first run: statistical-fact verification, schema conformance, the two-layer certainty-claim proof, and the deliberate-non-reuse mutation test for the genuine-compute gate.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py` (already carried `SIMULATED_RESULT` in its valid-epistemic-type set -- zero changes needed to use it for the first time), `compute/statistics/reliability.py` (its own seeded-`random.Random` convention, not its code, was the reused pattern).

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| Compute hand-verification | `python3 -c "..."` (10 checks: reproducibility, divergence, normal convergence, uniform/triangular bounds, success-probability sanity, 4 error paths) | All 10 matched expected statistical behavior, before wiring into the method layer |
| CLI slice | `python -m ai_lego.apps.cli.run_monte_carlo_slice` | `PASS computation.monte_carlo: mean=81547.5, P95=97419.9, success_probability=0.8122, gates [...], no_certainty_claim_verified(runtime=True, schema=True)` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_monte_carlo -v` | 23 passed, first run, no fixes needed |
| Spec-root golden suite | `python3 tests/gen_spec_index.py && python3 tests/run_golden_tests.py` | 2615 passed, ALL GOLDEN TESTS PASSED (2602 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **`combine_mode` supports only `sum`** -- no general formula-evaluation engine (`OQ-MONTECARLO-1`).
* **No correlation/dependency modeling between input distributions** -- independent sampling only (`OQ-MONTECARLO-2`).
* **`sensitivity_notes` enforces presence, not correctness** -- same disclosure-only pattern as AHP/MCDA (`OQ-MONTECARLO-3`).
* **`cognitive_primitives: [ESTIMATE, SIMULATE, FORECAST]` is inferred, not cited** -- Monte Carlo is not among the 5 methods Atlas gives a primitive-composition citation to.
* **`family: computation` is the first family this session opened outside Atlas's own F01-F24 numbering** -- disclosed explicitly (`OQ-MONTECARLO-4`), not silently treated as an ordinary F-category.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first proof this session's genuine-compute discipline extends past deterministic single-value computation to a properly stochastic method, without weakening the Trusted Compute guarantee -- reproducibility via a required seed, not determinism via an absence of randomness. Also the first time a method contract needed a genuinely NEW family outside Atlas's own numbered taxonomy, handled by citing the gap explicitly (the inventory's own "uncataloged" label) rather than either forcing a bad fit into an existing family or inventing a name with no textual grounding at all.
