# 自託管 n8n：MCP（`/mcp-server/http`）連線與 404 排查

> **適用**：Self-hosted n8n（非 n8n Cloud 專用路徑）；Cursor／Codex 等使用 **`mcp/registry.template.json`** 內 **`n8n`** → **`${env:N8N_MCP_URL}`**。  
> **勿**在 repo 寫入明文 token；本機填 **`mcp/user-env.ps1`**（由 **`user-env.template.ps1`** 複製）。

## 現象

- 瀏覽器或 MCP 探測對 **`https://<host>/mcp-server/http`** 得到 **404**（有無 `Authorization` 皆然）。
- Cursor **Settings → MCP → n8n** 顯示連線失敗或無工具。

**含義**：多半是 **`N8N_PATH`／公開 URL 與 Cursor 設定的 MCP URL 不一致**、**n8n 未公開 MCP 路由**、**反向代理未轉發該路徑**、或 **版本過舊／已知問題**——不只是 token 錯誤（錯 token 較常見 **401**）。

## N8N_PATH 與公開 MCP URL（對照表）

**規則**：MCP 必須打在「與 n8n **對外 UI 相同網址階層**」底下的 **`…/mcp-server/http`**（見官方 [MCP server](https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/)）。下列為本 monorepo **Hetzner Phase 1** 常見兩種合法組合（**勿混用**）。

| 型態 | 容器 **`N8N_PATH`** | 範例公開 UI | **`N8N_MCP_URL`（Cursor／smoke）** |
|------|----------------------|---------------|-------------------------------------|
| **Pattern A** — 主站子路徑 | **`/n8n/`** | `https://aware-wave.com/n8n/` | `https://aware-wave.com/n8n/mcp-server/http` |
| **Pattern B** — 專用子網域根路徑 | **`/`** | `https://n8n.aware-wave.com/` | `https://n8n.aware-wave.com/mcp-server/http` |
| **本機直連**（無反代） | 多為 **`/`** | `http://127.0.0.1:5678/` | `http://127.0.0.1:5678/mcp-server/http`（若 `N8N_PATH=/n8n/` 則為 `…/n8n/mcp-server/http`） |

**典型 404（Pattern B）**：Apache／Nginx 已把 **`n8n.aware-wave.com/`** 反代到容器根，但容器仍設 **`N8N_PATH=/n8n/`** → n8n 實際掛在 **`/n8n/…`**，對 **`https://n8n.aware-wave.com/mcp-server/http`** 會 **404**。修法：**.env** 設 **`N8N_PATH=/`**、對齊 **`N8N_WEBHOOK_URL`**、重啟容器。**長註解與升級**見 **`lobster-factory/infra/hetzner-phase1-core/.env.example`**、同目錄 **`README.md`**。

## Hetzner Phase 1 compose（路徑正本索引）

- **`lobster-factory/infra/hetzner-phase1-core/.env.example`**：**Pattern A／B** 完整範例（**Owner**：與 compose／Apache 範例一致處即為準）。
- **`lobster-factory/infra/hetzner-phase1-core/README.md`**：n8n **映像升級**與驗收指令。
- **勿**在第三份文件複製整段表格——本檔為 **IDE／營運速查**；數值以伺服器 **`.env`** 為準。

### 另有獨立 compose（例：主機上 `/root/n8n`）

與 **`hetzner-phase1-core/docker-compose.yml` 可並存**另一份營運用 compose，repo 正本為 **`lobster-factory/infra/n8n/docker-compose.yml`**（伺服器部署路徑常見 **`/root/n8n/docker-compose.yml`**，接 **external** network `supabase_default`）。**路徑規則仍為上文對照表**；生產常為 **Pattern B**（**`N8N_PATH=/`**，**`N8N_MCP_URL`** 形如 **`https://n8n.<網域>/mcp-server/http`**，以實際網域為準）。

- **映像／semver**：**不得**用本檔或 **`hetzner-phase1-core/.env.example`** 的 **`N8N_IMAGE_TAG` 預設**當作該機唯一真相——**以該 compose 與該機 `.env` 釘選為準**（兩套 stack 版本可合理不同）；升級節奏見 **`lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`** 與 **`WORKLOG`** 留痕。
- **路由快驗**（無 Bearer）：對 **`N8N_MCP_URL` POST** 空 body，預期 **401**（例如含 `Authorization` 未送／header not sent 等語意）代表 **路由存在**；若 **404** 再查 **`N8N_PATH`**、反代、Instance MCP。

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

### Smoke 與 `TRY_ALT_MCP_URL`（404 時）

實作：**`scripts/n8n-mcp-smoke.mjs`**。當 **404** 且目前 URL 路徑為 **`/mcp-server/http`**（結尾相符亦同）時，可能輸出 **`TRY_ALT_MCP_URL=`** 指向 **`{同一 origin}/n8n/mcp-server/http`**，僅在：

