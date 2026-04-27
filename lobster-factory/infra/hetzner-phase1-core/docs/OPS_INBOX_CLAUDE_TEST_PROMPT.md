# Prompt：請 Claude 執行 Ops Inbox（Path B）端到端測試

將下方 **「給 Claude 的完整指令」** 區塊整段複製到 Claude（Claude Code / 專案對話）即可。可依你環境改寫主機、路徑、網域。

---

## 給 Claude 的完整指令

你是資深 SRE／全端工程師，請在**已取得授權**的前提下，對 **Aware Wave** 的 **Ops Inbox（next-admin Path B）** 做**可重現、可驗證**的端到端測試，並用條列報告結果（PASS／FAIL、HTTP 狀態碼、關鍵 JSON 欄位、截圖或 log 摘要即可）。

### 範圍與目標

1. **驗證公開健康檢查**  
   - 對 `https://app.aware-wave.com/api/ops/inbox/health` 發 `GET`。  
   - 確認 JSON 含：`ok`、`open_count`、`last_ingest_at`、`ingest_token_configured`、`notify_enabled`、`slack_webhook_configured`。  
   - **解讀**：若 `ingest_token_configured` 為 `false`，則所有需 `Authorization: Bearer` 的 webhook **不可能**成功寫入 Inbox；若 `notify_enabled` 或 `slack_webhook_configured` 為 `false`，則不應預期 Slack 會收到訊息。

2. **驗證 Webhook 認證行為（不洩漏祕密）**  
   - 對 `POST https://app.aware-wave.com/api/webhooks/sentry`：  
     - 先**不帶** `Authorization` → 預期 **401**。  
     - 再帶 `Authorization: Bearer <明顯錯誤的測試字串>` + **合法最小 JSON body**（見 repo `lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.sh` 內 Sentry 範例）→ 預期 **401**。  
   - 可選：對 `/api/webhooks/grafana`、`uptime-kuma`、`netdata` 各做一次「無 Bearer → 401」抽查。

3. **在具備真實 `OPS_INBOX_INGEST_TOKEN` 的環境執行合成測試（若你能存取該環境）**  
   - Repo 已提供腳本（**不要**把 token 貼進聊天或 commit）：  
     - Linux：`lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.sh`  
     - Windows：`lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.ps1`  
   - 執行前設定環境變數（值由 vault／伺服器 `.env` 取得，**禁止**寫入 git）：  
     - `OPS_INBOX_TEST_BASE_URL=https://app.aware-wave.com`（或實際 Admin 網域）  
     - `OPS_INBOX_INGEST_TOKEN=<與各監控 Webhook 一致的 Bearer>`  
   - 預期：四個來源（`sentry`、`uptime_kuma`、`grafana`、`netdata`）各回 **HTTP 200**，body 含 `incident_id`、`transition`（新事件多為 `new`）。

4. **驗證 UI**  
   - 瀏覽器開 `https://app.aware-wave.com/ops/inbox`，篩選 **「全部」**（URL 應含 `?status=all` 或等同行為）。  
   - 預期：合成測試後可看到**最多四筆**新事件（標題含 probe／Synthetic 等）；頁面上方應有**說明區**（警報收件匣、Webhook 列表、測試腳本提示）。若仍為舊版文案（例如 “Unified incident inbox”），表示 **next-admin 映像未更新**，需重新部署後再測。

5. **驗證 Slack（若營運要求）**  
   - 容器／compose 環境需同時滿足（同樣從 vault 讀取，**不要**貼進聊天）：  
     - `OPS_INBOX_NOTIFY_ENABLED=true`  
     - `OPS_INBOX_SLACK_INCIDENTS_WEBHOOK=<Slack Incoming Webhook URL>`  
     - `OPS_INBOX_PUBLIC_URL=https://app.aware-wave.com`（與實際對外網域一致，供訊息內連結）  
   - 合成測試觸發 **新事件** 後，預期 Slack 頻道出現含嚴重度與「Open in Inbox」連結的訊息；並在該筆事件詳情頁 **Notify Log** 看到 `sent`（或若關閉通知則為 `skipped` + `reason`）。

6. **（選做）各「真實監控」來源各觸發一次**  
   僅在營運同意、且不影響客戶的前提下執行：  
   - **Sentry**：專案內丟測試 exception，或 Issue／Alert 的 test notification，且 Webhook URL 指向 `https://app.aware-wave.com/api/webhooks/sentry` 並帶正確 Bearer。  
   - **Uptime Kuma**：使某 monitor 進入 DOWN（暫停、錯 URL、維護模式等），Webhook 指向 `/api/webhooks/uptime-kuma`。  
   - **Grafana**：Alerting 對規則執行 Test 或讓查詢 firing，Webhook 指向 `/api/webhooks/grafana`。  
   - **Netdata**：送 **CRITICAL** 或 **WARNING**（`CLEAR` 且會被略過的 path 不要當成「失敗」）。Webhook 指向 `/api/webhooks/netdata`。

### 硬性約束

- **绝不**在 issue、PR、聊天、WORKLOG 中貼出：`OPS_INBOX_INGEST_TOKEN`、Slack webhook URL、Supabase service role key。  
- 若無 SSH／無 `.env` 讀取權限：**只做**步驟 1–2 與「根據 health 推論的阻塞說明」，並明確寫「需人類在伺服器設定 token 後才能執行步驟 3–5」。

### 請回覆的報告格式

- **環境**：測試日期、目標網域、是否使用生產。  
- **Health**：完整 JSON 摘要（可遮罩非必要欄位）。  
- **Webhook 匿名／錯 token**：各端點 HTTP 狀態與第一行 body。  
- **合成腳本**：有／無執行；若未執行，原因（例如 token 空）。若已執行，四來源各一行：`source` → HTTP → `incident_id` 摘要。  
- **UI**：是否看到新事件、篩選「全部」是否正確、是否為新版中文說明。  
- **Slack**：有／無收到；若無，對照 health 與 Notify Log 的原因。  
- **結論**：PASS／BLOCKED，以及下一個最小動作（一句話）。

---

## 維護說明（給人類）

- 腳本與 compose 變數對照：`.env.example`、`docker-compose.yml` 內 `next-admin.environment`。  
- 實作與 Payload 形狀：`apps/next-admin/lib/ops-inbox/normalize/*.ts`、`app/api/webhooks/*/route.ts`。  
- 長篇實作規格：`docs/Ops_Observability_PathB_Implementation.md`（repo 根 `docs/`）。
