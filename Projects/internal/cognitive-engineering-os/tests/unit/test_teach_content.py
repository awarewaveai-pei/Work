"""TEACH content is validated before the platform exposes it as a ruleset."""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

import yaml

from ai_lego.core.domain.kinds.assembler import PACKAGES
from ai_lego.errors import InvariantViolation
from ai_lego.platform import rulesets
from ai_lego.platform.lessons import ROOT, courses, load_lessons, load_practice_cases, reviewed_only
from ai_lego.apps.cli.generate_lessons import generate_lessons


TOOLS = ["systems.iceberg_model", "framing.problem_statement", "learning.after_action_review"]


class TeachContentTests(unittest.TestCase):
    def copy_content(self) -> Path:
        temp = Path(tempfile.mkdtemp(prefix="teach-content-"))
        self.addCleanup(shutil.rmtree, temp, True)
        target = temp / "lessons"
        shutil.copytree(ROOT, target)
        for cache in target.rglob("__pycache__"):
            shutil.rmtree(cache)
        return target

    @staticmethod
    def rewrite(path: Path, change) -> None:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        change(document)
        path.write_text(yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8")

    def test_loader_reads_every_lesson_case_and_ruleset_history(self):
        lesson_files = sorted((ROOT / "lessons").glob("*.yaml"))
        case_files = sorted((ROOT / "cases").glob("*.yaml"))
        lesson_ruleset = load_lessons()
        case_ruleset = load_practice_cases()
        self.assertEqual(len(lesson_ruleset.items), len(lesson_files))
        self.assertEqual(len(case_ruleset.items), len(case_files))
        self.assertEqual(lesson_ruleset.stamp()["fingerprint"], "553f964de991")
        self.assertEqual(case_ruleset.stamp()["fingerprint"], "bb655a3aa4a8")
        self.assertEqual({lesson["source"]["kind"] for lesson in case_ruleset.items}, {"publisher"})
        self.assertIn("sources-independent-origins", {lesson["id"] for lesson in lesson_ruleset.items})

    def test_unknown_subject_is_refused(self):
        root = self.copy_content()
        path = next((root / "lessons").glob("*.yaml"))
        self.rewrite(path, lambda document: document.__setitem__("subject", "not.a.platform.subject"))
        with self.assertRaisesRegex(InvariantViolation, "TEACH_SUBJECT_UNKNOWN"):
            load_lessons(root)

    def test_minutes_over_five_is_refused(self):
        root = self.copy_content()
        path = next((root / "lessons").glob("*.yaml"))
        self.rewrite(path, lambda document: document.__setitem__("minutes", 9))
        with self.assertRaisesRegex(InvariantViolation, "TEACH_MINUTES_INVALID"):
            load_lessons(root)

    def test_missing_state_is_refused(self):
        root = self.copy_content()
        path = next((root / "lessons").glob("*.yaml"))
        self.rewrite(path, lambda document: document.pop("state"))
        with self.assertRaisesRegex(InvariantViolation, "TEACH_LESSON_FIELDS_MISSING"):
            load_lessons(root)

    def test_case_without_checked_source_date_is_refused(self):
        root = self.copy_content()
        path = next((root / "cases").glob("*.yaml"))
        self.rewrite(path, lambda document: document["source"].pop("checked_on"))
        with self.assertRaisesRegex(InvariantViolation, "TEACH_CASE_SOURCE_INVALID"):
            load_practice_cases(root)

    def test_case_may_explicitly_be_not_yet_checked(self):
        root = self.copy_content()
        path = next((root / "cases").glob("*.yaml"))
        self.rewrite(path, lambda document: document["source"].__setitem__("checked_on", "尚未查核"))
        cases = load_practice_cases(root)
        self.assertEqual(cases.items[0]["source"]["checked_on"], "尚未查核")

    def test_loader_runs_the_cited_as_true_guard_on_a_broken_lesson(self):
        path = next((ROOT / "lessons").glob("*.yaml"))
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        document["text"] = "因為有引註所以是真的。"
        with self.assertRaisesRegex(InvariantViolation, "TEACH_TEXT_FORBIDDEN"):
            from ai_lego.platform.lessons import validate_lesson
            validate_lesson(document, path)

    def test_text_change_without_version_bump_is_refused_against_history(self):
        root = self.copy_content()
        path = next((root / "lessons").glob("*.yaml"))
        self.rewrite(path, lambda document: document.__setitem__("text", document["text"] + " 這是沒有登記的改動。"))
        with self.assertRaisesRegex(InvariantViolation, "RULESET_CHANGED_WITHOUT_VERSION"):
            load_lessons(root)

    def test_reviewed_lesson_cannot_contain_draft_label(self):
        root = self.copy_content()
        path = next((root / "lessons").glob("*.yaml"))
        self.rewrite(path, lambda document: (document.__setitem__("state", "reviewed"), document.__setitem__("text", "這是草稿內容。")))
        with self.assertRaisesRegex(InvariantViolation, "TEACH_REVIEWED_DRAFT_WORD"):
            load_lessons(root)

    def test_plain_lesson_scans_and_draft_visibility(self):
        forbidden = ("分數", "排名", "評分", "打分", "排行", "名次")
        for path in sorted((ROOT / "lessons").glob("*.yaml")):
            text = path.read_text(encoding="utf-8")
            self.assertFalse(any(word in text for word in forbidden), path.name)
            self.assertNotIn("因為有引註所以是真的", text, path.name)
            self.assertNotIn("請說出你的脆弱", text, path.name)
        self.assertEqual(reviewed_only(), [])
        self.assertTrue(all(item["state"] == "draft" for item in load_lessons().items))

    def test_course_lists_cover_each_package_with_a_course_lesson(self):
        actual = courses()
        self.assertEqual(set(actual), set(PACKAGES))
        self.assertTrue(all(values for values in actual.values()))

    def test_generator_is_deterministic_and_never_overwrites(self):
        output = Path(tempfile.mkdtemp(prefix="teach-generated-"))
        self.addCleanup(shutil.rmtree, output, True)
        first = generate_lessons(TOOLS, output)
        self.assertEqual(sum(line.startswith("CREATED ") for line in first), 3)
        before = {path.name: path.read_bytes() for path in output.glob("*.yaml")}
        second = generate_lessons(TOOLS, output)
        self.assertEqual(sum(line.startswith("SKIP ") for line in second), 3)
        self.assertEqual(before, {path.name: path.read_bytes() for path in output.glob("*.yaml")})
        self.assertEqual(set(before), {f"{tool}.yaml" for tool in TOOLS})

    def test_generator_reports_unusable_page_text_as_blocked(self):
        output = Path(tempfile.mkdtemp(prefix="teach-blocked-"))
        self.addCleanup(shutil.rmtree, output, True)
        report = generate_lessons(["decision.weighted_decision_matrix"], output)
        self.assertEqual(len(report), 1)
        self.assertTrue(report[0].startswith("BLOCKED: decision.weighted_decision_matrix"))
        self.assertEqual(list(output.glob("*.yaml")), [])


if __name__ == "__main__":
    unittest.main()
