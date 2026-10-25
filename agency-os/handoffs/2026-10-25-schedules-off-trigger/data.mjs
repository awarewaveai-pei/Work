// 排程離開 Trigger 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：R0-PLAN.md（§6 每張卡怎麼做、§5 決策）。這裡只放「狀態」與「白話」，不重述做法。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '排程離開 Trigger 監工台',
  updated: '2026-10-25',
  plan: 'agency-os/handoffs/2026-10-25-schedules-off-trigger/R0-PLAN.md',
  req: 'agency-os/handoffs/2026-10-25-schedules-off-trigger/R0-PLAN.md §1',
  worklog: 'agency-os/WORKLOG.md 2026-10-25',
  self: 'agency-os/handoffs/2026-10-25-schedules-off-trigger/',
  url: 'https://claude.ai/artifact/QsgquXzuzi1oQ8FCVoRrAZ',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '定時工作改由主機排程啟動。Trigger 只執行按鈕啟動的長流程。所有排程集中在 /ops/schedules。排程太久未成功會通知手機。每天另發一行「全部正常」。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。同一組的卡修改不同檔案，可以同時進行。High 風險步驟經你同意才執行。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '任務目標', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時進行：' },
};

// 現在真的能不能用（2026-10-25 查）
export const NOW = [
  { what: 'Trigger 正常運作。', state: 'yes', ev: '2026-10-25 清除停滯的工作後恢復正常。網站巡檢四項檢查皆通過。' },
  { what: '社群發文、客服、訂單與網站巡檢可不經 Trigger 定時執行。', state: 'yes', ev: '2026-10-25 起由主機排程啟動，首輪全部成功。Trigger 上的同名定時工作仍在，C2.3 關閉。' },
  { what: '系統能自動偵測 Trigger 停滯。', state: 'no', ev: '這次停了 34 小時，直到查看網站巡檢報告才發現（C3）。' },
  { what: '任何排程太久未成功，手機都會收到通知。', state: 'no', ev: '目前只有網站回應、自動部署、雲端報告與影片補登會推播。其餘異常只在頁面標紅（C4）。' },
  { what: '每天會收到一行「全部正常」。', state: 'no', ev: 'C4。' },
  { what: '/ops/schedules 可查看資料庫、n8n、GitHub 與雲端排程。', state: 'no', ev: '目前只顯示客戶與主機排程。資料庫清理工作在 2026-10-24 失敗，無人察覺（C5）。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const C1 = '72d15254c';
const C21 = 'ea968aca1';
const C4 = '6b06e0743';
const C44 = 'b9ab5a4f2';

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '定時工作改由主機啟動', plain: '例：社群貼文每 5 分鐘發送一次，改由主機直接啟動。9 個定時工作維持原有頻率。另刪除 1 個重複工作。',
    gate: '9 個定時工作的主機排程與排程頁登記完成。本機測試通過。', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: C1, depends: [],
    decided: '社群發文與客服維持每 5 分鐘執行。訂單維持每 10 分鐘執行。主機每次啟動工作的成本幾乎為零。改成每小時執行，貼文最多會延遲 50 分鐘。',
    what: 'HS/poke.sh 取代 schedules-run-due.sh；site-watch-tick.sh；cron.d 加 9 行；host-jobs.ts 9 列',
    files: ['HS/poke.sh', 'HS/site-watch-tick.sh', 'HS/cron.d/awarewave-schedules', 'NA/lib/schedules/host-jobs.ts'],
    items: [
      done('C1.1', '所有定時工作共用一支啟動腳本。刪除原有的同用途腳本。', C1),
      done('C1.2', '網站巡檢先確認哪些網站已到檢查時間。每次檢查兩個網站。完成後清理舊截圖。', C1),
      done('C1.3', '主機新增 9 個定時工作。執行頻率不變。', C1),
      done('C1.4', '在排程頁登記這 9 個工作的中文名稱與說明。', C1),
      done('C1.5', '測試成功、密碼錯誤、對方回報失敗三種情況。確認腳本皆回報正確結果。', C1),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '定時工作上線', plain: '例：先在正式主機裝好新排程。排程頁全為綠色後，才關閉 Trigger 上的定時工作。順序相反會讓社群發文等工作中斷。',
    gate: '/ops/schedules 新增的工作全為綠色。Trigger 在 24 小時內未執行任何定時工作。文件不再寫「由 Trigger 叫醒」。', risk: 'High（正式主機）', model: '你＋Opus 5.5', status: 'in_progress', depends: ['C1'],
    decided: '2026-10-25 同意在正式主機安裝。',
    what: 'sync-host-scripts → install-host-schedules.sh；WF 刪 10 個 schedules.task＋token 同步段 → push（＝Trigger 部署）；文件同步',
    files: ['/etc/cron.d/awarewave-schedules', 'WF/src/trigger/*.ts', 'scripts/lobster-trigger-deploy.ps1'],
    items: [
      done('C2.1', '經你同意後，在正式主機安裝新排程。', C21),
      todo('C2.2', '等待 15 分鐘，確認排程頁新增的工作全為綠色。（2026-10-25：6 個綠；3 個每天一次的工作要等第一次執行，最晚 10-26 09:00）'),
      todo('C2.3', '刪除 Trigger 上的 10 個定時工作與專供它們同步密碼的程式，再部署 Trigger。'),
      todo('C2.4', '觀察 24 小時，確認 Trigger 沒有執行定時工作。'),
      todo('C2.5', '更新所有寫著「由 Trigger 叫醒」的文件。提供截圖。'),
    ] },
  { n: 3, code: 'C3', group: 'C', title: '自動偵測 Trigger 停滯', plain: '例：工作已停止，卻仍占用執行名額。排程頁在 10 分鐘內標紅。手機會收到附有處理手冊的通知。',
    gate: '模擬已停止但仍占用名額的工作，確認檢查回報失敗。正常執行的工作不會被誤報。', risk: 'Medium（安裝需你同意）', model: 'Opus 5.5', status: 'not_started', depends: ['C2'],
    what: 'HS/check-trigger-slots.sh：Redis currentConcurrency vs TaskRun.status；cron */10；host-jobs.ts 一列',
    files: ['HS/check-trigger-slots.sh', 'HS/cron.d/awarewave-schedules', 'NA/lib/schedules/host-jobs.ts'],
    items: [
      todo('C3.1', '比對 Trigger 記錄的名額與實際執行中的工作。工作已停止卻仍占用名額超過 15 分鐘，就回報失敗。'),
      todo('C3.2', '每 10 分鐘檢查一次。檢查工作登記在排程頁。失敗訊息附上處理手冊。'),
      todo('C3.3', '測試未占用名額、一個已停止的工作仍占用名額、一個工作正常執行三種情況。確認判斷皆正確。'),
      todo('C3.4', '經你同意後安裝到正式主機。'),
    ] },
  { n: 4, code: 'C4', group: 'C', title: '統一發送排程通知', plain: '例：社群發文 20 分鐘未成功，手機收到「社群貼文發送停了」。恢復後再通知一次。每天早上 9 點收到一行「全部正常」。未收到這行訊息，代表通知系統故障。',
    gate: '模擬排程停擺，確認標紅時通知一次。恢復時再通知一次。持續異常不重複通知。每日一行訊息準時送達。Telegram 與 Slack 都收到通知。', risk: 'Medium（上線需你同意）', model: 'Opus 5.5', status: 'in_progress', depends: [],
    decided: '通知同時送到 Telegram 與 Slack。備份完整性與部署版本通知原本只送 Slack，也改為兩邊都送。',
    what: 'HS/notify.sh 統一變數名；report-host-schedules.py 狀態變化推播＋每日 01:00 UTC 摘要；5 支舊發送改用 notify.sh；.env 改名',
    files: ['HS/notify.sh', 'HS/report-host-schedules.py', 'HS/endpoint-alert.sh', 'HS/check-drift-and-alert.sh', 'HS/auto-deploy-next-admin.sh', 'HS/reconcile-videos.sh', 'scripts/routine-output-watchdog.sh'],
    items: [
      done('C4.1', '共用一支腳本發送 Telegram 與 Slack 通知。統一設定名稱。', C44),
      done('C4.2', '排程標紅時通知一次。恢復時再通知一次。持續異常不重複通知。', C4),
      done('C4.3', '每天早上 9 點發送一行訊息：全部正常，或列出異常排程。', C4),
      done('C4.4', '主機上自己發通知的 7 支腳本改用共用通知腳本，各自原本的 Slack 頻道保留。', C44),
      done('C4.5', '測試標紅時通知一次。恢復時再通知一次。相同狀態不重複通知。', C44),
      todo('C4.6', '經你同意後在正式主機上線：寫入 #infra-alerts 設定（2026-10-25 已完成）、安裝通知與每日報告兩個排程（2026-10-25 已完成，c7ccfb239 同時修好兩個長期失敗的排程）、更新開機通知（2026-10-25 已完成）、演練三個通道（2026-10-25 已完成，三個都收到）、修好 Slack 同步工具（2026-10-25 已修好：主機網址不同就停）、主機上沒人讀的舊通知設定退役（2026-10-25 已完成）。提供第一則每日通知的截圖。'),
      done('C4.7', '訂單重送與後台操作補派兩個工作，改成回報實際結果。目前收到要求就回報成功，實際失敗時排程頁仍會顯示綠色。', C4),
    ] },
  { n: 5, code: 'C5', group: 'D', title: '補齊排程頁的工作清單', plain: '例：Supabase 每天凌晨清理舊紀錄的工作，在 2026-10-24 失敗卻無人察覺。之後這類失敗會在 /ops/schedules 標紅。頁面也會列出 n8n、GitHub 與雲端報告的排程。',
    gate: '/ops/schedules 顯示資料庫、n8n、GitHub、雲端與筆電報告各區。資料庫排程顯示最近一次執行結果。', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C4'],
    before: '待決 1',
    what: '盤點加 pg_cron（cron.job_run_details）、n8n API、GitHub Actions API、repo 報告產生時間；SCHEDULES_PAGE_PLAN.md:50 改寫',
    files: ['HS/report-host-schedules.py', 'NA/lib/schedules/adapters/host-schedules.ts', 'agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md'],
    items: [
      todo('C5.1', '資料庫內建排程每個工作各列一行。顯示最近一次執行成功或失敗。'),
      todo('C5.2', '已啟用的 n8n 定時流程會自動列出。目前沒有這類流程。'),
      todo('C5.3', 'GitHub 定時檢查會自動列出。顯示最近一次執行結果。'),
      todo('C5.4', '筆電與雲端區顯示每份報告的產生時間。超過更新週期就標黃。報告標明由筆電產生。'),
      todo('C5.5', '修改原本「不放筆電與雲端」的決定。頁面寫明：AwareWave 設定的每個排程都會列出。'),
    ] },
  { n: 6, code: 'C6', group: 'E', title: '狀態報告改由主機產生', plain: '例：主機記憶體與硬碟用量報告，目前要等筆電執行開工報告才會更新。改由主機每天產生後，筆電未開機也能更新。',
    gate: '排程頁「筆電與雲端」區只保留需要筆電的項目。其餘報告由主機準時產生。', risk: 'High（正式主機）', model: 'Opus 5.5', status: 'not_started', depends: ['C5'],
    before: '待決 4',
    what: '清點 ao-resume.ps1 讀的 9 份報告；SSH 讀主機者改主機 cron 產生寫 /var/lib/awarewave',
    files: ['scripts/ao-resume.ps1', 'HS/cron.d/awarewave-schedules'],
    items: [
      todo('C6.1', '清點開工報告使用的每份報告。確認產生者。確認資料來源。'),
      todo('C6.2', '資料位於主機的報告，改由主機定時產生。筆電只負責讀取。'),
      todo('C6.3', '排程頁「筆電與雲端」區只保留需要筆電的項目。'),
    ] },
  { n: 7, code: 'C7', group: 'F', title: '內部 API 共用一組密碼', plain: '例：社群發文、客服、訂單與網站巡檢等內部呼叫，目前使用 7 組密碼。更換密碼需操作 7 次。統一成一組後，只需更換一次。',
    gate: '7 個內部 API 共用一組密碼。密碼驗證共用一個函式。舊名稱全數移除。獨立審查通過。', risk: 'Medium（登入與權限）', model: 'Opus 5.5', status: 'not_started', depends: ['C6'],
    what: 'verifyInternalToken() + INTERNAL_API_TOKEN；7 route；compose、.env.example、cron 行、測試',
    files: ['NA/lib/security/', 'NA/app/api/internal/**/route.ts', 'lobster-factory/infra/hetzner-phase1-core/docker-compose.yml'],
    items: [
      todo('C7.1', '7 個內部 API 改用同一組密碼。密碼驗證共用一個函式。移除舊名稱。'),
      todo('C7.2', '同步更新主機設定、範例檔、主機排程與測試。交由另一個模型獨立審查。'),
    ] },
  { n: 8, code: 'C8', group: 'E', title: '從主機外監控網站', plain: '例：整台主機當機時，主機上的監控也會停止。手機不會收到通知，看起來與正常時相同。改由外部服務每 5 分鐘檢查網站。網站無法連線就通知。',
    gate: '關閉主機上的網站後，手機在 5 分鐘內收到通知。交付第二台主機的決策記錄。', risk: 'Low', model: 'Opus 5.5', status: 'not_started', depends: [],
    before: '待決 2、待決 3',
    what: 'Cloudflare Health Checks 或外部監控；reports/decisions/ 第二台主機（成本、RPO／RTO、搬遷步驟）',
    files: ['agency-os/reports/decisions/'],
    items: [
      todo('C8.1', '外部服務每 5 分鐘檢查網站。網站無法連線就推播通知。'),
      todo('C8.2', '第二台主機的決策記錄列出費用、可接受的停機時間、最多可遺失的資料量與搬遷方式。'),
    ] },
];

// 操作者自己要決定或親手做的（agent 不能替她定）
export const OPEN = [
  { n: 1, what: '在 GitHub 建立只能讀取 Work repo 的 Actions 的密碼。將密碼存入主機設定。', before: 'C5', src: '計畫 §3 R5、C5.3' },
  { n: 2, what: '決定使用 Cloudflare 健康檢查或其他外部監控服務。選用 Cloudflare 前，需確認方案是否支援。', before: 'C8', src: '計畫 C8.1' },
  { n: 3, what: '閱讀決策記錄後，決定是否增設第二台主機。若要增設，再決定時間。', before: 'C8', src: '計畫 C8.2' },
  { n: 4, what: '備份狀態同步要把結果推到 GitHub，但主機的金鑰只能讀取，從 9 月搬機後每天失敗。選一：給這把金鑰寫入權限（主機被入侵時可直接改 main）；或改成主機只把結果存在主機上，筆電來讀（併入「狀態報告改由主機產生」那張卡）。', before: 'C6', src: 'WORKLOG 2026-10-25 續64 M1' },
];
