# CONTENT PIPELINE BLOCKS — MASTER PLAN

> **2026-10-24 起被取代（P5／P6／P9 與之後的自動化）**：全自動內容管線（題目佇列、排程、品牌聲音、社群、影片、YouTube）的 SSOT 是 [`../AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md`](../AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md)，進度看該檔 §10。本檔 §0.5 A 段（已完成的積木）仍是事實紀錄；B 段 P5（社群已由 social 產品實作）、P6、P9 改由新計畫的 P2／P4／P6 處理。

> **這份是什麼**：繁中內容生產管線（搜尋熱點 → 文章 → 品質 → 影片 → 發佈）以「積木（block）registry」收斂成**無人值守自動化管線**的**單一藍圖 SSOT**。
> **給 AI 看的開工指南**：任何 session 接到「video generator / 內容管線 / content pipeline / 積木 / Postiz / 自動發佈」相關任務，**先讀這份**，照「§0 開工必讀」5 分鐘掌握現況、紅線、下一步。
> **狀態**：藍圖已定 + 真實 code 校正（file:line 佐證）+ **方向決策已鎖定**（見下）。**程式碼尚未動工**（P0 doc 完成；P1 起待 go-ahead）。
> **已鎖定決策（2026-06-16，operator 授權「你決定」）**：① 順序 **T1**＝先收斂既有積木、影片最後 ② 範圍 **S1**＝全 kind 收斂成 headless 自動化骨架 ③ 影片 **A2**＝Python 微服務 ④ 發佈唯二路徑＝Postiz(社群)+wp-bridge(WP)，**刪 publisher.py 直連**。
> **最後更新**：2026-06-16（v3，鎖定方向決策 + 加入 §0.5 進度總帳）
> **負責層級**：架構師 / 工程 / 安全 / QA / PM（R0 全程適用）
>
> **⚠️ 給每個 session 的鐵律**：完成任一階段 → **立刻更新 §0.5 進度總帳的狀態欄 + 填 commit hash**。總帳是「做過/沒做」的唯一真相；plan 其餘段落是設計依據，進度只看 §0.5。

---

## §0 開工必讀（按順序，5 分鐘掌握全局）

1. **本檔 §2 系統真相**（兩層架構）— 先懂「積木 registry vs 成熟 route 管線」的關係
2. **本檔 §3 完整現況表**（20 route + 5 積木，file:line）— 哪些活著、哪個是唯一缺口
3. **本檔 §6 紅線 R1–R9** — 動手前必懂（影片 deferral、禁兩套社群、永遠 draft-first…）
4. **本檔 §10 分階段** — 從哪一步開始
5. `lib/content/blocks/registry.ts` — 積木合約（real code，`BlockKind:18`）
6. `lib/content/trending-sources.ts` — 唯一已收斂的積木家族（search）
7. `agency-os/reports/decisions/2026-06-15-build-zh-tw-content-pipeline.md:197-200` — **影片生成被明確 DEFER 到 post-Wave-2**
8. `docs/wp-kadence-ai-seo-geo-content-engine.md:131-151`（§3.2 反批量）+ `:444`（Short Video = P2）
9. `agency-os/docs/operations/POSTIZ_SOCIAL_PUBLISHING_PLAN.md` — Postiz 已部署、整合 Task 3 未動

**一句話現況**：管線「文章生成 / 品質 / WordPress 發佈」**早就是 production code**（20 個 route），只是**只有 search 那層真的包成積木**；**影片是唯一零實作的 kind，而且被一份已簽決策 defer 到 post-Wave-2**；Postiz 社群發佈已部署但**零整合碼**；Python `publisher.py` 的 10 平台直連**重複且踩紅線**（要刪不要接）。

---

## §0.5 進度總帳（STATUS LEDGER — 唯一進度真相，每階段完成必更新）

> 圖例：✅ 已完成 ｜ 🚧 進行中 ｜ 🔲 待做 ｜ ⛔ 卡住(等決策/憑證) ｜ 🗑️ 待刪

