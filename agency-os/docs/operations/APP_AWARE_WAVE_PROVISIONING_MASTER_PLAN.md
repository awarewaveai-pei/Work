# app.aware-wave.com 一鍵架站 / 企業佈建 — MASTER PLAN（總藍圖 SSOT）

> **這份是什麼**：把「客戶填表 → 討論/報價 → 一鍵架出整個企業的網站 + 串接所有服務」的**完整願景 + 現況 + 分階段路線圖**寫死，讓任何 session（含未來的我）一讀就能接續，不重做、不遺忘。
> **建立**：2026-06-06。**狀態**：Stage 0 ✅ 完成；Stage 1 起未動。
> **相關 SSOT**：[`APP_AWARE_WAVE_BUILD_ENGINE_STAGE0.md`](APP_AWARE_WAVE_BUILD_ENGINE_STAGE0.md)（建站引擎診斷+修復）、[`../../../lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`](../../../lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md)（機層租機 recipe，**已寫好+真機驗證**）、[`APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md`](APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md)、[`APP_AWARE_WAVE_CURRENT_STATE.md`](APP_AWARE_WAVE_CURRENT_STATE.md)。

---

## 0. 願景（操作者原話，不要稀釋）

> 客戶填資料（用 Fluent Form 或填完自動建立 FluentForm 資料 —— 因為要做 **CRM**），或我去填詳細資料和需求去**報價**，然後最後討論出來的結果**觸發建造出一個網站**，然後串聯 **Supabase Studio、n8n、Sentry、Netdata、Uptime Kuma、PostHog Cloud** 等等。
> `app.aware-wave.com/ops-console` = 將來要擴張的功能：**一次架出整個企業的網站**。

**白話總結**：app.aware-wave.com 不只是後台，是「**企業佈建控制台**」——從收客資料 → 報價 → 一鍵生出網站 + 整套可觀測性/自動化/CRM 服務棧。

---

## 1. 架構地圖（資料如何流動）

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

## 2. 現況矩陣（誠實版）

| 能力 | 狀態 | 證據 |
|---|---|---|
| 有 pending run → 建真 staging WP → 狀態 completed | ✅ **已驗證** | 2026-06-06 e2e run `655197bf` completed + curl 200（WORKLOG）|
| 客戶填表 → 自動生出那個 pending run | ❌ **未通** | 2 筆 intake_forms 卡 `spec_generated`，0 run（症狀：按「觸發建站」跳回第一步）|
| Fluent Form（公開 WP）→ intake 橋接 | ❌ 未做 | 無橋接程式 |
| 中央 FluentCRM（收客資料進 CRM）| ❌ 未做 | — |
| AI 自動報價 | ❌ 未做 | — |
| 機層一鍵租機（Hetzner+硬化+DNS）| 🟡 **寫好未接** | provisionClient 真機驗證；EMBED 文件 ready；app 按鈕沒呼叫 |
| 串接 Uptime Kuma / Sentry | 🟡 部分 | create-wp-site `input.integrations` 有走，但 onboarding 預設沒帶 token |
| 串接 Supabase Studio / n8n / Netdata / PostHog Cloud | ❌ 未做 | — |
| ops-console 一鍵架整套企業棧 | ❌ 未做 | UI 殼存在 |

---

## 3. 分階段路線圖

> 原則（R0）：每階段獨立、可驗證、最小爆炸半徑、可回滾。**每階段做完前都要 4 動作驗證（REALTEST/REVIEW/BUGHUNT/WORKLOG）。** Billable/破壞性步驟預設 OFF。

### ✅ Stage 0 — 建站引擎閉環（DONE 2026-06-06）
站層 timeout 45s→95s + blocked 狀態回寫；pending run → 真站 → completed 已證。詳 STAGE0 文件。

### 🔜 Stage 1 — 接通入口（form → 自動生 run）【**立即下一步**】
**目標**：客戶在 onboarding 填完 → 不靠人手塞 DB，就一路建到站。
**精確診斷步驟**：
1. 抓那 2 筆卡 `spec_generated` 的 intake_forms + 對應 website_specs id。
2. 直接 `POST /api/onboarding/trigger-build {website_spec_id, intake_form_id}`（帶正確 ops role header）→ **看精確錯誤碼**。可疑早退點（trigger-build/route.ts 行號）：
   - L35-39 `resolveOpsRole` → 公開 onboarding 流程**可能沒 ops role → 403 forbidden**（最可疑）
   - L52-57 missing_fields（UI 沒帶 spec/intake id？「跳回第一步」很可能是這個）
   - L276-282 validation_failed / L285-290 profile_gate_blocked
   - L293-300 action_catalog_missing（`plan.actionKey` 對不到 catalog）
