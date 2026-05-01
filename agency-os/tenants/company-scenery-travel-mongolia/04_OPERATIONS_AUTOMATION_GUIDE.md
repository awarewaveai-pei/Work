# Operations Automation Guide - Scenery Travel Mongolia

## 監控
- Uptime Kuma：上線後加入監控（production URL）
- Ops Inbox：接入 Uptime Kuma + 未來 Sentry（若有前端 JS 錯誤）

## 備份自動化
- 工具：UpdraftPlus 排程
- 頻率：每日增量、每週完整
- 儲存：cloud storage（Google Drive / S3 / Hostinger 提供的備份方案）
- 保留：30 天

## 通知流程
- 主機告警 → Uptime Kuma → Ops Inbox → Slack `#infra-alerts`
- 備份失敗 → UpdraftPlus email → Agency OS 主要聯絡人

## 未來自動化（Phase 2）
- 詢問表單 → n8n → CRM / Email 通知
- 月報自動生成（SEO + 流量 + 備份摘要）
