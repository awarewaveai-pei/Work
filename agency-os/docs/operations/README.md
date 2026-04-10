# `docs/operations/` 導覽（操作／SOP／Runbook）

**這一層是什麼**：照著做的流程、檢查清單、基礎建設與工具、資安政策。  
**不是這一層**：系統介紹、雙機哲學、長篇憲章 → 請改去 [overview 導覽](../overview/README.md)。

**怎麼點連結**：在 Cursor／VS Code 裡，對下方連結 **Ctrl+Click**（Mac：**Cmd+Click**）即可開檔。

---

## 我現在只要一件事（直接點）

- [收工／關機流程](end-of-day-checklist.md)
- [新治理文件：連動登記](new-doc-linkage-checklist.md)
- [Cursor 規則與 SSOT 索引](cursor-enterprise-rules-index.md)
- [MCP 鍵名與龍蝦路由對照](cursor-mcp-and-plugin-inventory.md)
- [工具建置／路由／TASKS 一頁表](TOOLS_DELIVERY_TRACEABILITY.md)
- [Hetzner 自架：從這裡開始](hetzner-self-host-start-here.md)
- [堆疊與服務連動索引](hetzner-stack-rollout-index.md)
- [祕鑰與憑證政策](security-secrets-policy.md)

---

## 依類別找（每類幾個連結，仍可直接點）

### Cursor／IDE／文件連動

- [企業規則索引](cursor-enterprise-rules-index.md)
- [MCP 鍵名與分工](cursor-mcp-and-plugin-inventory.md)
- [新增 MCP 快速步驟](mcp-add-server-quickstart.md)
- [MCP 憑證強化 Runbook](mcp-secrets-hardening-runbook.md)
- [規則版本與強制判定](rules-version-and-enforcement.md)
- [新文件連動 Checklist](new-doc-linkage-checklist.md)
- [端到端連動 Checklist](end-to-end-linkage-checklist.md)
- [Single-owner 登記（JSON）](single-owner-registry.json)

### 每日營運／守護／追溯

- [收工 Checklist](end-of-day-checklist.md)
- [系統守護與通知](system-guard-and-notification.md)
- [系統操作 SOP](system-operation-sop.md)
- [Run ID 追溯規格](ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md)

### 基礎建設（Hetzner／Supabase／CI／DB）

- [Hetzner 自架入口](hetzner-self-host-start-here.md)
- [堆疊 rollout 索引](hetzner-stack-rollout-index.md)
- [全棧自架 Runbook](hetzner-full-stack-self-host-runbook.md)
- [環境變數範例](hetzner-self-host.env.example)
- [Supabase 自架切換 Checklist](supabase-self-hosted-cutover-checklist.md)
- [GitHub Actions × workflows](github-actions-trigger-prod-deploy.md)
- [多機 MariaDB 同步（WP 脈絡）](MARIADB_MULTI_MACHINE_SYNC.md)

### 資安／祕密

- [祕鑰政策](security-secrets-policy.md)
- [本機 DPAPI vault](local-secrets-vault-dpapi.md)

### 交付／產品／工具全景

- [工具交付追溯總表](TOOLS_DELIVERY_TRACEABILITY.md)
- [工具與整合總表](tools-and-integrations.md)
- [次世代交付藍圖](NEXT_GEN_DELIVERY_BLUEPRINT_V1.md)
- [WordPress 客戶交付模型](WORDPRESS_CLIENT_DELIVERY_MODELS.md)
- [電商專案 Playbook](ecommerce-project-playbook.md)

### 事件／上線 Runbook（專案級）

- [事件應變 Runbook](incident-response-runbook.md)
- [Production Pilot A（既有站）](PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md)
- [Production Pilot B（新站）](PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md)

### 商務／外包／排程／風險

- [財務營運](finance-operations.md)
- [外包 Playbook](outsourcing-playbook.md)
- [外包供應商評分卡](outsourcing-vendor-scorecard.md)
- [範圍變更政策](scope-change-policy.md)
- [客戶風險評分模型](client-risk-scoring-model.md)
- [租戶排程](tenant-scheduling.md)

### 資料遷移

- [Airtable → Supabase Playbook](airtable-to-supabase-migration-playbook.md)

---

<details>
<summary><strong>展開：完整對照表（與上面連結重複，給想一次掃表的人）</strong></summary>