3. **對症修**：
   - 若 role 403 → onboarding portal 要嘛走專屬內部 token、要嘛 trigger-build 對 onboarding 來源放寬（但要有 auth，不能裸奔）。
   - 若 UI「跳回第一步」→ 修前端：generate-spec 回來後正確帶 `website_spec_id`+`intake_form_id` 呼叫 trigger-build，成功才前進、失敗顯示錯誤（不靜默 reset）。
4. **驗收**：在 onboarding UI 走完一筆 → intake_forms `spec_generated → building`、ops_action_runs `pending→completed`、staging 站 curl 200。**全程不碰 DB**。
**風險**：Medium（auth 邊界）。**檔案**：`trigger-build/route.ts`、onboarding 前端、`submit`/`generate-spec`。
**⚠️ 注意**：`trigger-build/route.ts` 開頭註解已被另一 session 標記機層接入點 —— 動前先 `git log -5` 看是否有人在改。

### Stage 2 — Fluent Form → intake 橋接 + 中央 FluentCRM
**目標**：公開 aware-wave.com 的 Fluent Form 收件 → 自動進 (a) app 的 intake_forms、(b) 中央 FluentCRM（做客戶關係）。
**步驟**：
1. 決定橋接管道：Fluent Form webhook → n8n workflow → `POST /api/onboarding/submit`（建議走 n8n，與既有自動化一致；憑 `OPS_INBOX_INGEST_TOKEN` 模式做 auth）。
2. 同一 webhook fan-out 到中央 FluentCRM（哪台 WP 當 CRM 主機要先定）→ 建 contact + tag。
3. 欄位對映：Fluent Form 欄 → IntakeForm 型別（company_name/domain/language/package_slug…）。
**驗收**：填一筆公開表單 → app intake_forms 出現 + FluentCRM contact 出現。
**風險**：Medium。**前置**：Stage 1 通。**相關 agent**：`n8n-engineer`、`wordpress-plugin-expert`（Fluent 套件）。

### Stage 3 — 報價流（人工 + 之後 AI）
**目標**：「我去填詳細需求 → 報價 → 討論定案 → 觸發建站」。
**步驟**：
1. 先做**人工報價**：後台一個 quote 草稿（intake → 規格 → 報價單）→ 操作者確認 → 才解鎖 trigger-build。
2. 之後 **AI 報價**：用 spec_data + 規則/LLM 產出建議報價（package + 加購）。**先人工 gate，AI 只建議不自動成交**。
**驗收**：一筆 intake → 產報價單 → 確認 → 建站。
**風險**：Medium（金流相關 = High，需明示）。

### Stage 4 — 機層一鍵租機（接現成 provisionClient）
**目標**：建站時先租一台硬化好的 Hetzner 主機（而非只在共用 SG 容器開 staging）。
**步驟**（**不要重寫，照 EMBED_PROVISION_INTO_APP.md**）：
1. 新增 `app/api/provision/route.ts`（或在 trigger-build 內插一段）呼叫 `provisionClient()`（機層在站層**之前**）。
2. 安全閘：billable 開機要 approval（沿用 `approval_required` 機制）。
3. env（**預設全 OFF = 安全**）：`LOBSTER_SERVER_ADAPTER=hetzner_cloud`、`LOBSTER_SERVER_PROVISION_ENABLED=true`、`HETZNER_STAGING_TOKEN`、secretStore sink。
**驗收**：dry-run（不花錢）→ 真開一台 → ref.sshHost 餵站層建 WP → 全綠 + rollback 測試（失敗自動刪機無孤兒）。
**風險**：**High（billable + 真開機）**，需明示 go-ahead。**現成資產**：provisionClient（M9 rollback 內建）、cli.ts（`/provision-client` 已用同函式）。

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
- AO-RESUME §7 下一步會點名 Stage 1。

**下一個動作（給未來的我）**：直接做 **Stage 1 — 抓那 2 筆卡住的 intake_forms，retry trigger-build 看精確錯誤碼，對症修入口**。
