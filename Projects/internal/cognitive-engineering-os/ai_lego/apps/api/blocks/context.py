"""規範與脈絡's route, besides the generic ones (/docs, /ai):

    GET /blocks/context/spec                      the facets (with their version), the two questions, the four checks, the public-issue questions
    GET /projects/{project_id}/context/claims     the case's claims once, from MAP's and VERIFY's lists together, with the count by kind
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain.kinds.context import case_claims, claim_counts, spec
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository

router = APIRouter()


@router.get("/blocks/context/spec")
def context_spec(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    return spec()


@router.get("/projects/{project_id}/context/claims")
def context_claims(project_id: str, session: dict[str, Any] = Depends(api.require_session),
                   repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """One case = one set of claims: MAP's claims and VERIFY's claims together, a claim carried from MAP to VERIFY counted once.
    ``claims``: {id, text, kind, from, missing} (``missing``: a 法律 claim's 法域、時效、來源 that no list has written);
    ``counts``: by kind (事實、法律、價值、文化宗教) and 其他."""
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    maps = docs.current(tenant_id, owner, "map.map")
    map_claims = [item for item in (maps[-1]["content"].get("claims") if maps else None) or [] if isinstance(item, dict)]
    verified = [{**doc["content"], "doc_id": doc["doc_id"]} for doc in docs.current(tenant_id, owner, "verify.claim")]
    claims = case_claims(map_claims, verified)
    return {"claims": claims, "counts": claim_counts(claims)}
