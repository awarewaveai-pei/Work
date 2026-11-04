# R0-PLAN：向量專業版（VectorCraft 嵌入）＋積木共用層

> 狀態只在 `data.mjs`（監工台）；本檔只寫做法。研究正本：`agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md`。
> 路徑縮寫：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/` = `lobster-factory/infra/hetzner-phase1-core/`；`VC/` = storytold/vectorcraft 原始碼 checkout（不進 repo）。

## 1. 任務理解

操作者要在 app.aware-wave.com 得到**完整 Illustrator 功能與相同排版**（她熟 Illustrator），同時保留現有出稿積木（QR／條碼／Mockup／批次匯出／AI 去背／My Designs），且積木架構要能繼續 LEGO 式擴張。
根本問題：現有 `NA/public/vector-editor.html`（Fabric.js，7 個工具）離 Illustrator 差 80+ 個工具，用 Fabric 補等於重寫；真品 `storytold/vectorcraft`（MIT OR Apache-2.0，815k 行 Rust，工具 89/92，版面即 Illustrator）有 WASM 網頁版並明寫供 iframe 嵌入（`VC/apps/vectorcraft-web/src/api.rs:1-17`，`window.vectorcraft` 介面）。

## 2. 現況分析

- `git log`：編輯器最近 6 commit = CARD-01～05（fc689bb27…0a24f4c29）把 Canvas Editor 與 Vector Editor 的面板做成同一聯集；本計畫不動那條線（舊編輯器保留為快速出稿門）。
- 嵌入點：`NA/app/(shell)/tools/vector-editor/page.tsx`（iframe 載 `/vector-editor.html`）；`NA/middleware.ts:476` 白名單 `vector-editor.html`；`NA/lib/portal/products.ts:73` design 門 `staffPaths` 含 `tools/vector-editor`，`nav` 無此項；`NA/lib/portal/staff-tools.ts:59-60` `STAFF_PLATFORM.pages` 放行 `/editor-shared`。
- 部署：`INFRA/scripts/sg-deploy.sh:294-302` rsync `apps/<APP>` 帶 `--delete` → **任何不在 git 的檔案放 `NA/public/` 會被刪**；17.5 MB wasm 不進 git → 必須放 app 樹外，由 nginx 供給。
- nginx：`INFRA/nginx/default.conf:237-320` app.aware-wave.com 區塊全部 `proxy_pass` 到 next-admin，無靜態 location；compose `INFRA/docker-compose.yml:31-35` nginx volumes 只掛 conf／htpasswd／log。改 nginx／compose 只走 `safe-infra-patch.sh`（AGENTS §0）。
- 真品網頁版：`trunk build --release` 出 `dist/web`（`VC/docs/development.md:16-33`；wasm 17.5 MB／gz 7.1 MB，WebGPU 退 WebGL2，`?webgl` 強制、`?lang=zh-hant` 選語言 `VC/apps/vectorcraft-web/src/main.rs:19-20`）；介面繁中 `VC/crates/ui-egui/src/i18n/zh-hant.tsv`；字型只內嵌 BIZ UDPGothic，其餘由 `VC/crates/text/web-fonts.txt` 列、`cargo xtask web-fonts` 從 `CRAFT_FONTS_DIR` 複製到 `fonts/<sha16>/`（SRI）；craft-fonts manifest 只有 Noto Sans CJK **SC**，無 TC → 要自加 Noto Sans TC（OFL）。不用 SharedArrayBuffer（grep 無 COOP/COEP）。
- 存檔：`vectorcraft.captureDownloads(true)` 後 `files()/readFile()` 讀回（`api.rs:13-15`）；My Designs 寫入走既有 `NA/app/api/tools/designs/route.ts`（vector-editor.html:1008 註解：image data URL ≤ 12,000,000 字）。
- 本機：無 rustup／cargo／trunk；RAM 43 GB、D 槽 454 GB。

## 3. 風險清單

| # | 風險 | 處置 |
|---|---|---|
| R1 | 真品 alpha，可能當掉或缺功能 | 版本釘 commit（`PIN.json`）；舊編輯器保留；升級走 C6 流程可回退 |
| R2 | 首載 7 MB | nginx `gzip_static` 預壓；hash 檔 immutable 快取；index.html no-cache |
| R3 | 瀏覽器無 WebGPU／WebGL2 | 頁面偵測失敗顯示說明並連回舊編輯器 |
| R4 | 繁中字型缺 | C1.2 加 Noto Sans TC 到 fonts；smoke 打繁中字截圖 |
| R5 | 靜態檔不經登入 | 內容是開源軟體本體、無資料；待決 1 由操作者確認 |
| R6 | nginx／compose 改動影響全站 | `safe-infra-patch.sh` 自動 backup→config→up→healthy→失敗還原 |
| R7 | sg-deploy `--delete` 刪掉 wasm | wasm 不放 `apps/` 樹，放 `/root/lobster-phase1/static/vector-pro/` |
| R8 | 積木抽出改壞舊編輯器 | C4.1 行為不變，既有 smoke 26 條綠才算 |
| R9 | 授權 | MIT OR Apache-2.0；`NOTICE` 隨 dist 一起放，頁尾連結 |

## 4. 方案比較

- **A 最小**：只嵌 iframe，不接積木。rollback：刪頁＋nginx location。缺：積木斷線，等於兩套工具。
- **B 完整（選）**：嵌 iframe＋積木共用層（一個積木、兩個 ctx 轉接器）＋繁中字型＋升級流程。rollback：每張卡獨立（nginx 切回 symlink；page.tsx 刪；積木模組 git revert）。

## 5. 建議方案

B。決策：靜態檔由 nginx 供給、版本目錄 `<rev7>/`＋`current` symlink；**只有一套編輯器**：Illustrator 的部分全是真品，我們獨有的 10 項做成第二 dock 欄（照真品面板尺寸與色值，Illustrator 本來就有多欄 dock），舊 `/tools/vector-editor` 在舊設計轉檔後退場（C7）；專業版頁在 design 門下 `tools/vector-pro`。不走 fork 加 Rust 面板：面板要用網路（Google Fonts、Replicate）與 HTML，egui 畫布放不下，且上游 `plugins.md` 明寫 panel plugins 不在 v1。

## 6. 實作計畫

### C1 建置鏈（本機）

| 卡號 | 做什麼 |
|---|---|
| C1.1 | 本機裝 `rustup`（stable ≥ 1.95，`VC/Cargo.toml` rust-version）、`rustup target add wasm32-unknown-unknown`、`cargo install trunk`；寫入 `scripts/vectorcraft-pro/README.md` 前置需求段 |
| C1.2 | 新檔 `scripts/vectorcraft-pro/PIN.json`（`{rev, craftFontsRev, notoSansTc:{url,sha256}}`）＋`scripts/vectorcraft-pro/build.ps1`：clone／fetch 到 `%LOCALAPPDATA%\awarewave\vectorcraft-src`（repo 外）；checkout `rev`；fonts 目錄 = craft-fonts checkout ＋ 下載 Noto Sans TC（OFL，校 sha256）追加 manifest 列；`web-fonts.txt` 追加 `startup | Noto Sans TC | Regular`（patch 檔 `scripts/vectorcraft-pro/web-fonts.patch`，`git apply --check` 失敗即停）；`trunk build --release`；輸出 `dist/<rev7>/`＋`NOTICE`＋`SHA256SUMS`；每個 `.wasm/.js/.otf` 預壓 `.gz` |
| C1.3 | 本機 smoke：`python -m http.server` 供 `dist/<rev7>/`，內建瀏覽器開 `index.html?lang=zh-hant` → `await vectorcraft.request('ui.inspect')` 回 JSON、選單為繁中、打 3 個繁中字截圖；結果寫 README「驗證」段 |
| C1.4 | 上游補丁 `scripts/vectorcraft-pro/api-addfont.patch`：`VC/apps/vectorcraft-web/src/api.rs:121-160` `install()` 加 `addFont(bytes: Uint8Array) → Promise<number>`（呼叫 `FontDb::global().add_font(bytes)`，同 `VC/apps/vectorcraft-web/src/fonts.rs:71`，回傳加入的 face 數並 `ctx.request_repaint()`）；`build.ps1` 以 `git apply --check` 套用；同一天對 storytold/vectorcraft 開 PR，合併後改 PIN 並刪補丁 |

### C2 承載（prod nginx 靜態）

| 卡號 | 做什麼 |
|---|---|
| C2.1 | 主機 `mkdir -p /root/lobster-phase1/static/vector-pro`；rsync `dist/<rev7>/` 上去（High：`# CONFIRMED-HIGH-RISK`）；`ln -sfn <rev7> current`；`SHA256SUMS -c` |
| C2.2 | compose（`safe-infra-patch.sh compose <file> nginx`）：nginx volumes 加 `- /root/lobster-phase1/static/vector-pro:/srv/vector-pro:ro`；repo 對照檔 `INFRA/docker-compose.yml` 同步同一列 |
| C2.3 | nginx（`safe-infra-patch.sh nginx <file> nginx`）：app.aware-wave.com 區塊加 `location /vector-pro/ { alias /srv/vector-pro/; types { application/wasm wasm; } gzip_static on; location ~ \.(wasm\|js\|otf\|ttf)$ { expires 1y; add_header Cache-Control "public, immutable"; } location ~ index\.html$ { add_header Cache-Control "no-cache"; } }`，放在 `location /` 之前；repo `INFRA/nginx/default.conf` 同步 |
| C2.4 | 驗證：`curl -sI https://app.aware-wave.com/vector-pro/current/index.html` 200；`curl -sI -H 'Accept-Encoding: gzip' …/<hash>.wasm` 回 `Content-Type: application/wasm`＋`Content-Encoding: gzip`；`docker exec lobster-nginx ls /srv/vector-pro/current` 有檔 |

