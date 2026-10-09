"""The research export (docs/platform/STEP34_SHARED_RULES.md §6, §10; card 31) on a real PostgreSQL: what leaves, what is
left out and why, and the gates that keep it the operator's only and every place key handled."""

from __future__ import annotations

import contextlib
import io
import json
import shutil
import tempfile
import uuid
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.cli import research_export as cli
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import research_export
from tests.unit.test_groups_core import GroupCase

STUDY = "s-2026"
SECRET = {"COGNITIVE_OS_STUDY_SECRET_S_2026": "a-study-secret"}
PLACES = ("台南市安平區", "高雄市前鎮區", "東京都新宿", "花蓮縣秀林鄉", "新竹市東區")


class ExportCase(GroupCase):
    """a, b, c of GroupCase: b and c each open a case and consent to the study."""

    def setUp(self):
        super().setUp()
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder, True)
        self.cases = {who: self.open_case(who) for who in (self.b, self.c)}

    def open_case(self, who: str) -> str:
        project = self.repo.create_project({"project_id": str(uuid.uuid4()), "tenant_id": self.tenant, "workspace_id": self.workspace, "name": f"案 {who[:6]}",
                                            "purpose": "p", "data_classification": "Confidential", "status": "active", "version": 1,
                                            "created_by_identity_id": who, "created_at": db.iso(db.now())})["project_id"]
        return project

    def save(self, who: str, kind: str, content: dict, block: str) -> dict:
        return self.docs.save(self.tenant, record_log.case(self.cases[who]), kind, content, record_log.user(who, block))

    def consent(self, who: str, *docs: dict, follow: bool = True, study: str = STUDY) -> dict:
        items = [{"project_id": self.cases[who], "kind": doc["kind"], "doc_id": doc["doc_id"]} for doc in docs]
        return self.docs.save(self.tenant, record_log.person(who), "govern.consent", {"purpose": "research", "target": study, "items": items,
                                                                                       "follow_versions": follow, "withdrawn": False}, record_log.user(who, "GOVERN"))

    def withdraw(self, who: str, consent: dict) -> None:
        self.docs.save(self.tenant, record_log.person(who), "govern.consent", {**consent["content"], "withdrawn": True}, record_log.user(who, "GOVERN"),
                       doc_id=consent["doc_id"], base_version=consent["version"])

    def export(self, environ: dict | None = None, name: str = "out.jsonl") -> tuple[list[dict], dict, str]:
        out = self.folder / name
        manifest = research_export.export(self.repo, self.tenant, STUDY, out, now=db.now(), environ=SECRET if environ is None else environ)
        text = out.read_text(encoding="utf-8")
        return [json.loads(line) for line in text.splitlines()], manifest, text

    def intake(self, who: str) -> dict:
        return self.save(who, "assembler.intake", {"purpose": "複雜決策", "question": "要不要搬家", "package": "個人複雜決策", "happened_in": [PLACES[0]],
                                                   "you_are_in": PLACES[1], "others_in": [PLACES[2]], "field_contact": "里長 0912-000-000"}, "ASSEMBLER")