| 檔案 | 用途 |
|:---|:---|
| [cursor-enterprise-rules-index.md](cursor-enterprise-rules-index.md) | 企業規則 SSOT 列表 |
| [cursor-mcp-and-plugin-inventory.md](cursor-mcp-and-plugin-inventory.md) | `mcp.json` 鍵與龍蝦 routing |
| [mcp-add-server-quickstart.md](mcp-add-server-quickstart.md) | 新增 MCP |
| [mcp-secrets-hardening-runbook.md](mcp-secrets-hardening-runbook.md) | MCP 憑證強化 |
| [rules-version-and-enforcement.md](rules-version-and-enforcement.md) | 規則版本與強制判定 |
| [new-doc-linkage-checklist.md](new-doc-linkage-checklist.md) | 新文件連動 |
| [end-to-end-linkage-checklist.md](end-to-end-linkage-checklist.md) | 端到端連動 |
| [single-owner-registry.json](single-owner-registry.json) | Single-owner 機讀 |
| [end-of-day-checklist.md](end-of-day-checklist.md) | 收工 |
| [system-guard-and-notification.md](system-guard-and-notification.md) | 守護與通知 |
| [system-operation-sop.md](system-operation-sop.md) | 系統操作 SOP |
| [ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md](ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md) | Run ID 追溯 |
| [hetzner-self-host-start-here.md](hetzner-self-host-start-here.md) | Hetzner 入口 |
| [hetzner-stack-rollout-index.md](hetzner-stack-rollout-index.md) | 堆疊索引 |
| [hetzner-full-stack-self-host-runbook.md](hetzner-full-stack-self-host-runbook.md) | 全棧 Runbook |
| [hetzner-self-host.env.example](hetzner-self-host.env.example) | env 範例 |
| [supabase-self-hosted-cutover-checklist.md](supabase-self-hosted-cutover-checklist.md) | Supabase 切換 |
| [github-actions-trigger-prod-deploy.md](github-actions-trigger-prod-deploy.md) | GHA |
| [MARIADB_MULTI_MACHINE_SYNC.md](MARIADB_MULTI_MACHINE_SYNC.md) | MariaDB 多機 |
| [security-secrets-policy.md](security-secrets-policy.md) | 祕鑰政策 |
| [local-secrets-vault-dpapi.md](local-secrets-vault-dpapi.md) | DPAPI vault |
| [TOOLS_DELIVERY_TRACEABILITY.md](TOOLS_DELIVERY_TRACEABILITY.md) | 工具追溯 |
| [tools-and-integrations.md](tools-and-integrations.md) | 工具整合 |
| [NEXT_GEN_DELIVERY_BLUEPRINT_V1.md](NEXT_GEN_DELIVERY_BLUEPRINT_V1.md) | 次世代藍圖 |
| [WORDPRESS_CLIENT_DELIVERY_MODELS.md](WORDPRESS_CLIENT_DELIVERY_MODELS.md) | WP 交付模型 |
| [ecommerce-project-playbook.md](ecommerce-project-playbook.md) | 電商 Playbook |
| [incident-response-runbook.md](incident-response-runbook.md) | 事件應變 |
| [PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md](PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md) | Pilot A |
| [PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md](PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md) | Pilot B |
| [finance-operations.md](finance-operations.md) | 財務 |
| [outsourcing-playbook.md](outsourcing-playbook.md) | 外包 |
| [outsourcing-vendor-scorecard.md](outsourcing-vendor-scorecard.md) | 供應商評分 |
| [scope-change-policy.md](scope-change-policy.md) | 範圍變更 |
| [client-risk-scoring-model.md](client-risk-scoring-model.md) | 客戶風險 |
| [tenant-scheduling.md](tenant-scheduling.md) | 租戶排程 |
| [airtable-to-supabase-migration-playbook.md](airtable-to-supabase-migration-playbook.md) | Airtable 遷移 |

</details>

---

## 若還要再整理目錄結構

維持**扁平資料夾**只更新本頁，連結最不會斷。若要改成子資料夾，請用專門任務一次搬完並全庫改連結。

## Related Documents (Auto-Synced)

- [../README.md](../README.md)
- [../overview/README.md](../overview/README.md)
- [cursor-enterprise-rules-index.md](cursor-enterprise-rules-index.md)
