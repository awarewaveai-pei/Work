"""Plain-language brief -> method builder kwargs, checked by the method's own builder + gates.

Invariant: the model proposes, the method disposes. ``draft_method_kwargs`` returns ``validation.ok=False``
with the builder's refusal when the draft is not a valid record, and the caller (UI) shows both. One repair
round feeds the refusal back; more would only burn tokens on a brief the method cannot accept.

Traps for future readers:
- Params bound to ``outputs.*`` in a Recipe cannot be drafted (they are upstream records); they are excluded
  from the prompt and validation is skipped for that node -- the Recipe run validates for real.
- Top-level ``provenance`` is always overwritten with AI_SUGGESTED: an AI draft must not claim HUMAN_*.
"""

from __future__ import annotations

import datetime
import inspect
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from ai_lego.apps.api.dispatch import MethodDispatchError, invoke_builder, record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import AUTHORSHIP_STATES, EPISTEMIC_TYPES, make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_gateway.provider import AiProvider
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir

AI_DRAFT_CAPABILITY = "ai.draft_record"
MAX_LABELS_PER_REQUEST = 3  # one model call per node; the dashboard drafts node by node
MAX_BRIEF_CHARS = 8000
MAX_SCHEMA_CHARS = 7000
MAX_CONTRACT_CHARS = 1500
MAX_ATTEMPTS = 2
DRAFT_MAX_TOKENS = 6000
_TYPED_OBJECTS = "specs/cognitive/typed-objects"
_SCHEMA_REF = re.compile(r"specs/cognitive/typed-objects/([A-Za-z0-9_.-]+\.schema\.yaml)")


@dataclass
class DraftResult:
    method_id: str
    kwargs: dict[str, Any]
    validation: dict[str, Any]
    attempts: int
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    excluded_params: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "method_id": self.method_id,
            "draft": self.kwargs,
            "validation": self.validation,
            "attempts": self.attempts,
            "model": self.model,
            "usage": {"input_tokens": self.input_tokens, "output_tokens": self.output_tokens},
            "excluded_params": self.excluded_params,
        }


def require_brief(brief: Any) -> str:
    if not isinstance(brief, str) or not brief.strip():
        raise InvariantViolation("AI_DRAFT_BRIEF_REQUIRED: brief must be a non-empty string")
    if len(brief) > MAX_BRIEF_CHARS:
        raise InvariantViolation(f"AI_DRAFT_BRIEF_TOO_LONG: {len(brief)} > {MAX_BRIEF_CHARS} chars")
    return brief.strip()


@lru_cache(maxsize=4)
def _schema_index(spec_root: str) -> dict[str, str]:
    """title-without-punctuation (lowercase) -> schema filename; fallback when a contract cites no schema path."""
    index: dict[str, str] = {}
    for path in sorted(Path(spec_root, _TYPED_OBJECTS).glob("*.schema.yaml")):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError:
            continue
        if isinstance(data, dict) and isinstance(data.get("title"), str):
            index[re.sub(r"[^a-z0-9]", "", data["title"].lower())] = path.name
    return index


def _schema_text(spec_root: Path, contract_path: Path, outputs: list[Any]) -> str | None:
    """Output type name -> typed-object schema. Exact title match first (``ErdRecord`` == ``ERD Record``); a
    schema path cited by the contract only as fallback (contracts cite sibling schemas for comparison, so a
    cited path is NOT necessarily this method's own)."""
    index = _schema_index(str(spec_root))
    names = [index[key] for key in (re.sub(r"[^a-z0-9]", "", str(output).lower()) for output in outputs) if key in index]
    if not names:
        names = _SCHEMA_REF.findall(contract_path.read_text(encoding="utf-8"))
    if not names:
        return None
    schema_path = spec_root / _TYPED_OBJECTS / names[0]
    if not schema_path.is_file():
        return None
    text = schema_path.read_text(encoding="utf-8")
    return text if len(text) <= MAX_SCHEMA_CHARS else text[:MAX_SCHEMA_CHARS] + "\n# ...(truncated)"


