# Cognitive OS 結果頁 — 缺失盤點與交接報告（給接手的 AI）

日期 2026-09-28。讀者是 AI agent（Claude／Codex），不是人。規則：每條缺失附 `file:line`；改法要完整閉環（不變量 → 實作 → 測試 → 真跑 → 審查 → 上線），**不做補丁**（AGENTS.md §1 補丁判準：問「這一類問題的不變量是什麼」，只關眼前實例 = 補丁）；共享檔（`agency-os/WORKLOG.md`／`TASKS.md`）只能經 `scripts/git-partial-worktree-commit.py stage` 的私有 index commit；**上線是 High-STOP，每次都要操作者說 go**；≤5 個 agent、一任務一 session；紀錄用 AI 看得懂的極簡寫法。

## 0. 一句話

正式站 `cognitive.aware-wave.com` 的結果頁與示意稿 `docs/mockups/iceberg-result-mock.html`（= 規格；線上 https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq ）之間的 310 筆差異：**已修 306 筆，剩 2 筆做一半、1 筆流程**（§6、§7）。全部已 push 到 `origin/main`，**沒有上線**；上線是 High-STOP，要操作者說 go（§9）。

## 1. 驗收基準（操作者原話）

- 「內容、邏輯、分析出來的結果、排版和版面都和原設計差很多」「不是每個按鈕都可以使用」「文字也被截斷」「每一個步驟、細節、按鈕都去核對清楚」「我沒看到你有寫這個（⑧）」。
- 我的專案：專案要點得進去；每次「執行分析」是一個新專案；建立時間要到分鐘（已上線 `b6936ecc`）。
- 紀錄文件用 AI 看得懂的極簡寫法；不准一次派多個無效益 agent。

## 2. 系統地圖（改哪裡）

| 層 | 檔案 | 責任 |
|---|---|---|
| 規格 | `docs/mockups/iceberg-result-mock.html`（結果頁）、`home-mock.html`（我的專案 L1086-1140）、`design-system.css`（與 web `app/design-system.css` 逐位元相同） | 示意稿即規格；改示意稿要跑 `sync-design-system.py` → `check-mocks.py` |
| 契約 | `D:/Work/agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml`（1.2.0）＋ fixtures `…/tests/contracts/specs/cognitive/typed-objects/method-interpretation.fixtures.yaml`；改完在 spec 根目錄跑 `python tests/gen_spec_index.py` ＋ `python tests/run_golden_tests.py` | 模型輸出的形狀 |
| 分析管線 | `ai_lego/modules/research/interpret_method_record.py`：`build_interpretation_prompt`（提示）、`repair_details`（逐項修復／移除）、`detail_problems`（段級問題）、`evaluate_interpretation_gates`（四閘）、`trend_candidates`（記錄裡量過兩次的單位）、`run_interpretation`（最多兩次呼叫：detail 掉段 → 重問一次；沒趨勢圖但記錄有兩個數 → 重問一次；第二次更差就用第一次） | 產出頁面內容 |
| 閘道 | `ai_lego/platform/ai_gateway/provider.py`（`complete_json` = tool use 拿 API 解析過的 JSON；`MAX_OUTPUT_TOKENS`）、`pricing.py`（NT$；`COGNITIVE_OS_AI_PRICES_JSON`／`COGNITIVE_OS_USD_TWD`） | 模型呼叫 |
| API | `ai_lego/apps/api/main.py`：`interpret_method`／`_run_interpretation`（revision、rerun_id；專案被抹除就不寫）、`get_interpretation`（approval、revision、cost_twd）、`approve_interpretation`、`method_estimate`、tasks 三支、`schedule_rerun`／`list_reruns`、`_project_with_activity`、`delete_project`（分析進行中 409 `PROJECT_BUSY`）、`_safe_cost_twd`、`_date_has_passed`；`ai_lego/data/repositories/project_source_repository.py`：`analyses()`／`tasks()`／`reruns()`／`last_activity()`（全部從專案事件流讀，無新表） | 事實只存一處：事件流 |
| 網站 | `apps/cognitive-web/components/RunPage.tsx`（執行頁；花錢前先講 = 確認執行）、`RunHeader.tsx`、`result/ResultPage.tsx`（卡①–⑨＋核准卡）、`result/MethodVisual.tsx`（冰山圖，band 依文字長高）、`result/Charts.tsx`（A 趨勢／B 迴路／C 槓桿）、`result/svgtext.tsx`（foreignObject 換行，不截斷）、`MethodForm.tsx`（格子；`layered` 上四層色）、`ProjectList.tsx`／`ProjectPage.tsx`／`AnalysisPage.tsx`／`ComparePage.tsx`、`lib/projects.ts`／`lib/record.ts`／`lib/catalog.ts`／`lib/time.ts`、`app/globals.css`（print＋foreignObject 顏色） | 畫出來 |
| 閘 | `docs/mockups/check-mocks.py --page result <html> --lesson <path> --parity`：`check_parity` 把示意稿每張卡的標題／怎麼讀粗體／h3／row 標籤／表頭／圖說／按鈕與網頁比對；`PARITY_ALIASES` = 明寫的刻意差異；`check-mocks-selftest.py` | 機械核對，取代人工清單 |
| 測試 | `tests/unit/test_interpret_method_record.py`、`test_ai_gateway.py`、`test_api_interpret.py`、`test_project_source_api.py`、`test_pricing.py`；web `npx vitest run`、`npx tsc --noEmit`；e2e `D:/Work/lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/iceberg.spec.ts`（`COS_TEST_MOCK_API=1` 假 API；否則真模型） | |
| 部署 | `deploy/deploy.sh`（測試關卡檔案清單 L114；本批新測試檔還沒加，見 P-19）、`scripts/dev/`（真跑、截圖、正式站唯讀檢查、備份試跑；README 有用法） | |

## 3. 不變量（改任何東西前先對照）

1. 頁面當成使用者處境事實的數字，一律是記錄裡寫過的（findings／headline／summary／priority／focus.why／units.brief／units.meaning／loop 文字／trend／metrics.now）；提議類（action／plan／target／改判條件）可提數字並標「待確認」。
2. 「沒出處就不顯示」用最小粒度執行：壞的一個指標／路徑／單位／點單獨拿掉並在頁上與 evidence 揭露（`repair_details`），整段只在段本身壞時才丟（`detail_problems`），核心（findings／visual／next）壞則整份拒收。**P-06／P-05／P-07 是這條還沒做到的三個洞。**
3. 圖裡的文字不截斷：包（foreignObject，`overflow: visible`），畫布跟著文字長。全站對使用者或模型文字 grep `cut(`／`short(`／`slice(0,` 必為 0。
4. 事實只存一處：分析／核准／退回／任務／到期提醒都是專案事件流的事件，讀時推導，不另存副本、不加表。
5. 示意稿的按鈕每一顆都要有真作用；做不到真的（案例庫、串工作流）按了說明原因與期別，不假裝。
6. 每次「執行分析」開新專案（除非 `?project=`／已存分析頁）；接受後網址換成該分析頁；**執行前先講要花多少，按「確認執行」才花**。
7. 圖 A：記錄裡同一件事有兩個時間點的數字就要畫；模型漏了要被問一次（`trend_candidates` → `TREND_MISSING` 重問）；仍沒有就老實寫「沒挑出」，不寫「你沒填」。
8. 專案被抹除後，任何遲到的分析結果／失敗事件都不得再寫進該 aggregate（`_run_interpretation` 先查 `get_project`）。

## 4. 這批做了什麼（2026-09-28，全部在 origin/main）

| commit | 內容 |
|---|---|
| `4fa192896` | 第一輪：契約 1.2.0、逐項修復閘、核准／任務／重跑／估價、確認執行、parity 閘、310 筆稽核與本報告 |
| `e01fc7d49` `137186da4` `3199a4f9a` | Codex 三批 27 筆（checker 與 selftest、fixtures、e2e、顯示誠實化；§6 證據欄寫 Codex） |
| `def7d7882` | 模型呼叫與閘：截斷重試一次並記帳、effort medium、item grain 的契約修整、第 N 層不算數字、中文數字、一句話標題只掉自己 |
| 本批（見 git log） | 核准列四個真檢查、估價的時間與上限、預算鎖不包住模型呼叫；契約 1.3.0（診斷、短順序、每層厚度與誰能補、建議方案、迴路外的信念框、下一步的路徑與原因、缺口對應哪一層）；迴路圖照示意稿；三個 worker 的 ⑦ 任務／⑧ 帶入／錯誤與專案頁；免費示範專案；lesson 五個領域的示範案例；deploy 測試關卡加 web gate；示意稿對齊（重跑是提醒、專案頁用語與欄位）；分析的 run lock（行程死掉不再永遠「分析中」、專案刪得掉）；引註換寫法視為同一 id、拒收時重問訊息列出錯的 id；失敗原因顯示成人話 |

## 5. 已驗證（機械證據，2026-09-28）

| 項目 | 結果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 13 檔 94 tests 全過（含 parity 測試、示範專案、1.3.0 渲染、四個核准檢查） |
| `pytest`（解讀、API、閘道、專案、價格、api_main、表單、run lock、synthesis、executor 共 13 檔） | 394 passed, 287 subtests（6 分 2 秒） |
| `check-mocks.py`／`run_golden_tests.py`／`gen_spec_index.py --check` | green／全過／fresh |
| `deploy/web_test.sh`（容器內 tsc + vitest + check-mocks） | exit 0 |
| `python docs/mockups/check-mocks-selftest.py` | 194 mutations, 194 caught（Codex e01fc7d49） |
| 突變（丟棄式 worktree，拔掉 → 指名測試紅 → 還原綠） | repair_next_steps、add_blank_unit_gaps、_reserve_ai_tokens、引註寫法正規化、重問列出錯的 id、RUNNER_LOST 判讀、runner 放鎖：7/7 |
| 稽核 → 驗證 | 4 份稽核 310 筆 → 2 個驗證者逐筆 Grep 工作樹（`verified_*.json`）；統計見 §6 |
| 真模型整頁（本機 :3930→:8420，`scripts/dev/result_shots.cjs`） | result_shots13（2026-09-28）：11 段全出、0 error、0 溢出、1.3.0 欄位全出、五閘 PASS 0 dropped／removed、parity 0 finding，約 4.3 萬 tokens（≈NT$6）。result_shots14：citation_integrity 兩次拒收，當時重問訊息沒說哪個引註錯 → 已修（引註寫法正規化＋重問列出錯的 id；test_a_refused_citation_tells_the_retry_which_ids_to_fix）；修後未再真跑（付費呼叫待操作者同意） |


