"""R1 and blind write (docs/platform/STEP34_SHARED_RULES.md §3, card 11) on a real group of three, and the gates that keep
every read of another person's record in platform/visibility.py."""

from __future__ import annotations

import ast
import shutil
import tempfile
import uuid
from collections import Counter
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data.events import record_log
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import visibility
from ai_lego.platform.visibility import Viewer
from tests.unit.test_groups_core import GroupCase, make_people, registered

POSITION = DocKind("collab.s34_position", "COLLAB", "立場", {"round": Field("text", 20, required=True), "text": Field("text", 500, human_only=True)},
                   owner="group", blind="round")
BY_VISIBILITY = {value: DocKind(f"collab.s34_{value}", "COLLAB", value, {"text": Field("text", 500)}, owner="group", visibility=value)
                 for value in ("members", "author_only", "convener_and_author", "self_and_govern")}

LEGO = PRODUCT_ROOT / "ai_lego"
SCANNED = ("apps/api/blocks", "platform/ai_actions", "platform/block_hooks")
# (a) Every use of a person's, a group's or the platform's owner in the routes, the AI actions and the hooks, reviewed: why
# it is the caller's own record, a membership-checked group or a write checked by its route. A new use fails until it is
# read and added here.
REVIEWED_OWNER_USES = {
    ("apps/api/blocks/act.py", "record_log.person(session['identity_id'])"): "/me/reminders: the signed-in person's own practice records",
    ("apps/api/blocks/collab.py", "record_log.group(group_id)"): "_owner: called only after groups.member_group let the caller in (or, to delete, after visible() found their own record: G3)",
    ("apps/api/blocks/docs.py", "record_log.person(identity_id)"): "_where: called with the session's identity only (docs.py _save)",
    ("apps/api/blocks/docs.py", "record_log.person(session['identity_id'])"): "/me/docs/*: the signed-in person's own records",
    ("apps/api/blocks/facilitate.py", "record_log.platform(session['tenant_id'])"): "_platform: a link is written (after the route's own checks) or taken back (CaseDocs: only its writer) -- never read here, visibility.py reads it",
    ("apps/api/blocks/govern.py", "record_log.person(session['identity_id'])"): "/govern/help: the signed-in person's own saved place",
    ("apps/api/blocks/govern.py", "record_log.person(me)"): "/govern/export: me = the session's identity",
    ("apps/api/blocks/govern_group.py", "record_log.person(session['identity_id'])"): "_mine: /me/consents, the signed-in person's own consents",
    ("apps/api/blocks/govern_group.py", "record_log.platform(tenant_id)"): "POST /me/appeals: a write only, after the participant/facilitator check; read back by appeals_for",
    ("apps/api/blocks/govern_group.py", "record_log.platform(session['tenant_id'])"): "DELETE /me/appeals: only after appeals_for says it is the caller's own; CaseDocs re-checks the sole writer",
    ("apps/api/blocks/learn.py", "record_log.person(identity_id)"): "_history: called with the session's identity only",
    ("apps/api/blocks/learn.py", "record_log.person(session['identity_id'])"): "learn.history save: the signed-in person's own",
    ("apps/api/blocks/teach.py", "record_log.person(session['identity_id'])"): "/blocks/teach/practice-cases: the signed-in person's own saved place",
    ("platform/block_hooks/facilitate.py", "record_log.person(facilitator)"): "drift_records: a consenting facilitator's own logs, only the deviated part, only when every participant of the log's group consented too",
}
REVIEWED_COUNTS = Counter({
    ("apps/api/blocks/act.py", "record_log.person(session['identity_id'])"): 1,
    ("apps/api/blocks/collab.py", "record_log.group(group_id)"): 1,
    ("apps/api/blocks/docs.py", "record_log.person(identity_id)"): 1,
    ("apps/api/blocks/docs.py", "record_log.person(session['identity_id'])"): 5,
    ("apps/api/blocks/facilitate.py", "record_log.platform(session['tenant_id'])"): 1,
    ("apps/api/blocks/govern.py", "record_log.person(session['identity_id'])"): 1,
    ("apps/api/blocks/govern.py", "record_log.person(me)"): 1,
    ("apps/api/blocks/govern_group.py", "record_log.person(session['identity_id'])"): 1,
    ("apps/api/blocks/govern_group.py", "record_log.platform(tenant_id)"): 1,
    ("apps/api/blocks/govern_group.py", "record_log.platform(session['tenant_id'])"): 1,
    ("apps/api/blocks/learn.py", "record_log.person(identity_id)"): 1,
    ("apps/api/blocks/learn.py", "record_log.person(session['identity_id'])"): 1,
    ("apps/api/blocks/teach.py", "record_log.person(session['identity_id'])"): 1,
    ("platform/block_hooks/facilitate.py", "record_log.person(facilitator)"): 1,
})
# (c) Group kinds that keep visibility="members" without saying so. Empty: every group kind names its visibility.
DEFAULT_VISIBILITY_ON_PURPOSE: set[str] = set()


