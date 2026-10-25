---
# Phase 4 backup monitoring metadata (machine-readable)
status: active
onboarded_at: 2026-05-08
backup_schedule: weekly
backup_destination: googledrive
backup_destination_label: "Update_Backup (WPvivid auth_id wpvivid-auth-ca9352c3bbbf3, MainWP remote_id wpvivid-remote-69ff0a63b77ab)"
# restore_drill_due_after 已於 2026-08-26 退役：那是「推導值」，演練做完沒人回頭改它就變成假警報，
# 被推前又能無聲關掉整條檢查。改記錄演練「事實」，到期日由 phase4-checks.py 自行推算。
restore_drill_interval_days: 90
restore_drills:
  - date: 2026-08-16
    result: PASS
    scope: data-layer
    note: "Drill #1 — EU 拋棄式容器；288 表還原、750 筆附件與磁碟零遺失。未含程式碼，故未驗「站能開起來」"
# last_known_success_utc / last_known_success_task_id 同日移除：它們是 BACKUP_AUTO_STATUS.json 的手抄鏡像，
# 全 repo 無任何消費端，實際已停在 2026-06-08 爛了 70 天。真值一律看下面那份 JSON。
truth_source: ks-aw-01 /var/lib/awarewave/backup-status/company-soulful-expression.json  # repo BACKUP_AUTO_STATUS.json = static config (2026-10-25)
---

# Backup and Restore Proof — Soulful Expression Art Therapy

> 客觀證據；與 `ENVIRONMENT_REGISTRY` 欄位互相對齊更新。
>
> **2026-05-22 治理修訂**：本檔語意收斂為「**人類維護的里程碑**」（baseline backup、restore drills、災難復原演練）。
> 「最近一次自動備份是否成功」這類週級資料由主機 `/var/lib/awarewave/backup-status/company-soulful-expression.json` 承載並在主機判斷（2026-10-25 起；truth source = MainWP DB；失敗即 `/ops/schedules` 列紅＋推播）。
> repo 的 `BACKUP_AUTO_STATUS.json` 只剩靜態設定（mainwp_site_id 等）。詳見 `agency-os/automation/claude-routines/phase4-weekly.md`。

## Backup Record #1 — 2026-05-08（Day 1 基線備份）

| 欄位 | 值 |
|---|---|
| Tenant | Soulful Expression Art Therapy |
| Site | soulfulexpression.org |
| Environment | **production** |
| Backup timestamp | **2026-05-08 08:07 UTC** |
| Backup method | `mysqldump -h 127.0.0.1 ... \| gzip` via Hostinger SSH（`exec()` disabled in PHP, bypassed via direct mysqldump） |
| Backup scope | **DB only**（`u942075013_hDaEZ`，138 MB uncompressed） |
| Compressed size | **15 MB**（`.sql.gz`） |
| Storage location | Local operator machine: `agency-os/tenants/company-soulful-expression/backups/soulful_db_20260508_160734.sql.gz` |
| File SHA-256 | `849db7848992308dd4dd0b7a88c19add60b9b737463a90ba19a93da9566264b1` |
| Retention policy | 本機保留至 staging restore drill 通過後，之後按月備份 |
| Operator | Claude（SSH session 2026-05-08）— verified operator |
| Missing | **uploads**（491 MB）— Day 2 staging 建立時補全站快照；Hostinger 自動備份（panel 內）未驗證還原 |

> **注意**：`uploads/` 未包含於此備份。Day 2 staging 複製時 Hostinger 面板提供「全站複製」功能，可一次包含 DB + files。此備份的用途為：有可下載的 DB dump 作為最低安全底線，可在緊急時從本機匯入還原資料庫。

## Backup Record #2 — 2026-08-15（Hosting 退場前的完整安全網）

> **背景**：操作者 2026-08-15 決定 **Premium Web Hosting 不續約**（$215.76/年）。Hostinger hosting
> **2026-11-12 到期**，網站必須在此之前搬離。Record #1 的 DB dump 已是 3 個月前（2026-05-08），
> 不足以作為搬遷的還原點，故重新製作並**移出 Hostinger**。

