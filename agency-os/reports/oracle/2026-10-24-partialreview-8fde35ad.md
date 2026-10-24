# codex-oracle review -- 2026-10-24 20:25:52 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/download/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/download/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/r2.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/download-href.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/publish/PublishWizard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Every My Designs download now goes through one same-origin proxy that every product door serves. The proxy moved from /api/tools/publish/download (publish is staff-only, so a door 404ed it) to /api/tools/designs/download, which is under PLATFORM_APIS (/api/tools/designs, served on every door). Its SSRF allowlist widened from the designs bucket to the designs bucket OR the video bucket (R2_VIDEO_PUBLIC_BASE), host-exact https, via isPublicBucketAsset in lib/storage/r2.ts. DesignsGallery single and bulk downloads of images and videos all fetch through bucketDownloadHref (before: single image used publish/download on staff and proxy-image on doors, video and bulk fetched the cross-origin bucket URL directly). PublishWizard uses the same helper. The route is listed in ORG_FREE_ROUTES (reads no database; both buckets are public). Also: a comment in doors.ts records that a built but closed door page renders on the staff host as a staff preview. Verify: can the proxy be made to fetch any host other than the two buckets (prefix tricks, userinfo, ports, empty R2_VIDEO_PUBLIC_BASE); does widening to the video bucket expose anything not already public; is any caller of the old path left; does a door customer gain anything beyond what the public bucket URL already gives.
- exit: 0 | elapsed: 283807ms | answer: 714B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/download/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/publish/PublishWizard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/r2.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/download/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/storage/download-href.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The proxy has no effective body timeout on the self-hosted deployment.

  `lobster-factory/.../app/api/tools/designs/download/route.ts:5,27,69` -> `route.ts:69`

  confidence  -> CONFIRMED

  scenario    -> R2 sends headers, then stalls the body; the 45-second abort is cleared after headers, and self-hosted Next does not enforce `maxDuration`, so the request hangs while retaining upstream/client resources.

  why missed  -> The code treats `maxDuration` as an execution limit, but Next documents that deployment platforms—not self-hosted Next itself—enforce it. [Next.js route segment config](https://nextjs.org/docs/15/app/api-reference/file-conventions/route-segment-config)

TOTAL: 1 findings
