# 工具頁模板規格（每個工具、每條工作流都照這份做）

> 草稿 v6，2026-10-15，待操作者確認。逐項對照表（模板 vs 冰山正式站）見同名 `.html`；說明書的版面模板見 `TOOL_LESSON_TEMPLATE.html`；DMAIC 來源的閱讀筆記 `TOOL_SOURCES_DMAIC.md`。
> v6 = 每一條程式引用都寫成 `檔:行`，`tests/unit/test_tool_page_template.py` 逐條核對那一行含指定的字（紅 = 模板說的和程式不一樣，不能 commit）；表單格子的來源、上游參數的來源改成程式讀到的；§12 補開關本身；§15 套用計畫。
> v5 = 讀完五頁的程式後核對：`app/(shell)/methods/[id]/page.tsx`、`methods/[id]/run/page.tsx`、`learn/[id]/page.tsx`、`projects/[id]/analyses/[analysis]/page.tsx`、`projects/demo/iceberg/page.tsx`、`components/RunPage.tsx`、`RunHeader.tsx`、`MethodForm.tsx`、`LessonView.tsx`、`AnalysisPage.tsx`、`DemoResult.tsx`、`result/ResultPage.tsx`、`result/ResultChoices.tsx`、`lib/lessons.ts`、`lib/catalog.ts`、`docs/mockups/lessonkit.py`、`mockkit.py`。沒讀：`result/Charts.tsx`、`MethodVisual.tsx` 以外的 `result/*`、`lib/record.ts`、`lib/form-model.ts`。
> M 編號的定義只在 I11（`RESEARCH_LINES_MASTER_PLAN.md:63`）；結果頁九段骨架只在 §3.10（`RESEARCH_LINES_MASTER_PLAN.md:214`）；課程分頁只在 U15（`RESEARCH_LINES_MASTER_PLAN.md:195`）。這裡只引用，不重抄。

## 0. 標準：正式站的冰山模型（2026-10-14 登入後逐頁對照）

| 頁 | 網址 |
|---|---|
| 工具頁 | https://cognitive.aware-wave.com/methods/systems.iceberg_model |
| 填寫頁 | https://cognitive.aware-wave.com/methods/systems.iceberg_model/run |
| 說明書 | https://cognitive.aware-wave.com/learn/systems.iceberg_model |
| 做完的結果頁（填寫頁按「執行分析」產生） | https://cognitive.aware-wave.com/projects/b1964684-7bde-47bf-b64b-6e72e1c9f913/analyses/INTERP-E4B3565C580D48908AB276ACEA078174 |
| 示範結果頁（不花錢） | https://cognitive.aware-wave.com/projects/demo/iceberg |

示意稿（= 規格，I11）：`docs/mockups/iceberg-result-mock.html`、`iceberg-lesson-mock.html`、`workflow-result-mock.html`、`workflow-lesson-mock.html`、`home-mock.html`。

## 1. 不變量（一條不過 = 這個工具不算完成）

| # | 規則 | 為什麼 |
|---|---|---|
| T1 | 每個工具都有：工具頁、填寫頁、說明書（操作者說的三頁），加上填寫頁產生的結果頁，加上一份不花錢的示範結果頁。 | 操作者 2026-10-14「冰山正式站有 3 頁，你不要給我少一頁」。示範結果頁應該是說明書「看一個完整分析頁」按下去的那一頁。現況：只有冰山有示範結果頁（`app/(shell)/projects/demo/iceberg/page.tsx` 寫死讀 `fixtures/demo-iceberg.json`），而且說明書那顆按鈕連冰山都還是佔位（按鈕的 `data-note`：「做完的示範結果頁還在做：先按『用示範案例試一次』，再按『執行分析』」）。 |
| T2 | **單獨就能用（M14）**：表單只問這個工具自己的欄位，不能要求先填一整份別的工具的紀錄。上游紀錄最多是選填的參照。工作流裡由 recipe `bindings` 把上一站的結果帶進同一批欄位。 | 五個為什麼和柏拉圖現在只收整份魚骨紀錄（`five_whys.py:54`、`pareto.py:39`），魚骨只收整份問題陳述（`fishbone.py:75`）。 |
| T3 | **每一格都完整（M13）**：每個看得見的欄位都有 `label`（一句問題）、`hint`（要寫什麼）、`placeholder`（一個例子）。 | 冰山有（`method-input-forms.yaml:27`），四個找原因工具一格都沒有。 |
| T4 | 頁面上的字都來自資料檔，程式不寫方法專屬的字（D14）。 | 一份資料產生示意稿、網站、教材版三種輸出。 |
| T5 | 課文每一句都有 [n]；來源整篇讀完，包括網頁上的圖；讀不到的（付費全文）寫明「未讀」。 | M8；操作者：「有的圖形在網頁上，我沒貼給你，你要自己去看」。 |
| T6 | 沒有「層」的工具，用自己的**單位**套同一副骨架（魚骨的骨頭、柏拉圖的柱子、五個為什麼的每一問）。每個單位必填：`question`（這個單位回答什麼）、`action`（在這個單位上出手做什麼）。**`time`（時間取向）和 `seen`（看得見／看不見）只在來源有定義時填。** | §3.10 只寫了一句「以原生單位套同骨架」。這是對 M2 的修正提案（M2 原文要求每單位都有時間取向和可見性，那是冰山的四層才有的），需操作者同意。 |
| T7 | 留白的欄位不是失敗：結果頁把它列成「證據缺口」，說明該補什麼資料。 | 冰山填寫頁：「留白的層會列成證據缺口」。 |
| T8 | 每一頁、每一段、每一個分頁開頭都有「怎麼讀」和「你要做的」兩行（可為「不用做」），M9。 | 冰山五個頁面全部如此。 |
| T9 | **五個領域各有完整的六個分頁**：這是冰山說明書本來的結構（五顆領域晶片 × 六個分頁，每個領域都看得到六個分頁）。切到任何一個領域，六個分頁的例子都要換成那個領域的；只有「來源」五個領域共用（來源支撐的是工具本身的課文，例子是合成的，D18）。 | 冰山正式站 `/learn/systems.iceberg_model`；操作者 2026-10-15「例子領域……每個都有以下：認識、看例子、怎麼填、看懂結果、教材版、來源」。冰山現況：結構齊全，但字只有前三個分頁隨領域換（認識 20、看例子 10、怎麼填 30 個元素），**看懂結果、教材版的字五個領域相同**，要補。 |

