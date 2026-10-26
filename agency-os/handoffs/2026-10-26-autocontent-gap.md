續接語：續做 AUTOCONTENT-GAP：只讀本檔 `agency-os/handoffs/2026-10-26-autocontent-gap.md`，從「§5 第一步」開始；完成＝五張卡（§7，P9.1–P9.5）驗收全綠且操作者看過計畫卡。建議模型：Opus 5.5 實作（卡已寫死每一步，Codex 照卡亦可）。回報操作者一律繁體中文。

# AUTOCONTENT-GAP：全自動內容管線的前兩步沒接上排程，題目閘不存在

> 本檔自足：所有要知道的事實都在這裡，附 `file:line`。NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。
> 查證日 2026-10-26（main `30e2b9063`）。動手前仍照 AGENTS.md §1 先跑 `git log`，確認下列行號沒被別的 session 改掉。複查紀錄見 §9。

## 1. 操作者要什麼（2026-10-26 定案）

```
搜尋熱搜 → 產生題目 → 【題目閘】人挑 或 AI 挑 → 長文章＋摘要＋影片 → 【發布閘】人審 或 AI 審 → 社群（各平台格式）＋ YouTube
```

兩個閘各是一個站設定、各兩顆按鈕、互不牽動，四種組合都合法（例：AI 挑題、文章人審）。目標＝選了「AI 挑」＋「AI 審」的站，整個月沒人按任何鍵。

對照現況（§2）：後三段已全自動；**搜尋熱搜、產生題目沒接排程；題目閘沒有「AI 挑」**。

## 2. 現況（已查證）

| 環節 | 現況 | 證據 |
|---|---|---|
| 總開關 | `/ops/schedules` 每客戶一格 `content_pipeline`，預設關，每 5 分鐘跑；每天最多開始 N 題（1–10） | `NA/lib/schedules/jobs.ts:106-122` |
| 那格實際做的事 | 只 `tickTopics`：把**已核准**且到期的題目往下推一步 | `NA/lib/schedules/jobs.ts:116-121` |
| tick 時間預算 | 200 秒；run-due 把同一輪所有 claimed 的 job **依序**跑 | `NA/lib/content/topics/tick.ts:19`；`NA/app/api/internal/schedules/run-due/route.ts:58-76` |
| run-due 上限 | 300 秒 | `NA/app/api/internal/schedules/run-due/route.ts:26` |
| 排程列的失敗狀態 | `client_schedules.last_error/last_error_at`；**下一次成功 run 就被清空**（所以不能當冷卻） | `NA/lib/schedules/store.ts:177-182` |
| 發布閘 | 站別 `publishMode ∈ {human_review, ai_review_auto}`，存 `wp_sites.content_defaults` jsonb，`/tools/content/sites` 兩顆按鈕，預設人審；只由 PATCH 自己的欄位寫（staff only、白名單、條件寫入） | `NA/lib/content/brand-voice.ts:17-30,107-110`；`NA/app/(shell)/tools/content/sites/PublishModeButtons.tsx:10-12`；`NA/app/api/content/sites/[id]/route.ts:48-59`；掛在 `SiteManager.tsx:790` |
| **題目閘** | 只有人挑：`proposed → approved` 唯一入口是人按 `/api/content/topics/[id]` approve。計畫 §3.1 寫的「ai_review_auto 自動核准」**沒有程式碼** | `NA/lib/content/topics/store.ts:16`；`NA/app/api/content/topics/[id]/route.ts:15`；`agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md:78` |
| **產生題目** | `proposeMonth()` 唯一呼叫點＝題目頁按鈕 API；**排程從不呼叫** | 定義 `NA/lib/content/topics/plan.ts:108`；呼叫 `NA/app/api/content/topics/plan/route.ts:33` |
| proposeMonth 做什麼 | 讀站品牌 → 近 30 天熱搜前 50（`recentTrends(sb, geoFor(targetCountry), 30, 50)`）＋知識庫資料夾前 30 → 一次 Opus（`PLAN_TOPICS=28`）→ `parsePlan` → `proposeTopics`（同月同關鍵字略過）→ 狀態 `proposed`。品牌語氣／行銷簡報已在 prompt 裡＝「AI 挑的條件」 | `NA/lib/content/topics/plan.ts:16,36,108-124` |
| 提案用的模型與價格 | `CLAUDE_DEFAULT_MODEL = claude-opus-5-5`（專案預設，P3 沿用）。一次提案 1800 in／3500 out ≈ **0.08 美元**（Opus 4／20 per M）；Sonnet 4.6 ≈ 0.06、Haiku 5.5 ≈ 0.002。一站一月一次，錢不是重點；28 個不重複、可搜尋、符合品牌的關鍵字是判斷題，**維持 Opus**（操作者 2026-10-26 問過，決定不換）。真的要換只改 `planAsker` 的 model 與 `cost-model.ts:151` 那列 | `NA/lib/ai/claude-params.ts:21`；`NA/lib/ai/cost-model.ts:41-45,151`；`NA/lib/content/topics/plan.ts:86` |
| 題目的 `source` | 由 **AI 自報** `trending`／`kb`／`plan`；人手加的才是 `manual`。一份提案可能 0 筆 `plan` | `NA/lib/content/topics/plan.ts:65`；`lobster-factory/packages/db/migrations/0121_content_topics.sql:38` |
| 題目的月份 | 台灣月（`taipeiParts`／`monthKey`）；`scheduled_for` 09:00 台灣 | `NA/lib/content/topics/store.ts:72,82`；`NA/lib/content/topics/plan.ts:70` |
| AI 呼叫注入 | `planAsker(grant, route, actorRole)`；檔頭註解已預告「排程用 `grantFor` 計同一個 feature `content.plan`」——設計有想到，但沒接 | `NA/lib/content/topics/plan.ts:1-5,80-95` |
| 路由的權限 | `withFeature("content.plan", …)`＋`canCreateAiImageJob(role)`＋`canAccessOrg`；`maxDuration = 90`（Opus 寫 ~28 題） | `NA/app/api/content/topics/plan/route.ts:17-33` |
| headless 計費先例 | `runForOrg(organizationId, actor, …)` 內 `grantFor("content.syndicate")` | `NA/lib/content/topics/make.ts:11,99,261`；`NA/lib/entitlements/grant.ts:58,73` |
| **搜集熱搜** | 只有有人 GET `/api/content/trending?type=trending&geo=..`（文章頁 🔥 熱搜面板）才會 `saveTrends` 存進 `content_trends`；主機上沒有任何腳本／cron 打它 | `NA/app/api/content/trending/route.ts:99-108`；grep `content/trending\|content_trends` 在 `hetzner-phase1-core` 只命中 NA 內部檔 |
| 熱搜抓取本體 | `runTrending(geo, extraBlocks)`；額外來源 `loadDbSourceBlocks()` 讀 `content_sources`（route 內私有函式）。來源五種：Google News RSS、Reddit（地區版）、PTT 八卦（只 TW）、Serper「今日熱門新聞」（有 `SERPER_API_KEY` 才開，~0.001 美元／次）、營運自訂 RSS（env `CONTENT_TRENDING_FEEDS` 或 DB `content_sources`）。**全部只分地區、不分產業、不分客戶**（`content_sources` 沒有 organization 欄）；產業相關性靠提案 prompt 叫 AI 自己過濾（「挑和品牌受眾相關的」）＋知識庫資料夾名稱 | `NA/lib/content/trending-sources.ts:228-300,322-340,353-357`；`NA/app/api/content/sources/route.ts:15-18`；`NA/lib/content/topics/plan.ts:37-41` |
| 熱搜存檔 | `saveTrends(sb, geo, items)`：`upsert onConflict (hash, fetched_on)`，一天一筆／項，保留 90 天；`recentTrends` 依出現天數排（所以要**每天**存才有意義） | `NA/lib/content/topics/trends.ts:54-66,68-69`；`0121_content_topics.sql:25-27` |
| 支援的 geo | `TRENDING_GEOS = TW HK SG US GB JP AU` | `NA/lib/content/geos.ts:4` |
| **活動行事曆** | 已有：`events` 表（節日／運動賽事／文化／大型活動，含 `marketing_window_start/end`、`country_codes`、`title_zh`），主機每月 `sync-events-monthly.sh` → `/api/internal/events/sync`；`/tools/events` 與 Studio「🗓️ 活動行事曆」都在讀。**提案 prompt 完全沒用到** | `NA/lib/events/types.ts:5-27`；`NA/lib/events/facets.ts:97,110`；`NA/app/api/tools/events/upcoming/route.ts:56-78`；`lobster-factory/infra/hetzner-phase1-core/scripts/sync-events-monthly.sh:17`；`plan.ts` grep `event` 0 筆 |
| 社群平台熱門話題 | 來源裡**沒有** FB／IG／X／Threads／Snapchat／TikTok／YouTube／Google Trends。免費能抓的只有：Google Trends 每日 RSS（`trends.google.com/trending/rss?geo=XX`）、YouTube 熱門影片（Data API `videos.list chart=mostPopular`，免費額度，需 API key；專案目前沒有這把 key）。FB／IG／Threads 的 Graph API 沒有「熱門話題」端點；X API 要月費；Snapchat／TikTok 沒有公開 API | `trending-sources.ts` grep `threads\|instagram\|twitter\|tiktok\|trends.google` 0 筆；grep `YOUTUBE_API_KEY` 0 筆 |
| 客戶的站 | `wp_sites(id, organization_id, active, content_defaults)`；排程頁用 `organization_id` 數站 | `NA/lib/schedules/view.ts:32-38`；`NA/lib/content/brand-voice-store.ts:16-26` |
| 成本模型 | `content-plan` 一次提案的價格；`planCostTwd()` 已算 NT$ 版給按鈕 | `NA/lib/ai/cost-model.ts:151`；`NA/lib/content/topics/cost.ts:8` |
| migration 範本 | `0125`：檔頭 `APPLY` 行、`begin; set local lock_timeout='5s'; … notify pgrst; commit;`，另有 `.down.sql` | `lobster-factory/packages/db/migrations/0125_client_schedules_daily_limit.sql` |
| 既有測試 | 題目：`NA/lib/content/topics/__tests__/{plan,tick,store,trends}.test.ts`；排程：`NA/lib/schedules/__tests__/content-pipeline-job.test.ts`（mock `tickTopics`，兩個斷言）；熱搜 route：`NA/app/api/content/trending/route.test.ts` | — |
| 監工台 | `agency-os/handoffs/2026-10-24-auto-content-supervisor/data.mjs`：`todo(id, plain)`／`done(id, plain, commit)`；改完 `node build.mjs && node check.mjs` | `data.mjs:48-49` |

