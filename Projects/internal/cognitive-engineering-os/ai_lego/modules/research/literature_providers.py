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
import time
import urllib.parse
import urllib.request
from typing import Any, Callable

from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.evidence_triangulation import NEEDS_HUMAN_REVIEW, offline_literature_search

PROVIDER_OFFLINE = "offline"
PROVIDER_OPENALEX = "openalex"
REGISTERED_PROVIDERS = frozenset({PROVIDER_OFFLINE, PROVIDER_OPENALEX})

OPENALEX_HOST = "api.openalex.org"
OPENALEX_WORKS_URL = f"https://{OPENALEX_HOST}/works"
EGRESS_ALLOWLIST_ENV = "COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST"
EGRESS_MAILTO_ENV = "COGNITIVE_OS_EGRESS_MAILTO"
DEFAULT_PER_PAGE = 10
MAX_PER_PAGE = 50
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_BODY_BYTES = 4 * 1024 * 1024  # 50 works with abstracts is ~1 MB; anything larger is not a search result
ONLINE_SOURCE_UNVERIFIED = "ONLINE_SOURCE_UNVERIFIED"  # registered in specs/execution/status-codes.schema.yaml

SOURCE_KIND_OPENALEX = "OPENALEX_WORK"
_OPENALEX_WORK_TOKEN = re.compile(r"^W[0-9]+$")


def egress_allowlist(environ: dict[str, str] | None = None) -> frozenset[str]:
    """Comma-separated bare hostnames. A scheme/port/path in an entry is a configuration error, named loudly
    (hostnames are not secret) instead of silently never matching."""
    env = os.environ if environ is None else environ
    raw = env.get(EGRESS_ALLOWLIST_ENV, "")
    hosts: set[str] = set()
    for entry in raw.split(","):
        host = entry.strip().lower()
        if not host:
            continue
        if any(ch in host for ch in "/:\\ \t") or host.startswith("."):
            raise InvariantViolation(f"EGRESS_ALLOWLIST_ENTRY_INVALID: {host!r} must be a bare hostname (no scheme, port, or path)")
        hosts.add(host)
    return frozenset(hosts)


class _NoCrossHostRedirects(urllib.request.HTTPRedirectHandler):
    """Every redirect hop is re-gated by the same allowlist as the first hop -- the egress invariant holds for
    the whole request, not only for the URL we composed."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401 -- urllib hook signature
        host = urllib.parse.urlsplit(newurl).hostname or ""
        require_egress_allowed(host)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_NoCrossHostRedirects)


def require_egress_allowed(host: str, environ: dict[str, str] | None = None) -> None:
    """EC §99 deny-by-default: an external host not on the runtime allowlist is refused before any I/O."""
    if host.lower() not in egress_allowlist(environ):
        raise InvariantViolation(
            f"NETWORK_EGRESS_DENIED: host {host!r} is not in {EGRESS_ALLOWLIST_ENV} "
            "(deny-by-default per policies/ai-execution/network-egress.yaml EGRESS-EC99-2)"
        )


def fetch_json(url: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """The only network seam in this module. GET ``url`` and decode a JSON object."""
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "cognitive-os/1.0 (+https://cognitive.aware-wave.com)"})
    started = time.monotonic()
    with _OPENER.open(request, timeout=timeout) as response:  # noqa: S310 -- host allowlisted; redirects re-gated
        body = response.read(MAX_BODY_BYTES + 1)
    if len(body) > MAX_BODY_BYTES:
        raise InvariantViolation(f"LITERATURE_PROVIDER_MALFORMED_RESPONSE: body exceeds {MAX_BODY_BYTES} bytes")
    if time.monotonic() - started > timeout * 2:
        raise InvariantViolation(f"LITERATURE_PROVIDER_UNAVAILABLE: provider exceeded the {timeout * 2:.0f}s wall-clock deadline")
    parsed = json.loads(body.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise InvariantViolation("LITERATURE_PROVIDER_MALFORMED_RESPONSE: top-level JSON is not an object")
    return parsed


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


def _citation(work: dict[str, Any], authors: list[str], venue: str | None) -> str:
    year = work.get("publication_year")
    title = work.get("display_name") or work.get("title") or "(untitled)"
    lead = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "") if authors else "Unknown author"
    parts = [lead, f"({year})" if year else "(n.d.)", str(title)]
    if venue:
        parts.append(venue)
    doi = work.get("doi")
    if isinstance(doi, str) and doi:
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
    item: dict[str, Any] = {
        "literature_id": literature_id,
        "title": title.strip(),
        "citation": _citation(work, authors, venue),
        # `citation` and `abstract` are composed locally from provider fields (formatter / inverted-index rebuild),
        # so they carry their own CALCULATED provenance; the raw provider fields are the quoted SOURCE_FACTs.
        "derived_provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        "source_kind": SOURCE_KIND_OPENALEX,
        "authors": authors,
        "publication_year": work.get("publication_year"),
        "venue": venue,
        "doi": work.get("doi"),
        "url": work_id,
        "open_access": bool((work.get("open_access") or {}).get("is_oa")) if isinstance(work.get("open_access"), dict) else False,
        "cited_by_count": work.get("cited_by_count"),
        "abstract": _abstract_from_inverted(work.get("abstract_inverted_index")),
        "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
    }
    return item


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
    return openalex_literature_search(payload.get("research.question"), per_page=per_page)
