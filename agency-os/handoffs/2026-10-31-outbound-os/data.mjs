// 外聯系統 v2 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：R0-PLAN.md §6（每張卡怎麼做）與規格 Outbound_OS_Engineering_Spec.md（規則、契約）。這裡只放「狀態」與「白話」，不重述做法。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '外聯系統 v2 監工台',
  updated: '2026-10-31',
  plan: 'agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md',
  req: 'agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-31',
  self: 'agency-os/handoffs/2026-10-31-outbound-os/',
  url: '',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '冷信系統從「幫你把信寫出來」升級成「替你找到客戶」：AI 自己查對方並留下證據、信有主旨與署名、每封有兩個版本與追蹤信、回信自動進系統並停止後續、暖名單進 FluentCRM、看得到回覆與成交。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事（2026-10-31 查）。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。同一組的卡修改不同檔案，可以同時進行。High 風險步驟經你同意才執行。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '規則與契約', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時進行：' },
};

// 現在真的能不能用（2026-10-31 查）
export const NOW = [
  { what: '匯入名單、打分數、產冷信、人工審核、在 Gmail 建草稿。', state: 'yes', ev: '2026-10-14 在正式站建了 1 封繁中草稿，沒有寄出（WORKLOG 2026-10-14 續28）。' },
  { what: 'AI 自己去看對方的網站並留下有來源的證據。', state: 'no', ev: '觀察要人工填，只有一格（co_leads.observation）。研究引擎沒有接上。' },
  { what: '信有主旨、有署名、用到品牌定位。', state: 'no', ev: '主旨固定是空的（messages/route.ts:209）；定位讀了沒用（:123）；沒有署名。' },
  { what: '每封信有兩個版本可比、追蹤信有內容。', state: 'no', ev: '一次只寫一封（buildPrompt :48-66）；追蹤只存日期（followups/route.ts:6-8）。' },
  { what: '對方回信會進系統，後續信自動停。', state: 'no', ev: 'Replies 頁是空殼；草稿只存 draft id，沒存對話串 id（gmail-draft/route.ts:186）。' },
  { what: '暖名單同步到 FluentCRM。', state: 'no', ev: 'wp-bridge 沒有 contact 端點（RestController.php:42-105），只能建電子報草稿。' },
  { what: '看得到回覆率、會議數、成交數。', state: 'no', ev: '外聯首頁是空殼。' },
  { what: 'Gmail 連線不會自己斷。', state: 'no', ev: 'Google 專案在測試模式，restricted scope 的 refresh token 每 7 天到期；10-14 連的是否仍活著，C1.4 查。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '守衛與事實訂正', plain: '例：名單上某人剛退訂，系統仍替他建草稿。改成建草稿前重查拒收名單。同時把「scope 不能寄信」這句不對的說法改正，用測試守住程式不呼叫寄信。',
    gate: '退訂後建草稿被擋下並說明原因。信的標頭有退訂方式。測試證明程式沒有任何寄信呼叫。Gmail 連線是否仍活著有查證結果。', risk: 'Low（C1.4 只讀正式站）', model: 'Codex', status: 'not_started', depends: [],
    what: 'MODULE_MANIFEST 與 google-oauth 註解改寫；never-sends 測試；gmail-draft 重查 do_not_contact／suppression；List-Unsubscribe header；prod connector refresh VBC',
    files: ['NA/lib/outreach/MODULE_MANIFEST.json', 'NA/lib/outreach/google-oauth.ts', 'NA/app/api/outreach/messages/gmail-draft/route.ts', 'NA/lib/outreach/__tests__/never-sends.test.ts'],
    items: [
      todo('C1.1', '把「scope 不能寄信」改成正確說法，加一個測試確認程式沒有寄信呼叫。'),
      todo('C1.2', '建草稿前重查拒收名單與不可聯絡標記，有就擋下。'),
      todo('C1.3', '信的標頭加上退訂方式。'),
      todo('C1.4', '查正式站的 Gmail 連線是否仍能續期，結果寫進紀錄與本頁現況。'),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '署名、定位、主旨、多版本、追蹤信內容', plain: '例：AI 一次寫出兩個主旨、兩個版本的第一封信、兩封追蹤信，每封都以你設定的署名結尾，用到品牌定位。你在審核頁並排看 A／B，核准一版。',
    gate: '對一個測試名單真產一次，資料庫出現 4 列：兩封第一封（各有主旨）、兩封追蹤信（各有等幾天）。內文以署名結尾。審核頁可並排核准。', risk: 'Medium（migration 套正式站 High）', model: 'Opus 5.5', status: 'not_started', depends: ['C1'],
    before: '待決 2（哪些信箱寄冷信、署名）',
    what: 'migration 0149 expand；brand-context.ts；generation-schema.ts（手寫守衛，無 zod）；messages/route.ts 寫 2＋N 列；Connectors 署名欄；Review A/B；刪 drafts stub',
    files: ['DB/migrations/0149_outbound_v2_expand.sql', 'NA/lib/outreach/brand-context.ts', 'NA/lib/outreach/generation-schema.ts', 'NA/app/api/outreach/messages/route.ts', 'NA/app/(shell)/outreach/review/ReviewClient.tsx'],
    items: [
      todo('C2.1', '資料表加三個欄位：寄件帳號的署名、追蹤信等幾天、品質檢查結果。'),
      todo('C2.2', '品牌脈絡組裝：定位、賣點、語氣、署名、已核准的證據，依固定順序組成給 AI 的指示。'),
      todo('C2.3', 'AI 的輸出改成固定格式的 JSON，格式不對會修一次再放棄。'),
      todo('C2.4', '產信改寫：一次寫兩個主旨、兩個版本、追蹤信，每封各自檢查，存成多列。'),
      todo('C2.5', '畫面：寄件帳號設定加署名欄；審核頁 A／B 並排；拿掉空的草稿頁。'),
      todo('C2.6', '測試與真產一次。'),
    ] },
  { n: 3, code: 'C3', group: 'C', title: '研究 → 證據', plain: '例：你按「研究這家」，系統去看小森咖啡的網站與 IG，抓出「菜單照片光線偏暗」這類觀察，每條附來源網址、原文片段與時間。你按核准，信才會用到它。',
    gate: '對一個真實公開網站跑研究，出現至少一條證據，原文片段能在該頁找到。沒有證據的名單不能產信。費用在按鈕上看得到。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C2'],
    what: 'migration 0150 co_evidence；collect sink outreach-evidence（excerpt 子字串驗）；research.ts＋route（crawl entity-dossier）；products.ts 加 outreach.research；Leads 頁按鈕與證據審核；cold-gate 改讀 evidence',
    files: ['DB/migrations/0150_co_evidence.sql', 'NA/lib/collect/sinks/outreach-evidence.ts', 'NA/lib/outreach/research.ts', 'NA/app/api/outreach/leads/research/route.ts', 'NA/lib/outreach/cold-gate.ts', 'NA/lib/portal/products.ts'],
    items: [
      todo('C3.1', '新資料表：證據（主張、來源、原文片段、時間、狀態）。'),
      todo('C3.2', '蒐集器加一個出口：把抓到的網頁交給便宜模型抽主張，原文片段對不上就丟掉。'),
      todo('C3.3', '「研究這家」的後端：用名單上的網站與社群連結起一次小範圍蒐集。'),
      todo('C3.4', '把「客戶研究」登記成收費功能。'),
      todo('C3.5', '畫面：研究按鈕（顯示費用）、證據核准／駁回；沒有核准證據就不產信。'),
      todo('C3.6', '測試與對真實網站跑一次。'),
    ] },
  { n: 4, code: 'C4', group: 'D', title: '回覆同步與 Replies 頁', plain: '例：你在 Gmail 按下寄出，10 分鐘內系統知道寄了；對方回信，系統抓回來分類成「問價」，名單狀態變「已回覆」，追蹤信自動停。退訂與退信也自動處理。',
    gate: '你寄 1 封給自己另一個信箱並回覆，10 分鐘內 Replies 頁出現該列、名單狀態變已回覆、追蹤日期清空。退信與退訂會進拒收名單。', risk: 'Medium（主機排程安裝 High）', model: 'Opus 5.5', status: 'not_started', depends: ['C2'],
    before: '待決 1（Google 授權發布狀態）',
    what: 'migration 0151 co_replies；scope 加 gmail.readonly；存 threadId；gmail-sync.ts（已寄／回信／退信）；分類＋停追蹤＋拒收；internal route＋cron */10＋host-jobs；Replies 頁按鈕',
    files: ['DB/migrations/0151_co_replies.sql', 'NA/lib/outreach/google-oauth.ts', 'NA/lib/outreach/gmail-sync.ts', 'NA/app/api/internal/outreach/gmail-sync/route.ts', 'HS/cron.d/awarewave-schedules', 'NA/app/(shell)/outreach/replies/page.tsx'],
    items: [
      todo('C4.1', '新資料表：回信。'),
      todo('C4.2', 'Gmail 授權多要「讀信」權限；建草稿時記下對話串 id。你要重新授權一次。'),
      todo('C4.3', '每 10 分鐘讀一次對話串：看出已寄、回信、退信，更新名單與事件。'),
      todo('C4.4', '回信交給便宜模型分類；有回信就停追蹤；退訂與拒絕進拒收名單。'),
      todo('C4.5', '主機排程每 10 分鐘叫一次；登記到排程頁。'),
      todo('C4.6', 'Replies 頁：列出回信，給你按鈕決定下一步（報價、問窗口、拒收、會議、成交、失去）。'),
      todo('C4.7', '測試與真寄一封給自己。'),
    ] },
  { n: 5, code: 'C5', group: 'E', title: '追蹤信與人工步驟', plain: '例：第一封寄出 3 個工作天後沒回信，追蹤頁出現小森咖啡與那封寫好的追蹤信，你按建草稿，它出現在 Gmail 原本那串對話裡。電話或 IG 私訊的步驟顯示成待辦，做完打勾。',
    gate: '到期的名單出現在追蹤頁並附內容。建的草稿在 Gmail 原對話串中。最後一封過期沒回信，名單標為無回應。', risk: 'Low', model: 'Codex', status: 'not_started', depends: ['C4'],
    what: 'followups 頁列到期 lead＋下一封；gmail-draft 支援 In-Reply-To／References＋threadId；no_reply 判定；非 email 步驟待辦',
    files: ['NA/app/(shell)/outreach/followups/page.tsx', 'NA/app/api/outreach/messages/gmail-draft/route.ts', 'NA/lib/outreach/gmail-sync.ts'],
    items: [
      todo('C5.1', '追蹤頁列出到期名單與寫好的下一封。'),
      todo('C5.2', '追蹤信草稿建在原對話串裡。'),
      todo('C5.3', '最後一封過期沒回信，名單自動標為無回應。'),
      todo('C5.4', '電話、IG、LinkedIn 的步驟顯示成待辦，有完成按鈕。'),
      todo('C5.5', '測試與在 Gmail 看到草稿在原串。'),
    ] },
  { n: 6, code: 'C6', group: 'D', title: '暖名單進 FluentCRM', plain: '例：對方回了信，你在 Replies 頁按「同步 FluentCRM」，他出現在該品牌 WordPress 的 FluentCRM 裡並掛上標籤。沒回過信、沒同意過的人按了也不會同步。',
    gate: '對測試站同步 1 個測試名單，FluentCRM 出現該聯絡人與標籤。沒有同意依據的名單回 422。', risk: 'High（客戶站外掛更新）', model: 'Opus 5.5', status: 'not_started', depends: [],
    before: '待決 3（FluentCRM 目標站）',
    what: 'wp-bridge 加 /fluentcrm/contact（signed write，照 /newsletter）；版本 0.20.0＋release；next-admin sync-fluentcrm route（資格＝consent_status 四種∧非 suppression）；Replies 按鈕',
    files: ['WPB/includes/Http/RestController.php', 'WPB/includes/Crm/ContactUpserter.php', 'NA/app/api/outreach/leads/sync-fluentcrm/route.ts'],
    items: [
      todo('C6.1', 'wp-bridge 外掛加一個「新增／更新聯絡人」端點，只做這件事。'),
      todo('C6.2', '外掛升版並發布到站上。'),
      todo('C6.3', '同步的後端：先驗資格（回過信、填過表單、同意過、是客戶之一，且不在拒收名單），再呼叫外掛。'),
      todo('C6.4', 'Replies 頁按鈕接上；測試與對測試站同步一次。'),
    ] },
  { n: 7, code: 'C7', group: 'E', title: '成效頁', plain: '例：外聯首頁一張表：每個品牌、每種切角、A 版 B 版各寄了幾封、幾封回、幾封正向、約到幾個會議、成交幾個。沒有開信率，因為那個數字不可信。',
    gate: '種 3 筆走到已回覆的名單，表上的數字正確。可下載 CSV。', risk: 'Low', model: 'Codex', status: 'not_started', depends: ['C4'],
    what: 'stats route（SQL 聚合四張表）；首頁取代 stub；CSV',
    files: ['NA/app/api/outreach/stats/route.ts', 'NA/app/(shell)/outreach/page.tsx'],
    items: [
      todo('C7.1', '統計的後端：依品牌、切角、版本算寄出、退信、回覆、正向、會議、成交。'),
      todo('C7.2', '首頁取代空殼，顯示那張表與 CSV 下載。'),
      todo('C7.3', '測試與種資料驗數字。'),
    ] },
  { n: 8, code: 'C8', group: 'F', title: '系統寄出開關', plain: '例：某個寄件帳號你決定讓系統自己寄。打開後，核准的信在上班時間、未超過每日上限、也沒進拒收名單時，由系統按寄出。帳號狀態一標「暫停」就全停。',
    gate: '同一封信兩個同時的請求只寄出一次。上班時間外不寄。暫停的帳號不寄。你自己的帳號開啟後，1 封寄到你另一個信箱。', risk: 'High（翻開 auto）', model: 'Opus 5.5＋你', status: 'not_started', depends: ['C4'],
    before: '待決 4（每帳號翻 auto）',
    what: 'migration 0152 send_mode＋status sending；send-adapter.ts（唯一寄信白名單；鎖＋視窗＋上限＋重查；逾時只對帳不重寄）；sync tick 末尾呼叫；Connectors 開關',
    files: ['DB/migrations/0152_send_mode.sql', 'NA/lib/outreach/send-adapter.ts', 'NA/lib/outreach/gmail-sync.ts'],
    items: [
      todo('C8.1', '寄件帳號加「寄出方式」欄，預設是草稿。'),
      todo('C8.2', '寄出接頭：只在開啟、健康、上班時間、未達上限、重查通過時寄；寄之前先鎖，逾時不重寄。'),
      todo('C8.3', '每次同步末尾跑一次寄出；畫面上每個帳號有開關，開要輸入帳號確認。'),
      todo('C8.4', '測試與你自己的帳號真寄一封。'),
    ] },
  { n: 9, code: 'C9', group: 'G', title: '舊欄位退場', plain: '例：舊名單還是用那一格觀察。回填成證據列後，產信與評分只看證據，舊欄位不再寫入。', waitFor: '等 100 個名單走過研究流程',
    gate: '每個有舊觀察的名單都有一列證據。產信與評分不再讀舊欄位。欄位保留。', risk: 'Medium', model: 'Codex', status: 'not_started', depends: ['C3'],
    what: '冪等回填；checkColdGate 與 scoring 改讀 evidence；inbox 匯入寫 evidence',
    files: ['NA/lib/outreach/cold-gate.ts', 'NA/lib/outreach/scoring.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      todo('C9.1', '把舊的觀察回填成證據列。'),
      todo('C9.2', '產信與評分只看證據；匯入時直接寫證據。'),
    ] },
  { n: 10, code: 'C10', group: 'G', title: '名單發現', plain: '例：你輸入「台中 咖啡廳」，系統用 Google Places 找出 20 家，連網站與電話一起放進待處理名單。', waitFor: '等 Google Places API key',
    gate: '一次真查回 20 筆進待處理名單，每筆有名稱、網站或電話、來源網址。費用在畫面上。', risk: 'Low', model: 'Codex', status: 'not_started', depends: [],
    before: '待決 5（Google Places key）',
    what: 'connector places 接 Text Search → co_lead_inbox；Inbox 頁找名單表單',
    files: ['NA/lib/outreach/connectors/router.ts', 'NA/app/api/outreach/inbox/route.ts'],
    items: [
      todo('C10.1', 'Google Places 查詢接進名單匯入。'),
      todo('C10.2', 'Inbox 頁加找名單表單；測試與真查一次。'),
    ] },
];

