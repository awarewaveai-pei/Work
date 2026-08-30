---
proposal_id: "018"
slug: "authorship-state-dedup-mp"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L992-1002"]
related_open_questions: ["OQ-8"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "99e9df1fe"
---

## PROPOSED_CHANGE

Remove the duplicated 7th value `CALCULATED RESULT` from Master Plan §12.1's authorship-label list (L992-1002), and replace the entire re-listed enumeration with a pointer to `specs/governance/epistemic-label.schema.yaml#/definitions/authorship_state`.

## RATIONALE

ADR-004's Context section found this value was not a genuine 7th authorship concept but a literal duplicate of an §83 epistemic-type value reused on the wrong axis: "`CALCULATED RESULT` 與 §83 清單完全重複——同一字串在 MP 自己內部同時代表兩種不同語意軸，是 Master Plan 內部自我碰撞，不只是跨文件漂移" (ADR-004:20). The Method Used section's orthogonality test (step 2) confirmed the remaining 6 values genuinely answer a different question than `epistemic_type` ("誰產生/處理了這段內容"), with `CALCULATED RESULT` singled out as "同時符合兩個問題的措辭，判定為誤植而非刻意雙軸值" (ADR-004:59). The Recommendation's schema block defines `authorship_state` as exactly 6 values, "以 MP §12.1 為底，移除誤植的 CALCULATED_RESULT 重複項" (ADR-004:50,94-100). Migration step 4 states this precisely: "MP §12.1（L992-1002）移除 `CALCULATED RESULT`（第 7 值），改指向 `authorship_state` schema" (ADR-004:134) — unlike the pure-casing fixes in `016`/`017`, the assignment brief for this site explicitly calls for pointing to the schema **instead of re-listing values**, which this proposal follows by replacing the full enumeration (not just deleting one line) with a pointer sentence.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§12.1 記錄內容來源 (L992-1002)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml` already existing and already defining `authorship_state` as the 6-value enum with `CALCULATED_RESULT` excluded (confirmed present, `status: ACTIVE`).
- No line overlap with `017-authorship-state-snake-case-mp` (§83, L3384-3393) — both are in the same mother document but disjoint sections; can apply independently or in the same batch.
- Should be considered alongside `021-locked-fact-casing-mp` and `022-locked-decision-definition-ec`: ADR-004 notes that MP's pre-fix 6-value §83 vocabulary "本來就沒有 `DECISION` 這個概念" (ADR-004:25), which is why `LOCKED_DECISION` could not previously be defined against MP's vocabulary — this proposal does not itself add `DECISION` to any MP list (that concept lives in the schema's `epistemic_type`, not `authorship_state`), but readers auditing the LOCKED_FACT/LOCKED_DECISION chain should read all three proposals together.

## COMPATIBILITY

Removes one duplicated value and the surrounding re-listing entirely; the 6 genuinely-authorship values (`HUMAN ORIGINAL`, `AI GENERATED`, `AI SUGGESTED`, `HUMAN EDITED`, `HUMAN APPROVED`, `SOURCE QUOTATION`) are not deleted from the concept space — they remain fully defined, in canonical SNAKE_CASE form, in `specs/governance/epistemic-label.schema.yaml#/definitions/authorship_state`, which this proposal points to rather than duplicating inline. Phase 0's audit found MP's 7-value list appears only in this single section (ADR-004:35), so no implementation depends on `CALCULATED RESULT` being present here. Does not affect the schema file, which is unchanged by this proposal.

## MIGRATION

Edit tool exact string replacement; recompute Master Plan sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original 7-value list including the duplicated `CALCULATED RESULT`. Zero downstream risk since Phase 3 has no code consuming this prose yet.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:20` (Context, self-collision finding for `CALCULATED RESULT`)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:59` (Method Used, orthogonality test identifying the mis-scoped value)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:50,94-100` (Recommendation, `authorship_state` 6-value schema definition)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:134` (Migration step 4, explicitly naming this exact line range and fix)
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:982-1002` (read directly, confirmed exact current text including §12 heading context)
- `specs/governance/epistemic-label.schema.yaml:71-87,155-162` (read directly; `definitions.authorship_state` 6-value enum, `migration_crosswalk.master_plan_12_1_to_canonical` explicitly records `CALCULATED RESULT` as "REMOVED — was a duplicate of the epistemic_type value, not a real 7th authorship value")

## Diff

### Original

Master Plan §12.1, L992-1002 (verbatim):

````text
## 12.1 記錄內容來源

```text
HUMAN ORIGINAL
AI GENERATED
AI SUGGESTED
HUMAN EDITED
HUMAN APPROVED
SOURCE QUOTATION
CALCULATED RESULT
```
````

### Proposed

```text
## 12.1 記錄內容來源

`authorship_state` 唯一正本見 `specs/governance/epistemic-label.schema.yaml#/definitions/authorship_state`（6 值：HUMAN_ORIGINAL / AI_GENERATED / AI_SUGGESTED / HUMAN_EDITED / HUMAN_APPROVED / SOURCE_QUOTATION）。原第 7 值 `CALCULATED RESULT` 已移除——經 ADR-004 確認為誤植自 §83 epistemic_type 的重複字串，非真實的第 7 種 authorship 概念。
```

### Reason

ADR-004 determined `CALCULATED RESULT` was Master Plan's own internal self-collision (the same literal string doing double duty on two orthogonal axes), not a legitimate distinct authorship state and not merely cross-document drift. Removing it here — and replacing the re-listing with a pointer to the schema's now-6-value `authorship_state` enum — closes that self-collision at its source rather than leaving MP as a second place where the value count could silently re-diverge.
