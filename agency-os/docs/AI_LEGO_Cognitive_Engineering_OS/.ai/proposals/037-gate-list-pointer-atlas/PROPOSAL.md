---
proposal_id: "037"
slug: "gate-list-pointer-atlas"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L4164-4194"]
related_open_questions: ["OQ-10"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "27ca375ba"
---

## PROPOSED_CHANGE

Replace Method Atlas §22.1 Global Gate（L4164-4181，14 項 PASS 清單）與 §22.2 High-risk Gate（L4183-4194，6 項額外要求）的完整條列內容，改為一行指標句「see Master Plan §158 — SSOT」。§22.3 Method-specific Gate（L4196 起）不受影響、原樣保留——本提案的 diff 範圍嚴格止於 L4194，不觸碰 §22.3。

## RATIONALE

`docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（ACCEPTED 2026-08-30）Sub-decision (a) 裁決：Master Plan 是平台級 Global/High-risk Gate 的唯一正本 owner，理由是 MP 自己的 Scoped Authority 表（`MP:53-58`）已明文將「Governance」授權給 MP，而 Atlas 自己的同一張表只授權 Atlas「Method-specific Gate」——沒有任何一格授權 Atlas 立法平台級的 Global/High-risk 清單。這正是 Phase 0 finding `CROSS-R-7`（3/3 votes CONFIRMED）指出的越權立法，且已產生實際後果：Atlas 版本（14+6 項）與 MP 版本（11+1 項）長期不同步，衍生出 `CROSS-T-11` 的 3 處命名漂移（Atlas「Independent Judge PASS」vs EC「Independent Review」等）。ADR-011 Recommendation 第 1 項明確指示：「Atlas §22.1/§22.2 ... 待下次透過 ADR-006 proposal 流程編輯時，簡化為一行指標句（see Master Plan §158 — SSOT）」——本提案即是該項 Recommendation 的具體落地，不是新裁決。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

- §22.1 Global Gate（L4164-4181，14 項 PASS 清單）
- §22.2 High-risk Gate（L4183-4194，「額外要求：」+ 6 項清單）
- §22.3 Method-specific Gate（L4196 起）**不受影響**——ADR-011 Recommendation 第 1 項明文：「Atlas §22.3 and EC §69 are unaffected — both stay exactly as they are, already within each document's own granted scope。」本提案 diff 不含 §22.3 任何一行。

## DEPENDENCIES

- **依賴 `039-gate-list-union-content-mp` 先套用或同批次套用**：本提案把 Atlas 讀者導向「Master Plan §158 — SSOT」，但截至本提案撰寫時，MP §158 本身仍是原始的 11 Global + 1 High-risk 版本（尚未套用 `039` 的聯集內容）。若本提案先於 `039` 單獨套用，會出現一段真空期：Atlas 讀者被導向的 SSOT 實際上還沒有 Atlas 原本提供的 Evidence/Reasoning/Capacity（Global）與 Counterevidence/Red Team/Independent Judge/Reversal Criteria/Recovery-Rollback Rehearsal（High-risk）共 8 項要求——等於暫時性地讓這 8 項要求從全文中消失（Atlas 版本被拿掉、MP 版本還沒補上）。**建議套用順序：`039` 先或與 `037`/`038` 同一 commit 批次套用**，避免此窗口。
- 建議與 `038-gate-list-pointer-ec` 同批次套用（同屬 ADR-011 Recommendation 第 1 項「兩份重複立法都收斂為指標」的兩半），但兩者修改不同檔案、行區間互不重疊，各自也可獨立套用而不產生 schema 層級錯誤——只是若只套用其中一份，另一份仍保留舊的重複清單，重工/漂移風險（CROSS-T-11 的成因）並未完全消除。

## COMPATIBILITY

- `specs/execution/gate.schema.yaml` 的 `gate_catalog`（2026-08-29 建骨架、2026-08-30 依 ADR-011 補完內容，`status: RESOLVED_2026-08-30`）已經是這 20 項（14+6）聯集內容的機器可讀正本。本提案只是讓 Atlas 的**文字敘述**追上 schema 已經有的內容，不改變任何 schema/policy 檔案，也不是 schema 檔案去追文字——方向明確是文字補齊 schema，不是反過來。
- 下列已建檔案在自己的註解/evidence 欄位中，以精確行號引用了本提案即將收斂的 L4164-4194 區間內容（例如 `specs/execution/gate.schema.yaml:18,58,321` 引用「Atlas §22.1/22.2 (L4164-4194)」；`policies/ai-execution/mandatory-gates.yaml:15,128,185` 分別引用 L4164、L4188、L4178 的具體條目）。這些都是**文件內部的證據引註（註解），不是機器驗證會讀取的欄位**，套用本提案後這些行號會失真（該區間縮成一行指標句），但不會造成任何 validator 失敗——建議套用後另開一次輕量的引註刷新（grep `L416[4-9]\|L417[0-9]\|L418[0-9]\|L419[0-4]` 找出所有引用此區間的檔案並更新其引註行號），不阻塞本提案本身，也不在本提案 diff 範圍內。
- `.ai/research/phase-0/verified-findings.yaml` 內同區間的行號引用屬於 Phase 0 研究的歷史凍結記錄（`CROSS-R-5`/`CROSS-R-7`/`CROSS-T-11` 原始證據），依專案慣例保留不更新，不受本提案影響。

## MIGRATION

套用時使用 `Edit` 工具做精確字串替換（禁止 `sed`/裸 patch），保留 §22 章節整體編號結構（「# 22. Quality Gates」標題與 §22.3 不動）。套用後重新計算 Atlas sha256，更新 `.ai/research/phase-0/document-hashes.yaml`。因套用會讓 §22 之後（§22.3 起）到檔案結尾的絕對行號整體上移（減少 30 行），套用前建議先 grep 盤點所有以 L42xx 以後絕對行號引用 Atlas 的既有 spec/policy 檔案（例如引用 §22.3 L4196-4209 各方法列的 `specs/cognitive/lens.schema.yaml`、`specs/cognitive/typed-objects/*.schema.yaml`），套用後同步刷新——此為套用時的配套動作，不在本 DRAFT 提案的 diff 範圍內。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 §22.1/§22.2 原始 14+6 項條列文字。因 `gate.schema.yaml` 的 `gate_catalog` 才是實際被機器消費的內容來源，回退本提案（純文件層級的敘述文字）零下游程式碼風險。

## EVIDENCE

- `docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（全文，尤其 Sub-decision (a)、Recommendation 第 1 項、Evidence 段列出的 Atlas L4160-4200 全文重讀紀錄）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4160-4210`（本次 session 直接重讀確認逐字內容）
- `specs/execution/gate.schema.yaml`（`gate_catalog`，本次 session 重讀確認 RESOLVED_2026-08-30 狀態與 20 項內容）
- `.ai/research/phase-0/open-questions.yaml:68-72`（OQ-10，`status: RESOLVED_BY_HUMAN`，本次 session 重讀確認）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源，本次 session 直接跑 `sha256sum` 重算確認與快照一致）

## Diff

### Original

Method Atlas §22.1/§22.2（L4164-4194，逐字）：

````text
## 22.1 Global Gate

```text
Functional PASS
Evidence PASS
Reasoning PASS
Security PASS
Privacy PASS
Data PASS
Jurisdiction PASS
Localization PASS
Accessibility PASS
Observability PASS
Capacity PASS
Rollback PASS
Documentation PASS
Golden Test PASS
```

## 22.2 High-risk Gate

額外要求：

```text
Human Specialist Review PASS
Counterevidence PASS
Red Team PASS
Independent Judge PASS
Reversal Criteria PASS
Recovery / Rollback Rehearsal PASS
```
````

### Proposed

Method Atlas §22.1/§22.2 全段改為單一指標段落：

```
## 22.1 Global Gate / 22.2 High-risk Gate

Global/High-risk Gate 清單的唯一正本見 Master Plan §158 — SSOT（see Master Plan §158 — SSOT），禁止在本文件重複列舉。本文件僅保留 §22.3 Method-specific Gate（per-method 契約，屬 Atlas 自身已獲授權的範圍，見 MP §0.0.1 Scoped Authority 表）。
```

### Reason

消除 Atlas 對超出自身 Scoped Authority 授權範圍（僅獲授權「Method-specific Gate」，`MP:56`）的平台級 Global/High-risk Gate 清單重複立法——這正是 `CROSS-R-7` 認定的越權，也是 `CROSS-T-11` 命名漂移的根因（兩份清單各自維護，遲早分岔）。改為單一正本 + 指標行是 `ADR-011` 已批准的 Recommendation 第 1 項的具體實作，不是本提案的新裁決；§22.3 因落在 Atlas 自身授權範圍內，維持不動。
