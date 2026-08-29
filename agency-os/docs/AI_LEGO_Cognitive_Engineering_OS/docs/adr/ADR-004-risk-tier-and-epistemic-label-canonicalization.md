# ADR-004: risk_tier 與 epistemic/provenance label 收斂為 Schema-Anchored 正交 Enum

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯）。**含 Gate Injection 觸發範圍擴大（critical→R3∪R4）之明確認可**：本 ADR 自己已誠實標註此為語意變更非純重命名（見 Consequences 段）；裁決理由——Atlas §14.2 的 Mandatory Gate Injection 清單（Evidence Matrix/Counterevidence/Red Team/Human Specialist Review/Reversal Criteria）語意上對應 EC R3+R4 的聯集，只映射到 R4 會讓 DB Migration、Identity/Authorization 變更等 R3 級操作漏掉本該有的保護；Phase 0 稽核確認無任何實作依賴舊空格式列舉值，遷移成本低。此為**關閉既有保護缺口**，非新增未經論證的範圍。
Date: 2026-08-29

## Context

Phase 0 對抗式驗證（71 findings，Claude×Codex 雙模型交叉覆核，0 DISAGREE）確認三母文件對兩組機器可讀 enum 各自表述不一致，且無任何文件提供轉換映射：

**risk_tier**（CROSS-T-3 / CROSS-R-10，both CONFIRMED，2 independent votes）
- Atlas `selection_context.risk_tier: low|medium|high|critical`（L1077），Mandatory Gate Injection 觸發條件 `risk_tier = critical`（§14.2 L3588-3599）
- Execution Contract（EC）`task_context.risk_tier: ...`（L374，未宣告值域），實際值域定義在 `# 8. Risk Tier`（L379），R0（L381）～R4（L454）五級，每級附具體範例與強制動作清單
- Atlas 全文 grep 確認：`low|medium|high|critical` 四個字面值除 L1077 宣告外，僅 `critical` 在 L3599 被消費一次；`low/medium/high` 從未被任何條件式引用。**Atlas 的四級是未展開的占位符，EC 的五級是唯一有實質語意的定義。**

**epistemic / provenance label（四套版本，Cross-Review 才發現第 4 套）**

- MP §83「最重要的內容原則」（L3380-3393）：6 值 `SOURCE FACT / AI INFERENCE / AI SUGGESTION / HUMAN OPINION / CALCULATED RESULT / UNKNOWN`（值於 L3385-3390），「禁止混合」（L3393）
- Atlas「Epistemic Type 必須分離」（L591-605）：11 值空格式，值於 L594-604：`SOURCE FACT / EVIDENCE / ASSUMPTION / HYPOTHESIS / AI INFERENCE / AI SUGGESTION / HUMAN OPINION / CALCULATED RESULT / SIMULATED RESULT / UNKNOWN / DECISION`
- EC §38「AI Output Trust Boundary」（L1469-1487）：同 11 值但 SNAKE_CASE，值於 L1476-1486
- **MP §12.1「記錄內容來源」（L992-1002，值於 L995-1001）：7 值 authorship 標籤 `HUMAN ORIGINAL / AI GENERATED / AI SUGGESTED / HUMAN EDITED / HUMAN APPROVED / SOURCE QUOTATION / CALCULATED RESULT`**（訂正：原任務摘要引用 4 個代表值，逐行核對後實際為完整 7 值；`CALCULATED RESULT` 與 §83 清單完全重複——**同一字串在 MP 自己內部同時代表兩種不同語意軸，是 Master Plan 內部自我碰撞，不只是跨文件漂移**）
- 比對後發現：MP §83 的 6 值 = Atlas/EC 11 值的**嚴格子集**（拼字、大小寫皆一致），只是少了 `EVIDENCE / ASSUMPTION / HYPOTHESIS / SIMULATED RESULT / DECISION` 五項。三套「epistemic type」詞彙並非三個互斥設計，而是同一詞彙表的三種完整度/大小寫變體。MP §12.1 才是真正正交的第二軸（回答「誰產生/處理了這段內容」而非「這是哪種認知宣稱」）。

