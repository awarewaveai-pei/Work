# Canvas Editor vs PhotoCraft（storytold）— 研究（2026-11-05）

> 姐妹報告：`agency-os/reports/decisions/2026-11-04-vector-editor-vs-vectorcraft.md`（方法相同，不重述）。計畫：`agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md`。
> 原始碼 clone（session 暫存，會消失；需要時重 clone）：`storytold/photocraft` commit `98bcbfab9005b4915b3143b4daed91df365db107`（2026-11-05）。以下 `PC/` = 該 checkout；`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/` = `lobster-factory/infra/hetzner-phase1-core/`；`CE` = `NA/app/(shell)/tools/canvas/CanvasEditor.tsx`。
> 只讀：沒有建置、沒有執行、沒有下載 release。file:line 抽查 15 處全部相符（§8）。

## 0. 結論

- **真品**：`github.com/storytold/photocraft`，77,055★、Apache-2.0、2026-11-05 仍在推（`gh api`）。Photoshop 的 clean-room 重製，自評 alpha：廣度 ~76%、深度 55%、UI 40%、效能 25%（`PC/ROADMAP.md:22,53,54,58`）。
- **G1（路線的閘）**：主線網頁版**沒有** `window.photocraft`（`PC/apps/photocraft-web/src/main.rs:8`）。但控制協定與傳輸無關（`PC/crates/ui-egui/src/control.rs:3`），app 已有入口 `with_control()`（`PC/crates/ui-egui/src/app/control.rs:5`），網頁殼只是沒接。上游共用函式庫已有兩個現成模組：`craft-web-api`（`window.<app>`，craft-libs#413，2026-11-05 09:28 UTC 合併）與 `craft-web-host`（`?host=parent` 開檔／存檔訊息）；PhotoCraft 兩個都還沒用。→ 三個選項見 §4，**要操作者選**。
- **比向量版省的**：官方網頁版 zip 13 MB（v0.20.2；VectorCraft 是 89 MB）；字型用同源 `fonts/manifest.txt` 隨需下載，不需字型補丁；不用 SharedArrayBuffer。
- **比向量版難的**：(1) 沒有現成 JS 介面；(2) 帶路徑的檔案指令在自動化下被拒（`PC/docs/control-protocol.md:190`），bytes 進出要走宿主訊息；(3) 沒有「置入 base64」「取出內嵌圖」這類指令，圖層像素進出要用指令序列，先 spike；(4) 網頁版語言 `auto` 永遠是英文（`PC/crates/ui-egui/src/i18n/system.rs:55-58`），要明確設 `zh-hant`；(5) Canvas Editor 有五個上游入口（§6）。
- **PhotoCraft 沒有、要保留的**：AI 去背、AI 去除／生成填色、AI 擴圖、邊緣遮罩、WebP ≤200KB、My Designs、社群尺寸範本，加上向量版共用的 QR／條碼／Mockup／批次匯出／調色預設（§3）。

## 1. 真假（證據）

| | 真 `storytold/photocraft` |
|---|---|
| stars／授權／建立 | 77,055／Apache-2.0（根目錄另有 `LICENSE-MIT`）／2026-09-30 |
| 結構 | 根 `Cargo.toml` workspace；`crates/` 26 個（engine、ui-egui、psd、raster、text、gpu…）；`apps/` = photocraft、photocraft-cli、photocraft-web、photocraft-web-boot |
| 活動 | PR 編號 >11,000；v0.20.2 於 2026-11-05 發佈 |
| 組織 | storytold（2021 建立，77 個 public repo，blog = getartcraft.com） |
| 官網 | https://getartcraft.com/apps/photocraft 連到同一個 repo，標「Early alpha」，平台列 macOS／Windows／Linux／Web |

假 repo 認法照 `reference_vectorcraft_real_repo.md`（1 星、commit 10 分鐘內推完、topics 含 installer/downloader）。本次只 clone 上列一個。

## 2. 版面規格（`PC/crates/ui-egui/src/`，以下省略前綴）

尺寸分兩套版型：`Tokens.pro`（4 個 Pro 主題，**預設 ProMedium**，`theme.rs:31-32`）與 Studio。下表為 Pro；Studio 值在括號。組裝順序 `app/frame.rs:232`。

