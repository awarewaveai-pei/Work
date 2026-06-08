---
name: project_content_engine_ssot
description: AI SEO/GEO Content Engine 的 SSOT 是 docs/wp-kadence-ai-seo-geo-content-engine.md；MVP AI-first、無付費 SEO API
metadata: 
  node_type: memory
  type: project
  originSessionId: 72542877-9a42-4f4c-9040-81aa4bedfed3
---

代操/內容引擎產品的**單一真相來源**是 `d:\Work\docs\wp-kadence-ai-seo-geo-content-engine.md`（3920 行完整 AI SEO/GEO Content OS 產品規格，含 §36 的 10 張 DB 表、§37 四支 prompt、§38/§44 MVP 範圍、§39 五階段 roadmap）。

**Why:** 使用者想做「幫客戶代操行銷」。一度考慮移植 jonjonesai/templatized-jonops 的 .claude/skills（行銷/SEO/外展 agent），但那是弱版參考；使用者自己這份 spec 完整十倍，是真正藍圖。

**How to apply:**
- 建內容引擎一律照這份 spec 的 §38/§44 MVP，**不要**重新設計 schema 或繞回 JonOps（JonOps 只當 prompt 寫法參考）。
- **DataForSEO / Firecrawl / Semrush 不在 MVP** —— spec 自己把它們排 Phase 2「Should Have」/「Could Have」(§38.3, §39, §44)。MVP = 手動輸入關鍵字 + 全 AI（= 使用者選的 AI-first，2026-06-06 確認）。
- Phase 2 第一個接的是 **GSC（免費，§8.1 機會字挖掘）**，不是 DataForSEO。語意覆蓋率(§10.1)用「自建 TF-IDF 抓 SERP 前10 HTML」即可，不必買 Firecrawl。
- 社群排程層（Metricool 替代）→ **自架 Postiz**（開源 AGPL、31k stars、自處理 7 平台 OAuth），不從零刻、不用 Metricool/Airtable/Sendy。Email 走 Resend MCP；出圖走 Replicate/Canva MCP。
- 發佈走 draft-first + 人審(§31/§42)；wp-bridge (`aware-wave-wp-bridge.php`，目前只有 /health + /option) 之後加 `/posts` route，Phase 1 POC 可先用 WP-CLI/MainWP。
- 試點客戶：soulful（company-soulful-expression）。

相關：[[project_app_aware_wave_master_plan]] [[reference_aware_wave_credentials]]
