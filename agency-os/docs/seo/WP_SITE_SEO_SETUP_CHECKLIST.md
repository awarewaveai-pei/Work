# WordPress 網站 SEO 架站完整清單

> SSOT：本文件。根據 Google 官方 SEO 文件（`agency-os/docs/seo/1–6`）提煉。
> 每次佈建新 WordPress 客戶網站時逐項確認。

---

## Phase 1：WordPress 基礎設定（上線前必做）

### 1.1 永久連結（Permalink）

| 設定 | 正確值 | 錯誤範例 |
|------|--------|---------|
| 結構 | `/%postname%/` 或 `/%category%/%postname%/` | `/?p=123`、`/%year%/%month%/%day%/` |
| 分隔符 | 連字號 `-` | 底線 `_`、空格 |
| 大小寫 | 全小寫 | 大寫字母 |

> 根據：`3_檢索及建立索引.md` — Google 偏好描述性、以連字號分隔的 URL。

**操作**：Settings → Permalinks → Post name → Save Changes

---

### 1.2 HTTPS

- [ ] SSL 憑證已啟用（Cloudflare 或主機端）
- [ ] WordPress Address 及 Site Address 均為 `https://`
- [ ] `wp-config.php` 加入強制 HTTPS（如未透過 Cloudflare）：
  ```php
  define('FORCE_SSL_ADMIN', true);
  if (strpos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false) {
      $_SERVER['HTTPS'] = 'on';
  }
  ```
- [ ] HTTP → HTTPS 301 重新導向已設定（nginx / .htaccess）

---

### 1.3 Favicon（網站小圖示）

- [ ] 圖片為正方形（1:1 比例），**最小 48×48 px**，建議 512×512 px
- [ ] 上傳至 Appearance → Customize → Site Identity → Site Icon
- [ ] 使用穩定網址（不頻繁更換）
- [ ] 不含冒犯性符號

> 根據：`4_排名與搜尋外觀.md §定義要顯示在搜尋結果中的網站小圖示`

---

### 1.4 robots.txt

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap_index.xml
```

**禁止封鎖**：
- CSS / JS 檔案（Google 需要渲染頁面）
- 圖片資料夾（封鎖 = 圖片不被索引）
- 重要內容頁面

**建議封鎖**：
- `/wp-admin/`（但允許 `/wp-admin/admin-ajax.php`）
- 搜尋結果頁：`Disallow: /?s=`

> 不要用 robots.txt 阻止不想出現在搜尋的頁面 — 改用 `noindex` meta tag。

---

## Phase 2：RankMath 設定

### 2.1 RankMath 安裝與啟用

- [ ] 安裝 RankMath SEO 外掛
- [ ] 完成 Setup Wizard（選 Advanced 模式以獲完整功能）
- [ ] 連結 Google Search Console（Rank Math → General Settings → Webmaster Tools）
- [ ] 連結 Google Analytics 4（Rank Math → General Settings → Analytics）

---

### 2.2 General Settings

| 設定項目 | 建議值 |
|---------|--------|
| Attachment Pages | Redirect to parent post（避免 thin content 稀釋）|
| Link Redirect Redirection | 啟用（讓 RankMath 處理 301 重新導向）|
| Noindex Subpages of Archive | 依需求（分頁 `/page/2/` 是否 noindex）|
| Category Base | 移除或保留（依品牌風格，但全站一致）|
| Tag Base | 同上 |

---

### 2.3 Titles & Meta（全站預設模板）

**Homepage Title（首頁標題模板）：**
```
%sitename% - %tagline%
```

**Post Title（文章標題模板）：**
```
%title% | %sitename%
```
- 含主要關鍵字在前半段
- 50–60 字元（中文約 25–30 字）

**Category/Tag Archive Title：**
```
%term% Archives | %sitename%
```

**Meta Description（全站預設）：**
- 145–155 字元
- 含主要關鍵字
- 包含品牌名稱

---

### 2.4 Sitemap 設定

- [ ] Rank Math → Sitemap Settings → 啟用 XML Sitemap
- [ ] 確認 Posts / Pages / Categories 均已啟用
- [ ] 排除：Login 頁、Thank You 頁、管理頁
- [ ] Image Sitemap：啟用（幫助圖片被索引）
- [ ] Sitemap URL：`https://example.com/sitemap_index.xml`

---

### 2.5 Open Graph / Social

- [ ] Facebook Open Graph：啟用
- [ ] Default OG Image：上傳 1200×630 px（16:9）的品牌圖片
  - **不要**使用含大量文字的圖片（Google Discover 規則）
  - **不要**使用網站 Logo 作為預設 OG 圖
- [ ] Twitter Card：啟用，選 Summary Large Image
- [ ] OG:image 尺寸確認：**≥1200 px 寬**，16:9 比例，總像素 >30 萬

> 根據：`4_排名與搜尋外觀.md §Google 探索` — 圖片 ≥1200 px 寬，16:9，`max-image-preview:large`

---

### 2.6 Structured Data（Schema.org）

**每篇文章（Article/BlogPosting）**：

RankMath 自動加入，確認以下欄位：

