# Conversation Memory

> Historical snapshot note: this file preserves cross-session context and may include decisions from older process versions. For current operating rules, use event SSOT docs: `docs/overview/REMOTE_WORKSTATION_STARTUP.md` (AO-RESUME/startup、**§2.5 日內 Git 節奏**) and `docs/operations/end-of-day-checklist.md` + `.cursor/rules/40-shutdown-closeout.mdc` (AO-CLOSE/shutdown). Agent-enforced Git detail: `.cursor/rules/50-operator-autopilot.mdc` §7.

## Current Operating Context
- **2026-04-02（ADR 006 migration）**：已新增 **`lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`**（Clerk↔org 對照表、JWT org claim、`user_has_org_access` 擴充、多表 SELECT RLS）；ADR 006 已補 JWT／staging 驗證說明。
- **2026-04-02（長期 §9–10）**：`LONG_TERM_OPERATING_DISCIPLINE.md` **§9** 為 **AI／MCP 輔助邊界**；**§10** 為 **執行節奏表**（閘道／ADR／釋出／開收工／雙機／audit + 12 個月 ADR 006 錨點）。
- **2026-04-02（ADR 006 + 閘道）**：**006** 多租戶 **RLS／租戶鍵** 與 **Clerk 對照** 原則。`verify-build-gates` 已內建 **`verify-adr-index.ps1`**。見 `docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md`。
- **2026-04-02（工具退役）**：已將 **Linear** 從 repo **完全移除**（含腳本/文件/產物/`mcp.json` server/歷史文字），並以 `doc-sync` + health 100% + `verify-build-gates` PASS 驗證後推送 `origin/main`（避免再出現 401/衝突/殘留入口）。
- **2026-04-02（ADR 004／005）**：**004** Trigger vs n8n 編排邊界（以 `MCP_TOOL_ROUTING_SPEC.md` 為準）。**005** Supabase SoR vs WordPress 執行期 DB。見 `docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`、`005-supabase-sor-vs-wordpress-runtime-db.md`。
- **2026-04-02（ADR 002／003）**：**002** 應用層預設 **Clerk**，邊界見 `docs/architecture/decisions/002-clerk-identity-boundary.md`。**003** 否決 manifest **自動雙邊同步**，見 `003-no-automated-manifest-dual-sync.md`。
- **2026-04-02（ADR 001）**：**Manifest SSOT** = `lobster-factory/packages/manifests/`；**install／rollback shell SSOT** = `lobster-factory/templates/woocommerce/scripts/`；**`agency-os/platform-templates/woocommerce/manifests/`** 僅輔材。見 **`docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`**。
- **2026-04-02（長期營運正本）**：新增 **`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`**（30 年級可驗證紀律）與 **`docs/architecture/decisions/README.md`**（輕量 ADR）；已接入 `AGENTS.md`、`README`、`CHANGE_IMPACT_MATRIX`。
- **2026-04-02（租戶模板 v1）**：`tenants/templates/core/` 新增 **`DEPARTMENT_COVERAGE_MATRIX.md`**（企業多部門 → 檔案路由）與 **`CROSS_BORDER_GOVERNANCE.md`**（跨境／外包／審閱索引）；`PROFILE`／`FINANCIAL_LEDGER` 補幣別與多幣別欄；意圖是 **30 年可維護**：擴欄位不複製政策全文，政策仍在 `docs/operations/`。
- **2026-04-02（Git 節奏）**：**§2.5** 為人類可讀 SSOT——日內里程碑由代理**自動**本機 `commit`（`commit-checkpoint.ps1`，不 push）；**預設 push** 仍在 **`AO-CLOSE`**。舊敘述「平常不 commit」已廢止（見下方 2026-03-28 歷史列之註記）。
- 你正在建立多客戶網站與系統代營運模式
- 服務線：建置、維運、行銷、自動化、WordPress 客製系統
- **2026-03-31 補充**：已確立「Single Owner」為最高執行原則（除非必要，一份內容只允許一個 Owner File）；並新增 `doc-sync` 自動檢查（registry: `docs/operations/single-owner-registry.json`）避免重複內容回流。
- **2026-03-31 補充**：Single Owner registry 已擴充到開工/收工關鍵段落（AO-RESUME 主流程、30 秒自檢、AO-CLOSE 硬性 Gate），改由 closeout 自動檢查重複。
- **2026-03-31 補充**：`lobster-factory` A9 baseline 已完成（lifecycle + IAM + audit automation），並接入 bootstrap gate。
- **2026-03-31 補充**：A9 供應商策略已鎖定為 AWS-ready（R2 primary + S3 compatible，presigned PUT 單一契約），避免早期綁死供應商。
- **2026-03-31 補充**：已新增 `R2_TO_S3_MIGRATION_RUNBOOK` 並接入 A9 驗證，確保日後轉 AWS 有標準步驟與回滾，不需重做 workflow。
- **2026-03-31 補充**：已完成 P1/P2 跑道加速（Run ID 對照規格 + preflight 腳本 + 證據骨架初始化），可直接進入實跑。
- **2026-03-31 補充**：P1 最小實跑已完成：舊 `company-a` 示範資料與舊骨架已清除，改用 `company-p1-pilot` 建立新 tenant/site/project，並產生新證據路徑 `reports/e2e/onboarding-a10-2/20260331-214650-company-p1-pilot-2026-010-p1-pilot/`。
- **AO-RESUME 明日必回報提醒**：開場必先提醒並檢查 `reports/e2e/onboarding-a10-2/20260331-215507-company-p1-pilot-2026-010-p1-pilot/02-a10-2-evidence.md` 與同目錄 `03-run-id-map.md`（A10-2 pending 列），再決定是否直接啟動 A10-2。
- **AO-RESUME 雙機提醒（使用者明示 + 未勾 `TASKS` 前持續報）**：**另一台電腦**須跑完 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5**（**含 §1.5.1**：Windows 筆電須補 **MariaDB.Server + PHP.PHP.NTS.8.4 + `setup-wp-cli-windows.ps1` + `bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`**，與 Supabase／MCP **分列**），然後在 **monorepo 根**執行 `powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin` 至 **PASS（無 WARN）**，再勾 **`TASKS.md` → Next**「（AO-RESUME 提醒）雙機環境對齊」。在該項**仍未勾選**期間，每次 `AO-RESUME` 回覆的 **「下一步」**（必要時 **「目前進度」**）**必含一行專門口頭提醒**上述 §1.5 + **§1.5.1** + audit（見 `.cursor/rules/30-resume-keyword.mdc` 第 7、8 點）。要點仍含：`gh`、vault／MCP 每台重設、**§2** 例行節奏。
- **2026-04-01 補充（雙機／筆電）**：使用者已表明**公司桌機基樁較完整、筆電要補**——在「雙機環境對齊」未勾選前，**每次 `AO-RESUME` 務必**提醒筆電完成 **§1.5.1**（MariaDB／PHP／WP-CLI／bootstrap）；MCP 工具庫存旁註見 **`docs/operations/cursor-mcp-and-plugin-inventory.md` §4**（強調非 MCP、不取代 Supabase）。
- **2026-04-01 補充（環境 SSOT）**：「可驗證的完美環境」定義與指令見 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §6.2**；稽核腳本 **`scripts/machine-environment-audit.ps1`**（`-FetchOrigin`、選用 `-RunVerifyGates`、`-Strict`）。例行 **`npm ci` 目錄為 `lobster-factory\packages\workflows`**（根目錄無 package-lock，舊文件寫「在 lobster-factory 根 npm ci」為誤）。

