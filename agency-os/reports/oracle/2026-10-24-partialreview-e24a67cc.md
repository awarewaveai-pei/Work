# codex-oracle review -- 2026-10-24 15:25:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/OutputTrackBar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudioStaff.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupWithCatalog.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Design product door built (ADR 018 禮2; audit card step-8-doors-video-design-content.md 禮4.5 D1-D6), enabled stays false. (1) openInCanvas(image, name, href) now requires the target; every caller (OutputTrackBar, DesignsGallery, BannerStudio, TarotStudio, StudioWorkbench) passes useDoorHref("/tools/canvas") and hides the button when null. This also fixes the LIVE tarot door, whose quick-edit button sent customers to /tools/canvas (404 on a door). (2) design door.nav: designs (root), canvas, banner, mockup (vector editor off the door, decision D-V); door pages reuse the staff components without topbar; banner without the staff extras (AI copy and brand colours hidden, D-V2/D-V3); the gallery hides "?餃遣??" (publish is staff-only, D1). (3) The public Printful catalog becomes a design door API (/api/tools/printful/catalog only; printful/sync stays staff) and is listed org-free; MockupStudioStaff is renamed MockupWithCatalog and used by both the staff page and the door. Also verify: is any other caller of openInCanvas or any hard-coded /tools/ navigation left in components a door renders; can a customer on the design door reach printful/sync or another org data path?
- exit: 0 | elapsed: 308795ms | answer: 2002B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupWithCatalog.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/OutputTrackBar.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/banner/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/canvas/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/mockup/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/page.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `enabled: false` does not prevent the new `/design` route from being served on the staff host.
  file:line   -> `lib/portal/doors.ts:33` -> `middleware.ts:236` -> `app/design/layout.tsx:7`
  confidence  -> CONFIRMED
  scenario    -> Design remains disabled, but an authenticated staff user visits `app.aware-wave.com/design`; disabled products are omitted from `productPageOwner`, middleware does not 404, and the new Design door renders on the staff host.
  why missed  -> The host-registration filter was treated as a complete route guard, but the new file-based `/design` routes have no enabled check.

FINDING 2: My Designs download still calls a staff-only publish API that the design door rejects.
  file:line   -> `DesignsGallery.tsx:491` -> `lib/portal/products.ts:59` -> `lib/portal/doors.ts:99`
  confidence  -> CONFIRMED
  scenario    -> A customer clicks `⬇ 下載` on the design door; `/api/tools/publish/download` is not in the design door API set, middleware returns 404, and the handler opens the raw R2 URL with an alert instead of downloading the file.
  why missed  -> Only the “go to publish” action was hidden; the shared gallery’s download implementation still assumed the staff publish route.

FINDING 3: The design door exposes an unmetered Printful mockup endpoint with arbitrary product IDs.
  file:line   -> `lib/portal/products.ts:70` -> `lib/portal/doors.ts:77` -> `app/api/tools/studio/mockup/route.ts:22`
  confidence  -> CONFIRMED
  scenario    -> After enabling the door, a customer POSTs a valid image and `productId: 999` to `/api/tools/studio/mockup`; the dependency API prefix is allowed, the client resolves as `operator`, and lines `73`–`102` fetch the arbitrary product spec and create a Printful task using the shared store credentials.
  why missed  -> The UI submits only IDs from the fixed catalog, so page-level review misses that the API validates neither membership in that catalog nor an entitlement/feature grant.

TOTAL: 3 findings
