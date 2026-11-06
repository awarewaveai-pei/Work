# ED.3 屬性面板：逐檔實作規格（2026-11-06）

讀者＝照卡實作的 Opus。設計判斷都已在本檔做完；遇到本檔沒寫的情況＝停下回報，不自行決定。
上層：`editor-parity-spec-20261106.md` §1.5（控制項）、§3 ED.3、§4 決定 3；監工台 ED.3（gate：每個新效果輸出一次真影片並抽畫面確認；舊專案輸出不變；High）；`editor-parity-compare-20261106.md` #33–#49。

**行號基準**：`git show 560172a7e:<檔>`（`cbe8f67f8` EC.2／EC.3 沒動本檔引用的三個檔）。PJ.1 正在改 `scripts/tools-editor.js`（工作區已動 `edTopbar`、`toolEditorScreen`、`edAction` 的 `new／open:／projects`），合併後行號會移；實作時以**函式名＋本檔引的字串**定位，行號只作對照。`VW` = `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`。

## 0. 不變量（每張子卡都要守）

- **I1 舊專案輸出不變**：沒有新欄位的專案，`exportEditor` 傳給 FFmpeg 的參數陣列逐字相同、輸出逐影格相同。機制＝§7 的 `tests/ed3-legacy-golden.cjs`，ED.3.0 先建、之後每個 commit 必綠。
- **I2 缺欄位＝現在的行為**：新欄位**只在使用者動到時才寫入**資料；`edNormalizeProject`（`tools-editor.js:142-238`）與 `validateProject`（`editor-export.cjs:43-192`）都**不得**把新欄位的預設值寫回片段。輸出端每個新分支的條件都是「欄位存在且不等於中性值」，否則走原本那一行。
- **I3 預覽與輸出同一份數學**：關鍵影格插值、震動位移、閃避曲線都放 `shared/editor-model.js`（頁面與 Node 共用，`editor-model.js:1-2,284-285`），輸出端只把同一組數字轉成 FFmpeg 運算式。
- **I4 UI**：不用 `<select>`（改 `edChoices` 可見按鈕，`tools-editor.js:387-395`）；用現有 class（`btn small`、`flow-choices`、`text-input`、`note`、`editor-insp-group`）；樣式只用 token（`styles/tools.css:723-736` 的寫法）；文案白話繁中、不寫「我們」。

## 1. 資料欄位（全部新欄位一覽）

| 欄位 | 放在哪 | 值域 | 缺欄位＝ | 用在 |
|---|---|---|---|---|
| `filter` | 片段／軌道／專案（已有） | `edFilters` 16 名 | 下一層；最後 `原始` | 已有，`editor-export.cjs:87` |
| `filterStrength` | 片段／軌道／專案 | 0–1 | 下一層；最後 1 | 3.2 |
| `grain` | 片段（已有）＋軌道／專案（新） | 0–1 | 下一層；最後 0 | 3.1、3.2 |
| `lightLeak` | 片段／軌道／專案 | 0–1 | 下一層；最後 0 | 3.2 |
| `shake` | 片段／軌道／專案 | 0–1 | 下一層；最後 0 | 3.2 |
| `backgroundBlur` | 主軌片段 | 整數 2–40（boxblur 半徑） | 20（＝現在 `boxblur=20:1`，`editor-export.cjs:448`） | 3.2 |
| `transformKeys` | 影片／圖片片段 | `[{frame, scale, x, y, rotation}]`，≤32 個，frame 由片段起點算、0..durationFrames、不重複、排序 | 無關鍵影格＝用靜態 `scale/x/y/rotation` | 3.3、3.4 |
| `duck` | 影片／音訊片段（不在 A1） | `true` 或不存在 | 不閃避 | 3.3、3.4 |
| `detachedFrom` | 音訊片段 | 來源影片片段 id | — | 3.3、3.4 |

- `background` 存值**不改**：`"黑色"`（或缺）／`"模糊"`／`"純色"`；按鈕字照參考寫「黑邊／模糊／純色」，`黑邊` 寫入 `"黑色"`。舊值 `fit:"裁切"`（`editor-export.cjs:457`）照舊只由輸出端讀，UI 不出現。
- 軌道欄位：`EditorModel.normalizeTracks` 的 `track()` 用 `...raw` 保留任何欄位（`editor-model.js:21-36`），軌道上的效果欄位存得住、匯出端 strict 模式也保留，不用改 `track()`。
- 專案欄位：平放在 native 頂層，跟現有 `p.filter` 同層（`tools-editor.js:2045-2049`、`editor-export.cjs:87`）。

### 1.1 `shared/editor-model.js` 新增（ED.3.4 的 commit 一起加；全部進 `api`，`editor-model.js:252-283`）

```js
// Card ED.3: 畫面效果, resolved nearest-first: clip, then its track, then the project (§4 of docs/ed3-properties-spec-20261106.md).
const EFFECTS = {
  filter: { neutral: "原始" },
  filterStrength: { min: 0, max: 1, neutral: 1, label: "濾鏡強度" },
  grain: { min: 0, max: 1, neutral: 0, label: "顆粒" },
  lightLeak: { min: 0, max: 1, neutral: 0, label: "光漏" },
  shake: { min: 0, max: 1, neutral: 0, label: "震動" },
};
const effectValue = (project, track, clip, key) =>
  key === "filter"
    ? clip?.filter || track?.filter || project?.filter || "原始"      // same `||` chain as editor-export.cjs:87
    : clip?.[key] ?? track?.[key] ?? project?.[key] ?? EFFECTS[key].neutral;
const LIGHT_LEAK = { rgb: [255, 160, 64], reach: 0.6 };   // effect colour (content, not UI chrome): export + preview
const SHAKE = { amplitude: 0.03, wx: 31, wy: 23, phase: 1, depth: 0.8 };
const shakeOffset = (t) => ({ dx: SHAKE.depth * Math.sin(SHAKE.wx * t), dy: SHAKE.depth * Math.sin(SHAKE.wy * t + SHAKE.phase) });
const TRANSFORM = { scale: [0.1, 5], rotation: [-360, 360], main: [-8000, 8000], overlay: [0, 100] };
function transformKeys(raw, durationFrames, overlay)   // like volumeKeys (editor-model.js:161-182): throws 「變形關鍵影格…」
function transformAt(keys, frame)                      // like gainAt (:184-196), per property; null when no keys
const NARRATION = "A1";                                // 旁白 A1 (tools-editor.js:696)
const DUCK = { gain: Math.pow(10, -12 / 20), ramp: 0.2, maxRanges: 64 };
function duckRanges(clipStart, clipDuration, intervals) // seconds; merge overlaps (gap < 2·ramp), keep those touching [-ramp, dur+ramp], rebased to clip start; > maxRanges → merge the smallest gaps until ≤ maxRanges
const duckFactor = (ranges, t) => 1 - (1 - DUCK.gain) * Math.max(0, ...ranges.map(([a, b]) => Math.min(1, Math.max(0, Math.min((t - (a - DUCK.ramp)) / DUCK.ramp, (b + DUCK.ramp - t) / DUCK.ramp)))));
function evalNumber(text)  // digits . + - * / ( ) and spaces only; recursive descent; no eval/Function; throws 「請輸入數字或算式」
```

