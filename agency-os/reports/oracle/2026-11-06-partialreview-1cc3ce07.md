# codex-oracle review -- 2026-11-06 08:21:05 +08:00

- mode: `review`
- scope: whole repo
- target: `e4b3e6935`
- context: C7.1: entries (Studio/Tarot/Banner/Mockup/My Designs) hand designs to the right Craft pro editor via one table in canvas-handoff.ts (CANVAS_TARGETS); handoff carries editor id, the matching editor's frame takes it once and clears it (read-and-clear decided by lead), dock opens it after ctx.ready(). Old Fabric CanvasEditor (kept until C7.2) no longer takes handoffs by design. photo-pro-dock (card C4.2) is another worker's and lands in the same merge batch.
- exit: 0 | elapsed: 181565ms | answer: 1694B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(full)/tools/photo-pro/PhotoProFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(full)/tools/photo-pro/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/ModelMockupPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/design/canvas/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/canvas-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Printful mockup results have no direct edit action.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx:911
  confidence  -> CONFIRMED
  scenario    -> A user generates a Printful mockup in `printful` mode. Its result card offers selection and saving, but no action to hand that image to PhotoCraft; the new edit button exists only for the separate AI result at line 840.
  why missed  -> Mockup has separate result views, and the change covered the AI and model views.

FINDING 2: A failed dock load permanently consumes a pending design.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/ProEditorFrame.tsx:69
  confidence  -> CONFIRMED
  scenario    -> The editor entry file answers HEAD successfully, but `dock.js` fails to load. `takeCanvasHandoff` clears the design at `canvas-handoff.ts:210`; with no dock to open it, reloading the editor finds no pending design.
  why missed  -> The reachability check verifies the editor entry file, while the handoff depends on the separately loaded dock.

FINDING 3: A handoff open error is hidden from the user.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/dock.js:196
  confidence  -> CONFIRMED
  scenario    -> The design fetch fails or `ctx.openFile` rejects before the user opens a dock panel. The error is written to `.vp-status` inside the hidden flyout (`dock.js:56`; `dock.css:54`), so the editor stays empty without a visible explanation.
  why missed  -> The error handler calls `ctx.info`, but that status area is visible only while a panel is open.

TOTAL: 3 findings
