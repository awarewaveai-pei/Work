# 第 8 項附卡：video / design / content 三扇門審查（唯讀稽核 → 逐門任務）

日期 2026-10-23　審查者 Sonnet 5.5（唯讀）　**正本** ADR 018 §2「開門規則」1–3；`step-8.md`。
`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`；`TOOLS` = `NA/app/(shell)/tools`。

## 0. 方法與限制（先讀）
- 用鏡像腳本（複製 `NA/lib/portal/__tests__/registry-code.test.ts:20-139` 的 `scan`/`importClosure`/`doorApis` 邏輯）算：各門頁面 import 閉包 → 呼叫的 `/api/...` → 是否在 `doorApis()`；各 route 的 authorizer／service-role／feature ask。**沒跑 vitest**（三門尚無 `app/<page>/page.tsx`，`builtDoors()` 還不含它們，`registry-code.test.ts:105`）。「蓋好頁面後哪些閘會紅」是鏡像預測，開工第一步先蓋空殼頁跑 `npx vitest run lib/portal` 對帳。
- 工作樹有他人未提交改動：`app/ProductDoorShell.tsx`、`app/DoorContext.tsx`（新）、`lib/portal/__tests__/registry-code.test.ts`、`lib/entitlements/grant.ts`、`TOOLS/video/VideoStudio.tsx`、`TOOLS/tarot/{cards.ts,TarotStudio.tsx}`、`app/api/content/{generate,trending}`、`app/api/video/{draft,generate,regenerate-image,render-draft,story-bibles/generate-portrait}`、`app/api/tools/publish`。本卡讀的是工作樹現況；動這些檔前先 `git status`/`git diff` 看是否已提交。
- 客戶身分在 `resolveOpsRole` 固定為 `operator`（`NA/lib/ops-role.ts:11,50`）：`canCreateAiImageJob`=true（`:76`）、`canWriteTenantConfig`=false（`:72`）、`canApproveMediaRelease`=false（`:81`，owner/admin 才行）。客戶被 middleware 限在該門路徑（`NA/middleware.ts:190`、`:356`）。

## 1. 結論一頁
| 門 | 員工頁 | 多頁 | 頁面呼叫的 API 不在 `doorApis` | 路由資料界（規則 2）有洞 | 阻擋度 |
|---|---|---|---|---|---|
| video | `tools/video`（1 頁，`?advanced=1` 切換） | 否（不需 nav） | **0 條**（全 OK） | 本身乾淨；**但 dependsOn content → 門同時開整個 `/api/content/*` 與 `/api/tools/studio/*`**，content 有 4 個無授權路由＋2 個跨租戶寫入洞（§5） | 先修 content 路由才能開 |
| design | 5 頁：canvas、designs、mockup、banner、vector-editor | **是（需 `door.nav`，目前不存在）** | 3 條：`/api/ops/clients`、`/api/tools/printful/catalog`、`/api/tools/script-forge` | **`/api/tools/presets` 全無租戶檢查（任何客戶可讀／寫／刪任何組織的 preset）**；vector-editor 被 nginx 404 | 中高 |
| content | `tools/content`＋`calendar`＋`sites`（`tools/publish`、`tools/events` 也掛在 content 名下） | **是** | 5 條：`/api/video/{generate,status,embed-to-wp}`、`/api/tools/publish`、`/api/tools/events/sync` | `sites/[id]` PATCH/DELETE/test 無組織檢查（可改他人 WP 站網址＋憑證）；`sources` 全域可刪；`newsletter` 寫進我們自己的 FluentCRM；brand-voice SSRF | 高 |

**建議順序（與 step-8「開門順序」不同之處）**：content 路由加固（C-R 系列）→ 共用前置 P1/P2 → video 門 → design 門 → content 門。理由：video 門的 `doorApis()` 經 `dependsOn:["content"]` 含全部 `/api/content/*`（`NA/lib/portal/doors.ts:67-80`、`NA/lib/portal/products.ts:50`），content 的洞在 video 開門時就暴露，不是等 content 開門。

## 2. 共用前置（三門都要，先做一次）

### S1 系統性發現：「門上隱藏按鈕」過不了閘 3
- 閘 3 `registry-code.test.ts:203-210` 掃的是門頁面的**靜態 import 閉包**裡所有 `fetch("/api/...")` 字面量，不管 runtime 有沒有渲染該按鈕。`optional` 產品的 API 呼叫只要還在被門頁 import 到的檔案裡，就紅。
- 受影響的呼叫（全部是靜態字面量）：content→`/api/video/*`（`TOOLS/content/ContentStudio.tsx:1743,1770,1793`）、design→`/api/tools/script-forge`（`TOOLS/banner/BannerStudio.tsx:1096,1292`）、`/api/ops/clients`（`BannerStudio.tsx:1127`）、`/api/tools/printful/catalog`（`TOOLS/mockup/MockupStudio.tsx:328`）、events→`/api/tools/events/sync`（`TOOLS/events/page.tsx:100`）、publish→`/api/tools/publish`（`TOOLS/publish/PublishWizard.tsx:206`）。
- 做法（一個類別一個解，不逐條補丁）：共用元件不寫這些呼叫；改由**員工頁（`app/(shell)/tools/<x>/page.tsx`）以 props／render slot 注入**一個只有員工頁 import 的模組（例 `ContentStudioVideoExtras`）。門頁不 import 它 → 靜態閉包乾淨。`useOnDoor()`（`NA/app/DoorContext.tsx:12`）只負責隱藏連結，不負責過閘。
- 驗收：蓋門頁後 `npx vitest run lib/portal -t "a built door can reach every API its pages call"` 綠。風險 M（改共用元件，員工畫面不得變）。
- **✅ 完成 `e28406990`**（WORKLOG 2026-10-24 續14）：注入點是 `ContentStudio({video})`、`BannerStudio({staff})`、`MockupStudio({loadCatalog})`、`EventsCalendar({sync})`；員工端由 `*Staff.tsx` 與 `tools/events/page.tsx` 提供。publish 照 D1 不拆（改歸 studio、沒有門頁 import）。閘 3 閉包掃描：從共用元件出發 0 條門到不了的呼叫。

