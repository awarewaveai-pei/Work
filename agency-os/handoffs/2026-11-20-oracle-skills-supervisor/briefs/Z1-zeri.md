# Z1 新系統：擇日＋各頁口徑標示

先讀 `COMMON.md`。`voidforall/fengshui.skill` **沒有授權**：只看它擇日問哪些輸入，規則自己寫。

## 問題
- 站上沒有擇日。`lunar-javascript` 已提供每日宜忌、建除十二值、黃黑道、沖煞（`lib/daily.ts` 已用 `getDayYi()`／`getDayJi()`，型別在 `types/lunar-javascript.d.ts`）。
- 套件輸出簡體；簡→繁逐字表 `S2T` 與 `localize` 目前私有在 `lib/bazi.ts`，只涵蓋十神／生肖／十二長生／納音用字。
- 八字頁、風水頁沒有寫明採用的流派口徑（奇門頁已有 `qimen.method` 一行可參考）。

## 要做的
1. 新檔 `lib/s2t.ts`：把 `lib/bazi.ts` 的 `S2T`＋逐字轉換搬出成共用函式（`bazi.ts` 改 import，不留副本；`lib/qimen/ju.ts` 的節氣名轉換若可併入同一張表就併，不可就不動並說明）。補上本卡會顯示的宜忌詞、建除、天神、沖煞用字。
2. 新檔 `lib/zeri.ts`（純函式）：輸入 `{ activity, from, to（最長 92 天）, birthYear? }` → 逐日算 `{ date, lunarDate, ganZhi, zhiXing（建除）, tianShen＋黃道／黑道, chong（沖的生肖）, yi 是否含該事項, ji 是否含該事項, verdict: 'good'|'ok'|'avoid', reasons[] }`。判定規則寫在檔頭並固定一種：`avoid`＝忌含該事項，或日沖居住者生肖（`birthYear` 用 `lib/liChun.ts` 取立春年→年支）；`good`＝宜含該事項且黃道日且不犯前者；其餘 `ok`。事項（按鈕）：入宅、搬家、開市、動土、嫁娶、出行、簽約、安床——各對應套件的宜忌詞（對應表寫成常數，找不到對應詞的事項不要硬湊，回報）。
3. `lib/divination/systems/zeri.ts`：`meta: { id: 'zeri', kind: 'chart', requiresApiKey: false }`；facts＝事項、區間、`good` 日清單（最多 10 天，每天一條含干支／建除／天神／沖）、被排除的主要原因統計。守 60 條與 `MAX_VALUE = 300`。
4. `components/ZeriTool.tsx`＋`app/[lang]/zeri/page.tsx`：事項按鈕、起訖日期、（選填）出生年；結果列出 `good` 日（可展開看 `ok`／`avoid` 與原因）；`components/AiReading.tsx`。
5. 新增系統照 `lib/divination/types.ts` 檔頭寫的步驟：`SYSTEM_IDS`、`FRAMING`、register、`lib/site.ts` `PAGE_SLUGS`、首頁 `GLYPHS`、`messages` 的 `nav.zeri`／`hub.zeriDesc`／頂層 `zeri`。`FRAMING`：依 facts 的吉日清單說明各日適合的原因與當天注意事項；不恐嚇，不說「非此日不可」。
6. 口徑標示（每頁一行小字，字串進 `messages`，繁中／英文）：
   - 八字頁：晚子時（23:00–24:00）日柱算當日；大運歲數為虛歲；喜用神採扶抑法。寫之前用 `lunar-javascript` 實測 23:30 出生的日柱確認第一項屬實，不屬實就照實測寫並回報。
   - 風水頁：沈氏玄空；兼向門檻離本山中線 4.5°，兼向用替卦；只有日期時立春當日算新年。
   - 擇日頁：宜忌與神煞取自 `lunar-javascript` 的通書資料與本頁判定規則。

## 檔案
上列新檔＋第 5 點的清單項＋`lib/bazi.ts`（只動 S2T 搬移）、`components/BaziTool.tsx`／`components/FengshuiTool.tsx`（各加一行口徑）、`types/lunar-javascript.d.ts`（補用到的方法）、`messages/*.json`。

## 既有資料
無儲存資料。`lib/bazi.test.ts` 的繁體用字測試（30 納音／十二長生／十神／生肖）須仍綠。

## 測試（只寫這些）
- `s2t`：本卡事項對應詞、十二建除、十二天神輸出皆為繁體（列完整名單斷言）。
- `zeri`：固定一段日期，`good`／`avoid` 各一個以套件原始輸出手核的日子；帶 `birthYear` 時沖該生肖的日子為 `avoid`；區間超過 92 天拋錯。

## 不要做
不做時辰擇吉、不做個人八字喜用入擇日、不接風水飛星、不存查詢紀錄。
