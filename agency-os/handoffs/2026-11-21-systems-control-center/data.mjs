// 系統總控中心 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 設計正本：PLAN.md（做法）、DISPATCH.md（派工與驗收）、briefs/（每張卡）。這裡只放「狀態」與「白話」，不重述做法。
// 狀態四種：未開始＝not_started；進行中＝in_progress；待驗收＝in_progress＋waitFor；已併入＝done（必有 commit）。

export const META = {
  title: '系統總控中心 監工台',
  updated: '2026-11-21',
  plan: 'agency-os/handoffs/2026-11-21-systems-control-center/PLAN.md',
  dispatch: 'agency-os/handoffs/2026-11-21-systems-control-center/DISPATCH.md',
  self: 'agency-os/handoffs/2026-11-21-systems-control-center/',
};

export const COPY = {
  sub: '系統總控中心（app 後台的 /ops/systems）讓操作者在一個頁面看到每個系統的用途、做到哪、下一步是什麼。進度不靠人填，而是每天由主機讀 git 的提交紀錄自動整理。本頁只看這個專案自己的派工進度。共 {total} 張卡。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '批次與卡', safe: '不會拖垮別的東西', open: '待你決定', risks: '風險與處置', paths: '檔案' },
  now: { h: '現況', lead: '目前真的能不能用。' },
  steps: { h: '批次與卡', lead: '第一批的四張卡同時進行，各自改不同的檔案；整批交回後才做整合。', count: '{done}／{total} 已併入' },
  safe: { h: '不會拖垮別的東西', lead: '追蹤工具壞了，只會讓資料變舊，不會擋提交、部署或其他服務。六道隔離如下。' },
  open: { h: '待你決定', lead: '兩件都會動到正式環境，所以由你點頭才做。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  risks: { h: '風險與處置', lead: '每批一張表。工人交回的每條風險，都要有處置：現在處理、實測驗證，或記下不處理的理由。', empty: '工人尚未交回，交回後由監工逐條填入。', cols: '風險', act: '處置' },
  paths: { h: '檔案', plan: '設計正本', dispatch: '派工與驗收', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已併入', risk: '風險', who: '模型', evidence: '完成的樣子', details: '細節', depends: '需先完成', none: '無', files: '檔案', card: '卡片', doneAt: '併入於', decided: '決定', group: '可同時進行：', item: '第 {n} 張' },
};

export const NOW = [
  { what: '設計已定案，四張卡已派給工人。', state: 'yes', ev: 'PLAN.md 定案、DISPATCH.md 派工表（2026-11-21）。' },
  { what: '主機匯入器、資料表、頁面。', state: 'no', ev: '第一批四張卡進行中，還沒有任何一張併入主線。' },
  { what: '每天自動更新進度。', state: 'no', ev: '要等整合完成、你同意裝排程之後才會開始。' },
];

export const STEPS = [
  { n: 1, code: 'W1', group: 'B1', title: '主機匯入器', plain: '主機上的小程式，每天讀 git 提交紀錄，整理成事件送給後台。解析、歸屬、重跑不重複都在這裡，並有自己的測試。',
    gate: '對真實 repo 預演一次，輸出的事件格式符合契約，重跑不重複；測試全綠。', risk: 'Low', model: 'Opus 5.5', status: 'in_progress', depends: [],
    what: 'python 匯入器＋cron.d 檔＋測試；不進 next-admin 的測試。', card: 'briefs/W1-importer.md' },
  { n: 2, code: 'W2', group: 'B1', title: '資料表、接收端與頁面', plain: '後台新增四張表、一個只收匯入器資料的接收端，以及 /ops/systems 頁面。資料表先寫好檔，不套正式庫。',
    gate: '未登入、一般員工、非授權帳號直打頁面與接收端都被拒；相關測試與型別檢查綠。', risk: 'Medium（套正式庫是 High，不在本卡）', model: 'Opus 5.5', status: 'in_progress', depends: [],
    what: 'migration 0174、ingest route、投影、頁面；只寫四張表。', card: 'briefs/W2-app.md' },
  { n: 3, code: 'W3', group: 'B1', title: '系統清單與搬遷腳本', plain: '寫出第一個系統（外聯系統）的清單，加上把舊監工頁資料搬進來的腳本，並讓新增產品的腳本同時登記系統清單。',
    gate: '清單通過檢查；搬遷腳本對外聯系統預演成功；新增產品腳本會同時寫兩邊。', risk: 'Low', model: 'Sonnet 5.5', status: 'in_progress', depends: [],
    what: 'agency-os/systems/registry.json、遷移腳本、new-product 接線。', card: 'briefs/W3-registry.md' },
  { n: 4, code: 'W4', group: 'B1', title: '監工台頁', plain: '本頁。讓操作者看這個專案的派工進度、風險與待決的事。',
    gate: 'node build.mjs 與 node check.mjs 皆綠；頁面不含色碼、不用下拉。', risk: 'Low', model: 'Sonnet 5.5', status: 'in_progress', waitFor: '待驗收', depends: [],
    what: 'data.mjs、build.mjs、check.mjs、supervisor.html；不發布，由監工發布。', card: 'briefs/W4-supervisor-page.md' },
  { n: 5, code: 'B2', group: 'B2', title: '整合與上線', plain: '把四張卡合起來：預演匯入器、對本機接收端實打、看頁面。然後經你同意套資料表、推上主線、裝排程、切換外聯系統。',
    gate: '本機完整跑通一輪；資料表套用後遷移檢查綠，才推含該資料表的提交；排程裝好且預設關閉。', risk: 'High（套資料表、裝排程）', model: '監工', status: 'not_started', before: '待決 1、待決 2', depends: ['W1', 'W2', 'W3', 'W4'],
    what: '先套後推：資料表先套正式庫並確認遷移檢查綠，才推含它的提交。', card: 'DISPATCH.md' },
  { n: 6, code: 'B3', group: 'B3', title: '系統盤點與其餘監工頁切換', plain: '把所有系統寫進清單，讓程式路徑都有歸屬；其餘舊監工頁一次一個階段切換過來。',
    gate: '近 90 天非共用程式路徑全部有歸屬；切換的舊頁改成指向新頁。', risk: 'Medium', model: '待定', status: 'not_started', depends: ['B2'],
    what: 'PLAN.md 第 10 節步驟 3、4。', card: 'PLAN.md' },
];

export const OPEN = [
  { n: 1, what: '套用資料表（正式庫新增四張表，不動既有表）。先套、確認遷移檢查綠，才推上主線；否則每晚部署會被擋。', before: 'B2', src: 'PLAN.md 第 6 節', options: [
    { k: '同意', t: '由監工從筆電連線套用，套完驗證再推。', pick: true },
    { k: '先不要', t: '整合停在本機，頁面不上線。' },
  ] },
  { n: 2, what: '安裝每天一次的匯入排程（台灣 04:30）。裝好時匯入開關預設關閉，要另外打開才會開始跑。', before: 'B2', src: 'PLAN.md 第 6 節', options: [
    { k: '同意', t: '裝好但保持關閉，確認資料沒問題後再開。', pick: true },
    { k: '先不要', t: '只在本機手動跑。' },
  ] },
];

// 六道隔離（白話）。正本：PLAN.md 第 6 節。
export const SAFE = [
  { h: '匯入器本體', t: '寫成 python 檔，語法錯誤也不會讓主機的腳本同步整批失敗、部署被拒。' },
  { h: '匯入排程', t: '走既有的排程包裝，會出現在排程頁、紅燈會通知一次；同時只跑一個、五分鐘到就停、用最低優先權；用獨立的 git 副本，不碰部署用的工作樹；開關預設關閉。' },
  { h: '寫入資料庫', t: '匯入器只能打接收端，接收端只能寫這四張表，主機腳本不持有資料庫憑證。' },
  { h: '資料表上線', t: '先套正式庫、確認檢查綠，才推上主線；只新增表，不改既有表。' },
  { h: '後台測試', t: '解析與歸屬邏輯放在匯入器，用自己的測試；後台只留接收端驗證、授權與頁面讀取，推前本機測試與型別檢查必須綠。' },
  { h: '頁面', t: '有錯誤邊界，錯誤不拖垮後台；查詢有上限與索引；頁面只能寫狀態變更與審核兩種事件。' },
];

// 風險表：每批一張。rows 每列 { card, risk, act }，act＝處置（現在處理／實測驗證／記錄不處理的理由），不得空。
export const RISKS = [
  { batch: '第一批', rows: [] },
  { batch: '第二批', rows: [
    { card: 'B2', risk: '資料表推上主線但正式庫未套，每晚部署被遷移檢查擋住。', act: '先套後推；套之前問你，套完確認遷移檢查綠才推。' },
    { card: 'B2', risk: '後台測試或型別檢查紅，擋住每晚自動部署。', act: '推前本機跑測試與型別檢查，綠才推。' },
    { card: 'B2', risk: '排程吃資源或卡住。', act: '同時只跑一個、五分鐘上限、最低優先權、預設關閉；紅燈走排程頁通知。' },
  ] },
];
