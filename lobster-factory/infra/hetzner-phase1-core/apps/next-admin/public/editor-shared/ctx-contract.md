# ctx 契約（面板模組 ↔ 宿主編輯器）

面板模組 `editor-shared/blocks/<id>.js`：`export default { id, title, icon, mount(ctx, body) }`；只用下列 ctx，不碰宿主物件。
實作：`ctx-vectorcraft.js`（真品 VectorCraft，走 iframe `window.vectorcraft`）、`ctx-photocraft.js`（真品 PhotoCraft，iframe `window.photocraft`＋`?host=parent` 訊息，見文末「PhotoCraft」）；`frame` 必填，由 dock 外殼傳入。除 `info`／`busy`／`host` 外都回 Promise、排隊一次一個，失敗 reject `Error`。測試守：面板呼叫的每個 `ctx.<方法>(` 都要在此表與實作中。

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
| 畫布（`ctx-photocraft.js`，卡 C4.2） | `photocraft` | 畫布 | `.psd` | `design.psd` | `canvas`／`canvas`／`canvas edit` | `['canvas']` |

My Designs 清單過濾：列出 `metadata.source ∈ listSources`（沒有 metadata 的舊資料也列）的設計；有原始檔的，原始檔副檔名必須等於 `sourceExt`，否則別的編輯器的原始檔會列出卻開不了。

## replaceImage（spike 2026-11-05 通過，未降級）

1. `select.set {ids:[id]}` → `file.place {replace: true}`：真品原生「取代」，保留舊圖變形與堆疊位置，一個 undo 步（上游測試 `crates/engine/src/tests/place.rs:191`）。
2. 但新圖以「自己的實體尺寸（像素 × 檔案 ppi）」為 100%：canvas 產的 PNG 無 ppi（= 72），原圖 300 ppi 時會變大。
   所以前後各讀 `image.info`，實體邊長不同就 `object.scale` 以自身中心等比縮回 → 這種情況是**兩個** undo 步。
3. 實測（VectorCraft web 0.21.0，72 ppi 與 300 ppi JPEG 各一，先轉 30°、縮 50%、移位，再換成 canvas PNG）：
   換前換後 xf 六個係數相同（差 ≤ 1e-13），舊圖消失。證據由主 session 記入 WORKLOG 2026-11-05。

限制：saveAs 攔下的檔留在 iframe 記憶體（上游無刪檔 API）；只換內嵌圖片（連結圖 `links.unembed` 會拒）；面板一律用 `placeImage` 置入的圖，皆為內嵌。

## PhotoCraft（`ctx-photocraft.js`；實測 2026-11-06，dist `98bcbfa-f007c95`）

網頁版沒有路徑型存檔（PC `crates/engine/src/cmd/file_cmds.rs:76`），bytes 一律走「選單 → 存檔對話框（網頁版直接用建議檔名）→ `photocraft:save {name, bytes}`」；開檔＝父頁 `postMessage({type:'photocraft:open', name, bytes})`。所以 ctx 一次只跑一個方法。`photocraft:save` 沒有 id，存檔以**副檔名**配給等待者（Quick Export＝`.png`、Save a Copy＝`.psd`、Export As＝所選格式）。暫用文件一律取唯一名字 `awarewave-tmp-*`，關檔前以名字找回 index、`save:'discard'` 只用在它身上；找不到就不關，使用者在 iframe 開／關分頁也不會關錯。`ex(c,p)`＝`photocraft.execute`；`inv(id)`＝`photocraft.request('ui.menu.invoke',{id})`；文件清單＝`request('ui.inspect').session`（`documents[]`、`active`）；`document.inspect`、`prefs.set` 是引擎指令（`execute`），`window.photocraft` 沒有 `docInspect`。

| 方法 | 序列 | 原文件 undo |
|---|---|---|
| `placeSvg` / `placeImage` | 開暫用文件 → `ex('layer.copyToDocument',{document:原, center:true, name})` → `ex('file.close',{document:暫, save:'discard'})` → `ex('document.activate')`。SVG 成 **Shape 圖層**（向量）；沒有文件時這張圖直接成為文件 | 1 |
| `selectedImage` | 作用中圖層（`ex('layer.list',{flat:true})` 的 `active`，`kind` 須為 `Pixel`，否則 `null`）→ `ex('layer.duplicate',{layer, document:'new'})` → `ex('image.crop', bounds)` → `inv('file.export.quickExportAsPng')` → 等 save → 關暫用文件。`id`＝圖層 id；`transform`＝`[1,0,0,1,x,y]`；`blob`＝圖層範圍 PNG | 0 |
| `replaceImage` | 框 F＝舊圖層的圖片框（見下）→ `ex('layer.select',{layer:id})` → 開新圖（暫用文件讀 `document.inspect` 尺寸、`layer.list` 修剪範圍 tb）→ `ex('layer.copyToDocument',{document:原, at:F 左上＋tb 中心, name:舊名})` → 關暫用 → 新圖尺寸≠F：`ex('edit.transform',{layer:新, quad:tb 依「整張→F」比例})`；同尺寸但回傳 `offset`≠F 左上：`ex('layer.translate',{layer:新, dx, dy})` → `ex('layer.delete',{layer:id})`；回新 id | 2（縮放或平移 3） |
| `exportArtboard` | `inv('file.export.exportAs')` → `{dialog}` → `request('ui.dialog.set',{dialog, field, value})`：`format` png／jpg／webp、`sizing` scale（`scale`％）或 pixels（`width`／`height`）、`transparency`、WebP `lossless`、`quality` 1–100 → `request('ui.dialog.confirm')` → 等 save | 0 |
| `setArtboardSize` | 有文件：`ex('image.canvasSize',{width, height, units:'px', anchor:'center'})`；沒有：`ex('file.new',{width, height, mode:'rgb', depth:8, background:'white'})`；mm／cm／in／pt 以 dpi 換成像素 | 1 |
| `openFile` | `photocraft:open {name, bytes}` → 輪詢 `session.documents` 多一份 | 0（新分頁） |
| `saveAs` | `inv('file.saveACopy')` → 等 save → **PSD**（網頁版存不出 `.pcraft`：PC `crates/ui-egui/src/app/files.rs:236-245`，無路徑一律 `.psd`；主 session 2026-11-06 定案原始檔＝`.psd`） | 0 |
| `selectionMask` | 沒選取（`ex('document.inspect').hasSelection`）→ `null`；有：`ex('image.duplicate')`（副本帶選取）→ `layer.new.layer` → `edit.fill white` → `select.inverse` → `edit.fill black` → `select.deselect` → `image.crop` 作用中圖層範圍 → Quick Export PNG → 關副本 | 0（選取保留） |
| `fitLayer` | 作用中圖層範圍 `b`、畫布 `W×H` → 等比 `min`（fit）／`max`（fill）、置中 → `ex('edit.transform',{layer, quad})` | 1 |

