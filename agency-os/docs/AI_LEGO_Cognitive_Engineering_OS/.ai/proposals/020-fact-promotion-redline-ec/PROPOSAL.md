---
proposal_id: "020"
slug: "fact-promotion-redline-ec"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L1489-1495"]
related_open_questions: ["OQ-8"]
change_class: "implementation feasibility"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Rewrite Execution Contract §38's forbidden-transition block (L1489-1495) from `UNKNOWN → FACT` to `UNKNOWN → SOURCE_FACT` (naming the correct canonical value), and expand the trailing sentence into the two explicit legal promotion paths — the same fix as `019-fact-promotion-redline-atlas`, applied to EC's own independent copy of this rule.

## RATIONALE

ADR-004's Context section identified that **both** mother documents state this redline independently and both reference a value absent from every enum: "FACT 提升紅線引用不存在的值：Atlas §21 強制規則 #2（L4151）`UNKNOWN 不得提升為 FACT`；EC §38 禁止區塊（L1489-1495）`UNKNOWN → FACT`。兩處引用的裸字 `FACT` 在任一份文件的任一 enum 中都不存在" (ADR-004:23). The Recommendation states the EC-specific fix explicitly, distinct from but paired with the Atlas fix: "EC L1489-1495：同步修正，`UNKNOWN → FACT` 改為 `UNKNOWN → SOURCE_FACT`（禁止直接跳轉），並列出上述合法路徑" (ADR-004:120) — "上述合法路徑" refers to the same two paths given for Atlas immediately above it in the same ADR paragraph (ADR-004:119): via Compute-produced evidence to `EVIDENCE`, or via Human Validation to `SOURCE_FACT`. Consequences confirms the shared intended effect for both copies: "Mandatory Gate Injection 與 FACT 提升紅線首次變得機器可實作" (ADR-004:124).

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§38 AI Output Trust Boundary, forbidden-transition block and trailing sentence (L1489-1495)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type/promotion_redline` already existing (confirmed present) and already encoding this exact forbidden transition and the two legal paths — this proposal brings EC's prose into agreement with content the schema already states.
- Should be considered alongside `019-fact-promotion-redline-atlas` (identical fix, different mother document, no line overlap since they touch different files).

## COMPATIBILITY

No implementation of this rule exists today — ADR-004:23 confirms the referenced literal (`FACT`) matches no enum value in either mother document, so this was already dead prose, not an active check this edit could break. Does not affect `specs/governance/epistemic-label.schema.yaml`, which already contains this exact rule and is unchanged by this proposal. Note EC's L1476-1486 already lists the 11-value SNAKE_CASE `epistemic_type` enum (including `SOURCE_FACT` and `EVIDENCE`) directly above this block, so EC's own text already contains the values this fix references — no new vocabulary is introduced.

## MIGRATION

Edit tool exact string replacement; recompute Execution Contract sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original (unenforceable) `UNKNOWN → FACT` text. Zero downstream risk since Phase 3 has no code consuming this prose yet, and no checker currently implements either the old or new wording.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:23` (Context, dead-literal finding, explicitly cites both Atlas and EC copies)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:119-120` (Recommendation, exact replacement wording for both Atlas L4151 and EC L1489-1495)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:124` (Consequences, positive effect statement)
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1469-1497` (read directly, §38 full section, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:57-69` (read directly; `promotion_redline` block already encodes `forbidden_transition` and `legal_paths` matching this proposal's wording)

## Diff

### Original

Execution Contract §38, L1469-1497 (full section shown for clarity — the changed range is L1489-1495):

````text
# 38. AI Output Trust Boundary

AI output 預設不是 trusted fact。

Epistemic labels：

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

禁止：

```text
UNKNOWN → FACT
```

沒有 Evidence / Compute / Human Validation 不得偷偷升級。

---

# 39. Trusted Compute Contract
````

### Proposed

Only L1489-1495 changes; the heading, intro sentence, and the 11-value epistemic-labels list (L1469-1487) are unchanged:

````text
禁止：

```text
UNKNOWN → SOURCE_FACT（直接跳轉）
```

合法路徑僅有：經 Compute 產生證據 → `EVIDENCE`，或經 Human Validation 確認 → `SOURCE_FACT`，兩者皆須寫入 authorship_state 與 execution manifest。
````

### Reason

EC states this same FACT-promotion redline independently of Atlas, and both currently reference a `FACT` literal that exists in no enum in either document. ADR-004 fixes both copies identically so a future checker validating either mother document's prose against `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type/promotion_redline` gets a consistent, implementable rule regardless of which document it reads.
