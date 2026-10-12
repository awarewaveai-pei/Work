# AI 按鈕改寫成程式：盤點（2026-10-12）

操作者原則（2026-10-12）：「盡量不要用到AI 能用寫程式 就用寫的」。點數照 AI 實際用量扣（ADR 015），所以少一次 AI 呼叫，就少花一次錢。

盤點在 2026-10-12 完成；A 類 12 個經操作者核准，同日改成程式（第 1a 節）。其餘照「先做」的順序動工。

## 錢實際花在哪（正式站 `ai_usage`，到 2026-10-12）

| 用途 | 次數 | 平均輸入／輸出 token | 合計 |
|---|---|---|---|
| 直接分析的工具結果頁（interpret，例：冰山模型） | 8 | 13,000／5,478 | 147,824 |
| 研究報告彙整（synthesis） | 4 | 約 15,100／4,100 | 77,140 |
| 工具草稿、配方草稿（draft） | 4 | 約 5,000／2,000 | 30,383 |
| 41 個積木 AI 按鈕（全部） | 7 | 約 1,500／1,000 | 17,019 |

**結論：最花錢的是「直接分析」的工具結果頁，一次約 18,500 token，是積木按鈕一次的 7 倍。** 所以先處理它（下面第 3 節），再處理積木按鈕。

## 1. 積木的 41 個 AI 按鈕

分類：
- **A 改成程式**：不用 AI，也不扣點。
- **B 先用程式**：程式先給結果，AI 變成另外一顆「請 AI 再看」的按鈕。
- **C 需要 AI**：要讀懂一段話或換句話說，程式做不到。

