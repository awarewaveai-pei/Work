# 藝術治療輔助工具清單（全 54 項）

2026-09-13。操作者提供的完整 54 項藝術治療常用引導工具——**這是未來 WordPress 外掛要做的完整範圍，不是只做缺的那 29 項**。已存在的 21+2 項也要一起納入外掛（不論是直接沿用現有 method_id，還是之後決定改包成藝術治療專屬版本），中文名／英文名／原始治療應用說明皆為操作者原文，保留以供之後寫 contract／shortcode 時直接引用。

## 完全沒有，需新建（29 項）

| 中文名 | 英文名 | 治療應用說明（操作者原文） |
|---|---|---|
| 生活系統圖 | Life System Mapping | 分析案主在家庭、工作、人際等生活面向中的角色與相互影響關係。 |
| 六頂思考帽 | Six Thinking Hats | 讓案主切換多元觀點：情緒、邏輯、批判、創意等，強化整合力。 |
| 轉折點分析 | Turning Point Analysis | 引導案主覺察生命中的關鍵轉折事件，探索其對情緒與信念的深層影響。 |
| 欣賞式探詢 | Appreciative Inquiry | 聚焦正向經驗與可能性進行改變。導向「什麼對你有用？什麼讓你前進？」的正向敘事轉化。 |
| 故事延續 | Story Completion | 設計「未說完的故事」讓案主接續完成，表達內在角色與感受動力。 |
| 框架轉換 | Reframing | 換角度詮釋痛苦經驗，重新定義「失敗／羞恥／後悔」。 |
| 創意限制 | Creative Constraints | 以限制媒材方式（只能用紅色、只能用左手）促發非慣性表達與創作彈性。透過限制激發更多創新思維。 |
| 設計思考 | Design Thinking | 透過同理、定義、發想、原型、測試解決問題（單一整合方法；階段性子方法已散見於 insight/framing/divergent/experiment 家族）。 |
| 水平思考 | Lateral Thinking | 跳脫邏輯慣性，以非線性方式解題。 |
| 衝突地圖 | Conflict Mapping | 回顧曾經的內外衝突，標示轉化路徑，形成資源記憶。 |
| 創新理論工具 | TRIZ | 系統化解決矛盾問題的方法論。面對看似矛盾的內在衝突，用「矛盾解決思維」打開出路。 |
| 推力與阻力分析 | Force Field Analysis | 分析促成與阻礙變革的因素。 |
| 供應者-輸入-流程-輸出-顧客 | SIPOC | 分析流程範圍與關鍵因素。 |
| 定義-測量-分析-改善-控制 | DMAIC | 用於六標準差中的品質改善流程。為重複性困擾建立流程診斷與精進計畫。 |
| 甘特圖 | Gantt Chart | 專案任務與時間進度管理工具。規劃具體行動時程表，適用目標分期計畫與行為追蹤。 |
| 流程圖 | Flowchart | 視覺化工作流程，找出瓶頸與改善點。將反覆出現的困擾歷程以步驟視覺化，觀察卡關處。 |
| 句點分析法 | Full Stop Method | 把思緒／情緒分段檢視，逐句拆解過度概括或情緒化句型。 |
| 同義詞替換 | Synonym Substitution | 調整負面語言習慣，例如將「我很糟」換成「我正在學習中」。 |
| 動機矩陣 | Motivation Matrix | 分析推動或阻礙行動的動機來源。 |
| 生命之輪 | Life Wheel | 評估生活各面向的平衡狀態。 |
| 未來羅盤 | Future Compass | 釐清未來目標與方向感。 |
| 價值觀排序 | Value Sorting | 釐清個人或團隊的核心價值。 |
| GROW 模型 | GROW Model | 設定目標與具體行動策略。 |
| 故事敘說 | Storytelling | 用敘事建構意義與共享經驗。 |
| 角色扮演 | Role Playing | 模擬角色行為以預測與反思。 |
| 視覺隱喻創作 | Visual Metaphor | 用圖像表達潛意識經驗，將模糊感受具象化，是非語言創作啟動工具。 |
| 隱喻對話 | Metaphor Dialogue | 與自創象徵角色進行對話，調和衝突、支持轉化。 |
| 價值澄清 | Value Clarification | 協助案主明確轉化過後最核心的價值與人生方向。 |
| 工作坊證章畫 | Workshop Certificate Drawing | 創作「療癒旅程完成證明」，象徵性封存與儀式性祝福。 |