// 操作者自己要決定或親手做的（agent 不能替她定）
export const OPEN = [
  { n: 1, what: 'Google 專案的授權發布狀態。測試模式下讀信權限的 token 每 7 天到期，連線會一直斷。', before: 'C4', src: 'SPEC §7；C1.4 的查證結果',
    options: [
      { k: '改成已發布（未驗證）', t: 'token 不再 7 天到期。最多 100 個帳號，授權畫面會出現「未驗證」警告一次。內部使用可接受。', pick: true },
      { k: '留在測試模式', t: '每 7 天要重新授權一次。' },
    ] },
  { n: 2, what: '哪些信箱寄冷信、各自的署名。每個品牌一個 Workspace 或 Gmail 帳號，不買專用網域。', before: 'C2', src: 'SPEC §2 D12；deliverability §11' },
  { n: 3, what: '每個品牌的 FluentCRM 在哪個 WordPress 站。', before: 'C6', src: 'SPEC §5.8' },
  { n: 4, what: '哪個寄件帳號讓系統自己寄。一次一個，可隨時關。', before: 'C8', src: 'SPEC §2 D8' },
  { n: 5, what: 'Google Places API 要不要開（需要綁信用卡，有免費額度）。', before: 'C10', src: 'SPEC §3 第 02 列' },
];
