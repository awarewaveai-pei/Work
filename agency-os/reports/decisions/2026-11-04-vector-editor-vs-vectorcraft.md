# Vector Editor vs VectorCraft（storytold）— 研究（2026-11-04）

## 0. 先講結論

- **真品是 `github.com/storytold/vectorcraft`**（ArtCraft 團隊，11,338 stars、815,771 行 Rust、24 crate、MIT OR Apache-2.0、2026-11-04 仍在推）。操作者第一次貼的 `vectorcraft-app/vectorcraft` 是假複製品：核心 14 個 crate 不在、建不起來、只放一個 73 MB 未簽章 7z，**不要下載**。
- 真品是 Illustrator 的 clean-room 複刻，自評 alpha：功能廣度 88%、深度 75%、UI 擬真 55%（`ROADMAP.md`）。工具 89/92、Pathfinder 12 種、文字轉外框、多畫板、參考線、CMYK PDF、出血、裁切標記都**真的在 code 裡**（§3）。
- 我們的編輯器定位不同：「出稿工作台」（QR／條碼／Mockup／批次社群尺寸／AI 去背／My Designs），這些真品沒有。**不是複刻 Illustrator，而是借它的版面規格與 10 個可移植設計**（§4、§5）。
- 另一條路（§6 選項 B）：真品有 WASM 網頁版（17.5 MB，gzip 7.1 MB），可當「專業門」直接嵌。建議先走 A（擴我們的 Fabric.js），B 留作日後選項。

原始碼 clone 在 `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\59b20da5-dec3-4708-8e6d-2920ca09f8aa\scratchpad\vectorcraft-src\real`（session 暫存，會消失；需要時重 clone）。以下 `ui/` = `crates/ui-egui/src/`，`tools/` = `crates/tools/src/`。所有 file:line 經抽查 8 處核實。

## 1. 真假分辨（證據）

| | 假 `vectorcraft-app/vectorcraft` | 真 `storytold/vectorcraft` |
|---|---|---|
| 檔案／行數 | 124 檔、25,301 行 | 2,474 檔、815,771 行 |
| 根 `Cargo.toml` | 無 | 有，workspace 24 crate |
| `crates/` | affinity、brush、cad、color | 另有 engine、ui-egui、tools、pathops、text、doc、render、svg、pdf、eps、effects、trace、mcp… |
| commit | 5 個、10 分鐘內、message 全是 `vectorcraft` | 持續開發，PR 編號 >5000 |
| 組織 | 無 | ArtCraft：PhotoCraft 76k★、ArtCraft 38k★、PdfCraft、FilmCraft、WordCraft… |
| 可建置 | 否 | 是（`trunk build` 出 WASM；`cargo run -p vectorcraft`） |

## 2. 真品版面規格（可直接移植到 HTML）

組裝順序 `ui/app.rs:488-529`。1 pt = 1 CSS px。

