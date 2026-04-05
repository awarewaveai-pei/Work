

# Ecommerce Project Playbook (WooCommerce + Kadence)

## 0) 專案摘要（由 PM/客戶確認）
**Client:** <Company Name>  
**Project:** WooCommerce Ecommerce Website  
**Primary Goal:** <例如：上線可下單、可金流/物流、可SEO、可成長>  
**Target Launch Date:** <YYYY-MM-DD>  
**Markets:** <Taiwan / HK / US / etc>  
**Language/Currency:** <zh-TW / en / TWD / USD>

**Success Metrics**
- 付款成功率、結帳轉換率、頁面速度（Core Web Vitals）、SEO index、訂單處理時間

---

## 1) Scope 定義（避免開到爆）
### In Scope
- WooCommerce 商店架設（商品、分類、庫存、結帳）
- Kadence Theme + Kadence Blocks（版型/頁面）
- 必要外掛套件（wc-core + 選配包）
- 基本 SEO（RankMath）、基本追蹤（Site Kit/GA）
- SMTP 交易信（FluentSMTP）
- Staging → Production 上線流程
- 教學交付（handover）

### Out of Scope（需另報價）
- 進階 ERP/倉儲整合（除非明確列入）
- 客製 App / 客製後台大改
- 大量資料匯入、複雜會員制度、跨國稅務（除非明確列入）
- 長期代營運（可做成月費方案）

---

## 2) 我們的標準技術架構（Agency Stack）
### Frontend
- WordPress + Kadence Theme + Gutenberg + Kadence Blocks

### Ecommerce
- WooCommerce（核心）
- CartFlows（結帳/漏斗能力，必要時建立 flows）

### Backend/Infra（可選擴展）
- Supabase（會員/CRM/資料/向量庫，若做 SaaS/自動化延伸）
- n8n（訂單自動化、CRM、ERP/Email/Slack）
- Cloudflare（CDN/WAF/快取策略視主機）

### Hosting
- Hostinger / AWS / DO（依客戶預算與 SLA）
- 以 staging 驗證後再上 production

---

## 3) 專案環境（必備）
### Environments
- **Staging:** staging.<domain>（必須）
- **Production:** <domain>

### Golden Rule
- **Production 不做測試，不跑 install/activate/update/delete**
- 所有外掛、設定、流程先在 staging 驗證 0 錯誤再上線

---

## 4) 開案操作（從 0 到 1）
### 4.1 本機開案（只生成專案資料夾）
在 WSL/Cursor：
```bash
new-project <client> <project> clients wc-core
# 需要點數回饋加購：
new-project <client> <project> clients wc-core,wc-loyalty
# 客戶付費才加 CRM：
new-project <client> <project> clients wc-core,wc-crm

生成後會有：

README / docs / scripts / INSTALL.md（安裝指引）

不會碰任何線上站

4.2 建立 staging（Hostinger 例）

建子網域 staging.<domain>

指向新資料夾（由主機自動建立）

一鍵安裝全新 WordPress（staging）

SSH 登入 staging server

找到 WP_ROOT（含 wp-config.php 的資料夾）

4.3 在 staging 一鍵套用「wc-core」

只有 staging/new site 才能跑

manifests（對客／草案範例，執行期權威以 `lobster-factory/packages/manifests/` 為準）：`agency-os/platform-templates/woocommerce/manifests/`

installer（與龍蝦閘道實際路徑對齊；慣用為 `lobster-factory/templates/woocommerce/scripts/install-from-manifest.sh`）：`agency-os/platform-templates/woocommerce/scripts/install-from-manifest.sh`

在 staging server 執行（示意）：

./install-from-manifest.sh <WP_ROOT> wc-core.json

完成後 staging 具備：

Kadence theme 啟用

WooCommerce + CartFlows + RankMath + FluentSMTP + Site Kit

LiteSpeed Cache（偵測到 LiteSpeed 才裝）

5) 外掛策略（Packages）
wc-core（每案必裝）

kadence theme

woocommerce

cartflows

kadence-blocks

seo-by-rank-math

fluent-smtp

google-site-kit

litespeed-cache（conditional）

選配包（依需求/付費）

wc-loyalty：woocommerce-points-and-rewards（預設推薦加購）

wc-crm：fluent-crm + fluentform + newsletter + fluentformpro（付費才加）

wc-membership：ultimate member + addons（需要會員才加）

wc-facet：facetwp-*（大量商品篩選才加）

wc-ai：wordpress-mcp（sandbox/AI 串接才加）

6) 資訊收集（Discovery）— 我會問客戶什麼
產品與營運

商品數量、分類、變體、庫存管理方式

運送方式、物流廠商、運費規則

付款方式（信用卡/轉帳/第三方）、退款流程

發票/稅務需求（依地區）

行銷

SEO 目標頁/關鍵字、內容策略

GA4/GTM、Meta Pixel、轉換追蹤

EDM/CRM 是否要（若要→wc-crm）

權限與帳號

誰負責管理商品/訂單

需要多少角色（admin/shop manager/客服）

是否要會員制度（若要→wc-membership）

7) 建置流程（Build）
7.1 資料與內容

建立商品資料模板（CSV/Sheet）

分類、屬性（size/color/material）

付款/物流測試帳號

7.2 UI/頁面

首頁、分類頁、商品頁、結帳頁、條款/隱私

Kadence Blocks 組出版型與組件（可重用）

7.3 Checkout / Funnel

預設先不改 checkout（避免干擾）

需要提高轉換才建立 CartFlows Flow（A/B、upsell/downsell）

7.4 Email / SMTP

FluentSMTP 設定

測試：下單信、付款成功、取消、退款、通知

7.5 SEO / Tracking

RankMath setup wizard

Site Kit / GA4 / Search Console（依客戶權限流程）

8) 測試（QA）
必測清單

商品瀏覽/搜尋/篩選（若有 facet）

加入購物車

結帳（每種付款方式）

訂單狀態流轉（processing/completed/refunded）

Email 通知

手機版與速度（CWV）

權限與安全（管理員/店長/客服）

staging 驗證通過門檻

交易流程 0 blocker

Email 全部正常

基本 SEO 設定完成

速度達到可接受標準（依主機）

9) 上線（Launch）
上線前

staging 最終確認

備份（檔案 + DB）

DNS/SSL/Cloudflare（如有）

production 最小變更策略（避免大改）

上線後（48 小時）

監控訂單/付款/信件

速度/錯誤 log

熱修流程（回滾方案）

10) 交付（Handover）

交付內容：

管理員帳號與權限表

外掛清單 + 更新策略

備份策略

操作教學（商品、訂單、退貨、報表）

SOP 文件（客服/退貨/退款）

11) 維運與成長（Operate & Grow）
月維運（建議做成月費）

WP 核心/外掛更新（先 staging 再 production）

安全掃描 / WAF

備份驗證

SEO 月報、轉換優化

自動化（n8n：棄單、EDM、CRM、ERP）

Appendix: 絕對不要做的事（避免翻車）

在 production 直接安裝/更新一堆外掛

在 production 測試付款

不做備份就改 permalink/checkout

Pro 外掛沒授權就交付（後續更新會爆）