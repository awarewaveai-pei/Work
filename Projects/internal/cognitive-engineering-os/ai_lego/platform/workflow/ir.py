"""Recipe -> Workflow IR compilation (Master Plan §9; ``specs/workflow/workflow-ir.schema.yaml``).

The compiler reads a validated Recipe instance from the spec root and emits
the IR node list mechanically: ``type: capability`` steps become
``capability_node``s, ``type: method`` steps become ``method_node``s, and the
Recipe's Atlas pin is carried through as ``references``. Nothing is
hand-authored, so the IR can never drift from the Recipe it claims to come
from -- ``compiled_from`` names that Recipe and version.
"""

from __future__ import annotations

from pathlib import Path
from functools import lru_cache
from typing import Any, Mapping

from ai_lego.core.yaml_safe import safe_load as safe_load_yaml

from ai_lego.errors import InvariantViolation
from ai_lego.core.contracts.schema_contracts import SchemaContracts

_PASSTHROUGH = ("label", "input", "bindings", "necessity", "gate_ref")
_RECIPE_SCHEMA = "ai-lego://specs/cognitive/recipe.schema.yaml"
_WORKFLOW_IR_SCHEMA = "ai-lego://specs/workflow/workflow-ir.schema.yaml"


@lru_cache(maxsize=4)
def _schema_contracts(spec_root_string: str) -> SchemaContracts:
    """Cache the read-only schema registry while keeping compiler calls cheap."""
    return SchemaContracts(Path(spec_root_string))


def load_recipe(spec_root: Path, recipe_id: str) -> dict[str, Any]:
    path = spec_root / "recipes" / "validated" / f"{recipe_id}.recipe.yaml"
    if not path.is_file():
        raise InvariantViolation(f"RECIPE_NOT_FOUND: {path}")
    recipe = safe_load_yaml(path.read_text(encoding="utf-8"))
    if not isinstance(recipe, dict) or recipe.get("id") != recipe_id:
        raise InvariantViolation(f"RECIPE_ID_MISMATCH: {path} does not declare id {recipe_id}")
    if recipe.get("status") != "ACTIVE":
        raise InvariantViolation(f"RECIPE_NOT_ACTIVE: {recipe_id} has status {recipe.get('status')}")
    return recipe


def workflow_dataflow_issues(
    workflow_ir: Mapping[str, Any],
    *,
    allow_external_outputs: bool = False,
    allowed_external_output_labels: set[str] | None = None,
) -> tuple[str, ...]:
    """Find output references whose producer is unknown or runs too late.

    ``outputs.<label>`` is created only after the node carrying ``label``
    succeeds.  Checking that dependency at compile time prevents a Recipe
    from reaching runtime with a typo or a forward reference that can only
    fail after journals and partial work have already been created.
    """
    nodes = workflow_ir.get("nodes")
    if not isinstance(nodes, list):
        return ("WORKFLOW_NODES_MISSING",)
    producers: dict[str, int] = {}
    for index, raw_node in enumerate(nodes):
        if not isinstance(raw_node, Mapping):
            continue
        label = raw_node.get("label")
        if not isinstance(label, str) or not label.strip():
            label = f"step-{index + 1}"
        if label in producers:
            return (f"duplicate output label {label!r} at nodes {producers[label]} and {index}",)
        producers[label] = index

    issues: list[str] = []
    for consumer_index, raw_node in enumerate(nodes):
        if not isinstance(raw_node, Mapping):
            continue
        declared = raw_node.get("input")
        node_paths = []
        if isinstance(declared, str):
            node_paths.append(declared)
        elif isinstance(declared, list):
            node_paths.extend(item for item in declared if isinstance(item, str))
        bindings = raw_node.get("bindings")
        if isinstance(bindings, Mapping):
            node_paths.extend(value for value in bindings.values() if isinstance(value, str))
        for path in dict.fromkeys(node_paths):
            if path.startswith("outputs."):
                producer_label = next(
                    (label for label in sorted(producers, key=len, reverse=True)
                     if path == f"outputs.{label}" or path.startswith(f"outputs.{label}.")),
                    None,
                )
                external_label = next(
                    (label for label in sorted(allowed_external_output_labels or (), key=len, reverse=True)
                     if path == f"outputs.{label}" or path.startswith(f"outputs.{label}.")),
                    None,
                )
                if producer_label is None and external_label is None and not allow_external_outputs:
                    issues.append(f"node {consumer_index} references unknown output {path!r}")
                elif producer_label is not None and producers[producer_label] >= consumer_index:
                    issues.append(
                        f"node {consumer_index} references output {producer_label!r} from node {producers[producer_label]}"
                        " that has not completed yet"
                    )
            elif path.startswith("steps."):
                step_token = path.removeprefix("steps.").split(".", 1)[0]
                if not step_token.isdigit() or int(step_token) >= len(nodes):
                    issues.append(f"node {consumer_index} references unknown step path {path!r}")
                elif int(step_token) >= consumer_index:
                    issues.append(
                        f"node {consumer_index} references step {int(step_token)} that has not completed yet"
                    )
    return tuple(dict.fromkeys(issues))


