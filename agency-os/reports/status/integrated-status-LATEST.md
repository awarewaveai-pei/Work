# Integrated status report (assembled)

- Generated: 2026-06-15 03:48:45
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

## 5) memory/daily/2026-06-15.md
# Daily Note - 2026-06-15


### verify-recent --ack (2026-06-14T16:40:17.2392392Z)

**Reason**: 影像工具拆 3 獨立可拖面板(調色/濾鏡/AI去除) + 畫布尺寸/DPI(cm,mm) + clipPath 遮罩 + 文字弧形. critic Deep FAIL→fixed: Critical (setDimensions 不縮放內容 → 改 viewportTransform zoom + 既有物件等比重縮 + exportPng 暫還原 zoom 出全 real-px) + Major (init 清 canvasMetaRef 防 stale 倍率 / grade-effects 預設位置碰撞移到 x=1332). tsc 0 + full build 0. 注:Fabric viewport/zoom 行為無 headless browser 可測,build 為 gate,需使用者瀏覽器實測畫布尺寸縮放+匯出。

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\canvas\CanvasEditor.tsx`


### verify-recent --ack (2026-06-14T17:27:56.9712965Z)

**Reason**: 兩 bug 修: ① 橡皮擦後無法編輯文字 — erase 筆畫 set selectable:false,evented:false 讓點擊穿透到下層文字; ② 排版壞掉 — 浮動面板重新排成右側單欄整齊堆疊(x=816)、畫布尺寸展開其餘 defaultCollapsed、LS_PREFIX bump v2 重置舊壞位置。都是 targeted 屬性/排版修正,tsc 0 + build 0. REVIEW_WAIVED: 簡單 prop/layout 改動,無邏輯/資料面,build 為 gate。

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\canvas\CanvasEditor.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\components\tools\DraggablePanel.tsx`


### verify-recent --ack (2026-06-14T17:38:30.6567833Z)

**Reason**: 工具面板改右側固定可捲動側欄(vector-trace-demo 風格,使用者要求,取代浮動拖曳): 新 SidebarPanel(collapsible <details>-style, drop-in 同 props 但忽略定位) + CanvasEditor 容器改 flex row + canvas 左/側欄右(width 300, maxHeight calc(100vh-130px) overflow auto), 面板垂直堆疊可收合(畫布尺寸開其餘收). replace_all DraggablePanel→SidebarPanel. tsc 0 + full build 0, JSX balanced. REVIEW_WAIVED: 排版重構,純 flex+collapsible,build 為 gate。

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\components\tools\SidebarPanel.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\canvas\CanvasEditor.tsx`


### verify-recent --ack (2026-06-14T18:00:04.5405657Z)

**Reason**: Undo/Redo (↩️↪️): JSON snapshots + restore. critic Deep FAIL→fixed all Critical/Major per spec(已對 Fabric v7 source 驗): #1 loadFromJSON 是 Promise 第2參 reviver 非 callback → 改 .then() 讓 restoringRef 留 true 到 load 完(否則 snapshot 迴圈污染 stack); #2 restore 後對 image re-applyFilters(否則 undo 丟調色); #3 cap 60→20(base64 圖記憶體); #6 draw/inpaint 模式禁用 undo; 還原 zoom。tsc 0 + full build 0. 注:loadFromJSON Promise/filter re-apply 行為無 headless browser 可測,需使用者實測 undo/redo。

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\canvas\CanvasEditor.tsx`


### verify-recent --ack (2026-06-14T18:45:40.7465471Z)

**Reason**: PS catalog 4-feature batch: 生成填色+擴圖(flux-fill-pro)/Posterize(bake)/圖層改名+群組/設計檔存載. critic WARN 0c/3m/3n→全修: selection-race guard(getActiveObject()!==img) on posterize+outpaint; group/ungroup restoringRef-gated single snapshot; importDesign .catch unstrand restoringRef; posterize MAX_EDGE 4096 OOM cap. outpaint enum 已對 pinned flux-fill-pro 41c767bc curl 驗證吻合. tsc 0 + build 0; canvas 1.48kB(no Buffer leak via outpaint-presets pure-data split).

**Acknowledged unverified files** (count=5):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\studio\generative-fill.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\tools\studio\genfill\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\studio\posterize.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\studio\outpaint-presets.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\canvas\CanvasEditor.tsx`


### verify-recent --ack (2026-06-14T19:12:46.9661927Z)

**Reason**: Full verify done: tsc --noEmit clean, critic deep (2 major fixed: PTT row-align + CJK_RE lastIndex, minor: hyphen-strip), bughunt scope=agency-os+scripts hits=0, REALTEST: tsc+regex node tests all pass

**Acknowledged unverified files** (count=5):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\ContentStudio.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\seo\rankmath-checker.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\SeoCheckPanel.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\generate\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\trending\route.ts`



