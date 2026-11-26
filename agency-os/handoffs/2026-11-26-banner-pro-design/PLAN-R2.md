# 橫幅工具 第二輪（R2）計畫 — 操作者 2026-11-26 18:37 的 10 點回饋

> 程式根目錄 `B = lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/`。行號以 main `9854e4be1` 為準（BannerStudio.tsx 最後改動 95f8e0d50）。
> 狀態只寫在本檔 §7 與 `DISPATCH.md`。回報操作者一律繁體中文。

## 1. 任務理解

10 點回饋背後只有 4 個根本問題（每點都對到其中一個）：

| 根本問題 | 不變量（關掉整類） | 對應回饋 |
|---|---|---|
| P1 版面由「絕對座標」說了算，按鈕（上中下、左上右上、產品位置、模板）被靜默蓋掉；自動排版不避讓 | **按鈕永遠看得到效果**：語意控制（位置按鈕、模板）一律清掉該元素的拖曳座標；自動排版由程式算，元素互不重疊、全在畫面內 | 4(1)(2)(3)、9 |
| P2 字級是固定數字，不依尺寸與字數調 | **標題自動配字級**：依該尺寸可用寬高與字數算字級，換行平均、不留單字一行 | 1 |
| P3 AI 一鍵設計只出一版、不帶品牌 logo／字體，還輸出座標 | **AI 只決定意圖（文字、配色角色、哪個角落、哪一帶），幾何由程式算**；品牌套組（色、字、logo）整組進設計 | 3、4(4) |
| P4 介面流程與版面細節 | 步驟順序由一張表決定；左欄（預覽＋縮圖）高度不超過視窗；捲動不改圖 | 2、5、6、7、8、10 |

## 2. 現況分析（已讀檔、證據）

已整檔讀：`B/BannerStudio.tsx`（2698 行）、`B/banner-layers.ts` 1–820、`B/banner-design.ts`、`B/design-colors.ts`、`B/product-grounding.ts`；grep：`lib/script-forge/modules.ts:49-99,311-347`、`app/globals.css:943-955`、`lib/studio/model-options.ts:35`、`B/kit/brand-kit.ts:85-92`、`B/BannerStudioStaff.tsx:11-40`、`lib/script-forge/run-budget.ts:7`。
`git log`（banner）：95f8e0d50 review r2 → cb85803af C13 步驟化 → ed7dbc404 C12 配色 → 110f190d3 C11 尺寸多選 → 56fade1ef C9 多尺寸 AI → a8b4be4cd C8 品牌套組。無持久化 State（banner 內無 localStorage；設計存成 PNG）；外部輸入只有 URL 參數（`?ratio&title&template&org`，BannerStudio.tsx:1102-1110）與 `client_config.bannerKit`，兩者格式本輪不變。

