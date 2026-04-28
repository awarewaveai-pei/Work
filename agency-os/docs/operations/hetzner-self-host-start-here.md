# Hetzner 自架：只記這一頁（人因入口）

> **給你自己**：記性不好沒關係 — **瀏覽器書籤只加這個檔**。其餘連結都在下面 **一張表**；不要到處記檔名。  
> **路徑（monorepo）**：`agency-os/docs/operations/hetzner-self-host-start-here.md`  
> **Owner**：本檔；細節與「牽一髮動全身」仍由 **`hetzner-stack-rollout-index.md`** 維護，但 **你不用先讀那一整份**。  
> **環境變數**：本頁 **「環境變數唯一對照」** 是唯一心智模型；其它 `.env.example` 只重複「消費端需要的鍵」，**輪替／對齊只照本節**，避免東一塊西一塊。

---

## 環境變數唯一對照（統一管理）

**為什麼不能變成一個實體檔？** 本機腳本與伺服器 Docker **跑在不同機器、不同行程**；Git **不能**收納真密鑰。規劃上能統一的是：**一張表**訂下「哪幾個檔、各自給誰讀、改變時一起改」。

| 用途 | 誰讀 | 範本（可入庫） | 真值檔（勿提交） | 與 Supabase 有關時 |
|------|------|----------------|------------------|---------------------|
| **本機 RAG（根目錄 npm 腳本）** | `rag:*` | monorepo 根 **`.env.local.example`** → 複製成 **`.env.local`** | **`<WORK_ROOT>/.env.local`**（git 根目錄，與 `package.json` 的 `rag:*` 同層） | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY` 等見範本 |
| **Phase1 Docker（n8n / WP / Next / node-api…）** | 伺服器 `docker compose` | **`lobster-factory/infra/hetzner-phase1-core/.env.example`** → 伺服器上 **`.env`** | 僅 VPS 上該目錄 **`.env`** | 與上面**同一組**自架 Supabase 時，**URL 與 anon / service_role 語意需對齊**（連線從容器／主機角度可不同，但**密鑰與專案必須一致**） |
| **整體堆疊「型別提醒」** | 人讀 | **`docs/operations/hetzner-self-host.env.example`** | （不當執行檔；不複製密鑰進 git） | 與切線／runbook 對照用 |

**輪替／換網址時（強制同一輪做完）**

1. 改 **Supabase 端**（或 dashboard）產物。  
2. 改 **本機** `.env.local`。  
3. 改 **VPS** `hetzner-phase1-core/.env`，並依該目錄 README **reload / compose up**。  
4. `WORKLOG` **一句話**（不含祕密）記「已輪替／已雙邊對齊」。

**之前沒有寫成這一節，是我這邊規劃不周；** 技術上仍會有兩個實體檔，但 **決策與步驟只認本節**，避免害你漏改一邊。

---

## 三句版規則

1. **我現在進度寫在哪？** → 只維護 **`hetzner-stack-rollout-index.md` 上面的「專案狀態」表格**，並在 **`WORKLOG.md`** 一句話（不含祕密）。  
2. **要改堆疊順序／加元件？** → 改 **`hetzner-stack-rollout-index.md`**，再照 **`docs/CHANGE_IMPACT_MATRIX.md`** 那一列同步。**要改／輪替環境變數？** → **只照上面「環境變數唯一對照」**。  
3. **日常開工／收工** → 仍照 **`REMOTE_WORKSTATION_STARTUP.md`**、**`end-of-day-checklist.md`**（與本頁無衝突）。

---

## 我要做○○ → 只開這一個檔

| 我要… | 開這個（從 `agency-os/` 出發的相對路徑） |
|--------|------------------------------------------|
| **看／改「已裝什麼、下一步」** | [`docs/operations/hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md)（頂部表格） |
| **按步驟裝機（主機到服務）** | [`docs/operations/hetzner-full-stack-self-host-runbook.md`](hetzner-full-stack-self-host-runbook.md) |
| **Supabase 自架／切線／pgvector** | [`docs/operations/supabase-self-hosted-cutover-checklist.md`](supabase-self-hosted-cutover-checklist.md) |
| **一組 Docker 起 n8n + WP + Redis + Nginx + Node + Next**（**不含** Supabase、**不含** Trigger） | [`../../../lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md) |
| **Trigger.dev 自託管**（compose、Nginx 反代、`lobster-net`、**SSH 救濟**、啟動順序） | [`../../../lobster-factory/infra/trigger/README.md`](../../../lobster-factory/infra/trigger/README.md) |
| **`.env` 欄位類型提醒** | [`docs/operations/hetzner-self-host.env.example`](hetzner-self-host.env.example) |
| **本機 RAG：`.env.local` 範本** | monorepo 根 [`../../../.env.local.example`](../../../.env.local.example)（先讀上方 **環境變數唯一對照**） |
| **Phase 1 這包的 `.env` 範本** | [`../../../lobster-factory/infra/hetzner-phase1-core/.env.example`](../../../lobster-factory/infra/hetzner-phase1-core/.env.example) |
| **Trigger 自託管這包的 `.env` 範本**（僅 VPS `infra/trigger`，勿與 phase1 `.env` 混檔） | [`../../../lobster-factory/infra/trigger/.env.example`](../../../lobster-factory/infra/trigger/.env.example) |
| **多週期備份／還原／誰負責** | [`../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`](../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md) |
| **每週／月／季／年勾選** | [`../../../lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md`](../../../lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md) |
| **GitHub 上 `packages/workflows` 變更會跑什麼** | [`docs/operations/github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md)（**僅 validate**；**無** Trigger Cloud deploy） |
| **Trigger 跟 n8n 誰做什麼（硬規則）** | [`../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) |

---

## 和 `TASKS.md` 的關係

- **粗活／優先序** → 看 **`TASKS.md` Next**。  
- **Hetzner 相關細項** → 仍以本頁表格跳轉；避免在 `TASKS` 重貼長路徑。

---

## Related（給維護者）

- **`hetzner-stack-rollout-index.md`**（連動索引、必查矩陣）  
- **`docs/CHANGE_IMPACT_MATRIX.md`**  

## Related Documents (Auto-Synced)
- `../.env.local.example`
- `../lobster-factory/infra/hetzner-phase1-core/.env.example`
- `AGENTS.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/change-impact-map.json`
- `docs/operations/hetzner-full-stack-self-host-runbook.md`
- `docs/operations/hetzner-self-host.env.example`
- `docs/operations/hetzner-stack-rollout-index.md`
- `docs/DOCS_INDEX.md`
- `memory/CONVERSATION_MEMORY.md`
- `README.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-06 08:05:53 UTC_

