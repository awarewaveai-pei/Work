# System Requirements - soulfulexpression-org

> 待盤點（Day 1）：填寫欄位前請先執行 Runbook Pilot A §1.2 基線盤點。

## 角色與權限
- 管理者：Agency OS + Client（待確認是否共用帳號）
- 內部人員：待補
- 客戶端使用者：N/A（單一業主）
- 外部協作者：待補

## 核心模組（待 Day 1 盤點確認）
- 內容管理：WordPress CMS
- 會員/Portal：待確認
- 預約/工單/流程：待確認（Art Therapy 諮詢流程）
- 金流/捐款/銷售：待確認
- 報表與審計：待確認（Analytics 整合）

## 外部整合（待 Day 1 盤點確認）
- 第三方 Email 服務：待補
- 分析碼：待補
- Webhook / 自動化：待補

## 客製複雜度（初估）
- L2：商業流程整合（諮詢/預約路徑）

## 驗收標準
- 功能驗收：登入/首頁/核心互動正常
- 權限驗收：無共用帳號、無冗餘管理員
- 效能驗收：首頁 LCP < 4s
- 安全驗收：SSL 有效、WordPress/外掛無 critical 漏洞
