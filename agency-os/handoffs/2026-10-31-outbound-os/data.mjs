// 外聯系統 v2 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：R0-PLAN.md §6（每張卡怎麼做）與規格 Outbound_OS_Engineering_Spec.md（規則、契約）。這裡只放「狀態」與「白話」，不重述做法。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '外聯系統 v2 監工台',
  updated: '2026-11-02',
  plan: 'agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md',
  req: 'agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-31',
  self: 'agency-os/handoffs/2026-10-31-outbound-os/',
  url: 'https://claude.ai/artifact/DbH1HLUihZwAiBiJZGSD4t',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '冷信系統從「幫你把信寫出來」升級成「替你找到客戶」：AI 自己查對方並留下證據、信有主旨與署名、每封有兩個版本與追蹤信、多個次網域信箱輪流自動寄到一天 300 封、管線照政策自動前進而你只處理佇列與回信、回信自動進系統並停止後續、名單來自店家、公司登記與公開簡介、看得到回覆與成交。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事（2026-11-02 查）。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。同一組的卡修改不同檔案，可以同時進行。High 風險步驟經你同意才執行。信箱池那張卡的採購（買網域、開信箱）從第 0 天就開始，不等前面的卡。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '規則與契約', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '決定', group: '可同時進行：' },
};

