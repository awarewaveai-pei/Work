# Integrated status report (assembled)

- Generated: 2026-06-06 20:56:40
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

## 5) memory/daily/2026-06-06.md
# Daily Note - 2026-06-06

### Done (AO-CLOSE session 2026-06-06 ~20:44)
- **SEO/GEO Content Engine 產品化**（doc-only）：spec → 通用引擎（prompt-kit + 2 顆 Gem onboarding/content）+ Soulful Expression 客戶內容（CONTENT_STRATEGY + 首篇 art-based-healing 文章範本）。
- **定位鎖定**：公開 Arts Practice for Self-Discovery / EdD 框架 Arts-Based Reflective Pedagogy（Schön/Kolb/Mezirow）；非臨床 art therapy（YMYL 護欄）；域名保留 soulfulexpression.org，獨佔 WuSheng Healing Module™。
- handoff `handoffs/2026-06-06-2044-seo-geo-content.md`；spec 主檔未動（另一 AI 編輯中）。


### verify-recent --ack (2026-06-06T04:03:04.8929092Z)

**Reason**: tarot 修 cat-deck: buildCardPrompt 重構(角色改造)+ image-gen 抽 openai error code + route friendly 錯誤訊息+HTTP200(避 nginx HTML 攔截); tsc --noEmit green; 純 string/錯誤映射，無新控制流/安全面

**Acknowledged unverified files** (count=3):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\cards.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\tarot\image-gen.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\tools\tarot\generate\route.ts`


### verify-recent --ack (2026-06-06T04:14:44.9644364Z)

**Reason**: tarot cat-deck 定版: buildCardPrompt 改用實測驗證過的贏家結構(MAIN CHARACTER lead + NOT-human 否定，flux-schnell 實生兩張全貓確認) + image-gen 加 CJK→英文自動翻譯(haiku, fail-open); tsc green

**Acknowledged unverified files** (count=2):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\cards.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\tarot\image-gen.ts`


### verify-recent --ack (2026-06-06T04:38:35.6609848Z)

**Reason**: tarot UX: Step2 加牌組篩選(大牌/全部/權杖/聖杯/寶劍/錢幣)+單張點擊生成，不再強制一次跑78張; tsc green; 純 client UI/狀態，無 server/安全面

