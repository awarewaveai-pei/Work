// 影片工具融合監工台 -- 唯一的狀態來源。改這裡 → `node build.mjs` → `node check.mjs` → 重新發布同一網址。
// 做法正本：apps/video-workbench/docs/video-unify-plan-20261116.md §4（check.mjs 驗卡號一一對應）。這裡只放狀態與白話；計畫檔不寫狀態。

export const META = {
  title: '影片工具融合監工台',
  updated: '2026-11-16',
  plan: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/video-unify-plan-20261116.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-16',
  self: 'agency-os/handoffs/2026-11-16-video-unify-supervisor/',
  url: 'https://claude.ai/artifact/44ZLNFx32ZtLhQniaM79S5',
};

export const COPY = {
  sub: '舊影片工具併進影音工作台，變成一個工具。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '要你點頭', paths: '檔案' },
  now: { h: '現況', lead: '兩套系統今天已經接上與還沒接上的地方（計畫 §0，行號以 779f4d164 為準）。' },
  steps: { h: '卡片與工作', lead: '照相依順序做。U0、U1、U4、U7、U8、U10 互不相依，可以同時開工。U11 最後做，把舊畫面收掉。風險 High 的卡經你同意才上線。', count: '{done}／{total} 完成' },
  open: { h: '要你點頭', lead: '設計都已定案。這裡只列 High 風險的動作，執行當下要你說 go。', none: '目前沒有要你點頭的事。', count: '{n} 項', before: '{code} 上線前', src: '出處' },
  paths: { h: '檔案', plan: '完整計畫與每張卡的做法', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '已定', group: '可同時進行：' },
};

