# photocraft-pro 建置鏈（R0-PLAN C1）

把 [storytold/photocraft](https://github.com/storytold/photocraft)（MIT OR Apache-2.0）的網頁版建成可部署的靜態目錄：上游自己的 `packaging/web/package.sh`（wasm gzip 切分段＋boot 頁）、我們的字型放進它的字型庫（`fonts/manifest.txt`）、`window.photocraft`＋`?host=parent` 由接線補丁接上游共用模組。產出給 C2 放到 ks-aw-01 `/root/lobster-phase1/static/photo-pro/`。模式同 `scripts/vectorcraft-pro/`；共用步驟在 `scripts/craft-web-build/lib.sh`。

## 一鍵建置

```powershell
powershell -ExecutionPolicy Bypass -File D:\Work\scripts\photocraft-pro\build.ps1
```

輸出：`%LOCALAPPDATA%\awarewave\photocraft-dist\<rev前7碼>-<inputs前7碼>\`（`PHOTOCRAFT_HOME` 可改 base）。`inputs7` = sha256(`PIN.json`＋`scripts/craft-web-build/fonts.json`＋本資料夾所有 `*.patch`) 前 7 碼：改字型、補丁或任何釘都換新目錄。組裝在 `.staging-*` 完成、`SHA256SUMS -c` 通過才原子換名。

內容＝上游 site（`index.html`、`photocraft-web-boot-<hash>.js/_bg.wasm`、`app/photocraft-web.js`、`app/parts.txt`、`app/photocraft-web-<hash>.part-a?`、`fonts/**`、`NOTICE`、`ATTRIBUTION.md`、`LICENSE-*`、`HOSTING.md`、`_headers`、`.htaccess`）＋`NOTICE` 末尾的 provenance＋`SHA256SUMS`。**不產 `.gz`**：分段檔本身就是 gzip、由頁面自己解（`PC/packaging/web/README.md:74-79`），nginx 不開 `gzip_static`。

build.sh 機械檢查（任一不過即 FATAL，不出產物）：補丁 `git apply --check`；補丁裡的 craft-libs rev ＝ PIN `craftLibsRev`；`fonts.json` 每個字型在 site 內且 sha256 相同、列在 site 的 `fonts/manifest.txt`；wasm-opt 有跑（重跑 `-Oz` 縮 >2% 即失敗）；根目錄 `.js/.wasm` 與 `app/*.part-*` 檔名帶 12–16 位 hex（nginx 一年快取只給這些；Trunk 的雜湊是**不補零**的 u64 hex，2026-11-06 實際出現 15 位 `b805b3f1c151ed2` → R0-PLAN C2.3 的 nginx regex `{16}` 要改 `{12,16}`，否則這種檔只是不長快取）；app glue 匯入的每個 `./snippets/…` 都在 `app/` 裡；`NOTICE`、`ATTRIBUTION.md`、`LICENSE-*` 在。上游 `package.sh` 另擋單檔 > 24 MiB。

**上游打包 bug 的繞道（非補丁）**：上游 `package.sh` 自 0.17.0 起只複製 `app/photocraft-web.js`，沒帶它相對匯入的 `snippets/`，網頁版卡在 Loading（storytold/photocraft#10590、#10017；修正 PR #10248 未合併，做法相同）。build.sh 在組裝時把 `dist/web/snippets` 複製到 `app/`——只在上游沒附時才做，上游合併後自動成為 no-op；上面那條「每個匯入都在」的檢查永遠跑。

## 前置需求（一次性）

同 `scripts/vectorcraft-pro/README.md`「前置需求」（WSL Ubuntu＋rustup stable ≥ 1.95＋`wasm32-unknown-unknown`；Smart App Control 擋本機編譯的 exe，所以全程在 WSL）。另需 `zip`（`package.sh` 最後打 zip 用；WSL 預設沒有，一次性：`wsl -d Ubuntu -u root -e apt-get install -y zip`）。Trunk **不用自己裝**：build.sh 依 PIN `trunk`（上游 CI 版本 0.21.14，`PC/.github/workflows/ci.yml` `TRUNK_VERSION`）從 crates.io 原始碼裝到 `~/awarewave/tools/trunk-<版本>/`，與向量版用的 trunk 分開。

原始碼在 WSL ext4：`~/awarewave/photocraft-src`、`~/awarewave/craft-fonts`（**與向量版共用**，兩個 build 不要同時跑）。

## PIN.json

| 欄位 | 意義 |
|---|---|
| `rev` | storytold/photocraft commit（dist 目錄名前 7 碼） |
| `craftLibsRev` | storytold/craft-libs commit：補丁裡 `craft-web-api`／`craft-web-host` 的 git rev（build.sh 驗兩者相同） |
| `craftFontsRev` | storytold/craft-fonts commit（上游 CI 同一顆：`PC/.github/workflows/ci.yml` `craft-fonts-ref`）；它的 `fonts/manifest.txt` 加上我們的字型＝site 的字型庫 |
| `trunk` | Trunk 版本（上游 CI／release 同一版） |

字型清單：`scripts/craft-web-build/fonts.json`（向量版共用）。**不設 `CRAFT_FONTS_DIR`**：設了會把 craft-fonts 全部嵌進 wasm（上游網頁 CI 也不設）；字型改由 site 供，第一次用到才下載（`PC/packaging/web/README.md`「Fonts」）。

## 補丁

| 檔 | 做什麼 |
|---|---|
| `web-host-api.patch` | 只動 `apps/photocraft-web/Cargo.toml`（加 `craft-web-api`、`craft-web-host`、`serde_json`）與 `apps/photocraft-web/src/web.rs`：`window.photocraft`（`PageApi`，走 desktop 控制伺服器同一條 `with_control` 通道；60 s＝`control::REPLY_DEADLINE` 到期時用請求的 `Dispatch::give_up()` 作廢，未執行的請求不會在分頁回前景後又跑一次（上游 #3662，與 TCP 傳輸相同）；`docInspect` 不裝：PhotoCraft 的 `document.inspect` 是引擎指令，用 `execute('document.inspect', {})`）；`?host=parent` 時 `photocraft:open` 進開檔 inbox、存檔／匯出改 `photocraft:save`（不下載）、`photocraft:dirty`、`photocraft:ready`。啟動失敗（無 WebGPU／WebGL2）時送 `photocraft:failed`，宿主不會一直等 `ready`。沒有宿主時行為與上游相同。`Cargo.lock` 不放進補丁（只多兩個套件，cargo 自己補，既有版本不動）。上游 PR 草稿：`UPSTREAM-PR.md`（未送） |

升級：每次先查上游是否已內建（`gh api repos/storytold/photocraft/contents/apps/photocraft-web/src` 有 `window.photocraft`／`?host=parent` 的接線 → 刪補丁）→ 改 `PIN.json` → `build.ps1` → 下方「驗證」的 smoke → 交 C2 上線（主機 `ln -sfn <新版> current`；失敗切回上一版；保留最近 2 版）。補丁 `git apply --check` 失敗＝上游改了網頁殼 → 重排補丁，正式站不受影響。

加一個字型：改 `scripts/craft-web-build/fonts.json` → 重建 → 上傳。

## 驗證

2026-11-06，dist `98bcbfa-f007c95`（rev `98bcbfa`）。

**建置**：`build.sh` exit 0，145 檔、101 MB（字型佔大半；`fonts/` 64 列 manifest＝craft-fonts 13＋`fonts.json` 51）；wasm 31,207,316 bytes，出貨＝1 個 gzip 分段 14,025,276 bytes（上游 release v0.20.2 web zip 13 MB，同級）；最大單檔 16.4 MB（< 24 MiB）；wasm-opt 不變量 0% 增益；`SHA256SUMS -c` 過。同輸入重建兩次 wasm 位元相同。

**smoke**（headless Chromium＋SwiftShader WebGL2＝C6.1 的旗標；本機內建瀏覽器面板隱藏時 egui 不出幀、請求不回，所以用 headless）：

```bash
# 供檔：一個資料夾放 smoke-host.html，dist 以 junction／symlink 掛成 ./pc/
python -m http.server 8899 --bind 127.0.0.1 --directory <該資料夾>
PLAYWRIGHT_DIR=D:/Work/lobster-factory/infra/hetzner-phase1-core/tests node scripts/photocraft-pro/smoke.mjs http://localhost:8899/smoke-host.html <片段.js> [截圖.png]
```

| 項 | 結果 |
|---|---|
| `?host=parent` | iframe 載入約 2.5 s 收到 `photocraft:ready {version:"1"}`；之後 `photocraft:dirty` 隨編輯變化 |
| `window.photocraft` | `request`、`execute`、`commands`、`uiInspect`、`screenshot`（`docInspect` 依上述不裝） |
| `request('ui.inspect')` | 回 JSON，44 個鍵（`session.documents`、`document`、`views`、`dialogs`…）；`commands()` 985 個 |
| 繁中介面 | `execute('prefs.set', {path:'interface.language', value:'zh-hant'})` → 選單「檔案(F) 編輯(E) 影像(I) 圖層(L)…」、面板全繁中（`smoke-zh-hant-tc-type.png`）。注意：`prefs.set` 是引擎指令，用 `execute`，不是 `request` |
| 我們的字型 | `type.create {font:'Noto Sans TC'}`「繁體中文嘸測試」（嘸＝Big5 專有字）、`{font:'Noto Serif TC'}` 明體正確渲染（同截圖）；iframe 的資源紀錄有 `fonts/noto-sans-tc/NotoSansTC-Regular.otf`、`fonts/awarewave/notoseriftc/NotoSerifTC-Regular.otf`（用到才抓；第一次 `type.create` 會回 warning「not installed; fallback」，字型到了就重排） |
| 下載不外流 | 有宿主時所有存檔／匯出都變 `photocraft:save {name, bytes}`，沒有觸發瀏覽器下載 |

截圖：`smoke-zh-hant-tc-type.png`（繁中選單、兩個繁中文字圖層、圖層面板）。

## ctx 指令序列

實測於上述 smoke（2026-11-06）。`ex(c,p)`＝`photocraft.execute(c,p)`；`inv(id)`＝`photocraft.request('ui.menu.invoke',{id})`；「等 save」＝等下一個 `photocraft:save`（網頁版存檔對話框直接用建議檔名，所以**一次只跑一個**、照順序配對，不靠檔名）；開檔＝父頁 `postMessage({type:'photocraft:open', name, bytes}, origin, [bytes])` 後輪詢 `request('ui.inspect').session.documents` 出現該名。文件索引＝`session.documents[].index`，作用中＝`session.active`。undo 步數＝`execute('document.inspect').history.length` 差。

| 動作 | 序列 | 原文件 undo | 結果 |
|---|---|---|---|
| 開檔 | `photocraft:open {name, bytes}` | 0（新分頁） | PNG／SVG／PSD 開成新文件；`session.documents[].path` 為 null |
| 整張 PNG | `inv('file.export.quickExportAsPng')` → 等 save | 0 | `<文件名>.png`，PNG 簽名 |
| 整張 WebP（JPEG 同法） | `inv('file.export.exportAs')` → 回 `{dialog:id}` → `request('ui.dialog.set',{dialog:id, field:'format', value:'webp'})`（另有 `quality`、`width/height`、`transparency` 欄）→ `request('ui.dialog.confirm',{dialog:id})` → 等 save | 0 | `<文件名>.webp`，RIFF 簽名 |
| 分層原檔 | `inv('file.saveAs')`（或 `file.saveACopy`）→ 等 save | 0 | **`.psd`**（`<名>.psd`／`<名> copy.psd`），分層、重開可編；**`.pcraft` 做不到**，見下 |
| SVG 置入 | 開 SVG（成文件 k）→ `ex('layer.copyToDocument',{document:目標, center:true, name})` → `ex('file.close',{document:k, save:'discard'})` | 1 | 成 **Shape 圖層**（向量，不是點陣）、置中、為作用中圖層 |
| 圖片置入成新圖層 | 開圖（文件 k）→ `ex('layer.copyToDocument',{document:目標, at:[cx,cy] 或 center:true, name})` → 關 k | 1 | 原像素大小、`at` 為中心點、在作用中圖層之上 |
| 取作用中圖層像素 | `ex('layer.list')` 取 `bounds [x,y,w,h]` → `ex('layer.duplicate',{layer:id, document:'new'})` → `ex('image.crop',{x,y,width:w,height:h})` → `inv('file.export.quickExportAsPng')` → 等 save → `ex('file.close',{save:'discard'})` → `ex('document.activate',{document:原})` | 0 | PNG＝圖層 bounds 大小（實測 120×80） |
| 換作用中圖層像素 | 記 `{id, name, bounds}` → 開新圖（文件 k）→ `ex('layer.copyToDocument',{document:原, at:[x+w/2, y+h/2], name})` → 關 k → `ex('layer.delete',{layer:舊id})` | 2 | 堆疊位置、bounds、名稱不變（實測 idx 0→0、[40,60,120,80]→同）；新 id；圖層樣式／遮色片不帶過去 |
| 選取→遮罩 PNG（作用中圖層框） | 取作用中圖層 bounds → `ex('image.duplicate',{name:'__mask'})`（副本帶選取）→ `ex('layer.new.layer')` → `ex('edit.fill',{contents:'white'})` → `ex('select.inverse')` → `ex('edit.fill',{contents:'black'})` → `ex('image.crop',{x,y,width:w,height:h})` → `inv('file.export.quickExportAsPng')` → 等 save → `ex('file.close',{save:'discard'})` → `ex('document.activate',{document:原})`。沒選取＝`execute('document.inspect').hasSelection` false → 回 null | 0（選取保留） | 白＝選取、黑＝其餘、不透明；實測 50×30 選取 → 120×80 圖中白 1500 點。座標框＝作用中圖層 bounds（W3 的假設） |
| 快速遮色片塗出的範圍 | `ex('select.editInQuickMaskMode',{on:true})` → 使用者塗 → `{on:false}` → 選取 → 同上一列 | 3（進、每筆、出各 1；改 `channel.options` 再 +1） | PhotoCraft 的快速遮色片**以白色＝選取**（實測：`indicates:'selected'`＋塗白 → 選取＝筆畫；預設模式先 `edit.fill black` 再塗白 → 選取＝筆畫）。預設前景是黑、無選取進 Q 時全為選取，**直接塗＝把塗到的排除**（選取＝整張扣筆畫），與舊編輯器「紅筆塗＝要改」相反 → 面板說明（C4.3）要寫成「按 Q，按 X 換白色再塗」，或轉接器在進 Q 時先 `channel.options {channel:'quickMask', indicates:'selected'}`（要在 Q 開啟中設才生效）＋前景改白 |
| 圖層縮到符合／填滿畫布 | 取 `bounds b`、畫布 `W×H`（`ui.inspect().document` 或 `session.documents`）→ `s = min(W/b.w, H/b.h)`（填滿用 max）→ 目標框置中 → `ex('edit.transform',{layer:id, quad:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]})` | 1 | 實測 120×80 → 符合 `[0,16,400,268]`、填滿 `[-25,0,450,300]` |

**整張存原始檔＝`.psd`**（`inv('file.saveAs')`；網頁版不出 `.pcraft`，`crates/ui-egui/src/app/files.rs:236-245`；主 session 2026-11-06 定案 My Designs 原始檔存 `.psd`，不加補丁）。

做不到（需要決定，沒有自行加補丁）：

1. **`.pcraft` 原生檔存不出來**。網頁版路徑型存檔全部關閉（`crates/engine/src/cmd/file_cmds.rs:76`「not available on the web (no file system)」，`file.saveACopy {path}`、`layer.exportAs {path}` 同）；互動式另存的副檔名由上游決定：文件沒有自己的路徑時，只有 `.pdn`→`pcraft`、`.kra`→`ora`，其餘一律 `.psd`（`crates/ui-egui/src/app/files.rs:236-245`）。網頁版開檔一律沒有路徑，連開一個 `.pcraft` 再另存也會變 `.psd`；網頁存檔對話框直接回建議檔名，使用者也改不了。選項：(a) My Designs 原始檔改存 `.psd`（零補丁，現在就能做；PhotoCraft 讀寫 PSD 含圖層，但 PhotoCraft 專有、PSD 表達不了的東西會降級）；(b) 接線補丁多一處：有宿主時 `FileDialogRequest::Save` 的回答由頁面指定副檔名（計畫外補丁，要操作者同意）；(c) 向上游提「網頁版 Save As 預設 `.pcraft`」。影響卡 C5.1／C5.2（W4 正在做 `.pcraft` 嗅探）。
2. 存檔訊息的 `saveAs` 恆為 `false`、沒有 `id`：宿主收到 `photocraft:save` 就要可靠落地；失敗時文件已被標成已存（`write_unconfirmed=false`），離頁保護解除——C4.2 的父頁存檔要「存不成就提示並保留 bytes」。
