# Cursor MCP、外掛與工具分工（Agency OS + Monorepo）

> **目的**：補齊「IDE 裡接了什麼 MCP／外掛」與「龍蝦自動化 Routing」之間的空隙。  
> **職責邊界**：**龍蝦執行面**仍以 `[lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)` 為 **強制規格**；本檔描述 **Cursor 對話／本機代理** 可用的 MCP 及其**建議用途**，不作為略過 staging／核准的理由。
> **一頁追溯總表**：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`（工具分工 ↔ 強制路由 ↔ TASKS 對照）

## 1) 憑證與設定（必讀）

- `**mcp.json`**（repo 根或 `~/.cursor/mcp.json`）只應透過 **template + vault／使用者環境** 注入密鑰；**不得**把生效中的 token 寫進 `WORKLOG`、`memory` 或聊天。政策見 `**docs/operations/security-secrets-policy.md`**、`**docs/operations/local-secrets-vault-dpapi.md**`。
- 下表 **「設定鍵」** 指 `mcpServers` 裡的 **名稱**（須與實際 JSON 一致）；新增／改名 MCP 時請 **同步更新本檔**。
- **Cursor 畫面 vs repo**：若專案開在 monorepo 根，**Settings → MCP** 會合併 **使用者** 與 **工作區** 的 `mcp.json`／外掛；列表裡的名稱未必全部出現在 `**D:\Work\mcp.json`**。

## 2) Monorepo `mcp.json`／自訂 MCP（設定鍵 → 建議分工）

> **決策摘要**：**營運與龍蝦相關的權威資料**以 **Supabase（Postgres）** 為 **SoR（system of record）**——與 `[MCP_TOOL_ROUTING_SPEC](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)` 一致。下列 **supabase** 列分 **「平台職責」** 與 **「Supabase MCP（IDE）」**；兩者不要混談。


| 設定鍵                                   | 類型              | 建議負責的事                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 與龍蝦 Routing 的關係                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **supabase**                          | HTTP（plugin／官方） | **平台（SoR）**：**Supabase = Postgres** 存放龍蝦與自動化要的**權威狀態**——多表關聯、欄位與狀態、**稽核與 workflow 紀錄**（如 `workflow_runs`、`approvals`、`incidents`、`artifacts` 等，以實際 migrations／spec 為準）、**Storage** 二進位物件（產物／附件）、**RLS** 列級權限、**Database Webhook** 對外觸發（通常接 **n8n** 或 **Trigger**）。 **Schema 變更**以 **repo migrations** 為準；生產寫入須走 **已核准路徑**，不可繞過 SoR。 **Supabase MCP**：同一設定鍵在 Cursor 裡多半是 **HTTP MCP**（含官方／Plugin OAuth），**僅**用於在 IDE 內 **查 schema、對照官方文件、除錯連線**；若端點宣告 `**read_only`** ，那只約束 **「經 MCP 這條管線」** 不得寫入，**不**代表整個 Supabase 專案只能讀——**業務寫入**仍透過 **應用 API、Edge Function、伺服器端 `service_role`（受控）、n8n、已核准的 Trigger 任務** 等，且須符合 RLS 與 staging／核准政策。環境變數與供應商帳密見 `**docs/operations/tools-and-integrations.md`**。 | **與 Routing 對齊**（摘自／呼應 spec）：**Trigger** 擁有長流程（如 `**site_provisioning`**、`**manifest_apply**`、`**deploy_production**` ……），這些步驟的**持久化與核准狀態**落在 **Supabase**。 **n8n** 只負責輕量膠水：`**webhook_ingress`**、`**crm_sync**`、`**notifications**` —— 可讀寫你為這些流程配置的**營運表**，**資料權威仍在 Postgres（SoR）**，n8n 不升格為控制面。 **GitHub** 管 CI／release gate；**WordPress** 管交付執行時。 **Supabase MCP** **不**對應任何 `task_type`，不能用它 **略過** Trigger、核准或龍蝦 gate。 |
| **wordpress**                         | npx remote      | 官方 WP MCP：**已連線站點**內容／設定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `**runtime_content_ops`**；高風險 = `**runtime_plugin_change**`                                                                                                                                                                                                                                                                                                                                                                 |
| **replicate**                         | npx server      | **Replicate** 推論／影像                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **不**在龍蝦關鍵路徑                                                                                                                                                                                                                                                                                                                                                                                                                |
| **n8n**                               | HTTP MCP        | 雲端 n8n 的 **MCP**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `**webhook_ingress`**、`**notifications**`、`**crm_sync**`                                                                                                                                                                                                                                                                                                                                                                    |
| **github**                            | npx server      | Issues、PR、repo、搜尋                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `**ci_validate`**、`**release_tagging**`                                                                                                                                                                                                                                                                                                                                                                                     |
| **work-global**                       | filesystem MCP  | `C:\Users\…`、`D:\Work` 內讀檔／列目錄                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 開發輔助；`**system-guard`**                                                                                                                                                                                                                                                                                                                                                                                                     |
| **chatgpt-fast** / **chatgpt-latest** | 本地 wrapper      | **OpenAI**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 草擬；**不**取代 SSOT                                                                                                                                                                                                                                                                                                                                                                                                             |
| **claude-fast** / **claude-latest**   | 本地 wrapper      | **Anthropic**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 同上                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **gemini-fast** / **gemini-latest**   | 本地 wrapper      | **Gemini**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 同上                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **perplexity**                        | npx server      | 網搜／引用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 查證輔助                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **copilot**                           | HTTP            | **GitHub Copilot** MCP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 與 **github** 互補                                                                                                                                                                                                                                                                                                                                                                                                             |
| **trigger**                           | PowerShell      | **Trigger.dev** MCP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Trigger** = 多項 **primary_tool** 主人                                                                                                                                                                                                                                                                                                                                                                                        |


### 2.1 常見於使用者層、未必在 repo `mcp.json`


| 設定鍵            | 建議負責的事  | 與龍蝦 Routing              |
| -------------- | ------- | ------------------------ |
| **notion**     | wiki／筆記 | 非 DB 權威                  |
| **slack**（MCP） | 協作      | 近 `**notifications`** 膠水 |


## 3) Plugin MCP Servers（外掛）


| UI 名稱                                | 建議負責的事                                                                                                   | 與龍蝦 Routing                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **cloudflare-***                     | 文件／bindings／builds／observability                                                                         | 輔助交付                                                                                                                                         |
| **clerk** / **sentry** / **posthog** | 各雲商維度                                                                                                    | 輔助                                                                                                                                           |
| **slack**（plugin）                    | 依外掛                                                                                                      | `**notifications`** 類                                                                                                                        |
| **supabase**（plugin）                 | 與 §2 **supabase** 相同：**Postgres SoR** 為權威資料；Plugin 多 **OAuth** 連官方 MCP；IDE 內查 schema／文件／除錯，**不**等同生產寫入管線 | 與 §2 **supabase** 右欄相同：**SoR** 支撐 Trigger 持久化；`**crm_sync` / `webhook_ingress` / `notifications`** 觸及的表仍在 **Postgres**；MCP **無** `task_type` |


## 3.1 MCP 面板狀態


| 狀態        | 處理                        |
| --------- | ------------------------- |
| 綠         | 可用                        |
| 黃 Loading | **Show Output**；重開 Cursor |
| 紅 Error   | 輪替憑證                      |
| No tools  | 查 URL／JWT                 |


## 4) Extensions（非 MCP）

本機管理；影響流程則 **AGENTS.md** + **WORKLOG.md**。

## 5) LLM MCP 順序

perplexity → 內建 + **work-global** → 雲商 MCP → **龍蝦寫入**只靠 **Trigger + Supabase + GitHub**。

## 6) SSOT 索引


| 主題            | 文件                                                       |
| ------------- | -------------------------------------------------------- |
| 龍蝦 Routing    | `**lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`**      |
| Cursor 企業規則索引 | `**docs/operations/cursor-enterprise-rules-index.md**` |
| IDE 架構／MCP 行為 | `**.cursor/rules/64-architecture-mcp-routing.mdc**`      |
| 工具／env／供應商    | `**docs/operations/tools-and-integrations.md**`          |
| 本檔            | `**docs/operations/cursor-mcp-and-plugin-inventory.md**` |
| AGENTS        | `**AGENTS.md**`                                          |
| 新增 MCP 步驟     | `**docs/operations/mcp-add-server-quickstart.md**`       |

## 4) 本機開發：WordPress 與 MariaDB／PHP（**非 MCP**；與 Supabase 並存）

> **釐清**：**Supabase（Postgres）** 仍是平台 **SoR**（見上表 **supabase**）。**MariaDB** 若出現在本機，是給 **WordPress 核心／WP-CLI** 用的 **MySQL 相容資料庫**，不列入 MCP 表、**不能**拿來取代 Supabase 職責。

| 項目 | 說明 |
| --- | --- |
| **何時需要** | 要在本機傳真實 `--wpRootPath` 跑龍蝦 staging／manifest（真 `wp`）時 |
| **正本** | `lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md` |
| **工作站台帳** | `docs/overview/REMOTE_WORKSTATION_STARTUP.md` **§1.5.1**（雙機／筆電對齊） |
| **腳本** | `scripts/setup-wp-cli-windows.ps1`、`scripts/bootstrap-local-wordpress-windows.ps1`（repo 根） |

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `AGENTS.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/operations/tools-and-integrations.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-04-09 09:29:25 UTC_

