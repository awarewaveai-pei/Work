# 觀測第一次設定（繁中逐步）：PagerDuty、外部探測、Grafana Tunnel、n8n 週報

本檔給 **完全照做** 用；**不要**把 webhook、routing key、密碼貼到聊天或 git。  
技術正本仍見 [`OBSERVABILITY_P1_P2_ROLLOUT.md`](OBSERVABILITY_P1_P2_ROLLOUT.md)。

---

## 0. 本機開 Grafana（SSH tunnel）

VPS 上 Grafana 只綁 **`127.0.0.1:3009`**。你瀏覽器打的 **`http://127.0.0.1:3009`** 是「**你自己電腦**」的埠，**不會**自動連到 VPS；必須先跑 SSH **本地轉發**，否則瀏覽器會顯示 **`ERR_CONNECTION_REFUSED`**（本機沒人在聽 3009）。

**正確順序**：① 開 tunnel（終端機保持開著，或用 `-Background`）→ ② 再開瀏覽器。

1. 確認 `~/.ssh/config`（Windows：`C:\Users\<你>\.ssh\config`）裡有 **`Host hetzner`**（或你慣用的別名），且 `ssh hetzner` 能登入。
2. 在 monorepo **根目錄** PowerShell 執行（**先執行這個，再開網頁**）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\open-grafana-ssh-tunnel.ps1
```

3. 看到終端機掛著（foreground 時 **沒有新輸出是正常的**，代表 tunnel 在跑）後，瀏覽器再開：**`http://127.0.0.1:3009/`**  
4. 進 Grafana 後：**Home** 應直接是 **AwareWave 觀測首頁**（導覽 + Nginx / Syslog 日誌）。若仍是空白 Welcome 頁、或 **Browse → AwareWave** 沒有儀表板，代表 VPS 尚未同步 compose／儀表板檔；在 monorepo 根執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-observability-grafana-content.ps1
```

5. 若要背景跑（可關掉這個 PowerShell 視窗），改用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\open-grafana-ssh-tunnel.ps1 -Background
```

腳本會簡單探測本機埠是否已開始接受連線。

6. 帳號 **`admin`**；密碼在 VPS（**只在那裡**，不要貼聊天）：

```bash
ssh hetzner "sudo grep GRAFANA_ADMIN_PASSWORD /root/lobster-phase1/observability/.env.observability"
```

7. 用完：foreground 模式在該終端機 **Ctrl+C**；background 模式用工作管理員結束對應 **ssh** 或 `Get-Process ssh | Stop-Process`（會關掉所有 ssh，請謹慎）。

### 0.1 Grafana 會怎麼通知你（已自動佈建 Slack）

在 vault 已有 **`AGENCY_OS_SLACK_WEBHOOK_URL`** 的前提下，於 monorepo 根執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-grafana-alerting-slack.ps1
```

會在 VPS 寫入 **Unified Alerting** 的 **Slack Contact point**（`infra-alerts-slack`）並把**根通知政策**指到該 Slack。之後你在 Grafana **Alerting → Alert rules** 新增規則（例如 Loki 查詢），**觸發時就會發 Slack**。

**在 UI 自建一則測試規則（範例）**

1. **Alerting → Alert rules → New alert rule**  
2. 查詢選 **Loki**，LogQL 可先用：`sum(count_over_time({job="nginx"} |~ " 5[0-9][0-9] " [5m])) > 5`（依你 access log 格式微調）  
3. **Configure notifications** 選預設路由（已指到 `infra-alerts-slack`）→ 儲存。

細節見 repo：**`lobster-factory/infra/hetzner-phase1-core/observability/grafana/ALERTING-PROVISIONING.md`**。

---

## 1. PagerDuty（Events API v2）— 取得 routing key → 寫 vault → 同步 VPS

### 1.1 註冊 / 登入

1. 瀏覽器開：**https://www.pagerduty.com/** → **Sign up** 或 **Log in**（可用公司信箱）。
2. 建立 **Free trial** 或付費方案皆可（Events API 一般試用就夠測）。

### 1.2 建立 Service + Integration Key

1. 左側 **Services** → **Service Directory** → **New Service**。
2. **Name**：例如 `aware-wave-endpoints` → **Next**。
3. **Escalation Policy**：選現有或新建一個（決定「誰被叫醒」）。
4. 建立完成後，進該 Service → 分頁 **Integrations** → **Add another integration**。
5. 搜尋或選 **Events API v2** → **Add**。
6. 畫面上會出現 **Integration Key**（一長串英數字，**等同 routing key**）→ **複製**（只存在剪貼簿，不要貼到 Slack 公開頻道）。

### 1.3 寫入本機 vault（Windows）

在 **monorepo 根** PowerShell（會跳出安全輸入框貼上 key）：

```powershell
cd D:\Work
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\secrets-vault.ps1 -Action set-prompt -Name PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT
```

### 1.4 同步到 VPS

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-pagerduty-endpoint-alert.ps1
```

