# WP Kadence AI SEO/GEO Content Engine 

> 文件用途：丟給 AI / 開發代理 / Cursor / Claude / ChatGPT / 產品團隊，作為完整產品規格、功能需求、內容生成規則與開發藍圖。  
> 產品名稱暫定：WP Kadence AI SEO/GEO Content Engine  
> 目標：打造一套專為 WordPress + Kadence 網站設計的 AI SEO/GEO 內容系統，自動找主題、生成文章、圖片、短影片、FAQ、schema、Kadence-friendly 版型，並追蹤 Google Search 與 AI 搜尋能見度。  
> 語言：英文和繁體中文為主，需支援多語言。  
> 重要原則：不做垃圾自動產文；不承諾保證排名；不承諾保證 AI 推薦；目標是提升 Google 搜尋、AI 搜尋、GEO、品牌 entity、主題權威與轉換率。  
>
 

---

## 0. 給 AI 的任務指令

你是一位資深 SaaS 產品經理、SEO/GEO strategist、WordPress/Kadence 架構師、內容系統設計師與全端工程顧問。

請根據本文件，協助規劃、設計或開發一套：

```text
WordPress Kadence 專用的 AI SEO/GEO Content Intelligence & Publishing System
```

系統必須能做到：

```text
自動找主題
自動分析搜尋意圖
自動分析競品內容缺口
自動產生 SEO/GEO content brief
自動生成完整文章
自動生成圖片 prompt、alt、caption
自動生成短影片腳本、分鏡、字幕與 transcript
自動生成 FAQ 與 FAQPage schema
自動生成 Article、Breadcrumb、VideoObject、ImageObject、Organization、Person、LocalBusiness、Course、Product 等 schema
自動串連 Schema Linked Data Graph（@id 節點互連）
自動評估 NLP 語意覆蓋率並補強不足段落
自動產生 YMYL 專家審閱區塊與 reviewedBy schema
自動生成 Citation Box Block 供 AI 爬蟲引用
自動輸出 WordPress / Kadence-friendly content
自動發布為 WordPress draft
發布後自動呼叫 Google Indexing API 極速推送收錄
聯盟行銷頁面自動串接 Live Pricing API 動態更新價格
自動追蹤 GSC、GA4、ranking、CTR、AI visibility
自動提出舊文更新建議
```

但系統必須避免：

```text
大量低品質 AI 內容
keyword stuffing
doorway pages
重複內容
未審核自動發布
偽造作者資歷
偽造評論
偽造媒體報導
schema 標記頁面不可見內容
宣稱保證排名
宣稱保證 AI 推薦
```

---

## 1. 產品一句話

一個專為 WordPress Kadence 打造的 AI SEO/GEO 內容作業系統：

```text
自動找出值得寫的主題，
分析 Google 搜尋與 AI 搜尋需求，
生成高品質 SEO/GEO 文章、圖片、短影片、FAQ、schema 與 Kadence-friendly 版型，
發布成 WordPress 草稿，
並持續追蹤 Google 與 AI 搜尋是否真的看見、引用或推薦品牌。
```

---

## 2. 產品定位

本產品不是普通的 AI 文章產生器。

本產品是：

```text
AI SEO/GEO Content Operating System for WordPress Kadence
```

核心價值：

```text
不是「產很多文章」
而是「建立能被搜尋、理解、引用、推薦與轉換的內容資產」
```

產品必須同時服務四個目標：

| 目標 | 說明 |
|---|---|
| SEO | 提升 Google/Bing 等搜尋引擎可見度 |
| GEO | 提升 AI 搜尋、AI Overview、AI Mode、ChatGPT、Perplexity、Gemini 等引用與推薦機率 |
| UX | 讓真人使用者快速理解、比較、信任、行動 |
| Conversion | 導向訂閱、預約、報名、購買、詢問或加入名單 |

---

## 3. 產品不可違反的原則

### 3.1 不承諾保證排名

禁止文案：

```text
保證 Google 第一名
保證 AI 推薦
保證 ChatGPT 引用
保證流量暴增
```

建議文案：

```text
提升 AI Citation Readiness
提升 AI First-Pick Readiness
提升 GEO Score
提升 Google Search Visibility
提升品牌 entity 一致性
提升內容可理解度與可引用度
```

### 3.2 不做垃圾自動產文

系統不得設計為：

```text
輸入 1000 個關鍵字
直接生成 1000 篇相似文章
自動發布
只為操縱搜尋排名或 AI 回答
```

安全做法：

```text
AI 產生 brief
AI 產生 draft
AI 產生 schema
AI 產生圖片與影片素材
AI 產生 SEO/GEO score
但正式發布前預設需要人工審核
```

### 3.3 內容必須有真實價值

每篇文章必須至少提供以下一種價值：

```text
第一手經驗
專業觀點
案例
比較
方法論
數據
表格
工具
步驟
FAQ
在地資訊
產品/課程/服務細節
可行動建議
```

禁止只有：

```text
網路上已有內容的改寫
泛泛而談
無來源
無案例
無觀點
無品牌差異
無使用者下一步
```

---

## 4. 參考競品方向

### 4.1 SEO Writing AI 類型工具

可參考功能：

```text
一鍵產生 SEO 文章
批次產文
WordPress auto-post
AI images
SEO title
outline
meta description
NLP keywords
affiliate article
product roundup
review article
多語言內容
```

本產品差異化：

```text
Kadence-native / Kadence-friendly layout
更強的資料來源
更強的 GEO scoring
更強的 AI visibility tracking
更強的 quality gate
更強的品牌知識庫
更強的 content refresh
更強的 topic cluster
更強的 WordPress site integration
```

### 4.2 Semrush 類型工具

可參考功能：

```text
keyword intelligence
competitor intelligence
domain analysis
content gap
keyword difficulty
search volume
position tracking
site audit
AI visibility tracking
brand mention tracking
```

本產品應把 Semrush 類工具視為：

```text
資料層
策略層
分析層
成效追蹤層
```

而不是只當產文工具。

---

## 5. 目標使用者

### 5.1 個人品牌

例如：

```text
藝術老師
線上課程老師
顧問
教練
創作者
小型工作室
手作品牌
設計師
攝影師
自由工作者
```

需求：

```text
想被 Google 搜尋到
想被 AI 搜尋推薦
想持續產內容但沒時間寫
想讓文章帶來預約、報名、詢問
不懂 SEO 技術
用 WordPress + Kadence 架站
```

### 5.2 WordPress 站長

需求：

```text
自動產生 WordPress 草稿
自動設定 title、slug、excerpt、category、tags、featured image
自動加入 schema
自動產生圖片 alt text
自動內鏈
自動排程
自動更新舊文章
```

### 5.3 SEO Agency

需求：

```text
管理多個網站
批次產生 content brief
批次產生 draft
人工審稿流程
客戶報告
AI visibility tracking
keyword tracking
content refresh
```

### 5.4 Affiliate / Review 網站

需求：

```text
產品比較文
Best X 推薦文
Product review
Pros / Cons
比較表
CTA buttons
Review schema
Product schema
自動更新價格與規格
```

---

## 6. 系統總架構

```text
[Data Sources]
Google Search Console
Google Trends
Semrush / SEO Data Provider
SERP API
GA4
WordPress Existing Content
Competitor URLs
People Also Ask
Google Autocomplete
YouTube / Reddit / Social Signals
Brand Knowledge Base

        ↓

[Topic Discovery Engine]
keyword mining
question mining
trend mining
competitor gap mining
GSC opportunity mining
content refresh mining

        ↓

[Opportunity Scoring Engine]
search volume
trend growth
keyword difficulty
CPC
intent
SERP features
site authority match
internal link support
AI visibility potential
conversion potential

        ↓

[Content Strategy Engine]
pillar / cluster planning
content type selection
intent mapping
template selection
brief generation

        ↓

[AI Content Generator]
title
outline
direct answer
article
tables
lists
quotes
FAQ
CTA
image prompts
video scripts
schema

        ↓

[Quality Gate]
SEO score
GEO score
AI First-Pick Readiness
factuality check
originality check
brand consistency check
schema validation
spam risk check

        ↓

[Kadence / WordPress Output]
Gutenberg HTML
Kadence-friendly blocks
media upload
metadata
draft creation
schedule

        ↓

[Performance Feedback Loop]
GSC
GA4
ranking
CTR
AI visibility
brand mention
refresh suggestions
```

---

## 7. 核心模組

| 模組 | 功能 | 優先級 |
|---|---|---|
| Project Setup | 建立專案、網站、語言、品牌資料 | P0 |
| Brand Knowledge Base | 品牌、作者、服務、價格、地點、案例、禁用聲明 | P0 |
| Topic Discovery | 自動找主題與問題 | P0 |
| Keyword Intelligence | 搜尋量、KD、CPC、intent、trend | P0 |
| SERP Analyzer | 分析前 10 名內容結構與缺口 | P1 |
| Content Brief Generator | 產生 SEO/GEO brief | P0 |
| Article Generator | 產生文章 | P0 |
| FAQ Module | 產生、分類、評分、schema | P0 |
| Schema Generator | 產生 JSON-LD | P0 |
| Image Generator | 圖片 prompt、alt、caption | P1 |
| Short Video Generator | 短影片腳本、分鏡、字幕、transcript | P2 |
| Kadence Builder | Kadence-friendly layout | P1 |
| WP Publisher | 發布 WordPress draft | P0 |
| Quality Gate | SEO/GEO/AI/Spam/Factuality | P0 |
| Internal Link Engine | 自動推薦內鏈 | P1 |
| Content Refresh Engine | 舊文更新建議 | P1 |
| AI Visibility Tracker | AI 搜尋提及與引用追蹤 | P2 |
| NLP Semantic Coverage | 語意詞覆蓋率分析與補強 | P1 |
| Schema Graph Builder | @id Linked Data Graph 串連 | P1 |
| Expert Review System | YMYL 專家審閱 UI + reviewedBy schema | P2 |
| Citation Box Builder | AI 爬蟲專用引用來源區塊 | P2 |
| Live Pricing Engine | Amazon PAAPI / WooCommerce 動態價格 | P3 |
| Google Indexing API | 發布後極速推送 URL 收錄 | P2 |
| Agency Dashboard | 多網站、多客戶、多報告 | P3 |

---

## 8. 資料來源

### 8.1 Google Search Console

用途：

```text
找 impression 高但 CTR 低的 query
找平均排名 5–20 的機會字
找排名下滑文章
找長尾問題
找頁面 cannibalization
找舊文更新機會
```

應抓欄位：

```text
query
page
clicks
impressions
ctr
average_position
country
device
date
```

GSC 機會字規則：

```text
High Opportunity Keyword =
impressions > 500
AND average_position BETWEEN 5 AND 20
AND ctr < expected_ctr_by_position
```

### 8.2 Google Trends

用途：

```text
找上升主題
找季節性
找地區熱度
比較主題
找 breakout queries
```

注意：

```text
Google Trends 是相對熱度，不是絕對搜尋量。
必須搭配 GSC、Semrush、Keyword Planner 或 SERP data。
```

### 8.3 Semrush / SEO Data Provider

用途：

```text
keyword volume
keyword difficulty
CPC
competition
intent
SERP features
related keywords
phrase questions
competitor organic keywords
domain authority signal
content gap
ranking tracking
AI visibility
```

### 8.4 SERP API

用途：

```text
取得前 10 名頁面
分析 title
分析 meta description
分析 H1/H2/H3
檢查是否有 FAQ
檢查是否有 table
檢查是否有 video
檢查是否有 image
檢查 schema
找內容缺口
```

### 8.5 WordPress Existing Content

用途：

```text
讀取站內文章
找內鏈機會
找重複內容
找 pillar page
找 cluster article
找需要更新的舊文
找 category/tag 結構
```

### 8.6 Brand Knowledge Base

這是讓 AI 內容不亂寫的核心。

必須包含：

```json
{
  "brand_name": "",
  "alternate_names": [],
  "website": "",
  "logo": "",
  "founder_name": "",
  "author_bio": "",
  "credentials": [],
  "services": [],
  "products": [],
  "courses": [],
  "locations": [],
  "pricing": [],
  "case_studies": [],
  "testimonials": [],
  "brand_voice": "",
  "preferred_cta": [],
  "forbidden_claims": [],
  "external_profiles": [],
  "same_as": []
}
```

規則：

```text
AI 不得自行發明品牌資訊
AI 不得自行發明作者資歷
AI 不得自行發明價格
AI 不得自行發明評論
AI 不得自行發明媒體報導
不確定就標記為 needs_review
```

