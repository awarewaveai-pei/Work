"""Generic method dispatch: resolve a Method Atlas ``method_id`` to its module, find its sole
builder (``generate_*``) and gate-runner (``evaluate_*_gates``) functions by introspection, and
invoke them against a caller-supplied kwargs dict.

Why introspection instead of a per-method adapter table: this corpus's own naming convention is
NOT perfectly uniform (e.g. ``jurisdiction.market_admission_control``'s builder is named
``generate_market_admission``, not ``generate_market_admission_control``) -- verified
corpus-wide (2026-09-12) that every method module has EXACTLY 0 or 1 top-level function matching
each of the two patterns below, so "the sole matching function" is a safe, mechanical way to find
the right callable without hand-maintaining a 245-entry lookup table that would drift the moment a
new method lands (violates zero-rework -- a new Method Atlas method should need ZERO changes here
to become invokable through this API).
"""

from __future__ import annotations

import importlib
import inspect
from typing import Any, Callable

from ai_lego.errors import InvariantViolation


class MethodDispatchError(Exception):
    """Raised when a method_id resolves in the MethodCatalog but this module cannot find a
    dispatchable builder/gate-runner for it (the ~8 non-method utility modules in
    ai_lego/modules/{knowledge,research}/ that have no generate_*/evaluate_*_gates pair)."""


def _module_for(method_id: str):
    if "." not in method_id:
        raise MethodDispatchError(f"method_id {method_id!r} is not in <family>.<name> form")
    family, name = method_id.split(".", 1)
    module_path = f"ai_lego.modules.{family}.{name}"
    try:
        return importlib.import_module(module_path)
    except ModuleNotFoundError as error:
        raise MethodDispatchError(f"no module {module_path} for method_id {method_id!r}") from error


def _sole_matching_function(module: Any, predicate: Callable[[str], bool], kind: str, method_id: str) -> Callable[..., Any]:
    matches = [name for name in dir(module) if predicate(name) and inspect.isfunction(getattr(module, name)) and inspect.getmodule(getattr(module, name)) is module]
    if len(matches) != 1:
        raise MethodDispatchError(f"expected exactly 1 {kind} function in {module.__name__} for method_id {method_id!r}, found {len(matches)}: {matches}")
    return getattr(module, matches[0])


def resolve_builder(method_id: str) -> Callable[..., dict[str, Any]]:
    module = _module_for(method_id)
    return _sole_matching_function(module, lambda n: n.startswith("generate_"), "builder (generate_*)", method_id)


def resolve_gate_runner(method_id: str) -> Callable[..., list[dict[str, Any]]]:
    module = _module_for(method_id)
    return _sole_matching_function(module, lambda n: n.startswith("evaluate_") and n.endswith("_gates"), "gate-runner (evaluate_*_gates)", method_id)


def record_id_prefix(method_id: str, *, required: bool = True) -> str | None:
    """``RECORD_ID_PREFIX`` is only load-bearing when the API auto-supplies ``record_id`` (builders that declare
    that parameter). Builders with a domain identity param (``analysis_id``...) take the caller's id verbatim, so
    ``required=False`` returns ``None`` for them instead of blocking dispatch (2026-09-17: 42 ACTIVE methods
    answered 501 on /invoke for a constant they never used)."""
    module = _module_for(method_id)
    prefix = getattr(module, "RECORD_ID_PREFIX", None)
    if isinstance(prefix, str) and prefix:
        return prefix
    if required:
        raise MethodDispatchError(f"{module.__name__} has no RECORD_ID_PREFIX constant for method_id {method_id!r}")
    return None


def builder_takes_record_id(builder: Callable[..., Any]) -> bool:
    return "record_id" in inspect.signature(builder).parameters


def self_id_param(builder: Callable[..., Any]) -> str | None:
    """The domain-specific identity parameter (``analysis_id``, ``session_id``...) of a builder that
    does not take ``record_id``: by this corpus's convention it is always the FIRST parameter. A later
    ``*_id`` parameter is usually a REFERENCE to another record and is never auto-filled."""
    parameters = list(inspect.signature(builder).parameters)
    if not parameters or "record_id" in parameters:
        return None
    return parameters[0] if parameters[0].endswith("_id") else None


def server_kwargs(builder_or_gate: Callable[..., Any], injected: dict[str, Any] | None) -> dict[str, Any]:
    """The subset of live server objects (``method_catalog``...) this callable declares by name."""
    parameters = inspect.signature(builder_or_gate).parameters
    return {name: value for name, value in (injected or {}).items() if name in parameters}


