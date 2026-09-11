"""F03 divergent ideation family (Atlas L375-397) -- COMPLETE, 10 of 10. Tenants:
``divergent.classic_brainstorming`` (structurally separates generation from evaluation -- ideas[] carry no
score field, additionalProperties:false forecloses it; evaluations[] may be empty, referential integrity
against real idea ids when non-empty, mechanizing Atlas's own "不要邊想邊否決"), ``divergent.brainwriting``
(individual_contributions require 2+ DISTINCT contributor_ids -- a single-voice "brainwriting" defeats
Atlas's own "降低權威/外向者主導" purpose; merged_ideas referentially resolve to real contributions, not
required to be bijective), ``divergent.six_three_five`` (headcount open-ended per Atlas's own "人數可調整"
caution -- never hardcoded to 6; exactly 3 ideas per round is fixed; every sheet's rotation must touch
every declared participant exactly once, a real round-robin completeness check), ``divergent.crazy_eights``
(exactly 8 concepts, box_number covering {1..8} each once, no two sketch_description identical -- all
GENUINE_COMPUTE structural checks grounded in the method's own literal "8 格、8 分鐘、8 方案" name),
``divergent.scamper`` (open-ended list over the closed 7-lens SUBSTITUTE/COMBINE/ADAPT/MODIFY/PUT/
ELIMINATE/REVERSE enum, no completeness required; validation_status is a single-legal-value
UNVALIDATED_IDEATION enum structurally eliminated from the builder's own parameters, mechanizing Atlas's
own "不等於市場驗證" caution), ``divergent.lotus_blossom`` (two independent fixed-8 closed-set checks,
nested: exactly 8 branches covering {1..8}, AND every branch's own ideas exactly 8 entries -- the method's
own literal "中心→8 分支→各 8 idea"), ``divergent.starbursting`` (deliberately differentiated from the
already-built framing.five_w_one_h despite sharing the same Who/What/When/Where/Why/How vocabulary --
completeness-required-with-no-upper-bound across the 6 categories, and every question_text must literally
end in ?/？, encoding Atlas's own "找未知與研究問題" as open research QUESTIONS rather than 5W1H's
problem-profiling STATEMENTS), ``divergent.random_stimulus`` (feasibility_status is a single-legal-value
NOT_YET_SCREENED enum structurally eliminated from the builder's own parameters, mechanizing Atlas's own
"需後續可行性篩選" caution), ``divergent.forced_connections`` (deliberately NOT a generalization of the
already-built association.morphological_analysis -- a fixed two-pool cross-product, not N-dimensional
combinatorics; every combination's feature_a_ref/feature_b_ref must resolve in the CORRECT side's own
declared pool, a cross-wired reference to the other side's real id is refused identically to a dangling
one), ``divergent.synectics`` (open-ended list over the closed 3-value DIRECT/PERSONAL/SYMBOLIC enum,
deliberately omitting external Synectics literature's own 4th "Fantasy Analogy" type since Atlas's own
citation names only 3; every entry requires a non-empty reframed_insight, not just an analogy label).

Built as one 10-agent parallel batch (2026-09-11, immediately following the F02 decomposition family's own
9-agent batch) -- all 10 methods are structurally disjoint (no cross-imports among each other) and each
carries at least one real, mechanically fail-closed invariant enforced at both the Python builder and an
independent gate, continuing this suite's GENUINE_COMPUTE / independent-gate-re-derivation / hand-tamper-
proof discipline. Provenance field placement (record-level vs per-item vs both) varies across these 10
methods by independent per-agent judgment -- a known, disclosed inconsistency also present in the prior F02
batch; not retroactively reconciled here (see WORKLOG 2026-09-11 F03 entry and each method's own
compilation_decisions for the specific reasoning).
"""
