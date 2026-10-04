"""完整性核心 (contract card 判斷權、可修正、非操控): the pre-launch check. Before a block goes live this reads what the code
shows of the 11 rules and 「不給人打分數」 and prints one pass/fail row per block. A failing block is listed, never hidden;
the exit status is 1 when a live block fails (沒過，那一塊就不能上線).

    python -m ai_lego.platform.integrity [--json]

Every check says what a tick proves and what it does not (卡: 任何一個勾，都要說清楚它證明了什麼). "有引註" is not "是真的";
likewise a field named 結論 that only the person can fill is not proof that the person wrote it honestly.

The rules are versioned (規則要有版本，每一版都留著): ``RULES_HISTORY`` keeps one entry per version, and a test fails when the
rules below change without a new entry.
"""

from __future__ import annotations

import argparse
import ast
import dataclasses
import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.blocks import ALL_CODES, BLOCKS
from ai_lego.core.domain.doc_kinds import DocKind
from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS
from ai_lego.core.domain.kinds.collab_contract import ALWAYS, GRANTABLE
from ai_lego.data.db import Databases
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.block_hooks import hooks as registered_hooks
from ai_lego.platform.block_hooks.govern import WATCHED_BLOCKS
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.safety import digest

# The 11 rules (藍圖第 9 節) and the one that sits beside them, as the card words them.
RULES = {
    "R1": "最後的判斷權在你", "R2": "平台不預設結論，但要把規範和脈絡擺出來", "R3": "所有的影響都可以檢查，包括平台自己",
    "R4": "不同種類的主張不混在一起", "R5": "要的是能重新檢查，不是懷疑一切", "R6": "服從或抵抗，都可以是結果", "R7": "有判斷權，不等於不用負責",
    "R8": "大家共同的秩序另外設計", "R9": "平台本身可以被質疑", "R10": "AI 的權限看得見、可以縮小、可以收回", "R11": "信任要能校準",
    "NOSCORE": "平台不給人打分數",
}

# A field named like these holds the person's own conclusion: only the person may write it.
CONCLUSION_TOKENS = frozenset({"conclusion", "judgment", "judgement", "verdict", "stance", "confidence"})
CONCLUSION_NAMES = frozenset({"core_conflict", "change_condition"})
# A field named like these grades someone (分數、排名、評等；自主、成熟、理性、服從也不打分).
GRADING_TOKENS = frozenset({"score", "scores", "rank", "ranking", "rating", "ratings", "grade", "grades", "autonomy", "maturity", "rationality", "obedience", "compliance"})
# What every AI call's opening instructions must carry (ai_gate.PREAMBLE).
PREAMBLE_MUST = ("Never write the person's conclusion", "never score anyone", "Never diagnose", "your own memory is not a source", "neutral or mature one")

# Copies of the supervisor page's DRAWERS owners and DRAWER_READS (agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/
# platform-supervisor.html); a test compares them to the page whenever it is in the checkout. "*" = every block's records.
DRAWER_OWNER = {
    "open": "ASSEMBLER", "perm": "COLLAB_CONTRACT", "sense": "SENSE", "source": "GATHER", "context": "CONTEXT", "map": "MAP", "think": "THINK", "claims": "VERIFY",
    "calc": "COMPUTE", "judge": "DECIDE", "act": "ACT", "review": "LEARN", "habit": "LEARN", "draft": "EXPRESS", "guard": "GOVERN", "facil": "FACILITATE",
    "group": "COLLAB", "drill": "TEACH", "rules": "INTEGRITY", "govern": "GOVERN",
}
DRAWER_READS = {
    "SENSE": [], "GATHER": ["open", "map", "claims", "review", "govern"], "MAP": ["open", "sense", "source", "context", "review"], "THINK": ["map", "sense", "claims"],
    "VERIFY": ["source", "map", "open", "govern"], "COMPUTE": ["source"], "DECIDE": ["open", "map", "think", "claims", "calc", "context", "group", "review", "act", "sense", "guard"],
    "ACT": ["open", "judge", "calc", "claims", "group", "guard"], "LEARN": ["*"], "EXPRESS": ["judge", "map", "claims", "calc", "source", "think", "act", "sense", "review"],
    "TEACH": [], "COLLAB": ["map", "claims", "draft", "act", "open"], "GOVERN": ["open", "group", "facil"], "FACILITATE": ["open", "sense", "map", "think", "govern"],
    "INTEGRITY": [], "CONTEXT": ["open", "map"], "ASSEMBLER": ["review"], "RECORD": ["*"], "COLLAB_CONTRACT": ["open"],
}
# The cards that let a block read only part of a drawer, where the part is one kind: (reader, owner) -> the kinds it may read.
KIND_READ_LIMITS = {("DECIDE", "SENSE"): ("sense.state",)}


