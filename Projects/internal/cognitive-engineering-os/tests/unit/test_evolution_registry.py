"""ai_lego.platform.evolution.registry (load_champion, P-g) and ai_lego.apps.cli.evolution
(promote/rollback, WC-P2-03). Every test builds its own throwaway spec root under a
TemporaryDirectory -- none of them may write the real spec root (agency-os/docs/
AI_LEGO_Cognitive_Engineering_OS/evolution/), per the card's own instruction."""

from __future__ import annotations

import ast
import contextlib
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml

import ai_lego
from ai_lego import resolve_spec_root
from ai_lego.apps.cli import evolution as cli
from ai_lego.errors import InvariantViolation
from ai_lego.platform.evolution import registry
from ai_lego.platform.evolution.registry import known_kinds, list_versions, load_champion


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _seed(root: Path, kind: str, version: str = "v1") -> None:
    """What the real spec root holds for a kind's first version: one LEDGER row and a champion.yaml recording it."""
    sha = _sha(root / "evolution" / kind / f"{version}.yaml")
    ledger = root / "evolution" / "LEDGER.md"
    existing = ledger.read_text(encoding="utf-8") if ledger.is_file() else f"{cli.LEDGER_HEADER}\n{cli.LEDGER_SEPARATOR}\n"
    _write(ledger, existing + f"| 2026-09-26T00:00:00Z | {kind} | promote | - | {version} | {sha} | - | - |\n")
    _write(root / "evolution" / kind / "champion.yaml", f'kind: {kind}\nversion: "{version}"\nversion_sha256: "{sha}"\nledger_line: 0\n')


class _CapturedCliOutput(unittest.TestCase):
    """The CLI prints PASS/FAIL lines; keep them off the runner's stdout (a buffered pipe prints them after
    unittest's own summary, so `... -q 2>&1 | tail -1` stops reading OK) and let tests assert on them."""

    def setUp(self):
        self.stdout = self.enterContext(contextlib.redirect_stdout(io.StringIO()))
        self.stderr = self.enterContext(contextlib.redirect_stderr(io.StringIO()))


def _make_spec_root(root: Path, *, with_specs_dir: bool = False) -> Path:
    """A minimal fake spec root: 'widgets' (R1, seeded at v1, v2/v3 authored), 'models' (R3, seeded at v1) and
    'gadgets' (R1, v1 authored, never promoted). Real promote/rollback calls add LEDGER rows on top."""
    _write(
        root / "evolution" / "kinds.yaml",
        "kinds:\n  widgets:\n    risk_tier: R1\n    owner: operator\n  models:\n    risk_tier: R3\n    owner: operator\n"
        "  gadgets:\n    risk_tier: R1\n    owner: operator\n",
    )
    for version, label in (("v1", "one"), ("v2", "two"), ("v3", "three")):
        _write(root / "evolution" / "widgets" / f"{version}.yaml", f"label: {label}\n")
    _write(root / "evolution" / "models" / "v1.yaml", "label: initial\n")
    _write(root / "evolution" / "gadgets" / "v1.yaml", "label: first gadget\n")
    _seed(root, "widgets")
    _seed(root, "models")
    if with_specs_dir:
        (root / "specs").mkdir(parents=True, exist_ok=True)
    return root


class _Root(_CapturedCliOutput):
    def setUp(self):
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name))
        self.evidence = self.root / "evidence.txt"
        _write(self.evidence, "harness report placeholder\n")
        self.ledger_before = self._ledger_text()

    def _ledger_text(self) -> str:
        path = self.root / "evolution" / "LEDGER.md"
        return path.read_text(encoding="utf-8") if path.is_file() else ""

    def _promote(self, version: str, kind: str = "widgets", approved_by: str | None = None) -> int:
        return cli.promote(self.root, kind=kind, version=version, evidence=self.evidence, approved_by=approved_by)


