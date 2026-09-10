"""F08 context & strategy family (Atlas L511-536) -- 10 of 14 built. Tenants:
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
mechanically ranked, matching Atlas's own "顯示不同風險" benefit).

Remaining 4 (Atlas L525-528): BCG, Blue Ocean, Business Model Canvas, Value Proposition Canvas."""
