---
proposal_id: "019"
slug: "fact-promotion-redline-atlas"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L4151"]
related_open_questions: ["OQ-8"]
change_class: "implementation feasibility"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "db166a94e"
---

## PROPOSED_CHANGE

Rewrite Method Atlas §21 Mandatory Rule #2 (L4151) from "`UNKNOWN` 不得提升為 `FACT`。" to name the correct canonical value (`SOURCE_FACT`, not the non-existent bare `FACT`) and spell out the two legal promotion paths.

## RATIONALE

ADR-004's Context section identified this rule as currently unenforceable: "此紅線目前無法被機器檢查器實作" (ADR-004:23), because "兩處引用的裸字 `FACT` 在任一份文件的任一 enum 中都不存在（只有 `SOURCE FACT` / `SOURCE_FACT`）" (ADR-004:23). Decision Driver 1 makes machine-checkability of exactly this rule the first-listed requirement for any acceptable option: "Mandatory Gate Injection 與 FACT 提升紅線目前都是「寫了但編譯器/檢查器無法實作」的死條款...任何方案必須讓這兩條規則變得可實作" (ADR-004:31). The Recommendation gives the exact replacement wording: "Atlas L4151：`` `UNKNOWN` 不得提升為 `FACT` `` → `` `UNKNOWN` 不得直接提升為 `SOURCE_FACT`；合法路徑僅有：經 Compute 產生證據 → `EVIDENCE`，或經 Human Validation 確認 → `SOURCE_FACT`，兩者皆須寫入 authorship_state 與 execution manifest。``" (ADR-004:119). Consequences confirms the intended effect: "Mandatory Gate Injection 與 FACT 提升紅線首次變得機器可實作" (ADR-004:124) — this is squarely an implementation-feasibility fix, not a rename: the rule's meaning was always "don't silently trust an unverified claim," but no checker could implement it because the referenced literal did not exist anywhere.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

§21 最小爆炸半徑 / 強制規則, rule #2 (L4151)

## DEPENDENCIES

- Depends on `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type/promotion_redline` already existing (confirmed present) and already encoding this exact forbidden transition and the two legal paths.
- Should be considered alongside `020-fact-promotion-redline-ec`, which applies the identical fix to Execution Contract's independent copy of this rule (§38, L1489-1495) — the two mother documents state this redline separately and both currently reference the same non-existent value, per ADR-004:23.

## COMPATIBILITY

No implementation of this rule exists today — ADR-004:23 confirms the referenced literal (`FACT`) matches no enum value in either mother document, so the rule was already dead prose, not an active check that this edit could break. Does not affect `specs/governance/epistemic-label.schema.yaml`, which already contains this exact rule (`promotion_redline`) and is unchanged by this proposal.

## MIGRATION

Edit tool exact string replacement; recompute Method Atlas sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original (unenforceable) rule text. Zero downstream risk since Phase 3 has no code consuming this prose yet, and no checker currently implements either the old or new wording.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:23` (Context, dead-literal finding)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:31` (Decision Driver 1, machine-checkability requirement)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:119` (Recommendation, exact replacement wording for Atlas L4151)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:124` (Consequences, positive effect statement)
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4136-4159` (read directly, §21 full section, confirmed exact current text)
- `specs/governance/epistemic-label.schema.yaml:57-69` (read directly; `promotion_redline` block already encodes `forbidden_transition` and `legal_paths` matching this proposal's wording)

## Diff

### Original

Method Atlas §21, rule list L4148-4159 (unchanged context shown for clarity — the changed line is L4151):

```text
## 強制規則

1. AI-generated idea 預設 `DRAFT`。
2. `UNKNOWN` 不得提升為 `FACT`。
3. 一個 Method execution failure 不得污染 Project Knowledge。
4. 高風險新 Method 先 shadow / preview。
5. `publish / deploy / delete / send / irreversible` 需要 authority gate。
6. Rollback 使用 Execution Manifest。
7. 新 Jurisdiction Pack 只能作用在其 scope。
8. Experiment 預設受限於 project / cohort / traffic slice。
9. 任何 destructive migration 必須有 prevalidated recovery path。
```

### Proposed

Only rule #2 (L4151) changes; rules 1 and 3-9 are unchanged:

```text
2. `UNKNOWN` 不得直接提升為 `SOURCE_FACT`；合法路徑僅有：經 Compute 產生證據 → `EVIDENCE`，或經 Human Validation 確認 → `SOURCE_FACT`，兩者皆須寫入 authorship_state 與 execution manifest。
```

### Reason

The rule's intent — never silently trust an unverified claim as fact — was always sound, but it was unenforceable because it named a value (`FACT`) that exists in no enum in this project. ADR-004 fixes this by naming the real canonical value (`SOURCE_FACT`) and enumerating the only two legal ways to reach it, making the rule something a checker could actually validate against `specs/governance/epistemic-label.schema.yaml#/definitions/epistemic_type/promotion_redline`.
