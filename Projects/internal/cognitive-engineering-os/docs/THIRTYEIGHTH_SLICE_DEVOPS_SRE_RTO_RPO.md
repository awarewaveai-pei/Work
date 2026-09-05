# Thirty-eighth Method Atlas slice: `devops_sre.rto_rpo`

Status: **LANDED (2026-09-05)**. THIRTEENTH and LAST slice from the `devops_sre` family (F19). **F19 is now COMPLETE (13/13)**, after `devops_sre.sli_slo` (twentieth), `devops_sre.canary_deployment` (twenty-first), `devops_sre.chaos_engineering` (twenty-second), `devops_sre.blue_green_deployment` (twenty-third), `devops_sre.error_budget` (twenty-fourth), `devops_sre.capacity_model` (thirty-first), `devops_sre.release_readiness_review` (thirty-second), `devops_sre.runbook_execution` (thirty-third), `devops_sre.game_day` (thirty-fourth), `devops_sre.load_test` (thirty-fifth), `devops_sre.stress_test` (thirty-sixth), and `devops_sre.soak_test` (thirty-seventh).

## What was built

Atlas gives this method one citation: F19's RTO/RPO row (L860: purpose "定義恢復時間/資料損失", usage "business impact→tiers→architecture→drill", benefit "DR 可量化驗證"). This slice **resolves a forward reference two prior contracts left open**: `database_data.backup_restore_drill.contract.yaml` (the twenty-fifth slice) explicitly compared itself against this row, chose to build the drill protocol first, and left `OQ-BACKUPDRILL-2` asking whether a future `devops_sre.rto_rpo` should feed that method's own `rto_target_seconds`/`rpo_target_seconds` as a soft link.

`RtoRpoRecord` is the **definition** half of the RTO/RPO pair; `BackupRestoreDrillRecord` is the **measurement** half. One field per Atlas formula word, in formula order: `business_impact_statement` ("business impact", free text -- no invented severity taxonomy), `tier` ("tiers", free text -- no invented enum, confirmed distinct from `specs/execution/risk-tier.schema.yaml`'s own R0-R4 *governance-action* risk tier), `system_or_component` ("architecture"), and an optional `drill_ref` ("drill", format-only soft link, prefix `DRILL-`, pointing **from** this record **into** the drill record -- the reverse direction resolves the forward reference without retrofitting a field into the already-shipped drill contract). Both `rto_target_seconds` and `rpo_target_seconds` are **required** here (unlike the drill contract's own optional RPO pair), since this method's own name and purpose line define RTO and RPO together as one deliverable.

No genuine-compute gate is reused -- this method performs no arithmetic, the same class `devops_sre.game_day`/`devops_sre.runbook_execution` already are (`provenance_required` + one `rto_rpo_integrity` gate).

