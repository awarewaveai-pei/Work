# Eighth Method Atlas slice: `learning.reversal_criteria` -- a fifth structural shape, a monitoring rule

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema + a fourth new deterministic-compute module. First slice from the `learning` family (F17).

Context: same TASKS.md item as the previous seven slices. Chosen specifically to open a fifth structural shape this session hadn't built yet, and because Atlas §11.33 gives this method the strongest literal-example grounding of any Tier 1 contract built so far -- a real worked YAML example, not a diagram or prose description.

## The fifth shape

* `root_cause.fishbone` -- hypothesis generation (a flat list).
* `root_cause.five_whys` -- narrative, evidence-cited chain.
* `strategy.swot` -- classification (four fixed buckets).
* `root_cause.pareto` -- calculated result (a ranked list).
* `causal.dag` -- a graph (nodes with causal roles, directed edges).
* `decision.ahp` -- a pairwise-comparison matrix with a derived weight vector.
* `learning.reversal_criteria` -- a **monitoring rule**: indicator + condition + committed action + accountable owner, meant to be evaluated repeatedly over time against real observations, not produced once and left static. The only method this session built whose typed object's job is to be checked again and again after creation, not just validated once at construction time.

## The strongest literal-example grounding this session found

Atlas §11.33 (L1980-1985) gives a complete worked YAML example, not a diagram or a numbered step list:

```yaml
reversal:
  indicator: CAC
  condition: "> 300 USD for 3 consecutive months"
  action: re_review
  owner: growth_lead
```

`typed-objects/reversal-criteria-set.schema.yaml`'s `indicator`/`condition_description`/`action`/`owner` fields are this exact structure, field names unchanged. This is the first Tier 1 schema this session built where the worked example IS already in the target data shape, not something that needed reshaping from prose or a diagram into a record.

## A structured rule alongside the literal free text, not instead of it

Atlas's own condition (`> 300 USD for 3 consecutive months`) happens to be mechanically simple, but real reversal criteria are frequently qualitative judgment calls with no clean numeric threshold. `condition_description` (Atlas's own literal free-text field, always required) is paired with an OPTIONAL `structured_rule` (`operator`/`threshold`/`consecutive_periods`) a caller may additionally supply when the condition genuinely is this simple -- the same "literal field plus a separate, optional structured mechanism" pattern `strategy.swot`'s `source`/`supporting_evidence_refs` split already established. This session's demo slice includes one of each: the CAC criterion carries a real `structured_rule`; a second, deliberately qualitative "platform escalation count" criterion does not.

## A real trigger, evaluated both ways

`ai_lego/compute/monitoring/triggers.py::consecutive_threshold_triggered` checks whether the LAST N observations all satisfy a comparison -- hand-verified against five cases before being wired in (Atlas's own crossing example, a dip that breaks the streak, insufficient history, and the boundary difference between `>` and `>=` at exactly the threshold value). `ai_lego/apps/cli/run_reversal_criteria_slice.py` runs the CAC criterion against two different observation histories in the same slice: one that does NOT trigger (`[250, 310, 290, 305]` -- the dip at month 2 breaks the 3-month streak) and one that DOES (`[250, 310, 320, 305]`), demonstrating the check is real comparison logic against real data, not a constant. The qualitative criterion (no `structured_rule`) evaluates to `None`, not `False` -- a criterion this codebase genuinely cannot mechanically check must stay distinguishable from one it checked and found not-yet-triggered.

## A precondition re-checked as a real gate, not just trusted at construction

Atlas's own named benefit for this method (L1990: prevents an organization refusing to change course to save face) depends entirely on a criterion actually having an accountable owner and a defined action -- decorative criteria with empty fields would defeat the method's whole purpose. `reversal_criterion()` refuses to construct a record with an empty `owner`/`action` at build time, AND `evaluate_actionable_gate` re-checks the same property structurally on any record it's handed -- proven by a mutation test that hand-tampers a valid record's `owner` to whitespace-only and confirms the gate independently catches what the builder's own check would have caught, rather than trusting that every record it ever sees passed through the builder honestly.

## What was built

* `methods/contracts/learning.reversal_criteria.contract.yaml` -- new, Atlas §11.33 (L1971-1995) verbatim citation including the literal worked YAML example. Registered as `contract-backlog.yaml`'s sixth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/reversal-criteria-set.schema.yaml` + golden fixtures (spec-root suite 2565 -> 2576).
* `ai_lego/compute/monitoring/triggers.py` -- pure deterministic consecutive-threshold compute, hand-verified against five known cases.
* `ai_lego/modules/learning/reversal_criteria.py` -- the method layer: builders, trigger evaluation, two gates.
* `ai_lego/apps/cli/run_reversal_criteria_slice.py` -- an end-to-end runnable slice exercising both the triggered and not-triggered cases in one run.
* `tests/unit/test_reversal_criteria.py` -- 19 tests, all passing on the first run: real trigger-logic correctness on 6 known cases, spec-root schema conformance, gate mutation tests, and the None-vs-False distinguishability test.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_reversal_criteria_slice` | `PASS learning.reversal_criteria: 2 criteria, gates [provenance_required=PASS, actionable=PASS], trigger dip-case=False, trigger crossing-case=True, qualitative-criterion-evaluable=None` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_reversal_criteria -v` | 19 passed (first run, no fixes needed) |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2576 passed, ALL GOLDEN TESTS PASSED (2565 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **`DecisionRef` is a free-text reference, not a hard `$ref` to a real `Decision` typed object** -- `docs/architecture/REPOSITORY_ARCHITECTURE.md`'s own ruling that `Decision` belongs at `/core/domain/decision` has not yet been implemented as a real schema in this spec root (`OQ-REVERSALCRITERIA-1`).
* **This method's scope stops at defining criteria and checking whether a threshold has been crossed.** It does NOT perform the re-review/reversal action itself -- Atlas gives no worked detail for what "re_review"/"kill" concretely do at the platform level (`OQ-REVERSALCRITERIA-2`).
* **`cognitive_primitives: [VALIDATE, REFLECT, LEARN]` is inferred, not cited** (`OQ-REVERSALCRITERIA-3`), same honesty class as every other Tier 1 contract's inferred primitives.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The first method this session built whose real purpose is ongoing evaluation, not one-shot production -- and confirmation that this codebase's genuine-compute discipline (real algorithms, hand-verified against known cases before being trusted) extends naturally to time-series/sequential conditions, not just the ranking and matrix math the two prior compute modules covered. Eight slices in, five structural shapes, zero regressions across a 347-test suite (pending the background run's exact count) -- the "LEGO can assemble" claim has now been tested against a genuinely wide variety of method shapes within a single family of the Atlas, not just repeated instances of the easiest case.