```
┌ App bar 32px：mark 18 │ Home │ File Edit Object Type Select Effect View Window Help │ …工作區切換 112–190 │ 搜尋 28 ┐
│ Control bar 34px（Essentials 預設關；隨選取變，見下表）                                                        │
├────┬──────────────────────────────────────────────────────┬────────────────────────────────────────────────┤
│工具│ 文件分頁 35px（只跨畫布欄）                              │ Dock 主欄 310px（220–720）：Properties│Layers│Libraries │
│列  │ 尺規 16px（預設關）                                      │ 圖示欄 38px（收合的面板，9 組）                    │
│54px│ 畫布（pasteboard #1e222a）                               │ 面板分頁高 33、內距 10、最小寬 220                 │
│    │   Contextual Task Bar：浮在選取下方 +28，鈕高 30          │                                                │
├────┴──────────────────────────────────────────────────────┴────────────────────────────────────────────────┤
│ Hint bar 28px：? 圈 16 + 目前工具操作提示                                                                      │
│ 狀態列 24px：縮放下拉 76 │ 旋轉 52 │ ⏮◀ 畫板 140 ▶⏭ │ 工具名 │ 訊息 ≥180 │ X/Y │ ms/fps                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**左工具列**（`ui/toolbar.rs:34-67` `BASIC`；快捷鍵 `tools/catalog.rs:20-137`）：寬 54（單欄）／86（雙欄），鈕 36×29、間距 30、圖示 18，flyout 長按 0.35 s 或右鍵。順序：

| 分組 | 主工具（快捷鍵）→ flyout |
|---|---|
| Select | Selection(V)；Direct Selection(A)→Group Selection；Lasso(Q)→Magic Wand(Y) |
| Shapes | Rectangle(M)→Rounded／Star／Line(\)／Arc／Spiral／Grid；Ellipse(L)；Polygon；Shaper(⇧N) |
| Draw | Pencil(N)→Smooth／Path Eraser／Join；Eraser(⇧E)→Scissors(C)／Knife；Paintbrush(B)→Blob(⇧B)；**Pen(P)→Add(+)／Delete(−)／Anchor Point(⇧C)**；Curvature(⇧~) |
| Modify | Width(⇧W)→Warp…；Rotate(R)→Reflect(O)／Scale(S)／Shear／Free Transform(E)；Shape Builder(⇧M)→Live Paint(K)／Blend(W) |
| Type | Area Type→Type on Path；Type(T)→Vertical／Touch Type(⇧T) |
| Navigate | Zoom(Z)；Hand(H)；Rotate View(⇧H) |
| Color | Gradient(G)→Mesh(U)；Eyedropper(I)→Measure |
| 底部 | Fill/Stroke proxy 36 │ Color(,)／Gradient(.)／None(/) chip │ 繪圖模式(⇧D) │ 螢幕模式(F) │ ••• 編輯工具列（抽屜 268） |

**Control bar 隨選取**（`ui/chrome/control_bar.rs:163-317`）：

| 選取 | 欄位 |
|---|---|
| 無 | Fill 22 │ Stroke 22 │ 粗細 100 │ 寬度描述檔 │ Opacity 56 │ Document Setup │ Preferences |
| 路徑／物件 | 錨點鈕 │ Fill/Stroke/粗細 │ Opacity │ Style │ Recolor │ 6 對齊鈕 │ Transform；寬 ≥440 再加 X/Y/W/H 各 80 |
| 多選 | 上列 + 6 分布鈕 |
| 文字 | 對齊前插 Character：字型 150 │ 樣式 96 │ 字級 96（`ui/panels/character.rs:954-967`） |
| 圖片 | 取代 Fill/Stroke：檔名 │ 尺寸/解析度 │ Image Trace │ Mask 52 │ Crop 84（`ui/place.rs:582-604`） |

**Properties 面板**（`ui/panels/properties.rs:16-181`）：無選取 = Document／Appearance／Rulers&Grids／Guides／Snap／Preferences／Quick Actions。有選取依序：Transform（9 點參考、X/Y/W/H、旋轉、翻轉）→ Character+Paragraph（文字）→ Appearance（Fill/Stroke/Opacity/fx）→ Align → Pathfinder（多選）→ Quick Actions（依類型：Group／Ungroup／Make Clipping Mask／Trace／Crop／Offset Path／Simplify／Bring to Front／Lock）。欄寬 = (可用寬 − 107)/2，限 60–110（`ui/panels.rs:81-85`）。

**主題**（`ui/theme.rs:225-248` MediumDark 預設）：app_bar `#1b1f27`、panel `#272c36`、tab_strip `#1e222a`、pasteboard `#1e222a`、input `#1a1e26`、border `#11141a`、text `#e4e9f1`、accent Coral `#f06a52`（淺色 `#d9472f`）。Light：panel `#f3f5f8`、pasteboard `#dfe3e9`。hover/active = panel 往 accent 混 0.2–0.3。字級 13／11／15，圓角 4／8／10。

## 3. 功能對照（我們 vs 真品 code）

