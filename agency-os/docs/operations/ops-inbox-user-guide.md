# Ops Inbox 操作手冊

> **一句話定位**：Ops Inbox 是警報的收件匣，不是監控儀表板。各系統（Netdata、Uptime Kuma、Sentry、Grafana、PostHog）的警報觸發後，會透過 Webhook 寫入 Supabase，然後出現在這裡。
>
> **網址**：https://app.aware-wave.com/ops/inbox

---

## 1. 介面總覽

### 收件匣列表頁（`/ops/inbox`）

| 區塊 | 說明 |
|---|---|
| 上方 Filter Bar | 依嚴重程度（critical / warning / info）、狀態（open / investigating / resolved / ignored）篩選 |
| Incident Card | 每一張卡顯示：標題、來源（netdata / sentry 等）、服務名稱、環境、發生次數（N×）、最後時間、狀態 |
| Badge 顏色 | 🔴 critical　🟡 warning　🔵 info |

### 事件詳情頁（`/ops/inbox/<incident-id>`）

```
┌─────────────────────────────────────────────────────────────┐
│ ← Ops Inbox / INC-xxxxxxxx           [Acknowledge] [Resolve]│
│ CRITICAL · netdata · (host-level) · production · 1×         │
├──────────────────────────────────────┬──────────────────────┤
│ ✨ Gemini auto-summary               │ Service              │
│  （Gemini 自動診斷結果）               │ Occurrences          │
├──────────────────────────────────────│ Notify Log           │
│ Choose your AI                       │                      │
│  [Open in Cursor] [ChatGPT] [Claude] │                      │
│  [Gemini Pro] [Copy→CLI]             │                      │
├──────────────────────────────────────┤                      │
│ Paste AI conclusion                  │                      │
│  [下拉選 category] [文字框]  [Save]  │                      │
├──────────────────────────────────────┤                      │
│ ▶ Raw payload                        │                      │
└──────────────────────────────────────┴──────────────────────┘
```

---

## 2. 使用流程（標準）

### 步驟 1：看 Gemini auto-summary

詳情頁上方藍色區塊「✨ Gemini auto-summary」**在新 incident 進來後數秒內自動產生**，內容包含：

- 這個警報是什麼意思
- 可能的根本原因
- 是否為真實問題（或合成探針 / 已知模式）
- → 結論與建議行動

> 如果顯示「尚未分類」：代表 `OPS_INBOX_GEMINI_ENABLED` 未啟用，或是更早進來的 incident（已補 retrigger 機制）。

### 步驟 2：判斷是否需要人工處理

| Gemini 說 | 你的行動 |
|---|---|
| 合成探針 / synthetic probe | 點 **Ignore** 忽略，不用處理 |
| 已知排程任務、暫時性 spike | 點 **Ignore** 或 **Resolve**，加說明 |
| 真實問題，需調查 | 點 **Acknowledge** → 開始處理 |
| 真實問題，已修復 | 點 **Resolve** |

### 步驟 3（需要深入診斷）：用 AI 工具

| 按鈕 | 行為 |
|---|---|
| **Open in Cursor →** | 把完整 incident payload 帶進 Cursor IDE，AI 可直接看 codebase + alert |
| **Ask Claude →** | 把診斷 prompt 複製到剪貼簿，自動開啟 claude.ai |
| **Ask ChatGPT →** | 同上，開啟 ChatGPT |
| **Ask Gemini Pro →** | 同上，開啟 Gemini |
| **Copy → Codex / Copilot / Gemini CLI** | 複製 prompt，貼到 terminal 的 CLI 工具 |

### 步驟 4：貼上 AI 結論存檔

1. 把 AI 給的 RCA / 診斷結論貼到「Paste AI conclusion」文字框
2. 下拉選擇 category（Root Cause / Next Steps / Other 等）
3. 點 **Save diagnosis** → 寫入 Supabase，紀錄保留

---

## 3. 警報類型識別速查

### `ops_inbox_probe_<timestamp>` — 合成探針（可忽略）

```
Netdata: ops_inbox_probe_1777312398 = 99 on probe-host-1777312398
```

- **判斷依據**：metric 名稱和 host 名稱都含 10 位數字（Unix timestamp）
- **含義**：Ops Inbox 系統自動發送的端到端 pipeline 健康探測
- **行動**：Ignore

### Uptime Kuma DOWN / RECOVERED — 服務不可用

- 真實問題（連不到 endpoint）或 SG 網路瞬斷（例如 2026-04-26 10 分鐘網路事件）
- **判斷**：看 Gemini summary 和 occurrence count；單次 1× 且秒後 RECOVERED = 瞬斷

### Sentry Error — 程式錯誤

- 看 `service` 欄位對應哪個 app，Gemini 會指出 error type 和 stack trace 摘要

### Netdata CPU / Memory — 資源警報

- 看 `service` 欄位（哪台 server）；Gemini 會指出可能的程序

---

## 4. Webhook 端點（接收來源用）

| 來源 | Webhook URL |
|---|---|
| Netdata | `https://app.aware-wave.com/api/webhooks/netdata` |
| Uptime Kuma | `https://app.aware-wave.com/api/webhooks/uptime-kuma` |
| Sentry | `https://app.aware-wave.com/api/webhooks/sentry` |
| Grafana | `https://app.aware-wave.com/api/webhooks/grafana` |
| PostHog | `https://app.aware-wave.com/api/webhooks/posthog` |

**Bearer Token**：`OPS_INBOX_INGEST_TOKEN`（見 `AWARE_WAVE_CREDENTIALS.md` §22 或 server `.env`）

---

## 5. 環境變數（ops inbox 功能開關）

| 變數 | 說明 | 目前值 |
|---|---|---|
| `OPS_INBOX_GEMINI_ENABLED` | 啟用 Gemini auto-classify | `true` |
| `OPS_INBOX_GEMINI_DAILY_LIMIT` | 每日最多分類數（quota 保護） | `1400` |
| `GEMINI_API_KEY` | Gemini API 金鑰 | 已設定 |
| `OPS_INBOX_NOTIFY_ENABLED` | 啟用 Slack 通知 | `true` |
| `OPS_INBOX_SLACK_INCIDENTS_WEBHOOK` | Slack webhook URL | 已設定 |
| `OPS_INBOX_POSTHOG_ENABLED` | 接收 PostHog 警報 | `true`（SG）|

設定檔位置（SG server）：`/root/lobster-phase1/.env`

---

## 6. 常見問題

**Q：Gemini summary 一直顯示「尚未分類」**
→ 確認 `/root/lobster-phase1/.env` 裡 `OPS_INBOX_GEMINI_ENABLED=true` 且 `GEMINI_API_KEY` 有值，再 `docker compose up -d next-admin`（需 rebuild）。

**Q：每分鐘收到大量 Slack 通知**
→ 可能是 Uptime Kuma SQLite 損壞或 monitor 設定錯誤（見 2026-04-27 事件：`slackWebhookURL` 欄位改名問題）。

**Q：看到 `probe-host-` 開頭的 host 名稱**
→ 合成探針，直接 Ignore。

**Q：Incident 一直是 open 狀態**
→ 只有有 ops 角色的使用者可以更改狀態（`canModifyIncidentStatus`）。

---

## Related Documents

- `docs/operations/RUNBOOK_INCIDENT_RESPONSE.md` — 分級與 SLA 標準
- `docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md` — 監控架構全貌
- `docs/operations/OBSERVABILITY_FIRST_TIME_SETUP_ZH.md` — 初次設定 Webhook

_Last updated: 2026-04-28_
