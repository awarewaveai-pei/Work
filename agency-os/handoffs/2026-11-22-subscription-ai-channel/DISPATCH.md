# AI 訂閱通道 派工表（監工用）

續接語：我是「AI 訂閱通道」的監工。讀本檔＋`PLAN.md`；`mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照「驗收」做，不問操作者。操作者 2026-11-22 授權：監工派工、選模型、工人 context 過長自行 compact／clear、整批交回後一起判 RISKS、風險處理完才部署；回報繁中。監工台 `data.mjs` 只有監工改。

## 批次

| 批 | 卡 | 內容 | 模型 | 狀態 |
|---|---|---|---|---|
| 1 | K1 | bridge kind／tool／lane／額度 | Opus 5.5 | main `a7d814353` |
| 1 | K2 | worker 文字 job、無工具、憑證掃描 | Opus 5.5 | main `b53be9244` |
| 1 | K3 | 訂閱模型獨立清單＋鏈＋帳本 | Sonnet 5.5 | main `47d60570c` |
| 2 | K4a | sub-text＋文章／劇本工坊後端（不動 .tsx） | Opus 5.5 | main `d31151b5a` |
| 2 | K6 | 走法按鈕元件＋狀態 API（只新增檔） | Sonnet 5.5 | main `81b5e30eb` |
| 2 | K8 | 成本頁訂閱用量 | Sonnet 5.5 | main `dc9e37167` |
| 3 | K4b | 文章頁掛按鈕＋202 輪詢＋可取消；控制項由員工頁注入 | Opus 5.5 | main `6302a2497` |
| 3 | K5 | 影片腳本後端收 chain | Sonnet 5.5 | main `1e25c3aaa` |
| 3 | K7 | 每站走法＋套用到所有網站＋自有組織限制＋內部標記清除 | Opus 5.5 | main `f948401a0` |
| 3 | K11 | 模型清單補五個（GPT-6 四個實測；Sonnet 未測） | Sonnet 5.5 | main `33775b69b` |
| 3c | K12 | 十二個模型文章實測（本機跑真 core，不等部署） | 監工 | 等 K11 |
| 3c | K13 | 生圖模型實測 | 監工 | 等 K12 與操作者排名。**開測前先告訴操作者並等她說完**（2026-11-22「要測之前告訴我，我有問題要說」）；未經她回覆不得開跑 |
| 3d | K10 | 文章配圖：英文畫面描述＋網站的生圖模型 | Opus 5.5 | 等 K13 與操作者談定（四點未定，見 `briefs/K10-K12.md`） |
| — | DA | `sg-deploy.sh next-admin`＋smoke＋筆電實寫一篇（不等 K10、K12、K13） | 監工 | 等批 3 |
| 4 | K9 | 主機常駐 worker（High；待決 1、2） | Opus 5.5 | 等 DA |
| 4 | M1 | 11-24 後實測 | 監工 | 等 K9 |

同時最多 4 個工人；同一條線的下一張卡 `send_message` 給同一個閒置 session（先 `clear_session`）。工人 worktree 在 `D:\Worktrees`。

## 驗收（每張卡）
1. 讀 FILES／TESTS／COMMITS／RISKS → 讀 diff（`git -C <worktree> diff main...HEAD`），回報裡的 `file:line` grep 驗真；對照 PLAN §2 不變量與 §3 合約逐條看。
2. 整合工作區 `D:\Worktrees\Work\sub-int`（detached）：cherry-pick → 解衝突 → `npm ci` → `npx tsc --noEmit`。
3. 整批併完：全套 `npm test` 一次；`critic` 審整批 diff 一次（Codex 無額度至 11-24，WORKLOG 記 `ORACLE_WAIVED`）；有畫面的卡預覽實看。
4. **整批交回後獨立一步「一起看 RISKS」**：並排三類——會出錯貨／沒實看／main 紅 → 當輪處理；要改別的系統 → 掛到既有或下一張卡；理論性 → 記一行。結果寫進 `data.mjs` RISKS＋本檔，`node build.mjs && node check.mjs`，重新發布監工台。
5. rebase 到 `main` → `git merge --ff-only`（pathspec commit）；`clear_session` 工人；派下一批。
6. 部署只在 DA 與 K9：先確認該批 RISKS 全有處置。DA 照 `/sg-deploy`（首行 `# CONFIRMED-HIGH-RISK:`）；K9 每個主機動作停下等操作者。

