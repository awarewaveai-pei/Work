"""``literature_search`` capability adapter with a registered network provider (OpenAlex).

Provider selection is data, not config: the Recipe binds ``research.provider`` from the caller's Source.
Missing/``offline`` keeps the deterministic fixture corpus (``OFFLINE_SOURCE_STALE``, unchanged contract
behaviour); ``openalex`` performs a real HTTPS search.  EC §99 deny-by-default is enforced at RUNTIME, not
only in the policy YAML: the provider host must appear in ``COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST``
(comma-separated hostnames) or the call is refused BEFORE any socket is opened.  A provider failure is an
explicit ``InvariantViolation``; it never silently degrades to the fixture corpus pretending to be a search.

Traps for future readers:
- ``fetch_json`` is the single network seam; tests monkeypatch it -- do not call ``urlopen`` elsewhere here.
- OpenAlex ``abstract_inverted_index`` is a word->positions map, not text; ``_abstract_from_inverted`` rebuilds it.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.parse
from typing import Any, Callable

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.evidence_triangulation import NEEDS_HUMAN_REVIEW, offline_literature_search
from ai_lego.platform.net.egress import (  # noqa: F401 -- re-exported: tests and callers patch/import these names here
    EGRESS_ALLOWLIST_ENV,
    _NoCrossHostRedirects,
    _OPENER,
    egress_allowlist,
    require_egress_allowed,
)
from ai_lego.platform.net.egress import fetch_json as _egress_fetch_json

PROVIDER_OFFLINE = "offline"
PROVIDER_OPENALEX = "openalex"
PROVIDER_CROSSREF = "crossref"
REGISTERED_PROVIDERS = frozenset({PROVIDER_OFFLINE, PROVIDER_OPENALEX, PROVIDER_CROSSREF})

OPENALEX_HOST = "api.openalex.org"
OPENALEX_WORKS_URL = f"https://{OPENALEX_HOST}/works"
CROSSREF_HOST = "api.crossref.org"
CROSSREF_WORKS_URL = f"https://{CROSSREF_HOST}/works"
CROSSREF_SELECT_FIELDS = "DOI,title,author,container-title,published,published-print,published-online,issued,is-referenced-by-count,URL,abstract"
_DOI_PATTERN = re.compile(r"^10\.\d{4,9}/\S+$")
EGRESS_MAILTO_ENV = "COGNITIVE_OS_EGRESS_MAILTO"
DEFAULT_PER_PAGE = 10
MAX_PER_PAGE = 50
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_BODY_BYTES = 4 * 1024 * 1024  # 50 works with abstracts is ~1 MB; anything larger is not a search result
ONLINE_SOURCE_UNVERIFIED = "ONLINE_SOURCE_UNVERIFIED"  # registered in specs/execution/status-codes.schema.yaml

SOURCE_KIND_OPENALEX = "OPENALEX_WORK"
SOURCE_KIND_CROSSREF = "CROSSREF_WORK"
_OPENALEX_WORK_TOKEN = re.compile(r"^W[0-9]+$")


def fetch_json(url: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """The only network seam in this module (delegates to platform.net.egress; tests patch this name)."""
    return _egress_fetch_json(url, timeout, max_bytes=MAX_BODY_BYTES, error_prefix="LITERATURE_PROVIDER")


def _abstract_from_inverted(index: Any) -> str | None:
    if not isinstance(index, dict) or not index:
        return None
    positions: list[tuple[int, str]] = []
    for word, slots in index.items():
        if isinstance(slots, list):
            positions.extend((slot, str(word)) for slot in slots if isinstance(slot, int))
    if not positions:
        return None
    positions.sort()
    return " ".join(word for _, word in positions)


def _authors(work: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for authorship in work.get("authorships") or []:
        if isinstance(authorship, dict):
            author = authorship.get("author") or {}
            name = author.get("display_name") if isinstance(author, dict) else None
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _venue(work: dict[str, Any]) -> str | None:
    location = work.get("primary_location") or {}
    source = location.get("source") if isinstance(location, dict) else None
    name = source.get("display_name") if isinstance(source, dict) else None
    return name if isinstance(name, str) and name.strip() else None


_DOI_URL_PREFIX = re.compile(r"^\s*(?:doi\s*:\s*|https?://(?:dx\.)?doi\.org/)", re.IGNORECASE)


def _normalize_doi(raw: Any) -> str | None:
    """Bare ``10.xxxx/yyyy`` DOI, regardless of which URL/prefix form a provider reported it in. OpenAlex's own
    API returns ``https://doi.org/10.xxxx/yyyy``; Crossref's returns the bare form -- this makes the ``doi``
    field's shape identical across providers (research.citation_verification's DOI-format check assumes bare
    form, matching the field's own name; the resolvable link stays a caller's job, e.g. ``https://doi.org/`` + doi)."""
    if not isinstance(raw, str):
        return None
    bare = _DOI_URL_PREFIX.sub("", raw).strip()
    return bare or None


