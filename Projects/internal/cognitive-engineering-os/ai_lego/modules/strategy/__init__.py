"""F08 context & strategy family (Atlas L511-536) -- COMPLETE, 14 of 14. Tenants:
``strategy.swot`` (internal S/W vs external O/T evidence-backed four-quadrant classification,
forbidden_transition guards SWOT -> AutomaticProductionDeployment via the platform's own fail-closed
method resolution, not a bespoke check), ``strategy.pestel`` (closed 6-dimension enum
POLITICAL/ECONOMIC/SOCIAL/TECHNOLOGICAL/ENVIRONMENTAL/LEGAL, per-factor Atlas L1368, L1386-1395's own
9-field shape including closed ``source_type`` enum and ``effective_from``/``effective_to`` ordering,
"真正可全球重用" per its own citation), ``strategy.steepv`` (thin table-row-only citation,
deliberately NOT borrowing PESTEL's 9-field richness which PESTEL's own citation supports but
STEEPV's own citation does not; required >=1 VALUES-dimension factor as the method's own
differentiator from PESTEL), ``strategy.three_c`` (Customer/Competitor/Company, required coverage
of all 3 dimensions plus a required non-empty disclosed ``fit_summary`` -- the method's own stated
purpose "找 fit"), ``strategy.tows`` (a REAL cross-method dependency on ``strategy.swot``'s actual
typed output -- ``pairing_type`` [SO/ST/WO/WT] is GENUINE_COMPUTE derived from the two referenced
SWOT factors' real categories, the builder REFUSES a caller-supplied pairing_type outright rather
than merely validating one, independent gate re-derives from raw fields; each pairing requires a
non-empty disclosed ``strategy_option`` per Atlas Section 11.8's own benefit line "把分析清單真正
轉成 Strategy Options"), ``strategy.porter_five_forces`` (closed 5-force SET with completeness
required but no position -- a third invariant shape distinct from ``causal.dag``'s VALID_ROLES
[closed set, no completeness] and ``causal.logic_model``'s STAGE_ORDER [closed, positional]; each
force carries a disclosed HIGH/MEDIUM/LOW ``intensity`` plus ``assessment``, never mechanically
scored; required non-empty ``overall_attractiveness`` matching the method's own stated benefit),
``strategy.vrio`` (closed 4-question SET [Value/Rarity/Imitability/Organization] with completeness
required, same shape class as porter_five_forces; ``competitive_implication`` is GENUINE_COMPUTE --
a total 16-cell lookup table over the 4 disclosed YES/NO answers, grounded in the real external
Barney 1991 Resource-Based-View classification [NOT an Atlas citation -- disclosed as this suite's
own addition, same discipline causal.process_tracing's Van Evera citation already established];
builder has no ``competitive_implication`` parameter at all, structurally preventing a caller-
asserted mismatch), ``strategy.value_chain`` (closed 2-value PRIMARY/SUPPORT category coverage
required [both, not just one], each activity requires a disclosed cost_driver and/or value_driver,
deliberately NOT enumerating Porter's real 9 named sub-activities since Atlas's own citation names
only the primary/support split), ``strategy.stp`` (genuinely SEQUENTIAL 3-stage pipeline --
Segmentation produces segments[], Targeting's targeted_segment_id must referentially resolve to a
real segment [same class of check strategy.tows already established for its own SWOT-factor
references, scaled to a single reference], Positioning requires a non-empty positioning_statement
as the method's own final required stage), ``strategy.ansoff`` (closed 4-quadrant SET with
completeness required -- MARKET_PENETRATION/MARKET_DEVELOPMENT/PRODUCT_DEVELOPMENT/DIVERSIFICATION,
disambiguated from Atlas's own bare "penetration/development/product/diversification" tokens via
the real well-known Ansoff Growth Matrix; each quadrant carries a disclosed risk_level, never
mechanically ranked, matching Atlas's own "顯示不同風險" benefit), ``strategy.bcg_matrix`` (open-ended
non-empty portfolio, not a fixed closed SET -- BCG classifies an unbounded number of products/business
units; each item discloses growth_rate/relative_share [HIGH/LOW], ``quadrant`` [STAR/CASH_COW/
QUESTION_MARK/DOG] is GENUINE_COMPUTE via a total 4-cell lookup table over the 2 disclosed axes,
builder has no quadrant parameter), ``strategy.blue_ocean`` (Strategy Canvas -> ERRC Grid, closed
4-value ELIMINATE/REDUCE/RAISE/CREATE action per factor; CREATE is structurally asymmetric from the
other 3 -- ``industry_standard_level`` is REQUIRED for ELIMINATE/REDUCE/RAISE [an existing competing
factor has a current industry level] and FORBIDDEN [key must be absent, not merely null] for CREATE
[introduces a factor the industry never had, so no standard exists to record], enforced at both
builder and schema-level if/then conditionals), ``strategy.business_model_canvas`` (closed 9-block
SET with completeness required -- the largest fixed-set F08 method, Osterwalder's real named blocks
verbatim from Atlas Section 12.15; Atlas's own explicitly-named limitation "business model hypothesis,
not a validated business" is mechanically enforced, not just disclosed -- ``validation_status`` is a
single-legal-value enum structurally eliminated from the builder's own parameters), ``strategy.
value_proposition_canvas`` (Customer Profile [jobs/pains/gains] -> Value Map [products_and_services/
pain_relievers/gain_creators] -> fit_hypotheses; ``fit_type`` [PAIN_RELIEF/GAIN_CREATION] is
GENUINE_COMPUTE derived from which collection a referenced reliever_or_creator_id and pain_or_gain_id
each resolve into, cross-checked against each other -- the third referential-integrity + GENUINE_COMPUTE
design this session, after strategy.tows and strategy.stp)."""
