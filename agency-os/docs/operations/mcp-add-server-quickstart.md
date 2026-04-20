# MCP 新增快速手冊（常用）

> 用途：你每次要加新 MCP server 時，照這份做即可。  
> 目標：新增快、可回復、不把機密留在 repo。

## 路徑原則（先讀這段）

- **專案 MCP 正本**：monorepo 根目錄的 **`.cursor/mcp.json`**（已用 **`${workspaceFolder}`**／**`${userHome}`**，換磁碟／換路徑不必改一堆絕對路徑）。  
- **若你還有一份舊的 `%USERPROFILE%\.cursor\mcp.json`** 裡面寫死 **`D:\Work\...`**：請刪掉與專案重複的 server，或改成正確路徑，否則 Cursor 仍可能載入錯的 `args`，MCP 會整排紅燈。

## 小白快速版（去哪裡 -> 做什麼 -> 看到什麼）

1. 用 Cursor **開啟 monorepo 根**（含 **`mcp-local-wrappers/`** 的那層；底下要有 **`.cursor/mcp.json`**）。**勿**只開子資料夾 `agency-os/`，否則 **`${workspaceFolder}`** 會指錯層級，`node` 找不到 wrapper。
2. 編輯 **`.cursor/mcp.json`**，把 `<PASTE_*>`、`YOUR_*` 改成你的真值（**勿**把含真值的檔案提交 git）。
3. 若你是從零開始：可複製根目錄 **`mcp.json.template`** 覆蓋到 **`.cursor/mcp.json`** 再改密鑰。
4. 在 **monorepo 根**開終端機（`scripts` 的上一層）。
5. 貼上這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`  
   （會自動優先讀 **`.cursor/mcp.json`**；若要指定檔案可加 `-McpPath "完整路徑"`）
6. 看到 `Imported/updated secrets from mcp: ...` 代表已匯入成功
7. 再貼這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action list`
8. 看到 key 名稱清單（不會顯示明文）就完成

## 修復版（新增後連不上時）

1. 在 monorepo 根開終端機
2. 先重跑匯入：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`
3. 再檢查清單：  
   `.\scripts\secrets-vault.ps1 -Action list`
4. 關掉 Cursor 再重開
5. 看到 MCP 能正常使用就完成；若仍失敗，回到 **`.cursor/mcp.json`** 檢查 `url/command/args`，並確認 **使用者層** `~/.cursor/mcp.json` 沒有舊的絕對路徑覆蓋

## 重灌/換機版（完整重建）

1. 把 repo clone 到本機任意路徑（例如 `C:\Users\你\Work`），`git pull` 對齊 `main`
2. 在 monorepo 根開終端機
3. 先初始化 vault：  
   `.\scripts\secrets-vault.ps1 -Action init`
4. 編好 **`.cursor/mcp.json`** 後匯入：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`
5. 用 `list` 確認：  
   `.\scripts\secrets-vault.ps1 -Action list`
6. 重開 Cursor 後測一次 MCP，即完成

## 入口（先記這三個）

- **`.cursor/mcp.json`**：新增/調整 MCP server（專案內；路徑用插值）
- **`mcp.json.template`**：無 Cursor 時的對照範本（與上者結構應一致）
- **`scripts/secrets-vault.ps1`**：把機密進 vault 的工具
- **`docs/operations/local-secrets-vault-dpapi.md`**：完整建置/復原手冊

## 一鍵流程（每次新增 MCP 都照跑）

1. 編輯 **`.cursor/mcp.json`**，新增 server 區塊
2. 匯入機密到 vault：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`
3. 檢查機密 key 名稱：  
   `.\scripts\secrets-vault.ps1 -Action list`
4. Reload Cursor / 重新連線 MCP
5. 跑一次系統閘道：  
   `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`

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
  - 先檢查 **`.cursor/mcp.json`** 是否有 `env` 或 `Authorization: Bearer ...`
- server 連不上：
  - 先重開 Cursor，再看 **`.cursor/mcp.json`** 的 `url/command/args`；本機 **`node`／`npx`** 須在 PATH
- 憑證疑似外洩：
  - 先輪替 token，再重跑 `import-mcp`

## Related Documents (Auto-Synced)

- `docs/operations/local-secrets-vault-dpapi.md`
- `docs/operations/mcp-secrets-hardening-runbook.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
