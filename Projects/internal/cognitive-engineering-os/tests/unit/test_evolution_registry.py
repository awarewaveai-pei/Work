"""ai_lego.platform.evolution.registry (load_champion, P-g) and ai_lego.apps.cli.evolution
(promote/rollback, WC-P2-03). Every test builds its own throwaway spec root under a
TemporaryDirectory -- none of them may touch the real spec root (agency-os/docs/
AI_LEGO_Cognitive_Engineering_OS/evolution/), per the card's own instruction."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ai_lego.apps.cli import evolution as cli
from ai_lego.errors import InvariantViolation
from ai_lego.platform.evolution.registry import known_kinds, list_versions, load_champion


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _make_spec_root(root: Path, *, with_specs_dir: bool = False) -> Path:
    """A minimal fake spec root with two kinds: 'widgets' (R1, champion=v1, versions
    v1/v2/v3 pre-authored) and 'models' (R3, champion=v1, one version). Real promote/
    rollback calls in tests add more versions/LEDGER rows on top of this base."""
    _write(
        root / "evolution" / "kinds.yaml",
        "kinds:\n  widgets:\n    risk_tier: R1\n    owner: operator\n  models:\n    risk_tier: R3\n    owner: operator\n",
    )
    for version, label in (("v1", "one"), ("v2", "two"), ("v3", "three")):
        _write(root / "evolution" / "widgets" / f"{version}.yaml", f"label: {label}\n")
    _write(root / "evolution" / "widgets" / "champion.yaml", 'kind: widgets\nversion: "v1"\nledger_line: 0\n')
    _write(root / "evolution" / "models" / "v1.yaml", "label: initial\n")
    _write(root / "evolution" / "models" / "champion.yaml", 'kind: models\nversion: "v1"\nledger_line: 0\n')
    if with_specs_dir:
        (root / "specs").mkdir(parents=True, exist_ok=True)
    return root


class LoadChampionTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name))

    def test_reads_the_current_champion_version_and_document(self):
        version, document = load_champion(self.root, "widgets")
        self.assertEqual(version, "v1")
        self.assertEqual(document, {"label": "one"})

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

    def test_champion_file_missing_raises(self):
        (self.root / "evolution" / "widgets" / "champion.yaml").unlink()
        with self.assertRaises(InvariantViolation) as ctx:
            load_champion(self.root, "widgets")
        self.assertIn("EVOLUTION_CHAMPION_MALFORMED", str(ctx.exception))

    def test_list_versions_returns_every_version_stem_sorted_excluding_champion(self):
        self.assertEqual(list_versions(self.root, "widgets"), ["v1", "v2", "v3"])

    def test_known_kinds_lists_both_kinds_with_their_risk_tiers(self):
        kinds = known_kinds(self.root)
        self.assertEqual(kinds["widgets"]["risk_tier"], "R1")
        self.assertEqual(kinds["models"]["risk_tier"], "R3")


class PromoteTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name))
        self.evidence = self.root / "evidence.txt"
        _write(self.evidence, "harness report placeholder\n")

    def _ledger_text(self) -> str:
        path = self.root / "evolution" / "LEDGER.md"
        return path.read_text(encoding="utf-8") if path.is_file() else ""

    def test_promote_updates_champion_and_appends_one_ledger_row(self):
        rc = cli.promote(self.root, kind="widgets", version="v2", evidence=self.evidence, approved_by=None)
        self.assertEqual(rc, 0)
        version, _ = load_champion(self.root, "widgets")
        self.assertEqual(version, "v2")
        ledger = self._ledger_text()
        self.assertIn("| widgets | promote | v1 | v2 |", ledger)

    def test_promoting_the_current_version_again_is_an_idempotent_noop(self):
        rc = cli.promote(self.root, kind="widgets", version="v1", evidence=self.evidence, approved_by=None)
        self.assertEqual(rc, 0)
        self.assertEqual(self._ledger_text(), "", "no-op promote must not write a LEDGER row")

    def test_r3_kind_without_approved_by_is_refused_and_writes_nothing(self):
        rc = cli.promote(self.root, kind="models", version="v1", evidence=self.evidence, approved_by=None)
        self.assertEqual(rc, 2)
        self.assertEqual(self._ledger_text(), "", "a refused R3 promotion must not touch LEDGER.md")
        version, _ = load_champion(self.root, "models")
        self.assertEqual(version, "v1", "champion must be unchanged")

    def test_r3_kind_with_approved_by_succeeds(self):
        _write(self.root / "evolution" / "models" / "v2.yaml", "label: two\n")
        rc = cli.promote(self.root, kind="models", version="v2", evidence=self.evidence, approved_by="operator")
        self.assertEqual(rc, 0)
        version, _ = load_champion(self.root, "models")
        self.assertEqual(version, "v2")

    def test_unknown_kind_is_refused(self):
        rc = cli.promote(self.root, kind="nope", version="v1", evidence=self.evidence, approved_by=None)
        self.assertEqual(rc, 2)

    def test_missing_evidence_file_is_refused(self):
        rc = cli.promote(self.root, kind="widgets", version="v2", evidence=self.root / "no-such-file.txt", approved_by=None)
        self.assertEqual(rc, 2)
        self.assertEqual(self._ledger_text(), "")


class RollbackTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name))
        self.evidence = self.root / "evidence.txt"
        _write(self.evidence, "harness report placeholder\n")

    def test_rollback_returns_to_the_ledgers_actual_previous_version_not_a_hardcoded_one(self):
        # v1 -> v2 -> v3, so LEDGER's last row for widgets is (v2 -> v3); rollback must
        # land on v2, which is a DIFFERENT version from the kind's original v1 -- a
        # hardcoded "always roll back to v1" implementation would pass a naive
        # single-promotion test but fails this one (the card's own mutation: "rollback
        # 固定回 v1（不讀 LEDGER）→「回上一版」案紅").
        self.assertEqual(cli.promote(self.root, kind="widgets", version="v2", evidence=self.evidence, approved_by=None), 0)
        self.assertEqual(cli.promote(self.root, kind="widgets", version="v3", evidence=self.evidence, approved_by=None), 0)
        rc = cli.rollback(self.root, kind="widgets", approved_by=None)
        self.assertEqual(rc, 0)
        version, _ = load_champion(self.root, "widgets")
        self.assertEqual(version, "v2")

    def test_rollback_with_no_ledger_history_is_refused(self):
        rc = cli.rollback(self.root, kind="widgets", approved_by=None)
        self.assertEqual(rc, 2)

    def test_r3_kind_rollback_without_approved_by_is_refused(self):
        _write(self.root / "evolution" / "models" / "v2.yaml", "label: two\n")
        self.assertEqual(cli.promote(self.root, kind="models", version="v2", evidence=self.evidence, approved_by="operator"), 0)
        rc = cli.rollback(self.root, kind="models", approved_by=None)
        self.assertEqual(rc, 2)
        version, _ = load_champion(self.root, "models")
        self.assertEqual(version, "v2", "refused rollback must not change champion")


class AtomicWriteTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name))

    def test_a_mid_write_failure_leaves_no_partial_file_and_the_original_untouched(self):
        target = self.root / "evolution" / "widgets" / "champion.yaml"
        original = target.read_text(encoding="utf-8")
        with mock.patch("ai_lego.apps.cli.evolution.os.replace", side_effect=OSError("simulated disk failure")):
            with self.assertRaises(OSError):
                cli._atomic_write_text(target, 'kind: widgets\nversion: "v99"\n')
        self.assertEqual(target.read_text(encoding="utf-8"), original, "target file must be exactly as it was before the failed write")
        leftover_temp_files = [p.name for p in target.parent.iterdir() if p.name.startswith(f".{target.name}.")]
        self.assertEqual(leftover_temp_files, [], f"temp file(s) left behind after a failed write: {leftover_temp_files}")


class CliMainEndToEndTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = _make_spec_root(Path(self._tmp.name), with_specs_dir=True)
        self.evidence = self.root / "evidence.txt"
        _write(self.evidence, "harness report placeholder\n")

    def test_promote_then_rollback_through_argv(self):
        rc = cli.main(["--spec-root", str(self.root), "promote", "--kind", "widgets", "--version", "v2", "--evidence", str(self.evidence)])
        self.assertEqual(rc, 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v2")

        rc = cli.main(["--spec-root", str(self.root), "rollback", "--kind", "widgets"])
        self.assertEqual(rc, 0)
        self.assertEqual(load_champion(self.root, "widgets")[0], "v1")


if __name__ == "__main__":
    unittest.main()