- `STYLE.visual`（`editor-model.js:198-201`）末尾加 `"filterStrength", "lightLeak", "shake"`（複製樣式帶走；不加 `transformKeys`／`backgroundBlur`）。

## 2. 拆卡順序與每個 commit 可獨立部署

主機每天 03:00 自動部署 main（AGENTS.md §0），所以**每個 commit 推上去就是上線狀態**。順序讓「UI 能設的效果，輸出端一定已經會畫」：

| # | commit | 使用者看到的變化 | 為什麼中途不壞 |
|---|---|---|---|
| 1 | **ED.3.0** 舊專案黃金測試＋fixture（§7），不改產品 | 無 | 只加 `tests/` |
| 2 | **ED.3.4** `editor-model.js` §1.1 ＋ `editor-export.cjs` 新分支（§3.4）＋效果測試（§8） | 無（UI 還不會寫新欄位） | 新分支只在新欄位存在時走；黃金測試證明舊路徑逐字不變 |
| 3 | **ED.3.1** 整片設定 | 右側「整片設定」多了濾鏡強度、顆粒、光漏、震動、聲音、文字與字幕、比例按鈕 | 寫的欄位 commit 2 已會輸出 |
| 4 | **ED.3.6** 分組可收合＋標題顯示值＋數字欄位操作 | 片段屬性變成可收合的組，欄位可打算式 | 純 UI；不寫新欄位 |
| 5 | **ED.3.2** 套用範圍＋濾鏡十六鈕＋強度＋光漏＋震動＋背景三鈕＋模糊強度 | 片段「畫面效果」組新控制項 | 欄位 commit 2 已會輸出 |
| 6 | **ED.3.3** 變形＋關鍵影格、分離音訊、旁白時自動降低 | 「變形」組有 ◇、音訊組多兩個鈕 | 同上 |
| 7 | **ED.3.5** 速度四鈕（長度跟著變）、來源終點、音量 dB、取色 | 時間／速度／音訊組改成參考的樣子 | 存值格式不變（speed、volume 仍是倍數） |

每個 commit 的 rollback＝`git revert <sha>`。commit 3–7 寫入的新欄位在 revert 後被舊程式忽略（`edNormalizeProject` 以 `...clip` 保留未知欄位，`tools-editor.js:187-193`）；revert commit 2 前必須先 revert 3–7（否則 UI 寫了輸出端不懂的欄位，輸出會少效果但不會報錯——`validateProject` 對未知欄位不拒絕）。

## 3. 子卡規格

### ED.3.1 整片設定（沒選片段時）

改 `scripts/tools-editor.js`：

- `edProjectSettings`（`:612-615`）**整段取代**。新內容依序四組（3.1 先於 3.6 上線時用現有 `<section class="editor-insp-group"><h4>…</h4>`，3.6 再換成 `edGroup`）：
  1. **畫面**：`edChoices("畫面比例", "project-ratio", p.ratio, Object.keys(edRatios), (r) => r + " " + 名稱)`（名稱取 `edCreateRatios`，`:46-52`，同 `edRatioSelect` `:565`）；`edChoices("整片濾鏡", "project-filter", p.filter || "原始", edFilters)`（沿用）；數字欄位 `濾鏡強度`、`顆粒`、`光漏`、`震動`（%）＝`data-ed-field="fx-project:<key>"`；按鈕「更多特效與遮罩」＝動作 `pane:特效`。
  2. **聲音**：`配樂 dB`＝軌道 `A2` 的 `volume` 以 `EditorModel.volumeToDb` 顯示、`dbToVolume` 寫回（`editor-model.js:206-210`）；`旁白 dB`＝軌道 `A1`。該軌不存在就不顯示那一列。按鈕「自動降低音量、循環、響度」＝`pane:音訊`。
  3. **文字與字幕**：按鈕「整軌字幕樣式」「一鍵整片字幕」＝`pane:字幕`；「文字樣板」＝`pane:文字`（功能由 ED.5／ED.10 做，這裡只是捷徑，跟參考一樣）。
  4. **輸出**：`${w} × ${h} · ${fps}`、`${秒}s · ${段數} 段`（沿用 `:614` 的字）；`edChoices("影格率", "project-timebase", Timebase.label(p.timebase), Timebase.allowed.map(Timebase.label))`；`edButton("匯出影片", "export", …)`。
- **刪除**：`:614` 的 `edRatioSelect(p, "畫面比例", true)` 與 `edSelect("project:timebase", …)` 兩個下拉。`edRatioSelect` 仍給頂列用（`:572`，ED.1／PJ.1 的範圍，見 §9 G2），不刪函式。
- `edAction`（`:1484`）新增，放在 `project-filter:`（`:2045-2049`）旁邊：
  - `project-ratio:<r>`：`edRatios` 沒有就丟「比例不存在」；`p.ratio = r; ed.skipMagnet = true`。
  - `project-timebase:<label>`：把 change 處理器 `:2373-2383` 的重算邏輯**搬**成函式 `edSetTimebase(p, label)`，兩處都呼叫（不複製兩份）；`ed.skipMagnet = true`。
  - `project-filter:` 改走 §4 的寫入規則（scope＝整片：寫 `p.filter`，清掉各軌與各片段的 `filter`）。行為變化：今天改整片濾鏡不會蓋掉片段自己的濾鏡，之後會；一步可復原。
  - change 處理器（`:2384` 的 `project:` 分支旁）加 `fx-project:<key>`：值 ÷100、夾在 `EFFECTS` 範圍、走 §4 整片寫入；`track-db:<A1|A2>`：`track.volume = EditorModel.dbToVolume(值)`。
  - `pane:<名>`：`ed.pane = 名; ed.layout.leftOpen = true; edLayoutSave(); edRedraw()`（不建 undo）。
- 預覽：整片效果由片段解析值畫出（3.2 的 `edPaint` 改動讀 `effectValue`，已涵蓋）。輸出：commit 2 已處理專案層欄位。
- 測試改動：`tests/ed2-timeline.cjs:438` `getByLabel("影格率").selectOption("25 fps")` → `getByRole("group",{name:"影格率"}).getByRole("button",{name:"25 fps"}).click()`。

### ED.3.6 分組可收合、標題顯示目前值、數字欄位操作

