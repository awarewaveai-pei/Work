# codex-oracle review -- 2026-11-01 17:09:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.sql, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS card C2: A/B first emails + follow-ups with code-appended signature and personal-data notice, review policy (manual/sampled with fact check), one first email per lead (DB index), lead-profile same-org trigger, gmail-draft takes the row before Gmail and drafts from the mailbox named at generation. Spec: agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md §5.3 D20 D23. Already reviewed 3 rounds by a Claude critic.
- exit: 0 | elapsed: 172019ms | answer: 2373B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/drafts/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/ConnectorsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/leads/LeadsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/settings/service-profiles/ServiceProfilesClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/service-profiles/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/cold-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-claude.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-gemini.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/settings/service-profiles/ProfilePolicy.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/claim.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/service-profiles/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/generation.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.down.sql, lobster-factory/packages/db/migrations/0149_outbound_v2_expand.sql
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/drafts/page.tsx@5610eac45

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 產信可能選到無法建立 Gmail 草稿的寄件身分
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts:12
  confidence  -> CONFIRMED
  scenario    -> 同組織最早建立的 active cold sender 是 `fluentsmtp`，後來才有 Gmail sender；產信會記下前者的 ID，但建草稿只尋找該信箱的 Gmail connector（`gmail-draft/route.ts:134-143`），因此信件無法建成草稿。
  why missed  -> 寄件人查詢沒有檢查 `provider`；原有資料表明確支援多種 provider（`0048_co_outreach_core.sql:239`）。

FINDING 2: 新草稿寫入失敗會先丟失正在審核的舊草稿
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:295
  confidence  -> CONFIRMED
  scenario    -> lead 已有人工修改中的 `draft`；重新產信時先將它標為 `skipped`，隨後新列的 insert 失敗（例如同時有首封獲核准而觸發唯一索引）；請求回傳錯誤，原草稿卻已退出審核佇列。
  why missed  -> 測試只驗證「先退舊、再寫新」的順序，沒有涵蓋第二次寫入失敗。

FINDING 3: 行程中斷會把未建立的 Gmail 草稿永久標成已建立
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts:203
  confidence  -> CONFIRMED
  scenario    -> 資料庫已把訊息改為 `drafted`，但服務行程在呼叫 Gmail 前終止；沒有 Gmail 草稿，重試又因狀態不再是 `approved` 而被拒（`:67-69`）。該首封也持續佔用唯一索引。
  why missed  -> 失敗回復只涵蓋程式捕捉到的例外，沒有涵蓋兩次外部寫入之間的行程中斷。

FINDING 4: Gmail 草稿已建立後，事件寫入失敗仍回傳硬錯誤並漏計每日額度
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts:231
  confidence  -> CONFIRMED
  scenario    -> Gmail 建草稿成功，但 `co_sending_events` insert 失敗；API 回傳 500，訊息已是 `drafted`，且沒有記錄 draft ID。每日上限只計 `draft_created` 事件（`:166-173`），因此這封草稿也不計入額度。
  why missed  -> 程式只把後續 `drafted_at` 寫入失敗視為警告，漏掉更早的事件寫入失敗。

TOTAL: 4 findings