def run_gate_runner(
    gate_runner: Callable[..., list[dict[str, Any]]],
    record: dict[str, Any],
    validator: str,
    timestamp: str,
    injected: dict[str, Any] | None = None,
    inputs: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Call a single-method gate runner by parameter NAME: most are ``(record, validator, timestamp)``,
    but guided_mode's takes ``method_catalog`` and concept_graph_view's re-checks the record against the
    ``source_relations`` the builder was given (not stored in the record) -- a positional call handed
    the first one the validator string and crashed the second."""
    parameters = list(inspect.signature(gate_runner).parameters)
    kwargs: dict[str, Any] = {parameters[0]: record, **server_kwargs(gate_runner, injected)}
    for name, value in (("validator", validator), ("timestamp", timestamp)):
        if name in parameters:
            kwargs[name] = value
    for name in parameters:
        if name not in kwargs and inputs is not None and name in inputs:
            kwargs[name] = inputs[name]
    return gate_runner(**kwargs)


def invoke_builder(builder: Callable[..., dict[str, Any]], record_id: str, provenance: dict[str, Any], body: dict[str, Any], injected: dict[str, Any] | None = None) -> dict[str, Any]:
    """Binds ``body``'s keys to ``builder``'s own parameter names (every builder in this corpus
    takes POSITIONAL_OR_KEYWORD params, so keyword-calling is always valid regardless of each
    method's own positional/keyword split), auto-supplying ``record_id``/``provenance`` unless the
    caller already provided them -- but ONLY for the ~179 (of 245, 2026-09-13 count) builders that
    actually declare parameters with those exact names. 66 builders use a domain-specific identity
    param instead (e.g. ``strategy.swot``'s ``analysis_id``) and/or carry provenance per-item
    instead of as a top-level param -- unconditionally injecting ``record_id``/``provenance`` into
    ``call_kwargs`` for those made every one of their real production invokes fail with
    DISPATCH_BAD_ARGUMENTS regardless of what the caller sent (found 2026-09-13 testing
    strategy.swot for real against the live API -- see WORKLOG). Their identity param is the FIRST
    parameter (``self_id_param``) and gets the same generated id by default (2026-09-19); a caller
    may still pass its own. ``injected`` carries live server objects (``method_catalog``) to the
    builders that declare them by name.

    Always raises ``InvariantViolation`` on any failure -- both a real builder refusal (a
    business-rule violation) AND a bad-argument-shape ``TypeError`` from ``inspect.Signature.bind``
    (missing/unexpected argument) are normalized to this one exception type, so the API layer
    (``ai_lego/apps/api/main.py``) needs only one ``except`` clause to turn either failure into an
    HTTP 400."""
    call_kwargs: dict[str, Any] = dict(body)
    sig = inspect.signature(builder)
    if "record_id" in sig.parameters:
        call_kwargs.setdefault("record_id", record_id)
    identity = self_id_param(builder)
    if identity is not None:
        # same auto-supply as record_id: the dashboard no longer asks a person to invent an internal id
        call_kwargs.setdefault(identity, record_id)
    if "provenance" in sig.parameters:
        call_kwargs.setdefault("provenance", provenance)
    for name, value in server_kwargs(builder, injected).items():
        call_kwargs[name] = value  # never caller-overridable: a JSON body cannot carry a live catalog anyway
    try:
        bound = sig.bind(**call_kwargs)
    except TypeError as error:
        raise InvariantViolation(f"DISPATCH_BAD_ARGUMENTS: {error} (expected parameters: {list(sig.parameters)})") from error
    bound.apply_defaults()
    return builder(*bound.args, **bound.kwargs)


def invoke_gate_runner(
    gate_runner: Callable[..., list[dict[str, Any]]],
    record: dict[str, Any],
    context: dict[str, Any],
    validator: str,
    timestamp: str,
) -> list[dict[str, Any]]:
    """Invoke a method gate runner through explicit named context dependencies.

    Gate runners are not uniform: most consume ``(record, validator,
    timestamp)``, while cross-method gates such as TOWS also require the
    upstream record they re-check.  Positional calling silently breaks the
    latter class.  Resolve only the small set of named runtime values and
    fail closed when a required dependency is not present in the workflow
    context.
    """
    outputs = context.get("outputs")
    if not isinstance(outputs, dict):
        raise InvariantViolation("DISPATCH_GATE_CONTEXT_INVALID: outputs mapping required")
    by_normalized_name = {str(key).lower(): value for key, value in outputs.items()}
    values: dict[str, Any] = {
        "record": record,
        "output": record,
        "result": record,
        "validator": validator,
        "timestamp": timestamp,
    }
    signature = inspect.signature(gate_runner)
    parameters = list(signature.parameters.values())
    if parameters and parameters[0].kind in {inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD} and parameters[0].name not in values:
        values[parameters[0].name] = record
    for name in signature.parameters:
        if name not in values and name.lower() in by_normalized_name:
            values[name] = by_normalized_name[name.lower()]
    call_kwargs = {name: values[name] for name in signature.parameters if name in values}
    try:
        bound = signature.bind(**call_kwargs)
    except TypeError as error:
        raise InvariantViolation(f"DISPATCH_GATE_ARGUMENTS: {error}") from error
    bound.apply_defaults()
    return gate_runner(*bound.args, **bound.kwargs)


def method_binding_issues(builder: Callable[..., Any], bindings: Any) -> list[dict[str, Any]]:
    """Check a Recipe method node's binding keys against the live builder signature.

    ``record_id`` and ``provenance`` are runtime-supplied by ``invoke_builder``
    when the builder declares them, so a Recipe need not bind either one.  All
    other required parameters must be explicitly bound; unknown keys and
    malformed paths fail at plan time instead of waiting for a runtime
    ``TypeError``.
    """
    issues: list[dict[str, Any]] = []
    if not isinstance(bindings, dict):
        return [{"code": "BINDINGS_NOT_OBJECT", "detail": "method node bindings must be an object"}]
    parameters = inspect.signature(builder).parameters
    invalid_keys = sorted(
        (str(key) for key in bindings if not isinstance(key, str) or not key or key not in parameters),
        key=str,
    )
    if invalid_keys:
        issues.append({"code": "UNKNOWN_BUILDER_ARGUMENT", "arguments": invalid_keys})
    invalid_values = sorted(
        (str(key) for key, value in bindings.items() if not isinstance(key, str) or not key or not isinstance(value, str) or not value),
        key=str,
    )
    if invalid_values:
        issues.append({"code": "BINDING_PATH_INVALID", "arguments": invalid_values})
    missing = sorted(
        name
        for name, parameter in parameters.items()
        if name not in {"record_id", "provenance"}
        and parameter.default is inspect.Parameter.empty
        and parameter.kind in {inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}
        and name not in bindings
    )
    if missing:
        issues.append({"code": "REQUIRED_BUILDER_ARGUMENT_MISSING", "arguments": missing})
    return issues