### P1 `door.nav` 目前不存在（design、content 必要）
- 證據：`ProductDoor` 型別只有 `page/api/anonymous/enabled`（`NA/lib/portal/products.ts:7`）；`NA/app/ProductDoorShell.tsx:6-14` 只渲染 children＋登出；`grep "door.nav|nav?:"` 於 `lib/portal`、`app/ProductDoorShell.tsx`、`app/DoorContext.tsx` 無命中。ADR 018 §2 規則 3 寫了但沒做。
- 任務：①`ProductDoor` 加 `nav?: readonly { path: string; name: string }[]`；②`ProductDoorShell` 讀登記表渲染導覽（Shell 是 server component，要知道目前產品——由 `layout.tsx` 傳 `productKey`）；③`products.test.ts` 加：每個 `nav.path` 對應 `app/<page>/<path>/page.tsx` 存在；員工頁路徑不得等於任何門頁路徑（規則 3 後半，`products.test.ts:125-133` 現只檢 staffPaths 單一擁有者）。④跟他人改 `ProductDoorShell.tsx`（工作樹已改）協調，先看 diff。風險 M。
- 共用元件內的站內連結要能在兩門通用：員工 `/tools/content/calendar` vs 門 `/calendar`（middleware 會改寫成 `/content/calendar`，`doors.ts:97-101`）。需要一個小 helper（建議 `useDoorHref(sub)`，放 `DoorContext.tsx`），否則每個連結要寫 `onDoor ? ... : ...`。連結清單見各門。
- **✅ 完成 `e28406990`**：nav 項目是 `{ path, name, staff }`。多一個 `staff`（對應的員工頁）是因為 `useDoorHref(staffHref)` 收員工連結：員工頁照原樣回傳，門上回傳 nav 登記的頁，沒有登記就回 null（把連結藏起來）。`ProductDoorShell` 收 `productKey`，用 `app/DoorNav.tsx` 渲染。測試在 `products.test.ts`。各門蓋頁時在 `products.ts` 加 `nav`，連結改走 `useDoorHref`。

### P2 閘 5 的假陽性類別（影響 design 與 content 的判定）
- `authorizes()`（`registry-code.test.ts:240-241`）用 import 閉包找 `tenant-guard`，route **匯入但沒用**也算過。實例：`NA/app/api/tools/presets/route.ts` 本身不 import `tenant-guard`；閘看到的路徑是 presets → `lib/content/r2-delete-guard.ts` → `lib/content/wp-sites.ts` → `lib/tenant-guard.ts`（鏡像腳本 `why2` 追出）。另一類：只經 `lib/entitlements/grant.ts → subject.ts → tenant-guard.ts` 到達（`content/{brand-voice,generate,hook-brief,humanize,image,keywords,market-analysis,outline,seo-fix,syndicate,title,trending,sources}`、`tools/script-forge`、`video/story-bibles/visual-consistency-check`）：它們只有「誰付費」，沒有「讀誰的資料」；其中多數不讀組織資料（純 AI 運算）可接受，但 `content/sources` 讀寫共用表（見 C-R3）不可接受。
- 任務（關一整類）：閘 5 對「讀 DB 的 route」要求 **route 自己直接 import** authorizer，或列 `ORG_FREE_ROUTES`＋理由；閉包只在「不讀 DB」時放行。最小改法：把 `lib/content/*`、`lib/entitlements/*` 也列進 `STOP_AT`（`registry-code.test.ts:229`，跟 `ops-role` 同理由：這些檔 import `tenant-guard` 是為了別的用途）。改後 presets 會變紅 → 正好逼出 D-R1。風險 L（只收緊測試）。**先做 D-R1 再收緊閘，避免主線紅。**

## 3. VIDEO 門

### 3.1 員工頁與元件
- 頁：`TOOLS/video/page.tsx:9-20`（server component，讀 `searchParams.advanced`；預設 `VideoPipeline`，`?advanced=1` 為 `VideoTabs`）。單頁，不需 `door.nav`。
- 元件閉包 25 檔：`TOOLS/video/*.tsx`（`VideoPipeline`、`VideoTabs`、`VideoStudio`、`ScriptForge`、`StoryBibleWorkbench`、`FootageEditor`、`CaptionsStep`、`QaStep`、`ReleaseDeliveryPanel`、`MediaOperationsPanel`、`OrganizationPicker`、…）＋`lib/ai/*`、`lib/content/video/{timeline-draft-validation,video-cost}.ts`、`lib/entitlements/use-paid-features.ts`、`TOOLS/tarot/{cards.ts,tarotStyles.ts}`（`VideoStudio.tsx:8-9` 直接 import 塔羅常數；塔羅檔正被他人修改）。
- 閉包內無任何檔 import `lib/supabase-server`／`ops-role`／`tenant-guard`（鏡像 `pagesvc`）→ 閘 4 預期綠。

### 3.2 頁面呼叫的 API vs `doorApis(video)`
`doorApis(video)` = `/api/video`＋`/api/tools/script-forge`（`products.ts:47`）＋ content（`products.ts:50`）`/api/content` ＋ studio（content.dependsOn，`products.ts:67`）`/api/tools/studio` ＋ PLATFORM（`doors.ts:63`）。
- 全部 OK（鏡像）：`/api/video/*` 25 個端點（`VideoStudio.tsx:317,330,348,380,422,493,522,570,603,635,1952,1974,1997`、`ScriptForge.tsx:118,140,774,784`、`StoryBibleWorkbench.tsx:34,43-49`、`FootageEditor.tsx:45,69,81`、`CaptionsStep.tsx:35,45,60`、`QaStep.tsx:28,44,50`、`ReleaseDeliveryPanel.tsx:32,58,64,83,90,95`、`MediaOperationsPanel.tsx:16-17`、`OrganizationPicker.tsx:38`、`lib/content/video/timeline-draft-validation.ts:23`）；`/api/tools/script-forge`（`ScriptForge.tsx:44`）；`/api/content/sites`（`ScriptForge.tsx:1046`）、`/api/content/social-publish`（`ReleaseDeliveryPanel.tsx:90`）；`/api/entitlements/features`（`lib/entitlements/use-paid-features.ts:12`）。
- OUT：無。