---

## 9. Topic Discovery Engine

### 9.1 輸入

```json
{
  "seed_keyword": "水彩課程",
  "website_url": "https://example.com",
  "country": "TW",
  "language": "zh-TW",
  "target_audience": "成人初學者",
  "business_goal": "課程報名",
  "competitors": []
}
```

### 9.2 輸出

```json
{
  "topics": [
    {
      "topic": "初學者如何選水彩課程",
      "primary_keyword": "水彩課程 初學者",
      "secondary_keywords": [
        "水彩課程推薦",
        "線上水彩課",
        "實體水彩課",
        "水彩課程費用"
      ],
      "questions": [
        "初學者適合上水彩課嗎？",
        "線上水彩課和實體水彩課差在哪？"
      ],
      "intent": "commercial",
      "funnel_stage": "MOFU",
      "recommended_template": "comparison_guide",
      "opportunity_score": 86,
      "ai_visibility_potential": 82
    }
  ]
}
```

---

## 10. Opportunity Score

```text
Opportunity Score =
(Search Volume Score * 0.15)
+ (Trend Growth Score * 0.10)
+ (Commercial Value Score * 0.15)
+ (Intent Match Score * 0.15)
+ (Content Gap Score * 0.15)
+ (Site Authority Match Score * 0.10)
+ (Internal Link Support Score * 0.10)
+ (AI Citation Potential Score * 0.10)
- (Competition Difficulty Score * 0.10)
- (Cannibalization Risk * 0.10)
```

| 分數 | 說明 |
|---|---|
| Search Volume Score | 搜尋需求 |
| Trend Growth Score | 趨勢成長 |
| Commercial Value Score | 商業價值 |
| Intent Match Score | 是否符合網站目標 |
| Content Gap Score | 競品內容缺口 |
| Site Authority Match | 站內是否已有主題權威 |
| Internal Link Support | 是否有內鏈支援 |
| AI Citation Potential | 是否適合被 AI 摘要或推薦 |
| Competition Difficulty | 競爭難度 |
| Cannibalization Risk | 是否會和舊文互相競爭 |

### 10.1 NLP 語意覆蓋率評分（Semantic Coverage Score）

文章不只要包含主關鍵字，還必須自然涵蓋 SERP 前 10 名競品的高頻語意詞彙（LSI / TF-IDF），才能讓 Google 與 AI 搜尋系統理解文章的語意深度。

#### 執行流程

```text
1. 取得目標關鍵字的 SERP 前 10 名頁面內容
2. 萃取高頻語意詞彙（LSI 詞 + TF-IDF 關鍵詞）
3. 計算文章草稿對這些詞的覆蓋率
4. 輸出 Semantic Coverage Score（0–100）
5. 低於閾值（建議 75）→ 退回 AI 補寫對應段落
```

#### 可整合工具

```text
SurferSEO API：直接取得語意詞分析結果
NeuronWriter API：競品語意詞與 NLP 覆蓋分析
DataForSEO NLP API：自建語意詞提取
自建 TF-IDF 引擎（抓 SERP 前 10 HTML → 提取詞頻）
```

#### DB 欄位（加入 articles 表）

```sql
ALTER TABLE articles ADD COLUMN semantic_coverage_score NUMERIC DEFAULT 0;
ALTER TABLE articles ADD COLUMN semantic_gap_terms JSONB;
-- semantic_gap_terms: 文章目前缺少、但競品有的語意詞清單
ALTER TABLE articles ADD COLUMN semantic_analysis_at TIMESTAMP;
```

#### Semantic Coverage Gate

```markdown
- [ ] Semantic Coverage Score 是否達到 75 以上？
- [ ] 是否有明顯缺漏的核心語意詞？
- [ ] 缺漏詞是否已自然補入對應段落，而非硬塞？
- [ ] 補入後文章語意是否仍自然流暢？
```

---

## 11. Search Intent Specification

Search intent 是 SEO/GEO 最重要的判斷點之一。

### 11.1 Intent 類型

| Intent | 使用者想要 | 推薦內容 |
|---|---|---|
| Know | 了解概念 | 定義、解釋、FAQ |
| Know Simple | 快速答案 | Direct Answer |
| Do | 完成任務 | How-to、步驟 |
| Buy | 購買、報名 | 價格、比較、CTA |
| Compare | 比較選項 | X vs Y、表格 |
| Local | 找附近服務 | 在地頁、地圖、交通 |
| Trust | 確認可信度 | 作者、案例、評論 |
| Troubleshooting | 解決問題 | 問題原因、解法 |
| Recommendation | 想被推薦 | Best X、評選標準 |

### 11.2 Intent Coverage Checklist

每篇文章必須回答：

```markdown
- [ ] 使用者現在最想知道什麼？
- [ ] 使用者下一步可能想做什麼？
- [ ] 使用者需要比較哪些選項？
- [ ] 使用者有哪些疑慮？
- [ ] 使用者需要價格嗎？
- [ ] 使用者需要地點嗎？
- [ ] 使用者需要流程嗎？
- [ ] 使用者需要案例或證據嗎？
- [ ] 使用者讀完後應該採取什麼行動？
```

---

## 12. 內容模板

### 12.1 How-to Guide 教學文

```text
H1: 如何做 X：完整教學
Intro: 直接回答
Key Takeaways
TOC
H2: X 是什麼
H2: 你需要準備什麼
H2: 步驟 1
H2: 步驟 2
H2: 步驟 3
H2: 常見錯誤
H2: 推薦工具
H2: FAQ
Conclusion
CTA
```

### 12.2 Best X 推薦清單文

```text
H1: 2026 最推薦的 X
Intro: 直接給最佳選擇
Comparison Table
How We Chose
Top Picks
Detailed Reviews
Pros / Cons
Who It Is Best For
How to Choose
FAQ
Conclusion
CTA
```

### 12.3 X vs Y 比較文

```text
H1: X vs Y：哪個比較適合你？
Intro: 直接結論
Quick Comparison Table
H2: X 是什麼
H2: Y 是什麼
H2: 主要差異
H2: 價格比較
H2: 適合對象比較
H2: 優缺點
H2: 最終建議
FAQ
CTA
```

### 12.4 Review 評測文

```text
H1: X 評測：值得買嗎？
Intro: 直接結論
Rating Summary
Pros / Cons
Who Should Buy
Who Should Not Buy
Features
Hands-on Experience
Comparison
FAQ
Conclusion
CTA
```

### 12.5 Local SEO Page 在地服務頁

```text
H1: 地區 + 服務
Intro: 地區與服務直接答案
Service Overview
Why Choose Us
Location / Area Served
Pricing
Process
Testimonials
Map / Transportation
FAQ
Booking CTA
LocalBusiness Schema
```

### 12.6 Course / Class Landing Page 課程頁

```text
H1: 課程名稱 + 適合對象
Intro: 課程適合誰
Course Outcome
Who This Is For
What You Will Learn
Course Structure
Teacher / Author Experience
Student Works
Pricing
Schedule
FAQ
CTA
Course Schema
```

### 12.7 Pillar Page 主題權威頁

```text
H1: X 完整指南
Intro
Topic Map
Chapter 1
Chapter 2
Chapter 3
Related Cluster Articles
FAQ
Conclusion
CTA
```

### 12.8 Supporting Cluster Article 衛星文章

```text
H1: 具體長尾問題
Direct Answer
Detailed Explanation
Examples
Related Internal Links
FAQ
CTA
```

---

## 13. Content Brief Generator

### 13.1 Brief 輸出格式

```yaml
content_brief:
  project_id: ""
  topic: ""
  primary_keyword: ""
  secondary_keywords: []
  language: "zh-TW"
  country: "TW"
  target_audience: ""
  search_intent: ""
  funnel_stage: ""
  recommended_template: ""
  target_word_count: 1800
  seo_title_candidates: []
  h1_candidates: []
  meta_description_candidates: []
  slug_candidates: []
  direct_answer: ""
  key_takeaways: []
  outline:
    - h2: ""
      h3: []
      required_points: []
      media_needed: true
  required_tables: []
  required_lists: []
  required_quotes: []
  faq_questions: []
  internal_link_targets: []
  external_reference_suggestions: []
  schema_plan: []
  image_plan: []
  video_plan: []
  cta:
    primary: ""
    secondary: ""
  geo_requirements:
    direct_answer: true
    comparison_table: true
    entity_summary: true
    author_experience: true
    freshness_note: true
```

---

## 14. Article Generator

### 14.1 輸入

```json
{
  "brief_id": "brief_001",
  "brand_profile_id": "brand_001",
  "tone": "professional, friendly, practical",
  "language": "zh-TW",
  "article_type": "comparison_guide",
  "target_word_count": 2200,
  "include_images": true,
  "include_video_script": true,
  "include_schema": true,
  "kadence_output": true
}
```

### 14.2 輸出

```json
{
  "title": "",
  "seo_title": "",
  "meta_description": "",
  "slug": "",
  "excerpt": "",
  "content_markdown": "",
  "content_html": "",
  "kadence_blocks": "",
  "faq": [],
  "schema_json_ld": {},
  "image_assets": [],
  "video_script": {},
  "internal_links": [],
  "quality_scores": {
    "seo_score": 0,
    "geo_score": 0,
    "ai_first_pick_readiness": 0,
    "helpfulness_score": 0,
    "eeat_score": 0,
    "readability_score": 0,
    "spam_risk_score": 0
  }
}
```

---

## 15. 文章標準結構

每篇文章建議包含：

```text
H1
Direct Answer
Key Takeaways
TOC
Main Content
Tables
Lists
Quote / Expert Note
Images
Internal Links
FAQ
Conclusion
CTA
Schema
```

### 15.1 Direct Answer Block

文章開頭必須有 80–150 字直接答案。

```markdown
## 快速答案

如果你是初學者，最適合的水彩課程通常不是技巧最多的課，而是能讓你從工具、基礎筆法、色彩控制到完成作品一步步練習的課程。選課時應優先看老師是否有完整教學流程、作品範例、學生回饋與適合初學者的練習設計。
```

### 15.2 Key Takeaways

```markdown
## 重點整理

- 初學者應選擇有清楚步驟與練習設計的課程。
- 課程費用不應只看單堂價格，也要看材料、作品完成度與課後支援。
- 線上課適合時間彈性的人；實體課適合需要老師現場修正的人。
- 選擇課程前，建議先確認老師作品風格是否符合你想學的方向。
```

### 15.3 Comparison Table

```markdown
| 比較項目 | 線上水彩課 | 實體水彩課 |
|---|---|---|
| 時間彈性 | 高 | 中 |
| 老師即時修正 | 低 | 高 |
| 適合對象 | 自律學習者 | 初學者、需要陪伴者 |
| 費用 | 通常較低 | 通常較高 |
| 學習速度 | 依個人安排 | 跟隨課程節奏 |
```

### 15.4 Quote Block

```markdown
> 專家建議：初學者不要一開始追求複雜技巧，先學會控制水量、顏色濃度與基本筆觸，會比買很多材料更重要。
```

### 15.5 Citation Box Block（AI 爬蟲引用區塊）

Citation Box 是專門設計給 ChatGPT、Perplexity、Google AI Mode 等 AI 爬蟲看的引用來源彙整區塊，目的是提高 AI 引用本站內容時的來源可信度與準確性。

#### 設計原則

```text
放在文章末尾，緊接在 FAQ 之後、CTA 之前
彙整文章中引用的數據來源、研究報告、官方資料
每條來源包含：說明文字 + 完整 URL（可爬取）
Kadence 以 Info Box 或 Custom HTML Block 實作
```

#### Markdown 範本

```markdown
## 資料來源與參考文獻

本文內容依據以下資料整理：

- 台灣視覺藝術教育協會 2025 課程調查報告：https://example.org/survey-2025
- Google Trends 水彩課程搜尋趨勢（2024–2026）：https://trends.google.com/...
- 作者教學紀錄與學生作品回饋（2019–2026）
```

#### Kadence HTML 輸出範本

```html
<!-- wp:kadence/infobox {"uniqueID":"citation-box"} -->
<div class="wp-block-kadence-infobox citation-box" aria-label="資料來源與參考文獻">
  <h3>資料來源與參考文獻</h3>
  <ul>
    <li><a href="https://example.org/survey-2025" rel="noopener noreferrer">台灣視覺藝術教育協會 2025 課程調查報告</a></li>
    <li><a href="https://trends.google.com/..." rel="noopener noreferrer">Google Trends 水彩課程搜尋趨勢（2024–2026）</a></li>
    <li>作者教學紀錄與學生作品回饋（2019–2026）</li>
  </ul>
</div>
<!-- /wp:kadence/infobox -->
```

