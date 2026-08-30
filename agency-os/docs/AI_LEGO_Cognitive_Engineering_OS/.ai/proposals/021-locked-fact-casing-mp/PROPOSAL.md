---
proposal_id: "021"
slug: "locked-fact-casing-mp"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L975"]
related_open_questions: ["OQ-8"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "5cd2a4cb8"
---

## PROPOSED_CHANGE

Convert Master Plan §11.3's "Locked Fact" value (L975) from space-form casing `LOCKED FACT` to SNAKE_CASE `LOCKED_FACT`, matching Execution Contract §57's existing canonical form.

## RATIONALE

ADR-004's Context section identified this as the same casing-drift class of problem as `risk_tier` and `epistemic_type`, "同一問題的延伸": "EC §57（L1988-1990）`` `LOCKED_FACT` / `LOCKED_DECISION`：不得由 AI 修改 ``（SNAKE_CASE，兩個鎖定目標）；MP §11.3「Locked Fact」（L970-978）僅 `LOCKED FACT`（空格式，值於 L975）" (ADR-004:25). The Recommendation states the fix directly: "EC 的 SNAKE_CASE 兩值組成為 canonical；MP §11.3 的 `LOCKED FACT`（L975）機械轉 `LOCKED_FACT`" (ADR-004:116). Decision Driver 3 classifies this exact kind of casing divergence as a zero-semantic-cost mechanical correction, distinct from the cardinality/orthogonality questions elsewhere in this ADR that needed human judgment (ADR-004:33). This proposal is scoped to the casing fix only; the accompanying `LOCKED_DECISION` definition that ADR-004:116 also calls for is implemented separately in `022-locked-decision-definition-ec`, placed in Execution Contract §57 where `LOCKED_DECISION` is actually referenced (see that proposal's RATIONALE for why the definition lands there rather than in this MP section).

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§11.3 Locked Fact (L975, single value inside the fenced block L974-976)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml#/definitions/locked` already existing (confirmed present) and already listing `LOCKED_FACT` in SNAKE_CASE as the canonical value.
- Related to `022-locked-decision-definition-ec` (same overall LOCKED_FACT/LOCKED_DECISION fix from ADR-004, but a different mother document and non-overlapping lines); the two proposals can apply independently or in the same batch.

## COMPATIBILITY

Single-word casing change; the surrounding sentence "AI 永遠不得覆蓋。" (L978) and section heading are unchanged. Phase 0's audit found MP's `LOCKED FACT` value appears only in this single section (ADR-004:35, low migration cost pattern applied consistently across all casing sites in this ADR). Does not affect `specs/governance/epistemic-label.schema.yaml`, which already contains `LOCKED_FACT` in SNAKE_CASE and is unchanged by this proposal.

## MIGRATION

Edit tool exact string replacement; recompute Master Plan sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original `LOCKED FACT` space-form text. Zero downstream risk since Phase 3 has no code consuming this prose yet.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:25` (Context, LOCKED_FACT/LOCKED_DECISION casing-drift finding, CROSS-R-11)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:33` (Decision Driver 3, casing-vs-cardinality distinction)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:116` (Recommendation, explicit MP L975 casing fix instruction)
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:970-978` (read directly, §11.3 full section, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:89-102` (read directly; `definitions.locked` enum already lists `LOCKED_FACT` in SNAKE_CASE)

## Diff

### Original

Master Plan §11.3, L970-978 (verbatim; the changed line is L975):

````text
## 11.3 Locked Fact

人可指定：

```text
LOCKED FACT
```

AI 永遠不得覆蓋。
````

### Proposed

Only L975 changes:

```text
LOCKED_FACT
```

### Reason

ADR-004 established EC §57's SNAKE_CASE `LOCKED_FACT` / `LOCKED_DECISION` pair as canonical (matching the SNAKE_CASE convergence already applied to `epistemic_type` and `authorship_state`). MP §11.3's space-form `LOCKED FACT` is the same value under a divergent casing; this proposal removes that divergence with a pure single-word substitution, leaving the surrounding "human can designate / AI must never overwrite" rule text untouched.
