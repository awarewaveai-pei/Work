# Seventh Method Atlas slice: `decision.ahp` -- first standalone decision method, and a real bughunt catch

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema + a third new deterministic-compute module. First slice from the `decision` family (F16), and the first slice this session that is NOT chained off a `CauseHypothesisSet`.

Context: same TASKS.md item as the previous six slices. After landing `causal.dag` (the fourth structural shape), this slice deliberately opened a brand-new family instead of continuing the `root_cause` chain -- `decision.ahp` (Analytic Hierarchy Process), chosen because Atlas §4 (L192) directly cites this method's own primitive composition ("AHP = COMPARE + WEIGHT + PRIORITIZE + DECIDE"), the strongest primitive grounding of any Tier 1 contract this session built (every other one -- `root_cause.five_whys`, `root_cause.pareto`, `causal.dag` -- disclosed an inferred composition).

## A real bughunt catch, fixed before commit

This session's standing R4 discipline ("每次改動後 grep 你剛修的確切字串... 命中一起修，同一 commit") caught something real this time: `docs/architecture/REPOSITORY_ARCHITECTURE.md` (ACCEPTED 2026-08-30, the repository's own governing architecture document) explicitly rules that `/modules/decision` **should be removed** and merged into `/core/domain/decision` -- because `Decision` is a Shared Kernel Domain Object referenced across nearly every vertical (Authorship, Audit, etc.), not something that needs its own engine module.

This new slice's package (`ai_lego/modules/decision/ahp.py`) shares that exact path segment -- but is a genuinely different thing: an Atlas Method Family grouping cognitive TECHNIQUES (AHP, and future siblings like MCDA), not an engine for the `Decision` object itself. The collision is a naming coincidence between two independently-evolving specs (Master Plan §80's Domain-Object module candidates, evaluated by that document's bounded-context table, vs. Atlas's own Method Family taxonomy, which that SAME document separately rules Atlas has authoritative ownership of) -- not an actual architectural conflict, but genuinely confusing without a pointer.

Resolved with a minimal, targeted addition (not a rewrite of the document's actual ruling): a disambiguation paragraph appended after the bounded-context table, explaining that the `decision` row's removal ruling still stands for the Domain Object engine, and that this session's `modules/decision/` is a separate, already-authorized thing (Atlas's own Method System layer, which the same document grants Atlas authoritative ownership of one section earlier). `ai_lego/modules/decision/ahp.py`'s own docstring carries a matching pointer back to that note, so a reader who finds the code first also finds the disambiguation.

## The compute layer, hand-verified against known Saaty-method cases

`ai_lego/compute/ahp/weights.py` implements Saaty's own published method: pairwise-comparison matrix construction, normalized row-geometric-mean weight derivation, and the Consistency Ratio check (Saaty's own 0.10 acceptance threshold). Before being wired into anything else, it was hand-verified against three known cases:

* A **perfectly consistent** matrix (true weight ratio exactly 4:2:1) -> weights exactly `[4/7, 2/7, 1/7]`, CR = 0.0.
* A **mildly inconsistent** textbook example -> small but nonzero CR, well under the 0.10 threshold.
* A **deliberately circular** preference set (A>B by 9, B>C by 9, C>A by 9) -> CR = 6.13, correctly flagged as highly inconsistent, even though the weight-averaging alone produces a deceptively "neutral" `[0.33, 0.33, 0.33]` result -- exactly the failure mode Saaty's Consistency Ratio exists to catch, and exactly why `evaluate_consistency_gate` is a real, independent gate, not decoration.

## A gate reused for the SECOND time across method families

`evaluate_genuine_compute_gate` reuses `modules.research.gates.evaluate_statistical_gate` **unchanged** -- the same function `root_cause.pareto` already proved generalizes beyond its original Cohen's Kappa purpose. This is now the third method family (research, root_cause, decision) leaning on one gate function, because it only ever inspects the three generic genuine-compute fields (`provenance`, `computation_provenance_ref`, `engine`) every `CALCULATED_RESULT` record in this codebase now carries by convention.

## Deliberately disclosed scope limits (not fabricated content)