#### Citation Box Quality Gate

```markdown
- [ ] 是否只引用文章中實際使用的資料？
- [ ] 所有 URL 是否有效且可公開存取？
- [ ] 是否避免引用不可信來源（論壇、未知部落格）？
- [ ] 是否有 aria-label 供無障礙閱讀？
- [ ] 是否未包含任何商業廣告或聯盟連結？
```

---

## 16. SEO Metadata Specification

每篇文章必須產生：

```yaml
seo_metadata:
  seo_title: ""
  meta_description: ""
  slug: ""
  focus_keyword: ""
  secondary_keywords: []
  canonical_url: ""
  robots:
    index: true
    follow: true
  og_title: ""
  og_description: ""
  og_image: ""
  twitter_title: ""
  twitter_description: ""
  twitter_image: ""
```

### 16.1 SEO Title 規則

```text
包含主要搜尋意圖
包含主要關鍵字
具體
不誇大
不 keyword stuffing
建議 50–60 字元附近
```

### 16.2 Meta Description 規則

```text
說明使用者問題
說明內容涵蓋範圍
說明讀者會得到什麼
可加入溫和 CTA
建議 120–160 字元附近
```

---

## 17. FAQ Special Specification

FAQ 是本產品的特殊內容模組，不應只被視為文章尾端的問答區，而應同時服務四個目的：

```text
幫助使用者快速找到答案
幫助搜尋引擎理解頁面涵蓋的問題
幫助 AI 搜尋系統抽取清楚的 Q&A
支援內鏈、轉換與內容更新
```

注意：

```text
FAQ 不應被設計成保證提升 Google FAQ rich result CTR 的工具。
FAQ 應被設計成使用者體驗 + 內容理解 + AI 引用 readiness 模組。
```

### 17.1 FAQ 模組定位

| 層級 | 名稱 | 用途 |
|---|---|---|
| Level 1 | User FAQ | 給使用者看的問答內容 |
| Level 2 | GEO FAQ | 給 AI 容易抽取、摘要、引用的問答 |
| Level 3 | Schema FAQ | 給搜尋引擎理解的 FAQPage JSON-LD |

FAQ 的主要價值：

```text
不是保證 rich result
而是提高問題覆蓋、語意清楚度、AI 摘要可讀性與轉換率
```

### 17.2 FAQ 來源

| 來源 | 用途 |
|---|---|
| Google Search Console queries | 找實際帶來曝光的問題 |
| People Also Ask | 找搜尋者常問問題 |
| Google Autocomplete | 找長尾問題 |
| Semrush / SEO data provider | 找 question keywords |
| SERP competitor FAQ | 找競品有回答但本站缺少的問題 |
| 站內搜尋紀錄 | 找使用者真正搜尋的問題 |
| 客服 / Email / DM | 找轉換前疑慮 |
| Sales call notes | 找購買前問題 |
| Product / Course comments | 找真實痛點 |
| AI visibility prompts | 找 AI 經常回答的問題類型 |

### 17.3 FAQ 分類

| 類型 | 說明 | 範例 |
|---|---|---|
| Definition | 定義型問題 | 水彩課程是什麼？ |
| Comparison | 比較型問題 | 線上水彩課和實體水彩課哪個好？ |
| Pricing | 價格型問題 | 水彩課程通常多少錢？ |
| Suitability | 適合對象 | 初學者適合上水彩課嗎？ |
| Process | 流程型問題 | 報名後會怎麼上課？ |
| Tool / Material | 工具材料 | 初學者需要買哪些水彩工具？ |
| Location | 地區型問題 | 台北有推薦的水彩課嗎？ |
| Trust | 信任型問題 | 老師有教學經驗嗎？ |
| Objection | 反對意見處理 | 沒有繪畫基礎可以學嗎？ |
| Conversion | 轉換型問題 | 可以先體驗再報名嗎？ |

### 17.4 FAQ 數量規格

| 文章類型 | 建議 FAQ 數量 |
|---|---:|
| 短篇知識文 | 3–5 題 |
| 一般 SEO 文章 | 5–8 題 |
| 推薦清單文 | 6–10 題 |
| 比較文 | 6–10 題 |
| 在地服務頁 | 8–12 題 |
| 課程 / 產品頁 | 8–15 題 |
| Pillar Page | 10–20 題 |

每個 FAQ 答案建議：

```text
40–120 字
直接回答問題
不要繞圈
不要 keyword stuffing
不要塞無關 CTA
必要時加入內鏈
必要時標示依情況而定
```

### 17.5 FAQ 問題格式規則

好的問題：

```text
初學者適合上水彩課嗎？
線上水彩課和實體水彩課差在哪？
水彩課程通常需要準備哪些工具？
沒有畫畫基礎可以學水彩嗎？
```

不好的問題：

```text
水彩課程 水彩課程推薦 台北水彩課程？
為什麼我們是最好的水彩課程？
你一定要報名我們的水彩課嗎？
```

規則：

```text
必須像真人會問的問題
不要堆疊關鍵字
不要把標題改成問句硬塞進 FAQ
不要使用誇大、保證、誘導式問題
每題只問一件事
問題應能獨立理解
問題應與頁面主題直接相關
```

### 17.6 FAQ 答案格式規則

答案應採用：

```text
直接答案 + 補充說明 + 條件或下一步
```

範例：

```markdown
### 初學者適合上水彩課嗎？

適合。初學者上水彩課可以更快理解水量控制、顏色混合與基本筆法，避免自己摸索時養成錯誤習慣。如果你完全沒有繪畫基礎，建議選擇從工具認識與基礎練習開始的課程。
```

### 17.7 FAQ 排序規則

```text
1. 定義問題
2. 適合對象
3. 比較問題
4. 價格問題
5. 流程問題
6. 工具 / 材料問題
7. 信任問題
8. 轉換問題
```

### 17.8 FAQ 與 GEO 的特殊設計

FAQ 應符合：

```text
問題清楚
答案簡短
答案可獨立引用
不要過度依賴上下文
避免模糊代名詞
包含必要 entity
包含品牌、地點、產品或服務名稱
```

較佳答案：

```text
Pei-Jing Art Studio 的初學者水彩課適合沒有繪畫基礎的成人，課程會從工具認識、水量控制、基本筆法與簡單作品練習開始。
```

### 17.9 FAQ Schema 生成規則

FAQPage schema 只能包含頁面上實際可見的 FAQ。

禁止：

```text
schema 裡有 FAQ，但頁面上沒有顯示
schema 答案和頁面答案不同
schema 裡塞廣告內容
schema 裡塞不相關問題
schema 標記使用者不能直接看到的內容
```

JSON-LD 範例：

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "初學者適合上水彩課嗎？",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "適合。初學者上水彩課可以更快理解水量控制、顏色混合與基本筆法，避免自己摸索時養成錯誤習慣。"
      }
    }
  ]
}
```

### 17.10 FAQ 資料結構

```json
{
  "faq_id": "faq_001",
  "article_id": "article_001",
  "question": "初學者適合上水彩課嗎？",
  "answer": "適合。初學者上水彩課可以更快理解水量控制、顏色混合與基本筆法，避免自己摸索時養成錯誤習慣。",
  "type": "suitability",
  "intent": "commercial",
  "source": "people_also_ask",
  "priority": 1,
  "include_in_schema": true,
  "include_in_page": true,
  "internal_link_target": "/watercolor-class-for-beginners/",
  "conversion_stage": "consideration",
  "geo_score": 85
}
```

### 17.11 FAQ Quality Gate

```markdown
- [ ] 問題是否像真人會搜尋或詢問？
- [ ] 問題是否與文章主題直接相關？
- [ ] 問題是否只問一件事？
- [ ] 答案是否第一句就直接回答？
- [ ] 答案是否 40–120 字左右？
- [ ] 答案是否避免 keyword stuffing？
- [ ] 答案是否沒有未驗證承諾？
- [ ] 答案是否與品牌知識庫一致？
- [ ] 若加入 FAQ schema，頁面上是否可見同一組 FAQ？
- [ ] schema 的 question / answer 是否與頁面內容一致？
```

### 17.12 FAQ Score

```text
FAQ Score =
Question Realness
+ Search Intent Match
+ Answer Directness
+ Answer Completeness
+ GEO Extractability
+ Conversion Helpfulness
+ Schema Eligibility
- Keyword Stuffing Risk
- Duplication Risk
- Unsupported Claim Risk
```

---

## 18. GEO / AI First-Pick Readiness Specification

本產品不得使用「AI 一定推薦」作為承諾。

應使用：

```text
AI First-Pick Readiness
AI Citation Readiness
AI Recommendation Evidence Score
AI Entity Trust Score
AI Comparison Readiness
GEO Score
```

### 18.1 AI 第一時間推薦的實際條件

AI 比較可能推薦符合以下條件的品牌、產品、課程、服務或文章：

```text
被搜尋系統找到
被搜尋系統理解
和使用者問題高度相關
有明確證據支持推薦理由
有比競品更清楚的比較資訊
有可信作者、品牌、案例或第三方聲量
內容可被摘錄成簡潔回答
資訊新、準確、沒有誇大
頁面體驗良好
在多個相關 query / prompt 下保持一致
```

### 18.2 AI First-Pick Readiness Score

```text
AI First-Pick Readiness Score =
Indexability Score * 0.15
+ Search Intent Match Score * 0.15
+ Direct Answer Score * 0.10
+ Entity Clarity Score * 0.10
+ Evidence Score * 0.10
+ Comparison Readiness Score * 0.10
+ Experience Signal Score * 0.10
+ Topical Authority Score * 0.10
+ Freshness Score * 0.05
+ Media Context Score * 0.03
+ Structured Data Score * 0.02
```

### 18.3 AI First-Pick Checklist

```markdown
- [ ] 頁面可被 Google crawl
- [ ] 頁面可被 index
- [ ] 頁面沒有 noindex
- [ ] 頁面允許 snippet
- [ ] canonical 正確
- [ ] title 與 H1 清楚
- [ ] 開頭 100–150 字直接回答主問題
- [ ] 有 Key Takeaways
- [ ] 有明確比較表
- [ ] 有 FAQ
- [ ] 有作者或品牌經驗
- [ ] 有案例、數據或實測
- [ ] 有圖片 alt、caption、檔名
- [ ] 有必要影片 transcript
- [ ] 有 Article / Breadcrumb schema
- [ ] FAQ schema 僅包含頁面可見 FAQ
- [ ] 有內鏈到 pillar page
- [ ] 有內鏈到相關 supporting articles
- [ ] 有外部可信來源或第三方提及
- [ ] 內容沒有誇大承諾
- [ ] 內容沒有 keyword stuffing
- [ ] 內容與品牌知識庫一致
```

---

## 19. Entity Optimization Specification

AI 搜尋非常依賴 entity。品牌、人物、課程、產品、地點、服務必須一致、清楚、可驗證。

### 19.1 必要 Entity

```text
Brand entity
Founder / Author entity
Service entity
Product / Course entity
Location entity
Audience entity
Problem entity
Solution entity
Competitor entity
Topic entity
```

### 19.2 Brand Entity Schema

```json
{
  "brand_name": "Pei-Jing Art Studio",
  "alternate_names": [
    "Pei Jing Art Studio",
    "Pei-Jing 水彩工作室"
  ],
  "description": "",
  "founder": "",
  "website": "",
  "logo": "",
  "same_as": [],
  "service_locations": [],
  "primary_services": [],
  "audience": [],
  "brand_voice": "",
  "proof_points": [],
  "forbidden_claims": []
}
```

### 19.3 Entity Consistency Rules

```text
品牌名稱每篇一致
作者名稱每篇一致
服務名稱每篇一致
價格資訊以知識庫為準
地點資訊以知識庫為準
課程資訊以知識庫為準
不要 AI 自行發明 credentials
不要 AI 自行發明媒體報導
不要 AI 自行發明客戶評價
```

### 19.4 Author Entity 強化規範

GEO 時代 AI 搜尋在推薦答案時，會特別重視「是誰說的」。弱作者 entity 會降低被引用的機率。

#### 作者頁必備欄位

```text
完整姓名（與所有文章一致）
專業頭銜（職稱、身份）
經歷年資
具體資歷（學歷、證照、作品、獲獎）
照片（真實本人照，非 AI 生成）
聯絡或社群連結
Person schema（同下）
```

#### Person Schema 完整範本

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "作者全名",
  "url": "https://example.com/about/",
  "image": "https://example.com/author-photo.jpg",
  "jobTitle": "水彩老師 / 藝術教育者",
  "description": "有 10 年水彩教學經驗，專注成人初學者課程設計，曾受邀於台北藝術中心擔任客座講師。",
  "knowsAbout": ["水彩技法", "成人藝術教育", "色彩學"],
  "sameAs": [
    "https://www.instagram.com/yourhandle",
    "https://www.linkedin.com/in/yourprofile",
    "https://www.youtube.com/@yourchannel"
  ],
  "worksFor": {
    "@type": "Organization",
    "name": "品牌名稱",
    "url": "https://example.com"
  }
}
```

