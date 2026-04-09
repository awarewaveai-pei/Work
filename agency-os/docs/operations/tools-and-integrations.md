# Tools and Integrations

## Integrations
- WordPress
- Supabase
- GitHub
- n8n
- Replicate
- DataForSEO
- ~~**Airtable**~~：**已淘汰**（2026-03-30）；**功能須遷到 Supabase**（schema、權限、自動化改接），見 **`docs/operations/airtable-to-supabase-migration-playbook.md`**；MCP 清單對照見 **`docs/operations/cursor-mcp-and-plugin-inventory.md`**。

## Cursor MCP 與外掛分工（完整表）
- **權威索引**：**`docs/operations/cursor-mcp-and-plugin-inventory.md`**（與 repo 根 **`mcp.json`** 的 `mcpServers` 鍵對齊子表；含 LLM 分流、plugin MCP、與龍蝦 [`MCP_TOOL_ROUTING_SPEC`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 的對照）。

## Credential Rule
- 憑證不落地在 Markdown、聊天訊息、或版本庫。
- 只用環境變數與密鑰管理工具注入執行環境。

## Expected Environment Variables
- `WP_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`
- `N8N_BASE_URL`
- `N8N_API_KEY`
- `REPLICATE_API_TOKEN`
- `DATAFORSEO_LOGIN`
- `DATAFORSEO_PASSWORD`

## Operational Notes
- **Windows 本機 WordPress（MariaDB／PHP／WP-CLI）**：給龍蝦／WP-CLI **真本機站台**用（**MySQL 相容**）；**不是** MCP 項目，也**不**取代 **Supabase（Postgres）** 平台職責。雙機／筆電對齊見 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5.1**；與 MCP 表分界見 **`docs/operations/cursor-mcp-and-plugin-inventory.md` §4**；逐步操作見 **`lobster-factory/docs/operations/LOCAL_WORDPRESS_WINDOWS.md`**。
- **WordPress 客戶交付模式（建議主流程）**：以 **雲端 staging 優先**統一「既有站接手」與「新站從零」兩種業務型態，詳 **`docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`**（跨機一致、上線 gate、回滾策略）。
- **MCP 清單與分工**：見 **`docs/operations/cursor-mcp-and-plugin-inventory.md`**；連線步驟見 **`docs/operations/mcp-add-server-quickstart.md`**（若日後另有 `mcp/CONNECTORS.md` 可併列入口，非必填）。
- 每次整合異動都需記錄於 `WORKLOG.md`。

## Related Documents (Auto-Synced)
- `docs/operations/airtable-to-supabase-migration-playbook.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/standards/n8n-workflow-architecture.md`
- `tenants/templates/tenant-template/03_TOOLS_CONFIGURATION_GUIDE.md`

_Last synced: 2026-04-09 09:29:25 UTC_

