# RESEARCH LINES — 蒐集 → 彙整 → 方法 → 報表 MASTER PLAN（唯一計畫正本）

> **這份是什麼**：把 L1 合作風險／L2 決策利弊／L3 EdD 研究三條線做成 **Cognitive OS 上的 Project 工作流**（Project 層級蒐集與彙整 + 既有 Recipe 引擎 + 報表 artifact），達到國際級產品規格（多租戶、溯源、可重放、可匯出、可抹除）。取代 `agency-os/reports/decisions/2026-09-23-research-pipeline-architecture.md` §5–§6 的 next-admin 中心方案（該檔 §10.1 七個矛盾與 §10.2 成熟度矩陣仍為前提，不重述）。
> **給 AI 的開工指南**：接到「研究線／三條線／partnership-risk／彙整層／Collection Service」→ 讀 §0 → 照 §5 當前階段做；設計問題查 §3–§4；產品問題查 §9 **不重問**；退場清單 §8；critic 已駁回的設計見 §4 淘汰欄，**不重提**。每完成一階段更新 §0。
> **版本** v1.64（2026-10-02）。本檔只寫現行內容：決策改判就直接改寫該 D# 列，歷史在 `git log -- Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md` 與 WORKLOG（續N），不留在這裡。路徑：`COS` = `Projects/internal/cognitive-engineering-os`；`SPEC` = `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`；`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`；`WF` = `lobster-factory/packages/workflows`；`BP` = `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2`；`rt` = `COS/ai_lego/apps/recipe_runtime.py`；`main` = `COS/ai_lego/apps/api/main.py`；`repo` = `COS/ai_lego/data/repositories/project_source_repository.py`；`exec` = `COS/ai_lego/platform/workflow/executor.py`。

## 0. 現況（每次改動更新此段）
**優先序（2026-09-28 決策，改判才改這行）**：先把一個工具做到正式站可用再擴張——冰山模型照 `COS/docs/RESULT_PAGE_GAP_REPORT.md` §7 做完（網站線）；完成前不新增 Method Atlas 方法 slice（現有 304 個）。研究線卡照常，但不得新增方法。

**進度板（接手先讀這五行，不必再翻別的檔；每張卡的 commit 必同步更新，§12.1 規則 1）**
- P2 WC-01～09：程式與部署前置完成；09b DOD-1～DOD-8 全 PASS（DOD-2：原指定專案 9/29 被網頁刪除，改用新建真來源專案 `857b6f41-73ef-4b93-a00d-c093d414348e`「勿刪」，9 筆官網來源 → `dossier_brief` 20 主張 31 引註全 ⊆ manifest、閘 PASS；WORKLOG 2026-10-02 續2）。DOD-3 的 9-case baseline 已以 pinned image 產出並 scoring exit 0；thresholds 仍未設定。相關提交：`63e96ffe6`、`16b378722`、`9fe186e88`、`f42cee78e`、`a4d992435`；正式站 `73b9ac8f8` 健康（WORKLOG 2026-09-29 續8、續10）。
- 現在期／卡：**P1 WC-01～14 完成並上正式站；WC-15 期末閘 9/9（⑤ 2026-10-02 正式站抹除 7 專案全驗過，WORKLOG 2026-10-02 續1）**。**PI-b 01–04 完成，已上正式站（2026-09-26，`2a911dca1`）**；05 操作者已親眼驗收（2026-10-02）；正式站自動 E2E 需正式站測試身分（agent 不在正式站建帳號，由操作者建）。網站照示意稿（I11）第 1–3 批（外框、填寫頁、課程頁）已上正式站 `79bf7cc5`（同批帶上 P1 WC-01／02／03 的加表加欄，先備份試跑；WORKLOG 續40）；剩結果頁照示意稿＋其他頁渲染閘（TASKS）。
- 已完成：P1 01＋03 `a6c43eb29`、02 `916b0983d`、04–08 `df49aab0f`、09 `8614a97dd`、10–13 `5eb5270cf`／`1e8da323a`／`54c864cf6`／`1487d3818`＋缺口 `ca341ddc6`、14 主機（續52／55）；P0 `19f00f9aa` 已上 prod（2026-09-26 隨 next-admin `b8c191698`；早於 PI-b，見 D15 備註）；T11 `a15d2f05b`；T12 `66278d1f9`；PI-a 修正卡 7/7、14R 通過；PI-b 4/5（01 nginx 分流、02 `/api` 前綴、03 部署＋真模型冰山 5 findings 全引註、三閘 PASS、`ai_usage` `interpret:systems.iceberg_model`；04 已隨 P0）。14R：golden 4163/4163、完整 COS unittest `Ran 14204 ... OK (skipped=34)`、解讀/API 定向 33/33、web vitest 12/12、typecheck／build／audit 0 漏洞、check-mocks、§6 四突變、Docker API＋web 本機 `healthy`、舊 dashboard 真 AI 草稿＋執行成立、官方 Playwright 真模型 `1 passed／0 failed／0 skipped`（另 mock 模式 1 passed）。；**P2 WC-01–04 合併** 278d1e69d/7fa521c14/ffe618163/dc002e11d（雲端 T28–T31＋本機修正：引註閘 uncited 語意、v1 prompt 引註格式、ux-defaults R3、rollback、golden 契約、harness 契約；續1）
- 最後一筆 PI-a 程式碼：`475ec80dc`、`d7cdf1010`、`7cfd90bd3`；14R Claude Python／TypeScript 真 oracle 各一份，核對修正後最終 `approve`（`2026-09-26-review-28ae67cc.md`）。完整 COS unittest 在隔離 Linux 容器 14204 項 OK（1612.765s）；8420 既有程序占用，測試 override 用 8422；`COS_TEST_*` 實值只在 Git 忽略的 `mcp/user-env.ps1`，正式 compose 埠未改。
- 阻塞：無。待操作者：P2 thresholds（`eval/thresholds.yaml` 全 null）。PI-a 無。Windows 全套曾紅的 1 項（`test_ai_gateway` 預算鎖測試：把「5 秒內到達」當成不會卡死）已修：改用事件與鎖內觀察＋`tests/unit/thread_testkit.py` 的 hang guard；負載下舊版重現同一失敗、新版通過（WORKLOG 2026-09-26）。容器前兩輪的唯讀／noexec 設定錯誤不列為產品測試通過證據（詳 WORKLOG 2026-09-26 14R 結案）。
- 下一步：WC-P2-04b 已確認完成（離線評測 71 tests、9-case golden、兩個 mutation proof 全綠；thresholds 維持 operator-owned null）；WC-P2-05 已確認完成（`synthesis.py` runner：map/reduce、two-attempt repair、typed object、citation gate、artifact；本次 runner/API/async/human_required 合計 79 tests＋eval gate 全綠）；WC-P2-06 已確認完成（`63e96ffe6`；POST/GET synthesis、背景 worker、metering、tenant isolation、zero-source refusal、artifact cleanup；17 tests＋golden 全綠）；WC-P2-07a 已確認完成（`209b65221`；project-backed academic Sources adapter、fail-closed zero-source、triangulation、65-case original evidence；本次重驗 50 tests＋golden 全綠）；WC-P2-08 已完成（`b024d6474`；共用 citation gate、unit/golden/mutation sentinel 全綠）；P3-01 已完成（route.method 免費層／AI fallback／三閘／typed object／DRAFT contract；未接端點，未晉升 ux-defaults champion）；P3-02 已確認完成（async／human_required；既有 15 mutation evidence，本次重驗包含相關 suite）；P3-03 已完成（WorkflowInterpretation 純模組／typed object／跨站引註閘；未接端點）；P4-01 renderer 已確認完成（`339f576e3`；renderer／schema／fixtures／33 tests），P4 report API 第一切片已完成（report CAS、POST/GET、Markdown export、approve/reject、identity event；77 tests＋golden 全綠）。**P-ARF-data 暫緩**：操作者 2026-09-26「還沒整理好」（Airtable 資料），整理好再排，不擋 P1。 **建議模型：整站設計優化討論＋產卡 = Fable 5.1；卡產出後照卡執行 = Sonnet 5.5／Codex。**
  - P1 卡 §12.7：01–14 完成、15 期末閘 8/9；§3.3／§5／§7 已回填（續59）。
  - P2 卡已產（§12.8 WC-P2-01～09＋提前的 P3-01）：01–04 雲端 T28–T31 現在並行（只依賴已合併的 P1 碼），05／P3-01 第二波；本機 07a、P4-01 現在由兩個新 session 在獨立目錄 `D:\tmp\wt-l1`／`wt-l2` 做，06／07b／08／09 排在既有兩條線後；卡 commit 不改本檔，合併者回填。**已併**：07a `209b65221`、P4-01 `339f576e3`、07b（WORKLOG 續 WC-P2-07b 條，NA 部分待 sg-deploy）。

| 項 | 狀態（各列查證於 2026-09-24；現況以上方進度板為準） |
|---|---|
| 計畫 | 版本見檔頭；§9 全部定案；執行順序 P0 → PI-a → PI-b → P-ARF-data → P1 → P2 → P3 → P4 → P4b → P-E；**目前：見上方進度板**；PI-b／P5／P-P 為 High-STOP（prod 部署） |
| 可重用（已查證） | 蒐集引擎 `NA/lib/collect`（41 個非測試 .ts；SSRF／DNS pin／robots／限流／品質／相關性／注入隔離／renderer 階）；COS Project+Source+CAS+events（`repo:22-60`）；Recipe 引擎（journal／resume／gates，`exec:236-250,347-361`）；AI gateway（brief→draft→builder→gates，provenance 強制 `draft.py:195-206`）；`ai.draft_record` capability（`SPEC/capabilities/contracts/ai.draft_record.capability.yaml`）；既有 citation gate `COS/ai_lego/modules/research/gates.py:41-63`；dossier prompt／段落表 `NA/lib/dossier/report.ts:76-139`、引註檢查 `:185-206`；`literature_search` ACTIVE 契約（`SPEC/capabilities/contracts/literature_search.capability.yaml:3`）；portal 身分層（`NA/app/portal/*`）；Trigger.dev 內部呼叫樣板 `WF/src/trigger/collect-scheduled-crawl.ts` + `NA/app/api/internal/collect/run-due-schedules/route.ts:27-32`；handoff code 發放／兌換樣板 `COS/ai_lego/platform/identity/store.py:342-385` |
| 缺（本計畫要蓋） | **L4 藝術反思線（§1，D19–D22）**：Airtable→SPEC 同步、`art_reflection.*` 契約家族、`wusheng-journey-v1`／`reflective-cycle-v1` recipe、判斷主權閘、圖像 artifact（P5 object storage）、參與者模式（P-P 後）；**課程層 §3.9 U15／D17**（每個方法首次使用前的 5 分鐘課，資料驅動）；**解決方案層 §3.10(5b)／C11**（分析後的方案比較、行動計畫、追蹤與到期重跑）；**解讀層 §3.10**（現況：方法執行 = builder + gates，無 LLM，`main:758-788`；結果頁 = 閘門表 + JSON，`dashboard.html:1394-1410`；圖表僅 2 方法 `:1320-1345`）；Source 溯源欄位＋supersede；Project 層級 collection run（非同步）＋ ingest grant＋service identity；`sink/cognitive`；三個彙整 typed object＋prompt manifest＋`citation_integrity` gate；context-bound capability adapter 這一類；`literature_search` project-backed adapter；`partnership-risk-v1` recipe；非同步 recipe run 旗標；`artifact.generate_report`；**品質評分 harness（§3.7）**；**演化迴圈（§3.8）**；Postgres／object storage；自然人來源的加密與抹除（P-P） |
| 演化原語（已存在，§3.8 重用） | `SPEC/recipes/validated/champion-challenger.recipe.yaml`（ACTIVE）；prompt 版本重放與回滾 `COS/ai_lego/platform/ai_execution/{replay,rollback_plan}.py`（`replay.py:34-76` `prompt_version`／`restored_prompt_version`；README:27 v12 升級／回滾 replay 測試）；spec-root golden harness `SPEC/tests/run_golden_tests.py`；`ai_usage` 計量表（`store.py:117,465-468`）；`COS/ai_lego/compute/prediction_tracking/error.py`；Claude 雲端 routine（`/schedule`）；行為即資料（`query-plan.ts:38` ANGLES、`source-class.ts`、`methods/registry/method-form-examples.yaml`） |
| 已由 critic 駁回、不再提 | 把 collect 做成 Recipe step（`exec:236-250` RUNNING 不可 resume、`main:131-133` journal 不含 source、adapter 無法注入依賴）；用舊橋搬資料（分類錯、無溯源、title 去重）；`REQUIRED` necessity（enum 無此值，`SPEC/specs/cognitive/recipe.schema.yaml:355`）；把「移植 enforceCitations」說成等價（原邏輯改寫 [?] 不 FAIL）；P1–P4 含自然人 |

**殼 parity 清單（R15：舊 dashboard 的每一項能力在新殼落地並驗過才退場，退場 = P4 驗收；操作者 2026-09-24 點名 1–4）**
| 能力 | 舊 dashboard 證據 | 新殼落點 | 期 |
|---|---|---|---|
| 登入／登出／AI 狀態與日預算 | `dashboard.html:313` `/ai/status` | WC-PIa-09 | PI-a |
| 單一方法：表單 → 執行 → 結果 | `:1394-1410` | WC-PIa-10／11 ＋ interpret | PI-a |
| **懶人填寫**：貼上 → 先免費逐行「欄位: 值」比對 → 不完整才 `POST /ai/draft/method/{id}` | `:197-199`（面板）、`:859-864`（免費比對後才呼叫 AI） | WC-PIa-10 表單頂部同一面板，原則不變 | PI-a |
| 示範案例一鍵填入 | `GET /methods/{id}/demo`（`main.py:834`） | WC-PIa-10「用示範案例試一次」 | PI-a |
| **下一步 = 旅程列＋候選卡＋四動作**（⑧） | 新 | WC-PIa-11 `NextSteps`：`prefill` 直接填、`needs_input` 標紅、確認才執行 | PI-a |
| 專家模式：閘門表＋JSON | `:1394-1410` | WC-PIa-11 ProvenanceBar | PI-a |
| 工作流（recipe）：plan／form／run／輪詢／結果／draft-plan | `main.py:404-710`、`:939` | web 工作流頁 = 總覽站列＋兩種走法＋站頁＋總結頁＋工作流課五步（U18／D24） | P3 |
| **自組工作流**（可調順序） | `/workflows/custom` GET／POST／PUT／DELETE（`main.py:1385-1455`；`dashboard.html:809-823`） | web 組裝頁：拖曳排序、無 `<select>` | P3 |
| 從彙整表起草 | `ai.draft_record`（§3.2 步驟 4） | 專案彙整步 | P3 |
| 圖表面板（`artifact.generate_chart` 直呼） | `:695`、`:1382` | 結果頁③ 視覺原語取代；直呼面板收進專家模式 | P3 |
| **不知道用哪個工具 → 問題路由** | 無（新，U16） | 首頁「描述你的問題」卡（目錄下方） | P3 |

## 1. 定位與映射
- 產品 = **AI LEGO Cognitive Engineering OS**（母文件 `SPEC/AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:254-300`）。三條線 = 母文件 §78 使用者流程（`:3062-3095`：Create Project → Upload Sources → Ingest → Normalize → Knowledge Build → … → Compile → Approve → Execute → Human Review → Write）的三個實例。**蒐集與彙整落在 Execute 之前的 Project 階段**，Recipe 只做 Execute（這正是 critic C2 的修法，也是母文件的順序）。
- 六大 Workspace（`:3019-3050`）：L1 Knowledge→Decision Room；L2 Decision Room；L3 Knowledge→Data Lab→Artifact Studio。
- 完成計畫 `COS/docs/feature-cognitive-os-completion.md:13,15,18` 切片 2／4／7 = P1／P2／P4；切片 8 = P5。
- HCI-30 不在關鍵路徑（決策記錄 §10.3-3）。
- **L4 藝術反思線（操作者 2026-09-23：Art Reflection Framework「以後也會是主力」）**：來源 = Airtable base `appbQ5ACPPxMybVvM`（20 表；`Art Reflection Tools` 每筆 = 使用情境／詳細流程／時間分段／材料／帶活動者提示用語／個案困難／停止活動訊號／評估指標／反應紀錄方式／理論依據／可轉譯為數位互動；`WuSheng Five Phases` WS-01…05 各有 Guiding Question／Session Focus／Practice Strategy／Progress Indicators；治理欄 Canonical ID／Publication Slug／Content Hash（fnv1a64）／Record Version／Record Status／Active／Source Verification／Data Sensitivity／RLS Required）。定位：**不是第四套系統，是同一引擎上的第四條線**——一個工具 = 一個方法契約＋一堂課＋帶領腳本；五生階段 = 一個旅程 recipe；Observe→Externalize→Reflect→Question→Compare→Reframe→Judge→Revisit = 每次 session 的 recipe。EdD 的 Judgment Sovereignty 核心原則 = 這條線的閘（D20）。上線面：soulfulexpression.org（WordPress）只放公開工具說明與預約；互動流程 = `cognitive-web` 參與者模式（app ≠ portal），且在 P-P 之後。

## 2. 不變量（I1–I10）
| # | 不變量 | 機械落點 |
|---|---|---|
| I1 | 同一 Project 內 `(canonical_url, content_sha256)` 唯一；同 URL 新 hash = 新 Source 列 + `supersedes_source_id`，舊列 `status=superseded`（同一交易）+ event。hash = `sha256(utf8(text))`，NA 端算（`NA/lib/collect/types.ts:51`），COS ingest 重算比對不符即 400（ADR 011 §決策 2，`011-collection-ingestion-boundary.md:52-56`） | §3.4-C2 |
| I2 | 抓回內容 = `EVIDENCE／SOURCE_QUOTATION`（`types.ts:33-45`）；彙整輸出走 runtime 既有規則 `AI_INFERENCE／AI_GENERATED`（`rt:28-29`），草稿走 `AI_SUGGESTION／AI_SUGGESTED`（`draft.py:195-206`）；永不自動晉升 | 平台既有 |
| I3 | 彙整**與解讀**每個主張的引註 ⊆ **prompt manifest**（實際送進 prompt 的 Source id + sha256 + 字元範圍）；越界或零引註 = gate FAIL（比 `report.ts:191-200` 的「改寫 [?]」嚴格，刻意） | §3.4-C4／C10 |
| I4 | 方法 builder 只吃結構化 record；彙整表 → 方法 kwargs 必經顯式映射（`ai.draft_record` + 人填價值判斷欄），不直接 binding | §3.4-C5 |
| I5 | 報表 = 版本化 artifact，`AI_GENERATED → HUMAN_APPROVED`，每個 [n] 解析到 Source id + sha256；手動來源的 URL／fetched_at 可為 `null`，附錄照實顯示「—」 | §3.4-C6 |
| I6 | 租戶邊界 = COS `Tenant→Workspace→Project`（`BP/12:27-39`）；NA 對 COS 寫入只憑 **per-run ingest grant**（tenant+project+run+scope+exp，伺服器端綁定 project），永不持有靜態全域寫權（`BP/12:62,78`） | §3.4-C3 |
| I7 | 六個橫切面（路由／預算／禮貌／去重／續傳／重試）由 `NA/lib/collect/orchestrator.ts` 獨佔（ADR 011 §決策 1、5：`:50,64-70`）；COS 不發對外 fetch（`COS/ai_lego/platform/net/egress.py:44-50` deny-by-default） | Collection Service 只暴露 `runs` |
| I8 | Recipe 引擎（`exec`）**零改動**；新增行為只以「Project 層級動作」與「capability adapter」實作 | §4 D5 |
| I9 | **演化只改資料、不改碼；任何候選版本必須在 harness 上不劣於 champion 才能晉升，晉升可一鍵回滾**（prompt／角度表／來源分類／模型／recipe 預設皆為版本化資料；程式碼改動一律走人審 PR） | §3.8、§3.4-C9 |
| I10 | **分數是閘，不是目標**：偵測器門檻（品質、密度、相關性、引註）永不由演化迴圈自動調整，只能提案給人（操作者既有裁定：禁止改門檻消音偵測器） | §3.8、§7 R11 |
| I11 | **示意稿即規格（操作者 2026-09-24「之後所有工具的規則都按照這個規格」）**：**五頁的 `<style>` = `design-system.css` 逐位元**（token＋全部元件＋utilities；`/* == page-specific == */` 之後必須是空的；U19 主題機制）；**共用片段 = `COS/docs/mockups/partials/*.html` 逐位元**（晶片列 `domain-chips` 由 `SPEC/methods/examples/domains.yaml` 生成，U21；首頁五段 `catalog-prompts`／`catalog-goals`／`catalog-featured`／`catalog-workflows`／`catalog-directory` 由方法登錄檔＋問句分類檔＋recipe 顯示檔生成，U1；課程切換腳本 `lesson-chip-script`、首頁搜尋腳本 `home-catalog-script`；頁面以 `<!-- == partial: <name>: start/end == -->` 標記，`sync-design-system.py` 一起複製，`mockkit.py` 是三支腳本共用的常數與函式）；**機械閘 `COS/docs/mockups/check-mocks.py`**（U19 token／字體、U20 版面、U15 課程入口與假連結、跨頁互連、狀態列、每段怎麼讀／你要做的、svg a11y、D18 chips 逐組、無 `<select>`、標籤配對；自測 `check-mocks-selftest.py` 注入的每個缺陷必全數抓到、合法變體（ACCEPT，如 YAML 合併鍵）必全數通過，且每條規則（self.bad 呼叫點）至少一個案例證明（覆蓋閘，NO_CASE_YET 只能縮）（每案比對自己規則的訊息文字，不靠鄰近規則），改檢查器先加案例）；**`COS/docs/mockups/build-artifact.py` 先跑檢查器、紅就拒絕建置，只剝殼不改色**（示意稿 = 發布版）；**改任一頁的流程固定**：改 → `sync-design-system.py` → 檢查器綠 → 看圖（`render-mocks.cjs`）＋晶片功能（`chips-test.cjs`）→ 建置 → 重發五份 → §0；`COS/docs/mockups/home-mock.html`（app 殼：左側主選單＋四個 view——首頁／工具／工作流／我的專案，U1／U16／U9／U2；五段 partials 由 `SPEC` 登錄檔生成，主選單 `app-nav` 逐頁產生；線上 https://claude.ai/artifact/5j9jef81ts5mqmYpVARNmJ ）、`COS/docs/mockups/iceberg-result-mock.html`（結果頁九段 ①結論 ②結構圖 ③圖表 ④逐層卡 ⑤總結 ⑥對照表 ⑦解決方案 ⑧下一步 ⑨引註＋來源列；線上 https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq ）、`COS/docs/mockups/iceberg-lesson-mock.html`（課程六步；線上 https://claude.ai/artifact/653Kt4JtExaujnffNDvygY ）、`COS/docs/mockups/workflow-result-mock.html`（v2：頁首「第一次走這條路？先上 3 分鐘的課」按鈕連到工作流課、每站卡一顆「先看 5 分鐘的課」按鈕連到該站方法課（P3 前為佔位）；工作流總覽＋站卡＋總結頁；線上 https://claude.ai/artifact/7xEwPu9Cp2rWf3P8g9X1Pk ）與 `COS/docs/mockups/workflow-lesson-mock.html`（工作流課五步；線上 https://claude.ai/artifact/TP18Q3Xif2BphmAfbxxrKU ）是**每一個方法與每一條工作流**（285＋`art_reflection.*`）結果頁與課程頁的驗收基準；沒有「層」的方法以原生單位套同骨架（§3.10）。落地期：①②④⑤⑥⑧⑨＋來源列＋③的方法原生圖 = PI-a（WC-PIa-11）；③趨勢／迴路／槓桿圖 = P3（其餘 5 種視覺原語＋資料綁定）；⑦解決方案 = P4（C11）；課程六步 = P3（U15／D17）。任一方法缺一段／一步 = 該期 DoD 不過。**方法齊備檢核 M1–M8（每方法，harness §3.7 計分）**：M1 原生圖形有單位（層／象限／節點…）且每單位一句問題；M2 每單位一個介入動詞＋時間取向＋可見性；M3 發現骨架＋gaps 欄；M4 課程六步齊、四層例子五組；M5 做完的例子 = 操作者領域合成案；M6 每步一組好例壞例；M7 常見錯誤 ≥3；M8 參考來源 ≥2 個網址且每段課文有 [n]；M9 結果頁每段有「怎麼讀／你要做的／來源」；M10 每個發現有信心標籤與改判條件、有「你的判斷」欄；M11（工作流）有總覽站列、每站帶入／還要填、總結頁、五步工作流課且每站連到方法課；M12 預設方法（≤10）有教材版。缺一 = 該方法「知識不足」：仍可用，但結果頁與課程頁頂端顯示缺哪幾項 | §3.10、§12 WC-PIa-11、P3／P4 DoD |

