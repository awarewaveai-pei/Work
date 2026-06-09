# Integrated status report (assembled)

- Generated: 2026-06-09 14:57:24
- agency-os root: `C:\Users\USER\Work\agency-os`

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

*Checklist path:* `C:\Users\USER\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`

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

## 5) memory/daily/2026-06-09.md
# Daily Note - 2026-06-09

## Done today
（session window 12:01→14:47）
- **Tarot 牌卡模板改正式直線外框**：棄 6-PNG-overlay 路線，改純 canvas 三色直線框（金/藏青/酒紅）。版式=上羅馬數字／中圖像直接嵌入／下牌名。改 `renderPrintCard.ts`（CardTemplate 7→3 key）+ `TarotStudio.tsx`（預設 gold + label）。tsc 我改的兩檔 0 新錯誤；canvas 像素渲染待 staging 瀏覽器確認。未部署（待操作者 go-ahead）。
- 上午另已完成 ao-close.ps1 四相位重構（commit 1ee4bb4f，見 WORKLOG）。

## Current state
- Tarot 工具框線收尾完成（pivot 至 canvas），TASKS:58 PNG-frame 路線整個失效。
- 改動未 commit（本次 AO-CLOSE checkpoint 會帶上）、未部署。

## Next steps
- 部署 tarot 改動：`/check-drift` → `/verify` → go-ahead → `/sg-deploy` → app.aware-wave.com 點預覽實測三色框 + 羅馬數字/牌名位置。
- POD/MEGA roadmap（TASKS:145-149）續行。

