# 雙機環境對齊 — 細項 Checklist（Owner）

> **用途**：`agency-os/TASKS.md` 中「（AO-RESUME 提醒）雙機環境對齊」的**展開版**；本篇為細項清單 Owner，避免 TASKS 過長。  
> **敘事與指令序列**：仍以 **`REMOTE_WORKSTATION_STARTUP.md`**（§1.5、§2、§2.5.1）為準。

## DoD（結案條件）

兩台電腦（公司桌機＋筆電）皆已在 **monorepo 根**執行：

`powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -Strict`

且輸出為 **PASS（無 WARN）**。任一台未 PASS，TASKS 該條不結案。

---

## Checklist

- **新機／筆電首次**：完成 Windows 本機 WordPress 相容層（MariaDB + PHP + WP-CLI + `scripts/bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`），此路徑與 Supabase／MCP 分列。

- **之後每次開工**：在 Cursor 開 monorepo 根並送出 **`AO-RESUME`**（專案 **hook** 先跑 **`scripts/ao-resume.ps1 -FullMainlineParity`** 至 exit 0／失敗則依 **REMOTE 2.5.1** 整理後重送）；除錯時可改在 monorepo 根手動跑同指令。

- **筆電**：安裝並登入 GitHub CLI（`winget install --id GitHub.cli` + `gh auth login`），Node major 與桌機／CI 對齊；`secrets-vault` 與 `mcp.json` 皆為每台獨立設定。

- **Shared MCP／AI 結構（固定）**：兩台共用 repo 內 **`mcp/registry.template.json`**、**`scripts/sync-mcp-config.ps1`**、**`CLAUDE.md`**、**`.cursor/rules/67-shared-mcp-governance.mdc`**；各自持有本機 env／vault／user-level config，**不得**直接複製另一台的明文 `~/.cursor/mcp.json`、`~/.claude.json`。

- **筆電全功能接線**：建立 `mcp/user-env.ps1`（依 `mcp/user-env.template.ps1` 補齊全部 env），在 monorepo 根執行 **`scripts/bootstrap-mcp-machine.ps1`**；若筆電曾有舊明文 MCP，再執行 **`scripts/sanitize-user-mcp-config.ps1`** 後重開 Cursor／Claude Code。

- **公司桌機現況**：shared MCP／Claude／Cursor 永久規則與本機明文 MCP 清理已完成；若後續再漂移，優先以 `scripts/sync-mcp-config.ps1`／`scripts/sanitize-user-mcp-config.ps1` 重建，不回頭維護第二套手工設定。

- **自託管營運工具（消費端）**：雲上實例（例：**Hetzner 自託管 n8n staging**）為一套部署；**每台開發機**仍須各自具備可觸發／驗證 Webhook 的 **vault 鍵與連通**（見 **`docs/operations/n8n-staging-client-onboarding-e2e.md`**、**`WORKLOG` `## 2026-04-10`**）。後續 Phase 1 其他自託管／邊界工具亦同——**伺服器側**與**本機消費側**不要混成一項「已做完」。

- **Trigger.dev（自託管）**：**營運定案 2026-04-20：自託管視為已上線**（與 **`origin/main`**、**`TOOLS_DELIVERY_TRACEABILITY.md`**、**`hetzner-stack-rollout-index.md`** 敘述一致）。實裝正本 **`lobster-factory/infra/trigger/README.md`**；證據索引 **`WORKLOG` `## 2026-04-16`～`## 2026-04-17`**、**`memory/CONVERSATION_MEMORY.md`**。**每台開發機**仍須各自 **`TRIGGER_SECRET_KEY`、API／Worker base URL**（**vault**／本機 env）與 **`github-actions-trigger-prod-deploy.md`** 之 deploy 約定對齊，**不等於**「叢集已上線＝筆電不必設」。

- **稽核指令（兩台都要跑）**：在 monorepo 根執行上一節 DoD 中的 `machine-environment-audit.ps1 -FetchOrigin -Strict` 且 PASS（無 WARN）後，TASKS 該主項才可勾選。

- **公司桌機（人在辦公室時）**：不必回想先前是否裝過；在該機 monorepo 根依序：`git fetch` → `git checkout main` → `git pull --ff-only origin main` → 跑 DoD 中的 `machine-environment-audit -Strict`。若未 PASS，自 **`REMOTE_WORKSTATION_STARTUP.md`** **§1.5**「工具與依賴」起補齊（含 `lobster-factory\packages\workflows` 的 `npm ci`、可選 `mcp-local-wrappers`、`verify-build-gates`）後再重跑稽核；需與筆電同級「真 WP」則補 **§1.5.1**。FAIL／WARN 時保留終端輸出以利除錯。

- **筆電已 Strict PASS 時**：仍須待公司桌機也 PASS，TASKS 主項才可視為完成。

---

## 連動

| 檔案 | 角色 |
|------|------|
| `agency-os/TASKS.md` | 隊列一行：**未完成主項**＋**進度／下一步** |
| `docs/overview/REMOTE_WORKSTATION_STARTUP.md` | 開機／首次接線／pull／hook 敘事正本 |
| 本篇 | 雙機細項與證據索引（不重複貼 §1.5 全文） |