**FACT 提升紅線引用不存在的值**：Atlas §21 強制規則 #2（L4151）`UNKNOWN 不得提升為 FACT`；EC §38 禁止區塊（L1489-1495）`UNKNOWN → FACT`。兩處引用的裸字 `FACT` 在任一份文件的任一 enum 中都不存在（只有 `SOURCE FACT` / `SOURCE_FACT`）。此紅線目前無法被機器檢查器實作。

**LOCKED_FACT/LOCKED_DECISION**（CROSS-R-11，CONFIRMED，2 independent votes，同一問題的延伸）：EC §57（L1988-1990）`` `LOCKED_FACT` / `LOCKED_DECISION`：不得由 AI 修改 ``（SNAKE_CASE，兩個鎖定目標）；MP §11.3「Locked Fact」（L970-978）僅 `LOCKED FACT`（空格式，值於 L975），且 MP 自己的 6 值 epistemic type 清單本來就沒有 `DECISION` 這個概念——MP 在自己的詞彙表下本來就無法表達「鎖定一個決策」，這不是漏寫，是 §83 詞彙表本身的完整度缺口所致。

**治理依據**：EC 自己的 Scoped Authority 表（L96-109）第 6 列明定：「Exact Schema / Enum / Runtime Contract」的權威來源是「Approved machine-readable specs」（L106）——**不是** Master Plan、不是 Atlas、也不是 EC 本文。本 ADR 的正確修法範疇不是「三選一決定哪份文件的 prose 獲勝」，而是「兩份文件目前都在 prose 裡越權定義了本該屬於 /specs/ 的 exact enum」。

## Decision Drivers

1. **機器可判定性**：Mandatory Gate Injection 與 FACT 提升紅線目前都是「寫了但編譯器/檢查器無法實作」的死條款——因為引用的值不存在於任何 enum。任何方案必須讓這兩條規則變得可實作。
2. **Single source of truth**：同一枚舉不能有兩個平行定義各自漂移；EC L106 已經把這個不變量寫進文件自己的治理表，只是尚未被遵守。
3. **30 年可維護性**：casing 差異（space vs SNAKE_CASE）是零語意成本的機械修正；cardinality 差異（4 vs 5、6 vs 11）與正交軸混淆（epistemic type vs authorship）才是需要人類裁決的語意問題——兩類問題不應用同一種修法處理。
4. **既有語意保留**：Atlas 的 Mandatory Gate Injection 與 MP/Atlas 的 authorship 追蹤都是真實需求，收斂方案不能把這些需求做丟，只能重新安放到正確的位置。
5. **Migration blast radius 最小化**：兩份文件目前的用法都極淺（Atlas 的 low/medium/high 從未被消費；MP 的 authorship 7 值也只出現在單一小節）——遷移成本目前很低，越晚修越貴。

## Sub-decision (a): risk_tier — Options Considered

| Option | 內容 | 優點 | 缺點 |
|---|---|---|---|
| **A. 保留兩套 + 正式映射表** | Atlas 保留 low/medium/high/critical，EC 保留 R0-R4，中間插一張映射表 | 改動面最小 | 4→5 映射本質上有損；Atlas 的 gate injection 語意實際對應 EC R3+R4 的**聯集**而非 R4 單一級，硬映射到 critical→R4 會漏掉本該有的 Red Team/Counterevidence |
| **B. 全系統改用 EC 的 R0-R4，Atlas 廢棄自己的四級**（推薦） | Atlas `risk_tier` 型別改為 `R0\|R1\|R2\|R3\|R4`；Gate Injection 觸發條件從 `risk_tier = critical` 改為 `risk_tier IN {R3, R4}` | R0-R4 是全文唯一有具體標準+動作清單的定義；grep 證實 Atlas 自己的四級除 critical 外從未被消費，遷移成本趨近零；解決 gate injection 語意錯位 | Atlas 措辭需小幅改寫；「low/medium/high/critical」比 R0-R4 直覺，需 UI 層補顯示名稱 |
| **C. 全系統改用 Atlas 的四級，EC 廢棄 R0-R4** | 反向遷移 | 無 | EC 的 R0-R4 是全文唯一附具體標準與強制動作的定義，廢棄它等於把僅存的可執行內容也丟掉；不予考慮 |
| **D. Status Quo** | 不動 | 零改動成本 | Gate Injection 與後續任何機器實作永久卡死；不合格 |

