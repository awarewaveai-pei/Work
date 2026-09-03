# Mature Reference Project -> System Foundry v1.2 Gap Integration Report

## Scope
Reference: `AI_LEGO_Cognitive_Engineering_OS`. Goal: extract only cross-domain capabilities useful to future systems; do not couple System Foundry to that product.

## Verified reusable gaps found

1. **Authority is distinct from agent identity.** Reference evidence: `policies/ai-execution/authority.yaml:12-15` describes required authority and the `Agent -> Intent -> Policy Engine -> Permission Check -> Human Approval / Auto Rule -> Execution` pipeline. Integrated as `kernel/09_AUTHORITY_AND_AUTONOMY_CONTRACT.md`, `schemas/authority-grant.schema.json`, and `policies/ai-execution.yaml`.
2. **Risk must be policy-as-code.** Reference evidence: `policies/ai-execution/risk-tiers.yaml:1-9` defines a canonical risk-tier policy binding. Integrated as `kernel/10_RISK_AND_EXCEPTION_CONTRACT.md` and `schemas/risk-classification.schema.json`.
3. **Tool permissions are an explicit security boundary.** Reference evidence: `policies/ai-execution/tool-permissions.yaml:1-5,20-22`. Integrated as `policies/tool-boundaries.yaml`.
4. **Exceptions/workarounds need a grant policy.** Reference evidence: `policies/ai-execution/exception-policy.yaml:1-10`. Integrated as `governance/EXCEPTION_STANDARD.md` and `schemas/exception.schema.json`.
5. **Supply-chain security requires concrete tooling/policy.** Reference evidence: `policies/security/supply-chain-security.policy.yaml:1-4,13-17`. Integrated as `engineering/SUPPLY_CHAIN_SECURITY_STANDARD.md` and release gates.
6. **Mutable legal/external facts need freshness SLA.** Reference evidence: `policies/jurisdiction/legal-freshness-sla.policy.yaml:1-4,10-14`. Generalized beyond law into `assurance/POLICY_FRESHNESS_STANDARD.md`, `schemas/freshness-record.schema.json`, and `policies/freshness.yaml`.
7. **Provider fallback must preserve eligibility constraints.** Reference evidence: `policies/provider/ai-gateway-fallback.policy.yaml:1-10`. Generalized into `engineering/PROVIDER_RESILIENCE_STANDARD.md`.
8. **Handoffs must be machine-readable.** Reference evidence: `specs/execution/handoff.schema.yaml:1-10`. Integrated as `governance/HANDOFF_STANDARD.md` and `schemas/handoff.schema.json`.
9. **Canonical blocking/escalation statuses avoid ambiguous free text.** Reference evidence: `specs/execution/status-codes.schema.yaml:1-7`. Integrated as `governance/STATUS_CODE_STANDARD.md`.
10. **Deprecation/retirement is a first-class lifecycle.** Reference evidence: `specs/execution/deprecation-pipeline.schema.yaml:1-10`. Integrated as `kernel/11_LIFECYCLE_AND_DEPRECATION_CONTRACT.md`, compatibility standard and lifecycle schema.
11. **Audit/event continuity must be explicit.** Reference evidence: `specs/execution/event-ledger.schema.yaml:1-10`. Generalized into `schemas/audit-event.schema.json` for governance side effects; Foundry does not force event sourcing on product domain state.
12. **Parallel/branch work needs defined states and merge authority.** Reference evidence: `specs/workflow/branch.schema.yaml:166-174,230-234`. Its useful generic principle is incorporated into authority + handoff + stage-gate rules; the AI-LEGO-specific branch object was not copied.
13. **Golden tests need positive and adversarial negative cases.** Reference evidence: `tests/README.md:1-17` and fixture rules. Integrated as `assurance/GOLDEN_TEST_STANDARD.md` and v1.2 validator checks.

## Deliberately not imported
- cognitive method/lens/primitive schemas — product-domain-specific
- AI-LEGO tenant/CAS semantics — project-specific architecture
- AI-provider-only policy names — generalized to provider resilience
- Event sourcing as a universal product architecture — not universally correct; only governance audit events are universal

## Result
System Foundry v1.2 is intended to be the reusable mother system for new builds and existing-system changes, with architecture, implementation, release, continuity, and retirement controls in one fail-closed lifecycle.
