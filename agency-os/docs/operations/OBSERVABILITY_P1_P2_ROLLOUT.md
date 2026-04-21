# 觀測與告警：P1 / P2 落地順序（Aggregator、外部探測、Loki、SLO）

**目的**：把 **Netdata、Sentry、對外 HTTP 探測（含 Uptime Kuma 公開面）** 收斂成 **可叫醒、可去重、可對時間軸除錯** 的營運能力；本檔為 **執行正本**（不含密鑰與 webhook URL）。

**第一次設定（繁中逐步、含 PagerDuty／外部探測／Grafana tunnel／n8n 週報）**：請改看 **[`OBSERVABILITY_FIRST_TIME_SETUP_ZH.md`](OBSERVABILITY_FIRST_TIME_SETUP_ZH.md)**。

**相關 repo 路徑**：

- 對外端點探測腳本：`lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`（可選 **PagerDuty Events API v2**）
- systemd unit：`lobster-factory/infra/hetzner-phase1-core/scripts/awarewave-endpoint-alert.service`（載入可選 `/etc/default/awarewave-endpoint-alert.pagerduty`）
- Slack + Netdata 同步：`scripts/sync-hetzner-slack-alert-webhooks.ps1`
- Grafana Unified Alerting → Slack（聯絡點 + 根政策）：`scripts/sync-hetzner-grafana-alerting-slack.ps1`（說明：`lobster-factory/infra/hetzner-phase1-core/observability/grafana/ALERTING-PROVISIONING.md`）
- PagerDuty routing key 同步：`scripts/sync-hetzner-pagerduty-endpoint-alert.ps1`
- Log stack（可選）：`lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml` + `observability/`  
  - **為什麼留、何時加碼**：見 **[`OBSERVABILITY_STACK_STANCE.md`](OBSERVABILITY_STACK_STANCE.md)**（預設立場：break-glass 日誌、凍結指標擴張）。

---

## P1 — Alert Aggregator / On-call（先做）

### 建議架構

