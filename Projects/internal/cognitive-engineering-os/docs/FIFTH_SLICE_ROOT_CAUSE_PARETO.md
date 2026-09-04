# Fifth Method Atlas slice: `root_cause.pareto` -- a second, quantitative validation path

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema + a new deterministic-compute module.

Context: same TASKS.md item as the previous four slices. After `root_cause.five_whys` completed fishbone's chain once (a narrative, evidence-cited validation), this slice deliberately built the SECOND of fishbone's four `recommended_next` validation methods -- `root_cause.pareto` -- chosen specifically because it is structurally unlike every prior root_cause-family method: a CALCULATED_RESULT, not a narrative claim.

## Why this slice is a genuinely different shape

`root_cause.fishbone` (hypothesis generation) and `root_cause.five_whys` (narrative why-chain validation) both produce claims a human or model asserts and backs with citations. `root_cause.pareto` produces real deterministic compute -- the same class of artifact `ai_lego/compute/statistics/reliability.py`'s Cohen's Kappa already is (Master Plan §39: an LLM must never "mentally calculate" a value and label it `CALCULATED_RESULT`). This is the project's second Trusted-Compute-shaped method, and the first one in the `root_cause` family.

Because of that shape difference, this slice deliberately did NOT copy the `quality: {provenance_required: true, evidence_labeling_required: true}` pair the three prior root_cause/strategy contracts all used verbatim. `evidence_labeling_required` is set `false` -- Atlas's own named caution for Pareto (§11.6 L1320: "80/20 不是自然法則；真正比例由資料決定", 80/20 is not a law of nature, the real ratio is data-determined) is about threshold assumption, not evidence omission. Copying the flag anyway would have been exactly the kind of pattern-matching-without-re-deriving-the-invariant this codebase's own governance explicitly warns against.

## The threshold-honesty design, reused from a different method

`vital_few_threshold_percent` is nullable with no default, paired with an explicit `threshold_status: OPERATOR_SET | OPERATOR_SET_PENDING` flag. This is not a new invention -- it is the exact same pattern `ai_lego/modules/research/qualitative_coding.py`'s `saturation_assessment` record already established (`threshold_data_units: null`, `threshold_status: OPERATOR_SET_PENDING`) for a completely unrelated method, reused here because both methods share the identical underlying problem: Atlas explicitly warns against silently assuming a numeric threshold, and this codebase already has a design pattern for exactly that.

## A gate reused literally, not just structurally

`ai_lego/modules/root_cause/pareto.py::evaluate_genuine_compute_gate` calls `ai_lego.modules.research.gates.evaluate_statistical_gate` **unchanged** -- not a copy, the same function object, imported across module boundaries. That gate was written for `research.qualitative_coding`'s Kappa statistic and only ever inspected `provenance`/`computation_provenance_ref`/`engine`, three keys any genuine-compute record can carry regardless of what it's a statistic of. `tests/unit/test_pareto.py` proves this by calling both the gate wrapper and the underlying function directly and asserting identical results -- the strongest "LEGO reuse" evidence yet, since it demonstrates a piece of gate logic surviving completely unmodified across two unrelated method families it was never written with the other in mind.

## The chain, validated a second way

`ai_lego/apps/cli/run_pareto_slice.py` builds a fresh `CauseHypothesisSet` (a manufacturing-defect scenario, deliberately different from the fishbone/five_whys slices' HR-attrition scenario, to avoid the dataset looking hand-picked to fit a pre-chosen narrative), runs a real Pareto ranking against a synthetic defect-ticket dataset, and promotes the top-ranked hypothesis to a `RootCauseFact` using fishbone's own `record_validation_applied` / `attempt_promote_to_root_cause_fact` -- for the **second** time, with a **different** validation method (`root_cause.pareto` instead of `root_cause.five_whys`). Two independently-built method modules now both compose into the same promotion functions, proving the chain is a real, reusable seam rather than a one-off demo.

## What was built

* `methods/contracts/root_cause.pareto.contract.yaml` -- new, Atlas §11.6 (L1300-1320) verbatim citation, registered as `contract-backlog.yaml`'s third `tier_1` concrete entry.
* `specs/cognitive/typed-objects/pareto-analysis.schema.yaml` + golden fixtures (spec-root suite 2530 -> 2542).
* `ai_lego/compute/pareto/ranking.py` -- pure deterministic compute (`pareto_ranking`, `vital_few`), zero dependency on anything method-specific.
* `ai_lego/modules/root_cause/pareto.py` -- the method layer: builder, two gates (one reused, one new).
* `ai_lego/apps/cli/run_pareto_slice.py` -- an end-to-end runnable slice, the second real promotion chain.
* `tests/unit/test_pareto.py` -- 17 tests: real arithmetic correctness on the compute layer, spec-root schema conformance, gate reuse proof, and mutation-style threshold-honesty tests.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`, `ai_lego/modules/root_cause/fishbone.py` (its promotion functions, reused for the second time), AND -- new this slice -- `ai_lego/modules/research/gates.py::evaluate_statistical_gate`, reused across a module-family boundary for the first time.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_pareto_slice` | `PASS root_cause.pareto: vital_few=['CHS-PARETO-001-H1'], RootCauseFact RCF-PARETO-2026-09-04-001 legally promoted via ['root_cause.pareto']` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_pareto -v` | 17 passed |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2542 passed, ALL GOLDEN TESTS PASSED (2530 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

Mutation evidence (`tests/unit/test_pareto.py`): the ranking computation is checked for real arithmetic (sorted order, correct percentages, duplicate-id summing, zero/negative-value refusal); `vital_few` is checked to stop at the exact entry that crosses a given threshold; the genuine-compute gate is proven to be the literal same function `research.gates` uses (not a re-implementation) and to fail on a tampered `engine` value; the threshold-honesty gate is proven to fail on a hand-tampered record that claims vital-few results without `threshold_status: OPERATOR_SET` -- the exact silently-assumed-ratio pattern Atlas warns against.

## Honest limits (not silently completed, not hidden)

* **`root_cause.pareto.contract.yaml`'s `forbidden_transition` is genuinely empty**, same as `root_cause.five_whys` -- Atlas §11.6 gives no explicit illegal-transition example (`OQ-PARETO-1`).
* **`cognitive_primitives: [GROUP, CALCULATE, PRIORITIZE]` is inferred, not cited** (`OQ-PARETO-2`), same honesty class as every other root_cause-family contract's inferred primitives.
* **Only TWO of fishbone's four `recommended_next` validation methods are now real** (`root_cause.five_whys`, `root_cause.pareto`). `causal.dag` and `validation.experiment` still have no contracts.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first slice to reuse a GATE FUNCTION across method families unmodified (not just shared infrastructure like the resolver or ledger, which are generic by design) -- proving that even method-specific-looking logic, when written carefully against a general-enough contract shape, generalizes further than its original author necessarily planned for. Combined with the second real promotion chain (a different validation method reaching the same real `RootCauseFact` construction), this is the strongest evidence yet that the "LEGO" framing is not just branding: pieces built for one purpose are actually being picked up and reused for another, inside the same session, without modification.
