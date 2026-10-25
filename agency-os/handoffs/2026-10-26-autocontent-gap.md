續接語：續做 AUTOCONTENT-GAP：只讀本檔 `agency-os/handoffs/2026-10-26-autocontent-gap.md`，從「§5 第一步」開始；完成＝三張卡（§7）驗收全綠且操作者看過計畫卡。建議模型：Opus 5.5 實作（卡已寫死每一步，Codex 照卡亦可）。回報操作者一律繁體中文。

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
| 題目的 `source` | 由 **AI 自報** `trending`／`kb`／`plan`；人手加的才是 `manual`。一份提案可能 0 筆 `plan` | `NA/lib/content/topics/plan.ts:65`；`lobster-factory/packages/db/migrations/0121_content_topics.sql:38` |
| 題目的月份 | 台灣月（`taipeiParts`／`monthKey`）；`scheduled_for` 09:00 台灣 | `NA/lib/content/topics/store.ts:72,82`；`NA/lib/content/topics/plan.ts:70` |
| AI 呼叫注入 | `planAsker(grant, route, actorRole)`；檔頭註解已預告「排程用 `grantFor` 計同一個 feature `content.plan`」——設計有想到，但沒接 | `NA/lib/content/topics/plan.ts:1-5,80-95` |
| 路由的權限 | `withFeature("content.plan", …)`＋`canCreateAiImageJob(role)`＋`canAccessOrg`；`maxDuration = 90`（Opus 寫 ~28 題） | `NA/app/api/content/topics/plan/route.ts:17-33` |
| headless 計費先例 | `runForOrg(organizationId, actor, …)` 內 `grantFor("content.syndicate")` | `NA/lib/content/topics/make.ts:11,99,261`；`NA/lib/entitlements/grant.ts:58,73` |
| **搜集熱搜** | 只有有人 GET `/api/content/trending?type=trending&geo=..`（文章頁 🔥 熱搜面板）才會 `saveTrends` 存進 `content_trends`；主機上沒有任何腳本／cron 打它 | `NA/app/api/content/trending/route.ts:99-108`；grep `content/trending\|content_trends` 在 `hetzner-phase1-core` 只命中 NA 內部檔 |
| 熱搜抓取本體 | `runTrending(geo, extraBlocks)`；額外來源 `loadDbSourceBlocks()` 讀 `content_sources`（route 內私有函式）。來源＝Google News RSS（免費）＋ Serper news（有 `SERPER_API_KEY` 才開，~0.001 美元／次） | `NA/app/api/content/trending/route.ts:3,82-96,103`；`NA/lib/content/trending-sources.ts:289-302` |
| 熱搜存檔 | `saveTrends(sb, geo, items)`：`upsert onConflict (hash, fetched_on)`，一天一筆／項，保留 90 天；`recentTrends` 依出現天數排（所以要**每天**存才有意義） | `NA/lib/content/topics/trends.ts:54-66,68-69`；`0121_content_topics.sql:25-27` |
| 支援的 geo | `TRENDING_GEOS = TW HK SG US GB JP AU` | `NA/lib/content/geos.ts:4` |
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
| B5 | 熱搜每 geo **每天一次**，守衛＝`content_trends` 已有 `(geo, fetched_on=今天 UTC)` 列，不另加狀態 | `recentTrends` 依出現天數排（§2）；公開資料無租戶，兩客戶同 geo 只抓一次 |
| B6 | 排程內每一筆 AI 花費都先出現在 `/ops/schedules` 那格的 `cost` 文字 | 操作者規則「AI 先顯示成本」；數字由 cost-model 算，不手打 |
| B7 | 設定只有一份：總控頁（卡 C）讀寫的是 `/ops/schedules` 與 `/tools/content/sites` 同一份資料 | 兩份設定遲早不同步 |

## 4. 風險與部署

- 卡 A Low（免費、無 DB）。卡 B Medium（排程內新增 AI 花費）→ 三張卡先給操作者看，同意再動手。migration 0138 加一欄、可 down、不鎖表；**apply 到 prod 那一步是 High，等 go**。卡 C Low–Medium（UI）。
- 推上 main ＝當晚台灣 03:00 自動部署（AGENTS §0）。還不能上就放 `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD`（`reason=` 一行）。

## 5. 做法（照順序）

1. 整檔讀 `NA/lib/schedules/jobs.ts`、`NA/lib/content/topics/{plan,tick,make,trends,store}.ts`、`NA/lib/schedules/store.ts`、`NA/app/api/content/trending/route.ts`、`NA/app/api/content/topics/plan/route.ts`、`NA/app/api/content/sites/[id]/route.ts`、`NA/lib/content/brand-voice.ts`。確認 §2 行號仍對。
2. 把 §7 三張卡照抄進 `EXECUTION_PLAN.md` §7（編號 P9.1／P9.2／P9.3，格式同 P6／P7，不改寫）；§3.1 資料流圖（`EXECUTION_PLAN.md:74-78`）三行改成：熱搜「排程每天一次」、提案「本月沒有就提，台灣月」、核准「`topicMode=ai_pick` 自動核准；`publishMode` 只管發布」。監工台 `data.mjs` 加 P9 一組 `todo(...)` → `node build.mjs && node check.mjs`。
3. 三張卡貼給操作者看（繁中、白話、說每月多花多少錢），等同意。流程與兩個閘的設計已定案（§1），不再問。
4. 依 P9.1 → P9.2 → P9.3 實作；每張卡一個 commit（pathspec）；共同收尾見 §6。
5. 完成後把 `agency-os/TASKS.md` 收件匣 AUTOCONTENT-GAP 那條打勾；`data.mjs` 的 `todo` 改 `done`。