- 新 helper（放 `edChoices` 之後，`:395`）：
  ```js
  function edGroup(name, value, body) // <details class="editor-insp-group" data-ed-group="${name}" ${closed ? "" : "open"}><summary><b>${name}</b><span class="note">${value}</span></summary>${body}</details>
  function edNumber(key, title, value, { min, max, step }) // <label><span data-ed-num-label>${title}</span><input class="text-input" type="text" inputmode="decimal" data-ed-field="${key}" data-ed-num data-min data-max data-step aria-label="${title}" value></label>
  ```
- 版面狀態：`edLayoutDefault`（`:520`）加 `closed: []`；`edLayout`（`:521-527`）加 `l.closed = Array.isArray(raw?.closed) ? raw.closed.filter((n) => edGroupNames.includes(n)) : []`；`edGroupNames = ["畫面","聲音","文字與字幕","輸出","畫面效果","變形","背景","播放速度","音訊","時間","調色","文字"]`。`toggle` 事件（新 listener，委派到 `[data-ed-group]`）更新 `ed.layout.closed` 後 `edLayoutSave()`，不 render。
- CSS（`styles/tools.css:734` 旁）：`.editor-insp-group > summary { display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:8px 0; }`，只用既有 token，不寫色碼。
- `edClipInspector`（`:616-669`）**整段改寫**成：頂部 `<h4>${edTrackLabel(p, track)} 片段</h4>`（＝參考「主視訊 V1 片段」，`edTrackLabel` `:692-697`）＋現有軌道切換鈕（保留，AwareWave 多出的，compare #47）；之後依片段種類放組（標題右邊的值照參考）：
  - 影片／圖片：`畫面效果`（值空）、`變形`（`×${scale.toFixed(2)}`）、`背景`（只主軌；`黑邊／模糊／純色`）、`播放速度`（`${speed}x`，圖片不顯示）、`音訊`（`${Math.round(volume*100)}%`，圖片不顯示）、`時間`（`${duration.toFixed(2)}s`）、`調色`（值空；內容＝現有 `edColorPane`，`:458-490`，決定 3）。
  - 音訊：`音訊`、`播放速度`、`時間`。
  - 文字：`文字`（內容、字體大小、字型、粗斜、對齊、顏色、背景色、動畫、套用此樣式到此軌／整片）、`變形`（X、Y、縮放、旋轉、不透明度，無關鍵影格）、`時間`。
  - 結尾保留 `cpEditorClip(p, c)`（`:667`）。
  - 3.6 只搬既有欄位進組（label 與控制項類型照舊）；控制項換成按鈕／新欄位由 3.2、3.3、3.5 做。
- 數字欄位操作（新 listener，放 change 處理器 `:2364` 之前）：
  - `keydown` 在 `[data-ed-num]`：`ArrowUp/Down` → 值 ± `step × (Shift ? 10 : Alt ? 0.1 : 1)`，寫回 input 後 `dispatchEvent(new Event("change",{bubbles:true}))`；`Escape` → `e.target.value = e.target.defaultValue; e.target.blur()`（不觸發 change）。Enter 由瀏覽器的 change 處理。全域 keydown 已略過 input（`:2662-2667`），不衝突。
  - `pointerdown` 在 `[data-ed-num-label]`：記起點；`pointermove` 每 4 px 一個 step（Shift ×10、Alt ×0.1）只更新 input 顯示；`pointerup` 才 dispatch 一次 change（一步 undo）。
  - change 處理器（`:2371-2372`）取值改為：`e.target.dataset.edNum !== undefined ? EditorModel.evalNumber(e.target.value) : e.target.type === "number" ? Number(e.target.value) : e.target.value`；再夾 `data-min/max`。
- 所有 `edSelect` 呼叫（`:639,641,647,659,664`）在 3.2／3.5 換成 `edChoices`；3.5 結束時 `grep -n "edSelect(" scripts/` 應為 0 → 刪 `edSelect`（`:384-386`）。

### ED.3.2 影片／圖片片段：套用範圍、濾鏡十六鈕＋強度、光漏、震動、遮罩、背景三鈕＋模糊強度

- `畫面效果` 組內容：
  1. 範圍：`edChoices("套用範圍", "fx-scope", ed.fxScope, ["整片","此軌","此片段"])`；`ed` 狀態加 `fxScope: "此片段"`（`:2-44`，不存檔）。動作 `fx-scope:<s>` 只改 `ed.fxScope` 並 `edRedraw()`。
  2. `edChoices("濾鏡", "fx:filter", 解析值, edFilters)`——取代 `:664` 的 `edSelect("filter", …)`。
  3. `edNumber("fx:filterStrength","濾鏡強度",…%)`、`edNumber("fx:lightLeak","光漏",…%)`、`edNumber("fx:shake","震動",…%)`、`edNumber("fx:grain","顆粒",…%)`——後者取代 `:664` 的 `edInput("grain", …)`（UI 改 0–100%，存值仍 0–1）。
  4. `edChoices("形狀遮罩", "mask", c.mask || "無", ["無","圓形","圓角矩形","三角形"])`——取代 `:664` 的 `edSelect("mask", …)`；遮罩**只存片段**、不受範圍影響（§4）。
  - 顯示的值＝`EditorModel.effectValue(p, edTrack(p,c.track), c, key)`，不是 `c[key]`。
