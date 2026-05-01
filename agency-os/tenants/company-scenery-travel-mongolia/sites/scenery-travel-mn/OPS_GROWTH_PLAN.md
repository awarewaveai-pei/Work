# Ops and Growth Plan - scenery-travel-mn

## 維運節奏
- Daily：可用性（Uptime Kuma）、錯誤日誌、備份確認
- Weekly：安全更新（staging 先）、流量摘要、詢問表單正常
- Monthly：效能優化、外掛版本審查、流量/轉換報表、備份演練

## 行銷節奏
- SEO：
  - 目標關鍵字：Mongolia travel, Mongolia tour, Gobi Desert tour, Mongolian nomadic experience（EN）
  - 技術 SEO：Site speed、Mobile UX、Schema markup（TouristTrip）
  - 內容計畫：每月 1–2 篇行程/目的地文章
- Leads：詢問表單來源追蹤（UTM）、表單填寫漏斗
- 廣告：Phase 2（IG Ads 配合現有 Instagram 粉絲）

## 自動化節奏
- n8n 工作流：Phase 2（詢問表單 → email 通知 → CRM）
- 失敗重試與告警：Uptime Kuma → Ops Inbox → Slack `#infra-alerts`
- API 用量與成本：依實際整合後評估

## 成長里程碑（初估）
| 時間 | 目標 |
|------|------|
| 上線後 1 個月 | Organic 流量 > 0，詢問表單可用 |
| 上線後 3 個月 | 收到第一批有效詢問 |
| 上線後 6 個月 | SEO EN 關鍵字出現第 1–3 頁 |
| 上線後 1 年 | 多語系評估 + IG 廣告測試 |
