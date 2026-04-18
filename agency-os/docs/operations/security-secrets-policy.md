# Secrets and Security Policy

## Never Do
- 不在 `.md`、`.txt`、聊天訊息中保存明文 API keys
- 不把 token 寫進指令歷史或腳本
- 不共享客戶憑證到不相關專案

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
3. 記錄於 `docs/operations/incident-response-runbook.md` 事件流程

## Related Documents (Auto-Synced)
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `docs/international/global-compliance-baseline.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`

_Last synced: 2026-04-18 14:30:02 UTC_

