# 影音工作台「專案主線」逐檔規格：卡 PJ.1–PJ.4（2026-11-06）

需求正本：[`engine-route-plan-20261106.md`](engine-route-plan-20261106.md) §6（四個回答）、§5 不變量、§9 PJ。本檔只把它落成逐檔做法，不加 §6 沒有的功能。讀者：照卡實作的 Opus／Sonnet。`VW`＝`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`，以下路徑都相對 VW。行號 2026-11-06 對 HEAD `33db8798d`＋FC.2 未提交的工作樹 grep 過；**開卡時先 grep 一次**（FC.2 commit 後 `scripts/tools-0.js` 行號會動）。

## 0. 先讀懂的五個事實（決定了整份設計）

| # | 事實 | 證據 |
|---|---|---|
| F1 | 專案頁的狀態不在瀏覽器，存在伺服器 `db.projects`：專案頁用 `VideoWorkbench.storage` 鍵 `awarewave-projects-screenshot-frontend-v1` 讀寫，runtime 把它對到 `db.projects`＋`db.selection` | `scripts/projects-0.js:31,60,75`；`shared/runtime.js:101-102,116-118` |
| F2 | `M.project()` 保留未知欄位、`episodes` 原樣存 → 「集」加欄位不用改 models、不用改後端 | `shared/models.js:37-47`；後端 PUT /state 只驗四個陣列 `backend/api.cjs:1015-1029` |
| F3 | 專案頁、工具頁、生成頁是同一主頁下的 iframe；子頁寫入＝把**整份** projects 送給主頁取代（`write()`）。專案頁自己持有一份私有 `state`，開頁讀一次後不再重讀 | `shared/runtime.js:116-118,349-354`；`scripts/projects-0.js:54-68`；`index.html:75-97` |
| F4 | 所有任務只有一個入口 `generate()`（`VideoWorkbench.generations.create`），任務 `input` 原樣存、原樣回傳；成品變素材只有兩處：任務面板 `jobs-view.js:64-65`、開頁補帳 `runtime.js:329-330` | `shared/runtime.js:203-265,444`；`shared/jobs-view.js:64-65` |
| F5 | 鏡頭生成任務已帶 `projectId/episodeId/shotId`（頂層），成功後只靠任務面板的 `onSuccess` 寫 `shot.image`：面板關掉才完成的話，鏡頭永遠拿不到圖 | `scripts/projects-0.js:399-436`；`tests/scene-shots.cjs:81,91` 斷言頂層 `shotId` |

由 F3 推出的不變量（本規格的核心）：**「集」的主線欄位只由主頁的 runtime 改**。子頁整包寫回專案時，主頁沿用自己手上的主線欄位，不讓舊副本蓋掉。這一條關掉「工具寫回、專案頁舊副本又覆蓋」整類問題，而不是個別處理。

## 1. 資料格式

### 1.1 存在哪

沿用 `db.projects`（F1），不新建儲存。剪輯檔內容仍在 `preferences["tools.editor.projects"]`（自製剪輯，`scripts/tools-editor.js:238,245`）與 `preferences["tools.engine.projects"]`（FilmCraft，`scripts/tools-engine-host.js:8,245-246`）；它們從此只是「內容庫」，**清單**只有專案頁一份。

### 1.2 「集」新增三個欄位＋鏡頭兩個欄位

| 欄位 | 型別 | 誰寫 | 說明 |
|---|---|---|---|
| `episode.edit` | `{ engine: "workbench-editor" \| "filmcraft", projectId: string } \| null` | runtime（PJ.1） | 指向內容庫的一筆。沒有＝還沒建剪輯檔 |
| `episode.steps` | `Step[]` | runtime（PJ.2） | 每次有工具成品落到這一集，加一筆；同 `jobId` 只記一次 |
| `episode.outputs` | `Output[]` | runtime（PJ.2） | 成片，新的在後 |
| `shot.id` | string | 專案頁（PJ.2 起新鏡頭一律帶；舊的由 runtime 補） | 位置的名字。AI 分鏡的鏡頭已有（`backend/api.cjs:1189`），手動新增的沒有（`projects-0.js:492-495,648-651`） |
| `shot.image`／`shot.video` | url | runtime（PJ.2 起；PJ.1 前由專案頁 `:431` 寫） | 畫面上顯示的那一版。`shot.video` 新增，給影片模型的成品 |
| `shot.line` | string | 專案頁（PJ.3） | 旁白一句。見 §8 Q1 |

```ts
type Slot = `shot:${string}` | `line:${string}` | "edit" | "export";   // 位置
type Step = {
  id: string;            // = jobId（沒有任務的步驟：crypto.randomUUID()）
  step: "shot" | "retouch" | "motion" | "edit" | "sound" | "subtitle" | "export" | "finish" | "derive";
  tool: string;          // TOOLS 的 id（scripts/tools-0.js:3 起），鏡頭生成為 "generator"
  jobId: string | null;
  from: { slot: Slot; key: string }[];   // 這一步用了哪些「位置」上的哪一版（key 定義見 §4）
  sources: string[];     // 任務 input 裡所有本機檔 url（= main-system localUrls，backend/main-system.cjs:51-56）
  settings: object;      // job.input.settings 去掉 project 欄（剪輯整份專案太大，另有 editRevision）
  target: Slot | "output" | null;
  output: { url: string; assetId: string; kind: "image" | "video" | "audio" } | null;  // assetId = "job-"+jobId（runtime.js:286,295）
  at: string;            // ISO 時間
};
type Output = { url: string; assetId: string; jobId: string; editRevision: number | null; derivedFrom: string | null; at: string };
```

### 1.3 填好的例子（§6 答 1：30 秒商品短片 9:16，做完第 9 步、第 10 步加了浮水印）

