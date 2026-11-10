# effectcraft-pro 建置鏈（EC.1）

把 [storytold/effectcraft](https://github.com/storytold/effectcraft)（MIT OR Apache-2.0）的網頁版建成可部署的靜態目錄：上游自己的 `cargo xtask web`（不用 Trunk）。結構同 `scripts/filmcraft-pro/`；共用步驟在 `scripts/craft-web-build/lib.sh`。規格：`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/engine-route-plan-20261106.md` §9「EC」。

## 一鍵建置

```powershell
powershell -ExecutionPolicy Bypass -File D:\Work\scripts\effectcraft-pro\build.ps1
```

輸出：`%LOCALAPPDATA%\awarewave\effectcraft-dist\<rev前7碼>-<inputs前7碼>\`（`EFFECTCRAFT_HOME` 可改 base），並把這次的目錄名寫進 `effectcraft-dist\LATEST`。`inputs7` = sha256(`PIN.json`＋`scripts/craft-web-build/fonts.json`＋本資料夾所有 `*.patch`) 前 7 碼。組裝在 `.staging-*`、`SHA256SUMS -c` 通過才原子換名；失敗不動既有目錄。首次約 10 分鐘。

內容＝xtask 產物（`index.html`、`effectcraft_web.js`、`effectcraft_web_bg.wasm`、`worker.js`、`audio-worklet.js`、`sw.js`、`snippets/`、`manifest.webmanifest`、`favicon.svg`、`icon-256.png`、`icon-512.png`）＋`NOTICE`（末尾附 provenance）、`ATTRIBUTION.md`、`LICENSE-MIT`、`LICENSE-APACHE`＋`licenses/`（本建置加進 wasm 的字型各一份 OFL）＋`.wasm`／`.js` 的 `.gz`＋`SHA256SUMS`。

build.sh 機械檢查（任一不過即 FATAL、不出產物）：兩個 repo checkout 到釘的 rev；補丁 `git apply --check`；wasm-bindgen＝PIN；wasm-opt＝PIN 且 xtask 輸出裡真的跑了；`fonts.json` 字型 sha256；六個必備檔＋`snippets/`；wasm 內含 `NotoSansTC-Regular`、`NotoSerifTC-Regular`；`craft_brand_scan`（上游 `docs/brand/` 的標誌不得出現在任何產物檔，含 wasm）；`craft_name_scan`（產物除 NOTICE／LICENSE／ATTRIBUTION 外不得有 artcraft／discord 字樣，含 `.gz`）；`NOTICE`／`ATTRIBUTION.md`／`LICENSE-*` 在。

## 字型（跟 FilmCraft 不同）

EffectCraft 不用 craft-fonts 的 `CRAFT_FONTS_DIR`：字型以 `include_bytes!` 編進 wasm（`crates/text/src/fonts.rs:21-27`），每個 worker 的引擎都有。build.sh 從補丁後的 `fonts.rs` 讀出 `include_bytes!` 的 `assets/fonts/*` 檔，上游沒附的（＝補丁加的）從 `fonts.json` 下載驗 sha256 後複製進 `$SRC/assets/fonts/`，不另列一份清單；先 `git clean` 該資料夾，舊檔不會被編進去。字型下載到自己的 craft-fonts checkout `~/awarewave/craft-fonts-effectcraft`（不碰向量版、畫布版共用的 `~/awarewave/craft-fonts`）。

## 前置需求（一次性）

WSL Ubuntu＋rustup stable（含 `wasm32-unknown-unknown`）＋`git python3 curl gzip`。wasm-bindgen CLI 由 build.sh 依 PIN 裝到 `~/awarewave/tools/wasm-bindgen-<版本>/`。wasm-opt 取自 `~/.cache/trunk/wasm-opt-<PIN wasmOpt>/`（找不到即 FATAL；補法：先跑一次 `scripts/photocraft-pro/build.ps1`）。原始碼在 `~/awarewave/effectcraft-src`，每次建置 `checkout --force` 還原上次的補丁。

## PIN.json

| 欄位 | 意義 |
|---|---|
| `repo` / `rev` | storytold/effectcraft 與 commit：tag v0.21.1（11-06 五閘試建的同一顆，`p0-reeval-gates-20261106.md` §1） |
| `craftFontsRepo` / `craftFontsRev` | 只當 `fonts.json` 的下載目的地與授權檔來源（`licenseFrom`）；EffectCraft 上游 CI 不用 craft-fonts，沿用 FilmCraft 的同一顆 |
| `wasmBindgen` | wasm-bindgen CLI 版本（上游 `docs/web.md:15`、`xtask/src/main.rs` `WASM_BINDGEN`） |
| `wasmOpt` | `~/.cache/trunk/wasm-opt-<值>/`；xtask 在 wasm-opt 跑不起來時會靜默跳過最佳化，所以另查 xtask 輸出有 `$ "wasm-opt"` |

## 補丁

| 檔 | 做什麼 |
|---|---|
| `tc-fonts.patch` | `crates/text/src/fonts.rs`（1 檔 +4 −1）：Noto Sans TC、Noto Serif TC 兩個 static 列入內建清單（origin `bundled`）。來源紀錄 `video-workbench/docs/p0-reeval-evidence/effectcraft-tc-fonts.patch`；之後以本檔為準 |
| `no-artcraft-marks.patch` | （FC.5 起也拿掉名字與社群連結：頁首 Discord 按鈕與 getartcraft 按鈕、Home 左欄 Community 與「More ArtCraft apps」、Help 選單 Discord／ArtCraft 網站／Other ArtCraft Apps、About 的 ArtCraft 字樣與連結；`APP_PAGE` 改指 GitHub。翻譯表的同類句子由 `scripts/craft-web-build/debrand.py` 刪）`crates/ui-egui/src/header.rs`：拿掉 `include_bytes!("../../../docs/brand/artcraft-mark.png")`，`paint_logo` 改成不畫（呼叫點：頁首 About 按鈕 `header.rs:41`、About 對話框 `panels/dialogs.rs:390`；按鈕還在、只是沒圖）。原因：上游 `docs/brand/LICENSE-brand.txt` 規定改過的版本必須移除 ArtCraft 標誌。未補丁的試建產物 `craft_brand_scan` → `HIT effectcraft_web_bg.wasm ['artcraft-mark.png']` |

| `web-host-api.patch` | 嵌入橋（上游 v0.21.1 與 main `3102b6e6`〔11-06〕都沒有 `?host=parent`）：`apps/effectcraft-web` 加依賴 `craft-web-host`（storytold/craft-libs `2e2312dd`，與 FilmCraft 同一顆；`Cargo.lock` 一併補）、新檔 `src/host.rs`，改 `app.rs`／`files.rs`／`lib.rs`。訊息與語意同 FilmCraft 的橋，前綴 `effectcraft:`，見下節 |

## 嵌入橋（`?host=parent`）

同源父頁以 iframe 開 `index.html?host=parent`（或畫布加 `data-host="page"`）；跨源父頁或沒有父頁＝一般模式（下載）。只聽同源父視窗本身送來的訊息（`craft-web-host` 的 origin＋source 檢查）。

| 訊息 | 方向 | 內容 |
|---|---|---|
| `effectcraft:ready` | 引擎→父頁 | 已啟動並在聽；`file: false`＝請送 `bytes` |
| `effectcraft:open` | 父頁→引擎 | `{name, bytes}`；`.ecproj` 照 File › Open，其他照拖入匯入；超過 512 MiB 拒收（狀態列＋`failed`） |
| `effectcraft:save` | 引擎→父頁 | `{name, saveAs, bytes}`：原本會下載的每個檔（存檔、寫出的檔、Render Queue 輸出；多檔仍合成一個 `.zip`）。`saveAs: true`＝該檔成為文件本身（Save As、父頁沒送過的專案第一次存檔）；同名 Save、Save a Copy、輸出都是 `false`。判斷在下一個 frame 做（引擎寫完檔才設專案路徑，`crates/engine/src/cmd/file.rs` `save_to`） |
| `effectcraft:dirty` | 引擎→父頁 | 未存變更出現／消失 |
| `effectcraft:failed` | 引擎→父頁 | 啟動失敗或收不下檔案 |

嵌入模式比照 `?empty`：不開示範專案、不還原上次、不跳復原提示；父頁負責送要編的檔、離開前提醒未存。

升級：先查上游是否已內建繁中字型／嵌入橋 → 改 `PIN.json` → `build.ps1`；`git apply --check` 失敗＝重排補丁，正式站不受影響。

## 已知上游問題（不在這裡修）

重開專案後素材全部離線：`footage.missing` 列出全部，但檔案都在；對其中一個呼叫一次 `footage.relink` 就全部連回（`p0-reeval-gates-20261106.md` §3 ②）。頁面（EC.2）重開專案後補這一個呼叫。

## 其他防呆

- `checkout --force` 不刪未追蹤檔：建置前 `git clean -fdq`（不碰 ignored 的 `target/`），否則上一次（或中斷的）補丁新增的 `src/host.rs` 會讓 `git apply` 失敗（2026-11-06 實際踩到）。

## 回退

刪 `scripts/effectcraft-pro/`；產物目錄與 WSL 內的原始碼不影響任何正式環境，可手動刪。
