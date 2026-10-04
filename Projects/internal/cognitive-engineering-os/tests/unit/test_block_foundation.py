"""The parts every block builds on: documents (kinds, versions, delete, the AI/joint authorship rule, the human-only
field), the AI gate (協作合約 permission, crisis stop, read whitelist, saved as the AI's), hooks (SENSE proposes VERIFY)
and the crisis notice on a save."""

from __future__ import annotations

import dataclasses
import json
import unittest
import uuid
from unittest.mock import patch

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, safety
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.pg import PgTestCase, add_tenant, dump
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class MirrorProvider:
    model = "test-mirror-model"

    def __init__(self, answer: dict | None = None) -> None:
        self.answer = answer or {"summary": "你寫了一件事和一個擔心。", "gaps": ["沒有一張卡講到錢，是沒發生還是沒寫？"], "question": "哪一張卡最重？", "extra": "dropped"}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


class DocKindRulesTests(unittest.TestCase):
    def test_a_kind_with_a_person_only_field_cannot_take_another_author(self):
        with self.assertRaisesRegex(InvariantViolation, "only the person authors it"):
            DocKind("x.y", "DECIDE", "t", {"conclusion": Field(human_only=True)}, authors=frozenset({"user", "ai"}))

    def test_the_ai_cannot_fill_a_person_only_field(self):
        kind = DocKind("x.z", "DECIDE", "t", {"conclusion": Field(human_only=True)})
        doc_kinds.kinds.cache_clear()
        original = doc_kinds.kinds
        try:
            doc_kinds.kinds = lambda: {**original(), "x.z": kind}   # type: ignore[assignment]
            with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
                doc_kinds.validate("x.z", {"conclusion": "do it"}, "ai")
            self.assertEqual(doc_kinds.validate("x.z", {"conclusion": "do it"}, "user"), {"conclusion": "do it"})
        finally:
            doc_kinds.kinds = original   # type: ignore[assignment]

    def test_unknown_fields_and_bad_choices_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_UNKNOWN"):
            doc_kinds.validate("sense.card", {"category": "事件", "text": "x", "score": 3}, "user")
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_INVALID"):
            doc_kinds.validate("sense.card", {"category": "不存在", "text": "x"}, "user")

    def test_json_shape_metadata_only_names_supported_shapes_on_json_fields(self):
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_SHAPE_INVALID"):
            Field("text", shape="object")
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_SHAPE_INVALID"):
            Field("json", shape="scalar")
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_SHAPE_INVALID"):
            Field("json", shape=None)
        self.assertEqual(Field("json").shape, "")  # intentionally untyped JSON remains possible for a future contract

    def test_every_registered_json_field_has_a_shape_and_rejects_the_other_shape_on_save(self):
        fields = [(kind, name, spec) for kind in doc_kinds.kinds().values() for name, spec in kind.fields.items() if spec.type == "json"]
        self.assertTrue(fields)
        for kind, name, spec in fields:
            with self.subTest(kind=kind.kind, field=name):
                self.assertIn(spec.shape, ("object", "array"))  # no any-JSON exceptions among registered kinds
                single = DocKind(kind.kind, kind.block, kind.title, {name: spec})
                good = {"example": 1} if spec.shape == "object" else [{"example": 1}]
                wrong = ([{"example": 1}], []) if spec.shape == "object" else ({"example": 1}, {})
                with patch.object(doc_kinds, "require", return_value=single):
                    self.assertEqual(doc_kinds.validate(kind.kind, {name: good}, "user"), {name: good})
                    for value in (*wrong, "bad"):
                        with self.assertRaisesRegex(InvariantViolation, f"DOC_FIELD_INVALID: {kind.kind}\\.{name}.*{spec.shape}"):
                            doc_kinds.validate(kind.kind, {name: value}, "user")

    def test_every_kind_and_action_loads(self):
        self.assertIn("sense.card", doc_kinds.kinds())
        self.assertIn(("SENSE", "mirror"), ai_gate.actions())