### A. 已完成 ✅（**別重做** — 這些是地基）
| # | 項目 | 證據 file:line / commit |
|---|---|---|
| A1 | 積木 registry 合約（register/byKind/listAll/geoMatch）| registry.ts:18,40,51,56,66 |
| A2 | **search 積木家族**（google-news/reddit/ptt/serper/env-feed/DB 臨時源）| trending-sources.ts:246,261,279,307,342,200 |
| A3 | **article route ×7**（generate 串流/title/keywords/outline/related-posts/humanize/drafts）；generate P2 後抽成 core，route 為薄殼、積木共用 | article/generate-core.ts `prepareArticleGeneration`/`streamArticleGeneration`、generate/route.ts（HTTP 殼）、blocks/article-generate.ts（積木）；title:8、keywords:8、outline:10、related-posts:15、humanize:22、drafts:72 |
| A4 | brand-voice route | brand-voice/route.ts:34 |
| A5 | **quality route ×3**（seo-check RankMath 16 點/seo-fix/image Flux）；seo-check P3 後抽成 core，route 為薄殼、積木共用 | quality/seo-check-core.ts `runSeoCheck`、seo-check/route.ts（HTTP 殼）、blocks/seo-check.ts（積木）；seo-fix:28、image:67 |
| A6 | **publish 核心**（wp-bridge Ed25519 + 標準 REST 雙路徑，**draft-first**）；P1 後抽成 core，route 為薄殼、積木共用 | wordpress-core.ts:283 `publishToWordPress`、publish/route.ts（HTTP 殼）、blocks/publish-wordpress.ts（積木）|
| A7 | wp-post / newsletter(FluentCRM 草稿) / calendar | wp-post:19、newsletter:132、calendar:69 |
| A8 | WP 站台 CRUD（sites / [id] / test）| sites/route.ts |
| A9 | ContentStudio UI（4 tab，全活）| ContentStudio.tsx |
| A10 | DB migration 0041 drafts / 0042 content_sources | migrations/ |
| A11 | **Postiz 已部署**（v2.11.3 EU，postiz.aware-wave.com）| commit a951190c（2026-06-14）|
| A12 | 本檔藍圖 + 進度總帳（P0）| 本檔 v3 |

### B. 待做 🔲（依鎖定順序 T1：先收斂、影片最後）
| Phase | 項目 | 狀態 | commit | 風險 | go-ahead |
|---|---|---|---|---|---|
| **P0** | 藍圖 + 進度總帳 | ✅ | （本次）| Low | — |
| **P1** | `publish/wordpress` 抽 core + 包積木（行為保留）| ✅ | a488ae79（core/route/積木）+ 收尾本次 | Low-Med | ✓ |
| **P2** | `article/generate` 抽 core + 包積木（行為保留：route 薄殼共用 core 串流，積木 headless 收集）| ✅ | 76f2d262（core/route/積木）+ bc405328（abort belt-and-suspenders 修）+ 收尾本次 | Low-Med | ✓ |
| **P3** | `quality/check`(seo-check) 抽 core + 包積木（行為保留：route 薄殼共用 core）| ✅ | 收尾本次（core=seo-check-core.ts／route 薄殼／blocks/seo-check.ts）| Low | — |
| **P4** | `byKind()` 串 article→quality→publish headless 跑通成 WP draft（編排器 `lib/content/pipeline.ts`；search 為上游 producer 不入迴圈，理由見檔頭）| ✅ | `f0c8f750`（docs/WORKLOG）+ `bf70554f`（pipeline.ts+3 積木 code）；44/44 REALTEST、tsc 0、critic PASS 0c0m0n | Med | ✓ |
| **P5** | `publish/social`：lib/content/postiz.ts + /api/content/social-publish（draft 預設）| ⛔ | — | Med-High | 待+憑證 |
| **P6** | 🗑️ 刪 Python publisher.py 直連（grep 確認無 caller）| 🔲 | — | Med | 待 |
| **P7** | `video/pipeline` 積木 + Python 微服務骨架（圖→TTS→ffmpeg 本機驗證）| 🟡 骨架✅本機驗證✅／積木接線🔲 | `037f57b9`+`b7f5762a`+`186f6e72` | Med | 部分 |
| **P7 註** | 微服務骨架已落 `apps/video-service/`（桌機原作搬正位+發佈閘預設關 render-only）。合成核心 real-test 通過（真 Edge TTS+moviepy Ken Burns+CJK 字幕+ffmpeg 四尺寸驗尺寸）。修 Pillow≥10/moviepy<2 ANTIALIAS 相容崩潰 bug。Phase 1a 切出 render-only `render_video()`。完整 topic→影片 e2e 真實通過（真 key+gpt-image-1）。**剩**：`video-pipeline.ts` 積木接 pipeline.ts（Phase 1b）；發佈走 wp-bridge（R4）。 | | | |
| **P7 決策（2026-06-17 鎖定）** | **畫面＝混合**：AI 自訂圖走 Replicate **Flux**（schnell≈$0.003/張 近免費／dev-pro 更頂）＝重用 next-admin `generateTarotImage`；B-roll 走**免費 Pexels 影片庫**（需免費 API key，待操作者註冊）。**配音＝Edge TTS**（免費神經語音，維持）。**禁 dall-e-3**（帳號無權限，用 gpt-image-1/Flux）。成本目標 ≈ $0.02/支。render 層需擴充支援「靜圖 Ken Burns + 實拍影片片段」混合合成。 | | | |
| **P8** | 微服務容器化 + 部署 + healthcheck + smoke（SG/EU）| 🔲 | — | Med-High | 待 |
| **P9** | 全管線端到端 + R8/R9 gate + Telegram 通知 + WORKLOG | 🔲 | — | Med | 待 |