class LoadChampionTests(_Root):
    def test_reads_the_current_champion_version_and_document(self):
        self.assertEqual(load_champion(self.root, "widgets"), ("v1", {"label": "one"}))

    def test_unknown_kind_raises(self):
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "nonexistent-kind")
        self.assertIn("EVOLUTION_UNKNOWN_KIND", str(ctx.exception))

    def test_missing_version_file_raises(self):
        _write(self.root / "evolution" / "widgets" / "champion.yaml", 'kind: widgets\nversion: "v9"\n')
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_VERSION_FILE_INVALID", str(ctx.exception))

    def test_malformed_yaml_raises(self):
        _write(self.root / "evolution" / "widgets" / "v1.yaml", "label: [unterminated\n")
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_VERSION_FILE_INVALID", str(ctx.exception))

    def test_duplicate_key_in_kinds_file_raises(self):
        _write(self.root / "evolution" / "kinds.yaml", "kinds:\n  widgets:\n    risk_tier: R1\nkinds:\n  widgets:\n    risk_tier: R2\n")
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_KINDS_FILE_INVALID", str(ctx.exception))

    def test_a_champion_naming_a_file_outside_its_kind_is_refused(self):
        _write(self.root / "evolution" / "widgets" / "champion.yaml", 'kind: widgets\nversion: "../models/v1"\n')
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_VERSION_NAME_INVALID", str(ctx.exception))

    def test_champion_file_missing_raises(self):
        (self.root / "evolution" / "widgets" / "champion.yaml").unlink()
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_CHAMPION_MALFORMED", str(ctx.exception))

    def test_a_champion_that_does_not_record_the_promoted_bytes_is_refused(self):
        _write(self.root / "evolution" / "widgets" / "champion.yaml", 'kind: widgets\nversion: "v1"\n')
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_CHAMPION_MALFORMED", str(ctx.exception))

    def test_a_promoted_version_edited_afterwards_fails_closed_at_runtime(self):
        _write(self.root / "evolution" / "widgets" / "v1.yaml", "label: one, quietly changed\n")
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_VERSION_CHANGED", str(ctx.exception))

    def test_list_versions_lists_loadable_names_in_version_order(self):
        _write(self.root / "evolution" / "widgets" / "v10.yaml", "label: ten\n")
        _write(self.root / "evolution" / "widgets" / "draft.yaml", "label: not a version\n")
        self.assertEqual(list_versions(self.root, "widgets"), ["v1", "v2", "v3", "v10"])

    def test_known_kinds_lists_the_kinds_with_their_risk_tiers(self):
        kinds = known_kinds(self.root)
        self.assertEqual((kinds["widgets"]["risk_tier"], kinds["models"]["risk_tier"]), ("R1", "R3"))

    def test_a_champion_naming_another_kind_is_refused_by_runtime_and_cli(self):
        # Codex 2026-09-27 F2: a champion.yaml copied in from another kind's directory was followed.
        sha = _sha(self.root / "evolution" / "widgets" / "v1.yaml")
        _write(self.root / "evolution" / "widgets" / "champion.yaml", f'kind: models\nversion: "v1"\nversion_sha256: "{sha}"\nledger_line: 0\n')
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_CHAMPION_MALFORMED", str(ctx.exception))
        self.assertEqual(self._promote("v2"), 2)
        self.assertIn("EVOLUTION_CHAMPION_MALFORMED", self.stderr.getvalue())

    def test_a_version_file_naming_itself_another_version_is_refused(self):
        _write(self.root / "evolution" / "widgets" / "v2.yaml", "version: v1\nlabel: two\n")
        with self.assertRaises(InvariantViolation) as ctx:
            registry.load_version(self.root, "widgets", "v2")
        self.assertIn("EVOLUTION_VERSION_FILE_INVALID", str(ctx.exception))
        self.assertEqual(registry.load_version(self.root, "widgets", "v3"), {"label": "three"})

    def test_every_kind_needs_a_directory_name_and_a_risk_tier_and_the_cli_refuses_without_a_traceback(self):
        # Codex 2026-09-27 F3: `widgets: R1` crashed promote with AttributeError; a missing tier read as a low one.
        for kinds in ("widgets: R1", "widgets:\n    owner: operator", "widgets:\n    risk_tier: r3", "../widgets:\n    risk_tier: R1"):
            _write(self.root / "evolution" / "kinds.yaml", f"kinds:\n  {kinds}\n")
            with self.assertRaises(InvariantViolation, msg=kinds) as ctx:
                known_kinds(self.root)
            self.assertIn("EVOLUTION_KINDS_FILE_INVALID", str(ctx.exception))
            self.assertEqual(self._promote("v2"), 2, kinds)
        self.assertEqual(self._ledger_text(), self.ledger_before)


