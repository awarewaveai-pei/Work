# Hetzner 自架堆疊：安裝順序 × 平面 × 連動索引（單一入口）

> **Owner（本檔）**：把「第一階段 10 項核心 + 第二階段觀測／儲存 4 項」與 **Data / Execution / Delivery / Control / Infra** 平面的對照、**實裝落點（compose）、與 repo 內 SSOT** 收斂在一處。  
> **目的**：改安裝順序、改名稱、或增刪元件時，**先改本檔**，再依 **`docs/CHANGE_IMPACT_MATRIX.md`** 本列「必查」同步其他檔案 — **牽一髮動全身**。  
> **實裝細節**：步驟級 runbook 仍以 **`hetzner-full-stack-self-host-runbook.md`** 為準；本檔不重複長流程。  
> **狀態欄**：以下「專案狀態」需隨進度更新，並在 **`WORKLOG.md`** 留一句（不含祕密）。

---

## 專案狀態（請隨進度改寫）

| 欄位 | 值 |
|------|-----|
| **最後更新** | 2026-04-06 |
| **已知已上 Hetzner** | **Supabase（自架）**、**WordPress** |
| **下一優先（Phase A 缺口）** | 確認 **pgvector**；**Redis**；**n8n**；**Trigger.dev**（雲端或自架擇一並文件化）；**Node API** + **Next.js Admin**；**Nginx** 反代／TLS；**備份 + 還原演練** |
| **捷徑** | 執行層與交付層可一次用 **`lobster-factory/infra/hetzner-phase1-core/`** compose 起 **Nginx、Redis、n8n、WP、Node API、Next Admin**（**不含** Supabase、**不含** Trigger）— 見該目錄 `README.md` |

---

## Phase A — 第一階段核心（10 項）

序號為 **業務心智清單**；**實裝順序**可能與序號不同 — 以 **runbook 階段** + **相依** 為準（例如 Redis 常早於 Trigger；Nginx／TLS 在對外 URL 前）。

| # | 元件 | 平面 | 說明 | 主要 SSOT / 落點 |
|---|------|------|------|------------------|
| 1 | **Supabase** | Data | SoR：Postgres + Auth + API + Storage | `hetzner-full-stack-self-host-runbook.md` 階段 2；`supabase-self-hosted-cutover-checklist.md` |
| 2 | **pgvector** | Data | RAG／向量（Postgres 擴充） | `supabase-self-hosted-cutover-checklist.md`（`CREATE EXTENSION vector`）；runbook 階段 2 |
| 3 | **WordPress** | Delivery | 交付 runtime（非 SoR） | runbook 階段 4；**或** `hetzner-phase1-core` compose 內 WP |
| 4 | **n8n** | Execution（膠水） | Webhook、通知、輕量同步 | runbook 階段 3；`hetzner-phase1-core`；**邊界** `MCP_TOOL_ROUTING_SPEC.md` |
| 5 | **Trigger.dev** | Execution（長流程） | 重試、長編排、核准等待 | runbook 階段 3 + 官方 self-host；**或** Trigger Cloud（與 **GitHub Actions** deploy 分離也須文件化）；**邊界** `MCP_TOOL_ROUTING_SPEC.md` |
| 6 | **Next.js Admin** | Control | 營運／租戶控制台表面 | `hetzner-phase1-core/apps/next-admin`（範例）；**正式產品路徑**另見藍圖／租戶 SOP |
| 7 | **Node API** | Execution | RAG／BFF／複雜整合 | `hetzner-phase1-core/apps/node-api`（範例）；`hetzner-self-host.env.example` 類型提示 |
| 8 | **Nginx** | Infra | 反代、TLS 終止（可換 Caddy／Traefik） | runbook 階段 1–6；`hetzner-phase1-core/nginx` |
| 9 | **Redis** | Infra | 快取／鎖；Trigger 自架常需 | runbook 階段 3；`hetzner-phase1-core` |
| 10 | **Backup** | Infra | DB、卷、異地、還原演練 | `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`、`MAINTENANCE_CALENDAR.md`；`lobster-factory/infra/hetzner-phase1-core/scripts/backup-phase1.sh`（**僅** Phase 1 compose 邊界內）；**Supabase** 備份另依切線清單 |

