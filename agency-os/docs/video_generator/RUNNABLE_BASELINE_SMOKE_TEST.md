# VideoStudio runnable-baseline smoke test

**Status:** TEST PLAN — not executed by this document
**Purpose:** prove the existing Quick Engine path first. Manual Remotion template rendering is a separate optional check.
**Safety:** use a disposable staging tenant, a neutral test prompt, a new test article only if required, and never call WordPress embed, Postiz draft/now, cleanup or delete endpoints.

## Preconditions

| Check | Expected result | Evidence when failed |
|---|---|---|
| Authorized staging user | User can open `/tools/video`. | Browser URL, tenant ID and authorization response; do not record session tokens. |
| Next-admin | VideoStudio page loads. | Browser console/network error and server log correlation ID. |
| Quick Engine health | `GET /api/video/capabilities` returns `ok: true` and native-format capability flags. | HTTP status and returned non-secret error. |
| Render authentication | Deployment confirms `RENDER_AUTH_TOKEN` is present at video-service and the caller sends the corresponding approved token. | Presence/health verification only; never reveal token names' values. |
| Required provider settings | The selected existing asset/TTS path reports ready. | UI/API error only; never copy environment values into a ticket. |
| R2/output storage | The renderer can write a disposable output. | Render job error, object path prefix and service logs. |
| No delivery selected | No WordPress site/post or Postiz platform is submitted. | Request log has no embed/social route call. |

## Quick Engine procedure

1. Sign in to the disposable tenant and open `/tools/video`.
2. Use a neutral internal test topic such as “30-second product-free service status explainer”; do not use client, personal, copyrighted or sensitive footage.
3. Select the existing Quick Engine path and one supported output profile. Use a minimal scene count.
4. Create a draft. Confirm the UI returns editable scenes and per-format asset URLs.
5. Change one narration line and, if needed, regenerate one scene asset. Do not upload private footage for this smoke test.
6. Submit the draft render.
7. Record the returned job ID in the staging test receipt. Poll only through the normal VideoStudio/status flow.
8. On completion, verify the selected output profile, playable artifact URL and VideoStudio history entry.
9. Stop. Do not embed, publish, schedule, delete or clean up the artifact.

## Expected receipt

| Field | Required |
|---|---|
| Test date/time and environment | Yes |
| Tenant identifier | Yes; no personal names |
| VideoStudio route and selected engine | Yes |
| Job ID | Yes |
| Output profile and output URL/object prefix | Yes |
| `video_jobs` terminal status | Yes |
| `media_assets` history record ID, if created | Yes |
| Render duration and any retry | Yes |
| Screenshots/log correlation IDs | Yes; redact secrets |
| Delivery calls | Must be zero |

## Failure classification

| Symptom | Owner boundary | First evidence to collect | Do not do |
|---|---|---|---|
| VideoStudio cannot load | Next-admin/UI | HTTP status, browser console, server correlation ID | Do not edit source during the run. |
| Capabilities endpoint fails | Next-admin ↔ Quick Engine configuration | `/api/video/capabilities` response and video-service health error | Do not print environment variables or bypass render authentication. |
| Draft fails | Script/asset/provider path | Route response, selected model/mode and scene count | Do not change provider or retry indefinitely. |
| Render job is missing | Job persistence/service boundary | Job ID, status route response and job-store logs | Do not create a second job with the same user request. |
| Render fails | Quick Engine/R2/TTS | Job error, service logs and output prefix | Do not invoke cleanup. |
| History is absent after done | Reconciliation/media asset boundary | Job terminal response and history route response | Do not manually insert database rows. |

## Optional manual Remotion template check

Run only after Quick Engine succeeds.

1. In the same disposable tenant, choose the **Remotion 模板** tab in VideoStudio.
2. Pick a fixed template from the UI allowlist and use neutral text/image inputs.
3. Submit once and record the Remotion job ID.
4. Poll through the existing status UI until done or classified failure.
5. Do not call WordPress/Postiz or treat the result as a release.

If the request is rejected for authentication, record only the response/error classification. The code uses `REMOTION_AUTH_TOKEN` in Next-admin and `RENDER_AUTH_TOKEN` in the service; configuration reconciliation is a Phase 0 finding, not a reason to bypass authentication.

## Exit criteria

- **Pass:** Quick Engine draft → render → retrievable output is evidenced with no external delivery.
- **Classified failure:** the failure is attributed to a named boundary with sufficient evidence for a minimal fix plan.
- **Stop:** unknown authorization, unknown provider spend, production tenant, external delivery request, missing tenant isolation, or any request to expose secrets.
