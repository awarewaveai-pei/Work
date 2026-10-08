"""Import operator-exported facilitator rows into draft YAML scripts.

The column names are supplied by ``--map`` because the export header is an
operator choice.  This command only reads a local CSV and never invents a
missing stop signal.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

import yaml

from ai_lego.platform.scripts import load_donts, validate_script


_SPLIT_SIGNALS = re.compile(r"[\r\n;；]+")


def _mapped_column(mapping: dict[str, str], key: str, fieldnames: list[str], *, fallback: str | None = None) -> str:
    column = mapping.get(key, fallback)
    if not isinstance(column, str) or not column:
        raise ValueError(f"--map needs a non-empty {key!r} column name")
    if column not in fieldnames:
        raise ValueError(f"CSV has no mapped column {column!r} for {key!r}")
    return column


def _split_signals(value: str) -> list[str]:
    return [part.strip() for part in _SPLIT_SIGNALS.split(value.strip()) if part.strip()]


def _minutes(value: str | None) -> int:
    if value is None or not value.strip():
        return 5
    try:
        minutes = int(value.strip())
    except ValueError as exc:
        raise ValueError(f"minutes must be a positive integer: {value!r}") from exc
    if minutes < 1:
        raise ValueError(f"minutes must be a positive integer: {value!r}")
    return minutes


def _document(row: dict[str, str], columns: dict[str, str], donts: list[str]) -> tuple[str, dict[str, Any], bool]:
    # a row that ends early gives None for its missing cells: an invalid row, never a crash (Codex card 60 review F2)
    missing = sorted(key for key, column in columns.items() if key != "minutes" and row.get(column) is None)
    if missing:
        raise ValueError(f"row has no cell for {missing}")
    script_id = row[columns["id"]].strip()
    subject = row[columns["subject"]].strip()
    prompt = row[columns["prompt"]].strip()
    if not script_id or not subject or not prompt:
        raise ValueError("id, subject and prompt must be non-empty")
    stop_signals = _split_signals(row[columns["stop_signals"]])
    minutes = _minutes(row.get(columns["minutes"]) if "minutes" in columns else None)
    document = {
        "id": script_id,
        "subject": subject,
        "version": 1,
        "state": "draft",
        "steps": [{
            "what": prompt,
            "minutes": minutes,
            "dont": donts,
            "stop_signals": stop_signals,
        }],
        "escalation": {
            "who": "GOVERN",
            "how": "交給 GOVERN，依參與者所在地提供求助資源與申訴管道。",
        },
    }
    validate_script(document, f"import:{script_id}.yaml", donts)
    return script_id, document, not stop_signals


def _write_yaml(path: Path, document: dict[str, Any]) -> None:
    payload = yaml.safe_dump(document, allow_unicode=True, sort_keys=False, default_flow_style=False, width=120)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(payload)


def import_scripts(csv_path: Path | str, output_dir: Path | str | None, mapping: dict[str, str]) -> list[str]:
    """Write deterministic draft files and return a deterministic operator report."""
    source = Path(csv_path)
    # Imports land outside the reviewed set: a new file in platform/scripts/scripts changes the FACILITATE ruleset
    # without a version, and the loader then refuses every script (Codex card 60 review F1). A maintainer moves a
    # reviewed draft in by hand with a version bump.
    managed = (Path(__file__).resolve().parents[2] / "platform" / "scripts" / "scripts").resolve()
    if output_dir is None:
        raise ValueError("--output-dir is required: imported drafts never go into the reviewed scripts folder")
    target = Path(output_dir)
    if target.resolve() == managed:
        raise ValueError("--output-dir must not be the reviewed scripts folder: move a draft in by hand with a version bump")
    donts = load_donts()
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = list(reader.fieldnames or [])
        id_column = _mapped_column(mapping, "id", fieldnames)
        subject_column = _mapped_column(mapping, "subject", fieldnames, fallback=id_column)
        prompt_column = _mapped_column(mapping, "prompt", fieldnames)
        stop_column = _mapped_column(mapping, "stop_signals", fieldnames)
        columns = {"id": id_column, "subject": subject_column, "prompt": prompt_column, "stop_signals": stop_column}
        if "minutes" in mapping:
            columns["minutes"] = _mapped_column(mapping, "minutes", fieldnames)
        rows = list(reader)

    # Every row is checked before any file is written: one bad row must not leave a half-imported folder.
    documents = [_document(row, columns, donts) for row in sorted(rows, key=lambda item: (item[id_column].strip(), item[subject_column].strip()))]
    ids = [script_id for script_id, _, _ in documents]
    duplicates = sorted({script_id for script_id in ids if ids.count(script_id) > 1})
    if duplicates:
        raise ValueError(f"CSV repeats script ids: {duplicates}")
    target.mkdir(parents=True, exist_ok=True)
    reports: list[str] = []
    for script_id, document, empty_stops in documents:
        path = target / f"{script_id}.yaml"
        if path.exists():
            reports.append(f"SKIP {script_id}: already exists")
        else:
            _write_yaml(path, document)
            reports.append(f"CREATED {path.name}: draft")
        if empty_stops:
            reports.append(f"EMPTY_STOP_SIGNALS {script_id}: no stop signal was filled")
    return reports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="匯入本機 CSV 的帶領稿草稿")
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--map", required=True, help="JSON object: id, subject, prompt, stop_signals; minutes is optional")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        mapping = json.loads(args.map)
    except json.JSONDecodeError as exc:
        parser.error(f"--map must be JSON: {exc}")
    if not isinstance(mapping, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in mapping.items()):
        parser.error("--map must be a JSON object whose values are column names")
    for line in import_scripts(args.csv, args.output_dir, mapping):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
