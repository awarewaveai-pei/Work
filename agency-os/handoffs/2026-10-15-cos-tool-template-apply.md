# COS 工具頁模板 → 套用到第二個工具（2026-10-15 交接，進行中）

**續接語**：「繼續 工具模板 15.1」→ 讀本檔，直接做下面「下一步」，不再問（「待操作者決定」除外）。

**已完成（全部已 commit、push；未部署）**
- `c65e2ec97` §15.1 第 1 項：結果頁沒有任何冰山分岔；差別只來自 `MethodVisual.tsx` `RECORD_PICTURES`（含 homes／parts／table／unit）與 `Charts.tsx` `OWN_CHARTS`（＝`result-page-shows.yaml`，測試比對）。模板 v6＋引用閘一起進庫。WORKLOG 2026-10-15 續18。
- `7566beea7` 第 2 項：圖的單位（問題陳述三段、魚骨每根骨、五個為什麼每一步、柏拉圖每一項）由伺服器 `picture_units.py` 算、存在解讀結果（schema 1.5.0），④⑥ 一單位一卡。續21。
- `c76fde717` 第 3 項：示範結果頁 `/projects/demo/<工具>[/<領域>]`，資料 `fixtures/demo/<工具>.<領域>.json` 由 `scripts/dev/demo_fixture.cjs` 真跑產生，`DEMOS` 由 sync 產生；說明書按鈕每領域一顆；「我的案子」每工具一列。本機開發 API 改用本機 PostgreSQL（`launch_cos_dev.ps1`，容器 `cos-dev-db`）。真跑兩份：冰山 edd、魚骨 edd。續23。

**待操作者決定**
1. 其餘 23 份示範真跑：每份約 NT$7（預設模型 claude-opus-5-5，交接原估 NT$3 是錯的）→ 約 NT$165；改用 claude-sonnet-5 約 NT$83（但跟正式站預設模型不同）。操作者原本同意的是 NT$75。
2. 冰山說明書 v1 的 partner／decision／ecom／daily 那四句 `worked.result_link` 寫著「這個領域的完整結果頁還在做」；那四份真跑後要 lessons v2 改字（操作者 promote）。
3. §14 第 5、6 項（`learning.dmaic`、A3）照舊。

**下一步**（建議模型 Opus 5.5；每項先 `git log --oneline -10`）
1. 操作者定了花費 → `cd lobster-factory/infra/hetzner-phase1-core && NODE_PATH=tests/node_modules node <COS>/scripts/dev/demo_fixture.cjs <工具> <領域>…`（先 `preview_start cognitive-api-dev` 與 `cognitive-web-dev`）→ `python docs/mockups/sync-design-system.py` → `demos.spec.ts`。本機登入只能用本機測試身分（COS_TEST_*），不是正式站帳號。
2. §15.1 第 4 項 M13／M14 進 `test_method_form.py`；第 4 步驗證：魚骨 `method-input-forms.yaml` 條目（現在 ④「這根骨問」印的是欄位名「原因假設」、你填的有「編號：H1」）、`evolution/lessons/v2.yaml` 魚骨一課（照 `TOOL_LESSON_TEMPLATE.html`）、五領域示範 → 五頁預覽給操作者。
3. 之後：問題陳述 → 五個為什麼 → 柏拉圖 → 找原因工作流頁 → DMAIC 缺的 9 站（模板 §15.3）。

**課 v2 設計（2026-10-15 操作者看了冰山課與自己的結果頁 INTERP-E4B3565C…：「五分鐘教學的內容其實不好」；Fable 定案，先於下一步 2）**
根因：課的字是手寫的另一份（`evolution/lessons/v1.yaml`），結果頁是程式產的（`ResultPage.tsx`），兩邊沒連，課只能描述版面，講不出結果頁裡的判斷；且 6 處對不上（三條路／90 天／三個指標／自動重跑／示意圖／串工作流，見 WORKLOG 2026-10-15 課 v2 那筆或本檔 git log）。
- D1 每層一個問題：SSOT = `units.items[].ask`；`method-input-forms.yaml` 的 label 問句、結果頁 ②④⑥（`UNIT_FACTS` 的 question／ask4／asks 併成一個）都從它來；`test_method_form.py` 加一條擋不一致。
- D2 看例子 = 從 `fixtures/demo/<工具>.<領域>.json` 產生（lessonkit 讀 fixture）：每層「你填的 → 這代表（units[].meaning）→ 在這層出手（action＋leverage）」、★ 那層＋`focus.why`、`solutions.first_step`。沒有 fixture 的領域印「還在做」。刪 `worked.cases`。
- D3 看懂結果 = 同一份 fixture 帶讀：`summary`、每個發現的 `confidence.reason`、`revision_conditions`、`gaps`；九段「回答什麼」改由一份 `methods/registry/result-page-sections.yaml` 產生，`ResultPage.tsx` 每張卡的 read／act 也從它產（`toolsheets.generated.ts`），`check-mocks` 比對。刪 `read.steps`／`read.rows` 手寫字。
- D4 `lessonkit.py:281` 「對照一個做完的結果頁」改成和 :257 一樣每領域一顆（今天第 3 項漏改，正式站現況永遠「還在做」）。可先單獨修。
- D5 `lessonkit.py:218` 齊備勾：D1–D3 檢查都綠才打，否則列缺項。
- 不花 AI 錢；lessons v2 要操作者 promote；`SHAPE` 跟著改（`lessonkit.py:29-45`），`TOOL_LESSON_TEMPLATE.html` 重產。
- 驗：`test_tool_page_template.py`、`check-mocks.py`＋selftest、`test_method_form.py`、vitest、`demos.spec.ts`；五頁預覽給操作者。