## 2. 工具頁 `/methods/<id>`

| 要有 | 資料在哪 | 誰檢查 |
|---|---|---|
| 麵包屑：工具 › 目的分類 › 名稱 | `methods/registry/method-goal-groups.yaml` | `display_catalog.py`（`GOALS_FILE`） |
| 中文名、英文名、縮寫 | `method-display-metadata.yaml` `name_zh` `name_en` `abbr` | 目錄測試 |
| 卡「它幫你做什麼」：怎麼讀／你要做的；一段話（做什麼、什麼時候用） | 同檔 `blurb_zh` | check-mocks「怎麼讀」規則 |
| 「開始 →」（連 `/methods/<id>/run`，真的空格子） | 頁面元件 | U15 |
| 「第一次用？先上 5 分鐘的課 ↗」（另開分頁，`target=_blank`）。程式現況：沒有課的工具不顯示這顆，怎麼讀那行也少一句（`methods/[id]/page.tsx:26-28`）→ 每個工具都要有課，這顆才會出現 | 頁面元件 | U15 |
| 做完常接：工具名可點。程式現況：下一步不在目錄裡會印「（尚未上架的工具）」，一個都沒有就印「這個工具沒有固定的下一步…」（`methods/[id]/page.tsx:31-33`）→ 契約的 `recommended_next` 只能寫 ACTIVE 的工具 | 契約 `recommended_next` → 目錄 `next` | `next_methods_resolvable` 閘 |
| 用到它的工作流；沒有就寫「目前沒有工作流用到它；它可以單獨用」；平台內部的工作流標「（平台維運用）」（`methods/[id]/page.tsx:37`） | `recipes/validated/*.recipe.yaml` `steps` | 目錄測試 |
| 同一類常用：兩三個同類工具＋「看這一類全部 N 個 →」 | `method-goal-groups.yaml` | 目錄測試 |

## 3. 填寫頁 `/methods/<id>/run`

| 要有 | 資料在哪 | 誰檢查 |
|---|---|---|
| 麵包屑：直接分析 › 〈名稱〉分析；標題「〈名稱〉分析」 | display-metadata | 既有 |
| 右上「怎麼用？先上 5 分鐘的課 ↗」（另開分頁） | 頁面元件 | U15 |
| 一行：工具：〈中文名〉〈英文名〉（〈家族中文〉〈家族英文〉） | display-metadata＋`method-family-display.yaml` | 既有 |
| 狀態列：「還沒執行：填好格子按『執行分析』，按之前不花錢」＋「約 Nk tokens・≈ NT$N」 | `ai_lego/platform/ai_gateway/pricing.py` | `test_pricing.py` |
| 頁的怎麼讀／你要做的（指向說明書「看懂結果」分頁） | 頁面元件 | check-mocks |
| 卡「你的案例」：標題寫幾格、怎麼填；怎麼讀／你要做的；「留白的層會列成證據缺口」（T7） | 頁面元件＋表單檔 | check-mocks |
| 表單每格：問題、提示、例子（T3）。程式現況：格子 = builder 參數 × 紀錄 schema 的 `properties`（`method_form.py:510`），`method-input-forms.yaml` `methods.<id>` 只覆寫每格的問題、提示、例子；該檔 20 筆，四個找原因工具都沒有條目，所以它們的格子只有 schema 的英文名；例子沒寫時自動用示範案例那一格的值當「例：…」（`MethodForm.tsx:116-119`） | `method-input-forms.yaml` `methods.<id>`；例子退路 `method-form-examples.yaml` | **新增** `test_method_form.py` M13 |
| 表單只問自己的欄位（T2）。程式現況：builder 參數名對不到 schema 欄位時，伺服器自動把它當成上游紀錄（`method_form.py:545-547`），網頁再把上游工具的整張表單疊進來（`MethodForm.tsx:58-68`），示範案例則直接附上游做完的紀錄；`_workflow_only` 的工具不出表單（`method_form.py:527`）；T2 之後這個機制只留給選填的參照 | builder 參數＋表單檔 | **新增** `test_method_form.py` M14 |
| 表單欄位就是單位的工具（冰山的四層），格子有分層顏色（`RunPage.tsx:266` `layered={formIsUnits(…)`：整張表單都是課的 `units.items` 單位才算，`lib/units.ts`；有一格不是單位就照一般表單，必填照擋）；其他工具的必填欄位帶 * | 課 `units.items` | — |
| 「手邊有一段描述？貼上，系統先幫你填格子」：先免費比對，不完整才請 AI 起草；「比對並填入」 | 既有 | 既有 |
| 「存到：我的分析裡新的一份／改存到別的案子或分析」 | 既有 | 既有 |
| 三顆：執行分析／用示範案例填入／清空，填我自己的。網址 `#demo` 填預設領域，`#demo=<領域>` 填那個領域（`RunPage.tsx:97`）；說明書的領域晶片會改寫這個連結（`LessonView.tsx:55`）；在案子裡不給示範（`RunPage.tsx:205`） | `method-form-examples.yaml`：`input`（預設領域）＋`sets`（其他四個領域） | `test_method_form.py` 每個領域的例子都過真 builder 和閘門 |
| 按「執行分析」先出「要花多少」框：估計（依你最近 N 次）、最多多少、約幾分鐘；「確認執行」才開始才花錢（`RunPage.tsx:275`） | `/methods/<id>/estimate` | 既有 |
| 結果區（還沒跑）：怎麼讀「按『執行分析』後，九段結果出現在這裡」；「執行之前不花錢；按下去會先說要花多少，你確認才跑」 | 頁面元件 | 既有 |
| 跑完後開結果頁（網址 `/projects/<p>/analyses/<INTERP-…>`），同一份表單留在結果頁頂端，可改可重跑 | 既有 | 既有 |

