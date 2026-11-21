# Z2 紫微格局擴充（25 → 涵蓋 x-iztro 的 64 條）

來源：`D:\tmp\oracle-repos\x-haose_x-iztro\src\pattern\`（MIT）。`keys.rs` 64 個 key；`rules/*.rs` 每條附成立條件、iztro-docs 頁面與《紫微斗數全書》引文；`tests/pattern_examples.rs` 有每條的範例命盤。細節：`research-detail/x-iztro.md` §3。
現況：`lib/ziwei/patterns.ts` 25 條（偵測條件＋解說），`lib/ziwei/analyze.ts` 彙總，`components/ZiweiTool.tsx` 顯示。

做：
1. 列出 64 條與現有 25 條的對照表（已有／缺／條件不同），寫進回報。現有條目與 x-iztro 條件不同者，逐條判斷誰對（依其引文），不確定的列 RISKS，不要默默改。
2. 補上缺的格局：偵測函式沿用 `patterns.ts` 現有結構與輔助函式；解說文字自己用繁體寫（可參考其引文大意，不整段照抄知識包）。作者自承《全書》無載的三條（三奇加會、羊陀夾命、文貴文華）照樣收，解說註明出處性質。
3. 測試：每條新格局一個成立例（取自 `pattern_examples.rs` 的生辰）；另挑 3 條各加一個不成立例。不做無效益測試。
4. 格局只在 zh-TW 命盤上判定（現況如此，`ZiweiTool.tsx` 固定用 zh-TW 盤分析），維持。

檔案：`lib/ziwei/patterns.ts`、其測試（`lib/ziwei/analyze.test.ts` 或新 `patterns.test.ts`）、`THIRD_PARTY_NOTICES.md`；畫面需要時 `components/ZiweiTool.tsx`、`messages/*.json`。
注意：晚子時日界是 `lib/ziwei.ts` 的 `ZIWEI_DAY_DIVIDE='current'`（23 點仍屬當日），x-iztro 範例若含 23 點出生要避開或自行換算。
