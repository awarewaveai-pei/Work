# Phase 1A — renderer authentication compatibility package

**Status:** LOCAL IMPLEMENTATION AND FOCUSED TESTS COMPLETE — staging and production rollout remain blocked pending the Phase 0B authenticated staging receipt
**Scope:** the existing Quick Engine and Remotion renderer HTTP boundaries only
**Does not include:** Timeline, Whisper, QA, assets, Release, database migration, provider integration, WordPress, Postiz or UI redesign

## 1. Outcome

Both renderer services must reject unauthenticated state-changing and job-status requests in every deployed environment. Existing VideoStudio behaviour remains intact: it still submits render work and polls status through the same Next-admin routes. The change uses one wire protocol, preserves a bounded legacy configuration bridge for one release, and includes an immediate rollback path.

**Canonical wire protocol:** `X-Render-Token: <secret>` for renderer `POST /render`, `POST /generate-job` and job status requests. The secret itself is never written to source, logs, test receipts or this document.

## 2. Verified incompatibilities

| ID | Finding | Exact evidence | Required correction |
|---|---|---|---|
| AUTH-01 | Quick Engine accepts protected requests when its service token is empty. | `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\video-service\\server.py:50-51,81-85,442-461` | Require an explicit local-development exception; deployed service startup must reject empty authentication configuration. |
| AUTH-02 | Remotion accepts protected requests when its service token is empty. | `apps/remotion-service/src/server.ts:21,27-31,141-158,164-165` | Apply the same explicit policy as Quick Engine. |
| AUTH-03 | The two Next-admin callers use different environment names and different header conventions. | Quick: `apps/next-admin/lib/content/video/render-client.ts:43-48,129-147`; Remotion: `apps/next-admin/lib/content/video/remotion-client.ts:6-11,19-23`. | Introduce one Next-admin resolver and send the canonical header to both renderers. |
| AUTH-04 | Remotion status is already protected, and its client already supplies its legacy credential; it must retain that protection while moving to the canonical header. | Remotion route: `apps/remotion-service/src/server.ts:314-326`; client: `apps/next-admin/lib/content/video/remotion-client.ts:41-46`; Quick: `apps/video-service/server.py:442-444`. | Preserve required status authentication and move its caller to the common header resolver. |
| AUTH-05 | Current Compose manifests inject `RENDER_AUTH_TOKEN` and bind both renderer ports to loopback. | `apps/video-service/docker-compose.video.yml:24-50`; `apps/remotion-service/docker-compose.remotion.yml:23-53`. | Preserve the network boundary; validate that token is non-empty before rollout. |

## 3. Contract to implement

### 3.1 Configuration contract

| Layer | Canonical setting | Transitional compatibility | Validation |
|---|---|---|---|
| Video service | `RENDER_AUTH_TOKEN` | None in deployed mode. | Refuse startup if absent unless the explicit local-only override below is active. |
| Remotion service | `RENDER_AUTH_TOKEN` | None in deployed mode. | Same validation and error code as video service. |
| Next-admin callers | `MEDIA_RENDER_AUTH_TOKEN` | For exactly one release, resolve `VIDEO_SERVICE_SECRET` for Quick and `REMOTION_AUTH_TOKEN` for Remotion only when the canonical setting is absent. | Deployment preflight checks a non-empty resolved value for each enabled renderer without printing it. |
| Local-only development | `ALLOW_INSECURE_LOCAL_RENDER=true` and loopback service bind only | No fallback in Compose, staging or production. | Startup refuses the override when binding any non-loopback host. |

The legacy aliases exist only to make a controlled rollout possible. They are removed after one release cycle with a recorded inventory proving no caller relies on them.

### 3.2 HTTP contract

| Endpoint | Required authentication | Expected unauthenticated result | Expected authorised result |
|---|---|---|---|
| `video-service POST /render` | `X-Render-Token` | `401 {"error":"unauthorized"}` | `202` with `jobId` |
| `video-service POST /generate-job` | `X-Render-Token` | `401 {"error":"unauthorized"}` | `202` with `jobId` |
| `video-service GET /job` | `X-Render-Token` | `401 {"error":"unauthorized"}` | status payload |
| `remotion-service POST /render` | `X-Render-Token` | `401 {"error":"Unauthorized"}` | `202` with `jobId` |
| `remotion-service GET /status/:jobId` | `X-Render-Token` | `401 {"error":"Unauthorized"}` | status payload |
| `GET /health` on either service | none | always public health only | never returns tokens, configuration values, job IDs or tenant data |

`Authorization: Bearer` remains accepted by Remotion only during the compatibility release because current server code accepts it at `apps/remotion-service/src/server.ts:147-153`. New Next-admin code sends `X-Render-Token` only. Quick Engine remains `X-Render-Token` only.

## 4. Exact implementation set

