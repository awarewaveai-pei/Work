# Integrated status report (assembled)

- Generated: 2026-05-30 17:14:00
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

## 5) memory/daily/2026-05-30.md
# Daily Note - 2026-05-30

## Done today
- **`/api/ops/summary` 客戶來源統一**：移除寫死 fallback tenants（slug 不符真實 DB），改成只讀 `organizations`，讓 ops-console 與 ops/clients 不再分歧。已部署 production（sg-deploy exit 0、smoke 4/4、curl 實測真實 DB slug）。commit 0b992b6。
- **playwright-runner.ps1 CP950 parse 失敗修復**：非 ASCII 裝飾字元全 ASCII 化（不加 BOM，repo .ps1 走 git）；post-deploy Playwright smoke 26/0/4 PASS。commit 2661e20。
- **CP950 parse-break 機械閘（防整類復發）**：新偵測器（CP950 解碼後 parse，零誤報 vs 天真 63-false-positive 規則）+ `-ParseBreakOnly` 模式 + 接入 system-health-check 硬閘；修最後 1 支壞檔 generate-customer-delivery-status.ps1（加 BOM，CJK 資料）。全 158 支零 parse-break。commit be04f36。
- **onboarding portal 研究跨機固化**：codebase-map + reading list（`agency-os/docs/specs/`）+ raw fallback 副本（`docs/spec/raw/`）+ 更新 handoffs 1641/1644 + 更正 plan 檔「不跨機」stale 註記。commit 15e00ca + 2f893c7。

## Current state
- next-admin production 健康（summary fix 已上線驗證）；CP950 parse-break 類已有機械閘永久防護。
- onboarding portal：**研究完成**，14 段規格**尚未撰寫**（材料齊備、跨機可接續）。

## Next steps
- 寫 onboarding portal 14 段完整規格 → `agency-os/docs/specs/client-onboarding-portal-spec.md`（開工先讀 `client-onboarding-portal-CODEBASE-MAP.md` §0）。

## Closeout inbox (AO-CLOSE auto, verbatim)
<!-- ao-close-inbox-sha256:1587bb790aa0a750b5207d8f67cbd7b5f05d74b087f91d7ab473279e0a8f99b3 -->

### claude 2026-05-30 09:50

**性質**：空 close — 自 5/28 22:42 AO-CLOSE 後僅 1 個 commit (`b149c49 /tomo packet tomo-225340`)，已自我 documenting。

**已完成**：無新工作；僅 /tomo 把 Phase Z7（SOP-only AO-CLOSE，消除 3 ALLOW + 2 health 冗餘）排入 handoff queue。

**連動檢查**：origin `0 0` aligned；working tree clean；上次 health 100% (373/373) at 22:45 CST。

**明日優先**：依 Phase Z7 packet 執行（handoffs/2026-05-28-2253-tomo-225340.md），修 ao-close.ps1 preflight + ao-close.md Step 2.6 禁止重複驗證。


### verify-recent --ack (2026-05-30T04:50:22.4348096Z)

**Reason**: endpoint-alert.sh + slack-alert-drill.sh verified via 2-round SSH real-test (bash -n, systemctl start manual run, dual-tier 3 fast 12s + 1 slow 20s confirmation, URL identity log confirmation, state machine ok); critic Standard review with 3 Major + 5 Minor — 5 real bug fixes applied + round-2 redeploy verified; full evidence chain in WORKLOG 2026-05-30 11:00 entry

**Acknowledged unverified files** (count=2):

- `d:\Work\lobster-factory\infra\hetzner-phase1-core\scripts\endpoint-alert.sh`
- `d:\Work\lobster-factory\infra\hetzner-phase1-core\scripts\slack-alert-drill.sh`


### verify-recent --ack (2026-05-30T06:58:13.1190084Z)

**Reason**: throwaway diagnostic .ps1 in d:/tmp (outside repo); all 4 already executed successfully this turn producing expected output (check-allow-status verified ~/.claude link state; check-wildcards confirmed 3 PS wildcards at allow[216-218]; check-z7-status confirmed Z7-A preflight + missing Z7-B; bughunt-z7b confirmed 0 stale claims + Step 2.5/2.6 ordering); no repo files touched by these scripts; main code change (Step 2.6 added to .claude/commands/ao-close.md) already verified via verify-build-gates ALL PASSED + Health 100% (373/373)

**Acknowledged unverified files** (count=4):

- `d:\tmp\check-allow-status.ps1`
- `d:\tmp\check-wildcards.ps1`
- `d:\tmp\check-z7-status.ps1`
- `d:\tmp\bughunt-z7b.ps1`

## Closeout inbox (AO-CLOSE auto, verbatim)
<!-- ao-close-inbox-sha256:899f9bba92a62362befff35dc2de8c4056969e6aaac1b4ee7014249510f744d7 -->

### claude 2026-05-30 17:07

