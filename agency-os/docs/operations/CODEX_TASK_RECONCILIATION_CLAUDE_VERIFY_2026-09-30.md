# Codex tasks 對帳｜Claude 驗證包

狀態：`PENDING_CLAUDE_VERIFY`  
日期：2026-09-30  
範圍：`D:\Work` 本輪 tasks 對帳、舊規劃衝突清理、Cursor 退場同步、資安 gate 核對。

> 2026-09-30 續作註記：第 1 節的 `117 open / 389 done` 是前一批快照，不是目前即時總數；後續實作與暫停點以第 6 節為準。不得拿舊總數當驗收證據。

## 1. 結果摘要

- 即時 `agency-os/TASKS.md`：`117 open / 389 done`。
- 已勾選：Cursor 舊操作散文同步（task 759）、Soulful 舊 staging abandon 計畫同步（task 862）。
- 未批量勾選：過時的 gitignored `open-tasks-snapshot.md` 仍報 119 open；以 live `TASKS.md` 為準。
- 未使用 subagent；沒有 production deploy、production DB 寫入、credential rotation 或 commit/push。

證據：[TASKS.md](../../TASKS.md)、[WORKLOG.md](../../WORKLOG.md)；本輪紀錄見 `WORKLOG.md:3-18`。

## 2. 實際修改

### 2.1 現行 workflow 收斂

把現行操作文件從「Cursor 開 monorepo」收斂到：

`Claude Code / Codex` → `CLAUDE.md` + `agency-os/AGENTS.md` → `mcp/registry.template.json` + 根 `.mcp.json` + Codex managed config。

已更新 startup、AO-RESUME、MCP、n8n、收工、雙機、dashboard、30 年 charter、hardening、rules/index 文件，以及相關 governance plans。完整檔案清單以此命令為準：

```powershell
git diff --name-only -- agency-os/TASKS.md agency-os/WORKLOG.md agency-os/docs mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js tests/hooks/runner-parity.test.mjs
```

Cursor 字樣沒有被粗暴刪除：僅保留歷史、退場、禁止重建、CHANGE_IMPACT_MATRIX 對照；不存在的 `BOOTSTRAP.md` 沒有捏造。[REMOTE_WORKSTATION_STARTUP.md:14,159,232](../overview/REMOTE_WORKSTATION_STARTUP.md)、[cursor-enterprise-rules-index.md:3-4,19-21](cursor-enterprise-rules-index.md)

### 2.2 Soulful 舊 staging 計畫

三份仍宣告舊 Hostinger staging 的文件已加作廢標記，改指向現行 `SITE_MIGRATION_RUNBOOK.md` / `CUTOVER_RUNBOOK.md`；沒有改 production。[WORKLOG.md:9-11](../../WORKLOG.md)

### 2.3 Scheduled Task / SystemGuard 高風險 gate

- `mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js`：Scheduled Task mutation / SystemGuard registrar 必須帶 `# CONFIRMED-HIGH-RISK:`。
- `tests/hooks/runner-parity.test.mjs`：加入對應阻擋與確認 token 測試。
- `node --check` PASS。
- 針對 scheduled-task mutation 的測試 PASS（1/1）。
- 完整 runner-parity 尚未宣稱 PASS；先前執行無輸出後停止。

## 3. 不可直接勾選的項目

### 3.1 Staging WP admin password

只讀現場查詢結果：`taskrun_old_output=9`、`taskrun_redacted_output=0`。因此輪換、9 筆 redact、deploy 尚未取得閉環證據，task 171 保持 open。[TASKS.md:171-176](../../TASKS.md)、[WORKLOG.md:8](../../WORKLOG.md)

### 3.2 HF_TOKEN

本輪長度檢查的 PowerShell binding mistake 將目前 token 輸出到工具結果；repo 與後續回覆沒有重複該值，但 token 必須視為再次暴露。請先 revoke/rotate，再以不輸出值的方式驗證存在性；task 232 不可勾選。[TASKS.md:232](../../TASKS.md)、[WORKLOG.md:18](../../WORKLOG.md)

### 3.3 Defender Trojan

現場結果：`Get-MpThreat` 為 `DEFENDER_COUNT=0 ACTIVE=0`；`AgencyOS-SystemGuard-Daily` 為 Ready 且指向 repo launcher/SystemGuard。可是完整 runner gate 與 Claude oracle review 尚未成功，故 task 211 仍 open。[TASKS.md:211-223](../../TASKS.md)、[WORKLOG.md:12-17](../../WORKLOG.md)