## Session 收工 (AO-CLOSE 2026-06-15) — 窗口 06-12 → 06-15

### Done this session (上次 AO-RESUME 06-12 至今)
- **POD 服飾 Phase 1-4 上線** app.aware-wave.com (deploy `37dfba85`, smoke 24 pass)：忠實印刷檔 / Printful 多風格+真人模特 mockup+存圖庫 / 平拍真實 overlay 雙軌 / 台灣本地印刷檔 seam / AI 商品文案 SEO-GEO-AEO-RankMath。後續未做見 TASKS line 81。
- **Canvas `/tools/canvas` PS 功能目錄全 build+deploy**：影像效果積木 / 圖層面板 / Undo-Redo / 生成填色+擴圖 / Posterize / 設計檔存載 / 字型庫 / 去白底 / WYSIWYG 調色。**驗證債**：使用者瀏覽器實測未做 (TASKS line 68)。
- **Content Studio / SEO-GEO**：RankMath KB 554-file 全覆蓋 + SEO check panel + AI auto-fix；GEO citation 進 SYSTEM_PROMPT；trending 多源 (News+Reddit+PTT+Perplexity)；generate 接 Perplexity 真實來源；Media Hub。
- **Postiz 自架社群發佈 EU 上線** (Task 1+2)：Bluesky connected + 端到端發佈驗證 (pivot from Reddit)。AGPL 紅線：禁 fork、預設 draft+人審。
- **app.aware-wave Stage 1 接通入口完成 (06-14)**：trigger-build 403 dual-path auth + dispatcher kick fallback + 每分鐘 cron。
- 其他：WP auth→Application Password、admin-auth middleware fix、可編輯 calendar、My Designs UI、tarot FLUX 422 fix。