### C3 app 門

| 卡號 | 做什麼 |
|---|---|
| C3.1 | 新檔 `NA/app/(shell)/tools/vector-pro/page.tsx`：iframe `src="/vector-pro/current/index.html?lang=zh-hant"`（`NEXT_PUBLIC_VECTOR_PRO_PATH` 可覆寫），`onError`／WebGL 偵測失敗顯示一行說明＋連到 `/tools/vector-editor`；頁尾一行 NOTICE 連結 |
| C3.2 | `NA/next.config.*`：`rewrites()` 當 `VECTOR_PRO_DEV_ORIGIN` 有值時把 `/vector-pro/:path*` 轉到該 origin（本機 `trunk serve` 8766），正式站無此變數 = 不改行為 |
| C3.3 | `NA/lib/portal/products.ts:73` design 門：`nav` 加 `{ path: "pro", name: "向量（專業版）", staff: "tools/vector-pro" }`，`staffPaths` 加 `tools/vector-pro`；`products.test`／`staff-tools.test`／`sidebar-coverage.test`／`npx tsc --noEmit` 綠 |
| C3.4 | REALTEST：deploy 後登入開 `/tools/vector-pro`，`ui.inspect` 回 JSON（內建瀏覽器 javascript_tool），截圖存 WORKLOG |

