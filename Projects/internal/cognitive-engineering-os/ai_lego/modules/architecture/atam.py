"""``architecture.atam`` -- fourteenth Method Atlas slice, third from the `architecture` family (F18's own
"Software Architecture Pack"). Same findings+closed-category-enum shape ``challenge.red_team`` already established,
reused as a PATTERN (not code) for a different subject matter -- architecture quality-attribute tradeoffs, not
security-critique dimensions.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.atam"
RECORD_ID_PREFIX = "ATAM-"
# Prefixes the analysis_id /methods/{id}/invoke generates when the caller omits it (dispatch.self_id_param).
VALID_CATEGORIES = frozenset({"sensitivity_point", "tradeoff_point", "risk", "non_risk"})


def generate_atam_analysis(
    analysis_id: str,
    architecture_description: str,
    findings: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/atam-analysis.schema.yaml``. Enforces the method contract's own preconditions
    fail-closed: at least 1 finding, every finding's category one of Atlas's own cited 4 values."""
    if not findings:
        raise InvariantViolation("ATAM_NO_FINDINGS: at least 1 required")
    invalid = sorted({f["category"] for f in findings} - VALID_CATEGORIES)
    if invalid:
        raise InvariantViolation(f"ATAM_INVALID_CATEGORY: {invalid} not in {sorted(VALID_CATEGORIES)}")

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "architecture_description": architecture_description,
        "findings": list(findings),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(analysis.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": analysis.get("provenance")}], validator, timestamp)


def evaluate_findings_present_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the method contract's own precondition structurally on any record handed to it -- not just
    trusting the builder's own construction-time check already ran."""
    findings = analysis.get("findings")
    passed = isinstance(findings, list) and len(findings) >= 1
    return _result("findings_present", passed, [{"count": len(findings) if isinstance(findings, list) else None}], validator, timestamp)


def evaluate_atam_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_findings_present_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
