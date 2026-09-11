"""``systems.agent_based_modeling`` -- second built member of the ``systems`` family (F09), Atlas F09 table row
(L552: "Agent-Based Modeling｜由個體規則模擬群體現象｜agents→rules→environment→runs｜處理 heterogeneity 與
emergent effects"): simulate emergent group behavior from individual agent rules.

THE real invariant this method exists to enforce is Atlas's own "agents→rules→environment→runs" sequence made
structural, in two parts:

    1. Every ``agents[]`` entry must have >=1 rule -- an agent with zero rules is a name, not a model (Atlas's
       own "agents→rules" stage treats rules as intrinsic, not optional).
    2. Every ``runs[]`` entry's ``agent_ids_involved`` must be non-empty AND every id in it must resolve to a
       real declared ``agents[]`` id in this same record -- referential integrity, same class of runtime-layer
       cross-array check ``challenge.pre_mortem``'s own ``addresses_cause_id`` and ``causal.dag``'s own edge-node
       resolution already establish for this corpus (a run naming zero agents, or a dangling agent reference,
       has not actually been simulated).

Both raised BEFORE construction (builder), and independently re-derived from raw fields (gate) -- neither
trusts the other, same two-layer discipline every sibling module in this package establishes.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "agent-based"/"agent based
model"/"agent_based_modeling" before writing any of this method's own files: zero pre-existing hits beyond
Atlas's own F09 table row itself.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.agent_based_modeling"
RECORD_ID_PREFIX = "ABM-"

_AGENT_KEYS = frozenset({"id", "name", "rules"})
_RUN_KEYS = frozenset({"id", "summary", "agent_ids_involved"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this corpus already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _rules_are_valid(rules: Any) -> bool:
    """Atlas's own 'agents→rules' -- at least one non-empty rule string required."""
    return isinstance(rules, list) and bool(rules) and all(_is_nonempty_str(rule) for rule in rules)


def _agent_shape_is_valid(entry: Any) -> bool:
    """Exactly the 3 known keys, non-empty id/name, rules a non-empty list of non-empty strings. Same shape for
    both caller-supplied and stored agents[] entries -- unlike a GENUINE_COMPUTE field, an agent carries no
    computed field."""
    if not isinstance(entry, dict) or set(entry.keys()) != _AGENT_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("name")):
        return False
    return _rules_are_valid(entry.get("rules"))


def _run_shape_is_valid(entry: Any) -> bool:
    """Exactly the 3 known keys, non-empty id/summary, agent_ids_involved a non-empty list of non-empty strings.
    Does NOT check referential integrity against a real agents[] set -- that is a cross-field check performed
    separately (both the builder and the gate need the live agent id set to check it)."""
    if not isinstance(entry, dict) or set(entry.keys()) != _RUN_KEYS:
        return False
    if not _is_nonempty_str(entry.get("id")) or not _is_nonempty_str(entry.get("summary")):
        return False
    involved = entry.get("agent_ids_involved")
    return isinstance(involved, list) and bool(involved) and all(_is_nonempty_str(a) for a in involved)


def agent(agent_id: str, name: str, rules: list[str]) -> dict[str, Any]:
    """One INPUT entry for ``generate_agent_based_model``'s own ``agents`` parameter."""
    if not _is_nonempty_str(agent_id) or not _is_nonempty_str(name):
        raise InvariantViolation(f"AGENTBASED_INVALID_AGENT: id/name must each be non-empty strings, got id={agent_id!r} name={name!r}")
    if not _rules_are_valid(rules):
        raise InvariantViolation(f"AGENTBASED_AGENT_NO_RULES: agent {agent_id!r} must have at least 1 non-empty rule (Atlas F09 L552 'agents→rules'), got {_shallow_describe(rules)}")
    return {"id": agent_id, "name": name, "rules": list(rules)}


def run(run_id: str, summary: str, agent_ids_involved: list[str]) -> dict[str, Any]:
    """One INPUT entry for ``generate_agent_based_model``'s own ``runs`` parameter. Does NOT check referential
    integrity against a real agents[] set here -- that is checked by the builder, which alone has the full
    agents[] list to validate against."""
    if not _is_nonempty_str(run_id) or not _is_nonempty_str(summary):
        raise InvariantViolation(f"AGENTBASED_INVALID_RUN: id/summary must each be non-empty strings, got id={run_id!r} summary={summary!r}")
    if not isinstance(agent_ids_involved, list) or not agent_ids_involved or not all(_is_nonempty_str(a) for a in agent_ids_involved):
        raise InvariantViolation(f"AGENTBASED_RUN_NO_AGENTS: run {run_id!r} must have a non-empty agent_ids_involved list of non-empty strings, got {_shallow_describe(agent_ids_involved)}")
    return {"id": run_id, "summary": summary, "agent_ids_involved": list(agent_ids_involved)}


