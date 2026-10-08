"""FACILITATE content is versioned and fail-closed around stop signals."""

from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import yaml

from ai_lego.errors import InvariantViolation
from ai_lego.platform import rulesets
from ai_lego.platform.rulesets import Ruleset
from ai_lego.platform.scripts import (
    FACIL_DONTS,
    ROOT,
    available_subjects,
    load_donts,
    load_scripts,
    report,
    usable_for_leading,
)
from ai_lego.apps.cli.import_scripts import import_scripts


PRODUCT_ROOT = Path(__file__).resolve().parents[2]
CARD = PRODUCT_ROOT / "docs" / "platform" / "step34-cards" / "FACILITATE.card.txt"
FIXTURE = PRODUCT_ROOT / "tests" / "fixtures" / "art_tools_sample.csv"
MAPPING = {
    "id": "工具 id",
    "subject": "主題",
    "prompt": "帶活動者提示用語",
    "stop_signals": "停止活動訊號",
}


class FacilitateContentTests(unittest.TestCase):
    def copy_content(self) -> Path:
        temp = Path(tempfile.mkdtemp(prefix="facilitate-content-"))
        self.addCleanup(shutil.rmtree, temp, True)
        target = temp / "scripts"
        shutil.copytree(ROOT, target)
        for cache in target.rglob("__pycache__"):
            shutil.rmtree(cache)
        return target

    @staticmethod
    def rewrite(path: Path, change) -> None:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        change(document)
        path.write_text(yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8", newline="\n")

    @staticmethod
    def refresh_history(root: Path) -> None:
        items = [yaml.safe_load(path.read_text(encoding="utf-8")) for path in sorted((root / "scripts").glob("*.yaml"))]
        ruleset = Ruleset("facilitate.scripts", "FACILITATE", "帶領稿", "1", "平台（FACILITATE，內容檔）", items)
        history = json.loads((root / "HISTORY.json").read_text(encoding="utf-8"))
        history["facilitate.scripts"]["1"] = ruleset.fingerprint()
        (root / "HISTORY.json").write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    def test_dont_list_is_the_four_card_items_line_by_line(self):
        line = next(line for line in CARD.read_text(encoding="utf-8").splitlines() if "四件不能做的事" in line)
        expected = [item.strip().rstrip("。") for item in line.split("：", 1)[1].split("；")]
        self.assertEqual(list(FACIL_DONTS), expected)
        self.assertEqual(load_donts(), expected)

    def test_loader_reads_seed_scripts_and_history(self):
        loaded = load_scripts()
        self.assertEqual(len(loaded.items), 3)
        self.assertEqual(loaded.stamp()["fingerprint"], "0e1f80cb1e21")
        self.assertEqual({item["state"] for item in loaded.items}, {"draft"})
        self.assertTrue(all(item["escalation"]["who"] == "GOVERN" for item in loaded.items))
        self.assertIn("facilitate.scripts", rulesets.rulesets())

    def test_subject_without_any_stop_signal_is_excluded_and_reported(self):
        root = self.copy_content()
        path = root / "scripts" / "systems.iceberg_model.yaml"
        self.rewrite(path, lambda document: [step.__setitem__("stop_signals", []) for step in document["steps"]])
        self.refresh_history(root)
        self.assertNotIn("systems.iceberg_model", available_subjects(root))
        self.assertEqual(report(root), [{"id": "systems.iceberg_model", "subject": "systems.iceberg_model", "reason": "沒有停止訊號"}])

    def test_draft_scripts_can_never_be_used_to_lead(self):
        self.assertEqual(usable_for_leading(), [])
        root = self.copy_content()
        path = root / "scripts" / "systems.iceberg_model.yaml"
        self.rewrite(path, lambda document: document.__setitem__("state", "reviewed"))
        self.refresh_history(root)
        usable = usable_for_leading(root)
        self.assertEqual([item["subject"] for item in usable], ["systems.iceberg_model"])

    def test_changed_script_text_without_version_bump_is_refused(self):
        root = self.copy_content()
        path = root / "scripts" / "systems.iceberg_model.yaml"
        self.rewrite(path, lambda document: document["steps"][0].__setitem__("what", document["steps"][0]["what"] + " 再看一次。"))
        with self.assertRaisesRegex(InvariantViolation, "RULESET_CHANGED_WITHOUT_VERSION"):
            load_scripts(root)

    def test_importer_writes_drafts_lists_empty_stop_rows_and_never_fills_them(self):
        output = Path(tempfile.mkdtemp(prefix="facilitate-import-"))
        self.addCleanup(shutil.rmtree, output, True)
        first = import_scripts(FIXTURE, output / "one", MAPPING)
        self.assertEqual(sum(line.startswith("CREATED ") for line in first), 4)
        self.assertTrue(any(line.startswith("EMPTY_STOP_SIGNALS art.no-stop") for line in first))
        empty = yaml.safe_load((output / "one" / "art.no-stop.yaml").read_text(encoding="utf-8"))
        self.assertEqual(empty["state"], "draft")
        self.assertEqual(empty["steps"][0]["stop_signals"], [])
        second = import_scripts(FIXTURE, output / "one", MAPPING)
        self.assertEqual(sum(line.startswith("SKIP ") for line in second), 4)
        before = {path.name: path.read_bytes() for path in (output / "one").glob("*.yaml")}
        other = import_scripts(FIXTURE, output / "two", MAPPING)
        self.assertEqual(other, first)
        self.assertEqual(before, {path.name: path.read_bytes() for path in (output / "two").glob("*.yaml")})

    def test_importer_never_writes_into_the_reviewed_scripts_folder(self):
        for target in (None, ROOT / "scripts"):
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, "output-dir"):
                import_scripts(FIXTURE, target, MAPPING)
        load_scripts()   # the managed set is unchanged: the ruleset still loads

    def test_a_row_that_ends_early_is_an_invalid_row_not_a_crash(self):
        output = Path(tempfile.mkdtemp(prefix="facilitate-import-"))
        self.addCleanup(shutil.rmtree, output, True)
        short = output / "short.csv"
        short.write_text(FIXTURE.read_text(encoding="utf-8").rstrip("\n") + "\nzz.short,zz.short\n", encoding="utf-8", newline="")
        with self.assertRaisesRegex(ValueError, "no cell"):
            import_scripts(short, output / "out", MAPPING)
        self.assertFalse((output / "out").exists())

    def test_a_reviewed_script_must_escalate_to_govern(self):
        root = self.copy_content()
        path = root / "scripts" / "systems.iceberg_model.yaml"
        self.rewrite(path, lambda document: (document.__setitem__("state", "reviewed"), document["escalation"].__setitem__("who", "OTHER")))
        self.refresh_history(root)
        with self.assertRaisesRegex(InvariantViolation, "escalation.who must be GOVERN"):
            load_scripts(root)

    def test_importer_writes_nothing_when_any_row_is_invalid(self):
        output = Path(tempfile.mkdtemp(prefix="facilitate-import-"))
        self.addCleanup(shutil.rmtree, output, True)
        bad = output / "bad.csv"
        bad.write_text(FIXTURE.read_text(encoding="utf-8") + "zz.unknown,not.a.subject,提示,停\n", encoding="utf-8", newline="")
        with self.assertRaises(InvariantViolation):
            import_scripts(bad, output / "out", MAPPING)
        self.assertFalse((output / "out").exists())


if __name__ == "__main__":
    unittest.main()
