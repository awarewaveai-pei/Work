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
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

from score import METRIC_NAMES, coverage_by_category, score

# score.py puts the COS root on sys.path, so ai_lego imports must come after it.
from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_citation_integrity, synthesis_reference_errors
from ai_lego.modules.research.source_manifest import manifest_errors
from ai_lego.platform.catalog.display_catalog import _yaml
from ai_lego.platform.evolution.registry import load_champion, load_version

HERE = Path(__file__).resolve().parent
LINES = ("L1", "L2", "L3")

# lower_is_better metrics FAIL when value > threshold; every other metric FAILs when value < threshold.
LOWER_IS_BETTER = {"hallucination_rate", "cost_tokens", "latency_ms"}
RATIO_METRICS = set(METRIC_NAMES) - {"cost_tokens", "latency_ms"}


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
    """Every line lists set_by and every metric (null = UNSET): a misspelled, deleted or out-of-range value would
    otherwise read as a threshold that can never FAIL (``.inf`` for a lower-is-better metric passes everything)."""
    raw = _yaml(HERE / "thresholds.yaml") or {}
    if not isinstance(raw, dict) or set(raw) != set(LINES):
        raise ValueError(f"thresholds.yaml: top level must map exactly {LINES} -> {{metric: value}}, got {sorted(raw) if isinstance(raw, dict) else type(raw).__name__}")
    for line, values in raw.items():
        keys = set(values) if isinstance(values, dict) else set()
        if keys != set(METRIC_NAMES) | {"set_by"}:
            raise ValueError(f"thresholds.yaml: {line} must list set_by and exactly {METRIC_NAMES}; missing {sorted((set(METRIC_NAMES) | {'set_by'}) - keys)}, unknown {sorted(keys - set(METRIC_NAMES) - {'set_by'})}")
        if not isinstance(values["set_by"], str) or not values["set_by"].strip():
            raise ValueError(f"thresholds.yaml: {line}.set_by must name who owns these numbers")
        for metric in METRIC_NAMES:
            value = values[metric]
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f"thresholds.yaml: {line}.{metric} must be a finite number >= 0 or null, got {value!r}")
            # A set threshold must be able to FAIL: coverage 0, trap_rejection 0 or hallucination 1 pass the worst run.
            if metric in RATIO_METRICS and not (0 <= value < 1 if metric in LOWER_IS_BETTER else 0 < value <= 1):
                bound = "0 <= t < 1" if metric in LOWER_IS_BETTER else "0 < t <= 1"
                raise ValueError(f"thresholds.yaml: {line}.{metric}={value!r} could never FAIL or is not a fraction ({bound}); use null for no threshold")
    return raw


def verdict(metric: str, value: float, threshold: Any) -> str:
    """PASS/FAIL against a set threshold; UNSET (never PASS, never FAIL) while the operator hasn't set one (I10)."""
    if threshold is None:
        return "UNSET"
    if metric in LOWER_IS_BETTER:
        return "PASS" if value <= threshold else "FAIL"
    return "PASS" if value >= threshold else "FAIL"


def load_artifact(line: str, case_id: str, case_dir: Path, artifacts_dir: Path | None) -> tuple[Any, str | None]:
    """(artifact, None), or (None, why) -- one missing or unreadable artifact is that case's contract FAIL, never an
    exception that loses every other case's report (a runner that failed twice writes no artifact, P-h)."""
    path = (artifacts_dir / line / f"{case_id}.json") if artifacts_dir is not None else (case_dir / "golden-output.json")
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except (OSError, ValueError) as error:
        return None, f"artifact {path.name} missing or not JSON: {error}"


def synthesis_prompts(spec_root: Path, artifact: Any) -> dict[str, Any]:
    """The synthesis-prompts document an artifact was produced with: its own ``prompt_version`` when it records one
    (a challenger's artifact is checked against the schema ITS prompts name), else the champion."""
    version = artifact.get("prompt_version") if isinstance(artifact, dict) else None
    if version is None:
        return load_champion(spec_root, "synthesis-prompts")[1]["prompts"]
    return load_version(spec_root, "synthesis-prompts", version)["prompts"]


def artifact_contract_errors(artifact: Any, *, contracts: SchemaContracts, spec_root: Path) -> list[str]:
    """P-c, checked before anything is scored: the synthesis is the typed object its prompts name and its internal
    references resolve, the manifest is a valid P-a/P-c manifest (``manifest_errors``) and manifest_ref is its own,
    and the citation_integrity result is the one gate's. A producer's self-report is never trusted -- a claim without
    a `citations` key would otherwise be invisible to every metric. Total: messages, never an exception."""
    if not isinstance(artifact, dict) or not isinstance(artifact.get("synthesis"), dict) or not isinstance(artifact.get("manifest"), dict):
        return ["artifact must be an object with synthesis and manifest objects (P-c)"]
    synthesis, manifest = artifact["synthesis"], artifact["manifest"]
    try:
        prompts = synthesis_prompts(spec_root, artifact)
    except InvariantViolation as error:
        return [f"prompt_version: {error}"]
    kind = synthesis.get("kind")
    prompt = prompts.get(kind) if isinstance(kind, str) else None
    if not isinstance(prompt, dict) or not prompt.get("output_schema_id"):
        return [f"synthesis.kind {kind!r} has no synthesis prompt"]
    errors = [f"schema: {problem}" for problem in contracts.errors(prompt["output_schema_id"], synthesis)]
    errors += [f"reference: {problem}" for problem in synthesis_reference_errors(synthesis)]
    manifest_problems = manifest_errors(manifest)
    if manifest_problems:
        return errors + [f"manifest: {problem}" for problem in manifest_problems]
    expected_ref = {"sha256": manifest["sha256"], "count": len(manifest["entries"]), "batches": len(manifest["batches"])}
    if synthesis.get("manifest_ref") != expected_ref:
        errors.append(f"synthesis.manifest_ref {synthesis.get('manifest_ref')} != {expected_ref}")
    gate = evaluate_citation_integrity(synthesis, [entry["id"] for entry in manifest["entries"]])
    reported = [g for g in artifact.get("gate_results") or [] if isinstance(g, dict) and g.get("gate_id") == "citation_integrity"]
    if reported != [gate]:
        errors.append(f"gate_results[citation_integrity] is not what the gate computes (gate says {gate['status']})")
    return errors


