# codex-oracle review -- 2026-11-01 19:46:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/discover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/existing-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/normalize.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/connectors/router.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/approve.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS card C10: lead discovery via Serper /places into the inbox import; dedup against the org's existing inbox+leads (email / own-website host / source_url); approve-to-leads returns the existing lead instead of a second one; platform hosts never identify a business. Check correctness, tenant isolation, PostgREST filter injection, and cost/grant handling.
- exit: 0 | elapsed: 236082ms | answer: 1893B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/connectors/router.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/normalize.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/approve.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/discover.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/existing-leads.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 重複查詢會受 PostgREST 回傳列數上限截斷
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/existing-leads.ts:48
  confidence  -> CONFIRMED
  scenario    -> 同一組織有超過 1,000 筆網站文字命中 `*cafe.tw*`；真正同網域的舊名單落在截斷範圍外。查詢沒有分頁，匯入時不會標為 `suspected_dup`，核准時也可能再建一筆 lead。既有程式已明載 PostgREST 有列數上限（`lib/entitlements/tables.ts:54`）。
  why missed  -> 測試資料只有少量列，模擬查詢也沒有實作回傳上限。

FINDING 2: Serper 查詢有使用紀錄，卻沒有扣除點數
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts:104
  confidence  -> CONFIRMED
  scenario    -> 使用 `pay: "credits"` 授權的組織執行一次三頁搜尋。程式取得 grant 並呼叫三次 Serper；provider 只呼叫 `recordUse`，該方法每個 grant 僅記錄一次且不扣款（`lib/collect/net/providers.ts:161`、`lib/entitlements/can.ts:166`）。此路徑沒有帶費用單位呼叫 `report`，因此供應商產生成本，錢包仍不變。
  why missed  -> 新測試只驗證取得 grant 與回傳的預估費用，沒有驗證帳本扣款。

FINDING 3: 含逗號的來源網址完全跳過重複查詢
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/existing-leads.ts:37
  confidence  -> CONFIRMED
  scenario    -> 既有 lead 與待核准 inbox 項目都只有相同的 `source_url=https://example.com/place?coords=25,121`，沒有 email、網站或電話。`SAFE` 排除逗號，`srcs` 因而為空；核准流程查不到舊 lead，插入第二筆。
  why missed  -> 過濾器避免了 PostgREST 語法問題，但測試只用了不含特殊字元的 `?cid=數字` 網址。

TOTAL: 3 findings
