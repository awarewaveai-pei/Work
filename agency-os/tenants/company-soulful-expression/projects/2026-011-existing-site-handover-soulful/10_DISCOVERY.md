# Discovery - 2026-011 Existing Site Handover Soulful Expression

> 用途：記錄 Day 1 盤點結果（接手基線）。
> 填寫方式：在 Hostinger + WordPress 後台執行後，逐欄填入。

> **Who fills this（重要）**
> §1.1–§1.2 的欄位由 **持有 Hostinger SSH key + WP-CLI 存取** 的「操作者或代理」填入。**Day 1 §1.2 機讀基線**已由 Claude 透過 SSH + wp-cli 完成（2026-05-08）；§1.1 帳號層級權限（Hostinger panel / DNS panel / WP admin browser login）仍須操作者親自確認。流程對照：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` **§1.1 權限**、**§1.2 基線**。
> 填完本檔後，請把同一組 **production** 基線數字抄到 `core/ENVIRONMENT_REGISTRY.md`（同一次 commit 最佳）。

## 客戶概況
- 客戶名稱：Soulful Expression Art Therapy
- Production URL：https://soulfulexpression.org/
- Hosting：Hostinger（SG `sg-nme-web624.main-hosting.eu`，shared hosting）
- 目前狀態：上線中（接手前未執行 staging first）

## 盤點結果（Day 1 — 2026-05-08 完成）

### 環境基線

| 項目 | 值 | 備註 |
|---|---|---|
| WP 版本 | **6.9.4** | minor auto-update (`WP_AUTO_UPDATE_CORE=minor`) |
| PHP 版本 | **8.2.30 (NTS, Linux)** | Built 2026-03-08 |
| 主題（active） | **Kadence 1.3.6** | 有更新可用 → 1.4.5 |
| 主題（inactive） | twentytwentyfive 1.2 |  |
| DB 引擎 | **MariaDB 11.8.6-MariaDB-log** |  |
| DB 大小 | 138 MB |  |
| Site URL / Home | https://soulfulexpression.org | siteurl 與 home 一致 |
| Blog name / tagline | Soulful Expression / Art Therapy |  |
| Currency | AUD | WooCommerce |
| Language | en_AU |  |
| Timezone | (空字串，使用 UTC offset) | **建議**設定 IANA timezone |
| Permalink | `/insights/%category%/%postname%/` | blog focused |
| WP_CACHE | `true` | LiteSpeed Cache 啟用 |
| WP_DEBUG | `false` | production 預設 |
| FS_METHOD | `direct` |  |

### 內容量（盤點當下）

| 類型 | 數量 |
|---|---|
| posts | 34 |
| pages | 75 |
| products (WooCommerce) | 2 |
| orders (shop_order) | 0 |
| users (total) | 3 |
| users (administrator) | 2（Admin、peijingartstudio） |

### 磁碟使用

| 路徑 | 大小 |
|---|---|
| `wp-content/uploads` | 491 MB |
| `wp-content/plugins` | 579 MB |
| `wp-content/themes` | 22 MB |
| Disk free（home volume） | 4.7 TB used / 7.0 TB total，67% |

### 外掛清單（35 active + 1 must-use；16 有更新）

> **Update available (security focus)**：以下標 ⚠️ 為有版本更新可用 — Day 3 安全變更包優先處理。

| 外掛名稱 | 版本 | 狀態 | 更新 | 風險 |
|---------|------|---------|---------|---|
| advanced-custom-post-type | 2.0.54 | active | — | low |
| advanced-custom-fields-pro | 6.4.2 | active | ⚠️ 6.8.0.1 | **high**（4 minor 落後） |
| akismet | 5.6 | active | ⚠️ 5.7 | low |
| cartflows | 3.0.0 | active | ⚠️ 3.0.1 | low |
| code-snippets | 3.9.5 | active | ⚠️ 3.9.6 | low |
| fluent-boards-pro | 1.65 | active | — | medium（無自動更新） |
| fluent-booking | 2.0.05 | active | — | medium |
| fluent-booking-pro | 1.8.0 | active | — | medium |
| fluent-crm | 2.9.87 | active | — | medium（電郵核心） |
| fluentform | 6.1.20 | active | ⚠️ 6.2.2 | medium |
| fluentformpro | 6.1.15 | active | — | medium |
| fluent-smtp | 2.2.95 | active | — | high（寄信核心） |
| hostinger | 3.0.65 | active | ⚠️ 3.0.66 | low |
| kadence-blocks-pro | 2.7.8 | active | ⚠️ 2.8.14 | medium |
| kadence-blocks | 3.6.5 | active | ⚠️ 3.6.7 | low |
| kadence-pro | 1.1.10 | active | — | low |
| kadence-woo-extras | 2.4.8 | active | — | low |
| litespeed-cache | 7.8.0.1 | active | ⚠️ 7.8.1 | medium（cache layer） |
| permalink-manager-pro | 2.5.1.4 | active | ⚠️ 2.5.3.3 | medium（URL 結構） |
| seo-by-rank-math | 1.0.266.1 | active | ⚠️ 1.0.269 | low |
| google-site-kit | 1.174.0 | active | ⚠️ 1.178.0 | low |
| tripetto | 8.0.10 | active | — | low |
| tripetto-pro | 8.0.10 | inactive | — | — |
| ultimate-member | 2.11.3 | active | ⚠️ 2.11.4 | **high**（auth core；歷史 CVE 多） |
| um-private-content | 2.1.5 | active | — | medium |
| um-profile-completeness | 2.3.2 | active | — | low |
| um-profile-tabs | 1.1.0 | active | — | low |
| um-terms-conditions | 2.2.0 | active | — | low |
| um-user-bookmarks | 2.1.5 | active | — | low |
| um-user-photos | 2.2.0 | active | — | low |
| um-verified-users | 2.2.6 | active | — | low |
| um-woocommerce | 2.4.4 | active | — | medium（auth↔WC） |
| woocommerce | 10.6.1 | active | ⚠️ 10.7.0 | **high**（電商核心） |
| woocommerce-points-and-rewards | 1.8.10 | active | ⚠️ 1.18.20 | **high**（10+ 版本落後） |
| astra-portfolio | 1.13.1 | active | ⚠️ 1.13.4 | low |
| hostinger-auto-updates | 1.0.7 | must-use | — | low |

### 第三方整合（從外掛推論 + cron 觀察）

| 服務 | 類型 | 用途 | 風險 |
|-----|------|------|------|
| Google Site Kit | Analytics | GA4 / Search Console / AdSense | 低 |
| FluentCRM | Email Marketing | 客戶名單 + 自動化（每 5 分鐘 cron） | 中（電郵保留） |
| Fluent SMTP | 系統寄信 | WP transactional emails | 高（壞掉=不能寄信） |
| FluentForm + FluentFormPro | 表單 | 預約 / 聯絡 | 中 |
| Fluent Booking + Pro | 預約系統 | 1-on-1 排程 | 中 |
| WooCommerce + um-woocommerce | 電商 | 2 個產品；目前 0 訂單 | 低（小流量） |
| WooCommerce Points & Rewards | 點數 | 客戶忠誠度（落後 10 版） | **高**（已知 CVE 風險） |
| Cartflows | 結帳流程 | 漏斗優化 | 低 |
| Ultimate Member ecosystem (12 plugins) | 會員系統 | 私有內容 / verified / bookmarks | **高** |
| Rank Math SEO | SEO | meta / sitemap | 低 |
| LiteSpeed Cache | 快取 | 全站 cache + LQIP（cron） | 中 |
| Akismet | Anti-spam | 評論過濾 | 低 |
| Permalink Manager Pro | URL 重寫 | 自訂 permalink | 中（壞掉=URL 全爆） |
| Kadence ecosystem (5 plugins) | 主題+blocks | 視覺核心 | 中 |
| Hostinger plugin + auto-updates | 主機商整合 | 自動更新 + 主機面板 | 低 |
| Tripetto | 互動表單 | 問卷 | 低 |

### 排程 / Cron（28 個 WP-Cron 事件，部分摘錄）

| Hook | 頻率 | 用途 |
|---|---|---|
| `fluentcrm_scheduled_five_minute_tasks` | 5 分 | CRM 自動化引擎核心 |
| `action_scheduler_run_queue` | <1 分 | WC + Action Scheduler |
| `wc_admin_process_orders_milestone` | <1 分 | WC milestones |
| `fluentform_do_scheduled_tasks` | 2 分 | 表單延遲處理 |
| `litespeed_task_lqip` | 5 分 | 圖片 placeholder |
| `wc_points_rewards_expire_points_daily` | 14 分 | 點數過期 |
| `um_hourly_scheduled_events` | hourly | UM 會員 |
| `wp_version_check`/`wp_update_plugins` | 4-5 hr | 核心更新檢查 |
| `wp_update_themes` | 5+ hr | 主題更新檢查 |

**自訂系統 cron**：shared hosting 環境 `crontab` 不可用（user-level cron 透過 Hostinger panel）。

## 風險 Top 3（Day 1 評估）

1. **Ultimate Member ecosystem 12 個外掛 + WooCommerce Points & Rewards 落後 10 版以上** — Auth + 點數模組是過去 WordPress CVE 重災區；建議 Day 3 第一波就針對這條 patch（先 staging 跑全 regression 才 production）。
2. **無 staging 環境，過去任何更新均在 production 直改** — Day 2 必先建 `staging.soulfulexpression.org/`（per ENVIRONMENT_REGISTRY canonical URL），所有後續變更先 staging 再 production；建立後立即驗收登入 + 關鍵頁。
3. **無代管備份證據** — Hostinger panel 有自動備份但 (a) 還原時點未驗證、(b) 還原檔案來源 + 完整性未紀錄；Day 1 結束前須在 `core/BACKUP_RESTORE_PROOF.md` 寫第一筆備份證據（最低門檻：DB dump 下載至本機 + 還原到 staging 一次成功）。

## 盤點完成條件

- [x] `core/ENVIRONMENT_REGISTRY.md` production 欄位全部填入（2026-05-08）
- [ ] `core/BACKUP_RESTORE_PROOF.md` 第一次備份記錄填入（待 Day 2 staging 同步測還原）
- [x] 本檔外掛清單與第三方整合欄位填入（2026-05-08）
- [x] 風險 Top 3 確認（待寫入 WORKLOG.md）

_Day 1 §1.2 baseline inventory completed via SSH + wp-cli on 2026-05-08 by Claude (in coordination with operator who supplied SSH key access)._
