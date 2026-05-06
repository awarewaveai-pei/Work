# Global Task Board



<details>
<summary><strong>待辦原則（給營運者）— 細節較長，可稍後再讀</strong></summary>

> **待辦原則（給營運者）**  
> - **單一清單**：所有「之後還要做」的事，應以 **`### 未完成`**（或 **`Backlog — 未完成`**）的一條 `- [ ]` 表示；不要只放在聊天或腦裡。**勿**在「未完成」區混放 `- [x]`（已完成請移到 **`Next — 已完成歷程`**）。  
> - **當天做不完／臨時改做別的**：在當日 **`WORKLOG.md`** 寫一句（做了什麼、停在哪、為何轉向）；若承諾仍有效，**留在下面未完成清單**；若作廢，把該條刪除或改成「已取消／改路由至…」。  
> - **`Next — 已完成歷程`**：僅供查說：曾經排過、已完成者；**新工作請不要加在這裡**。  
> - **收工與打勾（預設全自動）**：**不必手動**改 `TASKS`。**只打 `AO-CLOSE`（或收工同義詞）即觸發代理**依當輪對話與 **`TASKS` 開放項**在當日 **`WORKLOG.md`**（`## yyyy-MM-dd`）寫 **`- AUTO_TASK_DONE: <唯一子字串>`**（須只命中一條仍為 `- [ ]` 的待辦；已 `[x]` 時略過並收斂標記），**不必再口頭重複指令**。收工腳本會跑 **`scripts/apply-closeout-task-checkmarks.ps1`** 打勾並改為 **`AUTO_TASK_DONE_APPLIED (UTC): …`**。選填： **`pending-task-completions.txt`**（見 **`pending-task-completions.example.txt`**）。`AO-CLOSE` 開頭會印 **`print-today-closeout-recap.ps1`** 摘要。

</details>

## 現況快照（怎麼看懂：做過／沒做／做到哪）

| 你想查… | 請看 |
|--------|------|
| **還有什麼沒做完** | **`### 未完成`**（僅 `- [ ]`，一條一個開放責任）。 |
| **某件事結案了沒** | 編輯器 **搜尋標題關鍵字**。出現在 **`## Next — 已完成歷程`** 且為 `- [x]` → **已結案**；只出現在 **`### 未完成`** → **仍開放**。 |
| **進行到一半嗎** | 看該條是否含 **`—— 進度：`**；子項裡的日期／DoD 是細節證據。 |

**狀態 prefix（選用，方便掃描）**：**【未開始】**＝尚未動或尚未達第一個可驗證里程碑；**【進行中】**＝已有部分交付／PR／部署，但未達該條 DoD；**【卡住】**＝依賴外部決策或環境，見子項說明。

**機讀待辦快照**：開工時 **`scripts/ao-resume.ps1`** 會寫 **`agency-os/.agency-state/open-tasks-snapshot.md`**（gitignore），與本檔 **`### 未完成`** 應對齊。

**聊天 ≠ 入庫**：其他 AI（含 Claude）對話裡答應的待辦**不會**自動進 `TASKS`、也不會自動進任何 checklist 檔；若你看不到條目，代表**尚未寫入本 repo 並 commit**（或寫在別台機器未 push）。要生效：**請同一輪請代理／自己改 `TASKS.md`（或對應 Owner 檔）+ checkpoint／push**。

| **長期可稽核紀律（含「MD 為何可信」）** | **`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`** **§4**（真相順序、禁雙寫、演進範圍） |

## 歷史封存 — In Progress（早期項目，均已結案）

> 以下 **`- [x]`** 為存檔；**不要**用這段判斷「現在還要做什麼」——請看 **`### 未完成`**。

- [x] 建立多租戶案場資料夾結構（company -> site -> project）
- [x] 設計標準報價包（建置/維運/行銷/客製）
- [x] 定義變更單（CR）流程與核價規則
- [x] 套入第一個真實客戶到 `tenants/company-a/`
- [x] 完成 `2026-001` Discovery 需求盤點（初版）
- [x] 補齊 `2026-001` 時程與里程碑日期（初版）
- [x] 建立 `lobster-factory` Phase 1 底座骨架（Supabase migrations + wc-core manifest + workflow 安全骨架）

## Next — 未完成（目前正式隊列）

