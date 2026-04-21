# SLO 週報（最小）— n8n workflow 說明

## 檔案

- **`slo-weekly-slack-probe.json`** — 匯入 n8n 用。

## 行為

1. **每週一 01:00 UTC** 觸發（可在 Schedule 節點改）。
2. 對四個公開 URL 發 **GET**（與 `endpoint-alert.sh` 相同清單）。
3. 組一段 Markdown 風格文字，經 **Slack Incoming Webhook** POST 出去。
4. **Manual Trigger** 方便你匯入後立刻測一次。

## 匯入後必做

1. 編輯節點 **Set Slack webhook + optional note**：  
   - **`slackWebhookUrl`**：貼上 `https://hooks.slack.com/services/...`（**不要** commit）。  
2. **Activate** workflow。  
3. **Manual Trigger** → Execute，確認 Slack `#infra-alerts`（或 webhook 綁定頻道）有訊息。

## 限制（刻意保持最小）

- 這是 **可用率粗探**（2xx/不丟錯誤即視為 OK），**不是** p95 延遲或錯誤預算儀表；進階 SLO 請再接 Cloudflare / Grafana / Loki 指標。

## 相關文件

- `agency-os/docs/operations/OBSERVABILITY_P1_P2_ROLLOUT.md`
- `agency-os/docs/operations/OBSERVABILITY_FIRST_TIME_SETUP_ZH.md`
