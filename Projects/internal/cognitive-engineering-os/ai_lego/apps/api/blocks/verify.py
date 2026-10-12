"""VERIFY's routes, besides the generic ones (/docs, /ai, /evidence):

    GET  /blocks/verify/spec                               the lists the page shows (versions, maintainers, licences)
    POST /projects/{project_id}/verify/messages            {text, form, url?}  a pasted message, stamped with its sha256
    POST /projects/{project_id}/verify/factcheck           {message | claim}   ask collect the place's fact-check databases
    POST /projects/{project_id}/verify/claims/{claim}/search {angles?, confirm}  「去查」: a collection run for one claim
                                                           version, one open at a time (409 VERIFY_SEARCH_ALREADY_RUNNING)
    GET  /projects/{project_id}/verify/ledger              the ledger with what VERIFY adds to evidence.checked_claims (each line's
                                                           plain-words sentence and what is still worth checking, and an overview:
                                                           the system's, kinds/verify.py), the databases a look-up sends the words
                                                           to here, the cards only you read
    POST /projects/{project_id}/verify/stances             {content, doc_id?, base_version?}  your stance, its quote checked
    POST /projects/{project_id}/verify/stances/confirm     {reading, claim}  confirm every AI reading of one claim at once
                                                           (every stance or none)

Nothing about a message is looked up or shown before its first reaction (block_hooks.verify.require_first). The
fact-check databases are collect's (collect_lookups, specs/wire/lookup.v1.json): the engine reaches nothing outside. A hit
is stored as a source like any other (repo.add_source, written as GATHER; GATHER's hook cards it), never the message.
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _call, _kind, _save, _saved, _where, case_owner
from ai_lego.core.domain.evidence_words import CHECKABLE, FOUND, MIN_ORIGINS, NOT_FOUND, SENTENCE_KINDS, STANCES, UNCHECKABLE, VERDICTS, quote_in
from ai_lego.core.domain.kinds.verify import (ASKS, CHECK_QUESTIONS, FACTCHECK_ANGLE, LAW_UNCONFIRMED, MESSAGE_FORMS, SEARCH_ANGLES, SEARCH_LANGUAGES, SEARCH_PROVIDERS,
                                               SPREAD, claim_key, law_unconfirmed, ledger_overview, ledger_sentence, weak_line, what_next)
from ai_lego.core.domain.source import COLLECTED_PROVENANCE, source_record
from ai_lego.data.events import record_log
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import block_hooks, evidence, safety
from ai_lego.platform.block_hooks.verify import (card_sha, hit_address, message_sha, person_reads, refuse_open_search, require_claim_version, require_first,
                                                settle_dead_runs, vouched)
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.net import collect_lookups
from ai_lego.platform.net.collection_service import CollectionServiceClient
from ai_lego.platform.rulesets.verify import FACTCHECK_DBS, TECHNIQUES

router = APIRouter()
PLACE_TAIWAN = "台灣"
NO_ATTRIBUTION = "找資料的服務沒有附上這份資料的出處和授權，所以先不用"


@router.get("/blocks/verify/spec")
def verify_spec(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    dbs = FACTCHECK_DBS.items
    return {
        "forms": list(MESSAGE_FORMS), "sentence_kinds": list(SENTENCE_KINDS), "checkable": CHECKABLE, "stances": list(STANCES), "verdicts": list(VERDICTS),
        "asks": list(ASKS), "spread": [{"key": key, "question": question} for key, question, _ in SPREAD], "check_questions": list(CHECK_QUESTIONS),
        "angles": list(SEARCH_ANGLES), "search_by": list(SEARCH_PROVIDERS.values()), "min_origins": MIN_ORIGINS, "law_unconfirmed": LAW_UNCONFIRMED,
        "techniques": {"title": TECHNIQUES.title, "version": TECHNIQUES.version, "maintainer": TECHNIQUES.maintainer, "items": TECHNIQUES.items},
        "factcheck_dbs": {"title": FACTCHECK_DBS.title, "version": FACTCHECK_DBS.version, "maintainer": FACTCHECK_DBS.maintainer,
                          "dbs": {key: {k: db[k] for k in ("name", "by")} for key, db in dbs["dbs"].items()}},
    }


class MessageBody(BaseModel):
    text: str
    form: str
    url: str | None = None


@router.post("/projects/{project_id}/verify/messages")
def paste_message(project_id: str, body: MessageBody, session: dict[str, Any] = Depends(api.require_session),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The system stamps the sha256 of the text as it was pasted (系統替訊息原文存一份當時的樣子)."""
    owner = case_owner(project_id, session, repo)
    content = {"text": body.text, "form": body.form, "sha256": message_sha(body.text), **({"url": body.url.strip()} if body.url and body.url.strip() else {})}
    return _save(repo, session, owner, _kind("verify.message", "case"), DocBody(content=content))


