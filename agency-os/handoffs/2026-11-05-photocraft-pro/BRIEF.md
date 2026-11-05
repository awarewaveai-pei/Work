# Canvas Editor 專業版（PhotoCraft 複合整合）— 交接 brief

> 讀者：接手的新 session（零記憶）。讀完本檔 → 讀 §2 正本 → 從 §4 的 G1 開始。
> 回報操作者一律繁體中文、白話、一次一件事。建議模型：Fable（研究＋計畫＋驗收）；執行卡派 Opus／Sonnet 工人 session。
> 寫於 2026-11-05，作者＝做完「向量專業版」的主 session。本檔只寫事實與規則；狀態之後只放新監工台的 `data.mjs`。

## 0. 一句話

把開源 PhotoCraft（Photoshop 的重製版）嵌進 app 成為「畫布（專業版）」；AwareWave 獨有的功能做成右側圖示欄＋浮出面板；所有現在通往舊 Canvas Editor 的入口接到新版後，舊的退場，只留一套。模式＝已上線的向量專業版（`/tools/vector-pro`），不重新發明。

## 1. 操作者需求（原話；全部同時成立）

1. 「同時要有 PhotoCraft 的功能，工具排版也要跟他相同（我很熟 Adobe），保留我有但她沒有的」— 三件事缺一不可，只留一套編輯器。
2. 「也是要用 lego 積木方式」。
3. 向量專業版過程中她追加的定案，本案一開始就照做：
   - 全視窗、開新分頁（「可以操作的版面很小」）。
   - 「右側兩欄工具列應該做成同一欄」→ 我們的工具只佔一條 38px 圖示欄，點了才浮出面板，不推擠編輯器。
   - 「要用統一的 class，這樣我改 theme 才會套用」→ 我們的 UI 只用 `app/globals.css` 的統一 class 與主題 token，零色碼。
   - 「我不要有深淺色，直接套用主題就好」「照 video 的模式：app 傳顏色過去，加補丁」→ 編輯器本體吃 app 主題：父頁 postMessage 傳 token，編輯器端接收（這個接收補丁她已核准）。
   - 「把我的字型灌到他的字型庫，然後我的取消」→ 字型在建置時放進編輯器自己的字型庫，不做自己的字型面板。
   - 不要下拉選單（用看得到的按鈕）。
   - 「我不喜歡補丁」→ 對上游原始碼的改動：最小、通用、可送上游、PIN 住；同一事實只存一處，不寫同步程式。要加新補丁先問她。
   - 「今天要完成」→ 可上線就手動 `sg-deploy`，不等 03:00。

## 2. 正本（先讀，不重查）

| 讀什麼 | 路徑 |
|---|---|
| 向量版計畫（C1–C7 模式） | `agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md` |
| 向量版最終狀態（哪些定案後來改了） | 同資料夾 `data.mjs`；`agency-os/WORKLOG.md` 2026-11-05（續2）起 |
| 研究方法與對照表格式 | `agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md` |
| 記憶 | `project_vectorcraft_pro_supervisor.md`、`reference_vectorcraft_real_repo.md`、`feedback_ui_unified_theme_classes.md`、`feedback_clean_no_patches.md`、`feedback_reuse_worker_sessions.md`、`feedback_node_check_esm_needs_mjs.md`、`project_pod_image_edit_feature.md`（寫著 keep fabric，定退場範圍前必讀） |
| 主題機制 | `NA/app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md` |
| 建置／上線／回退 | `scripts/vectorcraft-pro/README.md` |

`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/` = `lobster-factory/infra/hetzner-phase1-core/`。

## 3. 已查證的事實（2026-11-05，`gh api`）

**PhotoCraft**

