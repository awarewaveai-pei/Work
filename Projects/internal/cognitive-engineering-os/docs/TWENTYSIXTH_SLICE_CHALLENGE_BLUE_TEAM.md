# Twenty-sixth Method Atlas slice: `challenge.blue_team`

Status: **LANDED (2026-09-05)**. SECOND slice from the `challenge` family (F12), directly closing half of `challenge.red_team`'s own `OQ-REDTEAM-1`.

## What was built

Atlas §11.24 gives this method a dedicated section: purpose (L1742, not blindly endorsing the original proposal, but steelmanning it to its strongest version) across 5 named improvement categories (L1744-1748: controls / evidence / fallback / monitoring / recovery), plus the F12 tool table's own row (L645, usage formula + benefit column "避免只破壞不改善"), plus the explicit pairing "Blue Team → Red Team → Independent Judge" (L1751) `challenge.red_team.contract.yaml` already cited.

The real invariant: a review that records zero improvements did not actually steelman anything -- grounded in two independent citations (the purpose line's own negation, and the F12 table's own benefit column). This is a deliberate tightening relative to `challenge.red_team`'s own sibling precondition, not the same class: `RedTeamChallenge` explicitly permits an empty `findings[]` (a dimension may be examined and found clean); `BlueTeamReview` does not permit an empty `improvements[]`.

Deliberately does NOT mirror Red Team's own explicit no-final-authority structural lockdown (`additionalProperties: false` at the top level, plus a runtime authority-key guard) -- Atlas gives that rule (L1735) only for Red Team. Strengthened on review: §22.3's own closed Method-specific Gate table (L4144-4155) independently omits Blue Team too, an *expressio unius* argument stronger than "the sentence isn't repeated."

* `methods/contracts/challenge.blue_team.contract.yaml`, `specs/cognitive/typed-objects/blue-team-review.schema.yaml` + fixtures (spec-root suite 2744 -> 2753).
* `ai_lego/modules/challenge/blue_team.py` -- builder + two gates (`provenance_required`, `at_least_one_improvement`).
* `ai_lego/apps/cli/run_blue_team_slice.py` -- strengthens the SAME synthetic proposal `run_red_team_slice.py` attacks, directly answering its finding (no rollback plan) with a real fallback + monitoring addition.
* `tests/unit/test_blue_team.py` -- 20 tests.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Critic round: a fabricated verification claim, a test that didn't prove what it claimed, and gate/builder crashes on malformed input

The first-pass implementation (12 tests, all green) had two real Major defects and several Minor ones a `critic` subagent review caught:

1. **Major, fixed** -- the contract's own `verification` section and `OQ-BLUETEAM-2` falsely claimed "'Independent Judge' has zero hits anywhere in Atlas beyond the L1751 pairing line" -- an R4 grep-before-claiming failure. Atlas actually gives Independent Judge a real F12 table row (L646), a flow-diagram node (L659), and a recipe mention (L3306). Rewrote both sections to disclose the real citations and reframe the open question from "can this be built" to "should a future session build it."
2. **Major, fixed** -- `test_hand_tampered_wrong_epistemic_type_still_passes_provenance_gate` used `AI_INFERENCE`, which `challenge.red_team`'s own evidence gate also passes -- it proved nothing about the claimed divergence (`evidence_labeling_required: false`). Rewrote to use an `EVIDENCE`-labeled improvement with no supporting refs (the one case that genuinely differs), and added a second test that actually runs the same shape through `red_team`'s own gate to confirm it fails there.
3. **Minor, fixed** -- `generate_blue_team_review`'s post-empty-check category re-validation used `item["category"]` (KeyError on a hand-built dict missing the key, not `InvariantViolation` -- unreachable by the CLI's own exception handler). A mutation test (deleting the check) proved 12/12 tests stayed green, meaning the check itself was uncovered. Fixed to `.get()` with an explicit shape guard, plus 3 new regression tests.
4. **Minor, fixed** -- `evaluate_provenance_required_gate` used `item["id"]`, crashing (not FAILing) on a non-dict or `id`-less improvement -- the exact kind of hand-tampered record the gate exists to catch. Fixed to fail closed; `evaluate_at_least_one_improvement_gate` also hardened against a non-list `improvements` value (a bare string is `len()`-able and would otherwise silently count characters).
5. **Minor, fixed** -- the "same class as red_team's precondition" claim (contract, schema, module docstrings) was a mischaracterization -- corrected to disclose the deliberate tightening instead.
6. **Minor, fixed** -- this doc file, and the WORKLOG/TASKS entries, were missing on the first pass.
7. **Minor, fixed** -- the `supporting_evidence_refs` branch had zero test coverage (`with_evidence=True` was declared but never actually called with `True`); added a real assertion.
8. **Nit, fixed** -- `L1741` cited instead of `L1742` (the purpose sentence itself, not its label) in three places.
9. **Nit, adopted (upgrade, not just a fix)** -- added `additionalProperties: false` on `improvements[].items` (the nested shape, unlike the top level, is fully specified) to close silent typo-key acceptance (e.g. a missing trailing "s" on `supporting_evidence_refs`).
10. **Nit, disclosed not fixed** -- improvement `id` uniqueness is described as intended but not schema-enforced, matching the sibling `RedTeamChallenge`'s own identical, pre-existing, out-of-scope non-enforcement.

## Evidence

CLI (post-fix): `PASS challenge.blue_team: 2 improvements recorded, gates [provenance_required=PASS, at_least_one_improvement=PASS], invariant_verified=True`. 20 unit tests passed. Golden suite 2753 (2744 before this slice; unchanged across the critic-fix round -- the schema tightening didn't touch any existing fixture). Full product-root regression: 602 tests OK (594 before this slice's first pass -> 602 after the critic-fix round, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-BLUETEAM-1`). `challenge.independent_judge` (the third leg of Atlas's own pairing) remains unbuilt -- a real, citable candidate (F12 table row L646), deliberately deferred as a scope decision, not because Atlas gives nothing to build from (`OQ-BLUETEAM-2`, corrected after the critic round).
