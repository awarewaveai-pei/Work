// 員工逐工具權限 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：R0-PLAN.md（§6 每張卡怎麼做、§5 決策）。這裡只放「狀態」與「白話」，不重述做法。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '員工權限 監工台',
  updated: '2026-10-24',
  plan: 'agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md',
  req: 'agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md §1',
  worklog: 'agency-os/WORKLOG.md 2026-10-24',
  self: 'agency-os/handoffs/2026-10-24-staff-tool-grants/',
  url: 'https://claude.ai/artifact/RbxhBAEU7KsaxuJ9zKeJL6',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '擁有者可為每位員工勾選可用工具。未勾選的工具不會顯示在側欄；直接輸入網址或呼叫 API 也會被擋下。擁有者永遠可用全部工具。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前可用與尚未可用的功能。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作；勾選表示完成。同一組的卡若修改不同檔案，可同時進行。High 風險步驟需經你同意才會執行。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '任務目標', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時進行：' },
};

// 現在真的能不能用（2026-10-24 查）
export const NOW = [
  { what: '員工分為擁有者、管理員、操作、唯讀四種角色。', state: 'yes', ev: '角色設定存在登入帳號中，目前需到 Supabase 後台手動修改。' },
  { what: '為每位員工分別勾選可用工具。', state: 'yes', ev: '在 /ops/staff 勾選（C4）。台灣時間 03:00 自動部署後可用。' },
  { what: '側欄只顯示有權限的工具。', state: 'yes', ev: '已設定工具的員工，側欄、首頁、客戶中心分頁只顯示勾選的工具（C3）。部署後生效。' },
  { what: '沒有權限時，直接輸入網址或呼叫 API 會被擋下。', state: 'no', ev: '程式已完成（C2），目前只記錄「本來會擋」、不擋。正式擋要等你同意（C6）。' },
  { what: '在後台管理員工帳號與權限。', state: 'yes', ev: '/ops/staff：改角色、勾工具、寄邀請給新員工。只有擁有者能改。部署後可用。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const C1 = '1b8096116';
const C2 = '3bb0cd120';
const C3 = 'dfc3027a5';
const C4 = '3976fa73f';
const C5 = 'f4cfe6dad';

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '員工工具登記表', plain: '列出所有可勾選的工具：每個產品一格、每個後台頁面一格。新增頁面或 API 若未歸入任何一格，測試就會失敗。',
    gate: '每個員工頁面與 API 都歸入一格工具，或標明為所有員工皆可使用；測試通過。', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: C1, depends: [],
    decided: '一個產品一格；一個後台頁面一格；後台外觀與模型資料各一格。依 2026-10-24 建議。',
    what: 'lib/portal/staff-tools.ts 由 PRODUCTS／STAFF_UTILITIES／BACK_OFFICE 推出 STAFF_TOOLS；STAFF_API_OWNERS 補員工專用 API；toolsFor(pathname) 最長前綴',
    files: ['lib/portal/staff-tools.ts', 'lib/portal/products.ts', 'lib/portal/__tests__/staff-tools.test.ts'],
    items: [
      done('C1.1', '從產品清單整理所有可勾選的工具，每格附上中文名稱。', C1),
      done('C1.2', '不在產品頁面上的員工專用 API，逐一歸入所屬工具；多個工具共用的 API，擁有任一工具即可使用。', C1),
      done('C1.3', '輸入網址即可判斷所屬工具。', C1),
      done('C1.4', '測試：每個員工頁面與 API 都歸入一格工具；未歸類就失敗。', C1),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '身分帶工具、擋網址與 API', plain: '登入時一併讀取這位員工勾選的工具。打開無權限頁面會看到說明頁；呼叫 API 會被拒絕。先只記錄、不擋；確認名單無誤後，再正式開始擋。',
    gate: '未勾選工具的員工打開該工具時會看到說明頁；呼叫 API 回應 403。擁有者永遠可以使用；偽造的權限資料會被剝除。', risk: 'High（登入與權限）', model: 'Opus 5.5', status: 'done', commit: C2, depends: ['C1'],
    decided: '只記錄、不擋期間，尚未設定的員工全部可用。依 2026-10-24 建議。',
    what: 'CachedIdentity.tools；app_metadata.staff_tools → x-ops-tools；staffMayUse；STAFF_TOOLS_MODE shadow|enforce；middleware 兩條路徑都判斷',
    files: ['middleware.ts', 'lib/supabase/session-cache.ts', 'lib/staff-access.ts'],
    items: [
      done('C2.1', '登入時讀取員工勾選的工具，並移除瀏覽器偽造的同名權限資料。', C2),
      done('C2.2', '判斷規則：擁有者永遠可以；所有員工皆可用的頁面永遠可以；只記錄期間，尚未設定的員工全部可用。', C2),
      done('C2.3', '每次打開頁面或呼叫 API 都檢查。只記錄期間寫下「本來會擋」的紀錄；正式擋之後，頁面導向說明頁，API 回應 403。', C2),
      done('C2.4', '測試：擁有者不受限、未歸類網址會被擋、只記錄時放行、快取路徑同樣檢查、偽造資料被剝除。', C2),
    ] },
  { n: 3, code: 'C3', group: 'C', title: '側欄與首頁只顯示有權限的', plain: '員工登入後，側欄與首頁只顯示已勾選的工具。整個分區都沒有權限時，不顯示分區標題。',
    gate: '只勾選社群發文工具的員工，側欄只看得到社群發文與首頁。', risk: 'Medium', model: 'Sonnet 5.5（照卡）', status: 'done', commit: C3, depends: ['C2'],
    what: 'layout.tsx 讀 headers → SidebarNav 過濾；首頁分區同一過濾',
    files: ['app/(shell)/layout.tsx', 'app/SidebarNav.tsx', 'app/(shell)/page.tsx'],
    items: [
      done('C3.1', '側欄只顯示有權限的工具；沒有工具的分區不顯示。', C3),
      done('C3.2', '首頁的分區套用相同規則。', C3),
      done('C3.3', '測試：側欄每個連結都歸入一格工具。', C3),
      done('C3.4', '客戶中心裡屬於其他產品的分頁（AI 客服、資料蒐集、開發信、網站與社群），員工沒勾該產品就不顯示。', C3),
    ] },
  { n: 4, code: 'C4', group: 'B', title: '員工權限頁 /ops/staff', plain: '新增後台頁面：每位員工一列，按鈕切換角色，勾選框選擇工具，按下儲存即生效。擁有者那一列全部勾選且無法修改。',
    gate: '擁有者可在頁面上替員工勾選工具並儲存；約 15 秒後，該員工的側欄跟著改變。擁有者那一列無法取消勾選；最後一位擁有者無法被降級。', risk: 'High（帳號權限）', model: 'Opus 5.5', status: 'done', commit: C4, depends: ['C1'],
    decided: '只有擁有者能修改其他人的角色與工具。依 2026-10-24 建議。',
    what: 'GET/PATCH /api/ops/staff（auth.admin，只 owner 寫、last-owner 鎖、audit）；頁面 chips＋checkbox；邀請新員工',
    files: ['app/api/ops/staff/route.ts', 'app/(shell)/ops/staff/page.tsx', 'lib/portal/products.ts'],
    items: [
      done('C4.1', '讀取與修改員工的 API：只有擁有者能修改；擁有者的工具無法更動；最後一位擁有者無法降級；每次修改都留下紀錄。', C4),
      done('C4.2', '頁面：每位員工一列，四顆角色按鈕；工具分成「產品」「工具」「後台」三排勾選；提供全選、全不選與儲存。', C4),
      done('C4.3', '新增員工：輸入 email 寄出邀請，預設為唯讀且沒有任何工具。', C4),
      done('C4.4', '新頁面登記到產品清單與側欄。', C4),
    ] },
  { n: 5, code: 'C5', group: 'C', title: '沒權限頁與文件', plain: '沒有權限時顯示說明頁，告訴員工所需工具，並請擁有者開通。同時把這套規則寫入架構文件。',
    gate: '說明頁顯示工具名稱；架構決策文件與現況文件都寫入新規則。', risk: 'Low', model: 'Sonnet 5.5（照卡）', status: 'done', commit: C5, depends: ['C2'],
    what: '/no-access 頁；ADR 019＋ADR_INDEX；APP_AWARE_WAVE_CURRENT_STATE 身分段；RUNNABLE_DEMOS',
    files: ['app/(shell)/no-access/page.tsx', 'agency-os/docs/architecture/decisions/019-staff-tool-grants.md'],
    items: [
      done('C5.1', '說明頁顯示所需工具，並請員工找擁有者開通。', C2),
      done('C5.2', '寫入架構決策文件，並登記到索引。', C5),
      done('C5.3', '現況文件補上員工工具權限；可執行示範清單新增一條你能自己執行的指令。', C5),
    ] },
  { n: 6, code: 'C6', group: 'D', title: '上線', plain: '程式先以只記錄、不擋的方式上線。你在權限頁設定好每位員工後，觀察 7 天紀錄；確認沒有問題，再正式開始擋。',
    gate: '連續 7 天沒有「本來會擋」的紀錄，或每筆紀錄都已說明；正式開始擋後，員工只看得到已勾選的工具。', risk: 'High（正式站權限）', model: '你＋Opus 5.5', status: 'in_progress', depends: ['C3', 'C4', 'C5'],
    before: '待決 1',
    what: 'push main → 03:00 auto-deploy（shadow）；/ops/staff 設定；docker logs grep [staff-tools]；STAFF_TOOLS_MODE=enforce 走 safe-infra-patch.sh compose',
    files: ['/root/lobster-phase1/docker-compose.yml'],
    items: [
      done('C6.1', '推上 main，台灣時間 03:00 自動部署。這時只記錄、不擋，使用上沒有任何變化。', '4c36c46c7'),
      todo('C6.2', '你在權限頁替每位員工勾選工具。'),
      todo('C6.3', '觀察 7 天「本來會擋」的紀錄，逐筆說明或補上設定。'),
      todo('C6.4', '正式開始擋，需要你同意。'),
    ] },
];

// 操作者自己要決定或親手做的（agent 不能替她定）
export const OPEN = [
  { n: 1, what: '確認 7 天紀錄後，同意正式開始擋，設定正式站的權限模式。', before: 'C6', src: '計畫 §3 R1、C6.4' },
];