## 6. 缺失總表（四份稽核 310 筆 → 兩個獨立驗證者逐筆對照工作樹）

| 狀態 | 筆數 | 意義 |
|---|---|---|
| OPEN | 2 | 未做 |
| PARTIAL | 2 | 做一半 |
| FIXED_IN_TREE | 306 | 工作樹已修 |
| FALSE | 0 | 稽核誤報 |
| UNVERIFIED | 0 | 未能驗證 |
| 重複（dup_of） | 12 | 同一缺口兩份稽核都報，只留一列 |

讀法：`證據` 是驗證者 2026-09-28 在工作樹上 Grep 到的 `file:line`（web 路徑相對 `apps/cognitive-web/`，其餘相對 `Projects/internal/cognitive-engineering-os/`，`agency-os/`、`lobster-factory/` 相對 `D:/Work`）；之後 round 5／6 又動了 `ResultPage.tsx`／`main.py`／`interpret_method_record.py`／`check-mocks.py`，行號可能位移 ±30，**一律用 `驗證` 欄的字串或 symbol 重新 Grep 定位，不要信行號**。`改法` 是最小閉環，不是補丁：先寫不變量，再改，再測，再真跑。

### 6.1 未做（OPEN）— critical／major

| id | 組 | 卡 | 嚴重 | 類 | 缺什麼 | 證據（file:line，2026-09-28 工作樹） | 改法 | 驗證 |
|---|---|---|---|---|---|---|---|---|
| P-43 | 管線＋流程 | process | major | 流程 | No WORKLOG entry, evidence lines or fresh oracle; TASKS stale | agency-os/reports/oracle newest 2026-09-27-partialreview-663040bd.md; agency-os/WORKLOG.md no hit for complete_json｜repair_details｜PROJECT_BUSY; agency-os/TASKS.md:122 ④ still '存成任務、到期重跑、核准存檔、匯出 PDF 未做' | After edits stop, write the WORKLOG entry via scripts/worklog-insert-entry.py with REALTEST/REVIEW/BUGHUNT lines, produce a 2026-09-28 codex-review artifact (or ORACLE_WAIVED with mutation evidence), and update TASKS.md:122 ④⑤ via git-partial-worktree-commit.py. | verify-closeout-completeness.ps1 passes; commit hooks pass |

### 6.2 未做（OPEN）— minor／suggestion

| id | 組 | 卡 | 嚴重 | 類 | 缺什麼 | 證據（file:line，2026-09-28 工作樹） | 改法 | 驗證 |
|---|---|---|---|---|---|---|---|---|

### 6.3 做一半（PARTIAL）

| id | 組 | 卡 | 嚴重 | 類 | 缺什麼 | 證據（file:line，2026-09-28 工作樹） | 改法 | 驗證 |
|---|---|---|---|---|---|---|---|---|
| I-15 | 表頭–③ | input | minor | 操作者決定 | Web-only extras in the input card not in the mock; undefined mb10 class | mb10 gone: components/RunPage.tsx:150,155,156 use mb8 (design-system.css:233); extras still absent from iceberg-result-mock.html:343-373: LazyFill details :150, AI 幫你填了 :151, notes :152-154, 存到 :155, 改存到別的專案 :156, confirm box :166, pending :168 | The input card's conditional extras (AI 幫你填, 存到, 確認執行 box, 專案名稱) are not in the mock; parity only checks mock ⊆ page, so they pass. Add them to the mock with data-when if the operator wants them specified. | python docs/mockups/check-mocks.py green after the mock edit; grep -c mb10 apps/cognitive-web/components/RunPage.tsx == 0 |
| P-16 | 管線＋流程 | tests | minor | code | foreignObject no longer clips, but estimate-sized boxes can overflow | components/result/svgtext.tsx:23 <foreignObject … style={{ overflow: 'visible' }}> (clipping gone); heights still from linesFor estimate (:8-16), no post-mount measurement or slack | foreignObject overflow is visible (never clipped) and boxes are sized by linesFor; no post-mount measurement. Three real runs showed 0 overflow. | Playwright: for each 'foreignObject > div', scrollHeight <= foreignObject height with long mixed-Latin texts |

### 6.4 工作樹已修（FIXED_IN_TREE）— 接手者只需在 commit 後複驗 `驗證` 欄