### 1.5 驗證

- 暫時讓某個 `CHECK_URLS` 失敗（僅測試）或等真實故障；PagerDuty 應出現 **Incident**，恢復後應 **Resolve**（與 `endpoint-alert.sh` 行為一致）。

---

## 2. 外部多地探測（擇一：UptimeRobot 或 Better Stack）

目標：**至少兩個地理區域** 對同一組 URL 做 HTTP 檢查。下列 URL 與 `endpoint-alert.sh` 一致。

| 名稱 | URL |
|:---|:---|
| uptime | `https://uptime.aware-wave.com/dashboard` |
| app | `https://app.aware-wave.com/` |
| api | `https://api.aware-wave.com/health` |
| n8n | `https://n8n.aware-wave.com/healthz` |

### 2A. UptimeRobot（較直覺）

1. 開 **https://uptimerobot.com/** → 註冊 / 登入。
2. **Add New Monitor** → Type：**HTTP(s)**。
3. **Friendly Name**：`aware-wave-api-health` → **URL** 貼上表內 `api` 那一列 → **Create Monitor**。
4. 對 **uptime / app / n8n** 各重複新增一個 Monitor（共 4 個）。
5. **Alert Contacts**：新增你的 Email / Slack（若 UptimeRobot 支援連 Slack，依精靈授權）。
6. **Multi-location**（名稱可能為 *Monitoring intervals* / *Pro* 功能）：若免費版只能單區，可先用單區；要 **兩區以上** 通常需升級或改 **Better Stack**。

### 2B. Better Stack（Uptime 品牌）

1. 開 **https://betterstack.com/**（或 **https://uptime.betterstack.com/**）→ 註冊 / 登入。
2. **Monitors** → **Create monitor** → **URL**。
3. 同上表建立 **4 個 monitor**。
4. 在 monitor 設定裡選 **至少兩個檢查區域**（依產品 UI）。
5. **Status page / On-call / Integrations**：接到 Email 或 Slack（依精靈）。

### 2C. 寫回營運紀錄（建議）

在 **`agency-os/WORKLOG.md`** 當日加一行：已上線外部探測、廠商名稱、**區域名稱**（不要寫帳密）。

---

## 3. n8n「SLO 週報」最小草稿（HTTP 探測 + Slack）

1. 在 n8n UI：**Workflows** → **Import from File**。
2. 選 repo 檔：**`lobster-factory/infra/n8n/exports/slo-weekly-slack-probe.json`**。
3. 打開 workflow → 節點 **Set Slack webhook + optional note**：
   - 把 **`slackWebhookUrl`** 改成你的 **`#infra-alerts` Incoming Webhook**（與 vault 同源即可；**不要**提交到 git）。
4. **Activate** workflow。
5. 先按 **Manual Trigger** → **Execute workflow**，確認 Slack 收到週報格式訊息。
6. **Weekly schedule** 節點：預設 **每週一 01:00 UTC**（約台灣週一 09:00）；若要改，在節點裡改 cron 或規則。

詳見同目錄 **`README-SLO-WEEKLY.md`**。

---

## 4. 你卡住時最常見的三件事

1. **SSH tunnel 開了但網頁打不開**：確認本機 `3009` 沒被占用；換 `-LocalPort 3010` 試試。  
2. **PagerDuty 沒響**：vault 鍵名必須是 **`PAGERDUTY_ROUTING_KEY_ENDPOINT_ALERT`**；再跑一次 sync 腳本。  
3. **Slack 沒收到 n8n**：Webhook URL 必須在 **Set** 節點填好；n8n 執行日誌看 **Post Slack** 節點回應是否 `200`。
