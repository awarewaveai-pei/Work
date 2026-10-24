# codex-oracle review -- 2026-10-24 23:03:16 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gemini-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/llm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/triggerAutoClassify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/cost-calculator.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: gemini-2.0-flash-lite is retired (Google 404 "no longer available", confirmed with the production key; gemini-3.5-flash-lite returns 200 there). It was spelled in three places: ops-inbox classifier model, the classifier result label, and the cs Gemini fallback; cost-model had its price. Now one constant GEMINI_LITE_MODEL = gemini-3.5-flash-lite in lib/ai/gemini-models.ts, imported by the three callers; cost-model gets a 3.5 Flash-Lite row from the Google pricing page ($0.30 / $2.50 per 1M, cache read $0.03 -> cacheReadMult 0.1) and keeps the 2.0 row for older cost-log rows; a test fails if the model in use has no price row. 3.5 chosen over the cheaper 3.1 Flash-Lite: five timed calls each, 3.1 ranged 1.2-8.1 s with one failure, 3.5 a steady 3.4-5.0 s; the inbox Gemini timeout is 12 s. Verify: any other place that names a Gemini lite model or reads the old id (cost logs, dashboards, tests); whether the price row maths matches the published price; whether 3.5 Flash-Lite needs a request option the old model did not (thinking defaults, max tokens) for these callers.
- exit: 0 | elapsed: 290821ms | answer: 596B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/cost-calculator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/ai/triggerAutoClassify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gemini-models.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gemini fallback calls are not recorded in cost logs, so the new price row is unused by live fallbacks.
  file:line   -> `lib/cs/llm.ts:77-85`, `lib/ops-inbox/ai/gemini.ts:14,40-42` -> `lib/ai/log-ai-call.ts:106-123`, `app/(shell)/ops/costs/page.tsx:2-3`
  confidence  -> CONFIRMED
  scenario    -> Claude fails and Gemini succeeds -> the response returns, but no `ai_call_logs` row is inserted, so `/ops/costs` silently undercounts Gemini usage.
  why missed  -> The added test verifies only that the model has a price row; neither Gemini caller invokes `logAiCall`.

TOTAL: 1 findings
