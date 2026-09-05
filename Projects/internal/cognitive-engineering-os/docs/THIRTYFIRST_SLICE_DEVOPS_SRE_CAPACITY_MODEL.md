# Thirty-first Method Atlas slice: `devops_sre.capacity_model`

Status: **LANDED (2026-09-05)**. SIXTH slice from the `devops_sre` family (F19), after `devops_sre.sli_slo` (twentieth), `devops_sre.canary_deployment` (twenty-first), `devops_sre.chaos_engineering` (twenty-second), `devops_sre.blue_green_deployment` (twenty-third), and `devops_sre.error_budget` (twenty-fourth).

## What was built

Atlas gives this method one definitional citation (F19 tool table, L852: "workload→growth→resource coefficients→headroom") plus one prose cross-reference a critic review found this contract's first draft missed (§12.41 Critical Path Method's own limitation line, L3109: "資源限制另需 resource leveling / capacity model"). The benefit column's own two-sided framing ("防容量事故與過度採購" -- prevent both capacity incidents AND over-provisioning) directly grounds a genuine three-way classification (`insufficient`/`healthy`/`over_provisioned`), not a single pass/fail bit.

`projected_workload`, `required_resources`, and `headroom_ratio` are genuine deterministic compute (`ai_lego.compute.capacity_model.projection`) -- the eighth reuse of `evaluate_statistical_gate` this session. `status` is fully derived with no caller override at all (unlike the one-directional status fields `database_data.backup_restore_drill`/`database_data.reconciliation` legitimately allow): there is no operational-judgment reading of "is this ratio above or below these two numbers".

* `methods/contracts/devops_sre.capacity_model.contract.yaml`, `specs/cognitive/typed-objects/capacity-model-record.schema.yaml` (spec-root suite 2777 -> 2780).
* `ai_lego/compute/capacity_model/projection.py` -- pure arithmetic (`project_workload`, `compute_headroom_ratio`), hand-verified against known cases, with an explicit, honest docstring disclosing exactly what its own `Decimal` usage does and does not protect against.
* `ai_lego/modules/devops_sre/capacity_model.py` -- builder + 3 gates, sharing a `_thresholds_are_valid`/`_derive_status` predicate pair between builder and gate.
* `ai_lego/apps/cli/run_capacity_model_slice.py` -- a real healthy case (~29% headroom) and a real insufficient case (negative headroom, same growth projection against too little capacity), plus two-layer attack-and-confirm.
* `tests/unit/test_capacity_model.py` -- 57 tests.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, `modules.research.gates.evaluate_statistical_gate`, and every prior family module.

## Critic round: 2 Critical from one missing invariant, plus two verbatim-repeat classes

A `critic` subagent review ran a real mutation matrix and a 6000-record randomized fuzz. It found the arithmetic, the four-computed-field gate recomputation, and the schema/builder field parity were all genuinely correct -- but found 2 Critical, both falling out of a single missing invariant: **the gate recomputed the four COMPUTED fields but never re-validated the two THRESHOLD fields the builder itself requires.**

1. **Critical, fixed** -- a record hand-tampered to swap its own `low_threshold_ratio`/`high_threshold_ratio` passed every gate and the schema unchallenged, in the reproduced case making `status: healthy` mathematically UNREACHABLE regardless of real headroom -- silently defeating the over-provisioning half of Atlas's own two-sided benefit.
2. **Critical, fixed** -- `±inf` thresholds reached the compute layer through the SANCTIONED public builder with zero tampering at all (a real, reachable path: YAML natively parses `-.inf`/`.inf` as float infinities, so a single config typo produces this). The critic reproduced a resource provisioned at 0.03% of its projected requirement certified `healthy` by every layer, and confirmed the resulting record serializes as non-RFC8259 `Infinity` JSON.

Both fixed with one shared `_thresholds_are_valid` predicate (isinstance + `math.isfinite` + strict ordering), called by BOTH `generate_capacity_model_record` and `evaluate_capacity_integrity_gate` -- the same "every precondition the builder enforces, the gate re-verifies" invariant `database_data.expand_contract_migration`'s own module docstring already commits to, here extended to cover the builder's own RAW input fields, not just its computed outputs.

Two Major findings were repeats of failure classes this session had already established elsewhere: (1) missing `isinstance` guards let a non-numeric `resource_name`/`current_workload`/etc. escape as a raw `AttributeError`/`TypeError` instead of failing closed -- fixed by adopting the `_is_nonempty_str`/`_is_real_number` pattern two immediately-prior slices had already established; (2) `decimal.Overflow` for a large-but-schema-legal `periods_ahead` escaped uncaught (the exponentiation step was outside the original `try` block) -- fixed by widening the exception handling and adding an output-finiteness check to both compute functions. A third Major: the contract's own Decimal-precision claim overstated the protection actually delivered, contradicting the compute module's own honest disclosure -- corrected to match. A fourth: the contract claimed a `contract-backlog.yaml` registration that did not exist -- fixed by adding it. A fifth Minor-turned-Major-by-mutation: only the LOW boundary of the inclusive `healthy` classification was tested; a real mutation (`>` to `>=` on the high boundary) survived the entire suite -- fixed with a mirrored high-boundary test.

The broader lesson this round adds: recomputing every field a builder OUTPUTS is necessary but not sufficient -- a gate must also re-validate every precondition a builder enforces on its RAW inputs, or a record can smuggle a violation of that precondition through untouched, computed fields that are individually still "correct" relative to a now-invalid basis.

## Evidence

CLI (post-fix): `PASS devops_sre.capacity_model: headroom_ratio=0.2914, status=healthy, gates [provenance_required=PASS, genuine_compute=PASS, capacity_integrity=PASS], invariant_verified(construction=True, gate=True)`. 57 unit tests passed (40 first draft -> 57 after the critic-fix round), including reversed/infinite/NaN threshold regressions at both layers, non-numeric-input regressions, a `decimal.Overflow` regression, and a high-boundary-inclusive regression. Golden suite 2780 (2777 before this slice). Full product-root regression: 817 tests OK (800 before this slice, zero regressions).

## Honest limits

No method-inventory.yaml machine_id row (`OQ-CAPACITYMODEL-1`, same disclosed-not-silent pattern as every prior slice this session). Load Test/Stress Test (F19, unbuilt) could in principle supply an empirically observed `resource_coefficient` rather than this method's own caller-estimated one -- no soft-link field exists yet (`OQ-CAPACITYMODEL-2`). Critical Path Method (F21/§12.41, unbuilt) names this method as its own complementary technique for a resource-constrained path -- no cross-reference exists yet in either direction (`OQ-CAPACITYMODEL-3`).
