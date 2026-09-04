# Third Method Atlas slice: `strategy.swot` -- status, evidence, limits

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance (including a new spec-root typed-object schema this slice needed and wrote), local synthetic scope.

Context: same TASKS.md item as [`SECOND_SLICE_ROOT_CAUSE_FISHBONE.md`](SECOND_SLICE_ROOT_CAUSE_FISHBONE.md) -- "Cognitive OS 從『一個切片』擴展成『操作者要的完整平台』". After the second slice (`root_cause.fishbone`) landed and the operator granted full standing authority to keep going without stopping between slices, this is the third: `strategy.swot` (F08 context/strategy).

## Why `strategy.swot`, and what was different this time

Like `root_cause.fishbone`, `strategy.swot` already had a ratified `methods/contracts/strategy.swot.contract.yaml` (2026-08-29, Tier 0 group b). Unlike fishbone, its output type (`SWOTAnalysis`) had **no** typed-object schema yet -- `specs/cognitive/typed-objects/` only held the root-cause chain (`ProblemStatement`/`CauseHypothesisSet`/`RootCauseFact`). This slice therefore did real spec-root work first:

* `specs/cognitive/typed-objects/swot-analysis.schema.yaml` -- new, following the exact discipline every existing typed-object schema in this directory already uses (verbatim citation of Atlas §11.7 L1324-1347 and §14.1 L3536-3552, `compilation_decisions` for every inferred field, `open_questions` for what genuinely isn't settled). No ADR required, same class of decision `problem-statement.schema.yaml`'s own `decided_by` field documents.
* `tests/contracts/specs/cognitive/typed-objects/swot-analysis.fixtures.yaml` -- 2 valid + 4 invalid golden fixtures, run through the spec root's own `tests/run_golden_tests.py` (2510 -> 2518 checks, all green).
* `docs/architecture/SPEC_QUICKREF.md` regenerated (`tests/gen_spec_index.py`) so the new schema is reflected in the generated index, not silently stale.

`KnowledgeSet` (the method's required input) deliberately did **not** get a new schema -- it has no dedicated Atlas section anywhere (contrast ProblemStatement's §12.2), so inventing one would overstate the grounding. It is represented at the runtime layer as a non-empty list of real, already-ratified `evidence/evidence.schema.yaml` records. Flagged as `OQ-SWOTANALYSIS-1` for a future session to decide whether that should change.

## A structurally different hazard class, not just a different method shape

`root_cause.fishbone`'s `forbidden_transition` (`CauseHypothesisSet -> RootCauseFact`) was a **data-layer type-promotion guard**: a real typed object exists on the far side, so the runtime could construct-and-refuse it directly.

`strategy.swot`'s `forbidden_transition` (Atlas L3550-3552: `SWOT -> AutomaticProductionDeployment`) is a different hazard entirely: an **irreversible external action** with no human decision in the loop. There is no typed object named `AutomaticProductionDeployment` anywhere in this spec root to construct and catch -- and there shouldn't be one. The correct guard is structural absence, backed by the platform's own fail-closed method resolution (ADR-023): nothing shaped like an automatic-deployment action has an ACTIVE contract in `methods/contracts/` today, so `MethodCatalog.resolve()` already refuses it, for free, through the exact mechanism every other method invocation goes through.

`ai_lego/modules/strategy/swot.py::assert_forbidden_deployment_path_blocked` makes that reliance explicit and machine-checkable instead of an unstated assumption: it resolves an illustrative hazard id (`strategy.automatic_production_deployment`) against the live catalog and raises if it is ever NOT blocked. Proven both ways in `tests/unit/test_swot.py`: the live catalog blocks it today, AND a deliberately constructed rogue catalog carrying an ACTIVE contract for that id makes the check itself raise `FORBIDDEN_TRANSITION_GUARD_DID_NOT_FIRE` -- proof this isn't a tautology that always reports "blocked" regardless of catalog state.

## What was built

* `specs/cognitive/typed-objects/swot-analysis.schema.yaml` + its golden fixtures (spec root).
* `ai_lego/modules/strategy/swot.py` -- builders (`swot_factor`, `generate_swot_analysis`), two contract-declared gates (`provenance_required`, `evidence_labeling_required` -- same two ids as fishbone, evaluated against a structurally different object), and `assert_forbidden_deployment_path_blocked`.
* `ai_lego/apps/cli/run_swot_slice.py` -- an end-to-end runnable slice.
* `tests/unit/test_swot.py` -- 15 tests: spec-root schema conformance, method resolution/invocation through the unmodified `MethodCatalog`, gate mutation tests, and the forbidden-deployment-path proof (both directions).

## What reused shared infrastructure with ZERO code changes to it

Identical list to the fishbone slice: `platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py` -- plus, this time, `core/domain/evidence.py::evidence_record` for the KnowledgeSet items (the first reuse of that specific builder outside the research slice).

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_swot_slice` | `PASS strategy.swot: 3 factors, gates [provenance_required=PASS, evidence_labeling_required=PASS], forbidden_deployment_path_blocked=True` |
| Unit tests | `python -m unittest tests.unit.test_swot -v` | 15 passed |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2518 passed, ALL GOLDEN TESTS PASSED (2510 before this slice's fixture addition) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

Mutation evidence (`tests/unit/test_swot.py`): stripping a factor's `provenance` turns `provenance_required` FAIL; an `EVIDENCE`-labeled factor with no `supporting_evidence_refs` turns `evidence_labeling_required` FAIL (Atlas's own named misuse, L1347: writing "strong brand"/"large market" without evidence); an invalid `category` value is refused at construction time, not left to schema validation to catch later; the forbidden-deployment-path guard is proven both directions (already blocked today; would raise loudly if a rogue contract ever made it resolvable).

## Honest limits (not silently completed, not hidden)

* **`KnowledgeSet` has no dedicated typed-object schema** (`OQ-SWOTANALYSIS-1`) -- represented as a runtime convention (a list of Evidence records), not a ratified type.
* **The legal chain past `SWOTAnalysis` is not built.** Atlas's own legal path (`SWOTAnalysis -> TOWS -> StrategyOptions -> MCDA -> DecisionCandidate -> HumanDecision`, L3536-3544) needs five further methods, none of which have contracts in this spec root (`strategy.swot.contract.yaml`'s own `OQ-SWOT-1`). This slice proves SWOT itself works and that the dangerous direct shortcut is blocked; it does not claim the full strategic-decision pipeline exists.
* **Atlas's semantic misuses are not mechanically checked.** Common misuse #2 (treating an action like "launch new product" as an Opportunity) and usage step 4 (separating facts from strategy) are both judgments about a factor's free-text `statement` -- no NLP exists here to catch them structurally. Documented in `swot-analysis.schema.yaml`'s own `OQ-SWOTANALYSIS-2` rather than silently claimed as covered.
* **No AI model / capability call**, same as the fishbone slice -- `strategy.swot`'s contract doesn't require one; the factors here are synthetic input data.
* **The EC §10 14-state execution machine is out of scope**, same scope decision as the fishbone slice, for the same reason (the shared `build_current_state` helper is hard-coded to the research slice's own dimension text).

## What this measures, honestly

A THIRD method, a DIFFERENT shape again (classification, not hypothesis-generation), assembled against the same unmodified core infrastructure -- and, new this time, the spec-root layer itself (a missing typed-object schema) got backfilled in the same session using the exact discipline the existing schemas already established, without needing an ADR or slowing down to a separate governance cycle. This is a second, stronger data point for the "LEGO can assemble" claim: it now covers a case where the *contract* existed but the *type* didn't, and the slice still landed same-session.
