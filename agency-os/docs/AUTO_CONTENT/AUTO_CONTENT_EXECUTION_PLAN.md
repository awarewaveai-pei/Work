# 全自動內容管線 — 執行計畫（SSOT）

> 需求：[`AUTO_CONTENT_PIPELINE_REQUIREMENTS.md`](AUTO_CONTENT_PIPELINE_REQUIREMENTS.md)。本檔＝查證結果＋決策＋架構＋卡片＋進度帳；讀者是執行卡片的 agent。
> 路徑縮寫：`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`、`DB`＝`lobster-factory/packages/db`、`WF`＝`lobster-factory/packages/workflows`、`HOST`＝`lobster-factory/infra/hetzner-phase1-core/scripts`。`file:line` 以 2026-10-24 `fd172fe2a` 為準；執行每張卡前重 grep。
> 取代 [`CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md`](../operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md) §0.5 B 段 P5／P6／P9（2026-06-16 後未更新；社群已由 social 產品實作）。進度只看本檔 §10。

## 0. 決策（2026-10-24 定；改決策＝改這張表＋受影響的卡）

| # | 決策 | 理由一句 |
|---|---|---|
| D1 | 發布模式存 `wp_sites.content_defaults.publishMode`（`human_review`｜`ai_review_auto`），預設 `human_review` | 站別預設已在這個 jsonb，零 migration |
| D2 | ScriptForge 腳本歷史維持瀏覽器 localStorage | 非管線路徑，不為它多一表 |
| D3 | 影片階段 P6 在 P4 上線一週後開工 | 先驗證文章＋社群閉環 |
| D4 | YouTube 走社群產品（Postiz youtube provider），等 Google OAuth app 審核（人工） | 需求 6.3：全部社群含 YouTube 統一在 social |
| D5 | 自動化開關＝`/ops/schedules` 的 `content_pipeline` 格，每站一格，預設關 | AGENTS §0 自動化預設 OFF |
| D6 | 時鐘＝主機 cron 每 5 分鐘呼叫既有 `/api/internal/schedules/run-due`；不加 Trigger task、不加第二條 cron 專線 | 操作者 2026-10-24：盡量不外接；SCHEDULES_PAGE_PLAN §3.3 反對第三套排程 |
| D7 | 範圍採 B（全部八階段）；A（P1–P4）＝第一個里程碑 | A 的卡＝B 的前四階段，零重工 |

## 1. 任務理解

把六個已存在、各自獨立的能力接成一條無人值守管線，補三個缺口，另加兩項需求：
- 已存在：headless 文章管線 `NA/lib/content/pipeline.ts:87`；每客戶排程 `client_schedules`＋`NA/lib/schedules/jobs.ts:34`；熱搜積木 `NA/lib/content/trending-sources.ts:370`；蒐尋器 `/ops/collect`→KB；社群產品 `social.aware-wave.com`（V1.5 13 卡全完成）；影片 prepare 積木 `NA/lib/content/blocks/video-pipeline.ts`。
- 缺口：① 品牌聲音三份不同步 ② 熱搜不落地、無題目佇列 ③ 管線無呼叫者，且 publish 積木要求 HTTP Request（`NA/lib/content/blocks/publish-wordpress.ts:35-43`）。
- 另加：ScriptForge 獨立頁＋模組 prompt 上伺服器；AI 審核後自動發布模式。

## 2. 現況（全部實查）

### 2.1 git log
- `e2fdbb23d` 10-23 側欄 Content Tools 區（`NA/app/SidebarNav.tsx:57-63`）
- `89e133f68` 10-23 影片刪除引用閘；主機 cron 改 `/api/internal/*`（loopback 不變量，WORKLOG 10-23 續10）
- `f37a1c782` 10-22 市場分析改 Opus 5.5
- 社群 V1.5 C19–C31 全 done（`agency-os/handoffs/2026-10-17-social-v15-supervisor/data.mjs:39-51`）
- `bf70554f` 06 月 P4 pipeline.ts＋3 積木
- `DEPLOY_HOLD` 不存在 → 推 main＝當晚 03:00 上線；job 預設 OFF 故安全

### 2.2 事實表（需求主張 vs 實況）