def compile_recipe_to_workflow_ir(spec_root: Path, recipe_id: str, risk_tier: str) -> dict[str, Any]:
    recipe = load_recipe(spec_root, recipe_id)
    _schema_contracts(str(spec_root.resolve())).validate(_RECIPE_SCHEMA, recipe, f"Recipe {recipe_id}")
    nodes: list[dict[str, Any]] = []
    for step in recipe.get("steps", []):
        kind = step.get("type")
        if kind == "capability":
            node: dict[str, Any] = {"node_kind": "capability", "ref": step["ref"]}
        elif kind == "method":
            node = {"node_kind": "method", "method_id": step["method_id"]}
        else:
            raise InvariantViolation(f"RECIPE_STEP_TYPE_UNKNOWN: {kind!r} in {recipe_id}")
        for key in _PASSTHROUGH:
            if step.get(key) is not None:
                node[key] = step[key]
        nodes.append(node)
    if not nodes:
        raise InvariantViolation(f"RECIPE_HAS_NO_STEPS: {recipe_id}")
    compiled: dict[str, Any] = {
        "id": recipe_id,
        "risk_tier": risk_tier,
        "compiled_from": {"source_kind": "recipe", "recipe_id": recipe_id, "recipe_version": str(recipe["version"])},
        "nodes": nodes,
    }
    # references are optional for capability-only Recipes and required by the
    # workflow IR only when a method node exists. Preserve that conditional
    # contract instead of indexing an absent optional key.
    if "references" in recipe:
        compiled["references"] = recipe["references"]
    if "workflow_gate_refs" in recipe:
        compiled["workflow_gate_refs"] = recipe["workflow_gate_refs"]
    dataflow_issues = workflow_dataflow_issues(compiled)
    if dataflow_issues:
        raise InvariantViolation(f"WORKFLOW_DATAFLOW_INVALID: {'; '.join(dataflow_issues)}")
    _schema_contracts(str(spec_root.resolve())).validate(_WORKFLOW_IR_SCHEMA, compiled, f"compiled Workflow IR {recipe_id}")
    return compiled