def _factcheck_plan(docs: CaseDocs, session: dict[str, Any], owner: record_log.Owner) -> tuple[str, dict[str, Any]]:
    """The place whose list is used, and that list: only 「你在哪裡」 is read (VERIFY 卡: 只讀這一項，用來換成當地的查核組織)."""
    place = PLACE_TAIWAN if safety.covers(_where(docs, session["tenant_id"], session["identity_id"], owner)) else ""
    rules = FACTCHECK_DBS.items
    return place, rules["places"].get(place) or rules["elsewhere"]


def collect_asks(plan: dict[str, Any]) -> list[str]:
    """The databases of a place's list that collect answers, in the list's order: only these are sent the words (lookup.v1
    ``dbs``; someone outside Taiwan never sends them to Cofacts). The page says exactly these before a look-up."""
    return [db for db in plan["use"] if db in collect_lookups.DBS]


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _store_hit(repo: ProjectSourceRepository, cas: TenantScopedCas, session: dict[str, Any], project: dict[str, Any], hit: dict[str, Any], db: str) -> str:
    """One fact-check result as a source of the case (written as GATHER, rules §4): the same (database, report, claim) is
    the same source; changed words are its next version."""
    tenant_id, project_id = session["tenant_id"], project["project_id"]
    content = hit["text"].encode("utf-8")
    cas_path = TenantScopedCas.cas_path_for(tenant_id, content)
    current = repo.find_active_source(tenant_id, project_id, hit["address"])
    if current is not None and current["content_sha256"] == cas_path["hash"]:
        return current["source_id"]
    source_id = str(uuid.uuid4())
    record = source_record(source_id, project_id, tenant_id, hit["title"][:300], "text/plain", project["data_classification"], cas_path["hash"], len(content),
                           TenantScopedCas.artifact_uri(tenant_id, project_id, source_id, cas_path), session["identity_id"], _now(),
                           published_at=hit["date"] or None, canonical_url=hit["address"], source_uri=hit["url"], fetched_at=_now(), provenance=COLLECTED_PROVENANCE,
                           source_class="fact_check", relevance={"searchProvider": db, "searchAngle": FACTCHECK_ANGLE, "pasted": False},
                           supersedes_source_id=current["source_id"] if current else None)
    put = lambda: cas.put(tenant_id, content)   # noqa: E731
    if current is None:
        repo.add_source(record, cas_path, put_content=put, writer=record_log.system("GATHER"))
    else:
        repo.supersede(current["source_id"], record, cas_path, put_content=put)
    return source_id


# A fact-check source's text holds who judged, the verdict word, the grounds and the link -- never the reviewed claim: it
# repeats the message almost word for word, so a reading quoting it would count a 「錯誤」 report as support. The claim and
# the attribution stay in the verify.factcheck record (the page shows them from there).
def _claimreview_hits(entry: dict[str, Any], local: list[str]) -> list[dict[str, Any]]:
    is_local = lambda hit: any(host in hit["publisher_url"] or host in hit["url"] for host in local)   # noqa: E731
    out = []
    for hit in sorted(entry["hits"], key=lambda hit: not is_local(hit)):   # 當地的查核組織 first
        judged = hit["judged_as"] or "資料檔裡沒有寫"
        page = "\n".join((
            f"查核組織：{hit['publisher']}" + (f"（{hit['publisher_url']}）" if hit["publisher_url"] else ""),
            f"他們的判定：{judged}",
            f"發布日期：{hit['date'] or '資料檔裡沒有寫'}",
            f"查核報告：{hit['url']}",
        ))
        out.append({"address": hit_address("claimreview", hit["url"], hit["claim"]), "url": hit["url"], "title": f"{hit['publisher']} 的查核：{judged}"[:300],
                    "text": page, "date": hit["date"],
                    "shown": {"publisher": hit["publisher"], "judged_as": hit["judged_as"], "date": hit["date"], "url": hit["url"], "local": is_local(hit),
                              "claim": hit["claim"], **({"claimant": hit["claimant"]} if hit["claimant"] else {}), **({"license": hit["license"]} if hit.get("license") else {})}})
    return out


