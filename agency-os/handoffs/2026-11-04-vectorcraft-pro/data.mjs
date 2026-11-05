// 向量專業版監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 做法正本：R0-PLAN.md §6（每張卡）；研究正本：agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md。這裡只放「狀態」與「白話」。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '向量專業版監工台',
  updated: '2026-11-05',
  plan: 'agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md',
  req: 'agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-04',
  self: 'agency-os/handoffs/2026-11-04-vectorcraft-pro/',
  url: 'https://claude.ai/artifact/GKGxtNsXbW65SDhsHiTqRK',
};

export const COPY = {
  sub: '把開源的 VectorCraft（Illustrator 的完整重製，工具、面板、快捷鍵都一樣）放進 app.aware-wave.com 當「向量（專業版）」；AwareWave 獨有的十項（尺寸範本、Google Fonts 字型、調色、去背、WebP、My Designs、QR、條碼、Mockup、批次匯出）做成第二個 dock 欄，長得跟它的面板一樣；舊設計轉檔後舊編輯器退場，只留一套。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事（2026-11-04 查）。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。High 風險步驟（上傳正式站、改 nginx）經你同意才做。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '研究與對照（為什麼選這條路）', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布同一網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', decided: '已定案', files: '檔案', item: '工作', card: '卡', doneAt: '完成於', group: '組', none: '無' },
};