```json
{
  "id": "ep1_48211", "name": "保溫杯 30 秒", "outline": "通勤族早上帶杯出門…",
  "shots": [
    { "id": "s-1", "text": "清晨廚房，手倒熱水進保溫杯", "seconds": 6, "line": "早上五分鐘，熱到下班。", "image": "/generated/6f1c…a2.png" },
    { "id": "s-2", "text": "捷運車廂，杯子放進包包側袋", "seconds": 6, "line": "側袋放得下，不怕漏。", "image": "/generated/91de…07.png", "video": "/generated/c0aa…31.mp4" }
  ],
  "edit": { "engine": "workbench-editor", "projectId": "0b7e…e2" },
  "steps": [
    { "id": "j-101", "step": "shot", "tool": "generator", "jobId": "j-101", "from": [], "sources": [], "settings": {}, "target": "shot:s-1",
      "output": { "url": "/generated/6f1c…a2.png", "assetId": "job-j-101", "kind": "image" }, "at": "2026-11-10T02:01:00Z" },
    { "id": "j-102", "step": "shot", "tool": "generator", "jobId": "j-102", "from": [], "sources": [], "settings": {}, "target": "shot:s-2",
      "output": { "url": "/generated/c0aa…31.mp4", "assetId": "job-j-102", "kind": "video" }, "at": "2026-11-10T02:04:00Z" },
    { "id": "j-110", "step": "sound", "tool": "voice", "jobId": "j-110", "from": [{ "slot": "line:s-1", "key": "早上五分鐘，熱到下班。" }], "sources": [], "settings": { "voiceSpeed": 100 }, "target": "line:s-1",
      "output": { "url": "/generated/77aa…01.mp3", "assetId": "job-j-110", "kind": "audio" }, "at": "2026-11-10T02:10:00Z" },
    { "id": "j-120", "step": "export", "tool": "edit", "jobId": "j-120", "from": [{ "slot": "edit", "key": "rev:7" }], "sources": ["/generated/6f1c…a2.png", "/generated/c0aa…31.mp4", "/generated/77aa…01.mp3"],
      "settings": { "quality": "1080p", "projectRevision": 7 }, "target": "output",
      "output": { "url": "/generated/e5e5…90.mp4", "assetId": "job-j-120", "kind": "video" }, "at": "2026-11-10T02:20:00Z" },
    { "id": "j-130", "step": "finish", "tool": "watermark", "jobId": "j-130", "from": [{ "slot": "export", "key": "/generated/e5e5…90.mp4" }], "sources": ["/generated/e5e5…90.mp4"], "settings": { "大小": 22 }, "target": "output",
      "output": { "url": "/generated/f0f0…12.mp4", "assetId": "job-j-130", "kind": "video" }, "at": "2026-11-10T02:25:00Z" }
  ],
  "outputs": [
    { "url": "/generated/e5e5…90.mp4", "assetId": "job-j-120", "jobId": "j-120", "editRevision": 7, "derivedFrom": null, "at": "2026-11-10T02:20:00Z" },
    { "url": "/generated/f0f0…12.mp4", "assetId": "job-j-130", "jobId": "j-130", "editRevision": null, "derivedFrom": "/generated/e5e5…90.mp4", "at": "2026-11-10T02:25:00Z" }
  ]
}
```

### 1.4 新檔 `shared/episode-spine.js`（PJ.1 建立，之後各卡往裡加；純函式、不碰 DOM，Node 可 `require`，寫法照 `shared/project-envelope.js:3,51-53`）

| 函式 | 卡 | 做什麼 |
|---|---|---|
| `editId(row)` | PJ.1 | 內容庫一筆的 id：`row.formatVersion===1 ? row.native?.id ?? row.id : row.id`（自製剪輯外層沒有 id，id 在 `native`，`shared/project-envelope.js:25-37`；FilmCraft 外層有 `id`，`tools-engine-host.js:245`） |
| `adopt(projects, editorRows, engineRows)` | PJ.1 | 回傳 `{ projects, added }`。§3.1 的搬法。純函式、可重跑：第二次 `added===0` |
| `keepSpine(oldProjects, newProjects)` | PJ.1 | §0 不變量：對 new 裡每個 episode（依 id）從 old 抄回 `edit/steps/outputs`；PJ.2 起加抄 `shot.image/shot.video`（依 shot id）。new 裡被刪的集／鏡頭不復活 |
| `findByEdit(projects, editProjectId)` | PJ.1 | 回 `{ project, episode }`；給剪輯器找「我是哪一集」 |
| `settle(projects, job)` | PJ.2 | job 成功且 `job.input.link` 指到存在的集 → 加 Step、落到 target（§2 PJ.2）。同 jobId 已有 → 不動。回傳 true＝有改 |
| `current(episode, slot, editRows)` | PJ.4 | 位置現在的 key（§4） |
| `isStale(recordedKey, currentKey)` | PJ.4 | `currentKey != null && recordedKey !== currentKey`。全工作台唯一的過期判斷 |
| `stepStates(episode, editRows)` | PJ.2（過期部分 PJ.4） | 11 步各自 `todo / done / optional / stale` |
| `lineage(episode, outputUrl)` | PJ.4 | 「這支成片是怎麼做的」：從成片的 Step 往回走 `from`，回傳有序清單 |
| `TOOL_STEP` | PJ.2 | §6 答 2 的對照：`edit,edit-pro→edit`；`compose,rig,3d→motion`；`subtitle→subtitle`；`voice,music,sfx,separate→sound`；`upscale,enhance,watermark,cta,privacy→finish`；`region,depth→retouch`；`short,follow→derive` |

載入：`index.html` 的腳本由 `scripts/app-entry.js:23` 的清單載入 → 在 `"shared/runtime.js"` 前加 `"shared/episode-spine.js"`；`pages/projects.html:21`、`pages/tools.html:20`（都是 runtime.js 那行）前各加一行 `<script src="../shared/episode-spine.js"></script>`。**不加在 `scripts/tools-boot.js`**（FC.2 正在改它）。分鏡頁 `pages/storyboards.html` 受保護（`tests/storyboards-design-baseline.json`），不加；runtime 只在「頂層頁」執行路徑用到 spine（下面每處都在 `!child` 分支），分鏡頁永遠是子頁，所以不需要。

## 2. 四張卡

共通：每張卡的 REALTEST 只跑本節點名的測試＋既有機械閘（分鏡六檔雜湊 `tests/generator-deep-actions.cjs`、`tests/sidebar-overlays.cjs`、`tests/test-isolation.cjs`、`tests/appearance.cjs`）。突變只做在本節標「突變」的那一條。

### PJ.1 資料格式、舊剪輯專案收進專案頁、剪輯器不再有自己的清單（Medium）

前置：卡 RV.4 已 commit（`projects-0.js` 撞檔，計畫 R8）；FC.2 已 commit（`tools-0.js` 撞檔）。

