# R2：片首封面（封面做成開場，轉場進正片；自動與手動都能加）

操作者 2026-11-20：「封面要加入片首並有轉場」「手動的也要可以加入」。

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`。在 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是你的事；不對正式站發布任何東西；回報操作者一律繁體中文。
VW＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/`；RS＝`…/apps/remotion-service/`；NA＝`…/apps/next-admin/`。

## 已有的（先讀，沿用，不另寫一套）
- 封面：`VW/backend/cover.cjs`（挑畫格、R1 用 `RS/src/compositions/Cover.tsx`＋`RS/src/cover-layout.ts` 畫標題，三個比例）。
- 片頭／片尾與轉場：`VW/backend/quick-render.cjs:45,80-81`（`bookends { intro, outro, transition, transitionSeconds }`）、`VW/backend/remotion.cjs`（模板欄位表與 `transport()`）、剪輯器片頭表單 `VW/scripts/editor-panes/text.js:99-119`（「產生片頭」「加入片頭轉場」，時間軸只能有一個片頭）。
- 歷史風險：Soulful 片頭接合曾吃爆記憶體（監工台待決 4）。先 `git log --grep=OOM -- <VW>` 找到修正，確認仍在。

## 要做
1. **開場片**：一種新的片頭來源「封面開場」。用同一個封面版面（`cover-layout.ts`，背景＝該影片選中的封面畫格，標題同字）加動畫：背景慢慢放大、標題滑入，最後一格＝縮圖那張的畫面。長度預設 2 秒，三個比例（16:9、9:16、4:5；1:1 若片頭模板已支援就一併）。在 RS 新增 composition 或讓 `Cover` 接受動畫長度，二選一，選改動小的並在 commit 寫原因。
2. **接合**：走既有 bookends 的 intro＋transition（交叉淡化 0.5 秒）。正片畫面不改；旁白、字幕、配樂的時間位移沿用既有片頭的處理（先讀它怎麼做，確認字幕時間軸有跟著移，寫一支測試）。
3. **手動（剪輯器）**：片頭表單多一個選項「用封面當片頭」（按鈕，不用下拉）。沒有封面時按鈕不可按並寫「先到發布面板產生封面」。與既有模板片頭互斥（沿用 `text.js:117` 的規則）。
4. **自動（話題影片）**：網站設定多一組按鈕「片首封面：開／關」，預設關（`NA/lib/content/brand-voice.ts` 的 `SiteContentDefaults` 旁、設定頁沿用 `OptionButtons`）。開了，話題做影片時自動加。次序問題：封面要有成片才能挑畫格——提出做法（先出無開場版、挑封面、再接一次；或用第一個鏡頭的圖當背景）並在回報寫你選哪個、多花多少時間。
5. **失敗不擋**：開場做不出來（服務不通、逾時、失敗）→ 出沒有開場的原片，原因記在工作上；不得卡住發布。
6. **既有資料**：已做好的影片不回改；舊設定沒有這個欄位＝關。舊資料測試一支。

## 不要做
- 不改封面縮圖本身的挑選規則與外觀；不動 YouTube／Instagram 帶縮圖的邏輯（`NA/lib/social/compose.ts:108-130`）。
- 不加其他轉場種類。不用 AI 模型畫任何東西（費用必須 NT$0）。
- 不做無效益測試：只寫本卡點名的；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，本卡沒有。

## 驗收
- VW `node tests/gate.cjs`（另跑一次 `AWAREWAVE_APP_DIR=.awarewave`）、RS 測試、NA `npx tsc --noEmit`＋全套 `npm test`。
- 實跑：筆電上拿一支最長的現有成片，三個比例各接一次，看畫面（開場末格＝縮圖、轉場順、字幕沒錯位）並記峰值記憶體；截圖或檔案路徑寫進回報。
- 審查一輪（Codex 有額度 `/codex-review`，沒有就 critic，commit 寫 `ORACLE_WAIVED`）。

## 回報
`FILES:`／`TESTS:`／`RISKS:` 三行加一句結論。要部署的服務（VW、RS、NA）各列出來。
