# `docs/operations/` 導覽

**這裡放什麼**：可照著做的 SOP、Checklist、Runbook、基礎建設與工具連動、資安／憑證政策。  
**不放在這裡**：系統全貌介紹、雙機哲學、長期憲章敘事 → 請到 [`../overview/README.md`](../overview/README.md)。

## 快速入口（最常開）

| 情境 | 檔案 |
|:---|:---|
| 收工／關機流程 | [`end-of-day-checklist.md`](end-of-day-checklist.md) |
| 新治理文件要掛進連動 | [`new-doc-linkage-checklist.md`](new-doc-linkage-checklist.md) |
| Cursor 規則／MCP 權威索引 | [`cursor-enterprise-rules-index.md`](cursor-enterprise-rules-index.md) |
| MCP 鍵名與分工 | [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) |
| 工具建置 ↔ 路由 ↔ TASKS | [`TOOLS_DELIVERY_TRACEABILITY.md`](TOOLS_DELIVERY_TRACEABILITY.md) |
| Hetzner 自架從哪開始 | [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md) |
| 堆疊／服務連動總索引 | [`hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md) |
| 祕鑰政策 | [`security-secrets-policy.md`](security-secrets-policy.md) |

## 依主題分群（扁平目錄，用表找檔）

### Cursor／IDE／文件連動

| 檔案 | 用途 |
|:---|:---|
| [`cursor-enterprise-rules-index.md`](cursor-enterprise-rules-index.md) | 企業規則 SSOT 列表 |
| [`cursor-mcp-and-plugin-inventory.md`](cursor-mcp-and-plugin-inventory.md) | `mcp.json` 鍵與龍蝦 routing 對照 |
| [`mcp-add-server-quickstart.md`](mcp-add-server-quickstart.md) | 新增 MCP 步驟 |
| [`mcp-secrets-hardening-runbook.md`](mcp-secrets-hardening-runbook.md) | MCP 憑證強化 |
| [`rules-version-and-enforcement.md`](rules-version-and-enforcement.md) | 規則版本與強制判定 |
| [`new-doc-linkage-checklist.md`](new-doc-linkage-checklist.md) | 新文件連動矩陣 |
| [`end-to-end-linkage-checklist.md`](end-to-end-linkage-checklist.md) | 端到端連動檢查 |
| [`single-owner-registry.json`](single-owner-registry.json) | Single-owner 機讀登記 |

### 每日營運／守護／追溯

| 檔案 | 用途 |
|:---|:---|
| [`end-of-day-checklist.md`](end-of-day-checklist.md) | 收工閘道對照 |
| [`system-guard-and-notification.md`](system-guard-and-notification.md) | 守護與通知 |
| [`system-operation-sop.md`](system-operation-sop.md) | 系統操作 SOP |
| [`ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`](ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md) | Run ID 追溯規格 |

### 基礎建設（Hetzner／Supabase／CI／DB）

| 檔案 | 用途 |
|:---|:---|
| [`hetzner-self-host-start-here.md`](hetzner-self-host-start-here.md) | 自架入口 |
| [`hetzner-stack-rollout-index.md`](hetzner-stack-rollout-index.md) | 堆疊 rollout 索引 |
| [`hetzner-full-stack-self-host-runbook.md`](hetzner-full-stack-self-host-runbook.md) | 全棧 Runbook |
| [`hetzner-self-host.env.example`](hetzner-self-host.env.example) | 環境變數範例 |
| [`supabase-self-hosted-cutover-checklist.md`](supabase-self-hosted-cutover-checklist.md) | Supabase 自架切換 |
| [`github-actions-trigger-prod-deploy.md`](github-actions-trigger-prod-deploy.md) | GHA × workflows |
| [`MARIADB_MULTI_MACHINE_SYNC.md`](MARIADB_MULTI_MACHINE_SYNC.md) | 多機 MariaDB（WordPress 脈絡） |

### 資安／祕密

| 檔案 | 用途 |
|:---|:---|
| [`security-secrets-policy.md`](security-secrets-policy.md) | 祕鑰政策 |
| [`local-secrets-vault-dpapi.md`](local-secrets-vault-dpapi.md) | 本機 DPAPI vault |

### 交付／產品／工具全景

| 檔案 | 用途 |
|:---|:---|
| [`TOOLS_DELIVERY_TRACEABILITY.md`](TOOLS_DELIVERY_TRACEABILITY.md) | 工具與建置階段追溯 |
| [`tools-and-integrations.md`](tools-and-integrations.md) | 工具與整合總表 |
| [`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`](NEXT_GEN_DELIVERY_BLUEPRINT_V1.md) | 次世代交付藍圖 |
| [`WORDPRESS_CLIENT_DELIVERY_MODELS.md`](WORDPRESS_CLIENT_DELIVERY_MODELS.md) | WP 客戶交付模型 |
| [`ecommerce-project-playbook.md`](ecommerce-project-playbook.md) | 電商專案 Playbook |

### 事件／上線 Runbook（專案級）

| 檔案 | 用途 |
|:---|:---|
| [`incident-response-runbook.md`](incident-response-runbook.md) | 事件應變 |
| [`PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md`](PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md) | Pilot A |
| [`PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md`](PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md) | Pilot B |

### 商務／外包／排程／風險

| 檔案 | 用途 |
|:---|:---|
| [`finance-operations.md`](finance-operations.md) | 財務營運 |
| [`outsourcing-playbook.md`](outsourcing-playbook.md) | 外包 Playbook |
| [`outsourcing-vendor-scorecard.md`](outsourcing-vendor-scorecard.md) | 供應商評分 |
| [`scope-change-policy.md`](scope-change-policy.md) | 範圍變更政策 |
| [`client-risk-scoring-model.md`](client-risk-scoring-model.md) | 客戶風險評分 |
| [`tenant-scheduling.md`](tenant-scheduling.md) | 租戶排程 |

### 資料遷移

| 檔案 | 用途 |
|:---|:---|
| [`airtable-to-supabase-migration-playbook.md`](airtable-to-supabase-migration-playbook.md) | Airtable → Supabase |

## 若還是覺得亂：下一步（可選）

1. **維持扁平目錄**，只依本 README 分群（連結零破壞）。  
2. **若要實體子目錄**（例如 `operations/infra/`）：請用專門任務做「搬檔 + 全 repo 更新連結 + `change-impact-map`」，避免半套遷移。

## Related Documents (Auto-Synced)

- [`../README.md`](../README.md)
- [`../overview/README.md`](../overview/README.md)
- [`cursor-enterprise-rules-index.md`](cursor-enterprise-rules-index.md)

_Last synced: (doc-sync will refresh)_