## 3. 架構
### 3.1 系統邊界
```
cognitive.aware-wave.com (COS, 產品殼)             app.aware-wave.com (NA, 內部營運)
├ Tenant/Workspace/Project/Identity/Entitlement     ├ Collection Service: POST /api/internal/collect/runs
├ Sources（研究來源系統紀錄, CAS）                   │   → Trigger task collect-research-run → runCollection
├ Project 動作: collections / synthesis / reports    │   → sink/cognitive → COS ingest（憑 grant）
├ Recipes（既有引擎；1 個新 recipe）                 ├ 客戶 KB cs_knowledge_*（客服語料，維持）
└ Dashboard: 新研究 → 蒐集 → 彙整 → 起草 → 執行 → 報表 → 核准
lobster-net：兩容器同網（COS egress allowlist 加 NA 內部 host）
```
### 3.2 資料流（一條線一次）
1. `POST /projects`（purpose∈{partnership_risk, decision, edd_research}，subject_kind；`data_classification` 由 purpose+kind 伺服器端決定）。
2. `POST /projects/{id}/collections`（非同步）：COS 寫 `CollectionRequested` event → 發 **ingest grant**（§3.4-C3）→ 呼叫 NA `POST /api/internal/collect/runs`（bearer + grant）→ NA 啟 Trigger task → `runCollection`（既有）→ `sink/cognitive` 批次 `POST COS /projects/{id}/sources/ingest`（Authorization: Grant）→ 完成 `POST COS /projects/{id}/collections/{run}/complete`（同 grant，附 RunReport 摘要）→ `CollectionCompleted` event。Dashboard 輪詢 `GET /projects/{id}/collections/{run}`。
3. `POST /projects/{id}/synthesis`（context-bound capability，§3.4-C4；背景執行 + 輪詢）：讀本 Project Sources → 建 prompt manifest → AI gateway 起草 → typed-object builder → gates（含 `citation_integrity`）→ 存 artifact + `SynthesisCreated` event。
4. Dashboard 選 recipe（既有）→「從彙整表起草」= `ai.draft_record`（brief = 彙整表 JSON）→ 人填價值判斷欄（權重／分數）→ `POST /recipes/{id}/run`（引擎不變；`data_classification` 改由 Project 推導；`async:true` 時 202 + 既有 `GET /recipes/{id}/runs/{run_id}` 輪詢）。
4b. `POST /methods/{id}/interpret`（body = invoke 的 kwargs，§3.10、C10）：伺服器**重跑** builder + gates（任一 FAIL → 422，record 不信任客戶端）→ 202 + `interpretation_id`（背景 thread；provider 與 nginx 都是 60s，`provider.py:45`、`default.conf:431`）→ manifest = record 葉路徑 + Project Sources → AI gateway → `MethodInterpretation` → gates → record＋解讀同存 artifact CAS + `InterpretationCreated`；`GET /interpretations/{id}` 輪詢；結果頁顯示解讀，JSON 收進專家模式。
5. `POST /projects/{id}/reports`（context-bound capability）：讀彙整表 + run 結果 → md（+pdf）→ [n] 經 manifest 解析 → artifact CAS + `ReportGenerated`；`POST …/reports/{id}/approve` → `ReportApproved`（identity_id）。
### 3.3 元件表
| 元件 | 狀態 | 位置 | 說明 |
|---|---|---|---|
| Source 溯源欄位 + supersede | P1 完成 `a6c43eb29` | `COS/ai_lego/core/domain/source.py`；`repo`；`SPEC/specs/domain/source.schema.yaml` 1.2.0 | 七欄 nullable＋狀態 `superseded`；`supersede()` 同一寫入交易；I1 由 DB 保證（partial UNIQUE：每 project 每 canonical_url 一筆 active） |
| ingest 端點 | P1 完成 `df49aab0f` | `main` `POST /projects/{id}/sources/ingest` | body = §3.4-C1（1–25 筆）；auth = grant（綁 project＋run）；全批先驗 hash 再寫；created／unchanged／superseded 在一個寫入交易決定；`created_by_identity_id` = collector；內容檔只在 SQLite 寫鎖內、列之後、commit 前寫，無主 blob 只由 `collect_unreferenced_blobs` 收（`repo` 模組 docstring） |
| Ingest grant + collector identity | P1 完成 `916b0983d`＋`df49aab0f` | `COS/ai_lego/platform/identity/store.py`；`apps/cli/bootstrap_service_identity.py --tenant-id` | 一 run 一把、一次兌換、只存 sha256、token 兌換時才鑄（K3）；到期 = run 的 `deadline_at`（同一時刻，無第二份 TTL）；prod collector `79661433-7ada-4455-9ed0-243761a31889` 在操作者 tenant |
| 專案級抹除（D10） | P1 完成 `df49aab0f`（prod 2026-10-02 驗過，WORKLOG 續1） | `main` `DELETE /projects/{id}`；`repo` `erase_project()`（PostgreSQL 版 2026-10-08 起改為 `ai_lego/platform/erasure.py` 先決定後清檔，見 `docs/platform/STORAGE_SWITCH.md`「Erasure across the database and the files」） | 先刪解讀 artifact（`delete_if_present`）→ 一個寫入交易：刪本專案 events（project＋各 source aggregate）、sources、interpretations、runs、project 列、`collect_unreferenced_blobs`（他專案仍引用的 blob 保留，K7）→ 追加 `ProjectErased`；`PRAGMA secure_delete=ON`；失敗整筆回滾、重跑補完；負向測試 `tests/unit/test_project_erase.py` |
| **研究庫（分析結果庫）** | 既有＋擴 | 一個 Project = Sources（`repo`＋CAS，I1）＋彙整 artifact（P2）＋解讀 artifact＋events（PI-a）＋報表（P4：版本化、`AI_GENERATED → HUMAN_APPROVED`）＋解決方案與追蹤（P4）＋案例庫（§3.8 R0–R2）；讀取 = 專案頁時間軸（events）＋跨專案搜尋 `GET /sources/search?q=`（P4）；儲存 = 現 SQLite＋檔案 CAS → P5 Postgres＋object storage，schema 不變 | 操作者 2026-09-24「Cognitive OS 專案裡設專業頂規級的分析結果庫？」→ 是，但**不另建一個資料庫**：所有產物都是版本化 artifact＋event，同一套溯源與抹除（I1–I6） |
| **方法知識庫（method dossier，D23）** | 新（資料＋既有管線） | 每方法一個內部 Project（`purpose=method_dossier`，租戶 = 操作者）：Sources = display-metadata `url`（285/285 已有，`SPEC/methods/registry/method-display-metadata.yaml`）＋契約 `source_of_truth_for`＋操作者丟進來的參考文／圖網址 → 走同一條線（Collection Service P1 → synthesis P2）→ 起草三份可演化資料：`lessons`（六步課文）、`result-skeletons`（原生圖的單位／每單位問題／介入動詞／時間取向／可見性）、`interpretation-prompts` 片段；每句 [n]，過 `citation_integrity`；M1–M8（I11）計分 | 冰山的品質來自操作者給的介紹文與圖；其他 284 個用系統自己的蒐集→彙整→引註做同一件事，不靠人逐一餵；缺參考 = 標「知識不足」，不硬湊 |
| **問題路由 `route.method`（U16）** | 新（context-bound） | `COS/ai_lego/modules/research/route_method.py`；contract `SPEC/capabilities/contracts/route.method.capability.yaml`；端點 `POST /route`（body `{text, purpose?}`）；第一層免費：對 `method-display-metadata.yaml`（name／blurb／why）＋`method-inventory.yaml`（family／purpose）＋`SPEC/recipes/validated/*.recipe.yaml` 做關鍵字＋family 命中並打分；信心 < 門檻才第二層 AI（同 `draft.py` 兩次嘗試樣板，manifest = catalog 條目）；輸出 `MethodRoute{candidates[≤3 {kind: method|recipe, id, why(citations → catalog 條目), yields, est_cost}], suggested_workflow[node ids]}`；閘：`methods_resolvable`（⊆ ACTIVE）、`rationale_cited`、`max_three`；接受 → `POST /workflows/custom` 草稿 | 285 選 1 的牆（§3.9 現況表）；模型憑記憶推薦 = 幻覺 → why 必引 catalog；門檻是資料（§3.8），不由迴圈自調（I10） |
| Collection run 動作 | P1 完成 `a6c43eb29`＋`df49aab0f` | `main`；`COS/ai_lego/core/domain/collection_run.py`；`SPEC/specs/domain/collection-run.schema.yaml` | §12.7 I-g／I-h／I-d／I-f；無 `confirm` 零寫入（C7）；`deadline_at = requested_at + 30m`，逾期 open run 讀時即 failed（`effective_status`，不寫回） |
| Collection Service | P1 完成 `1e8da323a`／`54c864cf6`／`1487d3818`＋`ca341ddc6` | `NA/app/api/internal/collect/runs/route.ts`、`…/runs/execute/route.ts`；`WF/src/trigger/collect-research-run.ts` | 輸入 = I-a 五鍵（無 token、無 COS 位址：NA 讀 env `COGNITIVE_OS_API_BASE_URL`，K5）；COS→NA 走 `https://app.aware-wave.com`（K1）；WF→NA 用獨立 `COLLECT_RESEARCH_EXECUTE_TOKEN`（K4；Trigger 由 running next-admin 同步）；complete 在 execute 路由 finally 送（K2）；只轉交 |
| `sink/cognitive` | P1 完成 `5eb5270cf` | `NA/lib/collect/sinks/cognitive.ts`＋`NA/lib/cognitive-os/research.ts`（I-d／I-e／I-f 唯一線路） | RawDoc→C1 投影、每 25 筆 ingest；不實作 `finalize`（K2）；研究 run 不用 url-state（K6） |
| Context-bound capability adapter | 新（一類） | `rt:70-100`（現為純函式表，宣告 side-effect-free）→ 加 `build_context_bound_adapters(deps)`，deps = {source repo, artifact store, ai gateway, tenant, project} | **不變量修訂**：registry 分兩類：pure（既有）／context-bound（新，只給 Project 動作與 report 用，不進 Recipe 純步驟）；契約檔標 `binding: context` |
| **解讀層 `interpret.method_record`** | 新（context-bound） | `COS/ai_lego/modules/research/interpret_method_record.py`；typed object `SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml`；contract `SPEC/capabilities/contracts/interpret.method_record.capability.yaml`（context-bound 寫在 description；`capability-contract.schema.yaml:550` 無 `binding` 鍵，WC-PIa-02）；端點 `main` `POST /methods/{id}/interpret`（`:758` invoke 旁） | 輸入 = invoke kwargs（＋可選 project_id），伺服器重跑 builder+gates；prompt 由方法契約 `purpose／inputs／outputs／recommended_next`（`SPEC/methods/contracts/*.contract.yaml`，例 `systems.iceberg_model.contract.yaml:34-70`；contract 的 purpose／inputs 是 slug，語意在 `methods/registry/method-display-metadata.yaml` 的 blurb／why zh+en，一併進 prompt）+ typed-object schema 生成，**零方法專屬程式**；輸出 §3.4-C10；gates：`citation_integrity`（同 C4）、`visual_bindings_resolvable`、`next_methods_resolvable`（⊆ ACTIVE catalog；184/285 方法 `recommended_next` 為空，catalog 以 id+blurb 一行進 prompt，成本入 `ai_usage`）；`repo` 新增公開 `append_event(aggregate_id=interpretation_id)`（現 `_append_event` 私有 `:60-72,167`）；202 + 輪詢（背景 thread） |
| **視覺原語** | 新（web） | `COS/apps/cognitive-web/components/visual/{layered,quadrant,table}.tsx`（PI）+ `{matrix,graph,tree,timeline,scorecard}.tsx`（P3）；family→kind 預設表 `SPEC/evolution/interpretation-visuals/v1.yaml`（第 7 種可演化 kind） | 8 種通用圖形涵蓋 285 方法；`visual = {kind, bindings}`，bindings 只指向 record 葉路徑（LLM 不產座標與數字；Eisenhower 的象限是 builder 算的 `eisenhower_matrix.py:91-99`）；方法契約可覆寫 kind；`chart_render.py:62` 現有 `{forest_plot, bubble_chart, quadrant_chart}` 維持給 recipe artifact 用，不擴 |
| **路由與部署（web）** | 新 | nginx `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`（`cognitive.aware-wave.com` 區塊 `:427-450`）；`dashboard.html:299` `api()`；`COS/deploy/deploy.sh:15,113`；`COS/docker-compose.yml` | FastAPI 全部路由在根路徑（`main.py:357-1417`），所以分流 = `/api/` → api（去前綴）、`/expert/` → api `/`（舊 dashboard `api()` 加 `API_PREFIX='/api'`）、其餘 → web；smoke 改 `/api/health`；web 放 **`COS/apps/cognitive-web`**（prod 是 sparse clone `/opt/cognitive-os`，只含 COS+SPEC，WORKLOG 2026-09 `:1450`）；compose 改動走 `deploy.sh`（repo 檔即 prod 檔）並擴成多服務（npm ci + tsc + vitest、web healthcheck、`cognitive-web:rollback` tag、測試清單加 interpret）；nginx 改動走 `safe-infra-patch.sh nginx` + 手動 cognitive smoke；同源 → cookie `samesite=strict`（`main.py:746`）不需 BFF |
| **Airtable → SPEC 同步（L4）** | 新（資料） | `COS/scripts/sync-art-reflection.py`（唯讀 Airtable API；輸出 `SPEC/methods/contracts/art_reflection.<slug>.contract.yaml` + `SPEC/evolution/lessons/art_reflection.<slug>.yaml` + `SPEC/recipes/validated/wusheng-journey-v1.recipe.yaml`）；主鍵 = `Canonical ID`；只取 `Record Status=Active ∧ Active=true`；`Content Hash`／`Record Version` 進契約 `source` 欄，不同即標 drift；Airtable 仍是作者端 SSOT，同步單向 | 欄位映射：使用情境→`purpose`／`preconditions`；詳細流程→`inputs`（每步一欄）；停止活動訊號＋個案困難→`quality.stop_signals`（閘）；評估指標＋反應紀錄→`outputs`；帶活動者提示用語＋主辦者台詞→lesson／facilitation；理論依據＋延伸閱讀→`citations`；搭配工具→`recommended_next`；五生階段連結→recipe 步驟；Data Sensitivity→`data_classification` |
| **判斷主權閘（L4）** | 新（gates） | `COS/ai_lego/modules/reflection/sovereignty_gates.py`（`gates.py:41-63` 旁） | D20 七閘：`participant_final_judgment`、`no_preset_conclusion`、`influence_inventory`、`evidence_conditions`、`revisit_scheduled`、`stop_signals`、`no_belief_scoring`；適用於 `art_reflection.*` 與兩個 recipe |
| `synthesis.*` ×3 | 新（移植） | 共用 `COS/ai_lego/modules/research/synthesis.py`（依 `kind` 選 prompt／schema）；typed objects `SPEC/specs/cognitive/typed-objects/{dossier-brief,decision-evidence-brief,literature-matrix}.schema.yaml`；capability contracts 同名；`main` 的 `create_synthesis`／`get_synthesis` 端點負責 202＋輪詢 | prompt／段落表逐字移植 `report.ts:76-139`；輸出含 `manifest_ref`；每主張 `citations[]`=source_id |
| `citation_integrity` gate | 新（擴充） | `COS/ai_lego/modules/research/gates.py:41-63` 旁 | 輸入 record + manifest；越界／零引註 FAIL；`uncited_sections[]` 進 evidence 不 FAIL |
| `literature_search` adapter v2 | 改 | `rt:80-88`（offline fixture）→ project-backed：回本 Project `source_class=academic` Sources | 關 OQ-LITSEARCH-3、OQ-EDD-LITERATURE-1；`edd-literature-search-v1` fixture recipe 退場（§8） |
| Recipes | 1 新 + 2 既有 | `SPEC/recipes/validated/partnership-risk-v1.recipe.yaml`（新：`stakeholders.stakeholder_map` → `challenge.red_team`，皆 ACTIVE）；L2 用 `life-decision-v1`／`business-feasibility-review-v1`；L3 用 `edd-research-evidence-v1` | necessity 只用 `REQUIRED_BY_RISK`（`SPEC/specs/cognitive/recipe.schema.yaml:355`） |
| 非同步 run 旗標 | 新（小） | `main:534-655` `run_recipe` | `async:true` → 背景 thread 執行，202 + run_id；狀態走既有 `GET /recipes/{id}/runs/{run_id}`；RUNNING 中斷 = 以新 run_id 重跑（P5 前接受；lease 在 P5） |
| run 分類伺服器端推導 | P1 完成 `df49aab0f`（K9） | `main` `run_recipe` | body 帶 `data_classification` → 400；無 `project_id` → INTERNAL；有 → Project 分類轉 UPPER；prod `COGNITIVE_OS_JOURNAL_KEY_MODE=local-dev`（WC-09） |
| `artifact.generate_report` | 新 | `SPEC/capabilities/contracts/artifact.generate_report.capability.yaml`（context-bound） | md（+pdf）、引註表、`report_state`、export `GET /projects/{id}/artifacts/{id}/export` |
| Dashboard 「新研究」 | 新 | `COS/ai_lego/apps/api/dashboard.html`（pill 慣例 `:414-425`，不用 `<select>`） | 線別按鈕 → 表單（名稱／定位詞／角度／預算＝成本預覽）→ 蒐集進度 → 彙整 → 起草 → 執行 → 報表 → 核准 |
| Egress allowlist | P1 完成 `df49aab0f`（K1） | `COS/docker-compose.yml`；`SPEC/policies/ai-execution/network-egress.yaml` EGRESS-EC99-2 | 加 `app.aware-wave.com`（egress 只准 https、拒 port，內部 `lobster-next-admin:3000` 不可加）；compose ⊆ policy 由 `tests/unit/test_egress_allowlist_parity.py` 守 |
| Postgres／object storage | P5 | `identity/store.py`、`repo`、`custom_workflow_repository.py`、`data/object/tenant_scoped_cas.py` | repository 介面不變；RLS Tier A（`BP/12:41-50`） |
### 3.4 契約
- **C1 Source 投影**（sink → ingest）：`{canonical_url, source_uri, content_sha256, mime, content_type, title, author, published_at, fetched_at, text, provenance{epistemic_type, authorship_state, locked}, collector, source_class, relevance{entityConfidence, entityAnchorsHit, searchAngle, searchQuery}, schema_version}`。來源：`RawDoc`（`types.ts:48-81`）去掉 `raw`、`tenantRef`、整包 `meta`；`relevance` 取自 orchestrator 蓋的 `meta`（白名單同 `sinks/kb.ts:106-115`）。`data_classification` 不由 sink 給，由 Project 決定。
- **C2 冪等／版本**：`(project_id, canonical_url, sha256)` 已存在 → 200 `{unchanged:true}`；同 URL 不同 sha256 → 新 source_id + `supersedes_source_id`，舊列 `status=superseded`，event `SourceSuperseded`；ingest 重算 `sha256(utf8(text))` ≠ 送來的 → 400 `SOURCE_HASH_MISMATCH`。
- **C3 認證（三把，各自獨立，未設 fail closed）**：① COS→NA `runs`：bearer `COLLECT_RESEARCH_RUNS_TOKEN`（NA 端驗，`run-due-schedules/route.ts:27-32` 樣板）；② NA→COS `ingest`／`complete`：`Authorization: Grant <token>`，COS 驗 hash + exp + run 未關閉，並以 grant 內 project_id 覆寫路徑；grant 只經 Trigger payload 傳遞**參照 id**，token 本體由 NA 於 route 內以 ① 換取（`POST COS /collect-grants/{ref}/exchange`），不落 Trigger DB；③ 對外 fetch 只在 NA。COS 端寫入身分 = collector identity（真 Identity 列）。
- **C4 彙整與引註**：capability 先建 manifest（n → source_id, sha256, [start,end)，總量上限沿 `report.ts:82-83` 40 篇×6000 字，超過者分批 map-reduce，manifest 記每批）→ prompt 以 `<<<SOURCE n>>>` 包（`report.ts:93-105`）→ builder 驗 typed object → `citation_integrity`：`∀claim.citations ⊆ manifest.ids`，否則 FAIL；`citations=∅` 的 section 列 `uncited_sections`。manifest 與輸出一起存 artifact。
- **C5 映射**：彙整表 → 方法 kwargs 用 `ai.draft_record`（既有）逐方法起草；價值判斷欄（WDM `weights／scores／scale`，`life-decision-v1.recipe.yaml:60-69`；toulmin `warrant／qualifier`）標 `human_required`，dashboard 未填不准 run；bindings 仍指 `source.*`（引擎不變）。
- **C6 報表**：sections = 彙整段落 + 各 step record 表 + gate 表；附錄「來源」= `[n] title — url — sha256[:12] — fetched_at`；「本報表的問題」= `invalid_refs／uncited_sections`；`report_state ∈ {AI_GENERATED, HUMAN_APPROVED}`；核准寫 `ReportApproved`（identity_id）。
- **C7 成本**：`POST /projects/{id}/collections` 先回 plan（查詢數×供應商單價 + 抓取上限）需 `confirm:true` 才執行；entitlement id `research.collect`（`main:1008-1009` 旁）；P5 前恆 true（`COS/ai_lego/platform/entitlement/check.py:5`）。
- **C8 harness 契約**：`score(case, output) → {metric: value}`，指標名固定（§3.7）；`thresholds.yaml` 每線每指標；harness 離線（來源快照，不連網、不用 collect）；報告含每案例每指標與 champion 差值；CI 紅 = commit 不得合併。
- **C9 演化契約**：候選 = `{kind, version, diff, evidence[run_ids, metrics], risk_tier}`；晉升條件 = `∀metric: challenger ≥ threshold ∧ challenger ≥ champion − ε` 且主指標 > champion；R3+ 或觸及門檻 → `requires_human=true`；晉升與回滾都寫 LEDGER + event；champion 指標檔是唯一切換點（程式讀它，不讀「最新版」）。
- **C11 解決方案契約**：`Solution = {options[{id, name, actions[], layer_refs[], time_to_effect, cost, durability, risk, citations[]}], recommended{option_id, rationale}, plan[{week_from, week_to, action, owner(human_required), evidence, target}], metrics[≤3 {name, baseline, target, due}], approvals_needed[], review_at}`；**方案來源四層**：① 方案框架來自方法契約的介入模式（冰山 = 回應／預測／設計／轉化，所以是 3 條路不是任意數），不由模型發明；② 每個 option／action 必須引 [n]（record 欄位或 Sources），引不到的只能進 `gaps`，不得進 plan；③ 力道與順序不由模型斷言，交給 `recommended_next` 的下一個方法算（槓桿點分析、因果迴路、實驗設計）；④ 案例庫：人核准／退回過的方案成為可演化資料（§3.8，R0–R2），初期為空；**模型禁止**：自創目標數字（目標由 baseline 或人定，示意稿的 62→75 只為示意）、填負責人／期限、無證據宣稱因果。由同一次 interpret 產生（AI_GENERATED），`owner／review_at` 未經人填確認不得存成任務；到期重跑 = Project 層級排程動作（Claude routine 或 Trigger），結果為 `SolutionReview{before, after, verdict}` artifact + event。
- **C10 解讀契約**：`MethodInterpretation = {interpretation_id, method_id, record_sha256（伺服器重跑 builder+gates 後的 record，與解讀同存）, findings[{id, title, text, citations[], **confidence{level ∈ high|mid|low, reason}**}], recommendations[{level, action, expected, citations[]}], gaps[{text, needed_evidence}], **revision_conditions[{text, would_change}]**（改判條件），**data_thickness{unit → {own_statements, external_sources}}**（伺服器算，非模型）, visual{kind ∈ 8 種, bindings}（schema 每 kind 一個 oneOf；bindings 值 = record 葉路徑）, next_methods[] ⊆ catalog ACTIVE（`recommended_next` 只是偏好；`causal.dag`／`root_cause.fishbone` 指向無契約的 `validation.experiment`）；`next_steps[]`（每個 next_method 一筆：`answers`、`deepens`（原生單位）、`prefill{欄位 ← manifest id}`、`needs_input[欄位]`、`yields`、`est_cost`；`prefill` 由伺服器依目標契約 `inputs` 與 record schema 對 manifest 做確定性映射，模型只填 answers／deepens／yields；`prefill` 值 ⊆ manifest 否則 FAIL）, provenance{AI_INFERENCE, AI_GENERATED}, model, usage}`；manifest id = record **葉路徑** `r/<field>/<i>/<key>`（純量、dict、巢狀皆可引），排除系統參數 `id／version／provenance／generated_by_method`（`main.py:720-722`）+ Project Sources（有 project_id 時）；`∀citations ⊆ manifest`、`∀bindings ⊆ manifest` 否則 FAIL；`findings=∅` FAIL；**工作流**：每站一個 `MethodInterpretation`（`workflow_run_id`＋`station_index` 選填）；總結 = `WorkflowInterpretation{workflow_id, run_or_chain_id, stations[{station_index, method_id, interpretation_id, one_liner, confidence, judgment}], summary, final_recommendation{text, citations[]}, revision_conditions[], solution（= 最後一站的 Solution）, citations_all[]（跨站不重排）, usage_total}`，gates：`stations_complete`、`citation_integrity`（⊆ 各站 manifest 聯集）、`no_preset_conclusion`；**不含 state／核准**（核准／退回在 P4 加 `interpretation_state` + endpoint）；**使用者判斷 = 人類記錄，不在 AI 物件內**：`POST /interpretations/{id}/judgment {stance ∈ agree|partial|disagree, text}` → 事件 `UserJudgmentRecorded`（D20 `participant_final_judgment`：後續方法把它當最高優先輸入；未填可核准）；語言依 Project／session `language`；成本走 `ai_usage`，日預算 `COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET`（既有）。
### 3.5 租戶、身分、i18n、抹除
- 操作者用自己的真實 tenant；service-tenant 橋整套廢除（§8）。外部客戶：portal → provisioning（`agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/commercial/PROVISIONING_STANDARD.md`），P5。
- i18n：方法 registry 已 zh/en；synthesis prompt 依 Project `language`；報表欄位雙語預留。
- 抹除：**自然人來源不設限、自 P1 起進系統（D10）**；ADR 011 §決策 10（`:79`）的兩項條件 = 專案級抹除（P1）＋操作者明示批准（2026-09-24），主體級加密只在第二租戶時（P-P）。P-P 前提：Source 內容以 per-subject DEK envelope 加密（`COS/ai_lego/security/key_vault/local_key_vault.py` 現為 synthetic-only、未接 API），CAS 定址改為含 subject key id（現為 tenant 級內容定址 `tenant_scoped_cas.py:56-64`，跨 Project 同內容共用 blob，銷毀 DEK 抹不到、unlink 會誤刪），抹除 = 銷毀 DEK + 驗證讀不回；殘留邊界依 README「Not proven」段誠實揭露。
### 3.6 安全邊界
- 抓取只在 NA（`NA/lib/collect/net/*`、`provenance.ts`）；COS egress allowlist 只加 NA 內部 host。
- synthesis prompt 資料塊包裹 + system prompt 宣告非指令；manifest 讓「引用了沒送進去的來源」不可能 PASS。
- grant 單 run、短效、hash 存；`complete` 後 grant 作廢。

### 3.7 品質評分 harness（把「完善」變成數字）
| 元素 | 內容 | 位置 |
|---|---|---|
| 黃金案例 | 每條線 ≥3 個案例（P2）→ ≥5（P-E 前）：固定來源快照（Source 檔＋sha256，不連網）+ 人工標註的**期望發現**（L1：關鍵事實／爭議／關聯人；L2：選項／準則／關鍵證據；L3：主張／方法／限制）+ 已知陷阱（同名混淆、購物頁、注入句、矛盾來源） | `COS/eval/cases/<line>/<id>/{sources/, expected.yaml, README.md}`；合成或已公開資料，不含自然人敏感內容 |
| 指標 | 引註精確率（每個 [n] 指向的來源真的支持該句，抽樣人審＋自動比對）、引註覆蓋率（期望發現被引到的比例）、幻覺率（越界／無來源主張）、矛盾偵出率、缺口誠實度（gaps 列出期望缺口的比例）、拒收正確率（陷阱被擋）、成本（查詢數／token）、時延 | `COS/eval/score.py`；輸出 `eval-report.json` + md |
| 門檻 | 每線每指標一個門檻，**由操作者定**（初始值 = 首次基準線）；低於門檻 = FAIL | `COS/eval/thresholds.yaml`（版本化） |
| 觸發 | 每個影響 synthesis／collect／recipe 的 commit（CI）；每夜對 champion 跑一次（漂移偵測，模型或供應商變了會先在這裡紅） | `COS/scripts/test-eval-harness.ps1`；夜跑走 Claude routine |
| 突變證明 | 拔引註閘 → 幻覺率飆 → 紅；把一個期望發現從來源刪掉 → 覆蓋率降 → 紅 | harness 自己的 mutation 腳本 |

### 3.8 演化迴圈（「應時俱進」的可執行定義）
不是 AI 改自己的程式。是一條**量測 → 提案 → 挑戰 → 晉升／回滾**的閉環，每一步都是既有原語：
```
量測   telemetry（每 run：引註率、拒收原因分布、角度產出率、人改了什麼、核准/退回、成本）→ ai_usage + events
提案   routine（夜跑）讀 telemetry + harness 報告 → 產出「候選資料版本」：新角度／來源分類新增／prompt 改寫／模型切換／recipe 預設；每個提案附證據（哪些 run、哪些指標）
挑戰   champion-challenger recipe：challenger 在 harness 全套 + 最近 N 個真實 Project 重放（replay.py）上跑；記分
晉升   不劣於 champion（所有門檻不降、主指標提升）→ 資料版本切換 + 事件；劣 → 丟棄並留紀錄
回滾   一鍵回上一版（rollback_plan.py 樣式）；夜跑漂移紅 = 自動回滾到最後綠版
人審   R3+ 風險（模型換供應商、成本上限、任何門檻）永遠停在提案，操作者批准才晉升；程式碼改動 = PR + critic + oracle
```
| 元件 | 位置 |
|---|---|
| Telemetry events | `repo` events 表新增 `RunScored`／`HumanEdited`／`ReportApproved|Rejected`；`ai_usage` 已有 |
| 回饋擷取 | dashboard 核准／退回附原因（chips）；draft 與人改後的 diff 存 `HumanEdited` |
| 版本化資料 | `SPEC/evolution/<kind>/<version>.yaml`（kind = angles／source-classes／synthesis-prompts／model-routing／recipe-defaults／**ux-defaults**（文案、預設值、步驟順序，§3.9））+ `champion.yaml` 指標指向現行版 |
| 提案 routine | Claude routine（`/schedule`）：讀 harness 報告 + telemetry 摘要 → 寫 `SPEC/evolution/proposals/<date>-<kind>.yaml` + PR；不直接切換 champion |
| 挑戰執行 | `COS/scripts/run-challenger.ps1` → harness + replay → `eval-report`；`champion-challenger.recipe.yaml` 記錄裁決 |
| 演化帳本 | `SPEC/evolution/LEDGER.md`：每次晉升／回滾一行（版本、指標前後、證據、批准者） |

### 3.9 首用即上手的 UX（第一次用的人不看文件能走完）
**現況證據（為什麼第一次用的人卡住）**
| 介面 | 證據 | 卡點 |
|---|---|---|
| `/ops/collect` | `page.tsx:25-27` 先選「客戶」；`CollectionSourcesPanel.tsx:426-476` 九種來源核取方格用實作語（`collect/entity-dossier`、「按次計費」、「缺少 SERPER_API_KEY」）；`:582`「先在左邊勾一個或多個來源」；`:906-944` 拒收原因字串 | 入口是「工具」不是「任務」；不知道該勾哪一個、填什麼、跑完去哪看 |
| 客戶中心「客服」分頁 | `ClientHubTabs.tsx` 12 個原生 `<select>`（違反操作者「禁 `<select>`」裁定）；`:1795-1811` 兩顆關鍵按鈕藏在「先點一個資料夾」之後 | 主要動作不可見；資料夾名稱是時間戳 |
| Cognitive OS dashboard | `dashboard.html:181-185` 空狀態要人「左邊選一個工作流或單一方法」（285 個）；`:212-217` `run_id`／「續跑既有 run」；`:1397-1410` 結果 = 閘門表 + 記錄 JSON；`:155` 有搜尋框但沒有「你要做什麼」 | 285 選 1 的牆；術語（工作流／方法／閘門／run）；結果不是報表 |
| HCI | `index.html:302,494` 有「這個系統怎麼運作？」說明頁 | 唯一有解釋層的介面，當樣板 |

**四工具改進對照（操作者 2026-09-24：「每個工具都又怪又卡又鈍，你好像規劃了一系列改進」）**
| 工具 | 根因（決策記錄 §10.1 X#／上表） | 本計畫怎麼改 | 期 | 不在本計畫 |
|---|---|---|---|---|
| 蒐集器 `/ops/collect` | X6 人在迴圈憲法（試跑＋核准來源）；入口是工具不是任務；拒收字串是實作語；入庫率脆弱、公司角度 prod 從未跑（§10.2） | 引擎服務化（Collection Service，P1）；研究入口搬進 COS 專案（U1／U2）；成本先講（U5／C7）；拒收人話（U7）；角度表按線（C7）；三顆「送去 X」凍結（P0） | P0／P1／P3 | 重做 `/ops/collect` 客服用途的 UI；K0 `lib/kb/` 拆分（ADR 011 §決策 3，另案） |
| 分析平台 `cognitive.aware-wave.com` | X3 方法執行器不是來源分析器；285 選 1 的牆；結果 = 閘門表＋JSON；術語牆 | 解讀層（§3.10、PI-a）；結果頁九段 = 規格（I11）；新殼取代單檔 dashboard（D13）；目錄入口（U1）＋線性流程（U2）；課程層（U15）；解決方案層（P4）；品質 harness 與演化（§3.7／§3.8） | PI-a → P4 | 285 個方法逐一改寫（D14：零方法專屬程式） |
| HCI `hci.aware-wave.com` | X1 自然人信任帳本被當通用引擎；X2 自動蒐集只准組織、評估只認人 = 空集合；無真實登入 | 退出三條線（D8）；L1 報表留人工入口「開 HCI 案」（§10.3-3）；P6 adapter 觸發式 | P6 | HCI 本體（登入 C6、抹除 ADR-0018 gate 5）屬 HCI 自己的路線 |
| 知識庫 `/ops/knowledge` | X4 三類（Signal／Corpus／Evidence）全走客服 Corpus；§決策 12 KB 只回證據不回答案 | 研究來源改存 COS Project Sources（D2，有溯源、指紋、抹除）；KB 維持客服語料；資料夾按鈕凍結（P0） | P0／P1 | KB 承載研究來源（**§9 ⑨ 待操作者回**）；K0 拆分 |