## 部分有（2 項，非完全對應）

| 中文名 | 英文名 | 現有對應 | 差距 |
|---|---|---|---|
| 根本原因分析 | Root Cause Analysis | `root_cause.*` 整個家族（fishbone/five_whys/kepner_tregoe/bow_tie/barrier_analysis/event_tree/fault_tree/change_analysis/pareto） | 沒有單一通用「RCA」方法，只有具體技術；對案主而言可能已足夠，非真缺口 |
| 風險矩陣 | Risk Matrix | `delivery.risk_register` | 現有是風險登記表，不是嚴重性×機率的視覺化矩陣 |

## 已有可用，沿用或包裝現有 method_id（21 項）

| 中文名 | method_id | 治療應用說明（操作者原文） |
|---|---|---|
| 問題樹 | `decomposition.problem_tree` | 呈現問題的原因與影響，探索根源與結果。建構主要困擾的樹狀結構，整理表象與根源的關係。 |
| 冰山模型 | `systems.iceberg_model` | 分析表象行為背後的結構與信念。 |
| 魚骨圖 | `root_cause.fishbone` | 分析某問題背後的情境、情緒、人際等多因子因素。 |
| 五個為什麼 | `root_cause.five_whys` | 拆解困擾行為背後的成因，協助案主往下挖掘潛在問題。 |
| 邏輯樹 | `decomposition.logic_tree` | 拆解問題為層次子問題；梳理「我為什麼會這樣想／這樣做」的邏輯結構。 |
| SWOT分析 | `strategy.swot` | 引導案主評估自我或情境的優勢、劣勢、機會與威脅，以支持決策與自我理解。 |
| 成本效益分析 | `feasibility.cost_benefit_analysis` | 讓案主覺察「逃避 vs 面對」的代價與收穫。 |
| 心智圖 | `association.mind_map` | 讓案主自由描繪「當下感覺／混亂狀態」，視覺化初始情緒與感官語言。 |
| 腦力激盪 | `divergent.classic_brainstorming` | 快速大量產生點子與解方。 |
| SCAMPER | `divergent.scamper` | 作為鬆動內在框架的遊戲工具，刺激案主對自我表達方式的多元創想。 |
| 形態分析圖 | `association.morphological_analysis` | 組合不同元素生成新方案。 |
| 同理地圖 | `insight.empathy_map` | 建立對自我與他人的理解地圖，作為關係整理與祝福封存。 |
| 決策矩陣 | `decision.weighted_decision_matrix` | 協助案主選擇行動方案，評估利弊與可行性。 |
| PEST分析 | `strategy.pestel` | 評估外部情勢變化對策略的影響（PESTEL，範圍更廣）。 |
| 帕累托分析 | `root_cause.pareto` | 聚焦最重要的關鍵問題。 |
| PDCA | `learning.pdca` | 建立持續改善循環的生活練習策略。 |
| RACI矩陣 | `delivery.raci` | 在團體中釐清責任分工，適用於合作型目標規劃。 |
| FMEA | `challenge.fmea` | 分析未來行動可能遇到的阻礙與備案準備。 |
| SMART目標 | `framing.smart` | 制定具體可衡量的可行目標。 |
| 經驗旅程圖 | `insight.journey_map` | 描繪體驗過程與問題接觸點。 |
| 時間線／反向時間軸 | `foresight.backcasting` | 建立過去－現在－未來的因果脈絡（從未來目標倒推）。 |

**總計 21（已有）+ 2（SWOT 重複變體：原始清單第 36 項「優劣勢、機會威脅分析 SWOT」與第 58 項「個人 SWOT」皆對應 `strategy.swot`）+ 2（部分有，見上方章節）+ 29（需新建）= 54 項全數涵蓋。2026-09-17 訂正：原寫 31 為算術錯誤，表格本來就是 29 列。**

## 建置進度（2026-09-17 起）

29/29 DONE 2026-09-17。通用方法放各自自然家族（不塞進 art_therapy），藝術治療專屬的放 `art_therapy.*`；共用 kit：`ai_lego/core/domain/record_kit.py`、`ai_lego/apps/cli/method_slice.py`、`tests/unit/method_testkit.py`。每個方法：contract + typed-object schema + module（builder + 2 gates）+ `run_<name>_slice.py` + `tests/unit/test_<name>.py` + contract-backlog tier_1 entry。