| 檔:行 | 動作 |
|---|---|
| `shared/episode-spine.js` | **新檔**：`editId`、`adopt`、`keepSpine`、`findByEdit`（§1.4） |
| `scripts/app-entry.js:23`、`pages/projects.html:21`、`pages/tools.html:20` | 加載入（§1.4） |
| `shared/runtime.js:116-118`（`write()` 的 projects 分支） | 改成：`const next = value.projects.map(M.project); db.projects = child ? next : EpisodeSpine.keepSpine(db.projects, next);` 其餘不變 |
| `shared/runtime.js:270-278`（頂層頁 `ready`） | `normalizeAssets()` 之後加 `spineAdopt()`：`const r = EpisodeSpine.adopt(db.projects.map(M.legacyProject)…)` → 見下「adopt 的輸入輸出形狀」；`r.added > 0` 就 `persist()`。**搬的時候不寫 `tools.editor.projects`／`tools.engine.projects`**（原檔一位元不改） |
| `shared/runtime.js:128-166`（`perform`）＋`:401` 起的 `window.VideoWorkbench` | 新增三個頂層頁動作，子頁走 rpc（照 `preference-set` 的寫法 `:147-153`、`:517-528`）：`spine-attach-edit {projectId, episodeId, edit}`（設 `episode.edit`，persist、broadcast、`vw:changed`）；`spine-adopt {}`（重跑 adopt；剪輯器新建內容後呼叫）；`spine-open {projectId, episodeId}`（`db.selection = {current, episode: 該集 index}` → persist、broadcast → `perform("navigate", {target:"projects"})`）。對外：`VideoWorkbench.spine = { attachEdit, adopt, open }` |
| `scripts/projects-0.js:54-68`（讀 state） | 抽成 `function loadState()`；新增 `document.addEventListener("vw:changed", …)`：比對 `EpisodeSpine` 的「主線簽章」（所有集的 `edit/steps/outputs`＋鏡頭 `image/video`＋`db.selection` 的 JSON），有變才 `loadState(); if (!dialog) render();`。**為什麼要簽章**：專案頁自己每打一個字都會寫入（`:831-845`），主頁會把快照廣播回來（`runtime.js:121-127,176-179`）；無條件重繪會讓輸入框失焦 |
| `scripts/projects-0.js:117`（`renderWorkbench` 的大綱框之前） | 加一行剪輯檔列（PJ.1 唯一的畫面改動）：有 `e.edit` → 「剪輯檔：<內容庫標題>」＋按鈕「開啟剪輯」；沒有 → 按鈕「建立剪輯檔」。兩者都呼叫 `VideoWorkbench.generator.import({ intent: "open-tool", tool: e.edit?.engine === "filmcraft" ? "edit-pro" : "edit", link: { projectId: p.id, episodeId: e.id }, edit: e.edit || null })`（子頁 → 主頁 `runtime.js:137-138` → `generator-results.js:62,79-90` → 工具頁 `acceptAsset`）。標題：`VideoWorkbench.preferences.get("tools.editor.projects")` 依 `EpisodeSpine.editId` 找 |
| `scripts/generator-results.js:80` | 白名單 `generatorResultTools` 擋掉 `edit-pro`；改成不在這裡擋，交給工具頁 `acceptAsset` 的 `TOOLS` 檢查（`tools-0.js:610`）——同一件事只檢查一次。`:2` 的清單仍給 `:17` 的「還原任務」用，不動 |
| `scripts/tools-0.js:617-625`（`acceptAsset` 的剪輯還原） | 改成：`payload.edit?.projectId` 有值 → `ed.current = 該 id`（找不到就報「找不到這一集的剪輯檔」）；`payload.link && !payload.edit` → 建新內容（標題＝集名、比例＝專案比例，用下一列的 `edCreate`）並 `await VideoWorkbench.spine.attachEdit({...payload.link, edit:{engine:"workbench-editor", projectId:id}})`；`payload.project`（任務還原，`generator-results.js:12`）→ 照現在複製一份「（還原）」，存檔後 `await VideoWorkbench.spine.adopt()`（變成一個新專案，不寫進原來那一集） |
| `scripts/tools-editor.js:1161-1195`（`new`） | 建內容的程式抽成 `async function edCreate(title, ratio)`（回傳 id；內容與現在 `:1174-1184` 完全相同），`new` 改呼叫它，存檔後 `await VideoWorkbench.spine.adopt()`。對話框文字不變（多個既有測試按「新增專案」「建立專案」：`tests/p1-loop.cjs:65`、`p2-tracks-ui.cjs:37`、`p3-roundtrip.cjs:68`、`p4-rig-ui.cjs:106`、`p5-workspace.cjs:68`、`remotion-template.cjs:170`、`remotion-title-project.cjs:16`、`tools-editor.cjs:59`） |
| `scripts/tools-editor.js:428-432`（沒開檔時的清單） | 清單來源從 `ed.projects` 改成專案頁：每一集有 `edit.engine==="workbench-editor"` 的列一顆「<專案名> · <集名> · <比例>」按鈕（`open:<內容 id>`）；仍保留「新增專案」。清單由 `VideoWorkbench.storage.getItem("awarewave-projects-screenshot-frontend-v1")` 讀；`ed.projects` 仍是內容快取，不再當清單 |
| `scripts/tools-editor.js:600`（「所有專案」）＋`:1205-1210`（`projects`） | 按鈕字改「回到這一集」，動作改：`ed.current = null` → `edSave()` → `const hit = EpisodeSpine.findByEdit(…, p.id); if (hit) await VideoWorkbench.spine.open({projectId: hit.project.id, episodeId: hit.episode.id});` → `edRender()`。單獨開 `pages/tools.html` 時沒有主頁導覽，結果就是回到上一列的清單 |
| `scripts/tools-compositor.js:1223-1230`（「放到哪個剪輯專案？」）、`scripts/tools-3d.js:569-579`（`place:`） | 清單來源同上（「放到『<專案名> · <集名>』」），按鈕帶的仍是內容 id，`cpPlace`／`cpPlaceAsset`（`tools-compositor.js:678-699`）不動 |

**刪除（第三份死清單 `appToolProjects`）**——`screen()` 先走 `toolWorkflowScreen`（`tools-0.js:301-302`），`edit` 一定被 `toolEditorScreen` 接走（`tools-workflows.js:45-46`；`tools-editor.js` 比 `tools-0.js` 先載入，`tools-boot.js:9`），以下全部執行不到：
- `tools-0.js:303-304`（`edit` 的舊畫面）、`:307-309`（`case "edit"`）
- `tools-0.js:381`（`renderProjects()` 呼叫）、`:514-524`（`renderProjects`）
- `tools-0.js:732-745`（`newproject` 動作）
- 資料鍵 `appToolProjects` 留在 `db.preferences`，不刪資料（grep `tests/` 0 命中，可放心刪程式）。