> **版面規約（減少漏勾／誤判）**  
> - **本節只保留 `- [ ]`。**已結案請移到 **`## Next — 已完成歷程（查詢用）`**，不要留在這裡。  
> - **代理**：完成某一條 DoD 時，當日 **`WORKLOG`** 必須有 **`- AUTO_TASK_DONE: <子字串>`**（命中該條待辦）；`AO-CLOSE` 會跑 **`apply-closeout-task-checkmarks`**。  
> - **縮排**：子項一律 **兩個空白**，勿使用單獨一字的 ` - [ ]`（易與清單錯位）。

### 未完成

- [ ] **（AO-RESUME 提醒）雙機環境對齊（桌機＋筆電）** —— **【進行中】** **進度：**兩台皆須 **`machine-environment-audit -Strict` PASS（無 WARN）**；任一台未 PASS 則本條不結案。**下一步：**在**每一台** monorepo 根跑該稽核；細項與證據索引 → **`docs/overview/DUAL_MACHINE_ENVIRONMENT_CHECKLIST.md`**。開機／hook／pull 敘事正本 → **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**（§1.5、§2.5.1）。
- [ ] **Git：`main` 未推送 commits → `git push origin main`** —— **【進行中】** **進度：**本地已有多次 commit（Trigger／PostHog／TASKS／WP MU 等）；**下一步：**`git fetch` → `git log origin/main..HEAD` → **`git push origin main`**。
- [ ] **Trigger workflows 完整 deploy** —— **【進行中】** **進度：**repo 已 **`syncEnvVars`**、鎖 CLI **`4.4.4`**、README／腳本齊；曾完成 **環境變數同步**，**缺**在 **EU** 對 **`registry:5000`** **映像 push**（見 **`lobster-factory/infra/trigger/README.md` §7a**）。**下一步：**於 EU 或 tunnel 就緒後跑 **`deploy-workflows.ps1`** 或 **`npx trigger.dev@4.4.4 deploy`**。
- [ ] **phase1 WordPress（SG）PostHog MU** —— **【進行中】** **進度：****repo** 已入 MU **`posthog.php`** + compose **`NEXT_PUBLIC_POSTHOG_*`**。**下一步：**SG **`docker compose build wordpress && docker compose up -d wordpress`**（或等價）→ 公開頁驗證載入。
- [ ] 啟動 Next-Gen 升級藍圖 v1（M1→M3） —— **【進行中】** **進度（2026-05-01）：**試點已選定：Soulful Expression（既有站接手）+ Scenery Travel Mongolia（新站建置）；兩站 tenant 骨架已建立。**下一步：**兩站各完成 Day 2（staging 建立）。
  - 參考：`docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
  - 本項目標：先選 2 個試點（1 既有站接手 + 1 新站建置）
- [ ] **既有站接手（Soulful Expression Art Therapy）** —— **【進行中】** **進度（2026-05-01）：**tenant 骨架完整（sites/ + projects/ 全部檔案建立）；Day 1 盤點項目需 **操作者** 登入 Hostinger/WP 填入。**下一步：**操作者執行 Runbook §1.1–1.3（權限＋基線盤點）並回填 10_DISCOVERY + ENVIRONMENT_REGISTRY。
  - 本項目標：完成 M1 台帳（staging/prod、備份策略、維護窗、baseline 外掛/版本）
- [ ] **新站建置（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-01）：**tenant 骨架完整（19 個檔案）；Discovery 骨架建立，客戶資料欄位待補（需與客戶訪談）；Day 2 staging 待選定主機商後執行。
  - 本項目標：完成 M1 啟動（tenant/site/project + 雲端 staging 可用 + Discovery 國際需求補齊）
- [ ] **既有站接手 Day 1（Soulful Expression）** —— **【進行中】** **進度（2026-05-01）：**專案骨架（10_DISCOVERY、01–03 文件、sites/ 三檔）已建立。**阻塞（操作者必做）：**需登入 Hostinger + WP 後台執行 §1.1–1.2 並回填 `10_DISCOVERY.md`、`core/ENVIRONMENT_REGISTRY.md`。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` 第 1~2 節
  - 產出：權限與基線盤點
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-01）：**tenant 骨架 + Discovery 骨架完成（Runbook §1 骨架部分完成）。**下一步：**與客戶確認素材，選定主機商 → Day 2 staging 建立。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md` 第 1~2 節
  - 產出：新站 staging 啟動條件
- [ ] `tenants/templates/` v2 —— **【未開始】** **進度：**依試點回填後再開；見 Pilot 條目。
  - 本項目標：試點 tenant 實填回饋後，再擴欄位與自動檢查（若有）
- [ ] （Next-Gen 對齊）M3 控制台輸出映射到「20 部門」責任矩陣與模板欄位 —— **【未開始】**
  - 目的：避免 Pilot 成果與跨國企業目標脫鉤
- [ ] `lobster-factory` A10-2 商業閉環實跑 —— **【未開始】**
  - 流程：新客戶建立 -> 驗收 -> production 觸發證據鏈
- [ ] `lobster-factory` A7 全站自動建站補齊 —— **【未開始】**
  - 範圍：hosting adapter + provision/shell guardrails 端到端
- [ ] Enterprise 工具層 Phase 1 正式串接 —— **【進行中】** **進度：**Secrets／Sentry／PostHog／Cloudflare／Slack 等 **已結案** → 見 **`已完成歷程`** **§2026-05-01**。**仍缺：**Clerk 組織與角色（＝下方獨立條目）、以及本項 **DoD** 要求的「端到端正式串接」**WORKLOG／report 證據鏈**。
  - 範圍：Clerk auth、env/mcp secrets 治理、Cloudflare WAF/rate-limit、Sentry error ingest、PostHog core events、Slack alerts
  - DoD：下列子任務全數完成且有對應證據連結（WORKLOG / report）
- [ ] 三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability） —— **【進行中】** **進度：**文件曾對齊；需 **每月 drift** 記錄與證據才算結案。
  - 範圍：`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md`、`ROUTING_MATRIX.md`、`TOOLS_DELIVERY_TRACEABILITY.md`
  - DoD：術語與欄位一致（`task_type`/`risk_level`/`environment`/`approval_required`），並完成每月 drift 檢查記錄
- [ ] （工具建置）Phase 1 建議順序（P1 -> P7） —— **【進行中】** **進度：****P1～P5、P2（n8n staging）** 已結案 → **`已完成歷程` §2026-05-01**。**仍開放：****P6**＝下方 **Clerk** 條目；**P7**＝下方 **Next.js 控制台**條目。本條為「總賬」，**結案時須 P6 + P7 + 上方 Enterprise 串接敘述一併滿足**。
  - 追溯總表：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`（每一工具任務對回規格 + DoD + 證據欄位）