**原則（U1–U12，每條可驗）**
| # | 原則 | 落點 |
|---|---|---|
| U1 | **app 殼：左側主選單＋四個去處，一次只看一個**（操作者 2026-09-25「全部塞同一頁非常爛，應該左側 sidebar 主選單」；前版 v4 把九區疊在一頁）。依據：NN/g 左側直式導覽（桌機常駐不收合、文字標籤、關鍵字前置、不重複兩套導覽）；Material 3／Android 自適應導覽（手機＝底部導覽列、≤5 項、永遠顯示文字、目前項有指示）。**主選單**＝`mockkit.NAV`：首頁／工具（285）／工作流（12）／我的專案；每頁都帶（`partials` 的 `app-nav`，`mockkit.render_nav(page)` 逐頁產生，`aria-current`＝`mockkit.SECTION[page]`）；≤760px 變底部導覽列。**四個去處＝首頁 artifact 的四個 view**（`section#<id>[data-view]`，hash 切換，`…/artifact/<home>#tools` 直達）：首頁＝先說你卡在哪（U16）＋按你想做的事找（12 問句卡）＋先從這幾個開始（8 起點）；工具＝全部工具（按問句分 12 類收合＋名稱搜尋，U1 搜尋）；**每個工具有自己的一頁**（操作者 2026-09-25「工具都沒有連結，只是文字」）：`section#tool[data-under=tools]` 裡一個工具一個 `article.tpage#t-<id>`，由登錄檔產生——做什麼、開始／5 分鐘課／結果範例、做完常接（契約 `recommended_next`；還沒上架的工具寫明、不連）、用到它的工作流、同一類常用；`…/artifact/<home>#t-<id>` 直達；首頁上每個工具名都連到它，選單停在「工具」，上一頁回到清單原位；工作流＝12 條按問句分組＋4 條平台維運用收合；我的專案＝專案表（U8）＋示範專案（U9）＋六步（U2）。深層頁（2 結果、2 課程）同一主選單；麵包屑只在深層頁、以所屬去處開頭（結果→我的專案、冰山課→工具、工作流課→工作流）。**用語**：全頁「工具」「工作流」，不出現「方法」（方法論除外）、「家族」、「路線」（路線圖除外）；登錄檔 `name_zh／blurb_zh／why_zh` 同步改。**閘**（`check-mocks.py`）：app 殼結構、主選單項目與 aria-current、view 集合與順序（第一個顯示、其餘 hidden）、每 view 一個 h1、頁內 #連結必有目標、id 不重複、搜尋在工具 view、專案表在我的專案 view、示範卡在我的專案 view、`COMMON_FORBID` 方法；**看起來能點就要有作用**（同日「按了沒反應」）：沒有 `href="#"`、沒有 span 假按鈕、每個 `<button>` 有行為；示意稿做不到的動作＝`<button data-mock="正式版…">`，按了在下方說明正式版會做什麼（`partials/page-actions-script.html`，五頁共用，也負責頁內連結打開收合）；跨頁 `artifact#錨點` 必落在對方頁的 id、且是純錨點；互動（`chips-test.cjs`）：主選單切換、工具頁（列→頁、hash 直達、上一頁回原位且搜尋保留）、示意動作說明、專家模式連結打開收合、hash 直達、搜尋、全形輸入、命中字樣、收合狀態、被搜尋藏住的連結、常用連結、內部工作流、例子填入、自己打的字不被蓋——每項在拔掉腳本的副本上必須失敗。資料＝`method-goal-groups.yaml`、`recipe-display-metadata.yaml`（audience user|internal）；示意稿 `COS/docs/mockups/home-mock.html`（v6；線上 https://claude.ai/artifact/5j9jef81ts5mqmYpVARNmJ ，私人） | 首頁 |
| U2 | 一條線性流程 + 進度條：建立 → 蒐集 → 彙整 → 分析 → 報表 → 核准；每步**一顆**主按鈕 | 每個 Project 頁 |
| U3 | 白話優先：預設介面不出現 recipe／method／gate／capability／binding／run_id；術語只在「專家模式」與 hover 詞彙表 | 文案 registry |
| U4 | 漸進揭露：角度、預算、模型、嚴格模式收在「進階」，預設值可直接跑 | 建立步 |
| U5 | 花錢前先講：「會做 12 次搜尋，約 $0.3，3–5 分鐘」+ 確認（§3.4-C7） | 建立步 |
| U6 | 空狀態教學：每個空面板說「這裡會出現什麼」+ 讓它出現的那顆按鈕 | 每步 |
| U7 | 拒收用人話 + 一個可做的動作（沿 `explainReason`，`CollectionSourcesPanel.tsx:880-904`） | 蒐集步 |
| U8 | 狀態是「地方」不是「分頁」：關掉視窗再開，Project 頁顯示走到哪、下一步是什麼（事件驅動，§3.2） | Project 頁 |
| U9 | 首次登入有一個**已完成的示範 Project**（L2），先看到終點再開始 | 首登 seed |
| U10 | 每步右側「這一步在做什麼／為什麼」由 registry 資料生成（`why_zh`／`method-form-examples.yaml` 慣例），不手寫 HTML | 說明面板 |
| U11 | 控制項：按鈕／chips／核取方格，**禁原生 `<select>`**；鍵盤可操作；狀態不只靠顏色 | 元件庫 |
| U12 | zh-TW／en 切換；文案外部化（同 registry） | i18n |
| U13 | 同一骨架：每個方法的結果頁固定七段（§3.10），首用者第二次就能預測 | 結果頁 |
| U14 | **工具頁 = 你填的格子＋結果，讀法在課裡**（操作者 2026-09-25「工具頁完全沒看到可以填表的空格」「講解塞太多，詳解放在五分鐘課程」）：頁首只留標題、「怎麼用？」（另開分頁）、狀態列、一行怎麼讀（連到課程「看懂結果」分頁）；第二張卡 = 輸入表單 `form.runform`（每格 label＋一句提示＋範例 placeholder；主按鈕「執行分析」、用示範案例填入、清空）；之後每張卡標 `data-when=result|empty`；網址狀態 `#new`＝空格子、`#demo`＝填好未執行、其他＝已存的一次執行（`partials/run-form-script.html`，`mockkit.RUN_STATES`）；每段「怎麼讀／你要做的」≤60 字（`HOW_MAX`）；**讀法三步＋30 秒＋四個詞＋逐段讀法**只在一處：有課的工具在課的「看懂結果」分頁（`.can/.cant/.todos/.terms` 不得出現在工具頁），還沒有課的頁（web 結果頁，課程層 P3 前）留在第一張卡；術語首次出現附一句白話（`<dfn>`）。**web 待跟**：`web/app/methods/[id]/page.tsx:74` 執行後只回 `ResultPage`、表單消失，P3 課程層落地時改成表單留在結果上方、讀法移到課，同時 `check-mocks.py --page result` 走有課分支 | 結果頁（工具頁） |
| U15 | **課 = 最上面一張「開始」卡＋分頁**（操作者 2026-09-25「開始填我的案例點下去沒有東西，而且是重點中的重點卻不顯眼」「用 Tab 安排不同性質的內容，之後其他工具以這個為範本」；依據 Atlassian Team Playbook：用法 CTA 在頁首、About／Instructions 分頁；WAI-ARIA tabs）：`.card.cta#start` 在所有分頁之上，唯一主按鈕「開始填我的案例」連工具頁 `#new`（真的空格子），第二顆示範案例連 `#demo`，第三顆「適合我嗎」；領域晶片在分頁上方、驅動每一頁；分頁由 `mockkit.LESSON_TABS` 生成（工具課：認識／看例子／怎麼填／看懂結果／教材版／來源；工作流課：認識／各站／看例子／怎麼走／看懂總覽／教材版／來源），每頁底部「下一個分頁」＋「開始」；**所有開課程的連結另開分頁**（`target=_blank rel=noopener`＋↗，填到一半的格子不丟）；以下六步內容照舊分配到分頁。**先上課再動手**：每個方法第一次使用前一堂 ≤5 分鐘的課，固定六步：這是什麼（何時用／不用）→ 各層／各欄位配日常例子 → 看一個做完的例子 → 怎麼填（每步好例／壞例）→ 常見錯誤 → 開始（準備清單＋「用示範案例試一次」＋「開始填我的」）；每人每方法只自動出現一次，可跳過，方法頁「怎麼用？」隨時重開；**兩版同源**：學員版（5 分鐘六步）＋**教材版**（給老師／帶領者：45 分鐘課堂流程、講稿要點、討論題、學員常錯與怎麼接、講義與投影片大綱；同一份 dossier 資料生成，改課文兩版同步；可匯出講義 PDF／投影片大綱 md，P4；ARF 方法的帶領腳本 = Airtable 帶活動者提示用語／時間分段／停止訊號直接進教材版，D19）；示意稿 = 規格（I11）：`COS/docs/mockups/iceberg-lesson-mock.html`（v7：五個領域驅動第 2–6 步全部例子，晶片切換整頁一起換（D18／U21）；v6：第 1 步的冰山圖與結果頁同一張四層 SVG（同多邊形、同漸層，檢查器 `ICEBERG_SHAPE` 釘住），側欄改教學文字：左「每層問什麼」、右「在這層出手會得到什麼」；操作者 2026-09-24「為什麼五分鐘課程反而只是簡圖」；v5：底部教材版；v4：課程頁同結果頁標準——狀態列（方法齊備 M 檢核／課程來源筆數／時間／學完能做什麼）、每步「怎麼讀／你要做的」、課文段落 [n]、第 5 步自我檢查三題（點開看答案）、第 6 步第三顆按鈕「這方法適合我的問題嗎？」→ 路由 U16、底部「課程來源」卡；五組例子 chips、「看一個完整分析頁」為按鈕；線上版 https://claude.ai/artifact/653Kt4JtExaujnffNDvygY ，私人）；課程結構參考 thesystemsthinking.com 冰山教學（定義→四層→例子→步驟→常見錯誤），內容改寫非轉載 | 方法頁前置 |
| U16 | **不知道該用哪個工具：首頁「描述你的問題」卡（目錄下方）**：貼一段話（亂寫也可，同懶人填寫）→ 第一層免費比對（display-metadata name／blurb／why、`method-inventory.yaml` family／purpose、recipes 說明）→ 信心不足才叫 `route.method`（§3.3）→ 回 ≤3 個建議：方法或工作流、為什麼（每句引 catalog 條目）、會得到什麼、預估成本；一鍵接受 = 生成一條**可調順序的自組工作流**草稿（`/workflows/custom`，既有），使用者改完順序才跑；示意稿 = 首頁目錄下方那張卡（U1 的 `home-mock.html`：textarea、幫我挑、三個建議卡各有「為什麼（引方法資料）／會得到／大約」、接受建議 1 串成草稿） | 首頁＋建立步 |
| U17 | **舊 dashboard 能力零退化**：§0 parity 清單每列在新殼落地並驗過才退場；懶人填寫、示範案例、自組工作流、專家模式原樣移植；「先免費比對、不夠才花 AI 額度」的原則沿用到路由與起草 | 全部 |
| U18 | **工作流頁同 U14／U15**（2026-09-25）：頁首之後是現在這一站的格子（第 2 站 S／W／O／T＋第 1 站帶入的脈絡），`#new` 顯示第 1 站三格、執行後落到第 2 站；工作流課同樣「開始」卡在上＋分頁，「看懂總覽」分頁收讀法。**工作流（多個方法串起來）對第一次用的人**：總覽頁 = 站列（✓ 已完成／● 現在／○ 之後／總結頁）＋每站一張卡（回答什麼／從上一站帶入什麼（自動）／還要你填什麼（標紅）／會得到／約多久多少錢／第一次用的站課）＋能回答／不能回答＋兩種走法：**一站一站走**（每站停下確認，可改順序、可換方法）與**一次跑完**（既有引擎，跑完逐站看）；每站 = 同一個九段結果頁（⑧ 的旅程列 = 站列，下一站固定、可分岔）；**總結頁**（一句話三站合一、每站一句＋你的判斷＋信心、最終建議與改判條件、最後一站的 (5b)、跨站引註不重排、成本合計、核准整條／退回某站 → 之後的站失效且重跑不重填）；課程入口：總覽頁頁首固定一顆「第一次走這條路？先上 3 分鐘的課」按鈕（同結果頁 `.howto`），每站卡一顆「先看 5 分鐘的課」按鈕；課程分層：**工作流課 5 步、≤3 分鐘**（1 這條路解什麼＋能／不能回答＋站列＋何時用／不用 → 2 三站各做什麼、帶入什麼、還要你填什麼，例子跟線走（chips）→ 3 看一個走完的（每站一句＋你的判斷＋總結）→ 4 怎麼走：兩種走法、每站好例壞例、常見錯誤三條、自我檢查 → 5 開始：準備清單＋三顆按鈕；狀態列與每步「怎麼讀／你要做的」同方法課；課程來源 = 工作流定義檔＋各站方法課）＋**站課只在第一次到站時出現**（U15，可跳）；**路線課每站只簡述＋一個填好的例子＋連到該方法的正式課（深度在方法頁，一個事實一處，D25）**；示意稿 `COS/docs/mockups/workflow-lesson-mock.html`（v4：五領域（含一個決策）晶片由 `domains.yaml` 生成、每領域的決策案接續冰山案（D18 故事線）、S／W／O／T 全稱標籤、兩種走法用 `.todos`（不是好壞例框）、自我檢查第三題跟領域、開始步的準備句、**教材版**（三站合一的 45 分鐘課堂，五段同方法課，深度仍在各站方法課）；v3：每站加「完整介紹」連結）（線上版 https://claude.ai/artifact/TP18Q3Xif2BphmAfbxxrKU ，私人）與 `COS/docs/mockups/workflow-result-mock.html`（v3：頁首三步「怎麼讀這一頁」＋30 秒＋四個詞同結果頁（U14）、來源列與核准獨立成最後一張卡＋專家模式 details；線上版 https://claude.ai/artifact/7xEwPu9Cp2rWf3P8g9X1Pk ，私人） | recipes 頁、站頁、總結頁 |
| U19 | **主題機制（操作者 2026-09-24「所有的 CSS、class、style 要統一，因為我想要做主題」）**：`COS/docs/mockups/design-system.css` 是唯一樣式表——token（亮＋暗）＋全部元件＋底部 spacing utilities；五頁 `<style>` 逐位元等於這個檔（`sync-design-system.py` 複製、檢查器比對）；全域元素樣式 `a{color:var(--accent)}`（2026-09-24 工作流課的「完整介紹」連結原本是瀏覽器預設藍）、`textarea{…}`（不綁 `.judge`）、麵包屑 `.crumbs`，**頁面專屬 CSS 為零、markup 的 `style=` 為零、token 區以外零色碼**；**主題 = token 區塊而已**：新主題 = 加一段 `:root[data-theme="<name>"]{…}` 定義與暗色相同的 key 集合（檢查器驗齊全），元件與頁面不動；同義元件已合併（候選方法卡＝站卡 `.mcard`／`.mcards`、`.srow`→`.row`、填好例子框 `.filled`）；新殼 `web/` 直接引用同一個檔，不得另寫一份。**色調 = HCI（hci.aware-wave.com）整組，含背景**（操作者 2026-09-24：「用 HCI 的色調，包括背景色，比較舒服」）：來源 `Projects/internal/hci30/app/public/index.html:15-19`——bg 米白 `#f6f2e9`、card `#fffdf8`、border `#e3dbc8`、text `#232019`、muted `#6f6757`（2026-10-01 由 HCI 的 `#7a7261` 加深：原值在 bg／soft／tint 上 4.0–4.3:1，未達 WCAG AA 4.5）、accent 藍綠 `#0e5b50`（hover `#093f38`）、tint `#e2eeea`、ok `#1f6b47`、warn `#a3611c`、bad `#a13328`；字體 PingFang TC／Microsoft JhengHei；暗色（HCI 無，自訂同色相）bg `#1c2b27`、card `#243530`、text `#f3efe4`、accent `#8fc7b0`、tint `#22403a`；五份示意稿與新殼的設計 token 同一組（`web/app/globals.css` 的 `:root` 與 dark 兩段）；**資料色不受影響**（冰山的水與四層色、圖表的資料序列色維持，語意固定）；主按鈕、連結、旅程列、進度、標籤都吃 accent | 全部頁面 |
| U20 | **版面：預設一欄；只有「多個方法並列」的卡片格依寬度自動 2 欄或 1 欄，永不 3 欄**（操作者 2026-09-24）：候選方法卡（⑧）、工作流站卡用 `grid-template-columns:repeat(auto-fit,minmax(max(260px,calc(50% - 5px)),1fr))`（容器夠寬 2 欄、不夠 1 欄、上限 2）；其餘（三步驟、圖表、KPI、能／不能、好／壞例、四層例子、兩種走法、工作流課第 2 步三站）一律 `1fr` 直排；圖表 svg `max-width:640px` 置中；「標籤＋內容」兩格列（`.row`／`.step`／`.mistake`）不算卡片格 | 全部頁面 |
| U21 | **例子領域 = 一份資料＋一個管理頁**（操作者 2026-09-24「子領域將來可以新增或刪減，是否要多做一個統一操作頁面」→ 要）：領域清單 `SPEC/methods/examples/domains.yaml`（`id`、標籤、順序、預設、狀態 active／retired）是唯一來源，課程每一步的例子都按它渲染；每個方法的例子存在該方法的 dossier（D23）`examples/<domain>.yaml`；**管理頁**（新殼 `/ops/domains`，P4）：新增／改標籤／排序／設預設／停用（停用不刪內容，課程不顯示、資料留著）＋**覆蓋表**：方法 × 領域，每格「齊／缺哪幾步」，缺的標紅並附「補這一格」入口（直接開該方法該領域的例子檔）；新增領域 = 覆蓋表整欄變紅，補完才亮；**資料檔已建**：`SPEC/methods/examples/domains.yaml`（version 1；`default: edd`；五個 active：edd／partner／decision／ecom／daily，各帶 `lessons_key`）；示意稿的晶片列由它生成（`sync-design-system.py` → `partials/domain-chips.html` → 兩堂課），檢查器 `mockkit.load_domains` 驗格式、頁面晶片逐位元等於生成結果、每組例子 = active 集合；**改清單 = 改 yaml → sync → 閘**：缺例子的組直接紅，就是覆蓋表的示意稿版；兩堂課五領域每組全齊（D18；2026-09-24 操作者抓到工作流課少「一個決策」——集合寫在每頁常數就會漂，只准一份資料） | 課程頁、`/ops/domains` |
| U22 | **字級與行寬（操作者 2026-10-01）**：字級只有六個 token——h1 28、h2 20、h3 18、正文 16、次要 14、標籤 12（`--fs-*`，在 `design-system.css` 亮色 `:root`）；要讀的字不低於 14，12 只給掃一眼的標籤（麵包屑、徽章、角標、表頭、時間）；段落（`p`／`.lead`／`.how`／`.sub`／`.read`／`.finding`）最寬 80 個字（`--measure:80em`，以元素自身字級計），表格、圖、卡片格維持全欄；內容欄 `max-width:1360px`（1600px 以上的螢幕段落滿 80 字）；手機留白縮小（`.wrap` 左右 12px、`.card` 14px 12px）。手機一行約 20 字（390px），16px 正文下 25 字做不到。檢查器 U22（`check-mocks.py` `TYPE_TOKENS`／`TAG_OK`／`PROSE`）：字級字面值、要讀的字用 12、段落缺行寬都紅 | 全部頁面 |

**首用流程（螢幕級）**：0 首頁目錄選一個方法或工作流（或描述問題讓系統挑）→ 0.5 它的短課（U15，可跳過）→ 1 建立（名稱、類型、定位詞；預設角度已勾；成本預覽；主按鈕「開始蒐集」）→ 2 蒐集中（進度、已收 N、擋下 M 與原因、可停）→ 3 彙整（草稿每句 [n] 可點開原文；「有缺口」「來源互相矛盾」用卡片）→ 4 分析（預設方法已選；需要你填的欄位標紅，例如權重；主按鈕「執行分析」）→ 5 報表（預覽、「核准」、匯出 md／pdf）。任何一步失敗：一句人話 + 一個按鈕（重試／調整／跳過）。

**量測（沒有數字不算做完）**
- 首用測試協定 `COS/eval/ux/FIRST_RUN_PROTOCOL.md`：一位非操作者測試者，L2 從零（含 5 分鐘課）到核准報表，**≤20 分鐘、零求助**；記錄每步秒數與卡點；SUS ≥ 70。P3 DoD。
- 漏斗事件：`started→collected→synthesized→ran→reported→approved`，含每步耗時與放棄點；進 §3.8 遙測。
- UX 文案／預設值／步驟順序 = §3.8 第 6 種可演化資料 kind（`ux-defaults`），卡點是提案輸入；門檻同 I10 由人定。

### 3.10 解讀層（方法執行後要有分析，不是 JSON）
- 現況：`main:758-788` invoke = builder + gates，無 LLM；`iceberg_model.py:56-109` 原樣回填輸入；結果頁 `dashboard.html:1394-1410` = 通過行＋閘門表＋JSON；AI 只在起草填格（`draft.py:1-10`）。操作者 2026-09-23 截圖確認。
- 做法：一個 context-bound capability（D4 同類）吃 invoke kwargs，伺服器重跑 builder+gates（`invoke` 不持久化 record，`main.py:788` 回傳即丟，客戶端給的 record 不可信），用契約＋display-metadata 生成 prompt，產出 C10 typed object，過 gates，record＋解讀同存 artifact；202 + 輪詢。方法專屬知識只來自契約 YAML 與可演化 prompt 片段（`SPEC/evolution/interpretation-prompts/`），**不寫 285 支程式**。
- 結果頁（web）**固定骨架**（依 NPC 冰山工作單與 Anderson & Johnson 理解層次表）：**每一段固定開頭兩行「怎麼讀」「你要做的」（可為「不用做」）＋每段標來源**（操作者 2026-09-24：「其他八段也照這標準檢查，甚至要更完整」）。(0) 方法一句話＋「怎麼用？」按鈕（U15）＋**狀態列**（AI 草稿未核准／資料來源與筆數／各層完整度與最薄層／成本與閱讀時間）＋**能回答／不能回答**＋「怎麼讀這一頁」三步＋「只有 30 秒看哪裡」＋四個詞 → (0b) **明確文字結論**：一句話＋三個發現（**每個發現一個信心標籤＋理由**：資料厚度與有無外部證據決定）＋建議＋證據缺口＋**改判條件**（什麼證據出現就改結論）＋**你的判斷**（同意／部分／不同意＋原話；D20：使用者原話是記錄，AI 附掛；未填也可核准） → (1) 結構圖：方法原生圖形（冰山／矩陣／樹…），左＝每層要回答的問題＋你填的，右＝該層介入方式，可見／不可見分線，**★ 標本次建議出手的單位＋各單位資料厚度（●○）**；**＋圖表分析（每張圖回答一個問題：趨勢／因果迴路／槓桿對比，資料只綁 record 與 Sources，無資料時標示意；每張圖下面固定三句：怎麼看／看到什麼／來源）** → (2) 逐層卡，同骨架：這層問什麼 → 你填的 [n] → 這代表什麼 → 在這層出手＋效果＋槓桿 → **對應 (5b) 哪個方案 → 資料厚度** → (3) 總結：在哪層出手＋證據缺口 → (4) 對照表（層 × 介入方式 × 時間取向 × 問題 × 你的案例 × 建議；★ 本次建議列）→ **(5b) 解決方案：A 選方案（2–3 個方案 × 見效／成本／持久度／風險／建議；即 L2 決策線，可接 `life-decision-v1` WDM）→ **「如果只做一件事，明天就做」**（零預算、零審批的第一環）→ B 行動計畫（週次／行動／負責／證明方式／目標；負責人、期限與**目標數字皆 `human_required`，標「待你確認」**）→ C 追蹤驗證（≤3 個指標：現況／目標／期限；`review_at` 到期自動用新 Sources 重跑同一 interpret 並比較前後；改善→案例庫，未改善→回 A）** → (5) 下一步（操作者 2026-09-24：「進來的人都是第一次接觸」）：**旅程列**（✓ 已完成 → 下一步 → 之後 → 最後 = 本頁 ⑦）＋一句「你在哪、還缺什麼、**不做也可以**」＋每個候選一張卡：回答什麼／帶入什麼（自動填 N 欄＋**還要你填 M 欄**，標紅）／會得到什麼／約多久多少錢／「用這次的資料開始」（開預填表單，確認才執行）／「第一次用？5 分鐘課」（U15）＋底部四個動作：串成工作流一次跑（每步停下確認、順序可改，`/workflows/custom`）、不確定 → 路由（U16）、直接去 ⑦、先核准存檔；第一顆 = 契約 `recommended_next`；「帶入什麼」由伺服器依契約 `inputs` × manifest **確定性**算出，模型只寫回答什麼／會得到什麼→ (6) 引註（[n] 種類說明；**無外部來源時誠實提示並說明信心上限**）→ (7) 來源列：AI 草稿狀態／模型／費用／檢查（每項 tooltip 人話）／**你的判斷狀態**／核准＝什麼、退回＝什麼、刪除專案＝什麼（人話）。每層的問題、介入動詞、時間取向、可見性 = 方法資料（display-metadata + `SPEC/evolution/interpretation-prompts/`），不寫進程式；**工作流** = 總覽（站列＋走法）→ 每站同九段 → 總結頁（U18、D24、C10 `WorkflowInterpretation`）；沒有「層」的方法（矩陣、清單）以其原生單位（象限、項目）套同一骨架。示意稿 = 規格（I11）：`COS/docs/mockups/iceberg-result-mock.html`（v2.6：版面 U20；v2.5，合成藝術反思案例「團體 session 主動分享 6→2 人」，D18；每段「怎麼讀／你要做的」；⓪ 狀態列與能／不能回答；① 信心＋改判條件＋你的判斷；⑧ = 旅程列＋候選卡＋四動作；線上版 https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq ，私人連結，同檔重發即更新）。
- 驗收：同一支程式對兩個不同 family（`systems.iceberg_model` → layered、`decision.eisenhower_matrix` → quadrant）產出不同視覺；突變：拔 citation gate → 無引註主張 PASS → 紅；拔 `next_methods_resolvable` → 幻覺方法 id PASS → 紅；拔 `visual_bindings_resolvable` → 綁到不存在路徑 PASS → 紅；改 family→kind 表 → 視覺跟著變；送一份閘門會 FAIL 的 kwargs → 422、不呼叫模型、`ai_usage` 無新列。

