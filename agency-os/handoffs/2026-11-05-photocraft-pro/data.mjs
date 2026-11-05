// 畫布專業版監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 做法正本：R0-PLAN.md §6（每張卡）；研究正本：agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md。這裡只放「狀態」與「白話」。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '畫布專業版監工台',
  updated: '2026-11-05',
  plan: 'agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md',
  req: 'agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-05',
  self: 'agency-os/handoffs/2026-11-05-photocraft-pro/',
  url: 'https://claude.ai/artifact/SdDBg3KBHF7A4b6ZSBCHGM',
};

export const COPY = {
  sub: '把開源的 PhotoCraft（Photoshop 的重製，工具、面板、快捷鍵都一樣）放進 app.aware-wave.com 當「畫布（專業版）」；AwareWave 獨有而它沒有的功能（AI 去背、AI 去除與生成填色、AI 擴圖、邊緣遮罩、WebP、My Designs、尺寸範本、QR、條碼、Mockup、批次匯出、調色預設）做成右側一條圖示欄，點了才浮出面板；所有通往舊 Canvas Editor 的入口接到新版後，舊的退場，只留一套。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。目前只做完研究與計畫，還沒動任何程式。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事（2026-11-05 查）。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。High 風險步驟（上傳正式站、改 nginx）經你同意才做。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。第一題沒有答案之前，整個案子不動工。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '研究與對照（為什麼選這條路）', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布同一網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', decided: '已定案', files: '檔案', item: '工作', card: '卡', doneAt: '完成於', group: '組', none: '無' },
};

