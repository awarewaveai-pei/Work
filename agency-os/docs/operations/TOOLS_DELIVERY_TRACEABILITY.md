# 工具交付追溯總表（平台能力／自託管／建置順序）

## 目的
- 以一頁整合你會用到的「平台能力總表（自託管/非自託管/時機）」與「工具建置順序」。
- 避免「看得到任務，但看不到能力全景」或「有工具清單，卻不知道何時建」的落差。
- 作為 `TASKS.md`、`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md` 之間的對照中樞。

## 單一視角（誰負責什麼）
| 順序 | 層級 | 正本檔案（自 `agency-os/` 起算） | 回答問題 |
|---:|---|---|---|
| 1 | 編排路由（**強制**） | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | `task_type`、Owner 引擎、env、風險、核准 |
| 2 | 機讀閘道 | `../lobster-factory/workflow-risk-matrix.json` + `../lobster-factory/scripts/validate-workflow-routing-policy.mjs` | CI／bootstrap 是否與 spec 結構一致 |
| 3 | 人讀矩陣 | `../lobster-factory/docs/ROUTING_MATRIX.md` | 一眼對照路由（語意須與 spec 一致） |
| 4 | 工具分工（IDE/MCP 鍵名） | `docs/operations/cursor-mcp-and-plugin-inventory.md` | Cursor `mcpServers` 做什麼；**不**覆寫生產編排 |
| 5 | 編排邊界理由 | `docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md` | 為何 Trigger vs n8n 如此切分 |
| 6 | 平台能力與時機（本檔） | `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` | 能力要不要做、自託管、建置順序、證據欄位 |
| 7 | 執行狀態 | `TASKS.md` | 目前完成/未完成與下一步 |

## 平台能力總表（你會用到的能力）
> 說明：`自託管可行性` 是技術可行，不代表現在就應該上；仍以風險、維運成本與商業時機決定。
> 狀態圖例：`🟢 已上線` / `🟡 建置中` / `⚪ 未啟動`。

| 能力/元件 | 目前實際狀態 | 自託管可行性 | 建議時機 | 主要依據 | 完成證據（DoD） |
|---|---|---|---|---|---|
| Supabase（SoR） | 🟢 已上線（Hetzner） | 可（已採自架） | P1（立即） | `docs/operations/supabase-self-hosted-cutover-checklist.md` | migration/連線/權限驗證全通過 |
| WordPress + MariaDB | 🟢 已上線（站台執行） | 可 | P1（立即） | `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`、`../lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md` | staging/prod 可用，回滾可驗證 |
| n8n（staging） | 🟢 已上線（自託管；**staging E2E 已證** 2026-04-10，見 `WORKLOG.md`） | 可 | P2 | `docs/standards/n8n-workflow-architecture.md` | 至少 1 條 staging 流程端到端成功 |
| Trigger.dev（自託管） | 🟡 建置中（路由已定） | 可 | P2 | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | 1 條生產級工作流可追蹤完成 |
| Redis | ⚪ 未啟動（Phase A） | 可 | P2 | `docs/operations/hetzner-stack-rollout-index.md` | 服務健康檢查與應用連線成功 |
| Nginx | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 路由/健康檢查/SSL 正常 |
| Node API | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 核心 API endpoint 驗證通過 |
| Next.js 控制台 | ⚪ 未啟動（列入 P7） | 可 | P3 | `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` | 可建立並回顯 1 個測試租戶設定 |
| Sentry | 🟢 已上線（Phase1：`next-admin`／`node-api`／`php` + n8n DSN；**2026-04-12** 驗證與告警，見 `agency-os/WORKLOG.md` **`## 2026-04-12`**） | 可（維運較重） | P3 | `docs/operations/tools-and-integrations.md`、`../lobster-factory/infra/hetzner-phase1-core/README.md` | 測試錯誤可上報與告警；手動路由 `../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/sentry-test/route.ts` |
| PostHog | ⚪ 未啟動（列入 P4） | 可 | P3 | `docs/operations/tools-and-integrations.md` | 可看到完整測試 funnel |
| MinIO（S3 相容） | ⚪ 未啟動（Phase B） | 可 | P3（需要時） | `docs/operations/hetzner-stack-rollout-index.md` | 上傳/下載/權限驗證通過 |
| Cloudflare | ⚪ 未啟動（列入 P5） | 以 SaaS 為主 | P2-P3 | `docs/operations/tools-and-integrations.md` | 規則生效且無回歸 |
| Clerk（或替代） | ⚪ 未啟動（列入 P6） | Clerk 為 SaaS；可改自架替代 | P3 | `docs/architecture/decisions/002-clerk-identity-boundary.md` | 角色權限測試通過 |
| GitHub Actions | 🟢 已上線（CI 正在使用） | SaaS（可改自建 CI） | P1-P2 | `docs/operations/github-actions-trigger-prod-deploy.md` | gate 與部署流程驗證通過 |

## 工具建置順序（建議）
> 先穩定核心，再補可觀測，再做控制台；避免先做 UI 但底層未穩定。