def _citation(work: dict[str, Any], authors: list[str], venue: str | None, doi: str | None) -> str:
    year = work.get("publication_year")
    title = work.get("display_name") or work.get("title") or "(untitled)"
    lead = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "") if authors else "Unknown author"
    parts = [lead, f"({year})" if year else "(n.d.)", str(title)]
    if venue:
        parts.append(venue)
    if doi:
        parts.append(doi)
    return ". ".join(parts)


def normalize_openalex_work(work: Any) -> dict[str, Any] | None:
    """One LiteratureSet item from one OpenAlex ``works`` result. Returns None for an item without an id or title
    (never fabricates a citable record from a partial one)."""
    if not isinstance(work, dict):
        return None
    work_id = work.get("id")
    title = work.get("display_name") or work.get("title")
    if not isinstance(work_id, str) or not isinstance(title, str) or not title.strip():
        return None
    literature_id = work_id.strip().rstrip("/").rsplit("/", 1)[-1]
    if not _OPENALEX_WORK_TOKEN.fullmatch(literature_id):  # e.g. "https://openalex.org/" would yield "openalex.org"
        return None
    authors = _authors(work)
    venue = _venue(work)
    doi = _normalize_doi(work.get("doi"))
    item: dict[str, Any] = {
        "literature_id": literature_id,
        "title": title.strip(),
        "citation": _citation(work, authors, venue, doi),
        # `citation` and `abstract` are composed locally from provider fields (formatter / inverted-index rebuild),
        # so they carry their own CALCULATED provenance; the raw provider fields are the quoted SOURCE_FACTs.
        "derived_provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        "source_kind": SOURCE_KIND_OPENALEX,
        "authors": authors,
        "publication_year": work.get("publication_year"),
        "venue": venue,
        "doi": doi,
        "url": work_id,
        "open_access": bool((work.get("open_access") or {}).get("is_oa")) if isinstance(work.get("open_access"), dict) else False,
        "cited_by_count": work.get("cited_by_count"),
        "abstract": _abstract_from_inverted(work.get("abstract_inverted_index")),
        "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
    }
    return item


def _crossref_authors(work: dict[str, Any]) -> list[str]:
    authors = work.get("author")
    if not isinstance(authors, list):
        return []
    names: list[str] = []
    for entry in authors:
        if not isinstance(entry, dict):
            continue
        # `or ""` (not `.get(key, "")`) because Crossref can report an explicit JSON null for a name part,
        # which `.get(key, "")` would pass through unchanged (found 2026-09-17: a null `given` produced the
        # literal string "None Smith", a non-empty string that then silently defeated the MISSING_AUTHORS
        # structural check downstream in research.citation_verification).
        name = f"{entry.get('given') or ''} {entry.get('family') or ''}".strip()
        if name:
            names.append(name)
    return names


def _crossref_venue(work: dict[str, Any]) -> str | None:
    container = work.get("container-title")
    if isinstance(container, list) and container and isinstance(container[0], str) and container[0].strip():
        return container[0].strip()
    return None


def _crossref_year(work: dict[str, Any]) -> int | None:
    for key in ("published", "published-print", "published-online", "issued"):
        node = work.get(key)
        if not isinstance(node, dict):
            continue
        parts = node.get("date-parts")
        if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0] and isinstance(parts[0][0], int):
            return parts[0][0]
    return None


_JATS_TAG = re.compile(r"<[^>]+>")


