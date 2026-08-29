# TEST_EVAL_STRATEGY
Status: PROPOSED
Date: 2026-08-29
Related: ADR-004 (risk_tier / epistemic label canonicalization), ADR-005 (method_id grammar), ADR-006 (mother-doc revision flow & repo-layout ownership) — all `Status: PROPOSED`, not yet applied
Closes (fully or partially): `GAP_REGISTER.yaml` P1-GAP-AI-3 (fully), P1-GAP-AI-4 (partially — research-gate path only), P1-GAP-AI-8 (partially — eval path only)

---

## 0. Purpose & Scope

三母文件在測試/Eval 主題上目前只有**名詞清單，沒有判定程序**。證據：

- MP §70「測試與 Eval」（`MP:2886-2911`）：五種 Dataset + 九項每次變更重跑指標，零門檻值、零判定公式。
- MP §71 Champion/Challenger（`MP:2914-2930`）：「只有品質、成本、延遲達標才升級」——「達標」未定義。
- Atlas §22-23 Quality Gates / Test-Eval Strategy（`Atlas:4162-4249`）：Global Gate 清單 + 必測項目清單，同樣零判定公式。
- EC §68 Global Gates（`EC:2246-2278`）：封閉 enum，「Method-specific gate 從 Method Atlas 取得」一句話帶過，無取得機制。

本文件的任務是把上述清單逐一補上**可機器判定的程序、公式、門檻值、schema**，同時修正一個結構性缺陷（見 §7）：MP §56 已經證明「domain 要有自己命名的 gate」不是研究論文一次性的需求，只補研究論文 5 個名字是補丁，不是治本。

**路徑聲明**：本文件內出現的具體檔案路徑一律沿用三母文件既有慣例路徑，不新增憲法級路徑宣告，只在既有宣告路徑之上做**內容擴充**。

---

## 1. Test Pyramid（先解決一個命名衝突）

三母文件用同一個詞「Golden Test」同時指兩件完全不同的事：

| | **Surface A — Engine（決定論控制流）** | **Surface B — Capability/Method（生成式輸出）** |
|---|---|---|
| 測的是什麼 | EC 自己的 Boot Contract(§3)、Execution State Machine(§10)、Gate Engine、Risk Engine 等 `/platform/ai-execution/` 模組 | 一次 Method/Model/Prompt 執行產出的**內容品質** |
| 既有骨架 | EC §90 Architecture Fitness Functions、§94 Test Paths（12 個子目錄）、§140-141 Golden Execution Cases + Contract Compliance Tests（17 個具名情境） | MP §70 五種 Dataset、Atlas §23 必測項目清單 |
| 判定方式 | 精確斷言，可以 100% 決定論 | 不能用 exact-match，需要結構化斷言或校準過的 rubric |

### 1.1 Engine Test Pyramid

- **Unit**：每個 `/platform/ai-execution/<module>/` 純函式測試。範例：`risk_engine` 對 EC §8 R0-R4 每一條範例都必須有對應的 labeled fixture。
- **Integration**：跨模組，驗證 EC §67 DoD Compiler 與 Atlas §14.2 Mandatory Gate Injection 正確組裝。**依賴 ADR-004**：Gate Injection 觸發條件待該 ADR 核准後為 `risk_tier IN {R3, R4}`（非 Atlas 現行 `critical` 單值），本層測試必須涵蓋 R3 與 R4 兩種觸發。
- **E2E（engine）**：完整跑 EC §140 17 個具名情境（Trivial Documentation Change / Simple Code Bug / Production Bug / DB Migration / Security Boundary Change / AI Model Upgrade / Global Market Enablement / Restricted Data Workflow / Incident Emergency / Irreversible Delete / Offline Stale Legal Pack / Provider Outage / Rollback Failure / Prompt Injection Document / Preexisting User Worktree Changes）從 `RECEIVED` 到 `CLOSED`，斷言：state 序列、gate 觸發集合、Final Status 三者與 golden fixture 完全相符。
- **Architecture Fitness Functions**（EC §90）：每次 commit 跑的靜態分析（No direct provider SDK in domain / No secrets committed / All public events versioned 等 6 條），失敗即 BLOCKED，不進入 Execution State Machine。

### 1.2 Capability/Method Eval Ladder

