# Media Storage Boundary Contract (30Y Stable)

## Purpose
- Freeze storage boundaries to prevent long-term drift.
- Keep media placement independent from control-plane ownership.

## Canonical rules
1. AI-generated images must be stored in Cloudflare R2.
2. WordPress product/blog images must remain in WordPress media library (`wp-content/uploads` + MySQL metadata).
3. Control-plane records (jobs, status, approvals, traces, run lineage) must be stored in Supabase.
4. No UI path may bypass controlled API contracts for write operations.

## Control-plane references
- Migration: `packages/db/migrations/0011_ops_console_control_plane.sql`
- Tables:
  - `ai_image_jobs`
  - `media_assets`
  - `ops_action_runs`
  - `ops_audit_events`

## Required invariants
- `media_assets.storage_backend` only allows `r2` or `wp_uploads`.
- `media_assets.asset_domain` only allows:
  - `ai_generated`
  - `wp_product`
  - `wp_blog`
- Every write operation must include `trace_id` and actor context.

## Operational checks
- Verify R2 object exists for completed AI image jobs.
- Verify WordPress media references are not rewritten to R2 for product/blog content.
- Verify audit event exists for every control action trigger.

## Related
- `agency-os/docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md`
- `agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