## 4. 結果頁（九段，§3.10）

| 段 | 要有 | 資料在哪 |
|---|---|---|
| 頁首 | 麵包屑：我的分析 › 〈分析名〉 › 〈名稱〉分析；h1 = 〈名稱〉分析：AI 寫的一句標題；「怎麼用？」；一行：工具・分析名・時間；狀態列：草稿／已核准／已退回・待重做、知識不足（有缺才出）、資料（你填的 N 段話・外部來源 N 筆）、單位完整度 n/n（最薄的單位只有幾句）、約 Nk tokens・≈ NT$N；怎麼讀／你要做的；表單（同填寫頁）。程式現況：沒有課的工具，「能回答／不能回答、三步、只有 30 秒、四個詞」改印在頁首（`RunHeader.tsx:31-37`，U14：讀法只放一個地方） | `RunHeader.tsx`；解讀結果＋紀錄 |
| ① 結論 | 一句話；三個發現，各有：標題、信心（高／中／低）＋理由、內文 [n]；建議 [n]；證據缺口；改判條件（出現什麼證據就改結論）；「你的判斷」：同意／部分同意／不同意＋原話；「沒填也能核准」（M10、D20） | 解讀結果 |
| ② 工具自己的圖 | 由紀錄直接畫的原生圖；每個單位：問題、你填的 [n]、出手方式；★ 建議先出手的單位；圖下「左／中／右各是什麼」一行；「資料厚度（你填了多少）」每單位 ●○○＋一句原因 | `MethodVisual.tsx` `RECORD_PICTURES` 一個工具一筆；單位資料 `evolution/lessons/vN.yaml` `units.items[]` |
| ③ 圖表分析 | 每張圖回答一個問題；圖下固定：怎麼看／看到／（注意）／來源；畫不出來時說原因（圖 A：同一件事的數字不到兩個；圖 B：環節沒有出處）。程式現況（`ResultPage.tsx:415-436`）：每個工具都有圖 A 趨勢和圖 B 因果迴路，由解讀結果產生；圖 A、B 標在哪幾個單位：工具登記了 `homes` 就照它（冰山：趨勢＝模式，迴路＝結構、心智模型），沒登記就照它引用的單位（`ResultPage.tsx:286`）。工具自己的圖（C、D…）登記在 `Charts.tsx` `OWN_CHARTS`（冰山：槓桿對比），畫在 `ResultPage.tsx:442`。**一個工具要有自己的圖，要寫一個圖元件並登記。** | 圖 A、B：解讀結果 `trend`、`loop`；圖 C…：`OWN_CHARTS`；`methods/registry/result-page-shows.yaml` `by_method` 列同一批工具（⑧ 不再推薦它們），產生進 `toolsheets.generated.ts` `RESULT_PAGE_SHOWS`，`ResultPage.test.tsx` 比對兩邊 |
| ④ 一個單位一張卡 | 卡頭：第 n／N、單位名；副標：看得見與否・時間・出手方式（T6：只在有定義時）；這個單位問 → 你填的 [n] → 這代表 [n] → 在這裡出手（效果＋槓桿）→ 對應 ⑦ 的方案（或「沒有方案在這層出手」）→ 資料厚度（你填 N 句・外部 N 筆 → 薄／夠用／最薄＋⑧ 哪個工具可補）。**程式現況：單位有三種來源（`ResultPage.tsx:224-226`）：① 表單欄位就是課的單位（冰山，`lib/units.ts` `unitFields`，`ResultPage.tsx:173`）；② 圖自己的單位（問題陳述三段、魚骨每根骨、五個為什麼每一步、柏拉圖每一項），由伺服器從紀錄算出、存在解讀結果 `picture_units`（schema 1.5.0，`ai_lego/modules/research/picture_units.py`；提示列出這些單位，AI 每個單位寫一段解讀，路徑落在單位成員裡的解讀和引註都算那個單位）；③ 其他分層工具用 AI 綁的層。單位的稱呼由登記的 `unit` 決定（層／段／根骨／步／項），圖的單位沒有深淺，不說「由上往下」「根在第幾」。都沒有才印「這個工具的結果是一張圖，不分層」（`ResultPage.tsx:463`）。副標三項現在固定一起印（`ResultPage.tsx:456`），T6 要改成缺的不印。「對應方案」：這個單位沒有方案、而它是圖 A 的 `homes` 時，印「⑦ C 的追蹤指標（不是方案，是量法）」（`ResultPage.tsx:461`）。** | 單位資料 `evolution/lessons/vN.yaml` → `lib/toolsheets.generated.ts` `UNIT_FACTS`；內容來自解讀結果 `units[]` |
| ⑤ 總結 | 主要發現（標題＋一段 [n]）；建議順序；證據缺口（老實說）：缺什麼、需要什麼資料 [n] | 解讀結果 |
| ⑥ 對照表 | 一列一單位：出手方式、時間取向（有才填）、這個單位問的問題、你的案例 [n]、建議動作；★ 建議列；表下一句。程式現況：每個單位都有 facts 才出「層／出手方式／時間取向」三欄，否則只有「欄位」一欄（`ResultPage.tsx:475`）；標題和表下那句來自工具登記的 `table`（冰山：理解層次對照表，改編自 Anderson & Johnson），沒登記就是「⑥ 對照表」、沒有那句（`ResultPage.tsx:473`、`ResultPage.tsx:479`） | 單位資料＋紀錄；`MethodVisual.tsx` 該工具那筆的 `table` |
| ⑦ 解決方案 | A 三條路比一比（可複選，每條有「已選 ✓／選這條」）：做什麼、見效、成本、持久度、風險、建議；「如果只做一件事，明天就做」；B 行動計畫（長期要看多久：一月／一季／一年；「填入建議」；表：時間、方案、行動、負責人、期限、怎麼證明有效、目標；負責人、期限、目標由你定）；「需要誰點頭」；C 一個指標：現在 [n] → 目標（待你確認）→ 期限；三顆按鈕：「把行動計畫存成任務，設提醒」（存完變「已存成 N 個任務，到案子頁看」）、「N 天後重跑本分析並比較」（排完變「已排在 〈日期〉 重跑」）、「改善了就記進案例庫；沒改善回到 A 重選」（按下去老實說案例庫還沒做，`ResultPage.tsx:128`）；結尾一段：「工具負責想清楚、排出來、盯著看；動手做事的是人。到期時系統提醒你用新資料重跑、前後比較；目標數字由你定，AI 不替你定」 | 解讀結果；`methods/registry/method-human-required.yaml` |
| ⑧ 下一步 | 旅程列（✓ 本工具 → 下一步 → 之後 → 最後 ⑦）；一句「你在哪、下一步為什麼、不做也可以」；三張卡：回答什麼、帶入什麼（自動帶 N 欄＋還要你填 M 欄）、會得到、約幾分鐘・≈ NT$N、「用這次的資料開始 ↗」、「第一次用？先看它做什麼 ↗」；第一張卡標「本工具建議的下一步」；底部五行：看三步的建議順序自己一步步做／串成一次跑完的工作流（還在做，計畫 P3）／不確定選哪個？描述你想知道什麼，系統幫你挑／分析已經夠了，直接去 ⑦／都不做，先核准存檔；結尾一段：每張卡都列出帶入什麼、還要填什麼；按下去在新分頁開預填表單，你確認才執行才花錢；③ 已畫出的圖和這份分析做過的工具不再推薦 | 契約 `recommended_next`；「帶入什麼」伺服器照契約 `inputs` × manifest 算，不經 AI |
| ⑨ 引註 | 每個 [n]：「你的輸入・哪一格：『原文』」或外部來源（網址、抓取時間、指紋）；無外部來源時：「本次沒有外部來源」＋「結論全部建立在你填的 N 段話上，所以信心最高只到『中』。要提高：補真實數字或外部資料，或先在 ⑧ 用〈工具〉往下挖」 | 既有 |
| 核准卡（`#approve`，§3.10 的 (7) 來源列） | 這一頁是 已核准（誰、何時）／模型／費用／檢查（來源 ✓ 層序 ✓ 引註完整 ✓ 無預設結論 ✓ 已拿掉 N 項，每項有人話 tooltip；沒跑的檢查不顯示，不預設 ✓）／你的判斷 尚未填（① 下方）；人話：核准＝成為正式紀錄可匯出可被引用、退回＝寫原因後重做這版保留、刪除＝來源與產出一起刪留一筆已抹除、只有你的租戶看得到；按鈕：核准，存進紀錄／退回並說原因／匯出 PDF／刪除案子或分析／專家模式：閘門表與 JSON／（重做或重跑過）和上一版並排比較；退回時出原因框；已退回時出「依原因重做」；專家模式收合：閘門表（閘門、狀態、證據）＋摘要 JSON＋完整 JSON（`ResultPage.tsx:566-594`） | 既有 |
| 「這份結果要怎麼處理？」（`ResultChoices.tsx`） | 只在這份分析還沒開成案子時出現：「這是 AI 做的分析，不是你的判斷。它現在留在『我的分析』」；三顆：用這份結果開案 →／留在我的分析／永久刪除；一句：開案後這份分析留在案子裡標「AI 做的」，結論由你自己寫 | 既有 |