class PromoteTests(_Root):
    def test_promote_updates_champion_and_appends_one_ledger_row(self):
        self.assertEqual(self._promote("v2"), 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v2")
        sha = _sha(self.root / "evolution" / "widgets" / "v2.yaml")
        self.assertIn(f"| widgets | promote | v1 | v2 | {sha} | {_sha(self.evidence)} | - |", self._ledger_text())
        self.assertEqual(cli.ledger_errors(self.root), [])

    def test_promoting_the_current_version_again_is_an_idempotent_noop(self):
        self.assertEqual(self._promote("v1"), 0)
        self.assertEqual(self._ledger_text(), self.ledger_before, "no-op promote must not write a LEDGER row")

    def test_the_first_cli_promotion_of_a_kind_is_recorded_like_the_seed(self):
        # critic M-1: a kind's first CLI promotion also has version_before "-"; its evidence is the --evidence file,
        # so immutability must be checked against version_sha256, not evidence_sha256.
        self.assertEqual(self._promote("v1", kind="gadgets"), 0)
        self.assertEqual(cli.ledger_errors(self.root), [])
        _write(self.root / "evolution" / "gadgets" / "v1.yaml", "label: first gadget, edited after promotion\n")
        self.assertTrue(any("EVOLUTION_VERSION_CHANGED" in error for error in cli.ledger_errors(self.root)))

    def test_r3_kind_without_approved_by_is_refused_and_writes_nothing(self):
        self.assertEqual(self._promote("v1", kind="models"), 2)
        self.assertIn("EVOLUTION_APPROVAL_REQUIRED", self.stderr.getvalue())
        self.assertEqual(self._ledger_text(), self.ledger_before, "a refused R3 promotion must not touch LEDGER.md")
        self.assertEqual(load_champion(self.root, "models")[0], "v1", "champion must be unchanged")

    def test_r3_kind_with_approved_by_succeeds(self):
        _write(self.root / "evolution" / "models" / "v2.yaml", "label: two\n")
        self.assertEqual(self._promote("v2", kind="models", approved_by="operator"), 0)
        self.assertEqual(load_champion(self.root, "models")[0], "v2")

    def test_a_version_name_outside_the_kind_directory_is_refused(self):
        _write(self.root / "evolution" / "other.yaml", "label: not-a-widget\n")
        self.assertEqual(self._promote("../other"), 2)
        self.assertIn("EVOLUTION_VERSION_NAME_INVALID", self.stderr.getvalue())
        self.assertEqual(self._ledger_text(), self.ledger_before)
        self.assertEqual(load_champion(self.root, "widgets"), ("v1", {"label": "one"}))

    def test_a_version_runtime_could_not_load_is_never_promoted(self):
        _write(self.root / "evolution" / "widgets" / "v2.yaml", "label: [unterminated\n")
        self.assertEqual(self._promote("v2"), 2)
        self.assertIn("EVOLUTION_VERSION_FILE_INVALID", self.stderr.getvalue())
        self.assertEqual(self._ledger_text(), self.ledger_before)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1")

    def test_a_version_edited_after_it_was_installed_is_never_installed_again(self):
        self.assertEqual(self._promote("v2"), 0)
        self.assertEqual(self._promote("v3"), 0)
        _write(self.root / "evolution" / "widgets" / "v2.yaml", "label: two, edited after it was champion\n")
        self.assertEqual(self._promote("v2"), 2)
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 2)
        self.assertIn("EVOLUTION_VERSION_CHANGED", self.stderr.getvalue())
        self.assertEqual(load_champion(self.root, "widgets")[0], "v3")

    def test_a_run_that_died_between_the_two_writes_is_refused_until_restored_from_git(self):
        with mock.patch.object(cli, "_write_champion", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self._promote("v2")
        self.assertIn("| widgets | promote | v1 | v2 |", self._ledger_text())
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1", "runtime keeps reading the champion that is really in place")
        self.assertEqual(self._promote("v3"), 2)
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 2)
        self.assertIn("EVOLUTION_LEDGER_CHAMPION_MISMATCH", self.stderr.getvalue())
        _write(self.root / "evolution" / "LEDGER.md", self.ledger_before)  # what `git checkout -- evolution/` does in the repo
        self.assertEqual(self._promote("v2"), 0)

    def test_a_ledger_forked_by_two_checkouts_is_refused(self):
        # critic n1: rows -, v1->v2, v1->v3 (two checkouts promoted from v1; git kept both rows), champion v3. The
        # promote row of v3 does not start from the v2 the rows before it left; undoing it would jump v3 -> v1.
        v2, v3 = (_sha(self.root / "evolution" / "widgets" / f"{v}.yaml") for v in ("v2", "v3"))
        _write(
            self.root / "evolution" / "LEDGER.md",
            self.ledger_before
            + f"| 2026-09-26T01:00:00Z | widgets | promote | v1 | v2 | {v2} | - | - |\n"
            + f"| 2026-09-26T01:00:00Z | widgets | promote | v1 | v3 | {v3} | - | - |\n",
        )
        _write(self.root / "evolution" / "widgets" / "champion.yaml", f'kind: widgets\nversion: "v3"\nversion_sha256: "{v3}"\nledger_line: 0\n')
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 2)
        self.assertIn("EVOLUTION_LEDGER_MALFORMED", self.stderr.getvalue())
        self.assertTrue(cli.ledger_errors(self.root))

    def test_the_cli_writes_lf_only(self):
        # git keeps these files LF (eol=lf); a CRLF write on Windows made a rollback's evidence sha unrecomputable.
        self.assertEqual(self._promote("v2"), 0)
        for path in (self.root / "evolution" / "LEDGER.md", self.root / "evolution" / "widgets" / "champion.yaml"):
            self.assertNotIn(b"\r\n", path.read_bytes(), path.name)

    def test_an_approver_that_would_break_the_ledger_row_is_refused(self):
        for approver in ("pei | ops", "  ", "pei\nops"):
            self.assertEqual(self._promote("v1", kind="models", approved_by=approver), 2, repr(approver))
        self.assertIn("EVOLUTION_APPROVER_INVALID", self.stderr.getvalue())
        self.assertEqual(self._ledger_text(), self.ledger_before)

    def test_a_malformed_ledger_row_is_refused_not_skipped(self):
        _write(self.root / "evolution" / "LEDGER.md", self.ledger_before + "| 2026-09-26T00:00:00Z | widgets | promote | v1 | v2 | abc | def | pei | ops |\n")
        self.assertEqual(self._promote("v3"), 2)
        self.assertIn("EVOLUTION_LEDGER_MALFORMED", self.stderr.getvalue())

    def test_a_champion_no_ledger_row_installed_is_refused(self):
        _write(self.root / "evolution" / "gadgets" / "champion.yaml", f'kind: gadgets\nversion: "v1"\nversion_sha256: "{_sha(self.root / "evolution" / "gadgets" / "v1.yaml")}"\n')
        self.assertEqual(self._promote("v1", kind="gadgets"), 2)
        self.assertIn("EVOLUTION_LEDGER_CHAMPION_MISMATCH", self.stderr.getvalue())

    def test_unknown_kind_is_refused(self):
        self.assertEqual(self._promote("v1", kind="nope"), 2)

    def test_missing_evidence_file_is_refused(self):
        rc = cli.promote(self.root, kind="widgets", version="v2", evidence=self.root / "no-such-file.txt", approved_by=None)
        self.assertEqual(rc, 2)
        self.assertEqual(self._ledger_text(), self.ledger_before)


