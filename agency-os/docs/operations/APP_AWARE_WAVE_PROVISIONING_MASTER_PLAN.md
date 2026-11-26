# app.aware-wave.com 一鍵架站 / 企業佈建 — MASTER PLAN（總藍圖 SSOT）

> **這份是什麼**：把「客戶填表 → 討論/報價 → 一鍵架出整個企業的網站 + 串接所有服務」的**完整願景 + 現況 + 分階段路線圖**寫死，讓任何 session（含未來的我）一讀就能接續，不重做、不遺忘。
> **建立**：2026-06-06。**本檔只留願景與路線圖**；建站現況＝程式＋[建站流程手冊](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)。
> **相關 SSOT**：[`APP_AWARE_WAVE_BUILD_ENGINE_STAGE0.md`](APP_AWARE_WAVE_BUILD_ENGINE_STAGE0.md)（建站引擎診斷+修復）、[`../../../lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`](../../../lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md)（機層租機 recipe，**已寫好+真機驗證**）、[`APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md`](APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md)、[`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md)。

---

## 🚀 開工必讀（按順序，讀完這 7 步即完全掌握狀況）

> 操作者一說「繼續 app.aware-wave / 做 onboarding / 建站 / 佈建 / 做 Stage N」→ AI **依序**讀以下，不跳步。前 3 步給「藍圖+最新真相」，後 4 步給「程式+活資料」。

> 開客戶 WordPress 站的工作先讀[建站流程手冊](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)；下列第 4–6 步與 §1 是舊建站路徑（沒有頁面再用它建客戶站）。

1. **本檔全文**（§1 架構地圖 → §2 現況矩陣 → §3 路線圖 → §4 護欄）= 願景 + 做到哪 + 下一步。
2. **`git log --oneline -15`** + `agency-os/WORKLOG.md` 最近 2 個 `## YYYY-MM-DD` 區塊 = 最新發生什麼（**最新 commit 是真相，勝過任何文件聲稱**；多檔被平行 session 觸碰過，遵 VBC）。
3. **`APP_AWARE_WAVE_CURRENT_STATE.md`**（系統現狀）+ **`APP_AWARE_WAVE_BUILD_ENGINE_STAGE0.md`**（站層細節）+ **`EMBED_PROVISION_INTO_APP.md`**（機層租機 recipe）。
4. **入口三件套程式**：`apps/next-admin/app/api/onboarding/{submit,generate-spec,trigger-build}/route.ts`（§1 表有行號）。
5. **建站工作流**：`packages/workflows/src/trigger/{dispatch-action-run,create-wp-site}.ts` + `hosting/providers/httpJsonStagingAdapter.ts`。
6. **活資料（DB 現況）**：SSH SG → query `intake_forms` / `ops_action_runs` 各狀態數量（看真實卡在哪，別猜）。指令範本見 STAGE0 文件 §3。
7. **`agency-os/TASKS.md`** 搜 `MASTER PLAN` 那條 = 當前開放責任 + 即時下一步。

讀完 1-7 即可動工；不確定卡點 → 先做 §3 Stage 1 的「精確診斷步驟」，不臆測。

---

## 0. 願景（操作者原話，不要稀釋）

> 客戶填資料（用 Fluent Form 或填完自動建立 FluentForm 資料 —— 因為要做 **CRM**），或我去填詳細資料和需求去**報價**，然後最後討論出來的結果**觸發建造出一個網站**，然後串聯 **Supabase Studio、n8n、Sentry、Netdata、Uptime Kuma、PostHog Cloud** 等等。
> `app.aware-wave.com/ops-console` = 將來要擴張的功能：**一次架出整個企業的網站**。

**白話總結**：app.aware-wave.com 不只是後台，是「**企業佈建控制台**」——從收客資料 → 報價 → 一鍵生出網站 + 整套可觀測性/自動化/CRM 服務棧。

---

## 1. 架構地圖（資料如何流動）

> 歷史（2026-06）：舊建站路徑。現行架構見[建站流程手冊 §1](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)。

```
[公開收資料]                    [app.aware-wave 後台佈建引擎]                       [真實基礎設施]
aware-wave.com (WP)            app.aware-wave.com (Next.js 15)
 └ Fluent Form ──(橋?)──▶ /api/onboarding/submit    → intake_forms (status=submitted)
                          /api/onboarding/generate-spec → website_specs (status=spec_generated)  ◀── ⛔ 卡在這
                          /api/onboarding/trigger-build → 建 org/ws/proj/site + ops_action_runs(pending)
                                                          + kickActionRunDispatcher()
                                                               │
                                          (Trigger.dev EU) dispatch-action-run ──▶ create-wp-site
                                                               │                        │
                          ┌────────────────────────────────────┘                        │
                          │ [機層 — 已寫好未接] provisionClient()                          │
                          │   租 Hetzner 主機 + day-1 硬化 + Cloudflare DNS                │
                          │   (要接在站層之前；EMBED_PROVISION_INTO_APP.md)                │
                          ▼                                                              ▼
                    (新主機 ref.sshHost)                          [站層 — ✅ 已通] provision-staging
                                                                  SSH 進 SG WP 容器 → 建真 staging WP
                                                                  (~71s, curl 200)
                                                                       │
                                                   markActionRunTerminal → ops_action_runs=completed
                                                                       │
                          [整合 — 部分接] runAllIntegrations: Uptime Kuma / Sentry (input.integrations)
                          [未接] Supabase Studio / n8n / Netdata / PostHog Cloud / FluentCRM
```

### 關鍵元件清單（檔案 = SSOT）

| 元件 | 檔案 | 狀態 |
|---|---|---|
| 收資料入口 | `app/api/onboarding/submit/route.ts` | 存在（未驗證 e2e）|
| 規格生成 | `app/api/onboarding/generate-spec/route.ts` → `status=spec_generated` | 存在（卡在這之後）|
| 建站觸發 | `app/api/onboarding/trigger-build/route.ts` | **完整且穩健**（建 org/ws/proj/site + enqueue run + kick dispatcher；有 idempotency/validation/profile gate）|
| intake 生命週期型別 | `lib/onboarding/intake-form.ts`（IntakeForm / WebsiteSpec）| 存在 |
| dispatcher | `packages/workflows/src/trigger/dispatch-action-run.ts`（傳 `_dispatchedFromActionRunId`）| ✅ |
| 站層建站工作流 | `packages/workflows/src/trigger/create-wp-site.ts` | ✅ Stage 0 修好 |
| 站層 hosting adapter | `packages/workflows/src/hosting/providers/httpJsonStagingAdapter.ts`（timeout 95s）| ✅ |
| 站層真建站端點 | `app/api/internal/hosting/provision-staging/route.ts`（SSH→WP 安裝，~71s）| ✅ |
| **機層租機（租機+硬化+DNS）** | `packages/workflows/src/provision/provisionClient.ts` + `serverAdapterFactory.ts` + `cli.ts` | ✅ **已寫好+真機驗證**（cpx12@sin），**未接進 app 按鈕** |
| 機層嵌入 recipe | `lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md` | 文件 ready |
| 佈建控制台 UI | `app/ops-console/page.tsx`（未來企業佈建台，**勿刪**）| 存在 |

---

## 2. 現況

見[建站流程手冊](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)。本節原矩陣（2026-07 的 `local_direct` staging 建站）已過時，取法：`git log -p -- agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`。

---

## 3. 分階段路線圖

> 原則（R0）：每階段獨立、可驗證、最小爆炸半徑、可回滾。**每階段做完前都要 4 動作驗證（REALTEST/REVIEW/BUGHUNT/WORKLOG）。** Billable/破壞性步驟預設 OFF。

### ✅ Stage 0 — 建站引擎閉環（DONE 2026-06-06）
站層 timeout 45s→95s + blocked 狀態回寫；pending run → 真站 → completed 已證。詳 STAGE0 文件。

### ✅ Stage 1 — ops 觸發建站（DONE 2026-07-04；舊觸發方式已於 2026-11-23 退場）
現行做法見[建站流程手冊](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)。

### ✅ Stage 2 — Fluent Form → intake 橋接 + 中央 FluentCRM（DONE 2026-07-04）
**目標**：公開 aware-wave.com 的 Fluent Form 收件 → 自動進 (a) app 的 intake_forms（含 AI 生規格）、(b) 中央 FluentCRM（做客戶關係）。
**已完成（2026-07-02）**：
- `submit/route.ts` 已加入 x-ops-sync-key 雙路徑 auth。
- `intake-public/route.ts` + `coerce-fluent-form.ts` + middleware + 64KB cap + allow-list（critic 2Major 同日折入）。
**已完成（2026-07-03）**：
- n8n workflow `onboarding: FluentForm intake bridge`（id `RbrHNu3BUEmpNWeT`）建立 + e2e 驗（n8n → submit → DB row）。
**已完成（2026-07-04，決策：改直連，廢 n8n 橋）**：
- aware-wave.com WP：FluentForms Pro 6.2.5 已裝；form_id=3（11 欄位含 company_name/industry/pages_needed/budget_tier/contact_email 等）已建。
- FluentForm webhook feed：改指 `/api/onboarding/intake-public`（含 Bearer ONBOARDING_PUBLIC_INTAKE_TOKEN，narrow-scoped）→ FluentForm 直打 app，不過 n8n 橋。
- FluentCRM feed：`CRM Contact`（tags=prospect,website-inquiry，update_contact=yes）與 form_id=3 綁定。
- n8n `RbrHNu3BUEmpNWeT` **已停用**（active=False，2026-07-04 PATCH /deactivate）：直連取代後冗餘，停用避免重複觸發。
- 安全修正：舊 webhook 從 OPS_PROXY_SHARED_SECRET（爆炸半徑=全後端）換成 ONBOARDING_PUBLIC_INTAKE_TOKEN（narrow，僅 intake-public）。
- e2e 已驗：FluentForm POST → ok=True, intake_id=5c0b0307, next=awaiting_build_approval（AI spec 生成成功）；無 token → 401 ✓。
**ONBOARDING_PUBLIC_INTAKE_TOKEN** 已在 SG `.env` + docker-compose.yml env block + container `printenv` 確認 + vault 存檔。
**驗收**：✅ FluentForm 填寫 → intake_forms 出現 status=spec_generated + website_spec_id → /ops/onboarding 顯示「觸發建站」按鈕（Stage 1 對接）。

### Stage 3 — 報價流（人工 + 之後 AI）✅ 程式完成
**目標**：「客戶填詳細需求 → 報價 → 討論定案 → 觸發建站」。
**已完成（2026-07-02）**：
- Migration `0055_intake_quote.sql`：`intake_forms` 加 `quote_data JSONB` + `quote_status TEXT DEFAULT 'none'`（帶 CHECK constraint）。
- `app/api/onboarding/quote/route.ts`：GET/POST/PATCH — 完整報價生命週期 API。
- `trigger-build/route.ts` 加報價 gate：`draft/pending_approval/rejected` → 409 `quote_approval_required`；`none/approved` → 通過。
**待做**：
- ~~跑 `0055_intake_quote.sql` migration~~ ✅ 已套 EU（2026-07-02 WORKLOG「0055_intake_quote.sql migration applied」；2026-07-03 再驗 quote_data/quote_status 欄位存在）。
- 前端操作頁（目前 API 已可用 curl / n8n 操作）。
**風險**：Low（gate 已生效）。

### Stage 4 — 機層一鍵租機（接現成 provisionClient）✅ 程式完成
**目標**：建站時先租一台硬化好的 Hetzner 主機。
**已完成（2026-07-02）**：
- `app/api/provision/route.ts`：呼叫 `provisionClient()`，ops-role + sync-key auth，env-gated 安全。
- `next.config.ts` + `tsconfig.json`：加入 `@workflows` webpack alias 讓 next-admin 可 import packages/workflows。
- （原 `BuildConsole.tsx`「機層租機」面板已隨 `/build` 頁刪除；`/api/provision` 目前沒有頁面呼叫，且它派的 `provision-machine` 任務不存在。）
**env 設定（上線前 SG .env 加）**：`LOBSTER_SERVER_ADAPTER=hetzner_cloud`、`LOBSTER_SERVER_PROVISION_ENABLED=true`、`HETZNER_STAGING_TOKEN`。預設 none = idle 安全。
**現況（2026-07-03 實查）**：SG .env 三個 flag 均未設（確認缺）；vault 無 `HETZNER_STAGING_TOKEN`（僅有主帳 `HETZNER_API_TOKEN`）→ 開閘前需決定：另開 Hetzner staging project 專用 token（建議，隔離爆炸半徑）或暫用主 token。Trigger.dev workflows 2026-07-02 已完整 deploy（WORKLOG AUTO_TASK_DONE），provision-machine 前置可能已就位，開閘時順驗。
**驗收**：✅ step 1 dry-run 確認回 `status:idle`（adapter=none；2026-07-03 sync-key POST 實測 `{"outcome":"idle","adapter":"none"}`）→ 改 env 開 hetzner_cloud + mock 測 dry_run → 開真機（需明示 go-ahead）。
**風險**：**High（真開機 billable）**，env 預設 OFF 已保護。

### Stage 5 — 串接整套服務棧（願景終點）
**目標**：建站同時自動接 Supabase Studio / n8n / Sentry / Netdata / Uptime Kuma / PostHog Cloud。
**步驟**：
1. 盤點 `orchestrate-tenant-provisioning`（trigger.config syncEnvVars 已備 Sentry/GitHub/PostHog/n8n/Uptime tokens）—— **可能已有半套**，先讀再做（VBC）。
2. 每服務一個 idempotent provisioner（建 project/source/monitor）+ 寫回 `ops_action_runs` 整合結果。
3. ops-console 顯示每租戶的服務棧連結 + 健康。
**驗收**：一鍵 → 各服務出現對應 project/monitor + ops-console 列出。
**風險**：High（多外部 API + 憑證），逐服務上、預設 OFF。

---

## 4. 永久護欄（跨階段強制）

- **Cloudflare ~100s origin ceiling**：站層同步建站 >100s 會 CF 524。現 71s 安全。若未來 plugins 變多 → provision-staging 改 **async（202 + 回呼/輪詢）** 或走 CF-bypass 內網位址。（Stage-1+ 硬化項）
- **Billable / 破壞性預設 OFF**：機層租機、DB 寫入、manifest 執行 —— 全 env-gated，明示才開。
- **Auth 不裸奔**：任何新入口（webhook/橋接/provision）要有 token 或 role gate。
- **平行 session**：`trigger-build/route.ts`、機層 provision 由另一 session 觸碰過 → 動前 `git log -5` + 讀 WORKLOG，避免重工/衝突（VBC）。
- **不碰 Tarot**（操作者明令，另一 AI 處理）。

---

## 5. 這份 plan 的「不會忘」掛勾（持久化）

- **本檔** = 總 SSOT（agency-os/docs/operations/）。
- **TASKS.md** 有對應 open 任務（AO-RESUME 自動列）。
- **memory** 有 pointer（每 session recall）。

**下一個動作**：以 `agency-os/TASKS.md` 為準；建站操作見[建站流程手冊](../../../lobster-factory/docs/hosting/CLIENT_SITE_FLOW.md)。
