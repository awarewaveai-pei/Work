"""Execution Manifest (EC §64; ``specs/execution/manifest.schema.yaml``).

Pins the four required canonical documents by content hash (identity is
Document ID + Version + Hash, never a filename), records the real git commit
of the product root, the effective ``ai.prompt_version`` after any rollback,
and one ``method_execution_log`` entry per method invocation.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from ai_lego.core.support import sha256_bytes

REQUIRED_DOCUMENTS = (
    ("ai-lego.master-plan", "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"),
    ("ai-lego.method-atlas", "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"),
    ("ai-lego.execution-contract", "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"),
    ("ai-lego.architecture-constitution", "Architecture-Constitution-v1.md"),
)


def manifest_documents(spec_root: Path) -> list[dict[str, Any]]:
    return [
        {"document_id": document_id, "file": filename, "version": "1.0.0", "sha256": sha256_bytes((spec_root / filename).read_bytes()), "loaded": True}
        for document_id, filename in REQUIRED_DOCUMENTS
    ]


def _git(args: list[str], cwd: Path) -> str | None:
    executable = shutil.which("git")
    if executable is None:
        return None
    try:
        completed = subprocess.run([executable, *args], cwd=str(cwd), capture_output=True, text=True, check=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout.strip()


def describe_git_source(product_root: Path) -> dict[str, Any]:
    commit = _git(["rev-parse", "HEAD"], product_root)
    if commit is None:
        return {"repository": str(product_root), "commit": "GIT_UNAVAILABLE", "dirty_state": True}
    status = _git(["status", "--porcelain", "--", "."], product_root)
    return {"repository": str(product_root), "commit": commit, "dirty_state": bool(status)}


def build_manifest(
    *,
    execution_id: str,
    task_id: str,
    run_id: str,
    actor: str,
    started_at: str,
    finished_at: str,
    environment: str,
    app_version: str,
    source: dict[str, Any],
    documents: list[dict[str, Any]],
    results: dict[str, Any],
    prompt_version: str,
    method_execution_log: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "execution": {
            "execution_id": execution_id,
            "task_id": task_id,
            "run_id": run_id,
            "actor": actor,
            "started_at": started_at,
            "finished_at": finished_at,
            "environment": environment,
            "app_version": app_version,
        },
        "source": source,
        "documents": documents,
        "ai": {"prompt_version": prompt_version},
        "method_execution_log": method_execution_log,
        "results": results,
    }
