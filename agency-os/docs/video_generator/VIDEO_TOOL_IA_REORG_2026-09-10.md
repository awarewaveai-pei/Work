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

## 驗證

`npx tsc --noEmit`：改動檔案 0 error（既有 14 個 error 改動前後一致，見上）。`npx next build` 進行中，見 WORKLOG。瀏覽器 E2E：next-admin 需操作者自己的 Supabase session，agent 不代填密碼——REALTEST_WAIVED，理由見 WORKLOG。
