# PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md

> **Owner File** — WordPress 外掛堆疊自動安裝功能實作計畫。  
> **所屬系統**：`app.aware-wave.com` Build System（Lobster Factory Phase 1）  
> **不涵蓋**：Build System 整體架構 → [`ONE_CLICK_BUILD_SYSTEM.md`](ONE_CLICK_BUILD_SYSTEM.md)；外掛選型依據 → [`agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md`](../../agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md)  
> **Last updated**: 2026-05-12  
> **Status**: Planning — not yet implemented

---

## 目的

在 `/onboard` Wizard 填入客戶資料後，一鍵完成：
1. 選擇網站站型（旅遊 / 形象 / 一般電商）+ 是否含電商
2. 系統自動組合對應外掛模組清單
3. 送出後由 Trigger.dev workflow 透過 WP-CLI 安裝並啟用全部外掛
4. 結果回寫 Supabase，在 `/ops/clients/[slug]` 可查已安裝清單

---

## 邊界（Scope）

| 在 Scope | 不在 Scope |
|---------|-----------|
| OnboardWizard 新增站型選擇步驟 | 外掛授權購買流程 |
| contracts.ts 擴充站型欄位 | Trigger.dev workflow 完整實作（另立 ticket）|
| Plugin Stack Catalog TypeScript SSOT | 外掛設定（安裝後的 WP 設定） |
| Build Console 顯示外掛清單 | Profile C（既有站採用）的外掛差異比對 |
| `/ops/clients/[slug]` 已安裝外掛顯示 | 付費外掛自動購買 |

---

## 現況快照

### 已有的結構（不重建）

| 元件 | 路徑 | 狀態 |
|------|------|------|
| OnboardWizard（4步驟） | `app/onboard/OnboardWizard.tsx` | ✅ 運行中 |
| Build Console | `app/build/BuildConsole.tsx` | ✅ 運行中 |
| BuildRunRequest 合約 | `lib/build-console/contracts.ts` | ✅ 已有 |
| Profile B Stage 3「Apply package manifest」| `contracts.ts:317` | ✅ 佔位已預留 |
| Client Detail Page | `app/ops/clients/[slug]/page.tsx` | ✅ 運行中 |
| MainWP 整合欄位 | `contracts.ts BuildIntegrations.mainWp` | ✅ 已有 |
| WP_CLIENT_PLUGIN_STACK.md（人類可讀）| `agency-os/docs/operations/` | ✅ 已建立 |

### 斷點（需要補齊）

| 斷點 | 說明 |
|------|------|
| `packageSlug` 是空殼 | `wp-basic / wp-business / wc-core` 沒有對應真實外掛清單 |
| 無機器可讀外掛 catalog | MD 文件是人類可讀，TypeScript 沒有對應資料結構 |
| Wizard 缺少站型選擇步驟 | 填完客戶資訊後直接跳部門選型，跳過外掛選擇 |
| `BuildRunRequest` 無站型欄位 | workflow 不知道要裝哪些外掛 |
| Trigger.dev workflow 無外掛安裝邏輯 | Stage 3 佔位，內容空白 |
| Client Detail 無已安裝外掛顯示 | 安裝完成後沒有地方看結果 |

---

## 解決方案架構

```
[OnboardWizard Step 2（新）]
  → 選站型 + 是否電商
  → Plugin Stack Catalog 即時計算模組組合
  → 顯示確認清單（N個外掛）
           │
           ▼
[BuildRunRequest（擴充）]
  + wpSiteType: "tourism" | "brand" | "ecommerce"
  + hasEcommerce: boolean
  + pluginSlugs: string[]   ← 已解析的 WP slug 清單
           │
           ▼
[Build Console 顯示]
  → 展示外掛清單 + 數量
  → enqueue 時一起送出
           │
           ▼
[Trigger.dev Workflow: create_wp_site]
  Stage 3: Apply package manifest
    → 接收 pluginSlugs[]
    → SSH + WP-CLI: wp plugin install {slug} --activate
    → 逐一記錄結果 → Supabase package_install_runs（擴充欄位）
           │
           ▼
[/ops/clients/[slug]]
  → 已安裝外掛清單（從 Supabase 讀）
  → 安裝失敗項目醒目標示
```

