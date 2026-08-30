---
proposal_id: "015"
slug: "gate-injection-trigger-atlas"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L3599"]
related_open_questions: ["OQ-7"]
change_class: "semantic correction"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "434fd8673"
---

## PROPOSED_CHANGE

Change Method Atlas §14.2 Mandatory Gate Injection's trigger condition (L3599) from `risk_tier = critical` to `risk_tier IN {R3, R4}`.

## RATIONALE

**This is explicitly flagged by ADR-004 itself as a semantic change, not a pure rename — it is not being treated casually.** The ADR's own Status line states this up front: "**含 Gate Injection 觸發範圍擴大（critical→R3∪R4）之明確認可**：本 ADR 自己已誠實標註此為語意變更非純重命名（見 Consequences 段）" (ADR-004:3). The Consequences section repeats the flag: "Gate Injection 觸發條件從「critical 單一值」擴大為「R3 ∪ R4」是**語意變更**而非純重命名——需操作者明確認可這個擴大" (ADR-004:126). The Recommendation's migration crosswalk table makes the mechanism explicit: mapping `critical` to `R4` alone would be lossy, because "Atlas §14.2 gate injection 清單（Evidence Matrix/Counterevidence/Red Team/Human Specialist Review/Reversal Criteria）逐項比對 EC R3+R4 要求的**聯集**才完整覆蓋——若只映射到 R4，會讓落在 R3 的操作（如 DB migration、Identity/Authorization 變更）漏掉本該有的 Red Team/Counterevidence" (ADR-004:75). The Migration section restates the approval gate for this specific step: "Atlas L1077 `risk_tier` 型別改指向 schema；L3599 Gate Injection 條件改為 `risk_tier IN {R3, R4}`——**此步驟需操作者明確確認語意擴大是否可接受**，若不接受則退回 Option A 並補一張有損映射表，屬另一次獨立決策" (ADR-004:132). Per the Status line, the operator has already granted the architect-discretion authorization under which ADR-004 was ACCEPTED (2026-08-29), and the ADR's own justification for the expansion is closing a pre-existing protection gap: R3-tier operations (DB migration, Identity/Authorization changes) were not receiving Red Team / Counterevidence review under the old single-value trigger, even though Atlas's own gate-injection block semantically corresponds to the union of EC's R3+R4 requirements, not R4 alone. This proposal still requires the standard human `APPROVED` step of the `.ai/proposals/` flow before it can be applied to the mother document — the ADR's decision-level acceptance is not the same as mother-document edit authorization (per this repo's OQ-6 flow, ADR-004:39-46 equivalent).

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

§14.2 Mandatory Gate Injection, trigger condition line (L3599)

## DEPENDENCIES

- Should land in the same batch as `014-risk-tier-atlas-schema-pointer` (same file, same sub-decision (a)), so Atlas's `risk_tier` type and its sole consumer (this trigger) change together rather than leaving a window where the type points to R0-R4 but the trigger still tests for the deprecated `critical` value.
- Depends on `specs/execution/risk-tier.schema.yaml`'s `mandatory_gate_injection_trigger` block already existing and already declaring `condition: "risk_tier IN [R3, R4]"` — this proposal brings Atlas's own prose into agreement with a machine-readable condition that already exists.

## COMPATIBILITY

No schema, policy, or code implements this trigger today (ADR-004:13 confirms Atlas's gate-injection prose was previously unimplementable dead text, since it referenced a value with no schema behind it). This proposal makes the condition line agree with `specs/execution/risk-tier.schema.yaml#/mandatory_gate_injection_trigger`, which already exists and already encodes `risk_tier IN [R3, R4]`. **Explicitly flagging the widened blast radius**: once any future implementation reads this line, operations tiered R3 (DB migration, security boundary, identity/authorization, privacy, AI routing, legal/jurisdiction, financial/regulated workflow, large data backfill — per `risk-tier.schema.yaml` R3 examples) will newly receive Mandatory Gate Injection (Evidence Matrix / Counterevidence / Red Team / Human Specialist Review / Reversal Criteria) that they did not receive under the old `critical`-only (≈R4-only) trigger. This is the intended effect of ADR-004 Sub-decision (a), not a side effect.

## MIGRATION

Edit tool exact string replacement; recompute Method Atlas sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores `risk_tier = critical`. Zero downstream risk since Phase 3 has no code consuming this prose yet — reverting narrows the gate-injection trigger back to its pre-existing (narrower, gap-containing) scope, which is a safe direction to roll back to.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:3` (Status line, explicit semantic-change flag and operator authorization)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:75` (migration crosswalk table row for `critical`→`R4`, explaining the union-vs-single-value gap)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:126` (Consequences, negative/risk paragraph repeating the semantic-change flag)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:132` (Migration step 2, explicit operator-confirmation gate for this exact edit)
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3588-3612` (read directly, §14.2 full section, confirms exact current text)
- `specs/execution/risk-tier.schema.yaml:99-107,128-134` (read directly; `gate_injection` block under R3 and `mandatory_gate_injection_trigger` top-level block, confirms the target condition already exists in the schema)

## Diff

### Original

Method Atlas §14.2, L3588-3612 (full section, unchanged context shown for clarity — the changed line is L3599):

````text
## 14.2 Mandatory Gate Injection

Compiler 可以自動插入 mandatory block。

例如：

```text
User workflow:
Idea → MCDA → Decision
```

如果 `risk_tier = critical`：

```text
Compiler result:
Idea
→ Evidence Matrix
→ Counterevidence
→ Red Team
→ Scenario
→ MCDA
→ Human Specialist Review
→ Decision
→ Reversal Criteria
```

使用者可以看見：

- 哪些 block 是自己選的。
- 哪些 block 是 AI 推薦。
- 哪些 block 是 Policy 強制。
- 為什麼不能移除。
````

### Proposed

Only L3599 changes; all other lines in the section (including the compiler-result example) stay as-is:

```text
如果 `risk_tier IN {R3, R4}`：
```

### Reason

ADR-004 Sub-decision (a), Option B, found that Atlas's Mandatory Gate Injection block (Evidence Matrix / Counterevidence / Red Team / Human Specialist Review / Reversal Criteria) semantically corresponds to the union of EC's R3 and R4 requirements, not R4 alone — mapping only to R4 would silently drop Red Team/Counterevidence review for R3-tier operations such as DB migration and identity/authorization changes. The ADR explicitly labels this a semantic expansion requiring operator sign-off (not a cosmetic rename), and frames it as closing a pre-existing protection gap rather than introducing new unproven scope, since Phase 0's audit found no implementation currently depends on the old single-value trigger.
