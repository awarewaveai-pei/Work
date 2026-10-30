# codex-oracle review -- 2026-10-30 10:04:43 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/ledger.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/gate-fixtures.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 4b-11 money core: cost logger requires grant and charges each delivered call grant.report(units=creditsForCost(cost), key ai-call:<rowid>); report() single money path: cap max_spend, drain short wallet via <key>:rest, return charged/shortfall; debit returns {ok,balance} (0066 media_credit_reserve: balance after debit, unchanged on refusal). Billed-but-undelivered image recorded, not charged. 45 call sites now pass their seam grant (tsc-enforced). Look for money leaks or wrong charges: comp/contract/shadow debited, double charge, wrong account, drain race. Also check dependencies not visible in this diff. If none, say so and return no findings.
- exit: 0 | elapsed: 176857ms | answer: 1666B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/can.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/gate-fixtures.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/ledger.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 客服訊息會被兩條收費路徑重複扣點
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts:232
  confidence  -> CONFIRMED
  scenario    -> 客戶的 `cs.answer` 權限標記為 `pay: "credits"`，且錢包有餘額；Webhook 先以訊息 ID 預扣 1 點，後續 `cs/llm.ts:46` 的 `logAiCall` 再以新的 `ai-call:<rowid>` 扣除模型費用。同一則訊息產生兩筆扣款。
  why missed  -> 原有預扣位於 Webhook 的 `cs/billing.ts`，不在這次 logger 差異中。

FINDING 2: 放大圖未交付仍扣點
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts:178
  confidence  -> CONFIRMED
  scenario    -> Replicate 完成放大後，輸出下載失敗（第 183 行）或 R2 儲存失敗（第 197 行）；logger 已在第 178 行啟動扣點，但發布 API 只回傳 502，客戶沒有取得印刷檔。
  why missed  -> 原本此處只記錄供應商成本；改為扣點後，原有的記錄時機不再符合「交付才收費」。

FINDING 3: 扣款成功後，成本列可能寫入失敗且無法對帳
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts:157
  confidence  -> CONFIRMED
  scenario    -> `grant.report` 成功寫入扣款，隨後 `ai_call_logs` 的 insert 遇到暫時性錯誤（第 159–177 行）；錢包已減少，但沒有對應成本列。該列的隨機 ID 只存在於這次呼叫，重試也無法用同一鍵補記。
  why missed  -> 新流程以「成本列 ID」作冪等鍵，卻在成本列持久化之前先扣款。

TOTAL: 3 findings
