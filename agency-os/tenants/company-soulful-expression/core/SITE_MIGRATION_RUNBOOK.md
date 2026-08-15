# soulfulexpression.org — 搬站執行手冊（Hostinger → 新主機）

> **這份是搬站的步驟／切換／回滾 SSOT。** 動手前從頭讀一遍。
> **硬死線**：Hostinger Premium Web Hosting **2026-11-12 到期，不續約**。什麼都不做 = 客戶網站當天下線。
>
> 配套文件：
> - [`SITE_CODE_MANIFEST.md`](SITE_CODE_MANIFEST.md) —— 要裝什麼、什麼版本、哪些是付費外掛
> - [`BACKUP_RESTORE_PROOF.md`](BACKUP_RESTORE_PROOF.md) —— 備份在哪、演練證據
> - [`DNS_MIGRATION_RECORD_MAP.md`](DNS_MIGRATION_RECORD_MAP.md) —— DNS 記錄與 DKIM 實況
> - [`ENVIRONMENT_REGISTRY.md`](ENVIRONMENT_REGISTRY.md) —— 環境現況（URL／版本／備份位置）

---

## 0. 這次搬站為什麼比一般簡單（先讀，會影響你怎麼估時間）

| 一般搬站的麻煩 | 本案狀況 |
|---|---|
| 網址改變 → 要跑 DB search-replace，最容易出錯 | ❌ **不會發生** —— 網域完全不變 |
| DNS 傳播要等數小時到 24 小時 | ❌ **不會發生** —— DNS 已在 Cloudflare 且 apex/www 開 proxy，訪客看到的一直是 CF 的 IP；換主機只是改回源位址，**幾秒生效** |
| 憑證要重新申請、可能空窗 | ❌ **不會發生** —— 對外憑證由 Cloudflare 提供，與主機無關 |
| 信箱要一起搬 | ❌ **不會發生** —— 信箱是獨立的 Hostinger Business Email，付到 **2029-06-03**，MX 不動 |

**結論**：真正花時間的是「把新主機準備好」，不是切換本身。切換是改一筆 A 記錄，回滾也是改一筆 A 記錄。

---

## 0.5 買機器前要決定的三件事（下單前讀，買錯難回頭）

### ① 機房位置 —— 最容易忽略的一項

現行主機 `sg-nme-web624.main-hosting.eu` 的 `sg` 表示**站目前在新加坡／亞洲**。Hetzner 的二手拍賣機主要在**德國／芬蘭**，搬過去等於 origin 從亞洲移到歐洲。

| 頁面類型 | 影響 |
|---|---|
| 一般頁面／文章／圖片 | 幾乎無感 —— Cloudflare 邊緣快取擋掉 |
| **登入後頁面／購物車／結帳** | **會變慢** —— 不可快取，每次回源到歐洲 |

⇒ 下單前確認訪客主要地區。若多在亞洲，這是要有意識接受的取捨（換來規格與成本的巨大優勢），不是可以忽略的細節。

### ② 規格下限

- RAM：64 GB 是原定規格，以「不只放 soulful」而言合理
- **磁碟務必 SSD/NVMe，不要為省錢選 HDD** —— WooCommerce + Ultimate Member 的資料庫吃 IO

### ③ 要不要 RAID

二手機常見兩顆碟。做 **RAID1（鏡射）** = 一顆壞掉站還活著，代價是可用空間少一半。以正式站而言值得。

