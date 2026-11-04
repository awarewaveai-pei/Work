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

B。決策：靜態檔由 nginx 供給、版本目錄 `<rev7>/`＋`current` symlink；積木抽到 `NA/public/editor-shared/blocks/`，舊編輯器與專業版各用一個 ctx 轉接器；專業版頁在 design 門下 `tools/vector-pro`；舊 `tools/vector-editor` 保留。

## 6. 實作計畫

### C1 建置鏈（本機）

| 卡號 | 做什麼 |
|---|---|
| C1.1 | 本機裝 `rustup`（stable ≥ 1.95，`VC/Cargo.toml` rust-version）、`rustup target add wasm32-unknown-unknown`、`cargo install trunk`；寫入 `scripts/vectorcraft-pro/README.md` 前置需求段 |
| C1.2 | 新檔 `scripts/vectorcraft-pro/PIN.json`（`{rev, craftFontsRev, notoSansTc:{url,sha256}}`）＋`scripts/vectorcraft-pro/build.ps1`：clone／fetch 到 `%LOCALAPPDATA%\awarewave\vectorcraft-src`（repo 外）；checkout `rev`；fonts 目錄 = craft-fonts checkout ＋ 下載 Noto Sans TC（OFL，校 sha256）追加 manifest 列；`web-fonts.txt` 追加 `startup | Noto Sans TC | Regular`（patch 檔 `scripts/vectorcraft-pro/web-fonts.patch`，`git apply --check` 失敗即停）；`trunk build --release`；輸出 `dist/<rev7>/`＋`NOTICE`＋`SHA256SUMS`；每個 `.wasm/.js/.otf` 預壓 `.gz` |
| C1.3 | 本機 smoke：`python -m http.server` 供 `dist/<rev7>/`，內建瀏覽器開 `index.html?lang=zh-hant` → `await vectorcraft.request('ui.inspect')` 回 JSON、選單為繁中、打 3 個繁中字截圖；結果寫 README「驗證」段 |

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

### C4 積木共用層（LEGO）

| 卡號 | 做什麼 |
|---|---|
| C4.1 | 抽出：`NA/public/vector-editor.html` 內 `AB.registerBlock` 的 qr／barcode／batch-export／mockup／ai-bg／my-designs 六個積木搬到 `NA/public/editor-shared/blocks/<id>.js`（ES module，`export default { id, title, icon, mount(ctx, body) }`，程式碼原樣搬），`vector-editor.html` 改 `import` 後 `AB.registerBlock`；ctx 不變；既有 smoke 綠、`public-html-sri.test` 綠 |
| C4.2 | 新檔 `NA/public/editor-shared/ctx-contract.md`（≤30 行）：ctx 必備方法 `addSvg(svg)`、`grabDesign()→Blob(PNG)`、`info(msg)`、`busy(on)`、`mm2px/px2mm`、`snapshot()`；新檔 `NA/public/editor-shared/ctx-vectorcraft.js`：用 `iframe.contentWindow.vectorcraft` 實作（`addSvg`→`openFile`；`grabDesign`→`execute('app.export',{format:'png'})`＋`captureDownloads`／`readFile`；`snapshot`→`execute('edit.undoMark')` 或無）；新檔 `ctx-fabric.js` 只是把現有 ctx 物件導出，不改邏輯 |
| C4.3 | 新檔 `NA/public/vector-pro-toolbox.js`：右側 `<aside>`（寬 310，照真品 dock）列六個積木 `<details>`，`mount(ctx, body)`；`page.tsx` 載入它（iframe 同源） |
| C4.4 | 測試 `NA/lib/studio/__tests__/editor-blocks-parity.test.ts`：兩個 host 載入的積木 id 集合相等；`ctx-vectorcraft.js` 對 mock `vectorcraft` 的契約測試（六個方法各一條） |

### C5 繁中與存檔

| 卡號 | 做什麼 |
|---|---|
| C5.1 | 預設工作區 Essentials Classic（control bar 開，`VC/crates/ui-egui/src/workspaces.rs:86`）：toolbox 載入後 `vectorcraft.request('ui.menu.invoke', {path:['Window','Workspace','Essentials Classic']})` 一次，之後尊重使用者偏好（`localStorage` 旗標） |
| C5.2 | my-designs 積木（C4.1 搬來的）在 pro ctx 下：`captureDownloads(true)` → 使用者按「存入 My Designs」→ `execute('file.saveAs',{format:'vectorcraft'})`＋PNG 預覽 → POST `NA/app/api/tools/designs/route.ts`（既有欄位，原檔以 `attachments` 或既有 json 欄存；不改 schema，超限則拒並說明） |
| C5.3 | REALTEST：打繁中字、存入 My Designs、在「我的設計」看到縮圖、下載回 `.vectorcraft` 可再開 |

### C6 驗收、升級流程、文件

| 卡號 | 做什麼 |
|---|---|
| C6.1 | `INFRA/tests/e2e/` 加 smoke：開 `/tools/vector-pro`（`--use-gl=angle --use-angle=swiftshader`）等 `window.vectorcraft`，`ui.inspect` 回 JSON；納入 `/playwright smoke` |
| C6.2 | `scripts/vectorcraft-pro/README.md` 升級段：改 `PIN.json` → `build.ps1` → C1.3 smoke → rsync 新 `<rev7>/` → 切 `current` → C6.1 smoke → 失敗切回舊目錄；保留最近 2 版 |
| C6.3 | `agency-os/docs/operations/RUNNABLE_DEMOS.md` 登記一條（開頁＋`ui.inspect`）；`agency-os/docs/architecture/decisions/ADR_INDEX.md` 加一列指向研究報告（不新開 ADR） |
| C6.4 | WORKLOG：四行機械證據；`vector-editor/page.tsx` 註解一行「快速出稿門；專業版在 tools/vector-pro」 |

## 7. 驗證計畫（四動作）

- 實測：C1.3／C2.4／C3.4／C5.3／C6.1 各自的 curl／瀏覽器／playwright 指令與輸出。
- Review：每張卡 `/codex-review`（Claude 寫）；C2 的 nginx 片段另 `docker exec lobster-nginx nginx -t`。
- 抓蟲：grep `vector-pro`、`editor-shared/blocks`、`registerBlock` 於 `NA/ agency-os/ scripts/ INFRA/`；`.md` 另跑 `audit-cross-machine-bom`。
- WORKLOG：每卡一段，`REALTEST_EVIDENCE`／`REVIEW_DONE`／`BUGHUNT_DONE` 三行。
