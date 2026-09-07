# Media Production LEGO Platform — current baseline and gap audit

**Status:** READ-ONLY AUDIT
**Audited:** 2026-09-06
**Scope:** source tree and local container visibility only. No database, deployment, external account or media artifact was changed.

## 1. Evidence classification

| State | Meaning |
|---|---|
| VERIFIED-STATIC | Confirmed from the current checked-out source at the cited path and line. |
| VERIFIED-LOCAL | Confirmed from a read-only observation of this workstation. |
| UNVERIFIED-RUNTIME | Source supports the behaviour, but current deployed configuration/service health was not inspected or exercised. |

## 2. Current runnable paths

| Path | Static evidence | State | What it does |
|---|---|---|---|
| VideoStudio page | `apps/next-admin/app/(shell)/tools/video/page.tsx:1-12` | VERIFIED-STATIC | Loads `VideoTabs` at `/tools/video`. |
| Quick Engine draft | `app/api/video/draft/route.ts:5-97` | VERIFIED-STATIC | Creates scenes and format-specific asset URLs for a user-editable draft. |
| Quick Engine render | `app/api/video/render-draft/route.ts:40-189` | VERIFIED-STATIC | Validates edited scenes/assets, submits the existing render block, then creates a job record. |
| Quick Engine status/history | `app/api/video/status/route.ts:55-145`; `app/api/video/history/route.ts:58-89` | VERIFIED-STATIC | Authorizes the tenant, polls a render job and records completed output in `media_assets`. |
| Manual Remotion template | `apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx:594,1152-1153,1633-1843` | VERIFIED-STATIC | Lets a user select a fixed template and submit its props through the Remotion route. |
| Remotion HTTP adapter | `app/api/video/remotion-render/route.ts:13-89`; `app/api/video/remotion-status/route.ts:1-28` | VERIFIED-STATIC | Whitelists templates and proxies submit/poll calls to an external renderer. |
| WordPress embed | `app/api/video/embed-to-wp/route.ts:10-89` | VERIFIED-STATIC | Replaces a post placeholder with a bare HTTPS video URL and writes the post back. |
| Postiz social delivery | `app/api/content/social-publish/route.ts:18-195` | VERIFIED-STATIC | Validates tenant, supports draft/now mode, chooses video format by platform, uploads and creates a Postiz post. |

**External reachability check, 2026-09-06:** anonymous `GET https://app.aware-wave.com/tools/video` returned HTTP 307 (login redirect); anonymous `GET https://app.aware-wave.com/api/video/capabilities` returned HTTP 401. The management surface is reachable and protected. This check did not authenticate, submit a job or validate an authorized tenant flow.

## 3. Existing durable records

| Record | Source evidence | Current responsibility |
|---|---|---|
| `video_jobs` | `lobster-factory/packages/db/migrations/0047_video_jobs.sql:17-48`; `apps/next-admin/lib/content/video/job-store.ts:92-148` | Tenant-owned, short-lived Quick Engine render progress. |
| `media_assets` | `packages/db/migrations/0011_ops_console_control_plane.sql:35-95`; `apps/next-admin/lib/content/blocks/video-pipeline.ts:144-225` | Tenant-scoped output/media metadata and object identity. |
| WordPress post | `app/api/video/embed-to-wp/route.ts:42-89` | External article content is the current embed destination; no local release/reference receipt is written by this route. |
| Postiz result | `app/api/content/social-publish/route.ts:193-195` | API response is returned, but no durable media delivery-attempt record is established by this route. |

## 4. Existing engines and boundaries

### Quick Engine

- Native output profiles are defined for 16:9, 9:16 and 4:5: `apps/next-admin/lib/content/blocks/video-pipeline.ts:28-42`.
- The renderer client uses `VIDEO_SERVICE_URL` and `VIDEO_SERVICE_SECRET`, checks `/health`, then uses `/render` and `/job`: `apps/next-admin/lib/content/video/render-client.ts:41-55,113-169`.
- Compose passes those two settings into Next-admin: `docker-compose.yml:381-389`.
- The video-service process permits unauthenticated `/render` when `RENDER_AUTH_TOKEN` is empty: `apps/video-service/server.py:45-57`. Its dedicated Compose manifest says the token must be set and exposes port 8732 only on host loopback: `apps/video-service/docker-compose.video.yml:24-50`.
- **VERIFIED-RUNTIME (2026-09-06):** `https://video-svc.aware-wave.com/health` returned `ok: true` with `format_assets`, `native_multiformat`, `output_dimensions`, `openai_tts` and formats `16x9`, `9x16`, `4x5`.
- The local Docker daemon listed only Trigger.dev containers on 2026-09-06; no Next-admin, Quick Engine, Remotion or Postiz container was visible locally. This does not contradict the remote health check.

### Remotion

- The current service recognizes `dynamic-slideshow`: `apps/remotion-service/src/server.ts:52-58`.
- The API route has a template allowlist before forwarding props: `app/api/video/remotion-render/route.ts:13-89`.
- The client reads `REMOTION_AUTH_TOKEN`: `apps/next-admin/lib/content/video/remotion-client.ts:9`; the service source reads `RENDER_AUTH_TOKEN`: `apps/remotion-service/src/server.ts:21`.
- Whether deployment maps both names to the same secret is **UNVERIFIED-RUNTIME**. Do not rename either variable until the deployed service configuration and request authentication are inspected.
- **VERIFIED-RUNTIME (2026-09-06):** `https://remotion-svc.aware-wave.com/health` returned `ok: true, version: 1.0.0`. Health does not authenticate a render request and therefore does not prove token mapping, tenant ownership or durable job recovery.