def reads_from(block: str) -> frozenset[str]:
    """The blocks whose records ``block``'s AI may read: its own and the owners of the drawers its card lists."""
    drawers = DRAWER_READS.get(block, [])
    return frozenset(ALL_CODES) if "*" in drawers else frozenset({block, *(DRAWER_OWNER[drawer] for drawer in drawers)})


@dataclass(frozen=True)
class Snapshot:
    """What is checked: the kinds, AI actions and after-save hooks as registered, which blocks are open, the shared instructions."""
    kinds: Mapping[str, DocKind]
    actions: Mapping[tuple[str, str], ai_gate.AiAction]
    hooks: Mapping[str, tuple[Callable[..., Any], ...]]
    open_blocks: tuple[str, ...]
    preamble: str

    @classmethod
    def live(cls) -> "Snapshot":
        return cls(doc_kinds.kinds(), ai_gate.actions(), {kind: tuple(fns) for kind, fns in registered_hooks().items()}, OPEN_BLOCKS, ai_gate.PREAMBLE)

    def kinds_of(self, block: str) -> list[DocKind]:
        return [spec for spec in self.kinds.values() if spec.block == block]

    def contract_of(self, block: str) -> list[DocKind]:
        """What the block keeps as its own: not the proposals it writes into the assembler's namespace."""
        return [spec for spec in self.kinds_of(block) if not spec.kind.startswith("assembler.proposal.")]

    def actions_of(self, block: str) -> list[ai_gate.AiAction]:
        return [action for (owner, _), action in self.actions.items() if owner == block]


def _tokens(name: str) -> set[str]:
    return set(name.lower().split("_"))


def _is_conclusion(name: str) -> bool:
    return name in CONCLUSION_NAMES or bool(_tokens(name) & CONCLUSION_TOKENS)


# -- the checks: (snapshot, block) -> problems; an empty list = pass ----------------------------------------------------

def _points_at(name: str) -> bool:
    """A field that names another record (``judgment_version``, ``judgment_id``) points at a conclusion; it holds none."""
    return name.endswith(("_version", "_id"))


def human_only_conclusions(snap: Snapshot, block: str) -> list[str]:
    """A field named like a conclusion (a confidence number too), in a kind someone other than the person may author,
    must be person-only (a kind only the person authors already keeps the AI out)."""
    return [f"{spec.kind}.{name} holds a conclusion and the AI can write it" for spec in snap.kinds_of(block) for name, field in spec.fields.items()
            if _is_conclusion(name) and not _points_at(name) and not field.human_only and spec.authors != frozenset({"user"})]


def no_scores(snap: Snapshot, block: str) -> list[str]:
    problems = [f"{spec.kind}.{name} grades someone" for spec in snap.kinds_of(block) for name in spec.fields if _tokens(name) & GRADING_TOKENS]
    for action in snap.actions_of(block):
        problems += [f"{action.block}.{action.name} answer field {name!r} grades someone" for name in (action.output_schema or {}).get("properties", {}) if _tokens(name) & GRADING_TOKENS]
    return problems


def ai_permissions(snap: Snapshot, block: str) -> list[str]:
    problems = []
    for action in snap.actions_of(block):
        where = f"{action.block}.{action.name}"
        if action.needs not in ALWAYS and action.needs not in GRANTABLE:
            problems.append(f"{where} needs {action.needs!r}, which the 協作合約 does not list")
        if action.outside_case and action.needs not in ALWAYS:
            problems.append(f"{where} runs with no case but needs a grant")
        out = snap.kinds.get(action.output_kind)
        if out is None or out.block != action.block or "ai" not in out.authors:
            problems.append(f"{where} saves into {action.output_kind}, which is not its block's AI-written kind")
    return problems


def reads_within_card(snap: Snapshot, block: str) -> list[str]:
    allowed = reads_from(block)
    problems = []
    for action in snap.actions_of(block):
        for kind in action.reads:
            spec = snap.kinds.get(kind)
            if spec is None:
                problems.append(f"{block}.{action.name} reads {kind}, which is not a known kind")
            elif spec.block not in allowed:
                problems.append(f"{block}.{action.name} reads {kind} ({spec.block}), which the {block} card does not let it read")
            elif (block, spec.block) in KIND_READ_LIMITS and kind not in KIND_READ_LIMITS[(block, spec.block)]:
                problems.append(f"{block}.{action.name} reads {kind}; the card lets it read only {list(KIND_READ_LIMITS[(block, spec.block)])} of {spec.block}")
    return problems