PhotoCraft 專屬的決定與限制：

- **`exportArtboard` 的 `ppi`**：相對文件解析度換成縮放％，**點陣圖不放大**（上限 100%）。`background` 為不透明色時，先出透明 PNG，再由瀏覽器疊底色並編碼（Export As 只有「透明」或「攤平」兩種）。`artboard` 忽略：點陣文件只有一張畫布。
- **`selectionMask` 回 PhotoCraft 的實際選取，不反轉**：反轉會讓選框、套索、魔術棒選出的範圍全錯。框＝作用中圖層範圍，與 `selectedImage().blob` 同一像素座標；白＝選取、黑＝其餘、全不透明。快速遮色片照 PhotoCraft（＝Photoshop）規則，**白色＝選取**。實測：
  - 「顏色表示：選取範圍」（`channel.options {channel:'quickMask', indicates:'selected'}`，要在 Q 開啟中才生效）＋白色筆刷 → 選取＝筆畫。
  - 預設模式先填黑再塗白 → 選取＝筆畫。
  - 預設前景是黑色，直接塗等於把塗到的地方排除。

  所以「塗到的＝要改」的操作是：按 **Q** → 用黑色塗 → 再按 **Q** → 按 **Shift+Ctrl+I**（選取 › 反轉）。沒有先選取時 Q 起始全白，白色塗不會產生選取（實測 2026-11-06，W3 `tests/e2e/smoke/06b-photo-pro-ai-panels.spec.ts`）；面板說明文字寫這個（`blocks/ai-fill.js`）。
- **`replaceImage` 的圖片框**：PhotoCraft 的圖層 bounds 只算不透明像素（透明邊會被修掉）；`copyToDocument` 的 `at` 對齊修剪後範圍的中心、回傳的 `offset`＝新圖 (0,0) 落點；`edit.transform` 把修剪後範圍映到 `quad`（實測 2026-11-06）。所以「大小不變」指**圖片框**：ctx 記下每個換進來的圖層的完整框（含透明邊；key＝文件名＋圖層 id），之後 `replaceImage`／`selectedImage`／`selectionMask` 都用這個框（`blob` 含透明邊）；換多次不累積縮放、不漂移。圖層被移動（修剪範圍同大小）→ 框跟著平移；大小變了（使用者變形、塗到透明邊）→ 改用 bounds。框記在 ctx 實例內，重新整理頁面後回到 bounds。
- **`replaceImage` 的限制**：做法是新圖層加刪舊圖層，所以舊圖層的**圖層樣式、遮色片、混合模式、不透明度不帶過去**。圖層 id 會變，面板以回傳的 `id` 為準（`idAfterReplace`）。只換像素圖層。
- **存檔沒有確認**：`photocraft:save` 不帶 `id`，PhotoCraft 送出就把文件標成已存。
  - 面板在等的存檔，`saveTimeoutMs`（預設 60 秒）逾時就 reject；觸發失敗（選單／對話框出錯）立刻撤回等待，不會吃掉下一筆。
  - 沒有等待者在等「這種副檔名」的存檔（使用者按原生 另存／匯出、或等待者已逾時），由父頁以 `<a download>` 存到電腦，檔名＝訊息的 `name`，bytes 不丟。
  - 殘留風險：面板正在等 `.png` 時使用者剛好按原生 Quick Export PNG，兩筆同副檔名無法分辨（上游 `photocraft:save` 帶 id 後可關掉）。
- 中途失敗：暫用文件一律關回（`finally`），錯誤原樣拋出；`replaceImage` 失敗會撤掉已加的新圖層，舊圖層不動。
- 啟動失敗（`photocraft:failed`，無 WebGPU／WebGL2）時，`ready()` 與所有方法 reject 帶原因。
- 第一次 `ready()` 後介面設成繁中（`photo-pro-dock/dock.js` `applyDefaultLanguage`，localStorage 旗標），之後尊重使用者的偏好。
