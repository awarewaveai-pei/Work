# soulfulexpression.org — live runtime baseline (2026-08-27)

> **這份是搬遷的建置規格正本，不是參考資料。**
> 2026-08-27 直接從 live 站 SSH 擷取。**不要用 repo 其他文件當建置依據** —— 它們已經漂移：
> `SITE_CODE_MANIFEST.md:13,:51` 寫 WP 6.9.6 / fluentform 6.2.11、
> `ENVIRONMENT_REGISTRY.md:12` 寫 6.9.6 / MariaDB 11.8.6、
> `SITE_MIGRATION_RUNBOOK.md:112` 寫死 `wp core download --version=6.9.6`。
> **線上實際是 6.9.7 / 11.8.8 / 6.2.12。**
>
> 🔴 **其中 PHP 限制值在任何備份產物裡都不存在** —— 它們設在 Hostinger 控制面板，
> 站上既沒有 `.user.ini` 也沒有 `php.ini`（已確認兩者皆 No such file）。
> Hostinger 一到期這份資訊就永久消失，這份文件是唯一副本。

## 執行環境

| 項目 | 線上實際值 | 備註 |
|---|---|---|
| WordPress | **6.9.7** | 非文件記載的 6.9.6 |
| PHP | **8.2.31** (NTS) | |
| 資料庫 | **MariaDB 11.8.8**-log | 非文件記載的 11.8.6 |
| 主機 | Hostinger 共享（LiteSpeed）| SSH `191.101.230.176:65002` |

## PHP 限制（🔴 只存在於 Hostinger 面板，無備份）

```ini
memory_limit        = 1536M
upload_max_filesize = 1536M
post_max_size       = 1536M
max_input_vars      = 5000
max_execution_time  = 0
max_file_uploads    = 20
date.timezone       = UTC
```

> ⚠️ **不要沿用 `apps/wordpress/php-upload-limits.ini`**（64M / 64M / 256M，且沒有 `max_input_vars`）。
> `max_input_vars=5000` 對這個站是實質需求：39 個外掛 + Ultimate Member 八個擴充的設定頁
> 送出的欄位數遠超預設 1000，值太低會**靜默截斷表單送出**而不報錯。

## 資料庫連線設定（**逐字複製，不要「修正」**）

```php
define( 'DB_CHARSET', 'utf8' );   // ← 不是 utf8mb4。改了會破壞既有內容的編碼對應
define( 'DB_COLLATE', '' );
$table_prefix = 'wp_';
```

## PHP 模組（新機映像必須涵蓋）

```
bcmath bz2 calendar ctype curl date dom exif fileinfo filter ftp gd gettext gmp
hash iconv igbinary imagick imap intl json libxml mbstring msgpack mysqli mysqlnd
openssl pcntl pcre PDO pdo_mysql pdo_sqlite Phar posix random readline redis
Reflection session shmop SimpleXML soap sockets SPL sqlite3 standard sysvmsg
sysvsem sysvshm tidy timezonedb tokenizer xml xmlreader xmlrpc xmlwriter xsl
Zend OPcache zip zlib
```

**官方 `wordpress:6.9-php8.2-apache` 映像預設沒有的**：`imagick`、`redis`、`intl`、
`soap`、`gmp`、`tidy`、`bcmath`、`sqlite3`、`igbinary`、`msgpack`、`timezonedb`、`imap`。
建置時需在 Dockerfile 補裝，**其中 `imagick` 與 `intl` 是 WooCommerce/Kadence 實質依賴**。

`monarxprotect` 是 Hostinger 專屬安全模組，新機不需要也裝不了 —— 屬預期差異。

## WooCommerce

| 項目 | 值 | 搬遷影響 |
|---|---|---|
| **HPOS**（High Performance Order Storage）| **`yes` 已啟用** | 🔴 訂單資料在 `wp_wc_orders*` 自訂表，**不在** `wp_posts`/`wp_postmeta`。任何只搬 posts 表的做法會遺失全部訂單。本次 mysqldump 為全庫 288 表，已涵蓋 |
| WooCommerce | 10.7.0（可更新至 11.0.1）| 搬遷當下**不要升級**，先原版落地 |

## 啟用中的外掛（39 個）

<details>
<summary>完整清單（name, version, 可更新版本）</summary>