- [ ] Schema Type：Article（或 BlogPosting）
- [ ] `datePublished`：文章發布日期
- [ ] `dateModified`：最後修改日期
- [ ] `author`：作者名稱（Author Schema 連結）
- [ ] `image`：必須提供圖片（才能顯示複合式結果）

> **關鍵規則**：結構化資料中的日期必須與頁面上顯示給使用者的日期一致。
> 根據：`4_排名與搜尋外觀.md §影響 Google 搜尋中的署名日期`

**網站層級 Organization Schema**：
- [ ] 在 RankMath → Titles & Meta → Global Meta → Knowledge Graph 設定：
  - Organization Name
  - Organization Logo URL（正方形，建議 512×512 px）
  - Social Profile URLs（Facebook / Instagram / LinkedIn）

**Breadcrumb Schema**：
- [ ] 啟用 BreadcrumbList（幫助搜尋結果顯示階層導覽）

---

### 2.7 每篇文章發布前的 RankMath 必填欄位

| 欄位 | 必填 | 說明 |
|------|------|------|
| Focus Keyword | ✅ | 主要關鍵字，由文章生成系統自動填入 |
| SEO Title | ✅ | 50–60 字元，關鍵字在前半段 |
| Meta Description | ✅ | 145–155 字元，含關鍵字 |
| OG Image | ✅ | 1200×630 px，16:9，無大量文字 |
| Schema Type | ✅ | Article 或 BlogPosting |
| Canonical URL | 按需 | 如有重複內容則設定 |

**目標分數：≥81（綠燈）**

---

## Phase 3：Google Search Console 設定

### 3.1 驗證網站擁有權

- [ ] 登入 Google Search Console
- [ ] 新增屬性：選 **Domain**（涵蓋 http/https、www/non-www）
- [ ] 透過 DNS TXT record 驗證（最全面）
- [ ] 或透過 RankMath 自動插入 meta 標記驗證

---

### 3.2 提交 Sitemap

- [ ] 進入 Search Console → Sitemaps
- [ ] 提交：`sitemap_index.xml`
- [ ] 確認狀態為「成功」
- [ ] 建議同時提交：
  - `post-sitemap.xml`（文章）
  - `page-sitemap.xml`（頁面）
  - `category-sitemap.xml`（分類）

---

### 3.3 持續監控

- [ ] 每週檢查：Coverage（索引涵蓋率）報告
- [ ] 每月檢查：Core Web Vitals 報告
- [ ] 定期監控：Performance → Queries（CTR、曝光次數）
- [ ] 設定 Email 通知（手動操作問題、安全問題）

---

## Phase 4：Core Web Vitals 優化

Google 的 Core Web Vitals 是排名信號。

| 指標 | 全名 | 目標值 | 說明 |
|------|------|--------|------|
| LCP | Largest Contentful Paint | ≤2.5 秒 | 主要內容載入速度 |
| FID/INP | Interaction to Next Paint | ≤200 ms | 互動回應速度 |
| CLS | Cumulative Layout Shift | ≤0.1 | 畫面穩定度 |

### 優化方法

**LCP 改善（圖片載入最重要）**：
- [ ] 首屏圖片加 `loading="eager"` 和 `fetchpriority="high"`（Kadence 主題設定）
- [ ] 使用 WebP 格式（WordPress 5.8+ 內建支援）
- [ ] 啟用主機端快取（WP Rocket / LiteSpeed Cache / Nginx FastCGI）
- [ ] 使用 CDN（Cloudflare）

**CLS 改善（版面位移）**：
- [ ] 所有 `<img>` 標籤必須明確指定 `width` 和 `height` 屬性
- [ ] 廣告、嵌入式內容預留固定空間
- [ ] 網頁字體使用 `font-display: swap`

**工具**：PageSpeed Insights（`pagespeed.web.dev`）、Search Console CWV 報告

---

## Phase 5：Mobile-First 設定

> Google 預設以行動裝置版本建立索引（Mobile-First Indexing）。
> 根據：`2_SEO基礎知識.md §行動裝置相容性`

- [ ] 使用回應式主題（Kadence 已符合）
- [ ] 行動裝置測試：Google Mobile-Friendly Test
- [ ] 確認行動版本的關鍵內容與桌機版一致（Google 以行動版為索引依據）
- [ ] 行動版字體 ≥16px
- [ ] 按鈕可點擊區域 ≥48×48 px
- [ ] 避免水平滾動

---

## Phase 6：多語系設定（若適用）

### hreflang 設定

若網站提供多種語言版本：

```html
<!-- 在 <head> 加入 -->
<link rel="alternate" hreflang="zh-TW" href="https://example.com/tw/article/" />
<link rel="alternate" hreflang="en"    href="https://example.com/en/article/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/en/article/" />
```

**或透過 RankMath 的 hreflang 設定自動插入**（需 RankMath Pro）

### URL 結構建議（多語系）

| 方式 | 範例 | 適用情境 |
|------|------|---------|
| ccTLD | `example.tw` | 強烈針對特定國家 |
| 子目錄 | `example.com/zh-tw/` | 一般多語系（建議）|
| 子網域 | `zh.example.com` | 技術資源受限時 |