class WhatLeavesTests(ExportCase):
    def test_only_live_consented_items_leave_with_no_account_and_no_place(self):
        intake = self.intake(self.b)
        layered = self.save(self.b, "map.map", {"layers": {"fact": [{"id": "1", "text": "房租漲了", "by": "user", "place": PLACES[3]}]}}, "MAP")
        unlisted = self.save(self.b, "sense.card", {"category": "事件", "text": "沒有同意的卡"}, "SENSE")
        self.consent(self.b, intake, layered)
        self.save(self.c, "sense.card", {"category": "事件", "text": "C 沒有同意"}, "SENSE")
        lines, manifest, text = self.export()
        items = [line for line in lines if line["type"] == "item"]
        self.assertEqual(sorted(item["kind"] for item in items), ["assembler.intake", "map.map"])
        self.assertEqual(manifest["items"], 2)
        self.assertNotIn(unlisted["content"]["text"], text)
        self.assertEqual(items[0]["content"]["question"] if items[0]["kind"] == "assembler.intake" else items[1]["content"]["question"], "要不要搬家")
        people = []
        with self.databases.for_tenant(self.tenant) as connection:
            people = [row[key] for row in connection.execute("SELECT identity_id, email, display_name FROM identity WHERE tenant_id=%s", (self.tenant,)) for key in ("identity_id", "email", "display_name")]
        everything = text + json.dumps(manifest, ensure_ascii=False)
        for seeded in (*PLACES[:4], "里長 0912-000-000", *people, self.tenant):
            self.assertNotIn(seeded, everything)
        for word in ("匿名", "anonymous", "Anonymous"):
            self.assertNotIn(word, everything)

    def test_a_case_that_failed_or_did_not_change_is_in(self):
        review = self.save(self.b, "learn.calibration", {"judgment_version": 1, "outcome": "什麼都沒改變，計畫失敗了", "prediction_result": "沒對上"}, "LEARN")
        self.consent(self.b, review)
        lines, _, _ = self.export()
        self.assertEqual([line["content"]["outcome"] for line in lines if line["type"] == "item"], ["什麼都沒改變，計畫失敗了"])

    def test_the_same_person_gets_the_same_pseudonym_and_another_study_another(self):
        self.consent(self.b, self.save(self.b, "sense.card", {"category": "事件", "text": "一"}, "SENSE"))
        first = [line["subject"] for line in self.export()[0] if line["type"] == "item"]
        second = [line["subject"] for line in self.export(name="again.jsonl")[0] if line["type"] == "item"]
        other = [line["subject"] for line in self.export(environ={"COGNITIVE_OS_STUDY_SECRET_S_2026": "another-secret"}, name="other.jsonl")[0] if line["type"] == "item"]
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertNotIn(self.b, first[0])

    def test_two_study_ids_that_share_a_secret_name_never_share_a_pseudonym(self):
        card = self.save(self.b, "sense.card", {"category": "事件", "text": "一"}, "SENSE")
        self.consent(self.b, card)
        self.consent(self.b, card, study="S_2026")   # same env name COGNITIVE_OS_STUDY_SECRET_S_2026 as "s-2026"
        first = [line["subject"] for line in self.export()[0] if line["type"] == "item"]
        out = self.folder / "alias.jsonl"
        research_export.export(self.repo, self.tenant, "S_2026", out, now=db.now(), environ=SECRET)
        alias = [json.loads(line)["subject"] for line in out.read_text(encoding="utf-8").splitlines() if json.loads(line)["type"] == "item"]
        self.assertTrue(first and alias)
        self.assertFalse(set(first) & set(alias))

    def test_the_header_says_what_was_removed_and_that_it_is_no_guarantee(self):
        lines, manifest, _ = self.export()
        self.assertEqual(lines[0]["type"], "header")
        for where in (lines[0], manifest["header"]):
            self.assertIn("this file removes the account and three places; it does not guarantee that a person cannot be recognised", where["en"])
            self.assertIn("不保證認不出是誰", where["zh"])


