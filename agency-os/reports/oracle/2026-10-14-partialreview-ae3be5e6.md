# codex-oracle review -- 2026-10-14 08:48:04 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Block AI turns whose max_tokens can outrun the 85 s request (8000-token EXPRESS draft ~118 s at ~68 tok/s) run in the background. ai_gate: _prepare (permission, crisis stop, hand-back, sources; nothing paid) + Prepared.answer (model call + save, run in the contextvars copy build_input left, since actions hand state to shape via ContextVar). api/blocks/ai.py: background actions record AiTurnStarted (event on aggregate aiturn:<id>, owner = the case or the person), run on a daemon thread holding a run lock (same pattern as interpretations), the request waits 60 s then answers 202; GET .../ai/turns/{id} = 202 while the lock is held, then the POST's own answer (200 saved via the AiTurnAnswered pointer written in the save's own transaction) or the failure status with error codes only (K8), or 503 RUNNER_LOST. Look for: thread/lock/wait handoff races, erasure of turn records with the case/account, K8 leakage, refusals and metering unchanged, races between save and failure record.
- exit: 0 | elapsed: 252036ms | answer: 1230B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Personal-account turn records can be written after the account is erased  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py:98`  
  confidence  -> CONFIRMED  
  scenario    -> A personal account is erased while its background turn runs; `save()` rejects the erased owner, but failure handling calls `record_turn()`, which checks `require_case()` only for case owners and can append `AiTurnFailed` under the deleted person.  
  why missed  -> The case-erasure guard is present, but the equivalent person-erasure guard is missing.

FINDING 2: Failure-record write errors are misreported as runner loss  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py:137`  
  confidence  -> CONFIRMED  
  scenario    -> The model fails, then the database raises a non-`InvariantViolation` while writing `AiTurnFailed`; the worker releases its lock without an outcome, so GET returns `503 AI_TURN_RUNNER_LOST` even though the runner did not restart and the original failure code is lost.  
  why missed  -> The failure-record path only handles domain erasure exceptions, assuming event persistence cannot fail independently.

TOTAL: 2 findings
