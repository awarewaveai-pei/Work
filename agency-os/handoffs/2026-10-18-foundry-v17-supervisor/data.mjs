// System Foundry v1.7 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：V1_7_HANDOFF_PLAN.md（每張卡怎麼做、驗收）。這裡只放「狀態」與「白話」，不重述做法。

export const META = {
  title: 'System Foundry v1.7 監工台',
  updated: '2026-10-19',
  plan: 'agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/V1_7_HANDOFF_PLAN.md',
  tasks: 'agency-os/TASKS.md「ADR 017 客戶怎麼買」',
  worklog: 'agency-os/WORKLOG.md 2026-10-19 續6、續8、續9、續10',
  self: 'agency-os/handoffs/2026-10-18-foundry-v17-supervisor/',
  url: 'https://claude.ai/artifact/RaVZVfj6yU5XMGkx3JV8SF',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '讓 System Foundry 答完問卷後，產出 Claude 能直接開工的專案資料夾，並自帶監工台。共 {total} 張卡，照順序做。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '待建項目', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '選擇引擎原本就正確；這一版重做的是產出。' },
  steps: { h: '待建項目', lead: '照編號順序做，每張卡的驗收寫在計畫檔。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '這幾件決定後，對應的卡才能開工。', none: '目前沒有要你決定的事。', count: '{n} 項', before: '要在 {code} 開工前決定', src: '出處' },
  paths: { h: '檔案', plan: '每張卡怎麼做', track: '追蹤', self: '本頁來源', howto: '改 data.mjs，執行 node build.mjs 和 node check.mjs，再重新發布同一個網址' },
  label: { yes: '有', no: '還沒有', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成條件', details: '工程細節', depends: '要先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時做：' },
};

// 現在真的成立的（2026-10-19 查）
export const NOW = [
  { what: '問卷選出正確的積木', state: 'yes', ev: '選擇矩陣、突變覆蓋兩道閘全綠（make verify）' },
  { what: '產出一頁計畫與每個模組一張執行卡', state: 'yes', ev: 'PLAN.md＋cards/<模組>.md（V17-1、V17-2）' },
  { what: '每個產生的專案自帶監工台', state: 'yes', ev: 'supervisor/，與 AwareWave 監工台同一套 supervisor-kit（V17-3）' },
  { what: '每個能力都有驗收', state: 'no', ev: '大多數能力還沒有驗收；缺的在卡上標 TODO，缺數由 report_acceptance_gap.py 在 make verify 印出' },
  { what: '勾 AwareWave 積木就帶入依賴', state: 'no', ev: 'V17-4' },
];

// 計畫的卡，依開工順序編號。status: not_started | in_progress | done；done 必填 commit。
// code 必須跟計畫檔「### V17-n」標題一致（check.mjs 驗）。
export const STEPS = [
  { n: 1, code: 'V17-1', plain: '刪掉 74 節重複的樣板藍圖，改成專案根目錄一頁 PLAN.md：選了什麼、為什麼、每節適不適用。', title: '樣板瘦身', gate: '全答產生後沒有 docs/blueprint；PLAN.md 每節一列；make verify 綠', risk: 'Low', model: 'Sonnet 5.5（SDK）＋Opus 5.5 驗收', status: 'done', commit: '80a73d7e2', depends: [] },
  { n: 2, code: 'V17-2', plain: '每個模組一張執行卡：做什麼、改哪些檔、用什麼測試證明、怎麼回滾；沒寫驗收的能力標 TODO。', title: '每模組一張可執行卡', gate: '客服模組的卡每個能力都有「指令→預期」；拿掉一個能力的驗收，卡出現 TODO、缺數加一', risk: 'Low', model: 'Sonnet 5.5（SDK）＋Opus 5.5 驗收', status: 'done', commit: '6c92f43c8', depends: ['V17-1'] },
  { n: 3, code: 'V17-3', plain: '監工台只有一套版面；每個產生的專案都自帶一個，模組依相依關係分層排好。', title: '監工台套件共用', gate: '產生的專案 node supervisor/build.mjs 和 check.mjs 綠；計畫少一個模組，check 變紅', risk: 'Low', model: 'Opus 5.5', status: 'done', commit: '5fa64e1e6', depends: ['V17-2'] },
  { n: 4, code: 'V17-4', plain: '問卷裡勾選 AwareWave 的產品（社群、客服…），它和它依賴的產品就自動帶進專案；新產品產生器讀得懂產出。', title: '接軌 AwareWave', gate: '勾社群 → 模組含社群與其依賴；new-product.mjs --from-foundry 產出的十項宣告至少六項不是 TODO', risk: 'Low', model: 'Opus 5.5', status: 'not_started', depends: ['V17-3'] },
  { n: 5, code: 'V17-5', plain: '範例專案每次驗證時從最新問卷重新產生，問卷改了範例就跟著更新，不會過期。', title: '範例 intake 自動重生', gate: '改一題 id → 驗證紅；重生 → 綠', risk: 'Low', model: 'Opus 5.5', status: 'not_started', depends: ['V17-4'] },
  { n: 6, code: 'V17-6', plain: '問卷加一題「裝在客戶自己的主機」；答要，就必須有授權檔，發版要能離線更新。', title: '新題', gate: '答要 → CAP-LICENSE 必選、FOUND-RELEASE 多一條離線更新義務；選擇矩陣綠', risk: 'Low', model: 'Opus 5.5', status: 'not_started', depends: ['V17-5'] },
];

// 操作者自己要決定的（agent 不能代為決定）
export const OPEN = [];
