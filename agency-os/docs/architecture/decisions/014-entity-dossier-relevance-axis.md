# ADR 014: 背景調查是「實體」不是「查詢」；相關性是蒐集的第二條獨立品質軸

- **狀態**：已接受（操作者 2026-09-20 決定：「我要最完善完整的工具，1-3 項都要處理妥當」）
- **日期**：2026-09-20
- **管轄**：agency-os 命名空間（3 位數）。延伸 [ADR 011](011-collection-ingestion-boundary.md)（Signal/Corpus/Evidence 三分）與 [ADR 013](013-open-web-discovery-into-corpus.md)（查詢驅動 discovery 可進 Corpus）。

## 脈絡

ADR 013 落地的 `collect/web-search` 把「一句問題」變成一批網址，交給既有 crawler。實測（run `manual-2026-09-20051728`，seed「Theo Farrell」）：

```
fetched=190 written=161 dirty=23 quarantined=3 disallowed=1 stopped_by=budget
資料夾內 2 筆；未分類 159 筆（141 penguin.com.au 目錄頁、16 uow.edu.au 導覽頁、2 rusi.org 政策頁）
```

三個各自獨立的缺口，合起來讓一次人名搜尋變成兩個網站的整站抓取：

| 缺口 | 位置 | 後果 |
|---|---|---|
| 搜尋結果沒有 `depth`，被 `as unknown as Target[]` 蓋掉 | `collectors/web-search.ts` | 深度比較全是 `NaN`，恆為 false，**搜尋那一支的深度上限等於不存在**，只有 budget 擋得住 |
| 品質閘沒有相關性軸 | `lib/collect/quality.ts` | `penguin.com.au/browse/romance` 正文夠長、密度夠高、非 soft-404 → 判定合格入庫 |
| 歸檔條件只認直接命中 | `sinks/kb.ts` | 下一跳的文件沒有 `searchQuery`，159/161 落進未分類 |

附帶發現：`collect/http-html` 宣告的 per-source `maxDepth` 選項**全 repo 沒有任何讀取點**（`run.ts` 對所有來源傳同一個全域 2）。UI 上是個不會動的旋鈕。

## 決策

1. **背景調查的工作單位是實體（人／公司／事件），不是查詢。** 新積木 `collect/entity-dossier`：一個實體名 → 多角度查詢展開 → 每個結果只讀該頁。角度是**資料**（`lib/collect/search/query-plan.ts` 的 `ANGLES`），不是分支；新增一個角度是一列，不是一段程式。
2. **相關性是與抽取品質並列、互不取代的第二條軸。** `lib/collect/quality.ts` 問「抓到的是正文還是導覽列」；`lib/collect/relevance.ts` 問「這篇是不是在講這個對象」。兩者不得互相借用門檻或詞彙（比照 ADR 011 §決策 14 對 extraction quality 與 evidence quality 的切分）。
3. **相關性閘由 orchestrator 擁有，不由積木自評**（同 quality.ts 的理由：自評必然寬鬆）。積木只負責在 Target 上蓋 `meta.entity`。
4. **`off_entity` 是獨立 bucket，不算 refusal。** 搜尋引擎回不相關的頁面是正常的；併進 `dirty` 會讓正確行為觸發告警，然後告警被調低，然後真的壞掉時沒人知道（同 ADR 011 對 `disallowed` 的論證）。migration `0090`。
5. **同名消歧靠操作者的定位詞（anchors），預設嚴格。** 有填定位詞卻一個都沒出現 = 拒收。關掉嚴格模式的頁面標為 `weak` 並在 UI 上以琥珀色標示，不是靜默收下。
6. **搜尋結果是 root 不是 hop**（`depth: 0`，豁免深度上限），這樣「只讀這幾頁、一個連結都不跟」（`maxDepth: 0`）才表達得出來。
7. **每一份文件帶著「為什麼它在這個檔案夾裡」**：命中的名字、定位詞、命中次數、命中片段寫進 `cs_knowledge_sources.metadata`，列表直接顯示。六個月後沒人會去開 run report。

## 後果

- 既有來源行為**逐位元不變**：相關性閘只在 Target 帶 `meta.entity` 時啟動，深度語意保持 `maxDepth` = 頁面層數（2 = 入口頁 + 一層），`off_entity` 空陣列。
- `collect/web-search` 的 `maxDepth` 選項預設 0（只讀結果頁）。要爬站請用 `collect/http-html`，那才是它的工作。
- 新增第三家搜尋引擎仍是 `lib/collect/search/drivers.ts` 一個 entry——該檔從 `web-search.ts` 抽出，兩個積木共用同一份 driver map。
- 未解：**JS 渲染頁（大學 Pure portal、多數機構名錄）目前讀不到**。prod 容器 `printenv FIRECRAWL_API_KEY` = exit 1，渲染階沒開，所以 `scholars.latrobe.edu.au/tgfarrell`（本案最權威來源）被判 `too_short`。已改成 `too_short_no_heavier_tier`，讓「這頁沒東西」與「沒有東西讀得了這頁」在報告裡分得開；要真的讀到需要操作者開通渲染供應商帳號。
