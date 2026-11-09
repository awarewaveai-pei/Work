// 畫布專業版監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 做法正本：R0-PLAN.md §6（每張卡）；研究正本：agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md。這裡只放「狀態」與「白話」。
// items = 計畫 §6 的每一列（check.mjs 驗一一對應）；完成一項就改 done＋commit，卡片狀態跟著算。
// 發布：supervisor.html 是片段；前面加 <!DOCTYPE html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"> 另存後，用 claude-artifacts publish_files 發到 META.slug（base_version 先用 get_artifact 讀）。

export const META = {
  title: '畫布專業版監工台',
  updated: '2026-11-09',
  plan: 'agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md',
  req: 'agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-05',
  self: 'agency-os/handoffs/2026-11-05-photocraft-pro/',
  url: 'https://claude.ai/artifact/SdDBg3KBHF7A4b6ZSBCHGM',
  slug: 'cf82c03a-35c6-49d9-9001-2d5050d79532',
};

export const COPY = {
  sub: '把開源的 PhotoCraft（Photoshop 的重製，工具、面板、快捷鍵都一樣）放進 app.aware-wave.com 當「畫布（專業版）」；AwareWave 有而它沒有的功能做成右側一條圖示欄，點了才浮出面板；Studio、塔羅、Banner、Mockup、我的設計都能一鍵把圖送進來改；舊 Canvas Editor 最後退場，只留一套。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。目前只有研究與計畫，還沒動任何程式。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前已做到與還沒做到的事（2026-11-05 查）。' },
  steps: { h: '卡片與工作', lead: '依編號進行。每張卡列出所有工作，勾選代表完成。High 風險步驟（上傳正式站、改 nginx）經你同意才做。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '需在第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每項工作的做法', req: '研究與對照（為什麼選這條路）', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布同一網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', decided: '已定案', files: '檔案', item: '工作', card: '卡', doneAt: '完成於', group: '組', none: '無' },
};

