"""ACT around a save.
- High-risk words in a task or a note are GOVERN's own hook (block_hooks/govern.py).
- BEFORE_SAVE (``act.task``): a step marked irreversible needs the person's answer to 「先等一下或請人覆核」 (``hold``) when the
  case has the wait_or_review guardrail -- or when the task's own words would add it (GOVERN adds wait_or_review for every
  category it recognises, and the guardrail only exists after this save). The answer may be 「我想過了，照做」: the person decides."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.block_hooks.govern import written
from ai_lego.platform.safety.risk import high_risk_categories


def _task_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    if content.get("irreversible") is not True or content.get("hold"):
        return
    guarded = any(doc["content"].get("guardrail") == "wait_or_review" for doc in docs.current(tenant_id, owner, "govern.guardrail"))
    if guarded or high_risk_categories(*written({"kind": "act.task", "content": content})):
        raise InvariantViolation("ACT_HOLD_REQUIRED: this step cannot be undone and touches something high-risk; choose to wait, to have it reviewed, or to go ahead before saving")


BEFORE_SAVE = {"act.task": _task_checked}