- [ ] （工具建置）Next.js 控制台 v1（Internal Ops） —— **【進行中】** **進度（2026-04-25）：**DB migration、`/ops-console`、`POST /api/ops/ai-image-jobs`、`GET /api/ops/summary` 等 **已在 repo**。**下一步：**滿足 DoD——建立 **1 個測試客戶**並在 **UI 成功回顯**。
  - 處理：建立 app skeleton、客戶清單頁、部門勾選頁（20 部門）、提交後寫出 `DEPARTMENT_SELECTION` payload
  - 2026-04-25 進度：控制平面 migration 已新增 `0011_ops_console_control_plane.sql`（`ops_action_runs` / `ai_image_jobs` / `media_assets` / `ops_audit_events`）
  - 2026-05-01 進度：**`0018` → `0019` → `0020`** 已入 repo（`0020`＝Splinter 對齊之 **`workflow_runs` 去重** + **清掉四表全部 policy 後重建 0019** 以移除儀表板殘留）；診斷腳本 **`lobster-factory/packages/db/scripts/diag-splinter-auth-rls-initplan.sql`**；**須在 Supabase SQL Editor 依序套用**後 Advisor 才會消 WARN
  - 2026-04-25 進度：`next-admin` 已新增 `/ops-console` 與 `POST /api/ops/ai-image-jobs`（`queued` job + 審計；viewer 雙層擋）與 `GET /api/ops/summary`（讀 `organizations` 或安全 fallback）
  - 媒體分層固定：AI 生圖走 R2；WordPress 商品圖/部落格圖維持 WP 媒體庫（`wp-content/uploads` + MySQL）
  - 正本：`docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md`
  - DoD：可建立 1 個測試客戶設定並在 UI 回顯成功