## 監工台
頁面：見 `data.mjs` 檔頭與記憶 `project_subscription_ai_channel_supervisor`。更新＝改 `data.mjs` → `node build.mjs && node check.mjs` → 發布到同一網址。

## RISKS 紀錄
### 動工前
見 `data.mjs` RISKS 第一張表（七條，皆有處置）。

### 批 1（2026-11-22）
critic Standard 整批：fail 6 major／6 minor → 全部處理（規格更正＋三張卡退回修）→ 重新整合：tsc 0、全套 vitest 5312 passed、worker node --test 綠、筆電實跑 Claude haiku 6.2 s＋憑證探針「沒有工具」。逐條處置見 `data.mjs` RISKS 第二張表。每卡 squash 成一個 commit。Codex 無額度至 11-24：`ORACLE_WAIVED`（critic 代）。
未關：Codex 文字與圖回歸實跑 → M1；`vendor-invoices`／`probe-models` 不受影響（`TEXT_RATES` 未動，`git diff` 驗）。

### 批 2（2026-11-22）
critic Standard 整批：warn 1 major／3 minor → 全修（K4a run-budget 上限、runTextChain 例外、deferred 錯誤 body；K6 預設 API-only）。結構測試紅一項（`/api/tools/sub-worker` 未登記）→ 監工在 `lib/portal/staff-tools.ts` 登記。重新整合：tsc 0、全套 vitest 5350 passed。逐條處置見 `data.mjs` RISKS 第三張表。`ORACLE_WAIVED`（Codex 無額度，critic 代）。
給批 3：K4b 輪詢回傳格式＝文章 `{ ok, markdown }`（跳過段在 `[COST_JSON].skipped[]`，每筆 `{ model, error, reason }`，`reason` 為可直接顯示的繁中）；劇本工坊 `{ ok, text, skipped?, reservedTwd? }`。lane 只能由程式設定（`config.lane`），K7 在排程傳 `schedule`。

### 批 3（2026-11-22）
critic Standard 整批：warn 3 major（含 1 既有線上 bug）／5 minor → 全修。結構測試 `registry-code.test.ts` 紅兩次（video 門、content 門帶到訂閱按鈕）→ 控制項改由員工頁注入（`ContentStudioStaff.tsx`、`SiteManagerStaff.tsx`；ScriptForge 收 prop、目前無員工頁傳入）。重新整合：tsc 0；全套 vitest 5412 passed＋修正後 lib/portal 與 content 頁 132 passed。監工自讀權限相關新增（`owner-subscription/route.ts`、jobs `DELETE`、`cancelCodexWork`）。`ORACLE_WAIVED`（Codex 無額度，critic 代）。
正式站資料修正（操作者逐次同意）：aware-wave.com `wp_posts` 36,38,48,55,62,69 移除 `[COST_JSON]` 段；62,69 移除 `NEEDS_FACT_CHECK` 標記（21＋6 處）；備份 `~/backups/wp-costjson-20261122/`、`~/backups/wp-factcheck-20261122/`；線上頁面 curl 驗 0 命中。Soulful 0 篇。
未關：劇本工坊無員工頁可用訂閱（部署後決定）；`SiteManager` 預覽未以真資料看；`probe-models.mjs --write-verified` 寫出重複屬性（`cost-model.ts:156`，既有工具 bug）。

### 部署 A（2026-11-22 09:37Z）
`sg-deploy.sh next-admin` → `a12137def`（前一版 `343fe7f9c`），healthy 15 s，HTTP smoke 全 OK；Playwright smoke 34 passed／0 failed（`agency-os/reports/e2e/2026-11-22/smoke`）。
正式站實測：筆電 worker（owner lane，tools codex＋claude）→ 文章頁 `claude+api`＋Haiku → worker 109 s 交回、`ai_call_logs` 一列 `sub-claude-haiku`／vendor 訂閱／usd 0／answered `claude-haiku-5-5`。網站設定頁（選 Soulful）：按鈕「這個客戶的網站也是我的，允許用訂閱」、12 個模型、套用到所有網站皆在。
發現：`TextChainButtons` 狀態只在掛載時讀一次（worker 後啟動仍顯示離線）→ 小卡。未看：成本頁、劇本工坊頁、apply-text-road 對真 PostgREST（Chrome MCP 中途 unhealthy）。

