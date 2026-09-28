"""Produce one synthesis artifact per eval case with a real provider -> <out>/<line>/<case_id>.json, the directory
``run.py --artifacts`` scores (plan §3.7; WC-P2-09 ③ baseline). Offline scoring stays in run.py; this is the only
step that calls a model.

Usage (the model key lives only where COS is deployed -- run it in a throwaway container of the COS image with
eval/ mounted, never inside the serving container):
    python eval/produce.py --out DIR              # needs COGNITIVE_OS_ANTHROPIC_API_KEY
    python eval/run.py --artifacts DIR --out DIR  # then score them

Each case's Sources are its fixed snapshot (the golden manifest's ids and sha256, ``run.case_snapshot``), its subject
comes from ``input.yaml`` (checked by ``synthesis.validate_subject``, P-j), and the runner is ``run_synthesis`` (P-h).
A case the runner could not finish writes no artifact (run.py reports it as that case's contract FAIL) and its error
and token count go to ``produce-summary.json`` next to the artifacts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from run import case_snapshot, discover_cases  # run.py puts the COS root on sys.path via score.py

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.modules.research.synthesis import run_synthesis, validate_subject
from ai_lego.platform.ai_gateway.provider import provider_from_env
from ai_lego.platform.catalog.display_catalog import _yaml

KIND = {"L1": "dossier_brief", "L2": "decision_evidence", "L3": "literature_matrix"}
SNAPSHOT_AT = "2026-01-01T00:00:00Z"   # one fixed time: the manifest then orders the case's sources by source_id


def case_input(line: str, case_dir: Path) -> dict[str, Any]:
    raw = _yaml(case_dir / "input.yaml") or {}
    return validate_subject(KIND[line], raw.get("subject") if isinstance(raw, dict) else None)


def case_sources(case_dir: Path) -> list[dict[str, Any]]:
    snapshot, problem = case_snapshot(case_dir)
    if problem is not None:
        raise ValueError(f"{case_dir.name}: {problem}")
    sources = []
    for source_id, sha in snapshot.items():
        row = {"source_id": source_id, "status": "active", "created_at": SNAPSHOT_AT, "content_sha256": sha,
               "title": source_id.removeprefix("src:"), "canonical_url": None, "fetched_at": None, "source_class": None}
        sources.append({"row": row, "text": (case_dir / "sources" / f"{source_id.removeprefix('src:')}.txt").read_text(encoding="utf-8")})
    return sources


def produce_all(out_dir: Path, provider: Any) -> dict[str, Any]:
    spec_root = resolve_spec_root()
    contracts = SchemaContracts(spec_root)
    summary: dict[str, Any] = {}
    for line, case_id, case_dir in discover_cases():
        key = f"{line}/{case_id}"
        try:
            result = run_synthesis(kind=KIND[line], project_id=f"eval-{case_id}", subject=case_input(line, case_dir), sources=case_sources(case_dir),
                                   provider=provider, spec_root=spec_root, schema_contracts=contracts, synthesis_id=f"SYN-EVAL-{case_id}")
        except Exception as error:   # one case's failure is that case's record, never the loss of the other eight
            summary[key] = {"error": f"{type(error).__name__}: {error}", "input_tokens": None, "output_tokens": None}
            continue
        summary[key] = {"error": result["error"], "model": result["model"], "input_tokens": result["input_tokens"], "output_tokens": result["output_tokens"]}
        if result["artifact"] is not None:
            target = out_dir / line / f"{case_id}.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(result["artifact"], ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8", newline="\n")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "produce-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8", newline="\n")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="directory to write <line>/<case_id>.json and produce-summary.json into")
    args = parser.parse_args(argv)
    provider = provider_from_env()
    if provider is None:
        print("produce.py: no provider -- COGNITIVE_OS_ANTHROPIC_API_KEY is not set here", file=sys.stderr)
        return 2
    summary = produce_all(args.out, provider)
    failed = [key for key, item in summary.items() if item["error"]]
    print(f"produced {len(summary) - len(failed)}/{len(summary)}; tokens in={sum(i['input_tokens'] or 0 for i in summary.values())} out={sum(i['output_tokens'] or 0 for i in summary.values())}; failed: {failed or 'none'}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
