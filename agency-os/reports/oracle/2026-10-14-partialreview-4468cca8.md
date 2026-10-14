# codex-oracle review -- 2026-10-14 08:21:26 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Block AI turns whose max_tokens can outrun the 85 s request (8000-token EXPRESS draft ~118 s at ~68 tok/s) run in the background. ai_gate: _prepare (permission, crisis stop, hand-back, sources; nothing paid) + Prepared.answer (model call + save, run in the contextvars copy build_input left, since actions hand state to shape via ContextVar). api/blocks/ai.py: background actions record AiTurnStarted (event on aggregate aiturn:<id>, owner = the case or the person), run on a daemon thread holding a run lock (same pattern as interpretations), the request waits 60 s then answers 202; GET .../ai/turns/{id} = 202 while the lock is held, then the POST's own answer (200 saved via the AiTurnAnswered pointer written in the save's own transaction) or the failure status with error codes only (K8), or 503 RUNNER_LOST. Look for: thread/lock/wait handoff races, erasure of turn records with the case/account, K8 leakage, refusals and metering unchanged, races between save and failure record.
- exit: 0 | elapsed: 267729ms | answer: 1434B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Person-owned turn events can be appended after account erasure.
  `Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py:100-102` -> `Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py:80-81`
  confidence  -> CONFIRMED
  scenario    -> A personal background turn is running; account erasure removes the identity, then the runner records `AiTurnFailed`. `record_turn` verifies only case owners, so it can append the erased person's turn record after erasure.
  why missed  -> `save` already performs `require_person`, but the new `record_turn` copied only the case-existence check.

FINDING 2: Fast background failures bypass the K8 error-code sanitizer.
  `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py:174` -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py:72,119-122`
  confidence  -> CONFIRMED
  scenario    -> A background model call fails with an `InvariantViolation` within 60 seconds. The runner stores a sanitized `AiTurnFailed`, but the waiting POST raises `_refused(waiter.error)` and returns the original full exception text instead of codes only. The same failure observed through GET is sanitized, making leakage timing-dependent.
  why missed  -> Sanitization was applied to the persisted failure record, but the synchronous waiter path returns the original exception directly.

TOTAL: 2 findings
