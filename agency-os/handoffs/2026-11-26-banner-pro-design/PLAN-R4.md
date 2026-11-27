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

## 3. 狀態

| 卡 | 狀態 | worker | commit |
|---|---|---|---|
| R4-A | 派工中 | banner-r2a | — |
| R4-B | 研究中（階段一） | banner-r2b1 | — |
| R4-C | 等 R4-A、R4-B | banner-r2b1 | — |