**adopt 的輸入輸出形狀**（runtime 裡 `db.projects` 是 `M.project` 形，`assets` 是陣列；新專案用同一形）：

```js
{ id: "project-ed-" + rowId, title, type: "single", ratio, style: 8, customStyle: "", createdAt: Date.now(), cover: "",
  assets: [], settings: { model: "sora-2", lockModel: true, videoPrompt: "" },
  episodes: [{ id: "ep-ed-" + rowId, name: title, outline: "", shots: [], edit: { engine, projectId: rowId }, steps: [], outputs: [] }] }
```
欄位同 `projects-0.js:340-363` 的 `createProject`；`style: 8`＝「自訂」，因為舊剪輯專案沒有風格。`title`＝`row.native?.title ?? row.title ?? "剪輯專案"`；`ratio`＝`row.native?.ratio ?? row.output?.ratio ?? "16:9"`（剪輯器的 4:5、4:3 照存；專案頁只顯示比例字串，`projects-0.js:106`）。`engine`＝自製列 `"workbench-editor"`、FilmCraft 列 `"filmcraft"`。已有任何集的 `edit.projectId===rowId` → 跳過。沒有 id 的列 → 跳過並計數（現有資料不會出現：`edNormalizeProject` 保留 id，新建一定給 id `tools-editor.js:1173`）。

測試：
- `tests/pj1-spine-unit.cjs`（新，Node，不開瀏覽器）只測五件：
  1. 三筆內容（一筆 pre-M3 裸物件、一筆 P2 envelope、一筆 FilmCraft 列）→ `added===3`，三個專案、各一集、`edit.projectId` 等於原 id；
  2. 再跑一次 `added===0`；
  3. 傳入的內容列 `deepEqual` 搬之前的 `structuredClone`（原檔不改）；
  4. `keepSpine`：舊有 `steps`、新副本沒有 → 結果保留；
  5. `keepSpine`：新副本刪了一集 → 結果沒有那集。**突變**：把 `keepSpine` 改成直接回傳 new → 第 4 條要紅。
- `tests/pj1-legacy-ui.cjs`（新，Playwright，`tests/isolated-server.cjs` 起隔離伺服器，照 `tests/p2-tracks-ui.cjs:132` 先寫 `tools.editor.projects`）：種同上三筆＋一個既有專案（無新欄位）→ 開主頁 → 專案頁 4 張卡；`tools.editor.projects` 筆數與內容不變；三個集各按「開啟剪輯」→ 自製兩筆出現 `[data-ed-stage]` 且片段數與種子相同，FilmCraft 那筆開到「專業剪輯」（引擎檔不在時工具卡不存在 → 這一步只斷言 `acceptAsset` 回 `{ok:true, tool:"edit-pro"}`）；輸出設定相同：在頁面裡算 `edNative(edProject())` 與 `quality`，`deepEqual` 搬之前對同一筆種子算的值。既有專案打開照舊、沒有報錯。
- 改既有：`tests/remotion-title-project.cjs:32` 按鈕名改「回到這一集」（流程不變：回清單 → 新增專案）。`tests/fc2-engine-host.cjs:65,92` 數 `tools.editor.projects` 筆數，不受影響。
- 重跑：上兩個新檔、`p1-loop`、`p2-tracks-ui`、`p3-roundtrip`、`p4-rig-ui`、`p5-workspace`、`remotion-title-project`、`media-contract`（舊資料轉換）、`scene-shots`。

驗收：舊資料測試過；專案頁看得到每個舊剪輯專案；從專案頁開剪輯、從剪輯「回到這一集」來回各一次。

回退：`git revert`。搬進來的專案留在 `db.projects`，是普通專案（多的欄位 `M.project` 原樣保留、舊程式不讀）；`tools.editor.projects` 從頭到尾沒被改過，剪輯器的清單回到 `ed.projects` 即恢復。

### PJ.2 一集頁的步驟列；工具做完自動寫回這一集（Medium）

