"""完整性核心 (build step 1): the pre-launch rule check. Each check is shown to fail on a made-up block that breaks it and to
pass on the real ones, so a check that cannot fail does not pass here. The live table can only be fully green once every
open block is built; until then the blocks that are open and not built are listed as failing, not hidden."""

from __future__ import annotations

import contextlib
import dataclasses
import io
import json
import os
import re
import subprocess
import sys
import unittest
from unittest import mock

from ai_lego import PRODUCT_ROOT
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data.events import record_log
from ai_lego.platform import ai_gate, integrity, safety
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.integrity import CHECKS, PLATFORM, RULES, Snapshot
from tests import pg

PAGE = PRODUCT_ROOT.parents[2] / "agency-os" / "handoffs" / "2026-10-02-cognitive-sovereignty-platform" / "platform-supervisor.html"
PAGE_OWNER_CODE = {"組裝器": "ASSEMBLER", "協作合約": "COLLAB_CONTRACT", "規範與脈絡": "CONTEXT", "完整性核心": "INTEGRITY", "共用紀錄": "RECORD"}


def setUpModule() -> None:
    """The checks that run the real save path do it in a rehearsal on the configured database (integrity._rehearsal): here a
    migrated test database of its own, named in COGNITIVE_OS_DATABASE_URLS for this module and the command it starts."""
    server = pg.server()
    database = server.create_database()
    unittest.addModuleCleanup(server.drop_database, database)
    environment = mock.patch.dict(os.environ, {pg.DATABASE_URLS_ENV: f"integrity={pg.as_url(server.url(database))}"})
    environment.start()
    unittest.addModuleCleanup(environment.stop)


def mine(type_: str = "text", **options) -> Field:
    return Field(type_, human_only=True, **options)


# The cross-block interface as the build brief fixes it (the shape the slot checks hold a block's kinds to).
INTERFACE = [
    DocKind("decide.judgment", "DECIDE", "判斷", {
        "conclusion": mine(), "confidence": mine(), "change_condition": mine(required=True), "stop_answers": mine("json"),
        "intensity_now": mine("choice", choices=("弱", "中", "強")), "influences_listed": mine("json"), "influences_added": mine("list"), "next_step": mine(),
    }, singleton=True, deletable=False),
    DocKind("map.map", "MAP", "地圖", {
        "method": Field("text"), "layers": Field("json"), "core_conflict": mine(), "claims": Field("json"), "gaps": Field("list"), "unwinnable": Field("bool"),
    }, singleton=True, deletable=False),
    DocKind("think.round", "THINK", "一輪思考", {"problem": mine(), "own": mine("list"), "role": Field("text"), "criteria": Field("list"), "reflection": mine()}),
    DocKind("context.notes", "CONTEXT", "脈絡註記", {
        "norm_origin": Field("text"), "jurisdictions": Field("list"), "stance": mine(), "recheck_when": Field("text"),
    }, singleton=True, deletable=False),
    DocKind("act.task", "ACT", "任務卡", {
        "title": Field("text"), "due": Field("date"), "stop_condition": Field("text"), "escalate_condition": Field("text"), "owner": Field("text"), "irreversible": Field("bool"),
    }),
]


def with_kinds(*extra: DocKind, **changes) -> Snapshot:
    live = Snapshot.live()
    return dataclasses.replace(live, kinds={**live.kinds, **{kind.kind: kind for kind in extra}}, **changes)


def without_kind(snapshot: Snapshot, *names: str) -> Snapshot:
    return dataclasses.replace(snapshot, kinds={name: kind for name, kind in snapshot.kinds.items() if name not in names})


def an_action(block: str, name: str = "probe", **changes) -> AiAction:
    fields = dict(block=block, name=name, needs="organize", instructions="x", output_kind="sense.mirror", output_schema={"type": "object", "properties": {"summary": {"type": "string"}}},
                  reads=(), build_input=lambda context, read: "x")
    return AiAction(**{**fields, **changes})


