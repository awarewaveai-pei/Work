# ADR 010: WP 站台 Site Contract 佈建架構

- 狀態：已接受
- 日期：2026-06-29

## 脈絡

現行 WP 建站系統（`wp-install-plugins` + 4 個 manifest JSON + `wp-plugin-stack-catalog.ts`）存在以下問題：

1. **分層不清**：mainwp-child（維運外掛）與 WooCommerce（功能外掛）混放在同一個 catalog，沒有 tier 欄位
2. **manifest 不完整**：`wc-core` / `wc-custom` 缺少 mainwp-child，造成這兩種站無法被 MainWP 管理
3. **wc-custom 不在 SUPPORTED_MANIFESTS**：apply-manifest.ts 永遠無法執行 POD 電商站
4. **WP Bridge 無自動化安裝路徑**：100% 手動，每站都需人工介入
5. **WPvivid 在 feature tier**：應與 mainwp-child 視為「維運對」(management pair)，每站必裝
6. **無 drift 偵測**：裝完之後沒有機制驗證站台是否還符合 desired state
7. **主機模型單一**：系統假設所有站都在同一台機器，無法描述客戶遷移到自己主機的情境

## 決策

採用 **Site Contract 五層架構**，以 desired state 取代 imperative install scripts：

```
registry.ts      # Layer 1 — 單一外掛 SSOT（含 tier / source / module）
contract.ts      # Layer 2 — SiteContract 型別 + resolveDesiredPlugins()
reconciler.ts    # Layer 3 — 冪等收斂引擎（report-mode + apply-mode）
installer.ts     # Layer 4 — source-aware 安裝器（wporg / release-url / manual-zip）
drift-watcher.ts # Layer 5 — 持續艦隊合規監控
```

## 核心設計決策

### 外掛分層（tier）

```ts
tier: "operational"  // 每站必裝，系統維運必要（mainwp-child, wpvivid, kadence, wp-bridge, litespeed†）
tier: "feature"      // 依客戶業務類型裝（WooCommerce, FluentCRM, WP Travel Engine...）
```

`operational` 外掛由 reconciler 強制收斂，不受 intake form 影響。

### 外掛來源（source）

```ts
source: "wporg"        // WP-CLI wp plugin install <slug>（免費 WP.org 外掛）
source: "release-url"  // GitHub release zip URL + token（aware-wave-wp-bridge）
source: "manual-zip"   // /opt/lobster-plugins/<slug>.zip（WordPressIT 付費授權）
```

`manual-zip` 安裝路徑：zip bundle 上傳到 `/opt/lobster-plugins/`（建站機固定路徑）→ WP-CLI 從本機路徑裝 → 不需外部 URL / token。

### 主機模型（host）

```ts
host: {
  type: "awarewave"  // 跑在 AwareWave Hetzner（代管）
        | "client"   // 客戶自己的主機（Day 1 即是，或從 awarewave 遷出後）
  sshHost: string
  sshCredentialsRef: string
}
```

遷移 = 改 `host.type` + `host.sshHost` → reconciler 對新主機收斂一次 → 完成。

### 模組定義（module）

| module | 說明 | 典型外掛 |
|--------|-----|---------|
| `core` | 原 `base`，每站功能基礎 | Kadence, FluentForms, Rank Math, Wordfence... |
| `ecommerce` | WooCommerce 電商 | WooCommerce, Stripe, PayPal, CartFlows... |
| `pod` | POD/客製電商專屬 | woocommerce-product-addons（客戶上傳設計稿）|
| `tourism` | 觀光/預約 | WP Travel Engine, Modula, Maps... |
| `brand` | 品牌/CRM | CPT UI, Popup Maker... |

> POD 履約不裝 Printful WooCommerce 外掛（見 ADR 008）；履約走 native store API（app 端）。

### Manifest slim down

4 個 manifest JSON 保留但瘦身：只放 site config（theme activate / WooCommerce options / smoke profile / guardrails）。外掛安裝步驟從 manifest 移除，由 reconciler 依 SiteContract 處理。

`mainwp-child` 加回 `wc-core.json` + `wc-custom.json`；`wc-custom` 加入 `SUPPORTED_MANIFESTS`。

### 回填（現有 live 站）

1. reconciler report-mode 掃描全艦隊 → 輸出 drift report
2. 人工審核確認
3. reconciler apply-mode 逐站收斂

### DR 驗證

每月一次：真實 restore WPvivid 備份到拋棄式 staging 站 → 驗 checksum → 刪除。

## 後果

- 正面：
  - 每站 desired state 可版控、可審計、可 diff
  - 新站 / 現有站 / 遷移站統一走同一條路徑
  - WP Bridge 自動安裝，移除所有人工步驟
  - WPvivid 升為 operational，確保每站都有備份能力
  - 艦隊 drift 可持續監控
- 負面／代價：
  - 需新建 `packages/wp-provisioning/` 套件（registry + contract + reconciler + installer + drift-watcher）
  - 舊 `wp-install-plugins` task 與 `apply-manifest.ts` 需在 cutover 後刪除（不留 forever-flag）
  - `manual-zip` 路徑需 operator 手動上傳 zip bundle 到建站機 `/opt/lobster-plugins/`

## 實作階段

| 階段 | 內容 | 前提 |
|-----|-----|-----|
| Phase 0 | `wc-core.json` + `wc-custom.json` 補 mainwp-child；`SUPPORTED_MANIFESTS` 加 wc-custom；ecommerce module 換 PayPal / ti-wishlist / wc-points；YITH 兩支移除 | 無 |
| Phase 1 | `registry.ts`（含 tier/source/module/pairsWith）；`SiteContract` 型別；`resolveDesiredPlugins()` | Phase 0 |
| Phase 2 | `reconciler.ts` report-mode；`installer.ts` wporg + manual-zip；現有站 drift scan | Phase 1 |
| Phase 3 | `installer.ts` release-url（wp-bridge 自動化）；`drift-watcher.ts`；DR 自動驗證 | Phase 2 |

## 需跟進文件／腳本

- `lobster-factory/packages/wp-provisioning/`（新套件）
- `lobster-factory/packages/manifests/wc-core.json`（補 mainwp-child）
- `lobster-factory/packages/manifests/wc-custom.json`（補 mainwp-child）
- `lobster-factory/packages/workflows/src/trigger/apply-manifest.ts`（加 wc-custom 到 SUPPORTED_MANIFESTS）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts`（Phase 0 catalog 改動）
- `agency-os/WORKLOG.md`（Phase 0 實作記錄）
