# BRIEF_WP_PLUGIN_STACK_AUTOINSTALL_AI.md

> **這份文件的用途**：歷史參考 — Phase 0-4 已全部實作完成（2026-05-13）。  
> **未來修改外掛清單**：請改 [`WP_CLIENT_PLUGIN_STACK.md`](../../agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md)（SSOT），不再回頭改本檔。  
> Last updated: 2026-05-13 — Status: ✅ Implemented (commits 41a773a / a6ce672 / 02455c5 / 45dce6c)

---

## 背景（每個 Phase 都要讀）

你正在為 `app.aware-wave.com`（Lobster Factory 客戶 onboarding 系統）實作「WordPress 外掛堆疊自動安裝」功能。

目標：在 `/onboard` Wizard 選擇站型後，系統自動組合對應的外掛清單，最終由 Trigger.dev workflow 透過 WP-CLI 安裝到客戶 WordPress 網站。

**必讀規則（開始任何 Phase 前都要先讀）**：  
- 系統安全規則：`lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md` §3（11 條不可踩的紅線）  
- 實作計畫全文：`lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md`  
- 外掛選型依據：`agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md`

---

## Phase 0 — Plugin Stack Catalog（TypeScript SSOT）

### 你要做什麼
建立一個 TypeScript 檔案，把 `WP_CLIENT_PLUGIN_STACK.md` 的外掛清單變成機器可讀的資料結構。這是所有後續 Phase 的基礎。

### 開始前必讀（照順序）
1. `agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md` — 外掛清單與模組定義
2. `lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md` — Phase 0 的 TypeScript 結構草稿
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/build-console/contracts.ts` — 了解現有型別風格

### 新建這個檔案
```
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts
```

### 必須包含的內容

**型別：**
```typescript
export type WpSiteType = "tourism" | "brand" | "ecommerce";
export type WpPluginModule = "base" | "ecommerce" | "tourism" | "brand";

export interface WpPlugin {
  slug: string;               // WP-CLI install 用（wp plugin install <slug>）
  label: string;              // 顯示名稱（中文或英文）
  free: boolean;              // false = 付費外掛，WP-CLI 無法自動安裝
  required: boolean;          // false = 選配（如 Complianz †）
  module: WpPluginModule;
  alternativeSlug?: string;   // 替代外掛 slug（↩）；供 resolveInstallableSlugs 在 free: false 時改用
}
```

**函式（必須 export）：**
```typescript
// 回傳完整外掛物件陣列（含付費外掛）
export function resolvePluginStack(siteType: WpSiteType, hasEcommerce: boolean): WpPlugin[]

// 只回傳 free: true 的 slug 清單（可直接傳給 WP-CLI）
export function resolveInstallableSlugs(siteType: WpSiteType, hasEcommerce: boolean): string[]

// 只回傳 free: false 的外掛（顯示「需手動安裝」警告用）
export function resolvePaidPlugins(siteType: WpSiteType, hasEcommerce: boolean): WpPlugin[]
```

**外掛資料來源**：完全對應 `WP_CLIENT_PLUGIN_STACK.md` 的 `WP.org Slug` 欄：
- `module: "base"` → 文件「一、基礎全員必裝」（16 個功能位）
- `module: "ecommerce"` → 文件「二、電商模組」（12 個功能位）
- `module: "tourism"` → 文件「三、站型專屬模組 3.1」（5 個功能位）
- `module: "brand"` → 文件「三、站型專屬模組 3.2」（3 個功能位）

**★ / ↩ 處理規則**：
- 表格「★首選」行 → `slug` 欄；若付費（PAID）同時填入 `free: false`
- 表格「↩替代」行 → 對應 ★ 條目的 `alternativeSlug`（不另建獨立條目）
- `DIRECT`（如 ECPay）→ `slug: "ecpay-payment-gateway"`, `free: false`（無 WP.org，需手動安裝）

**`resolveInstallableSlugs` 邏輯**（必須實作）：
```
for each plugin in resolvePluginStack(siteType, hasEcommerce):
  if plugin.free === true  → push plugin.slug
  if plugin.free === false && plugin.alternativeSlug → push plugin.alternativeSlug
  if plugin.free === false && !plugin.alternativeSlug → skip（進 resolvePaidPlugins）
