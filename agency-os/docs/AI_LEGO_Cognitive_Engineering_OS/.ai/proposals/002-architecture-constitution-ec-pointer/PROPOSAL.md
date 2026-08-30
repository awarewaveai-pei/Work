---
proposal_id: "002"
slug: "architecture-constitution-ec-pointer"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L90-137"]
related_open_questions: ["OQ-9"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Replace Execution Contract §2（Scoped Authority 表）與 §2.1（8 層裁決鏈）的完整內容，改為指向 `Architecture-Constitution-v1.md` 的指標行。

## RATIONALE

同 `001-architecture-constitution-mp-pointer` 的理由——Execution Contract 自己這份 8 層裁決鏈與 Master Plan §0.0.2 的 6 層裁決鏈是同一個概念的兩份獨立維護副本，且 Execution Contract 版本從未提及 Architecture Constitution 這一層（`ADR-001` 問題 1 的直接證據）。`Architecture-Constitution-v1.md` §1 已是聯集去重後的單一正本，Execution Contract 不應再各自維護。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

- §2 三份母規格的 Scoped Authority（L90-110）
- §2.1 衝突解決順序（L111-137）

## DEPENDENCIES

- 依賴 `Architecture-Constitution-v1.md` 已存在（已完成）。
- 建議與 `001-architecture-constitution-mp-pointer` 同批次套用。
- 與 `003-architecture-constitution-ec-required-doc-resolution`、`004-architecture-constitution-ec-document-registry` 皆修改同一份 Execution Contract，但影響完全不同的行區間（L90-137 vs L169-185 vs L218-253），三者互不重疊，可獨立套用亦可同批次套用。

## COMPATIBILITY

不影響任何既有 schema/policy/recipe 檔案——這是治理原則文字，非機讀資料。

## MIGRATION

`Edit` 工具精確字串替換；套用後重算 EC sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原；零下游程式碼依賴，零風險。

## EVIDENCE

- `docs/adr/ADR-001-scoped-authority-precedence-unification.md`（Recommendation Option A、問題 1 的 `CROSS-T-9`/`CROSS-R-12` 引用、Migration 步驟 2）
- `Architecture-Constitution-v1.md` §1（新正本內容）

## Diff

### Original

Execution Contract §2（L90-110，逐字）：

```
# 2. 三份母規格的 Scoped Authority

禁止用「最後讀到的文件永遠優先」處理衝突。

採：

# Scoped Authority

| Scope | Authoritative Source |
|---|---|
| Product / Domain / Platform Architecture | Global Master Plan |
| Security / Data / Deployment / Global Jurisdiction Architecture | Global Master Plan + approved machine policies |
| Cognitive Primitive / Method / Lens / Method Selection | Method Atlas |
| Method-specific Quality Gate | Method Atlas |
| AI 執行生命週期 | Execution Contract |
| AI Authority / Tool Use / Change Control | Execution Contract + machine policy |
| Exact Schema / Enum / Runtime Contract | Approved machine-readable specs |
| 特定已批准架構選擇 | Accepted ADR |
| 法律有效性 | Official legal source + approved Jurisdiction Pack |
| 當前 Production Reality | Current-state evidence |
```

Execution Contract §2.1（L111-137，逐字）：

```
## 2.1 衝突解決順序

Applicable Binding Law / Regulatory Hard Constraint
        ↓
Approved Security / Privacy / Safety Hard Policy
        ↓
Approved Machine-readable Contract / Schema
        ↓
Accepted ADR
        ↓
Scoped Normative Document
        ↓
Recipe / Runbook
        ↓
Example
        ↓
Ad-hoc Suggestion

若兩份同層級規格在同一 scope 互相衝突：

CONFLICT_REQUIRES_HUMAN_REVIEW

不得由 AI 自行選擇對自己最方便的一條。
```

### Proposed

§2 與 §2.1 合併改為單一指標段落：

```
# 2. Scoped Authority

Scoped Authority 裁決鏈與文件職責/授權表的唯一正本見 `Architecture-Constitution-v1.md` §1、§2，禁止在本文件重複定義。「法律有效性」「當前 Production Reality」兩項不屬於文件職責範圍，維持原則：法律有效性依 Official legal source + approved Jurisdiction Pack；當前 Production Reality 依 Current-state evidence 判斷，兩者不變。
```

### Reason

消除與 Master Plan §0.0.2 重複維護的裁決鏈，改為單一正本；保留「法律有效性」「當前 Production Reality」兩項 Execution Contract 原有、Architecture Constitution 文件職責表未涵蓋的判準說明，避免刪除有效資訊。