```
┌ 標題／選單列 32（38）：File Edit Image Layer Type Select Filter View Window Help │ 工作區 │ 搜尋 ┐  panels/title_bar.rs:25
│ 選項列 36（42）；Narrow 偏好 30（34）                                                          │  panels/options_bar.rs:33-39
├────┬───────────────────────────────────────────────┬──┬───────────────────────────────────┤
│工具│ 文件分頁 26（Large 34）  canvas/tabs.rs:535        │圖│ Dock 欄 290（300），250–max(視窗−400,520) │  panels/panel_docking.rs:89-91；panels/dock.rs:73,76
│列  │ 尺規 16  canvas/rulers.rs:14                       │示│ 群組：Color → Properties → Layers      │
│40  │ 畫布（canvas #282828）                             │欄│ 面板分頁高 28（40）、內距 8、最小寬 220   │  panel_docking.rs:561,604；widgets/panel.rs:53
│(50)│                                                   │36│                                       │  圖示欄 36／鈕 28（44／32）panels/dock.rs:37
├────┴───────────────────────────────────────────────┴──┴───────────────────────────────────┤
│ 狀態列 24（30）  panels/status_bar.rs:7-9                                                       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- 左工具列：單欄 40（50）、雙欄 72（88）、鈕 30×30（36×36）、圖示 20（`panels/toolbar.rs:92,96,436`）。Pro 版型的圖示欄在畫布與 dock 之間（`dock.rs:27-29`）。
- 工具順序（`panels/toolbar.rs:9-36` `TOOL_SECTIONS`；快捷鍵 `state/tool.rs:263-290`）：Move/Artboard(V)｜Marquee(M)、Lasso(L)、Object/Quick Selection/Magic Wand(W)、Crop(C)、Frame(K)、Eyedropper(I)｜Remove/Healing(J)、Brush(B)、Clone Stamp(S)、History Brush(Y)、Eraser(E)、Gradient/Bucket(G)、Blur/Sharpen/Smudge、Dodge/Burn(O)｜Pen(P)、Type(T)、Path Selection(A)、Shapes(U)｜Hand(H)、Rotate View(R)、Zoom(Z)；底部色票(D/X)、Quick Mask(Q)、Screen Mode(F)。Flyout：右鍵或長按 0.35 s（`:230-256`）。
- 面板 18 個、7 群組（`panels/panel_docking.rs:25-44`）：Color（color/swatches/gradients/patterns）、Properties（properties/adjustments）、Character（character/paragraph）、Navigator（navigator/histogram/info）、History（history/actions/layerComps）、Layers（layers/channels/paths）、Brushes。預設工作區 Essentials 顯示 Color、Properties、Layers（`state.rs:606`；`menus/invoke.rs:802`）。工作區：Essentials、Photography、Painting、Graphic and Web、Pixel Art、Motion（`menus/workspace_ui.rs:71-80`）。
- 主題 14 組（`theme.rs:58-73`）。ProMedium（`theme.rs:225-244`，其餘繼承 Pro `:295-334`）：chrome `#535353`、dock `#424242`、card `#535353`、tab_strip `#4A4A4A`、canvas `#282828`、field `#454545`、field_border `#686868`、separator `#3E3E3E`、text `#EEEEEE`、text_dim `#D4D4D4`、accent `#378EF0`、hover `#626262`；圓角 3/4/6；字級 Body 12、Small 10.5（`theme.rs:1067-1073`）；字型 Inter。
- 主題 token 可被 JSON 覆寫的函式已存在：`theme::live::apply_overrides`（`theme.rs:1188`；鍵 = `Tokens` 欄位名，值 `#rrggbb`），但 `#[cfg(all(debug_assertions, not(target_arch = "wasm32")))]`（`theme.rs:1123`）→ 正式網頁版沒編進去。`ui.set {theme}` 只能選 14 組之一（`control/dispatch.rs:286-290`）。
- i18n：28 種語言，有 `zh-hant`（`i18n.rs:208-210`，條目 3,050，最完整的 da 4,553）。選語言靠偏好 `interface.language`（`PC/crates/engine/src/prefs.rs:280,326`）或選單指令 `app.language.<code>`，**不是 query string**。
- dock 分頁列由外部 crate `craft-ui` 畫（`PC/Cargo.toml:13`，原始碼不在 clone 內）；PhotoCraft 傳入的樣式在 `panels/panel_docking.rs:560-574`；圖示欄繪製 `panels/dock.rs:34-70`、鈕 `icons.rs:223-236`。