### 3.3 每個可達 route 的授權（`NA/app/api/video/**/route.ts`；`assertOrgAccess`／`effectiveOrgId` = `lib/tenant-guard`）
- 直接 `assertOrgAccess`／`effectiveOrgId`（客戶被強綁自己的組織，`tenant-guard.ts:99-123,183-215`）且資料查詢帶 `.eq("organization_id", …)` 或先讀列再 assert：`assets:15-21`、`billing:16,29-33`、`credits/reserve:18`、`footage/render:29,65-67`、`history:53-66`、`outcomes:18-26`、`projects:19-22,48-51`、`qa/editorial-rights:33-46,65`、`qa/reports:17-23`、`reference-assets:11-13`、`release:21`、`release/preflight:17`、`story-bibles:19-23,42-53`、`story-bibles/[id]/approve:11-14`、`transcription/{dispatch:37,import:187,status:35}`、`upload-asset:127`、`workbench/bootstrap:13-15`（客戶只看到自己的組織）、`[id]:28-42,60`（先讀列再 assert 再刪）、`timeline/validate:35`、`timeline/{compile,submit}`（經 `lib/content/video/timeline-remotion-request.ts:60,69-71` assert＋org 過濾）、`remotion-job-status:24`、`status:84`。
- 讀 DB 用 service-role（`getSupabaseWriteClient`）：上列大多數——規則 2 只禁「門頁」直接用，route 用可以，前提是上面的 org 過濾；本表逐條讀過，**未發現缺過濾**。
- 付費路由有 `withFeature`（工作樹現況，部分是他人未提交改動）：`tools/script-forge:33`（video.script）、`video/draft:133`（video.image／video.script，`org:()=>orgId`）、`video/generate:177`（video.script）、`video/regenerate-image:96`（video.image）、`video/render-draft:210`（video.tts，僅 `ttsProvider==="openai"`）、`video/story-bibles/generate-portrait:97`（video.image）、`video/story-bibles/visual-consistency-check:27`（video.image）。不付費免列：`remotion-render`（自家 renderer，`registry-code.test.ts:280`）、`footage/render`（`:282`）、`status`／`remotion-job-status`（`:279,281`）、`[id]`、`cleanup`（`:277-278`）。
- 無授權、閘 5 預測紅（鏡像 `closureAuth=-`）：`capabilities`（`route.ts:11-54`，只代理我們 video-service 的 `/health`，不含組織資料）、`qa/report`（`route.ts:2-5`，410 stub）、`remotion-status`（`route.ts:11-13`，410 stub）。
- 不是組織授權、是共享密鑰：`cleanup`（`route.ts:19-25` 比對 `x-ops-sync-key`＝`OPS_PROXY_SHARED_SECRET`）——客戶沒有密鑰，打不通；但它在 `/api/video` 前綴下就會被門接住、被閘 5 以閉包誤判為「有授權」。repo 內無 cron 呼叫者（`grep api/video/cleanup` 只命中它自己與測試檔）。
- 客戶**不能**用的步驟（功能缺口，非洩漏）：`release`（`route.ts:14` 要 `canApproveMediaRelease`＝owner/admin）、`story-bibles/[id]/approve`（`:8` 同）、`billing` POST（`:42` 要 `canWriteTenantConfig`）。→ 影片管線的「Release」步驟與 Story Bible 核准，客戶在門上會 403（見決策 D3）。

### 3.4 資料可見度／員工專屬（規則 2）
- 客戶只讀自己的組織資料；`workbench/bootstrap` 對客戶只回自己的組織（`route.ts:15`）。`OrganizationPicker`（`TOOLS/video/OrganizationPicker.tsx:38`）在客戶身分只會有一項。
- 員工專屬／不該在門上出現：`MediaOperationsPanel`（`:16` 讀 `/api/video/billing`，含 provider profiles、credit 上限；客戶 POST 會 403，GET 可讀自己組織）——建議門上唯讀顯示或隱藏；`VideoPipeline.tsx:102` 的 `<a href="/tools/video?advanced=1">` 在門上會被改寫成 `/video/tools/video` → 404。
- 沒有 `ops.*` 後台功能在 video／content／design 的 route 閉包裡（鏡像 `asksops` 無命中）→ 沒有 studio 那種 `ops.cheap-json` 阻擋項。