---

## 資料分層（Single Owner 原則）

| 資料 | Owner | 消費者 |
|------|-------|--------|
| 外掛選型邏輯（人類可讀）| `WP_CLIENT_PLUGIN_STACK.md` | 開發者參考 |
| 外掛 WP slug 清單（機器可讀）| `lib/wp-plugin-stack-catalog.ts`（新建）| Wizard、contracts、workflow |
| 站型選擇狀態 | `BuildRunRequest.wpSiteType` + `hasEcommerce` | Build Console、Trigger.dev |
| 安裝結果 | Supabase `package_install_runs` 表（擴充）| Client Detail Page |

---

## 實作計畫

### Phase 0 — Plugin Stack Catalog TypeScript SSOT（前置，無 UI 變動）

**新建檔案**：`lib/wp-plugin-stack-catalog.ts`

```typescript
// 機器可讀外掛清單 — 與 WP_CLIENT_PLUGIN_STACK.md 同步
// 修改此檔時必須同步更新 MD 文件（兩份不得分叉）

export type WpSiteType = "tourism" | "brand" | "ecommerce";

export interface WpPlugin {
  slug: string;                // WP.org / 付費外掛 slug（wp plugin install 用）
  label: string;               // 顯示名稱
  free: boolean;               // false = 需授權，自動安裝會跳過
  required: boolean;           // false = 選配（如 Complianz †）
  module: "base" | "ecommerce" | "tourism" | "brand";
  alternativeSlug?: string;    // 替代外掛 slug（↩）；free: false 時 resolveInstallableSlugs 改用此值
}

// 模組定義（對應 WP_CLIENT_PLUGIN_STACK.md）
// ★ 首選填 slug；↩ 替代填 alternativeSlug；† 選配填 required: false
export const WP_PLUGIN_CATALOG: WpPlugin[] = [ ... ];

// 組合函式：站型 + 電商旗標 → 完整外掛物件陣列（含付費）
export function resolvePluginStack(
  siteType: WpSiteType,
  hasEcommerce: boolean
): WpPlugin[] { ... }

// 只回傳可直接 wp plugin install 的 slug 清單：
//   free: true  → 使用 slug
//   free: false + alternativeSlug → 使用 alternativeSlug（替代免費版）
//   free: false + 無 alternativeSlug → 跳過（進 resolvePaidPlugins）
export function resolveInstallableSlugs(
  siteType: WpSiteType,
  hasEcommerce: boolean
): string[] { ... }

// 回傳無法自動安裝的付費外掛（free: false 且無免費替代）→ UI 顯示「需手動安裝」
export function resolvePaidPlugins(
  siteType: WpSiteType,
  hasEcommerce: boolean
): WpPlugin[] { ... }
```

**驗收條件**：
- `resolvePluginStack("tourism", true)` 回傳 base + ecommerce + tourism 模組
- `resolveInstallableSlugs` 過濾掉 `free: false` 的外掛
- 單元測試覆蓋 5 種組合

---

### Phase 1 — OnboardWizard 新增 Step 2（站型選擇）

**修改檔案**：`app/onboard/OnboardWizard.tsx`

現有步驟：1（客戶資訊）→ 2（部門選型）→ 3（開通服務）→ 4（啟動 Build）

**新步驟順序**：1（客戶資訊）→ **2（站型 + 外掛堆疊）** → 3（部門選型）→ 4（開通服務）→ 5（啟動 Build）

新 Step 2 UI 內容：

```
┌─────────────────────────────────────────────────┐
│  網站站型                                          │
│  ○ 旅遊業     ○ 形象 / 品牌站     ○ 一般電商      │
│                                                   │
│  ☐ 含電商（WooCommerce）                           │
│    ↳ 僅「一般電商」時預設勾選且不可取消             │
│                                                   │
│  組合後外掛清單（自動計算）                          │
│  ┌──────────────────────────────────────────┐    │
│  │ ✅ base（16個）+ ecommerce（12個）+ ...    │    │
│  │ [展開查看完整清單]                          │    │
│  │ ⚠️ 付費外掛（5個）需手動安裝               │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  [← 返回]              [下一步 → 部門選型]         │
└─────────────────────────────────────────────────┘
```

