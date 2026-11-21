// 算命站 WordPress 階段 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 設計正本：briefs/ORACLE-WP-SPEC.md（產品）、briefs/SITE-FLOW-COMPLETION-PLAN.md（平台）、WP-PLAN.md（派工與驗收）。這裡只放「狀態」與「白話」。
// 狀態：未開始＝not_started；進行中＝in_progress；已併入＝done（必有 commit）。

const D = 'agency-os/handoffs/2026-11-20-oracle-skills-supervisor/';
export const META = {
  title: '算命站 WordPress 階段 監工台',
  updated: '2026-11-22',
  plan: `${D}WP-PLAN.md`,
  dispatch: `${D}briefs/ORACLE-WP-SPEC.md`,
  self: D,
};

export const COPY = {
  sub: '把 oracle.aware-wave.com 改成 WordPress 網站：算命工具嵌在可以排版的頁面裡，會員能存命盤，訂閱後每天收到運勢信；同時把「從後台開一個客戶網站」做成能一步一步按完的流程。共 {total} 張卡。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '批次與卡', safe: '不會弄壞現有的東西', open: '到時要你點頭', risks: '風險與處置', paths: '檔案' },
  now: { h: '現況', lead: '目前真的能不能用。' },
  steps: { h: '批次與卡', lead: '同一批的卡同時進行，各自改不同的檔案；整批交回後一起看風險，再開下一批。', count: '{done}／{total} 已併入' },
  safe: { h: '不會弄壞現有的東西', lead: '現有算命站從頭到尾不中斷；每個會動到正式環境的步驟都由你點頭。' },
  open: { h: '到時要你點頭', lead: '這些步驟會動到正式環境。做到那一步時才問，一次問一件。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '在 {code} 之前', src: '出處' },
  risks: { h: '風險與處置', lead: '每批一張表。工人交回的每條風險都要有處置：現在處理、實測驗證，或記下不處理的理由。', empty: '這一批的工人尚未交回。', cols: '風險', act: '處置' },
  paths: { h: '檔案', plan: '派工與驗收', dispatch: '產品規格', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已併入', risk: '風險', who: '模型', evidence: '完成的樣子', details: '細節', depends: '需先完成', none: '無', files: '檔案', card: '卡片', doneAt: '併入於', decided: '決定', group: '可同時進行：', item: '第 {n} 張' },
};

export const NOW = [
  { what: '現有算命站正常服務。', state: 'yes', ev: '線上是 2026-11-20 部署的版本；之後併入的卡都還沒部署。' },
  { what: '做法已定，本機試過可行。', state: 'yes', ev: '2026-11-22：分流、工具嵌在 WordPress 頁面、會員存檔、FluentCRM 對同一人連寄，四項試驗過了三項；內容安全政策未試。' },
  { what: '每日信的寄件網域 oracle.aware-wave.com 可以寄信。', state: 'no', ev: '2026-11-22 已在 Resend 建立並加好 DNS，驗證中。' },
  { what: '工具嵌在 WordPress 頁面裡。', state: 'no', ev: '第一批進行中。' },
  { what: '會員能存命盤、訂閱每日信。', state: 'no', ev: '第三批。' },
  { what: '從後台一步一步開一個客戶網站。', state: 'no', ev: '平台線第一批進行中。' },
];

const SPEC = 'briefs/ORACLE-WP-SPEC.md';
const SF = 'briefs/SITE-FLOW-COMPLETION-PLAN.md';
export const STEPS = [
  // 第一批
  { n: 1, code: 'E1', group: 'B1', title: '引擎嵌入版頁面', plain: '做一個只有工具本身的頁面，給 WordPress 頁面嵌進去用：沒有引擎自己的工具列，高度剛好等於內容。',
    gate: '12 個工具各有嵌入版且可用；手機寬度不會橫向捲動；原本的 12 頁不變。', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: 'd11320883', depends: [], card: 'briefs/WP-E1-embed-page.md' },
  { n: 2, code: 'E3', group: 'B1b', title: '舊工具網址轉到 WordPress 頁', plain: '站前面有 WordPress 時，舊的工具網址自動轉到對應的 WordPress 頁，網站地圖改由 WordPress 提供；沒有 WordPress 時一切照舊。',
    gate: '打開開關後舊網址會轉向；關掉開關與現在完全相同。', risk: 'Low', model: 'Opus 5.5', status: 'in_progress', depends: ['E1'], card: 'briefs/WP-E3-front-redirect.md' },
  { n: 3, code: 'E4', group: 'B1', title: '會員票與 AI 每日上限', plain: '登入的會員用 AI 解讀時，額度記在這位會員身上，每人每天有上限；沒登入的人照現在的方式限制。',
    gate: '假的或過期的票被拒；同一會員超過上限被擋；沒登入時行為不變。', risk: 'Medium（身分驗證）', model: 'Opus 5.5', status: 'in_progress', depends: [], card: 'briefs/WP-E4-member-ticket.md' },
  { n: 4, code: 'SF-B', group: 'B1', title: '網站與環境的紀錄', plain: '讓一個客戶可以有多個網站、每個網站有自己的紀錄；建立客戶時不再把既有設定整包蓋掉。資料表異動先寫好檔，不套用到正式資料庫。',
    gate: '既有客戶的設定在重新建立後原樣保留；資料表異動可套用也可退回。', risk: 'Medium（套用到正式資料庫是 High，不在本卡）', model: 'Opus 5.5', status: 'in_progress', depends: [], card: 'briefs/WP-SF-B-records.md' },
  { n: 5, code: 'SF-C', group: 'B1', title: '主機改檔工具支援「新建」', plain: '主機上改設定檔只能走一支會自動還原的工具，但它只會改已存在的檔。加上「新建檔案」的能力，新網站才有合法的建立方式。',
    gate: '新建成功；檢查失敗時檔案消失、容器停下、資料保留；原本的功能完全不變。', risk: 'High（所有主機改動共用）', model: 'Opus 5.5', status: 'in_progress', depends: [], card: 'briefs/WP-SF-C-patch-create.md' },
  { n: 6, code: 'SF-D', group: 'B1b', title: '網站範本與拆除腳本', plain: '新網站的容器與網址設定範本、主機上「有哪些網站」的登記格式，以及把一個網站完整拆掉的腳本。',
    gate: '範本能渲染出可用的設定；拆除預設只列出不動手，資料要另外確認才刪。', risk: 'High', model: 'Opus 5.5', status: 'not_started', depends: ['SF-C'], card: 'briefs/WP-SF-D-site-template.md' },
  { n: 7, code: 'SF-A', group: 'B1', title: '文件更正', plain: '把說法過時或互相矛盾的建站文件改成指向新流程。',
    gate: '文件連結檢查通過。', risk: 'Low', model: '監工', status: 'not_started', depends: [], card: SF },
  { n: 8, code: 'A1', group: 'B1', title: '架構決策文件修訂', plain: '三份架構決策補上：同網域的內嵌框可以用；客戶網站的會員屬於該網站。',
    gate: '治理文件檢查通過。', risk: 'Medium', model: '監工', status: 'not_started', depends: [], card: SPEC },
  // 第二批
  { n: 9, code: 'E2', group: 'B2', title: '引擎的內容安全政策', plain: '引擎和 WordPress 同一個網域後，引擎頁若被植入惡意程式會波及 WordPress 後台。加上瀏覽器層的限制來擋。',
    gate: '12 頁與嵌入頁都沒有被政策擋下的東西。', risk: 'Medium（安全）', model: 'Opus 5.5', status: 'not_started', depends: ['E1'], card: SPEC },
  { n: 10, code: 'P1', group: 'B2', title: '外掛修正與同網域嵌入', plain: '修掉審查找到的 7 個問題（第一次儲存設定會清空對照表等），並把嵌入方式改成同網域。',
    gate: '在乾淨的 WordPress 裝起來，第一次儲存後設定還在，頁面上的工具可用。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['E1'], card: SPEC },
  { n: 11, code: 'SF-E', group: 'B2', title: '後台對主機的固定動作', plain: '後台只能請主機做幾個固定動作（檢查網址、建站、裝 WordPress、掛網址），不能執行任意指令，所以讀不到網站的會員資料。',
    gate: '每個動作只收固定格式；格式不對或開關沒開一律拒絕。', risk: 'High', model: 'Opus 5.5', status: 'not_started', depends: ['SF-C', 'SF-D'], card: SF },
  { n: 12, code: 'SF-F', group: 'B2', title: '每日備份自動涵蓋新網站', plain: '備份腳本改成讀「有哪些網站」的登記，新網站建好當晚就被備份。',
    gate: '新網站出現在備份清單；Soulful 的備份輸出與改前逐行相同。', risk: 'High', model: 'Opus 5.5', status: 'not_started', depends: ['SF-D'], card: SF },
  { n: 13, code: 'SF-G', group: 'B2', title: '建站步驟的共用骨架', plain: '每個會動主機的步驟都走同一套：先給你看要做什麼、你確認才做、做完檢查、失敗還原、留紀錄。紀錄寫不進去就不做。',
    gate: '過期的確認被拒；開關沒開被拒；紀錄寫入失敗時不會動主機。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['SF-B'], card: SF, before: '套用資料表（待決 1）之後才併入' },
  // 第三批
  { n: 14, code: 'P2', group: 'B3', title: '會員命盤與「我存的對象」', plain: '會員能存自己的命盤，也能存別人的出生資料做私人合盤；只有自己看得到，資料加密保存，可匯出、可刪除。',
    gate: '別的會員讀不到；資料庫備份裡查不到明文生日；刪除帳號後資料清空。', risk: 'High（個資）', model: 'Opus 5.5', status: 'not_started', depends: ['P1'], card: SPEC },
  { n: 15, code: 'P3', group: 'B3', title: '每日運勢信', plain: '訂閱並確認後，每天在訂閱者當地早上 7 點寄運勢信；同一天不重寄；退訂、退信、投訴的人不再寄。',
    gate: '四個時區都在當地 7 點後寄一次；算不出內容就不寄；退信的人被停寄。', risk: 'High（寄信、個資）', model: 'Opus 5.5', status: 'not_started', depends: ['P1', 'E4'], card: SPEC },
  { n: 16, code: 'SF-H', group: 'B3', title: '建站的主機步驟', plain: '網址檢查、建立網站主機、安裝 WordPress 與外掛、掛上網址、正式開放，五個步驟接上骨架。',
    gate: '在測試站實際跑過；管理員密碼不出現在任何紀錄裡。', risk: 'High', model: 'Opus 5.5', status: 'not_started', depends: ['SF-E', 'SF-G'], card: SF },
  { n: 17, code: 'SF-I0', group: 'B3', title: 'MainWP 連線金鑰', plain: '讓後台能把新網站加進 MainWP（一次性的主機設定）。',
    gate: '後台容器讀得到這三個設定值。', risk: 'High', model: '監工', status: 'not_started', depends: [], card: SF, before: '待決 2' },
  { n: 18, code: 'SF-I', group: 'B3', title: '接上 MainWP 與 AI 控制通道', plain: '新網站自動加進 MainWP、建立與後台之間的簽章通道，並登記這個網站屬於哪個客戶。',
    gate: '測試站出現在 MainWP 且連線正常；通道簽章請求成功；私鑰不出現在任何紀錄。', risk: 'High（憑證）', model: 'Opus 5.5', status: 'not_started', depends: ['SF-G', 'SF-I0'], card: SF },
  { n: 19, code: 'SF-J', group: 'B3', title: '建站流程頁面', plain: '「新增客戶網站」與「建站流程」兩個頁面：一欄由上到下九步，每步顯示狀態，會動主機的步驟都要按兩下。',
    gate: '九步都顯示；開關沒開時按鈕顯示「尚未開放」；密碼只顯示一次。', risk: 'Medium', model: 'Sonnet 5.5', status: 'not_started', depends: ['SF-G'], card: SF },
  // 第四批
  { n: 20, code: 'P4', group: 'B4', title: '外掛發佈管道', plain: '讓這支外掛能像其他自有外掛一樣打包、發佈、安裝到網站。',
    gate: '發佈與安裝腳本預演正確。', risk: 'Medium', model: 'Sonnet 5.5', status: 'not_started', depends: ['P1'], card: SPEC },
  { n: 21, code: 'SF-K', group: 'B4', title: '清掉假的狀態顯示', plain: '後台幾處寫死的「已完成」打勾與過時說明，改成顯示真實狀態。',
    gate: '清單上每一處都改掉。', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['SF-J'], card: SF },
  { n: 22, code: 'SF-P', group: 'B4', title: '舊的建站頁退場', plain: '舊的兩個建站頁刪除並轉到新流程；它們還有用的兩塊設定搬到客戶頁。',
    gate: '既有客戶的設定在新位置看得到；全站沒有連到舊頁的連結。', risk: 'Medium', model: 'Sonnet 5.5', status: 'not_started', depends: ['SF-J'], card: SF },
  { n: 23, code: 'SF-L', group: 'B4', title: '用測試網域完整跑一次', plain: '後台部署後，用一個拋棄式網域從頭到尾建一個站，當晚確認有被備份，再整個拆掉，確認沒留下任何東西。',
    gate: '每一步都有成功紀錄；拆掉後容器、設定、登記都不存在。', risk: 'High', model: '監工', status: 'not_started', depends: ['SF-F', 'SF-H', 'SF-I', 'SF-J'], card: SF, before: '待決 3' },
  // 第五批
  { n: 24, code: 'SF-O', group: 'B5', title: '操作手冊', plain: '寫一份照著做就能開站的手冊，並登記一條你自己能跑的示範。',
    gate: '只讀手冊就能完成測試網域的流程。', risk: 'Low', model: '監工', status: 'not_started', depends: ['SF-L'], card: SF },
  { n: 25, code: 'GO-1', group: 'B5', title: '上線一：部署引擎', plain: '把引擎的新版本（含嵌入版頁面）部署上去。這一步之後訪客看到的網站沒有任何變化。',
    gate: '原有網址逐頁與部署前相同；嵌入版頁面打得開。', risk: 'High', model: '監工', status: 'not_started', depends: ['E1', 'E3', 'E4', 'E2'], card: SPEC, before: '待決 4' },
  { n: 26, code: 'GO-2', group: 'B5', title: '上線二：接上 WordPress（建置中）', plain: '建好 oracle 的 WordPress，讓它接手引擎沒用到的網址，並設成建置中。訪客原本的網址都不變；你登入後開始建頁面、設定外掛與寄信。',
    gate: '原有網址不變；你能登入 WordPress 後台。', risk: 'High', model: '監工', status: 'not_started', depends: ['GO-1', 'SF-L', 'P1', 'P4'], card: SPEC, before: '待決 5' },
  { n: 27, code: 'GO-3', group: 'B5', title: '上線三：正式開放', plain: '你確認頁面與每日信都沒問題後，首頁換成 WordPress，舊工具網址轉到新頁面，關掉建置中。',
    gate: '首頁是 WordPress；頁面裡的工具可用；訂閱測試信收得到。', risk: 'High', model: '監工', status: 'not_started', depends: ['GO-2', 'P2', 'P3'], card: SPEC, before: '待決 6' },
];

const ASK = (yes, no) => [{ k: '同意', t: yes, pick: true }, { k: '先不要', t: no }];
export const OPEN = [
  { n: 1, what: '把「網站與環境的紀錄」的資料表異動套用到正式資料庫（只新增索引與幾列預設關閉的開關，不改既有資料）。', before: 'SF-G', src: 'WP-PLAN.md 第 6 節', options: ASK('監工套用並驗證後才推上主線。', '平台線停在第一批。') },
  { n: 2, what: '把 MainWP 的連線金鑰放進後台容器（主機設定變更，走會自動還原的工具）。', before: 'SF-I0', src: 'SITE-FLOW 第 4 節第 3 題', options: ASK('之後新網站能自動加進 MainWP。', '這一步改成你手動在 MainWP 加站。') },
  { n: 3, what: '打開主機與後台的建站開關，建一筆測試網域的 DNS，跑一次完整的拋棄式建站再拆掉。', before: 'SF-L', src: 'WP-PLAN.md 第 6 節', options: ASK('跑完確認沒留下東西再關回開關。', '流程只在本機驗證。') },
  { n: 4, what: '部署引擎新版本（含目前所有尚未部署的引擎改動）。', before: 'GO-1', src: 'ORACLE-WP-SPEC.md 上線', options: ASK('失敗會自動還原到現在的版本。', '引擎維持 2026-11-20 的版本。') },
  { n: 5, what: '改 oracle 網域的分流設定，讓 WordPress 接手引擎沒用到的網址（建置中）。', before: 'GO-2', src: 'ORACLE-WP-SPEC.md 上線', options: ASK('訪客原本的網址不變；失敗自動還原。', 'WordPress 只能在主機內部看。') },
  { n: 6, what: '首頁換成 WordPress 並正式開放。', before: 'GO-3', src: 'ORACLE-WP-SPEC.md 上線', options: ASK('可以一步退回建置中的狀態。', '維持建置中。') },
];

export const SAFE = [
  { h: '現有算命站', t: 'WordPress 先只接手引擎沒用到的網址，而且是建置中；首頁最後才換。中間任何一步都可以退回上一步。' },
  { h: '引擎', t: '不改名、不換網域；沒有設定 WordPress 的開關時，行為與現在逐頁相同。' },
  { h: '主機', t: '後台只能請主機做固定的幾個動作；改檔一律走失敗會自動還原的工具；刪資料要另外確認。' },
  { h: '開關', t: '新的主機動作有兩道開關，預設都關；紀錄寫不進去就不執行。' },
  { h: '個資', t: '引擎不存任何個人資料；出生資料只存在該網站的 WordPress，並且加密。' },
  { h: '工人', t: '工人只在自己的工作區改檔，不推送、不部署、不連主機、不套用資料表；這些都由監工在你點頭後做。' },
];

// 風險表：每批一張。rows 每列 { card, risk, act }，act 不得空。
export const RISKS = [
  { batch: '動工前（計畫審查與試驗）', rows: [
    { card: 'E1', risk: '工具放進內嵌框後，量整頁高度會只增不減（試驗量到 4157，實際內容 902）；引擎的工具列也會出現在框裡。', act: '已寫進 E1：嵌入版不撐滿視窗、不放工具列，高度量工具本身。' },
    { card: 'E2', risk: '引擎與 WordPress 同網域後，引擎頁的漏洞可波及 WordPress 後台。', act: '由 E2 的內容安全政策擋；GO-2 之前必須完成。' },
    { card: 'P1', risk: '外掛有 1 個主要問題、6 個小問題未修（第一次儲存清空對照表等）。', act: '列為 P1 的必修內容；外掛尚未安裝在任何網站。' },
    { card: 'P3', risk: 'Resend 不在 FluentCRM 內建的退信處理名單內。', act: '已寫進 P3：外掛接 Resend 的退信與投訴通知，把該聯絡人標記為停寄。' },
    { card: 'SF-E', risk: '後台若能對正式站執行任意指令，等於能讀所有網站的會員資料。', act: '已改設計：只有固定動作，不收指令內容。' },
    { card: 'SF-G', risk: '既有的紀錄工具在開關不存在時會自動補成「開」，寫入失敗時仍照做。', act: '已改設計：建站動作不走那條路；沒有開關或寫不進紀錄就不執行。' },
    { card: 'GO-1', risk: '引擎拿到的訪客位址可能是主機自己的位址，限流會把所有人算成同一個來源。', act: '部署前在主機實測確認，不對就先修分流設定。' },
    { card: 'GO-2', risk: 'Kadence 佈景、真手機、英文頁網址代稱、正式主機兩層分流都還沒試。', act: '在建置中階段逐項實測，有問題不進 GO-3。' },
  ] },
  { batch: '第一批', rows: [] },
];