## 5. 說明書 `/learn/<id>`（頂端卡＋六個分頁，U15）

**說明書的模板以 `docs/TOOL_LESSON_TEMPLATE.html` 為準**：那一頁是用冰山課的產生器（`lessonkit.render`）畫出來的，每個工具要寫的資料換成黃底的欄位說明（310 格），其他字是產生器固定印的、每個工具自動一樣。下表只是摘要。

內容全在 `evolution/lessons/vN.yaml`，`docs/mockups/lessonkit.py` `SHAPE` 檢查格式（缺一項載入失敗），`gaps()` 算 M8 缺口。括號內是 `SHAPE` 的最少數量，冰山實際更多。

| 區 | 要有 | `SHAPE` 鍵 |
|---|---|---|
| 標題列 | 麵包屑：工具 › 〈名稱〉 › 5 分鐘課；h1「〈名稱〉：開始前 5 分鐘」；一句「想直接做按開始；想先學照分頁看」；狀態列：「工具齊備 M1–M10 ✓」或「知識不足：缺 …」、課程來源 N 筆 [1]…[n]、約 N 分鐘；「學完你會：…」；「教材版在『教材版』分頁」 | `minutes` `outcomes` |
| 頂端卡「開始」 | 怎麼讀／你要做的；三顆：開始填我的案例 →（連 `/run`，小字說幾格）、用示範案例試一次（連 `/run#demo`，小字說是哪個例子、已填好）、這工具適合我的問題嗎？（連 `/#ask`，最多三個建議）；「手邊有這些會填得比較快」清單（3）；「這堂課之後不會再自動出現；工具頁右上角『怎麼用？』隨時能打開，另開分頁，填到一半的格子不會不見」 | `start` |
| 領域晶片 | 「例子領域：」五顆：藝術反思／EdD 研究（你的預設）、合作對象、一個決策、電商後台、日常；切換整頁例子一起換 | `methods/examples/domains.yaml`（U21） |
| 分頁列 | 認識 1.5 分／看例子 1 分／怎麼填 1.5 分／看懂結果 1 分／教材版／來源；每個分頁底部「下一個分頁：… →」＋「開始填我的案例 →」 | `mockkit.LESSON_TABS["tool"]` |
| 認識 | 「這是什麼 30 秒」怎麼讀／你要做的；三段：比喻、定義 [n]、什麼時候用／什麼時候不用 [n]；工具的圖（跟結果頁 ② 同一張）：左「每個單位問什麼」、右「在這裡出手會得到什麼」；「這工具能回答」「這工具不能回答」；「各單位，各配一個你領域的例子 1 分鐘」怎麼讀／你要做的 [n]；每單位：問、例（五個領域）；「記法：…」；「例子跟著你進來的那條線走；不會拿你真實填過的案例當教材」（D18） | `what` `units` |
| 看例子 | 「看一個做完的例子 1 分鐘」怎麼讀／你要做的；案例一句；表：單位、填進去的內容、只看這個單位會做什麼（五個領域各一份）；一句總結；「看一個完整分析頁 →」按鈕：預設領域連示範結果頁，其他領域沒有就寫「這個領域的完整結果頁還在做」 | `worked` |
| 怎麼填 | 「怎麼填：N 格，每格一個好例子和一個壞例子 1 分鐘」怎麼讀／你要做的；每格：做法一句、好：…、壞：…（括號寫缺什麼）（五個領域）；「填不出某一格沒關係，留白比硬湊好；工具會列成證據缺口」；「常見錯誤 30 秒」怎麼讀／你要做的；✕ 條目（3）；「自我檢查（30 秒，點開看答案）」（2 題） | `fill` `mistakes` `quiz` |
| 看懂結果 | 「看懂結果：按『執行分析』之後那一頁怎麼讀 1 分鐘」怎麼讀／你要做的；三步讀法 ①②③；「只有 30 秒？看 ① 的一句話和建議就夠」；「N 個詞：」每單位一詞一句；「頁首和九段，每段回答一件事」：頁首＋①～⑨ 各一段；「對照一個做完的結果頁 →」 | `read` |
| 教材版 | 「教材版：給老師／帶領者 同一份資料，另一種排版」怎麼讀／你要做的；課堂流程（45 分鐘）表：分、做什麼、用學員版哪一頁；講稿要點（每步 2–3 句）；討論題（2，冰山 3）；學員最常錯的事，怎麼接（2，冰山 3）；講義與投影片（列印版講義、投影片大綱；匯出還在做）；底部說明：「教材版和學員版由同一份工具資料生成，改課文兩版同步」；藝術反思家族的工具再加一句：帶領腳本（提示用語、時間分段、停止訊號）直接進這一段（D19） | `teach` |
| 來源 | 「課程來源（每段課文的 [n]）」怎麼讀／你要做的；每筆：出處、用了它的什麼、網址（M8：至少 2 個網址，每筆都被課文引用）；「課文由工具自己的資料庫生成並由人審定」 | `sources` |