> 根據：`6_網站專屬指南.md §多語言與國際化`

---

## Phase 7：圖片 SEO 規範（全站標準）

> 根據：`4_排名與搜尋外觀.md §Google 圖片搜尋引擎最佳化`

### 7.1 上傳圖片前

- [ ] **檔名**：`descriptive-words-with-hyphens.jpg`（小寫、連字號分隔、描述性）
  - ✅ `art-based-healing-workshop-taipei.jpg`
  - ❌ `IMG00023.JPG`、`image1.jpg`
- [ ] **格式**：WebP（首選）、JPEG、PNG
- [ ] **尺寸**：文章主圖 1280×720 px（16:9，Google Discover 合規）
- [ ] **檔案大小**：壓縮至 ≤200 KB（使用 Squoosh 或 ShortPixel）

### 7.2 在 WordPress 中

- [ ] **每張圖片必須填寫 Alt Text**
  - 描述圖片內容
  - 自然包含關鍵字（第一張圖）
  - 不濫填關鍵字
  - 範例：`藝術治療師帶領小組進行藝術表達療癒工作坊`
- [ ] 使用 `<img>` 元素（非 CSS background）— Kadence 預設符合
- [ ] 設定 `og:image`（透過 RankMath）

### 7.3 OG Image 規格（社群分享）

- 尺寸：1200×630 px（Facebook 最佳）
- 格式：JPG 或 PNG
- 不含大量文字（Google Discover 規則）
- 避免使用網站 Logo 作為 OG Image

---

## Phase 8：內部連結架構

> 根據：`3_檢索及建立索引.md §內部連結最佳做法`

### 規則

- [ ] 每篇文章至少有 **1 個以上的內部連結**指向它（保證可被爬取）
- [ ] 每篇文章至少包含 **2–3 個內部連結**指向相關文章
- [ ] 錨定文字（anchor text）**必須描述目標頁面內容**
  - ✅ `「了解[藝術表達療癒的科學基礎](相關頁面)」`
  - ❌ `「[點此](相關頁面)了解更多」`
  - ❌ `「[這篇文章](相關頁面)有更多資訊」`
- [ ] 重要樞紐頁（Pillar Pages）從多篇相關文章連入

### 錨定文字禁止清單

| 禁止 | 原因 |
|------|------|
| click here / 點此 | 無描述性，對 SEO 無價值 |
| here / 這裡 | 同上 |
| read more / 閱讀更多 | 同上 |
| this / 這個 | 模糊，Google 無法判斷目標主題 |

---

## Phase 9：重複內容與 Canonical 管理

> 根據：`2_SEO基礎知識.md §重複內容與標準化`

- [ ] 首頁只有一個 URL（www vs non-www — 選一個，另一個 301 重定向）
- [ ] 分頁不做 noindex（`/page/2/` 讓 Google 自行決定）
- [ ] 若有 `?utm_source=` 等追蹤參數，在 RankMath 或 Search Console 設定忽略參數
- [ ] 相似內容頁（如多個 landing page 指向同一服務）使用 canonical 標籤指向主版本
- [ ] 作者頁面、標籤頁面：若內容稀少考慮 noindex

---

## Phase 10：安全性與技術健康

- [ ] WordPress 保持最新版本
- [ ] 外掛保持最新版本（透過 MainWP 集中管理）
- [ ] 定期備份（透過 WPvivid）
- [ ] 確認 `wp-login.php` 有保護（LLAR 或 Cloudflare 存取規則）
- [ ] 確認沒有未使用的外掛（降低攻擊面）
- [ ] Wordfence 或同等安全外掛啟用

---

## 快速上線前檢查清單（Launch Checklist）

```
□ Permalink 結構設定為 /%postname%/
□ HTTPS 啟用且強制
□ Favicon 已設定（≥48×48 px 正方形）
□ robots.txt 正確（不封鎖 CSS/JS/圖片）
□ RankMath 已安裝並完成 Wizard
□ XML Sitemap 已啟用
□ Sitemap 已提交至 Google Search Console
□ Search Console 驗證完成
□ OG Image 已設定（1200×630 px，無文字 Logo）
□ Organization Schema 已填寫（Logo、社群連結）
□ datePublished/dateModified 隨文章自動更新
□ 行動版頁面正常顯示
□ 頁面速度基準線記錄（PageSpeed Insights 分數）
□ 第一篇文章 RankMath 分數 ≥81（綠燈）
□ Google Analytics 4 已連結
```

---

## 參考資料

| 文件 | 涵蓋主題 |
|------|---------|
| `1_搜尋基礎入門.md` | 技術要求、垃圾政策 |
| `2_SEO基礎知識.md` | E-E-A-T、GEO、行動裝置、HTTPS、CWV |
| `3_檢索及建立索引.md` | URL 結構、連結、Sitemap、robots.txt |
| `4_排名與搜尋外觀.md` | 結構化資料、署名日期、Discover 圖片、Favicon |
| `5_監控與偵錯.md` | Search Console、流量診斷 |
| `6_網站專屬指南.md` | 多語系 hreflang、分頁、電商 schema |

_最後更新：2026-06-14_
