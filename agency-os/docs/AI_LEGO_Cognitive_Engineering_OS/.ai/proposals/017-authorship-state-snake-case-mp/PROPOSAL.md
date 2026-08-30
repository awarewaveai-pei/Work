---
proposal_id: "017"
slug: "authorship-state-snake-case-mp"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L3384-3393"]
related_open_questions: ["OQ-8"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Convert Master Plan §83's 6-value "最重要的內容原則" list (L3385-3390) from space-form casing (`SOURCE FACT`, `AI INFERENCE`, ...) to SNAKE_CASE (`SOURCE_FACT`, `AI_INFERENCE`, ...), and add a sentence pointing to `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type` as the canonical enum this list is a subset of.

## RATIONALE

ADR-004's enum-diffing method (Method Used, step 1) confirmed "MP §83 的 6 值 = Atlas/EC 11 值的**嚴格子集**（拼字、大小寫皆一致），只是少了 `EVIDENCE / ASSUMPTION / HYPOTHESIS / SIMULATED RESULT / DECISION` 五項" (ADR-004:21). Decision Driver 3 states casing convergence is a zero-semantic-cost mechanical fix, distinct from the cardinality question that needed human judgment (ADR-004:33). The Recommendation's canonical schema (ADR-004:80-91) makes `epistemic_type` an 11-value SNAKE_CASE enum with MP's 6 values as a strict subset — no value in MP §83 is dropped or renamed beyond the casing conversion. Migration step 3 explicitly groups this MP fix with the Atlas equivalent as one low-risk step: "Atlas L594-604、MP L3385-3390 的空格式 11/6 值機械轉 SNAKE_CASE 並改為指向 schema（低風險，純字串替換）" (ADR-004:133).

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§83 最重要的內容原則 (L3380-3393; fenced value list and adjoining sentences L3384-3393)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml` already existing (confirmed present, `status: ACTIVE`).
- No line overlap with `018-authorship-state-dedup-mp` (same document, different section — §12.1 at L992-1002 vs §83 at L3384-3393); the two can apply independently or in the same batch. Both implement Migration steps 3-4 of the same ADR-004 sub-decision.

## COMPATIBILITY

Every retained value's spelling is preserved exactly; only whitespace becomes underscore, and none of the 6 values are removed (unlike `018`, which does remove a value from a different MP section). Phase 0's audit found MP's 6-value list appears only in this single section (ADR-004:35), so migration cost is low. Does not affect `specs/governance/epistemic-label.schema.yaml`, which is unchanged by this proposal.

## MIGRATION

Edit tool exact string replacement; recompute Master Plan sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original space-form 6-value list. Zero downstream risk since Phase 3 has no code consuming this prose yet.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:17,21` (Context, identifying MP §83's 6 values and the subset finding)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:33` (Decision Driver 3, casing-vs-cardinality distinction)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:80-91` (Recommendation schema block, canonical `epistemic_type` enum)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:133` (Migration step 3, explicitly names this exact line range)
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3380-3393` (read directly, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:18,144-154` (read directly; `source_of_truth_for` names this MP location, `migration_crosswalk.master_plan_83_to_canonical` lists the exact per-value mapping)

## Diff

### Original

Master Plan §83, L3380-3393 (verbatim; the changed range is L3384-3393):

````text
# 83. 最重要的內容原則

AI 產出必須區分：

```text
SOURCE FACT
AI INFERENCE
AI SUGGESTION
HUMAN OPINION
CALCULATED RESULT
UNKNOWN
```

禁止混合。
````

### Proposed

````text
# 83. 最重要的內容原則

AI 產出必須區分（canonical enum 定義見 `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type`，本清單為其嚴格子集，ADR-004 Sub-decision b）：

```text
SOURCE_FACT
AI_INFERENCE
AI_SUGGESTION
HUMAN_OPINION
CALCULATED_RESULT
UNKNOWN
```

禁止混合。
````

### Reason

ADR-004 confirmed MP §83's 6 values are a strict subset of the canonical 11-value `epistemic_type` enum with identical spelling — only casing differed. Converting to SNAKE_CASE and pointing at the schema removes the casing drift between MP's copy and the EC/Atlas copies (which this ADR also converges, see `016-epistemic-type-snake-case-atlas`) without dropping or altering any of MP's 6 values.
