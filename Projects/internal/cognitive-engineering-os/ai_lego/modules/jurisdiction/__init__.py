"""F23 Global Jurisdiction / Compliance / Localization family (Atlas L931-956) -- 10 of 10
COMPLETE.

Built by 4 concurrent sibling agents in one batch, 2026-09-12: ``jurisdiction.resolver``
(refuses to collapse a multi-dimension input to a single-dimension country==XX
determination), ``jurisdiction.market_admission_control`` (admission_decision mechanically
derived -- ENABLE only if all 7 named pipeline stages PASS and human_signoff is present, else
FAIL_CLOSED, per Atlas Section 11.54's own explicit rule), ``jurisdiction.
applicable_law_graph`` (overlapping same-jurisdiction+scope law entries must both carry a
non-null conflict flag), ``jurisdiction.obligation_to_control_mapping`` (every obligation
covered by >=1 complete control), ``jurisdiction.compliance_gap_analysis`` (gaps mechanically
derived as required_controls minus implemented_controls, never asserted),
``jurisdiction.regulatory_horizon_scan`` (source_type restricted to a closed official-channel
set -- disambiguated from the pre-existing, differently-scoped ``foresight.horizon_scanning``),
``jurisdiction.localization_review`` (all 13 Atlas Section 12.43 dimensions required, not just
translation), ``jurisdiction.cultural_context_review`` (any HIGH-risk factor requires real
evidence -- Atlas Section 12.44's own explicit anti-stereotype rule made structural),
``jurisdiction.data_residency_assessment`` (every declared data class routed to >=1 region),
``jurisdiction.conflict_of_law_review`` (no finalized applicable_law without a human
legal_review already attached -- the strongest fail-closed/human-escalation pattern in this
family, disambiguated from the pre-existing, differently-scoped
``specs/jurisdiction/conflict-of-laws-output.schema.yaml`` via record prefix COLR- vs COL-).

Like F22, this family has no single shared core-principle line in the Atlas table header
(L931-956) -- each method's real invariant is disclosed independently in its own module
docstring and contract yaml. Registry entries: contract-backlog.yaml twohundredseventeenth
through twohundredtwentysixth_concrete_entry. See WORKLOG 2026-09-12 F23 entry for the full
closing summary.
"""

from __future__ import annotations
