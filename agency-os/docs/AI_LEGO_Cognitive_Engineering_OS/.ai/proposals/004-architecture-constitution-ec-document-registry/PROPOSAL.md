---
proposal_id: "004"
slug: "architecture-constitution-ec-document-registry"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L218-253"]
related_open_questions: ["OQ-9"]
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "d1ba4d6b3"
---

## PROPOSED_CHANGE

Execution Contract §4 Document Registry 的 3 筆 YAML 範例新增第 4 筆：`ai-lego.architecture-constitution`，`required: true`，不掛在 `required_for` 條件清單下。

## RATIONALE

同 `003-architecture-constitution-ec-required-doc-resolution` 的理由——這是同一個 Codex 對抗式覆審 CONFIRMED 發現的另一半修正（該發現指出新 SSOT 建好但兩處必讀登記皆未更新：§3.1 步驟清單與 §4 Document Registry 範例）。`required: true` 而非掛 `required_for` 條件清單，因為裁決鏈本身可能在任何 scope 的衝突情境下被需要，不能限定使用情境（同 MP/EC 兩份母文件本身的 `required: true` 待遇一致）。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§4 Document Registry（L218-253）

## DEPENDENCIES

依賴 `Architecture-Constitution-v1.md` 已存在。與 `003-architecture-constitution-ec-required-doc-resolution` 建議同批次套用（兩者共同閉環同一個 Codex 發現），但修改行區間不重疊，各自獨立可套用。

## COMPATIBILITY

新增一筆 registry entry，不修改既有 3 筆的任何欄位——對任何讀取此 registry 的既有邏輯是純增量、非破壞性變更。

## MIGRATION

`Edit` 工具精確字串替換；套用後重算 EC sha256。

## ROLLBACK

`git revert` 完整還原。

## EVIDENCE

- `docs/adr/ADR-001-scoped-authority-precedence-unification.md`（Codex 對抗式覆審段落；Migration 步驟 3）
- `docs/adr/ADR_INDEX.md`「Codex 對抗式覆審」段落

## Diff

### Original

Execution Contract §4（L218-253，逐字）：

```yaml
documents:
  - id: ai-lego.master-plan
    filename: AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md
    major: 1
    required: true

  - id: ai-lego.method-atlas
    filename: AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md
    major: 1
    required_for:
      - nontrivial_analysis
      - architecture_change
      - incident
      - security_review
      - db_migration
      - policy
      - research
      - strategy
      - decision

  - id: ai-lego.execution-contract
    filename: AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md
    major: 1
    required: true
```

### Proposed

```yaml
documents:
  - id: ai-lego.master-plan
    filename: AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md
    major: 1
    required: true

  - id: ai-lego.method-atlas
    filename: AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md
    major: 1
    required_for:
      - nontrivial_analysis
      - architecture_change
      - incident
      - security_review
      - db_migration
      - policy
      - research
      - strategy
      - decision

  - id: ai-lego.execution-contract
    filename: AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md
    major: 1
    required: true

  - id: ai-lego.architecture-constitution
    filename: Architecture-Constitution-v1.md
    major: 1
    required: true
```

### Reason

新增第 4 筆 registry entry，與 MP/EC 同等級 `required: true`（不掛 `required_for` 條件清單）——因為它是裁決鏈本身，任何 scope 的衝突都可能需要它，不能限定情境（`ADR-001` 原文明確措辭，逐字採用）。