class TheCheckTable(unittest.TestCase):
    def test_every_check_says_what_it_proves_and_what_it_does_not(self):
        self.assertEqual(len({check.id for check in CHECKS}), len(CHECKS))
        for check in CHECKS:
            self.assertTrue(check.name and check.proves and check.does_not_prove, check.id)
            self.assertTrue(check.rules and all(rule in RULES for rule in check.rules), check.id)

    def test_every_rule_has_a_check_that_looks_at_it_and_the_report_says_so(self):
        self.assertEqual(sorted(RULES), sorted(integrity.coverage()))
        text = integrity._text(integrity.run())
        for rule, text_of_rule in RULES.items():
            self.assertRegex(text, rf"{rule}  {re.escape(text_of_rule)}：")
        self.assertEqual([rule for rule, ids in integrity.coverage().items() if not ids], [])

    def test_the_report_names_what_fails_per_block_and_json_carries_the_same(self):
        rows = integrity.run(with_kinds(DocKind("sense.bad", "SENSE", "x", {"score": Field("int")})))
        failing = [row for row in rows if row.status == "FAIL"]
        self.assertIn("SENSE", [row.block for row in failing])
        text = integrity._text(rows)
        self.assertIn("SENSE  [no_scores]  sense.bad.score grades someone", text)
        report = integrity.report(rows)
        self.assertEqual({row["block"]: row["status"] for row in report["rows"]}["SENSE"], "FAIL")
        self.assertFalse(report["gate_passed"])
        json.dumps(report, ensure_ascii=False)


class TheLiveBlocks(unittest.TestCase):
    def test_every_block_that_is_built_passes_every_check(self):
        rows = integrity.run()
        self.assertEqual([(row.block, row.failures) for row in rows if row.built and row.failures], [])
        self.assertTrue({"SENSE", "GOVERN", "ASSEMBLER", "COLLAB_CONTRACT", PLATFORM} <= {row.block for row in rows if row.built})

    def test_a_platform_whose_open_blocks_are_all_built_to_the_interface_passes_the_gate(self):
        from ai_lego.platform.block_hooks.govern import _recognise

        live = Snapshot.live()
        snapshot = dataclasses.replace(
            with_kinds(*INTERFACE), open_blocks=("SENSE", "MAP", "THINK", "DECIDE", "ACT", "GOVERN"),
            hooks={**live.hooks, **{kind.kind: (_recognise,) for kind in INTERFACE}})
        rows = integrity.run(snapshot)
        self.assertEqual([(row.block, row.failures) for row in rows if row.failures], [])
        self.assertTrue(integrity.gate_passed(rows))
        self.assertEqual({row.block: row.status for row in rows}["DECIDE"], "PASS")
        self.assertEqual({row.block: row.status for row in rows}["CONTEXT"], "PASS")

    def test_a_block_that_is_open_with_no_contract_on_the_record_is_listed_as_failing_not_hidden(self):
        live = Snapshot.live()
        rows = integrity.run(dataclasses.replace(live, open_blocks=("SENSE", "GOVERN", "MAP"), kinds={name: kind for name, kind in live.kinds.items() if kind.block != "MAP"},
                                                 actions={key: action for key, action in live.actions.items() if action.block != "MAP"}))
        map_row = next(row for row in rows if row.block == "MAP")
        self.assertEqual((map_row.status, map_row.live), ("FAIL", True))
        self.assertTrue(any(text.startswith("MAP is open but keeps no kind") for _, text in map_row.failures), map_row.failures)
        self.assertFalse(integrity.gate_passed(rows))

    def test_a_failing_block_that_is_not_open_is_listed_and_does_not_stop_the_others(self):
        snapshot = with_kinds(DocKind("gather.bad", "GATHER", "x", {"rating": Field("int")}))
        rows = integrity.run(dataclasses.replace(snapshot, open_blocks=("SENSE", "GOVERN")))
        gather = next(row for row in rows if row.block == "GATHER")
        self.assertEqual((gather.status, gather.live), ("FAIL", False))
        self.assertTrue(integrity.gate_passed(rows))

    def test_a_block_that_is_not_open_and_not_built_is_not_a_failure(self):
        live = Snapshot.live()
        unbuilt = dataclasses.replace(live, kinds={name: kind for name, kind in live.kinds.items() if kind.block != "TEACH"},
                                      actions={name: action for name, action in live.actions.items() if action.block != "TEACH"},
                                      hooks={name: hooks for name, hooks in live.hooks.items() if not name.startswith("teach.")})
        rows = {row.block: row for row in integrity.run(unbuilt)}
        self.assertEqual(rows["TEACH"].status, "NOT BUILT")


