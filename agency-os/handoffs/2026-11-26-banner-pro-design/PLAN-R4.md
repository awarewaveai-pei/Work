# 橫幅 第四輪（R4）— T1 實測後的整合（操作者 2026-11-27 同意 t1/T1-measure.md「決定」1–4）

> B = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/`。基準 main `d137012fa`。共同規則 `briefs/COMMON.md`。回報操作者一律繁體中文。
> 證據正本：`t1/T1-measure.md`（量測表＋出處＋決定全文）、`t1/safe-zones.md`、`t1/T1-compare.jpg`。DEPLOY_HOLD 擋到 R4-C 驗收過。

## 1. 要做的事 → 不變量

| # | 來源 | 不變量 |
|---|---|---|
| 1 | R3-E Codex F1–F3（reports/oracle/2026-11-27-partialreview-b1443f85.md） | 背景圖、bgImageHasProduct、bgProductArea 三者只經一個函式一起換；保留商品區看 bgImageHasProduct，不看 productImage |
| 2 | T1 決定 1 字級 | 每個尺寸有 displayW（手機 393／連結卡 500／內文 700／Hero 1920）；主標字級範圍 = 36–57 × 畫布寬 / displayW，自動字級只在範圍內取放得下的最大；副標 = 主標 / 1.25；16:9 拆「網站 Hero」與「社群／縮圖」兩個尺寸 |
| 3 | T1 決定 2 版面 | 構圖三群一張表（唯一來源，排版預設、AI 版面預設、合成 prompt 都讀它）：手機直式（9:16、2:3、3:4、4:5、1:1）文字上三分之一、商品下三分線交叉點，9:16 文字 ≥14%、商品整個 ≤65%；卡片橫式（4:3、16:9 社群、1.91:1、2:1）左文約 55%、右側商品；網頁（16:9 Hero、3:1、3:2）左文右商品、字小 |
| 4 | T1 決定 3 合成 | 橫式商品區 = 右欄全高、prompt 要求高度約 50%；只靠水平分區；3:1 若模型支援 21:9 就用 21:9 生成，否則上下當裁切區 |
| 5 | T1 決定 4 驗收 | 同素材再實打一次（約 NT$20）：11 張商品×文字重疊 0、主標都在範圍內、縮到 25% 標題可讀 |

## 2. 卡

### R4-A 排版引擎＋尺寸資料（1、2、3）— Opus 5.5，worker banner-r2a
檔案：`B/banner-layout.ts`、`B/field-ranges.ts`、`B/banner-state.ts`（PRESETS 加 displayW、16:9 拆兩個、構圖群代號；背景三欄單一寫入函式）、`B/composition.ts`（新，三群表）、`B/banner-canvas-return.ts`、`B/banner-design.ts`（只改 shapeLayout 改讀三群表）、其他寫 bgImage 的呼叫點（只改成呼叫單一函式）、對應測試。
- 16:9 拆分：舊 key `r16x9` 的設計（URL `?ratio=16:9`、片頭）對應「社群／縮圖」；新 key 給 Hero。寫進測試。
- 點名測試：R3-E F1–F3 各一；11+1 個尺寸主標字級都在範圍內、副標 = 主標/1.25；三群歸屬；9:16 文字框 ≥14%、商品區 ≤65%；重疊矩陣照舊全綠。

### R4-B 合成 prompt（4）— 先研究後施工，worker banner-r2b1
- 階段一（現在，唯讀）：查 Nano Banana 2（及畫面步驟可選、會合成商品的模型）是否支援 21:9；查 `app/api/tools/studio/generate/route.ts:62` 比例清單的來源與上游供應商文件。回報結論＋出處，不改檔。
- 階段二（R4-A 合併後）：合成 prompt 依三群表與 T1 實測改（橫式商品區右欄全高、高度約 50%；直式商品在下三分線交叉點）；3:1 依階段一結論。檔案：`B/banner-design.ts`（合成 prompt 函式）、`B/steps/StepCanvas.tsx`（只限 compositeSizes 比例選擇）、比例清單所在檔（若要加 21:9）、對應測試。

### R4-C 驗收實打（5）— worker banner-r2b1，R4-A＋R4-B 合併後
同 T1 素材與步驟再實打一次（約 NT$20，按前記下按鈕總價）；產出同 T1 格式的量測表與對照圖到 `t1/` 旁邊的 `t2/`；三個標準逐張判定。

### R4-D AI 生圖流程重整（操作者 2026-11-27「照三點改」）— Opus 5.5，worker banner-r2b1
不變量：花錢只在標價的按鈕上；同一組設計各尺寸是同一個場景；兩個入口共用一套流程。
1. 點候選縮圖＝免費預覽主尺寸；另一顆按鈕「生成其他 N 個尺寸（約 NT$x）」才付費。換候選不自動重生。
2. 其他尺寸以選中的圖為參考圖延伸成該尺寸比例（商品與場景保持一致），不再用文字重新生成；商品區照該尺寸 reservedAreas。
3. 「AI 一鍵設計」與畫面步驟「AI 合成進場景」共用同一個流程模組（候選 N 張標價 → 挑一張 → 按鈕生成其他尺寸標價），程式一份。
4. R4-C 驗收時「延伸」與「重新生成」各實打一次比較一致性與商品完整度，依結果定預設（理由寫進 PLAN）。

### R4-E 一張底圖裁全部尺寸，事後可改（操作者 2026-11-29「做進工具,但還是要維持可以事後改」）— Opus 5.5，worker banner-r4e
證據：`t2/run2/`（run.json、crops-sheet.jpg、before-after.jpg、mock-vertical-sheet.jpg、mock-916-reels.jpg）。實測：AI 畫的商品高是要求的 2～2.4 倍（T1；run1 32%→68%、run2 35%→84%），所以位置一律量、不信要求。
不變量：
1. 一組場景一張 16:9 底圖；每個尺寸的背景＝同一張底圖＋該尺寸的 bgImgScale／bgImgX／bgImgY（由裁切框換算，畫法同 `B/banner-layers.ts:300`、`B/banner-state.ts:810`），不存裁好的圖 → 每個尺寸事後可拖／縮放；文字、商品、徽章、Logo 圖層照舊每個尺寸可改。
2. 商品框在圖上量（新 route，Gemini flash box_2d，約 NT$0.1 內，記帳），不用要求區。
3. 底圖框在商品 x 75%／y 57%／高 45%（`B/master-crop.ts` MASTER_TARGET）；框超出圖 → bria-expand（既有 `app/api/tools/studio/genfill/route.ts` 擴圖）往外補，標價。寬尺寸商品中心 x：16:9 75%、3:2 73%、4:3 70%（WIDE_PRODUCT_X）；直式／方形置中。
4. 9:16 限時動態＋Reels 共用一張：商品約 30% 高、在 33～63%，文字 14～31%，下方 35% 不放字／按鈕；做法＝底圖取商品那一條往上下擴（標價），該尺寸自己的背景（`withSizeBackgrounds`），同樣可拖／縮放。
5. 裁不進的尺寸（masterCrop ok:false）→ 該尺寸用 R4-D 的延伸單獨畫，標價。
6. 花錢只在標價按鈕；新步驟全在 `B/scene-flow.ts` 的 paid() 同一筆裡（R4-D 不變量）。
檔案：`B/master-crop.ts`（已在 main，4 個測試）＋ placementOf（裁切框 → bgImgScale/X/Y，欄位範圍 `B/field-ranges.ts:20`）、新 locate-product route、`B/scene-flow.ts`（候選改畫 16:9；點選＝免費預覽；按鈕「套用到所有尺寸（約 NT$x）」＝量＋必要的擴圖＋9:16 擴圖＋寫入各尺寸位置）、`B/steps/SceneFlow.tsx`、`B/banner-state.ts`（寫入位置的單一函式）、`B/composition.ts`（9:16 safe 已有 top .14／bottom .35，排版要守）、對應測試。
舊資料：已存的設計（各尺寸自己的背景、位置欄位 1/0/0）照舊載入、畫面不變——寫舊設計測試。
點名測試：placementOf 畫出來的範圍＝裁切框（±1px）；每個尺寸的商品框完整在畫面內；9:16 商品與文字都在 14～65%；量不到商品／擴圖失敗＝不扣第二次、說明已計費；舊設計載入不變；付費中拒絕第二筆（沿用 R4-D 測試形狀）。
實打驗收（併入 R4-C）：同 t2 素材從「AI 一鍵設計」與「AI 合成進場景」各走一次，12 尺寸截圖＋每尺寸事後拖一次背景確認可改；記花費。

## 3. 狀態

| 卡 | 狀態 | worker | commit |
|---|---|---|---|
| R4-A | 已合併 886160b54；Codex 修正中 | banner-r2a | b863443c4 |
| R4-B | 已合併 5d6fd3407；Codex 修正 1058130aa 待合併 | banner-r2b1 | bc298e469 |
| R4-E | 派工中（監工 2026-11-29） | banner-r4e | — |
| R4-C | 等 R4-E；可開跑（R4-A、R4-B、R4-D 都已合併）；banner-r2b1 那個帳號額度用完，由監工接手 | 監工 | — |
| R4-D | 已合併 bf434bd19（ff368f78b＋Codex 7 輪修正：付費同一時間只一筆直到套用、AI 一鍵設計整段在同一筆、復原不動進行中旗標、復原紀錄以整張圖雜湊比對；最後一輪誤報） | banner-r2b1 → 監工 | d26ad5929 |
