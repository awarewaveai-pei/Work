# Integrated status report (assembled)

- Generated: 2026-06-16 08:34:38
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

## 5) memory/daily/2026-06-16.md
# Daily Note - 2026-06-16

## Done today
（窗：上次 AO-CLOSE 2026-06-15 17:30 → 本次 2026-06-16 08:2x；全為 06-16 凌晨主線）

**Content Engine（generate 品質鏈，已部署 SG）**
- 品質修正包 `1e1d55cf`：截斷修正（SIZE_TOKENS 2048/4096/6144→4096/8192/16384 + CONTENT_META 移到文章最前，body 截斷仍保住 SEO 標題/描述）+ 內連防造假護欄（兩分支）+ 新 `related-posts/route.ts`（查真站 posts+pages 回真實 permalink）+ streaming 截斷偵測 marker。critic Deep 2 Major 全修（GENERATION_ERROR 剝除 + bulk path + publish 防禦縱深）。
- 結構開關「Yes」正面強制 `fd965dbc`：TABLES/FAQ/QUOTES 勾了卻沒出 → generate route 加 `REQUIRED ELEMENTS` 硬 MUST。REALTEST 真打 Haiku 全 PASS。
- `/api/content/title` RankMath 合規 `88da4d38`：建議標題補阿拉伯數字+力量詞（EN+CJK 雙語感知，規則與 generate H1 同步）。REALTEST EN 5/5 + CJK 5/5。

**POD（A1 hardening + A2 自動轉單，已部署 SG `e336d5da`）**
- A1 hardening（deployed `1b081764`）：結構化 transient classifier（取代 free-text includes("timeout")）+ SKU-faithful 冪等（skuMismatch guard）。vitest 318/318 + smoke 24 pass。
- A2 自動轉單管線 `ad14f5f1`/`f3c4d981`/`e336d5da`：Woo 成交 → Printful **DRAFT**（kill-switch `POD_AUTO_FULFILL_ENABLED` 預設 OFF + HMAC 驗簽）。**已上 prod 但 dormant**（probe 回 `auto_fulfill_disabled`，零金流）。333/333 test 含金流紅線守門。confirm/送印紅線**不建**。deploy gate 連抓兩個本機被掩蓋問題（server crypto global / next build route-export）。

**基礎設施 / 排程**
- doc-sync `b71f72a6`：`Resolve-Path`/`Test-Path` 補 `-LiteralPath` → 修中括號檔名 `[year] Shortcode.md` PropertyNotFound 紅字閃窗（+ critic 揪出 line 277 同 bug class）。
- scheduled-tasks `c4ae159f`：`REGISTER_SYSTEM_GUARD_TASKS.ps1` 由 `schtasks /TR`（261 字限制，隱藏指令 308 字靜默建不起）改 `Register-ScheduledTask` 模組，Daily-only 隱藏靜默。揭 SSOT 261 bug 根因。
- mcp `dd18d9d4`：`start-trigger-mcp.ps1` pwsh7 fallback 到絕對 powershell.exe 路徑。
- wp-bridge FluentCRM newsletter draft route（**WIP 未發版** `363bdace`/`49a10bcd`）：`NewsletterCreator.php`（只 draft + status 斷言）+ `/newsletter` 路由 + 版本 0.10.0→0.11.0；php -l 三檔全綠。runtime REALTEST + 發版待 go-ahead。
- /tomo handoff packets：`company-desktop-systemguard`（`84e35dad`）+ `company-desktop-cloudflare-vault`（`fcd1a89f`）跨機修正交接。

## Current state
- 健康 100%（372/372）；origin/main 對齊（ahead=0 behind=0，HEAD=ba710b47）；backup SG/EU 0d、auto-reboot 🟢、CF security PASS、smoke PASS。
- prod 最新部署 SG `e336d5da`（next-admin）；A2 webhook 上 prod 但 kill-switch OFF（dormant，零金流）。
- 公司桌機尚有兩項機器本地修正待重跑（cloudflare vault token cfat_ + SystemGuard 重註冊；筆電已修並驗）。

## Next steps
- **【明日 2026-06-17｜資安複盤】** Defender `Trojan:Win32/PowhidSubExec.B` 來源查清與善後（已無 active threat；當正式資安事件走 DoD：清暫存檔/審 registrar/驗 live task action/評估 hook 升級 block）。
- **wp-bridge FluentCRM newsletter** REALTEST（soulful 真建草稿→驗 status=draft→刪）→ 發版 0.11.0（兩 repo）→ next-admin `/api/content/newsletter` route + ContentStudio 按鈕。先 soulful 一站。
- **公司桌機**（換機時）git pull 後重跑 SystemGuard 註冊器 + 修 cloudflare vault token（TASKS line 160/161 含完整步驟）。
- POD A1 真實 e2e 開賣驗證（操作者驅動瀏覽器）；A2 啟用為操作者三步（測試結束 + 批准才開）。

