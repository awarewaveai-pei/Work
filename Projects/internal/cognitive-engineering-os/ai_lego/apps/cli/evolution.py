"""Offline promotion/rollback CLI for evolvable data (I9/C9, RESEARCH_LINES_MASTER_PLAN.md
§3.8, card WC-P2-03).

The spec root is read-only to runtime code (``COS/README.md:3``); this CLI is the one
place allowed to write inside ``evolution/<kind>/``. It never edits a version file's own
content -- versions are immutable once they exist. It only ever does two things:

* ``promote --kind K --version V --evidence FILE [--approved-by NAME]`` -- point
  ``champion.yaml`` at an already-existing ``V.yaml`` and append one LEDGER.md row.
* ``rollback --kind K [--approved-by NAME]`` -- read LEDGER.md for ``K``'s last
  promotion/rollback row and point ``champion.yaml`` back at that row's
  ``version_before`` (never a hardcoded version -- that is the whole point of reading
  the ledger instead of guessing).

R3/R4 kinds (``kinds.yaml``'s ``risk_tier``) refuse both operations without
``--approved-by`` (I10, P-K5) and exit 2. Every successful write is atomic
(temp file + ``os.replace``, same pattern as ``tenant_scoped_cas.py``/``executor.py``):
a crash mid-write leaves the previous ``champion.yaml`` untouched and no stray temp
file behind, never a half-written file.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.platform.catalog.display_catalog import _yaml
from ai_lego.platform.evolution.registry import known_kinds

HIGH_RISK_TIERS = {"R3", "R4"}
LEDGER_HEADER = "| utc_time | kind | action | version_before | version_after | evidence_sha256 | approved_by |"
LEDGER_SEPARATOR = "|---|---|---|---|---|---|---|"


def _kind_dir(spec_root: Path, kind: str) -> Path:
    return spec_root / "evolution" / kind


def _champion_path(spec_root: Path, kind: str) -> Path:
    return _kind_dir(spec_root, kind) / "champion.yaml"


def _ledger_path(spec_root: Path) -> Path:
    return spec_root / "evolution" / "LEDGER.md"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atomic_write_text(path: Path, text: str) -> None:
    """Write ``text`` to ``path`` so a reader never observes a partial file: build the
    full content in a sibling temp file, fsync it, then ``os.replace`` it into place.
    On any failure before the replace, the temp file is removed and ``path`` is left
    exactly as it was."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp:
            tmp.write(text)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _current_champion_version(spec_root: Path, kind: str) -> str | None:
    path = _champion_path(spec_root, kind)
    if not path.is_file():
        return None
    doc = _yaml(path)
    version = doc.get("version") if isinstance(doc, dict) else None
    return version if isinstance(version, str) and version else None


