# codex-oracle review -- 2026-10-23 21:32:18 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/DoorContext.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Taking the tarot and studio product doors live (ADR 018). (1) lobster-nginx: the social door server block becomes the shared block for every next-admin door (server_name social tarot studio); its deny list no longer refuses /tarot-frames and /edge-masks/ (public static PNG folders, no data, already served without login on the app host; studio draws its edge previews from /edge-masks), still refuses intake, api/auth, api/webhooks, api/internal, vector-editor.html. The guard test now finds a door by its host in a server_name list and keeps the two static folders. (2) host nginx adds tarot/studio to both server_name lists. (3) DoorContext: ProductDoorShell marks pages as on a door; StudioWorkbench hides the My Designs links and the open-in-canvas buttons there (design staff pages, 404 on the door). products.ts enabled flags are flipped in the same commit (not in this review: one-line data change). Also verify: does any matcher-skipped path that is NOT a static asset now reach a door?
- exit: 0 | elapsed: 467163ms | answer: 748B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ProductDoorShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/__tests__/middleware-portal-guards.test.ts, lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/DoorContext.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The normal deployment path will ship the app code but leave both nginx changes unapplied.

  `agency-os/AGENTS.md:10-11` -> `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf:428-430`, `nginx/system-sites/sg-stack.aware-wave.com.conf:15-25`  
  confidence  -> CONFIRMED  
  scenario    -> Commit reaches the 03:00 `sg-deploy.sh` auto-deploy; it rsyncs only `apps/<APP>`, so live nginx still knows only `social.aware-wave.com`; `tarot.aware-wave.com` and `studio.aware-wave.com` hit the wrong/default vhost instead of their doors.  
  why missed  -> The diff updates both nginx source files, but the normal application deploy explicitly excludes nginx and requires a separate `safe-infra-patch.sh` operation.

TOTAL: 1 findings