| File | Change | Expected result |
|---|---|---|
| `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\next-admin\\lib\\content\\video\\renderer-auth.ts` | New private resolver for the canonical Next-admin setting and bounded legacy aliases. | Both renderer clients produce the same authenticated header; no caller reads a token directly. |
| `...\\apps\\next-admin\\lib\\content\\video\\render-client.ts` | Replace private header construction with the shared resolver. | Existing Quick render and poll requests keep their URL/body behaviour. |
| `...\\apps\\next-admin\\lib\\content\\video\\remotion-client.ts` | Use the shared resolver and `X-Render-Token`. | Existing Remotion render/status requests authenticate under the common protocol. |
| `...\\apps\\next-admin\\app\\api\\video\\capabilities\\route.ts` | Use the shared resolver for consistency. | Health capability checks continue to work without leaking configuration. |
| `...\\apps\\video-service\\server.py` | Replace implicit empty-token allow with an explicit, loopback-only local override; preserve constant-time comparison. | A deployed service cannot silently start fail-open. |
| `...\\apps\\remotion-service\\src\\server.ts` | Apply the same startup policy while preserving the existing `requireAuth` guard on render and status. | Remotion render and status remain protected equivalently. |
| `...\\apps\\video-service\\docker-compose.video.yml` | Add environment validation/documentation only if required by the chosen startup mechanism. | Compose stays loopback-bound and does not introduce a new secret name. |
| `...\\apps\\remotion-service\\docker-compose.remotion.yml` | Same as video-service. | Both renderer manifests follow one declared policy. |

No existing API route, database table, R2 key, WordPress integration, Postiz integration or VideoStudio component changes in this package.

## 5. Test matrix and exact commands

### 5.1 New tests required

| Test location | Cases | Expected result |
|---|---|---|
| `apps/next-admin/lib/content/video/__tests__/renderer-auth.test.ts` | canonical token wins; Quick legacy alias resolves only for Quick; Remotion legacy alias resolves only for Remotion; missing token produces typed configuration failure; header has no bearer prefix. | No secret values appear in assertions or output. |
| `apps/video-service/tests/test_auth_policy.py` | production mode with no token fails startup; local override requires loopback; missing/wrong/correct `X-Render-Token` returns 401/401/accepted for render and job. | Python service has deterministic fail-closed coverage. |
| `apps/remotion-service/src/__tests__/auth-policy.test.ts` | production mode rejects empty token; wrong/correct token on render and status returns 401/accepted; Bearer is compatibility-only. | Node service has deterministic fail-closed coverage. |

### 5.2 Execution commands

Run only inside `D:\\Worktrees\\media-video-phase0` after tests exist:

```powershell
npm --prefix lobster-factory/infra/hetzner-phase1-core/apps/next-admin test -- renderer-auth
npm --prefix lobster-factory/infra/hetzner-phase1-core/apps/next-admin run typecheck
python -m unittest discover -s lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests -p "test_auth_policy.py"
npm --prefix lobster-factory/infra/hetzner-phase1-core/apps/remotion-service test -- auth-policy
npm --prefix lobster-factory/infra/hetzner-phase1-core/apps/remotion-service run build
```

**Expected result:** all focused tests, type check and renderer build exit `0`. A failed negative test is a blocker, not a warning.

## 6. Staging and rollout sequence

1. Record the Phase 0B disposable-tenant smoke receipt and verify the active host/control path.
2. Capture a fresh backup-health reference and configuration presence record: service name, image digest, `RENDER_AUTH_TOKEN=present`, caller token resolver result `present`. Do not expose values or hashes that could become reusable secrets.
3. Deploy the service changes to an isolated staging endpoint. Confirm health remains public and each protected endpoint returns 401 without a token.
4. Deploy Next-admin against the staging renderer. Confirm a disposable tenant can draft, submit exactly one neutral render, poll it and retrieve it using the canonical header.
5. Keep the legacy resolver aliases for one release window. Monitor only configuration-error counts and 401/5xx error classes; do not log headers.
6. Remove aliases in a separately reviewed change after documented caller inventory is empty.

## 7. Stop and rollback

| Trigger | Immediate action | Rollback |
|---|---|---|
| Staging renderer starts without token | Stop rollout. | Restore the prior staging image; investigate deployment configuration only. |
| Existing Quick or Remotion smoke request returns 401 after caller deployment | Stop before production. | Restore the prior Next-admin image/configuration; keep service policy unchanged until token mapping is proven. |
| Production health fails, render error rate rises, or an existing job cannot be polled | Stop rollout and preserve logs/correlation IDs. | Roll back the exact changed image(s) to their recorded pre-release digest; do not delete jobs or artifacts. |
| Any unverified host, token presence, backup reference or staging receipt | Do not deploy. | No production action has occurred. |

## 8. Approval boundary

This package authorises isolated implementation and focused test preparation only. Staging and production rollout require a separate release record containing the tested commit, image digests, fresh backup reference, Phase 0B staging receipt, health result and exact rollback command.
