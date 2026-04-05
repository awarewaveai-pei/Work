# ADR 005: 系統真相在 Supabase（Postgres）；WordPress DB 僅交付執行期

- **狀態**：已接受（與 **MCP_TOOL_ROUTING_SPEC**「Supabase is the system of record」對齊）
- **日期**：2026-04-02

## 脈絡

- 同時存在 **Supabase（專案／租戶／workflow／核准／稽核）** 與 **WordPress（站台內容、外掛、訂單等執行期）**。
- 常見反模式：把 **編排狀態、客戶主檔、核准結果** 塞進 **WP post meta／option**，導致 **跨站匯總困難**、**RLS 不可用**、**與龍蝦閘道脫鉤**。

## 決策

1. **System of Record（SoR）** 用於：**核准、workflow 執行紀錄、事件／事故、與工廠相關之結構化狀態** → **Supabase Postgres**（含既定 schema／RLS／migration 流程）。
2. **WordPress DB** 定位為 **交付執行期**：內容、商業外掛資料、訂單／會員（依客戶 stack）等 **發生在站內** 的資料。
3. **禁止（除非專案 ADR 另批）**：以 **WP 資料表／meta** 作為 **龍蝦工廠編排** 的 **唯一** 真相來源（例如「是否已核准上線」只存在 option 字串）。
4. **整合模式**：WP 與 SoR 的對應關係（site_id、tenant 映射）應落在 **Supabase 可稽核欄位** 或 **明確 API**；同步可走 n8n／Trigger，但 **狀態回寫 SoR** 須符合 Routing Spec。
5. **若要 SoR 分裂**（例如某產品線改第二個 Postgres）：**新 ADR** + migration + 雙寫／切流計畫。

## 後果

### 正面

- 儀表板、健康檢查、跨客戶報表 **單一查詢平面**；與 Trigger 寫入 `workflow_runs` 等一致。

### 負面／代價

- 客戶若堅持「一切都在 WP」需 **額外工程** 把關鍵狀態 **鏡像** 回 Supabase（或走明確豁免 ADR）。

### 需跟進文件／腳本

- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `tenants/templates/core/ENVIRONMENT_REGISTRY.md`（環境與 URL 仍屬租戶文件層，與 SoR 互補）
- `docs/operations/security-secrets-policy.md`（DB／service role 邊界）

## Related

- ADR 004（誰跑 workflow）
- ADR 006（租戶隔離與身分對照）
- ADR 001／003（manifest 檔案層與 packages SoR）