## Sub-decision (b): epistemic/provenance labels — Options Considered

| Option | 內容 | 優點 | 缺點 |
|---|---|---|---|
| **A. 兩個正交 enum + 定義共存方式**（推薦） | `epistemic_type`（11 值 SNAKE_CASE，以 EC §38 為底）+ `authorship_state`（6 值，以 MP §12.1 為底，移除誤植的 CALCULATED_RESULT 重複項）；每個內容物件同時攜帶兩欄位 | 精確對應「這是哪種認知宣稱」vs「誰產生了它」兩個真實存在、彼此獨立的問題；MP 的 6 值證實是 11 值的子集，收斂零語意流失；解決 MP 內部 CALCULATED RESULT 自我碰撞 | 需要修正三處 prose，改動面比純 casing 修正大 |
| **B. 全收斂成 MP 的 6 值** | 只留 6 值 | 改動面最小 | 丟失 EVIDENCE/ASSUMPTION/HYPOTHESIS/SIMULATED RESULT/DECISION 五個已在 Atlas 大量方法定義中使用的概念；完全不處理 authorship 軸，LOCKED_DECISION 依然無所依附；不合格 |
| **C. 全收斂成 EC 的 11 值，authorship 標籤降為 UI 顯示層** | authorship 7 值不進 machine enum | 改動面較小 | 「可證明人類主導 authorship」是 MP §12 明文治理目標，若 authorship 不進機器 enum，就無法被機器稽核/查詢，等於把治理目標本身降級；不採用 |
| **D. Status Quo** | 不動 | 零改動成本 | FACT 提升紅線與 LOCKED_DECISION 永久無法實作；MP 內部 CALCULATED RESULT 自我碰撞持續存在；不合格 |

## Method Used

跨文件術語調解（cross-document terminology reconciliation），三步驗證法：
1. **Enum diffing**：逐值比對四套詞彙表的字面內容，確認 MP 6 值 ⊂ Atlas/EC 11 值（拼字完全一致，只差 casing），排除「三套詞彙代表三種設計意圖」的可能性，定性為「同一詞彙表的完整度/大小寫漂移」。
2. **正交性測試**：對 MP §12.1 七值逐一自問「它回答的是不是與 epistemic_type 相同的問題？」——`HUMAN ORIGINAL`回答「誰做的」，`SOURCE FACT`回答「這是什麼類型的宣稱」，兩者可獨立變化，判定為正交軸。唯一例外是 `CALCULATED RESULT`——同時符合兩個問題的措辭，判定為誤植而非刻意雙軸值。
3. **消費點稽核**：grep 全文確認每個候選值是否真的被下游邏輯讀取，區分「活著的定義」與「未展開的占位符」。

無需額外 Decision Matrix 方法（Atlas 內建的 Weighted Decision Matrix / Classification Method 是內容型 LEGO 積木，非用於文件治理決策），採一般架構比較已足夠支撐本案判斷。

## Recommendation（含具體映射表）

**(a) risk_tier → Option B**：EC 的 R0-R4 成為唯一 canonical enum，實際值域定義從 EC §8 抽出成 `/specs/execution/risk-tier.schema.yaml`。

*Migration crosswalk*（僅用於歷史敘事文字轉譯或外部系統換算，非執行期雙向轉換表）：