## Open tasks (auto-generated at 08:00 TPE)
- [ ] **【明日 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後**
- [ ] **【進行中｜社群發佈整合】Content Studio 接 Postiz 真實發佈**
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測**
- [ ] **【明日】soulfulexpression.org 遷移到 Cloudflare（DNS 先、registrar 後）**
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**
- [ ] **【POD A1 已完工｜剩 e2e + A2】**
- [ ] **smoke 04-onboard spec 補 app session 登入**
- [ ] **wp-bridge 續做 operation：featured image / update-existing-post / product update+delete**
- [ ] **【POD Studio 自建動工】** plan=`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】**
- [ ] TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1）
- [ ] **【診斷】Mockup Studio 功能異常**
- [ ] **🎨 Image Output Pipeline**（SSOT: `lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md`）
- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint)
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）**
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）**
- [ ] app.aware-wave onboarding/provisioning IA 重整
- [ ] **【公司桌機】CLOUDFLARE vault token 裝錯修正（筆電 2026-06-16 已修並驗）**
- [ ] **【公司桌機】重跑 SystemGuard 註冊器，換掉會閃紅字視窗的舊 Daily 任務（筆電 2026-06-16 已修並驗）**
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤**
- [ ] **既有站接手（Soulful Expression Art Therapy）**
- [ ] **既有站接手 Day 1（Soulful Expression）**
- [ ] **新站建置（Scenery Travel Mongolia）**
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）**
- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（兩案）**
- [ ] `tenants/templates/` v2
- [ ] `lobster-factory` A10-2 商業閉環實跑
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**
- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制**
- [ ] 三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability）
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】**
- [ ] **（Phase 4 觀察期）AwareWave 自動告警維修系統 v3.2 — Phase 4 觀察期進行中**
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）

## Yesterday context
2026-06-15：修復 workflows esbuild 安全弱點（high×3，audit clean），新增 `/tools/ai-models` AI 模型比較頁並部署至 production（commit `5b8c97ac`）；Content Studio 改善：generate/route.ts 移除假 internal link 指令（改用 Internal Link Juicer），ContentStudio.tsx 改 Perplexity 品牌標籤；woo-order webhook（kill-switch OFF dormant）與 generate quality bundle 全部驗畢部署。

---

### verify-recent --ack (2026-06-15T16:42:33.2391653Z)

**Reason**: Full verify already completed this turn: npx tsc --noEmit 0 errors on route.ts+print-provider.ts; critic agent PASS 0 Critical 0 Major (2 Minor both closed via dup-sku guard); vitest 318/318 incl new native-sync-product.test.ts (clean-hit + renamed-reseed); bughunt grep 0 free-text residue, isTransientPfError 1def+2calls

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\tools\publish\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\studio\print-provider.ts`


### verify-recent --ack (2026-06-15T18:25:46.5586948Z)

**Reason**: Full verify completed this turn for woo-order webhook: tsc 0 on route.ts+route.test.ts+docker-compose YAML_OK; critic PASS 0c/0M (money red-line traced clean, kill-switch fail-closed, HMAC no-bypass); vitest 333/333 incl 15 webhook tests + money-red-line guard (kill-switch off -> createDraftOrderOnNative never called); bughunt 0 confirm-path in webhook, env in both compose blocks

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\webhooks\woo-order\route.ts`


### verify-recent --ack (2026-06-15T18:34:35.5773092Z)

**Reason**: title\route.ts fully verified this session (REALTEST real Anthropic EN+CJK 5\5 digit+power-word pass; critic verdict pass 0c\0M; tsc 0 errors; bughunt single caller contract unchanged). The 3 d;C:\Program Files\Git\tmp test scripts are throwaway harness, not shipped.

**Acknowledged unverified files** (count=4):

- `D:\tmp\check-trend-keys.ps1`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\title\route.ts`
- `D:\tmp\test-title.py`
- `D:\tmp\run-title-test.ps1`


### verify-recent --ack (2026-06-15T19:01:01.1576759Z)

**Reason**: node:crypto fix for woo-order verifyWooSignature: deploy npm-test gate caught server vitest env lacks global crypto; switched to createHmac+timingSafeEqual (codebase HMAC convention). tsc 0; webhook 15/15 pass locally; node:crypto works in all envs