def project_workflow_ir(
    compiled_ir: dict[str, Any],
    node_indexes: list[int],
    bindings: dict[int, dict[str, Any]] | None = None,
    workflow_id: str | None = None,
) -> dict[str, Any]:
    """Create an explicitly bound subgraph without re-declaring node identity.

    A runtime vertical slice may execute only the currently implemented part of
    a larger Recipe.  Its refs and node kinds must still come from the
    compiler; only execution-specific aliases/inputs may be bound here.
    Invalid indexes and bindings fail closed instead of silently selecting a
    different Recipe node.
    """
    source_nodes = compiled_ir.get("nodes")
    if not isinstance(source_nodes, list) or not source_nodes:
        raise InvariantViolation("WORKFLOW_IR_SOURCE_NODES_MISSING")
    if not node_indexes or len(set(node_indexes)) != len(node_indexes):
        raise InvariantViolation(f"WORKFLOW_IR_PROJECTION_INDEXES_INVALID: {node_indexes!r}")
    bindings = bindings or {}
    unknown_bindings = sorted(set(bindings) - set(node_indexes))
    if unknown_bindings:
        raise InvariantViolation(f"WORKFLOW_IR_PROJECTION_BINDING_NOT_SELECTED: {unknown_bindings}")
    for index, override in bindings.items():
        if not isinstance(override, Mapping):
            raise InvariantViolation(f"WORKFLOW_IR_PROJECTION_BINDING_INVALID: node {index} override must be an object")
        identity_overrides = sorted(set(override) - set(_PASSTHROUGH))
        if identity_overrides:
            raise InvariantViolation(
                f"WORKFLOW_IR_PROJECTION_IDENTITY_OVERRIDE: node {index} cannot override {identity_overrides}"
            )
    for index in node_indexes:
        if not isinstance(index, int) or index < 0 or index >= len(source_nodes):
            raise InvariantViolation(f"WORKFLOW_IR_PROJECTION_INDEX_OUT_OF_RANGE: {index!r}")
    label_aliases: dict[str, str] = {}
    for index in node_indexes:
        source_node = source_nodes[index]
        if not isinstance(source_node, Mapping):
            continue
        original = source_node.get("label")
        if not isinstance(original, str) or not original.strip():
            original = f"step-{index + 1}"
        override = bindings.get(index, {}).get("label") if isinstance(bindings.get(index), Mapping) else None
        effective = override if isinstance(override, str) and override.strip() else original
        if original != effective:
            label_aliases[original] = effective

    def rewrite_output_path(path: str) -> str:
        for original, effective in sorted(label_aliases.items(), key=lambda item: len(item[0]), reverse=True):
            old_prefix = f"outputs.{original}"
            if path == old_prefix or path.startswith(f"{old_prefix}."):
                return f"outputs.{effective}{path[len(old_prefix):]}"
        return path

    def rewrite_node_paths(node: dict[str, Any]) -> None:
        declared = node.get("input")
        if isinstance(declared, str):
            node["input"] = rewrite_output_path(declared)
        elif isinstance(declared, list):
            node["input"] = [rewrite_output_path(path) if isinstance(path, str) else path for path in declared]
        declared_bindings = node.get("bindings")
        if isinstance(declared_bindings, Mapping):
            node["bindings"] = {
                argument: rewrite_output_path(path) if isinstance(path, str) else path
                for argument, path in declared_bindings.items()
            }

    nodes: list[dict[str, Any]] = []
    for index in node_indexes:
        if not isinstance(index, int) or index < 0 or index >= len(source_nodes):
            raise InvariantViolation(f"WORKFLOW_IR_PROJECTION_INDEX_OUT_OF_RANGE: {index!r}")
        node = dict(source_nodes[index])
        rewrite_node_paths(node)
        # Rewrite only inherited dataflow references. Explicit runtime bindings
        # define the projected boundary and must remain authoritative.
        node.update(bindings.get(index, {}))
        nodes.append(node)
    projected = dict(compiled_ir)
    projected["id"] = workflow_id or f"{compiled_ir['id']}:projection"
    projected["nodes"] = nodes
    projected["projection"] = {"source_node_indexes": list(node_indexes), "source_workflow_id": compiled_ir["id"]}
    selected_indexes = set(node_indexes)
    external_labels = {
        node.get("label") if isinstance(node.get("label"), str) and node.get("label").strip() else f"step-{index + 1}"
        for index, node in enumerate(source_nodes)
        if index not in selected_indexes and isinstance(node, Mapping)
    }
    dataflow_issues = workflow_dataflow_issues(
        projected,
        allowed_external_output_labels=external_labels,
    )
    if dataflow_issues:
        raise InvariantViolation(f"WORKFLOW_PROJECTION_DATAFLOW_INVALID: {'; '.join(dataflow_issues)}")
    return projected
