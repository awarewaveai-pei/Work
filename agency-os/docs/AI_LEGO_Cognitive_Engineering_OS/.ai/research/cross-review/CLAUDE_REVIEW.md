# CLAUDE_REVIEW — 三母規格獨立架構審查（Claude 方）

**日期**：2026-08-29
**獨立性聲明**：本檔在 Codex 獨立分析**啟動後、輸出返回前**完成寫檔。內容完全基於 Phase 0 workflow（3 全文 readers + 2 cross-analysts + 3 對抗式 verifiers）與本人對文件的直接閱讀；未參考任何 Codex 產出。Codex 收到的 prompt 不含本檔任何內容（僅三文件路徑＋中性問題集，並明令禁讀 `.ai/` 與 WORKLOG）。
**證據基準**：[../phase-0/document-hashes.yaml](../phase-0/document-hashes.yaml) 的 2026-08-28 snapshot。

---

## PART A — Defect Findings

**SSOT**：[../phase-0/verified-findings.yaml](../phase-0/verified-findings.yaml)——71 條，每條含 file:line + verbatim quote + 對抗式 verifier verdict（62 CONFIRMED / 6 PARTIAL / 3 LINE_MISMATCH 已修正行號）。此處不重抄，只列 13 條 high：

| ID | 一句話 |
|---|---|
| CROSS-T-1 / CROSS-R-1 | Atlas 被兩個檔名引用，多數（10 處 MUST-resolve）指向不存在的 `v1_2_zhTW` |
| CROSS-T-2 / CROSS-R-2 | MP 授權表 anchor 自稱不存在的 `v2_1` 檔名 |
| CROSS-T-3 | `risk_tier` 兩套不相容 enum（`low..critical` vs `R0–R4`），gate injection 機器上不可觸發 |
| CROSS-T-4 / CROSS-R-6 | Execution Manifest（30 年 replay 核心）3–4 套不相容 schema |
| CROSS-T-5 / CROSS-R-4 | 「Atlas 讀不到」同一條件兩個強制狀態碼，皆不在 side-state 詞彙表 |
| CROSS-T-6 | Epistemic label 詞彙三版本（11 空格 / 11 SNAKE_CASE / 6 值＋禁止混合） |
| CROSS-T-9 | 衝突裁決 precedence chain 本身定義兩次且已漂移（6 層 vs 8 層） |
| CROSS-R-3 | 核心 capability 的 I/O 型別 `MethodExecutionRequest`/`TypedMethodResult` 三文件無定義 |
| CROSS-R-5 | Release gate 集合實質不同（MP 11 項 vs Atlas 14+6 項） |

**分佈判讀**：71 條中 duplicate_definition（11）＋ inconsistent_id（11）＋ term_conflict（5）＋ contradiction（6）合計 33 條 = **近半數是「同一機制多處定義且漂移」**。理念層（Human-led / Evidence-centered / Local-first / Typed LEGO）零矛盾。

## PART B — Architecture Assessment

### B1. 健全且可建（as written）

- **Method Atlas 是三份中最接近可機器化的**：24-primitive kernel、F01–F24 目錄、284 方法全可編目、selection engine 輸入有 enum、method contract 有固定段式。缺的是型別層（見 B2），不是結構。
- **EC 的執行生命週期骨架完整**：Boot Contract → Task Packet → State Machine → Gates → Manifest → Handoff，狀態與 side-state 有明文詞彙表；把它翻成 schema 的工作量可估。
- **Scoped Authority 的「概念」是對的**（不用單一文件霸權、分 scope 裁決）——壞的是實作（兩套版本＋anchor 指向不存在檔案），概念本身應保留。
- 核心原則（Simple Core + Stable Contracts + Replaceable Adapters + Measured Extraction；Capability→Port→Resolver→Policy→Adapter；Trusted Compute；Human 一級 actor）內部一致且與 30 年目標相容。