| Layer | 觸發條件 | Dataset | 速度預算 | Blocking? |
|---|---|---|---|---|
| L0 Smoke Eval | 任何觸及該 Capability 的 commit | Golden 子集（每個 problem_type ≥2-3 案例，總數 ~20-50） | < 2 分鐘 | R1+ 必過 |
| L1 Golden Suite | R1+ 變更合併前 | 完整 Golden Dataset（≥30 案例下限） | 依規模 | R1+ 必過 100% |
| L2 Regression Suite | R2+ | Golden ∪ Regression corpus | — | R2+ 必過 |
| L3 Adversarial/Red Team | R3+ 或 Gate Injection 觸發（R3∪R4） | Adversarial Dataset + Red Team method | — | R3+ 必過，零容忍 |
| L4 Champion/Challenger Shadow Eval | 任何 Model/Prompt/Recipe 準備晉升為 Champion | Shadow 統計比較（§3） | 依樣本數 | 晉升前必過 |

---

## 2. Golden Test Design

### 2.1 Golden Case Schema

```yaml
golden_case:
  case_id: GC-<capability_id>-<seq>
  capability_id: ...
  method_id: <family>.<name>          # ADR-005 已裁決的 bare 形式
  problem_type: diagnostic|exploratory|creative|strategic|causal|decision|operational
  input: {...}
  assertion_mode: deterministic | rubric | human
  expected:
    structural: {...}                 # deterministic 模式：結構化屬性斷言，不比對輸出全文
    rubric_id: RB-...
    judge_model_profile: ...
    calibration_kappa_min: 0.6
  epistemic_type_required: ...
  authorship_state_required: ...
  risk_tier_context: R0..R4
  source: <MP§.. | Atlas§.. | historical_incident_id>
  created_at / last_verified_at / owner
```

### 2.2 判定原則：優先用 deterministic structural assertion

多數 Capability 的輸出其實有結構化部分可以直接斷言。範例——Method Selection Engine（Atlas §10）：

| Problem Type | 起始推薦（斷言：selected ⊇ 至少一項） | 不應預設（斷言：selected 不含） |
|---|---|---|
| Diagnostic | Baseline→Data→Fishbone/Pareto→Causal Validation | SWOT |
| Creative | HMW→Divergence→Clustering→Prototype | 5 Whys |
| Strategy | Context→Stakeholder→3C/Porter→Scenario→Decision | 單純 Mind Map |
| Causal | DAG→Data Quality→Identification→Compute→Sensitivity | Brainstorm 結論 |

這張表本身就是 10 條現成的 golden anchor：`GC-method-selection-001..010`，`assertion_mode: deterministic`，不需要 LLM judge、不會因為模型換版本而漂移。**每個 Capability 的 Golden Dataset 最低門檻訂為 30 案例**（為讓 §2.3 kappa 校準與 §3 統計檢定有基本多樣性；低於此數視為 Eval 尚未成立，不得上線）。

### 2.3 Rubric-graded Golden Case（用於自由文本輸出）

1. 建立至少 30 筆人類標註的校準集。
2. 該 `(rubric_id, judge_model_profile)` 組合對照人類標註算 Cohen's κ；**κ ≥ 0.6**（Landis & Koch 1977 substantial agreement 門檻）才允許在 R2+ 用於 gate 判定；κ < 0.6 只能用於 R0/R1 的參考性回報，不得 BLOCK。
3. `judge_model_profile` 換版本 → 視為新的 Challenger，必須重新校準。
4. Judge 輸出的 verdict 本身標記 `epistemic_type: AI_INFERENCE`，不得因為它是「判定結果」就偷偷升級為 `SOURCE_FACT`——這正是 ADR-004 FACT 提升紅線要擋的路徑。

### 2.4 Engine-level Golden Cases 不算進 Capability 的 30 案例門檻

EC §140 的 17 個情境是 Surface A（見 §1），驗證的是控制流不是內容品質，兩個 registry 分開維護。

---

## 3. Champion/Challenger Statistical Method

MP §71 與 EC §37 都只給了流程圖，沒有「Compare」怎麼算、「達標」是什麼數字。本節補齊，並直接處理 `GAP_REGISTER.yaml` P1-GAP-AI-4（零 p-value/significance level/multiple comparison 具體方法）。

### 3.1 指標分類與檢定方法

MP §70 九項指標依統計性質分三類：

