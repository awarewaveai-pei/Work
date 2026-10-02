"""Summarize completed workflow stations without taking judgment away from the user."""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from typing import Any

from ai_lego.modules.research.gates import evaluate_citation_integrity
from ai_lego.platform.ai_gateway.structured import ask_object, keep_properties, parse_object, schema_lookup, tool_schema

SCHEMA_REF = "ai-lego://specs/cognitive/typed-objects/workflow-interpretation.schema.yaml"
# _assemble builds the stored object; the model writes only these, and per station only its index and one line.
_ANSWER_KEYS = ("stations", "summary", "final_recommendation", "revision_conditions")
_STATION_KEYS = ("station_index", "one_liner")


def answer_schema(schema_contracts: Any) -> dict[str, Any]:
    contents, lookup = schema_lookup(schema_contracts, SCHEMA_REF)
    shape = keep_properties(tool_schema(contents, lookup=lookup), _ANSWER_KEYS)
    shape["properties"]["stations"]["items"] = keep_properties(shape["properties"]["stations"]["items"], _STATION_KEYS)
    return shape
_CONFIDENCE_ORDER = {"high": 0, "mid": 1, "low": 2}
_FORBIDDEN = {"conclusion", "verdict", "correct_answer"}


def _citations(value: Any, out: list[str]) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if key == "citations" and isinstance(child, list):
                for item in child:
                    if isinstance(item, str) and item not in out:
                        out.append(item)
            else:
                _citations(child, out)
    elif isinstance(value, list):
        for child in value:
            _citations(child, out)


def _lowest_confidence(interpretation: Mapping[str, Any]) -> str:
    levels = [
        finding.get("confidence", {}).get("level")
        for finding in interpretation.get("findings", [])
        if isinstance(finding, Mapping) and isinstance(finding.get("confidence"), Mapping)
    ]
    return max((level for level in levels if level in _CONFIDENCE_ORDER), key=lambda level: _CONFIDENCE_ORDER[level], default="low")


def _contains_forbidden(value: Any) -> bool:
    if isinstance(value, Mapping):
        return any(key in _FORBIDDEN or _contains_forbidden(child) for key, child in value.items())
    return any(_contains_forbidden(child) for child in value) if isinstance(value, list) else False


def _gates(answer: Mapping[str, Any], stations: list[Mapping[str, Any]], manifest_ids: list[str]) -> dict[str, dict[str, Any]]:
    expected = list(range(len(stations)))
    supplied = answer.get("stations") if isinstance(answer.get("stations"), list) else []
    indexes = [row.get("station_index") for row in supplied if isinstance(row, Mapping)]
    complete = indexes == expected and all(isinstance(row.get("one_liner"), str) and row["one_liner"].strip() for row in supplied if isinstance(row, Mapping))
    citation = evaluate_citation_integrity({"final_recommendation": answer.get("final_recommendation")}, manifest_ids)
    revisions = answer.get("revision_conditions")
    no_preset = isinstance(revisions, list) and bool(revisions) and not _contains_forbidden(answer)
    return {
        "stations_complete": {"gate_id": "stations_complete", "status": "PASS" if complete else "FAIL", "evidence": {"expected": expected, "supplied": indexes}},
        "citation_integrity": citation,
        "no_preset_conclusion": {"gate_id": "no_preset_conclusion", "status": "PASS" if no_preset else "FAIL", "evidence": {"revision_conditions": len(revisions) if isinstance(revisions, list) else 0, "forbidden_keys": _contains_forbidden(answer)}},
    }