class RollbackTests(_Root):
    def test_rollback_returns_to_the_ledgers_actual_previous_version_not_a_hardcoded_one(self):
        # v1 -> v2 -> v3: rollback must land on v2, a DIFFERENT version from the kind's first (the card's mutation:
        # "rollback 固定回 v1（不讀 LEDGER）→「回上一版」案紅").
        self.assertEqual(self._promote("v2"), 0)
        self.assertEqual(self._promote("v3"), 0)
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v2")

    def test_a_second_rollback_walks_further_back_never_reinstalling_the_version_it_left(self):
        self.assertEqual(self._promote("v2"), 0)
        self.assertEqual(self._promote("v3"), 0)
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 0)
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1")
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 2, "v1 is the first version")
        self.assertIn("EVOLUTION_ROLLBACK_NO_PRIOR_VERSION", self.stderr.getvalue())
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1")
        self.assertEqual(cli.ledger_errors(self.root), [])

    def test_rollback_after_a_version_was_promoted_twice_still_walks_back_to_the_first(self):
        # Matching rows by version name cycled v3 -> v2 -> v3 forever after v1 -> v2 -> v3 -> v2 (critic m2).
        for version in ("v2", "v3", "v2"):
            self.assertEqual(self._promote(version), 0)
        landed = []
        for _ in range(3):
            self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 0)
            landed.append(load_champion(self.root, "widgets")[0])
        self.assertEqual(landed, ["v3", "v2", "v1"])
        self.assertEqual(cli.rollback(self.root, kind="widgets", approved_by=None), 2)

    def test_rollback_of_a_kind_never_promoted_is_refused(self):
        self.assertEqual(cli.rollback(self.root, kind="gadgets", approved_by=None), 2)
        self.assertIn("EVOLUTION_ROLLBACK_NO_HISTORY", self.stderr.getvalue())

    def test_r3_kind_rollback_without_approved_by_is_refused(self):
        _write(self.root / "evolution" / "models" / "v2.yaml", "label: two\n")
        self.assertEqual(self._promote("v2", kind="models", approved_by="operator"), 0)
        self.assertEqual(cli.rollback(self.root, kind="models", approved_by=None), 2)
        self.assertEqual(load_champion(self.root, "models")[0], "v2", "refused rollback must not change champion")


