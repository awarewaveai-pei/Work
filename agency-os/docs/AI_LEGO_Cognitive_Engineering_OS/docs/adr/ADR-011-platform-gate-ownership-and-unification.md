# ADR-011: Platform-wide Global/High-risk Gate — Ownership, Content Union, and Naming Unification (OQ-10)

Status: ACCEPTED（2026-08-30，操作者明示授權 Claude 行使架構師裁決權，同 ADR-001~010 範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 `status: APPROVED` 僅操作者本人可推進）
Date: 2026-08-30
Related: ADR-003（本 ADR 沿用其「detail 只留一處，其餘指向 SSOT」的去重原則，`ADR-003:92`）、ADR-004（本 ADR 的 R3∪R4 gate injection 觸發條件已由其裁決，本 ADR 不重新裁決）、ADR-005（本 ADR 沿用其「挑已經被機器讀契約用到的版本，而非敘事範例」的裁決精神，`status-codes.schema.yaml:57-59` 轉引）、`specs/execution/gate.schema.yaml`、`policies/ai-execution/mandatory-gates.yaml`（本 ADR 的直接消費者，兩檔皆已預先寫好「等 Round 2 ADR」的骨架）

## Context

`.ai/research/phase-0/open-questions.yaml` OQ-10（L68-72）：

> "Owner of platform-wide Global/High-risk Gate: MP §158 (11 items) vs Atlas §22 (14+6) vs EC §68 copy" — status `REQUIRES_HUMAN_DECISION`, deadline "Phase 2 (ADR)"。

Three independently-confirmed findings (`.ai/research/phase-0/verified-findings.yaml`) describe the same underlying dispute from three angles:

- **CROSS-R-5** (`verified-findings.yaml:98-116`, severity high, 3/3 independent votes CONFIRMED): Master Plan §158 "Global Definition of Done" (`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5903-5926`) requires **11** Global PASS items and adds only **1** high-risk item ("Human Specialist Review PASS"). Method Atlas §22.1/§22.2 (`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4164-4194`) requires **14** Global items (adds Evidence/Reasoning/Capacity) and **6** high-risk add-ons. A deliverable satisfying MP §158 in full can still fail Atlas §22.2 (no Red Team, no Counterevidence, no Recovery Rehearsal).
- **CROSS-R-7** (`verified-findings.yaml:398-421`, severity medium, 3/3 CONFIRMED): Atlas §22.1/§22.2 legislate a **platform-wide** gate, but neither Master Plan's own Scoped Authority table (`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:53-58`, row for Method Atlas: *"Cognitive Primitive / Method / Lens / Method Selection / Method Contract / Method-specific Gate / Cognitive Recipe"*) nor Execution Contract's own table (`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:100-109`, row for Method Atlas: *"Method-specific Quality Gate"*) grants Atlas authority over anything broader than **Method-specific** gates. §22.3 (Method-specific Gate table) is in-scope; §22.1/§22.2 are not.
- **CROSS-T-11** (`verified-findings.yaml:495-517`, severity medium, 2/2 CONFIRMED): Execution Contract §68 (`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2246-2278`) independently copies Atlas's 14+6 item **counts**, but with **name drift** on 3 items: Atlas "Independent Judge PASS" vs EC "Independent Review"; Atlas "Human Specialist Review PASS" vs EC "Human Specialist"; Atlas "Recovery / Rollback Rehearsal PASS" vs EC "Recovery Rehearsal". No shared gate-id registry exists to keep the two lists from diverging further under maintenance.

Two Phase 3 machine-readable-spec files (`specs/execution/gate.schema.yaml`, `policies/ai-execution/mandatory-gates.yaml`, both built 2026-08-29) were deliberately compiled with the gate-list content left `TBD_PENDING_ROUND2_ADR` for exactly this reason — both files' `gate_id_registry`/`blocked_scope` sections record all three candidate lists verbatim and explicitly decline to pick a side, naming this ADR's resolution as their unblocking condition. `execution/risk-tier.schema.yaml`'s `mandatory_gate_injection_trigger.required_gates_pending_round2_adr` (L135-147) carries the identical forward reference.