| 階段 | 項目 | 目前狀態 | 對應 `TASKS` 關鍵字 |
|---|---|---|---|
| P1 | Secrets 治理升級 | 🟡 基線已文件化（Owner／vault 鍵名對照）；**輪替演練待 WORKLOG 證據** | `（工具建置）Secrets 治理升級`；執行手冊 `secrets-governance-p1-closeout.md` |
| P2 | Hetzner 自託管 n8n（staging） | 🟢 E2E DoD 已證（2026-04-10） | `（工具建置）Hetzner 自託管 n8n（staging）`；E2E 正本 `n8n-staging-client-onboarding-e2e.md` |
| P3 | Sentry 觀測接入 | 🟢 DoD 已證（2026-04-12；`WORKLOG.md`、`TASKS.md`） | `（工具建置）Sentry 觀測接入` |
| P4 | PostHog 事件基線 | ⚪ 未啟動 | `（工具建置）PostHog 事件基線` |
| P5 | Cloudflare 邊界保護 | ⚪ 未啟動 | `（工具建置）Cloudflare 邊界保護` |
| P6 | Clerk 組織與角色（B2B 多租戶） | ⚪ 未啟動 | `（工具建置）Clerk 組織與角色（B2B 多租戶）` |
| P7 | Next.js 控制台 v1（Internal Ops） | ⚪ 未啟動 | `（工具建置）Next.js 控制台 v1（Internal Ops）` |

## 任務到規格追溯（P1-P7）
| `TASKS` 關鍵字 | 主要規格正本 | 路由錨點 | 完成判定（需可觀測） | 證據欄位 |
|---|---|---|---|---|
| `（工具建置）Secrets 治理升級` | `docs/operations/security-secrets-policy.md` | `MCP_TOOL_ROUTING_SPEC.md` Guardrails + Tool Boundaries | 輪替演練完成且無中斷 | `date`, `owner`, `rotated_scopes`, `rollback_note`, `report_path` |
| `（工具建置）Hetzner 自託管 n8n（staging）` | `docs/standards/n8n-workflow-architecture.md` | `webhook_ingress` / `crm_sync` / `notifications` 屬 `n8n` | 至少 1 條 staging 流程端到端成功 | `workflow_run_id`, `environment`, `route`, `artifact_path`, `status` |
| `（工具建置）Sentry 觀測接入` | `docs/operations/tools-and-integrations.md` | 屬於可觀測平面（非控制平面） | 測試錯誤可觸發告警 | `release_tag`, `alert_rule`, `event_id`, `screenshot_path` |
| `（工具建置）PostHog 事件基線` | `docs/operations/tools-and-integrations.md` | 屬於分析平面（非控制平面） | 可見完整測試 funnel | `event_names`, `funnel_id`, `time_window`, `report_path` |
| `（工具建置）Cloudflare 邊界保護` | `docs/operations/tools-and-integrations.md` | 邊界防護能力 | staging 防護生效且無回歸 | `zone`, `rule_ids`, `before_after_result`, `rollback_note` |
| `（工具建置）Clerk 組織與角色` | `docs/architecture/decisions/002-clerk-identity-boundary.md` | 控制平面身分邊界不可破 | 兩個測試角色權限區隔成功 | `org_id`, `role_matrix_ref`, `test_accounts`, `result` |
| `（工具建置）Next.js 控制台 v1` | `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` | UI 不可繞過既有路由與核准 | 可由 UI 建立 1 筆測試配置 | `tenant_slug`, `department_selection_payload`, `submit_result`, `ui_capture` |

## 執行檢查清單（每完成一項都要做）
- 在 `TASKS.md` 對應項有狀態更新（未完成/完成）。
- 在 `WORKLOG.md` 留下當日證據路徑（至少一條）。
- 若改變路由 Owner 或新增 `task_type`，必須**同一變更集**更新（順序與 `MCP_TOOL_ROUTING_SPEC.md` 文件集一致）：
  1. `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
  2. `../lobster-factory/docs/ROUTING_MATRIX.md`
  3. `../lobster-factory/workflow-risk-matrix.json`
  4. `docs/operations/cursor-mcp-and-plugin-inventory.md`
  5. 本檔與 `TASKS.md`（含可執行任務與 DoD）

## 路由與工具四件套長期治理契約（30+ years）

### A. 一致性不變量（Invariants）
- `MCP_TOOL_ROUTING_SPEC.md` 的 `task_type` 命名是強制語意主鍵。
- `ROUTING_MATRIX.md` 必須沿用同一語意欄位（`task_type`、`risk_level`、`environment`、`approval_required`）。
- `workflow-risk-matrix.json` 必須通過 `validate-workflow-routing-policy.mjs`；與 spec 漂移視為 **gate FAIL**。
- 本檔任何「任務追溯」若指向路由，必須引用上述主鍵，**不得**自創別名或隱含新 `task_type`。

### B. 版本與審核節奏
- 每月：術語/欄位 drift 檢查（Spec vs Matrix vs JSON vs Inventory vs 本檔 vs `TASKS`）。
- 每季：風險分級、核准門檻、rollback 規則校準。
- 每年：淘汰項（deprecated `task_type`／工具）清理，保留遷移對照表。

### C. 變更流程（最小要求）
- 新增或廢止路由語意時，至少同時更新上節清單 **1–5**；若只改 IDE 說明、不碰 `task_type`，可限於 **inventory**（並在 PR 註明「無 routing 語意變更」）。
- 未完成 **1–3** 與驗證腳本綠燈前，不得標示路由相關項為「已完成」。

## 證據儲存慣例
- 報告：`agency-os/reports/`
- 執行追蹤：`lobster-factory` workflow artifacts + `workflow_run_id`
- 決策紀錄：`agency-os/WORKLOG.md`

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- `docs/operations/security-secrets-policy.md`
- `docs/operations/tools-and-integrations.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-04-13 01:17:52 UTC_