class WebBlockListTests(PgTestCase):
    """apps/cognitive-web/lib/blocks.ts names the blocks for the pages; the codes, their order and which are open come
    from the engine (core/domain/blocks.py, kinds/assembler.py OPEN_BLOCKS)."""

    def test_the_pages_list_the_engines_blocks_and_open_ones(self):
        import re
        from ai_lego import PRODUCT_ROOT
        from ai_lego.core.domain.blocks import BLOCKS
        from ai_lego.core.domain.kinds.assembler import BUILD_STEP, OPEN_BLOCKS

        text = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "blocks.ts").read_text(encoding="utf-8")
        rows = re.findall(r'\{ code: "([A-Z]+)", n: (\d+),.*?step: (\d+) \}', text)
        self.assertEqual([code for code, _, _ in rows], list(BLOCKS))
        self.assertEqual([int(n) for _, n, _ in rows], list(range(1, len(BLOCKS) + 1)))
        self.assertEqual(sorted(code for code, _, step in rows if int(step) <= BUILD_STEP), sorted(OPEN_BLOCKS))
        self.assertIn(f"export const OPEN_STEP = {BUILD_STEP};", text)

    def test_every_open_block_has_its_page(self):
        """The 下一塊 button links /projects/{id}/<path>; an open block with no page would be a 404 (critic 2026-10-03 m7)."""
        import re
        from ai_lego import PRODUCT_ROOT
        from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS

        web = PRODUCT_ROOT / "apps" / "cognitive-web"
        paths = dict(re.findall(r'\{ code: "([A-Z]+)", n: \d+,.*?path: "([a-z]+)"', (web / "lib" / "blocks.ts").read_text(encoding="utf-8")))
        missing = [code for code in OPEN_BLOCKS if not (web / "app" / "(shell)" / "projects" / "[id]" / paths[code] / "page.tsx").is_file()]
        self.assertEqual(missing, [])

    def test_every_refusal_a_block_can_give_has_a_sentence(self):
        """拒收用人話: every code the blocks, the gate and the record raise is in lib/errors.ts CODES, or named here as a
        programming error no person can cause from a page (a kind or an action declared wrong, a writer missing)."""
        import re
        from ai_lego import PRODUCT_ROOT

        internal = {"AI_ACTION_DUPLICATE", "AI_ACTION_INVALID", "AI_READ_REFUSED", "DOC_BATCH_CHECK_NEEDS_A_CASE", "DOC_CONTENT_NOT_NORMALISED", "DOC_FIELD_SHAPE_INVALID", "DOC_KIND_DUPLICATE", "DOC_KIND_INVALID",
                    "DOC_KIND_NOT_SINGLETON", "DOC_SINGLETON_BROKEN", "RECORD_AUTHOR_IDENTITY_REQUIRED", "RECORD_AUTHOR_INVALID", "RECORD_BLOCK_NOT_ALLOWED",
                    "RECORD_OWNER_INVALID", "RECORD_OWNER_NOT_ALLOWED", "RECORD_TYPE_UNREGISTERED", "RECORD_WRITER_AND_OWNER_REQUIRED",
                    "AI_SOURCES_UNAVAILABLE", "EVIDENCE_CELL_INVALID", "RULESET_DUPLICATE", "RULESET_INVALID", "RULESET_CHANGED_WITHOUT_VERSION", "RULESET_UNKNOWN"}
        lego = PRODUCT_ROOT / "ai_lego"
        sources = [*(lego / "platform" / "block_hooks").glob("*.py"), *(lego / "platform" / "ai_actions").glob("*.py"), *(lego / "apps" / "api" / "blocks").glob("*.py"),
                   lego / "platform" / "ai_gate.py", lego / "platform" / "evidence.py", lego / "core" / "domain" / "evidence_words.py", *(lego / "platform" / "rulesets").glob("*.py"),
                   lego / "core" / "domain" / "doc_kinds.py", lego / "data" / "repositories" / "case_docs.py", lego / "data" / "events" / "record_log.py"]
        raised = {code for path in sources for code in re.findall(r'(?:InvariantViolation|AiRefused)\(f?"([A-Z][A-Z0-9_]+)|detail=f?"([A-Z][A-Z0-9_]+)', path.read_text(encoding="utf-8")) for code in code if code}
        sentences = set(re.findall(r"^  ([A-Z][A-Z0-9_]+): \"", (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "errors.ts").read_text(encoding="utf-8"), re.M))
        self.assertGreater(len(raised), 40)
        self.assertEqual(sorted(raised - sentences - internal), [])
        self.assertEqual(sorted(internal - raised), [])   # a name listed here that nothing raises any more goes

    def test_only_the_shell_says_which_block_is_next(self):
        """「下一塊」 comes from the case's route (the person's own order + accepted proposals), drawn by BlockShell. A page
        that writes its own next link contradicts it (2026-10-03: SENSE said 拆解 while the case's next was 共思考)."""
        from ai_lego import PRODUCT_ROOT

        pages = sorted((PRODUCT_ROOT / "apps" / "cognitive-web" / "components" / "blocks").glob("*Page.tsx"))
        self.assertTrue(pages)
        self.assertEqual([page.name for page in pages if "下一塊" in page.read_text(encoding="utf-8")], [])

    def test_the_intake_page_offers_the_engines_purposes_and_packages(self):
        import re
        from ai_lego import PRODUCT_ROOT
        from ai_lego.core.domain.kinds.assembler import PACKAGE_OPENS_AT, PACKAGES, PURPOSE_PACKAGE, PURPOSES

        text = (PRODUCT_ROOT / "apps" / "cognitive-web" / "components" / "blocks" / "IntakePage.tsx").read_text(encoding="utf-8")
        rows = re.findall(r'\{ purpose: "([^"]+)", package: "([^"]+)", blocks: \[([^\]]*)\], opens: (\d+),', text)
        self.assertEqual([purpose for purpose, *_ in rows], list(PURPOSES))
        for purpose, package, blocks, opens in rows:
            self.assertEqual(package, PURPOSE_PACKAGE[purpose])
            self.assertEqual(tuple(re.findall(r'"([A-Z]+)"', blocks)), PACKAGES[package], package)
            self.assertEqual(int(opens), PACKAGE_OPENS_AT[package], package)

    def test_a_high_risk_intake_adds_the_guardrails_once(self):
        from ai_lego.data.repositories.case_docs import CaseDocs
        from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
        from ai_lego.platform.block_hooks import after_save
        from tests.unit.case_fixture import a_case

        tenant = add_tenant(self.databases, str(uuid.uuid4()))
        repo = ProjectSourceRepository(self.databases)
        docs, owner = CaseDocs(repo), a_case(repo, tenant, "P")
        intake = docs.save(tenant, owner, "assembler.intake", {"purpose": "複雜決策", "question": "要不要續約", "risk": "合約和錢", "package": "個人複雜決策"}, record_log.user("me", "ASSEMBLER"))
        notices = after_save(docs, tenant, owner, intake)
        self.assertEqual([notice["category"] for notice in notices], ["法律", "金錢"])
        self.assertEqual(len(docs.current(tenant, owner, "govern.guardrail")), 6)
        self.assertEqual(after_save(docs, tenant, owner, intake), [])


