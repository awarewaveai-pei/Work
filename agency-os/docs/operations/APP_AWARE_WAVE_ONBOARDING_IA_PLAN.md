# app.aware-wave.com — Onboarding / Provisioning 資訊架構（IA）重整計畫

> **這份檔的用途**：app.aware-wave 後台的「建站/佈建」相關頁面目前**碎裂成 4 個互相重疊的介面**（操作者「不知道用哪個」）。本檔是把它們收斂成**一條連貫的客戶生命週期管線**的**正式計畫**——分析、目標架構、分階段實作、風險、回滾、驗證。改任何 code 前先讀本檔。
> **狀態**：📋 規劃完成、**尚未實作**（等操作者批准 Phase 1）。
> **相關文件**：[`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md)（現況權威）、[`APP_AWARE_WAVE_COMPLETE_REFERENCE.md`](APP_AWARE_WAVE_COMPLETE_REFERENCE.md)（code 級參考）、[`../architecture/client-onboarding-portal-spec.md`](../architecture/client-onboarding-portal-spec.md)（Portal 14 段規格，未來願景）。
> **建立**：2026-06-05。

---

## 1. 問題（為什麼要重整）

操作者實測時反映「亂七八糟」。根因：**4 個介面都在做「建客戶站」這件事的一部分，職責重疊、有兩條建 org 路徑、還有一個壞掉的功能。**

| 介面 | 路徑 | 行數 | 一句話職責 |
|---|---|---|---|
| 客戶 Intake | `/ops/onboarding` | 572 | 客戶探索式問卷 → Claude 生規格 → 觸發建站 |
| 技術建站精靈 | `/onboard` | 1114 | 操作者手動配置（slug/外掛/部門/服務帳號）→ Build Console |
| Ops Console | `/ops-console` | 258 | 孤兒雜燴頁（架構卡 + 重複內容 + 壞功能）|
| Build Console | `/build` | — | **真正的建站執行器**（profile A/B/C）— 這個是合法引擎，非亂源 |

---

## 2. 現況分析（file:line 證據）

### 2.1 各介面實際做什麼

**`/ops/onboarding`（客戶 Intake — AI 路徑）**
- 5 步探索問卷（公司/客群/功能/視覺/素材），純問題空間、無技術欄位。
- 提交流程：`/api/onboarding/submit` → `/api/onboarding/generate-spec`（Claude Sonnet 生 `WebsiteSpec`）→ `/api/onboarding/trigger-build`。
- ⚠️ **`trigger-build` 自己建 organizations + 派工**（`app/api/onboarding/trigger-build/route.ts:119` insert organizations；多步驟建 org/workspace/project/site/environment + dispatch）。

**`/onboard`（技術建站精靈 — 手動路徑）**
- 5 步：① 客戶資訊（slug/name/email/domain/provider/ssh）② WP 外掛包 ③ **部門選型 M3（DepartmentSelector，20 部門）** ④ 開通服務帳號（Sentry/PostHog/Uptime Kuma/n8n/GitHub/Trigger/Supabase）⑤ 啟動 Build Console。
- API：`/api/ops/organizations`（`OnboardWizard.tsx:981`）+ `/api/build/provision-services`（:1008）→ 跳轉 `/build?<params>`（:889）。
- ⚠️ **另一條建 organizations 路徑**（與 intake 的 trigger-build 並存）。

**`/ops-console`（孤兒雜燴頁）**
- 架構邊界卡（靜態參考）、Media Boundary Rules（靜態）、Action Allowlist（靜態）。
- **租戶快照** ← 複製 `/ops/clients`。
- **Workflow Runs** ← 複製 `/build`（Build Console live status）。
- Tenant Config（只能改 status/locale/timezone 3 欄）。
- **DepartmentSelector（`page.tsx:244`）** ← 與 `/onboard` Step 3 **同一個元件**。
- **AiJobForm（:253）** ← **壞功能**：建立 `ai_image_jobs` queued 紀錄，但**沒有 Trigger.dev 處理器**，永遠停在 queued。

**`/build`（Build Console）**
- 真正執行器：profile_a（內部）/ profile_b（新建 WP）/ profile_c（採用既有）→ ops_action_runs → Trigger.dev `dispatch-action-run`。合法、不在「亂源」內。

### 2.2 重複地圖（亂的具體來源）
| 重複內容 | 出現在 | 應該只在 |
|---|---|---|
| 建 organizations | intake trigger-build + /onboard organizations API | **一條共用 service** |
| 租戶快照 | /ops-console + **/ops/clients** | /ops/clients |
| Workflow/Action Runs | /ops-console + **/build** | /build |
| DepartmentSelector（M3）| /ops-console + **/onboard Step3** | /onboard（建站流程內）|
| 「建客戶站」入口 | intake + onboard（兩條路徑同結果）| 一條管線、兩種輸入 |

### 2.3 依賴 / 慣例
- 頁面：globals.css class + inline style；無 Tailwind。
- 佈建：Trigger.dev + `ops_action_runs`；org/site/environment schema 在 `packages/db/migrations/0001..`。
- `DepartmentSelector` / `AiJobForm` 元件被 import → **退役頁面不可連元件一起刪**（會破 /onboard / 未來用途）。
- `/build` 接受從 `/onboard` 帶的 URL params（`OnboardWizard.tsx:889`）→ 動 /onboard 必須保此契約。

---

## 3. 目標架構（30 年的乾淨樣子）

**核心觀念：建站不是 4 個競爭的頁面，是一條客戶「生命週期管線」的 5 個階段。**

```
[1 Intake]  →  [2 Spec]      →  [3 Review/Provision]  →  [4 Build]   →  [5 Live/Monitor]
 探索需求       AI 生規格         操作者審核+佈建服務        執行建站        上線+監控
 /ops/onboarding  generate-spec   （/onboard 的技術步驟）    /build         Clients/Repair
```

- **Stage 1 Intake**（`/ops/onboarding`）：客戶探索問卷 → 規格。**保留**（剛重設計，是未來方向）。
- **Stage 2 Spec**：Claude 生 `WebsiteSpec` + 操作者審核。
- **Stage 3 Review/Provision**：技術配置（外掛包 / 部門 M3 / 服務帳號）。= **`/onboard` 的步驟 2-4 的價值**，未來應接在 Intake 之後（而非平行的另一個入口）。
- **Stage 4 Build**（`/build`）：唯一執行器。
- **Stage 5 Live/Monitor**：`/ops/clients` + Repair Center。

**兩種輸入、一條管線**：新客戶可從「客戶問卷（AI）」或「操作者直接技術配置（手動）」進入，但**共用同一個後端佈建 service + 同一個 /build 執行器**，不再有兩條建 org 路徑。

**`/ops-console` 在目標架構中沒有位置** —— 它的內容全部已在 Clients / Build Console / /onboard，或屬靜態文件（架構邊界）。退役。

---

## 4. 與現況的差距（Gap）
1. Intake 與 /onboard 是**平行**的（兩個入口、兩條建 org），目標是**串接**（一條管線）。
2. `/ops-console` 是**孤兒重複頁**，目標是**移除**。
3. DepartmentSelector 在兩處，目標**只在建站流程內**。
4. AiJobForm 是**未完成壞功能**，目標**移除或完成**（另案）。
5. 建 organizations 兩條路徑，目標**收斂成一條 service**。

---

## 5. 分階段計畫（最小爆炸半徑、每階段可獨立驗證+回滾）

### Phase 1 — 安全清理（低風險，純前端 + 文件，無 DB/API/後端動）
**目標**：解掉最確定的髒（孤兒頁 + IA 不清），零資料風險。
1. **退役 `/ops-console`**：sidebar 移除連結 + route 改 `redirect("/ops/clients")`（保留原檔 git history，一行可還原）。**元件不刪**（DepartmentSelector/AiJobForm 仍被 import）。
2. **IA 分組**：sidebar 把建站兩入口標清第 1 步（客戶 Intake）/ 第 2 步（技術建站），對齊管線觀念。
3. **canonical 文件**：CURRENT_STATE 加「客戶生命週期管線」段，標明每頁職責 + 待收斂項。
- **風險**：低。route 重導可逆；無後端動。
- **回滾**：git revert layout + 還原 ops-console/page.tsx。
- **驗證**：tsc 綠；部署後 `/ops-console`→307→Clients；/onboard + /ops/onboarding 仍 200；DepartmentSelector 在 /onboard 仍運作。

### Phase 2 — 後端建 org 收斂（中風險，逐步）
**目標**：intake 的 trigger-build 與 /onboard 共用**單一 org-provision service**（消除兩條路徑）。
- 抽出共用 `provisionClientOrg(spec|manualConfig)` service；trigger-build + provision-services 都呼叫它。
- 加冪等防護（避免重複 org）。
- **風險**：中（動建 org + RLS + Trigger.dev 派工）。**需獨立 R0 block + 充分實測**。
- 本批**不做**，僅列計畫。

### Phase 3 — 單一導引流程（中-高風險，大工程）
**目標**：Intake 生規格 → 自動接進 /onboard 的技術 review + 服務佈建 → /build，變單一 fork 入口（AI 問卷 / 手動）。
- 重用既有元件（intake 表單、DepartmentSelector、服務佈建、Build Console），**不重寫 /onboard 的 1114 行邏輯**。
- **風險**：中-高。**需獨立 R0 block + 設計稿 + 分步驟上線**。
- 本批**不做**，僅列願景。

---

## 6. 需操作者決策（Open Questions）
| # | 決策 | 選項 | 建議 |
|---|---|---|---|
| Q1 | /ops-console 退役方式 | A) redirect 到 Clients B) 只從 nav 移除、route 留著可直連 C) 留著不動 D) 完全刪除 | **A（redirect）** — 最乾淨可逆 |
| Q2 | Phase 2 時程 | 現在排 / 先只做 Phase 1 / 之後再說 | **先 Phase 1，Phase 2 我另出設計** |
| Q3 | AiJobForm（AI 生圖）| 移除 / 完成（接 Trigger.dev）/ 留著 | 隨 Phase 1 從 ops-console 移除（元件保留待 Phase 3 決定）|

---

## 7. 風險登記（Risk Register）
| 風險 | 階段 | 緩解 |
|---|---|---|
| ops-console route 外部書籤 404 | P1 | redirect 而非刪 |
| 連元件一起刪破 /onboard | P1 | 元件不刪，只動頁面/nav |
| 兩條建 org 統一動到既有建站 | P2 | 抽 service + 冪等 + 獨立實測 |
| 重寫 /onboard 1114 行成熟邏輯 | P3 | 禁止重寫，只重用/串接 |
| /build URL params 契約破壞 | P2/P3 | 保留 OnboardWizard.tsx:889 契約 |

## 8. 回滾總策略
- Phase 1：純前端 + 文件 → `git revert` 即可，零資料風險。
- Phase 2/3：各自獨立 commit + 各自 R0 block + Trigger.dev 可回滾 + DB 不破壞性 migration。

---

## 9. 驗證計畫（R0 四動作，每階段適用）
1. **實測**：`npx tsc --noEmit` + 部署後 curl 各路徑行為（redirect/200）+ DepartmentSelector 在 /onboard 功能。
2. **Review**：`/review` critic 讀回改動。
3. **抓蟲**：grep `/ops-console` 連結引用（app + docs）一起更新；確認元件 import 無孤兒。
4. **WORKLOG**：四動作證據鏈。

---

> **下一步**：操作者拍 Q1/Q2/Q3 → 我出 Phase 1 的 R0 實作 block → 批准 → 動工。Phase 2/3 各自另出設計，不在本批。