| 需求章 | 主張 | 實查 | 證據 |
|---|---|---|---|
| 1.2 | pipeline 單一函式跑到 WP 草稿 | ✅ 但零呼叫者；publish 積木無 `ctx.request` 回 403 | `pipeline.ts:87`；`publish-wordpress.ts:35-43`；grep `runContentPipeline` 0 caller |
| 1.3 | `client_schedules` 每小時、加 key 即接入 | ✅ 3 job；頻率只 daily/weekly | `jobs.ts:36,53,76`；`DB/migrations/0097_client_schedules.sql:27`；`WF/src/trigger/schedules-heartbeat.ts:21` `0 * * * *`；sweep `NA/app/api/internal/schedules/run-due/route.ts:75` |
| 1.3 | 找不到設置頁 | ❌ 有 `/ops/schedules`（側欄 Ops） | `SidebarNav.tsx:54`；`NA/app/(shell)/ops/schedules/ScheduleTable.tsx` |
| 2 | SEO Articles 獨立、可生影片 | ✅ `/tools/content` 發布後瀏覽器叫 `/api/video/generate`；ScriptForge＝`/tools/video` 第 1 步 | `ContentStudio.tsx:659-663,1739-1804`；`VideoPipeline.tsx:108`；`VideoTabs.tsx:72` |
| 3.2 | 熱搜五來源、抓完即丟 | ✅ 4 內建＋env＋DB 來源；route 只回 JSON | `trending-sources.ts:248,263,281,309,342,201`；`NA/app/api/content/trending/route.ts:98-104` |
| 3.2 | 蒐尋器資料丟掉 | ❌ 已入 KB（folder＝搜尋字＋時間） | `NA/lib/collect/sinks/kb.ts:14` |
| 4.1 | 客戶站品牌只有瀏覽器送 AI | ✅ 伺服器只在 sites route 讀；文章靠瀏覽器塞 `form.details` | `NA/app/api/content/sites/route.ts:10-45,85`；`ContentStudio.tsx:1165-1178`；`generate-core.ts:652,656` |
| 4.1 | ScriptForge 品牌在 localStorage | ✅ `sf_brand`（來源仍是 sites 的 marketing） | `ScriptForge.tsx:1017,1044-1051,978,986,838` |
| 4.1 | 社群改寫沒套品牌 | ✅ | `NA/lib/content/syndicate.ts:42-75` |
| 5.2 | 文章→各平台貼文存進社群 | ✅ 手動已有（C10）；無 headless 入口（syndicate 無 core） | `NA/lib/social/wp-article.ts:34`；`NA/app/api/social/rewrite/route.ts:8`；`syndicate.ts:40` |
| 5.3 | 關分頁影片會嵌回？ | ❌ 不會：reconcile 只補 media_assets，embed 只有瀏覽器輪詢呼叫 | `NA/lib/content/video/reconcile.ts:4-7`；`ContentStudio.tsx:1768,1793` |
| 5.4 | 影片非同步 | ✅ Next.js 背景長工不可靠；prepare→EU render→status/reconcile 收尾 | `video-pipeline.ts:4-10`；`NA/app/api/video/status/route.ts:4-8` |
| 6.1 | 規格禁自動發布 | ✅ §3.2 `docs/wp-kadence-ai-seo-geo-content-engine.md:131-151`；§31.1 `:2618-2622`；WP core 已支援 draft/publish/future | `NA/lib/content/publish/wordpress-core.ts:38,374-375,470-475` |
| 6.1 | 社群審核 | ✅ 每品牌 `require_review`（預設關） | `NA/lib/social/review.ts:26`；`state.ts:9` |
| 6.3 | YouTube 進社群 | ❌ 平台型別無 youtube；編輯器不收 YouTube title | `NA/lib/content/postiz.ts:5-15`；`NA/lib/social/compose.ts:42-50`；`limits.ts:20` 有 youtube 5000 |
| 7.3 | 影片工具可發社群＋YouTube | 部分：社群走舊 ContentStudio Postiz 面板（待退場 TASKS.md:131）；YouTube 上傳不存在 | `NA/app/api/content/social-publish/route.ts` |
| 9 | 24 模組共用一句角色 | ✅ 23 個 `await claude(prompt)` 在瀏覽器組 prompt | `ScriptForge.tsx:40-50,225-250`；`NA/app/api/tools/script-forge/route.ts:23,33` |
| 9 | 平台規則在 syndicate | 三份：AI 散文 `syndicate.ts:25`、硬數字 `NA/lib/social/limits.ts:10`、Postiz 設定 `compose.ts:50` | — |