## 4. 決策紀錄（D1–D22）
| # | 決策 | 為什麼 | 淘汰 |
|---|---|---|---|
| D1 | 產品殼 = Cognitive OS | `BP/12:143-151` `app ≠ portal`；COS 已有租戶／身分／entitlement／journal／商業計畫 | next-admin `/ops/research` |
| D2 | 研究來源系統紀錄 = COS Sources | ADR 011 §脈絡 `:14-20` 三類別不共儲存；產品擁有租戶資料 | KB-as-service（ADR 011 §決策 3 末項 `:57-61` 講的是 KB 服務化，與引擎共用無關） |
| D3 | 蒐集引擎留在 NA，經內部 API 服務化 | ADR 011 §決策 1（`:50` 取得＋抽取是共用層）；零重工 | 移植到 Python |
| D4 | 彙整 = context-bound capability（注入 repo + AI gateway），不是 method、不是 NA 的 LLM 呼叫 | method handler 是純 builder（`rt:48-52`）、capability registry 純函式表（`rt:77`）；需要依賴注入就開新一類，不改既有兩類 | synthesis 當 method（v1） |
| D5 | 蒐集與彙整是 **Project 層級動作**，Recipe 引擎零改動 | `exec:236-250` 只能 resume SUCCEEDED/FAILED；`main:131-133` journal 不含 source；母文件 §78 順序 | collect 當 Recipe step（v1） |
| D6 | 三條線 = Project.purpose 決定「彙整 schema + 預設 recipe」；只新增 1 個 recipe | L2／L3 既有 recipe 已可用（`life-decision-v1` 真跑 PASS） | 三個新 recipe（v1） |
| D7 | 報表 `AI_GENERATED→HUMAN_APPROVED` | 決策記錄 X6 | 直接最終版 |
| D8 | HCI 不在關鍵路徑 | 決策記錄 X1/X2 | — |
| D9 | P1–P4 SQLite 單租戶；P5 Postgres | repository 介面已隔離（`repo:1`） | 先換 DB |
| D10 | **L1 對人分析內容不設限**（操作者 2026-09-24：「我就是在做人的風險分析，東限西限這分析不會準」）：蒐集器抓到的、操作者自貼的筆記／訪談／文件、任何來源都可進，任何人都可分析。系統只做三件對分析無感的事：① `data_classification=CONFIDENTIAL` 自動標記（不進客服檢索）；② 專案級抹除（P1：刪專案即刪來源＋CAS＋產出，留 tombstone）；③ 單租戶（事實，不是限制）。ADR 011 §決策 10 的兩項條件（抹除路徑＋明示批准）以此滿足；主體級 envelope 加密只在第二租戶出現時（P-P） | ADR 011 §決策 10（`011-collection-ingestion-boundary.md:79`：條件 = 抹除路徑打通＋明示批准）；`TenantScopedCas.unlink`（`tenant_scoped_cas.py:116`）已存在，抹除只差專案層迴圈 | 含人但無抹除；等 P-P 才碰人；只限公開來源 |
| D11 | 「自行進化」= 量測→提案→挑戰→晉升／回滾的閉環，只改版本化資料；程式碼永遠人審 | 30 年紀律：無界爆炸半徑不可接受；既有原語（champion-challenger、prompt replay／rollback、golden harness）已是這個形狀 | 讓 agent 直接改 prompt／碼並部署 |
| D12 | 分數是閘不是目標；門檻只能人改 | Goodhart：迴圈會學會討好指標；操作者既有裁定禁止改門檻消音偵測器 | 讓迴圈自調門檻「提高通過率」 |
| D13 | **前端殼 = 新 Web app `COS/apps/cognitive-web`（Next.js 15，與 next-admin／portal 同技術棧；Playwright 在 `lobster-factory/infra/hetzner-phase1-core/tests/` + `scripts/playwright-runner.ps1`）**，操作者 2026-09-23 拍板 B；§3.9 首用流程 + §3.10 結果頁；`dashboard.html` 降為「專家模式」直到 parity 後退場；API 不變 | `BP/12:9-16` Web／API 分離；1443 行單檔 vanilla JS 做不到 i18n、元件庫、a11y、可測；零重工：表單仍由 `method_form.py` 產生 | A 續改 `dashboard.html`（每加一步都是 DOM 手拼，無測試）|
| D14 | 解讀層 = **一個**通用 context-bound capability + 8 種視覺原語；方法知識只來自契約 YAML 與可演化 prompt 片段 | 285 方法不可能各寫一支；契約已有 `purpose／inputs／outputs／recommended_next`（`systems.iceberg_model.contract.yaml:34-70`）；D4 同類、I2／I3 同規則 | 每方法手寫解讀／圖表（`dashboard.html:1320-1345` 那種）；在 builder 內呼叫 LLM（builder 必須純，`rt:48-52`） |
| D15 | ⑦ 執行順序 P0 → PI-a → PI-b → P1；**⑧ P0 部署與 PI-b 同窗**（一次 prod 變更、一次 go-ahead） | 操作者 2026-09-23 授權「你是專家你決定而且要記錄下來」；P0 單獨上線無操作者可見價值、多一次 prod 風險；橋在關掉前只有操作者會按且已知凍結；部署當次仍照 AGENTS §3 要 go-ahead | P0 先獨立部署；⑦ 等操作者。**2026-09-26 偏差**：DEPLOY_HOLD 解除後 sg-deploy 部署整個 main，P0 隨安全修補先上；無功能影響（橋本就只有操作者按、已知凍結）；prod 無 `RESEARCH_BRIDGES_ENABLED` → 三條橋回 410 |
| D16 | 每個方法結果頁都接「解決方案」三步（選方案→行動計畫→追蹤驗證）；工具負責想清楚、排出來、盯著看，執行是人；負責人／期限人填；到期自動重跑比較 | 操作者 2026-09-23「要分析問題也要解決問題啊」；分析停在診斷 = 無處方；選方案就是 L2 線，零重工；追蹤重跑重用 interpret + Sources + 排程 | 只出分析；AI 自填負責人與期限；工具假裝能執行 |
| D18 | **教學例子跟使用者進來的那條線走，不預設商業場景**：**領域驅動整堂課，不只第 2 步**（操作者 2026-09-24）：方法課第 2（四層例子）、3（做完的例子）、4（好壞例）、5（錯誤示例＋自我檢查）、6（示範按鈕）每步都有五個領域各一份，切換晶片整頁一起換；工作流課第 2–5 步同規格（五領域）；檢查器 `MIN_EX_GROUPS`（13／8）／每組 = `domains.yaml` active 集合／預設只顯示 edd／腳本切換全頁（`chips-test.cjs` 真點每個晶片）；晶片標籤「一個決策」（id 仍 `decision`）；領域清單可增減 → U21；`lessons` 每方法五組例子 `{edd_research, partnership_risk, decision, ecommerce, everyday}`；預設 = `edd_research` 組 = 藝術反思／判斷主權場景（帶領者側的流程與制度案例，合成，不含個案臨床內容；L3 EdD 與 L4 ARF 同主題）；「這是什麼」步用 everyday；`ecommerce` = 操作者電商後台 `app.aware-wave.com` 場景（非預設）；示範 Project（U9）、課程、結果頁示意稿三處同一組案例（**課程步驟 2／3／4／6 與結果頁 = 同一個案例**「團體 session 主動分享 6→2 人」；2026-09-24 稽核前 2／4／6 用另一案「再檢視被跳過」而課程卻宣稱「同一個案例」，已統一，檢查器 `PAIR_FACTS`／`NUMBER_PINS`／`FORBID` 釘住數字與舊敘事）；**永不**拿使用者真實填過的案例當教材；**每個領域一條故事線，兩堂課接續**：edd 主動分享 6→2 人 → 要不要改混合制；partner 畫廊延後付款 → 要不要續約該畫廊；decision 家長問平日班 → 要不要加開平日班；ecom 尺寸類退貨率 12% → 尺寸類改預購；daily 週日晚上為家事吵架 → 請家事服務；檢查器 `PAIR_FACTS`（兩課共用關鍵詞）＋`FORBID`（舊案「藝術治療機構／文具／搬到市區」不得回流） | 主要使用者是 EdD 研究者兼工作室經營者，未來主力是藝術反思；商業與學校行政通用例最不貼身 | 單一商業例；學校行政通用例；用真實案例當教材 |
| D19 | **L4 = 同一引擎上的方法家族**：一個 Airtable 工具 = 一個 `art_reflection.*` 契約＋一堂課＋帶領腳本；五生階段 = `wusheng-journey-v1`；八步反思循環 = `reflective-cycle-v1`；Airtable 是作者端唯一正本，單向同步到 SPEC（Canonical ID 為鍵、Content Hash 偵漂移、只同步 Active）；她 registry 裡規劃的 Supabase 遷移 = 對映到 COS P5 Postgres 同一套 schema，**不另建第三個資料庫** | 工具庫欄位與方法契約幾乎一對一（§1）；零重工；她的治理欄位已足夠做同步與漂移 | 第四套獨立系統；手工重打 200 個工具；Airtable 與 SPEC 雙向同步 |
| D20 | **判斷主權核心原則 → 機械閘**（EdD Core Integrity Specification）：`participant_final_judgment`（參與者原話是記錄，AI／帶領者輸出只能 AI_SUGGESTED 附掛，不得覆寫）；`no_preset_conclusion`（輸出無「正確結論」欄，只描述判斷形成過程）；`influence_inventory`（影響來源清單必含 facilitator 與 framework 本身）；`evidence_conditions`（「什麼證據會讓我改判斷」必填，答「沒有」= 標 unrevisable 供研究，不算失敗）；`revisit_scheduled`；`stop_signals`（Airtable 停止訊號 → session 中止）；`no_belief_scoring`（任何評估 artifact 只准量 process visibility／revisability／evidence articulation，禁對 belief 打分）。閘與版本化資料走既有演化迴圈＋LEDGER = 「framework 可被檢查、可被推翻」 | 操作者 EdD 文件 §8 八條不可妥協原則；閘門是這個系統既有原語；讓「原則」變成「機器會擋」而非宣言 | 原則只寫在文件；AI 生成「成熟度分數」 |
| D21 | **參與者模式排在 P5 圖像儲存之後；資料不設限（D10）**：ARF 真實參與者資料（她 registry 標 Personal Data／Sensitive Clinical Data 的 Clients／Assessment Results／Treatment Plans）在 P-P（加密、抹除、同意）完成前**不進系統**；之前只有「帶領者／自我模式」（操作者本人或合成資料）；soulfulexpression.org 只出 Public／Reference 類內容 | D10 同一條線；她自己的 Data Sensitivity 欄位已標明 | 先接參與者再補個資 |
| D22 | **順序**：共用引擎（PI）→ P-ARF-data（2d，純資料：同步腳本＋五生階段各前 2 個工具 ≈10 支契約＋課，人審）→ P1–P4 → P-P（High-STOP）→ P-ARF-participant（5d：`reflective-cycle-v1`、圖像 artifact、參與者模式頁、WuSheng 互動流程接 soulfulexpression.org）。電商後台 `app.aware-wave.com`：本計畫不動（P0 凍結除外），進度本 session 未查證 | 操作者「所有的事情都在進行中都沒完成」→ 一次只讓一條線到「可用」；ARF 是主力但依賴引擎與 P-P；資料層工作可先做且零風險 | 平行開 4 條線；ARF 另起爐灶 |
| D23 | **每個方法的知識來自它自己的 dossier，不靠操作者逐一餵參考**（操作者 2026-09-24：「冰山會這麼優秀是因為我找了很多介紹文和圖，其他工具呢？」）：種子 = display-metadata `url`（285/285）＋契約 `source_of_truth_for`；用自家蒐集→彙整→引註管線起草課文、結果骨架、解讀 prompt 片段；M1–M8 打分，不過 = 「知識不足」誠實顯示；操作者的參考文／圖 = 該 dossier 的 Sources（貼網址即可；圖檔等 P5 圖像儲存，之前由人把圖轉述成文字進 Sources）；≤10 個預設方法人審定稿（操作者參考優先），其餘首次開啟時生成＋送審，演化迴圈（§3.8）依回饋改進 | 零重工：研究線本身就是蒐集→彙整→引註；知識不足必須看得見（R17 缺口誠實度） | 285 支手寫；模型憑記憶生成不引註；等操作者逐一餵參考 |
| D24 | **工作流兩種走法，引擎零改動（I8）**：一次跑完 = 既有 `POST /recipes/{id}/run`，完成後用 run `steps[i]` 的 record kwargs 逐站呼叫 interpret 出九段；一站一站走 = web 依 `GET /recipes/{id}/plan` 回的 `nodes`＋`bindings` 逐站呼叫 `invoke`＋`interpret`，站與站的「帶入什麼」= recipe bindings（確定性，比單一方法的 `prefill_map` 更強），每站停下確認；使用者改順序或換方法 = 存成自組工作流（`/workflows/custom`）再走；總結頁 = `WorkflowInterpretation`（C10）由最後一站完成時生成 | 操作者 2026-09-24「工作流有很多工具，你打算怎麼做？」；executor RUNNING 不可 resume（§0 已駁回清單）→ 停站確認不能靠引擎，只能靠 web 逐站驅動；零重工：兩種走法共用同一個站頁與同一個 interpret | 改引擎加人工暫停節點；每站各自一套頁面 |
| D25 | **教學三層，深度只在一處**：① 路線課（工作流）= 解什麼問題＋每站簡述＋填好的例子＋連到方法課，≤3 分鐘；② 方法課（學員版）= 完整六步，M1–M10，冰山那堂是標準；③ 教材版 = 同一份 dossier 資料排成課堂用（流程／講稿／討論題／常錯／講義），可匯出。路線課**不重寫**方法內容；方法的豐富度來自它自己的 dossier（D23），不是寫課的人當下記得多少 | 操作者 2026-09-24「為什麼豐富度比 iceberg 差那麼多？希望可以成課堂教材；或先簡述再連到單一工具的正式介紹頁？」——冰山有資料庫（三篇文＋四張圖），三站方法還沒有；路線課本就不該承載方法深度 | 在路線課把每個方法各講一遍；教材版另寫一份內容 |
| D17 | 課程層 = 資料驅動：課文由 display-metadata（blurb／why zh+en）+ 契約 `purpose／inputs／preconditions` + `method-form-examples.yaml`（示範案例）+ 第 8 種可演化 kind `lessons`（每方法的日常例子／好例壞例／常見錯誤）生成；三條線的預設方法（冰山、WDM、Toulmin、文獻矩陣等 ≤10 個）人審定稿，其餘 275 個由模型起草標 AI_SUGGESTED、首次被開啟時送人審佇列；**課文與骨架的知識來源 = 方法 dossier（D23），每句 [n]，不是模型記憶** | 操作者 2026-09-23「使用者之前沒有使用過這個工具，所以你要先幫他上課」；285 支課不可能手寫；課文錯誤的爆炸半徑 = 誤導一次使用，可回滾 | 只給示範 Project（U9）不教方法；285 支全部手寫；課文寫死在前端 |

## 5. 分期
| 期 | 內容 | 風險 | 完成定義（缺一不算） | Rollback | 估工 |
|---|---|---|---|---|---|
| **P0 凍結** | 三顆「送去 X」按鈕與兩條橋 feature-flag OFF（不刪碼、**不搬資料**）；`lib/hci/client.ts:6-9`、`CollectionSourcesPanel.tsx:991-993`、`ClientHubTabs.tsx:1880-1888` 過期註解改事實 | Low | NA 頁面無「送去 X」；`npx tsc` 綠 | flag ON | 0.5d |
| **PI-a 解讀層 + 新殼第一片（碼＋本機）** | context-bound adapter 類（`rt:70-100`）；`interpret.method_record` + typed object + 3 gates + `POST /methods/{id}/interpret`（202）+ `GET /interpretations/{id}`；`repo.append_event`；`COS/apps/cognitive-web` 骨架（Next.js 15；同源 `/api/` 呼叫 COS，登入頁；方法挑選最小版；表單渲染移植 `dashboard.html:901-1255` 的 variant／rows／fixedRows／upstream／json／pills／conditions；**結果頁 §3.10** + layered／quadrant／table 三種視覺 + 專家模式 JSON）；Dockerfile；`deploy.sh` 擴成多服務；Playwright `cognitive` project + `COS_TEST_{TENANT_ID,EMAIL,PASSWORD}` env | Medium | 本機 `docker compose up`（api+web）：操作者的冰山案例 → 結果頁如示意稿，每句主張有 [n]；`decision.eisenhower_matrix` 同一支程式出 quadrant；三個突變（§3.10）各紅；閘門 FAIL 的 kwargs → 422 且不呼叫模型；COS unittest + golden 綠；web `tsc` + vitest 綠；Playwright 登入→執行→結果一條；`ai_usage` 有該次記錄 | 契約→DRAFT 即消失；web 目錄獨立可刪；`deploy.sh` 多服務段落為附加 | 5d |
| **PI-b 上 prod** | nginx `/api/`／`/expert/`／`/` 分流（`safe-infra-patch.sh nginx`）；`dashboard.html:299` `API_PREFIX`；`deploy.sh:15` smoke → `/api/health`；`/opt/cognitive-os` pull + `deploy.sh`（api+web）；P0 已於 2026-09-26 上線（`b8c191698`），本期不再含 next-admin 部署 | **High-STOP**（prod 部署，每次 go-ahead） | `app.aware-wave.com/ops/collect` 無「送去 X」按鈕；`https://cognitive.aware-wave.com/api/health` 200、`/expert/` 舊頁可登入、`/` 新頁跑完冰山案例；deploy.sh 全綠；`printenv` 驗 web 容器 env | nginx 還原（safe-infra-patch 自動）；`cognitive-web:rollback` tag；api 不動 | 0.5d |
| **P1 Source + Collection Service** | §3.3 前六列 + egress allowlist + `--tenant-id` bootstrap + journal key mode + **專案級抹除（D10）** | Medium | curl 觸發一次真實 company run（操作者真 tenant）**＋一次自然人 run（任意來源，含操作者自貼的筆記；自動 `CONFIDENTIAL`）→ 刪專案 → sources／CAS／artifact 三處讀不回，events 只剩 tombstone**→ COS Sources 帶 provenance／fetched_at／collector identity；重跑同 seeds → 全 `unchanged`、0 新列；改一頁內容重跑 → supersede 列 + event；壞 hash → 400；過期 grant → 401；NA `tsc`+vitest 綠；COS pytest + golden 綠；`printenv COGNITIVE_OS_JOURNAL_KEY_MODE` ≠ disabled | 新欄位 nullable；端點下線；sink 檔刪；allowlist 還原 | 3d |
| **P2 彙整 + 引註閘 + harness** | 重用 PI 的 adapter 類與 `citation_integrity`；三個 synthesis + typed objects + manifest + gate；`literature_search` v2；**§3.7 harness：每線 3 個黃金案例（P-E 前補到 5）、score.py、thresholds.yaml（首次基準線）、CI 接入、突變腳本** | Medium | 對 P1 的 Project 跑 `dossier_brief`（company）：每主張引註 ⊆ manifest；突變（拔閘）→ 假引註 PASS → 紅；`research-qualitative-v1` 用 `literature_search` v2 回真 Sources 跑 PASS；golden 全綠；**harness 9 案例全部跑出分數、基準線報告給操作者定門檻、拔閘突變讓幻覺率變紅** | 契約 status→DRAFT 即從 catalog 消失；harness 目錄獨立可刪 | 3d |
| **P3 三線端到端 + 首用流程** | web 首頁目錄（U1）+ §3.9 六步流程（骨架與路由已在 PI）+ 其餘 5 種視覺原語（matrix／graph／tree／timeline／scorecard）+ **課程層（U15／D17：課程頁元件、`lessons` 資料 kind、≤10 個預設方法人審課文、其餘模型起草＋人審佇列、每人每方法一次的已看紀錄）** + 示範 Project seed + 說明面板（registry 生成）；draft-from-synthesis + `human_required`；`async:true`；`partnership-risk-v1` + **方法 dossier 管線（D23）：`method_dossier` purpose、285 個種子 URL 批次蒐集（成本預覽先報）、三份可演化資料起草＋閘、M1–M8 計分器、≤10 預設方法人審** + **問題路由 U16（`route.method`＋首頁「描述你的問題」卡）＋ parity P3 列（recipes 頁、自組工作流拖曳排序、從彙整表起草、圖表面板進專家模式）** + **工作流頁（U18／D24）：總覽站列＋兩種走法＋站頁重用單一方法九段＋總結頁；工作流課 5 步（每站簡述＋連結）＋站課 lazy＋≤10 預設方法的教材版（同源生成、人審）** | Medium | L1（公司）／L2／L3 各一次真跑到方法輸出；未填權重不准 run；長 run 走 202 + 輪詢；成本預覽 = 實際查詢數；**首用測試協定通過（非操作者、L2 ≤15 分鐘零求助、SUS ≥ 70）**；Playwright 走完六步；零原生 `<select>`（grep = 0）；**冰山以外至少 3 個預設方法（WDM、Toulmin、文獻矩陣）M1–M8 全過；隨機抽 5 個非預設方法首次開啟 → 課程與骨架自動生成、缺項標示正確**；**隨機 5 個真實問題描述 → 路由 ≤3 個且每個 why 引 catalog、第一層免費命中率記錄；接受 → 自組工作流調順序後真跑；§0 parity 清單 P3 列全綠**；**`life-decision-v1` 一站一站走完 3 站出總結頁，且一次跑完出同一總結頁；退回第 2 站 → 第 3 站失效、重跑第 1 站不重填** | recipe→DRAFT；旗標移除；首頁目錄下線回 PI 方法頁；課程層 = 資料，刪 `lessons` 目錄即無課 | 7d |
| **P4 報表 + 解決方案** | `artifact.generate_report` + export + 核准；解讀的 `interpretation_state` + 核准／退回 endpoint（C10 移來）；**C11：方案比較／行動計畫（`human_required` 負責人與期限）／指標／`review_at` 排程重跑與前後比較（D16）** + **教材匯出**（講義 PDF、投影片大綱 md，從方法課同一資料）+ **跨專案來源搜尋** `GET /sources/search?q=`（同租戶全專案，回 Source 列＋所屬專案＋引用它的發現；取代知識庫在研究線的角色，⑨） | Medium | 三線各一份 md（+pdf），[n] 全解析到 id/sha256/url/fetched_at；核准翻轉 + 事件含 identity；再跑 = 新版本；**冰山案例：方案表 3 列、計畫表含 owner 待確認、指標 3、排程一筆；owner 未填 → 存任務被拒；模擬到期 → 重跑產 SolutionReview** | capability 移除；排程刪除即停 | 3.5d |
| **P4b 回饋與遙測** | `RunScored`／`HumanEdited`／`ReportApproved|Rejected` events；核准／退回原因 chips；draft-vs-人改 diff；夜跑 harness 漂移偵測 routine | Low | 每個 run 都有分數事件；退回一次 → 事件含原因；夜跑連續 3 晚有報告 | 事件為附加，關 routine 即停 | 1d |
| **P-E 演化迴圈** | §3.8：版本化資料目錄 + champion 指標、提案 routine、`run-challenger.ps1`、LEDGER；第一批可演化資料 = 角度表、來源分類、synthesis prompt、模型路由 | Medium（資料級自動晉升需操作者同意範圍） | 一次真實循環：routine 產生提案 → challenger 在 harness + 3 個真實 Project 重放 → 不劣於 champion → 晉升 → LEDGER 一行 → 一鍵回滾成功；劣化提案被丟棄且留紀錄；夜跑紅 → 自動回滾到最後綠版 | `python -m ai_lego.apps.cli.evolution rollback --kind <k>`（LEDGER 重播，回上一版）；整期退場＝revert 本期 commit（沒有硬編預設可回，P-g／P-K4） | 3d |
| **P-ARF-data（L4 資料層）** | `sync-art-reflection.py`（唯讀 Airtable，Canonical ID 鍵，Active 過濾，Content Hash 漂移）→ 五生階段各前 2 個工具 ≈10 支 `art_reflection.*` 契約＋lessons（藝術反思／合作／決定／電商／日常五組例子，D18）＋`wusheng-journey-v1` recipe；D20 七閘 + golden case | Low（資料＋唯讀同步） | 10 支契約通過 golden；`wusheng-journey-v1` 在 recipe engine 真跑 PASS（合成資料）；改 Airtable 一筆 → 重跑同步 → 該契約 `source.content_hash` 變且標 drift；突變：拔 `no_belief_scoring` → 含分數的評估 artifact PASS → 紅 | 刪 SPEC 產出檔；Airtable 不受影響 | 2d |
| **P-ARF-participant（L4 參與者層，P5 後）** | `reflective-cycle-v1`（八步）；圖像 artifact（照片／作品，object storage）；`cognitive-web` 參與者模式（停止訊號 UI、同意、抹除入口）；soulfulexpression.org WuSheng 頁 → 參與者流程；facilitator drift 遙測（journal） | **High-STOP**（prod 上參與者模式；依賴 P5 object storage；資料不設限，D10） | 一位帶領者＋一位同意的參與者跑完一個 session：參與者原話為記錄、AI 附掛皆 AI_SUGGESTED；evidence_conditions 空白 → 閘標 unrevisable；停止訊號觸發 → session 中止且事件留存；抹除 → 三處讀不回 | 參與者模式旗標 OFF | 5d |
| **P5 Production Trust** | Postgres + RLS Tier A、object storage、`.runtime` 進 backup routine、SLO／告警、rate limit、restore drill、run lease、portal provisioning、entitlement 真閘 | **High-STOP** | 第二 tenant 端到端 + 跨租戶負向測試綠；restore drill 過；`/check-drift` 綠 | 回 SQLite 映像 + 回填 | 5d+ |
| **P-P 主體級保護** | Source envelope 加密（per-subject DEK）+ subject 級定址 + 主體級抹除驗證 + 第二租戶前的 ADR + 操作者明示批准；**前置對象 = 第二租戶**（別人的資料進同一系統時才需要主體級保護；操作者自己的單租戶不設限，D10） | **High-STOP** | 抹除後 CAS／journal／artifact 三處讀不回；負向測試；ADR 落地 | 不上線即無資料 | 5d+ |
| **P6 選配** | `apps/collector` 容器；HCI adapter（`BP/10:83`） | Medium／High | 觸發：第二 tenant／要開 HCI 案 | — | — |

**執行順序** P0 → PI-a → PI-b → **P-ARF-data**（暫緩，見 §0）→ P1 → P2 → P3 → P4 → P4b → P-E；P5／P-P／P6 觸發式；**P-ARF-participant 在 P5 之後**。**核心 P0–P4 = 22.5d；含 P4b + P-E = 26.5d**（1d = 一個完整工作 session，單一工程師）。里程碑（操作者看得到的）：PI-b 完 = 第一次在正式站看到真分析（第 6 天）；P1 完 = 真來源進系統（第 9 天）；P2 完 = 引註彙整（第 12 天）；P3 完 = 三線端到端 + 課程 + 方法 dossier + 問題路由 + 首用測試（第 19 天）；P4 完 = 報表 + 解決方案 + 跨專案搜尋（第 22.5 天）。

## 6. 驗證矩陣（每期四動作 + 突變）
| 動作 | PI-a | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| 實測 | 操作者冰山案例真跑（真模型）；兩 family 兩種視覺；`docker exec` 讀 `ai_usage` 列 | curl + `docker exec` 讀 COS sqlite 列數／events | 真 Project + 真模型 | 三線真跑；202 輪詢；容器重啟後新 run 重跑 | 下載 md/pdf、核准事件 |
| Review | critic 1 + `/codex-review`（PY、TS 各一 artifact） | 同 | 同 | 同 | 同 |
| 抓蟲 | grep `renderQuadrantChartForMethod\|gate_results\|記錄 JSON`（舊渲染呼叫點） | grep `sink/kb\|cognitive_os_project_id\|import-sources` | grep `enforceCitations\|REPORT_SECTIONS\|offline_literature_search` | grep `importOrganizationSources\|hci-import\|data_classification\", \"INTERNAL` | grep `dossier_report\|build_dossier` |
| 突變 | 拔 citation gate → 無引註 PASS → 紅；拔 next_methods gate → 假方法 id PASS → 紅；拔 visual_bindings gate → 亂綁 PASS → 紅；改 family→kind 表 → 視覺跟著變 | 拔冪等鍵 → 重複列 → 紅；拔 hash 比對 → 壞 hash 200 → 紅；拔 grant project 綁定 → 跨 project 寫入 → 紅 | 拔閘 → 假引註 PASS → 紅；harness：刪一個期望發現的來源 → 覆蓋率降 → 紅 | 拔 `human_required` → 空權重 run → 紅 | 拔 [n] 解析 → 未解析引註 → 紅 |

- P4b／P-E 突變（不在上表）：夜跑把 champion prompt 換成故意劣化版 → 漂移紅 → 自動回滾；提案 routine 塞一個劣化提案 → 挑戰失敗 → 不晉升且留紀錄；拔 `requires_human` → R3 提案自動晉升 → 紅。