**新增到 `ClientInfo` 的欄位**：
```typescript
wpSiteType: WpSiteType;          // "tourism" | "brand" | "ecommerce"
hasEcommerce: boolean;
resolvedPluginSlugs: string[];   // 由 resolveInstallableSlugs() 計算（可 WP-CLI 安裝的）
resolvedPaidPlugins: WpPlugin[]; // 由 resolvePaidPlugins() 計算（需手動安裝的）
```

**邏輯規則**：
- 選「一般電商」→ `hasEcommerce` 強制 `true`，UI 鎖定不可取消
- 選「旅遊業」或「形象站」→ `hasEcommerce` 可選
- 每次 `wpSiteType` 或 `hasEcommerce` 變動 → 重新計算 `resolvedPluginSlugs`

---

### Phase 2 — contracts.ts 擴充 + Build Console 顯示

**修改檔案**：`lib/build-console/contracts.ts`

**新增型別**：
```typescript
export type WpSiteType = "tourism" | "brand" | "ecommerce";
// 從 wp-plugin-stack-catalog.ts re-export，保持單一來源
```

**`BuildRunRequest` 新增欄位**：
```typescript
wpSiteType?: WpSiteType;
hasEcommerce?: boolean;
pluginSlugs?: string[];   // 已解析的可安裝 slug 清單
```

**`packageSlug` 處理**：
- 保留欄位（向後相容），但改為從 `wpSiteType` + `hasEcommerce` 自動派生
- 派生規則：`ecommerce` 或 `hasEcommerce=true` → `wc-core`；其他 → `wp-basic`
- `packageSlug` 明確傳入時優先使用（override）

**`smokeProfileFor` 更新**：
```typescript
function smokeProfileFor(req: BuildRunRequest): BuildPlan["smokeProfile"] {
  if (req.hasEcommerce || req.wpSiteType === "ecommerce") return "woocommerce";
  if (req.wpSiteType === "brand") return "business";
  return "basic";
}
```

**Build Console UI 新增（`app/build/BuildConsole.tsx`）**：
- 在 Profile B/C 的表單區塊增加「已選外掛堆疊」摘要顯示
- 顯示：站型 + 外掛總數 + 付費外掛警告（不可安裝項目數）
- 僅顯示，不在此頁讓使用者修改（修改在 Wizard Step 2）

---

### Phase 3 — Trigger.dev Workflow 外掛安裝（後端執行層）

> **注意**：此 Phase 是後端 workflow，與前端獨立。需要另建 Trigger.dev task，不在 next-admin 裡。

**Trigger.dev workflow**：`create_wp_site`（Profile B）

**Stage 3「Apply package manifest」填充內容**：

```typescript
// packages/workflows/src/tasks/wp-install-plugins.ts

export const wpInstallPlugins = task({
  id: "wp-install-plugins",
  run: async (payload: {
    sshHost: string;
    sshCredentialsRef: string;
    pluginSlugs: string[];
    organizationId: string;
    siteId: string;
  }) => {
    // 1. SSH 連線（從 vault 讀取憑證）
    // 2. 逐一: wp plugin install {slug} --activate
    // 3. 記錄每個外掛的安裝結果 → Supabase package_install_runs
    // 4. 付費外掛（slug 不在 WP.org）→ 記錄為 skipped_license
    // 5. 回傳 { installed: [], skipped: [], failed: [] }
  }
});
```

**Supabase 擴充既有表**：`package_install_runs`（`ONE_CLICK_BUILD_SYSTEM.md §10` 已規劃）

> 不新建表，擴充現有 `package_install_runs` 新增以下欄位（需確認現有 schema 後執行 migration）：

| 新增欄位 | 型別 | 說明 |
|---------|------|------|
| `plugin_slug` | text | WP.org / 付費外掛 slug |
| `status` | text | `installed` / `skipped_license` / `failed` |
| `version` | text | 安裝後版本號 |
| `error_message` | text | 失敗原因（nullable） |

> 若 `package_install_runs` 現有結構無法擴充（欄位衝突），才考慮建立 `plugin_install_runs` 新表——決定前先讀現有 migration 檔案。