### 2.3 既有約束
- 付費 route 必登記 `NA/lib/entitlements/route-features.ts:4`＋`NA/lib/portal/products.ts:43,47,64`；headless 用 `grantFor(feature,{orgId,actor})`（`grant.ts:51`；範例 `NA/lib/collect/run.ts:123`）。
- 新頁必進側欄（`NA/app/__tests__/sidebar-coverage.test.ts`）；UI 禁 `<select>`、預設多選、一頁一張圖細節放旁邊。
- 主機 loopback 只走 `/api/internal/*`、自帶 token（`run-due/route.ts:27-32`）；主機腳本放 `HOST/`，sg-deploy rsync；cron 走 `HOST/install-maintenance-crons.sh:71-74` 幂等寫 `/etc/cron.d`。
- 社群 brand id＝organization_id（`NA/lib/social/MODULE_MANIFEST.json`）；`wp_sites.organization_id`（0061）→ 站↔品牌零對照表。
- 最新 migration `0120` → 本計畫 `0121`。
- 程式能做的不用 AI；AI 只在按鈕上、先顯示成本（memory `feedback_code_before_ai`）。

## 3. 目標架構

### 3.1 資料流
```
熱搜積木 ──每次 GET /api/content/trending──▶ content_trends（落地）
蒐尋器 ──────────────────────────────────▶ KB folders（既有）
                 │ 每月 1–3 號 proposeMonth（品牌 I1 ＋ 30 天計畫模組）
                 ▼
          content_topics（狀態機，一列＝一題；formats ⊆ {article,social,video,youtube}）
                 │ 人在 /tools/content/topics 核准（或 ai_review_auto 自動核准）
                 ▼
   job content_pipeline（client_schedules 一格；主機 cron */5 → run-due → run()）
     每次 firing 在時間預算內：啟動到期題（每日 ≤N）→ 對每列推一步
   approved → generating → drafted(WP draft + social drafts) → [waiting_video → embedded]
            → reviewed → (I5 閘) → scheduled/published ｜ failed
                 │
     WordPress（publish/wordpress 積木，org 身分）    social_posts（savePost；dispatch 既有送 Postiz）
```

### 3.2 `content_topics` 狀態機（一步＝一次可中斷的轉移；每步以 `version` claim）

| 從 | 到 | 做 | 失敗 |
|---|---|---|---|
| proposed | approved | 人按核准（或 ai_review_auto 自動） | — |
| approved | generating | `scheduled_for ≤ now` 且當日已啟動 < N | — |
| generating | drafted | `runContentPipeline(stopBefore:"publish")` → publish 積木 draft（org 身分）→ `artifacts.wp_post_id`；formats 含 social → `writeSocialPosts` → `savePost` draft → `artifacts.social_post_ids` | failed + `last_error` |
| drafted | waiting_video | formats 含 video：`video/pipeline` prepare → `artifacts.video_job_id` | failed |
| waiting_video | embedded | `finalizeVideoJob` done → `embedVideoInPost` | error → failed |
| drafted／embedded | reviewed | I5 規則閘（＋可選 Haiku）→ `review` jsonb | review.pass=false → 留 reviewed(草稿) |
| reviewed | scheduled／published | 僅 `publishMode=ai_review_auto` 且 `review.pass`：WP publish/future＋社群 schedule | failed |
| 任一 | failed | 任何 throw；incident 走 run-due 既有路 | 人在題目頁「重試」→ 回前一狀態 |

### 3.3 題目頁（一頁一張圖）
```
題目佇列 · Soulful · 2026-11                  [上月][下月]   提案 12 · 已核准 5 · 進行中 2 · 失敗 0
──────────────────────────────────────────────────────────────────────────
 ☐ 11/03 感恩日記五分鐘習慣     📝📣     熱搜·Google News   proposed   │ 右欄（點一列才有內容）
 ☑ 11/05 藝術治療入門            📝📣🎬   30天計畫          approved   │ 題目／角度／來源連結
 ◐ 11/07 色彩與情緒              📝📣     KB·folder         generating │ formats 多選 ☑文章 ☑社群 ☐影片
 ✓ 11/01 ……                     📝📣     人工              published  │ 發布模式徽章（站預設）
[核准所選] [退回所選] [核准並開始]                                     │ artifacts 連結／last_error／重試
```

