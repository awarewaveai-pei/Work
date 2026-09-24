# soulfulexpression.org — 站台程式清單（重建用）

> **用途**：主機沒了、備份不完整、或要在新主機重建時，這份是「該裝什麼、什麼版本」的正本。
> **清點時間**：2026-08-16（`wp plugin list` / `wp theme list` / `wp core version` 實查）
> **來源**：Hostinger `sg-nme-web624.main-hosting.eu`，`domains/soulfulexpression.org/public_html`
>
> 相關：[`DNS_MIGRATION_RECORD_MAP.md`](DNS_MIGRATION_RECORD_MAP.md)（DNS）、[`BACKUP_RESTORE_PROOF.md`](BACKUP_RESTORE_PROOF.md)（備份與還原演練證據）

## 環境基線

| 項目 | 版本 |
|---|---|
| WordPress core | 6.9.6 |
| PHP | 8.2.31 |
| 啟用中佈景 | `kadence` 1.3.6（**無子佈景** —— 客製設定存在資料庫的 Kadence 設定裡，隨 DB 備份一起保存） |
| 其他佈景 | `twentytwentyfive` 1.2（未啟用，可不還原） |
| 啟用外掛數 | 38 + 2 個 must-use |

## 🔴 付費外掛（無授權無法重新下載 —— 遺失即不可回復）

這 17 個是搬遷的**最大單一風險**。免費外掛從 wordpress.org 隨時可抓；下列必須靠備份或廠商帳號。

| 外掛 | 版本 | 廠商 |
|---|---|---|
| `advanced-custom-fields-pro` | 6.4.2 | WP Engine / ACF |
| `cartflows` | 3.0.1 | Brainstorm Force |
| `fluent-boards-pro` | 1.65 | WPManageNinja |
| `fluent-booking-pro` | 1.8.0 | WPManageNinja |
| `fluentformpro` | 6.1.15 | WPManageNinja |
| `kadence-pro` | 1.1.10 | Kadence WP |
| `kadence-blocks-pro` | 2.7.8 | Kadence WP |
| `kadence-woo-extras` | 2.4.8 | Kadence WP |
| `permalink-manager-pro` | 2.5.1.4 | Maciej Bis |
| `woocommerce-points-and-rewards` | 1.8.10 | WooCommerce |
| `internal-links` | 2.26.0 | Link Whisper |
| `astra-portfolio` | 1.13.1 | Brainstorm Force |
| `um-private-content` | 2.1.5 | Ultimate Member |
| `um-profile-completeness` | 2.3.2 | Ultimate Member |
| `um-profile-tabs` | 1.1.0 | Ultimate Member |
| `um-terms-conditions` | 2.2.0 | Ultimate Member |
| `um-user-bookmarks` | 2.1.5 | Ultimate Member |
| `um-user-photos` | 2.2.0 | Ultimate Member |
| `um-verified-users` | 2.2.6 | Ultimate Member |
| `um-woocommerce` | 2.4.4 | Ultimate Member |

> Ultimate Member 的 8 個擴充是同一組授權；Kadence 三件與 Fluent 三件同理。實際只需 5–6 組授權，但**授權在誰名下、續不續約，搬遷前要確認**。

## 免費外掛（wordpress.org 可重抓）

`akismet` 5.7、`fluent-crm` 3.1.8、`fluent-booking` 2.2.0、`fluentform` 6.2.11、`fluent-smtp` 2.3.0、
`kadence-blocks` 3.7.8.2、`litespeed-cache` 7.8.1、`mainwp-child` 6.1.2、`seo-by-rank-math` 1.0.275、
`google-site-kit` 1.178.0、`ultimate-member` 2.12.1、`woocommerce` 10.7.0、`code-snippets` 3.9.6、
`advanced-custom-post-type` 2.0.54、`printful-shipping-for-woocommerce` 2.2.12、`wpvivid-backuprestore` 0.9.132

## 自有 / 主機專屬

| 外掛 | 版本 | 搬遷處置 |
|---|---|---|
| `aware-wave-wp-bridge` | 0.17.0 | 我們自己的，從 [`aware-wave-wp-bridge` release repo](https://github.com/awarewaveai-pei/aware-wave-wp-bridge) 取 |
| `hostinger` | 3.0.66 | **搬走後移除** —— Hostinger 專屬 |
| `hostinger-auto-updates`（mu-plugin）| 1.0.7 | **已移除 2026-09-24** —— Hostinger 專屬 |
| `fix-update-plugin-prop`（mu-plugin）| — | 自訂修補，需保留；內容只在檔案裡，**務必隨程式備份一起帶走** |

## ⚠️ 備份涵蓋範圍（2026-08-16 演練查證）

| 內容 | 大小 | 是否在 EU 備份中 |
|---|---|---|
| 資料庫（288 表） | 15 MB (gz) | ✅ 已驗證可還原 |
| `uploads` | 632 MB (gz) | ✅ 已驗證可還原 |
| `plugins` | 619 MB | ➡️ 2026-08-16 補做 |
| `themes` | 22 MB | ➡️ 2026-08-16 補做 |
| `mu-plugins` | 20 KB | ➡️ 2026-08-16 補做 |
| `languages` | 25 MB | ➡️ 2026-08-16 補做 |
| WP core 6.9.6 | — | ❌ 不需要（官方可重抓） |
| `wp-config.php` | — | ❌ 刻意不備份（含資料庫憑證；新主機本來就要重寫） |
