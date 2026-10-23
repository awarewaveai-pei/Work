# codex-oracle review -- 2026-10-23 18:58:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: A: tarot background batch cards were unframed, never reached My Designs, and the ZIP was empty because the R2 public bucket sends no CORS header and the zip loop swallowed every fetch error. Fix: same-origin GET /api/tools/tarot/batch/[jobId]/image/[index] (only the job's recorded URL, only our designs bucket via isDesignsAsset, role + org checked); loadBatchResults frames each card like generateOne and saves the framed card to /api/tools/designs with batchJobId+cardIndex, which the designs POST dedupes per org; ZIP becomes two buttons (full PNG / WebP ~200-300KB via toWebpUnder) and names any card it could not pack. B: prompt fixes from schnell results: pipCount() puts 'exactly N <suit objects>' in the first sentence of Two..Ten; Devil keeps wings/horns and captives with any subject; Temperance keeps red wings; falcon hood no longer lands on the subject; 'facing straight ahead' -> 'facing the viewer'; Justice scales and Four of Wands canopy moved earlier. Also verify: does anything outside this diff rely on BatchItem.url being an R2 URL after loading, or on downloadZip() taking no argument? If you cannot support a real finding, return no findings; do not invent weak or speculative findings.
- exit: 0 | elapsed: 170584ms | answer: 1534B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/batch-dedupe.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/image/[index]/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/[jobId]/image/[index]/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The image proxy buffers unlimited response bodies before enforcing its 25 MB limit.
  file:line   -> `app/api/tools/tarot/batch/[jobId]/image/[index]/route.ts:57`
  confidence  -> CONFIRMED
  scenario    -> The R2 URL returns a 500 MB image; `arrayBuffer()` allocates it fully before the size check, potentially exhausting the Next.js process instead of returning `image_too_large`.
  why missed  -> The size guard appears present, but it runs after the dangerous allocation.

FINDING 2: Batch deduplication is a check-then-insert race.
  file:line   -> `app/api/tools/designs/route.ts:213` -> `app/api/tools/designs/route.ts:265`
  confidence  -> CONFIRMED
  scenario    -> Two simultaneous loads of the same job/card both observe no existing row, then both upload and insert; My Designs receives duplicates (or the second request fails if a database uniqueness constraint rejects it).
  why missed  -> The sequential test exercises reuse, but not concurrent requests or an atomic database constraint.

FINDING 3: Background-result loading reports success even when saving to My Designs fails.
  file:line   -> `TarotStudio.tsx:818` -> `TarotStudio.tsx:1065`
  confidence  -> CONFIRMED
  scenario    -> `/api/tools/designs` returns HTTP 500; `saveToGallery` discards the returned `false`, while the loader still reports `已套框並存進「我的設計」`.
  why missed  -> The existing fire-and-forget helper is reused, but this new workflow presents its completion message as confirmed persistence.

TOTAL: 3 findings