## 4. 不變量（整類關掉，不關實例）

| # | 不變量 | 關掉的整類 |
|---|---|---|
| I1 | 品牌只存 `wp_sites.content_defaults` 一份；一個渲染器 `NA/lib/content/brand-voice.ts`（瀏覽器與伺服器共用）、一個伺服器讀取 `brand-voice-store.ts siteVoiceFor()`（含租戶檢查）；瀏覽器不存品牌副本 | 三份品牌、換電腦就沒、社群沒套 |
| I2 | 平台數字只在 `limits.ts BODY_LIMITS`；AI 規格由它導出；只有一個 `writeSocialPosts()`，四個入口都叫它 | 三份平台規則 |
| I3 | 全系統一個時鐘：主機 cron */5 → 既有 `run-due`；長工不在 Next.js 等待：題目列＝狀態機，每次 firing 在預算內推進、可中斷續跑、claim 防重跑 | 第二套排程、關分頁丟結果、背景被切、一步一天 |
| I4 | 「影片完成」只有一個 finalize core；瀏覽器輪詢與 job 都叫它 | 瀏覽器輪詢才嵌回 |
| I5 | 發布非草稿必同時成立：`publishMode=ai_review_auto` ＋ 該列 `review.pass`；缺一＝草稿 | 垃圾自動產文（規格 §3.2） |
| I6 | 模組規則只在伺服器登記表；瀏覽器送 `{module, fields}` | 共用一句角色、prompt 散在前端 |
| I7 | headless 身分＝org-scoped，無 Request 也能驗租戶；缺身分拒做 | 「少一欄就拿到全站權限」 |
| I8 | 自動化開關只有 `content_pipeline` 格；每 UTC 日最多啟動 N 題；未勾＝只有人按「核准並開始」才動 | 自動化偷跑、成本無上限 |

## 5. 風險

| 等級 | 風險 | 處置 |
|---|---|---|
| High | 自動發布到客戶站／社群 | D5 預設關；I5 雙條件；審核紀錄落 DB；incident 走 ops inbox |
| High | 0121 套 prod | down 同 commit；拋棄式 DB 套→還原→再套；套 prod 前 STOP 等 go |
| Med | Next.js 背景長工不可靠（`video-pipeline.ts:4-5` vs run-due `after()`） | 時鐘改 cron 後 run-due 同步等 job（P4.3）；每 firing 有預算 |
| Med | ScriptForge 1158 行壓縮碼重寫 | 每模組一卡；輸出 JSON 形狀 fixture 釘；Story Bible／送去生產 bridge 不動 |
| Med | AI 成本 | 每題估價（`lib/ai/cost-model.ts`）；N／日／站；ai_call_logs |
| Med | 租戶串線 | I7 |
| Low | run-due 每小時→每 5 分 | 無事一次 SELECT；既有 job 的 isDueNow 不變；重疊期 claim 去重 |
| Low | YouTube OAuth 時程 | 人工，P7 獨立 |

## 6. 方案比較

| | A 最小 | B 完整（採） |
|---|---|---|
| 範圍 | P1–P4 | A＋P5 ScriptForge＋P6 影片＋P7 YouTube |
| 滿足需求章 | 3、4、5.1、5.2、6 | 全部 |
| 卡數 | ≈19 | ≈37 |
| rollback | 每階段 revert；job 無列＝關 | 同；P5 新頁可刪不影響 /tools/video |

執行引擎排除：Trigger durable task（全 repo 零使用，house rule task decides nothing，`WF/src/trigger/collect-research-run.ts:1-4`）；Trigger 薄心跳（多一外接）；n8n（第二真相、無測試）；每日 tick 推一步（一步一天）；行程內 setInterval（多 worker 不可見）；新 cron＋新 route＋新 token（第二時鐘）。採：既有排程器升 5 分鐘解析度（D6）。

## 7. 卡片

格式：一卡＝一 commit；「驗」＝唯一完成判準；「突變」＝拔掉守衛→指名測試紅→還原綠。模型：卡上註明；未註＝Opus 5.5。依賴：P1→P2→(P3 ∥ P5)→P4→P6→P7；P8 隨階段。每階段末 Fable 閘審（讀 §10＋WORKLOG 證據行）。

### P1 品牌聲音 SSOT