## Open tasks (auto-generated at 08:00 TPE)
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**（5 階段路線圖 SSOT）。✅ Stage 0 建站引擎閉環已驗（run 655197bf completed + curl 200，2026-06-06）。**下一步 = Stage 1 接通入口**：抓 2 筆卡 `spec_generated` 的 intake_forms → retry `POST /api/onboarding/trigger-build` 看精確錯誤碼（最可疑 trigger-build/route.ts L35-39 role 403 或 UI「跳回第一步」沒帶 spec/intake id）→ 對症修 → onboarding UI 走完一筆不碰 DB 達 completed。後續 Stage 2 Fluent Form→intake 橋接+FluentCRM／Stage 3 報價／Stage 4 機層租機(provisionClient 已寫好未接)／Stage 5 串接 Supabase/n8n/Sentry/Netdata/Uptime Kuma/PostHog。**動前 `git log -5` + 讀 WORKLOG（trigger-build 平行 session 觸碰過，VBC）。**
- [ ] POD Studio 路線圖 + tarot 框線收尾（框 png 還沒做好；per-frame 微調 + celestial 補生）→ handoffs/2026-06-06-2026-pod-studio-roadmap.md
- [ ] Content Engine Phase 1 MVP — soulful 試點發第一篇 draft（spec §38/§44；§36 schema + §37 prompts；DataForSEO/Firecrawl 屬 Phase 2 別接）→ handoffs/2026-06-06-2029-tomo-202949.md
- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章（2-Gem: onboarding+content；定位鎖定 Arts Practice for Self-Discovery / Arts-Based Reflective Pedagogy；填真資料→文章可發布；spec §49 errata 待補）→ handoffs/2026-06-06-2044-seo-geo-content.md
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint) — Batch 3 已完成（9f862d82）→ handoffs/2026-05-28-1807-batch-3-post-phase.md
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售 → handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item（Phase4Weekly 錯 repo / incidents API 藏 open / 5 webhook 零流量）→ handoffs/2026-06-05-2017-tomo-201752.md
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**：① M10 orphan reaper（claim 後 trigger 前 crash→卡 running 終態；需 claimed_at 時戳+reaper `dispatch-action-run.ts:157-180`）② partial index `create index concurrently idx_ops_action_runs_pending_dispatch on ops_action_runs(started_at) where status='pending'`
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）** — 程式+真機已驗過，**直接呼叫 `provisionClient()` 勿重寫**。recipe：`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`（app 端 `onboarding/trigger-build/route.ts` 頂部已留指標）。等 app 校正完再接。
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）** — 讓新機/客戶自帶機自動部署成 production 等級（Docker+Grafana/Loki/Netdata/Sentry+快取+swap+備份+限速/WAF/fail2ban）。**料件 90%+ 現成**，缺一個編排器 `provision-stack.sh`（串既有腳本，純 SSH，Vultr/DO/客戶自帶機通用）+ BYO adapter + swap。完整 R0 計畫：`lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`。**禁止重寫既有 compose/腳本，只編排**。→ handoffs/2026-06-06-1925-postboot-stack-deploy.md
- [ ] app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃、Q1-Q3 已決、未動 code）+ verify intake 觸發建站 + Phase 2/3 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [x] **【✅ 2026-06-09 SE-01 已發文】wp-bridge v0.3.0：AI 在 soulful 真站建第一篇草稿（SE-01）** — 真站 post 7053/7056 committed（WORKLOG v0.5.6 entry）；剩餘 operation 見下行。
- [ ] wp-bridge 續做 operation：featured image / update-existing-post / Woo product CRUD → handoffs/2026-06-05-2039-tomo-203931.md
- [ ] wp-bridge v0.5.6 已發佈（Tabs+YouTube+accordion 修復）；驗收 7053/7056 + 選下一步（/blocks 端點 / 樣式參數化 / app.aware-wave Stage 1）→ handoffs/2026-06-06-1929-wp-bridge-v056-shipped.md
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤** —— **【未開始】**
- [ ] **既有站接手（Soulful Expression Art Therapy）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面** staging canonical URL 已入 registry／SITE_PROFILE／`02_EXECUTION_PLAN`。**下一步：**Day 1 Runbook §1.1–1.3（操作者登入）+ **`TASKS`**「Day 2 實機驗收」。
- [ ] **既有站接手 Day 1（Soulful Expression）** —— **【進行中 2026-05-08】§1.2 ✅ §1.3 DB dump ✅**。§1.2 機讀基線完成（commit `b5cef4c`：WP 6.9.4 / PHP 8.2.30 / MariaDB 11.8.6 / Kadence 1.3.6 / 35 active plugins (16 有更新) / 2 admins / 138MB DB / 風險 Top 3）。§1.3 DB dump 完成（`soulful_db_20260508_160734.sql.gz`，15 MB，SHA256 `849db784…`，本機 + `BACKUP_RESTORE_PROOF.md #1`；restore drill 待 staging 建立後執行）。**仍開放（操作者必做）**：§1.1 帳號層級權限確認（Hostinger panel / DNS panel / WP admin browser login，純 SSH 無法驗證 panel-level access）。Day 2 staging 操作指引已備：`DAY2_STAGING_OPERATOR_GUIDE.md`；Day 3 更新計劃已備：`DAY3_SECURITY_PATCH_PLAN.md`。
- [ ] **新站建置（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面**：canonical staging **提案** `https://staging.scenery-travel.mn/` 已寫入 registry／SITE_PROFILE。**下一步：**選定主機商後 Runbook §2 建置實機 + 客戶訪談補 Discovery。
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架 + Discovery 骨架完成。**下一步：**與客戶確認素材與頂級網域，選定主機商 → 銜接 **`TASKS`**「Day 2 雲端 staging 實機驗收」。
- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（兩案）** —— **【未完成】** **DoD：**Soulful：`https://staging.soulfulexpression.org/` 後台可登入 + 關鍵頁可開（Pilot A §2）；Scenery：`https://staging.scenery-travel.mn/`（若網域變更須先更新 registry）同等驗收。**阻塞：**須 Hostinger／選定主機商操作與 DNS／SSL；代理無法代登入第三方面板。
- [ ] `tenants/templates/` v2 —— **【未開始】** **進度：**依試點回填後再開；見 Pilot 條目。
- [ ] `lobster-factory` A10-2 商業閉環實跑 —— **【未開始】**
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**（操作者 2026-06-06 確認方向） — 終點：全部接 WooCommerce 賣貨（參考同事 jonjonesai 的 MEGA「Mass E-commerce Generator & Automator」Streamlit 工具：Research→Idea→Generate(多模型並行)→Select→Process(去背 removal.ai/Tinify)→Mockup(Printful)→Published(WooCommerce+Claude 文案+定價)）。
- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制** —— **【未開始】**
- [ ] **【2026-05-28 開出 — Phase Z 後續 Z4】scan-for-secrets known-suppressed baseline** —— **【未開始】**
- [ ] **【2026-05-28 開出 — Phase Z 後續 Z5】AO-CLOSE health gate 補強（fetch-recency）** —— **【未開始】**
- [ ] 三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability） —— **【進行中】**
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】** —— **【未開始】** 剩餘 7 Major + 9 Minor — 排 Phase 4 觀察期後（2026-06-19+）
- [ ] **（Phase 4 觀察期）AwareWave 自動告警維修系統 v3.2 — Phase 4 觀察期進行中** —— **【進行中】** Phase 1+2+3 全部完成；Phase 4 觀察期到期：2026-06-19。
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）

