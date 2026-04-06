# Hetzner 自架：只記這一頁（人因入口）

> **給你自己**：記性不好沒關係 — **瀏覽器書籤只加這個檔**。其餘連結都在下面 **一張表**；不要到處記檔名。  
> **路徑（monorepo）**：`agency-os/docs/operations/hetzner-self-host-start-here.md`  
> **Owner**：本檔；細節與「牽一髮動全身」仍由 **`hetzner-stack-rollout-index.md`** 維護，但 **你不用先讀那一整份**。

---

## 三句版規則

1. **我現在進度寫在哪？** → 只維護 **`hetzner-stack-rollout-index.md` 上面的「專案狀態」表格**，並在 **`WORKLOG.md`** 一句話（不含祕密）。  
2. **要改堆疊順序／加元件？** → 改 **`hetzner-stack-rollout-index.md`**，再照 **`docs/CHANGE_IMPACT_MATRIX.md`** 那一列同步。  
3. **日常開工／收工** → 仍照 **`REMOTE_WORKSTATION_STARTUP.md`**、**`end-of-day-checklist.md`**（與本頁無衝突）。

---

## 我要做○○ → 只開這一個檔

| 我要… | 開這個（從 `agency-os/` 出發的相對路徑） |
|--------|------------------------------------------|
| **看／改「已裝什麼、下一步」** | [`docs/operations/hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md)（頂部表格） |
| **按步驟裝機（主機到服務）** | [`docs/operations/hetzner-full-stack-self-host-runbook.md`](hetzner-full-stack-self-host-runbook.md) |
| **Supabase 自架／切線／pgvector** | [`docs/operations/supabase-self-hosted-cutover-checklist.md`](supabase-self-hosted-cutover-checklist.md) |
| **一組 Docker 起 n8n + WP + Redis + Nginx + Node + Next**（**不含** Supabase、**不含** Trigger） | [`../../../lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md) |
| **`.env` 欄位類型提醒** | [`docs/operations/hetzner-self-host.env.example`](hetzner-self-host.env.example) |
| **Phase 1 這包的 `.env` 範本** | [`../../../lobster-factory/infra/hetzner-phase1-core/.env.example`](../../../lobster-factory/infra/hetzner-phase1-core/.env.example) |
| **多週期備份／還原／誰負責** | [`../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`](../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md) |
| **每週／月／季／年勾選** | [`../../../lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md`](../../../lobster-factory/infra/hetzner-phase1-core/MAINTENANCE_CALENDAR.md) |
| **GitHub 上怎麼部署 Trigger** | [`docs/operations/github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md)（含 **自託管時別讓 CI 還上雲**） |
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
- `AGENTS.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/change-impact-map.json`
- `docs/operations/hetzner-full-stack-self-host-runbook.md`
- `docs/operations/hetzner-stack-rollout-index.md`
- `docs/README.md`
- `memory/CONVERSATION_MEMORY.md`
- `README.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-06 07:44:32 UTC_

