# B1 八字：大運流年＋神煞＋合沖刑害＋古籍依據

先讀 `COMMON.md`。參考：`jinchenma94/bazi-skill`（MIT）的 `references/dayun-rules.md`、`shensha-table.md`、`classical-texts.md`、`wuxing-tables.md`、`scripts/pai_pan.py`（對照用）。

## 問題
- `computeBazi` 只回四柱、十神、納音、強弱、喜忌、格局（`lib/bazi.ts:58-64`）；沒有大運、流年、神煞、地支合沖刑害、十二長生。
- AI 拿到 12 條事實（`lib/divination/systems/bazi.ts:8-21`），角色框架只有一句（`lib/ai/prompts/systems.ts:18-22`），深度解讀沒有材料。

## 已知事實
- 排盤用 `lunar-javascript`（`lib/bazi.ts:99` 起）。它本身有大運（`EightChar.getYun(gender)`）、十二長生（`getDayDiShi()` 等）、空亡（`getDayXunKong()` 等）。**先查該套件實際 API（`node_modules/lunar-javascript`），有的就用，不重寫。**
- 強弱與喜忌是扶抑法（`lib/baziAnalysis.ts:75-126`），本卡不改演算法。

## 要做的
1. `lib/bazi.ts`：`BaziResult` 加 `luck`（起運歲數、順逆、八步大運各自干支＋起訖歲與年份、目前所在大運、今年流年干支；「今年」由呼叫端傳入日期，預設現在，測試可注入）、`diShi`（四柱十二長生）、`xunKong`（日柱空亡）。
2. 新檔 `lib/baziRelations.ts`（純函式）：四柱天干五合、地支六合／三合／六沖／三刑／相害，回結構化清單。
3. 新檔 `lib/baziShensha.ts`（純函式）：常用神煞（天乙貴人、文昌、桃花、驛馬、華蓋、羊刃、祿神、將星），以日干或年支／日支查表；每個神煞註明查法來源（典籍名）。
4. `lib/divination/systems/bazi.ts` 的 `toContext` 加入上列事實（穩定英文 label；總數守 `MAX_FACTS = 60`）。
5. `lib/ai/prompts/systems.ts` 只改 `bazi` 一項：要求依序寫 日主與格局 → 喜忌 → 合沖刑害 → 神煞 → 目前大運與今年流年 → 具體建議；每段引用 facts 的干支／十神／神煞名；不恐嚇。繁中、英文各自寫。
6. `components/BaziTool.tsx`：加大運列（八步，標出目前這步）、神煞與合沖刑害兩小塊。字串進 `messages/*.json` 的 `bazi` 區塊。
7. `lib/daily.ts` 用 `systemId: 'bazi'`（`lib/daily.ts:129`）：確認改了 bazi 框架後每日運勢的提示詞仍合理；不合理就回報，不要自行另開系統 id。

## 檔案
`lib/bazi.ts`、`lib/bazi.test.ts`、`lib/baziRelations.ts`＋test（新）、`lib/baziShensha.ts`＋test（新）、`lib/divination/systems/bazi.ts`、`lib/ai/prompts/systems.ts`（只動 bazi 項）、`components/BaziTool.tsx`、`messages/*.json`（只動 `bazi` 區塊）、`THIRD_PARTY_NOTICES.md`。

## 既有資料
無儲存資料。`BaziResult` 只加欄位不改既有欄位；`lib/bazi.test.ts`、`lib/baziAnalysis.test.ts`、`lib/daily.test.ts` 須仍綠。

## 測試（只寫這些）
- 大運：男陽年順排、女陽年逆排各一個已知命例，起運歲數與前三步干支對得上（命例來源寫在測試註解；可用 `pai_pan.py` 輸出交叉核對，核對結果寫進 TESTS 行）。
- 合沖刑害：每類一例。神煞：每個神煞一例。

## 不要做
不改扶抑法；不加調候／從格；不加合婚（另一張卡 H1 在做，檔案不重疊）；不動其他系統。
