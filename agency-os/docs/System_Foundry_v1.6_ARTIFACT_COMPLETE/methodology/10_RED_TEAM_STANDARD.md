# Red Team Standard

## Purpose
對截至目前累積的決策做對抗式審查，涵蓋 8 個構面，而不是只從資安單一角度攻擊。

## Sequencing
Step 10. Consumes the falsification conditions from `09_FALSIFICATION_STANDARD.md` as prime attack targets. Feeds `11_COMPLEXITY_AUDIT.md` and `13_CONVERGENCE_STANDARD.md`.

## Required Scope
- security
- architecture
- data
- operations
- commercial
- human error
- vendor
- legal

## Required Fields
1. **Coverage across all 8 dimensions** — security, architecture, data, operations, commercial, human error, vendor, legal — a red team pass that only covers security is incomplete.
2. **Independence** — the red team MUST NOT be led by the original designer (`06_EXPERT_COUNCIL_STANDARD.md`'s Independence rule) — someone with no stake in the design defending it.
3. **Finding severity and closure requirement** — every finding gets a severity; a Critical or High finding MUST be closed (fixed, or explicitly risk-accepted with expiry per `governance/EXCEPTION_STANDARD.md`) before proceeding to `12_ARCHITECTURE_ASSURANCE.md`.
4. **Human-error dimension** — explicitly considers what happens when an operator makes a mistake, not just what happens when an adversary attacks deliberately.

## Gate
This step, together with `09_FALSIFICATION_STANDARD.md` and `11_COMPLEXITY_AUDIT.md`, jointly satisfies `G7_FALSIFICATION_COMPLETE` (`runtime/stage-gates.yaml`) — the canonical `G10_IMPLEMENTATION_READY` is a later, post-approval concept and does not apply here. This step's own local check: reject when any of the 8 dimensions was not covered, or when an open Critical/High finding exists with no closure or documented risk acceptance.