class AiPathTests(unittest.TestCase):
    """呼叫 AI 的兩條路共用同一個權限檢查：命令列那條只給內部研究用；它要讀案子，一樣要過權限檢查（今天它只碰測試用的組織，是
    習慣，不是規定）. The rule: nothing on the command-line path (any module importing ai_execution.gateway) can reach a
    case store, directly or through what it imports; a command line that needs a case calls ai_gate.ask_ai instead."""

    CASE_STORES = ("ai_lego.data.repositories.project_source_repository", "ai_lego.data.repositories.case_docs", "ai_lego.apps.api")

    def test_the_command_line_ai_path_cannot_reach_a_case(self):
        import ast
        from ai_lego import PRODUCT_ROOT

        files = {".".join(path.relative_to(PRODUCT_ROOT).with_suffix("").parts).removesuffix(".__init__"): path
                 for path in (PRODUCT_ROOT / "ai_lego").rglob("*.py")}

        def imports(module):
            found = set()
            for node in ast.walk(ast.parse(files[module].read_text(encoding="utf-8"))):
                if isinstance(node, ast.Import):
                    found |= {alias.name for alias in node.names}
                elif isinstance(node, ast.ImportFrom) and node.module:
                    found |= {node.module, *(f"{node.module}.{alias.name}" for alias in node.names)}
            parents = {".".join(name.split(".")[:i]) for name in found for i in range(1, name.count(".") + 1)}   # a.b.c runs a/__init__, a/b/__init__
            return {name for name in found | parents if name in files}

        def reach(start):
            seen, todo = set(), [start]
            while todo:
                module = todo.pop()
                if module not in seen:
                    seen.add(module)
                    todo += imports(module)
            return seen

        cli = sorted(module for module in files if "ai_lego.platform.ai_execution.gateway" in imports(module))
        self.assertIn("ai_lego.modules.research.ai_coding", cli)
        leaks = {module: sorted(found for found in reach(module) if found.startswith(self.CASE_STORES)) for module in cli}
        self.assertEqual({module: found for module, found in leaks.items() if found}, {})