| 欄位 | 值 |
|---|---|
| Backup timestamp | **2026-08-15 12:23:53 UTC** |
| Backup method | `mysqldump --single-transaction --quick --default-character-set=utf8mb4 \| gzip -9` via Hostinger SSH；uploads 以 `tar czf -` 串流下載（不在來源端落地大檔） |
| Backup scope | **DB + uploads**（Record #1 只有 DB） |
| DB | `u942075013_hDaEZ`，**288 張表**，解壓後 **107,990,474 bytes**（~103 MB），壓縮後 **15 MB** |
| DB SHA-256 | `d71ce13086ace8d6d386afd2ad4ad8eb64c058b102150d8d5a68c6525d31bd3d` |
| Uploads | **11,001 個項目**，壓縮後 **632 MB** |
| Uploads SHA-256 | `cb4daf29243d334403ec37c663514956c8bd93a696833de379ca26f095d6c79c` |
| Storage（異地） | EU VPS `204.168.175.41:/root/backups/clients/soulful/`（**不在 Hostinger**，主機到期不受影響） |
| Storage（本機） | `/tmp` 暫存，非長期保存位置 |
| Operator | Claude（SSH session 2026-08-15） |

### 完整性驗證（四項，全部實測）

| 檢查 | 結果 |
|---|---|
| `gzip -t` DB | **OK** |
| DB dump 結尾標記 | `-- Dump completed on 2026-08-15 12:23:59` —— mysqldump **僅在成功結束時**寫入此行 |
| DB 表數比對 | dump 內 `CREATE TABLE` **288** == 資料庫 `information_schema` 實際 **288** |
| `tar -tzf` uploads | **OK**（完整讀取整個封存） |
| uploads 檔案數比對 | 封存 **11,001** == 來源 `find \| wc -l` **11,001** |
| 跨三地 SHA-256 | Hostinger / 本機 / EU **三地完全一致**（DB 與 uploads 各自比對） |

### 尚未涵蓋 / 已知限制

- **plugins（619 MB）與 themes（22 MB）未備份** —— 判定為可重新安裝的第三方程式碼，非不可取代資料。搬遷時以乾淨安裝 + 設定還原處理；若要 bit-for-bit 全站快照，搬遷當下另做。
- ~~**未執行還原演練（restore drill）**~~ —— 上述為完整性驗證，非「還原後網站可運作」的證明。**【已解除 2026-08-16】**隔日即以 EU 拋棄式容器完成 Drill #1（PASS），見下方 §Restore Drill Record。此行保留為 08-15 當下的真實限制記錄，勿當現況讀。
- 本備份是**搬遷前的安全網**，非取代日常備份；WPvivid/MainWP 例行備份不受影響。

## Backup Milestone — 2026-05-09（MainWP + WPvivid 自動化建立）

- 2026-05-09: MainWP Dashboard 連線修復，WPvivid Backup v0.9.126 在 child site 已 installed + active（[WORKLOG 2026-05-09 §MainWP WPvivid](../../../WORKLOG.md)）
- 2026-05-09 09:13 UTC, 11:08 UTC: 兩次 WPvivid backup task `Succeeded`（Dropbox 路徑 `SoulfulDBBackup`）
- 2026-05-16 23:06 TPE: 切換 remote 至 Google Drive（`Update_Backup`，MainWP remote_id `wpvivid-remote-69ff0a63b77ab`，OAuth scope `drive.file`）

## Backup Incident — 2026-05-16（局部失敗 — 已自然恢復）

- task_id: `wpvivid-389495d5500f8`
- backup_time: **2026-05-16 13:35:14 UTC**
- status: **Failed**
- failure mode: 本地 backup ZIP 已產出但**上傳到 Drive 之前被刪除/移動/重命名**（MainWP 回報訊息：`/wp-content/wpvividbackups/...part001.zip not found. The file might has been moved, renamed or deleted`）
- 推測根因（**未驗證**）：Hostinger 端可能的 cron / cleanup / 磁碟配額 / PHP timeout 砍 partial file
- 後續 5/22 backup 成功 → 機制能跑，但此 fail mode 仍可能週期性發生 → 列入 follow-up task

## Backup Record #2 — 2026-05-22（首次成功 Google Drive 備份）

| 欄位 | 值 |
|---|---|
| Backup timestamp | **2026-05-22 11:05:20 UTC** = 19:05 TPE |
| task_id | `wpvivid-ea9a8f38850c5` |
| Backup scope | files + DB（WPvivid `backup_files=files+db`） |
| Storage location | Google Drive root: `aware-wave 主帳號/wpvivid_backup/` |
| File name | `soulfulexpression.org_wpvivid-ea9a8f38850c5_2026-05-22-10-53_backup_all.part001.zip` |
| File size | 148,221,436 bytes（**148 MB**，含 uploads） |
| Drive mtime | 2026-05-22 19:05 TPE |
| Status (MainWP DB) | **Succeeded**（驗證自 `mwp_mainwp_wpvividmeta.report_addon`） |
| Operator | WPvivid cron + 操作者 manual trigger via MainWP UI |

