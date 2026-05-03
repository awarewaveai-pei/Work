# Observability — soulfulexpression.org (Hostinger)

**Owner:** `sites/soulfulexpression-org/`（本檔為 Soulful Expression 正式站之觀測 SOP）  
**Production URL:** https://soulfulexpression.org/

## 採用模式：完整交包給客戶（與代管團隊分離）

**目標：** 監控與告警所屬的 **帳號、帳單、管理員** 皆為 **客戶（Soulful Expression）**，顧問方僅在移交期協助建立與驗收，**不**與 AwareWave 內部 Slack／Sentry／Uptime 實例混用（除非合約明定「代管代操」再另述）。

| 服務 | 交包做法 | 客戶端需備 |
|------|----------|------------|
| **Slack** | 使用 **客戶自己的** Slack workspace（或客戶公司既有 workspace）。在內部建立 **告警專用頻道**（例 `#soulfulexpression-ops`），由客戶管理員建立 **Incoming Webhook** 或 Slack App。 | 具 workspace 管理權之帳號；決定誰收告警。 |
| **Sentry** | 由客戶以 **公司 Email** 註冊 [sentry.io](https://sentry.io)，自建 **Organization**（組織名建議含客戶商號），其下建立 **Project**（PHP／WordPress）。**Billing owner = 客戶**。顧問如需協助除錯，由客戶在 org 內 **邀請** 為 Member（權限由客戶決定，移交後可撤銷）。 | 信用卡／帳單歸屬、DSN 由客戶保存；WP 後台貼 DSN 時由客戶或授權人操作。 |
| **Uptime 檢測** | 由客戶在 **自選服務** 建立帳號並建立檢測，**不**綁在顧問的 Uptime Kuma 上。常見選項： [UptimeRobot](https://uptimerobot.com)、[Better Stack](https://betterstack.com)、或客戶自架 [Uptime Kuma](https://github.com/louislam/uptime-kuma)（自有 VPS／Docker）。 | 檢測目標 URL：`https://soulfulexpression.org/` + 建議 **SSL 到期** 提醒。 |
| **Netdata** | **Hostinger 一般共享主機仍無法安裝** Netdata agent。若日後遷至 **客戶自有 VPS**，由客戶在 [Netdata Cloud](https://app.netdata.cloud) 建帳、在該主機安裝 agent 並連回客戶空間。 | 僅在具 root／主機權限時有意義；否則以 hPanel 內建監控 + 上列 Uptime 為主。 |

**移交清單（建議一頁交給客戶存證，不含密文）：**

- [ ] Slack：workspace 名稱、頻道名稱、哪一角色負責收 webhook／app 金鑰（金鑰本身只放客戶密碼庫）。
- [ ] Sentry：org 名稱、project 名稱、哪一支 Email 為 owner、顧問是否僅邀請權限。
- [ ] Uptime：服務商名稱、monitor 顯示名稱、檢查週期、是否已測過 down 告警到 Slack。
- [ ] WordPress：Sentry 外掛已啟用且 DSN 指向 **客戶** Sentry project（由客戶在後台自貼或當面完成）。
- [ ] 顧問側：合約到期後從客戶 Sentry／Slack 撤銷 guest，**不**保留客戶 DSN 於本 repo（`mcp/user-env` 僅在代維期可暫放，交包即刪）。

**與本檔以下小節的關係：** 第 1～3 節的步驟可照做，但所有「建立 org／webhook／monitor」的 **主體改為客戶帳號**；文中若出現「既有實例（aware-wave）」僅供 **代管模式** 對照，交包時請忽略。

---

## 範圍與限制

| 工具 | 在此站是否適用 | 說明 |
|------|----------------|------|
| **Uptime（Kuma 或其他）** | 是 | 對外 HTTP/HTTPS 檢查不依賴 Hostinger 安裝程式。**交包：** 客戶自選 SaaS 或自架 UK。**代管：** 可用顧問既有 UK 實例僅加一支 monitor。 |
| **Sentry** | 是 | WordPress 外掛／PHP SDK；DSN 在 WP 後台。**交包：** 客戶 org／project。**不入庫**。 |
| **Slack** | 是 | **交包：** 客戶 workspace + 專用頻道 + webhook。**代管：** 顧問 workspace 內另開頻道。 |
| **Netdata** | 通常否（共享主機） | Netdata agent 需 OS 層安裝；**Hostinger 一般共享託管無法安裝**。主機層請 hPanel 或遷 VPS 後由客戶 Netdata Cloud 管理。 |

## 1. Slack：Soulful Expression 專用頻道（交包＝客戶 workspace 內）

1. 登入 **客戶的** Slack workspace（交包模式不要用顧問 workspace）。
2. **建立頻道**（例：`#soulful-expression-alerts`），邀請需接收告警的成員。
3. **Incoming Webhook**：[Slack API → Incoming Webhooks](https://api.slack.com/messaging/webhooks) → 選 **客戶** workspace → 選上述頻道 → 取得 **Webhook URL**。URL 由 **客戶** 存入其密碼庫；顧問協助設定 Uptime／Sentry 當天可暫存，**交包後顧問側應刪除**。
4. （選）Slack App 版 Incoming Webhooks：同上，綁定客戶頻道。

## 2. Uptime：監看正式站

**交包（推薦）：** 在客戶選定的服務 **客戶帳號** 內操作（UptimeRobot／Better Stack／自架 Uptime Kuma 等）。

- **URL：** `https://soulfulexpression.org/`
- **類型：** HTTPS；啟用 **SSL／憑證到期** 提醒（若服務支援）。
- **通知：** 指向第 1 節客戶 Slack Webhook 或該服務原生的 Slack／Email 整合。
- **驗證：** 故意改錯 URL 或暫停檢測，確認客戶 Slack 收到告警。

**代管（非交包）：** 仅在顧問既有 Uptime Kuma（例如 `uptime.aware-wave.com`）**新增一支 Monitor**，仍建議日後遷到客戶帳號以便完全交包。

## 3. Sentry：WordPress（Hostinger）

**交包：** 全程使用 **客戶註冊的 Sentry Organization**（billing 歸客戶）。

1. 客戶至 [sentry.io](https://sentry.io) 註冊並建立 **Organization** → **Project**（PHP 或 WordPress）。
2. 複製 **DSN** → 由客戶保存；在 WP **後台**安裝 Sentry 官方外掛並貼上 DSN（建議由客戶管理員操作，或當場協助一次）。
3. **Slack：** 在該 Project → **Settings → Integrations → Slack** → 連結 **客戶** workspace → 選告警頻道。
4. **Smoke：** 觸發一次受控測試錯誤，確認 Sentry 與客戶 Slack 皆收到。
5. **與龍蝦／AwareWave 契約：** `SENTRY_ALERT_POLICY.md` 中的 `SENTRY_DSN_WORDPRESS` 指 **平台主站**；本客戶專案 **完全不共用** 該 DSN。

**代管：** 若暫放在顧問 Sentry org 內的獨立 project，須在合約載明，並規劃遷移至客戶 org 的時程。

## 4. Netdata：此站可做的替代方案

- **不在 Hostinger 共享站安裝 agent**（除非原廠明確允許且你有 root／容器權限——多數共享方案沒有）。
- **交包後若客戶自有 VPS：** 由客戶在 [Netdata Cloud](https://app.netdata.cloud) 建空間、在伺服器安裝 agent、告警接到 **客戶** Slack。
- **替代（共享主機期間）：**  
  - 對外健康：**客戶帳號下的 Uptime**；  
  - 應用錯誤：**客戶 Sentry**；  
  - hPanel 內建資源／快取狀態由客戶自行查看。

## 5. SSH（Hostinger）用途邊界

若有 hPanel 核准的 SSH（僅限該主機允許的指令與路徑），可用於部署檔案、WP-CLI、除錯日誌；**不等於**能安裝 Netdata 全系統 agent。具體以 Hostinger 方案條款為準。

## 6. 憑證存放（強制）

- **交包後：** Webhook、Sentry DSN、各監控服務 API Key、WP 憑證 **全部由客戶保管**；顧問 repo **不得**長期存放客戶 DSN。協助期若曾寫入 `user-env.ps1`／vault，**移交完成即刪除**。
- **禁止**寫入 `WORKLOG`、`memory`、追蹤之 markdown 或提交到 git。

## Related

- 全站 Sentry 契約：`agency-os/docs/operations/SENTRY_ALERT_POLICY.md`
- 觀測基線說明：`agency-os/docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md`
- 站點摘要：`SITE_PROFILE.md`
