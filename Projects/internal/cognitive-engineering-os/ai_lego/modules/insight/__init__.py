"""F06 human/customer insight family (Atlas L457-469) -- COMPLETE, 9 of 9. Tenants:
``insight.jtbd`` (Jobs To Be Done -- the literal 3-clause "When/I want to/so I can" template from Atlas
§11.12, situation/motivation/desired_outcome all required non-empty; local_evidence is a hard, never-optional
requirement mechanizing §11.12's own "必須搭配 Local Evidence" -- motivation must never be assumed culturally
universal), ``insight.persona`` (research_basis non-empty is a hard requirement, mechanizing Atlas's own
"Persona ≠ 真實民意" -- a persona built with zero cited research basis is exactly the invented-composite abuse
that caution warns against), ``insight.empathy_map`` (closed 4-quadrant SAYS/THINKS/DOES/FEELS completeness
floor -- duplicates per quadrant allowed; every entry's basis is a required closed FACT/INFERENCE label,
mechanizing "標 fact/inference" and "不可純 AI 猜", kept structurally distinct from provenance's own
epistemic_type/authorship_state axes), ``insight.journey_map`` (stage_number forms an exact {1..N} sequence,
no gaps or duplicates, bool explicitly excluded from the integer check -- same bug class a critic pass had to
fix in the prior F03 batch's lotus_blossom.py, guarded here from the start), ``insight.service_blueprint``
(closed 5-layer CUSTOMER_ACTIONS/FRONTSTAGE/BACKSTAGE/SUPPORT_PROCESSES/SYSTEMS_DATA completeness floor per
Atlas's own more specific §12.16 5-layer structure, superseding the table row's 4-layer collapse -- avoiding
Atlas's own "避免只改 UI" frontstage-tunnel-vision failure mode), ``insight.contextual_inquiry`` (every
observation entry requires all 3 of action_observed/researcher_note/followup_question non-empty, mechanizing
the method's own literal "使用者做→研究者看→即時追問" cycle per entry, not just once for the whole session),
``insight.interview`` (a fixed, positionally-ordered 9-stage pipeline transcribing Atlas §12.17's own literal
chain verbatim, plus a separate required documented_biases field mechanizing "樣本與偏誤要記錄" as an active
check rather than a soft caution), ``insight.survey`` (BOTH of Atlas's two given structures: the table row's
5-stage sequential pipeline AND §12.18's 4 quality-concern completeness floor CONSTRUCT_VALIDITY/SAMPLING/
QUESTION_WORDING/NON_RESPONSE_BIAS; an asymmetric if/then requires semantic_equivalence_check+local_pilot_ref
when is_translated:true and structurally forbids both when false, mechanizing "全球要求：翻譯後必須做語義等值與
local pilot"), ``insight.focus_group`` (participant_count a real closed [6,10] integer range check, bool
explicitly excluded; generalizability_scope is a single-legal-value QUALITATIVE_EXPLORATION_NOT_POPULATION_
ESTIMATE enum structurally eliminated from the builder's own parameters, mechanizing "不用來估人口比例").

Built as one 9-agent parallel batch (2026-09-11, immediately following the F02/F03 batches) -- all 9 methods
are structurally disjoint (no cross-imports among each other) and each carries at least one real,
mechanically fail-closed invariant enforced at both the Python builder and an independent gate. Provenance
placement is UNIFORM across all 9 (record-level only, a single top-level `provenance` field), a deliberate
fixed batch-wide rule chosen specifically to avoid the per-item/record-level ambiguity that hit both the F02
and F03 batches (see their own WORKLOG entries) -- not a discovered pattern this time, a prescribed one.
"""
