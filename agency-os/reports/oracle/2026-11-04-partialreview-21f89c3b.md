# codex-oracle review -- 2026-11-04 10:54:57 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/channels.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/channels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: FluentCRM channel tags: one channel registry (channels.ts) drives tags for Meta webhook, Meta CSV import, and sync-fluentcrm; webhook fetches form name; tag slug capped to fc_tags.slug varchar(192). Also verify: does this change depend on something NOT visible in this diff -- a config value, schema assumption, or upstream default defined elsewhere? If it contradicts the change report it. If you cannot support a real finding, say so and return no findings; do not invent weak findings.
- exit: 0 | elapsed: 153739ms | answer: 1452B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/channels.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/channels.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 已同步的聯絡人再次提交 Meta 表單時，新表單標籤永遠不會加入。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:116
  confidence  -> CONFIRMED
  scenario    -> 同一 email 提交表單 A，FluentCRM 同步成功；之後提交表單 B。第二次在 `fluentcrm_sync_status === "synced"` 直接返回，未執行第 132 行的標籤寫入，聯絡人只有表單 A 標籤。首次讀取表單名稱失敗、重送時成功，也無法補上標籤。
  why missed  -> 既有的「已同步即跳過」邏輯原本只處理固定標籤；新增每次提交都可能不同的表單標籤後，這個前提不再成立。

FINDING 2: 既有 customer 接收 Meta 表單後，手動同步會錯加「冷信開發」標籤。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts:67
  confidence  -> CONFIRMED
  scenario    -> 一筆 `status="customer"`、`consent_source=null` 的既有 lead 提交 Meta 表單。`warm-leads.ts:104-105` 因 customer 屬於 `KEEP_STATUS` 而不更新 consent source；本次擷取可加入 Meta 標籤，但日後呼叫 sync-fluentcrm 時，空 source 被當成 cold outreach，永久附加錯誤的來源標籤。
  why missed  -> 新路由假設 consent source 會記錄最新渠道；既有資料流程對 customer 保留原狀態與原 source。

TOTAL: 2 findings
