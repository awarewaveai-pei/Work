# codex-oracle review -- 2026-10-29 18:59:23 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/aware-wave-store-plugin, scripts/rollout-wp-bridge.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 step 4c-3: aware-wave-store 1.1.0 reseller mode. A site with a key id signs payment events and door handoffs with its own Ed25519 keys (header X-AwareWave-Site, never HMAC); no key id keeps HMAC for aware-wave.com. rollout-wp-bridge.ps1 store install gate now asks next-admin GET /api/internal/sellers/sites?host= for active=true. Wire contract fixed by the next-admin session; tests/fixtures/ed25519-v1.json is shared with next-admin.
- exit: 0 | elapsed: 274111ms | answer: 2050B
- files-reviewed: lobster-factory/packages/aware-wave-store-plugin/README.md, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php, lobster-factory/packages/aware-wave-store-plugin/includes/MyAccountDoors.php, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentSender.php, lobster-factory/packages/aware-wave-store-plugin/includes/Settings.php, lobster-factory/packages/aware-wave-store-plugin/includes/Signature.php, scripts/rollout-wp-bridge.ps1, lobster-factory/packages/aware-wave-store-plugin/tests/SignatureTest.php, lobster-factory/packages/aware-wave-store-plugin/tests/fixtures/ed25519-v1.json
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新代理商網站無法完成首次安裝流程  
  file:line   -> `scripts/rollout-wp-bridge.ps1:99`；`lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php:139`；`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/sites.ts:137`  
  confidence  -> CONFIRMED  
  scenario    -> 新網站尚未安裝 store 外掛，因而沒有外掛產生的付款公鑰；`/ops/sellers` 登記必須提交該公鑰，但 rollout 又要求網站已登記且啟用才允許安裝。按文件所述的介面流程，兩步都無法先完成。  
  why missed  -> 安裝閘與產鑰介面分屬不同專案，單看任一邊都合理。

FINDING 2: 「重新產鑰」後，控制面沒有可更新既有網站公鑰的操作  
  file:line   -> `lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php:193`；`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/sellers/actions.ts:26`；`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/sellers/actions.ts:44`  
  confidence  -> CONFIRMED  
  scenario    -> 已啟用的代理商按「重新產鑰」；WordPress 立即改用新私鑰，但 `/ops/sellers` 只有新增網站及切換狀態的操作，無法貼上新公鑰。之後的付款或進門簽章持續被拒絕。  
  why missed  -> WordPress 端假設既有控制面支援換公鑰，這次 diff 沒有顯示控制面的實際操作。

FINDING 3: 目前 checkout 缺少 rollout 必需的內部查詢路由  
  file:line   -> `scripts/rollout-wp-bridge.ps1:101`  
  confidence  -> CONFIRMED  
  scenario    -> 現在執行 `-Plugin store` 時，腳本查詢 `/api/internal/sellers/sites?host=`；已核對 next-admin 的 `app/api/internal` 目錄，目前沒有 `sellers/sites` 路由。請求得到非成功回應，`SACTIVE` 為 `no`，連已登記的網站也被拒絕安裝或升級。  
  why missed  -> 腳本依賴另一個 next-admin session 交付路由；目前工作目錄尚未包含該交付。

TOTAL: 3 findings
