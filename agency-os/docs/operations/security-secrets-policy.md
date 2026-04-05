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

## Incident Trigger
任一明文憑證出現在文件或對話時，視為安全事件，需：
1. 停用或輪替該憑證
2. 盤點使用範圍
3. 記錄於 `docs/operations/incident-response-runbook.md` 事件流程

## Related Documents (Auto-Synced)
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `docs/international/global-compliance-baseline.md`
- `docs/operations/cursor-enterprise-rules-index.md`

_Last synced: 2026-04-01 02:31:21 UTC_

