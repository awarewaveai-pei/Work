# Mockup Studio 固定模特兒（多張姿勢照 ＋ 一張設計圖）建置計畫

> 讀者：執行這份計畫的 agent。狀態：2026-11-01 已實作（WORKLOG 2026-11-01 續16）。原系統全部保留，只加新功能。
> **2026-11-01 晚間再改**：第 3 步預設改為 **AI 印（gpt-image-2.5-sunburst，`openai-25-edit`）**——程式印在平順的 AI 照片上跟不到皺褶（操作者：「圖案都沒有隨衣服的皺褶」）。研究五條路（nano-banana-2／pro、程式置換、FASHN v1.6、FLUX VTO、gpt-image-2.5），只有 gpt-image-2.5 同時做到：印花隨皺褶與身體弧度、人／姿勢／背景不動、設計圖不變；FASHN／FLUX 會重畫衣服版型與身材。`POST /api/tools/studio/fabric-print` 收 `engine: "ai" | "code"`，AI 走 `generateImage` 扣 `studio.image`（約 US$0.06／張），程式印保留為免費預覽（需印花框）。對照圖 `D:/tmp/mockup-2026-11-01/cmp-cafe-3-zoom.jpg`。
> **與下文不同處（以此為準）**：第 3 步改為**程式印**（`lib/studio/fabric-print.ts` 置換＋明暗，`POST /api/tools/studio/fabric-print`），不呼叫 AI、不扣點——AI 兩個模型（nano-banana-2／pro）試印都是平的方塊、不隨皺褶（試驗圖 `D:/tmp/mockup-2026-11-01/fold-3way.jpg`）。每張照片要先框印花位置（`metadata.print_box`，`PATCH /api/tools/presets?id=`）。presets 不做多張原子寫入：前端逐張 POST、同一 `modelKey`；整位刪除＝逐張 DELETE。畫面為新模式「模特兒印製」（`app/(shell)/tools/mockup/ModelLibraryStudio.tsx`）。
> 路徑縮寫 `NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 0. 現況（已讀程式，file:line 為證）

| 元件 | 位置 | 現在做什麼 |
|---|---|---|
| 頁面 | `NA/app/(shell)/tools/mockup/MockupStudio.tsx`（1 檔，~1300 行）；`/design/mockup` 共用同一元件 | 三種模式：`model`（AI 畫人穿）／`flat`（AI 平拍）／`printful`（Printful 真實 mockup） |
| AI 合成 | `MockupStudio.tsx` `generate()` → `POST /api/tools/studio/generate` | 一次一張：`referenceImages=[設計圖(, 模特兒照)]` + prompt；回 data URL；`withFeature("studio.image")` 扣點（`NA/app/api/tools/studio/generate/route.ts:48`） |
| 參考圖規則 | `generate/route.ts:82-100` | 只收 data URL 或 designs bucket 公開 URL；張數上限 = `STUDIO_MODEL_OPTIONS[].maxRefs`（`NA/lib/studio/model-options.ts:36-51`：nano-banana-2 = 14、nano-banana-pro = 8、openai = 5、其餘 0–1） |
| 送給 AI | `NA/lib/tarot/image-gen.ts:214-241` | nano-banana：`image_input = referenceImages`（整個陣列，順序保留） |
| Prompt | `NA/lib/studio/mockup-prompt.ts` | `buildModelMockupPrompt`（人穿＋印花忠實度）、`buildFlatMockupPrompt`、`withIdentityReference`（2026-11-01：第二張 = 同一人） |
| 固定模特兒（今日已上） | `MockupStudio.tsx` `fixedModel`／`modelList`／`selectModel` | 選一位 → 他的**一張**照片當第 2 張參考圖 |
| 模特兒／產品預設儲存 | `POST/GET/DELETE /api/tools/presets`（`NA/app/api/tools/presets/route.ts`） | 存 R2（`putDesignObject`）＋ `media_assets` 一列：`asset_domain = mockup_model_preset`、`metadata.{preset_name, preset_settings}`；`withFeature("design.edit")` |
| 改圖面板 | `NA/components/tools/ImageEditPromptPanel.tsx` | 文字 → AI 產修圖 prompt → `generate` with `referenceImages=[目前圖]`（= image-to-image 編輯，本計畫第 3 步用同一條路） |
| 存成品 | `POST /api/tools/designs`（`source:"mockup"`）→ `asset_domain = ai_generated` | My Designs「商品照」分頁靠 `metadata.source ∈ MOCKUP_SOURCES`（`NA/lib/studio/designs-list.ts:122`） |
| 批次樣板 | `NA/lib/studio/batch-mockup.ts` | 一張設計 → 4 個 prompt，呼叫端逐一 `generate` 再存（第 1、2 步照這個模式） |

### 0.1 已發現的現有 bug（必先修，否則新舊功能都存不了）

- **正式庫 `media_assets_asset_domain_check` 不含 `mockup_model_preset`／`mockup_product_preset`。**
  migration `0045_mockup_presets.sql` 加過，`0067_media_assets_real_footage.sql:3-19` 用「drop 所有含 asset_domain 的 CHECK → 重建」把它們丟掉，只留 `('ai_generated','wp_product','wp_blog','real_footage')`。
  證據（2026-11-01 `supabase-db` psql）：constraint 定義同上；`media_assets` 按 domain 計數：`ai_generated 120`、`real_footage 2`、preset **0 列**。
  後果：「儲存為模特預設」自 0067（2026-09）起一律 `insert_failed`（500），而且 R2 物件先上傳才插表 → 每次失敗留一個孤兒物件（`presets/route.ts:175-199`）。今日上線的「固定模特兒」同樣存不了。
  修法：migration `0151_media_assets_presets_restore.sql`（下方 §2.1）。

## 1. 要加的功能（三步，全部是新增；舊的 model／flat／printful／單張固定模特兒照常）

### 第 1 步：生成模特兒（多角度底照）
- 入口：模特模式「固定模特兒」區加按鈕「生成新模特兒」。
- 輸入：現有外貌下拉（族裔／性別／年齡／身材／妝／配件）＋ 衣服顏色（白／灰／黑）。
- 動作：4 個 prompt（正面／左斜側／右斜側／側面；素色無印花、中性表情、乾淨淺灰背景、半身）逐一 `generate`（2 張並行，照 `generatePrintful` 的 `BATCH_SIZE=2`），不帶參考圖。
- 顯示 4 張 → 操作者取名 → 「存成模特兒」：4 列 `media_assets`（§2.2 欄位），同一 `model_key`，`photo_role = face-front|face-left|face-right|face-profile`。
- 費用：4 × 模型單價（nano-banana-2 ≈ NT$2.2）。

### 第 2 步：幫模特兒加姿勢照（素色衣服）
- 入口：選了模特兒後顯示「加姿勢照」。
- 輸入：姿勢（`MODEL_POSES`，**多選按鈕**）、場景、光線、取景、衣服顏色。
- 動作：每個勾選姿勢一張：`referenceImages = [該模特兒全部照片（最新 ≤13 張）]`，prompt = `withIdentityReference`（改寫成「全部參考圖都是同一人」版）＋ `buildModelMockupPrompt({ noPrint: true })`（§2.3）。
- 顯示結果 → 勾選 → 「存進這位模特兒」：`photo_role = pose`、`garment_color`、`pose`、`scene`。
- 費用：勾幾張扣幾張；一次性。

### 第 3 步：合成（把設計印到姿勢照上）
- 入口：模特模式新增子模式「用姿勢照合成」（與現有「AI 畫人穿」並列的按鈕，不是下拉）。
- 輸入：姿勢照（**跨模特兒多選**：清單按模特兒分組，每組底下列他的照片，可同時勾男、女多位的照片；中性衣服要男女都有，操作者 2026-11-01）→ 設計圖（現有 My Designs 選圖）→ 圖案位置／大小（現有控制）。
- 動作：每張勾選照片一次 `generate`（不分模特兒，一張照片一次）：`referenceImages = [姿勢照, 設計圖]`，prompt = `buildPrintOntoPhotoPrompt`（§2.3：第 1 張是照片、第 2 張是設計；只把設計印到衣服上，人／臉／姿勢／背景／光線全不動；沿用 `fidelityBlock` 的印花忠實與深色不改色規則）。
- 顯示成品格（沿用 `productResults` 的格子樣式）→ 勾選 → 「存入 My Designs」（`source:"mockup"`，現有 `saveMockup` 路徑，加 `metadata.model_key`、`pose_photo_id`）。
- 費用：勾幾張扣幾張。

## 2. 要新增／修改的東西（清單；沒列的不動）

### 2.1 資料庫（High，操作者明示 go-ahead 才做）
- `lobster-factory/packages/db/migrations/0151_media_assets_presets_restore.sql`：同 0067 寫法（drop 含 asset_domain 的 CHECK → 重建），集合 = `('ai_generated','wp_product','wp_blog','real_footage','mockup_model_preset','mockup_product_preset')`，`not valid`；`0151_….down.sql` 還原成 0067 集合。
- 套用：筆電 `node scripts/apply-db-migration.mjs 0151` → `--status 0151 applied` → psql 查 constraint 含兩個 preset 值。**先套再推**：0151 進 main 後，每日 03:00 自動部署的 migration 閘會擋到套用為止。
- 不開新表：模特兒分組用 `media_assets.metadata`（與 `designs/route.ts:222` 的 `batch_job_id`／`card_index` 同一慣例）。

### 2.2 `POST/GET/DELETE /api/tools/presets`（`NA/app/api/tools/presets/route.ts`）
- POST body 加選填：`modelKey`（uuid；沒給 = 新模特兒，伺服器配）、`photoRole`（`face-front|face-left|face-right|face-profile|pose|upload`）、`garmentColor`、`pose`、`scene`。寫進 `metadata.{model_key, photo_role, garment_color, pose, scene}`；`preset_name` 每列都寫（清單用）。
- 一次存多張：body `images: string[]`（≤8，每張同一上限）→ 逐張 R2 PUT → **全部成功才**一次 `insert` 多列；任一 R2 失敗 → 刪已上傳的再回錯（修 §0.1 的孤兒問題，連舊單張路徑一起套同一函式）。
- GET 回傳不變（`metadata` 已含新欄位）；前端按 `model_key` 分組，舊列沒有 `model_key` → 用自己的 `id` 當 key（舊單張模特兒照常出現）。
- DELETE 加 `?modelKey=`：刪整位模特兒（同 org 全部列，逐一走 `deleteUnreferencedAsset`）。
- 測試：`presets/customer.test.ts` 加「多張原子性」「modelKey 刪除只刪自己 org」兩條。

### 2.3 Prompt（`NA/lib/studio/mockup-prompt.ts` ＋ `__tests__/mockup-prompt.test.ts`）
- `buildModelSheetPrompts({ modelDescription, color, ageGroup })` → 4 個 prompt（角度固定、素色、無印花、淺灰背景）。
- `ModelMockupParams.noPrint?: boolean`：為 true 時 `productBlock` 換成「plain <color> <garment>, no print, no graphic, no text」。
- `withIdentityReference(prompt, { refCount })`：refCount > 2 時改寫成「reference images 2..N 都是同一人」；`refCount === 2` 維持現行文字（舊路徑不變）。
- `buildPrintOntoPhotoPrompt({ color, placement, designSizePct, category })`：image-to-image 指令（§1 第 3 步）。
- 每個 builder 一條測試：有／無旗標各一個斷言。

### 2.4 前端（`MockupStudio.tsx`；若超過 1500 行，把模特兒區抽成 `ModelLibrary.tsx` 同目錄）
- 狀態：`models: Map<modelKey, PresetAsset[]>`（由 `modelPresets` 分組）、`selectedPosePhotoIds: Set<string>`（照片 id，**不綁單一模特兒**；第 1、2 步才需要「目前這位」`activeModelKey`）、
- 模特兒卡片顯示性別標籤（來自 `preset_settings.mGender`，上傳的沒有就留空），方便一眼挑男女。`modelSheet`（第 1 步結果）、`poseResults`、`printResults`。
- UI 規則（操作者既有要求）：全部用可見按鈕／勾選，不加下拉；每張照片按鈕顯示角色標籤（正面／左斜／姿勢…）與衣服顏色點。
- 現有 `fixedModel` 保留：第 3 步沒勾姿勢照時，退回今日已上的「一張照片當第 2 張參考圖」路徑。
- 參考圖張數：送出前檢查 `maxRefs`，超過只送最新；模型 `maxRefs < 2` 擋法沿用。
- 並行：`BATCH_SIZE = 2`，每張獨立成功／失敗，失敗顯示該張錯誤不中斷其他。

### 2.5 不需要動的
- 路由／產品門：沒有新頁、沒有新 API 路徑（`lib/portal/products.ts` 不改；door code-scan 不受影響）。
- 計費：沿用 `studio.image`（每次 `generate` 一張）與 `design.edit`（存預設）。
- Printful 模式、flat 模式、ImageEditPromptPanel：不動。

## 3. 風險與回滾
- 0151 是純 CHECK 重建、`not valid`、`lock_timeout 3s`；回滾 = down 檔。
- 前端全部為新增分支；回滾 = revert 該 commit，資料列保留無害。
- 長相一致性靠參考圖，不保證 100%；要 100% 要走 LoRA 訓練（另案）。

## 4. 驗證（AGENTS.md §1 四動作）
- REALTEST：真打 nano-banana-2 三步各一次（第 2 步 ≥5 張參考、第 3 步 2 張參考），產出存 `D:\tmp\mockup-<日期>\`；psql 查 constraint；`vitest` presets＋mockup-prompt；`npx tsc --noEmit`。
- 操作者登入 `/tools/mockup` 走完三步一次（部署後）。