## 3. 功能對照（CE 每項功能 × PhotoCraft code）

指令類型：EC = engine command（`engine.execute`）；UI = 只有選單／對話框。

| CE 的功能（行號） | PhotoCraft 有？（位置） | 結論 |
|---|---|---|
| 復原／重做、刪除、縮放（`CE:2155-2179`、快捷鍵 `:2073-2090`） | `history.undo/redo`（`PC/crates/engine/src/cmd/history_cmds.rs:247,257`）、History 面板、Zoom 工具 | 原生 |
| 上傳圖案成新物件（`CE:1303`） | File › Place Embedded、拖放到畫布成圖層（`PC/apps/photocraft-web/src/main.rs:9-12`） | 原生 |
| 裁切（`CE:1110-1163`） | `image.crop`、Crop 工具（`PC/crates/engine/src/cmd/image_cmds.rs:1075`） | 原生 |
| 畫布尺寸 cm/mm/px、DPI、底色、透明底（`CE:1010`、面板 `:2183`） | `file.new {width,height,resolution,background}`（`PC/crates/engine/src/cmd.rs:250-254`）、`image.imageSize`／`canvasSize`（`image_cmds.rs:1059,1067`）；對話框有 cm/mm/in | 原生 |
| 符合／填滿畫布一鍵（`CE:1059`） | 無一鍵（Free Transform 手動） | **面板「尺寸範本」加兩顆鈕** |
| 社群／印刷尺寸範本（向量版共用面板 `templates`） | 新文件預設只有 Photo／Print／Art／Web／Mobile／Film，無 Instagram／Facebook／名片（`PC/crates/ui-egui/src/dialogs/new_doc_ui.rs:19-79`，grep 0 筆） | **面板「尺寸範本」** |
| 形狀 方／圓／線（`CE:1364`）、群組（`:1396,1422`） | `shape.create`（`PC/crates/engine/src/cmd/vector_cmds.rs:97-101`）、`layer.groupLayers`（`cmd.rs:533`） | 原生 |
| 畫筆／橡皮擦（`CE:1258`） | Brush、Eraser、`paint.stroke`（`cmd.rs:991-995`） | 原生 |
| 文字：色、字級、B/I/U、字距、行距（`CE:610-670`） | `type.create`／`type.setStyle`（`PC/crates/engine/src/cmd/type_cmds.rs:908,1064`）、Character／Paragraph 面板 | 原生 |
| 弧形文字（`CE:769`） | `type.warpText {style: arc…}`（`PC/crates/engine/src/cmd/type_extra_cmds.rs:964-967`） | 原生 |
| 字型庫（`CE:2323` FontLibrary） | 網頁版只內嵌 Inter、JetBrains Mono（`PC/packaging/web/README.md:158`）；宿主可放 `fonts/manifest.txt`（`:156-182`） | 原生選單＋建置時灌字型，**不做字型面板** |
| 外觀：填色、描邊、虛線、圓角、不透明、混合（`CE:2337-2440`） | 形狀屬性、`layer.setProps {opacity, blend}`（`cmd.rs:619-623`） | 原生 |
| 漸層（`CE:706`）、陰影／光暈（`CE:126`） | Gradient 工具、`layer.layerStyle.replace {dropShadow, outerGlow, stroke}`（`PC/crates/engine/src/layer_style.rs:1179-1183`） | 原生 |
| 圓形／圓角遮罩（`CE:131`） | Layer Mask、Clipping Mask（`cmd.rs:743,761`）、Frame 工具 | 原生 |
| 色票、吸色、翻轉（`CE:92,718,707`） | Swatches 面板、Eyedropper、`edit.transform.flipHorizontal` | 原生 |
| 圖層：顯示、鎖定、改名、順序、複製、刪除（`CE:867-956`） | Layers 面板 | 原生 |
| 調色：分區滑桿、HSL、自動對比／色彩／色調（`CE:2478-2570`） | `image.adjustments.*`、調整圖層（`cmd.rs:1159-1215`）、`image.autoTone/autoContrast/autoColor`（`PC/crates/engine/src/cmd/edit_cmds.rs:1258-1260`） | 原生（更完整、非破壞） |
| 調色一鍵預設（復古／Vintage／拍立得…，`NA/public/editor-shared/color-grade.js:52`） | 有 LUT 預設（warm／cool／tealOrange…，`cmd.rs:1191`），非同款 | **面板「調色」沿用**（同一個 block，零新程式） |
| 色調分離（`CE:1446`） | Posterize 調整（`PC/crates/engine/src/adjust_params.rs:99`） | 原生 |
| 去背：色鍵＋吸色（`CE:1674`、`:2586`） | `select.colorRange`、Magic Eraser（`PC/crates/engine/src/cmd/selection_cmds.rs:690`、`eraser_cmds.rs:266`） | 原生；面板「去背」也含 |
| 去背：AI（Replicate，`CE:1608`） | `layer.removeBackground` 是傳統演算法（`PC/crates/engine/src/cmd/cutout_cmds.rs:1-6`）；無 ML runtime（`PC/docs/gaps.md:227-228`） | **面板「去背」沿用** |
| AI 去除不要的部分（`CE:1775-1916`，`/api/tools/studio/inpaint` `:1865`） | Remove 工具、Content-Aware Fill 為傳統 patch 演算法（`PC/crates/engine/src/cmd/edit_menu_cmds.rs:344`） | **新面板「AI 去除／生成填色」** |
| 生成填色（`/api/tools/studio/genfill` `CE:1865`） | 無（`PC/docs/gaps.md:227`） | 同上面板 |
| AI 擴圖（`CE:1489`，`NA/lib/studio/outpaint-presets.ts:9`） | 無 Generative Expand（同上） | **新面板「AI 擴圖」** |
| 邊緣遮罩 14 種筆刷邊（`CE:1535`，`NA/lib/studio/edge-mask.ts:145`） | 無同款 | **新面板「邊緣遮罩」** |
| PNG 下載（`CE:1983`）、PDF 真實 cm（`:1956`） | Export As（png/jpg/webp/tif/tga/ico/jxl，`PC/crates/ui-egui/src/dialogs/export_dialog.rs:19`）；PDF 走 Save a Copy／`file.print {bleed, cornerCropMarks, output: pdf}`（`PC/crates/engine/src/cmd/print_cmds.rs:1554-1557`） | 原生 |
| WebP ≤200KB 自動壓（`CE:2035-2062`） | WebP 有品質，無大小上限（`PC/crates/engine/src/cmd/web_cmds.rs:83` 只估大小） | **面板「匯出 WebP」沿用** |
| SVG 下載（`CE:1949`） | 無 SVG 匯出（`PC/book/src/formats/svg.md:3`） | 待決 2（建議：向量出稿走已上線的向量專業版） |
| 存入 My Designs（`CE:1989-2011`） | 無 | **面板「My Designs」沿用**；原始檔存 `.pcraft` |
| 設計檔 `.design.json` 匯出／匯入（`CE:1709,1719`） | 原生 `.pcraft`（ZIP：`manifest.json`＋`tiles/`，`PC/book/src/formats/pcraft.md:3-15`）、PSD 讀寫 | 原生；舊檔見 §6 |
| （向量版共用）QR、條碼、Mockup、批次多尺寸匯出 | 無（grep `qr code\|barcode` 非測試 0 筆；Mockup 只有 smart object 手做） | **四個面板沿用** |

