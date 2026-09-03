# Human-System Safety Contract

## Prime Rule
A system that interacts with people is not complete merely because its backend is correct. Human-facing correctness is a first-class system property.

## Non-overridable invariants
1. High-impact actions MUST be understandable before commitment and reviewable after commitment.
2. Irreversible or materially harmful actions MUST require explicit confirmation, authority, and an available recovery/compensation path unless physically impossible.
3. The UI MUST NOT silently convert uncertainty, disagreement, missing evidence, or stale evidence into apparent certainty.
4. Decision-relevant values MUST be computed in authoritative domain/application layers, not reconstructed ad hoc in presentation code.
5. Human oversight MUST be substantive: the operator receives evidence, alternatives, uncertainty, and the consequence of action.
6. Accessibility, locale, timezone, calendar, names, identity, and text direction are architectural concerns for applicable products, not retrofit polish.
7. Error states MUST preserve user intent where safe, explain current state, and provide deterministic recovery guidance.
8. Generated reports and consequential outputs MUST be reproducible from versioned inputs, policies, methods, and execution references. Silent substitution during replay is prohibited.

## Applicability
Applies to systems with UI, operator workflows, human approvals, consequential recommendations, reports, or human-entered data. Non-applicable controls require an explicit N/A rationale; silence is not N/A.
