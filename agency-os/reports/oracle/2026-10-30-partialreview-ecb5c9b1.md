# codex-oracle review -- 2026-10-30 08:52:39 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0144_plan_studio_basic.sql, lobster-factory/packages/db/migrations/0144_plan_studio_basic.down.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php, lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentEventsTest.php, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md, agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: First plan studio_basic (0144): every studio feature pay=credits so a subscription never gives unlimited free AI; credits cross products via one wallet, a pack without plan_key only tops up (store plugin drops the 'buyer cannot use credits' note, 1.2.1). Check consistency with can.ts issuePermit, 0120/0128 subscription_paid/credit_pack paths, and any code/doc still assuming a plan-less pack is unusable. Also verify dependencies not visible in this diff (config, schema assumptions, upstream defaults); if none, say so and return no findings.
- exit: 0 | elapsed: 177958ms | answer: 1359B
- files-reviewed: agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md, agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/payments.e2e.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentEventsTest.php, lobster-factory/packages/db/migrations/0144_plan_studio_basic.down.sql, lobster-factory/packages/db/migrations/0144_plan_studio_basic.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `studio_basic` 標成按點數付費，但 Studio 的 AI 呼叫不會扣點
  file:line   -> `lobster-factory/packages/db/migrations/0144_plan_studio_basic.sql:10`；`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts:151`
  confidence  -> CONFIRMED
  scenario    -> 帳戶訂閱 `studio_basic` 並持有 1 點；權利檢查因餘額足夠而放行。AI 呼叫只走 `recordUse()`，其 `report()` 單位數為 0；扣點分支要求 `units > 0`，所以餘額維持 1 點，可持續呼叫。
  why missed  -> 新增的真 DB 測試只檢查權利列的 `pay` 標記，沒有執行 AI 呼叫並核對帳本扣點。

FINDING 2: 商品設定清單漏了 Studio 的「進入」按鈕所需欄位
  file:line   -> `agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md:151`；`lobster-factory/packages/aware-wave-store-plugin/includes/MyAccountDoors.php:85`
  confidence  -> CONFIRMED
  scenario    -> 操作者照清單只替訂閱商品填 `_awarewave_plan_key=studio_basic`；會員付款後取得 Studio 權利列，但外掛只從 `_awarewave_product_key` 建立「進入」按鈕。該欄位留空時，會員的「我的帳號」沒有 Studio 入口。
  why missed  -> 付款測試驗證了合約與權利列，沒有驗證 WordPress 商品欄位到會員入口的路徑。

TOTAL: 2 findings
