"""Guard for the runtime output directory: never the spec root, never an ancestor of either protected root,
and never a pre-existing directory this runtime did not itself create.

A directory is "owned" once this module has written its marker file into it.
An existing, unmarked, non-empty directory is refused rather than wiped --
closing the "any pre-existing folder the caller points at gets rmtree'd"
class of defect.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from ai_lego.errors import InvariantViolation

MARKER_NAME = ".ai-lego-runtime-marker"


def _is_disjoint(a: Path, b: Path) -> bool:
    return a != b and a not in b.parents and b not in a.parents


def guard_runtime_dir(runtime: Path, spec_root: Path, repo_root: Path, allowed_repo_location: Path) -> None:
    if not _is_disjoint(runtime, spec_root):
        raise InvariantViolation(f"RUNTIME_DIR_INSIDE_SPEC_ROOT: {runtime}")
    if runtime == allowed_repo_location or allowed_repo_location in runtime.parents:
        return
    if not _is_disjoint(runtime, repo_root):
        raise InvariantViolation(f"RUNTIME_DIR_INSIDE_REPO: {runtime} (use a temp dir or {allowed_repo_location})")


def prepare_runtime_dir(runtime: Path, reset: bool) -> None:
    """Create or reuse ``runtime``, refusing to touch a pre-existing directory this module did not mark."""
    marker = runtime / MARKER_NAME
    if runtime.exists():
        owned = marker.is_file()
        if reset:
            if not owned and any(runtime.iterdir()):
                raise InvariantViolation(f"RUNTIME_DIR_NOT_OWNED: {runtime} exists, is non-empty, and carries no {MARKER_NAME} -- refusing to delete a directory this runtime did not create")
            shutil.rmtree(runtime)
        elif not owned and any(runtime.iterdir()):
            raise InvariantViolation(f"RUNTIME_DIR_NOT_OWNED: {runtime} exists, is non-empty, and carries no {MARKER_NAME} -- refusing to write into a foreign directory (pass --reset only for a directory you intend this runtime to own)")
    runtime.mkdir(parents=True, exist_ok=True)
    marker.write_text("This directory is owned by ai_lego.apps.cli.run_research_slice; safe to delete as a whole.\n", encoding="utf-8")
