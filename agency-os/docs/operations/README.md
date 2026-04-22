# docs/operations/ 導覽

**這一層放什麼**：Checklist、Runbook、基礎建設、工具與 Cursor／MCP、資安政策。  
**不放在這**：系統全貌、雙機哲學、長篇憲章 → [overview 導覽](../overview/README.md)（檔名 `README.md`，資料夾 `docs/overview/`）。

在編輯器內 **Ctrl+Click**（Mac：**Cmd+Click**）可開檔。下表**連結文字即檔名**，路徑皆在 **`agency-os/docs/operations/`**（跨資料夾除外）。

## 你現在看檔順序（固定入口）

0. **平台／工具一句話＋專文與計畫（總索引 §0，與狀態同檔）**：[`TOOLS_DELIVERY_TRACEABILITY.md`](TOOLS_DELIVERY_TRACEABILITY.md)  
1. 今日執行先看 [`../../TASKS.md`](../../TASKS.md)（今天做什麼）。
2. 近期優先再看 [`NEXT_ACTIONS.md`](NEXT_ACTIONS.md)（近期優先順序）。
3. 階段藍圖最後看 [`IMPLEMENTATION_ORDER.md`](IMPLEMENTATION_ORDER.md)（階段藍圖）。
4. Next.js 控制台功能正本看 [`NEXTJS_INTERNAL_OPS_CONSOLE_V1.md`](NEXTJS_INTERNAL_OPS_CONSOLE_V1.md)。

---

## 依類別（每份只列一次）

### 每日營運／守護／追溯

| 說明 | 檔案 |
|:---|:---|
| 收工／關機 Checklist | [end-of-day-checklist.md](end-of-day-checklist.md) |
| AI／代理操作路徑（MCP·API·SSH） | [TOOLS_DELIVERY_TRACEABILITY.md](TOOLS_DELIVERY_TRACEABILITY.md) **§0.1**、monorepo 根 `mcp/SERVICE_MATRIX.md` |
| 協作 AI 規則（非收關者：inbox only） | [collaborator-ai-agent-rules.md](collaborator-ai-agent-rules.md) |
| 多代理收件匣範本／初始化 | [closeout-inbox-TEMPLATE.md](closeout-inbox-TEMPLATE.md) · monorepo [`scripts/init-closeout-inbox.ps1`](../../../scripts/init-closeout-inbox.ps1) |
| `TASKS` 自動打勾（`WORKLOG` → `- [x]`） | monorepo [`scripts/apply-closeout-task-checkmarks.ps1`](../../../scripts/apply-closeout-task-checkmarks.ps1)（由 **`ao-close.ps1`** 呼叫；`AUTO_TASK_DONE` 機讀格式見 [end-of-day-checklist.md](end-of-day-checklist.md) §0） |
| 系統守護與通知 | [system-guard-and-notification.md](system-guard-and-notification.md) |
| 系統操作 SOP | [system-operation-sop.md](system-operation-sop.md) |
| Run ID 追溯規格 | [ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md](ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md) |

### Cursor／IDE／文件連動

| 說明 | 檔案 |
|:---|:---|
| 企業規則索引 | [cursor-enterprise-rules-index.md](cursor-enterprise-rules-index.md) |
| MCP 鍵名與分工 | [cursor-mcp-and-plugin-inventory.md](cursor-mcp-and-plugin-inventory.md) |
| Agent 執行期：工具驗證與 MCP／SSH／API 備援 | [CURSOR_AGENT_RUNTIME_PLAYBOOK.md](CURSOR_AGENT_RUNTIME_PLAYBOOK.md) |
| 新增 MCP 步驟 | [mcp-add-server-quickstart.md](mcp-add-server-quickstart.md) |
| MCP 憑證強化 | [mcp-secrets-hardening-runbook.md](mcp-secrets-hardening-runbook.md) |
| 規則版本與強制判定 | [rules-version-and-enforcement.md](rules-version-and-enforcement.md) |
| 新文件連動 Checklist | [new-doc-linkage-checklist.md](new-doc-linkage-checklist.md) |
| 端到端連動 Checklist | [end-to-end-linkage-checklist.md](end-to-end-linkage-checklist.md) |
| Single-owner 登記 | [single-owner-registry.json](single-owner-registry.json) |

### 基礎建設（Hetzner／Supabase／CI／DB）