class _NoModel:
    called = False

    def complete(self, *args: Any, **kwargs: Any) -> Any:
        self.called = True
        raise AssertionError("the model was called")

    complete_json = complete


@contextmanager
def _rehearsal() -> Iterator[Databases]:
    """The real save path on the configured database (COGNITIVE_OS_DATABASE_URLS, its first region), inside one transaction
    that is always rolled back (Databases.rehearsal): nothing the check writes is kept, the tenant "integrity" included."""
    with Databases.from_env(max_size=1) as databases:
        databases.require_schema_at_head(databases.directory_region)
        with databases.rehearsal() as scratch:
            IdentityStore(scratch).create_tenant("integrity", "integrity check", "jurisdiction-pack.tw.v1", scratch.directory_region, "integrity")
            yield scratch


def _a_case(repo: ProjectSourceRepository, case: str) -> str:
    """A real case in the check's own rehearsal: a case's records are written only while the case exists (CASE_ERASED)."""
    repo.create_project({"project_id": case, "tenant_id": "integrity", "workspace_id": "integrity", "name": case, "purpose": "integrity check",
                         "data_classification": "Confidential", "status": "active", "version": 1, "created_by_identity_id": "integrity",
                         "created_at": "2026-10-04T00:00:00Z"})
    return case


def crisis_stops_ai(snap: Snapshot, block: str) -> list[str]:
    """Runs the real gate: each action is fed one crisis sentence in place of its own input, with a provider that must not be called."""
    problems = []
    with _rehearsal() as databases:
        repo = ProjectSourceRepository(databases)
        docs = CaseDocs(repo)
        for action in snap.actions_of(block):
            case = _a_case(repo, f"integrity-{action.block}-{action.name}")
            probe = dataclasses.replace(action, build_input=lambda context, read: "我想結束自己")
            if probe.needs not in ALWAYS:
                docs.save("integrity", record_log.case(case), "collab_contract.terms", {"permissions": [probe.needs]}, record_log.user("integrity", "COLLAB_CONTRACT"))
            model = _NoModel()
            try:
                answer = ai_gate.ask_ai(probe, tenant_id="integrity", identity_id="integrity", project_id=None if probe.outside_case else case, context={}, docs=docs, provider=model)
            except Exception as error:   # any failure before the stop is a failure of the stop
                problems.append(f"{action.block}.{action.name} failed on a crisis signal: {error}")
                continue
            if model.called or answer.get("stopped") != "crisis":
                problems.append(f"{action.block}.{action.name} did not stop on a crisis signal")
    return problems


def _writes_words(spec: DocKind) -> bool:
    return bool(spec.authors & {"user", "joint"}) and any(field.type in ("text", "list", "json") for field in spec.fields.values())


def high_risk_recognised(snap: Snapshot, block: str) -> list[str]:
    return [f"{spec.kind} is saved with no high-risk recognition" for spec in snap.kinds_of(block)
            if _writes_words(spec) and not any(getattr(fn, "recognises_high_risk", False) for fn in snap.hooks.get(spec.kind, ()))]


# What a block's card fixes on a kind, from the cross-block interface: check name -> (block, kind, kind rules, field rules).
SLOTS: dict[str, tuple[str, str, dict[str, Any], dict[str, dict[str, Any]]]] = {
    "decide_judgment_card": ("DECIDE", "decide.judgment", {"singleton": True, "deletable": False, "authors": {"user"}, "all_human_only_except": ("influences_listed",)}, {
        "change_condition": {"required": True, "human_only": True}, "confidence": {}, "stop_answers": {}, "intensity_now": {}, "influences_listed": {}, "influences_added": {}, "next_step": {}}),
    "map_claims_and_core": ("MAP", "map.map", {"singleton": True, "deletable": False}, {"core_conflict": {"human_only": True}, "claims": {}, "layers": {}, "gaps": {}}),
    "think_round": ("THINK", "think.round", {}, {"problem": {"human_only": True}, "own": {"human_only": True}, "reflection": {"human_only": True}}),
    "context_notes": ("CONTEXT", "context.notes", {"singleton": True, "deletable": False}, {"stance": {"human_only": True}, "norm_origin": {}, "jurisdictions": {}, "recheck_when": {}}),
    "act_task": ("ACT", "act.task", {}, {"owner": {}, "due": {"type": "date"}, "stop_condition": {}, "escalate_condition": {}, "irreversible": {"type": "bool"}}),
    "contract_terms": ("COLLAB_CONTRACT", "collab_contract.terms", {"singleton": True, "deletable": False}, {
        "scope": {}, "human_parts": {}, "basis": {}, "handback": {}, "permissions": {"choices_equal": tuple(GRANTABLE)}}),
    "collab_proposable": ("ASSEMBLER", "assembler.proposal.decide", {"authors": {"system"}}, {"propose": {"choices_include": "COLLAB"}, "guardrail": {"type": "bool"}}),
    "version_records": ("GOVERN", "govern.ai_call", {"authors": {"system"}, "deletable": False}, {
        "block": {"required": True}, "action": {"required": True}, "model": {"required": True}, "instructions_sha256": {"required": True}}),
}


