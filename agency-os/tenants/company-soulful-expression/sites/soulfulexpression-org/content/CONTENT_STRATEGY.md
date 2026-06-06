# Soulful Expression — SEO/GEO Content Strategy (SSOT)

> Client: Soulful Expression（tenant `company-soulful-expression`）｜ Site: https://soulfulexpression.org/
> Scope: 內容（SEO/GEO 文章）策略與品牌定位的客戶層 SSOT。**通用產生引擎**（不分客戶）在 `docs/seo-content/prompt-kit.md`；本檔放 Soulful 專屬決策與品牌檔。
> 產業：therapy / wellness（**YMYL**）。用途：EdD 申請佐證 + 公開大眾。語系：英文為主。
> 決策日期：2026-06-06（Pei-Ching Huang 拍板）。

---

## 1. 定位（鎖定）

| 層 | 用詞 | 給誰 | 調性 |
|---|---|---|---|
| 公開門面 / 域名 / 大眾 | **Arts Practice for Self-Discovery** | 客戶、訪客 | 溫暖、感性、好懂 |
| 學術 / EdD / about / method 頁 | **Arts-Based Reflective Pedagogy** | EdD 委員、同行 | 理論、嚴謹 |

- 理論基礎（EdD 引用骨架）：Schön 反思實踐 (reflective practice) · Kolb 經驗學習 (experiential learning) · Mezirow 轉化學習 (transformative learning)。
- **不是臨床 art therapy**。"art therapy / therapist" 只用於「做出區分」，**絕不**用來描述自家服務（受規管頭銜風險，見 `docs/seo-content/spec-review-and-gaps.md` B5）。
- 禁用語：cure / heal illness / treat / diagnose / guaranteed results / 保證。
- 每篇 wellbeing 文章需附 disclaimer + 台灣危機專線（1925 安心專線 / 1995 生命線）。

一句定義（可直接用）：
> *Arts-Based Reflective Pedagogy is an educational approach that uses creative art-making as a medium for reflection and self-discovery, grounded in reflective practice (Schön), experiential learning (Kolb), and transformative learning (Mezirow).*

## 2. 域名決策：**保留 soulfulexpression.org**

- 不換。新站、`.org`（教育/使命味，利 EdD）、已排「soulful expression healing through art」第一。
- 域名關鍵字對 SEO/GEO **無影響**（EMD 紅利 2012 已死）；排名靠內容/標題/權威，不靠域名。
- 真正風險不是域名，是**品牌名在紅海撞名**（Soul Expression Arts / Soulful Art Studio / Heart & Soul Healing Art Studio… 一堆近似名）。

## 3. 核心策略：獨佔 **WuSheng Healing Module™（五聲）**

- 通用名「Soulful Expression」跟 8+ 個 clone 搶；**WuSheng 跟 0 個搶**。
- 重壓獨特詞 = Google/AI 一搜只有你，entity disambiguation 最乾淨。
- 行動：把 Pei-Ching Huang 定位為「the WuSheng Method 創始人」；WuSheng 寫成獨立 pillar 文章。

## 4. Entity 強化清單（比換域名有用 100×）

- [ ] 全網品牌名稱統一（site title / footer / schema / 社群一致）
- [ ] Organization + WebSite + Person schema，用 `@id` 串連（見文章範本）
- [ ] `sameAs` 連到所有真實社群（IG…）
- [ ] Google Business Profile 建好（NAP 一致）
- [ ] 學術身分掛在「Pei-Ching Huang」：about 頁 + LinkedIn + ORCID（EdD 研究者身分，跟域名無關）
- [ ] `/method`（或 `/approach`）頁正式介紹 Arts-Based Reflective Pedagogy + 三理論
- [ ] 首頁 bridging tagline：`Soulful Expression — Arts Practice for Self-Discovery`

## 5. 品牌知識庫（填一次，產文時貼給 AI；待補項禁止 AI 自行發明）

```yaml
brand_name: "Soulful Expression"
public_label: "Arts Practice for Self-Discovery"
academic_framework: "Arts-Based Reflective Pedagogy"
theory_base: ["Schön reflective practice", "Kolb experiential learning", "Mezirow transformative learning"]
signature_method: "WuSheng Healing Module™"
website: "https://soulfulexpression.org/"
founder_name: "Pei-Ching Huang"
author_role: "Arts-Based Educator / EdD candidate"        # 確認頭銜
credentials: []                                            # 學歷/受訓/EdD 進程；待補，不編
services: ["guided sessions", "healing modules", "assessments", "self-guided kits", "tool finder"]
pricing: []                                                # 公開才填
locations: ["Taiwan (+ international, online)"]
brand_voice: "warm, credible, educational, gentle, non-clinical"
preferred_cta: ["Start Your Journey (assessment)", "Book a Session", "Explore Healing Modules"]
forbidden_claims: ["cure", "heal/treat illness", "guaranteed results", "替代醫療/心理治療", "diagnose"]
social_profiles: ["https://www.instagram.com/?"]           # 待補真實
crisis_line_localised: "台灣 1925 安心專線 / 1995 生命線"
```

## 6. 文章 roadmap（pillar → cluster）

| # | 主題 | 型 | 狀態 |
|---|---|---|---|
| 1 | What Is Art-Based Healing? (Arts Practice for Self-Discovery) | pillar | ✅ 草稿 `content/articles/what-is-art-based-healing.md`（待填真資料） |
| 2 | The WuSheng Healing Module™ — 五聲 method explained | pillar（獨特詞） | 待寫 |
| 3 | Do you need art skills to start? | cluster | 待寫 |
| 4 | Art journaling for self-reflection | cluster | 待寫 |
| 5 | Art-based healing vs clinical art therapy（區分頁） | cluster | 待寫 |

## 7. 產文流程

用 `docs/seo-content/prompt-kit.md` STEP 1–6，STEP 0 貼上面 §5 品牌知識庫。每篇過 Quality Gate + YMYL 檢查（disclaimer / 無療效保證 / 受規管詞）後存 WP **草稿**，人工審再發。

## 8. 待補（Pei-Ching 提供後才能上線）

1. 頭銜 / EdD 進程（真實）
2. session 時長、format、公開價格（有的話）
3. 真實 IG / 社群連結
4. 2–4 篇可引用學術文獻（Schön/Kolb/Mezirow 版次 + Eisner/Barone & Leavy）
