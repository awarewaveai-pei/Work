# codex-oracle review -- 2026-10-24 20:29:59 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/calendar/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/sites/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/events/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/calendar/ContentCalendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/SiteManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/MODULE_MANIFEST.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Step-8 content product door (ADR 018): app/content pages reuse the staff content tools inside ProductDoorShell, door.nav in products.ts; shared components hide staff links via useDoorHref (null on a door without that page) and hide staff-only newsletter, trending-source management, site add and URL change on a door (the server already refuses customers: staffOnly, siteUrlWriteGate). enabled:false, not live.
- exit: 0 | elapsed: 238971ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/calendar/ContentCalendar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/SiteManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/calendar/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/events/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/content/sites/page.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
