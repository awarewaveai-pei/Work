# MCP 新增快速手冊（常用）

> 用途：你每次要加新 MCP server 時，照這份做即可。  
> 目標：新增快、可回復、不把機密留在 repo。

## 小白快速版（去哪裡 -> 做什麼 -> 看到什麼）
1. 打開「檔案總管」
2. 到這個資料夾：`D:\Work`
3. 雙擊打開檔案：`mcp.json`
4. 在檔案中加上新的 MCP server 設定，按 `Ctrl + S` 存檔
5. 回到 `D:\Work` 資料夾空白處按右鍵，選「在終端機中開啟」
6. 貼上這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
7. 看到 `Imported/updated secrets from mcp: ...` 代表已匯入成功
8. 再貼這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action list`
9. 看到 key 名稱清單（不會顯示明文）就完成

## 修復版（新增後連不上時）
1. 打開 `D:\Work` 的終端機
2. 先重跑匯入：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
3. 再檢查清單：  
   `.\scripts\secrets-vault.ps1 -Action list`
4. 關掉 Cursor 再重開
5. 看到 MCP 能正常使用就完成；若仍失敗，回到 `mcp.json` 檢查 `url/command/args`

## 重灌/換機版（完整重建）
1. 把 repo 拉回來到 `D:\Work`（先 `git clone` 或 `git pull`）
2. 打開 `D:\Work` 的終端機
3. 先初始化 vault：  
   `.\scripts\secrets-vault.ps1 -Action init`
4. 再從 `mcp.json` 匯入：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
5. 用 `list` 確認：  
   `.\scripts\secrets-vault.ps1 -Action list`
6. 重開 Cursor 後測一次 MCP，即完成

## 入口（先記這三個）
- `D:\Work\mcp.json`：新增/調整 MCP server 的地方
- `D:\Work\scripts\secrets-vault.ps1`：把機密進 vault 的工具
- `docs/operations/local-secrets-vault-dpapi.md`：完整建置/復原手冊

## 一鍵流程（每次新增 MCP 都照跑）
1. 編輯 `D:\Work\mcp.json`，新增 server 區塊
2. 匯入機密到 vault：
   - `.\scripts\secrets-vault.ps1 -Action import-mcp -McpPath "D:\Work\mcp.json"`
3. 檢查機密 key 名稱：
   - `.\scripts\secrets-vault.ps1 -Action list`
4. Reload Cursor / 重新連線 MCP
5. 跑一次系統閘道：
   - `powershell -ExecutionPolicy Bypass -File D:\Work\scripts\verify-build-gates.ps1`

## `mcp.json` 兩種常見寫法

### A) env 型（最常見）
```json
"my-server": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "some-mcp-server"],
  "env": {
    "MY_SERVER_API_KEY": "..."
  }
}
```

### B) http + header Bearer 型
```json
"my-http-server": {
  "type": "http",
  "url": "https://example.com/mcp",
  "headers": {
    "Authorization": "Bearer ..."
  }
}
```

## 命名建議（避免混亂）
- API key 直接用官方變數名（例如 `OPENAI_API_KEY`）
- Bearer token 會匯入成 `<SERVER_NAME>_AUTH_BEARER_TOKEN`
- server 名稱建議全小寫、用 `-` 分隔（例如 `my-http-server`）

## 失敗時怎麼查
- `import-mcp` 成功但找不到 key：
  - 先檢查 `mcp.json` 是否有 `env` 或 `Authorization: Bearer ...`
- server 連不上：
  - 先重開 Cursor，再看 `mcp.json` 的 `url/command/args`
- 憑證疑似外洩：
  - 先輪替 token，再重跑 `import-mcp`

## Related Documents (Auto-Synced)
- `docs/operations/local-secrets-vault-dpapi.md`
- `docs/operations/mcp-secrets-hardening-runbook.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