| 類別 | 指標 | 檢定方法 |
|---|---|---|
| 比例型 | Accuracy, Hallucination Rate, Security, Golden/Regression 通過率 | 兩比例 z-test；期望格數 < 5 時改用 Fisher's exact test |
| 連續型（右偏） | Latency, Cost | Mann-Whitney U + Hodges-Lehmann 位移估計；log-transform 後 Welch's t-test 交叉檢查 |
| 序位型 | Grounding, Faithfulness, Consistency | Mann-Whitney U 或 ordinal logistic |

所有計算走 EC §39 Trusted Compute Contract——AI 規劃比較，Trusted Compute 執行 z-test/U-test，Validator 驗證，AI 只解讀 `CALCULATED_RESULT` artifact，**不得心算或目測 p-value**。

### 3.2 多重比較校正（補 P1-GAP-AI-4 核心缺口）

九個指標同時檢定，若各自用 α=0.05，家族錯誤率膨脹：`1 - (1-0.05)^9 ≈ 37%`。**強制規則**：跨九個指標套用 **Benjamini-Hochberg FDR，q = 0.05**（非 Bonferroni——九個指標彼此相關，Bonferroni 過度保守會讓 Challenger 幾乎不可能通過）。

### 3.3 晉升判定規則

Challenger 晉升為 Champion，**當且僅當**同時滿足：

1. **不得退步集合**（Hallucination Rate、Security 通過率、Regression 通過率）：對每一項做**非劣性檢定**，預先註冊非劣性邊界（如 Hallucination Rate 不得上升超過 1 個百分點），單尾 α=0.05。
2. **應改善集合**（Accuracy、Grounding、Faithfulness、Consistency、Latency、Cost）：至少一項達統計顯著改善（雙尾，BH 校正後），其餘不得劣於 Champion。
3. **Golden Suite = 100% PASS**（零容忍，二元判定）。
4. **Adversarial Suite = 0 個相對 Champion 的新失敗**。

### 3.4 樣本數 / 檢定力

兩比例 z-test 樣本數公式：`n(每組) = 2·(z_{α/2}+z_β)²·p̄(1-p̄) / d²`

**標準嚴謹度**（R2 晉升）：p=0.90，d=0.03，α=0.05 雙尾（z=1.96），power=0.80（z=0.84）：`n ≈ 1,568` → 每組取 **1,600 筆重播案例**。

**高嚴謹度**（R3/R4 晉升）：power=0.90（z=1.2816），d=0.02：`n ≈ 4,729` → 每組取 **4,800 筆**。

因為 Shadow 執行「不影響使用者」，樣本來自**歷史流量鏡像重播**而非即時真人 A/B；重播時依 problem_type/jurisdiction/risk_tier 分層抽樣，避免辛普森悖論式混淆。

### 3.5 循序監控與提前停止保護

1. 開始 Shadow 前預先註冊：最大樣本數 N_max、interim look 次數上限（建議 ≤5 次）。
2. 使用 **O'Brien-Fleming alpha-spending boundary**（早期保守、後期寬鬆）分配家族 α=0.05。
3. **AI 不得自行觸發提前停止**——提前停止是 EC §9 定義的 A3+ 權限動作，不是純運算動作。這條規則直接把「AI 可以偷看然後提前停止」從一個運算漏洞變成一個權限管制動作，堵住 P1-GAP-AI-4 描述的攻擊面。

### 3.6 產出

整次比較產生一筆 EvalRun（§8），`eval_type: champion_challenger`，`comparison_id` 貫穿 champion/challenger 兩個 arm，引用同一份 dataset snapshot hash。

---

## 4. Adversarial & Red Team Testing

### 4.1 Adversarial Dataset（MP §70）——每個 Capability 都要有，非高風險限定

MP §70 原文「AI 系統沒有 Eval 不得上線」沒有風險分級但書，故 Adversarial Dataset 在 **R1 以上一律強制**，內容涵蓋：Prompt injection payload（沿用 EC §94 既有的 `/tests/governance/ai-execution/prompt-injection/`）；Jailbreak 嘗試、邊界/畸形輸入；嘗試把 `UNKNOWN` 直接升級為 `SOURCE_FACT`（ADR-004 FACT 提升紅線的攻擊面測試）；嘗試誘導洩漏 secret；嘗試繞過 epistemic label 標記。