| 檔:行 | 動作 |
|---|---|
| `shared/episode-spine.js` | 加 `TOOL_STEP`、`settle`、`stepStates`（過期判斷先回 `done`，PJ.4 再接） |
| `shared/runtime.js:203`（`generate` 第一行） | `if (!input.link && typeof VideoWorkbench?.spineLink === "function") { const link = VideoWorkbench.spineLink(input); if (link) input = { ...input, link }; }`——**所有工具的任務只從這一個入口帶上歸屬**，不改十個工具檔 |
| `shared/runtime.js:329-330`（`reconcileJobs` 把成品補成素材處） | 同一個 `if` 裡加 `if (EpisodeSpine.settle(db.projects, j)) changed = true;` |
| `shared/runtime.js:128-166`＋`window.VideoWorkbench` | 新動作 `spine-settle {job}`：頂層頁 `EpisodeSpine.settle(db.projects, job)` 有改就 persist、broadcast、`vw:changed`。對外 `VideoWorkbench.spine.settle(job)` |
| `shared/jobs-view.js:65`（HEAD；另一 session 正改此檔，工作樹已移到 `:90`，開卡時 grep `jobAsset(v)`） | 存素材那行之後加 `VideoWorkbench.spine?.settle(v).catch(VideoWorkbench.reportError);`。面板開著完成走這條，面板關了走上一列的補帳，兩條都進同一個 `settle`，同一 jobId 只記一次 |
| `scripts/tools-0.js`（`acceptAsset`，`:609-633`） | `payload.link` 有值就存進 `toolDrafts[tool].link`（`saveDraft` 寫 `{values, files, selection, link}`，`:446-452`；`restoreToolDraft` 還原 `link`，`:212-217`）。從工具首頁直接開（`open:`，`:652-669`）不帶 link → 清掉該工具的 `link`：「應用工具」頁單獨開照舊、不掛任何集（§6 答 2 末句） |
| `scripts/tools-0.js`（檔尾，`VideoWorkbench.tools` 之後） | `VideoWorkbench.spineLink = (input) => tool === "edit" ? edSpineLink(input) : (toolDrafts[tool]?.link ? { ...toolDrafts[tool].link, tool, step: EpisodeSpine.TOOL_STEP[tool] } : null);` |
| `scripts/tools-editor.js`（新函式 `edSpineLink(input)`） | 只在 `input.operation === "editor-export"` 時回 `{ projectId, episodeId, tool: "edit", step: "export", target: "output", from: [{slot: "edit", key: "rev:" + p.revision}] }`（用 `EpisodeSpine.findByEdit`）；片頭等其他任務回 `null`（它們由剪輯器自己放進時間軸，`tools-editor.js:689-725`） |
| `scripts/projects-0.js:399-421`（`generateShot` 的 create） | 加 `link: { projectId, episodeId, shotId, tool: "generator", step: "shot", target: "shot:" + shotId }`。頂層三個欄位保留（`tests/scene-shots.cjs:81,91` 斷言它們） |
| `scripts/projects-0.js:424-436`（`onSuccess` 寫 `shot.image`） | **刪**，改成 `VideoWorkbench.showJob(job)`。寫 `shot.image` 的只剩 runtime 的 `settle`（F5 的洞一起補上）；`keepSpine` 自此加抄 `shot.image/shot.video` |
| `scripts/projects-0.js:492-495`（`addShot`）、`:648-651`（`manualShots`） | 新鏡頭帶 `id: crypto.randomUUID()`；`:388` 的 `shot.id ||=` 保留給舊鏡頭。runtime 的 adopt 同時替所有沒有 id 的舊鏡頭補 id（舊資料） |
| `scripts/projects-0.js:117`（`renderWorkbench`） | 加步驟列（§6 畫面文字），放在 `work-top` 與 `outline-box` 之間；PJ.1 的剪輯檔列併入第 6 步。鏡頭卡（`:117` 的 `.shot`）在「生成畫面」旁加「修這張」（有 `image` 才出現，開 `region`，`link.target="shot:"+id`、`from=[{slot, key:image}]`）。成片區列 `outputs`，每支有：播放、「送審與投遞」（`VideoWorkbench.deliveryUrl`，`jobs-view.js:8-15,37`，用 `VideoWorkbench.generations.get(jobId)` 取任務）、第 10 步五個工具按鈕、「剪成短影音」「人物跟拍」（`derive`，`link.target="output"`、`derivedFrom`＝這支）。開工具一律走 `generator.import({intent:"open-tool", tool, asset, link})`（`generator-results.js:79-90`） |
| `scripts/projects-0.js:249`（預覽對話框「還沒有正式生成影片」） | 有 `outputs` 時改成播放最新一支；沒有照舊 |

`settle(projects, job)` 規則（照順序）：
1. `job.status !== "succeeded"` 或沒有 `job.result?.url` 或沒有 `job.input?.link` → `false`。
2. 找 `link.projectId`／`link.episodeId`；找不到（集被刪）→ `false`。
3. 已有 `steps[].jobId === job.id` → `false`。
4. 推一筆 Step：`sources`＝`localUrls(job.input)` 的同一規則（`backend/main-system.cjs:28,51-56`，規則複製成前端函式，註解指回原處）；`settings`＝`job.input.settings` 去掉 `project`；`output.kind`＝`VideoWorkbench.jobAsset` 的 `kind`（`runtime.js:296`）。
5. 落到 target：`shot:<id>` → 圖片設 `shot.image`、影片設 `shot.video`（舊版本留在 steps）；`output` → 推 Output（`editRevision`＝`job.input.settings?.projectRevision ?? null`，`derivedFrom`＝`link.from?.[0]?.key ?? null`）；`line:<id>` 只記（PJ.3 放上時間軸）。
6. 回 `true`。

測試 `tests/pj2-spine-settle.cjs`（新）只測：
1. 單元：同一任務 `settle` 兩次只一筆；集被刪 → 不記；`target:"shot:x"` 的影片設到 `shot.video`；
2. UI：專案頁按「生成畫面」（假供應商，照 `tests/scene-shots.cjs`）→ **關掉任務面板** → 任務完成後重開主頁 → 鏡頭有圖、步驟列第 3 步「做好了」（F5 的洞）；
3. 工具頁單獨開浮水印跑一次 → 沒有任何集多出 Step。**突變**：拿掉 `runtime.js:329` 加的那行 → 第 2 條紅。
重跑：`scene-shots`、`generation-flows`、`p6-main-system`、`fc2-engine-host`。

驗收：答 1 的例子，第 3、4、9、10 步的成品不用回素材庫找，自動出現在這一集。

回退：`git revert`。已寫的 `steps/outputs` 留著，舊程式不讀；`shot.image` 照舊顯示。

### PJ.3 「排成時間軸」；配音、字幕自動上軌（Medium）

前置：§8 Q1 已決定（操作者 2026-11-06：要加旁白）→ 照做法 A。

