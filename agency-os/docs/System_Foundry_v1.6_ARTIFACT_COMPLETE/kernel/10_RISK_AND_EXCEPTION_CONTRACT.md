# 10 — Risk and Exception Contract

## Risk Tiers
Every change and external action MUST be classified before execution.

- **R0** analysis/read-only; no side effects.
- **R1** low-risk, local, reversible, no protected/customer/production surface.
- **R2** bounded change with testable rollback and limited blast radius.
- **R3** production/security/data/customer-impacting change; independent review required.
- **R4** catastrophic/irreversible/regulatory/financial/identity-root impact; explicit human sovereign approval required.

Risk is determined by the maximum of: data sensitivity, privilege, blast radius, reversibility, customer impact, regulatory impact, financial impact, operational criticality, novelty, and uncertainty.

## Exceptions Are Debt, Not Permission Shortcuts
Every exception/workaround MUST contain owner, rationale, exact scope, compensating controls, evidence, expiry, rollback/removal plan, and a permanent-fix task.

Exceptions MUST NOT override: evidence integrity, secret protection, legal prohibition, destructive-action safeguards, or independent assurance requirements for R4.

Expired exceptions automatically become `BLOCKED_EXCEPTION_EXPIRED`.