| # | 回饋 | 根因（file:line） |
|---|---|---|
| 1 | 生成文案後排版醜 | 套用文案只寫 headline/subtext（BannerStudio.tsx:1641）；字級固定 `headlineSize: 64`（:302）；平均換行只有片頭模板開（`balanceTitle` INIT false :310，只在 :551 設 true；banner-layers.ts:475）→ 圖一「療／癒」單字一行；其他尺寸只按短邊比例縮（BannerStudio.tsx:380-385）→ 3:1（1920×640）由 4:5 主尺寸換算 64×640/1080≈38px，只佔寬 2%，圖一 3:1 字小到看不見 |
| 2 | 文案清單溢出 | 文案卡用 `btn btn-ghost`（:1639）；`.btn` = `inline-flex; justify-content:center; white-space:nowrap`（globals.css:944-955）→ 標題與副標排成一列、不換行、置中往兩側溢出（圖二、圖三） |
| 3 | AI 一鍵設計要多版本 | `generateFullDesign` 一次一個答案直接套用（:1151-1206）；prompt 只要一份（modules.ts:316-332） |
| 4(1) | 徽章左上/右上失效 | 多尺寸時 AI 每個尺寸回 `positions`（prompt modules.ts:55-57 連 badge 都要座標；`sanitizeLayout` 收下所有元素座標 banner-design.ts:71-79；`designPlan` 寫進主尺寸與各尺寸 :94-101、BannerStudio.tsx:1185-1191）；`place()` 有座標就用座標（banner-layers.ts:342-351），徽章角落計算被蓋掉（:765/:788/:809）。單尺寸不會（`designPlan` 無多尺寸回空 banner-design.ts:97）；使用者拖過也一樣壞（同一類） |
| 4(2) | 垂直上中下 | `textPos` 只決定 stackTop（banner-layers.ts:681-684），每塊再被 `place()` 座標蓋掉（:686-691） |
| 4(2) | 文字底襯 | 堆疊全部有座標 → `stackBox = null`（:696-699）→ 底襯不畫（:706）。且對比守門員（design-colors.ts:236,252-257）以為有底襯 → 宣稱的對比與畫出來的不符 |
| 4(2) | 描邊陰影 | 光暈顏色寫死黑色（banner-layers.ts:523、:559）；淺色字在深背景或底襯上，開關前後幾乎一樣。守門員會強制打開（design-colors.ts:252） |
| 4(3) | 產品位置 | 同 4(1)：位置按鈕算的 x,y（banner-layers.ts:424-429）被 `place("product")` 座標蓋掉（:430）；直式預設把商品釘在 y=0.66（banner-design.ts:89） |
| 4(3) | 倒影長度 | 擬真層用「搬移前」的框計算（banner-layers.ts:434），倒影畫在 W×H 畫布、從接觸線往下（product-grounding.ts:169,209-210,228）→ 超出畫布底部先被裁掉，再整層平移（banner-layers.ts:319,436）。置中商品最高 0.85h（:418）→ 接觸線約 0.925h → 倒影最多露出 7.5% 畫面高，滑桿再拉也一樣。AI 商品大小可到 1.2（banner-design.ts:69），滑桿最大 1.0（BannerStudio.tsx:2208）——同類：AI 給的值滑桿顯示不了（標題 AI 上限短邊 25% banner-design.ts:67 vs 滑桿 200 :1794；副標 12% vs 120 :1800） |
| 4(4) | logo 沒進 AI 設計 | `generateFullDesign`/`sanitizeDesign` 不碰 logo 與字體（:735-777）；logo 只在按「套用到這張」時載入（:1078-1101）；prompt 無 logo（modules.ts:56 座標清單也沒 logo） |
| 5 | 多尺寸編輯看不到全部 | 左欄 sticky（BannerStudio.tsx:2530-2533）內含預覽（maxHeight `100vh-230px` :2601）＋多尺寸卡（:2646-2692）→ sticky 區比視窗高，縮圖在視窗外，要等右欄捲到底才露出 |
| 6 | 預設 4:5、加 2:1 | `INIT.preset = "r191x1"`（:263）；`PRESETS` 無 2:1（:32-43）；AI 背景比例清單無 2:1（lib/studio/model-options.ts:35）→ 2:1 生背景用最接近的 16:9 再裁 |
| 7 | 滾輪縮放背景 | 預覽圖上非 passive 的 wheel 監聽，每次滾輪都 preventDefault 並縮放（:1524-1533）；提示文字 :1930 |
| 8 | 清除設計 | 無此按鈕；復原/重做歷史已存在（:1112-1148）→ 清除可被復原 |
| 9 | 直式徽章貼標題 | 文字靠上時 stackTop = padding = 0.06w（banner-layers.ts:446,681）；徽章從 margin 0.035w 起、高 1.9×bf（:745-746,:786-787,:806-808）；排版不預留徽章／logo 區。例：4:5 寬 1080、副標 55px → 徽章 38–137px、標題 65px 起，重疊 72px。直式 AI 預設文字在上（banner-design.ts:88）→ 幾乎必撞。同類：文字欄寬固定 `p.w - 2*padding`（:447）不讓商品，商品放右側時長標題壓到商品（模板「促銷爆款」:460） |
| 10 | 工具順序 | 現在：開始（客戶＋主題/語氣/模型/兩個 AI 鈕/文案清單 :1573-1650）→1 尺寸 :1652 →2 文字 :1693 →3 畫面 :1867 →4 行銷元素 :2260 →5 風格（配色＋版型模板 :2381-2463）→6 匯出 :2465。「選擇品牌帶入配色」（:2401，BannerStudioStaff.tsx:11-40）重複：客戶的套組在沒存套組時已用該客戶品牌色組成（kit/brand-kit.ts:85-92）。步驟號寫死在提示字（:1590「第 5 步」、:2564「2 文字」「3 畫面」） |

