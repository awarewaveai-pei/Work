# Video workbench implementation status — 2026-09-10

## Current change set

- Default `/tools/video` entry becomes **Project Workbench**: a named production project is the context for creation, production, review, release, and outcome.
- The old ScriptForge → VideoStudio flow remains in a collapsed **legacy quick-output** section; no existing renderer path is removed.
- Short-drama creation binds Story Bible to the active project and organization. Producers select registered assets by name; UUID, hashes, raw Timeline JSON, and raw Postiz payloads are not a normal workflow input.
- Bible now records character/location/prop role, visual reference, voice, style, wardrobe/state, rights notes; episodes record duration, output profile, beats, shot requirements, continuity review.

## Boundaries

- Media Core remains API/data infrastructure, never a producer navigation tab.
- A project may advance stages, but a stage adapter must only publish approved upstream artifacts. Unwired adapters present status only and cannot claim delivery.
- Migration `0071_media_production_projects.sql` is required before this UI is deployed. It creates project context and binds Story Bible revisions to it.

## Evidence

- `infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/MediaProjectWorkbench.tsx`
- `infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/StoryBibleWorkbench.tsx`
- `infra/hetzner-phase1-core/apps/next-admin/app/api/video/projects/route.ts`
- `infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/route.ts`
- `lobster-factory/packages/db/migrations/0071_media_production_projects.sql`

## Verification before deployment

1. `npm run typecheck` in `apps/next-admin`.
2. `npm test` in `apps/next-admin`.
3. Back up public schema, apply `0071`, verify table/RLS/FK columns.
4. Deploy with `sg-deploy.sh next-admin`; run authenticated project create + Bible save + legacy render smoke.

## Deployment receipt

- Commit: `dbe28f3170adb4de4181835879ef76683144981e` on shared `main`.
- Migration: `0071_media_production_projects.sql` applied after schema-only backup at `/root/lobster-phase1/backups/video-schema/pre-0071-*.sql.gz`.
- Deployment: `2026-09-10T05:54:18Z`; snapshot `lobster-phase1-next-admin:rollback-20260910-055020`.
- Gates: typecheck passed; Vitest `90 files / 790 tests`; deployment smoke checks passed for login, ops summary, WordPress and node-api.
- Public route: `/tools/video` correctly redirects unauthenticated users to login.