- `背景` 組（只主軌，取代 `:658-661`）：`edChoices("背景", "background", 顯示名, ["黑邊","模糊","純色"])`；`模糊` 時加 `edNumber("backgroundBlur","模糊強度",c.backgroundBlur ?? 20,{min:2,max:40,step:1})`；`純色` 時沿用 `:660` 的顏色欄位（3.5 加取色）。`background:<名>`、`backgroundBlur`、`backgroundColor` 的改動**寫到主軌所有影片／圖片片段**（參考「套用到主軌所有片段；僅 V1」）。
- `edAction` 新增 `fx:<key>:<value>`（濾鏡鈕），change 處理器處理 `fx:<key>`（數字）：都呼叫 `edWriteEffect(p, c, key, value)`（§4）。`project-filter:` 也改呼叫它（scope 固定整片）。
- **預覽**（`edPaint`，`:1206-1212`）：
  - 濾鏡：新增常數 `edFilterCss`（只給預覽）：每個濾鏡＝`[[css函式, 值, 中性值], …]`，強度 k → `中性 + (值 − 中性) × k`。表：鮮豔 `saturate 1.4, contrast 1.08`；復古 `sepia .25, saturate .75`；黑白 `grayscale 1`；暖色 `sepia .15`；冷色 `hue-rotate 12deg, saturate .95`；電影感 `contrast 1.15, saturate .8, brightness .975`；底片 `contrast .92, saturate .85, brightness 1.035`；黃金時刻 `sepia .3, saturate 1.1`；憂鬱 `saturate .6, brightness .97, hue-rotate 8deg`；清新 `saturate 1.1, brightness 1.04`；賽博霓虹 `saturate 1.5, contrast 1.1, hue-rotate -15deg`；黑色電影 `grayscale 1, contrast 1.3, brightness .96`；美食 `saturate 1.25, brightness 1.035`；人像 `contrast 1.02, brightness 1.025, saturate .95`；冷冽 `hue-rotate 15deg, contrast 1.12, saturate .75`。`filter:` 字串＝濾鏡部分＋現有 `edGrade(c)`（`ed.compare` 時兩者都不套，`:1134`）。
  - 光漏：片段元素旁一個 `<div data-ed-leak="${c.id}">`，`position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:${k};background:radial-gradient(circle at 0 0, rgb(${LIGHT_LEAK.rgb}) 0, transparent ${reach*100}%)`，z-index＝片段 layer＋1；片段離開畫面時一起移除（`:1169-1174` 的清除迴圈加這個 selector）。
  - 震動：`τ = ed.time − c.start`；`transform` 前面加 `translate(${−A·dx·50}%, ${−A·dy·50}%) scale(${1+2A})`，`{dx,dy} = shakeOffset(τ)`，A＝`SHAKE.amplitude × shake`。
  - 背景模糊：預覽仍是黑（現況，`:1210`）——不在本卡做（§9 G1）。
- 輸出：commit 2 已處理（§3.4）。
- 測試改動：`tests/ed2-timeline.cjs:246` `getByLabel("片段濾鏡").selectOption("黑白")` → `getByRole("group",{name:"濾鏡"}).getByRole("button",{name:"黑白"}).click()`。

### ED.3.3 變形＋關鍵影格、分離音訊、旁白時自動降低

**變形組**（影片／圖片；取代 `:651-655` 的 x、y、scale、rotation、opacity 欄位，疊加層的 `疊加寬度` `:657` 留在本組）：

- 欄位：`縮放`（×，0.1–5，step 0.01）、`X`、`Y`（主軌 px ±8000；疊加 % 0–100）、`旋轉`（°）、`不透明度`（%）。
- 有 `transformKeys` 時：四欄顯示 `EditorModel.transformAt(keys, edFrame(p) − c.startFrame)`；改任一欄＝在播放頭 upsert 一個 key（其他三值取當下插值）；播放頭不在片段內 → 丟「播放頭需位於片段內」。沒有 key 時改欄位＝改靜態值（現況）。
- 按鈕：播放頭剛好在某 key 上 → `◆ 移除此關鍵影格`（`tf-key-delete`）；否則 `◇ 新增關鍵影格`（`tf-key-add`，用當下值）；有 key 時多 `清除全部關鍵影格`（`tf-key-clear`；清除時把播放頭處的插值寫回靜態欄位）。旁邊 `note`：「關鍵影格 n 個」。
- `edPaint` 播放／跳轉時：選取片段有 key 且四欄沒有 focus → 每次 paint 更新四個 input 的 value（不 render）。
- 預覽：`edPaint` `:1209-1210` 的 `c.scale/x/y/rotation` 改讀 `edTransform(p, c)`＝有 key 用 `transformAt(keys, edFrame(p) − c.startFrame)`，否則靜態。
- 剪接時 key 跟著片段走——**把只處理 `volumeKeys` 的五處改成兩種 key 都處理**：新函式 `edWindowKeys(next, src, from, to)`，內部對 `volumeKeys` 呼叫現有 `edKeysWindow`（`:2185-2195`，不改它的輸出），對 `transformKeys` 呼叫新的 `edTransformWindow`（同樣邏輯，兩端釘 `transformAt` 的值）。替換點：`:2126-2127`、`:2137-2138`、`:2169-2172`（split 兩半）、`edFitKeys` `:2197-2203`、`edDragStep` `:2462`。`edNormalizeProject`（`:216-221`）照 `volumeKeys` 的寫法加 `transformKeys` 的 try／catch，空陣列就 delete（守 I2）。
- 驗證：`edValidate`（`:994-1048`）對有 key 的片段呼叫 `EditorModel.transformKeys(c.transformKeys, c.durationFrames, edOverlay(p,c.track))`。

**分離音訊**（`音訊` 組，影片片段）：

- 按鈕 `分離音訊`（已分離時顯示「已分離到旁白軌」並停用：`p.clips.some(o => o.detachedFrom === c.id)`）。動作 `detach-audio`：目標軌＝`edTrack(p,"A1") ? "A1" : edTrackFor(p,"audio")`；新音訊片段＝`{ id: randomUUID, kind:"audio", track, asset: c.asset, startFrame, durationFrames, sourceStartFrame, speed, volume: c.volume, fadeIn, fadeOut, volumeKeys?: clone, detachedFrom: c.id }`（走 `edTime`）；目標軌同時段已有片段 → 丟「旁白軌在這段時間已有片段」（用 `edNeighbours`，`:2205-2217`）；原片段 `muted = true`。一次 `edCheckpoint`。
- 與參考的差別：參考把音訊另存一份到素材庫；這裡**沿用同一個影片檔**當音訊來源，不產生新檔（§9 Q2）。
- 輸出：原片段 `muted` 已讓它不進混音（`editor-export.cjs:637,639`），不用改；新音訊片段若來源沒有音軌 → §3.4 第 6 點。

**旁白時自動降低**（`音訊` 組，影片／音訊片段且不在 `A1`）：開關鈕 `toggle:duck`（沿用 `:2053` 的 toggle；`aria-pressed`）。`A1` 不存在時按鈕停用並寫「需要旁白 A1 軌」。
- 預覽：`edPaint` `:1220-1227` 的 gain 乘上 `c.duck ? EditorModel.duckFactor(ranges, ed.time − c.start) : 1`，`ranges` 由 `edDuckRanges(p, c)`＝A1 上可見、未靜音、軌道音量 > 0 的片段時間，經 `EditorModel.duckRanges`。

### ED.3.4 輸出端（`backend/editor-export.cjs`；commit 2，在任何 UI 之前）

每一點都標明「舊路徑」：條件不成立時那一行／那段原封不動。

