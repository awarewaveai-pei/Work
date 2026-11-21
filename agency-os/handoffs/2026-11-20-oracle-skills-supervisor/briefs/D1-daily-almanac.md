# D1 每日運勢：黃曆資料加料（批 6b）

來源：本站已安裝的 `lunar-javascript`（MIT）尚未用到的功能：九星、二十八宿、彭祖百忌、喜神／財神／福神方位、胎神、沖煞、建除十二值、吉神凶煞。直接讀 `node_modules/lunar-javascript/lunar.js` 與本站 `types/lunar-javascript.d.ts`（缺的型別補上）。
已知該庫三處與通行寫法不同的字：胃宿動物作「彘」（通行「雉」）、壁宿作「獝」（通行「貐」）、彭祖百忌「壬不泱水」（通行「汲」）。顯示前改正，改正表放在單一處並寫明依據。
現況：`lib/daily.ts`（八字喜用神＋宜忌前五項）、`components/DailyTool.tsx`、`lib/zeri.ts`。

做：
1. `lib/daily.ts` 的結果加上上列欄位（當日的、與出生資料無關的部分另成一個純函式，可單獨測）。該庫輸出簡體，經 `lib/s2t.ts` `localize`；缺字補進對照表。
2. 頁面分兩區：個人化（既有）與當日黃曆（新增）。英文介面：術語各自寫英文說明，不直譯硬湊；無通行英譯的保留中文並附一句解釋。
3. facts 加當日黃曆重點（注意 60 條上限）。
4. 測試：一個固定日期的全部新欄位快照；三個改正字各一例。

檔案：`lib/daily.ts`、`lib/daily.test.ts`、`lib/s2t.ts`、`types/lunar-javascript.d.ts`、`components/DailyTool.tsx`、`messages/*.json`。