## 3. 不變量（違反任一條＝重做；一行做什麼＋一行為什麼）

| # | 不變量 | 為什麼 |
|---|---|---|
| I5（既有） | 發布非草稿必同時成立：`publishMode=ai_review_auto` ＋ 該列 `review.pass` | `EXECUTION_PLAN.md:121`；本卡不碰 |
| I8（既有） | 自動化開關只有 `content_pipeline` 一格；每 UTC 日最多啟動 N 題 | `EXECUTION_PLAN.md:124`；熱搜與提案都併進這一格的 `run`，**不**新增 `CLIENT_JOBS` 項、**不**另建 cron |
| B1 | 開了管線的客戶，每個啟用中的站，**本月（台灣月）恰有一份提案**。守衛＝該站該月已有 `source <> 'manual'` 的題目 | 用「1–3 號窗口」是補丁：開關月中才開或那三天主機掛就整月沒題；用 `source='plan'` 當守衛會月月重提（§2 `source` 列） |
| B2 | 付費步驟 24 小時內最多**嘗試**一次，記號寫在 DB、寫在 `ask` **之前** | 擋「付了錢但答案讀不出來 → 每 5 分鐘再付」；`last_error` 會被清（§2）、in-memory 每晚 03:00 部署重置，都不算 DB |
| B3 | 一個 firing **要嘛提案、要嘛 tick**；一個 firing 最多提一站 | 提案 ≈ 90 秒、tick 200 秒、run-due 上限 300 秒且 job 依序跑（§2） |
| B4 | 兩個閘獨立：`topicMode` 只管題目、`publishMode` 只管發布；兩者都嚴格比對值，缺值或亂值＝人 | 操作者定案（§1）；同 `autoPublishes` 的嚴格比對（`brand-voice.ts:107-110`） |
| B5 | 熱搜每 geo **每天一次**，守衛＝`content_trends` 已有 `(geo, fetched_on=今天 UTC)` 列，不另加狀態 | `recentTrends` 依出現天數排（§2）；現有來源全是地區級公開資料（§2 熱搜抓取本體），同地區客戶抓的是同一批，所以一天一次就夠。產業差異目前由提案 prompt 過濾；品牌自己的來源見 §8 |
| B6 | 排程內每一筆 AI 花費都先出現在 `/ops/schedules` 那格的 `cost` 文字 | 操作者規則「AI 先顯示成本」；數字由 cost-model 算，不手打 |
| B7 | 設定只有一份：總控頁（卡 C）讀寫的是 `/ops/schedules` 與 `/tools/content/sites` 同一份資料 | 兩份設定遲早不同步 |
| B8 | 排程內每一筆 AI 花費記在**該客戶**（`runForOrg` ＋ `grantFor("content.plan")`）；客戶沒開通或點數不足（`EntitlementRequired`）＝**跳過、不當故障**：不寫嘗試記號、不開 incident、當次 firing 照常 tick；總控頁顯示「未開通」 | ADR 017：許可只問 `can(主體, feature, actor)`，五種客戶方式（訂閱／點數／買斷…）靠同一條；點數用完的客戶若每天收一張 incident 是噪音，不是故障（`can.ts:122-125`；`products.ts:75` 已登記 `content.plan`） |
| B9 | 站的市場不在 `TRENDING_GEOS` 內 → **沒有熱搜**（提案只靠品牌＋知識庫），不是退回台灣的熱搜 | 平台是全球客戶；現行 `geoFor` 不認識的國家回 `"TW"`（`plan.ts:20-21`）會拿台灣熱搜替德國站規劃 |
| B10 | 品牌自己填的產業來源（P9.4）只進**該品牌**的提案 prompt，**不寫進** `content_trends` 共用快取 | `content_trends` 無租戶欄（`trends.ts:1-3`）；寫進去＝客戶 A 的產業新聞變成同地區客戶 B 的「熱搜」 |
| B11 | 一次做很多篇文章只有一條路：變成題目 → 排程在主機上做。瀏覽器裡**沒有**逐篇呼叫 `/api/content/generate` 的迴圈 | 文章頁「批量產文」走瀏覽器迴圈：關分頁就停、不讀站設定、不存檔、不記費用（P9.5 證據）；兩條路並存＝永遠有一條比較差 |