def _parse_ledger_rows(spec_root: Path, kind: str) -> list[dict[str, str]]:
    """Every LEDGER.md row for ``kind``, in file order. Tolerant of the header and the
    ``|---|`` separator row (neither is a data row); a line whose cell count does not
    match the header's is skipped rather than crashing the CLI on a hand-edited file."""
    path = _ledger_path(spec_root)
    if not path.is_file():
        return []
    header: list[str] | None = None
    rows: list[dict[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if all(set(c) <= {"-"} and c for c in cells):
            continue  # markdown header/body separator row
        if len(cells) != len(header):
            continue
        row = dict(zip(header, cells))
        if row.get("kind") == kind:
            rows.append(row)
    return rows


def _append_ledger_row(spec_root: Path, *, kind: str, action: str, version_before: str | None, version_after: str, evidence_sha256: str, approved_by: str | None) -> int:
    """Append one row, creating LEDGER.md with its header first if this is the very
    first evolution write in a fresh spec root (e.g. a test's temp root). Returns the
    1-indexed physical line number of the row just written, for ``champion.yaml``'s
    ``ledger_line``."""
    path = _ledger_path(spec_root)
    row = f"| {_utc_now()} | {kind} | {action} | {version_before or '-'} | {version_after} | {evidence_sha256} | {approved_by or '-'} |"
    if path.is_file():
        existing = path.read_text(encoding="utf-8")
        new_text = existing + ("" if existing.endswith("\n") else "\n") + row + "\n"
    else:
        new_text = "\n".join(["# Evolution ledger (I9/C9, §3.8)", "", LEDGER_HEADER, LEDGER_SEPARATOR, row, ""])
    _atomic_write_text(path, new_text)
    return len(new_text.splitlines())


def _write_champion(spec_root: Path, kind: str, version: str, *, ledger_line: int) -> None:
    text = (
        f"kind: {kind}\n"
        f'version: "{version}"\n'
        f'promoted_at: "{_utc_now()}"\n'
        f"ledger_line: {ledger_line}\n"
    )
    _atomic_write_text(_champion_path(spec_root, kind), text)


def _check_kind_and_approval(spec_root: Path, kind: str, approved_by: str | None) -> str | None:
    """Returns an error message (nothing written yet) or ``None`` if the caller may proceed."""
    kinds = known_kinds(spec_root)
    if kind not in kinds:
        return f"EVOLUTION_UNKNOWN_KIND: {kind!r} is not listed in evolution/kinds.yaml"
    risk_tier = kinds[kind].get("risk_tier")
    if risk_tier in HIGH_RISK_TIERS and not approved_by:
        return f"EVOLUTION_APPROVAL_REQUIRED: kind={kind} risk_tier={risk_tier} needs --approved-by"
    return None


def promote(spec_root: Path, *, kind: str, version: str, evidence: Path, approved_by: str | None) -> int:
    error = _check_kind_and_approval(spec_root, kind, approved_by)
    if error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 2
    version_path = _kind_dir(spec_root, kind) / f"{version}.yaml"
    if not version_path.is_file():
        print(f"FAIL: EVOLUTION_VERSION_FILE_MISSING: {version_path}", file=sys.stderr)
        return 2
    if not evidence.is_file():
        print(f"FAIL: EVOLUTION_EVIDENCE_MISSING: {evidence}", file=sys.stderr)
        return 2

    before = _current_champion_version(spec_root, kind)
    if before == version:
        print(f"PASS: {kind} champion is already {version} (idempotent no-op, nothing written)")
        return 0

    evidence_sha256 = _sha256_file(evidence)
    ledger_line = _append_ledger_row(spec_root, kind=kind, action="promote", version_before=before, version_after=version, evidence_sha256=evidence_sha256, approved_by=approved_by)
    _write_champion(spec_root, kind, version, ledger_line=ledger_line)
    print(f"PASS: {kind} champion {before or '(none)'} -> {version}")
    return 0


def rollback(spec_root: Path, *, kind: str, approved_by: str | None) -> int:
    error = _check_kind_and_approval(spec_root, kind, approved_by)
    if error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 2

    rows = _parse_ledger_rows(spec_root, kind)
    if not rows:
        print(f"FAIL: EVOLUTION_ROLLBACK_NO_HISTORY: LEDGER.md has no promote/rollback row for {kind}", file=sys.stderr)
        return 2
    target = rows[-1].get("version_before")
    if not target or target == "-":
        print(f"FAIL: EVOLUTION_ROLLBACK_NO_PRIOR_VERSION: {kind}'s last LEDGER row has no earlier version to roll back to", file=sys.stderr)
        return 2
    target_path = _kind_dir(spec_root, kind) / f"{target}.yaml"
    if not target_path.is_file():
        print(f"FAIL: EVOLUTION_VERSION_FILE_MISSING: {target_path} (LEDGER names it but the file is gone)", file=sys.stderr)
        return 2

    current = _current_champion_version(spec_root, kind)
    evidence_sha256 = _sha256_file(_ledger_path(spec_root))
    ledger_line = _append_ledger_row(spec_root, kind=kind, action="rollback", version_before=current, version_after=target, evidence_sha256=evidence_sha256, approved_by=approved_by)
    _write_champion(spec_root, kind, target, ledger_line=ledger_line)
    print(f"PASS: {kind} champion {current or '(none)'} -> {target} (rollback)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None, help="Defaults to the repo's real spec root (AI_LEGO_SPEC_ROOT env or the built-in default). Tests must pass a temporary directory here -- never the real spec root.")
    sub = parser.add_subparsers(dest="command", required=True)

    promote_parser = sub.add_parser("promote", help="Point a kind's champion at an already-existing version file.")
    promote_parser.add_argument("--kind", required=True)
    promote_parser.add_argument("--version", required=True)
    promote_parser.add_argument("--evidence", required=True, type=Path, help="File whose sha256 is recorded in LEDGER.md as this promotion's evidence.")
    promote_parser.add_argument("--approved-by", default=None, help="Required for R3/R4 kinds (I10).")

    rollback_parser = sub.add_parser("rollback", help="Point a kind's champion back at the version before its last LEDGER row.")
    rollback_parser.add_argument("--kind", required=True)
    rollback_parser.add_argument("--approved-by", default=None, help="Required for R3/R4 kinds (I10).")

    args = parser.parse_args(argv)
    spec_root = resolve_spec_root(args.spec_root)

    if args.command == "promote":
        return promote(spec_root, kind=args.kind, version=args.version, evidence=args.evidence, approved_by=args.approved_by)
    return rollback(spec_root, kind=args.kind, approved_by=args.approved_by)


if __name__ == "__main__":
    raise SystemExit(main())
