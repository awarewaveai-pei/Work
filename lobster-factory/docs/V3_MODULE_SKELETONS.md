# V3 Module Skeletons (H3 Batch 1)

This document records the first executable skeleton batch for V3 gap modules:

- Sales
- Marketing
- Partner
- Media
- Decision Engine
- Merchandising

And H4 decision baseline extension:
- Decision recommendations schema + baseline recommendation contract

And H5 CX baseline extension:
- Retention / upsell schema + baseline contracts linked to `workflow_runs`

## Delivered Artifacts
- DB baseline: `packages/db/migrations/0007_v3_skeleton_modules.sql`
- Decision extension: `packages/db/migrations/0008_decision_engine_recommendations.sql`
- CX extension: `packages/db/migrations/0009_cx_retention_upsell_baseline.sql`
- Shared types: `packages/shared/src/types/v3-skeleton.ts`
- Workflow contracts: `packages/workflows/src/contracts/v3-module-skeleton-workflows.ts`
- Decision contract: `packages/workflows/src/contracts/decision-engine-baseline.ts`
- CX contract: `packages/workflows/src/contracts/cx-retention-upsell-baseline.ts`

## Notes
- These are architecture-phase skeletons: minimal schema + contracts for safe iterative expansion.
- All new tables carry `organization_id` + `workspace_id`.
- Production behavior remains approval-gated; no new runtime side-effects are enabled by this batch.
