# codex-oracle review -- 2026-11-06 14:13:24 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/OutreachTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Client hub 冷開發 tab: replace a dead Phase-1 tab (per-client Supabase creds + self_serve flag nobody reads) with a read-only summary of the org's outreach v2 state: sender mailboxes, inbox/leads/messages/replies counts, this Taipei month's outreach spend from ai_call_logs (free rows counted), feature verdicts via verdictOf, shortcut links with ?org=. Check auth (staff only, client identity 403), org scoping of every query, and that failed reads never show 0.
- exit: 0 | elapsed: 141307ms | answer: 2322B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/OutreachTab.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-config/route.ts@c2a239211

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 「今日已寄／上限」使用未隨寄送更新的計數，會顯示錯誤寄量
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/OutreachTab.tsx:90
  confidence  -> CONFIRMED
  scenario    -> 信箱今天已寄出 10 封，寄送流程以 `co_send_claims` 計算用量；此處仍讀 `daily_sent_count`，顯示「0 / 20」。實際寄送上限也受 warmup 階段限制，未必是 `daily_limit`（`lib/outreach/sender-pool.ts:39,75-82`）。
  why missed  -> schema 保留了 `daily_sent_count` 欄位，但現行寄送上限與計數已改由 claims 決定。

FINDING 2: 功能權限查詢失敗會被顯示為「未開通」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.ts:87
  confidence  -> CONFIRMED
  scenario    -> entitlement 查詢或 permit 驗證拋錯時，`verdictOf` 在 `lib/entitlements/can.ts:275-281` 將錯誤轉成 `{allowed:false, reason:"infrastructure_error"}`；功能區塊仍標記成功，頁面在 `OutreachTab.tsx:139` 顯示「未開通」，使已開通功能看起來被關閉。
  why missed  -> 作者處理了區塊拋錯，卻未察覺 `verdictOf` 會先吞掉基礎設施錯誤。

FINDING 3: 收件匣待處理數漏掉自動分類後仍待審的名單
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.ts:48
  confidence  -> CONFIRMED
  scenario    -> 新匯入名單被 `app/api/outreach/inbox/route.ts:48-55` 分類為 `high_quality` 或 `needs_data`，仍留在收件匣待處理；摘要只計 `pending`，因此可顯示 0。
  why missed  -> `pending` 同時像是一般工作狀態名稱，也是資料表中的一個特定狀態值。

FINDING 4: 「本月回信」將退信算作回信
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/outreach-summary/route.ts:53
  confidence  -> CONFIRMED
  scenario    -> 本月只有一筆 `kind='bounce'`、沒有客戶回覆時，頁面仍顯示「本月回信 1」。`packages/db/migrations/0153_co_replies.sql:37` 明確允許 `reply` 與 `bounce` 兩種紀錄。
  why missed  -> 表名是 `co_replies`，但其中也存退信。

TOTAL: 4 findings