### 3.5 任務清單（依序）
| # | 任務 | file:line | 風險 |
|---|---|---|---|
| V0 | **✅ `7d8d618a4`、`21e7da50b`** 先完成 content 路由加固 C-R1…C-R6（video 門連帶開放 content） | 見 §5.5 | H |
| V1 | **✅ `2dd183f44`** `app/video/{layout,page}.tsx`：照 `NA/app/studio/{layout,page}.tsx` 做；page 要把 `searchParams` 傳下去（員工頁是 server component，`TOOLS/video/page.tsx:9-12`），不加 topbar | 新檔 | L |
| V2 | **✅ `2dd183f44`**（改相對連結 `?advanced=1`，兩邊都對，不需 helper） 修門上連結：`VideoPipeline.tsx:102` `/tools/video?advanced=1` → 門上用 `?advanced=1`（P1 helper 或 `useOnDoor`） | `TOOLS/video/VideoPipeline.tsx:102` | L |
| V3 | **✅ 不需改**（只讀；`/api/video/billing` GET 先 `assertOrgAccess`，客戶只見本組織） 門上隱藏／唯讀 `MediaOperationsPanel` 的 billing 區（客戶沒有寫權限） | `TOOLS/video/MediaOperationsPanel.tsx:16-17` | L |
| V4 | **✅ `2dd183f44`**（`capabilities` 列 `ORG_FREE_ROUTES`、錯誤不回原始例外；兩個 410 殘骸刪除） `capabilities` 補 `ORG_FREE_ROUTES` 條目（含理由）；`qa/report`、`remotion-status` 410 stub 無人呼叫（只被 `qa/report/route.test.ts` 引用）可直接刪，連測試檔。**不要**只補理由而不看呼叫者 | `registry-code.test.ts:234-238`；`app/api/video/{capabilities,qa/report,remotion-status}/route.ts` | L |
| V5 | **✅ `2dd183f44`**（搬 `/api/internal/video/cleanup`；Codex F2 R2／DB 刪除順序既有、無呼叫者，列剩餘） `cleanup`：路由是 cron 專用，搬到 `/api/internal/video/cleanup`（matcher 不經過門，`middleware.ts:413` matcher 排除 `api/internal`）或加 `userKind==="client"` 403；同步 cron 呼叫端（目前無） | `app/api/video/cleanup/route.ts:19-25` | M |
| V6 | **✅ `2dd183f44`**（`canApproveMedia`；兩路由仍 `assertOrgAccess`，突變證據見 WORKLOG 2026-10-24 續27） 決策 D3（客戶可否核准 release／story bible）→ 若是，改 `canApproveMediaRelease` 為「客戶限本組織」或新增 `canApproveOwnMedia`；若否，門上隱藏 Release 步驟並寫入 manifest | `app/api/video/release/route.ts:14`；`lib/ops-role.ts:81`；`TOOLS/video/ReleaseDeliveryPanel.tsx:83` | M |
| V7 | **✅ 2026-10-24 左邊選單**（操作者定：左邊選單、持有的正常、沒持有的灰、工具區不動；五扇門共用 `app/DoorNav.tsx`；manifest 無 TODO） 登記表 `features[]` 渲染功能清單（step-8 第 3 點）、`lib/video/MODULE_MANIFEST.json` 無 TODO | `NA/lib/video/MODULE_MANIFEST.json` | L |
| V8 | **✅ `2dd183f44`**（本機 `/video` 門框、無側欄；門閘綠） 驗收：`npx vitest run lib/portal lib/video`、`npx tsc --noEmit -p .`；`Host: video.localhost` 開 `/` 看精簡版面；突變：改名 `app/video/page.tsx` → `products.test.ts` 紅 | step-8 Acceptance | L |
| V9 | **✅ 2026-10-24 上線**（DNS、憑證 15 SAN、主機 nginx、lobster-nginx、enabled；門只讓持有 video 的帳戶進，WORKLOG 當日 video／design 上線條） `enabled:false` 維持到 go-live（DNS、憑證 SAN、nginx 區塊 `nginx/default.conf:430` 加 `video.aware-wave.com`）——High，等操作者 go | `NA/lib/portal/products.ts:47` | H |

## 4. DESIGN 門

### 4.1 員工頁與元件
- 5 頁（`products.ts:63` `staffPaths`）：`TOOLS/canvas/page.tsx`（client，`next/dynamic` 載 `CanvasEditor`，`ssr:false`，`:10-18`）、`TOOLS/designs/page.tsx`（`DesignsGallery`）、`TOOLS/mockup/page.tsx`（`MockupStudio`）、`TOOLS/banner/page.tsx`（`BannerStudio`）、`TOOLS/vector-editor/page.tsx`（`<iframe src="/vector-editor.html">`，`:14`）。→ **多頁，必須 `door.nav`（P1）**，建議 nav：我的設計／畫布／橫幅／模型圖（向量編輯暫不放，見 D-V）。
- 各頁自帶 `.topbar`（員工殼元素，如 `designs/page.tsx:8-10`）；門頁不複製 topbar，只渲染元件（照 `app/studio/page.tsx`）。
- 畫布交接：`components/tools/canvas-handoff.ts:119` 寫死 `window.location.assign("/tools/canvas")`；呼叫者含 `DesignsGallery.tsx:1291`、`BannerStudio.tsx:1353`、`components/tools/OutputTrackBar.tsx:175`。門上這會 404 → 必須改成 door-aware（P1 helper）。
- 登記表依賴：`dependsOn:["studio"]`、`optional:["video"]`（`products.ts:63`）。

### 4.2 頁面呼叫 vs `doorApis(design)`
`doorApis(design)` = `/api/tools/presets` ＋ studio `/api/tools/studio` ＋ PLATFORM。
- OK：`/api/tools/designs`（`MockupStudio.tsx:320,540,556`、`DesignsGallery.tsx:333,395,461,576,650,744,785`、`CanvasEditor.tsx:1571`、`BannerStudio.tsx:1320`）、`/api/tools/presets`（`MockupStudio.tsx:335,571,598,627`）、`/api/tools/studio/{generate,genfill,mockup,remove-bg}`（`MockupStudio.tsx:437,484`、`BannerStudio.tsx:1219,1258`、`CanvasEditor.tsx:1251`）、`/api/entitlements/features`。
- **OUT（門上 404；且閘 3 會紅）**：
  - `/api/ops/clients`（`BannerStudio.tsx:1127`）：員工客戶清單，取品牌色；客戶不該看全客戶表。門上改成「取本組織品牌色」→ 需要新的依組織授權路由，或門上無品牌色（D-V2）。連結 `BannerStudio.tsx:1392` `href="/ops/clients"` 同隱藏。
  - `/api/tools/printful/catalog`（`MockupStudio.tsx:328`，route `app/api/tools/printful/catalog/route.ts:6-13`：公開 Printful 型錄、無組織資料、無授權）。處置：歸 studio（mockup 本在 studio 範疇，且 `/api/tools/studio/mockup` 已在 `ORG_FREE_ROUTES`，`registry-code.test.ts:237`）。選項 A：加進 `PLATFORM_APIS`（`doors.ts:63`）並加 `ORG_FREE_ROUTES`＋理由「公開型錄、快取 1h、無組織欄」；選項 B：搬到 `/api/tools/studio/printful-catalog`（違反「不改 API 前綴」）。建議 A。
  - `/api/tools/script-forge`（`BannerStudio.tsx:1096` 配色 AI、`:1292` 文案 AI）：屬 video（`products.ts:47`）且按 `video.script` 計費。design 只 `optional:["video"]` → 不開。S1：這兩處呼叫要從 `BannerStudio` 抽到員工頁注入的模組；門上這兩顆 AI 按鈕隱藏。若認為橫幅 AI 文案是門的核心功能 → D-V3（改成 studio 的 route，另列計費鍵）。

