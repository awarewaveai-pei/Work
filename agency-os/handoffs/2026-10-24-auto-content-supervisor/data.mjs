// 全自動內容管線 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：AUTO_CONTENT_EXECUTION_PLAN.md（§7 每張卡怎麼做、§0 決策）。這裡只放「狀態」與「白話」，不重述做法。
// items = 計畫 §7 的每一張卡（check.mjs 驗一一對應）；完成一張就把那張改 done＋commit，階段狀態跟著算。

export const META = {
  title: '全自動內容 監工台',
  updated: '2026-10-24',
  plan: 'agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md',
  req: 'agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_PIPELINE_REQUIREMENTS.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-24',
  self: 'agency-os/handoffs/2026-10-24-auto-content-supervisor/',
  url: 'https://claude.ai/artifact/TUMBoFwaMCKbPgVmLVjEUZ',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '熱門話題變成題目，題目自動變成 SEO 文章、社群貼文和影片，再依每個網站的設定存草稿或自動發布。共 {total} 個階段、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '階段與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '現在真的能用的，和還不能用的。' },
  steps: { h: '階段與工作', lead: '依編號做；每個階段底下列出全部工作，✓ 是已完成。同一組的階段改不同檔案，可以同時做。風險 High 的階段要你點頭才動工。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的階段才能開工。', none: '目前沒有要你決定的事。', count: '{n} 項', before: '要在第 {n} 階段開工前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作怎麼做', req: '你的需求原文', track: '紀錄', self: '本頁來源', howto: '改 data.mjs，執行 node build.mjs 和 node check.mjs，再重新發布同一個網址' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '要先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時做：' },
};

// 現在真的能不能用（2026-10-24 查）
export const NOW = [
  { what: '計畫定案', state: 'yes', ev: '需求逐條對照程式查證，八個階段（commit cfc6e08d7）' },
  { what: '文章、社群貼文、影片腳本共用同一份品牌語氣', state: 'yes', ev: '程式已推上 main（7d8d618a4）；今晚台灣 03:00 自動部署後在正式站生效' },
  { what: '社群貼文不會超過平台字數上限', state: 'yes', ev: '程式已推上 main（30b6a022f）；超長會自動重寫一次，仍太長就不送出；今晚台灣 03:00 部署後生效' },
  { what: '熱門話題抓到後會存下來', state: 'yes', ev: '資料表已套正式庫（0121）；程式（eb67660a3）今晚台灣 03:00 部署後開始存，90 天自動清理' },
  { what: '每月列出題目', state: 'yes', ev: '今晚部署後在側欄 Marketing → Topic Queue 按「AI 提案本月題目」；每月自動跑要等第 4 階段' },
  { what: '核准的題目自己變成文章草稿和社群草稿', state: 'no', ev: '程式已推上 main（31145e3ad），題目頁「核准並開始」今晚部署後就能用；每 5 分鐘自動跑要等你同意裝主機排程' },
  { what: 'AI 審核通過後自動發布', state: 'yes', ev: '程式已推上 main（f985992a2），今晚台灣 03:00 部署後生效；網站預設「人工審核」，要由員工在網站設定按「AI 審核後自動發布」並再確認一次才會開' },
  { what: 'ScriptForge 獨立頁，每個模組有自己的角色', state: 'yes', ev: '程式已推上 main（f233bd101），今晚台灣 03:00 部署後在側欄 Content Tools → ScriptForge；提示全部改在伺服器組，品牌讀客戶網站設定' },
  { what: '關掉分頁後影片仍會嵌回文章', state: 'no', ev: '目前要開著文章頁等影片做完（第 6 階段）' },
  { what: '發到 YouTube', state: 'no', ev: '社群工具還沒有 YouTube（第 7 階段）' },
];

const P1 = '7d8d618a4';
const P2 = '30b6a022f';
const P3 = 'eb67660a3';
const P4A = '31145e3ad';
const P4B = 'f985992a2';
const P5C = 'f233bd101';
const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });

