# Spec 補強：`wp-kadence-ai-seo-geo-content-engine.md` 落地審查

> 對象：上面那份 3920 行產品規格。下面是**真實會踩到的問題**（不是抓字），加上「對 Soulful Expression（art-based healing / EdD / 公開）這個首要用途，該做什麼、該跳過什麼」。
> 審查日期：2026-06-06。

## A. 過時 / 風險：Google 功能已變，規格沒跟上

| # | 規格章節 | 問題 | 建議 |
|---|---|---|---|
| A1 | §31.5 Google Indexing API | Indexing API **官方只支援 JobPosting / BroadcastEvent** 兩種頁面。拿來推一般文章是「非預期用途」，Google 明文不保證、且可能被收回 API 權限。規格寫「實務上仍有加速效果」已不可靠。 | 一般文章改用 **GSC「網址審查 → 要求建立索引」** + **sitemap 自動 ping**。Indexing API 只留給真的有 JobPosting 的頁面。 |
| A2 | §25.5 HowTo schema | Google **2023/08 全面移除 HowTo rich result**。schema 仍可被解析，但不會有 SERP 視覺效果。規格把它當「有價值的曝光手段」。 | 保留 HowTo 給 AI/語意理解即可，不要當 CTR 工具；UI 規劃別假設有 rich result。 |
| A3 | §17 FAQ schema | Google **2023/08 起 FAQ rich result 只給權威政府/衛生網站**。一般網站幾乎不會顯示。規格部分有意識到，但沒講清楚。 | FAQ schema 留作 **AI 抽取 + 結構價值**，不要期待 rich result CTR。規格 §17.1 的定位是對的，文件要把「幾乎不再顯示」寫明。 |
| A4 | §25.4 Speakable | Speakable **目前限新聞發布者、主要 US 英文**。一般 wellbeing 網站用了不會生效。 | 可加 class（無害），但別當功能賣點；移到「實驗性」。 |

## B. 設計缺口：規格自相引用但沒補齊

| # | 章節 | 缺口 | 建議 |
|---|---|---|---|
| B1 | §10 Opportunity Score | 公式有兩個 `-0.10` 懲罰項，但各子分數範圍、最終 clamp 都沒定義 → 分數可能變負、跨主題不可比。 | 定義每個子分數 0–100、最終 `clamp(0,100)`、懲罰項上限。否則排序失真。 |
| B2 | §36 DB schema vs §21 內鏈/cluster | §21 講 pillar/cluster 內鏈圖與 §21.5 用 embedding 算 cannibalization，但 DB **沒有**內鏈關係表、**沒有** embedding/向量欄位（pgvector）。 | 加 `internal_links` 表（from_article / to_article / anchor）+ `topics.title_embedding vector` + pgvector。 |
| B3 | §40 Pricing vs 成本 | 賣「每月 100 篇」但全規格**沒有 LLM token 成本 / 生成成本**模型。 | 加 per-article 成本估算與每方案 token 上限，否則定價會虧。 |
| B4 | §26 Freshness | 講 dateModified 重要，但沒講**何時、由誰自動更新** dateModified（避免假新鮮）。 | 定義：實質內容變更才更新 dateModified；純 typo 不算。 |
| B5 | §19.5 YMYL | 有 reviewer 機制，但**沒處理「受規管頭銜」風險**（把非臨床服務叫 "art therapy / art therapist" 在很多地區是違規的）。← **直接影響你**。 | 加一條：受規管詞彙（therapist/therapy/psychologist/medical）需法務/專業確認才可用，否則用教育性替代詞。 |

## C. 對 Soulful Expression（你的首要用途）的取捨

你是個人教育者、用於 **EdD 申請 + 公開大眾**、領域是 **art-based healing（教育性，非臨床）**。規格是「企業 SaaS 大魔王版」，大部分先不用碰。

**現在就做（零或低成本，已備好）：**
- ✅ 用 `prompt-kit.md` STEP 0–6 產文（不需任何付費 API）。
- ✅ 第一篇 `articles/what-is-art-based-healing.md` 已是合規範本，填真資料即可上。
- ✅ 每篇做好：direct answer + key takeaways + 比較表 + FAQ + @id schema graph + disclaimer + 真實 References（EdD 可信度關鍵）。
- ✅ 索引：發布後手動到 GSC「要求建立索引」（不要碰 Indexing API）。

**該跳過 / 之後再說：**
- ⛔ Google Indexing API（A1）、Live Pricing / Amazon PAAPI（§31.6，affiliate 才需要，跟你無關）。
- ⛔ SurferSEO / NeuronWriter / Semrush 付費 NLP（§10.1）— 個人用不划算；要語意覆蓋，叫 AI 直接對照前 10 名競品列缺漏詞即可。
- ⛔ AI Visibility Tracker、Agency dashboard、多客戶（§35 §40）— 企業功能。
- ⛔ 全自動大量發布 — 規格自己也禁（§33），你更不該做。

**對你特別重要（YMYL + EdD）：**
- 🔶 用 **art-based healing / expressive-arts 教育法** 定位，"art therapy" 只用來做區分（見 B5、文章 §positioning）。
- 🔶 每篇 References 放真實可引用學術來源 → 同時服務「被 AI 引用」與「EdD 審查可信度」。
- 🔶 disclaimer + 台灣危機專線（1925 / 1995）。
- 🔶 不用任何 cure/heal/treat/guaranteed 字眼。

## D. 規格本身要不要改？

規格是「給開發 AI 的藍圖」，方向沒問題，不必大改。建議在 SSOT 補一個 **「Errata / 平台現況」附註**，把 A1–A4 與 B5 寫進去（避免之後照舊規格開發 Indexing API / FAQ rich result 而白做）。要的話我可以直接加一節到 `wp-kadence-ai-seo-geo-content-engine.md`。