### 3.4 Codex hooks trust

Codex `/hooks` trust 仍需操作者在 Codex 開啟 `D:\Work` 執行並信任 AwareWave hooks；task 178 不可由 Codex 代勾。[TASKS.md:178](../../TASKS.md)

## 4. Claude 驗證命令

請在 `D:\Work` 執行，逐項回填 PASS / FAIL / BLOCKED；不要因文件描述直接把資安 task 勾選完成。

```powershell
# A. 狀態與格式
$task='D:\Work\agency-os\TASKS.md'
$open=(Select-String -Path $task -Pattern '^\s*- \[ \]' ).Count
$done=(Select-String -Path $task -Pattern '^\s*- \[x\]' ).Count
git diff --check
"OPEN=$open DONE=$done"

# B. 本輪程式檢查
node --check .\mcp\claude-userlevel\hooks\rules\high-risk-bash-warn.js
node --test --test-name-pattern='scheduled-task mutation' .\tests\hooks\runner-parity.test.mjs

# C. 完整測試；若 hang / timeout，記錄 BLOCKED，不得改寫成 PASS
node --test .\tests\hooks\runner-parity.test.mjs

# D. 現行文件不得把 Cursor 當操作入口；每個命中都要分類
rg -n -i 'Cursor|\.cursor' .\claude agency-os CLAUDE.md mcp tests

# E. 只檢查是否誤加入敏感值；不要讀取或輸出任何 token
git diff --name-only
git diff --check
```

另請依 Claude-first 流程執行 `/claude-review`。若 oracle schema、quota、packet 或 hook trust 失敗，結果必須標記 `BLOCKED`，不可寫成「已 review」。

## 5. Claude 驗收條件

只有同時滿足以下條件才可把本輪記錄標為 verified：

1. `TASKS.md` live count 與實際解析一致；task 759、862 的變更與現行 SSOT 不衝突。
2. 現行文件沒有把 Cursor 當作可執行入口；保留的 Cursor 內容均明確標成歷史／退場／禁止重建。
3. hook syntax 與 targeted test PASS；完整 runner test 若未完成，明確保留 BLOCKED。
4. 沒有新增 token、密碼、私鑰或 credential-bearing output。
5. task 171、211、232、178 的證據狀態沒有被錯誤改成 done。
6. `/claude-review` 產生有效 schema 的 review artifact；否則維持 `PENDING_CLAUDE_VERIFY`。

驗證人：`Claude`  
驗證時間：`待填`  
結果：`待填`  
阻塞：`待填`

## 6. 續作：TASK #672／#677／#889（本次暫停點）

狀態：`PAUSED_BY_OPERATOR`。未使用 subagent；未 commit、push、deploy；未改 production、DB、credentials。

### 6.1 #672 workflows strict typecheck：已完成並勾選

- Task 證據：`agency-os/TASKS.md:672`；工作紀錄：`agency-os/WORKLOG.md:14-25`。
- 新增 package-wide strict typecheck：`lobster-factory/packages/workflows/package.json:15,20,23`、`tsconfig.typecheck.json:1-13`。
- 修正 typecheck 揭露的既有 contract drift：catalog 未配置 manifest fail-close、provisioning source enum SSOT、Trigger task 測試執行 seam；主要證據：`src/db/catalogIds.ts:9-51`、`src/lib/tenant-provisioning/postTenantIntegrationWebhook.ts:1-10`、`src/test-utils/runMockedTask.ts:1-14`。
- 驗證：`npm run typecheck` exit 0；22 files / 143 tests PASS；兩個 mutation sentinel 均能使測試失敗，還原後綠。
- Claude oracle 沒有產生有效 schema（dirty worktree／packet 不完整）；不可把 oracle 記為 PASS。請 Claude 直接檢查 diff 與重跑 gate。

### 6.2 #677 app HSTS／Supabase auth cookie Secure：repo 完成，task 保持 open

