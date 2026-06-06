---
slug: seo-geo-content
created_utc: 2026-06-06T12:44:33Z
hint: "SEO/GEO content engine + 2-Gem system (onboarding + content) for Soulful Expression art-based healing — positioning locked, articles, spec errata, client-vs-generic split"
source_session_summary: "Productised the SEO/GEO content spec into a reusable no-code engine (prompt kit + 2 Gem specs) and produced the first real article for Soulful Expression, with locked positioning."
---

## 1. 任務目標
把 `docs/wp-kadence-ai-seo-geo-content-engine.md`（3920 行產品 spec）落地成可用資產：通用產文引擎（prompt-kit + 2 顆 Gem）+ Soulful Expression 客戶層內容（定位+文章），供 EdD 申請與公開大眾用。

## 2. 為什麼做
客戶 Soulful Expression（art-based healing）要實際產 SEO/GEO 文章；老闆 Pei-Ching Huang 同時要拿來佐證 EdD 申請。需求已明確、定位已拍板，缺真實資料填入即可上線。

## 3. 已試過
- 讀完整份 spec（3920 行）+ 抓真實 context：WebFetch soulfulexpression.org + 讀 tenant PROFILE。
- 定位拍板（鎖定）：公開門面 **Arts Practice for Self-Discovery**；學術/EdD 框架 **Arts-Based Reflective Pedagogy**（理論 Schön/Kolb/Mezirow）；**非臨床 art therapy**（受規管詞避用）。
- 域名決策：**保留 soulfulexpression.org**（域名關鍵字對 SEO 無影響；真風險是品牌紅海撞名 → 解法 = 獨佔 `WuSheng Healing Module™`）。
- 產出 5 檔（見 §6）。Gem 從「合併版」改拆成 **Gem 1 onboarding / Gem 2 content** 兩顆（老闆要求分開）。
- **未動** `docs/wp-kadence-...md`（另一 AI 在編，老闆喊停）；spec errata（A1–B5）暫存 `spec-review-and-gaps.md`。

## 4. 卡在哪
等老闆補真實資料（頭銜/EdD 進程、session 時長 format、公開價格、真實 IG、2–4 篇可引用學術文獻），才能把文章 placeholder 填成可發布版。非技術阻塞。

## 5. 下一步指令
1. 收到老闆真實資料 → 編輯 `$WORK_ROOT/agency-os/tenants/company-soulful-expression/sites/soulfulexpression-org/content/CONTENT_STRATEGY.md` §5 品牌知識庫 + §8 待補清單。
2. 把 `$WORK_ROOT/docs/seo-content/articles/what-is-art-based-healing.md` 內所有 `NEEDS_BRAND_VERIFY`/`NEEDS_FACT_CHECK`/`NEEDS_REVIEWER` 換成真值或刪除；補真實學術引用（Schön 1983 / Kolb 1984 / Mezirow 1991 版次 + Eisner/Barone&Leavy）。
3. 把該文章**搬進** tenant content 層：`agency-os/tenants/company-soulful-expression/sites/soulfulexpression-org/content/articles/`（目前還在 `docs/seo-content/articles/`，client-vs-generic 分層未完）。
4. 把 `docs/seo-content/prompt-kit.md` STEP 0 還原成通用 placeholder（目前填了 Soulful，應通用化；客戶值已在 CONTENT_STRATEGY）。
5. （可選）部署 2 顆 Gem：照 `GEM-1-onboarding-positioning.md` / `GEM-2-seo-geo-content-engine.md` §3 貼進 Gemini，用 §4 測試 prompts 驗 YMYL 護欄。
6. spec errata（A1–B5）：等另一 AI 收手後，`git pull` 讀最新 spec，再把 §49 Errata 區補進 `docs/wp-kadence-ai-seo-geo-content-engine.md`（內容已備在 `spec-review-and-gaps.md`）。**動前確認 mtime 沒被覆蓋。**

## 6. 相關資源
- **Files（通用引擎層）**：`$WORK_ROOT/docs/seo-content/prompt-kit.md`、`GEM-1-onboarding-positioning.md`、`GEM-2-seo-geo-content-engine.md`、`spec-review-and-gaps.md`；文章草稿 `$WORK_ROOT/docs/seo-content/articles/what-is-art-based-healing.md`
- **Files（客戶層）**：`$WORK_ROOT/agency-os/tenants/company-soulful-expression/sites/soulfulexpression-org/content/CONTENT_STRATEGY.md`
- **Spec SSOT**：`$WORK_ROOT/docs/wp-kadence-ai-seo-geo-content-engine.md`（§49 Errata 待補）
- **Known landmines**：
  - spec 檔有**另一 AI 並行編輯** → 不要直接寫，先 pull + 確認 mtime。
  - 相關平行 packet：`handoffs/2026-06-06-2029-tomo-202949.md`（同 session 線「Content Engine Phase 1 MVP soulful 發第一篇 draft」）— 互補，勿重工。
  - **YMYL**：art-based healing = 心理健康領域。禁療效保證；"therapy/therapist" 受規管不可自稱；每篇要 disclaimer + 台灣危機專線 1925/1995。
  - SEO 平台現況（A1–A4）：Google Indexing API 僅 JobPosting；FAQ/HowTo rich result 已砍；別當功能賣點。