我們：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html`（1,845 行，Fabric.js 5.3 + paper.js）。

| 類別 | 我們 | 真品（位置） | 差距 |
|---|---|---|---|
| 鋼筆 | 折線（`:525`） | 完整狀態機：3px 門檻、對稱把手、Alt 拆把手、點起點閉合、Space 移錨點、接續開放路徑（`tools/pen.rs:245-447`） | **最大缺口** |
| 錨點編輯 | 無 | Direct Selection 1,557 行；Add/Delete/Anchor Point（`tools/draw2/anchor.rs`）；Curvature（`draw2/curvature.rs`） | 缺 |
| 布林 | 4 種（paper.js） | 12 種 Pathfinder + Divide/Trim/Merge/Crop/Outline（`crates/pathops/src/pathfinder.rs:32-60`，linesweeper 演算法）、Shape Builder、Offset Path、Outline Stroke（`offset.rs:64,99`） | 缺 Divide／Offset／描邊轉外框／Shape Builder |
| 形狀 | 5 種固定 | 多邊形邊數 ↑↓、Live Corners 三種角（`tools/corners.rs`）、弧／螺旋 | 缺邊數、任意角圓角 |
| 描邊 | 色、寬、虛線 | cap/join/miter、內外對齊、約 40 種箭頭、寬度描述檔（`crates/doc/src/appearance/stroke_style.rs`） | 缺 cap/join/箭頭 |
| 漸層 | 2 色 4 角度（`:288`） | 多色標、opacity、midpoint、畫布上編輯、Freeform、Mesh（`crates/color/src/gradient.rs:136-147`） | 缺多色標＋畫布編輯 |
| 文字 | Google Fonts、弧形、沿路徑 | **轉外框** Cmd+⇧O（`crates/engine/src/cmd/typecmd.rs:32,550`）、區域文字、路徑文字 5 效果、直排、Knuth-Plass | 缺轉外框、區域文字 |
| 遮罩 | 圓／圓角 | 任意剪裁、不透明遮罩（`crates/engine/src/cmd/opacitymask.rs`） | 缺任意剪裁 |
| 智慧參考線 | 積木（`:1560`） | 錨點／線段／bbox／畫板／角度，排序＋二分搜尋（`tools/guides.rs`） | 可強化 |
| 尺規／參考線／格線 | 無 | 全有（`crates/doc/src/guides.rs`、`tools/rulerguide.rs`） | 缺 |
| 圖層 | 扁平、隱藏 | 階層、鎖定、子圖層 | 缺鎖定 |
| 畫板 | 單畫布 | 多畫板（`crates/doc/src/artboard.rs`） | 延後 |
| 匯出 | PDF/SVG/PNG/WebP | SVG `outline_text`（`crates/svg/src/lib.rs:227`）；PDF/X、**CMYK**、出血、裁切標記（`crates/pdf/src/settings.rs:307-362`） | 缺 CMYK、SVG 外框選項 |
| 快捷鍵 | Ctrl 組合、Del、方向鍵 | 單鍵工具（V/A/P/T/M/L/G/I/H/Z） | 缺單鍵 |
| 我們獨有 | QR、條碼、Mockup、批次社群尺寸、AI 去背、線上描圖、WebP ≤200KB、My Designs、積木系統 | 無 | — |

## 4. 可移植設計（真品演算法 → paper.js／opentype.js）

| # | 設計 | 真品位置 | JS 做法 |
|---|---|---|---|
| 1 | 鋼筆狀態機 | `tools/pen.rs:245-447` | paper `Segment.handleIn/Out`；3px 門檻、`in = 2a − out`、Alt 凍結 in、點起點閉合、Enter/Esc |
| 2 | 錨點家族 | `draw2/anchor.rs:1-13` | 加點 `curve.divideAtTime`；刪點後鄰段重擬合；⇧C = 把手增刪 |
| 3 | Curvature | `tools/draw2.rs:182` | 每三點外接圓切線當把手 |
| 4 | 智慧參考線 | `tools/guides.rs:1-9` | 目標排序＋二分搜尋，接 Fabric `object:moving` |
| 5 | Pathfinder 擴充 | `pathops/pathfinder.rs:32-60` | paper `divide` + z-order 組合出 Divide/Trim/Merge/Crop/MinusBack |
| 6 | Shape Builder | `tools/builder.rs` | 兩兩 divide 得面 → hitTest → 拖過的面 unite，Alt 刪 |
| 7 | Offset／Outline Stroke | `pathops/offset.rs:64,99` | 描邊 2d 成環再 unite/subtract |
| 8 | Simplify 角點門檻 + Smooth | `pathops/edit.rs:77,339` | 夾角 >30° 先切段再各自 `simplify` |
| 9 | Live Corners | `tools/corners.rs` | 切線＋半徑算 fillet，`arcTo` 重建 |
| 10 | 文字轉外框 + 路徑文字效果 | `typecmd.rs:550`、`text/layout/on_path.rs:321-345` | opentype.js `glyph.getPath`；沿 `getPointAt/getTangentAt` 套 Rainbow/Skew/Stair/Gravity |

## 5. 補缺優先序

| 序 | 卡 | 內容 | 成本 |
|---|---|---|---|
| 1 | CARD-06 | 版面三欄照 §2（兩個編輯器同改；CARD-01～05 parity 約束） | 大 |
| 2 | CARD-07 | 貝茲鋼筆 + 錨點家族 + Curvature（§4 #1–3） | 大 |
| 3 | CARD-08 | 文字轉外框 + 多色標漸層編輯 + SVG/PDF 外框選項（§4 #10） | 中 |
| 4 | CARD-09 | 小項一卡：cap/join/箭頭、數值旋轉、Alt 拖曳複製、單鍵快捷鍵、圖層鎖定、任意剪裁 | 小 |
| 5 | CARD-10 | Pathfinder 擴充 + Offset/Outline + Shape Builder + Live Corners（§4 #5–9） | 中 |
| 6 | CARD-11 | 尺規／參考線／格線 + 智慧參考線強化（§4 #4） | 中 |
| 延後 | — | 多畫板、CMYK PDF（換 pdf-lib 或後端）、PDF/AI 匯入 | 大 |

不做：Blend／Mesh／Envelope／Perspective／Symbols／3D／Live Paint。

## 6. 兩條路

| | A 擴我們的 Fabric.js | B 嵌真品 WASM 網頁版 |
|---|---|---|
| 做法 | 照 §5 開卡 | `trunk build --release` 出 `dist/web`（wasm 17.5 MB／gz 7.1 MB），iframe 嵌 `/tools/vector-pro`，`--control` JSON 協定可由 MCP 驅動 |
| 優點 | 出稿積木、My Designs、Replicate、theme tokens 全部保留；增量可驗 | 一次得到 89 個工具、Pathfinder、CMYK PDF、多畫板 |
| 缺點 | 鋼筆／錨點是大工程 | alpha、egui 畫布無法套我們主題、7 MB 首載、無我們的積木、授權需保留 NOTICE |
| 建議 | **先走 A**（§5 序 1–4） | 等 A 做完序 1–4 仍不夠用時再開「專業門」評估 |

## 6a. 操作者需求更新（2026-11-04 下午）：要完整 Illustrator 功能＋相同排版 → 走 B

- 網頁版對外有 `window.vectorcraft` JS 介面（`apps/vectorcraft-web/src/api.rs:1-17`），文件明寫供 `<iframe>` 嵌入：`execute(cmd, params)`（所有引擎命令）、`request("ui.inspect")`、`openFile(name, bytes)`、`screenshot()`（PNG base64）、`captureDownloads(true)` + `files()/readFile()`（存檔留在頁內可讀回）。
- 不用 SharedArrayBuffer（grep 無 COOP/COEP/atomics），iframe 不需特殊 header。
- 我們的積木接法：QR／條碼 → 產 SVG → `openFile`；Mockup／批次匯出 → `screenshot()` 或 `app.export` 後 `readFile`；AI 去背 → `readFile` → Replicate → `openFile`；My Designs → `captureDownloads` 攔存檔 → 寫入現有 API。
- 建置：`rustup target add wasm32-unknown-unknown` + `trunk build --release`（`docs/development.md:16-33`）；輸出 `dist/web`（wasm 17.5 MB、gz 7.1 MB）。字型：web 版只內嵌 BIZ UDPGothic，繁中字型要照 `crates/text/web-fonts.txt` 放 `fonts/`（`docs/development.md:154-156`）。
- 風險：alpha 穩定度；7 MB 首載；需 WebGPU／WebGL2；UI 不能套我們主題（操作者要 Illustrator 原樣，反而是優點）；版本釘在 commit，升級要重建；授權保留 NOTICE。
- 部署：靜態檔，不進 git（17.5 MB），放主機 volume 由 nginx 供給 `/vector-pro/`，next-admin 頁 `app/(shell)/tools/vector-pro/page.tsx` iframe + `products.ts` 登記；現有 `/tools/vector-editor` 保留為「快速出稿」門。

## 7. 下一步

1. 操作者拍板：A 路線、§5 序 1–4 是否全要、§2 版面是否照做。
2. 拍板後開卡 CARD-06 → 07 → 08 → 09；每卡附 §2／§4 的 file:line 當規格。
3. 建議模型：CARD-06／07 = Opus 5.5；CARD-08／09 = fullstack-engineer（Sonnet）。