> 備份／RAID／還原的既有正本：[`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](../../../../runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) —— **下單前先翻 §7 checklist**。

### 買到之後要交給代理的東西

只有兩樣：**機器 IP** + **root SSH 存取**。其餘建置、搬遷、驗證由代理執行。

---

## 1. 新主機最低需求

> **目標主機已定（2026-08-16 決議）：搬到新購的二手 Hetzner 主機**（同 `memory/project_hetzner_dedicated_plan.md` 的採購計畫）。
> 該等級機器（大記憶體 + 大磁碟）遠超本站需求，下表因此是「最低門檻」而非規格建議 —— 真正要注意的是**軟體版本要對齊**，不是硬體夠不夠。
>
> **所有權澄清**：soulfulexpression.org 是**操作者自己的產業**，不是第三方客戶。文中的「授權確認」「約時間」因此是自己決定，不需對外協調。

以 2026-08-16 實查的正式站基線為準：

| 項目 | 需求 | 備註 |
|---|---|---|
| PHP | **8.2.x**（現行 8.2.31） | 不要順手升 8.3/8.4；先搬，穩定後再談升級 |
| 資料庫 | MariaDB 11.x（現行 11.8.6）或等價 MySQL | |
| 磁碟 | ≥ 10 GB 給這個站 | 現行內容約 1.5 GB，留成長與備份空間 |
| 記憶體 | 建議 ≥ 2 GB 專供此站 | WooCommerce + Ultimate Member + 38 外掛不算輕 |
| Web server | nginx 或 Apache | ⚠️ 見下方 LiteSpeed 注意事項 |
| TLS | 由 Cloudflare 提供；**回源仍需有效憑證**（`ssl=full`） | 用 CF Origin Certificate 最省事 |

### ⚠️ LiteSpeed 快取外掛會失效

現行站用 `litespeed-cache`（Hostinger 是 LiteSpeed 主機）。**新主機若是 nginx/Apache，這個外掛的核心快取功能不會運作**。

處置：搬完後停用 `litespeed-cache`，改用其他快取方案（或直接倚賴 Cloudflare 邊緣快取）。**不要在切換當天處理這件事** —— 先搬過去讓站能跑，快取另外排一次。

---

## 2. 切換前置（新主機還沒開就能做）

- [ ] **授權盤點** —— ~17 個付費外掛分屬 5–6 組授權（見 `SITE_CODE_MANIFEST.md`）。程式碼已備份可照搬、站會正常跑，但**更新與支援需要有效授權**。站是操作者自己的，故此項是自己盤點續約狀態，不需對外協調
- [ ] **確認備份新鮮度** —— EU 上三份備份的日期（`ENVIRONMENT_REGISTRY.md` 有記）。若距今超過兩週，重跑一次
- [ ] **挑切換時段** —— 預期零停機，但仍選離峰（站上有 WooCommerce 與會員系統，避開有人正在結帳或註冊的時間）
- [ ] **新機規劃要留餘裕** —— 這台二手 Hetzner 預期不只放 soulful；配置磁碟／資料庫／反向代理時，一開始就按「多站」設計，不要照單站配好再回頭改

---

## 3. 建置新主機

- [ ] 開機、系統更新、防火牆（只開 22 / 80 / 443）
- [ ] 安裝 PHP 8.2 + 必要擴充、MariaDB、web server
- [ ] 建資料庫與專用帳號（**不要沿用 Hostinger 的憑證，重新產生**）
- [ ] 安裝 WP-CLI
- [ ] 佈署 Cloudflare Origin Certificate，回源走 HTTPS
- [ ] **考慮 origin lockdown**：只允許 Cloudflare IP 連 80/443（repo 已有 `/origin-lockdown` 的做法可參考）

---

## 4. 搬資料

來源：EU VPS `/root/backups/clients/soulful/`

```bash
# 在新主機上
# 1) WP 核心（官方重抓，備份刻意不含）
wp core download --version=6.9.6 --path=/var/www/soulfulexpression

# 2) 程式碼（plugins / themes / mu-plugins / languages）
tar -xzf code-20260816.tar.gz -C /var/www/soulfulexpression/wp-content/

# 3) uploads
tar -xzf uploads-20260815.tar.gz -C /var/www/soulfulexpression/wp-content/

# 4) 資料庫
zcat db-20260815-122353.sql.gz | mysql <dbname>
```

- [ ] **`wp-config.php` 重新撰寫**（備份刻意不含 —— 裡面是舊主機的 DB 憑證）。務必產生**全新的 salts**
- [ ] 檔案權限與 owner 設定正確
- [ ] **不要**還原 `hostinger` 外掛與 `hostinger-auto-updates` mu-plugin（主機專屬，見 §7）

---

## 5. 切換前驗證（重要：在還沒切換的情況下驗新站）

用本機 `hosts` 檔把 `soulfulexpression.org` 指到新主機 IP，即可在不影響任何訪客的情況下完整測試。

- [ ] 首頁、關於、服務、部落格列表、單篇文章
- [ ] **會員登入**（Ultimate Member）—— 私有內容、profile、bookmarks
- [ ] **WooCommerce**：商品頁、購物車、結帳流程走到付款前一步
- [ ] **表單送出**（FluentForms）→ 確認收得到信
- [ ] 媒體圖片正常顯示（隨機抽 10 張，含舊年份）
- [ ] 後台可登入、外掛清單與 `SITE_CODE_MANIFEST.md` 相符
- [ ] `wp cron event list` 排程正常
- [ ] Rank Math 的轉址規則仍在

**任何一項不過就不要切換。** 新舊並存不會傷害任何人，慢慢修。

---

## 6. 切換（High risk —— 需操作者明示 go-ahead）

### 切換前最後一步：資料增量

正式站在準備期間仍在收訂單、收會員註冊。**切換當下必須用最新的資料庫**，否則這段期間的資料會遺失。

- [ ] 進入短暫維護模式（或選離峰時段）
- [ ] 重新 dump 正式站 DB → 匯入新主機（覆蓋）
- [ ] 重新同步 `uploads`（只補新增檔案即可）

### 切換動作

在 Cloudflare 把 apex 的 **A 記錄**由 `191.101.230.176` 改為新主機 IP。`www` 是 CNAME 指向 apex，不用動。**proxy 維持開啟（🟠）**。

- [ ] 改 A 記錄
- [ ] 立即驗證：`curl -sSI https://soulfulexpression.org/` → 200
- [ ] 跑 §5 的驗收清單重點項（首頁 / 登入 / 結帳 / 表單）

### 回滾（若任何一項失敗）

**把 A 記錄改回 `191.101.230.176`。** 一步完成，幾秒生效。

Hostinger 主機在 2026-11-12 前都還活著，舊站原封不動 —— 這是回滾之所以安全的原因。**因此在 11/12 之前不要刪除舊站任何東西。**

---

## 7. 切換後

- [ ] **移除主機專屬外掛**：`hostinger`、`hostinger-auto-updates`（mu-plugin）
- [ ] **停用 `litespeed-cache`**（見 §1 說明），另排快取方案
- [ ] **FluentSMTP 不用改** —— 信箱還在 Hostinger（付到 2029），`smtp.hostinger.com:587` / `info@soulfulexpression.org` 設定原樣可用。**但切換後務必實寄一封驗證**
- [ ] **MainWP 重新接線** —— child site 的連線會因主機變更而失效
- [ ] **備份排程搬過去** —— 新主機要有自己的自動備份，並確認產物送到 EU
- [ ] **監控**：`scripts/check-smoke-tests.ps1` 的 `client_mail` 檢查用的是 Hostinger 的 SSH 資訊，**主機換了要同步更新**（`HOSTINGER_SOULFUL_SSH_*` 三個環境變數與金鑰路徑）
- [ ] 更新 `ENVIRONMENT_REGISTRY.md`：Hosting Provider、IP、備份位置
- [ ] **完整還原演練**（Drill #2）—— 這次要驗到「站能開起來」，Drill #1 因缺程式碼備份只驗到資料層

---

## 8. 讓 hosting 到期（2026-11-12）

- [ ] 確認新站穩定運行至少兩週
- [ ] 清除 Hostinger 舊站檔案與 DNS 區域（**在此之前都是回滾路徑，不要提早刪**）
- [ ] 自動續約已於 2026-08-15 關閉，**放著到期即可，不需任何操作**

### ⛔ 絕對不要取消 Hostinger 帳號

| 訂閱 | 到期 | 狀態 |
|---|---|---|
| Premium Web Hosting | 2026-11-12 | **讓它到期** |
| `.ORG` 網域 | 2028-06-03 | **保留**（或轉 Cloudflare Registrar） |
| Starter Business Email | 2029-06-03 | **保留** —— 客戶信箱住在這裡 |

取消帳號會把還有效的網域與信箱一起帶走。

---

## 附錄：已知的坑（實測得來，不是推測）

| 坑 | 說明 | 出處 |
|---|---|---|
| DKIM selector 不是 `-a`/`-b` | 實際簽章用 `hostingermail1`，且 Hostinger 舊 zone 沒有這筆。回滾 DNS 會讓 DKIM 失效 | `DNS_MIGRATION_RECORD_MAP.md` §DKIM 實況 |
| FluentSMTP 主機名曾設錯 | 曾指向 `pop.hostinger.com:587`（不接受連線），寄信靜默失敗 13 天。正確為 `smtp.hostinger.com:587` | WORKLOG 2026-08-16 |
| 備份曾不含程式碼 | 原封存只有 `uploads/`。已於 2026-08-16 補齊 | `BACKUP_RESTORE_PROOF.md` Drill #1 |
| 沒有子佈景 | 佈景客製存在 DB 的 Kadence 設定裡 —— 這是好事，但別因此以為「檔案不用備份」 | `SITE_CODE_MANIFEST.md` |