**Acknowledged unverified files** (count=1):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\TarotStudio.tsx`


### verify-recent --ack (2026-06-06T04:46:01.5920157Z)

**Reason**: Phase1 M9/M7/M3/M10 完整驗證已做: tsc(我4檔0錯,殘留20錯全pre-existing) + vitest 18/18 + critic 無Critical + db-expert sound + WORKLOG R0 證據齊(REALTEST/REVIEW/BUGHUNT). skill auto-tsc N/A因package無tsconfig,改臨時config手動跑

**Acknowledged unverified files** (count=2):

- `d:\Work\lobster-factory\packages\workflows\src\trigger\orchestrate-tenant-provisioning.ts`
- `d:\Work\lobster-factory\packages\workflows\src\executor\installManifestStaging.ts`


### verify-recent --ack (2026-06-06T05:32:37.2263801Z)

**Reason**: Phase2 foundation 已驗證: tsc 新檔0錯(總20全pre-existing) + vitest 27/27(+9新測). 全env-gate OFF零prod. skill auto-tsc N/A因package無tsconfig,臨時config手動跑

**Acknowledged unverified files** (count=5):

- `d:\Work\lobster-factory\packages\workflows\src\hosting\types.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\serverTypes.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\providers\serverProvisionContract.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\mockServerAdapter.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\resolveServerProvisioning.ts`


### verify-recent --ack (2026-06-06T05:48:27.7681141Z)

**Reason**: §11 watchdog extension = additive data-array entry (2 hashtables, same loop as proven Phase4 entry) to warn-only check. Verified: PS parse OK + audit-cp950-traps CLEAN. ASCII-only, zero CJK capture site, logic unchanged.

**Acknowledged unverified files** (count=1):

- `d:\Work\scripts\system-health-check.ps1`


### verify-recent --ack (2026-06-06T06:14:49.2329111Z)

**Reason**: tarot 模板選擇器(classic/minimal/dark/none)+多參考圖(referenceImage→referenceImages[]，每模型 maxRefs UI 動態顯示，gpt-image image[] 多圖，FLUX 用第一張)；tsc+next build green；client UI + route 陣列驗證 + image-gen 多圖

**Acknowledged unverified files** (count=4):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\renderPrintCard.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\tarot\image-gen.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\tools\tarot\generate\route.ts`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\TarotStudio.tsx`


### verify-recent --ack (2026-06-06T06:15:27.3124221Z)

**Reason**: routine-freshness AO-RESUME leg: check-routine-freshness.ps1 REAL-EXEC tested (correctly flags Monthly MISSING + Phase4/Weekly OK, status report written), param bug caught+fixed by exec test; both files PS parse OK + check-routine-freshness CP950 CLEAN; ao-resume.ps1 added block is output-capture-free (no new CP950 trap, mirrors proven auto-reboot block).

**Acknowledged unverified files** (count=2):

- `d:\Work\scripts\check-routine-freshness.ps1`
- `d:\Work\scripts\ao-resume.ps1`


### verify-recent --ack (2026-06-06T06:30:52.7313562Z)

**Reason**: routine-output-watchdog.sh (SG always-on Telegram leg): bash -n SYNTAX OK. Real-exec is dry-run + live test ON SG post-deploy (script targets SG /root/Work checkout + /root/lobster-phase1/.env, cannot run locally). State-file dedup + send-only-on-200 + creds read locally on SG.

**Acknowledged unverified files** (count=1):

- `d:\Work\scripts\routine-output-watchdog.sh`


### verify-recent --ack (2026-06-06T06:33:51.6552542Z)

**Reason**: tarot gallery UX: 縮圖 78px→132px 放大 + 點已完成卡跳大圖 modal(內含重生鈕)+ 點空白卡才生成; tsc green; 純 client UI/狀態

**Acknowledged unverified files** (count=1):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\TarotStudio.tsx`


### verify-recent --ack (2026-06-06T06:39:05.1979131Z)

**Reason**: tarot 模板選擇器改成縮圖預覽(每個模板用 renderPrintCard 渲染樣本/使用者圖, 點選, 高亮選中); tsc green; 純 client UI + canvas 渲染