### 4.3 可達 route 授權
- `NA/app/api/tools/presets/route.ts`（**H**）：
  - GET `:44-71`：`organizationId` 取自 query（`:51`）、`resolveOpsRole(request)` 的回傳被丟掉（`:48`），**沒有 `assertOrgAccess`／`effectiveOrgId`**，直接 `.eq("organization_id", organizationId)` 用 service-role 讀（`:65-67`）。客戶可列任何組織的 mockup preset（含 `object_url`）。
  - POST `:85-` ：org 取自 body（`:136`），未驗；上傳 R2＋寫 `media_assets`（`:169-171`）→ 客戶可寫進別人的組織。
  - DELETE `:217-`：org 取自 query（`:239`），未驗；`.eq("id").eq("organization_id", deleteOrgId)`（`:248-252`）→ 只要知道目標組織 UUID 與 asset id 即可刪他人 preset。
  - 閘 5 為何放行：見 P2（閉包經 `r2-delete-guard → wp-sites → tenant-guard`）。
  - 員工側無害（員工本就跨租戶），所以從沒被發現。
- `app/api/tools/designs/route.ts`：乾淨——POST `effectiveOrgId`（`:180`）、DELETE `assertOrgAccess`（`:339`）＋客戶只能刪自己建立的（`:342-345` `created_by`）、GET `effectiveOrgId`（`:406`）。
- `app/api/tools/studio/*`：已被 studio 門審過（`studio` 已建門）；design 門共用，本卡不重審。注意 `studio/{generate,genfill,remove-bg}` 等授權只經 `grant.ts`（P2 清單），不讀組織資料，僅計費。
- `app/api/entitlements/features/route.ts`、`tools/events/upcoming`：PLATFORM，已有測試（`registry-code.test.ts:296-302`）。

### 4.4 資料可見度／員工專屬
- 客戶可見他人資料：僅 presets（上節）。My Designs 已限組織＋本人刪（designs route）。
- 員工專屬應隱藏：`BannerStudio.tsx:1127,1392`（客戶清單／`/ops/clients` 連結）、`BannerStudio.tsx:2132` `href="/tools/designs"`（門上要改成門的 `/designs`，P1）、`CanvasEditor.tsx:22`、`BannerStudio.tsx:4` import `roleHeader`（送 `x-ops-simulated-role: operator`；客戶身分 `resolveOpsRole` 先判 client 直接回 operator，`ops-role.ts:50`，無害，可留）。
- `public/vector-editor.html` 呼叫 `/api/tools/studio/remove-bg`（`:1157`）屬可達。**但**：`nginx/default.conf:452` 在所有門主機 `return 404` 給 `vector-editor.html`，middleware matcher 也跳過它（`NA/middleware.ts:413`）→ 門上 iframe 載不到。D-V：首版 nav 不放向量編輯；日後選 (a) 在 design 門的 nginx 區塊放行該檔並把它列入 `DOOR_NEEDS`（`lib/__tests__/middleware-portal-guards.test.ts:163`；High，要 go）或 (b) 以需登入的 app route 回傳該 HTML。

### 4.5 任務清單（依序）
| # | 任務 | file:line | 風險 |
|---|---|---|---|
| D-R1 | **✅ `21e7da50b`**（另：客戶只刪自己建的 preset，`created_by`） **presets 全面補租戶檢查**：GET `effectiveOrgId(request, url.searchParams.get("organizationId") ?? default)`；POST 用 `effectiveOrgId(request, body.organizationId ?? default)`；DELETE 先 `effectiveOrgId` 再 `.eq("organization_id", …)`（客戶限本人 `created_by`，抄 `tools/designs/route.ts:342-345`）。一個守衛一個測試：客戶帶他人 org → 403（拿掉檢查 → 測試紅 → 還原綠） | `app/api/tools/presets/route.ts:48-51,136,239` | **H** |
| D-R2 | **✅ `21e7da50b`**：讀 DB 的路由須自己 import **並呼叫**登記的授權函式（`AUTHORIZERS`），否則列 `ORG_FREE_ROUTES`；「讀 DB」= 閉包內任何資料庫驅動 import 收緊閘 5（P2）使 presets 類假陽性無法再過 | `registry-code.test.ts:228-241` | L |
| D1 | **✅ `e28406990`、`dc5ad2405`**（`openInCanvas` 第三參數必填，五個呼叫者走 `useDoorHref`；順帶修已上線 tarot 門的 404 按鈕） 前置 P1（`door.nav`）、S1（隱藏呼叫的注入模式）、`canvas-handoff` door-aware（P1 helper） | `components/tools/canvas-handoff.ts:119`；`ProductDoorShell.tsx` | M |
| D2 | **✅ `dc5ad2405`** `app/design/{layout,page}.tsx`＋子頁 `app/design/{designs,canvas,banner,mockup}/page.tsx`（共用元件；canvas 頁照 `TOOLS/canvas/page.tsx` 的 dynamic 寫法）；`products.ts:59` 加 `nav`；員工路徑 `tools/*` 與門頁 `app/design/*` 不同名 | 新檔 | M |
| D3 | **✅ `dc5ad2405`**（只開 `/api/tools/printful/catalog` 給 design 門＋`ORG_FREE_ROUTES`；`printful/sync` 員工專用，閘 5 擋過） `printful/catalog`：加 `PLATFORM_APIS`＋`ORG_FREE_ROUTES`（理由：公開型錄、無組織欄、快取） | `doors.ts:63`；`registry-code.test.ts:234`；`app/api/tools/printful/catalog/route.ts` | L |
| D4 | **✅ `e28406990`、`dc5ad2405`**（staff 注入；門上 `/ops/clients` 提示隱藏） 橫幅：抽出 `/api/ops/clients`（品牌色）與 `/api/tools/script-forge`（AI 配色／文案）呼叫（S1）；門上隱藏三顆按鈕＋`:1392` 連結；決策 D-V2／D-V3 後再決定是否補替代路由 | `TOOLS/banner/BannerStudio.tsx:1096,1127,1292,1392` | M |
| D5 | **✅ `dc5ad2405`**（「去建商品」門上隱藏；下載門上走 studio proxy-image） 門上連結改 door-aware：`BannerStudio.tsx:2132`、其他 `/tools/*` 連結（grep `href="/tools` 於 5 頁） | 同左 | L |
| D6 | **✅ 2026-10-24 左邊選單（同 V7）**；manifest 無 TODO `features[]`（`design.edit` 為 contract，`products.ts:62`）渲染清單；`lib/design/MODULE_MANIFEST.json` 無 TODO | — | L |
| D7 | **✅ `dc5ad2405`**（本機四頁門框＋選單；mockup 只收販售商品 id，突變證據 WORKLOG 2026-10-24 續28） 驗收同 V8（`Host: design.localhost`，每個 nav 頁進得去、`/designs` 載入）；突變：presets 拿掉 org 檢查 → 指名測試紅 | — | L |
| D8 | **✅ 2026-10-24 上線**（同 V9；門只讓持有 design 的帳戶進） 上線（DNS／nginx `server_name`）— High，要 go | `nginx/default.conf:430` | H |

