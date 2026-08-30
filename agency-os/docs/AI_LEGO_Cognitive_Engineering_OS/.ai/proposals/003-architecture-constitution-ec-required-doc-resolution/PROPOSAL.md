---
proposal_id: "003"
slug: "architecture-constitution-ec-required-doc-resolution"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L169-185"]
related_open_questions: ["OQ-9"]
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "b54a43aeb"
---

## PROPOSED_CHANGE

Execution Contract §3.1 Required Document Resolution 的 7 步清單新增第 8 步：解析 `Architecture-Constitution-v1.md`，缺失時同樣觸發 `DOCUMENT_RESOLUTION_BLOCKED`。

## RATIONALE

`Architecture-Constitution-v1.md` 已建立且承載裁決鏈本身——若 AI 執行任何任務時的必讀文件清單沒有登記它，未來任何需要用到裁決鏈的情境都可能在不知道該文件存在的情況下運作，等於文件建了但沒人被要求讀（`docs/adr/ADR-001-scoped-authority-precedence-unification.md` Codex 對抗式覆審 CONFIRMED 發現，見 `ADR_INDEX.md` 「Codex 對抗式覆審」段落）。本提案是該覆審發現的直接修正動作。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§3.1 Required Document Resolution（L169-185）

## DEPENDENCIES

依賴 `Architecture-Constitution-v1.md` 已存在。與 `002-architecture-constitution-ec-pointer`、`004-architecture-constitution-ec-document-registry` 修改同一份文件但不同行區間，互不重疊。

## COMPATIBILITY

沿用既有 `DOCUMENT_RESOLUTION_BLOCKED` 狀態碼，不新增狀態碼，不影響任何既有消費此狀態碼的邏輯。

## MIGRATION

`Edit` 工具精確字串替換；套用後重算 EC sha256。

## ROLLBACK

`git revert` 完整還原。

## EVIDENCE

- `docs/adr/ADR-001-scoped-authority-precedence-unification.md`（Codex 對抗式覆審段落，NEEDS-REVISION CONFIRMED 發現原文；Migration 步驟 3）
- `docs/adr/ADR_INDEX.md`「Codex 對抗式覆審」段落

## Diff

### Original

Execution Contract §3.1（L169-185，逐字）：

```
## 3.1 Required Document Resolution

AI MUST：

1. 找到 `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`。
2. 找到 `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`。
3. 讀取本 Execution Contract。
4. 找到 machine-readable specs。
5. 找到 applicable policies。
6. 找到 accepted ADR。
7. 找到目前程式碼、schema、infra 與 deployment evidence。

任一必要規格缺失：

DOCUMENT_RESOLUTION_BLOCKED
```

### Proposed

```
## 3.1 Required Document Resolution

AI MUST：

1. 找到 `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`。
2. 找到 `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`。
3. 讀取本 Execution Contract。
4. 找到 `Architecture-Constitution-v1.md`。
5. 找到 machine-readable specs。
6. 找到 applicable policies。
7. 找到 accepted ADR。
8. 找到目前程式碼、schema、infra 與 deployment evidence。

任一必要規格缺失：

DOCUMENT_RESOLUTION_BLOCKED
```

### Reason

新增第 4 步登記 `Architecture-Constitution-v1.md`（原本清單編號 4-7 依序遞增為 5-8，內容不變）——插入位置緊接在三份既有母文件之後、machine-readable specs 之前，反映其「與 MP/EC/Atlas 同等級一律必讀」的地位（非附屬於任一份母文件之下）。沿用既有 `DOCUMENT_RESOLUTION_BLOCKED` 機制，不新增狀態碼。
