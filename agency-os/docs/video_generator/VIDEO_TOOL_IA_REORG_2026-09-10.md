# Video tool IA reorg — 2026-09-10

Context: `dbe28f317`(workbench-as-entry)→`a44fa61e2`(revert同日). 操作者糾正：架構規格不可直接套成導航取代，要插入既有流程。本檔=決策記錄，取代逐條散文。

## 決策（操作者全權授權，architect 判斷）

**D1 製作模式 = tab 選擇，不建第二層 UI**。`VideoStudio.tsx` STUDIO_TAB_GROUPS「製作」段（生成影片/Remotion模板/實拍剪輯）本身就是模式選擇器。原因：避免跟既有 tab 重複建 UI（planner 明示風險）。短劇 = 生成影片 tab + Bible 已附加，非獨立 tab（無獨立 renderer）。

**D2 Remotion 手動模板不寫入 `production_mode`**。DB CHECK 只收 `quick_video/short_drama/footage_edit`(3值，`migrations/0071_media_production_projects.sql:9`，已在 ks-aw-01 prod 驗證存在)。`CONTEXT.md:66-70` 本就定義 Manual Template Mode 與 Production Mode 分離。UI 純呈現，不改 CHECK 約束。

**D3 實拍剪輯無成本閘**。`FootageEditor.tsx` 全讀確認零付費 API（無 TTS/生圖），只有上傳+FFmpeg compile+render。不建假成本 UI。

**D4 Media Core project-context 本輪不接**。`media_production_projects` 表已 apply（prod 驗證，4 rows，疑似先前 smoke test 殘留非真實資料）、`api/video/projects/route.ts` 存在但零前端呼叫者。本輪維持零呼叫，不引入「project 實體」UI 概念——避免重複 2026-09-10 workbench-as-entry 的錯誤模式。留給未來一輪，若做，走背景 context 不當導覽入口。

**D5 Bible 不接 AI prompt injection**。`StoryBibleWorkbench` 只做「腳本前可及＋存取版本」，不把 bible 內容餵進 `ScriptForge.tsx:35-44` 的 `claude()` prompt。原因：這是獨立的 prompt 工程決策（塞多少 bible 內容、什麼格式），倉促做等於用猜的補規格。

**D6 ReleaseDeliveryPanel 的 `siteId`/`postId`/`clientId`/`videoUrl`/`platforms`/`videoUrls` 維持裸輸入**。無現成站點/客戶清單 API 可查（grep 未命中），建新 API 超出本輪「重分組+接線」範圍。`candidateAssetId` 的 asset picker（`ReleaseDeliveryPanel.tsx:22-60`）已是既有正確實作，未動。

## 已知阻擋（本輪發現，非本輪造成，未修）

`npx tsc --noEmit` 在**未改動**的既有檔案上有 14 個既有錯誤（改動前後一致，`git stash` 驗證過）：
- `api/video/footage/render/route.ts:7` 引用 `submitFootageRender`，`lib/content/video/render-client.ts` 根本沒這個 export → **FootageEditor「送實拍渲染」按鈕會打到編譯失敗的 route**
- `api/video/release/route.ts:3`、`api/video/story-bibles/[id]/approve/route.ts:2` 引用 `canApproveMediaRelease`，`lib/ops-role.ts` 沒這個 export → **ReleaseDeliveryPanel「建立 Release」、Bible 核准按鈕同樣會打到編譯失敗的 route**
- `api/video/timeline/submit/route.ts:71,93`、`lib/content/video/qa-persistence.ts:33-43` 型別不符

這些檔案本輪**接線**（讓使用者連得到 UI）但**沒有**在能力上變得可用——按鈕會出現、會送出請求、但後端會炸。已用 `spawn_task` 開獨立任務追蹤，不混進本輪 WORKLOG 當作「完成」。

## 改了什麼（file:line）

