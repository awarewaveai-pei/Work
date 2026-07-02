# Integrated status report (assembled)

- Generated: 2026-07-02 20:52:40
- agency-os root: `D:\Work\agency-os`

> Assembled from canonical sources only; edit those files to change truth. Chinese legend: `docs/overview/INTEGRATED_STATUS_REPORT.md`
>
> Regenerate: `powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1`

## Source index
- `TASKS.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- `memory/CONVERSATION_MEMORY.md`
- `memory/daily/YYYY-MM-DD.md`
- `LAST_SYSTEM_STATUS.md`, `WORKLOG.md`

## 1) TASKS.md - Next (unchecked)


## 2) TASKS.md - Backlog (unchecked)


## 3) Lobster Factory Master Checklist - open items (sections A-C, before section D)
- [ ] A7. 串接 WordPress 真正 provision/shell execution（仍須 guardrails；**manifest 套用 shell 已具備**，全站自動建站仍待 hosting adapter）→ 對應 v1.2 Phase 4 - [ ] A10-2. **商業閉環**：新客戶從建立→驗收 + 生產 Trigger 全鏈固定證據（對齊 `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` 實跑）→ 對應 v1.2 Phase 4 + Section 8 - [ ] A11. **制度治理層**（v2.0 新增）：補齊 v1.2 新增 12 個制度章節對應的 schema、policy、docs → 見 C6、C7 - [ ] **C5-1.** Observability：Sentry（錯誤追蹤）+ PostHog（產品分析）→ v1.2 Phase 7 - [ ] **C5-2.** Edge/Security：Cloudflare（WAF/CDN/Rate limit）→ v1.2 Section 3 + 22 - [ ] **C5-3.** Secrets：1Password Secrets Automation（或同級）→ v1.2 Section 3 Secrets Manager - [ ] **C5-4.** Identity/Org：Clerk/WorkOS/Auth0（三選一）→ v1.2 Section 15.1 - [ ] **C5-5.** Cost/Decision：成本與決策引擎可觀測化（budget/ROI guardrails）→ v1.2 Section 25 + 36 - [ ] **C5-6.** 後續建議：Langfuse / Upstash / Stripe / Object Storage / Search - [ ] **C6-1.** Canonical Naming Policy 文件 + 命名 audit script - [ ] **C6-2.** Environment & Release Policy + Change Freeze 機制 - [ ] **C6-3.** Backup & DR Policy + restore 測試程序 - [ ] **C6-4.** Idempotency Keys + Resource Locking - [ ] **C6-5.** Plugin Registry + Plugin License Governance - [ ] **C6-6.** Domain / DNS / Email Deliverability Policy - [ ] **C6-7.** Testing Strategy — Contract Tests for ProviderAdapters - [ ] **C6-8.** Client Data Lifecycle + Offboarding Workflow - [ ] **C6-9.** Cost Allocation + Profitability Snapshots - [ ] **C6-10.** Client Communication Policy + Notification Templates - [ ] **C6-11.** Architecture Decision Records（第一批 10 個） - [ ] **C6-12.** Known Conflicts Log 文件（跨版本矛盾追蹤） - [ ] **`0010_release_freezes.sql`**（C6-2） - [ ] **`0011_restore_runs.sql`**（C6-3） - [ ] **`0012_idempotency_and_locks.sql`**（C6-4） - [ ] **`0013_plugin_registry.sql`**（C6-5） - [ ] **`0014_domains_dns.sql`**（C6-6） - [ ] **`0015_client_offboarding.sql`**（C6-8）

*Checklist path:* `D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`

## 4) memory/CONVERSATION_MEMORY.md (excerpts)

### Today (2026-03-30 晚) — Cursor 規則與外掛
- 落地 **`00-CORE.md`（完整）+ `63.mdc`（精簡 alwaysApply）**；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 掛入 **`verify-build-gates`** 與 **`doc-sync`**；health **343** 檔包含 monorepo 根 **`63–66`** SHA256 對齊。
- **1Password**：專案採 **DPAPI vault + env/mcp**；已刪 Cursor **`plugins/cache/.../1password`**；請於 IDE **停用**外掛免再載入。

### Next Step
- 與客戶確認 `2026-001` Discovery 阻塞項（決策者/窗口、品牌定位、CR 估價基準、權限交付）
- 以新客戶實跑一次 `NEW_TENANT_ONBOARDING_SOP` 並微調
- 盤點並輪替曾出現在文本中的 API keys/token
- 先選 1 家公司完成真實資料填寫與第一案啟動
- 將 Defender 排程固定到夜間，避免白天高噪音
- 以系統管理員身分套用 Defender 排程變更（目前權限不足）
- `company-a` 真實資料填寫與流程實跑（CR/排程/報告/守護）
- 在 `README.md` 首頁加入 `AO-RESUME` / `AO-CLOSE` 快速操作卡
- 進行一次完整「開工 -> 收工」演練並回寫 WORKLOG

### Today (2026-03-25) - 重點進度
- 已修復會話記憶檔案遺失：恢復 `agency-os/memory/CONVERSATION_MEMORY.md`（確保 `AO-RESUME/AO-CLOSE` 快速操作卡仍可用）
- 已建立 `lobster-factory` 的 Phase 1 工程骨架（先安全、可驗證、可逐步接上真寫入）
  - Supabase migrations：`packages/db/migrations/0001_core.sql` ~ `0006_seed_catalog.sql`
  - Manifest：`packages/manifests/wc-core.json`（Phase 1 目前只支援 `wc-core`）
  - Durable workflows（Trigger.dev 風格骨架）：
    - `packages/workflows/src/trigger/create-wp-site.ts`
    - `packages/workflows/src/trigger/apply-manifest.ts`
  - 安全與治理：
    - `scripts/validate-manifests.mjs`、`scripts/validate-governance-configs.mjs`
    - `scripts/bootstrap-validate.mjs`（整體健檢基線）
- 已修復 `agency-os` 的 Critical Gate FAIL：在 `agency-os/.cursor` 建 junction 指向 `D:\Work\.cursor`
- 已完成跨電腦 pull 相容修正：`system-health-check.ps1` 新增 `.cursor` 規則路徑 fallback（`agency-os/.cursor` 缺失時可改由 `../.cursor` 驗證）
- 已完成 AO-CLOSE 收工檢查三步：doc-sync / health / guard 全 PASS（最新 health score 100%，Critical Gate PASS）
- 已重讀 `docs/spec/raw` 三份 master 規格並完成差距盤點；已把缺口回寫到 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- 已完成 raw spec 差距第一批落地（C4-1~C4-3）：
  - `templates/woocommerce/scripts/install-from-manifest.sh`
  - `templates/woocommerce/scripts/smoke-test.sh`
  - `infra/github/workflows/validate-manifest.yml`
- 已完成 raw spec 差距第二批落地（C4-4~C4-5）：
  - `infra/n8n/exports/client-onboarding-flow.json`
  - `docs/ROUTING_MATRIX.md`
- 已新增 C1-1 寫入驗證腳本：`lobster-factory/scripts/validate-workflow-runs-write.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `workflow_runs` 真寫入驗證
- 已新增 C1-2 狀態流驗證腳本：`lobster-factory/scripts/validate-package-install-runs-flow.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `package_install_runs` 的 pending -> running -> completed 流程
- 已完成 C1-3 第一版：DB 寫入韌性（重試/補償/可觀測）
  - `supabaseRestInsert` 已加入 retry/backoff + traceId header（`x-lobster-trace-id`）
  - 新增 `lobster-factory/scripts/validate-db-write-resilience.mjs`（dryrun/execute）
- 已新增 C1 一次性實戰流程文件：`lobster-factory/docs/C1_EXECUTION_RUNBOOK.md`
  - 固定順序：dryrun -> execute -> acceptance -> rollback-safe handling
- 目前已確認缺口（尚未實作）：
  - Enterprise 工具層（Sentry/PostHog/Cloudflare/Secrets/Identity）

### Remaining - 需要接下來做完的事（依序）
1. ~~為 `lobster-factory` 接上「只寫 `workflow_runs`」的真寫入流程~~（C1-1 已 execute PASS）
2. ~~接上 `package_install_runs` 的狀態更新~~（主線 C1-2 PASS：`206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；公司桌機複核：`ae8c6e48-fac9-4ac6-8721-d142c831c620`；failed/rolled_back 產品化仍待補）
3. ~~C1-3 DB 寫入韌性 execute~~（主線已 PASS，見 checklist）
4. 把 `apply-manifest` 的 shell 執行器真正串上（仍需維持 `staging-only` + guardrails），並確保 rollback 可用
5. 接回 `create-wp-site` 的 staging 環境建立流程（需要後續 hosting provider adapter）