| 卡 | 改 | 做 | 驗 | 突變 |
|---|---|---|---|---|
| P1.1 | 新 `NA/lib/content/brand-voice.ts`（純：`SiteContentDefaults` 型別、`FUNNEL_STAGES`／`PRICE_POSITIONS`、`renderMarketingBrief`／`renderBrandVoice`／`renderSiteVoice`／`forbiddenTerms`）＋`brand-voice-store.ts`（`loadSiteBrand`、`siteVoiceFor`）＋測試 | 型別搬自 `sites/route.ts`；三份標籤表（ContentStudio、SiteManager、ClientHubTabs）收成一份 | `npx vitest run lib/content/__tests__/brand-voice.test.ts` | 拔 forbidden 分隔符 → 1 測紅 |
| P1.2 | `ContentStudio.tsx` | 改用共用 `renderMarketingBrief`（刪本地 `compileMarketingBrief` 與三份標籤表）。文章頁表單＝逐篇可改的預填，維持由瀏覽器送 `details`；headless 呼叫端（P4.5）用 `renderBrandVoice(d.marketing, d.brandVoiceInstructions)` 組 `details`，`generate-core` 不改 | 既有 ContentStudio 測試綠 | — |
| P1.3 | `syndicate.ts:42` | body 接受 `siteId`，讀 I1 進 system prompt（P2 搬進 core） | 新 `lib/content/__tests__/syndicate-brand.test.ts` | — |
| P1.4 | `script-forge/route.ts:33`；`ScriptForge.tsx:1017,1044-1052,978,986,838` | route 接受 `siteId`，伺服器組品牌段；刪全部 `sf_brand` 讀寫；「品牌語氣」「品牌速建」「產業模板→設為品牌語氣」改成 PATCH `/api/content/sites/[id]`（`sites/[id]/route.ts:34-35` 已收 contentDefaults） | grep `sf_brand` 全 repo＝0；tsc 0 | — |
| P1.5 | `NA/lib/content/video/video-script-core.ts` | 影片腳本讀 I1 | 該檔測試綠 | — |

### P2 寫社群貼文 core

| 卡 | 改 | 做 | 驗 | 突變 |
|---|---|---|---|---|
| P2.1 | 新 `NA/lib/social/write-posts.ts`＋`__tests__/write-posts.test.ts`；`syndicate.ts:12,25,42` | `writeSocialPosts({article, articleUrl, platforms, mediaType, brand, model})`→`Record<platform,string>`；每平台規格＝`BODY_LIMITS[p]`（`limits.ts:10`）＋語氣模板＋video addendum；刪 `PLATFORM_SPECS`／addendum 內的字數數字；輸出超限時用 `bodyLength` 截檢並重試一次；`syndicateHandler` 變薄殼 | 測：每平台 ≤ limit；twitter_thread 每則 ≤280；舊 route 測試綠 | 把一個 limit 改 10 → 測紅 |
| P2.2 | `/api/social/rewrite/route.ts:8`、`/api/content/syndicate` | 兩殼共用 core；帳 `social.rewrite`／`content.syndicate` 不變 | `vitest lib/portal/__tests__/doors.test.ts` | — |
| P2.3 | `wp-article.ts:34` | `SYNDICATE_KEY` 改由 core 匯出的平台表產生（一份平台鍵） | `wp-article.test.ts` 綠 | — |

### P3 熱搜落地＋題目佇列（0121 套 prod 前 STOP）