## 7. 風險與待驗證
| # | 風險 | 處置 |
|---|---|---|
| R1 | 長 run（synthesis／recipe）超過 Cloudflare ~100s | 背景 thread + 202 + 既有 journal 狀態端點；RUNNING 中斷以新 run_id 重跑（冪等）；lease 進 P5 |
| R2 | SQLite 單寫入者：ingest 批次 + dashboard 同時寫 | ingest 單交易批次；P5 前單 tenant；量測後決定 |
| R3 | 成本失控 | C7 plan+confirm；`MAX_QUERIES=16`（`NA/lib/collect/search/query-plan.ts:84`） |
| R4 | 注入內容 | 蒐集端隔離 + 資料塊包裹 + manifest 閘 + egress allowlist |
| R5 | 自然人法遵 | D10：單租戶、內容不設限、自動 `CONFIDENTIAL`、專案級抹除（P1）、操作者 2026-09-24 兩次明示；**殘餘風險（操作者接受）**：個資靜態未加密存於自家主機，抹除只到專案層；第二租戶出現前必做 P-P |
| R6 | 學術全文只到 OA（`NA/lib/collect/collectors/academic.ts:8-13`） | L3 v1 = 摘要＋OA 全文；不假裝 |
| R7 | NA／COS 兩 deploy 單位漂移 | C1 `schema_version`；契約測試兩邊各一；`/check-drift` 比 env |
| R8 | `.runtime/` 未入備份 | P5 前先入既有 backup routine |
| R9 | context-bound adapter 破壞「registry side-effect-free」宣告（`rt:77`） | 分兩類、契約 description 標 context-bound（capability-contract schema 無 `binding` 鍵，WC-PIa-02）、純 Recipe 步驟禁用；golden test 守 |
| R10 | grant 經 Trigger payload 外洩 | 只傳參照，token 於 NA route 內換取；短效；complete 後作廢 |
| R11 | Goodhart：迴圈學會討好指標（例如少寫主張以拉高引註精確率） | 指標成對（精確率×覆蓋率×缺口誠實度）、主指標需人定；門檻只人改（I10）；抽樣人審每月一次 |
| R12 | 黃金案例過時、模型／供應商漂移 | 夜跑漂移偵測；案例每季由真實 Project 補 1 個；案例來源為快照不連網 |
| R13 | 演化成本（夜跑 token） | harness 用小模型跑結構指標、人審抽樣用大模型；`ai_usage` 計量 + 月上限 |
| R14 | 演化把「行為即資料」擴大成第二套程式（YAML 裡寫邏輯） | 可演化資料只限 §3.8 表列六種 kind；新增 kind 走 ADR |
| R15 | 兩個前端並存期（web + 舊 dashboard）功能分叉 | 舊 dashboard 只讀不加功能；parity 清單在 §0 追蹤；退場日期 = P4 驗收 |
| R16 | 首用測試只做一次、只有一位測試者 | 每期 DoD 重跑同協定；測試者輪替；卡點進遙測而非只靠一次觀察 |
| R17 | 解讀層幻覺：主張超出 record 與 Sources | manifest 只含 record 欄位 + Sources；`citation_integrity` FAIL；`gaps[]` 讓「不知道」有地方寫（缺口誠實度指標，§3.7） |
| R18 | 新 compose 服務 + nginx 路由 = prod 改動 | PI-b High-STOP；compose 走 `COS/deploy/deploy.sh`（`safe-infra-patch.sh compose` 只認 `/root/lobster-phase1`），nginx 走 `safe-infra-patch.sh nginx` + 手動 cognitive smoke；`/expert/` 保留舊頁；rollback = nginx 還原 + `cognitive-web:rollback` |
| R19 | 解讀單次呼叫 > 60s（provider `provider.py:45` 與 nginx `default.conf:431` 皆 60s）→ 504 但 token 已扣 | POST 先回 202，背景 worker 最多兩次模型嘗試（含修復）並累計 token；`ai_usage` 記錄成功與失敗用量，GET 輪詢 DONE／FAILED，不讓 HTTP 請求等模型。 |
| R20 | ARF 外化步驟產出作品照片；COS artifact 現只有 JSON、Sources 只有文字 | 圖像 artifact 型別 + object storage 在 P5；P-ARF-data 階段只用文字紀錄（反應紀錄建議方式）；參與者層等 P5 |
| R21 | Airtable 與 SPEC 漂移；停止訊號欄多筆為空 | 單向同步＋Content Hash 標 drift；`stop_signals` 為空的工具在 recipe 中標 `requires_facilitator_review`，不上參與者模式 |
| R22（依 12.1-13 解決） | WC-PIa-15 契約與兩個舊測試衝突：舊測試解包 tuple／要求失敗 raise，卡要求 dict 且不 raise | 操作者 2026-09-25 准許只更新 `test_interpret_method_record.py:77-88` 兩個舊測試至新契約；原成功斷言保留，失敗加錯誤類別／兩次呼叫／兩次 token 累計；兩種失敗突變各做紅→綠 |
| R23（依 12.1-13 解決） | WC-PIa-15 非同步契約與 `test_api_interpret.py:83-90,150-151` 兩個舊測試衝突：POST 後立即 GET 要求 DONE/result | 操作者 2026-09-25 准許只更新這兩個舊測試為 POST 202/PENDING → 同步 `_run_interpretation` → GET DONE；原結果與用量斷言保留；以突變驗證舊同步行為會使測試紅 |
| R24 | WC-PIa-15 `/claude-review`：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claude-oracle.ps1 -Context 'WC-PIa-15 asynchronous interpretation; all attempts metered and failure events persisted' -Model sonnet` → exit 1：`claude -p failed or returned an invalid/incomplete review schema`；stderr 0 bytes、無 oracle artifact；審查快照 161538 bytes，含共用工作區其他改動 | 操作者 2026-09-25 明示「先自我審查並 commit+push」：僅 WC-PIa-15 改以自審提交；14R 的 Claude oracle artifact 仍為必備，不宣稱已通過。 |
| R25（依 12.1-13 解決） | 14R 重跑發現 `tests/e2e/cognitive/iceberg.spec.ts::login -> iceberg -> result page sections including 5b` 守舊 UI 契約（原始 method id h1、手貼 Project ID、九區塊），與 WC-PIa-20／21 明文新契約衝突；原寬鬆 heading 斷言還會誤中清單 h2 | 同卡更新該測試與 runner，保留原登入／搜尋／示範／執行斷言及 mock 模式引註 `toHaveCount(1)`；真模型模式改以 API findings 的引註數做 `toHaveCount(精確數量)`，不放寬比較。mock 與官方真模型 Playwright 各 1 passed；方法頁 h1 暫改回原始 id 時測試紅、還原綠。 |
| R26（已解決） | 14R 真模型與 oracle 外部前提：本機 `COS_TEST_*` 身分已建且登入 HTTP 200；操作者已放入有效 `COGNITIVE_OS_ANTHROPIC_API_KEY`，Claude CLI 已登入。 | 舊 dashboard 真 AI 草稿＋執行成立，官方真模型 Playwright 1 passed、0 skipped；不再借用 next-admin `COGNITIVE_OS_SERVICE_*`。Claude oracle 額度暫時不足另見 R28。 |
| R27（已解決） | 14R 真模型回傳暴露 prompt 範例與 schema 不一致：頂層 `revision_conditions`、空 recommendations／next_steps 範例、layered 空 bindings；gate 又把層顯示 label 誤當 manifest path。 | prompt 示範 typed shape；把名稱→有效路徑映射轉為 `levels[]`，未知路徑仍拒絕；`gaps` 缺證據明示未指定；結果頁顯示 finding-level 改判條件。單元正反例及 UI 顯示突變紅→綠；真模型官方 E2E 通過。 |
| R28（已解決） | Claude Python／TypeScript 全量 bound diff 複審各產真 artifact（`2026-09-26-review-60edab1b.md`、`2026-09-26-review-23199f3f.md`），共同指出失敗用量寫入覆蓋原始解讀錯誤，另指出 binding `label` 豁免過寬及 Docker build-time origin 說明不足。 | 修正並做失敗路徑／非 layered `label` 反例測試，Dockerfile 說明 build-time 設定；修正 diff 再審 `2026-09-26-review-8ed7da44.md`、最終 `2026-09-26-review-28ae67cc.md` 均 `approve`；最後低風險提示僅涉及現行 schema 不容許的巢狀 level。完整 unittest `Ran 14204 ... OK (skipped=34)`，14R 通過。 |
| R29 | **已關（2026-10-02 正式站抹除 7 專案全驗過，WORKLOG 續1）** WC-P1-15 ⑤ prod 專案抹除未驗（2026-09-26：本線 AI 回應在寫 prod 抹除驗證時被模型端安全過濾中斷，續59） | 抹除有 `tests/unit/test_project_erase.py` 8 案＋突變；操作者執行 `DELETE /projects/264ba6a4-0154-4593-94c4-a1ee8c5ecd15`（已備：筆記＋解讀 artifact＋2 筆蒐集來源）→ sources／CAS／artifact 讀不回、events 只剩 `ProjectErased`、與 L1 專案共用的首頁 blob 仍可讀 |
| R30 | K10：自然人 run 自動 `CONFIDENTIAL` 無元件（§3.2 步驟 1 purpose→分類未排期） | 現行：建專案時明填 `Confidential`；自動推導歸期待操作者定 |
| R31 | recipe journal 以 tenant＋run_id 存、不綁 project（`main` `def workflow_journal_path`）→ `DELETE /projects/{id}` 不含 journal | 綁 project 或 journal 設保留期；歸期待定 |
| R32 | 研究 run 的 entity 搜尋非決定性：同 seeds 重跑可能多出新 URL（2026-09-26 prod：5 unchanged＋1 新） | 冪等只保證已收 URL；「重跑 0 新列」以 URL seed 驗（prod 10→10）；無 anchors 的公司名搜尋會混入同名無關頁，正式使用要給 anchors |
| R33 | P2 期末的兩項真實模型證據仍未產生：操作者專案 `dossier_brief` 與 9 案 baseline 會產生付費用量；門檻未由人裁定前不得寫入 `thresholds.yaml` | ②／③ 以身份 session、檔案權限 600、完成後 revoke＋刪 token；baseline 只留下逐案報告，`thresholds.yaml` 維持全 null；操作者明示繼續後才執行 |

## 8. 退場清單（P0 flag OFF；P4 驗收後刪）
`NA/lib/cognitive-os/{client,import-sources}.ts`、`NA/lib/hci/{client,import-sources}.ts`、`NA/app/api/ops/clients/[slug]/{cognitive-os-import,hci-import}/route.ts`、`NA/app/api/internal/cognitive-os/import-project-sources/route.ts`、`NA/app/api/cognitive-os/open/route.ts`、`NA/lib/dossier/folder.ts`（`report.ts` 移植後整層刪）、`CollectionSourcesPanel.tsx:545-568`、`ClientHubTabs.tsx:1795-1811`、`SPEC/recipes/validated/edd-literature-search-v1.recipe.yaml`（fixture）、`rt:80-88` offline adapter；migrations 0087／0088／0089 欄位保留標 deprecated 不 drop；`bootstrap_service_identity.py` 的 service tenant 用法退場（改 `--tenant-id`）。`/ops/collect` 與客戶 KB **維持**。

## 9. 已定案（不重問）／待拍板
- 規格：頂級國際規格；不補丁；LEGO；文件 AI 極簡；每 commit 1 critic；報表停在 AI 草稿，人核准才成立。
- 三條線：L1 對人／公司／組織／事件，內容不設限（D10）；L3 第一版 = 文獻矩陣＋證據矩陣＋Toulmin，不含文獻回顧草稿；HCI 退出三條線（D8，P6 選配）。
- 平台：品質評分 harness（P2）與演化迴圈（自動晉升只到 R0–R2 資料級；模型與門檻永遠人審，I9／I10）；首用者不看文件能走完（§3.9）；不知道用哪個工具 → 問題路由（U16）；舊 dashboard 能力零退化，parity 清單在 §0（U17）；前端殼 = 新 `cognitive-web`，舊 dashboard 降專家模式（D13）；解讀層先於殼的其餘功能。
- 執行：P0 → PI-a → PI-b → P-ARF-data（暫緩，見 §0）→ P1 → P2 → P3 → P4 → P4b → P-E；P0 部署與 PI-b 同窗（D15）；P5／P-P／P6 觸發式（第二租戶／HCI 案）；便宜模型照 §12 執行，Fable／Opus 只產卡與期末閘。
- 教材：例子預設藝術反思、五組可切換、永不用真實案例（D18）；兩份示意稿 = 每個方法的規格（I11，M1–M8）；每個方法的知識來自它自己的 dossier（D23），不靠操作者逐一餵參考。
- 資料：研究來源與所有分析結果存 COS 研究庫（§3.3），不進 `/ops/knowledge`；跨專案搜尋在 P4。
- L4：Airtable 單向同步、判斷主權七閘、參與者模式在 P5 之後（D19–D22）。
- 待拍板：無。

## 10. 文件關係與維護規則
- 本檔 = 計畫正本。`COS/docs/feature-cognitive-os-completion.md` 指回；`COS/plan.md` 勾選隨 §0；`agency-os/TASKS.md` 一列 = 進度指針；WORKLOG = 過程；決策記錄 `agency-os/reports/decisions/2026-09-23-research-pipeline-architecture.md` §10.1–10.3 為前提。
- 示意稿：任何示意稿改動 → `python COS/docs/mockups/check-mocks.py` 綠才可 commit；**樣式只改 `design-system.css`、共用片段只改 `partials/*.html`、領域只改 `SPEC/methods/examples/domains.yaml`** → `python COS/docs/mockups/sync-design-system.py` 複製進五頁（晶片列先由 yaml 重生）；頁面不寫自己的 CSS、不寫 `style=`、不手改片段；新頁面 = 空 `<style></style>` 跑 sync 再寫 markup，並加進 `mockkit.FILES`＋`build-artifact.py OUT_NAME`＋`render-mocks.cjs FILES`；**任何清單（方法、工作流、領域、家族）都由登錄檔生成成 partial，頁面不手打一列**；跨頁同類元素（麵包屑、狀態列、怎麼讀、教材版、頁尾來源列、好壞例成對）的規則在檢查器 `check_common／check_result／check_lesson／check_home`，改一頁前先問「另外四頁有沒有同一件事」，答案要變成規則不是記憶；設計規則新增 = 先加進檢查器再改頁（I11）。**發布前必看圖**：`node COS/docs/mockups/render-mocks.cjs <out-dir>`（Playwright，見檔頭；`.cjs` 因 repo 根 package.json 是 `type:module`）產出桌機／手機／深色切片，用 Read 逐張看；課程頁晶片功能 `node COS/docs/mockups/chips-test.cjs`（每個晶片真點、每組恰一份可見）；2026-09-24 光靠 computed style 漏掉冰山圖深字壓深冰、右欄裁切、圖 B 文字壓箭頭三個缺陷，看圖才抓到。跨頁事實（案例數字、站名、填寫格數）在檢查器 `FACTS`／`FORBID`，改故事先改那兩張表。
- 維護：改 §3.3 元件的 commit 必同步 §3.3／§3.4；`:line` 只在 §0／§2／§3／§7／§12 出現；每完成一張卡更新 §0 進度板、每完成一期更新 §0 現況表；契約變更走 ADR（`SPEC/docs/adr/`）。

## 11. 接手指南（陌生 agent 從零開工）
- **讀序**：**§0 進度板五行（做到哪、下一張卡）** → §12 現在那張卡（有卡就照卡做，不自行設計）→ §5 該期列 → §3.3 該期元件列 → §3.4 契約 → §9（不重問）→ §4 淘汰欄（不重提）。
- **路徑縮寫**：檔頭（COS／SPEC／NA／WF／BP）。spec root 對 runtime 唯讀（`COS/README.md`）。
- **本機跑**：COS 測試 `cd COS && python scripts/affected_tests.py --run`（全套只依規則 11，未設 `COS_FULL_SUITE=1` 時 `tests/__init__.py` 直接擋）；golden `python SPEC/tests/run_golden_tests.py`；API `uvicorn ai_lego.apps.api.main:app --port 8420`（= Dockerfile CMD）；NA `npm test` + `npm run typecheck`；Playwright `scripts/playwright-runner.ps1`。
- **環境變數**：`COS/deploy/.env`（不進 git）= `COGNITIVE_OS_ANTHROPIC_API_KEY`、`COGNITIVE_OS_AI_MODEL`、`COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET`、`COGNITIVE_OS_JOURNAL_KEY_MODE`；`COS/docker-compose.yml` `environment:`（**覆蓋 env_file，改 .env 無效**）= `COGNITIVE_OS_DB_PATH`、`COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST`；實值在各機 `mcp/user-env.ps1`，不硬編。
- **部署**：COS = ks-aw-01 的 sparse clone `/opt/cognitive-os`（只含 COS+SPEC）：`git pull --ff-only` 後 `bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh`（test→health→smoke→rollback→notify；compose 檔即 prod 檔，多服務由它套用）；NA = `sg-deploy.sh`；nginx（在 `/root/lobster-phase1`）只走 `safe-infra-patch.sh nginx`（AGENTS §0），`cognitive.aware-wave.com` 區塊分流 = `/api/`→api（去前綴）、`/expert/`→api `/`、其餘→web；每次 prod 部署 = High-STOP，先要 go-ahead。
- **每期工作卡**（開工前寫，AI 極簡）：`files`（§3.3 列）／`tests`（新測試檔）／`verify`（一條指令 + 預期輸出）／`mutation`（§6 該欄）／`commit`（根因 + 驗證）／WORKLOG 四行（REALTEST／REVIEW／BUGHUNT／WORKLOG）。
- **進度指針**：§0 計畫列 + `agency-os/TASKS.md` 研究線一列 + WORKLOG 當日「續N」；三處只寫指標，細節在本檔。
- **不做**：不改 Recipe 引擎（I8）；不在 builder 內叫 LLM（D14）；不加原生 `<select>`（U11）；不碰自然人（D10）；不調門檻（I10）；每 commit 最多 1 個 critic（AGENTS §4）。
- **卡住**：架構衝突／缺資訊／無法驗證 → 停，§7 加一列，問操作者一題。

## 12. 便宜模型執行協定（任何模型照卡執行；品質靠卡片與驗收指令，不靠模型聰明）
> 操作者 2026-09-24：「之後不可以一直開 Fable，要讓任何便宜的模型做得一樣好、達到既定規格。」做法：判斷全部前移到本檔——決策已關閉（§4、§9，不重開），規格已定（I11 示意稿），每張卡只剩「照樣板抄、改指定檔、跑指定指令、看到指定輸出」。執行模型只需要聽話與誠實。

### 12.1 執行規則（每張卡）
1. **一卡一 commit，且同一 commit 更新 §0 進度板五行**（現在卡／已完成計數／最後 commit／阻塞／下一步；下一步行末必附 `建議模型：<…>`，規則 9）；卡外一行不改；卡內順序不換；前置指令不過 → 停，不猜。
2. **讀**：只讀卡上列的 `file:line` 與樣板；要改的檔整檔讀（AGENTS §5）。沒讀 = 不准改。
3. **寫**：照樣板抄結構與命名；新檔 docstring 一行「做什麼＋為什麼」；不寫心路。
4. **驗收**：卡上的指令是唯一完成判準；輸出不符 = 未完成；**禁止**改驗收指令、期望值或測試去配合（I10 同類）。
5. **突變**：有突變欄的卡必做「拔掉 → 指名測試變紅 → 還原變綠」，三行結果貼 WORKLOG。
6. **證據**：commit 後 WORKLOG 四行（REALTEST／REVIEW／BUGHUNT／下一步，格式 AGENTS §1）；REVIEW 由另一模型（Claude 寫→`/codex-review`；Codex 寫→`/claude-review`）；無額度 → `REVIEW_WAIVED` + 突變證據。
7. **卡住**（缺資訊／衝突／驗收跑不動）：§7 加一列（R#、卡號、指令、輸出）→ 停 → 問操作者**一題**。不繞路、不補丁。
8. **期末閘** = 每期最後一張卡：全期驗收指令重跑、§6 該期突變全做、§0／TASKS／WORKLOG 更新；過了才開下一期。下一期的卡由期末閘執行者依 12.5 產生，操作者看卡放行。
9. **模型分工**：執行卡 = Sonnet 5.5／Codex；產卡與期末閘審 = Fable 5.1 或 Opus 5.5（一期一次，不逐卡）；純資料卡（YAML／範例／課文）= Haiku 4.5 可。路由總表與「不匹配時回覆首行提醒切模型」= `agency-os/AGENTS.md` §5（操作者不記，agent 提醒）。
10. **UI 卡加驗**：任何動到 `web/` 或 `COS/docs/mockups/` 的卡，驗收多一條 `python COS/docs/mockups/check-mocks.py` 綠（新殼落地後同一檢查器指向 `web/app/globals.css` 與頁面）；設計規則只准以「檢查器規則＋五頁同改」落地，不准只改操作者正在看的那一頁。
11. **測試範圍（2026-09-29 操作者定案，唯一正本；其他處提到「全套」都以本條為準）**：**任何人都不在本機手動跑全套**（14k 項、25–55 分）。① 每卡／每次 push：`cd COS && python scripts/affected_tests.py --run`＋golden。② 部署前與期末閘：自「最近一次全部已知為綠的 SHA」起的受影響測試＋golden＋eval gate＋`deploy.sh` 其餘關卡；`deploy.sh` 自動做（`affected_tests.py --base <deploy/.green-sha>` 的清單交給 `COS/Dockerfile` `test` 目標裡的 `scripts/test-gate.sh`，成功部署後把 HEAD 寫回 `deploy/.green-sha`——受影響的全綠＋其餘未受影響＝整個 SHA 已知全綠）；第一次用新閘傳 `COS_GREEN_SHA=<sha>`（全套綠 63e96ffe6，2026-09-28 `Ran 14635 tests OK`；或之後依本閘部署成功的 SHA）。③ 全套只在兩種情況、只由 GitHub CI 自動跑（`.github/workflows/cognitive-os-full-suite.yml`，`test-gate.sh --all`），沒人等：(a) 執行環境變更（`requirements*.lock`、`pyproject.toml`、`Dockerfile` 含 base digest／Python 版本、`docker-compose.yml`、`.dockerignore`）——影響所有測試卻不在 import 關係裡；(b) 選擇器或測試閘本身變更（`scripts/affected_tests.py`、`scripts/test-gate.sh`）——它的輸出不能用自己驗。**不跑夜間**：夜跑唯一的理由是依賴未釘版本會自己漂移，已由 lock（`scripts/lock-deps.sh` 在 base image 內重產）＋base digest 消除，測試全離線。**選擇器盲點在選擇器裡關，不靠全套**：動態 `import_module`（dispatch 以方法 id 組模組名、gates 以 `ai_lego.compute.` ref）→ 改到該前綴下的檔，選出寫出其點分名或方法 id 的模組；自己 glob SPEC 的測試 → 任何 SPEC 改動都選；經核心 loader 讀 SPEC → 每次都跑的 golden 驗證全部 SPEC 檔。CI 全套紅了在下一張卡修，不回頭改已合併卡的驗收。
12. **驗收要審交付物本身，不審代理指標**（2026-09-25：PI-a 14 張卡全綠卻交出骨架，§12.3b）：UI 卡用示意稿檢查器審渲染後的 HTML；API 卡用探針打真端點，失敗路徑與成本記帳必測；只驗「元素存在／測試跑過」的測試不算驗收。卡片寫錯（例：WC-10 以為 `GET /methods/{id}/demo` 回表單輸入）時，執行者先查證再照做，查到不符就停下回報（規則 7）。
13. **卡片明文換契約時，同卡更新守舊契約的測試，不必再問**（回傳形狀、raise→回傳 error、同步→非同步等）：(a) 只改失敗原因正是被換掉契約的測試，其他行為測試不動；(b) 每條舊斷言保留對應新斷言，只換取值方式，不刪、不放寬比較；(c) 新契約也加斷言，例如 PENDING→worker→DONE，用量數字不變；(d) 把行為突變回舊契約→測試紅→還原綠，三行進 commit message；(e) commit message 和卡片「改」欄列出更新的測試，§7 對應列標「依 12.1-13 解決」。若必須刪／放寬斷言，或衝突非契約變更所致，仍停下回報。
14. **並行卡的交界由產卡者先寫成測試**（2026-09-26 第一波：T28–T31 各自全綠，接起來 1 嚴重＋4 重大，其中多數出自卡片：介面表只寫欄名（`uncited_sections` 語意只在 C4）、沒有卡負責「golden 過 schema＋閘」、一卡的 prompt 與另一卡的 resolver 矛盾；續1）：(a) 介面表每欄寫語意＋一個可機器驗的例子；(b) 會被別卡讀的產物，產卡者先寫跨卡契約檢查（例：`COS/eval/run.py` `artifact_contract_errors`），列進驗收；(c) 驗收以 exit code 判（`…; echo $?` → `0`），不以 `tail -1` 讀 stdout（雲端 stdout 不緩衝、Windows 管線緩衝，順序不同）；(d) 規格封閉者給雲端，跨卡語意或 Windows 環境相關者留本機。
15. **帶著已知風險不交接**（2026-09-28：T34 以行程內 in-flight 集合合併、風險只寫在 WORKLOG → WC-P2-06 照用 → 合併時重改）：合併者列出的「剩餘風險」若落在別卡會用到的元件或介面上，該元件不合併、不通知下游開工，先修或先把替代介面釘進 §12.2 P 表；只影響本卡內部的風險才可帶著合併並寫明。
16. **共用元件先進 P 表、並行／一致性元件先審設計**（同日：TTL lease 寫完才被 critic 抓到兩個 runner 同時持有 → 改 OS 鎖重做）：(a) 卡要用到任何跨卡共用的機制（鎖、計量、狀態、引註、prompt…），先查 §12.2；表上沒有 = 停，產卡者補一列再做，不各自挑現成的；(b) 涉及並行、鎖、重試、交易、跨行程狀態的設計，寫程式前先寫一段「不變量＋既有機制搜尋（`grep` 同類原語）＋失敗情境」交 critic 審設計，過了才寫碼。

### 12.2 卡片格式（缺一欄 = 無效卡，不得執行）
`WC-<期>-<序>`｜目標（一句）｜前置（指令＋預期）｜讀（`file:line`）｜樣板（照抄哪個 `file:line`）｜改（新／改檔案清單）｜不改｜交界（本卡產物欄位：語意＋一個可機器驗的例子；誰讀它；跨卡契約檢查指令，產卡者先寫好）｜驗收（`指令; echo $?` → `0`，逐條；不讀 `tail -1`）｜突變（拔什麼 → 哪個測試紅）｜commit 訊息骨架｜回滾。

### 12.3 PI-a 工作卡（解讀層＋新殼第一片；全本機，無 prod）
**共同前置**（每卡先跑）：在 repo root `python agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/run_golden_tests.py` 綠；`git log --oneline -5` 看過。unit 測試照 §12.1 規則 11（每卡只跑影響範圍，全套在期末閘）。路徑縮寫見檔頭；`web` = `COS/apps/cognitive-web`。

**WC-PIa-01 解讀 typed object schema**
- 目標：`MethodInterpretation`（C10）成為 spec root 的正式 typed object。
- 讀：§3.4 C10；`SPEC/specs/cognitive/typed-objects/iceberg-model-analysis.schema.yaml:1-60`（檔頭欄位慣例：`$schema／$id／title／version／status／description／source_of_truth_for／decided_by／compilation_decisions／type／additionalProperties／required`）；`SPEC/tests/contracts/specs/cognitive/typed-objects/ahp-analysis.fixtures.yaml`（fixtures 格式）。
- 樣板：上述兩檔。
- 改（新）：`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml`：`required: [interpretation_id, method_id, record_sha256, findings, visual, next_methods, provenance, model, usage]`；`interpretation_id` pattern `^INTERP-`；`findings` minItems 1，item `{id, title, text, citations(minItems 1), confidence{level: enum[high, mid, low], reason}}`；`revision_conditions[] {text, would_change}`；`data_thickness: object`；`recommendations[] {level, action, expected, citations[]}`；`gaps[] {text, needed_evidence}`；`visual {kind: enum [layered, quadrant, table, matrix, graph, tree, timeline, scorecard], bindings: object}`，`oneOf` 三種先寫死：layered → `bindings.levels[] {label, path}`；quadrant → `bindings {items, x, y, x_threshold, y_threshold}`；table → `bindings {rows, columns}`；其餘五種 PI-a 只列 enum、bindings 允許空物件（P3 補）；`next_methods: string[]`；`next_steps[] {method_id, answers, deepens, prefill: object(欄位 → manifest id), needs_input: string[], yields, est_cost}`（`method_id` ∈ `next_methods`）；`provenance` 用 iceberg schema 同一個 `$ref`；`model: string`；`usage {input_tokens, output_tokens}`；`additionalProperties: false`。
- 改（新）：`SPEC/tests/contracts/specs/cognitive/typed-objects/method-interpretation.fixtures.yaml`：1 valid + 3 invalid（findings 空；visual.kind 不在 enum；缺 record_sha256）。
- 不改：任何既有 schema。
- 驗收：golden runner 輸出含 `method-interpretation` 且 fail=0；`grep -c "oneOf" SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml` ≥ 1。
- 突變：把一個 invalid fixture 標成 valid → runner 紅。
- commit：`spec(cognitive-os): MethodInterpretation typed object + fixtures (C10)`。回滾：刪兩檔。

**WC-PIa-02 capability contract**
- 讀：`SPEC/capabilities/contracts/ai.draft_record.capability.yaml`（全檔 = 樣板）；`SPEC/specs/domain/capability-contract.schema.yaml:550`（required `[id, version, input, output]`；**沒有 `binding` 鍵**——§3.3 的「binding: context」是描述，寫進 description，不寫成鍵）。
- 改（新）：`SPEC/capabilities/contracts/interpret.method_record.capability.yaml`：id `interpret.method_record`；`input.type: [MethodInvokeKwargs]`；`output.type: [MethodInterpretation]`；preconditions：kwargs 通過該方法 builder＋gates；provider configured 否則 503；日預算未超；`quality {provenance_required: true, method_specific_gate_required: true}`；`security.external_ai: policy_controlled`；description 明寫「runtime = 專用端點 `POST /methods/{id}/interpret`（202）＋`GET /interpretations/{id}`；不是 recipe 節點；不註冊進 `recipe_runtime.build_registered_capability_adapters`」。
- 驗收：golden runner 2c 通過；`cd COS && python -c "from ai_lego import resolve_spec_root; from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog; print(CapabilityCatalog.from_spec_root(resolve_spec_root()).is_resolvable('interpret.method_record'))"` → `True`。
- 突變：`status: DRAFT` → `False`。commit：`spec(cognitive-os): interpret.method_record capability contract`。

**WC-PIa-03 視覺原語對照表（純資料）**
- 讀：`grep -h "^family:" SPEC/methods/contracts/*.yaml | sort | uniq -c`（現有 family 清單）。
- 改（新）：`SPEC/methods/registry/method-visual-kinds.yaml`：`default_by_family:`（systems→layered、decision→quadrant、causal→graph、foresight→timeline、stakeholders→matrix、architecture→tree、experiment→scorecard，其餘→table；每個現有 family 都要有一列）＋`overrides:`（`systems.iceberg_model: layered`、`decision.eisenhower_matrix: quadrant`、`decision.impact_effort: quadrant`）。規則：**kind 由表決定，bindings 由模型從 manifest 選，閘驗證**（D14）。
- 驗收：`python -c "import yaml;d=yaml.safe_load(open('SPEC/methods/registry/method-visual-kinds.yaml'));assert set(d)=={'default_by_family','overrides'};print(len(d['default_by_family']),len(d['overrides']))"` → `<family 數> 3`。
- commit：`spec(cognitive-os): method-visual-kinds registry (D14, 8 primitives)`。

**WC-PIa-04 解讀模組（純函式，無 FastAPI）**
- 讀：`COS/ai_lego/platform/ai_gateway/draft.py:33-39`（常數）、`:111-152`（`_SYSTEM`＋`build_prompt` 段落結構）、`:153-168`（`extract_json_object`：**import 重用，不複製**）、`:224-270`（兩次嘗試的修復回合 = 樣板）；`provider.py:31-41`（`AiCompletion`、`AiProvider.complete(system, user, *, max_tokens)`）；`main.py:740-746`（`_method_display_metadata()` 取 blurb／why）；`main.py/method_form.py:76-90`（`record_schema_name` 取 record schema）；`main.py:720-722`（系統參數清單）。
- 改（新）：`COS/ai_lego/modules/research/interpret_method_record.py`：
  - `manifest_from_record(record) -> list[{id, path, value}]`：DFS 走 record；排除頂層 `id／version／provenance／generated_by_method`；純量葉 `id="r/<path>"`（`/` 分隔、陣列索引為數字，例 `r/patterns/0`）；dict／陣列本身也出一項（value = JSON 字串截 400 字）。
  - `build_interpretation_prompt(contract, display, record_schema_text, manifest, sources, visual_kind, language, catalog_lines) -> str`：固定段落順序：方法（id、name_zh／en、blurb、why）→ 契約 purpose／inputs／outputs／preconditions／recommended_next → record schema（截 `MAX_SCHEMA_CHARS`）→ manifest 條列 `[r/...] 值` → Sources（PI-a 空清單，格式先留）→ 可用方法 `catalog_lines`（`id — name_zh`，只 ACTIVE）→ 輸出 JSON 骨架（照 WC-01 schema 逐鍵；`visual.kind` 預填 = `visual_kind`）→ 規則：citations 只能用 manifest id；`next_methods` 只能用清單 id；不自創數字；語言 = `language`。
  - `prefill_map(target_contract, target_record_schema, manifest) -> {field: manifest_id}`：確定性——目標方法 record schema 的每個輸入欄位，依欄位名／型別對 manifest 路徑做同名或同義（display-metadata 的 `name_zh` 詞）匹配，匹配不到的進 `needs_input`；純函式，可單測。
  - `run_interpretation_gates(interp, manifest_ids, catalog_ids) -> list[gate_result]`：`citation_integrity`（每 finding ≥1 且全部 ⊆ manifest_ids）、`visual_bindings_resolvable`（bindings 所有路徑值 ⊆ manifest_ids）、`next_methods_resolvable`（⊆ catalog_ids，可空；`next_steps[].method_id` ∈ next_methods 且 `prefill` 值 ⊆ manifest_ids）、`findings_nonempty`；gate_result 形狀照 `dispatch.run_gate_runner` 回傳（`{gate_id, status, evidence}`，鍵名以 `tests/unit/test_api_main.py` 既有斷言為準）。
  - `interpret_method_record(provider, *, method_id, record, contract, display, record_schema_text, visual_kind, catalog_ids, catalog_lines, language, max_attempts=2) -> InterpretResult`：`provider.complete(_SYSTEM_INTERPRET, prompt, max_tokens=INTERPRET_MAX_TOKENS=6000)` → `extract_json_object` → 補 `interpretation_id=f"INTERP-{secrets.token_hex(8).upper()}"`、`record_sha256`、`provenance=make_provenance("AI_INFERENCE","AI_GENERATED")`、`model`、`usage` → `jsonschema.Draft202012Validator`（WC-01 schema）→ gates；任一 FAIL 且有剩餘嘗試 → 把 FAIL 明細當 `error` 餵回下一輪；最後仍 FAIL → 回傳含 `gate_results` 的結果（**不 raise**，端點決定 422）。
- 不改：`draft.py`、`provider.py`、任何 builder／gate。
- 驗收：`python -m unittest tests.unit.test_interpret_method_record -v` 全綠（WC-05）。
- commit：`feat(cognitive-os): interpret.method_record — manifest leaf paths, prompt from contract+display, 4 gates, repair round (C10, D14)`。

**WC-PIa-05 模組測試**
- 樣板：`tests/unit/test_ai_gateway.py:40-50`（FakeProvider：`complete()` 回 `AiCompletion(text, model, input_tokens=100, output_tokens=50)`，可預排多個回覆）。
- 改（新）：`tests/unit/test_interpret_method_record.py`，最少 8 案：manifest 排除四個系統鍵；巢狀路徑 `r/patterns/0` 存在；引註越界 → `citation_integrity` FAIL；bindings 越界 → FAIL；`next_methods` 假 id → FAIL；findings 空 → FAIL；第一回壞 JSON、第二回好 → PASS 且 `attempts == 2`；schema 驗證失敗進修復回合。record 用真的：`SPEC/methods/registry/method-form-examples.yaml` 的 `systems.iceberg_model` 範例經 `dispatch.invoke_builder` 建出。
- 突變：註解掉 `citation_integrity` 檢查 → 對應測試紅（貼測試名）。

**WC-PIa-06 端點＋事件＋儲存**
- 讀：`main.py:758-788`（invoke 四步）、`:862-905`（`_ai_budget_lock_for`、`_require_ai`：503／403／429 順序）、`:949-971`（draft 端點 `record_ai_usage`，失敗也記）、`:296-300`（`get_artifact_store`）、`:334-340`（`require_session`）；`COS/ai_lego/data/object/json_artifact_store.py:38-71`（`put(tenant_id, artifact_type, value)`／`read(tenant_id, reference)`）；`repo:167-189`（`_append_event` 私有）、`:312`（`list_events`）。
- 改：`repo` 加公開 `append_event(tenant_id, aggregate_id, event_type, payload)`（開連線＋呼叫 `_append_event`，同交易）。`main.py`（放 `:788` 之後）：
  - `POST /methods/{method_id}/interpret`：同 invoke 前四步（404／403／501／400）→ `run_gate_runner` 任一 status 不在 `{PASS, NOT_APPLICABLE}` → **422** `INTERPRET_BLOCKED_BY_GATES`（不呼叫 provider、不記 usage）→ `_require_ai`（503／403／429）→ `interpretation_id` → `repo.append_event(…, "InterpretationRequested", {method_id, record_sha256})` → `threading.Thread(daemon=True)`：在 `_ai_budget_lock_for(tenant)` 內呼叫 WC-04；成功 → `artifact_store.put(tenant, "method_interpretation", {record, interpretation, gate_results})` → `append_event("InterpretationCreated", {cas_reference, gate_results})`；失敗 → `append_event("InterpretationFailed", {error})`；兩路都 `record_ai_usage(purpose=f"interpret:{method_id}")` → 回 **202** `{interpretation_id, status: "PENDING"}`。thread 主體抽成 `_run_interpretation(...)` 讓測試同步呼叫。
  - `GET /interpretations/{interpretation_id}`：`list_events` 空 → 404；最後事件 Requested → `{status:"PENDING"}`；Failed → `{status:"FAILED", error}`；Created → `{status:"DONE", record, interpretation, gate_results}`（`artifact_store.read`）。
  - `record_sha256 = sha256(json.dumps(record, sort_keys=True, ensure_ascii=False).encode())`。
  - `POST /interpretations/{interpretation_id}/judgment`：body `{stance, text}`（stance ∈ agree|partial|disagree；text 可空）→ `repo.append_event(…, "UserJudgmentRecorded", {stance, text, identity_id})` → 200；GET 的 DONE 回應加 `judgment`（最後一筆事件或 null）。`data_thickness` 在 `_run_interpretation` 由 manifest 算（每單位：own_statements = record 該欄位句數，external_sources = 0 直到 P1）。
  - `deploy/deploy.sh:105` 的 import 清單加 `ai_lego.modules.research.interpret_method_record`。
- 不改：`/invoke`；recipe 引擎；`draft.py`。
- 驗收：`python -m unittest tests.unit.test_api_interpret -v` 全綠（WC-07）；`bash deploy/deploy.sh` typecheck 段能 import 新模組（Windows 無法跑整支 → `python -c "import ai_lego.modules.research.interpret_method_record"` 代替，WORKLOG 註明）。
- 突變：拔掉 422 前的閘門檢查 → `test_gate_fail_returns_422_without_provider_call` 紅。
- commit：`feat(cognitive-os): POST /methods/{id}/interpret (202) + GET /interpretations/{id}; events + CAS; ai_usage (C10)`。

**WC-PIa-07 端點測試**
- 樣板：`tests/unit/test_api_main.py:33-60`（`ApiTestCase.setUp`：`TestClient(api_main.app, base_url="https://testserver")`、`app.dependency_overrides[get_ai_provider]`）。
- 改（新）：`tests/unit/test_api_interpret.py`，最少 7 案：未登入 401；閘門 FAIL 的 kwargs → 422 且 FakeProvider 呼叫 0 次且 `ai_usage_totals` 不變；provider None → 503；成功 → 202 → 呼叫 `_run_interpretation` 同步 → GET 回 DONE；DONE 的 interpretation 過 WC-01 schema；`ai_usage` 有 `interpret:systems.iceberg_model` 列；`decision.eisenhower_matrix` → `visual.kind == "quadrant"`；未知 method → 404。
- 驗收：全綠；把 DONE 回應存成 `web/fixtures/iceberg-interpretation.json`（WC-11 用）。

**WC-PIa-08 dashboard `API_PREFIX`（PI-b 前置，PI-a 落碼）**
- 讀：`dashboard.html:299-305`。
- 改：`<head>` 加 `<meta name="api-prefix" content="">`；`api()` 開頭 `const API_PREFIX = (document.querySelector('meta[name="api-prefix"]') || {}).content || '';`，`fetch(API_PREFIX + path, …)`。content 空 = 行為不變；PI-b 改 `/api`（WC-PIb-02）。
- 驗收：`grep -c "API_PREFIX" ai_lego/apps/api/dashboard.html` ≥ 2；本機 `uvicorn ai_lego.apps.api.main:app --port 8420` 舊頁登入＋執行冰山一次成功（截圖路徑進 WORKLOG）。

**WC-PIa-09 `cognitive-web` 骨架**
- 樣板：`NA/package.json`（只抄 next ^15.2.4、react ^19、typescript ^5.7、vitest ^2.1.9、`@types/*`、scripts `dev/build/test/typecheck`）、`NA/tsconfig.json`、`NA/vitest.config.ts`、`NA/next.config.ts:5-10`（`output: "standalone"`＋`outputFileTracingRoot`；**不抄** sentry／webpack alias）。
- 改（新）：`web/package.json`、`web/next.config.ts`（＋`rewrites: [{source:'/api/:path*', destination:(process.env.COS_API_ORIGIN ?? 'http://127.0.0.1:8420')+'/:path*'}]`，只為本機 dev；prod 由 nginx 分流）、`web/lib/api.ts`（`apiFetch(path, init)`：`credentials:'same-origin'`，base = `process.env.NEXT_PUBLIC_API_PREFIX ?? '/api'`，非 2xx 丟 `{status, detail}`）、`web/lib/strings.ts`（zh 字串集中；en 欄留空）、`web/app/layout.tsx`、`web/app/login/page.tsx`（tenant_id／email／password → `POST /auth/login`）、`web/app/methods/page.tsx`（`GET /methods`；搜尋框；卡片按鈕；「不知道用哪個？描述你的問題」入口 —— PI-a 先連到一段說明，P3 接 U16 路由）、`web/app/methods/[id]/page.tsx`（`GET /methods/{id}/form` → `MethodForm` → `POST /methods/{id}/interpret` → 每 2s 輪詢 `GET /interpretations/{id}` → `ResultPage`）、`web/middleware.ts`（無 cookie `cognitive_os_session` → `/login`；cookie 名 = `main.py` `SESSION_COOKIE`）。
- 不改：COS Python。
- 驗收：`cd web && npm run typecheck` 0 錯；`npm test` 綠；`npm run build` 成功；`grep -rn "<select" app components lib` = 0（U11）。
- commit：`feat(cognitive-web): Next.js 15 shell — login, method list, method page, api client (D13)`。

**WC-PIa-10 表單渲染移植**
- 讀：`dashboard.html:901-1255`（variant／rows／fixedRows／upstream／json／pills／conditions 渲染＋`collectPayload`，整段）；`method_form.py:285-377`（每個 `kind`：recursive／json／const／choice／bool／list／variant…）。
- 改（新）：`web/lib/form-model.ts`（純函式：`fields → state → payload`）、`web/lib/form-model.test.ts`、`web/components/MethodForm.tsx`（choice = 按鈕群，預設多選，U11）；**`web/components/LazyFill.tsx`**：移植 `dashboard.html:197-199` 面板與 `:859-864` 邏輯——貼上 → 逐行「欄位: 值」免費比對填欄 → 比對不完整才 `POST /ai/draft/method/{id}`，回覆標 AI_SUGGESTED 讓人確認；**「用示範案例試一次」** = `GET /methods/{id}/demo`（`main.py:834`）填入。測試資料：`COS/tests/fixtures/method_form_samples.yaml`（每個 kind ≥1）；期望 payload 對照法 = 本機用 dashboard 送一次同一輸入，把 request body 存成 `web/fixtures/payload-<method>.json`。
- 驗收：vitest 綠；本機對 `systems.iceberg_model`、`decision.eisenhower_matrix`、一個含 `variant` 的方法（找法 `grep -l "oneOf" SPEC/specs/cognitive/typed-objects/*.yaml | head -1` 對應的 method）三個表單送出 `/invoke` 皆 200。
- commit：`feat(cognitive-web): method form renderer ported from dashboard.html (all field kinds, no <select>)`。

**WC-PIa-11 結果頁（I11 九段，PI-a 範圍）**
- 讀：`COS/docs/mockups/iceberg-result-mock.html`（整檔 = 規格）；I11 期別對照。
- 改（新）：`web/components/result/ResultPage.tsx` 固定九段順序，每段一檔、每段根元素 `data-section="0".."7"`（5b 用 `"5b"`）；**每段第一個子元素 = `<HowTo read=… act=… />`（怎麼讀／你要做的），文字來自 display-metadata＋結果骨架資料（`result-skeletons`），不寫死在元件**：`Intro`（方法一句話＋「怎麼用？」按鈕 → `/methods/{id}/lesson` 佔位頁＋狀態列（AI 草稿／資料筆數／`data_thickness` 最薄單位／usage／閱讀時間）＋能回答／不能回答＋怎麼讀三步＋四個詞）→ `Conclusion`（一句話＋findings 三張各帶 `confidence`＋建議＋gaps＋`revision_conditions`＋**`Judgment` 元件**：三個 stance 按鈕＋文字 → `POST …/judgment`；每個 `[n]` 可點捲到引註）→ `StructureFigure`（依 `visual.kind`：`layered.tsx` SVG 冰山，層數 = `bindings.levels` 長度，左＝問題＋你填的、右＝介入方式，文字來自 display-metadata＋契約，沒有就留白**不硬湊**；`quadrant.tsx` 移植 `dashboard.html:1320-1345` 的資料表改讀 bindings；`table.tsx`）→ `ChartsSection`（PI-a 只渲染 `visual.kind` 一張＋一行「趨勢／迴路／槓桿圖接上資料後出現（P3）」）→ `LayerCards`（每 finding 一張，同骨架四行）→ `Summary` → `LevelsTable`（layered 才顯示）→ `SolutionPlaceholder`（一行「解決方案 P4」）→ `NextSteps`（旅程列＋每個 `next_steps[]` 一張卡：回答什麼／帶入 N 欄＋還要填 M 欄（標紅，來自 `prefill`／`needs_input`）／會得到／約多久多少錢／「用這次的資料開始」／「第一次用？5 分鐘課」；底部四動作：串成工作流（`POST /workflows/custom` 草稿，節點 = 建議序）、不確定 → 路由入口（P3 接）、去 ⑦、核准；**「用這次的資料開始」= 同專案新一步：表單以 `prefill` 直接填、`needs_input` 標紅，AI 起草只用在 `needs_input` 欄（`POST /ai/draft/method/{next_id}`），使用者確認才執行**）→ `Citations`（`[n]` → manifest 路徑＋值；外部來源 0 筆時顯示誠實提示）→ `ProvenanceBar`（AI 推論未核准／model／usage／gate 結果各帶 tooltip／`judgment` 狀態／核准、退回、刪除的人話說明／`<details>` 專家模式 JSON）。
- 驗收：vitest：渲染 `web/fixtures/iceberg-interpretation.json` → 九個 `data-section` 全在、每段第一個子元素是 `HowTo`、每個 finding ≥1 `[n]` 且有 `confidence`、`Judgment` 送出後呼叫 `POST …/judgment`、無 `<select>`；eisenhower fixture → `data-visual="quadrant"`。
- commit：`feat(cognitive-web): result page — fixed nine-section skeleton, layered/quadrant/table primitives (I11, §3.10)`。

**WC-PIa-12 Playwright**
- 樣板：`lobster-factory/infra/hetzner-phase1-core/tests/playwright.config.ts:40-58`（project 區塊）；`scripts/playwright-runner.ps1:161-200`（`Invoke-PlaywrightProject`）。
- 改：config 加 project `cognitive`（`testMatch: '**/cognitive/**/*.spec.ts'`，`baseURL: process.env.PLAYWRIGHT_COS_URL || 'http://127.0.0.1:8421'`）；新 `tests/e2e/cognitive/iceberg.spec.ts`（登入 → 搜「冰山」→ 填四段（用課程頁的合成案例）→ 執行 → 等 DONE → 九段可見、findings ≥1 `[n]`）；`playwright-runner.ps1` 加 mode `cognitive`；env `COS_TEST_TENANT_ID／COS_TEST_EMAIL／COS_TEST_PASSWORD` 從 `mcp/user-env.ps1` 讀（缺 → skip 並印原因）。
- 驗收：本機 api＋web 起著，`scripts/playwright-runner.ps1 -Mode cognitive` → 1 passed。

