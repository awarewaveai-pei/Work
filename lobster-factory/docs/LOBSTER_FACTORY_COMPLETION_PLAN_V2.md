# Lobster Factory Completion Plan v2

> 目的：把「尚未完成」拆成可執行順序，並定義每一步的驗收與回滾，避免卡在抽象待辦。

## 0) 執行原則
- 先小範圍可驗證，再擴大。
- 每一步都要有 DoD（Definition of Done）與回滾策略。
- 所有高風險操作維持 `staging-only` 與人工核可。

## 1) Milestone 順序（唯一建議順序）

### M1 - DB 寫入最小打通（workflow_runs only）
**目標**
- 只打通 `workflow_runs` 真寫入，其他仍維持保守模式。

**DoD**
- `validate-workflow-runs-write.mjs --execute=1` 在 staging PASS。
- 可在 Supabase 查到正確 row（含 trace/時間戳）。
- 失敗時可安全重試，不產生重複污染資料。

**回滾**
- 關閉 `LOBSTER_ENABLE_DB_WRITES`。
- 清理本次測試資料（以 traceId 或測試 id 篩選）。

### M2 - package_install_runs lifecycle 完整流
**目標**
- 打通 `pending -> running -> completed/failed/rolled_back`。

**DoD**
- `validate-package-install-runs-flow.mjs --execute=1` PASS。
- 狀態轉移符合預期，無非法躍遷。
- 失敗路徑會留下可追蹤錯誤資訊。

**回滾**
- 回復到僅 `workflow_runs` 寫入模式。
- 停用該次流程入口，保留調查證據。

### M3 - apply-manifest 執行器實作（staging-only）
**目標**
- 真正執行 manifest steps（shell/provision）但鎖在 staging。

**DoD**
- 乾跑與實跑結果可比對（差異可解釋）。
- 重要步驟有 timeout/retry 與錯誤分類。
- production path 預設禁止、需額外核可才能啟用。

**Repo 落地（2026-03）**
- Shell：`templates/woocommerce/scripts/install-from-manifest.sh`（`DRY_RUN=1` vs 真 `wp`）。
- Trigger：`LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `LOBSTER_MANIFEST_EXECUTION_MODE=dry_run|apply`（見 `lobster-factory/README.md`）。
- 本機 CLI：`scripts/execute-apply-manifest-staging.mjs`（`--execute=0|1`）。
- **已補（baseline）**：shell 結束後 PostgREST PATCH 終態（`completed` / `failed`）；C2-3 本機 rollback 腳本（plugin 反向 deactivate，可選 `ROLLBACK_DEEP`）。**仍建議**：失敗時由 runbook 觸發 rollback CLI 或還原快照（尚未全自動串進 Trigger）。

**回滾**
- 一鍵回到 dryrun-only。
- 停止排程/入口，保留 logs + artifacts。

### M4 - hosting provider adapter
**目標**
- `create-wp-site` 可建立 staging site/env。

**DoD**
- 最少一個 provider adapter 可成功建站與初始化。
- site metadata 與 workflow 記錄一致。
- 失敗時能清理半成品資源。

**回滾**
- 退回 mock adapter。
- 停用自動建站入口。

### M5 - E2E 可運營驗收
**目標**
- 從新客戶輸入到可驗收交付，跑完一次完整流程。

**DoD**
- 端到端腳本/流程一次 PASS。
- 有完整證據：報告、狀態、關鍵 log、決策紀錄。
- 回歸測試清單可重跑且穩定。

**回滾**
- 凍結新變更，回到前一個 PASS milestone。
- 問題分類後再開下一輪。

## 2) 每日執行節奏（避免分心）
- 每天只選一個 milestone 的一條子任務。
- 開工先跑必要 gate，收工回寫證據到 `agency-os/WORKLOG.md` 與 daily note。
- 若 gate FAIL，當天只做修復，不推進新功能。

## 3) 驗收指令基線
> `<WORK_ROOT>` 依機器替換，例如 `D:\Work` 或 `C:\Users\USER\Work`。

```powershell
node <WORK_ROOT>\lobster-factory\scripts\bootstrap-validate.mjs
node <WORK_ROOT>\lobster-factory\scripts\validate-manifests.mjs
node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs
node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```