#### Author Entity 一致性規則

```text
作者姓名每篇文章必須完全一致（不能有時用全名有時用暱稱）
Person schema 的 name 必須與文章 author byline 一致
Person schema 的 sameAs 必須連到真實存在且公開的個人頁面
不得 AI 自行發明作者資歷、獲獎、媒體報導
若作者資歷未在品牌知識庫中，標記為 NEEDS_BRAND_VERIFY
About 頁面的 Person schema 與每篇文章的 author schema 必須一致
```

#### Author Entity Quality Gate

```markdown
- [ ] 文章是否有作者 byline？
- [ ] 作者名稱是否與知識庫一致？
- [ ] 文章是否有 author 區塊（照片、簡介、連結）？
- [ ] BlogPosting schema 的 author.name 是否與 byline 一致？
- [ ] Person schema 的 sameAs 是否全部為有效 URL？
- [ ] 是否有任何 AI 自行發明的資歷？
```

### 19.5 Expert Reviewed System（YMYL 專家審閱機制）

對於醫療、法律、財務、心理健康等 YMYL（Your Money or Your Life）類型內容，僅有作者 entity 不夠，Google 與 AI 搜尋系統還要求有**專業審閱者（Reviewer）**的明確信號。

#### 適用場景

```text
醫療或健康建議（症狀、治療、藥物）
法律建議（合約、權利、訴訟）
財務建議（投資、保險、稅務）
心理健康（諮商、情緒、危機）
兒童教育（學習發展、育兒）
```

#### 前端 Kadence UI 區塊

每篇 YMYL 文章的開頭（H1 下方）必須加入審閱者區塊：

```html
<!-- wp:kadence/infobox {"uniqueID":"reviewed-by"} -->
<div class="reviewed-by-block" aria-label="專家審閱資訊">
  <img src="{{reviewer_photo}}" alt="{{reviewer_name}} 照片" width="48" height="48" />
  <div>
    <p class="reviewed-label">本文由專業人士審閱</p>
    <p class="reviewer-name"><strong>{{reviewer_name}}</strong>，{{reviewer_title}}</p>
    <p class="reviewed-date">審閱日期：{{reviewed_date}}</p>
    <a href="{{reviewer_profile_url}}">查看審閱者資歷</a>
  </div>
</div>
<!-- /wp:kadence/infobox -->
```

#### reviewedBy Schema

在 BlogPosting / Article JSON-LD 中加入：

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{title}}",
  "author": {
    "@type": "Person",
    "@id": "https://example.com/about/#author",
    "name": "{{author_name}}"
  },
  "reviewedBy": {
    "@type": "Person",
    "@id": "https://example.com/experts/{{reviewer_slug}}/#person",
    "name": "{{reviewer_name}}",
    "jobTitle": "{{reviewer_title}}",
    "url": "{{reviewer_profile_url}}"
  }
}
```

#### DB 欄位（加入 articles 表）

```sql
ALTER TABLE articles ADD COLUMN is_ymyl BOOLEAN DEFAULT false;
ALTER TABLE articles ADD COLUMN reviewer_person_id UUID REFERENCES brand_profiles(id);
ALTER TABLE articles ADD COLUMN reviewed_at TIMESTAMP;
```

#### Expert Review Quality Gate

```markdown
- [ ] 文章是否被正確標記為 YMYL？
- [ ] 是否有真實存在的審閱者（非 AI 虛構）？
- [ ] 前端是否有可見的審閱者區塊？
- [ ] reviewedBy schema 的 @id 是否指向有效頁面？
- [ ] 審閱者個人頁面是否公開且有詳細資歷？
- [ ] 審閱日期是否有維護（每次更新同步更新）？
```

---

## 20. Evidence Layer Specification

AI 與 Google 都需要判斷內容是否可信。每篇文章都應有 Evidence Layer。

### 20.1 Evidence 類型

| 類型 | 說明 |
|---|---|
| First-hand experience | 作者親身經驗、實測、教學觀察 |
| Case study | 案例、學生作品、客戶成果 |
| Data | 搜尋量、調查、統計、價格區間 |
| Comparison | 競品、方案、工具比較 |
| Methodology | 評選標準、測試方法 |
| Expert note | 老師、專家、作者觀點 |
| External citation | 官方來源、可信資料 |
| User feedback | 評價、常見問題、留言 |

### 20.2 Evidence Block 範例

```markdown
## 我們如何判斷這項推薦？

本文的推薦依據包含：課程內容完整度、是否適合初學者、老師是否提供回饋、學員作品完成度、價格透明度與課後支援。若是水彩課程比較文，會優先推薦能讓初學者從工具認識、水量控制、基本筆法到完成作品逐步練習的課程。
```

### 20.3 Methodology Block 範例

```markdown
## 我們的評選標準

我們評估水彩課程時，主要看五個面向：

| 評估面向 | 說明 |
|---|---|
| 初學者友善度 | 是否從工具、紙張、水量與基本筆法開始 |
| 教學流程 | 是否有清楚步驟與練習安排 |
| 回饋機制 | 是否能讓學生知道自己錯在哪裡 |
| 作品完成度 | 學生是否能完成具體作品 |
| 價格透明度 | 是否清楚說明費用、材料與課程內容 |
```

### 20.4 Fact-Checking Layer

AI 幻覺是 GEO 最大的信任風險。若 AI Overview 或 ChatGPT 引用你網站的錯誤數據，直接損害品牌可信度。每篇文章生成後必須執行 Fact-Checking Layer。

#### 需要標記查證的內容類型

```text
統計數字（百分比、人數、金額）
研究或調查引用
產品或課程規格
價格
截止日期或有效期限
作者資歷（學位、年資、獲獎）
媒體報導
第三方評分
法律或醫療相關聲明
任何「最新」「最大」「唯一」等最高級形容
```

#### 輸出標記規則

AI 生成文章時，若內容含有需要查證的資訊，必須在該段落末端標記：

```markdown
<!-- NEEDS_FACT_CHECK: 請確認此統計數字來源 -->
<!-- SOURCE_REQUIRED: 請補充外部可信來源連結 -->
<!-- BRAND_VERIFY: 請確認此課程資訊與知識庫一致 -->
```

#### 可選整合工具

```text
Perplexity API：即時搜尋驗證事實
Tavily API：搜尋最新資料佐證數字
Exa AI：找到可引用的原始資料來源
```

#### Fact-Check 評分

```text
Factuality Score =
有來源支持的聲明比例
- 含有未驗證最高級形容詞
- 含有 AI 自行發明的品牌資訊
- 含有未標記的醫療 / 法律 / 財務建議
```

#### Fact-Check Gate

```markdown
- [ ] 是否有未標記的統計數字？
- [ ] 是否有作者資歷聲明未經知識庫驗證？
- [ ] 是否有「保證」「唯一」「最大」等未有證據支持的說法？
- [ ] 是否有產品或課程資訊與知識庫不符？
- [ ] 是否有任何 AI 自行發明的品牌、媒體或評論資訊？
```

---

## 21. Topical Authority Architecture

單篇文章很難建立長期信任。系統必須建立 topic cluster。

### 21.1 Pillar / Cluster 範例

```text
Pillar Page:
水彩課程完整指南

Cluster Articles:
- 初學者如何選水彩課程
- 線上水彩課和實體水彩課比較
- 水彩課程費用怎麼算
- 初學者水彩工具清單
- 水彩紙怎麼選
- 水彩筆怎麼選
- 台北水彩課程推薦
- 成人水彩課適合誰
- 水彩和壓克力差別
- 水彩常見錯誤
```

### 21.2 Internal Link Rules

```text
每篇 cluster article 必須連回 pillar page
pillar page 必須連到所有重要 cluster articles
相同 intent 的文章不能互相競爭
內鏈 anchor text 必須自然
不要每段都塞內鏈
不要用完全一樣的 anchor text 重複連結
```

### 21.3 Topic Authority Score

```text
Topic Authority Score =
Pillar Completeness
+ Cluster Coverage
+ Internal Link Quality
+ Search Intent Coverage
+ Content Freshness
+ Entity Consistency
+ External Mention Support
```

### 21.4 Topic Cluster Map（視覺化）

系統應提供 Cluster Map 讓用戶一眼看出：

```text
哪些 cluster articles 已存在
哪些 cluster 位置還是空的（Content Gap）
哪篇是 pillar page
哪些文章之間有內鏈
哪些文章排名正在衰退（需要 refresh）
```

Cluster Map 輸出欄位：

```json
{
  "cluster_id": "watercolor-course",
  "pillar_url": "/watercolor-class-complete-guide/",
  "pillar_status": "published",
  "cluster_articles": [
    {
      "topic": "初學者如何選水彩課程",
      "url": "/how-to-choose-watercolor-class/",
      "status": "published",
      "avg_position": 8.2,
      "opportunity_score": 86
    },
    {
      "topic": "水彩課程費用完整說明",
      "url": null,
      "status": "gap",
      "opportunity_score": 74
    }
  ]
}
```

### 21.5 Cannibalization 防護

每次產生新文章前，系統必須自動比對站內相似 URL，防止同主題文章互搶排名。

#### 偵測邏輯

```text
新文章 primary keyword 與站內文章 primary keyword 相似度 > 80%
新文章 title 向量相似度 > 0.85（embedding cosine similarity）
新文章目標 URL 與站內現有 URL slug 過於雷同
```

#### 偵測後行動

```text
相似度 60–79%：提示警告，建議補充差異化角度
相似度 80–94%：強烈建議改為「更新舊文」而非新開
相似度 95%+：阻擋新建，強制導向 content refresh 流程
```

#### Cannibalization DB 欄位擴充（加入 topics 表）

```sql
ALTER TABLE topics ADD COLUMN cannibalization_risk NUMERIC DEFAULT 0;
ALTER TABLE topics ADD COLUMN cannibalizes_article_id UUID REFERENCES articles(id);
ALTER TABLE topics ADD COLUMN cannibalization_action TEXT;
-- action 可為: proceed / warn / refresh_instead / merge
```

---

## 22. Technical SEO / Crawlability Specification

若頁面不能被 Google 正確存取，就沒有 SEO/GEO/AI 搜尋可見度。

### 22.1 Technical Requirements

```markdown
- [ ] HTTP status = 200
- [ ] 沒有 noindex
- [ ] robots.txt 沒有阻擋重要頁面
- [ ] canonical 指向正確 URL
- [ ] sitemap 包含重要頁面
- [ ] 頁面可被手機版正常讀取
- [ ] 主內容不是只藏在無法讀取的 JavaScript 中
- [ ] 圖片使用標準 img / picture element
- [ ] 重要圖片不是 CSS background image
- [ ] 影片檔案或影片頁可被 Google 存取
- [ ] structured data 可被 validator 解析
- [ ] 頁面速度合理
- [ ] Core Web Vitals 沒有嚴重問題
```

### 22.2 Snippet Eligibility

```markdown
- [ ] 沒有 nosnippet
- [ ] max-snippet 不過短
- [ ] 重要答案不被 data-nosnippet 排除
- [ ] FAQ、摘要、表格可被頁面直接讀取
```

### 22.3 Core Web Vitals 輸出規範

Kadence 輸出的 HTML 必須符合 CWV 基本規範，否則技術分數抵消內容努力。

#### 圖片輸出規範

```text
每張 img 必須有 width 和 height 屬性（防止 CLS）
非 featured image 的圖片使用 loading="lazy"
featured image 使用 fetchpriority="high"（防止 LCP 過慢）
輸出圖片建議格式：WebP（主）+ JPEG fallback
使用 <picture> element 提供多尺寸 srcset
```

#### 範例輸出

```html
<picture>
  <source
    srcset="watercolor-class-800w.webp 800w, watercolor-class-1200w.webp 1200w"
    type="image/webp"
  />
  <img
    src="watercolor-class-800w.jpg"
    alt="成人初學者在台北水彩教室練習基礎筆法"
    width="1200"
    height="800"
    loading="lazy"
    decoding="async"
  />