```

**組合規則**：
- `siteType: "ecommerce"` → `hasEcommerce` 強制為 `true`（忽略傳入值）
- `siteType: "tourism"`, `hasEcommerce: false` → base + tourism
- `siteType: "tourism"`, `hasEcommerce: true` → base + ecommerce + tourism
- `siteType: "brand"`, `hasEcommerce: false` → base + brand
- `siteType: "brand"`, `hasEcommerce: true` → base + ecommerce + brand
- `siteType: "ecommerce"` → base + ecommerce（無 tourism/brand）

### 驗收條件
- [ ] `resolvePluginStack("tourism", true)` 回傳 base(16) + ecommerce(12) + tourism(5) = **33 個外掛物件**（含付費）
- [ ] `resolvePluginStack("ecommerce", false)` 等同 `("ecommerce", true)` = base(16) + ecommerce(12) = 28 個
- [ ] `resolveInstallableSlugs("brand", false)` 回傳 slug **字串陣列**，每個項目皆可直接傳給 WP-CLI（包含以 `alternativeSlug` 替換的條目）
- [ ] `resolveInstallableSlugs` 不含 `free: false` 且無 `alternativeSlug` 的外掛 slug
- [ ] `resolvePaidPlugins` 回傳的外掛全部 `free === false` 且無 `alternativeSlug`（真正需要手動安裝的）
- [ ] TypeScript 編譯無錯誤：`cd lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit`

### 不要做的事
- 不要修改 `contracts.ts`（Phase 2 才動）
- 不要改任何 UI 檔案
- 不要建立任何其他新檔案

---

## Phase 1 — OnboardWizard 新增站型選擇步驟

### 你要做什麼
在現有的 4 步驟 Wizard 裡，在 Step 1（客戶資訊）之後插入新的 Step 2（網站類型 + 外掛堆疊確認）。現有的 Step 2/3/4 往後推為 Step 3/4/5。

### 開始前必讀（照順序）
1. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/onboard/OnboardWizard.tsx` — 完整讀完，了解現有 4 步驟架構
2. `lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md` — Phase 1 的 UI 設計說明
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts` — Phase 0 建立的 catalog（必須先完成 Phase 0）

### 修改這個檔案
```
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/onboard/OnboardWizard.tsx
```

### 需要的變更

**`ClientInfo` 型別新增欄位：**
```typescript
wpSiteType: WpSiteType;           // "tourism" | "brand" | "ecommerce"
hasEcommerce: boolean;
resolvedPluginSlugs: string[];    // resolveInstallableSlugs() 的輸出
resolvedPaidPlugins: WpPlugin[];  // resolvePaidPlugins() 的輸出
```

**`makeDefaultClient()` 預設值：**
```typescript
wpSiteType: "brand",
hasEcommerce: false,
resolvedPluginSlugs: resolveInstallableSlugs("brand", false),
resolvedPaidPlugins: resolvePaidPlugins("brand", false),
```

**新 Step 2 UI 元素：**
1. 三個按鈕（radio-like card）：「旅遊業」「形象 / 品牌站」「一般電商」
2. Checkbox「含電商（WooCommerce）」
   - 選「一般電商」時：checkbox 強制 checked + disabled
   - 選其他時：checkbox 可選
3. 外掛清單摘要（每次站型變動自動更新）：
   - 顯示：「共 N 個外掛」
   - 子項：「可自動安裝 N 個 / 需手動授權 N 個」
   - 展開清單按鈕（可折疊）：列出所有外掛名稱
   - 付費外掛顯示橘色警告

**邏輯規則：**
- `wpSiteType` 或 `hasEcommerce` 變動時 → 重新呼叫 `resolveInstallableSlugs` 和 `resolvePaidPlugins` 更新 `ClientInfo`
- Step 2 一定要選站型才能進入 Step 3

**Step 編號更新（必須同步更新所有相關型別和邏輯）：**
```typescript
// 原本：type WizardStep = 1 | 2 | 3 | 4
// 改為：
type WizardStep = 1 | 2 | 3 | 4 | 5;
```
- 舊 Step 2（部門選型）→ 新 Step 3
- 舊 Step 3（開通服務）→ 新 Step 4
- 舊 Step 4（啟動 Build）→ 新 Step 5
- Progress bar 更新為 5 步
- 任何 `step === 4` 的條件判斷都要改成 `step === 5`

**Step 5（原 Step 4）新增摘要欄位顯示：**
```
網站類型：旅遊業 + 電商
外掛總數：33（可自動安裝 N / 需手動授權 M）
```
> 「外掛總數」= `resolvePluginStack().length`；「可自動安裝 N」= `resolvedPluginSlugs.length`；「需手動授權 M」= `resolvedPaidPlugins.length`

**Step 5 跳轉 BuildConsole 時，URL 參數必須傳遞新欄位：**

找到現有 Step 4（新 Step 5）的 `/build` URL 建構邏輯（約 `OnboardWizard.tsx` lines 472–488），在 URL SearchParams 新增：
```typescript
params.set("wpSiteType", clientInfo.wpSiteType);
params.set("hasEcommerce", String(clientInfo.hasEcommerce));
params.set("pluginSlugs", clientInfo.resolvedPluginSlugs.join(","));
params.set("paidPluginCount", String(clientInfo.resolvedPaidPlugins.length));
```

### 驗收條件
- [ ] 選「一般電商」→ `hasEcommerce` 自動為 true，checkbox 不可取消
- [ ] 選「旅遊業」+ 勾電商 → `resolvePluginStack("tourism", true).length === 33`（總外掛物件數）
- [ ] 選「旅遊業」+ 勾電商 → `resolvedPluginSlugs` 只含可 WP-CLI 安裝的 slug（每個 `free: true` 或有 `alternativeSlug` 的）
- [ ] 選「形象站」不勾電商 → `resolvePluginStack("brand", false).length === 19`（total）
- [ ] Step 5 摘要顯示站型、總外掛數、可自動安裝數、需手動授權數
- [ ] 跳轉 `/build` 的 URL 包含 `wpSiteType`, `hasEcommerce`, `pluginSlugs`, `paidPluginCount` 參數
- [ ] `type WizardStep = 1 | 2 | 3 | 4 | 5` 已更新
- [ ] TypeScript 編譯無錯誤

### 不要做的事
- 不要改 `contracts.ts`（Phase 2 才動）
- 不要改 `BuildConsole.tsx`
- 不要改 CSS 主題（用現有 class）

---

## Phase 2 — contracts.ts 擴充 + Build Console 外掛摘要顯示

### 你要做什麼
1. 在 `BuildRunRequest` 新增站型欄位（向後相容）
2. 更新 `smokeProfileFor` 邏輯
3. Build Console 新增「已選外掛堆疊」摘要區塊

### 開始前必讀（照順序）
1. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/build-console/contracts.ts` — 完整讀完
2. `lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md` — §5 合約規格、§3 不可踩的規則
3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/build/BuildConsole.tsx` — 完整讀完
4. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts` — Phase 0 建立的 catalog