## 4. 風險與部署

- 卡 A Low（免費、無 DB）。卡 B Medium（排程內新增 AI 花費）→ 五張卡先給操作者看，同意再動手。migration 0138 加一欄、可 down、不鎖表；**apply 到 prod 那一步是 High，等 go**。卡 C Low–Medium（UI）。卡 D（P9.4）Low（免費、無 DB、只多一個選填欄位）。P9.5 Low（加題目免費、刪 UI、客戶入口還沒開放 `enabled: false`）。
- 推上 main ＝當晚台灣 03:00 自動部署（AGENTS §0）。還不能上就放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`（`reason=` 一行）。

## 5. 做法（照順序）

1. 整檔讀 `NA/lib/schedules/jobs.ts`、`NA/lib/content/topics/{plan,tick,make,trends,store}.ts`、`NA/lib/schedules/store.ts`、`NA/app/api/content/trending/route.ts`、`NA/app/api/content/topics/plan/route.ts`、`NA/app/api/content/sites/[id]/route.ts`、`NA/lib/content/brand-voice.ts`。確認 §2 行號仍對。
2. （已做：`dc6600cd5`，P9.5 另補）把 §7 四張卡照抄進 `EXECUTION_PLAN.md` §7（編號 P9.1／P9.2／P9.3／P9.4，格式同 P6／P7，不改寫）；§3.1 資料流圖（`EXECUTION_PLAN.md:74-78`）三行改成：熱搜「排程每天一次」、提案「本月沒有就提，台灣月」、核准「`topicMode=ai_pick` 自動核准；`publishMode` 只管發布」。監工台 `data.mjs` 加 P9 一組 `todo(...)` → `node build.mjs && node check.mjs`。
3. （已貼，2026-10-26 等同意）五張卡貼給操作者看（繁中、白話、說每月多花多少錢），等同意。流程與兩個閘的設計已定案（§1），不再問。
4. 依 P9.1 → P9.2 → P9.3 實作（P9.4、P9.5 在 P9.1／P9.2 後任何時候；P9.5 先於 P9.3 做較省，總控頁的 ③ 直接含多題輸入）；每張卡一個 commit（pathspec）；共同收尾見 §6。
5. 完成後把 `agency-os/TASKS.md` 收件匣 AUTOCONTENT-GAP 那條打勾；`data.mjs` 的 `todo` 改 `done`。

## 6. 每張卡共同的收尾（缺一不算完成）

- `npx tsc --noEmit` 綠 → 卡內點名的 vitest 綠（**只跑點名的**，不跑全套）→ 突變一次（卡內指定的守衛：拔掉 → 指名測試變紅 → 還原變綠）。
- 測試全用假物件：**不連真 DB、不打真 Anthropic**。
- Claude 寫 → `/codex-review`；Codex 寫 → `/claude-review`。
- WORKLOG（`scripts/worklog-insert-entry.py`，經 `scripts/git-partial-worktree-commit.py stage`）含 AGENTS §1 四行機械證據。

## 7. 卡片全文

### P9.1　熱搜每天自動落地＋兩個免費來源（卡 A；免費；Low）

**改哪些檔**
0. `NA/lib/content/trending-sources.ts` 加兩個內建 block（寫法同 `:228-240` 的 Google News）：
   - `search/google-trends`：`rssSearchBlock`，`url: (geo) => \`https://trends.google.com/trending/rss?geo=${geo}\``，`geos: "*"`，`source: "Google Trends"`，`limit: 20`；該 RSS 的 `<ht:approx_traffic>` 若 `makeRssBlock` 沒解析就只取 title（不為它改解析器）。
   - `search/youtube-trending`：`searchBlock`，`enabled: !!process.env.YOUTUBE_API_KEY`（同 Serper 的寫法 `:293`），`run: (geo) => GET https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=${geo}&maxResults=20&key=…` → title 當 item，`source: "YouTube"`。沒 key＝不啟用，不報錯。key 之後由操作者放進 `mcp/user-env.ps1` 與主機 env（AGENTS §0 Secrets 規則），**本卡不等 key**。
   - 兩個都是公開資料、不分客戶，照 B5 進 `content_trends`。