## Backup Milestone — 2026-06-08（週備份持續健康，JSON 同步補登）

2026-06-08 Phase 4 routine WARN（JSON 停在 5/22）觸發 VBC 查證，直接查 EU MainWP DB `report_addon`（site_id=2）取得完整 task 歷史：

| backup_time (UTC) | task_id | status |
|---|---|---|
| 2026-05-22 11:05 | wpvivid-ea9a8f38850c5 | Succeeded |
| 2026-05-25 00:15 | wpvivid-c9f8ea1a50284 | **Failed** — Google Drive API 403 rateLimitExceeded（暫時性）|
| 2026-06-01 00:15 | wpvivid-b888aaeec2aa6 | Succeeded |
| 2026-06-08 00:15 | wpvivid-6e68a5af17f93 | **Succeeded**（最新）|

結論：週備份機制正常運作（cron `wpvivid_weekly` 每週日 00:15 UTC）。5/25 單次失敗為 Google Drive API 速率限制，**後兩次自動恢復**，無需處置。WARN 純因 `BACKUP_AUTO_STATUS.json` 為手動同步、停在 5/22 → 已補登至 6/08。根本治理（自動同步）見 JSON `future_automation`。

## Restore Drill Record

### ✅ Drill #1 — 2026-08-16（已執行，PASS）

**方法改變**：原計畫卡在「等 Hostinger 建 staging 子網域」已近 3 個月未動。改為**在 EU 上開拋棄式容器還原**，不依賴任何 Hostinger 資源、不碰正式站，當天就跑完。

| 項目 | 值 |
|---|---|
| Drill date | 2026-08-16 |
| 還原標的 | EU VPS 拋棄式容器 `soulful-drill-db`（`mariadb:11`，**未對外開埠**） |
| 來源 | `/root/backups/clients/soulful/db-20260815-122353.sql.gz` + `uploads-20260815.tar.gz` |
| DB 匯入耗時 | **8.1 秒**，零錯誤 |
| uploads 解開耗時 | 4.8 秒 |
| Result | **PASS** |

**驗證項目（全部實測，非閱讀）**：

| 檢查 | 期望 | 實測 |
|---|---|---|
| 還原表數 | 288（來源實際表數） | **288** ✅ |
| `siteurl` / `home` | `https://soulfulexpression.org` | 相符 ✅ |
| 已發布文章 | — | 706 publish / 63 draft / 16 private / 2797 inherit |
| 使用者數 | — | 3 |
| uploads 檔案數 | 11,001（封存清單） | **11,001** ✅ |
| **DB 附件 ↔ 磁碟檔案交叉比對** | 0 遺失 | **750 筆全部存在，missing=0** ✅ |
| 圖片檔真實性（magic bytes） | JPEG `ffd8ff` | 抽驗 3 筆全部相符 ✅ |

**最強的一項是交叉比對** —— 從 `wp_postmeta._wp_attached_file` 取出每一筆附件路徑，逐一確認實體檔案存在。這證明的不只是「檔案解得開」，而是**資料庫與檔案彼此一致**，不存在「有記錄但圖不見」的斷裂。

### 🔴 Drill 揭露的缺口 —— 備份原本不完整

演練同時發現：`uploads-20260815.tar.gz` 內容**只有 `uploads/`**，不含 `plugins` / `themes` / `mu-plugins` / `languages`。

嚴重性：站上有 **~17 個付費外掛**（ACF Pro、Kadence Pro 三件、Fluent Pro 三件、Ultimate Member 八個擴充、CartFlows、Permalink Manager Pro…）。免費外掛可從 wordpress.org 重抓，**付費的沒有備份就要靠授權與廠商帳號才拿得回來**。完整清單見 [`SITE_CODE_MANIFEST.md`](SITE_CODE_MANIFEST.md)。

**當日補做**：見下方 Backup Record #3。

**不需備份者**：WP core 6.9.6（官方可重抓）、`wp-config.php`（含 DB 憑證，新主機本來就要重寫）。

**下次演練**：搬到新主機後，用新主機做一次「完整站還原 + 開得起來」的演練（本次因缺程式碼無法驗證「站能開」，只驗證了資料層）。