</picture>
```

#### CWV Quality Gate

```markdown
- [ ] 所有 img 是否有 width / height？
- [ ] Featured image 是否有 fetchpriority="high"？
- [ ] 是否有大量 render-blocking scripts？
- [ ] 是否有未壓縮的大型圖片（> 200KB）？
- [ ] 是否避免 layout shift 元素（未定尺寸的 iframe、廣告、embed）？
```

---

## 23. Image SEO / GEO Specification

圖片不是裝飾，而是搜尋與 AI 理解內容的重要訊號。

### 23.1 Image Rules

```text
圖片必須與附近段落高度相關
圖片必須使用標準 img 或 picture element
圖片必須有 src fallback
圖片必須有描述性 filename
圖片必須有自然 alt text
圖片應有 caption
圖片應壓縮與 responsive
featured image 應有 Open Graph metadata
```

### 23.2 Image Metadata

```json
{
  "filename": "beginner-watercolor-class-taipei.jpg",
  "alt_text": "成人初學者在台北水彩教室練習基礎筆法",
  "caption": "初學者水彩課程應從工具認識、水量控制與基本筆法開始。",
  "related_section": "初學者如何選水彩課程",
  "image_type": "section_image",
  "width": 1200,
  "height": 800
}
```

### 23.3 Image Placement Rule

不建議：

```text
文章開頭塞大量圖
每兩段硬塞一張不相關圖片
用 CSS background image 承載重要圖片
alt text 堆疊關鍵字
```

建議：

```text
每個核心教學步驟一張示意圖
比較文加入 comparison graphic
推薦文加入評選表或流程圖
課程頁加入教室、作品、老師示範、學生作品
```

---

## 24. Short Video SEO / GEO Specification

短影片可用於社群、文章嵌入、Google video indexing 與 AI 搜尋理解。

### 24.1 Video Rules

每個重要影片應包含：

```text
video title
description
thumbnail
duration
upload date
transcript
captions
key moments / chapters
VideoObject schema
stable video URL
可被 Google fetch 的影片檔案或影片頁
```

### 24.2 Short Video Script Format

```json
{
  "video_title": "",
  "duration_seconds": 45,
  "hook": "",
  "scenes": [
    {
      "scene": 1,
      "duration": 5,
      "visual": "",
      "voiceover": "",
      "subtitle": ""
    }
  ],
  "cta": "",
  "transcript": ""
}
```

### 24.3 VideoObject Data

```json
{
  "name": "初學者如何選水彩課程？",
  "description": "這支影片說明初學者選擇水彩課程時應注意的課程形式、費用、工具與老師回饋。",
  "thumbnailUrl": "https://example.com/wp-content/uploads/watercolor-class-video-thumb.jpg",
  "uploadDate": "2026-06-06",
  "duration": "PT45S",
  "contentUrl": "https://example.com/videos/watercolor-class-guide.mp4",
  "embedUrl": "https://example.com/watercolor-class-guide/",
  "transcript": "想學水彩但不知道該選線上課還是實體課？..."
}
```

---

## 25. Structured Data Specification

Structured data 有價值，但不是 AI 搜尋保證工具。

### 25.1 Schema Priority

| 優先級 | Schema | 適用頁面 |
|---|---|---|
| P0 | Organization | 全站 / 品牌 |
| P0 | WebSite | 全站 |
| P0 | BreadcrumbList | 所有文章 |
| P0 | BlogPosting / Article | 所有文章 |
| P1 | Person | 作者頁、文章作者 |
| P1 | LocalBusiness | 在地服務 |
| P1 | Course | 課程頁 |
| P1 | Product | 產品頁 |
| P1 | Review | 真實評測頁 |
| P1 | VideoObject | 有影片頁 |
| P1 | ImageObject | 重要圖片頁 |
| P1 | FAQPage | 頁面有可見 FAQ 時 |
| P2 | HowTo | 真正的步驟教學頁 |
| P2 | Speakable | 語音助理、AI 語音搜尋優化 |

### 25.4 Speakable Schema

`speakable` 讓 Google Assistant、AI 語音搜尋直接讀出你頁面的特定段落。建議標記的段落：

```text
Direct Answer 段落（快速答案）
Key Takeaways
FAQ 答案
```

JSON-LD 範例：

```json
{
  "@context": "https://schema.org/",
  "@type": "WebPage",
  "name": "初學者如何選水彩課程？",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [".direct-answer", ".key-takeaways", ".faq-answer"]
  },
  "url": "https://example.com/how-to-choose-watercolor-class/"
}
```

對應 Kadence HTML 輸出，需在相關 block 加上 CSS class：

```html
<!-- Direct Answer Block -->
<div class="direct-answer">
  <p>如果你是初學者，建議優先選擇有完整基礎流程...</p>
</div>
```

### 25.5 HowTo Schema 規範

HowTo schema 僅適用於**真正有步驟的教學頁面**，不適用於比較文或推薦清單。

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "如何選擇適合初學者的水彩課程",
  "step": [
    {
      "@type": "HowToStep",
      "name": "確認自己的學習目標",
      "text": "先想清楚你想學寫實風格、療癒風格還是色塊練習，這會影響你選擇老師風格的方向。"
    },
    {
      "@type": "HowToStep",
      "name": "確認課程是否有基礎練習",
      "text": "初學者課程必須包含工具認識、水量控制與基本筆法，不應一開始就要求完成複雜作品。"
    }
  ]
}
```

### 25.6 多語言 hreflang 規範

若網站同時有繁體中文與其他語言版本，**必須正確設定 hreflang**，否則 Google 視為重複內容。

#### 規則

```text
每個語言版本的頁面都要在 <head> 加入完整 hreflang 集合
hreflang 必須雙向互指（A 指 B，B 也要指 A）
必須有 x-default 指向預設語言版本
```

#### 範例（繁中 + 英文版）

```html
<link rel="alternate" hreflang="zh-TW" href="https://example.com/watercolor-class-guide/" />
<link rel="alternate" hreflang="en" href="https://example.com/en/watercolor-class-guide/" />
<link rel="alternate" hreflang="x-default" href="https://example.com/watercolor-class-guide/" />
```

#### 系統輸出規範

```json
{
  "hreflang": [
    { "lang": "zh-TW", "url": "https://example.com/watercolor-class-guide/" },
    { "lang": "en", "url": "https://example.com/en/watercolor-class-guide/" },
    { "lang": "x-default", "url": "https://example.com/watercolor-class-guide/" }
  ]
}
```

多語言文章發布時，系統必須自動：

```text
產生每個語言版本的 hreflang 集合
注入到 WordPress 的 <head>（透過 Yoast / RankMath API 或 wp_head hook）
確認所有互指 URL 皆為有效頁面（避免 broken hreflang）
```

### 25.7 Schema Linked Data Graph（@id 節點串連）

傳統 schema 各自獨立，AI 搜尋系統無法理解實體之間的關係。v3 採用 Linked Data Graph，透過 `@id` 讓所有 schema 節點相互串連，形成完整的知識圖譜。

#### 核心串連架構

```text
WebSite (@id: https://example.com/#website)
  └── Organization (@id: https://example.com/#organization)
        └── Person / Author (@id: https://example.com/about/#author)
              └── Article (@id: https://example.com/post-slug/#article)
                    ├── FAQPage
                    ├── BreadcrumbList
                    ├── VideoObject
                    └── ImageObject
```

#### 完整 Linked Data JSON-LD 範本

```json
[
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://example.com/#website",
    "url": "https://example.com",
    "name": "{{brand_name}}",
    "publisher": { "@id": "https://example.com/#organization" }
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://example.com/#organization",
    "name": "{{brand_name}}",
    "url": "https://example.com",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    },
    "sameAs": ["{{social_url_1}}", "{{social_url_2}}"]
  },
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": "https://example.com/about/#author",
    "name": "{{author_name}}",
    "url": "https://example.com/about/",
    "worksFor": { "@id": "https://example.com/#organization" },
    "sameAs": ["{{linkedin_url}}", "{{instagram_url}}"]
  },
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": "https://example.com/{{slug}}/#article",
    "headline": "{{title}}",
    "url": "https://example.com/{{slug}}/",
    "author": { "@id": "https://example.com/about/#author" },
    "publisher": { "@id": "https://example.com/#organization" },
    "isPartOf": { "@id": "https://example.com/#website" },
    "datePublished": "{{date_published}}",
    "dateModified": "{{date_modified}}"
  }
]
```

#### ItemList Schema（推薦清單文專用）

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "{{list_title}}",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "{{item_1_name}}",
      "url": "{{item_1_url}}"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "{{item_2_name}}",
      "url": "{{item_2_url}}"
    }
  ]
}
```

#### SoftwareApplication Schema（工具推薦文專用）

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "{{tool_name}}",
  "operatingSystem": "Web, iOS, Android",
  "applicationCategory": "{{category}}",
  "offers": {
    "@type": "Offer",
    "price": "{{price}}",
    "priceCurrency": "TWD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "{{rating}}",
    "reviewCount": "{{review_count}}"
  }
}
```

#### Schema Graph Quality Gate

```markdown
- [ ] WebSite、Organization、Person 的 @id 是否一致且跨頁通用？
- [ ] Article 的 author 是否透過 @id 指向 Person 節點？
- [ ] Article 的 publisher 是否透過 @id 指向 Organization 節點？
- [ ] 所有 @id URL 是否為有效且可存取的頁面？
- [ ] ItemList 是否只用於真正的清單型文章？
- [ ] SoftwareApplication 的 aggregateRating 是否來自真實評分（非偽造）？
- [ ] 所有 schema 內容是否與頁面可見內容一致？
```

### 25.2 Schema Rules

```text
schema 必須代表頁面主要內容
schema 內容必須與頁面可見內容一致
不得標記隱藏內容
不得偽造 review / rating
不得標記不存在的 FAQ
不得把 schema 當成 AI 搜尋保證技巧
```

### 25.3 BlogPosting JSON-LD 範例

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "初學者如何選水彩課程？線上、實體、費用完整比較",
  "description": "想學水彩但不知道怎麼選課？本文比較線上與實體水彩課、常見費用、適合對象與初學者選課重點。",
  "image": "https://example.com/wp-content/uploads/watercolor-class.jpg",
  "author": {
    "@type": "Person",
    "name": "作者名稱"
  },
  "publisher": {
    "@type": "Organization",
    "name": "品牌名稱",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  },
  "datePublished": "2026-06-06",
  "dateModified": "2026-06-06"
}
```

---

## 26. Freshness / Content Update Specification

Freshness 對推薦、比較、工具、價格、課程、地區服務類內容特別重要。

### 26.1 Freshness Signals

```text
datePublished
dateModified
最後更新日期
價格更新日期
資料來源日期
版本記錄
過時資訊提醒
```

### 26.2 Update Frequency

| 內容類型 | 建議更新頻率 |
|---|---|
| 一般知識文 | 6–12 個月 |
| 工具推薦文 | 3–6 個月 |
| 價格文 | 1–3 個月 |
| 課程頁 | 每次課程內容變更 |
| 在地服務頁 | 3–6 個月 |
| 趨勢文 | 1–4 週 |
| AI visibility 文章 | 1–3 個月 |

### 26.3 Freshness Gate

```markdown
- [ ] 是否有 dateModified
- [ ] 是否有過時年份
- [ ] 價格是否仍正確
- [ ] 課程資訊是否仍正確
- [ ] 推薦清單是否仍有效
- [ ] 外部資料是否過時
- [ ] 競品 SERP 是否有新內容格式
```

---

## 27. Brand Trust / Earned Media Specification

AI 搜尋不只看品牌自己的網站，也會看其他地方如何描述品牌。

### 27.1 Brand Trust Sources

```text
Google Business Profile
YouTube
Instagram
Facebook
LinkedIn
Pinterest
Reddit / forum discussion
媒體報導
Podcast
Guest posts
Review platforms
Course platforms
Directory listings
Partner websites
```

### 27.2 Brand Trust Checklist

```markdown
- [ ] Google Business Profile 完整
- [ ] 品牌名稱一致
- [ ] 網站、社群、地圖資訊一致
- [ ] 有 About page
- [ ] 有 Contact page
- [ ] 有作者介紹頁
- [ ] 有真實案例
- [ ] 有作品 / portfolio
- [ ] 有評論或 testimonials
- [ ] 有第三方平台提及
- [ ] 有社群內容支援主題權威
```

### 27.3 Earned Media Score

```text
Earned Media Score =
Third-party Mentions
+ Review Quality
+ Social Proof
+ Brand Consistency
+ External Link Quality
+ Local Citation Consistency
+ Expert Association
```

---

## 28. Local SEO / Local GEO Specification

若品牌有實體地點、工作室、服務地區或課程地點，Local SEO / Local GEO 必須獨立處理。

### 28.1 Local Signals

```text
Google Business Profile
NAP consistency
LocalBusiness schema
服務地區頁
地圖嵌入
交通資訊
營業時間
課程地點
附近地標
在地 FAQ
在地圖片
在地評論
```

### 28.2 Local Page Template

```markdown
# 台北水彩課程推薦：適合成人初學者的實體水彩課