## Confirmed Priorities
1. 先建完整可複製框架，不做精簡版
2. 補齊財務、人力外包、SOP、資安事件應變、客戶邊界管理
3. 需要「每接一案從零到完成」模板套裝
4. 需要跨會話記憶，避免每次重講

## Progress Snapshot
- 已建立 Agency OS v1 基礎文件與政策模板
- 已建立 project-kit 接案模板骨架
- 已建立 Cursor 規則，要求會話先讀記憶與進度文件
- 已整合同事制度中的啟動順序與日記型記憶模式
- 已新增安全政策，禁止文件保存明文憑證
- 已建立 tenants v2 骨架（tenant-template + site-template + company-a sample）
- 多租戶骨架已收斂為 `company-a` 單一實際 tenant（其餘示範 tenant 不保留）
- 已開立第一個專案：`company-a/projects/2026-001-website-system`
- 已完成 `2026-001` Discovery 初版與里程碑日期初版
- 已完成系統級操作文件（System SOP、New Tenant Onboarding SOP、Service Packages、CR Pricing）
- 已建立 MSA/SOW/CR 模板，補齊售前到變更文件鏈
- 已建立 WordPress / n8n / KPI&毛利規範文件，補齊交付與營運標準
- 已建立 docs 分類與文件連動矩陣，修正「改一份不會同步」問題
- 已建立自動同步與結案自檢流程（AutoDetect + Watch + closeout report）
- 已補上每公司排程自動化（schedule/queue/runner/register）
- 已補上國際化治理模組（global delivery/compliance/multi-currency/QA gate）
- 已建立系統健康檢查腳本，最新檢查分數 100%
- 已建立 System Guard（關機前/每日/開機後）與狀態告警檔
- 已加上桌面彈窗 PASS/FAIL 與亂碼防線（自動檢測 + 阻擋同步覆寫）
- 已建立可販售產品化藍圖、買方交接清單與打包腳本
- 已建立英文化對客模板（Proposal/SOW/Monthly Report）
- 已建立客戶風險評分模型、外包評分卡、leads/scraping 合規清單
- 已建立 release notes/upgrade path/migration checklist，補齊升級治理
- 已建立 Agency Command Center 與多平台架構，並保持 WordPress-first 策略
- 已完成一輪本機安全檢查（未見常見遠控軟體活動）
- 已確認 RDP 關閉，Lenovo Now 移除
- 已完成結構收斂：政策文件位於 `docs/operations/`，核心腳本位於 `scripts/`
- 已建立 `company-a` 客戶 package 1-4 使用指南（總司令/客戶/工具/自動化）
- 已將 `.cursor/rules` 納入 watch 與連動矩陣，規則更新可自動進入 closeout 檢查
- 已新增 health `Critical Gate` 與 guard gate 條件（關聯缺漏與缺檔不可帶過）
- 已新增完整系統介紹文件：`docs/overview/agency-os-complete-system-introduction.md`
- 已新增續接關鍵字規則 `AO-RESUME`（下次開啟可快速回到進度）
- 已新增收工關鍵字規則 `AO-CLOSE`，並固定開工摘要格式（Yesterday/Today/Confirm）
- 已新增 `.cursor/rules/README.md` 作為 rules 使用手冊
- 已修復 `AgencyOS-*` 排程路徑漂移（舊路徑 -> `D:\Work\agency-os`）與命令引號問題
- 已在健康檢查加入排程路徑存在性檢查，避免路徑失效未被偵測
- 已針對架構期停用 `company-a` adhoc 輪詢（保留可隨時重啟）
- 已完成 workspace 降載（移除高噪音根目錄 + watcher/search exclude）以降低 Cursor OOM
- 已新增 `scripts/archive-old-reports.ps1`，建立 reports 保留與歸檔機制
- 已修正 `RESUME_AFTER_REBOOT.md` 路徑與續接流程（統一 `AO-RESUME`）

