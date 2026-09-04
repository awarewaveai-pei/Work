# Fourth Method Atlas slice: `root_cause.five_whys` -- closes the gap, real end-to-end chain

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, including a new spec-root method contract AND typed-object schema this slice needed and wrote. First slice to complete a full multi-method promotion chain for real.

Context: same TASKS.md item as the second and third slices. After `strategy.swot` landed, this slice deliberately returned to the `root_cause` family to close an honest limit [`SECOND_SLICE_ROOT_CAUSE_FISHBONE.md`](SECOND_SLICE_ROOT_CAUSE_FISHBONE.md) recorded: `root_cause.fishbone.contract.yaml`'s own `recommended_next` named `root_cause.five_whys` as one of exactly 4 methods that can legally validate a `CauseHypothesisSet` before promotion to `RootCauseFact` -- but none of the four had a contract, so the fishbone slice could only prove the forbidden-transition guard *blocks* a direct promotion, never that a legal one *succeeds* for real.

## Why this slice was different from the first three

Unlike `root_cause.fishbone` (contract + all typed objects already ratified) and `strategy.swot` (contract ratified, one typed object missing), `root_cause.five_whys` had **neither** -- no method contract, no output typed-object schema. This slice therefore did the most spec-root work of the four:

* `methods/contracts/root_cause.five_whys.contract.yaml` -- new, following the exact discipline the four existing Tier 0 contracts already use (verbatim citation of Atlas §11.5 L1262-1298, a full dedicated protocol section stronger-grounded than `evidence.triangulation`'s single structural mention). Registered as a second `contract-backlog.yaml` `tier_1` concrete entry (same justification class as that file's existing `research.qualitative_coding` entry: mandated by the actively-running slice, not Tier 0's citation-frequency criterion) -- added as a new key rather than converting `first_concrete_entry` into a list, to avoid touching `tests/run_golden_tests.py`'s existing hard-coded check (minimal blast radius).
* `specs/cognitive/typed-objects/five-whys-validation.schema.yaml` -- new. Atlas's three named failure modes (L1289-1293: oversimplifying a multi-causal problem, treating "human carelessness" as the final cause, declaring a cause with no data) are operationalized as **hard `const: false` schema gates** -- the strongest structural enforcement any typed-object schema in this directory uses. Proven by mutation test to actually reject a `true` value.
* Golden fixtures for both, spec-root suite 2518 -> 2530, all green.

## The runtime completes the chain fishbone left open

`ai_lego/modules/root_cause/five_whys.py` provides `generate_five_whys_validation`, which enforces the three failure modes at a SECOND, independent layer before the schema even sees the record: `declared_without_data` is **computed** from the chain's own evidence refs (not a caller self-attestation -- a caller cannot lie past it), the other two are caller-supplied booleans (Atlas gives no mechanical test for either, same honesty limit `strategy.swot`'s own docs already disclosed for its un-checkable misuses). Any of the three being true raises `FIVEWHYS_FAILURE_MODE_TRIGGERED` before construction is even attempted.

`ai_lego/apps/cli/run_five_whys_slice.py` is the payoff: it builds a `ProblemStatement` and `CauseHypothesisSet` using fishbone's own builders (zero duplication), runs `root_cause.five_whys` against one hypothesis to produce a real `FiveWhysValidation`, then calls **fishbone's own `record_validation_applied` and `attempt_promote_to_root_cause_fact`, completely unchanged** -- and this time promotion **succeeds**, producing a real `RootCauseFact` that validates against its schema. This is the first time in this codebase two independently-built method modules compose into a single real chain, not just two isolated method executions.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_five_whys_slice` | `PASS root_cause.five_whys: RootCauseFact RCF-FIVEWHYS-2026-09-04-001 legally promoted from CHS-FIVEWHYS-2026-09-04-001 via ['root_cause.five_whys']` |
| Unit tests | `python -m unittest tests.unit.test_five_whys -v` | 16 passed |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2530 passed, ALL GOLDEN TESTS PASSED (2518 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

The first real run of the CLI failed with a genuine bug the schema caught immediately: `supporting_evidence_refs` requires real `^E-[0-9]+$` evidence ids (matching every other typed-object schema's convention), and the initial draft passed source filenames instead. Fixed by constructing real `evidence.schema.yaml` records first and referencing their ids -- left in this doc as an honest example of the schema validation actually catching a real mistake on the first try, not a hypothetical.

Mutation evidence (`tests/unit/test_five_whys.py`): each of the three failure modes independently blocks construction at the runtime layer; a hand-crafted instance that bypasses the builder is independently refused by the schema's own `const: false`; a single evidence-backed step anywhere in the chain is enough to avoid the computed `declared_without_data` flag (proving the computation isn't "any missing ref anywhere fails everything"); the full promotion chain test builds a `CauseHypothesisSet`, validates it via Five Whys, and promotes it to a schema-valid `RootCauseFact`, end to end.

## Honest limits (not silently completed, not hidden)

* **`root_cause.five_whys.contract.yaml`'s `forbidden_transition` is genuinely empty.** Atlas §11.5 gives no explicit illegal-transition worked example for this method (unlike Fishbone's and SWOT's). Left empty rather than inventing one to match the other contracts' shape (`OQ-FIVEWHYS-1`).
* **`cognitive_primitives: [QUESTION, CAUSE, VALIDATE]` is inferred, not cited** -- Atlas §4's composition-formula examples don't name Five Whys among the methods given an explicit formula there (`OQ-FIVEWHYS-2`), same honesty class as `evidence.triangulation`'s own inferred primitives.
* **Only ONE of Fishbone's four `recommended_next` validation methods is now real.** `root_cause.pareto`, `causal.dag`, and `validation.experiment` still have no contracts -- the chain is provably completable in principle (this slice is the proof), not that every path through it now exists.
* **`why_chain[].step` monotonicity is a runtime, not schema, invariant** -- JSON Schema cannot natively express "step N+1 follows step N" across array items without a verbose per-index construct; the builder assigns steps sequentially by construction instead.
* Same scope decisions as the second and third slices: no EC §10 state-machine walkthrough, no AI model/capability call (this method's contract doesn't require one).

## What this measures, honestly

The first slice to (a) write a NEW method contract from scratch against a well-grounded Atlas section, (b) write its output type with the strongest structural enforcement in this directory (`const: false` failure-mode gates, checked twice -- runtime AND schema), and (c) compose two independently-built runtime modules into one real, schema-validated end-to-end chain that a previous slice had left honestly incomplete. This is the strongest data point yet for "LEGO can assemble": not just a new method reusing old infrastructure, but two new methods composing with each other through infrastructure neither one owns.
