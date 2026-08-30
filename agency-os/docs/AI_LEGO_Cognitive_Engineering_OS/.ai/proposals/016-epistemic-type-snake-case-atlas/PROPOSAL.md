---
proposal_id: "016"
slug: "epistemic-type-snake-case-atlas"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L591-605"]
related_open_questions: ["OQ-8"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "825383462"
---

## PROPOSED_CHANGE

Convert Method Atlas's 11-value "Epistemic Type 必須分離" list (L594-604) from space-form casing (`SOURCE FACT`, `AI INFERENCE`, ...) to SNAKE_CASE (`SOURCE_FACT`, `AI_INFERENCE`, ...), and add a sentence pointing to `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type` as the canonical enum this list must stay synchronized with.

## RATIONALE

ADR-004's Context section identified four independently-drifting vocabularies for the same concept and determined "三套「epistemic type」詞彙並非三個互斥設計，而是同一詞彙表的三種完整度/大小寫變體" (ADR-004:21). Decision Driver 3 explicitly separates this class of fix from the cardinality/orthogonality questions: "casing 差異（space vs SNAKE_CASE）是零語意成本的機械修正...兩類問題不應用同一種修法處理" (ADR-004:33). The Recommendation's schema block (ADR-004:80-91) defines `epistemic_type` as "11 值，SNAKE_CASE，以 EC §38 為底（Atlas 空格式全部替換為底線，零語意改動）" — i.e., Atlas's 11 values are transcribed with zero reordering or content change, only the space-to-underscore casing conversion. `specs/governance/epistemic-label.schema.yaml` already exists and already lists this exact Atlas location (L591-605) under its `source_of_truth_for` field, confirming the schema is the intended authority this Atlas passage should defer to.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

"Epistemic Type 必須分離" (heading L591, fenced value list L593-605)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml` already existing (confirmed present, `status: ACTIVE`, `decided_by: docs/adr/ADR-004...`).
- No line-range overlap with `017-authorship-state-snake-case-mp` or `018-authorship-state-dedup-mp` (different mother document, Master Plan) or with `019-fact-promotion-redline-atlas` (same document, different section, L4151) — all four can apply independently or in the same batch.

## COMPATIBILITY

Every value's spelling and ordering is preserved exactly; only whitespace becomes underscore. Phase 0's audit found no implementation depends on the space-form literals (ADR-004:35, "MP 的 authorship 7 值也只出現在單一小節...遷移成本目前很低"), and the ADR itself frames casing convergence as a zero-semantic-cost change (ADR-004:33). Does not affect `specs/governance/epistemic-label.schema.yaml`, which is unchanged by this proposal — the schema already contains the SNAKE_CASE canonical form.

## MIGRATION

Edit tool exact string replacement; recompute Method Atlas sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original space-form 11-value list. Zero downstream risk since Phase 3 has no code consuming this prose yet.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:18,21` (Context, identifying Atlas's 11 space-form values and the subset/casing-variant finding)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:33` (Decision Driver 3, casing-vs-cardinality distinction)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:80-91` (Recommendation schema block, `epistemic_type` 11-value SNAKE_CASE enum)
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:591-605` (read directly, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:17-23,37-56` (read directly; `source_of_truth_for` list names this exact Atlas location; `definitions.epistemic_type` enum)

## Diff

### Original

Method Atlas L591-605 (heading through closing fence, verbatim):

````text
### Epistemic Type 必須分離

```text
SOURCE FACT
EVIDENCE
ASSUMPTION
HYPOTHESIS
AI INFERENCE
AI SUGGESTION
HUMAN OPINION
CALCULATED RESULT
SIMULATED RESULT
UNKNOWN
DECISION
```
````

### Proposed

````text
### Epistemic Type 必須分離

canonical enum 定義見 `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type`（ADR-004 Sub-decision b）。以下為顯示用途，schema 為唯一正本：

```text
SOURCE_FACT
EVIDENCE
ASSUMPTION
HYPOTHESIS
AI_INFERENCE
AI_SUGGESTION
HUMAN_OPINION
CALCULATED_RESULT
SIMULATED_RESULT
UNKNOWN
DECISION
```
````

### Reason

ADR-004 Sub-decision (b), Option A, converged four drifted vocabularies onto a single 11-value SNAKE_CASE `epistemic_type` enum anchored in `specs/governance/epistemic-label.schema.yaml`, with Atlas's own copy explicitly called out as a zero-semantic-change casing conversion ("空格式全部替換為底線，零語意改動"). This edit executes exactly that transcription and adds the pointer sentence so future readers know the schema — not this prose block — is authoritative if the two ever appear to disagree.