## Today (2026-03-30 晚) — Cursor 規則與外掛
- 落地 **`00-CORE.md`（完整）+ `63.mdc`（精簡 alwaysApply）**；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 掛入 **`verify-build-gates`** 與 **`doc-sync`**；health **343** 檔包含 monorepo 根 **`63–66`** SHA256 對齊。
- **1Password**：專案採 **DPAPI vault + env/mcp**；已刪 Cursor **`plugins/cache/.../1password`**；請於 IDE **停用**外掛免再載入。

## Next Step
- 與客戶確認 `2026-001` Discovery 阻塞項（決策者/窗口、品牌定位、CR 估價基準、權限交付）
- 以新客戶實跑一次 `NEW_TENANT_ONBOARDING_SOP` 並微調
- 盤點並輪替曾出現在文本中的 API keys/token
- 先選 1 家公司完成真實資料填寫與第一案啟動
- 將 Defender 排程固定到夜間，避免白天高噪音
- 以系統管理員身分套用 Defender 排程變更（目前權限不足）
- `company-a` 真實資料填寫與流程實跑（CR/排程/報告/守護）
- 在 `README.md` 首頁加入 `AO-RESUME` / `AO-CLOSE` 快速操作卡
- 進行一次完整「開工 -> 收工」演練並回寫 WORKLOG