### C4 第二 dock 欄：妳獨有的 10 個面板，照真品面板規格長在 Illustrator 版面裡

功能逐項對照（`NA/public/vector-editor.html` 全部 11 個面板＋10 個積木）：

| 我們的功能 | 真品有？ | 處置 |
|---|---|---|
| 畫布尺寸 cm/mm/DPI、符合／填滿畫布、底色、透明底 | 有（`file.new {width,height,units,bleed}`、`artboard.setProps`、`document.setUnits`、`app.export {background}`） | 真品原生 |
| 範本庫（IG／FB／名片／海報尺寸預設） | 無 | **面板 1「尺寸範本」**：點一下 → `artboard.setProps`／`file.new` |
| 圖片匯入、向量描圖（ImageTracer／VTracer 預設）、匯入 SVG | 有（Image Trace `imageTrace.make/expand`＋預設；`openFile` 置入） | 真品原生；VTracer 本機伺服器退場 |
| Google Fonts 搜尋（中／英／全部）、上傳字型檔 | 無（web 版不讀系統字型；只有 `fonts/` 預載） | **面板 2「字型」**：搜尋／上傳 → fetch TTF → `vectorcraft.addFont(bytes)`（C1.4）→ 選取文字套 `type.setFont` |
| B/I/U、字距、行距、對齊、弧形文字、文字沿路徑 | 有（Character／Paragraph、Type on Path 五種效果） | 真品原生 |
| 填色／描邊／虛線／不透明／混合／漸層／陰影／光暈／遮罩／色票 | 有（Appearance、Effect › Stylize、Clipping Mask、Swatches） | 真品原生 |
| 對齊／分布、座標 mm、圖層、智慧磁吸、路徑簡化、出血＋裁切標記 | 有 | 真品原生 |
| 調色（CARD-05 `editor-shared/color-grade.js`：預設、HSL、模糊、自動） | 無同款（有 Adjust Colors 與 57 個 Photoshop 濾鏡，但不是這個面板） | **面板 3「調色」**：同一個 `color-grade.js`，對選取圖片離屏套 Fabric 5 濾鏡 → PNG → 換圖（§C4.3 換圖程序） |
| 去背：色鍵（RemoveColor）、AI（Replicate `/api/tools/studio/remove-bg`） | 無 | **面板 4「去背」**：同 `editor-shared/bg-remove.js`，同換圖程序 |
| 匯出 PDF 真實 cm、SVG、PNG DPI | 有（`app.export {format, ppi}`、PDF/X、出血、裁切標記） | 真品原生 |
| WebP ≤200KB 自動壓 | 無（有 WebP，無上限迴圈） | **面板 5「匯出 WebP」**：`app.export {format:'webp', quality}` 迴圈＋`captureDownloads` 量大小 |
| 存入 My Designs | 無 | **面板 6「My Designs」**：`file.saveAs .vectorcraft`＋PNG 預覽 → `/api/tools/designs` |
| 儲存／讀取專案 `.design.json` | 有（`.vectorcraft`） | 真品原生；舊檔見 C7 |
| QR Code（向量） | 無 | **面板 7「QR」**：SVG → `openFile` |
| 條碼（Code128／EAN／UPC／Code39） | 無 | **面板 8「條碼」**：SVG → `openFile` |
| 商品 Mockup 預覽（T 恤／帆布袋／馬克杯／手機殼／海報框） | 無 | **面板 9「Mockup」**：`app.export {format:'png', background:'transparent'}`（整個畫板）→ 畫商品 |
| 批次多尺寸匯出（IG／FB／名片／海報） | 無（Export for Screens 是比例縮放，不是重排尺寸） | **面板 10「批次匯出」**：同上取 PNG → 各尺寸合成 |
| 縮放／平移 | 有 | 真品原生 |

