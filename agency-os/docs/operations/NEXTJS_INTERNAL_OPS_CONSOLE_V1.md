# Next.js Internal Ops Console v1（正本）

## 目的
- 定義「內部營運控制台」第一版可交付範圍（v1）。
- 避免 UI 無限擴張，確保與既有編排/資料主權一致。

## 邊界（必守）
- **Trigger.dev**：durable workflow owner（關鍵流程主權）。
- **n8n**：webhook ingress / 通知 / 輕量同步（glue）。
- **Supabase**：SoR（資料真相）。
- **Node worker/API**：客製執行邏輯。
- **Next.js 控制台**：僅為「操作與可視化介面」，不可繞過上述主權邊界。
- **媒體分層（固定）**：
  - AI 生圖資產：Cloudflare R2（物件儲存）。
  - WordPress 商品圖/部落格圖：WordPress 預設媒體庫（`wp-content/uploads` + MySQL metadata）。
  - 控制平面（任務、審批、追蹤、版本）：Supabase。

## v1 功能範圍（In Scope）
1. **租戶總覽頁**
   - 顯示租戶清單、狀態、最近流程結果、風險燈號。
2. **租戶設定頁**
   - 編輯可安全配置欄位（非密鑰），例如部門映射、環境標記。
3. **流程狀態頁**
   - 顯示最近 workflow run（Trigger/n8n），可查 run_id 與狀態。
4. **受控觸發頁**
   - 只允許觸發已核准類型的 staging 作業。
5. **審計軌跡頁**
   - 顯示「誰在何時做了什麼」的操作紀錄（讀取 SoR 審計表）。
6. **AI 生圖作業頁**
   - 送出生成任務、追蹤狀態、回填 R2 產物位置與版本。
   - 僅允許受控模型與受控輸出路徑。

## v1 不做（Out of Scope）
- 不做 CRM 替代（FluentCRM 仍是 CRM 系統）。
- 不做流程編排引擎（不取代 Trigger/n8n）。
- 不做直接資料庫管理介面（不提供任意 SQL）。
- 不做 production 高風險一鍵放行（須保留人工核准流程）。

## 權限模型（v1 最小集合）
- `owner`：可看全租戶、可進行高風險前置操作（仍需核准）。
- `admin`：可管理租戶配置、可觸發 staging 作業。
- `operator`：可看狀態與執行低風險操作。
- `viewer`：唯讀。
- 角色解析策略（長期模式）：
  - claims 優先（`x-ops-claims-role` / `x-user-role` / `x-clerk-role`）。
  - `NODE_ENV=production` 預設 `claims_only`（無 claims 即視為 `viewer`）。
  - 非 production 可用 `claims_with_simulated_fallback`，僅供本機/staging smoke。
  - 參數：
    - `OPS_ROLE_RESOLUTION_MODE=claims_only|claims_with_simulated_fallback`
    - `OPS_ALLOW_SIMULATED_ROLE_FALLBACK=true|false`
    - `OPS_PROXY_SHARED_SECRET=<shared-secret>`（由 trusted proxy 注入 `x-ops-proxy-auth` 才接受 claims）。
  - `next-admin` middleware 會對 `/api/ops/*` 做 header 清洗：
    - 非 trusted proxy 來源：移除 claims header，production 也會移除 simulated header。
    - trusted proxy 且 claims 合法：正規化為 `x-ops-claims-role` 再交由 API 層授權。

## 資料與 API 契約（v1）
- UI 只走受控 API（Node API/BFF），不直連 service_role。
- API 對外最小端點：
  - `GET /ops/tenants`
  - `GET /ops/tenants/:id`
  - `PATCH /ops/tenants/:id/config`
  - `GET /ops/workflow-runs?tenant_id=...`
  - `POST /ops/actions/:action_id/trigger`（僅 staging allowlist）
- `POST /ops/ai-image-jobs`
- `GET /ops/ai-image-jobs?tenant_id=...`
- 所有寫入都附帶 `actor_id`、`tenant_id`、`trace_id`。
- 所有寫入審計需附帶 `role_source`（`claims|simulated|default_viewer`）與變更差異（before/after）。