## Today (2026-03-25) - 重點進度
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
- 已重讀 `docs/spec/raw` 三份 master 規格並完成差距盤點；已把缺口回寫到 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`
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

## Remaining - 需要接下來做完的事（依序）
1. ~~為 `lobster-factory` 接上「只寫 `workflow_runs`」的真寫入流程~~（C1-1 已 execute PASS）
2. ~~接上 `package_install_runs` 的狀態更新~~（主線 C1-2 PASS：`206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；公司桌機複核：`ae8c6e48-fac9-4ac6-8721-d142c831c620`；failed/rolled_back 產品化仍待補）
3. ~~C1-3 DB 寫入韌性 execute~~（主線已 PASS，見 checklist）
4. 把 `apply-manifest` 的 shell 執行器真正串上（仍需維持 `staging-only` + guardrails），並確保 rollback 可用
5. 接回 `create-wp-site` 的 staging 環境建立流程（需要後續 hosting provider adapter）

## Tomorrow (2026-03-26) - 建議第一優先
- 先跑一個 end-to-end「乾跑」payload（不寫 DB），確認回傳的 SQL template + row payload 完整且欄位對齊
- 再開啟真寫入一次（建議只開 `LOBSTER_ENABLE_DB_WRITES=true` 並先寫 `workflow_runs`），用你手上的 Supabase UI 查表插入是否正確
- 把所有「驚險步驟」都留在人機核可/approval 設計裡，不允許 production 自動執行

## Runbook Commands (明天照跑)
你有兩種模式：`Strict`（安全最大）與 `Fast`（速度優先但仍有門檻）。
以下命令中的 `<WORK_ROOT>` 請替換為本機實際路徑（例如 `D:\Work` 或 `C:\Users\USER\Work`）。

### 開工前（雙機必做；早於 `AO-RESUME` 讀檔）
`AO-RESUME` 會先檢查並嘗試 `git pull --ff-only`，但若本機有未提交變更/衝突仍可能失敗；為求穩定，另一台 **AO-CLOSE** push 後本機仍建議先手動對齊 `origin/main`：
```
cd <WORK_ROOT>
git fetch origin
git pull --ff-only origin main
```
（若 `push` 曾與遠端分叉：`git pull --rebase origin main`。完整說明：`docs/overview/REMOTE_WORKSTATION_STARTUP.md` — **新機 §1.5**、**例行 §2**。）

### Strict Mode（推薦，確保今天/明天不出問題）
1. Phase 1 基線健檢
```
node <WORK_ROOT>\lobster-factory\scripts\bootstrap-validate.mjs
```
2. manifest 顯式驗證（只驗 JSON 結構與 guardrail）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-manifests.mjs
```
3. governance 顯式驗證（驗 agent/policy JSON）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs
```
4. apply-manifest 乾跑（不寫 DB，只輸出 payload + SQL template）
```
node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```
5. apply-manifest 乾跑驗收（失敗即停，`--mode=strict`）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```

### Fast Mode（快、但仍有關鍵門檻）
1. manifest 顯式驗證
```
node <WORK_ROOT>\lobster-factory\scripts\validate-manifests.mjs
```
2. governance 顯式驗證
```
node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs
```
3. apply-manifest 乾跑（不寫 DB）
```
node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```
4. apply-manifest 乾跑驗收（`--mode=fast`，失敗即停）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=fast --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```