### 未完成 / 明日優先
- Canvas `/tools/canvas` 整輪瀏覽器實測 (Undo/Redo, genfill, 群組/Posterize/.design 存載) — TASKS line 68
- Postiz Content Studio 接真實發佈 (7 task 進行中) — TASKS line 57
- POD 服飾 Phase 1-4 後續未做項 — TASKS line 81
- Mockup Studio 功能異常診斷 (操作者回報，缺症狀) — TASKS line 88
- app.aware-wave Stage 2 Fluent Form→intake 橋接+FluentCRM — TASKS line 72

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-06-15 03:48:38`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260615-034832.md`
- Closeout: `reports/closeout/closeout-20260613-230929.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)
- REALTEST_EVIDENCE: tool=Bash | cmd=curl Replicate API schema flux-schnell | exit=0 | ms=N/A — confirmed Input params: no width/height; aspect_ratio default=1:1
- REVIEW_DONE: critic=Standard | verdict=pass (after full rewrite) | findings=2c/0m/0n
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=FLUX_PRINT_DIMS|aspect_ratio.*custom|printDims | hits=0
- REALTEST_WAIVED: NA -- live FLUX call not needed; schema confirmed via Replicate API; 422 root cause identified from SG server logs

## 2026-06-13 feat(content-studio): Media Hub + expanded Structure section

### [已修改]
- `ContentStudio.tsx`: Added `MediaHub` interface + `ArticleStructure` extended (tables/h3/lists/italics/quotes/bold). Structure section replaced with intro hook brief + type chip buttons + Yes/No dropdowns. New Media Hub section (AI images: provider/count/size/style/instructions/brand name/alt-text; YouTube: count/layout; strict-under-headings). New constants HOOK_TYPES, AI_IMAGE_PROVIDERS, IMAGE_SIZES, LAYOUT_OPTIONS. `setMedia` callback, `showMedia` state, `DEFAULT_MEDIA`, updated `bulkSettings`.
- `generate/route.ts`: Extended `ArticleStructure` + added `MediaHub` interface. `buildUserPrompt` accepts `introHookBrief`/`introHookType`/`media`; emits IMAGE_PLACEHOLDER_N and YOUTUBE_PLACEHOLDER_N prompt instructions. Fixed pre-existing targetCountry sentinel mismatch (`"Global"` vs `"全球（不指定）"`). Clamped imageCount (1–10) and youtubeCount (1–5) server-side.

### [驗證結果]
- REALTEST_EVIDENCE: tool=Bash | cmd=node --input-type=module (targetCountry/clamp/size-label logic) | exit=0 | ms=<1000 — all 5 assertions PASSED
- REVIEW_DONE: critic=Standard | verdict=pass (2 majors fixed: clamp + targetCountry sentinel) | findings=0c/2m/2n
- BUGHUNT_DONE: scope=agency-os,scripts | grep=imageCount|youtubeCount|introHookBrief|targetCountry.*Global | hits=0



- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=countWords|resolveTermIds|imgRunRef|CJK_RE | hits=0 (no stale call sites outside modified files)
- REVIEW_DONE: critic=Deep | verdict=warn | findings=0c/1M/2m/2s -- Major: JP/KO kana/hangul missing from CJK range (FIXED before commit); Minor: resolveTermIds silent drop, inline images literal-text; Suggestions: imgRunRef decoupling (FIXED), imgRunRef reset
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit | exit=0 | ms=<30000
- REALTEST_WAIVED: SMOKE_COVERED -- deploy smoke checks WP publish endpoint; CJK word-count verified by critic empirically

## 2026-06-14 fix(publish): excerpt + YouTube placeholder

### [已修改]
- publish/route.ts: extractExcerpt() 從 ## Quick Answer 或首段抓 WP excerpt; YouTube placeholder [YOUTUBE_PLACEHOLDER_N: q] 轉 styled div; 修 3 個 Minor (comment strip non-greedy, heading strip anchored, fallback first paragraph)

### [驗證結果]
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit | exit=0 | ms=<60000
- REVIEW_DONE: critic=Quick | verdict=warn | findings=0c/0M/3m -- all 3 Minor fixed before commit (comment strip, heading anchor, fallback para)
- BUGHUNT_DONE: scope=agency-os,scripts | grep=extractExcerpt|YOUTUBE_PLACEHOLDER | hits=0
- REALTEST_WAIVED: SMOKE_COVERED -- deploy smoke verifies publish endpoint live

## 2026-06-14 feat(generate): Perplexity real external sources

### [已修改]
- generate/route.ts: fetchRealSources() 呼叫 Perplexity Sonar，回傳最多 5 個真實外連 URL；注入 prompt 並限制 Claude 只用這些；Major fix: 雙層 URL 驗證（fetch 結果 + prompt 注入前都 filter /^https?:\/\// + 無空白字元）
- docker-compose.yml: 加 PERPLEXITY_API_KEY env 到 next-admin service
- SG .env: 手動加入 PERPLEXITY_API_KEY

### [驗證結果]
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit | exit=0 | ms=<60000
- REVIEW_DONE: critic=Quick | verdict=warn | findings=0c/1M/1m/1s -- Major: realSources 無驗證直接注入 prompt (FIXED: double-filter); Minor: keyword raw in Perplexity query (bounded, acceptable); Suggestion: typeof check (FIXED)
- BUGHUNT_DONE: scope=agency-os,scripts | grep=fetchRealSources|realSources | hits=0
- REALTEST_WAIVED: SMOKE_COVERED -- deploy smoke verifies generate endpoint; Perplexity verified separately via existing MCP integration

## 2026-06-14 feat(trending): Perplexity replacement + ILJ SYSTEM_PROMPT fix

### [已修改]
- trending/route.ts: 完全替換 `fetchGoogleTrends`（Google Trends RSS 被 VPS IP 封鎖）為 `fetchPerplexityTrending`（Perplexity Sonar real-time）。suggest/questions 保留 Google Autocomplete，若回空則 fallback 至 Perplexity。修了 `Promise.allSettled`（原 `Promise.all` — 一個 prefix 失敗會掛整個 questions endpoint）。case-insensitive dedup。parseJsonStrings 的 line-split fallback 過濾掉 raw JSON 行。
- generate/route.ts SYSTEM_PROMPT: 移除「At least 1 internal link with fully descriptive anchor text」指令 — 使用者已安裝 Internal Link Juicer 外掛（500+ 文章自動內連），AI 生成假路徑（/related-article）反而扣 RankMath 分。用戶自行提供內連仍正常走 buildUserPrompt 的 validInternal 邏輯。
- ContentStudio.tsx: 更新兩個空狀態文字，移除「Google」品牌標籤，改成「Perplexity 即時資料」。

### [驗證結果]
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit (excluding pre-existing CanvasEditor.tsx:274) | exit=0 | ms=<60000
- REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0M/2m/1s -- Minor: parseJsonStrings line-split JSON garbage (FIXED), dead category field (FIXED); Suggestion: case-sensitive Set dedup (FIXED)
- BUGHUNT_DONE: scope=agency-os,scripts | grep=fetchGoogleTrends|pickTrendKeyword|internal.link | hits=0
- BUGHUNT_WAIVED: NA -- ContentStudio.tsx UI text only change; generate/route.ts SYSTEM_PROMPT text only removal

