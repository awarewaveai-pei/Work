# Twenty-second Method Atlas slice: `devops_sre.chaos_engineering`

Status: **LANDED (2026-09-04)**. Third slice from the `devops_sre` family (F19's own "DevOps／SRE／可靠性套件").

## What was built

Atlas §11.43 gives a dedicated section with a real 5-step numbered protocol (steady-state hypothesis → limit blast radius → inject specific failure → verify automatic recovery → stop immediately if not as expected) -- the same tier of citation strength `root_cause.fishbone`/`root_cause.five_whys` already established. Step 5's own rule is a real, enforceable invariant: an experiment claiming `recovered_as_hypothesized: false` must carry `status: stopped`, never `completed`. The CLI proves this by attempting to claim completion after an unsuccessful recovery and confirming the guard fires.

A real naming-collision investigation, not assumed away: this method's own `blast_radius` field shares vocabulary with `specs/execution/blast-radius-chain.schema.yaml` (this platform's own tenant-isolation hierarchy governance, ADR-003). Read that schema's own description in full before writing this contract and confirmed it governs a completely different concept -- disclosed explicitly in the method contract rather than silently assumed to be unrelated from the shared English phrase alone.

* `methods/contracts/devops_sre.chaos_engineering.contract.yaml`, `specs/cognitive/typed-objects/chaos-experiment.schema.yaml` + fixtures (spec-root suite 2708 -> 2717).
* `ai_lego/modules/devops_sre/chaos_engineering.py` -- builder enforcing the unrecovered-forbids-completed invariant, two gates.
* `ai_lego/apps/cli/run_chaos_engineering_slice.py` -- a real completed experiment plus an attack-and-confirm step.
* `tests/unit/test_chaos_engineering.py` -- 9 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`, `devops_sre/sli_slo.py`, `devops_sre/canary_deployment.py`, and all eight `architecture` family modules.

## Evidence

CLI: `PASS devops_sre.chaos_engineering: status=completed, recovered=True, gates [provenance_required=PASS, unrecovered_forbids_completed=PASS], unrecovered_invariant_verified=True` (first run). 9 unit tests passed first run. Golden suite 2717 (2708 before). Full regression: see WORKLOG.

## Honest limits

No method-inventory.yaml machine_id row. `cognitive_primitives` inferred, not cited.