### Whisper

- `meeting-service/lib/transcribe.py:109-172` verifies an audio stream, selects CUDA float16 with CPU int8 fallback, runs `faster-whisper` `large-v3`, enables VAD and returns timed segments.
- `meeting-service/lib/transcribe.py:175-184` writes SRT from those segments.
- No video API route imports this module. Video subtitle creation, review edits, VTT/ASS, timecode provenance and A/V QA are therefore **not implemented**.

### Delivery

- WordPress embeds are currently bare URLs inserted into content: `app/api/video/embed-to-wp/route.ts:59-78`.
- Postiz supports draft/now and requires `confirmPublishNow` for immediate publication: `app/api/content/social-publish/route.ts:51-89`.
- The route selects preferred video profiles by platform with fallback: `app/api/content/social-publish/route.ts:151-193`.

## 5. Verified gaps and risks

| ID | Finding | Evidence | Impact | Required phase |
|---|---|---|---|---|
| GAP-01 | No Timeline v1 schema/validator or AI Director execution path. | Existing Director document names Timeline as target: `apps/next-admin/app/(shell)/tools/video/CONTEXT.md:10-18,78-82`; UI is template-driven. | AI-generated or manually edited multi-track decisions are not governed by a stable contract. | Phase 3 |
| GAP-02 | No release/reference model protects a public video from deletion. | Cleanup selects by age and deletes R2 then `media_assets`: `app/api/video/cleanup/route.ts:27-46`; WordPress stores a bare URL. | An old asset can break an embed if cleanup runs. | Phase 2 |
| GAP-03 | Remotion delivery is not established as a `video_jobs`/asset lifecycle. | Quick path persists jobs: `job-store.ts:92-148`; Remotion routes proxy their own IDs: `remotion-render/route.ts:4-10`. | Different recovery/observability behaviour by renderer. | Phase 3 |
| GAP-04 | Whisper is not available to video workflows. | See Whisper boundary above. | No automated captions, subtitle review or transcript-led QA. | Phase 4 |
| GAP-05 | No technical/editorial QA release gate. | Existing video routes validate request shape but no candidate-release QA model exists. | A completed render can be delivered without formal black-frame, silence, subtitle or editorial checks. | Phase 4 |
| GAP-06 | No short-drama continuity or real-footage edit contract. | Existing draft scenes only carry narration/image prompt/visual strategy: `app/api/video/draft/route.ts:33-96`. | No character Bible, episodic state or editable footage decision plan. | Phase 5 |
| GAP-07 | Social result is not an append-only learning record. | Postiz response is returned directly: `social-publish/route.ts:193-195`. | Future topics/scripts cannot be evaluated from a governed outcome history. | Phase 6 |
| GAP-08 | Provider policy is not centralized. | Next-admin receives Replicate/Pexels/video-service settings directly: `docker-compose.yml:381-389`. | A model/provider cannot yet be denied or selected by tenant, jurisdiction, data class and spend policy. | Phase 6 |
| GAP-09 | Video-service source is fail-open when its render token is absent, although Compose documents the token as mandatory. | `apps/video-service/server.py:50-51`; `apps/video-service/docker-compose.video.yml:27-28`. | A misconfigured non-local deployment can expose rendering. | Phase 0 configuration audit, then Phase 1 remediation if confirmed. |

### Isolated implementation delta — 2026-09-06

`GAP-01` remains true for the deployed system. A fail-closed Timeline v1 contract and structural-only preflight route now exist only in isolated worktree `D:\Worktrees\media-video-phase0` at `apps/next-admin/lib/content/video/timeline-v1.ts` and `app/api/video/timeline/validate/route.ts`; neither can create a render. The bounded delivery and its hard gates are recorded in [PHASE_3A_TIMELINE_V1_CONTRACT_RECEIPT.md](PHASE_3A_TIMELINE_V1_CONTRACT_RECEIPT.md).

`GAP-04` and `GAP-05` also remain true for the deployed system. [PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md](PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md) now records the required immutable transcript, caption revision and QA boundaries from the existing meeting Whisper worker evidence; it adds no runtime import, schema, renderer behavior or deployment.

## 6. Decisions already fixed by this audit

1. Do not install any of the four reference repositories as a runtime dependency.
2. Do not add Timeline, release or safe-delete code as a patch to a route. Their contracts and migrations come before implementation.
3. Do not run production cleanup while the reference model is absent.
4. Treat current Quick Engine and manual Remotion template rendering as the only candidate first runnable paths.
5. Do not claim a service is healthy from source code alone.

## 7. Next bounded action

Execute the smoke-test procedure in [RUNNABLE_BASELINE_SMOKE_TEST.md](RUNNABLE_BASELINE_SMOKE_TEST.md) against a disposable staging tenant. It is a test plan only; the environment, tenant and authorization must be selected before any media generation or external delivery occurs.