## 6. 示範結果頁 `/projects/demo/<id>`（不花錢）

- 「我的案子」列出一列「〈示範案例名〉（示範）・工具：〈名稱〉・報表（示範，不花錢）・看示範結果 →」（`components/ProjectList.tsx:89`）。
- 頁面 = §4 的九段，同一支 `ResultPage` 加 `demo` 旗標：頂端一條「示範分析（免費，不花錢）…到〈工具〉填你的格子 →」，會寫入的按鈕按了只出一句說明（`ResultPage.tsx:385-394`）。
- 資料 = 一次真實執行存下來的輸出（display、fields、record、result、gateResults、manifest），從真實執行重產，**不能手寫**（`projects/demo/iceberg/page.tsx:6-7`、fixture 的 `_about`）。所以五個領域各一份 = 每個工具真跑五次。
- 現況：只有冰山，路徑寫死 `projects/demo/iceberg`，資料 `fixtures/demo-iceberg.json`；說明書的「看一個完整分析頁」按鈕現在是佔位，沒有連過去（T1）。**要改成一個通用路徑 `projects/demo/<method_id>`，每個工具一個 fixture，說明書那顆按鈕連到它。**
- 示範結果要跟示範案例是同一個故事，**五個領域各一份**（T9）：預設領域對 `method-form-examples.yaml` 的 `input`，其他四個對 `sets`。說明書切到哪個領域，「看一個完整分析頁」就連到那個領域的示範結果頁。

## 7. 目錄與入口（工具要出現在哪裡）

| 入口 | 資料在哪 |
|---|---|
| 首頁「陪我思考」問句 → 推薦工具（U16 `/#ask`） | `method-goal-groups.yaml` 問句分類 |
| 工具目錄 `/methods`：目的分類、精選、常用 | `method-goal-groups.yaml`、`method-display-metadata.yaml` |
| 工作流 `/workflows` | `recipes/registry/recipe-display-metadata.yaml` |
| 練習 `/me/teach`（TEACH 練習題） | `ai_lego/platform/lessons/lessons/<id>.yaml`＋`HISTORY.json`。**這是另一套課程系統**，跟 `evolution/lessons` 重疊；本規格不合併，先列出。 |

## 8. 一個工具碰到的所有檔案（總表）

