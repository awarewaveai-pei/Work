# R0-PLAN：畫布專業版（PhotoCraft 嵌入）＋積木共用層

> 狀態只在 `data.mjs`（監工台）；本檔只寫做法。研究正本：`agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md`（以下「研究 §n」）。操作者定案與 16 個坑：同資料夾 `BRIEF.md`（不重述）。姐妹計畫：`agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md`。
> 縮寫：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/` = `lobster-factory/infra/hetzner-phase1-core/`；`PC/` = storytold/photocraft checkout（不進 repo）；`CE` = `NA/app/(shell)/tools/canvas/CanvasEditor.tsx`。

## 1. 任務理解

把 Canvas Editor（Fabric 7，2,757 行）換成真品 PhotoCraft 的 WASM 網頁版；只留一套。需求 → 落點：

| 操作者要求 | 落在 |
|---|---|
| ① PhotoCraft 完整功能；② 排版相同 | C1–C3（嵌入真品，不改它的畫面） |
| ③ 保留原有而 PhotoCraft 沒有的，做成第二 dock 欄 | C4（對照表：研究 §3） |
| 積木式、可擴張 | 一個頁框、一個 dock 外殼、一份 ctx 契約、每個編輯器一個轉接器＋一份面板清單（C3.1、C4.1、C4.2） |
| 全視窗開新分頁；一條圖示欄＋浮出面板；統一 class 與主題 token、零色碼；不用下拉 | C3.1、C4.1 |
| 編輯器本體吃 app 主題 | 卡 C1.4 |
| 字型放進編輯器自己的字型庫，不做字型面板 | 卡 C1.1、C1.2 |
| 補丁：最小、通用、送上游、PIN；同一事實只存一處 | 卡 C1.1、C1.3、C1.4 |
| Tarot／Studio／Mockup／Banner／我的設計直接進來改 | 卡 C7.1 |
| 改完：存入 My Designs／另存／轉存（換格式）／匯出 | C5（My Designs）；另存、換格式、匯出＝PhotoCraft 原生選單，卡 C4.2 保證檔案真的下載 |
| 基礎設施重用不新造 | §2「可重用」；每張卡指到既有檔 |
| 不動 design 門開關；不先搬舊編輯器；不動向量版計畫檔 | §5 |

## 2. 現況分析

- `git log`（2026-11-05）：`717c9975f` 向量版接收端檔名改帶內容雜湊；`93f7fec27`／`3ef5e981a` 向量版主題與字型；`6740e006d` 向量版 C7 退場；`e566e68cd`／`0a24f4c29` 調色、去背數學收進 `NA/public/editor-shared/`。
- PhotoCraft 網頁版（`98bcbfab9`）：無控制通道 `PC/apps/photocraft-web/src/main.rs:8`；app 入口 `PC/crates/ui-egui/src/app/control.rs:5` `with_control`；檔案服務 `PC/apps/photocraft-web/src/web.rs:85-86,455`（`inbox`、`place_inbox`、存檔＝下載）；語言 `auto` 在 wasm 恆為英文 `PC/crates/ui-egui/src/i18n/system.rs:55-58`；主題：`apply` `PC/crates/ui-egui/src/theme.rs:1019-1024` 每次用該主題的原值重建，JSON 覆寫解析 `apply_overrides` `:1188` 只在 debug 桌面版編（`:1123-1124`）；字型 `fonts/manifest.txt` `PC/packaging/web/README.md:156-182`；打包 `PC/packaging/web/package.sh:20-21,66,80-96`；Rust ≥ 1.95 `PC/Cargo.toml:10`；trunk 0.21.14 `PC/.github/workflows/ci.yml:359`。
- 上游共用模組（storytold/craft-libs，已合併，PhotoCraft 未接）：`crates/web-api`（`window.<app>`，merge `71b92e8b5ead2c0c6da9c275d3daac506056cd82`）、`crates/web-host`（`?host=parent`：`<app>:open`／`<app>:save`／`<app>:dirty`／`<app>:ready`）。
- 入口：`NA/components/tools/canvas-handoff.ts:98` `openInCanvas`（目的地 `:94`；讀取 `:134`，不分目的地、inline 鍵不清；遠端網址轉同源 `:162`）← `BannerStudio.tsx:1313`、`StudioWorkbench.tsx:1707,1928`、`TarotStudio.tsx:2124`、`OutputTrackBar.tsx:178`、`DesignsGallery.tsx:1295`（只傳 PNG 網址）；Mockup 工具沒有入口；門頁 `NA/app/design/canvas/page.tsx:6`。
- 存檔分組：`metadata.source`（`NA/lib/studio/asset-group.ts:16`）；`CE:2000` 存 `source: "canvas"`；Mockup 挑設計 `NA/app/(shell)/tools/mockup/MockupStudio.tsx:305` `?group=print`（＝非 mockup、非 tarot）。
- 舊資料：`.design.json` 只在使用者電腦（`CE:1716`）；My Designs 只有 PNG。
- 可重用（向量版已上線）：`NA/app/(full)/tools/vector-pro/VectorProFrame.tsx`（對 dock 的接點 `window.__vectorProFrame` `:16,43,54,60`）；`NA/public/vector-pro-dock/dock.js`（`mountDock` `:68`，ctx 在這裡建 `:101`）＋`theme.css`（`--vp-*` 尺寸，測試 `NA/lib/studio/__tests__/vector-pro-dock.test.ts:201-221`）；`NA/public/editor-shared/blocks/*.js` 9 個、`ctx-contract.md`、`ctx-vectorcraft.js`；主題協定 `NA/lib/theme/frame-theme.ts:8-10,20-22`（頻道 `awarewave:theme`）；`NA/lib/studio/design-source.ts:6,44,57`；`NA/lib/public-asset-cache.ts:3`；`NA/lib/portal/staff-tools.ts:62`；`NA/next.config.ts:38-40`；`INFRA/nginx/default.conf:318,490`；`INFRA/docker-compose.yml:37`；`scripts/vectorcraft-pro/build.sh`（`pin` `:21`、`checkout` `:32`、字型 `:42-75`、接收端雜湊檔名與注入 `:124-140`）、`awarewave-theme-receiver.js`（對應表 `:14-38`、呼叫 `window.vectorcraft.setTheme` `:70`）、`api-settheme.patch`；`INFRA/tests/e2e/smoke/05-vector-pro.spec.ts`。
- 部署限制：`sg-deploy` rsync `--delete` → 產物放 `/root/lobster-phase1/static/`。

## 3. 風險清單

| # | 風險 | 處置 |
|---|---|---|
| R1 | 網頁版沒有 JS 介面 | 卡 C1.3：先查上游是否已內建，沒有才釘接線補丁（§5 定案） |
| R2 | 圖層像素進出沒有現成指令 | 卡 C1.5 spike 是閘：做不到的列出回報，不硬做 |
| R3 | 真品 alpha（深度 55%、效能 25%）；網頁版無自動存檔 | 版本釘 commit；My Designs 存 `.pcraft`；離頁前未存提示 `PC/apps/photocraft-web/src/web.rs:184`；操作者實際用過才做卡 C7.3 |
| R4 | 補丁隨上游改動失效 | `git apply --check` 失敗即停（正式站不受影響）；補丁只碰網頁殼與 `theme.rs`；送上游；上游內建後刪 |
| R5 | 固定檔名被長快取 → 升級後新舊混用 | 不變量：檔名帶內容雜湊才長快取，其餘一律重新驗證（卡 C2.3）；卡 C2.4 驗 |
| R6 | nginx／compose 改動影響全站 | 只走 `safe-infra-patch.sh`；`^~`；`expires`（不用巢狀 `add_header`） |
| R7 | 共用層重構改壞向量版 | 行為不變；向量版登入 e2e 綠＋重建後上游檔雜湊相同才算 |
| R8 | 退場刪到別處還在用的檔 | `fabric-filters.ts`、`editor-color-grade.ts`、`editor-bg-remove.ts`、`fabric` 依賴保留（`NA/components/tools/GradedPreview.tsx:22`、`NA/app/(shell)/tools/tarot/renderPrintCard.ts`）；刪前 grep 無 import |
| R9 | 有宿主時原生「另存／匯出」不再自己下載 | 卡 C4.2：面板沒在等的 `photocraft:save` 由父頁下載；卡 C4.4 e2e 驗 |
| R10 | 做法改變三項 | 執行期上傳字型 → 建置時加（卡 C6.2）；每張圖可回頭改的調色 → 原生調整圖層；`.design.json` → `.pcraft`（待決 2） |
| R11 | 無 WebGPU／WebGL2 | 頁面偵測失敗顯示一行說明 |
| R12 | 授權 | Apache-2.0；`NOTICE`、`ATTRIBUTION.md` 隨 dist |

## 4. 方案比較

- **A 最小**：只嵌 iframe。rollback：刪頁＋nginx location。缺：面板、入口、存檔全斷，需求 ③ 不成立。
- **B 完整（選）**：嵌入＋共用面板＋三個點陣專用面板＋入口改接＋舊編輯器退場。rollback：每卡獨立（`current` 連結切回；頁面 revert；`CANVAS_STAFF_HREF` 一行改回；卡 C7.3 之前舊編輯器完整保留）。

## 5. 建議方案

B。

- **介面（操作者 2026-11-05 交由工程評估）**：用上游自己的兩個共用模組，不自創介面、不另寫一份網頁殼（另寫＝複製上游 `web.rs`／`preset_bridge.rs`／`indexed_presets.rs` 共 1,232 行並永久跟版，比約百行的接線差）。做到卡 C1.3 時上游若已內建就直接釘那個 commit、零補丁；否則釘接線補丁並送上游，上游內建後刪。補丁套不上時建置停止，正式站維持現版。
- **面板取捨**：只收「PhotoCraft 沒有」的。調整、濾鏡、色調分離、文字、形狀、圖層、CMYK／出血 PDF、另存與換格式都用原生。不做「轉存」面板（與 WebP 面板、原生匯出、My Designs 重複）。不做字型面板。
- **版面**：我方 UI＝一條圖示欄＋浮出面板，尺寸照 PhotoCraft Pro 版型（圖示欄 36、鈕 28、面板 290、分頁高 28、內距 8；研究 §2）；顏色不抄色碼：兩邊都吃 app 主題 token，所以一致。
- **擴張方式**：再接一個 Craft 編輯器＝一份 PIN＋補丁（如需）＋一個轉接器＋一份面板清單與尺寸＋一份主題對應表＋一個 nginx location＋一頁；頁框、dock 外殼、面板、契約、建置函式、主題接收端不複製。
- **不做**：`design.aware-wave.com` 門的開關；把舊 `CE` 搬全視窗；改向量版計畫檔。

## 6. 實作計畫

### C1 建置鏈（本機 WSL）＋介面＋spike

| 卡號 | 做什麼 |
|---|---|
| C1.1 | 共用建置函式：把 `scripts/vectorcraft-pro/build.sh` 的 `pin`（`:21`）、`checkout`（`:32-37`）、字型下載＋manifest 追加（`:42-75`）、接收端雜湊檔名＋注入 `index.html`（`:124-140`）搬到新檔 `scripts/craft-web-build/lib.sh`；字型清單 `scripts/vectorcraft-pro/PIN.json` 的 `webFonts` 搬到 `scripts/craft-web-build/fonts.json`；`scripts/vectorcraft-pro/awarewave-theme-receiver.js` 搬到 `scripts/craft-web-build/`，把兩個因編輯器而異的值抽成每個編輯器一份 `scripts/<editor>-pro/theme-map.json`：`api`（接收端呼叫 `window[api].setTheme`，原 `:70`）與對應表（原 `:14-38`）；建置時把該檔內嵌進接收端。`scripts/vectorcraft-pro/build.sh` 改 source。驗：向量版重建後 wasm、字型、上游檔的雜湊與搬之前相同；接收端內嵌的對應值與舊表逐項相同；`index.html` 只差接收端檔名 |
| C1.2 | 新檔 `scripts/photocraft-pro/PIN.json`（`{repo, rev, craftLibsRev, trunk}`；`rev` 起點 `98bcbfab9005b4915b3143b4daed91df365db107`）、`build.sh`（WSL）、`build.ps1`（呼叫 WSL，照 `scripts/vectorcraft-pro/build.ps1`）：checkout 到 `~/awarewave/photocraft-src` → `git apply --check` 後套 `scripts/photocraft-pro/*.patch` → `PHOTOCRAFT_WEB_FONTS_DIR=<C1.1 的字型資料夾> PC/packaging/web/package.sh` → 解到 `dist/<rev7>-<inputs7>/` → 注入接收端（C1.1 的函式＋本編輯器的 `theme-map.json`）→ `NOTICE`、`ATTRIBUTION.md`、`SHA256SUMS`。驗：分段檔總量與上游 release 同級（v0.20.2 zip 13 MB） |
| C1.3 | 介面。第一步：`gh api repos/storytold/photocraft/contents/apps/photocraft-web/src` 與上游 `apps/photocraft-web/Cargo.toml`，main 若已有 `window.photocraft` 與 `?host=parent` → 把 PIN 的 `rev` 改到那個 commit，本卡結束、無補丁。否則寫 `scripts/photocraft-pro/web-host-api.patch`，只動兩檔：`PC/apps/photocraft-web/Cargo.toml` 加 `craft-web-api`、`craft-web-host`（git rev＝PIN `craftLibsRev`）；`PC/apps/photocraft-web/src/web.rs`：(a) `:92` 建 app 後 `with_control(rx)`＋`PageApi::new("photocraft", Methods::default(), request).install()`，在 `logic`／`ui` 結尾回覆等待中的請求（位置同上游 PR #9345）；(b) `Host::connect("photocraft", &canvas)`：`Open {name, data}` → 推進 `inbox`（`:85`）；`Services.write`（`:455`）有宿主時 `host.post_save(...)`，無宿主照舊下載；`post_ready`、`post_dirty`。同日送上游並記 `scripts/photocraft-pro/UPSTREAM-PR.md` |
| C1.4 | 主題（做法同向量版已核准的 `scripts/vectorcraft-pro/api-settheme.patch`）。`scripts/photocraft-pro/theme-tokens.patch`：(a) `PC/crates/ui-egui/src/theme.rs:1123` 的編譯條件從整個 `pub mod live`（`:1124`）移到只包 `LiveTokens` 與它的 `use`，讓解析函式 `apply_overrides`（`:1188`，鍵含 `tab_strip` `:1363`）在 wasm 也編；(b) `theme.rs` 加 `set_host_tokens(ctx, Option<json>)`：存進 ctx data，`apply`（`:1019-1024`）建好該主題的 token 後若有宿主覆寫就套上去 → 切內建主題、開偏好設定都不會蓋掉；(c) 網頁殼（C1.3 同檔）在 `window.photocraft` 上加 `setTheme(spec)`（傳 `null` 還原）呼叫它。頻道沿用協定正本 `awarewave:theme`（`NA/lib/theme/frame-theme.ts:8-10,22`），不另開。`scripts/photocraft-pro/theme-map.json`：`api: "photocraft"`＋app token → `chrome/dock/card/tab_strip/canvas/field/field_border/separator/text/text_dim/accent/hover`（研究 §2）。驗：改 app 主題後編輯器跟著變；切內建主題或重新整理後仍是 app 主題 |
| C1.5 | 本機 smoke＋spike（閘）：`python3 -m http.server` 供 dist，同源測試頁用 iframe 開 `index.html?host=parent`。(1) `await photocraft.request('ui.inspect')` 回 JSON；(2) `photocraft.request('prefs.set', {path:'interface.language', value:'zh-hant'})` 後選單繁中（`PC/docs/control-protocol.md:119`）、打繁中字用到 C1.1 的字型；(3) 找出並實測每個 ctx 動作的指令序列：開檔（`photocraft:open`）、整張匯出取回 bytes（PNG／WebP／`.pcraft`，經 `photocraft:save`）、SVG 置入、圖片置入成新圖層、取作用中圖層像素、換作用中圖層像素（位置與堆疊不變）、取選取範圍成遮罩 PNG、圖層縮到符合／填滿畫布。可用積木：`edit.copy`／`edit.paste`／`edit.pasteSpecial.pasteInPlace`、`document.activate`、`layer.select`、`file.close`（`PC/crates/engine/src/cmd/atn_cmds/events.rs:869-1109`）。每個動作的序列與 undo 步數寫進 `NA/public/editor-shared/ctx-contract.md` 的 PhotoCraft 欄；做不到的列出並回報（備案：C1.3 補丁多掛一個把 bytes 推進 `place_inbox`（`web.rs:86`）的函式）。結果與截圖寫 `scripts/photocraft-pro/README.md`「驗證」段 |

### C2 承載（prod nginx 靜態）

| 卡號 | 做什麼 |
|---|---|
| C2.1 | 主機 `mkdir -p /root/lobster-phase1/static/photo-pro`；先 `pgrep -f "^bash /root/lobster-phase1/scripts/[s]g-deploy"` 無人部署；rsync `dist/<版本>/` 上去（High：`# CONFIRMED-HIGH-RISK`）；`ln -sfn <版本> current`；`sha256sum -c SHA256SUMS` |
| C2.2 | compose（`safe-infra-patch.sh compose <file> nginx`）：`INFRA/docker-compose.yml:37` 下加 `- /root/lobster-phase1/static/photo-pro:/srv/photo-pro:ro`；repo 對照檔同步 |
| C2.3 | nginx（`safe-infra-patch.sh nginx <file>`）：在 `INFRA/nginx/default.conf:318` 與 `:490` 兩個 `/vector-pro/` 區塊之後各加表格下方那段（原樣照抄；regex 含大括號，必須有引號）。不變量：檔名帶內容雜湊（trunk 的 16 位 hex、接收端、分段檔）才 1 年，其餘（`index.html`、`app/photocraft-web.js`、`app/parts.txt`、`fonts/**`）每次重新驗證。不開 `gzip_static`（分段檔已是 gzip，由頁面自己解；`PC/packaging/web/README.md:74-79`） |
| C2.4 | 驗：`curl -sI https://app.aware-wave.com/photo-pro/current/index.html` 200＋`Cache-Control: no-cache`；`…/app/parts.txt`、`…/app/photocraft-web.js`、`…/fonts/manifest.txt` 皆 `no-cache`；`…/app/<hash>.part-aa` 為 `max-age=31536000` 且無 `Content-Encoding`；`*_bg.wasm` 為 `application/wasm`；`docker exec lobster-nginx ls /srv/photo-pro/current` 有檔 |

```nginx
    location ^~ /photo-pro/ {
        alias /srv/photo-pro/;
        types { application/wasm wasm; text/javascript js; text/html html; font/otf otf; font/ttf ttf; text/plain txt; }
        default_type application/octet-stream;
        expires -1;
        location ~ "(-[0-9a-f]{16}(_bg)?\.(js|wasm)|\.part-[a-z]+)$" { expires 1y; }
    }
```

### C3 app 門

| 卡號 | 做什麼 |
|---|---|
| C3.1 | 頁框共用：`NA/app/(full)/tools/vector-pro/VectorProFrame.tsx`（WebGL2 偵測、入口檔探測、dock script 掛載、`connectThemeFrame`、失敗訊息）抽成 `NA/components/tools/ProEditorFrame.tsx`（props：`editor`、`frameSrc`、`dockSrc`、`dockId`、`fallback`）；它對 dock 的唯一接點是 `window.__proEditor = { editor, frame }`，取代 `window.__vectorProFrame`（`VectorProFrame.tsx:16,43,54,60`、`NA/public/editor-shared/ctx-vectorcraft.js:50`、`NA/public/vector-pro-dock/dock.js:58` 同步改）；向量頁改用它（行為不變）。新頁 `NA/app/(full)/tools/photo-pro/page.tsx`：`editor = "photocraft"`、`frameSrc = process.env.NEXT_PUBLIC_PHOTO_PRO_PATH \|\| "/photo-pro/current/index.html?host=parent"`、`dockSrc = "/photo-pro-dock/dock.js"`；頁尾 NOTICE 連結 |
| C3.2 | `NA/next.config.ts:38-40` 的 `rewrites()` 加一條：`PHOTO_PRO_DEV_ORIGIN` 有值時 `/photo-pro/:path*` 轉過去；正式站無此變數＝不改行為 |
| C3.3 | 登記：`NA/app/sidebar-sections.ts:69` 下加 Photo Pro（`href: '/tools/photo-pro'`、`newTab: true`）；`NA/lib/portal/products.ts:74` `staffPaths` 加 `tools/photo-pro`（**不加 nav 項**：`NA/lib/portal/__tests__/products.test.ts:102` 要求每個 nav 都有門頁；門路徑沿用既有的 `canvas`，到卡 C7.1 才換內容）；`NA/lib/portal/staff-tools.ts:62` `pages` 加 `/photo-pro`、`/photo-pro-dock`；`NA/lib/public-asset-cache.ts:3` 加 `photo-pro-dock`。跑 `products.test`、`staff-tools.test`、`sidebar-coverage.test`、`npx tsc --noEmit` |
| C3.4 | REALTEST：deploy 後登入開 `/tools/photo-pro`，`photocraft.request('ui.inspect')` 回 JSON，截圖存 WORKLOG；`fetch('/photo-pro-dock/dock.js',{cache:'reload'})` 回 `private, no-cache` |

### C4 圖示欄與面板

面板清單（圖示欄由上而下；哪些原生、哪些做面板的依據在研究 §3）：

| 面板 id | 來源 | 用到的 ctx |
|---|---|---|
| `templates` | 既有；加「符合／填滿畫布」兩顆鈕（`CE:1059`），宿主有 `fitLayer` 才顯示 | `setArtboardSize`、`fitLayer` |
| `color-grade` | 既有 | `selectedImage`、`replaceImage` |
| `bg-remove` | 既有 | 同上 |
| `ai-fill` | 新（`CE:1775-1916`；遮罩改用 PhotoCraft 的選取範圍） | `selectedImage`、`selectionMask`、`replaceImage` |
| `outpaint` | 新（`CE:1489-1533`） | `exportArtboard`、`placeImage` |
| `edge-mask` | 新（`CE:1535-1588`） | `selectedImage`、`replaceImage` |
| `webp` | 既有 | `exportArtboard` |
| `my-designs` | 既有，改讀宿主設定（卡 C5.2） | `saveAs`、`exportArtboard`、`openFile`、`host` |
| `qr`、`barcode` | 既有 | `placeSvg` |
| `mockup`、`batch-export` | 既有 | `exportArtboard` |

| 卡號 | 做什麼 |
|---|---|
| C4.1 | dock 外殼共用：`NA/public/vector-pro-dock/dock.js:68` `mountDock` 與同目錄 `theme.css` 搬到 `NA/public/editor-shared/dock.js`／`dock.css`，參數 `{ makeCtx, panelIds, storeKey, sizes }`。尺寸只存在各編輯器 `dock.js` 的 `sizes`：`mountDock` 把它寫成 root 上的 `--vp-*`，`dock.css` 只用 `var()`、不放數值。`vector-pro-dock/dock.js` 只留自己的清單（`:14-24`）、`sizes`（現值：面板 310、最小 220、最大 720、圖示欄 38、分頁 33）、`applyDefaultWorkspace`（`:54`）。新 `NA/public/photo-pro-dock/dock.js`：`panelIds`＝上表、`sizes = { rail: 36, button: 28, panel: 290, panelMin: 250, panelMax: 720, tab: 28, pad: 8 }`（`PC/crates/ui-egui/src/panels/dock.rs:37,73`、`panels/panel_docking.rs:89-91,561`、`widgets/panel.rs:53`）、`makeCtx = createPhotocraftCtx`。同卡改 `NA/lib/studio/__tests__/vector-pro-dock.test.ts:201-221`：讀 `editor-shared/dock.css`（零色碼、只用 globals token 的斷言照舊），尺寸斷言改對兩個 `dock.js` 的 `sizes`。向量版 e2e 仍綠 |
| C4.2 | 轉接器 `NA/public/editor-shared/ctx-photocraft.js`：照 C1.5 寫進契約的序列實作 `ctx-contract.md` 既有方法，另加契約三項：`selectionMask() → Blob\|null`、`fitLayer('fit'\|'fill')`（兩者選用：宿主沒有就不提供，面板以有無決定顯示）、`host = { id, label, sourceExt, sourceName, saveTag: { source, modelName, prompt }, listSources }`（畫布：`photocraft`／`畫布`／`.pcraft`／`design.pcraft`／`canvas`／`canvas`／`canvas edit`／`['canvas']`；`ctx-vectorcraft.js` 補同形狀：`vectorcraft`／`向量`／`.vectorcraft`／`design.vectorcraft`／`vector-pro`／`vector-pro`／`vector edit`／`['vector-editor','vector-pro']`）。bytes 進出走 `photocraft:open`／`photocraft:save`（依 `name` 配對，逾時 reject），一次一個（同 `ctx-vectorcraft.js:53`）。面板沒在等的 `photocraft:save`（使用者用原生 另存／匯出）由父頁以 `<a download>` 存到電腦，檔名＝訊息的 `name`。`ready()` 後第一次設 `interface.language = zh-hant`，之後尊重偏好 |
| C4.3 | 三個新面板 `NA/public/editor-shared/blocks/{ai-fill,outpaint,edge-mask}.js`（`export default { id, title, icon, mount(ctx, body) }`）。數學與預設只留一處：`NA/lib/studio/edge-mask.ts` 的 `EDGE_MASK_STYLES`（`:145`）／`buildMaskSvg`（`:272`）／`applyEdgeMask`（`:309`）搬到 `NA/public/editor-shared/edge-mask.js`，`lib/studio/edge-mask.ts` 改成只加型別的門（照 `NA/lib/studio/editor-color-grade.ts:1-7`）；`NA/lib/studio/outpaint-presets.ts:9-22` 同樣搬 `NA/public/editor-shared/outpaint-presets.js`。API 不新增：`/api/tools/studio/inpaint`、`/api/tools/studio/genfill`（`CE:1503,1865`）。擴圖方向用看得到的按鈕（`CE:2659` 是下拉） |
| C4.4 | 測試：(a) `NA/lib/studio/__tests__/photo-pro-dock.test.ts`：面板 id 與 `photo-pro-dock/dock.js` 清單相等；`blocks/*.js` 用到的每個 `ctx.<名稱>` 都在 `ctx-photocraft.js` 與 `ctx-contract.md`（選用項除外，且面板有判斷）；轉接器對 mock `photocraft`／postMessage 每個方法一條、參數型別照上游原始碼；每個模組複製成 `.mjs` 後 `node --check`；新檔零色碼。(b) 登入 e2e `INFRA/tests/e2e/smoke/06-photo-pro.spec.ts`：每個面板主要按鈕按一次並檢查效果（照 `05-vector-pro.spec.ts`）；原生 File › Export 後瀏覽器收到下載。合 main 前在 detached 整合工作樹跑 `tsc`＋vitest 全套 |

### C5 My Designs 原始檔

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `NA/lib/studio/design-source.ts`：`:6` `SOURCE_EXTS` 加 `.pcraft`；`:44` 的二分判斷改成「副檔名 → 嗅探器」一張表（`.pcraft`＝ZIP 檔頭 `PK\x03\x04` 且含 `manifest.json` 項，`PC/book/src/formats/pcraft.md:3-15`）；`:57` `sourceKeyFromMetadata` 的 regex 與 `:38` 的訊息都由 `SOURCE_EXTS` 產生（副檔名清單只存一處）。不改 schema。上限沿用 `NA/app/api/tools/designs/route.ts:17`；超過時面板顯示「檔案太大，請用 檔案 › 另存 下載」 |
| C5.2 | `NA/public/editor-shared/blocks/my-designs.js` 寫死的向量值改讀 `ctx.host`：`:10` `SOURCES` → `host.listSources`；`:40` 說明文字的副檔名 → `host.sourceExt`；`:60` → `host.sourceName`＋`host.saveTag`；`:73` 預設檔名 → `host.sourceName`；`:89` 清單過濾改成「來源在 `host.listSources`，且有原始檔時副檔名＝`host.sourceExt`」（否則向量版會列出開不了的 `.pcraft`）；`:96` 空清單文字 → `host.label`；`:41` 的「匯入舊專案」→ 宿主提供 `importLegacy` 才顯示（向量版現有邏輯搬進 `ctx-vectorcraft.js`；畫布版見卡 C7.2）。畫布存入＝`exportArtboard` PNG＋`saveAs()` 的 `.pcraft`，`source: "canvas"`（同 `CE:2000`）→ 「我的設計」、Mockup 的設計挑選（`MockupStudio.tsx:305`）、發佈精靈照舊看得到。開啟＝有原始檔就 `openFile`（讀檔走 `/api/tools/designs/download?url=`），否則以圖片開 |
| C5.3 | REALTEST（操作者的 Chrome）：打繁中字、存入、在「我的設計」看到縮圖、在 Mockup 工具選得到、再開回來圖層還在 |

### C6 驗收、升級流程、文件

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `06-photo-pro.spec.ts` 納入 `/playwright smoke`（`--use-gl=angle --use-angle=swiftshader`，等 `window.photocraft`） |
| C6.2 | `scripts/photocraft-pro/README.md`：前置需求；建置；升級（改 `PIN.json` → `build.ps1` → C1.5 smoke → rsync 新版本 → 切 `current` → C6.1 → 失敗切回）；保留最近 2 版；每次升級先做 C1.3 第一步（上游已內建就刪補丁）；加一個字型（改 `scripts/craft-web-build/fonts.json` → 重建 → 上傳） |
| C6.3 | `agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記一條；`agency-os/docs/architecture/decisions/ADR_INDEX.md` 加一列指向研究報告 |
| C6.4 | WORKLOG 四行機械證據；記憶 `project_photocraft_pro_supervisor.md` 更新 |

### C7 入口改接、舊檔、舊編輯器退場

| 卡號 | 做什麼 |
|---|---|
| C7.1 | `NA/components/tools/canvas-handoff.ts`：`openInCanvas`（`:98`）加選填參數 `source?: { url, name }`；同檔一張表決定目的地與編輯器 id（原始檔是 `.vectorcraft`／`.svg` → `vectorcraft`、`/tools/vector-pro`；其餘 → `photocraft`、`/tools/photo-pro`），把 `editor` 與 `source` 連同圖一起存進交接；`CANVAS_STAFF_HREF`（`:94`）改 `/tools/photo-pro`。讀取端只有一個 ctx：`ProEditorFrame` 用 `readCanvasSource()`（`:134`）讀交接，`editor` 不是自己就不取；是自己的就把 `{ url, name }` 掛到 `window.__proEditor.handoff`（圖片網址先過 `toCanvasSrc` `:162`，原始檔走 `/api/tools/designs/download?url=`）；`NA/public/editor-shared/dock.js` 在 `ctx.ready()` 後看到 `handoff` → fetch → `ctx.openFile(blob, name)`。重新整理會再開同一份（PhotoCraft 沒有自動存檔；與舊編輯器「重新整理圖還在」一致）。呼叫端：`BannerStudio.tsx:1313`、`StudioWorkbench.tsx:1707,1928`、`TarotStudio.tsx:2124`、`OutputTrackBar.tsx:178` 不改；`DesignsGallery.tsx:1295` 多傳 `asset.source_url`＋`metadata.source_name`；Mockup 新增入口：`NA/app/(shell)/tools/mockup/MockupStudio.tsx:835` 與 `ModelMockupPanel.tsx:183` 的「存入 My Designs」旁加「在畫布編輯」（同一個 `openInCanvas`）。門頁 `NA/app/design/canvas/page.tsx:6` 改載 `ProEditorFrame`（門路徑仍是 `canvas`）。e2e：Studio、塔羅、Banner、Mockup、我的設計（只有 PNG、有 `.pcraft`、有 `.vectorcraft` 各一）按下去 → 對的編輯器裡有那張圖或那份圖層；向量頁不會開到畫布的交接 |
| C7.2 | 舊專案檔（待決 2 答「有」才做）：`ctx-photocraft.js` 提供 `importLegacy(file)`：Fabric 離屏 `loadFromJSON`（格式 `awarewave-design/1`，`CE:181`；先驗哪個 Fabric 版本載得起 Fabric 7 的 JSON）→ 每個頂層物件一張透明 PNG → 依原順序 `placeImage`。文字變成像素，面板上寫明 |
| C7.3 | 退場（操作者在正式站用過並說可以之後）：`NA/app/(shell)/tools/canvas/page.tsx` 改 `redirect('/tools/photo-pro')`；刪 `CE`；`NA/app/(shell)/tools/canvas/fabric-filters.ts` 搬 `NA/lib/studio/fabric-filters.ts`（改 `GradedPreview.tsx:22` 等 import）；`NA/app/sidebar-sections.ts:68` 移除 Canvas Editor；`NA/lib/portal/products.ts:68` nav「畫布」的 `staff` 改 `tools/photo-pro`、`:74` `staffPaths` 移除 `tools/canvas`；向量頁的 `fallback` 不再指 `/tools/canvas`；只被 `CE` 用的模組（`NA/lib/studio/canvas-fit.ts` 等）grep 無 import 才刪；`INFRA/tests/e2e/editor-merge/card-0{1..6}-*.mjs` 刪除；`editor-*-drift.test`／`editor-filter-ownership.test` 的 canvas 端改指 `blocks/`。`fabric` 依賴保留 |
| C7.4 | RUNNABLE_DEMOS 舊條目改指專業版；記憶 `project_pod_image_edit_feature.md`、`project_vector_editor_blocks.md` 更新；WORKLOG |

## 7. 驗證計畫（四動作）

- 實測：卡 C1.5／C2.4／C3.4／C5.3／C6.1／C7.1 的 curl／瀏覽器／playwright 指令與輸出；驗收＝登入 e2e 每個面板與每個入口綠＋操作者在正式站用過。
- Review：每卡 `/codex-review`；C2 另 `docker exec lobster-nginx nginx -t`；補丁另看 `git apply --check`。
- 抓蟲：grep `photo-pro`、`photocraft`、`CANVAS_STAFF_HREF`、`__vectorProFrame`、`tools/canvas`、`openInCanvas` 於 `NA/ INFRA/ agency-os/ scripts/ .claude/`。
- WORKLOG：每卡一段，三行機械證據。
- 派工：照 BRIEF §7。建議模型：C1、C4、C7 Opus 5.5；C2、C3、C5、C6 fullstack-engineer（Sonnet）；每卡驗收 Fable。