1. **解析效果欄位**（`validateProject` 的 clip 物件 `:108-148`）：
   ```js
   const fx = (key) => EditorModel.effectValue(raw, track, c, key);
   filter: fx("filter"),                       // replaces :87 (same `||` chain; :88 check stays)
   filterStrength: number(fx("filterStrength"), 1, 0, 1, "濾鏡強度"),
   grain: number(fx("grain"), 0, 0, 1, "顆粒"),   // replaces :140 number(c.grain, …)
   lightLeak: number(fx("lightLeak"), 0, 0, 1, "光漏"),
   shake: number(fx("shake"), 0, 0, 1, "震動"),
   backgroundBlur: Math.round(number(c.backgroundBlur, 20, 2, 40, "背景模糊強度")),
   duck: c.duck === true,
   transformKeys: …  // text clip with keys → throw Error("文字片段不支援變形關鍵影格"); else EditorModel.transformKeys(c.transformKeys, durationFrames, overlay)
   ```
   `number()` 對 `null` 走 fallback（`:33`），`effectValue` 的 `??` 也跳過 `null`——舊資料 `grain:null` 結果相同。
2. **背景模糊強度**（`:448`）：`boxblur=20:1` → `` `boxblur=${clip.backgroundBlur}:1` ``。缺欄位＝20＝原字串。
3. **震動**（`:469` 之後）：
   ```js
   if (clip.shake) {
     const a = EditorModel.SHAKE.amplitude * clip.shake, even = (n) => Math.ceil(n / 2) * 2;
     steps.push(`scale=${even(scaledWidth * (1 + 2 * a))}:${even(scaledHeight * (1 + 2 * a))}`,
       `crop=${scaledWidth}:${scaledHeight}:x='(iw-ow)/2*(1+${S.depth}*sin(${S.wx}*t))':y='(ih-oh)/2*(1+${S.depth}*sin(${S.wy}*t+${S.phase}))'`);
   }
   ```
4. **濾鏡強度與光漏**（`:470-491`）：條件 `:471` 改成 `filters[clip.filter] || clip.grain || grade.length || clip.lightLeak`。分支內：
   ```js
   const blend = filters[clip.filter] && clip.filterStrength < 1, leak = clip.lightLeak > 0;
   if (!blend && !leak) { /* :477-485 unchanged, byte for byte */ }
   else {
     // [color] -> grade -> (filter at strength) -> grain -> (light leak) -> rgb24 -> [tinted]
     let cur = `[color${layer}]`, pre = [...grade];
     if (blend) {
       graph.push(`${cur}${[...pre, "format=rgb24"].join(",")},split=2[base${layer}][fxin${layer}]`);
       graph.push(`[fxin${layer}]${filters[clip.filter]},format=rgb24[fx${layer}]`);
       graph.push(`[base${layer}][fx${layer}]blend=all_mode=normal:all_opacity=${clip.filterStrength}[mix${layer}]`);
       cur = `[mix${layer}]`; pre = [];
     } else pre.push(filters[clip.filter]);
     const post = [...pre, clip.grain ? `noise=alls=${Math.round(clip.grain * 30)}:allf=t+u` : "", "format=rgb24"].filter(Boolean);
     graph.push(`${cur}${post.join(",")}[${leak ? "lit" : "tinted"}${layer}]`);
     if (leak) {
       graph.push(`gradients=s=${scaledWidth}x${scaledHeight}:r=${rate}:d=${Timebase.ffTime(frameCount, tb)}:c0=0x${hex(LIGHT_LEAK.rgb)}:c1=0x000000:nb_colors=2:type=radial:x0=0:y0=0:x1=${Math.round(scaledWidth * LIGHT_LEAK.reach)}:y1=${Math.round(scaledHeight * LIGHT_LEAK.reach)}:speed=0.01:seed=1,format=rgb24[leak${layer}]`);
       graph.push(`[lit${layer}][leak${layer}]blend=all_mode=screen:all_opacity=${clip.lightLeak}:shortest=1[tinted${layer}]`);
     }
   }
   // then :486-490 (alphamerge with [plane]) unchanged
   ```
   **實作更正（ED.3.4）**：光漏的 `[lit]`、`[leak]` 改 `format=gbrp`（不是 rgb24）。整張圖裡下游 `alphamerge` 讓 `blend` 協商成 YUV，screen 作用在色度平面 → 畫面變紫；單獨實驗時輸出是 rgb24 才沒現形。
   `seed=1` 必寫（gradients 預設亂數，會讓同一專案兩次輸出不同）。上面三種鏈（split＋blend 強度、gradients＋screen、scale＋crop sin 震動）已在本機 FFmpeg 6.1.1（`node_modules/ffmpeg-static`）實跑：無警告、畫面正確（2026-11-06 撰寫本檔時的實驗）。
5. **變形關鍵影格**（只在 `clip.transformKeys.length`）：
   - `:405-412` 的 `scaledWidth/Height` 在有 key 時用 `scale = 1`（box 尺寸），其餘不變。
   - 不推 `:492-495` 的靜態 rotate；在 `:508`（opacity）之後推：
     ```js
     const T = `(t-${pre / fps})`;  // clip stream time here starts at the transition handle (setpts=PTS-STARTPTS, :439)
     const S = piecewise(keys.map((k) => [k.frame / fps, k.scale]), T), R = piecewise(keys.map((k) => [k.frame / fps, k.rotation]), T);
     const sMax = Math.max(...keys.map((k) => k.scale)), turns = keys.some((k) => k.rotation);
     const pw = even(turns ? Math.hypot(boxWidth, boxHeight) * sMax : boxWidth * sMax), ph = even(turns ? Math.hypot(boxWidth, boxHeight) * sMax : boxHeight * sMax);
     steps.push(`scale=w='2*trunc(${boxWidth}*(${S})/2)':h='2*trunc(${boxHeight}*(${S})/2)':eval=frame`,
                `pad=w=${pw}:h=${ph}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame`,
                ...(turns ? [`rotate=a='(${R})*PI/180':ow=iw:oh=ih:c=none`] : []));
     ```
   - 位置（`:509-514`）在有 key 時：`τ = (t-${(轉場鏈 ? pre : clip.startFrame) / fps})`（轉場鏈 `:517-541` 的 overlay 疊在從 0 起算、含前置 handle 的畫布上；一般路徑 `:546-549` 的 t 是時間軸時間），`X = piecewise(…k.x…, τ)`、`Y`、`S′ = piecewise(…k.scale…, τ)`：
     - 主軌：`x='(main_w-overlay_w)/2+(${X})*${width / project.baseWidth}'`（pad 置中，公式同 `:511`）；y 同理。
     - 疊加：`x='(main_w-${boxWidth}*(${S′}))*(${X})/100-(overlay_w-${boxWidth}*(${S′}))/2'`，y 同理用 `boxHeight`。
   - `piecewise(points, v)`：把 `gainExpression`（`:286-295`）的巢狀 `if(lt(v,…))` 抽成通用函式；`gainExpression` 改為呼叫 `piecewise(keys.map(k => [k.frame/fps, k.gain*scale]), "t")`。**`gainExpression` 產出的字串必須逐字不變**（黃金測試含 volumeKeys 專案，會抓）。
   - 這條鏈（scale eval=frame → pad eval=frame 固定尺寸 → rotate → overlay 以 t 為運算式）已實測：100 px 方塊在第 0／30／59 格量到寬 100／150／198、左緣 270／344／416，與運算式相符、無警告。
