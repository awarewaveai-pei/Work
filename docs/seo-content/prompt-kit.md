# SEO/GEO 文章產出工具包（Prompt Kit）— 不寫程式版「引擎」

> 用途：把 `wp-kadence-ai-seo-geo-content-engine.md`（產品規格 SSOT）裡的規則，濃縮成**可直接貼進 Claude / ChatGPT 重複使用**的提示詞流程。
> 給誰：不想等系統開發完、現在就要產 SEO/GEO 文章的人。**首要用途：https://soulfulexpression.org/ — art-based healing 教育法（EdD 申請 + 公開大眾）。**
> 流程：填一次品牌檔 → 每篇文章跑 5 步 → 過品質閘 → 貼進 WordPress Kadence 草稿。
> 對應規格章節都標在每步標題後（例：`§13`），要細節回去查 SSOT。
>
> **⚠️ 定位鐵則（每步都套用，因為這是 EdD + 心理健康/YMYL 領域）：**
> - 定位為「**art-based healing 教育性 / 表達藝術方法**」，**不是臨床 art therapy**。只在「做出區分」時提 art therapy，不用它描述你自己的服務。
> - **禁止**療效保證字眼：cure / heal / fix / treat / guaranteed / 保證 / 療癒疾病。
> - EdD 可信度：能引用就引用真實學術來源（peer-reviewed / 權威機構），放進 References / Citation Box。
> - 每篇放 disclaimer（非醫療/心理治療替代）+ 在地危機專線（台灣 1925 安心專線 / 1995 生命線）。
> - 主語系 **英文**（en）；需要中文版時做雙語 + hreflang（§25.6）。

---

## STEP 0｜品牌知識庫（填一次，之後每步都貼上去）｜§8.6 §19

把下面填好，存起來。每次產文時整段貼進對話最前面。**AI 不准自行發明這裡沒有的資訊**（價格、資歷、媒體報導、評論）；缺的標 `NEEDS_BRAND_VERIFY`。

```yaml
brand_name: "Pei-Jing Art Studio"
alternate_names: ["Pei Jing Art Studio", "佩瑾水彩工作室"]   # 確認正確中文名
website: "https://?"                                          # NEEDS_BRAND_VERIFY
logo_url: "https://?"
founder_name: "?"                                             # NEEDS_BRAND_VERIFY
author_bio: "有 ? 年水彩教學經驗，專注成人初學者課程設計。"   # 只寫真實資歷
credentials: []                                               # 學歷/證照/獲獎，沒有就留空，不要編
services: ["成人初學者水彩課", "線上水彩課"]                   # 改成你真的有的
courses: []                                                   # 課名/時數/形式
pricing: []                                                   # 真實價格區間；沒公開就留空
locations: []                                                 # 實體教室地址/服務地區
case_studies: []                                              # 學生作品/成果（真實）
testimonials: []                                              # 真實評價
brand_voice: "專業、溫暖、實用、不誇大、像在跟初學者聊天"
preferred_cta: ["預約體驗課", "加入課程候補名單", "私訊詢問"]
forbidden_claims: ["保證學會", "保證成為畫家", "業界第一", "唯一"]
social_profiles:                                              # sameAs，要真實存在且公開
  - "https://www.instagram.com/?"
  - "https://www.youtube.com/@?"
```

---

## STEP 1｜找主題｜§9 §37.1

貼上「品牌知識庫」後，接這段：

```text
你是資深 SEO/GEO strategist。根據上面的品牌知識庫，針對 seed keyword「{{你的關鍵字，例如：水彩課程}}」，
產生 15 個高潛力文章主題。每個主題輸出：
1. topic（標題方向）
2. primary keyword
3. secondary keywords（3-5 個）
4. search intent（Know / Do / Buy / Compare / Local / Trust 其一）
5. funnel stage（TOFU / MOFU / BOFU）
6. 建議模板（how-to / best-x / comparison / review / local / course / pillar / cluster）
7. 為什麼有 SEO 價值（一句）
8. 為什麼有 AI 引用潛力（一句）
9. opportunity score 1-100（並說明扣分原因，例如競爭高、可能與既有文章打架）

規則：不要堆關鍵字、不要保證排名、優先選「我這種小工作室真的寫得出第一手經驗」的主題。
依 opportunity score 由高到低排序。
```

→ 從清單挑 1 個主題進 STEP 2。

---

## STEP 2｜產 Content Brief｜§13 §37.2

```text
延續上面。為主題「{{選定主題}}」產出完整 content brief，格式如下 YAML：

content_brief:
  topic: ""
  primary_keyword: ""
  secondary_keywords: []
  search_intent: ""
  funnel_stage: ""
  recommended_template: ""
  target_word_count: 1800        # 比較文/清單文可到 2200
  seo_title_candidates: []       # 3 個，50-60 字元，含主意圖+主關鍵字，不誇大
  meta_description_candidates: []# 2 個，120-160 字元
  slug_candidates: []            # 英文、短、含主關鍵字
  direct_answer: ""              # 80-150 字，開頭直接回答主問題
  key_takeaways: []              # 4-5 條
  outline:                       # 每個 H2 標清楚要解決什麼問題
    - h2: ""
      required_points: []
      media_needed: true/false
  required_tables: []            # 例：線上 vs 實體比較表
  faq_questions: []              # 5-8 題，像真人會問、每題只問一件事
  internal_link_targets: []      # 建議連到的站內文章（先寫主題，沒有就標 gap）
  schema_plan: ["BlogPosting", "BreadcrumbList", "FAQPage", "Person", "Organization"]
  image_plan: []                 # 每張：用途+建議畫面+alt 方向
  cta: { primary: "", secondary: "" }
  geo_requirements: { direct_answer: true, comparison_table: true, author_experience: true, freshness_note: true }

規則：outline 每段必須能獨立回答一個搜尋者的問題；不要為了字數灌水。
```

