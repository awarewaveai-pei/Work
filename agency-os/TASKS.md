# Global Task Board

> **待辦原則（給營運者）**  
> - **單一清單**：所有「之後還要做」的事，應以本檔 **`Next — 未完成`** 或 **`Backlog — 未完成`** 的一條 `- [ ]` 表示；不要只放在聊天或腦裡。  
> - **當天做不完／臨時改做別的**：在當日 **`WORKLOG.md`** 寫一句（做了什麼、停在哪、為何轉向）；若承諾仍有效，**留在下面未完成清單**；若作廢，把該條刪除或改成「已取消／改路由至…」。  
> - **`Next — 已完成歷程`**：僅供查說：曾經排過、已完成者；**新工作請不要加在這裡**。  
> - **收工與打勾（預設全自動）**：**不必手動**改 `TASKS`。**只打 `AO-CLOSE`（或收工同義詞）即觸發代理**依當輪對話與 **`TASKS` 開放項**在當日 **`WORKLOG.md`**（`## yyyy-MM-dd`）寫 **`- AUTO_TASK_DONE: <唯一子字串>`**（須只命中一條仍為 `- [ ]` 的待辦；已 `[x]` 時略過並收斂標記），**不必再口頭重複指令**。收工腳本會跑 **`scripts/apply-closeout-task-checkmarks.ps1`** 打勾並改為 **`AUTO_TASK_DONE_APPLIED (UTC): …`**。選填： **`pending-task-completions.txt`**（見 **`pending-task-completions.example.txt`**）。`AO-CLOSE` 開頭會印 **`print-today-closeout-recap.ps1`** 摘要。

## In Progress
- [x] 建立多租戶案場資料夾結構（company -> site -> project）
- [x] 設計標準報價包（建置/維運/行銷/客製）
- [x] 定義變更單（CR）流程與核價規則
- [x] 套入第一個真實客戶到 `tenants/company-a/`
- [x] 完成 `2026-001` Discovery 需求盤點（初版）
- [x] 補齊 `2026-001` 時程與里程碑日期（初版）
- [x] 建立 `lobster-factory` Phase 1 底座骨架（Supabase migrations + wc-core manifest + workflow 安全骨架）

## Next — 未完成（目前正式隊列）
- [ ] **（AO-RESUME 提醒）雙機環境對齊（桌機＋筆電）**（詳見 `docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5 / §1.5.1）
  - 新機/筆電首次：完成 Windows 本機 WordPress 相容層（MariaDB + PHP + WP-CLI + `scripts/bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`），此路徑與 Supabase/MCP 分列。
  - 之後每次開工：monorepo 根跑 `scripts/ao-resume.ps1` 至 exit 0（含 ff-only pull、gates、`print-open-tasks` 快照、Strict 稽核），再於 Cursor 使用 `AO-RESUME`。
  - 筆電需安裝並登入 GitHub CLI（`winget install --id GitHub.cli` + `gh auth login`），Node major 與桌機/CI 對齊；`secrets-vault` 與 `mcp.json` 皆為每台獨立設定。
  - 兩台都要在 monorepo 根執行 `powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -Strict` 且 PASS（無 WARN）後才可勾選此項。
- [ ] 啟動 Next-Gen 升級藍圖 v1（M1→M3）
  - 參考：`docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
  - 本項目標：先選 2 個試點（1 既有站接手 + 1 新站建置）
- [ ] **既有站接手（Soulful Expression Art Therapy）**
  - 本項目標：完成 M1 台帳（staging/prod、備份策略、維護窗、baseline 外掛/版本）
- [ ] **新站建置（Scenery Travel Mongolia）**
  - 本項目標：完成 M1 啟動（tenant/site/project + 雲端 staging 可用 + Discovery 國際需求補齊）
- [ ] **既有站接手 Day 1（Soulful Expression）**
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` 第 1~2 節
  - 產出：權限與基線盤點
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）**
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md` 第 1~2 節
  - 產出：新站 staging 啟動條件
- [ ] `tenants/templates/` v2
  - 本項目標：試點 tenant 實填回饋後，再擴欄位與自動檢查（若有）
- [ ] （Next-Gen 對齊）M3 控制台輸出映射到「20 部門」責任矩陣與模板欄位
  - 目的：避免 Pilot 成果與跨國企業目標脫鉤