6. **分離出的音訊**（`:360-364`）：`clip.kind === "audio" && !metadata.audio` 原本丟「素材類型與片段不符」；改為 `clip.detachedFrom` 存在時 `continue`（不加入 inputs、不進混音＝靜音，正確結果），否則照舊丟錯。`index` 計算（`:371`）在 `continue` 之後，不受影響。
7. **旁白時自動降低**（音訊迴圈，`:648` volume 步驟之後、fade `:649` 之前）：`if (clip.duck)`：`intervals`＝id 為 `EditorModel.NARRATION` 的軌道上的片段（`visible`、非 `muted`、軌道非 muted、`metadata.audio`）的 `[start, start+duration]`，經 `EditorModel.duckRanges(clip.start, clip.duration, intervals)`；非空時 `steps.push(`volume=volume='${duckExpression(ranges)}':eval=frame`)`。`duckExpression` ＝ `1-${1-DUCK.gain}*max(w1,max(w2,…))`，`wi = clip(min((t-(a-r))/r,((b+r)-t)/r),0,1)`（數字代入）。t＝片段起算的時間軸秒（`asetpts` `:642`、`atempo` `:643` 之後）。
8. **抽格自驗跳過新效果**（`frameChecks` `:204-206`）：條件加 `clip.lightLeak || clip.shake || clip.transformKeys.length || clip.filterStrength !== 1`。不加的話，有震動的片段會被拿去跟原始素材比 PSNR，輸出驗證失敗。
9. `module.exports`（`:759`）加 `piecewise`（給測試用）。

### ED.3.5 對照差異（compare #43、#45、#46、#49）

- **播放速度四鈕**（`播放速度` 組，取代 `:631`）：`edChoices("播放速度", "speed", c.speed, [0.5,1,1.5,2], (v) => v + "x")`；舊專案速度不在四值（如 0.75）→ 四鈕都不按下，下面 `note`「目前 0.75x」。動作 `speed:<v>`：`ratio = c.speed / v`；`durationFrames = max(1, round(durationFrames × ratio))`（來源範圍不變：2x 時 22.4 s → 11.2 s）；`volumeKeys`／`transformKeys` 的 `frame` 乘 `ratio` 取整、去重；`fadeIn/fadeOut` 夾到新長度一半；主軌且磁性主軌開著 → 不檢查 `edNeighbours`（`edMagnet` `:337-354` 會重排）；否則 `edNeighbours`（撞到就丟現有訊息）。`edValidate` 後寫回。
- **時間組**：`起點`、`長度`、`來源起點`、`來源終點`（＝`sourceStart + duration × speed`；改它＝`duration = (值 − sourceStart) / speed`，走 `edTime`）；下方 `note`「素材原始長度 ${asset.duration}s」（有才顯示）。label 改名＝參考用字：`時間軸起點（秒）`→`起點`、`片段長度（秒）`→`長度`、`素材起點（秒）`→`來源起點`。要跟著改的測試：`tests/tools-editor.cjs:72-73,91-92`、`tests/p1-loop.cjs:73-76`、`tests/media-contract.cjs:119-120`。
- **音量 dB**（`音訊` 組，取代 `:632`）：`edNumber("volumeDb","音量（dB）", EditorModel.volumeToDb(c.volume), {min:-60,max:12,step:0.1})`，change 時 `c.volume = EditorModel.dbToVolume(v)`（存值仍是倍數 → 輸出不變）。淡入、淡出、靜音按鈕保留（`:633-635`）。
- **文字片段**（`文字` 組，取代 `:637-647`）：字型、對齊、動畫改 `edChoices`；字級 label 改 `字體大小`（改 `tests/ed2-timeline.cjs:252-253`）；新增 `套用此樣式到此軌`／`套用到整片` 兩鈕：把 `EditorModel.STYLE.text` 的欄位從目前片段複製到同軌／全部文字片段（同 `style-paste` `:1994-1997` 的寫法，一步 undo）。
- **取色**：每個 `type="color"` 欄位旁一顆 `取色`（`window.EyeDropper` 存在才顯示）：`new EyeDropper().open()` → 寫回該欄位並 dispatch change。
- 3.5 結束：`grep -n "edSelect(" scripts/` 應為 0 → 刪 `edSelect`（`:384-386`）。

## 4. 套用範圍「整片／此軌／此片段」的模型與優先順序

- **讀（輸出與預覽相同）**：每個效果欄位逐欄「近者勝」：片段 → 片段所在軌道 → 專案 → 中性值（`effectValue`，§1.1）。三層同時有值時**不疊加**，只用最近一層。延續輸出端現有的濾鏡規則（`editor-export.cjs:87`），舊專案不受影響。
- **寫**（`edWriteEffect(p, c, key, value)`，依 `ed.fxScope`）：
  - 整片：`p[key] = value`；刪除所有影片軌的 `track[key]`；刪除所有影片／圖片片段的 `c[key]`。
  - 此軌：`track[key] = value`；刪除該軌所有片段的 `c[key]`。
  - 此片段：`c[key] = value`。
  - 一次 `edCheckpoint`（一步可復原）；寫完 `edCommit`。
  - 理由：寫入時清掉較窄層＝按下去看到的就是結果，不會被某段殘留的設定蓋掉；讀的規則仍簡單。
- 範圍適用欄位＝`filter`、`filterStrength`、`grain`、`lightLeak`、`shake`。`mask`、`background*`、調色、變形**只屬片段**（背景另有「主軌全部」規則，§3.2）。
- 文字片段不吃畫面效果（輸出端文字走 ASS，`:553-630`，本來就不經濾鏡）。

## 5. 預覽／輸出對照（每個新效果）

| 效果 | 預覽（`edPaint`） | 輸出（`editor-export.cjs`） | 一致性 |
|---|---|---|---|
| 濾鏡＋強度 | CSS 函式表依強度內插 | split＋blend `all_opacity` | 近似（CSS 與 FFmpeg 色彩本來就不同） |
| 光漏 | radial-gradient＋screen | gradients＋blend screen | 同色同範圍；輸出有慢速旋轉 |
| 震動 | translate＋scale，同 `shakeOffset` | scale＋crop sin(t) | 同公式；轉場前置段有 ≤ 半個轉場的相位差 |
| 關鍵影格 | `transformAt` | `piecewise` 運算式 | 同內插 |
| 背景模糊強度 | 不畫（現況） | boxblur 半徑 | §9 G1 |
| 旁白時降低 | `duckFactor` | `duckExpression` | 同公式 |