## 快速答案

如果你想在台北學水彩，建議選擇有實體教室、老師現場示範、初學者基礎練習與作品回饋的課程。對完全沒有繪畫基礎的人來說，實體課可以更快修正水量、筆觸和構圖問題。

## 課程地點

## 適合對象

## 課程內容

## 費用與材料

## 交通方式

## 學生作品

## 常見問題

## 預約體驗課
```

---

## 29. CTR Optimization Specification

CTR 不靠標題黨，而是靠準確、具體、符合搜尋意圖。

### 29.1 Title Formula

```text
主題 + 使用者利益 + 差異化 + 年份或情境
```

範例：

```text
初學者如何選水彩課程？線上、實體、費用完整比較
2026 台北水彩課程推薦：成人初學者選課指南
水彩和壓克力差在哪？初學者選擇完整比較
```

### 29.2 Meta Description Formula

```text
使用者問題 + 內容涵蓋範圍 + 具體收穫
```

### 29.3 CTR Quality Gate

```markdown
- [ ] title 是否包含主要搜尋意圖？
- [ ] title 是否具體？
- [ ] title 是否避免誇大？
- [ ] meta description 是否說明讀者會得到什麼？
- [ ] slug 是否簡短清楚？
- [ ] featured image 是否清楚？
- [ ] 文章開頭是否承接 SERP promise？
```

---

## 30. Kadence Block Builder Specification

### 30.1 原則

不要讓 AI 隨機產生混亂 HTML。應使用可控模板，把內容填入固定 block 結構。

### 30.2 Kadence-friendly Layout

```text
Kadence Row Layout
  Hero Section
  Intro / Direct Answer
  Key Takeaways Info Box
  Table of Contents
  Main Content Sections
  Comparison Table
  Quote / Expert Note
  Image Blocks
  FAQ Accordion
  CTA Section
  Related Posts
```

### 30.3 區塊對應

| 內容類型 | Kadence 建議區塊 |
|---|---|
| Hero | Row Layout + Advanced Heading |
| 摘要 | Info Box |
| 目錄 | Table of Contents |
| 表格 | Advanced Table 或 HTML Table |
| FAQ | Accordion |
| CTA | Row Layout + Advanced Button |
| Quote | Testimonial / Quote style block |
| 圖片 | Advanced Gallery / Image |
| 相關文章 | Posts block |

### 30.4 輸出格式

```text
Gutenberg HTML
Kadence block markup
Clean HTML fallback
```

MVP 建議先做：

```text
Clean HTML + Gutenberg compatible blocks
```

Phase 2 再做：

```text
Kadence native serialization
```

---

## 31. WordPress Publishing Specification

### 31.1 發布模式

| 模式 | 說明 |
|---|---|
| Draft | 預設模式，人工審核後發布 |
| Scheduled | 排程發布 |
| Private | 私人草稿 |
| Publish | 高信任度帳號才允許 |

### 31.2 發布流程

```text
1. 產生文章
2. 產生圖片
3. 上傳圖片到 WordPress Media Library
4. 設定 featured image
5. 建立 post draft
6. 設定 category / tags
7. 寫入 SEO metadata
8. 寫入 schema
9. 寫入 excerpt
10. 儲存為草稿
11. 通知使用者審核
```

### 31.3 WordPress Post Payload

```json
{
  "title": "初學者如何選水彩課程？完整指南",
  "content": "<!-- wp:paragraph --><p>...</p><!-- /wp:paragraph -->",
  "excerpt": "這篇文章教你如何依照預算、學習目標與課程形式選擇適合初學者的水彩課程。",
  "status": "draft",
  "slug": "how-to-choose-watercolor-class-for-beginners",
  "categories": [12],
  "tags": [45, 46],
  "featured_media": 123
}
```

### 31.4 Media Metadata

```json
{
  "alt_text": "成人初學者在水彩教室練習基礎筆法",
  "caption": "初學者水彩課程應從水量控制、筆法與色彩練習開始。",
  "description": "文章 featured image，用於介紹初學者如何選擇水彩課程。"
}
```

### 31.5 Google Indexing API 極速推送

文章從草稿轉為發布、或舊文完成更新後，系統立即呼叫 Google Indexing API，請求 Google 重新爬取並收錄該頁面。可將收錄時間從數天縮短至數小時甚至數分鐘。

#### 適用條件

```text
僅適用於具備 JobPosting 或 BroadcastEvent 嵌入直播的頁面（官方支援）
一般文章頁面雖非官方適用範圍，但實務上仍有明顯加速效果
必須先在 Google Search Console 完成網站驗證與授權
```

#### 執行流程

```text
1. 文章 status 從 draft 變更為 publish → 觸發 webhook
2. 後端呼叫 Google Indexing API
   POST https://indexing.googleapis.com/v3/urlNotifications:publish
   Body: { "url": "{{article_url}}", "type": "URL_UPDATED" }
3. 記錄推送結果（成功 / 失敗 / 限制）到 DB
4. 若失敗則加入重試佇列（最多 3 次，間隔 30 分鐘）
```

#### API 呼叫範例

```json
POST https://indexing.googleapis.com/v3/urlNotifications:publish
Authorization: Bearer {{google_oauth_token}}
Content-Type: application/json

{
  "url": "https://example.com/how-to-choose-watercolor-class/",
  "type": "URL_UPDATED"
}
```

#### 刪除通知（舊文下架時）

```json
{
  "url": "https://example.com/old-article/",
  "type": "URL_DELETED"
}
```

#### 配額限制

```text
每日配額：200 個 URL/網站（Google 官方限制）
建議優先推送：新發布文章、重大更新文章、Pillar Page
不建議對每篇更新都推送（避免浪費配額）
```

#### DB 欄位（加入 articles 表）

```sql
ALTER TABLE articles ADD COLUMN indexing_status TEXT DEFAULT 'pending';
-- pending / submitted / indexed / failed
ALTER TABLE articles ADD COLUMN indexing_submitted_at TIMESTAMP;
ALTER TABLE articles ADD COLUMN indexing_response JSONB;
```

#### Indexing API Quality Gate

```markdown
- [ ] 文章是否已通過 Quality Gate 才觸發推送？
- [ ] Google Search Console 驗證是否正常？
- [ ] 是否已記錄推送結果到 DB？
- [ ] 是否有重試機制應對失敗？
- [ ] 是否有每日配額監控，避免超限？
```

### 31.6 Live Pricing API（動態價格串接）

針對聯盟行銷（Affiliate）與電商比較頁面，靜態價格很快過時，系統必須支援動態價格渲染，確保比較表永遠顯示最新價格與庫存狀態。

#### 支援來源

```text
Amazon PAAPI 5.0（Product Advertising API）
WooCommerce REST API（自有商店）
自訂 Price API（任何可回傳 JSON 的端點）
```

#### 執行流程

```text
1. 文章載入時，前端 JS 呼叫本站 /api/live-price?asin={{asin}}
2. 後端打 Amazon PAAPI 或目標 API 取得最新價格與庫存
3. 快取結果（TTL 建議 2–6 小時，避免超出 API 限制）
4. 前端動態渲染到 Kadence Advanced Table 對應欄位
```

#### Kadence Table 動態價格 HTML 輸出範本

```html
<!-- wp:kadence/advancedtable -->
<table class="wp-block-kadence-advancedtable">
  <thead>
    <tr><th>產品</th><th>最新價格</th><th>庫存</th><th>連結</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>{{product_name}}</td>
      <td class="live-price" data-asin="{{asin}}">載入中...</td>
      <td class="live-stock" data-asin="{{asin}}">載入中...</td>
      <td><a href="{{affiliate_url}}" rel="nofollow sponsored">查看價格</a></td>
    </tr>
  </tbody>
</table>
<!-- /wp:kadence/advancedtable -->
```

#### DB 欄位（更新 media_assets 表）

```sql
ALTER TABLE media_assets ADD COLUMN asset_type_extended TEXT;
-- 可為: image / video / dynamic_price_widget / citation_box
ALTER TABLE media_assets ADD COLUMN dynamic_price_asin TEXT;
ALTER TABLE media_assets ADD COLUMN dynamic_price_api_url TEXT;
ALTER TABLE media_assets ADD COLUMN price_cache_ttl INTEGER DEFAULT 7200;
ALTER TABLE media_assets ADD COLUMN last_price_fetched_at TIMESTAMP;
```

#### Live Pricing Quality Gate

```markdown
- [ ] 是否有快取機制避免每次頁面載入都打 API？
- [ ] 快取過期後是否有 fallback 靜態價格顯示？
- [ ] 聯盟連結是否有正確加上 rel="nofollow sponsored"？
- [ ] 是否有監控 API 失敗並記錄到 DB？
- [ ] Amazon PAAPI 是否遵守使用條款（需顯示 "Prices subject to change"）？
```

---

## 32. Quality Gate Specification

### 32.1 審核層級

```text
Level 1: 基本格式檢查
Level 2: SEO 檢查
Level 3: GEO 檢查
Level 4: 事實檢查
Level 5: 品牌一致性檢查
Level 6: Spam / Manipulation 檢查
Level 7: 人工審核
```

### 32.2 自動檢查項目

| 類型 | 檢查 |
|---|---|
| SEO | title、meta、slug、H1、H2、keyword coverage |
| Readability | 句子長度、段落長度、標題清楚度 |
| Structure | TOC、表格、FAQ、CTA |
| GEO | direct answer、entity、FAQ、table、author |
| Factuality | 是否有不確定或需查證內容 |
| Originality | 是否與競品過度相似 |
| Brand | 是否符合品牌語氣與禁用語 |
| Legal | 是否有誇大療效、保證收益、未授權聲明 |
| Schema | JSON-LD 是否有效 |
| Media | 圖片是否有 alt、caption、filename |
| Spam | 是否像 scaled content abuse |

### 32.3 不可發布條件

若符合以下任一條件，文章不得自動發布：

```text
沒有通過 factuality check
沒有通過 originality check
沒有主要搜尋意圖
沒有明確讀者價值
含有未驗證醫療、法律、金融建議
含有保證排名、保證收益、保證療效等誇大說法
內容與站內既有文章高度重複
品牌資訊與知識庫衝突
Schema 標記了頁面未顯示的內容
文章只是為了操縱 Google 或 AI 回答
```

---

## 33. Anti-Spam / Anti-Manipulation Specification

本產品不得產生用於操縱 Google Search 或 Google generative AI responses 的內容。

### 33.1 禁止功能

```text
自動生成大量無差異文章並直接發布
為每個長尾變體建立幾乎相同的頁面
建立 doorway pages
隱藏文字給搜尋引擎看
schema 標記使用者看不到的內容
keyword stuffing
偽造第三方評論
偽造作者資歷
偽造媒體報導
偽造品牌提及
產生只為操縱 AI 推薦的內容
自動查詢 Google 搜尋造成 machine-generated traffic
```

### 33.2 Safe Automation Rules

```text
AI 可生成 draft
AI 可生成 brief
AI 可建議更新
AI 可生成 schema
AI 可生成圖片 prompt
AI 可生成影片腳本
但高風險內容與正式發布必須經人工審核
```

### 33.3 Anti-Spam Checklist

```markdown
- [ ] 這篇內容是否為使用者增加真實價值？
- [ ] 是否只是改寫競品？
- [ ] 是否只是為了排名而存在？
- [ ] 是否大量重複相同模板？
- [ ] 是否有原創經驗、案例、觀點或方法？
- [ ] 是否有任何偽造聲明？
- [ ] 是否誇大排名、效果、收益、療效？
- [ ] 是否試圖操縱 AI 推薦？
```

---

## 34. Content Refresh Engine

### 34.1 觸發條件

```text
impressions 上升但 CTR 下降
average position 從前 5 掉到 6–15
CTR 低於同排名預期
競品新增重要段落
SERP intent 改變
內容超過 6–12 個月未更新
AI visibility 下降
品牌未被 AI 回答提及
FAQ 過時
圖片、影片不足
內鏈不足
```

### 34.2 Refresh 建議類型

| 類型 | 說明 |
|---|---|
| Update | 更新資料、年份、價格、趨勢 |
| Expand | 新增段落、表格、FAQ、案例 |
| Rewrite | 改寫 title、intro、meta、結論 |
| Merge | 與重複文章合併 |
| Split | 拆成 pillar + cluster |
| Add Media | 新增圖片、影片、infographic |
| Add Schema | 補 schema |
| Improve GEO | 補 direct answer、entity、comparison table |

---

## 35. AI Visibility Tracker

### 35.1 追蹤對象

```text
ChatGPT
Gemini
Perplexity
Google AI Mode
Google AI Overview
Claude
Bing Copilot
```

### 35.2 追蹤項目

| 指標 | 說明 |
|---|---|
| Brand Mention | AI 回答是否提到品牌 |
| URL Citation | 是否引用你的網址 |
| Share of Voice | 你的品牌與競品相比出現比例 |
| Sentiment | AI 對品牌描述正面、中立、負面 |
| Accuracy | AI 描述是否正確 |
| Competitor Mentions | 競品是否被提到 |
| Prompt Visibility | 特定 prompt 下是否出現 |
| Topic Visibility | 某主題下是否有能見度 |

### 35.3 Prompt Tracking 範例

```text
台北最推薦的水彩課程有哪些？
適合成人初學者的水彩課程推薦
線上水彩課和實體水彩課哪個比較好？
Pei-Jing Art Studio 適合初學者嗎？
想學水彩應該先準備哪些工具？
```

### 35.4 AI Visibility Report

```yaml
ai_visibility_report:
  date: "2026-06-06"
  brand: ""
  prompts_tested: 50
  brand_mentions: 12
  citation_count: 4
  competitor_mentions:
    - competitor: ""
      mentions: 18
  sentiment:
    positive: 8
    neutral: 4
    negative: 0
  accuracy_issues:
    - ""
  recommendations:
    - "新增品牌介紹頁"
    - "補充課程費用 FAQ"
    - "建立水彩初學者工具清單文章"
