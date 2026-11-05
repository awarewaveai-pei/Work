# ctx 契約（面板模組 ↔ 宿主編輯器）

面板模組 `editor-shared/blocks/<id>.js`：`export default { id, title, icon, mount(ctx, body) }`；只用下列 ctx，不碰宿主物件。
實作：`ctx-vectorcraft.js`（真品 VectorCraft，走 iframe `window.vectorcraft`；`frame` 必填，由 dock 外殼傳入）。除 `info`／`busy`／`host` 外都回 Promise、排隊一次一個，失敗 reject `Error`。測試守：面板呼叫的每個 `ctx.<方法>(` 都要在此表與實作中。

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
| `host` | 物件（非函式，必備） | 宿主描述，見下「host」。面板要的編輯器專屬值（存檔標記、原始檔副檔名、清單過濾、文案）只讀這裡，不寫死編輯器名 |
| `importLegacy(file)` | `{objects}` | **選用。** 舊專案檔（`.design.json`）轉成向量並置入（`placeSvg`）；`objects` = 轉入的物件數；失敗 reject `Error` |
| `selectionMask()` | `Blob` 或 `null` | **選用。** 目前選取範圍轉成遮罩 PNG（選取處不透明）；沒有選取範圍 → `null` |
| `fitLayer(mode)` | `{id}` | **選用。** `mode` = `'fit'`（縮到完整放進畫布）或 `'fill'`（縮到蓋滿畫布）；作用中圖層，位置置中、等比 |

**選用 = 宿主沒有就不提供**（ctx 上沒有該屬性，不是丟錯的空函式）；面板以 `typeof ctx.<名稱> === "function"` 決定要不要顯示對應控制項，不得假設存在。必備項（上表其餘各列與 `host`）每個宿主都要有。

## host

```
host = {
  id,          // 宿主識別，例 "vectorcraft"
  label,       // 給人看的短名，例 "向量"（用在「還沒有<label>編輯器存過的設計」）
  sourceExt,   // 本宿主原生檔副檔名，含點，例 ".vectorcraft"；必為 lib/studio/design-source.ts SOURCE_EXTS 之一
  sourceName,  // 存入 My Designs 時原始檔的預設檔名，例 "design.vectorcraft"（副檔名 = sourceExt）
  saveTag: { source, modelName, prompt },  // POST /api/tools/designs 的同名欄位；source 同時是清單過濾用的 metadata.source
  listSources, // 清單要列出的 metadata.source 陣列（含舊編輯器寫過的值）
}
```

| 宿主 | id | label | sourceExt | sourceName | saveTag（source／modelName／prompt） | listSources |
|---|---|---|---|---|---|---|
| 向量（`ctx-vectorcraft.js`） | `vectorcraft` | 向量 | `.vectorcraft` | `design.vectorcraft` | `vector-pro`／`vector-pro`／`vector edit` | `['vector-editor','vector-pro']` |
| 畫布（`ctx-photocraft.js`，卡 C4.2） | `photocraft` | 畫布 | `.pcraft` | `design.pcraft` | `canvas`／`canvas`／`canvas edit` | `['canvas']` |

My Designs 清單過濾：列出 `metadata.source ∈ listSources`（沒有 metadata 的舊資料也列）的設計；有原始檔的，原始檔副檔名必須等於 `sourceExt`，否則別的編輯器的原始檔會列出卻開不了。

## replaceImage（spike 2026-11-05 通過，未降級）

1. `select.set {ids:[id]}` → `file.place {replace: true}`：真品原生「取代」，保留舊圖變形與堆疊位置，一個 undo 步（上游測試 `crates/engine/src/tests/place.rs:191`）。
2. 但新圖以「自己的實體尺寸（像素 × 檔案 ppi）」為 100%：canvas 產的 PNG 無 ppi（= 72），原圖 300 ppi 時會變大。
   所以前後各讀 `image.info`，實體邊長不同就 `object.scale` 以自身中心等比縮回 → 這種情況是**兩個** undo 步。
3. 實測（VectorCraft web 0.21.0，72 ppi 與 300 ppi JPEG 各一，先轉 30°、縮 50%、移位，再換成 canvas PNG）：
   換前換後 xf 六個係數相同（差 ≤ 1e-13），舊圖消失。證據由主 session 記入 WORKLOG 2026-11-05。

限制：saveAs 攔下的檔留在 iframe 記憶體（上游無刪檔 API）；只換內嵌圖片（連結圖 `links.unembed` 會拒）；面板一律用 `placeImage` 置入的圖，皆為內嵌。