**Acknowledged unverified files** (count=1):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\tarot\TarotStudio.tsx`


### verify-recent --ack (2026-06-06T06:39:24.3211949Z)

**Reason**: watchdog message bilingual (中/EN) + explanatory + next-step. bash -n OK; live-tested on SG (re-send with new format).

**Acknowledged unverified files** (count=1):

- `d:\Work\scripts\routine-output-watchdog.sh`


### verify-recent --ack (2026-06-06T06:43:40.6055425Z)

**Reason**: workflows package has no local tsc (Trigger.dev project; type-check runs at 'trigger.dev deploy'). A1 trigger.config syncEnvVars + B create-wp-site writeback match existing supabaseRestPatch signature + dispatcher _dispatchedFromActionRunId pattern; deploy is the verification gate (next step).

**Acknowledged unverified files** (count=2):

- `d:\Work\lobster-factory\packages\workflows\trigger.config.ts`
- `d:\Work\lobster-factory\packages\workflows\src\trigger\create-wp-site.ts`


### verify-recent --ack (2026-06-06T06:46:21.5239329Z)

**Reason**: Phase2d/2e provisioning 層完整驗證: vitest 75/75 + tsc 新檔0錯(總20 pre-existing) + critic 審(1 Critical IPv6 firewall + 8 finding 全修) + cloud-init/dns/hetzner/secretStore mock-fetch 單測. 全env-gate OFF零prod. 真機=Phase4

**Acknowledged unverified files** (count=8):

- `d:\Work\lobster-factory\packages\workflows\src\hosting\providers\hetzner\cloudInit.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\providers\cloudflare\dns.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\providers\hetzner\HetznerHostingAdapter.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\providers\hetzner\secretStore.ts`
- `d:\Work\lobster-factory\packages\workflows\src\hosting\mockServerAdapter.ts`
- `d:\Work\lobster-factory\packages\workflows\src\provision\provisionClient.ts`
- `d:\Work\lobster-factory\packages\workflows\src\provision\serverAdapterFactory.ts`
- `d:\Work\lobster-factory\packages\workflows\src\provision\cli.ts`


### verify-recent --ack (2026-06-06T07:10:10.2544160Z)

**Reason**: watchdog: force LC_ALL=C.UTF-8 to fix CJK mojibake (inherited cron locale not UTF-8; C.UTF-8 present+working verified via base64 decode). bash -n OK; live base64 verify on SG next.

**Acknowledged unverified files** (count=1):


_... 113 lines omitted._

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-06-02 18:09:55`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260602-180950.md`
- Closeout: `reports/closeout/closeout-20260602-180955.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)
1. REALTEST_EVIDENCE: tool=Bash | cmd=powershell test-stable-status.ps1 (4 cases) | exit=0 | result=ALL PASS（時間戳/報告名 churn→不寫；score 100→99.5 / exit 0→1→寫；首跑/缺檔→寫；regex 不誤傷 `- Health score:`/`- Health gate exit code:`）
   REALTEST_EVIDENCE: tool=Bash | cmd=run agency-os/scripts/system-guard.ps1 -WorkspaceRoot agency-os -Mode daily x2（排程實際呼叫） | exit=1(health FAIL 與 churn 無關) | result=LAST_SYSTEM_STATUS.md 兩次 SHA256 相同 60153216…（不再 churn）
   REALTEST_EVIDENCE: tool=Bash | cmd=audit-cp950-traps.ps1 -ParseBreakOnly | exit=0 | result=scanned=147 clean=147 drift=0，兩支 system-guard OK
2. REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/0n（七項逐一實測：regex 不誤傷、BOM/CRLF/trailing-newline 正規化、首跑、無 silent staleness、StrictMode-clean、兩份位元組相同；備註：Get-Content -Raw 在 PS5.1 已剝 BOM，TrimStart 為無害防禦性 no-op）
3. BUGHUNT_DONE: scope=agency-os,scripts | grep=LAST_SYSTEM_STATUS,stableStatusOf | hits=0（唯一 writer=system-guard；無 stale 符號引用；verify-closeout 僅排除不依賴重寫）；額外發現 scripts vs agency-os/scripts 20 檔 drift → 已記 TASKS
4. WORKLOG: this entry

**[剩餘風險]** 20 個核心腳本兩份 drift（含 AO 生命週期腳本）未 wrapper 化 — 已記 TASKS，未在本次處理。doc-sync 仍會 churn TASKS/WORKLOG/docs 的 `_Last synced` 時間戳（同類但獨立議題；AO-CLOSE 會 commit，session 啟動時通常已乾淨）。

**[rollback]** `git revert <commit>` 還原兩支 system-guard.ps1。

AUTO_TASK_DONE: system-guard LAST_SYSTEM_STATUS conditional-write（churn 治本，兩份同步 fix，換機 AO-RESUME 不再分歧）

## 2026-06-02 — Onboarding Portal ① debug log 清理 + §7 架構 R0 發現（②③ 暫不實作的理由）

**[任務]** 操作者交付 onboarding-portal-e2e packet 三步（① 清 debug logs → tsc/test → deploy；② 建 trigger-build route 接 orchestrate；③ §8 uptime_kuma）。授權我以技術負責人身分自行決定範圍。