## 6. 與其他線的撞檔

| 檔 | ED.3 碰的段落 | 他線 | 結論 |
|---|---|---|---|
| `scripts/tools-editor.js` | `ed` 狀態 `:2-44`；`edNormalizeProject` `:142-238`；helper `:378-395`；`edLayout*` `:519-527`；`edPane` 特效說明 `:591-592`；`edInspector／edProjectSettings／edClipInspector` `:607-669`；`edValidate` `:994-1048`；`edPaint` `:1150-1256`；`edAction` 的 `project-filter:` 起到結尾 `:2045-2183`；`edKeysWindow／edFitKeys` `:2185-2203`；change／input 處理 `:2364-2419`；`edDragStep` `:2462` | PJ.1：`edTopbar` `:572`、`toolEditorScreen` `:777-788`、`edAction` `new／open:／projects` `:1489-1545`、新 `edCreate`。PJ.2–PJ.4（之後）：`edSpineLink`、`edArrange` 等新函式、標題列按鈕、`edClipInspector` 的 `cpEditorClip` 旁加過期提示 | PJ.1 不重疊。**PJ.4 與 ED.3.6 都改 `edClipInspector` 結尾**：ED.3.6 先，PJ.4 的過期提示放在 `cpEditorClip(p, c)` 之後（ED.3.6 保留這一行當錨點）。同一時間只一個 session 改此檔：ED.3 全部排在 PJ.1 commit 之後 |
| `shared/editor-model.js` | §1.1 新增、`STYLE` | 無 | — |
| `backend/editor-export.cjs` | §3.4 | FC.3／EC.3 只動 `api.cjs`、`release-text.cjs`、`main-system.cjs`；`release-text.cjs:24` 呼叫 `validateProject` | 不重疊；`validateProject` 只加欄位，回傳形狀不變 |
| `styles/tools.css` | `:734` 旁加 summary 一行 | 目前無他線 | — |
| `shared/runtime.js`、`shared/episode-spine.js`、`scripts/tools-engine-host.js`、`scripts/tools-0.js`、`backend/api.cjs` | 不碰 | PJ.1／FC／EC | — |
| 測試 | 新 `tests/ed3-legacy-golden.cjs`、`tests/ed3-effects.cjs`、`tests/ed3-inspector.cjs`；改 `ed2-timeline.cjs`、`tools-editor.cjs`、`p1-loop.cjs`、`media-contract.cjs` 的標籤 | PJ.1 會改 `tools-editor.cjs`、`p1-loop.cjs` 的「新增專案」流程（`pj-project-spine-spec-20261106.md:117`） | 同檔不同行；後做的人先 `git pull` 再改 |

## 7. 舊專案輸出不變的測試（ED.3.0，新檔 `tests/ed3-legacy-golden.cjs`）

- **Fixture 語料** `tests/fixtures/ed3-legacy/projects.json`（ED.3.0 commit，**在任何產品改動之前**建）：素材由測試自己用 lavfi 產生到暫存目錄（testsrc 影片含 sine 音、純色 PNG、sine WAV、一個 2³ 的 `.cube`），專案涵蓋現有每條路徑，每個 1–2 秒、720p：
  1. 五種轉場（舊名＋`transitionDuration` 秒，同 `tests/editor-render.cjs:62-74`）；
  2. 三種遮罩＋`background:"模糊"`＋濾鏡＋顆粒＋旋轉（同 `editor-render.cjs:91-104`）；
  3. `background:"純色"`＋`backgroundColor`、`fit:"裁切"`、`background:"黑色"`；
  4. 專案 `filter`＋部分片段自己的 `filter`；
  5. 調色四項＋LUT；
  6. `volumeKeys`、淡入淡出、`speed` 0.5 與 2、片段靜音、軌道 muted／hidden／normalize；
  7. 疊加層（x／y／width／opacity／rotation）與圖片；
  8. 文字片段四種動畫、底色、三種對齊；
  9. 比例 16:9／9:16／4:5／4:3 各一，影格率 30 與 30000/1001 各一；
  10. pre-P2 的物件式 `tracks`（五軌）。
- **A＝參數快照**：直接呼叫 `exportEditor(project, { file, output, signal, run }, "720p")`（`editor-export.cjs:297-301`）；`output` 用可預期檔名（`out-<n>.<ext>`，取代 `randomUUID`）；`run` 包一層：記下參數陣列（暫存目錄前綴換成 `<DIR>`）後交給真的 FFmpeg（`backend/media.cjs:40` 的 run）。快照存 `tests/fixtures/ed3-legacy/args.json`（ED.3.0 時由當時的程式產生並 commit）。之後每次：逐字相等，否則 FAIL 並印出第一個不同的 filter 段。
- **B＝逐影格雜湊**：每個輸出跑 `ffmpeg -i out.mp4 -map 0:v -f framemd5 -`，存 `tests/fixtures/ed3-legacy/framemd5.json`；之後逐行相等。只有換 FFmpeg 版本時可重產 B（A 必須仍相等，且 commit message 寫明）。
- **C＝開檔不寫入新欄位**（放 `tests/ed3-inspector.cjs`）：真 Edge 開一個舊專案、什麼都不動、Ctrl+S，讀回存檔，斷言每個片段、軌道、專案都沒有 §1 的新欄位鍵。
- 跑法：`node tests/ed3-legacy-golden.cjs`；ED.3.4 起每個 commit 必跑。產生快照只在 ED.3.0 用 `--record`（檔已存在就拒絕覆寫，除非 `--record --force` 並在 commit message 說明原因）。
- 突變（AGENTS.md §1：守衛一次）：把 `:448` 改成 `boxblur=21:1` → A 必紅；還原 → 綠。

## 8. 每個新效果的驗收（卡片點名：輸出一次真影片＋抽畫面）

新檔 `tests/ed3-effects.cjs`，素材同 `tests/editor-render.cjs:19-30`（純色或 testsrc），每項輸出一次 720p 真影片，抽格用 `editor-render.cjs:44-60` 的 `pixels()` 或 crop 後 1×1 平均：

