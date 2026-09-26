"""Score every eval case's already-produced synthesis artifact, write eval-report.{json,md}, exit 1 on any FAIL.

Usage:
    python run.py --golden --out DIR                      # score each case's own golden-output.json
    python run.py --artifacts DIR --out DIR                # score DIR/<line>/<case_id>.json instead
    python run.py --golden --out DIR --champion REPORT.json  # also report the delta vs a prior eval-report.json

thresholds.yaml and cases/ are always resolved next to this script (not the current working directory), so a
mutation proof that copies this whole eval/ tree and edits its own thresholds.yaml or a case's fixtures runs
against exactly that copy.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml

from score import METRIC_NAMES, score

HERE = Path(__file__).resolve().parent
LINES = ("L1", "L2", "L3")

# lower_is_better metrics FAIL when value > threshold; every other metric FAILs when value < threshold.
LOWER_IS_BETTER = {"hallucination_rate", "cost_tokens", "latency_ms"}


def discover_cases() -> list[tuple[str, str, Path]]:
    """Every (line, case_id, case_dir) under cases/, sorted for a stable report order."""
    out: list[tuple[str, str, Path]] = []
    for line in LINES:
        line_dir = HERE / "cases" / line
        if not line_dir.is_dir():
            continue
        for case_dir in sorted(p for p in line_dir.iterdir() if p.is_dir()):
            out.append((line, case_dir.name, case_dir))
    return out


def load_thresholds() -> dict[str, dict[str, Any]]:
    raw = yaml.safe_load((HERE / "thresholds.yaml").read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError("thresholds.yaml: top level must be a mapping of line -> {metric: value}")
    return raw


def verdict(metric: str, value: float, threshold: Any) -> str:
    """PASS/FAIL against a set threshold; UNSET (never PASS, never FAIL) while the operator hasn't set one (I10)."""
    if threshold is None:
        return "UNSET"
    if metric in LOWER_IS_BETTER:
        return "PASS" if value <= threshold else "FAIL"
    return "PASS" if value >= threshold else "FAIL"


def load_artifact(line: str, case_id: str, case_dir: Path, artifacts_dir: Path | None) -> dict[str, Any]:
    path = (artifacts_dir / line / f"{case_id}.json") if artifacts_dir is not None else (case_dir / "golden-output.json")
    return json.loads(path.read_text(encoding="utf-8"))


def build_report(artifacts_dir: Path | None, champion: dict[str, Any] | None) -> dict[str, Any]:
    thresholds = load_thresholds()
    champion_cases = (champion or {}).get("cases", {})
    cases: dict[str, Any] = {}
    any_fail = False
    for line, case_id, case_dir in discover_cases():
        key = f"{line}/{case_id}"
        artifact = load_artifact(line, case_id, case_dir, artifacts_dir)
        metrics = score(case_dir, artifact)
        line_thresholds = thresholds.get(line, {})
        champion_metrics = champion_cases.get(key, {}).get("metrics", {})
        entry: dict[str, Any] = {}
        for metric in METRIC_NAMES:
            value = metrics[metric]
            threshold = line_thresholds.get(metric)
            v = verdict(metric, value, threshold)
            if v == "FAIL":
                any_fail = True
            champion_value = champion_metrics.get(metric, {}).get("value") if metric in champion_metrics else None
            entry[metric] = {
                "value": value,
                "threshold": threshold,
                "verdict": v,
                "champion_delta": (value - champion_value) if champion_value is not None else None,
            }
        cases[key] = {"line": line, "case_id": case_id, "metrics": entry}
    return {"cases": cases, "any_fail": any_fail}


def render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Eval report", "", "| case | metric | value | threshold | verdict | vs champion |", "|---|---|---|---|---|---|"]
    for key in sorted(report["cases"]):
        for metric in METRIC_NAMES:
            m = report["cases"][key]["metrics"][metric]
            delta = "" if m["champion_delta"] is None else f"{m['champion_delta']:+.3f}"
            threshold = "" if m["threshold"] is None else str(m["threshold"])
            lines.append(f"| {key} | {metric} | {m['value']:.3f} | {threshold} | {m['verdict']} | {delta} |")
    lines.append("")
    lines.append(f"**Result: {'FAIL' if report['any_fail'] else 'PASS (or UNSET)'}**")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--golden", action="store_true", help="score each case's own golden-output.json")
    source_group.add_argument("--artifacts", type=Path, help="score <DIR>/<line>/<case_id>.json instead")
    parser.add_argument("--out", type=Path, required=True, help="directory to write eval-report.json and eval-report.md into")
    parser.add_argument("--champion", type=Path, help="a prior eval-report.json to diff against")
    args = parser.parse_args(argv)

    champion = json.loads(args.champion.read_text(encoding="utf-8")) if args.champion else None
    report = build_report(None if args.golden else args.artifacts, champion)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "eval-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    (args.out / "eval-report.md").write_text(render_markdown(report), encoding="utf-8")
    return 1 if report["any_fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