_CASE_SOURCE_ID = re.compile(r"src:[A-Za-z0-9_-]+")


def case_snapshot(case_dir: Path) -> tuple[dict[str, str], str | None]:
    """The case's fixed source snapshot (§3.7): source_id -> sha256 as recorded in its committed golden-output.json
    manifest -- never the working tree's file listing, which an extra or edited file would silently change."""
    artifact, problem = load_artifact("", "", case_dir, None)
    if problem is not None:
        return {}, f"snapshot: {problem}"
    entries = ((artifact or {}).get("manifest") or {}).get("entries") if isinstance(artifact, dict) else None
    if not isinstance(entries, list) or not all(isinstance(entry, dict) and isinstance(entry.get("source_id"), str) for entry in entries):
        return {}, "snapshot: the golden manifest has no source list"
    return {entry["source_id"]: entry.get("sha256") for entry in entries}, None


def snapshot_errors(case_dir: Path, artifact: dict[str, Any], snapshot: dict[str, str]) -> list[str]:
    """Every manifest entry is one of the case's snapshot sources with the snapshot's sha256 (P-K6 ``src:<stem>``),
    and every snapshot source whose file exists still has that sha256 -- an edited or invented source must not score
    an artifact. A deleted file is not an error here: the harness's own delete-a-source mutation relies on it, and
    ``citation_coverage`` is what measures it."""
    errors = []
    for entry in artifact["manifest"]["entries"]:
        source_id = entry["source_id"]
        if not _CASE_SOURCE_ID.fullmatch(source_id) or source_id not in snapshot:
            errors.append(f"snapshot: manifest entry {entry['id']!r} is not one of this case's sources")
        elif entry["sha256"] != snapshot[source_id]:
            errors.append(f"snapshot: {source_id} has sha256 {entry['sha256'][:12]}..., the case snapshot {str(snapshot[source_id])[:12]}...")
    for source_id, sha in snapshot.items():
        if not _CASE_SOURCE_ID.fullmatch(source_id):
            errors.append(f"snapshot: case source id {source_id!r} is not src:<file stem>")
            continue
        path = case_dir / "sources" / f"{source_id.removeprefix('src:')}.txt"
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            errors.append(f"snapshot: {path.name} changed since the case snapshot was recorded (sha256 differs)")
    return errors


def build_report(artifacts_dir: Path | None, champion: dict[str, Any] | None) -> dict[str, Any]:
    thresholds = load_thresholds()
    spec_root = resolve_spec_root()
    contracts = SchemaContracts(spec_root)
    champion_cases = (champion or {}).get("cases", {})
    cases: dict[str, Any] = {}
    any_fail = False
    for line, case_id, case_dir in discover_cases():
        key = f"{line}/{case_id}"
        artifact, problem = load_artifact(line, case_id, case_dir, artifacts_dir)
        snapshot, snapshot_problem = case_snapshot(case_dir)
        problems = [problem] if problem else artifact_contract_errors(artifact, contracts=contracts, spec_root=spec_root)
        if not problems:
            problems = [snapshot_problem] if snapshot_problem else snapshot_errors(case_dir, artifact, snapshot)
        if problems:
            any_fail = True
            cases[key] = {"line": line, "case_id": case_id, "contract": {"verdict": "FAIL", "errors": problems}, "metrics": {}}
            continue
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
        cases[key] = {"line": line, "case_id": case_id, "contract": {"verdict": "PASS", "errors": []}, "metrics": entry,
                      "coverage_by_category": coverage_by_category(case_dir, artifact)}   # reported, never thresholded (P-f)
    return {"cases": cases, "any_fail": any_fail}


def render_markdown(report: dict[str, Any]) -> str:
    lines = ["# Eval report", "", "| case | metric | value | threshold | verdict | vs champion |", "|---|---|---|---|---|---|"]
    for key in sorted(report["cases"]):
        contract = report["cases"][key]["contract"]
        if contract["verdict"] == "FAIL":
            lines.append(f"| {key} | contract (P-c) | | | FAIL | {'; '.join(contract['errors'])[:300].replace('|', '/')} |")
            continue
        for metric in METRIC_NAMES:
            m = report["cases"][key]["metrics"][metric]
            delta = "" if m["champion_delta"] is None else f"{m['champion_delta']:+.3f}"
            threshold = "" if m["threshold"] is None else str(m["threshold"])
            lines.append(f"| {key} | {metric} | {m['value']:.3f} | {threshold} | {m['verdict']} | {delta} |")
        by_category = report["cases"][key].get("coverage_by_category", {})
        lines.append(f"| {key} | coverage by category | {', '.join(f'{c}={v:.2f}' if v is not None else f'{c}=—' for c, v in by_category.items())} | | | |")
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
    (args.out / "eval-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8", newline="\n")
    (args.out / "eval-report.md").write_text(render_markdown(report), encoding="utf-8", newline="\n")
    return 1 if report["any_fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
