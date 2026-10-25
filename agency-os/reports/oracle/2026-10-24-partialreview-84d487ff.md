# codex-oracle review -- 2026-10-24 15:12:51 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/video/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/video/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoPipeline.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/ops-role-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/release/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/release/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/[id]/approve/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/[id]/approve/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/capabilities/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Video product door built (ADR 018 禮2; audit card step-8-doors-video-design-content.md 禮3.5 V1-V6), enabled stays false. V1 app/video/{layout,page}.tsx reuse the staff pipeline (?advanced=1 -> VideoTabs). V2 the advanced link becomes relative (?advanced=1) so it works on /tools/video and on the door. V6 (operator decision D3): new canApproveMedia(resolved) = staff owner/admin OR a customer (source client, role CLIENT_PRODUCT_ROLE); release and story-bible approve use it; both still assertOrgAccess on the item org, which binds a customer to its own org (tests + mutations). V5 cleanup moves to /api/internal/video/cleanup (matcher-skipped, refused by door nginx; still x-ops-sync-key). V4 capabilities is listed org-free (reports video-service capability booleans, no DB) and its error branch no longer returns the raw exception. qa/report and remotion-status (410 stubs, no callers anywhere) are deleted. Also verify: can a customer now approve something for another organization through any path; does any caller still use /api/video/cleanup, /api/video/remotion-status or /api/video/qa/report?
- exit: 0 | elapsed: 161350ms | answer: 795B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoPipeline.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/capabilities/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/release/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/release/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/[id]/approve/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/ops-role-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/story-bibles/[id]/approve/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/video/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/video/page.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Cleanup crashes on a valid JSON `null` body
  app/.../cleanup/route.ts:27 -> app/.../cleanup/route.ts:28
  confidence  -> CONFIRMED
  scenario    -> POST body is `null` -> `body.days` throws `TypeError`, returning 500 instead of applying the 30-day default
  why missed  -> Tests likely covered omitted fields or malformed JSON, not valid JSON `null`

FINDING 2: R2 deletion can leave a dangling database row
  app/.../cleanup/route.ts:49-57 -> app/.../cleanup/route.ts:54
  confidence  -> CONFIRMED
  scenario    -> R2 deletion succeeds, Supabase row deletion transiently fails -> gallery retains a row whose video object no longer exists
  why missed  -> Object deletion and database deletion were treated as sequential success steps without compensating recovery

TOTAL: 2 findings
