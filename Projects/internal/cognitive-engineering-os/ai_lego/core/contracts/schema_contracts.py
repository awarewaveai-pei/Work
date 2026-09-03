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

import yaml
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
            schema = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
            if isinstance(schema, dict) and schema.get("$id"):
                resources.append((schema["$id"], Resource.from_contents(schema)))
        if not resources:
            raise InvariantViolation(f"SPEC_ROOT_EMPTY: no $id-bearing schema under {specs_dir}")
        self.spec_root = spec_root
        self.registry = Registry().with_resources(resources)
        self.schema_count = len(resources)

    def errors(self, reference: str, instance: Any) -> list[str]:
        validator = Draft202012Validator({"$ref": reference}, registry=self.registry)
        found = sorted(validator.iter_errors(instance), key=lambda error: list(error.absolute_path))
        return [f"{list(error.absolute_path)}: {error.message}" for error in found]

    def validate(self, reference: str, instance: Any, label: str) -> None:
        problems = self.errors(reference, instance)
        if problems:
            detail = "; ".join(problems[:4])
            raise SchemaValidationError(f"SCHEMA_VALIDATION_FAILED: {label} against {reference}: {detail}")
