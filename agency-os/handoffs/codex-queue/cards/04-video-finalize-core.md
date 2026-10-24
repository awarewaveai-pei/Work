# Card 04 — AUTO_CONTENT P6.1: one core for "finish a video job" and "embed a video in a WordPress post"; the two routes become shells, behavior unchanged

## Decision

Plan `agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md` §7 P6.1 (invariant I4: the browser and the 5-minute pipeline clock finish and embed a video through the same code). The pipeline (card P6.2, later) has no Request and no browser; it will call these two functions with `orgIdentity(org)` (`lib/tenant-guard.ts:223`). This card only extracts — no caller other than the two routes is added.

All paths below are under `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`.

New file `lib/content/video/finalize.ts` exporting:

1. `finalizeVideoJob(job: VideoJob): Promise<FinalizeResult>` (`VideoJob` from `lib/content/video/job-store.ts:20`). The caller loads the job and runs its own access check first; this function never reads a Request. Move into it, unchanged, everything `app/api/video/status/route.ts` does after the tenant gate (`:87-176`): the `done`/`error` early returns, the no-`euJobId` "running + step" return, the remotion refusal, `pollRenderJob`, `validateRenderOutputs` + `EXPECTED_VIDEO_DIMENSIONS` (`:23-47`), `recordVideoAsset` + both QA persists (best-effort try/catch kept), `cleanupVideoInputKeys`, `finishJob`. Keep the existing explanatory comments that sit on that code (the 2026-06-20 R2 note at `:173-174`, the pickPrimaryOutput note at `:122-123`, the authoritative note at `:139-141`).
   ```ts
   export type FinalizeResult =
     | { status: "done"; video: unknown; title: string | undefined }
     | { status: "error"; error: string | undefined; statusCode: number | undefined }
     | { status: "running"; step: string }
     | { status: "wrong_poller" }; // remotion job: caller answers 409 as today
   ```
   (Use the real field types from `VideoJob` / `render-client` instead of `unknown` where they exist.)
2. `embedVideoInPost(identity: Request | { headers: Headers }, input: { siteId: string; postId: number; videoUrl: string; releaseId?: string; variant?: string }): Promise<EmbedResult>`. Move into it, unchanged and in the same order, `app/api/video/embed-to-wp/route.ts:41-156`: the field checks (`:43-50`), `resolveWpSite(identity, siteId)` (OrgAccessError is NOT caught here — it propagates; the route catches it as today), the token check, `checkProductionChangeAllowed` before any WordPress request, the delivery receipt reserve/claim/mark, the GET + placeholder replace (global regex + function replacer kept) + PATCH.
   ```ts
   export type EmbedResult =
     | { ok: true; postId: number; videoUrl: string; idempotent?: true; delivery?: DeliveryReceipt }
     | { ok: false; status: number; error: string }
     | { ok: false; blockedMode: string }; // caller answers blockedChangeResponse(mode)
   ```

`app/api/video/status/route.ts` keeps: role gate, jobId 400, `getJob` 404, the tenant gate with its whole comment block (`:66-85`) at the same position, then `finalizeVideoJob(job)` and maps the result to exactly today's JSON and status codes (`wrong_poller` → the 409 body at `:101`). Still POST only, no GET export.

`app/api/video/embed-to-wp/route.ts` keeps: `runtime`/`dynamic` exports, role gate (plain-text 403), JSON parse (plain-text 400), the body field parsing (`:34-39`), the `try/catch OrgAccessError → toOrgAccessResponse`, and maps `EmbedResult` to today's responses (`blockedMode` → `blockedChangeResponse(mode)` from `lib/system-modes/blocked-change.ts:16`; `ok:false` → `{ ok:false, error }` with `status`; `ok:true` → same body as today). Move the file's doc comment (`:19-26`) to `embedVideoInPost` and leave a one-line pointer in the route.

## Constraints

