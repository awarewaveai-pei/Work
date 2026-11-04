// 向量專業版監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 做法正本：R0-PLAN.md §6（每張卡）；研究正本：agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md。這裡只放「狀態」與「白話」。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。

export const META = {
  title: '向量專業版監工台',
  updated: '2026-11-04',
  plan: 'agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md',
  req: 'agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-04',
  self: 'agency-os/handoffs/2026-11-04-vectorcraft-pro/',
  url: 'https://claude.ai/artifact/GKGxtNsXbW65SDhsHiTqRK',
};

export const COPY = {
  sub: '把開源的 VectorCraft（Illustrator 的完整重製，工具、面板、快捷鍵都一樣）放進 app.aware-wave.com 當「向量（專業版）」；現有的 QR、條碼、Mockup、批次匯出、AI 去背、My Designs 做成共用積木掛在旁邊；舊的向量編輯器留著當快速出稿。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
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
  { what: 'QR、條碼、Mockup、批次匯出、AI 去背、存入 My Designs 在專業版裡也能用。', state: 'no', ev: '六個積木現在寫死在 public/vector-editor.html 內；C4 抽成共用模組、兩邊各一個轉接器。' },
  { what: '舊的向量編輯器（快速出稿）照常可用。', state: 'yes', ev: 'CARD-01～05 已上線（0a24f4c29）；本計畫不改它的行為，只在 C4.1 把積木搬成模組後原樣載回。' },
  { what: '本機能建出網頁版。', state: 'no', ev: '本機沒有 rustup／cargo／trunk（2026-11-04 查）；C1.1 安裝。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '建置鏈（本機）', plain: '例：在這台筆電按一個指令，就從 VectorCraft 原始碼建出可放網站的檔案（含繁中字型），並在本機瀏覽器開起來確認。',
    gate: '一個指令建出 dist/<版本>/；本機開 index.html?lang=zh-hant 選單是繁中、能打繁中字、程式介面回得了資料。', risk: 'Low（只動本機與 scripts/）', model: 'Opus 5.5', status: 'not_started', depends: [],
    decided: '版本釘在固定 commit（PIN.json），升級要經 C6 流程。字型加 Noto Sans TC（開源 OFL）。',
    what: 'rustup＋wasm32＋trunk；build.ps1：fetch 原始碼到 repo 外、套 web-fonts patch、加 TC 字型、trunk build、產 SHA256SUMS、預壓 .gz',
    files: ['scripts/vectorcraft-pro/PIN.json', 'scripts/vectorcraft-pro/build.ps1', 'scripts/vectorcraft-pro/web-fonts.patch', 'scripts/vectorcraft-pro/README.md'],
    items: [
      todo('C1.1', '筆電裝 Rust 工具鏈與 trunk，前置需求寫進 README。'),
      todo('C1.2', '一個建置腳本：抓固定版本的原始碼、加繁中字型、建出網頁版、算校驗碼、預先壓縮。'),
      todo('C1.3', '本機開起來：繁中選單、能打繁中字、介面回得了資料，截圖存進 README。'),
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
    gate: '登入後開 /tools/vector-pro 看到 VectorCraft；本機開發也能開（轉到 trunk serve）；產品登記測試全綠。', risk: 'Medium（改 products.ts 登記；頁面本身是 iframe）', model: 'Opus 5.5', status: 'not_started', depends: ['C2'],
    what: 'page.tsx iframe＋WebGL 偵測＋NOTICE 連結；next.config 開發用 rewrite；products.ts nav／staffPaths；tsc＋四個測試',
    files: ['NA/app/(shell)/tools/vector-pro/page.tsx', 'NA/next.config.*', 'NA/lib/portal/products.ts'],
    items: [
      todo('C3.1', '新頁面嵌入專業版，失敗時給說明與回舊編輯器的連結。'),
      todo('C3.2', '本機開發時把 /vector-pro/ 轉到本機建置伺服器，正式站不受影響。'),
      todo('C3.3', '設計編輯器的側欄加「向量（專業版）」，登記與權限測試全綠。'),
      todo('C3.4', '正式站登入實開一次，介面回得了資料，截圖存紀錄。'),
    ] },
  { n: 4, code: 'C4', group: 'D', title: '積木共用層（LEGO）', plain: '例：QR 積木只寫一份，放在舊編輯器會畫進 Fabric 畫布，放在專業版會送進 VectorCraft 畫布；以後新積木也只寫一份。',
    gate: '六個積木搬成模組後，舊編輯器行為不變（既有 smoke 綠）；專業版右側工具箱列出同樣六個積木；兩邊積木清單相等有測試守著。', risk: 'Medium（動舊編輯器載入方式；行為不變）', model: 'Opus 5.5', status: 'not_started', depends: ['C3'],
    decided: '積木契約六個方法（addSvg、grabDesign、info、busy、mm2px/px2mm、snapshot）寫成 30 行以內的 ctx-contract.md；兩個轉接器各一檔。',
    what: 'blocks/<id>.js 六檔原樣搬；ctx-contract.md；ctx-vectorcraft.js（openFile／app.export／captureDownloads）；ctx-fabric.js 導出既有 ctx；vector-pro-toolbox.js 右側 310px；parity 測試＋契約測試',
    files: ['NA/public/editor-shared/blocks/', 'NA/public/editor-shared/ctx-contract.md', 'NA/public/editor-shared/ctx-vectorcraft.js', 'NA/public/editor-shared/ctx-fabric.js', 'NA/public/vector-pro-toolbox.js', 'NA/lib/studio/__tests__/editor-blocks-parity.test.ts'],
    items: [
      todo('C4.1', '六個積木從舊編輯器搬成獨立模組，舊編輯器原樣載回，行為不變。'),
      todo('C4.2', '寫下積木與編輯器之間的契約，做專業版與舊編輯器各一個轉接器。'),
      todo('C4.3', '專業版右側工具箱，列出六個積木。'),
      todo('C4.4', '測試：兩邊積木清單相等；專業版轉接器六個方法各一條。'),
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
    what: 'e2e smoke（swiftshader）；README 升級段；RUNNABLE_DEMOS＋ADR_INDEX 一列；WORKLOG 四行；舊頁註解一行',
    files: ['INFRA/tests/e2e/', 'scripts/vectorcraft-pro/README.md', 'agency-os/docs/operations/RUNNABLE_DEMOS.md', 'agency-os/docs/architecture/decisions/ADR_INDEX.md'],
    items: [
      todo('C6.1', '自動 smoke：開專業版頁、介面回得了資料。'),
      todo('C6.2', 'README 寫升級與回退步驟，保留最近兩版。'),
      todo('C6.3', '登記可跑的示範與決策索引。'),
      todo('C6.4', '工作紀錄四行證據；舊編輯器頁註明「快速出稿；專業版在 tools/vector-pro」。'),
    ] },
];

export const OPEN = [
  { n: 1, before: 'C2', what: 'VectorCraft 的網頁檔（約 7 MB，開源軟體本體，不含任何資料）由 nginx 直接供給，不經登入；只有「向量（專業版）」頁面本身要登入。可以嗎？',
    detail: '不公開的做法是讓 next-admin 檢查登入後再轉送 17.5 MB 檔案，每次開頁都經過 Node，慢且沒有實質保護（軟體本來就開源）。',
    options: [{ k: '可以', t: '靜態檔由 nginx 公開供給；頁面要登入。', pick: true }, { k: '不行', t: '經 next-admin 檢查登入後轉送，每次開頁經 Node。' }], src: 'R0-PLAN.md §3 R5' },
];