## 5. CONTENT 門（含 video／design 共用的 content 路由加固）

### 5.1 員工頁與元件
- 名下 5 條 staffPaths（`products.ts:67`）：`tools/content`（`TOOLS/content/page.tsx:7-17`→`ContentStudio`，4000+ 行）、`tools/content/calendar`（`ContentCalendar`）、`tools/content/sites`（`SiteManager`）、`tools/publish`（`PublishWizard`）、`tools/events`（`events/page.tsx` 自成 client 元件，203 行）。→ **多頁（P1）**。
- `tools/publish` 與 `tools/events` 掛在 content 名下不合理：publish 是 POD 上架（Printful／Woo；`/api/tools/publish` 用 `WPBRIDGE_*` 我們自己的商店，`app/api/tools/publish/route.ts:21-66`，paid 步驟 `studio.upscale`／`studio.product-copy`，`:45-46`），events 是行銷日曆（`/api/tools/events/upcoming` 已是 PLATFORM）。決策 D1：把 `tools/publish` 的所有權改歸 studio（`products.test.ts:125-133` 只要求每個 tools 目錄恰有一個擁有者）且**不蓋門頁**（員工專用）；`tools/events` 留 content，門頁只放讀取視圖。
- `dependsOn:["studio"]`、`optional:["video"]`（`products.ts:67`）。

### 5.2 頁面呼叫 vs `doorApis(content)`
`doorApis(content)` = `/api/content` ＋ studio ＋ PLATFORM。
- OK：`/api/content/*` 全部 25 條（`ContentStudio.tsx:801…2063` 等、`ContentCalendar.tsx:90-118,261`、`SiteManager.tsx:92,622-693`、`SeoCheckPanel.tsx:281`）；`/api/tools/designs`（`PublishWizard.tsx:192,193,269`，若 publish 不蓋門頁則無關）；`/api/tools/studio/mockup`（`PublishWizard.tsx:237`）；`/api/tools/events/upcoming`（`events/page.tsx:76`）。
- **OUT**：`/api/video/generate`（`ContentStudio.tsx:1743`）、`/api/video/status`（`:1770`）、`/api/video/embed-to-wp`（`:1793`）——「文章配 AI 影片」（觸發點 `:663`、選項 `:2948`、狀態 `:3930-3933`）；`/api/tools/publish`（`PublishWizard.tsx:206`）；`/api/tools/events/sync`（`events/page.tsx:100`，admin 才可：`app/api/tools/events/sync/route.ts:10`）。S1 處置：影片嵌入抽成員工頁注入；publish 不蓋門頁；events 的同步按鈕抽成只有員工頁 import 的元件。
- 門上會 404 的站內連結：`ContentStudio.tsx:2102`（`/tools/content/calendar`）、`:2108,2372,3276`（`/ops/clients`）、`:2319`（`/tools/content/sites`）、`:3686`（`/tools/social?brand=` — social 門另有網址）；`ContentCalendar.tsx:325-326`；`SiteManager.tsx:823,826`。

