# MCP 新增快速手冊（常用）

> 用途：你每次要加新 MCP server 時，照這份做即可。  
> 目標：新增快、可回復、不把機密留在 repo。

## 路徑原則（先讀這段）

- **Claude Code project MCP**：根 `.mcp.json` 由 `mcp/registry.template.json` 同步產生；**不要手改生成檔**。共享 server、相對路徑與環境變數規則以 registry 為準；**勿**把明文 token 提交到 git。
- **Codex MCP**：`%USERPROFILE%\.codex\config.toml` 的 managed block 由 `scripts\sync-mcp-config.ps1` 產生；其餘 user settings 保留。Claude Code 的 local/user scope 仍由 `~\.claude.json` 管理，`~\.claude\mcp.json` 必須維持空 server map。
- **路徑**：LLM／Trigger／filesystem wrapper 等只在 `mcp/registry.template.json` 宣告，輸出到根 `.mcp.json` 與 Codex managed config；路徑用相對 repo root 或同步器可解析的環境變數，禁止寫死 `D:\Work\...` 或 `C:\Users\...`。
- **monorepo root 必須能錨定**：在 Claude Code / Codex 開啟含 `scripts/`、`mcp-local-wrappers/` 與根 `.mcp.json` 的那一層；勿只開 `agency-os/`，否則相對路徑會指錯層級。
- **Trigger.dev 自託管**：在 **`trigger`** 的 **`env`** 加上 **`TRIGGER_API_URL`**（公開 HTTPS 原點，例如 **`https://trigger.aware-wave.com`**，依你 Nginx／DNS 為準），並維持 vault 內 **`TRIGGER_ACCESS_TOKEN`**；`start-trigger-mcp.ps1` 會把此變數一併餵給內層 `npx … mcp`。  
- **GitHub Copilot MCP**：`url` 建議 **`https://api.githubcopilot.com/mcp`**（**不要**結尾多一個 `/`）；Bearer 必須是 **Copilot MCP 允許的 GitHub token**（常見問題是拿一般 PAT 但帳號／權限不含 Copilot）。見 [GitHub 文件：Configure Copilot MCP](https://docs.github.com/en/copilot/how-tos/configure-personal-settings/configure-copilot-mcp)。

## Claude Code、Codex、Copilot（現行）

| 工具 | 專案內設定檔 | 路徑／機密慣例 |
|:---|:---|:---|
| **Cursor** | 已退場（2026-08-26） | 不得重建 `.cursor/` MCP 設定；現行流程看 Claude Code / Codex。 |
| **Claude Code** | 根 `.mcp.json` | project scope 由 registry 產生；local/user scope 在 `~\.claude.json`；`~\.claude\mcp.json` 不承載 shared config。 |
| **Codex CLI** | `%USERPROFILE%\.codex\config.toml` managed block | `[mcp_servers.*]`；由 `scripts\sync-mcp-config.ps1` 依 registry 產生；不要手改 managed block。 |

**共用的本機啟動器**：`scripts/run-llm-mcp.ps1`（`chatgpt-*`／`claude-*`／`gemini-*` 皆呼叫同一支 **`mcp-local-wrappers/llm-mcp.mjs`**，模型由各自 `env` 的 `*_MODEL` 決定）。

## 小白快速版（去哪裡 -> 做什麼 -> 看到什麼）

1. 在 Claude Code / Codex **開啟 monorepo 根**（含 **`mcp-local-wrappers/`**、`scripts/` 與根 **`.mcp.json`** 的那層）。**勿**只開子資料夾 `agency-os/`，否則相對路徑會指錯層級。
2. **伺服器清單**只維護在 **`mcp/registry.template.json`**；在 monorepo 根執行同步器，產生根 **`.mcp.json`** 與 Codex managed block。機密只由 vault／環境變數提供。
3. 若從零開始：以 repo 根 **`mcp/registry.template.json`** 對照鍵名與 env，必要時執行 **`.\scripts\sync-mcp-config.ps1`**；**勿**在 template 裡留下真 token 再提交。
4. 在 **monorepo 根**開終端機（`scripts` 的上一層）。
5. 貼上這行，按 Enter：
   **`.\scripts\sync-mcp-config.ps1`**
   （讀取 registry，產生根 `.mcp.json`、Codex managed block 與其他支援 client 的同步設定；不讀取或印出 secret 值。）
6. 看到 `MCP sync complete` 代表結構同步成功
7. 如需把 vault 內的 env 鍵同步到本機使用者環境，再執行：
   **`.\scripts\secrets-vault.ps1 -Action sync-mcp-user-env`**
8. 完全結束並重開 Claude Code / Codex，看到 MCP 能正常使用就完成

## 修復版（新增後連不上時）

1. 在 monorepo 根開終端機
2. 先重跑設定同步：
   **`.\scripts\sync-mcp-config.ps1`**
3. 若缺環境變數，再執行：
   **`.\scripts\secrets-vault.ps1 -Action sync-mcp-user-env`**
4. 完全結束 Claude Code / Codex 後重開
5. 看到 MCP 能正常使用就完成；若仍失敗，檢查根 **`.mcp.json`**、**`mcp/registry.template.json`** 與 **`%USERPROFILE%\.codex\config.toml`** 的 managed block 是否同步，並確認沒有舊的 **`D:\Work\...`** 絕對路徑。
5.1 **遠端 HTTP（`type: http`：Supabase / n8n / posthog / cloudflare 等）紅黃亂跳、或綠但寫 `No tools`**：先依 registry 與 `mcp/user-env.ps1` 驗證 URL／環境變數；再執行 **`.\scripts\sync-mcp-config.ps1`** 產生 client 設定。sync 只寫設定結構，不會把 secret 印出或寫入 repo。
   **`.\scripts\secrets-vault.ps1 -Action sync-mcp-user-env`**
   會把 vault 中需要的 env 鍵同步到本機使用者環境；完成後完全結束並重開 Claude Code / Codex。缺哪個變數，腳本會列出；可用 **`secrets-vault.ps1 -Action set -Name … -Value …`** 補進 vault 後再跑一次 sync。
5.2 **`SUPABASE_*`／`CLOUDFLARE_*`／`POSTHOG_*`**：若 vault 根本沒有對應鍵名，請依各服後台填入真值 **`set`** 進 vault，勿把明文留在聊天。
6. **`trigger` 仍紅**：在 monorepo 根執行 `.\scripts\secrets-vault.ps1 -Action list`，清單裡**必須**有 **`TRIGGER_ACCESS_TOKEN`**（Trigger 後台建立的 Personal Access Token，用 `set` 寫入 vault；`import-mcp` 不會憑空生出這一筆）。自託管另需 **`trigger.env.TRIGGER_API_URL`** 與 **`start-trigger-mcp.ps1 -ProjectRef`**／**`TRIGGER_PROJECT_REF`** 正確。
7. **`copilot` 仍紅**：先核對 URL／Bearer 權限與使用者環境變數，再執行 **`.\scripts\sync-mcp-config.ps1`**；完全結束並重開對應 client 後再測。

## 明文機密清理（舊機）

若機器上已經有舊的 **`%USERPROFILE%\.claude\mcp.json`** 或 **`%USERPROFILE%\.claude.json`** 並含明文 token，先在 monorepo 根執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sanitize-user-mcp-config.ps1
```

此腳本會：

1. 先把原檔備份到 `Backups/mcp-sanitize-<timestamp>/`（該目錄已在 `.gitignore`，不會進 git）
2. 把改寫工作**交給唯一寫入者** `scripts/sync-claude-userlevel.ps1 -Mode merge`

它**自己不改寫任何檔案**。兩個檔各自該裝什麼，宣告在 `mcp/claude-userlevel/manifest.json`：

| 檔案 | manifest 條目（型別） | 結果 |
|---|---|---|
| `~/.claude/mcp.json` | `mcp`（`replace-json`）| 正規化為 `{"mcpServers":{}}` |
| `~/.claude.json` | `claude-user-json`（`clear-collections-json`）| 清空 project-scoped `mcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers`，讓 repo 根 `.mcp.json` 成為專案真相 |

跑完後請**完全結束** Claude Code / Claude Desktop，再重開。

> **這張表在 2026-08-28 少了一列，而且不是因為問題消失。** `~/.cursor/mcp.json`（`cursor-mcp` / `prune-duplicate-json`）隨 Cursor 退場移除：目標檔已刪，prune helper 對「目標不存在」回報 `clean`，那條等於一個永遠不會變紅的偵測器。
>
> **仍然沒有任何條目管的是 `%APPDATA%\Claude\claude_desktop_config.json`**——它被 Claude 與 repo `.mcp.json` 合併載入，有 8 個與 repo 同名的 server、2 個（`perplexity` / `wordpress`）只存在於該檔，且**目前持有 6 把明文 API key**。它曾繼承 `~/.cursor/mcp.json` 的角色卻沒有繼承治理。見 `TASKS.md`。

> **2026-08-25 之前這裡是錯的。** 本腳本當時自帶三份寫入邏輯，與本文件上方 §路徑原則 直接牴觸：把兩個 server 寫進規定應為 `{}` 的 `~/.claude/mcp.json`；把 repo `.mcp.json` 整份複製進 user-level Cursor 設定，親手製造 §路徑原則 要求避免的重複；而清 `~/.claude.json` 的實作用了 PowerShell 6 才有的 `-AsHashtable`，在 PS 5.1 上**從未真的執行過**。根因是同一個檔案有多個寫入者、各自帶著沒被交叉檢查的意圖。詳見 `WORKLOG.md` 2026-08-25。

## 重灌/換機版（完整重建）

1. 把 repo clone 到本機任意路徑（例如 `C:\Users\你\Work`），`git pull` 對齊 `main`
2. 在 monorepo 根開終端機
3. 先初始化 vault：  
   `.\scripts\secrets-vault.ps1 -Action init`
4. 依 **`mcp/registry.template.json`** 產生 client 設定：
   **`.\scripts\sync-mcp-config.ps1`**
5. 用 `list` 或同步器輸出確認 server 名稱與 env 鍵存在：
   **`.\scripts\secrets-vault.ps1 -Action list`**
6. 完全結束並重開 Claude Code / Codex 後測一次 MCP，即完成

## 單一真相（registry → 同步）

- **AwareWave 自託管 n8n／自架 Supabase／Cloudflare／PostHog MCP 的公開 URL** 寫在 **`mcp/registry.template.json`**；同步到根 **`.mcp.json`**、Codex managed block 與其他 client 請在 monorepo 根執行：
  **`.\scripts\sync-mcp-config.ps1`**
  **勿**只手改生成的 **`.mcp.json`**；應修改 registry 後重跑同步，否則下次 sync 會被覆蓋。

## Hetzner：Cloud API vs SSH

- **Cloud API（機器／Floating IP／防火牆）**：**`awarewave-ops`** 內 **`hetzner`** 服務 + `HETZNER_API_TOKEN`（見 vault／`import-mcp`）。
- **SSH（VPS 上跑指令／SFTP）**：專案 MCP 鍵 **`server-ssh`** → `npx -y mcp-server-ssh`。連線用工具 **`ssh_connect`**（host、user、port、金鑰路徑或密碼），**不要**把密碼寫進 `mcp.json`。

## 入口（先記這幾個）

- **Claude Code project MCP**：根 **`.mcp.json`**（由 registry 同步；`~\.claude.json` 僅 local/user scope）
- **Codex managed MCP**：**`%USERPROFILE%\.codex\config.toml`**（由 sync script 管理區塊）
- **`mcp/registry.template.json`**：跨 client 的宣告 SSOT
- **`.mcp.json`**：Claude Code project MCP（由 registry 生成）
- **`scripts\run-llm-mcp.ps1`**：LLM stdio 啟動器（Claude／Codex 等共用）
- **`scripts\secrets-vault.ps1`**：把機密進 vault 的工具
- **`scripts/secrets-vault.ps1`**：把機密進 vault 的工具
- **`docs/operations/local-secrets-vault-dpapi.md`**：完整建置/復原手冊

## 一鍵流程（每次新增 MCP 都照跑）

1. 編輯 **`mcp/registry.template.json`**（新增 server 宣告與 env 名稱；不要放 secret）
2. 同步 client 設定：
   **`.\scripts\sync-mcp-config.ps1`**
3. 檢查機密 key 名稱：
   **`.\scripts\secrets-vault.ps1 -Action list`**
4. 重新連線 MCP，必要時完全重開 Claude Code / Codex
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
   - 先檢查 **`mcp/registry.template.json`** 是否有 `env` 或 Authorization 的 env 參照（只允許 env 名稱，不得有明文值）
- server 連不上：
   - 先重跑同步器，再看根 **`.mcp.json`** 與 Codex managed block 的 `url/command/args`；本機 **`node`／`npx`** 須在 PATH
- 憑證疑似外洩：
  - 先輪替 token，再重跑 `import-mcp`

## Related Documents (Auto-Synced)

- `docs/operations/local-secrets-vault-dpapi.md`
- `docs/operations/mcp-secrets-hardening-runbook.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
