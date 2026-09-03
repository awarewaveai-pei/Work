"""Test oracles that are deliberately independent of the runtime's own implementations.

An oracle that called the code under test would be a tautology. These helpers
re-derive the expected answer from the spec root by a different route.
"""

from __future__ import annotations

from pathlib import Path

import yaml


def active_contract_on_disk(contracts_dir: Path, ref: str) -> bool:
    """'This capability ref should resolve': ``<ref>.capability.yaml`` exists AND declares ``status: ACTIVE`` (a DRAFT must not).

    Independent of ``scan_contract_files``: keyed by filename (not the declared
    ``id``) and read directly, so a disagreement between the two fails loudly
    in either direction.
    """
    path = contracts_dir / f"{ref}.capability.yaml"
    if not path.is_file():
        return False
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    return isinstance(document, dict) and document.get("status") == "ACTIVE"
