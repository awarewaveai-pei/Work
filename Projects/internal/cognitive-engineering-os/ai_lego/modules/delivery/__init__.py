"""F22 PM / delivery / governance family (Atlas L914-929) -- 10 of 10 COMPLETE.

Built by 4 concurrent sibling agents in one batch, 2026-09-12: ``delivery.raid_log`` (closed
RISK/ASSUMPTION/ISSUE/DEPENDENCY type set + closure requires evidence), ``delivery.
critical_path_method`` (real Kahn's-algorithm forward/backward pass -- the critical path is
computed, never asserted), ``delivery.dependency_graph`` (referential integrity + every critical
edge requires owner+fallback), ``delivery.stage_gate`` (closed GO/HOLD/REWORK/KILL decision set +
GO requires evidence), ``delivery.change_risk_matrix`` (risk_tier derived from 5 factors, control
baselines nested LOW subset MEDIUM subset HIGH by construction), ``delivery.definition_of_done``
(all 12 Atlas Section 12.42 dimensions required, overall_status mechanically derived, never
asserted), ``delivery.decision_log`` (decision+evidence non-empty, revisit closed to
SCHEDULED/NO_REVISIT_PLANNED -- disambiguated from the differently-shaped ``learning.
decision_journal``), ``delivery.outcome_roadmap`` (two-level bet->outcome->theme referential
integrity), ``delivery.risk_register`` (exposure mechanically derived as probability*impact, never
a builder parameter), ``delivery.raci`` (deliverable-level RACI -- due_date required + calendrically
valid, escalation_path required when Accountable is unavailable -- deliberately NOT a copy of the
pre-existing ``stakeholders.raci``, disambiguated by record prefix DRACI- vs SRACI-).

Unlike F15, this family has no single shared core-principle line in the Atlas table header (L914-
929) -- each method's real invariant is disclosed independently in its own module docstring and
contract yaml. Registry entries: contract-backlog.yaml twohundredseventh through
twohundredsixteenth_concrete_entry. See WORKLOG 2026-09-12 F22 entry for the full closing summary.
"""

from __future__ import annotations
