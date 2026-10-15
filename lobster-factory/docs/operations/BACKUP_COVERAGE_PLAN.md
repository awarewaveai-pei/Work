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
| cognitive-os-api 的 `.runtime`（volume `cognitive-os-files-aw01`：source-cas、artifact-cas、workflow journal；資料庫列指向這些檔，`ai_lego/apps/api/main.py:544,571`） | 無 | ❌ 沒備份 |
| supabase-db 的 `pgsodium_root.key`（volume `supabase_db-config`；`vault.secrets` 60 筆靠它解密，compose `infra/supabase/docker-compose.yml:603`） | 無（只有 runbook 手動範例 `SUPABASE_SELF_HOSTED_RUNBOOK.md:420`） | ❌ 沒備份：還原後 60 筆密鑰解不開 |
| supabase-storage 的檔（bind `/root/supabase/volumes/storage`，目前 0 檔） | `backup-eu-stack.sh:145` 打包的是 volume `supabase_storage-data`（空的，不是服務在用的路徑） | ❌ 來源錯 |
| trigger-clickhouse、各 redis、loki／grafana、buildkit、registry | 無 | 不備份，理由寫在清單 |

R2 保存規則（2026-10-14 讀 `GET /r2/buckets/lobster-backup/lifecycle`）：`eu/`、`ks-aw-01/`、`sg/`、`sg-stack/` 30 天刪；`ks-aw-01/` 另有 14 天防刪鎖。

檢查：`scripts/check-backup-health.ps1:233-245` 寫死三條管線，只讀 verify 結論行；只在 AO-RESUME 跑。

## 卡片

### B1 資料庫總清單 ✅ 2026-10-14
- `lobster-factory/infra/hetzner-phase1-core/scripts/backup-inventory.json`（隨 sync-host-scripts.sh 到主機）：每個寫入型 mount 屬於一個 store（管線、每天應有的檔、打包來源 `sources`）或列在 `not_backed_up` 並寫理由。
- 驗收：主機 `docker ps`＋`docker volume ls` 的每個有資料的容器都在清單上（B2 會機械比對）。

### B2 每日檢查讀清單 ✅ 2026-10-14（主機首次正式跑 PASS 20 列）
- `backup-coverage-check.py` 在主機上跑（`backup-coverage.cron`，03:30 UTC，全部 verify 之後），寫 `/var/lib/awarewave/backup-coverage.json`。`check-backup-health.ps1` 在三條管線的 verify 檢查之外加讀這份（管線有沒有跑 vs. 有資料的東西是不是都在某條管線裡），AO-RESUME 照舊顯示；B6 也讀同一份。
- 正在跑的有狀態容器不在清單上 → FAIL。
- 驗收：上線當天 cognitive、hci、chatwoot 三項顯示 FAIL（真實狀態）；拿掉某一項的 R2 檔 → 該項 FAIL。

### B3 cognitive（資料庫＋`.runtime` 檔）、hci 接 R2 ✅ 2026-10-14
- 用同一支 `upload-to-r2.sh`，前綴 `cognitive/`、`hci/`。cognitive 本機與 R2 都保存 5 天（`backup-cognitive-db.sh:6`：刪除的資料在備份裡最多留 7 天；R2 到期後可能晚一天才刪），同一次 dump 只送一次，不可加防刪鎖（B2 讀 `/lock` 檢查）。資料庫和 `.runtime` 同一次快照；hci 只送有 `.complete` 的快照。
- R2 lifecycle 規則寫進清單，B2 每天比對（被改掉＝FAIL）。
- 驗收：B2 這幾項 PASS。

