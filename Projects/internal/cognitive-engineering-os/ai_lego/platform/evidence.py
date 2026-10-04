"""What GATHER, VERIFY and COMPUTE share (docs/platform/STEP2_SHARED_RULES.md §2-3): the counting rules, written once.
Every block that reads a source card, a checked claim or a calculation reads it through ``origins``, ``checked_claims``
or ``calc_results`` (a page: GET /projects/{id}/evidence), never from the kinds directly, so 「幾個獨立出處」 means the
same thing on every page. The words live in ``ai_lego.core.domain.evidence_words`` and are re-exported here.

Counting is fail-closed: a card the grouping has not seen, a grouping that is malformed, a stance on an older claim or
an older page -- each is shown and never counted.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Iterable, Mapping

from ai_lego.core.domain.evidence_words import *  # noqa: F401,F403 -- re-exported (evidence_words.__all__)
from ai_lego.core.domain.evidence_words import (CHECKABLE, CLAIM_STATES, MIN_ORIGINS, NOT_CHECKABLE, NOT_READ, NOT_SEARCHED,
                                                NOT_USED, PENDING_HOW, SAME_TEXT_HOW, SPLIT_HOW, UNCHECKABLE, VERDICTS, grouping_errors)
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation

_log = logging.getLogger(__name__)


def _rank(doc: Mapping[str, Any]) -> str:
    """Which of two live records for the same thing wins: the latest (every kind counted here is the person's own)."""
    return doc.get("at") or ""


def _latest_by(docs: Iterable[Mapping[str, Any]], *keys: str) -> dict[Any, Mapping[str, Any]]:
    best: dict[Any, Mapping[str, Any]] = {}
    for doc in docs:
        content = doc.get("content") or {}
        value = tuple(content.get(key) for key in keys) if len(keys) > 1 else content.get(keys[0])
        if (all(isinstance(item, str) for item in value) if isinstance(value, tuple) else isinstance(value, str)) \
                and (value not in best or _rank(doc) >= _rank(best[value])):
            best[value] = doc
    return best


def _sha(card: Mapping[str, Any]) -> str | None:
    snapshot = (card.get("content") or {}).get("snapshot")
    sha = snapshot.get("sha256") if isinstance(snapshot, Mapping) else None
    return sha if isinstance(sha, str) and sha else None


def origin_id(cards: Iterable[str], pending: bool = False) -> str:
    """An origin is its cards: the id is computed from them, so a mark made on one set of pages never lands on another."""
    digest = hashlib.sha256("\n".join(sorted(cards)).encode("utf-8")).hexdigest()[:16]
    return f"{'pending' if pending else 'o'}:{digest}"


def origins(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, *, with_reviews: bool = True) -> list[dict[str, Any]]:
    """The case's independent origins (出處): every source card in exactly one.

    The system's latest grouping (``gather.origins``) first; then the person's splits (oldest first) take their cards
    out into an origin of their own; then cards on one stored page or one snapshot are put together whatever the
    grouping said (同一份內容 is never two origins). A card no grouping has seen yet is 還在分組: shown, never counted.
    An origin counts unless it is pending, every card in it is set aside and not taken back, or the person marked it
    不用 (「不用」的出處照樣交出去，但不算). ``wrong_in_review`` (LEARN's reviews that named it) only ``with_reviews``."""
    if owner.kind != "case":
        return []
    cards = {doc["doc_id"]: doc for doc in docs.current(tenant_id, owner, "gather.source")}
    taken_back = {doc["content"]["card"] for doc in docs.current(tenant_id, owner, "gather.takeback")}
    key: dict[str, tuple[str, str]] = {}
    how: dict[tuple[str, str], str] = {}
    grouping = docs.current(tenant_id, owner, "gather.origins")
    groups = grouping[-1]["content"].get("groups") if grouping else []
    if grouping_errors(groups):
        _log.warning("gather.origins of %s is malformed: every card reads as not grouped yet", owner.id)
        groups = []
    for index, group in enumerate(groups):
        for card in group["cards"]:
            if card in cards:
                key[card] = ("group", str(index))
                how[key[card]] = group["how"]
    for split in sorted(docs.current(tenant_id, owner, "gather.split"), key=lambda doc: doc["created_at"]):
        for card in split["content"].get("cards") or []:
            if card in cards:
                key[card] = ("split", split["doc_id"])
                how[key[card]] = SPLIT_HOW
    for card in cards:
        if card not in key:
            key[card] = ("pending", card)
            how[key[card]] = PENDING_HOW
    # one stored page or one snapshot is one origin: the earliest card's place wins (a grouped place over a pending one)
    same: dict[str, list[str]] = {}
    for card, doc in cards.items():
        for mark in (f"source:{doc['content'].get('source_id')}" if doc["content"].get("source_id") else None, f"sha:{_sha(doc)}" if _sha(doc) else None):
            if mark:
                same.setdefault(mark, []).append(card)
    for members in same.values():
        if len(members) > 1:
            members.sort(key=lambda card: cards[card]["created_at"])
            target = next((key[card] for card in members if key[card][0] != "pending"), key[members[0]])
            for card in members:
                key[card] = target
    grouped: dict[tuple[str, str], list[str]] = {}
    for card, place in key.items():
        grouped.setdefault(place, []).append(card)
    marks = _latest_by(docs.current(tenant_id, owner, "gather.mark"), "origin")
    overrides = _latest_by(docs.current(tenant_id, owner, "gather.override"), "card", "key")
    named = [(doc["doc_id"], item.get("source"), {card for card in item.get("cards") or [] if isinstance(card, str)} if isinstance(item.get("cards"), list) else set())
             for doc in docs.current(tenant_id, owner, "learn.calibration")
             for item in (doc["content"].get("wrong_sources") or []) if isinstance(item, Mapping)] if with_reviews else []   # a malformed entry is skipped, never an error
    out = []
    for place, members in sorted(grouped.items(), key=lambda item: min(cards[card]["created_at"] for card in item[1])):
        members.sort(key=lambda card: cards[card]["created_at"])
        pending = place[0] == "pending"
        oid = origin_id(members, pending)
        mark = marks.get(oid)
        aside = all(cards[card]["content"].get("aside") and card not in taken_back for card in members)
        item = {
            "origin_id": oid,
            "cards": [{**cards[card]["content"], "card": card, "version": cards[card]["version"],
                       "aside": cards[card]["content"].get("aside") if card not in taken_back else "",
                       "mine": {k: {"value": doc["content"]["value"], "reason": doc["content"]["reason"]} for (c, k), doc in overrides.items() if c == card}}
                      for card in members],
            "how": SAME_TEXT_HOW if how[place] == "單獨" and len(members) > 1 else how[place],
            "pending": pending,
            "mark": {k: mark["content"].get(k) for k in ("mark", "reason", "applies")} if mark else None,
            "aside": aside,
            "counts": not pending and not aside and not (mark and mark["content"].get("mark") == NOT_USED),
        }
        if with_reviews:
            # by the cards it was marked on, so a regroup or the same page found again still finds it
            item["wrong_in_review"] = sorted({doc_id for doc_id, source, named_cards in named if source == oid or source in members or named_cards & set(members)})
        out.append(item)
    return out


def origins_behind(found: list[dict[str, Any]], cards: Iterable[str]) -> int:
    """How many counted origins stand behind these source cards (a MAP fact, a COMPUTE input): never the pages."""
    wanted = set(cards)
    return sum(1 for origin in found if origin["counts"] and any(card["card"] in wanted for card in origin["cards"]))


def marks_on_changed_groups(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, found: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """The person's marks whose group is not there any more (the pages were regrouped): shown to be looked at again,
    never applied to the new groups."""
    present = {origin["origin_id"] for origin in (found if found is not None else origins(docs, tenant_id, owner, with_reviews=False))}
    return [{"doc_id": doc["doc_id"], **{k: doc["content"].get(k) for k in ("origin", "cards", "mark", "reason")}}
            for doc in _latest_by(docs.current(tenant_id, owner, "gather.mark"), "origin").values() if doc["content"]["origin"] not in present]


def claim_state(support: list[str], oppose: list[str], searched: Mapping[str, Any] | None, read_all: bool) -> str:
    """A checkable fact's state (VERIFY 「狀態只有五種」), with two states before it: 還沒查, and 找到來源，還沒讀完 (查不到
    means 「找過，沒有」: only when the search found nothing, or every counted origin was read and none says either way)."""
    if support and oppose:
        return CLAIM_STATES[2]
    if support:
        return CLAIM_STATES[0]
    if oppose:
        return CLAIM_STATES[1]
    if not searched:
        return NOT_SEARCHED
    if searched.get("state") == UNCHECKABLE:
        return CLAIM_STATES[4]
    if searched.get("state") == "查到" and not read_all:
        return NOT_READ
    return CLAIM_STATES[3]


def _counted(found: list[dict[str, Any]]) -> tuple[dict[str, str], set[str], dict[str, str | None]]:
    origin_of, counted, sha = {}, set(), {}
    for origin in found:
        for card in origin["cards"]:
            origin_of[card["card"]] = origin["origin_id"]
            snapshot = card.get("snapshot")
            sha[card["card"]] = snapshot.get("sha256") if isinstance(snapshot, Mapping) else None
        if origin["counts"]:
            counted.add(origin["origin_id"])
    return origin_of, counted, sha


def not_usable_because(line: Mapping[str, Any]) -> str | None:
    """Why a checked claim may not stand as a fact, or None when it may -- the one rule (THINK's 「有來源」, DECIDE's
    帶進來): a checkable claim, the person's verdict on its current version that is not 不採信, and at least one
    counted supporting origin. The reason is said to the person and the model as it is, never guessed."""
    verdict = line.get("verdict")
    if line.get("sentence") != CHECKABLE:
        return "not_checkable"
    if not isinstance(verdict, Mapping) or verdict.get("verdict") not in VERDICTS:
        return "no_verdict"
    if verdict.get("earlier"):
        return "earlier"
    if verdict.get("verdict") not in VERDICTS[:2]:
        return "not_trusted"
    if not line.get("support"):
        return "no_support"
    return None


def usable_as_fact(line: Mapping[str, Any]) -> bool:
    return not_usable_because(line) is None


def checked_claims(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, found: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """The claim ledger as every block reads it (查證結果交給 THINK、DECIDE、ACT、LEARN、COLLAB).

    Only the person's stance counts (verify.stance; the AI's reading is verify.reading), and only for the claim's current
    version and the card's current snapshot; older ones are ``stale``. Support and oppose are counted origins. ``few``: a checkable claim with under MIN_ORIGINS
    origins either way (交還控制). ``verdict.earlier``: the person judged an older version of the claim."""
    if owner.kind != "case":
        return []
    origin_of, counted, sha = _counted(found if found is not None else origins(docs, tenant_id, owner, with_reviews=False))
    stances = docs.current(tenant_id, owner, "verify.stance")
    lines = []
    searches = docs.current(tenant_id, owner, "verify.search")
    verdicts = _latest_by(docs.current(tenant_id, owner, "verify.verdict"), "claim")
    for claim in docs.current(tenant_id, owner, "verify.claim"):
        content, version = claim["content"], claim["version"]
        best: dict[str, Mapping[str, Any]] = {}
        stale = 0
        for stance in stances:
            body = stance["content"]
            if body.get("claim") != claim["doc_id"]:
                continue
            card = body.get("card")
            if body.get("claim_version") != version or not sha.get(card) or body.get("snapshot") != sha.get(card):
                stale += 1
                continue
            if card not in best or _rank(stance) >= _rank(best[card]):
                best[card] = stance
        sides: dict[str, set[str]] = {"支持": set(), "反對": set()}
        read_origins = set()
        for card, stance in best.items():
            if origin_of.get(card) in counted:
                read_origins.add(origin_of[card])
                if stance["content"].get("stance") in sides:
                    sides[stance["content"]["stance"]].add(origin_of[card])
        support, oppose = sorted(sides["支持"]), sorted(sides["反對"])
        checkable = content.get("sentence") == CHECKABLE
        current_searches = [doc for doc in searches if doc["content"].get("claim") == claim["doc_id"] and doc["content"].get("claim_version") == version]
        searched = sorted(current_searches, key=lambda doc: doc["at"])[-1]["content"] if current_searches else None   # stable: same-second saves keep their order
        verdict = verdicts.get(claim["doc_id"])
        lines.append({
            "claim_id": claim["doc_id"], "version": version, "text": content.get("text"), "sentence": content.get("sentence"),
            "law": bool(content.get("law")),
            "state": claim_state(support, oppose, searched, bool(counted) and counted <= read_origins) if checkable else NOT_CHECKABLE,
            "support": support, "oppose": oppose, "stale": stale,
            "few": checkable and len(set(support) | set(oppose)) < MIN_ORIGINS,
            "verdict": {**{key: verdict["content"].get(key) for key in ("verdict", "reason")}, "earlier": verdict["content"].get("claim_version") != version} if verdict else None,
        })
    return [{**line, "usable": usable_as_fact(line)} for line in lines]


def calc_results(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, found: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Every calculation run in the case (計算結果交給 DECIDE、ACT), with the person's 採用／不採用. ``input_origins``: each
    outside number's counted independent origins (the person's own numbers have none); ``thin_inputs``: those under
    MIN_ORIGINS."""
    if owner.kind != "case":
        return []
    origin_of, counted, _ = _counted(found if found is not None else origins(docs, tenant_id, owner, with_reviews=False))
    adopts = _latest_by(docs.current(tenant_id, owner, "compute.adopt"), "run")
    out = []
    for run in docs.current(tenant_id, owner, "compute.run"):
        content = run["content"]
        outside = [item for item in content.get("inputs") or [] if isinstance(item, Mapping) and not item.get("own")]
        counts = {item.get("name"): len({origin_of[card] for card in item.get("cards") or [] if origin_of.get(card) in counted}) for item in outside}
        thin = [item.get("name") for item in outside if counts[item.get("name")] < MIN_ORIGINS]
        adopt = adopts.get(run["doc_id"])
        out.append({
            "run_id": run["doc_id"], "version": run["version"], "at": run["at"],
            **{key: content.get(key) for key in ("question", "label", "algorithm", "formula", "inputs", "scenarios", "result", "flip", "rules", "request", "rerun_of")},
            "input_origins": counts, "thin_inputs": thin,
            "adopt": {key: adopt["content"].get(key) for key in ("adopt", "reason")} if adopt else None,
        })
    return out


class CaseEvidence:
    """What an AI turn may read of the counts (``read.evidence``): only the parts whose kinds the action lists in
    ``reads`` -- origins need gather.source, claims verify.claim, calculations compute.run; LEARN's reviews only with
    learn.calibration."""

    def __init__(self, docs: CaseDocs, tenant_id: str, owner: record_log.Owner, reads: Iterable[str]) -> None:
        self._docs, self._tenant_id, self._owner, self._reads = docs, tenant_id, owner, frozenset(reads)

    def _need(self, kind: str) -> None:
        if kind not in self._reads:
            raise InvariantViolation(f"AI_READ_REFUSED: this turn does not read {kind}")

    def origins(self) -> list[dict[str, Any]]:
        self._need("gather.source")
        return origins(self._docs, self._tenant_id, self._owner, with_reviews="learn.calibration" in self._reads)

    def claims(self) -> list[dict[str, Any]]:
        self._need("verify.claim")
        return checked_claims(self._docs, self._tenant_id, self._owner)

    def calcs(self) -> list[dict[str, Any]]:
        self._need("compute.run")
        return calc_results(self._docs, self._tenant_id, self._owner)
