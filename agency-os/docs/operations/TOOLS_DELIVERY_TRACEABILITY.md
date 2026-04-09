# 工具交付追溯總表（平台能力／自託管／建置順序）

## 目的
- 以一頁整合你會用到的「平台能力總表（自託管/非自託管/時機）」與「工具建置順序」。
- 避免「看得到任務，但看不到能力全景」或「有工具清單，卻不知道何時建」的落差。
- 作為 `TASKS.md`、`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md` 之間的對照中樞。

## 單一視角（誰負責什麼）
| 層級 | 正本檔案 | 回答問題 |
|---|---|---|
| 工具分工（IDE/MCP） | `docs/operations/cursor-mcp-and-plugin-inventory.md` | 在 Cursor 裡誰做什麼 |
| 編排路由（強制） | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | 哪類工作必須走哪個引擎/核准 |
| 平台能力與時機（本檔） | `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` | 這些能力要不要做、是否自託管、何時做 |
| 執行狀態 | `TASKS.md` | 目前完成/未完成與下一步 |

## 平台能力總表（你會用到的能力）
> 說明：`自託管可行性` 是技術可行，不代表現在就應該上；仍以風險、維運成本與商業時機決定。
> 狀態圖例：`🟢 已上線` / `🟡 建置中` / `⚪ 未啟動`。

| 能力/元件 | 目前實際狀態 | 自託管可行性 | 建議時機 | 主要依據 | 完成證據（DoD） |
|---|---|---|---|---|---|
| Supabase（SoR） | 🟢 已上線（Hetzner） | 可（已採自架） | P1（立即） | `docs/operations/supabase-self-hosted-cutover-checklist.md` | migration/連線/權限驗證全通過 |
| WordPress + MariaDB | 🟢 已上線（站台執行） | 可 | P1（立即） | `docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`、`../lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md` | staging/prod 可用，回滾可驗證 |
| n8n（staging） | 🟡 建置中（TASKS 開放） | 可 | P2 | `docs/standards/n8n-workflow-architecture.md` | 至少 1 條 staging 流程端到端成功 |
| Trigger.dev（自託管） | 🟡 建置中（路由已定） | 可 | P2 | `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` | 1 條生產級工作流可追蹤完成 |
| Redis | ⚪ 未啟動（Phase A） | 可 | P2 | `docs/operations/hetzner-stack-rollout-index.md` | 服務健康檢查與應用連線成功 |
| Nginx | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 路由/健康檢查/SSL 正常 |
| Node API | 🟡 建置中（Phase A） | 可 | P1-P2 | `docs/operations/hetzner-stack-rollout-index.md` | 核心 API endpoint 驗證通過 |
| Next.js 控制台 | ⚪ 未啟動（列入 P7） | 可 | P3 | `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` | 可建立並回顯 1 個測試租戶設定 |
| Sentry | ⚪ 未啟動（列入 P3） | 可（維運較重） | P3 | `docs/operations/tools-and-integrations.md` | 測試錯誤可上報與告警 |
| PostHog | ⚪ 未啟動（列入 P4） | 可 | P3 | `docs/operations/tools-and-integrations.md` | 可看到完整測試 funnel |
| MinIO（S3 相容） | ⚪ 未啟動（Phase B） | 可 | P3（需要時） | `docs/operations/hetzner-stack-rollout-index.md` | 上傳/下載/權限驗證通過 |
| Cloudflare | ⚪ 未啟動（列入 P5） | 以 SaaS 為主 | P2-P3 | `docs/operations/tools-and-integrations.md` | 規則生效且無回歸 |
| Clerk（或替代） | ⚪ 未啟動（列入 P6） | Clerk 為 SaaS；可改自架替代 | P3 | `docs/architecture/decisions/002-clerk-identity-boundary.md` | 角色權限測試通過 |
| GitHub Actions | 🟢 已上線（CI 正在使用） | SaaS（可改自建 CI） | P1-P2 | `docs/operations/github-actions-trigger-prod-deploy.md` | gate 與部署流程驗證通過 |

## 工具建置順序（建議）
> 先穩定核心，再補可觀測，再做控制台；避免先做 UI 但底層未穩定。

| 階段 | 項目 | 目前狀態 | 對應 `TASKS` 關鍵字 |
|---|---|---|---|
| P1 | Secrets 治理升級 | ⚪ 未啟動 | `（工具建置）Secrets 治理升級` |
| P2 | Hetzner 自託管 n8n（staging） | ⚪ 未啟動 | `（工具建置）Hetzner 自託管 n8n（staging）` |
| P3 | Sentry 觀測接入 | ⚪ 未啟動 | `（工具建置）Sentry 觀測接入` |
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
- 若改變路由 Owner，必須同 commit 更新：
  - `docs/operations/cursor-mcp-and-plugin-inventory.md`
  - `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
  - `TASKS.md`

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

_Last synced: 2026-04-09 14:47:16 UTC_