| 說明 | 檔案 |
|:---|:---|
| Hetzner 自架入口 | [hetzner-self-host-start-here.md](hetzner-self-host-start-here.md) |
| 堆疊 rollout 索引 | [hetzner-stack-rollout-index.md](hetzner-stack-rollout-index.md) |
| 全棧自架 Runbook | [hetzner-full-stack-self-host-runbook.md](hetzner-full-stack-self-host-runbook.md) |
| 環境變數範例 | [hetzner-self-host.env.example](hetzner-self-host.env.example) |
| Supabase 自架切換 | [supabase-self-hosted-cutover-checklist.md](supabase-self-hosted-cutover-checklist.md) |
| Cloudflare 邊緣（Phase 1 / 自架 Next） | [CLOUDFLARE_HETZNER_PHASE1.md](CLOUDFLARE_HETZNER_PHASE1.md) |
| **子網域／`api` 邊界／長期計畫（統管入口）** | [edge-and-domains/README.md](../edge-and-domains/README.md)（正文：[PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)） |
| **穩定化／規則治理長篇計畫（舊 Cursor plan 對照）** | [governance-plans/README.md](../governance-plans/README.md) |
| GitHub Actions × workflows | [github-actions-trigger-prod-deploy.md](github-actions-trigger-prod-deploy.md) |
| 多機 MariaDB（WP） | [MARIADB_MULTI_MACHINE_SYNC.md](MARIADB_MULTI_MACHINE_SYNC.md) |

### 資安／祕密

| 說明 | 檔案 |
|:---|:---|
| 祕鑰政策 | [security-secrets-policy.md](security-secrets-policy.md) |
| Sentry 告警政策（P1 基線） | [SENTRY_ALERT_POLICY.md](SENTRY_ALERT_POLICY.md) |
| 本機 DPAPI vault | [local-secrets-vault-dpapi.md](local-secrets-vault-dpapi.md) |

### 交付／工具全景

| 說明 | 檔案 |
|:---|:---|
| 系統架構規格（完整自架） | [ARCHITECTURE_SPEC.md](ARCHITECTURE_SPEC.md) |
| 工具責任矩陣 | [TOOL_RESPONSIBILITY_MATRIX.md](TOOL_RESPONSIBILITY_MATRIX.md) |
| 實作順序（分階段） | [IMPLEMENTATION_ORDER.md](IMPLEMENTATION_ORDER.md) |
| 佈署邊界規則 | [DEPLOYMENT_BOUNDARY_RULES.md](DEPLOYMENT_BOUNDARY_RULES.md) |
| 近期優先動作 | [NEXT_ACTIONS.md](NEXT_ACTIONS.md) |
| Next.js 內部控制台 v1 正本 | [NEXTJS_INTERNAL_OPS_CONSOLE_V1.md](NEXTJS_INTERNAL_OPS_CONSOLE_V1.md) |
| 工具交付追溯 | [TOOLS_DELIVERY_TRACEABILITY.md](TOOLS_DELIVERY_TRACEABILITY.md) |
| 工具與整合總表 | [tools-and-integrations.md](tools-and-integrations.md) |
| 次世代交付藍圖 | [NEXT_GEN_DELIVERY_BLUEPRINT_V1.md](NEXT_GEN_DELIVERY_BLUEPRINT_V1.md) |
| WordPress 客戶交付模型 | [WORDPRESS_CLIENT_DELIVERY_MODELS.md](WORDPRESS_CLIENT_DELIVERY_MODELS.md) |
| 電商專案 Playbook | [ecommerce-project-playbook.md](ecommerce-project-playbook.md) |

### 事件／上線 Runbook（專案級）

| 說明 | 檔案 |
|:---|:---|
| 事件應變 | [incident-response-runbook.md](incident-response-runbook.md) |
| Production Pilot A | [PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md](PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md) |
| Production Pilot B | [PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md](PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md) |

### 商務／外包／排程／風險

| 說明 | 檔案 |
|:---|:---|
| 財務營運 | [finance-operations.md](finance-operations.md) |
| 外包 Playbook | [outsourcing-playbook.md](outsourcing-playbook.md) |
| 外包供應商評分 | [outsourcing-vendor-scorecard.md](outsourcing-vendor-scorecard.md) |
| 範圍變更政策 | [scope-change-policy.md](scope-change-policy.md) |
| 客戶風險評分 | [client-risk-scoring-model.md](client-risk-scoring-model.md) |
| 租戶排程 | [tenant-scheduling.md](tenant-scheduling.md) |

### 資料遷移

| 說明 | 檔案 |
|:---|:---|
| Airtable → Supabase | [airtable-to-supabase-migration-playbook.md](airtable-to-supabase-migration-playbook.md) |

---

## 跨資料夾

| 去哪 | 檔案 |
|:---|:---|
| 全貌／雙機導覽 | [README.md](../overview/README.md) |
| docs 總索引 | [README.md](../README.md) |
| 龍蝦工廠（工程入口） | [README.md](../../../lobster-factory/README.md) |
| 租戶（公司包） | [README.md](../../tenants/README.md) |

---

## 目錄維護

本資料夾維持**扁平**（連結最穩）。若要改成子資料夾，請專案化：搬檔 + 全庫更新連結 + `change-impact-map`。
