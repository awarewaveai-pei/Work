"""``devops_sre.sli_slo`` -- twentieth Method Atlas slice, first from the `devops_sre` family (F19's own
"DevOps／SRE／可靠性套件", a second pack this session opens after F18).

Atlas §11.39's own precedence principle (L2138, "先 SLI，再 SLO；只有商務
需要才 SLA") directly implies a real invariant: an indicator declaring
``sla_required: true`` must actually carry non-empty ``sla_terms`` --
same "raise before construction on a real, Atlas-implied structural
rule" discipline every prior forbidden-state guard this session built
already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.sli_slo"
VALID_METRIC_TYPES = frozenset({"availability", "latency", "correctness", "durability", "freshness"})


def generate_sli_slo_set(
    set_id: str,
    service_under_measurement: str,
    indicators: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/sli-slo-set.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed: at least 1 indicator, every metric_type valid, every sla_required:true indicator carries
    non-empty sla_terms."""
    if not indicators:
        raise InvariantViolation("SLISLO_NO_INDICATORS: at least 1 required")
    invalid_types = sorted({i["metric_type"] for i in indicators} - VALID_METRIC_TYPES)
    if invalid_types:
        raise InvariantViolation(f"SLISLO_INVALID_METRIC_TYPE: {invalid_types} not in {sorted(VALID_METRIC_TYPES)}")

    missing_terms = sorted(i["id"] for i in indicators if i.get("sla_required") and not (i.get("sla_terms") or "").strip())
    if missing_terms:
        raise InvariantViolation(f"SLISLO_SLA_REQUIRED_WITHOUT_TERMS: {missing_terms} -- Atlas's own principle (SLA only when commercially necessary) requires stating what the SLA is")

    return {
        "id": set_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "service_under_measurement": service_under_measurement,
        "indicators": list(indicators),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(sli_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(sli_set.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": sli_set.get("provenance")}], validator, timestamp)


def evaluate_sla_terms_present_gate(sli_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the SLA-requires-terms invariant structurally on any record handed to it -- not just trusting the
    builder's own construction-time check already ran."""
    missing = sorted(i["id"] for i in sli_set.get("indicators", []) if i.get("sla_required") and not (i.get("sla_terms") or "").strip())
    return _result("sla_terms_present", not missing, [{"missing_sla_terms": missing}], validator, timestamp)


def evaluate_sli_slo_set_gates(sli_set: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(sli_set, validator, timestamp),
        evaluate_sla_terms_present_gate(sli_set, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
