# vectorcraft-pro 建置鏈（C1）

把 [storytold/vectorcraft](https://github.com/storytold/vectorcraft)（MIT OR Apache-2.0）的 WASM 網頁版建成可部署的靜態目錄，含繁中字型與 `addFont` API 補丁。產出給 C2 rsync 到 ks-aw-01 `/root/lobster-phase1/static/vector-pro/`。

## 一鍵建置

```powershell
powershell -ExecutionPolicy Bypass -File D:\Work\scripts\vectorcraft-pro\build.ps1
```

輸出：`%LOCALAPPDATA%\awarewave\vectorcraft-dist\<rev前7碼>-<inputs前7碼>\`（`VECTORCRAFT_HOME` 環境變數可改 base）。目錄名含**全部輸入**的身份：`inputs7` = sha256(PIN.json＋兩個 patch) 前 7 碼——只改字型或 patch、`rev` 不變時也會得到新目錄，C6「保留最近 2 版」才守得住；組裝在 `.staging-*` 完成並通過 `SHA256SUMS -c` 後才原子換名，失敗不汙染既有 dist（codex oracle 2026-11-05 兩個 finding 的治本）。內容 = trunk 產物 + `fonts/`（SRI 命名）+ `NOTICE`（含 provenance）+ `LICENSE-*` + `SHA256SUMS`；`.wasm/.js/.otf/.ttf` 各帶預壓 `.gz`（nginx `gzip_static` 用）。

## 前置需求（一次性）

本機 Smart App Control 啟用中（`VerifiedAndReputablePolicyState=1`）：**任何本地編譯的未簽章 exe（cargo build scripts、trunk、xtask）都被 Windows 封鎖（os error 4551）**，Windows 原生 Rust 建置鏈不可用，也不要為此關 SAC（關閉後無法重開）。建置全程改在 WSL Ubuntu 內跑，`build.ps1` 只是 wrapper。

1. WSL2 + Ubuntu（本機已有）。
2. WSL 內裝 Rust 工具鏈（約 10 分鐘）：
   ```bash
   wsl -d Ubuntu -e bash -lc 'curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --target wasm32-unknown-unknown && source ~/.cargo/env && cargo install trunk --locked'
   ```
   需求：stable ≥ 1.95（`VC/Cargo.toml` rust-version）、`wasm32-unknown-unknown` target、`trunk`、`gcc`（Ubuntu 24.04 已內建；trunk 的 C 依賴需要）。

原始碼 checkout 在 WSL ext4 `~/awarewave/{vectorcraft-src,craft-fonts}`（不放 `/mnt/*`：9p 檔案系統建置慢 ~10 倍；不放 repo 內：815k 行、17.5MB wasm 不進 git）。

## PIN.json（版本釘）

| 欄位 | 意義 |
|---|---|
| `rev` | storytold/vectorcraft commit（`<rev前7碼>` = dist 目錄名） |
| `craftFontsRev` | storytold/craft-fonts commit（CI/release 同一顆：`.github/workflows/ci.yml:25`） |
| `notoSansTc` | 繁中字型：notofonts/noto-cjk 的 SubsetOTF/TC（OFL-1.1），url+sha256 釘死；licence 複製 craft-fonts 既有 `fonts/noto-sans-cjk-sc/OFL.txt`（同一 Noto CJK 專案同一份 OFL） |

升級：改 `rev`（或 `craftFontsRev`）→ 跑 `build.ps1` → 本機 smoke（下方「驗證」）→ 交 C2/C6 流程上線。patch `git apply --check` 失敗 = 上游改了該區 → 重排 patch 再跑。

## 補丁（建置時套在 src checkout，不改上游）

| 檔 | 做什麼 |
|---|---|
| `web-fonts.patch` | `crates/text/web-fonts.txt` 加 `startup \| Noto Sans TC \| Regular`（manifest 列由 build.sh 動態追加到 craft-fonts checkout） |
| `api-addfont.patch` | `apps/vectorcraft-web/src/api.rs` `install()` 加 `addFont(bytes: Uint8Array) → Promise<number>`：`FontDb::global().add_font()`（同 `fonts.rs:71`）→ 回加入 face 數 + `request_repaint()`。C4 字型面板（Google Fonts 搜尋/上傳）靠它。上游 PR 文字見 `UPSTREAM-PR.md`；合併後改 PIN 刪補丁 |

## 驗證（2026-11-05，rev 4cce336）

- 建置：`build.ps1` 一次通過（exit 0），dist 27 檔、`SHA256SUMS -c` 全過；wasm 89.3MB／gz 32.6MB。
  **上游文件的 17.5MB 是舊數字**：官方 release v0.21.0 的 web zip 實測 wasm = 87.4MB raw／31.9MB zip（`gh release download` 驗證），同量級。首載 ≈33MB（gz），R0-PLAN R2 的「7MB」假設過時。
  **wasm-opt 有真的跑**（2026-11-05 查證）：對產出 wasm 手動重跑 `wasm-opt -Oz` 只縮 0.07%（89,270,053→89,204,797 bytes）= 已優化；build.sh 現在每次建置做同一驗證（重跑 -Oz 縮 >2% 即 FATAL，不默默出大檔），wasm 大小是真實程式量（section 構成：code 64.0MB + data 25.1MB，無 debug/name section）。
- smoke（`python -m http.server 8899` 供 dist，瀏覽器開 `index.html?lang=zh-hant`）：
  - `await vectorcraft.request('ui.inspect')` 回 JSON（24 keys：documents/panes/tool/view…）。
  - 選單、新檔對話框、context bar 全繁中（`smoke-zh-hant-welcome.jpg`）。
  - `text.fonts` 含 `Noto Sans TC`（startup 字型已註冊）；`text.setStyle {font:'Noto Sans TC'}` 套用成功，畫布渲染「繁體中文嘸」60pt——「嘸」為 Big5 專屬字、JIS 字集（BIZ UDPGothic）沒有，證明用的是 Noto Sans TC（`smoke-zh-hant-notosans-tc.jpg`）。
  - `addFont`（api-addfont.patch）：arial.ttf bytes → 回 `1`；垃圾 bytes → `0`；重複加 → `0`；皆 Promise 正常 resolve。
- 已知限制：
  - CDP 合成輸入（`Input.insertText`）進不了 egui，headless 打不了 CJK；真人鍵盤走瀏覽器 IME composition 事件，為上游既有路徑（`docs/development.md` web shell 段）。本 smoke 以 `text.setText` 走 control API 驗 TC 字形渲染。
  - 瀏覽器分頁藏在背景時 rAF 暫停，`vectorcraft.request()` 的 promise 要等分頁回前景才 settle（egui 每 frame 才 poll replies）——C6.1 headless smoke 要記得 front/active。
  - craft-fonts pin `b076417` 比上游 `web-fonts.txt` 舊，30 個阿拉伯背景字型被 xtask skip（warning，非錯誤）；只影響阿拉伯字型選單，TC/Thai/Georgian/Arabic Regular 都有。