1. 新檔 `NA/lib/content/topics/collect-trends.ts`：
   - `export async function collectTrends(sb, geo): Promise<{ items: TrendingItem[]; saved: number }>`：把 `trending/route.ts:82-96` 的 `loadDbSourceBlocks()` 與 `:99-108` 的 `runTrending(geo, extra)` ＋ `saveTrends(sb, geo, items)` 搬進來；`saveTrends` 失敗一樣只 `console.warn`、`saved=0`，不 throw（route 既有行為）。
   - `export async function collectTrendsIfDue(sb, geos: string[]): Promise<string[]>`：geo 去重；每個 geo `select id from content_trends where geo=G and fetched_on=<今天 UTC 'YYYY-MM-DD'> limit 1`；沒有列才 `collectTrends`；回傳實際抓了的 geo。查詢失敗 throw。
   - 檔頭註解 1–3 行：為什麼一天一次（B5）、守衛是既有列不是新狀態。
2. `NA/app/api/content/trending/route.ts`：`trendingResponse` 改呼叫 `collectTrends`，回應 JSON 不變（`{ ok, items, geo }`）；刪掉搬走的私有函式。
3. `NA/lib/schedules/jobs.ts:116-121` `content_pipeline.run` 開頭（動態 `import()`，寫法同 `:119`）：
   ```ts
   const { data: sites, error } = await sb.from("wp_sites").select("id, content_defaults").eq("organization_id", organizationId).eq("active", true);
   if (error) throw new Error(`content_pipeline:sites:${error.message}`);
   const geos = [...new Set((sites ?? []).map((s) => geoFor((s.content_defaults as SiteContentDefaults | null)?.targetCountry)))];
   await collectTrendsIfDue(sb, geos);
   ```
   `geoFor` 在 `plan.ts:21`。
4. B9：`plan.ts:21` `geoFor` 改回 `TrendingGeo | null`（不認識的國家＝`null`，不再預設 `"TW"`）；唯一呼叫點 `plan.ts:115` 改成 `geo ? recentTrends(sb, geo, 30, 50) : []`；第 3 點的 `geos` 過濾掉 `null`。`plan.test.ts:47-48` 現在斷言「全球（不指定）」與 `undefined` → `"TW"`，改成 → `null`（台灣客戶在文章工具預設就是「台灣」，不受影響）。

**驗收**
- `plan.test.ts`：`targetCountry="德國"` → `recentTrends` 不被叫、prompt 的熱搜段是「（無）」（B9）。
- 新測 `NA/lib/content/topics/__tests__/collect-trends.test.ts`（假 sb 鏈式物件；mock `@/lib/content/trending-sources` 的 `runTrending`）：(a) 今天沒有列 → `runTrending`、`saveTrends` 各叫一次；(b) 今天已有列 → 都不叫；(c) `geos=["TW","TW","HK"]` → 最多叫兩次。
- 既有 `trending/route.test.ts` 不改內容就綠。
- `content-pipeline-job.test.ts` 補 `vi.mock("@/lib/content/topics/collect-trends", () => ({ collectTrendsIfDue: vi.fn(async () => []) }))`，假 sb 的 `wp_sites` 回空陣列；原兩個斷言仍成立。
- 指令：`npx vitest run lib/content/topics/__tests__/collect-trends.test.ts app/api/content/trending/route.test.ts lib/schedules/__tests__/content-pipeline-job.test.ts`
- 突變：拿掉「今天已有列就跳過」的 `if` → (b) 變紅 → 還原變綠。
- 成本註記：抓到 0 筆會在下個 5 分鐘重試；RSS 免費，Serper 最壞 288 × 0.001 ≈ 0.3 美元／天。

**Rollback**：revert 該 commit；無 DB 改動。

### P9.2　本月自動提案＋題目閘（卡 B；付費；Medium；migration apply 為 High）

**改哪些檔**
1. migration `lobster-factory/packages/db/migrations/0138_wp_sites_content_plan_attempted_at.sql`（格式照 `0125`）：
   ```sql
   alter table public.wp_sites add column if not exists content_plan_attempted_at timestamptz;
   ```
   `.down.sql`：`alter table public.wp_sites drop column if exists content_plan_attempted_at;`（只是時間戳，不需備份表）。RLS 不動。本機 Postgres apply → down → apply 各一次證明可逆；prod 等 go（`node scripts/apply-db-migration.mjs 0138`）。
2. 題目閘（B4）：
   - `NA/lib/content/brand-voice.ts:17-30` 旁：`export const TOPIC_MODES = ["human_pick","ai_pick"] as const`、`SiteContentDefaults.topicMode?: TopicMode`、`export const aiPicksTopics = (d) => d?.topicMode === "ai_pick"`（註解同 `autoPublishes`）。
   - `NA/app/api/content/sites/[id]/route.ts:48-59` 的 `publishMode` 分支照抄一份給 `topicMode`（staff only、白名單 400、同一次條件寫入 409）。既有 route 測試若有 publishMode 案例，複製一組給 topicMode。
   - 新檔 `NA/app/(shell)/tools/content/sites/TopicModeButtons.tsx`：複製 `PublishModeButtons.tsx` 改字——「題目我自己挑」＝`human_pick`、「AI 挑好直接做」＝`ai_pick`、確認鈕「確定讓 AI 挑題」；掛在 `SiteManager.tsx:790` 旁。
   - `PublishModeButtons.tsx:11-12` 兩段 detail 各加一句「只管文章；題目誰挑看旁邊的設定」。
