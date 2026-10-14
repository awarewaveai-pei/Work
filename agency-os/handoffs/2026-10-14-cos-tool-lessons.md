# COS 工具說明書＋完整課程（2026-10-14 交接，進行中）

**操作者決定**：做共用模板 + 「17 條工作流」裡的工具（13 條使用者工作流、34 個工具，清單見下）；課程要**完整版**（跟冰山一樣：開始卡、認識、看例子、怎麼填、看懂結果、教材版、來源，五個領域的例子）。

**已完成（2026-10-14 續19）**：`COS/docs/mockups/lessonkit.py` = 課程產生器（驗證 SHAPE＋渲染；一個 render 兩種輸出：冰山示意稿 `<main>`、網站 `lessons.generated.ts`）＋ `toolsheets.generated.ts`（`UNIT_FACTS` 結果頁 ④⑥ 與冰山圖、`KNOWLEDGE_GAPS`／`NO_LESSON` 結果頁頂端「知識不足」）。lessons v1（冰山）已 promote（LEDGER 2026-10-14T10:29:14Z，證據 `agency-os/reports/evolution/lessons-v1-golden.txt`：除狀態列與兩筆來源連結外逐位元相同）。sync／check-mocks／selftest 已接。細節 WORKLOG 2026-10-14（續19）。

**下一張卡：根本原因分析 4 個工具試做 = lessons v2**（v1 不可改；建議模型：結構改動 Opus／Sonnet，課文 Haiku 5.5＋人審）
1. 先改 `lessonkit.SHAPE`：`units.items[].result` 改選填（`"?result"`）。規則：只有結果頁「一個單位一張卡」的工具（單位 = 表單欄位，key 相同，像冰山四層）才寫 result；`gaps()` 對「有 result 的工具」檢查每個單位都有。魚骨／五個為什麼／柏拉圖的單位不是表單欄位 → 不寫 result。
2. `evolution/lessons/v2.yaml` = v1 全文（`version: v2`）＋ `framing.problem_statement`、`root_cause.fishbone`、`root_cause.five_whys`、`root_cause.pareto`（工作流 `recipes/validated/root-cause-analysis-v1.recipe.yaml` 的站序）。形狀照 `lessonkit.SHAPE`；五領域故事接冰山的（D18：edd 主動分享 6→2、partner 畫廊延後付款、decision 加開平日班、ecom 退貨率 12%、daily 週日晚上吵架）。
3. 來源：每工具 ≥2 個真網址（`curl -sL -o /dev/null -w %{http_code}` = 200），工具資料權威網址先用（display-metadata `url`：問題陳述 wikipedia、魚骨 asq.org/quality-resources/fishbone、五個為什麼 wikipedia、柏拉圖 asq.org/quality-resources/pareto）；每個來源至少被一段課文 `<cite>[n]</cite>`。查不到的來源不寫網址、不編。
4. 預覽給操作者：v2 未 promote 前網站不會出現。需要一個預覽出口（`lessonkit.load("v2")` 已可讀候選版）：把 v2 每個新工具 render 成獨立頁（design-system.css＋tabs/chip 腳本）→ Artifact 發給操作者看。
5. 操作者同意 → `python -m ai_lego.apps.cli.evolution promote --kind lessons --version v2 --evidence <檔>` → sync → check-mocks 綠 → web tsc/vitest → 部署（High：先問）→ 其餘 30 個。
- 驗收：`python docs/mockups/check-mocks.py` 綠；`check-mocks-selftest.py` mock 段全抓（page 段紅是 TASKS「結果頁快照 fixture 過期」，非本卡）；`npx tsc --noEmit`＋`npx vitest run components/result components/LessonView.test.tsx lib/lessons.test.ts` 綠。

**34 個工具 id**：divergent.random_stimulus association.mind_map framing.problem_statement art_therapy.visual_metaphor art_therapy.metaphor_dialogue framing.reframing art_therapy.value_clarification feasibility.break_even feasibility.npv strategy.swot strategy.tows strategy.porter_five_forces strategy.business_model_canvas insight.empathy_map strategy.market_analysis strategy.three_c strategy.pestel strategy.stp finance.financial_assumptions foresight.scenario_planning delivery.risk_register framing.okr delivery.outcome_roadmap feasibility.tco feasibility.unit_economics epistemic.assumption_mapping epistemic.evidence_matrix epistemic.toulmin_model decision.weighted_decision_matrix research.qualitative_coding evidence.triangulation root_cause.fishbone root_cause.five_whys root_cause.pareto（其中 research.qualitative_coding、evidence.triangulation 沒有示範案例）。

**未解**：冰山來源 [1]「The Systems Thinking」查不到出處，沒有網址（M8 靠 [2][3] 兩個網址過）；操作者若記得原文網址，寫進 v2。