// 現在真的能不能用（2026-11-01 查）
export const NOW = [
  { what: '匯入名單、打分數、產冷信、人工審核、在 Gmail 建草稿。', state: 'yes', ev: '2026-10-14 在正式站建了 1 封繁中草稿，沒有寄出（WORKLOG 2026-10-14 續28）。' },
  { what: 'AI 自己去看對方的網站並留下有來源的證據。', state: 'yes', ev: '2026-11-01 C3：名單頁「研究這家」讀對方自家網站最多 15 頁，每條事實附來源網址與逐字原文；數字、星期、否定跟原文一致才自動核准，其餘待你看。正式庫對 soulfulexpression.org 實測 5 條。' },
  { what: '信有主旨、有署名、用到品牌定位。', state: 'yes', ev: '2026-11-01 C2：每封有主旨（≤25 字），以寄件信箱的署名結尾（程式附加，AI 不能改），定位、賣點、語氣進 prompt（brand-context.ts）。正式庫真產驗過。' },
  { what: '每封信有兩個版本可比、追蹤信有內容。', state: 'yes', ev: '2026-11-01 C2：一次產 A／B 兩版首封＋追蹤信（各有等幾天），審核頁並排；人核准一版另一版自動跳過。追蹤信「到期自動建草稿」在 C5。' },
  { what: '一天寄得到 300 封而不傷主網域。', state: 'no', ev: '程式已備妥（2026-11-02 C11、C8）：信箱池、每日 DNS 檢查、暖機升階、輪流寄、自動寄、寄前付費驗證都上線。還差你買次網域、開信箱並連上（C11.1）；沒有 Hunter／ZeroBounce 金鑰前一律不自動寄。目前只有 1 個消費者 Gmail 信箱（草稿模式），Google 授權也待重連（C1.6）。' },
  { what: '研究、產信、建草稿不用你一筆一筆按。', state: 'no', ev: '三個動作都是按鈕觸發（ReviewClient.tsx:19-20）；300 封一天等於 600 次點擊。' },
  { what: '對方回信會進系統，後續信自動停。', state: 'no', ev: 'Replies 頁是空殼；草稿只存 draft id，沒存對話串 id（gmail-draft/route.ts:186）。' },
  { what: '輸入「找什麼＋地區」就自動找到一批店家放進名單。', state: 'yes', ev: '2026-11-01 C10：Inbox 頁「找名單」用 Serper 查地圖，一次最多 20 家（網站或社群頁、電話、地圖來源），沒網站也沒電話的不放；已在名單或收件匣裡的標成重複，同一家核准兩次只有一筆。每次最多約 NT$0.1。正式庫實測「瑜珈教室／台中市」兩次：第一次 20 家，第二次 17 家標重複。' },
  { what: '能從公司登記、徵才頁、公開簡介找到公司和人的 email。', state: 'no', ev: '店家搜尋已有（C10），但多數店家沒 email，要再按「研究這家」從網站找。公司登記（C12）、人員搜尋與 email 推斷（C13）都還沒做。' },
  { what: '用 IG／FB 當網站的店也研究得到。', state: 'yes', ev: '2026-11-01 C17：研究會讀店家的 IG／FB 頁（Meta 官方 API → Google 摘要 → Apify），自介的事實可自動核准，貼文的等你看。正式庫實測 Coffee Here 的 IG 拿到 9 條證據；Apify 讀 Soulful 的 FB 粉專自動填入 info@soulfulexpression.org。' },
  { what: '找到店家後拿得到它的 email，寄之前知道對方網域收不收信。', state: 'yes', ev: '2026-11-01 C3：研究時從對方網站自動填 email（對方網域、mailto 或網站結構化資料裡的商家信箱），先查網域收不收信才填；別家的地址只列成候選給你看。實測自動填入 info@soulfulexpression.org。' },
  { what: '暖名單同步到 FluentCRM。', state: 'no', ev: 'wp-bridge 沒有 contact 端點（RestController.php:42-105），只能建電子報草稿。' },
  { what: '看得到回覆率、會議數、成交數。', state: 'yes', ev: '2026-11-02 C7：外聯首頁一張表，依服務、版本、切角列寄出、退信、回覆、正向、會議、成交、失去與回覆率，可下載 CSV；沒有開信率。切角要等 C16 產信時填入才分得開。' },
  { what: 'Gmail 連線不會自己斷。', state: 'no', ev: '已經斷了：2026-11-01 對 Google 續期，回「已過期或被撤銷」（invalid_grant）。Google 專案仍在測試模式，授權每 7 天失效。你在 Google Cloud Console 按「發布應用程式」並在 Connectors 頁重連後才會恢復（C1.6）。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const C1 = '306277bf2';
const C2 = '766df3df3';
const C3 = '25858b8b8';
const C10 = '6397234f7';
const C17 = '5bdba0ef6';
const C17_6 = '77d0291d6';
const C17_7 = 'e824205b0';
const C11 = '3eea12c73';
const C4 = 'f00dbea9f';
const C8 = '050a1041e';
const C5 = 'd518cbb2c';
const C15 = '96ecf614d';
const C12 = '6c9f2a8c8';
const C13 = '1c47a2904';
const C6 = 'f57fd3512';
const C14 = '27a93dbcc';
const C16 = 'b0f5e4872';
const C6REL = '8e7b353ea';

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '守衛與事實訂正', plain: '例：名單上某人剛退訂，系統仍替他建草稿。改成建草稿前重查拒收名單。同時把「scope 不能寄信」這句不對的說法改正，用測試守住程式不呼叫寄信；順便把 Google 授權改成正式發布、加上讀信權限，之後 6 個新信箱只要授權一次。',
    gate: '退訂後建草稿被擋下並說明原因。信的標頭有退訂方式。測試證明程式沒有任何寄信呼叫。Gmail 連線是否仍活著有查證結果。匯入一筆網域不存在的 email，會被標成無效。Google 專案已發布，既有信箱用新權限重新連上。', risk: 'Low（C1.4 只讀正式站；C1.6 你按一次發布）', model: 'Codex', status: 'in_progress', depends: [],
    decided: 'Google 專案改成「已發布、未驗證」，連線不再每 7 天斷；讀信權限一起加，這樣之後每個池信箱只授權一次。你做兩步：在 Google Cloud Console 按一次「發布應用程式」，再到 Connectors 頁重新連既有的 Gmail。（規格 D13）',
    what: 'MODULE_MANIFEST 與 google-oauth 註解改寫；never-sends 測試；gmail-draft 重查 do_not_contact／suppression／email invalid；List-Unsubscribe header；prod connector refresh VBC；verify-email.ts MX 查核（有 MX＝unknown，不是 valid）＋co_verified_emails 快取＋匯入評分；GMAIL_SCOPE 加 readonly＋發布',
    files: ['NA/lib/outreach/MODULE_MANIFEST.json', 'NA/lib/outreach/google-oauth.ts', 'NA/app/api/outreach/messages/gmail-draft/route.ts', 'NA/lib/outreach/__tests__/never-sends.test.ts', 'NA/lib/outreach/verify-email.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      done('C1.1', '把「scope 不能寄信」改成正確說法，加一個測試確認程式沒有寄信呼叫。', C1),
      done('C1.2', '建草稿前重查拒收名單與不可聯絡標記，有就擋下。', C1),
      done('C1.3', '信的標頭加上退訂方式。', C1),
      done('C1.4', '查正式站的 Gmail 連線是否仍能續期，結果寫進紀錄與本頁現況。', C1),
      done('C1.5', '匯入名單時查對方網域有沒有收信伺服器，結果存起來；沒有的信箱不給建草稿。這只證明網域收信，不證明信箱存在。免費，不用外部服務。', C1),
      todo('C1.6', 'Gmail 授權多要「讀信」權限並把 Google 專案發布；你按一次發布、重新連既有信箱。已重連（11-02 03:25 UTC，含讀信權限，之後每 10 分鐘同步都成功）；剩：確認 Google 專案已發布（未發布的話 7 天後又會斷）。'),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '署名、定位、主旨、多版本、追蹤信內容', plain: '例：AI 一次寫出兩個主旨、兩個版本的第一封信、兩封追蹤信，每封都以你設定的署名結尾，用到品牌定位。來源不是對方自己公開的人，信尾多一行個資告知。你在審核頁並排看 A／B，核准一版；一個服務累積核准 50 封後，可以切成抽查模式。',
    gate: '對一個測試名單真產一次，資料庫出現 4 列：兩封第一封（各有主旨）、兩封追蹤信（各有等幾天）。內文以署名結尾；需要告知的名單信尾有告知行，沒有就被擋。審核頁可並排核准；抽查模式只在該服務核准滿 50 封後能開。', risk: 'Medium（migration 套正式站 High）', model: 'Opus 5.5', status: 'done', commit: C2, depends: ['C1'],
    result: '2026-11-01 正式庫真產 4 列（A／B 有主旨、追蹤 3／5 天、全過檢查、署名結尾、首封含告知行）；核准 A 後 B 自動跳過，再核准 B 被拒（409）。migration 0149 已套正式站。審核方式改成手動／半自動／全自動三顆按鈕（＝逐封、抽查 10%、抽查 2%）。Claude critic 三輪＋Codex 三輪共 17 項全修。',
    decided: 'AwareWave 的冷信從自有的次網域信箱池寄出；主網域 aware-wave.com 永遠不寄冷信，也不要在 Gmail 設「以 @aware-wave.com 寄出」，網域設定會把那種信當假冒隔離。代操客戶有 Google 信箱就連它；沒有（Soulful 在 Hostinger）就用池裡掛給它的信箱。已連線的 awarewaveai@gmail.com 只在暖機期間試寫。署名預設是寄件人名稱加品牌名稱，網站那行你填一次。人工把關改成政策：每個服務先逐封核准 50 封，之後只抽查 10%，檢查有警告的一律人工，被擋的永遠不寄。（規格 D12、D23）',
    what: 'migration 0149 expand（署名、追蹤天數、檢查結果、privacy_url、review_mode、review_sample_pct）；brand-context.ts（含個資告知行）；generation-schema.ts（手寫守衛，無 zod）；messages/route.ts 寫 2＋N 列＋依政策核准；Connectors 署名欄；Review A/B；profile 設定頁；刪 drafts stub',
    files: ['DB/migrations/0149_outbound_v2_expand.sql', 'NA/lib/outreach/brand-context.ts', 'NA/lib/outreach/generation-schema.ts', 'NA/app/api/outreach/messages/route.ts', 'NA/app/(shell)/tools/outreach/review/ReviewClient.tsx'],
    items: [
      done('C2.1', '資料表加欄位：寄件帳號的署名、追蹤信等幾天、品質檢查結果、服務的隱私頁網址與審核模式；同一品牌同一 email 只能有一筆名單；同一名單同時只能有一版首封在寄送路上。', C2),
      done('C2.2', '品牌脈絡組裝：定位、賣點、語氣、署名、已核准的證據、必要時的個資告知行，依固定順序組成給 AI 的指示。', C2),
      done('C2.3', 'AI 的輸出改成固定格式的 JSON，格式不對會修一次再放棄。', C2),
      done('C2.4', '產信改寫：一次寫兩個主旨、兩個版本、追蹤信，每封各自檢查，存成多列；抽查模式下每個名單只選一版、再用便宜模型核對信裡的主張都有證據，才自動核准。', C2),
      done('C2.5', '畫面：寄件帳號設定加署名欄；審核頁 A／B 並排；服務設定加隱私頁網址與審核模式；拿掉空的草稿頁。', C2),
      done('C2.6', '測試與真產一次。', C2),
    ] },
  { n: 3, code: 'C3', group: 'C', title: '研究 → 證據', plain: '例：你按「研究這家」，系統去看小森咖啡自己的網站，抓出「菜單照片光線偏暗」這類觀察，每條附來源網址、原文片段與時間。來自店家自己網站的證據自動核准；來自別人網站的才要你看。不會去爬它的 IG。',
    gate: '對一個真實公開網站跑研究，出現至少一條證據，原文片段能在該頁找到，自家網站的那條已自動核准；網站上有 email 就自動填進名單。沒有證據的名單不能產信；暖名單永遠不能產冷信。費用在按鈕上看得到。', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: C3, depends: ['C2'],
    result: '2026-11-01 正式庫對 soulfulexpression.org 真研究：5 條證據全自動核准、每條原文另抓網頁都在頁上；自動填入 info@soulfulexpression.org；只靠證據產信成功。只讀對方自家網站（平台網址不研究、跳轉外站在請求前拒絕）；事實的數字、星期、否定要跟原文一致才自動核准；email 只取對方網域或對方公開的免費信箱。migration 0150 已套正式站。Claude critic 四輪＋Codex 三輪全修。',
    what: 'migration 0150 co_evidence；collect sink outreach-research（excerpt 子字串驗＋自家網站自動 approved＋純程式抓 email）；research.ts＋route（crawl 只用 website，接受批次）；products.ts 加 outreach.research；Leads 頁按鈕與第三方證據審核；cold-gate 改讀 evidence 並硬拒 warm',
    files: ['DB/migrations/0150_co_evidence.sql', 'NA/lib/collect/sinks/outreach-research.ts', 'NA/lib/outreach/research.ts', 'NA/app/api/outreach/leads/research/route.ts', 'NA/lib/outreach/cold-gate.ts', 'NA/lib/portal/products.ts'],
    items: [
      done('C3.1', '新資料表：證據（主張、來源、原文片段、時間、狀態）。', C3),
      done('C3.2', '蒐集器加一個出口：把抓到的網頁交給便宜模型抽主張，原文片段對不上就丟掉；來自店家自己網站的自動核准。', C3),
      done('C3.3', '「研究這家」的後端：只用名單上的網站起一次小範圍蒐集，不碰社群頁面；支援一次多筆。', C3),
      done('C3.4', '把「客戶研究」登記成收費功能。', C3),
      done('C3.5', '畫面：研究按鈕（顯示費用）、第三方證據核准／駁回；沒有核准證據就不產信；暖名單永不產冷信。', C3),
      done('C3.6', '測試與對真實網站跑一次。', C3),
      done('C3.7', '研究時順手從店家網站抓 email，填進名單並查核，不用 AI。', C3),
    ] },
  { n: 4, code: 'C10', group: 'C', title: '名單來源：店家', plain: '例：你輸入「台中 咖啡廳」，系統用現有的 Serper 帳號查地圖，找出 20 家，連網站與電話一起放進待處理名單；同一地區查第二次，已經在名單裡的會被標成重複。',
    gate: '一次真查回 20 筆進待處理名單，每筆有名稱、網站或電話、來源網址。費用在畫面上。同一查詢跑兩次不會建出兩份名單。沒有 email 的，核准後由研究那步補。', risk: 'Low', model: 'Codex', status: 'done', commit: C10, depends: [],
    decided: '用已經在付費使用的 Serper 查地圖。不用 Google Places API：它的條款不准把查到的店名、網站、電話存進自己的資料庫，而名單庫就是要存這些；資料也比較貴、要開帳單帳戶。它多出來的營業時間與評論，由研究那一步從店家網站取得。（規格 D18）',
    what: 'serper allowedPaths 加 /places；discover.ts 經 createProviderCall（預算＋限速）→ co_lead_inbox → normalize／suppression；dedup 改跨既有 inbox＋leads；核准改 upsert；Inbox 頁找名單表單',
    files: ['NA/lib/collect/net/providers.ts', 'NA/lib/outreach/discover.ts', 'NA/lib/outreach/connectors/router.ts', 'NA/app/api/outreach/inbox/route.ts', 'NA/app/api/outreach/leads/route.ts'],
    items: [
      done('C10.1', '用 Serper 查地圖，結果接進名單匯入；去重複改成跟既有名單比，核准時不重建。', C10),
      done('C10.2', 'Inbox 頁加找名單表單；測試與真查一次。', C10),
    ] },
  { n: 5, code: 'C17', group: 'C', title: '名單研究：讀店家的 IG／FB 頁', plain: '例：C10 找到的店家有一半拿 IG 或 FB 當網站。按「研究這家」，系統先用 Meta 官方 API 讀它的 IG 商業帳號自介與最近貼文；查不到就搜 Google 的摘要找 email；再不行才用 Apify 讀公開頁。自介裡的事實可以自動核准，貼文是當天公告，一律等你看。',
    gate: '一家用 IG 當網站的真實店家，研究後有證據、來源是它的 IG；自介的事實自動核准、貼文的待審。沒有 Apify 金鑰時那一層顯示跳過而不是失敗。系統自己的 Meta app、IG 帳號、主機都不去抓別人的頁面。', risk: 'Medium（法律灰色：只讀公開頁）', model: 'Opus 5.5', status: 'done', commit: C17, depends: ['C3'],
    decided: '照便宜到貴三層：Meta 官方 Business Discovery（免費、只限商業帳號）→ Google 搜尋摘要 → Apify 公開頁（按量付費、不登入）。不用會登入你帳號的工具（PhantomBuster），會被停權。Apify 先裝，等你說可以再真跑。（規格 D20，操作者 2026-11-01）',
    what: 'providers.ts 加 allowedPathPatterns＋meta_discovery／apify_instagram／apify_facebook；social-research.ts 階梯；research.ts 無自家網站或無 email 時跑；sink admit＋reviewOnly；名單頁按鈕與層級顯示',
    files: ['NA/lib/collect/net/providers.ts', 'NA/lib/outreach/social-research.ts', 'NA/lib/outreach/research.ts', 'NA/lib/collect/sinks/outreach-research.ts', 'NA/app/(shell)/tools/outreach/leads/LeadsClient.tsx', 'NA/app/(shell)/tools/outreach/leads/LeadResearch.tsx'],
    items: [
      done('C17.1', '規格改寫：店家的 IG／FB 公開頁可以讀，照三層由便宜到貴，不經過系統自己的 Meta app、帳號、主機；貼文的事實一律等你看。', C17),
      done('C17.2', '登記三個資料供應商：Meta 官方 API、Apify 的 IG 與 FB 讀取器，各自鎖住只能呼叫的路徑。', C17),
      done('C17.3', '社群研究的階梯：找到就停、沒金鑰就跳過、付費那層先預扣點數；自介裡的 email 算對方自己公開的。', C17),
      done('C17.4', '研究流程接上：沒有自家網站、或網站找不到 email 時讀社群頁；自介事實照原規則，貼文待審、只讀半年內。', C17),
      done('C17.5', '名單頁：只有 IG／FB 頁的名單也能按研究；顯示用了哪一層、花多少。', C17),
      done('C17.6', '測試與真查；Apify 那層等你說可以再真跑一次。', C17_6),
      done('C17.7', '社群頁上連到對方自己的官網時，填進名單的網站欄，同一次研究接著讀官網。', C17_7),
    ] },
  { n: 6, code: 'C11', group: 'C', title: '寄件信箱池：次網域、DNS、暖機', plain: '例：你買 3 個像品牌的次網域，每個開 2 個 Workspace 信箱，共 6 個，連上時確認它們屬於寄件池：系統自動寄、每天上限 50。系統每天檢查每個網域的 SPF、DKIM、DMARC，缺一就標黃並通知；新信箱照暖機階慢慢加量，要真的寄滿才升階，退信太多就自動暫停。',
    gate: '6 個信箱都連上系統並標為寄件池，每個網域三項 DNS 設定全綠。故意拿掉一項設定，隔天那個信箱標黃並收到通知，連兩天就暫停。一個信箱連續 5 天寄滿七成才升到下一階；退信率超過 3% 自動暫停，按「重新檢查並恢復」要兩項都過才恢復。兩個同網域信箱同時搶最後一個名額只有一個成功。', risk: 'High（C11.1 外部資產；migration 套正式站）', model: '你＋Codex', status: 'in_progress', depends: ['C1'],
    decided: '量從信箱數來：3 個次網域 × 2 信箱 × 每信箱 50 封 ＝ 300 封。主網域 aware-wave.com 永遠不寄冷信。不用暖機服務，靠真實低量慢慢加；升階看實際寄出，不看日曆。池信箱連上時就設成自動寄，安全靠每階上限、寄前重查、退信自動暫停。採購第 0 天就開始，暖機要 4 到 5 週。（規格 D12、D17、D21）',
    what: '操作者：買網域、Workspace 次網域＋使用者、SPF／DKIM／DMARC；migration 0152 sender_pool（池欄位、co_send_claims、co_begin_send／co_convert_to_warm 兩個鎖 lead 的交易函式、callback 池參數）；C1.6＋C11.2 後每信箱連 Gmail 並確認為池（auto、50、w1）；sender-health.ts 每日 DNS＋退信率＋升階＋恢復按鈕；internal route＋cron 每日＋host-jobs',
    files: ['DB/migrations/0152_sender_pool.sql', 'NA/app/api/outreach/connectors/gmail/oauth/callback/route.ts', 'NA/lib/outreach/sender-health.ts', 'NA/app/api/internal/outreach/sender-health/route.ts', 'HS/cron.d/awarewave-schedules', 'NA/lib/schedules/host-jobs.ts'],
    items: [
      todo('C11.1', '你動手（第 0 天開始採購）：買 3 個次網域，在 Workspace 加成次網域、每個開 2 個使用者，設好三項 DNS；等 C1.6 和 C11.2 都上線後，到 Connectors 頁把每個信箱連上並確認為寄件池。'),
      done('C11.2', '資料表：寄件帳號加池欄位；新增「寄送名額」表與兩個資料庫函式——開始寄送（鎖住名單、一次佔下信箱、寄件網域、收件網域三種名額、把信標成寄送中）與轉為暖名單（鎖住名單、取消待寄冷信），兩者互斥；連線時可直接標為池信箱。', C11),
      done('C11.3', '每天檢查每個冷信信箱：三項 DNS 缺項標黃並通知、連兩天缺就暫停；7 日退信率達 3% 就暫停；連續 5 天寄滿七成就升一階；畫面有「重新檢查並恢復」。登記到排程頁。', C11),
      todo('C11.4', '測試 DNS 四種情況、退信率門檻、升階、恢復、名額函式的併發（已完成，3eea12c73）；剩：網域買好後對一個真實次網域跑一次，看三燈正確。'),
    ] },
  { n: 7, code: 'C4', group: 'D', title: '回覆同步與 Replies 頁', plain: '例：你在 Gmail 按下寄出，10 分鐘內系統逐封確認寄了；對方回信，系統抓回內文分類成「問價」，名單狀態變「已回覆」，追蹤信自動停。退訂與退信也自動處理。同步停了幾天再恢復，可以補掃。',
    gate: '你寄 1 封給自己另一個信箱並回覆，10 分鐘內 Replies 頁出現該列含內文、名單狀態變已回覆、追蹤日期清空。第一封已寄而追蹤草稿未寄時，追蹤信不會被誤標為已寄。同一封回信重掃不會重複建事件或拒收。退信與退訂會進拒收名單。', risk: 'Medium（主機排程安裝 High）', model: 'Opus 5.5', status: 'done', commit: C4, depends: ['C2'],
    what: 'migration 0153 co_replies（0151 已被 Mockup 用掉）；存 threadId／messageId／draftId；gmail-sync.ts（逐封 message id 判已寄；收件匣以游標掃、先插入 co_replies 再做副作用、取 full 內文）；分類＋停追蹤＋拒收；internal route＋cron */10＋host-jobs；補掃按鈕；Replies 頁按鈕',
    files: ['DB/migrations/0153_co_replies.sql', 'NA/lib/outreach/gmail-api.ts', 'NA/app/api/outreach/replies/route.ts', 'NA/lib/outreach/google-oauth.ts', 'NA/lib/outreach/gmail-sync.ts', 'NA/app/api/internal/outreach/gmail-sync/route.ts', 'HS/cron.d/awarewave-schedules', 'NA/app/(shell)/tools/outreach/replies/page.tsx'],
    items: [
      done('C4.1', '新資料表：回信；四個資料庫函式各自一次做完：標已寄、標沒寄、套用回信、記一次失敗。收到回信當下就停追蹤信。', C4),
      done('C4.2', '建草稿時記下對話串、訊息與草稿三個 id。', C4),
      done('C4.3', '每 10 分鐘檢查一次：逐封用訊息 id 確認你寄了沒；收件匣用 Gmail 的歷史游標接續、翻完所有分頁，用寄件人地址認出回信、退訂信與退信，連內文一起抓；同一封只處理一次，處理失敗會重試，重試 5 次仍失敗會通知你並在 Replies 頁標紅。信很多時掃描會分好幾輪接著做；休假自動回覆不算回信。', C4),
      done('C4.4', '回信交給便宜模型分類；有回信就停追蹤；回過信的人記為可以同步 FluentCRM；退訂、拒絕與退信進拒收名單。', C4),
      done('C4.5', '主機排程每 10 分鐘叫一次；登記到排程頁；每個信箱有「補掃 N 天」按鈕和上次同步時間。（主機裝排程等你同意，High）', C4),
      done('C4.6', 'Replies 頁：列出回信與內文摘要，給你按鈕決定下一步（報價、問窗口、拒收、會議、成交、失去）。', C4),
      done('C4.7', '真測 11-02：寄給你另一個信箱並回信，07:20 那一輪同步就收進回覆頁（分類「想多了解」），名單變已回覆，追蹤信全停。', C4),
    ] },
  { n: 8, code: 'C8', group: 'F', title: '自動寄與輪流寄（量產）', plain: '例：6 個信箱裡，系統每次挑今天寄得最少的那一個建草稿並寄出，追蹤信固定回原本那個信箱的對話串。每個信箱照暖機階限量，同一個網域的信箱加總也有上限，同一家公司 30 天最多收 2 封。哪個信箱被 Gmail 拒收就自動暫停那一個，其他照寄。',
    gate: '同一封信兩個同時的請求只寄出一次；同一信箱已寄 19 封、上限 20 時兩封不同的信只寄一封；同一家公司第 3 封不寄；同網域兩信箱搶最後一格只寄一封；名單轉成暖名單後既有草稿不寄；上班時間外不寄；暫停的信箱不寄。一個暖機第一階的次網域信箱寄 1 封到你另一個信箱。', risk: 'High（真寄）', model: 'Opus 5.5＋你', status: 'in_progress', depends: ['C4', 'C11'],
    decided: '自動寄是做量的主路徑。池信箱連上時就是自動寄；人工把關在核准那一步，不在按寄出。「沒有投訴」不列，因為 Gmail 不會告訴寄件人有沒有被檢舉。（規格 D17）',
    what: 'sender-pool.ts（各階上限、輪流選、co_begin_send RPC 包裝＋releaseClaim）；gmail-draft 建草稿時選信箱；send-adapter.ts（唯一寄信白名單；寄前重跑 Cold Gate 含 warm 硬拒；三額度原子佔用）；Connectors 信箱池表含恢復按鈕',
    files: ['NA/lib/outreach/sender-pool.ts', 'NA/lib/outreach/send-adapter.ts', 'NA/app/api/outreach/messages/gmail-draft/route.ts', 'NA/lib/outreach/gmail-sync.ts'],
    items: [
      done('C8.1', '各階上限、輪流挑信箱、呼叫名額函式：純函式，各自有測試。', C8),
      done('C8.2', '寫信時就用輪流規則挑信箱（署名跟著信箱）；追蹤信固定用上一封的信箱。', C8),
      done('C8.3', '寄出接頭：寄前重跑整個冷信閘（暖名單一律擋）與重查，再一次佔下三種名額才寄；逾時不重寄，30 分鐘還是草稿就退回待修改；被拒收就暫停那個信箱並通知。追蹤信等 C5 接回原對話串後才自動寄。', C8),
      done('C8.4', '每次同步末尾跑寄出；畫面上每個信箱一列：網域、DNS 三燈、暖機階、今日已寄／上限、退信率、自動寄出關／開（開要輸入 email）、恢復按鈕。', C8),
      todo('C8.5', '測試情境已完成（050a1041e：同一封兩次只寄一次、19/20 只寄一封、同網域搶最後一格、收件網域第 3 封、轉暖不寄、時段外不寄、暫停不寄）；剩：你買好次網域（C11.1）並重連 Gmail 後，真寄一封到你另一個信箱。'),
      done('C8.6', '自動寄出前先用付費服務驗證收件信箱真的存在、沒有爆滿：只寄確定有效的；無法判定的交給你；無效的直接進拒收名單。只驗要自動寄的，不驗整個名單庫。沒有 Hunter／ZeroBounce 金鑰就一律不自動寄。', C8),
    ] },
  { n: 9, code: 'C5', group: 'E', title: '追蹤信與人工步驟', plain: '例：第一封寄出 3 個工作天後沒回信，系統自動把寫好的追蹤信建在 Gmail 原本那串對話裡並寄出（自動寄的信箱）；草稿模式的信箱則在追蹤頁等你按。電話或 IG 私訊的步驟顯示成待辦，做完打勾。',
    gate: '到期的名單出現在追蹤頁並附內容。建的草稿在 Gmail 原對話串中。最後一封過期沒回信，名單標為無回應。', risk: 'Low', model: 'Codex', status: 'in_progress', depends: ['C8'],
    what: 'followups 頁列到期 lead＋下一封；gmail-draft 支援 In-Reply-To／References＋threadId；no_reply 判定；非 email 步驟待辦；管線 tick 自動建草稿',
    files: ['NA/app/(shell)/tools/outreach/followups/page.tsx', 'NA/app/api/outreach/messages/gmail-draft/route.ts', 'NA/lib/outreach/gmail-sync.ts'],
    items: [
      done('C5.1', '追蹤頁列出到期名單與寫好的下一封。', C5),
      done('C5.2', '追蹤信草稿建在原對話串裡（回覆標頭、Re: 主旨、同一串）；自動寄出也開放追蹤信：照順序、到期、在原串、同一名單一輪一封。', C5),
      done('C5.3', '最後一封過期沒回信，名單自動標為無回應（收件匣讀完且沒有待處理回信時才判）。', C5),
      done('C5.4', '電話、IG、LinkedIn 的步驟顯示成待辦，有完成按鈕。', C5),
      todo('C5.5', '測試已完成（d518cbb2c）；剩：首封真的寄出後，建一封追蹤草稿，看它在 Gmail 原串裡。'),
    ] },
  { n: 10, code: 'C15', group: 'F', title: '量產管線：照政策自動前進', plain: '例：名單核准後，系統每 10 分鐘自動替它研究、產信、依政策核准、建草稿、寄出，每步都有上限；你每天只處理佇列裡抽到的信、有警告的信、第三方證據，還有回信。',
    gate: '種 20 個有網站的名單，服務設成抽查模式，跑 3 個 tick，沒有任何人工點擊就出現至少 15 封已建草稿、2 封在佇列等你看。逐封模式的服務不會自動核准。暖名單永遠不會進管線。', risk: 'Medium', model: 'Opus 5.5', status: 'in_progress', depends: ['C5'],
    decided: '300 封一天不可能一筆一筆按：證據來自對方自家網站的自動核准；每個服務先逐封核准 50 封，之後抽查 10%，檢查有警告的一律人工，被擋的永遠不寄；管線照這套政策自動前進。（規格 D23）',
    what: 'pipeline.ts runPipelineTick（研究→產信→政策核准→建草稿→追蹤到期，各步每 tick 上限）；佇列頁含鍵盤操作；每 org 每日管線預算；成效頁顯示每日數',
    files: ['NA/lib/outreach/pipeline.ts', 'NA/app/(shell)/tools/outreach/review/ReviewClient.tsx', 'NA/lib/outreach/gmail-sync.ts'],
    items: [
      done('C15.1', '管線 tick：每 10 分鐘把名單往前推一步——研究、產信、依政策核准（每名單只一版、主張有證據才過；追蹤信跟著首封一起核准）、建草稿、追蹤到期，每步有上限。只對有自動寄信箱的品牌動作。', C15),
      done('C15.2', '佇列頁：抽到的信、有警告的信、第三方證據集中在一頁，鍵盤核准或退回。', C15),
      done('C15.3', '每個品牌每天的研究與產信預算跟寄信目標掛鉤，超過等明天；費用有紀錄。', C15),
      todo('C15.4', '測試已完成（96ecf614d）；剩：有自動寄信箱後，種 20 個名單跑 3 個 tick。'),
    ] },
  { n: 11, code: 'C7', group: 'E', title: '成效頁', plain: '例：外聯首頁一張表：每個品牌、每種切角、A 版 B 版各寄了幾封、幾封回、幾封正向、約到幾個會議、成交幾個；每個信箱的退信率與今日用量；每天研究、產信、寄出幾封。沒有開信率，因為那個數字不可信。',
    gate: '種 3 筆走到已回覆的名單，表上的數字正確。可下載 CSV。', risk: 'Low', model: 'Codex', status: 'in_progress', depends: ['C4'],
    what: 'stats route（SQL 聚合四張表）；首頁取代 stub；CSV；每信箱健康列；每日管線數',
    files: ['NA/app/api/outreach/stats/route.ts', 'NA/app/(shell)/tools/outreach/page.tsx'],
    items: [
      done('C7.1', '統計的後端：依品牌、切角、版本算寄出、退信、回覆、正向、會議、成交。（切角要等 C16 產信時填入才分得開）', C8),
      done('C7.2', '首頁取代空殼，顯示那張表與 CSV 下載。', C8),
      todo('C7.3', '計數測試已完成（050a1041e）；剩：種 3 筆走到已回覆的名單，看表上數字對。'),
    ] },
  { n: 12, code: 'C12', group: 'H', title: '名單來源：公司行號', plain: '例：你選「食品零售」加「台中市」，系統從經濟部的公司登記資料找出公司名、負責人、地址、資本額，再用搜尋引擎找出官網，放進待處理名單；email 之後由研究那步從官網補。',
    gate: '一個營業項目真查一次，待處理名單出現含負責人姓名與官網的公司。頁腳有資料來源聲明。', risk: 'Medium（C12.3 外部申請）', model: 'Codex', status: 'in_progress', depends: ['C10'],
    decided: '公司行號用經濟部商工登記開放資料：免費、合法、有負責人姓名。要先申請 API 白名單（填一份使用告知書）。登記資料沒有網站，所以用搜尋引擎找官網並核對公司名，找不到的留空。（規格 D20）',
    what: 'ProviderSpec 允許 keyless 供應商（仍受預算、origin、allowedPaths）；gcis entry；sources/gcis.ts 三步（營業項目代碼表 → 應用一 → Serper 找官網並驗證）；Inbox 頁找公司表單；顯名聲明',
    files: ['NA/lib/collect/net/providers.ts', 'NA/lib/outreach/sources/gcis.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      done('C12.1', '接經濟部商工登記 API（不需金鑰的供應商也走同一道門）：先依營業項目列公司，再補負責人、地址、資本額，再用搜尋引擎找官網、排除目錄站並核對；縣市在本地篩。（照官方文件寫，等白名單後真查確認）', C12),
      done('C12.2', 'Inbox 頁「找公司」：營業項目用搜尋框加可見清單、縣市用按鈕；結果進待處理名單，負責人填聯絡人。', C12),
      todo('C12.3', '你動手：告知書寄 opendata.gcis@gmail.com，IP 填 145.239.195.47。測試已完成（6c9f2a8c8，假回應）；核准後真查一次。'),
    ] },
  { n: 13, code: 'C13', group: 'H', title: '名單來源：人員搜尋、email 推斷、付費驗證', plain: '例：你要找台北行銷主管，系統用搜尋引擎找出公開的 LinkedIn 或 IG 簡介摘要，有 email 的直接填；只有姓名的，依公司已知的 email 格式推幾個候選，先免費查網域，再用 Hunter 驗證，驗過才進名單。每筆記下來源類別，不是對方自己公開的，信尾會多一行告知。',
    gate: '對一個真實公司找 2 位人員，候選進待處理名單；推斷出的 email 經驗證後只有有效的被填入，驗證紀錄存起來；來源類別正確。沒有付費金鑰時只做免費查核並標「未驗證」。', risk: 'Medium（個資法邊界）', model: 'Opus 5.5', status: 'in_progress', depends: ['C3'],
    decided: '只用搜尋引擎已經公開索引的摘要、對方自己的網站、你手動貼的資料。不寫任何爬 IG、Facebook、LinkedIn 頁面的程式，違反平台條款會被封整條線。個人 email 依個資法：來自一般可得來源、不是對方自己公開的就在第一封信告知來源與目的、附免費拒絕方式。（規格 D20）',
    what: 'sources/people-search.ts（Serper /search，只取 title／snippet／link，記來源類別）；email-guess.ts（格式推斷 ≤4 候選 → MX → Hunter verifier／finder）；Inbox 頁貼上個人資料表單',
    files: ['NA/lib/outreach/sources/people-search.ts', 'NA/lib/outreach/email-guess.ts', 'NA/lib/outreach/connectors/router.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      done('C13.1', '用搜尋引擎找人：只取搜尋結果的標題、摘要、連結，不碰社群頁面；摘要裡有 email 就填；記下是不是對方自己公開的。', C13),
      done('C13.2', '只有姓名時推 email 格式，先免費查網域，再用 Hunter 驗證，驗過才填；費用在畫面上。', C13),
      done('C13.3', 'Inbox 頁加「貼上個人資料」表單。', C13),
      todo('C13.4', '測試已完成（1c47a2904，假回應）；剩：填 Hunter 金鑰後，對一個真實公司找 2 位人員。'),
    ] },
  { n: 14, code: 'C6', group: 'G', title: '暖名單進 FluentCRM', waitFor: '等某個品牌有人回信或開始跑名單型廣告，而且它的網站裝了 wp-bridge 和 FluentCRM', plain: '例：對方回了信，你在 Replies 頁按「同步 FluentCRM」，他出現在該品牌 WordPress 的 FluentCRM 裡並掛上標籤。沒回過信、沒同意過的人按了也不會同步。',
    gate: '對測試站同步 1 個測試名單，FluentCRM 出現該聯絡人與標籤。沒有同意依據的名單回 422。', risk: 'High（客戶站外掛更新）', model: 'Opus 5.5', status: 'in_progress', depends: ['C4'],
    decided: '走系統已有的 FluentCRM 接頭（它已經會建電子報草稿），只加「新增聯絡人」一個動作，不另寫一套。同步到哪個站，照該品牌登記的網站對上已設定的 wp-bridge 連線，不寫死網址。aware-wave.com 依你 10-30 的決定只留 WordPress，不接回。（規格 D16）',
    what: 'wp-bridge 加 /fluentcrm/contact（signed write，照 /newsletter）；版本 0.20.0＋release；lib/crm/fluentcrm.ts 加 upsertContact；sync-fluentcrm route（資格＝consent_status 四種∧非 suppression；clientId 由 wp_sites.url 對 listBridgeClients()）；Replies 按鈕',
    files: ['WPB/includes/Http/RestController.php', 'WPB/includes/Crm/ContactUpserter.php', 'NA/lib/crm/fluentcrm.ts', 'NA/app/api/outreach/leads/sync-fluentcrm/route.ts'],
    items: [
      done('C6.1', 'wp-bridge 外掛加一個「新增／更新聯絡人」端點，只做這件事。', C6),
      done('C6.2', '外掛升 0.21.0、發版，並推上 aware-wave.com 與 Soulful（兩站 health 200；Soulful 檢查 7/7 通過）。', C6REL),
      done('C6.3', '同步的後端：先驗資格（回過信、填過表單、同意過、是客戶之一，且不在拒收名單），再呼叫外掛。', C6),
      todo('C6.4', '按鈕與測試已完成（f57fd3512）；剩：真同步一筆。沒有 staging 站，aware-wave.com 的 bridge 自 10-30 起沒接回 app（你決定先不接）：等決定接回 aware-wave.com 時再測。'),
    ] },
  { n: 15, code: 'C14', group: 'G', title: '個人消費者：Meta 名單型廣告 → FluentCRM', waitFor: '等你在 Meta 廣告管理員建立第一個名單型廣告', plain: '例：你在廣告管理員圈「台灣、對塔羅有興趣」投名單型廣告，對方在 IG 上一鍵留 email。系統收到後存成暖名單並記下同意依據，自動進該品牌的 FluentCRM 培養。這些人永遠不會收到冷信。',
    gate: '用 Meta 的名單廣告測試工具送一筆，10 秒內名單出現、帶同意依據，FluentCRM 也有這個聯絡人；同一筆重送不會重複。下載 CSV 匯入也走同一條路得到同樣結果。', risk: 'Medium（C14.3 外部設定）', model: 'Opus 5.5', status: 'in_progress', depends: ['C6'],
    decided: '個人消費者不走冷信，讓他們自己留 email：Meta 名單型廣告由你在廣告管理員建立，系統只收名單、存同意、同步 FluentCRM。先做 CSV 匯入（不用 Meta 權限），再做自動接收；兩條路共用同一段程式。不買名單。（規格 D22）',
    what: 'warm-leads.ts captureWarmLead（upsert、consent、upsertContact、timeline；migration 0153 部分唯一索引）；Inbox CSV 匯入；meta-leads.ts 接既有 /api/webhooks/meta 的 leadgen 事件',
    files: ['NA/lib/outreach/warm-leads.ts', 'NA/lib/outreach/meta-leads.ts', 'NA/app/api/webhooks/meta/route.ts', 'DB/migrations/0153_meta_leads.sql'],
    items: [
      done('C14.1', '共用的「收暖名單」程式：存名單、存同意、取消這個人所有待寄的冷信、同步 FluentCRM；匯入廣告管理員下載的 CSV 就走它；重送同一筆不重複，但沒同步成功的會補。', C14),
      done('C14.2', '自動接收：Meta 送來的名單事件經既有的簽章驗證後，抓回資料、走同一段程式。', C14),
      todo('C14.3', '你動手：App 加名單權限、每個品牌頁面訂閱名單事件。程式與測試已完成（27a93dbcc，0154 已套正式庫）；之後用 Meta 測試工具送一筆。'),
    ] },
  { n: 16, code: 'C9', group: 'G', title: '舊欄位退場', plain: '例：舊名單還是用那一格觀察。回填成證據列後，產信與評分只看證據，舊欄位不再寫入。', waitFor: '等 100 個名單走過研究流程',
    gate: '每個有舊觀察的名單都有一列證據。產信與評分不再讀舊欄位。欄位保留。', risk: 'Medium', model: 'Codex', status: 'not_started', depends: ['C3'],
    what: '冪等回填；checkColdGate 與 scoring 改讀 evidence；inbox 匯入寫 evidence',
    files: ['NA/lib/outreach/cold-gate.ts', 'NA/lib/outreach/scoring.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      todo('C9.1', '把舊的觀察回填成證據列。'),
      todo('C9.2', '產信與評分只看證據；匯入時直接寫證據。'),
    ] },
  { n: 17, code: 'C16', group: 'G', title: '自動化調校：抽得準、核得穩、越寫越好', waitFor: '等 C7 成效頁上線，而且真的寄了 2 週',
    plain: '例：全自動模式每天仍有 2% 的信給你看。現在是隨機抽；調校後優先抽新品牌、新產業、事實核對沒把握的、退信或負面回覆偏高的那類。事實核對換成判兩次結果一致的模型。哪種開場回覆率高，系統下次就多用那種。',
    gate: '同樣的抽查比例下，高風險的信被抽中機率至少是低風險的 2 倍。事實核對同一封信判兩次一致率達 95%，報告存檔。某品牌兩種切角各寄滿 30 封後，回覆率高的那種出現在下一封信的寫法裡。', risk: 'Medium', model: 'Opus 5.5', status: 'in_progress', depends: ['C7', 'C15'],
    decided: '自動化程度用三顆按鈕：手動、半自動（抽 10%）、全自動（抽 2%）。全自動不設 0%，留 2% 當模型走偏的警報。按鈕已在 C2 做好；這張卡只改「抽哪些」「核得穩不穩」「越寫越好」，要真資料才調得準。（規格 D24）',
    what: 'sampleWeight 依風險分配抽樣；claim-check 一致率實測與投票；generation 加 angle、stats 依切角、brand-context 有效做法段、pickVariant 偏向勝出版',
    files: ['NA/lib/outreach/review-policy.ts', 'NA/lib/outreach/claim-check.ts', 'NA/lib/outreach/generation-schema.ts', 'NA/lib/outreach/brand-context.ts'],
    items: [
      done('C16.1', '依風險抽樣：同樣的比例，優先抽新品牌、新產業、事實核對沒把握的、退信或負面回覆偏高的。', C16),
      todo('C16.2', '等真資料：寄出 200 封後，同一封判兩次量一致率。'),
      done('C16.3', 'A／B 成效回饋：每封記下切角，回覆率高的切角寫進下一封的提示，選版偏向它。', C16),
      todo('C16.4', '抽樣與切角的測試已完成（b0f5e4872）；剩：真寄滿 2 週後驗收。'),
    ] },
];

// 操作者自己要決定或親手做的（agent 不能替她定）
export const OPEN = [];