3. 新檔 `NA/lib/content/topics/plan-due.ts`：
   ```ts
   export interface PlanDueDeps {
     canPlan(): Promise<boolean>;                                               // runForOrg 內 grantFor("content.plan")；EntitlementRequired → false，其他錯誤往上丟（B8）
     sites(): Promise<Array<{ id: string; defaults: SiteContentDefaults }>>;   // 該客戶 active 的 wp_sites
     hasProposal(siteId: string, month: string): Promise<boolean>;             // content_topics: site_id, month, source <> 'manual' 存在（B1）
     claimAttempt(siteId: string, now: Date): Promise<boolean>;                 // update wp_sites set content_plan_attempted_at=now where id=site and (is null or < now-24h) returning id → 1 列＝true（B2）
     propose(siteId: string, month: string): Promise<Topic[]>;                 // proposeMonth 包在 runForOrg ＋ grantFor("content.plan")
     approve(t: Topic): Promise<Topic | null>;                                  // store.move(sb, t, "approved")；只在 aiPicksTopics(defaults) 時叫（B4）
   }
   export const PLAN_RETRY_MS = 24 * 60 * 60 * 1000;
   /** 一個 firing 最多提一站（B3）；回傳摘要，沒得提回 null。 */
   export async function planIfDue(deps: PlanDueDeps, now: Date): Promise<string | null>
   ```
   流程：`month = monthKey(taipeiParts(now.toISOString()).month)`（`store.ts:72,82`）→ 逐站 `hasProposal` 為 true 跳過 → 有站要提才 `canPlan()`，false → 回 `null`（B8：不 claim、不花錢，當次照常 tick）→ 第一個要提的站 `claimAttempt`，false 跳過 → `propose` → `aiPicksTopics(defaults)` 才每題 `approve` → 回 `planned site=<id> month=<m> topics=<n> approved=<n>`。`propose` throw 就往上 throw（run-due 記 `last_error`＋開 incident，`run-due/route.ts:66-73`；24 小時後 B2 放行再試）。
   `export function planDueDeps(sb, organizationId, actor): PlanDueDeps` 真實作；`propose` ＝ `runForOrg(organizationId, actor, async () => proposeMonth(sb, { organizationId, siteId, month, actor }, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline")))`（先例 `make.ts:99,261`）。
4. `jobs.ts` `content_pipeline.run`，P9.1 的 `collectTrendsIfDue` 之後：
   ```ts
   const planned = await planIfDue(planDueDeps(sb, organizationId, "schedule:content_pipeline"), new Date());
   if (planned) return planned;      // B3：提案的 firing 不 tick
   return tickTopics(...);           // 原本那行
   ```
5. `jobs.ts:110` cost 字串尾端加 `` 每個網站每月第一次提案另約 ${planCostUsd()} 美元。``；`cost.ts` 加 `export function planCostUsd(): number`（`planCostTwd` 的 USD 版：`Math.ceil(featureUnitCostUsd(f) * 100) / 100`）（B6）。
6. 題目頁按鈕 API（`topics/plan/route.ts`）**不改**：人按鈕提的案自然成為 B1 守衛，排程不重提。
7. **節日與活動進提案**（免費，DB 已有）：`plan.ts`
   - `PlanContext` 加 `events: string[]`；`buildPlanPrompt` 在熱搜段**之前**加「本月在行銷窗口內的節日與活動（可提前佈局的題目）：」＋ `list(c.events)`，空就不印。
   - `proposeMonth`：查 `events` 表 `is_active = true` 且 `marketing_window_start <= 月底` 且 `event_date >= 月初`（沿用 `upcoming/route.ts:56-78` 的條件與 `decorateEventFacets`），再用 `eventMatchesCountries(e, country ? [country] : [])`（`facets.ts:97`；`country = geoFor(targetCountry)`，null 時只留不限國家的事件，照該函式既有語意）過濾，依 `scoreEventOpportunity`（`facets.ts:110`）排序取前 15，格式 `MM-DD 名稱（title_zh）`。DB 錯誤 throw（與 `recentTrends` 一致）。
   - 這段邏輯抽成 `NA/lib/events/for-month.ts` `eventsForMonth(sb, month, country)`，P9.3 的 ① 格與按鈕 API 共用。

**驗收**
- 新測 `NA/lib/content/topics/__tests__/plan-due.test.ts`（全部假 deps，`vi.fn`）：
  1. 一站、`hasProposal=false`、`claimAttempt=true` → `propose` 叫一次，且 `claimAttempt` 先於 `propose`（`mock.invocationCallOrder`）（B2）。
  2. `hasProposal=true` → `propose` 不叫、回 `null`（B1）。
  3. `claimAttempt=false` → `propose` 不叫（B2）。
  4. `propose` reject → `planIfDue` reject。
  5. 兩站都 `hasProposal=false` → `propose` 只叫一次（B3）。
  6. `defaults.topicMode="ai_pick"` → `approve` 每題各叫一次；`"human_pick"`、`undefined`、`"AI_PICK"` → 不叫；只有 `publishMode="ai_review_auto"` → 不叫（B4）。
  7. `now=2026-11-01T00:30:00Z`（台灣 11/1 08:30）與 `now=2026-10-31T17:00:00Z`（台灣 11/1 01:00）→ `hasProposal` 都收到 `"2026-11-01"`（台灣月）。
  8. `canPlan=false` → `claimAttempt`、`propose` 都不叫、回 `null`（B8）；`hasProposal` 全 true → `canPlan` 不叫（沒事做就不問權限）。
  9. 真實作 `planDueDeps(...).canPlan`：mock `grantFor` 丟 `EntitlementRequired` → `false`；丟一般 `Error` → reject（B8：只有權限拒絕算跳過）。