| 檔案 | 改動 |
|---|---|
| `.../tools/video/OrganizationPicker.tsx`（新檔） | 共用租戶選擇器，接 `api/video/workbench/bootstrap`，403/network 失敗降級成手動 UUID |
| `.../tools/video/ScriptForge.tsx` | `NAVS` 陣列插入 `story_bible`（`:112`，生成組第一項）+ import/render `<StoryBibleWorkbench/>` |
| `.../tools/video/StoryBibleWorkbench.tsx` | org 裸輸入→`OrganizationPicker`；`referenceAssetIds` 逗號輸入→已登錄素材勾選 picker（`/api/video/assets`）；補 `role`/`rightsNote` 欄位（型別本來就有，UI 原本沒渲染） |
| `.../tools/video/VideoStudio.tsx` | `studioTab` 5→7 個值，3 段分組 `STUDIO_TAB_GROUPS`；新增 footage/release/operations tab；「Timeline 驗證」降級到審片與交付段尾、標「（進階）」；「說明&成本」移出 tab→`infoOpen` 彈窗（原內容零改動，只換容器） |
| `.../tools/video/ReleaseDeliveryPanel.tsx`、`FootageEditor.tsx`、`MediaOperationsPanel.tsx` | org 裸輸入→`OrganizationPicker`，其餘邏輯零改動 |
| `.claude/launch.json` | 新增 `next-admin-verify`（port 3901，避開別的 session 已在跑的 3000） |

## 驗證（第一輪：tab 重分組）

`npx tsc --noEmit`：改動檔案 0 error（既有 14 個 error 改動前後一致，見上）。`npx next build` webpack 階段對本輪檔案零警告，在既有壞掉的 route 上失敗（見上）。瀏覽器 E2E：next-admin 需操作者自己的 Supabase session，agent 不代填密碼——REALTEST_WAIVED。

---

## 第二輪重做（同日）：真正的 10 步驟 pipeline

**觸發**：操作者看過第一輪後明確拒絕——「你根本亂做一通」。指出第一輪仍是可任意跳點的 tab 導覽，不是她畫的 A→B→C→…→L 依序推進、上一步做完才能進下一步的流程；且完全漏掉 Whisper 字幕這個步驟。

**根本錯誤**：第一輪把「重排導覽」誤當成「做出流程」。Tab bar（不管分幾組）本質是平行選單，不是 gate 過的 pipeline。

**新架構**：`VideoPipeline.tsx`（新檔，取代 `VideoTabs.tsx` 當 `/tools/video` 預設入口；`VideoTabs.tsx` 保留在 `?advanced=1`，未刪除任何既有路徑）。`currentStep` 1–9 真正 gate（`goto()` 只能前進到 `maxReached`，做完才解鎖下一步），對應操作者原始 10 項（見下表）。

| 操作者步驟 | Pipeline 節點 | 內容 |
|---|---|---|
| ①生成腳本 | Step 1 | `ScriptForge`（含短劇 Story Bible 入口），既有元件零改動，`onSendToProduction`/`onSendToRemotion` callback 接手 advance |
| ②選擇製作模式 | Step 2 | 新 `ModeSelectStep.tsx`：4 張卡（快速影片/Remotion/短劇/實拍剪輯） |
| ③費用預覽與確認 | Step 3 | 新 `CostGateStep.tsx`：`computeVideoCost` 預設組成粗估 + 確認才能繼續；footage_edit 標 $0；remotion 誠實標「無自動試算」 |
| ④生成或選取素材 + ⑥渲染 | Step 4（UI 上標「④⑥」） | **誠實揭露的合併**：三個引擎（Quick Engine ffmpeg／RemotionStudio／FootageEditor）現有 render pipeline 本身就是同一顆按鈕做生成+渲染，沒有可插入的中間閘——拆開需要重寫這三條 render pipeline，非本輪 UI 重排能做。VideoStudio 新增 `embedded` prop（`lockTab`+`onRenderComplete`，見下）讓 wizard 嵌入時鎖單一 tab、隱藏自己的 tab bar |
| ⑤Timeline 背景驗證 | Step 5 | 新 `TimelineGateStep.tsx`：footage_edit 真跑 `validateTimelineDraft`（對剛編譯的 timeline）；其餘引擎誠實標「不產生正式 Timeline 物件，自動放行」，不假裝驗證不存在的東西 |
| ⑦配音與 Whisper 字幕 | Step 6（UI 上標「⑦」） | 新 `CaptionsStep.tsx`——**第一輪完全漏掉的步驟**。配音已在④烤進影片；這步用既有但從未接通的 `/api/video/transcription/dispatch`（送 GPU worker 真跑 Whisper）補了一個新 GET `app/api/video/transcription/status/route.ts`（dispatch+內部 callback 都已存在，就是沒有讀取路徑能讓前端知道結果——這是接通既有斷鏈，非新業務邏輯），輪詢到完成給 SRT/VTT 連結，可略過 |
| ⑧技術+編輯 QA | Step 7（UI 上標「⑧」） | 新 `QaStep.tsx`：把原本埋在 `ReleaseDeliveryPanel` 表單裡的唯讀 QA 證據 `<pre>` 拉出來當獨立可見步驟；不重複硬擋（Release 步驟自己在 API 層已經擋） |
| ⑨Release 交付 | Step 8（UI 上標「⑨」） | `ReleaseDeliveryPanel`（既有元件）+ 新增 `initialOrganizationId`/`initialCandidateAssetId`/`onReleaseCreated` 選用 props 串接 wizard context |
| ⑩營運成效+歷史/成本 | Step 9（UI 上標「⑩」） | `MediaOperationsPanel`（既有）+「開始新影片」reset |