### C. 待刪 🗑️ / 卡住 ⛔
| 項目 | 狀態 | 原因 |
|---|---|---|
| Python `publisher.py` 10 平台直連 | 🗑️ P6 刪 | 踩 R1(兩套社群)+R4(繞 wp-bridge) |
| Python quality_control / topic_fetcher / growth / master_controller | 🗑️ 不移植 | next-admin 已有對應能力（A3/A5/A2/registry）|
| P5 Postiz 整合 | ⛔ | 等 §13-4 平台/帳號授權決策 |

**進度判讀規則**：A 段＝已是 production，動它前先讀勿重寫；B 段由上而下做，每完成一列把 🔲→✅ 並填 commit；C 段 P6 才執行刪除（刪前 grep）。

---

## §1 任務理解（根本問題）

**表面需求**：「video generator 進度？」+「寫一份完整 plan，每次都知道從哪開始」。

**根本問題**：內容管線目前是**兩個並存系統**，沒有單一藍圖，每個 session 重新摸索 → 重工風險：
- **(A) 積木 registry**：`registry.ts` 定義 5 種 kind，但**只有 search 收斂進來**（`trending-sources.ts` 註解自稱「第一批」）。設計意圖是其餘 kind 陸續收斂。
- **(B) 成熟 route 管線**：另外 19 個 `/api/content/*` route，幾乎全 production，由 ContentStudio UI 直接驅動，**尚未包成積木**。
- **(C) Python 全自動原型**（`agency-os/docs/video_generator/`）：能在本機跑，含影片合成（獨特價值）+ 10 平台直連發佈 `publisher.py`（與 (B) 重複、踩紅線）+ topic/quality/growth（與 (B) 重複）。

**真正要解的**：把這三套收斂成**一條積木化的無人值守管線**，明確「誰是 SSOT、誰被刪、誰被包裝」。
- 積木的價值 = **headless 自動化**（每日 topic→article→quality→[video]→publish-draft 自動跑），與互動 UI 並存。
- **唯一缺的新能力是「影片生成」**；其餘是「把已驗證 route 邏輯抽成共用 core、包成積木」（**零重寫、零重複、行為不變**），不是重做。

---

## §2 系統真相（兩層架構 — 先懂這個）

```
┌─ 互動層：ContentStudio.tsx（UI，4 tab，全活）
│    直接 fetch /api/content/* 的 20 個 route
│
├─ Route 管線層（19 route，幾乎全 production）── 尚未包成積木
│    generate / title / keywords / outline / related-posts / humanize / drafts   (article)
│    seo-check / seo-fix / image                                                  (quality)
│    publish(wp-bridge+REST) / wp-post / newsletter / calendar                    (publish)
│    trending / sources                                                            (search, 同時走積木)
│
└─ 積木 registry 層（registry.ts）── headless 自動化骨架
     byKind("search") ✅ 已收斂（5 積木：google-news/reddit/ptt/serper/env-feeds + DB 臨時源）
     byKind("article"|"quality"|"publish") ✅ P4 已收斂進 pipeline.ts（headless article→quality→publish→WP draft）
     byKind("video") ❌ 尚未收斂（P7）
```