```
advanced-custom-post-type            2.0.54
advanced-custom-fields-pro           6.4.2   -> 6.8.8
akismet                              5.7     -> 5.7.2
aware-wave-wp-bridge                 0.17.0          ← 自家外掛
cartflows                            3.0.1   -> 3.2.0
code-snippets                        3.9.6   -> 3.10.0
fluent-boards-pro                    1.65
fluent-booking                       2.2.0   -> 2.2.5
fluent-booking-pro                   1.8.0
fluent-crm                           3.1.8   -> 3.1.13
fluentform                           6.2.12  -> 6.2.13
fluentformpro                        6.1.15
fluent-smtp                          2.3.0   -> 2.3.1
hostinger                            3.0.66          ← 🔴 主機商專屬，新機應移除
internal-links                       2.26.0
kadence-blocks-pro                   2.7.8   -> 2.8.17
kadence-blocks                       3.7.8.2 -> 3.7.9.1
kadence-pro                          1.1.10
kadence-woo-extras                   2.4.8
litespeed-cache                      7.8.1   -> 7.9    ← 🔴 見下方
mainwp-child                         6.1.2   -> 6.1.8  ← 見下方 CVE 註記
permalink-manager-pro                2.5.1.4 -> 2.6.0
printful-shipping-for-woocommerce    2.2.12
seo-by-rank-math                     1.0.275 -> 1.0.277
google-site-kit                      1.178.0 -> 1.186.0
ultimate-member                      2.12.1  -> 2.13.0
um-private-content                   2.1.5
um-profile-completeness              2.3.2
um-profile-tabs                      1.1.0
um-terms-conditions                  2.2.0
um-user-bookmarks                    2.1.5
um-user-photos                       2.2.0
um-verified-users                    2.2.6
um-woocommerce                       2.4.4
woocommerce                          10.7.0  -> 11.0.1
woocommerce-points-and-rewards       1.8.10  -> 1.18.23
astra-portfolio                      1.13.1  -> 1.13.6
wpvivid-backuprestore                0.9.132 -> 0.9.133
```

</details>

**佈景主題**：`kadence` 1.3.6（可更新至 1.5.2）

### 搬遷時需要處理的三個外掛

| 外掛 | 問題 | 處置 |
|---|---|---|
| `litespeed-cache` | 依賴 LiteSpeed 伺服器，新機是 nginx。`.htaccess` 內有整段 LSCACHE 規則，nginx 完全不讀 | **切換當天不要動**（runbook §陷阱②已載明）。落地穩定後另排：停用並改用 nginx fastcgi cache 或 Redis object cache（新機的 PHP 已有 redis 模組）|
| `hostinger` | 主機商專屬管理外掛 | 新機移除 |
| `mainwp-child` | 目前 6.1.2。CVE-2024-10783 要求 **>5.3.3**，此版本已滿足 | 版本無虞；但**搬機後需重新確認與 MainWP Dashboard 的連線**（token 綁站台 URL/IP）|

## `.htaccess`

內容為 LiteSpeed Cache 產生的區塊 + 標準 WordPress rewrite。**nginx 不讀 .htaccess**，
新機需把「標準 WP rewrite」翻成 nginx 的 `try_files $uri $uri/ /index.php?$args`。
LSCACHE 區塊無對應物，不需翻譯。

**Tripetto 檢查結果**：`find wp-content/uploads -ipath '*/tripetto/*' -type f` → **0 個檔案**。
故 runbook 提到的 `RedirectMatch 401 .../tripetto/...` 保護規則**目前非必要**（無資料需保護），
移植與否不影響安全性。

## TTFB 基準（2026-08-27，切換後即無法再測同一條件）

自台灣量測，Cloudflare proxy 開啟，origin 在 Hostinger：

| 路徑 | n | min | median | p95 | max |
|---|---|---|---|---|---|
| `/` | 8 | 0.304s | **0.366s** | 0.422s | 3.011s |
| `/shop/` | 8 | 0.311s | **0.324s** | 1.142s | 1.844s |
| `/my-account/` | 8 | 0.300s | **0.336s** | 0.385s | 1.615s |

> 各路徑第一次請求都明顯偏高（3.0s / 1.8s / 1.6s），之後穩定在 0.3s 附近 —— 典型的
> 快取冷啟動。**比較切換後數據時要對齊條件**：同樣丟掉第一筆，比 median。
> 決策文件的驗收門檻是「惡化 > 400ms 才評估 Argo」，對應到 median 從 ~0.33s 惡化到 ~0.73s。

## Origin 憑證（決定 Cloudflare SSL 模式能否設為 strict）

```
subject = CN=soulfulexpression.org
issuer  = Let's Encrypt, CN=YE1
notBefore = 2026-07-27
notAfter  = 2026-10-25      ← 🔴 早於 11-12 硬死線
```

**含意**：Cloudflare zone 目前是 `full`（非 `strict`），代表 CF 接受 origin 的**任何**憑證。
好處是回滾容錯高；壞處是新 origin 若憑證設錯，切換會**靜默成功**但 origin 段未經驗證。
若要改 `strict`，回滾到 Hostinger 就開始依賴 Hostinger 的 LE 憑證持續有效 ——
而該憑證 10/25 到期、續期預計約 9/25，**Hostinger 在不續約前提下是否還會續憑證無人知道**。
這是一個真實取捨，不是單純的安全升級。

---

_擷取方式：`ssh -i ~/.ssh/hostinger_soulful -p 65002 u942075013@191.101.230.176`，唯讀指令，未修改線上任何設定。_
_相關：`BACKUP_RESTORE_PROOF.md`（備份與還原證據）、`SITE_MIGRATION_RUNBOOK.md`（搬遷步驟）、`SITE_CODE_MANIFEST.md`（外掛授權盤點，版本欄位已過期，以本檔為準）。_
