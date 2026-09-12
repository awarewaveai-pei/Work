"""F24 Representation / Cognitive Preference / Collaboration family (Atlas L959-973) --
10 of 10 COMPLETE. This is the LAST family in the 2026-09-12 Method Atlas Tier-1 backfill
push that opened and closed F15 (11/11), F22 (10/10), F23 (10/10), and F24 (10/10) in one
day -- 41 methods total.

Every method here obeys the shared "Representation Contract" architectural law (Atlas Section
9, L1040-1053): `View 只保存 layout/filters/visible_fields/presentation_preferences，不得複製
Knowledge 本體` -- a View record stores ONLY presentation state plus a reference to its source
Knowledge Object, never a duplicate of the Knowledge content itself.

Built by 4 concurrent sibling agents in one batch, 2026-09-12: ``representation.switching``
(every named view in a switch event must share the same knowledge_object_id and the same
provenance -- never fork into conflicting copies), ``representation.text_outline_view``
(evidence_links are reference-shaped only, summaries length-bounded, no stored content blob),
``representation.table_matrix_view`` (entities/criteria are reference-only id lists, every
score must carry computed:true -- never treated as canonical asserted data),
``representation.mind_map_view`` (renders an ARBITRARY Knowledge Object's own nodes at radial
positions -- deliberately NOT a copy of the pre-existing ``association.mind_map``, which
GENERATES new central_topic/branches/keywords content; disambiguated by record prefix MMVIEW-
vs MINDMAP- and a dedicated structural-incompatibility test), ``representation.
concept_graph_view`` (every rendered edge's relation_type/provenance must exactly match its
source relation -- never fabricate a relationship through the rendering layer),
``representation.timeline_view`` (event order is mechanically derived from each event's own
event_time, never asserted -- a timeline that isn't genuinely time-sorted actively misleads),
``representation.causal_view`` (every rendered edge must carry a non-empty assumption -- Atlas
L969's own "避免一般圖誤當因果" made structural), ``representation.audio_conversational_view``
(a voice-derived structured object can never be CONFIRMED without readback_transcript +
confirmed_by_user evidence -- mirrors F23's conflict_of_law_review human-confirmation
convention), ``representation.guided_mode`` (a method selection must trace to a real
question->answer trail AND resolve as a real, ACTIVE method in the corpus's own live
MethodCatalog -- no black-box selections), ``representation.expert_lego_mode`` (compile_status
is mechanically derived, never a builder parameter -- COMPILED iff all 7 named compiler checks
are present and PASS, else REJECTED -- Atlas's own "自由組裝，不是自由破壞" made structural).

Registry entries: contract-backlog.yaml twohundredtwentyseventh through
twohundredthirtysixth_concrete_entry. See WORKLOG 2026-09-12 F24 entry for the full closing
summary of this family AND the entire F15+F22+F23+F24 push.
"""

from __future__ import annotations