## Yesterday context
最後 WORKLOG 更新於 2026-06-03，月度系統巡檢 gates=SKIPPED (ReportOnly)，Supabase memory 38.89% 健康，wp-bridge plan deepen + ADR 007 md-only 完成（BUGHUNT_WAIVED）。


### verify-recent --ack (2026-06-09T03:49:10.4465080Z)

**Reason**: Four-phase ao-close refactor fully verified this session: 19/19 collector unit test; SkipPush integration shows 4 blockers batched in one pass + clean report + exit 1; critic Deep verdict=pass on behavior-preservation contract (1 Major Write-Error->Write-Host fixed); syntax OK; cp950 CLEAN; bughunt 0 external deps. See WORKLOG 2026-06-09.

**Acknowledged unverified files** (count=3):

- `c:\Users\USER\Work\scripts\lib\ao-close-gates.ps1`
- `c:\Users\USER\Work\scripts\test\ao-close-gates.Tests.ps1`
- `c:\Users\USER\Work\scripts\ao-close.ps1`

## Closeout inbox (AO-CLOSE auto, verbatim)
<!-- ao-close-inbox-sha256:623db456f797cdc58e4211cb21d25545c228ef90e213cb4ebde9c155a0ffe96a -->

### claude 2026-06-09 11:55

- **完成（一句）**: ao-close.ps1 四相位重構 + 單一品質閘收集器（收工從串行 fail-fast 改為一次報全 blocker，behavior-preserving）
- **變更路徑**:
  - `scripts/ao-close.ps1`
  - `scripts/lib/ao-close-gates.ps1`
  - `scripts/test/ao-close-gates.Tests.ps1`
- **Git**: 1ee4bb4f
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**: clean-path 一次過由本次 AO-CLOSE 實證（dogfood）

## Closeout inbox (AO-CLOSE auto, verbatim)
<!-- ao-close-inbox-sha256:a43a63b55d4f47cdc655b3857249b3722b722ef37fb17a309bffb8b0490c6314 -->

### claude 2026-06-09 14:53

- **完成（一句）**: Tarot 牌卡模板改正式直線外框（棄 6-PNG-overlay，改純 canvas 三色直線框：金/藏青/酒紅；版式=上羅馬數字／中圖像直接嵌入／下牌名）
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/tarot/renderPrintCard.ts`
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/tarot/TarotStudio.tsx`
- **Git**: （本次 AO-CLOSE commit）
- **對應 TASKS 子字串（可選）**: tarot 框線收尾
- **風險／待辦（可選）**: 未部署（待操作者 go-ahead）；canvas 像素渲染待 staging 瀏覽器確認；tarot-frames PNG + middleware 白名單現未使用，保留不刪

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-06-09 11:56:14`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260609-115607.md`
- Closeout: `reports/closeout/closeout-20260609-115613.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)

**[驗證結果]**
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

