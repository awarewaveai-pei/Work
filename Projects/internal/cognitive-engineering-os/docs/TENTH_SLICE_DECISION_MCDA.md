# Tenth Method Atlas slice: `decision.mcda` -- the natural extension of `decision.ahp`, and the first cross-family scoring-function reuse

Status: **LANDED (2026-09-04)** -- real run, real tests, real schema conformance, new spec-root contract + typed-object schema. Second slice from the `decision` family (F16), extending `decision.ahp`.

Context: same TASKS.md item as the previous nine slices. Chosen because it was explicitly named as a candidate in both the ninth slice's own docs and TASKS.md's "下一步" note ("`decision.mcda`（同 F16，Atlas §11.32 有專屬小節）是 AHP 的自然延伸"), and because it turned out to have an explicit, table-cited forbidden-authority rule (Atlas §22.3, L4154) -- the same class of strong grounding the ninth slice (`challenge.red_team`) had, giving this session two Tier 1 contracts in a row with a directly-cited rather than inferred `forbidden_transition`.

## Due diligence found something better than "no duplicate": an anticipated extension point

Before writing anything, `specs/decision/` and `specs/cognitive/typed-objects/` were read in full (the proactive check this session's own `learning.reversal_criteria` correction established, applied a second time after `challenge.red_team`). This did not just fail to find a duplicate -- it found that `specs/decision/decision.schema.yaml` (built a prior session) already anticipates this exact gap. Its `analyses[]` field is deliberately left `items: {}` (unconstrained), and its own `compilation_decisions` (OQ-DECISION-2) states verbatim: "A richer per-field shape belongs in a future MCDA-specific or recipe-specific schema that actually specifies one, not in this base `Decision` type." `methods/contracts/decision.mcda.contract.yaml` and `specs/cognitive/typed-objects/mcda-analysis.schema.yaml` are that schema -- confirmed as the intended extension point, not a duplicate of `Decision` itself, which remains the chain-terminal object an `MCDAAnalysis` feeds into via `Decision.analyses[]`, never replaces.

## Two citations that agree on substance, disagree on order -- disclosed, not silently resolved

Atlas gives MCDA two independent citations: the dedicated §11.32 flowchart (`Options -> Criteria -> Weights -> Normalize -> Score -> Sensitivity -> Stakeholder Views -> Human Decision`) and the F16 tool-table's compact row (`criteria→normalize→weights→score→sensitivity`). Both agree on the five substantive stages; they disagree on whether Weights or Normalize comes first. Rather than silently picking one and citing only it, the method contract's own `compilation_decisions` discloses the tension directly and explains why it is immaterial: normalization and per-criterion weighting are independent, commutative operations for a weighted-sum model -- neither stage's output depends on having already run the other. The compute layer normalizes first (a concrete engineering reason: it lets `normalize_scores` be unit-tested in complete isolation from any particular weight set, the same "hand-verify the pure compute function first" discipline every prior genuine-compute slice already followed).

## The real difference between AHP and MCDA, made explicit instead of assumed

Both methods end in a weighted-sum ranking of options against criteria. It would have been easy to build `decision.mcda` as "AHP minus pairwise comparison" without examining whether that erases a real distinction Atlas draws. It does not: Atlas gives AHP a specific weight-DERIVATION technique (pairwise comparison, §11.31) and gives MCDA no derivation method at all -- Weights is just named as an input stage. This is the actual, cited difference: AHP produces a weight set; MCDA accepts one from any source. The method contract's own `compilation_decisions` makes this explicit rather than leaving it implicit, and notes that a caller wanting AHP-derived weights feeding an MCDA run can already do so today with zero new code -- call `decision.ahp`'s `geometric_mean_weights` first, then pass its output into `generate_mcda_analysis`'s `weights` parameter. This composability is a property of the platform's existing design, not something this contract needed to hard-wire.

## The first cross-family reuse of a scoring function, not just a validation gate

Every prior genuine-compute reuse this session built shared a validation GATE (`evaluate_statistical_gate`, reused unchanged across research/pareto/AHP, and now MCDA -- a fourth family). This slice goes one step further: `ai_lego.compute.ahp.weights.rank_options` -- the actual weighted-sum SCORING function -- is imported and reused unchanged from `ai_lego/modules/decision/mcda.py`. Reading its implementation before deciding to reuse it (not assuming) confirmed it has nothing AHP-specific: a plain `dict[str, float]` of criterion weights plus a plain list of `{option_id, criterion_id, score}` entries in, a sorted ranking out. Relocating it into a new "family-neutral" module was considered and rejected -- it would touch `decision.ahp`'s own already-shipped, zero-diff-verified module for a pure code-organization preference, against this session's own minimal-blast-radius discipline. `git diff --stat` on `ai_lego/compute/ahp/weights.py` confirms zero changes.

## Two governance rules from the same Atlas table, independently re-derived

Atlas §22.3's "Method-specific Gate" table is the same table that grounded `challenge.red_team`'s no-final-authority rule (L4152: "Red Team | Final Decision | Independent Judge / Human") -- its MCDA row (L4154) reads "MCDA | Automatic Authority | Human Judgment + Sensitivity". This slice enforces it the same two-layer way: `assert_no_automatic_authority_claim` raises before construction on a representative blocklist of authority-shaped keys, and `mcda-analysis.schema.yaml`'s own `additionalProperties: false` independently refuses a hand-crafted bypass. The CLI (`run_mcda_slice.py`) proves both layers fire for real, the same attack-and-confirm pattern `run_red_team_slice.py` already established. The guard function is a fresh, independent implementation (not imported from `challenge/red_team.py`) -- the conceptual pattern is shared across methods, but the code is not, consistent with how every prior forbidden-transition/failure-mode guard in this codebase is its own local implementation despite family resemblance.

The table's SECOND requirement -- "Sensitivity" -- gets honest, disclosure-only treatment. `decision.ahp.contract.yaml`'s own OQ-AHP-2 left AHP's identically-named Sensitivity stage fully unimplemented (Atlas names the concept but gives zero worked formula anywhere). MCDA's own §22.3 citation makes Sensitivity part of the REQUIRED verification, not just an optional pipeline stage -- so this contract goes one step further than AHP's choice: `sensitivity_notes` is a REQUIRED, non-empty field, and `evaluate_sensitivity_disclosed_gate` checks its presence. This is honest about checking PRESENCE of documentation, not correctness or completeness of any particular sensitivity methodology -- no formula is invented.

## What was built

* `methods/contracts/decision.mcda.contract.yaml` -- new, Atlas §11.32 (L1942-1965) + F16 tool-table row (L768) + §22.3 gate row (L4154), three independent citations. Registered as `contract-backlog.yaml`'s eighth `tier_1` concrete entry.
* `specs/cognitive/typed-objects/mcda-analysis.schema.yaml` + golden fixtures (spec-root suite 2590 -> 2602).
* `ai_lego/compute/mcda/scoring.py` -- `normalize_scores` (direction-aware min-max, hand-verified against 3 known cases: mixed-direction, tied criterion, 3-option all-minimize) and `validate_weights_sum_to_one`.
* `ai_lego/modules/decision/mcda.py` -- builder, automatic-authority guard, four gates. Imports `rank_options` from `ai_lego.compute.ahp.weights` unchanged.
* `ai_lego/apps/cli/run_mcda_slice.py` -- a real build-vs-outsource decision (cost/speed/maintainability tradeoff), plus the same authority-smuggling attack-and-confirm pattern `run_red_team_slice.py` established.
* `tests/unit/test_mcda.py` -- 22 tests, all passing on the first run: compute-layer arithmetic (3 known normalization cases, weight-sum validation), schema conformance, the two-layer authority-claim proof, and gate-reuse verification (`genuine_compute` proven to be the exact same function object `evaluate_statistical_gate` already reused by pareto and AHP).

## What reused shared infrastructure with ZERO code changes to it

`platform/ai_execution/method_resolver.py`, `core/contracts/schema_contracts.py`, `data/events/event_ledger.py`, `core/contracts/ledger_guards.py`, `core/domain/provenance.py`, `modules/research/gates.py`, `ai_lego/compute/ahp/weights.py`, `ai_lego/modules/decision/ahp.py`.

## Evidence (real run, this machine, 2026-09-04)

| Check | Command | Result |
|---|---|---|
| Compute hand-verification | `python3 -c "..."` (3 known normalization cases + weight-sum validation) | All 3 cases matched hand-calculated values exactly, before wiring into the method layer |
| CLI slice | `python -m ai_lego.apps.cli.run_mcda_slice` | `PASS decision.mcda: ranking=[...O2=0.7, O1=0.3...], gates [...], no_automatic_authority_verified(runtime=True, schema=True)` (passed on the first real run) |
| Unit tests | `python -m unittest tests.unit.test_mcda -v` | 22 passed, first run, no fixes needed |
| Spec-root golden suite | `python3 tests/gen_spec_index.py && python3 tests/run_golden_tests.py` | 2602 passed, ALL GOLDEN TESTS PASSED (2590 before this slice) |
| Full product-root suite (regression check) | `python -m unittest discover -s tests -t .` | see WORKLOG 2026-09-04 entry for this task |

## Honest limits (not silently completed, not hidden)

* **`recommended_next` is empty**, not because there is nothing to recommend -- Atlas §22.3 explicitly names "Human Judgment" as the required next step, but that is a `Decision` object FIELD (`Decision.human_judgment`), not a callable Method Atlas machine_id, so it cannot legally populate a schema field constrained to `^[a-z_]+\.[a-z_]+$` (`OQ-MCDA-3` records this).
* **A single `weights[]` field, not multiple weight profiles.** Atlas's own benefit prose ("可以保留不同 stakeholder weights") suggests multi-stakeholder weight comparison, but gives zero field shape or worked example for it -- inventing a `weight_profiles[]` array would be presenting a guess as a compiled fact. The benefit remains genuinely available without new schema surface: `generate_mcda_analysis` is a pure function, so a caller can invoke it once per weight set (`OQ-MCDA-1`).
* **`sensitivity_notes` enforces presence, not correctness.** No sensitivity-analysis formula is computed anywhere in this codebase for either AHP or MCDA (`OQ-MCDA-2`).
* **`cognitive_primitives: [COMPARE, WEIGHT, CALCULATE, PRIORITIZE]` is inferred, not cited** -- unlike AHP's own Atlas §4-cited formula, MCDA is not among the 5 methods Atlas gives a primitive-composition citation to. DECIDE is deliberately excluded from the inference (not an oversight) precisely because §22.3 forbids this method's own output from claiming decision authority.
* Same scope decisions as every prior slice: no EC §10 state-machine walkthrough, no AI model/capability call.

## What this measures, honestly

The strongest LEGO-reuse evidence this session has produced: not just a shared validation gate (now proven four times across four unrelated families) but a shared SCORING function, reused across two methods within the same family that are similar enough to tempt code duplication -- and the decision NOT to duplicate, nor to relocate the shared code, was itself examined and disclosed rather than assumed. Combined with the proactive due-diligence that turned up `decision.schema.yaml`'s own anticipated extension point, this slice is the clearest evidence yet that lessons learned earlier in the session (the reversal_criteria correction, the red_team due-diligence habit) are compounding rather than being applied once and forgotten.
