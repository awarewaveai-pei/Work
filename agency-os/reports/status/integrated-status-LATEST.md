# Integrated status report (assembled)

- Generated: 2026-08-15 21:19:40
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

## 5) memory/daily/2026-08-15.md
# Daily Note - 2026-08-15

## Done today
（session 窗口：2026-08-12 AO-RESUME → 2026-08-15 AO-CLOSE，跨 3 天）

### 事故根治
- **EU 全機卡死** — `trigger-clickhouse` 吃滿 1 CPU 限額（101.79%），EU load 4.9 / swap 3082MB。症狀卻是「SG 服務 timeout」；鑑別關鍵：EU→SG **ICMP 0% 遺失但 TCP:80 掛 11/20**，同時筆電→SG **20/20 全通**。根因是它在合併自己的遙測：`system` **16.89 GiB / 6.4 億列** vs 應用資料 `trigger_dev` 僅 **49 MiB / 62 萬列**（345 倍），`trace_log` 每小時 124 萬列。修法＝關掉產生源（非再清一次資料）。結果 CPU **101.79%→4.5%**、load **4.03→0.50**、`system` 表 **16.90 GiB→79.65 MiB**、EU→SG TCP **20/20**
- **SG 磁碟 90%** — offsite 備份兩邊都只清自己家、沒人清對方推來的副本（SG 囤 97 份/30G、EU 囤 96 份/31G）。兩支腳本對稱補 `OFFSITE_RETAIN_DAYS`。SG **90%→48%**、EU **79%→65%**

### 監控（本輪最大發現：告警一直有偵測到，只是沒有出口）
- `cgroup_ram_in_use` 在 clickhouse 上 **08-10→08-15 觸發 483 次**、峰值 93.5% —— 但 `notification.to = silent`（netdata stock 模板預設）
- **EU 根本沒有通知出口**：`custom_sender()` 是原廠空殼、`DEFAULT_RECIPIENT_CUSTOM` 空 → 自安裝以來所有告警石沉大海
- 修完後實測時又抓到兩個自造 bug：CRLF 讓 token 尾端多 `\r`（Bearer 靜默失敗）、EU→ops-inbox 被 CF Bot Fight Mode 擋 403（與 08-12 Kuma 假 DOWN 同 class）→ 腳本加 `OPS_INBOX_RESOLVE`
- Telegram 手機告警靜默：`secrets-vault -Action get` 的**遮罩值**被當真 token 用（3 支腳本 + 12 份文件同一 class）

### 其餘
- **Origin lockdown** — 腳本無允許清單，而 9 個 Kuma monitor + EU netdata 剛改成直打 SG origin，直接套用會自我封鎖。允許清單由 nginx log **152 個非 CF 來源全數分類**得出（最易漏：docker 閘道 1,987 次＝SG 自己的健檢）
- **`Resolve-Path` 缺 `-LiteralPath` 170 處/96 檔**全清 — 先分類確認 **0 處故意用萬用字元**才批改
- **workflows 部署到 EU prod** — 8/12 修的 35 個漏洞才真正生效
- **MCP 路由漂移歸零** — 一半是 glob 誤判、一半是真缺 3 個高風險 MCP
- **`check-clickhouse-health.ps1`** 接入 AO-RESUME，監測 bug class（system/app 比值）防第五次復發
- **Soulful**：帳單推翻「$80/年」假設 → hosting **2026-11-12** 硬死線；信箱存續已查證；DNS 13 筆對照表 + 備份三地驗證；2026-06-13 的 716 行 brief 作廢前提接回現況
- **離職單機化**：治理文件改單機（跨機機制保留休眠）；桌機憑證依三項確認結案

## Current state
- health-check **100% (372/372)**；git 乾淨、與 origin 一致（`0bbc6bbd`）
- SG 磁碟 55%／EU 磁碟 56%、load 0.63、ClickHouse 19.6%／Kuma 近 1 小時 **0 DOWN**
- 告警鏈已通：下次出事會進手機，且指向源頭而非下游症狀

## Next steps
1. **買不買 dedicated 機** —— 唯一擋路的決策，同時影響 Soulful 網站去處（死線 2026-11-12）、客服 U6、EU 搬機、退兩台雲端
2. Soulful DNS 搬 Cloudflare（①你在 CF 加 zone → ②我照對照表建 13 筆 → ③你核對 → ④你改 nameserver）
3. **未查**：SG load 3.2 於 2 核機器，由 `dockerd`+`containerd` 而非任何容器造成。session 開始即存在（我當時追磁碟問題時漏掉），無使用者影響