- `plan.test.ts` 加：`events=[]` → prompt 沒有「節日與活動」段；`events=["12-25 Christmas（聖誕節）"]` → 有且在熱搜段之前。`NA/lib/events/__tests__/for-month.test.ts`（假 sb）：窗口跨月的事件被選到、`country="TW"` 時美國限定事件被濾掉、不限國家事件兩種 country 都留。
- `content-pipeline-job.test.ts` 加兩條（mock `@/lib/content/topics/plan-due`）：`planIfDue` 回字串 → `tickTopics` 不叫、`run` 回那字串；回 `null` → `tickTopics` 叫（B3）。
- 真 SQL 呼叫鏈各一條（`store.test.ts` 的假 sb 風格）：`hasProposal` 用 `.eq("site_id").eq("month").neq("source","manual")`；`claimAttempt` 的 `.or()` 字串含 `content_plan_attempted_at.is.null` 與 `.lt.`。
- `/ops/schedules` 那格 cost 文字含提案費用（B6）；`/tools/content/sites` 看得到兩組按鈕，切題目閘後 PATCH 回應的 `contentDefaults.topicMode` 變、`publishMode` 不變（B4）。
- 指令：`npx vitest run lib/content/topics/__tests__/plan-due.test.ts lib/schedules/__tests__/content-pipeline-job.test.ts`
- 突變：拿掉 `hasProposal` 那個 `continue` → 測 2 變紅 → 還原變綠。
- 部署後實測（go 之後）：測試客戶打開 `content_pipeline`，run-due log 出現 `planned site=…`，題目頁出現本月題目；再 5 分鐘 log 是 tick 摘要而不是第二次 `planned`。

**Rollback**：revert commit（app 先）→ `0138.down.sql`。已提出的題目是資料，留著。

### P9.3　自動內容總控頁（卡 C；Low–Medium；A、B 做完才做）

操作者 2026-10-26：「功能到處散放，要一個頁面管理」。**不開新頁**，升級既有題目佇列 `NA/app/(shell)/tools/content/topics/`（`page.tsx`＋`TopicsBoard.tsx`）：頁頂一條五格流程圖（一頁一張圖），每格＝狀態＋那一步的控制＋費用。資料由頁面 server 端一次組好傳給 client component，不要五格各自 fetch。

| 格 | 顯示 | 控制（沿用既有 API，B7） |
|---|---|---|
| ① 搜集熱搜 | 該站 geo 最後一次 `content_trends.fetched_on`、近 30 天筆數、有哪些來源在跑（Google News／Google Trends／Reddit／YouTube…）；本月行銷窗口內的節日與活動 N 個（`eventsForMonth`，P9.2 第 7 點） | 無（P9.1 自動）；可放「立即抓一次」＝GET `/api/content/trending?type=trending&geo=..` |
| ② 提案題目 | 本月已提案幾題（`listTopics(sb, org, month)` 過濾 `site_id` 與 `source <> 'manual'`，`store.ts:91`）／尚未；上次嘗試 `wp_sites.content_plan_attempted_at`（在 `/api/content/sites` GET 的 select 加這欄）；失敗原因＝`/api/ops/schedules?slug=` 回的 `content_pipeline.lastError`；客戶 `content.plan` 未開通 → 顯示「未開通題目規劃，排程不會提案」（server 端用同一條 `can`／`grantFor` 判斷，B8）；站的市場無熱搜 → ① 顯示「此市場沒有熱搜來源，提案只靠品牌與知識庫」（B9） | 既有「AI 提案本月題目」按鈕（`TopicsBoard.tsx:179-221`，POST `/api/content/topics/plan`） |
| ③ 挑題 | 待核准幾題；題目閘目前是人挑／AI 挑 | 重用 `<TopicModeButtons>`（P9.2）＋既有勾選核准／退回（`TopicsBoard.tsx:231-232`） |
| ④ 製作 | 總開關開／關、每天最多開始 N 題、進行中幾題 | 讀 GET `/api/ops/schedules?slug=<客戶>`（`NA/app/(shell)/ops/schedules/ScheduleTable.tsx:140`）；寫 PATCH `/api/ops/clients/<slug>/schedules/content_pipeline`（`ScheduleTable.tsx:166`）。先例：客戶頁已嵌 `<ScheduleTable only={org.slug} />`（`NA/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx:697`）——加「只顯示 content_pipeline」的 prop 重用，或只抽那一格 |
| ⑤ 發布 | 人審／AI 審核自動發（只管文章） | 重用 `<PublishModeButtons site onSaved />`（`PublishModeButtons.tsx:15`） |

- 範圍陷阱：①②③⑤ 跟著「網站」切換；④ 是「客戶」層。一客戶兩站時切站 ④ 不變，畫面寫明「這個開關管這個客戶的所有網站」。站→客戶走 `wp_sites.organization_id`；`/api/content/sites` 回應沒帶客戶 slug 就在那支 GET 加，不要前端猜。
- 權限：④ 寫入沿用該 API 自己的角色檢查；角色不夠那格唯讀（`PublishModeButtons` 已有 `readOnly` prop），不在頁面另寫權限判斷。
- 側欄：`NA/app/sidebar-sections.ts:78` 的 `Topic Queue` 改 `Auto Content`（**label 只能英文**，`NA/app/__tests__/sidebar-coverage.test.ts:68-70` 會擋），中文放 `title`：「全自動內容：熱搜 → 題目 → 製作 → 發布，一頁管理」。頁面 `<h1>` 與 `metadata.title`（`topics/page.tsx:5,10`）改「自動內容」。網址不改。
- UI 規則：不用 `<select>`／下拉；細節放右欄；文案白話、不寫「我們」；顏色用主題 token。
- 舊位置照常可用：`/ops/schedules`、`/tools/content/sites` 不刪不改。

**驗收**：在總控頁切開關／改每日上限／改題目閘／改發布閘後，到 `/ops/schedules` 與 `/tools/content/sites` 看到同樣的值（B7）；`npx vitest run app/__tests__/sidebar-coverage.test.ts` 綠；`/playwright` 截圖頁頂五格（雙站客戶切站時 ④ 不變）給操作者看。
**Rollback**：revert commit；無 DB 改動。

### P9.4　品牌自己的產業來源（免費；Low；無 migration；A、B 之後任何時候）

操作者 2026-10-26：「等有客戶需要，所以要有地方可以填」。共用熱搜只分地區（§2）；這張卡給每個網站一個欄位填自己產業的 RSS，提案時抓最新文章一起給 AI（B10：只進該品牌的 prompt，不進共用快取）。