## 驗收標準（DoD）
1. 可建立/更新 1 筆測試租戶設定並回顯成功。
2. 可看到至少 1 筆 Trigger run 與 1 筆 n8n run 狀態。
3. 觸發 staging 作業可留存審計紀錄。
4. 權限測試：2 個角色看到不同可操作項。
5. 不存在直接繞過 API 直寫 SoR 的 UI 路徑。
6. AI 生圖可寫入 R2，且在 Supabase 可查到對應 `job -> asset` 追蹤。
7. WordPress 商品/部落格圖流程不改其既有媒體儲存路徑（仍為 WP 媒體庫）。

## 本機 / staging 快速驗收（v1 最小路徑）
1. 套用 `lobster-factory/packages/db/migrations/0011_ops_console_control_plane.sql` 至目標 Supabase（staging 先）。
2. 在 `next-admin` 容器或本機 `dev` 設定 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`（或 dev 用 `anon`；正式環境建議改 service role + 後續 BFF 收斂）。
3. 開啟 `next-admin` 的 `/ops-console`，在 **Controlled write — AI image job** 送出表單；`viewer` 應被 UI 與 API 同時擋下。
4. 在 Supabase 驗證新列：`ai_image_jobs.status = queued` 且 `ops_audit_events` 有對應 `ai_image_job_created`。
5. 在 production/staging 驗證：未帶 claims role header 時，寫入 API 應拒絕（角色落為 `viewer` 或 `forbidden_role`）。
6. 可用 `scripts/ops-console-smoke.ps1` 做快速驗收（server ready 後）：
   - 唯讀：`pwsh ./scripts/ops-console-smoke.ps1 -BaseUrl https://app.aware-wave.com`
   - 含寫入：`pwsh ./scripts/ops-console-smoke.ps1 -BaseUrl https://app.aware-wave.com -TenantId <org-uuid> -EnableWriteChecks`
7. 若尚未有 `tenant_id` 或不確定 migration，先跑 bootstrap：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/ops-console-bootstrap.ps1 -SupabaseUrl <supabase-url> -SupabaseServiceRoleKey <service-role-key> -TenantSlug awarewave-ops -TenantName "AwareWave Ops"`
   - 腳本會：檢查 `0011` 需要的表是否存在、補一筆 organization（若缺）、輸出可直接回報的 5 行內容。
8. 先跑網路前檢（避免把連線問題誤判成 migration 問題）：
   - `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/ops-network-precheck.ps1 -AppBaseUrl https://app.aware-wave.com -SupabaseUrl https://supabase.aware-wave.com -ApiHealthUrl https://api.aware-wave.com/health`
9. 最小種子（v1 smoke）：
   - `lobster-factory/packages/db/migrations/0012_seed_ops_console_minimal.sql`
   - 目的：補 `awarewave-ops` organization 與 `ops_action_catalog` 測試 action（可重複執行，不重複建垃圾資料）。

## 實作順序（建議）
1. 租戶總覽頁（唯讀）
2. 流程狀態頁（唯讀）
3. 租戶設定頁（受控寫入）
4. 受控觸發頁（staging only）
5. 權限與審計收斂
6. AI 生圖頁（R2 + SoR trace）

## 控制平面資料模型（v1）
- migration：`lobster-factory/packages/db/migrations/0011_ops_console_control_plane.sql`
- 新增核心表：
  - `ops_action_catalog`
  - `ops_action_runs`
  - `media_assets`
  - `ai_image_jobs`
  - `ops_audit_events`
- `media_assets.storage_backend` 只允許 `r2` 或 `wp_uploads`，避免長期語意漂移。

## 證據欄位（寫入 WORKLOG）
- `tenant_slug`
- `actor_role`
- `workflow_run_id`
- `trace_id`
- `ui_capture_path`
- `result`

## 相關文件
- `docs/operations/ARCHITECTURE_SPEC.md`
- `docs/operations/TOOL_RESPONSIBILITY_MATRIX.md`
- `docs/operations/DEPLOYMENT_BOUNDARY_RULES.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `TASKS.md`
