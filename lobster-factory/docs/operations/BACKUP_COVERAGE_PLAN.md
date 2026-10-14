# 備份涵蓋計畫：每個資料庫都有離機備份、每天被檢查、能還原

- **建立**：2026-10-14。調查：WORKLOG 2026-10-14（續11）；R2 重試上線（續16）。
- **不變量**：主機上每個存放真實資料的服務，都在清單上；清單上每一項，每天都有一份送到 R2 的備份，而且有人檢查；新增服務沒進清單＝檢查變紅。
- **High-STOP**：凡是改主機（cron、`/etc/default/*`、腳本安裝）都要操作者「上線」。只改 repo、只讀主機的部分直接做。
- **完成**：B1–B11 全打勾，且 `backup-health-LATEST.md` 每一項 PASS。

## 現況（2026-10-14 實查）

| 服務 | 備份腳本 | 離機（R2） |
|---|---|---|
| supabase-db（主庫＋n8n＋postiz） | `eu-backup/backup-eu-stack.sh:42` | ✅ `eu/` |
| trigger-postgres、mainwp-db、n8n／storage／minio／postiz／mainwp-files 卷 | `backup-eu-stack.sh` §2–3d | ✅ `eu/` |
| soulful-db＋網站檔 | `ks-aw-01-backup/backup-ks-aw-01.sh` | ✅ `ks-aw-01/`（14 天防刪鎖） |
| lobster-wordpress-db | `hetzner-phase1-core/scripts/backup-phase1.sh` | ✅ `sg-stack/` |
| cognitive-db | `Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh`（cron `ks-stack-backup` 02:17） | ❌ 只在主機 `/root/backups/cognitive-db` |
| hci-postgres | `Projects/internal/hci30/scripts/backup-hci-postgres-prod.sh`（cron `hci-postgres-backup`） | ❌ 只在主機 `/root/backups-hci-postgres` |
| chatwoot-postgres | 腳本支援（`backup-ks-aw-01.sh:124-125`），但主機 `EXPECT_SERVICES=soulful`，且預設容器名 `chatwoot-db` ≠ 實際 `chatwoot-postgres` | ❌ **完全沒備份**（目前 3 則測試對話，最後 2026-09-11） |
| trigger-clickhouse、各 redis | 無 | B1 判定要不要 |

檢查：`scripts/check-backup-health.ps1:233-245` 寫死三條管線，只讀 verify 結論行；只在 AO-RESUME 跑。

## 卡片

### B1 資料庫總清單（Opus 5.5）
- 一個機器可讀的檔（`lobster-factory/infra/backup-inventory.json`）：每個有狀態的容器／卷一列：負責的腳本、排程、本機目錄、R2 前綴、每天應有的檔名、保留天數；不備份的（快取類 redis）寫明理由。
- 驗收：主機 `docker ps`＋`docker volume ls` 的每個有資料的容器都在清單上（B2 會機械比對）。

### B2 每日檢查讀清單（Opus 5.5）
- 檢查改在主機上跑（cron，03:30 UTC，全部 verify 之後），對清單每一項查：今天的檔在本機、R2 上有（大檔看 `.parts.json`）、不超過 26 小時；寫一份狀態 JSON。`check-backup-health.ps1` 改讀這份 JSON（不再寫死三條管線），AO-RESUME 照舊顯示；B6 也讀同一份。
- 正在跑的有狀態容器不在清單上 → FAIL。
- 驗收：上線當天 cognitive、hci、chatwoot 三項顯示 FAIL（真實狀態）；拿掉某一項的 R2 檔 → 該項 FAIL。

### B3 cognitive、hci 接 R2（Opus 5.5；High）
- 用同一支 `upload-to-r2.sh`，各自一個前綴。cognitive 的保留期 R2 也不得超過 7 天（`backup-cognitive-db.sh:6`：刪除的資料在備份裡最多留 7 天），不可用 14 天防刪鎖。
- 驗收：B2 這兩項 PASS。

### B4 Chatwoot 開始備份（Sonnet 5.5；High）
- 主機 `/etc/default/ks-aw-01-backup`：`EXPECT_SERVICES=soulful chatwoot`、`CHATWOOT_DB_CONTAINER=chatwoot-postgres`。repo 三處一起改對：預設容器名（`backup-ks-aw-01.sh:125,127`、`README.md:33`）與資料庫名（`:127` dump `chatwoot`，實際是 `chatwoot_production`，使用者 `chatwoot`）。
- 驗收：隔天 R2 `ks-aw-01/<STAMP>/` 有 chatwoot 的 dump；B2 PASS。

### B5 成功才回報，沒回報就通知（Opus 5.5；High）
- B2 全部 PASS 時打一次 Uptime Kuma push；Kuma 的 push 監控 26 小時沒收到 → Telegram。
- 邊界：Kuma 在同一台主機，主機整台掛掉時這條也會沉默；那由外部可達性監控負責，不在本卡。
- 驗收：停一天回報 → 收到 Telegram。

### B6 `/ops` 資料庫與備份頁（Sonnet 5.5；High＝sg-deploy）
- 讀 B2 的狀態 JSON：每個庫一列，最近備份時間、大小、R2 有沒有、PASS／FAIL。只讀，不在頁面上觸發備份。
- 驗收：頁面列數＝清單列數；B2 的 FAIL 在頁面上是紅的。

### B7 每月還原演練（Opus 5.5）
- 每月從 R2 取每個庫最新的備份，還原到一次性容器（不碰正式容器），跑幾個關鍵表的筆數查詢，結果寫進 B2 的狀態 JSON。參考既有 `.github/workflows/hci30-restore-drill.yml` 的做法。
- 驗收：演練報告每個庫一列；故意給一份壞檔 → 該列 FAIL。

### B8 跨產品客戶編號對帳（Opus 5.5）
- 先列出各產品存了哪些「指向主庫客戶」的編號。對帳走各產品的 API 或匯出，不得跨庫直讀（HCI ADR-0002）。
- 驗收：每天一次；故意放一個不存在的編號 → 報警。

### B9 verify 腳本查 R2 清單也要重試（Sonnet 5.5）
- `eu-backup/verify-backup-eu.sh:91`、`hetzner-phase1-core/scripts/verify-backup.sh:130` 查 R2 清單只試一次，Cloudflare 一次失敗＝誤報 FAILED（`ks-aw-01-backup/verify-backup-ks-aw-01.sh` 不查 R2）。若 B2 已涵蓋 R2 檢查，這張卡改為刪掉 verify 裡重複的 R2 檢查，只留一處。

### B10 上傳測試進 CI（Sonnet 5.5）
- `lobster-factory/infra/eu-backup/upload-to-r2.test.sh` 放進 `.github/workflows/shared-asset-gates.yml`（ubuntu runner，不需要 docker）。

### B11 cognitive 備份 log 是空的（Sonnet 5.5）
- `/var/log/cognitive-db-backup.log` 從 2026-10-10 起 0 bytes，但備份檔每天有產生。查原因，讓失敗時看得到。

## 順序

B1 → B2（先讓缺口全部看得見）→ B4、B3（補洞）→ B5 → B6 → B7 → B8。B9–B11 隨時可做。
