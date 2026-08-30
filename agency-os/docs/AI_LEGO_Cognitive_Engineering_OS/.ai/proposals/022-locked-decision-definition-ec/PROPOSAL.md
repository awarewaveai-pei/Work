---
proposal_id: "022"
slug: "locked-decision-definition-ec"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L1988-1990"]
related_open_questions: ["OQ-8"]
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "d01944947"
---

## PROPOSED_CHANGE

Add a formal definition of what `LOCKED_DECISION` locks to Execution Contract §57 (L1988-1990), which currently names both `LOCKED_FACT` and `LOCKED_DECISION` together ("不得由 AI 修改") but never states what content class `LOCKED_DECISION` actually applies to.

## RATIONALE

ADR-004's Context section identified this gap directly: "EC §57（L1988-1990）`` `LOCKED_FACT` / `LOCKED_DECISION`：不得由 AI 修改 ``（SNAKE_CASE，兩個鎖定目標）；MP §11.3「Locked Fact」（L970-978）僅 `LOCKED FACT`（空格式，值於 L975），且 MP 自己的 6 值 epistemic type 清單本來就沒有 `DECISION` 這個概念——MP 在自己的詞彙表下本來就無法表達「鎖定一個決策」，這不是漏寫，是 §83 詞彙表本身的完整度缺口所致" (ADR-004:25). The Recommendation states the fix content: "補一句「`LOCKED_DECISION` 語意同 `LOCKED_FACT`，鎖定對象為 epistemic_type=DECISION 的內容」——此修正之所以現在才可行，正是因為 (b) 已把 `DECISION` 補進 MP 可用的 epistemic_type 詞彙" (ADR-004:116). This proposal places that defining sentence in EC §57, where `LOCKED_FACT`/`LOCKED_DECISION` are actually referenced together, rather than in Master Plan §11.3 (which only ever names `LOCKED_FACT` — see `021-locked-fact-casing-mp`, a separate, narrower casing-only fix). `specs/governance/epistemic-label.schema.yaml#/definitions/locked` already encodes exactly this constraint machine-readably ("locked == LOCKED_DECISION is legal only when epistemic_type == DECISION"); this proposal brings EC's prose into agreement with content the schema already states, closing the "referenced but not formally defined" gap named in the assignment.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§57 Human Contribution Protection, `LOCKED_FACT` / `LOCKED_DECISION` clause (L1988-1990)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml#/definitions/locked` already existing (confirmed present) and already encoding the `epistemic_type == DECISION` constraint for `LOCKED_DECISION` and `epistemic_type == SOURCE_FACT` for `LOCKED_FACT`.
- Depends on ADR-004 Sub-decision (b) having added `DECISION` to the canonical `epistemic_type` enum — per the ADR's own note, this definition "現在才可行，正是因為 (b) 已把 `DECISION` 補進...epistemic_type 詞彙" (ADR-004:116). No separate proposal is needed to add `DECISION` to the enum since `specs/governance/epistemic-label.schema.yaml` already includes it.
- Related to `021-locked-fact-casing-mp` (same overall LOCKED_FACT/LOCKED_DECISION fix, different mother document, non-overlapping lines); the two can apply independently or in the same batch.

## COMPATIBILITY

Purely additive — the existing sentence "不得由 AI 修改。" is preserved verbatim; this proposal appends defining text after it. No implementation currently reads this clause (Phase 3 has no code consuming this prose), so there is no behavior to break. Does not affect `specs/governance/epistemic-label.schema.yaml`, which already contains this constraint and is unchanged by this proposal.

## MIGRATION

Edit tool exact string replacement; recompute Execution Contract sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original two-line clause with no `LOCKED_DECISION` definition. Zero downstream risk since Phase 3 has no code consuming this prose yet.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:25` (Context, CROSS-R-11, identifies `LOCKED_DECISION` as referenced but undefinable under MP's pre-fix vocabulary)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:116` (Recommendation, exact defining sentence and the reason it is now possible)
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1974-1992` (read directly, §57 full section, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:89-102` (read directly; `definitions.locked` already encodes both `LOCKED_FACT`→`SOURCE_FACT` and `LOCKED_DECISION`→`DECISION` constraints)

## Diff

### Original

Execution Contract §57, L1987-1990 (verbatim; this immediately follows the section's unrelated "Original → AI Proposal → Diff → Accept/Reject/Edit" diagram at L1978-1986, which is unchanged and omitted here):

```text

`LOCKED_FACT` / `LOCKED_DECISION`：

不得由 AI 修改。
```

### Proposed

Only L1988-1990 changes; everything else in §57 is unchanged:

```text
`LOCKED_FACT` / `LOCKED_DECISION`：

不得由 AI 修改。`LOCKED_FACT` 鎖定對象為 epistemic_type=SOURCE_FACT 的內容；`LOCKED_DECISION` 語意同 `LOCKED_FACT`，鎖定對象為 epistemic_type=DECISION 的內容。完整定義見 `specs/governance/epistemic-label.schema.yaml#/definitions/locked`。
```

### Reason

EC §57 has always named `LOCKED_DECISION` alongside `LOCKED_FACT`, but never stated what content class it locks — an omission that was structurally impossible to fix before this ADR, because Master Plan's own epistemic vocabulary lacked a `DECISION` concept to lock in the first place. Now that ADR-004 Sub-decision (b) has added `DECISION` to the canonical `epistemic_type` enum, this proposal closes the gap with the exact defining sentence the ADR specifies, cross-referenced to the schema that already encodes the same constraint machine-readably.