### B4 Chatwoot、pgsodium key、supabase-files ✅ 2026-10-14
- `pgsodium_root.key` 放進 `backup-eu-stack.sh` 的加密包 `env.tar.gz.enc`（不能明文出主機，`.members` 列出成員）；`supabase-storage.tgz` 改為 `supabase-files.tgz`，打包 `/root/supabase/volumes/{storage,functions,snippets}`（2026-10-14 查過裡面沒有明文密鑰）。ks-aw-01 的加密包同樣寫 `.members`。
- 主機 `/etc/default/ks-aw-01-backup`：`EXPECT_SERVICES=soulful chatwoot`、`CHATWOOT_DB_CONTAINER=chatwoot-postgres`。repo 三處一起改對：預設容器名（`backup-ks-aw-01.sh:125,127`、`README.md:33`）與資料庫名（`:127` dump `chatwoot`，實際是 `chatwoot_production`，使用者 `chatwoot`）。
- 驗收：隔天 R2 `ks-aw-01/<STAMP>/` 有 chatwoot 的 dump；B2 PASS。

### B5 成功才回報，沒回報就通知 ✅ 2026-10-14（endpoint-alert 乾跑抓到過期戳記）
- 用既有的 dead-man 機制（`hetzner-phase1-core/scripts/endpoint-alert.sh` 的 `/etc/awarewave-alert/fresh.d/`，wp-cron-runner 已在用）：B2 全部 PASS 才 touch 戳記；FAIL 把戳記時間設回 0 → endpoint-alert 下一分鐘照它既有的防抖與 Telegram／Slack 發出；endpoint-alert 本身由 Uptime Kuma heartbeat 盯著。不另開 Kuma 監控。
- 邊界：Kuma 在同一台主機，主機整台掛掉時這條也會沉默；那由外部可達性監控負責，不在本卡。
- 驗收：戳記設回 0 → 收到 Telegram。

### B6 `/ops` 資料庫與備份頁 ✅ 2026-10-14（auto-deploy 15:05 上線，`/ops/backup` 未登入 307→login；容器內 `/host-status` 讀得到；登入後畫面由 vitest renderToStaticMarkup 驗，未人工看過）
- 讀 B2 的狀態 JSON：每個庫一列，最近備份時間、大小、R2 有沒有、PASS／FAIL。只讀，不在頁面上觸發備份。
- 驗收：頁面列數＝清單列數；B2 的 FAIL 在頁面上是紅的。

### B7 每月還原演練 ✅ 2026-10-15（上線；首次全 8 庫從 R2 演練 PASS，狀態檔＋B2 `restore-drill` 列 PASS）
- `hetzner-phase1-core/scripts/backup-restore-drill.py`（每月 1 日 04:15，`backup-coverage.cron`）：清單裡有 `drill` 的庫，從 R2 下載最新備份（分割檔重組後比對 sha256），灌進與 prod 同 image 的一次性容器（不接網路、限記憶體），判定規則在檔頭。結果 `/var/lib/awarewave/restore-drill.json`；B2 加 `restore-drill` 列（>35 天、任一庫 FAIL、漏庫 → FAIL）。
- 比「關鍵表筆數」更嚴：dump 裡每個 COPY 區塊的筆數＝還原後筆數（筆數來自 dump 本身，不用另存標記；做法來自 `hci30-restore-drill.yml`）。
- 首跑抓到 5 個還原會失敗或資料沒備到的地方（都已修，runbook §4/§6 同步）：Supabase 設定 volume 只放鑰匙 → DB 起不來；先跑 image 初始化再灌 → 6 張 auth/cron 表 0 筆；`postgres` 庫的 owner／grant 沒進 dump（fixup 補、演練比對 prod）；HCI dump GRANT 給 dump 外的角色（加 `hci-roles.sql.gz`）；一鍵架站的 staging 庫（`wp_s_*`）沒備份（`backup-phase1.sh` 改 `--databases`）。
- 驗收：演練報告每個庫一列；故意給一份壞檔 → 該列 FAIL。