| 按鈕（`ai_lego/platform/ai_actions/`） | 它在做什麼 | 分類 | 程式怎麼做 |
|---|---|---|---|
| ACT.trend `act.py:81` | 整理觀察紀錄的數字趨勢 | **A** | 數字本來就是結構化記的：每個數字算第一筆→最後一筆、差多少、哪幾天；只記一次的列成「只記一次」 |
| ACT.flag `act.py:67` | 指出哪些任務做了不能反悔、會影響誰 | **A** | 任務卡上人自己已經勾「能／不能反悔」，開案也寫了誰受影響：直接列出來 |
| GOVERN.explain `govern.py:30` | 用白話解釋一個設定 | **A** | 每個設定寫好一段固定說明（設定只有十幾個），不用每次叫 AI |
| VERIFY.summary `verify.py:266` | 白話說主張帳本 | **A** | 帳本本來就是系統排的（狀態＋支持／反對的出處數），套句型就好 |
| VERIFY.next `verify.py:306` | 還該查什麼 | **A** | 查核的順序是固定的（誰先說、別處怎麼報、最早的原文）；系統知道哪些方向已經查過，列出還沒查的 |
| MAP.method `map.py:171` | 推薦 3 個拆法 | **A** | 已經有程式版：首頁「幫我挑」的比對（`components/StuckBox.tsx` pickTools）＋按目的排序 |
| MAP.place `map.py:105` | 把外化卡放進六層 | **A** | 卡片分類本來就決定層：事件→事實；你跟自己講的故事、別人的聲音→解釋；恐懼、期待→利益；人物關係與權力→結構；感受、身體反應、直覺由人自己放；人都可以改 |
| COMPUTE.explain `compute.py:223` | 解釋計算結果 | **A** | 結果和「哪個數字影響最大」本來就是程式算的；用句型說出來 |
| LEARN.compare `learn.py:67` | 當初和後來並排 | **A** | 並排表和「你自己做到的」已經是程式在做（回顧頁），這顆按鈕重複 |
| LEARN.mirror `learn.py:97` | 把每日校準卡照原話還給你 | **A** | 一張短卡照原話還回來，直接顯示就好 |
| THINK.ask_conclusion `think.py:380` | 要求你自己下結論 | **A** | 是一組固定的問題（結論、依據、什麼會改變它），做成題目卡 |
| THINK.look_back `think.py:382` | 回看自己怎麼想 | **A** | 固定的回顧題：這輪先寫了什麼、換過幾次想法、留下哪個習慣 |
| DECIDE.check `decide.py:92` | 檢查判斷卡 | **B** | 程式：哪幾格還空著、哪些標了不能反悔、信心和「什麼會改變」有沒有寫。AI 只留「哪裡寫得不清楚、前後矛盾」 |
| SENSE.mirror `sense.py:53` | 外化的 AI 鏡子 | **B** | 程式：哪一類卡還沒寫（「沒有卡片寫到…」就是空分類）、七個自我覺察問題照分類列出。AI 只留「照你的話整理一次」 |
| CONTEXT.point_facets `context.py:34` | 提醒還沒看的面向 | **B** | 每個面向配一組關鍵字（合約→法律、錢→經濟），在問題和地圖裡比對，引用原句 |
| MAP.claims `map.py:209` | 標出哪些是主張、哪一種 | **B** | 關鍵字規則：法、條、合約、規定→法律；應該、該不該→價值；其他→事實。人確認 |
| GATHER.queries `gather.py:109` | 想搜尋字 | **B** | 中文搜尋字已經用程式組（主張＋方向字，查證頁就是這樣）；只有翻成英文需要 AI |
| VERIFY.techniques `verify.py:141` | 找操弄手法 | **B** | 九種手法各配一組字詞（「不轉不是…」「快」「最後一天」），先比對；AI 只補比對不到的 |
| THINK.socratic `think.py:379` | 只問問題 | **B** | 一組照階段分好的提問題庫；AI 只在題庫不夠時用 |
| FACILITATE.point_at_deviations `facilitate.py:146` | 帶領紀錄碰到「永遠不做的事」 | **B** | 四條各配字詞（替你決定、說出來、繼續…）先比對；AI 只補 |
| EXPRESS.draft_from_outline `express.py:130` | 照勾選的紀錄寫稿 | **B** | 程式照格式把勾選的紀錄排成稿（每句附出處）；AI 只「潤成好讀的句子」 |
| EXPRESS.adjust_for_reader `express.py:134` | 改寫給某位讀者 | **C** | 換句話說，需要 AI |
| THINK.mirror `think.py:375` | 共思考的鏡子 | **C** | 換句話說（但空格提示可以用程式，見 SENSE.mirror） |
| THINK.diverge `think.py:376` | 一起發散 | **C** | 想新方向，需要 AI |
| ACT.split `act.py:50` | 把一大步拆成小步 | **C** | 想出更小的做法，需要 AI |
| MAP.alternatives `map.py:140` | 同一件事的其他解讀 | **C** | 想別的讀法，需要 AI |
| THINK.counter `think.py:377` | 當反方 | **C** | 需要 AI |
| THINK.audit `think.py:317` | 證據稽核 | **C** | 要讀懂句子分事實／推論，需要 AI |
| THINK.criteria `think.py:381` | 建立判準 | **C** | 需要 AI |
| THINK.direct_advice `think.py:384` | 直接建議 | **C** | 需要 AI（人明確要求才有） |
| VERIFY.split `verify.py:105` | 把訊息拆成主張 | **C** | 要讀懂句子，需要 AI |
| VERIFY.read `verify.py:194` | 讀來源怎麼說主張 | **C** | 需要 AI |
| GATHER.organize `gather.py:158` | 整理你貼的 | **C** | 需要 AI |
| GATHER.summarise `gather.py:154` | 摘要每個來源 | **C** | 需要 AI |
| GATHER.compare `gather.py:154` | 找互相矛盾的 | **C** | 需要 AI |
| COMPUTE.suggest `compute.py:163` | 建議算法 | **B** | 6 種算法各配關鍵字（夠不夠、打平→損益平衡；值不值得→淨現值…）；情境點子才用 AI |
| COLLAB.restate_positions `collab.py:88` | 用白話重述一個人的立場 | **C** | 需要 AI |
| COLLAB.organise_differences `collab.py:114` | 列出大家哪裡不同 | **C** | 需要 AI |
| FACILITATE.play_participant `facilitate.py:114` | 扮演練習的參與者 | **C** | 需要 AI |
| TEACH.opponent `teach.py:112` | 練習對手 | **C** | 需要 AI |
| TEACH.feedback_on_moves `teach.py:116` | 看思考動作 | **C** | 需要 AI |

合計：**A 12 個**（直接拿掉 AI，**已完成**，見 1a）、**B 10 個**（程式先做，AI 變成另外的按鈕）、**C 19 個**（留著）。

## 1a. A 類 12 個：已改成程式（2026-10-12）

每一個：AI 動作已從 `ai_gate.actions()` 拿掉（41 → 29；`tests/unit/test_ai_to_code.py`），網頁按鈕已拿掉，結果出現在原來 AI 答案的位置、標「系統整理的，不是 AI 寫的，不扣點」（`lib/blocks.ts SYSTEM_MADE`、`PageParts.tsx SystemMade`）。以前存下的 AI 紀錄種類都留著（`test_ai_to_code.py::test_what_they_saved_before_is_still_a_kind_only_the_ai_wrote`），頁面照舊顯示、標「以前 AI …（舊的紀錄，留著）」。路徑都在 `Projects/internal/cognitive-engineering-os/` 下。