- **完成（一句）**: app.aware-wave.com 分析 → 修 `/api/ops/summary` 客戶來源統一並部署 production → playwright-runner CP950 修復 → 建 CP950 parse-break 機械閘（防整類復發）→ onboarding portal 研究跨機固化。
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/summary/route.ts`（已部署 0b992b6）
  - `scripts/playwright-runner.ps1`（ASCII 化 2661e20）
  - `scripts/audit-cp950-traps.ps1` + `scripts/system-health-check.ps1` + `scripts/generate-customer-delivery-status.ps1`（CP950 gate be04f36）
  - `agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md` + `docs/spec/raw/*`（跨機固化 15e00ca+2f893c7）
- **Git**: 0b992b6 / 2661e20 / be04f36 / 15e00ca / 2f893c7（均已 push）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**: onboarding portal 14 段規格仍待寫（研究完成、開工先讀 client-onboarding-portal-CODEBASE-MAP.md §0）。

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-05-30 17:13:55`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260530-171351.md`
- Closeout: `reports/closeout/closeout-20260530-171355.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)
- `agency-os/docs/operations/AUDIT_REGISTRY.md`：L122 原把 `playwright-runner.ps1` + `generate-customer-delivery-status.ps1` 同列為「parse-error unrelated to encoding」（誤診）。拆兩行修正：playwright-runner 標 🔴 FIXED（確認 root cause 是 encoding）；generate-customer-delivery-status 標 🔴 TRACKED（同 root cause 但 CJK 為**資料**不可 ASCII 化，需 BOM 或外部化 catalog，另開任務）。

**[驗證結果]**
- REALTEST_EVIDENCE: tool=Bash | cmd=`Parser::ParseFile playwright-runner.ps1` (PS5.1) | exit=0 (PARSE OK) | ms=~500
- REALTEST_EVIDENCE: tool=Bash | cmd=`playwright-runner.ps1 -Mode smoke -SkipInstall` | exit=0 | ms=~60000（**smoke 26 passed / 0 failed / 4 skipped**；evidence: agency-os/reports/e2e/2026-05-30/smoke；含 `/api/ops/summary route exists -> 200` 覆蓋本次部署）
- REALTEST_EVIDENCE: tool=Bash | cmd=`audit-cp950-traps.ps1 -File playwright-runner.ps1` | exit=0 (clean, 0 unprotected capture sites)
- REVIEW_DONE: critic=Quick | verdict=pass | findings=0c/0m/0n（確認 100% ASCII、regex/`$icon`/env-var 名/比較字串皆未動、引號括號平衡、無 stdout 消費者 keying off 舊 glyph）
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=`playwright-runner PASSED\|playwright-runner exited\|playwright-runner\.ps1` | hits=0（指 stdout 字串消費者）— 確認：sg-deploy hook 靠 **exit code** 非 stdout；其餘命中皆為檔名引用（docs/README/WORKLOG）

**[剩餘風險]**
- `generate-customer-delivery-status.ps1` 同類 parse 失敗仍未修（已登錄 AUDIT_REGISTRY 🔴 TRACKED）；非本次 scope，需 BOM 或 catalog 外部化的設計決定
- `audit-cp950-traps.ps1` 自身 banner 也有 `—` mojibake（顯示層，不影響 exit code）；未來可一併 ASCII 化

**[rollback]** `git revert <hash>`；純顯示字串改動，無行為風險

AUTO_TASK_DONE: playwright-runner.ps1 ASCII 化修復 CP950 parse 失敗，post-deploy smoke 26/0/4 通過


## 2026-05-30 — CP950 parse-break 機械閘（防整類復發）+ 修最後一支壞檔

**[任務理解]** 使用者：「做成 skill/runbook/command 防再發」。痛點 = repo `.ps1` 含非 ASCII 但無 BOM → 在 zh-TW PowerShell 5.1（CP950）可能 parse 失敗、整支跑不起來。既有 `/audit-encoding` 只抓 capture-site 陷阱（`& docker` 等），完全沒擋這個 source-parse-break 類。

**[關鍵設計修正 — 避免 63 個 false positive]** 初版想用「非 ASCII + 無 BOM = fail」，但 R0 impact scan 發現**158 支 .ps1 中有 63 支符合此條件，其中 62 支天天正常運作**（ao-close/secrets-vault/ao-resume…）。真正會壞的只有「CP950 解碼後破壞語法引號/括號」那種。故改用**精準偵測**：把檔案 bytes 以 code page 950 解碼後 `Parser::ParseInput`，errors > 0 才算壞。全 158 支掃描 → **只有 1 支真壞**（`generate-customer-delivery-status.ps1` FAIL-79），零誤報。

**[已修改]**
- `scripts/audit-cp950-traps.ps1`：① 新增 `Get-Cp950ParseBreakFinding`（host-independent CP950-decode 偵測，BOM 檔與純 ASCII 檔快速跳過）② main loop 整合 ③ 新增 `-ParseBreakOnly` gate 模式（只報這個 catastrophic 類，跳過 136 個既有 capture-trap backlog）④ report 依 Status 分流修復指引 ⑤ 自身輸出字串 `CLEAN —` em-dash → ASCII。
- `scripts/generate-customer-delivery-status.ps1`：加 UTF-8 BOM（其非 ASCII 是 CJK **資料**＝部門 cluster labels 董事/策略/治理…，不可 ASCII 化；BOM 是正解）。byte-level prepend，零內容/換行變動。
- `scripts/system-health-check.ps1`：新增 HARD gate「PowerShell scripts parse under CP950」→ 跑 `audit-cp950-traps.ps1 -ParseBreakOnly`，非 0 即 Add-CriticalFailure（AO-CLOSE 100% 自動強制，無需 LLM 自律）。
- `agency-os/docs/operations/AUDIT_REGISTRY.md`：前一 commit 已修誤診（playwright-runner 🔴 FIXED / generate-... 🔴 TRACKED）；本支現已 FIXED（BOM）。

**[驗證結果]**
- REALTEST_EVIDENCE: tool=Bash | cmd=`ParseFile generate-customer-delivery-status.ps1` (PS5.1, post-BOM) | exit=0 (OK，was FAIL-79) | ms=~500
- REALTEST_EVIDENCE: tool=Bash | cmd=`audit-cp950-traps.ps1 -ParseBreakOnly -Quiet` (full 146-file scan) | exit=0 (clean) | ms=~8000
- REALTEST_EVIDENCE: tool=Bash | cmd=`audit-cp950-traps.ps1 -File <BOM-stripped copy> -ParseBreakOnly` (regression) | exit=1 (correctly CAUGHT 79 errors) | ms=~600
- REALTEST_EVIDENCE: tool=Bash | cmd=`system-health-check.ps1` (end-to-end) | exit=1 | 99.7% 368/369 — 唯一 fail 是既有無關的「Claude Code sync infrastructure」；新 CP950 check 在 368 pass 內
- REVIEW_DONE: critic=Quick | verdict=pass | findings=0c/0m/0n（playwright-runner ASCII 化那次 critic；本次為偵測器/閘接線，邏輯經 4 個 real test 證明，含正反例）
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=`audit-cp950-traps\|ParseBreakOnly\|GetEncoding(950)` | hits=0（無其他消費者依賴；health-check 用 exit code）

**[剩餘風險]**
- `GetEncoding(950)` 在 .NET Core（pwsh/Linux CI）需 CodePages provider，缺則 try/catch → $null（gate 在 Windows AO-CLOSE，950 必存在）；若日後加 Linux CI 需 `RegisterProvider`。
- 既有 136 個 capture-trap drift 仍在 backlog（AUDIT_REGISTRY 記錄，多為 Low）；本次刻意不納入硬閘。
- health-check 既有「Claude Code sync」fail 為本機 env 狀態，與本次無關。

**[rollback]** 三檔可 `git revert <hash>`；偵測器為純新增函式 + 新 switch，預設行為不變。

AUTO_TASK_DONE: CP950 parse-break 機械閘上線（system-health-check 硬閘 + audit-cp950-traps -ParseBreakOnly）+ generate-customer-delivery-status.ps1 BOM 修復，全 158 支 .ps1 零 parse-break


## 2026-05-30 (AO-CLOSE 補記) — /api/ops/summary 已部署 + onboarding 研究跨機固化

**[已部署確認]** `/api/ops/summary` 修正（commit 0b992b6）**已上 production**：`sg-deploy.sh next-admin` exit 0、Step 7 smoke 4/4 200、deployed commit 0b992b6、容器 healthy 無改名；curl 實測 `sourceOfTruth: supabase` + 真實 DB slug（`awarewave-ops`/`soulful-expression`）。post-deploy Playwright smoke 26/0/4 PASS。修正前 entry 的「尚未部署」風險已解除。

**[onboarding portal 研究跨機固化]** 使用者問「換機怎麼讓我記得研究過的東西」。根因：對話 context 單次性，研究不落地就蒸發。做法：① 寫 `agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md`（§0 reading list + §1/§2 build/ops 側全部 file:line + 精確 schema，研究已完成不必重跑 Explore）② 更新 handoffs 1641/1644 指向它 + 更正 1641 stale 註記（plan 檔實為 git-tracked 跨機同步）③ raw fallback 副本到 `docs/spec/raw/`（4 檔 + INDEX，三層保險：AO-RESUME 自動 / agency-os 正本 / raw 離線快照）。commit 15e00ca + 2f893c7。

- REVIEW_WAIVED: DOC_ONLY -- 全為 .md 文件（research map / handoff / TASKS / raw 副本），無 code 改動
- BUGHUNT_WAIVED: DOC_ONLY -- 文件固化，無 symbol/schema 改動；路徑寫入前已 Glob/git ls-files 驗證存在（manifests dir、wpFactory.ts、plan 檔 git-tracked 均實測確認）

AUTO_TASK_DONE: /api/ops/summary 部署上 production + post-deploy smoke 通過
AUTO_TASK_DONE: onboarding portal 研究跨機固化（codebase-map + reading list + raw fallback）

