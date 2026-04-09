# Work — Agency OS + Lobster Factory

本儲存庫收斂兩條主線：**Agency OS**（治理、客戶與營運 SOP、健康檢查）與 **Lobster Factory**（WordPress 工廠、Supabase、Trigger 工作流程、結構閘道）。

建議用 Cursor／VS Code 開啟 **`Work-Monorepo.code-workspace`**（或將 **monorepo 根**當工作區根；路徑可為 `D:\Work`、`C:\Users\USER\Work` 等），相對連結才能穩定開啟 `docs/spec/raw/` 內原文。

## 目錄

| 路徑 | 用途 |
|------|------|
| [`agency-os/`](agency-os/) | 任務板、文件、排程、`system-health-check` / `system-guard`、租戶模板 |
| [`lobster-factory/`](lobster-factory/) | migrations、manifests、`create-wp-site` / `apply-manifest`、`npm run validate` |
| [`docs/spec/`](docs/spec/) | **規格原文**（長篇藍圖）：含 **20 個 Agency OS 模組**、`Master Spec v1`、企業級底座與 Cursor Pack——見 [`docs/spec/README.md`](docs/spec/README.md) |
| **Cursor（IDE）企業級規則（版控正本）** | [`agency-os/docs/operations/cursor-enterprise-rules-index.md`](agency-os/docs/operations/cursor-enterprise-rules-index.md)（`63`–`66` `.mdc`、MCP／龍蝦 Routing 對齊說明） |
| [`scripts/`](scripts/) | 跨專案腳本：`verify-build-gates.ps1`、`ao-close.ps1` 等 |

## 本機一次驗兩邊（推薦）

在儲存庫根目錄（你的 `<WORK_ROOT>`）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1
```

僅跑龍蝦閘道、略過 Agency 健檢：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1 -LobsterOnly
```

## 建議閱讀與操作順序（降低矛盾、可賣可交付）

下列順序假設你已開在 **monorepo 根**（含 `agency-os`、`lobster-factory`、根 `scripts`）。若只開 `agency-os` 子資料夾，請先用相對連結回到本頁與 `docs/spec`。

1. **本頁** — 結構、`verify-build-gates`、雙機與收工關鍵字。  
2. **他機／首次接線** — [`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`](agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md)（**正式開工**：monorepo 根 **`.\scripts\ao-resume.ps1` exit 0** 後再打 **`AO-RESUME`**；**筆電／新機最短指令見該檔 §1.5**）。  
3. **每日儀表板** — [`agency-os/docs/overview/EXECUTION_DASHBOARD.md`](agency-os/docs/overview/EXECUTION_DASHBOARD.md)（`TASKS` / 綜合狀態 / Gate）。  
4. **人＋代理總則** — [`agency-os/AGENTS.md`](agency-os/AGENTS.md)（`AO-RESUME`／`AO-CLOSE`、MCP 清單入口）。  
4b. **長期營運紀律（建置／換人仍可接）** — [`agency-os/docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`](agency-os/docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md)；重大分岔見 [`agency-os/docs/architecture/decisions/README.md`](agency-os/docs/architecture/decisions/README.md)。  
4c. **30 年級 AI/coding/專案管理短憲章（跨國企業版）** — [`agency-os/docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`](agency-os/docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md)。
4d. **30 年級 AI/coding/專案管理短憲章（客戶精簡鏡像）** — [`agency-os/docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`](agency-os/docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md)。
5. **Cursor 企業規則（版控）** — [`agency-os/docs/operations/cursor-enterprise-rules-index.md`](agency-os/docs/operations/cursor-enterprise-rules-index.md)（**若與 AO 關鍵字流程衝突，以 `agency-os/.cursor/rules` 之 `00`／`30`／`40` 為準**）。
6. **龍蝦與藍圖** — [`lobster-factory/README.md`](lobster-factory/README.md)、Checklist、Runbook；**規格原文** [`docs/spec/README.md`](docs/spec/README.md)、[**四份整合怎麼讀**](agency-os/docs/overview/company-os-four-sources-integration.md)。