def _cofacts_hits(entry: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """Articles with replies become sources (the replies: 誰判的、依據什麼); ones nobody replied to are only counted --
    without a reply nothing was judged, and the forwarded message would support itself."""
    out, unanswered = [], 0
    for article in entry["hits"]:
        if not article["replies"]:
            unanswered += 1
            continue
        lines = [f"Cofacts 真的假的：志工回應了 {len(article['replies'])} 次。", f"Cofacts 上的這一則：{article['url']}"]
        for index, reply in enumerate(article["replies"], 1):
            lines += [f"回應 {index}（{reply['judged_as']}，{reply['date'] or '沒有日期'}）：{reply['text']}"] + ([f"回應 {index} 的出處：{reply['reference']}"] if reply["reference"] else [])
        judged = "、".join(dict.fromkeys(reply["judged_as"] for reply in article["replies"]))
        out.append({"address": hit_address("cofacts", article["url"], ""), "url": article["url"], "title": f"Cofacts 志工的回應：{judged}", "text": "\n".join(lines),
                    "date": article["date"], "shown": {"publisher": "Cofacts 志工", "judged_as": judged, "date": article["date"], "url": article["url"], "local": True}})
    return out, unanswered


class FactcheckBody(BaseModel):
    message: str | None = None
    claim: str | None = None


@router.post("/projects/{project_id}/verify/factcheck")
def factcheck(project_id: str, body: FactcheckBody, session: dict[str, Any] = Depends(api.require_session),
              repo: ProjectSourceRepository = Depends(api.get_project_source_repository), cas: TenantScopedCas = Depends(api.get_source_cas),
              service: CollectionServiceClient | None = Depends(api.get_collection_service)) -> dict[str, Any]:
    """系統查別人是不是已經查過這一則: collect asks the place's databases once (only those see the words); each database of
    the place's list says 查到／查不到／無法檢查 with collect's why (collect down or no token: 無法檢查 with collect_lookups'
    why, never an error). A 查到 needs the attribution collect sent (the data's licence asks for it): without it nothing is used."""
    project = api._project_or_404(repo, session, project_id)
    owner = record_log.case(project_id)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    if (body.message is None) == (body.claim is None):
        raise HTTPException(status_code=400, detail="VERIFY_FACTCHECK_TARGET_INVALID: name a message or a claim")
    if body.message is not None:
        _call(require_first, docs, tenant_id, owner, body.message)
        target = next(doc for doc in docs.current(tenant_id, owner, "verify.message") if doc["doc_id"] == body.message)
        about: dict[str, Any] = {"message": target["doc_id"]}
    else:
        target = next((doc for doc in docs.current(tenant_id, owner, "verify.claim") if doc["doc_id"] == body.claim), None)
        if target is None:
            raise HTTPException(status_code=404, detail=f"VERIFY_CLAIM_NOT_FOUND: {body.claim!r}")
        if target["content"].get("message"):
            _call(require_first, docs, tenant_id, owner, target["content"]["message"])
        about = {"claim": target["doc_id"], "claim_version": target["version"]}
    text = target["content"]["text"]

    def still_this_version() -> None:   # a claim's result is filed for the version whose words were looked up
        if "claim" in about:
            require_claim_version(docs, tenant_id, owner, about["claim"], about["claim_version"])

    place, plan = _factcheck_plan(docs, session, owner)
    answered = {entry["db"]: entry for entry in collect_lookups.factcheck(project_id, text, client=service, dbs=collect_asks(plan))}
    _call(still_this_version)   # edited while collect answered: nothing is stored for the old words (409, ask again)
    results, stored = [], []
    for db in plan["use"]:
        if db == "google":
            results.append({"db": db, "state": UNCHECKABLE, "why": "平台還沒有這個金鑰", "hits": []})
            continue
        entry = answered[db]
        if entry["state"] != FOUND:
            results.append({"db": db, "state": entry["state"], "why": entry["why"], "attribution": entry["attribution"], "hits": []})
            continue
        if not entry["attribution"].strip():
            results.append({"db": db, "state": UNCHECKABLE, "why": NO_ATTRIBUTION, "attribution": "", "hits": []})
            continue
        hits, unanswered = (_claimreview_hits(entry, plan["local_publishers"]), 0) if db == "claimreview" else _cofacts_hits(entry)
        shown, addresses = [], set()
        for hit in hits:
            if hit["address"] in addresses:   # the same report and claim twice in one answer: the first stands (a second would supersede it)
                continue
            addresses.add(hit["address"])
            source_id = _store_hit(repo, cas, session, project, hit, db)
            stored.append(source_id)
            shown.append({"source_id": source_id, **hit["shown"]})
        waiting = f"{'另外' if shown else ''}有 {unanswered} 則相近的訊息有人問過，還沒有人回應" if unanswered else ""
        results.append({"db": db, "state": FOUND if shown else NOT_FOUND, "attribution": entry["attribution"], "hits": shown, **({"why": waiting} if waiting else {})})
    record = {"kind": "verify.factcheck", "content": {**about, "place": place, "dbs": results, "rules": FACTCHECK_DBS.stamp()}}
    [saved] = _call(docs.save_many, tenant_id, owner, [record], record_log.system("VERIFY"), check=still_this_version)
    if stored:   # GATHER cards them (idempotent; its slot stays dark: written by the system)
        block_hooks.after_sources(docs, tenant_id, owner, {"run": None, "source_ids": stored, "aside": [], "channels": [], "pasted": False})
    return saved


class SearchBody(BaseModel):
    angles: list[str] | None = None
    confirm: bool = False


@router.post("/projects/{project_id}/verify/claims/{claim_id}/search")
def search_claim(project_id: str, claim_id: str, body: SearchBody, response: Response, session: dict[str, Any] = Depends(api.require_session),
                 store: IdentityStore = Depends(api.get_store), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                 service: CollectionServiceClient | None = Depends(api.get_collection_service)) -> dict[str, Any]:
    """「去查」: one collection run for one checkable claim (the collector wire v2's claim seed), plan first, then confirm;
    the run is remembered for the claim's version (verify.lookup) so its end writes verify.search for it. One open run per
    claim version: refused before any run is made, and again in the lookup's own save before collect is asked (a second
    request racing the first loses there, its run failed with nothing sent). That save also re-checks the claim is still
    at the version read here (require_claim_version): a claim edited meanwhile fails the run before its old words go out."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    claim = next((doc for doc in docs.current(tenant_id, owner, "verify.claim") if doc["doc_id"] == claim_id), None)
    if claim is None:
        raise HTTPException(status_code=404, detail=f"VERIFY_CLAIM_NOT_FOUND: {claim_id!r}")
    if claim["content"].get("sentence") != CHECKABLE:
        raise HTTPException(status_code=400, detail="VERIFY_CLAIM_NOT_CHECKABLE: only a checkable fact is searched")
    if claim["content"].get("message"):
        _call(require_first, docs, tenant_id, owner, claim["content"]["message"])
    angles = body.angles if body.angles is not None else list(SEARCH_ANGLES)
    if not angles or any(angle not in SEARCH_ANGLES for angle in angles) or len(set(angles)) != len(angles):
        raise HTTPException(status_code=400, detail=f"VERIFY_SEARCH_ANGLES_INVALID: a non-empty choice of {list(SEARCH_ANGLES)}")
    text = claim["content"]["text"][:200]
    languages = [api.query_language(text)]   # the claim's own language only: no translation of a claim exists, and a mixed query finds noise
    seed = api.CollectionSeed(uri=f"entity://claim/{claim_id.replace('-', '')[:12]}", meta={
        "kind": "claim", "entityName": text, "angles": angles, "languages": languages, "providers": list(SEARCH_PROVIDERS)})
    version = claim["version"]
    if body.confirm:
        _call(refuse_open_search, docs, tenant_id, owner, claim_id, version)

    def still_this_version() -> None:   # under the lookup's write lock: the text in ``seed`` is the version reserved
        require_claim_version(docs, tenant_id, owner, claim_id, version)
        refuse_open_search(docs, tenant_id, owner, claim_id, version)

    def reserve(run_id: str) -> None:
        lookup = {"kind": "verify.lookup", "content": {"claim": claim_id, "claim_version": version, "run": run_id, "angles": angles, "languages": languages}}
        _call(docs.save_many, tenant_id, owner, [lookup], record_log.system("VERIFY"), check=still_this_version)

    return api.start_collection(project_id, api.CollectionRequest(seeds=[seed], confirm=body.confirm), response, session, store, repo, service, reserve=reserve)


@router.get("/projects/{project_id}/verify/ledger")
def ledger(project_id: str, session: dict[str, Any] = Depends(api.require_session),
           repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """主張帳本: evidence.checked_claims (the one count) plus what VERIFY shows beside it -- the three things apart (找得到
    出處 ✓, 出處彼此獨立 ✓, 出處站得住: never ticked, only what was found), 法律 未確認, 「你查過」 in this case, the search."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    settle_dead_runs(docs, tenant_id, owner)   # a run that will never call back reads 無法檢查 here, not 還沒查 for ever
    found = evidence.origins(docs, tenant_id, owner, with_reviews=False)
    by_origin = {origin["origin_id"]: origin for origin in found}
    claims = {doc["doc_id"]: doc for doc in docs.current(tenant_id, owner, "verify.claim")}   # oldest first (CaseDocs.current)
    order = {claim_id: index for index, claim_id in enumerate(claims)}
    # every record about one claim is about one version of it: version 1's run or result is never shown on version 2
    lookups = {(doc["content"]["claim"], doc["content"]["claim_version"]): doc for doc in sorted(docs.current(tenant_id, owner, "verify.lookup"), key=lambda doc: doc["at"])}
    searches = {(doc["content"]["claim"], doc["content"]["claim_version"]): doc for doc in sorted(docs.current(tenant_id, owner, "verify.search"), key=lambda doc: doc["at"])}
    lines = []
    for line in evidence.checked_claims(docs, tenant_id, owner, found):
        claim = claims[line["claim_id"]]
        read_origins = sorted(set(line["support"]) | set(line["oppose"]))
        stands = [{"origin_id": oid, "how": by_origin[oid]["how"], "cards": [{"card": card["card"], "title": card.get("title"), "url": card.get("url"),
                   "operator": (card.get("cells") or {}).get("operator"), "original": (card.get("cells") or {}).get("original"), "lists": card.get("lists") or [],
                   "mine": card.get("mine") or {}} for card in by_origin[oid]["cards"]]} for oid in read_origins if oid in by_origin]
        lookup = lookups.get((line["claim_id"], line["version"]))
        run = repo.get_collection_run(tenant_id, project_id, lookup["content"]["run"]) if lookup else None
        search = searches.get((line["claim_id"], line["version"]))
        key = claim_key(claim["content"].get("text"))
        entry = {
            **line, "message": claim["content"].get("message"), "from": claim["content"].get("from"),
            "law_state": LAW_UNCONFIRMED if law_unconfirmed(claim["content"]) else ("寫了法域、時效、來源" if claim["content"].get("law") else None),
            "needs_alternative": claim["content"].get("sentence") == SENTENCE_KINDS[1] and not (claim["content"].get("alternative") or "").strip(),
            "earlier": [other for other, doc in claims.items() if order[other] < order[line["claim_id"]] and claim_key(doc["content"].get("text")) == key],
            "weak_line": weak_line(len(line["support"]), len(line["oppose"])) if line["few"] else None,
            "three": {"found": bool(read_origins), "independent": len(read_origins), "independent_enough": len(read_origins) >= MIN_ORIGINS, "stands": stands},
            "search": {key_: search["content"].get(key_) for key_ in ("state", "why")} if search else None,
            "lookup": {"run": lookup["content"]["run"], "status": run["status"] if run else "failed", "angles": lookup["content"].get("angles") or []} if lookup else None,
        }
        lines.append({**entry, "said": ledger_sentence(entry), "next": what_next(entry)})   # the summary and the 還該查什麼 list: the system's words, no AI
    _, plan = _factcheck_plan(docs, session, owner)
    return {"claims": lines, "overview": ledger_overview(lines), "min_origins": MIN_ORIGINS, "factcheck_asks": collect_asks(plan),
            "person_reads": [doc["doc_id"] for doc in docs.current(tenant_id, owner, "gather.source") if person_reads(doc["content"])]}


class StanceBody(BaseModel):
    content: dict[str, Any]
    doc_id: str | None = None
    base_version: int | None = None


@router.post("/projects/{project_id}/verify/stances")
def save_stance(project_id: str, body: StanceBody, session: dict[str, Any] = Depends(api.require_session),
                repo: ProjectSourceRepository = Depends(api.get_project_source_repository), cas: TenantScopedCas = Depends(api.get_source_cas)) -> dict[str, Any]:
    """Your reading of one card for one claim. A quote you type must be the card's own stored words (引文對得上原文)."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    spec = _kind("verify.stance", "case")
    quote = body.content.get("quote")
    if not (isinstance(quote, str) and quote.strip()):
        return _save(repo, session, owner, spec, DocBody(content=body.content, base_version=body.base_version), body.doc_id)
    card = next((doc for doc in docs.current(tenant_id, owner, "gather.source") if doc["doc_id"] == body.content.get("card")), None)
    if card is None:
        raise HTTPException(status_code=404, detail=f"VERIFY_CARD_NOT_FOUND: {str(body.content.get('card'))[:64]!r}")
    page = repo.active_source_reader(cas, tenant_id, project_id)(card["content"].get("source_id") or "")
    if page is None or not quote_in(quote, page[1]):
        raise HTTPException(status_code=400, detail="VERIFY_QUOTE_NOT_IN_SOURCE: the quote is not the card's stored words (at least 6 characters, copied exactly)")
    with vouched(card["doc_id"], quote):
        return _save(repo, session, owner, spec, DocBody(content=body.content, base_version=body.base_version), body.doc_id)


class ConfirmBody(BaseModel):
    reading: str
    claim: str


@router.post("/projects/{project_id}/verify/stances/confirm")
def confirm_readings(project_id: str, body: ConfirmBody, session: dict[str, Any] = Depends(api.require_session),
                     repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """One click for every AI reading of one claim -- still your save, one stance each, and every one or none: each
    stance's checks (block_hooks.verify) run under the write lock that saves them all, so a claim edited meanwhile leaves
    nothing half-confirmed. A card you already read for this claim's current version and page is left alone, and so is a
    reading of an older claim version or page (both counted as skipped); a stance of yours read from an older version or
    page no longer counts, so this one replaces it (one live stance per claim and card; the old one stays in its history)."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    reading = next((doc for doc in docs.current(tenant_id, owner, "verify.reading") if doc["doc_id"] == body.reading), None)
    claim = next((doc for doc in docs.current(tenant_id, owner, "verify.claim") if doc["doc_id"] == body.claim), None)
    if reading is None or claim is None:
        raise HTTPException(status_code=404, detail="VERIFY_READING_NOT_FOUND: no such AI reading or claim in this case")
    cards = {doc["doc_id"]: card_sha(doc) for doc in docs.current(tenant_id, owner, "gather.source")}
    held = {doc["content"].get("card"): doc for doc in docs.current(tenant_id, owner, "verify.stance") if doc["content"].get("claim") == body.claim}
    items, skipped = [], 0
    for entry in reading["content"].get("readings") or []:
        if entry.get("claim") != body.claim:
            continue
        mine = held.get(entry.get("card"))
        current = mine is not None and (mine["content"].get("claim_version"), mine["content"].get("snapshot")) == (claim["version"], cards.get(entry.get("card")))
        twice = any(item["content"]["card"] == entry.get("card") for item in items)
        if current or twice or entry.get("claim_version") != claim["version"] or entry.get("snapshot") != cards.get(entry.get("card")):
            skipped += 1
            continue
        content = {key: entry[key] for key in ("claim", "claim_version", "card", "snapshot") if key in entry}
        content.update(stance=entry["reads_as"], reading=body.reading, **({"quote": entry["quote"]} if entry.get("quote") else {}))
        items.append({"kind": "verify.stance", "content": content, "doc_id": mine["doc_id"] if mine else None, "base_version": mine["version"] if mine else None})

    def check() -> None:
        for item in items:
            block_hooks.before_save(docs, tenant_id, owner, item["kind"], item["content"], item["doc_id"])

    saved = _call(docs.save_many, tenant_id, owner, items, api._me(session, "VERIFY"), check=check) if items else []
    return {"saved": len(saved), "skipped": skipped, "notices": [notice for doc in saved for notice in _saved(repo, session, owner, doc)["notices"]]}
