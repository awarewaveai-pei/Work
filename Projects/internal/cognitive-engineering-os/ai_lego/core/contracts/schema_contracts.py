"""Read-only loader for the canonical ``ai-lego://`` YAML schemas plus an instance validator.

Every record the runtime emits (events, envelopes, manifests, gate results,
state transitions, deletion requests...) is validated against the spec root's
own JSON Schema (Draft 2020-12) before it is written. The spec root is never
modified; schemas are loaded into an in-memory ``referencing`` registry keyed
by their declared ``$id``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_lego.core.yaml_safe import safe_load as safe_load_yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from ai_lego.errors import InvariantViolation, SchemaValidationError


class SchemaContracts:
    def __init__(self, spec_root: Path) -> None:
        specs_dir = spec_root / "specs"
        if not specs_dir.is_dir():
            raise InvariantViolation(f"SPEC_ROOT_INVALID: {specs_dir} is not a directory")
        resources: list[tuple[str, Resource[Any]]] = []
        for schema_path in sorted(specs_dir.rglob("*.yaml")):
            schema = safe_load_yaml(schema_path.read_text(encoding="utf-8"))
            if isinstance(schema, dict) and schema.get("$id"):
                resources.append((schema["$id"], Resource.from_contents(schema)))
        if not resources:
            raise InvariantViolation(f"SPEC_ROOT_EMPTY: no $id-bearing schema under {specs_dir}")
        self.spec_root = spec_root
        self.registry = Registry().with_resources(resources)
        self.schema_count = len(resources)

    def _found(self, reference: str, instance: Any) -> list[Any]:
        validator = Draft202012Validator({"$ref": reference}, registry=self.registry)
        return sorted(validator.iter_errors(instance), key=lambda error: list(error.absolute_path))

    def errors(self, reference: str, instance: Any) -> list[str]:
        return [f"{list(error.absolute_path)}: {error.message}" for error in self._found(reference, instance)]

    def violations(self, reference: str, instance: Any) -> list[str]:
        """Where the instance breaks the schema, never its values: ``"sections[0].claims[2].citations minItems"``. A message
        can quote a value (a fetched page, a person's name); a path and a keyword cannot, so this is what a failure stores."""
        return [_violation(error) for error in self._found(reference, instance)]

    def validate(self, reference: str, instance: Any, label: str) -> None:
        found = self._found(reference, instance)
        if found:
            detail = "; ".join(f"{list(error.absolute_path)}: {error.message}" for error in found[:4])
            raise SchemaValidationError(f"SCHEMA_VALIDATION_FAILED: {label} against {reference}: {detail}",
                                        tuple(_violation(error) for error in found[:MAX_VIOLATIONS]))


MAX_VIOLATIONS = 20
_MAX_PATH_PART = 64


def _violation(error: Any) -> str:
    path = ""
    for part in error.absolute_path:
        path += f"[{part}]" if isinstance(part, int) else ("." if path else "") + str(part)[:_MAX_PATH_PART]
    return f"{path or '$'} {error.validator}"