## 從哪讀起（快速連結）

- **龍蝦工廠**：[`lobster-factory/README.md`](lobster-factory/README.md)、[`lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`](lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md)、[`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`](lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md)、[`lobster-factory/docs/e2e/OPERABLE_E2E_PLAYBOOK.md`](lobster-factory/docs/e2e/OPERABLE_E2E_PLAYBOOK.md)（A10-1 營運劇本）
- **AO 系統**：[`agency-os/AGENTS.md`](agency-os/AGENTS.md)、[`agency-os/TASKS.md`](agency-os/TASKS.md)、[`agency-os/docs/overview/EXECUTION_DASHBOARD.md`](agency-os/docs/overview/EXECUTION_DASHBOARD.md)
- **規格原文（長篇藍圖）**：[`docs/spec/README.md`](docs/spec/README.md)；**四份怎麼整合**：[`agency-os/docs/overview/company-os-four-sources-integration.md`](agency-os/docs/overview/company-os-four-sources-integration.md)

## 開工與雙機同步（AO-RESUME）

- **`AO-RESUME`**：請 Agent 依 **`agency-os/.cursor/rules/30-resume-keyword.mdc`** 讀進度檔，並在 monorepo 根執行 **`.\scripts\ao-resume.ps1`**。**預設**該腳本含：`fetch`、落後時 `pull --ff-only`、`verify-build-gates`、workflows 依賴、`print-open-tasks`、**結尾 `machine-environment-audit -FetchOrigin -Strict`**（與 **`align-workstation.ps1`** 相同）。Autopilot 開機則為輕量（見 **AGENTS.md**）。
- **另一台已 AO-CLOSE push 時**：在 monorepo 根 **`AO-RESUME`**（或 **`ao-resume.ps1`**）即可同步檢查；若 pull／髒樹失敗再手動整理。完整清單：[`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`](agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md)。**勾選 `TASKS`「雙機環境對齊」**：兩台各跑一次通過預設 **`ao-resume.ps1`**（結尾 Strict 已含）或等價稽核即可。

## 事件流程單一真相

- 開工（AO-RESUME）：[`agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`](agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md)（**§2** 例行、**§2.5** 日內 Git：checkpoint + 收工 push）
- 收工（AO-CLOSE）：[`agency-os/docs/operations/end-of-day-checklist.md`](agency-os/docs/operations/end-of-day-checklist.md) + [`agency-os/.cursor/rules/40-shutdown-closeout.mdc`](agency-os/.cursor/rules/40-shutdown-closeout.mdc)
- 其餘文件僅保留入口摘要，避免重複維護多套命令

## 收工與同步

- 關鍵字 **`AO-CLOSE`**：依 **`agency-os/.cursor/rules/40-shutdown-closeout.mdc`**；**repo 根**執行 **`.\scripts\ao-close.ps1`**（**正本**；**`agency-os\scripts\ao-close.ps1`** 僅 wrapper）。腳本含 **今日 recap**、**閘道**、**`apply-closeout-task-checkmarks`**（自 **`WORKLOG`** **`- AUTO_TASK_DONE:`** 打勾 **`TASKS`**）、預設 **commit + push**；health **100%** 與 **`AGENTS.md`** 一致。**勿**在僅 `lobster-factory` 子目錄執行。
- **monorepo 根 `.cursor/rules`**（**`00`、`30`、`40`、`50`、`63–66`**）：正本在 **`agency-os/.cursor/rules`**；由 **`scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 鏡像到根目錄（**`00`／`30`／`40`** 含路徑變換；**`verify-build-gates`** 預設會跑）。只改一邊會造成**規則分叉**。

## Related Documents (Auto-Synced)
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `README.md`

_Last synced: 2026-04-09 05:52:22 UTC_

