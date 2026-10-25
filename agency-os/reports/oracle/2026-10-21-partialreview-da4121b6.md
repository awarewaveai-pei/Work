# codex-oracle review -- 2026-10-21 16:06:24 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `e78966724`
- context: Design gallery pagination e78966724: keyset cursor (created_at,id), per-source grouping kept, filters server-side, facet counts as parallel COUNT(*) in DB, org scoping. Check: duplicates/gaps across pages incl. equal created_at, cursor injection into PostgREST filter strings, org scoping on every count, filter parity between list and counts, tz handling for today/week/month.
- exit: 0 | elapsed: 242670ms | answer: 2001B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/designs-list.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `mockup-composite` excludes Printful mockups.
  file:line   -> `lib/studio/designs-list.ts:97-100` -> `lib/studio/asset-group.ts:20-24`
  confidence  -> CONFIRMED
  scenario    -> An asset with `source = "printful-mockup"` appears in the Mockups group, but selecting `mockup-composite` or its facet count excludes it.
  why missed  -> Group classification uses the shared source list, while product filtering uses a separate literal mapping.

FINDING 2: Theme and brand facets silently omit valid values.
  file:line   -> `lib/studio/designs-list.ts:171-180`
  confidence  -> CONFIRMED
  scenario    -> With more than 2,000 matching rows or more than 50 distinct themes/brands, values outside the returned subset have no chip or count and cannot be selected through the gallery.
  why missed  -> The arbitrary limits are treated as performance protection without testing facet completeness.

FINDING 3: Calendar filters are wrong across DST boundaries.
  file:line   -> `DesignsGallery.tsx:323` -> `lib/studio/designs-list.ts:88-94`
  confidence  -> CONFIRMED
  scenario    -> In New York after the fall transition, the month cutoff for November is computed as `05:00Z` instead of `04:00Z`, excluding assets created during the first local hour of November.
  why missed  -> Only the viewer’s current numeric offset is sent; the offset at the requested calendar boundary may differ.

FINDING 4: Cursor validation accepts invalid timezone offsets and may turn malformed cursors into 500 responses.
  file:line   -> `lib/studio/designs-list.ts:68-84, 140-143` -> `app/api/tools/designs/route.ts:424-426`
  confidence  -> PLAUSIBLE
  scenario    -> A cursor containing `2026-01-01T00:00:00+99` passes `TS_RE`, reaches the PostgREST timestamp predicate, and may cause a database parse error returned as `list_failed` HTTP 500 instead of `invalid_cursor` HTTP 400.
  why missed  -> Validation checks string shape but not whether the timestamp is a valid PostgreSQL timestamp.

TOTAL: 4 findings