| # | 動作 | 現在由什麼做 | file:line | 測試 |
|---|---|---|---|---|
| 1 | ACT.trend | 每個數字算第一筆→最後一筆、差多少、哪兩天；只記一次的列成「只記一次」（每張任務卡各算各的） | `apps/cognitive-web/lib/act.ts:105` trendLines、`:120` movedSentence、`:126` onceSentence（單位不同的同名數字不合併：`seriesOf` 一個名字一種單位一條線）；`components/blocks/ActPage.tsx:311` | `lib/act.test.ts` "ACT.trend as code"（3，含單位不同不合併）；`ActPage.test.tsx` "lists what I ticked…"；`tests/unit/test_block_act.py::test_flag_and_trend_are_code_now…` |
| 2 | ACT.flag | 列出每張任務卡你自己勾的能／不能反悔（和你選的先等一下或請人覆核），和開案寫的受影響的人 | `lib/act.ts:87` undoMark、`:93` flagLines；`ActPage.tsx:310` | `lib/act.test.ts` "ACT.flag as code"；`ActPage.test.tsx`（同上） |
| 3 | GOVERN.explain | 每個設定一句固定說明，寫一次，放在設定定義的地方，由 `/blocks/govern/spec` 交給頁面 | `ai_lego/core/domain/kinds/govern.py:20` SETTINGS；`ai_lego/apps/api/blocks/govern_group.py:178` spec；`components/blocks/GovernParts.tsx:55` Explain；以前存下的 AI 說明 `:77` OldExplanations（設定頁底，可刪） | `tests/unit/test_block_govern.py::ExplainSettingTests`（3）；`GovernPage.test.tsx` "each setting is explained by one fixed sentence…"、"設定：以前 AI 寫的說明還在"（2） |
| 4 | VERIFY.summary | 每個主張一句（狀態＋支持／反對的獨立出處數，句型固定；不到 2 個用 `weak_line`；法律未確認加固定句），加三句總覽 | `ai_lego/core/domain/kinds/verify.py:199` LEDGER_SENTENCES、`:211` ledger_sentence、`:223` ledger_overview；`ai_lego/apps/api/blocks/verify.py:307,309` 帳本路由；`VerifyPage.tsx:445` | `tests/unit/test_block_verify.py::SummaryAndNextTests`（5）、`LedgerWordsTests`（6）；`VerifyPage.test.tsx` "the summary of the ledger…" |
| 5 | VERIFY.next | 固定查證順序（誰先說的、別處怎麼報、有沒有人查過、最早的原文、相反的說法），每個查得了的主張列出「去查」還沒找過的方向；法律未確認加一條 | `kinds/verify.py:237` ANGLE_ASKS、`:246` what_next；`blocks/verify.py:307`；`VerifyPage.tsx:460` | `test_block_verify.py::SummaryAndNextTests::test_what_is_still_worth_checking_lists…`、`LedgerWordsTests::test_what_next…`（同上檔） |
| 6 | MAP.method | 用「先說你卡在哪」同一份比對（`StuckBox.pickTools`，只有一份實作），比對你寫的開案問題和六層各一句，同分照目的排序（`rankTools`）；顯示比到的字 | `components/blocks/mapMethods.ts:37` suggestTools；`MapPage.tsx:212`；`ai_lego/platform/ai_actions/map.py:42` map_tools 多帶 name_en、blurb_zh | `components/blocks/mapMethods.test.ts`（3）；`MapPage.test.tsx` "matches the words I wrote…"、"with nothing written…"；`tests/unit/test_block_map.py::test_the_tools_to_pick…` |
| 7 | MAP.place | 卡片分類→層：事件→事實；你現在跟自己講的故事、別人的聲音→解釋；恐懼、期待→利益；人物關係與權力→結構；感受、身體反應、直覺由你放；建議不算數，你按了那一層才算，隨時可放別層 | `ai_lego/core/domain/kinds/map.py:27` CATEGORY_LAYER（spec 的 `category_layer`）；`apps/cognitive-web/lib/map.ts:52` systemPlacements；`MapPage.tsx:202` | `lib/map.test.ts` "MAP.place as code"（2）；`MapPage.test.tsx` "suggests where each card goes…"；`test_block_map.py::CategoryLayerTests`（2） |
| 8 | COMPUTE.explain | 用句型說「算出來的結果、最影響結果的數字（`flip`）、哪些數字是你自己說的／出處不到 2 個、模擬不是預測」；每個數字都是這次計算原有的 | `components/blocks/ComputePage.tsx:122` explainRun、`:411` | `ComputePage.test.tsx` "COMPUTE.explain as code"（2）、"says what each run shows…"；`tests/unit/test_block_compute.py::AiTests::test_explain_is_code_now…` |
| 9 | LEARN.compare | 拿掉重複的 AI 按鈕；並排表和「你自己做到的」（程式）留著並標系統做的 | `components/blocks/LearnPage.tsx:149-150`（並排表）、`:281`（你自己做到的） | `LearnPage.test.tsx` "the side-by-side is the system's own table…"；`test_block_learn.py::CompareTests` |
| 10 | LEARN.mirror | 每日校準卡存了之後，照原話顯示（類別、原文、你補的反例、什麼會改變它），不加一個字 | `components/blocks/MyLearnPage.tsx:114` | `MyLearnPage.test.tsx` "gives today's card back as it was written…"；`test_block_learn.py::DailyCardTests::test_the_mirror_is_the_card_as_written…` |
| 11 | THINK.ask_conclusion | 固定題目卡：結論、依據（附你這輪自己寫的）、什麼會改變它 | `apps/cognitive-web/lib/think.ts:9` askConclusionCard；`components/blocks/ThinkPage.tsx:43` SYSTEM_CARDS、`:372` systemCard | `lib/think.test.ts`（2）；`ThinkPage.test.tsx` "兩張題目卡是系統的固定題目"（3）；`test_block_think.py::ThinkWebTests` |
| 12 | THINK.look_back | 固定回顧題：這輪先寫了什麼、換過幾次想法（改寫幾張 AI 的卡、對 AI 整理的確認／改寫／不對次數）、留下哪個習慣（選了幾張、幾張是沒改的 AI 卡、你寫的反思）；不打分數 | `lib/think.ts:27` lookBackCard；`ThinkPage.tsx:372` | `lib/think.test.ts`（2）；`ThinkPage.test.tsx`（同上） |

