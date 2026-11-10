# filmcraft-pro 建置鏈（FC.1）

把 [storytold/filmcraft](https://github.com/storytold/filmcraft)（MIT OR Apache-2.0）的網頁版建成可部署的靜態目錄：上游自己的 `cargo xtask web`（不用 Trunk），繁中字型 Noto Sans TC、Noto Serif TC 由補丁 `tc-fonts.patch` 編進 wasm。做法正本：`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/engine-route-plan-20261106.md` 的「FC.1 建置鏈」。模式同 `scripts/photocraft-pro/`；共用步驟在 `scripts/craft-web-build/lib.sh`。

## 一鍵建置

```powershell
powershell -ExecutionPolicy Bypass -File D:\Work\scripts\filmcraft-pro\build.ps1
```

輸出：`%LOCALAPPDATA%\awarewave\filmcraft-dist\<rev前7碼>-<inputs前7碼>\`（`FILMCRAFT_HOME` 可改 base）。`inputs7` = sha256(`PIN.json`＋`scripts/craft-web-build/fonts.json`＋本資料夾所有 `*.patch`) 前 7 碼：改字型、補丁或任何釘都換新目錄。組裝在 `.staging-*` 完成、`SHA256SUMS -c` 通過才原子換名；建置失敗不動既有目錄。首次約 8 分鐘以上（含編譯）。

內容＝`index.html`、`filmcraft_web.js`、`filmcraft_web_bg.wasm`、`audio-worklet.js`、`favicon.png`、`snippets/`＋`NOTICE`（末尾附 provenance）、`ATTRIBUTION.md`（NOTICE 指向它）、`LICENSE-MIT`、`LICENSE-APACHE`＋`licenses/`（編進 wasm 的每個字型各一份 OFL 授權文字；名單由 build.sh 從補丁後的 `crates/text/build.rs` 讀出，不另列一份）＋`filmcraft_web_bg.wasm.gz`、`filmcraft_web.js.gz`＋`SHA256SUMS`。FilmCraft 檔名不帶 hash（用 `?v=` 查詢字串，上游 `packaging/web/README.md:19-21`），所以沒有 hash 檔名檢查，也不能對它們設長快取。

build.sh 機械檢查（任一不過即 FATAL，不出產物）：兩個 repo 能 checkout 到釘的 rev；補丁 `git apply --check`；wasm-bindgen 版本＝PIN；找得到 wasm-opt；`fonts.json` 每個字型 sha256 相符（`craft_web_fonts`）；四個必備檔在；wasm 內含 `NotoSansTC-Regular` 與 `NotoSerifTC-Regular`（bytes 搜尋）；dist 內任何檔的 sha256 不得等於上游 `docs/brand/` 內任何檔（品牌資產不出貨，R6）；`NOTICE`／`LICENSE-*` 在。

## 前置需求（一次性）

WSL Ubuntu＋rustup stable（含 `wasm32-unknown-unknown`）＋`git python3 curl gzip`。Smart App Control 擋本機編譯的 exe，所以全程在 WSL。wasm-bindgen CLI **不用自己裝**：build.sh 依 PIN 從 crates.io 裝到 `~/awarewave/tools/wasm-bindgen-<版本>/`。wasm-opt 取自 `~/.cache/trunk` 下最新版（別的建置留下的快取；找不到即 FATAL，補法：先跑一次 `scripts/photocraft-pro/build.ps1`）。

原始碼在 WSL ext4：`~/awarewave/filmcraft-src`、`~/awarewave/craft-fonts-filmcraft`（FilmCraft 專用，不與向量版、畫布版共用的 `~/awarewave/craft-fonts` 衝突）。每次建置 `checkout --force` 會還原上一次套的補丁。

## PIN.json

| 欄位 | 意義 |
|---|---|
| `repo` / `rev` | storytold/filmcraft 與 commit（dist 目錄名前 7 碼） |
| `craftFontsRepo` / `craftFontsRev` | storytold/craft-fonts 與 commit（上游 `.github/workflows/release.yml:28` 同一顆） |
| `wasmOpt` | wasm-opt 版本＝`~/.cache/trunk/wasm-opt-<值>/` 的目錄名（Trunk 的快取）。只接受這一版；找不到或跑不起來就 FATAL。xtask 在 wasm-opt 跑不起來時會**靜默跳過**最佳化，所以 build.sh 另查 xtask 的輸出裡真的有 `$ "wasm-opt"` 那一行 |
| `wasmBindgen` | wasm-bindgen CLI 版本（上游 `docs/web.md:13`；須等於 Cargo.lock 的 wasm-bindgen crate） |

## 補丁

| 檔 | 做什麼 |
|---|---|
| `no-artcraft-marks.patch` | （FC.5 起也拿掉名字與社群連結：頁首 Discord 按鈕、Import 頁 Community 段、Help 選單 Discord／ArtCraft 網站／getartcraft.com、About 的 ArtCraft 字樣與連結；`links.rs`、`menus.rs`、`header.rs`、`panels/dialogs.rs`、`panels/import_mode.rs`。翻譯表裡的同類句子由 `scripts/craft-web-build/debrand.py` 在套完補丁後刪掉，建置最後 `craft_name_scan` 確認產物（NOTICE／LICENSE／ATTRIBUTION 除外）沒有 artcraft／discord 字樣）只動 `crates/ui-egui/src/brand.rs`：拿掉兩個 `include_bytes!`（ArtCraft 字標 PNG），兩個函式改回傳 `None`（呼叫點 `panels/dialogs.rs:470`、`panels/import_mode.rs:50` 本來就處理 `None`）。原因：上游 `docs/brand/LICENSE-brand.txt` 規定改過的版本必須移除 ArtCraft 標誌。升級時上游若新增別處的標誌，`craft_brand_scan` 會 FATAL |
| `tc-fonts.patch` | 動 `crates/text/build.rs`、`crates/text/src/fonts.rs`（2 檔 +2 −2）：`wasm_keeps` 在上游原有的 BIZ UDPGothic、Noto Sans Thai 之外多點名 Noto Sans TC、Noto Serif TC（編進 wasm 的共四個）；fallback 排序讓 TC 字型排在日文字型前。來源紀錄：`video-workbench/docs/p0-reeval-evidence/filmcraft-tc-fonts.patch`（11-06）；之後以本檔為準 |

升級：先查上游是否已內建繁中字型 → 改 `PIN.json` → `build.ps1`；`git apply --check` 失敗＝上游改了這兩個檔，重排補丁，正式站不受影響。

## 回退

刪 `scripts/filmcraft-pro/`；產物目錄與 WSL 內的原始碼不影響任何正式環境，可手動刪。

## 品牌標誌檢查（2026-11-06 審查後加）

`scripts/craft-web-build/lib.sh` 的 `craft_brand_scan <上游 checkout> <檔或目錄>…`：上游 `docs/brand/` 每個標誌檔取七段 64 bytes，在產物每個檔（含 wasm）裡搜尋，命中即 FATAL。整檔 sha256 比對抓不到編進 wasm 的標誌（wasm-opt 會把資料段切開）。驗證：對沒套 `no-artcraft-marks.patch` 的舊產物 `46763a8-08fe890` 跑 → `HIT … ['artcraft-logo-white.png', 'artcraft-logo.png']`、exit 1；對 `46763a8-b7f3040` → exit 0。

同日用同一方法掃其他引擎：向量版 `4cce336-b9af74d`、畫布版 `photocraft-web-…_bg.wasm` 都是 0 命中；EffectCraft v0.21.1 命中 `artcraft-mark.png`（上游 `crates/ui-egui/src/header.rs:906`），卡 EC.1 要有對應補丁。向量版與畫布版的 build.sh 還沒呼叫這個函式（別的卡的檔）。

## 其他防呆

- `unset CARGO_TARGET_DIR`，並在建置前把 `$SRC/target/web/dist` 移成 `dist.prev`：xtask 若輸出到別處，不會把上一次的產物當成這一次的出貨。
- 編進 wasm 的字型名單從補丁後的 `fn wasm_keeps` 整個函式讀出（跨行也讀得到），並斷言含 Noto Sans TC、Noto Serif TC；每個字型的 OFL 授權檔放進 `licenses/`。
- NOTICE 末尾記 `rustc -V`、wasm-bindgen、wasm-opt 版本。
- `build.ps1` 先設 `[Console]::OutputEncoding` 為 UTF-8 再呼叫 `wslpath`（路徑含中文時不會被當成 CP950），並檢查它的 exit code。
- `filmcraft-dist\LATEST`：build.sh 換名成功後寫入這次的產物目錄名；`build.ps1` 讀它來回報，不用修改時間猜（Codex 2026-11-06）。
