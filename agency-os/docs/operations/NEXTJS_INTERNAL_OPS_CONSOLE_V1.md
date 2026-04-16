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

## 資料與 API 契約（v1）
- UI 只走受控 API（Node API/BFF），不直連 service_role。
- API 對外最小端點：
  - `GET /ops/tenants`
  - `GET /ops/tenants/:id`
  - `PATCH /ops/tenants/:id/config`
  - `GET /ops/workflow-runs?tenant_id=...`
  - `POST /ops/actions/:action_id/trigger`（僅 staging allowlist）
- 所有寫入都附帶 `actor_id`、`tenant_id`、`trace_id`。

## 驗收標準（DoD）
1. 可建立/更新 1 筆測試租戶設定並回顯成功。
2. 可看到至少 1 筆 Trigger run 與 1 筆 n8n run 狀態。
3. 觸發 staging 作業可留存審計紀錄。
4. 權限測試：2 個角色看到不同可操作項。
5. 不存在直接繞過 API 直寫 SoR 的 UI 路徑。

## 實作順序（建議）
1. 租戶總覽頁（唯讀）
2. 流程狀態頁（唯讀）
3. 租戶設定頁（受控寫入）
4. 受控觸發頁（staging only）
5. 權限與審計收斂

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