def method_input_spec(spec_root: Path, catalog: MethodCatalog, method_id: str) -> dict[str, Any]:
    """Everything the model needs to draft one method's builder kwargs. Raises when the method is not dispatchable."""
    entry = catalog.require(method_id)
    contract_path = spec_root / entry["path"] if not Path(entry["path"]).is_absolute() else Path(entry["path"])
    contract = yaml.safe_load(contract_path.read_text(encoding="utf-8")) if contract_path.is_file() else {}
    contract = contract if isinstance(contract, dict) else {}
    builder = resolve_builder(method_id)
    parameters = []
    for name, parameter in inspect.signature(builder).parameters.items():
        parameters.append({"name": name, "required": parameter.default is inspect.Parameter.empty})
    description = str(contract.get("description") or "")
    return {
        "method_id": method_id,
        "title": contract.get("title"),
        "description": description[:MAX_CONTRACT_CHARS],
        "purpose": contract.get("purpose"),
        "preconditions": contract.get("preconditions"),
        "forbidden": contract.get("forbidden_transition"),
        "parameters": parameters,
        "record_id_prefix": record_id_prefix(method_id, required=False),
        "schema_yaml": _schema_text(spec_root, contract_path, list(contract.get("outputs") or [])) if contract_path.is_file() else None,
    }


_SYSTEM = (
    "You draft structured input records for a Cognitive Engineering OS method. Reply with ONE JSON object and "
    "nothing else: no prose, no markdown fence. Keys are exactly the builder parameter names listed. Content must "
    "come from the user's brief; where the brief is silent, write a clearly marked placeholder string starting with "
    "'TBD:' rather than inventing facts. Write text fields in the language of the brief. Every nested provenance "
    f"object must be {{\"epistemic_type\": one of {sorted(EPISTEMIC_TYPES)}, \"authorship_state\": \"AI_SUGGESTED\", "
    "\"locked\": null}. Dates are ISO YYYY-MM-DD. Numbers are JSON numbers, never strings. Ids are short "
    "UPPER-KEBAB tokens unique within the record."
)


def build_prompt(spec: dict[str, Any], brief: str, *, exclude_params: tuple[str, ...] = (), previous: dict[str, Any] | None = None, error: str | None = None) -> str:
    params = [p for p in spec["parameters"] if p["name"] not in exclude_params]
    # The identity parameter is not always literally named `record_id` -- ~66 builders use a
    # domain-specific name instead (e.g. analysis_id/canvas_id/map_id; see dispatch.py's
    # invoke_builder docstring). It is, by this codebase's own consistent convention (every builder
    # signature checked 2026-09-18), always the FIRST declared parameter. Hardcoding the literal
    # string 'record_id' here (pre-existing bug, found while adding RECORD_ID_PREFIX to several
    # architecture-family modules for the dashboard's id-suggest button) told the model to prefix a
    # key that, for those builders, does not exist -- a vacuous instruction that silently gave the
    # model zero guidance on the real key's expected prefix.
    identity_param = spec["parameters"][0]["name"] if spec.get("parameters") else None
    lines = [
        f"METHOD: {spec['method_id']} -- {spec.get('title') or ''}",
        f"PURPOSE: {json.dumps(spec.get('purpose'), ensure_ascii=False)}",
        f"PRECONDITIONS (the builder refuses records that violate these): {json.dumps(spec.get('preconditions'), ensure_ascii=False)}",
        f"DESCRIPTION: {spec.get('description')}",
        "BUILDER PARAMETERS (produce exactly these keys"
        + (f"; '{identity_param}' if present must start with '{spec['record_id_prefix']}'" if spec.get("record_id_prefix") and identity_param else "")
        + f"): {json.dumps(params, ensure_ascii=False)}",
    ]
    if exclude_params:
        lines.append(f"DO NOT produce these keys (filled by upstream steps): {list(exclude_params)}")
    if spec.get("schema_yaml"):
        lines.append("OUTPUT RECORD JSON SCHEMA (YAML; the builder's kwargs become this record's top-level properties, so nested shapes/enums here are binding):\n" + spec["schema_yaml"])
    lines.append("USER BRIEF:\n" + brief)
    if previous is not None and error:
        lines.append("YOUR PREVIOUS DRAFT WAS REFUSED. Previous draft:\n" + json.dumps(previous, ensure_ascii=False))
        lines.append("REFUSAL (fix exactly this, keep everything else): " + error)
    return "\n\n".join(lines)


def extract_json_object(text: str) -> dict[str, Any]:
    """First balanced top-level JSON object in ``text``; fences and surrounding prose are tolerated."""
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE | re.MULTILINE)
    start = stripped.find("{")
    if start < 0:
        raise InvariantViolation("AI_DRAFT_NOT_JSON: no object in model output")
    decoder = json.JSONDecoder()
    try:
        parsed, _ = decoder.raw_decode(stripped[start:])
    except json.JSONDecodeError as error:
        raise InvariantViolation(f"AI_DRAFT_NOT_JSON: {error.msg} at char {error.pos}") from None
    if not isinstance(parsed, dict):
        raise InvariantViolation("AI_DRAFT_NOT_JSON: top-level value is not an object")
    return parsed


