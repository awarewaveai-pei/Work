---
proposal_id: "001"
slug: "architecture-constitution-mp-pointer"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L60-84", "L3785"]
related_open_questions: ["OQ-9"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Replace Master Plan §0.0.2's full 6-layer Scoped Authority decision chain (L60-84) and §90 item 1's bare filename reference (L3785) with a 3-line pointer to the newly-created `Architecture-Constitution-v1.md`, which now carries the single, unified version of this decision chain.

## RATIONALE

`docs/adr/ADR-001-scoped-authority-precedence-unification.md`（ACCEPTED 2026-08-29）Recommendation Option A 已裁決：Master Plan §0.0.2 與 Execution Contract §2.1 各自獨立維護一份 Scoped Authority 裁決鏈（前者 6 層、後者 8 層），兩者已有語意漂移風險（`CROSS-T-9`）。`Architecture-Constitution-v1.md` 已建立（2026-08-30），內容為兩版本聯集去重後的單一版本（見該檔 §1）。本提案的目的僅是讓 Master Plan 不再重複維護一份可能漂移的副本，改為指向單一正本——不改變裁決鏈的實際內容或效力，純粹消除重複定義。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §0.0.2 Scoped Authority / 衝突處理（L60-84）
- §90 建議下一步，item 1（L3785，單行）

## DEPENDENCIES

- 依賴 `Architecture-Constitution-v1.md` 已存在（已完成，2026-08-30，見該檔）。
- 應與 `002-architecture-constitution-ec-pointer` 同批次套用，避免 Master Plan 已指向新正本、但 Execution Contract 仍保留舊版 8 層鏈的短暫不一致窗口（雖然兩者各自獨立套用不會造成 schema 層級錯誤，只是文件層級的暫時不一致，建議仍同批次處理）。

## COMPATIBILITY

不影響任何既有 schema、policy、或 recipe 檔案——這些檔案從未直接消費 Master Plan §0.0.2 的裁決鏈文字本身（該鏈條是给人類/AI 閱讀的治理原則，非機讀資料）。不影響任何已批准 ADR 的結論。

## MIGRATION

套用時使用 `Edit` 工具做精確字串替換，不使用 `sed` 或其他可能誤傷周邊內容的工具；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 §0.0.2/§90 的原始 6 層裁決鏈文字。因 Phase 3 尚未有程式碼消費此文字內容，回滾零下游風險。

## EVIDENCE

- `docs/adr/ADR-001-scoped-authority-precedence-unification.md`（全文，尤其 Recommendation Option A、Migration 步驟 2）
- `Architecture-Constitution-v1.md` §1（新正本內容）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源，2026-08-30 直接重算 sha256sum 確認與快照一致）

## Diff

### Original

Master Plan §0.0.2（L60-84，逐字）：

```
## 0.0.2 Scoped Authority / 衝突處理

不得用單一「哪份文件永遠優先」粗暴處理所有衝突，採 Scoped Authority：

Applicable Law / Regulatory Hard Constraint
        ↓
Architecture Constitution / Security / Privacy Hard Policy
        ↓
Approved Machine-readable Contract / Schema
        ↓
Accepted ADR
        ↓
┌───────────────────────────────┬──────────────────────────────────┐
│ Architecture / Platform Scope │ Cognitive Method / Tool Scope    │
│ → Master Plan authoritative   │ → Method Atlas authoritative     │
└───────────────────────────────┴──────────────────────────────────┘
        ↓
Recipe / Runbook / Example

若跨 Scope 仍無法消解：

CONFLICT_REQUIRES_HUMAN_REVIEW
```

Master Plan §90 item 1（L3785，單行）：

```
1. `Architecture-Constitution-v1.md`
```

### Proposed

Master Plan §0.0.2 全段改為：

```
## 0.0.2 Scoped Authority / 衝突處理

Scoped Authority 裁決鏈的唯一正本見 `Architecture-Constitution-v1.md` §1，禁止在本文件重複定義。
```

Master Plan §90 item 1 改為：

```
1. `Architecture-Constitution-v1.md`（已建立，見同層目錄，內容為 Scoped Authority 裁決鏈與文件職責表的單一正本）
```

### Reason

消除兩份文件各自維護同一份裁決鏈的重複定義（`CROSS-T-9` 根因），改為單一正本 + 指標行——這是 `ADR-001` 已批准的 Recommendation Option A 具體實作，不是本提案的新裁決。