### K14＋K12（2026-11-22 晚）
- K14 `TextChainButtons` 狀態每 15 s 重讀：main `ad07ec5ef`（tsc 0；vitest components/tools＋lib/portal＋content 頁 166 passed）。未部署。
- 09:57Z 容器重建＝他線 `safe-infra-patch.sh compose`（`/root/lobster-phase1/safe-patch.log` 09:57:19 apply → 09:57:48 success），非 K12 造成。
- K12 重跑（正式站、擁有者 session、逐一）：12/12 完成，每篇存 `content_drafts` 後取出再刪（36 列測試草稿已刪）。資料 `agency-os/reports/model-bakeoff/2026-11-article/`（`drafts.jsonl`、`ledger.jsonl`、`metrics.json`、`key.json`＝字母↔模型）。總實扣約 NT$52。盲測頁 `https://claude.ai/artifact/JyYNnD8Txmmiwv53S4wMsU`。
- 結果（字母／模型／NT$／秒／字數／SEO／未查證標記）：A opus-5-5 8.03/119/5221/86/7；B haiku-5-5 0.08/24/2621/59/0；C gpt-5.4 2.88/84/4978/73/3；D gpt-6.2-astra 6.68/105/4117/82/3；E gpt-6.2-sol 1.96/80/4338/86/0；F gpt-5.4-mini 0.71/23/3801/68/5；G gpt-5.5 8.72/164/4850/77/3（截斷）；H fable-5-1 19.56/167/5437/82/13；I gpt-5.4-nano 0.25/33/5298/64/1；J sonnet-5-5 2.16/46/3576/68/0；K gpt-6-luna 0.13/55/4297/82/0；L gpt-6.1-terra 1.02/82/4328/77/6。
- 待操作者：回覆她選的字母 → 寫進 `app/(shell)/tools/ai-models/MeasuredRuns.tsx`「文章生成」組 → K13 開測前先問她。

### 現況快照（2026-11-24，compact 前；取代 11-23 那份）
- 上線：部署版 `0781c2a9a`（2026-11-24 01:13Z，sg-deploy exit 0、容器 healthy）。含 K17（Codex 訂閱選模型）、K18（中文小標）、K19（商品文案提示詞）、K20（影片腳本／社群改寫／開發信／AI 去味預設 gpt-6.2-sol，OpenAI 失手退回 Claude）、K21（所有 OpenAI 上限＝`openAiCompletionBudget`，結構測試守）、K22（年份註記、`<a href>`、NT$）＋電子報走 `scrubInternalMarkers`（`6c699c1d5`）。
- 正式站已實測：文章不選模型 → 中文小標、帳本 gpt-6.2-sol、短文章不截斷（K21 後）；AI 去味 15 秒完整。**未實測**：K22 上線後正文無年份註記（Chrome 外掛斷線，沒測成）；影片腳本與社群改寫（僅本機經改後路徑各真跑 3 次）。
- 工人：四個都已 clear、閒置。sub-k1 `local_bb671b06…`、sub-k2 `local_8466f158…`（Sonnet）、sub-k3 `local_1a22899c…`、sub-k4 `local_3da5453e…`（Opus）。整合一律在 `D:\Worktrees\Work\sub-int`（detached）cherry-pick → tsc＋`npm test` → `git push origin HEAD:main`。
- D:\Work 共用 checkout 落後 origin/main，被別的 session 未提交的 `agency-os/TASKS.md` 擋住 parity-merge；不要動它。文件 commit 也走 sub-int cherry-pick。
- 下一步（操作者 2026-11-24）：**compact 後討論配圖**（K10 只剩配圖；K13 生圖實測開跑前要先告訴她、她有問題要說）。配圖現況先讀 `data.mjs` K10／K13 的 plain 與 `briefs/K10-K12.md`。
- 等待中：M1（Codex 額度 11-24 11:02 後；待決 4 她在筆電 `~/.codex-sub` 登入）含「指定 gpt-6.2-sol 的 Codex 實寫」；K9（待決 1–3）。
- 未關風險（都在 `data.mjs` RISKS）：一鍵到草稿的畫面測試整套跑時偶發逾時（另一條線的測試，未改）；成本頁每站表格月上限五千筆；兩把 Gemini 金鑰曾印到對話（她決定）。
- 比較頁：八種文案 `https://claude.ai/artifact/2yijESBAer4rY4aDuRWDis`；監工台 `https://claude.ai/artifact/VzfEtmLYzLcAueyCU2bVqJ`。