| 卡 | 改 | 做 | 驗 | 突變 |
|---|---|---|---|---|
| P3.1 | `DB/migrations/0121_content_topics.sql`＋`.down.sql` | ① `client_schedules.frequency` CHECK 加 `every_5m`；② `content_trends(id, geo, source, title, traffic, category, related_queries jsonb, fetched_on date, hash text, UNIQUE(hash,fetched_on))`；③ `content_topics(id, organization_id FK, site_id, title, keyword, angle, source text CHECK in(trending,kb,plan,manual), source_ref jsonb, month date, formats text[], status text CHECK in(proposed,approved,generating,drafted,waiting_video,embedded,reviewed,scheduled,published,failed), publish_mode text, scheduled_for timestamptz, artifacts jsonb default '{}', review jsonb, version int default 1, last_error text, started_on date, created_by text, created_at, updated_at)`；index (organization_id,status)、(status,scheduled_for)；RLS service_role only（照 0097:49-54） | 拋棄式 DB 套→還原→再套；`db-expert` 審 | — |
| P3.2 | `trending/route.ts:98-104` | `trendingResponse` 後 upsert `content_trends`（hash＝source+title 正規化），回應不變；DB 失敗只 warn | 新測：同日同 item 一列；DB 壞仍回 items | 拔 onConflict → 測紅 |
| P3.3 | 新 `NA/lib/content/topics/store.ts`＋測試 | `list(org, month)`、`propose(rows)`、`setStatus(id, from→to, version)`（claim：`UPDATE … WHERE id AND version=?`，0 列＝他人已推）、`startableToday(org, N)`、`inProgress(org)`、`fail(id, err)`；DB 錯一律 throw（照 `schedules/store.ts:3-4`） | vitest | 拔 version 條件 → claim 測紅 |
| P3.4 | 新 `NA/lib/content/topics/plan.ts`；`route-features.ts`＋`products.ts:64` 加 `content.plan` | `proposeMonth(org, month)`：輸入＝30 天 `content_trends`（站 geo）去重前 50＋KB 最近 10 folder 標題＋I1 品牌；呼叫 P5.1 登記表的 `calendar` 模組 build（搬 `ScriptForge.tsx:993` prompt）；輸出 28 列 proposed，`scheduled_for` 分散於當月、`formats` 由 AI 建議但預設 {article,social}；`grantFor("content.plan",{orgId,actor})` | 測（假模型）：28 列、keyword 不重複、全月分散 | 拔去重 → 測紅 |
| P3.5 | 新頁 `NA/app/(shell)/tools/content/topics/page.tsx`＋`TopicsTable.tsx`；`SidebarNav.tsx:62` 後加一列；`/api/content/topics/*` route | §3.3 畫面；核取方格＋按鈕，無 select；右欄細節；「核准所選／退回所選／核准並開始／重試」 | sidebar-coverage 綠；`/playwright` 截圖比對 §3.3 | — |
| P3.6 | `/ops/collect` KB folder 卡 | 「加為題目」→ `propose` 一列 source=kb（引用 folder id，不複製內容） | 測 | — |

### P4 排程管線（啟用＝操作者在 `/ops/schedules` 勾格）