Atlas's own 7-stage AHP pipeline names "Sensitivity" as its final stage but gives it zero worked detail anywhere -- no formula, no example. Per this codebase's R4 discipline, this slice does **not** implement it (disclosed as `OQ-AHP-2`, not silently skipped). Likewise, "Criteria hierarchy" implies a multi-level tree, but Atlas gives no worked multi-level example, so this slice's `criteria` is a flat list (`OQ-AHP-1`) -- a real, complete AHP use case in its own right (Saaty's own original worked examples are frequently single-level), not a placeholder.

## What was built

* `methods/contracts/decision.ahp.contract.yaml` -- new, Atlas §11.31 (L1910-1939) verbatim citation plus the directly-cited §4 primitive formula. Mints a new machine_id (`decision.ahp`) since `method-inventory.yaml`'s own "AHP" entry carries none. Registered as `contract-backlog.yaml`'s fifth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/ahp-analysis.schema.yaml` + golden fixtures (spec-root suite 2554 -> 2565).
* `ai_lego/compute/ahp/weights.py` -- pure deterministic Saaty-method compute, hand-verified against three known cases.
* `ai_lego/modules/decision/ahp.py` -- the method layer: builder, three gates (one reused for the second time, one new: `evaluate_consistency_gate`).
* `ai_lego/apps/cli/run_ahp_slice.py` -- an end-to-end runnable slice: a real 3-criteria, 2-option product-prioritization decision.
* `tests/unit/test_ahp.py` -- 16 tests: real Saaty-method arithmetic on 4 known cases, spec-root schema conformance, gate reuse proof, and consistency-gate mutation tests. Caught and fixed a genuine test-design bug of its own (see below).

## A test bug caught by real execution

The first draft of `test_rank_options_computes_correct_weighted_sums` asserted a specific winning option in what turned out to be an exact tie (both options scored 0.5 under the test's original weights) -- the assertion failed on the first real run, correctly, because sort order in a genuine tie is not a real correctness property. Fixed by adjusting the test's own input scores to produce an unambiguous winner (0.6 vs 0.5), with the arithmetic shown inline as a comment. Left in this doc as a second honest example (after `root_cause.five_whys`'s evidence-ref bug) of real execution catching a real mistake on the first try.

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`, AND (for the second time) `ai_lego/modules/research/gates.py::evaluate_statistical_gate`.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| CLI slice | `python -m ai_lego.apps.cli.run_ahp_slice` | `PASS decision.ahp: weights=[('C1', 0.5714), ('C2', 0.2857), ('C3', 0.1429)], CR=0.0, consistent=True, ranking=[...], gates [provenance_required=PASS, genuine_compute=PASS, consistency_required=PASS]` (passed on the first real run, weights matching the hand-verified compute-layer test exactly) |
| Unit tests | `python -m unittest tests.unit.test_ahp -v` | 16 passed (after fixing the tie-case test bug) |
| Spec-root golden suite | `python3 tests/run_golden_tests.py` (from the spec root) | 2565 passed, ALL GOLDEN TESTS PASSED (2554 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **"Sensitivity" (Atlas's own final pipeline stage) is not implemented** -- zero Atlas-given detail exists to implement against (`OQ-AHP-2`).
* **"Criteria hierarchy" is flat, not multi-level** -- Atlas gives no worked multi-level example (`OQ-AHP-1`).
* **`decision.ahp.contract.yaml`'s `forbidden_transition` and `recommended_next` are both genuinely empty** -- Atlas gives neither for this method.
* **`method-inventory.yaml`'s own "AHP" row is not retroactively updated** with the newly-minted `decision.ahp` machine_id -- consistent with (not a new departure from) this session's own established precedent that per-citation registry rows are a separate, non-retroactively-synced bookkeeping layer (`OQ-AHP-3`).
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough.

## What this measures, honestly

The first slice to trigger a real cross-document consistency check against this repository's own ACCEPTED architecture spec -- and the first real demonstration that this session's own bughunt discipline (grep the new symbol names across the whole governed scope before considering a slice done) catches genuine, non-obvious conflicts, not just typos. Combined with a second cross-family gate reuse and a hand-verified, textbook-correct implementation of a real published algorithm (not a simplified stand-in), this is further evidence that the LEGO framing holds under real scrutiny, including scrutiny the session applied to itself.
