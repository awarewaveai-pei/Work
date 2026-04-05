# Architecture Canonical Map

## Purpose
Provide a single source-of-truth map so routing, workflow, and governance rules stay centralized and non-duplicated.

## Canonical Documents (source of truth)
- Tool routing and boundaries:
  - `docs/MCP_TOOL_ROUTING_SPEC.md`
- WordPress Factory execution channel:
  - `docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md`
- Machine-readable routing risk policy:
  - `workflow-risk-matrix.json`
- Executable WordPress execution policy:
  - `packages/policies/approval/wordpress-factory-execution-policy.json`
- Executable validation entrypoint:
  - `scripts/validate-workflow-routing-policy.mjs`

## Governance and Gates
- V3 governance gate baseline:
  - `docs/V3_GOVERNANCE_GATES.md`
- Bootstrap gate runner:
  - `scripts/bootstrap-validate.mjs`
- Operable E2E playbook (A10-1) + structural gate:
  - `docs/e2e/OPERABLE_E2E_PLAYBOOK.md`
  - `scripts/validate-operable-e2e-skeleton.mjs`
- Artifacts lifecycle policy (A9):
  - `docs/operations/ARTIFACTS_LIFECYCLE_POLICY.md`

## Update Rule
- Any routing/policy change must update:
  1. Canonical markdown (`MCP_TOOL_ROUTING_SPEC.md` or `WORDPRESS_FACTORY_EXECUTION_SPEC.md`)
  2. Canonical JSON (`workflow-risk-matrix.json` and/or execution policy JSON)
  3. Validation script expectations (`validate-workflow-routing-policy.mjs`)
- If any of the above diverge, CI must fail via `npm run validate`.