| 卡 | 改 | 做 | 驗 | 突變 |
|---|---|---|---|---|
| P4.0 VBC | — | 查 prod `collection_runs` 最長時長、run-due `after()` 是否跑完；寫 WORKLOG | SSH／SQL | — |
| P4.1 | `publish-wordpress.ts:35-43`；`wordpress-core.ts:316` | I7：`identity: {kind:"request",req} \| {kind:"org",organizationId,actor}`；org 身分只能發到 `wp_sites.organization_id` 相同的站；積木不再要 Request | 測：org 身分發他站→403；Request 路徑綠 | 拔 org 比對 → 測紅 |
| P4.2 | `schedule.ts:33-52`（CHECK 已在 P3.1） | `isDueNow`：`every_5m` 不看時／日，`lastRunAt` 空或 ≥4.5 分鐘前即 due；`scheduledRunKey` every_5m 帶 5 分鐘桶 `HHmm` | `lib/schedules/__tests__/schedule.test.ts` 固定時鐘 | 4.5 分改 0 → 雙 firing 測紅 |
| P4.3 | `run-due/route.ts:100` | `await runClaimed(claimed)` 在回應前跑完（時鐘是 cron，不必早回）；`maxDuration` 300；`after()` 只留 claimReview；回應含每 job summary | `run-due/route.test.ts` 綠 | — |
| P4.4 | `HOST/install-maintenance-crons.sh`＋新 `HOST/schedules-run-due.sh` | cron `*/5 * * * *` curl `http://127.0.0.1:<next-admin port>/api/internal/schedules/run-due` 帶 `SCHEDULE_INGEST_TOKEN`（讀 `/root/lobster-phase1/.env`，照 `reconcile-videos.sh:16-30`）；log `/var/log/schedules-run-due.log`；失敗同款 Telegram 去重告警。驗綠一天後停用 Trigger `schedules-heartbeat`（重疊期 claim 去重）。High：主機 cron 變更，先說再做 | `sudo tail /var/log/schedules-run-due.log` 每 5 分一筆 JSON；`client_schedules.last_run_at` 更新；`host-loopback-callers.test.ts` 綠 | — |
| P4.5 | `jobs.ts:34`＋新 `NA/lib/content/topics/tick.ts`＋測試 | job `content_pipeline`：`frequencies:[{value:"every_5m",label:"每 5 分鐘",usesHour:false,usesDay:false}]`；`cost` 句含 N 與每題估價；`unavailable`＝站無 organization_id。`run(org, runKey)`＝`tickContentTopics(org, {budgetMs:200_000, maxStartsPerDay:N})`：① `startableToday` → approved→generating；② `inProgress` 每列照 §3.2 推一步，每步前 claim；預算到即回 summary；單列失敗→failed 不中斷他列；job 本身 throw 只在 store 壞 | 測（假積木）：完整狀態機；中途 throw 下次續；預算到即停；N 上限；雙 firing 不重跑 | 拔 claim → 測紅；拔 N → 測紅 |
| P4.6 | `tick.ts` 審核步 | I5：規則閘（無 `GENERATION_` 標記、`runSeoCheck` 分數 ≥ 門檻、`forbidden[]` 零命中、字數下限）→ 站設定開才加一次 Haiku 品牌符合度 → `review={pass,checks[],at}`；`publishMode=ai_review_auto` 且 pass → publish 積木 `publish|future`＋社群 `setState schedule`；否則停 reviewed | 測：human_review 永不出草稿；auto 但 fail 不發；auto 且 pass 發 | 拔規則閘 → 測紅 |
| P4.7 | `/api/content/topics/[id]/start` | 「核准並開始」：核准後對該列同步跑 `tickContentTopics` 一步（意圖當下做，時鐘補尾；同 social `publish_now` 形狀 `state.ts:66`）；計入當日 N | e2e：按下後 WP 立刻有草稿 | — |
| P4.8 | 站別管理頁（`SiteManager`） | `publishMode` 兩顆按鈕（人審／AI 審核自動發）預設人審；`/ops/schedules` 格自動出現（`ScheduleTable.tsx:273-289` 依 usesHour/usesDay 隱藏時間） | PATCH 持久；截圖 | — |

### P5 ScriptForge 獨立頁＋伺服器模組登記（卡寫死 → Sonnet／Codex；blurb → data-filler）

| 卡 | 改 | 做 | 驗 |
|---|---|---|---|
| P5.1 | 新 `NA/lib/script-forge/modules.ts`＋測試 | 24 筆 `{id,label,icon,group,blurb,role,outputSchema(zod),build(fields,brand,lang,scenes)}`；id／group 照 `ScriptForge.tsx:225-250`；blurb 照需求 §8；`role` 每模組一句；`build` 內容＝原瀏覽器 prompt 逐字搬移（P5.3 起逐卡填） | 測：24 筆、id 唯一、每筆 role＋schema 非空 |
| P5.2 | `script-forge/route.ts` | body `{module, fields, model, siteId}`；system＝`modules[module].role`＋共用輸出規則＋I1 品牌段；prompt＝`build()`；未登記 module 400；串流不變；舊 `prompt` 欄位移除 | 測：未知 module 400；已知 module 串流 |
| P5.3–P5.25 | `ScriptForge.tsx` 每模組一卡（manual, article, industry, ab, host, brand_story, sales, speech, pitch, seo, hook, pain, viral, thumbnail, repurpose, translate, preview, predict, brand_build, brand, calendar, proposal, story_bible 只接 forge 不改 workbench） | 該模組 `await claude(prompt)`→`forge(moduleId, fields)`；prompt 文字搬進 P5.1 該筆 `build`；輸出 JSON 形狀 fixture 釘 | fixture 綠；該模組 grep 無 `claude(` |
| P5.26 | 新頁 `NA/app/(shell)/tools/script-forge/page.tsx`＋側欄 Content Tools | 左欄 24 模組（名稱＋blurb），點入才載模組；`/tools/video` 第 1 步仍 import 同元件（`VideoPipeline.tsx:108`、`VideoTabs.tsx:72` 不動） | sidebar-coverage；`/playwright` |
| P5.27 | 去向 | 結果區兩顆按鈕：送社群（P2 core→`savePost` 草稿）、送影片（既有 `onSendToProduction`） | e2e：送社群後 `/tools/social` 見草稿 |

### P6 影片接管線（D3 後）