PhotoCraft 多出來、CE 沒有的（操作者需求 ①）：選取工具全套、修復／仿製、調整圖層 16 種、濾鏡 70+、智慧型物件、圖層樣式全套、PSD/PSB 讀寫、動作（.atn）、畫板、參考線／尺規／智慧參考線、CMYK。

自評裡要知道的缺口：工具 56/68（`PC/ROADMAP.md:22`）；寫出的 PSD Photoshop 不一定開得起來（`PC/ROADMAP.md:42-45`）；文字沿路徑 partial（`PC/docs/gaps.md:96`）；外掛只有濾鏡型 WASM，面板外掛不在 v1（`PC/docs/plugins.md:183-187`）→ 我方面板不能做成它的外掛，只能在宿主頁。

## 4. G1：網頁版 JS 介面

事實：

| 項 | 位置 |
|---|---|
| 網頁殼沒有控制通道 | `PC/apps/photocraft-web/src/main.rs:8`；`src/` 只有 `indexed_presets.rs main.rs preset_bridge.rs web.rs` |
| 控制協定 28 個方法，與傳輸無關 | `PC/crates/ui-egui/src/control.rs:3,185-214` |
| app 接受控制通道的入口 | `PC/crates/ui-egui/src/app/control.rs:5` `with_control(rx)` |
| 網頁版檔案服務：開檔 `inbox`、置入 `place_inbox`、存檔＝瀏覽器下載 | `PC/apps/photocraft-web/src/web.rs:85-86,455,479` |
| `app.open`／`app.save` 需要 automation root，網頁版未設 → 失敗 | `PC/crates/ui-egui/src/control/dispatch.rs:1391-1422`；`services.rs:437-438` |
| 帶路徑的檔案指令在自動化下被拒 | `PC/docs/control-protocol.md:190` |
| 上游 PR `storytold/photocraft#9345`（`window.photocraft`，新檔 `api.rs` 163 行，照 VectorCraft）：open、非維護者所寫、11 天無維護者回覆；另有 #7470、#2263、#3101（`?host=parent`）皆 open | `gh api` 2026-11-05 |
| 上游共用模組 `craft-web-api`：`PageApi::new("<app>", Methods::default(), request).install()` → `window.<app>.request/execute/commands/uiInspect/screenshot` | storytold/craft-libs#413，merge `71b92e8b5ead2c0c6da9c275d3daac506056cd82` |
| 上游共用模組 `craft-web-host`：`?host=parent` 時同源 postMessage：宿主→app `<app>:open {name, bytes}`；app→宿主 `<app>:save {name, bytes, id}`（Save／Save As／Export）、`<app>:dirty`、`<app>:ready` | storytold/craft-libs `crates/web-host/README.md` |
| PhotoCraft 用的 craft-libs 釘在較舊 rev，兩個模組都還沒引用 | `PC/Cargo.toml:13,42-47` |

