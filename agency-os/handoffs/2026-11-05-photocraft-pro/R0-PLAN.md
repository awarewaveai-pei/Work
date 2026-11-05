# R0-PLAN：畫布專業版（PhotoCraft 嵌入）＋積木共用層

> 狀態只在 `data.mjs`（監工台）；本檔只寫做法。研究正本：`agency-os/reports/decisions/2026-11-05-canvas-editor-vs-photocraft.md`（以下「研究 §n」）。交接 brief：同資料夾 `BRIEF.md`（操作者定案與 16 個坑，不重述）。姐妹計畫：`agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md`。
> 路徑縮寫：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/` = `lobster-factory/infra/hetzner-phase1-core/`；`PC/` = storytold/photocraft 原始碼 checkout（不進 repo）；`CE` = `NA/app/(shell)/tools/canvas/CanvasEditor.tsx`。

## 1. 任務理解

操作者三個需求同時成立：① 有 PhotoCraft 的完整功能；② 工具排版與 PhotoCraft 相同（她熟 Adobe）；③ 保留她原有而 PhotoCraft 沒有的功能，做成第二 dock 欄；最後只留一套編輯器（舊 Canvas Editor 退場）。
根本問題：`CE`（Fabric 7，2,757 行，12 個面板）離 Photoshop 差選取、修復、調整圖層、濾鏡、圖層樣式、PSD 等整套；真品 `storytold/photocraft`（Apache-2.0，Photoshop 重製，alpha）有 WASM 網頁版。**與向量版的差別**：網頁版還沒有給宿主頁用的 JS 介面（研究 §4）→ 待決 1。

## 2. 現況分析

- `git log`（2026-11-05）：`185c67c5a` 本案 brief；`93f7fec27`／`3ef5e981a` 向量版主題與字型上線；`6740e006d` 向量版 C7 退場；`e566e68cd`／`0a24f4c29` CARD-05／06 把調色、去背數學收進 `NA/public/editor-shared/`。本計畫不動向量版已上線行為，只擴充共用層。
- PhotoCraft 網頁版：`PC/apps/photocraft-web/src/main.rs:8` 無控制通道；入口 `PC/crates/ui-egui/src/app/control.rs:5` `with_control`；檔案服務 `PC/apps/photocraft-web/src/web.rs:85-86,455`（`inbox`、`place_inbox`、存檔＝下載）；語言 `auto` 在 wasm 永遠英文（`PC/crates/ui-egui/src/i18n/system.rs:55-58`）；主題覆寫函式只在 debug 桌面版（`PC/crates/ui-egui/src/theme.rs:1123,1188`）；字型靠 `fonts/manifest.txt`（`PC/packaging/web/README.md:156-182`）；打包 `PC/packaging/web/package.sh:20-21,66,80-96`；Rust ≥ 1.95（`PC/Cargo.toml:10`）、trunk 0.21.14（`PC/.github/workflows/ci.yml:359`）。
- 上游共用模組（storytold/craft-libs，已合併）：`crates/web-api`（`window.<app>`，#413 merge `71b92e8b5ead2c0c6da9c275d3daac506056cd82`）、`crates/web-host`（`?host=parent`：`<app>:open`／`<app>:save`／`<app>:dirty`／`<app>:ready`）。
- 我方入口：五個呼叫端全經 `NA/components/tools/canvas-handoff.ts:98` `openInCanvas`（目的地常數 `:94`）；門頁 `NA/app/design/canvas/page.tsx:6`；側欄 `NA/app/sidebar-sections.ts:68`；`NA/lib/portal/products.ts:68,74`。
- 舊資料：`.design.json` 只在使用者電腦（`CE:1716`）；My Designs 只有 PNG（`CE:2000`）。
- 已上線可重用（向量版）：`NA/app/(full)/tools/vector-pro/{page.tsx,VectorProFrame.tsx,vector-pro.css}`；`NA/public/vector-pro-dock/dock.js:68` `mountDock(root, makeCtx)`；`NA/public/editor-shared/blocks/*.js` 9 個＋`ctx-contract.md`＋`ctx-vectorcraft.js`；`NA/lib/theme/frame-theme.ts:20` `connectThemeFrame`；`NA/lib/studio/design-source.ts:6`；`NA/lib/public-asset-cache.ts:3`；`NA/lib/portal/staff-tools.ts:62`；`NA/next.config.ts:17-20`；`INFRA/nginx/default.conf:318,490`；`INFRA/docker-compose.yml:37`；`scripts/vectorcraft-pro/{build.sh,PIN.json,awarewave-theme-receiver.js}`；`INFRA/tests/e2e/smoke/05-vector-pro.spec.ts`。
- 部署限制同向量版：`sg-deploy` rsync `--delete` → 建置產物放 `/root/lobster-phase1/static/`，不放 `apps/` 樹。

## 3. 風險清單

| # | 風險 | 處置 |
|---|---|---|
| R1 | 網頁版沒有 JS 介面（G1） | 待決 1；選 B 才動工 |
| R2 | 圖層像素進出沒有現成指令（置入 base64、取出內嵌圖都沒有） | C1.5 spike 是第二個閘：做不到幾項就回報幾項，不硬做；備案寫在 C1.5 |
| R3 | 真品 alpha（深度 55%、效能 25%、工具 56/68）；網頁版沒有自動存檔與當機復原（`PC/packaging/web/README.md:69-72`） | 版本釘 commit；My Designs 面板存 `.pcraft`；離開頁面前有未存提示（`PC/apps/photocraft-web/src/web.rs:184`）；C7 退場前操作者實際用過才拆舊的 |
| R4 | 補丁隨上游改 `web.rs` 失效 | `git apply --check` 失敗即停；補丁同日送上游；上游自己接好就刪補丁改 PIN |
| R5 | 固定檔名（`app/photocraft-web.js`、`app/parts.txt`、`fonts/manifest.txt`）被長快取 → 升級後新舊混用 | nginx 對這三個＋`index.html` 用 `expires -1`；C2.4 用 curl 與登入瀏覽器 `fetch(url,{cache:'reload'})` 驗 |
| R6 | nginx／compose 改動影響全站 | 只走 `safe-infra-patch.sh`；兩個 server block 都放；`^~`、`expires`（不用巢狀 `add_header`） |
| R7 | 共用層改動（dock 外殼、建置函式、頁面框）改壞向量版 | 行為不變重構；向量版 `05-vector-pro.spec.ts` 登入 e2e 與建置 `SHA256SUMS` 前後一致才算 |
| R8 | 退場刪到別人還在用的檔 | `fabric-filters.ts`、`editor-color-grade.ts`、`editor-bg-remove.ts`、`fabric` 依賴留著（`NA/components/tools/GradedPreview.tsx:22`、`NA/app/(shell)/tools/tarot/renderPrintCard.ts`）；刪檔前 grep 無 import |
| R9 | 無 WebGPU／WebGL2 | 頁面偵測失敗顯示一行說明（同向量版）；退場後 fallback 不再指向舊編輯器 |
| R10 | 授權 | Apache-2.0；`NOTICE`、`ATTRIBUTION.md` 隨 dist 放，頁尾連結 |
| R11 | 有宿主時原生「另存／匯出」不再自己下載 → 檔案像是消失 | C4.2：面板沒在等的 `photocraft:save` 一律由父頁下載；e2e 驗 File › Export 後瀏覽器收到下載 |
| R12 | 舊編輯器有、專業版改變做法的三項 | 執行期上傳字型 → 改建置時加（C6.2）；每張圖記住調色滑桿可回頭改（`CE` 的 `.adj`）→ 改用原生調整圖層（非破壞），面板「調色」是一次套用；`.design.json` → `.pcraft`（待決 3） |

## 4. 方案比較

- **A 最小**：只嵌 iframe，不接面板、不改入口。rollback：刪頁＋nginx location。缺：需求 ③ 不成立，兩套並存。
- **B 完整（選）**：嵌 iframe＋同一套面板（一個面板、兩個 ctx 轉接器）＋三個點陣專用新面板＋入口改接＋舊編輯器退場。rollback：每張卡獨立（`current` 連結切回；頁面 git revert；`CANVAS_STAFF_HREF` 一行改回；C7.3 之前舊編輯器完整保留）。

## 5. 建議方案

B。定案（沿用操作者在向量版的決定，BRIEF §1）：全視窗開新分頁；我方工具＝一條圖示欄＋浮出面板，尺寸照 PhotoCraft Pro 版型（圖示欄 36／鈕 28、面板 290、分頁高 28、內距 8；研究 §2）；我方 UI 只用 `NA/app/globals.css` 的統一 class 與主題 token、零色碼；編輯器本體吃 app 主題（父頁傳 token）；字型在建置時放進編輯器自己的字型庫，不做字型面板；不用下拉選單。
不做成 PhotoCraft 外掛：面板外掛不在 v1（`PC/docs/plugins.md:183-187`），且外掛沒有網路。
本計畫不做：`design.aware-wave.com` 門的開關；把舊 `CE` 搬全視窗。

## 6. 實作計畫

### C1 建置鏈（本機 WSL）＋介面補丁＋spike

| 卡號 | 做什麼 |
|---|---|
| C1.1 | 共用建置函式：`scripts/vectorcraft-pro/build.sh:20-60` 的 `pin`／`checkout`／字型下載與 manifest 追加，搬到新檔 `scripts/craft-web-build/lib.sh`；字型清單 `scripts/vectorcraft-pro/PIN.json` 的 `webFonts`（51 筆）搬到 `scripts/craft-web-build/fonts.json`（兩個編輯器同一份）；`scripts/vectorcraft-pro/build.sh` 改成 source 它。驗：向量版重建後 `SHA256SUMS` 內每個檔的雜湊與搬之前相同（資料夾名會因輸入雜湊改變，屬預期） |
| C1.2 | 新檔 `scripts/photocraft-pro/PIN.json`（`{repo, rev: "98bcbfab9005b4915b3143b4daed91df365db107", craftLibsRev, trunk: "0.21.14"}`）＋`build.sh`（WSL）＋`build.ps1`（呼叫 WSL，照 `scripts/vectorcraft-pro/build.ps1`）：checkout 到 `~/awarewave/photocraft-src` → `git apply --check` 套補丁 → `PHOTOCRAFT_WEB_FONTS_DIR=<C1.1 的字型資料夾> PC/packaging/web/package.sh` → 解到 `dist/<rev7>-<inputs7>/` → 加 `NOTICE`、`ATTRIBUTION.md`、`SHA256SUMS`；驗 wasm 有經 `wasm-opt`（`PC/apps/photocraft-web/index.html:7` `data-wasm-opt="z"`）且分段總量與上游 release 同級（13 MB） |
| C1.3 | 介面補丁 `scripts/photocraft-pro/web-host-api.patch`（待決 1 選 B）：`PC/apps/photocraft-web/Cargo.toml` 加 `craft-web-api`、`craft-web-host`（git rev＝PIN 的 `craftLibsRev`）；`PC/apps/photocraft-web/src/web.rs`：(a) `:92` 建 app 後 `with_control(rx)`＋`PageApi::new("photocraft", Methods::default(), request).install()`，每幀回覆（照上游 PR #9345 的 `poll_replies` 位置 `logic`／`ui` 結尾）；(b) `Host::connect("photocraft", &canvas)`：`Open {name, data}` → 推進 `inbox`（`:85`）；`Services.write`（`:455`）在有宿主時改 `host.post_save(name, bytes, …)`，否則照舊下載；`post_ready`、`post_dirty`。只動這兩檔。同日送上游（PR 或在 #9345／#3101 留言附 diff），記在 `scripts/photocraft-pro/UPSTREAM-PR.md` |
| C1.4 | 主題補丁 `scripts/photocraft-pro/theme-tokens.patch`：`PC/crates/ui-egui/src/theme.rs:1123` 的 `live::apply_overrides`（`:1188`）移出 debug-only 模組；`ui.set` 加欄位 `tokens`（`PC/crates/ui-egui/src/control/dispatch.rs:248-290` 的 `theme` 欄旁；記得加進 `UI_SET_FIELDS`）。接收端：`scripts/vectorcraft-pro/awarewave-theme-receiver.js` 搬到 `scripts/craft-web-build/awarewave-theme-receiver.js`，對應表（app token → 編輯器 token）改成每個編輯器一份資料檔（PhotoCraft 的鍵：`chrome/dock/card/tab_strip/canvas/field/field_border/separator/text/text_dim/accent/hover`，研究 §2）；build 注入 dist 的 `index.html`。協定正本 `NA/lib/theme/frame-theme.ts:8-10` |
| C1.5 | 本機 smoke＋spike（第二個閘）：`python3 -m http.server` 供 dist，內建瀏覽器開 `index.html?host=parent`（包在一頁同源 iframe 測試頁內）。(1) `await photocraft.request('ui.inspect')` 回 JSON；(2) `photocraft.request('prefs.set', {path:'interface.language', value:'zh-hant'})` 後選單繁中（`PC/docs/control-protocol.md:119`）、打繁中字用到 C1.1 的字型；(3) 找出並實測五個動作的指令序列：開檔（`photocraft:open`）、整張匯出取回 bytes（PNG／WebP／`.pcraft`，經 `photocraft:save`）、置入成新圖層、取作用中圖層像素、換作用中圖層像素（位置與堆疊不變）、取選取範圍成遮罩 PNG。積木：`edit.copy`／`edit.paste`／`edit.pasteSpecial.pasteInPlace`、`document.activate`、`layer.select`、`file.close`（`PC/crates/engine/src/cmd/atn_cmds/events.rs:869-1109`）。每個動作把指令序列與 undo 步數寫進 `NA/public/editor-shared/ctx-contract.md` 的 PhotoCraft 欄；做不到的列出並回報操作者（備案：C1.3 補丁多掛一個把 bytes 推進 `place_inbox`（`web.rs:86`）的函式）。截圖與結果寫 `scripts/photocraft-pro/README.md`「驗證」段 |

### C2 承載（prod nginx 靜態）

| 卡號 | 做什麼 |
|---|---|
| C2.1 | 主機 `mkdir -p /root/lobster-phase1/static/photo-pro`；先 `pgrep -f "^bash /root/lobster-phase1/scripts/[s]g-deploy"` 無人在部署；rsync `dist/<rev7>-<inputs7>/` 上去（High：`# CONFIRMED-HIGH-RISK`）；`ln -sfn <版本> current`；`sha256sum -c SHA256SUMS` |
| C2.2 | compose（`safe-infra-patch.sh compose <file> nginx`）：nginx volumes 在 `INFRA/docker-compose.yml:37` 下加 `- /root/lobster-phase1/static/photo-pro:/srv/photo-pro:ro`；repo 對照檔同步同一列 |
| C2.3 | nginx（`safe-infra-patch.sh nginx <file>`）：照 `INFRA/nginx/default.conf:318-325` 在 app 區塊與產品子網域區塊（`:490`）各加 `location ^~ /photo-pro/ { alias /srv/photo-pro/; types { application/wasm wasm; text/javascript js; text/html html; font/otf otf; font/ttf ttf; text/plain txt; } default_type application/octet-stream; location ~ (/app/photocraft-web\.js\|/app/parts\.txt\|/fonts/manifest\.txt\|/\|\.html)$ { expires -1; } location ~ \.(wasm\|js\|otf\|ttf\|part-[a-z]+)$ { expires 1y; } }`。固定檔名那條在前（regex 依序比對）；**不開** `gzip_static`（分段檔已是 gzip，頁面自己解；`PC/packaging/web/README.md:74-79`）；`default_type` 用 octet-stream 讓 `.part-*` 不被當文字 |
| C2.4 | 驗證：`curl -sI https://app.aware-wave.com/photo-pro/current/index.html` 200、`Cache-Control: no-cache`；`…/current/app/parts.txt` 與 `…/app/photocraft-web.js` 回 `no-cache`；`…/app/<hash>.part-aa` 回 `max-age=31536000` 且無 `Content-Encoding`；`*_bg.wasm` 回 `application/wasm`；`docker exec lobster-nginx ls /srv/photo-pro/current` 有檔 |

### C3 app 門

| 卡號 | 做什麼 |
|---|---|
| C3.1 | 頁面框共用：`NA/app/(full)/tools/vector-pro/VectorProFrame.tsx`（WebGL2 偵測 `:18-20`、入口檔探測、dock script 掛載 `:42-46`、`connectThemeFrame` `:50`、失敗訊息 `:66`）抽成 `NA/components/tools/ProEditorFrame.tsx`（props：`frameSrc`、`dockSrc`、`dockId`、`fallback`）；向量頁改用它（行為不變）。新頁 `NA/app/(full)/tools/photo-pro/page.tsx`：`frameSrc = process.env.NEXT_PUBLIC_PHOTO_PRO_PATH \|\| "/photo-pro/current/index.html?host=parent"`、`dockSrc = "/photo-pro-dock/dock.js"`；頁尾一行 NOTICE 連結 |
| C3.2 | `NA/next.config.ts:17-20` 的 rewrite 模式加一條：`PHOTO_PRO_DEV_ORIGIN` 有值時 `/photo-pro/:path*` 轉過去；正式站無此變數＝不改行為 |
| C3.3 | 登記：`NA/app/sidebar-sections.ts:69` 下加 Photo Pro（`href: '/tools/photo-pro'`、`newTab: true`）；`NA/lib/portal/products.ts:70` nav 加 `{ path: "photo", name: "畫布（專業版）", staff: "tools/photo-pro" }`、`:74` `staffPaths` 加 `tools/photo-pro`；`NA/lib/portal/staff-tools.ts:62` `pages` 加 `/photo-pro`、`/photo-pro-dock`；`NA/lib/public-asset-cache.ts:3` 加 `photo-pro-dock`。跑 `products.test`、`staff-tools.test`、`sidebar-coverage.test`、`npx tsc --noEmit`。不改 design 門的 `coming_soon` |
| C3.4 | REALTEST：deploy 後登入開 `/tools/photo-pro`，`photocraft.request('ui.inspect')` 回 JSON（瀏覽器 javascript_tool），截圖存 WORKLOG；`fetch('/photo-pro-dock/dock.js',{cache:'reload'})` 回 `private, no-cache` |

### C4 第二 dock 欄：同一套面板＋四個新面板

對照表（哪些原生、哪些做成面板）在研究 §3，不重列。面板清單（圖示欄由上而下）：

| 面板 id | 來源 | 用到的 ctx |
|---|---|---|
| `templates` | 既有（加「符合／填滿」兩顆鈕） | `setArtboardSize`、`fitLayer` |
| `color-grade` | 既有 | `selectedImage`、`replaceImage` |
| `bg-remove` | 既有 | 同上 |
| `ai-fill` | 新（`CE:1775-1916` 的流程；遮罩改用 PhotoCraft 的選取範圍） | `selectedImage`、`selectionMask`、`replaceImage` |
| `outpaint` | 新（`CE:1489-1533`） | `exportArtboard`、`placeImage` |
| `edge-mask` | 新（`CE:1535-1588`） | `selectedImage`、`replaceImage` |
| `webp` | 既有 | `exportArtboard` |
| `my-designs` | 既有（改成依宿主設定，見 C5.2） | `saveAs`、`exportArtboard`、`openFile`、`host` |
| `send-to` | 新（轉存：網頁用 WebP、印刷用、送到 Mockup；API 同 `NA/components/tools/OutputTrackBar.tsx:87`） | `exportArtboard` |
| `qr`、`barcode` | 既有 | `placeSvg` |
| `mockup`、`batch-export` | 既有 | `exportArtboard` |

| 卡號 | 做什麼 |
|---|---|
| C4.1 | dock 外殼共用：`NA/public/vector-pro-dock/dock.js:68` `mountDock` 與同目錄 `theme.css` 搬到 `NA/public/editor-shared/dock.js`／`dock.css`，參數 `{ makeCtx, panelIds, storeKey, frame, sizes: { rail, button, panel, panelMin, panelMax, tab, pad } }`；`vector-pro-dock/dock.js` 只剩自己的清單（`:14-24`）、尺寸（`:26-28` 的 310／220／720、圖示欄 38）、`applyDefaultWorkspace`（`:54`）；新 `NA/public/photo-pro-dock/dock.js`：`panelIds` = 上表、`sizes = { rail: 36, button: 28, panel: 290, panelMin: 250, panelMax: 720, tab: 28, pad: 8 }`（`PC/crates/ui-egui/src/panels/dock.rs:37,73`、`panels/panel_docking.rs:89-91,561`、`widgets/panel.rs:53`）、`makeCtx = createPhotocraftCtx`。外觀只用統一 class 與主題 token，零色碼（測試守）。向量版 e2e 仍綠 |
| C4.2 | 轉接器 `NA/public/editor-shared/ctx-photocraft.js`：照 C1.5 寫進契約的指令序列實作 `ctx-contract.md` 全部方法（`placeSvg`、`placeImage`、`selectedImage`、`replaceImage`、`exportArtboard`、`setArtboardSize`、`openFile`、`saveAs`、`ready`、`info`、`busy`）＋新增兩個：`selectionMask() → Blob\|null`、`fitLayer('fit'\|'fill')`（`ctx-vectorcraft.js` 同步補上或在契約標「此宿主不提供」，面板據此隱藏）。bytes 進出一律走 `photocraft:open`／`photocraft:save` 訊息（依 `name` 配對，逾時 reject）；呼叫排隊一次一個（同 `ctx-vectorcraft.js:53`）。語言：`ready()` 後第一次設 `interface.language = zh-hant`，之後尊重使用者偏好。**原生的另存／匯出要照常下載**：C1.3 之後有宿主時 PhotoCraft 的 Save As／Export As／Save a Copy 不再自己下載，而是發 `photocraft:save`；轉接器沒在等的（不是面板發起的）一律由父頁用 `<a download>` 存到使用者電腦，檔名照訊息的 `name`。契約加 `ctx.host = { id: 'photocraft', sourceExt: '.pcraft', sourceName: 'design.pcraft', saveTag: { source: 'canvas', modelName: 'canvas', prompt: 'canvas edit' }, listSources: ['canvas'] }`（`ctx-vectorcraft.js` 補同形狀：`.vectorcraft`／`vector-pro`／`['vector-editor','vector-pro']`） |
| C4.3 | 四個新面板 `NA/public/editor-shared/blocks/{ai-fill,outpaint,edge-mask,send-to}.js`（`export default { id, title, icon, mount(ctx, body) }`）。數學與預設值只留一處：`NA/lib/studio/edge-mask.ts:145-330` 的 `EDGE_MASK_STYLES`／`buildMaskSvg`／`applyEdgeMask` 搬到 `NA/public/editor-shared/edge-mask.js`，`lib/studio/edge-mask.ts` 改成只加型別的門（照 `NA/lib/studio/editor-color-grade.ts:1-7`）；`NA/lib/studio/outpaint-presets.ts:9-22` 同樣搬 `NA/public/editor-shared/outpaint-presets.js`。API 不新增：`/api/tools/studio/inpaint`、`/api/tools/studio/genfill`（`CE:1503,1865`）。面板內不用下拉（`CE:2659` 的擴圖方向 select 改成看得到的按鈕）。`send-to`（轉存）三顆鈕：🌐 網頁用（`POST /api/tools/image/process` `mode=web` → WebP）、🖨 印刷用（`mode=print`＋`NA/lib/studio/print-destinations.ts` 的目的地，看得到的按鈕）、送到 Mockup（存入 My Designs 後開 `/tools/mockup?design=<id>`；`NA/app/(shell)/tools/mockup/MockupStudio.tsx:248` 的 `designRef` 加讀這個參數預選）；payload 形狀照 `OutputTrackBar.tsx:83-110`，不新增 API |
| C4.4 | 測試：(a) `NA/lib/studio/__tests__/photo-pro-dock.test.ts`：面板 id 與 `photo-pro-dock/dock.js` 清單相等；`blocks/*.js` 用到的每個 `ctx.<方法>(` 都在 `ctx-photocraft.js` 與 `ctx-contract.md`；`ctx-photocraft.js` 對 mock `photocraft`／postMessage 每個方法一條、參數型別照上游原始碼；每個模組真的被解析（複製成 `.mjs` 再 `node --check`）；新檔零色碼。(b) 登入 e2e `INFRA/tests/e2e/smoke/06-photo-pro.spec.ts`：每個面板主要按鈕按一次並檢查效果（照 `05-vector-pro.spec.ts`）；另驗原生 File › Export 之後瀏覽器真的收到下載（R11）。合 main 前在 detached 整合工作樹跑 `tsc`＋vitest 全套 |

### C5 My Designs 原始檔與登入實測

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `NA/lib/studio/design-source.ts:6` `SOURCE_EXTS` 加 `.pcraft`；嗅探：ZIP 檔頭 `PK\x03\x04` 且含 `manifest.json` 項（`PC/book/src/formats/pcraft.md:3-15`）；`:38` 的錯誤訊息一起改。不改 schema（仍寫 `metadata.source_*`）。上限沿用現值；超過時面板顯示「檔案太大，改用 檔案 › 另存 下載」而不是靜默失敗 |
| C5.2 | 「My Designs」面板改成依宿主設定、兩個編輯器共用同一檔：`NA/public/editor-shared/blocks/my-designs.js:10` 的 `SOURCES`、`:60` 寫死的 `design.vectorcraft`／`vector-pro`、`:73` 的預設檔名、`:89` 的清單過濾，全部改讀 `ctx.host`（C4.2）。畫布專業版存入＝`exportArtboard` PNG 預覽＋`saveAs()` 的 `.pcraft`，`source: "canvas"`、`modelName: "canvas"`（與 `CE:2000` 相同 → 「我的設計」分頁、Mockup 的設計挑選 `?group=print`、發佈精靈照舊看得到，`NA/lib/studio/asset-group.ts:16`）。開啟＝有原始檔就 `openFile`（讀檔走 `/api/tools/designs/download?url=`），否則以圖片開。舊專案匯入（`:41`）依宿主：向量走既有 SVG 路徑，畫布走 C7.2 |
| C5.3 | REALTEST（操作者的 Chrome）：打繁中字、存入 My Designs、在「我的設計」看到縮圖、再開回來圖層還在 |

### C6 驗收、升級流程、文件

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `06-photo-pro.spec.ts` 納入 `/playwright smoke`（`--use-gl=angle --use-angle=swiftshader`，等 `window.photocraft`） |
| C6.2 | `scripts/photocraft-pro/README.md`：前置需求、建置、升級（改 `PIN.json` → `build.ps1` → C1.5 smoke → rsync 新版本資料夾 → 切 `current` → C6.1 → 失敗切回）、保留最近 2 版、上游接好介面後刪補丁的步驟、**加一個字型的步驟**（改 `scripts/craft-web-build/fonts.json` → 重建 → 上傳；舊編輯器的執行期「＋上傳字型」`NA/components/tools/FontLibrary.tsx:108` 由這個步驟取代） |
| C6.3 | `agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記一條（開頁＋`ui.inspect`）；`agency-os/docs/architecture/decisions/ADR_INDEX.md` 加一列指向研究報告（不新開 ADR） |
| C6.4 | WORKLOG：四行機械證據；記憶 `project_photocraft_pro_supervisor.md` 更新 |

### C7 入口改接、舊檔、舊編輯器退場（只留一套）

| 卡號 | 做什麼 |
|---|---|
| C7.1 | 入口：`NA/components/tools/canvas-handoff.ts:94` `CANVAS_STAFF_HREF` 改 `/tools/photo-pro`；`openInCanvas`（`:98`）加選填第四參數 `source?: { url, name }`（可編輯原始檔），存進同一個交接。`ProEditorFrame`（C3.1）載入後 `readCanvasSource()`：有 `source` → 經 `/api/tools/designs/download?url=` 取檔 → `ctx.openFile(blob, name)`（圖層都在）；沒有 → 圖片 `ctx.openFile(blob, <CANVAS_NAME_KEY>.png)`。既有五個呼叫端（`BannerStudio.tsx:1313`、`StudioWorkbench.tsx:1707,1928`、`TarotStudio.tsx:2124`、`OutputTrackBar.tsx:178`、`DesignsGallery.tsx:1295`）前四個不改；`DesignsGallery.tsx:1295` 改成帶 `asset.source_url`＋`metadata.source_name`，並依副檔名選目的地（`.pcraft` 或沒有原始檔 → 畫布專業版；`.vectorcraft`／`.svg` → `/tools/vector-pro`，向量頁同樣由 `ProEditorFrame` 讀交接）。**新增第六個入口**：Mockup 結果圖加「在畫布編輯」鈕（`NA/app/(shell)/tools/mockup/MockupStudio.tsx:835` 與 `ModelMockupPanel.tsx:183` 的「存入 My Designs」旁，同一個 `openInCanvas`）。門頁 `NA/app/design/canvas/page.tsx:6` 改載新頁元件。e2e：從 Studio、塔羅、Banner、Mockup、我的設計（PNG 與有原始檔各一）按下去 → 專業版裡有那張圖／那份圖層 |
| C7.2 | 舊專案檔（待決 3 回答「有」才做）：My Designs 面板加「匯入舊專案（.design.json）」：本機選檔 → Fabric 離屏 `loadFromJSON`（格式 `awarewave-design/1`，`CE:181`；先驗用哪個 Fabric 版本載得起 Fabric 7 的 JSON）→ 每個頂層物件各出一張透明 PNG → 依原順序 `placeImage`。文字會變成像素，面板上寫明 |
| C7.3 | 退場（操作者在正式站用過專業版並說可以之後）：`NA/app/(shell)/tools/canvas/page.tsx` 改 `redirect('/tools/photo-pro')`；刪 `CE`；`fabric-filters.ts` 搬 `NA/lib/studio/fabric-filters.ts`（改 `NA/components/tools/GradedPreview.tsx:22` 等 import）；`NA/app/sidebar-sections.ts:68` 移除 Canvas Editor；`NA/lib/portal/products.ts:68` nav「畫布」改指 `tools/photo-pro`、`:74` `staffPaths` 移除 `tools/canvas`；`VectorProFrame`（C3.1 後為 `ProEditorFrame` 的 `fallback`）不再指向 `/tools/canvas`；`NA/lib/studio/canvas-fit.ts` 等只被 `CE` 用的模組 grep 無 import 才刪；`INFRA/tests/e2e/editor-merge/card-0{1..6}-*.mjs` 刪除或改跑專業版；`editor-*-drift.test`／`editor-filter-ownership.test` 的 canvas 端改指 `blocks/`。`fabric` 依賴保留 |
| C7.4 | 文件：RUNNABLE_DEMOS 舊條目改指專業版；記憶 `project_pod_image_edit_feature.md`、`project_vector_editor_blocks.md` 更新；WORKLOG |

## 7. 驗證計畫（四動作）

- 實測：C1.5／C2.4／C3.4／C5.3／C6.1／C7.1 各自的 curl／瀏覽器／playwright 指令與輸出；驗收以登入 e2e 每個面板綠＋操作者在正式站用過為準。
- Review：每張卡 `/codex-review`（Claude 寫）；C2 另 `docker exec lobster-nginx nginx -t`；補丁另讀 `git apply --check` 輸出。
- 抓蟲：grep `photo-pro`、`photocraft`、`CANVAS_STAFF_HREF`、`tools/canvas` 於 `NA/ INFRA/ agency-os/ scripts/ .claude/`；`.md` 另跑 `audit-cross-machine-bom`。
- WORKLOG：每卡一段，`REALTEST_EVIDENCE`／`REVIEW_DONE`／`BUGHUNT_DONE` 三行。
- 派工：照 BRIEF §7（最多 4 個工人、檔案清單不重疊、brief 結尾 FILES／TESTS／RISKS、回報繁中）。建議模型：C1、C4 Opus 5.5；C2、C3、C5、C6 fullstack-engineer（Sonnet）；C7 Opus 5.5；每卡驗收 Fable。
