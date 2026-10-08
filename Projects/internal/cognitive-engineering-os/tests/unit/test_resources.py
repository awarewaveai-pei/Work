"""Crisis resources per place (GOVERN, card 32): content files with a recorded source and a version; selection by where
the person is only; in a group, each participant's own place for their own notice, never visible to another member."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import resources, safety, visibility
from ai_lego.platform.visibility import Viewer
from tests.unit.test_api_main import ApiTestCase
from tests.unit.test_groups_core import GroupCase, registered

PLACE = DocKind("collab.place", "COLLAB", "你在哪裡", {"where": Field("text", 200, required=True)}, owner="group", visibility="self_and_govern")


def copy_of_the_folder(test) -> Path:
    folder = Path(tempfile.mkdtemp()) / "resources"
    shutil.copytree(resources.FOLDER, folder, ignore=shutil.ignore_patterns("__pycache__", "*.py"))
    test.addCleanup(shutil.rmtree, folder.parent, True)
    return folder


class SelectionTests(ApiTestCase):
    def test_a_person_in_taiwan_gets_taiwans_lines_then_the_international_ones(self):
        found = resources.for_place("我現在在高雄")
        self.assertEqual((found["place"], found["fallback"]), ("台灣", None))
        self.assertEqual([entry["how_to_reach"] for entry in found["resources"]][:1], ["1925"])
        self.assertEqual(found["resources"][-2:], resources.places()[resources.INTERNATIONAL]["entries"])

    def test_an_unknown_place_or_none_gets_the_international_set_and_says_so(self):
        for where in ("Berlin", None, ""):
            found = resources.for_place(where)
            self.assertEqual((found["place"], found["fallback"], found["resources"]), (None, "這裡的資源我們還沒有，先給國際通用的", resources.places()[resources.INTERNATIONAL]["entries"]))

    def test_the_step_1_lines_are_these_files_unchanged(self):
        self.assertEqual([(entry["name"], entry["contact"]) for entry in safety.resources("台北")],
                         [(entry["name"], entry["how_to_reach"]) for entry in resources.for_place("台北")["resources"]])
        self.assertEqual(safety.TAIWAN_PLACES, tuple(resources.places()["台灣"]["matches"]))

    def test_govern_help_and_a_crisis_notice_carry_the_fallback(self):
        help_text = self.client.get("/govern/help", params={"where": "Berlin"}).json()
        self.assertEqual(help_text["fallback"], resources.FALLBACK)
        self.assertEqual(safety.help_for("台南")["fallback"], None)

    def test_the_unchecked_entries_are_listed(self):
        self.assertEqual(resources.unchecked(), ["國際通用: 有立即危險時：打你所在地的緊急電話"])


class ContentRulesTests(ApiTestCase):
    def test_an_entry_without_a_source_is_refused(self):
        folder = copy_of_the_folder(self)
        path = folder / "taiwan.yaml"
        text = path.read_text(encoding="utf-8")
        path.write_text(text.replace('source: {name: 衛生福利部 mohw.gov.tw/cp-16-85625-1.html, checked_on: "2026-10-08"}', "source: {}", 1), encoding="utf-8")
        with self.assertRaisesRegex(InvariantViolation, "^RESOURCE_SOURCE_MISSING"):
            resources.load(folder)

    def test_a_text_change_without_a_new_version_is_refused_and_with_one_it_loads(self):
        folder = copy_of_the_folder(self)
        path = folder / "taiwan.yaml"
        path.write_text(path.read_text(encoding="utf-8").replace("hours: 24 小時", "hours: 全天", 1), encoding="utf-8")
        with self.assertRaisesRegex(InvariantViolation, "^RESOURCE_CHANGED_WITHOUT_VERSION"):
            resources.load(folder)
        path.write_text(path.read_text(encoding="utf-8").replace('version: "1"', 'version: "2"', 1), encoding="utf-8")
        import json

        import yaml

        history = json.loads((folder / "HISTORY.json").read_text(encoding="utf-8"))
        history["台灣"]["2"] = resources.fingerprint(yaml.safe_load(path.read_text(encoding="utf-8")))
        (folder / "HISTORY.json").write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(resources.load(folder)["台灣"]["version"], "2")

    def test_a_new_place_is_a_file_and_a_history_line(self):
        folder = copy_of_the_folder(self)
        (folder / "japan.yaml").write_text("place: 日本\nversion: \"1\"\nmatches: [日本, Japan]\nentries: []\n", encoding="utf-8")
        with self.assertRaisesRegex(InvariantViolation, "^RESOURCE_CHANGED_WITHOUT_VERSION"):
            resources.load(folder)


class GroupPlaceTests(GroupCase):
    def setUp(self):
        super().setUp()
        patcher = registered(PLACE)
        patcher.__enter__()
        self.addCleanup(patcher.__exit__, None, None, None)

    def test_a_participants_place_is_their_own_notice_and_no_other_member_sees_it(self):
        from ai_lego.apps.api.blocks.docs import _where

        self.docs.save(self.tenant, self.owner, "collab.place", {"where": "高雄"}, record_log.user(self.b, "COLLAB"))
        self.docs.save(self.tenant, self.owner, "collab.place", {"where": "Berlin"}, record_log.user(self.c, "COLLAB"))
        self.assertEqual(_where(self.docs, self.tenant, self.b, self.owner), "高雄")
        self.assertEqual(_where(self.docs, self.tenant, self.c, self.owner), "Berlin")
        for other in (self.a, self.c):
            seen = [item["content"]["where"] for item in visibility.visible(self.docs, Viewer(self.tenant, other), self.group, "collab.place")]
            self.assertNotIn("高雄", seen)
