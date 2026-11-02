# codex-oracle review -- 2026-11-02 16:12:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run-jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round-4 findings fixed: lib/ai/cheap-json.ts gets timeoutMs (default 600s = Anthropic SDK default; OpenAI fetch had none), claim-check passes 120s; UI poll cap = 11 min (2x240s generation incl. repair + 120s fact check + slack). Invariant: the background generation job always ends because every awaited external call is bounded, and the UI waits at least that long. Review the whole change; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 208585ms | answer: 833B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run-jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 11 分鐘輪詢上限沒有涵蓋生成流程中的資料庫等待
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx:95
  confidence  -> CONFIRMED
  scenario    -> 使用 sampled review 的名單產信時，兩次 AI 呼叫與事實核對各接近其上限；`generate.ts:134` 接著等待 `loadSampleContext` 的資料庫查詢，其中回覆查詢可按每批 200 筆循序執行（`review-policy.ts:152-155,194-199`）。這些查詢沒有流程總時限；若合計超過剩餘的 60 秒，前端會先顯示逾時，工作仍在執行。資料庫請求若一直不返回，也無法保證背景工作結束。
  why missed  -> 上限只加在 AI 請求；11 分鐘的計算漏了生成流程中等待的 Supabase 查詢。

TOTAL: 1 findings
