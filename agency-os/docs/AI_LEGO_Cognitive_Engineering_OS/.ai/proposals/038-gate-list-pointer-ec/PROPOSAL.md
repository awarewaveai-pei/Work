---
proposal_id: "038"
slug: "gate-list-pointer-ec"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L2246-2278"]
related_open_questions: ["OQ-10"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Replace Execution Contract §68 Global Gates（L2246-2278：14 項「可能包含」清單 + High-risk 6 項清單 + 「Method-specific gate 從 Method Atlas 取得」收尾句）的完整內容，改為一行指標句「see Master Plan §158 — SSOT」。**§69 Gate Result（L2282-2293）明確不受本提案影響**——ADR-011 Recommendation 第 1 項與 Sub-decision (a) 都明文將 §69 排除在外（它是「AI 執行生命週期」層的執行機制/紀錄格式，落在 EC 自己被授權的範圍內，不是本次爭議的對象），本提案 diff 嚴格止於 L2278，不觸碰 §69 任何一行。

## RATIONALE

`docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（ACCEPTED 2026-08-30）Sub-decision (a) 對 EC §68 做出**本 ADR 自己新提出、Phase 0 從未點名過**的觀察：EC 自己的 Scoped Authority 表（`EC:98-109`）第 2 列把「Security / Data / Deployment / Global Jurisdiction Architecture」這組主題（正是 §68 清單涵蓋的內容）明文指派給 Master Plan，不是指派給 EC 自己——EC 表中唯一與 Gate 相關的授權只有第 4 列「Method-specific Quality Gate → Method Atlas」，同樣沒有任何一格授權 EC 立法平台級 Global/High-risk Gate。這使得 EC §68 與 Atlas §22.1/§22.2（`CROSS-R-7` 原始認定的違規對象）處於對稱的越權位置——EC §68 甚至還獨立複製了 Atlas 的 14+6 項計數，但在複製過程中又產生了 `CROSS-T-11` 認定的 3 處命名漂移（EC「Independent Review」vs Atlas「Independent Judge PASS」；EC「Human Specialist」vs Atlas/MP「Human Specialist Review PASS」；EC「Recovery Rehearsal」vs Atlas「Recovery / Rollback Rehearsal PASS」）——這正是「三份文件各自維護同一份清單，無共享 gate-id registry」會持續發散的活生生範例。ADR-011 Recommendation 第 1 項明確指示：「EC §68 ... 待下次透過 ADR-006 proposal 流程編輯時，簡化為一行指標句（see Master Plan §158 — SSOT）；EC §69 不受影響」——本提案即是該項 Recommendation 的具體落地，不是新裁決。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

- §68 Global Gates（L2246-2278：14 項「可能包含」清單、High-risk 6 項清單、「Method-specific gate 從 Method Atlas 取得」收尾句）
- §69 Gate Result（L2282-2293）**不受影響**——ADR-011 Recommendation 第 1 項明文：「Atlas §22.3 and EC §69 are unaffected — both stay exactly as they are, already within each document's own granted scope。」本提案 diff 不含 §69 任何一行，也不含 §68 與 §69 之間的分隔線（L2280-2281）。

## DEPENDENCIES

- **依賴 `039-gate-list-union-content-mp` 先套用或同批次套用**：理由與 `037-gate-list-pointer-atlas` 相同——本提案把 EC §68 讀者導向「Master Plan §158 — SSOT」，若 MP §158 尚未套用 `039` 的聯集內容（仍是原始 11+1 版本），會出現一段真空期：EC §68 原本提供的 8 項（3 Global + 5 High-risk）要求在 EC 這邊被拿掉，MP 那邊還沒補上。**建議套用順序：`039` 先或與 `037`/`038` 同一 commit 批次套用**。
- 建議與 `037-gate-list-pointer-atlas` 同批次套用（ADR-011 Recommendation 第 1 項「兩份重複立法都收斂為指標」的兩半），兩者修改不同檔案、行區間互不重疊，可獨立套用，但只套用一份會讓另一份仍保留舊清單，`CROSS-T-11` 命名漂移的根因（多處各自維護同一份清單）未完全消除。
- 與 EC 檔案內其他已存在的提案（若有，目前僅 `002-architecture-constitution-ec-pointer` 修改同一份 EC 檔案的 L90-137，與本提案的 L2246-2278 完全不重疊）互不衝突，可獨立套用。

## COMPATIBILITY

- `specs/execution/gate.schema.yaml` 的 `gate_catalog`（`status: RESOLVED_2026-08-30`）已經是 20 項聯集內容（含本提案將收斂掉的 EC 3 個命名漂移項的 `deprecated_aliases: ["Independent Review"]`、`["Human Specialist"]`、`["Recovery Rehearsal"]`）的機器可讀正本。本提案只是讓 EC 的**文字敘述**追上 schema 已經有的內容並停止維護會漂移的副本，不改變任何 schema/policy 檔案。
- 下列已建檔案在自己的註解/evidence 欄位中以精確行號引用了本提案即將收斂的 L2246-2278 區間內容（例如 `specs/execution/gate.schema.yaml:19,57,332` 引用「EC §68 (L2246-2278)」；`policies/ai-execution/mandatory-gates.yaml:16,129,186,194` 分別引用 L2246、L2270、L2262、L2275 的具體條目；`policies/ai-execution/release-policy.yaml:29,124,436` 引用 EC §68 的清單本身）。這些都是文件內部的證據引註（註解），不是機器驗證會讀取的欄位，套用本提案後行號會失真，但不會造成任何 validator 失敗——建議套用後另開一次輕量的引註刷新，不阻塞本提案本身。
- `.ai/research/phase-0/verified-findings.yaml` 內同區間的行號引用屬於 Phase 0 研究的歷史凍結記錄，依專案慣例保留不更新。

## MIGRATION

套用時使用 `Edit` 工具做精確字串替換（禁止 `sed`/裸 patch），保留 §68 與 §69 之間的分隔線（L2280-2281）及 §69 本身完全不動。套用後重新計算 EC sha256，更新 `.ai/research/phase-0/document-hashes.yaml`。因套用會讓 §69 之後（§70 起）到檔案結尾的絕對行號整體上移，套用前建議先 grep 盤點所有以 L23xx 以後絕對行號引用 EC 的既有 spec/policy 檔案，套用後同步刷新——此為套用時的配套動作，不在本 DRAFT 提案的 diff 範圍內。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 §68 原始 14+6 項條列文字。因 `gate.schema.yaml` 的 `gate_catalog` 才是實際被機器消費的內容來源，回退本提案（純文件層級的敘述文字）零下游程式碼風險。

## EVIDENCE

- `docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（全文，尤其 Sub-decision (a) 的 EC 新觀察段落、Recommendation 第 1 項、Evidence 段列出的 EC L2240-2295 全文重讀紀錄）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2238-2297`（本次 session 直接重讀確認逐字內容，含 §68 與 §69 邊界）
- `specs/execution/gate.schema.yaml`（`gate_catalog`，本次 session 重讀確認 RESOLVED_2026-08-30 狀態，含 3 個 `deprecated_aliases` 對應本提案收斂掉的 EC 命名）
- `.ai/research/phase-0/open-questions.yaml:68-72`（OQ-10，`status: RESOLVED_BY_HUMAN`，本次 session 重讀確認）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源，本次 session 直接跑 `sha256sum` 重算確認與快照一致）

## Diff

### Original

Execution Contract §68（L2246-2278，逐字）：

````text
# 68. Global Gates

可能包含：

```text
Functional
Evidence
Reasoning
Security
Privacy
Data
Jurisdiction
Localization
Accessibility
Observability
Capacity
Rollback
Documentation
Golden Test
```

High-risk：

```text
Human Specialist
Counterevidence
Red Team
Independent Review
Reversal Criteria
Recovery Rehearsal
```

Method-specific gate 從 Method Atlas 取得。
````

### Proposed

Execution Contract §68 全段改為單一指標段落：

```
# 68. Global Gates

Global/High-risk Gate 清單的唯一正本見 Master Plan §158 — SSOT（see Master Plan §158 — SSOT），禁止在本文件重複列舉或另立命名。Method-specific gate 從 Method Atlas §22.3 取得，維持不變。
```

### Reason

消除 EC 對超出自身 Scoped Authority 授權範圍（EC 自己的表把「Security / Data / Deployment / Global Jurisdiction Architecture」指派給 Master Plan，`EC:98-109` 第 2 列）的平台級 Global/High-risk Gate 清單重複立法——這是 `ADR-011` Sub-decision (a) 新提出、對稱於 Atlas 違規的觀察，也是 `CROSS-T-11` 3 處命名漂移（Independent Review / Human Specialist / Recovery Rehearsal）的根因（EC 獨立維護一份副本，遲早與 Atlas 分岔）。改為單一正本 + 指標行是 `ADR-011` 已批准的 Recommendation 第 1 項的具體實作，不是本提案的新裁決；「Method-specific gate 從 Method Atlas 取得」這句保留（僅微調為明確指向 §22.3），因為它描述的是 §69 以外、EC 自身仍需交代的第三類 gate 來源，刪除會遺失有效資訊。§69 因落在 EC 自身授權範圍內（「AI 執行生命週期」），維持完全不動。
