# ADR 006: 多租戶隔離（Supabase RLS）與 Clerk 組織對齊

- **狀態**：已接受（原則層；**具體欄位名** 以 migrations／schema 為準，與本 ADR 衝突時 **以 DB 與 RLS 政策為準**）
- **日期**：2026-04-02

## 脈絡

- 同庫需服務 **多家客戶（租戶）** 與 **內部角色**；**ADR 002** 已定 **Clerk** 為應用層身分，**ADR 005** 已定 **Supabase** 為工廠／控制面 SoR。
- 若無 **強制租戶鍵** 與 **RLS**，任一 API bug 即可能 **跨租戶讀寫**——屬 **不可逆聲譽風險**，三十年尺度不可賭「程式永遠寫對」。

## 決策

1. **租戶識別**：凡屬「客戶邊界」之業務列，必須帶 **穩定租戶鍵**（例如 `tenant_id`／`organization_id` UUID；**禁止**僅用人類可讀 slug 當唯一隔離鍵）。
2. **RLS**：Postgres 對上述表採 **預設拒絕跨租戶**（依 `auth.uid()`／JWT claim／service role 路徑明確放行）；**匿名或漏 claim** 不得落到他戶資料。
3. **Clerk ↔ 租戶**：以 **顯式對照表**（或等價、可稽核之關聯）保存 **`clerk_org_id`（或 user→tenant）↔ `tenant_id`**；**禁止**在應用層只靠「email 網域猜租戶」作唯一機制。
4. **Git `tenants/company-*`**：為 **營運／文件真相**（SOP、台帳）；**權限與授權** 仍以 **DB＋政策** 為準，**不**以「有資料夾」自動等同「有權限」。
5. **服務端／Trigger**：使用 **service role** 時必須 **自行限定 tenant scope**（查詢條件／policy 相容設計），**禁止**無邊界全表掃描寫入。
6. **變更隔離模型**（例如改為 row-level 與 org 樹不同步）：**新 ADR** + migration + 資料回填計畫。

## 後果

### 正面

- 長期可擴租戶數；稽核與滲透測試有 **明確邊界** 可驗證。

### 負面／代價

- 每張新表／新 API 都要過 **租戶鍵與 RLS** 檢視；開發速度略降，換 **事故機率大降**。

### 需跟進文件／腳本

- **`lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`**：`clerk_organization_mappings`、`current_clerk_org_id_from_jwt()`、擴充 `user_has_org_access`（membership **或** JWT org + 對照表）；對含 `organization_id` 之業務表與核心階層（workspaces／projects／sites／environments 等）補 **SELECT + INSERT + UPDATE + DELETE** RLS（同 `user_has_org_access`）；**organizations** 之 **INSERT** 仍預設走 **service_role**／受控流程（避免新 org id 與 membership 雞生蛋）；**profiles** 允許自寫入；**organization_memberships** 僅 **SELECT 自己列**（管理成員多由 service 寫入）。
- **JWT**：Clerk（或 IdP）模板須讓 Supabase `auth.jwt()` 帶出 **`org_id` 或 `clerk_org_id`**（或 `app_metadata.org_id`／`user_metadata.org_id` 後備）；否則僅 membership 路徑生效。
- **Staging 驗證建議**：以使用者 A（org1）JWT 查詢 `workflow_runs`／`sales_leads` 等，應 **無法** 讀取 org2 之列；以 **service role** 寫入 mapping 列後，同一 JWT 可讀對應 `organization_id` 之資料（若無 `organization_memberships` 列）。
- `docs/operations/security-secrets-policy.md`
- ADR 002、005

## Related

- ADR 002、005
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`（核准與審計寫入 SoR）
