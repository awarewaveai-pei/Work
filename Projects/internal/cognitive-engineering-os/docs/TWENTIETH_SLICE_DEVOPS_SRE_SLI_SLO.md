# Twentieth Method Atlas slice: `devops_sre.sli_slo` -- a second pack opened, and a deliberate skip documented

Status: **LANDED (2026-09-04)**. First slice from a new family, `devops_sre` (F19's own "DevOps／SRE／可靠性套件") -- the second Atlas pack this session opens, after F18's own Software Architecture Pack (8/10 members built).

## Deliberately not building Architecture Trade-off Matrix

Before opening F19, F18's own tenth member -- "Architecture Trade-off Matrix" (L825: "criteria→weights→options→risk/sensitivity") -- was checked against `decision.mcda`'s own already-built pipeline (criteria/weights/options/normalized-score/sensitivity) and found structurally identical, applied to the specific domain of comparing candidate architectures. Building a second schema for the same computational shape would repeat the exact class of same-concept-different-name duplication the session's own `learning.reversal_criteria` correction (WORKLOG continuation 21) already taught it to check for BEFORE writing. Disclosed as a deliberate skip in `devops_sre.sli_slo.contract.yaml`'s own description, not silently forgotten: a caller needing this exact use case can already invoke `decision.mcda` directly with architecture options as its `options[]`.

## What was built

Atlas §11.39 gives a dedicated section: 5 named user-visible metric types (Availability, Latency, Correctness, Durability, Freshness) and an explicit precedence principle -- "SLI first, then SLO; SLA only when commercially required." That principle directly implies a real invariant: an indicator declaring `sla_required: true` must actually carry `sla_terms`, not just the bare intent. The CLI proves this by attempting to declare an SLA requirement with no terms and confirming the guard fires.

* `methods/contracts/devops_sre.sli_slo.contract.yaml`, `specs/cognitive/typed-objects/sli-slo-set.schema.yaml` + fixtures (spec-root suite 2689 -> 2698).
* `ai_lego/modules/devops_sre/__init__.py` + `sli_slo.py` -- builder enforcing the SLA-terms invariant, two gates.
* `ai_lego/apps/cli/run_sli_slo_slice.py` -- a real 2-indicator Checkout API set plus an attack-and-confirm step.
* `tests/unit/test_sli_slo.py` -- 10 tests, first run green.

Reused unchanged: `method_resolver.py`, `schema_contracts.py`, `event_ledger.py`, `ledger_guards.py`, `provenance.py`.

## Evidence

CLI: `PASS devops_sre.sli_slo: indicators=2, gates [provenance_required=PASS, sla_terms_present=PASS], sla_terms_invariant_verified=True` (first run). 10 unit tests passed first run. Golden suite 2698 (2689 before). Full regression: see WORKLOG.

## Honest limits

No method-inventory.yaml machine_id row. `family: devops_sre` substitutes a hyphen for an underscore to satisfy the schema pattern, same class of forced substitution `architecture.system_context_model`'s own naming note already disclosed.