- [ ] （工具建置）Clerk 組織與角色（B2B 多租戶） —— **【未開始】**（對照 Phase 1 **P6**） **進度：**規格與依賴已定；尚無「兩測試角色權限分流」的端到端證據。
  - 處理：建立 org + role 對照（owner/admin/operator/viewer）並映射到現有權限邏輯
  - DoD：2 個測試角色登入後，看到不同權限結果

## Next — 已完成歷程（查詢用）

### 2026-05-03 — 龍蝦 SSOT 連結收口

- [x] **龍蝦 SSOT 四檔 + 合併版 — 全域索引／腳本連結替換（`_v1.3`／`_v1.4`／`_v2`）** — 根／`lobster-factory` README、AO 導覽、`generate-integrated-status-report.ps1`、`validate-doc-integrity.mjs`、`DEPLOYMENT_CHECKLIST_v1.4` §0、`OPERATOR_RUNBOOK`；**刻意不改**：`WORKLOG`、舊 `memory/daily`、`.claude/sessions`。**日常入口**：`LOBSTER_FACTORY_CHECKLIST.md`（v3）；細項勾選：`MASTER_CHECKLIST_v2.md`。

### 2026-05-01 — 自 Next 隊列移入（整理版面）

- [x] **Supabase Postgres MCP（AwareWave）／EU SSH tunnel — 穩定 smoke**
  - `npm run smoke:supabase-tunnel`：PASS Postgres 127.0.0.1:5432 / PASS Studio :3000 / PASS Kong :8000
- [x] **n8n MCP（Cursor）：HTTP 運輸改 stdio 橋接並驗證（抖動／No tools）**
  - 證據：`scripts/run-n8n-mcp.mjs`、`mcp/registry.template.json`、`docs/operations/n8n-self-hosted-mcp-troubleshooting.md`
- [x] **建立全域月檢 `AgencyOS-MonthlySystemReview` 與 tenant monthly 排程基線**
- [x] **（Ops Inbox Path B）生產收斂完成 — 2026-05-01 實機驗證**
- [x] **（工具建置）安裝 Grok CLI（筆電 / Codex）**
- [x] Slack `#infra-alerts` 歷史訊息批次清理 — 2026-05-01（公司桌機）
- [x] Netdata Centralized Cloud Notifications — 2026-05-01（公司桌機）
- [x] ClickHouse TTL（EU server）— 2026-05-01
- [x] 筆電回家後重載 MCP 環境（`user-env.ps1` + `sync-mcp-config.ps1`）
- [x] **Trigger.dev 自託管上線（Hetzner compose）** — 營運定案 2026-04-20；正本 `lobster-factory/infra/trigger/README.md`
- [x] （工具建置）Sentry 觀測接入（含 `SENTRY_ALERT_POLICY.md`、gate 契約）
- [x] （工具建置）PostHog 事件基線
- [x] （工具建置）Cloudflare 邊界保護
- [x] （工具建置）Secrets 治理升級（含 n8n MCP key 輪替證據與 `AUTO_TASK_DONE`）

### 更早 — 查詢用
- [x] **（工具建置）Hetzner 自託管 n8n（staging）**
  - DoD：`client_onboarding` 輕量流程於 **staging** Webhook 端到端成功；證據見 `WORKLOG.md` **`## 2026-04-10`** →「n8n staging client_onboarding E2E」（`workflow_id` `LUEO8tirSCFaVGjH`、`execution_id` `1`、`route_summary` `POST /webhook/client-onboarding/staging-ping`）。
  - 正本：`docs/operations/n8n-staging-client-onboarding-e2e.md`