| 檔:行 | 動作 |
|---|---|
| `scripts/projects-0.js:117`（鏡頭卡） | 「畫面描述」下加「旁白」一格（`data-bind="shot.<i>.line"`，`:836-843` 的綁定照樣處理字串） |
| `backend/api.cjs:1172-1194`（`/director/shots`） | 系統提示加「line（繁體中文，這一鏡要念的旁白一句，可空）」；回傳每個鏡頭加 `line: String(s.line \|\| "")`。只動這一段（FC.3 動的是 `api.cjs` 的路由區（`/uploads` 現在在 `:947`），不同段，但同一檔 → 見 §7 順序） |
| `scripts/tools-editor.js`（新函式 `edArrange(p, episode)`） | 「排成時間軸」，免費、可重做。對每個有畫面的鏡頭（`shot.video ?? shot.image`），依序在主軌（`edMain(p)`）放一段，長度＝`shot.seconds`，片段帶 `slot: "shot:" + shot.id`。重做＝先移除主軌上所有帶 `slot` 的片段，再重排；使用者自己加的片段（沒有 `slot`）不動。一次 `edCheckpoint()`（一步可復原）。片段建立照 `edAdd` 的欄位（`tools-editor.js:800-816`），但起點由前一段的結束決定 |
| `scripts/tools-editor.js`（新函式 `edSpineSubtitles(p, episode)`） | 「用旁白產生字幕」，免費、可重做：以 `edArrange` 的每段起迄當時間，`line` 當文字，呼叫既有 `edImportCues`（`tools-editor.js:1720-1769`）；產生的字幕片段帶 `slot: "line:" + shot.id`、`text`＝當時的 `line`。重做＝先移除所有 `slot` 以 `line:` 開頭的文字片段 |
| `scripts/tools-editor.js`（新函式 `edSpineVoice(p, episode)`） | 「配音（照旁白逐句）」，付費：對每個有 `line` 的鏡頭建一個配音任務（`operation:"voice"`，欄位照 `tools-voice-music.js:118-125`），`link={…, step:"sound", tool:"voice", target:"line:"+id, from:[{slot:"line:"+id, key: line}]}`。按鈕上顯示 句數 × 單句價（價格來源同配音工具的按鈕）。不自動重跑 |
| `scripts/tools-editor.js`（新函式 `edPlaceSpine(p, episode)`） | 把 `steps` 裡 `step==="sound"` 且 `target` 為 `line:<id>`、時間軸上還沒有 `clip.jobId===step.jobId` 的配音，放到第一條音訊軌（`edTrackFor(p,"audio")`）該鏡頭片段的起點；片段帶 `slot`、`jobId`。剪輯器開檔時（`toolEditorAfterRender`，`tools-editor.js:1088-1098`）與 `vw:changed` 時各跑一次；可重跑（以 `jobId` 判斷已放過）。**任務面板開著或關著完成，都由這一個函式放上去** |
| `scripts/tools-editor.js:600`（標題列） | 目前這個剪輯檔屬於某一集時（`findByEdit` 有結果），加三顆：「排成時間軸」「用旁白產生字幕」「配音（照旁白逐句）· <價格>」 |
| `scripts/projects-0.js`（步驟列第 6、7、8 步） | 按鈕都是「開啟剪輯」並帶 `intent` 參數（`arrange`／`voice`／`subtitle`），剪輯器開檔後執行對應函式（付費的只開到按鈕前，不代按） |

音樂：§6 答 1 第 7 步的「配樂」＝開音樂工具（`music`），帶 `link.target=null`；成品成為 Step，「放到音樂軌」由使用者在剪輯器素材窗格按（沒有對時位置可自動決定）。這是唯一不自動上軌的聲音，畫面上寫明。

測試 `tests/pj3-arrange.cjs`（新）只測：
1. 3 個鏡頭（一張圖、一支影片、一個沒畫面）→ 排成 2 段、長度＝`seconds`、帶 `slot`；
2. 手動加一段後重排 → 手動那段還在；
3. 字幕：2 句旁白 → 2 個文字片段、起迄對齊；
4. `edPlaceSpine` 跑兩次只放一段；
5. `/director/shots` 假模型回 `line` → 鏡頭有 `line`。
重跑：`p2-subtitles`、`tools-editor`、`voice-mix`、`p1-loop`。

回退：`git revert`；`shot.line`、片段上的 `slot`／`jobId` 是多出的欄位，舊程式忽略（`edNormalizeProject` 用 `...clip` 保留，`tools-editor.js:158-164`）。

### PJ.4 過期提示；「這支成片是怎麼做的」；兩個局部做法併成同一條規則（Medium）

| 檔:行 | 動作 |
|---|---|
| `shared/episode-spine.js` | 加 `current`、`isStale`、`lineage`；`stepStates` 接上過期 |
| `scripts/tools-editor.js:607`（時間軸片段） | 片段有 `slot` 且 `EpisodeSpine.isStale(clip 記的 key, current)` → 片段加 class `stale`（樣式用現有 `.note` 的顏色 token，寫在 `styles/` 現有的剪輯器樣式檔，不寫色碼）＋`title` 說明 |
| `scripts/tools-editor.js:596`（片段屬性欄，`cpEditorClip` 旁） | 過期片段出現「鏡頭 N 換過了」＋按鈕「換成新的」（免費）：換 `clip.asset`、舊 id 推進 `clip.previousAssetIds`（照 `tools-compositor.js:772` 的做法）；字幕片段出現「旁白改過了」＋「重新產生字幕」；配音片段出現「旁白改過了，要重新配音」＋「重新配音這句 · <價格>」（付費，按了才送） |
| `scripts/projects-0.js`（步驟列） | 狀態改用 `stepStates` 的 `stale`；成片區每支：`isStale` 時顯示「要重新輸出」＋「重新輸出」（免費，開剪輯並帶 `intent:"export"`，剪輯器打開匯出對話框 `edExportDialog`，`tools-editor.js:1772`）；第 10 步的成品過期顯示「成片換過了，要重做」＋「開啟<工具名>」（付費或需設定，只開工具） |
| `scripts/projects-0.js`（成片區） | 每支一顆「怎麼做的」→ 對話框（`modal()`，`projects-0.js:150-151`）列 `lineage`：每列「第 N 步 <步驟名> · <工具名> · <時間>」＋用到的素材縮圖。主系統那邊同一份資料在 `parentAssetIds`（`backend/main-system.cjs:146`），不另送 |
| `scripts/tools-compositor.js:743`、`:764` | 兩處 `latest.revision > o.compositionRevision`／`<=` 改成 `EpisodeSpine.isStale("rev:" + o.compositionRevision, latest && "rev:" + latest.revision)`（`:764` 取反） |
| `scripts/tools-rig.js:273` | `latest && latest.version > l.rigVersion` 改成 `EpisodeSpine.isStale("rev:" + l.rigVersion, latest && "rev:" + latest.version)` |
| `shared/rig.js:654-658`（`atVersion`） | **不改**：它是「依版本號取那一版」的查詢，不是過期判斷 |

`current(episode, slot, editRows)` 的 key（只有這四種位置；動畫合成與骨架用 `rev:` 同一函式）：

| slot | 現在的 key |
|---|---|
| `shot:<id>` | `shot.video ?? shot.image ?? null` |
| `line:<id>` | `shot.line ?? null` |
| `edit` | `"rev:" + 內容庫那一筆的 revision`（`tools-editor.js:228-234` 存檔時算的） |
| `export` | 最新一支 `derivedFrom===null` 的 Output 的 `url` |

片段記的 key：`slot` 為 `shot:` → `clip.asset.url`；`line:` → 字幕片段的 `text`、配音片段的 Step `from[0].key`。Output 記的：`"rev:" + editRevision`。

說明：版本號只會變大，`!==` 與原本的 `>` 結果相同；統一後全工作台只有 `isStale` 一個判斷。

