"""Mutation proof for the eval harness itself (plan §3.7 "mutation proof" row).

Each mutation must turn a temp copy's ``run.py --golden`` exit code from 0 to 1. Both mutations operate on a
throwaway ``shutil.copytree`` of this ``eval/`` directory whose ``thresholds.yaml`` gets real numbers filled
in for exactly the metric under test -- this repo's own ``eval/thresholds.yaml`` stays null forever (operator-
owned, I10) and is never written to by this script.

    1. delete_expected_source   -- remove the sources/*.txt file backing L1/l1-founder-bio's first finding.
                                    citation_coverage can no longer verify that citation -> coverage drops.
    2. inject_out_of_manifest   -- append a citation id absent from the manifest to the same case's summary.
                                    hallucination_rate rises above its (zero) baseline.

Run directly: ``python mutate.py`` -- prints one PASS/FAIL line per mutation and exits 1 if either failed to
turn the run red.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score import score  # noqa: E402

HERE = Path(__file__).resolve().parent
TARGET_LINE = "L1"
TARGET_CASE = "l1-founder-bio"


def _write_threshold(tmp_root: Path, line: str, metric: str, value: float) -> None:
    path = tmp_root / "thresholds.yaml"
    thresholds = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    thresholds.setdefault(line, {})[metric] = value
    path.write_text(yaml.safe_dump(thresholds, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _run_golden(tmp_root: Path, out_dir: Path) -> int:
    result = subprocess.run(
        [sys.executable, str(tmp_root / "run.py"), "--golden", "--out", str(out_dir)],
        capture_output=True,
        text=True,
    )
    return result.returncode


def mutation_delete_expected_source(tmp_root: Path) -> None:
    case_dir = tmp_root / "cases" / TARGET_LINE / TARGET_CASE
    expected = yaml.safe_load((case_dir / "expected.yaml").read_text(encoding="utf-8"))
    source_id = expected["findings"][0]["sources"][0]  # "source:src:<stem>"
    stem = source_id.split(":", 2)[2]
    (case_dir / "sources" / f"{stem}.txt").unlink()


def mutation_inject_out_of_manifest(tmp_root: Path) -> None:
    case_dir = tmp_root / "cases" / TARGET_LINE / TARGET_CASE
    artifact_path = case_dir / "golden-output.json"
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    artifact["synthesis"]["summary"]["citations"].append("source:src:not-in-manifest")
    artifact_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")


MUTATIONS = (
    ("delete_expected_source", mutation_delete_expected_source, "citation_coverage"),
    ("inject_out_of_manifest", mutation_inject_out_of_manifest, "hallucination_rate"),
)


def run_mutation(name: str, mutate_fn, metric: str) -> bool:
    """Apply one mutation to a fresh temp copy, pin the threshold at the pre-mutation baseline, expect exit 1."""
    case_dir = HERE / "cases" / TARGET_LINE / TARGET_CASE
    baseline_artifact = json.loads((case_dir / "golden-output.json").read_text(encoding="utf-8"))
    baseline = score(case_dir, baseline_artifact)[metric]
    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp) / "eval"
        shutil.copytree(HERE, tmp_root)
        mutate_fn(tmp_root)
        _write_threshold(tmp_root, TARGET_LINE, metric, baseline)
        code = _run_golden(tmp_root, Path(tmp) / "out")
    ok = code == 1
    print(f"{'PASS' if ok else 'FAIL'}: {name} (metric={metric}, baseline={baseline}) -> run.py exit={code}")
    return ok


def main() -> int:
    results = [run_mutation(name, fn, metric) for name, fn, metric in MUTATIONS]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