class ProposalWordsTests(unittest.TestCase):
    def test_every_proposal_says_fixed_words(self):
        """A proposal is kept for good, so its ``why`` is a literal or a module CONSTANT in every block's hook -- never
        text built from what the person wrote (an f-string, a concatenation, a variable): see block_hooks/__init__.py."""
        import ast
        from ai_lego import PRODUCT_ROOT

        bad = []
        for path in sorted((PRODUCT_ROOT / "ai_lego" / "platform" / "block_hooks").glob("*.py")):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.Call) and getattr(node.func, "id", getattr(node.func, "attr", None)) == "propose":
                    why = node.args[5] if len(node.args) > 5 else next((k.value for k in node.keywords if k.arg == "why"), None)
                    fixed = (isinstance(why, ast.Constant) and isinstance(why.value, str)) or (isinstance(why, ast.Name) and why.id.isupper())
                    if not fixed:
                        bad.append(f"{path.name}:{node.lineno}")
        self.assertEqual(bad, [])


class SafetyTests(unittest.TestCase):
    def test_signals_and_places(self):
        self.assertTrue(safety.crisis_signal("最近真的不想活了"))
        self.assertFalse(safety.crisis_signal("合夥人又改條件"))
        self.assertIn("1925", [item["contact"] for item in safety.resources("台灣台北")])
        self.assertNotIn("1925", [item["contact"] for item in safety.resources(None)])

    def test_a_signal_typed_across_two_lines_is_seen_in_what_the_ai_is_sent(self):
        """critic 2026-10-03 (THINK C1): the gate checks the JSON it sends, where a line break is the two characters \\n."""
        for text in ("不想\n活", "我不想\r\n活了", "I want to\ndie", "想\t自殺"):
            self.assertTrue(safety.crisis_signal(json.dumps({"own": [text]}, ensure_ascii=False)), repr(text))
        self.assertFalse(safety.crisis_signal(json.dumps({"own": ["合夥人\n又改條件"]}, ensure_ascii=False)))


