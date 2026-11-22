// AI 訂閱通道 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 設計正本：PLAN.md；派工與驗收：DISPATCH.md；各卡工作指示：briefs/。這裡只放「狀態」與「白話」。
// 狀態：未開始＝not_started；進行中＝in_progress；已併入＝done（必有 commit）。

const D = 'agency-os/handoffs/2026-11-22-subscription-ai-channel/';
export const META = {
  title: 'AI 訂閱通道 監工台',
  updated: '2026-11-22',
  plan: `${D}PLAN.md`,
  dispatch: `${D}DISPATCH.md`,
  self: D,
};

export const COPY = {
  sub: '讓寫字和畫圖都能選「走 API 付費」或「走訂閱額度」。本人按的功能由筆電執行；自動排程由主機上的常駐程式執行。每個網站各自選四種走法之一：Claude 訂閱→Codex 訂閱→API、Claude 訂閱→API、Codex 訂閱→API、只用 API。前一段不能用就自動換下一段。共 {total} 張卡。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '批次與卡', safe: '不會弄壞現有的東西', open: '到時要你做的事', risks: '風險與處置', paths: '檔案' },
  now: { h: '現況', lead: '目前真的能不能用。' },
  steps: { h: '批次與卡', lead: '同一批的卡同時進行，各自改不同的檔案；整批交回後一起看風險，再開下一批。', count: '{done}／{total} 已併入' },
  safe: { h: '不會弄壞現有的東西', lead: '現有的 API 路徑原樣保留；訂閱是多出來的選項，拿掉就回到今天的樣子。' },
  open: { h: '到時要你做的事', lead: '只有這幾步需要你。做到那一步時才問，一次問一件。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '在 {code} 之前', src: '出處' },
  risks: { h: '風險與處置', lead: '每批一張表。工人交回的每條風險都要有處置：現在處理、實測驗證，或記下不處理的理由。', empty: '這一批的工人尚未交回。', cols: '風險', act: '處置' },
  paths: { h: '檔案', plan: '完整計畫', dispatch: '派工與驗收', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已併入', risk: '風險', who: '模型', evidence: '完成的樣子', details: '細節', depends: '需先完成', none: '無', files: '檔案', card: '卡片', doneAt: '併入於', decided: '決定', group: '可同時進行：', item: '第 {n} 張' },
};

export const NOW = [
  { what: '畫圖可以走訂閱（Codex 免費生圖）。', state: 'yes', ev: '已上線；只限本人、筆電要開著。近 30 天只用過兩次。' },
  { what: 'ChatGPT 訂閱現在有額度。', state: 'no', ev: '2026-11-22 實測：本週額度用完，11-24 上午 11:02 恢復。主因是程式審查共用同一份額度。' },
  { what: 'Claude 訂閱可以用命令列寫字。', state: 'yes', ev: '2026-11-22 筆電實測成功，一次約 12 秒；執行時不給它任何工具。' },
  { what: '寫字可以選訂閱。', state: 'no', ev: '第一批進行中。目前文字全部走 API。' },
  { what: '本人按的功能可以選四種走法。', state: 'no', ev: '第二批。' },
  { what: '每個網站的排程可以各自選四種走法。', state: 'no', ev: '第三批。' },
  { what: '排程不開筆電也能走訂閱。', state: 'no', ev: '第四批；需要你在主機上登入一次 ChatGPT。' },
  { what: '知道一篇文章吃掉多少訂閱額度。', state: 'no', ev: '11-24 額度恢復後實測三篇才有數字；在那之前不估。' },
];

const K = 'briefs/K5-K9.md';
export const STEPS = [
  // 第一批
  { n: 1, code: 'K1', group: 'B1', title: '任務佇列支援寫字與兩條線', plain: '現在的佇列只會排「畫圖」。加上「寫字」，並分成兩條線：本人按的給筆電、排程的給主機。兩條線各用自己的密鑰，互相領不到對方的工作。',
    gate: '主機的密鑰領不到本人線的工作，反過來也一樣；畫圖的既有測試一行不改全過。', risk: 'Medium', model: 'Opus 5.5', status: 'in_progress', depends: [], card: 'briefs/K1-bridge.md' },
  { n: 2, code: 'K2', group: 'B1', title: '執行程式會寫字，而且不給 AI 任何工具', plain: '筆電上那支程式除了畫圖，也能叫 Codex 或 Claude 寫字。寫字時關掉 AI 的所有工具，交回前檢查內容裡有沒有混進本機的登入憑證，有就整篇丟掉。',
    gate: '筆電實跑：Claude 訂閱寫出一段字並回報用量；把檢查拿掉測試會變紅；不帶新參數時與今天的畫圖程式完全相同。', risk: 'Medium（安全）', model: 'Opus 5.5', status: 'in_progress', depends: [], card: 'briefs/K2-worker.md' },
  { n: 3, code: 'K3', group: 'B1', title: '訂閱模型進入模型清單與成本帳本', plain: '模型清單多一組「訂閱」（Codex、Claude 三種），價格是 NT$0；帳本記一筆 NT$0 和實際用掉的額度。四種走法也定義在這裡。這張卡只加資料，還不能按。',
    gate: '訂閱模型算出來的費用是 0；四種走法展開後最後一段一定是 API；現有按鈕列不變。', risk: 'Low', model: 'Sonnet 5.5', status: 'in_progress', depends: [], card: 'briefs/K3-catalog-ledger.md' },
  // 第二批
  { n: 4, code: 'K4', group: 'B2', title: '文章與劇本工坊可以走訂閱', plain: '寫文章、劇本工坊照你選的走法：先交給筆電用訂閱寫，網頁顯示「筆電寫作中」，寫完整篇出現。額度用完或筆電沒開，就自動換下一段，最後一定有 API 接手。',
    gate: '筆電實寫一篇文章並看內容；帳本一筆 NT$0；筆電離線時文章照樣由 API 產出，畫面寫明哪一段被跳過與原因；選「只用 API」時與今天逐字相同。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['K1', 'K3'], card: 'briefs/K4-sub-text-article-forge.md' },
  { n: 5, code: 'K6', group: 'B2', title: '四種走法的按鈕', plain: '文章和劇本工坊多一排四顆按鈕選走法；含 Claude 的走法可再選等級。每個訂閱段下面寫現在的狀態：在線、筆電離線（旁邊有「啟動筆電」）、額度用完到幾點。只有你本人看得到訂閱的走法。',
    gate: '其他帳號登入只看得到「只用 API」；筆電沒開時仍可選，並顯示會被跳過的原因。', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['K3'], card: K },
  // 第三批
  { n: 6, code: 'K5', group: 'B3', title: '影片腳本可以走訂閱', plain: '影片腳本用同一個入口接上訂閱。', gate: '訂閱寫出的腳本能被解析成場景；沒選訂閱時不變。', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['K4'], card: K },
  { n: 7, code: 'K7', group: 'B3', title: '每個網站各自選走法', plain: '網站設定多同一排四顆按鈕。自動排程寫那個站的文章時照它的走法；訂閱不能用就換下一段，不會停擺。主機上有登入哪一家訂閱，那一段才會真的被用到。',
    gate: '沒設定過的舊網站與今天完全相同；訂閱段不能用時文章照出，預算只記 API 實際花費。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['K4'], card: K },
  { n: 8, code: 'K8', group: 'B3', title: '成本頁看得到訂閱用了多少', plain: '成本頁顯示：訂閱畫了幾張圖、寫了幾篇、額度用到百分之幾；每個網站本月幾篇走訂閱、幾篇走 API、API 花多少。', gate: '有改走 API 的月份兩欄都有數字；讀不到資料時顯示「讀不到」，不是 0。', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['K3'], card: K },
  { n: 9, code: 'DA', group: 'B3', title: '部署並在筆電實測', plain: '前三批一起部署一次，然後用筆電的 Claude 訂閱真的寫一篇文章，看內容。', gate: '線上文章頁選訂閱模型寫出一篇；成本頁出現一筆 NT$0。', risk: 'High（部署；失敗自動還原）', model: '監工', status: 'not_started', depends: ['K4', 'K6', 'K5', 'K7', 'K8'], card: 'DISPATCH.md' },
  // 第四批
  { n: 10, code: 'K9', group: 'B4', title: '主機上的常駐執行程式', plain: '在主機開一個權限最小的帳號，只跑這支程式和 Codex。它讀不到網站、資料庫和其他金鑰。登入過期或額度用完會發 Telegram。',
    gate: '程式常駐；用那個帳號去讀主機其他地方全部被拒；後台顯示排程線在線。', risk: 'High（主機、憑證）', model: 'Opus 5.5', status: 'not_started', depends: ['DA'], card: K, before: '待決 1、待決 2、待決 3 之後' },
  { n: 11, code: 'M1', group: 'B4', title: '額度恢復後的實測', plain: '11-24 之後：Codex 畫一張圖、寫一篇字、試著騙它讀本機檔案（必須讀不到）；量三篇文章各花多久、吃多少額度。', gate: '三項實測結果寫進「現況」；一篇超過兩分半就另開卡把排程改成分兩輪。', risk: 'Low', model: '監工', status: 'not_started', depends: ['K9'], card: K },
];

const ASK = (yes, no) => [{ k: '同意', t: yes, pick: true }, { k: '先不要', t: no }];
export const OPEN = [
  { n: 1, what: '把主機執行程式專用的一把密鑰放進後台容器（主機設定變更，走失敗會自動還原的工具）。', before: 'K9', src: 'PLAN.md 第 3 節', options: ASK('排程線可以開始接工作。', '排程維持全部走 API。') },
  { n: 2, what: '你本人在主機上登入一次 ChatGPT 帳號。指令由監工備好，你照著貼上並在手機確認。', before: 'K9', src: 'PLAN.md 第 3 節', options: ASK('主機可以用你的訂閱額度寫字。', '只有筆電能用訂閱。') },
  { n: 3, what: '要不要也在主機上登入 Claude 帳號，讓排程能用 Claude 訂閱。Claude 的條款沒有明確允許無人排程，這是三段裡風險最高的一段。', before: 'K9', src: 'PLAN.md 第 2 節', options: ASK('排程的走法裡 Claude 那一段會真的被用到。', '排程選了含 Claude 的走法時，那一段自動跳過。') },
];

export const SAFE = [
  { h: '現有的 API 路徑', t: '一行不刪。沒選訂閱模型時，文章、劇本、排程的行為與今天逐字相同。' },
  { h: '現有的 Codex 生圖', t: '網址、檔名、畫圖流程都不改；舊版執行程式照樣能畫。' },
  { h: '訂閱只給你本人', t: '員工或客戶按的功能一律走 API。主機上沒有登入的那一家訂閱，排程會自動跳過那一段。' },
  { h: 'AI 讀不到本機檔案', t: '寫字時關掉 AI 的所有工具；交回的文字若含本機登入憑證，整篇丟掉。' },
  { h: '額度用完', t: '不會停擺：照你選的走法換下一段，最後由 API 接手；成本頁寫明幾篇走了 API、花多少，並發通知。' },
  { h: '退路', t: '前三批沒有資料庫異動、沒有主機改動，退回一個版本即可。第四批停掉服務即可。' },
  { h: '工人', t: '工人只在自己的工作區改檔，不推送、不部署、不連主機；這些都由監工做。' },
];

// 風險表：每批一張。rows 每列 { card, risk, act }，act 不得空。
export const RISKS = [
  { batch: '動工前（查證與實測）', rows: [
    { card: 'K9', risk: 'Claude 的條款沒有明確允許無人排程；也不允許產品代別人使用訂閱。', act: '你已決定排程可選 Claude。處置：訂閱只服務你本人；主機要不要登入 Claude 列為待決，不登入就等於關閉；每個網站可改選不含 Claude 的走法。' },
    { card: 'K2', risk: '文章的提示詞裡有從網路抓來的內容，可能夾帶指令，騙 AI 把本機檔案內容寫進文章。', act: '已寫進 K2：寫字時不給任何工具，交回前掃描憑證；M1 實際試騙一次。' },
    { card: 'K9', risk: '筆電和主機共用同一份登入檔會互相讓對方失效。', act: '已寫進設計：主機由你另外登入一次，不複製筆電的登入檔。' },
    { card: 'K7', risk: '排程一輪只有 200 秒；Codex 寫一篇長文的耗時還沒量過。', act: '實測驗證：M1 量三篇；超過兩分半才另開卡改成分兩輪，現在不先做。' },
    { card: 'M1', risk: 'ChatGPT 訂閱到 11-24 才有額度，Codex 寫字這條路在那之前無法實跑。', act: '記錄：前三批以 Claude 訂閱實測；Codex 寫字與畫圖回歸留到 M1。' },
    { card: 'K4', risk: 'Codex 沒有額度，這段期間沒有另一家模型的審查。', act: '每批由審查代理人看整批差異一次，並在工作日誌註明。' },
    { card: 'K1', risk: '檔名和網址仍叫 codex-image，但之後也載文字與 Claude。', act: '不處理：改名牽動約三十個檔、沒有行為收益，還會製造部署空窗；只更正檔頭說明。' },
  ] },
  { batch: '第一批', rows: [] },
];
