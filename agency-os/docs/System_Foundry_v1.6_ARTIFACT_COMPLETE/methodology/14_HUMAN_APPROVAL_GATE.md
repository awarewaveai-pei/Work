# Human Approval Gate Standard

## Purpose
方法論的最終人工核准站——把步驟 00-13 收斂完的結果，交給有權限的人類做最後決定，而不是把「模型間有共識」偽裝成「已核准」。

## Sequencing
Step 14, terminal step of the 00→14 pipeline. Consumes the convergence-tagged decision set from `13_CONVERGENCE_STANDARD.md` (only CONSENSUS/MAJORITY items reach here). Its output is a handoff to implementation per `governance/HANDOFF_STANDARD.md`.

## Required Scope
- authority
- risk acceptance
- approval evidence
- exception expiry

## Required Fields
1. **Synthesized presentation** — a summary of the decision, its evidence, and residual risk (`12_ARCHITECTURE_ASSURANCE.md`), not a raw dump of steps 00-13 that no human will actually read in full.
2. **Named approving authority** — the specific human with the authority to approve, per `governance/AUTHORITY_MODEL.md` and `kernel/09_AUTHORITY_AND_AUTONOMY_CONTRACT.md`'s risk-tier-to-authority mapping. Higher risk tiers require higher authority.
3. **Risk acceptance with mandatory expiry** — any residual risk being knowingly accepted MUST carry an explicit expiry date and owner, never an open-ended acceptance (`governance/EXCEPTION_STANDARD.md`).
4. **Approval evidence** — the approval itself is recorded as evidence (who, when, what was actually shown to them) so it can be audited later, not an informal verbal go-ahead.

## Anti-Rubber-Stamp
The presentation MUST NOT hide dissent recorded in `13_CONVERGENCE_STANDARD.md`'s MAJORITY state, and MUST NOT present model/expert consensus as if it were equivalent to human sign-off (`governance/HUMAN_OVERSIGHT_STANDARD.md`).

## After Approval
Approval triggers handoff to implementation via `governance/HANDOFF_STANDARD.md`'s structured fields — the pipeline's output does not silently become "someone will get to it."

## Gate
`G9_HUMAN_APPROVED` (`runtime/stage-gates.yaml`) requires: decision_record, accepted_residual_risk. It fails when approval is granted by someone below the authority level required for the decision's risk tier, or when a risk acceptance has no expiry date.
