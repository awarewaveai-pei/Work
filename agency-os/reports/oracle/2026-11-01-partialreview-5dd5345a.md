# codex-oracle review -- 2026-11-01 17:13:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.sql, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of Outbound OS card C2. Round 1 findings fixed: (1) senderFor now requires provider=gmail, gmail-draft refuses a named non-gmail mailbox; (2) messages POST inserts the new set first, then retires older draft/needs_edit rows excluding the new ids; (3) gmail-draft take sets drafted_at=take time, a drafted row older than 10 min with no draft_created event may be retaken (conditional on the same drafted_at), failure gives it back with drafted_at null; (4) after the Gmail draft exists nothing returns an error: event insert retried once, then a warning. Verify these fixes and report only real defects.
- exit: 0 | elapsed: 114842ms | answer: 1988B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/drafts/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/ConnectorsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/leads/LeadsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/settings/service-profiles/ServiceProfilesClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/service-profiles/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/cold-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/settings/service-profiles/ProfilePolicy.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/claim.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/service-profiles/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/generation.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.down.sql, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.sql
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/drafts/page.tsx@5610eac45

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gmail 已建立草稿但回應失敗時，訊息會退回可重試狀態，造成重複草稿
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts:228
  confidence  -> CONFIRMED
  scenario    -> Gmail 收到建立草稿請求並成功建立，但回應中斷或 JSON 解析失敗（`lib/outreach/google-oauth.ts:196`）→ `createGmailDraft` 拋錯，這裡把訊息退回 `approved` → 操作者重試後建立第二份草稿。
  why missed  -> 修正把「Gmail 呼叫之後的事件寫入」視為成功邊界，漏了 Gmail 已執行、呼叫端卻收到錯誤的情況。

FINDING 2: 已刪除連線的舊寄件信箱仍會被選中，讓可用信箱無法建立草稿
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts:15
  confidence  -> CONFIRMED
  scenario    -> 同組織有兩個 Gmail 信箱；較早建立的連線被刪除（`app/api/outreach/connectors/route.ts:146` 只刪連線），第二個仍已連線 → 生成固定選中較早的 sender，草稿路由按該信箱尋找連線（`app/api/outreach/messages/gmail-draft/route.ts:145-153`）並回報找不到；第二個可用信箱始終不會被選中。
  why missed  -> 生成端只查 sender 是否啟用，測試也未涵蓋 sender 與 OAuth 連線生命週期不同步。

FINDING 3: 同一名單同時生成兩組文案時，兩組都可能被互相標為跳過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:299
  confidence  -> CONFIRMED
  scenario    -> 請求 A、B 都在沒有核准首封的狀態下插入草稿；A 的清退更新排除 A 的 ID，跳過 B；B 的更新排除 B 的 ID，跳過 A → 兩個請求都回報成功，但審核佇列沒有可核准的首封。
  why missed  -> 測試驗證單一請求「先插入、再排除自己的 ID」，沒有交錯執行兩個請求。

TOTAL: 3 findings