## 6. 每張卡共同的收尾（缺一不算完成）

- `npx tsc --noEmit` 綠 → 卡內點名的 vitest 綠（**只跑點名的**，不跑全套）→ 突變一次（卡內指定的守衛：拔掉 → 指名測試變紅 → 還原變綠）。
- 測試全用假物件：**不連真 DB、不打真 Anthropic**。
- Claude 寫 → `/codex-review`；Codex 寫 → `/claude-review`。
- WORKLOG（`scripts/worklog-insert-entry.py`，經 `scripts/git-partial-worktree-commit.py stage`）含 AGENTS §1 四行機械證據。

## 7. 卡片全文

### P9.1　熱搜每天自動落地（卡 A；免費；Low）

**改哪些檔**
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

**驗收**
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
   流程：`month = monthKey(taipeiParts(now.toISOString()).month)`（`store.ts:72,82`）→ 逐站 `hasProposal` 為 true 跳過 → 第一個 false 的站 `claimAttempt`，false 跳過 → `propose` → `aiPicksTopics(defaults)` 才每題 `approve` → 回 `planned site=<id> month=<m> topics=<n> approved=<n>`。`propose` throw 就往上 throw（run-due 記 `last_error`＋開 incident，`run-due/route.ts:66-73`；24 小時後 B2 放行再試）。
   `export function planDueDeps(sb, organizationId, actor): PlanDueDeps` 真實作；`propose` ＝ `runForOrg(organizationId, actor, async () => proposeMonth(sb, { organizationId, siteId, month, actor }, planAsker(await grantFor("content.plan"), "lib/schedules/content_pipeline")))`（先例 `make.ts:99,261`）。
4. `jobs.ts` `content_pipeline.run`，P9.1 的 `collectTrendsIfDue` 之後：
   ```ts
   const planned = await planIfDue(planDueDeps(sb, organizationId, "schedule:content_pipeline"), new Date());
   if (planned) return planned;      // B3：提案的 firing 不 tick
   return tickTopics(...);           // 原本那行
   ```
5. `jobs.ts:110` cost 字串尾端加 `` 每個網站每月第一次提案另約 ${planCostUsd()} 美元。``；`cost.ts` 加 `export function planCostUsd(): number`（`planCostTwd` 的 USD 版：`Math.ceil(featureUnitCostUsd(f) * 100) / 100`）（B6）。
6. 題目頁按鈕 API（`topics/plan/route.ts`）**不改**：人按鈕提的案自然成為 B1 守衛，排程不重提。

**驗收**
- 新測 `NA/lib/content/topics/__tests__/plan-due.test.ts`（全部假 deps，`vi.fn`）：
  1. 一站、`hasProposal=false`、`claimAttempt=true` → `propose` 叫一次，且 `claimAttempt` 先於 `propose`（`mock.invocationCallOrder`）（B2）。
  2. `hasProposal=true` → `propose` 不叫、回 `null`（B1）。
  3. `claimAttempt=false` → `propose` 不叫（B2）。
  4. `propose` reject → `planIfDue` reject。
  5. 兩站都 `hasProposal=false` → `propose` 只叫一次（B3）。
  6. `defaults.topicMode="ai_pick"` → `approve` 每題各叫一次；`"human_pick"`、`undefined`、`"AI_PICK"` → 不叫；只有 `publishMode="ai_review_auto"` → 不叫（B4）。
  7. `now=2026-11-01T00:30:00Z`（台灣 11/1 08:30）與 `now=2026-10-31T17:00:00Z`（台灣 11/1 01:00）→ `hasProposal` 都收到 `"2026-11-01"`（台灣月）。
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
| ① 搜集熱搜 | 該站 geo 最後一次 `content_trends.fetched_on`、近 30 天筆數 | 無（P9.1 自動）；可放「立即抓一次」＝GET `/api/content/trending?type=trending&geo=..` |
| ② 提案題目 | 本月已提案幾題（`listTopics(sb, org, month)` 過濾 `site_id` 與 `source <> 'manual'`，`store.ts:91`）／尚未；上次嘗試 `wp_sites.content_plan_attempted_at`（在 `/api/content/sites` GET 的 select 加這欄）；失敗原因＝`/api/ops/schedules?slug=` 回的 `content_pipeline.lastError` | 既有「AI 提案本月題目」按鈕（`TopicsBoard.tsx:179-221`，POST `/api/content/topics/plan`） |
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

## 8. 範圍外（別順手做）

- 「AI 挑題的條件表單」（每月幾題、只要熱搜來源…）：先用品牌語氣當條件；要調的只有 `PLAN_TOPICS=28`（`plan.ts:16`），真有客戶要再開卡。
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
