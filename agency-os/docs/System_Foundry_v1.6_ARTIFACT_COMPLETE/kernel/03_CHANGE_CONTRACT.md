# Foundry Change Contract

## Required pre-change record
Every change must establish:
1. Problem statement and reproduced symptom
2. Verified root cause
3. Domain/system owner
4. Affected boundary and contracts
5. Exact paths to change
6. Dependencies and downstream consumers
7. Data impact and migration strategy
8. Security/privacy impact
9. Failure modes and blast radius
10. Rollback/recovery before implementation

## Required implementation record
- exact commands or deterministic actions
- exact repository-relative paths
- intended code/config/schema changes
- compatibility sequence when contracts/data change
- idempotency/retry semantics where applicable

## Required post-change proof
- unit/integration/contract/e2e tests as applicable
- migration validation
- observability signals and alert expectations
- security checks
- restore/rollback verification
- docs/runbook updates
- acceptance criteria results
- retained evidence

## Compatibility sequence
`EXPAND -> DUAL COMPATIBILITY -> MIGRATE -> VALIDATE -> CONTRACT`

## Completion rule
"Code merged" is not completion. Completion means the operational and recovery loop is closed and evidence is retained.