---

### Phase 4 — Client Detail Page 顯示已安裝外掛

**修改檔案**：`app/ops/clients/[slug]/page.tsx`

在現有「外掛更新狀態」區塊**上方**新增「初始外掛堆疊」區塊：

```
┌─────────────────────────────────────────────────┐
│  初始外掛堆疊                        2026-05-12   │
│                                                   │
│  站型：旅遊業 + 電商   總計：33個                   │
│                                                   │
│  ✅ 已安裝（28個）  ⚠️ 需授權（5個）  ❌ 失敗（0個）│
│                                                   │
│  [需授權外掛（手動安裝）]                            │
│  • Kadence Pro  • YITH Points  • CartFlows Pro... │
└─────────────────────────────────────────────────┘
```

資料來源：`package_install_runs` 表（擴充欄位後），按 `organization_id` + `site_id` 查詢最新一批。

---

## 實作順序（依賴關係）

```
Phase 0（Catalog）→ Phase 1（Wizard UI）→ Phase 2（Contracts）
                                              │
                                              ▼
                              Phase 3（Workflow）← 需要 SSH + vault
                                              │
                                              ▼
                              Phase 4（Client Detail 顯示）← 需要 Phase 3 的資料
```

Phase 0、1、2 可以在本機開發和測試，無需 SSH 或 Trigger.dev。  
Phase 3 需要在 Trigger.dev EU 伺服器部署後才可測試端到端。  
Phase 4 需要 Phase 3 已有安裝結果資料。

---

## 付費外掛處理策略

免費外掛（WP.org）→ WP-CLI 直接安裝  
付費外掛（需授權）→ 記錄為 `skipped_license`，在 Client Detail 顯示「需手動安裝」清單

**付費外掛清單**（來自 `WP_CLIENT_PLUGIN_STACK.md`，`free: false`）：
- Kadence Theme Pro / Kadence Blocks Pro / Kadence Shop Kit
- WP Rocket（若選擇替代 LiteSpeed Cache）
- CleanTalk
- Amelia（旅遊預約）
- YITH Points and Rewards
- CartFlows Pro / FunnelKit Pro
- WP Maps Pro

---

## 與現有文件的關係

| 文件 | 關係 | 衝突風險 |
|------|------|---------|
| `ONE_CLICK_BUILD_SYSTEM.md` | 本計畫是其 Stage 3 的填充實作 | 無 — 本計畫不改 Stage 定義 |
| `WP_CLIENT_PLUGIN_STACK.md` | 外掛選型的 SSOT；`catalog.ts` 必須與其同步 | 低 — 兩份需手動同步 |
| `WP_MANAGED_UPDATES.md` | 安裝後的更新維護由此文件管轄 | 無 — 職責不同（初裝 vs. 更新）|
| `contracts.ts` | 本計畫新增欄位，向後相容 | 低 — `packageSlug` 保留 |
| `WORDPRESS_CLIENT_DELIVERY_MODELS.md` | Profile B/C 的部署模式定義 | 無 |

---

## 驗收條件（完整端到端）

- [ ] Wizard Step 2：選旅遊 + 電商 → 自動顯示 33 個外掛，其中付費 N 個標示橘色
- [ ] Build Console：enqueue 後 `BuildRunRequest` 包含 `wpSiteType`, `hasEcommerce`, `pluginSlugs[]`
- [ ] Trigger.dev：Stage 3 完成後 `package_install_runs` 有對應記錄
- [ ] Client Detail：`/ops/clients/[slug]` 顯示已安裝外掛清單 + 需授權清單
- [ ] 付費外掛不嘗試安裝，記錄為 `skipped_license`
- [ ] `resolvePluginStack("ecommerce", true)` 只回傳 base + ecommerce（不含旅遊/形象）

---

## Changelog

| 日期 | 變更說明 |
|------|---------|
| 2026-05-12 | 初版建立：4個 Phase + 架構圖 + 所有需修改檔案清單 |
| 2026-05-12 | 品質修訂：架構圖 plugin_install_runs→package_install_runs；WpPlugin 介面加 alternativeSlug；補 resolvePaidPlugins；Phase 1 ClientInfo 補 resolvedPaidPlugins |