export const NOW = [
  { what: '確認拿到的是真的 PhotoCraft，不是同名假貨。', state: 'yes', ev: 'storytold/photocraft：七萬七千多顆星、Apache-2.0、今天還在更新、官網 getartcraft.com 連到同一個地方。只複製原始碼來讀，沒有下載安裝檔、沒有執行。' },
  { what: 'PhotoCraft 有網頁版，可以放進 app 的頁面裡。', state: 'yes', ev: '2026-11-06 已放上正式站：app.aware-wave.com/photo-pro/current/ 開得起來（14 MB 分段檔、一年快取；其餘每次重新確認）。頁面與側欄入口還沒合併上線。' },
  { what: '舊 Canvas Editor 的每個功能，在專業版都有著落。', state: 'yes', ev: '舊編輯器全部按鈕與控制項逐一比對過：大多數 PhotoCraft 原生就有而且更完整（調整、濾鏡、文字、形狀、圖層、印刷用 PDF、另存與換格式）；它沒有的全部排進右側面板。有三項做法會變：上傳字型改成建置時加進字型庫；調色要能回頭改請用原生的調整圖層；舊專案檔換成 PhotoCraft 的格式。' },
  { what: '右側面板能對 PhotoCraft 下指令（放圖進去、拿圖出來、匯出、存檔）。', state: 'yes', ev: 'W1 已把 PhotoCraft 團隊自己的介面接上（一個只動網頁外殼的補丁，上游 PR 草稿已寫、未送出），本機實測可以下指令。' },
  { what: '放圖進圖層、取出圖層的圖、換掉圖層的圖，這幾個動作做得到。', state: 'yes', ev: 'W1 本機實測全部做得到：開檔、匯出、放 SVG、放圖片、取圖層的圖、換圖層的圖（位置與順序不變）、選取轉遮罩、按 Q 塗出範圍、符合／填滿畫布。兩點差異已交給下一張卡：按 Q 塗的地方預設是「不選」，要反過來；換圖時圖層樣式不會帶過去。My Designs 的原始檔改存 .psd（網頁版存不出 PhotoCraft 自己的格式）。' },
  { what: '從 Studio、塔羅、Banner、Mockup、我的設計按一下就進專業版改圖；改完可以存入 My Designs、另存、換格式、匯出。', state: 'yes', ev: '2026-11-06 上線（85c27aaa4）：五個入口的「在畫布編輯」都進專業版，有原始檔的開原始檔；交接改成開成功才清，開不起來會顯示訊息。另存、換格式、匯出用 PhotoCraft 自己的選單，下載到電腦。等妳登入實際試一次（C3.4、C5.3）。' },
  { what: 'AI 去除／生成填色／擴圖像 Photoshop：只送選取範圍周圍一塊、全解析度生成、羽化貼回；每顆模型鈕都標 NT$。', state: 'yes', ev: '2026-11-09（妳：「生成圖片有問題，無法像真正的 Photoshop」）：以前整張送出、模型最多回 1440 px 再拉回、硬邊貼回；現在裁切＋羽化。生成填色三個模型：FLUX Fill Pro NT$1.6、Ideogram 4.5 Edit NT$1.9、GPT-Image-2.6 約 NT$1.5；去除 Bria Eraser NT$1.3；擴圖多了 Bria Expand NT$1.3（畫布尺寸精準、不再對位）。prompt 可留空＝照周圍補。五條路徑各真打一張都成功；Bria GenFill 試過填成灰塊，不收。' },
  { what: '介面是繁體中文、用妳的字型。', state: 'yes', ev: 'W1 本機實測：開啟時自動切成繁中選單（之後尊重使用者自己改的語言），打繁中字用到 Noto Sans TC／Noto Serif TC；字型沿用向量版那份清單，不用補丁。PhotoCraft 的畫面用它自己的深色或淺色，不套 app 主題；右側圖示欄跟著 app 主題。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });

export const STEPS = [
  { n: 1, code: 'C1', group: 'A', title: '建置鏈、介面、本機試做', plain: '例：在這台筆電按一個指令，就從 PhotoCraft 原始碼建出可放網站的檔案（含妳的字型）；接上讓面板能下指令的介面；在本機瀏覽器實際試「放圖進去、拿圖出來、換圖、匯出」做不做得到。',
    gate: '一個指令建出網頁版；本機開起來是繁中、能打繁中字；介面回得了資料；每個基本動作都有一組實測過的指令，做不到的列出來回報。', risk: 'Low（只動本機與 scripts/）', model: 'Opus 5.5｜工人 W1', status: 'done', commit: '2d94cb844', depends: [],
    decided: '介面用 PhotoCraft 團隊自己的兩個共用模組，不自創、不另寫一份網頁外殼。動工時上游已內建就零補丁；否則釘一個只動網頁外殼的接線補丁並送回上游，上游內建後刪掉。補丁套不上時建置會停，正式站維持原版。PhotoCraft 用自己的深色或淺色，不套 app 主題，所以不需要主題補丁。版本釘在固定 commit；建置在 WSL；字型清單與向量版共用同一份。',
    what: '共用建置函式與字型清單抽到 scripts/craft-web-build/；PIN.json＋build.sh；web-host-api.patch（craft-web-api＋craft-web-host 接進網頁殼）；本機 smoke 與 ctx 指令序列 spike',
    files: ['scripts/craft-web-build/lib.sh', 'scripts/craft-web-build/fonts.json', 'scripts/photocraft-pro/PIN.json', 'scripts/photocraft-pro/build.sh', 'scripts/photocraft-pro/web-host-api.patch'],
    items: [
      done('C1.1', '把向量版建置腳本裡可共用的步驟與字型清單搬到共用位置，兩個編輯器用同一份；向量版重建結果不變。', '2d94cb844'),
      done('C1.2', '一個建置腳本：抓固定版本的原始碼、套補丁、帶字型、建出網頁版、算校驗碼。', '2d94cb844'),
      done('C1.3', '介面：先看上游是否已內建；沒有才加接線補丁，同一天送回上游。', '2d94cb844'),
      done('C1.4', '本機開起來實測：繁中、字型、介面，以及放圖、取圖、換圖、匯出、取選取範圍、符合畫布這幾個動作；做不到的回報。', '2d94cb844'),
    ] },
  { n: 2, code: 'C2', group: 'B', title: '承載（正式站靜態檔）', plain: '例：建好的檔案放到主機一個獨立資料夾，由 nginx 直接供給，不經 next-admin，也不會被每天的自動部署刪掉；換版本只是把 current 指向新資料夾。',
    gate: '瀏覽器開 /photo-pro/current/index.html 回 200；檔名帶雜湊的檔才長時間快取，其餘每次都重新確認；nginx 容器內看得到檔案。', risk: 'High（上傳正式站、改 nginx 與 compose；走 safe-infra-patch 自動還原）', model: 'fullstack-engineer（Sonnet）；主 session 驗收', status: 'done', commit: 'c9c7e3bb1', depends: ['C1'],
    decided: '靜態檔公開供給、頁面本身要登入（同向量版 2026-11-05 的定案）。',
    what: 'rsync dist → 主機；compose 加 nginx 唯讀掛載；nginx 兩個 server block 各加 /photo-pro/ 靜態 location（預設 expires -1，只有帶雜湊的檔與分段檔一年；不開 gzip_static）；repo 對照檔同步',
    files: ['INFRA/docker-compose.yml', 'INFRA/nginx/default.conf'],
    items: [
      done('C2.1', '把建好的資料夾上傳主機，建 current 連結，校驗碼比對通過。', 'c9c7e3bb1'),
      done('C2.2', 'nginx 容器掛上那個資料夾（compose 走安全補丁流程）。', 'c9c7e3bb1'),
      done('C2.3', 'nginx 加一段只供這個資料夾的設定（走安全補丁流程）。', 'c9c7e3bb1'),
      done('C2.4', '用 curl 驗：頁面 200、快取設定正確、容器內有檔。', 'c9c7e3bb1'),
    ] },
  { n: 3, code: 'C3', group: 'C', title: 'app 門', plain: '例：側欄多一項「畫布（專業版）」，點了開新分頁、全視窗，就是 Photoshop 的介面；瀏覽器太舊時顯示一行說明。',
    gate: '登入後開 /tools/photo-pro 看得到 PhotoCraft；介面回得了資料；相關測試與型別檢查全綠；向量專業版照常。', risk: 'Medium（改側欄與產品登記；向量頁改用共用外框）', model: 'Opus 5.5｜工人 W2（C3.1–C3.3 先寫好，C2 上線後才併入正式版）', status: 'in_progress', depends: ['C2'],
    decided: '全視窗、開新分頁。頁面外框與向量版共用同一個元件。不動 design.aware-wave.com 的開關。',
    what: 'VectorProFrame 抽成共用 ProEditorFrame；新頁 (full)/tools/photo-pro；next.config rewrite（本機開發用）；側欄、products.ts、staff-tools.ts、public-asset-cache.ts 登記',
    files: ['NA/components/tools/ProEditorFrame.tsx', 'NA/app/(full)/tools/photo-pro/page.tsx', 'NA/next.config.ts', 'NA/app/sidebar-sections.ts', 'NA/lib/portal/products.ts', 'NA/lib/portal/staff-tools.ts', 'NA/lib/public-asset-cache.ts'],
    items: [
      done('C3.1', '全視窗頁面；外框元件和向量版共用。', '2d94cb844'),
      done('C3.2', '本機開發時能把 /photo-pro/ 轉到本機的建置結果。', '2d94cb844'),
      done('C3.3', '側欄與產品登記加上「畫布（專業版）」，測試全綠。', '2d94cb844'),
      todo('C3.4', '上線後登入實測並截圖。'),
    ] },
  { n: 4, code: 'C4', group: 'D', title: '右側圖示欄與面板', plain: '例：PhotoCraft 右邊多一條窄窄的圖示欄，點「去背」就浮出面板，選一個圖層按 AI 去背，那個圖層就換成去背後的樣子；不點的時候不佔畫面。',
    gate: '登入的自動測試把每個面板的主要按鈕按一次，每個都有實際效果；用 PhotoCraft 自己的「匯出」時瀏覽器真的收到檔案；向量版的同一份測試仍然全綠。', risk: 'Medium（改共用層；向量版要保持不變）', model: 'Opus 5.5｜C4.1 工人 W2、C4.3 工人 W3、C4.2 與 C4.4 等 C1 試做結果', status: 'done', commit: '85c27aaa4', depends: ['C1', 'C3'],
    decided: '只做 PhotoCraft 沒有的：尺寸範本（含符合、填滿畫布）、調色預設、去背、AI 去除與生成填色、AI 擴圖、邊緣遮罩、WebP、My Designs、QR、條碼、Mockup、批次匯出。不做「轉存」面板（和 WebP 面板、原生匯出、My Designs 重複）。不做 SVG 匯出面板（妳 2026-11-06 定案：要向量檔用向量專業版）。不做字型面板。一條圖示欄加浮出面板，尺寸照 PhotoCraft 自己的面板；顏色只用 app 主題；不用下拉選單。',
    what: 'dock 外殼搬到 editor-shared 共用；ctx-photocraft.js 轉接器（含原生另存的代為下載、ctx.host）；面板 ai-fill、genfx、edge-mask 照舊搬（數學與預設搬到 editor-shared 當唯一正本）；靜態測試與登入 e2e',
    files: ['NA/public/editor-shared/dock.js', 'NA/public/photo-pro-dock/dock.js', 'NA/public/editor-shared/ctx-photocraft.js', 'NA/public/editor-shared/ctx-contract.md', 'NA/public/editor-shared/blocks/ai-fill.js', 'NA/public/editor-shared/blocks/genfx.js', 'NA/public/editor-shared/blocks/edge-mask.js', 'INFRA/tests/e2e/smoke/06-photo-pro.spec.ts'],
    items: [
      done('C4.1', '圖示欄外殼改成兩個編輯器共用同一份，各自只帶自己的面板清單與尺寸。', '2d94cb844'),
      done('C4.2', '轉接器：把面板的要求翻成 PhotoCraft 的指令；第一次開啟設成繁中；PhotoCraft 自己的「另存、匯出」照常下載到電腦。', '85c27aaa4'),
      done('C4.3', '三個面板照舊編輯器原樣搬：去除／生成填色（AI）、擴圖／色調分離、邊緣遮罩（筆刷邊）；只差在要改的範圍改用 PhotoCraft 的選取或按 Q 用它的筆刷塗。', '2d94cb844'),
      done('C4.4', '測試：每個面板用到的功能轉接器都有；登入後每個面板按一次都有效果。', '85c27aaa4'),
    ] },
  { n: 5, code: 'C5', group: 'E', title: 'My Designs 存原始檔', plain: '例：在專業版按「存入 My Designs」，除了縮圖，也把含圖層的原始檔一起存；之後從「我的設計」開回來，圖層都還在；在 Mockup 工具也選得到這張。',
    gate: '妳在自己的 Chrome：打繁中字、存入、在「我的設計」看到縮圖、在 Mockup 工具選得到、再開回來圖層還在。', risk: 'Medium（改設計庫的存檔檢查與共用的 My Designs 面板；不改資料表）', model: 'Sonnet｜工人 W4（C5.1–C5.2 先寫好）', status: 'in_progress', depends: ['C4'],
    decided: '原始檔用 PhotoCraft 自己的 .pcraft 格式；存檔的分類沿用舊 Canvas Editor 的值，所以其他工具看到的不變；不改資料表。',
    what: 'design-source.ts 加 .pcraft 與 ZIP 嗅探；my-designs.js 寫死的向量值改讀 ctx.host',
    files: ['NA/lib/studio/design-source.ts', 'NA/public/editor-shared/blocks/my-designs.js'],
    items: [
      done('C5.1', '設計庫接受 .pcraft 原始檔（檢查內容真的是這種檔）。', '2d94cb844'),
      done('C5.2', 'My Designs 面板改成兩個編輯器各用各的設定；存縮圖加原始檔；開啟時有原始檔就用原始檔。', '2d94cb844'),
      todo('C5.3', '妳在正式站實際存一次、開一次，並在 Mockup 工具選一次。'),
    ] },
  { n: 6, code: 'C6', group: 'F', title: '驗收、升級流程、文件', plain: '例：之後 PhotoCraft 出新版，照一份清單改一個版本號、跑一個指令、切一個連結就升級；出問題切回上一版。',
    gate: '自動冒煙測試納入例行檢查；升級、回退、加字型的步驟寫成文件；可執行示範登記完成。', risk: 'Low', model: 'fullstack-engineer（Sonnet）', status: 'not_started', depends: ['C5'],
    what: '06-photo-pro.spec.ts 納入 /playwright smoke；README；RUNNABLE_DEMOS 與 ADR_INDEX 各一列；WORKLOG',
    files: ['scripts/photocraft-pro/README.md', 'agency-os/docs/operations/RUNNABLE_DEMOS.md', 'agency-os/docs/architecture/decisions/ADR_INDEX.md'],
    items: [
      todo('C6.1', '登入冒煙測試納入例行檢查。'),
      todo('C6.2', '升級、回退、日後拿掉補丁、加一個新字型的步驟寫成文件。'),
      todo('C6.3', '登記可執行示範與決策索引。'),
      todo('C6.4', '工作紀錄與記憶更新。'),
    ] },
  { n: 7, code: 'C7', group: 'G', title: '入口改接、舊編輯器退場', plain: '例：在 Studio、塔羅、Banner、Mockup 或我的設計按「在畫布編輯」，直接進專業版並帶著那張圖；/tools/canvas 自動跳到專業版，舊頁面刪掉，只剩一套。',
    gate: '每個入口（Studio、塔羅、Banner、Mockup、我的設計）都進到對的編輯器且圖有帶過去；舊網址跳轉；舊頁與相關設定、測試拆乾淨且全綠；還在被別處使用的檔案一個都沒刪。', risk: 'Medium（刪舊頁；改各工具共用的入口）', model: 'Opus 5.5', status: 'in_progress', depends: ['C6'],
    decided: '不留兩扇門。不做舊 .design.json 匯入（妳 2026-11-06 定案：沒有要再編輯的舊專案檔）。妳在正式站用過專業版、說可以之後才拆舊的。調色與去背的共用數學、fabric 套件保留（塔羅印刷與預覽還在用）。',
    what: 'openInCanvas 加選填的原始檔參數與目的地表；ProEditorFrame 讀交接；Mockup 加入口；門頁改載新元件；canvas 頁改 redirect、刪 CanvasEditor、搬 fabric-filters、拆側欄與登記、改測試；文件與記憶',
    files: ['NA/components/tools/canvas-handoff.ts', 'NA/app/(shell)/tools/designs/DesignsGallery.tsx', 'NA/app/(shell)/tools/mockup/MockupStudio.tsx', 'NA/app/(shell)/tools/mockup/ModelMockupPanel.tsx', 'NA/app/design/canvas/page.tsx', 'NA/app/(shell)/tools/canvas/page.tsx', 'NA/app/(shell)/tools/canvas/CanvasEditor.tsx', 'NA/app/sidebar-sections.ts', 'NA/lib/portal/products.ts'],
    items: [
      done('C7.1', '入口全部改接到專業版，圖會帶過去：Studio、塔羅、Banner、我的設計，加上新補的 Mockup；有圖層原始檔的設計開原始檔。', '85c27aaa4'),
      todo('C7.2', '舊網址跳轉到專業版；刪舊頁與相關設定、測試改好。'),
      todo('C7.3', '文件與記憶更新。'),
    ] },
  { n: 8, code: 'C8', group: 'H', title: '傳回原工具', plain: '例：在塔羅按「在畫布編輯」，畫布開在新分頁；改好按右邊的「傳回塔羅」，塔羅那張預覽圖就換成改過的，接著生整套就照這張的樣子。原分頁關掉了，改好的圖就存進「我的設計」。',
    gate: '塔羅預覽、整套裡的單張、Studio 結果與參考圖、Banner 商品圖與背景：送出、改、傳回後原格換成新圖；原分頁關掉時圖進「我的設計」；送錯格、圖不見各零次。', risk: 'Medium（改各工具共用的入口）', model: 'Opus 5.5', status: 'done', commit: '8239d222b', depends: ['C4'],
    decided: '妳 2026-11-06 定案「補「傳回」」。一套機制三個工具共用；畫布一律開新分頁；整張 Banner 維持單向（它是合成圖，沒有一格能收回）。',
    what: '交接改走新分頁＋IndexedDB；原分頁收回的通道與「傳回」鈕；塔羅、Studio、Banner 接上；實測',
    files: ['NA/components/tools/canvas-handoff.ts', 'NA/components/tools/useCanvasReturn.ts', 'NA/public/editor-shared/dock.js', 'NA/app/(shell)/tools/tarot/TarotStudio.tsx', 'NA/app/(shell)/tools/studio/StudioWorkbench.tsx', 'NA/app/(shell)/tools/banner/BannerStudio.tsx'],
    items: [
      done('C8.1', '共用機制：畫布開新分頁、右邊「傳回」鈕、原分頁收回；收不回就存進「我的設計」。', '22806d04c'),
      done('C8.2', '塔羅：預覽圖與整套裡的單張都能傳回。', '72fd544b7'),
      done('C8.3', 'Studio 結果與參考圖、Banner 商品圖與背景都能傳回。', 'e14e84341'),
      done('C8.4', '本機與正式站實際跑一次。', '8239d222b'),
    ] },
];

export const OPEN = [];
