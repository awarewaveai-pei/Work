# codex-oracle review -- 2026-11-02 12:59:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/wp-bridge-plugin/includes/Crm/ContactUpserter.php, lobster-factory/packages/wp-bridge-plugin/includes/Http/RestController.php, lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/crm/fluentcrm.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/replies/RepliesClient.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C6 (Claude SDK worker): wp-bridge POST /fluentcrm/contact (signed write like /newsletter) upserting a FluentCRM contact + lists/tags via ContactUpserter (verify FluentCRM model/API usage: FluentCrm\App\Models\Subscriber, Lists, Tag, attachLists/attachTags), existing contacts keep their subscription status; plugin 0.21.0; next-admin sync-fluentcrm route: eligibility consent_status replied/opted_in/form_submitted/customer and not suppressed (marketing/all), bridge client by the org's wp_sites host, writes fluentcrm_* fields + timeline. Never sends mail. SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C6, SPEC 5.8 D16.
- exit: 0 | elapsed: 132788ms | answer: 2727B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/replies/RepliesClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/crm/fluentcrm.ts, lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php, lobster-factory/packages/wp-bridge-plugin/includes/Http/RestController.php, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts, lobster-factory/packages/wp-bridge-plugin/includes/Crm/ContactUpserter.php
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 同步時附加標籤可能觸發 FluentCRM 自動寄信，違反「不寄信」護欄
  file:line   -> lobster-factory/packages/wp-bridge-plugin/includes/Crm/ContactUpserter.php:78
  confidence  -> CONFIRMED
  scenario    -> 目標站已有以 `outreach-warm` 標籤啟動、包含寄信動作的 automation；同步新聯絡人時，`attachTags()` 觸發該 automation，信件隨即寄出。[FluentCRM 原始碼](https://raw.githubusercontent.com/FluentCRM/fluent-crm/master/app/Models/Subscriber.php)證實此方法會發出標籤事件；[官方文件](https://docs.fluentcrm.com/fluentcrm-automation-triggers)證實標籤可啟動 automation。
  why missed  -> 作者只檢查這段程式沒有直接呼叫寄信方法，漏看標籤寫入的外部副作用；專案護欄已在 `lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md:95` 點名此風險。

FINDING 2: 手動停止聯絡的 lead 仍可同步
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts:32
  confidence  -> CONFIRMED
  scenario    -> lead 的 `consent_status='replied'`，操作者透過 followups 的 `stop` 動作將 `do_not_contact` 設為 true，但該動作沒有新增 suppression row（`app/api/outreach/followups/route.ts:108`）；同步路由未讀取或檢查 `do_not_contact`，因此仍將此人加入 FluentCRM。
  why missed  -> 測試只覆蓋 consent 與 suppression，沒有覆蓋獨立的 `do_not_contact` 欄位。

FINDING 3: 系統模式擋下寫入時，路由將其記成同步失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts:61
  confidence  -> CONFIRMED
  scenario    -> 系統處於 maintenance；`bridgePost()` 回傳 `blockedMode`（`lib/payments/woo.ts:172`），路由卻把 lead 標為 `failed`、寫入失敗事件並回 502。既有共用契約應回 423，讓操作者知道需解除系統模式，而非重試 FluentCRM。
  why missed  -> 新路由沿用一般 bridge 失敗分支，漏掉既有 newsletter 路由對 `blockedMode` 的處理。

FINDING 4: 公司名稱被寫成聯絡人的名字
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/sync-fluentcrm/route.ts:60
  confidence  -> CONFIRMED
  scenario    -> lead 的 `name='Acme'`、`contact_name='Pat'`；同步後 FluentCRM 聯絡人的 `first_name` 是 `Acme`。`co_leads` 明確分有 `name` 與 `contact_name`（`packages/db/migrations/0048_co_outreach_core.sql:85`、`:89`）。
  why missed  -> 測試資料沒有設定 `contact_name`，並把錯誤的 `first_name: "Acme"` 寫成預期值。

TOTAL: 4 findings