def _strip_jats_markup(raw: Any) -> str | None:
    """Crossref's ``abstract`` field is commonly JATS-XML-wrapped (e.g. ``<jats:p>...</jats:p>``, confirmed
    against Crossref's own REST API docs) -- unlike OpenAlex's abstract (rebuilt as genuine plain text from
    an inverted index, see ``_abstract_from_inverted``), storing it verbatim would surface raw markup to any
    downstream consumer expecting plain text. This is a tag-strip, not a full XML parser: good enough to
    remove JATS's own angle-bracket tags for display; not attempted for anything more exotic."""
    if not isinstance(raw, str):
        return None
    text = _JATS_TAG.sub(" ", raw)
    text = " ".join(text.split())
    return text or None


def _crossref_citation(title: str, authors: list[str], venue: str | None, year: int | None, doi: str) -> str:
    parts = []
    if authors:
        parts.append(", ".join(authors))
    if year is not None:
        parts.append(f"({year})")
    parts.append(title)
    if venue:
        parts.append(venue)
    parts.append(doi)
    return ". ".join(parts)


def normalize_crossref_work(work: Any) -> dict[str, Any] | None:
    """One LiteratureSet item from one Crossref ``works`` result. A DOI is Crossref's actual identity (the
    registration agency's own primary key) -- an item with no valid DOI or no title is never accepted as a
    citable record, mirroring ``normalize_openalex_work``'s refusal to fabricate from a partial one."""
    if not isinstance(work, dict):
        return None
    doi = work.get("DOI")
    title_list = work.get("title")
    title = title_list[0].strip() if isinstance(title_list, list) and title_list and isinstance(title_list[0], str) and title_list[0].strip() else None
    if not isinstance(doi, str) or _DOI_PATTERN.fullmatch(doi.strip()) is None or not title:
        return None
    doi = doi.strip()
    authors = _crossref_authors(work)
    venue = _crossref_venue(work)
    year = _crossref_year(work)
    url = work.get("URL") if isinstance(work.get("URL"), str) and work.get("URL") else f"https://doi.org/{doi}"
    return {
        "literature_id": doi,
        "title": title,
        "citation": _crossref_citation(title, authors, venue, year, doi),
        "derived_provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        "source_kind": SOURCE_KIND_CROSSREF,
        "authors": authors,
        "publication_year": year,
        "venue": venue,
        "doi": doi,
        "url": url,
        "open_access": False,  # Crossref's /works response does not report OA status -- never guess True
        "cited_by_count": work.get("is-referenced-by-count") if isinstance(work.get("is-referenced-by-count"), int) else None,
        "abstract": _strip_jats_markup(work.get("abstract")),
        "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
    }


