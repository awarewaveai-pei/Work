# PROPOSED_ARCHITECTURE_CHANGES
Status: PROPOSED
Date: 2026-08-29
Author: Claude（統籌彙整，非新分析——本文件把 6 份 Round 1 ADR 的 Recommendation 轉成具體的母文件修改提案清單）

## 0. 目的與格式

本文件是 Phase 2 STOP-FOR-HUMAN-REVIEW 交付物之一，把六份 ADR 的抽象建議轉成 ADR-006 §Sub-decision(a) 定義的 `.ai/proposals/<NNN>-<slug>/` 執行單位。**本文件本身不是提案，是提案的索引與依賴排序**——每個提案的完整 PROPOSED_CHANGE/RATIONALE/SOURCE_DOCUMENT/AFFECTED_SECTIONS/DEPENDENCIES/COMPATIBILITY/MIGRATION/ROLLBACK/EVIDENCE 九欄位，待對應 ADR 被操作者批准後，才依序展開成正式提案檔案。

**前提**：任何一項在此列出的修改，在對應 ADR 轉為 `Status: ACCEPTED` 之前不得執行。操作者可以批准部分 ADR、駁回其他——本清單依 ADR 分組，批准哪組就展開哪組，互不連坐。

---

## 1. 提案清單（依來源 ADR 分組）

### 來自 ADR-001（Scoped Authority 裁決鏈統一）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-001 | missing_contract | 新檔 | 新建 `Architecture-Constitution-v1.md`（沿用 MP §90 L3785 已預留檔名），內容三塊：唯一裁決鏈、唯一文件職責表、MP §135 No Legal Hallucination Rule |
| P-002 | duplication_removal | Master Plan §0.0.2（L60-84） | 六層裁決鏈全文替換為 3 行指標，指向 Architecture-Constitution-v1.md |
| P-003 | duplication_removal | Master Plan §90 item 1（L3785） | 確認已滿足（新檔已建），移除「待建」措辭 |
| P-004 | duplication_removal | Execution Contract §2/§2.1（L90-137） | 八層裁決鏈與授權表全文替換為 3 行指標 |

**依賴**：P-002/P-004 依賴 P-001 先完成（新檔必須先存在才能指標指向它）。**影響範圍**：解決 CROSS-T-9、CROSS-R-12（OQ-9）、CROSS-R-13。

### 來自 ADR-002（GDPR 刪除權 vs 事件不可變）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-005 | missing_contract | Master Plan §148（Encryption & Key Sovereignty） | 新增「Per-Subject DEK 生命週期」小節 |
| P-006 | missing_contract | Execution Contract §27（Event/Messaging Contract） | 定義加密欄位 envelope 格式：`cipher_alg/kek_ref/dek_wrapped/iv/ciphertext/classification_tag` |
| P-007 | boundary_clarification | Execution Contract §31（Data Deletion Contract） | 新增分支：「個資刪除（crypto-shred）」與「一般 production row 刪除」為兩種不同 Verification 定義 |
| P-008 | missing_contract | Master Plan §57（Event-native Architecture） | Event 清單旁標註哪些既有 event type 含 Confidential/Restricted 分級欄位；新增 `PersonalDataRedacted` 事件 |

**依賴**：無跨提案依賴，四項可平行進行。**影響範圍**：解決 P1-CONFLICT-1。**額外必要修改（Data Architecture Plan §6 發現）**：crypto-shred 觸發時需連動 `DeleteDerivedProjections(subject_id)`，建議併入 P-007。

### 來自 ADR-003（Tenant 模型 + CAS 隔離）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-009 | missing_contract | Master Plan §3（產品核心物件） | 新增 Domain Model 物件 #23：Tenant，schema 見 ADR-003 §Sub-decision(a) |
| P-010 | boundary_clarification | Master Plan §58（Immutable-first） | CAS 路徑文法改為 tenant-scoped：`/objects/<tenant_id>/sha256/aa/bb/<hash>` + narrow 全域例外池機制 |
| P-011 | duplication_removal | Master Plan §1.5（最小爆炸半徑） | 六層鏈改為指向 Method Atlas §21 七層鏈（含 Branch），或直接改為 7 層與 Atlas 一致 |
| P-012 | missing_contract | Method Atlas §21 | 補齊 Branch 節點定義：「forked, isolated execution lineage of a Workflow」+ 最小狀態機 |

**依賴**：P-011 依賴操作者確認以 Atlas 版本為準（ADR-003 建議）。**影響範圍**：解決 P1-CONFLICT-2、P1-DUP-3。**未解決 follow-up**（明確不在此批）：relational data RLS 決策、Vector Index/Knowledge Graph tenant-scoping 完整方案——留待 Round 2。

### 來自 ADR-004（risk_tier + 信任標籤統一）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-013 | duplication_removal | Method Atlas §10（selection_context） | `risk_tier` 型別改為 `R0\|R1\|R2\|R3\|R4`，取代 `low\|medium\|high\|critical` |
| P-014 | boundary_clarification | Method Atlas §14.2（Mandatory Gate Injection） | 觸發條件從 `risk_tier = critical` 改為 `risk_tier IN {R3, R4}` — **語意變更，非純重命名**（誡八），需操作者對此擴大範圍額外明示同意，建議獨立於本組其餘項目批准 |
| P-015 | duplication_removal | Master Plan §83 + Method Atlas（Epistemic Type） | 收斂為兩個正交 enum：`epistemic_type`（11 值 SNAKE_CASE）+ `authorship_state`（6 值，移除誤植重複的 CALCULATED_RESULT） |
| P-016 | missing_contract | Method Atlas §21 + Execution Contract §38 | FACT 提升紅線修正：`UNKNOWN` 不得直接提升為 `SOURCE_FACT`；合法路徑為經 Compute→`EVIDENCE`或經 Human Validation→`SOURCE_FACT` |
| P-017 | duplication_removal | Master Plan §11.3 + Execution Contract §57 | `LOCKED FACT`（空格）統一為 `LOCKED_FACT`；補齊 `LOCKED_DECISION` 定義（依附 epistemic_type=DECISION） |