### 修改這些檔案

**1. `lib/build-console/contracts.ts`**

新增型別（re-export 自 catalog）：
```typescript
export type { WpSiteType } from "../wp-plugin-stack-catalog";
```

`BuildRunRequest` 新增欄位（在 `packageSlug` 之後）：
```typescript
wpSiteType?: WpSiteType;
hasEcommerce?: boolean;
pluginSlugs?: string[];     // 已解析的可安裝 slug 清單
paidPluginCount?: number;   // 需手動安裝的付費外掛數量
```

`smokeProfileFor` 函式更新（改用新欄位）：

> **位置**：`smokeProfileFor` 定義在 `contracts.ts` 內部，由 `profileBPlan()` 呼叫，形如：
> ```typescript
> smokeProfile: smokeProfileFor(req),
> ```
> 找到這個函式定義並更新簽名與邏輯（不要在 Profile A 的路徑裡呼叫它）：

```typescript
function smokeProfileFor(req: BuildRunRequest): BuildPlan["smokeProfile"] {
  if (req.hasEcommerce || req.wpSiteType === "ecommerce") return "woocommerce";
  if (req.wpSiteType === "brand") return "business";
  return "basic";
}
```

`packageSlug` 派生邏輯（在 `normalizeBuildRequest` 裡）：
```typescript
// 若 wpSiteType 有值但 packageSlug 沒有，自動派生
packageSlug: payload.packageSlug
  ?? (payload.hasEcommerce || payload.wpSiteType === "ecommerce" ? "wc-core" : "wp-basic"),
```

