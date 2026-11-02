# codex-oracle review -- 2026-11-02 13:11:27 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0154_co_leads_meta_source.sql, lobster-factory/packages/db/migrations/0154_co_leads_meta_source.down.sql, lobster-factory/packages/db/tests/test_0154_co_leads_meta_source.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/csv-table.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/warm-leads.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C14 (Claude SDK worker + main session): Meta lead ads -> warm leads. Migration 0154 partial unique index co_leads(organization_id, source_url) where source_url like meta:leadgen/%; captureWarmLead upserts, calls co_convert_to_warm (0152: lead lock, skips unsent cold mail), syncs FluentCRM through the system-mode gate; Meta webhook handles leadgen changes after signature verification, before the social module; CSV import of Meta lead files. Warm leads must never get cold mail; resends must not duplicate. SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C14, SPEC 5.10 D22.
- exit: 0 | elapsed: 241549ms | answer: 2101B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/csv-table.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/packages/db/migrations/0154_co_leads_meta_source.down.sql, lobster-factory/packages/db/migrations/0154_co_leads_meta_source.sql, lobster-factory/packages/db/tests/test_0154_co_leads_meta_source.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 拒收狀態可能被併發的暖名單轉換覆寫
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:97`
  confidence  -> CONFIRMED
  scenario    -> 匯入先讀到尚未拒收的 lead；接著 Gmail 回覆處理將其設為 `unsubscribed`；匯入再呼叫 `co_convert_to_warm`。該函式取得列鎖後不重查狀態，直接寫入 `warm` 和 `form_submitted`（`lobster-factory/packages/db/migrations/0152_sender_pool.sql:197-203`），抹掉剛記錄的拒收狀態與同意紀錄。
  why missed  -> 測試只涵蓋先有冷信草稿的順序執行，未涵蓋讀取與 RPC 之間發生拒收。

FINDING 2: 找不到 WordPress bridge 時，webhook 仍確認成功，失去自動補同步機會
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:122`
  confidence  -> CONFIRMED
  scenario    -> Page 的 `wp_sites` 暫時沒有 active 且可配對的 bridge；lead 已轉暖，但 FluentCRM 同步記為 `failed`、`retryable: false`。`handleLeadgenChanges` 將它算作已處理（`lib/outreach/meta-leads.ts:87-90`），webhook 回 200（`app/api/webhooks/meta/route.ts:47`）。bridge 恢復後，這筆提交不會因 webhook 重送而補同步。
  why missed  -> 重送測試只模擬 bridge 呼叫失敗，沒有模擬 bridge 配對暫時缺失。

FINDING 3: 合法大小的 CSV 匯入可能超過代理逾時並只完成前半批
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts:248`
  confidence  -> CONFIRMED
  scenario    -> 11 筆新名單各花約 29 秒完成 FluentCRM 呼叫；逐筆等待累計約 319 秒，超過現行 nginx 的 300 秒 `proxy_read_timeout`（`lobster-factory/infra/hetzner-phase1-core/nginx/default.conf:244`）。使用者收到逾時，前面數筆已寫入，後面未處理；介面仍允許單次匯入 200 筆。
  why missed  -> 測試的 bridge 即時回覆，未對照每筆最多 30 秒的呼叫設定（`lib/crm/fluentcrm.ts:70`）與代理時限。

TOTAL: 3 findings
