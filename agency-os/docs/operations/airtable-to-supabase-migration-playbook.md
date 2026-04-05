# Airtable → Supabase：功能承接與遷移

> **結論（先講清楚）**：決定 **不用 Airtable** 時，代表 **同一類能力**（表格式營運資料、清單、狀態機、自動化觸發）**應由 Supabase 與周邊**（RLS、Edge／API、**n8n**、必要時 **Trigger.dev**）承接——**不是**只拔掉 MCP 就結束。  
> 先前已做的是 **停用連線與治理文件**；**schema／資料／n8n 改接** 須依本檔逐步完成。

## 0) **本 repo 沒寫過「我們用 Airtable 做什麼」時**（常見真實情況）

**`cursor-mcp-and-plugin-inventory` 不會代你回答這題**——表格式文件只能寫 **通用對照**；**貴司實際 base／表／欄位／誰在寫** 必須補證據，否則無法正確建模。

建議**證據順序**（做到一項勾一項，結果寫進 **§5** 或 **`WORKLOG.md`**）：

1. **還進得去 Airtable**：截屏或匯出 **base 列表 + 每張表欄位**（可 CSV）；**最重要的**是「哪張表給哪個流程用」。
2. **n8n**：在 workflow 里搜 **`airtable.com`**、**`Airtable` node**；複製 workflow 名稱與觸發條件。
3. **本 repo**：`rg -i airtable`（含舊 MD、`.env.example`、註解）。
4. **人**：問當時維護同事／客戶窗口「哪幾張表是 single source」。
5. **以上皆無**：在 **`WORKLOG`** 明寫 **「無法還原 Airtable 用途；推定無正式依賴或僅個人實驗」**，並只做 **關帳號／revoke key**；**不要**瞎建一堆 `ops_*` 表假裝遷完了。

有了 §0 輸出後，§1～§2 才有意義。

## 1) 能力對照（Airtable 概念 → Supabase 慣例）

| 你在 Airtable 里用來做的事 | 在 Supabase 的承接方式 |
|----------------------------|-------------------------|
| **Base**（一組相關表） | 一個 **Postgres schema**（例：`ops`、`crm`）或前綴表名；與龍蝦核心 **`organizations` / `workspaces`** 可並存，用 **FK** 或 `workspace_id` 關聯 |
| **Table + Fields** | **`CREATE TABLE`** + 欄位型別（文字、數字、日期、`jsonb` 彈性欄位）；複雜選項可用 **CHECK / enum type** 或 `jsonb` |
| **Linked record** | **Foreign key**（`uuid`）+ 必要時 **ON DELETE** 規則 |
| **Single select / Multi select** | **text + CHECK**、**Postgres enum**、或 **junction table**（多對多） |
| **Attachment** | **Supabase Storage** bucket + 表中存 **path／public URL**；大檔不要塞進 base64 |
| **Formula / Rollup**（簡單） | **Generated column**、**VIEW**、或 **觸發器**；複雜rollup可 **定時 job**（n8n／Trigger） |
| **View（篩選、排序）** | **SQL VIEW** 或 **API 查詢**（應用層）；儀表板用 **只讀 view** |
| **Automations（當列變更就…）** | **Supabase Database Webhooks** → **n8n**；或 **Trigger.dev** 輪詢／事件（與 [`MCP_TOOL_ROUTING_SPEC`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 對齊：重編排在 Trigger，輕鬆黏在 n8n） |
| **表單／對外填寫** | **網頁 + insert**（RLS 允許 `anon` 寫入限定欄）或 **單一用途 RPC**；敏感表 **禁止 anon** |
| **權限（誰能改哪張表）** | **RLS policies**（依 `auth.uid()`、`workspace_id`、role）；服務帳號用 **service_role** 僅在伺服器 |

## 2) 建議執行順序（最小風險）

1. **盤點**：每個 Airtable base／表／主要欄位／誰在寫／哪條 n8n 依賴（列在下方 §5 空白模板）。  
2. **建模**：在 Supabase 建 **migration**（與龍蝦既有 `packages/db/migrations` **分層**：營運表可新檔 `00xx_ops_*.sql`，避免混在 wc-core 若團隊希望分開）。  
3. **RLS**：預設 **全部鎖**；再對「需要登入／僅內部」開 policy。  
4. **匯資料**：Airtable **Export CSV** → **`COPY`** 或一次性腳本（**不入庫** token；在本機跑）。  
5. **改接**：n8n／自用小工具 **URL + key** 改指 Supabase；**双跑**一短窗口後關 Airtable。  
6. **驗證**：health／手動抽樣列數、關鍵自動化 **dry-run**。

## 3) 與現有 monorepo 的關係

- **龍蝦工廠**：Supabase 已是 **system of record**（見 Routing spec）；營運／Campaign 類 **新表**應遵守同一套 **tenant/workspace 隔離** 思維。  
- **Cursor**：用 **Supabase MCP**（HTTP／plugin）做 **讀 schema、debug**；**正式 DDL** 走 **migration 檔 + PR**，不要只靠 GUI「點一點」上正式環境。

## 4) 憑證與安全

- 已廢止 **AIRTABLE_API_KEY**：請在供應商後台 **revoke**。  
- Supabase：**service_role** 僅後端／自動化；前端／n8n 公開節點用 **anon + RLS**。

## 5) 遷移盤點模板（請填在內部或 `WORKLOG`）

| Airtable Base | 表名 | 主要用途 | 取代：Supabase 表／schema | n8n／誰依賴 | 狀態 |
|---------------|------|----------|---------------------------|-------------|------|
| _例_ Campaign | Leads | 名單 | `ops.leads` | Workflow #12 | todo |

## Related Documents (Auto-Synced)
- `docs/operations/tools-and-integrations.md`
- `docs/standards/n8n-workflow-architecture.md`
- `WORKLOG.md`

_Last synced: 2026-03-29 18:43:48 UTC_

