# codex-oracle review -- 2026-11-06 13:40:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-report.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/free-quota.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/settle-through-ledger.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/free-quota.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/social-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CostsTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/FreeQuotaCard.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outreach paid tool calls (Serper searches, Apify IG/FB reads) settled wallet holds but never wrote ai_call_logs, so /ops/costs missed them. Now every settle goes through log-ai-call (logToolCost, kind tool; 0 cost = release, no row), a test forbids other .settle( sites, spend report knows kind tool, and /ops/costs shows a free-quota card (Gemini 500/day Pacific, Reoon 20/day, ZeroBounce 100/month, Hunter 50/month). Check wallet units charged are unchanged vs before.
- exit: 0 | elapsed: 166204ms | answer: 1781B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CostsTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/FreeQuotaCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/free-quota.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/settle-through-ledger.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/free-quota.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/spend-report.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/social-research.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 免費配額卡把「最新驗證結果筆數」當成「本期呼叫次數」
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/free-quota.ts:48`
  confidence  -> CONFIRMED
  scenario    -> Hunter 的 email finder 本月成功回應但找不到地址；`mailbox-verify.ts:226-227` 將它計為付費呼叫，卻沒有寫入 `co_verified_emails`，卡片仍顯示 0 次。對同一地址重新驗證時，`mailbox-verify.ts:139-142` 的 upsert 也只保留一筆，進一步少算。
  why missed  -> 作者沿用現有結果快取，未核對它是否保存每次呼叫。

FINDING 2: 不同金鑰的用量被合併後，卻與單一金鑰的額度比較
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/free-quota.ts:48`
  confidence  -> CONFIRMED
  scenario    -> 某組織自有 Hunter 金鑰用了 30 次，代理商 Hunter 金鑰也用了 30 次；`mailbox-verify.ts:94-106` 允許兩者並存，查詢卻跨組織計為 60／50，錯誤顯示額度已滿。
  why missed  -> 配額定義是每把金鑰，新增查詢只按供應商分組。

FINDING 3: 零成本呼叫在錢包保留額退回前就返回
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts:274`
  confidence  -> CONFIRMED
  scenario    -> Serper 未配置、此次用量為 0，且錢包餘額剛好只夠一次保留額；`inbox/route.ts:167` 雖然等待 `logToolCost`，`releaseHold` 在 `log-ai-call.ts:281-282` 卻未等待資料庫結算。緊接的下一次請求可在退回完成前收到 402；改動前會等待 `hold.settle` 完成。
  why missed  -> 測試在呼叫後額外等待一個事件迴圈，沒有驗證函式返回時保留額已退回。

TOTAL: 3 findings