def _slot(name: str) -> Callable[[Snapshot, str], list[str]]:
    _, kind, kind_rules, field_rules = SLOTS[name]

    def run(snap: Snapshot, block: str) -> list[str]:
        spec = snap.kinds.get(kind)
        if spec is None:
            return [f"{kind} does not exist"]
        problems = []
        if kind_rules.get("singleton") and not spec.singleton:
            problems.append(f"{kind} must be one per case")
        if kind_rules.get("deletable") is False and spec.deletable:
            problems.append(f"{kind} must keep every version (not deletable)")
        if "authors" in kind_rules and spec.authors != frozenset(kind_rules["authors"]):
            problems.append(f"{kind} must be written by {sorted(kind_rules['authors'])} only, not {sorted(spec.authors)}")
        if "all_human_only_except" in kind_rules:
            problems += [f"{kind}.{field} must be the person's own" for field, spec_field in spec.fields.items() if field not in kind_rules["all_human_only_except"] and not spec_field.human_only]
        for field, rule in field_rules.items():
            held = spec.fields.get(field)
            if held is None:
                problems.append(f"{kind}.{field} is missing")
                continue
            if rule.get("required") and not held.required:
                problems.append(f"{kind}.{field} must be required")
            if rule.get("human_only") and not held.human_only:
                problems.append(f"{kind}.{field} must be the person's own")
            if "type" in rule and held.type != rule["type"]:
                problems.append(f"{kind}.{field} must be a {rule['type']}")
            if "choices_include" in rule and rule["choices_include"] not in held.choices:
                problems.append(f"{kind}.{field} must offer {rule['choices_include']}")
            if "choices_equal" in rule and set(held.choices) != set(rule["choices_equal"]):
                problems.append(f"{kind}.{field} must offer exactly {sorted(rule['choices_equal'])}")
        return problems
    return run


def review_scheduled(snap: Snapshot, block: str) -> list[str]:
    built = [spec for owner in ("ACT", "LEARN") for spec in snap.contract_of(owner)]
    if any(field.type == "date" for spec in built for field in spec.fields.values()):
        return []
    return ["neither ACT nor LEARN keeps a date to come back on"]


def record_refuses_scores(snap: Snapshot, block: str) -> list[str]:
    """Runs the real record: a payload with a score key is refused at write; the same write without it goes through."""
    with _rehearsal() as databases, databases.for_tenant("integrity") as connection:
        writer, owner = record_log.user("integrity", "ASSEMBLER"), record_log.case("integrity")
        record_log.append(connection, "integrity", "project:integrity", "ProjectRenamed", {"name": "x"}, writer=writer, owner=owner)
        try:
            record_log.append(connection, "integrity", "project:integrity", "ProjectRenamed", {"name": "x", "score": 3}, writer=writer, owner=owner)
        except InvariantViolation as error:
            return [] if "RECORD_SCORE_REFUSED" in str(error) else [f"a score was refused for another reason: {error}"]
        return ["the record accepted a payload with a score"]


def shared_instructions(snap: Snapshot, block: str) -> list[str]:
    return [f"the shared AI instructions no longer say {line!r}" for line in PREAMBLE_MUST if line not in snap.preamble]