**收斂方法（零重複的關鍵）**：route 目前邏輯內嵌在 handler。要包成積木又不重複 → **抽共用 core**：把 route 核心邏輯抽成 `lib/content/<kind>/*-core.ts` 純函式，**route handler 與新積木都 import 同一個 core**。route 對 UI 行為完全不變，積木讓 `byKind()` 也能在 headless 管線跑同一段邏輯。這是「行為保留重構（behavior-preserving refactor）」，非重寫。

---

## §3 完整現況表（SSOT — 每次先讀這張）

### 積木 registry（`lib/content/blocks/registry.ts`）
| 合約 | file:line |
|---|---|
| `BlockKind = search\|article\|video\|quality\|publish\|product` | registry.ts:18 |
| `register()` / `byKind()` / `listAll()` / `geoMatch()` | registry.ts:40 / :51 / :56 / :66 |
| 編排器骨架範例 | registry.ts:13-15 |
| **P4 實際 headless 編排器** `runContentPipeline()`（article→quality→publish，逐階段 `ok` 短路 + try/catch + 形狀防護 + article GENERATION marker 後驗）| `lib/content/pipeline.ts:89` |

### search ✅（唯一已收斂的積木家族，`lib/content/trending-sources.ts`）
| 積木 | file:line |
|---|---|
| google-news / reddit / ptt / serper | :246 / :261 / :279 / :307（serper `enabled:!!SERPER_API_KEY :312`，取代原 perplexity 即時 block）|
| env 自訂 feed / DB 臨時源 / 彙整入口 runTrending | :342 / buildDbSearchBlocks:200 / :372 |
| SSRF guard isSafePublicHttps | `lib/content/public-https.ts:12`（2026-10-24 移出） |

### Route 管線（20 route，`app/api/content/*/route.ts`；幾乎全 production）
| kind | route | file:line | 做什麼 | 外部依賴 |
|---|---|---|---|---|
| search | trending | trending/route.ts:97 | 熱搜/suggest/questions | 積木 + Google Suggest + Serper + Supabase content_sources |
| search | sources | sources/route.ts:57+ | 營運自訂 feed CRUD（migration 0042）| Supabase |
| article | generate | generate-core.ts（route.ts 薄殼）| 全文串流生成（E-E-A-T/GEO/RankMath）；P2 抽 core，route 薄殼 + 積木 headless 共用 | Claude Haiku/Sonnet/Opus + Serper 來源 |
| article | title / keywords / outline | :8 / :8 / :10 | 標題×5 / NLP 關鍵字×20 / H2-H4 大綱 | Claude Haiku |
| article | related-posts | :15 | 抓站內真實文章供內鏈 | WP REST |
| article | humanize | :22 | 人性化/改寫（串流）| Claude Sonnet |
| article | drafts | :72+ | 草稿 CRUD 自動存（migration 0041）| Supabase content_drafts |
| article | brand-voice | :34 | 萃取品牌語氣 profile | Claude Haiku |
| quality | seo-check | seo-check-core.ts（route.ts 薄殼）| RankMath 16 點稽核；P3 抽 core，route 薄殼 + 積木 headless 共用 | rankmath-checker lib |
| quality | seo-fix | :28 | 修 SEO 缺失保留語氣 | Claude Haiku（~5-10s；避免 CF 100s timeout 502）|
| quality | image | :67 | 社群/hero 圖生成 | Replicate Flux Schnell |
| publish | **publish** | publish/route.ts:237 | **WP 發佈 draft**：bridge 路徑(Kadence blocks+sideload+RankMath meta，:309-366)或標準 REST(:368-438)；**永遠 draft :347** | **wp-bridge Ed25519** / WP REST / Supabase |
| publish | wp-post | :19+ | 改文章日期/狀態/標題 or 移到垃圾桶 | WP REST |
| publish | newsletter | newsletter/route.ts:132 | 推 FluentCRM **草稿**（紅線：永不寄送）| WP Bridge |
| publish | calendar | calendar/route.ts:69 | 列各站文章排程 | WP REST |
| publish | **syndicate** | syndicate/route.ts:22-91 | **只生成社群貼文文字，零發佈**（死動作，UI 只給「複製」鈕）| Claude Haiku |
| config | sites / sites/[id] / [id]/test | — | WP 站台憑證 CRUD + 連線測試 | Supabase wp_sites + WP REST |

