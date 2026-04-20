# Cursor／Codex Agent：執行期工具與備援路線（Playbook）

> **目的**：讓 Agent **先以「本條對話／本 runtime 實際可用能力」做事**，不要從另一個終端機的輸出或使用者口述設定**推測**自己已接上 MCP。  
> **職責邊界**：本檔**不**取代 [`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 的強制路由；**不**鼓勵用任何捷徑繞過核准／staging。  
> **機密**：token 只放 **vault／環境變數／Cursor 使用者設定**，**不得**寫入 repo、`WORKLOG`、`memory` 或聊天；見 [`security-secrets-policy.md`](security-secrets-policy.md)。

## 0) 三層能力模型（要配齊才算「真的能幫你營運」）

**付費／訂閱本身不會**自動給 Cursor：本機檔案權限、SSH、Docker、各雲 API token。三層都要由**人＋本機設定**打通；Agent 只會在**已打通**的前提下使用它們。

| 層級 | 是什麼 | 配齊的判斷（摘要） |
|:---|:---|:---|
| **1 — MCP** | Cursor／Codex 暴露的 MCP tools | IDE 裡 server **綠燈**、工具清單**真的出現**該名稱；見 §3。 |
| **2 — 終端／SSH／Docker／CLI** | 整合終端能跑的指令 | **本機**：`git`、`powershell`、`npx`、`ssh` 客戶端等。**遠端 VPS（多為 Linux）**：經 `ssh user@host` 後才有 `docker`、`nginx -t`、`systemctl`（本機 Windows 未必裝 Docker／也沒有主機的 systemd）。 |
| **3 — secrets／env** | 憑證與 token | 只存在 **環境變數、DPAPI vault、Cursor 本機 MCP env**；見 §0.2 與 [`local-secrets-vault-dpapi.md`](local-secrets-vault-dpapi.md)。 |

### 0.1 目標能力（對照「營運面」；不含 GUI 後台點按）

在 §0 三層都成立時，Agent 合理目標包括：**讀寫 monorepo 根（你本機 clone 路徑；Cursor 以工作區根為準）**、經 MCP／API／CLI 操作 **GitHub、Supabase、WordPress、n8n、Trigger、Cloudflare、PostHog、Sentry**（及你另接的 **Canva** 等）、經 **SSH** 查 **Docker／Nginx／Redis／Uptime Kuma／Netdata** 等自託管元件，並以 **API／CLI** 補足沒有 MCP 的場景。  
**不**承諾：替你登入 `…/admin` 類網頁並操作 UI（見 §1 原則 3）。

### 0.2 Cursor MCP：建議至少涵蓋的設定鍵（名稱以 inventory／`mcp.json` 為準）

以下為**常見**清單；實際套件名、HTTP URL、OAuth 以官方／Cursor 外掛為準，並與 [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) 同步。

| 建議鍵／前綴 | 用途（摘要） |
|:---|:---|
| **work-global**（repo 內鍵名 `work-global`） | 本機檔案系統 MCP（路徑允許範圍見該 server 設定） |
| **github** | Issues／PR／repo |
| **supabase** | 多為使用者層 **Plugin／HTTP MCP**；查 schema／除錯（非生產寫入藉口） |
| **wordpress** | 已連線站點內容／設定（需 URL + application password 等） |
| **n8n** | HTTP MCP（n8n 端需啟用 MCP、Bearer 對應環境變數） |
| **trigger** | Trigger.dev MCP（本 repo 有啟動腳本範式） |
| **cloudflare-*** | 外掛常見前綴；DNS／Workers 等輔助 |
| **posthog** | 外掛；產品分析輔助 |
| **perplexity** | 查證／網搜 MCP |
| **canva** | 設計類 MCP（若 Cursor 市集有對應 server） |

### 0.3 終端「要通」的檢查順序（本機 vs SSH 後）

1. **本機（Windows，Agent 整合終端）**  
   - 應能：`git`、`powershell`、`npx`、**OpenSSH 用戶端**（`ssh`）。  
   - `docker` 是否在 PATH **非必須**——多數堆疊查容器是 **`ssh … "docker ps"`** 在 **Linux VPS** 上執行。

2. **遠端（Hetzner 等 Linux）**  
   - 在 **`ssh -o BatchMode=yes … user@your-vps-host`** 成功後，再驗證：  
     `docker ps`、`nginx -t`（若主機有 nginx）、`systemctl`（若使用 systemd）。  
   - **主機名／IP 以 infra 正本為準**（例如 [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md)），**不要**把單一 IP 當唯一 SSOT 寫進 runbook；也不要貼進聊天。

若 **SSH 不通**，則該主機上的 **Docker／Nginx／Redis／Uptime Kuma／Netdata** 等，Agent **無法**可靠代操作，只能改做 repo 內靜態設定或請你先修連線。

### 0.4 環境變數／vault 鍵名（給腳本與 HTTP MCP 用；值不入庫）

以下為**專案／對話裡常引用**的名稱（實際以各 MCP 外掛文件為準）；值只放在 **使用者環境／vault／MCP env**，**不得** commit 到 git。

| 變數（示例） | 典型用途 |
|:---|:---|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub MCP、`@modelcontextprotocol/server-github` |
| `N8N_AUTH_BEARER_TOKEN` | n8n HTTP MCP Bearer（Codex TOML 常配合 `bearer_token_env_var`） |
| `SUPABASE_AUTH_BEARER_TOKEN` 等 | 部分 Supabase HTTP MCP／CLI；**官方外掛可能用 OAuth，鍵名不同** |
| `SENTRY_AUTH_TOKEN` | `sentry-cli`／Sentry API |
| `POSTHOG_API_KEY` | `scripts/posthog-api.ps1`、PostHog REST |
| `CLOUDFLARE_API_TOKEN` | Wrangler／Cloudflare API |
| `COPILOT_MCP_BEARER_TOKEN` | Cursor **copilot** HTTP MCP（`Authorization: Bearer ${env:…}`）；Claude／Codex 亦建議同名變數 |
| `MONOREPO_ROOT` | Claude **work-global**（`.mcp.json`）與 Codex **`work-global`** 的 repo 根路徑（本機絕對路徑） |
| `TRIGGER_PROJECT_REF` | **Codex／Claude** 的 `trigger` MCP（經 `start-trigger-mcp.ps1` 讀環境）；Cursor 仍以 **`.cursor/mcp.json`** 的 `-ProjectRef` 參數為主 |

匯入／輪替流程：[`mcp-add-server-quickstart.md`](mcp-add-server-quickstart.md)、[`mcp-secrets-hardening-runbook.md`](mcp-secrets-hardening-runbook.md)。

## 1) 核心原則（必遵守）

1. **以 runtime 暴露的工具為準**  
   若本條對話的 MCP 面板／工具清單裡**沒有**某 server 名稱（例如 `posthog`、`cloudflare-*`、`n8n`、`wordpress`、`supabase`），就**不要假設**能直接 `call_mcp` 成功。

2. **MCP 不是前置條件**  
   MCP 未綠燈時，**改走** SSH（主機層）／HTTPS API／專案內 CLI；**不要**停在「等 MCP」。

3. **GUI 後台 ≠ Agent 可控面**  
   可宣稱可控：`VPS`、`docker compose`、`nginx` 設定檔、`app`／`api` **容器與部署**、公開 HTTP 探測。  
   **不可**宣稱：能替你**登入** `…/admin` 類網頁並點按 UI（除非另有瀏覽器自動化且不在本 playbook 範圍）。

4. **Cursor 與 Codex 設定可能不同步**  
   兩邊各自讀各自的設定；**一邊驗證過 ≠ 另一邊自動具備**。

## 2) 設定檔：誰讀哪裡

| Runtime | 常見設定位置 | 說明 |
|:---|:---|:---|
| **Cursor（本 repo）** | **`%USERPROFILE%\.cursor\mcp.json`**（建議；密鑰放此）+ 可選本機 **`.cursor/mcp.json`**（已 **gitignore**）+ 範本 **`mcp.json.template`** | Settings → MCP 合併；路徑建議 **`${workspaceFolder}`**；見 [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) §1。 |
| **Claude Code（本 repo）** | monorepo 根 **`.mcp.json`**（`${VAR}` 展開；LLM 經 **`scripts/run-llm-mcp.ps1`**） | 與 Cursor **server 名稱**對齊便於對照；見 [Claude MCP](https://code.claude.com/docs/en/mcp)。 |
| **Codex CLI（本 repo）** | monorepo 根 **`.codex/config.toml`**（合併於 **`%USERPROFILE%\.codex\config.toml`** 之上；以官方載入順序為準） | **`[mcp_servers.*]`**；HTTP 用 **`bearer_token_env_var`**；Windows stdio 維持 **`cmd /c`** 前綴；見 [Codex MCP](https://openai-codex.mintlify.app/configuration/mcp-servers)。 |

**Agent 動作**：接到任務時，若需 MCP，先確認**當前** runtime 讀的是哪一個設定來源，再查該檔是否存在、鍵名是否與 inventory 一致。

## 3) 驗證 MCP（不要猜格式）

- **Cursor**：以 IDE **MCP 面板狀態**為準（綠／紅／No tools）；新增流程見 [`mcp-add-server-quickstart.md`](mcp-add-server-quickstart.md)、機密匯入見 [`local-secrets-vault-dpapi.md`](local-secrets-vault-dpapi.md)。
- **Codex**：以官方 CLI 為準（版本不同指令可能差異），典型順序：`codex mcp --help` → `codex mcp list`。

**HTTP MCP（Codex TOML）**：優先使用 **`bearer_token_env_var`** 指向環境變數，避免把 Bearer 明文寫進 repo。

## 4) 備援階梯：SSH → 容器 → 反代

當「雲端 SaaS MCP」不可用時，**自託管堆疊**通常可用下列路線排查與操作（須符合資安與核准政策）：

1. **SSH**  
   - 主機與帳號以 **infra 正本**為準（例如 [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md)、[`hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md)），**不要**把固定 IP 當作唯一 SSOT 寫進本檔。  
   - 本機建議先測非互動：`ssh -o BatchMode=yes -o ConnectTimeout=10 <user>@<host> "hostname && whoami"`。

