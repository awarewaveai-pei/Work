# n8n staging：`client_onboarding` 輕量 E2E（TASKS DoD）

> **對應 `TASKS`**：`（工具建置）Hetzner 自託管 n8n（staging）` 之 **DoD**  
> **環境**：自託管 staging 實例（例如 `n8n.aware-wave.com`）；**勿**在本文填 token  
> **架構命名**：`docs/standards/n8n-workflow-architecture.md`

## DoD 一句話

在 **staging** n8n 上，存在一條**已啟用、且對 MCP 可見（若用 Cursor 操作）**的輕量流程，從**真實觸發**到**最後一個節點成功**跑完 **≥1 次**，並在 `WORKLOG.md` 留下**可公開**追溯欄位。

## 最小合格流程定義（`client_onboarding`）

下列為**最小**定義；你可之後加 Slack／Supabase／Email，但 **DoD 不必**一次做滿。

| 項目 | 建議 |
|------|------|
| **Workflow 名稱** | `shared-notifications-client_onboarding-staging-ping`（可依命名規範微調） |
| **觸發** | **Webhook**（POST），path 自訂，例如 `/client-onboarding/staging-ping` |
| **本文** | **Set** 節點：寫入 `event=client_onboarding_staging_ping`、`environment=staging`、`received_at`（`$now`） |
| **結尾** | **Respond to Webhook**（200 + JSON 含 `ok: true`）或等價 HTTP 回應 |

### 啟用與 MCP

1. Workflow **Active**（右上角開關）。  
2. **Instance-level MCP** → **Enable workflows**，把本流程加入 MCP 可見清單（若要用 Cursor MCP 執行／除錯）。

### 觸發方式（擇一）

**方式 A — Webhook（最貼近「端到端」）**

```bash
curl -sS -X POST "https://<你的-staging-n8n>/webhook/<webhook-path>" \
  -H "Content-Type: application/json" \
  -d '{"source":"e2e-drill","tenant":"example"}'
```

（實際 URL 以 n8n Webhook 節點顯示為準；**不要把 production webhook 當 staging 測**。）

**方式 B — n8n UI「Test workflow」**

- 僅當 Webhook 暫不可從外網打時使用；仍算 E2E 若最後一節點成功且 Executions 有紀錄（需在 WORKLOG 註明「僅內測觸發」）。

**方式 C — Cursor MCP `execute_workflow`**

- 需 MCP 已連線且本 workflow 已 **Available in MCP**；執行後到 n8n **Executions** 核對成功。

---

## 反向代理（已修過 MCP 者）

若 Webhook 或 MCP 經 Nginx：**`/webhook/`** 與 **`/mcp-server/`**（及 **`/mcp/`**）均需符合 SSE／buffering 相關設定，否則執行或串流會 404（見先前運維筆記與 n8n 文件）。

---

## 完成後 `WORKLOG.md` 證據欄位（必填，無祕密）

於當日區塊新增 **「n8n staging client_onboarding E2E」**：

| 欄位 | 例（示意） |
|------|------------|
| `environment` | `staging` |
| `workflow_name` | 與 n8n 內實際名稱一致 |
| `workflow_id` | n8n 內可見的 ID（非祕密） |
| `execution_id` 或 `workflow_run_id` | Executions 清單中的 ID |
| `trigger_type` | `webhook` / `manual_test` / `mcp_execute` |
| `route_summary` | 僅 path 或節點類型描述，**不含** query secret |

---

## 與 `TASKS` 勾選

當上述 **WORKLOG 證據齊備**後，本項 DoD 視為滿足，可於收工 `WORKLOG` 使用：

`- AUTO_TASK_DONE: Hetzner 自託管 n8n（staging）`

（子字串須命中該未完成行。）

## Related Documents

- `docs/standards/n8n-workflow-architecture.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（n8n 僅膠水邊界）