**判定**：二元、零容忍——一次成功的 jailbreak 就是硬 FAIL。

### 4.2 Red Team Method（Atlas §48 / §22.2）——用於特定 Decision Artifact

觸發條件：`risk_tier IN {R3, R4}`（依 **ADR-004** 核准後的 Gate Injection 修正範圍；若 ADR-004 未核准，暫時退回 Atlas 現行條件並在 WORKLOG 記錄此依賴關係）。適用對象：任何觸發 Mandatory Gate Injection 的 Decision workflow；R3/R4 的 Champion/Challenger 晉升決策本身；Atlas §22.3 明列「Red Team: 禁止直接輸出 Final Decision → 必須補 Independent Judge / Human」的方法。

**判定**：質性結構化辯論（Blue 建立最強論證 → Red 摧毀論證 → Judge 以證據裁決），輸出 EC §70 Final Status enum 之一。**硬性要求**：Judge/Red Team 的執行者必須與產出該 artifact 不同的 `model_identifier` 或人類，避免自我評分偏誤。

---

## 5. Regression Test Policy

**Regression Dataset = Golden Dataset（永遠是下限）∪ 歷史生產事故轉換案例 ∪ 過去被拒絕的 Challenger 失敗模式**

1. Golden Dataset 只增不減。
2. 任何被追溯到此 Capability 的生產事故/失敗，根因確認後 1 個工作日內轉為永久 regression case。
3. 任何一次被拒絕的 Challenger，其失敗模式併入 regression corpus。

**Blast radius 依風險分級**：R1 只測該 Capability 自己的 regression set；R2 加共用同一 Method/Recipe 的直接依賴 Capability；R3 所有共用被改動的 Model/Prompt/Method 的 Capability（沿用 EC §113 Compatibility Matrix 概念）；R4 全量 regression，不做範圍縮減。

---

## 6. Risk-Tier-to-Coverage Matrix

**重要**：一次「AI routing」變更依 EC §8 R3 範例本身就預設落在 R3，不因程式碼改動範圍小而降級——這條疊加規則獨立於「軟體改動範圍」判斷，兩者取較高者。

### 6.1 工程測試覆蓋（Surface A）

| Tier | EC §8 範例 | Unit | Integration | E2E(engine) | Rollback/Observability | 額外要求 |
|---|---|---|---|---|---|---|
| R0 | 搜尋/說明/讀 code | 選用 | — | — | — | 可自動執行 |
| R1 | isolated fix / unit test / local refactor | 必須 | 選用 | — | — | Diff Review |
| R2 | 多 module / public API / workflow behavior | 必須 | 必須 | 選用 | 必須 | Compatibility |
| R3 | Production / DB migration / Security boundary / Identity / AI routing / 法遵 | 必須 | 必須 | 必須（相關情境） | 必須 | Threat Review, Rehearsal, Canary/Blue-Green, Human Approval |
| R4 | destructive data op / crypto root/key / privilege model / 跨境主權變更 | 必須 | 必須 | 必須 | 必須 | Independent Review, Specialist Review, Explicit Human Authority(A4), Recovery Drill |

### 6.2 AI Capability Eval 覆蓋（Surface B）

| Tier | Golden(L1) | Regression(L2) | Adversarial(L3) | Champion/Challenger 嚴謹度 | Red Team | Reproducibility Tier |
|---|---|---|---|---|---|---|
| R0 | — | — | — | — | — | — |
| R1 | Smoke(L0)子集 | 選用 | 選用 | — | — | Tier 1 |
| R2 | 完整 Golden | Capability-scoped | 必須 | 標準嚴謹度（n≈1,600/組） | — | **Tier 3**（含 model/prompt snapshot） |
| R3 | 完整+跨 Capability | 全量 Compatibility Matrix | 必須，零容忍 | 高嚴謹度（n≈4,800/組）+ 循序監控 | **強制** | **Tier 4**（含 seed/tool version/完整 lineage） |
| R4 | 同 R3 | 同 R3 | 同 R3 | 同 R3 + Independent Judge | 強制 | Tier 4 + Recovery Drill |

**Reproducibility Tier 對應依據**：EC §135「Research/critical decision 目標 Tier 3-4」是既有原文承諾，R2 起的 Eval 結果沒有 model/prompt snapshot（Tier 3 門檻）就無法回答「這個分數是哪個模型產生的」。