## Memory Update Protocol
- 每完成一個里程碑就新增一段摘要
- 對話內容很長時，用以下格式壓縮：
  - 背景
  - 已完成
  - 未完成
  - 風險
  - 下一步

## Today (2026-03-30) - Lobster C1-2
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`，`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`，flow pending→running→completed）。
- `bootstrap-validate.mjs`：PASS。主檢查清單 **C1-2** 已勾選。

## Today (2026-03-26) - AO-CLOSE
- **`AO-CLOSE` 關鍵字與四段收工回覆格式不變**；**`ao-close.ps1`**（雙路徑同內容）預設：`verify-build-gates` → `system-guard`（doc-sync+health+guard）→ `generate-integrated-status-report` → **PASS 後** `git commit`／`git push`，讓公司機 **`pull` 即完整**；`-SkipPush`／`-SkipVerify` 為選用。
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

## Today (2026-03-27) - V3 規格整合
- 已匯入新文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`。
- 已建立可執行整合計畫：`D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（20 OS 模組映射、P0/P1/P2 優先順序、驗收訊號）。
- 已在 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md` 新增 `H) MASTER V3 整合追蹤`，作為後續落地與完成證據掛點。
- 目前執行策略：先不打斷 `C1-2`，維持 `C1-2 -> C1-3 -> V3 skeleton sprint` 順序。

## Today (2026-03-27) - C1-2 execute 完成
- `validate-package-install-runs-flow.mjs --execute=1` 已實跑成功（目標專案 URL 已切至可連通專案）。
- 結果：`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`，狀態流 `pending -> running -> completed`。
- 阻塞修復：補齊 `environments` fixture（`environment_id=555...`），並改用已存在 `workflow_runs.id` 作為 `workflowRunId`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ⏳`（下一步）。

## Today (2026-03-27) - C1-3 execute 完成
- `validate-db-write-resilience.mjs --execute=1` 已實跑成功（以 vault 自動注入 Supabase env）。
- 結果：`ok: true`、`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ✅`，可進入下一主線（V3 skeleton sprint / C2）。

## Today (2026-03-27) - H3 skeleton sprint Batch 1
- 已完成 V3 缺口模組第一批骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 落地檔案：`0007_v3_skeleton_modules.sql`、`v3-skeleton.ts`、`v3-module-skeleton-workflows.ts`、`V3_MODULE_SKELETONS.md`。
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H3` 已勾選完成。

## Today (2026-03-27) - H4 Decision baseline 完成
- 已完成 Decision Engine recommendations baseline：
  - migration：`0008_decision_engine_recommendations.sql`
  - contract：`decision-engine-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H4` 已勾選完成。

## Today (2026-03-27) - H5 CX baseline 完成
- 已完成 CX retention/upsell baseline（與 `workflow_runs` 串接）：
  - migration：`0009_cx_retention_upsell_baseline.sql`
  - contract：`cx-retention-upsell-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H5` 已勾選完成。

## Today (2026-03-27) - Zero-cost Secrets Vault
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

## Today (2026-03-28) - 報表路徑收斂 + AO-CLOSE
- 已落地報表單一路徑：所有入口強制寫入 `agency-os/reports/*`，root `reports/*` 退役；commit `5128e7d`（收工腳本會一併 push）。
- 使用者關切：Cursor `user-copilot` MCP 認證重試迴圈不會等同模型 token 計費，但會耗少量本機資源；可停用該 MCP 項止刷 log。
- 收工：執行 `AO-CLOSE`（`ao-close.ps1`）完成 verify + guard + integrated status + push。
- **Git 節奏（2026-03-28 紀錄；已 superseded 2026-04-02）**：當時共識為「平常不主動 commit」——已改為 **§2.5**：里程碑本機 checkpoint + **AO-CLOSE** push。請勿再以本行為準。