---

## STEP 3｜產文章正文｜§14 §15 §37.3

```text
延續上面。你是專業 SEO/GEO writer。依 content brief 產出一篇繁體中文文章，輸出 Markdown。

結構（依序）：
1. # H1
2. ## 快速答案（80-150 字，第一句就給答案）
3. ## 重點整理（4-5 條 bullet）
4. 主內容（每個 H2 對應 brief outline，解決一個明確問題）
5. 至少一個比較表 或 評選標準表
6. 一句專家 quote（> 引言，標「老師建議：」，內容必須是真實可成立的觀點，不誇大）
7. ## 常見問題（5-8 題，答案 40-120 字，第一句直接答）
8. ## 結論 + CTA（用 preferred_cta）

硬規則：
- 不誇大、不保證排名、不用 forbidden_claims 裡的詞
- 不 keyword stuffing（主關鍵字自然出現即可）
- 品牌/價格/資歷只能用知識庫裡的；要用到但知識庫沒有 → 該句後面標 <!-- NEEDS_BRAND_VERIFY -->
- 任何統計數字/研究/最高級形容（最大/唯一/最新）→ 該句後標 <!-- NEEDS_FACT_CHECK -->
- 每個重要段落後用註解標圖片建議：<!-- IMG: 用途 | 畫面 | alt -->
- FAQ 答案要能被 AI 單獨抽出來看懂（少用「這個」「上面說的」這種代名詞，必要時帶品牌/地點名）
```

---

## STEP 4｜產 Schema（JSON-LD @id 串連圖）｜§25.7 §17.9

```text
延續上面文章。產出一段 JSON-LD（放在 <head> 或文章底部 Custom HTML），用 @id 串連節點：
WebSite → Organization → Person(作者) → BlogPosting，BlogPosting 的 author 用 @id 指向 Person、
publisher 用 @id 指向 Organization。再加：
- BreadcrumbList
- FAQPage（只放文章裡「實際可見」的那幾題 FAQ，問題與答案文字必須與正文一字不差）

規則：所有 @id URL 用 website 欄位推導（例 https://網域/#organization、https://網域/about/#author、
https://網域/{{slug}}/#article）。不要放頁面上看不到的內容。不要偽造 rating/review。
```

---

## STEP 5｜品質閘 GEO 審核｜§32 §18.3 §37.4

把 STEP 3 的文章貼回去，接這段。**沒過就退回對應 STEP 補**：

```text
審核這篇文章是否適合被 Google 與 AI 搜尋理解、引用、推薦。逐項回答 PASS/FAIL，FAIL 給具體修法：

格式（§22）
- [ ] 有 H1、開頭 80-150 字直接答案、重點整理
- [ ] 有比較表 或 評選標準表
SEO（§16 §29）
- [ ] seo_title 含主意圖+主關鍵字、不誇大、50-60 字元
- [ ] meta description 說明讀者會得到什麼、120-160 字元
- [ ] slug 短且含主關鍵字
GEO / AI First-Pick（§18.3）
- [ ] 每個 FAQ 答案可被單獨抽出理解（無模糊代名詞、含必要 entity）
- [ ] 作者/品牌經驗有出現
- [ ] 有可信來源或第一手經驗（非純改寫）
事實/品牌（§20.4 §19.3）
- [ ] 沒有未標記的統計數字（都標了 NEEDS_FACT_CHECK）
- [ ] 沒有 AI 自行發明的品牌/價格/資歷/評論
- [ ] 沒有 forbidden_claims 裡的詞、沒有保證式說法
反垃圾（§33.3）
- [ ] 不是純改寫競品、有真實價值與觀點

最後給：SEO Score 0-100、GEO Score 0-100、AI First-Pick Readiness 0-100、與「最優先要改的 3 件事」。
```

---

## STEP 6｜貼進 WordPress Kadence（人工，§30 §31 §42）

1. WP 後台 → 文章 → 新增 → 貼 Markdown（或用區塊：標題=Advanced Heading、摘要=Info Box、表格=Advanced Table、FAQ=Accordion、CTA=Row+Advanced Button）。
2. 快速答案那段的外層 `<div>` 加 class `direct-answer`、重點整理加 `key-takeaways`、FAQ 答案加 `faq-answer`（給 Speakable 用，§25.4）。
3. JSON-LD 貼進 Custom HTML 區塊或用 RankMath/Yoast 的 schema 欄位。
4. 設 SEO title、meta description、slug、分類、標籤、featured image（alt 要填）。
5. 圖片：每張填 alt + caption + 描述性檔名；featured image 加 `fetchpriority="high"`，其餘 `loading="lazy"`，都要有 width/height（防 CLS，§22.3）。
6. **存草稿，人工讀過再發**（規格鐵則：預設人工審核，§3.2 §32.3）。
7. 跑一次 STEP 0 §42 的 Human Review Checklist。

---

## 重複使用方式

- 每篇新文章：貼【STEP 0 品牌檔】→ 跑 STEP 1~5 → STEP 6 貼站。
- 同一主題群（pillar + cluster，§21）：先寫 pillar，再寫 cluster，每篇 cluster 在 internal_link_targets 連回 pillar。
- 舊文更新（§34）：把舊文貼進 STEP 5 審核，依「最優先改的 3 件事」用 STEP 3 局部重寫。

## 注意（務實提醒）

- 規格裡的 SurferSEO / NeuronWriter / Semrush / Amazon PAAPI / Google Indexing API 都是**付費或有門檻的進階功能**，個人工作室 STEP 1-6 不需要它們也能產出合規好文。要不要上，看 `spec-review-and-gaps.md`。