### 配圖定案與派工（2026-11-24 下午；接在上面快照之後）
- 操作者定案：封面 1 張＋內文 3–4 張（各對應段落，可以有人物、重點是貼題）；內文圖 4:3；封面成品 4:3、B 版型（上圖下字，字不蓋圖，短標題＋副標）；封面版型全站統一、底圖與內文圖同一個全站風格；設定在 `/tools/content/sites`，文章頁帶入可單篇改；IG 另出直式 4:5（她同意，第二步）；順序＝先做版型與設定，再做生圖實測。
- 卡：K10（畫面描述／風格／張數，`briefs/K10-article-images.md`，sub-k4）、K24（封面 renderer，`briefs/K24-cover-template.md`，sub-k1）同時進行、檔案不重疊；K25（接線＋刪舊壓字，`briefs/K25-cover-wiring.md`）等兩張併入後派；K13（實測，`briefs/K13-image-bakeoff.md`）在 K25 部署後，開跑前在對話告知一聲。
- K23 已併入（`5699897f8`、`0de363251`）：自動產文的 FB／IG 貼文內文不放網址、連結在第一則留言、結尾在主題標籤前；FB 與 IG 各自一則草稿。未在正式站看過真的草稿。
- 她還沒回答：圖片來源順序（訂閱 → Pexels → 付費預設關閉）；她傳的「工具設定」四個字指什麼（程式裡找不到同名頁面，已問一次）。
- 工人回報後照常：讀 diff → sub-int cherry-pick → tsc＋全套 `npm test` → 判斷 RISKS 寫進 `data.mjs` → 推 main → clear 工人。文件提交用 scratchpad 的 `ship24.sh` 模式（在 sub-int 複製 `data.mjs`／`supervisor.html`／briefs 後 commit；D:\Work 的共用 index 有別人 staged 的 WORKLOG，不能在那裡 commit）。

### 配圖進度（2026-11-25）
- 上線：部署版 `0a8301ff4`（11-25 04:03Z）含 K10、K23、K24、K25。正式站已看過網站設定頁（風格按鈕、封面區、即時預覽、中文字型正常）。
- K13 實測已跑完（正式站）：比較頁 `https://claude.ai/artifact/QDYm5geq9V9ztRgLrEZtrg`，資料 `agency-os/reports/model-bakeoff/2026-11-article-image/`（`runs.json`、`img/`、`image-bakeoff.html`；產生器在 scratchpad `build_image_page.cjs`，重建需重寫）。來源 A–F＝openai-low、codex-image、flux-schnell、nano-banana-2、flux-2-klein-4b、flux-dev；另有改版前做法對照。**等操作者選預設來源** → 改 `DEFAULT_IMAGE_MODEL`／`ARTICLE_IMAGE_MODELS`，寫進 `MeasuredRuns.tsx` 新組「文章配圖」。
- 待她決定：畫面描述加「符合網站目標地區」（內文圖的人物偏西方臉）；自動社群草稿附封面圖（現在只有影片題目才附媒體，`make.ts` attachTopicVideo）；風格目錄的畫家組在文章這邊要不要收起來；IG 直式 4:5。
- 未驗：文章頁的封面短標題／副標欄位；真的自動文章的封面；FB／IG 真實草稿。