```

### 35.5 AI Visibility Prompt 資料庫規範

`35.3` 只有範例，以下補充系統應自動建立的完整 Prompt 資料庫模板。每個品牌上線後，系統根據品牌知識庫自動產生下列類型的 prompt 清單，每週定期自動執行追蹤。

#### Prompt 類型與範本

| 類型 | Prompt 範本 | 追蹤目的 |
|---|---|---|
| 品牌直接查詢 | `{{brand_name}} 適合初學者嗎？` | 確認 AI 是否正確描述品牌 |
| 品牌比較查詢 | `{{brand_name}} 和 {{competitor}} 哪個比較好？` | 確認 AI 比較時是否公平 |
| 類別推薦查詢 | `{{city}} 最推薦的 {{service}} 有哪些？` | 確認品牌是否出現在推薦清單 |
| 問題型查詢 | `{{audience}} 適合的 {{service}} 推薦` | 確認品牌是否被 AI 當作答案 |
| 主題型查詢 | `{{topic}} 怎麼選？` | 確認文章是否被引用 |
| 價格型查詢 | `{{service}} 費用大概多少？` | 確認 AI 提供的價格資訊是否正確 |
| 流程型查詢 | `如何 {{action}}？` | 確認 How-to 內容是否被摘錄 |

#### Prompt 資料庫 DB 欄位

```sql
CREATE TABLE ai_prompt_library (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  prompt_type TEXT,
  prompt_template TEXT,
  prompt_rendered TEXT,
  tracking_engines TEXT[],
  frequency TEXT DEFAULT 'weekly',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  created_at TIMESTAMP
);
```

#### Prompt 執行報告欄位擴充（加入 ai_visibility_checks）

```sql
ALTER TABLE ai_visibility_checks ADD COLUMN prompt_type TEXT;
ALTER TABLE ai_visibility_checks ADD COLUMN prompt_library_id UUID REFERENCES ai_prompt_library(id);
ALTER TABLE ai_visibility_checks ADD COLUMN brand_rank INTEGER;
-- brand_rank: 若 AI 給出清單，品牌排在第幾位（1 = 第一個被提到）
ALTER TABLE ai_visibility_checks ADD COLUMN answer_snippet TEXT;
-- answer_snippet: AI 回答中提到品牌的那句話（方便人工確認準確性）
```

#### AI Visibility 週報自動產生規範

```yaml
ai_visibility_weekly_report:
  week: "2026-W23"
  brand: "{{brand_name}}"
  total_prompts_run: 50
  engines_tested: ["ChatGPT", "Gemini", "Perplexity", "Google AI Mode"]
  brand_mention_rate: "24%"
  avg_brand_rank: 2.3
  citation_rate: "8%"
  top_performing_prompts:
    - prompt: "台北水彩課程推薦"
      mention_rate: "80%"
      avg_rank: 1.5
  zero_mention_prompts:
    - prompt: "成人學水彩要多久？"
      recommendation: "新增此主題文章"
  accuracy_issues:
    - issue: "ChatGPT 誤標課程費用為 3000 元"
      affected_prompt: "水彩課程費用"
      action: "更新費用 FAQ 並加強 schema"
  competitor_share_of_voice:
    - competitor: "競品A"
      mention_rate: "36%"
      gap: "+12%"
```

---

## 36. Database Schema

### 36.1 projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT,
  language TEXT DEFAULT 'zh-TW',
  country TEXT DEFAULT 'TW',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.2 brand_profiles

```sql
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  entity_type TEXT DEFAULT 'Organization', -- Organization / Person
  brand_name TEXT,
  brand_description TEXT,
  author_bio TEXT,
  credentials TEXT,                        -- 資歷描述，用於 E-E-A-T 驗證
  schema_id_url TEXT,                      -- 綁定的 @id URL（如 https://example.com/#organization）
  tone TEXT,
  products JSONB,
  services JSONB,
  courses JSONB,
  pricing JSONB,
  locations JSONB,
  forbidden_claims JSONB,
  preferred_cta JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.3 keywords

