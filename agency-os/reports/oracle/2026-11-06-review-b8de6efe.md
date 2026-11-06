# codex-oracle review -- 2026-11-06 15:18:34 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3 (final diff). PhotoCraft adapter: barcode SVG grouping + <text> as type layers (alpha = fill alpha x fill-opacity x ancestor opacity; size clamped 0.1-1296pt; no-doc failure closes the half-built doc); selectedImage via layer quick export (multi-select falls back); temp docs named by content; fitLayer multi-select; placeImage opts.at. Rounds 1-2 findings fixed with tests.
- exit: 0 | elapsed: 143968ms | answer: 1238B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/vector-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/blocks/templates.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06-photo-pro.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The vector entry smoke test can pass when the editable original fails to open.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06-photo-pro.spec.ts:408
  confidence  -> CONFIRMED
  scenario    -> The `designs-vc` entry requests `src.vectorcraft`, but the route returns PNG bytes. A `.vectorcraft` original requires native JSON or gzip bytes (`apps/next-admin/lib/studio/design-source.ts:6`). The test records that the URL was fetched, then returns `null` for vector pages without checking an opened document (`06-photo-pro.spec.ts:418`, `:491-495`), so a failed import can pass.
  why missed  -> The fixture checks which URL was fetched; the vector path skips the document assertion used for PhotoCraft.

FINDING 2: The “no temporary document” smoke check can miss a temporary tab.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06-photo-pro.spec.ts:164
  confidence  -> CONFIRMED
  scenario    -> If `selectedImage` opens and closes a temporary document between two 40 ms samples, `maxDocs` stays at the original count and the assertion at line 295 passes.
  why missed  -> Periodic inspection was treated as a complete record of document openings.

TOTAL: 2 findings