**2. `app/build/BuildConsole.tsx`**

先找到現有 `useEffect`（約 lines 143–166），它讀取 URL SearchParams 來初始化表單。在此 `useEffect` 內新增對新參數的讀取：
```typescript
const wpSiteType = searchParams.get("wpSiteType") as WpSiteType | null;
const hasEcommerce = searchParams.get("hasEcommerce") === "true";
const pluginSlugsRaw = searchParams.get("pluginSlugs");
const pluginSlugs = pluginSlugsRaw ? pluginSlugsRaw.split(",").filter(Boolean) : undefined;
const paidPluginCount = Number(searchParams.get("paidPluginCount") ?? "0") || undefined;

// 加入 setForm 呼叫中：
// wpSiteType: wpSiteType ?? undefined,
// hasEcommerce: hasEcommerce || undefined,
// pluginSlugs: pluginSlugs,
// paidPluginCount: paidPluginCount,
```

在 Profile B/C 的表單區塊下方（Integrations 上方）新增外掛摘要區塊：

```tsx
{(profile === "profile_b" || profile === "profile_c") && form.pluginSlugs && form.pluginSlugs.length > 0 && (
  <div className="build-plugin-stack-summary">
    <div className="section-title">WordPress 外掛堆疊</div>
    <div>
      站型：{form.wpSiteType ?? "未選擇"}
      {form.hasEcommerce ? " + 電商" : ""}
    </div>
    <div>
      自動安裝：{form.pluginSlugs.length} 個
      {form.paidPluginCount ? ` / 需手動：${form.paidPluginCount} 個` : ""}
    </div>
    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
      如需修改，請回到 Onboard Wizard 重新選型
    </div>
  </div>
)}
```

### 驗收條件
- [ ] `BuildRunRequest` 包含 `wpSiteType`, `hasEcommerce`, `pluginSlugs`, `paidPluginCount` 欄位（全部 optional）
- [ ] 舊的 `packageSlug` 欄位仍然存在（向後相容）
- [ ] `smokeProfileFor` 優先使用 `hasEcommerce` / `wpSiteType` 判斷
- [ ] Build Console：從 Wizard Step 5 帶入參數時，顯示外掛摘要
- [ ] 直接開啟 `/build`（不從 Wizard 來）時，外掛摘要不顯示（`pluginSlugs` 為 undefined）
- [ ] TypeScript 編譯無錯誤

### 不要做的事
- 不要移除或重命名 `packageSlug`（breaking change）
- 不要在 Build Console 讓使用者修改外掛清單（只顯示）
- 不要改 Profile A 的任何邏輯

---

## Phase 3 — Trigger.dev Workflow 外掛安裝（後端）

### 你要做什麼
在 `create_wp_site` workflow 的 Stage 3（Apply package manifest）實作真正的 WP-CLI 外掛安裝邏輯，並把安裝結果逐一寫入 `package_install_runs` 表。

### 開始前必讀（照順序）
1. `lobster-factory/docs/ONE_CLICK_BUILD_SYSTEM.md` — §8 Profile B 的 Stage 3 定義、§3 紅線規則、§15 Security
2. `lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md` — Phase 3 架構說明
3. `lobster-factory/packages/workflows/src/trigger/create-wp-site.ts` — 現有 workflow
4. `lobster-factory/packages/workflows/src/trigger/apply-manifest.ts` — 現有 manifest workflow
5. `agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md` — 了解哪些外掛是付費的

### 開始前先確認這些檔案存在（用 Glob 或 Read 確認，不存在則停下來報告）
```
lobster-factory/packages/workflows/src/trigger/create-wp-site.ts
lobster-factory/packages/workflows/src/trigger/apply-manifest.ts
```