### video 🔴（唯一零實作 kind）
| 項目 | 現況 |
|---|---|
| next-admin 影片合成 | **零**（只有 YouTube placeholder 手動貼 generate/route.ts:380-396；靜態圖 image route）|
| 參考實作 | `agency-os/docs/video_generator/full_pipeline_v3.py`（~18 函式，moviepy 1.0.3）|

### 社群發佈
| 項目 | 現況 |
|---|---|
| Postiz | ✅ **已部署** postiz.aware-wave.com v2.11.3（EU，commit a951190c，2026-06-14 驗過）|
| Postiz 整合碼 | ✅ Task 3+4 完成 2026-06-22：`lib/content/postiz.ts`（getPostizConfig/listIntegrations/listAllIntegrations/uploadMedia/createSocialPost/assertCanPublishNow）+ `social-publish` route + `social-channels` route + `social-admin/integrations` + `social-admin/connections` + `ClientHubTabs` 社群頻道 tab |
| Python publisher.py | ❌ 10 平台直連（IG/FB/TikTok/Threads/Reddit 直發 = 踩 R1+R4 紅線）→ **刪** |

**圖例**：✅ 可用 ｜ 🟡 部分 ｜ 🔴 缺口/死碼 ｜ ❌ 要刪

---

## §4 積木收斂策略（零重複的具體做法）

每個 kind 收斂步驟（以 article/generate 為例，其餘同理）：
1. 把 `generate/route.ts` 的核心邏輯抽到 `lib/content/article/generate-core.ts`（純函式，輸入 ctx、輸出 markdown+meta）。
2. `generate/route.ts` handler 改成**呼叫 core**（HTTP 殼不變，UI 零影響）。
3. 新建 `lib/content/article/blocks.ts`：`register({ kind:"article", id:"article/generate", run: ctx => generateCore(ctx) })`。
4. 驗證：route 對 UI 行為不變（REALTEST）+ `byKind("article")` 能跑同段邏輯（headless）。

→ 結果：**一段邏輯、兩個入口（route 給 UI、積木給 headless）、零重複**。`enabled:false` 或刪積木檔即移除，route 不受影響。

---

## §5 video_generator 解剖（微服務抽取面）

**抽取目標**：給定 article/script → 產出 4 個 mp4。只抽影片合成核心，其餘**不移植**（已被 next-admin 取代或踩紅線）。

| 抽取（→ 微服務） | full_pipeline_v3.py | 丟棄（next-admin 已有 / 踩紅線） |
|---|---|---|
| Claude 腳本 + 場景 | _claude_json:61 / generate_from_topic:79 / from_existing:118 | publisher.py（10 平台直連，**踩 R1/R4，刪**）|
| 場景圖 Pixabay→DALL-E→fallback | get_scene_image:209 / generate_all_images:223 | quality_control.py（Copyscape/FAQ/Alt/AB → next-admin quality）|
| Edge TTS 配音 | generate_audio:239 | topic_fetcher.py（5 源 → next-admin trending）|
| 字幕 + Ken Burns + 合成 | make_subtitle:250 / ken_burns:277 / compose_base_video:285 | growth.py / master_controller.py（編排 → 積木 registry）|
| ffmpeg 出 4 尺寸 | export_formats:302 | Supabase 直寫 / Telegram（→ next-admin）|
| 主入口 | run:331 | — |

**依賴**（微服務只留）：`moviepy==1.0.3`（**鎖死**，2.x 改了 `.set_duration/.resize/.crop/.set_audio` 會炸）、anthropic、openai、edge-tts、requests、pillow + ffmpeg binary。
**Secrets 只留**：CLAUDE_API_KEY、OPENAI_API_KEY、PIXABAY_API_KEY、TTS_VOICE、VIDEO_* config。**丟掉所有平台 token**。
**輸出 4 尺寸**：youtube_linkedin 1920×1080 / tiktok 1080×1920 / instagram_facebook_threads 1080×1080 / pinterest_reddit_bluesky 1000×1500。

---

## §6 紅線 R1–R9（動手前必懂，全部有出處）