// ScriptForge 24 個模組裡要搬到伺服器的 23 個（P5.3–P5.25，順序照計畫 §7 P5 那一列）
const MODULES = ['手動生成', '文章轉腳本', '產業模板', '廣告 A/B/C', 'AI 主持人稿', '品牌故事', '銷售對話', '演講腳本', 'Pitch Deck',
  'SEO 轉腳本', 'Hook 生成器', '受眾痛點', '爆款拆解', '縮圖文案', '腳本轉文案', '多語言版本', '動態預覽', '績效預測', '品牌速建',
  '品牌語氣', '30 天計畫', '客戶提案包', '短劇 Story Bible'];

// 計畫 §7 的階段，依開工順序。status 由 items 算（check 驗）；done 必填 commit。
export const STEPS = [
  { n: 1, code: 'P1', group: 'A', plain: '所有寫內容的工具共用同一份品牌語氣：在客戶網站設定改一次，文章、社群貼文、影片腳本都跟著變。', title: '品牌聲音只存一份',
    gate: '社群改寫和影片腳本用的是客戶網站存的品牌語氣；換一台電腦開 ScriptForge 也是同一份', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: P1, depends: [],
    waitFor: '今晚台灣 03:00 自動部署後才在正式站生效',
    what: 'lib/content/brand-voice.ts 一個渲染器；brand-voice-store.ts 伺服器讀取含租戶檢查；ScriptForge 刪 sf_brand；by-id 站別 API 加租戶閘',
    files: ['lib/content/brand-voice.ts', 'lib/content/brand-voice-store.ts', 'app/(shell)/tools/video/ScriptForge.tsx'],
    items: [
      done('P1.1', '建一個共用的品牌語氣格式和寫法，瀏覽器和伺服器用同一份', P1),
      done('P1.2', '文章工具改用共用寫法產生行銷簡報；三份重複的選項表收成一份', P1),
      done('P1.3', '社群改寫讀客戶網站存的品牌語氣', P1),
      done('P1.4', 'ScriptForge 不再把品牌存在瀏覽器；品牌語氣、品牌速建、產業模板改存到客戶網站設定', P1),
      done('P1.5', '影片腳本也讀同一份品牌語氣', P1),
    ] },
  { n: 2, code: 'P2', group: 'B', plain: '一個「寫社群貼文」功能給四個地方共用；每個平台的字數上限只記在一處，超過就重寫。', title: '寫社群貼文共用核心',
    gate: '每個平台產出的貼文都不超過該平台的字數上限；文章工具和社群工具改寫出來的結果守同一套規則', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: P2, depends: ['P1'],
    what: '新 lib/social/write-posts.ts；平台規格由 limits.ts BODY_LIMITS 導出；syndicate 變薄殼',
    files: ['lib/social/write-posts.ts', 'lib/content/syndicate.ts', 'lib/social/limits.ts'],
    items: [
      done('P2.1', '建「寫社群貼文」共用功能：字數上限只從一處讀，超過就重寫一次；仍太長的不送出', P2),
      done('P2.2', '文章工具和社群工具的兩個改寫入口都用它，收費項目不變', P2),
      done('P2.3', '社群工具的平台對照表改由共用功能提供，只留一份', P2),
    ] },
  { n: 3, code: 'P3', group: 'C', plain: '熱門話題抓到就存下來；每月自動列出約 28 個題目，在一頁上勾選核准、選要做文章／社群／影片。', title: '熱搜落地＋題目佇列',
    gate: '同一天同一則熱搜只存一筆；題目頁看得到這個月的題目，可以核准、退回、選格式', risk: 'High（資料庫新表）', model: 'Opus 5.5', status: 'done', commit: P3, depends: ['P2'],
    waitFor: '資料庫已套用；程式今晚台灣 03:00 自動部署後在正式站生效',
    what: 'migration 0121：content_trends、content_topics、client_schedules 加每 5 分鐘頻率；題目頁 /tools/content/topics',
    files: ['packages/db/migrations/0121_content_topics.sql', 'lib/content/topics/', 'app/(shell)/tools/content/topics/'],
    items: [
      done('P3.1', '資料庫加熱搜紀錄表和題目表，排程器加「每 5 分鐘」頻率（套到正式庫要你同意）', P3),
      done('P3.2', '每次抓熱搜都存下來，同一天同一則只存一筆', P3),
      done('P3.3', '題目的讀寫功能：提案、核准、退回、記錄做到哪一步', P3),
      done('P3.4', '每月自動提案約 28 個題目：參考近 30 天熱搜、知識庫和品牌語氣，日期分散在整個月', P3),
      done('P3.5', '新的題目頁：月份一覽，勾選核准或退回，選要做文章／社群／影片', P3),
      done('P3.6', '蒐尋器存進知識庫的資料，可以一鍵加成題目', P3),
    ] },
  { n: 4, code: 'P4', group: 'D', plain: '在排程頁勾一格後，核准的題目會自己變成 WordPress 草稿和社群草稿；選了「AI 審核自動發」的網站，通過檢查就自動發布。', title: '排程管線＋AI 審核',
    gate: '在測試網站核准一題，幾分鐘內 WordPress 和社群工具都出現草稿；人工審核模式下永遠不會自己發布', risk: 'High（自動發布、主機排程）', model: 'Opus 5.5', status: 'in_progress', depends: ['P3'],
    decided: '每天最多開始 2 題；主機每 5 分鐘叫醒排程；資料庫也鎖住題目的網站屬於同一客戶（2026-10-24 你說「你決定」；0122 已套正式庫，ac55a28fc）',
    before: '待決 7',
    what: '既有排程器升到每 5 分鐘、由主機 cron 驅動；job content_pipeline；題目狀態機；規則閘先、AI 後',
    files: ['lib/schedules/schedule.ts', 'lib/schedules/jobs.ts', 'lib/content/topics/tick.ts', 'lib/content/topics/make.ts', 'scripts/schedules-run-due.sh', 'packages/db/migrations/0122_content_topics_site_org.sql'],
    items: [
      done('P4.0', '查過正式站：回應後才做的背景工作 30 天 27 次全部做完，排程照這個方式跑', P4A),
      done('P4.1', '自動發文時用客戶身分驗證，只能發到該客戶自己的網站', P4A),
      done('P4.2', '排程器能判斷「每 5 分鐘」該不該跑', P4A),
      done('P4.3', '排程被叫醒時照舊先登記、回應後再做（不等，長的爬取才不會逾時）', P4A),
      todo('P4.4', '主機每 5 分鐘叫醒排程器一次，取代外部排程服務（要你同意）'),
      done('P4.5', '新排程工作「內容管線」：每次把題目往前推，做到文章草稿和社群草稿；每天最多 2 題', P4A),
      done('P4.6', '審核通過＋網站選了自動發才發布；排定日未到就等到當天再發；社群貼文在文章上線後才排、帶文章連結', P4B),
      done('P4.7', '題目頁「核准並開始」：按下當下就開始做', P4A),
      done('P4.8', '網站設定加兩顆按鈕：人工審核／AI 審核後自動發布，預設人工審核；只有員工能改，客戶在內容門看得到但不能改', P4B),
    ] },
  { n: 5, code: 'P5', group: 'C', plain: 'ScriptForge 變成獨立工具頁：左邊 24 個模組各有一行說明，每個模組有自己的專業角色；做完可以直接送社群或送影片。', title: 'ScriptForge 獨立頁＋伺服器模組登記',
    gate: '左欄 24 個模組都有說明；生成結果按「送社群」後，社群工具出現草稿', risk: 'Medium', model: 'Sonnet 5.5／Codex 照卡', status: 'done', commit: P5C, depends: ['P2'],
    waitFor: '今晚台灣 03:00 自動部署後在正式站生效',
    what: 'lib/script-forge/modules.ts 24 筆登記；route 只收 {module, fields}；新頁 /tools/script-forge',
    files: ['lib/script-forge/modules.ts', 'app/api/tools/script-forge/route.ts', 'app/(shell)/tools/script-forge/'],
    items: [
      done('P5.1', '24 個模組在伺服器登記：名稱、一行說明、專業角色、輸出格式', P5C),
      done('P5.2', 'ScriptForge 的 AI 入口只收「模組＋欄位」，提示由伺服器組，不再由瀏覽器送整段提示（Banner Studio 也一起改）', P5C),
      ...MODULES.map((m, i) => done(`P5.${i + 3}`, `「${m}」改由伺服器組提示，用自己的專業角色`, P5C)),
      done('P5.26', '新的 ScriptForge 獨立頁（側欄 Content Tools → ScriptForge）：左欄 24 個模組附說明；影片工具裡的 ScriptForge 照常可用', P5C),
      done('P5.27', '腳本結果加「送社群」（存成社群草稿）「送去生產影片」（帶到影片工具）；「腳本轉文案」結果也能送社群', P5C),
    ] },
  { n: 6, code: 'P6', group: 'E', plain: '選了影片的題目，影片做好後自動嵌回文章、發到社群；關掉分頁也不會斷。', title: '影片接管線',
    gate: '關掉瀏覽器後，影片完成時文章裡仍出現影片，社群工具出現影片貼文', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['P4'],
    what: '抽 finalizeVideoJob／embedVideoInPost 成共用核心；排程每輪檢查影片；退場舊的文章頁 Postiz 面板',
    files: ['lib/content/video/finalize.ts', 'lib/content/topics/tick.ts'],
    items: [
      todo('P6.1', '「影片完成」和「嵌回文章」抽成共用功能，瀏覽器和排程都用它'),
      todo('P6.2', '排程每輪檢查影片；做好就嵌回文章，並發社群影片貼文'),
      todo('P6.3', '刪掉文章頁舊的社群發布面板和舊的 Python 直連發布'),
    ] },
  { n: 7, code: 'P7', group: 'F', plain: '影片可以直接發到 YouTube，和其他平台一起在社群工具排程。', title: 'YouTube',
    gate: '在社群工具選 YouTube 頻道排程一支影片，YouTube 後台看得到', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['P6'],
    before: '待決 4',
    what: 'Postiz youtube provider；撰寫頁收 YouTube 標題；寫貼文核心加 youtube 規格',
    files: ['lib/content/postiz.ts', 'lib/social/compose.ts'],
    items: [
      todo('P7.0', '到 Google 申請 YouTube 授權，在 Postiz 連上頻道（要你本人做）'),
      todo('P7.1', '社群工具加 YouTube：撰寫頁可以填 YouTube 標題'),
      todo('P7.2', '選了 YouTube 的題目，影片自動排進 YouTube'),
    ] },
  { n: 8, code: 'P8', group: 'G', plain: '每個階段做完就同步產品清單、模組說明和可執行示範；全部做完時收尾。', title: '治理收尾',
    gate: '產品清單、模組說明、可執行示範都和程式對得上；舊的內容積木藍圖指向新計畫', risk: 'Low', model: 'Opus 5.5', status: 'in_progress', depends: [],
    what: 'MODULE_MANIFEST、products.ts content.plan、RUNNABLE_DEMOS、sync-foundry-catalog、TASKS 收斂',
    files: ['lib/portal/products.ts', 'agency-os/docs/operations/RUNNABLE_DEMOS.md'],
    items: [
      done('P8.1', '舊的內容積木藍圖改成指向這份計畫', 'cfc6e08d7'),
      todo('P8.2', '產品清單和模組說明加上「題目規劃」這項新功能'),
      todo('P8.3', '可執行示範清單加一條你自己能跑的指令'),
      todo('P8.4', 'System Foundry 的產品目錄重新產生'),
      todo('P8.5', '待辦清單和排程頁計畫改指這份計畫'),
    ] },
];

// 操作者自己要決定或親手做的（agent 不能替她定）
export const OPEN = [
  { n: 4, what: '到 Google 申請 YouTube 發文授權（要你本人操作）', before: 'P7', src: '計畫 §0 D4' },
  { n: 7, what: '主機每 5 分鐘的排程時鐘已裝好（2026-10-24 12:11Z，另一個工作階段經你同意安裝）。跑順一天後，同意停掉外部（Trigger.dev）的每小時排程', before: 'P4', src: '計畫 §0 D6、P4.4' },
];