選項：

| | 做法 | 補丁 | 風險 |
|---|---|---|---|
| A 等上游 | 等 PhotoCraft 自己接上述兩個模組（或合併 #9345／#3101）後再開工 | 0 行 | 日期不明；本案停在研究 |
| **B 釘一個接線補丁（建議）** | 把上游已合併的兩個共用模組接進 `PC/apps/photocraft-web/`（`Cargo.toml` 兩個依賴＋`web.rs` 接線）；介面形狀是上游自己的，不是自創；同日把同一份送上游；上游接好就刪補丁、改 PIN | 估 100–150 行 Rust，只動網頁殼 2–3 檔；另有主題補丁（§2，放寬 `apply_overrides` 的編譯條件＋一個設定入口，估 60–100 行，同向量版已核准的做法） | 上游改 `web.rs` 時補丁要重套（`git apply --check` 失敗即停，升級流程會擋） |
| C 不用 API | 只嵌入，面板靠使用者自己下載／上傳檔案 | 0 行 | 置入、取圖、換圖、匯出、存 My Designs 全做不到 → 需求 ③ 不成立 |

B 之外仍未知、要在本機 spike 才知道的（計畫 C1.5）：圖層像素進出的指令序列（置入成圖層、取作用中圖層像素、換圖層像素、取選取範圍當遮罩）。已知可用的積木：`edit.copy`／`edit.paste`／`edit.pasteSpecial.pasteInPlace`、`document.activate`、`layer.select`、`file.close`（`PC/crates/engine/src/cmd/atn_cmds/events.rs:869-1109`）。備案：補丁多掛一個把 bytes 推進 `place_inbox`（`web.rs:86`）的頁面函式。

## 5. 建置與承載（與 VectorCraft 的差異）