**VideoStudio.tsx 新增 `embedded?: {lockTab, onRenderComplete}` prop**：未傳時（`VideoTabs.tsx` 既有 standalone 用法）行為零改變——`lockTab`/`onRenderComplete` 相關三個新 `useEffect` 全部在 `embedded` 為 `undefined` 時不生效；tab bar chrome 只在 `!embedded` 時渲染。`onRenderComplete` 在 `genStatus==="done"` 時觸發；`VideoPipeline.tsx` 用 `quickRenderDone` 旗標防重複前進（`embedded` 物件每次父層重渲染都是新 literal，effect deps 因此每次重渲染都會重新比對觸發——追蹤過此路徑：因為 `goto(5)` 會讓這個 `VideoStudio` 實例整個從樹上移除（`{step===4 && ...}` 變 false），沒有無限迴圈或重複前進風險）。

**FootageEditor.tsx**：新增 `initialOrganizationId`／`onRenderComplete(jobId)` 選用 props；`onRenderComplete` 在 `renderTimeline()` 成功拿到 `jobId` 時觸發。此檔同時被另一個背景 session（task_618a39ed）修復既有壞掉的 `/api/video/footage/render` route，改動時重讀過確認未衝突。

**已知、揭露、非本輪範圍的限制**：
- ④⑥ 合併成一個節點（見上表），不是假裝拆開
- Timeline 驗證只對 footage_edit 是真的（見上表）
- Whisper 字幕、QA 步驟各自獨立呼叫 `/api/video/assets` 拉素材清單，跟 `ReleaseDeliveryPanel` 既有邏輯重複一份——時間壓力下接受的重複，非缺陷
- 第一輪 D1–D6 六項決策維持不變（見上）

## 驗證（第二輪）

`npx tsc --noEmit`：全部新/改檔案 0 error（14 個既有錯誤不變，`task_618a39ed` 尚在修，非本輪範圍）。Critic review：一輪因 API rate limit 中途截斷（`session limit resets 10:50pm`），已回報的部分確認 prop 型別吻合；中斷後改由本 session 自行針對 critic 原本要查的 6 個具體風險點覆核，其中 1 個是真的（`CaptionsStep.tsx` 的 `poll()` 卸載後仍可能排出下一顆 timeout，未受 `pollRef` cleanup 保護）並已修（改用 `unmountedRef` 讓 `poll()` 每個非同步分支卸載後直接跳過）；其餘 5 個（`embedded` 物件每次重渲染觸發 effect 是否導致重複前進、`ReleaseDeliveryPanel` 新 effect 的 stale closure 風險、`TimelineGateStep` 的 Strict Mode 重跑防護、transcription/status route 的 org-access 檢查順序、prop 型別是否吻合）逐一追蹤程式碼確認非缺陷（設計上已有对应防護或條件本來就不成立），詳見本次 commit diff。瀏覽器 E2E 嘗試：本機免登入 dev instance（環境變數清空觸發既有 `isDevelopment()` bypass）在 Next dev hot-reload 下不穩定（middleware 重編譯後有時恢復要求登入，log 證實 `GET /tools/video 200` 與 `GET /login` 交錯出現於同一 server process）——REALTEST_WAIVED，用 tsc 全專案型別檢查 + 逐檔程式碼覆核取代。