class AtomicWriteTests(_Root):
    def test_a_mid_write_failure_leaves_no_partial_file_and_the_original_untouched(self):
        target = self.root / "evolution" / "widgets" / "champion.yaml"
        original = target.read_bytes()
        with mock.patch("ai_lego.apps.cli.evolution.os.replace", side_effect=OSError("simulated disk failure")):
            with self.assertRaises(OSError):
                cli._atomic_write_text(target, 'kind: widgets\nversion: "v99"\n')
        self.assertEqual(target.read_bytes(), original, "target file must be exactly as it was before the failed write")
        leftover_temp_files = [p.name for p in target.parent.iterdir() if p.name.startswith(f".{target.name}.")]
        self.assertEqual(leftover_temp_files, [], f"temp file(s) left behind after a failed write: {leftover_temp_files}")


class CliMainEndToEndTests(_Root):
    def test_promote_then_rollback_through_argv(self):
        (self.root / "specs").mkdir(exist_ok=True)
        rc = cli.main(["--spec-root", str(self.root), "promote", "--kind", "widgets", "--version", "v2", "--evidence", str(self.evidence)])
        self.assertEqual(rc, 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v2")
        rc = cli.main(["--spec-root", str(self.root), "rollback", "--kind", "widgets"])
        self.assertEqual(rc, 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1")
        self.assertIn("PASS: widgets champion v2 -> v1 (rollback)", self.stdout.getvalue())


class RealSpecRootLedgerTests(unittest.TestCase):
    """Reads the real spec root, never writes it."""

    def test_the_real_ledger_replays_to_every_champion_and_every_recorded_version_is_unchanged(self):
        # Versions are immutable once recorded: editing one (or its champion pointer, or a row) without a new
        # recorded promotion leaves the ledger vouching for bytes that no longer exist.
        spec_root = resolve_spec_root()
        self.assertEqual(cli.ledger_errors(spec_root), [])
        self.assertEqual(load_champion(spec_root, "synthesis-prompts")[0], "v1")

    def test_the_risk_tiers_are_the_risk_tier_schemas_enum(self):
        path = resolve_spec_root() / "specs" / "execution" / "risk-tier.schema.yaml"
        self.assertEqual(list(registry.RISK_TIERS), yaml.safe_load(path.read_text(encoding="utf-8"))["risk_tier"]["enum"])


class SpecRootReadOnlyBoundaryTests(unittest.TestCase):
    """P-K5 / COS/README.md:3: runtime only reads the spec root; the offline CLI is the one writer."""

    def test_nothing_in_the_package_imports_the_offline_writer(self):
        package = Path(ai_lego.__file__).resolve().parent
        writer = Path(cli.__file__).resolve()
        offenders = []
        for path in sorted(package.rglob("*.py")):
            if path.resolve() == writer:
                continue
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
                if "ai_lego.apps.cli.evolution" in names:
                    offenders.append(str(path.relative_to(package)))
        self.assertEqual(offenders, [])

    def test_the_runtime_reader_never_writes(self):
        tree = ast.parse(Path(registry.__file__).read_text(encoding="utf-8"))
        writes = {"write_text", "write_bytes", "replace", "rename", "unlink", "mkdir", "rmdir", "mkstemp", "open"}
        called = {
            node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", "")
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
        }
        self.assertEqual(called & writes, set())


if __name__ == "__main__":
    unittest.main()