def crossref_literature_search(
    question: str,
    *,
    per_page: int = DEFAULT_PER_PAGE,
    environ: dict[str, str] | None = None,
    fetch: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Real search against Crossref works (the DOI registration agency -- complements OpenAlex, which aggregates
    Crossref plus other sources, with DOI-registrant-direct metadata). Egress-gated, no key required."""
    if not isinstance(question, str) or not question.strip():
        raise InvariantViolation("LITERATURE_SEARCH_QUESTION_REQUIRED")
    if not isinstance(per_page, int) or isinstance(per_page, bool) or not 1 <= per_page <= MAX_PER_PAGE:
        raise InvariantViolation(f"LITERATURE_SEARCH_PER_PAGE_INVALID: expected 1..{MAX_PER_PAGE}, got {per_page!r}")
    require_egress_allowed(CROSSREF_HOST, environ)
    env = os.environ if environ is None else environ
    params: dict[str, str] = {"query": question.strip(), "rows": str(per_page), "select": CROSSREF_SELECT_FIELDS}
    mailto = env.get(EGRESS_MAILTO_ENV, "").strip()
    if mailto:
        params["mailto"] = mailto
    url = f"{CROSSREF_WORKS_URL}?{urllib.parse.urlencode(params)}"
    try:
        payload = (fetch or fetch_json)(url)
    except InvariantViolation:
        raise
    except Exception as error:  # network/HTTP/JSON failures are explicit, never a silent fixture fallback
        raise InvariantViolation(f"LITERATURE_PROVIDER_UNAVAILABLE: crossref request failed: {type(error).__name__}: {error}") from error
    message = payload.get("message")
    if not isinstance(message, dict) or not isinstance(message.get("items"), list):
        raise InvariantViolation("LITERATURE_PROVIDER_MALFORMED_RESPONSE: missing message.items[]")
    items = [item for item in (normalize_crossref_work(work) for work in message["items"]) if item is not None]
    return {
        "literature": {
            "set_id": f"LITERATURE-SET-CROSSREF-{hashlib.sha256(question.strip().casefold().encode('utf-8')).hexdigest()[:12].upper()}",
            "query": question.strip(),
            "items": items,
            "retrieval": {
                "mode": "ONLINE_PROVIDER",
                "provider": PROVIDER_CROSSREF,
                "endpoint": CROSSREF_WORKS_URL,
                "status_code": ONLINE_SOURCE_UNVERIFIED,
                "side_state": NEEDS_HUMAN_REVIEW,
                "freshness_claim": "PROVIDER_REPORTED",
                "total_count_reported": message.get("total-results"),
                "returned_count": len(items),
                "citation_verification": "NOT_PERFORMED",
            },
        }
    }


def openalex_literature_search(
    question: str,
    *,
    per_page: int = DEFAULT_PER_PAGE,
    environ: dict[str, str] | None = None,
    fetch: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Real search against OpenAlex works. Egress-gated, no key required, polite-pool ``mailto`` optional."""
    if not isinstance(question, str) or not question.strip():
        raise InvariantViolation("LITERATURE_SEARCH_QUESTION_REQUIRED")
    if not isinstance(per_page, int) or isinstance(per_page, bool) or not 1 <= per_page <= MAX_PER_PAGE:
        raise InvariantViolation(f"LITERATURE_SEARCH_PER_PAGE_INVALID: expected 1..{MAX_PER_PAGE}, got {per_page!r}")
    require_egress_allowed(OPENALEX_HOST, environ)
    env = os.environ if environ is None else environ
    params: dict[str, str] = {"search": question.strip(), "per-page": str(per_page), "sort": "relevance_score:desc"}
    mailto = env.get(EGRESS_MAILTO_ENV, "").strip()
    if mailto:
        params["mailto"] = mailto
    url = f"{OPENALEX_WORKS_URL}?{urllib.parse.urlencode(params)}"
    try:
        payload = (fetch or fetch_json)(url)
    except InvariantViolation:
        raise
    except Exception as error:  # network/HTTP/JSON failures are explicit, never a silent fixture fallback
        raise InvariantViolation(f"LITERATURE_PROVIDER_UNAVAILABLE: openalex request failed: {type(error).__name__}: {error}") from error
    results = payload.get("results")
    if not isinstance(results, list):
        raise InvariantViolation("LITERATURE_PROVIDER_MALFORMED_RESPONSE: missing results[]")
    items = [item for item in (normalize_openalex_work(work) for work in results) if item is not None]
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    return {
        "literature": {
            "set_id": f"LITERATURE-SET-OPENALEX-{hashlib.sha256(question.strip().casefold().encode('utf-8')).hexdigest()[:12].upper()}",
            "query": question.strip(),
            "items": items,
            "retrieval": {
                "mode": "ONLINE_PROVIDER",
                "provider": PROVIDER_OPENALEX,
                "endpoint": OPENALEX_WORKS_URL,
                "status_code": ONLINE_SOURCE_UNVERIFIED,
                "side_state": NEEDS_HUMAN_REVIEW,
                "freshness_claim": "PROVIDER_REPORTED",
                "total_count_reported": meta.get("count"),
                "returned_count": len(items),
                "citation_verification": "NOT_PERFORMED",
            },
        }
    }


def literature_search_adapter(payload: dict[str, Any], node: dict[str, Any]) -> dict[str, Any]:
    """Registered ``literature_search`` adapter. Provider comes from the bound ``research.provider`` (default offline)."""
    provider = payload.get("research.provider", PROVIDER_OFFLINE)
    if not isinstance(provider, str) or provider not in REGISTERED_PROVIDERS:
        raise InvariantViolation(f"LITERATURE_PROVIDER_UNREGISTERED: {provider!r} not in {sorted(REGISTERED_PROVIDERS)}")
    if provider == PROVIDER_OFFLINE:
        return offline_literature_search(payload, node)
    per_page = payload.get("research.per_page", DEFAULT_PER_PAGE)
    question = payload.get("research.question")
    if provider == PROVIDER_OPENALEX:
        return openalex_literature_search(question, per_page=per_page)
    if provider == PROVIDER_CROSSREF:
        return crossref_literature_search(question, per_page=per_page)
    raise InvariantViolation(f"LITERATURE_PROVIDER_DISPATCH_MISSING: {provider!r} is registered in REGISTERED_PROVIDERS but has no dispatch branch here")
