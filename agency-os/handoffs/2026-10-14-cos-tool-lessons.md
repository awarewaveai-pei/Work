# COS 工具說明書＋完整課程（2026-10-14 交接，未完成）

**操作者決定**：做共用模板 + 「17 條工作流」裡的工具（13 條使用者工作流、34 個工具，清單見下）；課程要**完整版**（跟冰山一樣：開始卡、認識、看例子、怎麼填、看懂結果、教材版、來源，五個領域的例子）。

**設計（已定，照計畫 D17／D23／D25、I11 M1–M12，不另起系統）**
- 資料 = 已登錄的可演化 kind `lessons`：`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/evolution/lessons/v1.yaml`（尚未 promote，沒有 champion；runtime 還沒讀它）。已寫好 `systems.iceberg_model` 一份，內容逐字取自 `COS/docs/mockups/iceberg-lesson-mock.html` 與 `apps/cognitive-web/components/result/MethodVisual.tsx` 的 `ICEBERG_LAYERS`（units[].result）。
- 產生器（下一步要寫）：`COS/docs/mockups/lessonkit.py`，同一份資料兩種輸出：mock 模式（冰山示意稿，連結指 artifact）與 web 模式（直接網站路由，其他工具用）。驗收：①冰山 mock 由資料重產後與現檔逐位元相同；②冰山 web 模式輸出 == 現在 `lessons.generated.ts` 裡冰山那段。基準備份在 session scratchpad `lessons/iceberg-before.html`、`lessons-before.ts`（也可用 git show HEAD 取得）。
- 之後：結果頁 ④⑥ 改讀 `units[].result`（所有有資料的工具，不再 `iceberg ?` 寫死）→ M1–M12 檢核 + 結果頁／課程頁頂端「知識不足：缺哪幾項」（目前沒有實作）→ 試做「根本原因分析」4 個工具（問題陳述、魚骨圖、五個為什麼、柏拉圖），來源要真網址（M8）→ 給操作者看 → promote lessons v1（`ai_lego.apps.cli.evolution`，寫 LEDGER）→ 部署 → 其餘 30 個。
- 相關機制：`docs/mockups/mockkit.py`（`render_web_lessons`、`export_lesson`、`web_target`、`LESSON_TABS`、`render_chips`）、`sync-design-system.py`、`check-mocks.py`；領域清單 `methods/examples/domains.yaml`（edd／partner／decision／ecom／daily）。

**34 個工具 id**：divergent.random_stimulus association.mind_map framing.problem_statement art_therapy.visual_metaphor art_therapy.metaphor_dialogue framing.reframing art_therapy.value_clarification feasibility.break_even feasibility.npv strategy.swot strategy.tows strategy.porter_five_forces strategy.business_model_canvas insight.empathy_map strategy.market_analysis strategy.three_c strategy.pestel strategy.stp finance.financial_assumptions foresight.scenario_planning delivery.risk_register framing.okr delivery.outcome_roadmap feasibility.tco feasibility.unit_economics epistemic.assumption_mapping epistemic.evidence_matrix epistemic.toulmin_model decision.weighted_decision_matrix research.qualitative_coding evidence.triangulation root_cause.fishbone root_cause.five_whys root_cause.pareto（其中 research.qualitative_coding、evidence.triangulation 沒有示範案例）。

**建議模型**：設計與產生器 Opus 5.5；課文起草（純資料）Haiku 5.5＋人審。
