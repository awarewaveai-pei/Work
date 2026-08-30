---
proposal_id: "014"
slug: "risk-tier-atlas-schema-pointer"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L1077"]
related_open_questions: ["OQ-7"]
change_class: "duplication removal"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Replace Method Atlas `selection_context.risk_tier` inline type definition (`low|medium|high|critical`, L1077) with a pointer to the newly-created `specs/execution/risk-tier.schema.yaml`, whose `#/risk_tier` enum (`R0|R1|R2|R3|R4`) is now the sole canonical value domain.

## RATIONALE

`docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md` Sub-decision (a) selected Option B (L42): "全系統改用 EC 的 R0-R4，Atlas 廢棄自己的四級" (ADR-004:42). The ADR's own Context section grep-audited Atlas's four-level enum and found it was never consumed except `critical` at a single site (§14.2 L3599): "Atlas 全文 grep 確認：`low|medium|high|critical` 四個字面值除 L1077 宣告外，僅 `critical` 在 L3599 被消費一次；`low/medium/high` 從未被任何條件式引用。Atlas 的四級是未展開的占位符，EC 的五級是唯一有實質語意的定義" (ADR-004:13). The Recommendation (ADR-004:66) states: "EC 的 R0-R4 成為唯一 canonical enum，實際值域定義從 EC §8 抽出成 `/specs/execution/risk-tier.schema.yaml`". This is the schema-anchoring half of Migration step 1 (ADR-004:131), already executed (the schema file exists and its own `description` field documents this exact rationale). This proposal is the pure documentation-pointer half of the same decision — it does not change the schema, only Atlas's prose reference to it.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

§10 Method Selection Engine / Selector Inputs, `selection_context.risk_tier` (L1077)

## DEPENDENCIES

- Depends on `specs/execution/risk-tier.schema.yaml` already existing (confirmed present at that path, `status: ACTIVE`, `decided_by: docs/adr/ADR-004...`).
- Should land in the same batch as `015-gate-injection-trigger-atlas` (same Atlas file, same sub-decision (a), non-overlapping line — L1077 vs L3599) to avoid a window where Atlas declares R0-R4 as its type but the Gate Injection trigger below it still reads the deprecated `critical` value.

## COMPATIBILITY

Does not affect any schema, policy, or code — `specs/execution/risk-tier.schema.yaml` is unchanged by this proposal (it already exists and already documents this pointer as its `source_of_truth_for` target). No implementation was found by the Phase 0 audit to depend on Atlas's `low|medium|high|critical` literal values (ADR-004:13, "Atlas 的四級是未展開的占位符"), so this is a pure prose correction with no downstream breakage.

## MIGRATION

Edit tool exact string replacement; recompute Method Atlas sha256 and update `document-hashes.yaml` afterward.

## ROLLBACK

`git revert` of the applying commit fully restores the original `low|medium|high|critical` inline text. Zero downstream risk since Phase 3 has no code consuming this prose yet, and the schema file itself is untouched by rollback.

## EVIDENCE

- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:13` (grep audit showing Atlas's four values are unconsumed placeholders except `critical`)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:42` (Option B recommendation table row)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:66` (Recommendation (a) text)
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md:131` (Migration step 1)
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1077` (read directly, confirmed exact current text)
- `specs/execution/risk-tier.schema.yaml:1-24` (read directly, confirms schema exists, is ACTIVE, and already declares this Atlas line as one of its `source_of_truth_for` targets)

## Diff

### Original

Method Atlas L1070-1089 (`selection_context` block; the changed line is L1077):

```yaml
selection_context:
  goal_type: ...
  problem_type: diagnostic|exploratory|creative|strategic|causal|decision|operational
  domain: ...
  jurisdiction_context: ...
  stakeholders: [...]
  risk_tier: low|medium|high|critical
  decision_criticality: ...
  evidence_available: ...
  data_available: ...
  uncertainty: ...
  reversibility: ...
  time_horizon: ...
  budget: ...
  time_budget: ...
  required_rigor: fast|professional|research_grade|board_grade
  cognitive_preferences: ...
  accessibility_needs: ...
```

### Proposed

```yaml
selection_context:
  goal_type: ...
  problem_type: diagnostic|exploratory|creative|strategic|causal|decision|operational
  domain: ...
  jurisdiction_context: ...
  stakeholders: [...]
  risk_tier: <specs/execution/risk-tier.schema.yaml#/risk_tier>  # R0|R1|R2|R3|R4；canonical enum，Atlas 不再自訂 low|medium|high|critical（ADR-004 Sub-decision a）
  decision_criticality: ...
  evidence_available: ...
  data_available: ...
  uncertainty: ...
  reversibility: ...
  time_horizon: ...
  budget: ...
  time_budget: ...
  required_rigor: fast|professional|research_grade|board_grade
  cognitive_preferences: ...
  accessibility_needs: ...
```

### Reason

`ADR-004` found Atlas's own four-level `risk_tier` enum was an unexpanded placeholder (only `critical` was ever read, by exactly one downstream rule) while EC's R0-R4 was the only definition in either mother document carrying concrete standards and required-action checklists. Rather than leave two independently-driftable enums in prose, the ADR routes both documents to a single schema file that is now the actual source of truth — this line stops being a definition and becomes a reference, consistent with EC's own Scoped Authority table (ADR-004:27) that "Exact Schema / Enum / Runtime Contract" belongs in approved machine-readable specs, not mother-document prose.
