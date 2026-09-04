# Second Method Atlas slice: `root_cause.fishbone` -- status, evidence, limits

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, local synthetic scope.

Context: `agency-os/TASKS.md` 2026-09-04 item "Cognitive OS 從『一個切片』擴展成『操作者要的完整平台』" (operator: "我要你全部做好"). The agreed first step was to pick ONE new method, structurally unlike `research.qualitative_coding`, and wire it through the existing `ai_lego` framework (event ledger, schema validation, method resolution, gate discipline) to measure real assembly time. This file is that measurement's record.

## Why `root_cause.fishbone` (F05)

Not invented for this task: `methods/contracts/root_cause.fishbone.contract.yaml` and its three typed-object schemas (`typed-objects/problem-statement.schema.yaml`, `typed-objects/cause-hypothesis-set.schema.yaml`, `typed-objects/root-cause-fact.schema.yaml`) already exist in the spec root, ACTIVE, ratified in an earlier session (2026-08-29, `MACHINE_READABLE_SPEC_PLAN.md` Tier 0). Picking a method that already has a ratified contract avoids re-opening spec-root governance (ADR-level work) inside what TASKS.md scoped as a runtime-assembly-speed test, and it is one of the two examples TASKS.md itself named (root cause F05 / decision F16).

Shape difference from `research.qualitative_coding`, deliberately: no open/axial/selective coder-agreement loop, no Kappa, no eval harness, no AI model call required. A single hypothesis-generation step (`ProblemStatement -> CauseHypothesisSet`) with a hard type boundary (`forbidden_transition`) immediately after it, per Atlas §14.1's chain `ProblemStatement -> Fishbone -> CauseHypothesisSet -> Evidence Search -> Causal DAG -> Validation -> RootCauseFact`.

## What was built

* `ai_lego/modules/root_cause/fishbone.py` -- builders (`build_problem_statement`, `cause_hypothesis`, `generate_cause_hypothesis_set`), two contract-declared gates (`provenance_required`, `evidence_labeling_required`), and the forbidden-transition guard (`record_validation_applied` / `attempt_promote_to_root_cause_fact`).
* `ai_lego/apps/cli/run_fishbone_slice.py` -- an end-to-end runnable slice.
* `tests/unit/test_fishbone.py` -- 17 tests: schema conformance against the real spec-root schemas (not a schema this test invents), method resolution/invocation through the unmodified `MethodCatalog`, and mutation-style gate/guard tests.

## What reused shared infrastructure with ZERO code changes to it

* `platform/ai_execution/method_resolver.py` (`MethodCatalog`) -- resolves and invokes `root_cause.fishbone` exactly the way it resolves `research.qualitative_coding`, because "registered" is defined once (an ACTIVE contract file), not per method.
* `core/contracts/schema_contracts.py` (`SchemaContracts`) -- validates `ProblemStatement`/`CauseHypothesisSet`/`RootCauseFact` instances against the real spec-root schemas.
* `data/events/event_ledger.py` (`EventLedger`) + `core/contracts/ledger_guards.py` (`PiiLedgerGuard`) -- records the run's domain events.
* `core/domain/provenance.py` (`provenance_is_valid`, `make_provenance`) -- the same three-axis provenance record every other module uses.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_fishbone_slice` | `PASS root_cause.fishbone: 3 hypotheses, gates [provenance_required=PASS, evidence_labeling_required=PASS], forbidden_transition_blocked=True` |
| Unit tests | `python -m unittest tests.unit.test_fishbone -v` | 17 passed |
| Full suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

Mutation evidence (all in `tests/unit/test_fishbone.py`): stripping a hypothesis's `provenance` turns `provenance_required` FAIL; an `EVIDENCE`-labeled hypothesis with no `supporting_evidence_refs` turns `evidence_labeling_required` FAIL (the fabricated-evidence-shaped defect class); a direct `CauseHypothesisSet -> RootCauseFact` promotion attempt (no validation method recorded) raises `FORBIDDEN_TRANSITION_BLOCKED` -- proven both for a freshly generated set AND for a deliberately inconsistent record (`validation_methods_applied` non-empty but `ready_for_promotion` stale `False`, proving the guard checks both fields rather than trusting a derived flag); the legal path (`record_validation_applied` then `attempt_promote_to_root_cause_fact`) succeeds and its output validates against `root-cause-fact.schema.yaml`.

## Honest limits (not silently completed, not hidden)

* **Promotion to `RootCauseFact` is deliberately not exercised for real.** The contract's own recorded open question (`root_cause.fishbone.contract.yaml` `OQ-FISHBONE-1`) says none of Fishbone's `recommended_next` methods (`root_cause.pareto`, `root_cause.five_whys`, `causal.dag`, `validation.experiment`) have a contract in this spec root yet. The CLI slice proves the forbidden-transition guard blocks a direct promotion attempt, then stops -- recording any of those four method names as "applied" without actually running them would be exactly the fabricated-evidence class of defect this codebase's gates exist to catch. The unit tests exercise the legal path with a synthetic method name (`"root_cause.five_whys"`), same class as `modules/research/gates.py`'s own synthetic fixtures proving structural correctness -- clearly not presented as a real run.
* **The EC §10 14-state execution machine is out of scope for this slice.** `run_research_slice.py`'s `build_current_state` hard-codes EC §11 dimension text specific to that slice's own modules/events; reusing it here without rewriting the content would itself be a fabricated record. This slice tracks milestones as a plain list instead. Wiring the full EC envelope generically (so any method slice can reuse it) is real follow-up work, not attempted here.
* **No AI model / capability call.** `root_cause.fishbone`'s contract does not require one (unlike `research.qualitative_coding`'s `AIGateway`-backed open coding); this slice's hypotheses are synthetic input data, structurally identical to what a future `ai_coding.py`-style `suggest_cause_hypotheses` function would produce (verbatim-evidence-span discipline would carry over directly).

## What this measures, honestly

A second, structurally different method assembled against the existing framework with zero changes to `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, or `provenance.py` -- only new domain code (`modules/root_cause/fishbone.py`) plus one new CLI entry point and one new test file. This is the signal TASKS.md asked this step to produce: real evidence the "LEGO can assemble" claim holds for a second shape, not just a second instance of the first shape. It does not, by itself, prove any of the remaining ~35 Atlas methods will be equally fast -- several (F18 Software Architecture, F19 DevOps/SRE, F20 Security/Privacy) are named as "packs" in the Atlas, not single tools, and are a different scale of work.
