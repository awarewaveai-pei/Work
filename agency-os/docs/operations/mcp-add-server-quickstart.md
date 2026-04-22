# MCP 新增快速手冊（常用）

> 用途：你每次要加新 MCP server 時，照這份做即可。  
> 目標：新增快、可回復、不把機密留在 repo。

## 路徑原則（先讀這段）

- **Cursor MCP 密鑰（本機）**：官方最新仍分 **project** 與 **global** 兩層。建議 **project** 用 repo 內 **`.cursor/mcp.json`** 做 **`${workspaceFolder}`** 錨點，**global** 用 **`%USERPROFILE%\.cursor\mcp.json`** 放只屬於該機器的覆寫；**勿**提交含密鑰內容到 git。結構範本見 repo 根 **`mcp.json.template`**。  
- **路徑**：LLM／Trigger 等請繼續使用 **`${workspaceFolder}`**／**`${userHome}`**（寫在使用者檔或本機 `.cursor/mcp.json` 皆可），避免寫死 **`D:\Work\...`**。  
- **`${workspaceFolder}` 必須能錨定**：專案根要有一份 **`.cursor/mcp.json`**（repo 內可為 **`{"mcpServers":{}}` 空物件**），Cursor 才會把插值解成你開啟的 monorepo 路徑；**僅** `%USERPROFILE%\.cursor\mcp.json` 而專案內沒有該檔時，`work-global`／`trigger` 等常會整排失敗。  
- **Trigger.dev 自託管**：在 **`trigger`** 的 **`env`** 加上 **`TRIGGER_API_URL`**（公開 HTTPS 原點，例如 **`https://trigger.aware-wave.com`**，依你 Nginx／DNS 為準），並維持 vault 內 **`TRIGGER_ACCESS_TOKEN`**；`start-trigger-mcp.ps1` 會把此變數一併餵給內層 `npx … mcp`。  
- **GitHub Copilot MCP**：`url` 建議 **`https://api.githubcopilot.com/mcp`**（**不要**結尾多一個 `/`）；Bearer 必須是 **Copilot MCP 允許的 GitHub token**（常見問題是拿一般 PAT 但帳號／權限不含 Copilot）。見 [GitHub 文件：Configure Copilot MCP](https://docs.github.com/en/copilot/how-tos/configure-personal-settings/configure-copilot-mcp)。

## Claude Code、Codex、Copilot（與 Cursor 對齊）

| 工具 | 專案內設定檔 | 路徑／機密慣例 |
|:---|:---|:---|
| **Cursor** | `.cursor/mcp.json` | **`${workspaceFolder}`**／**`${userHome}`**；Copilot 標頭 **`Bearer ${env:COPILOT_MCP_BEARER_TOKEN}`**（請在使用者／系統環境變數設好 **`COPILOT_MCP_BEARER_TOKEN`**，常可與 GitHub PAT 相同，依 Copilot MCP 實際要求為準）。 |
| **Claude Code** | monorepo 根 **`.mcp.json`** | 官方最新的 **project scope** 就是 **`.mcp.json`**；**local/user** scopes 則寫在 **`~/.claude.json`**，不是把 shared config 放在 `~/.claude/mcp.json`。與 Cursor 同樣的 server **名稱**；路徑走 **`scripts/run-llm-mcp.ps1`**（相對於專案根）。機密與路徑用 **`${VAR}`** 展開（見 [Claude MCP 說明](https://code.claude.com/docs/en/mcp)）。**`work-global`** 目前僅掛 **`${MONOREPO_ROOT}`** — 請在執行 Claude 的 shell 內 **`MONOREPO_ROOT`** 指向本 repo 根（例如 `C:\Users\你\Work`）。 |
| **Codex CLI** | monorepo 根 **`.codex/config.toml`** | **`[mcp_servers.*]`**；HTTP MCP 用 **`bearer_token_env_var`**（例如 **`COPILOT_MCP_BEARER_TOKEN`**）。請在 **monorepo 根**執行 `codex`，讓 **`scripts/...`** 相對路徑正確。 |

**共用的本機啟動器**：`scripts/run-llm-mcp.ps1`（`chatgpt-*`／`claude-*`／`gemini-*` 皆呼叫同一支 **`mcp-local-wrappers/llm-mcp.mjs`**，模型由各自 `env` 的 `*_MODEL` 決定）。

## 小白快速版（去哪裡 -> 做什麼 -> 看到什麼）

1. 用 Cursor **開啟 monorepo 根**（含 **`mcp-local-wrappers/`** 的那層）。**勿**只開子資料夾 `agency-os/`，否則 **`${workspaceFolder}`** 會指錯層級。  
2. 編輯 **`%USERPROFILE%\.cursor\mcp.json`**（建議；放密鑰與完整 server 清單）。專案 **`.cursor/mcp.json`** 請維持 repo 內範本（空物件即可），**勿**把含真值的內容 `git add` 進遠端。  
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
6. **`trigger` 仍紅**：在 monorepo 根執行 `.\scripts\secrets-vault.ps1 -Action list`，清單裡**必須**有 **`TRIGGER_ACCESS_TOKEN`**（Trigger 後台建立的 Personal Access Token，用 `set` 寫入 vault；`import-mcp` 不會憑空生出這一筆）。自託管另需 **`trigger.env.TRIGGER_API_URL`** 與 **`start-trigger-mcp.ps1 -ProjectRef`**／**`TRIGGER_PROJECT_REF`** 正確。
7. **`copilot` 仍紅**：`https://api.githubcopilot.com/mcp` **不要**多尾階 `/`；Bearer 須符合 [GitHub：設定 Copilot MCP](https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp)（常見為 **Copilot 訂閱／權限** 或 **PAT 類型／scope** 不符，一般 `github` MCP 能用的 token 未必能過 Copilot MCP）。建議 **`Authorization`: `Bearer ${env:COPILOT_MCP_BEARER_TOKEN}`**，再執行 **`.\scripts\secrets-vault.ps1 -Action sync-copilot-mcp-env`**（自 vault 的 **`COPILOT_AUTH_BEARER_TOKEN`** 寫入使用者環境變數），**完全結束 Cursor 後重開** 才會載入新的 User env。

## 明文機密清理（Cursor / Claude 舊機）

若機器上已經有舊的 **`%USERPROFILE%\.cursor\mcp.json`**、**`%USERPROFILE%\.claude\mcp.json`** 或 **`%USERPROFILE%\.claude.json`** 並含明文 token，先在 monorepo 根執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sanitize-user-mcp-config.ps1
```

此腳本會：

1. 先把原檔備份到 `Backups/mcp-sanitize-<timestamp>/`
2. 把 **Cursor** user-level MCP 改寫成 env 版
3. 把 **Claude** legacy `~/.claude/mcp.json` 改成最小非明文 fallback
4. 清掉 **`~/.claude.json`** 裡殘留的 project-level `mcpServers`，讓 repo 根 **`.mcp.json`** 成為專案真相

跑完後請**完全結束** Cursor / Claude Code，再重開。

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
- **專案** `.cursor/mcp.json`：repo 內為 **`mcpServers` 空物件**（錨定 **`${workspaceFolder}`**）；密鑰仍放使用者檔
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