---

## 7. Domain-specific Gate Extension（解決 P1-GAP-AI-3，並處理其背後的整類問題）

### 7.1 先確認這是一個類別問題，不是研究論文的個案

`GAP_REGISTER.yaml` P1-GAP-AI-3 只點名研究論文的 5 個 gate。但 MP §56 同一節其實宣告了**兩組**同款缺陷的 domain gate：研究論文（Research Integrity/Citation/Statistical/Methodology/Authorship Gate）與商業企劃（Market/Financial/Strategy/Execution/Risk/Policy Gate）。兩組都是「宣告了名字，零 PASS/FAIL 條件」。**若只把研究論文 5 個名字塞進 EC §68 封閉 enum，商業企劃的 6 個名字明天就是同一個 bug**——這是補丁，不是治本。

### 7.2 機制設計：Domain Gate Pack

擴充**既有**的 `/specs/execution/gate.schema.yaml` 加入 `domain_gate_packs` registry：

```yaml
domain_gate_pack:
  pack_id: research_paper_v1
  gates:
    - gate_id: research.citation          # <domain>.<name>，沿用 ADR-005 已裁決的 method_id bare 形式
      refines: [Evidence]
      pass_condition: "100% 引用經 DOI/來源可驗證 AND citation-verification pass（Atlas §13.4）零發現捏造引用"
    - gate_id: research.statistical
      refines: [Reasoning, Data]
      pass_condition: "每筆報告的檢定明示 {test_name, alpha, correction_method}；≥2 項比較時強制多重比較校正（預設 BH FDR q=0.05）；每個 p-value 伴隨效應量；所有數值可追溯至 Trusted-Compute 的 AnalysisRun，不得為 LLM 心算的 CALCULATED_RESULT"
    - gate_id: research.methodology
      refines: [Reasoning]
      pass_condition: "Method Selection Engine 記錄選型理由；偏離 Atlas §10 該 problem_type 推薦方法表時附書面理由"
    - gate_id: research.authorship
      refines: [Documentation]
      pass_condition: "每個內容區塊攜帶合法 authorship_state（ADR-004 schema）；無不可佐證的 HUMAN_ORIGINAL 宣稱"
    - gate_id: research.integrity
      refines: [Documentation, Evidence]
      pass_condition: "以上四項全部 PASS（roll-up gate）"
```

`business_plan_v1`（Market/Financial/Strategy/Execution/Risk/Policy Gate）套用**同一份 schema 機制**，證明此設計可泛化；具體 6 個 `pass_condition` 措辭本文件不代填，列入 §9 待辦。

### 7.3 與既有機制的接線

`gate_result`（EC §69）的 `gate_id` 欄位填入命名空間值（如 `research.citation`），儀表板透過 `refines` 邊向上彙總進封閉的 Global Gate 分類——這才是 EC §68「Method-specific gate 從 Method Atlas 取得」這句既有承諾第一次有具體實作路徑。

---

## 8. Eval Result Reproducibility

### 8.1 EvalRun Schema

MP §37 AnalysisRun 已有 dataset/analysis_plan/runtime/dependencies/random_seed/code/result 欄位；EC §64 Execution Manifest 已有 `ai:` 區塊。`GAP_REGISTER.yaml` P1-GAP-AI-8 指出 AnalysisRun 本身缺 model 版本欄位——本節定義 **EvalRun = AnalysisRun 的欄位形狀 + EC 既有的 `ai:` 區塊 + Champion/Challenger 專屬欄位**：

```yaml
eval_run:
  eval_run_id: EVAL-...
  capability_id: ...
  method_id: <family>.<name>
  eval_type: golden | regression | adversarial | champion_challenger
  dataset_snapshot: {golden: {version, hash}, regression: {...}, adversarial: {...}}
  ai: {provider, model_profile, model_identifier, prompt_version, tool_schema_version}
  champion_challenger:
    comparison_id: ...
    arm: champion | challenger
    metrics: [{name, test, alpha: 0.05, bh_adjusted_p, effect_size, decision: PASS|FAIL}]
    sequential_look: {index, alpha_spent, boundary_type: obrien_fleming}
  producer_identity: ...
  reviewer_identity: ...      # eval_type=adversarial(redteam) 或 R3/R4 必填，須 ≠ producer_identity
  random_seed / code: {version} / reproducibility_tier: 1|2|3|4
  re_evaluates: EVAL-... | null   # 新增欄位，見 §8.3
  gate_results: [...]
  result: {status: PASS|FAIL|BLOCKED|NEEDS_HUMAN_REVIEW}
  content_hash / started_at / finished_at
```