### 修改 / 新建這些檔案
```
lobster-factory/packages/workflows/src/tasks/wp-install-plugins.ts  （新建）
lobster-factory/packages/workflows/src/trigger/create-wp-site.ts    （修改 Stage 3 佔位）
```

### wp-install-plugins task 規格

```typescript
// 輸入
interface WpInstallPluginsPayload {
  sshHost: string;
  sshCredentialsRef: string;   // vault 路徑，如 vault://ssh/client-name
  pluginSlugs: string[];       // 來自 BuildRunRequest.pluginSlugs
  organizationId: string;
  siteId: string;
  buildRunId: string;          // FK → ops_action_runs
}

// 輸出
interface WpInstallPluginsResult {
  installed: Array<{ slug: string; version: string }>;
  skipped_license: Array<{ slug: string; reason: string }>;
  failed: Array<{ slug: string; error: string }>;
}
```

**安裝邏輯（每個 slug 逐一處理）：**
1. 從 vault 讀取 SSH 憑證（絕對不能 hardcode）
2. SSH 連線到客戶主機
3. 對每個 slug 執行：`wp plugin install {slug} --activate --allow-root`
4. 解析輸出：成功 → `installed`；找不到（付費外掛）→ `skipped_license`；其他錯誤 → `failed`
5. 每個外掛結果寫入 Supabase `package_install_runs`（新增欄位：`plugin_slug`, `status`, `version`, `error_message`）
6. 回傳彙總結果

**安全規則（來自 ONE_CLICK_BUILD_SYSTEM.md §3 + §15）：**
- Secrets 不得出現在 log、handoff report、DB 欄位
- Provider failure 必須建立 `operator_task`，不得靜默成功
- 付費外掛（無法從 WP.org 安裝）→ 記錄為 `skipped_license`，不算失敗

### 驗收條件
- [ ] 安裝 10 個免費外掛後，`package_install_runs` 有 10 筆 `status: installed` 記錄
- [ ] 傳入付費外掛 slug → 記錄為 `skipped_license`，不拋錯
- [ ] SSH 憑證不出現在任何 log 或 DB 欄位
- [ ] 安裝失敗 → 建立 `operator_task` 記錄，workflow 繼續（不整個 abort）

---

## Phase 4 — Client Detail 顯示已安裝外掛

### 你要做什麼
在 `/ops/clients/[slug]` 頁面新增「初始外掛堆疊」區塊，顯示 Phase 3 安裝的結果。

### 開始前必讀（照順序）
1. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/[slug]/page.tsx` — 完整讀完
2. `lobster-factory/docs/PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md` — Phase 4 UI 設計

### 修改這個檔案
```
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/[slug]/page.tsx
```

### 需要的變更

在現有「外掛更新狀態」區塊**上方**新增區塊：

**資料查詢（在現有的 `Promise.all` 裡加入）：**
```typescript
supabase
  .from("package_install_runs")
  .select("plugin_slug, status, version, error_message, installed_at")
  .eq("organization_id", org.id)
  .order("installed_at", { ascending: false })
  .limit(100)
```

**顯示邏輯：**
- 若無資料 → 顯示「尚未執行初始安裝」
- 有資料 → 顯示：
  - ✅ 已安裝 N 個（綠色，含版本號）
  - ⚠️ 需手動安裝 N 個（橘色，列出外掛名）
  - ❌ 安裝失敗 N 個（紅色，含錯誤訊息）

### 驗收條件
- [ ] 有 `package_install_runs` 資料時正確顯示分類
- [ ] 沒有資料時顯示佔位訊息（不報錯）
- [ ] TypeScript 編譯無錯誤

---

## 通用規則（每個 Phase 都適用）

1. 不要動 Profile A 的任何邏輯
2. 不要動 Profile C 的任何邏輯（除非計畫明確說）
3. `plan_only` 模式必須保持安全：不呼叫任何外部 API、不寫 DB
4. 所有新欄位都是 `optional`（不改現有 required 欄位）
5. 每個 Phase 完成後執行：`cd lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit`
6. Commit message 必須以 `[claude]` 開頭
7. 不要建立任何 markdown 文件（除非你在實作 Phase 0-2，那些是 .ts 檔）