| method_id | 中文 | 狀態 |
|---|---|---|
| `art_therapy.life_wheel` | 生命之輪 | DONE 2026-09-17 |
| `art_therapy.turning_point_analysis` | 轉折點分析 | DONE 2026-09-17 |
| `art_therapy.story_completion` | 故事延續 | DONE 2026-09-17 |
| `art_therapy.conflict_mapping` | 衝突地圖 | DONE 2026-09-17 |
| `art_therapy.full_stop_method` | 句點分析法 | DONE 2026-09-17 |
| `art_therapy.synonym_substitution` | 同義詞替換 | DONE 2026-09-17 |
| `art_therapy.motivation_matrix` | 動機矩陣 | DONE 2026-09-17 |
| `art_therapy.value_clarification` | 價值澄清 | DONE 2026-09-17 |
| `art_therapy.storytelling` | 故事敘說 | DONE 2026-09-17 |
| `art_therapy.role_playing` | 角色扮演 | DONE 2026-09-17 |
| `art_therapy.visual_metaphor` | 視覺隱喻創作 | DONE 2026-09-17 |
| `art_therapy.metaphor_dialogue` | 隱喻對話 | DONE 2026-09-17 |
| `art_therapy.workshop_certificate_drawing` | 工作坊證章畫 | DONE 2026-09-17 |
| `divergent.six_thinking_hats` | 六頂思考帽 | DONE 2026-09-17 |
| `divergent.lateral_thinking` | 水平思考 | DONE 2026-09-17 |
| `divergent.triz` | TRIZ | DONE 2026-09-17 |
| `divergent.creative_constraints` | 創意限制 | DONE 2026-09-17 |
| `divergent.design_thinking` | 設計思考 | DONE 2026-09-17 |
| `framing.reframing` | 框架轉換 | DONE 2026-09-17 |
| `framing.grow_model` | GROW 模型 | DONE 2026-09-17 |
| `framing.future_compass` | 未來羅盤 | DONE 2026-09-17 |
| `framing.value_sorting` | 價值觀排序 | DONE 2026-09-17 |
| `systems.life_system_mapping` | 生活系統圖 | DONE 2026-09-17 |
| `systems.force_field_analysis` | 推力與阻力分析 | DONE 2026-09-17 |
| `systems.sipoc` | SIPOC | DONE 2026-09-17 |
| `systems.flowchart` | 流程圖 | DONE 2026-09-17 |
| `learning.dmaic` | DMAIC | DONE 2026-09-17 |
| `learning.appreciative_inquiry` | 欣賞式探詢 | DONE 2026-09-17 |
| `delivery.gantt_chart` | 甘特圖 | DONE 2026-09-17 |


## 部分對應項處理（2026-10-02）

2026-10-02 重驗：本機 API `/methods` 列出上方 53 個 method_id 全在且有中英文顯示資料。原清單的 2 項「部分有」加上 2 項當時算「已有」但實際只部分對應的，處理如下：

| 項目 | 處理 | 落點 |
|---|---|---|
| 根本原因分析 | 新增工作流：問題陳述（須標 validated）→ 魚骨圖 → 五個為什麼 ＋ 帕累托；後兩步吃魚骨本身的假設集 | `recipes/validated/root-cause-analysis-v1.recipe.yaml`；首頁掛在「這件事為什麼一直發生」 |
| 風險矩陣 | `delivery.risk_register` 結果頁 ② 改畫 5×5 機率×衝擊格子圖，格子由紀錄數字直接算，不經 AI | COS `apps/cognitive-web/components/result/RiskMatrix.tsx` |
| 時間線／反向時間軸 | 新建治療用方法，取代原對應的 `foresight.backcasting`（只能從未來倒推、沒有過去） | `art_therapy.life_timeline`（contract＋schema＋module＋slice＋test） |
| 個人 SWOT | 操作者選新建案主版（2026-10-02）：四格各至少一項、每項寫一個真實時刻（取代 `strategy.swot` 每項必填的地理範圍／時間／來源（Atlas L1332）與知識庫輸入）、最後用一個優勢接一個機會並寫第一步 | `art_therapy.personal_swot`（contract＋schema＋module＋slice＋test） |