**改哪些檔**
1. `NA/lib/content/brand-voice.ts:23-30` `SiteContentDefaults` 加 `trendFeeds?: string[]`（https 網址，最多 10 個），加常數 `MAX_TREND_FEEDS = 10`。
2. `NA/app/api/content/sites/[id]/route.ts:63-66`：組好 `given` 之後正規化 `given.trendFeeds`：非陣列→刪掉；每項 `trim`、去重、`isSafePublicHttps`（已在 `NA/lib/content/public-https.ts`，`trending-sources.ts:4` 同一支）不過→ 400 `{ error: "trendFeeds: <那個網址> 不是公開 https 網址" }`；超過 10 個→ 400。既有 PATCH 全量覆寫路徑不變。
3. `NA/app/(shell)/tools/content/sites/SiteManager.tsx:142` 附近加欄位「產業來源（選填）」：一列一個 `<input>`＋「移除」鈕，底下「＋新增來源」鈕（到 10 個隱藏）；說明文字「填你這個產業的新聞或部落格 RSS 網址，AI 規劃題目時會優先參考。沒填就只看地區熱搜。」不用下拉。
4. `NA/lib/content/trending-sources.ts:353-360`：把 `runTrending` 內「對一組 blocks 跑 `Promise.allSettled` 收 items」抽成 `export async function runBlocks(blocks, geo)`，`runTrending` 改呼叫它（行為不變）。
5. `NA/lib/content/topics/plan.ts`：
   - `PlanContext` 加 `industry: string[]`；`buildPlanPrompt` 在「近 30 天的熱門話題」之前多一段「品牌自己的產業來源最新文章（優先參考）：」＋ `list(c.industry)`；`industry` 空就**不印這段**。
   - `proposeMonth`：`feeds = site.defaults.trendFeeds ?? []` → `blocks = buildDbSearchBlocks(feeds.map((url, i) => ({ id: \`site-${site.siteId}-${i}\`, label: new URL(url).hostname, url, geos: "*", enabled: true })))`（`trending-sources.ts:181-195`，ephemeral、不 register）→ `items = await runBlocks(blocks, geo ?? "TW")`（只用來選語言參數，B9 的 null 不影響）→ `industry = items.slice(0, 30).map((it) => it.title)`。抓失敗＝空陣列，**不 throw**（`runBlocks` 已 allSettled）。**不呼叫 `saveTrends`**（B10）。
6. P9.3 的 ① 格多一行：「產業來源：N 個（到網站設定改）」。

**驗收**
- route 測試（既有 `sites/[id]` 測試風格）：`trendFeeds: ["http://x"]` → 400；11 個 → 400；`[" https://a.example/feed ", "https://a.example/feed"]` → 存成 1 個、已 trim。
- `plan.test.ts`：`industry=[]` → prompt 沒有「產業來源」字樣；`industry=["A","B"]` → 有且在熱搜段之前；`proposeMonth` 給 `trendFeeds` 兩個 → `runBlocks` 收到 2 個 block、`saveTrends` 從未被叫（B10）；`runBlocks` 全失敗 → 仍 `proposeTopics`。
- 指令：`npx vitest run lib/content/topics/__tests__/plan.test.ts "app/api/content/sites/[id]/test"`。
- 突變：拿掉 route 的 `isSafePublicHttps` 檢查 → `http://x` 那條變紅 → 還原變綠。

**Rollback**：revert commit；已存在 `content_defaults.trendFeeds` 的 JSON 鍵舊程式會原樣保留、不讀，不必清。

### P9.5　題目頁「一次加多題」＋刪文章頁「批量產文」＋客戶入口加題目頁（免費；Low；無 migration）

操作者 2026-10-26 定案。文章頁 `/content`（＝`/tools/content`，同一個 `ContentStudio`）的「批量產文」頁籤和題目頁＋排程做同一件事、做得較差（B11）：

| 問題 | 證據 |
|---|---|
| 瀏覽器迴圈逐篇呼叫，關分頁就停 | `NA/app/(shell)/tools/content/ContentStudio.tsx:1897-1931`；畫面「瀏覽器保持開啟」`:4229` |
| 不讀站設定：預設寫死 English／Friendly | `:756-757`；站設定自動帶入只寫 `form`（`:1139-1150`），從不寫 `bulkSettings` |
| 不存檔：只在 React state，「我的草稿」只收單篇 | `saveDraft` 只在 `:1367`、`:1525` |
| 不記費用 | 單篇每步 `addCostLine`（例 `:892`），批量 0 次 |
| 只有文章，推 WP 一篇一篇手按，無社群／影片／審核／排定日 | `handleBulkPublish` `:1936-1961` |

**改哪些檔**
1. `NA/lib/content/topics/store.ts`（`fromTaipei` `:87` 旁）加純函式 `export function spreadDays(month: string, n: number, fromDay: number): number[]`：`n` 個日期從 `fromDay` 到月底平均分布（`fromDay + Math.floor(i * (daysIn(month) - fromDay + 1) / n)`），`n` 大於剩餘天數時同一天可重複。
2. `NA/app/api/content/topics/route.ts` POST（`:51-80`）：多收一種 body `{ siteId, month, keywords: string[], fromDay?, hour?, formats? }`（有 `keywords` 就走這條，否則照舊單題）。每行 `trim`、去空、去重；0 行或超過 `MAX_BULK_TOPICS = 30` → 400。每行一題：`title = keyword = 那一行`、`source = "manual"`、日期 `spreadDays(month, n, fromDay ?? 1)`、`hour` 與 `formats` 同單題規則。**一次** `proposeTopics`（同月同關鍵字略過，`store.ts:106`）→ `{ ok, added: n, skipped: [已排過的關鍵字] }`。權限、`siteOrg`、`canAccessOrg` 與單題同一段，不另寫。檔頭註解加這種 body 一行。
3. `NA/app/(shell)/tools/content/topics/TopicsBoard.tsx` 加題目那張卡（`:244-265`）：上方兩顆按鈕「加一題／一次加多題」（不用下拉）。多題模式＝`<textarea>` 一行一個關鍵字（placeholder 舉 3 個例子）＋同一組格式 chips 與時段 `GridPicker`＋「從幾號開始」`GridPicker`＋按鈕「加 N 題」；底下一行「加題目免費；排程做的時候每題約 NT$<topicCostTwd(formats).usual>」（`cost.ts`，已 import `:7`）。送出後顯示「加了 N 題；已排過略過：…」。超過 30 行按鈕停用並寫原因。
4. `ContentStudio.tsx` 刪「批量產文」：`Tab` 型別的 `"bulk"`（`:216`）、`BulkRow`（`:332`）、`BulkSettings`（`:347`）、bulk state 與 `bulkAbortRef`（`:751-772` 中 bulk 部分）、`handleBulkRun`／`handleBulkPublish`（`:1883-1961`）、頁籤按鈕（`:2272-2274` 陣列與文字）、頁籤畫面（`:4151` 起到「我的草稿頁籤」前）。`slugify`、`downloadMd`、`stripSlugHint`、`extractMeta` 單篇還在用，**不刪**（刪前 grep 確認剩餘呼叫 ≥1）。
5. 客戶入口：`NA/lib/portal/products.ts:72-73` content 的 `door.nav` 加 `{ path: "topics", name: "題目", staff: "tools/content/topics" }`；新檔 `NA/app/content/topics/page.tsx` 照 `NA/app/content/calendar/page.tsx` 寫法（import staff 的 `TopicsBoard`，metadata title「題目」）。權限沿用題目 API 自己的 `canCreateAiImageJob`＋`canAccessOrg`（與行事曆 API 同一閘），頁面不另寫判斷。入口目前 `enabled: false`／`coming_soon`，上線前的客戶角色規則不在本卡。