## 3. 風險清單

- R-1 排版引擎改了 → 舊模板／片頭外觀變。對策：片頭模板維持指定字級（`typeAuto:false`），9 個模板 × 11 尺寸跑重疊測試；PSD／SVG 與 PNG 同一條繪製路徑（`renderBannerLayers`），不另寫。
- R-2 AI 多版本費用 ×N。對策：按鈕顯示 N 版總價；預設 1 版，2／3 版是看得到的按鈕（無下拉）。
- R-3 BannerStudio.tsx 2698 行單檔，兩個 worker 同改會衝突。對策：R2-B 先拆檔（純搬移 commit），之後各卡各管各的檔。
- R-4 next-admin 每天 03:00 自動部署 main。每張卡合進 main 都要自成一體（不留半套）；不需要 DEPLOY_HOLD。
- R-5 對比守門員用「上中下帶」估文字位置，引擎避讓後文字可能移動。對策：R2-C 改用引擎算出的真實文字框量背景。

## 4. 方案比較

| | A 最小（補按鈕） | B 完整（建議） |
|---|---|---|
| 做法 | 按位置鈕時清座標；徽章時把 stackTop 往下推；倒影改用搬移後的框；AI prompt 拿掉座標 | 抽出純函式排版引擎 `banner-layout.ts`（保留區 → 文字欄 → 自動字級 → 堆疊避讓），繪製只照引擎的框畫；語意控制統一經 reducer 清座標；數值範圍單一來源；AI 只出意圖 |
| 關掉整類？ | 否：模板、logo、商品側放、未來新元素仍會撞；AI 值超出滑桿仍在 | 是：任何元素都經同一個避讓；任何數值欄位 AI 與滑桿同一張範圍表 |
| 可測 | 只能看畫面 | node 測試：11 尺寸 × 模板 × 徽章/logo/商品位置，零重疊、全在畫內、無單字行 |
| rollback | revert 單一 commit | 每卡一 commit，逐卡 revert；引擎卡不改 UI，revert 後舊 UI 照舊可用 |

**建議 B**。理由：4、9、1 都是同一個「排版沒人負責避讓與字級」的缺口，A 只補眼前實例。

已代決（理由一句；不同意直接說）：
- AI 一鍵設計的「多版本」= 同一個設計附 5 組文案可換（操作者更正），一次呼叫；不是出多個版面。
- 「清除設計」= 回到空白設計，**保留客戶與已選尺寸**，其餘全清（含主題）；可按「復原」找回，不另跳確認框。
- 回饋第 10 點的「文案類型」視為「文案模型」。
- 2:1 尺寸 = 1200×600；「用在哪些平台」由 worker 查官方文件後寫，註解附網址，不猜。

## 5. 實作計畫（3 張卡，依序／可並行標示）

### R2-A 排版引擎（回饋 1、4(1)(2)(3)、9）— 建議模型 Opus 5.5
檔案（只動這些）：`B/banner-layout.ts`（新）、`B/field-ranges.ts`（新）、`B/banner-layers.ts`、`B/banner-design.ts`、`lib/script-forge/modules.ts`（banner 兩段）、各自測試檔。**不動 BannerStudio.tsx**（新欄位在 `BannerFields` 設為選填，缺省 = 現在的行為，UI 由 R2-B／C 接上）。
1. `layoutBanner(fields, size, measure)` 純函式，回傳每個元素的框與文字換行：
   - 保留區：徽章角（tl/tr）、logo 角（新欄位 `logoPos?: "bl"|"br"|"tl"|"tr"`，缺省 bl）、商品區（`productPos`）。
   - 文字欄 = 畫面扣掉保留區（商品在左/右時讓出商品寬；徽章與文字同側或文字置中時，文字堆疊上緣下移到徽章下方 + 間距）。
   - 自動字級（新欄位 `typeAuto?: boolean`，缺省 false = 現在行為）：標題在文字欄內最多 2 行（直式 3 行）的最大字級，上限畫面高 30%；副標 = 標題 × 0.42，下限短邊 2.4%；標題多行時一律平均換行（`balanceTitle` 在 typeAuto 時恆真）。
   - 拖曳座標（`positions`）只表示使用者手拖；有座標的元素照座標，不參與避讓。