| 來源 | 進 Aggregator 的方式 | 備註 |
|:---|:---|:---|
| **對外 URL（endpoint-alert）** | PagerDuty **Events API v2**（routing key）+ 既有 Slack | 本 repo 已支援 **fail / recover** 各送 **trigger / resolve**（`dedup_key` 固定 per-host） |
| **Netdata** | PagerDuty **Email 整合**、**Events API**（自寫 webhook）、或 **Slack → PD** | 正本仍用 `health_alarm_notify.conf`；進 PD 見 [Netdata 通知文件](https://learn.netdata.cloud/docs/alerts-&-notifications/notifications) |
| **Sentry** | Sentry Project **PagerDuty / Opsgenie** 原生整合 | 維持 [`SENTRY_ALERT_POLICY.md`](SENTRY_ALERT_POLICY.md) 分級；嚴重錯誤才升級叫醒 |

**低成本替代**：不開 PD，維持 **Slack `#infra-alerts` + 人工輪值表**；缺點是 **ack / 去重 / 升級** 需紀律或自寫 glue。

### A. PagerDuty：endpoint-alert 接線（本機 → VPS）

1. 在 PagerDuty 建立 **Service**，新增整合 **Events API v2**，複製 **Integration Key**（即 routing key）。
2. 在本機 vault 寫入（**不要**貼到聊天或 git）：
   - 鍵名建議：`PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT`  
   - 寫入：`powershell -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action set-prompt -Name PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT`
3. 將 **更新後的** `awarewave-endpoint-alert.service` 部署到 VPS（若尚未含第二個 `EnvironmentFile=-` 行）：
   - `sudo install -m 0644 awarewave-endpoint-alert.service /etc/systemd/system/awarewave-endpoint-alert.service`
   - `sudo systemctl daemon-reload`
4. 從 monorepo 根執行：`powershell -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-pagerduty-endpoint-alert.ps1`  
   - 會寫入 **`/etc/default/awarewave-endpoint-alert.pagerduty`**（與 Slack 用的 `awarewave-endpoint-alert` **分檔**，避免 Slack 同步覆寫 PD key）。
5. 啟用 timer：`sudo systemctl enable --now awarewave-endpoint-alert.timer`
6. 驗證：暫時把 `CHECK_URLS` 其中一個改成必敗 URL（**僅測試**）或等真實故障；PD 應出現 **incident**，恢復後應 **resolve**。

**可選**：覆寫 dedup key（多機共用同一 PD service 時避免互撞）—在 `.pagerduty` 檔加 `PAGERDUTY_DEDUP_KEY="awarewave-endpoint-unique-id"`。

### B. Sentry → PagerDuty

在 Sentry：**Settings → Integrations → PagerDuty**（或 **Alert Rules → 新增 action**），綁到與 Netdata **同一 PD service** 或 **不同 escalation policy**（建議：Sentry = application；endpoint = edge）。

### C. Netdata → PagerDuty（擇一）

- **最快**：維持 Slack，PD 用 **Slack 整合** 把 `#infra-alerts` 關鍵訊息轉成 PD（規則需細調以免噪音）。
- **較乾淨**：Netdata `custom_sender` 或 webhook 模板直送 **Events API**（實作留在後續 PR；本檔先列為 backlog）。

---

## P1 — 外部多地探測（與 Aggregator 同級）

**目標**：至少 **兩個地理區域** 的探測點，避免「單一 VPS / 單一網路視角」誤判。

1. 選擇 **Better Stack** 或 **UptimeRobot**（或其他支援多 PoP 的服務）。
2. 監控與現有 `endpoint-alert.sh` **同一組 URL**（單一真相來源）：
   - `https://uptime.aware-wave.com/dashboard`
   - `https://app.aware-wave.com/`
   - `https://api.aware-wave.com/health`
   - `https://n8n.aware-wave.com/healthz`
3. **告警路由**：外部探測的「全紅」→ **PD Sev1**；單區紅、其他區綠 → **先 Slack / 低嚴重度**（避免 CDN 單邊誤報）。
4. 在 `WORKLOG.md` 記一次「外部探測已上線 + 區域清單」（不含帳密）。

---

## P2 — Log aggregation（Loki + Promtail + Grafana）

### 何時做

主機上已用 **Docker + 系統 Nginx**；當排障需要 **跨容器對時間** 時再上本 stack。

### 部署步驟（VPS）

```bash
cd lobster-factory/infra/hetzner-phase1-core
cp observability/env.observability.example observability/.env.observability
# 編輯：GRAFANA_ADMIN_PASSWORD、OBSERVABILITY_HOST_LABEL
docker compose --env-file observability/.env.observability -f docker-compose.observability.yml up -d
docker compose -f docker-compose.observability.yml ps
```

- **Grafana**：`http://127.0.0.1:3009`（僅本機；遠端用 **SSH tunnel**）。
- **Loki**：`http://127.0.0.1:3100`（同樣建議只本機）。
- **Promtail**：預設只送 **Nginx access/error** 與 **`/var/log/syslog`**（避免一次把全部 Docker 容器日誌回溯進 Loki，觸發 **429 / entry too far behind**）。若需 **Docker 日誌**，請先讀 repo 內 `observability/promtail-config.yml` 註解，並同步調高 Loki **`ingester.max_chunk_age`**／接受短暫大量 discard 後再掛回 **`docker.sock`** 與 **`/var/lib/docker/containers`**（見 `docker-compose.observability.yml` 歷史註解與本檔 P2 小節）。

若 **`/var/log/syslog`** 不存在（部分發行版），請自 `promtail-config.yml` 移除對應 `scrape_configs` 區塊後再 `compose up`。

**Grafana 管理密碼**：首次部署由 **`lobster-factory/infra/hetzner-phase1-core/scripts/deploy-observability-vps.sh`** 寫入 **`/root/lobster-phase1/observability/.env.observability`**（`chmod 600`）；請 **SSH 上主機** 檢視或改密碼，**不要**貼到聊天室。

---

## P2 — SLO / 錯誤預算儀表（週報 + 少量即時）

1. **先選 1～2 個 SLO**：例如公開 API **可用率**（非 5xx）、**p95 延遲**（來源：Cloudflare Analytics、Nginx access log、或 APM）。
2. **週報**：Grafana dashboard 截圖或 **n8n** 週排程 post 到 Slack（低頻、可讀）。
3. **即時**：只綁 **burn rate**（短窗口錯誤率異常），避免與 Netdata / endpoint-alert **重複叫醒**。

---

## 驗收清單（建議順序）

1. [ ] PD：endpoint 人為製造一次 fail → **trigger**；恢復 → **resolve**。
2. [ ] PD：Sentry 測試 issue 觸發規則 → PD 收到（嚴重度符合 `SENTRY_ALERT_POLICY`）。
3. [ ] 外部探測：兩區以上、與內部探測對齊 URL。
4. [ ] Loki：Grafana Explore 可查 **nginx access** 與 **任选一容器** log。
5. [ ] SLO：週報第一次發出（日期與連結寫入 `WORKLOG.md`）。

---

## Vault 鍵名（建議）

| 鍵名 | 用途 |
|:---|:---|
| `AGENCY_OS_SLACK_WEBHOOK_URL` | Slack incoming webhook（已由 `sync-hetzner-slack-alert-webhooks.ps1` 使用） |
| `PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT` | endpoint-alert → PD Events API v2 |

**不要**把 PD routing key 或 Slack webhook 寫進 git 或聊天；輪替後只更新 vault 再跑同步腳本。