**依賴**：P-015 必須先於 P-016/P-017（DECISION 值要先存在，LOCKED_DECISION 才有依附對象）。**影響範圍**：解決 CROSS-T-3/R-10、CROSS-T-6/R-9/R-11、CDX-7、OQ-7、OQ-8。**特別注意**：P-014 是本批次中風險最高、需要操作者最明確關注的一項——它改變了現有規則的實際觸發範圍，不是文字整理。

### 來自 ADR-005（DB Migration Recipe + Method ID Grammar）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-018 | duplication_removal | Execution Contract §28 | 現有 mermaid 區塊替換為修正後 15 步序列（見 ADR-005 完整序列） |
| P-019 | duplication_removal | Method Atlas F21 mermaid + 表格列、§11.50、§13.10 | 三/四處序列圖刪除，改為一句話指向 EC §28 |
| P-020 | duplication_removal | Method Atlas §9（LEGO Contract 範例，L50） | `method.association.mind_map` 拿掉前綴，改為 `association.mind_map` |
| P-021 | boundary_clarification | Method Atlas §24.1（L4256-4258） | `method.swot.v1/v2/v3` 拿掉前綴並補回遺漏的 family 段，改為 `id: strategy.swot` + 獨立 `version` 欄位 |

**依賴**：P-019 依賴 P-018 先完成（引用要指向已修正的版本）。P-020/P-021 互相獨立，可與 P-018/P-019 平行。**影響範圍**：解決 P1-DUP-1（實際五處）、OQ-12、CDX-4。

### 來自 ADR-006（母文件修改流程 + Repo 佈局歸屬）

| # | change_class | 目標文件 | 內容 |
|---|---|---|---|
| P-022 | 治理機制建立（非母文件內容修改） | 新增 `.ai/proposals/` 資料夾結構 + `PROPOSAL.md` schema | 本文件所有其餘提案（P-001~021）的執行載具 |
| P-023 | boundary_clarification | Master Plan（L611-616/766-773/845/1002-1008）+ Execution Contract（L223/647/735/1008/2745-2828/3995-4054） | 具體實作路徑清單全部替換為「見 repo-layout spec」引用句；過渡期先落地為 `.ai/research/phase-2/repo-layout-draft.yaml`（`status: DRAFT_PENDING_PHASE_4`） |

**依賴**：P-022 必須最先完成——它是 P-001~021 全部提案的執行機制本身。**影響範圍**：解決 OQ-6、OQ-11。

---

## 2. 整體依賴圖

```text
P-022（proposals 機制建立）
  └─ 必須先於 → 所有其餘 21 項提案的正式執行

P-001（新建 Architecture-Constitution-v1.md）
  └─ 必須先於 → P-002, P-004

P-015（epistemic/authorship 正交 enum）
  └─ 必須先於 → P-016, P-017（DECISION 值要先存在）

P-018（EC §28 DB Migration 15 步）
  └─ 必須先於 → P-019（引用需指向已修正版本）

P-013（risk_tier R0-R4）
  └─ 建議先於 → P-014（觸發條件擴大依賴新 enum 已生效，但兩者理論上可同批次批准）

其餘（P-005~012, P-020~021, P-023）與上述鏈路無強制順序依賴，可依操作者批准節奏平行處理。
```

---

## 3. 批准與執行建議順序

1. **先批 ADR-006**（治理機制）——沒有它，其餘提案無執行載具。
2. **再批 ADR-001**（治理裁決鏈）——它是後續所有提案的仲裁基礎，晚批會讓中途的衝突無法裁決。
3. **ADR-002/003/004/005 可任意順序批准**，各自獨立生效；建議操作者優先審閱 ADR-004 的 P-014（語意擴大項）與 ADR-002 的整體機制（涉及個資合規，影響面最大）。
4. 每組 ADR 批准後，依 ADR-006 定義的流程逐一展開該組提案為正式 `.ai/proposals/<NNN>-<slug>/PROPOSAL.md`，一提案一 commit（誡三）。

---

## 4. 統計

- 共 **23 項提案**（P-001~P-023）源自 6 份 ADR。
- 其中 **1 項（P-014）為語意變更**，需操作者格外注意（誡八）。
- 其中 **2 項（P-006, P-012, P-016 等）為全新設計**（母文件全文零既有內容可沿用），其餘多數為既有內容的合併/搬移/重命名（Low-risk 事實性修正）。
- 全部 23 項在對應 ADR 未經批准前**不得執行**，本文件本身不構成授權。

---

**邊界確認**：本文件由 Claude 主 session 彙整 6 份已存在的 ADR 內容而成，未新增任何未經 ADR 論證的修改建議，未執行任何母文件修改，未建立任何 `.ai/proposals/` 實體檔案。
