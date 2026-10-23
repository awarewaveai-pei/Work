# codex-oracle review -- 2026-10-23 12:55:11 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/reconcile, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/events/sync, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/events/sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/reconcile, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/events/sync-response.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/host-loopback-callers.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/delete-guard.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/reconcile.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/video/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/scripts/reconcile-videos.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sync-events-monthly.sh, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: (A) host-cron loopback calls were 404'd by product-doors middleware since 2026-10-20 (probe door allows only GET / and GET /api/ops/summary): move the two x-ops-sync-key cron endpoints (video reconcile, events sync) under matcher-excluded /api/internal and add a test that every 127.0.0.1:3002 path in host .sh scripts is matcher-excluded or not 404'd by the real middleware. (B) invariant: no video leaves R2 while any active wp_sites post/page (any status but trash) embeds its video/<dir>/ folder; could-not-scan = refuse; deleteVideoObjects only callable from delete-guard.ts (test enforces). Also verify: does this change depend on something NOT visible in this diff (config, cron, schema, upstream default)? If you cannot support a real finding, return no findings.

- exit: 0 | elapsed: 210948ms | answer: 1459B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/reconcile/route.ts, lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/events/sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/reconcile.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/video/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/scripts/reconcile-videos.sh, lobster-factory/infra/hetzner-phase1-core/scripts/sync-events-monthly.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/events/sync/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/events/sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/reconcile/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/delete-guard.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/events/sync-response.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/host-loopback-callers.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An existing production URL override can keep the monthly cron on the deleted route
  lobster-factory/infra/hetzner-phase1-core/scripts/sync-events-monthly.sh:14-20 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/host-loopback-callers.test.ts:22-25
  confidence  -> PLAUSIBLE
  scenario    -> `/root/lobster-phase1/.env` still sets `NEXT_ADMIN_EVENTS_SYNC_URL=http://127.0.0.1:3002/api/tools/events/sync` -> the cron preserves that value, receives the loopback 404, while the new test passes because it scans only literal script URLs and not sourced environment overrides.
  why missed  -> The `.env.example` default changed, but deployed `.env` values are external to this diff and remain authoritative.

FINDING 2: The deletion guard has a time-of-check/time-of-use race that violates the invariant
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts:81-92 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts:92
  confidence  -> CONFIRMED
  scenario    -> The WordPress scan finds no references -> a post/page embeds `video/<dir>/` before `deleteVideoObjects(objectKey)` runs -> R2 objects are deleted and the active page now contains a broken video.
  why missed  -> Tests model scanning and deletion sequentially; no lock, recheck, or coordinated write barrier covers concurrent WordPress publishing.

Final: TOTAL: 2 findings