def _assemble(*, workflow_id: str, run_or_chain_id: str, interpretation_id: str, stations: list[Mapping[str, Any]], answer: Mapping[str, Any], model: str, usage_total: dict[str, int], schema_contracts: Any) -> dict[str, Any]:
    manifest_ids: list[str] = []
    citations_all: list[str] = []
    for station in stations:
        for item in station.get("manifest", []) if isinstance(station.get("manifest"), list) else []:
            if isinstance(item, Mapping) and isinstance(item.get("id"), str) and item["id"] not in manifest_ids:
                manifest_ids.append(item["id"])
        _citations(station.get("interpretation", {}), citations_all)
    supplied = {row.get("station_index"): row for row in answer.get("stations", []) if isinstance(row, Mapping)} if isinstance(answer.get("stations"), list) else {}
    output_stations = []
    for station in stations:
        index = station["station_index"]
        interpretation = station.get("interpretation") if isinstance(station.get("interpretation"), Mapping) else {}
        model_row = supplied.get(index, {})
        output_stations.append({
            "station_index": index,
            "method_id": station["method_id"],
            "interpretation_id": interpretation.get("interpretation_id", ""),
            "one_liner": model_row.get("one_liner") if isinstance(model_row.get("one_liner"), str) else "未提供",
            "confidence": _lowest_confidence(interpretation),
            "judgment": copy.deepcopy(station.get("judgment")) if station.get("judgment") is not None else None,
        })
    result = {
        "workflow_id": workflow_id,
        "run_or_chain_id": run_or_chain_id,
        "interpretation_id": interpretation_id,
        "stations": output_stations,
        "summary": answer.get("summary", ""),
        "final_recommendation": answer.get("final_recommendation", {"text": "", "citations": []}),
        "revision_conditions": answer.get("revision_conditions", []),
        "solution": None,
        "citations_all": citations_all,
        "usage_total": usage_total,
        "model": model,
        "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
    }
    result["gates"] = _gates(answer, stations, manifest_ids)
    schema_contracts.validate(SCHEMA_REF, result, "WorkflowInterpretation")
    return result


def run_workflow_interpretation(*, workflow_id: str, run_or_chain_id: str, stations: list[Mapping[str, Any]], provider: Any, schema_contracts: Any, interpretation_id: str, language: str = "zh-TW") -> dict[str, Any]:
    """Make one bounded AI summary; server-owned station facts and judgments are never model-authored."""
    if not isinstance(stations, list) or not stations or any(not isinstance(station, Mapping) for station in stations):
        raise ValueError("WORKFLOW_STATIONS_REQUIRED")
    original = copy.deepcopy(stations)
    usage = {"input_tokens": 0, "output_tokens": 0}
    prompt = "LANGUAGE: " + language + "\nSTATIONS:\n" + json.dumps(stations, ensure_ascii=False)
    previous_error = ""
    last: dict[str, Any] | None = None
    for _attempt in range(2):
        try:
            completion = ask_object(provider, "Summarize the workflow. Never write judgment or a preset conclusion. Return JSON only.", prompt + ("\nFIX: " + previous_error if previous_error else ""), max_tokens=6000, schema=lambda: answer_schema(schema_contracts))
        except Exception as error:
            if last is None:
                raise
            return {"interpretation": last, "gate_results": list(last["gates"].values()), "error": str(error), "model": last.get("model", provider.model), "input_tokens": usage["input_tokens"], "output_tokens": usage["output_tokens"]}
        usage["input_tokens"] += completion.input_tokens
        usage["output_tokens"] += completion.output_tokens
        answer = parse_object(completion)
        last = _assemble(workflow_id=workflow_id, run_or_chain_id=run_or_chain_id, interpretation_id=interpretation_id, stations=original, answer=answer, model=completion.model, usage_total=usage, schema_contracts=schema_contracts)
        failed = [name for name, gate in last["gates"].items() if gate["status"] != "PASS"]
        if not failed:
            return {"interpretation": last, "gate_results": list(last["gates"].values()), "error": None, "model": completion.model, "input_tokens": usage["input_tokens"], "output_tokens": usage["output_tokens"]}
        previous_error = "failed gates: " + ", ".join(failed)
    return {"interpretation": last, "gate_results": list(last["gates"].values()) if last else [], "error": "WORKFLOW_INTERPRETATION_REJECTED_AFTER_REPAIR: " + previous_error, "model": last.get("model") if last else provider.model, "input_tokens": usage["input_tokens"], "output_tokens": usage["output_tokens"]}