export const NOW = [
  { what: '確認拿到的是真的 PhotoCraft，不是同名假貨。', state: 'yes', ev: 'storytold/photocraft：七萬七千多顆星、Apache-2.0、今天還在更新、官網 getartcraft.com 連到同一個地方。只複製原始碼來讀，沒有下載安裝檔、沒有執行。' },
  { what: 'PhotoCraft 有網頁版，可以放進 app 的頁面裡。', state: 'yes', ev: '原始碼裡有 apps/photocraft-web；官方每版都發網頁版壓縮檔，約十三 MB（向量版是八十九 MB），首次載入會快很多。' },
  { what: '網頁版有現成的介面，讓右側面板能對它下指令（放圖進去、拿圖出來、匯出、存檔）。', state: 'no', ev: '這是和向量版最大的差別：VectorCraft 內建這個介面，PhotoCraft 的網頁版還沒有（main.rs 第 8 行自己寫明）。不過 PhotoCraft 團隊的共用函式庫今天剛合併了現成的兩個模組，PhotoCraft 只差「接上去」這一步。要不要自己先接 → 待決 1。' },
  { what: '介面有繁體中文、能用妳的字型。', state: 'no', ev: '繁中翻譯檔已經有（約三千條）；網頁版預設永遠顯示英文，要由這邊設成繁中。字型不用補丁：把字型檔和一份清單放在網站上，它就會出現在原生字型選單（沿用向量版那份字型清單）。等建置後才看得到實際效果。' },
  { what: 'AwareWave 獨有的功能在專業版裡。', state: 'no', ev: '已逐項對照完：Canvas Editor 的功能大多數 PhotoCraft 原生就有而且更完整；它沒有的全部列進右側圖示欄。向量版已上線的九個面板可以直接共用，另外新做三個點陣專用面板（AI 去除與生成填色、AI 擴圖、邊緣遮罩）。' },
  { what: '從 Studio、塔羅、Banner、我的設計按「在畫布開啟」會進到專業版，舊編輯器退場。', state: 'no', ev: '五個入口都經過同一個函式，改一處就全部接過去（卡 C7）。舊的專案檔只存在妳電腦、伺服器上只有 PNG，所以不需要批次轉檔。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '建置鏈、介面補丁、本機試做', plain: '例：在這台筆電按一個指令，就從 PhotoCraft 原始碼建出可放網站的檔案（含妳的字型）；接上讓面板能下指令的介面；在本機瀏覽器實際試「放圖進去、拿圖出來、換圖、匯出」這幾個動作做不做得到。',
    gate: '一個指令建出網頁版；本機開起來是繁中、能打繁中字；介面回得了資料；五個基本動作各有一組實測過的指令，做不到的列出來回報。', risk: 'Low（只動本機與 scripts/；補丁要先經待決 1 同意）', model: 'Opus 5.5', status: 'not_started', depends: [],
    before: '待決 1 選了「自己先接」才開始',
    decided: '版本釘在固定 commit。建置在 WSL 裡跑。字型清單與向量版共用同一份，不複製。',
    what: '共用建置函式與字型清單抽到 scripts/craft-web-build/；PIN.json＋build.sh；web-host-api.patch 把上游的 craft-web-api 與 craft-web-host 接進網頁殼；theme-tokens.patch 讓編輯器吃 app 主題；本機 smoke 與 ctx 指令序列 spike',
    files: ['scripts/craft-web-build/lib.sh', 'scripts/craft-web-build/fonts.json', 'scripts/photocraft-pro/PIN.json', 'scripts/photocraft-pro/build.sh', 'scripts/photocraft-pro/web-host-api.patch', 'scripts/photocraft-pro/theme-tokens.patch'],
    items: [
      todo('C1.1', '把向量版建置腳本裡可共用的步驟與字型清單搬到共用位置，兩個編輯器用同一份；向量版重建結果不變。'),
      todo('C1.2', '一個建置腳本：抓固定版本的原始碼、套補丁、帶字型、建出網頁版、算校驗碼。'),
      todo('C1.3', '介面補丁：把 PhotoCraft 團隊自己的兩個共用模組接到網頁版，面板才能下指令、收發檔案；同一天送回上游。'),
      todo('C1.4', '主題補丁：讓 PhotoCraft 的畫面跟著 app 的主題顏色走，做法同向量版。'),
      todo('C1.5', '本機開起來實測：繁中、字型、介面，以及放圖、取圖、換圖、匯出、取選取範圍這幾個動作；做不到的回報。'),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '承載（正式站靜態檔）', plain: '例：建好的檔案放到主機一個獨立資料夾，由 nginx 直接供給，不經 next-admin，也不會被每天的自動部署刪掉；換版本只是把 current 指向新資料夾。',
    gate: '瀏覽器開 /photo-pro/current/index.html 回 200；固定檔名的檔不被長時間快取；nginx 容器內看得到檔案。', risk: 'High（上傳正式站、改 nginx 與 compose；走 safe-infra-patch 自動還原）', model: 'fullstack-engineer（Sonnet）；主 session 驗收', status: 'not_started', depends: ['C1'],
    decided: '靜態檔公開供給、頁面本身要登入（同向量版 2026-11-05 的定案）。',
    what: 'rsync dist → 主機；compose 加 nginx 唯讀掛載；nginx 兩個 server block 各加 /photo-pro/ 靜態 location（固定檔名 no-cache、hash 檔一年、不開 gzip_static）；repo 對照檔同步',
    files: ['INFRA/docker-compose.yml', 'INFRA/nginx/default.conf'],
    items: [
      todo('C2.1', '把建好的資料夾上傳主機，建 current 連結，校驗碼比對通過。'),
      todo('C2.2', 'nginx 容器掛上那個資料夾（compose 走安全補丁流程）。'),
      todo('C2.3', 'nginx 加一段只供這個資料夾的設定（走安全補丁流程）。'),
      todo('C2.4', '用 curl 驗：頁面 200、快取設定正確、容器內有檔。'),
    ] },
  { n: 3, code: 'C3', group: 'C', title: 'app 門', plain: '例：側欄多一項「畫布（專業版）」，點了開新分頁、全視窗，就是 Photoshop 的介面；瀏覽器太舊時顯示一行說明。',
    gate: '登入後開 /tools/photo-pro 看得到 PhotoCraft；介面回得了資料；相關測試與型別檢查全綠。', risk: 'Medium（改側欄與產品登記）', model: 'fullstack-engineer（Sonnet）', status: 'not_started', depends: ['C2'],
    decided: '全視窗、開新分頁。頁面外框與向量版共用同一個元件。不動 design.aware-wave.com 的開關。',
    what: 'VectorProFrame 抽成共用 ProEditorFrame；新頁 (full)/tools/photo-pro；next.config rewrite（本機開發用）；側欄、products.ts、staff-tools.ts、public-asset-cache.ts 登記',
    files: ['NA/components/tools/ProEditorFrame.tsx', 'NA/app/(full)/tools/photo-pro/page.tsx', 'NA/next.config.ts', 'NA/app/sidebar-sections.ts', 'NA/lib/portal/products.ts', 'NA/lib/portal/staff-tools.ts', 'NA/lib/public-asset-cache.ts'],
    items: [
      todo('C3.1', '全視窗頁面；外框元件和向量版共用。'),
      todo('C3.2', '本機開發時能把 /photo-pro/ 轉到本機的建置結果。'),
      todo('C3.3', '側欄與產品登記加上「畫布（專業版）」，測試全綠。'),
      todo('C3.4', '上線後登入實測並截圖。'),
    ] },
  { n: 4, code: 'C4', group: 'D', title: '右側圖示欄與面板', plain: '例：PhotoCraft 右邊多一條窄窄的圖示欄，點「去背」就浮出面板，選一個圖層按 AI 去背，那個圖層就換成去背後的樣子；不點的時候不佔畫面。',
    gate: '登入的自動測試把每個面板的主要按鈕按一次，每個都有實際效果；向量版的同一份測試仍然全綠。', risk: 'Medium（改共用層；向量版要保持不變）', model: 'Opus 5.5', status: 'not_started', depends: ['C1', 'C3'],
    before: '待決 2 決定要不要多一個 SVG 面板',
    decided: '一條圖示欄加浮出面板，尺寸照 PhotoCraft 自己的面板；顏色只用 app 主題，不寫死色碼；不用下拉選單；不做字型面板。',
    what: 'dock 外殼搬到 editor-shared 共用；ctx-photocraft.js 轉接器；新面板 ai-fill、outpaint、edge-mask（數學搬到 editor-shared 當唯一正本）；靜態測試與登入 e2e',
    files: ['NA/public/editor-shared/dock.js', 'NA/public/photo-pro-dock/dock.js', 'NA/public/editor-shared/ctx-photocraft.js', 'NA/public/editor-shared/ctx-contract.md', 'NA/public/editor-shared/blocks/ai-fill.js', 'NA/public/editor-shared/blocks/outpaint.js', 'NA/public/editor-shared/blocks/edge-mask.js', 'INFRA/tests/e2e/smoke/06-photo-pro.spec.ts'],
    items: [
      todo('C4.1', '圖示欄外殼改成兩個編輯器共用同一份，各自只帶自己的面板清單與尺寸。'),
      todo('C4.2', '轉接器：把面板的要求翻成 PhotoCraft 的指令；第一次開啟設成繁中。'),
      todo('C4.3', '三個新面板：AI 去除與生成填色、AI 擴圖、邊緣遮罩。'),
      todo('C4.4', '測試：每個面板用到的功能轉接器都有；登入後每個面板按一次都有效果。'),
    ] },
  { n: 5, code: 'C5', group: 'E', title: 'My Designs 存原始檔', plain: '例：在專業版按「存入 My Designs」，除了縮圖，也把含圖層的原始檔一起存；之後從「我的設計」開回來，圖層都還在。',
    gate: '妳在自己的 Chrome：打繁中字、存入、在「我的設計」看到縮圖、再開回來圖層還在。', risk: 'Medium（改設計庫的存檔檢查；不改資料表）', model: 'fullstack-engineer（Sonnet）', status: 'not_started', depends: ['C4'],
    decided: '原始檔用 PhotoCraft 自己的 .pcraft 格式；不改資料表。',
    what: 'design-source.ts 加 .pcraft 與 ZIP 嗅探；My Designs 面板存預覽加原始檔、開啟優先用原始檔',
    files: ['NA/lib/studio/design-source.ts', 'NA/public/editor-shared/blocks/my-designs.js'],
    items: [
      todo('C5.1', '設計庫接受 .pcraft 原始檔（檢查內容真的是這種檔）。'),
      todo('C5.2', 'My Designs 面板：存縮圖加原始檔；開啟時有原始檔就用原始檔。'),
      todo('C5.3', '妳在正式站實際存一次、開一次。'),
    ] },
  { n: 6, code: 'C6', group: 'F', title: '驗收、升級流程、文件', plain: '例：之後 PhotoCraft 出新版，照一份清單改一個版本號、跑一個指令、切一個連結就升級；出問題切回上一版。',
    gate: '自動冒煙測試納入例行檢查；升級與回退步驟寫成文件；可執行示範登記完成。', risk: 'Low', model: 'fullstack-engineer（Sonnet）', status: 'not_started', depends: ['C5'],
    what: '06-photo-pro.spec.ts 納入 /playwright smoke；README 升級段；RUNNABLE_DEMOS 與 ADR_INDEX 各一列；WORKLOG',
    files: ['scripts/photocraft-pro/README.md', 'agency-os/docs/operations/RUNNABLE_DEMOS.md', 'agency-os/docs/architecture/decisions/ADR_INDEX.md'],
    items: [
      todo('C6.1', '登入冒煙測試納入例行檢查。'),
      todo('C6.2', '升級、回退、日後拿掉補丁的步驟寫成文件。'),
      todo('C6.3', '登記可執行示範與決策索引。'),
      todo('C6.4', '工作紀錄與記憶更新。'),
    ] },
  { n: 7, code: 'C7', group: 'G', title: '入口改接、舊編輯器退場', plain: '例：在 Studio 或塔羅按「在畫布開啟」，直接進專業版並帶著那張圖；/tools/canvas 自動跳到專業版，舊頁面刪掉，只剩一套。',
    gate: '五個入口都進到專業版且圖有帶過去；舊網址跳轉；舊頁與相關設定、測試拆乾淨且全綠；還在被別處使用的檔案一個都沒刪。', risk: 'Medium（刪舊頁；改五個工具共用的入口）', model: 'Opus 5.5', status: 'not_started', depends: ['C6'],
    before: '待決 3 決定要不要做舊專案檔匯入',
    decided: '不留兩扇門。妳在正式站用過專業版、說可以之後才拆舊的。調色與去背的共用數學、fabric 套件保留（塔羅印刷與預覽還在用）。',
    what: 'CANVAS_STAFF_HREF 改指新頁、新頁讀交接的圖；門頁改載新元件；舊 .design.json 匯入（選做）；canvas 頁改 redirect、刪 CanvasEditor、搬 fabric-filters、拆側欄與登記、改 e2e 與 drift 測試；文件與記憶',
    files: ['NA/components/tools/canvas-handoff.ts', 'NA/app/design/canvas/page.tsx', 'NA/app/(shell)/tools/canvas/page.tsx', 'NA/app/(shell)/tools/canvas/CanvasEditor.tsx', 'NA/app/sidebar-sections.ts', 'NA/lib/portal/products.ts'],
    items: [
      todo('C7.1', '五個「在畫布開啟」的入口改接到專業版，圖會帶過去。'),
      todo('C7.2', '舊專案檔（.design.json，只存在妳電腦裡）可以匯入成圖層（待決 3 回答有才做）。'),
      todo('C7.3', '舊網址跳轉到專業版；刪舊頁與相關設定、測試改好。'),
      todo('C7.4', '文件與記憶更新。'),
    ] },
];

export const OPEN = [
  { n: 1, before: 'C1', src: '研究報告 §4',
    what: 'PhotoCraft 的網頁版還沒有讓面板下指令的介面。它的團隊已經寫好兩個共用模組（今天剛合併），只是還沒接到 PhotoCraft 上。要怎麼辦？',
    options: [
      { k: '自己先接', pick: true, t: '加一個補丁，把它團隊自己的那兩個模組接上去（約一百到一百五十行，只動網頁版的外殼）；另加一個讓畫面跟著 app 主題走的補丁（做法同向量版）。版本釘住，同一天把補丁送回上游；上游自己接好之後就刪掉補丁。這是補丁，所以要妳點頭。' },
      { k: '等上游', t: '完全不加補丁，等 PhotoCraft 自己接好再開工。上游有四個相關提案都還開著、沒有維護者回覆，時間不確定；這段期間本案停在研究。' },
      { k: '不用介面', t: '只把 PhotoCraft 放進頁面，面板靠妳自己下載再上傳檔案。AI 去背、存入 My Designs、匯出這些都沒辦法一鍵完成，等於「保留原有功能」這條做不到。' },
    ] },
  { n: 2, before: 'C4', src: '研究報告 §3',
    what: '舊 Canvas Editor 有「SVG 下載」，PhotoCraft 沒有 SVG 匯出。要不要在專業版補一個？',
    options: [
      { k: '不補', pick: true, t: '要向量檔就用已上線的向量專業版（同一張設計可以從「我的設計」在兩邊開）。點陣編輯器匯出的 SVG 裡面其實也只是包一張圖。' },
      { k: '補一個面板', t: '多一個面板，把整張畫面包成帶真實公分尺寸的 SVG 下載（文字不會是向量）。' },
    ] },
  { n: 3, before: 'C7', src: '研究報告 §6',
    what: '妳電腦裡有沒有以前從 Canvas Editor 匯出、之後還想再編輯的專案檔（副檔名 .design.json）？伺服器上沒有這種檔，只有妳知道。',
    options: [
      { k: '沒有', pick: true, t: '不做匯入功能。以前存在「我的設計」的圖照常能在專業版開。' },
      { k: '有', t: '做「匯入舊專案」：每個物件變成一個圖層放進去；文字會變成圖，不能再改字。' },
    ] },
];
