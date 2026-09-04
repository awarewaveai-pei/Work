# Twenty-fifth Method Atlas slice: `database_data.backup_restore_drill`

Status: **LANDED (2026-09-05)**. FIRST slice from the `database_data` family (F21's own "資料庫／資料套件 / DB Data Pack") -- a third pack this session opens, after F18's Architecture Pack and F19's DevOps/SRE Pack.

## What was built

A disclosed comparison drove the pick over the F19 "下一步" candidate RTO/RPO: RTO/RPO's own F19 tool table row (L860) is thin, single-citation, with no dedicated Atlas section. Backup/Restore Drill's own F21 row (L905) ALSO has a dedicated §12.40 section (L3086-3100) with a real 6-step numbered protocol -- the same tier of citation strength `devops_sre.canary_deployment`/`chaos_engineering` already established -- and its own purpose line (L3090) directly names RTO/RPO as the pass/fail bar it measures against. Building this method first, with RTO/RPO's target numbers as caller-supplied input fields, covers the stronger-grounded half of both concepts without inventing structure for the thinner one. A standalone `devops_sre.rto_rpo` contract remains a deferred, real candidate (`OQ-BACKUPDRILL-2`).

The real invariant: a drill record cannot claim `status: passed` unless `integrity_checks_passed` is true AND `actual_recovery_duration_seconds <= rto_target_seconds` AND (if RPO is tracked) `observed_data_age_seconds <= rpo_target_seconds`. This is ONE-DIRECTIONAL -- a conservative `status: failed` despite numbers that technically pass is a legal operational judgment call the contract's own text never forbids.

* `methods/contracts/database_data.backup_restore_drill.contract.yaml`, `specs/cognitive/typed-objects/backup-restore-drill-record.schema.yaml` + fixtures (spec-root suite 2735 -> 2744).
* `ai_lego/modules/database_data/backup_restore_drill.py` -- builder + two shared pure predicates (`_drill_would_pass`, `_rpo_pairing_is_valid`) called by BOTH the builder's construction-time check and the gate's independent re-derivation.
* `ai_lego/apps/cli/run_backup_restore_drill_slice.py` -- a real passed drill plus two attack-and-confirm steps (RTO exceeded, RPO exceeded).
* `tests/unit/test_backup_restore_drill.py` -- 34 tests.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Critic round: a real Critical (gate didn't re-verify RPO pairing) plus a real design bug (gate was stricter than the contract)

The first-pass implementation (19 tests, all green) had two real defects a `critic` subagent review caught:

1. **Critical, fixed** -- `evaluate_pass_invariant_gate` re-derived the pass/fail verdict but NOT the RPO-pairing precondition. Deleting exactly one of `rpo_target_seconds`/`observed_data_age_seconds` from a record that genuinely failed its RPO target (leaving the other field behind as an orphaned, unexplained value) let the gate treat it as "RPO not tracked" and accept `status: passed`. Fixed by folding the pairing check into `_rpo_pairing_is_valid`, a second shared predicate both the builder and the gate call. Also added `dependentRequired` at the schema layer as defense-in-depth. **Disclosed residual limit** (not fixable by an optional-pair design): deleting BOTH RPO fields together is indistinguishable from never having tracked RPO at all -- recorded as `OQ-BACKUPDRILL-4`, with a real fix (`rpo_tracked: bool` required field) proposed but not built.
2. **Major, fixed** -- the gate enforced BIDIRECTIONAL status/verdict equivalence, wrongly rejecting a legitimate `status: failed` record whose raw numbers happened to technically pass (e.g. "the runbook had to be manually patched mid-drill, so we're calling this a fail despite the timer"). Neither the contract's own precondition text nor the builder's own check ever forbade this -- only the gate did. Fixed the gate to match the builder's one-directional semantics; the contract's precondition text was clarified to make the one-directional reading explicit.
3. **Major, fixed** -- Atlas citation off-by-3: the contract cited the F21 table row as L902 (actually Data Contract's own row); the real Backup/Restore Drill row is L905. Traced to `method-inventory.yaml`'s own `line` field for this entry already being 3 short -- the SAME +3 offset also affected this session's own prior citations of Error Budget (848 vs real 851) and RTO/RPO (857 vs real 860), suggesting a systematic drift, not three coincidental typos (`OQ-BACKUPDRILL-3`). All 6 mentions across the contract, schema, and backlog files corrected.
4. **Major, fixed** -- NaN passed all three layers (builder, schema, gate) because `nan < 0` and `nan > x` are both `False` in Python/jsonschema. Fixed with explicit `math.isfinite` checks in the shared `_is_finite_number` helper, applied everywhere a duration/target field is validated.
5. **Minor, fixed** -- a non-bool `integrity_checks_passed` (e.g. the string `"no"`) passed the gate via Python truthiness coercion; the predicate now does an explicit `isinstance(x, bool)` check.
6. **Minor, fixed** -- passing a bare string as `issues_recorded` silently iterated it into individual single-character "issues", destroying Atlas's own step 5 content while still passing schema validation; the builder now explicitly rejects a bare string or any non-string/empty item.
7. **Minor, fixed** -- gate evidence only carried `stored_status`, insufficient for diagnosing a FAIL after the fact; now also carries `recomputed_would_pass` and `unverifiable_reason`.
8. **Minor, fixed** -- an RPO-boundary mutation test (`>` vs `>=` on `observed_data_age_seconds == rpo_target_seconds`) and four previously-uncovered precondition error codes had zero test coverage; all five gaps closed.
9. **Minor, fixed** -- this doc file was missing on the first pass (all 24 prior slices have one); now written.
10. **Nit, fixed** -- `_drill_would_pass`'s five same-typed parameters are now keyword-only, so a future parameter reorder cannot silently swap values at either call site.
11. **Nit, fixed** -- the CLI's attack-and-confirm step originally only exercised the RTO half; now exercises both RTO and RPO violations.

## Evidence

CLI (post-fix): `PASS database_data.backup_restore_drill: status=passed, actual_recovery_duration_seconds=2415.0, rto_target_seconds=3600.0, gates [provenance_required=PASS, pass_invariant=PASS], invariant_verified=True` (both RTO and RPO attack proofs pass). 34 unit tests passed. Golden suite 2744 (2735 before). Full product-root regression: 582 tests OK (567 before this slice's first pass -> 582 after the critic-fix round, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-BACKUPDRILL-1`). A standalone `devops_sre.rto_rpo` method (business-impact -> tiers -> target derivation) remains unbuilt; this slice only consumes its target numbers as caller-supplied inputs (`OQ-BACKUPDRILL-2`). `method-inventory.yaml`'s own `line` fields appear to have a systematic +3 offset from the current Atlas document across at least three entries this session touched (`OQ-BACKUPDRILL-3`) -- not re-audited wholesale here. Deleting BOTH RPO fields together from a record is indistinguishable from never tracking RPO at all; no optional-pair schema design can close this without a new required `rpo_tracked: bool` field, which was not built (`OQ-BACKUPDRILL-4`).