**平面對照（你的分類）：**

| 平面 | 涵蓋 |
|------|------|
| Data | Supabase + pgvector |
| Execution | n8n + Trigger.dev + Node API |
| Delivery | WordPress |
| Control / Admin | Next.js Admin |
| Infra | Nginx + Redis + Backup |

---

## Phase B — 第二階段（觀測／儲存擴充）

| # | 元件 | 用途 | 主要參考 |
|---|------|------|----------|
| 11 | **MinIO** | S3 相容；大檔、備份、Storage 後端 | runbook 目標堆疊；`hetzner-self-host.env.example`；階段 2 |
| 12 | **Sentry** | 錯誤、trace、incident | `TASKS.md` Enterprise；`PROGRAM_TIMELINE.md`；`tools-and-integrations.md` |
| 13 | **PostHog** | Analytics、flags、實驗 | 同上 |
| 14 | **Langfuse** | LLM observability、prompt、eval | `PROGRAM_TIMELINE.md`（評估項）；可晚於核心路径 |

與 **`docs/overview/ao-lobster-operating-model.md`** 圖中的 **Observability** 平面一致；**未上線前**不要求一次備齊，但索引與 `TASKS` 應保持對齊。

---

## 本主題在 repo 裡「還出現在哪裡」（避免雙寫長文）

| 檔案 | 角色 |
|------|------|
| **`hetzner-full-stack-self-host-runbook.md`** | 階段 0–6 **步驟級**清單 |
| **`hetzner-self-host.env.example`** | 變數「類型」提醒；並指回 `hetzner-phase1-core/.env.example` |
| **`lobster-factory/infra/hetzner-phase1-core/README.md`** | **單一 compose** 收斂多個 Phase A 元件（不含 Supabase / Trigger） |
| **`LONG_TERM_OPS.md` / `MAINTENANCE_CALENDAR.md`** | 多週期營運、備份、演練 |
| **`supabase-self-hosted-cutover-checklist.md`** | Supabase 專用切線／pgvector |
| **`MCP_TOOL_ROUTING_SPEC.md`** | Trigger vs n8n **強制分工** |
| **`docs/overview/ao-lobster-operating-model.md`** | Execution / Data / Observability **概念圖** |
| **`TASKS.md`** | **待做**與優先序（應連回本檔） |

---

## 變更本檔時必做（牽一髮動全身）

1. 更新上表 **專案狀態**（或改 `TASKS.md` 並在此只保留連結 — **擇一為準避免漂移**；建：**狀態以 `TASKS` + `WORKLOG` 為準**，本檔 **專案狀態**表每月對齊一次）。  
2. 對照 **`docs/CHANGE_IMPACT_MATRIX.md`** 本檔那一列，掃過所有 **必查** 路徑。  
3. 若改 **平面定義** 或 Trigger/n8n 邊界：必查 **`MCP_TOOL_ROUTING_SPEC.md`**、`ao-lobster-operating-model.md`。  
4. 跑 **`scripts/doc-sync-automation.ps1 -AutoDetect`**（治理檔變更）。

---

## Related

- `docs/operations/hetzner-full-stack-self-host-runbook.md`  
- `docs/operations/hetzner-self-host.env.example`  
- `docs/operations/supabase-self-hosted-cutover-checklist.md`  
- `lobster-factory/infra/hetzner-phase1-core/README.md`  
- `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`  
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`  
- `docs/overview/ao-lobster-operating-model.md`  
- `docs/CHANGE_IMPACT_MATRIX.md`  

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`
- `../lobster-factory/infra/hetzner-phase1-core/README.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/operations/hetzner-full-stack-self-host-runbook.md`
- `docs/operations/hetzner-self-host.env.example`
- `docs/operations/supabase-self-hosted-cutover-checklist.md`
- `docs/overview/ao-lobster-operating-model.md`
- `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- `docs/README.md`
- `memory/CONVERSATION_MEMORY.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-06 07:34:04 UTC_