## Backup Record #3 — 2026-08-16（程式碼備份，補上 Drill #1 揭露的缺口）

| 項目 | 值 |
|---|---|
| 內容 | `wp-content/` 之 `plugins` + `themes` + `mu-plugins` + `languages` |
| 檔案 | `/root/backups/clients/soulful/code-20260816.tar.gz`（EU VPS） |
| 大小 | 122 MB（來源 686 MB） |
| 封存項目數 | **38,991** |
| SHA-256 | `a6cd877ba73fcf75e74f1190e48b347d9274b4c4f004c23c88a63d3d2e31baeb` |
| 兩地雜湊比對 | Hostinger 端與 EU 端 **完全一致** ✅ |
| `gzip -t` | OK ✅ |

**內容抽驗**（確認付費外掛真的在裡面，非只看檔名）：

| 外掛 | 封存檔案數 |
|---|---|
| `advanced-custom-fields-pro` | 687 |
| `kadence-pro` | 363 |
| `fluentformpro` | 483 |
| `permalink-manager-pro` | 145 |
| `um-woocommerce` | 64 |

自訂 mu-plugin `fix-update-plugin-prop.php` 亦確認在內。

**刻意不含**：`wp-config.php`（含 DB 憑證；新主機需重寫）、WP core（官方可重抓）、`uploads`（已有獨立備份）、`wpvividbackups` / `litespeed` / `gravatars` 等快取與外掛產生物。

**傳輸方式**：Hostinger → 本機 → EU 串流（`ssh cat | ssh cat`），不經第三方、不落地暫存於雲端硬碟。

> ~~三份備份合計 769 MB，全部存放於 **EU VPS**（不在 Hostinger），2026-11-12 hosting 到期不受影響。~~
>
## Drill #2 — 2026-08-27 — 從備份重建到「站真的會動」，PASS

> Drill #1（2026-08-16）證明的是「資料還原得出來」。Drill #2 證明的是**「還原後的站與 live 行為一致」** ——
> 兩者差別在於前者比對數量，後者比對**真實 HTTP 回應**。

**還原目標**：ks-aw-01（145.239.195.47）`/root/soulful/` docker compose stack
（`soulful-db` = mariadb:11.8.8 精確對齊 live、`soulful-wp` = 自建映像，見
[`lobster-factory/infra/soulful/`](../../../../lobster-factory/infra/soulful/)）

**還原來源**：`/root/soulful-source/20260827-060707/`（同一份亦在 R2
`ks-aw-01/soulful-source/20260827-060707/`，已驗證可從 R2 完整重組，SHA256 相符）

### 逐項結果

| 檢查 | 新機 | live 對照 | 判定 |
|---|---|---|---|
| 已發布文章數 | 706 | 706 | ✅ |
| 使用者數 | 3 | 3 | ✅ |
| 附件數 | 752 | 752 | ✅ |
| 資料表數 | 288 | 288 | ✅ |
| WooCommerce 訂單（HPOS）| 0（8 張 `wp_wc_order*` 表在）| 0 | ✅ 站本來就沒訂單 |
| **DB↔檔案系統互相對照**（全集非抽樣）| 749 refs / 10,894 files / **0 missing** | 750 / 10,923 / 1 missing | ✅ 新機比 live 還乾淨 |
| 首頁 | HTTP 200，249,954 bytes，title `Soulful Expression \| Healing Through Art`，Kadence 173 命中、WooCommerce 34 命中 | — | ✅ 是真站不是安裝畫面 |
| `/wp-login.php` | 200，登入表單存在 | — | ✅ |
| `/shop/` | 200 | — | ✅ |
| **7 條真實永久連結逐條比對** | 全部 200 | 全部 200 | ✅ 含中文 URL `insights/general/感恩日記改變人生的五分鐘習慣` |
| PHP 模組載入 | gmp/tidy/xsl/soap/redis/imagick/intl/igbinary/msgpack 全部 `yes` | — | ✅ |
| PHP 限制 | memory/upload/post 皆 1536M、`max_input_vars=5000`、`max_execution_time=0`、TZ=UTC | 相同 | ✅ |
| PHP fatal 錯誤 | 0 | — | ✅ |

### 過程中被驗證擋下的三件事（記錄下來，因為它們證明驗證不是空跑）