def _validate(method_id: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Run the real builder + gates on the draft. Never raises for a bad draft; raises only when dispatch itself is broken."""
    builder = resolve_builder(method_id)
    gate_runner = resolve_gate_runner(method_id)
    body = dict(kwargs)
    provenance = body.pop("provenance", None) or make_provenance("AI_SUGGESTION", "AI_SUGGESTED")
    record_id = body.get("record_id") or f"{record_id_prefix(method_id, required=False) or ''}DRAFT"
    try:
        record = invoke_builder(builder, record_id, provenance, body)
    except InvariantViolation as error:
        return {"ok": False, "stage": "builder", "error": str(error), "gate_results": []}
    gate_results = gate_runner(record, "ai.draft", datetime.datetime.now(datetime.timezone.utc).isoformat())
    failed = [g for g in gate_results if not isinstance(g, dict) or g.get("status") != "PASS"]
    if failed:
        return {
            "ok": False,
            "stage": "gates",
            "error": "; ".join(f"{g.get('gate_id')}: {json.dumps(g.get('evidence'), ensure_ascii=False)[:600]}" if isinstance(g, dict) else "malformed gate result" for g in failed),
            "gate_results": gate_results,
        }
    return {"ok": True, "stage": "gates", "error": None, "gate_results": gate_results}


def _stamp_ai_provenance(kwargs: dict[str, Any], parameters: list[dict[str, Any]]) -> None:
    """Top-level provenance is set outright; EVERY nested provenance-shaped dict (item-level provenance on the
    66 builders that carry it per item) is forced to AI_SUGGESTED/unlocked. The model is told to do this, but an
    instruction is not an invariant -- a prompt-injected brief must not yield HUMAN_APPROVED items."""
    names = {p["name"] for p in parameters}
    if "provenance" in names:
        kwargs["provenance"] = make_provenance("AI_SUGGESTION", "AI_SUGGESTED")
    _force_ai_authorship(kwargs)


def _force_ai_authorship(value: Any) -> None:
    if isinstance(value, dict):
        if "epistemic_type" in value and "authorship_state" in value:
            value["authorship_state"] = "AI_SUGGESTED"
            value["locked"] = None
        for child in value.values():
            _force_ai_authorship(child)
    elif isinstance(value, list):
        for child in value:
            _force_ai_authorship(child)


class AiDraftProviderError(InvariantViolation):
    """Provider/egress failure mid-draft; carries the tokens already consumed so the caller can meter them."""

    def __init__(self, message: str, *, input_tokens: int = 0, output_tokens: int = 0):
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


def draft_method_kwargs(
    method_id: str,
    brief: str,
    *,
    provider: AiProvider,
    spec_root: Path,
    catalog: MethodCatalog,
    exclude_params: tuple[str, ...] = (),
    max_attempts: int = MAX_ATTEMPTS,
) -> DraftResult:
    brief = require_brief(brief)
    try:
        spec = method_input_spec(spec_root, catalog, method_id)
    except MethodDispatchError as error:
        raise InvariantViolation(f"AI_DRAFT_METHOD_NOT_DISPATCHABLE: {error}") from error
    allowed = {p["name"] for p in spec["parameters"]} - set(exclude_params)
    previous: dict[str, Any] | None = None
    error: str | None = None
    result = DraftResult(method_id=method_id, kwargs={}, validation={"ok": False, "stage": "none", "error": None, "gate_results": []}, attempts=0, model=provider.model)
    for attempt in range(1, max(1, max_attempts) + 1):
        try:
            completion = provider.complete(_SYSTEM, build_prompt(spec, brief, exclude_params=exclude_params, previous=previous, error=error), max_tokens=DRAFT_MAX_TOKENS)
        except InvariantViolation as provider_error:
            raise AiDraftProviderError(str(provider_error), input_tokens=result.input_tokens, output_tokens=result.output_tokens) from provider_error
        result.attempts = attempt
        result.model = completion.model
        result.input_tokens += completion.input_tokens
        result.output_tokens += completion.output_tokens
        try:
            kwargs = extract_json_object(completion.text)
        except InvariantViolation as parse_error:
            previous, error = {"raw": completion.text[:2000]}, str(parse_error)
            result.validation = {"ok": False, "stage": "parse", "error": error, "gate_results": []}
            continue
        kwargs = {k: v for k, v in kwargs.items() if k in allowed}
        _stamp_ai_provenance(kwargs, spec["parameters"])
        result.kwargs = kwargs
        result.excluded_params = list(exclude_params)
        if exclude_params:
            result.validation = {"ok": None, "stage": "skipped", "error": "params bound from upstream outputs; the Recipe run validates", "gate_results": []}
            return result
        result.validation = _validate(method_id, kwargs)
        if result.validation["ok"]:
            return result
        previous, error = kwargs, result.validation["error"]
    return result


def _assign(target: dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    cursor = target
    for part in parts[:-1]:
        nxt = cursor.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cursor[part] = nxt
        cursor = nxt
    cursor[parts[-1]] = value


def recipe_draft_plan(spec_root: Path, recipe_id: str) -> list[dict[str, Any]]:
    """Per method node: which builder params come from ``source.*`` (draftable) and which from ``outputs.*``."""
    workflow_ir = compile_recipe_to_workflow_ir(spec_root, recipe_id, "R0")
    plan = []
    for node in workflow_ir["nodes"]:
        if node.get("node_kind") != "method":
            continue
        bindings = node.get("bindings") if isinstance(node.get("bindings"), dict) else {}
        source_params = {k: v for k, v in bindings.items() if isinstance(v, str) and v.startswith("source.")}
        upstream_params = [k for k, v in bindings.items() if isinstance(v, str) and v.startswith("outputs.")]
        declared = node.get("input")
        declared_list = [declared] if isinstance(declared, str) else list(declared or [])
        plan.append(
            {
                "label": node.get("label"),
                "method_id": node.get("method_id"),
                "source_params": source_params,
                "upstream_params": upstream_params,
                "declared_source_paths": [p.removeprefix("source.") for p in declared_list if isinstance(p, str) and p.startswith("source.")],
            }
        )
    return plan


def draft_recipe_source(
    recipe_id: str,
    brief: str,
    *,
    provider: AiProvider,
    spec_root: Path,
    catalog: MethodCatalog,
    labels: list[str] | None = None,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Draft the Source object for a Recipe, one model call per method node (optionally only ``labels``).

    ``source`` (a partially drafted Source from an earlier call) is extended, so the UI can draft node by node."""
    brief = require_brief(brief)
    plan = recipe_draft_plan(spec_root, recipe_id)
    if labels is not None:
        known = {p["label"] for p in plan}
        unknown = [label for label in labels if label not in known]
        if unknown:
            raise InvariantViolation(f"AI_DRAFT_UNKNOWN_NODE_LABELS: {unknown}")
        plan = [p for p in plan if p["label"] in labels]
    out: dict[str, Any] = dict(source) if isinstance(source, dict) else {}
    nodes: list[dict[str, Any]] = []
    usage = {"input_tokens": 0, "output_tokens": 0}
    for node in plan:
        for path in node["declared_source_paths"]:
            if path not in out or not isinstance(out.get(path), dict):
                _assign(out, path, {})
        if not node["source_params"]:
            nodes.append({"label": node["label"], "method_id": node["method_id"], "ok": None, "error": "no source-bound params", "attempts": 0})
            continue
        try:
            result = draft_method_kwargs(node["method_id"], brief, provider=provider, spec_root=spec_root, catalog=catalog, exclude_params=tuple(node["upstream_params"]))
        except AiDraftProviderError as error:
            usage["input_tokens"] += error.input_tokens
            usage["output_tokens"] += error.output_tokens
            raise AiDraftProviderError(str(error), input_tokens=usage["input_tokens"], output_tokens=usage["output_tokens"]) from error
        except InvariantViolation as error:
            nodes.append({"label": node["label"], "method_id": node["method_id"], "ok": False, "error": str(error), "attempts": 0})
            continue
        usage["input_tokens"] += result.input_tokens
        usage["output_tokens"] += result.output_tokens
        for param, path in node["source_params"].items():
            if param in result.kwargs:
                _assign(out, path.removeprefix("source."), result.kwargs[param])
        nodes.append({"label": node["label"], "method_id": node["method_id"], "ok": result.validation["ok"], "error": result.validation["error"], "attempts": result.attempts})
    return {"recipe_id": recipe_id, "source": out, "nodes": nodes, "usage": usage, "model": provider.model}