- 真品 `storytold/photocraft`：77,050★、Apache-2.0、default `main`、每天有 push。`apps/` = `photocraft`、`photocraft-cli`、`photocraft-web`、`photocraft-web-boot`。同名假 repo 認法見 `reference_vectorcraft_real_repo.md`；只 clone 這一個，不下載任何 release 檔。
- **與 VectorCraft 的關鍵差異：網頁版沒有 `window.photocraft`。** `apps/photocraft-web/src/` 只有 `indexed_presets.rs main.rs preset_bridge.rs web.rs`，沒有 `api.rs`；`main.rs:8` 寫「no TCP control server (browsers can't listen on sockets)」。
- 控制協定存在但只接 TCP：處理函式 `crates/ui-egui/src/control.rs`，傳輸 `apps/photocraft/src/control_server.rs`，文件 `book/src/automation/control-protocol.md`（方法如 `ui.inspect`）。
- 上游有未結 issue 正是這件事：#9345、#7470「web: window.photocraft, the control channel for the page」、#2263「Web: an embedding API (window.photocraft, postMessage, Photopea-compatible mode)」、#3101「opt-in embedding bridge for host pages (?host=parent)」、#11370。
- 未查：版面尺寸與色值、字型機制（VectorCraft 是 `web-fonts.txt`＋`cargo xtask web-fonts`）、wasm 大小、原生檔格式、是否讀寫 PSD。

**我方**

- `NA/app/(shell)/tools/canvas/CanvasEditor.tsx` 2,757 行，Fabric `^7.4.0`。
- 它是別的工具的下游：`BannerStudio.tsx`、`DesignsGallery.tsx`、`StudioWorkbench.tsx`、`TarotStudio.tsx`、`components/tools/OutputTrackBar.tsx` 都經 `components/tools/canvas-handoff.ts`（sessionStorage，超量退 IndexedDB）把圖送進畫布。向量版沒有這種入口；本案的「退場」必須把這五個入口全部接到新版。
- 相關模組：`lib/studio/{canvas-fit,editor-bg-remove,editor-color-grade,generative-fill}.ts`；門頁 `app/design/canvas/page.tsx`；`lib/portal/products.ts:68`（nav「畫布」）、`:74`（staffPaths）。
- `public/editor-shared/color-grade.js`、`bg-remove.js` 是調色／去背數學的唯一正本，只能 import。

**可直接重用（已上線）**

- 全視窗頁模式 `NA/app/(full)/tools/vector-pro/`；側欄 `newTab`（`app/sidebar-sections.ts`）；`STAFF_ROUTE_GROUPS`（`lib/portal/doors.ts`）。
- 面板模組 `NA/public/editor-shared/blocks/*.js`（`export default {id,title,icon,mount(ctx,body)}`）＋契約 `ctx-contract.md`；dock 外殼 `NA/public/vector-pro-dock/`。本案新增 `ctx-photocraft.js` 轉接器，面板共用。
- 設計庫存原始檔：`NA/lib/studio/design-source.ts`＋`/api/tools/designs` 的 `sourceFile`（內容嗅探、`application/octet-stream`、寫 `metadata.source_*`，不改 schema）。新格式＝在這裡加一種副檔名與嗅探。
- 同源讀 R2：`/api/tools/designs/download?url=`。
- 靜態承載：主機 `/root/lobster-phase1/static/<名稱>/<版本>/`＋`current` 連結；nginx 寫法見 `INFRA/nginx/default.conf` 的 `/vector-pro/` 兩段。
- 固定網址的 public 模組快取：`NA/lib/public-asset-cache.ts`（新資料夾沒列入，測試會紅）。
- 監工台：`scripts/supervisor-kit/`（`data.mjs` → `node build.mjs` → `node check.mjs` → 重發同一 artifact）。

## 4. G1：先回報操作者，得到答案才往下

沒有 `window.photocraft`，面板就無法對編輯器下指令（置入、取選取圖、換圖、匯出、存檔全部做不到）。向量版能成立，是因為 VectorCraft 有 `apps/vectorcraft-web/src/api.rs`。

要做：clone 後讀 `crates/ui-egui/src/control.rs` 的 dispatch 入口，以及上述 issue 的討論與連結的 PR，然後給操作者三案，各附工作量、補丁行數、風險：

- **A 上游已有進行中的實作**（issue 連到 PR 或分支）→ 釘那個 commit，或等合併。
- **B 我們寫 web 控制通道**：把 `control.rs` 的 dispatch 用 wasm-bindgen 掛成 `window.photocraft`（照 VectorCraft `api.rs` 的形狀：`execute/request/commands/inspect/openFile/captureDownloads/files/readFile`），當成上游 PR（對應 #9345）＋本地 PIN 補丁。這是補丁，要她點頭。
- **C 不要 API**：只嵌入，面板靠檔案進出。先列出哪些獨有功能做不到，再讓她選。

不要自己選，不要硬做。

## 5. 工作順序

1. **研究**（只讀）：clone 到 repo 外；回答 §3「未查」各項與 G1；每個發現附 `file:line`。
2. **盤點對照表**：`CanvasEditor.tsx` 每個功能一列 →「PhotoCraft 原生有（指令名）／沒有 → 面板 N」。格式照向量版 R0-PLAN §6 C4 那張表。既有的 9 個面板（templates、color-grade、bg-remove、webp、my-designs、qr、barcode、mockup、batch-export）能共用就共用。另列「五個入口各自怎麼接到新版」。
3. **G1 回報** → 操作者選路。
4. **計畫＋監工台**：本資料夾 `R0-PLAN.md`（七段＋卡片）＋`data.mjs`/`build.mjs`/`check.mjs`；新 artifact；`check.mjs` 綠。卡片要寫到便宜模型能照做（每步有 grep 驗過的 `file:line`）。
5. **操作者說開始，才派工執行。**

## 6. 向量版踩過的坑 → 本案開工前就關掉

| # | 發生過什麼 | 規則 |
|---|---|---|
| 1 | `sg-deploy` rsync `--delete` 會刪 `apps/` 內不在 git 的檔 | wasm 放 `/root/lobster-phase1/static/`，nginx 直接供 |
| 2 | 產品子網域 server block 有 regex location；巢狀 `add_header` 會丟掉安全標頭 | `location ^~ /photo-pro/`，快取用 `expires`；app 與產品門兩個 block 都放；只走 `safe-infra-patch.sh` |
| 3 | 我們的檔放在編輯器同一路徑前綴，會被 nginx 蓋掉 | 我們的檔用另一個前綴（向量版是 `/vector-pro-dock/`） |
| 4 | Cloudflare 讓瀏覽器把固定網址的 js/css 快取 4 小時，部署後還是舊版、新舊模組混用 | 新 public 資料夾列進 `lib/public-asset-cache.ts`；部署後在登入瀏覽器 `fetch(url, {cache:'reload'})` 看到 `private, no-cache` |
| 5 | 瀏覽器直接 fetch R2 公開網域被 CORS 擋，「開啟失敗」 | 一律走 `/api/tools/designs/download` |
| 6 | 面板呼叫了轉接器沒有的方法；參數型別錯（品質傳 0.9，上游要 0–100 整數） | 靜態測試：`blocks/*.js` 用到的每個 `ctx.x(` 都在轉接器與契約裡；參數型別以上游原始碼為準 |
| 7 | 單元測試全綠，正式站 10 個面板有 4 個按了沒反應 | 登入 e2e 把每個面板主要按鈕按一次並檢查效果（`INFRA/tests/e2e/smoke/05-vector-pro.spec.ts` 的作法）；驗收以它為準 |
| 8 | `node --check x.js` 對有 import/export 的檔不報語法錯；工人回報「通過」不實 | 複製成 `.mjs` 再檢查；測試要真的解析每個模組 |
| 9 | 工人只跑指名測試，部署閘才抓到兩條全站不變量（`r2-delete-guard.test`、`accent-not-text.test`） | 合 main 前在 detached 整合工作樹跑 `tsc`＋vitest 全套 |
| 10 | 計畫假設「舊設計在伺服器」，查證後舊專案檔只下載到使用者電腦 | 轉檔卡動工前，先查舊資料實際存在哪、有幾筆 |
| 11 | 上游文件寫 wasm 17.5 MB，實際 89 MB（上游 release 也是 87 MB） | 大小以上游 release 實測為準；build 驗 wasm-opt 有跑 |
| 12 | 本機 Smart App Control 擋本地編譯的 exe | 建置在 WSL 內（`scripts/vectorcraft-pro/build.sh` 的作法） |
| 13 | repo 內 `.claude` 是 junction，工作樹建不起來；刪整合樹時，junction 的 `node_modules` 有被連帶刪除的風險 | 工作樹在 `D:/Worktrees`；整合樹用 `git worktree add --detach`（禁止自建分支）；刪樹前先用 `[IO.Directory]::Delete` 拆 junction |
| 14 | 別的 session 同時在部署，`sg-deploy` 回 exit 75 | 先 `pgrep -f "^bash /root/lobster-phase1/scripts/[s]g-deploy"`，有就等它結束 |
| 15 | dock 抄了編輯器的 65 個色碼，改主題不會動；又用旗標追編輯器明暗，旗標與實況不符 | 我們的 UI 零色碼（測試守）；不追第三方狀態，每次載入由父頁傳主題 |
| 16 | 主目錄有別的 session 未 commit 的檔（含同一個測試檔） | commit 一律帶 pathspec；`WORKLOG.md`/`TASKS.md` 只走 `scripts/git-partial-worktree-commit.py`；合併前比對重疊檔，先存後還 |

## 7. 派工方式（她要的）

- 主 session＝派工＋驗收＋整合＋部署；最多 4 個工人 session，檔案清單互不重疊；同一條線的下一張卡用 SendMessage 回派給原 session。
- 每份 brief 結尾三行 `FILES / TESTS / RISKS`，並寫明：不碰 WORKLOG/TASKS/`data.mjs`、在自己分支 commit 不推 main、context 長了自動壓縮繼續做、回報繁中。
- 驗收＝讀 diff＋自己重跑關鍵指令＋正式站登入實測；工人的「通過」不算證據。
- 每次狀態變動：改 `data.mjs` → build → check → 重發同一個 artifact 網址。

## 8. 邊界

- G1 有答案前不寫任何程式；計畫批准前不派執行卡。
- 不動向量專業版的計畫檔與已上線的檔，除非是共用層（`editor-shared/`、`design-source.ts`、`public-asset-cache.ts`）的擴充，且向量版的 e2e 仍綠。
- 不動 `design.aware-wave.com` 的開關（`coming_soon`）；nav 只在計畫裡寫要改哪一列。
- High（上傳主機、改 nginx/compose、`sg-deploy`）動手前在回覆裡說明；金流、權限、migration 一律先停。
- 不為了閘門改資料或加豁免。

## 9. 完成定義

研究報告（`agency-os/reports/decisions/`）＋對照表＋G1 的選項與她的決定＋R0-PLAN＋監工台 artifact 連結＋`check.mjs` 綠＋commit；`TASKS.md` 一條（3–5 行）、WORKLOG 四行證據。執行階段的完成＝登入 e2e 每個面板綠＋她在正式站用過。

FILES: repo 外的 clone、`agency-os/handoffs/2026-11-05-photocraft-pro/`、`agency-os/reports/decisions/`
TESTS: `node check.mjs` 綠；回報的 `file:line` 抽查 ≥5 處
RISKS: 沒有 `window.photocraft`（G1）；假 repo；Canvas Editor 有五個上游入口，退場範圍比向量版大
