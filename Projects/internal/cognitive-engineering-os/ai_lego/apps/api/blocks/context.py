"""規範與脈絡's route, besides the generic ones (/docs, /ai):

    GET /blocks/context/spec    the facets (with their version), the two questions, the four checks, the public-issue questions
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.core.domain.kinds.context import spec

router = APIRouter()


@router.get("/blocks/context/spec")
def context_spec(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    return spec()