class WhatIsLeftOutTests(ExportCase):
    def test_a_withdrawn_consent_leaves_the_next_export_and_is_counted_once(self):
        consent = self.consent(self.b, self.save(self.b, "sense.card", {"category": "事件", "text": "後來撤回的卡"}, "SENSE"))
        _, before, text = self.export()
        self.assertIn("後來撤回的卡", text)
        self.withdraw(self.b, consent)
        _, after, text = self.export(name="after.jsonl")
        self.assertNotIn("後來撤回的卡", text)
        self.assertEqual((before["withdrawals_since_last_export"], after["withdrawals_since_last_export"], after["excluded"]), (0, 1, ["consent_withdrawn"]))
        _, later, _ = self.export(name="later.jsonl")
        self.assertEqual(later["withdrawals_since_last_export"], 0)

    def test_the_manifest_names_reasons_never_people(self):
        card = self.save(self.b, "sense.card", {"category": "事件", "text": "會被刪的卡"}, "SENSE")
        self.consent(self.b, card)
        self.docs.delete(self.tenant, record_log.case(self.cases[self.b]), "sense.card", card["doc_id"], record_log.user(self.b, "SENSE"))
        self.consent(self.c, self.save(self.c, "sense.card", {"category": "事件", "text": "案子會被抹除"}, "SENSE"))
        with self.databases.for_tenant(self.tenant) as connection:
            ProjectSourceRepository.erase_case_rows(connection, self.tenant, self.cases[self.c])
        _, manifest, _ = self.export()
        self.assertEqual(manifest["excluded"], ["case_erased", "consent_missing_item"])
        text = json.dumps(manifest)
        for who in (self.a, self.b, self.c):
            self.assertNotIn(who, text)

    def test_no_secret_no_export_and_nothing_written(self):
        out = self.folder / "none.jsonl"
        for environ in ({}, {"COGNITIVE_OS_STUDY_SECRET_S_2026": "  "}):
            with self.assertRaisesRegex(InvariantViolation, "^RESEARCH_STUDY_SECRET_MISSING"):
                research_export.export(self.repo, self.tenant, STUDY, out, now=db.now(), environ=environ)
        self.assertFalse(out.exists())

    def test_drift_records_only_when_the_facilitator_and_every_participant_consent(self):
        facilitator = self.a   # the convener leads here; the group's participants are b and c
        with self.databases.for_tenant(self.tenant) as connection:
            connection.execute("UPDATE group_members SET role='facilitator' WHERE tenant_id=%s AND group_id=%s AND identity_id=%s", (self.tenant, self.group, facilitator))
        self.docs.save(self.tenant, record_log.person(facilitator), "facilitate.log",
                       {"group_id": self.group, "script": "systems.iceberg_model", "script_version": 1, "followed": "照稿", "deviated": [{"what": "跳過第二步", "why": "時間不夠"}]},
                       record_log.user(facilitator, "FACILITATE"))
        self.docs.save(self.tenant, record_log.person(facilitator), "govern.consent", {"purpose": "research", "target": STUDY, "items": [], "follow_versions": True, "withdrawn": False},
                       record_log.user(facilitator, "GOVERN"))
        self.consent(self.b)
        lines, manifest, _ = self.export()
        self.assertEqual(([line for line in lines if line["type"] == "drift"], manifest["excluded"]), ([], ["not_all_consented"]))
        self.consent(self.c)
        lines, manifest, text = self.export(name="all.jsonl")
        [drift] = [line for line in lines if line["type"] == "drift"]
        self.assertEqual((drift["content"]["deviated"], manifest["excluded"]), ([{"what": "跳過第二步", "why": "時間不夠"}], []))
        self.assertNotIn(self.group, text)


class GateTests(ExportCase):
    def test_no_web_route_reaches_the_exporter(self):
        api = PRODUCT_ROOT / "ai_lego" / "apps" / "api"
        self.assertEqual([path.name for path in api.rglob("*.py") if "research_export" in path.read_text(encoding="utf-8")], [])

    def test_every_place_like_key_of_every_kind_is_handled(self):
        self.assertEqual(research_export.unhandled_place_keys(PRODUCT_ROOT / "ai_lego" / "core" / "domain" / "kinds"), [])

    def test_the_place_gate_fails_on_a_kind_with_a_new_place_field(self):
        with tempfile.TemporaryDirectory() as folder:
            copy = Path(folder) / "kinds"
            shutil.copytree(PRODUCT_ROOT / "ai_lego" / "core" / "domain" / "kinds", copy, ignore=shutil.ignore_patterns("__pycache__"))
            (copy / "s31_planted.py").write_text("from ai_lego.core.domain.doc_kinds import DocKind, Field\n"
                                                 "KINDS = [DocKind('sense.s31', 'SENSE', 'x', {'meeting_place': Field(), 'note': Field('json', unread_keys=('birthplace',))})]\n", encoding="utf-8")
            self.assertEqual(research_export.unhandled_place_keys(copy), ["s31_planted.py: meeting_place", "s31_planted.py: birthplace"])

    def test_the_operators_cli_exports_with_the_secret_and_refuses_without(self):
        self.consent(self.b, self.save(self.b, "sense.card", {"category": "事件", "text": "CLI 匯出的卡"}, "SENSE"))
        out = self.folder / "cli.jsonl"
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["--tenant", self.tenant, "--study", STUDY, "--out", str(out)], databases=self.databases), 2)
        self.assertFalse(out.exists())
        import os
        from unittest import mock

        with mock.patch.dict(os.environ, SECRET), contextlib.redirect_stdout(io.StringIO()) as printed:
            self.assertEqual(cli.main(["--tenant", self.tenant, "--study", STUDY, "--out", str(out)], databases=self.databases), 0)
        self.assertIn("CLI 匯出的卡", out.read_text(encoding="utf-8"))
        self.assertEqual(json.loads(printed.getvalue())["items"], 1)
