# W3 實測：ai-fill／genfx／edge-mask 在真的 PhotoCraft（dist 98bcbfa-f007c95，2026-11-06）

指令：`tests/e2e/smoke/06b-photo-pro-ai-panels.spec.ts`（dev server 無登入；AI 路由由 page.route 依請求產生結果：遮罩白區塗綠、擴圖往指定方向補藍，不扣點）。

| 項 | 結果 | 截圖 |
|---|---|---|
| ai-fill 去除：選取框 60×40 → 遮罩框＝圖層內 [20,10,60,40]、同尺寸 200×120；框內變綠、框外不動 | PASS | smoke-w3-ai-fill-remove-rect.png |
| ai-fill 生成填色：Q 黑色塗 → Q → 反轉（Cmd/Ctrl+Shift+I）→ 遮罩框 [120,70,60,40] | PASS | smoke-w3-ai-fill-fill-quickmask.png |
| ai-fill：Q 白色塗（沒先選取）→ PhotoCraft 無選取 → 面板擋下、不送請求 | PASS | — |
| genfx 擴圖 左／右／上／下：請求帶方向；結果成新圖層、原圖保留 | PASS | smoke-w3-genfx-outpaint-{left,right,top,bottom}.png |
| genfx 色調分離 2／8 階：顏色 21601→5、24000→64 | PASS | smoke-w3-genfx-posterize-{2,8}.png |
| edge-mask 筆刷 1／乾毛筆／粉筆：邊緣透明、中心偏移 ≤0.5 px、每次從原圖重做 | PASS | smoke-w3-edge-mask-{mask-01,dry-brush,chalk-brush}.png |
| edge-mask 強度 55→90 重套 | **FAIL（轉接器）**：不透明 14306 [171×89] → 14571 [172×90] | — |
| edge-mask 換筆刷不疊加（嚴格相等） | **FAIL（轉接器）**：乾毛筆→粉筆 13780 vs 直接粉筆 13662 | — |

發現：
1. 快速遮色片照 Photoshop：沒選取時 Q 起始全白，白色塗＝無效；黑色塗＝排除。所以「塗哪改哪」＝Q 黑色塗 → Q → Shift+Ctrl+I。面板說明已改；`ctx-contract.md:79` 寫「Q → X 換白色 → 塗 → Q」在沒選取時無效（W1 的檔，未改）。
2. 轉接器缺陷（`ctx-photocraft.js` replaceImage，W1 的檔，未改）：結果有透明邊時，PhotoCraft 圖層範圍只算不透明部分；replaceImage 以舊（修剪後）範圍做 `edit.transform`，把新內容縮放回舊範圍 → 強度變化看不出來、連續套用有 ~1% 重取樣差。重現：任一圖層套邊緣遮罩，強度拉到 90，圖層範圍幾乎不變。修法方向：以暫用文件的畫布（未修剪）對齊舊未修剪框，或內容尺寸相同就不 transform。
3. 擴圖結果置中在畫布（`placeImage` 沒有位置參數；舊編輯器也是置中）。
