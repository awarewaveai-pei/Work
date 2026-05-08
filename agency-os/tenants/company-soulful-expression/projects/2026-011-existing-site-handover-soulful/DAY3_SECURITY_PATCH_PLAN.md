# Day 3 Security Patch Plan
# Soulful Expression Art Therapy

> **前提**：staging 已建立且驗收通過。所有更新先 staging → 再 production。
> **原則**：高風險先更新，每次只動 2–3 個外掛，每次都備份再動。

---

## Wave 1 — 高風險（立刻處理）

> **目標**：消除已知 CVE 風險。先只做這波，確認穩定後再 Wave 2。

| 外掛 | 當前版本 | 目標版本 | 風險 | 理由 |
|---|---|---|---|---|
| **advanced-custom-fields-pro** | 6.4.2 | 6.8.0.1 | **HIGH** | 落後 4 個 minor 版本；ACF 歷史上有多個 XSS + CSRF CVE |
| **ultimate-member** | 2.11.3 | 2.11.4 | **HIGH** | Auth core；UM 是 WordPress CVE 重災區（歷史：SQLi、帳號接管、bypass） |
| **woocommerce** | 10.6.1 | 10.7.0 | **HIGH** | 電商核心；WC 每個 minor 都修 security issues |
| **woocommerce-points-and-rewards** | 1.8.10 | 1.18.20 | **HIGH** | 落後 10 版以上，已有已知 CVE 風險 |

**Wave 1 流程（在 staging 先做）**：
1. 確認今日 Hostinger 自動備份已完成（hPanel → Backups → 確認今日有一筆）
2. 登入 staging WP 後台
3. 外掛 → 更新 Wave 1 這 4 個
4. 驗收：後台正常、首頁正常、WooCommerce 商品頁正常、Ultimate Member 登入正常
5. 確認通過 → 登入 production → 外掛 → 更新同 4 個
6. Production 更新後立即驗：前台首頁、後台登入、WooCommerce、UM 登入

---

## Wave 2 — 中風險（Wave 1 通過後下一個工作日）

| 外掛 | 當前版本 | 目標版本 | 風險 | 理由 |
|---|---|---|---|---|
| **kadence-blocks-pro** | 2.7.8 | 2.8.14 | medium | 落後 6 個 minor |
| **litespeed-cache** | 7.8.0.1 | 7.8.1 | medium | Cache layer；LiteSpeed 近期有 RCE CVE |
| **permalink-manager-pro** | 2.5.1.4 | 2.5.3.3 | medium | URL 重寫；壞掉=全站 URL 爆掉 — **慎重：staging 先驗** |
| **fluentform** | 6.1.20 | 6.2.2 | medium | 表單；資料保留風險 |
| **kadence-blocks** | 3.6.5 | 3.6.7 | low | Page builder blocks |

> ⚠️ **permalink-manager-pro 特別注意**：更新前先記錄 5 個關鍵頁的 URL，更新後逐一確認 URL 仍可訪問。若 URL 改變，立即回滾。

---

## Wave 3 — 低風險（可批次處理）

| 外掛 | 當前版本 | 目標版本 |
|---|---|---|
| akismet | 5.6 | 5.7 |
| cartflows | 3.0.0 | 3.0.1 |
| code-snippets | 3.9.5 | 3.9.6 |
| hostinger | 3.0.65 | 3.0.66 |
| seo-by-rank-math | 1.0.266.1 | 1.0.269 |
| google-site-kit | 1.174.0 | 1.178.0 |
| astra-portfolio | 1.13.1 | 1.13.4 |

---

## 主題更新

| 主題 | 當前 | 可用 | 建議 |
|---|---|---|---|
| Kadence | 1.3.6 | 1.4.5 | **staging 先測**（主題大版本可能改 CSS/JS；先備份 child theme）|

> **建議**：主題更新放在 Wave 3 之後獨立一次，確認沒有視覺破版再 production。

---

## 每次更新前後的 Gate

```
更新前：
  ☐ 確認今日備份存在（Hostinger 自動備份 或 手動 mysqldump）
  ☐ 在 staging 先更新

更新後（staging 驗收）：
  ☐ 後台可登入
  ☐ 首頁正常
  ☐ 關鍵頁面正常（預約、聯絡、藝術療法）
  ☐ WooCommerce 商品頁正常（2 個產品）
  ☐ Ultimate Member 登入流程正常
  ☐ 無 Fatal Error（後台右上角無錯誤提示）

僅通過才上 production。
```

---

## 不建議更新的外掛（謹慎）

| 外掛 | 原因 |
|---|---|
| fluent-booking / fluent-booking-pro | 無更新可用；預約核心，不主動升級 |
| fluent-crm, fluentformpro | 無更新可用；CRM 核心 |
| fluent-smtp | 無更新可用；寄信核心（壞掉=完全無法寄信） |
| um-* (全部子外掛) | 無更新可用；但 UM 生態系互相依賴，主外掛更新後須確認子外掛相容 |

---

> **Owner**: `projects/2026-011-existing-site-handover-soulful/DAY3_SECURITY_PATCH_PLAN.md`
> **依據**: `10_DISCOVERY.md` §外掛清單（Day 1 盤點 2026-05-08）
> **下一步**: Wave 1 更新完成後填入 WORKLOG.md 證據（外掛名 + 版本 + 驗收結果）
