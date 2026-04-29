# 自託管 n8n：MCP（`/mcp-server/http`）連線與 404 排查

> **適用**：Self-hosted n8n（非 n8n Cloud 專用路徑）；Cursor／Codex 等使用 **`mcp/registry.template.json`** 內 **`n8n`** → **`${env:N8N_MCP_URL}`**。  
> **勿**在 repo 寫入明文 token；本機填 **`mcp/user-env.ps1`**（由 **`user-env.template.ps1`** 複製）。

## 現象

- 瀏覽器或 MCP 探測對 **`https://<host>/mcp-server/http`** 得到 **404**（有無 `Authorization` 皆然）。
- Cursor **Settings → MCP → n8n** 顯示連線失敗或無工具。

**含義**：多半是 **n8n 未公開 MCP 路由**、**反向代理未轉發該路徑**、或 **版本過舊／已知問題**——不只是 token 錯誤（錯 token 較常見 **401**）。

## 本機一鍵探測（推薦）

於 **monorepo 根**：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n8n-mcp-smoke.ps1
```

或：

```bash
npm run n8n:mcp-smoke
```

需已設定 **`N8N_MCP_URL`**（完整 MCP URL）與 **`N8N_AUTH_BEARER_TOKEN`**（n8n **Connection details** 內 MCP token）。  
**建議**：用 **`n8n-mcp-smoke.ps1`**，會先嘗試載入 **`mcp/user-env.ps1`**；**`npm run n8n:mcp-smoke`** 僅讀**目前終端機進程**的環境變數（須已在本會話 **`dot-source`** user-env，或由 **`secrets-vault … sync-cursor-mcp-user-env`** 寫入使用者環境後重開終端）。

腳本會輸出 `INIT_STATUS`／`TOOLS_COUNT`，**exit 3** 表示 HTTP **404** — 請繼續下面「伺服器端」檢查。

## 伺服器端（必查）

1. **Instance-level MCP**  
   n8n：**Settings** → **Instance-level MCP** → 開啟 **MCP access**（名稱依版本可能略有差異）。  
   官方說明：[Set up and use n8n MCP server](https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/)

2. **至少一條 workflow 對 MCP 可見**  
   編輯 workflow → 設為 **Available in MCP**（或將 workflow 加入 MCP 可見清單），並視需要 **Active**。

3. **n8n 版本**  
   MCP HTTP 端點隨版本演進；若仍 404，對照官方 release notes／社群 issue，必要時 **升級** 至文件建議版本。持續維運節奏見下方〈保持 n8n 版本更新〉。

4. **反向代理**  
   前方若有 **Nginx／Apache／Cloudflare**：須把 **`/mcp-server/`**（以及文件要求的 **`/mcp/`**、**`/webhook/`** 等）轉到 n8n 監聽埠（常見 **5678**），並避免錯誤的 **buffering** 導致 SSE／串流失敗（現象有時近似 404／中斷）。  
   Repo 內 Apache 範例：`lobster-factory/infra/hetzner-phase1-core/apache/sites-available/n8n.conf`（`ProxyPass /` → `http://localhost:5678/`）。  
   Staging E2E 與 proxy 注意：`n8n-staging-client-onboarding-e2e.md`（反向代理一節）。

## 保持 n8n 版本更新（自託管）

維持較新版本可取得最新功能與修正；長期落後再一次性大跳版，風險通常較高。

### 升級習慣（官方建議要點）

1. **經常升級**：盡量避免一次跨多個大版本；建議至少 **約每月** 檢視並安排升級，縮小每次變更範圍。
2. **先看 Release notes**：升級前閱讀 [Release notes](https://docs.n8n.io/release-notes/)（breaking changes、資料庫 migration、手動步驟）。
3. **先用測試環境**：使用 n8n **Environments**（或獨立 staging）複製／演練升級，確認 workflow 與 MCP 正常後再上 production。

### 依安裝方式的官方更新說明

具體指令與注意事項以官方為準：

| 安裝方式 | 文件 |
|----------|------|
| **npm**（全域／更新指令） | [Hosting → Installation → npm](https://docs.n8n.io/hosting/installation/npm/)（頁內 **Updating** 一節） |
| **Docker** | [Hosting → Installation → Docker](https://docs.n8n.io/hosting/installation/docker/) |

升級完成後建議再跑本文件〈本機一鍵探測〉，確認 **`INIT_STATUS`**／**`TOOLS_COUNT`** 仍符合預期。

## 客戶端（Cursor／環境）

1. **`N8N_MCP_URL`**：完整 URL，結尾路徑須為 **`…/mcp-server/http`**（與官方自託管 MCP 文件一致）。  
2. **`N8N_AUTH_BEARER_TOKEN`**：來自 n8n MCP **Connection details**，勿混用一般 API Key（除非文件指明相容）。  
3. monorepo 根執行 **`.\scripts\sync-mcp-config.ps1`**，再 **完全重啟 Cursor**，讓 **`${env:…}`** 由使用者環境載入（見 **`mcp-add-server-quickstart.md`** **`sync-cursor-mcp-user-env`**／vault 流程）。

## Related Documents

- `docs/operations/mcp-add-server-quickstart.md`
- `docs/operations/n8n-staging-client-onboarding-e2e.md`
- `mcp/SERVICE_CREDENTIALS_MAP.md`
- `docs/standards/n8n-workflow-architecture.md`
