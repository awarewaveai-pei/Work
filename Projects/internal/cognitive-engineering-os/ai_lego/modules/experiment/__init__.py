"""F15 experiment & validation family (Atlas L734-753) -- 11 of 11 COMPLETE.

Built by 4 concurrent sibling agents in one batch, 2026-09-12: ``experiment.prototype`` (fidelity
ceiling + iteration traceability), ``experiment.mvp`` (decision-changing threshold + decision
consistency), ``experiment.proof_of_concept`` (isolation + verdict consistency), ``experiment.
technical_spike`` (bounded timebox + decision groundedness), ``experiment.concierge_test`` (zero
automation + measurement integrity), ``experiment.wizard_of_oz`` (front/back contrast + disclosure
integrity), ``experiment.fake_door`` (disclosure honesty + measurement integrity), ``experiment.
smoke_test`` (pre-registered threshold + decision consistency), ``experiment.ab_test`` (pre-
registration before results + primary-metric isolation from guardrails), ``experiment.pilot``
(Atlas Section 12.31's own MANDATORY rule made structural -- success/stop/rollback criteria each
required non-empty), ``experiment.benchmark`` (fixed workload/metrics/environment made structural --
every candidate's results must cover the declared metric set exactly).

Family-shared core principle (Atlas L750-752): find the CHEAPEST test that can FALSIFY a Critical
Assumption, not let an AI subjectively score it 8.7/10. Each of these 11 methods falsifies a
DIFFERENT kind of assumption structurally, never the same check copied 11 times -- see each
method's own module docstring for its specific real invariant and the one-sentence reason it is
real rather than cosmetic. Registry entries: contract-backlog.yaml onehundredninetysixth through
twohundredsixth_concrete_entry. See WORKLOG 2026-09-12 F15 entry for the full closing summary.
"""

from __future__ import annotations