**Acknowledged unverified files** (count=1):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\webhooks\woo-order\route.ts`


### verify-recent --ack (2026-06-15T19:08:39.4045492Z)

**Reason**: woo-order route-type build fix: next build rejects non-handler exports from a route module; moved parseWooOrder+verifyWooSignature to lib/studio/woo-webhook.ts. Verified with REAL local next build (route compiles, appears in manifest), tsc 0, webhook 15/15

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\studio\woo-webhook.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\webhooks\woo-order\route.ts`


### verify-recent --ack (2026-06-15T19:25:36.4492289Z)

**Reason**: generate quality bundle fully verified: tsc 0 errors (4 files); REALTEST related-posts data source (soulful WP REST posts+pages search -> 5 real links); critic Deep warn->all 2 Major fixed (GENERATION_ERROR strip + bulk path + publish defense-in-depth); bughunt GENERATION marker emit/consume/drop 3-end + related-posts single caller, 0 stale. Generate prompt e2e (meta-first/truncation/internal-links) is deploy-gated -- verifiable on next article gen post-deploy.

**Acknowledged unverified files** (count=4):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\generate\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\related-posts\route.ts`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\ContentStudio.tsx`
- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\publish\route.ts`


### verify-recent --ack (2026-06-15T19:31:51.6375062Z)

**Reason**: structure-enforcement follow-up: tsc 0 errors (generate route); REALTEST real Anthropic Haiku with REQUIRED ELEMENTS -> table/FAQ/blockquote/key-takeaways ALL PASS (old behavior skipped them); bughunt structure consumers = buildUserPrompt only, no stale. Pure positive-enforcement prompt string append, no control-flow change.

**Acknowledged unverified files** (count=2):

- `D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\content\generate\route.ts`
- `D:\tmp\test-struct.py`

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-06-16 08:31:40`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260616-083135.md`
- Closeout: `reports/closeout/closeout-20260616-083140.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)

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

## 2026-06-15 security + AI Models guide + prod deploy

### packages/workflows weekly security audit remediation
- Weekly dependency scan reported esbuild advisory in `lobster-factory/packages/workflows` (`total=3 critical=0 high=3 moderate=0`).
- Fixed workflows package override by updating esbuild from `^0.28.0` to `^0.28.1` and refreshed lockfile.
- Verification: `npm audit --audit-level=high`, `npm audit --audit-level=moderate`, `npm test` (75/75), and `npm run audit:workflows-security` all passed.
- GitHub tracking issue exists: #15.

### Content Tools AI Models comparison page
- Added `/tools/ai-models` under Content Tools sidebar, positioned between SEO Content and Tarot.
- Built a clean comparison UI for three adjacent decision surfaces: text generation tools, image generation models, and vibe coding tools.
- Image model table uses per-image cost only, not 78-card deck cost, and covers the 15 app image models requested by the operator.
- Data includes model strengths, tradeoffs, style tendencies, cost notes, prompt/image input constraints where available, speed class, ratios, and source links.
- REALTEST_EVIDENCE: tool=PowerShell | cmd=`npm run typecheck` (next-admin) | exit=0 | result=tsc clean
- REALTEST_EVIDENCE: tool=PowerShell | cmd=`npm run build` (next-admin) | exit=0 | result=Next production build passed; route table includes `/tools/ai-models`
- REALTEST_EVIDENCE: tool=SSH | cmd=`/root/lobster-phase1/scripts/sg-deploy.sh next-admin` | exit=0 | result=deployed commit `5b8c97ac59e5da7d194db7256c1db27f8a503552`
- REALTEST_EVIDENCE: tool=SSH | cmd=deploy gates | exit=0 | result=tsc passed; vitest 24 files / 316 tests passed; container healthy after 7s; smoke OK for `/login`, `/api/ops/summary`, nginx/wordpress, node-api
- REALTEST_EVIDENCE: tool=PowerShell | cmd=`curl.exe -I https://app.aware-wave.com/tools/ai-models` | exit=0 | result=307 to `/login?next=%2Ftools%2Fai-models` as expected behind auth; `/login` returns 200
- REVIEW_WAIVED: CONTENT_DATA_UI -- static comparison page + typed data tables; build/typecheck/deploy smoke covered runtime integration
- BUGHUNT_DONE: scope=lobster-factory/infra/hetzner-phase1-core/apps/next-admin | grep=`78 張約|全套成本|fullDeckNt|15 個圖片模型比較` | hits=0 after moving comparison out of Tarot and using per-image cost only