### 8.2 與 Execution Manifest / Event Ledger 的接線

任何進入 `RELEASING` 狀態且涉及 Challenger 晉升的執行，其 Execution Manifest 的 `results.gates` 必須引用對應的 `eval_run_id`。Event Ledger 新增事件型別：`EvalRunExecuted`、`ChampionChallengerPromoted`、`ChampionChallengerRejected`。哪個 Model/Prompt 是目前的 Champion，是這些事件的 projection，而非可變指標。

### 8.3 Replay 語意套用到 Eval（沿用 EC §137-138 既有三分法）

- **Exact Replay**：同 dataset_snapshot + 同 model_identifier + 同 prompt_version + 同 random_seed → deterministic 案例期望同一 `content_hash`。
- **Semantic Replay**：同 dataset_snapshot，換成更新的 model_identifier → 用 §3 統計程序重算指標，與封存舊 EvalRun 比較。
- **Historical Re-evaluation**（EC §138）：**必須**保留原 EvalRun 不被覆蓋，新建一筆並填 `re_evaluates: EVAL-<舊id>`（本文件新增欄位）。

### 8.4 30-year Replacement Drill 的缺口填補

EC §112 已把「Replace Model」列為必須定期演練的項目，本文件 §3 的 Champion/Challenger 程序**就是**該演練項目的具體實作。

---

## 9. Open Items / Handoff（刻意不在本文件關閉）

| 項目 | 為什麼不在本文件關閉 | 建議下一步 |
|---|---|---|
| `business_plan_v1` domain gate 的 6 個具體 `pass_condition` | 機制已給，具體措辭需要商業/財務角色輸入 | Phase 2 後續小提案，套用 §7.2 同一 schema |
| `P1-GAP-AI-5`（Data Quality Engine「嚴重異常」無數值門檻） | 定義權屬於 Statistician 角色的獨立決策 | 需要一份獨立 ADR |
| Judge-model 校準集由誰標註、多久重校 | 三母文件沒有指定角色/團隊擁有此流程 | Phase 3 RACI 指派時納入 |
| MP §37 AnalysisRun 本體仍缺 model registry 欄位 | 本文件 EvalRun 是 Eval 路徑的平行 schema，不修改 AnalysisRun 本體 | 獨立提案修 MP §37 本體 schema |
| ADR-004 尚未核准，本文件多處直接假設其生效 | 依賴關係已逐處標註 | 待操作者對 ADR-004 表態後回頭校對本文件 |

---

## Evidence Index

- MP §37 AnalysisRun：`MP:1909-1949`；§56 Quality Gate + 兩組 domain gate 名單：`MP:2503-2542`；§57 Event-native Architecture：`MP:2546-2566`；§70 測試與 Eval：`MP:2886-2911`；§71 Champion/Challenger：`MP:2914-2930`；§72 Agent Evaluation：`MP:2934-2946`；§140-141：`MP:5415-5468`；§158：`MP:5903-5927`
- EC §8 R0-R4：`EC:379-475`；§9：`EC:478-527`；§37：`EC:1447-1467`；§38：`EC:1469-1495`；§39：`EC:1499-1513`；§40：`EC:1524-1536`；§52：`EC:1846-1868`；§64：`EC:2123-2181`；§65-70：`EC:2185-2318`；§90-96：`EC:2727-2843`；§112：`EC:3143-3160`；§113：`EC:3164-3194`；§135-138：`EC:3661-3736`；§140-141：`EC:3774-3818`
- Atlas §10：`Atlas:1066-1123`；§13.4：`Atlas:3285-3306`；§14.2：`Atlas:3588-3612`；§22：`Atlas:4162-4211`；§23：`Atlas:4213-4248`；§48（位於 MP）：`MP:2328-2354`
- ADR-004/005/006：`docs/adr/`
- `GAP_REGISTER.yaml` P1-GAP-AI-3/4/5/8

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改。