2. **Docker（在遠端主機上）**  
   - 例：`ssh <user>@<host> "docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}'"`  
   - 用於確認：`wordpress`、`next-admin`、`node-api`、`uptime-kuma`、`n8n`、`trigger`、`supabase`、`redis` 等容器是否如預期。

3. **Nginx**  
   - 設定正本通常在 repo 的 `lobster-factory/infra/hetzner-phase1-core/nginx/`；上線 reload 須依 **LONG_TERM_OPS**／變更流程。

4. **Netdata／Uptime Kuma**  
   - 多為**主機或容器內服務**；優先 **SSH + 埠／程序**確認，而非假設能操作其 Web UI。

## 5) 不依賴 MCP 的 API／CLI 路線（本 monorepo）

| 能力 | 建議做法 | 備註 |
|:---|:---|:---|
| **PostHog** | monorepo 根下 **`scripts/posthog-api.ps1`**；環境變數 **`POSTHOG_API_KEY`** 或本機 vault 鍵名同左 | 腳本已內建從 vault 讀取邏輯，見腳本開頭。 |
| **Sentry** | 設定 **`SENTRY_AUTH_TOKEN`** 後使用 **`npx @sentry/cli`**（或專案內已安裝的 `sentry-cli`） | 以 `info`／`releases` 等子命令驗證；路徑隨 `npm install` 變動，**不要**在文件硬編唯一絕對路徑。 |
| **Cloudflare** | **`wrangler`** 或 Cloudflare HTTP API + token（環境變數） | MCP 為加分項，非必要。 |
| **Supabase** | 自託管：**SSH + 容器**檢查 stack；schema／migration 仍以 **repo migrations** 為準 | Supabase MCP（若接）僅輔助查 schema／除錯，見 inventory。 |

## 6) 何時才「補齊 MCP」

當 **SSH／API／CLI** 已穩定可重複執行後，再把高頻操作補進 **Cursor／Codex MCP**，以降低每次手打指令的成本。  
**不要**把「MCP 尚未接上」當成無法交付的理由。

## 7) 與其他 SSOT 的關係

| 主題 | 正本 |
|:---|:---|
| MCP 鍵名與 IDE 分工 | [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) |
| 平台能力／P 階段／TASKS | [`TOOLS_DELIVERY_TRACEABILITY.md`](TOOLS_DELIVERY_TRACEABILITY.md) |
| 強制編排路由 | [`MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) |
| 架構規則（含 MCP 摘要） | monorepo `.cursor/rules/64-architecture-mcp-routing.mdc` |

_Last updated: 2026-04-18_