2. `renderBannerLayers` 只照 `layoutBanner` 的框畫；`place()` 刪除改由引擎提供；擬真層（陰影、倒影）以**搬移後的框**計算，商品框含倒影高度，整組保持在畫面內（product-grounding.ts 不改，改呼叫端 banner-layers.ts:434）。
3. 文字底襯：堆疊有底襯；被拖出堆疊的文字塊各自有底襯 → 開底襯就一定畫得出來（守門員的前提成立）。
4. 描邊陰影：光暈顏色依字色反差自動取（淺字 → 深光暈、深字 → 淺光暈），開關在任何背景都看得到差別。
5. `field-ranges.ts`：每個數值欄位一列 `{min,max,step}`（headlineSize、subtextSize、productScale、badgeScale、logoScale、bgImgScale…）；`sanitizeLayout`（banner-design.ts:61-81）與 R2-B 的滑桿都讀這張表。
6. AI 設計 prompt（modules.ts:49-60）多尺寸段落：拿掉 `positions` 與像素字級，改成每尺寸只給 `textPos/textAlignH/productPos/badgePos/logoPos`；`designPlan` 不再寫 `positions`。
7. 純函式 `applySemantic(st, patch)`（給 R2-B 接線）：位置類欄位或模板一變，清掉受影響元素的 `positions`（主尺寸與正在微調的尺寸都清）。
- 驗收：`npx tsc --noEmit` 綠；`npx vitest run "app/(shell)/tools/banner"` 綠且包含新測試：
  (a) 重疊矩陣：現有 10 個尺寸（R2-B 加 2:1 後同一測試自動涵蓋）× 徽章 tl/tr × logo 四角 × 商品 4 位置 × 文字上中下，自動排版的框兩兩不重疊、全在畫面內；
  (b) 控制有效：給定 AI 舊格式 `positions`（全元素）後，經 `applySemantic` 改 badgePos／textPos／productPos，對應框必須移動；
  (c) 自動字級：圖一的「不會畫畫也能被療癒」在 4:5／1:1／3:1 下沒有單字行、3:1 標題高度 ≥ 畫面高 12%；
  (d) 倒影：商品置中、倒影長度 0.35 → 1.0，引擎回傳的畫面內倒影框高度單調增加。
- 舊資料：無持久化 State；URL 片頭參數照舊（片頭模板 `typeAuto:false` + 原字級，現有 `templatePatch` 行為不變）。

### R2-B 流程與介面（回饋 2、5、6、7、8、10）— 建議模型 Opus 5.5（拆檔可派 Sonnet）
檔案：`B/BannerStudio.tsx`、`B/steps/*.tsx`（新）、`B/banner-state.ts`（新）、`B/BannerStudioStaff.tsx`、`app/globals.css`（只加一個 class）、`B/banner-sizes.test.ts`。
1. **先純搬移一個 commit**：State/INIT/尺寸邏輯 → `banner-state.ts`；每個步驟 → `steps/<Step>.tsx`；`steps/order.ts` 一張表決定順序與編號，提示字以步驟名引用（不寫死數字，修 :1590、:2564）。驗收：搬移前後 vitest 全綠、畫面目視一致。
2. 新順序：①開始（只選客戶）②風格（套組「套用到這張」、logo、參考圖取色；**刪「選擇品牌帶入配色」**：BannerStaffApi 拿掉 `BrandPicker`）③尺寸 ④畫面 ⑤AI 文案與設計（主題、語氣、文案模型、設計模型、生成文案、AI 一鍵設計）⑥版型模板 ⑦文字 ⑧行銷元素 ⑨匯出。無 `staff`（設計門）時①⑤不顯示，編號照表自動算。
3. 尺寸：`INIT.preset = "r4x5"`；新增 `r2x1` 1200×600、`aspect: "16:9"`、`where` 查官方文件後填（註解附網址）。
4. 文案清單：新 class `.choice-card`（globals.css，只用 tokens）：區塊排版、靠左、可換行、選中外框；標題粗、副標淡、上下兩行。尺寸按鈕也改用它（:1666-1679 目前用 inline style 硬繞 nowrap）。
5. 左欄：預覽 + 一排固定高度的尺寸縮圖（橫向、可點切換編輯）高度合計 ≤ 視窗；預覽 maxHeight 扣掉縮圖列；「全部下載 / 全部存到我的設計 / 格式」搬到 ⑨匯出。
6. 滾輪：只有按住 Ctrl（Mac ⌘，觸控板捏合也是 ctrlKey）才縮放背景，平常滾輪捲頁面；提示字改寫（:1930）。
7. 「清除設計」按鈕放在 復原/重做 旁：回空白設計，保留客戶與已選尺寸；按完顯示「已清除，可按復原找回」。
8. 語意控制接 R2-A 的 `applySemantic`：位置按鈕（上中下、左右、徽章角、產品位置、logo 角）與套用模板一律經它；「標題 px／副標 px」滑桿一動 → `typeAuto:false`，旁邊「自動字級」鈕回到 true；新設計預設 `typeAuto:true`；滑桿範圍讀 `field-ranges.ts`。（第 8 項等 R2-A 合併後做；1–7 可先做）
- 驗收：tsc 綠；vitest 綠；瀏覽器實測（本機 dev）逐項截圖：步驟順序 ①–⑨、文案清單不溢出（圖二同樣 7 組）、3 個尺寸時縮圖全在視窗內（圖三情境）、滾輪捲頁不縮圖、Ctrl+滾輪縮圖、清除 → 復原回來、預設 4:5、2:1 可選。