- [ ] `lobster-factory` A10-2 商業閉環實跑
  - 流程：新客戶建立 -> 驗收 -> production 觸發證據鏈
- [ ] `lobster-factory` A7 全站自動建站補齊
  - 範圍：hosting adapter + provision/shell guardrails 端到端
- [ ] Enterprise 工具層 Phase 1 正式串接
  - 範圍：Clerk auth、env/mcp secrets 治理、Cloudflare WAF/rate-limit、Sentry error ingest、PostHog core events、Slack alerts
  - DoD：下列子任務全數完成且有對應證據連結（WORKLOG / report）
- [ ] （工具建置）Phase 1 建議順序（P1 -> P7）
  - P1：Secrets 治理升級（先處理金鑰與權限，避免後續返工）
  - P2：Hetzner 自託管 n8n（staging）（先把自動化骨幹架好）
  - P3：Sentry 觀測接入（先看得到錯誤，後面才好除錯）
  - P4：PostHog 事件基線（建立可量測 funnel）
  - P5：Cloudflare 邊界保護（staging 先上防護）
  - P6：Clerk 組織與角色（B2B 多租戶權限落地）
  - P7：Next.js 控制台 v1（把前面能力做成可操作介面）
  - 依賴說明：P7 會依賴 P1/P3/P4/P6 的資料與權限設計
  - 追溯總表：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`（每一工具任務對回規格 + DoD + 證據欄位）
- [ ] （工具建置）Next.js 控制台 v1（Internal Ops）
  - 處理：建立 app skeleton、客戶清單頁、部門勾選頁（20 部門）、提交後寫出 `DEPARTMENT_SELECTION` payload
  - DoD：可建立 1 個測試客戶設定並在 UI 回顯成功
- [ ] （工具建置）Hetzner 自託管 n8n（staging）
  - 處理：在 Hetzner 建立 n8n 節點（含 TLS、備份、最小權限），並接回現有 webhook/notification 路由
  - DoD：`client_onboarding` 相關輕量流程可在 staging 端到端跑通 1 次
- [ ] （工具建置）Sentry 觀測接入
  - 處理：接入 API/workflow 錯誤上報 + release tag；定義 1 條告警規則
  - DoD：可人工觸發 1 筆測試錯誤並在 Sentry 收到告警
- [ ] （工具建置）PostHog 事件基線
  - 處理：定義 core events（至少 onboarding_start / onboarding_completed / deploy_requested / deploy_result）
  - DoD：可在 PostHog 看到一筆完整測試 funnel
- [ ] （工具建置）Clerk 組織與角色（B2B 多租戶）
  - 處理：建立 org + role 對照（owner/admin/operator/viewer）並映射到現有權限邏輯
  - DoD：2 個測試角色登入後，看到不同權限結果
- [ ] （工具建置）Cloudflare 邊界保護
  - 處理：DNS / WAF / rate limit / 基本防護規則（先 staging）
  - DoD：staging 入口啟用防護且不影響正常流程
- [ ] （工具建置）Secrets 治理升級（從 env/mcp 到集中管控）
  - 處理：定義 secrets owner、輪替節奏、最小讀取權限；先覆蓋 Trigger/n8n/GitHub 相關高風險金鑰
  - DoD：完成一輪輪替演練，服務不中斷

## Next — 已完成歷程（查詢用）
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
- [ ] `lobster-factory` Enterprise 必備工具補強路線
  - 範圍：Sentry / PostHog / Cloudflare / Secrets / Identity
  - 現況：Identity=Clerk；Secrets 暫採 env/mcp，後續升級 secrets manager
- [ ] **`lobster-factory/packages/workflows` `npm audit`**（2026-04-01）
  - 現況：16 筆多為 Trigger.dev CLI / `@trigger.dev/core` 傳遞依賴（socket.io、cookie、esbuild dev、tar、giget、systeminformation）。
  - 禁止：勿在本目錄執行 `npm audit fix --force`（會導向不相容 Trigger 版本）。
  - 對策：等待官方 `@trigger.dev/sdk` / `trigger.dev` 小版修補，或官方釋出後再 `npm update` + 回歸；本機勿將 Trigger dev server 暴露公網。

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
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-04-09 09:29:25 UTC_