1. **`tidy` / `xsl` 編譯成功但載入失敗** —— Dockerfile 用 `apt purge --auto-remove` 清開發標頭時，
   把**執行期**函式庫一起清掉（`libtidy.so.58` / `libexslt.so.0` not found）。只有 runtime `php -m`
   檢查抓得到，build 本身是「成功」的。已加 build-time 斷言：模組載不進去就讓 build 失敗。
2. **「27 個附件遺失」是量測錯誤，不是還原錯誤** —— 驗證腳本的 `find` 只找圖片副檔名，
   DB 裡的 `.zip`/`.txt`/`.xml` 一律被算成遺失。**與 live 對照後才確認**（live 同樣路徑的檔案存在）。
   改成比對全部檔案類型後為 0 missing。差一點就去追一個不存在的資料遺失。
3. **中文永久連結 404 是測錯 URL** —— 站的永久連結結構是 `/insights/%category%/%postname%/`，
   且 `permalink-manager-pro` 另存 466 條自訂 URI，文章根本不在 `/{slug}/`。
   改用真實 URI 後兩邊皆 200。

### RTO：誠實區分「已測」與「未測」

| 階段 | 實測 | 備註 |
|---|---|---|
| 從 R2 下載 767 MB（4 分片）+ 重組 + SHA 驗證 | **~1 分 30 秒** | 已實測（往返驗證那輪）|
| DB 載入 288 表 | **~4 秒** | 已實測 |
| 檔案還原進 volume（767 MB 解壓）| **~14 秒** | 已實測 |
| 容器起動至 healthy | **~45 秒** | 已實測 |
| **合計（資料已在手、機器已備妥）** | **約 3 分鐘** | |
| 🔴 **未測**：全新裸機從零建置（裝 OS/Docker/建映像）| — | 本次是在既有已硬化主機上還原。真正的「整機死掉」情境還要加上 P2 全套（實際耗時約半天）+ 映像 build（約 3 分鐘）|

**故可宣稱的 RTO 是「資料層 < 5 分鐘」，不是「整機災難 < 4 小時」** ——
後者尚未端到端演練過，決策文件 P4.1 的 4 小時目標**只在資料層獲得驗證**。

---

> 🔴 **2026-08-27 訂正：上述 EU 副本已於 2026-08-24 02:32 UTC 被 `backup-eu-stack.sh` 的 retention 誤刪。**
> 根因：該 retention 用 `find $BACKUP_DIR -maxdepth 1 -type d -mtime +7 -exec rm -rf`，假設該層每個目錄
> 都是自己建的每日快照；`clients/soulful/` 是長期保存的客戶備份卻放在同一層，mtime 靜止滿 7 天即被掃除。
> **三天內沒有任何一層偵測到**（`verify-backup-eu.sh` 的檢查清單不含 client 備份，健康檢查只看快照數量與 mtime）。
> 完整事故記錄與不變量修法見 `agency-os/WORKLOG.md` 2026-08-27「事故：soulful 搬站安全網…」。
>
> **現行安全網（取代上述）**：2026-08-27 從 live 站重新拉取，存於 ks-aw-01 `/root/soulful-source/20260827-060707/`
> 並上傳 R2 `ks-aw-01/soulful-source/20260827-060707/`（該 prefix 有 14 天 WORM lock）。
> 這一份與舊的不同之處在於**驗證方式**：不只 `gzip -t`，而是實際載入一個拋棄式 MariaDB 容器，
> 確認 288 張表真的可還原（`db_tables_in_dump=288` == `db_tables_loaded=288`）。

## Artefacts

| 項目 | 路徑 / 值 |
|---|---|
| DB dump（local only，不入 git） | `agency-os/tenants/company-soulful-expression/backups/soulful_db_20260508_160734.sql.gz` |
| SHA-256 checksum | `849db7848992308dd4dd0b7a88c19add60b9b737463a90ba19a93da9566264b1` |
| 5/22 Google Drive ZIP | `G:\我的雲端硬碟\wpvivid_backup\soulfulexpression.org_wpvivid-ea9a8f38850c5_2026-05-22-10-53_backup_all.part001.zip` |
| MainWP DB truth source | `mwp_mainwp_wpvividmeta WHERE site_id=2 AND option_name='report_addon'` on EU VPS mainwp-web container |
| Restore log path | Drill #1（2026-08-16）逐項實測結果直接記於本檔 §Restore Drill Record；staging 路線已 abandon，不會再有 staging 版本 |
| Screenshot/report | 同上（Day 2 staging 已 abandon，見 `ENVIRONMENT_REGISTRY.md` staging 列） |