**WC-PIa-13 Dockerfile＋compose＋deploy.sh 多服務**
- 樣板：`NA/Dockerfile:1-60`（三階段 standalone；**不抄** ghostscript／sharp／ssh2／@anthropic-ai 行）；`COS/docker-compose.yml`（服務區塊）；`deploy.sh:117-121`（rollback tag）、`:130-160`（health 迴圈）、`:180-186`（smoke）。
- 改：`web/Dockerfile`；compose 加 `cognitive-os-web`（`build.context: ./apps/cognitive-web`；`image: cognitive-os-web:latest`；`ports: "127.0.0.1:8421:3000"`；`environment: NEXT_PUBLIC_API_PREFIX=/api`；`networks: lobster-net`；healthcheck `wget -qO- http://127.0.0.1:3000/login`；`depends_on: cognitive-os-api`）；`deploy.sh`：`SERVICES=(cognitive-os-api cognitive-os-web)`，rollback tag／health 迴圈／rollback **迴圈化**（不複製兩份）；本機 smoke 加 `curl -sf http://127.0.0.1:8421/login | grep -qi cognitive`；公網 smoke 改 `https://cognitive.aware-wave.com/api/health`（PI-b 前 SKIPPED 不算失敗）。
- 驗收：本機 `docker compose -f Projects/internal/cognitive-engineering-os/docker-compose.yml up -d --build` → `docker inspect --format '{{.State.Health.Status}}' cognitive-os-web` = `healthy`；`deploy.sh` 需 Linux：Windows 上 `REALTEST_WAIVED: NA -- deploy.sh 於 PI-b 主機驗`。
- 回滾：compose 刪 web 服務；deploy.sh 陣列退回單服務。
- commit：`build(cognitive-os): web Dockerfile + compose service + deploy.sh multi-service loop`。

**WC-PIa-14 期末閘**：COS 全套 `python -m unittest discover -s tests -t . -q` 綠一次（§12.1 規則 11）；WC-01…13 驗收指令全部重跑一遍貼輸出；§6 PI-a 四個突變；`/codex-review` PY 與 TS 各一份 `agency-os/reports/oracle/` artifact；WORKLOG 四行；§0 改「PI-a 完（commit 清單）」；`agency-os/TASKS.md` 研究線一列；確認 12.4 前置後才開 PI-b。

### 12.3b PI-a 驗收退回（2026-09-25 Claude 覆審；修正卡照 12.2 格式）
覆審方法：讀 `e28b630ba` 全部程式對照 §12.3；重跑 golden（4158 PASS）、兩個解讀測試模組（16 OK）、web vitest（3）／tsc（0 錯）；再用探針打真 API。發現（行號＝`e28b630ba`）：
- **C1 失敗的解讀不記用量**：`main.py:1168` 只在成功路徑 `record_ai_usage`；`interpret_method_record.py:170-173` 兩次都失敗就 raise，已花的 token 被丟掉。探針：壞 JSON 兩次 → 422、provider 呼叫 2 次、`ai_usage` 0 筆 → 日預算可無限繞過；事件只剩 `InterpretationRequested`，沒有結束事件。
- **C2 請求裡同步呼叫模型**：`main.py:1096-1170` 在請求內跑最多 2 次 `provider.complete`（每次逾時 60s，`provider.py:25`），回 202 但 body `status: DONE`；正式站 `hetzner-phase1-core/nginx/default.conf:431` `proxy_read_timeout 60s` → 504 且 token 照扣（§7 R1／R19）。WC-06 原規格＝背景 thread＋`_ai_budget_lock_for`（`main.py:868`）＋ GET 回 PENDING／FAILED／DONE，未照做；沒有預算鎖 → 同租戶並發可超過日預算。
- **M1 閘門 `NOT_APPLICABLE` 被當失敗**：interpret 端點 `gate.get("status") != "PASS"` → 422；`grep -rl '"NOT_APPLICABLE"' ai_lego/modules` = 250 個模組會回這個狀態，它們的合法 record 永遠解讀不了（recipe 路徑 `main.py:668` 已把它當通過）。
- **M2 視覺綁定閘可繞過**：`interpret_method_record.py:116` 只檢查以 `record`／`source:` 開頭的字串；`{"path":"patterns.99"}` → PASS（探針）。
- **M3 prompt 未照 WC-04**：沒有語言（中文產品，模型可以回英文）、沒有可用工具清單（`catalog_lines`）、`max_tokens=1800`（卡寫 6000，`:157`）、自己寫 JSON 解析（卡：重用 `draft.py:153` `extract_json_object`）、manifest id 用 `record.a.b` 且沒排除 id／version／provenance／generated_by_method（卡：`r/a/b`＋排除）、沒有 `prefill_map`、`data_thickness` 交給模型自己填。
- **M4 判斷用詞與示意稿不同**：judgment 收 accept／revise／reject＋`note`（卡：agree／partial／disagree＋`text`；示意稿 `COS/docs/mockups/iceberg-result-mock.html:282` 同意／部分同意／不同意）；web 按鈕直接顯示英文；`.catch(() => undefined)` 吞錯（AGENTS §6 禁止）；GET 的 DONE 沒帶 judgment。
- **M5 web 三張卡是骨架**：WC-10 `web/components/MethodForm.tsx` 把 list／rows／fixed_rows／json／map／recursive／upstream 全變成 JSON 文字框，group 的 conditions 沒做，variant 不切換子欄位；`LazyFill.tsx` 送出 AI 起草卻丟掉回覆；「用示範案例試一次」把 `GET /methods/{id}/demo` 的回應（CLI 的 stdout，`main.py:834-851`——**卡片本身寫錯**）塞進表單。WC-11 `ResultPage.tsx`（28 行）沒有 5b、HowTo 文字寫死、沒有狀態列／能回答不能回答／四個詞、引註沒解析成路徑＋值、下一步不是卡、沒有專家模式 JSON、layered 是 `<ol>` 不是冰山圖。WC-09 方法頁 h1 是原始 id、要人手貼 Project UUID（殼裡沒有建專案的地方，`POST /projects` 在 `main.py:1233` 卻沒用），沒有「描述你的問題」入口。vitest 只驗 `data-section` 存在。
- m1 Next 15.2.4 安裝時報上游安全公告（Codex 的 WORKLOG 自述）；PI-b 前升到已修版本。
- m2 WC-12／13 驗收未達（E2E skip、compose 沒到 healthy），屬環境問題；PI-b 前在本機補跑。

**WC-PIa-15 解讀改非同步＋失敗也記用量**（修 C1、C2）
- 目標：模型不在請求裡跑；每一次模型呼叫都記進 `ai_usage`。
- 前置：§12.3 共同前置。
- 讀：`main.py:1096-1170`；`main.py:868`（預算鎖）；`main.py:950-972`（draft 端點失敗也記用量＝樣板）；`interpret_method_record.py:149-174`。
- 樣板：`main.py:950-972`。
- 改：`run_interpretation` 不再 raise，改回傳 `{interpretation 或 None, gate_results, error 或 None, input_tokens, output_tokens}`（token 是所有嘗試的累計）；端點：builder＋閘門的 422 不變 → `_require_ai` → `InterpretationRequested` → 回 **202 `{interpretation_id, status:"PENDING"}`**；主體抽成 `_run_interpretation(...)`，由 `threading.Thread(daemon=True)` 在 `_ai_budget_lock_for(tenant)` 裡跑：成功 → artifact＋`InterpretationCreated`；失敗 → `InterpretationFailed {error}`；**兩條路都 `record_ai_usage`**。GET 依最後一筆事件回 PENDING／FAILED（含 error）／DONE。web 方法頁每 2 秒輪詢，直到 DONE 或 FAILED。依 R22／R23 更新 `test_interpret_method_record.py` 的 `test_bad_json_then_repair_passes`、`test_schema_failure_after_repair_is_refused`，及 `test_api_interpret.py` 的 `test_interpret_get_judge_and_audit`、`test_eisenhower_uses_quadrant_visual_kind` 至新契約；其他舊測試不動。
- 不改：builder、method gates、`draft.py`。
- 驗收：新增 `test_failed_interpretation_records_usage`（壞 JSON 兩次 → GET 回 FAILED；`ai_usage_totals` = 兩次 token 的總和）、`test_interpret_is_pending_until_run`（POST 的 body.status == PENDING；同步呼叫 `_run_interpretation` 後 GET == DONE）；兩個解讀測試模組全綠。
- 突變：刪掉失敗路徑的 `record_ai_usage` → `test_failed_interpretation_records_usage` 紅。
- commit：`fix(cognitive-os): interpretation runs in the background; usage recorded on failure too (PI-a C1/C2)`。回滾：revert 該 commit。

**WC-PIa-16 閘門語意**（修 M1、M2，以及 M3 的 manifest 部分）
- 目標：合法 record 不被誤擋；視覺綁定不能被繞過。
- 前置：WC-PIa-15 已合併。
- 讀：`main.py:668`；`interpret_method_record.py:24-57`、`:109-142`。
- 樣板：`main.py:668`。
- 改：method gates 的狀態不在 `{"PASS","NOT_APPLICABLE"}` 才 422；manifest id 改成 `r/<path>`（`/` 分隔，陣列索引用數字），並排除頂層 id／version／provenance／generated_by_method；visual 綁定裡**每個**字串葉值都必須在 manifest ids 裡（不再看前綴）。`web/fixtures/iceberg-interpretation.json` 跟著改成 `r/` id。依 12.1-13 更新 `test_interpret_method_record.py` 的 `test_nested_leaf_path_exists`、`test_manifest_contains_record_and_project_sources`、`test_citation_out_of_manifest_fails`、`test_visual_binding_out_of_record_fails`、`test_next_method_out_of_catalog_fails`、`test_bad_json_then_repair_passes`、`test_schema_failure_after_repair_is_refused`，以及 `test_api_interpret.py` 的 FakeInterpretProvider 路徑測試資料；舊斷言保留。
- 不改：method gate 模組本身。
- 驗收：新增 `test_not_applicable_gate_is_accepted`（patch 成 NOT_APPLICABLE → 202）、`test_bare_binding_path_fails`、`test_manifest_excludes_system_keys`；兩個解讀測試模組全綠。
- 突變：visual 閘改回看前綴 → `test_bare_binding_path_fails` 紅。
- commit：`fix(cognitive-os): interpretation gates accept NOT_APPLICABLE, every binding must resolve, manifest ids r/<path> (PI-a M1/M2)`。回滾：revert。

**WC-PIa-17 prompt 照 WC-04**（修 M3 其餘）
- 目標：模型用中文回答、只推薦存在的工具，輸出空間夠。
- 前置：WC-PIa-16 已合併。
- 讀：§12.3 WC-PIa-04 全文；`draft.py:111-168`。
- 樣板：`draft.py:111-152`（prompt 段落結構）。
- 改：語言參數（預設 zh-TW，寫進 prompt 規則）；`catalog_lines`（ACTIVE 的 `id — name_zh`）；`INTERPRET_MAX_TOKENS=6000`；刪掉 `parse_interpretation`，改 import `draft.extract_json_object`；新增純函式 `prefill_map(target_record_schema, manifest) -> (prefill, needs_input)`；`data_thickness` 改由伺服器依 manifest 計算。
- 不改：`draft.py`。
- 驗收：FakeProvider 收到的 prompt 含「zh-TW」和 `systems.iceberg_model — 冰山模型` 這一行，且 `max_tokens == 6000`；`prefill_map` 兩個案例（同名欄位帶入、缺的欄位進 needs_input）。
- 突變：拿掉語言規則 → 對應測試紅。
- commit：`fix(cognitive-os): interpretation prompt per WC-04 (language, catalog, 6000 tokens, shared JSON extractor, prefill_map) (PI-a M3)`。回滾：revert。

**WC-PIa-18 判斷用詞**（修 M4）
- 目標：判斷的用詞與示意稿一致，送出失敗看得到。
- 前置：WC-PIa-15 已合併。
- 讀：`main.py:1189-1206`；`COS/docs/mockups/iceberg-result-mock.html:282`；`web/components/result/ResultPage.tsx`。
- 樣板：示意稿 `:282` 的三顆按鈕。
- 改：stance 只收 agree／partial／disagree，body 為 `{stance, text}`；GET 的 DONE 帶最後一筆 judgment；web 按鈕文字改成 同意／部分同意／不同意；送出失敗要在畫面上顯示錯誤，不可吞掉。依 12.1-13 更新 `test_api_interpret.py::test_interpret_get_judge_and_audit` 的舊 accept／note 測試值至 agree／text，保留 200、事件、用量斷言，另斷言 GET judgment 與 accept→400。
- 不改：事件表結構。
- 驗收：agree → 200、accept → 400；vitest：三顆按鈕文字正確，API 失敗時畫面出現錯誤訊息。
- 突變：恢復 `.catch(() => undefined)` → vitest 紅。
- commit：`fix(cognitive-os): judgment vocabulary matches the result mock; errors surface (PI-a M4)`。回滾：revert。

**WC-PIa-19 表單真的移植**（修 M5 的表單部分）
- 目標：每種欄位都有真正的輸入介面，不是 JSON 文字框。
- 前置：WC-PIa-15 已合併。
- 讀：`dashboard.html:901-1255`（整段）；`method_form.py:271-420`（每個 kind 的節點形狀）。
- 樣板：`dashboard.html:901-1255`。
- 改：`MethodForm` 每個 kind 一個元件：list（逐行增刪）、rows／fixed_rows（表格列）、group＋conditions（依條件顯示或隱藏欄位）、variant（切換後顯示該分支的欄位）、recursive；json 只留給 schema 真的沒有結構的欄位。LazyFill 用 AI 起草的回覆填欄，標成 AI_SUGGESTED，使用者確認才算；示範案例改用 `GET /methods/{id}/form` 回應裡的 `example`。
- 不改：API。
- 驗收：WC-PIa-10 原驗收（三個方法 `/invoke` 皆 200，`web/fixtures/payload-<method>.json` 與 dashboard 送出的 body 相同）；`grep -c "JSON.stringify(value" web/components/MethodForm.tsx` ≤ 1。
- 突變：variant 不切換分支 → payload fixture 比對紅。
- commit：`fix(cognitive-web): method form ported per kind from dashboard.html (PI-a M5)`。回滾：revert。

**WC-PIa-20 結果頁照示意稿，並讓示意稿檢查器審 web 輸出**（修 M5 的結果頁；結構修法）
- 目標：結果頁內容對齊示意稿，而且由同一個檢查器把關。
- 前置：WC-PIa-16、18 已合併。
- 讀：`COS/docs/mockups/iceberg-result-mock.html`（整檔＝規格）；`COS/docs/mockups/check-mocks.py` 的 `check_common`、`check_result`。
- 樣板：同上。
- 改：`ResultPage` 九段（含 5b）照示意稿；HowTo 文字來自 display-metadata／結果骨架資料；引註 `[n]` 解析成 manifest 路徑＋值；NextSteps 卡（prefill 帶入 N 欄、needs_input 標紅）；ProvenanceBar 含閘門結果與 `<details>` 專家 JSON；layered 用示意稿的冰山 SVG 結構。**新增** `check-mocks.py --page result <html>`：對任意 HTML 跑 result 規則；vitest 把 fixture 渲染成 HTML 存檔後呼叫它。
- 不改：示意稿本身。
- 驗收：`python COS/docs/mockups/check-mocks.py --page result web/.artifacts/iceberg-result.html` 綠；eisenhower fixture → `data-visual="quadrant"`。
- 突變：拿掉 5b 段 → 檢查器紅。
- commit：`fix(cognitive-web): result page per the result mock, checked by check-mocks (PI-a M5)`。回滾：revert。

**WC-PIa-21 第一次用不用貼 UUID**（修 M5 的方法頁與 m1）
- 目標：第一次登入的人能直接開始用一個工具。
- 前置：WC-PIa-19 已合併。
- 讀：`main.py:1233-1290`（projects）；`web/app/methods/[id]/page.tsx`；`web/app/methods/page.tsx`。
- 樣板：`COS/docs/mockups/home-mock.html` 的「說你卡在哪」卡片。
- 改：方法頁 h1 用工具中文名；沒有專案時自動 `POST /projects`（名稱＝工具名＋日期），有專案就列出來用按鈕選（不用 `<select>`）；方法清單頁加「不知道用哪個？描述你的問題」入口；Next 升到沒有安全公告的版本（m1）。
- 不改：API。
- 驗收：vitest：沒有專案時只呼叫一次 `POST /projects`，畫面不出現「Project ID」；`npm audit --omit=dev` 沒有 high。
- 突變：拿掉自動建專案 → vitest 紅。
- commit：`fix(cognitive-web): first use needs no project id; Next patched (PI-a M5/m1)`。回滾：revert。

**WC-PIa-14R 期末閘重跑**：15～21 全過後，WC-PIa-14 全部重做，包括全套 unittest，以及 `/claude-review` 真的產出 oracle artifact（不得再 waive）；做完 §0 才可以寫「PI-a 完成」。
- 14R 中發現並修的「改」：`web/Dockerfile` 的 standalone runner 綁 `0.0.0.0`，使容器內 loopback healthcheck 可達；依 12.1-13 更新 `tests/e2e/cognitive/iceberg.spec.ts::login -> iceberg -> result page sections including 5b`（WC-PIa-21 中文標題／自動專案與 WC-PIa-20 的 5b 十區塊），加 `COS_TEST_MOCK_API=1` 本機 UI 契約驗證模式；`scripts/playwright-runner.ps1` 取消過時的 `COS_TEST_PROJECT_ID` 必填，cognitive URL 用 `PLAYWRIGHT_COS_URL`／本機 8421，不再錯指 ops 的 `BaseUrl`。保留原登入、方法搜尋、示範案例、執行及引註數量斷言。突變把方法頁 h1 改回原始 id → mock-API Playwright 紅 → 還原後綠；Dockerfile 修前 web `starting`／loopback refused，修後 `healthy`。mock 模式不取代真模型 `1 passed`，不得以 skip 代替；§0 記當前未過項。

### 12.4 PI-b 工作卡（prod；每張 **High-STOP**，逐張 go-ahead）
**WC-PIb-01 nginx 分流**：`ssh -p 58122 ks-aw-01`（AGENTS §0）→ 只走 `/root/lobster-phase1/scripts/safe-infra-patch.sh nginx`；把 `hetzner-phase1-core/nginx/default.conf:427-450` 區塊的 `location /` 改三段：`location /api/ { … proxy_pass http://cognitive-os-api:8420/; }`（尾斜線 = 去前綴）、`location /expert/ { … proxy_pass http://cognitive-os-api:8420/; }`、`location / { … proxy_pass http://cognitive-os-web:3000; }`；`limit_req`、五個 `proxy_set_header`、`$is_trusted_source`、timeout 逐段照抄不動。repo 內 `default.conf` 同 commit 改（對照用）。驗收：`curl -s https://cognitive.aware-wave.com/api/health` 含 `"status":"ok"`；`curl -s https://cognitive.aware-wave.com/expert/ | grep -c api-prefix` = 1；`curl -sI https://cognitive.aware-wave.com/` 200 且是 web。回滾：safe-infra-patch 自動還原。
**WC-PIb-02 dashboard meta 改 `/api`**：WC-PIa-08 的 `content=""` → `content="/api"`；commit；隨 WC-PIb-03 上線。
**WC-PIb-03 主機部署**：`cd /opt/cognitive-os && git pull --ff-only && bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh`（兩服務全綠）；`docker exec cognitive-os-web printenv NEXT_PUBLIC_API_PREFIX` = `/api`；用真模型跑一次冰山合成案例（課程頁案例）到結果頁；`docker exec cognitive-os-api python -c "import sqlite3,os;c=sqlite3.connect(os.environ['COGNITIVE_OS_DB_PATH']);print(c.execute('select purpose,model,input_tokens,output_tokens from ai_usage order by rowid desc limit 1').fetchone())"` purpose 以 `interpret:` 開頭。回滾：`docker tag cognitive-os-web:rollback cognitive-os-web:latest && docker compose up -d`；api 同法。
**WC-PIb-04 P0 next-admin 同窗部署**（D15）：`/root/lobster-phase1/scripts/sg-deploy.sh`；驗收 `curl -s https://app.aware-wave.com/ops/collect`（登入後）含 `data-panel="research-bridges-frozen"` 且無「送去」。回滾：`RESEARCH_BRIDGES_ENABLED=true` 重部署。
**WC-PIb-05 期末閘**：`scripts/playwright-runner.ps1 -Mode cognitive`（`PLAYWRIGHT_COS_URL=https://cognitive.aware-wave.com`）1 passed；§0／TASKS／WORKLOG；操作者親眼看到結果頁（里程碑「第一次在正式站看到真分析」）。

**PI-b 執行修正（2026-09-26，照此執行）**：順序改 02 → 03 → 01 → 05（先部署再分流）。01 upstream 保持變數＋`resolver`，前綴用 `rewrite … break` 去掉（靜態 `proxy_pass http://…/;` 在容器不在時讓 `nginx -t` 失敗、影響主機所有站）；主機檔含 repo 沒有的 `hci.aware-wave.com` 區塊 → 只改主機檔的 cognitive 區塊，不以 repo 檔覆蓋。02 API 加 `ApiPrefixMiddleware`（`main.py`，`/api/<path>` ≡ `/<path>`，路徑與 raw_path 同時才去前綴），meta 改 `/api` 後本機 uvicorn 仍可用、分流前後都無斷窗；`deploy.sh` 公開 smoke 改 `/api/health`。03 `NEXT_PUBLIC_API_PREFIX` 不設（`apps/cognitive-web/lib/api.ts:6` 預設 `/api`），驗收改 `curl …/api/health` 與 `/` 回 web。next-admin「在 Cognitive OS 開啟」導向 `/auth/handoff`（`NA/app/api/cognitive-os/open/route.ts:69`，未被 P0 凍結）→ nginx `= /auth/handoff` 302 到 `/expert/auth/handoff`，API 導向改相對 `../?project=`；另 `= /api`、`= /expert` 301 補尾斜線。

