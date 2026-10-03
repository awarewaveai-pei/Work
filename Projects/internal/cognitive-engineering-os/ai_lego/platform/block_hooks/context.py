"""規範與脈絡 (交還控制): a high-risk word in the notes -> GOVERN adds the case's guardrails (it gets the category, never the
text); a crisis signal inside the facet notes is caught here because the generic save notice reads only top-level text."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.block_hooks.map import nested_notices, strings
from ai_lego.platform.safety.risk import high_risk_categories


def _notes_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(*strings(content)), "CONTEXT") + nested_notices(docs, tenant_id, owner, content)


AFTER_SAVE = {"context.notes": _notes_saved}