**課 v2 進度（2026-10-15 晚，操作者「先儲存 後暫停」；未 commit）**
續接語：「續做 冰山課 v2：讀 agency-os/handoffs/2026-10-15-cos-tool-template-apply.md「課 v2 進度」，先 `git apply agency-os/handoffs/2026-10-15-lesson-v2-wip.patch`，從 render_web_units 開始；完成 = 四個檢查綠＋五頁預覽＋操作者 promote v2。建議模型：Opus 5.5」
- 已寫（工作樹，未追蹤）：`methods/registry/result-page-sections.yaml`（頁首＋①–⑨ 的 answers；①–⑨ 的 read/act 範本＝`ResultPage.tsx` 現在的字原樣搬過來，{U}{findings}{order}{count}{cards}{rows}{plan}{metrics}；leverage／confidence 字表；三步讀法）、`evolution/lessons/v2.yaml`（ask＝填寫頁問句；result 去掉 question/ask4/asks；SVG ③ 改「人力安排」；worked 只剩 how／columns×4／after／result_link；read 只剩 how／short／terms）。
- `lessonkit.py` 改到一半 → 存成 `agency-os/handoffs/2026-10-15-lesson-v2-wip.patch`，檔案已還原（champion 仍是 v1，半成品會讓 sync／check-mocks 紅）。patch 內容：SHAPE v2、SECTIONS_SHAPE＋`load_sections`、DRAWN 圖必含每層 ask、`form_questions`／`lesson_gaps`（D5 齊備勾）、`demo_result`、`worked_rows`／`demo_reading`、render 的看例子（D2）、看懂結果（D3）、對照按鈕每領域一顆（D4，`per_domain`）。
- 還沒做：(1) `render_web_units` 輸出 UnitFacts 加 `ask`、`RESULT_SECTIONS`／`LEVERAGE`／`CONFIDENCE`；(2) `ResultPage.tsx`：read/act 改讀 RESULT_SECTIONS（⑦ plan 變數：phased ? 短期一個月＋長期一{季} : 行動計畫（horizon），一月／一季／一年鈕只在 phased 時出現）、LEVER/CONFIDENCE 改讀產生檔、④⑥ 用 `facts.ask`；⑧ `needs` 過濾照伺服器規則（`interpret_method_record.py:261`：只丟「像欄位 key 且目標沒有」的，AI 寫的中文需求保留）；⑨ 同一句兩個 [n]（r/x 與 r/x/0 指同一行時合一）；`MethodVisual.tsx:32` `layer.question`→`layer.ask`；(3) `iceberg-result-mock.html` ②④ 問句改成 ask；(4) `test_method_form.py` 加 D1 檢查（lesson 每格 ask＝表單 label 冒號後）；(5) `TOOL_LESSON_TEMPLATE.html` 重產、`TOOL_PAGE_TEMPLATE.md` 的 ResultPage 行號＋`test_tool_page_template.py` ANCHORS；(6) 預覽：champion 未換前用暫存腳本讓 `lk.load` 讀 v2 跑 sync＋四個檢查；五個 artifact 重發；(7) 問操作者 promote v2（`python -m ai_lego.apps.cli.evolution promote --kind lessons --version v2 --evidence <golden>`），之後真 sync、commit、WORKLOG。

**另開的事**：`(shell)` 底下所有 not-found 都回 HTTP 200（TASKS.md「404 狀態」一項）。

**規則**：每個引用附 `檔:行`（模板改了先跑 `tests/unit/test_tool_page_template.py`）；不補丁；不 commit 其他 session 的檔；部署 High risk 先問。
