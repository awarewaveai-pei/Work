"""Offline promotion/rollback CLI for evolvable data (I9/C9, RESEARCH_LINES_MASTER_PLAN.md
§3.8, card WC-P2-03).

The spec root is read-only to runtime code (``COS/README.md:3``); this CLI is the one
place allowed to write inside ``evolution/<kind>/``. It never edits a version file --
versions are immutable once recorded. It only ever does two things:

* ``promote --kind K --version V --evidence FILE [--approved-by NAME]`` -- point
  ``champion.yaml`` at an already-existing ``V.yaml`` and append one LEDGER.md row.
* ``rollback --kind K [--approved-by NAME]`` -- undo the newest promotion not yet
  undone (the kind's rows replay as an undo stack) and stop at the first version; a
  rollback never re-installs the version it just left (that would be a promotion
  without evidence).

LEDGER.md is the whole history, and ``ledger_errors`` -- the one definition, run before
every write and by the tests on the real spec root -- replays it: every row starts from
the champion the rows before it left, a rollback undoes exactly the newest promotion,
the replay ends at champion.yaml's version and ``version_sha256``, and every version
file still has the bytes recorded whenever it was installed (runtime ``load_champion``
checks the same sha and fails closed).

R3/R4 kinds (``kinds.yaml``'s ``risk_tier``) refuse both operations without
``--approved-by`` (I10, P-K5) and exit 2. Every write is atomic (temp file +
``os.replace``, same pattern as ``tenant_scoped_cas.py``/``executor.py``).

Run it in a repo checkout and commit the result: the container bakes the spec root
into the image (``COS/Dockerfile`` COPY), so a write there is lost on the next deploy.
That commit is also the transaction boundary for the two files (LEDGER row first, then
champion.yaml): a run that died between them fails the replay check until both are
restored from git (``git checkout -- evolution/``) -- never repaired in place.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.errors import InvariantViolation
from ai_lego.platform.evolution.registry import known_kinds, load_version, read_champion, version_sha256

HIGH_RISK_TIERS = {"R3", "R4"}
LEDGER_HEADER = "| utc_time | kind | action | version_before | version_after | version_sha256 | evidence_sha256 | approved_by |"
LEDGER_SEPARATOR = "|---|---|---|---|---|---|---|---|"
_SHA256 = re.compile(r"[0-9a-f]{64}")


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
        # newline="\n": git stores these files LF (.gitattributes eol=lf); Windows text mode would write CRLF and a
        # sha256 taken of them (rollback evidence) could never be recomputed from the repo.
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as tmp:
            tmp.write(text)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def _parse_ledger(spec_root: Path) -> list[dict[str, str]]:
    """Every LEDGER.md row, in file order (the header and the ``|---|`` separator are not data rows).
    A row whose cell count differs from the header's raises: skipping it would silently drop history."""
    path = _ledger_path(spec_root)
    if not path.is_file():
        return []
    header: list[str] | None = None
    rows: list[dict[str, str]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
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
            raise InvariantViolation(f"EVOLUTION_LEDGER_MALFORMED: LEDGER.md line {number} has {len(cells)} cells, the header has {len(header)}")
        rows.append(dict(zip(header, cells)))
    return rows


def _parse_ledger_rows(spec_root: Path, kind: str) -> list[dict[str, str]]:
    return [row for row in _parse_ledger(spec_root) if row.get("kind") == kind]


@dataclass
class _History:
    state: str | None = None  # the champion the rows leave
    stack: list[str] = field(default_factory=list)  # what successive rollbacks restore, newest last ("-" = none)
    recorded: dict[str, str] = field(default_factory=dict)  # version -> version_sha256 recorded when installed


def _replay(kind: str, rows: list[dict[str, str]]) -> _History:
    """A kind's rows as one chain: each starts from the champion the rows before it left; a promote pushes the champion
    it replaced, a rollback pops exactly that one; a version re-installed carries the bytes recorded the first time.
    Matching rows by version name instead cycled v3 -> v2 -> v3 once a version was promoted twice."""
    history = _History()
    for row in rows:
        action, before, after, sha = row.get("action"), row.get("version_before"), row.get("version_after"), row.get("version_sha256")
        start = None if before == "-" else before
        if start != history.state:
            problem = f"starts from {before} but the rows before it left {history.state or '-'}"
        elif not after or after in ("-", start):
            problem = "does not switch to another version"
        elif not _SHA256.fullmatch(sha or ""):
            problem = "has no version_sha256"
        elif after in history.recorded and history.recorded[after] != sha:
            problem = f"re-installs {after} with bytes other than those recorded when it was first installed"
        elif action == "promote":
            history.stack.append(before)
            problem = None
        elif action == "rollback" and history.stack and history.stack[-1] == after:
            history.stack.pop()
            problem = None
        else:
            problem = "does not undo the newest promotion" if action == "rollback" else f"has unknown action {action!r}"
        if problem:
            raise InvariantViolation(f"EVOLUTION_LEDGER_MALFORMED: {kind} row {action} {before} -> {after} {problem}")
        history.recorded[after] = sha
        history.state = after
    return history


def kind_ledger_errors(spec_root: Path, kind: str) -> list[str]:
    """What must hold before this CLI writes anything for ``kind``: the replay is a valid chain, it ends where
    champion.yaml points (version and sha), and every version it installed still has its recorded bytes."""
    try:
        rows = _parse_ledger_rows(spec_root, kind)
        history = _replay(kind, rows)
        champion = read_champion(spec_root, kind)
    except InvariantViolation as error:
        return [str(error)]
    if not rows:
        return [] if champion is None else [f"EVOLUTION_LEDGER_CHAMPION_MISMATCH: {kind} has a champion.yaml that no LEDGER row installed"]
    errors: list[str] = []
    pointed = champion.get("version") if champion else None, champion.get("version_sha256") if champion else None
    if pointed != (history.state, history.recorded[history.state]):
        errors.append(
            f"EVOLUTION_LEDGER_CHAMPION_MISMATCH: {kind}'s LEDGER ends at {history.state} but champion.yaml points at "
            f"{pointed[0]} -- restore both from git (git checkout -- evolution/) and run again"
        )
    for version, recorded in sorted(history.recorded.items()):
        try:
            actual = version_sha256(spec_root, kind, version)
        except InvariantViolation as error:
            errors.append(f"EVOLUTION_VERSION_FILE_MISSING: {kind} {version} is in LEDGER.md but unreadable: {error}")
            continue
        if actual != recorded:
            errors.append(f"EVOLUTION_VERSION_CHANGED: {kind} {version}.yaml differs from the bytes LEDGER.md recorded -- versions are immutable, add a new version instead")
    return errors


def ledger_errors(spec_root: Path) -> list[str]:
    """``kind_ledger_errors`` for every listed kind, plus LEDGER rows for kinds kinds.yaml does not list."""
    try:
        kinds = known_kinds(spec_root)
        rows = _parse_ledger(spec_root)
    except InvariantViolation as error:
        return [str(error)]
    errors = [f"EVOLUTION_UNKNOWN_KIND: LEDGER.md has rows for {kind!r}" for kind in sorted({row.get("kind") for row in rows} - set(kinds))]
    for kind in kinds:
        errors += kind_ledger_errors(spec_root, kind)
    return errors


def _append_ledger_row(spec_root: Path, *, kind: str, action: str, version_before: str | None, version_after: str, version_sha: str, evidence_sha256: str, approved_by: str | None) -> int:
    """Append one row, creating LEDGER.md with its header first if this is the very
    first evolution write in a fresh spec root (e.g. a test's temp root). Returns the
    1-indexed physical line number of the row just written, for ``champion.yaml``'s
    ``ledger_line``."""
    path = _ledger_path(spec_root)
    row = f"| {_utc_now()} | {kind} | {action} | {version_before or '-'} | {version_after} | {version_sha} | {evidence_sha256} | {approved_by or '-'} |"
    if path.is_file():
        existing = path.read_text(encoding="utf-8")
        new_text = existing + ("" if existing.endswith("\n") else "\n") + row + "\n"
    else:
        new_text = "\n".join(["# Evolution ledger (I9/C9, §3.8)", "", LEDGER_HEADER, LEDGER_SEPARATOR, row, ""])
    _atomic_write_text(path, new_text)
    return len(new_text.splitlines())


def _write_champion(spec_root: Path, kind: str, version: str, *, ledger_line: int, version_sha: str) -> None:
    text = (
        f"kind: {kind}\n"
        f'version: "{version}"\n'
        f'version_sha256: "{version_sha}"\n'
        f'promoted_at: "{_utc_now()}"\n'
        f"ledger_line: {ledger_line}\n"
    )
    _atomic_write_text(_champion_path(spec_root, kind), text)


def _preconditions(spec_root: Path, kind: str, approved_by: str | None) -> str | None:
    """Returns an error message (nothing written yet) or ``None`` if the caller may proceed."""
    try:
        kinds = known_kinds(spec_root)
    except InvariantViolation as error:
        return str(error)
    if kind not in kinds:
        return f"EVOLUTION_UNKNOWN_KIND: {kind!r} is not listed in evolution/kinds.yaml"
    if approved_by is not None and (not approved_by.strip() or any(ch in approved_by for ch in "|\r\n")):
        return "EVOLUTION_APPROVER_INVALID: --approved-by must be a non-blank name without '|' or line breaks (it is a LEDGER cell)"
    risk_tier = kinds[kind]["risk_tier"]
    if risk_tier in HIGH_RISK_TIERS and not approved_by:
        return f"EVOLUTION_APPROVAL_REQUIRED: kind={kind} risk_tier={risk_tier} needs --approved-by"
    errors = kind_ledger_errors(spec_root, kind)
    return errors[0] if errors else None


def _fail(message: str) -> int:
    print(f"FAIL: {message}", file=sys.stderr)
    return 2


def promote(spec_root: Path, *, kind: str, version: str, evidence: Path, approved_by: str | None) -> int:
    error = _preconditions(spec_root, kind, approved_by)
    if error:
        return _fail(error)
    try:
        load_version(spec_root, kind, version)
        sha = version_sha256(spec_root, kind, version)
    except InvariantViolation as error:
        return _fail(str(error))
    if not evidence.is_file():
        return _fail(f"EVOLUTION_EVIDENCE_MISSING: {evidence}")

    history = _replay(kind, _parse_ledger_rows(spec_root, kind))
    before = (read_champion(spec_root, kind) or {}).get("version")
    if before == version:
        print(f"PASS: {kind} champion is already {version} (idempotent no-op, nothing written)")
        return 0
    if version in history.recorded and history.recorded[version] != sha:
        return _fail(f"EVOLUTION_VERSION_CHANGED: {kind} {version}.yaml differs from the bytes recorded when it was installed before -- add a new version instead")

    ledger_line = _append_ledger_row(spec_root, kind=kind, action="promote", version_before=before, version_after=version, version_sha=sha, evidence_sha256=_sha256_file(evidence), approved_by=approved_by)
    _write_champion(spec_root, kind, version, ledger_line=ledger_line, version_sha=sha)
    print(f"PASS: {kind} champion {before or '(none)'} -> {version}")
    return 0


def rollback(spec_root: Path, *, kind: str, approved_by: str | None) -> int:
    error = _preconditions(spec_root, kind, approved_by)
    if error:
        return _fail(error)

    history = _replay(kind, _parse_ledger_rows(spec_root, kind))
    current = history.state
    if not history.stack:
        return _fail(f"EVOLUTION_ROLLBACK_NO_HISTORY: LEDGER.md has no promotion of {kind} left to undo")
    target = history.stack[-1]
    if target == "-":
        return _fail(f"EVOLUTION_ROLLBACK_NO_PRIOR_VERSION: {kind} {current} was its first version, nothing to roll back to")
    try:
        load_version(spec_root, kind, target)
        sha = version_sha256(spec_root, kind, target)
    except InvariantViolation as error:
        return _fail(str(error))
    if target in history.recorded and history.recorded[target] != sha:
        return _fail(f"EVOLUTION_VERSION_CHANGED: {kind} {target}.yaml differs from the bytes recorded when it was installed")

    evidence_sha256 = _sha256_file(_ledger_path(spec_root))
    ledger_line = _append_ledger_row(spec_root, kind=kind, action="rollback", version_before=current, version_after=target, version_sha=sha, evidence_sha256=evidence_sha256, approved_by=approved_by)
    _write_champion(spec_root, kind, target, ledger_line=ledger_line, version_sha=sha)
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

    rollback_parser = sub.add_parser("rollback", help="Undo the kind's newest promotion that is not undone yet.")
    rollback_parser.add_argument("--kind", required=True)
    rollback_parser.add_argument("--approved-by", default=None, help="Required for R3/R4 kinds (I10).")

    args = parser.parse_args(argv)
    spec_root = resolve_spec_root(args.spec_root)

    if args.command == "promote":
        return promote(spec_root, kind=args.kind, version=args.version, evidence=args.evidence, approved_by=args.approved_by)
    return rollback(spec_root, kind=args.kind, approved_by=args.approved_by)


if __name__ == "__main__":
    raise SystemExit(main())