- Task 證據：`agency-os/TASKS.md:677`；工作紀錄：`agency-os/WORKLOG.md:2-12`。
- 三個 Supabase SSR client 共用 `secure: true`：`apps/next-admin/lib/supabase/auth-cookie-options.ts:4`、`ssr.ts:14,29,63`、`route-client.ts:18,38`；新增 2 個 targeted test files，共 3 tests。
- 依 live ks-aw-01 現行雙層 topology 新增 outer host vhost SSOT：`nginx/system-sites/sg-stack.aware-wave.com.conf:6-35`。HSTS 僅對 `app.aware-wave.com`，`max-age=31536000`，不含 `includeSubDomains`／`preload`；共用 `api` host 不繼承。
- 新增真 nginx probe：`tests/host-scripts/sg-stack-hsts.test.sh:41-46`。throwaway `nginx:alpine` 驗證 syntax、app exact HSTS、api 無 HSTS、HTTP 保留 host/path redirect 全 PASS。
- `npm run typecheck` PASS；targeted 3 tests PASS；排除兩個既有 Windows/WSL bash environment suites 後為 217 files / 2009 tests PASS、13 skipped。原始完整 `npm test` 因該兩 suite 的 exit 127／EPERM 為 exit 1，不得改寫成完整 PASS。
- Live precheck 仍是 app `/` 307、`/login` 200，兩者均沒有 HSTS；production 尚未 rebuild/reload。Task 必須保持 `[ ]`，部署授權與 live 驗收前不得勾選。
- Claude oracle 沒有有效 artifact（packet 不完整且 `.conf` 未被 capture）；不可記為 PASS。

### 6.3 #889 CP950 backlog：只完成第一批 2 檔，task 保持 open

- 舊 task 敘述仍寫「84 個 site」：`agency-os/TASKS.md:882`。2026-09-30 重新跑 auditor 的實際基線是 `scanned=187 clean=161 drift=102`，分布於 26 檔；84 是舊快照，不可依舊數字關單。
- 現行方案不是新造 helper：沿用 `scripts/lib/git-safe-ops.ps1:273-301` 的既有 `Invoke-SafeGitCapture` SSOT。
- 已改 `scripts/check-three-way-sync.ps1`：stash count、repo check、ahead/behind、dirty paths、origin ref／short SHA 全部走安全 wrapper；CJK path 查詢使用 `core.quotepath=false`。證據：`:42-43,63-64,73-80,92-99,110-117,127-128,156-157,184-185`。
- 已改 `scripts/git-audit-tracked-remote.ps1`：加入共用 helper；fetch 走 `Invoke-SafeGitFetch`；HEAD／remote、diff、missing paths、porcelain、remote tree 均安全捕獲且檢查 exit code；path query 使用 `core.quotepath=false`。證據：`:10-12,24-25,34-49,55-57,66-68,78-80,90-92`。
- 每檔修改後立即跑：

```text
audit-cp950-traps -File scripts/check-three-way-sync.ps1       => scanned=1 clean=1 drift=0, exit 0
audit-cp950-traps -File scripts/git-audit-tracked-remote.ps1   => scanned=1 clean=1 drift=0, exit 0
```

- 尚未做：其餘 24 檔／約 83 個目前 drift site；`commit-checkpoint.ps1`、`git-prune-merged-local-branches.ps1` 只完成分類，尚未修改。尚未跑兩支已改腳本的 throwaway-repo behavior fixture、repo-wide audit、AUDIT_REGISTRY 更新、WORKLOG closeout。因此 #889 不可勾選。

### 6.4 Claude 此暫停點的最小驗證

```powershell
# 只驗本批，避免把 dirty worktree 其他 session 的變動混進結論
git diff -- scripts/check-three-way-sync.ps1 scripts/git-audit-tracked-remote.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-cp950-traps.ps1 -File scripts/check-three-way-sync.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-cp950-traps.ps1 -File scripts/git-audit-tracked-remote.ps1

# 驗 #672
Push-Location lobster-factory/packages/workflows
npm run typecheck
npm test -- --run
Pop-Location

# 驗 #677（不得因此部署 production）
Push-Location lobster-factory/infra/hetzner-phase1-core/apps/next-admin
npm run typecheck
npx vitest run lib/__tests__/supabase-ssr-cookie-security.test.ts lib/__tests__/supabase-route-client-cookie-security.test.ts
Pop-Location

git diff --check
```

Claude 結論要求：#672 可依重跑結果驗證；#677 只能標 `REPO_READY / LIVE_PENDING`；#889 只能標 `PARTIAL`。不可把後兩者勾成完成。
