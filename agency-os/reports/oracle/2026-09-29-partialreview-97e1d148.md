# codex-oracle review -- 2026-09-29 00:28:35 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_usage_reservations.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_gateway.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_synthesis.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: The AI daily budget moves from process memory to the database. Review against this checklist; each item is a claim to refute:
1. Every paid model call reserves its worst case (UTF-8 bytes sent incl. tool definition + framing, plus max_tokens) as an ai_usage row BEFORE the call, in the same SQLite BEGIN IMMEDIATE transaction as the budget check (IdentityStore.reserve_ai_usage), so no thread or process can pass the same check in between.
2. After the call the row is settled to the real cost (0 for an unbilled failure; the worst case when the answer's usage is unknown). A process that dies mid-call, or a settle that fails, leaves the worst case counted for that day, across restarts and processes.
3. One budget rule, fits_budget (provider.py), used by the preflight (_require_ai) and by the reservation; /ai/status reports used_today, reserved_in_flight and remaining from the same rows.
4. Nothing about spending lives in process memory: _AI_RESERVED, _reserve_ai_tokens, _ai_budget_lock_for and IdentityStore.record_ai_usage are deleted; no lock spans a model call.
5. Existing files: ai_usage gains status (DEFAULT settled) and run_id by ADD COLUMN on open; old rows count as settled.
6. The estimate reads whole settled runs (run_id = interpretation_id / synthesis_id), not single calls; reserved rows never enter it.
Report only a concrete way one of these claims fails, or something outside the diff that contradicts them. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 140263ms | answer: 11B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gateway/provider.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_gateway.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_interpret.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_synthesis.py, Projects/internal/cognitive-engineering-os/tests/unit/test_ai_usage_reservations.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