| 卡 | 改 | 做 | 驗 |
|---|---|---|---|
| P6.1 | `status/route.ts`、`embed-to-wp/route.ts` → 新 `NA/lib/content/video/finalize.ts` | I4：抽 `finalizeVideoJob(jobId)`、`embedVideoInPost({siteId,postId,videoUrl}, identity)`；兩 route 變殼；行為不變 | 既有 status／embed 測試綠 |
| P6.2 | `tick.ts` | §3.2 drafted→waiting_video→embedded：prepare 走 `byId("video/pipeline")`（org 身分）；每 firing `finalizeVideoJob`；done→embed＋社群影片貼文（media 經 social media 表，`uploadVideo` `postiz.ts:194` 由 dispatch 處理）；error→failed | 狀態機測；e2e 關分頁情境仍嵌回 |
| P6.3 | 刪 `NA/app/api/content/social-publish|social-channels|social-admin`、ContentStudio Postiz 面板、Python `publisher.py` | grep 無 caller 才刪 | tsc 0；doors.test 綠；TASKS.md:131 打勾 |

### P7 YouTube（人工＋Opus 5.5）

| 卡 | 做 |
|---|---|
| P7.0 人工 | Google OAuth app（Postiz youtube provider）審核；Postiz 連頻道 |
| P7.1 | `postiz.ts:5-15` 加 youtube；`compose.ts:50` SETTINGS youtube（title,type）；撰寫頁收 YouTube 標題；`write-posts` youtube 規格 |
| P7.2 | formats 含 youtube → 社群貼文 target youtube（影片 16x9） |

### P8 治理收尾（隨階段，不留最後）
master plan §0.5 B 段 P5/P6/P9 指本檔；`lib/content|social|video/MODULE_MANIFEST.json`＋`products.ts`（`content.plan`）；`RUNNABLE_DEMOS.md` 一條指令；`node scripts/sync-foundry-catalog.mjs`；TASKS.md `:122,:145,:349` 收斂指本檔；`SCHEDULES_PAGE_PLAN.md` §0 記 every_5m 與 cron 時鐘。

## 8. 驗證
- 實測：`npx tsc --noEmit`；`npx vitest run <卡測試>`；P4／P6 在拋棄式 org（staging WP 站＋social 測試品牌）真跑一次 firing；`REALTEST_EVIDENCE` 行。
- Review：每 commit `/codex-review`；P4.1（身分）、P4.6（審核閘）屬 auth 類 → 2 critic 逐 claim。
- 抓蟲：`BUGHUNT_DONE scope=agency-os,scripts,.claude,lobster-factory`；pattern＝`sf_brand|PLATFORM_SPECS|runContentPipeline|social-publish|every_5m`。
- 突變：每卡一守衛。
- 階段閘：Fable 讀 §10＋WORKLOG，過才開下一階段。

## 9. Rollback
每卡一 commit → revert；0121 `.down.sql`；job 無列＝關、刪 registry 筆＝消失；cron 一行刪除即回 Trigger 心跳；`publishMode` 回 human_review 即停自動發布；P5 新頁可刪，`/tools/video` 不受影響。

## 10. 進度帳（唯一進度真相；完成填 commit）

| 階段 | 狀態 | commit | 備註／建議模型 |
|---|---|---|---|
| P0 查證＋計畫 | ✅ 2026-10-24 | — | 本檔 |
| P1 | ✅ 2026-10-24 | 見 WORKLOG 2026-10-24 AUTO_CONTENT P1 | 另補 by-id 站別 API 租戶閘 `siteRowGate`（`NA/lib/content/wp-sites.ts`） |
| P2 | 🔲 | | Opus 5.5 |
| P3 | 🔲 | | Opus 5.5；0121 套 prod High |
| P4 | 🔲 | | Opus 5.5；P4.4 主機 cron High；啟用＝勾格 |
| P5 | 🔲 | | Sonnet／Codex 照卡；blurb data-filler |
| P6 | 🔲 | | Opus 5.5；D3 |
| P7 | 🔲 | | 等 P7.0 |
| P8 | 🔲 | | 隨階段 |

開場句：`續做 AUTO_CONTENT P2：讀 agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md §4 I2 與 §7 P2 卡，從 P2.1 write-posts.ts 開始；完成＝P2 三卡 commit 填進 §10。建議模型：Opus 5.5`