| 檔 | 內容 |
|---|---|
| `methods/contracts/<id>.contract.yaml` | 契約：status、inputs、`recommended_next`、`source_of_truth_for` |
| `specs/cognitive/typed-objects/<x>.schema.yaml`＋`tests/contracts/specs/cognitive/typed-objects/<x>.fixtures.yaml` | 紀錄格式與 fixtures；新欄位一律選填 |
| `ai_lego/modules/<family>/<name>.py` | builder＋閘門；T2 的參數 |
| `methods/registry/method-input-forms.yaml` | 表單每格的問題、提示、例子；`_computed` `_inputs` `_params` |
| `methods/registry/method-form-examples.yaml` | 示範案例：預設領域＋四個 `sets` |
| `methods/registry/method-display-metadata.yaml` | 名稱、簡介、why、權威網址 `url` |
| `methods/registry/method-goal-groups.yaml` | 目的分類、同類、精選、問句 |
| `methods/registry/method-visual-kinds.yaml` | 這個工具的通用圖種類（table／quadrant／tree…），② 沒有專屬圖時的退路 |
| `methods/registry/result-page-shows.yaml` | ③ 已經畫了哪些工具的圖，⑧ 不再推薦它們 |
| `methods/registry/method-human-required.yaml` | 哪些欄位 AI 不能代填 |
| `evolution/lessons/vN.yaml` | 說明書六分頁＋每單位的 `result` 資料（④⑥） |
| `apps/cognitive-web/components/result/MethodVisual.tsx` `RECORD_PICTURES`＋一個 `<Tool>.tsx` | 結果頁 ② 的原生圖 |
| `apps/cognitive-web/fixtures/demo-<id>.json` | 示範結果頁資料（§6，待做通用路徑） |
| `recipes/validated/<workflow>.recipe.yaml` | 工作流才有：每站 `bindings` |
| `docs/mockups/*.html` | 示意稿 = 規格；新工具先出示意稿 |

## 9. 工作流頁（六標準差 DMAIC、8D、A3）

- 工作流也有自己的頁：目錄頁（`/workflows`）、總覽頁（站列＋走法）、每站同九段、總結頁、說明書，格式照 `workflow-result-mock.html`、`workflow-lesson-mock.html`（M11、§3.10）。說明書分頁：認識／各站／看例子／怎麼走／看懂總覽／教材版／來源（`LESSON_TABS["workflow"]`）。
- 每站 = 一個工具；站卡有「先看 5 分鐘的課」，點進去是那個工具自己的頁。工作流不重寫工具內容（D25）。
- 站卡列出「帶入什麼／還要你填什麼」：由 recipe `bindings` 算，帶不到的標紅。
- 工作流裡缺的工具先照 §2–§6 做完整，再串。

## 10. 做一個工具的固定步驟

1. 讀來源整篇含圖；筆記寫檔；未讀處註明（T5）。
2. 示意稿：從冰山兩份示意稿複製，換成這個工具的資料，先給操作者看（I11）。新頁面要登記進 `mockkit.FILES`、`build-artifact.py OUT_NAME`、`render-mocks.cjs FILES`；樣式只改 `design-system.css`，跑 `sync-design-system.py`（`RESEARCH_LINES_MASTER_PLAN.md:328`）。
3. 資料：§8 全表逐檔填。
4. builder：能單獨用（T2）；新欄位選填。
5. 檢查全綠：
   - `python docs/mockups/check-mocks.py`；`node docs/mockups/render-mocks.cjs <out>` 看桌機／手機／深色切片；`node docs/mockups/chips-test.cjs`
   - `python -m pytest tests/unit/test_method_form.py tests/unit/test_method_form_examples.py`
   - SPEC 端：`python tests/run_golden_tests.py`；`python tests/gen_spec_index.py --check`（在 `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/`）
   - `npx tsc --noEmit`；`npx vitest run components/result lib`
   - `python scripts/affected_tests.py --run`
   - e2e：`lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/*.spec.ts`（`COS_TEST_MOCK_API=1` 假 API；真模型另跑）
6. 預覽給操作者；操作者說好才 `python -m ai_lego.apps.cli.evolution promote --kind lessons --version vN --evidence <file>`。
7. 部署是 High risk：先問。

## 11. 新增檢核（加進 I11 的 M 清單）

- **M13** 填寫頁每個看得見的欄位都有問題、提示、例子。
- **M14** 工具能單獨用：沒有參數是一整份上游紀錄（`_workflow_only` 除外）。
- 兩項都由 `test_method_form.py` 機械檢查，**範圍 = 有課的工具**（`evolution/lessons` champion 裡列的；現況 `evolution/lessons/v1.yaml` 的 `methods` 只有冰山一筆，所以一開始只擋冰山，每加一課多擋一個工具）：紅就不能 commit，是硬閘，不是「知識不足」提示。沒課的工具本來就顯示「知識不足（這個工具還沒有課）」，不另外標。
- **M2 修正提案**（T6）：介入動詞必填；時間取向、可見性只在來源有定義時填。
- **lessons v2 的格式要加（T9）**：
  - 看懂結果：用那個領域的示範結果講一遍三步讀法（① 一句話是什麼、★ 在哪個單位），以及「對照一個做完的結果頁」連到那個領域的示範結果頁。五個領域各一份。
  - 教材版：破冰題、講義上的範例案例、討論題裡的例子。五個領域各一份。
  - 冰山也要補這兩份，才算符合 T9。

## 12. 程式裡寫死冰山的地方（2026-10-15 已改成登記，§15.1 第 1 項）

不變量：`ResultPage.tsx` 沒有任何以方法 id 分岔的程式；工具之間的差別只來自兩處登記和課的單位資料。新工具要不一樣，就加一筆登記，不改 `ResultPage`。`ResultPage.test.tsx` 用魚骨跑完九段，頁上不能出現冰山的字。