export const NOW = [
  { what: '在 app.aware-wave.com 用 Illustrator 一樣的工具列、面板、快捷鍵畫向量。', state: 'no', ev: '真品原始碼讀完（2026-11-04）：工具 89/92、Pathfinder 全套、文字轉外框、多畫板都在 code 裡；網頁版有 iframe 用的 window.vectorcraft 介面（apps/vectorcraft-web/src/api.rs:1-17）。還沒建置、沒上線。' },
  { what: '介面與字型是繁體中文。', state: 'no', ev: '介面有 zh-hant（crates/ui-egui/src/i18n/zh-hant.tsv）；字型庫只有簡中 Noto Sans CJK SC，繁中 Noto Sans TC 要在 C1.2 自己加。' },
  { what: 'AwareWave 獨有的十項功能在專業版裡，長在 Illustrator 版面的第二個 dock 欄。', state: 'no', ev: '十項＝尺寸範本、Google Fonts 字型、調色、去背、WebP ≤200KB、My Designs、QR、條碼、Mockup、批次匯出（R0-PLAN §6 C4 對照表）；其餘功能真品原生都有。' },
  { what: '舊的向量設計檔在專業版打得開，舊編輯器退場，只有一套。', state: 'no', ev: 'C7：舊 .design.json 批次匯出成 SVG 存回 My Designs，專業版開 SVG；轉完才拆舊頁。在那之前舊編輯器照常可用（0a24f4c29）。' },
  { what: '本機能建出網頁版。', state: 'no', ev: '本機沒有 rustup／cargo／trunk（2026-11-04 查）；C1.1 安裝。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '建置鏈（本機）', plain: '例：在這台筆電按一個指令，就從 VectorCraft 原始碼建出可放網站的檔案（含繁中字型），並在本機瀏覽器開起來確認。',
    gate: '一個指令建出 dist/<版本>/；本機開 index.html?lang=zh-hant 選單是繁中、能打繁中字、程式介面回得了資料。', risk: 'Low（只動本機與 scripts/）', model: 'Opus 5.5｜已派 session vp-c1-build（2026-11-05）', status: 'not_started', depends: [],
    decided: '版本釘在固定 commit（PIN.json），升級要經 C6 流程。字型加 Noto Sans TC（開源 OFL）。',
    what: 'rustup＋wasm32＋trunk；build.ps1：fetch 原始碼到 repo 外、套 web-fonts patch 與 api addFont patch、加 TC 字型、trunk build、產 SHA256SUMS、預壓 .gz；addFont 補丁同日開上游 PR',
    files: ['scripts/vectorcraft-pro/PIN.json', 'scripts/vectorcraft-pro/build.ps1', 'scripts/vectorcraft-pro/web-fonts.patch', 'scripts/vectorcraft-pro/api-addfont.patch', 'scripts/vectorcraft-pro/README.md'],
    items: [
      todo('C1.1', '筆電裝 Rust 工具鏈與 trunk，前置需求寫進 README。'),
      todo('C1.2', '一個建置腳本：抓固定版本的原始碼、加繁中字型、建出網頁版、算校驗碼、預先壓縮。'),
      todo('C1.3', '本機開起來：繁中選單、能打繁中字、介面回得了資料，截圖存進 README。'),
      todo('C1.4', '加一個「載入字型檔」的介面（約 15 行，補丁＋送回上游），讓字型面板能把 Google Fonts 字型塞進去。'),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '承載（正式站靜態檔）', plain: '例：建好的檔案放到主機一個獨立資料夾，由 nginx 直接供給，不經 next-admin，也不會被每天的自動部署刪掉；換版本只是把 current 指向新資料夾。',
    gate: '瀏覽器開 /vector-pro/current/index.html 回 200；wasm 以 gzip 送出並標對型別；nginx 容器內看得到檔案。', risk: 'High（上傳正式站、改 nginx 與 compose；走 safe-infra-patch 自動還原）', model: 'Opus 5.5', status: 'not_started', depends: [], before: '待決 1',
    decided: '放 /root/lobster-phase1/static/vector-pro/<版本>/ 加 current 連結；不放 apps/ 樹（sg-deploy 的 --delete 會刪）。',
    what: 'rsync dist → 主機；compose 加 nginx 唯讀掛載；nginx 加 /vector-pro/ 靜態 location（wasm mime、gzip_static、hash 檔 immutable、index no-cache）；repo 對照檔同步',
    files: ['INFRA/docker-compose.yml', 'INFRA/nginx/default.conf'],
    items: [
      todo('C2.1', '把建好的資料夾上傳主機，建 current 連結，校驗碼比對通過。'),
      todo('C2.2', 'nginx 容器掛上那個資料夾（compose 走安全補丁流程）。'),
      todo('C2.3', 'nginx 加一段只供這個資料夾的設定（走安全補丁流程）。'),
      todo('C2.4', '用 curl 驗：頁面 200、wasm 型別與壓縮正確、容器內有檔。'),
    ] },
  { n: 3, code: 'C3', group: 'C', title: 'app 門', plain: '例：側欄「設計編輯器」多一項「向量（專業版）」，點開就是 Illustrator 介面；瀏覽器太舊時給一行說明並連回快速出稿。',
    gate: '登入後開 /tools/vector-pro 看到 VectorCraft；本機開發也能開（轉到 trunk serve）；產品登記測試全綠。', risk: 'Medium（改 products.ts 登記；頁面本身是 iframe）', model: 'Opus 5.5｜已派 session vp-c3-door（2026-11-05，先做 C3.1–C3.3，C3.4 等 C2）', status: 'not_started', depends: ['C2'],
    decided: '全視窗開新分頁（操作者 2026-11-05：嵌在側欄旁可操作版面太小）：頁面放無側欄區，側欄連結開新分頁，登入照管。門的架構照 ADR 018：員工門＝app 這一頁；客戶門＝將來啟用既有的產品子網域 door（同一 next-admin、host 路由、products.ts 一列），不另建站；塔羅／studio／mockup 銜接走同 app 的 API 與 My Designs，不跨源。',
    what: '無側欄區 app/(full)/tools/vector-pro/page.tsx（iframe＋右欄 dock 100vh）＋WebGL 偵測＋NOTICE 連結；側欄連結 target=_blank；next.config 開發用 rewrite；products.ts nav／staffPaths；tsc＋四個測試',
    files: ['NA/app/(shell)/tools/vector-pro/page.tsx', 'NA/next.config.*', 'NA/lib/portal/products.ts'],
    items: [
      todo('C3.1', '無側欄全視窗頁嵌入專業版，側欄點開新分頁；失敗時給說明與回舊編輯器的連結。'),
      todo('C3.2', '本機開發時把 /vector-pro/ 轉到本機建置伺服器，正式站不受影響。'),
      todo('C3.3', '設計編輯器的側欄加「向量（專業版）」，登記與權限測試全綠。'),
      todo('C3.4', '正式站登入實開一次，介面回得了資料，截圖存紀錄。'),
    ] },
  { n: 4, code: 'C4', group: 'D', title: '第二 dock 欄：AwareWave 獨有的十個面板', plain: '例：畫面就是 Illustrator，右邊多一欄面板，顏色、分頁高度、收合方式都跟它的面板一樣；裡面是尺寸範本、字型、調色、去背、WebP、My Designs、QR、條碼、Mockup、批次匯出。真品本來就有的（描圖、弧形文字、裁切標記…）直接用它的。',
    gate: '十個面板都在第二欄且外觀與真品面板一致（截圖並排）；調色與去背對一張選取的圖真的換圖且位置大小不變；字型面板搜到的 Google Fonts 能套到文字；測試守住十個面板清單與色值。', risk: 'Medium（新頁面；C4.3 換圖先做 spike，做不到就改契約）', model: 'Opus 5.5＋Sonnet｜已派 session vp-c4-dock（外殼＋轉接器）與 vp-c4-blocks（十面板搬移）（2026-11-05）', status: 'not_started', depends: ['C3'],
    decided: '不 fork 加 Rust 面板（面板要用網路與 HTML，egui 放不下；上游說 panel plugins 不在 v1）。調色與去背的數學仍是 CARD-05 與 CARD-06 的同一份模組，不複製。',
    what: 'dock.js＋theme.css（色值抽自 theme.rs 四組；分頁 33、欄寬 310、圖示欄 38）；blocks/ 十檔；ctx-contract.md＋ctx-vectorcraft.js（placeSvg／placeImage／selectedImage／replaceImage／exportArtboard／addFont／saveAs）；dock 測試＋契約測試＋色值抽樣測試',
    files: ['NA/public/vector-pro/dock.js', 'NA/public/vector-pro/theme.css', 'NA/public/editor-shared/blocks/', 'NA/public/editor-shared/ctx-contract.md', 'NA/public/editor-shared/ctx-vectorcraft.js', 'NA/lib/studio/__tests__/vector-pro-dock.test.ts'],
    items: [
      todo('C4.1', '第二 dock 欄：與 Illustrator 畫面並排、同色同尺寸、可收成圖示欄。'),
      todo('C4.2', '十個面板各一個模組；六個從舊編輯器原樣搬，調色與去背沿用同一份數學。'),
      todo('C4.3', '面板與編輯器之間的契約與轉接器；先用一張圖驗證「換圖後位置大小不變」。'),
      todo('C4.4', '測試：面板清單、轉接器每個方法、色值抽樣。'),
    ] },
  { n: 5, code: 'C5', group: 'E', title: '繁中與存檔', plain: '例：打開就是 Essentials Classic 工作區（上方有控制列）；打繁中字不缺字；按「存入 My Designs」在「我的設計」看得到，檔案可再開。',
    gate: '繁中字截圖無缺字；存入後「我的設計」有縮圖；下載回來的檔可在專業版再開。', risk: 'Low（只用既有 designs API，不改 schema）', model: 'Opus 5.5', status: 'not_started', depends: ['C4'],
    what: '首次載入切 Essentials Classic（之後尊重偏好）；my-designs 積木在 pro ctx：saveAs .vectorcraft＋PNG 預覽 → 既有 /api/tools/designs',
    files: ['NA/public/vector-pro-toolbox.js', 'NA/public/editor-shared/blocks/my-designs.js'],
    items: [
      todo('C5.1', '預設工作區切成 Essentials Classic，只在第一次。'),
      todo('C5.2', '存入 My Designs：原檔加縮圖，用既有 API，不改資料表。'),
      todo('C5.3', '實測：打繁中字、存入、看到縮圖、下載再開。'),
    ] },
  { n: 6, code: 'C6', group: 'F', title: '驗收、升級流程、文件', plain: '例：VectorCraft 出新版時，改一個版本號、跑建置、跑 smoke、上傳、切 current；壞了切回上一版。每天 smoke 會確認專業版還開得起來。',
    gate: 'playwright smoke 有這一條且綠；README 寫清升級與回退；RUNNABLE_DEMOS 有一條；WORKLOG 有機械證據。', risk: 'Low', model: 'fullstack-engineer（Sonnet）', status: 'not_started', depends: ['C5'],
    what: 'e2e smoke（swiftshader）；README 升級段；RUNNABLE_DEMOS＋ADR_INDEX 一列；WORKLOG 四行',
    files: ['INFRA/tests/e2e/', 'scripts/vectorcraft-pro/README.md', 'agency-os/docs/operations/RUNNABLE_DEMOS.md', 'agency-os/docs/architecture/decisions/ADR_INDEX.md'],
    items: [
      todo('C6.1', '自動 smoke：開專業版頁、介面回得了資料。'),
      todo('C6.2', 'README 寫升級與回退步驟，保留最近兩版。'),
      todo('C6.3', '登記可跑的示範與決策索引。'),
      todo('C6.4', '工作紀錄四行證據。'),
    ] },
  { n: 7, code: 'C7', group: 'G', title: '舊設計轉檔、舊編輯器退場', plain: '例：以前在舊編輯器存的設計，在專業版的 My Designs 面板一樣打得開；轉完之後 /tools/vector-editor 自動跳到專業版，舊頁面刪掉，只剩一套。',
    gate: '舊設計轉檔數＝原數量；專業版開舊設計物件數與 SVG 一致；舊網址跳轉；舊頁、白名單、登記、相關測試都拆乾淨且全綠。', risk: 'Medium（刪舊頁；轉檔若要加欄位則 migration High）', model: 'Opus 5.5', status: 'not_started', depends: ['C6'],
    decided: '不留兩扇門。點陣的 Canvas Editor 不受影響。',
    what: 'convert-designs.mjs（playwright 用舊頁匯出 SVG 存回）；My Designs 面板開 SVG；vector-editor 頁改 redirect、刪 html、拆白名單與登記、改 e2e 與 drift 測試；文件與記憶',
    files: ['scripts/vectorcraft-pro/convert-designs.mjs', 'NA/app/(shell)/tools/vector-editor/page.tsx', 'NA/middleware.ts', 'NA/public/vector-editor.html', 'NA/lib/portal/products.ts'],
    items: [
      todo('C7.1', '把舊設計批次匯出成 SVG 存回 My Designs，數量對得上。'),
      todo('C7.2', '專業版的 My Designs 面板打得開舊設計。'),
      todo('C7.3', '舊網址跳轉到專業版；刪舊頁與相關設定、測試改好。'),
      todo('C7.4', '文件與記憶更新。'),
    ] },
];

export const OPEN = [
  { n: 1, before: 'C2', what: 'VectorCraft 的網頁檔（約 7 MB，開源軟體本體，不含任何資料）由 nginx 直接供給，不經登入；只有「向量（專業版）」頁面本身要登入。可以嗎？',
    detail: '不公開的做法是讓 next-admin 檢查登入後再轉送 17.5 MB 檔案，每次開頁都經過 Node，慢且沒有實質保護（軟體本來就開源）。',
    options: [{ k: '可以', t: '靜態檔由 nginx 公開供給；頁面要登入。', pick: true }, { k: '不行', t: '經 next-admin 檢查登入後轉送，每次開頁經 Node。' }], src: 'R0-PLAN.md §3 R5' },
];
