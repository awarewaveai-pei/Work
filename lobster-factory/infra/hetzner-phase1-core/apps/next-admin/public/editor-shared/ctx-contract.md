# ctx 契約（面板模組 ↔ 宿主編輯器）

面板模組 `editor-shared/blocks/<id>.js`：`export default { id, title, icon, mount(ctx, body) }`；只用下列 ctx，不碰宿主物件。
實作：`ctx-vectorcraft.js`（真品 VectorCraft，走 iframe `window.vectorcraft`）。除 `info`／`busy` 外都回 Promise、排隊一次一個，失敗 reject `Error`。測試守：面板呼叫的每個 `ctx.<方法>(` 都要在此表與實作中。

| 方法 | 回傳 | 語意（真品指令） |
|---|---|---|
| `placeSvg(svg, name?)` | `{ids}` | SVG 字串置入視窗中央、選取；成為一個群組（`file.place` 本就回一個群組，多於一個再 `object.group`） |
| `placeImage(blob, name?)` | `{ids}` | 點陣圖內嵌置入、選取（同上） |
| `selectedImage()` | `{id, blob, transform, width, height}` 或 `null` | 唯一選取的內嵌圖片：原檔 bytes（`links.unembed` 不帶 path，不改文件）、`transform` = 圖片 xf `[a,b,c,d,e,f]`、像素寬高；沒選／多選／非圖片 → `null` |
| `replaceImage(id, blob)` | `{id}` | 換像素：中心、大小、旋轉、堆疊位置不變，新圖被選取（見下） |
| `exportArtboard({format, ppi?, background?, quality?, artboard?, width?, height?})` | `Blob` | 整個畫板（`app.export` 不帶 path）；background `transparent/white/black/#rrggbb`；quality 0–1 或 0–100 皆轉成 0–100 整數（真品只收 u8）；WebP 一律無損 |
| `setArtboardSize({width, height, unit, dpi?})` | `{width, height, created}` | 第一個畫板改尺寸（`artboard.setProps`，pt）；沒文件就 `file.new`；unit `mm/cm/in/pt/px`（px 以 dpi 換算） |
| `openFile(blob, name)` | `true` | 開成新文件分頁（`vectorcraft.openFile`，同拖檔到分頁列；格式看 `name` 副檔名） |
| `saveAs()` | `Blob` | 存成 `.vectorcraft`（`file.saveCopy` + `captureDownloads`，不改文件路徑） |
| `ready()` | `true` | 等 `window.vectorcraft` 出現（預設 30 秒逾時） |
| `info(msg)` / `busy(on)` | — | 面板狀態訊息／忙碌中，同步；dock 畫在浮出層底部（HTML 標籤會被去掉） |

## replaceImage（spike 2026-11-05 通過，未降級）

1. `select.set {ids:[id]}` → `file.place {replace: true}`：真品原生「取代」，保留舊圖變形與堆疊位置，一個 undo 步（上游測試 `crates/engine/src/tests/place.rs:191`）。
2. 但新圖以「自己的實體尺寸（像素 × 檔案 ppi）」為 100%：canvas 產的 PNG 無 ppi（= 72），原圖 300 ppi 時會變大。
   所以前後各讀 `image.info`，實體邊長不同就 `object.scale` 以自身中心等比縮回 → 這種情況是**兩個** undo 步。
3. 實測（VectorCraft web 0.21.0，72 ppi 與 300 ppi JPEG 各一，先轉 30°、縮 50%、移位，再換成 canvas PNG）：
   換前換後 xf 六個係數相同（差 ≤ 1e-13），舊圖消失。證據由主 session 記入 WORKLOG 2026-11-05。

限制：saveAs 攔下的檔留在 iframe 記憶體（上游無刪檔 API）；只換內嵌圖片（連結圖 `links.unembed` 會拒）；面板一律用 `placeImage` 置入的圖，皆為內嵌。
