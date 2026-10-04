"""GATHER's route, besides the generic ones (/docs, /ai, /sources, /collections):

    GET /projects/{project_id}/gather   the source overview: origins with their cards (evidence.origins), marks on
                                        regrouped pages, how many origins count, pages set aside, the channels and why
                                        they fall short, where the pages came from, the lists and rules with their
                                        versions, the card maximum when reached, and the words the page shows -- one
                                        read for the page
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.core.domain.evidence_words import APPLIES, CARD_CELLS, FOUND_BY, MARKS, MIN_ORIGINS, OWN_WORDS, SOMEONE_SAID, STATES
from ai_lego.core.domain.kinds.gather import ANGLES, MAX_CASE_CARDS, OVERRIDABLE
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import evidence
from ai_lego.platform.block_hooks.gather import PROVIDER_NAMES, channel_state, distribution
from ai_lego.platform.rulesets import rulesets

router = APIRouter()


@router.get("/projects/{project_id}/gather")
def gather_overview(project_id: str, session: dict[str, Any] = Depends(api.require_session),
                    repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    project = api._project_or_404(repo, session, project_id)
    owner = record_log.case(project_id)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    found = evidence.origins(docs, tenant_id, owner)
    cards = [card for origin in found for card in origin["cards"]]
    intake = docs.current(tenant_id, owner, "assembler.intake")
    carded = {card.get("source_id") for card in cards if card.get("source_id")}
    uncarded = sum(1 for row in repo.list_sources(tenant_id, project_id) if row["status"] == "active" and row["source_id"] not in carded)
    full = len(cards) >= MAX_CASE_CARDS   # the hook makes no card past the maximum (block_hooks/gather.py); said here, from the facts
    return {
        "origins": found,
        "changed_marks": evidence.marks_on_changed_groups(docs, tenant_id, owner, found),
        "counted": sum(1 for origin in found if origin["counts"]),
        "min_origins": MIN_ORIGINS,
        "aside": sum(1 for card in cards if card.get("aside")),
        "channels": channel_state(cards, docs.current(tenant_id, owner, "gather.channels"), (intake[-1]["content"].get("happened_in") or []) if intake else []),
        "distribution": distribution(cards),
        "rules": [{"name": item.name, "title": item.title, "version": item.version, "maintainer": item.maintainer, "items": item.items}
                  for item in rulesets().values() if item.block == "GATHER"],
        "data_classification": project["data_classification"],
        "card_limit": {"max": MAX_CASE_CARDS, "cards": len(cards), "uncarded": uncarded if full else 0,
                       "notice": f"這個案子的來源卡已經到上限 {MAX_CASE_CARDS} 張，之後存進來的網頁沒有做卡" if full else ""},
        "words": {"cells": [{"key": key, "label": label} for key, label in CARD_CELLS], "states": list(STATES), "marks": list(MARKS), "applies": list(APPLIES),
                  "found_by": list(FOUND_BY), "own": OWN_WORDS, "someone_said": SOMEONE_SAID, "angles": [{"key": key, "name": name} for key, name in ANGLES],
                  "overridable": list(OVERRIDABLE), "providers": [{"key": key, "name": name} for key, name in PROVIDER_NAMES.items()]},
    }