* `methods/contracts/devops_sre.rto_rpo.contract.yaml`, `specs/cognitive/typed-objects/rto-rpo-record.schema.yaml` (spec-root suite 2800 -> 2803).
* `ai_lego/modules/devops_sre/rto_rpo.py` -- builder + 2 gates, three shared predicates.
* `ai_lego/apps/cli/run_rto_rpo_slice.py` -- a real Tier 0 definition citing a real drill, a real Tier 2 definition with none yet, two-layer attack-and-confirm.
* `tests/unit/test_rto_rpo.py` -- 42 tests, including one dedicated gate-layer test per scalar field and a present-but-null `drill_ref` regression (must be refused, not treated as absent).
* `database_data.backup_restore_drill.contract.yaml` -- `OQ-BACKUPDRILL-2` annotated ANSWERED (soft link runs the other direction; that contract's own `OQ-RTORPO-2` now asks the reverse).

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, and every prior family module.

## Due diligence

Broad from the start: "RTO/RPO/rto_rpo", "business impact/tier", "disaster recovery/DR", "recovery time/recovery point". Real neighbours found and confirmed distinct: `database_data.backup_restore_drill` (the measurement half, already discussed above); `docs/architecture/DEVOPS_SRE_PLAN.md` §2.2's own real per-edition RPO/RTO tiering table (disclosed real precedent for what a `tier` value might look like, **not** hard-coded as a default); `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md` §74 Disaster Recovery (the original source of those numbers, explicitly labeled "範例" in its own text); `specs/execution/risk-tier.schema.yaml`'s own R0-R4 (a distinct governance-action tier concept, confirmed by direct read).

## Critic round: `warn` -- logic exhaustively sound, but the disclosure/traceability layer repeated three already-closed classes

A `critic` subagent review (16+ mutations proven independently, a 6,056-case exhaustive oracle sweep over rto/rpo/drill_ref combinations) found the core watertight: **zero builder-vs-gate disagreements across all 6,056 cases**, every one of the 7 builder preconditions independently re-derived by the gate, both RTO and RPO genuinely inseparable, `tier` genuinely free text, the drill contract itself genuinely left structurally unmodified. Verdict `warn` for six Major findings, all fixed:

1. **Major, fixed** -- due-diligence enumeration named only 4 of the real neighbours a 23-file grep for "RTO" surfaces. Added `specs/domain/repository-contract.schema.yaml`'s own `backup_dr_matrix` (an existing per-storage-engine `{storage, rpo, rto, method}` table, the closest structural analogue) with a disclosed distinction (per-storage-engine fixed policy vs. this method's generic per-invocation record) and a new `OQ-RTORPO-4` for a possible future cross-reference.
2. **Major, fixed** -- the "tier" terminology collision was disclosed for only 1 of at least 3 real senses in the spec root. Added `specs/cognitive/primitive.schema.yaml`'s own bare `tier` property and `specs/domain/repository-contract.schema.yaml`'s own `storage_tier.tiers[].tier_id` (whose "TIER_0" spelling is close enough to this contract's own worked example, "Tier 0 - Critical", to risk momentary conflation) -- both confirmed distinct by direct read, now named.
3. **Major, fixed** -- the +3-drift citation list dropped "RTO/RPO comparison" while keeping it in the ordinal count, the exact repeat of a class `devops_sre.stress_test`'s own critic round already closed once this session. Restored to the list.
4. **Major, fixed** -- the schema accepted `Infinity`/`NaN` for both target fields with no disclosure (a known `jsonschema` limitation `exclusiveMinimum` cannot close); the runtime correctly rejects both, but four sibling schemas already carry the standard disclosure sentence and this one did not. Added.
5. **Major, fixed** -- `all_gates_pass`'s own FAIL direction was completely untested; a mutation returning `True` unconditionally survived all 42 tests, because every call site only asserted the PASS direction. One test added asserting `False` on a tampered record.
6. **Major, fixed** -- F19 was declared complete here while `devops_sre.soak_test.contract.yaml`'s own `OQ-SOAKTEST-3` still asked (unanswered) whether `rto_rpo` should be the next slice -- a self-contradiction within the same commit. Annotated ANSWERED.

Minor, all fixed: `_drill_ref_is_valid`'s non-empty conjunct is a provably equivalent mutant of the prefix check alone (documented, not removed, for symmetry and future-proofing); the schema-only id-prefix enforcement was disclosed only in this product-root doc, not in the schema's own `verification.note` where siblings place it (added); the backup_restore_drill annotation's wording ("deliberately left unmodified") was ambiguous about scope (tightened to "structurally unmodified -- no field or schema change").

## Evidence

CLI: `PASS devops_sre.rto_rpo: 'checkout-api order database' tier='Tier 0 - Critical', rto=7200s, rpo=300s, drill_ref=DRILL-2026-09-05-001, gates [provenance_required=PASS, rto_rpo_integrity=PASS], invariant_verified(construction=True, gate=True)`. 43 unit tests passed (42 first draft -> 43 after the critic-fix round; one test-setup bug -- an invalid `authorship_state` enum value, `HUMAN_CREATED` instead of `HUMAN_ORIGINAL`, used across the test file/CLI/schema example -- caught by the schema's own real validation before any critic review, fixed in three files). Golden suite 2803 (2800 before this slice). Full product-root regression: 1174 -> 1216 OK on the first draft; re-run after the fix round -> 1217 OK, zero regressions.

## Honest limits

No method-inventory.yaml machine_id row (`OQ-RTORPO-1`). No reverse soft link on the drill contract's own side yet (`OQ-RTORPO-2`). F19 is now complete -- next candidate is operator's call among F21's remaining `database_data` members, F20 (entirely unbuilt), or another F-category (`OQ-RTORPO-3`). No soft link to the existing `backup_dr_matrix` policy table (`OQ-RTORPO-4`). `drill_ref` is format-only, unverified against any real drill record's own existence or content. Own id prefix, `version` type, and top-level key set are schema-layer only / unconstrained -- the same family convention prior slices disclosed.