| 卡號 | 做什麼 |
|---|---|
| C4.1 | 版面：`page.tsx` 把 VectorCraft iframe 與 **第二 dock 欄** `NA/public/vector-pro/dock.js` 並排成一個全高容器（flex；iframe `flex:1`，dock 欄固定寬 310、可收成 38 的圖示欄，分頁高 33，內距 10，面板最小寬 220），色值從 `ui.inspect` 的 brightness 對應 `VC/crates/ui-egui/src/theme.rs:173-306` 四組 Modern tokens（app_bar／panel／tab_strip／input／border／text；accent `#f06a52`／`#d9472f`）寫成 `NA/public/vector-pro/theme.css` 的 CSS 變數；分頁列、圖示欄、» 收合鈕照 `VC/crates/ui-egui/src/panel_docking.rs:1208-1226` 的樣式；只有這一欄是我們的，其餘畫面全是真品 |
| C4.2 | 面板模組：`NA/public/editor-shared/blocks/<id>.js` 十檔（templates、fonts、color-grade、bg-remove、webp、my-designs、qr、barcode、mockup、batch-export），每檔 `export default { id, title, icon, mount(ctx, body) }`；qr／barcode／mockup／batch-export／templates／my-designs 的程式碼從 `vector-editor.html` 原樣搬；color-grade／bg-remove 面板 DOM 從 `vector-editor.html:362-383` 搬，數學仍 `import` 同一個 `editor-shared/color-grade.js`／`bg-remove.js`（CARD-05／06 的 SSOT 不動，drift 測試照舊）；fonts 面板從 `vector-editor.html:216-258` 的字型清單搬 |
| C4.3 | ctx 契約 `NA/public/editor-shared/ctx-contract.md`（≤30 行）：`placeSvg(svg)`、`placeImage(blob)`、`selectedImage()→{id, blob, transform}`、`replaceImage(id, blob)`（置入新圖 → 以 `document.node` 讀舊圖 transform 套到新圖 → 刪舊圖，一個 undo 步）、`exportArtboard({format, ppi, background, quality})→Blob`、`addFont(bytes)`、`saveAs()→Blob`、`info/busy`。實作 `NA/public/editor-shared/ctx-vectorcraft.js`（全部走 `iframe.contentWindow.vectorcraft`）。**C4.3 先做 spike**：`replaceImage` 用一張圖真測（位置、大小、旋轉不變）才繼續；做不到就改成「置入新圖並選取、舊圖隱藏」並寫進契約 |
| C4.4 | 測試 `NA/lib/studio/__tests__/vector-pro-dock.test.ts`：十個面板 id 與 `dock.js` 清單相等；`ctx-vectorcraft.js` 對 mock `vectorcraft` 的契約測試（每個方法一條）；`theme.css` 四組色值與 `theme.rs` 抽樣相等（寫死在測試，升級 PIN 時重抽） |