### B8 跨產品客戶編號對帳 ✅ 2026-10-15（上線；首跑抓到兩個真問題，見下）
- 首跑結果：`ids:postiz-integrations` 原本 FAIL「POSTIZ_API_BASE_URL env var not set」＝ next-admin compose 從沒把 `.env` 的 `POSTIZ_API_*` 傳進容器（所有 next-admin 的 Postiz 呼叫都會丟錯），已補，3／3 PASS。`ids:cognitive-os-projects` FAIL 19／19：Cognitive OS 只剩 2 個專案，主庫指到的專案都不在 `platform_projects`；`lib/cognitive-os/import-sources.ts:178` 存過的 id 永遠直接用、不查還在不在。修法（程式自癒＋18 筆來源怎麼處理）待決，見 TASKS。
- 先列出各產品存了哪些「指向主庫客戶」的編號。對帳走各產品的 API 或匯出，不得跨庫直讀（HCI ADR-0002）。
- 驗收：每天一次；故意放一個不存在的編號 → 報警。
- 做法：next-admin `lib/reconcile/pointers.ts` 每種指標一塊（我們存的 id ↔ 對方 API 列出的 id），`GET /api/internal/reconcile`（自己的 `RECONCILE_TOKEN`）；B2 每天呼叫，每塊一列，掛不到對方或有懸空 id ＝ FAIL。
- 2026-10-15 盤點 30 種跨產品指標（主庫→他產品 23、他產品→主庫 7），第一版查有寫入程式又有列表 API 的兩塊：
  - `postiz-integrations`：`social_accounts.postiz_integration_id`（social manager C4 起；之前是 0011 的 `social_postiz_connections`，prod 3 筆）↔ Postiz `GET /public/v1/integrations`。
  - `cognitive-os-projects`：`organizations.metadata.cognitive_os_import_project_id`（1）、`cs_knowledge_sources`（18）、`cs_knowledge_folders`（0）的 `cognitive_os_project_id` ↔ Cognitive OS `GET /projects`。還原後兩邊 dump 時間不同（02:17／02:30），中間建的專案會懸空。
- 不查，理由：Chatwoot `accountId`（2 筆；vault 只有 AgentBot token，Chatwoot 只准它呼叫對話端點，讀不到帳號；要管理員 token 才能查）；HCI `hci_source_id`（HCI 沒有列表 API，`/seeds` 只回 DISCOVERED）；`external_tenant_id`、Clerk、FluentCRM、`postiz_workspace_id`、`cs_customer_memory.contact_ref`（沒有程式寫入）；Sentry／PostHog／GitHub／Supabase Cloud／Stripe／Woo／Trigger run id（外部 SaaS 或事件紀錄，不是會被我們還原的資料）；MainWP site id 只在 repo 檔，不在主庫。

### B9 verify 腳本查 R2 清單也要重試 ✅ 2026-10-14（改為刪掉重複，R2 只由 B2 查）
- `eu-backup/verify-backup-eu.sh:91`、`hetzner-phase1-core/scripts/verify-backup.sh:130` 查 R2 清單只試一次，Cloudflare 一次失敗＝誤報 FAILED（`ks-aw-01-backup/verify-backup-ks-aw-01.sh` 不查 R2）。若 B2 已涵蓋 R2 檢查，這張卡改為刪掉 verify 裡重複的 R2 檢查，只留一處。

### B10 上傳測試進 CI ✅ 2026-10-14（`.github/workflows/backup-scripts.yml`，含真實清單的一致性測試）
- `lobster-factory/infra/eu-backup/upload-to-r2.test.sh` 放進 `.github/workflows/shared-asset-gates.yml`（ubuntu runner，不需要 docker）。

### B11 cognitive 備份 log 是空的 ✅ 2026-10-14（不用改：`backup-cognitive-db.sh:21-23,133` 只在失敗與警告時寫 stderr，空 log＝沒失敗；新鮮度由 B2 管）
- `/var/log/cognitive-db-backup.log` 從 2026-10-10 起 0 bytes，但備份檔每天有產生。查原因，讓失敗時看得到。

## 順序

B1 → B2（先讓缺口全部看得見）→ B4、B3（補洞）→ B5 → B6 → B7 → B8。B9–B11 隨時可做。剩 B8。