### R2-C AI 一鍵設計多版本＋品牌整組（回饋 3、4(4)）— 建議模型 Opus 5.5；R2-A、R2-B 合進 main 後開始
檔案：`B/steps/StepAi.tsx`、`B/steps/StepStyle.tsx`、`B/banner-design.ts`、`B/design-colors.ts`、`lib/script-forge/modules.ts`（banner design 段）。
1. （操作者 2026-11-26 更正：多版本指的是**文案**）一鍵設計的同一次呼叫回 1 個版面＋配色，外加 `copyVariants` 5 組（標題、副標、CTA、徽章字，各組切入角度不同）；設計完成後在 ⑤ 顯示 5 張文案卡（`.choice-card`），點哪組就換哪組字，版面與配色不變、自動字級重排；第 1 組預設套用。一次呼叫，按鈕價照實算（多 5 組短字，約多 15% 輸出）。
1b. prompt 告知有無商品圖與其位置（`hasProduct`、`productPos`），AI 才會選讓得開商品的文字區。
2. 選的客戶有套組時，AI 設計同時套用套組的字體與 logo（沿用 `applyBrandKit` 的 logo 載入，抽成共用函式）；prompt 告知有 logo，回 `logoPos`；引擎避讓。
3. 對比守門員改用 `layoutBanner` 算出的真實文字框量背景（取代 `BAND_Y` 估計，design-colors.ts:55-56），量的就是畫出來的。
- 驗收：tsc、vitest 綠；本機實測一次（付費，Opus 3 尺寸約 NT$1.6）：出現 5 張文案卡、點第 3 組畫面換字且版面配色不變、logo 出現且不壓到徽章／文字、文字對比 `unmet` 為空（console 無 `[banner] contrast not met`）。

## 6. 驗證計畫（整批）

- 每卡：`npx tsc --noEmit`、`npx vitest run "app/(shell)/tools/banner" lib/script-forge`；Codex 審（`/codex-review`），findings 逐條 grep 驗真。
- 監工：讀 diff、合 main（共享工作樹用 merge-tree 法）、本機 dev 用操作者 4 張截圖的情境重跑並截圖。
- 上線：03:00 自動部署（或操作者要求提前則手動 `sg-deploy.sh`，High）→ `/playwright smoke` → 正式站目視 10 項。
- WORKLOG：四行機械證據（REALTEST／REVIEW／BUGHUNT／ORACLE）。

## 7. 狀態

| 卡 | 狀態 | worker | commit |
|---|---|---|---|
| R2-A | 已合併 | banner-r2a | ef6572105 |
| R2-B1 | 已合併 | banner-r2b1 | 528cb59d5 |
| R2-B2 | 進行中（第二批） | banner-r2b1 | — |
| R2-C | 進行中（第二批） | banner-r2a | — |

監工台：`data.mjs`（唯一進度來源）→ `node build.mjs && node check.mjs` → 重發布。
