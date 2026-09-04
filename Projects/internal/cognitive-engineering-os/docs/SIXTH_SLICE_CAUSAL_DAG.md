# Sixth Method Atlas slice: `causal.dag` -- a third validation path, and a fourth structural shape

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema + a second new deterministic-compute module. First slice from a family other than `root_cause`/`strategy`.

Context: same TASKS.md item as the previous five slices. Third of `root_cause.fishbone`'s four `recommended_next` validation methods to gain a real contract (`root_cause.five_whys` and `root_cause.pareto` came first). Chosen specifically because it exercises a fourth structural shape this session hadn't built yet.

## The fourth shape

* `root_cause.fishbone` -- hypothesis generation (a flat list).
* `root_cause.five_whys` -- narrative, evidence-cited chain.
* `strategy.swot` -- classification (four fixed buckets).
* `root_cause.pareto` -- calculated result (a ranked list).
* `causal.dag` -- a **graph**: nodes carrying a causal role (treatment/outcome/confounder/mediator/collider) and directed edges between them, each edge its own causal hypothesis.

Also the first slice whose method's own family is neither `root_cause` nor `strategy` -- `causal` (F11), per `method-inventory.yaml`'s own classification of "Causal DAG" (L691-696). `root_cause.fishbone.contract.yaml`'s `recommended_next` names `causal.dag` alongside the two already-built methods, and Atlas's own §14.1 legal chain (`CauseHypothesisSet -> Evidence Search -> Causal DAG -> Validation -> RootCauseAssessment`) independently places it downstream of a `CauseHypothesisSet` too.

## A structural property, verified twice by a real algorithm

The method's own name -- Directed **Acyclic** Graph -- is a testable claim, not just a label. `ai_lego/compute/graph/dag.py::is_acyclic` is a real three-color DFS cycle-detection algorithm, sanity-checked by hand against five known graph shapes (a diamond, a self-loop, a 2-cycle, a 3-cycle, disconnected acyclic components) before being wired into anything else. `typed-objects/causal-dag-analysis.schema.yaml`'s `acyclic_verified` field is `const: true` -- the same "the runtime raises before construction AND the schema independently refuses a bypass" belt-and-suspenders discipline `five-whys-validation.schema.yaml`'s failure-mode gates and `root_cause.fishbone`'s forbidden-transition guard both already established, applied here to a graph-theoretic property instead of a narrative one.

## The quality flags were re-derived, not defaulted either way

`root_cause.pareto.contract.yaml` deliberately set `evidence_labeling_required: false` (its real risk was threshold assumption, not evidence omission). `causal.dag.contract.yaml` deliberately set it back to `true` -- re-derived independently, not copied from either precedent: Atlas's own named risk for this method (L1683, "avoid writing correlation directly as causation") genuinely IS about evidence discipline, so the flag that fits Fishbone/SWOT's pattern turns out to be the right one here too, for its own reason, not by default.

## The chain, validated a third way

`ai_lego/apps/cli/run_causal_dag_slice.py` builds a fresh `CauseHypothesisSet` (a subscription-churn scenario, distinct from the fishbone/five_whys HR-attrition and pareto manufacturing-defect scenarios), constructs a real causal graph naming a price-change treatment, a new-UI **confounder** (the exact hazard Atlas's own purpose line for this method names), a mediator, and the churn outcome -- then promotes the price-change hypothesis to a `RootCauseFact` using fishbone's own `record_validation_applied` / `attempt_promote_to_root_cause_fact`, for the **third** time, with a **third** different validation method. All three of fishbone's now-real validation methods (`root_cause.five_whys`, `root_cause.pareto`, `causal.dag`) reach the identical, unmodified promotion functions.

## What was built

* `methods/contracts/causal.dag.contract.yaml` -- new, Atlas §11.21 (L1665-1687) verbatim citation, registered as `contract-backlog.yaml`'s fourth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/causal-dag-analysis.schema.yaml` + golden fixtures (spec-root suite 2542 -> 2554).
* `ai_lego/compute/graph/dag.py` -- pure deterministic graph algorithm (`is_acyclic`, `find_cycle`), zero method-specific dependency.
* `ai_lego/modules/causal/dag.py` -- the method layer: builders, two gates.
* `ai_lego/apps/cli/run_causal_dag_slice.py` -- an end-to-end runnable slice, the third real promotion chain.
* `tests/unit/test_causal_dag.py` -- 17 tests: real cycle-detection correctness on 6 graph shapes, spec-root schema conformance, both-layer `acyclic_verified` enforcement, gate mutation tests, and the third real promotion chain end to end.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`, `core/domain/evidence.py`, AND `ai_lego/modules/root_cause/fishbone.py`'s promotion functions, reused for the third time.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_causal_dag_slice` | `PASS causal.dag: 4 nodes, 3 edges, acyclic_verified=True, RootCauseFact RCF-CAUSALDAG-2026-09-04-001 legally promoted via ['causal.dag']` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_causal_dag -v` | 17 passed |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2554 passed, ALL GOLDEN TESTS PASSED (2542 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

Mutation evidence (`tests/unit/test_causal_dag.py`): the cycle-detection algorithm is checked against a diamond (acyclic), a self-loop, a simple 2-cycle, a 3-cycle, and disconnected acyclic components -- all correctly classified before the algorithm was ever wired into the method layer; an edge referencing an unknown node id raises immediately; a cyclic graph is refused BEFORE any `CausalDagAnalysis` record is constructed; a hand-crafted record with `acyclic_verified: false` is independently refused by the schema layer; the gates are proven to fail on missing provenance and on an EVIDENCE-labeled edge citing no evidence.

## Honest limits (not silently completed, not hidden)

* **`causal.dag.contract.yaml`'s `forbidden_transition` is genuinely empty**, same as `root_cause.five_whys`/`root_cause.pareto` (`OQ-CAUSALDAG-1`).
* **`cognitive_primitives: [MAP, RELATE, VALIDATE]` is inferred, not cited** (`OQ-CAUSALDAG-2`), same honesty class as every other Tier 1 contract this session built.
* **`nodes[].role`'s TREATMENT/OUTCOME values are compilation additions**, not individually Atlas-cited per role name -- only CONFOUNDER/MEDIATOR/COLLIDER trace directly to Atlas L1679's own vocabulary (`OQ-CAUSALDAG-3`).
* **Only THREE of fishbone's four `recommended_next` validation methods are now real.** `validation.experiment` still has no contract -- and unlike the other three, Atlas gives it essentially zero independent content anywhere (method-inventory.yaml files it as "referenced only in recommended_next"), making it a genuinely harder next candidate than any method built so far.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The fourth distinct structural shape assembled against the same core infrastructure in one session, and the first time a method from a genuinely different family (`causal`, not `root_cause`/`strategy`) still composed cleanly into another family's promotion chain (`root_cause.fishbone`'s functions) with zero modification to either side. Combined with the real, hand-verified graph algorithm, this is evidence that "LEGO can assemble" holds even when the new piece's correctness depends on genuine computer-science content (cycle detection), not just data shuffling.
