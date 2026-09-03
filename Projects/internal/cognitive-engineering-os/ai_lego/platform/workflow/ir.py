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
from typing import Any

import yaml

from ai_lego.errors import InvariantViolation

_PASSTHROUGH = ("label", "input", "necessity", "gate_ref")


def load_recipe(spec_root: Path, recipe_id: str) -> dict[str, Any]:
    path = spec_root / "recipes" / "validated" / f"{recipe_id}.recipe.yaml"
    if not path.is_file():
        raise InvariantViolation(f"RECIPE_NOT_FOUND: {path}")
    recipe = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(recipe, dict) or recipe.get("id") != recipe_id:
        raise InvariantViolation(f"RECIPE_ID_MISMATCH: {path} does not declare id {recipe_id}")
    if recipe.get("status") != "ACTIVE":
        raise InvariantViolation(f"RECIPE_NOT_ACTIVE: {recipe_id} has status {recipe.get('status')}")
    return recipe


def compile_recipe_to_workflow_ir(spec_root: Path, recipe_id: str, risk_tier: str) -> dict[str, Any]:
    recipe = load_recipe(spec_root, recipe_id)
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
    return {
        "id": recipe_id,
        "references": recipe["references"],
        "risk_tier": risk_tier,
        "compiled_from": {"source_kind": "recipe", "recipe_id": recipe_id, "recipe_version": str(recipe["version"])},
        "nodes": nodes,
    }