| 項 | PhotoCraft | 位置 |
|---|---|---|
| 建置 | `packaging/web/package.sh`＝`trunk build --release` 兩次（app＋boot），wasm gzip 後切成 ≤20 MiB 分段 | `PC/packaging/web/package.sh:20-21,66` |
| 產物 | `index.html`、`photocraft-web-boot-<hash>.js/_bg.wasm`、`app/photocraft-web-<hash>.part-aa`、`app/parts.txt`、`app/photocraft-web.js`、選配 `fonts/` | `PC/packaging/web/README.md:6-14` |
| 大小 | 分段 10.9 MiB（0.8.2 實測，文件）；release zip v0.20.2 = 13 MB（`gh api` releases） | `PC/packaging/web/README.md:89` |
| 固定檔名（不可長快取） | `app/photocraft-web.js`、`app/parts.txt`、`index.html`、`fonts/manifest.txt` | `PC/packaging/web/_headers:19-25` |
| 分段檔不可被標 `Content-Encoding`（頁面自己解壓；標了也行但只在單一分段時） | | `PC/packaging/web/README.md:74-79` |
| GPU | WebGPU，退 WebGL2；`?webgl`、`?cpu` | `PC/apps/photocraft-web/src/main.rs:14-15` |
| COOP／COEP | 不需要 | `PC/packaging/web/README.md:136-138` |
| 字型 | `PHOTOCRAFT_WEB_FONTS_DIR=<含 fonts/manifest.txt 的資料夾>`；manifest 一列 `family \| style \| file`；wasm 不變 | `PC/packaging/web/package.sh:80-96`；`README.md:162-182` |
| 網頁版沒有 | 自動存檔、當機復原、伺服器端儲存 | `PC/packaging/web/README.md:69-72` |

正式站現況實測（2026-11-05，`curl`）：`/vector-pro/current/index.html` 回 `Cache-Control: no-cache`、`cf-cache-status: DYNAMIC`；hash 檔 `max-age=31536000`、`HIT`。→ nginx `expires -1` 對固定檔名有效，照用。

## 6. 我方盤點

- `CE` 2,757 行、Fabric 7；面板 12 個（`CE:2183` 畫布尺寸、`:2250` 形狀／畫筆／設計檔、`:2284` 文字、`:2337` 外觀、`:2443` 圖層、`:2478` 調色、`:2571` 去背、`:2596` AI 去除／生成填色、`:2646` 擴圖／色調分離、`:2680` 邊緣遮罩、`:2726` 匯出／存入；頂列 `:2155-2179`）。
- 上游入口五個，**全部經同一個函式** `openInCanvas(image, baseName, href)`（`NA/components/tools/canvas-handoff.ts:98`，目的地常數 `CANVAS_STAFF_HREF` `:94`）：`NA/app/(shell)/tools/banner/BannerStudio.tsx:1313`、`designs/DesignsGallery.tsx:1295`、`studio/StudioWorkbench.tsx:1707,1928`、`tarot/TarotStudio.tsx:2124`、`NA/components/tools/OutputTrackBar.tsx:178`。另有門頁 `NA/app/design/canvas/page.tsx:6` 直接載 `CanvasEditor`。
- 舊資料：`.design.json` 只下載到使用者電腦（`CE:1716`）；My Designs 只存 PNG（`CE:2000`）→ 伺服器上沒有要批次轉的舊專案檔。
- 退場時不能刪的：`NA/app/(shell)/tools/canvas/fabric-filters.ts`（`NA/components/tools/GradedPreview.tsx:22`、`tarot/renderPrintCard.ts` 在用）、`fabric` 依賴（記憶 `project_pod_image_edit_feature.md`）、`lib/studio/editor-color-grade.ts`／`editor-bg-remove.ts`（同上兩處）。`NA/app/(full)/tools/vector-pro/VectorProFrame.tsx:13` 的 fallback 指向 `/tools/canvas`，要改。
- 已上線可重用：`NA/app/(full)/`（無側欄路由，`NA/lib/portal/doors.ts:62`）、`NA/public/editor-shared/blocks/*.js` 9 個、`ctx-contract.md`、dock 外殼 `NA/public/vector-pro-dock/dock.js:68` `mountDock(root, makeCtx)`、`NA/lib/studio/design-source.ts:6`、`NA/lib/public-asset-cache.ts:3`、nginx `INFRA/nginx/default.conf:318,490`、compose `INFRA/docker-compose.yml:37`、主題協定 `NA/lib/theme/frame-theme.ts:20` `connectThemeFrame`（頻道名 `:8-10`）＋接收端 `scripts/vectorcraft-pro/awarewave-theme-receiver.js`、建置腳本 `scripts/vectorcraft-pro/build.sh`、字型清單 `scripts/vectorcraft-pro/PIN.json` `webFonts`（51 筆）、e2e `INFRA/tests/e2e/smoke/05-vector-pro.spec.ts`、監工台 `scripts/supervisor-kit/`。