**Re-verified against the mother documents directly in this session** (not merely trusted from `verified-findings.yaml`'s summaries):

- MP §158 full text read at `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5900-5926`.
- Atlas §22 full text read at `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4160-4200`.
- EC §68-69 full text read at `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2240-2295`.
- MP's own Scoped Authority table (`§0.0.1`, L53-58) and EC's own Scoped Authority table (L98-109) both read in full — see Sub-decision (a) below, which is the crux this ADR turns on and was **not** already stated in `verified-findings.yaml`'s CROSS-R-7 detail (that finding only names Atlas's violation; this ADR's own re-read of EC's table found EC's §68 is **symmetrically** out of EC's own granted scope too — a new observation, recorded honestly as this ADR's own finding, not attributed to Phase 0/1).

## Decision Drivers

1. **Respect the corpus's own already-decided Scoped Authority rule, don't invent a new arbitration mechanism.** Master Plan §0.0.2 (L61-77) already establishes *"不得用單一「哪份文件永遠優先」粗暴處理所有衝突，採 Scoped Authority"* — the two per-document tables (MP L53-58, EC L98-109) are not narrative color, they are the corpus's own operative conflict-resolution mechanism. This ADR's job is to apply that existing mechanism to OQ-10, not to pick a winner by aesthetic or convenience judgment.
2. **30-year survivability / no dual-maintenance.** Same driver ADR-003 sub-decision (c) used (`ADR-003:92`, citing MP L45's own ban on dual-maintaining method definitions): three documents independently legislating the same checklist will keep drifting under maintenance (CROSS-T-11 is the drift already observed after presumably one authoring pass). A single SSOT with the other two reduced to pointers is structurally the only fix that survives decades of future edits by engineers who cannot be relied upon to remember to edit three places at once.
3. **Fail-closed over fail-open when candidates differ only by completeness, not by genuine disagreement.** Consistent with ADR-003 sub-decision (b)'s "Fail-closed over fail-open" driver and Atlas §21 rule 1 (AI-generated idea defaults to `DRAFT`). If one candidate list is a strict subset of another (every item the smaller list requires, the larger list also requires, plus more), adopting the larger list is not "picking a side" in a genuine disagreement — it is closing a completeness gap without weakening anything the smaller list already guaranteed.
4. **Do not re-litigate what ADR-004 already decided.** The R3∪R4 gate-injection trigger *condition* (when the mandatory-gate mechanism fires) is already ADR-004-decided and is orthogonal to this ADR's question (which items the mechanism checks once it fires) — `mandatory-gates.yaml`'s own `compilation_decisions` (first entry) already drew this exact boundary; this ADR does not touch it.
5. **Minimize edit surface — reuse the two files already built for this.** `gate.schema.yaml` and `mandatory-gates.yaml` were compiled 2026-08-29 with an explicit, structured "blocked" section naming this exact ADR as the unblocking event. This ADR's Recommendation is written to slot directly into those existing structures rather than requiring a redesign.

## Sub-decision (a): Ownership — which document's authority actually covers this?

**Decision: Master Plan is the sole canonical owner of the platform-wide Global/High-risk Gate. Method Atlas §22.1/§22.2 and Execution Contract §68 are both out-of-scope duplicate legislation and are reduced to pointers citing Master Plan §158 as SSOT. Atlas retains §22.3 (Method-specific Gate) and Execution Contract retains §69 (Gate Result — the execution mechanism/record shape) — both squarely inside each document's own granted scope.**

Evidence, read directly from each document's own self-declared authority table rather than inferred:

| Document | Its own granted scope (verbatim) | Covers platform-wide Global/High-risk Gate? |
|---|---|---|
| Master Plan | `§0.0.1` (`MP:53-58`): *"Product / Architecture / Domain / Platform / Security / Data / Global / Deployment / **Governance**"* | **Yes** — a platform-wide "Definition of Done" is squarely a Governance artifact by its own name, and MP's grant explicitly includes Governance. Separately, MP's Global Gate items name exactly the domains MP's own row 2 elsewhere claims (see EC's table below): Security, Privacy, Data, Jurisdiction. |
| Method Atlas | `§0.0.1` (`MP:53-58`, Atlas's row): *"Cognitive Primitive / Method / Lens / Method Selection / Method Contract / **Method-specific Gate** / Cognitive Recipe"* | **No** for §22.1/§22.2 (this is CROSS-R-7, independently 3/3-confirmed). **Yes** for §22.3 (Method-specific Gate is explicitly granted). |
| Execution Contract | Its own table (`EC:98-109`): *"Security / Data / Deployment / Global Jurisdiction Architecture → Global Master Plan + approved machine policies"* (row 2, EC's own words assign THIS to Master Plan, not to itself); *"Method-specific Quality Gate → Method Atlas"* (row 4); *"AI 執行生命週期 → Execution Contract"* (row 5). No row grants EC platform-wide Global/High-risk Gate authority. | **No** for §68's Global/High-risk list — this is a **new observation this ADR makes**, not previously named by CROSS-R-7 (which only cited Atlas). EC's own table, read directly, assigns the exact subject-matter domains §68's checklist covers (Security, Data, Jurisdiction) to Master Plan, not to itself. **Yes** for §69 (Gate Result execution mechanism — squarely "AI 執行生命週期"). |

This closes CROSS-R-7 without deepening it: rather than leaving EC's §68 unexamined (as Phase 0's finding did, since it target Atlas specifically), this ADR applies the identical scope test symmetrically and finds EC in the same position. Both duplicates collapse to pointers; only the mechanism-layer content (Atlas §22.3, EC §69) that each document's own table actually grants stays where it is.

This mirrors — not coincidentally — the pattern ADR-003 sub-decision (c) already used for the blast-radius chain (`ADR-003:92`: *"Master Plan L45 forbids dual-maintaining method definitions in the Master Plan narrative. Treating Method Atlas as the single source of truth ... is the corpus's own established pattern."*). The difference here is which document ends up as SSOT: there, Atlas held the more-detailed, in-scope content; here, Master Plan does, per the tables above — the *method* (find whichever document's own granted scope actually covers the disputed content, make that one the SSOT, reduce the rest to pointers) is identical.

## Sub-decision (b): Content — reconciling the 11-vs-14 and 1-vs-6 item counts

**Decision: Master Plan §158's content (once amended via the ADR-006 `.ai/proposals/` process) adopts the union of all three candidates — 14 Global items and 6 High-risk add-on items. No item is removed from any candidate; the union only adds.**

Verification that this is a strict superset relationship, not a genuine disagreement requiring a value judgment:

- **Global tier**: MP's 11 items (Functional, Security, Privacy, Jurisdiction, Localization, Accessibility, Data, Observability, Rollback, Documentation, Golden Test) are — checked term-by-term — **all 11 present verbatim** in Atlas's 14-item list (`Atlas:4167-4180`). Atlas's 3 extra items (Evidence, Reasoning, Capacity) are pure additions; none of MP's 11 items is contradicted, renamed, or dropped.
- **High-risk tier**: MP's sole high-risk item ("Human Specialist Review PASS", `MP:5923-5926`) is present verbatim in Atlas's 6-item high-risk list (`Atlas:4188-4193`). Atlas's 5 extra items (Counterevidence, Red Team, Independent Judge, Reversal Criteria, Recovery/Rollback Rehearsal) are pure additions.

Because the relationship is strict-subset/strict-superset in both tiers — not three candidates asserting mutually exclusive requirements — Decision Driver #3 (fail-closed, adopt the union when one list is a completeness gap in another) applies directly. This is not "Atlas/EC win the content fight and MP loses" — MP keeps every one of its 17 requirements (11+1) unconditionally; it gains 8 more (3 Global + 5 High-risk) that were never in tension with what it already required. Rejecting the union in favor of MP's narrower original list would mean deliberately keeping a documented gap (no Red Team, no Counterevidence, no Recovery Rehearsal for high-risk deliverables) that this project's own more-detailed methodology document (Atlas) and its own execution-layer document (EC) both independently flagged as necessary — the same fail-open outcome Decision Driver #3 exists to avoid.

## Sub-decision (c): Naming — resolving CROSS-T-11's 3-item name drift and defining the machine `gate_id` slugs

**Decision: For the 3 drifted items, adopt Atlas's wording as the canonical human-readable display name (EC's 3 names become deprecated aliases, same treatment `status-codes.schema.yaml` already used for its own MP/EC duplicate resolution). Separately, define machine-readable `gate_id` values as clean snake_case slugs with the "PASS" suffix stripped — because `gate.schema.yaml`'s own `gate_result` shape already carries `status` (PASS/FAIL/BLOCKED/NOT_APPLICABLE) as an independent field, so an identifier that bakes in "_pass" would read self-contradictory the moment that gate's actual status is FAIL (e.g. `gate_id: functional_pass, status: FAIL`).**

Reasoning for preferring Atlas's wording over EC's for the 3 drifted items:

- "Human Specialist Review PASS" — MP's own high-risk item (`MP:5926`) already uses this **exact** wording, matching Atlas verbatim. EC's "Human Specialist" is the outlier against 2-of-3 sources, not Atlas's alone.
- "Independent Judge PASS" vs EC's "Independent Review" and "Recovery / Rollback Rehearsal PASS" vs EC's "Recovery Rehearsal" — MP is silent on both (MP's high-risk tier has only the one item above), so the tiebreak falls to which of Atlas/EC's conventions is consistent with MP's own established style. MP's 11 Global items are *all* written with the "`<Name> PASS`" suffix (`MP:5910-5920`) — Atlas's naming convention matches this pattern for every one of its 20 items; EC's bare-name convention (no "PASS" suffix on any of its 14+6 items, `EC:2246-2276`) is the one that breaks from the corpus's dominant checklist-item style.

Canonical registry (20 items — 14 Global + 6 High-risk; Method-specific gates remain Atlas §22.3's own open-ended, per-method namespace and are explicitly out of this ADR's scope, unchanged):

| Tier | `gate_id` (machine slug) | Canonical display name | Source of wording |
|---|---|---|---|
| GLOBAL | `functional` | Functional PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `evidence` | Evidence PASS | Atlas §22.1 (MP silent — pure addition) |
| GLOBAL | `reasoning` | Reasoning PASS | Atlas §22.1 (MP silent — pure addition) |
| GLOBAL | `security` | Security PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `privacy` | Privacy PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `data` | Data PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `jurisdiction` | Jurisdiction PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `localization` | Localization PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `accessibility` | Accessibility PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `observability` | Observability PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `capacity` | Capacity PASS | Atlas §22.1 (MP silent — pure addition) |
| GLOBAL | `rollback` | Rollback PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `documentation` | Documentation PASS | MP §158 / Atlas §22.1 (verbatim match) |
| GLOBAL | `golden_test` | Golden Test PASS | MP §158 / Atlas §22.1 (verbatim match) |
| HIGH_RISK | `human_specialist_review` | Human Specialist Review PASS | MP §158 / Atlas §22.2 (verbatim match; EC "Human Specialist" deprecated alias) |
| HIGH_RISK | `counterevidence` | Counterevidence PASS | Atlas §22.2 (MP silent — pure addition; EC "Counterevidence" — no drift, kept) |
| HIGH_RISK | `red_team` | Red Team PASS | Atlas §22.2 (MP silent — pure addition; EC "Red Team" — no drift, kept) |
| HIGH_RISK | `independent_judge` | Independent Judge PASS | Atlas §22.2 (MP silent — pure addition; EC "Independent Review" deprecated alias) |
| HIGH_RISK | `reversal_criteria` | Reversal Criteria PASS | Atlas §22.2 (MP silent — pure addition; EC "Reversal Criteria" — no drift, kept) |
| HIGH_RISK | `recovery_rollback_rehearsal` | Recovery / Rollback Rehearsal PASS | Atlas §22.2 (MP silent — pure addition; EC "Recovery Rehearsal" deprecated alias) |

## Method Used

Direct application of an already-decided corpus mechanism (Master Plan §0.0.2 Scoped Authority) to a specific dispute, the same class of method ADR-010 used for its Sub-decision (a) (`ADR-010:108`: *"Direct application of an already-decided principle... rather than re-running ATAM from scratch"*). Evidence Triangulation (three independent documents' own tables cross-checked against each other, same method `ADR-009:162`/`ADR-010:109` used) grounds Sub-decision (a). A term-by-term set-membership check (not narrative comparison) grounds Sub-decision (b)'s subset/superset claim. R4 聲稱即驗證: all three mother-document sections were re-read in full at their cited lines in this session, not trusted from `verified-findings.yaml` summaries alone (see Context's final paragraph).

## Recommendation

1. **(a)** Master Plan §158 becomes the sole canonical Global/High-risk Gate definition. Atlas §22.1/§22.2 and EC §68 are reduced to one-line pointers ("see Master Plan §158 — SSOT") when next edited via the ADR-006 proposal process. Atlas §22.3 and EC §69 are unaffected — both stay exactly as they are, already within each document's own granted scope.
2. **(b)** Master Plan §158's content, once amended, is the union: 14 Global items + 6 High-risk add-on items (table above). No existing MP requirement is weakened or removed.
3. **(c)** The 20-item canonical registry above (table above) becomes the `gate_id` value space for `specs/execution/gate.schema.yaml#/gate_result/properties/gate_id` and `policies/ai-execution/mandatory-gates.yaml#/definitions/mandatory_gate_rule/properties/gate_ref` — both files already scaffolded to receive exactly this. EC's 3 drifted names (`Human Specialist`, `Independent Review`, `Recovery Rehearsal`) become documented deprecated aliases, not silently discarded.

This closes OQ-10, CROSS-R-5, CROSS-R-7 (both halves — Atlas's originally-named violation and EC's newly-observed symmetric one), and CROSS-T-11.

## Consequences

- Positive: the platform gains a single, machine-checkable Global/High-risk Gate list for the first time — `gate.schema.yaml` and `mandatory-gates.yaml`'s `gate_id`/`gate_ref` fields move from an unusable `TBD_PENDING_ROUND2_ADR` placeholder to real, validated values. Future maintenance edits one document (MP §158) instead of three.
- Negative: a high-risk deliverable that previously only had to satisfy MP §158's literal 11+1 items now has 8 more real requirements (3 Global + 5 High-risk) to satisfy once this ADR's content is actually applied to running gates — an accepted, intentional cost (Decision Driver #3), not an oversight.
- New follow-up surfaced (not solved here): (i) Atlas §22.3's Method-specific Gate table remains its own open-ended, per-method `gate_id` namespace — this ADR does not decide whether it shares the same flat `gate_id` string space as the 20 Global/High-risk ids above or needs a prefixed/namespaced form (`gate.schema.yaml`'s own `OQ-GATE-3` already tracks this, unresolved by this ADR); (ii) this ADR does not draft the actual replacement §158/§22/§68 prose — that is downstream ADR-006 proposal work; (iii) `mandatory-gates.yaml`'s `OQ-MGATE-2` (whether a Recovery/Rollback-class R3/R4-triggered rule should be added) can now be revisited, since the previously-blocking "2-of-3 convergence" concern no longer applies once MP's own content is the union — left for the schema-file update following this ADR, not decided in the ADR text itself.

## Migration / Rollback

- **Migration**: zero-cost at this moment — no code or runtime data depends on any gate_id value yet (same greenfield framing ADR-003/ADR-010 used). The only immediate "migration" is editing `gate.schema.yaml` and `mandatory-gates.yaml` (machine-readable specs, Low-risk per this project's own established distinction between schema-compilation edits and mother-document edits) to replace their `TBD_PENDING_ROUND2_ADR` placeholders with the registry above — done as a follow-up commit to this ADR, not the ADR file itself. The mother-document prose edits (MP §158 content amendment, Atlas §22.1/22.2 and EC §68 reduction to pointers) require the separate ADR-006 `.ai/proposals/` flow before they touch the actual `.md` files.
- **Rollback**: git-revert fast path — this ADR and its consuming schema-file edits are pure documentation/schema changes with no runtime side effects yet (same class as 7 of the prior 10 ADRs, per `rollback.schema.yaml`'s own cross-ADR pattern analysis). `git_revert_sufficient: true`, `rollback_risk: Low`.

## Evidence

- `.ai/research/phase-0/open-questions.yaml:68-72` (OQ-10 definition).
- `.ai/research/phase-0/verified-findings.yaml:98-121` (CROSS-R-5, full detail + 3 verdict votes), `:398-421` (CROSS-R-7, full detail + 3 verdict votes), `:495-517` (CROSS-T-11, full detail + 2 verdict votes) — all re-read in full this session.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5900-5926` (§158 Global Definition of Done, full text, re-read this session).
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4160-4200` (§22 Quality Gates, full text, re-read this session).
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2240-2295` (§68-69 Global Gates + Gate Result, full text, re-read this session).
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:53-90` (§0.0.1 文件職責分離 table, §0.0.2 Scoped Authority diagram — both re-read this session; grounds Sub-decision (a)).
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:95-112` (own Scoped Authority table — re-read this session; grounds the new EC-side observation in Sub-decision (a)).
- `specs/execution/gate.schema.yaml:1-312` (existing scaffold naming this ADR as its unblocking event, `gate_id_registry.disputed_candidates`).
- `policies/ai-execution/mandatory-gates.yaml:1-490` (existing scaffold, `blocked_scope`, `OQ-MGATE-1/2`).
- `specs/execution/risk-tier.schema.yaml:135-147` (`mandatory_gate_injection_trigger.required_gates_pending_round2_adr`, forward reference to OQ-10).
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:328` (MRSP-1 Open Question row).
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:92,94` (dual-maintenance-ban precedent reused for Sub-decision (a)'s method); `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` reasoning reused via `specs/execution/status-codes.schema.yaml:57-59`'s own citation of it (naming-drift resolution precedent for Sub-decision (c)); `docs/adr/ADR-010-database-platform-and-table-naming.md:108-109` (Method Used precedent: direct application of an already-decided principle).
- `specs/execution/status-codes.schema.yaml:145-157` (existing precedent in this exact project for resolving a two-document naming duplicate via a canonical-name-plus-deprecated-alias pattern — reused verbatim as this ADR's Sub-decision (c) method).

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改。本 ADR 本身即為輸出；套用至 `gate.schema.yaml`/`mandatory-gates.yaml`（機讀 spec，非母文件）留待本 ADR 之後的獨立編輯完成。
