# Media Video isolated-branch handoff bundles

**Status:** local handoff artifact only; not merged or deployed.
**Created:** 2026-09-07
**Shared prerequisite base:** 8570b74f07e3c7cd119d747c285f5055f3184742

| Bundle | Head commit | SHA-256 | Content |
| --- | --- | --- | --- |
| `media-video-phase0.bundle` | `0cf46d201f189645a38b42b5472e34255cb8d0bd` | `2f360d87d8d2a1419a8d950df11f61d80f24acf33f2fcde27ef5ebd97eacb28d` | Phase 0, renderer auth/lifecycle contracts, staging compose and Timeline structural preflight. |
| `media-video-phase0-plus-timeline-remotion-166e0372b.bundle` | `166e0372b318dc59fcd4b11360990f0b9e1ecb1b` | `7f5bef1030605823a8c81c3a475a86bc052353fb315a5fdf9f7a65c0cdc0b91a` | The first bundle plus the Timeline→Remotion compiler and DynamicSlideshow crop/transition support. |

## Phase 0 included commits

1. 542e75a8e — renderer authentication fail-closed
2. 5b19f0885 — renderer authentication tests
3. 8060ab8e5 — durable video job lifecycle contract
4. 9667d0075 — isolated renderer staging compose
5. 4f6b574a7 — artifact-backed Timeline v1 contract
6. a53021d85 — LEGO capability ID grammar
7. 6fa054f20 — Timeline asset UUID binding
8. 0cf46d201 — non-rendering Timeline preflight

## Safety boundary

This bundle does not contain a database migration, a renderer protocol implementation, R2 credentials, a production compose overwrite, or any deploy action. It must be merged into main by a Git identity that can write the repository index, reviewed, then deployed only through /root/lobster-phase1/scripts/sg-deploy.sh.

## Verification completed before Phase 0 bundle

- Focused video suite: 8 files, 57 tests passed.
- next-admin TypeScript typecheck passed.
- renderer staging compose config check passed without starting containers.
- Bundle SHA-256 recorded above; run git bundle verify before any fetch or merge.

## Required next integration gate

Before enabling Phase 1B runtime code, create a staging-only private R2 receipt bucket and validate conditional S3 PutObject writes. The current production renderer compose at /root/render-services/docker-compose.yml must not be copied or altered for that purpose.

## Compiler bundle verification

- `git -C D:\\Work bundle verify agency-os/docs/video_generator/_handoff_2026-09-07/media-video-phase0-plus-timeline-remotion-166e0372b.bundle` passed.
- Next-admin: Timeline/Remotion focused suite passed 3 files / 13 tests; typecheck passed.
- Remotion service: `npm run build` passed.
- Neither bundle is merged or deployed. Use the compiler bundle only after the Phase 1B and Phase 2 gates named above; it deliberately does not wire Timeline submission to the renderer.
