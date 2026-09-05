# Thirty-second Method Atlas slice: `devops_sre.release_readiness_review`

Status: **LANDED (2026-09-05)**. SEVENTH slice from the `devops_sre` family (F19), after `devops_sre.sli_slo` (twentieth), `devops_sre.canary_deployment` (twenty-first), `devops_sre.chaos_engineering` (twenty-second), `devops_sre.blue_green_deployment` (twenty-third), `devops_sre.error_budget` (twenty-fourth), and `devops_sre.capacity_model` (thirty-first).

## What was built

Atlas gives this method exactly one citation: the F19 tool table's own Release Readiness Review row (L862: "change/data/security/observability/rollback/capacity", benefit "防漏掉跨域風險" -- prevent MISSING cross-domain risk). The formula's own six named domains are a CLOSED, exhaustive set -- Atlas lists exactly six, not "at least these" -- directly grounding a completeness invariant (assess all six, no fewer, no duplicates, no domain outside the set) and an aggregation invariant (`overall_status: ready` requires every domain to itself be `ready`, the same "one failing part propagates to the whole" pattern `devops_sre.canary_deployment`'s own unhealthy-forbids-completed invariant already established).

* `methods/contracts/devops_sre.release_readiness_review.contract.yaml`, `specs/cognitive/typed-objects/release-readiness-review-record.schema.yaml` (spec-root suite 2780 -> 2783).
* `ai_lego/modules/devops_sre/release_readiness_review.py` -- builder + 2 gates, sharing `_record_identity_is_valid`/`_duplicate_domains`/`_missing_domains`/`_assessment_keys_are_known`/`_assessment_is_valid` predicates between builder and gate.
* `ai_lego/apps/cli/run_release_readiness_review_slice.py` -- a real all-ready case and a real not-ready case (security domain failed with a documented reason), plus two-layer attack-and-confirm.
* `tests/unit/test_release_readiness_review.py` -- 39 tests.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Critic round: a due-diligence gap (not a code bug) plus the capacity_model-class gate gap, reintroduced

A `critic` subagent review found the core completeness/aggregation invariants genuinely sound (exhaustively verified across all 462 six-multisets of the six canonical domains) -- but found one Critical-tier due-diligence gap and several Major code findings, most notably the SAME class of bug `devops_sre.capacity_model`'s own critic round caught one slice earlier.

1. **Critical, fixed** -- this contract's own citation due-diligence grep ("release.readiness"/"go.live"/"readiness.review") was too narrow to surface a genuinely overlapping, ACTIVE artifact: `policies/ai-execution/release-policy.yaml`'s own EC §143 Pre-release Checklist (11 items), five of which map closely onto five of this method's own six domains. Not a duplicate of this method's own deliverable (that file is policy-as-code gate-binding, a different layer than a cognitive review record) -- but the relationship should have been found and disclosed, not silently missed. Fixed by correcting the contract's own description/verification text and adding a compilation_decision plus a new open question (`OQ-RELEASEREADINESS-3`) documenting the real relationship.
2. **Major, fixed (repeat)** -- `evaluate_readiness_integrity_gate` recomputed completeness and the aggregation verdict but never re-validated the record's own `id`/`release_ref` fields, or an assessment's own key set -- the exact "gate recomputes outputs but not the inputs those outputs depend on" class `devops_sre.capacity_model`'s own critic round caught one slice earlier, reintroduced here despite that lesson being fresh. Fixed with a shared `_record_identity_is_valid` predicate (called by both builder and gate) and a new `_assessment_keys_are_known` check in the gate.
3. **Major, fixed** -- the shared `_assessment_is_valid` predicate validated `note`'s own shape only for the `not_ready` case, leaving a `ready` assessment's own note (including a non-string value, or a mutable object a caller could mutate after certification) completely unvalidated at the layer both builder and gate share -- `domain_assessment()`'s own separate, stricter check masked this for the one entry point that used it, but not for hand-built input. Fixed by validating note's shape unconditionally in the shared predicate.
4. **Major, fixed** -- the contract claimed a `contract-backlog.yaml` registration that did not exist -- fixed by adding it.

Minor findings also fixed: `_missing_domains` is provably unreachable given the other checks (verified by exhaustive enumeration), but two tests were misleadingly named/documented as if it were the mechanism actually catching their own scenario -- renamed and clarified rather than removed (kept as a disclosed tripwire); a weak-oracle test (`status == "FAIL"` with no evidence assertion) was proven, by a real mutation, unable to distinguish the specific guard it claimed to test -- pinned; both gates raised a raw `AttributeError` on a non-dict record despite their own docstrings claiming unconditional fail-closed behavior -- fixed with an `isinstance` guard; a module error message misattributed "上線前統一檢查" to Atlas's benefit column when it is actually the row's own 用途 (used-for) column -- corrected.

The broader lesson this round adds: a lesson learned one slice earlier ("the gate must re-validate the inputs its outputs depend on, not just the outputs") is not automatically applied to a *different* set of inputs in the next slice just because the general principle was stated -- each new slice's own specific raw-input fields (here: `id`/`release_ref`, an assessment's own key set) must be individually checked against that same principle, not assumed covered by having internalized the lesson in the abstract.

## Evidence

CLI (post-fix): `PASS devops_sre.release_readiness_review: 6 domains assessed, overall_status=ready, gates [provenance_required=PASS, readiness_integrity=PASS], invariant_verified(construction=True, gate=True)`. 39 unit tests passed (32 first draft -> 39 after the critic-fix round), including non-string/mutable-note regressions, record-identity regressions, and an extra-field regression, all evidence-pinned. Golden suite 2783 (2780 before this slice). Full product-root regression: 856 tests OK (849 before this slice, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-RELEASEREADINESS-1`, same disclosed-not-silent pattern as every prior slice this session). The `capacity` domain (and the other five) could in principle be backed by a real soft-linked record from a dedicated method (`devops_sre.capacity_model` for `capacity`) -- no such cross-reference field exists yet (`OQ-RELEASEREADINESS-2`). The relationship between this method's own six-domain formula and `release-policy.yaml`'s own EC §143 eleven-item checklist is disclosed but not cross-referenced in either direction (`OQ-RELEASEREADINESS-3`).