### 5.3 可達 route 授權（`/api/content/*`；video 與 content 兩門都開）
乾淨（組織綁定已核）：`drafts`（GET `:86-114`、POST 更新 `:171-182`、DELETE `:211-235` 先讀列再 assert）、`categories`／`tags`／`patterns`／`related-posts`／`wp-post`／`calendar`／`publish`／`social-channels`／`social-publish`（都走 `resolveWpSite`／`listAccessibleWpSites`／`resolveSocialOrg`，其 `assertOrgAccess`／`canAccessOrg` 見 `lib/content/wp-sites.ts:122-125,135-139`、`lib/content/social-org.ts:20-46`；環境變數站 `organizationId:null` 對客戶 fail-closed，`wp-sites.ts:12-14`）、`social-admin/connections`（`:16,32,107,118` 角色＋assert）。
**有洞（C-R 系列）**：
- **C-R1 `sites/[id]` PATCH／DELETE 無任何組織檢查（H）**：`app/api/content/sites/[id]/route.ts:10-40`（PATCH 只驗 `canCreateAiImageJob`，直接 `update(...).eq("id", id)`，`:38`）、`:67-84`（DELETE 同，`:79`）。客戶可改他人 WP 站的 `url`／`token`／`username`（`:25-31`）→ 把網址改成攻擊者主機後，publish 會把該站的 Application Password 送過去；或直接刪他人站。
- **C-R1b `sites/[id]/test` 無檢查（M）**：`test/route.ts:10-25` 只用 `.eq("id", id)` 取憑證，用該憑證打 WP，回傳 WP 使用者名稱與角色（`:35-41`）→ 跨租戶探測。
- **C-R2 `sites` POST 建立的列沒有 `organization_id`，且 URL 只檢查 `^https?://`（M）**：`sites/route.ts:174,178-179`。客戶建的站 `organization_id=NULL` → 之後對客戶 fail-closed（自己也看不到，`sites/route.ts:116` 過濾掉）；URL 可指內網（`/test`、publish 為伺服器端請求）。GET 在 `supabase` 不可用時回環境變數站、不做租戶過濾（`:139-150`）。
- **C-R3 `sources` 全域表，客戶可新增／改／刪（M-H）**：`sources/route.ts:64-66`（GET 無 org 欄）、`:97-99`（insert 只有 `label,url,geos`）、`:135-139`（PATCH `.eq("id")`）、`:158`（DELETE `.eq("id")`）。表無 organization 欄（select 清單 `:65`）。客戶可刪／停用全站共用的趨勢來源 → 規則 2 違反（刪非自己的資料）。處置二選一（決策 D2）：(a) 寫入（POST／PATCH／DELETE）限 `canWriteTenantConfig`，客戶唯讀；(b) 加 `organization_id` migration（`down` 兩處，見 memory）。建議 (a)。
- **C-R4 `newsletter` 把客戶內容寫進我們自己的 FluentCRM（H）**：`newsletter/route.ts:169-173`（`isBridgeConfigured()` = 我們自己的 `WPBRIDGE_*`）、`:203` `createNewsletter`；整條無組織概念。處置：route 內明確拒絕客戶（`resolveTenant(req).userKind==="client"` → 403；此時 route 確實使用 `tenant-guard`，閘 5 也合理放行），門上隱藏 `ContentStudio.tsx:1860` 的電子報區塊。`social-admin/integrations` 同法（`route.ts:8-12` 現靠 `canWriteTenantConfig` 擋客戶，但它 `listAllIntegrations()`（`lib/content/postiz.ts:99`）列所有組織的社群頻道，不能列 ORG_FREE；加明確 client 403 讓閘 5 為真）。
- **C-R5 `brand-voice` 伺服器端 `fetch(url)` 未擋內網（M）**：`brand-voice/route.ts:22-24`（只有 `^https?://`，`:53`）。`sources/route.ts:91`、`lib/content/trending-sources` 已有 `isSafePublicHttps`，直接套用。
- **C-R6 無組織資料、無授權（L）**：`seo-check`（純運算，`route.ts:14-` 無 DB 無授權）、`image` GET（`route.ts:278-281` 回靜態規格表）→ 列 `ORG_FREE_ROUTES`＋理由。
- 閘 5 預測紅（鏡像 `closureAuth=-`）：`sites/[id]`（C-R1）、`newsletter`（C-R4）、`seo-check`（C-R6）、`social-admin/integrations`（C-R4）。

付費路由 feature 包裝現況（含他人未提交）：`generate:83`、`hook-brief:22`、`humanize:27`、`image:166`、`keywords:12`、`market-analysis:43`、`outline:14`、`seo-fix:32`、`syndicate:7`、`title:12`、`trending:150`、`brand-voice:37` 全是 `withFeature`。`publish`、`newsletter`、`social-publish`、`sources`、`drafts`、`calendar`、`seo-check` 不呼叫付費 AI（無 ask，合理）。

### 5.4 資料可見度／員工專屬
- 客戶可見他人資料：`sources`（C-R3，共用表）、`sites/[id]/test`（C-R1b）、環境變數站 GET 備援（C-R2）。其餘路由依組織。
- 員工專屬應隱藏：電子報（C-R4）、`tools/events` 同步鈕、`/ops/clients` 連結（`ContentStudio.tsx:2108,2372,3276`、`ContentCalendar.tsx:325`）、影片嵌入（S1）、`sources` 管理 UI（若採 D2(a)）、`SiteManager` 的新增／編輯（C-R2 修好前不要開）。

