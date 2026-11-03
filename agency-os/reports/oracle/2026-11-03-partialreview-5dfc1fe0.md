# codex-oracle review -- 2026-11-03 09:00:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/packages/db/migrations/0155_sender_auto_draft.sql, lobster-factory/packages/db/migrations/0155_sender_auto_draft.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/sender.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fixes for the 3 findings on the draft-mailbox pipeline: the auto_draft switch moved from Gmail connector settings (rewritten by OAuth reconnect) to a column co_sender_accounts.auto_draft (migration 0155, additive, default false, with down file); autoDrafts also needs the connector enabled with a token (connector_ok); senderFor prefers the auto_draft mailbox among connected draft mailboxes. Invariant: the switch belongs to the mailbox; a mailbox drafts automatically only if it can actually take drafts; send-adapter still reads only send_mode='auto'. Review; if you cannot support a real finding, return none.
- exit: 0 | elapsed: 107128ms | answer: 1108B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/sender.test.ts, lobster-factory/packages/db/migrations/0155_sender_auto_draft.down.sql, lobster-factory/packages/db/migrations/0155_sender_auto_draft.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 停用草稿信箱仍可能被選為寫信對象  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts:36`  
  confidence  -> CONFIRMED  
  scenario    -> 同一組織有兩個已連線、`auto_draft=true` 的 draft 信箱；較早建立的 A 已 `paused`，B 是 `healthy`。`senderFor` 選 A 寫信，但 pipeline 只准 B 建草稿，於是郵件停在 `approved`。  
  why missed  -> 新測試只檢查單一停用信箱，未涵蓋同組織仍有可用信箱的情況。

FINDING 2: 組織掃描上限可能漏掉所有可用信箱  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts:67`  
  confidence  -> CONFIRMED  
  scenario    -> 資料表有超過 1000 個 active、cold、但未啟用自動草稿的信箱；可用信箱落在查詢的 1000 筆之外。程式先截取資料、再過濾資格，該組織便不會執行 pipeline。  
  why missed  -> 原查詢在 `limit(1000)` 前先篩 `send_mode='auto'`；改動擴大了查詢範圍，卻保留原上限。

TOTAL: 2 findings