- **hostname** 非 **`localhost`／`127.0.0.1`**，且  
- **非** **`n8n.*`** 子網域（專用子網域應已用 **Pattern B**，不需再加 **`/n8n/`** 前綴）。

用途：你在 **apex 網域**誤設了無 **`/n8n/`** 的 MCP URL，而伺服器實際為 **Pattern A**。若 **`TRY_ALT`** 仍 404，請回到上文對照表查 **`N8N_PATH`**／反代，而非反覆更換猜測 URL。

## 伺服器端（必查）

1. **Instance-level MCP**  
   n8n：**Settings** → **Instance-level MCP** → 開啟 **MCP access**（名稱依版本可能略有差異）。  
   官方說明：[Set up and use n8n MCP server](https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/)

2. **至少一條 workflow 對 MCP 可見**  
   編輯 workflow → 設為 **Available in MCP**（或將 workflow 加入 MCP 可見清單），並視需要 **Active**。

3. **n8n 版本**  
   MCP HTTP 端點隨版本演進；若仍 404，對照官方 release notes／社群 issue，必要時 **升級** 至文件建議版本。持續維運節奏見下方〈保持 n8n 版本更新〉。

4. **反向代理與 `N8N_PATH`**  
   前方若有 **Nginx／Apache／Cloudflare**：須把 **`/mcp-server/`**（以及 **`/mcp/`**、**`/webhook/`** 等）依 **上文對照表**與 **容器 `N8N_PATH`** 對齊後轉到 n8n **5678**，並避免錯誤 **buffering**（SSE 失敗有時像 404／中斷）。  
   Repo：**Apache** `lobster-factory/infra/hetzner-phase1-core/apache/sites-available/n8n.conf`；**系統 Nginx** 片段 `lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/lobster-aware-wave-locations.inc`（**/n8n/**）。Staging：`n8n-staging-client-onboarding-e2e.md`。

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

---

## Cursor MCP 狀態抖動（green→yellow→red、"No tools"）

> **已知問題**：以 `transport: "http"` 連線時，Cursor MCP 客戶端在 POST initialize 後，會再對同一端點發 **GET 請求**嘗試建立 SSE 持久串流。n8n 的 `/mcp-server/http` **不支援 GET**（回 `404`），導致 Cursor 狀態持續抖動並顯示 "No tools"，即使後端完全正常。

### 根因

| 步驟 | 行為 |
|------|------|
| POST `/mcp-server/http` | n8n → `200 OK`（initialize 成功） |
| GET `/mcp-server/http` | n8n → `404`（不支援） |
| Cursor 收到 404 | 報錯、重連 → 迴圈 → 狀態不斷閃爍 |

### 修法（一次性、已套用）

**`mcp/registry.template.json`** 的 `n8n` 條目從 `transport: "http"` 改為 **`transport: "stdio"`**，透過 **`scripts/run-n8n-mcp.mjs`** 橋接腳本轉發請求：

```
Cursor stdin → run-n8n-mcp.mjs → POST /mcp-server/http → n8n
```

橋接腳本只使用 `POST`，完全迴避 GET 問題，並同時處理 n8n 可能回傳的 JSON 與 SSE 格式。

**套用步驟**（日後若需重建／換機）：

```powershell
# 1. 確認 registry 已是 stdio 設定（正常已內含）
# 2. 重新生成客戶端設定
powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1
# 3. 重載 Cursor 視窗
# Ctrl+Shift+P → Developer: Reload Window
```

**驗証**：

```powershell
# 後端健康確認（TOOLS_COUNT 應 > 0；實際數量隨 MCP 可見 workflow 數而異）
node .\scripts\n8n-mcp-smoke.mjs
```

Cursor MCP 面板對 `n8n` 應穩定顯示綠燈，不再跳色。

### 判斷 GET vs 後端真正故障

| 現象 | 原因 | 處置 |
|------|------|------|
| smoke 200、Cursor 紅燈閃爍、"No tools" | Cursor GET 被 n8n 拒 → 改 stdio 橋接（上述） |
| smoke 404 | 路由/N8N_PATH/反代設定錯誤 → 見〈N8N_PATH 與公開 MCP URL〉 |
| smoke 401 | Bearer token 無效或過期 → 從 n8n Connection details 重取 |
| smoke 200 且 TOOLS_COUNT=0 | n8n 無 workflow 設為 MCP 可見 → 見〈伺服器端〉步驟 2 |

---

## Related Documents

- `docs/operations/mcp-add-server-quickstart.md`
- `docs/operations/n8n-staging-client-onboarding-e2e.md`
- `lobster-factory/infra/hetzner-phase1-core/.env.example`（Pattern A／B **Owner**）
- `mcp/SERVICE_CREDENTIALS_MAP.md`
- `docs/standards/n8n-workflow-architecture.md`