### 5.5 任務清單（依序）
| # | 任務 | file:line | 風險 |
|---|---|---|---|
| C-R1 | **✅ `7d8d618a4`**（`wp-sites.ts siteRowGate`，AUTO_CONTENT session） `sites/[id]` PATCH／DELETE／`test`：先讀列 `organization_id` → `assertOrgAccess` → 再改／刪／探測（抄 `video/[id]/route.ts:24-42` 與 `drafts/route.ts:171-182` 的寫法）；各一個守衛測試 | `app/api/content/sites/[id]/route.ts:10-40,67-84`、`…/test/route.ts:10-25` | **H** |
| C-R2 | **✅ `21e7da50b`，改採更嚴的做法**：客戶不得新增站或改網址（`wp-sites.ts siteUrlWriteGate`；存進 `wp_sites` 的網址被多處帶密碼抓取、未釘 IP、未依組織過濾，見 WORKLOG 續21）；POST 綁組織、GET 備援對客戶回空。客戶自助登記站的前置在 TASKS `sites` POST：`organization_id: effectiveOrgId(req, body.organizationId)`；URL 套 `isSafePublicHttps`（PATCH 同）；GET 備援對客戶回空 | `app/api/content/sites/route.ts:153-179,139-150` | M |
| C-R3 | **✅ `21e7da50b`**（`staffOnly`；員工 operator 權限不變） `sources` 寫入限 `canWriteTenantConfig`（決策 D2 後）；門上隱藏管理 UI | `app/api/content/sources/route.ts:75-77,107-109,148-150` | M |
| C-R4 | **✅ `21e7da50b`**（`staffOnly`；門上隱藏電子報仍待 C2） `newsletter` 與 `social-admin/integrations` 加 `resolveTenant` 客戶明確 403；門上隱藏電子報 | `app/api/content/newsletter/route.ts:165-171`、`…/social-admin/integrations/route.ts:8-12` | H |
| C-R5 | **✅ `21e7da50b`，改採更嚴的做法**：走 `lib/collect/net/remote-file`（每跳位址閘＋釘 IP），只套 `isSafePublicHttps` 擋不住轉址與 DNS rebinding `brand-voice` URL 套 `isSafePublicHttps` | `app/api/content/brand-voice/route.ts:22-24,52-54` | M |
| C-R6 | **✅ `21e7da50b`**（seo-check 列 `ORG_FREE_ROUTES`；image GET 不讀 DB，閘 5 以計費規則放行，免列） `seo-check`、`content/image` GET 補 `ORG_FREE_ROUTES`＋理由 | `registry-code.test.ts:234-238` | L |
| C0 | **✅ `e28406990`**（P1、S1；D1 publish 歸 studio） 前置 P1（nav）、S1（影片、events 同步、publish 抽出）、決策 D1（`tools/publish` 歸 studio） | `products.ts:67`；`ContentStudio.tsx:1743,1770,1793` | M |
| C1 | **✅ `b3132c733`**（events 頁不傳 `sync`） `app/content/{layout,page}.tsx`＋`app/content/{calendar,sites,events}/page.tsx`；`products.ts:64` 加 `nav`（內容編輯／行事曆／網站／節日） | 新檔 | M |
| C2 | **✅ `b3132c733`**（全走 `useDoorHref`；門上另隱藏電子報、「管理來源」、`+ 新增網站`，網址欄唯讀——伺服器本就拒絕客戶） 門上連結改 door-aware：`ContentStudio.tsx:2102,2319`、`ContentCalendar.tsx:326`、`SiteManager.tsx:823,826`；`/ops/clients`、`/tools/social` 連結隱藏（`:2108,2372,3276,3686`、`ContentCalendar.tsx:325`） | 同左 | L |
| C3 | **✅ S1 已達成、`b3132c733` 驗**（只有 `ContentStudioStaff` 傳 `video`） `ContentStudio` 影片選項（`:2948` `ai-video`）在門上不顯示；`:663` 自動觸發只在員工頁注入的模組內 | `ContentStudio.tsx:663,2948` | M |
| C4 | **✅ 2026-10-24 左邊選單（同 V7，content 門開了就有）**；manifest 無 TODO，兩句舊說法 `b3132c733` 更正 `features[]` 渲染清單（12 個 content 功能，`products.ts:66`）、`lib/content/MODULE_MANIFEST.json` 無 TODO | — | L |
| C5 | **✅ `b3132c733`**（本機四頁門框＋選單；突變證據 WORKLOG 2026-10-24 續34） 驗收同 V8；突變：`sites/[id]` 拿掉 assert → 指名測試紅；`sources` 拿掉角色閘 → 紅 | — | L |
| C6 | 上線（DNS／nginx）— High，要 go | `nginx/default.conf:430` | H |

## 6. 決定（操作者 2026-10-23：全部採建議）
D1 `tools/publish` 歸 studio、員工專用、不蓋門頁；D2 `content_sources` 客戶唯讀（寫入限 `canWriteTenantConfig`）；D3 客戶可核准自己組織的 release／story bible（V6 走「客戶限本組織」）；D-V 首版 nav 不放向量編輯；D-V2 橫幅門上無品牌色；D-V3 橫幅 AI 配色／文案按鈕門上隱藏。以下為原題目與選項。

## 6a. 原決定點
- **D1** `tools/publish` 歸 studio、員工專用（建議）vs 另設 content 的門頁。
- **D2** `content_sources` 是共用資料：客戶唯讀（建議）vs 每組織一份（要 migration）。
- **D3** 客戶能否核准自己的影片 release／story bible（目前 `canApproveMediaRelease` 擋客戶，`ops-role.ts:81`）；不決定就要在門上隱藏 Release 步驟。
- **D-V** vector-editor 首版不放（建議）vs nginx 放行／app route 代理。
- **D-V2** 橫幅品牌色：門上無／改為依組織授權的新路由。
- **D-V3** 橫幅 AI 文案／配色：門上隱藏（建議）vs 改走 studio 的 route＋新計費鍵。

## 7. 閘預測（蓋好頁面、`enabled:false` 時）
| 門 | 閘 3 可達性 | 閘 4 service-role | 閘 5 授權 | 閘 6 unscoped |
|---|---|---|---|---|
| video | 綠 | 綠 | 紅：`video/{capabilities,qa/report,remotion-status}`、`content/{newsletter,seo-check,sites/[id],social-admin/integrations}` | 綠 |
| design | 紅：`/api/ops/clients`、`/api/tools/printful/catalog`、`/api/tools/script-forge` | 綠（`CanvasEditor`、`BannerStudio` 只 import `roleHeader`，不 import supabase-server） | 綠（假陽性：presets，P2） | 綠 |
| content | 紅：`/api/video/*`、`/api/tools/publish`、`/api/tools/events/sync`（S1） | 綠 | 紅：同 video 的 content 4 條 | 綠 |
以上為鏡像腳本預測，非 vitest 實跑。

## 8. 稽核限制（沒做的）
- 沒逐行讀 `ContentStudio.tsx`（4000+ 行）內所有 UI 分支，只讀了 fetch／連結／`canUse` 的 grep 命中。
- `publish` route 經 `lib/content/publish/wordpress-core.ts:319-345` 的 `resolveWpSite`（已驗組織）；橋接分支（`:392-460`，目標站主機與我們 bridge 同主機時走簽章 `/post`）未再往 `lib/payments/woo` 深讀。
- `lib/content/blocks/video-pipeline.ts` 的 `resolveOrgId()` 預設租戶只對員工生效（客戶被 `effectiveOrgId` 強綁，`tenant-guard.ts:183-195`），未逐路徑驗。
- 未執行任何寫入、未動 `.claude` junction；鏡像腳本在 scratchpad，不入庫。