### 12.5 後續期的卡怎麼產生（P-ARF-data → P1 → …）
- 來源：§5 該期列（元件）→ §3.3 對應列（位置、樣板）→ §3.4 契約 → §6 該期欄（突變）→ **一元件一卡**，照 12.2；每個 `file:line` 產卡當下 grep 驗過，不抄舊行號。
- 產卡者 = 上一期期末閘的執行者；操作者只看卡不看碼；卡放本檔 §12.x；已完成的卡整組收成一行「已完成：commit …」。
- 卡的大小：≤1 個工作 session、≤5 個檔；超過就拆。
- 卡的驗收指令必須是「一條指令 + 一行預期輸出」；寫不出來 = 元件定義不夠清楚 → 先回 §3.3 補，不產卡。
- P3 產卡時 dossier 管線至少三張：`method_dossier` purpose＋285 種子批次蒐集；三份可演化資料起草＋`citation_integrity`；M1–M8 計分器＋「知識不足」顯示。

### 12.6 便宜模型禁區（遇到就停、問一題）
prod 部署／nginx／compose 上主機（High-STOP）；改 Recipe 引擎（I8）；改門檻或測試期望去配合結果（I10）；自然人資料（D10／D21）；新增依賴（`pyproject.toml`／`package.json` 新套件，卡上沒列的）；改 auth／cookie／session；卡上沒列的檔；任何「可能是」——沒有 `file:line` 證據的判斷。

### 12.7 P1 工作卡（Source＋Collection Service）— 01–14 完成；15 期末閘 8/9
- 已完成 2026-09-26：01＋03 `a6c43eb29`、02 `916b0983d`、04–08 `df49aab0f`、09 `8614a97dd`、10 `5eb5270cf`、11 `1e8da323a`、12 `54c864cf6`、13 `1487d3818`＋缺口 `ca341ddc6`、14 主機（WORKLOG 續52／55）、15 續59。卡片全文與產卡裁定 K1–K10：`git show 3a4878310:Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md` §12.7；裁定已回寫 §3.3，執行中的卡片修正見 WORKLOG 續37／41。
- 剩：無（WC-P1-15 ⑤ 2026-10-02 驗過）。

**P1 各軌檔案**（§12.8 P-K8 引用）
| 軌 | 卡（依序） | 只此軌可改的檔 |
|---|---|---|
| A COS（Python） | 01→02→03→04→05→06→07→08 | `COS/ai_lego/**`、`COS/tests/unit/**`、`COS/docker-compose.yml`、`COS/deploy/.env.example`、`SPEC/specs/domain/{source,collection-run}.schema.yaml`、`SPEC/tests/contracts/specs/domain/collection-run.fixtures.yaml` |
| B NA／WF（TS） | 10→11→12→13 | `NA/lib/collect/run.ts`、`NA/lib/collect/sinks/{cognitive.ts,__tests__/cognitive.test.ts}`、`NA/app/api/internal/collect/runs/**`、`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`（next-admin 兩行 env）、`WF/src/lib/collection/postResearchRunExecute{,.test}.ts`、`WF/src/trigger/{collect-research-run,index}.ts` |
| 閘（High-STOP） | 14→09→15 | 主機 env／vault／部署；A、B 全完後 |

**介面釘死**（程式註解引用：`main` `# Research collection runs`、`COS/ai_lego/platform/net/collection_service.py:1`、`COS/tests/unit/test_api_collections.py:2`）
| # | 呼叫 | 認證 | 請求 | 回應 |
|---|---|---|---|---|
| I-a | COS→NA `POST {COGNITIVE_OS_COLLECTION_SERVICE_URL}/api/internal/collect/runs` | `Bearer <COLLECT_RESEARCH_RUNS_TOKEN>` | `{grant_ref, project_id, run_id, seeds:[{uri, meta?}], budget:{fetches}}`；seeds 1–10、`uri` 以 `entity://` 或 `https://` 起、`meta` 物件；fetches 1–200 | 202 `{ok:true, trigger_run_id}`；400 `{ok:false,error:"bad_request"}`（含 body 帶 `grant_token`／`cos_base_url`）；401；502 `{ok:false,error:"trigger_unavailable"}` |
| I-b | NA→Trigger task `collect-research-run` | `TRIGGER_ACCESS_TOKEN` | payload = I-a body（無 token） | Trigger run id |
| I-c | WF→NA `POST {AWAREWAVE_WEBHOOK_BASE_URL}/api/internal/collect/runs/execute` | `Bearer <COLLECT_RESEARCH_EXECUTE_TOKEN>` | = I-b payload | 200 `{ok:true, status:"completed"\|"failed", report}`；401；502 `{ok:false,error:"grant_exchange_<status>"}` |
| I-d | NA→COS `POST {COGNITIVE_OS_API_BASE_URL}/collect-grants/{grant_ref}/exchange` | `Bearer <COLLECT_RESEARCH_RUNS_TOKEN>` | 無 | 200 `{grant_token, project_id, run_id, expires_at}`；401 `COLLECT_TOKEN_INVALID`；404 `GRANT_NOT_FOUND`；409 `GRANT_ALREADY_EXCHANGED`；410 `GRANT_EXPIRED` |
| I-e | NA→COS `POST /projects/{project_id}/sources/ingest` | `Authorization: Grant <grant_token>` | `{run_id, sources:[C1 ×1–25]}` | 200 `{results:[{canonical_url, outcome:"created"\|"unchanged"\|"superseded", source_id}]}`；400 `SOURCE_HASH_MISMATCH`（整批零寫入）；401 `GRANT_INVALID`；403 `GRANT_PROJECT_MISMATCH`；409 `COLLECTION_RUN_NOT_RUNNING` |
| I-f | NA→COS `POST /projects/{project_id}/collections/{run_id}/complete` | Grant | `{status:"completed"\|"failed", report:{fetched, written, unchanged, refused, stopped_by}, error?}` | 200 `{run_id, status}`；之後同 grant → 401 |
| I-g | 人→COS `POST /projects/{id}/collections` | session | `{seeds, budget?, confirm?}` | 無 `confirm:true` → 200 `{plan:{seeds, max_queries, max_fetches}}` 零寫入；`confirm:true` → 202 `{run_id, status:"requested"}`；409 `COLLECTOR_IDENTITY_MISSING`；502 `COLLECTION_SERVICE_UNAVAILABLE`（run=failed）；503 `COLLECTION_SERVICE_UNCONFIGURED` |
| I-h | 人→COS `GET /projects/{id}/collections/{run_id}` | session | — | 200 = `collection-run.schema.yaml` 物件（WC-03；status ∈ requested\|running\|completed\|failed；不含 seeds）；404 |

### 12.8 P2 工作卡（彙整＋引註閘＋品質 harness）＋提前的 P3-01；雲端與本機並行
**依據**：§5 P2 列、§3.3（`synthesis.*`／`citation_integrity`／`literature_search` v2／`route.method` 列）、§3.4 C4／C8／C9、§3.7、§3.8、§6 P2 欄；產卡 2026-09-26（[a574b2]，操作者「PLAN 太大，多派給雲端和本機 session，不影響執行中的 session」）。`file:line` = HEAD `b513ac4b0`，附錨點；錨點不中 = 停（12.1-7）。**產卡者**：本期 = 本節作者，WC-P1-15 執行者不再產 P2 卡（覆寫 12.5 該句）。
**分派**（AGENTS §5：共用工作目錄最多 2 個 session → 本機卡排在既有兩條線後面，不開第三個本機 session）
| 卡 | 誰 | 何時 |
|---|---|---|
| 01／02／03／04 | 雲端 T28／T29／T30／T31 | 現在，四支並行（檔案零交集，除產生檔 SPEC_QUICKREF） |
| 05 | 雲端 T32 | 01、02、03 合併後 |
| P3-01 | 雲端 T33 | 03、04 合併後 |
| P3-02 | 雲端 T34 | 現在可開（`run_recipe` 區段與網站那批未提交的 `main.py` 改動不重疊） |
| P3-03 | 雲端 T35 | 01 合併後 |
| 04b | 雲端 T36 | 現在（01–04 已合併）；09 取基準線前必完成 |
| 雲端合併 | [a574b2] 或接手者 | 每支到齊：本機重驗（Windows PS 5.1＋autocrlf）→ critic 1 → 合併 → WORKLOG |
| 07a | 本機新 session L1，獨立目錄 `D:\tmp\wt-l1` | 現在 |
| P4-01（提前） | 本機新 session L2，獨立目錄 `D:\tmp\wt-l2` | 現在 |
| 06 → 07b → 09 | P1 那條線（WC-P1-15 完、`/clear` 後） | 06：05 合併後；07b：07a 合併且網站那批 commit 後 |
| 08；`POST /route` 端點＋首頁「先說你卡在哪」改呼叫它、刪 TS `pickTools` | 網站那條線（結果頁這批 commit 後） | 08：01 合併後；route：P3-01 合併後 |
**本機獨立目錄**（L1／L2）：合併者建 `git worktree add --detach D:/tmp/wt-l<N> origin/main`（不建分支，settings 禁）；session 只在該目錄工作，commit 在 detached HEAD、不 push；照一般本機規則（R0／R4、WORKLOG 條目用 `worklog-insert-entry.py`、`/codex-review` 或 `ORACLE_WAIVED`）；完成回報 sha，合併者在 `D:\Work` cherry-pick（objects 共用）並重配 WORKLOG 續號。不在共用目錄 → 不佔 AGENTS §5 的 2 個上限、不碰執行中 session 的未提交檔。
**雲端前置**（每卡）：`python agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/run_golden_tests.py` exit 0；unit 只跑卡上列的（12.1-11，不跑全套）；分支 `claude/cc-t<N>-*`；卡 commit 不改本檔／WORKLOG／TASKS，證據寫 commit message（合併時回填 §0）。
**本期不碰（P-K8）**：`COS/apps/cognitive-web/**`、`COS/docs/mockups/**`、`main`（06／07 除外）、`COS/ai_lego/modules/research/interpret_method_record.py`（08 除外）、`COS/ai_lego/platform/ai_gateway/provider.py`、`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml`＋其 fixtures（網站 session 未提交改動中）；T19–T27 與 §12.7 表內的檔。

**產卡裁定**
- P-K1 synthesis 照 interpret 的先例：模組函式（樣板 `interpret_method_record.py` HEAD `:238-277`，錨點 `def run_interpretation`）＋`main` 端點＋背景 thread（樣板 `main` HEAD `:1174-1291`，錨點 `def _run_interpretation`）。§3.3 的 `build_context_bound_adapters(deps)` 不建：interpret 已走同路而不需要它（零重工）；07 若證明 recipe 步驟必須注入依賴再議。三條線 = **一支** `synthesis.py` 依 `kind` 選 prompt 與 schema（D14 同理，不寫三支）。09 回寫 §3.3 兩列。
- P-K2 全系統一套引註 id = manifest `id` 字串（interpret 已用 `source:<id>`，HEAD `:57-60`）；prompt 內模型寫 `[n]`，runner 以 manifest 換成 id 再過閘；typed object 只存 id。
- P-K3 `citation_integrity` 只有一個定義，在 `COS/ai_lego/modules/research/gates.py`（`:41-63` 旁）；interpret 內聯版（HEAD `:195-199`，錨點 `citation_ok =`）由 08 改呼叫它並刪內聯。
- P-K4 prompt 是版本化資料（I9）：dossier 系統 prompt 與段落表逐字搬 `NA/lib/dossier/report.ts:76-80,111-125`（錨點 `REPORT_SECTIONS`、`你是盡職調查分析師`）進 `SPEC/evolution/synthesis-prompts/v1.yaml`；runner 只讀 champion，`.py` 不含 prompt 文字。
- P-K5 spec root 對 runtime 唯讀（`COS/README.md:3`）：runtime 只 `load_champion`；晉升／回滾 = 離線 CLI 寫 SPEC＋LEDGER，由人跑；R3+（模型、成本、任何門檻）必帶 `--approved-by`（C9、I10）。YAML 一律用現成 strict loader `COS/ai_lego/platform/catalog/display_catalog.py:15`（`_yaml`），不寫新 loader。
- P-K6 harness 離線（C8）：評「已存的 synthesis artifact」對「案例 expected」，不呼叫模型；案例來源檔當 Source，`source_id = src:<檔名去副檔名>`；門檻初值 `null` = 未定 → 報 `UNSET`（不算 PASS）；基準線由 09 真跑後提出、操作者定（I10）。
- P-K7 `SPEC/docs/architecture/SPEC_QUICKREF.md` 是產生檔（檔頭 `:3`）：卡內跑 `python agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/gen_spec_index.py`，不手改；合併時在乾淨樹重產。
- P-K8 見上「本期不碰」。CI 接線與 `COS/scripts/test-eval-harness.ps1` 歸 09（本機），雲端不改 CI。
- P-K9 §5 P2 DoD「`edd-research-evidence-v1` 用 `literature_search` v2 跑 PASS」與碼不符：該 recipe 只有三個方法節點（`epistemic.assumption_mapping`／`evidence_matrix`／`toulmin_model`，`SPEC/recipes/validated/edd-research-evidence-v1.recipe.yaml:32,41,52`），不呼叫 `literature_search`；呼叫它的是 `research-qualitative-v1`（同目錄，`:18` `literature_search` → `evidence.triangulation`）與 fixture `edd-literature-search-v1`（§8 退場）。07 驗收改用 `research-qualitative-v1`；09 改寫 §5 該句。
- P-K10 I5「每個 [n] 解析到 source id＋sha256＋URL＋fetched_at」：手動來源的 URL／fetched_at 可為 null（P-a），附錄照實顯示「—」，不算解析失敗；sha256（64 hex）與 source id 缺一即失敗。09 把這句寫回 §2 I5。
- P-K11 `source_class=academic` 目前沒有任何寫入路徑（critic 2026-09-26：NA `lib/collect/source-class.ts:19` 只有 retail／social／aggregator／reference／unknown，`sinks/cognitive.ts:42` 以 URL 分類；COS 手動來源 `CreateSourceRequest` 無此欄；`SPEC/specs/domain/source.schema.yaml:41` 同五值）→ **寫入時決定、讀取端只讀欄位**：NA `SourceClass` 加 `academic`，sink 對學術收集器抓回的文件標 academic；COS `create_source` 有 `doi` 即標 academic；schema 描述同步。歸 07b。

**介面釘死**（各卡依此寫，不等彼此合併；要改表 = 停、相關卡同改）
| # | 名 | 形狀 |
|---|---|---|
| P-a | manifest 項（01 產；05 用；04 評） | `{n:int≥1, id:"source:<source_id>", source_id, sha256, start:int, end:int, title, url:str\|null, fetched_at:str\|null, source_class:str\|null}`；`0 ≤ start < end`、`end−start ≤ 6000`；每批 ≤40 項（`report.ts:82-83`）；只收 `status='active'`；n 依 `created_at, source_id` 穩定排序 |
| P-b | 主張（02 定；01 閘；04 評） | 任一含 `citations` 鍵的物件；`citations` 非空、⊆ manifest `id`、不重複；`conflicts[]` 的 `citations` ≥2 個不同 id；`gaps[]` 無 `citations` |
| P-c | synthesis artifact（05 產；04 評） | `{synthesis:<P-d>, manifest:{entries:[P-a], batches:[[n]], sha256}, gate_results:[P-e], prompt_version:str, latency_ms:int}`；`prompt_version`＝產出它的 synthesis-prompts 版本、`latency_ms` runner 量（golden 兩者可缺＝champion／0）；manifest 過 `source_manifest.manifest_errors`；`gate_results` 必等於 `gates.evaluate_citation_integrity` 的輸出；合格與否只由 `COS/eval/run.py` `artifact_contract_errors` 判（schema＝該版 prompt 的 `output_schema_id`）；`uncited_sections`＝無引註段落的標題（C4），非未被引的來源 |
| P-d | synthesis 共同核心（02 定） | `{synthesis_id:"SYN-…", project_id, kind ∈ dossier_brief\|decision_evidence\|literature_matrix, language, summary{text, citations}, sections[{heading, claims[{claim_id, text, citations}]}], gaps[{text, needed_evidence}], conflicts[{text, citations}], uncited_sections[str], manifest_ref{sha256, count, batches:int}, provenance{epistemic_type:AI_INFERENCE, authorship_state:AI_GENERATED, locked:null}, model, usage{input_tokens, output_tokens}}`＋各線結構段 |
| P-e | 閘結果（01） | `{gate_id:"citation_integrity", status:"PASS"\|"FAIL", evidence{out_of_manifest[], zero_citation[], conflicts_under_two[], uncited_sections[], claims_total:int}}`；FAIL ⟺ 前三者任一非空或 `claims_total=0`；`uncited_sections` 只列不 FAIL（C4） |
| P-f | 指標名（04；C8 固定） | `citation_precision_auto, citation_coverage, hallucination_rate, contradiction_detection, gap_honesty, trap_rejection, cost_tokens, latency_ms` |
| P-g | champion（03 定；05、P3-01 用） | `load_champion(spec_root, kind) -> tuple[str, dict]`；kind 必在 `SPEC/evolution/kinds.yaml`（每個 kind＝一個目錄名＋`risk_tier` R0–R4）；`champion.yaml` 必有 `kind`（＝所在目錄）、`version`（`v<N>`）、`version_sha256`（安裝時的版本檔位元組）；缺檔／壞 yaml／版本檔不存在／kind 或 version 與位置矛盾／位元組與記錄不符 → `InvariantViolation("EVOLUTION_…")`，不回預設；同一讀取點 `registry.read_champion` 供離線 CLI 用 |
| P-h | runner（05 定；06 用） | `run_synthesis(*, kind, project_id, subject:dict, sources:[{row, text}], provider, spec_root, schema_contracts, synthesis_id, language="zh-TW") -> {artifact:<P-c>\|None, error:str\|None, model, input_tokens, output_tokens}` |
| P-i | 詞切分（04 定；P3-01 用） | `COS/ai_lego/platform/text/terms.py` `terms_of(text) -> list[str]`：行為同 `COS/apps/cognitive-web/components/StuckBox.tsx:15-22`（CJK 連續字切兩字、拉丁數字 ≥2 字元整詞、小寫、去重保序） |
| P-j | subject 與 user prompt（05 定；06 用） | subject：dossier `{name, kind∈person\|company\|event, anchors[]}`、decision `{question, options[]}`（options 可空）、literature `{question}`；user prompt 文字＝`SPEC/evolution/synthesis-prompts/<版>.yaml` 各 kind 的 `user_intro`（`str.format` 具名欄位 `{subject_name} {subject_kind_label} {anchors_line} {section_headings} {source_count} {language}`）與 `reduce_intro`（`{map_count}`）；runner 只在其後接結構行（SUBJECT json、LANGUAGE、SECTION_HEADINGS json、FENCE CODE <nonce>、SOURCE 區塊；reduce 接 FULL MANIFEST＋`<<<MAP k BEGIN/END>>>`），`.py` 不含 prompt 散文（P-K4）；改 v1.yaml 者同 commit 重算 LEDGER 種子列與 champion 的 `version_sha256` |
| P-k | 同一件事同時只跑一個（P3-02 recipe run、06 synthesis 及之後所有背景工作） | `ai_lego.platform.workflow.run_lock`：`acquire_run_lock(path) -> RunLock\|None`（None → 409 `…_IN_FLIGHT`）；`RunLock.release()` 放 finally／背景 thread 結束處（冪等、不拋）；`run_lock_state(path) -> held\|free\|absent`（status：held＝執行中、free＝已受理但 runner 已死 → 報 LOST／lost、absent＝從未受理）；path＝該資源目錄內 `<id>.lock`，永不刪。OS 鎖：跨 worker 互斥、runner 死由 kernel 釋放。**禁止**行程內 set／dict／`threading.Lock` 當「執行中」登錄（多 worker 會重跑、runner 死後永遠卡住；2026-09-28 Codex r3＋critic）；`COS/tests/unit/test_no_process_local_run_registry.py` 擋 |

**WC-P2-01 Source manifest＋`citation_integrity` 閘**（雲端 T28）
- 目標：P-a、P-e 兩組純函式；synthesis／interpret／harness 共用。
- 讀：`COS/ai_lego/modules/research/gates.py:37-63`；`interpret_method_record.py` HEAD `:44-61`（record manifest 與 id 慣例，只讀）；`NA/lib/dossier/report.ts:82-105`；`repo:163`（`_SOURCE_SELECT`）、`:402`（active 列定義）、`:564-578`（`list_sources`、`get_source_content_reference`）；`main` HEAD `:1574-1579`（讀 CAS 全文）。
- 樣板：`report.ts:93-105`（區塊格式逐字：`<<<SOURCE n BEGIN>>>`…`<<<SOURCE n END>>>`）；`gates.py:37-38`。
- 改：新 `COS/ai_lego/modules/research/source_manifest.py`：`build_source_manifest(sources, *, max_chars=6000, batch_size=40)`（P-c 的 manifest 形狀；superseded 排除；`sha256` = entries canonical json 的 sha256）、`render_source_block(entry, text)`、`resolve_citation_numbers(obj, entries)`（`citations` 內的 int n 換成 id；未知 n 原樣保留讓閘 FAIL，不丟）；`gates.py` 加 `evaluate_citation_integrity(obj, manifest_ids)`（P-b／P-e，遞迴走整個物件）。新測試 `COS/tests/unit/test_source_manifest.py`、`test_citation_integrity.py`（合計 ≥12 案：越界、零引註、conflicts 只 1 個、零主張、重複 id、巢狀、uncited 不 FAIL、superseded 排除、6000 截斷、41 篇兩批、排序穩定、未知 n 保留）。
- 不改：`interpret_method_record.py`（08 接）；`main`。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_source_manifest tests.unit.test_citation_integrity $(grep -rlE "modules\.research\.gates|modules\.research import gates" tests/unit --include="test_*.py" | sed 's#/#.#g; s#\.py$##') -q 2>&1 | tail -1` → `OK`
- 突變：閘拿掉「⊆ manifest」→ 越界案紅；拿掉 conflicts ≥2 → 對應案紅；manifest 收 superseded → 對應案紅。
- commit：`feat(cognitive-os): source prompt manifest + one citation_integrity gate for every AI claim (P2 WC-01, C4/I3)`。回滾：revert（新檔無人 import）。

**WC-P2-02 三個 synthesis typed object＋能力契約**（雲端 T29）
- 目標：P-d 共同核心＋三線結構段的 schema、fixtures、DRAFT capability contract。
- 讀：`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml` HEAD `:1-30`（檔頭慣例，只讀）；`SPEC/tests/contracts/specs/cognitive/typed-objects/method-interpretation.fixtures.yaml` HEAD `:1-20`（fixtures 格式，只讀）；`SPEC/capabilities/contracts/interpret.method_record.capability.yaml`（契約樣板）；`SPEC/specs/domain/capability-contract.schema.yaml`（必填鍵）；`report.ts:76-80`；§3.7 黃金案例列（期望發現三線各三類）。
- 改：新 `SPEC/specs/cognitive/typed-objects/{dossier-brief,decision-evidence-brief,literature-matrix}.schema.yaml`（1.0.0、`additionalProperties:false`；共同核心放 `dossier-brief` 的 `$defs`，另兩檔 `$ref`——golden／`SchemaContracts` 不支援跨檔 `$ref` 時三檔各寫一份，另加一個測試比對三份共同段逐字一致；commit 寫選哪個與證據）；結構段：dossier `subject{name, kind∈person|company|event, anchors[]}`＋`related_entities[{name, relation, citations}]`（section `heading` ∈ `report.ts:76-80` 該 kind 的表）；decision `options[{option_id, name, citations}]`、`criteria[{criterion_id, name, citations}]`、`evidence[{text, option_ids[], criterion_ids[], stance∈supports|opposes|mixed, citations}]`；literature `studies[{study_id, source_id, claim, method, sample:str|null, limitations[], citations}]`；fixtures 三檔各 ≥2 valid、≥4 invalid（零 citations、未知 kind、多餘鍵、conflicts 單一 citation）；`SPEC/capabilities/contracts/synthesis.{dossier_brief,decision_evidence,literature_matrix}.capability.yaml`（`status: DRAFT`；description：context-bound、非 Recipe 節點、端點見 WC-P2-06）；跑 `gen_spec_index.py`。
- 不改：`method-interpretation.*`；COS 程式。
- 驗收：`python agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/run_golden_tests.py >/dev/null 2>&1; a=$?; python agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/gen_spec_index.py --check >/dev/null 2>&1; echo "$a $?"` → `0 0`
- 突變：一個 invalid fixture 移到 valid → golden 紅；拿掉 `citations` 的 `minItems` → 零引註 invalid 案紅。
- commit：`feat(spec): dossier-brief / decision-evidence-brief / literature-matrix typed objects + DRAFT synthesis contracts (P2 WC-02, C4)`。回滾：revert（DRAFT 不進 catalog）。

**WC-P2-03 可演化資料登錄＋`synthesis-prompts` v1**（雲端 T30）
- 目標：§3.8 的版本化資料機制（kind 清單、版本檔、champion 指標、LEDGER、離線晉升／回滾）＋第一份資料。
- 讀：§3.8、C9、I9／I10、R14；`COS/ai_lego/platform/ai_execution/replay.py:34-76`（prompt_version／restored_prompt_version）、`rollback_plan.py:16`；`SPEC/recipes/validated/champion-challenger.recipe.yaml`；`COS/README.md:3`；`display_catalog.py:15-38`；`report.ts:76-80,111-136`；`SPEC/methods/registry/method-visual-kinds.yaml`（第 7 種 kind 現址，本卡不搬）。
- 改：新 `SPEC/evolution/kinds.yaml`（angles、source-classes、synthesis-prompts、model-routing、recipe-defaults、ux-defaults、interpretation-visuals（`legacy_path` = 現址）、lessons；每種 `risk_tier`（R0–R4）、`owner`；檔頭註明新增 kind = ADR，R14）；`SPEC/evolution/synthesis-prompts/v1.yaml`（dossier：system 逐字自 `report.ts:111-125`、段落表 `:76-80`；decision、literature：同規則骨架的新 prompt，引註規則與注入防護兩句逐字共用；各帶 `output_schema_id` = 02 的 `$id`）＋`SPEC/evolution/synthesis-prompts/champion.yaml`（`{kind, version:"v1", promoted_at, ledger_line}`）；`SPEC/evolution/LEDGER.md`（表頭＋v1 初始一行）；新 `COS/ai_lego/platform/evolution/registry.py`（`load_champion` P-g、`list_versions`）；新 `COS/ai_lego/apps/cli/evolution.py`：`promote --kind --version --evidence FILE [--approved-by]`、`rollback --kind`（依 LEDGER 回上一版）；R3+ 無 `--approved-by` → exit 2；寫檔原子（暫存檔＋`os.replace`）；每次寫 LEDGER 一行（版本前後、證據 sha256、批准者、UTC 時間）。新 `COS/tests/unit/test_evolution_registry.py`（≥10 案：讀 champion、未知 kind、版本檔缺、壞 yaml、重複鍵、promote 寫 LEDGER、rollback 回上一版、R3 無批准拒絕、中途例外不留半檔、同版重複 promote 冪等；spec root 一律注入暫存目錄，不寫真 SPEC）。
- 不改：`method-visual-kinds.yaml` 與 interpret 的讀法（搬遷另卡）；任何門檻。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_evolution_registry -q 2>&1 | tail -1; python -c "from pathlib import Path; from ai_lego.platform.evolution.registry import load_champion; print(load_champion(Path('../../../agency-os/docs/AI_LEGO_Cognitive_Engineering_OS'), 'synthesis-prompts')[0])"` → `OK` 與 `v1` 兩行
- 突變：rollback 固定回 v1（不讀 LEDGER）→ 「回上一版」案紅；拿掉 R3 批准檢查 → 對應案紅。
- commit：`feat(cognitive-os): versioned evolvable data -- kinds, champion pointer, ledger, offline promote/rollback; synthesis prompts v1 ported verbatim (P2 WC-03, I9/C9)`。回滾：revert（runtime 尚無讀者）。