| # | 紅線 | 出處 |
|---|---|---|
| **R1** | **禁兩套社群發佈** — 社群只走 Postiz；publisher.py 直連刪 | POSTIZ plan:41-42 |
| **R2** | **永遠 draft-first，禁未審自動發佈** | content-engine §3.2:131-151；publish/route.ts:347 |
| **R3** | **禁批量** —「1000 關鍵字→1000 文→自動發」絕對禁；需 per-client distinctiveness 監控 | content-engine §3.2；decision 2026-06-15 |
| **R4** | **禁繞過 wp-bridge 簽章** — WP 只走 Ed25519 + read-back + auto-rollback | ADR 007；publish/route.ts:309-366 |
| **R5** | **影片生成 defer 到 post-Wave-2**（原為 optional embed slot；full AI video 是獨立決策）| decision 2026-06-15:197-200；content-engine §3.2:444(P2) |
| **R6** | **禁地理 WAF**（操作者全球移動）— 保護一律 server-side（LLAR）| decision pre-mortem |
| **R7** | **Postiz = 唯一社群入口**（IG/FB/Reddit/LinkedIn/TikTok/Threads/Pinterest；X API pricing/credits/寫入權限需另驗，v1 不承諾）| POSTIZ plan:4-5,24 |
| **R8** | 發佈前 Semantic Coverage ≥75 + Quality Gate 強制 | decision observability；content-engine:687-726 |
| **R9** | per-client distinctiveness 指標（draft-edit-rate / unique-topic ≥6/30d），禁總計 | decision 2026-06-15:290-293 |

---

## §7 風險清單

| # | 風險 | 緩解 |
|---|---|---|
| RK1 | 影片繞過 R5 deferral 偷跑 | §13 決策 1 由 owner 明確拍板才動 video |
| RK2 | 抽 core 改壞既有 route 行為 | 行為保留重構；每 route REALTEST 對比改前後 UI 輸出 |
| RK3 | moviepy 2.x 破壞 | 微服務 pin 1.0.3 + 容器隔離 |
| RK4 | ffmpeg 吃 CPU/記憶體拖垮 next-admin | **獨立容器**（非 in-process）+ healthcheck + 資源上限 |
| RK5 | 兩套社群並存（漏刪 publisher.py）| P-social 階段刪 publisher.py 直連，grep 確認無 caller |
| RK6 | 收斂大量 route = 大量 churn 卻無自動化需求 | §13 決策 2 先確認 headless 自動化是否真要 |

---

## §8 方案比較

### 影片實作形式
| | A1 TS 全重寫 | A2 Python 微服務（**建議**）|
|---|---|---|
| 做法 | moviepy/ffmpeg 用 Node 重寫 | 影片核心保留 Python，獨立微服務，TS `video/pipeline` block HTTP 呼叫 |
| 優點 | 單語言單部署 | 重用已驗證邏輯、moviepy 鎖版隔離、ffmpeg 重負載不拖垮主站 |
| 缺點/風險 | 等於重做整個影片引擎（高重工+高風險）| 多一服務要部署監控（可控）|
| rollback | 難（混進 next-admin）| 易（停容器即回退，主站不受影響）|

### 影片上線時機（牽動 R5 deferral）
| | T1 尊重 deferral | T2 owner 現在 override |
|---|---|---|
| 做法 | 先收斂既有 kind 成積木 + 接 Postiz；影片放最後 | 影片 block 列為優先，先做微服務 |
| 前提 | 維持 2026-06-15 決策 | **owner 明確做「獨立決策」開 video（§13-1）** |

### 收斂範圍
| | S1 全 kind 積木化 | S2 只 search 積木 + 其餘維持 route |
|---|---|---|
| 適用 | 真要 headless 每日自動化管線 | 只要互動 UI，無人值守暫不需要 |

---

## §9 決定方案（已鎖定 2026-06-16，operator 授權「你決定」）

- **順序 = T1**：先收斂既有積木（article/quality/publish）成 headless 骨架，**影片放最後**（尊重 R5 deferral，影片在 Wave 1/2 骨架穩定後才做）。
- **範圍 = S1**：全 kind 收斂成 headless 自動化骨架（每日 topic→article→quality→video→publish-draft 可無人值守跑），與互動 UI 並存。
- **影片形式 = A2 微服務**（最小重工、爆炸半徑最小、可獨立 rollback）。
- **發佈唯二合法路徑**：社群 = Postiz；WordPress = wp-bridge。**P6 刪 publisher.py 直連**。
- 全程 **R2 draft-first + R8 quality gate + R9 per-client 指標**，不踩任何紅線。
- **執行紀律**：每階段 R0 四動作驗證（§11）；完成即更新 §0.5 總帳。

---

## §10 分階段實作（每階段獨立可驗收/可回滾）