- Every response body, status code and header of both routes is the same as before for every input. The existing tests prove it; do not edit their assertions.
- The status route's tenant gate stays before the first branch that returns job data (that test file asserts the position).
- No new dependency, no env var, no change to `job-store.ts`, `render-client.ts`, `video-pipeline.ts`, `delivery-receipts.ts`, `wp-sites.ts`, `tick.ts`, `ContentStudio.tsx` or any other route.
- `lib/system-modes/__tests__/production-change-coverage.test.ts:204-213` lists `app/api/video/embed-to-wp/route.ts` as a file the detector must flag. After the move the WordPress write and the gate call live in `lib/content/video/finalize.ts`: replace that path with `lib/content/video/finalize.ts` in that list and add it to `known` (`:195-203`) so its gate call is asserted. That is the only edit to an existing test file. If the detector then flags the route itself as an ungated writer, stop and report `BLOCKED: <detector output>` instead of adding an exemption.
- Comments: only what a future reader would trip on, 1–3 lines, in the style of the surrounding file.

## Files

- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/finalize.ts` (new)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/finalize.test.ts` (new)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/status/route.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/embed-to-wp/route.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/system-modes/__tests__/production-change-coverage.test.ts` (path swap only, see Constraints)

## Acceptance

Unchanged and green:
- `npx vitest run app/api/video/embed-to-wp/route.test.ts`
- `npx vitest run lib/content/video/__tests__/video-status-tenant.test.ts`
- `npx vitest run lib/security/__tests__/get-no-side-effects.test.ts`
- `npx vitest run lib/portal/__tests__/registry-code.test.ts`
- `npx vitest run lib/content/__tests__/wp-sites-tenant.test.ts`

Green after the path swap: `npx vitest run lib/system-modes/__tests__/production-change-coverage.test.ts`

New `lib/content/video/__tests__/finalize.test.ts` (mock `job-store`, `render-client`, `video-pipeline`, `wp-sites`, `production-change-gate`, `supabase-server`, `global.fetch`; no network) — only these cases:
1. `finalizeVideoJob` on a `done` job returns `done` and never calls `pollRenderJob`.
2. Running job, poll `done` with a 16x9 output of the wrong size → `{status:"error", statusCode:502}` and `finishJob(..., {status:"error"})`, no `recordVideoAsset`.
3. Running job, poll `done` valid → `finishJob(..., {status:"done", recorded:true})` and `cleanupVideoInputKeys` called with `job.r2Keys`.
4. `embedVideoInPost(orgIdentity(ORG), …)` passes that same identity object to `resolveWpSite`, and the PATCH body has every `<!-- VIDEO_PLACEHOLDER -->` replaced by the URL (a URL containing `$&` stays literal).
5. Gate not allowed → `{ok:false, blockedMode}` and `fetch` is never called.

`npx tsc --noEmit` exit 0.

Mutation (the system-mode gate is a guard on writing to a customer's site): delete the `checkProductionChangeAllowed` call in `finalize.ts` → case 5 and `production-change-coverage.test.ts` go red → restore → green. Report both runs in your final message.

## Decision made (2026-10-25, after the first run)

One file put the embed route's import closure onto `video-pipeline` (video.image/motion/tts/script) and hid `resolveWpSite` from `lib/portal/__tests__/registry-code.test.ts:179-186`. So:
- `embedVideoInPost` lives in its own file `lib/content/video/embed-in-post.ts` (tests `lib/content/video/__tests__/embed-in-post.test.ts`, cases 4–5); `finalize.ts` keeps only `finalizeVideoJob` (cases 1–3). Everywhere above that says `finalize.ts` for the embed core / gate / coverage-list path means `embed-in-post.ts`.
- `registry-code.test.ts` `AUTHORIZERS` gains `"lib/content/video/embed-in-post.ts": ["embedVideoInPost"], // resolveWpSite before any read or write` — the same registration as `publish/wordpress-core.ts` `publishToWordPress` (`:167`). No `UNSCOPED_ROUTES` entry: the embed route must not reach a product feature.
