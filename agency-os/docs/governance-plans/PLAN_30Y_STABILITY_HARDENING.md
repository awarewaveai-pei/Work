> **Owner**：全庫穩定化（觀測、密鑰、備援、變更治理）分階段計畫。對應舊 Cursor 檔名 **`30y-stability-hardening_*.plan.md`**。  
> **API 邊界與路由**請改 [`../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](../edge-and-domains/PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)。

# 30 年級穩定化落地計畫

## 目標與決策

- 採用預設策略：**低到中風險、不中斷優先、每一步可回滾**。
- 先不大改拓撲；先把現有系統變成「可驗證、可監控、可復原、可審計」。
- 成功標準：
  - 每次開工/收工都有一致 Gate。
  - 任何服務錯誤能在 5 分鐘內定位到責任服務。
  - 備份可在演練中成功還原。
  - 變更有 ADR 與回滾紀錄。

## 系統範圍（以現況為準）

- 應用層：`node-api`、`next-admin`、`n8n`、`wordpress`、Trigger workflows。
- 編排層：`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`、`lobster-factory/infra/trigger/docker-compose.yml`。
- 治理層：`agency-os/TASKS.md`、`agency-os/WORKLOG.md`、`agency-os/memory/*`、`agency-os/docs/operations/*`。

## 分階段執行

### Phase 1（先做，1–2 天）：可靠性基線

- 統一 Sentry 分流與命名，凍結變數契約（已開始）。
- 補齊每個服務最小健康檢查、錯誤分類、告警路由（P1 告警規則）。
- 交付文件：
  - 更新 [`lobster-factory/infra/hetzner-phase1-core/README.md`](../../../lobster-factory/infra/hetzner-phase1-core/README.md)
  - 更新 [`lobster-factory/infra/hetzner-phase1-core/.env.example`](../../../lobster-factory/infra/hetzner-phase1-core/.env.example)
  - [`SENTRY_ALERT_POLICY.md`](../operations/SENTRY_ALERT_POLICY.md)（`agency-os/docs/operations/`）

### Phase 2（2–4 天）：資安與密鑰治理

- 實施「單一 owner + 輪替日曆 + 最小權限」：先從 Trigger/n8n/GitHub/Supabase 高風險鍵開始。
- 把「輪替不壞服務」做成固定流程（演練一次，保留證據）。
- 交付文件與腳本：
  - 強化 [`security-secrets-policy.md`](../operations/security-secrets-policy.md)
  - 補齊 [`secrets-governance-p1-closeout.md`](../operations/secrets-governance-p1-closeout.md)（若路徑不同以 repo 實際為準）
  - 新增 `secrets-rotation-checklist` 自動檢查腳本（掛到 closeout gate）

### Phase 3（2–3 天）：備援與災難復原

- 定義 RPO/RTO（先給現實版：例如 RPO 24h / RTO 4h，後續再收緊）。
- 建立「可重複還原演練」：從備份檔在乾淨環境復原一次。
- 交付：
  - 更新 [`LONG_TERM_OPS.md`](../../../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md)
  - 新增 `DR_RESTORE_DRILL_RUNBOOK.md`（`agency-os/docs/operations/`）
  - 在 `verify-build-gates` 增加「最近一次 restore drill 證據存在」檢查

### Phase 4（持續）：變更治理與長期演進

- 每次高風險變更都要 ADR + 回滾步驟 + 演練記錄。
- 把月/季巡檢制度化：路由矩陣、inventory、traceability drift 檢查。
- 交付：
  - 更新 [`TOOLS_DELIVERY_TRACEABILITY.md`](../operations/TOOLS_DELIVERY_TRACEABILITY.md)
  - 更新 [`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`](../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md)
  - 更新 [`lobster-factory/docs/ROUTING_MATRIX.md`](../../../lobster-factory/docs/ROUTING_MATRIX.md)

## 技術實施重點

- 任何新規則先以 **read-only 檢查 + 報告** 上線，再升級成 hard-fail gate。
- 先「看得見風險」再「阻斷風險」；避免一次把流程卡死。
- 生產寫入與部署仍遵守既有 routing spec 與 AO-CLOSE gate，不繞過。

## 驗證策略

- 單元驗證：每個服務至少 1 個 smoke test（健康 + 失敗上報）。
- 流程驗證：`AO-RESUME` / `AO-CLOSE` 路徑均 PASS。
- 韌性驗證：完成 1 次備份還原演練，輸出證據報告。

## 風險與回滾

- 風險：告警噪音過高、密鑰輪替影響連線、新增 gate 初期造成誤阻擋。
- 回滾：所有變更以「配置與文件優先」，程式變更分支化提交；任何 gate 可臨時降級為 warn-only（保留審計軌跡）。

## 執行待辦（Checklist）

- [ ] **P1**：封板 Sentry 分流契約、告警規則與 smoke 驗證流程。
- [ ] **P2**：高風險密鑰 owner/輪替/審計，完成一次不中斷演練。
- [ ] **P3**：定義 RPO/RTO 並完成一次備份還原演練（含證據）。
- [ ] **P4**：把 routing/inventory/traceability 月季巡檢掛入 gate。
- [ ] **P5**：完善故障定位與值班 runbook（5 分鐘可定位責任服務）。

## 第一刀建議

- 先完成 **Phase 1** 的告警與 DSN 契約封板（其餘三層的觀測基礎）。
- 然後接 **Phase 2** 高風險密鑰輪替演練。