| Atlas 舊值（廢棄） | EC 新值 | 換算依據 |
|---|---|---|
| `low` | `R0` 或 `R1`（依是否可自動執行判斷） | EC R0/R1 範例對應 Atlas 低風險情境 |
| `medium` | `R2` | EC R2 範例對應 Atlas 中風險常見情境 |
| `high` | `R3` | EC R3 範例對應 Atlas 高風險敘述 |
| `critical` | `R4`（**且 Gate Injection 觸發條件同時擴大為 R3 ∪ R4**，非僅 R4） | Atlas §14.2 gate injection 清單（Evidence Matrix/Counterevidence/Red Team/Human Specialist Review/Reversal Criteria）逐項比對 EC R3+R4 要求的**聯集**才完整覆蓋——若只映射到 R4，會讓落在 R3 的操作（如 DB migration、Identity/Authorization 變更）漏掉本該有的 Red Team/Counterevidence，這是需要向操作者明示的語意變更，非純粹改名 |

**(b) epistemic/provenance labels → Option A**：兩個正交 enum，同樣抽出成 `/specs/governance/epistemic-label.schema.yaml`：

```yaml
epistemic_type:  # 11 值，SNAKE_CASE，以 EC §38 為底（Atlas 空格式全部替換為底線，零語意改動）
  - SOURCE_FACT
  - EVIDENCE
  - ASSUMPTION
  - HYPOTHESIS
  - AI_INFERENCE
  - AI_SUGGESTION
  - HUMAN_OPINION
  - CALCULATED_RESULT
  - SIMULATED_RESULT
  - UNKNOWN
  - DECISION
  # 互斥：每個內容物件恰好一個值

authorship_state:  # 6 值，以 MP §12.1 為底，移除誤植重複項 CALCULATED_RESULT
  - HUMAN_ORIGINAL
  - AI_GENERATED
  - AI_SUGGESTED
  - HUMAN_EDITED
  - HUMAN_APPROVED
  - SOURCE_QUOTATION
```

*共存方式*（每個內容/claim 物件的最小 provenance record）：

```yaml
provenance:
  epistemic_type: <11 值之一，必填，恰一個>
  authorship_state: <6 值之一，必填，恰一個>
  locked: null | LOCKED_FACT | LOCKED_DECISION   # 選填，正交第三欄
    # 約束：locked=LOCKED_FACT 僅在 epistemic_type=SOURCE_FACT 時合法
    #       locked=LOCKED_DECISION 僅在 epistemic_type=DECISION 時合法
```

範例：AI 幫忙算出的一個尚待人類核可的數字 → `{epistemic_type: CALCULATED_RESULT, authorship_state: AI_GENERATED, locked: null}`；人類核准鎖定的決策 → `{epistemic_type: DECISION, authorship_state: HUMAN_APPROVED, locked: LOCKED_DECISION}`。

**LOCKED_FACT/LOCKED_DECISION 修法**：EC 的 SNAKE_CASE 兩值組成為 canonical；MP §11.3 的 `LOCKED FACT`（L975）機械轉 `LOCKED_FACT`，並補一句「`LOCKED_DECISION` 語意同 `LOCKED_FACT`，鎖定對象為 epistemic_type=DECISION 的內容」——此修正之所以現在才可行，正是因為 (b) 已把 `DECISION` 補進 MP 可用的 epistemic_type 詞彙。

**FACT 提升紅線修法**：
- Atlas L4151：`` `UNKNOWN` 不得提升為 `FACT` `` → `` `UNKNOWN` 不得直接提升為 `SOURCE_FACT`；合法路徑僅有：經 Compute 產生證據 → `EVIDENCE`，或經 Human Validation 確認 → `SOURCE_FACT`，兩者皆須寫入 authorship_state 與 execution manifest。``
- EC L1489-1495：同步修正，`UNKNOWN → FACT` 改為 `UNKNOWN → SOURCE_FACT`（禁止直接跳轉），並列出上述合法路徑。

## Consequences