```sql
CREATE TABLE keywords (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  keyword TEXT NOT NULL,
  volume INTEGER,
  cpc NUMERIC,
  difficulty NUMERIC,
  competition NUMERIC,
  intent TEXT,
  trend JSONB,
  source TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.4 topics

```sql
CREATE TABLE topics (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  topic TEXT NOT NULL,
  primary_keyword_id UUID REFERENCES keywords(id),
  secondary_keywords JSONB,
  intent TEXT,
  funnel_stage TEXT,
  opportunity_score NUMERIC,
  difficulty_score NUMERIC,
  ai_visibility_potential NUMERIC,
  recommended_template TEXT,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.5 content_briefs

```sql
CREATE TABLE content_briefs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  topic_id UUID REFERENCES topics(id),
  brief JSONB NOT NULL,
  status TEXT DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.6 articles

```sql
CREATE TABLE articles (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  brief_id UUID REFERENCES content_briefs(id),
  title TEXT,
  seo_title TEXT,
  meta_description TEXT,
  slug TEXT,
  excerpt TEXT,
  content_markdown TEXT,
  content_html TEXT,
  kadence_content TEXT,
  schema_json_ld JSONB,
  -- SEO / GEO
  intent_type TEXT,                        -- Info / Navigational / Commercial / Transactional
  semantic_coverage_score NUMERIC DEFAULT 0,
  semantic_gap_terms JSONB,               -- 缺漏的語意詞清單
  semantic_analysis_at TIMESTAMP,
  -- YMYL / Expert Review
  is_ymyl BOOLEAN DEFAULT false,
  reviewer_person_id UUID REFERENCES brand_profiles(id),
  reviewed_at TIMESTAMP,
  -- Indexing
  indexing_status TEXT DEFAULT 'pending', -- pending / submitted / indexed / failed
  indexing_submitted_at TIMESTAMP,
  indexing_response JSONB,
  -- Status
  status TEXT,                            -- draft / needs_review / published
  wp_post_id INTEGER,
  wp_post_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.7 faqs

```sql
CREATE TABLE faqs (
  id UUID PRIMARY KEY,
  article_id UUID REFERENCES articles(id),
  question TEXT,
  answer TEXT,
  type TEXT,
  intent TEXT,
  source TEXT,
  priority INTEGER,
  include_in_schema BOOLEAN DEFAULT true,
  include_in_page BOOLEAN DEFAULT true,
  internal_link_target TEXT,
  conversion_stage TEXT,
  faq_score NUMERIC,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.8 media_assets

```sql
CREATE TABLE media_assets (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  article_id UUID REFERENCES articles(id),
  type TEXT,                               -- image / video / dynamic_price_widget / citation_box
  prompt TEXT,
  alt_text TEXT,
  caption TEXT,
  file_url TEXT,
  wp_media_id INTEGER,
  related_section TEXT,
  -- Dynamic Pricing（Affiliate 用）
  dynamic_price_asin TEXT,
  dynamic_price_api_url TEXT,
  price_cache_ttl INTEGER DEFAULT 7200,    -- 快取秒數
  last_price_fetched_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 36.9 quality_scores

```sql
CREATE TABLE quality_scores (
  id UUID PRIMARY KEY,
  article_id UUID REFERENCES articles(id),
  seo_score NUMERIC,
  geo_score NUMERIC,
  ai_first_pick_readiness NUMERIC,
  helpfulness_score NUMERIC,
  eeat_score NUMERIC,
  readability_score NUMERIC,
  factuality_score NUMERIC,
  originality_score NUMERIC,
  spam_risk_score NUMERIC,
  issues JSONB,
  created_at TIMESTAMP
);
```

### 36.10 ai_visibility_checks

```sql
CREATE TABLE ai_visibility_checks (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  prompt TEXT,
  engine TEXT,
  response TEXT,
  brand_mentioned BOOLEAN,
  url_cited BOOLEAN,
  sentiment TEXT,
  competitors JSONB,
  accuracy_issues JSONB,
  checked_at TIMESTAMP
);
```

---

## 37. Prompt Templates

### 37.1 Topic Discovery Prompt

```text
你是一位 SEO/GEO strategist。請根據以下 seed keyword、網站主題、目標受眾與市場，產生 30 個高潛力內容主題。

輸入：
- Seed keyword: {{seed_keyword}}
- Website: {{website_url}}
- Brand: {{brand_name}}
- Country: {{country}}
- Language: {{language}}
- Audience: {{target_audience}}
- Business goal: {{business_goal}}

請輸出：
1. topic
2. primary keyword
3. secondary keywords
4. search intent
5. funnel stage
6. suggested content template
7. why this topic has SEO value
8. why this topic has GEO/AI citation potential
9. suggested CTA
10. priority score from 1-100
```

### 37.2 Content Brief Prompt

```text
你是一位資深 SEO content strategist 與 GEO strategist。請根據以下資料產生完整 content brief。

資料：
- Topic: {{topic}}
- Primary keyword: {{primary_keyword}}
- Secondary keywords: {{secondary_keywords}}
- Search intent: {{search_intent}}
- SERP competitor summary: {{serp_summary}}
- Brand knowledge: {{brand_profile}}
- Target audience: {{target_audience}}

請產生：
- SEO title candidates
- H1 candidates
- meta description candidates
- slug
- direct answer
- key takeaways
- detailed outline with H2/H3
- required comparison tables
- required bullet lists
- quote/expert note suggestions
- FAQ questions
- internal link suggestions
- image suggestions
- video script idea
- schema plan
- CTA
- GEO optimization notes
```

### 37.3 Article Generation Prompt

```text
你是一位專業 SEO/GEO writer。請根據 content brief 產生一篇繁體中文文章。

要求：
- 語言：zh-TW
- 語氣：專業、清楚、實用、可信
- 不要誇大
- 不要 keyword stuffing
- 每個 H2 段落都要解決明確問題
- 開頭要有直接答案
- 加入 key takeaways
- 加入表格、list、quote、FAQ
- 自然加入品牌資訊，但不要硬銷
- 每個重要段落提出圖片建議
- 最後加入 CTA
- 輸出 Markdown
```

### 37.4 GEO Audit Prompt

```text
請審核以下文章是否適合被 AI 搜尋系統理解、引用與推薦。

請評分：
1. Direct Answer Score
2. Entity Clarity Score
3. Citation Readiness Score
4. Table Extractability Score
5. FAQ Clarity Score
6. Author Expertise Score
7. Freshness Score
8. Media Context Score
9. Internal Link Context Score
10. Brand Consistency Score
11. AI First-Pick Readiness

請輸出：
- GEO Score 0-100
- AI First-Pick Readiness 0-100
- 主要問題
- 具體修改建議
- 建議新增段落
- 建議新增 FAQ
- 建議新增表格
```

---

## 38. MVP 規劃

### 38.1 MVP 目標

第一版只做最核心流程：

```text
輸入 keyword
→ 產生 brief
→ 產生文章
→ 產生 FAQ
→ 產生 schema
→ 產生圖片 prompt
→ 發布 WordPress draft
```

### 38.2 MVP 功能

| 功能 | 說明 |
|---|---|
| Project setup | 設定網站、語言、品牌資料 |
| Brand knowledge base | 品牌、作者、服務、課程、價格 |
| Keyword input | 手動輸入 keyword |
| Brief generator | 產生 content brief |
| Article generator | 產生完整 Markdown / HTML |
| SEO metadata | title、meta、slug、excerpt |
| FAQ generator | FAQ 內容與 FAQ schema |
| Schema generator | BlogPosting、Breadcrumb、FAQ |
| Image prompt generator | featured image + section images |
| WordPress connection | 連接 WP |
| Draft publisher | 發布草稿 |
| Quality score | SEO score + GEO score + AI First-Pick Readiness |
| Human review | 人工審核後才發布 |

### 38.3 MVP 不做

第一版暫不做：

```text
自動大量發布
完整 AI visibility tracker
完整 Semrush API dashboard
短影片自動生成
多客戶 agency 權限
完整 Kadence native serialization
```

---

## 39. Roadmap

### Phase 1: MVP

```text
單網站連接
品牌知識庫
keyword input
brief generator
article generator
FAQ/schema generator
image prompt generator
WP draft publishing
SEO/GEO/AI First-Pick score
```

### Phase 2: Research Automation

```text
GSC import
Semrush / SEO data provider integration
SERP analyzer
competitor outline extraction
topic scoring
content calendar
internal link suggestions
```

### Phase 3: Kadence Native + Schema Graph（原 Phase 3: Kadence Native）

```text
Kadence block templates
CTA block builder
FAQ accordion block
comparison table block
related posts block
reusable layout templates
Citation Box Block
Schema Linked Data Graph（@id 串連）
ItemList / SoftwareApplication schema
Expert Reviewed System（YMYL）
```

### Phase 4: AI Visibility + NLP + Indexing（原 Phase 4: AI Visibility）

```text
prompt tracking
AI mention tracking
competitor AI visibility
brand sentiment
accuracy issue detection
AI visibility report
NLP 語意覆蓋率分析
Google Indexing API 極速推送
```

### Phase 5: Agency / Scale + Monetization（原 Phase 5: Agency / Scale）

```text
multi-client dashboard
team permissions
approval workflow
white-label reports
bulk brief generation
bulk draft generation
content refresh automation
Live Pricing API（Amazon PAAPI / WooCommerce）
動態比較表自動更新
```

---

## 40. Pricing Model 建議

### Free / Trial

```text
1 個網站
每月 3 篇文章草稿
基本 SEO metadata
基本 FAQ
無 WP 自動發布
```

### Starter

```text
1 個網站
每月 20 篇文章草稿
WP draft publishing
SEO/GEO score
圖片 prompt
基本 schema
```

### Pro

```text
3 個網站
每月 100 篇文章草稿
GSC integration
SERP analyzer
internal link suggestions
content refresh
Kadence templates
```

### Agency

```text
20 個網站
多使用者
客戶審核
白標報告
批次 brief
批次 draft
AI visibility tracking
```

### Enterprise

```text
自訂網站數
自訂 LLM
自訂資料源
自訂安全規範
API access
私有部署
```

---

## 41. 成功指標

### 41.1 Product Metrics

```text
weekly active users
projects created
briefs generated
articles generated
drafts published
articles approved
time saved per article
```

### 41.2 SEO Metrics

```text
organic impressions
organic clicks
CTR
average position
indexed pages
top 3 keywords
top 10 keywords
content decay reduction
```

### 41.3 GEO / AI Metrics

```text
brand mentions in AI answers
URL citations in AI answers
AI share of voice
AI sentiment
prompt visibility
competitor comparison
accuracy score
```

### 41.4 Business Metrics

```text
trial to paid conversion
monthly recurring revenue
churn rate
average revenue per account
agency accounts
articles per paying user
```

---

## 42. Human Review Checklist

文章送出前，編輯必須確認：

```markdown
- [ ] 標題符合搜尋意圖
- [ ] 開頭有直接答案
- [ ] 內容不是 generic AI text
- [ ] 有品牌經驗、案例或觀點
- [ ] 沒有未驗證事實（所有 NEEDS_FACT_CHECK 標記已處理）
- [ ] 沒有誇大承諾
- [ ] 表格正確
- [ ] FAQ 正確
- [ ] 圖片 alt text 正確
- [ ] 圖片有 width / height 屬性（CWV）
- [ ] CTA 合理
- [ ] 內鏈正確
- [ ] schema 沒有標記頁面不存在內容
- [ ] Schema @id 節點是否正確串連
- [ ] Semantic Coverage Score 是否達到 75+
- [ ] YMYL 文章是否有 Expert Reviewed 區塊與 reviewedBy schema
- [ ] Citation Box 來源是否全部有效
- [ ] 聯盟連結是否有 rel="nofollow sponsored"
- [ ] WordPress preview 正常
- [ ] 手機版閱讀正常
- [ ] 內容沒有 spam / manipulation risk
- [ ] 發布後是否需要觸發 Google Indexing API 推送
```

---

## 43. 範例輸出文章 Markdown

```markdown
# 初學者如何選水彩課程？線上、實體、費用完整比較

## 快速答案

如果你是完全初學者，建議優先選擇有完整基礎流程、老師示範、練習作業與作品回饋的水彩課程。線上課適合時間彈性、自律學習的人；實體課則適合希望老師現場修正、需要陪伴與互動的人。選課時不要只看價格，也要看課程內容、老師風格、學生作品與課後支援。

## 重點整理

- 初學者應優先選有基礎筆法、水量控制與色彩練習的課程。
- 線上課較彈性，實體課較適合需要現場修正的人。
- 課程費用要看是否包含材料、作品指導與課後支援。
- 選課前應先看老師作品風格與學生完成作品。
- 如果目標是長期學習，建議選有系統進階規劃的課程。

## 線上水彩課和實體水彩課差在哪？

| 比較項目 | 線上水彩課 | 實體水彩課 |
|---|---|---|
| 時間彈性 | 高 | 中 |
| 老師即時修正 | 低 | 高 |
| 適合對象 | 自律學習者 | 完全初學者 |
| 費用 | 通常較低 | 通常較高 |
| 學習互動 | 較少 | 較多 |

> 老師建議：如果你第一次接觸水彩，實體課通常會更容易建立正確基礎，因為老師可以即時看到你的水量、筆觸和顏色控制問題。

## 初學者選水彩課程要看哪些重點？

### 1. 是否從基礎開始

好的初學者課程不應該一開始就要求你完成複雜作品，而是應該從工具認識、紙張選擇、顏料特性、水量控制與基本筆法開始。

### 2. 是否有清楚作品範例

課程頁面應該展示老師作品或學生作品，讓你知道課程最終會學到什麼程度。

### 3. 是否有回饋機制

如果課程只有影片，沒有作業回饋，初學者可能不知道自己錯在哪裡。若你需要穩定進步，建議選擇有老師回饋的課程。

## 常見問題

### 初學者需要先買很貴的水彩工具嗎？

不需要。初學者應先準備基本顏料、水彩紙、圓頭筆與調色盤即可。比起昂貴工具，更重要的是學會控制水量與顏色濃度。

### 線上水彩課適合完全新手嗎？

適合有自律能力的新手。如果你希望老師現場修正，實體課會更適合。

### 一堂水彩課通常多久？

常見課程時間約 2–3 小時，依課程難度與作品大小而不同。

## 結論

選水彩課程時，最重要的不是價格最低，而是課程是否符合你的學習階段。完全初學者建議從基礎技法、老師示範與作品回饋完整的課程開始，等掌握基本筆法和水量控制後，再進一步學習風格創作。

如果你想從零開始學水彩，可以先預約體驗課，了解自己適合線上學習還是實體教學。
```

---

## 44. 開發優先順序

### Must Have

```text
Project setup
Brand knowledge base
Keyword input
Brief generator
Article generator
SEO metadata generator
FAQ generator
Schema generator
Image prompt generator
WP draft publisher
Quality score
Human review
```

### Should Have

```text
GSC integration
SERP analyzer
Internal link suggestions
Kadence templates
Content refresh engine
NLP Semantic Coverage Score
Schema Linked Data Graph（@id 串連）
Google Indexing API 推送
Citation Box Block
```

### Could Have

```text
Semrush API integration
AI visibility tracker
Short video generator
Bulk draft generation
Agency dashboard
Expert Reviewed System（YMYL）
Live Pricing API（Affiliate 動態價格）
```

### Won't Have in MVP

```text
Guaranteed AI recommendation
Fully automated mass publishing
Unreviewed high-risk content
Native Kadence block serialization
```

---

## 45. 最終產品差異化

本產品的最強差異化不是「會寫文章」，而是：

```text
會判斷什麼值得寫
會判斷怎麼寫才有搜尋價值
會判斷怎麼寫才容易被 AI 理解
會自動評估語意覆蓋率並補強
會輸出 WordPress Kadence 可用的草稿
會加入圖片、影片、FAQ、schema、內鏈、Citation Box
會串連完整 Schema Linked Data Graph
會在 YMYL 內容自動加入專家審閱機制
會防止低品質 AI 內容傷害網站
會發布後自動推送 Google Indexing API 加速收錄
會追蹤 Google 與 AI 搜尋成效
會持續更新舊內容
```

最終定位：

```text
WordPress Kadence 專用的 AI SEO/GEO Content Intelligence & Publishing System
```

不是：

```text
大量 AI 產文工具
```

而是：

```text
能持續建立主題權威、搜尋可見度、AI 引用 readiness 與轉換能力的內容作業系統
```

---

## 46. 給開發 AI 的下一步要求

請根據本文件，依序產出：

```text
1. MVP 功能清單
2. 系統架構圖
3. 資料庫 schema
4. API route 設計
5. WordPress integration 設計
6. Prompt template 設計
7. SEO/GEO scoring engine 設計
8. FAQ module 設計
9. Kadence output builder 設計
10. 開發排程與 milestone
```

輸出時請優先考慮：

```text
可落地
可擴充
可維護
不違反 Google spam policies
不保證排名
不保證 AI 推薦
預設人工審核
先 draft，再 publish
```

---

## 47. 最終結論

這個產品應該被設計成：

```text
AI SEO/GEO Content Operating System
```

而不是：

```text
AI Article Spinner
```

核心策略是：

```text
用資料找主題
用 AI 產 brief
用 AI 產 draft
用品質門檻過濾
用 WordPress/Kadence 發布
用 GSC/GA4/ranking/AI visibility 回收成效
用 refresh engine 持續更新
```

真正的競爭力是：

```text
讓內容更可信
更清楚
更有經驗
更有結構
更容易被 Google index
更容易被 AI 摘要
更容易被使用者信任
更容易帶來轉換
```


---

## 48. 整合完整性註記

本最終大魔王版已整合兩份來源文件：

| 來源 | 用途 | 整合方式 |
|---|---|---|
| 使用者上傳 `wp-kadence-ai-seo-geo-content-engine-v3 (1).md` | 作為主幹 | 完整保留 v3.0 的強化架構與新增規格 |
| 前一版 `wp-kadence-ai-seo-geo-content-engine-final.md` | 作為補強來源 | 補回原始 final.md 的核心脈絡、章節命名與缺漏標題 |

完整性檢查：

```text
v3.0 source bytes: 92088
final.md source bytes: 62763
v3.0 sha256: b2578fc892e173fd1e21c194e9fdab7a7c72b2d47d059abb6e7fc96d242b4783
final.md sha256: 646910b3e2472d1c9762f35f32b7c05bec4a0dd3e77dc929b5c5caf3085cc70a
```

本文件採用「v3.0 為主、final.md 補強」策略；若兩份文件有重複內容，保留較完整、較新、較適合開發落地的版本。所有新增 v2/v3 強化項，包括 NLP 語意覆蓋、Schema Linked Data Graph、Expert Reviewed System、Citation Box、Google Indexing API、Live Pricing、Cannibalization 防護、Core Web Vitals、AI Visibility Prompt Database 與 DB 全面更新，均已保留。
