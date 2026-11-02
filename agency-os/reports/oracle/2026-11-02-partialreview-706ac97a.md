# codex-oracle review -- 2026-11-02 10:30:01 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender-pool.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/connectors/router.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/never-sends.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/sender-pool.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/packages/db/tests/test_0152_sender_pool.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/stats.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/stats/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/stats.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 C8 auto-send (sender pool rotation, single send exit sendGmailDraft in google-oauth called only by send-adapter, co_begin_send caps, 30-min sending reconciliation in gmail-sync, paid mailbox verification gate D25, senders auto switch) + C7 stats page. SSOT: agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C8/C7, agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md 5.5/5.9; DB functions in lobster-factory/packages/db/migrations/0152_sender_pool.sql and 0153_co_replies.sql (already in prod, not changed).
- exit: 0 | elapsed: 292176ms | answer: 1800B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/never-sends.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/connectors/router.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/packages/db/tests/test_0152_sender_pool.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/stats/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/mailbox-verify.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/send-adapter.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/sender-pool.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/stats.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/mailbox-verify.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender-pool.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/stats.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 成效頁無法按「切角」分組
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:279
  confidence  -> CONFIRMED
  scenario    -> 產信時首封與追蹤信都未寫入 `angle`（共同欄位也未包含它）；C7 依 `angle` 分組後，同服務、同版本的不同切角全部合併顯示為「未指定」，無法比較切角成效。
  why missed  -> 成效測試直接建立了帶有 `angle` 的假訊息，沒有走現行產信路徑。

FINDING 2: 停用 Gmail connector 後，寄件池仍會自動寄信
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:185
  confidence  -> CONFIRMED
  scenario    -> 操作者把 connector 的 `is_enabled` 設為 false，信箱仍是 `auto`、`healthy` 且保有 `connector_id`；寄件池查詢不檢查 connector 狀態，仍讀取其 refresh token 並寄出草稿。
  why missed  -> 寄件池資格只檢查信箱欄位；既有回信同步則會檢查 connector 的 `is_enabled`，兩條路的停用語義分岔。

FINDING 3: 重新建草稿後，自動寄送會選到舊草稿
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts:196
  confidence  -> CONFIRMED
  scenario    -> 一封 `sending` 的信在 30 分鐘後仍是 Gmail 草稿，被對帳改為 `needs_edit`；人員修改、重新核准並建立新草稿後，同一訊息有兩筆 `draft_created` 事件。佇列依時間由舊到新讀取並保留第一筆，因此寄送舊草稿；若舊草稿已刪，則無法寄出新草稿。
  why missed  -> 註解與回信同步都以「最新事件」為準，但新寄送佇列的排序方向相反；測試只建立單一草稿事件。

TOTAL: 3 findings
