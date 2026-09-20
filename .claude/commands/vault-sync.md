---
name: vault-sync
description: Sync every vault secret into the Windows user environment variables and report alignment against the MCP registry. HIGH-RISK: writes credentials into the machine environment.
---

Sync all vault secrets to Windows user environment variables and report alignment with `mcp/registry.template.json`.

## 步驟 1：user-env.ps1 → vault

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action import-user-env
```

從 `mcp/user-env.ps1` 讀取所有非空 key-value，寫入本機 vault。每次 user-env.ps1 有更新後必跑。

## 步驟 2：vault → User registry（MCP 引用 key）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action sync-mcp-user-env
```

只同步 `mcp/registry.template.json` 中 `${env:NAME}` 引用到的 key（該檔是 MCP SSOT；2026-08-28 前這裡讀的是 `.cursor/mcp.json`，Cursor 退場後已失效）。Report：
- **Synced** — 寫入 Windows user env 的數量
- **Missing** — vault 缺少的 key（需手動 `secrets-vault.ps1 -Action set -Name <NAME> -Value '<value>'`）

## 步驟 3：非 MCP key 對齊（如有 401 症狀）

部分 key 不在 `mcp/registry.template.json` 引用清單（如 `OPS_INBOX_INGEST_TOKEN`），步驟 2 不會更新它們的 registry 值。
若 `fetch-external-signals` Telegram 欄出現 `error.*401`，執行：

```powershell
# 讀 vault 取正確值
$store = (. .\scripts\_vault-helpers.ps1; Read-VaultStore (Resolve-VaultPath))
$tok = Get-VaultSecret -Store $store -Name "OPS_INBOX_INGEST_TOKEN"

# 更新 User registry
[System.Environment]::SetEnvironmentVariable("OPS_INBOX_INGEST_TOKEN", $tok, "User")

# 驗證
$check = [System.Environment]::GetEnvironmentVariable("OPS_INBOX_INGEST_TOKEN", "User")
Write-Host "registry len=$($check.Length)"  # 應為 64
```

然後重跑 `fetch-external-signals.ps1` 確認 `Telegram: ok`。

## 注意事項

- 步驟 1 只更新 vault（磁碟），不改 registry
- 步驟 2 只同步 `mcp/registry.template.json` 引用的 key，其他 key 不受影響
- **不要**把來源改成 `.mcp.json`：Claude Code 展的是 `${NAME}` 不是 `${env:NAME}`，那份檔裡零個匹配 —— 會變成「同步 0 個」而看起來像「本來就都設好了」。腳本已對此 throw。
- IDE 啟動時讀入的 process env 是快照——vault/registry 更新後需要**完整重啟 IDE** 才能讓新值進入 process env
- 若重啟 IDE 不方便，臨時用 `$env:KEY = "value"` 設 process env（僅當次 session 有效）