**[① 已完成]** `lib/onboarding/spec-generator.ts` 移除 9 行 debug `console.error`（只刪 log、保留全部 guard + return）。tsc --noEmit 0 errors、vitest 168/168 pass、critic Deep 0/0/0、無殘留 `console.*`。**未 sg-deploy**（log 清理零急迫，隨下次實質部署搭車，避免單獨為 cosmetic change 冒 prod 風險）。

**[②③ R0 讀碼發現 — 不實作的理由]** packet §7 前任假設「呼叫 orchestrate-tenant-provisioning（已有 create-wp-site + apply-manifest）」與 code 不符：
- `orchestrate-tenant-provisioning.ts`（讀畢）只 `runProviderStep` fan-out 佈建整合服務 + 寫 webhook，**不建 org/site、不觸發 create-wp-site**。
- `create-wp-site.ts:89-112` payload 要 4 個已存在 UUID（organizationId/workspaceId/projectId/siteId）+ siteName + manifestSlug，website_spec 沒有。
- **已存在建站 pipeline**：`/build` console（`app/build/` + `app/api/build/{provision-services,runs}` + `lib/build-console/contracts.ts`）→ `dispatch-action-run`（`ops.profile-b.create-wp-site → create-wp-site`）→ create-wp-site；org/site 走 `app/api/ops/organizations`、`ops/clients`。
- **決定（技術負責人）**：②③ 若硬寫一條 route 自建 org/site + 觸發 create-wp-site = 平行重造既有 /build pipeline，違反 R0「不得建立重複邏輯」；照 orchestrate 接又不會真建站（誤導）。正解是把 intake→spec 餵進**既有 /build/dispatch pipeline**，需一次設計 pass（讀 build-console/contracts + dispatch 資料模型）。本 session 不猜不重造，改為**把真實架構固化進 packet + TASKS**，下次照正確前提設計。

**[已修改]** spec-generator.ts（① log 清理）；handoffs/2026-06-02-1735-onboarding-portal-e2e.md（§4/§5/§6 更正前任假設 + 指向既有 pipeline）；TASKS.md（§7 項標注 ① 完成 + ②③ 需設計+reuse）。

**[驗證結果]**
1. REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit (next-admin) | exit=0 | result=0 errors
   REALTEST_EVIDENCE: tool=Bash | cmd=npm test (vitest) | exit=0 | result=168/168 pass, 8 files
2. REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/0n（9 行 log 移除無動到任何 guard/return；無 dangling block/unreachable）
3. BUGHUNT_DONE: scope=agency-os,scripts | grep=console.\*(spec-generator) ; create-wp-site/orchestrate payload | hits=0 殘留 log；架構發現 orchestrate≠建站、既有 /build pipeline → 已固化 packet+TASKS
4. WORKLOG: this entry

**[剩餘風險]** ② §7 真正建站串接未做（需設計 pass，已記 packet+TASKS）；① 未 deploy（prod 仍有舊 debug log，無害，下次部署生效）。

**[rollback]** `git revert <commit>` 還原 spec-generator.ts log 清理 + 文件更正。

AUTO_TASK_DONE: onboarding spec-generator debug log 清理（tsc 0 + 168 tests + critic 0/0/0）+ §7 架構真相固化進 packet/TASKS（②③ 改 reuse 既有 /build pipeline 設計 pass）

### Tomorrow captured (/tomo)
- TOMORROW_CAPTURED: onboarding-staging-build → handoffs/2026-06-02-2235-onboarding-staging-build.md




## 2026-06-03

### Machine appendix (monthly-system-review)
- 2026-06-03 17:23:56 : gates=SKIPPED (ReportOnly) ; integrated-status: generate-integrated-status-report.ps1 OK ; supabase-memory: PASS (supabase-studio memory at 38.89% (< 85%))






- BUGHUNT_WAIVED: DOC_ONLY -- trivial edit (verify-recent --trivial); wp-bridge plan deepen + rename + ADR 007 (md-only)



