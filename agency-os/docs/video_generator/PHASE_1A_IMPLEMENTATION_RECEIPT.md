# Phase 1A — isolated implementation receipt

**Status:** LOCAL IMPLEMENTATION COMPLETE — NOT DEPLOYED
**Date:** 2026-09-06
**Implementation workspace:** `D:\\Worktrees\\media-video-phase0`
**Branch:** `codex/media-video-phase0`
**Baseline commit:** `8570b74f07e3c7cd119d747c285f5055f3184742`

## 1. Scope delivered

Phase 1A removes the two renderer services' implicit empty-token fail-open startup mode. It adds an explicit loopback-only development exception and gives both Next-admin renderer clients one canonical `X-Render-Token` resolver. It does not deploy, call a provider, render a video, change a database, write R2, publish to WordPress, create a Postiz post, or alter VideoStudio UI.

| Area | Changed files | Result |
|---|---|---|
| Shared Next-admin renderer credential resolution | `apps/next-admin/lib/content/video/renderer-auth.ts`; `apps/next-admin/lib/content/video/__tests__/renderer-auth.test.ts` | Canonical `MEDIA_RENDER_AUTH_TOKEN`; bounded legacy aliases; action requests fail before an unauthenticated renderer call. |
| Quick Engine caller | `apps/next-admin/lib/content/video/render-client.ts`; `app/api/video/capabilities/route.ts` | Render and job polling use the resolver's `X-Render-Token`; public health stays public. |
| Remotion caller | `apps/next-admin/lib/content/video/remotion-client.ts` | Render and status polling use the same `X-Render-Token` protocol. |
| Quick Engine service | `apps/video-service/auth_policy.py`; `apps/video-service/server.py`; `apps/video-service/tests/test_auth_policy.py` | Empty token fails startup unless `ALLOW_INSECURE_LOCAL_RENDER=true` and `VIDEO_SERVICE_HOST` is loopback. |
| Remotion service | `apps/remotion-service/src/auth-policy.ts`; `apps/remotion-service/src/server.ts`; `apps/remotion-service/test/auth-policy.test.cjs`; `apps/remotion-service/package.json` | Same policy; existing authenticated status guard is retained. |

## 2. Corrected fact

The earlier Phase 1A draft incorrectly stated that Remotion status lacked authentication. Cross-check found the existing route already uses `requireAuth` at `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\remotion-service\\src\\server.ts:314-326`. The draft was corrected before implementation. This package preserves that guard; it does not add a duplicate one.

## 3. Verification receipt

| Command | Result | Evidence |
|---|---|---|
| `python -m unittest discover -s .../apps/video-service/tests -p test_auth_policy.py -v` | PASS — 4 tests | Empty token rejection, loopback guard, explicit token and local exception passed. |
| `npm test -- renderer-auth renderer-client-auth` in `apps/next-admin` | PASS — 8 tests | Canonical/legacy resolution, whitespace rejection, health header behaviour, Quick/Remotion render and status headers, plus no-request behaviour when credentials are absent. |
| `npm run typecheck` in `apps/next-admin` | PASS | TypeScript completed with exit `0`. |
| `npm test` in `apps/remotion-service` | PASS — build + 3 tests | TypeScript build and local-auth policy tests passed. |
| Existing video-related Next-admin tests | PASS — 62 tests / 7 files | Existing scene reassignment, cost, tenant status, reconciliation, output selection, output naming and video block registry tests passed after the change. |
| `git diff --check` in the isolated worktree | PASS | No whitespace or patch-format error. |

## 4. Deliberately not executed

| Test | State | Reason and next action |
|---|---|---|
| Isolated Quick Engine HTTP smoke (`/health`, unauthenticated `/job`, authenticated unknown `/job`) | NOT EXECUTED | The local execution policy rejected the background-process harness before it started. This is a tooling-policy block, not a service response. Run this test in the controlled staging runner as part of Phase 0B. |
| Authenticated VideoStudio draft → render → history smoke | BLOCKED | The controlled deployment host is not reachable by the recorded SSH paths, and no authenticated staging-browser control path is currently available. It remains the Phase 0B connection gate. |
| Any production deployment | NOT REQUESTED / NOT EXECUTED | Requires the separate release record defined in the Phase 1A change package. |

## 5. Release boundary

The implementation is isolated in `codex/media-video-phase0`; `D:\\Work` and the live site are unchanged. The next safe step is to obtain a controlled staging access path, verify token presence without exposing its value, then execute the Phase 0B smoke receipt. Only after that can this branch receive a staging deployment review.