**正面**：Mandatory Gate Injection 與 FACT 提升紅線首次變得機器可實作；單一 schema 歸屬消除未來雙寫漂移風險；LOCKED_DECISION 首次有清楚定義；MP §12 的 Authorship & Integrity Plane 治理目標獲得獨立、可查詢的機器 enum 支撐。

**負面 / 風險**：Gate Injection 觸發條件從「critical 單一值」擴大為「R3 ∪ R4」是**語意變更**而非純重命名——需操作者明確認可這個擴大；三份母文件都需要小幅 prose 修改，需通過 OQ-6 已定案的 `.ai/proposals/<n>-<slug>/` 流程逐案審批；Atlas 與 EC 的 casing 統一是所有下游已用空格式解析內容的既有工具的 breaking change——但 Phase 0 稽核未發現任何實作依賴這些空格值，遷移成本評估為低。

## Migration / Rollback

**Migration 步驟**（每步走 OQ-6 proposal 流程，需操作者逐案批准）：
1. 新建 `/specs/execution/risk-tier.schema.yaml` 與 `/specs/governance/epistemic-label.schema.yaml`。
2. Atlas L1077 `risk_tier` 型別改指向 schema；L3599 Gate Injection 條件改為 `risk_tier IN {R3, R4}`——**此步驟需操作者明確確認語意擴大是否可接受**，若不接受則退回 Option A 並補一張有損映射表，屬另一次獨立決策。
3. Atlas L594-604、MP L3385-3390 的空格式 11/6 值機械轉 SNAKE_CASE 並改為指向 schema（低風險，純字串替換）。
4. MP §12.1（L992-1002）移除 `CALCULATED RESULT`（第 7 值），改指向 `authorship_state` schema。
5. 修正 Atlas L4151、EC L1489-1495 的 FACT 紅線措辭。
6. 修正 MP L975、EC L1988 的 LOCKED_FACT casing 統一 + LOCKED_DECISION 定義補齊。
7. 每步完成後跑 R4「聲稱即驗證」：grep 確認舊值在三份母文件中歸零或已明確標註為「historical/narrative reference only」。

**Rollback**：三份母文件已有 git baseline；任一步驟需回退時，`git revert` 對應 commit 即可，因每步都是獨立小改動（單一 proposal = 單一 commit），不存在跨步驟耦合。schema 檔案為新增檔案，回退等同刪除，無其他依賴方。

## Evidence

**risk_tier**：
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1077`（selection_context）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3588-3612`（§14.2 Mandatory Gate Injection）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:931`（Change Risk Matrix 方法定義，佐證 risk_tier 應為衍生輸出而非文件內硬編列舉）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:374`（task_context.risk_tier）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:379-475`（§8 Risk Tier，R0 L381／R1 L393／R2 L410／R3 L429／R4 L454）
- `verified-findings.yaml` CROSS-T-3、CROSS-R-10：two independent verdict_votes each CONFIRMED

**epistemic/provenance labels**：
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3380-3393`（§83，6 值）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:992-1002`（§12.1，7 值，含重複的 CALCULATED RESULT）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:591-605`（Epistemic Type，11 值空格式）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1469-1495`（§38 AI Output Trust Boundary，11 值 SNAKE_CASE + 禁止區塊）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4148-4151`（§21 強制規則 #2）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1988-1990`（§57 LOCKED_FACT/LOCKED_DECISION）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:970-978`（§11.3 Locked Fact，空格式單值）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:96-109`（Scoped Authority 表，L106）
- `verified-findings.yaml` CROSS-T-6、CROSS-R-11：three/two independent verdict_votes CONFIRMED
- `open-questions.yaml` OQ-7、OQ-8（已含 Codex CDX-7 第 4 套詞彙更新）
- `cross-review/CONVERGENCE_MATRIX.md` §1（CDX-5 risk_tier AGREE；CDX-7 epistemic/provenance AGREE + Codex 新增第 4 套詞彙證據）

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改。