def crisis_on_save(snap: Snapshot, block: str) -> list[str]:
    """Runs the real save path every block's documents go through, with a crisis sentence in a card."""
    import ai_lego.apps.api.main   # noqa: F401  # the HTTP layer, imported only when this check runs; main mounts the blocks, so it goes first
    from ai_lego.apps.api.blocks.docs import _saved

    with _rehearsal() as databases:
        repo = ProjectSourceRepository(databases)
        _a_case(repo, "integrity")
        doc = {"doc_id": "integrity", "kind": "sense.card", "version": 1, "content": {"category": "感受", "text": "我想結束自己"}, "author": "user", "block": "SENSE", "at": ""}
        try:
            notices = _saved(repo, {"tenant_id": "integrity", "identity_id": "integrity"}, record_log.case("integrity"), doc)["notices"]
        except Exception as error:
            return [f"saving a card with a crisis signal failed: {error}"]
    return [] if any(notice["type"] == "crisis" for notice in notices) else ["saving a card with a crisis signal brought no help"]


def _writes_as_system(call: ast.Call) -> bool:
    """A save that cannot carry the person's words: written as the AI (record_log refuses an AI writer on a kind the AI
    may not author), or as the system into a literal kind only the system or the AI authors. Anything else -- a person
    writer, a computed kind, ``docs.save`` handed to a helper -- counts as the person's save."""
    from ai_lego.core.domain import doc_kinds

    writer = call.args[4] if len(call.args) > 4 else next((keyword.value for keyword in call.keywords if keyword.arg == "writer"), None)
    if not (isinstance(writer, ast.Call) and isinstance(writer.func, ast.Attribute) and writer.func.attr in ("system", "ai")):
        return False
    if writer.func.attr == "ai":
        return True
    kind = call.args[2] if len(call.args) > 2 else next((keyword.value for keyword in call.keywords if keyword.arg == "kind"), None)
    return isinstance(kind, ast.Constant) and kind.value in doc_kinds.kinds() and doc_kinds.require(kind.value).authors <= {"system", "ai"}


