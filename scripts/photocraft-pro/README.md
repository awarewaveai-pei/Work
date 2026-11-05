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

已搬到 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md`「PhotoCraft」段（實作 `ctx-photocraft.js`；卡 C4.2）。