## Open tasks (auto-generated at 08:00 TPE)
- [ ] **【待套用｜DB migration】migration 0060 apply 到 EU Supabase prod**
- [ ] **【未開始｜Phase 1 MVP】Cold Outreach Workbench — 冷開發完整鏈**
- [ ] **【進行中｜軟體先行·U0 完成】全自動客服系統**
- [ ] **【gated｜8月｜EU→Dedicated 搬機 + 整併退雲端】**
- [ ] **🔴【資安｜離職善後】公司桌機退場憑證盤點與輪替決策**
- [ ] **【gated｜8月｜等買二手機才繼續建 customer service U6 Chatwoot】**
- [ ] **【明日 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後**
- [ ] **【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動**
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交**
- [ ] **【人工｜Postiz 測試草稿清理】**
- [ ] **【操作者｜Postiz 帳號 → 客戶 Hub 連結】**
- [ ] **【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批**
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測**
- [ ] **【明日】soulfulexpression.org 遷移到 Cloudflare（DNS 先、registrar 後）**
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN Stage 0 閉環已驗，Stage 1 進行中**
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**
- [ ] **【POD A1 已完工｜剩 e2e + A2】**
- [ ] **【POD A2 confirm phase】**
- [ ] **smoke 04-onboard spec 補 app session 登入**
- [ ] **wp-bridge 續做 operation：featured image / update-existing-post / product update+delete**
- [ ] **【POD Studio 自建動工】**
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】**
- [ ] **TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，R0 已批方案A）**
- [ ] **【診斷】Mockup Studio 功能異常**
- [ ] **🎨 Image Output Pipeline（Tarot/POD 色調→WebP/CMYK PDF/Fabric.js Canvas）**
- [ ] **SEO/GEO 引擎產品化 + Soulful 定位/文章**
- [ ] **Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint)**
- [ ] **wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售**
- [ ] **M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap**
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做）**
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）**
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）**
- [ ] **app.aware-wave onboarding/provisioning IA 重整**
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤**
- [ ] **既有站接手（Soulful Expression Art Therapy）**
- [ ] **既有站接手 Day 1（Soulful Expression）**
- [ ] **蒙古客戶 Cloudways 實際建站：待客戶刷卡配合**
- [ ] **新站建置（Scenery Travel Mongolia）**
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）**
- [ ] **Next-Gen 試點**
- [ ] **`tenants/templates/` v2**
- [ ] **`lobster-factory` A10-2 商業閉環實跑**
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**
- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制**
- [ ] **三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability）**
- [ ] **【bug class｜2026-08-12 開出】`Resolve-Path` 未用 `-LiteralPath`**
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】**
- [ ] **（Phase 4 觀察期）AwareWave 自動告警維修系統 v3.2**
- [ ] **建立跨國稅務與法遵顧問審核流程（法律文件外部審核）**

## Yesterday context
最後 WORKLOG 紀錄為 2026-08-12 monthly-system-review：gates=SKIPPED (ReportOnly)；Supabase memory 34.26%（< 85% 健康）。無當日人工操作記錄，系統定期巡檢正常。

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-08-15 21:17:20`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260815-211715.md`
- Closeout: `reports/closeout/closeout-20260815-211720.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)

| 系統 | 隔離機制 | 狀態 |
|---|---|---|
| Ops Clients `/ops/clients/[slug]` | URL slug → server-side org lookup | ✅ 無洩漏 |
| Outreach | `?org=UUID` + `effectiveOrgId()` + `assertOrgAccess()` | ✅ 無洩漏 |
| Credentials | S2 batch-5 已修 | ✅ 無洩漏 |
| Build Runs | S2 batch-5 已修 | ✅ 無洩漏 |
| Approvals | S2 batch-5 已修 | ✅ 無洩漏 |
| Content Drafts | **S2 batch-6 本次修** | ✅ 修後無洩漏 |
| Content Sources | 全域共享（設計如此，無 org 欄） | ✅ 設計正確 |
| ops/repairs/* | ❌ repair_runs 無 organization_id 欄 | ⏳ defer S3 DB migration |

**Stage 1 onboarding 現況**: 前端程式「跳回第一步」bug 已在前一個 session 修好（handleTriggerBuild 加了 guard + error display）。2 筆卡住的 intake_forms 仍在 DB 待手動 retry。

---

### fix(security): S5 — assertOrgAccess guards on social + integrations routes ✅

**根本問題**: 5 個 API 路由以 `clientId` / `organizationId`（= org UUID）作為查詢/寫入鍵，但只有 ops-role gate（無 tenant-level org guard）。Client org 的 owner/admin/operator 若通過 role gate，可傳入任意 org UUID 讀取/修改其他租戶的 Postiz 社群連接或 integration binding（IDOR）。

**已修改**:
- `app/api/content/social-publish/route.ts` — POST：`clientId`（org UUID → `social_postiz_connections.client_id`）加 `assertOrgAccess(req, clientId)` after role gate + string validate
- `app/api/content/social-channels/route.ts` — GET：同樣呼叫 `listIntegrations(clientId)` → 加 `assertOrgAccess(req, clientId)` after query param validate
- `app/api/content/social-admin/connections/route.ts` — POST + DELETE：`clientId`（same FK）→ 各加 `assertOrgAccess(req, clientId)`
- `app/api/ops/integrations/route.ts` — POST：`organizationId` body param → 加 `assertOrgAccess(req, organizationId)` after `verifyOwnership`；PATCH：fetch record by `id` → 加 `assertOrgAccess(req, current.organization_id)` post-fetch

**guard 語意**：
- `staff`（`x-ops-user-kind` absent/staff）→ `assertOrgAccess` no-op，保持跨租戶管理能力
- `client`（`x-ops-user-kind: client` + `x-ops-org-id: <uuid>`）→ `targetOrgId ≠ ctx.orgId` 時 throw OrgAccessError → 403
- null/undefined targetOrgId 對 client fail-closed（`String(null)` = `"null"` ≠ real UUID）

**驗證結果**:
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit | exit=0 | ms=~8000 — 0 type errors
- REALTEST_EVIDENCE: tool=Bash | cmd=npm test --run | exit=0 | ms=1710 — 568/568 pass
- REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/0n — 6 focus areas all clean: guard ordering correct in all 4 files, null-safe inputs, assertOrgAccess null targetOrgId fails-closed, PATCH TOCTOU safe (immutable PK), no role-gate bypass path, all routes covered by middleware matcher
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=listIntegrations,social_postiz_connections,tenant_integration_bindings | hits=1 new finding (social-channels was also calling listIntegrations with unguarded clientId → patched same batch; webhooks/tenant-integration has no clientId param — safe)
- WORKLOG: 本條目

---


### Agent dispatch log
- critic: Critic review hook runner v2
- Explore: 調查三個 ops 頁面真實狀態

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

_Last synced: 2026-08-15 13:19:29 UTC_