沒做的、要留意：
- 程式版是頁面當下算的，不存成紀錄；所以「產出與表達」(`expressRecords.ts`) 與共同程序 (`collab_shared.py`) 不會再收到新的查證摘要、前後比較文字，只讀得到以前存的。
- ACT、COMPUTE、LEARN、THINK 的程式結果在網頁（`lib/*.ts`、頁面檔），沒有 API；VERIFY 的句子、GOVERN 的說明、MAP 的分層表在引擎（`kinds/*.py`），由 API 交給頁面——資料在哪邊就放哪邊，各只有一份。


## 2. 留下來的 AI 按鈕要守的規則

- 只在人按下按鈕時才跑，不自動跑。按鈕上先寫大約多少點。
- 能用程式先做的部分（空格、已標的記號、計算）一律程式做好，不交給 AI 重說一次。

## 3. 直接分析的工具結果頁（最花錢，先做）

`ai_lego/modules/research/interpret_method_record.py`：一次平均輸入 13,000、輸出 5,478 token。

| 做法 | 省多少 | 說明 |
|---|---|---|
| **提示快取**（prompt caching） | 輸入那一段大約省 80～90% | 每次送出的工具說明、規則、格式（`interpret_method_record.py:128-173`）都一樣，可以讓 AI 公司快取；現在程式完全沒用（`grep cache_control` 0 筆）。不改結果，只省錢 |
| 程式算的欄位不再請 AI 寫 | 輸出少一部分 | `data_thickness` 已經是程式算的（`:201`）。同樣能用程式的：留白的格子→證據缺口（`:164` 現在請 AI 列）、下一步工具（目錄裡本來就有 `next`）、趨勢圖的數字（從人填的格子抓數字） |
| AI 只寫要讀懂的部分 | — | 一句話結論、發現、診斷、迴圈圖的文字、建議方案，這些需要 AI |

研究報告彙整（synthesis，一次約 19,000 token）同樣先做提示快取。

## 先做的順序

1. 工具結果頁和研究彙整加提示快取：最省錢，不改任何畫面和結果。
2. A 類 12 個改成程式：拿掉按鈕的 AI，結果改由程式產生，每一個都要有測試。
3. B 類 10 個：程式先給，AI 變成另外的「請 AI 再看」。
4. 工具結果頁裡能用程式的欄位，改由程式寫。