### C5 繁中與存檔

| 卡號 | 做什麼 |
|---|---|
| C5.1 | 預設工作區 Essentials Classic（control bar 開，`VC/crates/ui-egui/src/workspaces.rs:86`）：dock 欄載入後 `vectorcraft.request('ui.menu.invoke', {path:['Window','Workspace','Essentials Classic']})` 一次，之後尊重使用者偏好（`localStorage` 旗標）；dock 欄色值跟著 `ui.inspect` 的 brightness |
| C5.2 | 「My Designs」面板（C4.2）：`captureDownloads(true)` → 「存入 My Designs」→ `execute('file.saveAs',{format:'vectorcraft'})`＋`app.export png` 預覽 → POST `NA/app/api/tools/designs/route.ts`（既有欄位；不改 schema，超限則拒並說明） |
| C5.3 | REALTEST：打繁中字、存入 My Designs、在「我的設計」看到縮圖、下載回 `.vectorcraft` 可再開 |

### C6 驗收、升級流程、文件

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `INFRA/tests/e2e/` 加 smoke：開 `/tools/vector-pro`（`--use-gl=angle --use-angle=swiftshader`）等 `window.vectorcraft`，`ui.inspect` 回 JSON；納入 `/playwright smoke` |
| C6.2 | `scripts/vectorcraft-pro/README.md` 升級段：改 `PIN.json` → `build.ps1` → C1.3 smoke → rsync 新 `<rev7>/` → 切 `current` → C6.1 smoke → 失敗切回舊目錄；保留最近 2 版 |
| C6.3 | `agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記一條（開頁＋`ui.inspect`）；`agency-os/docs/architecture/decisions/ADR_INDEX.md` 加一列指向研究報告（不新開 ADR） |
| C6.4 | WORKLOG：四行機械證據 |

### C7 舊設計轉檔與舊編輯器退場（一套，不留兩扇門）

| 卡號 | 做什麼 |
|---|---|
| C7.1 | `scripts/vectorcraft-pro/convert-designs.mjs`：用 playwright 開舊 `/vector-editor.html` 逐一載入 My Designs 裡 `kind=vector` 的 `.design.json` → 既有「匯出 SVG（真實 cm）」→ 以同 id 存回 `designs` 的 `svg` 附件（不改 schema：用既有附件欄；沒有就加一個 nullable 欄的 migration 並記 High）；轉完數量＝原數量才算 |
| C7.2 | `/tools/vector-pro` 的「My Designs」面板開舊設計時取 SVG → `openFile`；e2e：舊設計開得起來、物件數與 SVG 一致 |
| C7.3 | `NA/app/(shell)/tools/vector-editor/page.tsx` 改 `redirect('/tools/vector-pro')`；`NA/middleware.ts:476` 白名單移除 `vector-editor.html`；`NA/public/vector-editor.html` 刪除；`products.ts` `staffPaths` 移除 `tools/vector-editor`；相關 e2e（card-01～06 取 vector frame 的）改成只跑 canvas；`editor-*-drift.test` 的 vector 端改指向 `blocks/color-grade.js`／`bg-remove.js` 面板；Canvas Editor（點陣）不動 |
| C7.4 | 文件：RUNNABLE_DEMOS 舊條目改指專業版；記憶 `project_vector_editor_blocks.md` 更新；WORKLOG |

## 7. 驗證計畫（四動作）

- 實測：C1.3／C2.4／C3.4／C5.3／C6.1 各自的 curl／瀏覽器／playwright 指令與輸出。
- Review：每張卡 `/codex-review`（Claude 寫）；C2 的 nginx 片段另 `docker exec lobster-nginx nginx -t`。
- 抓蟲：grep `vector-pro`、`editor-shared/blocks`、`registerBlock` 於 `NA/ agency-os/ scripts/ INFRA/`；`.md` 另跑 `audit-cross-machine-bom`。
- WORKLOG：每卡一段，`REALTEST_EVIDENCE`／`REVIEW_DONE`／`BUGHUNT_DONE` 三行。
