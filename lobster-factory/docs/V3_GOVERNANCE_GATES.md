# V3 Governance Gates (H6)

This document defines the executable governance gate baseline for H6.

## Policy Source
- `packages/policies/approval/v3-governance-gate-policy.json`

## Gate Runner
- `scripts/run-v3-governance-gates.mjs`

## Included Blocking Checks
1. `manifest_schema` -> `node scripts/validate-manifests.mjs`
2. `governance_configs` -> `node scripts/validate-governance-configs.mjs --skip-v3-policy-check`
3. `dryrun_contract` -> `node scripts/validate-dryrun-apply-manifest.mjs --mode=fast ...`
4. `doc_integrity` -> `node scripts/validate-doc-integrity.mjs`
5. `workflow_routing_policy` -> `node scripts/validate-workflow-routing-policy.mjs`

## Integration
- `scripts/bootstrap-validate.mjs` now includes:
  - presence checks for V3 governance policy + runner script
  - execution of `run-v3-governance-gates.mjs`
  - execution of `validate-workflow-routing-policy.mjs`

## Notes
- `doc_integrity` per commit: `node scripts/validate-doc-integrity.mjs --commit=<sha>` checks only the links that commit changed or orphaned, against its own tree (what a CI checkout sees). The post-commit hook rule `mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js` runs it after every agent `git commit`, so breakage reaches its author instead of waiting for nightly health / CI.
- H6 is delivered as a baseline and can be extended incrementally by adding checks to the policy file.
- Production behavior remains approval-gated and unchanged.
