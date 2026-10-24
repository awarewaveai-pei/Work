# codex-oracle review -- 2026-10-24 23:10:30 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/llm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/gemini-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gemini-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to the previous review (Codex F1: the Gemini fallbacks were not written to ai_call_logs). Now: geminiUsageTokens(usageMetadata) in log-ai-call.ts maps promptTokenCount - cachedContentTokenCount to input, candidates + thoughts to output, cached to cacheRead; the cs Gemini fallback (lib/cs/llm.ts geminiText) logs with the caller route and organizationId, tool cs; the ops-inbox Gemini path logs route ops-inbox/classify with the incident org, tool ops-inbox; the ops-inbox Claude path, which also never logged, now logs from the SDK response. A real cs fallback call wrote ai_call_logs: model gemini-3.5-flash-lite, vendor Google, 10/1 tokens, 0.000005 USD, no rate_fallback. Verify: the token mapping against Gemini billing (are thoughts billed as output, is cached content inside promptTokenCount), double logging on any path, and anything that breaks if logAiCall rejects (it is void, contract says it never throws).
- exit: 0 | elapsed: 253657ms | answer: 525B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/llm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/gemini-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gemini-models.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The “one row” Gemini test does not detect duplicate logging.
  file:line   -> `lib/ai/__tests__/gemini-cost-log.test.ts:32` -> `lib/ai/__tests__/gemini-cost-log.test.ts:36`
  confidence  -> CONFIRMED
  scenario    -> Gemini succeeds, `logAiCall` runs twice, and `m.logged` contains two rows; `toContainEqual` still passes because it requires only one matching row.
  why missed  -> The logger is mocked at lines 5–7 and the assertion checks containment, never `m.logged.length`.

Final line: TOTAL: 1 finding