| 原本寫死的 | 現在由誰決定 |
|---|---|
| 填寫頁只有冰山有分層顏色（`RunPage.tsx`） | 整張表單都是課的單位時才有（`lib/units.ts` `formIsUnits`） |
| ② 標題「冰山圖：你的問題在四層各是什麼」；冰山圖本身 | `MethodVisual.tsx` `RECORD_PICTURES` 冰山那一筆（`heading`、`caption`、`draw`），和魚骨等四個工具同一條路 |
| ③ 圖 A、B 的「（第 2 層）」「（第 3、4 層）」 | 同一筆的 `homes`；沒登記的工具照引用算 |
| ③ 圖 C 槓桿對比、圖的張數、結尾那句 | `Charts.tsx` `OWN_CHARTS`（`shows`、標題、讀法、來源）＋同一筆的 `parts`；`result-page-shows.yaml` 必須列同一批（測試比對） |
| ④ 「⑦ C 的追蹤指標」那一行 | 圖 A 的 `homes` 那個單位 |
| ⑥ 標題、表下那句；動作句的「四列」 | 同一筆的 `table`；列數照單位數 |
| 示範分析的提示寫死「冰山模型」 | 工具名稱 |
| `docs/mockups/lessonkit.py` `DRAWN` | 不是寫死：它是「圖由程式畫、單位固定」的工具登記表，冰山是目前唯一一筆；新工具的圖若固定單位就加一筆 |
| `app/(shell)/projects/demo/iceberg/page.tsx` 示範結果頁 | 還沒改：§15.1 第 3 項 |

這些字放在登記裡（程式檔），不放課的資料：它們描述的是程式畫的那張圖，和圖放在一起才不會兩邊不同步；課的資料（`evolution/lessons`）要升版才能改，promote 要操作者同意。

已經通用、不用改：`UNIT_FACTS`／`KNOWLEDGE_GAPS`（`toolsheets.generated.ts`）、`lessonkit.render`、`RunHeader`、`RunInputCard`、`ResultChoices`、`DemoResult`；⑨ 的「N 段話」用層數，沒層就寫「內容」。

## 13. 既有的機械檢查（新工具一定會被這些擋）

- `check-mocks.py --page result`：結果頁每張卡的標題、標籤、按鈕要和示意稿一致（`ResultPage.tsx:23`）；`check_lesson`、`check_common`：說明書六步、怎麼讀／你要做的、晶片逐組、無 `<select>`。
- U14：讀法只放一個地方（有課 → 說明書「看懂結果」；沒課 → 頁首）（`RunHeader.tsx:13`）。
- `lessonkit.validate`：說明書資料缺一項不載入；`DRAWN` 的單位鍵順序；每個 [n] 都要有來源。
- `test_method_form.py`、`test_method_form_examples.py`：每個看得見的欄位有中文標籤；每個領域的示範都過真 builder＋閘門；JS 序列化一致。
- `next_methods_resolvable`、`citation_integrity`、`visual_bindings_resolvable`、`detail_integrity`、`no_preset_conclusion`：結果頁的五個閘。

## 14. 已知沒解決、要操作者決定

1. 兩套課程系統：`evolution/lessons`（本規格）和 TEACH `ai_lego/platform/lessons`（練習頁）。要不要合併、何時。
2. 示範結果頁路徑寫死冰山（§6）；做第二個工具前要先改通用。
3. 手機上工具的圖整張縮小、字很小（加 `min-width` 會被 check-mocks `responsive` 擋）；結果頁手機版要另一張卡，不在這裡放寬規則。
4. ISO 13053-1／-2 全文付費未讀，課文只能引用目錄頁的摘要。
5. 目錄裡已經有一個單一工具 `learning.dmaic`（一張紀錄、五段各一句摘要；來自藝術治療缺口清單 2026-09-13，`methods/contracts/learning.dmaic.contract.yaml`），和「DMAIC = 工作流」撞名。建議：DMAIC 工作流的總結站寫它的 `DmaicRecord`，`learning.dmaic` 的頁面就是那個總結站，不另留一張五格表單。要操作者決定。
6. 8D、A3 的來源還沒讀（T5）；§15.3 的站表只是從工具目錄對出來的草稿。A3 本身是一張紙的排版，建議做成工作流總覽頁的一種排版而不是新工具。要操作者決定。

## 15. 套用計畫（四個工具、三條工作流，照這個順序）

### 15.1 做第二個工具之前一次做完的共用前置（不做，每個工具都會再寫死一次）

| # | 事 | 檔 | 驗 | 建議模型 |
|---|---|---|---|---|
| 1 | §12 的冰山分支改成登記／單位資料 | 同 §12 | 已做（2026-10-15）：`ResultPage.test.tsx` 魚骨跑九段、無冰山字、`check-mocks.py --page result` 綠 | — |
| 2 | ④⑥ 的單位可以來自圖的單位（單位不是表單欄位的工具） | `picture_units.py`、schema 1.5.0、`ResultPage.tsx` | 已做（2026-10-15）：`ResultPage.test.tsx` 魚骨兩根骨 → 兩張卡、⑥ 兩列、★、`check-mocks.py --page result` 綠；`test_picture_units.py` 四工具 | — |
| 3 | 示範結果頁通用路徑 `projects/demo/<method_id>`，fixture 一個工具一個領域一份 | `app/(shell)/projects/demo/`、`fixtures/demo-<id>.json`、`components/ProjectList.tsx:89` | e2e 開五個領域的示範頁 | Opus 5.5 |
| 4 | M13／M14 進 `test_method_form.py`（範圍 = lessons champion） | `tests/unit/test_method_form.py` | 冰山綠；故意拿掉一格 hint 變紅 | Sonnet 5.5／Codex（步驟已寫死） |
| 5 | lessons v2 格式（T9：看懂結果、教材版 五個領域各一份）＋ `SHAPE` | `evolution/kinds.yaml`、`evolution/lessons/v2.yaml`、`lessonkit.py` | `lessonkit.validate`；冰山先補齊再 promote | Fable 5.1（格式）→ Haiku 5.5（填字） |
| 6 | 本模板的引用檢查 | `tests/unit/test_tool_page_template.py` | 已做（v6） | — |

### 15.2 四個工具逐一套用（每個 = §8 的 14 個檔 ＋ §10 的 7 步；一個做完、操作者看過三頁預覽，才做下一個）