### B2. 過度指定（over-specified）

- **MP 以敘事文體立法了一個平台艦隊**：30 domains、94 components、7 個 UI 工作空間、Intelligence Council / Conflict Engine / Role Assembly / Epistemic Engine / Data Science Plane……每一個單獨都是一個產品。文件把「願景敘事」與「規範要求」混寫，正是 directive 警告的 examples masquerading as requirements 的溫床（實例已登錄：EC §91–94 path trees 無約束力限定詞，finding DOC-execution_contract-11）。
- **MP §90 的 22 份 pre-MVP 規格**全部尚未存在——以文件現狀，「開工前先寫 22 份規格」本身就是 30 年紀律的反面（大爆炸式文件工程）。Phase 2 應裁剪為「最小 machine-readable 核心」。

### B3. 不足指定（under-specified，實作會立刻撞牆）

1. **型別系統**：Typed LEGO 宣稱 static type check，但全部 typed objects（12+ 種）只有 3 種有定義（DOC-method_atlas-7、CROSS-R-3）。
2. **兩文件接縫**：EC `task_context` → Atlas `selection_context` 缺 7 個必要欄位且無映射（CROSS-T-16）。
3. **Execution Manifest schema**（CROSS-T-4）——replay/audit/rollback 全部承諾都掛在它上面。
4. **Jurisdiction Pack**：被授權表引用為法律效力來源，無 schema、無路徑、無定義（DOC-execution_contract-5）。
5. **Section Registry / Normative Context Bundle**：EC 的 index-based retrieval 支柱，無 schema（CROSS-T-18）；且其前提（heading 結構乾淨）已被 4 處 stray H1＋未閉合 fence 破壞。

### B4. 若明天照文件直接實作——Top 5 風險

1. **Boot 即死**：忠實實作 Boot Contract 的 agent 因 10 處 MUST-resolve 指向不存在檔案，第一步即 `DOCUMENT_RESOLUTION_BLOCKED`。
2. **每個 validator 都是未授權架構決策**：三組 load-bearing enum 各有多版本——實作者選哪版都構成 silent policy bypass，違反文件自己的紅線。
3. **治理 split-brain**：兩套 precedence chain＋MP 授權模型沒有 EC 位置——未來任何文件修改的合法性都無法裁決，收斂機制先於系統失效。
4. **文件漂移複利**：v1 零實作前雙維護機制已漂移 7 組；15k 行敘事作為 authority 而無 machine-derivation pipeline，30 年尺度下 drift 是保證發生。
5. **承諾與能力倒掛**：30 年 replay/rollback/audit 的全部承諾依賴 manifest＋型別＋enum 三者，而三者恰是最缺的——先建功能後補契約會讓歷史資料永久不可 replay。

### B5. Phase 2 收斂方向建議（供比較，非決定）

優先序：**vocabulary/enum 抽出單一 machine SSOT** →（依賴它）**Execution Manifest schema 統一** → **authority model 修復（ADR-1：單一 precedence chain＋三文件都入表）** → 檔名/引用清理（OQ-2 已裁決 v1 canonical）→ 型別層補齊（只補 vertical slice 需要的最小集合）。MP §90 的 22 份規格裁剪為此最小集。

## PART C — Open Questions

SSOT：[../phase-0/open-questions.yaml](../phase-0/open-questions.yaml)（OQ-1~11；OQ-2 已由操作者裁決 v1 = canonical）。本審查追加候選（待與 Codex 結果合併後正式編號）：

- MP 的敘事段落（願景/例子）與規範段落（MUST/紅線）需要一個明文的 normative-strength 標記系統嗎？（現況兩者不可區分，是 examples-as-requirements 的根因）
- 22 份 pre-MVP 規格清單是否降級為「Phase 3+ 按需產生」？
- Atlas §8 總表與 §11 詳解的逐字重複（6 組表格）——哪邊是 SSOT？