## 6a. 複查（2026-11-05 晚，操作者問「有徹底檢查嗎」「進出流程有計劃到嗎」）

- 第一次盤點是面板標題＋函式清單＋部分段落，不是逐行。複查做法：`CE` 全部 `title=`／按鈕字去重後 144 個逐一對 §3 — 沒有漏列的功能；另 grep `paste|clipboard|drop|snap|Arrow|wheel|dblclick` — `CE` 沒有貼上、拖放、磁吸、方向鍵微調這類隱藏互動。函式本體仍未逐行讀。
- 做法會改變的三項（不是消失）：執行期上傳字型（`NA/components/tools/FontLibrary.tsx:108`）→ 建置時加；每張圖記住調色滑桿（`CE` `.adj`）→ 原生調整圖層；`.design.json` → `.pcraft`。
- 進出流程查到的五個計畫缺口（已補進 R0-PLAN）：
  1. 「My Designs」面板寫死向量版（`NA/public/editor-shared/blocks/my-designs.js:10,60,73,89`）→ 改讀宿主設定；畫布版沿用 `source: "canvas"`（`CE:2000`），分組規則 `NA/lib/studio/asset-group.ts:16`、Mockup 挑選 `MockupStudio.tsx:305` `?group=print` 不變。
  2. 有宿主時原生 Save As／Export 不再自己下載（C1.3 的接法）→ 父頁要代為下載，否則檔案像消失。
  3. 「我的設計」的「Canvas 編輯」只傳 PNG（`DesignsGallery.tsx:1295`）→ 有原始檔時要傳原始檔並依副檔名選編輯器。
  4. Mockup 工具沒有直接進畫布的按鈕（`MockupStudio.tsx`、`ModelMockupPanel.tsx` 無 `openInCanvas`）；輸入只從 My Designs 或上傳（`:585-593`）→ 補按鈕。
  5. 編輯後沒有路回到「網頁用／印刷用」輸出軌（只在來源工具的 `NA/components/tools/OutputTrackBar.tsx:83-110`）→ 新面板「轉存」重用同一支 API `/api/tools/image/process`。

## 7. 下一步

1. 操作者決定待決 1（G1：A／B／C）。選 B 才能動工。
2. 選 B → 照 R0-PLAN C1 開始；C1.5 的 spike 是第二個閘（圖層像素進出做不到幾項就回報幾項）。
3. 建議模型：C1（補丁＋spike）Opus 5.5；C2／C3／C6 fullstack-engineer（Sonnet）；C4 Opus 5.5；驗收 Fable。

## 8. 查證紀錄

- 版面（agent，63 次工具呼叫）抽查 8 處：`panels/title_bar.rs:25`、`panels/toolbar.rs:92,96`、`panels/panel_docking.rs:89-91,561`、`panels/dock.rs:37`、`theme.rs:225-244`、`i18n/system.rs:55-58`、`panels/status_bar.rs:7-9` — 全部相符。
- 功能（agent，65 次工具呼叫）抽查 7 處：`ROADMAP.md:22`、`docs/plugins.md:183-187`、`crates/engine/src/cmd/web_cmds.rs:79-83`、`cutout_cmds.rs:1-6`、`type_extra_cmds.rs:964-967`、`docs/gaps.md:227-228`、`packaging/web/README.md:156-182` — 全部相符。
- agent 自報不確定：選單項目數為靜態計數；`craft-ui` 分頁列畫法未見；上游文件彼此矛盾三處（工具數 `ROADMAP.md:22` vs `docs/gaps.md:68`；PDF 向量 `docs/file-format-parity.md:43` vs `docs/pdf-vector-export.md:5-7`；served 字型是否進 fallback）。
- 未驗：實際建置大小、WebGL2 下效能、`zh-hant` 實際觀感、§4 的 spike 項。