- [x] 建立 WordPress 客戶交付「雙模式 SOP」
  - 內容：既有站接手 + 新站從零
  - 原則：雲端 staging 優先，避免跨機重工
  - 檔案：`docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- [x] **既有站接手 Day 1（Soulful Expression）前置實填完成**
  - 已建台帳：`tenants/company-soulful-expression/`（`PROFILE.md`、`SITES_INDEX.md`、`core/ENVIRONMENT_REGISTRY.md`、therapy QA、專案 brief）
  - 待補欄位：標記 `待補`，待權限盤點後回填
- [x] **Phase 1 模板硬化（Core）**
  - 新增：`tenants/templates/core/ENVIRONMENT_REGISTRY.md`、`RELEASE_GATES_CHECKLIST.md`、`BACKUP_RESTORE_PROOF.md`
  - 升級：`ACCESS_REGISTER.md`、`SITES_INDEX.md`、`OPERATIONS_SCHEDULE.json`、`NEW_TENANT_ONBOARDING_SOP.md`
- [x] **Phase 1.5 產業 Overlay（首批）**
  - 新增：`tenants/templates/industry/travel/*`、`tenants/templates/industry/therapy/*`
  - 接入：`tenants/README.md`、`NEW_TENANT_ONBOARDING_SOP.md`、`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- [x] **（2026-03-30）整理 `docs/spec/raw/` 四份原文**
  - 範圍：V3 / Spec v1 / ENTERPRISE / CURSOR_PACK
  - 新增：`docs/spec/raw/README-four-sources-maintenance.md`（維護索引 + 大段錨點 + SSOT 對照）
  - 連動：各檔首段加維護提示，並回連 `company-os-four-sources-integration.md`、`docs/spec/README.md`
- [x] 定義 WordPress 客製系統開發準則（plugin/mu-plugin/資料表策略）
- [x] 建立 n8n 工作流分層（共用流程 vs 客戶專屬流程）
- [x] 建立 KPI + 毛利雙儀表板（規格）
- [x] 建立文件分類與連動更新機制（`docs/CHANGE_IMPACT_MATRIX.md`）
- [x] 建立結案自動檢查清單與文件自動同步（`scripts/doc-sync-automation.ps1`）
- [x] 建立每公司自動排程系統（Daily/Weekly/Monthly/Adhoc）
- [x] 建立國際化交付/合規/多幣別政策（global delivery/compliance/commercial）
- [x] 建立系統健康檢查機制（`scripts/system-health-check.ps1`）
- [x] 建立主動守護與告警機制（`scripts/system-guard.ps1` + 排程）
- [x] 建立桌面彈窗提醒（PASS/FAIL）與 ALERT/LAST_STATUS 主動提示
- [x] 建立可販售產品化藍圖與交接清單（`docs/product/*`）
- [x] 建立對外販售打包腳本（`scripts/build-product-bundle.ps1`）
- [x] 建立總控中心架構與多平台（WordPress-first）連動設計
- [x] （2026-04-09）AO-RESUME 規則防漂移硬化（單一 Owner + 腳本硬檢查 + 無效回覆判定）
  - Owner：`docs/operations/rules-version-and-enforcement.md`
  - 腳本：`scripts/ao-resume.ps1` 新增規則版本/鏡像一致性 precheck（失敗即中止 + quick-fix）
  - 規則：`30-resume-keyword.mdc` 明確「未全列 `- [ ]` 視為無效回覆，必須重出」
  - 對齊：`rules/README` + `cursor-enterprise-rules-index.md` 已補 Owner 入口
- [x] （2026-04-09）平台能力總表狀態欄位升級（含 emoji）
  - 檔案：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
  - 變更：新增「目前實際狀態」欄，並統一 `🟢 已上線 / 🟡 建置中 / ⚪ 未啟動` 圖例於能力總表與 P1-P7 建置順序表
  - 驗證：`doc-sync-automation -AutoDetect` + `system-health-check` 100% PASS
- [x] AO-CLOSE 預設 100% health 閘道已落地（規則/文件/腳本三層）
- [x] 用 1 個新客戶實跑 `tenants/NEW_TENANT_ONBOARDING_SOP.md`
  - 客戶：`company-p1-pilot`
  - 狀態：最小實跑完成
  - 證據：`reports/e2e/onboarding-a10-2/20260331-214650-company-p1-pilot-2026-010-p1-pilot/`
- [x] 全面檢查並升級 `tenants/templates/`（v1）
  - 新增：`core/DEPARTMENT_COVERAGE_MATRIX.md`、`core/CROSS_BORDER_GOVERNANCE.md`
  - 強化：`PROFILE`、`FINANCIAL_LEDGER`
  - 連動：`NEW_TENANT_ONBOARDING_SOP`、`tenants/README` 已接上（2026-04-02）
- [x] 新增對外短憲章
  - 檔案：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
  - 定位：30 年 AI/coding/專案管理跨國企業決策與執行口徑
- [x] 新增客戶精簡鏡像：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`
- [x] `system-guard.ps1` FAIL 後保守 auto-repair
  - 行為：只重跑 `doc-sync-automation` + `system-health-check` 一次
  - 升級條件：仍 FAIL 才產生 `ALERT_REQUIRED.txt`
- [x] 完成今日 AO-CLOSE 三步收工檢查（doc-sync / health / guard 全 PASS）
- [x] 完成今日 AO-CLOSE 一鍵閘道與同步推送
  - 流程：verify-build-gates + guard + integrated-status + git push
  - 補充：**2026-03-28 晚** 再跑一輪，收斂 A10 / SOP / presign 等本機變更
- [x] 報表單一路徑收斂（canonical=`agency-os/reports`，root `reports/` 退役為相容用途）
- [x] 建立標準 MSA/SOW/CR 文件模板
- [x] 修復 `AgencyOS-*` 排程路徑到 `D:\Work\agency-os` 並補齊命令引號防呆
- [x] 建立 reports 歸檔腳本（`scripts/archive-old-reports.ps1`）與 README 操作入口
- [x] 他處／公司機開機須知（`docs/overview/REMOTE_WORKSTATION_STARTUP.md` + `RESUME_AFTER_REBOOT.md` 分機情境）
- [x] Enterprise 工具層選型/安裝完成
  - 主工具：Sentry / PostHog / Cloudflare / Clerk
  - Secrets：先採 env/mcp（後續可升級）
  - 輔助：Supabase / Slack
- [x] 啟用 Operator Autopilot 規則與 Phase1 自動化腳本（startup preflight / alert auto-repair / closeout optional push / Slack notify）
- [x] AO + Lobster 事件流圖（Mermaid）已落地到 `docs/overview/ao-lobster-operating-model.md`
- [x] 落地「Single Owner 最高原則」：核心規則/`AGENTS.md` 已寫入；`doc-sync-automation.ps1` 新增 owner 重複內容檢查（registry 驅動）
- [x] Single Owner 第 2 階段：registry 擴充 AO-RESUME 主流程、30 秒自檢、AO-CLOSE 硬性 Gate（避免關鍵流程多處複製）
- [x] P1/P2 跑道加速：新增 preflight（`scripts/preflight-onboarding-a10-2-readiness.ps1`）、證據骨架初始化（`scripts/init-onboarding-a10-2-evidence-skeleton.ps1`）、Run ID 對照規格（`docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`）
- [x] 整合 `LOBSTER_FACTORY_MASTER_V3` 至系統建置路線（gap map + skeleton sprint + gate 追蹤，H1~H6 baseline 完成）
- [x] `lobster-factory` H3 第一批 skeleton sprint（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）
- [x] `lobster-factory` H4 Decision Engine baseline（recommendations schema + contract）
- [x] `lobster-factory` H5 CX retention/upsell baseline（workflow_runs 串接骨架）
- [x] `lobster-factory` C3-3 release gate baseline（PR gate + prod deploy gate）
- [x] `lobster-factory` Trigger deploy CI 修復完成（project ref 對齊 + 缺失 `uid` 補齊 + Actions 綠燈）
- [x] 修復 Cursor `user-trigger` MCP 啟動錯誤（移除錯誤 `--api-key` 參數，改 vault 啟動腳本）
- [x] 落地強制版 MCP routing 規格與風險矩陣（`MCP_TOOL_ROUTING_SPEC.md` + `workflow-risk-matrix.json`）
- [x] 落地 WordPress Factory 細部執行規格（`WORDPRESS_FACTORY_EXECUTION_SPEC.md`：step-by-step + failure matrix + approval payload）
- [x] 將 WordPress Factory 規範轉成可執行 gate（`wordpress-factory-execution-policy.json` + `validate-workflow-routing-policy.mjs` + bootstrap 整合）
- [x] `lobster-factory` C3-1 標準 E2E payload + staging 管線回歸腳本（`docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`、`run-staging-pipeline-regression.mjs`）
- [x] `lobster-factory` C2-1 mock hosting adapter（`hosting/mockStagingAdapter.ts` + `create-wp-site` 整合 + `MOCK_HOSTING_ADAPTER.md`）
- [x] `lobster-factory` C3-2 演練報告產生器（`emit-staging-drill-report.mjs` → `agency-os/reports/e2e/`）
- [x] `lobster-factory` hosting 合約（`resolveStagingProvisioning`、`provider_stub` 阻擋、`HOSTING_ADAPTER_CONTRACT.md`）
- [x] `lobster-factory` A9 本機 artifacts（`localArtifactSink`、`LOBSTER_ARTIFACTS_MODE=local`、`logs_ref` PATCH）
- [x] `lobster-factory` hosting `providers/` 合約骨架 + `print-create-wp-site-payload` CLI
- [x] `lobster-factory` 營運套裝：`operator:sanity`、`payload:apply-manifest`、`LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `lobster-factory` hosting：`http_json` 適配器 + 合約文件（`resolveStagingProvisioning` async）
- [x] `lobster-factory` A9：`remote_put` artifact 上傳（presigned PUT + presign broker 合約）
- [x] Monorepo 根 `README.md` + `EXECUTION_DASHBOARD` 現況對齊 + 雙邊 README／`AGENTS` 導覽連動
- [x] `lobster-factory` A10-1：`OPERABLE_E2E_PLAYBOOK.md` + `validate-operable-e2e-skeleton.mjs`（納入 bootstrap）；A9 政策 `ARTIFACTS_LIFECYCLE_POLICY.md`
- [x] A10-2 前置：`NEW_TENANT_ONBOARDING_SOP` Step 7（Lobster 銜接）+ `PRESIGN_BROKER_MINIMAL` + presign JSON 範例；operable gate 驗證 monorepo SOP 橋接
- [x] `lobster-factory` C1-2 execute 驗證（`package_install_runs` lifecycle：pending -> running -> completed）
- [x] `lobster-factory` C1-3 execute 驗證（DB 寫入韌性：retry/compensation/trace）
- [x] 建立零成本本機 Secrets Vault（Windows DPAPI，`scripts/secrets-vault.ps1`）
- [x] 完成 Secrets Vault 一鍵匯入（`mcp.json` + Lobster/Slack 關鍵值）
- [x] `lobster-factory` A9 雲端 artifacts 治理補齊 baseline（生命周期規則/IAM/稽核自動化：policy + validator + audit report）

## Backlog — 未完成
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）
- [x] `lobster-factory` Enterprise 必備工具補強路線（已取消）
  - 範圍：Sentry / PostHog / Cloudflare / Secrets / Identity
  - 現況：Identity=Clerk；Secrets 暫採 env/mcp，後續升級 secrets manager
- [ ] **`lobster-factory/packages/workflows` `npm audit`**（2026-04-01）
  - 現況：已做相依升級與 `overrides` 收斂；目前剩 2 筆 moderate，皆來自 `@trigger.dev/sdk` -> `uuid`（`<14.0.0`）上游傳遞依賴。
  - 2026-04-29 決策：`npm audit`/`npm outdated` 複核，`@trigger.dev/sdk` 與 `trigger.dev` 最新仍為 `4.4.4`，`fixAvailable=false`；暫列 **acceptable risk**（僅 moderate，無 high/critical）。
  - 禁止：勿在本目錄執行 `npm audit fix --force`（會導向不相容 Trigger 版本）。
  - 對策：持續追 Trigger 官方修補（`@trigger.dev/sdk`/`trigger.dev`）；每次升版後執行 `npm run test` + `npm audit` 回歸；本機勿將 Trigger dev server 暴露公網。
  - 例行檢查：執行 `npm run audit:workflows-security`，報告輸出至 `agency-os/reports/security/workflows-npm-audit-LATEST.md`（週檢 + 升版觸發檢查）。

## Backlog — 已完成歷程
- [x] 客戶分級與風險評分模型
- [x] 外包交付評分卡
- [x] 合規檢查清單（抓取與 leads）
- [x] 建立英文化客戶輸出模板（Proposal/SOW/Monthly Report）
- [x] 建立 release notes + upgrade path + migration checklist
- [x] `lobster-factory` 補齊 raw spec 差距檔案（C4-1~C4-5 完成）

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/architecture/agency-command-center-v1.md`
- `docs/compliance/leads-and-scraping-checklist.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/client-risk-scoring-model.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-05-06 09:38:32 UTC_