def unsafe_route_modules(folder: Path) -> list[str]:
    """Route files that save the person's words and never mention the save path (docs._saved: the crisis notice, the
    guardrails). A save written as the system or the AI (a derived history, the AI's cards laid out) is not the person's words."""
    problems = []
    for path in sorted(folder.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        calls = {id(node.func): node for node in ast.walk(tree) if isinstance(node, ast.Call)}
        saves = any(isinstance(node, ast.Attribute) and node.attr == "save" and not (id(node) in calls and _writes_as_system(calls[id(node)])) for node in ast.walk(tree))
        goes_through = any(isinstance(node, ast.Name) and node.id in ("_saved", "after_save") for node in ast.walk(tree))
        if saves and not goes_through:
            problems.append(f"{path.name} saves documents but never goes through the save path (crisis notice, guardrails)")
    return problems


def unreadable_inputs(folder: Path) -> list[str]:
    """``json.dumps`` in an AI action's file without ``ensure_ascii=False``: the gate looks for a crisis signal in the exact
    text it sends, and an escaped \\u81ea\\u6bba is not a word it knows."""
    problems = []
    for path in sorted(folder.glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "dumps":
                if not any(keyword.arg == "ensure_ascii" and isinstance(keyword.value, ast.Constant) and keyword.value.value is False for keyword in node.keywords):
                    problems.append(f"{path.name}:{node.lineno} json.dumps escapes non-ASCII text, so the crisis check cannot read what the AI is sent (pass ensure_ascii=False)")
    return problems


def ai_inputs_are_readable(snap: Snapshot, block: str) -> list[str]:
    import ai_lego.platform.ai_actions as actions

    return unreadable_inputs(Path(actions.__path__[0]))


def routes_keep_the_save_path(snap: Snapshot, block: str) -> list[str]:
    import ai_lego.apps.api.blocks as routes

    return unsafe_route_modules(Path(routes.__path__[0]))


@dataclass(frozen=True)
class Check:
    id: str
    rules: tuple[str, ...]
    name: str
    proves: str
    does_not_prove: str
    run: Callable[[Snapshot, str], list[str]]
    blocks: tuple[str, ...] | None = None        # None: every block that has kinds or AI actions
    needs: str = "kinds"                          # generic ones: "kinds" | "actions" | "words"; a fixed one waits for "act_or_learn" to be built

    def applies(self, snap: Snapshot, block: str) -> bool:
        if self.blocks is not None:
            return block in self.blocks and (self.needs != "act_or_learn" or any(snap.contract_of(owner) for owner in ("ACT", "LEARN")))
        if self.needs == "actions":
            return bool(snap.actions_of(block))
        if self.needs == "words":
            return block in WATCHED_BLOCKS and any(_writes_words(spec) for spec in snap.kinds_of(block))
        return bool(snap.contract_of(block) or snap.actions_of(block))


PLATFORM = "PLATFORM"
CHECKS = (
    Check("human_only_conclusions", ("R1", "R2"), "結論的格子只收人寫的", "沒有叫結論、判斷、立場、信心、裝文字的格子，是 AI 或共同草稿寫得進去的（只有你能寫的紀錄種類本來就擋住 AI）。", "只看格子的名字。結論放在別的名字或 json 裡面，這裡看不到；指向別筆紀錄的格子（第幾版、編號）不算結論，信心數字算。", human_only_conclusions),
    Check("no_scores", ("R6", "NOSCORE"), "沒有給人打分數的格子", "沒有格子或 AI 回答的欄位，叫分數、排名、評等，或自主、成熟、理性、服從。", "只看名字。放在 json 裡面的分數，由共用紀錄在寫入時擋（見 record_refuses_scores）。", no_scores),
    Check("ai_permissions", ("R10",), "每個 AI 動作都對得上一項看得見的權限", "每個 AI 動作要的權限，協作合約裡都列得出來，你可以收回；沒有案子也能做的，只要最低權限。", "不證明 AI 執行時守在權限內；那由 AI 閘擋，另外有測試。", ai_permissions, needs="actions"),
    Check("reads_within_card", ("R10",), "AI 只讀合約卡寫的那幾塊", "每個 AI 動作讀的紀錄，都屬於它那張卡准讀的積木。", "只到積木這一層。卡上寫「只讀一部分」的，只有「判斷只讀情緒強度」逐種檢查。", reads_within_card, needs="actions"),
    Check("crisis_stops_ai", ("R1",), "出現危機訊號，AI 先停", "拿一句危機的話餵給每個 AI 動作，它在叫模型之前就停了，也給了求助資源。", "只試一句話。詞表漏掉的說法，這裡看不到。", crisis_stops_ai, needs="actions"),
    Check("high_risk_recognised", ("R1",), "看得到你內容的積木，碰到高風險會叫 GOVERN", "這一塊每一種你寫的紀錄，存的時候都經過 GOVERN 的高風險辨認。", "證明有接上，不證明詞表認得出每一種說法。", high_risk_recognised, needs="words"),
    Check("decide_judgment_card", ("R1", "R3", "R5"), "判斷卡：只收你寫的，影響清單分開記，一定要寫什麼會改變它", "判斷卡一次一張、每一版都留、只有你能寫；「什麼會改變它」必填；系統列的影響和你補的影響分兩格。", "不證明你寫得誠實，也不證明 AI、這次的拆法、平台本身真的都在影響清單上；那是 DECIDE 執行時做的。", _slot("decide_judgment_card"), blocks=("DECIDE",)),
    Check("map_claims_and_core", ("R1", "R4"), "拆解：主張有分種類，核心矛盾只收你寫的", "地圖每次存都留一版；有放主張（事實、法律、價值、文化宗教）的格子；核心矛盾只有你能寫。", "不證明主張分對了種類。", _slot("map_claims_and_core"), blocks=("MAP",)),
    Check("think_round", ("R1",), "共思考：你先想的格子只收你寫的", "你的問題、你自己的想法、回看自己怎麼想，AI 寫不進去。", "不證明你真的先想過再問 AI。", _slot("think_round"), blocks=("THINK",)),
    Check("context_notes", ("R2",), "規範與脈絡：把規範從哪來擺出來，立場只收你寫的", "有「規範從哪來」「適用哪裡的法律」「什麼時候重看」的格子，暫定立場只有你能寫。", "不證明脈絡寫得對或寫得夠。", _slot("context_notes"), blocks=("CONTEXT",)),
    Check("act_task", ("R5", "R7"), "行動：有負責人、期限、停止和升級條件", "任務卡有負責人、到期日（到期時回來做回顧）、停止條件、升級條件，和不能反悔的標記。", "不證明到期時真的有人回來看。", _slot("act_task"), blocks=("ACT",)),
    Check("contract_terms", ("R10", "R11"), "協作合約：權限可以收回，說明範圍、依據和交還的條件", "合約一案一份、每次修改留一版；權限正好是系統列的那幾種；有範圍、依據、交還控制的格子。", "不證明每個產出旁都真的寫了適用範圍和限制。", _slot("contract_terms"), blocks=("COLLAB_CONTRACT",)),
    Check("collab_proposable", ("R8",), "組裝器：有別人決定時，能提議加共同程序", "判斷那一塊能提議加 COLLAB，而且標得出是護欄；提議只有系統能寫。", "共同程序本身還沒開放（第 3 步）。", _slot("collab_proposable"), blocks=("ASSEMBLER",)),
    Check("version_records", ("R3", "R9"), "GOVERN：每次 AI 呼叫都記模型和指令的版本", "每次呼叫 AI 都有一筆紀錄，寫著用的模型和指令的指紋；只有系統能寫，也不能刪。", "不證明指令寫得好，也不是申訴管道（第 3 步）。", _slot("version_records"), blocks=("GOVERN",)),
    Check("review_scheduled", ("R5",), "有排定回顧", "ACT 或 LEARN 至少有一種紀錄存「回來的那一天」。", "不證明到那天會提醒你；提醒是之後的事。ACT 和 LEARN 都還沒蓋的時候不查，它們各自在自己那一列沒過。", review_scheduled, blocks=(PLATFORM,), needs="act_or_learn"),
    Check("record_refuses_scores", ("NOSCORE",), "共用紀錄寫入時擋打分數", "真的寫一筆帶 score 的紀錄，被拒絕；同一筆不帶它就寫得進去。", "只擋已知的幾個鍵名。", record_refuses_scores, blocks=(PLATFORM,)),
    Check("shared_instructions", ("R2", "R10", "NOSCORE"), "給 AI 的共用指令寫著規則", "每次呼叫 AI 的開頭都寫著：不替你下結論、不打分、不診斷、自己記得的不算來源、不把某個立場說成中立。", "只證明這幾句在指令裡，不證明模型照做。", shared_instructions, blocks=(PLATFORM,)),
    Check("crisis_on_save", ("R1",), "存一張卡，出現危機訊號，會給求助資源", "真的走一次存卡的路，帶危機訊號的卡會得到求助資源。", "只試一句話，也只試外化卡。", crisis_on_save, blocks=(PLATFORM,)),
    Check("ai_inputs_are_readable", ("R1",), "AI 的輸入沒有把中文escape掉，危機詞看得到", "每個 AI 動作的檔案裡，json.dumps 都寫了 ensure_ascii=False，所以閘檢查的那段字，和送給 AI 的是同一段、讀得懂。", "只看 json.dumps；別種把字變形的寫法，這裡看不到。危機詞表漏掉的說法也看不到。", ai_inputs_are_readable, blocks=(PLATFORM,)),
    Check("routes_keep_the_save_path", ("R1",), "每個存你寫的紀錄的路由檔，都接上危機和護欄那一關", "apps/api/blocks 裡凡是可能存到你寫的字的檔，都用了存卡那條路（危機訊號給求助、高風險加護欄）。只有兩種不算：用 AI 身分存的（攤開 AI 的卡），和用系統身分存進只有系統能寫的紀錄種類（整理出的歷程）；把存的函式交給別的函式用，也算你的。", "只看檔案有沒有接上，不看每一個寫入點是不是都走那條路。", routes_keep_the_save_path, blocks=(PLATFORM,)),
)
assert len({check.id for check in CHECKS}) == len(CHECKS) and all(rule in RULES for check in CHECKS for rule in check.rules)
assert all(SLOTS[check.id][0] == check.blocks[0] for check in CHECKS if check.id in SLOTS)

ALWAYS_ON_WITH_KINDS = ("CONTEXT", "ASSEMBLER", "COLLAB_CONTRACT")
ROWS = (*BLOCKS, *ALWAYS_ON_WITH_KINDS, PLATFORM)

RULES_HISTORY = (
    {"version": 1, "date": "2026-10-03", "fingerprint": "c692fa60074f", "change": "first version: 11 rules and 不打分 checked per block; 20 checks, each with what it proves and does not prove"},
    {"version": 2, "date": "2026-10-03", "fingerprint": "428dd046bfc7", "change": "integration: a conclusion is a field of words in a kind the AI may author (an int version number is not); a route must send the person's saves through the save path, a system or AI write is not the person's words"},
    {"version": 3, "date": "2026-10-03", "fingerprint": "4f70873772a8", "change": "critic: a field that points at a record (*_version, *_id) is not a conclusion, a confidence number is; a save handed to a helper or written as the system into a kind the person may author counts as the person's"},
)


def _plain(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _plain(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, (set, frozenset)):
        return sorted(_plain(item) for item in value)
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return value


def rules_fingerprint() -> str:
    """What the rules say now: the checks (with their words), the card reads, the name lists, the fixed slots."""
    return digest(_plain({
        "rules": RULES, "checks": [(check.id, check.rules, check.name, check.proves, check.does_not_prove, check.blocks, check.needs) for check in CHECKS],
        "conclusion": [CONCLUSION_TOKENS, CONCLUSION_NAMES], "grading": GRADING_TOKENS, "preamble": PREAMBLE_MUST,
        "reads": {block: sorted(reads_from(block)) for block in DRAWER_READS}, "read_limits": {f"{a}:{b}": kinds for (a, b), kinds in KIND_READ_LIMITS.items()}, "slots": SLOTS,
    }))


def rules_version() -> str:
    return f"v{RULES_HISTORY[-1]['version']}-{rules_fingerprint()}"


@dataclass
class Row:
    block: str
    live: bool
    built: bool
    results: dict[str, list[str] | None]   # check id -> problems; None = does not apply to this block

    @property
    def failures(self) -> list[tuple[str, str]]:
        return [(check_id, problem) for check_id, problems in self.results.items() for problem in problems or ()]

    @property
    def status(self) -> str:
        return "FAIL" if self.failures else "PASS" if self.built else "NOT BUILT"


def run(snap: Snapshot | None = None) -> list[Row]:
    snap = snap or Snapshot.live()
    rows = []
    for block in ROWS:
        built = block == PLATFORM or bool(snap.contract_of(block) or snap.actions_of(block))
        live = block == PLATFORM or (block in snap.open_blocks if block in BLOCKS else built)
        if not built and not live:
            rows.append(Row(block, False, False, {}))
            continue
        if not built:
            rows.append(Row(block, True, False, {"contract": [f"{block} is open but keeps no kind: its contract is not on the record"]}))
            continue
        rows.append(Row(block, live, True, {check.id: (check.run(snap, block) if check.applies(snap, block) else None) for check in CHECKS}))
    return rows


def gate_passed(rows: list[Row]) -> bool:
    return not any(row.live and row.status == "FAIL" for row in rows)


def coverage() -> dict[str, list[str]]:
    """Per rule, the checks that look at it; an empty list would mean the rule is left to a person's review."""
    return {rule: [check.id for check in CHECKS if rule in check.rules] for rule in RULES}


def report(rows: list[Row]) -> dict[str, Any]:
    return {
        "rules_version": rules_version(), "gate_passed": gate_passed(rows),
        "rows": [{"block": row.block, "live": row.live, "status": row.status, "results": row.results} for row in rows],
        "checks": [{"id": check.id, "rules": check.rules, "name": check.name, "proves": check.proves, "does_not_prove": check.does_not_prove} for check in CHECKS],
        "coverage": coverage(),
    }


def _text(rows: list[Row]) -> str:
    marks = {None: "·", True: "✗", False: "✓"}
    lines = [f"完整性核心 規則檢查  規則版本 {rules_version()}", "", "標記：✓ 通過　✗ 沒過　· 不適用　　欄位依序是下面的檢查 1–" + str(len(CHECKS)), ""]
    lines.append(f"{'BLOCK':<16}{'LIVE':<6}{'STATUS':<11}" + " ".join(f"{index + 1:>2}" for index in range(len(CHECKS))))
    for row in rows:
        cells = " ".join(f"{marks[None if row.results.get(check.id) is None else bool(row.results[check.id])]:>2}" for check in CHECKS) if row.built else ""
        lines.append(f"{row.block:<16}{'yes' if row.live else 'no':<6}{row.status:<11}{cells}")
    failing = [(row.block, check_id, problem) for row in rows for check_id, problem in row.failures]
    lines += ["", f"沒過的項目（{len(failing)}）" + ("：" if failing else "：無")] + [f"  {block}  [{check_id}]  {problem}" for block, check_id, problem in failing]
    lines += ["", "每一個勾證明什麼、不證明什麼："]
    for index, check in enumerate(CHECKS, 1):
        lines += [f"  {index:>2} {check.id}（{'、'.join(check.rules)}）{check.name}", f"      證明：{check.proves}", f"      不證明：{check.does_not_prove}"]
    lines += ["", "11 條規則（和不打分）各有哪些檢查在看："]
    for rule, ids in coverage().items():
        lines.append(f"  {rule}  {RULES[rule]}：{', '.join(ids) if ids else '沒有機械檢查，靠人審'}")
    lines += ["", "上線關卡：" + ("通過" if gate_passed(rows) else "沒過（有上線的積木沒過）")]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="完整性核心：上線前的規則檢查")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    arguments = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    rows = run()
    print(json.dumps(report(rows), ensure_ascii=False, indent=2) if arguments.json else _text(rows))
    return 0 if gate_passed(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
