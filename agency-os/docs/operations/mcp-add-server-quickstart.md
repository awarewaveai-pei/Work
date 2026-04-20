# MCP 新增快速手冊（常用）

> 用途：你每次要加新 MCP server 時，照這份做即可。  
> 目標：新增快、可回復、不把機密留在 repo。

## 路徑原則（先讀這段）

- **Cursor MCP 密鑰（本機）**：**`%USERPROFILE%\.cursor\mcp.json`**（全機一份；**勿**提交 git）。結構範本與無密版本見 repo 根 **`mcp.json.template`**；若你堅持在 repo 內放 **`.cursor/mcp.json`**，該檔名已列於 **`.gitignore`**，僅作本機覆寫用。  
- **路徑**：LLM／Trigger 等請繼續使用 **`${workspaceFolder}`**／**`${userHome}`**（寫在使用者檔或本機 `.cursor/mcp.json` 皆可），避免寫死 **`D:\Work\...`**。

## Claude Code、Codex、Copilot（與 Cursor 對齊）

| 工具 | 專案內設定檔 | 路徑／機密慣例 |
|:---|:---|:---|
| **Cursor** | `.cursor/mcp.json` | **`${workspaceFolder}`**／**`${userHome}`**；Copilot 標頭 **`Bearer ${env:COPILOT_MCP_BEARER_TOKEN}`**（請在使用者／系統環境變數設好 **`COPILOT_MCP_BEARER_TOKEN`**，常可與 GitHub PAT 相同，依 Copilot MCP 實際要求為準）。 |
| **Claude Code** | monorepo 根 **`.mcp.json`** | 與 Cursor 同樣的 server **名稱**；路徑走 **`scripts/run-llm-mcp.ps1`**（相對於專案根）。機密與路徑用 **`${VAR}`** 展開（見 [Claude MCP 說明](https://code.claude.com/docs/en/mcp)）。**`work-global`** 目前僅掛 **`${MONOREPO_ROOT}`** — 請在執行 Claude 的 shell 內 **`MONOREPO_ROOT`** 指向本 repo 根（例如 `C:\Users\你\Work`）。 |
| **Codex CLI** | monorepo 根 **`.codex/config.toml`** | **`[mcp_servers.*]`**；HTTP MCP 用 **`bearer_token_env_var`**（例如 **`COPILOT_MCP_BEARER_TOKEN`**）。請在 **monorepo 根**執行 `codex`，讓 **`scripts/...`** 相對路徑正確。 |

**共用的本機啟動器**：`scripts/run-llm-mcp.ps1`（`chatgpt-*`／`claude-*`／`gemini-*` 皆呼叫同一支 **`mcp-local-wrappers/llm-mcp.mjs`**，模型由各自 `env` 的 `*_MODEL` 決定）。

## 小白快速版（去哪裡 -> 做什麼 -> 看到什麼）

1. 用 Cursor **開啟 monorepo 根**（含 **`mcp-local-wrappers/`** 的那層）。**勿**只開子資料夾 `agency-os/`，否則 **`${workspaceFolder}`** 會指錯層級。  
2. 編輯 **`%USERPROFILE%\.cursor\mcp.json`**（建議），或本機 **`mcp.json.template` → 複製為 `.cursor/mcp.json`** 再改密鑰（該路徑已 **gitignore**）。**勿**把含真值的檔案 `git add` 進遠端。  
3. 若從零開始：複製 repo 根 **`mcp.json.template`** 到 **`%USERPROFILE%\.cursor\mcp.json`**，再替換 `<PASTE_*>`／`YOUR_*`。
4. 在 **monorepo 根**開終端機（`scripts` 的上一層）。
5. 貼上這行，按 Enter：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`  
   （會自動優先讀專案 **`.cursor/mcp.json`**，若無則讀 **`%USERPROFILE%\.cursor\mcp.json`**；若要指定檔案可加 `-McpPath "完整路徑"`）
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
5. 看到 MCP 能正常使用就完成；若仍失敗，檢查 **`%USERPROFILE%\.cursor\mcp.json`**（或本機 `.cursor/mcp.json`）的 `url/command/args`，並確認沒有舊的 **`D:\Work\...`** 絕對路徑。

## 重灌/換機版（完整重建）

1. 把 repo clone 到本機任意路徑（例如 `C:\Users\你\Work`），`git pull` 對齊 `main`
2. 在 monorepo 根開終端機
3. 先初始化 vault：  
   `.\scripts\secrets-vault.ps1 -Action init`
4. 編好 **`%USERPROFILE%\.cursor\mcp.json`**（或本機 `.cursor/mcp.json`）後匯入：  
   `.\scripts\secrets-vault.ps1 -Action import-mcp`
5. 用 `list` 確認：  
   `.\scripts\secrets-vault.ps1 -Action list`
6. 重開 Cursor 後測一次 MCP，即完成

## 入口（先記這幾個）

- **`%USERPROFILE%\.cursor\mcp.json`**：Cursor 建議的**本機** MCP（含密鑰；**勿**提交）
- **（選）本機** `.cursor/mcp.json`：已列 **`.gitignore`**，僅供不想用使用者目錄時覆寫
- **`.mcp.json`**：Claude Code 專案 MCP（**`${VAR}`** 環境變數展開）
- **`.codex/config.toml`**：Codex 專案 MCP（TOML **`[mcp_servers.*]`**）
- **`mcp.json.template`**：對照範本（與本機 MCP 結構應一致）
- **`scripts/run-llm-mcp.ps1`**：LLM stdio 啟動器（Cursor／Claude／Codex 共用）
- **`scripts/secrets-vault.ps1`**：把機密進 vault 的工具
- **`docs/operations/local-secrets-vault-dpapi.md`**：完整建置/復原手冊

## 一鍵流程（每次新增 MCP 都照跑）

1. 編輯 **`%USERPROFILE%\.cursor\mcp.json`**（或本機 `.cursor/mcp.json`），新增 server 區塊
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