| 工具 | 單位（④⑥ 一單位一卡；T6 只填 question＋action，四個都沒有時間取向／可見性） | ② 原生圖 | 單獨用的格子（T2） | 上游（改成選填參照） | 已有 | 還缺 |
|---|---|---|---|---|---|---|
| 問題陳述 `framing.problem_statement` | 現況／期望／差距（schema `content` 三段） | ProblemGap（`MethodVisual.tsx` `RECORD_PICTURES` 已登記） | `current_state`、`expected_state`、`gap`（契約 `required` 空，本來就單獨用） | 無 | 契約 ACTIVE；示範 5 領域（`method-form-examples.yaml` `input`＋4 `sets`）；圖；TEACH 練習課 `ai_lego/platform/lessons/lessons/framing.problem_statement.yaml` | `method-input-forms.yaml` 條目（M13）；`evolution/lessons` 的課；示範結果 fixture ×5；§15.1 之後的 ④ 卡 |
| 魚骨 `root_cause.fishbone` | 每根骨（`suggested_categories`；JMP 例是人機料法環五骨）＋骨上的假設 `hypotheses[]` | Fishbone（已登記） | 問題一句 `problem_summary`、類別、假設清單 | 問題陳述紀錄（契約 `required: ProblemStatement`；`fishbone.py:75` 收整份紀錄 → 改成文字欄位＋選填 ref） | 契約；示範 5 領域；圖 | 同上＋T2 改法＋M14 |
| 五個為什麼 `root_cause.five_whys` | 每一問（`why_chain[]`：問、答、證據） | WhyChain（已登記） | 要驗證的假設一句 `target_hypothesis_statement`、為什麼鏈、停止條件 | 魚骨紀錄（`five_whys.py:54` → 選填） | 契約；示範 5 領域；圖 | 同上 |
| 柏拉圖 `root_cause.pareto` | 每根柱（`causes[]` 配 `dataset` 的次數） | ParetoChart（已登記） | 原因清單、計量名 `metric_name`、每因次數、門檻 `vital_few_threshold_percent` | 魚骨紀錄（`pareto.py:39` → 選填） | 契約；示範 5 領域；圖 | 同上 |

順序：問題陳述（沒有上游，最簡單）→ 魚骨 → 五個為什麼 → 柏拉圖 → 找原因工作流頁（recipe `recipes/validated/root-cause-analysis-v1.recipe.yaml` 已有四站 `bindings`，照 §9 做總覽頁＋說明書）。每個工具的資料檔（表單條目、示範、課文）用 Haiku 5.5 填；builder 改法、圖、頁面用 Opus 5.5；課文的來源要先讀整篇含圖（T5）。

### 15.3 三條工作流的站 → 工具（有的直接串；缺的先照 §2–§6 做成完整工具，再串）

DMAIC（來源：ASQ S1、GoLeanSixSigma S4、JMP S8，筆記 `TOOL_SOURCES_DMAIC.md`）：

| 站 | 做什麼（來源） | 目錄裡的工具 | 缺 |
|---|---|---|---|
| 定義 Define | 專案章程：問題陳述、業務理由、目標、時程、範圍、團隊（S4 章程圖；S8 fig01）；顧客需求 VOC（S1、S6：Six Sigma 的起點）；SIPOC（S4） | `framing.problem_statement`、`systems.sipoc` | 專案章程、VOC |
| 測量 Measure | 現況流程圖（S4）；量測系統分析 MSA（S8 fig04 %GR&R）；基線＋製程能力 Cpk（S8 fig03）；資料蒐集計畫（S4） | `systems.flowchart` | MSA、基線／能力、資料蒐集計畫 |
| 分析 Analyze | 魚骨 → 五個為什麼 → 柏拉圖（S4、S8 fig05–07）；FMEA（S1、S8） | `root_cause.fishbone`、`root_cause.five_whys`、`root_cause.pareto`、`challenge.fmea` | — |
| 改善 Improve | 對策選擇；試點後再全面實施（S4）；實驗設計 DOE（S8 fig12）；5S（S4） | `decision.weighted_decision_matrix`、`experiment.pilot` | DOE、5S |
| 控制 Control | 監控與回應計畫：指標、觸發線、回應清單（S4 圖）；管制圖 SPC（S8 fig22）；交接給流程負責人；結案總結 | `learning.after_action_review` | 監控與回應計畫、管制圖、交接 |

缺的 9 個站先各做成一個完整工具（§2–§6）再串；每站的「帶入什麼」由 recipe `bindings` 算（§9）。總結站寫 `DmaicRecord`（§14 第 5 項）。

8D（來源未讀，T5；下表從目錄對出來，課文前先讀來源）：D0 準備＋緊急應變（缺）；D1 團隊 `stakeholders.raci`；D2 問題描述 `framing.problem_statement`＋`framing.five_w_one_h`；D3 暫時圍堵（缺）；D4 根因 = 三個找原因工具；D5 永久對策 `decision.weighted_decision_matrix`；D6 實施並驗證 `experiment.pilot`；D7 預防再發 `challenge.fmea`＋控制計畫（缺）；D8 結案 `learning.after_action_review`。

A3（來源未讀，T5）：一張紙七格——背景、現況、目標、根因分析、對策、計畫、追蹤。背景＋現況＋目標 = 問題陳述三段；根因 = 找原因工具；對策 = 加權矩陣；計畫 = 結果頁 ⑦ B；追蹤 = ⑦ C＋控制計畫（缺）。A3 本身是總覽頁的排版（§14 第 6 項）。

### 15.4 完成定義

一個工具 = §1 T1–T9 全過＋§10 第 5 步全綠＋操作者看過三頁預覽＋示範結果五份都是真跑。一條工作流另加：recipe `bindings` 帶得到每站必填（帶不到標紅）、總覽頁與說明書的示意稿過 `check-mocks.py`。部署 High risk：先問。