class BlockFoundationApiTests(ProjectSourceApiTestCase):
    FRESH_TABLES = True   # a test reads the whole database for a deleted card's words

    def setUp(self):
        super().setUp()
        self.provider = MirrorProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def _card(self, text="合夥人第三次改條件", category="事件"):
        response = self.client.post(f"{self.base}/docs/sense.card", json={"content": {"category": category, "text": text}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_a_card_is_mine_versioned_and_deletable(self):
        card = self._card()
        self.assertEqual((card["author"], card["block"], card["version"]), ("user", "SENSE", 1))
        edited = self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": "他第三次改條件"}, "base_version": 1}).json()
        self.assertEqual(edited["version"], 2)
        stale = self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": "x"}, "base_version": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(len(self.client.get(f"{self.base}/docs/sense.card/{card['doc_id']}/versions").json()), 2)
        self.assertEqual(self.client.delete(f"{self.base}/docs/sense.card/{card['doc_id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{self.base}/docs/sense.card").json(), [])
        history = self.client.get(f"{self.base}/history").json()   # the case's own stream; the card's content is gone from every row
        self.assertNotIn("第三次改條件", "\n".join(dump(self.databases)))

    def test_someone_elses_claim_proposes_verify(self):
        card = self._card("聽說同業都這樣改")
        self.assertEqual([(n["type"], n["propose"], n["open"]) for n in card["notices"]], [("proposal", "VERIFY", False)])
        self.assertEqual(self._card("網路上寫他們常這樣")["notices"], [])   # one open proposal at a time

    def test_a_crisis_word_in_a_card_brings_help(self):
        card = self._card("我不想活了")
        self.assertEqual(card["notices"][0]["type"], "crisis")

    def test_the_mirror_is_the_ais_and_my_unchanged_confirmation_stays_the_ais(self):
        self._card()
        turn = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}})
        self.assertEqual(turn.status_code, 200, turn.text)
        mirror = turn.json()["saved"]
        self.assertEqual((mirror["author"], mirror["kind"]), ("ai", "sense.mirror"))
        self.assertNotIn("extra", mirror["content"])
        system, user = self.provider.calls[0]
        self.assertIn("Never write the person's conclusion", system)
        self.assertIn("合夥人第三次改條件", user)
        same = self.client.put(f"{self.base}/docs/sense.mirror/{mirror['doc_id']}", json={"content": mirror["content"], "base_version": 1}).json()
        self.assertEqual(same["author"], "ai")
        rewritten = self.client.put(f"{self.base}/docs/sense.mirror/{mirror['doc_id']}", json={"content": {**mirror["content"], "summary": "我改過"}, "base_version": 2}).json()
        self.assertEqual(rewritten["author"], "joint")
        calls = self.client.get(f"{self.base}/docs/govern.ai_call").json()   # 版本紀錄: which model, which instructions
        self.assertEqual([(call["content"]["block"], call["content"]["model"], len(call["content"]["instructions_sha256"])) for call in calls], [("SENSE", "test-mirror-model", 64)])

    def test_a_crisis_stops_the_ai_before_any_call(self):
        self._card("我想結束自己")
        turn = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json()
        self.assertEqual(turn["stopped"], "crisis")
        self.assertEqual(self.provider.calls, [])
        self.assertEqual([doc["content"]["reason"] for doc in self.client.get(f"{self.base}/docs/govern.stop").json()], ["crisis"])

    def test_the_contract_decides_what_the_ai_may_do(self):
        from ai_lego.core.domain.kinds.collab_contract import GRANTABLE
        action = ai_gate.AiAction(block="SENSE", name="t", needs="counter", instructions="", output_kind="sense.mirror", output_schema={},
                                  reads=(), build_input=lambda c, r: "")
        from ai_lego.data.repositories.case_docs import CaseDocs
        docs = CaseDocs(self._repo)
        with self.assertRaisesRegex(InvariantViolation, "AI_PERMISSION_DENIED"):
            ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=docs, provider=self.provider)
        self.assertEqual(self.provider.calls, [])
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["counter"]}})
        ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=docs, provider=self.provider)
        self.assertEqual(len(self.provider.calls), 1)
        self.assertIn("counter", GRANTABLE)

    def test_an_action_reads_only_what_its_card_allows(self):
        action = ai_gate.AiAction(block="SENSE", name="peek", needs="organize", instructions="", output_kind="sense.mirror", output_schema={},
                                  reads=("sense.card",), build_input=lambda c, read: str(read("assembler.intake")))
        from ai_lego.data.repositories.case_docs import CaseDocs
        with self.assertRaisesRegex(InvariantViolation, "AI_READ_REFUSED"):
            ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=CaseDocs(self._repo), provider=self.provider)

    def test_a_crisis_anywhere_in_what_the_model_would_read_stops_it(self):
        """critic 2026-10-03: the strongest-emotion note went to the model unchecked."""
        self._card()
        self.client.post(f"{self.base}/docs/sense.state", json={"content": {"emotion": "絕望", "intensity": "強", "distance_note": "十年後我已經不想活了"}})
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json().get("stopped"), "crisis")
        self.assertEqual(self.provider.calls, [])

    def test_an_ai_turn_can_read_the_record_as_it_was_then(self):
        """critic 2026-10-03 (LEARN M3): comparing with 「當初的判斷」 needs the version written then, not the current one."""
        from ai_lego.data.repositories.case_docs import CaseDocs
        card = self._card("第一版的字")
        self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": "第二版的字"}, "base_version": 1})
        mirror = ai_gate.actions()[("SENSE", "mirror")]
        seen: list[list[str]] = []
        probe = dataclasses.replace(mirror, build_input=lambda context, read: seen.append([doc["content"]["text"] for doc in read("sense.card", every_version=True)]) or "x")
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        ai_gate.ask_ai(probe, tenant_id=self.tenant["tenant_id"], identity_id=self.identity["identity_id"], project_id=self.pid, context={}, docs=CaseDocs(repo), provider=self.provider)
        self.assertEqual(seen, [["第一版的字", "第二版的字"]])

    def test_an_answer_that_could_not_be_kept_where_it_was_asked_is_refused_before_the_model(self):
        """worker 丁: an action whose answer is kept for the person, asked inside a case, paid for a model call and then
        failed on the save."""
        from ai_lego.data.repositories.case_docs import CaseDocs
        personal = next(action for action in ai_gate.actions().values() if doc_kinds.require(action.output_kind).owner == "person")
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        with self.assertRaises(ai_gate.AiRefused):
            ai_gate.ask_ai(personal, tenant_id=self.tenant["tenant_id"], identity_id=self.identity["identity_id"], project_id=self.pid, context={}, docs=CaseDocs(repo), provider=self.provider)
        self.assertEqual(self.provider.calls, [])

    def test_the_contracts_own_terms_reach_the_model_and_are_checked_too(self):
        """worker 乙 2026-10-03: only the permissions reached the model; scope, the parts the person keeps and the
        hand-back condition never did. They are the person's words, so they go through the crisis check like the rest."""
        self._card()
        terms = {"scope": "釐清", "human_parts": "要不要續約由我決定", "handback": "我說停就停", "permissions": []}
        contract = self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": terms}).json()
        self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}})
        system, user = self.provider.calls[-1]
        self.assertIn("要不要續約由我決定", user)
        self.assertIn("我說停就停", user)
        self.assertIn("hand-back condition", system)
        self.client.put(f"{self.base}/docs/collab_contract.terms/{contract['doc_id']}", json={"content": {**terms, "handback": "我不想活了就停"}, "base_version": 1})
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json().get("stopped"), "crisis")
        self.assertEqual(len(self.provider.calls), 1)

    def test_one_contract_one_intake_one_state_per_case(self):
        self.assertEqual(self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": []}}).status_code, 200)
        second = self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["counter"]}})
        self.assertEqual(second.status_code, 409, second.text)

    def test_a_proposal_is_the_systems_and_the_answer_is_mine(self):
        forged = self.client.post(f"{self.base}/docs/assembler.proposal.decide", json={"content": {"propose": "ACT", "why": "forged"}})
        self.assertEqual(forged.status_code, 403)
        proposal = self._card("聽說同業都這樣改")["notices"][0]
        self.assertEqual(len(self.client.get(f"{self.base}/proposals").json()), 1)
        answer = self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": proposal["doc_id"], "answer": "declined"}}).json()
        self.assertEqual(answer["author"], "user")
        self.assertEqual(self.client.get(f"{self.base}/proposals").json(), [])
        stored = self.client.get(f"{self.base}/docs/{proposal['kind']}").json()[0]
        self.assertEqual(stored["author"], "system")

    def test_the_route_is_my_order_plus_what_i_accepted_and_shows_what_i_did(self):
        self.assertEqual(self.client.get(f"{self.base}/route").json(), {"purpose": None, "package": None, "blocks": [], "done": []})
        gone = self._card()
        self.assertEqual(self.client.delete(f"{self.base}/docs/sense.card/{gone['doc_id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{self.base}/route").json()["done"], [])   # a tombstone is not 做過
        intake = {"purpose": "自我理解", "question": "要不要續約", "package": "自我理解", "blocks": ["SENSE", "THINK", "MAP"]}   # reordered, two skipped
        self.assertEqual(self.client.post(f"{self.base}/docs/assembler.intake", json={"content": intake}).status_code, 200)
        verify = next(n for n in self._card("聽說他們也找了律師")["notices"] if n["type"] == "proposal")
        answer = lambda proposal, value: self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": proposal, "answer": value}})
        self.assertEqual(answer(verify["doc_id"], "accepted").status_code, 400)   # VERIFY is not built: 不能加
        self.assertEqual(answer("no-such-proposal", "declined").status_code, 404)
        self.assertEqual(answer(verify["doc_id"], "declined").status_code, 200)
        self.assertEqual(answer(verify["doc_id"], "declined").status_code, 409)   # one answer per proposal; change that one
        self.assertEqual(self._card("聽說同業都這樣改")["notices"], [])   # 不用 = not asked again in this case
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        from ai_lego.data.repositories.case_docs import CaseDocs
        from ai_lego.platform.block_hooks import propose
        ask = lambda by: propose(CaseDocs(repo), self.tenant["tenant_id"], record_log.case(self.pid), by, "DECIDE", "要比較幾個選項時，可以加判斷。")
        decide = ask("MAP")[0]
        self.assertEqual(ask("SENSE"), [])   # one standing proposal per block, whoever found it
        self.assertEqual(answer(decide["doc_id"], "accepted").status_code, 200)
        self.assertEqual(ask("MAP"), [])   # DECIDE is in the case now: never proposed again
        route = self.client.get(f"{self.base}/route").json()
        self.assertEqual([item["code"] for item in route["blocks"]], ["SENSE", "THINK", "MAP", "DECIDE"])
        self.assertEqual(route["blocks"][0]["why"], {"from": "package", "package": "自我理解"})
        self.assertEqual(route["blocks"][3]["why"], {"from": "proposal", "by": "MAP", "text": "要比較幾個選項時，可以加判斷。"})
        self.assertEqual([(item["open"], item["done"]) for item in route["blocks"]], [(True, True), (True, False), (True, False), (True, False)])
        self.assertEqual(route["done"], ["SENSE"])

    def test_only_made_things_mark_a_slot_and_stored_answers_for_unbuilt_blocks_stay_out(self):
        """critic 2026-10-03 m5: a failed request marked its block 做過; M1: the route took a block not built yet."""
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        tenant, case = self.tenant["tenant_id"], record_log.case(self.pid)
        me = self.identity["identity_id"]
        repo.append_event(tenant, self.pid, "InterpretationRequested", {"interpretation_id": "I-1"}, record_log.user(me, "MAP"))
        self.assertEqual(self.client.get(f"{self.base}/route").json()["done"], [])   # asked, nothing made yet
        repo.append_event(tenant, self.pid, "InterpretationCreated", {"interpretation_id": "I-1"}, record_log.ai("MAP"))
        self.assertEqual(self.client.get(f"{self.base}/route").json()["done"], ["MAP"])
        from ai_lego.data.repositories.case_docs import CaseDocs
        self.client.post(f"{self.base}/docs/assembler.intake", json={"content": {"purpose": "自我理解", "question": "q", "package": "自我理解", "blocks": ["SENSE"]}})
        verify = self._card("聽說要漲價")["notices"][0]
        CaseDocs(repo).save(tenant, case, "assembler.answer", {"proposal": verify["doc_id"], "answer": "accepted"}, record_log.user(me, "ASSEMBLER"))   # past the check
        self.assertEqual([item["code"] for item in self.client.get(f"{self.base}/route").json()["blocks"]], ["SENSE"])

    def test_a_proposal_keeps_none_of_my_words(self):
        """critic 2026-10-03 M2: SENSE quoted the card into the proposal, which is never deleted -- the quote outlived the
        card. A proposal says the block's own words and points at the card by id."""
        card = self._card("聽說王小明要告我們")
        proposal = card["notices"][0]
        self.assertNotIn("王小明", proposal["why"])
        stored = self.client.get(f"{self.base}/docs/{proposal['kind']}").json()[0]
        self.assertEqual(stored["content"]["source"], card["doc_id"])
        self.client.delete(f"{self.base}/docs/sense.card/{card['doc_id']}")
        self.assertNotIn("王小明", json.dumps(self.client.get(f"{self.base}/proposals").json(), ensure_ascii=False))

    def test_the_mirror_marks_only_the_seven_signals_with_the_cards_own_questions(self):
        self.provider.answer = {"summary": "s", "gaps": ["a", "b", "c", "d"], "explore": [{"signal": "x", "question": "你是不是童年創傷？"}, {"signal": "身份", "question": "自己編的問題"}]}
        self._card()
        mirror = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json()["saved"]
        from ai_lego.platform.ai_actions.sense import SIGNAL_QUESTIONS
        self.assertEqual(mirror["content"]["explore"], [{"signal": "身份", "question": SIGNAL_QUESTIONS["身份"]}])
        self.assertEqual(len(mirror["content"]["gaps"]), 3)

    def test_a_broken_model_answer_is_the_models_failure(self):
        self.provider.answer = {"summary": ""}
        self._card()
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).status_code, 502)

    def test_a_colleague_reaches_none_of_it(self):
        self._card()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/docs/sense.card").status_code, 404)
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/route").status_code, 404)

    def test_the_ai_cannot_post_as_itself_and_unknown_kinds_are_404(self):
        self.assertEqual(self.client.get(f"{self.base}/docs/nope.kind").status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/docs/govern.location").status_code, 404)   # a person's kind, not a case's
        guardrail = self.client.post(f"{self.base}/docs/govern.guardrail", json={"content": {"guardrail": "professional", "category": "健康", "found_by": "SENSE"}})
        self.assertEqual(guardrail.status_code, 403)   # system-only: a person cannot write GOVERN's guardrail


if __name__ == "__main__":
    unittest.main()


class WhatIsNotReadForRiskTests(unittest.TestCase):
    """critic 2026-10-03 (DECIDE/ACT/LEARN M1): system words and places must not become guardrails; each kind says so on
    its own fields (labels / scan / unread_keys), GOVERN's one scanner reads only that."""

    def test_system_words_and_places_add_no_guardrail_but_the_persons_words_do(self):
        from ai_lego.platform.block_hooks.govern import written
        from ai_lego.platform.safety.risk import high_risk_categories

        quiet = [
            {"kind": "decide.judgment", "content": {"influences_asked": [{"who": "法律", "answer": "沒有"}]}},
            {"kind": "context.notes", "content": {"jurisdictions": ["台北地方法院管轄"]}},
            {"kind": "map.map", "content": {"layers": {"facts": [{"id": "f1", "text": "他又改了時間", "by": "user", "place": "法院附近"}]}}},
        ]
        for doc in quiet:
            self.assertEqual(high_risk_categories(*written(doc)), [], doc["kind"])
        loud = {"kind": "map.map", "content": {"layers": {"facts": [{"id": "f1", "text": "他說要提告", "by": "user", "place": "台北"}]}}}
        self.assertEqual(high_risk_categories(*written(loud)), ["法律"])

    def test_crisis_help_comes_alone_outside_a_case(self):
        from ai_lego.platform.block_hooks.govern import _recognise
        doc = {"doc_id": "d", "kind": "learn.daily", "version": 1, "content": {"about": "情緒", "text": "我不想活了"}, "author": "user", "block": "LEARN", "at": ""}
        self.assertEqual(_recognise(None, "t", record_log.person("me"), doc), [])   # the save brings help; 「開一個案子」 is not the next step

    def test_a_crisis_word_in_a_json_key_is_read_on_save(self):
        from ai_lego.platform.block_hooks.govern import strings
        self.assertTrue(safety.crisis_signal(*strings({"one_lines": {"我想自殺": "x"}}, keys=True)))
        self.assertFalse(safety.crisis_signal(*strings({"one_lines": {"我想自殺": "x"}})))


class ErasureOfRecordsFromACaseTests(ProjectSourceApiTestCase):
    def test_erasing_a_case_erases_the_personal_line_made_from_it(self):
        """critic 2026-10-03 (LEARN M5): learn.history is the person's, not deletable, made from one case -- it outlived
        the case and kept feeding the patterns. A kind's from_case names the case it came from."""
        self._login()
        keep, gone = self._create_project(name="留下的")["project_id"], self._create_project(name="刪掉的")["project_id"]
        for pid in (keep, gone):
            self.assertEqual(self.client.post(f"/projects/{pid}/learn/history").status_code, 200)
        self.assertEqual(sorted(doc["content"]["project"] for doc in self.client.get("/me/docs/learn.history").json()), sorted([keep, gone]))
        self.assertEqual(self.client.delete(f"/projects/{gone}").status_code, 200)
        self.assertEqual([doc["content"]["project"] for doc in self.client.get("/me/docs/learn.history").json()], [keep])

    def test_from_case_must_name_a_field_of_a_persons_record(self):
        with self.assertRaises(InvariantViolation):
            DocKind("x.bad", "LEARN", "x", {"project": Field("text")}, from_case="project")   # a case's own record
        with self.assertRaises(InvariantViolation):
            DocKind("x.bad", "LEARN", "x", {"project": Field("text")}, owner="person", from_case="case")


class CheckTighteningTests(unittest.TestCase):
    """critic 2026-10-03 (M6/m7): the pre-launch check's two refinements must not open holes."""

    def test_a_confidence_number_the_ai_may_write_fails_and_a_version_pointer_does_not(self):
        from ai_lego.platform import integrity
        live = integrity.Snapshot.live()
        bad = DocKind("decide.bad", "DECIDE", "x", {"confidence": Field("int", 100), "judgment_version": Field("int", 100)}, authors=frozenset({"user", "ai"}))
        snap = dataclasses.replace(live, kinds={**live.kinds, bad.kind: bad})
        self.assertEqual([p for p in integrity.human_only_conclusions(snap, "DECIDE") if p.startswith("decide.bad")], ["decide.bad.confidence holds a conclusion and the AI can write it"])

    def test_a_save_handed_to_a_helper_or_written_as_the_system_into_a_persons_kind_counts_as_the_persons(self):
        import tempfile
        from pathlib import Path
        from ai_lego.platform import integrity
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "handed.py").write_text("def f(docs):\n    return _call(docs.save, 't', o, 'sense.card', {}, me)\n", encoding="utf-8")
            Path(folder, "posing.py").write_text("def f(docs):\n    docs.save('t', o, 'sense.card', {}, record_log.system('SENSE'))\n", encoding="utf-8")
            Path(folder, "system.py").write_text("def f(docs):\n    docs.save('t', o, 'learn.history', {}, record_log.system('LEARN'))\n", encoding="utf-8")
            Path(folder, "ai.py").write_text("def f(docs):\n    docs.save('t', o, 'think.card', {}, record_log.ai('THINK'))\n", encoding="utf-8")
            flagged = sorted(problem.split(" ")[0] for problem in integrity.unsafe_route_modules(Path(folder)))
        self.assertEqual(flagged, ["handed.py", "posing.py"])
