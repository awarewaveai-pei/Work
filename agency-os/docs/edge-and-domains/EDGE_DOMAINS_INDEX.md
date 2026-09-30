# 邊緣、主機名與子網域（統管入口）

**這一層放什麼**：對外公開的主機名、子網域職責、DNS／TLS／Nginx 範本連結，以及 **`api.aware-wave.com`（phase1 `node-api`）的長期演進計畫**之單一正文入口。  
**不放在這**：可逐步照做的 Hetzner 裝機 Runbook、收工 Gate → [`../operations/OPS_DOCS_INDEX.md`](../operations/OPS_DOCS_INDEX.md)；系統全貌 → [`../overview/OVERVIEW_INDEX.md`](../overview/OVERVIEW_INDEX.md)。

**單一真相原則**：與 `api`／`app` 子網域、apex `/api/` 雙入口、`node-api` 邊界相關的**長篇計畫**只維護 **[`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)**。請**不要**在 monorepo 外（例如本機 `~/.cursor/plans/`）再複製一份全文；IDE 若自動產生舊 plan，以本 repo 路徑為準。

在編輯器內 **Ctrl+Click**（Mac：**Cmd+Click**）可開檔。

**全庫工具一句話＋專文／計畫總索引（§0，與狀態同檔）**：[`../operations/TOOLS_DELIVERY_TRACEABILITY.md`](../operations/TOOLS_DELIVERY_TRACEABILITY.md)

---

## 快速導覽

| 你要做什麼 | 先開這裡 |
|:---|:---|
| **`aware-wave.com` 底下每個子網域是什麼、給誰用、優先序** | [`PRODUCT_DOMAIN_IA_PLAN.md`](PRODUCT_DOMAIN_IA_PLAN.md) |
| **API 要做什麼、P0～P4、與 Trigger／Supabase／Identity(JWT/OIDC) 邊界** | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md) |
| **Cloudflare DNS、`api`／`app` 表、TLS 驗收 curl** | [`../operations/CLOUDFLARE_HETZNER_PHASE1.md`](../operations/CLOUDFLARE_HETZNER_PHASE1.md) |
| **現役 host nginx（TLS → lobster-nginx :8083）** | [`../../../lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf`](../../../lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf) |
| **現役 hostname/app routing** | [`../../../lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`](../../../lobster-factory/infra/hetzner-phase1-core/nginx/default.conf) |
| **phase1 compose 與本機驗收** | [`../../../lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md) |
| **龍蝦 MCP／工具路由（人讀矩陣）** | [`../../../lobster-factory/docs/ROUTING_MATRIX.md`](../../../lobster-factory/docs/ROUTING_MATRIX.md) |
| **長期營運（RPO／備份／升級節奏）** | [`../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`](../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md) |
| **SG Phase1 Docker 雙目錄／勿刪 EU DNS** | [`../operations/SG_PHASE1_DOCKER_LAYOUT.md`](../operations/SG_PHASE1_DOCKER_LAYOUT.md) |

---

## 與其他文件的責任分工

| 主題 | Owner（正文） | 本目錄的角色 |
|------|----------------|-------------|
| DNS、WAF、CF SSL 模式 | [`CLOUDFLARE_HETZNER_PHASE1.md`](../operations/CLOUDFLARE_HETZNER_PHASE1.md) | 連結匯總；不重複表格正文 |
| `node-api` 路由、版本、Auth、Webhook 藍圖 | [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md) | **唯一長篇計畫** |
| 實際程式與 compose | `lobster-factory/infra/hetzner-phase1-core/` | 實作；計畫內有驗收與邊界 |

變更 **`PLAN_PHASE1_*`** 時請同步檢查：`docs/DOCS_INDEX.md`、`AGENTS.md`、`docs/operations/CLOUDFLARE_HETZNER_PHASE1.md`、`lobster-factory/infra/hetzner-phase1-core/README.md`、`docs/CHANGE_IMPACT_MATRIX.md`（見矩陣列「`docs/edge-and-domains/*`」）。

---

## 其他長篇計畫（非 API 邊界）

**穩定化、規則治理**等舊 Cursor plan 的 repo 正文與對照表：[`../governance-plans/GOVERNANCE_PLANS_INDEX.md`](../governance-plans/GOVERNANCE_PLANS_INDEX.md)。