def generate_agent_based_model(
    record_id: str,
    agents: list[dict[str, Any]],
    environment_description: str,
    runs: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/agent-based-model.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then agents (non-empty,
    well-shaped, unique ids, each with >=1 rule), then environment_description, then runs (non-empty,
    well-shaped, unique ids, each with a non-empty agent_ids_involved), and only THEN the real cross-array
    invariant this method exists to enforce -- every runs[].agent_ids_involved id resolves to a real declared
    agents[].id (Atlas F09 L552's own 'agents→rules→environment→runs' referential chain).
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"AGENTBASED_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"AGENTBASED_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"AGENTBASED_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(agents, list) or not agents:
        raise InvariantViolation(f"AGENTBASED_EMPTY_AGENTS: agents must be a non-empty list (a model naming zero agents has not actually run Atlas F09 L552's own method), got {_shallow_describe(agents)}")
    if not all(_agent_shape_is_valid(entry) for entry in agents):
        raise InvariantViolation(
            f"AGENTBASED_INVALID_AGENT_ENTRY: every agents[] entry must have exactly the keys {sorted(_AGENT_KEYS)}, non-empty id/name, and rules a "
            f"non-empty list of non-empty strings (Atlas F09 L552 'agents→rules' -- an agent with zero rules is not modeled), got {_shallow_describe(agents)}"
        )
    agent_ids = [entry["id"] for entry in agents]
    duplicate_agent_ids = sorted({aid for aid in agent_ids if agent_ids.count(aid) > 1})
    if duplicate_agent_ids:
        raise InvariantViolation(f"AGENTBASED_DUPLICATE_AGENT_ID: agents id(s) {duplicate_agent_ids} appear more than once")

    if not _is_nonempty_str(environment_description):
        raise InvariantViolation(f"AGENTBASED_EMPTY_ENVIRONMENT: environment_description must be a non-empty string (Atlas F09 L552 'environment' stage), got {environment_description!r}")

    if not isinstance(runs, list) or not runs:
        raise InvariantViolation(f"AGENTBASED_EMPTY_RUNS: runs must be a non-empty list (a model with zero runs has not actually been simulated), got {_shallow_describe(runs)}")
    if not all(_run_shape_is_valid(entry) for entry in runs):
        raise InvariantViolation(
            f"AGENTBASED_INVALID_RUN_ENTRY: every runs[] entry must have exactly the keys {sorted(_RUN_KEYS)}, non-empty id/summary, and a non-empty "
            f"agent_ids_involved list of non-empty strings, got {_shallow_describe(runs)}"
        )
    run_ids = [entry["id"] for entry in runs]
    duplicate_run_ids = sorted({rid for rid in run_ids if run_ids.count(rid) > 1})
    if duplicate_run_ids:
        raise InvariantViolation(f"AGENTBASED_DUPLICATE_RUN_ID: runs id(s) {duplicate_run_ids} appear more than once")

    # THE real cross-array invariant (Atlas F09 L552's own referential chain) -- checked LAST, after every other
    # shape check has already passed, so the error message below is always about a genuinely well-formed run
    # simply referencing an agent that does not exist in this same record.
    agent_id_set = set(agent_ids)
    for entry in runs:
        dangling = sorted(set(entry["agent_ids_involved"]) - agent_id_set)
        if dangling:
            raise InvariantViolation(f"AGENTBASED_RUN_UNKNOWN_AGENT: run {entry['id']!r} agent_ids_involved {dangling} do not reference any agents[] id in this record")

    rebuilt_agents = [{"id": entry["id"], "name": entry["name"], "rules": list(entry["rules"])} for entry in agents]
    rebuilt_runs = [{"id": entry["id"], "summary": entry["summary"], "agent_ids_involved": list(entry["agent_ids_involved"])} for entry in runs]

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "agents": rebuilt_agents,
        "environment_description": environment_description,
        "runs": rebuilt_runs,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_agent_based_model -- a hand-tampered record that bypassed the builder entirely must be caught exactly
# as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Record-level only -- no per-agent/per-run provenance to check."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_agent_based_model_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_agent_based_model``, so a hand-tampered record that bypassed the builder entirely
    (e.g. an agent spliced down to zero rules, or a run's agent_ids_involved pointing at a deleted agent) is
    caught here exactly as a builder-refused one would have been. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("agent_based_model_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("agent_based_model_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("agent_based_model_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("environment_description")):
        return _result("agent_based_model_integrity", False, [{"reason": "environment_description missing or empty"}], validator, timestamp)

    agents = record.get("agents")
    if not isinstance(agents, list) or not agents or not all(_agent_shape_is_valid(entry) for entry in agents):
        return _result("agent_based_model_integrity", False, [{"reason": "agents missing, empty, or contains a malformed entry / an agent with zero rules"}], validator, timestamp)
    agent_ids = [entry["id"] for entry in agents]
    if len(agent_ids) != len(set(agent_ids)):
        return _result("agent_based_model_integrity", False, [{"reason": "agents contains duplicate id(s)"}], validator, timestamp)

    runs = record.get("runs")
    if not isinstance(runs, list) or not runs or not all(_run_shape_is_valid(entry) for entry in runs):
        return _result("agent_based_model_integrity", False, [{"reason": "runs missing, empty, or contains a malformed entry / an empty agent_ids_involved"}], validator, timestamp)
    run_ids = [entry["id"] for entry in runs]
    if len(run_ids) != len(set(run_ids)):
        return _result("agent_based_model_integrity", False, [{"reason": "runs contains duplicate id(s)"}], validator, timestamp)

    agent_id_set = set(agent_ids)
    dangling_by_run = {entry["id"]: sorted(set(entry["agent_ids_involved"]) - agent_id_set) for entry in runs}
    dangling_by_run = {run_id: dangling for run_id, dangling in dangling_by_run.items() if dangling}
    if dangling_by_run:
        return _result("agent_based_model_integrity", False, [{"reason": "run(s) reference unknown agent id(s)", "dangling_by_run": dangling_by_run}], validator, timestamp)

    return _result("agent_based_model_integrity", True, [{"agent_count": len(agents), "run_count": len(runs)}], validator, timestamp)


def evaluate_agent_based_modeling_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_agent_based_model_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