| 效果 | 專案 | 抽格 | 斷言 |
|---|---|---|---|
| 濾鏡強度 | 紅色片段，`filter:"黑白"`，`filterStrength:0.5` | 0.5 s 中心 | R 介於「原始」與「黑白」各自輸出的 R 之間（三支都輸出，差 > 20） |
| 套用範圍 | 專案 `filter:"黑白"`；V1 第二段 `filter:"原始"` | 兩段各中心 | 第一段灰（\|R−B\| < 10）、第二段紅 |
| 光漏 | 黑色片段，`lightLeak:1` | 0.5 s 左上 40×40、右下 40×40 | 左上 R > 120 且 R > B+60；右下 < 20 |
| 震動 | testsrc，`shake:1` | 第 5、6 格同一 crop | 兩格 framemd5 不同；沒有 `shake` 的對照支兩格與來源一致 |
| 關鍵影格縮放／位移 | 黑底主軌上 100×100 紅色疊加圖，keys 第 0 格 scale 1、第 59 格 scale 2，x 0→50 | 第 0、30、59 格中線 | 紅色寬度與中心 x 等於依 `piecewise` 算出的值 ±4 px |
| 關鍵影格旋轉 | 主軌紅色寬條，rotation 0→90 | 第 0、59 格 | 第 59 格橫向紅色長度 < 第 0 格的 1/2 |
| 背景模糊強度 | 9:16 專案放 16:9 testsrc，`background:"模糊"`，`backgroundBlur` 2 與 40 兩支 | 上方模糊區 40×40 | 40 那支的像素標準差 < 2 那支 |
| 分離音訊 | 影片＋分離出的 A1 片段，原片段 muted | 音訊 | `loudnessStats`（`backend/media-inspect.cjs`，`tests/p2-mix.cjs:16`）響度 > −40 LUFS；來源換成無音軌影片 → 輸出成功且靜音 |
| 旁白時降低 | A2 sine 440 全長 `duck:true`、A1 sine 880 在 1.0–2.0 s | 0.3–0.7 s 與 1.3–1.7 s 的 440 Hz（`bandpass=f=440` 後 `astats` RMS） | 第二段比第一段低 10–14 dB |
| 速度 2x | 4 s 素材 2x | 長度 | UI 上片段長度減半（`ed3-inspector`），輸出總長 2 s |

- 每項的抽格位置與看什麼寫在 PASS 字串裡；拼圖存暫存目錄，路徑印在 `EVIDENCE` 行（同 `editor-render.cjs:132`）。
- 突變（守衛一次）：拿掉 §3.4 第 8 點 → 震動那支的輸出驗證失敗（證明此守衛必要）；還原 → 綠。
- UI 側 `tests/ed3-inspector.cjs`（真 Edge，同 `tests/ed2-timeline.cjs:14-31` 的開法）：整片設定四組存在；組可收合且重開後仍收合；標題值（`×1.00`、`黑邊`、`1x`、`100%`、`22.40s` 型式）；`1920/2` 算式；↑／Shift+↑／Esc；範圍三鈕的寫入規則（整片寫入後各片段沒有該鍵）；◇ 新增／◆ 移除；分割後兩半的 key；速度 2x 長度減半；分離音訊產生 A1 片段且原片靜音；`.editor-inspector select` 數量 0；§7 C。
- 其餘重跑（有輸出改動的卡）：`tests/tools-editor.cjs`、`tests/editor-render.cjs`、`tests/p2-mix.cjs`、`tests/export-frame-check.cjs`、`tests/ed2-timeline.cjs`。

## 9. 發現的衝突與缺口

- **G1 預覽本來就不畫濾鏡、遮罩、顆粒、背景模糊**：`edPaint` 只套 `edGrade`（`tools-editor.js:1211`），背景永遠黑（`:1210`）。ED.3.2 補濾鏡＋強度、光漏、震動的預覽；遮罩／顆粒／背景模糊的預覽不在 ED.3 卡內 → 回報監工決定歸哪張卡。
- **G2 頂列比例仍是下拉**（`edRatioSelect` `:564-570`，頂列 `:572`）。ED.3.1 的整片設定改按鈕；頂列屬 ED.1（PJ.1 正在改同一行）。建議 ED.1.4 或 PJ.1 收尾時一起改。
- **G3 規格 §3 說 ED.3 要「補背景模糊輸出」**：模糊輸出早已存在（`editor-export.cjs:443-456`，`tests/editor-render.cjs:99` 有測）；ED.3 只補強度。
- **G4 軌道層濾鏡**：輸出端早就讀 `track.filter`（`:87`），但 UI 從沒寫過（`tools-editor.js` 無 `track.filter`）；ED.3.2 的「此軌」第一次用到它。
- **G5 旁白時降低**依「A1 上有片段的時間」閃避，不是偵測人聲大小；A1 片段裡的空白段也會壓低。可預測、可逐格測；偵測人聲需 `sidechaincompress`，輸出不可預期，不採用。
- **G6 `fit:"裁切"`**：只有輸出端讀（`:457`），UI 沒有入口；舊資料照舊輸出，不新增 UI。
- **G7 PJ spec 的行號已過期**（引用 ED.1 前的 `tools-editor.js:600`、`:1161-1195` 等）；PJ.1 照函式名找，ED.3 不受影響。

**已決定（2026-11-06，操作者交監工決定）：Q1＝A（最近一層覆蓋；B 違反 I1）、Q2＝A（沿用同一影片檔，ED.4 拆出音軌時統一）。**

**要操作者決定（2 題，皆附建議）**：

- **Q1 三層同時有設定時怎麼算**：A＝最近一層覆蓋（片段 > 此軌 > 整片），改較大範圍時清掉較小範圍的設定（建議：輸出端現有濾鏡就是這樣，舊專案不變，按下去看到的就是結果）；B＝三層效果全部疊加（可能疊出過重的色彩，且舊專案「整片濾鏡＋片段濾鏡」的輸出會變，違反 I1）。
- **Q2 分離音訊要不要另存一份音訊檔到素材庫**：A＝沿用同一個影片檔當音訊來源，不產生新檔、免費、即時（建議；ED.4 做「拆出音軌」時再讓分離音訊改用它，避免兩套抽音訊）；B＝照參考另存音訊檔（要新增後端抽音訊任務，ED.3 範圍變大）。

## 10. RISKS

- R1 `gradients`、`scale eval=frame`、`pad eval=frame` 依賴 FFmpeg 新版。輸出用的是 npm `ffmpeg-static` 5.3.0 的執行檔（`backend/media.cjs:4`，`package.json:9`；不是 `Dockerfile:8` 裝的系統 ffmpeg）；本規格只在本機 Windows 版 6.1.1 實跑，正式機容器內 Linux 版未驗。ED.3.4 實作前先在容器跑 `node -e "console.log(require('ffmpeg-static'))"` 取路徑，再跑 `-filters | grep -E "gradients|blend"` 與 §3.4 第 5 點的一行實驗。
- R2 x264 逐位元可重現依賴同一 FFmpeg 版本與 `-filter_complex_threads 1`（`:334-335`）；§7 B 在不同機器可能不同，A（參數快照）才是跨機器的主判準。
- R3 `edClipInspector` 整段改寫會影響所有用 label 找欄位的既有測試；§3 已列出要改的行，實作後全跑 §8 的重跑清單。