export const NOW = [
  { what: '兩套畫面在同一個影片網域、同一個登入下，主題與樣式讀同一份。', state: 'yes',
    ev: '計畫 G13：VW/index.html:75-104；VW/shared/runtime.js:4-6；nginx/default.conf:565（同源 frame）；NA/app/layout.tsx:18-23。' },
  { what: '工作台會排時間軸、照旁白逐句配音、用旁白產生字幕。', state: 'yes',
    ev: '計畫 G2：VW/scripts/tools-editor.js:936-967、969-992、1007-1032。' },
  { what: '外部服務包成工作台任務已有先例（片頭模板送 Remotion 服務）。', state: 'yes',
    ev: '計畫 G5：VW/backend/remotion.cjs:85-139；舊渲染引擎照這個寫法接進來（U5）。' },
  { what: '工作台的成片可以送審與投遞，但只到舊的 /release 頁；第 11 步「送審」永遠顯示「選用」。', state: 'yes',
    ev: '計畫 G8：VW/shared/jobs-view.js:13-22；VW/shared/episode-spine.js:286。' },
  { what: '工作台做出的成片在主系統有專案列（能送審、能排程自動完成）。', state: 'no',
    ev: '計畫 F9：MIG/0138_media_projects_v2.sql:16-18 的來源只收 manual、script_forge、content_topic；API/projects/route.ts:13 同。U0 補。' },
  { what: '腳本頁「送去做影片」開成工作台的一集。', state: 'no',
    ev: '計畫 F11：V/ScriptForge.tsx:89-96 送去舊草稿；計畫 G11：AI 導演只產純文字（VW/backend/api.cjs:1686-1733）。U3 補。' },
  { what: '腳本的場景與工作台的鏡頭格式相通。', state: 'no',
    ev: 'V/video-handoff.ts:45 只有 stripStageDirections，還沒有 shotsFromScript；鏡頭形狀在 VW/shared/episode-spine.js:173-176。U3 補。' },
  { what: '鏡頭卡能換圖、用圖庫素材、讓這鏡動起來。', state: 'yes',
    ev: 'U4（df5640559）已在 main，工作台還沒部署到正式站。選圖片模型（含 FLUX）還沒做。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const NA = 'apps/next-admin/';
const V = `${NA}app/(shell)/tools/video/`;
const API = `${NA}app/api/video/`;
const L = `${NA}lib/content/video/`;
const WB = `${NA}app/video/(wb)/`;
const VW = 'apps/video-workbench/';

export const STEPS = [
  { n: 1, code: 'U0', title: '專案列「建或取回」', plain: '例：同一集按兩次「送審」，主系統的專案清單只多一列，不會變兩列。',
    gate: '同一集建兩次只有一列；掛成片只掛同組織、還沒掛過的（拿掉組織條件，測試會紅）；同一比例有兩版時排程只取新的（拿掉去重，測試會紅）。',
    risk: 'Medium', model: 'Opus 5.5＋critic Deep；migration 另過 db-expert', status: 'done', commit: '79ab5f321', depends: [],
    what: 'migration：source check 加 video_workbench＋(organization_id, source_ref) 部分唯一索引；L/projects.ts ensureWorkbenchProject；API/projects POST／GET 加 attachAssetIds、sourceRef；project-advance-deps rows() 每比例取最新',
    files: ['lobster-factory/packages/db/migrations/（開卡取號，現最新 0163）', `${L}projects.ts`, `${API}projects/route.ts`, `${L}project-advance-deps.ts`],
    items: [
      done('U0.1', 'migration：專案來源加「影片工作台」，同組織同一集只能有一列；down 寫兩處。', '79ab5f321'),
      done('U0.2', '「建或取回」函式：沒有就建，同時建撞到就重查，標題不同就更新。', '79ab5f321'),
      done('U0.3', '專案 API 收工作台來源；可順手掛成片（只掛同組織、還沒掛專案的）；可用集的代號查。', '79ab5f321'),
      done('U0.4', '自動完成排程每個比例只取最新一支。', '79ab5f321'),
    ] },
  { n: 2, code: 'U1', title: '門頁機制＋側欄「作品」', plain: '例：在影音工作台左側點「作品」，看到的就是原本的「我的作品」，不用另開網站。',
    gate: '工作台用的頁沒有導覽列；直接開「作品」網址會被導回工作台；工作台原生頁的行為不變。',
    risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: 'dd64b4a18', depends: [],
    before: '工作台第一次部署要你點頭（待決 1）',
    what: 'NA/app/video/ 分 (door)／(wb) 兩個 route group（網址不變）；(wb) layout＝ProductDoorShell bare；index-1.js 子頁清單改成名字→來源表、讀 ?open=；works/ 搬進 (wb)；不通就停，U3、U6 不開',
    files: [`${NA}app/video/(door)/`, WB, `${WB}workbench.ts`, `${VW}scripts/index-1.js`, `${NA}lib/portal/products.ts`],
    items: [
      done('U1.1', '影片門的頁分成兩組（網址不變）；給工作台用的那組不畫導覽與登出列，保留開通檢查。', 'dd64b4a18'),
      done('U1.2', '工作台子頁清單改成一張表，讀網址上的 ?open=，側欄加「作品」。', 'dd64b4a18'),
      done('U1.3', '實測：在 Next 頁裡載入工作台並導覽一次；不通就停在這張，腳本與審片發布的卡不開。', 'dd64b4a18'),
    ] },
  { n: 3, code: 'U2', title: '一套樣式', plain: '例：腳本頁的按鈕、輸入框、卡片跟工作台其他頁長得一樣，原本的下拉選單變成一排按鈕。',
    gate: '檢查器量到零個 hex 色碼、零個自訂字體、零個下拉；按鈕、輸入框、卡片的樣式跟原生頁相同；腳本頁既有測試全綠。',
    risk: 'Medium', model: 'Opus 5.5 定共用元件與檢查器；逐檔替換派 fullstack-engineer（Sonnet）或 Codex', status: 'in_progress', depends: ['U1'],
    what: 'panel-primitives.ts 補按鈕／輸入框／卡片／選項鈕（只讀 token）；ScriptForge 十個小元件、StoryBibleWorkbench、QaStep、ReleaseDeliveryPanel、RightsCheckbox 改用；去 DM Serif Display、hex、<select>；style-contract 檢查器＋Playwright computed style 比對',
    files: [`${NA}components/tools/panel-primitives.ts`, `${V}ScriptForge.tsx`, `${V}StoryBibleWorkbench.tsx`, `${V}QaStep.tsx`, `${V}ReleaseDeliveryPanel.tsx`, `${V}RightsCheckbox.tsx`, `${WB}__tests__/style-contract.test.ts`],
    items: [
      done('U2.1', '共用的按鈕、輸入框、卡片、選項鈕，顏色只讀主題；腳本、聖經、審片、發布的元件改用它。', '3a3ad4565'),
      done('U2.2', '拿掉自訂字體、寫死的色碼、下拉選單（改成按鈕組）。', '3a3ad4565'),
      todo('U2.3', '檢查器：工作台用到的元件一個 hex、字體、下拉都不能有；另比對原生頁與門頁的樣式。檢查器已做（3a3ad4565）；原生頁與門頁的畫面比對還沒跑。'),
    ] },
  { n: 4, code: 'U3', title: '腳本＝新系統的腳本功能', plain: '例：在側欄「腳本」寫好一支三場景腳本，按「送去做影片」，工作台多一集，鏡頭已經排好。',
    gate: '別組織的品牌送社群被拒（拿掉權限檢查，測試會紅）；送去做影片後多一集、鏡頭數等於場景數；寫回這一集後集數不變、鏡頭被取代；對白與畫面不掉、舞台指示去掉。',
    risk: 'Medium', model: 'Opus 5.5；新路由加 critic Deep', status: 'done', commit: 'fb790d851', depends: ['U2'],
    what: 'WB/script-forge/page.tsx 掛 ScriptForge；video-handoff.ts 加 shotsFromScript、charactersFromStoryBible；runtime 主頁動作 spine-create、spine-set-shots；episode-spine newProject() 與 adopt 共用；API/social-drafts/text 與 social/posts 共用 lib/social 函式',
    files: [`${WB}script-forge/page.tsx`, `${V}video-handoff.ts`, `${VW}shared/episode-spine.js`, `${VW}shared/runtime.js`, `${NA}app/api/social/posts/route.ts`, `${API}social-drafts/text/route.ts`, `${NA}lib/portal/hosts.ts`],
    items: [
      done('U3.1', '側欄「腳本」＝原本腳本頁的同一個元件，入口與流程不變。', 'fb790d851'),
      done('U3.2', '「送去做影片」開工作台的新一集，鏡頭與角色帶進去。', 'fb790d851'),
      done('U3.3', '一集第 2 步「寫腳本」；寫完按「寫回這一集」，已有鏡頭時先確認會取代。', 'fb790d851'),
      done('U3.4', '「送社群」走影片 API 新路由，跟社群工具同一個權限檢查；社群沒裝時按鈕不出現。', 'fb790d851'),
    ] },
  { n: 5, code: 'U4', title: '鏡頭卡補齊', plain: '例：在鏡頭卡按「圖庫素材」打「海邊日落」，選一張 Pexels 照片換上；再按「讓這鏡動起來」變成一段影片。',
    gate: '換圖後剪輯裡的片段標示過期；白名單外的圖庫來源被拒（拿掉白名單，測試會紅）；有圖的鏡頭生影片後鏡頭帶著影片。',
    risk: 'Medium', model: 'Opus 5.5', status: 'in_progress', depends: [],
    what: '換圖走素材選擇器＋主頁動作 spine-set-shot；圖庫素材打 API/regenerate-image（visual:"broll"）→ 網址匯入改共用函式＋Pexels／R2 白名單＋允許影片；圖生影片 target:"shot:<id>"；生圖模型清單補 FLUX',
    files: [`${VW}scripts/projects-0.js`, `${VW}backend/api.cjs`, `${VW}shared/episode-spine.js`, `${API}regenerate-image/`, `${NA}public/editor-shared/image-models.js`],
    items: [
      done('U4.1', '「換圖」：從素材庫選或上傳，含「有權使用」勾選。', 'df5640559'),
      done('U4.2', '「圖庫素材」：用關鍵字找 Pexels 圖片或影片；網址匯入只收白名單來源。', 'df5640559'),
      done('U4.3', '「讓這鏡動起來」：用這張圖當第一格生成影片，按鈕標每秒 NT$。', 'df5640559'),
      todo('U4.4', '生成畫面時可以選圖片模型，含 FLUX。還沒做：工作台沒有 FLUX 文生圖的供應商模組，要先決定接哪一家。'),
      todo('U4.5', '「讓這鏡動起來」可以選影片模型（Runway、Veo、Luma…），每顆標每秒 NT$；視覺風格清單跟舊的對齊。'),
    ] },
  { n: 6, code: 'U5', title: '快速輸出、多比例、一鍵成片', plain: '例：在一集按「一鍵成片」，看到總價 NT$ 後確認；缺的圖自動補齊，接著出 16:9 和 9:16 兩支成片。',
    gate: '別組織的素材被拒（拿掉組織條件，測試會紅）；快速輸出完成後成片區多一支、歷史紀錄有任務、主系統只有一列；選兩個比例出兩個任務；一鍵成片中途重開頁面會接著做，已有圖的鏡頭不重生。',
    risk: 'High', model: 'commit 1：Opus 5.5＋critic Deep；commit 2、3：Opus 5.5', status: 'in_progress', depends: ['U0', 'U4'],
    what: '內部路由 quick-render（Bearer VW_INTERNAL_TOKEN，只收資產 id）＋render-draft 送渲染段抽成 L/ 函式；VW/backend/quick-render.cjs 照 remotion.cjs 的供應商寫法；第 9 步兩種輸出、比例複選；episode.autoRun 一鍵成片',
    files: [`${NA}app/api/internal/video/workbench/quick-render/`, `${API}render-draft/route.ts`, L, `${VW}backend/quick-render.cjs`, `${VW}scripts/editor-export-dialog.js`, `${VW}scripts/projects-0.js`],
    items: [
      done('U5.1', 'commit 1：舊渲染引擎包成工作台任務；成片回到工作台素材庫，主系統只有一列。限制：每個鏡頭一定要有旁白（鏡頭長度＝旁白長度）；最多 30 個鏡頭；單一素材 200MB 以內。', '2f26d7dac'),
      done('U5.2', 'commit 2：第 9 步分成「快速輸出」「剪輯輸出」；比例可以複選，每個比例一個任務；確認框列出成本明細（NT$）。', 'dab070ccd'),
      todo('U5.3', 'commit 3：「一鍵成片」：先補齊缺的圖再快速輸出，按之前顯示總價；頁面關掉再開會接著做。確認框多一組「缺的畫面怎麼補」：AI 生圖／圖庫影片／圖庫照片。確認框另有「片頭」「片尾」（不要／標題卡／五個模板）與轉場（無／交叉淡化／淡黑）。'),
      todo('U5.4', '選了片頭就自動接成一支，片頭與第一鏡之間有轉場；同一支片頭只渲染一次，再輸出不重扣；片頭失敗時問「重試」或「不加片頭先出片」。片尾同一套。'),
      todo('U5.5', '成片卡「片頭」：編輯、重新生成、加入這支影片。換片頭不重生鏡頭，出新版本，舊版保留。成片卡另加「複製連結」。'),
    ] },
  { n: 7, code: 'U6', title: '審片與發布併進成片', plain: '例：成片卡按「審片」勾完四項檢查，接著在「發布」寫 IG 與 FB 各一版文案，存成社群草稿。',
    gate: '勾兩個不同平台會存成兩份各自的文案草稿；從一集打開只列這一集的成片；一筆舊專案在專案頁看得到、成片能播、能核准。',
    risk: 'Medium', model: 'fullstack-engineer（Sonnet）', status: 'done', commit: '58050a441', depends: ['U2', 'U0'],
    what: 'WB/review-release/page.tsx（QaStep＋ReleaseDeliveryPanel，鎖定組織）；(door)/release 導回殼；jobs-view「送審與投遞」改開殼內面板；步驟列第 11 步審片、第 12 步發布，狀態每次讀鏈；成片卡「發布到哪」；舊專案唯讀卡',
    files: [`${WB}review-release/page.tsx`, `${V}QaStep.tsx`, `${V}ReleaseDeliveryPanel.tsx`, `${NA}app/video/(door)/release/`, `${VW}shared/jobs-view.js`, `${VW}scripts/projects-0.js`, `${VW}shared/episode-spine.js`],
    items: [
      done('U6.1', '審片與發布面板：上半四項檢查與「有權使用」，下半核准、封面、社群草稿、WP 嵌入；舊的 /release 導回工作台。', '58050a441'),
      done('U6.2', '步驟列第 11 步「審片」、第 12 步「發布」，打勾與否每次讀真實結果。', '58050a441'),
      done('U6.3', '成片卡顯示「發布到哪」與成效；舊專案以唯讀卡列在專案頁。成片清單只列最新 200 支（舊發布頁本來就這樣）。', '58050a441'),
    ] },
  { n: 8, code: 'U7', title: '字幕與音檔', plain: '例：把客戶設成「音檔不可外送」後，按 OpenAI 轉錄會被擋下；改按「改用自家主機（免費）重試」就能轉。',
    gate: '設成不可外送時，每個會把音檔送出主機的工作都被拒、而且沒有對外請求；查不到設定也拒（拿掉檢查，測試會紅）；改一句字幕重燒後成片字幕跟著更新。',
    risk: 'Medium', model: 'Opus 5.5＋critic Deep', status: 'done', commit: 'ea91b5819', depends: [],
    what: '字幕工具來源加「主系統成片」→ API/captions/reburn 包成工作台任務；轉錄失敗給自家主機重試鈕；內部路由 audio-policy＋工作台後端每個外送音檔 operation 前檢查；/capabilities 標不可用',
    files: [`${VW}scripts/tools-subtitles.js`, `${API}captions/reburn/`, `${NA}app/api/internal/video/workbench/audio-policy/`, `${VW}backend/transcribe.cjs`, `${VW}backend/audio-tools.cjs`, `${L}transcription.ts`],
    items: [
      done('U7.1', '字幕工具讀主系統成片的字幕，逐句改完重燒；成片卡加「改字幕」「下載 SRT／VTT」。（新按鈕只跑過測試，還沒在瀏覽器點過）', 'ea91b5819'),
      done('U7.2', '轉錄失敗時，錯誤旁邊出現「改用自家主機（免費）重試」。', 'ea91b5819'),
      done('U7.3', '音檔不外送：開關放工作台設定；後端每個外送音檔的工作先查設定，查不到就擋。', 'ea91b5819'),
    ] },
  { n: 9, code: 'U8', title: '片頭模板與時間軸 v1', plain: '例：在剪輯器文字面板選「商品評測打字機」片頭，放上 logo 和配樂，長度調成 8 秒。',
    gate: '五個模板各出一支（假服務）；長度不是 5 秒也能送出。',
    risk: 'Low', model: 'fullstack-engineer（Sonnet）', status: 'in_progress', depends: [],
    what: 'remotion.cjs 模板表補三個舊模板＋logoUrl、audioUrl、可調長度；文字面板表單跟表產生；剪輯器「匯出時間軸 v1」接 /editor/timeline-v1 → API/timeline/validate',
    files: [`${VW}backend/remotion.cjs`, `${VW}scripts/editor-panes/text.js`, `${VW}backend/api.cjs`, `${API}timeline/validate/`],
    items: [
      done('U8.1', '片頭模板補舊的三個，加 logo、背景音樂、可調長度。', 'a878b713a'),
      done('U8.2', '剪輯器「匯出時間軸 v1」，送去檢查並列出問題。', 'a878b713a'),
      todo('U8.3', '片頭表單：從這一集預填文字，圖欄位可直接生成，主標語顯示字數上限。'),
      done('U8.4', '片頭渲染服務當掉時任務不再消失。原因：編碼程式照整台主機的規格開執行緒，在 1GB 容器裡被系統殺掉，連帶拖垮服務。2026-11-16 已上線：實送一支 6 秒片頭 86 秒完成，記憶體高峰 627MB，服務沒重啟。', '646f1698b'),
      todo('U8.5', '剪輯器「放到時間軸開頭」後自動加預設轉場；片頭面板顯示這一集目前的片頭設定。'),
    ] },
  { n: 10, code: 'U9', title: '一本聖經', plain: '例：在製作聖經按「存成核准版本」，到腳本頁的 Story Bible 清單就看得到同一版。',
    gate: '存成核准版後腳本頁看得到；套用後再存，兩邊不認得的欄位沒有掉。',
    risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['U3'],
    what: '專案加 storyBibleSeries；製作聖經「存成核准版本」（POST API/story-bibles＋approve，不帶 projectId）、「套用核准版本」；L/story-bible.ts 旁一對對照純函式；第 3 步一致性比對',
    files: [`${API}story-bibles/`, `${L}story-bible.ts`, `${VW}scripts/projects-0.js`, `${VW}shared/runtime.js`],
    items: [
      todo('U9.1', '製作聖經加「存成核准版本」「套用核准版本」，跟腳本頁的 Story Bible 是同一條版本鏈；不認得的欄位原樣保留。另補 U3 留下的兩件：「寫回這一集」要把角色綁回去；轉成其他平台版本的腳本要保留角色對應。'),
      todo('U9.2', '第 3 步加「一致性比對」：鏡頭圖對核准版。'),
    ] },
  { n: 11, code: 'U10', title: '用量與方案', plain: '例：點工作台右上角的用量，看到目前方案、剩下的點數和成效。',
    gate: '有方案與沒方案兩種情況都顯示正確。',
    risk: 'Low', model: 'fullstack-engineer（Sonnet）', status: 'done', commit: '2f0b08bb8', depends: [],
    what: 'VW/index.html:55 固定文字改讀 API/billing；小面板：方案、點數、已用量、成效（API/outcomes），對照 MediaOperationsPanel 逐項',
    files: [`${VW}index.html`, `${API}billing/`, `${API}outcomes/`, `${V}MediaOperationsPanel.tsx`],
    items: [
      done('U10.1', '右上用量那行改成讀真實的方案資料。', '2f0b08bb8'),
      done('U10.2', '點開看方案、點數、已用量、成效，跟舊面板逐項對照。還沒做：子組織登入時顯示的是誰的方案，要後端改動才能確定。', '2f0b08bb8'),
    ] },
  { n: 12, code: 'U11', title: '收尾', plain: '例：員工打開舊的影片工具網址，直接進影音工作台，之前寫過的腳本歷史還在。',
    gate: '來源不在員工門清單的訊息被丟掉（拿掉來源檢查，測試會紅）；刪除後型別檢查與登記表測試全綠。',
    risk: 'Medium', model: 'commit 1：Opus 5.5；commit 2：fullstack-engineer（Sonnet）', status: 'not_started',
    depends: ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10'],
    what: '驗收表（§3 每列實走）；commit 1 入口改「開啟影音工作台」＋sf_history postMessage（只收 staffHosts）＋側欄合一；commit 2 刪 §5 清單、(door)/page.tsx 導向 /、products.ts 與登記表、文件',
    files: [`${V}page.tsx`, `${NA}app/(shell)/tools/script-forge/page.tsx`, `${NA}app/sidebar-sections.ts`, `${NA}app/(shell)/tools/theme/page.tsx`, `${NA}lib/portal/hosts.ts`, `${NA}lib/portal/products.ts`],
    items: [
      todo('U11.1', '驗收：計畫 §3 每一列舊能力都在工作台實際走一遍，全過才往下。驗收以計畫 §8 的 20 列為準。既有測試 pj1-legacy-ui 在 main 上本來就逾時（不在總閘內），驗收時修好或刪掉。'),
      todo('U11.2', 'commit 1：舊入口改成「開啟影音工作台」，這台瀏覽器的腳本歷史搬過去（只收員工門來的訊息，原資料不刪）。'),
      todo('U11.3', 'commit 2：刪掉退場的舊畫面、舊入口登記與過時文件。'),
    ] },
];

export const OPEN = [
  { n: 1, what: '影音工作台部署到正式站。屬 High，每次部署當下都要你說 go，2026-11-16 已部署一次（4b5daf721：U1、U4、U5 第一段、U7、U8、U10 上線，smoke 全過）；U3、U5 第二段、U6 於 2026-11-16 第二次部署上線；之後的卡上線前一樣要說 go。', before: 'U1', src: '計畫 §4 共通、§6；AGENTS §3' },
];