測試 `tests/pj4-stale.cjs`（新）只測：
1. 單元：鏡頭換圖 → 對應片段 stale；換成新的之後不 stale、`previousAssetIds` 多一個；
2. 剪輯存檔（revision +1）→ 成片 stale；
3. 改旁白 → 字幕片段 stale；
4. `lineage` 對 §1.3 的例子回 4 列（浮水印 → 輸出 → 配音、兩個鏡頭）；
5. 付費步驟過期後 runtime 沒有自動建任務（`db.jobs` 筆數不變）。**突變**：`isStale` 改成永遠 `false` → 第 1 條紅（守的是「過期一定看得到」）。
重跑：`p3-review-fixes`、`p3-roundtrip`、`p4-rig-ui`、`p4-rig-unit`、`p4-review-fixes`。

回退：`git revert`；只多了畫面提示，資料沒有新欄位。

## 3. 舊資料

### 3.1 `tools.editor.projects` 每一筆怎麼收進來

- 時機：頂層頁 runtime 每次載入（`runtime.js:270-278`），在 `normalizeAssets()` 之後；可重跑，沒有新的就不存檔。
- 規則：§2 PJ.1「adopt 的輸入輸出形狀」。id 不變（`edit.projectId`＝原 id），原列不改、不轉換——還沒轉成 frames 的 pre-M3 列，等剪輯器第一次打開時照舊由 `edLoadProjects` 轉換並先備份（`tools-editor.js:244-280`）。
- `tools.engine.projects`（FilmCraft，FC.2 才有）同一規則，`engine:"filmcraft"`。

### 3.2 專案頁現有專案

不搬、不補欄位。程式一律把「沒有 `edit`／`steps`／`outputs`」當成空的（`?? null`、`?? []`）——**資料沒有新欄位＝照舊顯示**。唯一寫回的是替沒有 `id` 的鏡頭補 id（PJ.2，位置要有名字才能記），在 adopt 同一步做。

### 3.3 舊資料測試

就是 `tests/pj1-legacy-ui.cjs`＋`tests/pj1-spine-unit.cjs` 第 1–3 條：
- 筆數相同；
- 每筆能開；
- 輸出設定 `deepEqual`；
- 原列 `deepEqual`。

PJ.2 起另驗：舊鏡頭補了 id、原有 `image` 不變（併入 `pj2-spine-settle.cjs` 第 2 條的種子資料）。

## 4. 過期判斷落在哪

唯一規則：`EpisodeSpine.isStale(記下的 key, 位置現在的 key)`（`shared/episode-spine.js`）。用到它的只有：

- 剪輯片段：`tools-editor.js:596,607`；
- 一集頁步驟列與成片區：`projects-0.js` 的 `renderWorkbench`；
- 動畫合成：`tools-compositor.js:743,764`；
- 骨架：`tools-rig.js:273`。

付費步驟（鏡頭生成、配音、音樂、畫質增強、影音增強、肖像權保護）只標示＋開工具／按鈕上帶價格，任何程式路徑都不會自己建任務（PJ.4 測試第 5 條守）。免費又確定的三件（排成時間軸、用旁白產生字幕、輸出）給「重做」。

## 5. 每個 commit 都可部署（main 隨時可能上線，RV.4 之後就會部署工作台）

| 卡落地後、下一張還沒來 | 使用者看到 | 為什麼不會壞 |
|---|---|---|
| 只有 PJ.1 | 專案頁多出舊剪輯專案的卡；每集多一列「剪輯檔」；剪輯器「所有專案」變「回到這一集」 | 新欄位只有 `edit`；沒有步驟列。舊的鏡頭生成照舊由 `onSuccess` 設圖 |
| PJ.1＋PJ.2 | 每集有步驟列，第 6–8 步只有「開啟剪輯」；鏡頭圖改由主頁寫 | 沒有 `steps` 的集＝全部「還沒做」或依鏡頭／剪輯檔推得的狀態；過期一律不顯示 |
| ＋PJ.3 | 鏡頭卡多「旁白」；剪輯器多三顆按鈕 | 沒旁白的鏡頭不配音、不出字幕，按鈕旁寫原因 |
| ＋PJ.4 | 過期標示與「怎麼做的」 | 純顯示 |

不用功能旗標。任一卡 revert 後，資料留著、舊程式不讀。

## 6. 畫面文字（繁中；版面用工作台現有 class：`btn small outline`、`badge`、`note`、`tiny`、`step`／`circle`（`projects-0.js:117` 的空集引導已在用）；不寫色碼、不用下拉）

步驟列：11 個 `step` 方塊一排，每塊＝`circle` 編號＋步驟名＋狀態 `badge`。

| # | 步驟名 | 還沒做時的按鈕 | 備註文字（`tiny`） |
|---|---|---|---|
| 1 | 專案 | — | 建立時就完成 |
| 2 | 腳本與分鏡 | 「AI 分鏡」（沿用 `projects-0.js:217-218`，按鈕上已寫計費） | — |
| 3 | 鏡頭畫面 | 「批次生成」（沿用 `:740-742` 的確認句） | 「每個鏡頭也可以在下方單獨生成。」 |
| 4 | 修圖 | — | 「選用。在鏡頭卡上按『修這張』。」 |
| 5 | 片頭與動畫 | 「開啟動畫合成」 | 「選用。做好後在動畫合成按『放到剪輯』，選這一集。」 |
| 6 | 剪輯 | 「建立剪輯檔」／「開啟剪輯」 | 「先排成時間軸，再微調。」 |
| 7 | 聲音 | 「配音」「配樂」 | 「配音會照每一鏡的旁白逐句產生。配樂做好後，要自己放到音樂軌。」 |
| 8 | 字幕 | 「產生字幕」 | 「用旁白對時間，不用語音辨識，不收費。」 |
| 9 | 輸出 | 「輸出」 | — |
| 10 | 修復與品牌 | 「加浮水印」「CTA 按鈕」「畫質增強」「影音增強」「肖像權保護」 | 「選用。做完會成為新的一版成片，舊的保留。」 |
| 11 | 送審 | 「送審與投遞」 | 「送審結果在主系統的送審頁。」 |

狀態 `badge`：「還沒做」「做好了」「選用」「要重做」。

其他字串：

