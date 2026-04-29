# Secrets and Security Policy

## Never Do
- 不在 `.md`、`.txt`、聊天訊息中保存明文 API keys
- 不把 token 寫進指令歷史或腳本
- 不共享客戶憑證到不相關專案
- **不得**將 monorepo 根 **`.mcp.json`**、**`.codex/config.toml`** 以含機密內容的形式 **commit**（兩者已在 repo 根 **`.gitignore`**；若檔案曾被 `git add -f` 或先追蹤後才 ignore，仍會留在索引與歷史）。結構範本用 **`mcp.json.template`**；實際值只放本機／**`secrets-vault.ps1`**／User 環境變數（例如 **`SUPABASE_POSTGRES_MCP_DSN`**、**`SUPABASE_ANON_KEY`**、**`SUPABASE_SERVICE_ROLE_KEY`**）。
- 若 **JWT／DB 密碼／service_role** 曾出現在 **git 歷史或遠端**：除 **`git rm --cached`** 停止追蹤外，須依 **§Incident Trigger** **立即輪替**（Supabase：Dashboard 或自架之 **JWT Secret**、**API Keys**、資料庫 **`postgres` 密碼**；必要時 `git filter-repo`／BFG 清史，仍以 **輪替密鑰** 為主防線）。

## Required Controls
- 每客戶獨立憑證與最小權限
- 憑證需可輪替、可撤銷
- 生產與測試憑證分離
- 外包僅給臨時與最小必要權限
- 本機儲存採「不入庫」策略；預設使用 `scripts/secrets-vault.ps1`（DPAPI）

## Approved Local Storage (Zero Cost)
- 允許：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`（DPAPI 加密）
- 禁止：把機密值放在 repo 內任何可追蹤檔案（含 `mcp.json`、`*.md`、`memory/*`）
- 執行命令時，優先使用：
  - `powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action run ...`

## Rotation Policy
- 發現明文外洩：立即輪替
- 例行輪替：每 90 天
- 人員離職或合作終止：24 小時內撤銷

## Service Secret Ownership Baseline (Phase 1)

以下以「角色」為 owner，不在 git 儲存個人姓名：

- `SENTRY_DSN_NODE_API`：後端/資料整合 owner
- `SENTRY_DSN_TRIGGER_WORKFLOWS`：workflow owner
- `SENTRY_DSN_N8N_BACKEND`、`SENTRY_DSN_N8N_FRONTEND`：automation owner
- `SENTRY_DSN_NEXT_ADMIN`：frontend owner
- `SENTRY_DSN_WORDPRESS`：wordpress owner

所有 Sentry DSN 一律走「最小必要 project」與環境分離（staging vs production），不得共用單一高權限 DSN 橫跨全部服務。

## Sentry Secret Governance Rules

- DSN 變數命名以 `SENTRY_ALERT_POLICY.md` 契約為準，舊別名僅作過渡 fallback。
- 每次 DSN 或告警路由調整，必須同步更新：
  - `lobster-factory/infra/hetzner-phase1-core/.env.example`
  - `lobster-factory/infra/hetzner-phase1-core/README.md`
  - `agency-os/docs/operations/SENTRY_ALERT_POLICY.md`
- `verify-build-gates` 必須能檢查到 Sentry 契約關鍵鍵名，否則視為治理回退。

## Incident Trigger
任一明文憑證出現在文件或對話時，視為安全事件，需：
1. 停用或輪替該憑證
2. 盤點使用範圍
3. 記錄於 `docs/operations/RUNBOOK_INCIDENT_RESPONSE.md` 事件流程

## Related Documents (Auto-Synced)
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `docs/international/global-compliance-baseline.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`

_Last synced: 2026-04-29 18:00:42 UTC_