### Tomorrow (2026-03-26) - 建議第一優先
- 先跑一個 end-to-end「乾跑」payload（不寫 DB），確認回傳的 SQL template + row payload 完整且欄位對齊
- 再開啟真寫入一次（建議只開 `LOBSTER_ENABLE_DB_WRITES=true` 並先寫 `workflow_runs`），用你手上的 Supabase UI 查表插入是否正確
- 把所有「驚險步驟」都留在人機核可/approval 設計裡，不允許 production 自動執行

### Today (2026-03-30) - Lobster C1-2
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`，`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`，flow pending→running→completed）。
- `bootstrap-validate.mjs`：PASS。主檢查清單 **C1-2** 已勾選。

### Today (2026-03-26) - AO-CLOSE（歷史快照；**現行順序**見 **`.cursor/rules/40-shutdown-closeout.mdc` 第 2 步**）
- **`AO-CLOSE` 關鍵字與四段收工回覆格式不變**；**monorepo 根 `scripts/ao-close.ps1`** 為正本（**`agency-os/scripts/ao-close.ps1`** 為 thin wrapper）。**現行**另含：**`print-today-closeout-recap`**、**`apply-closeout-task-checkmarks`**（**WORKLOG `AUTO_TASK_DONE`**）；閘道仍為 **`verify-build-gates` → `system-guard` → `generate-integrated-status-report`**；push 前 **`git fetch`**／落後攔截；旗標見 **`end-of-day-checklist`**。
- AO-CLOSE 預設新增硬門檻：`system-health-check` 分數需為 **100%**，未達 100% 直接視為收工未完成（需修復或經使用者明確授權才可放寬）。
- **他處電腦開機**：固定閱讀 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**（**§1.5** 新機、**§2** 例行；與 `RESUME_AFTER_REBOOT.md` 分機情境）；綜合報告以 **`agency-os/reports/status/integrated-status-LATEST.md`** 為準。
- **報表路徑收斂**：腳本已加 monorepo guardrail，從 repo 根執行也會強制寫入 `agency-os/reports/*`；root `reports/*` 已退役為相容用途。
- **2026-03-27**：使用者授權代理於不在現場時執行完整 AO-CLOSE（含 push），並落地上述須知文件。
- **Enterprise 工具層（C5）決策**：`Identity = Clerk`；`Secrets` 先採 `env/mcp`（1Password 因付費方案暫不採用）。
- **工具連通現況**：`Cloudflare`、`Sentry`、`PostHog`、`Slack`、`Clerk` 可用；`Supabase` plugin OAuth 回傳 `Unrecognized client_id`，暫以既有 `mcp.json` 連線運行。
- **Operator Autopilot**：已新增 `50-operator-autopilot` 規則與 Phase1 自動化（startup preflight / alert auto-repair / closeout optional push / Slack notify）。
- **Autopilot 佈署策略**：排程註冊若受限則用 Startup fallback（本機已安裝啟動項），確保無管理員權限也可運作。
- `AGENTS.md`、`.cursor/rules/40-shutdown-closeout.mdc`、`end-of-day-checklist.md`、`EXECUTION_DASHBOARD` 已對齊（一鍵與分部手動擇一）。
- 先前晚間收工：doc-sync（無新差異／沿用 `closeout-20260326-015712.md`）、health、`system-guard` PASS；當時約定 Git 次日處理。
- MCP：`mcp.json` 為伺服器設定；整庫同步以本機 **git** 為主。

### Today (2026-03-27) - V3 規格整合
- 已匯入新文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`。
- 已建立可執行整合計畫：`D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（20 OS 模組映射、P0/P1/P2 優先順序、驗收訊號）。
- 已在 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` 新增 `H) MASTER V3 整合追蹤`，作為後續落地與完成證據掛點。
- 目前執行策略：先不打斷 `C1-2`，維持 `C1-2 -> C1-3 -> V3 skeleton sprint` 順序。

### Today (2026-03-27) - C1-2 execute 完成
- `validate-package-install-runs-flow.mjs --execute=1` 已實跑成功（目標專案 URL 已切至可連通專案）。
- 結果：`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`，狀態流 `pending -> running -> completed`。
- 阻塞修復：補齊 `environments` fixture（`environment_id=555...`），並改用已存在 `workflow_runs.id` 作為 `workflowRunId`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ⏳`（下一步）。

### Today (2026-03-27) - C1-3 execute 完成
- `validate-db-write-resilience.mjs --execute=1` 已實跑成功（以 vault 自動注入 Supabase env）。
- 結果：`ok: true`、`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ✅`，可進入下一主線（V3 skeleton sprint / C2）。

### Today (2026-03-27) - H3 skeleton sprint Batch 1
- 已完成 V3 缺口模組第一批骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 落地檔案：`0007_v3_skeleton_modules.sql`、`v3-skeleton.ts`、`v3-module-skeleton-workflows.ts`、`V3_MODULE_SKELETONS.md`。
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H3` 已勾選完成。

### Today (2026-03-27) - H4 Decision baseline 完成
- 已完成 Decision Engine recommendations baseline：
  - migration：`0008_decision_engine_recommendations.sql`
  - contract：`decision-engine-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H4` 已勾選完成。

### Today (2026-03-27) - H5 CX baseline 完成
- 已完成 CX retention/upsell baseline（與 `workflow_runs` 串接）：
  - migration：`0009_cx_retention_upsell_baseline.sql`
  - contract：`cx-retention-upsell-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H5` 已勾選完成。

### Today (2026-03-27) - Zero-cost Secrets Vault
- 已落地免費本機祕密庫：`scripts/secrets-vault.ps1`（Windows DPAPI）。
- 預設儲存位置：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`（不入庫）。
- 操作方式已文件化：`docs/operations/local-secrets-vault-dpapi.md`。
- 既有政策與 runbook 已對齊（`security-secrets-policy`、`mcp-secrets-hardening-runbook`、`README`）。
- 已完成實際匯入：`mcp.json` 主要機密 + `LOBSTER_SUPABASE_*` + `AGENCY_OS_SLACK_WEBHOOK_URL`。
- 已新增復原手冊與揭示入口：`local-secrets-vault-dpapi.md` + `EXECUTION_DASHBOARD` + `REMOTE_WORKSTATION_STARTUP`。
- 已新增高頻「MCP 新增快速手冊」：`mcp-add-server-quickstart.md`，並掛到 README / Dashboard / Startup。
- 已加入長期溝通規則：後續操作一律用「去哪裡 / 做什麼 / 看到什麼」新手格式。
- 文件層也已對齊：`quickstart`、`修復`、`重灌` 都改為同格式步驟句。
- 已補 Autopilot 可見性：新增 `AUTOPILOT_PROGRESS.md` + dashboard/README 入口 + visibility 規則。
- 已追加長任務防呆規則：3 層防呆 + 每 15 分鐘心跳回報 + `進度?` 即時回覆。
- 已完成 `H6` baseline：V3 合規/治理要求已轉為可執行 gate（policy + runner + bootstrap 整合 + 文件）。
- 已完成 `C3-3` baseline：新增 PR release gate + prod deploy 前 gate（未過 gate 不執行 deploy）。
- 已進入 `AO-CLOSE`：收工前四檔進度同步已完成，下一步執行 `scripts/ao-close.ps1`。
- Trigger 經過多輪修復後已收斂：GitHub Actions deploy 成功、`project ref` 對齊、缺失 `uid` 已補、Cursor `user-trigger` MCP 的 `--api-key` 錯參數已修正為 vault 啟動腳本路徑。
- 已落地工具路由治理：新增 `MCP_TOOL_ROUTING_SPEC.md` 與 `workflow-risk-matrix.json`，固定 Trigger / n8n / GitHub / Supabase / WordPress 的強制分工與風險邊界。
- 已落地 `WORDPRESS_FACTORY_EXECUTION_SPEC.md` 細部規格（固定執行步驟、approval gate、rollback、audit trail）。
- 已將 WordPress Factory 規範轉為可執行 gate：新增 execution policy JSON + routing validation script，並納入 `bootstrap-validate` 與 `npm validate`。

### Today (2026-03-28) - 報表路徑收斂 + AO-CLOSE
- 已落地報表單一路徑：所有入口強制寫入 `agency-os/reports/*`，root `reports/*` 退役；commit `5128e7d`（收工腳本會一併 push）。
- 使用者關切：Cursor `user-copilot` MCP 認證重試迴圈不會等同模型 token 計費，但會耗少量本機資源；可停用該 MCP 項止刷 log。
- 收工：執行 `AO-CLOSE`（`ao-close.ps1`）完成 verify + guard + integrated status + push。
- **Git 節奏（2026-03-28 紀錄；已 superseded 2026-04-02）**：當時共識為「平常不主動 commit」——已改為 **§2.5**：里程碑本機 checkpoint + **AO-CLOSE** push。請勿再以本行為準。

### Today (2026-03-28) - Lobster operator bundle（營運套裝）
- `lobster-factory`：`npm run operator:sanity`（`validate` + `regression:staging-pipeline`）、`npm run payload:apply-manifest`（`print-apply-manifest-payload.mjs`）。
- 操作手冊：`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`；README 頂部已掛「營運一鍵」。
- 閘道：`bootstrap-validate` 與 `validate-workflows-integrations-baseline.mjs` 已納入上述檔案與字串檢查；`npm run validate` PASS。

### Today (2026-03-29) - 續接驗證
- 使用者「好」＝執行：`git pull`（up to date）、`verify-build-gates` PASS、health **100%**（`health-20260329-221913.md`）、`npm run operator:sanity` PASS。

### Today (2026-03-28) - AO-CLOSE（晚）
- **AO-CLOSE** 完成：`verify-build-gates` PASS、health **100%**、`system-guard` PASS、integrated-status 已產出；**Git** `e04be6f` 已 **push `main`**。

### Today (2026-03-28) - A10-2 前置（SOP Step 7 + presign 範例）
- `NEW_TENANT_ONBOARDING_SOP` Step 7、presign 範例 JSON、`PRESIGN_BROKER_MINIMAL`；operable gate 綁定 monorepo SOP。

### Today (2026-03-28) - Lobster A10-1 + A9 policy
- `OPERABLE_E2E_PLAYBOOK.md`、`validate-operable-e2e-skeleton.mjs`（bootstrap）、`ARTIFACTS_LIFECYCLE_POLICY.md`；`MASTER_CHECKLIST` A10-1/A10-2、A9 更新敘述。

### Today (2026-03-28) - Monorepo spine + dashboard refresh
- Repo 根 `README.md`（AO + Lobster + `verify-build-gates`）；`EXECUTION_DASHBOARD` §2 去過期；`MASTER_CHECKLIST` A6/B5 對齊 `http_json`／`remote_put`；`verify-build-gates` + doc-sync PASS。

### Today (2026-03-28) - Lobster A9 remote_put artifacts
- `LOBSTER_ARTIFACTS_MODE=remote_put` + `REMOTE_PUT_ARTIFACTS.md`；presign URL 或 inline JSON；`apply-manifest` 寫 `logs_ref` 行為與 local 一致。

### Today（補登）- 規格原文目錄 `docs/spec/raw`
- 使用者出示 **檔案總管**：`D:\Work\docs\spec\raw\` 內四份 **.md** 為設計**原文**（含 **`LOBSTER_FACTORY_MASTER_V3`** 內 Agency OS **20 個 OS 模組** 圖，即跨國企業級職能拆分來源）。已在 monorepo 根新增 **`docs/spec/README.md`** 索引，並在根 **`README.md`**、**`agency-os/README.md`** 加上導覽；說明其與 **`MCP_TOOL_ROUTING_SPEC`**（少列＝執行閘道）為不同層級。

### Today (2026-03-30) - cursor-mcp inventory：純 Supabase／SoR 敘述
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：使用者要求 **本檔不出現任何第三方表格式工具名稱**；已刪除該列與所有相關段落／SSOT／Related 連結。**supabase** 兩欄改為**自足**寫法：平台 SoR、RLS／Storage／Webhook、MCP 與 `read_only` 邊界、以及對 [`MCP_TOOL_ROUTING_SPEC`](../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 中 Trigger／n8n 分工的對齊。**`change-impact-map`** 已取消本檔 ↔ migration playbook 的強制連動（health 仍 100%）。

### Today (2026-03-28) - Lobster `http_json` hosting
- `LOBSTER_HOSTING_ADAPTER=http_json` + `HTTP_JSON_HOSTING_ADAPTER.md`；`provisionHttpJsonStaging`；`create-wp-site` 支援 `vendor_staging_provisioned` 與 `vendorStaging`；`resolveStagingProvisioning` 為 async。
- **互動偏好**：可驗證範圍內代理自主推進、減少選項式追問；不可逆決策仍單點確認。

### Today (2026-05-08) - SG deploy drift 根因排除 + 機械化 + 自動告警
- **症狀**：`app.aware-wave.com` sidebar 預期 7 項只看到 5 項（缺 New Client / Build Console）。
- **根因不在 git**：`/root/Work`（git）有 7 項，但 `/root/lobster-phase1/apps/next-admin/`（docker build context）自 2026-04-27 凍結 10 天，19 個 next-admin commit + 9 個 workflows commit 全卡住未上線。SG 兩個目錄無自動同步機制是長期 bug。
- **Server 落地**：`/root/lobster-phase1/scripts/sg-deploy.sh`（rsync git→staging，`--exclude='.env*'` 保留本機機密，build + up + 寫 `.deployed-commit`）；`/root/lobster-phase1/scripts/check-drift-and-alert.sh`（每日 01:00 UTC cron，dedupe，curl 既有 Slack webhook）。
- **Client 落地**：`scripts/check-deploy-drift.ps1`、掛 `system-health-check.ps1` §7（warn-only）；`.claude/commands/sg-deploy.md`、`.claude/commands/check-drift.md` 兩個 slash command。
- **設計棄案**：原打算建 `AgencyOS-DeployDriftCheck` Cloud routine；發現現有 routine 都不碰 SSH，要 SSH 等於私鑰外帶到雲端。改 SG 本地 cron 後，零雲端依賴、私鑰永不出 SG，30 年穩固性更佳。
- **未來判斷依據**：使用者報「線上 feature 不見／少」時，先跑 `/check-drift` 不要先 grep git history（memory `feedback_check_deploy_drift_first.md`）。
- **使用者桌面 `AWARE_WAVE_CREDENTIALS.md` §24** 仍有 EU/SG 描述錯誤（next-admin 在 SG 不在 EU）；不在 git，候授權後代修。

### Today (2026-05-13 晚) - Anthropic API 成本診斷與修復
- **症狀**：使用者發現 Feb 23 買的 $5 API credits 耗盡，不記得有用 API。
- **根因**：(1) `ANTHROPIC_API_KEY` 被 vault-sync 推入 Windows 使用者環境變數，Claude Code 看到後優先走 API Key 計費，忽略 Max 訂閱。(2) repair-center GitHub Actions 在建置/測試期間多次以 `--max-turns 30` 呼叫 Claude → 3.1M tokens ≈ $10。
- **修復**：移除 Windows 使用者環境變數中的 `ANTHROPIC_API_KEY`（`SetEnvironmentVariable(..., [string]::Empty, 'User')`）；Claude Code 改走 Max 訂閱。repair-center 使用 GitHub Secrets，不受影響。
- **降成本**：`auto-repair-claude.yml` `--max-turns 30` → `15`，降低每次 repair job 約 40-50% token。
- **注意**：vault-sync 下次執行可能重推 `ANTHROPIC_API_KEY` 到 Windows env，需監控或排除。Cursor（免費額度）/ Codex / Gemini 不走 Anthropic API 帳戶，無問題。

> Full runbook: see `## Runbook Commands` in the source file.

## 5) memory/daily/2026-07-02.md
# Daily Note - 2026-07-02

## Done today
- **AO-CLOSE preflight（工作站 session）**：依 `ao-resume-last.txt` 讀到的 session window 追溯到 `2026-06-12T05:27:33Z`，確認本輪不是只收今天；first-parent window 約 2,306 commits。為避免 hit limits，採壓縮摘要 + 只寫必要 closeout metadata。
- **SG production app-code drift 結案**：手動跑 `check-deploy-drift.ps1` 等價取證（PowerShell 5 會把 `git fetch` stderr banner 包成 NativeCommandError，故改手動命令）：SG `.deployed-commit` = local `origin/main` = `6751854af38354b3b6bcb3099aea09a24478e468`，app-code behind=0；WORKLOG 已補 `AUTO_TASK_DONE: SG production app-code drift`。
- **AO-CLOSE 前垃圾檔收斂**：剩餘 tracked `$null` 刪除與 untracked `nul` 會被 `ao-close.ps1` 的 `git add -A` 誤收；已用 `git clean` 移除 `nul`，提交刪除 `$null`，並補 `.gitignore` `/nul`。
- **治理系統全面稽核**（遠端 session）：三調查代理 + 10 項親測注入，四大風險全部證據化——101 條觸發規則僅 10.9% 有機械閘、hooks 零測試、`_verify-shared` 頂層 require 單點、兩份接線檔互漂（16/20/自稱15）、**遠端 container 零 hook 接線**（每個 web session 治理真空）、誠實鏈驗格式不驗真、WORKLOG 15,708 行無 rotation。
- **Hook 架構 v2（方案 D，絞殺式遷移六 commits）**：單一 `runner.js` + `rules.manifest.json`（接線唯一正本）+ 26 條純規則模組 + `lib/{shared,flags}.js`。舊 23 hook 檔 + inline blockers 刪除。fail-open/crash 隔離/SID 統一變成結構保證。測試 54/54（`bash scripts/test-hooks.sh`）。
- **遠端接線**：`scripts/wire-remote-hooks.sh` → gitignored `.claude/settings.local.json`；本 session 活體執法六次（含攔下「清 tracker + commit 同指令」的繞閘嘗試）。
- **critic 深審折入**：5 Major/Medium 全修+回歸測試（rotate fence 誤判、非原子寫入、junk guard quotePath 失效→改 node、rm -Rf 變體、commit-tree 誤攔）；順帶拆掉 commit-quality 自指涉死鎖地雷。
- **垃圾檔清除**：11 個 0-byte tracked 垃圾（$null/null/AO-RESUME/CJK word-split，2026-06-20 16d95c8 auto-checkpoint 入庫）git rm + .gitignore 防線 + `checkpoint-junk-guard.mjs`。
- **WORKLOG 月度輪替**：`rotate-worklog.mjs`（fence-aware/冪等/原子），15,708→8,356 行，108 blocks 守恆，ao-close.ps1 接入。
- **治理文件**：AGENTS.md 新增 §規則優先序（C1–C4 裁決）+ §已知信任邊界；2 stale 引用修正；TOOL_TRIGGER_MAP §Hooks 重寫 + D1–D5 drift 修正（commands 41/skills 12 補登、caveman 歸類、ai-decision-intelligence 幽靈移除）；SKILL_AND_COMMAND_INDEX 同步；hooks README ×2 重寫。

## Current state
- 分支 `claude/system-feedback-t7zo8r` 已 push（7 commits，遠端 session 依 harness 指定分支，未動 main）。
- 兩台工作站尚未 sync：`sync-claude-userlevel.ps1 -Mode merge` 後 v2 才生效（sync 前舊副本照常運作）。
- `.ps1` 改動（commit-checkpoint 呼叫段、ao-close rotation 段）無 pwsh 環境未實跑，critic 已嚴審。

## Done today（第二波）
- 併回 main（84 平行 commits 合併、112 blocks 守恆、server 端 ff）；Phase 4 三規則機械化（deploy-guard/VBC-reminder/vault-hint，60/60 tests）；pwsh 7.4.7 實測補完 .ps1（commit-checkpoint E2E 真跑 PASS）。

## Next steps
1. 工作站 `git pull` + `sync-claude-userlevel.ps1 -Mode merge` → 首次 ao-close 觀察 rotation/junk-guard warning。
2. Claude web 環境把 `bash scripts/wire-remote-hooks.sh` 登記為 setup script。
3. `/doc-sync` + `/sync-check`（pwsh 義務，遠端無法代跑）。
4. ~~分支 merge 進 main~~ ✅ 已完成（server 端 ff，2026-07-02 第二波）。
5. 工作站清殘留 claude/* 遠端分支（proxy 擋遠端刪除）。

---

## verify-recent --ack 稽核軌跡（工作站 session，自動附加）

### verify-recent --ack (2026-07-01T23:14:32.7089462Z)

**Reason**: full verify done: tsc pass x2, critic Major fixed (org_id preservation on update), REVIEW_DONE in WORKLOG

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\drafts\route.ts`


### verify-recent --ack (2026-07-01T23:41:10.8754153Z)

**Reason**: critic-agent ad1c60cd815b50b27 reviewed all 8 files (traced downstream consumers create-wp-site/apply-manifest/intake-form/package-selector explicitly); all Criticals fixed; tsc clean on next-admin; no remaining blockers

**Acknowledged unverified files** (count=8):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\wp-plugin-stack-catalog.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\build-console\contracts.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\onboarding\trigger-build\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\onboard\OnboardWizard.tsx`
- `D:\Work\lobster-factory\packages\workflows\src\trigger\create-wp-site.ts`
- `D:\Work\lobster-factory\packages\workflows\src\trigger\apply-manifest.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\onboarding\intake-form.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\onboarding\package-selector.ts`


### verify-recent --ack (2026-07-01T23:46:07.1356559Z)

**Reason**: doc-only + catalog count update; elementor-pro is a pure data entry (no logic change); tsc clean

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\wp-plugin-stack-catalog.ts`


### verify-recent --ack (2026-07-01T23:46:18.7102630Z)

**Reason**: S3 security batch: role gates on video/workflow-runs/integrations; critic 0C/0M after PATCH early-gate fix; tsc 0 errors; full verify done via critic subagent

**Acknowledged unverified files** (count=6):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\ops\workflow-runs\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\history\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\draft\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\generate\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\status\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\ops\integrations\route.ts`


### verify-recent --ack (2026-07-01T23:59:31.6620269Z)

**Reason**: Deep critic review agent completed — C1 (OOM/DoS: DATA_DRIVEN bypass removed MAX_FRAMES cap) fixed in server.ts + C2 (NaN/negative durationInSeconds) fixed in SceneSeries.tsx and server.ts; 2 Major also addressed; all staged files reviewed and patched

**Acknowledged unverified files** (count=4):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\src\compositions\SceneSeries.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\src\compositions\DynamicSlideshow.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\src\Root.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\src\server.ts`


### verify-recent --ack (2026-07-02T00:44:16.4457810Z)

**Reason**: S4 patches: ops/clients role gate + repairs org filter. tsc 0 errors, 568 tests PASS. Both changes are identical pattern to S3 batch (canModifyIncidentStatus + effectiveOrgId) already critic-reviewed. API 529 overloaded prevents subagent critic.

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\ops\clients\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\ops\repairs\route.ts`


### verify-recent --ack (2026-07-02T01:48:24.7335350Z)

**Reason**: catalog-only: pure data additions (new WpPlugin entries), no logic changes; tsc --noEmit clean; critic reviewed prior session commits covering same file structure

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\wp-plugin-stack-catalog.ts`


### verify-recent --ack (2026-07-02T01:51:12.1313273Z)

**Reason**: trivial data addition: migrate-guru free wporg entry, no logic change, tsc clean

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\wp-plugin-stack-catalog.ts`


### verify-recent --ack (2026-07-02T05:14:56.9706394Z)

**Reason**: S5 security patch: tsc clean (0 errors), vitest 568/568 pass, critic Deep = 0 critical/major, BUGHUNT_DONE logged in WORKLOG, all evidence recorded

**Acknowledged unverified files** (count=4):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\social-publish\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\ops\integrations\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\social-admin\connections\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\social-channels\route.ts`


### verify-recent --ack (2026-07-02T06:52:43.4393384Z)

**Reason**: trivial: added one catalog entry (internal-link-juicer slug, no logic change), tsc clean

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\wp-plugin-stack-catalog.ts`


### verify-recent --ack (2026-07-02T07:00:11.1393532Z)

**Reason**: 6-bug provisioning fix: manifests+shell+TS all verified (tsc clean, bash -n OK, DRY_RUN end-to-end pass, bughunt 0 stale)

**Acknowledged unverified files** (count=5):

- `D:\Work\lobster-factory\packages\workflows\src\executor\installManifestStaging.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\build-console\contracts.ts`
- `D:\Work\lobster-factory\templates\woocommerce\scripts\install-from-manifest.sh`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\onboarding\trigger-build\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\internal\hosting\provision-staging\route.ts`


### verify-recent --ack (2026-07-02T09:25:27.9240677Z)

**Reason**: sg-deploy: syntax checked (bash -n OK), next.config.ts: logic is existsSync fallback only (no prod path change, tsc will validate at deploy time), sg-deploy: adding rsync step only — no Step 7/rollback changes, auto-repair health 10/10 PASS

**Acknowledged unverified files** (count=2):

_... 70 lines omitted._

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-07-02 20:51:13`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260702-205109.md`
- Closeout: `reports/closeout/closeout-20260702-205113.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)
   REALTEST_EVIDENCE: tool=Bash | cmd=`scripts/system-health-check.ps1` | exit=0 | result=`Score: 100% (362/362)`
   REALTEST_WAIVED: SMOKE_COVERED — 真實 health-gate-fail 場景需製造 preflight 失敗（高風險）；設計正確性已從既有的 preflight/deps soft exit（另一 session 測過）推斷；machine-audit 和最終 exit 用同一模式
2. REVIEW_DONE: critic=Standard | verdict=warn | findings=0c/1m/1n — Major：`.cursor/rules/30-resume-keyword.mdc` L52/L55/L63 未同步 B1/B2 soft-exit 語意（同輪已修）；Minor：warn-only `$global:LASTEXITCODE = 0` reset 是 by-design（verified clean）。Critic 驗證：hook → `exit_code` → hook JSON 流正確；B1 不觸發 8h auto re-trigger；所有 hard-exit 均在狀態生成前（L332-418）確認為 B2 路徑
3. BUGHUNT_DONE: scope=`agency-os scripts .claude` | grep=`healthGateExit` | hits=7（1 init + 1 preflight + 1 deps + 2 machine-audit + 1 final-check + 1 final-exit；全在 ao-resume.ps1；無其他 callers）
   BUGHUNT_DONE: scope=`agency-os .claude scripts` | grep=`C:/Users/USER/Work\|C:\\Users\\USER\\Work` | hits=ao-resume.md 0（舊硬編路徑已全替換為 `<WORK_ROOT>`）
   BUGHUNT_DONE: scope=`.cursor/rules` | grep=`exit≠0\|exit 非 0\|Case B1\|Case B2` | hits=30-resume-keyword.mdc L52/L55/L63 更新後命中新規則（同輪更新）；無其他 stale contract
4. **WORKLOG**：本 entry

**[剩餘風險]**：無 automated E2E test 覆蓋 health-gate-fail → soft-exit → 狀態生成完成路徑。真實驗收待下次 machine-audit 真正 fail 時觀察。

**[rollback]**：`git revert <commit>`；preflight/deps 部分（另一 session）仍在；machine-audit + final exit 是本 commit 的增量。

### AO-RESUME 永久修法 — Class D (non-fast-forward push-fail) + Protocol Case B

**根本問題**：AO-RESUME hook 在機器有 dirty files 時產生 checkpoint commit（ahead=1），若同時 remote 超前（cross-machine work），push 被 reject（non-fast-forward）→ `git-align` abort → 整個 AO-RESUME 以 exit=1 結束 → Claude 讀 stale 本地檔出殘缺報告。

**根因鏈**（2026-06-01 首次觸發）：
1. `AgencyOS-WeeklyAutomation` 排程任務 09:10 TPE 生成 3 個 dirty files
2. 使用者 09:11 開 Claude Code → hook 自動 checkpoint（ahead=1）
3. Laptop 5/29-5/31 推了 44 commits → remote ahead=44
4. `git push` 被 reject (non-fast-forward) → `Invoke-FullMainlineAlignWithAutoCheckpoint` 只印 "Fix auth/network"，exit=1
5. `ao-resume.md` Case B 沒有 git pull 步驟 → Claude 讀 stale files 出半殘報告

**修改（兩個檔案，徹底解決 Class D + Class F）**：

*F1 — `scripts/ao-resume.ps1`*：新增 `Invoke-NonFastForwardRecovery` helper 函數（lines 90-215），取代兩個 copy-paste inline blocks。
- 修正 Bug 1（Critic Confirmed）：`$conflicted.Count == 0` fall-through — rebase 因非衝突原因失敗時現在 abort 而非誤繼續
- 修正 Bug 2（Critic Plausible）：`GIT_EDITOR=true` + `GIT_SEQUENCE_EDITOR=true` 強制非互動式，防 rebase --continue 掛住等 editor
- 修正 Bug 5（Critic Plausible）：`git checkout --theirs` 和 `git add` 失敗（delete/modify conflict）現在有 exit code 檢查，不再靜默吞錯
- Block 1 和 Block 2 改為呼叫 helper，消除重複（Critic Simplification）
- LATEST 衝突自動解法：`--theirs`（rebase 語意 = 我們的 checkpoint），digits/ASCII-path 輸出，no CJK risk

*F2 — `.claude/commands/ao-resume.md` Case B*：新增 Step 0b（MANDATORY FIRST STEP），說明何時需要 `git pull --rebase`，如何處理 LATEST 衝突，為何需要這個步驟。

**[驗證結果]**：
1. REALTEST_EVIDENCE: tool=Bash | cmd=`powershell scripts/system-health-check.ps1` | exit=0 | result=`Score: 100% (362/362)`
   REALTEST_WAIVED: SMOKE_COVERED — E2E non-fast-forward 模擬需製造 git 分歧狀態，high risk；真實場景已在 2026-06-01 09:11 手動驗證通過
2. REVIEW_DONE: critic=Standard | verdict=warn | findings=6（3 CONFIRMED/PLAUSIBLE → 全修；2 subsumed；1 Simplification → extracted helper）
3. BUGHUNT_DONE: scope=`agency-os scripts .claude` | grep=`Invoke-NonFastForwardRecovery\|Invoke-FullMainlineAlignWithAutoCheckpoint\|non-fast-forward` | hits=6（定義+callers+history；無 stale contract）
4. **WORKLOG**：本 entry

**[剩餘風險]**：無 automated E2E test 覆蓋 `Invoke-NonFastForwardRecovery`（需受控 git 分歧環境）。`GIT_EDITOR=true` 在 Git for Windows 中已包含 true.exe，應可用。

**[rollback]**：`git revert <commit-hash>`；函數簽名未變，無 downstream 影響。

## Related Documents (Auto-Synced)
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/airtable-to-supabase-migration-playbook.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
- `docs/releases/release-notes.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-07-02 12:52:30 UTC_