> **已鎖定 S1+T1**（見 §9/§13）。即時進度看 §0.5 總帳；下表為設計細節。

| Phase | 內容 | 風險 | 需 go-ahead |
|---|---|---|---|
| **P0** | 本檔藍圖 + 註冊 governance index | Low | 否（doc）|
| **P1** | 抽 `publish/wordpress` core + 包積木（行為保留，route 不變）| Low-Med | 是 |
| **P2** | 抽 `article/generate` core + 包積木 | Low-Med | 是 |
| **P3** | 抽 `quality/check`（seo-check）core + 包積木 | Low | 否（新增非破壞）|
| **P4 ✅** | `byKind()` 串 article→quality→publish headless 跑通「文章→品質→WP draft」（`pipeline.ts`；search 改列上游 producer，不入迴圈）。**活化 LIVE 端到端跑（真 token + 真寫客戶 WP draft）另需 go-ahead，非 P4 build 範圍** | Med | 是（已 ✓） |
| **P5** | `publish/social`：`lib/content/postiz.ts` + `/api/content/social-publish`（draft 預設）接 Postiz | **Med-High** | 是（憑證）|
| **P6** | **刪** Python publisher.py 直連（grep 確認無 caller）| Med | 是（刪碼）|
| **P7** | `video/pipeline` block 介面 + Python 微服務骨架（圖→TTS→ffmpeg，本機驗證）| Med | 是 |
| **P8** | 微服務容器化 + 部署 + healthcheck + smoke（SG/EU）| **Med-High** | 是（deploy）|
| **P9** | 全管線端到端 + draft-first 驗收 + R8/R9 gate + Telegram 通知 + WORKLOG | Med | 是 |

---

## §11 驗證計畫（R0 四動作，每階段強制）

1. **實測 REALTEST_EVIDENCE**：`.ts/.tsx` 先 `npx tsc --noEmit`；route 抽 core 後 curl 對比改前後輸出一致；積木 `byKind().run()` 真跑；微服務 docker exec/curl 真調用。
2. **Review REVIEW_DONE**：critic subagent 外部 oracle 審改後產物（不可自評替代）。
3. **抓蟲 BUGHUNT_DONE**：grep 新 core/積木 symbol callsites（scope 含 `agency-os`+`scripts`+`lobster-factory`）。
4. **WORKLOG**：file:line 引用實際指令與輸出 + 四動作摘要。

---

## §12 Rollback

| Phase | rollback |
|---|---|
| P1–P4 抽 core + 積木 | core 是純函式、積木是 thin adapter；`enabled:false` 或 revert 積木檔即停，route/UI 不受影響 |
| P5 Postiz | 獨立 block + route；revert commit 即停 |
| P6 刪 publisher.py | 刪前 grep 確認無 caller；git history 可復原 |
| P-video / P8 微服務 | 獨立容器 — 停容器即回退；`video/pipeline` block `enabled:false`；主站完全不受影響 |

---

## §13 決策狀態

| # | 決策 | 狀態 |
|---|---|---|
| 1 | 影片時機（T1 vs T2）| ✅ **T1**（先收斂、影片最後）— operator 2026-06-16 |
| 2 | 收斂範圍（S1 vs S2）| ✅ **S1**（全 kind headless）— architect 決（operator 授權「你決定」）|
| 3 | 方向（A2 微服務 + 唯二發佈路徑 + 刪 publisher.py）| ✅ 採用 — architect 決 |
| 4 | **Postiz 範圍**：接哪些平台 / 帳號 OAuth | ⛔ **未決**（P5 前需要；X 暫緩 $100/mo）— 屆時問 |
| 5 | 逐階段 go-ahead（Med 以上）| 🔲 每階段執行前確認（P0/P3 Low 直接做）|

---

## 變更紀錄

| 日期 | 變更 | 來源 |
|---|---|---|
| 2026-06-16 v2 | 真讀 20 route + registry + video_generator + Postiz 後重寫；修正 v1 把 article/quality/publish 誤標 roadmap 的錯誤；補兩層架構、抽-core 收斂法、R5 影片 deferral、Postiz 已部署事實 | 操作者要求「完整正確不半調子」+ 4 個 Explore agent 深掃 |
| 2026-06-16 v1 | 初版（建於 compaction 摘要，部分過時，已被 v2 取代）| — |
