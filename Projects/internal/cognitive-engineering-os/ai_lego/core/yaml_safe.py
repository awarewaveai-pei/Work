"""PyYAML's safe loader -- the C one (libyaml) where the build has it, the Python one otherwise. Same documents, same
errors (yaml.YAMLError): only speed differs, 10x on the SPEC registries (4.5 s -> 0.4 s for the 841 YAML files; the
capacity rig, 2026-10-12: a cold API worker spent ~25 s parsing them at start). Every YAML read in ai_lego goes through here,
so the loader is chosen in one place."""

from __future__ import annotations

from typing import Any

import yaml

SafeLoader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def safe_load(stream: Any) -> Any:
    return yaml.load(stream, Loader=SafeLoader)
