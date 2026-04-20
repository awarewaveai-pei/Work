# Codex 設定錯誤修復手冊

設定檔位置：`C:\Users\USER\.codex\config.toml`

---

## 錯誤：`env is not supported for streamable_http`

**症狀：**
```
Error loading config.toml: env is not supported for streamable_http in `mcp_servers.xxx`
codex 無法啟動，重開 Terminal 後仍然發生
```

**原因：**
MCP server 有兩種類型：
- `command`（本地進程）→ 可以用 `env` 傳入環境變數
- `url`（streamable_http，遠端）→ **不支援 `env`**，要用 `bearer_token_env_var`

**錯誤寫法：**
```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?..."
env = { SUPABASE_AUTH_BEARER_TOKEN = "eyJ..." }   # ❌ 不支援
```

**正確寫法：**
```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?..."
bearer_token_env_var = "SUPABASE_AUTH_BEARER_TOKEN"  # ✅ 指向環境變數名稱
```

**注意：** `bearer_token_env_var` 的值是**環境變數的名稱**，不是 token 本身。
Token 需要設定在 Windows 環境變數或 secrets vault 中。

---

## MCP Server 類型對照

| 類型 | 設定方式 | 範例 |
|------|---------|------|
| 本地指令 | `command` + `args` + `env` | github, airtable, replicate |
| 遠端 HTTP | `url` + `bearer_token_env_var` | supabase, cloudflare, n8n |

---

## 通用排查步驟

1. 看錯誤訊息中的 `mcp_servers.xxx` 找出是哪個 server
2. 確認該 server 是 `command` 還是 `url` 類型
3. 對照上方表格確認設定格式正確
4. 重開 Terminal 測試
