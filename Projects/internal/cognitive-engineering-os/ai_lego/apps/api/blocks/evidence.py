"""What GATHER, VERIFY and COMPUTE hand to the other blocks, read in one place (STEP2_SHARED_RULES §3): MAP, THINK,
DECIDE, ACT and LEARN show these, never recount them.

    GET /projects/{project_id}/evidence   {"origins", "changed_marks", "claims", "calcs", "min_origins"}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import evidence

router = APIRouter()


@router.get("/projects/{project_id}/evidence")
def case_evidence(project_id: str, session: dict[str, Any] = Depends(api.require_session),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    tenant_id = session["tenant_id"]
    found = evidence.origins(docs, tenant_id, owner)
    return {"origins": found, "changed_marks": evidence.marks_on_changed_groups(docs, tenant_id, owner, found),
            "claims": evidence.checked_claims(docs, tenant_id, owner, found), "calcs": evidence.calc_results(docs, tenant_id, owner, found),
            "min_origins": evidence.MIN_ORIGINS}