**WC-P2-04 品質評分 harness＋9 個黃金案例**（雲端 T31）
- 目標：§3.7／C8：離線評分器、案例格式、門檻檔、報告、突變腳本；三線各 3 案（合成資料）。
- 讀：§3.7、C8、I10、R11、R12；P-b／P-c／P-d／P-f／P-i；`StuckBox.tsx:15-22`。
- 改：新 `COS/eval/`：`README.md`（格式與跑法，AI 極簡）；`cases/{L1,L2,L3}/<id>/{sources/*.txt, expected.yaml, golden-output.json, README.md}`（合成、無自然人敏感內容；三線合計四種陷阱各至少一次：同名混淆、購物頁、注入句、矛盾來源；`golden-output.json` = 手寫的好輸出，P-c）；`expected.yaml`：`findings[{id, terms[], sources[]}]`、`conflicts[{id, terms[], sources[≥2]}]`、`gaps[{id, terms[]}]`、`traps[{source, kind}]`；`score.py`：`score(case_dir, artifact) -> {P-f 八項}`（每指標定義一行 docstring；precision_auto = 被引來源片段含主張的 ≥1 個 `terms_of` 詞）；`run.py`：`--artifacts DIR`（`<line>/<id>.json`）或 `--golden`，`--out DIR`，`[--champion REPORT]` → `eval-report.json`＋`.md`（每案每指標、與 champion 差值、PASS／FAIL／UNSET；任一 FAIL → exit 1）；`thresholds.yaml`（每線每指標 `null`＋`set_by: operator`）；`mutate.py`（刪一個期望發現的來源檔 → 覆蓋率降；餵越界引註 artifact → 幻覺率升；兩者對「門檻已填」的暫存副本必 exit 1）；新 `COS/ai_lego/platform/text/terms.py`（P-i）。新 `COS/tests/unit/test_eval_harness.py`（≥14 案：每指標一正一負、UNSET 不算 PASS、champion 差值、陷阱被引 → trap_rejection 降、expected 格式錯 → 明確錯誤、兩突變、`terms_of` 對照 StuckBox 規則 5 例）。
- 不改：thresholds.yaml 以外不出現門檻數字；CI（09）。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_eval_harness -q 2>&1 | tail -1; python eval/run.py --golden --out "${TMPDIR:-/tmp}/evalrep" >/dev/null; echo $?` → `OK` 與 `0` 兩行
- 突變：`mutate.py` 兩項；score 的 coverage 拿掉「引到期望來源」條件 → 對應案紅。
- commit：`feat(cognitive-os): offline quality harness -- 9 golden cases, 8 fixed metrics, thresholds unset until the operator sets them (P2 WC-04, §3.7/C8)`。回滾：刪 `COS/eval`＋`terms.py`。

**WC-P2-04b 期望發現三類＋指標分得出好壞（§3.7、R11）**（雲端 T36；現在；09 取基準線前必完成）
- 狀態：**已完成並重驗（2026-09-30）**；既有實作與本卡 DoD 一致，無需重做程式。
- 目標：① §3.7 每線三類期望發現（L1 事實／爭議／關聯人；L2 選項／準則／證據；L3 主張／方法／限制）進入評分——第一波 findings 無類別，L1 關聯人、L2 選項與準則、L3 方法與限制沒有任何期望發現；② 指標分得出好壞（critic 2026-09-26 M1：terms 是 golden 句子的全部 bigram，含主體名與虛詞，命中只要 1 詞 → 錯數字、空泛 gap、全引錯來源、照注入句寫的 synthesis 與 golden 同分）。兩者不做，09 的基準線與 C9 晉升都量不到真好壞。
- 讀：§3.7、R11；`COS/eval/README.md`、`score.py`、`run.py`；`COS/eval/cases/**`；`COS/tests/unit/test_eval_harness.py`；三個 synthesis typed object（`related_entities`、`options`、`criteria`、`studies[].method／limitations`）。
- 改：`expected.yaml` findings 加必填 `category`（L1 `fact|controversy|related_party`、L2 `option|criterion|evidence`、L3 `claim|method|limitation`；缺或不屬該線 → `score.py` 明確錯誤），每線三類各 ≥1（跨該線 3 案，用既有來源檔，必要時加一個合成來源檔，無自然人敏感內容），golden 補對應節點；findings／conflicts／gaps 的 `terms` 改為少數承載事實的詞（數字、日期、專有名詞），expected 寫 `min_hits`（預設＝全部），在該案半數以上來源出現的 bigram 不得當 term（測試守）；precision 改比對被引來源的 manifest `[start,end)` 片段；traps 加 `forbidden_terms`（任何 claim 文字出現即算沒擋下）；`_content_text` 納入 `relation`／`method`／`limitations`；報告每案加 `coverage_by_category`（不加門檻鍵，P-f 八項不變）；README。新測試：每線三類齊全、類別錯誤、每個比例指標一個反例（錯事實／空泛／引錯來源／照注入寫 → 分數 < 1.0）。golden 仍過 `GoldenCasesTests`（改 golden 就用閘重算 `gate_results`）。
- 不改：`thresholds.yaml`（仍全 null）；P-f 名稱；`gates.py`；schema。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_eval_harness -q; echo $?` → `0`；`python eval/run.py --golden --out "${TMPDIR:-/tmp}/evalrep" >/dev/null; echo $?` → `0`；`python eval/mutate.py; echo $?` → `0`。
- 突變：刪 L3 全部 `method` 類期望發現 → 三類齊全案紅；命中改回「1 詞即可」→ 錯事實反例案紅；precision 改回整篇比對 → 引錯來源反例案紅。
- commit：`feat(cognitive-os): eval scores what matters -- three §3.7 finding categories per line, fact-bearing terms, fragment-level precision, forbidden trap terms (P2 WC-04b)`。回滾：revert。

**WC-P2-05 synthesis runner（三線一支）**（雲端 T32；01／02／03 合併後）
- 狀態：**已完成並重驗（2026-09-30）**；既有 runner 實作與本卡 DoD 對齊，無需重做程式。
- 目標：P-h：manifest → champion prompt → provider → 解析 → `[n]`→id → typed object 驗證 → `citation_integrity` → artifact；兩次嘗試、token 累計；超過一批走 map→reduce。
- 讀：`interpret_method_record.py` HEAD `:238-277`（只讀）；`COS/ai_lego/platform/ai_gateway/draft.py:153`（`extract_json_object`）；`provider.py` HEAD `:31-41`（只讀）；01／02／03 產物。
- 樣板：`run_interpretation`。
- 先補資料（v1 在本卡前無讀者，本卡是最後一次改 v1）：`SPEC/evolution/synthesis-prompts/v1.yaml` 三個 kind 加 P-j 的 `user_intro`／`reduce_intro`（dossier 由 `NA/lib/dossier/report.ts:127-136` 逐字搬，只改兩處配 typed object：「body 寫明缺什麼」→「claims 留空並在 gaps 寫明缺什麼」；「若發現請寫進 conflicts」→「若發現請寫進 gaps 並且不要引用該來源」（同 v1 規則 5：conflicts 需 ≥2 來源、引陷阱會降 trap_rejection））＋`kind_labels`（`report.ts:109`）＋`anchors_line` 有無兩版；同 commit 重算 `SPEC/evolution/LEDGER.md` 種子列與 `synthesis-prompts/champion.yaml` 的 `version_sha256`（兩處同值；`test_evolution_registry` 的真 spec root 測試會擋）。
- 接法：`build_source_manifest` 吃扁平 dict → P-h 的 `{row, text}` 轉 `{**row, "text": text}`（缺 `status`／`source_id`、或納入的來源沒有 64 位小寫 hex `content_sha256` 會 raise）；每次 prompt 呼叫一次 `new_fence_nonce()`，所有 SOURCE 區塊用同一碼 `render_source_block(entry, text, nonce=…)`（v1 規則 5）；`uncited_sections` 直接取閘的 `evidence.uncited_sections`（單一定義，P-K3）；`studies[].source_id` 由 runner 依該研究唯一的 citation 填（模型不寫，v1 規則 7）；`gates.synthesis_reference_errors` 非空 → 同越界走修復；artifact 帶 `prompt_version`（load_champion 回的版本）與 `latency_ms`（P-c）。
- 改：新 `COS/ai_lego/modules/research/synthesis.py`（`run_synthesis`；map 每批一次呼叫、reduce 一次呼叫且輸入含同一 manifest；`uncited_sections`、provenance、usage 伺服器算）；新 `COS/tests/unit/test_synthesis.py`（假 provider；≥10 案：三線各一成功、越界 → 修復成功且 token 累計、兩次都錯 → error＋token、provider 例外 → error＋已用 token、41 篇 → 呼叫數 = 批數＋1、schema 不符 → 修復、prompt 來自 champion（暫存副本改 prompt → 送出內容跟著變）、SOURCE 區塊內注入句原樣、`uncited_sections`、artifact = P-c 且過 04 的 `score.py` 不報錯）。
- 不改：`provider.py`、`interpret_method_record.py`、`main`。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_synthesis tests.unit.test_source_manifest tests.unit.test_citation_integrity tests.unit.test_eval_harness tests.unit.test_evolution_registry -q; echo $?` → 最後一行 `0`；`test_synthesis` 每個成功案的 artifact 過 `eval/run.py` `artifact_contract_errors` → `[]`（產卡者備好的跨卡契約，12.1-14）；golden exit 0。
- 突變：拿掉閘呼叫 → 越界案紅；第一次 token 不累計 → 對應案紅；prompt 寫死 → champion 案紅；user prompt 寫進 `.py` → champion 案紅。
- commit：`feat(cognitive-os): one synthesis runner for three lines -- champion prompt, manifest-bound citations, two attempts, map-reduce past 40 sources (P2 WC-05, C4)`。回滾：revert。

**WC-P3-01（提前）問題路由 `route.method`**（雲端 T33；03／04 合併後）
- 狀態：**已完成**；route unit 10/10、golden 4257/4257、spec index fresh；正式 root 保持無 champion，待操作者依 R3 流程核准／晉升後才可供正式 runtime 路由。
- 目標：U16／§3.3 列：免費層＋AI 層＋三閘＋typed object＋DRAFT 契約；端點與首頁接線歸網站那條線。
- 讀：`StuckBox.tsx:15-31`（現行免費層）；`display_catalog.py:95`（`load_catalog`）、`:210`（`catalog_payload`）；`COS/ai_lego/platform/ai_execution/contract_catalog.py:133`（`is_resolvable`）；`draft.py:153`；`run_interpretation`（兩次嘗試樣板）；§3.3 route 列、U16。
- 改：新 `COS/ai_lego/modules/research/route_method.py`：`free_layer(catalog, text)`（P-i 比對 name_zh／blurb_zh／name_en；recipes 用其顯示資料；排序同 `StuckBox.tsx:29-31`）；`route(text, *, catalog, provider, spec_root, schema_contracts)`：免費層最高分 ≥ `ux-defaults` champion 的 `route.free_layer_min_confidence` → 直接回、不叫模型；否則 AI 層（manifest = 每條目錄一行 `catalog:<id>`，why 必引）；無 provider 且低信心 → 回免費層結果＋`needs_ai:true`；閘 `methods_resolvable`（⊆ `is_resolvable`）、`rationale_cited`、`max_three`；新 `SPEC/evolution/ux-defaults/v1.yaml`（`route.free_layer_min_confidence: 0.5` 提案值，`set_by: operator`）；`ux-defaults` 是 R3（`SPEC/evolution/kinds.yaml`，P-K5）→ 本卡**不建** champion／LEDGER，合併者問操作者一題後以 `python -m ai_lego.apps.cli.evolution promote --kind ux-defaults --version v1 --evidence <檔> --approved-by <操作者>` 晉升；無 champion 時 `route` 丟 `InvariantViolation`（P-g），測試一律用暫存 spec root；`SPEC/specs/cognitive/typed-objects/method-route.schema.yaml`＋fixtures；`SPEC/capabilities/contracts/route.method.capability.yaml`（DRAFT）；`gen_spec_index.py`。新 `COS/tests/unit/test_route_method.py`（≥10 案：免費層與 `pickTools` 同輸入同輸出 5 例、高信心不叫模型、低信心叫模型、幻覺 id → 修復、why 未引 → FAIL、>3 → FAIL、門檻讀 champion（暫存副本改值 → 行為變）、無 provider、recipe 候選、空字串 → 錯誤）。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_route_method tests.unit.test_evolution_registry -q; echo $?` → `0`；golden exit 0；`gen_spec_index.py --check` exit 0。
- 突變：拿掉 `methods_resolvable` → 幻覺案紅；門檻寫死 → champion 案紅。
- commit：`feat(cognitive-os): route.method -- free catalog match first, AI only below the operator-owned confidence, every suggestion cites the catalog (P3 WC-01 early, U16)`。回滾：revert。

**WC-P4-01（提前）報表產生器 `artifact.generate_report` + 本機 API 第一切片**（本機 L2；現在）
- 狀態：**renderer、API 第一切片、跨專案來源搜尋已完成**；report CAS row、POST/GET、Markdown export、approve/reject（CAS 比對舊 reference，並發落敗 409 `REPORT_STALE`；每版 artifact 帶 `decision_id` 使位元組唯一，刪舊版不會誤刪 live blob；已核准不可重核 409）與 identity events；tenant-scoped active Source search + 引用該 Source 的 synthesis finding（走 `gates.iter_claims`；每請求最多讀 `MAX_SEARCH_SYNTHESIS_READS`=200 個 synthesis artifact，讀不到／形狀損壞／超預算的 Project 回 `incomplete[]`；結果被 limit 截斷回 `truncated:true`＋`findings_complete:false`，不回靜默空陣列；未做分頁／全文索引／限流）；**`POST /projects/{id}/reports` 在 project-level run binding 完成前拒收非空 `run_results`（422 `REPORT_RUN_RESULTS_UNBOUND`）**；PDF、C11、教材、run binding 仍未完成。
- 目標：C6／I5：synthesis artifact（P-c）＋recipe run 結果 → 版本化報表物件＋markdown；每個 [n] 解析到 source_id＋sha256＋URL＋fetched_at，解析不到 = 閘 FAIL（比 `report.ts:185-206` 的改寫 `[?]` 嚴格，I3）。
- 讀：§3.4 C6、I5、I3；§3.3 `artifact.generate_report` 列；§6 P4 欄（突變：拔 [n] 解析 → 紅）；P-a／P-c／P-d／P-e；`NA/lib/dossier/report.ts:185-206`（對照用，不照抄其放寬）；run 結果形狀 `main` HEAD `:782-803`（`GET /recipes/{id}/runs/{run_id}/result`）與 `_journal_run_result`（錨點 `def _journal_run_result`：`workflow.steps[{index, …, output}]`、`workflow_gates`）；`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml` HEAD `:1-30`（檔頭慣例，只讀）；`SPEC/capabilities/contracts/interpret.method_record.capability.yaml`（契約樣板）。
- 改：新 `COS/ai_lego/modules/research/report_render.py`：`render_research_report(*, report_id, project_id, synthesis_artifact, run_results, language="zh-TW") -> {report, gate_results}`；`report = {report_id:"RPT-…", project_id, version:int, report_state:"AI_GENERATED", synthesis_ref{synthesis_id, manifest_sha256}, run_refs[{recipe_id, run_id, status}], sections[{heading, markdown}]（彙整段落 → 各 run 每站 record 表 → gate 表）, sources_appendix[{n, source_id, title, url, sha256_12, fetched_at}]（只列被引用者，n 沿 manifest）, problems{invalid_refs[], uncited_sections[]}, markdown, provenance{AI_INFERENCE, AI_GENERATED, locked:null}}`；閘 `report_refs_resolvable`（每個引註 id 在 manifest 且 appendix 有對應列；否則 FAIL）；核准翻轉不在本卡（端點與事件歸 P4）。新 `SPEC/specs/cognitive/typed-objects/research-report.schema.yaml`＋fixtures（≥2 valid、≥4 invalid：未知 report_state、appendix 缺 sha256_12、多餘鍵、HUMAN_APPROVED 卻無核准者欄——schema 加 `approved_by:str|null`，`HUMAN_APPROVED` 時必填）；`SPEC/capabilities/contracts/artifact.generate_report.capability.yaml`（DRAFT，description：context-bound、非 Recipe 節點）；跑 `gen_spec_index.py`。新 `COS/tests/unit/test_report_render.py`（≥10 案：好 synthesis＋一個 run → appendix 只含被引者且順序依 n、未解析引註 → FAIL、uncited_sections 進 problems、run 失敗站仍列表且標狀態、markdown 含每個 [n]、`sha256_12` = sha256 前 12 碼、零 run 也能出、schema 驗證通過、HUMAN_APPROVED 無 approved_by → schema 拒、輸入 artifact 不被改動）。
- 不改：`interpret_method_record.py`、NA `report.ts`（§8 P4 退場時才刪）；`main` 已接入本機 report endpoint，recipe run binding 仍待 project-level run slice。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_report_render -q 2>&1 | tail -1` → `OK`；golden exit 0；`gen_spec_index.py --check` exit 0。
- 突變：拔 [n] 解析檢查 → 未解析案紅（§6 P4 欄）；appendix 改列全部 manifest → 「只列被引者」案紅。
- commit：`feat(cognitive-os): report renderer -- every [n] resolves to source id, sha256, url and fetched_at or the report fails (P4 WC-01 early, C6/I5)`。回滾：revert（DRAFT 契約、無端點）。

**WC-P3-02（提前）`run_recipe`：`async:true`＋價值判斷欄 `human_required`**（雲端 T34；現在）
- 狀態：**已完成並重驗（2026-09-30）**；既有實作與本卡 DoD 對齊，無需重做程式。
- 目標：§3.3「非同步 run 旗標」列＋C5：① body `async:true` → 所有既有檢查照舊同步做完，再以背景 thread 執行，回 202 `{status:"RUNNING", run_id, journal_ref}`，進度走既有 `GET /recipes/{id}/runs/{run_id}`；② 價值判斷欄（人才能決定的權重／分數／量尺、論證的 warrant／qualifier）未填 → 422 `{code:"HUMAN_REQUIRED_MISSING", fields:[{index, method_id, param, path}]}`，不執行、不寫 journal；③ AI 起草永不填這些欄（C5「人填」）。
- 讀：`main` HEAD `:619-765`（錨點 `def run_recipe`；`:693-700` `missing_workflow_input_paths` 檢查處、`:737-750` `execute_workflow_ir`）、`:766-780`（run 狀態端點）；`COS/ai_lego/platform/workflow/executor.py:126`（`missing_workflow_input_paths`）；`COS/ai_lego/platform/ai_gateway/draft.py:224-232`（`draft_method_kwargs` 已有 `exclude_params`）、`:308`（`draft_recipe_source`）；`SPEC/recipes/validated/life-decision-v1.recipe.yaml:56-69`（WDM bindings）；`SPEC/methods/contracts/epistemic.toulmin_model.contract.yaml:9-14,59`；`main` HEAD `:1174-1235`（背景 thread 樣板 `_launch_interpretation`）。
- 改：新 `SPEC/methods/registry/method-human-required.yaml`（`decision.weighted_decision_matrix: [weights, scores, scale_min, scale_max]`、`epistemic.toulmin_model: [warrant, qualifier]`；檔頭一行：只列「沒有人就不存在正確值」的欄）；新 `COS/ai_lego/platform/workflow/human_required.py`（`load_human_required(spec_root)`，用 `display_catalog.py:15` 的 strict loader；未知 method id 或該方法 builder 無此參數 → `InvariantViolation`；`missing_human_required(workflow_ir, source)`：依 node bindings 把參數對到 source 路徑，缺或空值（None、""、[]、{}）即列入）；`main` `run_recipe`：在 `missing_source_paths` 檢查之後、journal 之前呼叫；`async` 非 bool → 400；`async:true` → 背景 thread 跑 `execute_workflow_ir`（樣板 `_launch_interpretation`），thread 內任何例外都要留下可讀的失敗（先查 executor／journal 有無既有「寫入失敗狀態」的函式並用它；沒有 → 停，§7 加列，不自創第二套狀態儲存）；`draft.py`：`draft_recipe_source` 對每站把該方法的 human_required 參數放進 `exclude_params`。新測試 `COS/tests/unit/test_human_required.py`（≥8 案）、`test_run_recipe_async.py`（≥6 案：202＋RUNNING、輪詢到終態、同步路徑行為與回傳不變、async 非 bool 400、背景例外可讀、human_required 缺 → 422 且無 journal 檔）。
- 不改：`main` 的 import 區、`get_ai_provider` 附近、interpret 區段（網站那批未提交，P-K8）；`executor.py`（I8 引擎零改動）；`dashboard.html`／`apps/cognitive-web`（前端「未填不准 run」歸網站線）。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_human_required tests.unit.test_run_recipe_async $(grep -rlE "apps\.api\.main|apps\.api import main|ai_gateway\.draft|ai_gateway import draft" tests/unit --include="test_*.py" | sed 's#/#.#g; s#\.py$##') -q 2>&1 | tail -1` → `OK`；golden exit 0。
- 突變（§6 P3 欄）：拔 `human_required` 檢查 → 空權重 run 案紅；`draft_recipe_source` 不傳 exclude → 「起草不填權重」案紅；async 在檢查前就開 thread → 「422 不寫 journal」案紅。
- commit：`feat(cognitive-os): recipe runs can go async (202 + existing status endpoint) and refuse to run while a human-only field is empty; AI drafting never fills those fields (P3 WC-02 early, C5)`。回滾：revert（`async` 預設 false、清單檔刪除即不擋）。

**WC-P3-03（提前）工作流總結 `WorkflowInterpretation`（模組＋typed object，不含端點）**（雲端 T35；01 合併後）
- 狀態：**已完成**；WorkflowInterpretation unit 11/11、golden 4261/4261、真實 SchemaContracts probe PASS、spec index fresh；未改 interpret、main、前端。
- 目標：C10 工作流部分：把各站的 `MethodInterpretation` 收成一份總結；引註 ⊆ 各站 manifest 聯集；使用者判斷是人的紀錄，由伺服器照抄，模型不寫。
- 讀：§3.4 C10（工作流段）、D20、D24、U18；`interpret_method_record.py` HEAD `:238-277`（兩次嘗試樣板，只讀）；`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml` HEAD（站的形狀，只讀）；01 的 `evaluate_citation_integrity`（P-e）。
- 改：新 `COS/ai_lego/modules/research/workflow_interpretation.py`：`run_workflow_interpretation(*, workflow_id, run_or_chain_id, stations:[{station_index, method_id, interpretation, manifest, judgment|None}], provider, schema_contracts, interpretation_id, language="zh-TW")`：模型只寫 `summary`、`final_recommendation{text, citations}`、`revision_conditions[]`、每站 `one_liner`；伺服器填 `stations[].{station_index, method_id, interpretation_id, confidence（取該站 findings 最低信心）, judgment（照抄 `{stance, text}` 或 null）}`、`citations_all`（各站 citations 聯集，不重排）、`usage_total`、`solution:null`（C11 在 P4）；閘：`stations_complete`（站數 = 輸入站數、index 連續、每站有 interpretation_id）、`citation_integrity`（呼叫 01 的函式，manifest = 各站聯集）、`no_preset_conclusion`（`revision_conditions` 至少 1 條；物件內無 `conclusion`／`verdict`／`correct_answer` 鍵）；兩次嘗試、token 累計。新 `SPEC/specs/cognitive/typed-objects/workflow-interpretation.schema.yaml`＋fixtures（`judgment` 只能是 null 或 `{stance∈agree|partial|disagree, text}`）；跑 `gen_spec_index.py`。新 `COS/tests/unit/test_workflow_interpretation.py`（≥10 案：三站成功、模型寫了 judgment → 伺服器覆蓋回人的紀錄、跨站越界引註 → 修復、缺站 → FAIL、零改判條件 → FAIL、token 累計、solution 為 null、confidence 取最低、schema 驗證、輸入站物件不被改動）。
- 不改：`interpret_method_record.py`、`main`、前端。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_workflow_interpretation -q 2>&1 | tail -1` → `OK`；golden exit 0；`gen_spec_index.py --check` exit 0。
- 突變：拔 `no_preset_conclusion` → 零改判條件案紅；judgment 改用模型輸出 → 覆蓋案紅；manifest 只取最後一站 → 跨站引註案紅。
- commit：`feat(cognitive-os): WorkflowInterpretation -- one summary over the stations, citations bound to every station's manifest, the user's judgment copied from the human record (P3 WC-03 early, C10)`。回滾：revert。

**WC-P2-06 synthesis 端點**（本機，P1 那條線；05 合併後）
- 狀態：**已完成並重驗（2026-09-30）**；既有提交 `63e96ffe6` 已覆蓋本卡 DoD，無需重做程式。
- 目標：`POST /projects/{id}/synthesis`（body `{kind, subject}`；202＋`synthesis_id`，背景 thread）、`GET /projects/{id}/synthesis/{sid}`（PENDING／DONE／FAILED）；`ai_usage` purpose `synthesis:<kind>`（成功與失敗都記）；事件 `SynthesisCreated`／`SynthesisFailed`（payload 只放 id／hash／計數，K8）；artifact 存 CAS；三契約 DRAFT → ACTIVE。
- 讀：`main` HEAD `:1174-1291`、`:1549-1595`；P-h。
- 樣板：`_run_interpretation`／`interpret_method`。
- 驗收：新 `tests/unit/test_api_synthesis.py`＋`main` importers（12.1-11 型樣 `apps\.api\.main|apps\.api import main`）→ `OK`
- 突變：worker 不記失敗用量 → 案紅；GET 別的 tenant → 404 案紅；零 Sources → 400 且不呼叫模型案紅。
- commit：`feat(cognitive-os): POST/GET /projects/{id}/synthesis -- background run, metered, gated artifact (P2 WC-06)`。回滾：revert。

**WC-P2-07a `literature_search` v2 adapter（不含 `main` 接線）**（本機 L1，`D:\tmp\wt-l1`；現在）
- 狀態：**已完成並重驗（2026-09-30）**；既有提交 `209b65221` 已覆蓋本卡 DoD，無需重做程式。
- 目標：有專案來源時 `literature_search` 回本專案 `source_class=academic` 的 active Sources，形狀與 offline 版相同，下游 `evidence.triangulation` 可引用；無專案來源 → 既有 offline fixture 原樣（§8 P4 刪）。
- 讀：`COS/ai_lego/apps/recipe_runtime.py:73-99`（錨點 `def build_registered_capability_adapters`；呼叫者 `main.py:125`、`COS/ai_lego/apps/cli/run_recipe.py:85`）；`COS/ai_lego/modules/research/evidence_triangulation.py:17-67`（`offline_literature_search` 輸出形狀、`_CITABLE_SOURCE_KINDS` `:22`）、`:70-120`（triangulation 如何讀 items）；`SPEC/recipes/validated/research-qualitative-v1.recipe.yaml:17-19,43-50`；`SPEC/capabilities/contracts/literature_search.capability.yaml`；`repo:564`（`list_sources`，欄位 `:163`）；P-K1、P-K9。
- 改：`recipe_runtime.py` `build_registered_capability_adapters` 加 kw-only `project_sources: list[dict] | None = None`（預設 None = 行為不變，兩個呼叫者不改）；非 None → 註冊 `evidence_triangulation.project_literature_search(project_sources)` 回的 adapter：`items[{literature_id: source_id, title, citation: canonical_url 或 source_uri, source_kind: "PROJECT_SOURCE", fetched_at, content_sha256, provenance: SOURCE_FACT／SOURCE_QUOTATION}]`，只收 `status='active'` 且 `source_class='academic'`；`retrieval.mode = "PROJECT_SOURCES"`、`freshness_claim` = 最舊 `fetched_at`；零筆 → `InvariantViolation("LITERATURE_NO_PROJECT_SOURCES")`（不默默退回 fixture）；`_CITABLE_SOURCE_KINDS` 加 `PROJECT_SOURCE`（triangulation 仍 `NEEDS_HUMAN_REVIEW`）；`literature_search.capability.yaml` description 補 project-backed 一句。新 `COS/tests/unit/test_literature_search_v2.py`（≥8 案：只回 academic、排除 superseded、零筆拋錯、None → offline 原樣、形狀與 offline 同鍵、triangulation 能引 PROJECT_SOURCE、`research-qualitative-v1` 以 in-process runtime 帶專案來源跑到 triangulation PASS、兩個既有呼叫者不帶參數行為不變）。
- 不改：`main.py`（07b）、`interpret_method_record.py`、任何 recipe YAML。
- 驗收：`cd Projects/internal/cognitive-engineering-os && python -m unittest tests.unit.test_literature_search_v2 $(grep -rlE "apps\.recipe_runtime|apps import recipe_runtime|research\.evidence_triangulation|research import evidence_triangulation" tests/unit --include="test_*.py" | sed 's#/#.#g; s#\.py$##') -q 2>&1 | tail -1` → `OK`；golden exit 0。
- 突變：不過濾 `source_class` → 案紅；零筆改回退 fixture → 案紅；`_CITABLE_SOURCE_KINDS` 拿掉 PROJECT_SOURCE → triangulation 案紅。
- commit：`feat(cognitive-os): literature_search returns the project's academic Sources when the run has a project (P2 WC-07a, P-K9)`。回滾：revert（預設 None，無呼叫者帶參數）。

**WC-P2-07b `run_recipe` 帶專案來源**（本機，P1 那條線；07a 合併且網站那批 commit 後）
- 目標：`main` `run_recipe` 有 `project_id` 時讀本專案 Sources 傳 `project_sources`（錨點 `def run_recipe`、`build_registered_capability_adapters(` `main.py:125`）；真跑 `research-qualitative-v1` 用真專案來源 PASS。
- ＋P-K11：academic 在寫入時標好（NA `source-class.ts`＋`sinks/cognitive.ts`＋其測試；COS `create_source` 有 DOI → academic；`source.schema.yaml:41` 描述）；NA 改動要 sg-deploy 才生效（High-STOP，隨 09 部署窗）。
- 驗收：`tests/unit/test_api_main` 相關案＋新案 → `OK`；NA `npx vitest run lib/collect/sinks` 綠；突變：不傳 `project_sources` → 真來源案紅；sink 不標 academic → 學術收集器案紅。

**WC-P2-08 interpret 改用共用閘**（本機，網站那條線；01 合併且結果頁這批 commit 後）
- 狀態：**已完成**，commit `b024d6474`；共用 `citation_integrity`、nested claim mutation sentinel、147 定向測試、golden 4255、spec index check 全綠；未改 executor、endpoint 或正式環境。
- 目標：P-K3：`evaluate_interpretation_gates` 的 `citation_integrity` 改呼叫 `gates.evaluate_citation_integrity`，刪內聯；gate id 與 FAIL 語意不變。現有合法輸出若有空 `citations` 的物件（P-b 會 FAIL）→ 停、回報，不放寬 P-b。
- **保留 interpret 專屬的數字規則**（`1fbb021fe` 起）：interpret 的 `citation_integrity` 另會 FAIL「發現寫了紀錄裡沒有的數字」（`interpret_method_record.py:245` `_numbers`、`:250` `_record_numbers`、evidence `unstated_numbers` `:359`）。改法 = 共用閘結果 AND 這條數字規則，合成同一個 gate id，evidence 保留 `unstated_numbers`；不得因換成共用閘而掉規則（掉了結果頁會再出現捏造的數字）。
- **已知（2026-09-26 第一波 critic S3）**：`SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml:134` recommendations 的 `citations` 無 minItems，prompt 樣板 `interpret_method_record.py:105` 就給 `"citations": []` → 換共用閘後現有合法輸出會 FAIL。開工前先定：recommendations 是 P-b 主張 → schema 加 minItems＋樣板改；不是 → 換鍵名（不帶 `citations` 即非主張）。兩者都不放寬 P-b。同卡把 `COS/ai_lego/modules/research/report_render.py` `_collect_citations`（P4-01 自寫的第二個 P-b 走訪）改用 `gates.iter_claims`（P-K3 單一定義）。
- 驗收：`test_interpret_method_record`＋`test_api_interpret` → `OK`；突變：共用閘拿掉 ⊆ → interpret 越界案紅；拿掉數字規則 → 捏造數字案紅。

**WC-P2-09 期末閘**（本機 Opus；部署 High-STOP）
- 狀態：**完成（2026-10-02）**；DOD-1～DOD-8 全有證據（DOD-2 見 WORKLOG 2026-10-02 續2，操作者同意新建真來源專案）。
- ① `/opt/cognitive-os` 部署（`deploy.sh`）；② 在 P1 的操作者專案（真 Sources）跑 `dossier_brief`：**目前阻塞，指定 project 不存在於 prod，禁止猜測替代**；③ 9 案真模型跑 harness → **已完成：9/9、scoring exit 0、thresholds 未設定**；④ CI 接線＋`COS/scripts/test-eval-harness.ps1`；⑤ §6 P2 三突變；⑥ `edd-research-evidence-v1` 用 v2 PASS；⑦ §0／§3.3（P-K1 兩列）／§5／§7 回填、TASKS 指針；⑧ 產 P3 卡（§12.9；P3-01 已完成的部分收一行）。
- 驗收目前：`P2_DOD` PASS=8/8。

### 12.9 P3 工作卡（P3-01／02／03 合併承接列）
**P3-01／02／03（已落地）**｜目標：完成問題路由、非同步 recipe＋`human_required`、WorkflowInterpretation 三個 P3 基礎切片；前置：P2-01 合併且 `run_golden_tests.py` 綠；讀：§3.3、§3.4 C5／C10、`COS/ai_lego/platform/workflow/human_required.py`、`COS/ai_lego/apps/api/main.py:735-863`、P3-01／03 舊卡的契約與 DoD；樣板：`WC-P2-01` 的 gate／typed object／golden 格式；不改：P2 引註契約、Recipe executor 核心、正式環境；交界：`route.method` 回傳最多 3 個可解析 method id，`run_recipe async:true` 回 202＋既有 status endpoint，WorkflowInterpretation 的 citations ⊆ 各站 manifest 聯集；驗收：P3-02 的 `test_human_required.py`／`test_run_recipe_async.py` 已有證據，P3-01／03 unit＋golden＋mutation 紅綠；突變：拔 resolvable／human_required／cross-station citation gate → 對應測試紅；回滾：逐卡 revert，不改既有 P2 artifact。