def _is_owner_call(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        if func.value.id == "record_log" and func.attr in ("person", "group", "platform"):
            return True
        if func.value.id == "Owner" and func.attr == "group":
            return True
    return (isinstance(func, (ast.Name, ast.Attribute)) and (getattr(func, "id", None) or getattr(func, "attr", None)) == "Owner"
            and bool(node.args) and isinstance(node.args[0], ast.Constant) and node.args[0].value in ("person", "group", "platform"))


def owner_uses(root: Path) -> Counter:
    found: Counter = Counter()
    for folder in SCANNED:
        for path in sorted((root / folder).glob("*.py")):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if _is_owner_call(node):
                    found[(f"{folder}/{path.name}", ast.unparse(node))] += 1
    return found


def group_readers(root: Path) -> list[str]:
    """(b) Every call of CaseDocs' group and platform readers outside platform/visibility.py."""
    offenders = []
    for path in sorted(root.rglob("*.py")):
        relative = path.relative_to(root).as_posix()
        if relative in ("platform/visibility.py", "data/repositories/case_docs.py"):
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("current_in_group", "versions_in_group", "current_on_platform"):
                offenders.append(f"{relative}:{node.lineno}")
    return offenders


def unnamed_group_visibility(root: Path) -> list[str]:
    """(c) Every DocKind(..., owner="group", ...) in the kind modules that does not say its visibility."""
    offenders = []
    for path in sorted((root / "core" / "domain" / "kinds").glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not (isinstance(node, ast.Call) and getattr(node.func, "id", getattr(node.func, "attr", None)) == "DocKind"):
                continue
            keywords = {keyword.arg: keyword.value for keyword in node.keywords}
            owner = keywords.get("owner")
            if isinstance(owner, ast.Constant) and owner.value == "group" and "visibility" not in keywords:
                name = node.args[0].value if node.args and isinstance(node.args[0], ast.Constant) else "?"
                if name not in DEFAULT_VISIBILITY_ON_PURPOSE:
                    offenders.append(f"{path.name}: {name}")
    return offenders


class VisibilityCase(GroupCase):
    """a = convener, b and c = participants (GroupCase)."""

    def setUp(self):
        super().setUp()
        patcher = registered(POSITION, *BY_VISIBILITY.values())
        patcher.__enter__()
        self.addCleanup(patcher.__exit__, None, None, None)

    def put(self, who: str, kind: str, **content) -> str:
        return self.docs.save(self.tenant, self.owner, kind, content, record_log.user(who, "COLLAB"))["doc_id"]

    def sees(self, who: str, kind: str, tenant: str | None = None, **by) -> set[str]:
        return {item["doc_id"] for item in visibility.visible(self.docs, Viewer(tenant or self.tenant, who), self.group, kind, **by)}


class BlindTests(VisibilityCase):
    def test_others_positions_appear_only_after_writing_ones_own_for_that_round(self):
        b1 = self.put(self.b, "collab.s34_position", round="1", text="B 的立場")
        self.assertEqual(self.sees(self.c, "collab.s34_position"), set())
        c1 = self.put(self.c, "collab.s34_position", round="1", text="C 的立場")
        self.assertEqual(self.sees(self.c, "collab.s34_position"), {b1, c1})
        b2 = self.put(self.b, "collab.s34_position", round="2", text="第二輪")
        self.assertEqual(self.sees(self.c, "collab.s34_position"), {b1, c1})   # a new round starts blind again
        self.assertEqual(self.sees(self.b, "collab.s34_position"), {b1, c1, b2})

    def test_the_convener_is_blind_too_and_fetching_by_id_is_refused_as_not_found(self):
        b1 = self.put(self.b, "collab.s34_position", round="1", text="B")
        self.assertEqual(self.sees(self.a, "collab.s34_position"), set())
        self.assertEqual(self.sees(self.a, "collab.s34_position", doc_id=b1), set())
        with self.assertRaisesRegex(InvariantViolation, "^DOC_NOT_FOUND"):
            visibility.versions(self.docs, Viewer(self.tenant, self.a), self.group, "collab.s34_position", b1)
        self.put(self.a, "collab.s34_position", round="1", text="A")
        self.assertEqual(len(visibility.versions(self.docs, Viewer(self.tenant, self.a), self.group, "collab.s34_position", b1)), 1)


class VisibilityValueTests(VisibilityCase):
    def written(self, kind: str) -> dict[str, str]:
        return {who: self.put(who, kind, text=who) for who in (self.a, self.b, self.c)}

    def test_members_all_read_every_record(self):
        docs = self.written("collab.s34_members")
        for who in (self.a, self.b, self.c):
            self.assertEqual(self.sees(who, "collab.s34_members"), set(docs.values()))

    def test_author_only_and_self_and_govern_read_only_their_own_the_convener_too(self):
        for kind in ("collab.s34_author_only", "collab.s34_self_and_govern"):
            docs = self.written(kind)
            for who in (self.a, self.b, self.c):
                with self.subTest(kind=kind, who=who):
                    self.assertEqual(self.sees(who, kind), {docs[who]})

    def test_convener_and_author_the_convener_reads_all_a_participant_their_own(self):
        docs = self.written("collab.s34_convener_and_author")
        self.assertEqual(self.sees(self.a, "collab.s34_convener_and_author"), set(docs.values()))
        self.assertEqual(self.sees(self.b, "collab.s34_convener_and_author"), {docs[self.b]})


class WhoReadsTests(VisibilityCase):
    def test_one_who_left_reads_their_own_and_nothing_of_others_after(self):
        mine = self.put(self.b, "collab.s34_members", text="B")
        theirs = self.put(self.c, "collab.s34_members", text="C")
        self.repo.leave_group(self.tenant, self.group, self.b)
        self.put(self.c, "collab.s34_members", text="C 之後")
        self.assertEqual(self.sees(self.b, "collab.s34_members"), {mine})
        self.assertNotIn(theirs, self.sees(self.b, "collab.s34_members"))

    def test_a_member_held_for_review_reads_nothing_of_others(self):
        self.put(self.b, "collab.s34_members", text="B")
        mine = self.put(self.c, "collab.s34_members", text="C")
        with self.databases.for_tenant(self.tenant) as connection:
            connection.execute("UPDATE group_members SET review_state='pending_review' WHERE group_id=%s AND identity_id=%s", (self.group, self.c))
        self.assertEqual(self.sees(self.c, "collab.s34_members"), {mine})
        self.assertTrue(visibility.is_member(self.docs, Viewer(self.tenant, self.c), self.group))

    def test_a_non_member_and_another_tenant_read_nothing(self):
        self.put(self.b, "collab.s34_members", text="B")
        other_tenant, _, (outsider,) = make_people(self.databases, self.REGION, 1)
        stranger = str(uuid.uuid4())
        self.assertEqual(self.sees(stranger, "collab.s34_members"), set())
        self.assertEqual(self.sees(outsider, "collab.s34_members", tenant=other_tenant), set())
        self.assertFalse(visibility.is_member(self.docs, Viewer(other_tenant, outsider), self.group))

    def test_a_member_leaving_while_reading_a_history_waits_for_the_read(self):
        """Codex F5: decided and fetched in one transaction; leaving waits for it, so no history is handed to one who left."""
        import threading
        from unittest import mock

        theirs = self.put(self.c, "collab.s34_members", text="C")
        holding, release, real, outcome = threading.Event(), threading.Event(), self.docs.versions_in_group, {}

        def slowly(*args, **kwargs):   # authorized, about to fetch
            holding.set()
            release.wait(20)
            return real(*args, **kwargs)
        with mock.patch.object(self.docs, "versions_in_group", slowly):
            reader = threading.Thread(target=lambda: outcome.setdefault("read", len(visibility.versions(self.docs, Viewer(self.tenant, self.b), self.group, "collab.s34_members", theirs))), daemon=True)
            reader.start()
            self.assertTrue(holding.wait(10))
            leaver = threading.Thread(target=lambda: self.repo.leave_group(self.tenant, self.group, self.b), daemon=True)
            leaver.start()
            leaver.join(0.5)
            self.assertTrue(leaver.is_alive(), "the leave did not wait for the read in flight")
            release.set()
            reader.join(20)
            leaver.join(20)
        self.assertEqual(outcome["read"], 1)   # it was a member when it read
        self.assertEqual(self.sees(self.b, "collab.s34_members"), set())

    def test_role_helpers(self):
        self.assertTrue(visibility.is_convener(self.docs, Viewer(self.tenant, self.a), self.group))
        self.assertFalse(visibility.is_convener(self.docs, Viewer(self.tenant, self.b), self.group))

    def test_casedocs_refuses_to_read_a_group_any_other_way(self):
        doc = self.put(self.b, "collab.s34_members", text="B")
        for read in (lambda: self.docs.current(self.tenant, self.owner, "collab.s34_members"),
                     lambda: self.docs.versions(self.tenant, self.owner, "collab.s34_members", doc)):
            with self.assertRaisesRegex(InvariantViolation, "^DOC_GROUP_READ_NEEDS_VISIBILITY"):
                read()


class GateTests(GroupCase):
    def test_a_every_person_or_group_owner_use_is_reviewed(self):
        found = owner_uses(LEGO)
        self.assertEqual(found, REVIEWED_COUNTS)
        self.assertEqual(set(REVIEWED_COUNTS), set(REVIEWED_OWNER_USES))

    def test_b_only_visibility_calls_the_group_readers(self):
        self.assertEqual(group_readers(LEGO), [])

    def test_c_every_group_kind_names_its_visibility(self):
        self.assertEqual(unnamed_group_visibility(LEGO), [])

    def test_each_gate_fails_on_a_copy_with_one_new_unreviewed_use(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "ai_lego"
            for part in (*SCANNED, "core/domain/kinds", "platform", "data/repositories"):
                shutil.copytree(LEGO / part, root / part, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
            with (root / "apps/api/blocks/act.py").open("a", encoding="utf-8") as file:
                file.write("\n\ndef _peek(group_id):\n    return record_log.group(group_id)\n")
            with (root / "platform/ai_actions/__init__.py").open("a", encoding="utf-8") as file:
                file.write("\n\ndef _peek(docs, t, g):\n    return docs.current_in_group(t, g, 'collab.x')\n")
            with (root / "core/domain/kinds/s34_planted.py").open("w", encoding="utf-8") as file:
                file.write("from ai_lego.core.domain.doc_kinds import DocKind, Field\nKINDS = [DocKind('collab.planted', 'COLLAB', 'x', {'t': Field()}, owner='group')]\n")
            self.assertEqual(owner_uses(root) - REVIEWED_COUNTS, Counter({("apps/api/blocks/act.py", "record_log.group(group_id)"): 1}))
            self.assertEqual([hit.split(":")[0] for hit in group_readers(root)], ["platform/ai_actions/__init__.py"])
            self.assertEqual(unnamed_group_visibility(root), ["s34_planted.py: collab.planted"])
