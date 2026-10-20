"""Run the MP section 70 eval for the coding stages against a real local model, optionally with a challenger.

    python -m ai_lego.apps.cli.run_coding_eval --model gemma3:4b --repeats 3 --out %TEMP%\\ai-lego-coding-eval
    python -m ai_lego.apps.cli.run_coding_eval --model gemma3:4b --challenger-model <other pulled model>
    python -m ai_lego.apps.cli.run_coding_eval --dataset-only --out %TEMP%\\ai-lego-coding-eval   (no model call)

Exit codes: 0 = EvalRun PASS (and, with a challenger, no REJECT); 1 = FAIL / REJECT / error; 2 = Ollama or the model
is not available (a visible UNAVAILABLE, never a silent skip). Writes ``dataset.json``, ``eval_run.<model>.json`` and,
with a challenger, ``comparison.json`` into ``--out``. A PASS is a pass of the dataset's assertions; the record's
``dataset_snapshot.maturity`` says whether the golden set has reached the 30-case minimum (since round 11 it has,
with ``anchor_origin: SYNTHETIC_AUTHOR_LABELLED`` -- the count rule is met, human calibration is not).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from ai_lego.core.support import write_json
from ai_lego.errors import AdapterUnavailable, InvariantViolation
from ai_lego.modules.research.ai_coding import DEFAULT_LOCAL_MODEL_PROFILE, default_local_registry
from ai_lego.modules.research.coding_eval import DATASETS, STAGES, build_dataset, compare, format_scorecard, run_eval
from ai_lego.platform.ai_execution.gateway import AIGateway, ollama_available


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)


def _run_one(model: str, dataset: dict, repeats: int, datasets: tuple[str, ...], stages: tuple[str, ...], out: Path) -> dict:
    registry = default_local_registry(model)
    gateway = AIGateway(registry, grant=None)   # loopback Ollama only: bills no one
    print(f"== eval {model} ({len([c for c in dataset['cases'] if c['dataset'] in datasets and c['stage'] in stages])} cases x {repeats} repeats) ==", file=sys.stderr)
    record = run_eval(gateway, DEFAULT_LOCAL_MODEL_PROFILE, registry[DEFAULT_LOCAL_MODEL_PROFILE], dataset=dataset, repeats=repeats, datasets=datasets, stages=stages, progress=lambda line: print(line, file=sys.stderr))
    write_json(out / f"eval_run.{_safe(model)}.json", record)
    print(format_scorecard(record))
    return record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="gemma3:4b", help="champion: Ollama model identifier (must already be pulled)")
    parser.add_argument("--challenger-model", default=None, help="optional challenger Ollama model identifier; compared on the same dataset hash")
    parser.add_argument("--repeats", type=int, default=3, help="how many times each case is run (consistency needs >= 2)")
    parser.add_argument("--datasets", default=",".join(DATASETS), help=f"comma-separated subset of {DATASETS}")
    parser.add_argument("--stages", default=",".join(STAGES), help=f"comma-separated subset of {STAGES}")
    parser.add_argument("--out", type=Path, default=Path(os.environ.get("TEMP", tempfile.gettempdir())) / "ai-lego-coding-eval", help="output directory")
    parser.add_argument("--dataset-only", action="store_true", help="write dataset.json and exit without calling any model")
    args = parser.parse_args(argv)
    datasets = tuple(d for d in args.datasets.split(",") if d)
    stages = tuple(s for s in args.stages.split(",") if s)
    try:
        dataset = build_dataset()
        write_json(args.out / "dataset.json", dataset)
        print(f"dataset {dataset['dataset_id']} v{dataset['version']} hash={dataset['hash'][:12]} cases={len(dataset['cases'])} by_dataset={json.dumps(dataset['maturity']['by_dataset'])} established={dataset['maturity']['established']}")
        if args.dataset_only:
            print(f"Results: {args.out}")
            return 0
        available, reason = ollama_available()
        if not available:
            raise AdapterUnavailable(f"OLLAMA_UNAVAILABLE: {reason}")
        champion = _run_one(args.model, dataset, args.repeats, datasets, stages, args.out)
        exit_code = 0 if champion["result"]["status"] == "PASS" else 1
        if args.challenger_model:
            challenger = _run_one(args.challenger_model, dataset, args.repeats, datasets, stages, args.out)
            comparison = compare(champion, challenger)
            write_json(args.out / "comparison.json", comparison)
            print(f"comparison {comparison['comparison_id']}: verdict={comparison['verdict']} reasons={comparison['reject_reasons']}")
            for name, entry in comparison["deltas"].items():
                print(f"  {name:<30} champion={entry['champion']} challenger={entry['challenger']} delta={entry['delta']}")
            print(f"  sample: {comparison['sample']['observations_per_arm']} observations/arm vs {comparison['sample']['required_per_arm_standard_rigour']} required -- {comparison['sample']['reason']}")
            if comparison["verdict"] == "REJECT":
                exit_code = 1
    except AdapterUnavailable as error:
        print(f"UNAVAILABLE: {error}", file=sys.stderr)
        return 2
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"Results: {args.out}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
