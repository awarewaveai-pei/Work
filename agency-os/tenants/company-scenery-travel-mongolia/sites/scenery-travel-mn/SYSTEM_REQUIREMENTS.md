# System Requirements - scenery-travel-mn

## 角色與權限
- 管理者：Agency OS + Client（Client 僅讀內容，Agency OS 管技術）
- 內部人員：Agency OS operator
- 客戶端使用者：Scenery Travel Mongolia 業主（內容更新）
- 外部協作者：待補（攝影師、導遊聯絡？）

## 核心模組（Phase 1）
- 內容管理：WordPress CMS（English 主）
- 會員/Portal：N/A（Phase 1）
- 預約/詢問：Contact/Inquiry Form（WPForms / Gravity Forms）
- 金流：N/A（Phase 1，詢問為主）
- 報表：GA4 / PostHog（analytics）

## 頁面架構（最小可上線）
- 首頁（Hero + Destination + CTA）
- 行程/套裝頁（至少 2–3 個）
- 聯絡/詢問頁（含表單）
- 關於我們頁
- 隱私政策頁（必要合規）
- 取消/退款政策頁（必要合規）

## 外部整合計畫
| 服務 | 用途 | Phase |
|------|------|-------|
| WPForms / Gravity Forms | 詢問表單 | Phase 1 |
| GA4 / PostHog | 流量分析 | Phase 1 |
| UpdraftPlus | 自動備份 | Phase 1 |
| Instagram embed | 社群展示 | Phase 2（選用）|
| 多語系（WPML / Polylang） | ZH + 蒙古語 | Phase 2 |
| OTA / 訂房 | 旅程預訂 | Phase 3（排除 Phase 1）|

## 客製複雜度
- L1–L2：一般網站 + 詢問表單流程

## 驗收標準
- 功能驗收：首頁/行程頁/詢問表單可用
- 權限驗收：admin 帳號不共用，MFA 啟用
- 效能驗收：首頁 LCP < 4s（行動裝置）
- 安全驗收：SSL 有效、WP/外掛無 critical 漏洞
- 法遵驗收：隱私政策 + 取消政策頁面存在
