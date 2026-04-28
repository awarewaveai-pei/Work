# 治理與穩定化計畫（git 索引）

**目的**：把過去只在 Cursor `~/.cursor/plans/*.plan.md` 出現的**長篇計畫**，在 monorepo 裡留下**可版控、可 PR、團隊共用**的副本；並對照舊檔名，避免「以為沒進 Work」。

**單一真相**：各計畫正文以本目錄與 [`../edge-and-domains/`](../edge-and-domains/) 內對應檔為準；本機 `.plan.md` 應改為 stub 或刪除全文，**勿**維護兩份相同長文。

**全庫工具一句話＋專文／計畫總索引（§0）**：[`../operations/TOOLS_DELIVERY_TRACEABILITY.md`](../operations/TOOLS_DELIVERY_TRACEABILITY.md)

---

## 舊 Cursor plan 檔名 → repo 正文（對照表）

| 你熟悉的檔名／主題 | repo 正文（請改這裡） |
|:---|:---|
| `api.aware-wave.com_roadmap`（API／`node-api` 路線） | [`../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md) |
| `30y-stable_api_boundary`（與 roadmap 重疊） | **同上**（已合併，不另開第二檔） |
| `30y-stability-hardening`（觀測、密鑰、DR、gate） | [`PLAN_30Y_STABILITY_HARDENING.md`](PLAN_30Y_STABILITY_HARDENING.md) |
| `30-year-rule-consolidation`（規則治理收斂） | [`PLAN_30_YEAR_RULE_CONSOLIDATION.md`](PLAN_30_YEAR_RULE_CONSOLIDATION.md) |
| `rules-stability-consolidation`（規則整併，與上同軌） | [`PLAN_RULES_STABILITY_CONSOLIDATION.md`](PLAN_RULES_STABILITY_CONSOLIDATION.md)（與上一檔**並列**；執行時擇一為 sprint 主檔或合併 PR 時對齊） |

**邊緣／子網域統管入口**（含 `api` 連結表）：[`../edge-and-domains/EDGE_DOMAINS_INDEX.md`](../edge-and-domains/EDGE_DOMAINS_INDEX.md)

---

## 變更時必查

- [`../CHANGE_IMPACT_MATRIX.md`](../CHANGE_IMPACT_MATRIX.md)（已列 `docs/governance-plans/*` 與關聯）
- [`../operations/new-doc-linkage-checklist.md`](../operations/new-doc-linkage-checklist.md)（若大幅改版）