| 位置 | 文字 |
|---|---|
| 剪輯檔列（PJ.1） | 「剪輯檔：<標題>」；「還沒有剪輯檔。」 |
| 剪輯器標題列 | 「回到這一集」「排成時間軸」「用旁白產生字幕」「配音（照旁白逐句）· <價格>」 |
| 排成時間軸的確認（已排過時） | 「會重新排列由鏡頭排上去的片段。你自己加的片段不會動。」按鈕「重新排列」「取消」 |
| 沒旁白 | 「還沒有旁白。在鏡頭卡填『旁白』後才能配音和產生字幕。」 |
| 過期：鏡頭片段 | 「鏡頭 <N> 換過了。」按鈕「換成新的」 |
| 過期：字幕 | 「旁白改過了。」按鈕「重新產生字幕」 |
| 過期：配音 | 「旁白改過了，這句要重新配音。」按鈕「重新配音這句 · <價格>」 |
| 過期：成片 | 「剪輯改過了，要重新輸出。」按鈕「重新輸出」 |
| 過期：第 10 步成品 | 「成片換過了，這一版要重做。」按鈕「開啟<工具名>」 |
| 成片區標題 | 「成片 <N> 支」；每支「第 <N> 版」或「從第 <M> 版加浮水印」（依 `derivedFrom` 與工具名） |
| 怎麼做的 | 按鈕「怎麼做的」；對話框標題「這支成片是怎麼做的」；每列「第 <N> 步 <步驟名> · <工具名> · <時間>」 |
| 剪輯檔找不到 | 「找不到這一集的剪輯檔。」 |

## 7. 卡與卡、與 FC 的檔案歸屬

| 檔 | PJ.1 | PJ.2 | PJ.3 | PJ.4 | 撞到誰 |
|---|---|---|---|---|---|
| `shared/episode-spine.js`（新） | 建 | 改 | — | 改 | — |
| `shared/runtime.js` | 改 | 改 | — | — | — |
| `shared/jobs-view.js` | — | 改 | — | — | — |
| `scripts/app-entry.js`、`pages/projects.html`、`pages/tools.html` | 改 | — | — | — | — |
| `scripts/projects-0.js` | 改 | 改 | 改 | 改 | **RV.4**（等它 commit） |
| `scripts/tools-0.js` | 改 | 改 | — | — | **FC.2**（未提交，等它 commit） |
| `scripts/tools-editor.js` | 改 | 改 | 改 | 改 | — |
| `scripts/generator-results.js` | 改 | — | — | — | — |
| `scripts/tools-compositor.js`、`scripts/tools-3d.js` | 改（清單來源） | — | — | `tools-compositor.js` 改 | — |
| `scripts/tools-rig.js` | — | — | — | 改 | — |
| `backend/api.cjs` | — | — | 改（`/director/shots`） | — | **FC.3**（同檔不同段；FC.3 先 commit，PJ.3 後做） |
| `scripts/tools-boot.js`、`scripts/tools-engine-host.js`、`shared/project-envelope.js`、`backend/release-text.cjs` | 不碰 | 不碰 | 不碰 | 不碰 | FC.2／FC.3 專屬 |

順序：
- **PJ.1 → PJ.2 → PJ.3 → PJ.4 必須依序**：同一批檔、後一張用前一張的函式。
- PJ 與 FC.3 可以同時做（PJ.1、PJ.2 不碰 `api.cjs`）。
- PJ.3 等 FC.3 commit 後再動 `api.cjs`。
- PJ.1 的開工條件＝RV.4 與 FC.2 都已 commit。

## 8. 衝突與缺口

**C1 鏡頭只有「畫面描述」，沒有旁白**（`/director/shots` 只回 `text`、`seconds`，`backend/api.cjs:1179-1192`；鏡頭卡只有畫面描述，`projects-0.js:117`）。§6 答 1 第 7、8 步要「照腳本逐句配音」「用腳本對時間」，沒有台詞可用。
- 做法 A（建議）：鏡頭加 `line`，AI 分鏡一併產生，可手改。
- 做法 B：用「畫面描述」當旁白——念出來會是「清晨廚房，手倒熱水」這種畫面指示，不能用。
→ **Q1**。

**C2 專案頁的私有副本會蓋掉別頁的寫入**（F3）。規格已用 `keepSpine`＋`vw:changed` 簽章重讀處理（§0、PJ.1）；不需操作者決定。

**C3 鏡頭任務與生成頁任務的對應**：專案頁「帶入影片生成」（`projects-0.js:749-776`）把整集送到生成頁做**一支**影片，不對應任何鏡頭；照 §6 答 1 第 3 步，影片模型的成品應掛在鏡頭上。
- 做法 A：該按鈕保留原樣，不掛回（它產生的是整集草稿片，不是鏡頭）。
- 做法 B：改成「每個鏡頭各送一次影片生成」，付費、張數多。
→ 建議 A：本規格不動該按鈕。鏡頭影片由鏡頭卡上的生成（PJ.2 `shot.video`）處理。不用問，除非操作者反對。

**C4 FilmCraft 的成片不經 `generate()`**：FC.3 的 `POST /api/vw/engine/renders` 直接建任務，PJ.2 的單一入口抓不到它的 `link`。
- 補法：FC.3 落地後，外框在中繼資料多帶 `spineLink(input)` 的結果，路由存成 `input.link`。兩行、屬 FC.3 檔案，另開一行 TASKS，不放進 PJ。
- 另外：FilmCraft 的剪輯檔讀不到片段，不做片段層級的過期提示；只做成片層級（成片→剪輯檔 revision 不適用，FilmCraft 列沒有 revision → `current` 回 `null` → 不顯示過期）。

**C5 剪輯器「新增專案」對話框的比例是下拉選單**（`tools-editor.js:1163-1167`），違反「不用下拉」。不在 §6 範圍，不在 PJ 改；記為後續。

**C6 動畫合成、角色綁定、3D 的成品**不一定經任務（合成的 `cpRenderOutput` 走自己的渲染）。第 5 步的成品進這一集的方式＝「放到剪輯」選這一集（PJ.1 把清單換成集）。步驟列第 5 步因此只能顯示「選用」，不判「做好了」。不用問。

**要操作者決定的（只有一題）**：
- **Q1**：鏡頭卡要不要加一格「旁白」（AI 分鏡會一起寫，也可以自己改），讓配音和字幕照它做？建議要。
  - **已決定（操作者 2026-11-06）：要加。** 走 C1 做法 A：鏡頭加 `line`，AI 分鏡一併產生，可手改（PJ.3）。
