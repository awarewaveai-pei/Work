# Docs Index

## 目的
- 集中管理治理文件，避免根目錄文件散落

**怎麼點連結**：在 Cursor／VS Code 內對連結 **Ctrl+Click**（Mac：**Cmd+Click**）即可開檔。若資訊太多，請改從 [operations 導覽](operations/OPS_DOCS_INDEX.md) 或 [overview 導覽](overview/OVERVIEW_INDEX.md) 進入（表格分類、連結文字即檔名）。

## 結構
- `docs/edge-and-domains/`：**邊緣、主機名、子網域**與 **`api.aware-wave.com`（phase1 `node-api`）計畫**之統管入口 — [`edge-and-domains/EDGE_DOMAINS_INDEX.md`](edge-and-domains/EDGE_DOMAINS_INDEX.md)（長篇計畫正文：[`edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)；**git 唯一正文**，勿在 `~/.cursor/plans/` 另存重複全文）
- `docs/governance-plans/`：**穩定化、規則治理**等長篇計畫之 repo 正文與「舊 `.plan` 檔名對照」— [`governance-plans/GOVERNANCE_PLANS_INDEX.md`](governance-plans/GOVERNANCE_PLANS_INDEX.md)
- `docs/operations/`：系統操作與執行流程 — **目錄導覽**：[`operations/OPS_DOCS_INDEX.md`](operations/OPS_DOCS_INDEX.md)；**平台能力＋工具一句話總索引（§0）＋建置順序（單一 Owner）**：[`operations/TOOLS_DELIVERY_TRACEABILITY.md`](operations/TOOLS_DELIVERY_TRACEABILITY.md)（含 **Cursor 企業級規則索引** [`operations/cursor-enterprise-rules-index.md`](operations/cursor-enterprise-rules-index.md)、**GHA × workflows** [`operations/github-actions-trigger-prod-deploy.md`](operations/github-actions-trigger-prod-deploy.md)、**Hetzner 入口** [`operations/hetzner-self-host-start-here.md`](operations/hetzner-self-host-start-here.md)、**堆疊索引** [`operations/hetzner-stack-rollout-index.md`](operations/hetzner-stack-rollout-index.md) 等分群連結）
- `docs/overview/`：整體介紹與導讀 — **目錄導覽**：[`overview/OVERVIEW_INDEX.md`](overview/OVERVIEW_INDEX.md)
- `docs/sales/`：報價與變更核價規則
- `docs/templates/`：合約與變更模板（**全庫各類「範本」路徑索引**：[`overview/repo-template-locations.md`](overview/repo-template-locations.md)）
- `docs/standards/`：技術與開發標準
- `docs/metrics/`：KPI 與毛利量測規格
- `docs/quality/`：交付品質門檻與放行機制
- `docs/international/`：跨時區與跨國營運政策
- `docs/product/`：可販售套件與買方交接規範
- `docs/compliance/`：合規檢核與稽核清單
- `docs/releases/`：版本發布、升級路徑、遷移清單
- `docs/architecture/`：總控中心與多平台架構設計；**輕量 ADR** 見 [`architecture/decisions/ADR_INDEX.md`](architecture/decisions/ADR_INDEX.md)
- `docs/CHANGE_IMPACT_MATRIX.md`：文件連動關係

## 使用規則
1. 先改「主文件」（single source of truth）
2. 依 `docs/CHANGE_IMPACT_MATRIX.md` 同步更新關聯文件
3. **新增或大幅改版治理／對外文件時**：照 [`docs/operations/new-doc-linkage-checklist.md`](operations/new-doc-linkage-checklist.md)（矩陣 + `change-impact-map.json` + README 入口 + doc-sync／health）
4. 完成後更新 `WORKLOG.md` 與 `TASKS.md`

## Related Documents (Auto-Synced)
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/overview/agency-os-complete-system-introduction.md`

_Last synced: 2026-04-30 09:24:59 UTC_

