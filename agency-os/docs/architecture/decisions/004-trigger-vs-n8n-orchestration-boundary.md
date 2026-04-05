# ADR 004: 耐久編排由 Trigger.dev 擁有；n8n 僅輕量黏著層

- **狀態**：已接受（與龍蝦 **MCP Routing Spec** 對齊；衝突時 **以 Spec 為準**，本 ADR 為 **Agency OS 側審計摘要**）
- **日期**：2026-04-02

## 脈絡

- Monorepo 同時存在 **Trigger.dev**（長任務、重試、核准等待）與 **n8n**（Webhook、通知、CRM 類同步）。
- 若邊界模糊，會出現 **n8n 承擔建站／deploy／repair** 等關鍵編排 → 難以審計、難以回放、與 `workflow_runs`／核准模型脫鉤。

## 決策

1. **耐久編排、staging/prod 關鍵路徑**（provision、manifest apply、smoke、deploy、incident repair 等）：**必須**由 **Trigger.dev** 擁有（重試、可恢復步驟、核准等待）。
2. **n8n** 僅用於 **輕量黏著**：webhook 入站正規化、通知派送、低風險同步；**不得**成為 **生產關鍵部署邏輯** 的唯一擁有者。
3. **IDE／MCP 層**（Cursor `mcp.json`）**不覆寫**上述龍蝦執行路由；見 `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md` 與 Spec「Cursor IDE MCP layer」一節。
4. **若要改寫此邊界**（例如某類任務改由 n8n 主導）：必須 **同時** 修訂 **`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`**（含 routing 表）並 **新 ADR** 或 **廢止本 ADR** 註明取代關係。

## 後果

### 正面

- 與既有閘道、policy JSON、`workflow_runs` 寫入模型一致；新人查 **一張表**（Spec）即可。

### 負面／代價

- n8n 愛好者需接受「n8n 不當總司令」；複雜流程應 **Trigger 內** 或 **API** 分層。

### 需跟進文件／腳本

- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（規範正本）
- `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`

## Related

- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（**normative**）
- ADR 002（身分與控制面正交）
