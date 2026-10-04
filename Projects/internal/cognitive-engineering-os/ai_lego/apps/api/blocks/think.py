"""THINK's one extra route: lay an AI batch out as cards.

    POST /projects/{project_id}/think/expand   {batch}   -> {"created": n}

The AI gate saves one document per turn, so a turn that gives 8 to 15 directions is one ``think.batch``. Each direction needs its own
reaction and its own pick, so it becomes one ``think.card`` -- authored by the AI, because the words are the AI's: they are copied
from the stored batch (a kind only the AI gate can write), never taken from the request. The system notes the batch as laid out
(``think.laid_out``) and a noted batch is left alone, so a card you deleted does not come back, even if you deleted them all.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation

router = APIRouter()
LAID_OUT = ("claim", "mechanism", "benefit", "risk", "assumption", "premise", "fails_when", "method")


class ExpandBody(BaseModel):
    batch: str


@router.post("/projects/{project_id}/think/expand")
def expand_batch(project_id: str, body: ExpandBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, int]:
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    batch = next((doc for doc in docs.current(tenant_id, owner, "think.batch") if doc["doc_id"] == body.batch), None)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"DOC_NOT_FOUND: {body.batch!r}")
    if any(note["content"].get("batch") == batch["doc_id"] for note in docs.current(tenant_id, owner, "think.laid_out")):
        return {"created": 0}
    content = batch["content"]
    try:
        for index, card in enumerate(content.get("cards") or []):
            docs.save(tenant_id, owner, "think.card", {**{key: card[key] for key in LAID_OUT if key in card}, "round": content["round"], "role": content["role"],
                                                      "sourced": card.get("sourced") or content["sourced"], **({"rests_on": card["rests_on"]} if card.get("rests_on") else {}),
                                                      "batch": batch["doc_id"], "batch_index": index}, record_log.ai("THINK"))
        docs.save(tenant_id, owner, "think.laid_out", {"batch": batch["doc_id"], "created": len(content.get("cards") or [])}, record_log.system("THINK"))
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"created": len(content.get("cards") or [])}