## Today (2026-03-28) - Lobster operator bundle（營運套裝）
- `lobster-factory`：`npm run operator:sanity`（`validate` + `regression:staging-pipeline`）、`npm run payload:apply-manifest`（`print-apply-manifest-payload.mjs`）。
- 操作手冊：`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`；README 頂部已掛「營運一鍵」。
- 閘道：`bootstrap-validate` 與 `validate-workflows-integrations-baseline.mjs` 已納入上述檔案與字串檢查；`npm run validate` PASS。

## Today (2026-03-29) - 續接驗證
- 使用者「好」＝執行：`git pull`（up to date）、`verify-build-gates` PASS、health **100%**（`health-20260329-221913.md`）、`npm run operator:sanity` PASS。

## Today (2026-03-28) - AO-CLOSE（晚）
- **AO-CLOSE** 完成：`verify-build-gates` PASS、health **100%**、`system-guard` PASS、integrated-status 已產出；**Git** `e04be6f` 已 **push `main`**。

## Today (2026-03-28) - A10-2 前置（SOP Step 7 + presign 範例）
- `NEW_TENANT_ONBOARDING_SOP` Step 7、presign 範例 JSON、`PRESIGN_BROKER_MINIMAL`；operable gate 綁定 monorepo SOP。

## Today (2026-03-28) - Lobster A10-1 + A9 policy
- `OPERABLE_E2E_PLAYBOOK.md`、`validate-operable-e2e-skeleton.mjs`（bootstrap）、`ARTIFACTS_LIFECYCLE_POLICY.md`；`MASTER_CHECKLIST` A10-1/A10-2、A9 更新敘述。

## Today (2026-03-28) - Monorepo spine + dashboard refresh
- Repo 根 `README.md`（AO + Lobster + `verify-build-gates`）；`EXECUTION_DASHBOARD` §2 去過期；`MASTER_CHECKLIST` A6/B5 對齊 `http_json`／`remote_put`；`verify-build-gates` + doc-sync PASS。

## Today (2026-03-28) - Lobster A9 remote_put artifacts
- `LOBSTER_ARTIFACTS_MODE=remote_put` + `REMOTE_PUT_ARTIFACTS.md`；presign URL 或 inline JSON；`apply-manifest` 寫 `logs_ref` 行為與 local 一致。

## Today（補登）- 規格原文目錄 `docs/spec/raw`
- 使用者出示 **檔案總管**：`D:\Work\docs\spec\raw\` 內四份 **.md** 為設計**原文**（含 **`LOBSTER_FACTORY_MASTER_V3`** 內 Agency OS **20 個 OS 模組** 圖，即跨國企業級職能拆分來源）。已在 monorepo 根新增 **`docs/spec/README.md`** 索引，並在根 **`README.md`**、**`agency-os/README.md`** 加上導覽；說明其與 **`MCP_TOOL_ROUTING_SPEC`**（少列＝執行閘道）為不同層級。

## Today (2026-03-30) - cursor-mcp inventory：純 Supabase／SoR 敘述
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：使用者要求 **本檔不出現任何第三方表格式工具名稱**；已刪除該列與所有相關段落／SSOT／Related 連結。**supabase** 兩欄改為**自足**寫法：平台 SoR、RLS／Storage／Webhook、MCP 與 `read_only` 邊界、以及對 [`MCP_TOOL_ROUTING_SPEC`](../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 中 Trigger／n8n 分工的對齊。**`change-impact-map`** 已取消本檔 ↔ migration playbook 的強制連動（health 仍 100%）。

## Today (2026-03-28) - Lobster `http_json` hosting
- `LOBSTER_HOSTING_ADAPTER=http_json` + `HTTP_JSON_HOSTING_ADAPTER.md`；`provisionHttpJsonStaging`；`create-wp-site` 支援 `vendor_staging_provisioned` 與 `vendorStaging`；`resolveStagingProvisioning` 為 async。
- **互動偏好**：可驗證範圍內代理自主推進、減少選項式追問；不可逆決策仍單點確認。

## Related Documents (Auto-Synced)
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/10-memory-maintenance.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-04-02 09:46:10 UTC_

