# Tools Configuration Guide - Scenery Travel Mongolia

## Hosting
- 供應商：待補（Day 2 確認：Hostinger / Cloudways / 其他）
- 選擇原則：APAC 節點優先（目標客群在亞洲）、支援 PHP 8.x + SSL

## WordPress
- 版本目標：最新穩定版（6.x）
- PHP 版本目標：8.2+
- 主題策略：商業主題（待確認）或輕量 custom theme

## 必要外掛基線（Day 2 安裝）
| 外掛類別 | 建議 | 備註 |
|---------|------|------|
| SEO | Yoast / RankMath | 二選一 |
| 安全 | Wordfence / SolidSecurity | 二選一 |
| 備份 | UpdraftPlus | 必裝，指向 cloud storage |
| 快取 | WP Rocket / LiteSpeed Cache | 依主機選擇 |
| 多語系 | WPML / Polylang | Phase 2 評估 |
| 表單 | WPForms / Gravity Forms | 詢問表單必裝 |
| Analytics | Site Kit (GA4) 或 PostHog | 擇一 |

## DNS 與 SSL
- DNS 策略：staging 子網域（`staging.` 前綴）
- SSL：Let's Encrypt 或主機商提供的免費 SSL
- CDN：Cloudflare（Optional，後期優化）

## Analytics 與追蹤
- 工具：待決定（GA4 / PostHog）
- 目標事件：詢問表單送出、關鍵頁瀏覽、電話/Email 點擊