| id | 組 | 卡 | 嚴重 | 類 | 缺什麼 | 證據（file:line，2026-09-28 工作樹） |
|---|---|---|---|---|---|---|
| P-01 | 管線＋流程 | provider | critical | code | Cut-off answer fails on first call, no retry | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-18 | 管線＋流程 | tests | critical | 測試 | Web typecheck red (horizon/signoff) — now cast | components/result/ResultPage.test.tsx:94 `detailed as unknown as React.ComponentProps<typeof ResultPage>['result']`; stated state npx tsc --noEmit exit 0 |
| M-71 | ④–⑦ | 7 | major | code | AI prefills owner; due date optional in UI and API | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-73 | ④–⑦ | 7 | major | code | Saving the plan twice duplicates the tasks | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-75 | ④–⑦ | 7 | major | code | No control to confirm KPI goals (plan targets now editable) | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-76 | ④–⑦ | 7 | major | code | Nothing lets the user choose an option or stores the choice | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-79 | ④–⑦ | 7 | major | code | Rerun reminder can be scheduled repeatedly | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-85 | ④–⑦ | 7 | major | code | Task/rerun failures shown in the approve card, far from ⑦ | components/result/ResultPage.tsx:181 plan() wrapper sets planError; saveTasks :191 and scheduleRerun :197 use it; :336 {planError && <p className='error' role='alert'>沒有成功：{planError}</p>} inside ⑦ |
| N-05 | ⑧–核准＋流程 | 8 | major | 契約 1.3.0 | Every next step becomes a journey pill; no path vs alternative | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| N-12 | ⑧–核准＋流程 | 8 | major | code | False 與本次 N 個發現 clause removed | components/result/ResultPage.tsx:353 帶入什麼 = '你填的{names} {cites} → 自動填 N 個欄位；' with no findings clause (no '個發現' in the file) |
| N-13 | ⑧–核准＋流程 | 8 | major | code | Prefill keys are model guesses; 自動填 N 個欄位 count unverified | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-14 | ⑧–核准＋流程 | 8 | major | code | 還要你填 lists raw target field keys (e.g. objective) | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-19 | ⑧–核准＋流程 | 8 | major | code | 用這次的資料開始 now keeps the project | components/result/ResultPage.tsx:356 href={runHref(step.method_id!, project?.id)}; lib/catalog.ts:50 appends ?project=; no test covers the project href (ResultPage.test.tsx:142 is the no-project case) |
| N-20 | ⑧–核准＋流程 | 8 | major | code | Prefill merged silently; needs never reach the form; nothing red | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-21 | ⑧–核准＋流程 | 8 | major | code | Prefill values not coerced to the target field kind | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-23 | ⑧–核准＋流程 | 8 | major | code | Primary workflow button only prints a not-built note | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-28 | ⑧–核准＋流程 | 8 | major | code | Judgment-carried promise reworded away (not carried) | components/result/ResultPage.tsx:231 now '沒填也能核准；填了會和這頁一起存。' (no ⑧ promise); mock iceberg-result-mock.html:395 still promises 之後的工具會把你的判斷當成最高優先的輸入 |
| N-32 | ⑧–核准＋流程 | 9 | major | code | External sources show as id + sha256; no title, no link | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-33 | ⑧–核准＋流程 | 9 | major | code | 信心最高只到「中」 stated but never enforced | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| N-39 | ⑧–核准＋流程 | approve | major | code | No 來源 check (every claim cited); uncited finding passes | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| N-40 | ⑧–核准＋流程 | approve | major | code | 層序 (top_down_completeness) computed then discarded | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| N-42 | ⑧–核准＋流程 | approve | major | code | No 無預設結論 gate | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| N-43 | ⑧–核准＋流程 | approve | major | code | Three non-mock checks shown; always ✓ (labels, not checks) | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| N-54 | ⑧–核准＋流程 | flow | major | code | Confirm step before spending now exists | components/RunPage.tsx:164 onSubmit only setConfirming(payload); :166-167 「要花多少」 box, 確認執行 → launch, 取消 → setConfirming(null); redo/rerun share this submit |
| N-62 | ⑧–核准＋流程 | flow | major | code | Judgment words saved on blur/approve, but not without a stance | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| N-63 | ⑧–核准＋流程 | flow | major | code | Errors shown as 'API 4xx' codes, not human words | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-78 | ⑧–核准＋流程 | projects | major | 操作者決定 | No demo projects card; first result costs money | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-85 | ⑧–核准＋流程 | projects | major | code | Project page only counts sources; no list/add/content | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| C1-11 | 表頭–③ | 1 | major | code | Judgment words lost when typed after the stance or with no stance | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| C2-20 | 表頭–③ | 2 | major | code | foreignObject clips underestimated text; CJK symbols/latin words mis-sized | components/result/svgtext.tsx:23 style={{ overflow: 'visible' }}; :7 wide() covers arrows, circled digits, CJK; :11 latin/number token moves whole |
| H-07 | 表頭–③ | header | major | code | Blank layer counted as one own statement (你填的 N 段話 inflated) | ai_lego/modules/research/interpret_method_record.py:170-171 — if item.get('value') in ('[]', '{}', <empty-string JSON>): continue (setdefault at :169 keeps the unit at 0) |
| H-08 | 表頭–③ | header | major | code | Tie of thinnest layers names 第 1 層 最薄; blank layer counted filled | components/result/ResultPage.tsx:150-152 — counts/least; thinnest = … counts.filter((count) => count === least).length === 1 ? … : null (a tie names no thinnest layer); blank part via H-07 |
| I-11 | 表頭–③ | input | major | code | No cost confirmation before POST /interpret | components/RunPage.tsx:164 setConfirming(payload) (no POST); :166-167 要花多少…按「確認執行」才開始、才花錢 + 確認執行 → launch(payload); POST only inside launch :137 |
| P-02 | 管線＋流程 | provider | major | code | No effort/thinking control; 12288 ceiling shared with thinking | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-03 | 管線＋流程 | gate | major | code | 第 N 層 ordinals read as unstated numbers → core refusal | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-04 | 管線＋流程 | gate | major | code | Chinese numerals never extracted by the NUMBERS gate | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-05 | 管線＋流程 | gate | major | code | Unstated headline number refuses the whole answer | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-06 | 管線＋流程 | schema | major | code | Schema refusals (empty/length/count/enum) drop whole sections | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-07 | 管線＋流程 | gate | major | code | One bad next_step method_id refuses the whole answer | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-08 | 管線＋流程 | gate | major | code | Evidence gaps asked for but never enforced; string gaps dropped | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| P-09 | 管線＋流程 | gate | major | code | Repaired metric citation counted as removed → paid retry, false 已拿掉 | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-15 | 管線＋流程 | tests | major | code | Old-version detection by missing sections; 1.0.0 cards still say 沒有產出 | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| P-19 | 管線＋流程 | deploy | major | 部署 | Deploy test gate omits interpretation tests, vitest, tsc, check-mocks | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| P-31 | 管線＋流程 | checker | major | code | Parity crashes when header card has no h1/h2 | round 6 (2026-09-28): docs/mockups/check-mocks.py:935 |
| P-32 | 管線＋流程 | checker | major | code | 怎麼讀 strip compare checks only the bold labels | Codex e01fc7d49 (2026-09-28) |
| P-36 | 管線＋流程 | checker | major | 測試 | Selftest never exercises --page result or --parity | Codex e01fc7d49 (2026-09-28) |
| P-40 | 管線＋流程 | e2e | major | 測試 | e2e mock result is 1.0-shaped; new flows untested | Codex e01fc7d49 (2026-09-28) |
| M-05 | ④–⑦ | 4 | minor | code | Layer 2 h3 reads 模式 Patterns (mock: 模式與趨勢 Patterns & Trends) | components/result/MethodVisual.tsx:14 title: '模式與趨勢 Patterns & Trends' (name stays 模式 Patterns for the svg); ResultPage.tsx:140 uses .title |
| M-06 | ④–⑦ | 4 | minor | code | Layer 3 h3 reads 結構 Structures | components/result/MethodVisual.tsx:15 title: '結構與流程 Structures & Processes' |
| M-10 | ④–⑦ | 4 | minor | code | Layer 2 這層問 uses the ② wording | components/result/MethodVisual.tsx:14 ask4: '這段時間有什麼趨勢？哪些事件互相關聯？'; used at ResultPage.tsx:270 |
| M-11 | ④–⑦ | 4 | minor | code | Layer 3 這層問 shortened | components/result/MethodVisual.tsx:15 ask4: '什麼流程、制度、權力安排在製造上面的模式？' |
| M-12 | ④–⑦ | 4 | minor | code | Layer 4 這層問 shortened | components/result/MethodVisual.tsx:16 ask4: '什麼沒說出口的假設、信念、價值觀，造就了上面的結構？' |
| M-15 | ④–⑦ | 4 | minor | code | A layer whose reading was removed silently loses two rows | Codex 137186da4 (2026-09-28) |
| M-16 | ④–⑦ | 4 | minor | code | No <dfn title> hover definitions for 迴路 / 同步不等於因果 | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| M-17 | ④–⑦ | 4 | minor | code | No 。 between action and 效果 | components/result/ResultPage.tsx:273 — {reading.action}{/[。！？]$/.test(reading.action) ? '' : '。'}<b>效果</b> |
| M-19 | ④–⑦ | 4 | minor | code | LEVER.mid is 中 (mock 中低) | components/result/ResultPage.tsx:60 — const LEVER = { low: '低', mid: '中低', high: '高', max: '最高' } |
| M-20 | ④–⑦ | 4 | minor | code | 對應方案 row missing on layers without an option | components/result/ResultPage.tsx:274 — row always rendered; iceberg && index === 1 && metrics → '⑦ C 的追蹤指標（不是方案，是量法）', else '—（⑦ 沒有方案在這層出手）' / '這次沒有方案草稿' |
| M-21 | ④–⑦ | 4 | minor | code | Option format ⑦ 甲「name」; prompt never asked for labels | components/result/ResultPage.tsx:132-134 optionName/optionLabel/optionTag; :274 `⑦ ${optionTag(option)}`; ai_lego/modules/research/interpret_method_record.py:127 no numbering or 甲乙丙 prefix; ResultPage.test.tsx:95 ⑦ 乙「改流程」★ 本次建議 |
| M-22 | ④–⑦ | 4 | minor | code | Options listed on every layer they touch | components/result/ResultPage.tsx:130-131 — optionHome = Math.max(-1, ...paths.map(layerIndex)); optionsFor filters optionHome(option) === layerIndex(path) |
| M-23 | ④–⑦ | 4 | minor | code | ★ 本次建議 appended with a space / bare on a focus layer with no option | components/result/ResultPage.tsx:274 — {focusKey === unit ? (opts.length ? '★ 本次建議' : ' ★ 本次建議先在這層出手') : ''} (no space; opts are only options homed on this layer) |
| M-25 | ④–⑦ | 4 | minor | code | 最薄 not wrapped in .warn | components/result/ResultPage.tsx:275 — {verdict(unit) === '最薄' ? <span className='warn'>最薄</span> : verdict(unit)} |
| M-26 | ④–⑦ | 4 | minor | 契約 1.3.0 | Verdict vocabulary lacks 薄 and a qualitative note (no schema field) | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-27 | ④–⑦ | 4 | minor | 契約 1.3.0 | No pointer from a thin layer to the ⑧ step that fills it | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-29 | ④–⑦ | 4 | minor | code | 外部 N 筆 is the project-wide source count on every layer | Codex 3199a4f9a (2026-09-28) |
| M-33 | ④–⑦ | 5 | minor | 契約 1.3.0 | 主要發現 has no diagnosis (problem layer vs root layer) | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-34 | ④–⑦ | 5 | minor | 契約 1.3.0 | ⑤ body repeats ① 一句話 | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-35 | ④–⑦ | 5 | minor | 契約 1.3.0 | 建議順序 bold lacks the short order | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-36 | ④–⑦ | 5 | minor | code | Second box disappears without priority | components/result/ResultPage.tsx:282 — else <div className='finding'><b>建議順序</b>{missing('priority', '出手順序')}</div> |
| M-38 | ④–⑦ | 5 | minor | 契約 1.3.0 | Gaps cannot cite the line they are about | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-39 | ④–⑦ | 5 | minor | code | Sentinel 未指定；需使用者補充證據 rendered; 。； joins | Codex 137186da4 (2026-09-28) |
| M-50 | ④–⑦ | 7 | minor | code | ⑦ read: B 排成90 天 without space; C clause without metrics | components/result/ResultPage.tsx:295 — read={`A 選一條路、B 排成${horizon ? ` ${horizon}` : '計畫'}、C ${metrics.length ? `N個數字盯著` : '這次沒有指標'}。`} |
| M-54 | ④–⑦ | 7 | minor | code | 方案 cell shows the raw model name | components/result/ResultPage.tsx:300 — <td>{optionLabel(option)} {optionName(option)}</td> |
| M-56 | ④–⑦ | 7 | minor | 契約 1.3.0 | No bold overall recommendation / recommended option in table A | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| M-60 | ④–⑦ | 7 | minor | code | 週 header whenever horizon parses; prompt never defines plan[].when | round 6 (2026-09-28): ai_lego/modules/research/interpret_method_record.py:128; apps/cognitive-web/components/result/ResultPage.tsx:164 (every row a week number/range, else 時間); real run result_shots11/12 header 週 |
| M-61 | ④–⑦ | 7 | minor | code | Fixed last row 週 cell shows 到期 | components/result/ResultPage.tsx:308 — <td>{horizonDays ? String(Math.ceil(horizonDays / 7)) : horizon ? '到期' : '之後'}</td> (90 → 13) |
| M-62 | ④–⑦ | 7 | minor | 操作者決定 | Rerun row says 你＋系統提醒; mock promises 系統自動 | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| M-63 | ④–⑦ | 7 | minor | code | 下方三個指標 / 見 C shown without metrics | components/result/ResultPage.tsx:308 — metrics.length ? `下方${NUMERAL[n]}個指標` : '—' and metrics.length ? '見 C' : '—' |
| M-64 | ④–⑦ | 7 | minor | code | signoff lacks what/which option; hidden without a plan | ai_lego/modules/research/interpret_method_record.py:130 signoff = who has to agree to what (in brackets) and which option cannot go ahead…; components/result/ResultPage.tsx:311 rendered after the plan fragment (:303-310 closes first) |
| M-68 | ④–⑦ | 7 | minor | code | 現在/目標 prefixes can double | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-69 | ④–⑦ | 7 | minor | code | Numbers in metrics[].name unchecked | ai_lego/modules/research/interpret_method_record.py:391 facts('solutions', f'solutions.metrics[{index}].name', metric.get('name')); :134 NUMBERS lists solutions.metrics[].name |
| M-72 | ④–⑦ | 7 | minor | code | Due-today tasks not flagged; reminder only once overdue | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| M-74 | ④–⑦ | 7 | minor | code | Save-as-tasks button disabled with no visible reason | Codex e01fc7d49 (2026-09-28) |
| M-80 | ④–⑦ | 7 | minor | code | Unparseable horizon silently defaults the date to +90 days | components/result/ResultPage.tsx:319 setRerunDue(horizonDays ? plusDays(horizonDays) : ''); :333 排提醒 disabled={!rerunDue}; :182 label 到期重跑… without days |
| M-81 | ④–⑦ | 7 | minor | code | todayIso is a UTC date | lib/projects.ts:43 — export const todayIso = () => plusDays(0); (local date) |
| M-83 | ④–⑦ | 7 | minor | code | Case-library note omits 回到 A 重選, quotes a missing button, P4 jargon | components/result/ResultPage.tsx:73 CASE_NOT_BUILT(rerunLabel) …現在按「${rerunLabel}」…沒改善就回到上面的 A 表重選。; :335 <a className='btn ghost' href='#solution'>回到 A 重選</a> |
| N-03 | ⑧–核准＋流程 | 8 | minor | code | Journey done pill shows headline, not where the problem sits (第 N 層) | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-04 | ⑧–核准＋流程 | 8 | minor | 契約 1.3.0 | Journey bracket is the long answers sentence, repeated in the card | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| N-07 | ⑧–核准＋流程 | 8 | minor | code | Lead repeats ① summary verbatim instead of stating position | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-08 | ⑧–核准＋流程 | 8 | minor | 契約 1.3.0 | Bold next step names the tool, no 因為 clause | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| N-09 | ⑧–核准＋流程 | 8 | minor | code | Hard-coded 差別是有沒有數字撐它 false for non-numeric steps | Codex 3199a4f9a (2026-09-28) |
| N-15 | ⑧–核准＋流程 | 8 | minor | code | Carried inputs now get an [n] and a ⑨ row | components/result/ResultPage.tsx:113 `...(result.next_steps ?? []).flatMap((step) => Object.values(step.prefill ?? {}))` in citationIds; :353 cites(carried) |
| N-18 | ⑧–核准＋流程 | 8 | minor | code | Minutes made up (tokens/8000); NT$ wording; hard-coded 兩到三分鐘 | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| N-22 | ⑧–核准＋流程 | 8 | minor | code | 先看它做什麼 → tool page 開始 drops project and prefill | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-24 | ⑧–核准＋流程 | 8 | minor | code | #ask link drops the project; picks start in a new project | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-27 | ⑧–核准＋流程 | 8 | minor | code | Footer promises red marks on the opened form (not built) | Codex 3199a4f9a (2026-09-28) |
| N-31 | ⑧–核准＋流程 | 9 | minor | code | Circled numeral stripped from input names | components/result/ResultPage.tsx:125 inputName = label.split('：')[0] then replace of a leading ①-⑳ |
| N-34 | ⑧–核准＋流程 | 9 | minor | code | 要提高 advice has no link and always names steps[0] | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-45 | ⑧–核准＋流程 | approve | minor | 操作者決定 | 核准 可被下一步引用 / 已抹除 have no behaviour behind them | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| N-48 | ⑧–核准＋流程 | approve | minor | code | 匯出 PDF: judgment printed, title set, input card hidden | components/result/ResultPage.tsx:232 <p className="print-only">你的判斷：…; :386 document.title=`${name}分析：${headline}` restored on afterprint; app/globals.css:17-20 hides #input,.howto,.crumbs,.btns and shows .print-only (external sources still print as hashes, N-32) |
| N-49 | ⑧–核准＋流程 | approve | minor | code | Expert link now opens details, but no 閘門表 | Codex e01fc7d49 (2026-09-28) |
| N-51 | ⑧–核准＋流程 | approve | minor | code | Expert JSON is the full dump, not the mock's compact object | Codex 137186da4 (2026-09-28) |
| N-52 | ⑧–核准＋流程 | approve | minor | 操作者決定 | Approve card has extra actions (刪除專案, compare) vs mock's four | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-55 | ⑧–核准＋流程 | flow | minor | 操作者決定 | Lesson demo domain ignored; one default example | 2026-09-28 session batch: method-form-examples.yaml `sets` (partner / decision / ecom / daily) + LessonView chip -> `#demo=<set>` -> RunPage fills that set; each set passes the real builder and gates (tests/unit/test_method_form.py) |
| N-56 | ⑧–核准＋流程 | flow | minor | code | Hint names the real ProjectPage button label | components/RunPage.tsx:159 '按「在這個專案再用「{name}」分析一次」' = ProjectPage.tsx:81 |
| N-58 | ⑧–核准＋流程 | flow | minor | code | Stored result unviewable when the form endpoint fails | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-59 | ⑧–核准＋流程 | flow | minor | code | Rerun loses compare link after reload | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-60 | ⑧–核准＋流程 | flow | minor | code | Stale ?rerun= trusted; every submit fails with API 400 | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-61 | ⑧–核准＋流程 | flow | minor | code | 改存到別的專案 picker active during redo/rerun | round 6 (2026-09-28): apps/cognitive-web/components/RunPage.tsx:156 |
| N-64 | ⑧–核准＋流程 | flow | minor | code | Delete-while-running now 409; residual writes and untested late path | 2026-09-28 session batch: delete-while-running 409 (main.py delete_project) + a runner that died no longer keeps it: interpretation run lock (plan P-k, `_interpretation_lock_path` / `_analyses` in main.py) reads a PENDING without a live runner as FAILED / INTERPRETATION_RUNNER_LOST, so the Project can be deleted (tests/unit/test_api_interpret.py test_a_runner_that_died_...) |
| N-65 | ⑧–核准＋流程 | projects | minor | code | No delete on project page/list; only on a DONE result | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-66 | ⑧–核准＋流程 | projects | minor | code | 已抹除 tombstone invisible | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-67 | ⑧–核准＋流程 | projects | minor | code | Compare page tells you to approve/reselect but has no buttons | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-68 | ⑧–核准＋流程 | flow | minor | code | Redo submits with unrestored fields empty, no warning | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-69 | ⑧–核准＋流程 | projects | minor | 改示意稿 | Projects sub/button wording differs from mock (one analysis = one project) | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-70 | ⑧–核准＋流程 | projects | minor | 改示意稿 | h2 你的專案 N 個 vs mock 進行中的專案 示範/自己的 | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-71 | ⑧–核准＋流程 | projects | minor | 改示意稿 | Projects 怎麼讀 strip wording differs from mock | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-72 | ⑧–核准＋流程 | projects | minor | 改示意稿 | Six columns (extra 建立) vs mock's five | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| N-73 | ⑧–核准＋流程 | projects | minor | code | 工具： prefix repeats per tool | round 6 (2026-09-28): apps/cognitive-web/components/ProjectList.tsx:34 |
| N-74 | ⑧–核准＋流程 | projects | minor | code | 走到哪 in six-step words | lib/projects.ts:24-28 分析（進行中）/分析（沒有完成）/核准（已核准）/報表（已退回，待重做）/報表（AI 草稿・尚未核准） |
| N-77 | ⑧–核准＋流程 | projects | minor | code | Footer with 刪除專案 definition always shown | components/ProjectList.tsx:48 footer rendered unconditionally, text identical to home-mock.html:1100 |
| N-79 | ⑧–核准＋流程 | projects | minor | code | No six-step journey card / position on project page | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-83 | ⑧–核准＋流程 | projects | minor | code | Projects auto-named tool+time; no rename | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| N-84 | ⑧–核准＋流程 | projects | minor | code | Task owner/due cannot be filled later | 2026-09-28 session batch: worker 1 (409 TASKS_ALREADY_SAVED / RERUN_ALREADY_SCHEDULED + page reads state; 選這條 stored on TaskCreated; KPI goal rows; TASK_DUE_REQUIRED; due_today; TaskUpdated; judgment never silently lost; prompt M-68) |
| C1-05 | 表頭–③ | 1 | minor | code | 建議 shows （預期：…） and lacks 。 before 證據缺口 | components/result/ResultPage.tsx:224 — no expected rendered (grep 預期 only hits the type at :32); {(result.gaps ?? []).length > 0 ? '。' : ''} before <b>證據缺口：</b> at :225 |
| C1-10 | 表頭–③ | 1 | minor | 改示意稿 | Judgment sub line: web claim fixed, mock still promises carry-forward | Codex e01fc7d49 (2026-09-28) |
| C2-06 | 表頭–③ | 2 | minor | code | Wavy water line missing | components/result/MethodVisual.tsx:51 — <path d={`M0,${water} q20,-8 40,0${' t40,0'.repeat(26)}`} fill='none' stroke='#7aa7cc' strokeWidth='2.5' /> |
| C2-10 | 表頭–③ | 2 | minor | code | Label/text positions in the iceberg drawing off the mock | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| C2-12 | 表頭–③ | 2 | minor | code | ★ 建議先出手 rendered in accent class (mock: ink) | components/result/MethodVisual.tsx:60 — {units[index]?.focus && <span> ★ 建議先出手</span>}; asserted at components/result/ResultPage.test.tsx:96 |
| C2-13 | 表頭–③ | 2 | minor | code | Uncited layers get no ［n］ (mock numbers all four) | components/result/ResultPage.tsx:107 layerPaths = fields.map((field) => `r/${field.key}`) for the iceberg; :114 ...layerPaths appended to citationIds |
| C2-18 | 表頭–③ | 2 | minor | 契約 1.3.0 | .thick dots are line counts and carry no per-layer reason | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| C3-02 | 表頭–③ | 3 | minor | code | Heading/sub say 三張圖 when fewer charts render | components/result/ResultPage.tsx:167 chartCount = [trend, loop, iceberg].filter(Boolean).length; used at :243 title and :263 sub |
| C3-03 | 表頭–③ | 3 | minor | 改示意稿 | ③ act sentence differs from mock; mock's 示意 line not updated | Codex e01fc7d49 (2026-09-28) |
| C3-05 | 表頭–③ | 3 | minor | code | Chart layer notes computed from citations, not the mock's fixed notes | components/result/ResultPage.tsx:246 {iceberg ? '（第 2 層）' : layerNote(…)}; :251 {iceberg ? '（第 3、4 層）' : layerNote(…)} |
| C3-07 | 表頭–③ | 3 | minor | code | Extra right axis line | components/result/Charts.tsx:31 — only the left (x=50) and bottom (y=180) axis lines; no x=420 vertical |
| C3-08 | 表頭–③ | 3 | minor | code | Tick tops raw max; top value plotted at y=30 vs label at y≈20 | Codex 137186da4 (2026-09-28) |
| C3-09 | 表頭–③ | 3 | minor | code | Tick labels can run past the axis / the 460 viewBox | Codex 137186da4 (2026-09-28) |
| C3-12 | 表頭–③ | 3 | minor | code | Series annotations at fixed positions, fixed height | components/result/Charts.tsx:39 ax/ay clamped beside the last point; :40 height={linesFor(text, 200, 12) * lineHeight(12) + 2} |
| C3-13 | 表頭–③ | 3 | minor | code | Footnote plain text, drops 兩線同時變化不代表因果 | components/result/Charts.tsx:25 foot adds '；兩線同時變化不代表因果。' when series.length > 1; :41 rendered as Wrap sized by linesFor (:26-28) |
| C3-14 | 表頭–③ | 3 | minor | code | 注意 wording differs and shows with one series | components/result/ResultPage.tsx:248 — {result.trend.series.length > 1 && <><b>注意：</b>同時發生不等於一個造成另一個。</>} |
| C3-16 | 表頭–③ | 3 | minor | code | Loop aria-label repeats 迴路 | components/result/Charts.tsx:68 aria-label={`${loop.name.replace(/迴路$/, '')}因果迴路`}; components/result/ResultPage.test.tsx:96 asserts aria-label=等答案因果迴路 |
| C3-17 | 表頭–③ | 3 | minor | code | Loop geometry differs from the mock (box size, first node, width, order) | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| C3-18 | 表頭–③ | 3 | minor | 契約 1.3.0 | No belief feeder box outside the loop (schema has no field) | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| C3-19 | 表頭–③ | 3 | minor | code | （信念層） line not counted in box height | components/result/Charts.tsx:55 — linesFor(node.text, BOX_W - 16, BOX_TEXT) + (dashed.has(node.id) ? 1 : 0) |
| C3-20 | 表頭–③ | 3 | minor | code | Loop title 14px, clipped, overlapping the notes; still wraps to 2 lines | Codex 137186da4 (2026-09-28) |
| C3-21 | 表頭–③ | 3 | minor | code | Loop notes box clips its second sentence | components/result/Charts.tsx:66 noteH = (linesFor(note1, centreW, 11) + linesFor(note2, centreW, 11)) * lineHeight(11) + 2; :80 Wrap height={noteH} |
| C3-22 | 表頭–③ | 3 | minor | code | 圖 B read lacks node count and 發現 N cross-reference | components/result/ResultPage.tsx:253 — {NUMERAL[nodes.length]}個方框繞一圈是迴路 … 來源 … {loopFindings.length ? `、${… 發現 N}` : ''}; loopFindings at :168-169 |
| C3-25 | 表頭–③ | 3 | minor | code | 圖 C 看到 missing the fixed 第 3 層 sentence | components/result/ResultPage.tsx:258 — <b>看到：</b>第 3 層是「做得到、也撐得久」的交會點。{focusLayer ? `這次建議先出手的是…` : ''} |
| C3-26 | 表頭–③ | 3 | minor | 改示意稿 | ③ sub says 圖 B、C 由分析結果生成 (C is method knowledge); mock not fixed | Codex e01fc7d49 (2026-09-28) |
| E-03 | 表頭–③ | empty | minor | code | Empty-state sub wording and false confirm claim | components/RunPage.tsx:178 — 執行之前不花錢；按下去會先說要花多少，你確認才跑。 (now true via I-11) |
| E-04 | 表頭–③ | empty | minor | code | Empty card still shown while an analysis runs | components/RunPage.tsx:175 — {!pendingId && <div className='card' id='result'> |
| H-01 | 表頭–③ | header | minor | 操作者決定 | Project crumb is a Link and shows before any result (mock: plain span, result only) | 2026-09-28 session batch: mock-first alignment (rerun = reminder in the mock; project link in the crumbs; 刪除專案 on the mock's approve card; 我的專案 mock = one analysis per project, 建立 column) + free read-only 示範專案 (/projects/demo/iceberg from a real run) |
| H-05 | 表頭–③ | header | minor | 改示意稿 | Tool line time is to the minute on the web, date only in the mock | Codex 3199a4f9a (2026-09-28) |
| H-10 | 表頭–③ | header | minor | code | Pre-result header shows a 還沒執行 pill (mock has no pill before a result) | components/RunPage.tsx:173 — {(pendingId ｜｜ lastFailed) && <span className='pill'>{pendingId ? '分析中' : '上次分析沒有完成'}</span>} |
| H-12 | 表頭–③ | header | minor | code | 和上一版並排比較 link sat in the status strip (not in the mock) | components/result/ResultPage.tsx:389 — compare Link now in the approve card .btns; status strip :211-216 has no link |
| H-13 | 表頭–③ | header | minor | code | How strip says 填好或改好格子 instead of 四格 | components/RunHeader.tsx:16,26 — boxes = numeral + 格 from count; RunPage.tsx:173 count={count}; ResultPage.tsx:211 count={fields.length} |
| I-06 | 表頭–③ | input | minor | code | Required asterisk on iceberg layer labels (mock has none) | components/MethodForm.tsx:44 — {label}{field.required && !extra ? ' *' : ''} |
| I-09 | 表頭–③ | input | minor | code | Placeholders are the long demo lines, not the mock's short examples; no name attr | 2026-09-28 session batch: worker 2 (prefill checked against the target record schema + coerced + needs marked; Chinese labels from the target form; toolHref keeps project and prefill; position line; approval carried; workflow button honest; short placeholders; 要提高 links #sources) |
| I-12 | 表頭–③ | input | minor | code | Cost note sat between the form buttons | components/MethodForm.tsx:89 .btns = 執行分析 / 用示範案例填入 / 清空，填我自己的 only; props at :83 have no note |
| P-10 | 管線＋流程 | gate | minor | code | Retry keeps the second answer even if it lost more | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-11 | 管線＋流程 | prompt | minor | code | Prompt contradicts tool call; r/foo example; undefined est_cost/level | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-12 | 管線＋流程 | schema | minor | code | confidence.level 'medium' fails schema (no normalisation) | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-13 | 管線＋流程 | gate | minor | code | Several fact fields escape the numbers check | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| P-14 | 管線＋流程 | schema | minor | 契約 1.3.0 | Contract cannot express a loop feeder (mock 圖 B belief box) | 2026-09-28 session batch: contract 1.3.0 (next_steps short/on_path/why, diagnosis, priority_short, units.thickness, gaps path/citations, solutions.recommended, loop.feeders; add_blank_unit_gaps; page renders each) |
| P-17 | 管線＋流程 | tests | minor | 測試 | Loop layout test checks stale default geometry | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| P-20 | 管線＋流程 | tests | minor | 測試 | cost_twd assertion can never fail | round 6 (2026-09-28): tests/unit/test_api_interpret.py:196 assertIsNone (fake model unpriced); tests/unit/test_pricing.py:25 exact NT$ with a priced model |
| P-21 | 管線＋流程 | provider | minor | code | claude-opus-4 prefix priced $5/$25; no pricing tests | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| P-22 | 管線＋流程 | api | minor | code | Bad price env makes every result page 500 | round 6 (2026-09-28): ai_lego/apps/api/main.py:361 (InvariantViolation -> None + warning); used at both cost sites |
| P-23 | 管線＋流程 | api | minor | code | list_projects N+1: four full scans per project | round 6 (2026-09-28): ai_lego/apps/api/main.py:1700 |
| P-25 | 管線＋流程 | api | minor | code | Rerun due dates: client local, server UTC | round 6 (2026-09-28): ai_lego/apps/api/main.py:371 (UTC-12 rule) used by schedule_rerun and tasks.overdue; lib/projects.ts:43 todayIso local |
| P-26 | 管線＋流程 | api | minor | code | Rerun not checked against method; stale link → raw error | 2026-09-28 session batch: worker 3 (lib/errors.ts humanError everywhere; result viewable without the form; rerun_of; stale rerun dropped + method check; redo blocked until fields restored; rename; delete on the project page; erased list; compare buttons; sources card; six-step journey; external sources by title + link) |
| P-30 | 管線＋流程 | tests | minor | code | Failed task toggle replaces the whole project page | Codex 3199a4f9a (2026-09-28) |
| P-33 | 管線＋流程 | checker | minor | code | Mock cards matched by position with no count check | Codex e01fc7d49 (2026-09-28) |
| P-34 | 管線＋流程 | checker | minor | code | Horizon label false red fixed; empty-stem collapse remains | round 6 (2026-09-28): docs/mockups/check-mocks.py:906 |
| P-35 | 管線＋流程 | checker | minor | code | --parity silently skipped on non-iceberg pages; mock path fixed | Codex e01fc7d49 (2026-09-28) |
| P-37 | 管線＋流程 | tests | minor | 測試 | Parity test uses a hand-written #input card, not RunPage's | Codex e01fc7d49 (2026-09-28) |
| P-38 | 管線＋流程 | tests | minor | 測試 | Main web fixture invalid against schema, no 1.2.0 fields | Codex e01fc7d49 (2026-09-28) |
| P-39 | 管線＋流程 | schema | minor | 測試 | Golden fixtures stale for 1.2.0; no length invalid cases | Codex e01fc7d49 (2026-09-28) |
| P-41 | 管線＋流程 | e2e | minor | 測試 | Live-mode e2e writes a real approval | Codex e01fc7d49 (2026-09-28) |
| P-42 | 管線＋流程 | tests | minor | 測試 | Test classes defined after unittest.main() guard | round 6 (2026-09-28): tests/unit/test_interpret_method_record.py and tests/unit/test_ai_gateway.py: the `if __name__` guard is the last statement (python - checked: guard index > every class) |
| P-44 | 管線＋流程 | process | minor | 流程 | Dev helpers untracked / scratch-only; absolute D:/Work paths | 2026-09-28 session batch: loop/deploy/dev (LoopChart mock geometry + ringOrder; iceberg baselines [80,46,41,37]; withDefinitions dfn; deploy.sh gate + deploy/web_test.sh; scripts/dev paths from the script; pricing rows checked against platform.claude.com) |
| P-45 | 管線＋流程 | api | minor | code | Per-tenant AI lock held for the whole interpretation | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| P-46 | 管線＋流程 | api | minor | code | First-run estimate low; no retry upper bound shown | 2026-09-28 session batch: approve bar (approveChecks from citation_integrity.unsupported / top_down_completeness / no_preset_conclusion; record_gate_results + schema_version in the artifact; isOldVersion by gates; budget reservation instead of a lock over the model call; estimate seconds + tokens_max) |
| P-47 | 管線＋流程 | provider | minor | code | Tokens of a failed/cut-off call not counted; refusal not distinguished | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |
| M-01 | ④–⑦ | 4 | suggestion | code | ④ heading | components/result/ResultPage.tsx:266 — title={`④ 由上往下${layerCount}解讀（每張卡同一格式）`} |
| M-02 | ④–⑦ | 4 | suggestion | code | ④ how strip | components/result/ResultPage.tsx:266 — read={N}張卡同一格式，由上往下。 act='找出資料最薄的一層，之後補。' |
| M-03 | ④–⑦ | 4 | suggestion | code | Layer cards layer lN card mb12 / last mb0 | components/result/ResultPage.tsx:268 — className={`layer l${…} card ${index === layers.length - 1 ? 'mb0' : 'mb12'}`} |
| M-04 | ④–⑦ | 4 | suggestion | code | h3 第 1 層／4：事件 Events | components/result/ResultPage.tsx:269 <h3>第 {index + 1} 層／{layers.length}：{layer.label}</h3>; label = ICEBERG_LAYERS[index]?.title (:140); MethodVisual.tsx:13 title '事件 Events' |
| M-07 | ④–⑦ | 4 | suggestion | code | Layer 4 h3 心智模型 Mental Models | components/result/MethodVisual.tsx:16 title: '心智模型 Mental Models' |
| M-08 | ④–⑦ | 4 | suggestion | code | .meta seen/time/mode | components/result/ResultPage.tsx:269 — <span className='meta'>{facts.seen} ・ 時間：{facts.time} ・ 出手方式：{facts.mode}</span> |
| M-09 | ④–⑦ | 4 | suggestion | code | 這層問 layer 1 | components/result/ResultPage.tsx:270 <span className='q'>{facts?.ask4 ?? question(layer.path)}</span>; MethodVisual.tsx:13 ask4 '現在發生了什麼？' |
| M-13 | ④–⑦ | 4 | suggestion | code | 你填的 row with cites | components/result/ResultPage.tsx:271 — <b>你填的</b><span>{resolved(layer.path)} {cites(citedUnder(layer.path))}</span> |
| M-14 | ④–⑦ | 4 | suggestion | code | 這代表 row | components/result/ResultPage.tsx:272 — {reading && <div className='row'><b>這代表</b>…} |
| M-18 | ④–⑦ | 4 | suggestion | code | .lever badge class | components/result/ResultPage.tsx:273 — <span className={`lever ${reading.leverage}`}>槓桿：…</span> |
| M-24 | ④–⑦ | 4 | suggestion | code | 資料厚度 row | components/result/ResultPage.tsx:275 — <b>資料厚度</b><span>你填 {…} 句・外部 {…} 筆 → …</span> |
| M-30 | ④–⑦ | 4 | suggestion | code | Iceberg facts indexed by position when rendered without fields | Codex 3199a4f9a (2026-09-28) |
| M-31 | ④–⑦ | 5 | suggestion | code | ⑤ heading | components/result/ResultPage.tsx:280 — title={focusLayer ? '⑤ 總結：在哪一層出手' : '⑤ 總結'} |
| M-32 | ④–⑦ | 5 | suggestion | code | ⑤ how strip | components/result/ResultPage.tsx:280 — read='三句話：問題在哪、先做哪層、還缺什麼。' act='手上有缺口的資料，就回上面補、再執行。' |
| M-37 | ④–⑦ | 5 | suggestion | code | 證據缺口（老實說） warn box | components/result/ResultPage.tsx:283 — <div className='finding warn'><b>證據缺口（老實說）</b> |
| M-40 | ④–⑦ | 6 | suggestion | code | ⑥ heading | components/result/ResultPage.tsx:286 — '⑥ 理解層次對照表（改編自 Anderson & Johnson）' |
| M-41 | ④–⑦ | 6 | suggestion | code | ⑥ how strip | components/result/ResultPage.tsx:286 — read='一列一層，★ 是建議先出手的列。' act='四列都要有人負責，填在 ⑦ B 表。' |
| M-42 | ④–⑦ | 6 | suggestion | code | Six columns | components/result/ResultPage.tsx:288 — <th>層</th><th>出手方式</th><th>時間取向</th>…<th>這一層問的問題</th><th>你的案例</th><th>建議動作</th> |
| M-43 | ④–⑦ | 6 | suggestion | code | 層 cell with ★ | components/result/ResultPage.tsx:289-290 — star = focusKey === keyOf(layer.path) ? ' ★' : ''; <td>{facts.short}{star}</td> |
| M-44 | ④–⑦ | 6 | suggestion | code | 出手方式 and 時間取向 cells | components/result/ResultPage.tsx:290 <td>{facts.mode}</td><td>{facts.when}</td>; MethodVisual.tsx:13-16 when 現在/過去→現在/現在→未來/未來 |
| M-45 | ④–⑦ | 6 | suggestion | code | 這一層問的問題 cells | components/result/ResultPage.tsx:290 <td>{facts?.asks ?? question(layer.path)}</td>; MethodVisual.tsx:13 asks 最快的因應是什麼？ |
| M-46 | ④–⑦ | 6 | suggestion | code | 你的案例 brief + cites | components/result/ResultPage.tsx:290 — <td>{reading?.brief ?? resolved(layer.path)} {cites(citedUnder(layer.path))}</td> |
| M-47 | ④–⑦ | 6 | suggestion | code | 建議動作 short step | components/result/ResultPage.tsx:290 — <td>{reading?.step ?? reading?.action ?? '—'}</td> |
| M-48 | ④–⑦ | 6 | suggestion | code | ⑥ footer sub | components/result/ResultPage.tsx:292 — 越往下一列：出手越慢、越難，但改變越根本。四列都要有人負責，不是只選一列。 |
| M-49 | ④–⑦ | 7 | suggestion | code | ⑦ card okline #solution heading | components/result/ResultPage.tsx:295 — <Card id='7' className='card okline' anchor='solution' title='⑦ 解決方案：從分析到行動（選方案 → 行動計畫 → 追蹤驗證）' |
| M-51 | ④–⑦ | 7 | suggestion | code | ⑦ act 選方案、填負責人和期限、確認目標數字 | components/result/ResultPage.tsx:295 — act={solutions ? '選方案、填負責人和期限、確認目標數字。' : …} (controls behind it: M-75, M-76) |
| M-52 | ④–⑦ | 7 | suggestion | code | h3 A. 選方案：N條路比一比 | components/result/ResultPage.tsx:297 — <h3 className='mt6 mb8'>A. 選方案：{NUMERAL[options.length]}條路比一比</h3> |
| M-53 | ④–⑦ | 7 | suggestion | code | Table A columns | components/result/ResultPage.tsx:299 — <th>方案</th><th>做什麼</th><th>見效</th><th>成本</th><th>持久度</th><th>風險</th><th>建議</th> |
| M-55 | ④–⑦ | 7 | suggestion | code | 做什麼 ends with （第 N 層） | components/result/ResultPage.tsx:300 — {option.what}{option.paths.length ? `（第 ${layerNumbers(option.paths).join('、')} 層）` : ''} |
| M-57 | ④–⑦ | 7 | suggestion | code | 如果只做一件事，明天就做 | components/result/ResultPage.tsx:302 — <div className='finding mt12'><b>如果只做一件事，明天就做</b>{solutions.first_step}</div> |
| M-58 | ④–⑦ | 7 | suggestion | code | h3 B. 90 天行動計畫 | components/result/ResultPage.tsx:304 — <h3>B. {solutions.horizon ?? ''}行動計畫（AI 起草；負責人與期限請你確認）</h3> |
| M-59 | ④–⑦ | 7 | suggestion | code | Plan table columns | components/result/ResultPage.tsx:306 — <th>負責<span className='sub'>（待確認）</span></th>…<th>目標<span className='sub'>（待你確認）</span></th> |
| M-66 | ④–⑦ | 7 | suggestion | code | .kpis > .kpi structure | components/result/ResultPage.tsx:314 — <div className='kpis'>…<div className='kpi'><b>{metric.name}</b><span className='now'>…<span className='goal'>…<span className='when'> |
| M-67 | ④–⑦ | 7 | suggestion | code | 現在 value with its record cite | components/result/ResultPage.tsx:314 — 現在 {kpiNow(metric.now)}{metric.now_citation ? <> {cites([metric.now_citation])}</> : null} |
| M-70 | ④–⑦ | 7 | suggestion | code | Primary button 把行動計畫存成任務，設提醒 | components/result/ResultPage.tsx:318 — <button type='button' className='btn primary' …>把行動計畫存成任務，設提醒</button> |
| M-82 | ④–⑦ | 7 | suggestion | code | Button 改善了就記進案例庫；沒改善回到 A 重選 | components/result/ResultPage.tsx:320 — <button …onClick={() => setPlanNote(CASE_NOT_BUILT(rerunLabel))}>改善了就記進案例庫；沒改善回到 A 重選</button> |
| M-86 | ④–⑦ | 7 | suggestion | code | Real success notes styled as mock placeholder (.mocknote) | Codex e01fc7d49 (2026-09-28) |
| N-01 | ⑧–核准＋流程 | 8 | suggestion | code | ⑧ heading matches mock | components/result/ResultPage.tsx:341 title='⑧ 下一步：你在這條路的哪裡、接著做什麼' = docs/mockups/iceberg-result-mock.html:641 |
| N-02 | ⑧–核准＋流程 | 8 | suggestion | code | ⑧ 怎麼讀 strip matches mock | components/result/ResultPage.tsx:341 read='旅程列是你在哪；每張卡寫做了會得到什麼、要你再填什麼。' act='選一張，或都不選。' = iceberg-result-mock.html:642 |
| N-06 | ⑧–核准＋流程 | 8 | suggestion | code | 最後：⑦ pill shown when solutions exist | components/result/ResultPage.tsx:342 `{solutions && …<span>最後：⑦ 解決方案定案與追蹤</span>}` |
| N-10 | ⑧–核准＋流程 | 8 | suggestion | code | Card title links tool; tag only on first card | components/result/ResultPage.tsx:351 Link toolHref + `{index === 0 && <span className="tag">本工具建議的下一步</span>}` |
| N-11 | ⑧–核准＋流程 | 8 | suggestion | code | 回答什麼 line present | components/result/ResultPage.tsx:352 `{step.answers && …回答什麼：…}` |
| N-16 | ⑧–核准＋流程 | 8 | suggestion | code | need span shown red | components/result/ResultPage.tsx:353 <span className="need">; app/design-system.css:157 .mcard .need{color:var(--warn)} |
| N-17 | ⑧–核准＋流程 | 8 | suggestion | code | 會得到 line present | components/result/ResultPage.tsx:354 `{step.yields && …會得到：…}` |
| N-25 | ⑧–核准＋流程 | 8 | suggestion | code | 直接去 ⑦ link targets #solution | components/result/ResultPage.tsx:362 href='#solution'; :295 anchor='solution' |
| N-26 | ⑧–核准＋流程 | 8 | suggestion | code | 都不做 link targets #approve | components/result/ResultPage.tsx:363 href='#approve'; :374 id='approve' |
| N-29 | ⑧–核准＋流程 | 9 | suggestion | code | ⑨ heading matches mock | components/result/ResultPage.tsx:369 title='⑨ 引註（每個 [n] 都指向一段可查的來源）' = mock:697 |
| N-30 | ⑧–核准＋流程 | 9 | suggestion | code | ⑨ 怎麼讀 strip matches mock | components/result/ResultPage.tsx:369 read='[n] 是那句話的來源。' act='引錯了，按下方「退回並說原因」。' = mock:698 |
| N-35 | ⑧–核准＋流程 | 9 | suggestion | code | [n] anchors resolve to li with data-source | components/result/ResultPage.tsx:120 <a href=#citation-N>; :370 <li id=citation-N data-source={id}> |
| N-36 | ⑧–核准＋流程 | approve | suggestion | code | AI 推論，尚未經人核准 / decision text | components/result/ResultPage.tsx:376 這一頁是 <b>{approvalText}</b>; :208 default 'AI 推論，尚未經人核准', 已核准（誰，何時）／已退回 |
| N-37 | ⑧–核准＋流程 | approve | suggestion | code | 模型 shown | components/result/ResultPage.tsx:377 <span>模型 <b>{result.model}</b></span> |
| N-38 | ⑧–核准＋流程 | approve | suggestion | code | 費用 line via costLine | components/result/ResultPage.tsx:378 costLine(tokens, costTwd); lib/projects.ts:32-35 '約 6k tokens・≈ NT$1' |
| N-41 | ⑧–核准＋流程 | approve | suggestion | code | 引註完整 chip | components/result/ResultPage.tsx:61 citation_integrity: '引註完整'; :62 tip |
| N-44 | ⑧–核准＋流程 | approve | suggestion | code | 你的判斷 in meta-bar | components/result/ResultPage.tsx:380 你的判斷 <b>{STANCE or 尚未填}</b>（① 下方） |
| N-46 | ⑧–核准＋流程 | approve | suggestion | code | 核准，存進專案 records who and when | components/result/ResultPage.tsx:384 disabled once approved; ai_lego/apps/api/main.py:1476 event with by/by_name; :1477 response at=_now_iso() (not the event's occurred_at) |
| N-47 | ⑧–核准＋流程 | approve | suggestion | code | 退回並說原因 → 依原因重做 flow | components/result/ResultPage.tsx:385, :391-395; RunPage.tsx:124-128 redo, :136 body.revision; ai_lego/apps/api/main.py:1290, :1374-1393 |
| N-50 | ⑧–核准＋流程 | approve | suggestion | code | Expert summary text matches mock | components/result/ResultPage.tsx:397 <summary>專家模式（今天你看到的那一層，收起來但還在）</summary> |
| N-53 | ⑧–核准＋流程 | flow | suggestion | code | Direct open: empty fields, nothing spent, project on run | components/RunPage.tsx:64 empty initialState; :71 estimate; :155 存到：新專案; :135 project created in launch; :141 address becomes the analysis |
| N-57 | ⑧–核准＋流程 | flow | suggestion | code | Saved analysis reopens as it was | components/AnalysisPage.tsx:19 project check; RunPage.tsx:41-43 DONE/FAILED/PENDING init, :85-100 polling |
| N-75 | ⑧–核准＋流程 | projects | suggestion | code | 最後更新 column | components/ProjectList.tsx:37 formatTime(updated_at ?? created_at) |
| N-76 | ⑧–核准＋流程 | projects | suggestion | code | 下一步 buttons | components/ProjectList.tsx:38-42 到期了：重跑並比較 → / 看結果、核准 → / 看結果 → / 打開專案 → |
| N-82 | ⑧–核准＋流程 | projects | suggestion | code | Same nine-section page; expert folded | docs/mockups/check-mocks.py:837 RESULT_SECTIONS, :856 [result-sections]; components/result/ResultPage.tsx:397 <details id=expert> |
| C1-01 | 表頭–③ | 1 | suggestion | code | ① card accent #result heading | components/result/ResultPage.tsx:219 — <Card id='1' className='card accent' anchor='result' title='① 結論（文字分析）' |
| C1-02 | 表頭–③ | 1 | suggestion | code | ① how strip | components/result/ResultPage.tsx:219 — read=先看一句話，再看{N}個發現各自的信心。 act=在最下面寫你自己的判斷。 |
| C1-03 | 表頭–③ | 1 | suggestion | code | p.lead.mt0 一句話 | components/result/ResultPage.tsx:221 — <p className='lead mt0'><b>一句話：</b>{result.summary}</p> |
| C1-04 | 表頭–③ | 1 | suggestion | code | Findings with confidence badge and cites | components/result/ResultPage.tsx:222 — <b>發現 {index + 1}｜{finding.title}<span className={`conf ${cls}`}>信心：{zh}——{reason}</span></b> |
| C1-06 | 表頭–③ | 1 | suggestion | code | 改判條件 warn finding | components/result/ResultPage.tsx:227 — <div className='finding warn'><b>改判條件（出現這些證據，結論要改）</b> |
| C1-07 | 表頭–③ | 1 | suggestion | code | .judge heading | components/result/ResultPage.tsx:228 — <div className='judge'><b>你的判斷（你的原話才是記錄；上面 AI 寫的只是附掛）</b> |
| C1-08 | 表頭–③ | 1 | suggestion | code | 同意／部分同意／不同意 buttons | components/result/ResultPage.tsx:229 — (Object.keys(STANCE)).map(… {STANCE[key]}); lib/projects.ts:19 |
| C1-09 | 表頭–③ | 1 | suggestion | code | Judgment textarea placeholder | components/result/ResultPage.tsx:230 — placeholder='你怎麼看？哪裡對、哪裡不對、你手上有什麼上面沒看到的證據？' |
| C2-01 | 表頭–③ | 2 | suggestion | code | ② heading | components/result/ResultPage.tsx:237 — title={iceberg ? '② 冰山圖：你的問題在四層各是什麼' : …} |
| C2-02 | 表頭–③ | 2 | suggestion | code | ② how strip | components/result/ResultPage.tsx:237 — read='從上往下；★ 是建議先出手的層。' act=看你填的{四}段話有沒有放錯層。 |
| C2-03 | 表頭–③ | 2 | suggestion | code | Iceberg svg viewBox and aria-label | components/result/MethodVisual.tsx:45 — <svg viewBox={`0 0 1070 ${total}`} role='img' aria-label='冰山模型四層圖'> (total ≥ 575, bands only grow) |
| C2-04 | 表頭–③ | 2 | suggestion | code | Gradient #ice and clipPath #berg | components/result/MethodVisual.tsx:47-48 — linearGradient id='ice' five stops; clipPath id='berg' |
| C2-05 | 表頭–③ | 2 | suggestion | code | Water rect | components/result/MethodVisual.tsx:50 — <rect x='0' y={water} … className='water' opacity='0.55' /> |
| C2-07 | 表頭–③ | 2 | suggestion | code | Dashed band separators | components/result/MethodVisual.tsx:52-53 — <line … y1={line1} … strokeDasharray='5 5' /> ×2 |
| C2-08 | 表頭–③ | 2 | suggestion | code | Berg polygon and clipped white lines | components/result/MethodVisual.tsx:54-55 — <path d={path} fill='url(#ice)' …/>; <g clipPath='url(#berg)'>…</g> |
| C2-09 | 表頭–③ | 2 | suggestion | code | Layer names in the berg | components/result/MethodVisual.tsx:56 — <text className={index ? 'w' : 'tip'} x='618' … fontSize='17'>{layer.name}</text> |
| C2-11 | 表頭–③ | 2 | suggestion | code | 水面以下：看不見 label | components/result/MethodVisual.tsx:58 — <text x='30' y={water + 22} …>水面以下：看不見 Hidden</text> |
| C2-14 | 表頭–③ | 2 | suggestion | code | Right headers React/Anticipate/Design/Transform | components/result/MethodVisual.tsx:62 — <Wrap x={RIGHT_X} … bold>{ICEBERG_LAYERS[index].mode}</Wrap> |
| C2-15 | 表頭–③ | 2 | suggestion | code | Right case line action → lasting | components/result/MethodVisual.tsx:31 act = `${unit?.step ?? layer.effect} → ${layer.lasting}`; :63 renders it |
| C2-16 | 表頭–③ | 2 | suggestion | code | ↓ 越往下 note | components/result/MethodVisual.tsx:65 — <text x='830' y={total - 15} fontSize='12' className='a'>↓ 越往下：越難改，效果越大越持久</text> |
| C2-17 | 表頭–③ | 2 | suggestion | code | .legend three spans | components/result/MethodVisual.tsx:67 — <div className='legend'><span>左：…</span><span>中：四層冰山</span><span>右：…</span></div> |
| C3-01 | 表頭–③ | 3 | suggestion | code | ③ heading and .charts | components/result/ResultPage.tsx:243-244 — title ③ 圖表分析（{N}張圖各回答一個問題）; <div className='charts'> |
| C3-04 | 表頭–③ | 3 | suggestion | code | 圖 A caption | components/result/ResultPage.tsx:246 — <b>圖 A｜趨勢：{result.trend.question ?? '真的在變嗎？'}</b> |
| C3-06 | 表頭–③ | 3 | suggestion | code | Trend svg role=img aria-label | components/result/Charts.tsx:30 — <svg viewBox={`0 0 460 ${height}`} role='img' aria-label={`${…}的變化`}> |
| C3-10 | 表頭–③ | 3 | suggestion | code | x labels | components/result/Charts.tsx:36 — labels.map((label) => <Wrap … y={186} … align='center'>{label}</Wrap>) |
| C3-11 | 表頭–③ | 3 | suggestion | code | Solid blue and dashed orange polylines | components/result/Charts.tsx:12 COLOURS ['#1f5fbf','#b25e09']; :37 strokeWidth='3' strokeDasharray={index ? '6 4' : undefined} |
| C3-15 | 表頭–③ | 3 | suggestion | code | 圖 B caption | components/result/ResultPage.tsx:251 — <b>圖 B｜因果迴路：是什麼在推？</b> |
| C3-23 | 表頭–③ | 3 | suggestion | code | 圖 C caption （四層） | components/result/ResultPage.tsx:256 — <b>圖 C｜槓桿對比：在哪一層出手最值得？</b>（四層） |
| C3-24 | 表頭–③ | 3 | suggestion | code | Leverage chart geometry and legend | components/result/Charts.tsx:85 LEVERAGE bars 60/120/180/300 & 60/120/260/330; :88 viewBox 0 0 460 210 aria-label 四層改變難度與效果持久度對比; :92 legend |
| C3-27 | 表頭–③ | 3 | suggestion | code | 圖 C 怎麼看/來源 | components/result/ResultPage.tsx:258 — 灰條是改變難度，藍條是效果與持久… <b>來源：</b>冰山模型本身的介入模式，不是你的資料。 |
| E-01 | 表頭–③ | empty | suggestion | code | Empty-state card with h2 結果 | components/RunPage.tsx:175-176 — <div className='card' id='result'><h2>結果</h2> |
| E-02 | 表頭–③ | empty | suggestion | code | Empty-state how strip | components/RunPage.tsx:177 — 按「執行分析」後，九段結果出現在這裡。<b>你要做的</b>先填上面的格子。 |
| H-02 | 表頭–③ | header | suggestion | code | Header card | components/RunHeader.tsx:19 — <div className='card' data-section='0'> |
| H-03 | 表頭–③ | header | suggestion | code | h1 tool name + headline span | components/RunHeader.tsx:20 — <h1>{name}分析{headline ? <span>：{headline}</span> : null}</h1> |
| H-04 | 表頭–③ | header | suggestion | code | Lesson button opens a new tab | components/RunHeader.tsx:21 — <a className='howto' href={lesson} target='_blank' rel='noopener'>怎麼用？先上 5 分鐘的課 ↗</a> |
| H-06 | 表頭–③ | header | suggestion | code | Result pill AI 草稿・尚未核准 | components/result/ResultPage.tsx:212 — <span className='pill'>{… : 'AI 草稿・尚未核准'}</span> |
| H-09 | 表頭–③ | header | suggestion | code | Cost line 約 Nk tokens・≈ NT$N | components/result/ResultPage.tsx:215 — <span>{costLine(tokens, costTwd)}</span>; lib/projects.ts:32-35 costLine |
| H-11 | 表頭–③ | header | suggestion | code | Empty-state cost span | components/RunPage.tsx:173 — {estimate && <span>{costLine(estimate.tokens, estimate.twd)}</span>} |
| H-14 | 表頭–③ | header | suggestion | code | Link to the lesson's 看懂結果 tab | components/RunHeader.tsx:26 — href={`${lesson}#panel-read`} target='_blank' |
| I-01 | 表頭–③ | input | suggestion | code | Input card .card.cta#input | components/RunPage.tsx:147 — <div className='card cta' id='input'> |
| I-02 | 表頭–③ | input | suggestion | code | h2 你的案例：四個格子 + small | components/RunPage.tsx:148 — <h2>你的案例：{numeral}個格子<small>從上往下填；填不出來的留白</small></h2> |
| I-03 | 表頭–③ | input | suggestion | code | Input how strip | components/RunPage.tsx:149 — 一格一層，每格一句提示；空的格子裡有例子。…留白的層會列成證據缺口。 |
| I-04 | 表頭–③ | input | suggestion | code | form.runform aria-label 冰山模型的四個格子 | components/MethodForm.tsx:89 className='runform' aria-label={label}; components/RunPage.tsx:160 label={`${name}的${numeral}個格子`} |
| I-05 | 表頭–③ | input | suggestion | code | Fields carry .field.layer.lN | components/MethodForm.tsx:44 className={extra ? `field ${extra}` : 'field'}; :89 extra={layered ? `layer l${…}` : undefined}; RunPage.tsx:160 layered={methodId === ICEBERG_ID} |
| I-07 | 表頭–③ | input | suggestion | code | Per-field hint texts | method-input-forms.yaml:27-30 hints; components/MethodForm.tsx:44 <p className='hint'> |
| I-08 | 表頭–③ | input | suggestion | code | textarea rows=2 aria-describedby | components/MethodForm.tsx:44 — <textarea id={id} rows={2} aria-describedby={field.hint ? `${id}-hint` : undefined} |
| I-10 | 表頭–③ | input | suggestion | code | 執行分析 primary big button | components/MethodForm.tsx:89 — <button type='submit' className='btn primary big'>…執行分析</button> |
| I-13 | 表頭–③ | input | suggestion | code | 用示範案例填入 button | components/MethodForm.tsx:89 — {onFill && <button type='button' className='btn' onClick={onFill}>用示範案例填入</button>} |
| I-14 | 表頭–③ | input | suggestion | code | 清空，填我自己的 ghost button | components/MethodForm.tsx:89 — <button type='button' className='btn ghost' onClick={onClear}>清空，填我自己的</button> |
| P-48 | 管線＋流程 | provider | suggestion | code | Tool input_schema is open; API enforces nothing | 2026-09-28 session batch: def7d7882 (pipeline: ProviderCallError + one retry for a cut-off; effort medium; conform_to_schema item grain; repair_next_steps/repair_claims; headline a detail section; repaired vs removed; better-of-two) |

### 6.5 稽核誤報／未能驗證

（無）

### 6.6 重複列（已併入主列）

- C2-19 → H-07（Blank layer shows as thin, never 空白）
- M-28 → H-08（Equal counts label layer 1 最薄）
- M-65 → M-62（C heading drops 自動）
- M-77 → M-62（Rerun button drops 自動 (accepted by a parity alias)）
- M-78 → M-62（Mock data-mock promises a scheduled rerun; web schedules a reminder）
- M-84 → M-62（Footer drops 自動 and 並通知你）
- N-80 → N-54（花錢前先講 confirm button）
- N-81 → N-63（拒收用人話 not implemented）
- P-24 → N-40（Method record gates discarded; 層序/無預設結論 cannot show）
- P-27 → N-59（Rerun loses compare link after reload）
- P-28 → N-14（⑧ 還要你填 lists raw target field keys）
- P-29 → N-32（Project-source manifest items lack title; ⑨ shows sha256）

## 7. 還剩什麼（給接手的 AI）

| id | 狀態 | 要做什麼 |
|---|---|---|
| P-43 | 流程 | 本批的 WORKLOG 條目與 TASKS.md:122 已隨 commit 更新；Codex oracle 額度到 2026-09-29 01:51 才恢復，屆時對 `def7d7882..HEAD` 跑 `/codex-review` 補 artifact |
| I-15 | 做一半（操作者） | 輸入卡在示意稿之外多了：懶人填寫、存到哪個專案＋名稱、確認執行的費用框。要不要把它們寫進示意稿（加 `data-when`），操作者決定 |
| P-16 | 做一半 | 圖內文字 `overflow: visible` 永不裁切，框高用 `linesFor` 估算；沒有掛載後量測。三次真跑 0 溢出 |
| （上線） | High-STOP | §9；先確認正式站的 `COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET`：一次完整分析實測約 1.8–4.3 萬 tokens（含一次重問時） |

## 8. 已替操作者做的決定（可推翻，每條一行）

1. **重跑是提醒，不是自動**：示意稿改成「你＋系統提醒」「90 天後重跑本分析並比較」；系統沒有你的新數字，不能自己重跑。
2. **每次分析一個專案、建立時間到分鐘**：依 2026-09-27 操作者要求，`home-mock.html` 我的專案改成網站的用語與六欄。
3. **核准列有「刪除專案」**：示意稿加上；比較連結只在重做／重跑時出現。
4. **示範專案免費、唯讀**：`/projects/demo/iceberg`，資料是一次真實分析（`fixtures/demo-iceberg.json`，只能從真跑重產）。
5. **課程五個領域都有真的示範案例**：`method-form-examples.yaml` 的 `sets`（畫廊延後付款、加開平日班、退貨率 12%、週日吵架），每個都經過真的 builder 與閘。
6. **圖 A 漏畫時重問一次**＋1.3.0 其他欄位由模型自己交代；若要省那一次呼叫，改 `trend_candidates` 的觸發條件。

## 9. 上線程序（High-STOP；操作者 go 後逐步）

```bash
# 0. 本機全綠（§5）後 commit（共享檔走私有 index）、push
# 1. 主機備份＋試跑（唯讀對照 copies）
ssh -p 58122 ubuntu@145.239.195.47 'bash -s <sha>' < Projects/internal/cognitive-engineering-os/scripts/dev/cos_predeploy_trial.sh
# 2. 主機 fast-forward + deploy（test gate → build → healthcheck → smoke → rollback tag）
ssh -p 58122 ubuntu@145.239.195.47 'cd /opt/cognitive-os && git fetch && git merge --ff-only <sha> && bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh'
# 3. 線上檢查（公開路徑＋401、資料列數、一次真分析不寫入）
bash Projects/internal/cognitive-engineering-os/scripts/dev/live_check.sh
ssh -p 58122 ubuntu@145.239.195.47 'bash -s' < Projects/internal/cognitive-engineering-os/scripts/dev/cos_live_counts.sh
ssh -p 58122 ubuntu@145.239.195.47 'docker exec -i -w /app/Projects/internal/cognitive-engineering-os cognitive-os-api python -' < Projects/internal/cognitive-engineering-os/scripts/dev/prod_interpret_check.py
# 4. 刪除備份資料夾（find … -delete，不用 rm -rf）；WORKLOG 部署紀錄
```

`deploy.sh` 的測試關卡已包含本批的測試檔，並在 build 前跑 `deploy/web_test.sh`（P-19）。

## 10. Rollback

- 程式：`git revert <commit>`（本批不含 migration；新事件型別 TaskCreated／TaskDone／RerunScheduled／RerunFulfilled／InterpretationApproved／InterpretationReturned 只被本批的 reader 讀，舊程式忽略它們）。
- 主機：`deploy.sh` 在 build 前把現行映像標成 `:rollback`，失敗自動還原；手動 `docker compose up -d` 該 tag。
- 資料：事件流只追加；`cos_predeploy_trial.sh` 的備份在驗證後才刪。

## 11. 這份報告怎麼維護

一個事實只在一處：缺失細節在 §6（由 `scratchpad/gen_report.py` 從 `verified_*.json` 生成，改 JSON 再重生成，不手改表格）；做完一包就把該包的 id 從 OPEN 移到 FIXED（改 JSON 的 `status`＋`evidence`），並在 WORKLOG 留該日期區塊；`TASKS.md:122` 只留 3–5 行摘要＋指向本檔。