**驗收**
- `route.test.ts`（既有檔，照它的假 sb 風格）：`keywords: ["a"," a ","b",""]` → `proposeTopics` 收 2 列、`source` 都是 `manual`；31 行 → 400；`[]` → 400；他客戶的站 → 404（與單題同）。
- `store.test.ts`：`spreadDays("2026-11", 3, 1)` → `[1, 11, 21]`；`spreadDays("2026-11", 5, 29)` → 全部落在 29–30。
- `lib/portal/__tests__/products.test.ts` 綠（door nav 每頁存在且對應 staff 頁，`:91-103`）。
- `grep -rn "批量產文\|handleBulkRun\|bulkSettings" NA/app` = 0；`npx tsc --noEmit` 綠。
- 指令：`npx vitest run app/api/content/topics/route.test.ts lib/content/topics/__tests__/store.test.ts lib/portal/__tests__/products.test.ts`
- 突變：拿掉 `MAX_BULK_TOPICS` 檢查 → 31 行那條變紅 → 還原變綠。
- 截圖：題目頁「一次加多題」貼 3 行 → 月曆出現 3 題；文章頁頁籤只剩「產文／人性化 / 改寫／我的草稿」。

**Rollback**：revert commit；無 DB 改動。已加的題目是資料，留著。

## 8. 範圍外（別順手做）

- 「AI 挑題的條件表單」（每月幾題、只要熱搜來源…）：先用品牌語氣當條件；要調的只有 `PLAN_TOPICS=28`（`plan.ts:16`），真有客戶要再開卡。
- 品牌產業來源的**持久化**（存 30 天、算出現天數）：P9.4 只在提案當下抓最新文章進 prompt。要持久化得替 `content_sources`／`content_trends` 加可空 `organization_id`（RLS 同 0136 模式），等有客戶抱怨「只看當天不夠」再做。
- 付費的「用品牌關鍵字搜新聞」（Serper，每站每天 ~0.001 美元）：要另一顆按鈕顯示成本後才開，不在 P9.4。
- **FB／IG／X／Threads／Snapchat／TikTok 的熱門話題**（操作者 2026-10-26 問）：沒有免費公開 API（§2）。可行但要錢的路：X API Basic 約 200 美元／月；第三方彙整（Apify／Brandwatch 類）按量計費；Serper 搜 `site:threads.net` 等每次 ~0.001 美元。每一條都要操作者先決定預算、再加成一個 `searchBlock`（插口在 `trending-sources.ts:118`），不在 P9.1–P9.4。免費能拿到的社群訊號已在 P9.1：Reddit、YouTube 熱門、Google Trends。
- 月中才開開關：提的是當月、含已過日期的題目，核准後 tick 依每日上限慢慢消化；不做「改提下個月」。
- P5 Story Bible 提示片段（`storyBibleContextBlock`、角色 id 提示）仍由頁面組好再送出：另一件事。
- 真跑一整輪需 staging WP＋測試社群品牌：操作者 10-24 說先不用。

## 9. 複查紀錄（2026-10-26）

| 原版 | 問題 | 改成 |
|---|---|---|
| 守衛「本月沒有 `source='plan'`」 | `source` 是 AI 自報，一份提案可 0 筆 `plan`（`plan.ts:65`）→ 月月重提 | `source <> 'manual'`（B1） |
| 「1–3 號窗口」 | 窗口內開關沒開或主機掛 → 整月無題；是補丁 | 「本月恰有一份」（B1） |
| 冷卻沒說狀態放哪 | `last_error` 下次成功 run 被清（`schedules/store.ts:182`）；in-memory 每晚部署重置 | `wp_sites.content_plan_attempted_at` ＋ claim（B2） |
| 提案「在 tickTopics 前」 | 90 s ＋ 200 s 擠 run-due 300 s | 提案 firing 獨占、一次一站（B3） |
| 「提案後停 proposed 等人核准（或站設 AI 自動）」 | 自動核准沒程式（`[id]/route.ts:15` 唯一入口）；不做它「每月不用人按」不成立 | 獨立題目閘 `topicMode`（B4；操作者定案兩個閘各自選人或 AI） |
| 卡 A「每天跑一次」沒說守衛 | — | `(geo, fetched_on=今天)` 已有列就跳過（B5） |
| §3 把不變量、實作、風險、部署混在一起；卡 B 邏輯寫在三處 | 讀者分不清哪句不能違反、哪句只是做法 | §3 只留不變量表；做法只在 §7 卡片；風險部署獨立 §4 |
| 不變量只有工程面，沒有平台面（操作者 2026-10-26 問「適合這個工具平台嗎」） | 沒說錢記在誰頭上、點數用完怎麼辦（ADR 017 五種客戶方式）；不認識的國家拿台灣熱搜 | B8 權限拒絕＝跳過不當故障；B9 無市場熱搜＝不查，不退台灣 |
| 提案只看熱搜＋知識庫（操作者問「為什麼沒有節日和社群熱門」） | `events` 表已每月同步卻沒餵給提案；來源沒有 Google Trends／YouTube | P9.2 第 7 點節日進 prompt；P9.1 第 0 點加兩個免費來源；付費社群來源列 §8 等預算 |