class TheGenericChecks(unittest.TestCase):
    def test_a_conclusion_the_ai_can_write_is_found(self):
        bad = DocKind("decide.bad", "DECIDE", "x", {"conclusion": Field("text"), "change_condition": Field("text")}, authors=frozenset({"user", "ai"}))
        self.assertEqual(len(integrity.human_only_conclusions(with_kinds(bad), "DECIDE")), 2)
        self.assertEqual(integrity.human_only_conclusions(with_kinds(*INTERFACE), "DECIDE"), [])
        self.assertEqual(integrity.human_only_conclusions(Snapshot.live(), "SENSE"), [])

    def test_a_field_that_grades_someone_is_found_by_its_words_not_its_letters(self):
        bad = DocKind("think.bad", "THINK", "x", {"belief_score": Field("int"), "autonomy": Field("int"), "obedience_level": Field("int")})
        self.assertEqual(len(integrity.no_scores(with_kinds(bad), "THINK")), 3)
        fine = DocKind("think.fine", "THINK", "x", {"upgrade": Field("text"), "scoreboard": Field("text"), "gradient": Field("text")})
        self.assertEqual(integrity.no_scores(with_kinds(fine), "THINK"), [])
        graded_answer = an_action("SENSE", output_schema={"type": "object", "properties": {"rank": {"type": "integer"}}})
        snapshot = dataclasses.replace(Snapshot.live(), actions={("SENSE", "probe"): graded_answer})
        self.assertEqual(len(integrity.no_scores(snapshot, "SENSE")), 1)

    def test_an_ai_action_that_saves_into_another_blocks_kind_or_a_kind_it_may_not_write_is_found(self):
        snapshot = dataclasses.replace(Snapshot.live(), actions={("SENSE", "a"): an_action("SENSE", "a", output_kind="govern.guardrail"), ("SENSE", "b"): an_action("SENSE", "b", output_kind="sense.card")})
        self.assertEqual(len(integrity.ai_permissions(snapshot, "SENSE")), 2)
        self.assertEqual(integrity.ai_permissions(Snapshot.live(), "SENSE"), [])

    def test_an_ai_action_that_reads_beyond_its_card_is_found(self):
        reading_govern = an_action("SENSE", reads=("govern.guardrail",))
        snapshot = dataclasses.replace(Snapshot.live(), actions={("SENSE", "probe"): reading_govern})
        self.assertIn("govern.guardrail (GOVERN)", integrity.reads_within_card(snapshot, "SENSE")[0])
        unknown = dataclasses.replace(Snapshot.live(), actions={("SENSE", "probe"): an_action("SENSE", reads=("nothing.here",))})
        self.assertIn("not a known kind", integrity.reads_within_card(unknown, "SENSE")[0])
        self.assertEqual(integrity.reads_within_card(Snapshot.live(), "SENSE"), [])

    def test_decide_may_read_the_strength_of_the_emotion_but_not_the_cards(self):
        for kind, expected in (("sense.state", 0), ("sense.card", 1), ("sense.mirror", 1)):
            snapshot = dataclasses.replace(Snapshot.live(), actions={("DECIDE", "probe"): an_action("DECIDE", reads=(kind,))})
            self.assertEqual(len(integrity.reads_within_card(snapshot, "DECIDE")), expected, kind)

    def test_learn_reads_every_block_and_a_block_with_no_reads_reads_only_itself(self):
        self.assertEqual(integrity.reads_from("LEARN"), frozenset(integrity.ALL_CODES))
        self.assertEqual(integrity.reads_from("SENSE"), frozenset({"SENSE"}))
        self.assertEqual(integrity.reads_from("GOVERN"), frozenset({"GOVERN", "ASSEMBLER", "COLLAB", "FACILITATE"}))

    def test_an_ai_gate_that_does_not_stop_on_a_crisis_signal_is_found(self):
        self.assertEqual(integrity.crisis_stops_ai(Snapshot.live(), "SENSE"), [])
        with mock.patch.object(safety, "crisis_signal", lambda *texts: False):
            problems = integrity.crisis_stops_ai(Snapshot.live(), "SENSE")
        self.assertEqual(len(problems), 1)
        self.assertIn("SENSE.mirror failed on a crisis signal", problems[0])

    def test_the_crisis_stop_runs_for_an_action_that_needs_a_grant_and_one_that_runs_with_no_case(self):
        granted = an_action("SENSE", "needs-grant", needs="counter")
        outside = an_action("GOVERN", "outside", output_kind="govern.explanation", outside_case=True)
        snapshot = dataclasses.replace(Snapshot.live(), actions={("SENSE", "needs-grant"): granted, ("GOVERN", "outside"): outside})
        self.assertEqual(integrity.crisis_stops_ai(snapshot, "SENSE"), [])
        self.assertEqual(integrity.crisis_stops_ai(snapshot, "GOVERN"), [])

    def test_a_kind_that_holds_the_persons_words_with_no_high_risk_recognition_is_found(self):
        self.assertEqual(integrity.high_risk_recognised(Snapshot.live(), "SENSE"), [])
        bare = dataclasses.replace(Snapshot.live(), hooks={})
        self.assertEqual(sorted(problem.split(" ")[0] for problem in integrity.high_risk_recognised(bare, "SENSE")), ["sense.card", "sense.mirror", "sense.review", "sense.state"])
        self.assertEqual([problem.split(" ")[0] for problem in integrity.high_risk_recognised(Snapshot.live(), "ASSEMBLER")], [])

    def test_the_check_applies_to_the_blocks_that_show_content_and_not_to_the_ones_that_do_not(self):
        check = next(item for item in CHECKS if item.id == "high_risk_recognised")
        snapshot = Snapshot.live()
        self.assertTrue(check.applies(snapshot, "SENSE"))
        self.assertFalse(check.applies(snapshot, "GOVERN"))
        self.assertFalse(check.applies(snapshot, "COLLAB_CONTRACT"))

    def test_a_record_that_takes_a_score_is_found_and_the_one_that_refuses_it_passes(self):
        self.assertEqual(integrity.record_refuses_scores(Snapshot.live(), PLATFORM), [])
        with mock.patch.object(record_log, "SCORE_KEYS", frozenset()):
            self.assertEqual(integrity.record_refuses_scores(Snapshot.live(), PLATFORM), ["the record accepted a payload with a score"])

    def test_a_shared_instruction_that_lost_a_rule_is_found(self):
        self.assertEqual(integrity.shared_instructions(Snapshot.live(), PLATFORM), [])
        weakened = dataclasses.replace(Snapshot.live(), preamble=ai_gate.PREAMBLE.replace("never score anyone", "be kind"))
        self.assertEqual(len(integrity.shared_instructions(weakened, PLATFORM)), 1)

    def test_saving_a_card_with_a_crisis_signal_brings_help_and_a_save_that_does_not_is_found(self):
        self.assertEqual(integrity.crisis_on_save(Snapshot.live(), PLATFORM), [])
        with mock.patch.object(safety, "crisis_signal", lambda *texts: False):
            self.assertEqual(integrity.crisis_on_save(Snapshot.live(), PLATFORM), ["saving a card with a crisis signal brought no help"])

    def test_a_route_file_that_saves_documents_around_the_save_path_is_found(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as folder:
            sources = {
                "around.py": "def route(docs):\n    docs.save('t', 'o', 'k', {}, 'w')\n",
                "through.py": "def route(docs):\n    return _saved(docs.save('t', 'o', 'k', {}, 'w'))\n",
                "hooked.py": "def route(docs, fn):\n    fn(docs.save)\n    after_save()\n",
                "reads_only.py": "def route(docs):\n    return docs.current('t', 'o', 'k')\n",
            }
            for name, source in sources.items():
                (Path(folder) / name).write_text(source, encoding="utf-8")
            self.assertEqual(integrity.unsafe_route_modules(Path(folder)), ["around.py saves documents but never goes through the save path (crisis notice, guardrails)"])
        self.assertEqual(integrity.routes_keep_the_save_path(Snapshot.live(), PLATFORM), [])

    def test_an_ai_input_that_escapes_chinese_is_found_because_the_crisis_check_could_not_read_it(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as folder:
            sources = {
                "escaped.py": "import json\n\n\ndef build(payload):\n    return json.dumps(payload)\n",
                "readable.py": "import json\n\n\ndef build(payload):\n    return json.dumps(payload, ensure_ascii=False)\n",
                "wrongly.py": "import json\n\n\ndef build(payload):\n    return json.dumps(payload, ensure_ascii=True)\n",
                "other.py": "def build(payload):\n    return str(payload)\n",
            }
            for name, source in sources.items():
                (Path(folder) / name).write_text(source, encoding="utf-8")
            problems = integrity.unreadable_inputs(Path(folder))
            self.assertEqual(sorted(problem.split(" ")[0] for problem in problems), ["escaped.py:5", "wrongly.py:5"])
        self.assertEqual(integrity.ai_inputs_are_readable(Snapshot.live(), PLATFORM), [])

    def test_the_review_check_waits_for_a_block_that_can_hold_a_date_and_then_asks_for_one(self):
        check = next(item for item in CHECKS if item.id == "review_scheduled")
        live = Snapshot.live()
        bare = dataclasses.replace(live, kinds={name: kind for name, kind in live.kinds.items() if kind.block not in ("ACT", "LEARN")})
        self.assertFalse(check.applies(bare, PLATFORM))   # neither ACT nor LEARN keeps a kind: nothing to ask, and no empty tick
        self.assertEqual(integrity.review_scheduled(live, PLATFORM), [])   # today ACT and LEARN keep a date to come back on
        undated = dataclasses.replace(bare, kinds={**bare.kinds, "act.task": DocKind("act.task", "ACT", "x", {"title": Field("text")})})
        self.assertTrue(check.applies(undated, PLATFORM))
        self.assertEqual(integrity.review_scheduled(undated, PLATFORM), ["neither ACT nor LEARN keeps a date to come back on"])
        self.assertEqual(integrity.review_scheduled(with_kinds(*INTERFACE), PLATFORM), [])
        self.assertEqual({row.block: row.results["review_scheduled"] for row in integrity.run(undated) if row.block == PLATFORM}, {PLATFORM: ["neither ACT nor LEARN keeps a date to come back on"]})
        self.assertEqual(next(row for row in integrity.run() if row.block == PLATFORM).results["review_scheduled"], [])


class TheCardSlots(unittest.TestCase):
    """What a block's card fixes on a kind (the cross-block interface): a conforming kind passes, each break is named."""

    def run_slot(self, name: str, snapshot: Snapshot) -> list[str]:
        return integrity._slot(name)(snapshot, integrity.SLOTS[name][0])

    def test_the_interface_kinds_as_fixed_pass_every_slot(self):
        snapshot = with_kinds(*INTERFACE)
        for name in integrity.SLOTS:
            self.assertEqual(self.run_slot(name, snapshot), [], name)

    def test_a_missing_kind_is_named(self):
        for name, (_, kind, _, _) in integrity.SLOTS.items():
            self.assertEqual(self.run_slot(name, without_kind(with_kinds(*INTERFACE), kind)), [f"{kind} does not exist"], name)

    def test_a_judgment_whose_condition_is_optional_or_whose_conclusion_the_ai_can_write_is_found(self):
        judgment = INTERFACE[0]
        optional = dataclasses.replace(judgment, fields={**judgment.fields, "change_condition": mine()})
        self.assertEqual(self.run_slot("decide_judgment_card", with_kinds(optional)), ["decide.judgment.change_condition must be required"])
        open_conclusion = DocKind("decide.judgment", "DECIDE", "判斷", {**{name: Field(field.type, choices=field.choices) for name, field in judgment.fields.items()}, "change_condition": Field("text", required=True)},
                                  authors=frozenset({"user", "ai"}), singleton=True, deletable=False)
        problems = self.run_slot("decide_judgment_card", with_kinds(open_conclusion))
        self.assertIn("decide.judgment must be written by ['user'] only, not ['ai', 'user']", problems)
        self.assertIn("decide.judgment.change_condition must be the person's own", problems)
        self.assertIn("decide.judgment.conclusion must be the person's own", problems)

    def test_a_judgment_that_can_be_deleted_or_made_twice_is_found(self):
        loose = dataclasses.replace(INTERFACE[0], singleton=False, deletable=True)
        self.assertEqual(sorted(self.run_slot("decide_judgment_card", with_kinds(loose))), ["decide.judgment must be one per case", "decide.judgment must keep every version (not deletable)"])

    def test_the_systems_listed_influences_may_be_kept_apart_from_the_persons_but_a_missing_field_is_named(self):
        judgment = INTERFACE[0]
        without = dataclasses.replace(judgment, fields={name: field for name, field in judgment.fields.items() if name != "influences_added"})
        self.assertEqual(self.run_slot("decide_judgment_card", with_kinds(without)), ["decide.judgment.influences_added is missing"])

    def test_a_core_conflict_the_ai_can_write_and_a_map_that_loses_a_version_are_found(self):
        mapped = INTERFACE[1]
        loose = DocKind("map.map", "MAP", "x", {**{name: Field(field.type) for name, field in mapped.fields.items()}}, singleton=True, deletable=True)
        problems = self.run_slot("map_claims_and_core", with_kinds(loose))
        self.assertEqual(sorted(problems), ["map.map must keep every version (not deletable)", "map.map.core_conflict must be the person's own"])

    def test_the_thinking_the_person_does_first_is_the_persons(self):
        round_ = INTERFACE[2]
        open_round = DocKind("think.round", "THINK", "x", {name: Field(field.type) for name, field in round_.fields.items()})
        self.assertEqual(sorted(self.run_slot("think_round", with_kinds(open_round))), ["think.round.own must be the person's own", "think.round.problem must be the person's own", "think.round.reflection must be the person's own"])

    def test_a_task_needs_a_date_and_a_notes_stance_is_the_persons(self):
        task = INTERFACE[4]
        dateless = dataclasses.replace(task, fields={**task.fields, "due": Field("text")})
        self.assertEqual(self.run_slot("act_task", with_kinds(dateless)), ["act.task.due must be a date"])
        notes = INTERFACE[3]
        open_stance = dataclasses.replace(notes, authors=frozenset({"user"}), fields={**notes.fields, "stance": Field("text")})
        self.assertEqual(self.run_slot("context_notes", with_kinds(open_stance)), ["context.notes.stance must be the person's own"])

    def test_the_contract_lists_exactly_what_can_be_granted_and_the_proposals_stay_the_systems(self):
        self.assertEqual(self.run_slot("contract_terms", Snapshot.live()), [])
        terms = Snapshot.live().kinds["collab_contract.terms"]
        narrower = dataclasses.replace(terms, fields={**terms.fields, "permissions": Field("choices", 6, choices=("rank",))})
        self.assertIn("collab_contract.terms.permissions must offer exactly", self.run_slot("contract_terms", with_kinds(narrower))[0])
        proposal = Snapshot.live().kinds["assembler.proposal.decide"]
        by_user = dataclasses.replace(proposal, authors=frozenset({"user"}))
        self.assertEqual(self.run_slot("collab_proposable", with_kinds(by_user)), ["assembler.proposal.decide must be written by ['system'] only, not ['user']"])
        without_collab = dataclasses.replace(proposal, fields={**proposal.fields, "propose": Field("choice", choices=("MAP",), required=True)})
        self.assertEqual(self.run_slot("collab_proposable", with_kinds(without_collab)), ["assembler.proposal.decide.propose must offer COLLAB"])

    def test_the_version_record_keeps_the_model_and_the_instructions_and_only_the_system_writes_it(self):
        self.assertEqual(self.run_slot("version_records", Snapshot.live()), [])
        record = Snapshot.live().kinds["govern.ai_call"]
        by_person = dataclasses.replace(record, authors=frozenset({"user"}), deletable=True)
        self.assertEqual(sorted(self.run_slot("version_records", with_kinds(by_person))), ["govern.ai_call must be written by ['system'] only, not ['user']", "govern.ai_call must keep every version (not deletable)"])


class TheRulesHaveVersions(unittest.TestCase):
    def test_the_latest_entry_is_what_the_rules_say_now(self):
        latest = integrity.RULES_HISTORY[-1]
        self.assertEqual(latest["fingerprint"], integrity.rules_fingerprint(), "the rules changed: add an entry to RULES_HISTORY with the new fingerprint")
        self.assertEqual(integrity.rules_version(), f"v{latest['version']}-{latest['fingerprint']}")

    def test_the_history_counts_up_with_a_date_and_a_reason_for_each_version(self):
        history = integrity.RULES_HISTORY
        self.assertEqual([entry["version"] for entry in history], list(range(1, len(history) + 1)))
        self.assertEqual([entry["date"] for entry in history], sorted(entry["date"] for entry in history))
        self.assertTrue(all(entry["change"] for entry in history))
        self.assertEqual(len({entry["fingerprint"] for entry in history}), len(history))

    def test_every_part_of_the_rules_moves_the_fingerprint(self):
        before = integrity.rules_fingerprint()
        changes = [
            mock.patch.object(integrity, "CONCLUSION_TOKENS", integrity.CONCLUSION_TOKENS | {"zzz"}),
            mock.patch.object(integrity, "GRADING_TOKENS", integrity.GRADING_TOKENS | {"zzz"}),
            mock.patch.object(integrity, "PREAMBLE_MUST", integrity.PREAMBLE_MUST + ("zzz",)),
            mock.patch.object(integrity, "KIND_READ_LIMITS", {**integrity.KIND_READ_LIMITS, ("ACT", "SENSE"): ("sense.state",)}),
            mock.patch.object(integrity, "DRAWER_READS", {**integrity.DRAWER_READS, "SENSE": ["map"]}),
            mock.patch.object(integrity, "RULES", {**integrity.RULES, "R1": "x"}),
            mock.patch.object(integrity, "SLOTS", {**integrity.SLOTS, "extra": ("DECIDE", "x.y", {}, {})}),
        ]
        for change in changes:
            with change:
                self.assertNotEqual(integrity.rules_fingerprint(), before)
        self.assertEqual(integrity.rules_fingerprint(), before)


class TheCopiedTablesMatchThePage(unittest.TestCase):
    """DRAWER_OWNER / DRAWER_READS are copies of the supervisor page's tables (the card's 「讀什麼」); the page is the source."""

    @unittest.skipUnless(PAGE.is_file(), "the supervisor page is not in this checkout")
    def test_owners_and_reads_are_the_pages(self):
        source = PAGE.read_text(encoding="utf-8")
        drawers = source[source.index("const DRAWERS = ["):source.index("const DRAWER_READS")]
        owners = {found.group(1): PAGE_OWNER_CODE.get(found.group(2), found.group(2)) for found in re.finditer(r'\{id:"(\w+)",\s*name:"[^"]*",.*?owner:"([^"]+)"', drawers)}
        self.assertEqual(integrity.DRAWER_OWNER, owners)
        reads_text = source[source.index("const DRAWER_READS = {"):]
        reads_text = reads_text[:reads_text.index("};")]
        reads = {PAGE_OWNER_CODE.get(found.group(1).strip('"'), found.group(1).strip('"')): re.findall(r'"(\w+|\*)"', found.group(2)) for found in re.finditer(r'("?[\w一-鿿]+"?):\[([^\]]*)\]', reads_text)}
        self.assertEqual(integrity.DRAWER_READS, reads)
        limits = source[source.index("const DRAWER_LIMIT = {"):]
        self.assertIn('"DECIDE:sense":"只讀情緒強度，不讀卡片內容"', limits[:limits.index("};")])


class TheRehearsalKeepsNothing(unittest.TestCase):
    def test_the_checks_that_save_leave_no_row_behind(self):
        """crisis_on_save and the others write a tenant, a case and its records for real, then roll it all back."""
        self.assertEqual(integrity.crisis_on_save(Snapshot.live(), PLATFORM), [])
        self.assertEqual(integrity.record_refuses_scores(Snapshot.live(), PLATFORM), [])
        with pg.Databases.from_env() as databases, databases.transaction(databases.directory_region) as connection:
            tables = [row[0] for row in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'alembic_version'")]
            left = {table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in tables}
        self.assertEqual({table: count for table, count in left.items() if count}, {})


class TheCommand(unittest.TestCase):
    def test_the_command_prints_the_table_and_answers_with_the_gate(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = integrity.main([])
        self.assertIn("BLOCK", out.getvalue())
        self.assertIn("上線關卡：", out.getvalue())
        self.assertEqual(status, 0 if integrity.gate_passed(integrity.run()) else 1)

    def test_the_gate_is_what_the_exit_status_says(self):
        failing = integrity.run(with_kinds(DocKind("sense.bad", "SENSE", "x", {"score": Field("int")})))
        with mock.patch.object(integrity, "run", return_value=failing), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(integrity.main([]), 1)

    def test_python_dash_m_runs_it_and_the_json_is_the_same_report(self):
        done = subprocess.run([sys.executable, "-m", "ai_lego.platform.integrity", "--json"], cwd=PRODUCT_ROOT, capture_output=True, timeout=300, check=False)
        report = json.loads(done.stdout.decode("utf-8"))
        self.assertEqual(report["rules_version"], integrity.rules_version())
        self.assertEqual(done.returncode, 0 if report["gate_passed"] else 1)
        self.assertEqual([row["block"] for row in report["rows"]], list(integrity.ROWS))


if __name__ == "__main__":
    unittest.main()
